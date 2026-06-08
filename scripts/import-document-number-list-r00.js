const fs = require("node:fs");
const path = require("node:path");
const { createDatabase } = require("../server/db");

const ROOT_DIR = path.resolve(__dirname, "..");
loadEnvFile(path.join(ROOT_DIR, ".env"));

const TURSO_DATABASE_URL = process.env.TURSO_DATABASE_URL;
const TURSO_AUTH_TOKEN = process.env.TURSO_AUTH_TOKEN;
const RUN_NAME = "import_document_number_list_r00_all_rows_with_x_names_20260608";
const DEFAULT_CREATION_DATE = "2026-06-08";

const DOCUMENTS = buildDocumentsFromWorkbookPlan();

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
        await insertAudit(db, systemUser.id, "document_request", requestId, "document_number_list.imported", null, auditPayload(document));
        await insertAudit(db, systemUser.id, "document_record", recordId, "document_number_list.imported", null, auditPayload(document));
        await bumpDocumentSequence(db, document);
        inserted += 1;
      }

      const result = {
        source: "Document Number List_r00.xlsx",
        totalRowsWithDocumentId: DOCUMENTS.length,
        inserted,
        skipped,
        blankDocumentNamesFilledAsX: DOCUMENTS.filter(document => /^x\d+$/.test(document.document_name)).length,
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

function buildDocumentsFromWorkbookPlan() {
  const documents = [];
  let blankNameIndex = 0;

  const add = (input) => {
    const documentName = cleanText(input.document_name) || `x${++blankNameIndex}`;
    const document = {
      source_sheet: input.source_sheet,
      source_row: input.source_row,
      category: input.category,
      company_code: input.company_code || "X",
      year_yy: input.year_yy || "26",
      sequence_no: input.sequence_no || "000",
      document_no: input.document_no,
      revision: normalizeRevision(input.revision),
      reference_type: input.reference_type || "model",
      reference_value: cleanText(input.reference_value),
      document_name: documentName,
      written_by: cleanText(input.written_by) || "Auto Published",
      creation_date: input.creation_date || DEFAULT_CREATION_DATE,
      control_status: input.control_status || "controlled",
      payload: input.payload || {}
    };
    document.generated_filename = buildGeneratedFilename(document);
    documents.push(document);
  };

  const dRows = {
    "001": { product: "GR10X", name: "Informed Consent for PMCF Survey_Radiologist 1", writtenBy: "Aisha F." },
    "002": { product: "GR10X", name: "Informed Consent for PMCF Survey_Radiologist 2", writtenBy: "Aisha F." },
    "003": { product: "GR10X", name: "Informed Consent for PMCF Survey_Radiology Technician 1", writtenBy: "Aisha F." },
    "004": { product: "GR10X", name: "Informed Consent for PMCF Survey_Radiology Technician 2", writtenBy: "Aisha F." },
    "005": { product: "GR10X", writtenBy: "Aisha F." },
    "006": { product: "GR10X", writtenBy: "Aisha F." },
    "007": { product: "GR10X", writtenBy: "Aisha F." },
    "008": { product: "GR10X", name: "GR10X Labels (Draft for Administrative Change on Certificates)", writtenBy: "Aisha F.", creationDate: "2026-02-10" },
    "009": { product: "XEBT-W6", name: "Initial Issue Report Hacettepe Room1", writtenBy: "Huzaifa", creationDate: "2026-05-12" },
    "010": { product: "XEBT-W6", name: "Action_Report on initial field issue Hacettepe Room1", writtenBy: "Huzaifa", creationDate: "2026-05-13" },
    "011": { product: "GR10X", name: "LoA for Nepal Tender (Absolute Meditech Pvt. Ltd.)", writtenBy: "Aisha F.", creationDate: "2026-05-14" },
    "012": { product: "GR10X", name: "Relationship Letter_XERA-TNMI (UAE Registration)", writtenBy: "Aisha F.", creationDate: "2026-05-14" },
    "013": { product: "GR10X", name: "Lifetime of General Radiography X-ray System_EN", writtenBy: "Aisha F.", creationDate: "2026-05-14" },
    "014": { product: "GR10X", name: "Cihaz Kullanım Ömrü Belgesi_TR", writtenBy: "Aisha F.", creationDate: "2026-05-15" },
    "015": { product: "GR10X", name: "LoA for Nepal Tender_(M/S Bhagwati Scientific And Trading Order Suppliers)", writtenBy: "Aisha F.", creationDate: "2026-05-14" },
    "016": { product: "R&D", name: "VR10X-GR10X_USB Signal Isolator Technical Documentation Report_r00", writtenBy: "Emre Tuncer", creationDate: "2026-05-18" }
  };

  for (let index = 1; index <= 26; index += 1) {
    const sequenceNo = pad(index, 3);
    const row = dRows[sequenceNo] || {};
    add({
      source_sheet: "D_Documents",
      source_row: index + 4,
      category: "D",
      year_yy: "26",
      sequence_no: sequenceNo,
      document_no: `XD-26-${sequenceNo}`,
      revision: "00",
      reference_value: row.product || "",
      document_name: row.name || "",
      written_by: row.writtenBy || "",
      creation_date: row.creationDate || DEFAULT_CREATION_DATE
    });
  }

  addSequentialRows({ documents, add, sheet: "R_Documents", category: "R", prefix: "XR", count: 26, dateSuffix: true });
  addSequentialRows({ documents, add, sheet: "MD_Documents", category: "MD", prefix: "XMD", count: 26 });
  addSequentialRows({ documents, add, sheet: "MR_Documents", category: "MR", prefix: "XMR", count: 26, dateSuffix: true });

  const ecRows = [
    ["A", "R", ""],
    ["A", "Rr", "001"],
    ["A", "E", ""],
    ["A", "O", ""],
    ["A", "N", ""],
    ["B", "R", ""],
    ["B", "Rr", "001"],
    ["B", "E", ""],
    ["B", "O", ""],
    ["B", "N", ""]
  ];
  ecRows.forEach(([order, type, sequence], rowIndex) => {
    const sequenceNo = type === "Rr" ? sequence : "000";
    add({
      source_sheet: "EC_Documents",
      source_row: rowIndex + 5,
      category: "EC",
      year_yy: "26",
      sequence_no: sequenceNo,
      document_no: `XEC-26${order}-${type}${type === "Rr" ? `-${sequenceNo}` : ""}`,
      revision: "00",
      document_name: "",
      payload: { detail_type: type, detail_code: order }
    });
  });

  const templateRows = [
    [5, "05", "01", "01", "Quotation Form Template_EN", "Can YALİN", "2026-05-11"],
    [6, "05", "02", "02", "Fiyat Teklifi Formun Template_TR", "Can YALİN", "2026-05-11"],
    [7, "05", "03", "01", "Proforma Invoice Template", "Can YALİN", "2026-05-11"],
    [8, "05", "04", "03", "Packing List & Commercial Invoice Template", "Can YALİN", "2026-05-11"],
    [9, "05", "05", "01", "Service Training Certificate Template", "Can YALİN", "2026-05-11"],
    [10, "05", "06", "01", "Certificate of Authorization for Servicing Activities Template", "Can YALİN", "2026-05-11"],
    [11, "05", "07", "01", "Export Loading Information/ İhracat Yükleme Template", "Can YALİN", "2026-05-11"],
    [12, "05", "08", "01", "Sales Information List Template", "Can YALİN", "2026-05-11"],
    [13, "05", "09", "01", "General Sales Contract Template", "Can YALİN", "2026-05-11"],
    [14, "18", "01", "00", "Initial Issue Report Template", "Ethan", "2026-05-11"],
    [15, "18", "02", "00", "Action Report on Initial Field Issue", "Ethan", "2026-05-12"]
  ];
  templateRows.forEach(([sourceRow, processNo, sequenceNo, revision, name, writtenBy, creationDate]) => {
    add({
      source_sheet: "Template",
      source_row: sourceRow,
      category: "QMS",
      year_yy: "26",
      sequence_no: sequenceNo,
      document_no: `XQT-${processNo}-${sequenceNo}`,
      revision,
      reference_value: processNo,
      document_name: name,
      written_by: writtenBy,
      creation_date: creationDate,
      payload: { detail_type: "QT" }
    });
  });

  add({
    source_sheet: "QMS_Documents",
    source_row: 5,
    category: "QMS",
    year_yy: "26",
    sequence_no: "000",
    document_no: "XQM-26",
    revision: "00",
    reference_value: "26",
    document_name: "Quality Manual",
    creation_date: "2026-03-26",
    payload: { detail_type: "QM" }
  });

  const qmsNames = {
    "01": { name: "Control of Document and Records Management", creationDate: "2026-03-31" },
    "02": { name: "Control of Quality Objective & Communication", creationDate: "2026-04-20" }
  };
  for (let index = 1; index <= 21; index += 1) {
    const processNo = pad(index, 2);
    const row = qmsNames[processNo] || {};
    add({
      source_sheet: "QMS_Documents",
      source_row: index + 5,
      category: "QMS",
      year_yy: "26",
      sequence_no: "000",
      document_no: `XQP-${processNo}`,
      revision: "00",
      reference_value: processNo,
      document_name: row.name || "",
      creation_date: row.creationDate || DEFAULT_CREATION_DATE,
      payload: { detail_type: "QP" }
    });
  }

  add({
    source_sheet: "QMS_Documents",
    source_row: 27,
    category: "SOP",
    year_yy: "26",
    sequence_no: "001",
    document_no: "XQS-01-001",
    revision: "00",
    reference_value: "01",
    document_name: "",
    creation_date: DEFAULT_CREATION_DATE,
    payload: { detail_type: "SOP" }
  });

  return documents;
}

function addSequentialRows({ add, sheet, category, prefix, count, dateSuffix = false }) {
  for (let index = 1; index <= count; index += 1) {
    const sequenceNo = pad(index, 3);
    add({
      source_sheet: sheet,
      source_row: index + 4,
      category,
      year_yy: "26",
      sequence_no: sequenceNo,
      document_no: `${prefix}-26-${sequenceNo}`,
      revision: "00",
      document_name: "",
      creation_date: DEFAULT_CREATION_DATE,
      payload: dateSuffix ? { suffix_type: "date" } : {}
    });
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
    LIMIT 1
  `).get(document.document_no);
  if (recordByNumber) return { reason: "document_no already exists in document_records" };

  const recordByFilename = await db.prepare(`
    SELECT id
    FROM document_records
    WHERE UPPER(generated_filename) = UPPER(?)
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

function buildGeneratedFilename(document) {
  if (document.category === "MARKETING") return document.document_no;
  const suffix = ["R", "MR"].includes(document.category)
    ? document.creation_date.replaceAll("-", "")
    : document.revision;
  const parts = [document.document_no];
  if (!["QMS", "SOP"].includes(document.category) && document.reference_value) parts.push(document.reference_value);
  parts.push(document.document_name, suffix);
  return sanitizeFilename(parts.filter(Boolean).join("_"));
}

function sanitizeFilename(value) {
  return String(value || "")
    .replace(/[\\/:*?"<>|]/g, "-")
    .replace(/\s+/g, " ")
    .trim();
}

function cleanText(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function normalizeRevision(value) {
  const digits = String(value || "00").replace(/\D/g, "");
  return `r${(digits || "00").padStart(2, "0").slice(-2)}`;
}

function pad(value, length) {
  return String(value).padStart(length, "0");
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
