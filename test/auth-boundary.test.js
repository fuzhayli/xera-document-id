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
      NODE_ENV: "production",
      APP_TIME_ZONE: "Europe/Istanbul"
    },
    windowsHide: true,
    stdio: ["ignore", "pipe", "pipe"]
  });
  child.stdout.on("data", chunk => { output += chunk; });
  child.stderr.on("data", chunk => { output += chunk; });

  try {
    await waitForServer(port, child, () => output);

    const health = await fetch(`http://127.0.0.1:${port}/api/health`);
    assert.equal(health.status, 200);
    assert.deepEqual(await health.json(), { ok: true });
    assert.equal(health.headers.get("cache-control"), "no-store");
    assert.equal(health.headers.get("x-content-type-options"), "nosniff");
    assert.equal(health.headers.get("x-frame-options"), "DENY");

    const loginPage = await fetch(`http://127.0.0.1:${port}/login.html`);
    assert.equal(loginPage.status, 200);
    assert.equal(loginPage.headers.get("cache-control"), "no-store");
    assert.match(loginPage.headers.get("content-security-policy"), /frame-ancestors 'none'/);
    assert.equal(loginPage.headers.get("x-frame-options"), "DENY");

    for (const endpoint of ["/?embed=request&view=new", "/part-request.html?embed=part-request"]) {
      const embeddedRequestPage = await fetch(`http://127.0.0.1:${port}${endpoint}`);
      assert.equal(embeddedRequestPage.status, 200);
      assert.match(embeddedRequestPage.headers.get("content-security-policy"), /frame-ancestors 'self'/);
      assert.equal(embeddedRequestPage.headers.get("x-frame-options"), "SAMEORIGIN");
    }

    for (const [method, endpoint] of [
      ["GET", "/api/documents"],
      ["GET", "/api/ec/workflow-options"],
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
    await verifyX106MobileSystemProject(port, headers);
    await verifyMrIncomingInspectionRequest(verificationDb, port, headers);
    await verifyEcRDocumentNamePropagation(verificationDb, port, headers);
    await verifyLegacyPendingQueues(verificationDb, port, headers);
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

async function verifyX106MobileSystemProject(port, headers) {
  const rulesResponse = await fetch(`http://127.0.0.1:${port}/api/parts/rules`, { headers });
  assert.equal(rulesResponse.status, 200);
  const rules = await rulesResponse.json();
  assert.deepEqual(
    rules.projects.find(project => project.code === "X106"),
    { code: "X106", description: "Mobile System" }
  );

  const previewResponse = await fetch(`http://127.0.0.1:${port}/api/parts/preview`, {
    method: "POST",
    headers: { ...headers, "content-type": "application/json" },
    body: JSON.stringify({
      project_code: "X106",
      main_code: "1",
      revision_mode: "released",
      revision_code: "01A",
      part_name: "MOBILE_SYSTEM_TEST_PART",
      description: "Mobile System test part",
      sub_category: "Test"
    })
  });
  assert.equal(previewResponse.status, 200);
  const preview = await previewResponse.json();
  assert.equal(preview.valid, true);
  assert.equal(preview.part_number_preview, "X106-1001-01A");
}

async function verifyMrIncomingInspectionRequest(db, port, headers) {
  const body = {
    category: "MR",
    reference_type: "incominginspection",
    reference_value: "1501-1107",
    document_name: "",
    revision: "r00"
  };
  const previewResponse = await fetch(`http://127.0.0.1:${port}/api/preview`, {
    method: "POST",
    headers: { ...headers, "content-type": "application/json" },
    body: JSON.stringify(body)
  });
  assert.equal(previewResponse.status, 200);
  const preview = await previewResponse.json();
  assert.equal(preview.valid, true);
  assert.match(preview.generated_filename_preview, /^XMR-\d{2}-001_1501-1107_\d{8}$/);
  assert.equal(preview.generated_filename_preview.includes("Incoming Inspection"), false);

  const requestResponse = await fetch(`http://127.0.0.1:${port}/api/requests`, {
    method: "POST",
    headers: { ...headers, "content-type": "application/json" },
    body: JSON.stringify(body)
  });
  assert.equal(requestResponse.status, 201);
  const { request } = await requestResponse.json();
  assert.equal(request.status, "approved");
  assert.equal(request.category, "MR");
  assert.equal(request.reference_type, "incominginspection");
  assert.equal(request.document_name, "");
  assert.match(request.generated_filename, /^XMR-\d{2}-001_1501-1107_\d{8}$/);

  const record = await db.prepare("SELECT reference_type, document_name, generated_filename FROM document_records WHERE request_id = ?").get(Number(request.id));
  assert.equal(record.reference_type, "incominginspection");
  assert.equal(record.document_name, "");
  assert.equal(record.generated_filename, request.generated_filename);
}

async function verifyEcRDocumentNamePropagation(db, port, headers) {
  const baseDocumentName = "Critical EC Change";
  const initialOptionsResponse = await fetch(`http://127.0.0.1:${port}/api/ec/workflow-options`, { headers });
  assert.equal(initialOptionsResponse.status, 200);
  const initialOptions = await initialOptionsResponse.json();
  assert.equal(initialOptions.new_order, "A");
  assert.deepEqual(initialOptions.existing, []);

  const baseResponse = await fetch(`http://127.0.0.1:${port}/api/requests`, {
    method: "POST",
    headers: { ...headers, "content-type": "application/json" },
    body: JSON.stringify({
      category: "EC",
      ec_workflow: "new",
      detail_type: "N",
      detail_code: "Z",
      reference_type: "model",
      reference_value: "MODEL-SHOULD-SKIP",
      document_name: baseDocumentName,
      revision: "r00"
    })
  });
  assert.equal(baseResponse.status, 201);
  const { request: baseRequest } = await baseResponse.json();
  assert.equal(baseRequest.reference_value, "");
  assert.match(baseRequest.generated_filename, /^XEC-\d{2}A-R_Critical EC Change_r00$/);
  assert.equal(baseRequest.generated_filename.includes("MODEL-SHOULD-SKIP"), false);

  const afterBaseOptionsResponse = await fetch(`http://127.0.0.1:${port}/api/ec/workflow-options`, { headers });
  assert.equal(afterBaseOptionsResponse.status, 200);
  const afterBaseOptions = await afterBaseOptionsResponse.json();
  assert.equal(afterBaseOptions.new_order, "B");
  assert.equal(afterBaseOptions.existing.length, 1);
  assert.equal(afterBaseOptions.existing[0].base_document_no, baseRequest.document_no);
  assert.equal(afterBaseOptions.existing[0].current_type, "R");
  assert.equal(afterBaseOptions.existing[0].next_type, "RR");

  const previewResponse = await fetch(`http://127.0.0.1:${port}/api/preview`, {
    method: "POST",
    headers: { ...headers, "content-type": "application/json" },
    body: JSON.stringify({
      category: "EC",
      ec_workflow: "existing",
      ec_base_document_no: baseRequest.document_no,
      detail_type: "N",
      detail_code: "Z",
      document_name: "Wrong Name",
      revision: "r00"
    })
  });
  assert.equal(previewResponse.status, 200);
  const preview = await previewResponse.json();
  assert.equal(preview.input.document_name, baseDocumentName);
  assert.equal(preview.input.detail_type, "RR");
  assert.equal(preview.input.detail_code, "A");
  assert.match(preview.generated_filename_preview, /^XEC-\d{2}A-Rr-001_Critical EC Change_r00$/);

  const relatedResponse = await fetch(`http://127.0.0.1:${port}/api/requests`, {
    method: "POST",
    headers: { ...headers, "content-type": "application/json" },
    body: JSON.stringify({
      category: "EC",
      ec_workflow: "existing",
      ec_base_document_no: baseRequest.document_no,
      detail_type: "N",
      detail_code: "Z",
      reference_type: "model",
      reference_value: "ANOTHER-MODEL-SHOULD-SKIP",
      document_name: "Wrong Name",
      revision: "r00"
    })
  });
  assert.equal(relatedResponse.status, 201);
  const { request: relatedRequest } = await relatedResponse.json();
  assert.equal(relatedRequest.document_name, baseDocumentName);
  assert.equal(relatedRequest.reference_value, "");
  assert.match(relatedRequest.generated_filename, /^XEC-\d{2}A-Rr-001_Critical EC Change_r00$/);
  assert.equal(relatedRequest.generated_filename.includes("ANOTHER-MODEL-SHOULD-SKIP"), false);

  const record = await db.prepare("SELECT document_name, generated_filename FROM document_records WHERE request_id = ?").get(Number(relatedRequest.id));
  assert.equal(record.document_name, baseDocumentName);
  assert.equal(record.generated_filename, relatedRequest.generated_filename);

  const afterRelatedOptionsResponse = await fetch(`http://127.0.0.1:${port}/api/ec/workflow-options`, { headers });
  assert.equal(afterRelatedOptionsResponse.status, 200);
  const afterRelatedOptions = await afterRelatedOptionsResponse.json();
  assert.equal(afterRelatedOptions.existing[0].current_type, "RR");
  assert.equal(afterRelatedOptions.existing[0].next_type, "E");

  const evaluationResponse = await fetch(`http://127.0.0.1:${port}/api/requests`, {
    method: "POST",
    headers: { ...headers, "content-type": "application/json" },
    body: JSON.stringify({
      category: "EC",
      ec_workflow: "existing",
      ec_base_document_no: baseRequest.document_no,
      detail_type: "N",
      detail_code: "Z",
      document_name: "Wrong Name",
      revision: "r00"
    })
  });
  assert.equal(evaluationResponse.status, 201);
  const { request: evaluationRequest } = await evaluationResponse.json();
  assert.match(evaluationRequest.generated_filename, /^XEC-\d{2}A-E_Critical EC Change_r00$/);

  const afterEvaluationOptionsResponse = await fetch(`http://127.0.0.1:${port}/api/ec/workflow-options`, { headers });
  assert.equal(afterEvaluationOptionsResponse.status, 200);
  const afterEvaluationOptions = await afterEvaluationOptionsResponse.json();
  assert.equal(afterEvaluationOptions.existing[0].current_type, "E");
  assert.equal(afterEvaluationOptions.existing[0].next_type, "O");

  const invalidExistingResponse = await fetch(`http://127.0.0.1:${port}/api/preview`, {
    method: "POST",
    headers: { ...headers, "content-type": "application/json" },
    body: JSON.stringify({
      category: "EC",
      ec_workflow: "existing",
      ec_base_document_no: "XEC-26Z-R",
      document_name: "Invalid",
      revision: "r00"
    })
  });
  assert.equal(invalidExistingResponse.status, 422);
}

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
  assert.equal((await response.json()).message, "Internal server error.");
  const after = await db.prepare("SELECT part_name FROM part_records WHERE id = ?").get(Number(record.lastInsertRowid));
  assert.equal(after.part_name, "Original Part");
  await db.exec("DROP TRIGGER fail_part_request_update");
}

async function verifyLegacyPendingQueues(db, port, headers) {
  const admin = await db.prepare("SELECT id FROM users WHERE email = ?").get("admin@xera.com.tr");
  const now = "2026-06-22T00:00:00.000Z";

  const approveDocument = await db.prepare(`
    INSERT INTO document_requests (
      status, category, company_code, year_yy, sequence_no, document_no, revision,
      reference_type, reference_value, document_name, written_by, creation_date,
      control_status, generated_filename, requested_by_user_id, created_at, updated_at, payload_json
    ) VALUES ('pending', 'D', 'X', '26', '901', 'XD-26-901', 'r00',
      'model', 'LEGACY-MODEL', 'Legacy Pending Document', 'Admin User', '2026-06-22',
      'controlled', 'XD-26-901_LEGACY-MODEL_Legacy Pending Document_r00', ?, ?, ?, '{}')
  `).run(admin.id, now, now);
  const rejectDocument = await db.prepare(`
    INSERT INTO document_requests (
      status, category, company_code, year_yy, sequence_no, document_no, revision,
      reference_type, reference_value, document_name, written_by, creation_date,
      control_status, generated_filename, requested_by_user_id, created_at, updated_at, payload_json
    ) VALUES ('pending', 'R', 'X', '26', '902', 'XR-26-902', 'r00',
      'department', 'R&D', 'Legacy Rejected Record', 'Admin User', '2026-06-22',
      'controlled', 'XR-26-902_R&D_Legacy Rejected Record_20260622', ?, ?, ?, '{}')
  `).run(admin.id, now, now);
  const approvePart = await db.prepare(`
    INSERT INTO part_requests (
      status, project_code, main_code, sequence_no, part_number, revision_code,
      revision_mode, part_name, description, main_category, sub_category,
      requested_by_user_id, created_at, updated_at, payload_json
    ) VALUES ('pending', 'X101', '8', '998', 'X101-8998-01A', '01A',
      'released', 'LEGACY_PART', 'Legacy part description', 'Dummy', 'Test',
      ?, ?, ?, '{}')
  `).run(admin.id, now, now);
  const rejectPart = await db.prepare(`
    INSERT INTO part_requests (
      status, project_code, main_code, sequence_no, part_number, revision_code,
      revision_mode, part_name, description, main_category, sub_category,
      requested_by_user_id, created_at, updated_at, payload_json
    ) VALUES ('pending', 'X101', '8', '997', 'X101-8997-01A', '01A',
      'released', 'LEGACY_REJECT', 'Legacy rejected part', 'Dummy', 'Test',
      ?, ?, ?, '{}')
  `).run(admin.id, now, now);

  const documentPending = await fetch(`http://127.0.0.1:${port}/api/admin/requests/pending`, { headers });
  assert.equal(documentPending.status, 200);
  const documentPendingData = await documentPending.json();
  assert.ok(documentPendingData.requests.some(request => Number(request.id) === Number(approveDocument.lastInsertRowid)));

  const partPending = await fetch(`http://127.0.0.1:${port}/api/admin/parts/requests/pending`, { headers });
  assert.equal(partPending.status, 200);
  const partPendingData = await partPending.json();
  assert.ok(partPendingData.requests.some(request => Number(request.id) === Number(approvePart.lastInsertRowid)));

  const approveDocumentResponse = await fetch(`http://127.0.0.1:${port}/api/admin/requests/${approveDocument.lastInsertRowid}/approve`, {
    method: "POST",
    headers
  });
  assert.equal(approveDocumentResponse.status, 200);
  const approvedDocumentRecord = await db.prepare("SELECT document_no FROM document_records WHERE request_id = ?").get(Number(approveDocument.lastInsertRowid));
  assert.equal(approvedDocumentRecord.document_no, "XD-26-901");
  const documentAudit = await db.prepare("SELECT action FROM audit_logs WHERE entity_type = 'document_request' AND entity_id = ?").get(Number(approveDocument.lastInsertRowid));
  assert.equal(documentAudit.action, "request.approved");

  const rejectDocumentResponse = await fetch(`http://127.0.0.1:${port}/api/admin/requests/${rejectDocument.lastInsertRowid}/reject`, {
    method: "POST",
    headers: { ...headers, "content-type": "application/json" },
    body: JSON.stringify({ reason: "Legacy cleanup" })
  });
  assert.equal(rejectDocumentResponse.status, 200);
  const rejectedDocument = await db.prepare("SELECT status, reject_reason FROM document_requests WHERE id = ?").get(Number(rejectDocument.lastInsertRowid));
  assert.equal(rejectedDocument.status, "rejected");
  assert.equal(rejectedDocument.reject_reason, "Legacy cleanup");

  const approvePartResponse = await fetch(`http://127.0.0.1:${port}/api/admin/parts/requests/${approvePart.lastInsertRowid}/approve`, {
    method: "POST",
    headers
  });
  assert.equal(approvePartResponse.status, 200);
  const approvedPartRecord = await db.prepare("SELECT part_number FROM part_records WHERE request_id = ?").get(Number(approvePart.lastInsertRowid));
  assert.equal(approvedPartRecord.part_number, "X101-8998-01A");
  const partAudit = await db.prepare("SELECT action FROM audit_logs WHERE entity_type = 'part_request' AND entity_id = ?").get(Number(approvePart.lastInsertRowid));
  assert.equal(partAudit.action, "part_request.approved");

  const rejectPartResponse = await fetch(`http://127.0.0.1:${port}/api/admin/parts/requests/${rejectPart.lastInsertRowid}/reject`, {
    method: "POST",
    headers: { ...headers, "content-type": "application/json" },
    body: JSON.stringify({ reason: "Legacy part cleanup" })
  });
  assert.equal(rejectPartResponse.status, 200);
  const rejectedPart = await db.prepare("SELECT status, reject_reason FROM part_requests WHERE id = ?").get(Number(rejectPart.lastInsertRowid));
  assert.equal(rejectedPart.status, "rejected");
  assert.equal(rejectedPart.reject_reason, "Legacy part cleanup");
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
  assert.equal((await response.json()).message, "Internal server error.");
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
