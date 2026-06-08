const fs = require("node:fs");
const path = require("node:path");
const { createDatabase } = require("../server/db");

const ROOT_DIR = path.resolve(__dirname, "..");
loadEnvFile(path.join(ROOT_DIR, ".env"));

const TURSO_DATABASE_URL = process.env.TURSO_DATABASE_URL;
const TURSO_AUTH_TOKEN = process.env.TURSO_AUTH_TOKEN;
const RUN_NAME = "import_document_number_list_r00_named_only_v2_20260608";
const BAD_X_IMPORT_RUN_NAME = "import_document_number_list_r00_all_rows_with_x_names_20260608";
const SOURCE_WORKBOOK = "Document Number List_r00.xlsx";

const DOCUMENT_ROWS = [
  ["D", "XD-26-001", "Informed Consent for PMCF Survey_Radiologist 1", "GR10X", "Aisha F.", "2026-06-08", "D_Documents", 5, "r00", "001"],
  ["D", "XD-26-002", "Informed Consent for PMCF Survey_Radiologist 2", "GR10X", "Aisha F.", "2026-06-08", "D_Documents", 6, "r00", "002"],
  ["D", "XD-26-003", "Informed Consent for PMCF Survey_Radiology Technician 1", "GR10X", "Aisha F.", "2026-06-08", "D_Documents", 7, "r00", "003"],
  ["D", "XD-26-004", "Informed Consent for PMCF Survey_Radiology Technician 2", "GR10X", "Aisha F.", "2026-06-08", "D_Documents", 8, "r00", "004"],
  ["D", "XD-26-008", "GR10X Labels (Draft for Administrative Change on Certificates)", "GR10X", "Aisha F.", "2026-02-10", "D_Documents", 12, "r00", "008"],
  ["D", "XD-26-009", "Initial Issue Report Hacettepe Room1", "XEBT-W6", "Huzaifa", "2026-05-12", "D_Documents", 13, "r00", "009"],
  ["D", "XD-26-010", "Action_Report on initial field issue Hacettepe Room1", "XEBT-W6", "Huzaifa", "2026-05-13", "D_Documents", 14, "r00", "010"],
  ["D", "XD-26-011", "LoA for Nepal Tender (Absolute Meditech Pvt. Ltd.)", "GR10X", "Aisha F.", "2026-05-14", "D_Documents", 15, "r00", "011"],
  ["D", "XD-26-012", "Relationship Letter_XERA-TNMI (UAE Registration)", "GR10X", "Aisha F.", "2026-05-14", "D_Documents", 16, "r00", "012"],
  ["D", "XD-26-013", "Lifetime of General Radiography X-ray System_EN", "GR10X", "Aisha F.", "2026-05-14", "D_Documents", 17, "r00", "013"],
  ["D", "XD-26-014", "Cihaz Kullanım Ömrü Belgesi_TR", "GR10X", "Aisha F.", "2026-05-15", "D_Documents", 18, "r00", "014"],
  ["D", "XD-26-015", "LoA for Nepal Tender_(M/S Bhagwati Scientific And Trading Order Suppliers)", "GR10X", "Aisha F.", "2026-05-14", "D_Documents", 19, "r00", "015"],
  ["D", "XD-26-016", "VR10X-GR10X_USB Signal Isolator Technical Documentation Report_r00", "R&D", "Emre Tuncer", "2026-05-18", "D_Documents", 20, "r00", "016"],

  ["QMS", "XQT-05-01", "Quotation Form Template_EN", "05", "Can YALİN", "2026-05-11", "Template", 5, "r01", "01", { "detail_type": "QT" }],
  ["QMS", "XQT-05-02", "Fiyat Teklifi Formun Template_TR", "05", "Can YALİN", "2026-05-11", "Template", 6, "r02", "02", { "detail_type": "QT" }],
  ["QMS", "XQT-05-03", "Proforma Invoice Template", "05", "Can YALİN", "2026-05-11", "Template", 7, "r01", "03", { "detail_type": "QT" }],
  ["QMS", "XQT-05-04", "Packing List & Commercial Invoice Template", "05", "Can YALİN", "2026-05-11", "Template", 8, "r03", "04", { "detail_type": "QT" }],
  ["QMS", "XQT-05-05", "Service Training Certificate Template", "05", "Can YALİN", "2026-05-11", "Template", 9, "r01", "05", { "detail_type": "QT" }],
  ["QMS", "XQT-05-06", "Certificate of Authorization for Servicing Activities Template", "05", "Can YALİN", "2026-05-11", "Template", 10, "r01", "06", { "detail_type": "QT" }],
  ["QMS", "XQT-05-07", "Export Loading Information/ İhracat Yükleme Template", "05", "Can YALİN", "2026-05-11", "Template", 11, "r01", "07", { "detail_type": "QT" }],
  ["QMS", "XQT-05-08", "Sales Information List Template", "05", "Can YALİN", "2026-05-11", "Template", 12, "r01", "08", { "detail_type": "QT" }],
  ["QMS", "XQT-05-09", "General Sales Contract Template", "05", "Can YALİN", "2026-05-11", "Template", 13, "r01", "09", { "detail_type": "QT" }],
  ["QMS", "XQT-18-01", "Initial Issue Report Template", "18", "Ethan", "2026-05-11", "Template", 14, "r00", "01", { "detail_type": "QT" }],
  ["QMS", "XQT-18-02", "Action Report on Initial Field Issue", "18", "Ethan", "2026-05-12", "Template", 15, "r00", "02", { "detail_type": "QT" }],

  ["QMS", "XQM-26", "Quality Manual", "26", "Auto Published", "2026-03-26", "QMS_Documents", 5, "r00", "000", { "detail_type": "QM" }],
  ["QMS", "XQP-01", "Control of Document and Records Management", "01", "Auto Published", "2026-03-31", "QMS_Documents", 6, "r00", "000", { "detail_type": "QP" }],
  ["QMS", "XQP-02", "Control of Quality Objective & Communication", "02", "Auto Published", "2026-04-20", "QMS_Documents", 7, "r00", "000", { "detail_type": "QP" }]
];

const DOCUMENTS = DOCUMENT_ROWS.map(([category, documentNo, documentName, referenceValue, writtenBy, creationDate, sourceSheet, sourceRow, revision, sequenceNo, payload = {}]) => ({
  source_sheet: sourceSheet,
  source_row: sourceRow,
  category,
  company_code: "X",
  year_yy: inferYearYY(documentNo, creationDate),
  sequence_no: sequenceNo || "000",
  document_no: documentNo,
  revision,
  reference_type: "model",
  reference_value: referenceValue,
  document_name: documentName,
  written_by: writtenBy,
  creation_date: creationDate,
  control_status: "controlled",
  generated_filename: buildGeneratedFilename(category, documentNo, referenceValue, documentName, revision, creationDate),
  payload
}));

main().catch(error => {
  console.error("Document number list import failed.");
  console.error(error);
  process.exit(1);
});

async function main() {
  if (!TURSO_DATABASE_URL) throw new Error("TURSO_DATABASE_URL is required.");

  const db = createDatabase({
    url: TURSO_DATABASE_URL,
    authToken: TURSO_AUTH_TOKEN
  });

  try {
    await db.exec("PRAGMA foreign_keys = ON;");
    await db.exec(`
      CREATE TABLE IF NOT EXISTS maintenance_runs (
        name TEXT PRIMARY KEY,
        summary_json TEXT,
        created_at TEXT NOT NULL
      );
    `);

    const alreadyRun = await db.prepare("SELECT name FROM maintenance_runs WHERE name = ?").get(RUN_NAME);
    if (alreadyRun) {
      console.log(`Document number list import already completed: ${RUN_NAME}`);
      return;
    }

    const summary = await db.transaction(async () => {
      const systemUser = await ensureSystemUser(db);
      const cleanup = await cleanupBadXRows(db);
      let inserted = 0;
      let skipped = 0;
      const skippedItems = [];

      for (const document of DOCUMENTS) {
        const existing = await findExistingDocument(db, document);
        if (existing) {
          skipped += 1;
          skippedItems.push({
            document_no: document.document_no,
            document_name: document.document_name,
            reason: existing.reason
          });
          continue;
        }

        const now = nowIso();
        const payload = {
          ...document.payload,
          source: SOURCE_WORKBOOK,
          source_sheet: document.source_sheet,
          source_row: document.source_row,
          category: document.category,
          company_code: document.company_code,
          year_yy: document.year_yy,
          sequence_no: document.sequence_no,
          document_no: document.document_no,
          revision: document.revision,
          reference_type: document.reference_type,
          reference_value: document.reference_value,
          document_name: document.document_name,
          written_by: document.written_by,
          creation_date: document.creation_date,
          control_status: document.control_status,
          generated_filename: document.generated_filename
        };

        const requestResult = await db.prepare(`
          INSERT INTO document_requests (
            status, category, company_code, year_yy, sequence_no, document_no,
            revision, reference_type, reference_value, document_name, written_by,
            creation_date, control_status, generated_filename, requested_by_user_id,
            approved_by_user_id, approved_at, created_at, updated_at, payload_json
          )
          VALUES ('approved', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          document.category,
          document.company_code,
          document.year_yy,
          document.sequence_no,
          document.document_no,
          document.revision,
          document.reference_type,
          document.reference_value,
          document.document_name,
          document.written_by,
          document.creation_date,
          document.control_status,
          document.generated_filename,
          systemUser.id,
          systemUser.id,
          now,
          now,
          now,
          JSON.stringify(payload)
        );

        const requestId = Number(requestResult.lastInsertRowid);
        const recordResult = await db.prepare(`
          INSERT INTO document_records (
            request_id, category, company_code, year_yy, sequence_no, document_no,
            revision, reference_type, reference_value, document_name, written_by,
            creation_date, control_status, generated_filename, approved_by_user_id,
            approved_at
          )
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          requestId,
          document.category,
          document.company_code,
          document.year_yy,
          document.sequence_no,
          document.document_no,
          document.revision,
          document.reference_type,
          document.reference_value,
          document.document_name,
          document.written_by,
          document.creation_date,
          document.control_status,
          document.generated_filename,
          systemUser.id,
          now
        );

        const recordId = Number(recordResult.lastInsertRowid);
        await insertAudit(db, systemUser.id, "document_request", requestId, "document_number_list.imported", null, auditPayload(document));
        await insertAudit(db, systemUser.id, "document_record", recordId, "document_number_list.imported", null, auditPayload(document));
        await bumpDocumentSequence(db, document);
        inserted += 1;
      }

      const result = {
        source: SOURCE_WORKBOOK,
        mode: "named_document_rows_only",
        totalNamedRows: DOCUMENTS.length,
        inserted,
        skipped,
        badXRowsRemoved: cleanup.documentRecordsRemoved,
        badXRequestsRemoved: cleanup.documentRequestsRemoved,
        skippedItems
      };

      await db.prepare(`
        INSERT INTO maintenance_runs (name, summary_json, created_at)
        VALUES (?, ?, ?)
      `).run(RUN_NAME, JSON.stringify(result), nowIso());

      return result;
    });

    console.log("Document number list import complete.");
    console.log(JSON.stringify(summary, null, 2));
  } finally {
    if (typeof db.close === "function") await db.close();
  }
}

async function cleanupBadXRows(db) {
  const rows = await db.prepare(`
    SELECT dr.id AS document_record_id, dr.request_id
    FROM document_records dr
    LEFT JOIN document_requests req ON req.id = dr.request_id
    WHERE LOWER(dr.document_name) GLOB 'x[0-9]*'
      AND req.payload_json LIKE '%' || ? || '%'
  `).all(SOURCE_WORKBOOK);

  const recordIds = new Set();
  const requestIds = new Set();

  for (const row of rows) {
    if (row.document_record_id) recordIds.add(Number(row.document_record_id));
    if (row.request_id) requestIds.add(Number(row.request_id));
  }

  for (const recordId of recordIds) {
    await db.prepare("DELETE FROM document_revision_requests WHERE document_record_id = ?").run(recordId);
    await db.prepare("DELETE FROM document_revision_archive WHERE document_record_id = ?").run(recordId);
    await db.prepare("DELETE FROM notifications WHERE entity_type IN ('document_record', 'document') AND entity_id = ?").run(recordId);
    await db.prepare("DELETE FROM audit_logs WHERE entity_type IN ('document_record', 'document') AND entity_id = ?").run(recordId);
    await db.prepare("DELETE FROM document_records WHERE id = ?").run(recordId);
  }

  for (const requestId of requestIds) {
    await db.prepare("DELETE FROM notifications WHERE related_request_id = ? OR (entity_type = 'document_request' AND entity_id = ?)").run(requestId, requestId);
    await db.prepare("DELETE FROM audit_logs WHERE entity_type = 'document_request' AND entity_id = ?").run(requestId);
    await db.prepare("DELETE FROM document_requests WHERE id = ?").run(requestId);
  }

  await db.prepare("DELETE FROM maintenance_runs WHERE name = ?").run(BAD_X_IMPORT_RUN_NAME);

  return {
    documentRecordsRemoved: recordIds.size,
    documentRequestsRemoved: requestIds.size
  };
}

async function ensureSystemUser(db) {
  const now = nowIso();
  let user = await db.prepare("SELECT * FROM users WHERE username = ?").get("auto_published");
  if (user) return user;

  await db.prepare(`
    INSERT INTO users (
      username, email, display_name, position, role, permissions_json, department,
      password_hash, password_salt, created_at
    )
    VALUES ('auto_published', 'auto.published@xera.com.tr', 'Auto Published', 'System', 'user', '[]', 'System', NULL, NULL, ?)
  `).run(now);

  return await db.prepare("SELECT * FROM users WHERE username = ?").get("auto_published");
}

async function findExistingDocument(db, document) {
  const recordByNumber = await db.prepare(`
    SELECT id
    FROM document_records
    WHERE document_no = ?
      AND deleted_at IS NULL
    LIMIT 1
  `).get(document.document_no);
  if (recordByNumber) return { reason: "document_no already exists in document_records" };

  const recordByFilename = await db.prepare(`
    SELECT id
    FROM document_records
    WHERE UPPER(generated_filename) = UPPER(?)
      AND deleted_at IS NULL
    LIMIT 1
  `).get(document.generated_filename);
  if (recordByFilename) return { reason: "generated_filename already exists in document_records" };

  const openRequest = await db.prepare(`
    SELECT id
    FROM document_requests
    WHERE status <> 'rejected'
      AND (document_no = ? OR UPPER(generated_filename) = UPPER(?))
    LIMIT 1
  `).get(document.document_no, document.generated_filename);
  if (openRequest) return { reason: "document_no or generated_filename already exists in document_requests" };

  return null;
}

async function bumpDocumentSequence(db, document) {
  if (!document.sequence_no || document.sequence_no === "000") return;

  const prefix = sequencePrefixForDocument(document);
  if (!prefix) return;

  const nextSequence = Number(document.sequence_no) + 1;
  const existing = await db.prepare("SELECT next_sequence FROM document_sequences WHERE scope_key = ?").get(prefix);

  if (!existing) {
    await db.prepare(`
      INSERT INTO document_sequences (scope_key, category, year_yy, next_sequence, updated_at)
      VALUES (?, ?, ?, ?, ?)
    `).run(prefix, document.category, document.year_yy, nextSequence, nowIso());
    return;
  }

  if (Number(existing.next_sequence || 1) < nextSequence) {
    await db.prepare(`
      UPDATE document_sequences
      SET next_sequence = ?, updated_at = ?
      WHERE scope_key = ?
    `).run(nextSequence, nowIso(), prefix);
  }
}

function sequencePrefixForDocument(document) {
  if (document.category === "D") return `XD-${document.year_yy}`;
  if (document.category === "R") return `XR-${document.year_yy}`;
  if (document.category === "MD") return `XMD-${document.year_yy}`;
  if (document.category === "MR") return `XMR-${document.year_yy}`;
  if (document.category === "EC" && document.document_no.includes("-Rr-")) return document.document_no.replace(/-\d{3}$/, "");
  if (document.category === "QMS" && document.document_no.startsWith("XQT-")) return document.document_no.replace(/-\d{2,3}$/, "");
  if (document.category === "SOP" && /^XQS-\d{2}-\d{3}$/.test(document.document_no)) return document.document_no.replace(/-\d{3}$/, "");
  return "";
}

async function insertAudit(db, actorUserId, entityType, entityId, action, before, after) {
  await db.prepare(`
    INSERT INTO audit_logs (actor_user_id, entity_type, entity_id, action, before_json, after_json, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(actorUserId, entityType, entityId, action, before ? JSON.stringify(before) : null, after ? JSON.stringify(after) : null, nowIso());
}

function auditPayload(document) {
  return {
    document_no: document.document_no,
    document_name: document.document_name,
    source_sheet: document.source_sheet,
    source_row: document.source_row
  };
}

function inferYearYY(documentNo, creationDate) {
  const yearMatch = String(documentNo || "").match(/-(\d{2})(?:-|$)/);
  if (yearMatch) return yearMatch[1];
  return String(creationDate || "2026-01-01").slice(2, 4);
}

function buildGeneratedFilename(category, documentNo, referenceValue, documentName, revision, creationDate) {
  const suffix = ["R", "MR"].includes(category) ? creationDate.replaceAll("-", "") : revision;
  const parts = [documentNo];
  if (!["QMS", "SOP"].includes(category) && referenceValue) parts.push(referenceValue);
  parts.push(documentName, suffix);
  return sanitizeFilename(parts.filter(Boolean).join("_"));
}

function sanitizeFilename(value) {
  return String(value || "")
    .replace(/[\\/:*?"<>|]/g, "-")
    .replace(/\s+/g, " ")
    .trim();
}

function nowIso() {
  return new Date().toISOString();
}

function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return;

  const lines = fs.readFileSync(filePath, "utf8").split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const separatorIndex = trimmed.indexOf("=");
    if (separatorIndex === -1) continue;

    const key = trimmed.slice(0, separatorIndex).trim();
    let value = trimmed.slice(separatorIndex + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (!process.env[key]) process.env[key] = value;
  }
}
