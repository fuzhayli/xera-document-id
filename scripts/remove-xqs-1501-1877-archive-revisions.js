const fs = require("node:fs");
const path = require("node:path");
const { createDatabase } = require("../server/db");

const ROOT_DIR = path.resolve(__dirname, "..");
loadEnvFile(path.join(ROOT_DIR, ".env"));

const TURSO_DATABASE_URL = process.env.TURSO_DATABASE_URL;
const TURSO_AUTH_TOKEN = process.env.TURSO_AUTH_TOKEN;
const RUN_NAME = "remove_xqs_1501_1877_archive_revisions_20260609";
const TARGET_DOCUMENT_NO = "XQS-1501-1877";
const TARGET_REVISIONS = ["r00", "r01"];

main().catch(error => {
  console.error("Archive revision cleanup failed.");
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
      console.log(`Archive revision cleanup already completed: ${RUN_NAME}`);
      return;
    }

    const archiveTable = await db.prepare(`
      SELECT name
      FROM sqlite_master
      WHERE type = 'table' AND name = 'document_revision_archive'
    `).get();

    if (!archiveTable) {
      await saveRun(db, { deletedRows: 0, reason: "document_revision_archive table does not exist" });
      console.log("Archive revision cleanup skipped: document_revision_archive table does not exist.");
      return;
    }

    const rowsBefore = await db.prepare(`
      SELECT id, document_record_id, document_no, revision, next_revision, generated_filename
      FROM document_revision_archive
      WHERE document_no = ?
        AND revision IN (?, ?)
      ORDER BY id ASC
    `).all(TARGET_DOCUMENT_NO, ...TARGET_REVISIONS);

    const summary = await db.transaction(async () => {
      const result = await db.prepare(`
        DELETE FROM document_revision_archive
        WHERE document_no = ?
          AND revision IN (?, ?)
      `).run(TARGET_DOCUMENT_NO, ...TARGET_REVISIONS);

      const runSummary = {
        documentNo: TARGET_DOCUMENT_NO,
        deletedRows: result.changes || 0,
        targetRevisions: TARGET_REVISIONS,
        rowsBefore
      };

      await saveRun(db, runSummary);
      return runSummary;
    });

    console.log("Archive revision cleanup complete.");
    console.log(JSON.stringify(summary, null, 2));
  } finally {
    if (typeof db.close === "function") await db.close();
  }
}

async function saveRun(db, summary) {
  await db.prepare(`
    INSERT INTO maintenance_runs (name, summary_json, created_at)
    VALUES (?, ?, ?)
  `).run(RUN_NAME, JSON.stringify(summary), new Date().toISOString());
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
