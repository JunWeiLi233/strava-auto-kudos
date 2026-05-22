(() => {
  "use strict";

  const ACTION_RUN_KUDOS = "STRAVA_AUTO_KUDOS_RUN";
  const TARGET_SELECTOR = 'button[data-testid="kudos_button"]';
  const TIMING_PROFILE = Object.freeze({
    scrollSettle: { min: 450, max: 1250 },
    preClickDwell: { min: 180, max: 850 },
    pressHold: { min: 45, max: 180 },
    postClickDwell: { min: 220, max: 760 },
    betweenTargets: { min: 1500, max: 3500 },
    longPause: { min: 4200, max: 7800 },
    longPauseEvery: { min: 4, max: 7 }
  });

  const runState = {
    running: false
  };

  function sleep(ms) {
    return new Promise((resolve) => {
      window.setTimeout(resolve, ms);
    });
  }

  function randomInteger(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
  }

  function randomDelay(range) {
    return sleep(randomInteger(range.min, range.max));
  }

  function createPaceState() {
    return {
      interactionsUntilLongPause: randomInteger(TIMING_PROFILE.longPauseEvery.min, TIMING_PROFILE.longPauseEvery.max)
    };
  }

  async function pauseBetweenTargets(paceState) {
    await randomDelay(TIMING_PROFILE.betweenTargets);

    paceState.interactionsUntilLongPause -= 1;
    if (paceState.interactionsUntilLongPause > 0) {
      return;
    }

    paceState.interactionsUntilLongPause = randomInteger(TIMING_PROFILE.longPauseEvery.min, TIMING_PROFILE.longPauseEvery.max);
    await randomDelay(TIMING_PROFILE.longPause);
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
    const label = [
      button.getAttribute("aria-label"),
      button.getAttribute("title")
    ].filter(Boolean).join(" ").toLowerCase();

    return /remove|undo|already|kudoed|you gave/.test(label);
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

  async function scrollAndSettle(button) {
    button.scrollIntoView({
      behavior: "smooth",
      block: "center",
      inline: "nearest"
    });

    await randomDelay(TIMING_PROFILE.scrollSettle);
  }

  async function performHumanPacedClick(button) {
    const point = interactionPointFor(button);

    dispatchPointerAndMouse(button, "over", point, 0);
    dispatchPointerAndMouse(button, "move", point, 0);

    await randomDelay(TIMING_PROFILE.preClickDwell);

    try {
      button.focus({ preventScroll: true });
    } catch (_error) {
      button.focus();
    }

    dispatchPointerAndMouse(button, "down", point, 1);
    await randomDelay(TIMING_PROFILE.pressHold);
    dispatchPointerAndMouse(button, "up", point, 0);

    button.click();

    await randomDelay(TIMING_PROFILE.postClickDwell);
  }

  function getCandidateButtons() {
    return Array.from(document.querySelectorAll(TARGET_SELECTOR)).filter((button) => {
      return button instanceof HTMLButtonElement && !isDisabled(button);
    });
  }

  function createMetrics(scanned) {
    return {
      scanned,
      clicked: 0,
      skippedAlreadyClicked: 0,
      skippedDisabled: 0,
      skippedMissing: 0,
      errors: 0,
      startedAt: Date.now(),
      finishedAt: null,
      durationMs: null
    };
  }

  async function processButton(button, metrics) {
    if (!button.isConnected) {
      metrics.skippedMissing += 1;
      return;
    }

    if (isDisabled(button)) {
      metrics.skippedDisabled += 1;
      return;
    }

    if (isAlreadyClicked(button)) {
      metrics.skippedAlreadyClicked += 1;
      return;
    }

    await scrollAndSettle(button);

    if (!button.isConnected) {
      metrics.skippedMissing += 1;
      return;
    }

    if (isDisabled(button)) {
      metrics.skippedDisabled += 1;
      return;
    }

    if (isAlreadyClicked(button)) {
      metrics.skippedAlreadyClicked += 1;
      return;
    }

    await performHumanPacedClick(button);
    metrics.clicked += 1;
  }

  async function runKudosSequence() {
    if (runState.running) {
      return {
        ok: false,
        message: "Kudos sequence is already running.",
        metrics: null
      };
    }

    runState.running = true;

    const buttons = getCandidateButtons();
    const metrics = createMetrics(buttons.length);
    const paceState = createPaceState();

    try {
      for (const button of buttons) {
        try {
          await processButton(button, metrics);
        } catch (_error) {
          metrics.errors += 1;
        } finally {
          await pauseBetweenTargets(paceState);
        }
      }

      metrics.finishedAt = Date.now();
      metrics.durationMs = metrics.finishedAt - metrics.startedAt;

      return {
        ok: true,
        message: "Kudos sequence completed.",
        metrics
      };
    } finally {
      runState.running = false;
    }
  }

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (!message || message.action !== ACTION_RUN_KUDOS) {
      return false;
    }

    runKudosSequence()
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
