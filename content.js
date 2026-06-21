(() => {
  "use strict";

  if (window.__stravaAutoKudosContentLoaded) return;
  window.__stravaAutoKudosContentLoaded = true;

  const ACTION_RUN_KUDOS = "STRAVA_AUTO_KUDOS_RUN";
  const ACTION_STOP_KUDOS = "STRAVA_AUTO_KUDOS_STOP";
  const ACTION_STATUS_KUDOS = "STRAVA_AUTO_KUDOS_STATUS";
  const HANDLED_ACTIVITY_CACHE_KEY = "stravaAutoKudosHandledActivityCacheV1";
  const COMMENT_CACHE_KEY = "stravaAutoKudosCommentCacheV1";
  const RESUME_RUN_KEY = "stravaAutoKudosResumeRunV1";
  const SETTINGS_KEY = "stravaAutoKudosSettingsV2";
  const CONNECTION_WHITELIST_KEY = "stravaAutoKudosConnectionWhitelistV1";
  const CONNECTION_WHITELIST_TTL_MS = 24 * 60 * 60 * 1000;
  const CURRENT_USER_ID_KEY = "stravaAutoKudosCurrentUserId";
  const ALARM_NAME = "stravaAutoKudosAlarm";
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
    feedLoadSettle: { min: 900, max: 1800 },
    autoStartSettle: { min: 1200, max: 3000 }
  });
  const USER_DELAY_LIMIT_MS = Object.freeze({ min: 800, max: 120000 });
  const DEFAULT_DATE_RANGE = Object.freeze({ value: 7, unit: "days" });
  const DEFAULT_RELATIONSHIP_FILTER = Object.freeze({ mode: "connected" });
  const DEFAULT_COMPLIMENT_MODE = "off";
  const RELATIONSHIP_FILTER_MODES = Object.freeze(["connected", "any"]);
  const COMPLIMENT_MODES = Object.freeze(["off", "race-pr"]);
  const COMPLIMENT_MESSAGES = Object.freeze([
    "Huge PR. Congrats!",
    "Strong race, well earned PR.",
    "That PR is solid. Nice work!",
    "Big result. Congrats on the PR!"
  ]);
  const DATE_RANGE_UNITS = Object.freeze(["days", "months", "years"]);
  const DATE_RANGE_LIMITS = Object.freeze({ days: 3650, months: 120, years: 10 });
  const BACKGROUND_DISCOVERY_PROFILE = Object.freeze({ hiddenDiscoveryBackoff: { min: 2500, max: 5500 } });
  const ACTIVITY_CACHE_PROFILE = Object.freeze({ maxItems: 2500, flushEvery: 5 });
  const AUTO_REFRESH_PROFILE = Object.freeze({ resumeTtlMs: 30 * 60 * 1000, resumeSettle: { min: 1600, max: 3200 } });
  const MAX_IDLE_DISCOVERY_ATTEMPTS = 8;
  const MAX_AUTO_REFRESHES = 3;

  const runState = {
    running: false,
    cancelRequested: false,
    activeMetrics: null,
    lastMetrics: null,
    isAutoMode: false
  };

  function sleep(ms) { return new Promise((resolve) => { window.setTimeout(resolve, ms); }); }
  function randomInteger(min, max) { return Math.floor(Math.random() * (max - min + 1)) + min; }
  function randomFloat(min, max) { return Math.random() * (max - min) + min; }
  function chance(probability) { return Math.random() < probability; }
  function randomDelay(range) { return sleep(randomInteger(range.min, range.max)); }

  function storageLocalGet(key) {
    return new Promise((resolve) => {
      if (typeof chrome === "undefined" || !chrome.storage || !chrome.storage.local) { resolve(null); return; }
      chrome.storage.local.get(key, (items) => {
        if (chrome.runtime.lastError) { resolve(null); return; }
        resolve(items ? items[key] : null);
      });
    });
  }

  function storageLocalSet(items) {
    return new Promise((resolve) => {
      if (typeof chrome === "undefined" || !chrome.storage || !chrome.storage.local) { resolve(false); return; }
      chrome.storage.local.set(items, () => { resolve(!chrome.runtime.lastError); });
    });
  }

  function storageLocalRemove(key) {
    return new Promise((resolve) => {
      if (typeof chrome === "undefined" || !chrome.storage || !chrome.storage.local) { resolve(false); return; }
      chrome.storage.local.remove(key, () => { resolve(!chrome.runtime.lastError); });
    });
  }

  async function cancellableDelay(range) {
    const total = randomInteger(range.min, range.max);
    const startedAt = Date.now();
    while (Date.now() - startedAt < total) {
      if (runState.cancelRequested) return false;
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
    if (!(await cancellableDelay(paceState.betweenTargets))) return false;
    paceState.interactionsUntilLongPause -= 1;
    if (paceState.interactionsUntilLongPause > 0) return true;
    paceState.interactionsUntilLongPause = randomInteger(TIMING_PROFILE.longPauseEvery.min, TIMING_PROFILE.longPauseEvery.max);
    return cancellableDelay(TIMING_PROFILE.longPause);
  }

  function clampDelayMs(value) { return Math.max(USER_DELAY_LIMIT_MS.min, Math.min(USER_DELAY_LIMIT_MS.max, value)); }

  function normalizeBetweenTargetsRange(settings) {
    const range = settings && settings.betweenTargets ? settings.betweenTargets : null;
    if (!range) return { ...TIMING_PROFILE.betweenTargets };
    const min = Number(range.min);
    const max = Number(range.max);
    if (!Number.isFinite(min) || !Number.isFinite(max)) return { ...TIMING_PROFILE.betweenTargets };
    const normalizedMin = clampDelayMs(Math.round(min));
    const normalizedMax = clampDelayMs(Math.round(max));
    return { min: Math.min(normalizedMin, normalizedMax), max: Math.max(normalizedMin, normalizedMax) };
  }

  function cutoffForDateRange(now, value, unit) {
    const cutoff = new Date(now.getTime());
    if (unit === "years") cutoff.setFullYear(cutoff.getFullYear() - value);
    else if (unit === "months") cutoff.setMonth(cutoff.getMonth() - value);
    else cutoff.setDate(cutoff.getDate() - value);
    return cutoff;
  }

  function normalizeDateRange(settings) {
    const range = settings && settings.dateRange ? settings.dateRange : null;
    if (!range || range.mode !== "last") return { mode: "any" };
    const unit = DATE_RANGE_UNITS.includes(range.unit) ? range.unit : DEFAULT_DATE_RANGE.unit;
    const rawValue = Number(range.value);
    const roundedValue = Number.isFinite(rawValue) ? Math.round(rawValue) : DEFAULT_DATE_RANGE.value;
    const value = Math.max(1, Math.min(DATE_RANGE_LIMITS[unit], roundedValue));
    return { mode: "last", value, unit, cutoffTimestamp: cutoffForDateRange(new Date(), value, unit).getTime() };
  }

  function normalizeRelationshipFilter(settings) {
    const filter = settings && settings.relationshipFilter ? settings.relationshipFilter : null;
    const mode = filter && RELATIONSHIP_FILTER_MODES.includes(filter.mode) ? filter.mode : DEFAULT_RELATIONSHIP_FILTER.mode;
    return { mode };
  }

  function normalizeComplimentMode(settings) {
    const mode = settings && COMPLIMENT_MODES.includes(settings.complimentMode) ? settings.complimentMode : DEFAULT_COMPLIMENT_MODE;
    return { mode };
  }

  function classTextFor(element) {
    if (!element || !(element instanceof Element)) return "";
    if (typeof element.className === "string") return element.className;
    if (element.className && typeof element.className.baseVal === "string") return element.className.baseVal;
    return element.getAttribute("class") || "";
  }

  function isDisabled(button) { return button.disabled || button.matches(":disabled") || button.getAttribute("aria-disabled") === "true"; }
  function isButtonElement(element) { return (typeof HTMLButtonElement === "function" && element instanceof HTMLButtonElement) || element.tagName === "BUTTON"; }

  function labelText(button) {
    return [button.getAttribute("aria-label"), button.getAttribute("title"), button.innerText].filter(Boolean).join(" ").trim();
  }

  function isSummaryKudosButton(button) {
    if (button.getAttribute("data-testid") !== "kudos_button") return false;
    const label = labelText(button).toLowerCase();
    return /view all|see all|all kudos/.test(label) || /\u67e5\u770b.*[\u70b9\u8d5e\u8b9a\u讚]|[\u70b9\u8d5e\u8b9a\u讚].*\u8be6\u60c5/.test(label);
  }

  function isKudosDetailNavigationButton(button) {
    if (button.getAttribute("data-testid") !== "kudos_button") return false;
    const label = labelText(button).toLowerCase();
    const navigationTarget = [
      button.getAttribute("href"),
      button.getAttribute("data-url"),
      button.getAttribute("data-href"),
      button.getAttribute("data-target"),
      button.closest("a") && (button.closest("a").getAttribute("href") || button.closest("a").href)
    ].filter(Boolean).join(" ").toLowerCase();
    if (/presentation|detail|kudos|\/activities\/\d+/.test(navigationTarget)) return true;
    if (/presentation|detail|\bview\b.*\bkudos\b|\bkudos\b.*\bdetail\b/.test(label)) return true;
    if (/\u67e5\u770b.*[\u70b9\u8d5e\u8b9a\u讚]|[\u70b9\u8d5e\u8b9a\u讚].*\u8be6\u60c5|^\d+\s*[\u70b9\u8d5e\u8b9a\u讚]/.test(label)) return true;
    return false;
  }

  function isKudosInspectorButton(button) {
    if (button.getAttribute("data-testid") !== "kudos_button") return false;
    const label = labelText(button).toLowerCase();
    if (isSummaryKudosButton(button)) return true;
    if (isKudosDetailNavigationButton(button)) return true;
    const modalTarget = [
      button.getAttribute("aria-controls"),
      button.getAttribute("aria-describedby"),
      button.getAttribute("aria-labelledby")
    ].filter(Boolean).join(" ").toLowerCase();
    if (button.getAttribute("aria-haspopup") || modalTarget.includes("kudos-comments-modal-title")) return true;
    if (/gave kudos|who gave kudos|kudos from|and \d+ others?|^\d+\s+kudos?$/.test(label)) return true;

    const visibleText = (button.innerText || button.textContent || "").trim();
    const hasActionIntent = /\bgive\b|\bremove\b|\bundo\b|\bkudoed\b|you gave|kudos|取消|撤销|點讚|点赞|赞|讚/.test(label);
    // Strava can render this inspector as a button labelled with the first athlete, e.g. "Smvoy".
    return Boolean(visibleText && !hasActionIntent);
  }

  function parseRgb(color) {
    const match = /^rgba?\((\d+),\s*(\d+),\s*(\d+)/i.exec(color || "");
    if (!match) return null;
    return { red: Number(match[1]), green: Number(match[2]), blue: Number(match[3]) };
  }

  function parseHex(color) {
    const normalized = (color || "").trim().toLowerCase();
    const shortHex = /^#([0-9a-f]{3})$/i.exec(normalized);
    if (shortHex) {
      const chars = shortHex[1].split("");
      return { red: parseInt(chars[0] + chars[0], 16), green: parseInt(chars[1] + chars[1], 16), blue: parseInt(chars[2] + chars[2], 16) };
    }
    const longHex = /^#([0-9a-f]{6})$/i.exec(normalized);
    if (!longHex) return null;
    return { red: parseInt(longHex[1].slice(0, 2), 16), green: parseInt(longHex[1].slice(2, 4), 16), blue: parseInt(longHex[1].slice(4, 6), 16) };
  }

  function isHighlightedKudosColor(color) {
    const rgb = parseRgb(color) || parseHex(color);
    if (!rgb) return false;
    return rgb.red >= 210 && rgb.green >= 35 && rgb.green <= 130 && rgb.blue <= 70;
  }

  function hasFilledClassSignal(element) {
    const classes = classTextFor(element).toLowerCase();
    if (!classes) return false;
    const unfilledSignal = /(^|[\s_-])(empty|inactive|outline|unfilled|unselected)([\s_-]|$)/.test(classes);
    const filledSignal = /(^|[\s_-])(active|filled|has-kudos|is-kudoed|kudoed|selected)([\s_-]|$)/.test(classes);
    return filledSignal && !unfilledSignal;
  }

  function hasPressedState(button) {
    if (button.getAttribute("aria-pressed") === "true") return true;
    if (button.getAttribute("aria-selected") === "true") return true;
    const dataState = [button.getAttribute("data-state"), button.getAttribute("data-status"), button.getAttribute("data-active")].filter(Boolean).join(" ").toLowerCase();
    return /active|clicked|kudoed|selected/.test(dataState) && !/inactive|unclicked|unselected/.test(dataState);
  }

  function labelIndicatesClicked(button) {
    const label = labelText(button).toLowerCase();
    return /remove|undo|already|kudoed|you gave|取消赞|取消点赞|撤销赞|撤销点赞|已点赞|你已点赞/.test(label);
  }

  function graphicLooksFilled(button) {
    const graphicNodes = Array.from(button.querySelectorAll("svg, svg *"));
    return graphicNodes.some((node) => {
      if (!(node instanceof Element)) return false;
      if (hasFilledClassSignal(node)) return true;
      const fillAttribute = (node.getAttribute("fill") || "").trim().toLowerCase();
      const computedStyle = window.getComputedStyle(node);
      const computedFill = computedStyle.fill;
      const computedColor = computedStyle.color;
      if (fillAttribute === "currentcolor") return isHighlightedKudosColor(computedFill) || isHighlightedKudosColor(computedColor);
      if (fillAttribute && fillAttribute !== "none" && fillAttribute !== "transparent") return isHighlightedKudosColor(fillAttribute) || isHighlightedKudosColor(computedFill);
      return isHighlightedKudosColor(computedFill);
    });
  }

  function isAlreadyClicked(button) {
    return hasPressedState(button) || labelIndicatesClicked(button) || hasFilledClassSignal(button) || graphicLooksFilled(button);
  }

  function isPageHidden() { return document.hidden || document.visibilityState === "hidden"; }

  async function hiddenDiscoveryBackoff(metrics) {
    metrics.hiddenDiscoveryBackoffs += 1;
    metrics.hiddenSince = metrics.hiddenSince || Date.now();
    return cancellableDelay(BACKGROUND_DISCOVERY_PROFILE.hiddenDiscoveryBackoff);
  }

  function normalizeDateText(text) { return String(text || "").replace(/ /g, " ").replace(/\s+/g, " ").trim(); }

  function textMatchesRecentActivityBoundary(text) {
    const normalized = normalizeDateText(text);
    if (!normalized) return false;
    const lower = normalized.toLowerCase();
    const hasChineseTitle = /没有更多近期活动/.test(normalized) || /沒有更多近期活動/.test(normalized);
    const hasChineseHistory = /完整活动历史/.test(normalized) || /完整活動歷史/.test(normalized);
    const hasChineseDestination = /个人资料/.test(normalized) || /個人資料/.test(normalized) || /训练日历/.test(normalized) || /訓練日曆/.test(normalized);
    const hasChineseBoundary = hasChineseTitle || (hasChineseHistory && hasChineseDestination);
    const hasEnglishBoundary = /no more recent activities/.test(lower) || (/full activity history/.test(lower) && (/profile/.test(lower) || /training calendar/.test(lower)));
    return hasChineseBoundary || hasEnglishBoundary;
  }

  function elementIsVisibleInViewport(element) {
    if (!element || !(element instanceof Element)) return false;
    const rect = element.getBoundingClientRect();
    const viewportHeight = window.innerHeight || document.documentElement.clientHeight || 0;
    const viewportWidth = window.innerWidth || document.documentElement.clientWidth || 0;
    return rect.width > 0 && rect.height > 0 && rect.bottom >= 0 && rect.right >= 0 && rect.top <= viewportHeight && rect.left <= viewportWidth;
  }

  function directTextFor(element) {
    return Array.from(element.childNodes).filter((node) => node.nodeType === Node.TEXT_NODE).map((node) => node.textContent).join(" ");
  }

  function recentActivityBoundaryText() {
    const root = document.querySelector("main") || document.body;
    if (!root) return "";
    const candidates = Array.from(root.querySelectorAll("p, span, div, h1, h2, h3, li"));
    for (const element of candidates) {
      if (!elementIsVisibleInViewport(element)) continue;
      const directText = directTextFor(element);
      const rect = element.getBoundingClientRect();
      const candidateText = directText || (rect.height <= (window.innerHeight || 800) * 1.5 ? element.textContent : "");
      if (textMatchesRecentActivityBoundary(candidateText)) return normalizeDateText(candidateText);
    }
    return "";
  }

  function hasRecentActivityBoundary() { return Boolean(recentActivityBoundaryText()); }

  function setCurrentStatus(metrics, key, message) { metrics.currentStatusKey = key; metrics.currentStatus = message; }

  function markRecentActivityBoundary(metrics) {
    metrics.endedAtRecentActivityBoundary = true;
    metrics.recentActivityBoundarySeenAt = Date.now();
    setCurrentStatus(metrics, "runStatusRecentBoundary", "Reached Strava recent-activity boundary.");
  }

  function markDateRangeBoundary(metrics, dateText) {
    metrics.endedAtDateBoundary = true;
    metrics.dateBoundarySeenAt = Date.now();
    metrics.dateBoundaryText = normalizeDateText(dateText);
    setCurrentStatus(metrics, "runStatusDateBoundary", "Reached the configured activity-date boundary.");
  }

  function feedEntryForButton(button) { return button.closest('[data-testid="web-feed-entry"], article, [class*="feed-entry"]'); }

  function feedEntryTextForButton(button) {
    const entry = feedEntryForButton(button);
    return normalizeDateText(entry ? (entry.innerText || entry.textContent || "") : "");
  }

  function entryLooksLikeRacePr(text) {
    const normalized = normalizeDateText(text);
    if (!normalized) return false;
    const lower = normalized.toLowerCase();
    const hasRaceSignal = /\brace\b|\bmarathon\b|\bhalf marathon\b|\b\d{1,2}\s?k\b|\btrail race\b|\bultra\b|\btriathlon\b/.test(lower) || /比赛|賽事|马拉松|馬拉松|半马|半馬|越野赛|越野賽/.test(normalized);
    const hasPrSignal = /\bpr\b|\bpersonal record\b|\bbest effort\b|\bachievement\b|\bmedal\b|\brecord\b/.test(lower) || /个人纪录|個人紀錄|最佳成绩|最佳成績|奖牌|獎牌|成就/.test(normalized);
    return hasRaceSignal && hasPrSignal;
  }

  function activityIdFromHref(href) {
    if (!href) return "";
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
    for (let index = 0; index < normalized.length; index += 1) { hash ^= normalized.charCodeAt(index); hash = Math.imul(hash, 16777619); }
    return (hash >>> 0).toString(36);
  }

  function activityFallbackText(entry, button) {
    if (!entry) return "";
    const dateText = activityDateTextFor(button);
    const links = Array.from(entry.querySelectorAll("a")).map((link) => normalizeDateText(link.href || link.textContent)).filter(Boolean).slice(0, 6).join(" ");
    const heading = normalizeDateText((entry.querySelector("h2, h3, [data-testid*='title']") || {}).textContent);
    return normalizeDateText([dateText, heading, links].filter(Boolean).join(" "));
  }

  function activityKeyForButton(button) {
    const entry = feedEntryForButton(button);
    const searchRoot = entry || button;
    const activityLinks = Array.from(searchRoot.querySelectorAll('a[href*="/activities/"]'));
    for (const link of activityLinks) {
      const activityId = activityIdFromHref(link.getAttribute("href") || link.href);
      if (activityId) return `activity:${activityId}`;
    }
    const fallbackText = activityFallbackText(entry, button);
    return fallbackText ? `feed:${simpleHash(fallbackText)}` : "";
  }

  function entryHasSuggestedOrPromotedSignal(text) {
    const lower = text.toLowerCase();
    return /suggested|recommended|people you may know|sponsored|promoted|advertisement/.test(lower) || /推荐|推薦|赞助|讚助|广告|廣告|推广|推廣|你可能认识|你可能認識/.test(text);
  }

  function extractAthleteIdFromFeedEntry(entry) {
    const links = entry.querySelectorAll("a[href*=\"/athletes/\"]");
    for (const link of links) {
      const href = link.getAttribute("href") || "";
      const idx = href.indexOf("/athletes/");
      if (idx === -1) continue;
      const after = href.substring(idx + 10);
      const end = after.search(/[/?]/);
      const idStr = end === -1 ? after : after.substring(0, end);
      if (/^\d+$/.test(idStr)) return idStr;
    }
    return "";
  }

  async function loadConnectionWhitelist() {
    const raw = await storageLocalGet(CONNECTION_WHITELIST_KEY);
    if (!raw || !raw.athleteIds || !Array.isArray(raw.athleteIds)) return null;
    if (Date.now() - raw.updatedAt > CONNECTION_WHITELIST_TTL_MS) return null;
    const athleteIds = new Set(raw.athleteIds.map(String));
    return { athleteIds, updatedAt: raw.updatedAt, currentUserId: String(raw.currentUserId || "") };
  }

  function getCurrentUserId() {
    const profileLinks = document.querySelectorAll("a[href*=\"/athletes/\"]");
    for (const link of profileLinks) {
      const text = (link.textContent || "").trim();
      if (text && link.closest("nav, header, [class*=user], [class*=profile], [class*=nav]")) continue;
      const href = link.getAttribute("href") || "";
      const match = href.match(/\/athletes\/(\d+)$/);
      if (match && text.length > 1) return match[1];
    }
    for (const link of profileLinks) {
      const href = link.getAttribute("href") || "";
      if (/\/athletes\/\d+$/.test(href)) {
        return href.match(/\/athletes\/(\d+)/)[1];
      }
    }
    return "";
  }

  async function fetchAthleteIdsFromPage(url) {
    try {
      const resp = await fetch(url);
      if (!resp.ok) return { ids: new Set(), hasMore: false };
      const html = await resp.text();
      const ids = new Set();
      const re = /\/athletes\/(\d+)/g;
      let match;
      while ((match = re.exec(html)) !== null) {
        ids.add(match[1]);
      }
      const perPage = 26;
      const hasMore = ids.size >= perPage;
      return { ids, hasMore };
    } catch (_error) {
      return { ids: new Set(), hasMore: false };
    }
  }

  async function buildConnectionWhitelist(currentUserId) {
    const allIds = new Set();
    if (currentUserId) allIds.add(currentUserId);

    try {
      for (let page = 1; page <= 20; page += 1) {
        const { ids: pageIds, hasMore } = await fetchAthleteIdsFromPage(`/athletes/${currentUserId}/follows?type=following&page=${page}`);
        pageIds.forEach((id) => allIds.add(id));
        if (!hasMore || pageIds.size === 0) break;
      }
    } catch (_error) {}

    try {
      for (let page = 1; page <= 20; page += 1) {
        const { ids: pageIds, hasMore } = await fetchAthleteIdsFromPage(`/athletes/${currentUserId}/follows?type=followers&page=${page}`);
        pageIds.forEach((id) => allIds.add(id));
        if (!hasMore || pageIds.size === 0) break;
      }
    } catch (_error) {}

    const whitelist = {
      athleteIds: Array.from(allIds),
      currentUserId: String(currentUserId),
      updatedAt: Date.now()
    };
    await storageLocalSet({ [CONNECTION_WHITELIST_KEY]: whitelist });
    return { athleteIds: allIds, currentUserId: String(currentUserId), updatedAt: whitelist.updatedAt };
  }

  async function getOrBuildConnectionWhitelist() {
    const cached = await loadConnectionWhitelist();
    if (cached) return cached;
    const currentUserId = getCurrentUserId();
    if (!currentUserId) return null;
    return buildConnectionWhitelist(currentUserId);
  }

  function relationshipStatusForButton(button, relationshipFilter, connectionWhitelist) {
    if (!relationshipFilter || relationshipFilter.mode === "any") return "include";

    const entry = feedEntryForButton(button);
    if (!entry) return "unknown";

    const text = normalizeDateText(entry.innerText || entry.textContent);
    if (entryHasSuggestedOrPromotedSignal(text)) return "not-connected";

    const athleteId = extractAthleteIdFromFeedEntry(entry);
    if (!athleteId) return "unknown";

    if (connectionWhitelist && connectionWhitelist.athleteIds instanceof Set) {
      return connectionWhitelist.athleteIds.has(athleteId) ? "include" : "not-connected";
    }
    if (connectionWhitelist && connectionWhitelist.athleteIds && Array.isArray(connectionWhitelist.athleteIds)) {
      return connectionWhitelist.athleteIds.includes(athleteId) ? "include" : "not-connected";
    }

    return "unknown";
  }

  function createHandledActivityCache(entries) { return { entries, pendingWrites: 0 }; }

  function pruneHandledActivityEntries(entries) {
    if (entries.size <= ACTIVITY_CACHE_PROFILE.maxItems) return entries;
    return new Map(Array.from(entries.entries()).sort((a, b) => a[1] - b[1]).slice(entries.size - ACTIVITY_CACHE_PROFILE.maxItems));
  }

  async function loadHandledActivityCache(metrics) {
    const raw = await storageLocalGet(HANDLED_ACTIVITY_CACHE_KEY);
    const rawItems = raw && Array.isArray(raw.items) ? raw.items : [];
    const entries = new Map();
    rawItems.forEach((item) => {
      const key = item && item.key ? String(item.key) : "";
      const handledAt = Number(item && item.handledAt);
      if (key) entries.set(key, Number.isFinite(handledAt) ? handledAt : Date.now());
    });
    const cache = createHandledActivityCache(pruneHandledActivityEntries(entries));
    metrics.cacheSize = cache.entries.size;
    metrics.loadedCacheItems = cache.entries.size;
    return cache;
  }

  async function persistHandledActivityCache(cache, metrics) {
    if (!cache) return false;
    cache.entries = pruneHandledActivityEntries(cache.entries);
    cache.pendingWrites = 0;
    if (metrics) metrics.cacheSize = cache.entries.size;
    return storageLocalSet({ [HANDLED_ACTIVITY_CACHE_KEY]: { version: 1, updatedAt: Date.now(), items: Array.from(cache.entries.entries()).map((e) => ({ key: e[0], handledAt: e[1] })) } });
  }

  async function markActivityHandled(cache, activityKey, metrics) {
    if (!cache || !activityKey || cache.entries.has(activityKey)) return false;
    cache.entries.set(activityKey, Date.now());
    cache.pendingWrites += 1;
    metrics.cachedActivitiesAdded += 1;
    metrics.cacheSize = cache.entries.size;
    if (cache.pendingWrites >= ACTIVITY_CACHE_PROFILE.flushEvery) await persistHandledActivityCache(cache, metrics);
    return true;
  }

  function applyTimeFromText(date, text) {
    const normalized = normalizeDateText(text);
    const amPmMatch = /(\d{1,2})(?::(\d{2}))?\s*([ap])\.?m\.?/i.exec(normalized);
    if (amPmMatch) {
      let hour = Number(amPmMatch[1]);
      const minute = Number(amPmMatch[2] || 0);
      const marker = amPmMatch[3].toLowerCase();
      if (marker === "p" && hour < 12) hour += 12;
      if (marker === "a" && hour === 12) hour = 0;
      if (hour >= 0 && hour <= 23 && minute >= 0 && minute <= 59) date.setHours(hour, minute, 0, 0);
      return date;
    }
    const timeMatch = /(?:\bat\b|于|\s|^)\s*(\d{1,2}):(\d{2})/.exec(normalized);
    if (timeMatch) {
      const hour = Number(timeMatch[1]);
      const minute = Number(timeMatch[2]);
      if (hour >= 0 && hour <= 23 && minute >= 0 && minute <= 59) date.setHours(hour, minute, 0, 0);
    }
    return date;
  }

  function localDateForDayOffset(now, dayOffset, text) { const date = new Date(now.getTime()); date.setHours(0, 0, 0, 0); date.setDate(date.getDate() - dayOffset); return applyTimeFromText(date, text); }

  function adjustFutureYear(date, now, hasExplicitYear) {
    if (!hasExplicitYear && date.getTime() - now.getTime() > 24 * 60 * 60 * 1000) date.setFullYear(date.getFullYear() - 1);
    return date;
  }

  function parseChineseAbsoluteActivityDate(text, now) {
    const match = /(?:(\d{4})\s*年)?\s*(\d{1,2})\s*月\s*(\d{1,2})\s*日/.exec(text);
    if (!match) return null;
    const hasExplicitYear = Boolean(match[1]);
    const year = hasExplicitYear ? Number(match[1]) : now.getFullYear();
    const month = Number(match[2]);
    const day = Number(match[3]);
    const date = new Date(year, month - 1, day);
    if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) return null;
    date.setHours(0, 0, 0, 0);
    return adjustFutureYear(applyTimeFromText(date, text), now, hasExplicitYear);
  }

  function parseEnglishRelativeActivityDate(text, now) {
    const match = /(\d+)\s*(minute|minutes|min|mins|hour|hours|hr|hrs|day|days|week|weeks|month|months|year|years)\s*ago/i.exec(text);
    if (!match) return null;
    const amount = Number(match[1]);
    const unit = match[2].toLowerCase();
    if (!Number.isFinite(amount)) return null;
    let multiplier = 60 * 1000;
    if (unit.startsWith("hour") || unit.startsWith("hr")) multiplier = 60 * 60 * 1000;
    else if (unit.startsWith("day")) multiplier = 24 * 60 * 60 * 1000;
    else if (unit.startsWith("week")) multiplier = 7 * 24 * 60 * 60 * 1000;
    else if (unit.startsWith("month")) multiplier = 30 * 24 * 60 * 60 * 1000;
    else if (unit.startsWith("year")) multiplier = 365 * 24 * 60 * 60 * 1000;
    return new Date(now.getTime() - amount * multiplier);
  }

  function parseChineseRelativeActivityDate(text, now) {
    const match = /(\d+)\s*(分钟|分鐘|分|小时|小時|时|時|天|日|周|週|星期|个月|個月|月|年)\s*前/.exec(text);
    if (!match) return null;
    const amount = Number(match[1]);
    const unit = match[2];
    if (!Number.isFinite(amount)) return null;
    let multiplier = 60 * 1000;
    if (/^小时$|^小時$|^时$|^時$/.test(unit)) multiplier = 60 * 60 * 1000;
    else if (/^天$|^日$/.test(unit)) multiplier = 24 * 60 * 60 * 1000;
    else if (/^周$|^週$|^星期$/.test(unit)) multiplier = 7 * 24 * 60 * 60 * 1000;
    else if (/^个月$|^個月$|^月$/.test(unit)) multiplier = 30 * 24 * 60 * 60 * 1000;
    else if (/^年$/.test(unit)) multiplier = 365 * 24 * 60 * 60 * 1000;
    return new Date(now.getTime() - amount * multiplier);
  }

  function parseEnglishDateFallback(text, now) {
    const cleaned = normalizeDateText(text).replace(/\s*[·•].*$/, "").replace(/\bat\b/ig, " ");
    const candidates = [text, cleaned];
    for (const candidate of candidates) {
      const normalized = normalizeDateText(candidate);
      if (!normalized) continue;
      const timestamp = Date.parse(normalized);
      if (!Number.isFinite(timestamp)) continue;
      const hasExplicitYear = /\b\d{4}\b/.test(normalized);
      return adjustFutureYear(new Date(timestamp), now, hasExplicitYear);
    }
    return null;
  }

  function parseActivityDate(rawText, now) {
    const text = normalizeDateText(rawText);
    const referenceTime = now || new Date();
    if (!text) return null;
    if (/今天/i.test(text) || /\btoday\b/i.test(text)) return localDateForDayOffset(referenceTime, 0, text);
    if (/昨天/i.test(text) || /\byesterday\b/i.test(text)) return localDateForDayOffset(referenceTime, 1, text);
    return parseChineseAbsoluteActivityDate(text, referenceTime) || parseEnglishRelativeActivityDate(text, referenceTime) || parseChineseRelativeActivityDate(text, referenceTime) || parseEnglishDateFallback(text, referenceTime);
  }

  function activityDateTextFor(button) {
    const entry = button.closest('[data-testid="web-feed-entry"]');
    const dateNode = entry ? entry.querySelector('time[data-testid="date_at_time"], time') : null;
    if (!dateNode) return "";
    return normalizeDateText(dateNode.getAttribute("datetime") || dateNode.textContent);
  }

  function dateFilterStatusForButton(button, dateRange) {
    if (!dateRange || dateRange.mode !== "last") return "include";
    const activityDate = parseActivityDate(activityDateTextFor(button));
    if (!activityDate) return "unknown";
    return activityDate.getTime() >= dateRange.cutoffTimestamp ? "include" : "out-of-date";
  }

  function pageScrollY() { return window.scrollY || window.pageYOffset || document.documentElement.scrollTop || 0; }

  function dispatchWheelGesture(deltaY) {
    const clientX = randomInteger(Math.floor(window.innerWidth * 0.38), Math.floor(window.innerWidth * 0.62));
    const clientY = randomInteger(Math.floor(window.innerHeight * 0.34), Math.floor(window.innerHeight * 0.68));
    document.dispatchEvent(new WheelEvent("wheel", { bubbles: true, cancelable: true, composed: true, view: window, deltaX: 0, deltaY, deltaMode: 0, clientX, clientY }));
  }

  function scrollStepToward(button, desiredTop) {
    const rect = button.getBoundingClientRect();
    const distance = rect.top - desiredTop;
    if (Math.abs(distance) < randomInteger(22, 58)) return true;
    const direction = Math.sign(distance);
    const magnitude = Math.min(Math.abs(distance), randomInteger(90, 360));
    const eased = Math.max(18, Math.round(magnitude * randomFloat(0.48, 0.96)));
    const deltaY = direction * eased;
    const beforeY = pageScrollY();
    dispatchWheelGesture(deltaY);
    window.scrollBy({ top: deltaY, left: 0, behavior: "auto" });
    return Math.abs(pageScrollY() - beforeY) < 1 && Math.abs(distance) < 140;
  }

  async function scrollForMoreFeedItems() {
    const beforeY = pageScrollY();
    const beforeHeight = document.documentElement.scrollHeight || document.body.scrollHeight || 0;
    const viewportHeight = window.innerHeight || document.documentElement.clientHeight || 800;
    const scrollDistance = randomInteger(Math.floor(viewportHeight * 0.75), Math.floor(viewportHeight * 1.35));
    dispatchWheelGesture(scrollDistance);
    window.scrollBy({ top: scrollDistance, left: 0, behavior: "auto" });
    if (!(await cancellableDelay(TIMING_PROFILE.feedLoadSettle))) return false;
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
    return { clientX: Math.round(randomInteger(Math.floor(minX), Math.ceil(maxX))), clientY: Math.round(randomInteger(Math.floor(minY), Math.ceil(maxY))) };
  }

  function dispatchMouseEvent(element, type, point, buttons) {
    element.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true, composed: true, view: window, clientX: point.clientX, clientY: point.clientY, screenX: window.screenX + point.clientX, screenY: window.screenY + point.clientY, button: 0, buttons }));
  }

  function dispatchPointerEvent(element, type, point, buttons) {
    if (typeof window.PointerEvent !== "function") return;
    element.dispatchEvent(new PointerEvent(type, { bubbles: true, cancelable: true, composed: true, pointerId: 1, pointerType: "mouse", isPrimary: true, view: window, clientX: point.clientX, clientY: point.clientY, screenX: window.screenX + point.clientX, screenY: window.screenY + point.clientY, button: 0, buttons }));
  }

  function dispatchPointerAndMouse(element, type, point, buttons) { dispatchPointerEvent(element, `pointer${type}`, point, buttons); dispatchMouseEvent(element, `mouse${type}`, point, buttons); }

  async function humanScrollToElement(button) {
    if (!(await cancellableDelay(TIMING_PROFILE.preScrollLook))) return false;
    const desiredTop = randomInteger(Math.floor(window.innerHeight * 0.34), Math.floor(window.innerHeight * 0.58));
    for (let stepCount = 0; stepCount < 32; stepCount += 1) {
      if (runState.cancelRequested || !button.isConnected) return false;
      if (scrollStepToward(button, desiredTop)) break;
      if (!(await cancellableDelay(TIMING_PROFILE.scrollStepPause))) return false;
      if (chance(0.18) && !(await cancellableDelay(TIMING_PROFILE.scrollHesitation))) return false;
    }
    return cancellableDelay(TIMING_PROFILE.scrollSettle);
  }

  async function performHumanPacedClick(button) {
    const point = interactionPointFor(button);
    dispatchPointerAndMouse(button, "over", point, 0);
    dispatchPointerAndMouse(button, "move", point, 0);
    if (!(await cancellableDelay(TIMING_PROFILE.preClickDwell))) return false;
    try { button.focus({ preventScroll: true }); } catch (_error) { button.focus(); }
    dispatchPointerAndMouse(button, "down", point, 1);
    if (!(await cancellableDelay(TIMING_PROFILE.pressHold))) { dispatchPointerAndMouse(button, "up", point, 0); return false; }
    dispatchPointerAndMouse(button, "up", point, 0);
    if (runState.cancelRequested) return false;
    button.click();
    return cancellableDelay(TIMING_PROFILE.postClickDwell);
  }

  function randomCompliment() {
    return COMPLIMENT_MESSAGES[randomInteger(0, COMPLIMENT_MESSAGES.length - 1)];
  }

  function visibleElement(element) {
    if (!element || !(element instanceof Element)) return false;
    const rect = element.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
  }

  function findCommentTrigger(entry) {
    if (!entry) return null;
    const buttons = Array.from(entry.querySelectorAll("button, a"));
    return buttons.find((element) => {
      const text = normalizeDateText([element.getAttribute("aria-label"), element.getAttribute("title"), element.innerText, element.textContent].filter(Boolean).join(" ")).toLowerCase();
      return visibleElement(element) && /\bcomment\b|评论|評論/.test(text);
    }) || null;
  }

  function findCommentInput(entry) {
    if (!entry) return null;
    return Array.from(entry.querySelectorAll('textarea, input[type="text"], [contenteditable="true"]')).find((element) => visibleElement(element) && !isDisabled(element)) || null;
  }

  function setCommentInputValue(input, value) {
    if (input.isContentEditable) {
      input.textContent = value;
      input.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "insertText", data: value }));
      return;
    }
    input.focus();
    input.value = value;
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new Event("change", { bubbles: true }));
  }

  function findCommentSubmit(entry) {
    if (!entry) return null;
    const buttons = Array.from(entry.querySelectorAll('button, input[type="submit"]'));
    return buttons.find((element) => {
      const text = normalizeDateText([element.getAttribute("aria-label"), element.getAttribute("title"), element.value, element.innerText, element.textContent].filter(Boolean).join(" ")).toLowerCase();
      return visibleElement(element) && !isDisabled(element) && (element.getAttribute("type") === "submit" || /\bpost\b|\bsend\b|\bcomment\b|发布|發佈|发送|發送|评论|評論/.test(text));
    }) || null;
  }

  async function postComplimentOnEntry(entry, message) {
    let input = findCommentInput(entry);
    if (!input) {
      const trigger = findCommentTrigger(entry);
      if (!trigger) return false;
      trigger.click();
      await cancellableDelay(TIMING_PROFILE.feedLoadSettle);
      input = findCommentInput(entry);
    }
    if (!input) return false;
    setCommentInputValue(input, message);
    await cancellableDelay(TIMING_PROFILE.preClickDwell);
    const submit = findCommentSubmit(entry);
    if (!submit) return false;
    submit.click();
    await cancellableDelay(TIMING_PROFILE.postClickDwell);
    return true;
  }

  async function maybePostRacePrCompliment(button, metrics, complimentMode, commentCache, activityKey) {
    if (!complimentMode || complimentMode.mode !== "race-pr") return;
    if (!activityKey || !activityKey.startsWith("activity:")) { metrics.commentsSkipped += 1; return; }
    if (commentCache && commentCache.entries.has(activityKey)) { metrics.commentsSkipped += 1; return; }
    const entry = feedEntryForButton(button);
    if (!entry || !entryLooksLikeRacePr(feedEntryTextForButton(button))) { metrics.commentsSkipped += 1; return; }
    try {
      const posted = await postComplimentOnEntry(entry, randomCompliment());
      if (!posted) { metrics.commentsSkipped += 1; return; }
      metrics.commentsPosted += 1;
      await markActivityCommented(commentCache, activityKey);
    } catch (_error) {
      metrics.commentErrors += 1;
    }
  }

  function getCandidateButtons() {
    return Array.from(document.querySelectorAll(TARGET_SELECTOR)).filter((button) => {
      return isButtonElement(button) && !isDisabled(button) && !isKudosInspectorButton(button);
    });
  }

  function shouldInspectCachedActivityForCompliment(button, activityKey, complimentMode, commentCache) {
    if (!complimentMode || complimentMode.mode !== "race-pr") return false;
    if (!activityKey || !activityKey.startsWith("activity:")) return false;
    if (commentCache && commentCache.entries.has(activityKey)) return false;
    return entryLooksLikeRacePr(feedEntryTextForButton(button));
  }

  function getUnprocessedCandidateButtons(processedButtons, handledCache, metrics, complimentMode, commentCache) {
    const buttons = [];
    const commentOnlyButtons = [];
    let sawCandidate = false;
    let skippedCached = 0;
    getCandidateButtons().forEach((button) => {
      if (processedButtons.has(button)) return;
      sawCandidate = true;
      const activityKey = activityKeyForButton(button);
      if (activityKey && handledCache && handledCache.entries.has(activityKey)) {
        processedButtons.add(button);
        if (shouldInspectCachedActivityForCompliment(button, activityKey, complimentMode, commentCache)) {
          commentOnlyButtons.push(button);
        }
        skippedCached += 1;
        return;
      }
      buttons.push(button);
    });
    if (skippedCached > 0) metrics.skippedCached += skippedCached;
    return { buttons, commentOnlyButtons, sawCandidate, skippedCached };
  }

  function isLoginPage() {
    const path = window.location.pathname.toLowerCase();
    if (path === "/login" || path.startsWith("/login/") || path === "/register" || path.startsWith("/register/")) return true;
    const loginForm = document.querySelector('form[action*="/login"], input[type="password"], input[name="email"]');
    const pageText = document.body ? document.body.innerText.toLowerCase() : "";
    return Boolean(loginForm && /log in|login|sign in|password/.test(pageText));
  }

  function detectLoginState() {
    const loggedOut = isLoginPage();
    return { loggedIn: !loggedOut, loggedOut, url: window.location.href };
  }

  function createMetrics(scanned, betweenTargets, dateRange) {
    return {
      scanned, clicked: 0, skippedAlreadyClicked: 0, skippedDisabled: 0, skippedMissing: 0,
      skippedOutOfDate: 0, skippedUnknownDate: 0, skippedCached: 0, skippedRelationship: 0,
      errors: 0, stopped: false, stopRequestedAt: null,
      currentStatusKey: "runStatusStarting", currentStatus: "Starting kudos sequence.",
      discoveryScrolls: 0, idleDiscoveryAttempts: 0,
      endedAtRecentActivityBoundary: false, recentActivityBoundarySeenAt: null,
      endedAtDateBoundary: false, dateBoundarySeenAt: null, dateBoundaryText: "",
      autoRefreshPending: false, refreshes: 0, cappedByRefreshLimit: false,
      resumedAfterRefresh: false, resumeCount: 0,
      loadedCacheItems: 0, cachedActivitiesAdded: 0, cacheSize: 0,
      commentsPosted: 0, commentsSkipped: 0, commentErrors: 0,
      hiddenDiscoveryBackoffs: 0, hiddenSince: null,
      delayRangeMs: betweenTargets, dateRange, relationshipFilter: null, complimentMode: { mode: "off" },
      startedAt: Date.now(), finishedAt: null, durationMs: null,
      isAutoMode: runState.isAutoMode, shouldAutoRefresh: false
    };
  }

  async function processButton(button, metrics, dateRange, handledCache, relationshipFilter, connectionWhitelist, complimentMode, commentCache) {
    if (runState.cancelRequested) return false;
    setCurrentStatus(metrics, "runStatusChecking", "Checking a visible kudos button.");
    const activityKey = activityKeyForButton(button);
    if (!button.isConnected) { metrics.skippedMissing += 1; return true; }
    if (isDisabled(button)) { metrics.skippedDisabled += 1; return true; }
    if (isAlreadyClicked(button)) {
      metrics.skippedAlreadyClicked += 1;
      await markActivityHandled(handledCache, activityKey, metrics);
      await maybePostRacePrCompliment(button, metrics, complimentMode, commentCache, activityKey);
      return true;
    }

    const relationshipStatus = relationshipStatusForButton(button, relationshipFilter, connectionWhitelist);
    if (relationshipStatus !== "include") { metrics.skippedRelationship += 1; return true; }

    const dateFilterStatus = dateFilterStatusForButton(button, dateRange);
    if (dateFilterStatus === "out-of-date") { metrics.skippedOutOfDate += 1; markDateRangeBoundary(metrics, activityDateTextFor(button)); return "date-boundary"; }
    if (dateFilterStatus === "unknown") { metrics.skippedUnknownDate += 1; return true; }

    if (!(await humanScrollToElement(button))) return false;
    setCurrentStatus(metrics, "runStatusRechecking", "Re-checking the kudos button before clicking.");
    if (!button.isConnected) { metrics.skippedMissing += 1; return true; }
    if (isDisabled(button)) { metrics.skippedDisabled += 1; return true; }
    if (isAlreadyClicked(button)) {
      metrics.skippedAlreadyClicked += 1;
      await markActivityHandled(handledCache, activityKey, metrics);
      await maybePostRacePrCompliment(button, metrics, complimentMode, commentCache, activityKey);
      return true;
    }

    const settledRelationshipStatus = relationshipStatusForButton(button, relationshipFilter, connectionWhitelist);
    if (settledRelationshipStatus !== "include") { metrics.skippedRelationship += 1; return true; }

    const settledDateFilterStatus = dateFilterStatusForButton(button, dateRange);
    if (settledDateFilterStatus === "out-of-date") { metrics.skippedOutOfDate += 1; markDateRangeBoundary(metrics, activityDateTextFor(button)); return "date-boundary"; }
    if (settledDateFilterStatus === "unknown") { metrics.skippedUnknownDate += 1; return true; }

    if (!(await performHumanPacedClick(button))) return false;
    metrics.clicked += 1;
    setCurrentStatus(metrics, "runStatusClicked", "Clicked a kudos button.");
    await markActivityHandled(handledCache, activityKey, metrics);
    await maybePostRacePrCompliment(button, metrics, complimentMode, commentCache, activityKey);
    return true;
  }

  async function processCommentOnlyButton(button, metrics, dateRange, relationshipFilter, connectionWhitelist, complimentMode, commentCache) {
    if (runState.cancelRequested) return false;
    const activityKey = activityKeyForButton(button);
    const relationshipStatus = relationshipStatusForButton(button, relationshipFilter, connectionWhitelist);
    if (relationshipStatus !== "include") { metrics.skippedRelationship += 1; return true; }

    const dateFilterStatus = dateFilterStatusForButton(button, dateRange);
    if (dateFilterStatus === "out-of-date") { metrics.skippedOutOfDate += 1; return true; }
    if (dateFilterStatus === "unknown") { metrics.skippedUnknownDate += 1; return true; }

    await maybePostRacePrCompliment(button, metrics, complimentMode, commentCache, activityKey);
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
        metrics: runState.activeMetrics || runState.lastMetrics,
        isAutoMode: runState.isAutoMode
      }
    };
  }

  function stopKudosSequence() {
    if (!runState.running) return { ok: false, message: "No kudos sequence is running.", state: statusResult().state };
    runState.cancelRequested = true;
    if (runState.activeMetrics && !runState.activeMetrics.stopRequestedAt) runState.activeMetrics.stopRequestedAt = Date.now();
    return { ok: true, message: "Stop requested. The sequence will stop before the next kudos click.", state: statusResult().state };
  }

  function resumeRecordIsFresh(record) {
    const requestedAt = Number(record && record.requestedAt);
    return Boolean(record && record.pending) && Number.isFinite(requestedAt) && Date.now() - requestedAt <= AUTO_REFRESH_PROFILE.resumeTtlMs;
  }

  function resumeMetrics(record, betweenTargets, dateRange, relationshipFilter, complimentMode) {
    const restored = { ...createMetrics(0, betweenTargets, dateRange), ...(record && record.metrics ? record.metrics : {}) };
    restored.delayRangeMs = betweenTargets;
    restored.dateRange = dateRange;
    restored.relationshipFilter = relationshipFilter;
    restored.complimentMode = complimentMode;
    restored.autoRefreshPending = false;
    restored.resumedAfterRefresh = true;
    restored.resumeCount = Number(restored.resumeCount || 0) + 1;
    restored.refreshes = Number(restored.refreshes || 0) + 1;
    restored.finishedAt = null;
    restored.durationMs = null;
    restored.isAutoMode = runState.isAutoMode;
    setCurrentStatus(restored, "runStatusResumed", "Resumed after refreshing Strava.");
    return restored;
  }

  async function clearStoredResumeRun() { await storageLocalRemove(RESUME_RUN_KEY); }

  async function notifyBackgroundRunComplete(metrics) {
    try {
      chrome.runtime.sendMessage({
        action: "STRAVA_AUTO_KUDOS_RUN_COMPLETE",
        metrics: {
          clicked: metrics.clicked,
          scanned: metrics.scanned,
          stopped: metrics.stopped,
          endedAtRecentActivityBoundary: metrics.endedAtRecentActivityBoundary,
          endedAtDateBoundary: metrics.endedAtDateBoundary,
          finishedAt: metrics.finishedAt,
          durationMs: metrics.durationMs,
          commentsPosted: metrics.commentsPosted,
          commentsSkipped: metrics.commentsSkipped,
          commentErrors: metrics.commentErrors,
          isAutoMode: metrics.isAutoMode
        }
      });
    } catch (_error) {}
  }

  async function finalizeRunMetrics(metrics) {
    metrics.stopped = runState.cancelRequested;
    metrics.finishedAt = Date.now();
    metrics.durationMs = metrics.finishedAt - metrics.startedAt;
    runState.lastMetrics = metrics;
    const wasAutoMode = runState.isAutoMode;
    runState.running = false;
    runState.cancelRequested = false;
    runState.activeMetrics = null;

    if (!metrics.autoRefreshPending) {
      await clearStoredResumeRun();
      await notifyBackgroundRunComplete(metrics);
    }
  }

  async function requestAutoRefresh(settings, metrics) {
    metrics.autoRefreshPending = true;
    metrics.currentStatusKey = null;
    metrics.currentStatus = "Refreshing Strava before continuing.";
    const stored = await storageLocalSet({
      [RESUME_RUN_KEY]: {
        pending: true,
        requestedAt: Date.now(),
        settings,
        metrics
      }
    });
    if (!stored) {
      metrics.autoRefreshPending = false;
      metrics.currentStatusKey = null;
      metrics.currentStatus = "Unable to save refresh state.";
      return false;
    }
    window.location.reload();
    return true;
  }

  function createCommentCache(entries) { return { entries, pendingWrites: 0 }; }

  function pruneCommentEntries(entries) {
    if (entries.size <= ACTIVITY_CACHE_PROFILE.maxItems) return entries;
    return new Map(Array.from(entries.entries()).sort((a, b) => a[1] - b[1]).slice(entries.size - ACTIVITY_CACHE_PROFILE.maxItems));
  }

  async function loadCommentCache() {
    const raw = await storageLocalGet(COMMENT_CACHE_KEY);
    const rawItems = raw && Array.isArray(raw.items) ? raw.items : [];
    const entries = new Map();
    rawItems.forEach((item) => {
      const key = item && item.key ? String(item.key) : "";
      const commentedAt = Number(item && item.commentedAt);
      if (key) entries.set(key, Number.isFinite(commentedAt) ? commentedAt : Date.now());
    });
    return createCommentCache(pruneCommentEntries(entries));
  }

  async function persistCommentCache(commentCache) {
    if (!commentCache) return false;
    commentCache.entries = pruneCommentEntries(commentCache.entries);
    commentCache.pendingWrites = 0;
    return storageLocalSet({ [COMMENT_CACHE_KEY]: { version: 1, updatedAt: Date.now(), items: Array.from(commentCache.entries.entries()).map((e) => ({ key: e[0], commentedAt: e[1] })) } });
  }

  async function markActivityCommented(commentCache, activityKey) {
    if (!commentCache || !activityKey || commentCache.entries.has(activityKey)) return false;
    commentCache.entries.set(activityKey, Date.now());
    commentCache.pendingWrites += 1;
    if (commentCache.pendingWrites >= ACTIVITY_CACHE_PROFILE.flushEvery) await persistCommentCache(commentCache);
    return true;
  }

  async function executeKudosSequence(metrics, paceState, processedButtons, dateRange, relationshipFilter, complimentMode) {
    let idleScrollAttempts = 0;
    let pageTouchedFeed = false;
    let handledCache = null;
    let commentCache = null;
    let connectionWhitelist = null;

    try {
      handledCache = await loadHandledActivityCache(metrics);
      commentCache = await loadCommentCache();
      if (relationshipFilter && relationshipFilter.mode === "connected") {
        connectionWhitelist = await getOrBuildConnectionWhitelist();
        if (!connectionWhitelist) {
          setCurrentStatus(metrics, "runStatusStarting", "Could not build connection whitelist; skipping relationship filter.");
        }
      }

      while (!runState.cancelRequested) {
        const candidateResult = getUnprocessedCandidateButtons(processedButtons, handledCache, metrics, complimentMode, commentCache);
        const buttons = candidateResult.buttons;
        const commentOnlyButtons = candidateResult.commentOnlyButtons;
        if (candidateResult.sawCandidate || candidateResult.skippedCached > 0) pageTouchedFeed = true;

        if (buttons.length === 0 && commentOnlyButtons.length > 0) {
          idleScrollAttempts = 0;
          metrics.idleDiscoveryAttempts = 0;
          const commentOnlyButton = commentOnlyButtons[0];
          metrics.scanned += 1;
          pageTouchedFeed = true;
          try {
            await processCommentOnlyButton(commentOnlyButton, metrics, dateRange, relationshipFilter, connectionWhitelist, complimentMode, commentCache);
          } catch (_error) { metrics.errors += 1; }
          if (runState.cancelRequested) break;
          continue;
        }

        if (buttons.length === 0) {
          if (hasRecentActivityBoundary()) {
            markRecentActivityBoundary(metrics);
            metrics.shouldAutoRefresh = runState.isAutoMode;
            break;
          }
          if (pageTouchedFeed) setCurrentStatus(metrics, "runStatusBatchComplete", "Loaded batch is complete; scrolling for more activities.");
          setCurrentStatus(metrics, "runStatusScrolling", "Scrolling the dashboard to let Strava load more activities.");
          metrics.discoveryScrolls += 1;
          const madeProgress = await scrollForMoreFeedItems();
          if (runState.cancelRequested) break;
          if (hasRecentActivityBoundary()) {
            markRecentActivityBoundary(metrics);
            metrics.shouldAutoRefresh = runState.isAutoMode;
            break;
          }
          if (madeProgress) { idleScrollAttempts = 0; metrics.idleDiscoveryAttempts = 0; setCurrentStatus(metrics, "runStatusMoreLoaded", "More feed content loaded; scanning again."); continue; }
          if (isPageHidden()) { setCurrentStatus(metrics, "runStatusHiddenWaiting", "Strava tab is hidden; waiting before the next discovery scroll."); if (!(await hiddenDiscoveryBackoff(metrics))) break; continue; }
          idleScrollAttempts += 1;
          metrics.idleDiscoveryAttempts = idleScrollAttempts;
          if (idleScrollAttempts >= MAX_IDLE_DISCOVERY_ATTEMPTS) {
            markRecentActivityBoundary(metrics);
            metrics.shouldAutoRefresh = runState.isAutoMode;
            break;
          }
          setCurrentStatus(metrics, "runStatusWaiting", "Waiting briefly for Strava to fetch more activities.");
          if (!(await cancellableDelay(TIMING_PROFILE.feedLoadSettle))) break;
          continue;
        }

        idleScrollAttempts = 0;
        metrics.idleDiscoveryAttempts = 0;
        const button = buttons[0];
        processedButtons.add(button);
        metrics.scanned += 1;
        pageTouchedFeed = true;
        if (runState.cancelRequested) break;

        try {
          const processResult = await processButton(button, metrics, dateRange, handledCache, relationshipFilter, connectionWhitelist, complimentMode, commentCache);
          if (processResult === "date-boundary") {
            metrics.shouldAutoRefresh = runState.isAutoMode;
            break;
          }
        } catch (_error) { metrics.errors += 1; }

        if (runState.cancelRequested) break;
        if (!(await pauseBetweenTargets(paceState))) break;
      }
    } catch (error) {
      metrics.errors += 1;
      metrics.errorMessage = error && error.message ? error.message : "Kudos sequence failed.";
    } finally {
      if (handledCache) await persistHandledActivityCache(handledCache, metrics);
      if (commentCache) await persistCommentCache(commentCache);
      const willAutoRefresh = metrics.shouldAutoRefresh && runState.isAutoMode && Number(metrics.refreshes || 0) < MAX_AUTO_REFRESHES;
      if (metrics.shouldAutoRefresh && runState.isAutoMode && !willAutoRefresh) metrics.cappedByRefreshLimit = true;
      if (willAutoRefresh) metrics.autoRefreshPending = true;
      await finalizeRunMetrics(metrics);

      if (willAutoRefresh) {
        const delay = randomInteger(1500, 4000);
        await sleep(delay);
        const refreshed = await requestAutoRefresh({
          betweenTargets: metrics.delayRangeMs,
          dateRange,
          relationshipFilter,
          complimentMode: complimentMode ? complimentMode.mode : "off"
        }, metrics);
        if (!refreshed) {
          await clearStoredResumeRun();
          await notifyBackgroundRunComplete(metrics);
        }
      }
    }
  }

  function startKudosSequence(settings, resumeRecord) {
    if (runState.running) {
      return { ok: false, message: "Kudos sequence is already running.", state: statusResult().state, metrics: runState.activeMetrics };
    }

    runState.running = true;
    runState.cancelRequested = false;
    runState.isAutoMode = Boolean(settings && settings.autoMode);

    const login = detectLoginState();
    if (!login.loggedIn) {
      runState.running = false;
      return { ok: false, message: "Please log in to Strava before using this extension.", login, metrics: null };
    }

    const betweenTargets = normalizeBetweenTargetsRange(settings);
    const dateRange = normalizeDateRange(settings);
    const relationshipFilter = normalizeRelationshipFilter(settings);
    const complimentMode = normalizeComplimentMode(settings);
    const metrics = resumeRecord ? resumeMetrics(resumeRecord, betweenTargets, dateRange, relationshipFilter, complimentMode) : createMetrics(0, betweenTargets, dateRange);
    const paceState = createPaceState();
    const processedButtons = new WeakSet();
    paceState.betweenTargets = betweenTargets;
    metrics.relationshipFilter = relationshipFilter;
    metrics.complimentMode = complimentMode;
    runState.activeMetrics = metrics;

    executeKudosSequence(metrics, paceState, processedButtons, dateRange, relationshipFilter, complimentMode);

    return { ok: true, started: true, message: "Kudos sequence started.", state: statusResult().state, metrics };
  }

  async function resumeKudosAfterRefresh() {
    const record = await storageLocalGet(RESUME_RUN_KEY);
    if (!resumeRecordIsFresh(record)) {
      if (record) await clearStoredResumeRun();
      return;
    }
    if (runState.running || !detectLoginState().loggedIn) return;
    if (!(await cancellableDelay(AUTO_REFRESH_PROFILE.resumeSettle))) return;
    startKudosSequence(record.settings, record);
  }

  async function isAutoModeEnabled() {
    try {
      const settings = await storageLocalGet(SETTINGS_KEY);
      return Boolean(settings && settings.autoMode);
    } catch (_error) { return false; }
  }

  async function loadAutoModeSettings() {
    try {
      const settings = await storageLocalGet(SETTINGS_KEY);
      if (!settings || !settings.autoMode) return null;
      return {
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
        },
        complimentMode: settings.complimentMode || "off",
        autoMode: true
      };
    } catch (_error) { return null; }
  }

  async function checkAndAutoStart() {
    const autoMode = await isAutoModeEnabled();
    if (!autoMode) return;

    if (runState.running) return;
    if (isLoginPage()) return;

    const isDashboard = window.location.pathname === "/dashboard" || window.location.pathname === "/" || window.location.pathname.startsWith("/dashboard");
    if (!isDashboard) return;

    await cancellableDelay(TIMING_PROFILE.autoStartSettle);

    if (runState.running) return;
    if (!detectLoginState().loggedIn) return;

    const settings = await loadAutoModeSettings();
    if (!settings) return;

    startKudosSequence(settings);
  }

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (!message || !message.action) return false;
    if (message.action === ACTION_STATUS_KUDOS) { sendResponse(statusResult()); return false; }
    if (message.action === ACTION_STOP_KUDOS) { sendResponse(stopKudosSequence()); return false; }
    if (message.action !== ACTION_RUN_KUDOS) return false;
    sendResponse(startKudosSequence(message.settings));
    return false;
  });

  resumeKudosAfterRefresh();
  checkAndAutoStart();
})();
