const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.resolve(__dirname, "..");
const contentSource = fs.readFileSync(path.join(root, "content.js"), "utf8");
const popupSource = fs.readFileSync(path.join(root, "popup.js"), "utf8");

test("auto refresh persists resume state and reloads the dashboard", () => {
  assert.equal(contentSource.includes("maxNoNewWorkRefreshes"), false);
  assert.equal(contentSource.includes("refreshesWithoutNewWork"), false);
  assert.equal(contentSource.includes("maxProcessedButtons"), false);
  assert.match(contentSource, /requestAutoRefresh/);
  assert.match(contentSource, /autoRefreshPending\s*=\s*true/);
  assert.match(contentSource, /\[RESUME_RUN_KEY\]/);
  assert.match(contentSource, /pending:\s*true/);
  assert.match(contentSource, /requestedAt:\s*Date\.now\(\)/);
  assert.match(contentSource, /window\.location\.reload\(\)/);
  assert.match(contentSource, /if \(willAutoRefresh\) metrics\.autoRefreshPending = true;\s*await finalizeRunMetrics\(metrics\);/);
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

test("popup renders detailed live progress instead of a generic working status", () => {
  assert.match(popupSource, /runningProgressStatus/);
  assert.match(popupSource, /runningStatusDescriptor/);
  assert.match(popupSource, /currentStatusKey/);
  assert.match(popupSource, /setStatusDescriptor\(runningStatusDescriptor\(metrics\), "busy"\)/);
});
