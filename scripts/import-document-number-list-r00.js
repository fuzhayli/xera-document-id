const fs = require("node:fs");
const path = require("node:path");
const { createDatabase } = require("../server/db");

const ROOT_DIR = path.resolve(__dirname, "..");
loadEnvFile(path.join(ROOT_DIR, ".env"));

const TURSO_DATABASE_URL = process.env.TURSO_DATABASE_URL;
const TURSO_AUTH_TOKEN = process.env.TURSO_AUTH_TOKEN;
const RUN_NAME = "import_document_number_list_r00_20260608";

const DOCUMENTS = [
  {
    "source_sheet": "D_Documents",
    "source_row": 5,
    "category": "D",
    "company_code": "X",
    "year_yy": "26",
    "sequence_no": "001",
    "document_no": "XD-26-001",
    "revision": "r00",
    "reference_type": "model",
    "reference_value": "GR10X",
    "document_name": "Informed Consent for PMCF Survey_Radiologist 1",
    "written_by": "Aisha F.",
    "creation_date": "2026-06-08",
    "control_status": "controlled",
    "generated_filename": "XD-26-001_GR10X_Informed Consent for PMCF Survey_Radiologist 1_r00",
    "payload": {}
  },
  {
    "source_sheet": "D_Documents",
    "source_row": 6,
    "category": "D",
    "company_code": "X",
    "year_yy": "26",
    "sequence_no": "002",
    "document_no": "XD-26-002",
    "revision": "r00",
    "reference_type": "model",
    "reference_value": "GR10X",
    "document_name": "Informed Consent for PMCF Survey_Radiologist 2",
    "written_by": "Aisha F.",
    "creation_date": "2026-06-08",
    "control_status": "controlled",
    "generated_filename": "XD-26-002_GR10X_Informed Consent for PMCF Survey_Radiologist 2_r00",
    "payload": {}
  },
  {
    "source_sheet": "D_Documents",
    "source_row": 7,
    "category": "D",
    "company_code": "X",
    "year_yy": "26",
    "sequence_no": "003",
    "document_no": "XD-26-003",
    "revision": "r00",
    "reference_type": "model",
    "reference_value": "GR10X",
    "document_name": "Informed Consent for PMCF Survey_Radiology Technician 1",
    "written_by": "Aisha F.",
    "creation_date": "2026-06-08",
    "control_status": "controlled",
    "generated_filename": "XD-26-003_GR10X_Informed Consent for PMCF Survey_Radiology Technician 1_r00",
    "payload": {}
  },
  {
    "source_sheet": "D_Documents",
    "source_row": 8,
    "category": "D",
    "company_code": "X",
    "year_yy": "26",
    "sequence_no": "004",
    "document_no": "XD-26-004",
    "revision": "r00",
    "reference_type": "model",
    "reference_value": "GR10X",
    "document_name": "Informed Consent for PMCF Survey_Radiology Technician 2",
    "written_by": "Aisha F.",
    "creation_date": "2026-06-08",
    "control_status": "controlled",
    "generated_filename": "XD-26-004_GR10X_Informed Consent for PMCF Survey_Radiology Technician 2_r00",
    "payload": {}
  },
  {
    "source_sheet": "D_Documents",
    "source_row": 12,
    "category": "D",
    "company_code": "X",
    "year_yy": "26",
    "sequence_no": "008",
    "document_no": "XD-26-008",
    "revision": "r00",
    "reference_type": "model",
    "reference_value": "GR10X",
    "document_name": "GR10X Labels (Draft for Administrative Change on Certificates)",
    "written_by": "Aisha F.",
    "creation_date": "2026-02-10",
    "control_status": "controlled",
    "generated_filename": "XD-26-008_GR10X_GR10X Labels (Draft for Administrative Change on Certificates)_r00",
    "payload": {}
  },
  {
    "source_sheet": "D_Documents",
    "source_row": 13,
    "category": "D",
    "company_code": "X",
    "year_yy": "26",
    "sequence_no": "009",
    "document_no": "XD-26-009",
    "revision": "r00",
    "reference_type": "model",
    "reference_value": "XEBT-W6",
    "document_name": "Initial Issue Report Hacettepe Room1",
    "written_by": "Huzaifa",
    "creation_date": "2026-05-12",
    "control_status": "controlled",
    "generated_filename": "XD-26-009_XEBT-W6_Initial Issue Report Hacettepe Room1_r00",
    "payload": {}
  },
  {
    "source_sheet": "D_Documents",
    "source_row": 14,
    "category": "D",
    "company_code": "X",
    "year_yy": "26",
    "sequence_no": "010",
    "document_no": "XD-26-010",
    "revision": "r00",
    "reference_type": "model",
    "reference_value": "XEBT-W6",
    "document_name": "Action_Report on initial field issue Hacettepe Room1",
    "written_by": "Huzaifa",
    "creation_date": "2026-05-13",
    "control_status": "controlled",
    "generated_filename": "XD-26-010_XEBT-W6_Action_Report on initial field issue Hacettepe Room1_r00",
    "payload": {}
  },
  {
    "source_sheet": "D_Documents",
    "source_row": 15,
    "category": "D",
    "company_code": "X",
    "year_yy": "26",
    "sequence_no": "011",
    "document_no": "XD-26-011",
    "revision": "r00",
    "reference_type": "model",
    "reference_value": "GR10X",
    "document_name": "LoA for Nepal Tender (Absolute Meditech Pvt. Ltd.)",
    "written_by": "Aisha F.",
    "creation_date": "2026-05-14",
    "control_status": "controlled",
    "generated_filename": "XD-26-011_GR10X_LoA for Nepal Tender (Absolute Meditech Pvt. Ltd.)_r00",
    "payload": {}
  },
  {
    "source_sheet": "D_Documents",
    "source_row": 16,
    "category": "D",
    "company_code": "X",
    "year_yy": "26",
    "sequence_no": "012",
    "document_no": "XD-26-012",
    "revision": "r00",
    "reference_type": "model",
    "reference_value": "GR10X",
    "document_name": "Relationship Letter_XERA-TNMI (UAE Registration)",
    "written_by": "Aisha F.",
    "creation_date": "2026-05-14",
    "control_status": "controlled",
    "generated_filename": "XD-26-012_GR10X_Relationship Letter_XERA-TNMI (UAE Registration)_r00",
    "payload": {}
  },
  {
    "source_sheet": "D_Documents",
    "source_row": 17,
    "category": "D",
    "company_code": "X",
    "year_yy": "26",
    "sequence_no": "013",
    "document_no": "XD-26-013",
    "revision": "r00",
    "reference_type": "model",
    "reference_value": "GR10X",
    "document_name": "Lifetime of General Radiography X-ray System_EN",
    "written_by": "Aisha F.",
    "creation_date": "2026-05-14",
    "control_status": "controlled",
    "generated_filename": "XD-26-013_GR10X_Lifetime of General Radiography X-ray System_EN_r00",
    "payload": {}
  },
  {
    "source_sheet": "D_Documents",
    "source_row": 18,
    "category": "D",
    "company_code": "X",
    "year_yy": "26",
    "sequence_no": "014",
    "document_no": "XD-26-014",
    "revision": "r00",
    "reference_type": "model",
    "reference_value": "GR10X",
    "document_name": "Cihaz Kullanım Ömrü Belgesi_TR",
    "written_by": "Aisha F.",
    "creation_date": "2026-05-15",
    "control_status": "controlled",
    "generated_filename": "XD-26-014_GR10X_Cihaz Kullanım Ömrü Belgesi_TR_r00",
    "payload": {}
  },
  {
    "source_sheet": "D_Documents",
    "source_row": 19,
    "category": "D",
    "company_code": "X",
    "year_yy": "26",
    "sequence_no": "015",
    "document_no": "XD-26-015",
    "revision": "r00",
    "reference_type": "model",
    "reference_value": "GR10X",
    "document_name": "LoA for Nepal Tender_(M/S Bhagwati Scientific And Trading Order Suppliers)",
    "written_by": "Aisha F.",
    "creation_date": "2026-05-14",
    "control_status": "controlled",
    "generated_filename": "XD-26-015_GR10X_LoA for Nepal Tender_(M-S Bhagwati Scientific And Trading Order Suppliers)_r00",
    "payload": {}
  },
  {
    "source_sheet": "D_Documents",
    "source_row": 20,
    "category": "D",
    "company_code": "X",
    "year_yy": "26",
    "sequence_no": "016",
    "document_no": "XD-26-016",
    "revision": "r00",
    "reference_type": "model",
    "reference_value": "R&D",
    "document_name": "VR10X-GR10X_USB Signal Isolator Technical Documentation Report_r00",
    "written_by": "Emre Tuncer",
    "creation_date": "2026-05-18",
    "control_status": "controlled",
    "generated_filename": "XD-26-016_R&D_VR10X-GR10X_USB Signal Isolator Technical Documentation Report_r00_r00",
    "payload": {}
  },
  {
    "source_sheet": "QMS_Documents",
    "source_row": 5,
    "category": "QMS",
    "company_code": "X",
    "year_yy": "26",
    "sequence_no": "000",
    "document_no": "XQM-26",
    "revision": "r00",
    "reference_type": "model",
    "reference_value": "26",
    "document_name": "Quality Manual",
    "written_by": "Auto Published",
    "creation_date": "2026-03-26",
    "control_status": "controlled",
    "generated_filename": "XQM-26_Quality Manual_r00",
    "payload": {
      "detail_type": "QM"
    }
  },
  {
    "source_sheet": "QMS_Documents",
    "source_row": 6,
    "category": "QMS",
    "company_code": "X",
    "year_yy": "26",
    "sequence_no": "000",
    "document_no": "XQP-01",
    "revision": "r00",
    "reference_type": "model",
    "reference_value": "01",
    "document_name": "Control of Document and Records Management",
    "written_by": "Auto Published",
    "creation_date": "2026-03-31",
    "control_status": "controlled",
    "generated_filename": "XQP-01_Control of Document and Records Management_r00",
    "payload": {
      "detail_type": "QP"
    }
  },
  {
    "source_sheet": "QMS_Documents",
    "source_row": 7,
    "category": "QMS",
    "company_code": "X",
    "year_yy": "26",
    "sequence_no": "000",
    "document_no": "XQP-02",
    "revision": "r00",
    "reference_type": "model",
    "reference_value": "02",
    "document_name": "Control of Quality Objective & Communication",
    "written_by": "Auto Published",
    "creation_date": "2026-04-20",
    "control_status": "controlled",
    "generated_filename": "XQP-02_Control of Quality Objective & Communication_r00",
    "payload": {
      "detail_type": "QP"
    }
  }
];

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
          source: "Document Number List_r00.xlsx",
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
        await insertAudit(db, systemUser.id, "document_request", requestId, "document_number_list.imported", null, {
          document_no: document.document_no,
          document_name: document.document_name,
          source_sheet: document.source_sheet,
          source_row: document.source_row
        });
        await insertAudit(db, systemUser.id, "document_record", recordId, "document_number_list.imported", null, {
          document_no: document.document_no,
          document_name: document.document_name,
          source_sheet: document.source_sheet,
          source_row: document.source_row
        });
        await bumpDocumentSequence(db, document);
        inserted += 1;
      }

      const result = {
        source: "Document Number List_r00.xlsx",
        totalRowsWithDocumentName: DOCUMENTS.length,
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

    console.log("Document number list import complete.");
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
  if (document.category === "EC" && document.document_no.includes("-Rr-")) {
    return document.document_no.replace(/-\d{3}$/, "");
  }
  if (document.category === "QMS" && document.document_no.startsWith("XQT-")) {
    return document.document_no.replace(/-\d{2,3}$/, "");
  }
  if (document.category === "SOP" && /^XQS-\d{2}-\d{3}$/.test(document.document_no)) {
    return document.document_no.replace(/-\d{3}$/, "");
  }
  return "";
}

async function insertAudit(db, actorUserId, entityType, entityId, action, before, after) {
  await db.prepare(`
    INSERT INTO audit_logs (actor_user_id, entity_type, entity_id, action, before_json, after_json, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(
    actorUserId,
    entityType,
    entityId,
    action,
    before ? JSON.stringify(before) : null,
    after ? JSON.stringify(after) : null,
    nowIso()
  );
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
