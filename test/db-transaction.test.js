const test = require("node:test");
const assert = require("node:assert/strict");
const { createDatabase } = require("../server/db");
const { ensurePendingDocumentRevisionConstraint } = require("../server/migrations");

function temporaryDatabase() {
  return createDatabase({ url: "file::memory:?cache=shared" });
}

test("nested transactions join the outer transaction and roll back together", async () => {
  const db = temporaryDatabase();
  try {
    await db.exec("CREATE TABLE values_to_edit (id INTEGER PRIMARY KEY, value TEXT NOT NULL)");
    await assert.rejects(db.transaction(async () => {
      await db.prepare("INSERT INTO values_to_edit (value) VALUES (?)").run("record");
      await db.transaction(async () => {
        await db.prepare("INSERT INTO values_to_edit (value) VALUES (?)").run("request");
      });
      throw new Error("force rollback");
    }), /force rollback/);

    const row = await db.prepare("SELECT COUNT(*) AS count FROM values_to_edit").get();
    assert.equal(Number(row.count), 0);
  } finally {
    await db.close();
  }
});

test("pending document revision migration keeps one request and enforces uniqueness", async () => {
  const db = temporaryDatabase();
  try {
    await db.exec(`
      CREATE TABLE document_revision_requests (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        document_record_id INTEGER NOT NULL,
        status TEXT NOT NULL,
        reject_reason TEXT,
        updated_at TEXT NOT NULL
      )
    `);
    await db.prepare("INSERT INTO document_revision_requests (document_record_id, status, updated_at) VALUES (?, 'pending', ?)").run(7, "before-1");
    await db.prepare("INSERT INTO document_revision_requests (document_record_id, status, updated_at) VALUES (?, 'pending', ?)").run(7, "before-2");

    await ensurePendingDocumentRevisionConstraint(db, "migration-time");

    const rows = await db.prepare("SELECT status, reject_reason FROM document_revision_requests ORDER BY id").all();
    assert.equal(rows[0].status, "pending");
    assert.equal(rows[1].status, "rejected");
    assert.match(rows[1].reject_reason, /another pending revision request/);
    await assert.rejects(
      db.prepare("INSERT INTO document_revision_requests (document_record_id, status, updated_at) VALUES (?, 'pending', ?)").run(7, "after"),
      /UNIQUE constraint failed/
    );
  } finally {
    await db.close();
  }
});
