const assert = require("node:assert/strict");
const { spawn } = require("node:child_process");
const fs = require("node:fs/promises");
const http = require("node:http");
const net = require("node:net");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const root = path.resolve(__dirname, "..");
const chromePath = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";

function fileUrl(filePath) {
  return `file:///${filePath.replace(/\\/g, "/").replace(/^([A-Za-z]):/, "$1:")}`;
}

function getFreePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      server.close(() => resolve(address.port));
    });
    server.on("error", reject);
  });
}

function fetchJson(url) {
  return new Promise((resolve, reject) => {
    const req = http.get(url, (res) => {
      let body = "";
      res.setEncoding("utf8");
      res.on("data", (chunk) => { body += chunk; });
      res.on("end", () => {
        try {
          resolve(JSON.parse(body));
        } catch (error) {
          reject(error);
        }
      });
    });
    req.on("error", reject);
    req.setTimeout(500, () => {
      req.destroy(new Error("Timed out waiting for Chrome debugging endpoint."));
    });
  });
}

async function waitForChrome(port) {
  const deadline = Date.now() + 10000;
  let lastError = null;
  while (Date.now() < deadline) {
    try {
      return await fetchJson(`http://127.0.0.1:${port}/json/version`);
    } catch (error) {
      lastError = error;
      await new Promise((resolve) => setTimeout(resolve, 120));
    }
  }
  throw lastError || new Error("Chrome debugging endpoint did not start.");
}

class CdpSession {
  constructor(socket) {
    this.socket = socket;
    this.nextId = 1;
    this.pending = new Map();
    this.events = new Map();

    socket.addEventListener("message", (event) => {
      const message = JSON.parse(event.data);
      if (message.id && this.pending.has(message.id)) {
        const { resolve, reject } = this.pending.get(message.id);
        this.pending.delete(message.id);
        if (message.error) reject(new Error(message.error.message));
        else resolve(message.result || {});
        return;
      }
      if (message.method && this.events.has(message.method)) {
        for (const handler of this.events.get(message.method)) handler(message.params || {});
      }
    });
  }

  send(method, params = {}) {
    const id = this.nextId++;
    this.socket.send(JSON.stringify({ id, method, params }));
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      setTimeout(() => {
        if (!this.pending.has(id)) return;
        this.pending.delete(id);
        reject(new Error(`CDP command timed out: ${method}`));
      }, 8000);
    });
  }

  on(method, handler) {
    const handlers = this.events.get(method) || [];
    handlers.push(handler);
    this.events.set(method, handlers);
  }

  once(method) {
    return new Promise((resolve) => {
      const handler = (params) => {
        const handlers = this.events.get(method) || [];
        this.events.set(method, handlers.filter((item) => item !== handler));
        resolve(params);
      };
      this.on(method, handler);
    });
  }
}

async function connectToCdp(webSocketDebuggerUrl) {
  const socket = new WebSocket(webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    socket.addEventListener("open", resolve, { once: true });
    socket.addEventListener("error", reject, { once: true });
  });
  return new CdpSession(socket);
}

async function createPopupHarness() {
  const popupHtml = await fs.readFile(path.join(root, "popup.html"), "utf8");
  const popupJs = await fs.readFile(path.join(root, "popup.js"), "utf8");
  const mockChrome = `
    window.chrome = {
      runtime: {
        lastError: null,
        sendMessage(message, callback) {
          const action = message && message.action;
          if (action === "STRAVA_AUTO_KUDOS_STATUS") {
            callback({ ok: true, state: { running: false, cancelRequested: false, metrics: null } });
            return;
          }
          callback({ ok: true, state: { running: false, cancelRequested: false, metrics: null } });
        }
      },
      storage: {
        local: {
          get(key, callback) { callback({}); },
          set(_items, callback) { if (callback) callback(); }
        }
      }
    };
  `;
  const harness = popupHtml.replace(
    '<script src="popup.js"></script>',
    `<script>${mockChrome}</script><script>${popupJs.replace(/<\/script/gi, "<\\\\/script")}</script>`
  );
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "strava-popup-browser-"));
  const harnessPath = path.join(tempDir, "popup-harness.html");
  await fs.writeFile(harnessPath, harness);
  return { tempDir, harnessPath };
}

async function removeDirectoryWithRetries(directory) {
  for (let attempt = 0; attempt < 8; attempt += 1) {
    try {
      await fs.rm(directory, { recursive: true, force: true });
      return;
    } catch (error) {
      if (!["EBUSY", "ENOTEMPTY", "EPERM"].includes(error.code)) throw error;
      await new Promise((resolve) => setTimeout(resolve, 150 + attempt * 100));
    }
  }
  await fs.rm(directory, { recursive: true, force: true });
}

function stopChrome(chrome) {
  return new Promise((resolve) => {
    if (!chrome || chrome.exitCode !== null) {
      resolve();
      return;
    }
    chrome.once("exit", resolve);
    chrome.kill();
    setTimeout(resolve, 3000);
  });
}

test("popup renders in headless Chrome with usable controls and refined layout", async () => {
  assert.ok(await fs.stat(chromePath).then(() => true, () => false), "Chrome is required for browser popup test.");

  const { tempDir, harnessPath } = await createPopupHarness();
  const userDataDir = await fs.mkdtemp(path.join(os.tmpdir(), "strava-popup-chrome-"));
  const port = await getFreePort();
  const chrome = spawn(chromePath, [
    "--headless=new",
    `--remote-debugging-port=${port}`,
    `--user-data-dir=${userDataDir}`,
    "--disable-gpu",
    "--no-first-run",
    "--no-default-browser-check",
    "about:blank"
  ], { stdio: "ignore" });

  try {
    await waitForChrome(port);
    const targets = await fetchJson(`http://127.0.0.1:${port}/json/list`);
    const pageTarget = targets.find((target) => target.type === "page" && target.webSocketDebuggerUrl);
    assert.ok(pageTarget, "Chrome did not expose a page target for the popup test.");
    const cdp = await connectToCdp(pageTarget.webSocketDebuggerUrl);
    const runtimeErrors = [];
    cdp.on("Runtime.exceptionThrown", (params) => {
      runtimeErrors.push(params.exceptionDetails && params.exceptionDetails.text);
    });
    await cdp.send("Runtime.enable");
    await cdp.send("Page.enable");
    const loaded = cdp.once("Page.loadEventFired");
    await cdp.send("Page.navigate", { url: fileUrl(harnessPath) });
    await loaded;

    const result = await cdp.send("Runtime.evaluate", {
      returnByValue: true,
      expression: `(() => {
        const status = document.querySelector("#status");
        const runNow = document.querySelector("#runNowButton");
        const stop = document.querySelector("#stopButton");
        const autoPanel = document.querySelector("#autoModeSection");
        const bodyStyle = getComputedStyle(document.body);
        const panelStyle = getComputedStyle(autoPanel);
        const buttonStyle = getComputedStyle(runNow);
        return {
          title: document.querySelector("h1").textContent.trim(),
          runNowText: runNow.textContent.trim(),
          stopText: stop.textContent.trim(),
          stopDisabled: stop.disabled,
          statusText: status.textContent.trim(),
          bodyWidth: document.body.getBoundingClientRect().width,
          panelDisplay: panelStyle.display,
          panelRadius: panelStyle.borderRadius,
          buttonRadius: buttonStyle.borderRadius,
          fontFamily: bodyStyle.fontFamily
        };
      })()`
    });

    assert.deepEqual(runtimeErrors, []);
    assert.equal(result.result.value.title, "Strava Kudos");
    assert.equal(result.result.value.runNowText, "Run now");
    assert.equal(result.result.value.stopText, "Stop");
    assert.equal(result.result.value.stopDisabled, true);
    assert.match(result.result.value.statusText, /Auto mode off|Run now/i);
    assert.equal(result.result.value.bodyWidth, 360);
    assert.equal(result.result.value.panelDisplay, "grid");
    assert.equal(result.result.value.panelRadius, "8px");
    assert.equal(result.result.value.buttonRadius, "8px");
    assert.match(result.result.value.fontFamily, /system-ui|Segoe UI|sans-serif/);
  } finally {
    await stopChrome(chrome);
    await removeDirectoryWithRetries(tempDir);
    await removeDirectoryWithRetries(userDataDir);
  }
});
