async function ensurePendingDocumentRevisionConstraint(db, now) {
  await db.transaction(async () => {
    await db.prepare(`
      UPDATE document_revision_requests
      SET status = 'rejected',
          reject_reason = COALESCE(NULLIF(reject_reason, ''), 'Automatically closed because another pending revision request already exists.'),
          updated_at = ?
      WHERE status = 'pending'
        AND id NOT IN (
          SELECT MIN(id)
          FROM document_revision_requests
          WHERE status = 'pending'
          GROUP BY document_record_id
        )
    `).run(now);

    await db.exec("CREATE UNIQUE INDEX IF NOT EXISTS idx_document_revision_requests_pending ON document_revision_requests(document_record_id) WHERE status = 'pending';");
  });
}

const GR10X_SHEET_METAL_DESCRIPTION_MIGRATION_ID = "2026-07-21-gr10x-sheet-metal-description-corrections-v1";

const GR10X_SHEET_METAL_DESCRIPTION_CORRECTIONS = Object.freeze([
  ["X101-2097-01A", "50X50 Squarred Pipe 4.0mm"],
  ["X101-2012-01A", "DC01(ST12) (DKP) 1.2mm, RAL 9016 Teksture"],
  ["X101-2087-01B", "50x30 Galvanizli Kutu Profil 2.0mm"],
  ["X101-2017-02B", "DD11(StW22) (HRP) 3.0mm, Elektro Galvaniz (Beyaz)"],
  ["X101-2019-01A", "DD11(StW22) (HRP) veya ST37-2(S235JR) 5.0mm, Elektro Galvaniz (Beyaz)"],
  ["1501-1273-01A", "DC01(ST12) (DKP) 1.0mm, RAL 9016 Teksture"],
  ["X101-2045-01A", "DD11(StW22) (HRP) veya ST37-2(S235JR) 5.0mm, Elektro Galvaniz (Beyaz)"],
  ["X101-2042-02A", "ST12(DC01) veya ST37(S235JR) 5.0mm / 3.0mm, Elektro Galvaniz (Beyaz)"],
  ["X101-2041-01A", "ST37-2(S235JR) 8.0mm, RAL9016 Teksture"],
  ["X101-2054-01A", "DC01(ST12) (DKP) veya ST37-2(S235JR) 5.0mm, Elektro Galvaniz (Beyaz)"],
  ["1501-1269-01A", "ST12(DC01) 3.0mm, Elektro Galvaniz (Beyaz)"],
  ["X101-2032-01A", "DC01(ST12) veya ST37-2(S235JR) 5.0mm, Elektro Galvaniz (Beyaz)"],
  ["X101-2090-01B", "DC01(ST12) (DKP) 3.0mm, Elektro Galvaniz (Beyaz)"],
  ["X101-2101-01A", "AL5754 3.0mm"],
  ["X101-2001-01B", "ST37-2(S235JR) 10.0mm, Elektro Galvaniz & RAL 7035 Teksture"],
  ["X101-2011-01A", "DD11(StW22) (HRP) 3.0mm, Elektro Galvaniz (Beyaz)"],
  ["X101-2010-01A", "DC01(ST12) (DKP) 1.0mm, Elektro Galvaniz (Beyaz)"],
  ["X101-2007-01A", "AISI-304 1.2mm"],
  ["1501-1245-01A", "DC01(ST12) (DKP) 2.0mm, Elektro Galvaniz (Beyaz)"],
  ["1501-1324-01A", "DD11(StW22) (HRP) 3.0mm, Elektro Galvaniz (Beyaz)"],
  ["1501-1328-02A", "AISI-304 1.5mm, polishing"],
  ["1501-1331-01A", "AISI-304 0.5mm"],
  ["1501-1326-05A", "DC01(ST12) (DKP) OR DD11 (StW22) (HRP) 3.0mm, Elektro Galvaniz (Beyaz)"],
  ["1501-1238-01A", "DC01(ST12) (DKP) 2.0mm, Elektro Galvaniz (Beyaz)"],
  ["1501-1209-03A", "DD11(StW22) (HRP) 1.5mm / 3.0mm / 4.0mm, RAL7035 texture (Gri)"],
  ["1501-1212-02A", "AISI-304 1.5mm, Polishing"]
]);

async function applyGr10xSheetMetalDescriptionCorrections(db, now) {
  await db.exec(`
    CREATE TABLE IF NOT EXISTS app_migrations (
      migration_id TEXT PRIMARY KEY,
      applied_at TEXT NOT NULL,
      details_json TEXT
    )
  `);

  return await db.transaction(async () => {
    const claim = await db.prepare(`
      INSERT OR IGNORE INTO app_migrations (migration_id, applied_at, details_json)
      VALUES (?, ?, '{}')
    `).run(GR10X_SHEET_METAL_DESCRIPTION_MIGRATION_ID, now);
    if (Number(claim.changes || 0) === 0) {
      return { applied: false, updatedParts: 0, updatedRequests: 0 };
    }

    const systemUser = await db.prepare("SELECT id FROM users WHERE username = 'auto_published'").get();
    let updatedParts = 0;
    let updatedRequests = 0;

    for (const [partNumber, description] of GR10X_SHEET_METAL_DESCRIPTION_CORRECTIONS) {
      const records = await db.prepare(`
        SELECT *
        FROM part_records
        WHERE part_number = ?
          AND deleted_at IS NULL
      `).all(partNumber);

      for (const before of records) {
        if (before.description === description) continue;
        await db.prepare("UPDATE part_records SET description = ? WHERE id = ?").run(description, before.id);
        await db.prepare(`
          INSERT INTO audit_logs (
            actor_user_id, entity_type, entity_id, action, before_json, after_json, created_at
          )
          VALUES (?, 'part_record', ?, 'part.description_corrected', ?, ?, ?)
        `).run(
          systemUser ? systemUser.id : null,
          before.id,
          JSON.stringify(before),
          JSON.stringify({ ...before, description }),
          now
        );
        updatedParts += 1;
      }

      const requests = await db.prepare(`
        SELECT id, description, payload_json
        FROM part_requests
        WHERE part_number = ?
      `).all(partNumber);
      for (const request of requests) {
        if (request.description === description && payloadDescription(request.payload_json) === description) continue;
        await db.prepare(`
          UPDATE part_requests
          SET description = ?, payload_json = ?, updated_at = ?
          WHERE id = ?
        `).run(description, updatePayloadDescription(request.payload_json, description), now, request.id);
        updatedRequests += 1;
      }
    }

    const details = {
      correctionCount: GR10X_SHEET_METAL_DESCRIPTION_CORRECTIONS.length,
      updatedParts,
      updatedRequests
    };
    await db.prepare("UPDATE app_migrations SET details_json = ? WHERE migration_id = ?")
      .run(JSON.stringify(details), GR10X_SHEET_METAL_DESCRIPTION_MIGRATION_ID);
    return { applied: true, ...details };
  });
}

function payloadDescription(payloadJson) {
  try {
    return JSON.parse(payloadJson || "{}").description;
  } catch {
    return undefined;
  }
}

function updatePayloadDescription(payloadJson, description) {
  let payload = {};
  try {
    payload = JSON.parse(payloadJson || "{}");
  } catch {
    payload = {};
  }
  return JSON.stringify({ ...payload, description });
}

module.exports = {
  ensurePendingDocumentRevisionConstraint,
  applyGr10xSheetMetalDescriptionCorrections,
  GR10X_SHEET_METAL_DESCRIPTION_CORRECTIONS,
  GR10X_SHEET_METAL_DESCRIPTION_MIGRATION_ID
};
