const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");

test("X106 Mobile System is available across part project rules and filters", () => {
  const { PART_PROJECTS, PART_PROJECT_CODES } = require("../server/rules");
  const partsHtml = fs.readFileSync(path.join(root, "public", "parts.html"), "utf8");
  const partsSource = fs.readFileSync(path.join(root, "public", "parts.js"), "utf8");
  const archiveHtml = fs.readFileSync(path.join(root, "public", "parts-archive.html"), "utf8");
  const archiveSource = fs.readFileSync(path.join(root, "public", "parts-archive.js"), "utf8");

  assert.deepEqual(
    PART_PROJECTS.find(project => project.code === "X106"),
    { code: "X106", description: "Mobile System" }
  );
  assert.ok(PART_PROJECT_CODES.includes("X106"));
  assert.match(partsSource, /X106:\s*"Mobile System"/);
  assert.match(partsSource, /api\/parts\/rules/);
  assert.match(partsSource, /\.\.\.state\.projects\.map\(project => project\.code\)/);
  assert.match(archiveSource, /api\/parts\/rules/);
  assert.match(archiveSource, /`\$\{code\} - \$\{project\.description\}`/);
  assert.match(partsHtml, /parts\.js\?v=x106-mobile-system-20260730/);
  assert.match(archiveHtml, /parts-archive\.js\?v=x106-mobile-system-20260730/);
});

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

test("My Requests table renders generated filenames", () => {
  const html = fs.readFileSync(path.join(root, "public", "index.html"), "utf8");
  const source = fs.readFileSync(path.join(root, "public", "app.js"), "utf8");
  const renderRequests = source.match(/function renderRequests\(requests\) \{[\s\S]*?(?=\nfunction formatRequestCategory)/)?.[0] || "";

  assert.match(html, /<th>Filename<\/th>/);
  assert.match(html, /<td colspan="8" class="empty-cell">No records<\/td>/);
  assert.match(renderRequests, /request\.generated_filename \|\| "-"/);
  assert.match(renderRequests, /colspan="8"/);
});

test("ECR request UI separates new and existing workflows and locks derived fields", () => {
  const html = fs.readFileSync(path.join(root, "public", "index.html"), "utf8");
  const source = fs.readFileSync(path.join(root, "public", "app.js"), "utf8");

  assert.match(html, /id="ecWorkflow"/);
  assert.match(html, /Open new ECR/);
  assert.match(html, /Advance existing ECR/);
  assert.match(html, /id="ecExisting"/);
  assert.match(source, /api\/ec\/workflow-options/);
  assert.match(source, /elements\.extraType\.disabled = true/);
  assert.match(source, /elements\.extraCode\.readOnly = true/);
  assert.match(source, /ec_workflow:/);
  assert.match(source, /ec_base_document_no:/);
});
