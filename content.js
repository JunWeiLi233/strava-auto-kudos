(() => {
  "use strict";

  if (window.__stravaAutoKudosContentLoaded) {
    return;
  }
  window.__stravaAutoKudosContentLoaded = true;

  const ACTION_RUN_KUDOS = "STRAVA_AUTO_KUDOS_RUN";
  const ACTION_STOP_KUDOS = "STRAVA_AUTO_KUDOS_STOP";
  const ACTION_STATUS_KUDOS = "STRAVA_AUTO_KUDOS_STATUS";
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
  const DISCOVERY_PROFILE = Object.freeze({
    maxIdleScrollAttempts: 4,
    maxProcessedButtons: 250
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

  function getUnprocessedCandidateButtons(processedButtons) {
    return getCandidateButtons().filter((button) => !processedButtons.has(button));
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

  function createMetrics(scanned, betweenTargets) {
    return {
      scanned,
      clicked: 0,
      skippedAlreadyClicked: 0,
      skippedDisabled: 0,
      skippedMissing: 0,
      errors: 0,
      stopped: false,
      stopRequestedAt: null,
      discoveryScrolls: 0,
      idleDiscoveryAttempts: 0,
      cappedBySafetyLimit: false,
      delayRangeMs: betweenTargets,
      startedAt: Date.now(),
      finishedAt: null,
      durationMs: null
    };
  }

  async function processButton(button, metrics) {
    if (runState.cancelRequested) {
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
      return true;
    }

    if (!(await performHumanPacedClick(button))) {
      return false;
    }

    metrics.clicked += 1;
    return true;
  }

  function statusResult() {
    return {
      ok: true,
      state: {
        running: runState.running,
        cancelRequested: runState.cancelRequested,
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

  async function runKudosSequence(settings) {
    if (runState.running) {
      return {
        ok: false,
        message: "Kudos sequence is already running.",
        metrics: null
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
    const metrics = createMetrics(0, betweenTargets);
    const paceState = createPaceState();
    const processedButtons = new WeakSet();
    let idleScrollAttempts = 0;
    paceState.betweenTargets = betweenTargets;
    runState.activeMetrics = metrics;

    try {
      while (!runState.cancelRequested) {
        if (metrics.scanned >= DISCOVERY_PROFILE.maxProcessedButtons) {
          metrics.cappedBySafetyLimit = true;
          break;
        }

        const buttons = getUnprocessedCandidateButtons(processedButtons);
        if (buttons.length === 0) {
          if (idleScrollAttempts >= DISCOVERY_PROFILE.maxIdleScrollAttempts) {
            break;
          }

          metrics.discoveryScrolls += 1;
          await scrollForMoreFeedItems();
          if (runState.cancelRequested) {
            break;
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

        if (runState.cancelRequested) {
          break;
        }

        try {
          await processButton(button, metrics);
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

      metrics.stopped = runState.cancelRequested;
      metrics.finishedAt = Date.now();
      metrics.durationMs = metrics.finishedAt - metrics.startedAt;
      runState.lastMetrics = metrics;

      return {
        ok: true,
        message: metrics.stopped ? "Kudos sequence stopped." : "Kudos sequence completed.",
        metrics
      };
    } finally {
      runState.running = false;
      runState.cancelRequested = false;
      runState.activeMetrics = null;
    }
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

    runKudosSequence(message.settings)
      .then((result) => {
        sendResponse(result);
      })
      .catch((error) => {
        sendResponse({
          ok: false,
          message: error && error.message ? error.message : "Kudos sequence failed.",
          metrics: null
        });
      });

    return true;
  });
})();
