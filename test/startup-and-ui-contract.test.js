const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");

test("normal startup does not run maintenance or source patch scripts", () => {
  const packageJson = require("../package.json");
  assert.equal(packageJson.scripts.start, "node --no-warnings server/index.js");
  assert.equal(packageJson.scripts.dev, "node --watch --no-warnings server/index.js");
});

test("protected list pages load the auth guard and send authenticated reads", () => {
  for (const page of ["documents.html", "parts.html", "archive.html", "parts-archive.html"]) {
    const html = fs.readFileSync(path.join(root, "public", page), "utf8");
    assert.match(html, /<script src="\/protected-boot\.js"><\/script>/);
  }

  for (const script of ["documents.js", "parts.js", "archive.js", "parts-archive.js"]) {
    const source = fs.readFileSync(path.join(root, "public", script), "utf8");
    assert.match(source, /Auth\.requireAuth\(\)/);
    assert.match(source, /headers: Auth\.authHeaders\(\)/);
  }
});
