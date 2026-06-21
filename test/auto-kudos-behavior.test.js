const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.resolve(__dirname, "..");
const contentSource = fs.readFileSync(path.join(root, "content.js"), "utf8");
const popupSource = fs.readFileSync(path.join(root, "popup.js"), "utf8");

test("auto refresh persists resume state and reloads after idle discovery limit", () => {
  assert.match(contentSource, /MAX_IDLE_DISCOVERY_ATTEMPTS/);
  assert.match(contentSource, /idleScrollAttempts >= MAX_IDLE_DISCOVERY_ATTEMPTS/);
  assert.match(contentSource, /metrics\.shouldAutoRefresh = runState\.isAutoMode/);
  assert.equal(contentSource.includes("maxProcessedButtons"), false);
  assert.match(contentSource, /requestAutoRefresh/);
  assert.match(contentSource, /MAX_AUTO_REFRESHES/);
  assert.match(contentSource, /Number\(metrics\.refreshes \|\| 0\) < MAX_AUTO_REFRESHES/);
  assert.match(contentSource, /autoRefreshPending\s*=\s*true/);
  assert.match(contentSource, /\[RESUME_RUN_KEY\]/);
  assert.match(contentSource, /pending:\s*true/);
  assert.match(contentSource, /requestedAt:\s*Date\.now\(\)/);
  assert.match(contentSource, /window\.location\.reload\(\)/);
  assert.match(contentSource, /if \(willAutoRefresh\) metrics\.autoRefreshPending = true;\s*await finalizeRunMetrics\(metrics\);/);
});

test("background and popup started runs tell the content script to allow refresh resume", () => {
  const backgroundSource = fs.readFileSync(path.join(root, "background.js"), "utf8");
  assert.match(contentSource, /runState\.isAutoMode\s*=\s*Boolean\(settings && settings\.autoMode\)/);
  assert.match(backgroundSource, /autoMode:\s*true/);
  assert.match(popupSource, /autoMode:\s*true/);
});

test("popup and background propagate race PR compliment mode", () => {
  const popupHtml = fs.readFileSync(path.join(root, "popup.html"), "utf8");
  const backgroundSource = fs.readFileSync(path.join(root, "background.js"), "utf8");
  assert.match(popupHtml, /complimentModeSelect/);
  assert.match(popupHtml, /value="race-pr"/);
  assert.match(popupSource, /complimentMode:\s*"off"/);
  assert.match(popupSource, /complimentModeSelect\.value/);
  assert.match(popupSource, /complimentMode:\s*s\.complimentMode/);
  assert.match(backgroundSource, /complimentMode:\s*s\.complimentMode \|\| "off"/);
  assert.match(backgroundSource, /complimentMode:\s*settings\.complimentMode \|\| "off"/);
});

test("race PR compliments use detection gates, cache, and metrics", () => {
  assert.match(contentSource, /COMMENT_CACHE_KEY/);
  assert.match(contentSource, /COMPLIMENT_MESSAGES/);
  assert.match(contentSource, /function normalizeComplimentMode/);
  assert.match(contentSource, /function entryLooksLikeRacePr/);
  assert.match(contentSource, /hasRaceSignal && hasPrSignal/);
  assert.match(contentSource, /commentsPosted/);
  assert.match(contentSource, /commentsSkipped/);
  assert.match(contentSource, /commentErrors/);
  assert.match(contentSource, /commentCache\.entries\.has\(activityKey\)/);
  assert.match(contentSource, /markActivityCommented/);
});

test("date filter boundary ends the active run instead of being treated as a normal skip", () => {
  assert.match(contentSource, /endedAtDateBoundary/);
  assert.match(contentSource, /markDateRangeBoundary/);
  assert.match(contentSource, /return "date-boundary"/);
  assert.match(contentSource, /processResult === "date-boundary"[\s\S]*break/);
});

test("legacy kudos selector excludes athlete-name kudos inspector buttons", () => {
  assert.match(contentSource, /function isKudosInspectorButton/);
  assert.match(contentSource, /gave kudos/);
  assert.match(contentSource, /\bSmvoy\b/);
  assert.match(contentSource, /!isKudosInspectorButton\(button\)/);
});

test("legacy kudos selector excludes kudos comments modal triggers", () => {
  assert.match(contentSource, /kudos-comments-modal-title/);
  assert.match(contentSource, /aria-controls/);
  assert.match(contentSource, /aria-labelledby/);
  assert.match(contentSource, /aria-haspopup/);
});

test("legacy kudos selector excludes kudos detail and presentation navigation controls", () => {
  assert.match(contentSource, /isKudosDetailNavigationButton/);
  assert.match(contentSource, /presentation/);
  assert.match(contentSource, /detail/);
  assert.match(contentSource, /\\u67e5\\u770b/);
  assert.match(contentSource, /\\u70b9\\u8d5e/);
  assert.match(contentSource, /isKudosDetailNavigationButton\(button\)/);
});

test("popup renders detailed live progress instead of a generic working status", () => {
  assert.match(popupSource, /runningProgressStatus/);
  assert.match(popupSource, /runningStatusDescriptor/);
  assert.match(popupSource, /currentStatusKey/);
  assert.match(popupSource, /commentsPosted/);
  assert.match(popupSource, /commentsSkipped/);
  assert.match(popupSource, /setStatusDescriptor\(runningStatusDescriptor\(metrics\), "busy"\)/);
});

test("popup polls status while it remains open", () => {
  assert.match(popupSource, /STATUS_POLL_INTERVAL_MS/);
  assert.match(popupSource, /setInterval\(refreshStatus,\s*STATUS_POLL_INTERVAL_MS\)/);
  assert.match(popupSource, /refreshStatusInFlight/);
});
