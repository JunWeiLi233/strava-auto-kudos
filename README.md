# Strava Auto Kudos

A small Chrome Extension for runners who want to spend less time manually clicking kudos on the Strava feed.

The extension runs only when you press its popup button on a Strava page. It scans the active Strava tab for kudos buttons that have not already been selected, scrolls each target into view, waits with randomized human-paced timing, and triggers the native button click.

Repository: <https://github.com/JunWeiLi233/strava-auto-kudos>

## 中文说明

Strava Auto Kudos 是一个轻量级 Chrome 扩展，适合不想每天手动给好友动态点 kudos 的跑者使用。

它只会在你主动点击扩展弹窗里的 **Give kudos** 按钮后运行。扩展会在当前 Strava 页面中查找还没有点过的 kudos 按钮，滚动到对应位置，并使用随机化的等待、停顿和点击节奏来模拟更自然的人工操作。

### 功能

- 只匹配 Strava 页面里的 `button[data-testid="kudos_button"]`。
- 自动跳过禁用状态的按钮。
- 点击前会检查按钮是否已经点过，避免重复点击或撤销 kudos。
- 不使用固定间隔，而是使用随机化时间范围：
  - 滚动后的稳定等待
  - 点击前停顿
  - 按下保持时间
  - 点击后停顿
  - 每个目标之间的随机间隔
  - 偶尔出现的更长停顿
- 不收集数据，不保存账号信息，也不会把 Strava 页面内容发送到外部服务。

### 安装方法

1. 克隆或下载仓库：

   ```bash
   git clone https://github.com/JunWeiLi233/strava-auto-kudos.git
   ```

2. 打开 Chrome，进入：

   ```text
   chrome://extensions
   ```

3. 打开右上角的 **Developer mode**。
4. 点击 **Load unpacked**。
5. 选择 `strava-auto-kudos` 文件夹。
6. 打开或刷新 Strava：

   ```text
   https://www.strava.com/
   ```

### 使用方法

1. 在 Chrome 中登录 Strava。
2. 打开 Strava 动态页，例如：

   ```text
   https://www.strava.com/dashboard
   ```

3. 点击浏览器工具栏里的 **Strava Auto Kudos** 扩展图标。
4. 点击 **Give kudos**。
5. 保持当前 Strava 标签页打开，等待扩展处理已加载动态里的 kudos 按钮。

如果你在安装或重新加载扩展之前已经打开了 Strava 页面，请先刷新 Strava 标签页，否则 Chrome 可能还没有注入 content script。

### 注意事项

这个项目是个人便利工具。请根据 Strava 的平台规则和账号限制合理使用，不要用于刷量、骚扰或任何违反平台规则的行为。

## What It Does

- Finds Strava kudos buttons with `button[data-testid="kudos_button"]`.
- Skips disabled buttons.
- Checks button state before clicking so already-given kudos are not clicked again.
- Uses randomized timing instead of static pauses:
  - scroll settle delay
  - pre-click dwell delay
  - press-hold delay
  - post-click dwell delay
  - between-target delay
  - occasional longer pauses
- Simulates a more natural interaction path with hover, move, focus, pointer down, pointer up, mouse events, and the native `button.click()`.
- Returns a popup summary showing how many kudos buttons were scanned, clicked, and skipped.

## Files

This is a standalone Manifest V3 extension with no build step and no external dependencies.

```text
manifest.json  Chrome Extension MV3 manifest and Strava URL scope
popup.html     Minimal popup UI
popup.js       Active-tab validation and message dispatch
content.js     Strava feed DOM scanning and kudos interaction flow
README.md      Project documentation
```

## Permissions

The manifest is intentionally narrow:

```json
{
  "permissions": ["activeTab"],
  "host_permissions": ["https://www.strava.com/*"]
}
```

The extension does not request broad browsing access. It is scoped to `https://www.strava.com/*` and only starts a kudos run after you click the popup button.

## Install From Source

1. Download or clone this repository.

   ```bash
   git clone https://github.com/JunWeiLi233/strava-auto-kudos.git
   ```

2. Open Chrome.

3. Go to:

   ```text
   chrome://extensions
   ```

4. Enable **Developer mode** in the top-right corner.

5. Click **Load unpacked**.

6. Select the repository folder:

   ```text
   strava-auto-kudos
   ```

7. Open or refresh Strava:

   ```text
   https://www.strava.com/
   ```

8. Click the Chrome extensions puzzle icon and pin **Strava Auto Kudos** if you want it visible in the toolbar.

## Usage

1. Sign in to Strava in Chrome.
2. Open a Strava feed page, such as:

   ```text
   https://www.strava.com/dashboard
   ```

3. Click the **Strava Auto Kudos** extension icon.
4. Press **Give kudos**.
5. Leave the tab open while the extension scrolls through visible feed items and processes available kudos buttons.

If Strava was already open before you installed or reloaded the extension, refresh the Strava tab once so Chrome injects the content script.

## How The Automation Works

The popup sends a message to the content script running on the active Strava tab:

```js
{
  action: "STRAVA_AUTO_KUDOS_RUN",
  source: "strava-auto-kudos-popup",
  requestedAt: Date.now()
}
```

The content script then:

1. Selects candidate buttons with `button[data-testid="kudos_button"]`.
2. Filters out disabled buttons.
3. Checks each button for already-clicked signals:
   - `aria-pressed`
   - `aria-selected`
   - button labels and titles
   - state-like data attributes
   - class names such as active, selected, filled, or kudoed
   - SVG fill/color signals that match Strava orange
4. Smoothly scrolls the candidate button to the center of the viewport.
5. Waits for a randomized settle period.
6. Re-checks that the button is still connected, enabled, and unclicked.
7. Dispatches pointer and mouse events around the native click.
8. Waits a randomized delay before moving to the next target.

## Timing Profile

The timing profile lives in `content.js`.

```js
const TIMING_PROFILE = Object.freeze({
  scrollSettle: { min: 450, max: 1250 },
  preClickDwell: { min: 180, max: 850 },
  pressHold: { min: 45, max: 180 },
  postClickDwell: { min: 220, max: 760 },
  betweenTargets: { min: 1500, max: 3500 },
  longPause: { min: 4200, max: 7800 },
  longPauseEvery: { min: 4, max: 7 }
});
```

There are no fixed transaction sleeps in the content script. Each step uses a bounded random range to avoid a repetitive mechanical rhythm.

## Development

No package manager is required.

To make changes:

1. Edit the files directly.
2. Open `chrome://extensions`.
3. Click the reload icon on the **Strava Auto Kudos** extension card.
4. Refresh the Strava tab.
5. Run the extension again from the popup.

## Verification

You can run these local checks from the project directory.

### JavaScript Syntax

```bash
node --check popup.js
node --check content.js
```

### Manifest Parse Check

PowerShell:

```powershell
Get-Content -LiteralPath "manifest.json" -Raw | ConvertFrom-Json | Out-Null
```

### Expected Manifest Scope

PowerShell:

```powershell
$manifest = Get-Content -LiteralPath "manifest.json" -Raw | ConvertFrom-Json
$manifest.manifest_version
$manifest.permissions
$manifest.host_permissions
```

Expected:

```text
3
activeTab
https://www.strava.com/*
```

## Troubleshooting

### The popup says to open Strava first

The active tab must be on `https://www.strava.com/*`. The extension will not run on other sites.

### Nothing happens after clicking the popup button

Refresh the Strava tab after installing or reloading the extension. Chrome only injects content scripts into matching pages after the extension is loaded.

### It clicks fewer buttons than expected

The extension only sees DOM elements that Strava has loaded. Scroll farther down the feed to load more activities, then run it again.

### Already-clicked kudos are skipped

That is intentional. The content script checks multiple state signals before clicking so it does not undo or duplicate an existing kudos action.

### Chrome blocks loading the extension

Make sure you selected the project folder itself, not an individual file, and that the folder contains `manifest.json`.

## Privacy

This extension does not collect analytics, store credentials, call external APIs, or send your Strava data anywhere. It only reads and interacts with the DOM of the active Strava page while you run it.

## Responsible Use

This project is intended as a personal convenience tool. Use it thoughtfully and respect Strava's platform rules, your account limits, and your friends' feeds.
