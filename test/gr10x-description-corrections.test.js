const test = require("node:test");
const assert = require("node:assert/strict");
const { createDatabase } = require("../server/db");
const {
  applyGr10xSheetMetalDescriptionCorrections,
  applyBtMainFrame3mmDescriptionCorrection,
  GR10X_SHEET_METAL_DESCRIPTION_MIGRATION_ID,
  BT_MAIN_FRAME_3MM_DESCRIPTION_MIGRATION_ID
} = require("../server/migrations");

function temporaryDatabase() {
  return createDatabase({ url: "file::memory:?cache=shared" });
}

test("GR10X sheet metal description migration is complete, consistent and idempotent", async () => {
  const db = temporaryDatabase();
  try {
    await db.exec(`
      CREATE TABLE users (id INTEGER PRIMARY KEY, username TEXT NOT NULL UNIQUE);
      CREATE TABLE part_records (
        id INTEGER PRIMARY KEY,
        request_id INTEGER,
        part_number TEXT NOT NULL,
        part_name TEXT NOT NULL,
        description TEXT,
        deleted_at TEXT
      );
      CREATE TABLE part_requests (
        id INTEGER PRIMARY KEY,
        part_number TEXT NOT NULL,
        description TEXT,
        payload_json TEXT,
        updated_at TEXT
      );
      CREATE TABLE audit_logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        actor_user_id INTEGER,
        entity_type TEXT NOT NULL,
        entity_id INTEGER NOT NULL,
        action TEXT NOT NULL,
        before_json TEXT,
        after_json TEXT,
        created_at TEXT NOT NULL
      )
    `);
    await db.prepare("INSERT INTO users (id, username) VALUES (1, 'auto_published')").run();
    await db.prepare(`
      INSERT INTO part_requests (id, part_number, description, payload_json, updated_at)
      VALUES (10, 'X101-2097-01A', 'old request description', '{"keep":"value","description":"old"}', 'before')
    `).run();
    await db.prepare(`
      INSERT INTO part_records (id, request_id, part_number, part_name, description, deleted_at)
      VALUES (20, 10, 'X101-2097-01A', 'FTS_PIPE_ROD', 'old record description', NULL)
    `).run();
    await db.prepare(`
      INSERT INTO part_records (id, request_id, part_number, part_name, description, deleted_at)
      VALUES (21, NULL, '1501-1328-02A', 'BS_DETECTOR_SUB_LOWER', 'old detector description', NULL)
    `).run();

    const first = await applyGr10xSheetMetalDescriptionCorrections(db, "2026-07-21T12:00:00.000Z");
    assert.equal(first.applied, true);
    assert.equal(first.updatedParts, 2);
    assert.equal(first.updatedRequests, 1);

    const pipe = await db.prepare("SELECT description FROM part_records WHERE id = 20").get();
    assert.equal(pipe.description, "50X50 Squarred Pipe 4.0mm");
    const detector = await db.prepare("SELECT description FROM part_records WHERE id = 21").get();
    assert.equal(detector.description, "AISI-304 1.5mm, polishing");
    const request = await db.prepare("SELECT description, payload_json, updated_at FROM part_requests WHERE id = 10").get();
    assert.equal(request.description, "50X50 Squarred Pipe 4.0mm");
    assert.deepEqual(JSON.parse(request.payload_json), { keep: "value", description: "50X50 Squarred Pipe 4.0mm" });
    assert.equal(request.updated_at, "2026-07-21T12:00:00.000Z");

    const audits = await db.prepare("SELECT action FROM audit_logs ORDER BY id").all();
    assert.equal(audits.length, 2);
    assert.ok(audits.every(row => row.action === "part.description_corrected"));
    const migration = await db.prepare("SELECT details_json FROM app_migrations WHERE migration_id = ?")
      .get(GR10X_SHEET_METAL_DESCRIPTION_MIGRATION_ID);
    assert.deepEqual(JSON.parse(migration.details_json), {
      correctionCount: 26,
      updatedParts: 2,
      updatedRequests: 1
    });

    const second = await applyGr10xSheetMetalDescriptionCorrections(db, "2026-07-21T12:05:00.000Z");
    assert.deepEqual(second, { applied: false, updatedParts: 0, updatedRequests: 0 });
    assert.equal(Number((await db.prepare("SELECT COUNT(*) AS count FROM audit_logs").get()).count), 2);

    await db.prepare(`
      INSERT INTO part_records (id, request_id, part_number, part_name, description, deleted_at)
      VALUES (22, NULL, '1501-1209-03A', 'BT_MAIN_FRAME', 'DD11(StW22) (HRP) 1.5mm / 3.0mm / 4.0mm, RAL7035 texture (Gri)', NULL)
    `).run();
    const btMainFrame = await applyBtMainFrame3mmDescriptionCorrection(db, "2026-07-21T12:10:00.000Z");
    assert.deepEqual(btMainFrame, {
      applied: true,
      correctionCount: 1,
      updatedParts: 1,
      updatedRequests: 0
    });
    const correctedFrame = await db.prepare("SELECT description FROM part_records WHERE id = 22").get();
    assert.equal(correctedFrame.description, "DD11(StW22) (HRP) 3.0mm, RAL7035 texture (Gri)");
    const frameMigration = await db.prepare("SELECT details_json FROM app_migrations WHERE migration_id = ?")
      .get(BT_MAIN_FRAME_3MM_DESCRIPTION_MIGRATION_ID);
    assert.deepEqual(JSON.parse(frameMigration.details_json), {
      correctionCount: 1,
      updatedParts: 1,
      updatedRequests: 0
    });
    assert.equal(Number((await db.prepare("SELECT COUNT(*) AS count FROM audit_logs").get()).count), 3);

    const repeatedFrame = await applyBtMainFrame3mmDescriptionCorrection(db, "2026-07-21T12:15:00.000Z");
    assert.deepEqual(repeatedFrame, { applied: false, updatedParts: 0, updatedRequests: 0 });
    assert.equal(Number((await db.prepare("SELECT COUNT(*) AS count FROM audit_logs").get()).count), 3);
  } finally {
    await db.close();
  }
});
