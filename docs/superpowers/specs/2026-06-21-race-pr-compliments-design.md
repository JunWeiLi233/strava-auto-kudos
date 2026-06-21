# Race PR Compliments Design

## Goal

Add an optional mode that posts a random positive comment on Strava activities that appear to be race personal records, while preserving the existing kudos automation flow and safety filters.

## User Behavior

The popup gains a `Compliments` setting with a mode selector:

- `Off` by default.
- `Race PR only` to enable automatic comments.

When enabled, a normal run still gives kudos as it does today. After a kudos candidate passes the existing relationship/date/cache checks, the content script inspects the surrounding feed entry. If the entry appears to be both a race and a PR, it attempts to post one short compliment.

## Detection Rules

A feed entry qualifies only when both conditions are true:

- Race signal: visible text includes race-like words such as `Race`, `Marathon`, `Half Marathon`, `10K`, `5K`, `Trail Race`, or similar common race labels.
- PR signal: visible text includes `PR`, `Personal Record`, `Best Effort`, `medal`, `achievement`, or similar visible Strava achievement language.

If either signal is missing, the extension gives kudos only and does not comment.

## Compliment Content

Use a built-in list of short, generic compliments. The extension randomly picks one per qualifying activity.

Initial examples:

- `Huge PR. Congrats!`
- `Strong race, well earned PR.`
- `That PR is solid. Nice work!`
- `Big result. Congrats on the PR!`

The first implementation will not add custom user-entered templates. That keeps the feature smaller and avoids storing arbitrary comment text.

## Data Flow

Popup settings are persisted in `stravaAutoKudosSettingsV2` alongside current settings. `buildRunSettingsFromUI()` includes the compliment mode in the run settings sent to the background worker.

Background scheduled and auto-mode starts include the same compliment mode from saved settings when they build run settings.

Content script normalizes the setting into a `complimentMode` object. `processButton()` receives it with the existing date and relationship filters. After a successful kudos click or already-clicked confirmation, the script checks whether the activity qualifies for a compliment.

## Comment Posting

The content script should only submit a compliment when it can confidently find and use the activity comment UI in the same feed entry or after opening the activity's comment affordance.

The implementation should:

- Prefer stable selectors and semantic labels when available.
- Fill a visible comment input or textarea only after confirming the activity qualifies.
- Submit through the native Strava UI.
- Treat missing or changed comment UI as a skipped comment, not a run failure.

## Duplicate Prevention

Add a local comment cache keyed by stable activity id. The extension should not comment twice on the same activity across refreshes or later runs.

If no stable activity id is available, skip the compliment. Kudos behavior can continue normally.

## Metrics And Status

Extend metrics with:

- `commentsPosted`
- `commentsSkipped`
- `commentErrors`

The popup running and final summaries should include comment counts when the mode is enabled or when any comment action occurred.

## Safety Constraints

The feature respects existing relationship and date filters.

It does not comment on suggested/promoted/advertised stranger entries when the default relationship filter excludes them.

It does not comment on activities outside the configured date range.

It does not comment when Strava's UI cannot be identified confidently.

It uses short generic compliments only.

## Testing

Add tests before production code:

- Settings propagation from popup/background into content run settings.
- Race PR detection accepts race plus PR text.
- Race PR detection rejects PR text without race text.
- Race PR detection rejects race text without PR text.
- Duplicate prevention references a separate comment cache.
- Popup render test still passes with the new controls.

Run full verification with:

```powershell
node --test
node --check content.js
node --check popup.js
node --check background.js
```

