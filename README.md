# Strava Auto Kudos

A small Chrome Extension for runners who want to spend less time manually clicking kudos on the Strava feed.

The extension runs only when you press its popup button. If the current tab is not on Strava, it opens the Strava dashboard first. It then checks whether Strava appears logged in, starts the kudos sequence in the Strava tab, scans for kudos buttons that have not already been selected, scrolls each target into view, waits with randomized human-paced timing, and triggers the native button click. After the run starts, the popup can close and you can use other Chrome windows while the Strava tab remains open.

Repository: <https://github.com/JunWeiLi233/strava-auto-kudos>

## Risk Notice / Disclaimer

This project is an open-source learning script shared for educational and personal research purposes. It is not affiliated with, endorsed by, or supported by Strava.

Using automation on Strava may violate Strava's Terms of Service and may create account risk, including warnings, feature restrictions, temporary suspension, or permanent suspension. Use this project at your own risk. The author is not responsible for account actions, data loss, or any other consequence caused by using or modifying this code.

If you represent Strava, a rights holder, or any party who believes this repository should be removed, please contact me at any time through GitHub Issues or my GitHub profile. I will review the request and delete/remove the project promptly if needed.

## 中文说明

Strava Auto Kudos 是一个轻量级 Chrome 扩展，适合不想每天手动给好友动态点 kudos 的跑者使用。

它只会在你主动点击扩展弹窗里的 **Give kudos** 按钮后运行。扩展会在当前 Strava 页面中查找还没有点过的 kudos 按钮，滚动到对应位置，并使用随机化的等待、停顿和点击节奏来模拟更自然的人工操作。

### 风险提示 / 免责声明

本项目是一个开源学习脚本，仅用于学习、研究和个人技术实验。它与 Strava 官方无关，也没有得到 Strava 的认可、授权或支持。

在 Strava 上使用自动化工具可能违反 Strava 的服务条款，并可能带来账号风险，包括警告、功能限制、临时封禁或永久封禁。请自行承担使用风险。作者不对因使用或修改本代码导致的账号处理、数据损失或其他后果负责。

如果你代表 Strava、权利方，或认为本仓库需要删除，请随时通过 GitHub Issues 或我的 GitHub 主页联系我。如有需要，我会及时审核并删除/移除该项目。

### 中文安装方法

推荐直接下载最新 Release 里的 ZIP 包：

```text
https://github.com/JunWeiLi233/strava-auto-kudos/releases/latest
```

下载类似下面名字的文件：

   ```text
   strava-auto-kudos-v1.0.11.zip
   ```

解压后，请确认你选择的文件夹里面能直接看到 `manifest.json`。

正确结构应该是：

```text
strava-auto-kudos-v1.0.11/
  manifest.json
  background.js
  popup.html
  popup.js
  content.js
  README.md
```

然后：

1. 打开 Chrome，进入：

   ```text
   chrome://extensions
   ```

2. 打开右上角的 **Developer mode**。
3. 点击 **Load unpacked**。
4. 选择包含 `manifest.json` 的 `strava-auto-kudos-v1.0.11` 文件夹。
5. 打开或刷新 Strava：

   ```text
   https://www.strava.com/
   ```

如果你看到“清单文件缺失或不可读取”，说明你选错了文件夹。请重新选择那个里面直接包含 `manifest.json` 的文件夹。

### 中文更新方法

Chrome 不会自动更新 unpacked extension。手动更新方法：

1. 从最新 Release 下载 ZIP：

   ```text
   https://github.com/JunWeiLi233/strava-auto-kudos/releases/latest
   ```

2. 解压新版本。
3. 打开 `chrome://extensions`。
4. 找到 **Strava Auto Kudos**。
5. 点击扩展卡片上的 **Remove** 删除旧版本，或者点击 reload 图标重新加载同一路径下的新文件。
6. 点击 **Load unpacked**，选择新版本中直接包含 `manifest.json` 的文件夹。
7. 刷新已经打开的 Strava 页面。

如果你是用 Git 克隆安装的，可以在项目目录运行：

```bash
git pull
```

然后在 `chrome://extensions` 里重新加载扩展。

### 中文使用方法

1. 在 Chrome 中登录 Strava。
2. 打开 Strava 动态页，例如：

   ```text
   https://www.strava.com/dashboard
   ```

3. 点击浏览器工具栏里的 **Strava Auto Kudos** 扩展图标。
4. 如果需要，点击右上角的 **中文 / EN** 按钮切换弹窗语言。
5. 点击 **Give kudos**。
6. 如果当前页面不是 Strava，扩展会自动打开 Strava dashboard。
7. 如果 Strava 未登录，扩展会提示你先登录再使用。
8. 可在弹窗里的 **Kudos delay** 中设置每次 kudos 之间的最小和最大等待秒数。
9. 可在 **Activity date** 中选择日期范围：
   - **Any time**：不按日期过滤，处理页面上可见和后续加载的动态。
   - **Last N days/months/years**：只处理最近 N 天、N 个月或 N 年内的动态。
10. 如果启用了日期过滤，扩展会读取每条 Strava 动态里的时间文本。无法识别日期的动态会被跳过，避免误点超出你设置范围的 kudos。
11. 保持 Strava 页面标签页打开。运行开始后可以关闭扩展弹窗，也可以切换到其他窗口继续做别的事；扩展会继续处理已加载的 kudos，并在隐藏状态下重试发现新动态。不要关闭真正的 Strava 页面标签页，否则 Chrome 会销毁页面脚本，扩展无法继续点击。
12. 扩展会记住已经处理过的活动。刷新页面或下次运行时，如果同一个 Strava 活动已经给过 kudos 或确认已经点过，扩展会直接跳过它，不再为了这些旧活动一路向下滚动。
13. 当前加载批次处理完后，扩展会自动刷新 Strava 页面并从顶部继续检查新活动；连续刷新后没有新的可处理活动时会停止。
14. 当 Strava 显示“没有更多近期活动。要查看你的完整活动历史，请访问个人资料或训练日历。”时，扩展会自动停止，不会继续重复滚动。
15. 如果想中途停止，重新打开扩展弹窗并点击 **Stop**。

如果你在安装或重新加载扩展之前已经打开了 Strava 页面，请先刷新 Strava 标签页，否则 Chrome 可能还没有注入 content script。

## What It Does

- Finds Strava kudos action buttons with `button[data-testid="give_kudos_button"]`, with legacy support for `button[data-testid="kudos_button"]`.
- Ignores Strava's non-action "view all kudos" summary buttons.
- Opens `https://www.strava.com/dashboard` automatically when the active tab is not on Strava.
- Checks for an apparent logged-out Strava page before running and warns the user to log in first.
- Recovers from the Chrome message error `Could not establish connection. Receiving end does not exist.` by injecting the content script when needed.
- Skips disabled buttons.
- Checks button state before clicking so already-given kudos are not clicked again.
- Keeps rescanning after it reaches the end of the current loaded batch and scrolls down to discover newly loaded feed items.
- Starts the kudos run through a Manifest V3 background service worker so the popup does not need to stay open.
- Lets the user switch to another Chrome tab or window while the Strava tab continues processing.
- Keeps the run alive when Chrome marks the Strava tab as hidden, continuing loaded-item processing and retrying feed discovery instead of ending.
- Marks the active Strava run tab as not auto-discardable while the sequence is running, reducing Chrome background tab shutdowns.
- Stops cleanly when Strava shows the Chinese or English "no more recent activities" feed boundary.
- Persists a local handled-activity cache so already-kudoed Strava activities are skipped on refreshes and future runs.
- Auto-refreshes the Strava page after each completed loaded feed batch, then resumes from the top to look for newer uncached activities.
- Adds an English/Chinese popup language toggle.
- Lets the user set the minimum and maximum delay between kudos actions from the popup.
- Lets the user limit automation to activities from **Any time** or **Last N days/months/years**.
- Skips out-of-range activities when a date filter is active.
- Skips activities with unreadable dates when a date filter is active, so the extension does not accidentally give kudos outside the selected range.
- Uses randomized timing instead of static pauses:
  - pre-scroll looking delay
  - uneven wheel-like scroll steps
  - occasional mid-scroll hesitation
  - scroll settle delay
  - pre-click dwell delay
  - press-hold delay
  - post-click dwell delay
  - between-target delay
  - occasional longer pauses
- Simulates a more natural interaction path with hover, move, focus, pointer down, pointer up, mouse events, and the native `button.click()`.
- Includes a **Stop** button that requests cancellation while the sequence is running.
- Returns popup status showing whether a kudos sequence is running and the latest click/skip metrics when available.

## Files

This is a standalone Manifest V3 extension with no build step and no external dependencies.

```text
manifest.json  Chrome Extension MV3 manifest and Strava URL scope
background.js  MV3 service worker for tab routing, script injection, start, stop, and status messages
popup.html     Minimal popup UI
popup.js       Popup settings and runtime message dispatch
content.js     Strava feed DOM scanning and kudos interaction flow
README.md      Project documentation
```

## Permissions

The manifest is intentionally narrow:

```json
{
  "permissions": ["activeTab", "scripting", "storage"],
  "host_permissions": ["https://www.strava.com/*"]
}
```

The extension does not request broad browsing access. It is scoped to `https://www.strava.com/*` and only starts a kudos run after you click the popup button.

## Install From Release ZIP

1. Go to the latest release:

   ```text
   https://github.com/JunWeiLi233/strava-auto-kudos/releases/latest
   ```

2. Download the package named like:

   ```text
strava-auto-kudos-v1.0.11.zip
   ```

3. Unzip it somewhere stable on your computer. Do not load it from a temporary downloads folder if you plan to keep using it.

4. Confirm the folder you will load contains `manifest.json` directly:

   ```text
strava-auto-kudos-v1.0.11/
     manifest.json
     background.js
     popup.html
     popup.js
     content.js
     README.md
   ```

5. Open Chrome and go to:

   ```text
   chrome://extensions
   ```

6. Enable **Developer mode**.
7. Click **Load unpacked**.
8. Select the folder that directly contains `manifest.json`.
9. Open or refresh Strava:

   ```text
   https://www.strava.com/
   ```

If Chrome says the manifest is missing or unreadable, you selected the wrong folder. Go one folder deeper or choose the folder that directly contains `manifest.json`.

## Install By Cloning

```bash
git clone https://github.com/JunWeiLi233/strava-auto-kudos.git
```

Then load the cloned repository folder from `chrome://extensions` using **Load unpacked**.

## Updating The Extension

Chrome does not automatically update unpacked extensions. To update manually:

1. Download the newest ZIP from:

   ```text
   https://github.com/JunWeiLi233/strava-auto-kudos/releases/latest
   ```

2. Unzip it.
3. Open:

   ```text
   chrome://extensions
   ```

4. Find **Strava Auto Kudos**.
5. Remove the old extension or reload it if you replaced the files in the same folder.
6. Click **Load unpacked** and select the new folder that directly contains `manifest.json`.
7. Refresh any open Strava tabs.

If you installed by cloning the repository, update with:

```bash
git pull
```

Then reload the extension from `chrome://extensions`.

## Usage

1. Sign in to Strava in Chrome.
2. Open a Strava feed page, such as:

   ```text
   https://www.strava.com/dashboard
   ```

3. Click the **Strava Auto Kudos** extension icon.
4. Use the **中文 / EN** button in the popup header to switch the popup language.
5. Set the **Kudos delay** minimum and maximum seconds if you want a custom delay range between kudos actions.
6. Set **Activity date** if you want a date filter:
   - **Any time** keeps the current behavior and does not filter by activity date.
   - **Last N days/months/years** only gives kudos to activities inside that date range.
7. Press **Give kudos**.
8. If the active tab is not on Strava, the extension opens the Strava dashboard first.
9. If Strava appears logged out, the extension warns you to log in before running.
10. Leave the Strava tab open while the extension scrolls through feed items, processes available kudos buttons, and looks for newly loaded items after the current batch ends.
11. The extension remembers handled activities locally. On refreshes and future runs, activities already given kudos, or confirmed as already clicked, are skipped without scrolling through the whole old feed again.
12. After each loaded feed batch is complete, the extension refreshes Strava and resumes from the top. It stops after repeated refreshes do not reveal new uncached activities.
13. When Strava shows "No more recent activities. To view your full activity history, visit your profile or training calendar.", the extension stops cleanly instead of repeating more discovery scrolls.
14. After the popup says the run started, you can close the popup and use another Chrome tab or window. If Chrome marks the Strava tab as hidden, the extension keeps processing loaded kudos, asks Chrome not to auto-discard the run tab, and retries feed discovery instead of ending.
15. To interrupt an active run, open the popup again and press **Stop**.

Do not close the actual Strava page tab. If that tab is closed, Chrome destroys the page and its content script, so no extension can keep clicking that page. If Strava was already open before you installed or reloaded the extension, refresh the Strava tab once so Chrome injects the content script.

## How The Automation Works

The popup sends a message to the extension background service worker:

```js
{
  action: "STRAVA_AUTO_KUDOS_RUN",
  source: "strava-auto-kudos-popup",
  requestedAt: Date.now(),
  settings: {
    betweenTargets: { min: 1700, max: 4600 },
    dateRange: { mode: "last", value: 7, unit: "days" }
  }
}
```

The background service worker then:

1. Uses the current Strava tab when possible.
2. Activates an existing Strava tab or opens `https://www.strava.com/dashboard` when needed.
3. Injects `content.js` if Chrome has not connected the receiving content script yet.
4. Checks Strava login state before starting.
5. Sends the start command to the content script and stores the active run tab for later status and stop requests.

The content script returns a start confirmation immediately, then continues the kudos loop inside the Strava tab:

1. Selects candidate buttons with `button[data-testid="give_kudos_button"]` and legacy `button[data-testid="kudos_button"]`.
2. Filters out disabled buttons and non-action "view all kudos" summary buttons.
3. Extracts a stable activity key from Strava activity links when available, then checks the local handled-activity cache before doing any click work.
4. If the user enabled **Last N days/months/years**, finds the closest Strava feed entry, reads `time[data-testid="date_at_time"]`, and skips activities outside the selected range.
5. If the date filter is active and a feed entry date cannot be parsed, skips that entry instead of clicking it.
6. Checks each button for already-clicked signals:
   - `aria-pressed`
   - `aria-selected`
   - button labels and titles
   - state-like data attributes
   - class names such as active, selected, filled, or kudoed
   - SVG fill/color signals that match Strava orange
7. Moves toward the candidate with uneven wheel-like scroll steps and occasional mid-scroll hesitation.
8. Waits for a randomized settle period.
9. Re-checks that the button is still connected, enabled, unclicked, and still inside the selected date range.
10. Dispatches pointer and mouse events around the native click.
11. Stores successfully clicked or already-clicked activity keys in `chrome.storage.local`.
12. Waits a randomized delay before moving to the next target.
13. If Chrome reports the Strava page is hidden, keeps the run alive and backs off failed discovery attempts without treating them as completion.
14. When the current loaded feed batch has no uncached kudos buttons left, stores resume state, refreshes the page, and resumes automatically from the top.
15. If repeated refreshes reveal no new uncached activities, the sequence stops.
16. If Strava displays the Chinese or English "no more recent activities" boundary, records that stop reason and ends the sequence.

## Timing Profile

The timing profile lives in `content.js`.

```js
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
```

There are no fixed transaction sleeps in the content script. Each step uses a bounded random range to avoid a repetitive mechanical rhythm. The popup can override `betweenTargets` with a user-selected delay range from `0.8` to `120` seconds.

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
node --check background.js
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
scripting
storage
https://www.strava.com/*
```

## Troubleshooting

### Chrome says the manifest is missing or unreadable

You selected a folder that does not directly contain `manifest.json`.

Open the folder in File Explorer. The folder you select in Chrome must show this file directly:

```text
manifest.json
```

If you see another folder first, open that inner folder and select it instead.

### The popup opens Strava first

If the active tab is not on `https://www.strava.com/*`, the background service worker opens or activates the Strava dashboard before starting the run.

### Nothing happens after clicking the popup button

Use the newest release package. Version `v1.0.9` and newer can inject the content script when Chrome reports `Could not establish connection. Receiving end does not exist.`

If you are on an older version, refresh the Strava tab after installing or reloading the extension. Chrome only injects content scripts into matching pages after the extension is loaded.

### The popup says to log in to Strava

Open the Strava tab, log in normally, then run the extension again.

### Can I close the Strava tab?

You can close the extension popup and use another Chrome tab or window. Do not close the actual Strava page tab. Once Chrome closes that tab, the Strava DOM and content script are gone, so the extension has nothing left to click.

### It clicks fewer buttons than expected

Older versions only processed the kudos buttons loaded when the run started. Version `v1.0.4` keeps scrolling and rescanning after the current batch ends, then stops after several discovery attempts do not reveal new kudos buttons. Version `v1.0.5` also follows Strava's current `give_kudos_button` selector and skips non-action "view all kudos" buttons. Version `v1.0.6` adds the activity date filter, so out-of-range activities and unreadable dates are skipped when the filter is enabled. Version `v1.0.7` starts runs through a background service worker, so the popup does not need to remain open. Version `v1.0.8` adds the language switch. Version `v1.0.9` fixes hidden-tab behavior so the sequence keeps running instead of hard-pausing when the Strava page is hidden, and marks the run tab as not auto-discardable while active. Version `v1.0.10` stops when Strava displays the Chinese or English no-more-recent-activities message. Version `v1.0.11` adds the handled-activity cache and automatic refresh/resume behavior.

### Already-clicked kudos are skipped

That is intentional. The content script checks multiple state signals before clicking so it does not undo or duplicate an existing kudos action.

## Privacy

This extension does not collect analytics, store credentials, call external APIs, or send your Strava data anywhere. It only reads and interacts with the DOM of the active Strava page while you run it.

## Responsible Use

This project is intended as a personal convenience and learning tool. Use it thoughtfully and respect Strava's platform rules, your account limits, and your friends' feeds.
