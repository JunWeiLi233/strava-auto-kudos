(() => {
  "use strict";

  const ACTION_RUN_KUDOS = "STRAVA_AUTO_KUDOS_RUN";
  const ACTION_STOP_KUDOS = "STRAVA_AUTO_KUDOS_STOP";
  const ACTION_STATUS_KUDOS = "STRAVA_AUTO_KUDOS_STATUS";
  const STRAVA_HOST = "www.strava.com";
  const STRAVA_URL_PATTERN = "https://www.strava.com/*";
  const STRAVA_DASHBOARD_URL = "https://www.strava.com/dashboard";
  const MISSING_RECEIVER_PATTERN = /Could not establish connection|Receiving end does not exist/i;
  const ACTIVE_RUN_TAB_KEY = "activeRunTabId";

  function chromeError() {
    return chrome.runtime.lastError ? new Error(chrome.runtime.lastError.message) : null;
  }

  function isSupportedStravaUrl(url) {
    try {
      const parsed = new URL(url);
      return parsed.protocol === "https:" && parsed.hostname === STRAVA_HOST;
    } catch (_error) {
      return false;
    }
  }

  function queryTabs(queryInfo) {
    return new Promise((resolve, reject) => {
      chrome.tabs.query(queryInfo, (tabs) => {
        const error = chromeError();
        if (error) {
          reject(error);
          return;
        }

        resolve(tabs || []);
      });
    });
  }

  function getTab(tabId) {
    return new Promise((resolve) => {
      chrome.tabs.get(tabId, (tab) => {
        if (chrome.runtime.lastError) {
          resolve(null);
          return;
        }

        resolve(tab || null);
      });
    });
  }

  function createTab(url) {
    return new Promise((resolve, reject) => {
      chrome.tabs.create({ active: true, url }, (tab) => {
        const error = chromeError();
        if (error) {
          reject(error);
          return;
        }

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
        if (error) {
          reject(error);
          return;
        }

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

  function waitForTabComplete(tabId) {
    return new Promise((resolve) => {
      const timeoutId = setTimeout(() => {
        chrome.tabs.onUpdated.removeListener(listener);
        resolve();
      }, 12000);

      function listener(updatedTabId, changeInfo) {
        if (updatedTabId !== tabId || changeInfo.status !== "complete") {
          return;
        }

        clearTimeout(timeoutId);
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
        const error = chromeError();
        if (error) {
          reject(error);
          return;
        }

        resolve();
      });
    });
  }

  function sendContentMessage(tabId, action, settings) {
    const payload = {
      action,
      source: "strava-auto-kudos-background",
      requestedAt: Date.now(),
      settings: settings || null
    };

    return new Promise((resolve, reject) => {
      chrome.tabs.sendMessage(tabId, payload, (response) => {
        const error = chromeError();
        if (error) {
          reject(error);
          return;
        }

        resolve(response);
      });
    });
  }

  async function sendContentMessageWithInjection(tabId, action, settings) {
    try {
      return await sendContentMessage(tabId, action, settings);
    } catch (error) {
      if (!MISSING_RECEIVER_PATTERN.test(error.message || "")) {
        throw error;
      }

      await executeContentScript(tabId);
      return sendContentMessage(tabId, action, settings);
    }
  }

  function storageGet(key) {
    return new Promise((resolve) => {
      chrome.storage.session.get(key, (items) => {
        if (chrome.runtime.lastError) {
          resolve(null);
          return;
        }

        resolve(items ? items[key] : null);
      });
    });
  }

  function storageSet(key, value) {
    return new Promise((resolve) => {
      chrome.storage.session.set({ [key]: value }, () => {
        resolve();
      });
    });
  }

  function storageRemove(key) {
    return new Promise((resolve) => {
      chrome.storage.session.remove(key, () => {
        resolve();
      });
    });
  }

  async function storedRunTab() {
    const tabId = await storageGet(ACTIVE_RUN_TAB_KEY);
    if (typeof tabId !== "number") {
      return null;
    }

    const tab = await getTab(tabId);
    if (!tab || !isSupportedStravaUrl(tab.url)) {
      await storageRemove(ACTIVE_RUN_TAB_KEY);
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
    if (current && isSupportedStravaUrl(current.url)) {
      return current;
    }

    const existing = await firstStravaTab();
    if (existing) {
      return activateTab(existing);
    }

    const created = await createTab(STRAVA_DASHBOARD_URL);
    if (created && typeof created.id === "number") {
      await waitForTabComplete(created.id);
    }
    return created;
  }

  async function resolveControlTab() {
    const stored = await storedRunTab();
    if (stored) {
      return stored;
    }

    const current = await activeTab();
    if (current && isSupportedStravaUrl(current.url)) {
      return current;
    }

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
      state: {
        running: false,
        cancelRequested: false,
        login: null,
        metrics: null
      }
    };
  }

  async function handleStatus() {
    const tab = await resolveControlTab();
    if (!tab || typeof tab.id !== "number") {
      return idleStatus("Open Strava to run kudos.");
    }

    const response = await sendContentMessageWithInjection(tab.id, ACTION_STATUS_KUDOS);
    if (response && response.state && response.state.running) {
      await storageSet(ACTIVE_RUN_TAB_KEY, tab.id);
    } else {
      await storageRemove(ACTIVE_RUN_TAB_KEY);
    }

    return {
      ...(response || idleStatus()),
      tabId: tab.id
    };
  }

  async function handleRun(settings) {
    const tab = await ensureStravaTabForRun();
    if (!tab || typeof tab.id !== "number") {
      throw new Error("Unable to open Strava.");
    }

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
      await storageSet(ACTIVE_RUN_TAB_KEY, tab.id);
    }

    return {
      ...(response || {}),
      tabId: tab.id
    };
  }

  async function handleStop() {
    const tab = await resolveControlTab();
    if (!tab || typeof tab.id !== "number") {
      await storageRemove(ACTIVE_RUN_TAB_KEY);
      return idleStatus();
    }

    const response = await sendContentMessageWithInjection(tab.id, ACTION_STOP_KUDOS);
    return {
      ...(response || idleStatus()),
      tabId: tab.id
    };
  }

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (!message || !message.action) {
      return false;
    }

    let task = null;
    if (message.action === ACTION_STATUS_KUDOS) {
      task = handleStatus();
    } else if (message.action === ACTION_RUN_KUDOS) {
      task = handleRun(message.settings);
    } else if (message.action === ACTION_STOP_KUDOS) {
      task = handleStop();
    } else {
      return false;
    }

    task.then((result) => {
      sendResponse(result);
    }).catch((error) => {
      sendResponse({
        ok: false,
        message: error && error.message ? error.message : "Strava Auto Kudos background task failed.",
        state: null
      });
    });

    return true;
  });
})();
