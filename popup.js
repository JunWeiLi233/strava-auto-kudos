(() => {
  "use strict";

  const ACTION_RUN_KUDOS = "STRAVA_AUTO_KUDOS_RUN";
  const ACTION_STOP_KUDOS = "STRAVA_AUTO_KUDOS_STOP";
  const ACTION_STATUS_KUDOS = "STRAVA_AUTO_KUDOS_STATUS";
  const STRAVA_HOST = "www.strava.com";
  const STRAVA_DASHBOARD_URL = "https://www.strava.com/dashboard";
  const MISSING_RECEIVER_PATTERN = /Could not establish connection|Receiving end does not exist/i;
  const SETTINGS_STORAGE_KEY = "stravaAutoKudosSettings";
  const DEFAULT_DELAY_RANGE_SECONDS = Object.freeze({
    min: 1.7,
    max: 4.6
  });
  const DEFAULT_DATE_RANGE = Object.freeze({
    mode: "any",
    value: 7,
    unit: "days"
  });
  const DELAY_LIMIT_SECONDS = Object.freeze({
    min: 0.8,
    max: 120
  });
  const DATE_RANGE_UNITS = Object.freeze(["days", "months", "years"]);
  const DATE_RANGE_LIMITS = Object.freeze({
    days: 3650,
    months: 120,
    years: 10
  });

  const runButton = document.getElementById("runButton");
  const stopButton = document.getElementById("stopButton");
  const minDelayInput = document.getElementById("minDelayInput");
  const maxDelayInput = document.getElementById("maxDelayInput");
  const dateRangeMode = document.getElementById("dateRangeMode");
  const dateRangeValue = document.getElementById("dateRangeValue");
  const dateRangeUnit = document.getElementById("dateRangeUnit");
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

  function parseSeconds(value) {
    const parsed = Number.parseFloat(value);
    return Number.isFinite(parsed) ? parsed : null;
  }

  function parsePositiveInteger(value) {
    const text = String(value || "").trim();
    if (!/^\d+$/.test(text)) {
      return null;
    }

    const parsed = Number.parseInt(text, 10);
    return Number.isSafeInteger(parsed) && parsed >= 1 ? parsed : null;
  }

  function loadStoredSettings() {
    try {
      const raw = window.localStorage.getItem(SETTINGS_STORAGE_KEY);
      if (!raw) {
        return {};
      }

      const parsed = JSON.parse(raw);
      return parsed && typeof parsed === "object" ? parsed : {};
    } catch (_error) {
      return {};
    }
  }

  function saveStoredSettings(settings) {
    window.localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify({
      ...loadStoredSettings(),
      ...settings
    }));
  }

  function loadDelaySettings() {
    try {
      const parsed = loadStoredSettings();
      const min = parseSeconds(parsed.minDelaySeconds);
      const max = parseSeconds(parsed.maxDelaySeconds);
      if (min === null || max === null) {
        return { ...DEFAULT_DELAY_RANGE_SECONDS };
      }

      return { min, max };
    } catch (_error) {
      return { ...DEFAULT_DELAY_RANGE_SECONDS };
    }
  }

  function saveDelaySettings(range) {
    saveStoredSettings({
      minDelaySeconds: range.min,
      maxDelaySeconds: range.max
    });
  }

  function applyDelaySettingsToInputs() {
    const range = loadDelaySettings();
    minDelayInput.value = String(range.min);
    maxDelayInput.value = String(range.max);
  }

  function loadDateRangeSettings() {
    const stored = loadStoredSettings();
    const mode = stored.dateRangeMode === "last" ? "last" : DEFAULT_DATE_RANGE.mode;
    const unit = DATE_RANGE_UNITS.includes(stored.dateRangeUnit) ? stored.dateRangeUnit : DEFAULT_DATE_RANGE.unit;
    const value = parsePositiveInteger(stored.dateRangeValue) || DEFAULT_DATE_RANGE.value;

    return {
      mode,
      value: Math.min(value, DATE_RANGE_LIMITS[unit]),
      unit
    };
  }

  function saveDateRangeSettings(range) {
    saveStoredSettings({
      dateRangeMode: range.mode,
      dateRangeValue: range.value,
      dateRangeUnit: range.unit
    });
  }

  function setDateRangeControlsEnabled() {
    const isActive = dateRangeMode.value === "last";
    dateRangeValue.disabled = !isActive;
    dateRangeUnit.disabled = !isActive;
  }

  function applyDateRangeSettingsToInputs() {
    const range = loadDateRangeSettings();
    dateRangeMode.value = range.mode;
    dateRangeValue.value = String(range.value);
    dateRangeUnit.value = range.unit;
    setDateRangeControlsEnabled();
  }

  function readDelaySettings() {
    const min = parseSeconds(minDelayInput.value);
    const max = parseSeconds(maxDelayInput.value);

    if (min === null || max === null) {
      throw new Error("Enter a valid kudos delay range.");
    }

    if (min < DELAY_LIMIT_SECONDS.min || max < DELAY_LIMIT_SECONDS.min) {
      throw new Error(`Delay must be at least ${DELAY_LIMIT_SECONDS.min} seconds.`);
    }

    if (min > DELAY_LIMIT_SECONDS.max || max > DELAY_LIMIT_SECONDS.max) {
      throw new Error(`Delay must be ${DELAY_LIMIT_SECONDS.max} seconds or less.`);
    }

    if (min > max) {
      throw new Error("Min delay must be less than or equal to max delay.");
    }

    const normalized = {
      min: Math.round(min * 10) / 10,
      max: Math.round(max * 10) / 10
    };
    saveDelaySettings(normalized);
    return normalized;
  }

  function readDateRangeSettings() {
    const mode = dateRangeMode.value === "last" ? "last" : "any";
    const unit = DATE_RANGE_UNITS.includes(dateRangeUnit.value) ? dateRangeUnit.value : null;
    const fallbackValue = parsePositiveInteger(dateRangeValue.value) || DEFAULT_DATE_RANGE.value;

    if (!unit) {
      throw new Error("Choose days, months, or years for the date filter.");
    }

    if (mode === "any") {
      const saved = {
        mode,
        value: Math.min(fallbackValue, DATE_RANGE_LIMITS[unit]),
        unit
      };
      saveDateRangeSettings(saved);
      return { mode };
    }

    const value = parsePositiveInteger(dateRangeValue.value);
    if (value === null) {
      throw new Error("Enter a whole number for the date range.");
    }

    if (value > DATE_RANGE_LIMITS[unit]) {
      throw new Error(`Date range must be ${DATE_RANGE_LIMITS[unit]} ${unit} or less.`);
    }

    const normalized = { mode, value, unit };
    saveDateRangeSettings(normalized);
    return normalized;
  }

  function buildRunSettings() {
    const range = readDelaySettings();
    return {
      betweenTargets: {
        min: Math.round(range.min * 1000),
        max: Math.round(range.max * 1000)
      },
      dateRange: readDateRangeSettings()
    };
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

  function createTab(url) {
    return new Promise((resolve, reject) => {
      chrome.tabs.create({ active: true, url }, (tab) => {
        const error = chrome.runtime.lastError;
        if (error) {
          reject(new Error(error.message));
          return;
        }

        resolve(tab);
      });
    });
  }

  function updateTab(tabId, url) {
    return new Promise((resolve, reject) => {
      chrome.tabs.update(tabId, { active: true, url }, (tab) => {
        const error = chrome.runtime.lastError;
        if (error) {
          reject(new Error(error.message));
          return;
        }

        resolve(tab);
      });
    });
  }

  function waitForTabComplete(tabId) {
    return new Promise((resolve) => {
      const timeoutId = window.setTimeout(() => {
        chrome.tabs.onUpdated.removeListener(listener);
        resolve();
      }, 12000);

      function listener(updatedTabId, changeInfo) {
        if (updatedTabId !== tabId || changeInfo.status !== "complete") {
          return;
        }

        window.clearTimeout(timeoutId);
        chrome.tabs.onUpdated.removeListener(listener);
        resolve();
      }

      chrome.tabs.onUpdated.addListener(listener);
    });
  }

  function executeContentScript(tabId) {
    return new Promise((resolve, reject) => {
      chrome.scripting.executeScript({
        target: { tabId },
        files: ["content.js"]
      }, () => {
        const error = chrome.runtime.lastError;
        if (error) {
          reject(new Error(error.message));
          return;
        }

        resolve();
      });
    });
  }

  function sendActionMessage(tabId, action, settings) {
    const payload = {
      action,
      source: "strava-auto-kudos-popup",
      requestedAt: Date.now(),
      settings: settings || null
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

  async function ensureStravaTab() {
    const tab = await queryActiveTab();
    if (!tab || typeof tab.id !== "number") {
      setStatus("Opening Strava...", "busy");
      const createdTab = await createTab(STRAVA_DASHBOARD_URL);
      await waitForTabComplete(createdTab.id);
      return createdTab;
    }

    if (!isSupportedStravaUrl(tab.url)) {
      setStatus("Opening Strava...", "busy");
      const updatedTab = await updateTab(tab.id, STRAVA_DASHBOARD_URL);
      await waitForTabComplete(tab.id);
      return updatedTab || { id: tab.id, url: STRAVA_DASHBOARD_URL };
    }

    return tab;
  }

  async function sendActionWithInjectedContent(tabId, action, settings) {
    try {
      return await sendActionMessage(tabId, action, settings);
    } catch (error) {
      if (!MISSING_RECEIVER_PATTERN.test(error.message || "")) {
        throw error;
      }

      await executeContentScript(tabId);
      return sendActionMessage(tabId, action, settings);
    }
  }

  function isLoggedOutResponse(response) {
    const login = response && (response.login || (response.state && response.state.login));
    return login && login.loggedIn === false;
  }

  function formatResult(response) {
    if (!response || !response.ok) {
      return "No kudos run confirmation received.";
    }

    const metrics = response.metrics || {};
    const clicked = Number(metrics.clicked || 0);
    const scanned = Number(metrics.scanned || 0);
    const skipped = Number(metrics.skippedAlreadyClicked || 0) +
      Number(metrics.skippedDisabled || 0) +
      Number(metrics.skippedMissing || 0) +
      Number(metrics.skippedOutOfDate || 0) +
      Number(metrics.skippedUnknownDate || 0);

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
      const tab = await queryActiveTab();
      if (!tab || typeof tab.id !== "number" || !isSupportedStravaUrl(tab.url)) {
        setRunningControls(false, false);
        return;
      }

      const response = await sendActionWithInjectedContent(tab.id, ACTION_STATUS_KUDOS);
      applyStatusResponse(response);
    } catch (_error) {
      setRunningControls(false, false);
    }
  }

  async function run() {
    setRunningControls(true, false);
    setStatus("Checking active tab...", "busy");

    try {
      const runSettings = buildRunSettings();
      const tab = await ensureStravaTab();
      setStatus("Checking Strava login...", "busy");
      const statusResponse = await sendActionWithInjectedContent(tab.id, ACTION_STATUS_KUDOS);
      if (isLoggedOutResponse(statusResponse)) {
        setStatus("Please log in to Strava, then run this extension again.", "error");
        return;
      }

      setStatus("Running kudos sequence...", "busy");
      const response = await sendActionWithInjectedContent(tab.id, ACTION_RUN_KUDOS, runSettings);
      if (isLoggedOutResponse(response)) {
        setStatus("Please log in to Strava, then run this extension again.", "error");
        return;
      }
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
      const tab = await ensureStravaTab();
      const response = await sendActionWithInjectedContent(tab.id, ACTION_STOP_KUDOS);
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
  minDelayInput.addEventListener("change", () => {
    try {
      readDelaySettings();
      setStatus("Delay range saved.", "ready");
    } catch (error) {
      setStatus(error.message || "Invalid delay range.", "error");
    }
  });
  maxDelayInput.addEventListener("change", () => {
    try {
      readDelaySettings();
      setStatus("Delay range saved.", "ready");
    } catch (error) {
      setStatus(error.message || "Invalid delay range.", "error");
    }
  });
  dateRangeMode.addEventListener("change", () => {
    try {
      setDateRangeControlsEnabled();
      readDateRangeSettings();
      setStatus("Date filter saved.", "ready");
    } catch (error) {
      setStatus(error.message || "Invalid date filter.", "error");
    }
  });
  dateRangeValue.addEventListener("change", () => {
    try {
      readDateRangeSettings();
      setStatus("Date filter saved.", "ready");
    } catch (error) {
      setStatus(error.message || "Invalid date filter.", "error");
    }
  });
  dateRangeUnit.addEventListener("change", () => {
    try {
      readDateRangeSettings();
      setStatus("Date filter saved.", "ready");
    } catch (error) {
      setStatus(error.message || "Invalid date filter.", "error");
    }
  });
  applyDelaySettingsToInputs();
  applyDateRangeSettingsToInputs();
  refreshStatus();
})();
