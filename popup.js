(() => {
  "use strict";

  const ACTION_RUN_KUDOS = "STRAVA_AUTO_KUDOS_RUN";
  const ACTION_STOP_KUDOS = "STRAVA_AUTO_KUDOS_STOP";
  const ACTION_STATUS_KUDOS = "STRAVA_AUTO_KUDOS_STATUS";
  const STRAVA_HOST = "www.strava.com";

  const runButton = document.getElementById("runButton");
  const stopButton = document.getElementById("stopButton");
  const statusText = document.getElementById("status");
  const statusDot = document.getElementById("statusDot");

  function setStatus(message, state) {
    statusText.textContent = message;
    statusDot.dataset.state = state;
  }

  function setRunningControls(isRunning, stopPending) {
    runButton.disabled = isRunning;
    stopButton.disabled = !isRunning || Boolean(stopPending);
  }

  function isSupportedStravaUrl(url) {
    try {
      const parsed = new URL(url);
      return parsed.protocol === "https:" && parsed.hostname === STRAVA_HOST;
    } catch (_error) {
      return false;
    }
  }

  function queryActiveTab() {
    return new Promise((resolve, reject) => {
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        const error = chrome.runtime.lastError;
        if (error) {
          reject(new Error(error.message));
          return;
        }

        resolve(tabs[0] || null);
      });
    });
  }

  function sendActionMessage(tabId, action) {
    const payload = {
      action,
      source: "strava-auto-kudos-popup",
      requestedAt: Date.now()
    };

    return new Promise((resolve, reject) => {
      chrome.tabs.sendMessage(tabId, payload, (response) => {
        const error = chrome.runtime.lastError;
        if (error) {
          reject(new Error(error.message));
          return;
        }

        resolve(response);
      });
    });
  }

  async function getActiveStravaTab() {
    const tab = await queryActiveTab();
    if (!tab || typeof tab.id !== "number") {
      throw new Error("No active tab found.");
    }

    if (!isSupportedStravaUrl(tab.url)) {
      throw new Error("Open https://www.strava.com/ first.");
    }

    return tab;
  }

  function formatResult(response) {
    if (!response || !response.ok) {
      return "No kudos run confirmation received.";
    }

    const metrics = response.metrics || {};
    const clicked = Number(metrics.clicked || 0);
    const scanned = Number(metrics.scanned || 0);
    const skipped = Number(metrics.skippedAlreadyClicked || 0) + Number(metrics.skippedDisabled || 0) + Number(metrics.skippedMissing || 0);

    if (metrics.stopped) {
      return `Stopped after ${clicked} click${clicked === 1 ? "" : "s"}; scanned ${scanned}, skipped ${skipped}.`;
    }

    return `Clicked ${clicked} of ${scanned} button${scanned === 1 ? "" : "s"}; skipped ${skipped}.`;
  }

  function applyStatusResponse(response) {
    const state = response && response.state ? response.state : {};
    setRunningControls(Boolean(state.running), Boolean(state.cancelRequested));

    if (state.running && state.cancelRequested) {
      setStatus("Stopping after the current movement...", "busy");
      return;
    }

    if (state.running) {
      setStatus("Kudos sequence is running...", "busy");
    }
  }

  async function refreshStatus() {
    try {
      const tab = await getActiveStravaTab();
      const response = await sendActionMessage(tab.id, ACTION_STATUS_KUDOS);
      applyStatusResponse(response);
    } catch (_error) {
      setRunningControls(false, false);
    }
  }

  async function run() {
    setRunningControls(true, false);
    setStatus("Checking active tab...", "busy");

    try {
      const tab = await getActiveStravaTab();
      setStatus("Running kudos sequence...", "busy");
      const response = await sendActionMessage(tab.id, ACTION_RUN_KUDOS);
      setStatus(formatResult(response), response && response.ok ? "ready" : "error");
    } catch (error) {
      setStatus(error.message || "Unable to run kudos sequence.", "error");
    } finally {
      setRunningControls(false, false);
    }
  }

  async function stop() {
    setRunningControls(true, true);
    setStatus("Sending stop request...", "busy");

    try {
      const tab = await getActiveStravaTab();
      const response = await sendActionMessage(tab.id, ACTION_STOP_KUDOS);
      if (response && response.ok) {
        setStatus(response.message || "Stop requested.", "busy");
      } else {
        setStatus("No running kudos sequence found.", "ready");
        setRunningControls(false, false);
      }
    } catch (error) {
      setStatus(error.message || "Unable to stop kudos sequence.", "error");
      setRunningControls(false, false);
    }
  }

  runButton.addEventListener("click", run);
  stopButton.addEventListener("click", stop);
  refreshStatus();
})();
