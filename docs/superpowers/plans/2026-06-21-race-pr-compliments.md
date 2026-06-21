# Race PR Compliments Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an optional `Race PR only` compliment mode that posts one random positive Strava comment on detected race PR activities.

**Architecture:** Extend existing popup settings and run-settings propagation, then keep detection and comment posting inside `content.js` near the existing feed-entry processing flow. Use a separate comment cache keyed by activity id so refreshes and later runs do not duplicate comments.

**Tech Stack:** Manifest V3 Chrome extension, plain JavaScript, static Node tests with `node --test`, no build step.

---

### Task 1: Settings And Regression Tests

**Files:**
- Modify: `test/auto-kudos-behavior.test.js`
- Modify: `popup.html`
- Modify: `popup.js`
- Modify: `background.js`

- [ ] Add failing tests that assert compliment settings, translations, and background propagation exist.
- [ ] Run `node --test test\auto-kudos-behavior.test.js` and confirm the new assertions fail.
- [ ] Add popup `Compliments` selector with `Off` and `Race PR only`.
- [ ] Persist `complimentMode` in `DEFAULT_SETTINGS`, `readAndSaveSettings()`, `applySettingsToUI()`, and `buildRunSettingsFromUI()`.
- [ ] Propagate `complimentMode` from scheduled and auto-mode background starts.
- [ ] Re-run focused tests and confirm they pass.

### Task 2: Content Detection, Comment Cache, And Comment Attempt

**Files:**
- Modify: `test/auto-kudos-behavior.test.js`
- Modify: `content.js`

- [ ] Add failing tests for `COMMENT_CACHE_KEY`, `COMPLIMENT_MESSAGES`, race PR detection helpers, and comment metrics.
- [ ] Run focused tests and confirm the new assertions fail.
- [ ] Add `COMMENT_CACHE_KEY`, `COMPLIMENT_MESSAGES`, `normalizeComplimentMode()`, `feedEntryTextForButton()`, `entryLooksLikeRacePr()`, comment-cache load/persist helpers, and best-effort comment UI helpers.
- [ ] Extend metrics with `commentsPosted`, `commentsSkipped`, and `commentErrors`.
- [ ] Call compliment handling after successful kudos click or already-clicked confirmation, without failing the run when comment UI is missing.
- [ ] Re-run focused tests and confirm they pass.

### Task 3: Popup Metrics, Docs, Version, Verification, Package

**Files:**
- Modify: `popup.js`
- Modify: `README.md`
- Modify: `manifest.json`
- Create: `strava-auto-kudos-v2.1.0.zip`

- [ ] Add comment counts to running/final popup summaries when comment activity exists.
- [ ] Document the new mode and safety behavior in `README.md`.
- [ ] Bump `manifest.json` to `2.1.0`.
- [ ] Run `node --test`.
- [ ] Run `node --check content.js; node --check popup.js; node --check background.js`.
- [ ] Create `strava-auto-kudos-v2.1.0.zip` with the six extension files.
- [ ] Verify the zip manifest version and contents.

