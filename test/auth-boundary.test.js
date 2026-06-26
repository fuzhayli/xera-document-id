const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawn } = require("node:child_process");
const { createDatabase } = require("../server/db");

test("auth boundaries and part/document edit rollbacks hold end to end", { timeout: 30000 }, async () => {
  const root = path.resolve(__dirname, "..");
  const directory = path.join(os.tmpdir(), "xera-auth-boundary-test");
  fs.rmSync(directory, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 });
  fs.mkdirSync(directory, { recursive: true });
  const databasePath = path.join(directory, "test.sqlite").replaceAll("\\", "/");
  const port = 33000 + Math.floor(Math.random() * 1000);
  const password = "TestOnly-Strong-Password-2026";
  let output = "";
  let verificationDb = null;
  const child = spawn(process.execPath, ["--no-warnings", "server/index.js"], {
    cwd: root,
    env: {
      ...process.env,
      PORT: String(port),
      TURSO_DATABASE_URL: `file:${databasePath}`,
      TURSO_AUTH_TOKEN: "",
      INITIAL_ADMIN_PASSWORD: password,
      DISABLE_PUBLIC_SIGNUP: "true",
      APP_TIME_ZONE: "Europe/Istanbul"
    },
    windowsHide: true,
    stdio: ["ignore", "pipe", "pipe"]
  });
  child.stdout.on("data", chunk => { output += chunk; });
  child.stderr.on("data", chunk => { output += chunk; });

  try {
    await waitForServer(port, child, () => output);

    for (const [method, endpoint] of [
      ["GET", "/api/documents"],
      ["GET", "/api/documents/archive"],
      ["GET", "/api/documents/export.xlsx"],
      ["GET", "/api/parts"],
      ["GET", "/api/parts/archive"],
      ["GET", "/api/parts/standard-hardware"],
      ["GET", "/api/parts/export.xlsx"],
      ["POST", "/api/parts/custom-export.xlsx"]
    ]) {
      const response = await fetch(`http://127.0.0.1:${port}${endpoint}`, { method });
      assert.equal(response.status, 401, `${method} ${endpoint} should require login`);
    }

    const login = await fetch(`http://127.0.0.1:${port}/api/auth/login`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: "admin@xera.com.tr", password })
    });
    assert.equal(login.status, 200);
    const { token } = await login.json();
    const headers = { authorization: `Bearer ${token}` };

    const documents = await fetch(`http://127.0.0.1:${port}/api/documents`, { headers });
    assert.equal(documents.status, 200);
    assert.equal(documents.headers.has("access-control-allow-origin"), false);

    const exportResponse = await fetch(`http://127.0.0.1:${port}/api/documents/export.xlsx`, { headers });
    assert.equal(exportResponse.status, 200);
    assert.equal(exportResponse.headers.get("content-type"), "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");

    verificationDb = createDatabase({ url: `file:${databasePath}` });
    await verifyPartEditRollback(verificationDb, port, headers);
    await verifyDocumentEditRollback(verificationDb, port, headers);
  } finally {
    if (verificationDb) await verificationDb.close();
    if (!child.killed) child.kill();
    await waitForExit(child);
    try {
      fs.rmSync(directory, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 });
    } catch (error) {
      // The local libSQL driver can retain a Windows file handle until process exit.
      if (error.code !== "EPERM") throw error;
    }
  }
});

async function verifyPartEditRollback(db, port, headers) {
  const admin = await db.prepare("SELECT id FROM users WHERE email = ?").get("admin@xera.com.tr");
  const request = await db.prepare(`
    INSERT INTO part_requests (
      status, project_code, main_code, sequence_no, part_number, revision_code,
      revision_mode, part_name, description, main_category, sub_category,
      requested_by_user_id, approved_by_user_id, approved_at, created_at, updated_at, payload_json
    ) VALUES ('approved', 'X101', '8', '999', 'X101-8999-01A', '01A',
      'released', 'Original Part', 'Original description', 'Dummy', 'Test',
      ?, ?, ?, ?, ?, '{}')
  `).run(admin.id, admin.id, "2026-06-22T00:00:00.000Z", "2026-06-22T00:00:00.000Z", "2026-06-22T00:00:00.000Z");
  const record = await db.prepare(`
    INSERT INTO part_records (
      request_id, source, project_code, main_code, sequence_no, part_number,
      revision_code, revision_mode, part_name, description, main_category,
      sub_category, requested_by_user_id, approved_by_user_id, approved_at, created_at
    ) VALUES (?, 'request', 'X101', '8', '999', 'X101-8999-01A',
      '01A', 'released', 'Original Part', 'Original description', 'Dummy',
      'Test', ?, ?, ?, ?)
  `).run(Number(request.lastInsertRowid), admin.id, admin.id, "2026-06-22T00:00:00.000Z", "2026-06-22T00:00:00.000Z");
  await db.exec("CREATE TRIGGER fail_part_request_update BEFORE UPDATE ON part_requests BEGIN SELECT RAISE(ABORT, 'forced part request update failure'); END");

  const response = await fetch(`http://127.0.0.1:${port}/api/admin/parts/${record.lastInsertRowid}/edit`, {
    method: "POST",
    headers: { ...headers, "content-type": "application/json" },
    body: JSON.stringify({ part_name: "Changed Part" })
  });
  assert.equal(response.status, 500);
  const after = await db.prepare("SELECT part_name FROM part_records WHERE id = ?").get(Number(record.lastInsertRowid));
  assert.equal(after.part_name, "Original Part");
  await db.exec("DROP TRIGGER fail_part_request_update");
}

async function verifyDocumentEditRollback(db, port, headers) {
  const admin = await db.prepare("SELECT id FROM users WHERE email = ?").get("admin@xera.com.tr");
  const request = await db.prepare(`
    INSERT INTO document_requests (
      status, category, company_code, year_yy, sequence_no, document_no, revision,
      reference_type, reference_value, document_name, written_by, creation_date,
      control_status, generated_filename, requested_by_user_id, approved_by_user_id,
      approved_at, created_at, updated_at, payload_json
    ) VALUES ('approved', 'D', 'X', '26', '999', 'XD-26-999', 'r00',
      'model', 'MODEL-A', 'Original Document', 'Test User', '2026-06-22',
      'controlled', 'XD-26-999_MODEL-A_Original Document_r00', ?, ?, ?, ?, ?, '{}')
  `).run(admin.id, admin.id, "2026-06-22T00:00:00.000Z", "2026-06-22T00:00:00.000Z", "2026-06-22T00:00:00.000Z");
  const record = await db.prepare(`
    INSERT INTO document_records (
      request_id, category, company_code, year_yy, sequence_no, document_no, revision,
      reference_type, reference_value, document_name, written_by, creation_date,
      control_status, generated_filename, approved_by_user_id, approved_at
    ) VALUES (?, 'D', 'X', '26', '999', 'XD-26-999', 'r00',
      'model', 'MODEL-A', 'Original Document', 'Test User', '2026-06-22',
      'controlled', 'XD-26-999_MODEL-A_Original Document_r00', ?, ?)
  `).run(Number(request.lastInsertRowid), admin.id, "2026-06-22T00:00:00.000Z");

  const filenameSyncResponse = await fetch(`http://127.0.0.1:${port}/api/admin/documents/${record.lastInsertRowid}/edit`, {
    method: "POST",
    headers: { ...headers, "content-type": "application/json" },
    body: JSON.stringify({
      revision: "r01",
      generated_filename: "XD-26-999_MODEL-A_Original Document_r00"
    })
  });
  assert.equal(filenameSyncResponse.status, 200);
  const filenameSync = await filenameSyncResponse.json();
  assert.equal(filenameSync.document.revision, "r01");
  assert.equal(filenameSync.document.generated_filename, "XD-26-999_MODEL-A_Original Document_r01");
  const syncedRecord = await db.prepare("SELECT revision, generated_filename FROM document_records WHERE id = ?").get(Number(record.lastInsertRowid));
  assert.equal(syncedRecord.revision, "r01");
  assert.equal(syncedRecord.generated_filename, "XD-26-999_MODEL-A_Original Document_r01");

  await db.exec("CREATE TRIGGER fail_document_request_update BEFORE UPDATE ON document_requests BEGIN SELECT RAISE(ABORT, 'forced document request update failure'); END");

  const response = await fetch(`http://127.0.0.1:${port}/api/admin/documents/${record.lastInsertRowid}/edit`, {
    method: "POST",
    headers: { ...headers, "content-type": "application/json" },
    body: JSON.stringify({ document_name: "Changed Document" })
  });
  assert.equal(response.status, 500);
  const after = await db.prepare("SELECT document_name FROM document_records WHERE id = ?").get(Number(record.lastInsertRowid));
  assert.equal(after.document_name, "Original Document");
  await db.exec("DROP TRIGGER fail_document_request_update");
}

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
