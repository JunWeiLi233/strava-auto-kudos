(() => {
  "use strict";

  if (window.__stravaAutoKudosContentLoaded) {
    return;
  }
  window.__stravaAutoKudosContentLoaded = true;

  const ACTION_RUN_KUDOS = "STRAVA_AUTO_KUDOS_RUN";
  const ACTION_STOP_KUDOS = "STRAVA_AUTO_KUDOS_STOP";
  const ACTION_STATUS_KUDOS = "STRAVA_AUTO_KUDOS_STATUS";
  const HANDLED_ACTIVITY_CACHE_KEY = "stravaAutoKudosHandledActivityCacheV1";
  const RESUME_RUN_KEY = "stravaAutoKudosResumeRunV1";
  const TARGET_SELECTOR = 'button[data-testid="give_kudos_button"], button[data-testid="kudos_button"]';
  const TIMING_PROFILE = Object.freeze({
    preScrollLook: { min: 180, max: 720 },
    scrollStepPause: { min: 55, max: 210 },
    scrollHesitation: { min: 280, max: 960 },
    scrollSettle: { min: 520, max: 1600 },
    preClickDwell: { min: 240, max: 1150 },
    pressHold: { min: 45, max: 180 },
    postClickDwell: { min: 320, max: 1050 },
    betweenTargets: { min: 1700, max: 4600 },
    longPause: { min: 4200, max: 7800 },
    longPauseEvery: { min: 4, max: 7 },
    feedLoadSettle: { min: 900, max: 1800 }
  });
  const USER_DELAY_LIMIT_MS = Object.freeze({
    min: 800,
    max: 120000
  });
  const DEFAULT_DATE_RANGE = Object.freeze({
    value: 7,
    unit: "days"
  });
  const DATE_RANGE_UNITS = Object.freeze(["days", "months", "years"]);
  const DATE_RANGE_LIMITS = Object.freeze({
    days: 3650,
    months: 120,
    years: 10
  });
  const DISCOVERY_PROFILE = Object.freeze({
    maxIdleScrollAttempts: 4,
    maxProcessedButtons: 250
  });
  const BACKGROUND_DISCOVERY_PROFILE = Object.freeze({
    hiddenDiscoveryBackoff: { min: 2500, max: 5500 }
  });
  const ACTIVITY_CACHE_PROFILE = Object.freeze({
    maxItems: 2500,
    flushEvery: 5
  });
  const AUTO_REFRESH_PROFILE = Object.freeze({
    maxRefreshes: 8,
    maxNoNewWorkRefreshes: 2,
    resumeTtlMs: 30 * 60 * 1000,
    resumeSettle: { min: 1600, max: 3200 }
  });

  const runState = {
    running: false,
    cancelRequested: false,
    activeMetrics: null,
    lastMetrics: null
  };

  function sleep(ms) {
    return new Promise((resolve) => {
      window.setTimeout(resolve, ms);
    });
  }

  function randomInteger(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
  }

  function randomFloat(min, max) {
    return Math.random() * (max - min) + min;
  }

  function chance(probability) {
    return Math.random() < probability;
  }

  function randomDelay(range) {
    return sleep(randomInteger(range.min, range.max));
  }

  function storageLocalGet(key) {
    return new Promise((resolve) => {
      if (typeof chrome === "undefined" || !chrome.storage || !chrome.storage.local) {
        resolve(null);
        return;
      }

      chrome.storage.local.get(key, (items) => {
        if (chrome.runtime.lastError) {
          resolve(null);
          return;
        }

        resolve(items ? items[key] : null);
      });
    });
  }

  function storageLocalSet(items) {
    return new Promise((resolve) => {
      if (typeof chrome === "undefined" || !chrome.storage || !chrome.storage.local) {
        resolve(false);
        return;
      }

      chrome.storage.local.set(items, () => {
        resolve(!chrome.runtime.lastError);
      });
    });
  }

  function storageLocalRemove(key) {
    return new Promise((resolve) => {
      if (typeof chrome === "undefined" || !chrome.storage || !chrome.storage.local) {
        resolve(false);
        return;
      }

      chrome.storage.local.remove(key, () => {
        resolve(!chrome.runtime.lastError);
      });
    });
  }

  async function cancellableDelay(range) {
    const total = randomInteger(range.min, range.max);
    const startedAt = Date.now();

    while (Date.now() - startedAt < total) {
      if (runState.cancelRequested) {
        return false;
      }

      const remaining = total - (Date.now() - startedAt);
      await sleep(Math.min(remaining, randomInteger(70, 180)));
    }

    return !runState.cancelRequested;
  }

  function createPaceState() {
    return {
      betweenTargets: { ...TIMING_PROFILE.betweenTargets },
      interactionsUntilLongPause: randomInteger(TIMING_PROFILE.longPauseEvery.min, TIMING_PROFILE.longPauseEvery.max)
    };
  }

  async function pauseBetweenTargets(paceState) {
    if (!(await cancellableDelay(paceState.betweenTargets))) {
      return false;
    }

    paceState.interactionsUntilLongPause -= 1;
    if (paceState.interactionsUntilLongPause > 0) {
      return true;
    }

    paceState.interactionsUntilLongPause = randomInteger(TIMING_PROFILE.longPauseEvery.min, TIMING_PROFILE.longPauseEvery.max);
    return cancellableDelay(TIMING_PROFILE.longPause);
  }

  function clampDelayMs(value) {
    return Math.max(USER_DELAY_LIMIT_MS.min, Math.min(USER_DELAY_LIMIT_MS.max, value));
  }

  function normalizeBetweenTargetsRange(settings) {
    const range = settings && settings.betweenTargets ? settings.betweenTargets : null;
    if (!range) {
      return { ...TIMING_PROFILE.betweenTargets };
    }

    const min = Number(range.min);
    const max = Number(range.max);
    if (!Number.isFinite(min) || !Number.isFinite(max)) {
      return { ...TIMING_PROFILE.betweenTargets };
    }

    const normalizedMin = clampDelayMs(Math.round(min));
    const normalizedMax = clampDelayMs(Math.round(max));
    return {
      min: Math.min(normalizedMin, normalizedMax),
      max: Math.max(normalizedMin, normalizedMax)
    };
  }

  function cutoffForDateRange(now, value, unit) {
    const cutoff = new Date(now.getTime());
    if (unit === "years") {
      cutoff.setFullYear(cutoff.getFullYear() - value);
    } else if (unit === "months") {
      cutoff.setMonth(cutoff.getMonth() - value);
    } else {
      cutoff.setDate(cutoff.getDate() - value);
    }

    return cutoff;
  }

  function normalizeDateRange(settings) {
    const range = settings && settings.dateRange ? settings.dateRange : null;
    if (!range || range.mode !== "last") {
      return { mode: "any" };
    }

    const unit = DATE_RANGE_UNITS.includes(range.unit) ? range.unit : DEFAULT_DATE_RANGE.unit;
    const rawValue = Number(range.value);
    const roundedValue = Number.isFinite(rawValue) ? Math.round(rawValue) : DEFAULT_DATE_RANGE.value;
    const value = Math.max(1, Math.min(DATE_RANGE_LIMITS[unit], roundedValue));

    return {
      mode: "last",
      value,
      unit,
      cutoffTimestamp: cutoffForDateRange(new Date(), value, unit).getTime()
    };
  }

  function classTextFor(element) {
    if (!element || !(element instanceof Element)) {
      return "";
    }

    if (typeof element.className === "string") {
      return element.className;
    }

    if (element.className && typeof element.className.baseVal === "string") {
      return element.className.baseVal;
    }

    return element.getAttribute("class") || "";
  }

  function isDisabled(button) {
    return button.disabled || button.matches(":disabled") || button.getAttribute("aria-disabled") === "true";
  }

  function isButtonElement(element) {
    return (typeof HTMLButtonElement === "function" && element instanceof HTMLButtonElement) || element.tagName === "BUTTON";
  }

  function labelText(button) {
    return [
      button.getAttribute("aria-label"),
      button.getAttribute("title"),
      button.innerText
    ].filter(Boolean).join(" ").trim();
  }

  function isSummaryKudosButton(button) {
    if (button.getAttribute("data-testid") !== "kudos_button") {
      return false;
    }

    const label = labelText(button).toLowerCase();
    if (/view all|see all|all kudos/.test(label)) {
      return true;
    }

    return /查看所有赞|查看全部赞|查看所有讚|查看全部讚/.test(label);
  }

  function parseRgb(color) {
    const match = /^rgba?\((\d+),\s*(\d+),\s*(\d+)/i.exec(color || "");
    if (!match) {
      return null;
    }

    return {
      red: Number(match[1]),
      green: Number(match[2]),
      blue: Number(match[3])
    };
  }

  function parseHex(color) {
    const normalized = (color || "").trim().toLowerCase();
    const shortHex = /^#([0-9a-f]{3})$/i.exec(normalized);
    if (shortHex) {
      const chars = shortHex[1].split("");
      return {
        red: parseInt(chars[0] + chars[0], 16),
        green: parseInt(chars[1] + chars[1], 16),
        blue: parseInt(chars[2] + chars[2], 16)
      };
    }

    const longHex = /^#([0-9a-f]{6})$/i.exec(normalized);
    if (!longHex) {
      return null;
    }

    return {
      red: parseInt(longHex[1].slice(0, 2), 16),
      green: parseInt(longHex[1].slice(2, 4), 16),
      blue: parseInt(longHex[1].slice(4, 6), 16)
    };
  }

  function isHighlightedKudosColor(color) {
    const rgb = parseRgb(color) || parseHex(color);
    if (!rgb) {
      return false;
    }

    return rgb.red >= 210 && rgb.green >= 35 && rgb.green <= 130 && rgb.blue <= 70;
  }

  function hasFilledClassSignal(element) {
    const classes = classTextFor(element).toLowerCase();
    if (!classes) {
      return false;
    }

    const unfilledSignal = /(^|[\s_-])(empty|inactive|outline|unfilled|unselected)([\s_-]|$)/.test(classes);
    const filledSignal = /(^|[\s_-])(active|filled|has-kudos|is-kudoed|kudoed|selected)([\s_-]|$)/.test(classes);

    return filledSignal && !unfilledSignal;
  }

  function hasPressedState(button) {
    const pressed = button.getAttribute("aria-pressed");
    if (pressed === "true") {
      return true;
    }

    const selected = button.getAttribute("aria-selected");
    if (selected === "true") {
      return true;
    }

    const dataState = [
      button.getAttribute("data-state"),
      button.getAttribute("data-status"),
      button.getAttribute("data-active")
    ].filter(Boolean).join(" ").toLowerCase();

    return /active|clicked|kudoed|selected/.test(dataState) && !/inactive|unclicked|unselected/.test(dataState);
  }

  function labelIndicatesClicked(button) {
    const label = labelText(button).toLowerCase();

    return /remove|undo|already|kudoed|you gave|取消赞|取消点赞|撤销赞|撤销点赞|已点赞|你已点赞/.test(label);
  }

  function graphicLooksFilled(button) {
    const graphicNodes = Array.from(button.querySelectorAll("svg, svg *"));
    return graphicNodes.some((node) => {
      if (!(node instanceof Element)) {
        return false;
      }

      if (hasFilledClassSignal(node)) {
        return true;
      }

      const fillAttribute = (node.getAttribute("fill") || "").trim().toLowerCase();
      const computedStyle = window.getComputedStyle(node);
      const computedFill = computedStyle.fill;
      const computedColor = computedStyle.color;

      if (fillAttribute === "currentcolor") {
        return isHighlightedKudosColor(computedFill) || isHighlightedKudosColor(computedColor);
      }

      if (fillAttribute && fillAttribute !== "none" && fillAttribute !== "transparent") {
        return isHighlightedKudosColor(fillAttribute) || isHighlightedKudosColor(computedFill);
      }

      return isHighlightedKudosColor(computedFill);
    });
  }

  function isAlreadyClicked(button) {
    return hasPressedState(button) || labelIndicatesClicked(button) || hasFilledClassSignal(button) || graphicLooksFilled(button);
  }

  function isPageHidden() {
    return document.hidden || document.visibilityState === "hidden";
  }

  async function hiddenDiscoveryBackoff(metrics) {
    metrics.hiddenDiscoveryBackoffs += 1;
    metrics.hiddenSince = metrics.hiddenSince || Date.now();
    return cancellableDelay(BACKGROUND_DISCOVERY_PROFILE.hiddenDiscoveryBackoff);
  }

  function normalizeDateText(text) {
    return String(text || "").replace(/\u00a0/g, " ").replace(/\s+/g, " ").trim();
  }

  function textMatchesRecentActivityBoundary(text) {
    const normalized = normalizeDateText(text);
    if (!normalized) {
      return false;
    }

    const lower = normalized.toLowerCase();
    const hasChineseTitle =
      /\u6ca1\u6709\u66f4\u591a\u8fd1\u671f\u6d3b\u52a8/.test(normalized) ||
      /\u6c92\u6709\u66f4\u591a\u8fd1\u671f\u6d3b\u52d5/.test(normalized);
    const hasChineseHistory =
      /\u5b8c\u6574\u6d3b\u52a8\u5386\u53f2/.test(normalized) ||
      /\u5b8c\u6574\u6d3b\u52d5\u6b77\u53f2/.test(normalized);
    const hasChineseDestination =
      /\u4e2a\u4eba\u8d44\u6599/.test(normalized) ||
      /\u500b\u4eba\u8cc7\u6599/.test(normalized) ||
      /\u8bad\u7ec3\u65e5\u5386/.test(normalized) ||
      /\u8a13\u7df4\u65e5\u66c6/.test(normalized);
    const hasChineseBoundary =
      hasChineseTitle ||
      (hasChineseHistory && hasChineseDestination);
    const hasEnglishBoundary =
      /no more recent activities/.test(lower) ||
      (/full activity history/.test(lower) && (/profile/.test(lower) || /training calendar/.test(lower)));

    return hasChineseBoundary || hasEnglishBoundary;
  }

  function elementIsVisibleInViewport(element) {
    if (!element || !(element instanceof Element)) {
      return false;
    }

    const rect = element.getBoundingClientRect();
    const viewportHeight = window.innerHeight || document.documentElement.clientHeight || 0;
    const viewportWidth = window.innerWidth || document.documentElement.clientWidth || 0;

    return rect.width > 0 &&
      rect.height > 0 &&
      rect.bottom >= 0 &&
      rect.right >= 0 &&
      rect.top <= viewportHeight &&
      rect.left <= viewportWidth;
  }

  function directTextFor(element) {
    return Array.from(element.childNodes)
      .filter((node) => node.nodeType === Node.TEXT_NODE)
      .map((node) => node.textContent)
      .join(" ");
  }

  function recentActivityBoundaryText() {
    const root = document.querySelector("main") || document.body;
    if (!root) {
      return "";
    }

    const candidates = Array.from(root.querySelectorAll("p, span, div, h1, h2, h3, li"));
    for (const element of candidates) {
      if (!elementIsVisibleInViewport(element)) {
        continue;
      }

      const directText = directTextFor(element);
      const rect = element.getBoundingClientRect();
      const candidateText = directText || (rect.height <= (window.innerHeight || 800) * 1.5 ? element.textContent : "");
      if (textMatchesRecentActivityBoundary(candidateText)) {
        return normalizeDateText(candidateText);
      }
    }

    return "";
  }

  function hasRecentActivityBoundary() {
    return Boolean(recentActivityBoundaryText());
  }

  function markRecentActivityBoundary(metrics) {
    metrics.endedAtRecentActivityBoundary = true;
    metrics.recentActivityBoundarySeenAt = Date.now();
  }

  function feedEntryForButton(button) {
    return button.closest('[data-testid="web-feed-entry"], article, [class*="feed-entry"]');
  }

  function activityIdFromHref(href) {
    if (!href) {
      return "";
    }

    try {
      const parsed = new URL(href, window.location.href);
      const match = /\/activities\/(\d+)/.exec(parsed.pathname);
      return match ? match[1] : "";
    } catch (_error) {
      const match = /\/activities\/(\d+)/.exec(href);
      return match ? match[1] : "";
    }
  }

  function simpleHash(text) {
    let hash = 2166136261;
    const normalized = normalizeDateText(text);
    for (let index = 0; index < normalized.length; index += 1) {
      hash ^= normalized.charCodeAt(index);
      hash = Math.imul(hash, 16777619);
    }

    return (hash >>> 0).toString(36);
  }

  function activityFallbackText(entry, button) {
    if (!entry) {
      return "";
    }

    const dateText = activityDateTextFor(button);
    const links = Array.from(entry.querySelectorAll("a"))
      .map((link) => normalizeDateText(link.href || link.textContent))
      .filter(Boolean)
      .slice(0, 6)
      .join(" ");
    const heading = normalizeDateText((entry.querySelector("h2, h3, [data-testid*='title']") || {}).textContent);

    return normalizeDateText([dateText, heading, links].filter(Boolean).join(" "));
  }

  function activityKeyForButton(button) {
    const entry = feedEntryForButton(button);
    const searchRoot = entry || button;
    const activityLinks = Array.from(searchRoot.querySelectorAll('a[href*="/activities/"]'));

    for (const link of activityLinks) {
      const activityId = activityIdFromHref(link.getAttribute("href") || link.href);
      if (activityId) {
        return `activity:${activityId}`;
      }
    }

    const fallbackText = activityFallbackText(entry, button);
    return fallbackText ? `feed:${simpleHash(fallbackText)}` : "";
  }

  function createHandledActivityCache(entries) {
    return {
      entries,
      pendingWrites: 0
    };
  }

  function pruneHandledActivityEntries(entries) {
    if (entries.size <= ACTIVITY_CACHE_PROFILE.maxItems) {
      return entries;
    }

    return new Map(Array.from(entries.entries())
      .sort((left, right) => left[1] - right[1])
      .slice(entries.size - ACTIVITY_CACHE_PROFILE.maxItems));
  }

  async function loadHandledActivityCache(metrics) {
    const raw = await storageLocalGet(HANDLED_ACTIVITY_CACHE_KEY);
    const rawItems = raw && Array.isArray(raw.items) ? raw.items : [];
    const entries = new Map();

    rawItems.forEach((item) => {
      const key = item && item.key ? String(item.key) : "";
      const handledAt = Number(item && item.handledAt);
      if (key) {
        entries.set(key, Number.isFinite(handledAt) ? handledAt : Date.now());
      }
    });

    const cache = createHandledActivityCache(pruneHandledActivityEntries(entries));
    metrics.cacheSize = cache.entries.size;
    metrics.loadedCacheItems = cache.entries.size;
    return cache;
  }

  async function persistHandledActivityCache(cache, metrics) {
    if (!cache) {
      return false;
    }

    cache.entries = pruneHandledActivityEntries(cache.entries);
    cache.pendingWrites = 0;
    if (metrics) {
      metrics.cacheSize = cache.entries.size;
    }

    return storageLocalSet({
      [HANDLED_ACTIVITY_CACHE_KEY]: {
        version: 1,
        updatedAt: Date.now(),
        items: Array.from(cache.entries.entries()).map((entry) => ({
          key: entry[0],
          handledAt: entry[1]
        }))
      }
    });
  }

  async function markActivityHandled(cache, activityKey, metrics) {
    if (!cache || !activityKey || cache.entries.has(activityKey)) {
      return false;
    }

    cache.entries.set(activityKey, Date.now());
    cache.pendingWrites += 1;
    metrics.cachedActivitiesAdded += 1;
    metrics.cacheSize = cache.entries.size;

    if (cache.pendingWrites >= ACTIVITY_CACHE_PROFILE.flushEvery) {
      await persistHandledActivityCache(cache, metrics);
    }

    return true;
  }

  function applyTimeFromText(date, text) {
    const normalized = normalizeDateText(text);
    const amPmMatch = /(\d{1,2})(?::(\d{2}))?\s*([ap])\.?m\.?/i.exec(normalized);
    if (amPmMatch) {
      let hour = Number(amPmMatch[1]);
      const minute = Number(amPmMatch[2] || 0);
      const marker = amPmMatch[3].toLowerCase();

      if (marker === "p" && hour < 12) {
        hour += 12;
      }
      if (marker === "a" && hour === 12) {
        hour = 0;
      }
      if (hour >= 0 && hour <= 23 && minute >= 0 && minute <= 59) {
        date.setHours(hour, minute, 0, 0);
      }
      return date;
    }

    const timeMatch = /(?:\bat\b|\u4e8e|\s|^)\s*(\d{1,2}):(\d{2})/.exec(normalized);
    if (timeMatch) {
      const hour = Number(timeMatch[1]);
      const minute = Number(timeMatch[2]);
      if (hour >= 0 && hour <= 23 && minute >= 0 && minute <= 59) {
        date.setHours(hour, minute, 0, 0);
      }
    }

    return date;
  }

  function localDateForDayOffset(now, dayOffset, text) {
    const date = new Date(now.getTime());
    date.setHours(0, 0, 0, 0);
    date.setDate(date.getDate() - dayOffset);
    return applyTimeFromText(date, text);
  }

  function adjustFutureYear(date, now, hasExplicitYear) {
    if (!hasExplicitYear && date.getTime() - now.getTime() > 24 * 60 * 60 * 1000) {
      date.setFullYear(date.getFullYear() - 1);
    }

    return date;
  }

  function parseChineseAbsoluteActivityDate(text, now) {
    const match = /(?:(\d{4})\s*\u5e74)?\s*(\d{1,2})\s*\u6708\s*(\d{1,2})\s*\u65e5/.exec(text);
    if (!match) {
      return null;
    }

    const hasExplicitYear = Boolean(match[1]);
    const year = hasExplicitYear ? Number(match[1]) : now.getFullYear();
    const month = Number(match[2]);
    const day = Number(match[3]);
    const date = new Date(year, month - 1, day);

    if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) {
      return null;
    }

    date.setHours(0, 0, 0, 0);
    return adjustFutureYear(applyTimeFromText(date, text), now, hasExplicitYear);
  }

  function parseEnglishRelativeActivityDate(text, now) {
    const match = /(\d+)\s*(minute|minutes|min|mins|hour|hours|hr|hrs|day|days|week|weeks|month|months|year|years)\s*ago/i.exec(text);
    if (!match) {
      return null;
    }

    const amount = Number(match[1]);
    const unit = match[2].toLowerCase();
    if (!Number.isFinite(amount)) {
      return null;
    }

    let multiplier = 60 * 1000;
    if (unit.startsWith("hour") || unit.startsWith("hr")) {
      multiplier = 60 * 60 * 1000;
    } else if (unit.startsWith("day")) {
      multiplier = 24 * 60 * 60 * 1000;
    } else if (unit.startsWith("week")) {
      multiplier = 7 * 24 * 60 * 60 * 1000;
    } else if (unit.startsWith("month")) {
      multiplier = 30 * 24 * 60 * 60 * 1000;
    } else if (unit.startsWith("year")) {
      multiplier = 365 * 24 * 60 * 60 * 1000;
    }

    return new Date(now.getTime() - amount * multiplier);
  }

  function parseChineseRelativeActivityDate(text, now) {
    const match = /(\d+)\s*(\u5206\u949f|\u5206\u9418|\u5206|\u5c0f\u65f6|\u5c0f\u6642|\u65f6|\u6642|\u5929|\u65e5|\u5468|\u9031|\u661f\u671f|\u4e2a\u6708|\u500b\u6708|\u6708|\u5e74)\s*\u524d/.exec(text);
    if (!match) {
      return null;
    }

    const amount = Number(match[1]);
    const unit = match[2];
    if (!Number.isFinite(amount)) {
      return null;
    }

    let multiplier = 60 * 1000;
    if (/^\u5c0f\u65f6$|^\u5c0f\u6642$|^\u65f6$|^\u6642$/.test(unit)) {
      multiplier = 60 * 60 * 1000;
    } else if (/^\u5929$|^\u65e5$/.test(unit)) {
      multiplier = 24 * 60 * 60 * 1000;
    } else if (/^\u5468$|^\u9031$|^\u661f\u671f$/.test(unit)) {
      multiplier = 7 * 24 * 60 * 60 * 1000;
    } else if (/^\u4e2a\u6708$|^\u500b\u6708$|^\u6708$/.test(unit)) {
      multiplier = 30 * 24 * 60 * 60 * 1000;
    } else if (/^\u5e74$/.test(unit)) {
      multiplier = 365 * 24 * 60 * 60 * 1000;
    }

    return new Date(now.getTime() - amount * multiplier);
  }

  function parseEnglishDateFallback(text, now) {
    const cleaned = normalizeDateText(text)
      .replace(/\s*[·•].*$/, "")
      .replace(/\bat\b/ig, " ");
    const candidates = [text, cleaned];

    for (const candidate of candidates) {
      const normalized = normalizeDateText(candidate);
      if (!normalized) {
        continue;
      }

      const timestamp = Date.parse(normalized);
      if (!Number.isFinite(timestamp)) {
        continue;
      }

      const hasExplicitYear = /\b\d{4}\b/.test(normalized);
      return adjustFutureYear(new Date(timestamp), now, hasExplicitYear);
    }

    return null;
  }

  function parseActivityDate(rawText, now) {
    const text = normalizeDateText(rawText);
    const referenceTime = now || new Date();
    if (!text) {
      return null;
    }

    if (/\u4eca\u5929/i.test(text) || /\btoday\b/i.test(text)) {
      return localDateForDayOffset(referenceTime, 0, text);
    }

    if (/\u6628\u5929/i.test(text) || /\byesterday\b/i.test(text)) {
      return localDateForDayOffset(referenceTime, 1, text);
    }

    return parseChineseAbsoluteActivityDate(text, referenceTime) ||
      parseEnglishRelativeActivityDate(text, referenceTime) ||
      parseChineseRelativeActivityDate(text, referenceTime) ||
      parseEnglishDateFallback(text, referenceTime);
  }

  function activityDateTextFor(button) {
    const entry = button.closest('[data-testid="web-feed-entry"]');
    const dateNode = entry ? entry.querySelector('time[data-testid="date_at_time"], time') : null;
    if (!dateNode) {
      return "";
    }

    return normalizeDateText(dateNode.getAttribute("datetime") || dateNode.textContent);
  }

  function dateFilterStatusForButton(button, dateRange) {
    if (!dateRange || dateRange.mode !== "last") {
      return "include";
    }

    const activityDate = parseActivityDate(activityDateTextFor(button));
    if (!activityDate) {
      return "unknown";
    }

    return activityDate.getTime() >= dateRange.cutoffTimestamp ? "include" : "out-of-date";
  }

  function pageScrollY() {
    return window.scrollY || window.pageYOffset || document.documentElement.scrollTop || 0;
  }

  function dispatchWheelGesture(deltaY) {
    const clientX = randomInteger(Math.floor(window.innerWidth * 0.38), Math.floor(window.innerWidth * 0.62));
    const clientY = randomInteger(Math.floor(window.innerHeight * 0.34), Math.floor(window.innerHeight * 0.68));

    document.dispatchEvent(new WheelEvent("wheel", {
      bubbles: true,
      cancelable: true,
      composed: true,
      view: window,
      deltaX: 0,
      deltaY,
      deltaMode: 0,
      clientX,
      clientY
    }));
  }

  function scrollStepToward(button, desiredTop) {
    const rect = button.getBoundingClientRect();
    const distance = rect.top - desiredTop;

    if (Math.abs(distance) < randomInteger(22, 58)) {
      return true;
    }

    const direction = Math.sign(distance);
    const magnitude = Math.min(Math.abs(distance), randomInteger(90, 360));
    const eased = Math.max(18, Math.round(magnitude * randomFloat(0.48, 0.96)));
    const deltaY = direction * eased;
    const beforeY = pageScrollY();

    dispatchWheelGesture(deltaY);
    window.scrollBy({
      top: deltaY,
      left: 0,
      behavior: "auto"
    });

    return Math.abs(pageScrollY() - beforeY) < 1 && Math.abs(distance) < 140;
  }

  async function scrollForMoreFeedItems() {
    const beforeY = pageScrollY();
    const beforeHeight = document.documentElement.scrollHeight || document.body.scrollHeight || 0;
    const viewportHeight = window.innerHeight || document.documentElement.clientHeight || 800;
    const scrollDistance = randomInteger(Math.floor(viewportHeight * 0.75), Math.floor(viewportHeight * 1.35));

    dispatchWheelGesture(scrollDistance);
    window.scrollBy({
      top: scrollDistance,
      left: 0,
      behavior: "auto"
    });

    if (!(await cancellableDelay(TIMING_PROFILE.feedLoadSettle))) {
      return false;
    }

    const afterY = pageScrollY();
    const afterHeight = document.documentElement.scrollHeight || document.body.scrollHeight || 0;
    return Math.abs(afterY - beforeY) > 4 || afterHeight > beforeHeight;
  }

  function interactionPointFor(element) {
    const rect = element.getBoundingClientRect();
    const horizontalInset = Math.min(rect.width * 0.22, 10);
    const verticalInset = Math.min(rect.height * 0.22, 10);
    const minX = rect.left + horizontalInset;
    const maxX = rect.right - horizontalInset;
    const minY = rect.top + verticalInset;
    const maxY = rect.bottom - verticalInset;

    return {
      clientX: Math.round(randomInteger(Math.floor(minX), Math.ceil(maxX))),
      clientY: Math.round(randomInteger(Math.floor(minY), Math.ceil(maxY)))
    };
  }

  function dispatchMouseEvent(element, type, point, buttons) {
    element.dispatchEvent(new MouseEvent(type, {
      bubbles: true,
      cancelable: true,
      composed: true,
      view: window,
      clientX: point.clientX,
      clientY: point.clientY,
      screenX: window.screenX + point.clientX,
      screenY: window.screenY + point.clientY,
      button: 0,
      buttons
    }));
  }

  function dispatchPointerEvent(element, type, point, buttons) {
    if (typeof window.PointerEvent !== "function") {
      return;
    }

    element.dispatchEvent(new PointerEvent(type, {
      bubbles: true,
      cancelable: true,
      composed: true,
      pointerId: 1,
      pointerType: "mouse",
      isPrimary: true,
      view: window,
      clientX: point.clientX,
      clientY: point.clientY,
      screenX: window.screenX + point.clientX,
      screenY: window.screenY + point.clientY,
      button: 0,
      buttons
    }));
  }

  function dispatchPointerAndMouse(element, type, point, buttons) {
    dispatchPointerEvent(element, `pointer${type}`, point, buttons);
    dispatchMouseEvent(element, `mouse${type}`, point, buttons);
  }

  async function humanScrollToElement(button) {
    if (!(await cancellableDelay(TIMING_PROFILE.preScrollLook))) {
      return false;
    }

    const desiredTop = randomInteger(Math.floor(window.innerHeight * 0.34), Math.floor(window.innerHeight * 0.58));

    for (let stepCount = 0; stepCount < 32; stepCount += 1) {
      if (runState.cancelRequested || !button.isConnected) {
        return false;
      }

      const arrived = scrollStepToward(button, desiredTop);
      if (arrived) {
        break;
      }

      if (!(await cancellableDelay(TIMING_PROFILE.scrollStepPause))) {
        return false;
      }

      if (chance(0.18) && !(await cancellableDelay(TIMING_PROFILE.scrollHesitation))) {
        return false;
      }
    }

    return cancellableDelay(TIMING_PROFILE.scrollSettle);
  }

  async function performHumanPacedClick(button) {
    const point = interactionPointFor(button);

    dispatchPointerAndMouse(button, "over", point, 0);
    dispatchPointerAndMouse(button, "move", point, 0);

    if (!(await cancellableDelay(TIMING_PROFILE.preClickDwell))) {
      return false;
    }

    try {
      button.focus({ preventScroll: true });
    } catch (_error) {
      button.focus();
    }

    dispatchPointerAndMouse(button, "down", point, 1);
    if (!(await cancellableDelay(TIMING_PROFILE.pressHold))) {
      dispatchPointerAndMouse(button, "up", point, 0);
      return false;
    }
    dispatchPointerAndMouse(button, "up", point, 0);

    if (runState.cancelRequested) {
      return false;
    }

    button.click();

    return cancellableDelay(TIMING_PROFILE.postClickDwell);
  }

  function getCandidateButtons() {
    return Array.from(document.querySelectorAll(TARGET_SELECTOR)).filter((button) => {
      return isButtonElement(button) && !isDisabled(button) && !isSummaryKudosButton(button);
    });
  }

  function getUnprocessedCandidateButtons(processedButtons, handledCache, metrics) {
    const buttons = [];
    let sawCandidate = false;
    let skippedCached = 0;

    getCandidateButtons().forEach((button) => {
      if (processedButtons.has(button)) {
        return;
      }

      sawCandidate = true;
      const activityKey = activityKeyForButton(button);
      if (activityKey && handledCache && handledCache.entries.has(activityKey)) {
        processedButtons.add(button);
        skippedCached += 1;
        return;
      }

      buttons.push(button);
    });

    if (skippedCached > 0) {
      metrics.skippedCached += skippedCached;
    }

    return {
      buttons,
      sawCandidate,
      skippedCached
    };
  }

  function isLoginPage() {
    const path = window.location.pathname.toLowerCase();
    if (path === "/login" || path.startsWith("/login/") || path === "/register" || path.startsWith("/register/")) {
      return true;
    }

    const loginForm = document.querySelector('form[action*="/login"], input[type="password"], input[name="email"]');
    const pageText = document.body ? document.body.innerText.toLowerCase() : "";
    return Boolean(loginForm && /log in|login|sign in|password/.test(pageText));
  }

  function detectLoginState() {
    const loggedOut = isLoginPage();
    return {
      loggedIn: !loggedOut,
      loggedOut,
      url: window.location.href
    };
  }

  function createMetrics(scanned, betweenTargets, dateRange) {
    return {
      scanned,
      clicked: 0,
      skippedAlreadyClicked: 0,
      skippedDisabled: 0,
      skippedMissing: 0,
      skippedOutOfDate: 0,
      skippedUnknownDate: 0,
      skippedCached: 0,
      errors: 0,
      stopped: false,
      stopRequestedAt: null,
      discoveryScrolls: 0,
      idleDiscoveryAttempts: 0,
      cappedBySafetyLimit: false,
      endedAtRecentActivityBoundary: false,
      recentActivityBoundarySeenAt: null,
      autoRefreshPending: false,
      refreshes: 0,
      refreshesWithoutNewWork: 0,
      cappedByRefreshLimit: false,
      resumedAfterRefresh: false,
      resumeCount: 0,
      loadedCacheItems: 0,
      cachedActivitiesAdded: 0,
      cacheSize: 0,
      hiddenDiscoveryBackoffs: 0,
      hiddenSince: null,
      delayRangeMs: betweenTargets,
      dateRange,
      startedAt: Date.now(),
      finishedAt: null,
      durationMs: null
    };
  }

  async function processButton(button, metrics, dateRange, handledCache) {
    if (runState.cancelRequested) {
      return false;
    }

    const activityKey = activityKeyForButton(button);

    if (!button.isConnected) {
      metrics.skippedMissing += 1;
      return true;
    }

    if (isDisabled(button)) {
      metrics.skippedDisabled += 1;
      return true;
    }

    if (isAlreadyClicked(button)) {
      metrics.skippedAlreadyClicked += 1;
      await markActivityHandled(handledCache, activityKey, metrics);
      return true;
    }

    const dateFilterStatus = dateFilterStatusForButton(button, dateRange);
    if (dateFilterStatus === "out-of-date") {
      metrics.skippedOutOfDate += 1;
      return true;
    }
    if (dateFilterStatus === "unknown") {
      metrics.skippedUnknownDate += 1;
      return true;
    }

    if (!(await humanScrollToElement(button))) {
      return false;
    }

    if (!button.isConnected) {
      metrics.skippedMissing += 1;
      return true;
    }

    if (isDisabled(button)) {
      metrics.skippedDisabled += 1;
      return true;
    }

    if (isAlreadyClicked(button)) {
      metrics.skippedAlreadyClicked += 1;
      await markActivityHandled(handledCache, activityKey, metrics);
      return true;
    }

    const settledDateFilterStatus = dateFilterStatusForButton(button, dateRange);
    if (settledDateFilterStatus === "out-of-date") {
      metrics.skippedOutOfDate += 1;
      return true;
    }
    if (settledDateFilterStatus === "unknown") {
      metrics.skippedUnknownDate += 1;
      return true;
    }

    if (!(await performHumanPacedClick(button))) {
      return false;
    }

    metrics.clicked += 1;
    await markActivityHandled(handledCache, activityKey, metrics);
    return true;
  }

  function statusResult() {
    return {
      ok: true,
      state: {
        running: runState.running,
        cancelRequested: runState.cancelRequested,
        pageHidden: isPageHidden(),
        login: detectLoginState(),
        metrics: runState.activeMetrics || runState.lastMetrics
      }
    };
  }

  function stopKudosSequence() {
    if (!runState.running) {
      return {
        ok: false,
        message: "No kudos sequence is running.",
        state: statusResult().state
      };
    }

    runState.cancelRequested = true;
    if (runState.activeMetrics && !runState.activeMetrics.stopRequestedAt) {
      runState.activeMetrics.stopRequestedAt = Date.now();
    }

    return {
      ok: true,
      message: "Stop requested. The sequence will stop before the next kudos click.",
      state: statusResult().state
    };
  }

  function serializableMetrics(metrics) {
    return {
      ...metrics,
      autoRefreshPending: false,
      finishedAt: null,
      durationMs: null
    };
  }

  function resumeRecordIsFresh(record) {
    const requestedAt = Number(record && record.requestedAt);
    return Boolean(record && record.pending) &&
      Number.isFinite(requestedAt) &&
      Date.now() - requestedAt <= AUTO_REFRESH_PROFILE.resumeTtlMs;
  }

  function resumeMetrics(record, betweenTargets, dateRange) {
    const restored = {
      ...createMetrics(0, betweenTargets, dateRange),
      ...(record && record.metrics ? record.metrics : {})
    };

    restored.delayRangeMs = betweenTargets;
    restored.dateRange = dateRange;
    restored.autoRefreshPending = false;
    restored.resumedAfterRefresh = true;
    restored.resumeCount = Number(restored.resumeCount || 0) + 1;
    restored.finishedAt = null;
    restored.durationMs = null;

    return restored;
  }

  async function clearStoredResumeRun() {
    await storageLocalRemove(RESUME_RUN_KEY);
  }

  async function storeResumeRun(settings, metrics) {
    return storageLocalSet({
      [RESUME_RUN_KEY]: {
        version: 1,
        pending: true,
        requestedAt: Date.now(),
        url: window.location.href,
        settings: settings || null,
        metrics: serializableMetrics(metrics)
      }
    });
  }

  function shouldRefreshAfterBatch(metrics, pageMadeWork) {
    if (metrics.refreshes >= AUTO_REFRESH_PROFILE.maxRefreshes) {
      metrics.cappedByRefreshLimit = true;
      return false;
    }

    if (pageMadeWork) {
      metrics.refreshesWithoutNewWork = 0;
      return true;
    }

    if (metrics.refreshesWithoutNewWork < AUTO_REFRESH_PROFILE.maxNoNewWorkRefreshes) {
      metrics.refreshesWithoutNewWork += 1;
      return true;
    }

    return false;
  }

  async function requestPageRefresh(metrics, settings, handledCache, pageMadeWork) {
    if (!shouldRefreshAfterBatch(metrics, pageMadeWork)) {
      return false;
    }

    metrics.refreshes += 1;
    metrics.autoRefreshPending = true;
    await persistHandledActivityCache(handledCache, metrics);
    await storeResumeRun(settings, metrics);

    window.setTimeout(() => {
      window.location.reload();
    }, 250);

    return true;
  }

  function finalizeRunMetrics(metrics) {
    metrics.stopped = runState.cancelRequested;
    metrics.finishedAt = Date.now();
    metrics.durationMs = metrics.finishedAt - metrics.startedAt;
    runState.lastMetrics = metrics;
    runState.running = false;
    runState.cancelRequested = false;
    runState.activeMetrics = null;
    if (!metrics.autoRefreshPending) {
      clearStoredResumeRun();
    }
  }

  async function executeKudosSequence(metrics, paceState, processedButtons, dateRange, settings) {
    let idleScrollAttempts = 0;
    let pageTouchedFeed = false;
    let pageMadeWork = false;
    let handledCache = null;

    try {
      handledCache = await loadHandledActivityCache(metrics);

      while (!runState.cancelRequested) {
        if (metrics.scanned >= DISCOVERY_PROFILE.maxProcessedButtons) {
          metrics.cappedBySafetyLimit = true;
          break;
        }

        const candidateResult = getUnprocessedCandidateButtons(processedButtons, handledCache, metrics);
        const buttons = candidateResult.buttons;
        if (candidateResult.sawCandidate || candidateResult.skippedCached > 0) {
          pageTouchedFeed = true;
        }

        if (buttons.length === 0) {
          if (hasRecentActivityBoundary()) {
            markRecentActivityBoundary(metrics);
            break;
          }

          if (pageTouchedFeed) {
            if (await requestPageRefresh(metrics, settings, handledCache, pageMadeWork)) {
              break;
            }

            break;
          }

          if (idleScrollAttempts >= DISCOVERY_PROFILE.maxIdleScrollAttempts) {
            break;
          }

          metrics.discoveryScrolls += 1;
          const madeProgress = await scrollForMoreFeedItems();
          if (runState.cancelRequested) {
            break;
          }

          if (hasRecentActivityBoundary()) {
            markRecentActivityBoundary(metrics);
            break;
          }

          if (madeProgress) {
            idleScrollAttempts = 0;
            metrics.idleDiscoveryAttempts = 0;
            continue;
          }

          if (isPageHidden()) {
            if (!(await hiddenDiscoveryBackoff(metrics))) {
              break;
            }
            continue;
          }

          idleScrollAttempts += 1;
          metrics.idleDiscoveryAttempts = idleScrollAttempts;
          continue;
        }

        idleScrollAttempts = 0;
        metrics.idleDiscoveryAttempts = 0;

        const button = buttons[0];
        processedButtons.add(button);
        metrics.scanned += 1;
        pageTouchedFeed = true;

        if (runState.cancelRequested) {
          break;
        }

        try {
          const beforeClicked = metrics.clicked;
          const beforeCachedActivities = metrics.cachedActivitiesAdded;
          await processButton(button, metrics, dateRange, handledCache);
          if (metrics.clicked > beforeClicked || metrics.cachedActivitiesAdded > beforeCachedActivities) {
            pageMadeWork = true;
          }
        } catch (_error) {
          metrics.errors += 1;
        }

        if (runState.cancelRequested) {
          break;
        }

        if (!(await pauseBetweenTargets(paceState))) {
          break;
        }
      }
    } catch (error) {
      metrics.errors += 1;
      metrics.errorMessage = error && error.message ? error.message : "Kudos sequence failed.";
    } finally {
      if (handledCache) {
        await persistHandledActivityCache(handledCache, metrics);
      }
      finalizeRunMetrics(metrics);
    }
  }

  function startKudosSequence(settings, resumeRecord) {
    if (runState.running) {
      return {
        ok: false,
        message: "Kudos sequence is already running.",
        state: statusResult().state,
        metrics: runState.activeMetrics
      };
    }

    runState.running = true;
    runState.cancelRequested = false;

    const login = detectLoginState();
    if (!login.loggedIn) {
      runState.running = false;
      return {
        ok: false,
        message: "Please log in to Strava before using this extension.",
        login,
        metrics: null
      };
    }

    const betweenTargets = normalizeBetweenTargetsRange(settings);
    const dateRange = normalizeDateRange(settings);
    const metrics = resumeRecord ? resumeMetrics(resumeRecord, betweenTargets, dateRange) : createMetrics(0, betweenTargets, dateRange);
    const paceState = createPaceState();
    const processedButtons = new WeakSet();
    paceState.betweenTargets = betweenTargets;
    runState.activeMetrics = metrics;

    executeKudosSequence(metrics, paceState, processedButtons, dateRange, settings);

    return {
      ok: true,
      started: true,
      message: "Kudos sequence started.",
      state: statusResult().state,
      metrics
    };
  }

  async function resumeKudosAfterRefresh() {
    const record = await storageLocalGet(RESUME_RUN_KEY);
    if (!resumeRecordIsFresh(record)) {
      if (record) {
        await clearStoredResumeRun();
      }
      return;
    }

    if (runState.running || !detectLoginState().loggedIn) {
      return;
    }

    if (!(await cancellableDelay(AUTO_REFRESH_PROFILE.resumeSettle))) {
      return;
    }

    startKudosSequence(record.settings, record);
  }

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (!message || !message.action) {
      return false;
    }

    if (message.action === ACTION_STATUS_KUDOS) {
      sendResponse(statusResult());
      return false;
    }

    if (message.action === ACTION_STOP_KUDOS) {
      sendResponse(stopKudosSequence());
      return false;
    }

    if (message.action !== ACTION_RUN_KUDOS) {
      return false;
    }

    sendResponse(startKudosSequence(message.settings));
    return false;
  });

  resumeKudosAfterRefresh();
})();
