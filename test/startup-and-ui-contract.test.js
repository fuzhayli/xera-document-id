const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");

test("normal startup does not run maintenance or source patch scripts", () => {
  const packageJson = require("../package.json");
  assert.equal(packageJson.scripts.start, "node --no-warnings server/index.js");
  assert.equal(packageJson.scripts.dev, "node --watch --no-warnings server/index.js");
  assert.equal(Object.keys(packageJson.scripts).some(name => name.startsWith("patch:")), false);
});

test("workbook imports only expand bounded XML entries", () => {
  const source = fs.readFileSync(path.join(root, "server", "index.js"), "utf8");
  assert.match(source, /WORKBOOK_ENTRY_NAMES\.has\(fileName\)/);
  assert.match(source, /maxOutputLength:\s*WORKBOOK_ENTRY_SIZE_LIMIT/);
  assert.match(source, /WORKBOOK_TOTAL_SIZE_LIMIT/);
});

test("protected list pages load the auth guard and send authenticated reads", () => {
  const protectedPages = [
    "admin.html",
    "archive.html",
    "deleted-items.html",
    "documents.html",
    "index.html",
    "part-request.html",
    "parts.html",
    "parts-archive.html",
    "users.html"
  ];
  for (const page of protectedPages) {
    const html = fs.readFileSync(path.join(root, "public", page), "utf8");
    assert.match(html, /<script src="\/protected-boot\.js"><\/script>/);
    assert.match(html, /<script src="\/auth\.js"><\/script>/);
    assert.match(html, /<script src="\/ui\.js"><\/script>/);
  }

  for (const script of ["documents.js", "parts.js", "archive.js", "parts-archive.js"]) {
    const source = fs.readFileSync(path.join(root, "public", script), "utf8");
    assert.match(source, /Auth\.requireAuth\(\)/);
    assert.match(source, /XeraUi/);
  }
});

test("protected pages use shared XeraUi helpers instead of local duplicates", () => {
  const sharedHelperPattern = /(?:async\s+)?function\s+(?:apiGet|apiPost|parseResponse|showMessage|hideMessage|setApiStatus|escapeHtml|formatDateTime|normalizeSearch|getActiveSearchFields|matchesScopedSearch|flattenSearchValue)\s*\(/;
  const protectedScripts = [
    "admin.js",
    "app.js",
    "archive.js",
    "deleted-items.js",
    "documents.js",
    "part-request.js",
    "parts.js",
    "parts-archive.js",
    "users.js"
  ];

  for (const script of protectedScripts) {
    const source = fs.readFileSync(path.join(root, "public", script), "utf8");
    assert.match(source, /XeraUi/);
    assert.doesNotMatch(source, sharedHelperPattern, `${script} should use public/ui.js shared helpers`);
  }
});
