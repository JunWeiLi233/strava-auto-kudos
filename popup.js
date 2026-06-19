(() => {
  "use strict";

  const ACTION_RUN_KUDOS = "STRAVA_AUTO_KUDOS_RUN";
  const ACTION_STOP_KUDOS = "STRAVA_AUTO_KUDOS_STOP";
  const ACTION_STATUS_KUDOS = "STRAVA_AUTO_KUDOS_STATUS";
  const SETTINGS_KEY = "stravaAutoKudosSettingsV2";
  const LANGUAGE_KEY = "stravaAutoKudosLanguage";
  const LAST_RUN_KEY = "stravaAutoKudosLastRun";
  const DEFAULT_LANGUAGE = "en";
  const SUPPORTED_LANGUAGES = Object.freeze(["en", "zh"]);
  const DEFAULT_SETTINGS = Object.freeze({
    autoMode: false,
    scheduleIntervalMinutes: 30,
    minDelaySeconds: 1.7,
    maxDelaySeconds: 4.6,
    dateRangeMode: "any",
    dateRangeValue: 7,
    dateRangeUnit: "days",
    relationshipFilterMode: "connected"
  });
  const DELAY_LIMIT_SECONDS = Object.freeze({ min: 0.8, max: 120 });
  const DATE_RANGE_UNITS = Object.freeze(["days", "months", "years"]);
  const RELATIONSHIP_FILTER_MODES = Object.freeze(["connected", "any"]);
  const DATE_RANGE_LIMITS = Object.freeze({ days: 3650, months: 120, years: 10 });
  const STATUS_POLL_INTERVAL_MS = 1200;

  const TRANSLATIONS = Object.freeze({
    en: {
      title: "Strava Kudos",
      languageButtonLabel: "Switch language to Chinese",
      autoModeLabel: "Auto mode",
      autoModeDesc: "Automatically give kudos on schedule",
      scheduleLegend: "Schedule",
      scheduleIntervalLabel: "Check every (minutes)",
      runNowButton: "Run now",
      stopButton: "Stop",
      delayLegend: "Kudos delay",
      minDelayLabel: "Min sec",
      maxDelayLabel: "Max sec",
      dateLegend: "Activity date",
      dateFilterLabel: "Filter",
      dateAnyOption: "Any time",
      dateLastOption: "Last",
      dateRangeLabel: "Range",
      dateUnitLabel: "Unit",
      relationshipLegend: "Relationship",
      relationshipFilterLabel: "Filter",
      relationshipConnectedOption: "Following / follows me only",
      relationshipAnyOption: "Any visible activity",
      daysOption: "days",
      monthsOption: "months",
      yearsOption: "years",
      daysUnit: "days",
      monthsUnit: "months",
      yearsUnit: "years",
      readyStatus: "Set your filters and enable Auto mode.",
      autoOnStatus: "Auto mode on. Kudos will run automatically on Strava.",
      autoOffStatus: "Auto mode off. Use Run now to give kudos manually.",
      validDelayError: "Enter a valid kudos delay range.",
      minDelayError: "Delay must be at least {min} seconds.",
      maxDelayError: "Delay must be {max} seconds or less.",
      minDelayOrderError: "Min delay must be less than or equal to max delay.",
      settingsSaved: "Settings saved.",
      invalidSchedule: "Schedule interval must be between 5 and 1440 minutes.",
      startedStatus: "Kudos started. Keep a Strava tab open.",
      stoppedSummary: "Stopped after {clicked} {clickWord}; scanned {scanned}, skipped {skipped}; relationship skips {relationship}; cache skips {cached}, refreshes {refreshes}.",
      clickedSummary: "Clicked {clicked} of {scanned} {buttonWord}; skipped {skipped}; relationship skips {relationship}; cache skips {cached}, refreshes {refreshes}.",
      runningProgressStatus: "{status} Clicked {clicked}; scanned {scanned}; skipped {skipped}; scrolls {scrolls}; waits {waits}; refreshes {refreshes}.",
      clickSingular: "click",
      clickPlural: "clicks",
      buttonSingular: "button",
      buttonPlural: "buttons",
      stoppingStatus: "Stopping after current action...",
      backgroundStatus: "Kudos running. You can use other windows.",
      startStatus: "Starting Strava kudos...",
      loginRequired: "Please log in to Strava first.",
      unableStart: "Unable to start kudos sequence.",
      stopRequestStatus: "Sending stop request...",
      unableStop: "Unable to stop kudos sequence.",
      noRunningStatus: "No kudos sequence is running.",
      openStravaStatus: "Open Strava to run kudos.",
      alreadyRunningStatus: "Kudos sequence is already running.",
      recentActivityBoundaryStatus: "Reached Strava's recent-activity boundary; stopped.",
      dateBoundaryStatus: "Reached the activity-date boundary; stopped.",
      lastRunLabel: "Last run: {time}",
      lastRunStats: "{clicked} kudos given, {scanned} scanned",
      never: "never",
      runStatusStarting: "Starting kudos sequence.",
      runStatusRecentBoundary: "Reached Strava recent-activity boundary.",
      runStatusDateBoundary: "Reached the configured activity-date boundary.",
      runStatusChecking: "Checking a visible kudos button.",
      runStatusRechecking: "Re-checking the kudos button before clicking.",
      runStatusClicked: "Clicked a kudos button.",
      runStatusResumed: "Resumed after refreshing Strava.",
      runStatusBatchComplete: "Loaded batch complete; scrolling for more activities.",
      runStatusScrolling: "Scrolling dashboard for more activities.",
      runStatusMoreLoaded: "More feed content loaded; scanning again.",
      runStatusHiddenWaiting: "Strava tab hidden; waiting before next scroll.",
      runStatusWaiting: "Waiting for Strava to fetch more activities."
    },
    zh: {
      title: "Strava Kudos",
      languageButtonLabel: "切换到英文",
      autoModeLabel: "自动模式",
      autoModeDesc: "按计划自动给 kudos",
      scheduleLegend: "计划",
      scheduleIntervalLabel: "检查间隔（分钟）",
      runNowButton: "立即运行",
      stopButton: "停止",
      delayLegend: "Kudos 间隔",
      minDelayLabel: "最短秒数",
      maxDelayLabel: "最长秒数",
      dateLegend: "动态日期",
      dateFilterLabel: "过滤",
      dateAnyOption: "不限时间",
      dateLastOption: "最近",
      dateRangeLabel: "范围",
      dateUnitLabel: "单位",
      relationshipLegend: "关系过滤",
      relationshipFilterLabel: "过滤",
      relationshipConnectedOption: "仅关注 / 关注我的人",
      relationshipAnyOption: "任何可见动态",
      daysOption: "天",
      monthsOption: "个月",
      yearsOption: "年",
      daysUnit: "天",
      monthsUnit: "个月",
      yearsUnit: "年",
      readyStatus: "设置过滤条件并开启自动模式。",
      autoOnStatus: "自动模式已开启。Kudos 将在 Strava 上自动运行。",
      autoOffStatus: "自动模式已关闭。使用立即运行手动给 kudos。",
      validDelayError: "请输入有效的 kudos 间隔范围。",
      minDelayError: "间隔至少需要 {min} 秒。",
      maxDelayError: "间隔不能超过 {max} 秒。",
      minDelayOrderError: "最短间隔必须小于或等于最长间隔。",
      settingsSaved: "设置已保存。",
      invalidSchedule: "计划间隔必须在 5 到 1440 分钟之间。",
      startedStatus: "Kudos 已开始。保持 Strava 标签页打开。",
      stoppedSummary: "已停止：点击 {clicked} 次；扫描 {scanned} 个，跳过 {skipped} 个；关系跳过 {relationship} 个，缓存跳过 {cached} 个，刷新 {refreshes} 次。",
      clickedSummary: "已点击 {clicked}/{scanned} 个按钮；跳过 {skipped} 个；关系跳过 {relationship} 个，缓存跳过 {cached} 个，刷新 {refreshes} 次。",
      runningProgressStatus: "{status} 已点击 {clicked} 次；扫描 {scanned} 个；跳过 {skipped} 个；滚动 {scrolls} 次；等待 {waits} 次；刷新 {refreshes} 次。",
      clickSingular: "click",
      clickPlural: "clicks",
      buttonSingular: "按钮",
      buttonPlural: "按钮",
      stoppingStatus: "正在完成当前动作后停止...",
      backgroundStatus: "Kudos 正在运行。你可以使用其他窗口。",
      startStatus: "正在启动 Strava kudos...",
      loginRequired: "请先登录 Strava。",
      unableStart: "无法启动 kudos 流程。",
      stopRequestStatus: "正在发送停止请求...",
      unableStop: "无法停止 kudos 流程。",
      noRunningStatus: "当前没有正在运行的 kudos 流程。",
      openStravaStatus: "请打开 Strava 后再运行 kudos。",
      alreadyRunningStatus: "Kudos 流程已经在运行。",
      recentActivityBoundaryStatus: "已到达 Strava 近期动态边界，流程已停止。",
      dateBoundaryStatus: "已到达动态日期边界，流程已停止。",
      lastRunLabel: "上次运行：{time}",
      lastRunStats: "已给 {clicked} 个 kudos，扫描 {scanned} 个",
      never: "从未",
      runStatusStarting: "正在启动 kudos 流程。",
      runStatusRecentBoundary: "已到达 Strava 近期动态边界。",
      runStatusDateBoundary: "已到达设置的动态日期边界。",
      runStatusChecking: "正在检查可见的 kudos 按钮。",
      runStatusRechecking: "点击前正在重新检查 kudos 按钮。",
      runStatusClicked: "已点击一个 kudos 按钮。",
      runStatusResumed: "刷新 Strava 后已恢复。",
      runStatusBatchComplete: "当前批次已完成，正在滚动查找更多动态。",
      runStatusScrolling: "正在滚动仪表盘，等待加载更多动态。",
      runStatusMoreLoaded: "已加载更多动态，正在继续扫描。",
      runStatusHiddenWaiting: "Strava 标签页在后台，正在等待下次滚动。",
      runStatusWaiting: "正在等待 Strava 获取更多动态。"
    }
  });

  const autoModeToggle = document.getElementById("autoModeToggle");
  const autoModeSection = document.getElementById("autoModeSection");
  const scheduleInterval = document.getElementById("scheduleInterval");
  const runNowButton = document.getElementById("runNowButton");
  const stopButton = document.getElementById("stopButton");
  const languageButton = document.getElementById("languageButton");
  const minDelayInput = document.getElementById("minDelayInput");
  const maxDelayInput = document.getElementById("maxDelayInput");
  const dateRangeMode = document.getElementById("dateRangeMode");
  const dateRangeValue = document.getElementById("dateRangeValue");
  const dateRangeUnit = document.getElementById("dateRangeUnit");
  const relationshipFilterMode = document.getElementById("relationshipFilterMode");
  const statusText = document.getElementById("status");
  const lastRunEl = document.getElementById("lastRun");
  let currentLanguage = loadLanguage();
  let lastStatus = { key: "readyStatus", params: {}, state: "ready" };
  let refreshStatusInFlight = false;

  function loadLanguage() {
    try {
      const stored = window.localStorage.getItem(LANGUAGE_KEY);
      return SUPPORTED_LANGUAGES.includes(stored) ? stored : DEFAULT_LANGUAGE;
    } catch (_error) {
      return DEFAULT_LANGUAGE;
    }
  }

  function saveLanguage(language) {
    try {
      window.localStorage.setItem(LANGUAGE_KEY, language);
    } catch (_error) {}
  }

  function t(key, params) {
    const dictionary = TRANSLATIONS[currentLanguage] || TRANSLATIONS.en;
    const template = dictionary[key] || TRANSLATIONS.en[key] || key;
    return Object.entries(params || {}).reduce((text, entry) => {
      return text.replaceAll(`{${entry[0]}}`, String(entry[1]));
    }, template);
  }

  function languageCodeForHtml() {
    return currentLanguage === "zh" ? "zh-CN" : "en";
  }

  function formatTime(ts) {
    if (!ts) return t("never");
    const d = new Date(ts);
    const now = new Date();
    const isToday = d.toDateString() === now.toDateString();
    const time = d.toLocaleTimeString(currentLanguage === "zh" ? "zh-CN" : "en-US", { hour: "2-digit", minute: "2-digit" });
    if (isToday) return time;
    const date = d.toLocaleDateString(currentLanguage === "zh" ? "zh-CN" : "en-US", { month: "short", day: "numeric" });
    return date + " " + time;
  }

  function renderStatusDescriptor(descriptor) {
    if (descriptor && descriptor.key) {
      return t(descriptor.key, descriptor.params);
    }
    return descriptor && descriptor.text ? descriptor.text : "";
  }

  function setStatusDescriptor(descriptor, state) {
    lastStatus = { ...descriptor, state };
    statusText.textContent = renderStatusDescriptor(lastStatus);
  }

  function setStatusKey(key, params) {
    setStatusDescriptor({ key, params: params || {} }, "ready");
  }

  function applyLanguage() {
    document.documentElement.lang = languageCodeForHtml();
    document.querySelectorAll("[data-i18n]").forEach((element) => {
      element.textContent = t(element.dataset.i18n);
    });
    languageButton.textContent = currentLanguage === "en" ? "中文" : "EN";
    languageButton.setAttribute("aria-label", t("languageButtonLabel"));
    statusText.textContent = renderStatusDescriptor(lastStatus);
    updateLastRunDisplay();
  }

  function toggleLanguage() {
    currentLanguage = currentLanguage === "en" ? "zh" : "en";
    saveLanguage(currentLanguage);
    applyLanguage();
  }

  function setRunningControls(isRunning, stopPending) {
    runNowButton.disabled = Boolean(isRunning);
    stopButton.disabled = !isRunning || Boolean(stopPending);
  }

  function updateAutoModeUI(autoMode) {
    autoModeToggle.checked = Boolean(autoMode);
    if (autoMode) {
      autoModeSection.classList.add("active");
    } else {
      autoModeSection.classList.remove("active");
    }
  }

  async function loadAllSettings() {
    try {
      const stored = await chromeStorageGet(SETTINGS_KEY);
      const settings = { ...DEFAULT_SETTINGS, ...(stored || {}) };
      return settings;
    } catch (_error) {
      return { ...DEFAULT_SETTINGS };
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
      chrome.storage.local.set(items, () => {
        resolve(!chrome.runtime.lastError);
      });
    });
  }

  async function saveAllSettings(settings) {
    return chromeStorageSet({ [SETTINGS_KEY]: settings });
  }

  function parseSeconds(value) {
    const parsed = Number.parseFloat(value);
    return Number.isFinite(parsed) ? parsed : null;
  }

  function parsePositiveInteger(value) {
    const text = String(value || "").trim();
    if (!/^\d+$/.test(text)) return null;
    const parsed = Number.parseInt(text, 10);
    return Number.isSafeInteger(parsed) && parsed >= 1 ? parsed : null;
  }

  async function applySettingsToUI() {
    const s = await loadAllSettings();
    updateAutoModeUI(s.autoMode);
    scheduleInterval.value = String(s.scheduleIntervalMinutes || DEFAULT_SETTINGS.scheduleIntervalMinutes);
    minDelayInput.value = String(s.minDelaySeconds);
    maxDelayInput.value = String(s.maxDelaySeconds);
    dateRangeMode.value = s.dateRangeMode;
    dateRangeValue.value = String(s.dateRangeValue);
    dateRangeUnit.value = s.dateRangeUnit;
    relationshipFilterMode.value = s.relationshipFilterMode;
    setDateRangeControlsEnabled();
    updateLastRunDisplay();
  }

  function setDateRangeControlsEnabled() {
    const isActive = dateRangeMode.value === "last";
    dateRangeValue.disabled = !isActive;
    dateRangeUnit.disabled = !isActive;
  }

  async function readAndSaveSettings() {
    const min = parseSeconds(minDelayInput.value);
    const max = parseSeconds(maxDelayInput.value);
    if (min === null || max === null) throw new Error(t("validDelayError"));
    if (min < DELAY_LIMIT_SECONDS.min || max < DELAY_LIMIT_SECONDS.min) throw new Error(t("minDelayError", { min: DELAY_LIMIT_SECONDS.min }));
    if (min > DELAY_LIMIT_SECONDS.max || max > DELAY_LIMIT_SECONDS.max) throw new Error(t("maxDelayError", { max: DELAY_LIMIT_SECONDS.max }));
    if (min > max) throw new Error(t("minDelayOrderError"));

    const interval = Number(scheduleInterval.value);
    if (!Number.isFinite(interval) || interval < 5 || interval > 1440) throw new Error(t("invalidSchedule"));

    const drMode = dateRangeMode.value === "last" ? "last" : "any";
    const drUnit = DATE_RANGE_UNITS.includes(dateRangeUnit.value) ? dateRangeUnit.value : "days";
    let drValue = parsePositiveInteger(dateRangeValue.value) || 7;
    if (drValue > DATE_RANGE_LIMITS[drUnit]) drValue = DATE_RANGE_LIMITS[drUnit];

    const relMode = RELATIONSHIP_FILTER_MODES.includes(relationshipFilterMode.value) ? relationshipFilterMode.value : "connected";

    const settings = {
      autoMode: autoModeToggle.checked,
      scheduleIntervalMinutes: Math.round(interval),
      minDelaySeconds: Math.round(min * 10) / 10,
      maxDelaySeconds: Math.round(max * 10) / 10,
      dateRangeMode: drMode,
      dateRangeValue: drValue,
      dateRangeUnit: drUnit,
      relationshipFilterMode: relMode
    };
    await saveAllSettings(settings);
    return settings;
  }

  function buildRunSettingsFromUI(settings) {
    const s = settings || {};
    return {
      betweenTargets: {
        min: Math.round((s.minDelaySeconds || 1.7) * 1000),
        max: Math.round((s.maxDelaySeconds || 4.6) * 1000)
      },
      dateRange: {
        mode: s.dateRangeMode || "any",
        value: s.dateRangeValue || 7,
        unit: s.dateRangeUnit || "days"
      },
      relationshipFilter: {
        mode: s.relationshipFilterMode || "connected"
      }
    };
  }

  function sendRuntimeAction(action, runSettings) {
    return new Promise((resolve, reject) => {
      chrome.runtime.sendMessage({
        action,
        source: "strava-auto-kudos-popup",
        requestedAt: Date.now(),
        settings: runSettings || null
      }, (response) => {
        const error = chrome.runtime.lastError;
        if (error) { reject(new Error(error.message)); return; }
        resolve(response);
      });
    });
  }

  function isLoggedOutResponse(response) {
    const login = response && (response.login || (response.state && response.state.login));
    return login && login.loggedIn === false;
  }

  function skippedCount(metrics) {
    const m = metrics || {};
    return Number(m.skippedAlreadyClicked || 0) +
      Number(m.skippedDisabled || 0) + Number(m.skippedMissing || 0) +
      Number(m.skippedOutOfDate || 0) + Number(m.skippedUnknownDate || 0) +
      Number(m.skippedCached || 0) + Number(m.skippedRelationship || 0);
  }

  function resultStatusDescriptor(response) {
    if (!response || !response.ok) {
      return { key: "noRunningStatus" };
    }
    if (response.started) {
      return { key: "startedStatus" };
    }

    const metrics = response.metrics || (response.state && response.state.metrics) || {};
    const clicked = Number(metrics.clicked || 0);
    const scanned = Number(metrics.scanned || 0);
    const skipped = skippedCount(metrics);
    const cached = Number(metrics.skippedCached || 0);
    const relationship = Number(metrics.skippedRelationship || 0);
    const refreshes = Number(metrics.refreshes || 0);

    if (metrics.stopped) {
      return { key: "stoppedSummary", params: { clicked, clickWord: clicked === 1 ? t("clickSingular") : t("clickPlural"), scanned, skipped, relationship, cached, refreshes } };
    }
    if (metrics.endedAtRecentActivityBoundary) {
      return { key: "recentActivityBoundaryStatus" };
    }
    if (metrics.endedAtDateBoundary) {
      return { key: "dateBoundaryStatus" };
    }
    return { key: "clickedSummary", params: { clicked, scanned, buttonWord: scanned === 1 ? t("buttonSingular") : t("buttonPlural"), skipped, relationship, cached, refreshes } };
  }

  function runningStatusDescriptor(metrics) {
    const m = metrics || {};
    return {
      key: "runningProgressStatus",
      params: {
        status: m.currentStatusKey ? t(m.currentStatusKey) : (m.currentStatus || t("backgroundStatus")),
        clicked: Number(m.clicked || 0),
        scanned: Number(m.scanned || 0),
        skipped: skippedCount(m),
        scrolls: Number(m.discoveryScrolls || 0),
        waits: Number(m.idleDiscoveryAttempts || 0) + Number(m.hiddenDiscoveryBackoffs || 0),
        refreshes: Number(m.refreshes || 0)
      }
    };
  }

  async function updateLastRunDisplay() {
    try {
      const lastRun = await chromeStorageGet(LAST_RUN_KEY);
      if (lastRun && lastRun.finishedAt) {
        lastRunEl.style.display = "block";
        const timeStr = formatTime(lastRun.finishedAt);
        const clicked = Number(lastRun.clicked || 0);
        const scanned = Number(lastRun.scanned || 0);
        lastRunEl.textContent = t("lastRunLabel", { time: timeStr }) + " — " + t("lastRunStats", { clicked, scanned });
      } else {
        lastRunEl.style.display = "none";
      }
    } catch (_error) {
      lastRunEl.style.display = "none";
    }
  }

  async function applyStatusResponse(response, quiet) {
    const state = response && response.state ? response.state : {};
    const isRunning = Boolean(state.running);
    const stopPending = Boolean(state.cancelRequested);
    setRunningControls(isRunning, stopPending);

    if (isRunning && stopPending) {
      setStatusDescriptor({ key: "stoppingStatus" }, "ready");
      return;
    }
    if (isRunning) {
      const metrics = state.metrics;
      setStatusDescriptor(runningStatusDescriptor(metrics), "busy");
      return;
    }
    if (!quiet) {
      setStatusDescriptor(resultStatusDescriptor(response), "ready");
    }

    const settings = await loadAllSettings();
    if (settings.autoMode && !isRunning) {
      setStatusDescriptor({ key: "autoOnStatus" }, "ready");
    } else if (!settings.autoMode && !isRunning) {
      setStatusDescriptor({ key: "autoOffStatus" }, "ready");
    }
  }

  async function refreshStatus() {
    if (refreshStatusInFlight) return;
    refreshStatusInFlight = true;
    try {
      const response = await sendRuntimeAction(ACTION_STATUS_KUDOS);
      await applyStatusResponse(response, true);
    } catch (_error) {
      setRunningControls(false, false);
    } finally {
      refreshStatusInFlight = false;
    }
  }

  async function runNow() {
    setRunningControls(true, false);
    setStatusDescriptor({ key: "startStatus" }, "ready");

    try {
      const settings = await loadAllSettings();
      const runSettings = buildRunSettingsFromUI(settings);
      const response = await sendRuntimeAction(ACTION_RUN_KUDOS, runSettings);

      if (isLoggedOutResponse(response)) {
        setRunningControls(false, false);
        setStatusDescriptor({ key: "loginRequired" }, "ready");
        return;
      }

      await applyStatusResponse(response, true);
      const state = response && response.state ? response.state : {};
      if (response && (response.ok || state.running)) {
        const metrics = state.metrics || {};
        setStatusDescriptor(runningStatusDescriptor(metrics), "busy");
      } else {
        setStatusDescriptor(resultStatusDescriptor(response), "ready");
      }
    } catch (error) {
      setRunningControls(false, false);
      setStatusDescriptor({ text: error.message || t("unableStart") }, "ready");
    }
  }

  async function stopRun() {
    setRunningControls(true, true);
    setStatusDescriptor({ key: "stopRequestStatus" }, "ready");

    try {
      const response = await sendRuntimeAction(ACTION_STOP_KUDOS);
      if (response && response.ok) {
        await applyStatusResponse(response, false);
      } else {
        setRunningControls(false, false);
        setStatusDescriptor(resultStatusDescriptor(response), "ready");
      }
    } catch (error) {
      setStatusDescriptor({ text: error.message || t("unableStop") }, "ready");
      setRunningControls(false, false);
    }
  }

  async function onAutoModeToggle() {
    try {
      const settings = await loadAllSettings();
      settings.autoMode = autoModeToggle.checked;
      await saveAllSettings(settings);
      updateAutoModeUI(settings.autoMode);

      if (settings.autoMode) {
        setStatusDescriptor({ key: "autoOnStatus" }, "ready");
        chrome.runtime.sendMessage({ action: "STRAVA_AUTO_KUDOS_AUTO_MODE_ON", settings });
      } else {
        setStatusDescriptor({ key: "autoOffStatus" }, "ready");
        chrome.runtime.sendMessage({ action: "STRAVA_AUTO_KUDOS_AUTO_MODE_OFF" });
      }
    } catch (_error) {
      updateAutoModeUI(false);
    }
  }

  async function onSettingChanged() {
    try {
      await readAndSaveSettings();
      setDateRangeControlsEnabled();
      setStatusDescriptor({ key: "settingsSaved" }, "ready");
      notifySettingsChanged();
    } catch (error) {
      setStatusDescriptor({ text: error.message }, "ready");
    }
  }

  async function notifySettingsChanged() {
    const settings = await loadAllSettings();
    chrome.runtime.sendMessage({ action: "STRAVA_AUTO_KUDOS_SETTINGS_CHANGED", settings });
  }

  autoModeToggle.addEventListener("change", onAutoModeToggle);
  scheduleInterval.addEventListener("change", onSettingChanged);
  minDelayInput.addEventListener("change", onSettingChanged);
  maxDelayInput.addEventListener("change", onSettingChanged);
  dateRangeMode.addEventListener("change", onSettingChanged);
  dateRangeValue.addEventListener("change", onSettingChanged);
  dateRangeUnit.addEventListener("change", onSettingChanged);
  relationshipFilterMode.addEventListener("change", onSettingChanged);
  runNowButton.addEventListener("click", runNow);
  stopButton.addEventListener("click", stopRun);
  languageButton.addEventListener("click", toggleLanguage);

  applyLanguage();
  applySettingsToUI();
  refreshStatus();
  setInterval(refreshStatus, STATUS_POLL_INTERVAL_MS);
})();
