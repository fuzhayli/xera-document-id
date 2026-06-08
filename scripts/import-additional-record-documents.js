const fs = require("node:fs");
const path = require("node:path");
const { createDatabase } = require("../server/db");

const ROOT_DIR = path.resolve(__dirname, "..");
loadEnvFile(path.join(ROOT_DIR, ".env"));

const TURSO_DATABASE_URL = process.env.TURSO_DATABASE_URL;
const TURSO_AUTH_TOKEN = process.env.TURSO_AUTH_TOKEN;
const RUN_NAME = "import_additional_record_documents_20260608";
const SOURCE_NOTE = "Screenshot record document import - 2026-06-08";

const DOCUMENTS = [
  {
    category: "R",
    company_code: "X",
    year_yy: "25",
    sequence_no: "005",
    document_no: "XR-25-005",
    revision: "r00",
    reference_type: "task",
    reference_value: "Tube Stand",
    document_name: "Tube Stand Sagging Detection Report",
    written_by: "Auto Published",
    creation_date: "2025-01-01",
    control_status: "controlled",
    generated_filename: "XR-25-005_R00 - Tube Stand Sagging Detection Report"
  },
  {
    category: "R",
    company_code: "X",
    year_yy: "25",
    sequence_no: "004",
    document_no: "XR-25-004",
    revision: "r00",
    reference_type: "task",
    reference_value: "ProDigi",
    document_name: "ProDigi Annual Verification Report",
    written_by: "Auto Published",
    creation_date: "2025-01-01",
    control_status: "controlled",
    generated_filename: "XR-25-004 ProDigi Annual Verification Report"
  },
  {
    category: "R",
    company_code: "X",
    year_yy: "26",
    sequence_no: "004",
    document_no: "XR-26-004",
    revision: "r00",
    reference_type: "task",
    reference_value: "Tube Stand Holder",
    document_name: "Tube Stand Holder Design Change Analysis Report",
    written_by: "Auto Published",
    creation_date: "2026-01-01",
    control_status: "controlled",
    generated_filename: "XR-26-004_R00 - Tube Stand Holder Design Change Analysis Report"
  },
  {
    category: "R",
    company_code: "X",
    year_yy: "26",
    sequence_no: "003",
    document_no: "XR-26-003",
    revision: "r00",
    reference_type: "task",
    reference_value: "Tube Stand Holder",
    document_name: "Tube Stand Holder Material Change Analysis Report",
    written_by: "Auto Published",
    creation_date: "2026-01-01",
    control_status: "controlled",
    generated_filename: "XR-26-003_R00 - Tube Stand Holder Material Change Analysis Report"
  }
];

main().catch(error => {
  console.error("Additional record document import failed.");
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
      console.log(`Additional record document import already completed: ${RUN_NAME}`);
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
        await insertAudit(db, systemUser.id, "document_request", requestId, "additional_record_document.imported", null, auditPayload(document));
        await insertAudit(db, systemUser.id, "document_record", recordId, "additional_record_document.imported", null, auditPayload(document));
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

    console.log("Additional record document import complete.");
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

  const recordByFilename = await db.prepare(`
    SELECT id, deleted_at
    FROM document_records
    WHERE UPPER(generated_filename) = UPPER(?)
    LIMIT 1
  `).get(document.generated_filename);
  if (recordByFilename && !recordByFilename.deleted_at) return { reason: "generated_filename already exists in document_records" };

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
  const scopeKey = `${document.document_no.slice(0, -4)}`;
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
