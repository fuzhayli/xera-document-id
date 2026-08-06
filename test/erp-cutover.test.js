const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawn } = require("node:child_process");

test("production defaults the legacy site to a read-only ERP cutover", { timeout: 15000 }, async () => {
  const root = path.resolve(__dirname, "..");
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "xera-erp-cutover-"));
  const databasePath = path.join(directory, "test.sqlite").replaceAll("\\", "/");
  const port = 34000 + Math.floor(Math.random() * 1000);
  let output = "";
  const child = spawn(process.execPath, ["--no-warnings", "server/index.js"], {
    cwd: root,
    env: {
      ...process.env,
      PORT: String(port),
      TURSO_DATABASE_URL: `file:${databasePath}`,
      TURSO_AUTH_TOKEN: "",
      NODE_ENV: "production",
      DISABLE_PUBLIC_SIGNUP: "true",
      INITIAL_ADMIN_PASSWORD: "TestOnly-Strong-Password-2026"
    },
    windowsHide: true,
    stdio: ["ignore", "pipe", "pipe"]
  });
  child.stdout.on("data", chunk => { output += chunk; });
  child.stderr.on("data", chunk => { output += chunk; });

  try {
    await waitForServer(port, child, () => output);

    const configResponse = await fetch(`http://127.0.0.1:${port}/api/public-config`);
    assert.equal(configResponse.status, 200);
    const config = await configResponse.json();
    assert.equal(config.legacy_read_only, true);
    assert.equal(config.allow_public_signup, false);
    assert.equal(config.erp_url, "http://10.12.40.173:8080/app/xera-control-center");

    for (const endpoint of ["/api/auth/signup", "/api/requests", "/api/parts/requests", "/api/parts/preview", "/api/admin/users"]) {
      const response = await fetch(`http://127.0.0.1:${port}${endpoint}`, { method: "POST" });
      assert.equal(response.status, 409, `${endpoint} should be blocked by the ERP cutover`);
      const body = await response.json();
      assert.equal(body.error, "erp_cutover_read_only");
      assert.equal(body.erp_url, config.erp_url);
    }

    const invalidLogin = await fetch(`http://127.0.0.1:${port}/api/auth/login`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: "missing@xera.com.tr", password: "invalid" })
    });
    assert.notEqual(invalidLogin.status, 409);
    assert.notEqual((await invalidLogin.json()).error, "erp_cutover_read_only");

    const customExport = await fetch(`http://127.0.0.1:${port}/api/parts/custom-export.xlsx`, { method: "POST" });
    assert.equal(customExport.status, 401);
  } finally {
    if (!child.killed) child.kill();
    await waitForExit(child);
    fs.rmSync(directory, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 });
  }
});

test("read-only UI advertises ERP and removes legacy mutation controls", () => {
  const root = path.resolve(__dirname, "..");
  const uiSource = fs.readFileSync(path.join(root, "public", "ui.js"), "utf8");
  const styles = fs.readFileSync(path.join(root, "public", "styles.css"), "utf8");

  assert.match(uiSource, /Read-only archive/);
  assert.match(uiSource, /New Request \(ERP\)/);
  assert.match(uiSource, /Document and part codes/);
  assert.match(uiSource, /window\.location\.replace\(config\.erp_url\)/);
  assert.match(styles, /body\.legacy-read-only #documentRevisionRequestBtn/);
  assert.match(styles, /body\.legacy-read-only #partRevisionRequestBtn/);
  assert.match(styles, /body\.legacy-read-only #createUserForm/);
});

async function waitForServer(port, child, getOutput) {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    if (child.exitCode !== null) throw new Error(`Server exited before startup.\n${getOutput()}`);
    try {
      const response = await fetch(`http://127.0.0.1:${port}/api/health`);
      if (response.ok) return;
    } catch {
      // Server is still starting.
    }
    await new Promise(resolve => setTimeout(resolve, 50));
  }
  throw new Error(`Server did not become ready.\n${getOutput()}`);
}

function waitForExit(child) {
  if (child.exitCode !== null) return Promise.resolve();
  return new Promise(resolve => child.once("exit", resolve));
}
