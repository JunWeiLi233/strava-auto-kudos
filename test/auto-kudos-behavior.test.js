const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.resolve(__dirname, "..");
const contentSource = fs.readFileSync(path.join(root, "content.js"), "utf8");
const popupSource = fs.readFileSync(path.join(root, "popup.js"), "utf8");

test("dashboard discovery does not stop after repeated no-new-work refreshes", () => {
  assert.equal(contentSource.includes("maxNoNewWorkRefreshes"), false);
  assert.equal(contentSource.includes("refreshesWithoutNewWork"), false);
  assert.equal(contentSource.includes("maxProcessedButtons"), false);
  assert.equal(contentSource.includes("window.location.reload"), false);
});

test("date filter boundary ends the active run instead of being treated as a normal skip", () => {
  assert.match(contentSource, /endedAtDateBoundary/);
  assert.match(contentSource, /markDateRangeBoundary/);
  assert.match(contentSource, /return "date-boundary"/);
  assert.match(contentSource, /processResult === "date-boundary"[\s\S]*break/);
});

test("popup renders detailed live progress instead of a generic working status", () => {
  assert.match(popupSource, /runningProgressStatus/);
  assert.match(popupSource, /runningStatusDescriptor/);
  assert.match(popupSource, /currentStatusKey/);
  assert.match(popupSource, /setStatusDescriptor\(runningStatusDescriptor\(metrics\), "busy"\)/);
});
