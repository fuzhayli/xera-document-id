const fs = require("node:fs");
const path = require("node:path");
const { createDatabase } = require("../server/db");

const ROOT_DIR = path.resolve(__dirname, "..");
loadEnvFile(path.join(ROOT_DIR, ".env"));

const TURSO_DATABASE_URL = process.env.TURSO_DATABASE_URL;
const TURSO_AUTH_TOKEN = process.env.TURSO_AUTH_TOKEN;
const RUN_NAME = "import_qms_procedure_documents_20260609";
const SOURCE_NOTE = "QMS procedure folder import - 2026-06-09";

const DOCUMENTS = [
  ["XQP-23-001", "Control of Document and Records", "Gülizar COŞKUN", "r03", "2025-12-25"],
  ["XQP-23-002", "Control of Quality Object & Communication", "Aisha FAZAL", "r02", "2025-04-03"],
  ["XQP-23-003", "Control of Human Resources and Training", "Gülizar COŞKUN", "r03", "2026-03-03"],
  ["XQP-23-004", "Control of Infrastructure, Work Enviroment, & Measuring Equipments", "Muhammet. A. MALLUHI", "r04", "2026-02-04"],
  ["XQP-23-005", "Control of Customer Contract & Installation Compliance", "Deha İDİĞ", "r03", "2025-12-31"],
  ["XQP-23-006", "Control of Design and Development", "Aisha FAZAL", "r01", "2025-02-20"],
  ["XQP-23-007", "Control of Risk Management", "Aisha FAZAL", "r02", "2025-04-15"],
  ["XQP-23-008", "Control of PEMS Design and Development", "Gülizar COŞKUN", "r02", "2025-04-15"],
  ["XQP-23-009", "Control of Design Develoment V&V", "Furkan Hayri ÖZKAN", "r02", "2025-04-15"],
  ["XQP-23-010", "Control of Design Development Changes", "Aisha FAZAL", "r02", "2025-12-25"],
  ["XQP-23-011", "Control of Purchasing Process", "Can YALÇIN", "r02", "2025-04-25"],
  ["XQP-23-012", "Control of Product Identificaion and Traceability", "Gülizar COŞKUN", "r02", "2025-04-15"],
  ["XQP-23-013", "Control of Manufacturing Realization", "Muhammet Ahmet MALLUHI", "r03", "2025-12-30"],
  ["XQP-23-014", "Control of IFU and Language", "Gülizar COŞKUN", "r02", "2025-08-22"],
  ["XQP-23-015", "Control of Product Preservation and Packing", "Gülizar COŞKUN", "r02", "2025-12-09"],
  ["XQP-23-016", "Control of Nonconformity Management and Operations", "Aisha FAZAL", "r03", "2025-11-13"],
  ["XQP-23-017", "Control of Feedback Processes", "Gülizar COŞKUN", "r02", "2025-04-15"],
  ["XQP-23-018", "Control of Servicing Activities and Complaints", "Aisha FAZAL", "r03", "2025-12-03"],
  ["XQP-23-019", "Control of Product Monitoring and Measurement", "Gülizar COŞKUN", "r03", "2025-12-28"],
  ["XQP-23-020", "Control of Process Monitoring and Internal Audit", "Gülizar COŞKUN", "r02", "2025-04-15"],
  ["XQP-23-021", "Control of CAPA", "Gülizar COŞKUN", "r02", "2025-04-15"],
  ["XQP-23-022", "Control of Data Collection and Statistical Analysis", "Gülizar COŞKUN", "r03", "2025-04-15"],
  ["XQP-23-023", "Control of PMS and Vigilance", "Aisha FAZAL", "r03", "2026-04-07"],
  ["XQP-23-024", "Medical Device Conformity Routes", "Aisha FAZAL", "r03", "2025-04-10"],
  ["XQP-23-025", "Control of Clinical Evalutaion Routes", "Aisha FAZAL / Gülizar COŞKUN", "r02", "2025-04-15"],
  ["XQP-23-026", "Control of Usability Engineering", "Gülizar COŞKUN", "r02", "2025-04-15"]
].map(([documentNo, documentName, writtenBy, revision, creationDate]) => ({
  category: "QMS",
  company_code: "X",
  year_yy: documentNo.slice(4, 6),
  sequence_no: documentNo.slice(-3),
  document_no: documentNo,
  revision,
  reference_type: "qms",
  reference_value: documentNo.slice(4, 6),
  document_name: documentName,
  written_by: writtenBy,
  creation_date: creationDate,
  control_status: "controlled",
  generated_filename: sanitizeFilename(`${documentNo}_${documentName}_${revision}`)
}));

main().catch(error => {
  console.error("QMS procedure document import failed.");
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
      console.log(`QMS procedure document import already completed: ${RUN_NAME}`);
      return;
    }

    const summary = await db.transaction(async () => {
      const systemUser = await ensureSystemUser(db);
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
          source: SOURCE_NOTE,
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
        await insertAudit(db, systemUser.id, "document_request", requestId, "qms_procedure_document.imported", null, auditPayload(document));
        await insertAudit(db, systemUser.id, "document_record", recordId, "qms_procedure_document.imported", null, auditPayload(document));
        await bumpDocumentSequence(db, document);
        inserted += 1;
      }

      const result = {
        source: SOURCE_NOTE,
        totalRows: DOCUMENTS.length,
        inserted,
        skipped,
        skippedItems
      };

      await db.prepare(`
        INSERT INTO maintenance_runs (name, summary_json, created_at)
        VALUES (?, ?, ?)
      `).run(RUN_NAME, JSON.stringify(result), nowIso());

      return result;
    });

    console.log("QMS procedure document import complete.");
    console.log(JSON.stringify(summary, null, 2));
  } finally {
    if (typeof db.close === "function") await db.close();
  }
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
    SELECT id, deleted_at
    FROM document_records
    WHERE document_no = ?
    LIMIT 1
  `).get(document.document_no);
  if (recordByNumber && !recordByNumber.deleted_at) return { reason: "document_no already exists in document_records" };
  if (recordByNumber) return { reason: "document_no exists in deleted document_records" };

  const recordByFilename = await db.prepare(`
    SELECT id, deleted_at
    FROM document_records
    WHERE UPPER(generated_filename) = UPPER(?)
    LIMIT 1
  `).get(document.generated_filename);
  if (recordByFilename && !recordByFilename.deleted_at) return { reason: "generated_filename already exists in document_records" };
  if (recordByFilename) return { reason: "generated_filename exists in deleted document_records" };

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

  const scopeKey = document.document_no.slice(0, -4);
  const nextSequence = Number(document.sequence_no) + 1;
  const existing = await db.prepare("SELECT next_sequence FROM document_sequences WHERE scope_key = ?").get(scopeKey);

  if (!existing) {
    await db.prepare(`
      INSERT INTO document_sequences (scope_key, category, year_yy, next_sequence, updated_at)
      VALUES (?, ?, ?, ?, ?)
    `).run(scopeKey, document.category, document.year_yy, nextSequence, nowIso());
    return;
  }

  if (Number(existing.next_sequence || 1) < nextSequence) {
    await db.prepare(`
      UPDATE document_sequences
      SET next_sequence = ?, updated_at = ?
      WHERE scope_key = ?
    `).run(nextSequence, nowIso(), scopeKey);
  }
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
    generated_filename: document.generated_filename,
    source: SOURCE_NOTE
  };
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
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
    if (!process.env[key]) process.env[key] = value;
  }
}
