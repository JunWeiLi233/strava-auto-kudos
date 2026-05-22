(() => {
  "use strict";

  const ACTION_RUN_KUDOS = "STRAVA_AUTO_KUDOS_RUN";
  const ACTION_STOP_KUDOS = "STRAVA_AUTO_KUDOS_STOP";
  const ACTION_STATUS_KUDOS = "STRAVA_AUTO_KUDOS_STATUS";
  const SETTINGS_STORAGE_KEY = "stravaAutoKudosSettings";
  const LANGUAGE_STORAGE_KEY = "stravaAutoKudosLanguage";
  const DEFAULT_LANGUAGE = "en";
  const SUPPORTED_LANGUAGES = Object.freeze(["en", "zh"]);
  const DEFAULT_DELAY_RANGE_SECONDS = Object.freeze({
    min: 1.7,
    max: 4.6
  });
  const DEFAULT_DATE_RANGE = Object.freeze({
    mode: "any",
    value: 7,
    unit: "days"
  });
  const DEFAULT_RELATIONSHIP_FILTER = Object.freeze({
    mode: "connected"
  });
  const DELAY_LIMIT_SECONDS = Object.freeze({
    min: 0.8,
    max: 120
  });
  const DATE_RANGE_UNITS = Object.freeze(["days", "months", "years"]);
  const RELATIONSHIP_FILTER_MODES = Object.freeze(["connected", "any"]);
  const DATE_RANGE_LIMITS = Object.freeze({
    days: 3650,
    months: 120,
    years: 10
  });
  const TRANSLATIONS = Object.freeze({
    en: {
      title: "Strava Kudos",
      languageButtonLabel: "Switch language to Chinese",
      runButton: "Give kudos",
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
      readyStatus: "Ready on Strava.",
      validDelayError: "Enter a valid kudos delay range.",
      minDelayError: "Delay must be at least {min} seconds.",
      maxDelayError: "Delay must be {max} seconds or less.",
      minDelayOrderError: "Min delay must be less than or equal to max delay.",
      chooseDateUnitError: "Choose days, months, or years for the date filter.",
      wholeDateRangeError: "Enter a whole number for the date range.",
      dateRangeLimitError: "Date range must be {limit} {unit} or less.",
      noConfirmationStatus: "No kudos run confirmation received.",
      startedStatus: "Kudos started. You can use other windows while the Strava tab stays open.",
      stoppedSummary: "Stopped after {clicked} {clickWord}; scanned {scanned}, skipped {skipped}; relationship skips {relationship}; cache skips {cached}, refreshes {refreshes}.",
      clickedSummary: "Clicked {clicked} of {scanned} {buttonWord}; skipped {skipped}; relationship skips {relationship}; cache skips {cached}, refreshes {refreshes}.",
      clickSingular: "click",
      clickPlural: "clicks",
      buttonSingular: "button",
      buttonPlural: "buttons",
      stoppingStatus: "Stopping after the current movement...",
      backgroundStatus: "Kudos sequence is running. You can use other windows while Strava stays open.",
      startStatus: "Starting Strava kudos...",
      loginRequired: "Please log in to Strava, then run this extension again.",
      unableStart: "Unable to start kudos sequence.",
      stopRequestStatus: "Sending stop request...",
      unableStop: "Unable to stop kudos sequence.",
      delaySaved: "Delay range saved.",
      invalidDelay: "Invalid delay range.",
      dateSaved: "Date filter saved.",
      invalidDate: "Invalid date filter.",
      relationshipSaved: "Relationship filter saved.",
      invalidRelationship: "Invalid relationship filter.",
      noRunningStatus: "No kudos sequence is running.",
      openStravaStatus: "Open Strava to run kudos.",
      alreadyRunningStatus: "Kudos sequence is already running.",
      recentActivityBoundaryStatus: "Reached Strava's no-more-recent-activities boundary; stopped."
    },
    zh: {
      title: "Strava Kudos",
      languageButtonLabel: "切换到英文",
      runButton: "给 kudos",
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
      readyStatus: "Strava 已就绪。",
      validDelayError: "请输入有效的 kudos 间隔范围。",
      minDelayError: "间隔至少需要 {min} 秒。",
      maxDelayError: "间隔不能超过 {max} 秒。",
      minDelayOrderError: "最短间隔必须小于或等于最长间隔。",
      chooseDateUnitError: "请选择天、月或年作为日期过滤单位。",
      wholeDateRangeError: "请输入整数日期范围。",
      dateRangeLimitError: "日期范围不能超过 {limit} {unit}。",
      noConfirmationStatus: "没有收到 kudos 运行确认。",
      startedStatus: "Kudos 已开始。保持 Strava 标签页打开后，你可以使用其他窗口。",
      stoppedSummary: "已停止：点击 {clicked} 次；扫描 {scanned} 个，跳过 {skipped} 个；关系跳过 {relationship} 个，缓存跳过 {cached} 个，刷新 {refreshes} 次。",
      clickedSummary: "已点击 {clicked}/{scanned} 个按钮；跳过 {skipped} 个；关系跳过 {relationship} 个，缓存跳过 {cached} 个，刷新 {refreshes} 次。",
      clickSingular: "click",
      clickPlural: "clicks",
      buttonSingular: "按钮",
      buttonPlural: "按钮",
      stoppingStatus: "正在完成当前动作后停止...",
      backgroundStatus: "Kudos 流程正在运行。保持 Strava 打开后，你可以使用其他窗口。",
      startStatus: "正在启动 Strava kudos...",
      loginRequired: "请先登录 Strava，然后再使用扩展。",
      unableStart: "无法启动 kudos 流程。",
      stopRequestStatus: "正在发送停止请求...",
      unableStop: "无法停止 kudos 流程。",
      delaySaved: "间隔范围已保存。",
      invalidDelay: "间隔范围无效。",
      dateSaved: "日期过滤已保存。",
      invalidDate: "日期过滤无效。",
      relationshipSaved: "关系过滤已保存。",
      invalidRelationship: "关系过滤无效。",
      noRunningStatus: "当前没有正在运行的 kudos 流程。",
      openStravaStatus: "请打开 Strava 后再运行 kudos。",
      alreadyRunningStatus: "Kudos 流程已经在运行。",
      recentActivityBoundaryStatus: "已到达 Strava“没有更多近期活动”提示，流程已停止。"
    }
  });

  const runButton = document.getElementById("runButton");
  const stopButton = document.getElementById("stopButton");
  const languageButton = document.getElementById("languageButton");
  const minDelayInput = document.getElementById("minDelayInput");
  const maxDelayInput = document.getElementById("maxDelayInput");
  const dateRangeMode = document.getElementById("dateRangeMode");
  const dateRangeValue = document.getElementById("dateRangeValue");
  const dateRangeUnit = document.getElementById("dateRangeUnit");
  const relationshipFilterMode = document.getElementById("relationshipFilterMode");
  const statusText = document.getElementById("status");
  const statusDot = document.getElementById("statusDot");
  let currentLanguage = loadLanguage();
  let lastStatus = { key: "readyStatus", params: {}, state: "ready" };

  function loadLanguage() {
    try {
      const stored = window.localStorage.getItem(LANGUAGE_STORAGE_KEY);
      return SUPPORTED_LANGUAGES.includes(stored) ? stored : DEFAULT_LANGUAGE;
    } catch (_error) {
      return DEFAULT_LANGUAGE;
    }
  }

  function saveLanguage(language) {
    try {
      window.localStorage.setItem(LANGUAGE_STORAGE_KEY, language);
    } catch (_error) {
      // Language persistence is optional; the popup can still switch for this session.
    }
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

  function renderStatusDescriptor(descriptor) {
    if (descriptor && descriptor.key) {
      return t(descriptor.key, descriptor.params);
    }

    return descriptor && descriptor.text ? descriptor.text : "";
  }

  function setStatusDescriptor(descriptor, state) {
    lastStatus = {
      ...descriptor,
      state
    };
    statusText.textContent = renderStatusDescriptor(lastStatus);
    statusDot.dataset.state = state;
  }

  function setStatusKey(key, state, params) {
    setStatusDescriptor({ key, params: params || {} }, state);
  }

  function setStatusText(message, state) {
    setStatusDescriptor({ text: message }, state);
  }

  function applyLanguage() {
    document.documentElement.lang = languageCodeForHtml();
    document.querySelectorAll("[data-i18n]").forEach((element) => {
      element.textContent = t(element.dataset.i18n);
    });

    languageButton.textContent = currentLanguage === "en" ? "中文" : "EN";
    languageButton.setAttribute("aria-label", t("languageButtonLabel"));
    statusText.textContent = renderStatusDescriptor(lastStatus);
  }

  function toggleLanguage() {
    currentLanguage = currentLanguage === "en" ? "zh" : "en";
    saveLanguage(currentLanguage);
    applyLanguage();
  }

  function setRunningControls(isRunning, stopPending) {
    runButton.disabled = Boolean(isRunning);
    stopButton.disabled = !isRunning || Boolean(stopPending);
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
    const parsed = loadStoredSettings();
    const min = parseSeconds(parsed.minDelaySeconds);
    const max = parseSeconds(parsed.maxDelaySeconds);
    if (min === null || max === null) {
      return { ...DEFAULT_DELAY_RANGE_SECONDS };
    }

    return { min, max };
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

  function loadRelationshipFilterSettings() {
    const stored = loadStoredSettings();
    const mode = RELATIONSHIP_FILTER_MODES.includes(stored.relationshipFilterMode) ? stored.relationshipFilterMode : DEFAULT_RELATIONSHIP_FILTER.mode;
    return { mode };
  }

  function saveRelationshipFilterSettings(filter) {
    saveStoredSettings({
      relationshipFilterMode: filter.mode
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

  function applyRelationshipFilterSettingsToInputs() {
    const filter = loadRelationshipFilterSettings();
    relationshipFilterMode.value = filter.mode;
  }

  function unitLabel(unit) {
    if (unit === "months") {
      return t("monthsUnit");
    }
    if (unit === "years") {
      return t("yearsUnit");
    }

    return t("daysUnit");
  }

  function readDelaySettings() {
    const min = parseSeconds(minDelayInput.value);
    const max = parseSeconds(maxDelayInput.value);

    if (min === null || max === null) {
      throw new Error(t("validDelayError"));
    }

    if (min < DELAY_LIMIT_SECONDS.min || max < DELAY_LIMIT_SECONDS.min) {
      throw new Error(t("minDelayError", { min: DELAY_LIMIT_SECONDS.min }));
    }

    if (min > DELAY_LIMIT_SECONDS.max || max > DELAY_LIMIT_SECONDS.max) {
      throw new Error(t("maxDelayError", { max: DELAY_LIMIT_SECONDS.max }));
    }

    if (min > max) {
      throw new Error(t("minDelayOrderError"));
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
      throw new Error(t("chooseDateUnitError"));
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
      throw new Error(t("wholeDateRangeError"));
    }

    if (value > DATE_RANGE_LIMITS[unit]) {
      throw new Error(t("dateRangeLimitError", {
        limit: DATE_RANGE_LIMITS[unit],
        unit: unitLabel(unit)
      }));
    }

    const normalized = { mode, value, unit };
    saveDateRangeSettings(normalized);
    return normalized;
  }

  function readRelationshipFilterSettings() {
    const mode = RELATIONSHIP_FILTER_MODES.includes(relationshipFilterMode.value) ? relationshipFilterMode.value : null;
    if (!mode) {
      throw new Error(t("invalidRelationship"));
    }

    const normalized = { mode };
    saveRelationshipFilterSettings(normalized);
    return normalized;
  }

  function buildRunSettings() {
    const range = readDelaySettings();
    return {
      betweenTargets: {
        min: Math.round(range.min * 1000),
        max: Math.round(range.max * 1000)
      },
      dateRange: readDateRangeSettings(),
      relationshipFilter: readRelationshipFilterSettings()
    };
  }

  function sendRuntimeAction(action, settings) {
    const payload = {
      action,
      source: "strava-auto-kudos-popup",
      requestedAt: Date.now(),
      settings: settings || null
    };

    return new Promise((resolve, reject) => {
      chrome.runtime.sendMessage(payload, (response) => {
        const error = chrome.runtime.lastError;
        if (error) {
          reject(new Error(error.message));
          return;
        }

        resolve(response);
      });
    });
  }

  function isLoggedOutResponse(response) {
    const login = response && (response.login || (response.state && response.state.login));
    return login && login.loggedIn === false;
  }

  function skippedCount(metrics) {
    return Number(metrics.skippedAlreadyClicked || 0) +
      Number(metrics.skippedDisabled || 0) +
      Number(metrics.skippedMissing || 0) +
      Number(metrics.skippedOutOfDate || 0) +
      Number(metrics.skippedUnknownDate || 0) +
      Number(metrics.skippedCached || 0) +
      Number(metrics.skippedRelationship || 0);
  }

  function knownMessageKey(message) {
    const text = String(message || "").toLowerCase();
    if (/no .*kudos sequence is running/.test(text)) {
      return "noRunningStatus";
    }
    if (/open strava/.test(text)) {
      return "openStravaStatus";
    }
    if (/already running/.test(text)) {
      return "alreadyRunningStatus";
    }
    if (/please log in/.test(text)) {
      return "loginRequired";
    }

    return null;
  }

  function resultStatusDescriptor(response) {
    if (!response || !response.ok) {
      const key = knownMessageKey(response && response.message);
      return key ? { key } : { key: "noConfirmationStatus" };
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
      return {
        key: "stoppedSummary",
        params: {
          clicked,
          clickWord: clicked === 1 ? t("clickSingular") : t("clickPlural"),
          scanned,
          skipped,
          relationship,
          cached,
          refreshes
        }
      };
    }

    if (metrics.endedAtRecentActivityBoundary) {
      return { key: "recentActivityBoundaryStatus" };
    }

    const knownKey = knownMessageKey(response.message);
    if (knownKey) {
      return { key: knownKey };
    }

    if (response.message && !scanned && !clicked && !skipped) {
      return { text: response.message };
    }

    return {
      key: "clickedSummary",
      params: {
        clicked,
        scanned,
        buttonWord: scanned === 1 ? t("buttonSingular") : t("buttonPlural"),
        skipped,
        relationship,
        cached,
        refreshes
      }
    };
  }

  function applyStatusResponse(response, quiet) {
    const state = response && response.state ? response.state : {};
    const isRunning = Boolean(state.running);
    const stopPending = Boolean(state.cancelRequested);
    setRunningControls(isRunning, stopPending);

    if (isRunning && stopPending) {
      setStatusKey("stoppingStatus", "busy");
      return;
    }

    if (isRunning) {
      setStatusKey("backgroundStatus", "busy");
      return;
    }

    if (!quiet) {
      setStatusDescriptor(resultStatusDescriptor(response), response && response.ok ? "ready" : "error");
    }
  }

  async function refreshStatus() {
    try {
      const response = await sendRuntimeAction(ACTION_STATUS_KUDOS);
      applyStatusResponse(response, true);
    } catch (_error) {
      setRunningControls(false, false);
    }
  }

  async function run() {
    setRunningControls(true, false);
    setStatusKey("startStatus", "busy");

    try {
      const runSettings = buildRunSettings();
      const response = await sendRuntimeAction(ACTION_RUN_KUDOS, runSettings);
      if (isLoggedOutResponse(response)) {
        setRunningControls(false, false);
        setStatusKey("loginRequired", "error");
        return;
      }

      applyStatusResponse(response, true);
      const state = response && response.state ? response.state : {};
      setStatusDescriptor(resultStatusDescriptor(response), response && (response.ok || state.running) ? "busy" : "error");
    } catch (error) {
      setRunningControls(false, false);
      setStatusText(error.message || t("unableStart"), "error");
    }
  }

  async function stop() {
    setRunningControls(true, true);
    setStatusKey("stopRequestStatus", "busy");

    try {
      const response = await sendRuntimeAction(ACTION_STOP_KUDOS);
      if (response && response.ok) {
        applyStatusResponse(response, false);
      } else {
        setStatusDescriptor(resultStatusDescriptor(response), "ready");
        setRunningControls(false, false);
      }
    } catch (error) {
      setStatusText(error.message || t("unableStop"), "error");
      setRunningControls(false, false);
    }
  }

  function saveDelayFromInputs() {
    try {
      readDelaySettings();
      setStatusKey("delaySaved", "ready");
    } catch (error) {
      setStatusText(error.message || t("invalidDelay"), "error");
    }
  }

  function saveDateRangeFromInputs() {
    try {
      setDateRangeControlsEnabled();
      readDateRangeSettings();
      setStatusKey("dateSaved", "ready");
    } catch (error) {
      setStatusText(error.message || t("invalidDate"), "error");
    }
  }

  function saveRelationshipFilterFromInputs() {
    try {
      readRelationshipFilterSettings();
      setStatusKey("relationshipSaved", "ready");
    } catch (error) {
      setStatusText(error.message || t("invalidRelationship"), "error");
    }
  }

  runButton.addEventListener("click", run);
  stopButton.addEventListener("click", stop);
  languageButton.addEventListener("click", toggleLanguage);
  minDelayInput.addEventListener("change", saveDelayFromInputs);
  maxDelayInput.addEventListener("change", saveDelayFromInputs);
  dateRangeMode.addEventListener("change", saveDateRangeFromInputs);
  dateRangeValue.addEventListener("change", saveDateRangeFromInputs);
  dateRangeUnit.addEventListener("change", saveDateRangeFromInputs);
  relationshipFilterMode.addEventListener("change", saveRelationshipFilterFromInputs);
  applyLanguage();
  applyDelaySettingsToInputs();
  applyDateRangeSettingsToInputs();
  applyRelationshipFilterSettingsToInputs();
  refreshStatus();
})();
