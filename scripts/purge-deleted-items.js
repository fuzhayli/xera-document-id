const fs = require("node:fs");
const path = require("node:path");
const { createDatabase } = require("../server/db");

const ROOT_DIR = path.resolve(__dirname, "..");
loadEnvFile(path.join(ROOT_DIR, ".env"));

const TURSO_DATABASE_URL = process.env.TURSO_DATABASE_URL;
const TURSO_AUTH_TOKEN = process.env.TURSO_AUTH_TOKEN;
const RUN_NAME = "purge_deleted_items_20260608";

main().catch(error => {
  console.error("Deleted-items purge failed.");
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
      console.log(`Deleted-items purge already completed: ${RUN_NAME}`);
      return;
    }

    const summary = await db.transaction(async () => {
      const deletedItems = await db.prepare(`
        SELECT *
        FROM deleted_items
        ORDER BY deleted_at ASC, id ASC
      `).all();

      const documentIds = new Set();
      const partIds = new Set();
      const documentRequestIds = new Set();
      const partRequestIds = new Set();
      const documentMatchKeys = new Set();

      for (const item of deletedItems) {
        const record = safeParseJson(item.record_json) || {};
        if (item.entity_type === "document") {
          addNumber(documentIds, item.entity_id);
          addNumber(documentIds, record.id);
          addNumber(documentRequestIds, record.request_id);
          addKey(documentMatchKeys, item.display_key);
          addKey(documentMatchKeys, record.display_key);
          addKey(documentMatchKeys, record.document_no);
          addKey(documentMatchKeys, record.generated_filename);
          addKey(documentMatchKeys, record.document_name);
        }
        if (item.entity_type === "part") {
          addNumber(partIds, item.entity_id);
          addNumber(partIds, record.id);
          addNumber(partRequestIds, record.request_id);
        }
      }

      const documentRows = await db.prepare(`
        SELECT id, request_id, document_no, generated_filename, document_name
        FROM document_records
      `).all();

      for (const document of documentRows) {
        const matchesDeletedDocument = documentIds.has(Number(document.id))
          || hasKey(documentMatchKeys, document.document_no)
          || hasKey(documentMatchKeys, document.generated_filename)
          || hasKey(documentMatchKeys, document.document_name);

        if (matchesDeletedDocument) {
          addNumber(documentIds, document.id);
          addNumber(documentRequestIds, document.request_id);
        }
      }

      const partRows = await db.prepare(`
        SELECT id, request_id
        FROM part_records
      `).all();

      for (const part of partRows) {
        if (partIds.has(Number(part.id))) {
          addNumber(partRequestIds, part.request_id);
        }
      }

      for (const documentId of documentIds) {
        await db.prepare("DELETE FROM document_revision_requests WHERE document_record_id = ?").run(documentId);
        await db.prepare("DELETE FROM document_revision_archive WHERE document_record_id = ?").run(documentId);
        await db.prepare("DELETE FROM notifications WHERE entity_id = ? AND entity_type IN ('document', 'document_record')").run(documentId);
        await db.prepare("DELETE FROM audit_logs WHERE entity_id = ? AND entity_type IN ('document', 'document_record')").run(documentId);
        await db.prepare("DELETE FROM document_records WHERE id = ?").run(documentId);
      }

      for (const requestId of documentRequestIds) {
        await db.prepare("DELETE FROM notifications WHERE related_request_id = ? OR (entity_id = ? AND entity_type IN ('document_request', 'revision_request'))").run(requestId, requestId);
        await db.prepare("DELETE FROM audit_logs WHERE entity_id = ? AND entity_type IN ('document_request', 'revision_request')").run(requestId);
        await db.prepare("DELETE FROM document_requests WHERE id = ?").run(requestId);
      }

      for (const partId of partIds) {
        await db.prepare("DELETE FROM part_revision_requests WHERE part_record_id = ?").run(partId);
        await db.prepare("DELETE FROM notifications WHERE entity_id = ? AND entity_type IN ('part', 'part_record')").run(partId);
        await db.prepare("DELETE FROM audit_logs WHERE entity_id = ? AND entity_type IN ('part', 'part_record')").run(partId);
        await db.prepare("DELETE FROM part_records WHERE id = ?").run(partId);
      }

      for (const requestId of partRequestIds) {
        await db.prepare("DELETE FROM notifications WHERE related_request_id = ? OR (entity_id = ? AND entity_type IN ('part_request', 'part_revision_request'))").run(requestId, requestId);
        await db.prepare("DELETE FROM audit_logs WHERE entity_id = ? AND entity_type IN ('part_request', 'part_revision_request')").run(requestId);
        await db.prepare("DELETE FROM part_requests WHERE id = ?").run(requestId);
      }

      await db.prepare("DELETE FROM deleted_items").run();

      const result = {
        deletedItems: deletedItems.length,
        documentRecordsRemoved: documentIds.size,
        documentRequestsRemoved: documentRequestIds.size,
        partRecordsRemoved: partIds.size,
        partRequestsRemoved: partRequestIds.size,
        documentMatchKeys: documentMatchKeys.size
      };

      await db.prepare(`
        INSERT INTO maintenance_runs (name, summary_json, created_at)
        VALUES (?, ?, ?)
      `).run(RUN_NAME, JSON.stringify(result), nowIso());

      return result;
    });

    console.log("Deleted-items purge complete.");
    console.log(JSON.stringify(summary, null, 2));
  } finally {
    if (typeof db.close === "function") await db.close();
  }
}

function addNumber(set, value) {
  const number = Number(value);
  if (Number.isFinite(number) && number > 0) set.add(number);
}

function addKey(set, value) {
  const key = normalizeKey(value);
  if (key) set.add(key);
}

function hasKey(set, value) {
  const key = normalizeKey(value);
  return key ? set.has(key) : false;
}

function normalizeKey(value) {
  return String(value || "")
    .trim()
    .replace(/\s+/g, " ")
    .toLowerCase();
}

function safeParseJson(value) {
  try {
    return JSON.parse(value || "null");
  } catch {
    return null;
  }
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
