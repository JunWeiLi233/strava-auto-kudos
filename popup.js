(() => {
  "use strict";

  const ACTION_RUN_KUDOS = "STRAVA_AUTO_KUDOS_RUN";
  const STRAVA_HOST = "www.strava.com";

  const runButton = document.getElementById("runButton");
  const statusText = document.getElementById("status");
  const statusDot = document.getElementById("statusDot");

  function setStatus(message, state) {
    statusText.textContent = message;
    statusDot.dataset.state = state;
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

  function sendRunMessage(tabId) {
    const payload = {
      action: ACTION_RUN_KUDOS,
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

  function formatResult(response) {
    if (!response || !response.ok) {
      return "No kudos run confirmation received.";
    }

    const metrics = response.metrics || {};
    const clicked = Number(metrics.clicked || 0);
    const scanned = Number(metrics.scanned || 0);
    const skipped = Number(metrics.skippedAlreadyClicked || 0) + Number(metrics.skippedDisabled || 0) + Number(metrics.skippedMissing || 0);

    return `Clicked ${clicked} of ${scanned} button${scanned === 1 ? "" : "s"}; skipped ${skipped}.`;
  }

  async function run() {
    runButton.disabled = true;
    setStatus("Checking active tab...", "busy");

    try {
      const tab = await queryActiveTab();
      if (!tab || typeof tab.id !== "number") {
        setStatus("No active tab found.", "error");
        return;
      }

      if (!isSupportedStravaUrl(tab.url)) {
        setStatus("Open https://www.strava.com/ first.", "error");
        return;
      }

      setStatus("Running kudos sequence...", "busy");
      const response = await sendRunMessage(tab.id);
      setStatus(formatResult(response), response && response.ok ? "ready" : "error");
    } catch (error) {
      setStatus(error.message || "Unable to run kudos sequence.", "error");
    } finally {
      runButton.disabled = false;
    }
  }

  runButton.addEventListener("click", run);
})();
