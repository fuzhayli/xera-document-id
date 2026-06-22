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

module.exports = { ensurePendingDocumentRevisionConstraint };
