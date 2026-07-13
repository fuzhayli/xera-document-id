const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

const ROOT = path.resolve(__dirname, "..");

function createStorage() {
  const values = new Map();
  return {
    getItem(key) {
      return values.has(key) ? values.get(key) : null;
    },
    setItem(key, value) {
      values.set(key, String(value));
    },
    removeItem(key) {
      values.delete(key);
    }
  };
}

test("remember me chooses session or persistent browser storage", () => {
  const localStorage = createStorage();
  const sessionStorage = createStorage();
  const context = {
    window: {},
    localStorage,
    sessionStorage,
    document: {},
    fetch: async () => ({ ok: false })
  };

  vm.runInNewContext(
    fs.readFileSync(path.join(ROOT, "public", "auth.js"), "utf8"),
    context
  );

  context.window.Auth.setSession("temporary-token", false);
  assert.equal(sessionStorage.getItem("xeraSessionToken"), "temporary-token");
  assert.equal(localStorage.getItem("xeraSessionToken"), null);
  assert.equal(context.window.Auth.getToken(), "temporary-token");

  context.window.Auth.setSession("persistent-token", true);
  assert.equal(sessionStorage.getItem("xeraSessionToken"), null);
  assert.equal(localStorage.getItem("xeraSessionToken"), "persistent-token");
  assert.equal(context.window.Auth.getToken(), "persistent-token");

  context.window.Auth.clearSession();
  assert.equal(context.window.Auth.getToken(), "");
});

test("English UI declares the correct language and login help is not a dead link", () => {
  const htmlFiles = fs.readdirSync(path.join(ROOT, "public"))
    .filter(file => file.endsWith(".html"));

  for (const file of htmlFiles) {
    const html = fs.readFileSync(path.join(ROOT, "public", file), "utf8");
    assert.match(html, /<html lang="en">/, `${file} must declare its English UI language`);
  }

  const loginHtml = fs.readFileSync(path.join(ROOT, "public", "login.html"), "utf8");
  assert.doesNotMatch(loginHtml, /href="\/login\.html">Forgot password\?/);
  assert.match(loginHtml, /id="rememberSession"/);
  assert.match(loginHtml, /Ask an administrator to reset it/);
  assert.match(loginHtml, /id="messageBox"[^>]*role="alert"[^>]*aria-live="polite"/);

  const styles = fs.readFileSync(path.join(ROOT, "public", "styles.css"), "utf8");
  assert.match(styles, /\.auth-create\[hidden\][\s\S]*display:\s*none\s*!important/);
});
