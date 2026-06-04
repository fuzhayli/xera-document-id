const fs = require("node:fs");
const path = require("node:path");
const { DatabaseSync } = require("node:sqlite");
const { createClient } = require("@libsql/client");

const ROOT_DIR = path.resolve(__dirname, "..");
loadEnvFile(path.join(ROOT_DIR, ".env"));

const DEFAULT_SQLITE_PATH = path.resolve(
  ROOT_DIR,
  "..",
  "2026-06-03 SQLite Based - XERA Document ID Generator",
  "data",
  "xera-document-id.sqlite"
);

const SQLITE_DB_PATH = process.env.SQLITE_DB_PATH || DEFAULT_SQLITE_PATH;
const TURSO_DATABASE_URL = process.env.TURSO_DATABASE_URL;
const TURSO_AUTH_TOKEN = process.env.TURSO_AUTH_TOKEN;
const SHOULD_RESET = process.argv.includes("--reset") || process.env.MIGRATION_RESET === "1";

const TABLES = [
  "users",
  "document_categories",
  "document_sequences",
  "document_requests",
  "document_records",
  "document_revision_archive",
  "document_revision_requests",
  "part_sequences",
  "part_requests",
  "part_records",
  "part_revision_requests",
  "part_standard_hardware_reference",
  "audit_logs"
];

main().catch(error => {
  console.error(error);
  process.exit(1);
});

async function main() {
  if (!TURSO_DATABASE_URL) throw new Error("TURSO_DATABASE_URL is required.");
  if (!fs.existsSync(SQLITE_DB_PATH)) throw new Error(`SQLite database not found: ${SQLITE_DB_PATH}`);

  const source = new DatabaseSync(SQLITE_DB_PATH, { readOnly: true });
  const target = createClient({
    url: TURSO_DATABASE_URL,
    authToken: TURSO_AUTH_TOKEN
  });

  try {
    await createTargetSchema(source, target);
    await assertTargetIsReady(target);
    if (SHOULD_RESET) await resetTarget(target);

    const sourceCounts = {};
    const targetCountsBefore = {};
    for (const table of TABLES) {
      sourceCounts[table] = countSourceRows(source, table);
      targetCountsBefore[table] = await countTargetRows(target, table);
    }

    const occupiedTables = Object.entries(targetCountsBefore).filter(([, count]) => count > 0);
    if (occupiedTables.length > 0 && !SHOULD_RESET) {
      throw new Error(
        `Target database already contains data (${occupiedTables.map(([table, count]) => `${table}:${count}`).join(", ")}). ` +
        "Run with --reset only if this is the intended migration target."
      );
    }

    for (const table of TABLES) {
      await copyTable(source, target, table);
    }

    const targetCountsAfter = {};
    for (const table of TABLES) {
      targetCountsAfter[table] = await countTargetRows(target, table);
    }

    console.log("Migration complete.");
    console.log(JSON.stringify({ source: sourceCounts, target: targetCountsAfter }, null, 2));
  } finally {
    source.close();
    target.close();
  }
}

async function createTargetSchema(source, target) {
  await target.execute("PRAGMA foreign_keys = OFF");

  const tableSqlRows = source.prepare(`
    SELECT name, sql
    FROM sqlite_master
    WHERE type = 'table'
      AND name NOT LIKE 'sqlite_%'
    ORDER BY name
  `).all();

  for (const row of tableSqlRows) {
    if (row.name === "user_sessions") continue;
    await target.execute(row.sql);
  }

  const indexSqlRows = source.prepare(`
    SELECT name, sql
    FROM sqlite_master
    WHERE type = 'index'
      AND sql IS NOT NULL
    ORDER BY name
  `).all();

  for (const row of indexSqlRows) {
    const sql = addIfNotExistsToIndexSql(row.sql);
    await target.execute(sql);
  }

  await target.execute("PRAGMA foreign_keys = ON");
}

async function assertTargetIsReady(target) {
  for (const table of TABLES) {
    await target.execute(`SELECT 1 FROM "${table}" LIMIT 1`);
  }
}

async function resetTarget(target) {
  await target.execute("PRAGMA foreign_keys = OFF");
  for (const table of [...TABLES].reverse()) {
    await target.execute(`DELETE FROM "${table}"`);
  }
  await target.execute("PRAGMA foreign_keys = ON");
}

async function copyTable(source, target, table) {
  const columns = source.prepare(`PRAGMA table_info("${table}")`).all().map(column => column.name);
  const rows = source.prepare(`SELECT ${columns.map(column => `"${column}"`).join(", ")} FROM "${table}"`).all();
  if (rows.length === 0) return;

  const sql = `INSERT OR REPLACE INTO "${table}" (${columns.map(column => `"${column}"`).join(", ")}) VALUES (${columns.map(() => "?").join(", ")})`;
  const batch = rows.map(row => ({
    sql,
    args: columns.map(column => normalizeValue(row[column]))
  }));

  for (let index = 0; index < batch.length; index += 100) {
    await target.batch(batch.slice(index, index + 100), "write");
  }
}

function countSourceRows(source, table) {
  return Number(source.prepare(`SELECT COUNT(*) AS count FROM "${table}"`).get().count || 0);
}

async function countTargetRows(target, table) {
  const result = await target.execute(`SELECT COUNT(*) AS count FROM "${table}"`);
  return Number(result.rows[0].count || 0);
}

function addIfNotExistsToIndexSql(sql) {
  return sql
    .replace(/^CREATE UNIQUE INDEX\s+/i, "CREATE UNIQUE INDEX IF NOT EXISTS ")
    .replace(/^CREATE INDEX\s+/i, "CREATE INDEX IF NOT EXISTS ");
}

function normalizeValue(value) {
  if (typeof value === "bigint") return Number(value);
  return value;
}

function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return;
  const lines = fs.readFileSync(filePath, "utf8").split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const separatorIndex = trimmed.indexOf("=");
    if (separatorIndex < 1) continue;
    const key = trimmed.slice(0, separatorIndex).trim();
    let value = trimmed.slice(separatorIndex + 1).trim();
    if ((value.startsWith("\"") && value.endsWith("\"")) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (!process.env[key]) process.env[key] = value;
  }
}
