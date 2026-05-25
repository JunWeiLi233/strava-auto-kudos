(() => {
  "use strict";

  const ACTION_RUN_KUDOS = "STRAVA_AUTO_KUDOS_RUN";
  const ACTION_STOP_KUDOS = "STRAVA_AUTO_KUDOS_STOP";
  const ACTION_STATUS_KUDOS = "STRAVA_AUTO_KUDOS_STATUS";
  const SETTINGS_KEY = "stravaAutoKudosSettingsV2";
  const LAST_RUN_KEY = "stravaAutoKudosLastRun";
  const ACTIVE_RUN_TAB_KEY = "activeRunTabId";
  const ALARM_NAME = "stravaAutoKudosAlarm";
  const STRAVA_HOST = "www.strava.com";
  const STRAVA_URL_PATTERN = "https://www.strava.com/*";
  const STRAVA_DASHBOARD_URL = "https://www.strava.com/dashboard";
  const MISSING_RECEIVER_PATTERN = /Could not establish connection|Receiving end does not exist/i;

  function chromeError() {
    return chrome.runtime.lastError ? new Error(chrome.runtime.lastError.message) : null;
  }

  function isSupportedStravaUrl(url) {
    try {
      const parsed = new URL(url);
      return parsed.protocol === "https:" && parsed.hostname === STRAVA_HOST;
    } catch (_error) { return false; }
  }

  function queryTabs(queryInfo) {
    return new Promise((resolve, reject) => {
      chrome.tabs.query(queryInfo, (tabs) => {
        const error = chromeError();
        if (error) { reject(error); return; }
        resolve(tabs || []);
      });
    });
  }

  function getTab(tabId) {
    return new Promise((resolve) => {
      chrome.tabs.get(tabId, (tab) => {
        if (chrome.runtime.lastError) { resolve(null); return; }
        resolve(tab || null);
      });
    });
  }

  function createTab(url, active) {
    return new Promise((resolve, reject) => {
      chrome.tabs.create({ active: Boolean(active), url }, (tab) => {
        const error = chromeError();
        if (error) { reject(error); return; }
        resolve(tab);
      });
    });
  }

  function activateTab(tab) {
    return new Promise((resolve, reject) => {
      if (!tab || typeof tab.id !== "number") {
        reject(new Error("No Strava tab is available."));
        return;
      }
      chrome.tabs.update(tab.id, { active: true }, (updatedTab) => {
        const error = chromeError();
        if (error) { reject(error); return; }
        if (typeof tab.windowId === "number" && chrome.windows && chrome.windows.update) {
          chrome.windows.update(tab.windowId, { focused: true }, () => {
            chrome.runtime.lastError;
            resolve(updatedTab || tab);
          });
          return;
        }
        resolve(updatedTab || tab);
      });
    });
  }

  function setTabAutoDiscardable(tabId, autoDiscardable) {
    return new Promise((resolve) => {
      chrome.tabs.update(tabId, { autoDiscardable }, () => {
        chrome.runtime.lastError;
        resolve();
      });
    });
  }

  function waitForTabComplete(tabId) {
    return new Promise((resolve) => {
      const timeoutId = setTimeout(() => {
        chrome.tabs.onUpdated.removeListener(listener);
        resolve();
      }, 12000);

      function listener(updatedTabId, changeInfo) {
        if (updatedTabId !== tabId || changeInfo.status !== "complete") return;
        clearTimeout(timeoutId);
        chrome.tabs.onUpdated.removeListener(listener);
        resolve();
      }
      chrome.tabs.onUpdated.addListener(listener);
    });
  }

  function executeContentScript(tabId) {
    return new Promise((resolve, reject) => {
      chrome.scripting.executeScript({ target: { tabId }, files: ["content.js"] }, () => {
        const error = chromeError();
        if (error) { reject(error); return; }
        resolve();
      });
    });
  }

  function sendContentMessage(tabId, action, settings) {
    return new Promise((resolve, reject) => {
      chrome.tabs.sendMessage(tabId, {
        action,
        source: "strava-auto-kudos-background",
        requestedAt: Date.now(),
        settings: settings || null
      }, (response) => {
        const error = chromeError();
        if (error) { reject(error); return; }
        resolve(response);
      });
    });
  }

  async function sendContentMessageWithInjection(tabId, action, settings) {
    try {
      return await sendContentMessage(tabId, action, settings);
    } catch (error) {
      if (!MISSING_RECEIVER_PATTERN.test(error.message || "")) throw error;
      await executeContentScript(tabId);
      return sendContentMessage(tabId, action, settings);
    }
  }

  function chromeStorageGet(key) {
    return new Promise((resolve) => {
      chrome.storage.local.get(key, (items) => {
        resolve(items ? items[key] : null);
      });
    });
  }

  function chromeStorageSet(items) {
    return new Promise((resolve) => {
      chrome.storage.local.set(items, () => { resolve(); });
    });
  }

  function chromeStorageRemove(key) {
    return new Promise((resolve) => {
      chrome.storage.local.remove(key, () => { resolve(); });
    });
  }

  async function loadSettings() {
    const stored = await chromeStorageGet(SETTINGS_KEY);
    return stored || {};
  }

  async function getAutoMode() {
    const settings = await loadSettings();
    return Boolean(settings.autoMode);
  }

  async function saveLastRun(metrics) {
    await chromeStorageSet({
      [LAST_RUN_KEY]: {
        finishedAt: Date.now(),
        clicked: Number(metrics.clicked || 0),
        scanned: Number(metrics.scanned || 0),
        stopped: Boolean(metrics.stopped),
        endedAtRecentActivityBoundary: Boolean(metrics.endedAtRecentActivityBoundary),
        endedAtDateBoundary: Boolean(metrics.endedAtDateBoundary)
      }
    });
  }

  async function keepRunTabAvailable(tabId) {
    await setTabAutoDiscardable(tabId, false);
    await chromeStorageSet({ [ACTIVE_RUN_TAB_KEY]: tabId });
  }

  async function releaseRunTab(tabId) {
    if (typeof tabId === "number") await setTabAutoDiscardable(tabId, true);
    await chromeStorageRemove(ACTIVE_RUN_TAB_KEY);
  }

  async function storedRunTab() {
    const tabId = await chromeStorageGet(ACTIVE_RUN_TAB_KEY);
    if (typeof tabId !== "number") return null;
    const tab = await getTab(tabId);
    if (!tab || !isSupportedStravaUrl(tab.url)) {
      await chromeStorageRemove(ACTIVE_RUN_TAB_KEY);
      return null;
    }
    return tab;
  }

  async function activeTab() {
    const tabs = await queryTabs({ active: true, currentWindow: true });
    return tabs[0] || null;
  }

  async function firstStravaTab() {
    const tabs = await queryTabs({ url: STRAVA_URL_PATTERN });
    return tabs[0] || null;
  }

  async function ensureStravaTabForRun() {
    const current = await activeTab();
    if (current && isSupportedStravaUrl(current.url)) return current;

    const existing = await firstStravaTab();
    if (existing) return activateTab(existing);

    const created = await createTab(STRAVA_DASHBOARD_URL, true);
    if (created && typeof created.id === "number") await waitForTabComplete(created.id);
    return created;
  }

  async function resolveControlTab() {
    const stored = await storedRunTab();
    if (stored) return stored;

    const current = await activeTab();
    if (current && isSupportedStravaUrl(current.url)) return current;

    return firstStravaTab();
  }

  function isLoggedOutResponse(response) {
    const login = response && (response.login || (response.state && response.state.login));
    return login && login.loggedIn === false;
  }

  function idleStatus(message) {
    return {
      ok: true,
      message: message || "No Strava kudos sequence is running.",
      state: { running: false, cancelRequested: false, login: null, metrics: null }
    };
  }

  async function handleStatus() {
    const tab = await resolveControlTab();
    if (!tab || typeof tab.id !== "number") return idleStatus("Open Strava to run kudos.");

    const response = await sendContentMessageWithInjection(tab.id, ACTION_STATUS_KUDOS);
    if (response && response.state && response.state.running) {
      await keepRunTabAvailable(tab.id);
    } else {
      await releaseRunTab(tab.id);
    }
    return { ...(response || idleStatus()), tabId: tab.id };
  }

  async function handleRun(settings) {
    const tab = await ensureStravaTabForRun();
    if (!tab || typeof tab.id !== "number") throw new Error("Unable to open Strava.");

    const status = await sendContentMessageWithInjection(tab.id, ACTION_STATUS_KUDOS);
    if (isLoggedOutResponse(status)) {
      return {
        ok: false,
        message: "Please log in to Strava before using this extension.",
        login: status.state.login,
        state: status.state,
        tabId: tab.id
      };
    }

    const response = await sendContentMessageWithInjection(tab.id, ACTION_RUN_KUDOS, settings);
    if (response && (response.started || (response.state && response.state.running))) {
      await keepRunTabAvailable(tab.id);
    }
    return { ...(response || {}), tabId: tab.id };
  }

  async function handleStop() {
    const tab = await resolveControlTab();
    if (!tab || typeof tab.id !== "number") {
      await releaseRunTab(null);
      return idleStatus();
    }
    const response = await sendContentMessageWithInjection(tab.id, ACTION_STOP_KUDOS);
    return { ...(response || idleStatus()), tabId: tab.id };
  }

  async function scheduleNextAlarm() {
    const settings = await loadSettings();
    if (!settings.autoMode) return;

    const intervalMinutes = Number(settings.scheduleIntervalMinutes) || 30;
    chrome.alarms.create(ALARM_NAME, { periodInMinutes: intervalMinutes });
  }

  async function clearSchedule() {
    const exists = await new Promise((resolve) => {
      chrome.alarms.get(ALARM_NAME, (alarm) => resolve(Boolean(alarm)));
    });
    if (exists) {
      chrome.alarms.clear(ALARM_NAME);
    }
  }

  async function handleAlarm(alarm) {
    if (alarm.name !== ALARM_NAME) return;

    const autoMode = await getAutoMode();
    if (!autoMode) return;

    const settings = await loadSettings();

    const statusTab = await resolveControlTab();
    if (statusTab) {
      try {
        const status = await sendContentMessageWithInjection(statusTab.id, ACTION_STATUS_KUDOS);
        if (status && status.state && status.state.running) return;
      } catch (_error) {}
    }

    try {
      await handleRun({
        betweenTargets: {
          min: Math.round((settings.minDelaySeconds || 1.7) * 1000),
          max: Math.round((settings.maxDelaySeconds || 4.6) * 1000)
        },
        dateRange: {
          mode: settings.dateRangeMode || "any",
          value: settings.dateRangeValue || 7,
          unit: settings.dateRangeUnit || "days"
        },
        relationshipFilter: {
          mode: settings.relationshipFilterMode || "connected"
        }
      });
    } catch (_error) {}
  }

  async function handleAutoModeOn(settings) {
    const s = settings || await loadSettings();
    await chromeStorageSet({ [SETTINGS_KEY]: s });
    await scheduleNextAlarm();

    const tab = await firstStravaTab();
    if (tab) {
      try {
        const status = await sendContentMessageWithInjection(tab.id, ACTION_STATUS_KUDOS);
        if (!status || !(status.state && status.state.running)) {
          const runSettings = {
            betweenTargets: { min: Math.round((s.minDelaySeconds || 1.7) * 1000), max: Math.round((s.maxDelaySeconds || 4.6) * 1000) },
            dateRange: { mode: s.dateRangeMode || "any", value: s.dateRangeValue || 7, unit: s.dateRangeUnit || "days" },
            relationshipFilter: { mode: s.relationshipFilterMode || "connected" }
          };
          await sendContentMessageWithInjection(tab.id, ACTION_RUN_KUDOS, runSettings);
        }
      } catch (_error) {}
    } else {
      await handleRun({
        betweenTargets: { min: Math.round((s.minDelaySeconds || 1.7) * 1000), max: Math.round((s.maxDelaySeconds || 4.6) * 1000) },
        dateRange: { mode: s.dateRangeMode || "any", value: s.dateRangeValue || 7, unit: s.dateRangeUnit || "days" },
        relationshipFilter: { mode: s.relationshipFilterMode || "connected" }
      });
    }
  }

  async function handleAutoModeOff() {
    await clearSchedule();
  }

  async function handleSettingsChanged(settings) {
    await chromeStorageSet({ [SETTINGS_KEY]: settings });
    if (settings.autoMode) {
      await scheduleNextAlarm();
    } else {
      await clearSchedule();
    }
  }

  async function handleRunComplete(metrics) {
    await saveLastRun(metrics);
    await releaseRunTab(null);

    const autoMode = await getAutoMode();
    if (autoMode) {
      await scheduleNextAlarm();
    }
  }

  chrome.alarms.onAlarm.addListener((alarm) => {
    handleAlarm(alarm).catch(() => {});
  });

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (!message || !message.action) return false;

    if (message.action === ACTION_STATUS_KUDOS) {
      handleStatus().then(sendResponse).catch((error) => sendResponse({ ok: false, message: error.message, state: null }));
      return true;
    }

    if (message.action === ACTION_RUN_KUDOS) {
      handleRun(message.settings).then(sendResponse).catch((error) => sendResponse({ ok: false, message: error.message, state: null }));
      return true;
    }

    if (message.action === ACTION_STOP_KUDOS) {
      handleStop().then(sendResponse).catch((error) => sendResponse({ ok: false, message: error.message, state: null }));
      return true;
    }

    if (message.action === "STRAVA_AUTO_KUDOS_AUTO_MODE_ON") {
      handleAutoModeOn(message.settings).catch(() => {});
      return false;
    }

    if (message.action === "STRAVA_AUTO_KUDOS_AUTO_MODE_OFF") {
      handleAutoModeOff().catch(() => {});
      return false;
    }

    if (message.action === "STRAVA_AUTO_KUDOS_SETTINGS_CHANGED") {
      handleSettingsChanged(message.settings).catch(() => {});
      return false;
    }

    if (message.action === "STRAVA_AUTO_KUDOS_RUN_COMPLETE") {
      handleRunComplete(message.metrics).catch(() => {});
      return false;
    }

    return false;
  });

  // Initialize: restore auto-mode scheduling on service worker start
  (async function init() {
    const settings = await loadSettings();
    if (settings.autoMode) {
      await scheduleNextAlarm();
    }
  })().catch(() => {});
})();
