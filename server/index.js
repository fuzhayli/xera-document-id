const http = require("node:http");
const { URL } = require("node:url");
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const zlib = require("node:zlib");
const { createDatabase } = require("./db");

const ROOT_DIR = path.resolve(__dirname, "..");
const DATA_DIR = path.join(ROOT_DIR, "data");
const PUBLIC_DIR = path.join(ROOT_DIR, "public");
const PARTS_WORKBOOK_PATH = path.join(ROOT_DIR, "Parts Management List (XD-22-005).xlsx");
loadEnvFile(path.join(ROOT_DIR, ".env"));

const TURSO_DATABASE_URL = process.env.TURSO_DATABASE_URL;
const TURSO_AUTH_TOKEN = process.env.TURSO_AUTH_TOKEN;
const PORT = Number(process.env.PORT || 32780);
const NODE_ENV = process.env.NODE_ENV || "development";
const ALLOW_PUBLIC_SIGNUP = !parseBooleanEnv(process.env.DISABLE_PUBLIC_SIGNUP, false);

// Document format rules are intentionally centralized here; every preview,
// approval, filename export and revision update path reads from this object.
const CATEGORY_RULES = {
  D: {
    code: "D",
    name: "General Purpose Document",
    prefix: "XD",
    suffixType: "revision",
    requiresSequence: true,
    implemented: true,
    example: "XD-26-001_GR10X-40K_Risk Management Report_r00"
  },
  R: {
    code: "R",
    name: "Record Purpose Document",
    prefix: "XR",
    suffixType: "date",
    requiresSequence: true,
    implemented: true,
    example: "XR-26-001_R&D_Literature Search Report_20260326"
  },
  MD: {
    code: "MD",
    name: "Manufacturing Dynamic Document",
    prefix: "XMD",
    suffixType: "revision",
    requiresSequence: true,
    implemented: true,
    example: "XMD-26-001_GR10X-40K_Product Wastage Follow-up_r00"
  },
  MR: {
    code: "MR",
    name: "Manufacturing Record Document",
    prefix: "XMR",
    suffixType: "date",
    requiresSequence: true,
    implemented: true,
    example: "XMR-26-001_GR10X-40K_Final Inspection Report_20260505"
  },
  EC: {
    code: "EC",
    name: "Engineering Change",
    prefix: "XEC",
    suffixType: "revision",
    requiresSequence: true,
    implemented: true,
    example: "XEC-26A-R_GR10X-40K_Critical malfunction of motor_r00"
  },
  QMS: {
    code: "QMS",
    name: "Quality Management",
    prefix: "XQ",
    suffixType: "revision",
    requiresSequence: true,
    implemented: true,
    example: "XQP-13_Control of Manufacturing Realization_r00"
  },
  SOP: {
    code: "SOP",
    name: "SOP / Instruction",
    prefix: "XQS",
    suffixType: "revision",
    requiresSequence: true,
    implemented: true,
    example: "XQS-13-001_Soldering_r00"
  },
  MARKETING: {
    code: "MARKETING",
    name: "Marketing Material ID",
    prefix: "XERA",
    suffixType: "marketing",
    requiresSequence: false,
    implemented: true,
    example: "XERA-GR10X-26BR01-ENV1"
  }
};
const REVISION_CATEGORY_CODES = Object.values(CATEGORY_RULES)
  .filter(rule => rule.suffixType === "revision")
  .map(rule => rule.code);
const MARKETING_MATERIAL_TYPES = ["CA", "BR", "LE", "GE"];
const MARKETING_LANGUAGE_CODES = ["EN", "TR", "KR"];
const MARKETING_TYPE_ALIASES = {
  B: "BR",
  C: "CA",
  L: "LE",
  G: "GE"
};
const PART_PROJECTS = [
  { code: "X101", description: "GR10X (Turkey)" },
  { code: "X102", description: "VR10X (Turkey)" },
  { code: "X103", description: "6Way (Turkey)" },
  { code: "X104", description: "Long Format Detector (Turkey)" },
  { code: "X105", description: "GR20X" },
  { code: "1501", description: "GR10X (Korea)" }
];
const PART_MAIN_CODES = [
  { code: "1", name: "Finished Product" },
  { code: "2", name: "Sheet Metal & Aluminium & Pipe" },
  { code: "3", name: "Plastic & Rubber & Laminate" },
  { code: "4", name: "CNC Machining" },
  { code: "5", name: "Sub Assembly" },
  { code: "6", name: "Firmware" },
  { code: "7", name: "Electric Parts (PCBA, Cable, IC, etc.)" },
  { code: "8", name: "Dummy (Packing, Label, Sticker, Assembly Tools etc.)" },
  { code: "9", name: "Miscellaneous Bolt, Screw, Nut, etc." }
];
const PART_REVISION_MODES = [
  { code: "released", name: "Released Revision", defaultRevision: "01A", pattern: "^\\d{2}[A-Z]$", example: "01A" },
  { code: "design", name: "Design-stage Code", defaultRevision: "D01", pattern: "^D\\d{2}$", example: "D01" },
  { code: "change", name: "Design-change Intermediate Code", defaultRevision: "C01", pattern: "^C\\d{2}$", example: "C01" }
];
const PART_PROJECT_CODES = PART_PROJECTS.map(project => project.code);
const PART_MAIN_CODE_MAP = Object.fromEntries(PART_MAIN_CODES.map(mainCode => [mainCode.code, mainCode]));
const PART_REVISION_MODE_MAP = Object.fromEntries(PART_REVISION_MODES.map(mode => [mode.code, mode]));
const USER_ROLES = {
  USER: "user",
  PART_ADMIN: "part_admin",
  DOCUMENT_ADMIN: "document_admin",
  USER_ADMIN: "user_admin",
  ALL_ADMIN: "all_admin"
};
const ADMIN_PERMISSIONS = ["part_admin", "document_admin", "user_admin"];
const ROLE_LABELS = {
  [USER_ROLES.USER]: "User",
  [USER_ROLES.PART_ADMIN]: "Part List Admin",
  [USER_ROLES.DOCUMENT_ADMIN]: "Document List Admin",
  [USER_ROLES.USER_ADMIN]: "User Permissions Admin",
  [USER_ROLES.ALL_ADMIN]: "All Admin"
};
const ROLE_PERMISSIONS = {
  [USER_ROLES.USER]: [],
  [USER_ROLES.PART_ADMIN]: ["part_admin"],
  [USER_ROLES.DOCUMENT_ADMIN]: ["document_admin"],
  [USER_ROLES.USER_ADMIN]: ["user_admin"],
  [USER_ROLES.ALL_ADMIN]: ["part_admin", "document_admin", "user_admin"]
};
const ROLE_CHECK_SQL = "'user', 'part_admin', 'document_admin', 'user_admin', 'all_admin'";

fs.mkdirSync(DATA_DIR, { recursive: true });
if (!TURSO_DATABASE_URL) {
  throw new Error("TURSO_DATABASE_URL is required. Create a Turso database and set TURSO_DATABASE_URL and TURSO_AUTH_TOKEN.");
}

const db = createDatabase({
  url: TURSO_DATABASE_URL,
  authToken: TURSO_AUTH_TOKEN
});

// Route layer: keep request parsing and response codes here; business rules
// are implemented in the helper functions below to make changes safer.
const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);

    if (req.method === "OPTIONS") {
      return sendEmpty(res, 204);
    }

    if (req.method === "GET" && url.pathname === "/api") {
      return sendJson(res, 200, {
        name: "XERA Document ID API",
        version: "0.1.0",
        docs: "/api/rules",
        health: "/api/health"
      });
    }

    if (req.method === "GET" && url.pathname === "/api/public-config") {
      return sendJson(res, 200, { allow_public_signup: ALLOW_PUBLIC_SIGNUP });
    }

    if (req.method === "GET" && url.pathname === "/signup.html" && !ALLOW_PUBLIC_SIGNUP) {
      return sendRedirect(res, "/login.html");
    }

    if (req.method === "GET" && !url.pathname.startsWith("/api/")) {
      return serveStatic(res, url.pathname);
    }

    if (req.method === "GET" && url.pathname === "/api/health") {
      return sendJson(res, 200, { ok: true, database: maskDatabaseUrl(TURSO_DATABASE_URL) });
    }

    if (req.method === "POST" && url.pathname === "/api/auth/signup") {
      const body = await readJson(req);
      const result = await signupUser(body);
      return sendJson(res, 201, result);
    }

    if (req.method === "POST" && url.pathname === "/api/auth/login") {
      const body = await readJson(req);
      const result = await loginUser(body);
      return sendJson(res, 200, result);
    }

    if (req.method === "POST" && url.pathname === "/api/auth/logout") {
      await logoutUser(req);
      return sendJson(res, 200, { ok: true });
    }

    if (req.method === "GET" && url.pathname === "/api/auth/me") {
      const user = await resolveUser(req);
      return sendJson(res, 200, { user: publicUser(user) });
    }

    if (req.method === "GET" && url.pathname === "/api/notifications/my") {
      const user = await resolveUser(req);
      return sendJson(res, 200, { notifications: await listMyNotifications(user) });
    }

    const readNotificationMatch = url.pathname.match(/^\/api\/notifications\/(\d+)\/read$/);
    if (req.method === "POST" && readNotificationMatch) {
      const user = await resolveUser(req);
      const notificationId = Number(readNotificationMatch[1]);
      const notification = await markNotificationRead(notificationId, user);
      return sendJson(res, 200, { notification });
    }

    if (req.method === "GET" && url.pathname === "/api/rules") {
      return sendJson(res, 200, { categories: Object.values(CATEGORY_RULES) });
    }

    if (req.method === "GET" && url.pathname === "/api/parts/rules") {
      return sendJson(res, 200, {
        projects: PART_PROJECTS,
        main_codes: PART_MAIN_CODES,
        revision_modes: PART_REVISION_MODES
      });
    }

    if (req.method === "POST" && url.pathname === "/api/parts/preview") {
      const user = await resolveUser(req);
      const body = await readJson(req);
      const normalized = normalizePartRequestInput(body, user);
      const result = await buildPartPreview(normalized, { includeNextSequence: true });
      return sendJson(res, result.valid ? 200 : 422, result);
    }

    if (req.method === "POST" && url.pathname === "/api/parts/requests") {
      const user = await resolveUser(req);
      const body = await readJson(req);
      const request = await createPartRequest(user, body);
      return sendJson(res, 201, { request });
    }

    if (req.method === "GET" && url.pathname === "/api/parts/requests/my") {
      const user = await resolveUser(req);
      return sendJson(res, 200, { requests: await listMyPartRequests(user) });
    }

    const createPartRevisionRequestMatch = url.pathname.match(/^\/api\/parts\/(\d+)\/revision-request$/);
    if (req.method === "POST" && createPartRevisionRequestMatch) {
      const user = await resolveUser(req);
      const partId = Number(createPartRevisionRequestMatch[1]);
      const body = await readJson(req);
      const result = await createPartRevisionRequest(partId, user, body);
      return sendJson(res, 201, result);
    }

    const editPartMatch = url.pathname.match(/^\/api\/parts\/(\d+)\/edit$/);
    if (req.method === "POST" && editPartMatch) {
      const user = await resolveUser(req);
      const partId = Number(editPartMatch[1]);
      const body = await readJson(req);
      const result = await editPartRecordByRequester(partId, user, body);
      return sendJson(res, result.status === "pending_review" ? 202 : 200, result);
    }

    const adminEditPartMatch = url.pathname.match(/^\/api\/admin\/parts\/(\d+)\/edit$/);
    if (req.method === "POST" && adminEditPartMatch) {
      const user = await requirePermission(req, "part_admin");
      const partId = Number(adminEditPartMatch[1]);
      const body = await readJson(req);
      const result = await adminEditPartRecord(partId, user, body);
      return sendJson(res, 200, result);
    }

    const deletePartMatch = url.pathname.match(/^\/api\/admin\/parts\/(\d+)\/delete$/);
    if (req.method === "POST" && deletePartMatch) {
      const user = await requirePermission(req, "part_admin");
      const partId = Number(deletePartMatch[1]);
      const body = await readJson(req);
      const result = await deletePartRecord(partId, user, body);
      return sendJson(res, 200, result);
    }

    if (req.method === "GET" && url.pathname === "/api/parts") {
      return sendJson(res, 200, { parts: await listPartRecords({ includePendingRevision: true }) });
    }

    if (req.method === "GET" && url.pathname === "/api/parts/archive") {
      return sendJson(res, 200, { archive: await listPartArchive() });
    }

    if (req.method === "GET" && url.pathname === "/api/parts/standard-hardware") {
      return sendJson(res, 200, { hardware: await listPartStandardHardware() });
    }

    if (req.method === "GET" && url.pathname === "/api/parts/export.xlsx") {
      const rows = await listPartRecords();
      const workbook = buildPartsWorkbook(rows);
      return sendBinary(res, 200, workbook, {
        "content-type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "content-disposition": `attachment; filename="xera-parts-${todayDate().replaceAll("-", "")}.xlsx"`
      });
    }

    if (req.method === "POST" && url.pathname === "/api/parts/import") {
      const user = await requirePermission(req, "part_admin");
      const fileBuffer = await readBinary(req);
      
      const tempFilePath = path.join(DATA_DIR, `temp_import_${Date.now()}.xlsx`);
      fs.writeFileSync(tempFilePath, fileBuffer);
      
      try {
        const result = await importPartsFromWorkbook(tempFilePath, user);
        fs.unlinkSync(tempFilePath);
        return sendJson(res, 200, {
          success: true,
          message: `Successfully imported ${result.materialsCount} materials and ${result.hardwareCount} hardware references from Excel.`,
          materialsCount: result.materialsCount,
          hardwareCount: result.hardwareCount
        });
      } catch (err) {
        if (fs.existsSync(tempFilePath)) fs.unlinkSync(tempFilePath);
        throw err;
      }
    }

    if (req.method === "GET" && url.pathname === "/api/users") {
      await requirePermission(req, "user_admin");
      return sendJson(res, 200, { users: await listManagedUsers() });
    }

    if (req.method === "GET" && url.pathname === "/api/admin/users") {
      const user = await requirePermission(req, "user_admin");
      return sendJson(res, 200, { admin: user.display_name, users: await listManagedUsers() });
    }

    if (req.method === "POST" && url.pathname === "/api/admin/users") {
      const user = await requirePermission(req, "user_admin");
      const body = await readJson(req);
      const result = await adminCreateUser(body, user);
      return sendJson(res, 201, result);
    }

    const updateUserMatch = url.pathname.match(/^\/api\/admin\/users\/(\d+)$/);
    if (req.method === "POST" && updateUserMatch) {
      const user = await requirePermission(req, "user_admin");
      const userId = Number(updateUserMatch[1]);
      const body = await readJson(req);
      const result = await adminUpdateUser(userId, user, body);
      return sendJson(res, 200, result);
    }

    const passwordUserMatch = url.pathname.match(/^\/api\/admin\/users\/(\d+)\/password$/);
    if (req.method === "POST" && passwordUserMatch) {
      const user = await requirePermission(req, "user_admin");
      const userId = Number(passwordUserMatch[1]);
      const body = await readJson(req);
      const result = await adminSetUserPassword(userId, user, body);
      return sendJson(res, 200, result);
    }

    if (req.method === "GET" && url.pathname === "/api/users/current") {
      const user = await resolveUser(req);
      return sendJson(res, 200, { user: publicUser(user) });
    }

    if (req.method === "POST" && url.pathname === "/api/preview") {
      const user = await resolveUser(req);
      const body = await readJson(req);
      const normalized = normalizeRequestInput(body, user);
      const result = await buildPreview(normalized, { includeNextSequence: true });
      return sendJson(res, result.valid ? 200 : 422, result);
    }

    if (req.method === "POST" && url.pathname === "/api/requests") {
      const user = await resolveUser(req);
      const body = await readJson(req);
      const request = await createDocumentRequest(user, body);
      return sendJson(res, 201, { request });
    }

    if (req.method === "GET" && url.pathname === "/api/requests/my") {
      const user = await resolveUser(req);
      const rows = await db.prepare(`
        SELECT dr.*, au.display_name AS checked_by
        FROM document_requests dr
        LEFT JOIN users au ON au.id = dr.approved_by_user_id
        WHERE dr.requested_by_user_id = ?
        ORDER BY dr.created_at DESC
      `).all(user.id);
      return sendJson(res, 200, { requests: rows });
    }

    if (req.method === "GET" && url.pathname === "/api/dashboard/overview") {
      const user = await resolveUser(req);
      return sendJson(res, 200, { overview: await getUserOverview(user) });
    }

    if (req.method === "GET" && url.pathname === "/api/documents") {
      return sendJson(res, 200, { documents: await listCurrentDocuments({ includePendingRevision: true }) });
    }

    if (req.method === "GET" && url.pathname === "/api/documents/archive") {
      return sendJson(res, 200, { archive: await listRevisionArchive() });
    }

    if (req.method === "GET" && url.pathname === "/api/documents/export.xlsx") {
      const rows = await listCurrentDocuments();
      const workbook = buildDocumentsWorkbook(rows);
      return sendBinary(res, 200, workbook, {
        "content-type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "content-disposition": `attachment; filename="xera-documents-${todayDate().replaceAll("-", "")}.xlsx"`
      });
    }

    const createRevisionRequestMatch = url.pathname.match(/^\/api\/documents\/(\d+)\/revision-request$/);
    if (req.method === "POST" && createRevisionRequestMatch) {
      const user = await resolveUser(req);
      const documentId = Number(createRevisionRequestMatch[1]);
      const body = await readJson(req);
      const result = await createRevisionRequest(documentId, user, body);
      return sendJson(res, 201, result);
    }

    const editDocumentMatch = url.pathname.match(/^\/api\/documents\/(\d+)\/edit$/);
    if (req.method === "POST" && editDocumentMatch) {
      const user = await resolveUser(req);
      const documentId = Number(editDocumentMatch[1]);
      const body = await readJson(req);
      const result = await editDocumentRecordByRequester(documentId, user, body);
      return sendJson(res, result.status === "pending_review" ? 202 : 200, result);
    }

    const adminEditDocumentMatch = url.pathname.match(/^\/api\/admin\/documents\/(\d+)\/edit$/);
    if (req.method === "POST" && adminEditDocumentMatch) {
      const user = await requirePermission(req, "document_admin");
      const documentId = Number(adminEditDocumentMatch[1]);
      const body = await readJson(req);
      const result = await adminEditDocumentRecord(documentId, user, body);
      return sendJson(res, 200, result);
    }

    const deleteDocumentMatch = url.pathname.match(/^\/api\/admin\/documents\/(\d+)\/delete$/);
    if (req.method === "POST" && deleteDocumentMatch) {
      const user = await requirePermission(req, "document_admin");
      const documentId = Number(deleteDocumentMatch[1]);
      const body = await readJson(req);
      const result = await deleteDocumentRecord(documentId, user, body);
      return sendJson(res, 200, result);
    }

    const renameDocumentMatch = url.pathname.match(/^\/api\/admin\/documents\/(\d+)\/rename$/);
    if (req.method === "POST" && renameDocumentMatch) {
      const user = await requirePermission(req, "document_admin");
      const documentId = Number(renameDocumentMatch[1]);
      const body = await readJson(req);
      const result = await renameApprovedDocument(documentId, user, body.document_name || body.documentName || "");
      return sendJson(res, 200, result);
    }

    const revisionDocumentMatch = url.pathname.match(/^\/api\/admin\/documents\/(\d+)\/revision$/);
    if (req.method === "POST" && revisionDocumentMatch) {
      const user = await requirePermission(req, "document_admin");
      const documentId = Number(revisionDocumentMatch[1]);
      const result = await updateDocumentRevision(documentId, user);
      return sendJson(res, 200, result);
    }

    if (req.method === "GET" && url.pathname === "/api/admin/requests/pending") {
      const user = await requirePermission(req, "document_admin");
      const rows = await db.prepare(`
        SELECT dr.*, u.display_name AS requested_by
        FROM document_requests dr
        LEFT JOIN users u ON u.id = dr.requested_by_user_id
        WHERE dr.status = 'pending'
        ORDER BY dr.created_at ASC
      `).all();
      return sendJson(res, 200, { admin: user.display_name, requests: rows });
    }

    if (req.method === "GET" && url.pathname === "/api/admin/parts/requests/pending") {
      const user = await requirePermission(req, "part_admin");
      return sendJson(res, 200, { admin: user.display_name, requests: await listPendingPartRequests() });
    }

    if (req.method === "GET" && url.pathname === "/api/admin/parts/revision-requests/pending") {
      const user = await requirePermission(req, "part_admin");
      return sendJson(res, 200, { admin: user.display_name, revision_requests: await listPendingPartRevisionRequests() });
    }

    if (req.method === "GET" && url.pathname === "/api/admin/revision-requests/pending") {
      const user = await requirePermission(req, "document_admin");
      const rows = await listPendingRevisionRequests();
      return sendJson(res, 200, { admin: user.display_name, revision_requests: rows });
    }

    if (req.method === "GET" && url.pathname === "/api/admin/sequences") {
      const user = await requirePermission(req, "document_admin");
      const rows = await db.prepare(`
        SELECT *
        FROM document_sequences
        ORDER BY category ASC, year_yy DESC
      `).all();
      return sendJson(res, 200, { admin: user.display_name, sequences: rows });
    }

    if (req.method === "GET" && url.pathname === "/api/admin/audit-logs") {
      const user = await requireAnyAdmin(req);
      const limit = Math.min(Number(url.searchParams.get("limit") || 100), 500);
      const rows = await db.prepare(`
        SELECT al.*, u.display_name AS actor_name
        FROM audit_logs al
        LEFT JOIN users u ON u.id = al.actor_user_id
        ORDER BY al.created_at DESC, al.id DESC
        LIMIT ?
      `).all(limit);
      return sendJson(res, 200, { admin: user.display_name, audit_logs: rows });
    }

    if (req.method === "GET" && url.pathname === "/api/admin/deleted-items") {
      const user = await requireAnyAdmin(req);
      return sendJson(res, 200, { admin: user.display_name, items: await listDeletedItems(user, url.searchParams.get("type")) });
    }

    if (req.method === "GET" && url.pathname === "/api/admin/tasks/summary") {
      const user = await requireAnyAdmin(req);
      return sendJson(res, 200, { admin: user.display_name, summary: await getAdminTaskSummary(user) });
    }

    if (req.method === "GET" && url.pathname === "/api/admin/notifications") {
      const user = await requireAnyAdmin(req);
      return sendJson(res, 200, { admin: user.display_name, notifications: await listAdminNotifications(user) });
    }

    const adminOkayNotificationMatch = url.pathname.match(/^\/api\/admin\/notifications\/(\d+)\/okay$/);
    if (req.method === "POST" && adminOkayNotificationMatch) {
      const user = await requireAnyAdmin(req);
      const notificationId = Number(adminOkayNotificationMatch[1]);
      const result = await adminOkayNotification(notificationId, user);
      return sendJson(res, 200, result);
    }

    const adminEditNotificationMatch = url.pathname.match(/^\/api\/admin\/notifications\/(\d+)\/edit$/);
    if (req.method === "POST" && adminEditNotificationMatch) {
      const user = await requireAnyAdmin(req);
      const notificationId = Number(adminEditNotificationMatch[1]);
      const body = await readJson(req);
      const result = await adminEditNotification(notificationId, user, body);
      return sendJson(res, 200, result);
    }

    const adminRejectNotificationMatch = url.pathname.match(/^\/api\/admin\/notifications\/(\d+)\/reject$/);
    if (req.method === "POST" && adminRejectNotificationMatch) {
      const user = await requireAnyAdmin(req);
      const notificationId = Number(adminRejectNotificationMatch[1]);
      const body = await readJson(req);
      const result = await adminRejectNotification(notificationId, user, body.reason || "");
      return sendJson(res, 200, result);
    }

    const approveMatch = url.pathname.match(/^\/api\/admin\/requests\/(\d+)\/approve$/);
    if (req.method === "POST" && approveMatch) {
      const user = await requirePermission(req, "document_admin");
      const requestId = Number(approveMatch[1]);
      const approved = await approveRequest(requestId, user);
      return sendJson(res, 200, approved);
    }

    const rejectMatch = url.pathname.match(/^\/api\/admin\/requests\/(\d+)\/reject$/);
    if (req.method === "POST" && rejectMatch) {
      const user = await requirePermission(req, "document_admin");
      const requestId = Number(rejectMatch[1]);
      const body = await readJson(req);
      const rejected = await rejectRequest(requestId, user, body.reason || "");
      return sendJson(res, 200, rejected);
    }

    const approvePartMatch = url.pathname.match(/^\/api\/admin\/parts\/requests\/(\d+)\/approve$/);
    if (req.method === "POST" && approvePartMatch) {
      const user = await requirePermission(req, "part_admin");
      const requestId = Number(approvePartMatch[1]);
      const approved = await approvePartRequest(requestId, user);
      return sendJson(res, 200, approved);
    }

    const rejectPartMatch = url.pathname.match(/^\/api\/admin\/parts\/requests\/(\d+)\/reject$/);
    if (req.method === "POST" && rejectPartMatch) {
      const user = await requirePermission(req, "part_admin");
      const requestId = Number(rejectPartMatch[1]);
      const body = await readJson(req);
      const rejected = await rejectPartRequest(requestId, user, body.reason || "");
      return sendJson(res, 200, rejected);
    }

    const approvePartRevisionMatch = url.pathname.match(/^\/api\/admin\/parts\/revision-requests\/(\d+)\/approve$/);
    if (req.method === "POST" && approvePartRevisionMatch) {
      const user = await requirePermission(req, "part_admin");
      const requestId = Number(approvePartRevisionMatch[1]);
      const approved = await approvePartRevisionRequest(requestId, user);
      return sendJson(res, 200, approved);
    }

    const rejectPartRevisionMatch = url.pathname.match(/^\/api\/admin\/parts\/revision-requests\/(\d+)\/reject$/);
    if (req.method === "POST" && rejectPartRevisionMatch) {
      const user = await requirePermission(req, "part_admin");
      const requestId = Number(rejectPartRevisionMatch[1]);
      const body = await readJson(req);
      const rejected = await rejectPartRevisionRequest(requestId, user, body.reason || "");
      return sendJson(res, 200, rejected);
    }

    const approveRevisionMatch = url.pathname.match(/^\/api\/admin\/revision-requests\/(\d+)\/approve$/);
    if (req.method === "POST" && approveRevisionMatch) {
      const user = await requirePermission(req, "document_admin");
      const requestId = Number(approveRevisionMatch[1]);
      const approved = await approveRevisionRequest(requestId, user);
      return sendJson(res, 200, approved);
    }

    const rejectRevisionMatch = url.pathname.match(/^\/api\/admin\/revision-requests\/(\d+)\/reject$/);
    if (req.method === "POST" && rejectRevisionMatch) {
      const user = await requirePermission(req, "document_admin");
      const requestId = Number(rejectRevisionMatch[1]);
      const body = await readJson(req);
      const rejected = await rejectRevisionRequest(requestId, user, body.reason || "");
      return sendJson(res, 200, rejected);
    }

    return sendJson(res, 404, { error: "not_found", message: "Endpoint not found." });
  } catch (error) {
    const status = error.statusCode || 500;
    return sendJson(res, status, {
      error: error.code || "internal_error",
      message: error.message
    });
  }
});

startServer().catch(error => {
  console.error("Failed to start XERA Document ID API.");
  console.error(error);
  process.exit(1);
});

async function startServer() {
  await initializeDatabase();

  server.listen(PORT, () => {
    console.log(`XERA Document ID API listening on http://localhost:${PORT}`);
    console.log(`Turso database: ${maskDatabaseUrl(TURSO_DATABASE_URL)}`);
  });
}

async function initializeDatabase() {
  await db.exec(`
    PRAGMA foreign_keys = ON;

    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT NOT NULL UNIQUE,
      email TEXT,
      display_name TEXT NOT NULL,
      position TEXT,
      role TEXT NOT NULL CHECK (role IN ('user', 'part_admin', 'document_admin', 'user_admin', 'all_admin')),
      permissions_json TEXT,
      department TEXT,
      password_hash TEXT,
      password_salt TEXT,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS user_sessions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL REFERENCES users(id),
      token_hash TEXT NOT NULL UNIQUE,
      created_at TEXT NOT NULL,
      expires_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS document_categories (
      code TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      prefix TEXT NOT NULL,
      suffix_type TEXT NOT NULL,
      requires_sequence INTEGER NOT NULL,
      implemented INTEGER NOT NULL,
      example TEXT
    );

    CREATE TABLE IF NOT EXISTS document_sequences (
      scope_key TEXT PRIMARY KEY,
      category TEXT NOT NULL,
      year_yy TEXT NOT NULL,
      next_sequence INTEGER NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS document_requests (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      status TEXT NOT NULL CHECK (status IN ('pending', 'approved', 'rejected', 'void')),
      category TEXT NOT NULL,
      company_code TEXT NOT NULL DEFAULT 'X',
      year_yy TEXT NOT NULL,
      sequence_no TEXT,
      document_no TEXT,
      revision TEXT,
      reference_type TEXT,
      reference_value TEXT,
      document_name TEXT NOT NULL,
      written_by TEXT NOT NULL,
      creation_date TEXT NOT NULL,
      control_status TEXT NOT NULL CHECK (control_status IN ('controlled', 'uncontrolled')),
      generated_filename TEXT,
      requested_by_user_id INTEGER NOT NULL REFERENCES users(id),
      approved_by_user_id INTEGER REFERENCES users(id),
      approved_at TEXT,
      reject_reason TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      payload_json TEXT
    );

    CREATE TABLE IF NOT EXISTS document_records (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      request_id INTEGER NOT NULL UNIQUE REFERENCES document_requests(id),
      category TEXT NOT NULL,
      company_code TEXT NOT NULL,
      year_yy TEXT NOT NULL,
      sequence_no TEXT NOT NULL,
      document_no TEXT NOT NULL UNIQUE,
      revision TEXT,
      reference_type TEXT,
      reference_value TEXT,
      document_name TEXT NOT NULL,
      written_by TEXT NOT NULL,
      creation_date TEXT NOT NULL,
      control_status TEXT NOT NULL CHECK (control_status IN ('controlled', 'uncontrolled')),
      generated_filename TEXT NOT NULL,
      approved_by_user_id INTEGER NOT NULL REFERENCES users(id),
      approved_at TEXT NOT NULL,
      revision_updated_by_user_id INTEGER REFERENCES users(id),
      revision_updated_at TEXT,
      deleted_at TEXT,
      deleted_by_user_id INTEGER REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS document_revision_archive (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      document_record_id INTEGER NOT NULL REFERENCES document_records(id),
      request_id INTEGER REFERENCES document_requests(id),
      category TEXT NOT NULL,
      company_code TEXT NOT NULL,
      year_yy TEXT NOT NULL,
      sequence_no TEXT NOT NULL,
      document_no TEXT NOT NULL,
      revision TEXT,
      next_revision TEXT,
      reference_type TEXT,
      reference_value TEXT,
      document_name TEXT NOT NULL,
      written_by TEXT NOT NULL,
      creation_date TEXT NOT NULL,
      control_status TEXT NOT NULL CHECK (control_status IN ('controlled', 'uncontrolled')),
      generated_filename TEXT NOT NULL,
      approved_by_user_id INTEGER REFERENCES users(id),
      approved_at TEXT,
      revision_changed_by_user_id INTEGER NOT NULL REFERENCES users(id),
      revision_changed_at TEXT NOT NULL,
      archived_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS document_revision_requests (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      document_record_id INTEGER NOT NULL REFERENCES document_records(id),
      requested_by_user_id INTEGER NOT NULL REFERENCES users(id),
      status TEXT NOT NULL CHECK (status IN ('pending', 'approved', 'rejected')),
      current_revision TEXT NOT NULL,
      requested_revision TEXT NOT NULL,
      request_note TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      decided_by_user_id INTEGER REFERENCES users(id),
      decided_at TEXT,
      reject_reason TEXT
    );

    CREATE TABLE IF NOT EXISTS part_sequences (
      scope_key TEXT PRIMARY KEY,
      project_code TEXT NOT NULL,
      main_code TEXT NOT NULL,
      next_sequence INTEGER NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS part_requests (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      status TEXT NOT NULL CHECK (status IN ('pending', 'approved', 'rejected')),
      project_code TEXT NOT NULL,
      main_code TEXT NOT NULL,
      sequence_no TEXT NOT NULL,
      part_number TEXT NOT NULL UNIQUE,
      revision_code TEXT NOT NULL,
      revision_mode TEXT NOT NULL,
      part_name TEXT NOT NULL,
      description TEXT NOT NULL,
      main_category TEXT NOT NULL,
      sub_category TEXT,
      requested_by_user_id INTEGER NOT NULL REFERENCES users(id),
      approved_by_user_id INTEGER REFERENCES users(id),
      approved_at TEXT,
      reject_reason TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      payload_json TEXT
    );

    CREATE TABLE IF NOT EXISTS part_records (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      request_id INTEGER UNIQUE REFERENCES part_requests(id),
      source TEXT NOT NULL,
      project_code TEXT,
      main_code TEXT,
      sequence_no TEXT,
      part_number TEXT NOT NULL UNIQUE,
      revision_code TEXT,
      revision_mode TEXT,
      part_name TEXT NOT NULL,
      description TEXT,
      main_category TEXT,
      sub_category TEXT,
      requested_by_user_id INTEGER REFERENCES users(id),
      approved_by_user_id INTEGER REFERENCES users(id),
      approved_at TEXT,
      created_at TEXT NOT NULL,
      deleted_at TEXT,
      deleted_by_user_id INTEGER REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS part_revision_requests (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      part_record_id INTEGER NOT NULL REFERENCES part_records(id),
      requested_by_user_id INTEGER NOT NULL REFERENCES users(id),
      status TEXT NOT NULL CHECK (status IN ('pending', 'approved', 'rejected')),
      current_part_number TEXT NOT NULL,
      requested_part_number TEXT NOT NULL,
      current_revision_code TEXT NOT NULL,
      requested_revision_code TEXT NOT NULL,
      revision_mode TEXT NOT NULL,
      request_note TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      decided_by_user_id INTEGER REFERENCES users(id),
      decided_at TEXT,
      reject_reason TEXT
    );

    CREATE TABLE IF NOT EXISTS part_standard_hardware_reference (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      group_name TEXT NOT NULL,
      serial_no TEXT,
      part_name TEXT,
      specification TEXT,
      source_sheet TEXT NOT NULL,
      source_row INTEGER NOT NULL,
      source_column TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS audit_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      actor_user_id INTEGER REFERENCES users(id),
      entity_type TEXT NOT NULL,
      entity_id INTEGER NOT NULL,
      action TEXT NOT NULL,
      before_json TEXT,
      after_json TEXT,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS deleted_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      entity_type TEXT NOT NULL CHECK (entity_type IN ('document', 'part')),
      entity_id INTEGER NOT NULL,
      display_key TEXT NOT NULL,
      record_json TEXT NOT NULL,
      deleted_by_user_id INTEGER NOT NULL REFERENCES users(id),
      deleted_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS notifications (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      recipient_user_id INTEGER NOT NULL REFERENCES users(id),
      source_user_id INTEGER REFERENCES users(id),
      type TEXT NOT NULL,
      entity_type TEXT NOT NULL,
      entity_id INTEGER NOT NULL,
      related_request_id INTEGER,
      status TEXT NOT NULL CHECK (status IN ('unread', 'read', 'done')),
      title TEXT NOT NULL,
      body TEXT NOT NULL,
      metadata_json TEXT,
      created_at TEXT NOT NULL,
      read_at TEXT,
      done_at TEXT,
      acted_by_user_id INTEGER REFERENCES users(id)
    );
  `);

  await ensureColumn("users", "email", "TEXT");
  await ensureColumn("users", "position", "TEXT");
  await ensureColumn("users", "password_hash", "TEXT");
  await ensureColumn("users", "password_salt", "TEXT");
  await ensureUserRoleSchema();
  await ensureColumn("users", "permissions_json", "TEXT");
  await backfillUserPermissions();
  await ensureColumn("document_records", "revision_updated_by_user_id", "INTEGER REFERENCES users(id)");
  await ensureColumn("document_records", "revision_updated_at", "TEXT");
  await ensureColumn("document_records", "deleted_at", "TEXT");
  await ensureColumn("document_records", "deleted_by_user_id", "INTEGER REFERENCES users(id)");
  await ensureColumn("part_records", "deleted_at", "TEXT");
  await ensureColumn("part_records", "deleted_by_user_id", "INTEGER REFERENCES users(id)");
  await db.exec("CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email ON users(email);");
  await db.exec("CREATE INDEX IF NOT EXISTS idx_document_records_deleted ON document_records(deleted_at);");
  await db.exec("CREATE INDEX IF NOT EXISTS idx_part_records_deleted ON part_records(deleted_at);");
  await db.exec("CREATE INDEX IF NOT EXISTS idx_deleted_items_type_deleted ON deleted_items(entity_type, deleted_at);");
  await db.exec("CREATE INDEX IF NOT EXISTS idx_part_records_project_main ON part_records(project_code, main_code);");
  await db.exec("CREATE INDEX IF NOT EXISTS idx_part_requests_project_main ON part_requests(project_code, main_code);");
  await db.exec("CREATE INDEX IF NOT EXISTS idx_part_requests_status ON part_requests(status);");
  await db.exec("CREATE INDEX IF NOT EXISTS idx_part_revision_requests_record ON part_revision_requests(part_record_id, status);");
  await db.exec("CREATE UNIQUE INDEX IF NOT EXISTS idx_part_hardware_unique ON part_standard_hardware_reference(group_name, serial_no, part_name, source_row, source_column);");
  await db.exec("CREATE INDEX IF NOT EXISTS idx_notifications_recipient_status ON notifications(recipient_user_id, status, created_at);");
  await db.exec("CREATE INDEX IF NOT EXISTS idx_notifications_entity ON notifications(entity_type, entity_id, status);");

  const now = nowIso();
  await upsertSeedUser({
    username: "admin",
    email: "admin@xera.com.tr",
    displayName: "QARA Admin",
    position: "QA/RA Manager",
    role: USER_ROLES.ALL_ADMIN,
    department: "QARA",
    password: seedPassword("INITIAL_ADMIN_PASSWORD"),
    now
  });

  await upsertSeedUser({
    username: "employee",
    email: "employee@xera.com.tr",
    displayName: "Demo Employee",
    position: "R&D Engineer",
    role: USER_ROLES.USER,
    department: "R&D",
    password: seedPassword("SEED_EMPLOYEE_PASSWORD"),
    now
  });

  await upsertSeedUser({
    username: "example_admin",
    email: "example.admin@xera.com.tr",
    displayName: "Example Admin",
    position: "QARA Administrator",
    role: USER_ROLES.ALL_ADMIN,
    department: "QARA",
    password: seedPassword("SEED_EXAMPLE_ADMIN_PASSWORD"),
    now
  });

  await upsertSeedUser({
    username: "example_user",
    email: "example.user@xera.com.tr",
    displayName: "Example User",
    position: "Document Requester",
    role: USER_ROLES.USER,
    department: "R&D",
    password: seedPassword("SEED_EXAMPLE_USER_PASSWORD"),
    now
  });

  await upsertSeedUser({
    username: "user_manager",
    email: "user.manager@xera.com.tr",
    displayName: "User Manager Admin",
    position: "User Management Administrator",
    role: USER_ROLES.USER_ADMIN,
    department: "QARA",
    password: seedPassword("SEED_USER_MANAGER_PASSWORD"),
    now
  });

  await upsertSeedUser({
    username: "part_manager",
    email: "part.manager@xera.com.tr",
    displayName: "Part List Admin",
    position: "Part List Administrator",
    role: USER_ROLES.PART_ADMIN,
    department: "Engineering",
    password: seedPassword("SEED_PART_MANAGER_PASSWORD"),
    now
  });

  await upsertSeedUser({
    username: "document_manager",
    email: "document.manager@xera.com.tr",
    displayName: "Document List Admin",
    position: "Document Control Administrator",
    role: USER_ROLES.DOCUMENT_ADMIN,
    department: "QARA",
    password: seedPassword("SEED_DOCUMENT_MANAGER_PASSWORD"),
    now
  });

  await ensureSystemUser(now);

  const upsertCategory = db.prepare(`
    INSERT INTO document_categories (
      code, name, prefix, suffix_type, requires_sequence, implemented, example
    )
    VALUES (?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(code) DO UPDATE SET
      name = excluded.name,
      prefix = excluded.prefix,
      suffix_type = excluded.suffix_type,
      requires_sequence = excluded.requires_sequence,
      implemented = excluded.implemented,
      example = excluded.example
  `);

  for (const rule of Object.values(CATEGORY_RULES)) {
    await upsertCategory.run(
      rule.code,
      rule.name,
      rule.prefix,
      rule.suffixType,
      rule.requiresSequence ? 1 : 0,
      rule.implemented ? 1 : 0,
      rule.example
    );
  }

  await seedPartsFromWorkbook();
}

async function ensureColumn(tableName, columnName, definition) {
  const columns = await db.prepare(`PRAGMA table_info(${tableName})`).all();
  if (columns.some(column => column.name === columnName)) return;
  await db.exec(`ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${definition}`);
}

async function ensureUserRoleSchema() {
  const table = await db.prepare(`
    SELECT sql
    FROM sqlite_master
    WHERE type = 'table'
      AND name = 'users'
  `).get();

  if (!table || String(table.sql || "").includes("'part_admin'")) return;

  await db.exec("PRAGMA foreign_keys = OFF;");
  try {
    await db.transaction(async () => {
      await db.exec(`
      CREATE TABLE users_new (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT NOT NULL UNIQUE,
        email TEXT,
        display_name TEXT NOT NULL,
        position TEXT,
        role TEXT NOT NULL CHECK (role IN (${ROLE_CHECK_SQL})),
        department TEXT,
        password_hash TEXT,
        password_salt TEXT,
        created_at TEXT NOT NULL
      );

      INSERT INTO users_new (
        id, username, email, display_name, position, role, department,
        password_hash, password_salt, created_at
      )
      SELECT
        id,
        username,
        email,
        display_name,
        position,
        CASE
          WHEN role = 'admin' THEN 'all_admin'
          WHEN role IN (${ROLE_CHECK_SQL}) THEN role
          ELSE 'user'
        END,
        department,
        password_hash,
        password_salt,
        created_at
      FROM users;

      DROP TABLE users;
      ALTER TABLE users_new RENAME TO users;
    `);
    });
  } finally {
    await db.exec("PRAGMA foreign_keys = ON;");
  }
}

async function backfillUserPermissions() {
  const users = await db.prepare("SELECT id, role, permissions_json FROM users").all();
  const updatePermissions = db.prepare("UPDATE users SET permissions_json = ?, role = ? WHERE id = ?");

  for (const user of users) {
    const existingPermissions = parsePermissionsJson(user.permissions_json);
    const permissions = existingPermissions.length > 0
      ? existingPermissions
      : permissionsFromRole(user.role);
    await updatePermissions.run(
      JSON.stringify(permissions),
      deriveRoleFromPermissions(permissions, user.role),
      user.id
    );
  }
}

async function upsertSeedUser(seed) {
  const existing = await db.prepare("SELECT * FROM users WHERE username = ?").get(seed.username);
  const password = seed.password ? hashPassword(seed.password) : null;
  const seedPermissions = permissionsFromRole(seed.role);

  if (!existing) {
    if (!password) {
      console.warn(`Skipping seed user ${seed.username}; no password configured for this environment.`);
      return;
    }

    await db.prepare(`
      INSERT INTO users (
        username, email, display_name, position, role, permissions_json, department,
        password_hash, password_salt, created_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      seed.username,
      seed.email,
      seed.displayName,
      seed.position,
      deriveRoleFromPermissions(seedPermissions, seed.role),
      JSON.stringify(seedPermissions),
      seed.department,
      password.hash,
      password.salt,
      seed.now
    );
    return;
  }

  await db.prepare(`
    UPDATE users
    SET email = COALESCE(email, ?),
        display_name = ?,
        position = COALESCE(position, ?),
        role = ?,
        permissions_json = COALESCE(permissions_json, ?),
        department = COALESCE(department, ?),
        password_hash = COALESCE(password_hash, ?),
        password_salt = COALESCE(password_salt, ?)
    WHERE username = ?
  `).run(
    seed.email,
    seed.displayName,
    seed.position,
    deriveRoleFromPermissions(seedPermissions, seed.role),
    JSON.stringify(seedPermissions),
    seed.department,
    password ? password.hash : null,
    password ? password.salt : null,
    seed.username
  );
}

async function ensureSystemUser(now = nowIso()) {
  const existing = await db.prepare("SELECT * FROM users WHERE username = ?").get("auto_published");
  if (!existing) {
    await db.prepare(`
      INSERT INTO users (
        username, email, display_name, position, role, permissions_json, department,
        password_hash, password_salt, created_at
      )
      VALUES ('auto_published', 'auto.published@xera.com.tr', 'Auto Published', 'System', 'user', '[]', 'System', NULL, NULL, ?)
    `).run(now);
    return;
  }

  await db.prepare(`
    UPDATE users
    SET email = COALESCE(email, 'auto.published@xera.com.tr'),
        display_name = 'Auto Published',
        position = COALESCE(position, 'System'),
        role = 'user',
        permissions_json = '[]',
        department = COALESCE(department, 'System')
    WHERE username = 'auto_published'
  `).run();
}

async function getSystemUser() {
  const systemUser = await db.prepare("SELECT * FROM users WHERE username = ?").get("auto_published");
  if (!systemUser) throw httpError(500, "system_user_missing", "Auto Published system user is not initialized.");
  return systemUser;
}

async function seedPartsFromWorkbook() {
  if (!fs.existsSync(PARTS_WORKBOOK_PATH)) {
    console.warn(`Parts workbook not found: ${PARTS_WORKBOOK_PATH}`);
    return;
  }

  const importedParts = await db.prepare("SELECT COUNT(*) AS count FROM part_records WHERE source = 'excel'").get();
  const importedHardware = await db.prepare("SELECT COUNT(*) AS count FROM part_standard_hardware_reference").get();
  if (Number(importedParts.count || 0) > 0 && Number(importedHardware.count || 0) > 0) return;

  const workbook = readPartsWorkbook(PARTS_WORKBOOK_PATH);
  const now = nowIso();

  await db.transaction(async () => {
    if (Number(importedParts.count || 0) === 0) {
      const insertPart = db.prepare(`
        INSERT OR IGNORE INTO part_records (
          request_id, source, project_code, main_code, sequence_no, part_number,
          revision_code, revision_mode, part_name, description, main_category,
          sub_category, requested_by_user_id, approved_by_user_id, approved_at, created_at
        )
        VALUES (NULL, 'excel', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL, NULL, ?)
      `);

      for (const row of workbook.materials) {
        await insertPart.run(
          row.project_code,
          row.main_code,
          row.sequence_no,
          row.part_number,
          row.revision_code,
          row.revision_mode,
          row.part_name,
          row.description,
          row.main_category,
          row.sub_category,
          now
        );
      }
    }

    if (Number(importedHardware.count || 0) === 0) {
      const insertHardware = db.prepare(`
        INSERT OR IGNORE INTO part_standard_hardware_reference (
          group_name, serial_no, part_name, specification, source_sheet,
          source_row, source_column, created_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `);

      for (const row of workbook.hardware) {
        await insertHardware.run(
          row.group_name,
          row.serial_no,
          row.part_name,
          row.specification,
          "Screw & Nut etc.",
          row.source_row,
          row.source_column,
          now
        );
      }
    }
  });
}

async function importPartsFromWorkbook(filePath, user) {
  const workbook = readPartsWorkbook(filePath);
  const now = nowIso();

  return await db.transaction(async () => {
    await db.prepare("DELETE FROM part_records WHERE source = 'excel'").run();
    await db.prepare("DELETE FROM part_standard_hardware_reference").run();

    const insertPart = db.prepare(`
      INSERT OR IGNORE INTO part_records (
        request_id, source, project_code, main_code, sequence_no, part_number,
        revision_code, revision_mode, part_name, description, main_category,
        sub_category, requested_by_user_id, approved_by_user_id, approved_at, created_at
      )
      VALUES (NULL, 'excel', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?, ?)
    `);

    for (const row of workbook.materials) {
      await insertPart.run(
        row.project_code,
        row.main_code,
        row.sequence_no,
        row.part_number,
        row.revision_code,
        row.revision_mode,
        row.part_name,
        row.description,
        row.main_category,
        row.sub_category,
        user.id,
        now,
        now
      );
    }

    const insertHardware = db.prepare(`
      INSERT INTO part_standard_hardware_reference (
        group_name, serial_no, part_name, specification, source_sheet,
        source_row, source_column, created_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);

    for (const row of workbook.hardware) {
      await insertHardware.run(
        row.group_name,
        row.serial_no,
        row.part_name,
        row.specification,
        "Screw & Nut etc.",
        row.source_row,
        row.source_column,
        now
      );
    }

    return {
      materialsCount: workbook.materials.length,
      hardwareCount: workbook.hardware.length
    };
  });
}

function readPartsWorkbook(filePath) {
  const entries = readZipEntries(filePath);
  const sharedStrings = parseSharedStrings(entries.get("xl/sharedStrings.xml"));
  const materialRows = parseWorksheetRows(entries.get("xl/worksheets/sheet1.xml"), sharedStrings);
  const hardwareRows = parseWorksheetRows(entries.get("xl/worksheets/sheet2.xml"), sharedStrings);

  return {
    materials: extractMaterialRows(materialRows),
    hardware: extractHardwareRows(hardwareRows)
  };
}

function extractMaterialRows(rows) {
  const materials = [];
  const maxRow = getMaxWorksheetRow(rows);
  for (let rowNumber = 3; rowNumber <= maxRow; rowNumber += 1) {
    const row = rows.get(rowNumber) || [];
    const partNumber = cleanWorkbookText(row[2]);
    if (!partNumber) continue;

    const parsed = parsePartNumberComponents(partNumber);
    materials.push({
      part_number: partNumber,
      part_name: cleanWorkbookText(row[3]),
      description: cleanWorkbookText(row[4]),
      main_category: cleanWorkbookText(row[5]),
      sub_category: cleanWorkbookText(row[6]),
      project_code: parsed.project_code,
      main_code: parsed.main_code,
      sequence_no: parsed.sequence_no,
      revision_code: parsed.revision_code,
      revision_mode: inferPartRevisionMode(parsed.revision_code)
    });
  }
  return materials;
}

function extractHardwareRows(rows) {
  const hardware = [];
  const groupStartColumns = [2, 6, 10, 14, 18, 22, 26, 30, 34, 38, 42, 46, 50];
  const maxRow = getMaxWorksheetRow(rows);

  for (const startColumn of groupStartColumns) {
    const groupName = cleanWorkbookText((rows.get(6) || [])[startColumn]);
    if (!groupName) continue;

    for (let rowNumber = 10; rowNumber <= maxRow; rowNumber += 1) {
      const row = rows.get(rowNumber) || [];
      const serialNo = cleanWorkbookText(row[startColumn]);
      const partName = cleanWorkbookText(row[startColumn + 1]);
      const specification = cleanWorkbookText(row[startColumn + 2]);
      if (!serialNo && !partName && !specification) continue;
      hardware.push({
        group_name: groupName,
        serial_no: serialNo,
        part_name: partName,
        specification,
        source_row: rowNumber,
        source_column: columnName(startColumn)
      });
    }
  }

  return hardware;
}

function normalizePartRequestInput(body, user = null) {
  const revisionMode = normalizePartRevisionMode(body.revision_mode || body.revisionMode || "released");
  const modeRule = PART_REVISION_MODE_MAP[revisionMode] || PART_REVISION_MODE_MAP.released;
  const mainCode = sanitizeCompact(body.main_code || body.mainCode || "").replace(/[^1-9]/g, "").slice(0, 1);
  return {
    project_code: sanitizeCompact(body.project_code || body.projectCode || ""),
    main_code: mainCode,
    part_number: sanitizePartNumber(body.part_number || body.partNumber || ""),
    revision_mode: revisionMode,
    revision_code: sanitizeCompact(body.revision_code || body.revisionCode || modeRule.defaultRevision),
    part_name: sanitizePartName(body.part_name || body.partName || ""),
    description: sanitizePartDescription(body.description || body.part_description || body.partDescription || ""),
    main_category: mainCode && PART_MAIN_CODE_MAP[mainCode] ? PART_MAIN_CODE_MAP[mainCode].name : "",
    sub_category: sanitizePartDescription(body.sub_category || body.subCategory || ""),
    requested_by: user ? user.display_name : sanitizeText(body.requested_by || body.requestedBy || "")
  };
}

async function buildPartPreview(input, options = {}) {
  const errors = validatePartInput(input);
  if (errors.length > 0) return { valid: false, errors, input };

  let sequenceNo = options.sequenceNo || "";
  let partNumber = input.part_number || "";

  if (partNumber) {
    const parsed = validatePartNumberForInput(input, partNumber);
    if (!parsed.valid) return { valid: false, errors: [parsed.error], input };
    sequenceNo = parsed.sequence_no;
  } else {
    sequenceNo = sequenceNo
      || (options.includeNextSequence ? await getNextAvailablePartSequence(input.project_code, input.main_code) : "001");
    partNumber = buildPartNumber(input, sequenceNo);
  }

  if (await isPartNumberUnavailable(partNumber, options.ignoreRequestId)) {
    return {
      valid: false,
      errors: [`${partNumber} is already approved or reserved by a request.`],
      input,
      part_number_preview: partNumber,
      sequence_no_preview: sequenceNo
    };
  }
  if (await isPartSequenceUnavailable(input.project_code, input.main_code, sequenceNo, options.ignoreRequestId)) {
    return {
      valid: false,
      errors: [`${input.project_code}-${input.main_code}${sequenceNo} sequence is already approved or reserved by a request.`],
      input,
      part_number_preview: partNumber,
      sequence_no_preview: sequenceNo
    };
  }

  return {
    valid: true,
    errors: [],
    input,
    part_number_preview: partNumber,
    sequence_no_preview: sequenceNo,
    main_category_preview: input.main_category
  };
}

function validatePartInput(input) {
  const errors = [];
  if (!PART_PROJECT_CODES.includes(input.project_code)) {
    errors.push(`Project code must be one of ${PART_PROJECT_CODES.join(", ")}.`);
  }
  if (!PART_MAIN_CODE_MAP[input.main_code]) {
    errors.push("Main code must be a single digit from 1 to 9.");
  }
  if (!PART_REVISION_MODE_MAP[input.revision_mode]) {
    errors.push("Revision mode must be released, design or change.");
  }
  const modeRule = PART_REVISION_MODE_MAP[input.revision_mode];
  if (modeRule && !(new RegExp(modeRule.pattern)).test(input.revision_code)) {
    errors.push(`Revision code must look like ${modeRule.example}.`);
  }
  if (!input.part_name) errors.push("Part name is required.");
  if (input.part_name && !/^[A-Z0-9_]+$/.test(input.part_name)) {
    errors.push("Part name must use uppercase letters, numbers and underscores.");
  }
  if (!input.description) errors.push("Description is required.");
  return errors;
}

async function createPartRequest(user, body) {
  const normalized = normalizePartRequestInput(body, user);
  const initialPreview = await buildPartPreview(normalized, { includeNextSequence: true });
  if (!initialPreview.valid) throw httpError(422, "validation_failed", initialPreview.errors.join(" "));

  return await db.transaction(async () => {
    const preview = normalized.part_number
      ? await buildPartPreview(normalized)
      : await buildPartPreview(normalized, {
        sequenceNo: await reserveNextPartSequence(normalized.project_code, normalized.main_code)
      });
    if (!preview.valid) throw httpError(422, "validation_failed", preview.errors.join(" "));

    const now = nowIso();
    const result = await db.prepare(`
      INSERT INTO part_requests (
        status, project_code, main_code, sequence_no, part_number, revision_code,
        revision_mode, part_name, description, main_category, sub_category,
        requested_by_user_id, created_at, updated_at, payload_json
      )
      VALUES ('pending', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      normalized.project_code,
      normalized.main_code,
      preview.sequence_no_preview,
      preview.part_number_preview,
      normalized.revision_code,
      normalized.revision_mode,
      normalized.part_name,
      normalized.description,
      normalized.main_category,
      normalized.sub_category,
      user.id,
      now,
      now,
      JSON.stringify(normalized)
    );

    const request = await getPartRequestById(Number(result.lastInsertRowid));
    await insertAudit(user.id, "part_request", request.id, "part_request.created", null, request);
    const systemUser = await getSystemUser();
    const published = await publishPartRequestInTransaction(request.id, systemUser, {
      auditAction: "part_request.auto_published"
    });
    await notifyAdminsOfAutoPublished("part", user, published.request, published.part);
    return published.request;
  });
}

async function approvePartRequest(requestId, user) {
  return await db.transaction(async () => {
    const result = await publishPartRequestInTransaction(requestId, user, {
      auditAction: "part_request.approved"
    });
    await notifyPartRequestDecision(result.request, user, "approved", result.part);
    return result;
  });
}

async function publishPartRequestInTransaction(requestId, user, options = {}) {
  const before = await getPartRequestById(requestId);
  if (!before) throw httpError(404, "not_found", "Part request not found.");
  if (before.status !== "pending") throw httpError(409, "invalid_status", "Only pending part requests can be approved.");
  if (await isPartNumberApproved(before.part_number)) {
    throw httpError(409, "duplicate_part_number", `${before.part_number} is already in the approved parts list.`);
  }

  const now = nowIso();
  await db.prepare(`
    UPDATE part_requests
    SET status = 'approved',
        approved_by_user_id = ?,
        approved_at = ?,
        updated_at = ?
    WHERE id = ?
  `).run(user.id, now, now, requestId);

  await db.prepare(`
    INSERT INTO part_records (
      request_id, source, project_code, main_code, sequence_no, part_number,
      revision_code, revision_mode, part_name, description, main_category,
      sub_category, requested_by_user_id, approved_by_user_id, approved_at, created_at
    )
    VALUES (?, 'request', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    before.id,
    before.project_code,
    before.main_code,
    before.sequence_no,
    before.part_number,
    before.revision_code,
    before.revision_mode,
    before.part_name,
    before.description,
    before.main_category,
    before.sub_category,
    before.requested_by_user_id,
    user.id,
    now,
    now
  );

  const after = await getPartRequestById(requestId);
  const part = await getPartRecordByRequestId(requestId);
  await insertAudit(user.id, "part_request", requestId, options.auditAction || "part_request.approved", before, after);
  return { request: after, part };
}

async function rejectPartRequest(requestId, user, reason) {
  const before = await getPartRequestById(requestId);
  if (!before) throw httpError(404, "not_found", "Part request not found.");
  if (before.status !== "pending") throw httpError(409, "invalid_status", "Only pending part requests can be rejected.");

  const now = nowIso();
  await db.prepare(`
    UPDATE part_requests
    SET status = 'rejected',
        reject_reason = ?,
        approved_by_user_id = ?,
        approved_at = ?,
        updated_at = ?
    WHERE id = ?
  `).run(sanitizePartDescription(reason), user.id, now, now, requestId);

  const after = await getPartRequestById(requestId);
  await insertAudit(user.id, "part_request", requestId, "part_request.rejected", before, after);
  await notifyPartRequestDecision(after, user, "rejected");
  return { request: after };
}

async function listMyPartRequests(user) {
  return await db.prepare(`
    SELECT pr.*, au.display_name AS checked_by
    FROM part_requests pr
    LEFT JOIN users au ON au.id = pr.approved_by_user_id
    WHERE pr.requested_by_user_id = ?
    ORDER BY pr.created_at DESC, pr.id DESC
  `).all(user.id);
}

async function listPendingPartRequests() {
  return await db.prepare(`
    SELECT pr.*, u.display_name AS requested_by
    FROM part_requests pr
    LEFT JOIN users u ON u.id = pr.requested_by_user_id
    WHERE pr.status = 'pending'
    ORDER BY pr.created_at ASC, pr.id ASC
  `).all();
}

async function createPartRevisionRequest(partId, user, body = {}) {
  return await db.transaction(async () => {
    const partRecord = await getPartRecordById(partId);
    if (!partRecord) throw httpError(404, "not_found", "Part record not found.");

    const revisionMode = await assertPartRevisionUpdateAllowed(partRecord);
    const requestedRevisionCode = incrementPartRevisionCode(partRecord.revision_code);
    const requestedPartNumber = buildPartNumberFromRecord(partRecord, requestedRevisionCode);

    if (await isPartNumberUnavailable(requestedPartNumber)) {
      throw httpError(409, "duplicate_part_number", `${requestedPartNumber} is already approved or reserved.`);
    }

    const now = nowIso();
    const result = await db.prepare(`
      INSERT INTO part_revision_requests (
        part_record_id, requested_by_user_id, status, current_part_number,
        requested_part_number, current_revision_code, requested_revision_code,
        revision_mode, request_note, created_at, updated_at
      )
      VALUES (?, ?, 'pending', ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      partRecord.id,
      user.id,
      partRecord.part_number,
      requestedPartNumber,
      partRecord.revision_code,
      requestedRevisionCode,
      revisionMode,
      sanitizeText(body.note || body.request_note || body.requestNote || ""),
      now,
      now
    );

    const request = await getPartRevisionRequestById(Number(result.lastInsertRowid));
    await insertAudit(user.id, "part_revision_request", request.id, "part_revision_request.created", null, request);
    return { revision_request: request };
  });
}

async function listPendingPartRevisionRequests() {
  return await db.prepare(`
    SELECT
      prr.*,
      u.display_name AS requested_by,
      pr.part_name,
      pr.description,
      pr.main_category,
      pr.sub_category,
      pr.project_code,
      pr.main_code,
      pr.sequence_no,
      au.display_name AS checked_by
    FROM part_revision_requests prr
    JOIN part_records pr ON pr.id = prr.part_record_id
    LEFT JOIN users u ON u.id = prr.requested_by_user_id
    LEFT JOIN users au ON au.id = pr.approved_by_user_id
    WHERE prr.status = 'pending'
    ORDER BY prr.created_at ASC, prr.id ASC
  `).all();
}

async function approvePartRevisionRequest(requestId, user) {
  return await db.transaction(async () => {
    const beforeRequest = await getPartRevisionRequestById(requestId);
    if (!beforeRequest) throw httpError(404, "not_found", "Part revision request not found.");
    if (beforeRequest.status !== "pending") throw httpError(409, "invalid_status", "Only pending part revision requests can be approved.");

    const partRecord = await getPartRecordById(beforeRequest.part_record_id);
    if (!partRecord) throw httpError(404, "not_found", "Part record not found.");
    if (partRecord.part_number !== beforeRequest.current_part_number || partRecord.revision_code !== beforeRequest.current_revision_code) {
      throw httpError(409, "revision_changed", "Part revision has changed since this request was created.");
    }

    await assertPartRevisionUpdateAllowed(partRecord, { ignoreRequestId: requestId });
    if (await isPartNumberUnavailable(beforeRequest.requested_part_number, null, requestId)) {
      throw httpError(409, "duplicate_part_number", `${beforeRequest.requested_part_number} is already approved or reserved.`);
    }

    const now = nowIso();
    const insertResult = await db.prepare(`
      INSERT INTO part_records (
        request_id, source, project_code, main_code, sequence_no, part_number,
        revision_code, revision_mode, part_name, description, main_category,
        sub_category, requested_by_user_id, approved_by_user_id, approved_at, created_at
      )
      VALUES (NULL, 'revision', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      partRecord.project_code,
      partRecord.main_code,
      partRecord.sequence_no,
      beforeRequest.requested_part_number,
      beforeRequest.requested_revision_code,
      beforeRequest.revision_mode,
      partRecord.part_name,
      partRecord.description,
      partRecord.main_category,
      partRecord.sub_category,
      beforeRequest.requested_by_user_id,
      user.id,
      now,
      now
    );

    await db.prepare(`
      UPDATE part_revision_requests
      SET status = 'approved',
          decided_by_user_id = ?,
          decided_at = ?,
          updated_at = ?
      WHERE id = ?
    `).run(user.id, now, now, requestId);

    const afterRequest = await getPartRevisionRequestById(requestId);
    const part = await getPartRecordById(Number(insertResult.lastInsertRowid));
    await insertAudit(user.id, "part_revision_request", requestId, "part_revision_request.approved", beforeRequest, afterRequest);
    await notifyPartRevisionDecision(afterRequest, user, "approved", part);
    return { revision_request: afterRequest, part };
  });
}

async function rejectPartRevisionRequest(requestId, user, reason) {
  const before = await getPartRevisionRequestById(requestId);
  if (!before) throw httpError(404, "not_found", "Part revision request not found.");
  if (before.status !== "pending") throw httpError(409, "invalid_status", "Only pending part revision requests can be rejected.");

  const now = nowIso();
  await db.prepare(`
    UPDATE part_revision_requests
    SET status = 'rejected',
        reject_reason = ?,
        decided_by_user_id = ?,
        decided_at = ?,
        updated_at = ?
    WHERE id = ?
  `).run(sanitizeText(reason), user.id, now, now, requestId);

  const after = await getPartRevisionRequestById(requestId);
  await insertAudit(user.id, "part_revision_request", requestId, "part_revision_request.rejected", before, after);
  await notifyPartRevisionDecision(after, user, "rejected");
  return { revision_request: after };
}

async function adminEditPartRecord(partId, user, body = {}) {
  const result = await updatePartRecordDetails(partId, user, body, {
    reviewedByAdmin: true,
    auditAction: "part.admin_edited"
  });
  return { status: "updated", part: result.part };
}

async function editPartRecordByRequester(partId, user, body = {}) {
  const before = await getPartRecordById(partId);
  if (!before) throw httpError(404, "not_found", "Part record not found.");
  if (Number(before.requested_by_user_id) !== Number(user.id)) {
    throw httpError(403, "forbidden", "Only the original requester can edit this part.");
  }

  const systemUser = await getSystemUser();
  if (Number(before.approved_by_user_id) === Number(systemUser.id)) {
    const result = await updatePartRecordDetails(partId, user, body, {
      reviewedByAdmin: false,
      auditAction: "part.user_auto_edited"
    });
    await refreshOpenPartAutoPublishedNotifications(result.part, user);
    return { status: "updated", part: result.part };
  }

  const pending = await getPendingPartEditNotificationForPart(partId);
  if (pending) {
    throw httpError(409, "edit_request_exists", "There is already a pending edit request for this part.");
  }

  const proposed = normalizePartRecordEditInput(before, body);
  await validatePartRecordEditInput(proposed, {
    ignorePartId: before.id,
    ignoreRequestId: before.request_id || null
  });
  await notifyAdminsOfPartEditRequest(before, proposed, user);
  return { status: "pending_review", part: before };
}

async function updatePartRecordDetails(partId, user, body = {}, options = {}) {
  const before = await getPartRecordById(partId);
  if (!before) throw httpError(404, "not_found", "Part record not found.");
  const request = before.request_id ? await getPartRequestById(before.request_id) : null;
  const next = normalizePartRecordEditInput(before, body);

  await validatePartRecordEditInput(next, {
    ignorePartId: before.id,
    ignoreRequestId: request ? request.id : null
  });

  const now = nowIso();
  const approvedByUserId = options.reviewedByAdmin ? user.id : before.approved_by_user_id;
  const approvedAt = options.reviewedByAdmin ? now : before.approved_at;

  await db.prepare(`
    UPDATE part_records
    SET project_code = ?,
        main_code = ?,
        sequence_no = ?,
        part_number = ?,
        revision_code = ?,
        revision_mode = ?,
        part_name = ?,
        description = ?,
        main_category = ?,
        sub_category = ?,
        approved_by_user_id = ?,
        approved_at = ?
    WHERE id = ?
      AND deleted_at IS NULL
  `).run(
    next.project_code,
    next.main_code,
    next.sequence_no,
    next.part_number,
    next.revision_code,
    next.revision_mode,
    next.part_name,
    next.description,
    next.main_category,
    next.sub_category,
    approvedByUserId,
    approvedAt,
    before.id
  );

  if (request) {
    const payload = {
      ...(safeParseJson(request.payload_json) || {}),
      project_code: next.project_code,
      main_code: next.main_code,
      sequence_no: next.sequence_no,
      part_number: next.part_number,
      revision_code: next.revision_code,
      revision_mode: next.revision_mode,
      part_name: next.part_name,
      description: next.description,
      main_category: next.main_category,
      sub_category: next.sub_category
    };

    await db.prepare(`
      UPDATE part_requests
      SET project_code = ?,
          main_code = ?,
          sequence_no = ?,
          part_number = ?,
          revision_code = ?,
          revision_mode = ?,
          part_name = ?,
          description = ?,
          main_category = ?,
          sub_category = ?,
          approved_by_user_id = ?,
          approved_at = ?,
          payload_json = ?,
          updated_at = ?
      WHERE id = ?
    `).run(
      next.project_code,
      next.main_code,
      next.sequence_no,
      next.part_number,
      next.revision_code,
      next.revision_mode,
      next.part_name,
      next.description,
      next.main_category,
      next.sub_category,
      approvedByUserId,
      approvedAt,
      JSON.stringify(payload),
      now,
      request.id
    );
  }

  await touchPartSequence(next.project_code, next.main_code, next.sequence_no);
  const after = await getPartRecordById(before.id);
  await insertAudit(user.id, "part_record", before.id, options.auditAction || "part.edited", before, after);
  return { domain: "part", part: after, requesterId: after.requested_by_user_id || before.requested_by_user_id };
}

function normalizePartRecordEditInput(before, body = {}) {
  const hasPartNumber = hasOwn(body, "part_number") || hasOwn(body, "partNumber");
  let partNumber = hasPartNumber
    ? sanitizePartNumber(body.part_number ?? body.partNumber)
    : sanitizePartNumber(before.part_number);
  let parsed = hasPartNumber ? parsePartNumberComponents(partNumber) : {};

  const projectCode = parsed.project_code || (hasOwn(body, "project_code") || hasOwn(body, "projectCode")
    ? sanitizeCompact(body.project_code ?? body.projectCode)
    : sanitizeCompact(before.project_code));
  const mainCode = parsed.main_code || (hasOwn(body, "main_code") || hasOwn(body, "mainCode")
    ? sanitizeCompact(body.main_code ?? body.mainCode).replace(/[^1-9]/g, "").slice(0, 1)
    : sanitizeCompact(before.main_code).replace(/[^1-9]/g, "").slice(0, 1));
  const sequenceNo = parsed.sequence_no || (hasOwn(body, "sequence_no") || hasOwn(body, "sequenceNo")
    ? sanitizePartSequenceNo(body.sequence_no ?? body.sequenceNo)
    : sanitizePartSequenceNo(before.sequence_no));
  const revisionCode = parsed.revision_code || (hasOwn(body, "revision_code") || hasOwn(body, "revisionCode")
    ? sanitizeCompact(body.revision_code ?? body.revisionCode)
    : sanitizeCompact(before.revision_code));
  const revisionMode = parsed.revision_mode || normalizePartRevisionMode(
    body.revision_mode ?? body.revisionMode ?? inferPartRevisionMode(revisionCode) ?? before.revision_mode
  );

  if (!hasPartNumber && projectCode && mainCode && sequenceNo && revisionCode) {
    partNumber = buildPartNumber({
      project_code: projectCode,
      main_code: mainCode,
      revision_code: revisionCode
    }, sequenceNo);
    parsed = parsePartNumberComponents(partNumber);
  }

  const mainCategoryFallback = mainCode && PART_MAIN_CODE_MAP[mainCode]
    ? PART_MAIN_CODE_MAP[mainCode].name
    : before.main_category;

  return {
    project_code: projectCode,
    main_code: mainCode,
    sequence_no: sequenceNo,
    part_number: partNumber,
    revision_code: revisionCode,
    revision_mode: revisionMode,
    part_name: hasOwn(body, "part_name") || hasOwn(body, "partName")
      ? sanitizePartName(body.part_name ?? body.partName)
      : sanitizePartName(before.part_name),
    description: hasOwn(body, "description") || hasOwn(body, "part_description") || hasOwn(body, "partDescription")
      ? sanitizePartDescription(body.description ?? body.part_description ?? body.partDescription)
      : sanitizePartDescription(before.description),
    main_category: hasOwn(body, "main_category") || hasOwn(body, "mainCategory")
      ? sanitizePartDescription(body.main_category ?? body.mainCategory)
      : sanitizePartDescription(mainCategoryFallback),
    sub_category: hasOwn(body, "sub_category") || hasOwn(body, "subCategory")
      ? sanitizePartDescription(body.sub_category ?? body.subCategory)
      : sanitizePartDescription(before.sub_category),
    parsed_part_number: parsed
  };
}

async function validatePartRecordEditInput(input, options = {}) {
  const errors = [];
  const parsed = parsePartNumberComponents(input.part_number);
  const modeRule = PART_REVISION_MODE_MAP[input.revision_mode];

  if (!parsed.project_code) errors.push("Part number must look like X101-2001-01A.");
  if (!input.project_code) errors.push("Project code is required.");
  if (!input.main_code) errors.push("Main code is required.");
  if (!input.sequence_no) errors.push("Sequence number is required.");
  if (!input.revision_code) errors.push("Revision code is required.");
  if (!modeRule) errors.push("Revision mode must be released, design or change.");
  if (modeRule && !(new RegExp(modeRule.pattern)).test(input.revision_code)) {
    errors.push(`Revision code must look like ${modeRule.example}.`);
  }
  if (!input.part_name || !/^[A-Z0-9_]+$/.test(input.part_name)) {
    errors.push("Part name must use uppercase letters, numbers and underscores.");
  }
  if (!input.description) errors.push("Description is required.");
  if (!input.main_category) errors.push("Main category is required.");

  if (parsed.project_code && parsed.project_code !== input.project_code) {
    errors.push("Part number project code and Project Code must match.");
  }
  if (parsed.main_code && parsed.main_code !== input.main_code) {
    errors.push("Part number main code and Main Code must match.");
  }
  if (parsed.sequence_no && parsed.sequence_no !== input.sequence_no) {
    errors.push("Part number sequence and Sequence must match.");
  }
  if (parsed.revision_code && parsed.revision_code !== input.revision_code) {
    errors.push("Part number revision and Revision Code must match.");
  }
  if (parsed.revision_mode && parsed.revision_mode !== input.revision_mode) {
    errors.push("Part number revision type and Revision Mode must match.");
  }

  if (input.project_code && input.main_code && input.sequence_no) {
    const minimumSequence = getPartSequenceMinimum(input.project_code, input.main_code);
    if (Number(input.sequence_no) < minimumSequence) {
      errors.push(`${input.project_code}-${input.main_code} part numbers must start from ${padSequence(minimumSequence)}.`);
    }
  }

  if (errors.length > 0) {
    throw httpError(422, "validation_failed", errors.join(" "));
  }

  if (await isPartNumberUnavailableForEdit(input.part_number, options)) {
    throw httpError(409, "duplicate_part_number", `${input.part_number} is already approved or reserved.`);
  }
  if (await isPartNameUnavailableForEdit(input.part_name, options)) {
    throw httpError(409, "duplicate_part_name", `${input.part_name} is already used by another part.`);
  }
}

function sanitizePartSequenceNo(value) {
  const sequence = String(value ?? "").replace(/\D/g, "");
  if (!/^\d{1,3}$/.test(sequence)) return "";
  return padSequence(Number(sequence));
}

async function isPartNumberUnavailableForEdit(partNumber, options = {}) {
  if (!partNumber) return false;
  const record = await db.prepare(`
    SELECT id
    FROM part_records
    WHERE part_number = ?
      AND deleted_at IS NULL
      AND (? IS NULL OR id <> ?)
    LIMIT 1
  `).get(partNumber, options.ignorePartId || null, options.ignorePartId || null);
  if (record) return true;

  const request = await db.prepare(`
    SELECT id
    FROM part_requests
    WHERE part_number = ?
      AND status <> 'rejected'
      AND (? IS NULL OR id <> ?)
    LIMIT 1
  `).get(partNumber, options.ignoreRequestId || null, options.ignoreRequestId || null);
  if (request) return true;

  return await isPartRevisionNumberPending(partNumber, options.ignorePartRevisionRequestId || null);
}

async function isPartNameUnavailableForEdit(partName, options = {}) {
  if (!partName) return false;
  const record = await db.prepare(`
    SELECT id
    FROM part_records
    WHERE UPPER(part_name) = ?
      AND deleted_at IS NULL
      AND (? IS NULL OR id <> ?)
    LIMIT 1
  `).get(partName, options.ignorePartId || null, options.ignorePartId || null);
  if (record) return true;

  const request = await db.prepare(`
    SELECT id
    FROM part_requests
    WHERE UPPER(part_name) = ?
      AND status <> 'rejected'
      AND (? IS NULL OR id <> ?)
    LIMIT 1
  `).get(partName, options.ignoreRequestId || null, options.ignoreRequestId || null);
  return Boolean(request);
}

async function touchPartSequence(projectCode, mainCode, sequenceNo) {
  if (!projectCode || !mainCode || !sequenceNo) return;
  const scopeKey = `${projectCode}:${mainCode}`;
  const next = Number(sequenceNo) + 1;
  const existing = await db.prepare("SELECT next_sequence FROM part_sequences WHERE scope_key = ?").get(scopeKey);
  if (existing) {
    if (Number(existing.next_sequence || 1) < next) {
      await db.prepare(`
        UPDATE part_sequences
        SET next_sequence = ?,
            updated_at = ?
        WHERE scope_key = ?
      `).run(next, nowIso(), scopeKey);
    }
    return;
  }

  await db.prepare(`
    INSERT INTO part_sequences (scope_key, project_code, main_code, next_sequence, updated_at)
    VALUES (?, ?, ?, ?, ?)
  `).run(scopeKey, projectCode, mainCode, next, nowIso());
}

async function getPendingPartEditNotificationForPart(partId) {
  return await db.prepare(`
    SELECT *
    FROM notifications
    WHERE type = 'part_edit_request'
      AND entity_type = 'part_record'
      AND entity_id = ?
      AND status IN ('unread', 'read')
    LIMIT 1
  `).get(partId);
}

async function notifyAdminsOfPartEditRequest(before, proposed, requester) {
  const admins = await listUsersWithPermission("part_admin");
  const label = before.part_number;
  for (const admin of admins) {
    await createNotification({
      recipientUserId: admin.id,
      sourceUserId: requester.id,
      type: "part_edit_request",
      entityType: "part_record",
      entityId: before.id,
      relatedRequestId: before.request_id,
      title: "Part edit request",
      body: `${requester.display_name} requested changes for ${label}.`,
      metadata: {
        domain: "part",
        action: "edit_request",
        label,
        requested_by_user_id: requester.id,
        created_by: requester.display_name,
        previous_part_number: before.part_number,
        previous_part_name: before.part_name,
        previous_description: before.description,
        previous_main_category: before.main_category,
        previous_sub_category: before.sub_category,
        part_number: proposed.part_number,
        project_code: proposed.project_code,
        main_code: proposed.main_code,
        sequence_no: proposed.sequence_no,
        revision_code: proposed.revision_code,
        revision_mode: proposed.revision_mode,
        part_name: proposed.part_name,
        description: proposed.description,
        main_category: proposed.main_category,
        sub_category: proposed.sub_category
      }
    });
  }
}

async function refreshOpenPartAutoPublishedNotifications(part, editor) {
  const notifications = await db.prepare(`
    SELECT *
    FROM notifications
    WHERE type = 'part_auto_published'
      AND entity_type = 'part_record'
      AND entity_id = ?
      AND status IN ('unread', 'read')
  `).all(part.id);

  for (const notification of notifications) {
    const metadata = safeParseJson(notification.metadata_json) || {};
    metadata.label = part.part_number;
    metadata.part_number = part.part_number;
    metadata.part_name = part.part_name;
    metadata.description = part.description;
    metadata.main_category = part.main_category;
    metadata.sub_category = part.sub_category;
    metadata.edited_by = editor.display_name;

    await db.prepare(`
      UPDATE notifications
      SET metadata_json = ?,
          body = ?
      WHERE id = ?
    `).run(
      JSON.stringify(metadata),
      `${part.part_number} was edited by ${editor.display_name} and is available for review.`,
      notification.id
    );
  }
}

async function listPartRecords(options = {}) {
  const pendingRevisionColumn = options.includePendingRevision
    ? `,
      (
        SELECT prr.id
        FROM part_revision_requests prr
        JOIN part_records source_pr ON source_pr.id = prr.part_record_id
        WHERE prr.status = 'pending'
          AND source_pr.project_code = pr.project_code
          AND source_pr.main_code = pr.main_code
          AND source_pr.sequence_no = pr.sequence_no
        LIMIT 1
      ) AS pending_revision_request_id,
      (
        SELECT n.id
        FROM notifications n
        WHERE n.type = 'part_edit_request'
          AND n.entity_type = 'part_record'
          AND n.entity_id = pr.id
          AND n.status IN ('unread', 'read')
        LIMIT 1
      ) AS pending_edit_request_id`
    : "";

  const rows = await db.prepare(`
    SELECT
      pr.*,
      ru.display_name AS requested_by,
      au.display_name AS checked_by
      ${pendingRevisionColumn}
    FROM part_records pr
    LEFT JOIN users ru ON ru.id = pr.requested_by_user_id
    LEFT JOIN users au ON au.id = pr.approved_by_user_id
    ORDER BY
      CASE pr.source WHEN 'request' THEN 0 WHEN 'revision' THEN 0 ELSE 1 END,
      COALESCE(pr.approved_at, pr.created_at) DESC,
      pr.part_number ASC
  `).all();

  return filterCurrentPartRecords(rows);
}

async function listPartArchive() {
  const rows = await db.prepare(`
    SELECT
      pr.*,
      ru.display_name AS requested_by,
      au.display_name AS checked_by
    FROM part_records pr
    LEFT JOIN users ru ON ru.id = pr.requested_by_user_id
    LEFT JOIN users au ON au.id = pr.approved_by_user_id
    WHERE pr.project_code IS NOT NULL
      AND pr.project_code <> ''
      AND pr.main_code IS NOT NULL
      AND pr.main_code <> ''
      AND pr.sequence_no IS NOT NULL
      AND pr.sequence_no <> ''
    ORDER BY pr.project_code ASC, pr.main_code ASC, pr.sequence_no ASC, pr.revision_code ASC
  `).all();

  const latestByBase = new Map();
  for (const row of rows) {
    const key = `${row.project_code}:${row.main_code}:${row.sequence_no}`;
    const current = latestByBase.get(key);
    if (!current || comparePartRevision(row, current) > 0) latestByBase.set(key, row);
  }

  return rows
    .filter(row => {
      if (row.deleted_at) return false;
      const key = `${row.project_code}:${row.main_code}:${row.sequence_no}`;
      const latest = latestByBase.get(key);
      return latest && !latest.deleted_at && latest.part_number !== row.part_number;
    })
    .map(row => {
      const key = `${row.project_code}:${row.main_code}:${row.sequence_no}`;
      const latest = latestByBase.get(key);
      return {
        ...row,
        current_part_number: latest ? latest.part_number : "",
        current_revision_code: latest ? latest.revision_code : ""
      };
    })
    .sort((a, b) => String(b.created_at || "").localeCompare(String(a.created_at || "")));
}

async function deletePartRecord(partId, user, body = {}) {
  requireDeleteConfirmation(body);

  const before = await getPartRecordById(partId);
  if (!before) throw httpError(404, "not_found", "Part record not found.");

  const now = nowIso();
  return await db.transaction(async () => {
    await db.prepare(`
      UPDATE part_revision_requests
      SET status = 'rejected',
          reject_reason = 'Source part was deleted.',
          decided_by_user_id = ?,
          decided_at = ?,
          updated_at = ?
      WHERE part_record_id = ?
        AND status = 'pending'
    `).run(user.id, now, now, partId);

    await db.prepare(`
      UPDATE part_records
      SET deleted_at = ?,
          deleted_by_user_id = ?
      WHERE id = ?
        AND deleted_at IS NULL
    `).run(now, user.id, partId);

    const after = {
      ...before,
      deleted_at: now,
      deleted_by_user_id: user.id,
      deleted_by: user.display_name
    };
    const deletedItem = await insertDeletedItem("part", partId, before.part_number, before, user, now);
    await insertAudit(user.id, "part_record", partId, "part.deleted", before, after);
    return { deleted_item: deletedItem };
  });
}

async function listPartStandardHardware() {
  return await db.prepare(`
    SELECT *
    FROM part_standard_hardware_reference
    ORDER BY group_name ASC, source_row ASC, source_column ASC
  `).all();
}

async function getPartRequestById(id) {
  return await db.prepare("SELECT * FROM part_requests WHERE id = ?").get(id);
}

async function getPartRevisionRequestById(id) {
  return await db.prepare("SELECT * FROM part_revision_requests WHERE id = ?").get(id);
}

async function getPartRecordById(id) {
  return await db.prepare("SELECT * FROM part_records WHERE id = ? AND deleted_at IS NULL").get(id);
}

async function getPartRecordByRequestId(requestId) {
  return await db.prepare("SELECT * FROM part_records WHERE request_id = ? AND deleted_at IS NULL").get(requestId);
}

function buildPartNumber(input, sequenceNo) {
  return `${input.project_code}-${input.main_code}${sequenceNo}-${input.revision_code}`;
}

function buildPartNumberFromRecord(partRecord, revisionCode) {
  return `${partRecord.project_code}-${partRecord.main_code}${partRecord.sequence_no}-${revisionCode}`;
}

function filterCurrentPartRecords(rows) {
  const latestByBase = new Map();
  for (const row of rows) {
    if (!hasPartBase(row)) continue;
    const key = partBaseKey(row);
    const current = latestByBase.get(key);
    const revisionCompare = current ? comparePartRevision(row, current) : 1;
    if (!current || revisionCompare > 0 || (revisionCompare === 0 && Number(row.id) > Number(current.id))) {
      latestByBase.set(key, row);
    }
  }

  return rows
    .filter(row => {
      if (row.deleted_at) return false;
      return !hasPartBase(row) || latestByBase.get(partBaseKey(row)).id === row.id;
    })
    .map(row => ({ ...row, is_current: 1 }));
}

function hasPartBase(row) {
  return Boolean(row && row.project_code && row.main_code && row.sequence_no);
}

function partBaseKey(row) {
  return `${row.project_code}:${row.main_code}:${row.sequence_no}`;
}

async function assertPartRevisionUpdateAllowed(partRecord, options = {}) {
  if (!hasPartBase(partRecord)) {
    throw httpError(422, "validation_failed", "Part number does not contain a valid project, main code and sequence.");
  }

  const revisionMode = inferPartRevisionMode(partRecord.revision_code);
  if (!revisionMode) {
    throw httpError(422, "validation_failed", "Current part revision code cannot be incremented.");
  }

  const latest = await getLatestPartRecordForBase(partRecord);
  if (!latest || Number(latest.id) !== Number(partRecord.id)) {
    throw httpError(409, "not_current_revision", "Only the current part revision can receive a revision request.");
  }

  const pending = await getPendingPartRevisionRequestForBase(partRecord, options.ignoreRequestId || null);
  if (pending) {
    throw httpError(409, "revision_request_exists", "There is already a pending revision request for this part.");
  }

  return revisionMode;
}

async function getLatestPartRecordForBase(partRecord) {
  if (!hasPartBase(partRecord)) return null;
  const rows = await db.prepare(`
    SELECT *
    FROM part_records
    WHERE project_code = ?
      AND main_code = ?
      AND sequence_no = ?
  `).all(partRecord.project_code, partRecord.main_code, partRecord.sequence_no);

  return rows.reduce((latest, row) => {
    if (!latest) return row;
    const revisionCompare = comparePartRevision(row, latest);
    if (revisionCompare > 0) return row;
    if (revisionCompare === 0 && Number(row.id) > Number(latest.id)) return row;
    return latest;
  }, null);
}

async function getPendingPartRevisionRequestForBase(partRecord, ignoreRequestId = null) {
  if (!hasPartBase(partRecord)) return null;
  return await db.prepare(`
    SELECT prr.*
    FROM part_revision_requests prr
    JOIN part_records pr ON pr.id = prr.part_record_id
    WHERE prr.status = 'pending'
      AND pr.project_code = ?
      AND pr.main_code = ?
      AND pr.sequence_no = ?
      AND (? IS NULL OR prr.id <> ?)
    LIMIT 1
  `).get(
    partRecord.project_code,
    partRecord.main_code,
    partRecord.sequence_no,
    ignoreRequestId,
    ignoreRequestId
  );
}

function incrementPartRevisionCode(revisionCode) {
  const code = sanitizeCompact(revisionCode);
  if (/^D\d{2}$/.test(code)) return incrementPrefixedPartRevision(code, "D");
  if (/^C\d{2}$/.test(code)) return incrementPrefixedPartRevision(code, "C");
  if (/^\d{2}[A-Z]$/.test(code)) {
    const number = Number(code.slice(0, 2));
    const letterCode = code.charCodeAt(2);
    if (letterCode < 90) return `${String(number).padStart(2, "0")}${String.fromCharCode(letterCode + 1)}`;
    if (number < 99) return `${String(number + 1).padStart(2, "0")}A`;
  }
  throw httpError(422, "validation_failed", "Part revision cannot be incremented.");
}

function incrementPrefixedPartRevision(code, prefix) {
  const number = Number(code.slice(1));
  if (!Number.isInteger(number) || number >= 99) {
    throw httpError(422, "validation_failed", "Part revision cannot be incremented.");
  }
  return `${prefix}${String(number + 1).padStart(2, "0")}`;
}

async function reserveNextPartSequence(projectCode, mainCode, revisionCode) {
  const scopeKey = `${projectCode}:${mainCode}`;
  const existing = await db.prepare("SELECT next_sequence FROM part_sequences WHERE scope_key = ?").get(scopeKey);
  const sequenceNo = await getNextAvailablePartSequence(projectCode, mainCode);
  const next = Number(sequenceNo) + 1;

  if (existing) {
    await db.prepare(`
      UPDATE part_sequences
      SET next_sequence = ?, updated_at = ?
      WHERE scope_key = ?
    `).run(Math.max(Number(existing.next_sequence || 1), next), nowIso(), scopeKey);
  } else {
    await db.prepare(`
      INSERT INTO part_sequences (scope_key, project_code, main_code, next_sequence, updated_at)
      VALUES (?, ?, ?, ?, ?)
    `).run(scopeKey, projectCode, mainCode, next, nowIso());
  }

  return sequenceNo;
}

async function getNextAvailablePartSequence(projectCode, mainCode) {
  for (let candidate = getPartSequenceMinimum(projectCode, mainCode); candidate <= 999; candidate += 1) {
    const sequenceNo = padSequence(candidate);
    if (!(await isPartSequenceUnavailable(projectCode, mainCode, sequenceNo))) {
      return sequenceNo;
    }
  }

  throw httpError(409, "part_sequence_exhausted", `No available part sequence remains for ${projectCode}-${mainCode}xxx.`);
}

function getPartSequenceMinimum(projectCode, mainCode) {
  if (projectCode === "X102" && mainCode === "2") return 100;
  return 1;
}

async function getMaxPartSequence(projectCode, mainCode) {
  const records = await db.prepare(`
    SELECT MAX(CAST(sequence_no AS INTEGER)) AS max_sequence
    FROM part_records
    WHERE project_code = ? AND main_code = ?
  `).get(projectCode, mainCode);
  const requests = await db.prepare(`
    SELECT MAX(CAST(sequence_no AS INTEGER)) AS max_sequence
    FROM part_requests
    WHERE project_code = ? AND main_code = ?
  `).get(projectCode, mainCode);
  return Math.max(
    Number(records && records.max_sequence ? records.max_sequence : 0),
    Number(requests && requests.max_sequence ? requests.max_sequence : 0)
  );
}

async function isPartSequenceUnavailable(projectCode, mainCode, sequenceNo, ignoreRequestId = null) {
  if (!projectCode || !mainCode || !sequenceNo) return false;
  const record = await db.prepare(`
    SELECT id
    FROM part_records
    WHERE project_code = ?
      AND main_code = ?
      AND sequence_no = ?
    LIMIT 1
  `).get(projectCode, mainCode, sequenceNo);
  if (record) return true;

  const request = await db.prepare(`
    SELECT id
    FROM part_requests
    WHERE project_code = ?
      AND main_code = ?
      AND sequence_no = ?
      AND (? IS NULL OR id <> ?)
    LIMIT 1
  `).get(projectCode, mainCode, sequenceNo, ignoreRequestId, ignoreRequestId);
  return Boolean(request);
}

async function isPartNumberUnavailable(partNumber, ignoreRequestId = null, ignorePartRevisionRequestId = null) {
  if (!partNumber) return false;
  if (await isPartNumberApproved(partNumber)) return true;
  const request = await db.prepare(`
    SELECT id
    FROM part_requests
    WHERE part_number = ?
      AND (? IS NULL OR id <> ?)
    LIMIT 1
  `).get(partNumber, ignoreRequestId, ignoreRequestId);
  if (request) return true;
  return await isPartRevisionNumberPending(partNumber, ignorePartRevisionRequestId);
}

async function isPartNumberApproved(partNumber) {
  return Boolean(await db.prepare("SELECT id FROM part_records WHERE part_number = ? LIMIT 1").get(partNumber));
}

async function isPartRevisionNumberPending(partNumber, ignoreRequestId = null) {
  if (!partNumber) return false;
  return Boolean(await db.prepare(`
    SELECT id
    FROM part_revision_requests
    WHERE requested_part_number = ?
      AND status = 'pending'
      AND (? IS NULL OR id <> ?)
    LIMIT 1
  `).get(partNumber, ignoreRequestId, ignoreRequestId));
}

function parsePartNumberComponents(partNumber) {
  const match = String(partNumber || "").trim().match(/^([A-Z0-9]{4})-([1-9])(\d{3})-([A-Z0-9]{3})$/i);
  if (!match) {
    return {
      project_code: "",
      main_code: "",
      sequence_no: "",
      revision_code: "",
      revision_mode: ""
    };
  }
  const revisionCode = match[4].toUpperCase();
  return {
    project_code: match[1].toUpperCase(),
    main_code: match[2],
    sequence_no: match[3],
    revision_code: revisionCode,
    revision_mode: inferPartRevisionMode(revisionCode)
  };
}

function validatePartNumberForInput(input, partNumber) {
  const parsed = parsePartNumberComponents(partNumber);
  if (!parsed.project_code) {
    return { valid: false, error: "Part number must look like X101-2001-01A." };
  }
  if (parsed.project_code !== input.project_code) {
    return { valid: false, error: `Part number project code must match ${input.project_code}.` };
  }
  if (parsed.main_code !== input.main_code) {
    return { valid: false, error: `Part number main code must match ${input.main_code}.` };
  }
  if (parsed.revision_code !== input.revision_code) {
    return { valid: false, error: `Part number revision must match ${input.revision_code}.` };
  }
  if (parsed.revision_mode !== input.revision_mode) {
    return { valid: false, error: `Part number revision type must match ${input.revision_mode}.` };
  }
  const minimumSequence = getPartSequenceMinimum(input.project_code, input.main_code);
  if (Number(parsed.sequence_no) < minimumSequence) {
    const minimumPartNumber = buildPartNumber(input, padSequence(minimumSequence));
    return {
      valid: false,
      error: `${input.project_code}-${input.main_code} part numbers must start from ${minimumPartNumber}; ${input.project_code}-${input.main_code}001 style numbers are not allowed.`
    };
  }
  return { valid: true, ...parsed };
}

function inferPartRevisionMode(revisionCode) {
  const code = sanitizeCompact(revisionCode);
  if (/^D\d{2}$/.test(code)) return "design";
  if (/^C\d{2}$/.test(code)) return "change";
  if (/^\d{2}[A-Z]$/.test(code)) return "released";
  return "";
}

function comparePartRevision(left, right) {
  return partRevisionSortValue(left.revision_code) - partRevisionSortValue(right.revision_code);
}

function partRevisionSortValue(revisionCode) {
  const code = sanitizeCompact(revisionCode);
  if (/^\d{2}[A-Z]$/.test(code)) {
    return 30_000 + Number(code.slice(0, 2)) * 26 + code.charCodeAt(2) - 64;
  }
  if (/^C\d{2}$/.test(code)) return 20_000 + Number(code.slice(1));
  if (/^D\d{2}$/.test(code)) return 10_000 + Number(code.slice(1));
  return 0;
}

function normalizePartRevisionMode(value) {
  const mode = String(value || "").trim().toLowerCase();
  if (mode === "design-stage" || mode === "design_stage") return "design";
  if (mode === "intermediate" || mode === "change-intermediate" || mode === "change_intermediate") return "change";
  return PART_REVISION_MODE_MAP[mode] ? mode : "released";
}

function sanitizePartNumber(value) {
  return sanitizeCompact(value).replace(/\s+/g, "");
}

function sanitizePartName(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function sanitizePartDescription(value) {
  return String(value || "")
    .replace(/[<>|]/g, "-")
    .replace(/\s+/g, " ")
    .trim();
}

function cleanWorkbookText(value) {
  return String(value ?? "")
    .replace(/\s+/g, " ")
    .trim();
}

function readZipEntries(filePath) {
  const buffer = fs.readFileSync(filePath);
  const eocdOffset = findEndOfCentralDirectory(buffer);
  if (eocdOffset < 0) throw new Error(`Invalid zip file: ${filePath}`);

  const entryCount = buffer.readUInt16LE(eocdOffset + 10);
  const centralDirectoryOffset = buffer.readUInt32LE(eocdOffset + 16);
  const entries = new Map();
  let offset = centralDirectoryOffset;

  for (let index = 0; index < entryCount; index += 1) {
    if (buffer.readUInt32LE(offset) !== 0x02014b50) throw new Error("Invalid zip central directory.");
    const compressionMethod = buffer.readUInt16LE(offset + 10);
    const compressedSize = buffer.readUInt32LE(offset + 20);
    const fileNameLength = buffer.readUInt16LE(offset + 28);
    const extraLength = buffer.readUInt16LE(offset + 30);
    const commentLength = buffer.readUInt16LE(offset + 32);
    const localHeaderOffset = buffer.readUInt32LE(offset + 42);
    const fileName = buffer.toString("utf8", offset + 46, offset + 46 + fileNameLength).replaceAll("\\", "/");

    const localNameLength = buffer.readUInt16LE(localHeaderOffset + 26);
    const localExtraLength = buffer.readUInt16LE(localHeaderOffset + 28);
    const dataStart = localHeaderOffset + 30 + localNameLength + localExtraLength;
    const compressed = buffer.subarray(dataStart, dataStart + compressedSize);
    const data = compressionMethod === 0
      ? Buffer.from(compressed)
      : compressionMethod === 8
        ? zlib.inflateRawSync(compressed)
        : null;
    if (data) entries.set(fileName, data);

    offset += 46 + fileNameLength + extraLength + commentLength;
  }

  return entries;
}

function findEndOfCentralDirectory(buffer) {
  const minOffset = Math.max(0, buffer.length - 66000);
  for (let offset = buffer.length - 22; offset >= minOffset; offset -= 1) {
    if (buffer.readUInt32LE(offset) === 0x06054b50) return offset;
  }
  return -1;
}

function parseSharedStrings(buffer) {
  if (!buffer) return [];
  const xml = buffer.toString("utf8");
  return [...xml.matchAll(/<si\b[\s\S]*?<\/si>/g)].map(match => extractXmlText(match[0]));
}

function parseWorksheetRows(buffer, sharedStrings) {
  if (!buffer) return new Map();
  const xml = buffer.toString("utf8").replace(/<row\b[^>]*\/>/g, "");
  const rows = new Map();

  for (const rowMatch of xml.matchAll(/<row\b([^>]*)>([\s\S]*?)<\/row>/g)) {
    const rowNumber = Number(getXmlAttribute(rowMatch[1], "r"));
    if (!rowNumber) continue;
    const row = [];

    for (const cellMatch of rowMatch[2].matchAll(/<c\b([^>]*)>([\s\S]*?)<\/c>/g)) {
      const ref = getXmlAttribute(cellMatch[1], "r");
      const column = columnLettersToNumber(String(ref || "").replace(/\d+/g, ""));
      if (!column) continue;
      const cellType = getXmlAttribute(cellMatch[1], "t");
      const rawValue = extractXmlValue(cellMatch[2]);
      row[column] = cellType === "s"
        ? (sharedStrings[Number(rawValue)] || "")
        : cellType === "inlineStr"
          ? extractXmlText(cellMatch[2])
          : xmlDecode(rawValue);
    }

    rows.set(rowNumber, row);
  }

  return rows;
}

function getMaxWorksheetRow(rows) {
  let max = 0;
  for (const rowNumber of rows.keys()) max = Math.max(max, rowNumber);
  return max;
}

function getXmlAttribute(attributes, name) {
  const match = String(attributes || "").match(new RegExp(`\\b${name}="([^"]*)"`));
  return match ? xmlDecode(match[1]) : "";
}

function extractXmlValue(xml) {
  const match = String(xml || "").match(/<v[^>]*>([\s\S]*?)<\/v>/);
  return match ? xmlDecode(match[1]) : "";
}

function extractXmlText(xml) {
  return [...String(xml || "").matchAll(/<t\b[^>]*>([\s\S]*?)<\/t>/g)]
    .map(match => xmlDecode(match[1]))
    .join("");
}

function xmlDecode(value) {
  return String(value || "")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&quot;", '"')
    .replaceAll("&apos;", "'")
    .replaceAll("&amp;", "&");
}

function columnLettersToNumber(letters) {
  let number = 0;
  for (const letter of String(letters || "").toUpperCase()) {
    if (letter < "A" || letter > "Z") return 0;
    number = number * 26 + letter.charCodeAt(0) - 64;
  }
  return number;
}

function normalizeRequestInput(body, user = null) {
  // Frontend labels changed over time; accept old and new payload names here
  // so older forms and tests keep working.
  const creationDate = normalizeDate(body.creation_date || body.creationDate || todayDate());
  const category = String(body.category || "").trim().toUpperCase();
  const revision = normalizeRevision(body.revision || "r00");
  const detailType = sanitizeCompact(body.detail_type || body.detailType || body.extra_type || body.extraType || "");
  const detailCode = sanitizeCompact(body.detail_code || body.detailCode || body.extra_code || body.extraCode || "");
  const detailVersion = sanitizeCompact(body.detail_version || body.detailVersion || body.version || "1");
  return {
    category,
    company_code: sanitizeCompact(body.company_code || body.companyCode || "X"),
    year_yy: String(body.year_yy || body.yearYY || creationDate.slice(2, 4)).padStart(2, "0"),
    revision,
    document_no: sanitizeText(body.document_no || body.documentNo || ""),
    reference_type: sanitizeCompact(body.reference_type || body.referenceType || "model").toLowerCase(),
    reference_value: sanitizeText(body.reference_value || body.referenceValue || body.product_or_task || ""),
    document_name: sanitizeText(body.document_name || body.documentName || ""),
    written_by: user ? user.display_name : sanitizeText(body.written_by || body.writtenBy || ""),
    creation_date: creationDate,
    control_status: "controlled",
    detail_type: detailType,
    detail_code: detailCode,
    detail_version: detailVersion,
    language: sanitizeCompact(body.language || "EN")
  };
}

async function buildPreview(input, options = {}) {
  // Preview is authoritative for numbering: request creation and admin approval
  // both call this before a document number becomes official.
  const errors = validateInput(input);
  const rule = CATEGORY_RULES[input.category];
  if (errors.length > 0) {
    return { valid: false, errors, input };
  }

  if (!rule.implemented) {
    return {
      valid: false,
      errors: [`${input.category} category is documented but not implemented in the MVP backend yet.`],
      input
    };
  }

  const requestedDocumentNo = sanitizeText(input.document_no || "");
  let sequenceNo = "000";
  let documentNo = requestedDocumentNo;

  if (requestedDocumentNo) {
    const parsed = parseDocumentNo(rule, input, requestedDocumentNo);
    if (!parsed.valid) {
      return { valid: false, errors: [parsed.error], input };
    }
    sequenceNo = parsed.sequence_no || "000";
  } else {
    const usesSequence = requiresSequenceForInput(rule, input);
    sequenceNo = usesSequence
      ? (options.sequenceNo || (options.includeNextSequence ? await getNextAvailableSequence(rule, input) : "001"))
      : "000";
    documentNo = buildDocumentNo(rule, input, sequenceNo);
  }

  if (await isDocumentNoUnavailable(documentNo, options.ignoreRequestId)) {
    return {
      valid: false,
      errors: [`${documentNo} is already approved or waiting for approval.`],
      input,
      document_no_preview: documentNo,
      sequence_no_preview: sequenceNo
    };
  }

  const filename = buildFilename(rule, documentNo, input);

  return {
    valid: true,
    errors: [],
    input,
    document_no_preview: documentNo,
    sequence_no_preview: sequenceNo !== "000" ? sequenceNo : null,
    generated_filename_preview: filename
  };
}

function validateInput(input) {
  const errors = [];
  const rule = CATEGORY_RULES[input.category];
  if (!input.category || !rule) errors.push("Category is required and must be one of D, R, MD, MR, EC, QMS, SOP, MARKETING.");
  if (input.company_code !== "X") errors.push("Company code must be X for the current MVP.");
  if (!/^\d{2}$/.test(input.year_yy)) errors.push("Year must use YY format, for example 26.");
  if (!isValidUiDate(input.creation_date)) errors.push("Creation date must be a valid YYYY-MM-DD date.");
  if (!input.document_name) errors.push("Document name is required.");
  if (!input.written_by) errors.push("Written by is required.");
  if (rule && ["D", "R", "MD", "MR", "EC", "QMS", "SOP", "MARKETING"].includes(rule.code) && !input.reference_value) {
    errors.push("Reference value is required.");
  }
  if (rule && REVISION_CATEGORY_CODES.includes(rule.code) && !/^r\d{2}$/.test(input.revision)) {
    errors.push("Revision must use r00 format.");
  }
  if (rule && rule.code === "EC") {
    const ecType = input.detail_type || "R";
    const ecOrder = input.detail_code || "A";
    if (!["R", "RR", "E", "O", "N"].includes(ecType)) errors.push("EC type must be R, Rr, E, O or N.");
    if (!/^[A-Z]$/.test(ecOrder)) errors.push("EC order must be a single letter, for example A.");
  }
  if (rule && rule.code === "MARKETING") {
    const materialType = normalizeMarketingMaterialType(input.detail_type || "BR");
    if (!MARKETING_MATERIAL_TYPES.includes(materialType)) errors.push("Marketing material type must be CA, BR, LE or GE.");
    if (!/^\d{2}$/.test(input.detail_code || "01")) errors.push("Marketing serial no must use two digits, for example 01.");
    if (!MARKETING_LANGUAGE_CODES.includes(input.language)) errors.push("Marketing language must be EN, TR or KR.");
    if (!/^\d+$/.test(input.detail_version || "1")) errors.push("Marketing version must be a number, for example 1.");
  }
  if (rule && (rule.code === "QMS" || (rule.code === "SOP" && !isIncomingSop(input))) && !/^\d{2}$/.test(input.reference_value)) {
    errors.push("Process number must use two digits, for example 13.");
  }
  if (rule && rule.code === "SOP" && isIncomingSop(input) && !isIncomingSopPartCode(input.reference_value)) {
    errors.push("Incoming SOP part code must look like 1501-1107.");
  }
  if (rule && rule.code === "QMS") {
    const qmsType = input.detail_type || "QP";
    if (!["QM", "QP", "QT"].includes(qmsType)) errors.push("QMS type must be QM, QP or QT.");
  }
  return errors;
}

async function createDocumentRequest(user, body) {
  const normalized = normalizeRequestInput(body, user);
  const preview = await buildPreview(normalized, { includeNextSequence: true });
  if (!preview.valid) throw httpError(422, "validation_failed", preview.errors.join(" "));
  normalized.document_no = preview.document_no_preview;

  return await db.transaction(async () => {
    if (await isDocumentNoUnavailable(preview.document_no_preview)) {
      throw httpError(409, "duplicate_document_no", `${preview.document_no_preview} is already approved or waiting for approval.`);
    }

    const now = nowIso();
    const result = await db.prepare(`
      INSERT INTO document_requests (
        status, category, company_code, year_yy, revision, reference_type,
        reference_value, document_name, written_by, creation_date, sequence_no, document_no,
        control_status, generated_filename, requested_by_user_id,
        created_at, updated_at, payload_json
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      "pending",
      normalized.category,
      normalized.company_code,
      normalized.year_yy,
      normalized.revision,
      normalized.reference_type,
      normalized.reference_value,
      normalized.document_name,
      user.display_name,
      normalized.creation_date,
      preview.sequence_no_preview || "000",
      preview.document_no_preview,
      normalized.control_status,
      preview.generated_filename_preview,
      user.id,
      now,
      now,
      JSON.stringify(normalized)
    );

    const request = await getRequestById(Number(result.lastInsertRowid));
    await insertAudit(user.id, "document_request", request.id, "request.created", null, request);
    const systemUser = await getSystemUser();
    const published = await publishDocumentRequestInTransaction(request.id, systemUser, {
      auditAction: "request.auto_published"
    });
    await notifyAdminsOfAutoPublished("document", user, published.request, published.document);
    return published.request;
  });
}

async function approveRequest(requestId, user) {
  return await db.transaction(async () => {
    return await publishDocumentRequestInTransaction(requestId, user, {
      auditAction: "request.approved"
    });
  });
}

async function publishDocumentRequestInTransaction(requestId, user, options = {}) {
  const before = await getRequestById(requestId);
  if (!before) throw httpError(404, "not_found", "Request not found.");
  if (before.status !== "pending") throw httpError(409, "invalid_status", "Only pending requests can be approved.");

  const input = normalizeRequestInput({
    ...(safeParseJson(before.payload_json) || {}),
    category: before.category,
    company_code: before.company_code,
    year_yy: before.year_yy,
    revision: before.revision,
    document_no: before.document_no,
    reference_type: before.reference_type,
    reference_value: before.reference_value,
    document_name: before.document_name,
    written_by: before.written_by,
    creation_date: before.creation_date,
    control_status: before.control_status
  }, { display_name: before.written_by });

  const rule = CATEGORY_RULES[input.category];
  if (!rule || !rule.implemented) {
    throw httpError(422, "not_implemented", `${input.category} approvals are not implemented in the MVP backend yet.`);
  }

  if (before.document_no && (await isDocumentNoApprovedElsewhere(before.document_no))) {
    throw httpError(409, "duplicate_document_no", `${before.document_no} is already approved.`);
  }

  const sequenceNo = before.document_no
    ? (before.sequence_no || "000")
    : (requiresSequenceForInput(rule, input) ? await getNextAvailableSequence(rule, input) : "000");
  const preview = await buildPreview(input, { sequenceNo, ignoreRequestId: requestId });
  if (!preview.valid) throw httpError(422, "validation_failed", preview.errors.join(" "));

  const now = nowIso();
  await db.prepare(`
    UPDATE document_requests
    SET status = 'approved',
        sequence_no = ?,
        document_no = ?,
        generated_filename = ?,
        approved_by_user_id = ?,
        approved_at = ?,
        updated_at = ?
    WHERE id = ?
  `).run(
    sequenceNo,
    preview.document_no_preview,
    preview.generated_filename_preview,
    user.id,
    now,
    now,
    requestId
  );

  await db.prepare(`
    INSERT INTO document_records (
      request_id, category, company_code, year_yy, sequence_no, document_no,
      revision, reference_type, reference_value, document_name, written_by,
      creation_date, control_status, generated_filename, approved_by_user_id,
      approved_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    requestId,
    input.category,
    input.company_code,
    input.year_yy,
    sequenceNo,
    preview.document_no_preview,
    input.revision,
    input.reference_type,
    input.reference_value,
    input.document_name,
    input.written_by,
    input.creation_date,
    input.control_status,
    preview.generated_filename_preview,
    user.id,
    now
  );

  const after = await getRequestById(requestId);
  const document = await getDocumentByRequestId(requestId);
  await insertAudit(user.id, "document_request", requestId, options.auditAction || "request.approved", before, after);
  await bumpSequenceAfterApproval(rule, input, sequenceNo);
  return { request: after, document };
}

async function rejectRequest(requestId, user, reason) {
  const before = await getRequestById(requestId);
  if (!before) throw httpError(404, "not_found", "Request not found.");
  if (before.status !== "pending") throw httpError(409, "invalid_status", "Only pending requests can be rejected.");

  const now = nowIso();
  await db.prepare(`
    UPDATE document_requests
    SET status = 'rejected',
        reject_reason = ?,
        approved_by_user_id = ?,
        approved_at = ?,
        updated_at = ?
    WHERE id = ?
  `).run(sanitizeText(reason), user.id, now, now, requestId);

  const after = await getRequestById(requestId);
  await insertAudit(user.id, "document_request", requestId, "request.rejected", before, after);
  return { request: after };
}

async function renameApprovedDocument(documentId, user, documentName) {
  const before = await getDocumentById(documentId);
  if (!before) throw httpError(404, "not_found", "Document record not found.");

  const nextDocumentName = sanitizeText(documentName);
  if (!nextDocumentName) throw httpError(422, "validation_failed", "Document name is required.");

  const rule = CATEGORY_RULES[before.category];
  if (!rule || !rule.implemented) {
    throw httpError(422, "not_implemented", `${before.category} document rename is not implemented.`);
  }

  const requestPayload = before.request_id ? await getRequestById(before.request_id) : null;
  const nextInput = normalizeRequestInput({
    ...(safeParseJson(requestPayload && requestPayload.payload_json) || {}),
    reference_value: before.reference_value,
    document_name: nextDocumentName,
    revision: before.revision,
    creation_date: before.creation_date,
    control_status: before.control_status,
    category: before.category,
    year_yy: before.year_yy
  });
  const nextFilename = buildFilename(rule, before.document_no, nextInput);

  const now = nowIso();
  await db.prepare(`
    UPDATE document_records
    SET document_name = ?,
        generated_filename = ?
    WHERE id = ?
  `).run(nextDocumentName, nextFilename, documentId);

  if (requestPayload) {
    const nextPayload = safeParseJson(requestPayload.payload_json) || {};
    nextPayload.document_name = nextDocumentName;
    await db.prepare(`
      UPDATE document_requests
      SET document_name = ?,
          generated_filename = ?,
          payload_json = ?,
          updated_at = ?
      WHERE id = ?
    `).run(
      nextDocumentName,
      nextFilename,
      JSON.stringify(nextPayload),
      now,
      before.request_id
    );
  }

  const after = await getDocumentById(documentId);
  await insertAudit(user.id, "document_record", documentId, "document.renamed", before, after);
  return { document: after };
}

async function adminEditDocumentRecord(documentId, user, body = {}) {
  const result = await updateDocumentRecordDetails(documentId, user, body, {
    reviewedByAdmin: true,
    auditAction: "document.admin_edited"
  });
  return { status: "updated", document: result.document };
}

async function editDocumentRecordByRequester(documentId, user, body = {}) {
  const before = await getDocumentById(documentId);
  if (!before) throw httpError(404, "not_found", "Document record not found.");
  const request = before.request_id ? await getRequestById(before.request_id) : null;
  if (!request || Number(request.requested_by_user_id) !== Number(user.id)) {
    throw httpError(403, "forbidden", "Only the original requester can edit this document.");
  }

  const systemUser = await getSystemUser();
  if (Number(before.approved_by_user_id) === Number(systemUser.id)) {
    const result = await updateDocumentRecordDetails(documentId, user, body, {
      reviewedByAdmin: false,
      auditAction: "document.user_auto_edited"
    });
    await refreshOpenDocumentAutoPublishedNotifications(result.document, user);
    return { status: "updated", document: result.document };
  }

  const pending = await getPendingDocumentEditNotificationForDocument(documentId);
  if (pending) {
    throw httpError(409, "edit_request_exists", "There is already a pending edit request for this document.");
  }

  const proposed = normalizeDocumentRecordEditInput(before, body, safeParseJson(request.payload_json) || {});
  await validateDocumentRecordEditInput(proposed, {
    ignoreDocumentId: before.id,
    ignoreRequestId: request.id
  });
  await notifyAdminsOfDocumentEditRequest(before, proposed, user, request);
  return { status: "pending_review", document: before };
}

async function updateDocumentRecordDetails(documentId, user, body = {}, options = {}) {
  const before = await getDocumentById(documentId);
  if (!before) throw httpError(404, "not_found", "Document record not found.");
  const request = before.request_id ? await getRequestById(before.request_id) : null;
  const payload = request ? (safeParseJson(request.payload_json) || {}) : {};
  const next = normalizeDocumentRecordEditInput(before, body, payload);

  await validateDocumentRecordEditInput(next, {
    ignoreDocumentId: before.id,
    ignoreRequestId: request ? request.id : null
  });

  const now = nowIso();
  const approvedByUserId = options.reviewedByAdmin ? user.id : before.approved_by_user_id;
  const approvedAt = options.reviewedByAdmin ? now : before.approved_at;

  await db.prepare(`
    UPDATE document_records
    SET category = ?,
        company_code = ?,
        year_yy = ?,
        sequence_no = ?,
        document_no = ?,
        revision = ?,
        reference_type = ?,
        reference_value = ?,
        document_name = ?,
        written_by = ?,
        creation_date = ?,
        control_status = ?,
        generated_filename = ?,
        approved_by_user_id = ?,
        approved_at = ?
    WHERE id = ?
      AND deleted_at IS NULL
  `).run(
    next.category,
    next.company_code,
    next.year_yy,
    next.sequence_no,
    next.document_no,
    next.revision,
    next.reference_type,
    next.reference_value,
    next.document_name,
    next.written_by,
    next.creation_date,
    next.control_status,
    next.generated_filename,
    approvedByUserId,
    approvedAt,
    before.id
  );

  if (request) {
    const nextPayload = {
      ...payload,
      category: next.category,
      company_code: next.company_code,
      year_yy: next.year_yy,
      sequence_no: next.sequence_no,
      document_no: next.document_no,
      revision: next.revision,
      reference_type: next.reference_type,
      reference_value: next.reference_value,
      document_name: next.document_name,
      written_by: next.written_by,
      creation_date: next.creation_date,
      control_status: next.control_status,
      generated_filename: next.generated_filename,
      detail_type: next.detail_type,
      detail_code: next.detail_code,
      detail_version: next.detail_version,
      language: next.language
    };

    await db.prepare(`
      UPDATE document_requests
      SET category = ?,
          company_code = ?,
          year_yy = ?,
          sequence_no = ?,
          document_no = ?,
          revision = ?,
          reference_type = ?,
          reference_value = ?,
          document_name = ?,
          written_by = ?,
          creation_date = ?,
          control_status = ?,
          generated_filename = ?,
          approved_by_user_id = ?,
          approved_at = ?,
          payload_json = ?,
          updated_at = ?
      WHERE id = ?
    `).run(
      next.category,
      next.company_code,
      next.year_yy,
      next.sequence_no,
      next.document_no,
      next.revision,
      next.reference_type,
      next.reference_value,
      next.document_name,
      next.written_by,
      next.creation_date,
      next.control_status,
      next.generated_filename,
      approvedByUserId,
      approvedAt,
      JSON.stringify(nextPayload),
      now,
      request.id
    );
  }

  const rule = CATEGORY_RULES[next.category];
  await bumpSequenceAfterApproval(rule, next, next.sequence_no);
  const after = await getDocumentById(before.id);
  await insertAudit(user.id, "document_record", before.id, options.auditAction || "document.edited", before, after);
  return { domain: "document", document: after, requesterId: request ? request.requested_by_user_id : null };
}

function normalizeDocumentRecordEditInput(before, body = {}, payload = {}) {
  const creationDate = hasOwn(body, "creation_date") || hasOwn(body, "creationDate")
    ? normalizeDate(body.creation_date ?? body.creationDate)
    : normalizeDate(before.creation_date);
  const category = hasOwn(body, "category")
    ? sanitizeCompact(body.category)
    : sanitizeCompact(before.category);
  const yearYy = hasOwn(body, "year_yy") || hasOwn(body, "yearYY")
    ? normalizeYearYY(body.year_yy ?? body.yearYY, creationDate)
    : normalizeYearYY(before.year_yy, creationDate);

  const next = {
    category,
    company_code: hasOwn(body, "company_code") || hasOwn(body, "companyCode")
      ? sanitizeCompact(body.company_code ?? body.companyCode)
      : sanitizeCompact(before.company_code),
    year_yy: yearYy,
    sequence_no: hasOwn(body, "sequence_no") || hasOwn(body, "sequenceNo")
      ? sanitizeDocumentSequenceNo(body.sequence_no ?? body.sequenceNo)
      : sanitizeDocumentSequenceNo(before.sequence_no),
    document_no: hasOwn(body, "document_no") || hasOwn(body, "documentNo")
      ? sanitizeText(body.document_no ?? body.documentNo)
      : sanitizeText(before.document_no),
    revision: hasOwn(body, "revision")
      ? normalizeRevision(body.revision)
      : normalizeRevision(before.revision || "r00"),
    reference_type: hasOwn(body, "reference_type") || hasOwn(body, "referenceType")
      ? sanitizeCompact(body.reference_type ?? body.referenceType).toLowerCase()
      : sanitizeCompact(before.reference_type || "model").toLowerCase(),
    reference_value: hasOwn(body, "reference_value") || hasOwn(body, "referenceValue")
      ? sanitizeText(body.reference_value ?? body.referenceValue)
      : sanitizeText(before.reference_value),
    document_name: hasOwn(body, "document_name") || hasOwn(body, "documentName")
      ? sanitizeText(body.document_name ?? body.documentName)
      : sanitizeText(before.document_name),
    written_by: hasOwn(body, "written_by") || hasOwn(body, "writtenBy")
      ? sanitizeText(body.written_by ?? body.writtenBy)
      : sanitizeText(before.written_by),
    creation_date: creationDate,
    control_status: hasOwn(body, "control_status") || hasOwn(body, "controlStatus")
      ? normalizeControlStatus(body.control_status ?? body.controlStatus)
      : normalizeControlStatus(before.control_status),
    detail_type: optionalCompactValue(
      body.detail_type ?? body.detailType ?? body.extra_type ?? body.extraType,
      payload.detail_type || payload.detailType || payload.extra_type || payload.extraType || ""
    ),
    detail_code: optionalCompactValue(
      body.detail_code ?? body.detailCode ?? body.extra_code ?? body.extraCode,
      payload.detail_code || payload.detailCode || payload.extra_code || payload.extraCode || ""
    ),
    detail_version: optionalCompactValue(
      body.detail_version ?? body.detailVersion ?? body.version,
      payload.detail_version || payload.detailVersion || payload.version || "1"
    ),
    language: optionalCompactValue(body.language, payload.language || "EN")
  };

  const rule = CATEGORY_RULES[next.category];
  if (rule) {
    const parsed = parseDocumentNo(rule, next, next.document_no);
    if (parsed.valid) next.sequence_no = parsed.sequence_no || next.sequence_no || "000";
  }

  next.generated_filename = hasOwn(body, "generated_filename") || hasOwn(body, "generatedFilename")
    ? sanitizeFilenameText(body.generated_filename ?? body.generatedFilename)
    : (rule ? buildFilename(rule, next.document_no, next) : sanitizeFilenameText(before.generated_filename));

  return next;
}

async function validateDocumentRecordEditInput(input, options = {}) {
  const errors = validateInput(input);
  const rule = CATEGORY_RULES[input.category];

  if (!input.document_no) errors.push("Document no is required.");
  if (!input.generated_filename) errors.push("Generated filename is required.");
  if (input.control_status && !["controlled", "uncontrolled"].includes(input.control_status)) {
    errors.push("Control status must be controlled or uncontrolled.");
  }

  if (rule && input.document_no) {
    const parsed = parseDocumentNo(rule, input, input.document_no);
    if (!parsed.valid) errors.push(parsed.error);
  }

  if (errors.length > 0) {
    throw httpError(422, "validation_failed", errors.join(" "));
  }

  if (await isDocumentNoUnavailableForEdit(input.document_no, options)) {
    throw httpError(409, "duplicate_document_no", `${input.document_no} is already approved or waiting for approval.`);
  }
  if (await isGeneratedFilenameUnavailableForEdit(input.generated_filename, options)) {
    throw httpError(409, "duplicate_generated_filename", `${input.generated_filename} is already approved or waiting for approval.`);
  }
}

async function isDocumentNoUnavailableForEdit(documentNo, options = {}) {
  if (!documentNo) return false;
  const record = await db.prepare(`
    SELECT id
    FROM document_records
    WHERE document_no = ?
      AND (? IS NULL OR id <> ?)
    LIMIT 1
  `).get(documentNo, options.ignoreDocumentId || null, options.ignoreDocumentId || null);
  if (record) return true;

  const request = await db.prepare(`
    SELECT id
    FROM document_requests
    WHERE document_no = ?
      AND status <> 'rejected'
      AND (? IS NULL OR id <> ?)
    LIMIT 1
  `).get(documentNo, options.ignoreRequestId || null, options.ignoreRequestId || null);
  return Boolean(request);
}

async function isGeneratedFilenameUnavailableForEdit(filename, options = {}) {
  if (!filename) return false;
  const normalized = filename.toUpperCase();
  const record = await db.prepare(`
    SELECT id
    FROM document_records
    WHERE UPPER(generated_filename) = ?
      AND deleted_at IS NULL
      AND (? IS NULL OR id <> ?)
    LIMIT 1
  `).get(normalized, options.ignoreDocumentId || null, options.ignoreDocumentId || null);
  if (record) return true;

  const request = await db.prepare(`
    SELECT id
    FROM document_requests
    WHERE UPPER(generated_filename) = ?
      AND status <> 'rejected'
      AND (? IS NULL OR id <> ?)
    LIMIT 1
  `).get(normalized, options.ignoreRequestId || null, options.ignoreRequestId || null);
  return Boolean(request);
}

async function getPendingDocumentEditNotificationForDocument(documentId) {
  return await db.prepare(`
    SELECT *
    FROM notifications
    WHERE type = 'document_edit_request'
      AND entity_type = 'document_record'
      AND entity_id = ?
      AND status IN ('unread', 'read')
    LIMIT 1
  `).get(documentId);
}

async function notifyAdminsOfDocumentEditRequest(before, proposed, requester, request) {
  const admins = await listUsersWithPermission("document_admin");
  const label = before.document_no;
  for (const admin of admins) {
    await createNotification({
      recipientUserId: admin.id,
      sourceUserId: requester.id,
      type: "document_edit_request",
      entityType: "document_record",
      entityId: before.id,
      relatedRequestId: request ? request.id : before.request_id,
      title: "Document edit request",
      body: `${requester.display_name} requested changes for ${label}.`,
      metadata: {
        domain: "document",
        action: "edit_request",
        label,
        requested_by_user_id: requester.id,
        created_by: requester.display_name,
        previous_document_no: before.document_no,
        previous_generated_filename: before.generated_filename,
        previous_document_name: before.document_name,
        previous_reference_value: before.reference_value,
        previous_category: before.category,
        document_no: proposed.document_no,
        generated_filename: proposed.generated_filename,
        category: proposed.category,
        company_code: proposed.company_code,
        year_yy: proposed.year_yy,
        sequence_no: proposed.sequence_no,
        revision: proposed.revision,
        reference_type: proposed.reference_type,
        reference_value: proposed.reference_value,
        document_name: proposed.document_name,
        written_by: proposed.written_by,
        creation_date: proposed.creation_date,
        control_status: proposed.control_status,
        detail_type: proposed.detail_type,
        detail_code: proposed.detail_code,
        detail_version: proposed.detail_version,
        language: proposed.language
      }
    });
  }
}

async function refreshOpenDocumentAutoPublishedNotifications(documentRecord, editor) {
  const notifications = await db.prepare(`
    SELECT *
    FROM notifications
    WHERE type = 'document_auto_published'
      AND entity_type = 'document_record'
      AND entity_id = ?
      AND status IN ('unread', 'read')
  `).all(documentRecord.id);

  for (const notification of notifications) {
    const metadata = safeParseJson(notification.metadata_json) || {};
    metadata.label = documentRecord.document_no;
    metadata.document_no = documentRecord.document_no;
    metadata.generated_filename = documentRecord.generated_filename;
    metadata.document_name = documentRecord.document_name;
    metadata.reference_value = documentRecord.reference_value;
    metadata.category = documentRecord.category;
    metadata.edited_by = editor.display_name;

    await db.prepare(`
      UPDATE notifications
      SET metadata_json = ?,
          body = ?
      WHERE id = ?
    `).run(
      JSON.stringify(metadata),
      `${documentRecord.document_no} was edited by ${editor.display_name} and is available for review.`,
      notification.id
    );
  }
}

async function updateDocumentRevision(documentId, user, options = {}) {
  // Revision updates keep the public document number stable. The current row is
  // updated in place, while the previous revision is copied to the archive.
  const useTransaction = !options.skipTransaction;
  const updateRevision = async () => {
    const before = await getDocumentById(documentId);
    if (!before) throw httpError(404, "not_found", "Document record not found.");

    const rule = CATEGORY_RULES[before.category];
    if (!rule || !rule.implemented) {
      throw httpError(422, "not_implemented", `${before.category} revision update is not implemented.`);
    }
    if (rule.suffixType !== "revision") {
      throw httpError(422, "validation_failed", `${before.category} documents do not use revision suffixes.`);
    }
    if (!/^r\d{2}$/.test(before.revision || "")) {
      throw httpError(422, "validation_failed", "Current revision must use r00 format.");
    }

    const requestPayload = before.request_id ? await getRequestById(before.request_id) : null;
    const nextRevision = incrementRevision(before.revision);
    const now = nowIso();
    const nextInput = normalizeRequestInput({
      ...(safeParseJson(requestPayload && requestPayload.payload_json) || {}),
      reference_value: before.reference_value,
      document_name: before.document_name,
      revision: nextRevision,
      creation_date: before.creation_date,
      control_status: before.control_status,
      category: before.category,
      company_code: before.company_code,
      year_yy: before.year_yy,
      reference_type: before.reference_type
    }, { display_name: before.written_by });
    const nextFilename = buildFilename(rule, before.document_no, nextInput);

    const archiveResult = await db.prepare(`
      INSERT INTO document_revision_archive (
        document_record_id, request_id, category, company_code, year_yy, sequence_no,
        document_no, revision, next_revision, reference_type, reference_value,
        document_name, written_by, creation_date, control_status, generated_filename,
        approved_by_user_id, approved_at, revision_changed_by_user_id,
        revision_changed_at, archived_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      before.id,
      before.request_id,
      before.category,
      before.company_code,
      before.year_yy,
      before.sequence_no,
      before.document_no,
      before.revision,
      nextRevision,
      before.reference_type,
      before.reference_value,
      before.document_name,
      before.written_by,
      before.creation_date,
      before.control_status,
      before.generated_filename,
      before.approved_by_user_id,
      before.approved_at,
      user.id,
      now,
      now
    );

    await db.prepare(`
      UPDATE document_records
      SET revision = ?,
          generated_filename = ?,
          approved_by_user_id = ?,
          approved_at = ?,
          revision_updated_by_user_id = ?,
          revision_updated_at = ?
      WHERE id = ?
    `).run(nextRevision, nextFilename, user.id, now, user.id, now, before.id);

    if (requestPayload) {
      const nextPayload = safeParseJson(requestPayload.payload_json) || {};
      nextPayload.revision = nextRevision;
      await db.prepare(`
        UPDATE document_requests
        SET revision = ?,
            generated_filename = ?,
            approved_by_user_id = ?,
            approved_at = ?,
            payload_json = ?,
            updated_at = ?
        WHERE id = ?
      `).run(
        nextRevision,
        nextFilename,
        user.id,
        now,
        JSON.stringify(nextPayload),
        now,
        before.request_id
      );
    }

    const after = await getDocumentById(before.id);
    await insertAudit(user.id, "document_record", before.id, "document.revision_updated", before, after);
    return {
      document: after,
      archived_revision: await db.prepare("SELECT * FROM document_revision_archive WHERE id = ?").get(Number(archiveResult.lastInsertRowid))
    };
  };

  return useTransaction ? await db.transaction(updateRevision) : await updateRevision();
}

async function createRevisionRequest(documentId, user, body = {}) {
  // Users request a revision from Document List; admins decide it later from
  // Admin Review. Only one pending revision request per document is allowed.
  const documentRecord = await getDocumentById(documentId);
  if (!documentRecord) throw httpError(404, "not_found", "Document record not found.");

  assertRevisionUpdateAllowed(documentRecord);
  const requestedRevision = incrementRevision(documentRecord.revision);
  const existing = await db.prepare(`
    SELECT id
    FROM document_revision_requests
    WHERE document_record_id = ?
      AND status = 'pending'
    LIMIT 1
  `).get(documentId);
  if (existing) throw httpError(409, "revision_request_exists", "There is already a pending revision request for this document.");

  const now = nowIso();
  const result = await db.prepare(`
    INSERT INTO document_revision_requests (
      document_record_id, requested_by_user_id, status, current_revision,
      requested_revision, request_note, created_at, updated_at
    )
    VALUES (?, ?, 'pending', ?, ?, ?, ?, ?)
  `).run(
    documentId,
    user.id,
    documentRecord.revision,
    requestedRevision,
    sanitizeText(body.note || body.request_note || body.requestNote || ""),
    now,
    now
  );

  const request = await getRevisionRequestById(Number(result.lastInsertRowid));
  await insertAudit(user.id, "revision_request", request.id, "revision_request.created", null, request);
  return { revision_request: request };
}

async function listPendingRevisionRequests() {
  return await db.prepare(`
    SELECT
      rr.*,
      u.display_name AS requested_by,
      dr.document_no,
      dr.generated_filename,
      dr.document_name,
      dr.category,
      dr.reference_value,
      dr.written_by,
      dr.creation_date,
      au.display_name AS checked_by
    FROM document_revision_requests rr
    JOIN document_records dr ON dr.id = rr.document_record_id
    LEFT JOIN users u ON u.id = rr.requested_by_user_id
    LEFT JOIN users au ON au.id = dr.approved_by_user_id
    WHERE rr.status = 'pending'
    ORDER BY rr.created_at ASC, rr.id ASC
  `).all();
}

async function approveRevisionRequest(requestId, user) {
  return await db.transaction(async () => {
    const beforeRequest = await getRevisionRequestById(requestId);
    if (!beforeRequest) throw httpError(404, "not_found", "Revision request not found.");
    if (beforeRequest.status !== "pending") throw httpError(409, "invalid_status", "Only pending revision requests can be approved.");

    const documentRecord = await getDocumentById(beforeRequest.document_record_id);
    if (!documentRecord) throw httpError(404, "not_found", "Document record not found.");
    if (documentRecord.revision !== beforeRequest.current_revision) {
      throw httpError(409, "revision_changed", "Document revision has changed since this request was created.");
    }

    const revisionResult = await updateDocumentRevision(documentRecord.id, user, { skipTransaction: true });
    const now = nowIso();
    await db.prepare(`
      UPDATE document_revision_requests
      SET status = 'approved',
          decided_by_user_id = ?,
          decided_at = ?,
          updated_at = ?
      WHERE id = ?
    `).run(user.id, now, now, requestId);

    const afterRequest = await getRevisionRequestById(requestId);
    await insertAudit(user.id, "revision_request", requestId, "revision_request.approved", beforeRequest, afterRequest);
    return { revision_request: afterRequest, document: revisionResult.document, archived_revision: revisionResult.archived_revision };
  });
}

async function rejectRevisionRequest(requestId, user, reason) {
  const before = await getRevisionRequestById(requestId);
  if (!before) throw httpError(404, "not_found", "Revision request not found.");
  if (before.status !== "pending") throw httpError(409, "invalid_status", "Only pending revision requests can be rejected.");

  const now = nowIso();
  await db.prepare(`
    UPDATE document_revision_requests
    SET status = 'rejected',
        reject_reason = ?,
        decided_by_user_id = ?,
        decided_at = ?,
        updated_at = ?
    WHERE id = ?
  `).run(sanitizeText(reason), user.id, now, now, requestId);

  const after = await getRevisionRequestById(requestId);
  await insertAudit(user.id, "revision_request", requestId, "revision_request.rejected", before, after);
  return { revision_request: after };
}

async function getRevisionRequestById(id) {
  return await db.prepare("SELECT * FROM document_revision_requests WHERE id = ?").get(id);
}

function assertRevisionUpdateAllowed(documentRecord) {
  const rule = CATEGORY_RULES[documentRecord.category];
  if (!rule || !rule.implemented) throw httpError(422, "not_implemented", `${documentRecord.category} revision update is not implemented.`);
  if (rule.suffixType !== "revision") throw httpError(422, "validation_failed", `${documentRecord.category} documents do not use revision suffixes.`);
  if (!/^r\d{2}$/.test(documentRecord.revision || "")) throw httpError(422, "validation_failed", "Current revision must use r00 format.");
}

function incrementRevision(revision) {
  const number = Number(String(revision || "").slice(1));
  if (!Number.isInteger(number) || number >= 99) {
    throw httpError(422, "validation_failed", "Revision cannot be incremented.");
  }
  return `r${String(number + 1).padStart(2, "0")}`;
}

async function reserveNextSequence(category, yearYy) {
  const scopeKey = `${category}:${yearYy}`;
  const existing = await db.prepare("SELECT next_sequence FROM document_sequences WHERE scope_key = ?").get(scopeKey);
  if (!existing) {
    const maxRow = await db.prepare(`
      SELECT MAX(CAST(sequence_no AS INTEGER)) AS max_sequence
      FROM document_records
      WHERE category = ? AND year_yy = ?
    `).get(category, yearYy);
    const next = Number(maxRow && maxRow.max_sequence ? maxRow.max_sequence : 0) + 1;
    await db.prepare(`
      INSERT INTO document_sequences (scope_key, category, year_yy, next_sequence, updated_at)
      VALUES (?, ?, ?, ?, ?)
    `).run(scopeKey, category, yearYy, next + 1, nowIso());
    return padSequence(next);
  }

  const current = Number(existing.next_sequence);
  await db.prepare(`
    UPDATE document_sequences
    SET next_sequence = ?, updated_at = ?
    WHERE scope_key = ?
  `).run(current + 1, nowIso(), scopeKey);
  return padSequence(current);
}

async function getNextSequencePreview(category, yearYy) {
  const scopeKey = `${category}:${yearYy}`;
  const existing = await db.prepare("SELECT next_sequence FROM document_sequences WHERE scope_key = ?").get(scopeKey);
  if (existing) return padSequence(Number(existing.next_sequence));

  const maxRow = await db.prepare(`
    SELECT MAX(CAST(sequence_no AS INTEGER)) AS max_sequence
    FROM document_records
    WHERE category = ? AND year_yy = ?
  `).get(category, yearYy);
  return padSequence(Number(maxRow && maxRow.max_sequence ? maxRow.max_sequence : 0) + 1);
}

function buildDocumentNo(rule, input, sequenceNo) {
  if (rule.code === "EC") {
    const ecOrder = input.detail_code || "A";
    const ecType = formatEcType(input.detail_type || "R");
    if (!isSequencedEcType(input)) return `${rule.prefix}-${input.year_yy}${ecOrder}-${ecType}`;
    return `${rule.prefix}-${input.year_yy}${ecOrder}-${ecType}-${sequenceNo}`;
  }

  if (rule.code === "MARKETING") {
    return buildMarketingId(input);
  }

  if (rule.code === "QMS") {
    const qmsType = input.detail_type || "QP";
    if (qmsType === "QM") return `XQM-${input.year_yy}`;
    if (qmsType === "QT") return `XQT-${input.reference_value}-${sequenceNo}`;
    return `XQP-${input.reference_value}`;
  }

  if (rule.code === "SOP") {
    if (isIncomingSop(input)) return `XQS-${sanitizeCompact(input.reference_value)}`;
    return `XQS-${input.reference_value}-${sequenceNo}`;
  }

  return `${rule.prefix}-${input.year_yy}-${sequenceNo}`;
}

function buildFilename(rule, documentNo, input) {
  if (rule.code === "MARKETING") return documentNo;

  const suffix = rule.suffixType === "date"
    ? input.creation_date.replaceAll("-", "")
    : input.revision;
  if (rule.code === "SOP" && isIncomingSop(input)) {
    return [documentNo, suffix].filter(Boolean).join("_");
  }
  if (["QMS", "SOP"].includes(rule.code)) {
    return [documentNo, input.document_name, suffix].filter(Boolean).join("_");
  }

  return [documentNo, input.reference_value, input.document_name, suffix].filter(Boolean).join("_");
}

function parseDocumentNo(rule, input, documentNo) {
  if (["D", "R", "MD", "MR"].includes(rule.code)) {
    const match = documentNo.match(new RegExp(`^${rule.prefix}-(\\d{2})-(\\d{3})$`));
    if (!match) return { valid: false, error: `${rule.code} document no must look like ${rule.prefix}-${input.year_yy}-001.` };
    if (match[1] !== input.year_yy) return { valid: false, error: `Document no year must match ${input.year_yy}.` };
    return { valid: true, sequence_no: match[2] };
  }

  if (rule.code === "EC") {
    const ecType = formatEcType(input.detail_type || "R");
    const pattern = isSequencedEcType(input)
      ? /^XEC-(\d{2})([A-Z])-(Rr)-(\d{3})$/
      : /^XEC-(\d{2})([A-Z])-(R|E|O|N)$/;
    const match = documentNo.match(pattern);
    if (!match) return { valid: false, error: isSequencedEcType(input) ? "EC Rr document no must look like XEC-26A-Rr-001." : "EC document no must look like XEC-26A-R." };
    if (match[1] !== input.year_yy) return { valid: false, error: `EC year must match ${input.year_yy}.` };
    if (match[2] !== (input.detail_code || "A")) return { valid: false, error: `EC order must match ${input.detail_code || "A"}.` };
    if (match[3] !== ecType) return { valid: false, error: `EC type must match ${ecType}.` };
    return { valid: true, sequence_no: match[4] || "000" };
  }

  if (rule.code === "MARKETING") {
    if (!/^XERA-[A-Z0-9]+-\d{2}(CA|BR|LE|GE)\d{2}-(EN|TR|KR)V\d+$/.test(documentNo)) {
      return { valid: false, error: "Marketing ID must look like XERA-GR10X-26BR01-ENV1." };
    }
    return { valid: true, sequence_no: "000" };
  }

  if (rule.code === "QMS") {
    const qmsType = input.detail_type || "QP";
    if (qmsType === "QM") {
      const match = documentNo.match(/^XQM-(\d{2})$/);
      if (!match) return { valid: false, error: `QMS manual document no must look like XQM-${input.year_yy}.` };
      if (match[1] !== input.year_yy) return { valid: false, error: `QMS manual year must match ${input.year_yy}.` };
      return { valid: true, sequence_no: "000" };
    }
    if (qmsType === "QT") {
      const match = documentNo.match(/^XQT-(\d{2})-(\d{2,3})$/);
      if (!match) return { valid: false, error: `QMS template document no must look like XQT-${input.reference_value}-01.` };
      if (match[1] !== input.reference_value) return { valid: false, error: `QMS process must match ${input.reference_value}.` };
      return { valid: true, sequence_no: match[2] };
    }
    const match = documentNo.match(/^XQP-(\d{2})$/);
    if (!match) return { valid: false, error: `QMS process document no must look like XQP-${input.reference_value}.` };
    if (match[1] !== input.reference_value) return { valid: false, error: `QMS process must match ${input.reference_value}.` };
    return { valid: true, sequence_no: "000" };
  }

  if (rule.code === "SOP") {
    if (isIncomingSop(input)) {
      const expectedPartCode = sanitizeCompact(input.reference_value);
      const match = documentNo.match(/^XQS-([A-Z0-9-]+)$/);
      if (!match) return { valid: false, error: `Incoming SOP document no must look like XQS-${expectedPartCode}.` };
      if (match[1] !== expectedPartCode) return { valid: false, error: `Incoming SOP part code must match ${expectedPartCode}.` };
      return { valid: true, sequence_no: "000" };
    }
    const match = documentNo.match(/^XQS-(\d{2})-(\d{3})$/);
    if (!match) return { valid: false, error: `SOP document no must look like XQS-${input.reference_value}-001.` };
    if (match[1] !== input.reference_value) return { valid: false, error: `SOP process must match ${input.reference_value}.` };
    return { valid: true, sequence_no: match[2] };
  }

  return { valid: false, error: "Unsupported document no format." };
}

function requiresSequenceForInput(rule, input) {
  if (!rule.requiresSequence) return false;
  if (rule.code === "EC") return isSequencedEcType(input);
  if (rule.code === "QMS") return (input.detail_type || "QP") === "QT";
  if (rule.code === "SOP") return !isIncomingSop(input);
  return true;
}

async function getNextAvailableSequence(rule, input) {
  const prefix = buildSequencePrefix(rule, input);
  if (!prefix) return "000";

  let candidate = Math.max((await getMaxSequenceForPrefix(prefix)) + 1, 1);
  while (candidate <= 999) {
    const sequenceNo = formatSequenceForInput(rule, input, candidate);
    const documentNo = buildDocumentNo(rule, input, sequenceNo);
    if (!(await isDocumentNoUnavailable(documentNo))) return sequenceNo;
    candidate += 1;
  }

  throw httpError(409, "sequence_exhausted", `No available sequence remains for ${prefix}.`);
}

function buildSequencePrefix(rule, input) {
  if (["D", "R", "MD", "MR"].includes(rule.code)) return `${rule.prefix}-${input.year_yy}-`;
  if (rule.code === "EC" && isSequencedEcType(input)) return `${rule.prefix}-${input.year_yy}${input.detail_code || "A"}-${formatEcType(input.detail_type || "R")}-`;
  if (rule.code === "QMS" && (input.detail_type || "QP") === "QT") return `XQT-${input.reference_value}-`;
  if (rule.code === "SOP" && !isIncomingSop(input)) return `XQS-${input.reference_value}-`;
  return "";
}

async function getMaxSequenceForPrefix(prefix) {
  const rows = [
    ...(await db.prepare("SELECT document_no FROM document_records WHERE document_no LIKE ?").all(`${prefix}%`)),
    ...(await db.prepare("SELECT document_no FROM document_requests WHERE status = 'pending' AND document_no LIKE ?").all(`${prefix}%`))
  ];
  let max = 0;
  for (const row of rows) {
    const match = String(row.document_no || "").match(/(\d{2,3})$/);
    if (match) max = Math.max(max, Number(match[1]));
  }
  return max;
}

async function isDocumentNoUnavailable(documentNo, ignoreRequestId = null) {
  if (!documentNo) return false;
  if (await isDocumentNoApprovedElsewhere(documentNo)) return true;
  const pending = await db.prepare(`
    SELECT id
    FROM document_requests
    WHERE status = 'pending'
      AND document_no = ?
      AND (? IS NULL OR id <> ?)
    LIMIT 1
  `).get(documentNo, ignoreRequestId, ignoreRequestId);
  return Boolean(pending);
}

async function isDocumentNoApprovedElsewhere(documentNo) {
  if (!documentNo) return false;
  const row = await db.prepare("SELECT id FROM document_records WHERE document_no = ? LIMIT 1").get(documentNo);
  return Boolean(row);
}

async function bumpSequenceAfterApproval(rule, input, sequenceNo) {
  if (!sequenceNo || sequenceNo === "000") return;
  const prefix = buildSequencePrefix(rule, input);
  if (!prefix) return;
  const scopeKey = prefix.slice(0, -1);
  const nextSequence = Number(sequenceNo) + 1;
  const existing = await db.prepare("SELECT next_sequence FROM document_sequences WHERE scope_key = ?").get(scopeKey);
  if (!existing) {
    await db.prepare(`
      INSERT INTO document_sequences (scope_key, category, year_yy, next_sequence, updated_at)
      VALUES (?, ?, ?, ?, ?)
    `).run(scopeKey, rule.code, input.year_yy, nextSequence, nowIso());
    return;
  }
  if (Number(existing.next_sequence) <= Number(sequenceNo)) {
    await db.prepare(`
      UPDATE document_sequences
      SET next_sequence = ?, updated_at = ?
      WHERE scope_key = ?
    `).run(nextSequence, nowIso(), scopeKey);
  }
}

function buildMarketingId(input) {
  const brand = sanitizeCompact(input.reference_value).replaceAll("-", "");
  const year = input.creation_date.slice(2, 4);
  const materialType = normalizeMarketingMaterialType(input.detail_type || "BR");
  const serialNo = input.detail_code || "01";
  const language = input.language || "EN";
  const version = input.detail_version || "1";
  return `XERA-${brand}-${year}${materialType}${serialNo}-${language}V${version}`;
}

function formatEcType(value) {
  return String(value || "R").toUpperCase() === "RR" ? "Rr" : String(value || "R").toUpperCase();
}

function isSequencedEcType(input) {
  return formatEcType(input.detail_type || "R") === "Rr";
}

function isIncomingSop(input) {
  return String(input.detail_type || "").toUpperCase() === "INCOMING";
}

function isIncomingSopPartCode(value) {
  return /^[A-Z0-9]{4}-[1-9]\d{3}$/.test(sanitizeCompact(value));
}

function normalizeMarketingMaterialType(value) {
  const compact = sanitizeCompact(value || "BR");
  return MARKETING_TYPE_ALIASES[compact] || compact;
}

function formatSequenceForInput(rule, input, value) {
  const width = rule.code === "QMS" && (input.detail_type || "QP") === "QT" ? 2 : 3;
  return String(value).padStart(width, "0");
}

async function getRequestById(id) {
  return await db.prepare("SELECT * FROM document_requests WHERE id = ?").get(id);
}

async function getDocumentById(id) {
  return await db.prepare("SELECT * FROM document_records WHERE id = ? AND deleted_at IS NULL").get(id);
}

async function getDocumentByRequestId(requestId) {
  return await db.prepare("SELECT * FROM document_records WHERE request_id = ? AND deleted_at IS NULL").get(requestId);
}

async function listCurrentDocuments(options = {}) {
  const pendingRevisionColumn = options.includePendingRevision
    ? `,
      (
        SELECT rr.id
        FROM document_revision_requests rr
        WHERE rr.document_record_id = dr.id
          AND rr.status = 'pending'
        LIMIT 1
      ) AS pending_revision_request_id,
      (
        SELECT n.id
        FROM notifications n
        WHERE n.type = 'document_edit_request'
          AND n.entity_type = 'document_record'
          AND n.entity_id = dr.id
          AND n.status IN ('unread', 'read')
        LIMIT 1
      ) AS pending_edit_request_id`
    : "";

  return await db.prepare(`
    SELECT
      dr.*,
      req.requested_by_user_id,
      requester.display_name AS requested_by,
      au.display_name AS checked_by,
      ru.display_name AS revision_updated_by
      ${pendingRevisionColumn}
    FROM document_records dr
    LEFT JOIN document_requests req ON req.id = dr.request_id
    LEFT JOIN users requester ON requester.id = req.requested_by_user_id
    LEFT JOIN users au ON au.id = dr.approved_by_user_id
    LEFT JOIN users ru ON ru.id = dr.revision_updated_by_user_id
    WHERE dr.deleted_at IS NULL
    ORDER BY dr.approved_at DESC, dr.id DESC
  `).all();
}

async function listRevisionArchive() {
  return await db.prepare(`
    SELECT dra.*, u.display_name AS revision_changed_by, au.display_name AS checked_by
    FROM document_revision_archive dra
    LEFT JOIN users u ON u.id = dra.revision_changed_by_user_id
    LEFT JOIN users au ON au.id = dra.approved_by_user_id
    ORDER BY dra.revision_changed_at DESC, dra.id DESC
  `).all();
}

async function deleteDocumentRecord(documentId, user, body = {}) {
  requireDeleteConfirmation(body);

  const before = await getDocumentById(documentId);
  if (!before) throw httpError(404, "not_found", "Document record not found.");

  const now = nowIso();
  return await db.transaction(async () => {
    await db.prepare(`
      UPDATE document_revision_requests
      SET status = 'rejected',
          reject_reason = 'Source document was deleted.',
          decided_by_user_id = ?,
          decided_at = ?,
          updated_at = ?
      WHERE document_record_id = ?
        AND status = 'pending'
    `).run(user.id, now, now, documentId);

    await db.prepare(`
      UPDATE document_records
      SET deleted_at = ?,
          deleted_by_user_id = ?
      WHERE id = ?
        AND deleted_at IS NULL
    `).run(now, user.id, documentId);

    const after = {
      ...before,
      deleted_at: now,
      deleted_by_user_id: user.id,
      deleted_by: user.display_name
    };
    const deletedItem = await insertDeletedItem("document", documentId, before.document_no, before, user, now);
    await insertAudit(user.id, "document_record", documentId, "document.deleted", before, after);
    return { deleted_item: deletedItem };
  });
}

function requireDeleteConfirmation(body) {
  if (body.confirm !== true) {
    throw httpError(422, "delete_confirmation_required", "Please confirm that you want to delete this record.");
  }
}

async function insertDeletedItem(entityType, entityId, displayKey, record, user, deletedAt) {
  const result = await db.prepare(`
    INSERT INTO deleted_items (
      entity_type, entity_id, display_key, record_json, deleted_by_user_id, deleted_at
    )
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(
    entityType,
    entityId,
    displayKey,
    JSON.stringify(record),
    user.id,
    deletedAt
  );

  return await getDeletedItemById(Number(result.lastInsertRowid));
}

async function getDeletedItemById(id) {
  const row = await db.prepare(`
    SELECT di.*, u.display_name AS deleted_by
    FROM deleted_items di
    LEFT JOIN users u ON u.id = di.deleted_by_user_id
    WHERE di.id = ?
  `).get(id);
  return normalizeDeletedItem(row);
}

async function listDeletedItems(user, requestedType = "") {
  const allowedTypes = [];
  if (userHasPermission(user, "document_admin")) allowedTypes.push("document");
  if (userHasPermission(user, "part_admin")) allowedTypes.push("part");
  const type = String(requestedType || "").trim().toLowerCase();
  const types = type ? allowedTypes.filter(allowedType => allowedType === type) : allowedTypes;
  if (types.length === 0) return [];

  const placeholders = types.map(() => "?").join(", ");
  const rows = await db.prepare(`
    SELECT di.*, u.display_name AS deleted_by
    FROM deleted_items di
    LEFT JOIN users u ON u.id = di.deleted_by_user_id
    WHERE di.entity_type IN (${placeholders})
    ORDER BY di.deleted_at DESC, di.id DESC
  `).all(...types);

  return rows.map(normalizeDeletedItem).filter(Boolean);
}

function normalizeDeletedItem(row) {
  if (!row) return null;
  return {
    ...row,
    record: safeParseJson(row.record_json) || {}
  };
}

async function listMyNotifications(user) {
  return await db.prepare(`
    SELECT n.*, su.display_name AS source_name, au.display_name AS acted_by
    FROM notifications n
    LEFT JOIN users su ON su.id = n.source_user_id
    LEFT JOIN users au ON au.id = n.acted_by_user_id
    WHERE n.recipient_user_id = ?
      AND n.status IN ('unread', 'read')
    ORDER BY n.created_at DESC, n.id DESC
    LIMIT 100
  `).all(user.id);
}

async function listAdminNotifications(user) {
  return await db.prepare(`
    SELECT n.*, su.display_name AS source_name, au.display_name AS acted_by
    FROM notifications n
    LEFT JOIN users su ON su.id = n.source_user_id
    LEFT JOIN users au ON au.id = n.acted_by_user_id
    WHERE n.recipient_user_id = ?
      AND n.status IN ('unread', 'read')
      AND n.type IN ('document_auto_published', 'document_edit_request', 'part_auto_published', 'part_edit_request')
    ORDER BY n.created_at ASC, n.id ASC
    LIMIT 100
  `).all(user.id);
}

async function markNotificationRead(notificationId, user) {
  const before = await getNotificationById(notificationId);
  if (!before || Number(before.recipient_user_id) !== Number(user.id)) {
    throw httpError(404, "not_found", "Notification not found.");
  }
  if (before.status === "unread") {
    await db.prepare(`
      UPDATE notifications
      SET status = 'read',
          read_at = ?
      WHERE id = ?
    `).run(nowIso(), notificationId);
  }
  return await getNotificationById(notificationId);
}

async function adminOkayNotification(notificationId, user) {
  return await db.transaction(async () => {
    const notification = await getAdminReviewNotification(notificationId, user);
    const result = notification.entity_type === "document_record"
      ? await markDocumentNotificationOkay(notification, user)
      : await markPartNotificationOkay(notification, user);

    await completeRelatedReviewNotifications(notification, user);
    await notifyRequesterOfAdminReview(notification, user, result, "okay");
    return {
      notification: await getNotificationById(notificationId),
      ...notificationResultPayload(result)
    };
  });
}

async function adminEditNotification(notificationId, user, body) {
  return await db.transaction(async () => {
    const notification = await getAdminReviewNotification(notificationId, user);
    const result = notification.entity_type === "document_record"
      ? await editDocumentFromNotification(notification, user, body)
      : await editPartFromNotification(notification, user, body);

    await completeRelatedReviewNotifications(notification, user);
    await notifyRequesterOfAdminReview(notification, user, result, "edit");
    return {
      notification: await getNotificationById(notificationId),
      ...notificationResultPayload(result)
    };
  });
}

async function adminRejectNotification(notificationId, user, reason) {
  return await db.transaction(async () => {
    const notification = await getAdminReviewNotification(notificationId, user);
    let result = null;
    if (notification.entity_type === "document_record") {
      result = notification.type === "document_auto_published"
        ? await rejectAutoPublishedDocumentNotification(notification, user, reason)
        : await rejectDocumentEditNotification(notification, user, reason);
    } else if (notification.entity_type === "part_record") {
      result = notification.type === "part_auto_published"
        ? await rejectAutoPublishedPartNotification(notification, user, reason)
        : await rejectPartEditNotification(notification, user, reason);
    } else {
      throw httpError(422, "unsupported_notification", "This notification cannot be rejected here.");
    }

    await completeRelatedReviewNotifications(notification, user);
    await notifyRequesterOfAdminReview(notification, user, result, "reject");
    return {
      notification: await getNotificationById(notificationId),
      ...notificationResultPayload(result)
    };
  });
}

async function getAdminReviewNotification(notificationId, user) {
  const notification = await getNotificationById(notificationId);
  if (!notification || Number(notification.recipient_user_id) !== Number(user.id)) {
    throw httpError(404, "not_found", "Notification not found.");
  }
  if (notification.status === "done") {
    throw httpError(409, "notification_done", "This notification has already been completed.");
  }
  if (notification.entity_type === "document_record") {
    if (!userHasPermission(user, "document_admin")) {
      throw httpError(403, "forbidden", "Document List Admin permission is required.");
    }
    return notification;
  }
  if (notification.entity_type === "part_record") {
    if (!userHasPermission(user, "part_admin")) {
      throw httpError(403, "forbidden", "Part List Admin permission is required.");
    }
    return notification;
  }
  throw httpError(422, "unsupported_notification", "This notification cannot be reviewed here.");
}

async function markDocumentNotificationOkay(notification, user) {
  if (notification.type === "document_edit_request") {
    return await applyDocumentEditNotification(notification, user, null, "document.edit_request.approved");
  }

  const before = await getDocumentById(notification.entity_id);
  if (!before) throw httpError(404, "not_found", "Document record not found.");
  const request = before.request_id ? await getRequestById(before.request_id) : null;
  const now = nowIso();

  await db.prepare(`
    UPDATE document_records
    SET approved_by_user_id = ?,
        approved_at = ?
    WHERE id = ?
  `).run(user.id, now, before.id);

  if (request) {
    await db.prepare(`
      UPDATE document_requests
      SET approved_by_user_id = ?,
          approved_at = ?,
          updated_at = ?
      WHERE id = ?
    `).run(user.id, now, now, request.id);
  }

  const after = await getDocumentById(before.id);
  await insertAudit(user.id, "document_record", before.id, "document.notification_okay", before, after);
  return { domain: "document", document: after, requesterId: request ? request.requested_by_user_id : notification.source_user_id };
}

async function markPartNotificationOkay(notification, user) {
  if (notification.type === "part_edit_request") {
    return await applyPartEditNotification(notification, user, null, "part.edit_request.approved");
  }

  const before = await getPartRecordById(notification.entity_id);
  if (!before) throw httpError(404, "not_found", "Part record not found.");
  const request = before.request_id ? await getPartRequestById(before.request_id) : null;
  const now = nowIso();

  await db.prepare(`
    UPDATE part_records
    SET approved_by_user_id = ?,
        approved_at = ?
    WHERE id = ?
  `).run(user.id, now, before.id);

  if (request) {
    await db.prepare(`
      UPDATE part_requests
      SET approved_by_user_id = ?,
          approved_at = ?,
          updated_at = ?
      WHERE id = ?
    `).run(user.id, now, now, request.id);
  }

  const after = await getPartRecordById(before.id);
  await insertAudit(user.id, "part_record", before.id, "part.notification_okay", before, after);
  return { domain: "part", part: after, requesterId: before.requested_by_user_id || notification.source_user_id };
}

async function editDocumentFromNotification(notification, user, body) {
  return await applyDocumentEditNotification(notification, user, body, "document.notification_edited");
}

async function editPartFromNotification(notification, user, body) {
  return await applyPartEditNotification(notification, user, body, "part.notification_edited");
}

async function applyDocumentEditNotification(notification, user, body = null, auditAction = "document.notification_edited") {
  const metadata = safeParseJson(notification.metadata_json) || {};
  const editBody = body || {
    category: metadata.category,
    company_code: metadata.company_code,
    year_yy: metadata.year_yy,
    sequence_no: metadata.sequence_no,
    document_no: metadata.document_no,
    revision: metadata.revision,
    reference_type: metadata.reference_type,
    reference_value: metadata.reference_value,
    document_name: metadata.document_name,
    written_by: metadata.written_by,
    creation_date: metadata.creation_date,
    control_status: metadata.control_status,
    generated_filename: metadata.generated_filename,
    detail_type: metadata.detail_type,
    detail_code: metadata.detail_code,
    detail_version: metadata.detail_version,
    language: metadata.language
  };

  const result = await updateDocumentRecordDetails(notification.entity_id, user, editBody, {
    reviewedByAdmin: true,
    auditAction
  });

  return {
    ...result,
    requesterId: metadata.requested_by_user_id || result.requesterId || notification.source_user_id
  };
}

async function applyPartEditNotification(notification, user, body = null, auditAction = "part.notification_edited") {
  const metadata = safeParseJson(notification.metadata_json) || {};
  const editBody = body || {
    project_code: metadata.project_code,
    main_code: metadata.main_code,
    sequence_no: metadata.sequence_no,
    part_number: metadata.part_number,
    revision_code: metadata.revision_code,
    revision_mode: metadata.revision_mode,
    part_name: metadata.part_name,
    description: metadata.description,
    main_category: metadata.main_category,
    sub_category: metadata.sub_category
  };

  const result = await updatePartRecordDetails(notification.entity_id, user, editBody, {
    reviewedByAdmin: true,
    auditAction
  });

  return {
    ...result,
    requesterId: metadata.requested_by_user_id || result.requesterId || notification.source_user_id
  };
}

async function rejectAutoPublishedDocumentNotification(notification, user, reason) {
  const before = await getDocumentById(notification.entity_id);
  if (!before) throw httpError(404, "not_found", "Document record not found.");
  const request = before.request_id ? await getRequestById(before.request_id) : null;
  const now = nowIso();
  const cleanReason = sanitizeText(reason || "Rejected by Document List Admin.");

  await db.prepare(`
    UPDATE document_revision_requests
    SET status = 'rejected',
        reject_reason = 'Source document was rejected.',
        decided_by_user_id = ?,
        decided_at = ?,
        updated_at = ?
    WHERE document_record_id = ?
      AND status = 'pending'
  `).run(user.id, now, now, before.id);

  await db.prepare(`
    UPDATE document_records
    SET deleted_at = ?,
        deleted_by_user_id = ?
    WHERE id = ?
      AND deleted_at IS NULL
  `).run(now, user.id, before.id);

  if (request) {
    await db.prepare(`
      UPDATE document_requests
      SET status = 'rejected',
          reject_reason = ?,
          approved_by_user_id = ?,
          approved_at = ?,
          updated_at = ?
      WHERE id = ?
    `).run(cleanReason, user.id, now, now, request.id);
  }

  const after = {
    ...before,
    deleted_at: now,
    deleted_by_user_id: user.id,
    deleted_by: user.display_name
  };
  await insertDeletedItem("document", before.id, before.document_no, before, user, now);
  await insertAudit(user.id, "document_record", before.id, "document.notification_rejected", before, after);

  return {
    domain: "document",
    document: before,
    requesterId: request ? request.requested_by_user_id : notification.source_user_id,
    reason: cleanReason
  };
}

async function rejectDocumentEditNotification(notification, user, reason) {
  if (notification.type !== "document_edit_request") {
    throw httpError(422, "unsupported_notification", "This document notification cannot be rejected.");
  }
  const documentRecord = await getDocumentById(notification.entity_id);
  if (!documentRecord) throw httpError(404, "not_found", "Document record not found.");
  const metadata = safeParseJson(notification.metadata_json) || {};
  const cleanReason = sanitizeText(reason || "Rejected by Document List Admin.");

  await insertAudit(user.id, "document_record", documentRecord.id, "document.edit_request.rejected", metadata, {
    document_id: documentRecord.id,
    reason: cleanReason
  });

  return {
    domain: "document",
    document: documentRecord,
    requesterId: metadata.requested_by_user_id || notification.source_user_id,
    reason: cleanReason
  };
}

async function rejectAutoPublishedPartNotification(notification, user, reason) {
  const before = await getPartRecordById(notification.entity_id);
  if (!before) throw httpError(404, "not_found", "Part record not found.");
  const request = before.request_id ? await getPartRequestById(before.request_id) : null;
  const now = nowIso();
  const cleanReason = sanitizePartDescription(reason || "Rejected by Part List Admin.");

  await db.prepare(`
    UPDATE part_revision_requests
    SET status = 'rejected',
        reject_reason = 'Source part was rejected.',
        decided_by_user_id = ?,
        decided_at = ?,
        updated_at = ?
    WHERE part_record_id = ?
      AND status = 'pending'
  `).run(user.id, now, now, before.id);

  await db.prepare(`
    UPDATE part_records
    SET deleted_at = ?,
        deleted_by_user_id = ?
    WHERE id = ?
      AND deleted_at IS NULL
  `).run(now, user.id, before.id);

  if (request) {
    await db.prepare(`
      UPDATE part_requests
      SET status = 'rejected',
          reject_reason = ?,
          approved_by_user_id = ?,
          approved_at = ?,
          updated_at = ?
      WHERE id = ?
    `).run(cleanReason, user.id, now, now, request.id);
  }

  const after = {
    ...before,
    deleted_at: now,
    deleted_by_user_id: user.id,
    deleted_by: user.display_name
  };
  await insertDeletedItem("part", before.id, before.part_number, before, user, now);
  await insertAudit(user.id, "part_record", before.id, "part.notification_rejected", before, after);

  return {
    domain: "part",
    part: before,
    requesterId: request ? request.requested_by_user_id : before.requested_by_user_id || notification.source_user_id,
    reason: cleanReason
  };
}

async function rejectPartEditNotification(notification, user, reason) {
  if (notification.type !== "part_edit_request") {
    throw httpError(422, "unsupported_notification", "This part notification cannot be rejected.");
  }
  const part = await getPartRecordById(notification.entity_id);
  if (!part) throw httpError(404, "not_found", "Part record not found.");
  const metadata = safeParseJson(notification.metadata_json) || {};
  const cleanReason = sanitizePartDescription(reason || "Rejected by Part List Admin.");

  await insertAudit(user.id, "part_record", part.id, "part.edit_request.rejected", metadata, {
    part_id: part.id,
    reason: cleanReason
  });

  return {
    domain: "part",
    part,
    requesterId: metadata.requested_by_user_id || notification.source_user_id || part.requested_by_user_id,
    reason: cleanReason
  };
}

async function notifyAdminsOfAutoPublished(domain, requester, request, record) {
  const permission = domain === "document" ? "document_admin" : "part_admin";
  const admins = await listUsersWithPermission(permission);
  const entityType = domain === "document" ? "document_record" : "part_record";
  const entityId = record.id;
  const label = domain === "document" ? record.document_no : record.part_number;
  const title = domain === "document" ? "New document auto-published" : "New part code auto-published";
  const body = `${label} was created by ${requester.display_name} and is available for review.`;

  for (const admin of admins) {
    await createNotification({
      recipientUserId: admin.id,
      sourceUserId: requester.id,
      type: `${domain}_auto_published`,
      entityType,
      entityId,
      relatedRequestId: request.id,
      title,
      body,
      metadata: {
        domain,
        label,
        request_id: request.id,
        created_by: requester.display_name,
        ...(domain === "document" ? {
          document_no: record.document_no,
          generated_filename: record.generated_filename,
          document_name: record.document_name,
          reference_value: record.reference_value,
          category: record.category,
          company_code: record.company_code,
          year_yy: record.year_yy,
          sequence_no: record.sequence_no,
          revision: record.revision,
          reference_type: record.reference_type,
          written_by: record.written_by,
          creation_date: record.creation_date,
          control_status: record.control_status
        } : {
          part_number: record.part_number,
          part_name: record.part_name,
          description: record.description,
          main_category: record.main_category,
          sub_category: record.sub_category
        })
      }
    });
  }
}

async function notifyRequesterOfAdminReview(notification, admin, result, action) {
  const requesterId = result.requesterId || notification.source_user_id;
  if (!requesterId) return;

  const label = result.domain === "document"
    ? result.document.document_no
    : result.part.part_number;
  const title = action === "edit"
    ? `${capitalize(result.domain)} reviewed with edits`
    : action === "reject"
      ? `${capitalize(result.domain)} review rejected`
      : `${capitalize(result.domain)} reviewed`;
  const body = action === "edit"
    ? `${admin.display_name} reviewed and edited ${label}.`
    : action === "reject"
      ? `${admin.display_name} rejected ${label}.${result.reason ? ` Reason: ${result.reason}` : ""}`
      : `${admin.display_name} marked ${label} as OK.`;

  await createNotification({
    recipientUserId: requesterId,
    sourceUserId: admin.id,
    type: `${result.domain}_review_${action}`,
    entityType: notification.entity_type,
    entityId: notification.entity_id,
    relatedRequestId: notification.related_request_id,
    title,
    body,
    metadata: {
      domain: result.domain,
      label,
      admin: admin.display_name,
      action,
      reason: result.reason || ""
    }
  });
}

async function notifyPartRequestDecision(request, admin, decision, part = null) {
  if (!request || !request.requested_by_user_id) return;

  const isApproved = decision === "approved";
  const label = request.part_number || `Part request #${request.id}`;
  const reason = request.reject_reason || "";
  const body = isApproved
    ? `${label} was approved by ${admin.display_name}.`
    : `${label} was rejected by ${admin.display_name}.${reason ? ` Reason: ${reason}` : ""}`;

  await createNotification({
    recipientUserId: request.requested_by_user_id,
    sourceUserId: admin.id,
    type: `part_request_${decision}`,
    entityType: isApproved && part ? "part_record" : "part_request",
    entityId: isApproved && part ? part.id : request.id,
    relatedRequestId: request.id,
    title: isApproved ? "Part request approved" : "Part request rejected",
    body,
    metadata: {
      domain: "part",
      kind: "part_request",
      action: decision,
      label,
      request_id: request.id,
      part_number: request.part_number,
      part_name: request.part_name,
      reason
    }
  });
}

async function notifyPartRevisionDecision(revisionRequest, admin, decision, part = null) {
  if (!revisionRequest || !revisionRequest.requested_by_user_id) return;

  const isApproved = decision === "approved";
  const label = revisionRequest.requested_part_number || `Part revision request #${revisionRequest.id}`;
  const reason = revisionRequest.reject_reason || "";
  const body = isApproved
    ? `${label} was approved by ${admin.display_name}.`
    : `${label} was rejected by ${admin.display_name}.${reason ? ` Reason: ${reason}` : ""}`;

  await createNotification({
    recipientUserId: revisionRequest.requested_by_user_id,
    sourceUserId: admin.id,
    type: `part_revision_${decision}`,
    entityType: isApproved && part ? "part_record" : "part_revision_request",
    entityId: isApproved && part ? part.id : revisionRequest.id,
    relatedRequestId: revisionRequest.id,
    title: isApproved ? "Part revision approved" : "Part revision rejected",
    body,
    metadata: {
      domain: "part",
      kind: "part_revision_request",
      action: decision,
      label,
      request_id: revisionRequest.id,
      current_part_number: revisionRequest.current_part_number,
      requested_part_number: revisionRequest.requested_part_number,
      requested_revision_code: revisionRequest.requested_revision_code,
      reason
    }
  });
}

async function createNotification(input) {
  const now = nowIso();
  const result = await db.prepare(`
    INSERT INTO notifications (
      recipient_user_id, source_user_id, type, entity_type, entity_id,
      related_request_id, status, title, body, metadata_json, created_at
    )
    VALUES (?, ?, ?, ?, ?, ?, 'unread', ?, ?, ?, ?)
  `).run(
    input.recipientUserId,
    input.sourceUserId || null,
    input.type,
    input.entityType,
    input.entityId,
    input.relatedRequestId || null,
    input.title,
    input.body,
    JSON.stringify(input.metadata || {}),
    now
  );
  return await getNotificationById(Number(result.lastInsertRowid));
}

async function completeRelatedReviewNotifications(notification, user) {
  const now = nowIso();
  await db.prepare(`
    UPDATE notifications
    SET status = 'done',
        done_at = ?,
        acted_by_user_id = ?
    WHERE type = ?
      AND entity_type = ?
      AND entity_id = ?
      AND status <> 'done'
  `).run(now, user.id, notification.type, notification.entity_type, notification.entity_id);
}

async function getNotificationById(id) {
  return await db.prepare("SELECT * FROM notifications WHERE id = ?").get(id);
}

async function listUsersWithPermission(permission) {
  const users = await db.prepare("SELECT * FROM users ORDER BY id ASC").all();
  return users.filter(user => userHasPermission(user, permission));
}

function notificationResultPayload(result) {
  return result.domain === "document"
    ? { document: result.document }
    : { part: result.part };
}

function canEditDocumentReferenceValue(documentRecord) {
  return ["D", "R", "MD", "MR", "EC"].includes(documentRecord.category);
}

function hasOwn(object, key) {
  return Object.prototype.hasOwnProperty.call(object || {}, key);
}

function capitalize(value) {
  const text = String(value || "");
  return text ? `${text.slice(0, 1).toUpperCase()}${text.slice(1)}` : "";
}

async function getUserOverview(user) {
  const requestStats = await db.prepare(`
    SELECT
      SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) AS pending,
      SUM(CASE WHEN status = 'approved' THEN 1 ELSE 0 END) AS approved,
      COUNT(*) AS total
    FROM document_requests
    WHERE requested_by_user_id = ?
  `).get(user.id);

  const sequenceStats = await db.prepare(`
    SELECT COUNT(*) AS total
    FROM (
      SELECT DISTINCT category, year_yy
      FROM document_requests
      WHERE requested_by_user_id = ?
        AND sequence_no IS NOT NULL
        AND sequence_no <> '000'
    )
  `).get(user.id);

  const auditStats = await db.prepare(`
    SELECT COUNT(*) AS total
    FROM audit_logs al
    WHERE al.actor_user_id = ?
       OR (
         al.entity_type = 'document_request'
         AND al.entity_id IN (
           SELECT id
           FROM document_requests
           WHERE requested_by_user_id = ?
         )
       )
       OR (
         al.entity_type = 'revision_request'
         AND al.entity_id IN (
           SELECT id
           FROM document_revision_requests
           WHERE requested_by_user_id = ?
         )
       )
  `).get(user.id, user.id, user.id);

  return {
    pending: Number(requestStats.pending || 0),
    approved: Number(requestStats.approved || 0),
    published: Number(requestStats.approved || 0),
    sequences: Number(sequenceStats.total || 0),
    audit_events: Number(auditStats.total || 0),
    total_requests: Number(requestStats.total || 0)
  };
}

async function listManagedUsers() {
  return (await db.prepare(`
    SELECT
      u.id,
      u.username,
      u.email,
      u.display_name,
      u.position,
      u.role,
      u.permissions_json,
      u.department,
      u.created_at,
      COUNT(s.id) AS active_sessions
    FROM users u
    LEFT JOIN user_sessions s
      ON s.user_id = u.id
      AND s.expires_at > ?
    GROUP BY u.id
    ORDER BY
      CASE WHEN u.permissions_json IS NOT NULL AND u.permissions_json <> '[]' THEN 1 ELSE 2 END ASC,
      u.display_name ASC
  `).all(nowIso())).map(row => ({
    ...publicUser(row),
    created_at: row.created_at,
    active_sessions: row.active_sessions
  }));
}

async function getAdminTaskSummary(user) {
  const documentRevisionRequests = userHasPermission(user, "document_admin")
    ? Number((await db.prepare("SELECT COUNT(*) AS count FROM document_revision_requests WHERE status = 'pending'").get()).count || 0)
    : 0;
  const partRevisionRequests = userHasPermission(user, "part_admin")
    ? Number((await db.prepare("SELECT COUNT(*) AS count FROM part_revision_requests WHERE status = 'pending'").get()).count || 0)
    : 0;
  const legacyDocumentRequests = userHasPermission(user, "document_admin")
    ? Number((await db.prepare("SELECT COUNT(*) AS count FROM document_requests WHERE status = 'pending'").get()).count || 0)
    : 0;
  const legacyPartRequests = userHasPermission(user, "part_admin")
    ? Number((await db.prepare("SELECT COUNT(*) AS count FROM part_requests WHERE status = 'pending'").get()).count || 0)
    : 0;
  const reviewNotifications = Number((await db.prepare(`
    SELECT COUNT(*) AS count
    FROM notifications
    WHERE recipient_user_id = ?
      AND status IN ('unread', 'read')
      AND type IN ('document_auto_published', 'document_edit_request', 'part_auto_published', 'part_edit_request')
  `).get(user.id)).count || 0);

  return {
    legacy_document_requests: legacyDocumentRequests,
    document_revision_requests: documentRevisionRequests,
    legacy_part_requests: legacyPartRequests,
    part_revision_requests: partRevisionRequests,
    review_notifications: reviewNotifications,
    total: documentRevisionRequests + partRevisionRequests + reviewNotifications
  };
}

async function adminCreateUser(body, actor) {
  const input = normalizeManagedUserInput(body, { requirePassword: true });
  validateManagedUserInput(input, { requirePassword: true });

  const existing = await db.prepare("SELECT id FROM users WHERE email = ? OR username = ?").get(input.email, input.username);
  if (existing) throw httpError(409, "user_exists", "This email is already registered.");

  const passwordRecord = hashPassword(input.password);
  const now = nowIso();
  const result = await db.prepare(`
    INSERT INTO users (
      username, email, display_name, position, role, permissions_json, department,
      password_hash, password_salt, created_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    input.username,
    input.email,
    input.displayName,
    input.position,
    input.role,
    JSON.stringify(input.permissions),
    input.department,
    passwordRecord.hash,
    passwordRecord.salt,
    now
  );

  const created = await getUserById(Number(result.lastInsertRowid));
  await insertAudit(actor.id, "user", created.id, "user.created", null, publicUser(created));
  return { user: publicUser(created) };
}

async function adminUpdateUser(userId, actor, body) {
  const before = await getUserById(userId);
  if (!before) throw httpError(404, "not_found", "User not found.");

  const input = normalizeManagedUserInput(body, { fallback: before });
  validateManagedUserInput(input, { requirePassword: false });

  if (before.id === actor.id && !permissionsHave(input.permissions, "user_admin")) {
    throw httpError(422, "validation_failed", "You cannot remove your own user management permission.");
  }

  const existing = await db.prepare(`
    SELECT id
    FROM users
    WHERE (email = ? OR username = ?)
      AND id <> ?
    LIMIT 1
  `).get(input.email, input.username, before.id);
  if (existing) throw httpError(409, "user_exists", "This email is already registered.");

  await db.prepare(`
    UPDATE users
    SET username = ?,
        email = ?,
        display_name = ?,
        position = ?,
        role = ?,
        permissions_json = ?,
        department = ?
    WHERE id = ?
  `).run(
    input.username,
    input.email,
    input.displayName,
    input.position,
    input.role,
    JSON.stringify(input.permissions),
    input.department,
    before.id
  );

  const after = await getUserById(before.id);
  await insertAudit(actor.id, "user", after.id, "user.updated", publicUser(before), publicUser(after));
  return { user: publicUser(after) };
}

async function adminSetUserPassword(userId, actor, body) {
  const target = await getUserById(userId);
  if (!target) throw httpError(404, "not_found", "User not found.");

  const password = String(body.password || body.new_password || body.newPassword || "");
  if (password.length < 8) throw httpError(422, "validation_failed", "Password must be at least 8 characters.");

  const passwordRecord = hashPassword(password);
  await db.prepare(`
    UPDATE users
    SET password_hash = ?,
        password_salt = ?
    WHERE id = ?
  `).run(passwordRecord.hash, passwordRecord.salt, target.id);

  if (target.id !== actor.id) {
    await db.prepare("DELETE FROM user_sessions WHERE user_id = ?").run(target.id);
  }

  await insertAudit(actor.id, "user", target.id, "user.password_reset", null, publicUser(target));
  return { ok: true, user: publicUser(await getUserById(target.id)) };
}

function normalizeManagedUserInput(body, options = {}) {
  const fallback = options.fallback || {};
  const email = normalizeEmail(body.email ?? fallback.email ?? "");
  const position = sanitizeText(body.position ?? fallback.position ?? "");
  const hasPermissionInput = Object.prototype.hasOwnProperty.call(body, "permissions")
    || Object.prototype.hasOwnProperty.call(body, "admin_permissions")
    || Object.prototype.hasOwnProperty.call(body, "adminPermissions");
  const hasRoleInput = Object.prototype.hasOwnProperty.call(body, "role");
  const permissions = hasPermissionInput
    ? normalizePermissions(body.permissions ?? body.admin_permissions ?? body.adminPermissions)
    : hasRoleInput
      ? permissionsFromRole(body.role)
      : effectiveUserPermissions(fallback);
  return {
    username: buildUsernameFromEmail(email),
    email,
    displayName: sanitizeText(body.display_name ?? body.displayName ?? body.full_name ?? body.fullName ?? fallback.display_name ?? ""),
    position,
    role: deriveRoleFromPermissions(permissions, body.role ?? fallback.role),
    permissions,
    department: sanitizeText(body.department ?? fallback.department ?? position),
    password: String(body.password ?? "")
  };
}

function validateManagedUserInput(input, options = {}) {
  if (!input.displayName) throw httpError(422, "validation_failed", "Full name is required.");
  if (!input.position) throw httpError(422, "validation_failed", "Position is required.");
  if (!input.email.endsWith("@xera.com.tr")) throw httpError(422, "validation_failed", "Email must use @xera.com.tr.");
  if (!Array.isArray(input.permissions)) throw httpError(422, "validation_failed", "Permissions are not valid.");
  if (options.requirePassword && input.password.length < 8) {
    throw httpError(422, "validation_failed", "Password must be at least 8 characters.");
  }
}

function normalizeRole(value) {
  const role = String(value || "").trim().toLowerCase().replace(/[\s-]+/g, "_");
  const aliases = {
    admin: USER_ROLES.ALL_ADMIN,
    all: USER_ROLES.ALL_ADMIN,
    all_admin: USER_ROLES.ALL_ADMIN,
    part: USER_ROLES.PART_ADMIN,
    parts: USER_ROLES.PART_ADMIN,
    part_list_admin: USER_ROLES.PART_ADMIN,
    part_admin: USER_ROLES.PART_ADMIN,
    document: USER_ROLES.DOCUMENT_ADMIN,
    documents: USER_ROLES.DOCUMENT_ADMIN,
    document_list_admin: USER_ROLES.DOCUMENT_ADMIN,
    document_admin: USER_ROLES.DOCUMENT_ADMIN,
    user_permissions_admin: USER_ROLES.USER_ADMIN,
    user_permission_admin: USER_ROLES.USER_ADMIN,
    user_management_admin: USER_ROLES.USER_ADMIN,
    user_manager: USER_ROLES.USER_ADMIN,
    user_admin: USER_ROLES.USER_ADMIN,
    user: USER_ROLES.USER
  };
  return aliases[role] || USER_ROLES.USER;
}

function permissionsFromRole(role) {
  return [...(ROLE_PERMISSIONS[normalizeRole(role)] || [])];
}

function normalizePermission(value) {
  const permission = String(value || "").trim().toLowerCase().replace(/[\s-]+/g, "_");
  if (permission === "part" || permission === "parts" || permission === "part_list_admin") return "part_admin";
  if (permission === "document" || permission === "documents" || permission === "document_list_admin") return "document_admin";
  if (
    permission === "user_permission_admin"
    || permission === "user_permissions_admin"
    || permission === "user_management_admin"
    || permission === "user_manager"
  ) return "user_admin";
  if (ADMIN_PERMISSIONS.includes(permission)) return permission;
  return "";
}

function normalizePermissions(value) {
  if (value == null) return [];
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return [];
    if (trimmed === "all" || trimmed === "admin" || trimmed === "all_admin") return [...ADMIN_PERMISSIONS];
    if (trimmed.startsWith("[")) return normalizePermissions(safeParseJson(trimmed) || []);
    return normalizePermissions(trimmed.split(/[,\s;|]+/));
  }
  if (!Array.isArray(value)) return [];

  const permissions = [];
  for (const item of value) {
    const normalized = normalizePermission(item);
    if (normalized && !permissions.includes(normalized)) permissions.push(normalized);
  }
  return ADMIN_PERMISSIONS.filter(permission => permissions.includes(permission));
}

function parsePermissionsJson(value) {
  const parsed = safeParseJson(value);
  return normalizePermissions(Array.isArray(parsed) ? parsed : []);
}

function effectiveUserPermissions(user) {
  if (!user) return [];
  const storedPermissions = parsePermissionsJson(user.permissions_json);
  return storedPermissions.length > 0 ? storedPermissions : permissionsFromRole(user.role);
}

function permissionsHave(permissions, permission) {
  return normalizePermissions(permissions).includes(permission);
}

function deriveRoleFromPermissions(permissions, fallbackRole = USER_ROLES.USER) {
  const normalizedPermissions = normalizePermissions(permissions);
  if (normalizedPermissions.length === 0) return USER_ROLES.USER;
  if (normalizedPermissions.length === ADMIN_PERMISSIONS.length) return USER_ROLES.ALL_ADMIN;
  if (normalizedPermissions.length === 1) return normalizedPermissions[0];
  const fallback = normalizeRole(fallbackRole);
  return fallback !== USER_ROLES.ALL_ADMIN && normalizedPermissions.includes(fallback)
    ? fallback
    : normalizedPermissions[0];
}

function permissionsLabel(permissions) {
  const normalizedPermissions = normalizePermissions(permissions);
  if (normalizedPermissions.length === 0) return ROLE_LABELS[USER_ROLES.USER];
  if (normalizedPermissions.length === ADMIN_PERMISSIONS.length) return ROLE_LABELS[USER_ROLES.ALL_ADMIN];
  return normalizedPermissions.map(permission => ROLE_LABELS[permission]).join(" + ");
}

function buildUsernameFromEmail(email) {
  return normalizeEmail(email).split("@")[0];
}

async function getUserById(id) {
  return await db.prepare("SELECT * FROM users WHERE id = ?").get(id);
}

async function signupUser(body) {
  if (!ALLOW_PUBLIC_SIGNUP) {
    throw httpError(403, "signup_disabled", "Self-service signup is disabled. Ask an admin to create your account.");
  }

  const displayName = sanitizeText(body.display_name || body.displayName || body.full_name || body.fullName || "");
  const position = sanitizeText(body.position || "");
  const email = normalizeEmail(body.email || "");
  const password = String(body.password || "");

  validateAuthInput({ displayName, position, email, password, isSignup: true });

  const existing = await db.prepare("SELECT id FROM users WHERE email = ?").get(email);
  if (existing) throw httpError(409, "email_exists", "This email is already registered.");

  const passwordRecord = hashPassword(password);
  const username = buildUsernameFromEmail(email);
  const now = nowIso();
  const result = await db.prepare(`
    INSERT INTO users (
      username, email, display_name, position, role, permissions_json, department,
      password_hash, password_salt, created_at
    )
    VALUES (?, ?, ?, ?, 'user', '[]', ?, ?, ?, ?)
  `).run(
    username,
    email,
    displayName,
    position,
    position,
    passwordRecord.hash,
    passwordRecord.salt,
    now
  );

  const user = await db.prepare("SELECT * FROM users WHERE id = ?").get(Number(result.lastInsertRowid));
  const token = await createSession(user.id);
  return { user: publicUser(user), token };
}

async function loginUser(body) {
  const email = normalizeEmail(body.email || "");
  const password = String(body.password || "");
  validateAuthInput({ email, password, isSignup: false });

  const user = await db.prepare("SELECT * FROM users WHERE email = ?").get(email);
  if (!user || !user.password_hash || !user.password_salt || !verifyPassword(password, user.password_salt, user.password_hash)) {
    throw httpError(401, "invalid_credentials", "Email or password is incorrect.");
  }

  const token = await createSession(user.id);
  return { user: publicUser(user), token };
}

async function logoutUser(req) {
  const token = getAuthToken(req);
  if (!token) return;
  await db.prepare("DELETE FROM user_sessions WHERE token_hash = ?").run(hashToken(token));
}

function validateAuthInput({ displayName, position, email, password, isSignup }) {
  if (isSignup && !displayName) throw httpError(422, "validation_failed", "Full name is required.");
  if (isSignup && !position) throw httpError(422, "validation_failed", "Position is required.");
  if (!email.endsWith("@xera.com.tr")) throw httpError(422, "validation_failed", "Email must use @xera.com.tr.");
  if (password.length < 8) throw httpError(422, "validation_failed", "Password must be at least 8 characters.");
}

function normalizeEmail(value) {
  return String(value || "").trim().toLowerCase();
}

function hashPassword(password, salt = crypto.randomBytes(16).toString("hex")) {
  const hash = crypto.pbkdf2Sync(password, salt, 120000, 32, "sha256").toString("hex");
  return { salt, hash };
}

function verifyPassword(password, salt, expectedHash) {
  const actual = hashPassword(password, salt).hash;
  return crypto.timingSafeEqual(Buffer.from(actual, "hex"), Buffer.from(expectedHash, "hex"));
}

async function createSession(userId) {
  const token = crypto.randomBytes(32).toString("hex");
  const createdAt = nowIso();
  const expiresAt = new Date(Date.now() + 1000 * 60 * 60 * 24 * 30).toISOString();
  await db.prepare(`
    INSERT INTO user_sessions (user_id, token_hash, created_at, expires_at)
    VALUES (?, ?, ?, ?)
  `).run(userId, hashToken(token), createdAt, expiresAt);
  return token;
}

function getAuthToken(req) {
  const authorization = req.headers.authorization || "";
  if (authorization.toLowerCase().startsWith("bearer ")) return authorization.slice(7).trim();
  return String(req.headers["x-session-token"] || "").trim();
}

function hashToken(token) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

async function resolveUser(req) {
  const token = getAuthToken(req);
  if (token) {
    const row = await db.prepare(`
      SELECT u.*
      FROM user_sessions s
      JOIN users u ON u.id = s.user_id
      WHERE s.token_hash = ?
        AND s.expires_at > ?
      LIMIT 1
    `).get(hashToken(token), nowIso());
    if (row) return row;
  }

  throw httpError(401, "unauthorized", "Login is required.");
}

function publicUser(user) {
  const permissions = effectiveUserPermissions(user);
  const role = deriveRoleFromPermissions(permissions, user.role);
  return {
    id: user.id,
    username: user.username,
    email: user.email,
    display_name: user.display_name,
    position: user.position,
    role,
    role_label: permissionsLabel(permissions),
    permissions,
    department: user.department
  };
}

async function requireAnyAdmin(req) {
  const user = await resolveUser(req);
  if (!isAdminUser(user)) throw httpError(403, "forbidden", "Admin permission is required.");
  return user;
}

async function requirePermission(req, permission) {
  const user = await resolveUser(req);
  if (!userHasPermission(user, permission)) {
    throw httpError(403, "forbidden", `${permissionLabel(permission)} permission is required.`);
  }
  return user;
}

function isAdminUser(user) {
  return effectiveUserPermissions(user).length > 0;
}

function userHasPermission(user, permission) {
  return effectiveUserPermissions(user).includes(permission);
}

function permissionLabel(permission) {
  const labels = {
    part_admin: "Part List Admin",
    document_admin: "Document List Admin",
    user_admin: "User Permissions Admin"
  };
  return labels[permission] || "Admin";
}

async function insertAudit(actorUserId, entityType, entityId, action, before, after) {
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

function sanitizeText(value) {
  return String(value || "")
    .replace(/[\\/:*?"<>|]/g, "-")
    .replace(/\s+/g, " ")
    .replace(/_+/g, "-")
    .trim();
}

function sanitizeFilenameText(value) {
  return String(value || "")
    .replace(/[\\/:*?"<>|]/g, "-")
    .replace(/\s+/g, " ")
    .trim();
}

function sanitizeCompact(value) {
  return sanitizeText(value).replace(/\s+/g, "").toUpperCase();
}

function optionalCompactValue(value, fallback = "") {
  const compact = sanitizeCompact(value);
  return compact || sanitizeCompact(fallback);
}

function normalizeYearYY(value, creationDate = todayDate()) {
  const text = String(value || "").trim();
  if (/^\d{4}$/.test(text)) return text.slice(2);
  if (/^\d{1,2}$/.test(text)) return text.padStart(2, "0");
  return String(creationDate || todayDate()).slice(2, 4);
}

function sanitizeDocumentSequenceNo(value) {
  const digits = String(value || "").replace(/\D/g, "");
  if (!digits) return "000";
  return digits.padStart(3, "0").slice(-3);
}

function normalizeRevision(value) {
  const compact = String(value || "").trim().toLowerCase();
  if (/^\d{2}$/.test(compact)) return `r${compact}`;
  return compact;
}

function normalizeControlStatus(value) {
  const normalized = String(value || "").trim().toLowerCase();
  if (["controlled", "uncontrolled"].includes(normalized)) return normalized;
  return "controlled";
}

function normalizeDate(value) {
  const text = String(value || "").trim();
  if (/^\d{8}$/.test(text)) return `${text.slice(0, 4)}-${text.slice(4, 6)}-${text.slice(6, 8)}`;
  return text;
}

function isValidUiDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year
    && date.getUTCMonth() === month - 1
    && date.getUTCDate() === day;
}

function todayDate() {
  return new Date().toISOString().slice(0, 10);
}

function nowIso() {
  return new Date().toISOString();
}

function padSequence(value) {
  return String(value).padStart(3, "0");
}

function safeParseJson(value) {
  if (!value) return null;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function parseBooleanEnv(value, defaultValue = false) {
  if (value === undefined || value === null || value === "") return defaultValue;
  return ["1", "true", "yes", "on"].includes(String(value).trim().toLowerCase());
}

function seedPassword(envKey) {
  if (process.env[envKey]) return process.env[envKey];
  return null;
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

function maskDatabaseUrl(value) {
  if (!value) return null;
  try {
    const url = new URL(value);
    return `${url.protocol}//${url.host}${url.pathname}`;
  } catch {
    return String(value).replace(/\/\/([^:@]+):([^@]+)@/, "//***:***@");
  }
}

function readJson(req) {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", chunk => {
      body += chunk;
      if (body.length > 1_000_000) {
        reject(httpError(413, "payload_too_large", "Request body is too large."));
        req.destroy();
      }
    });
    req.on("end", () => {
      if (!body.trim()) return resolve({});
      try {
        resolve(JSON.parse(body));
      } catch {
        reject(httpError(400, "invalid_json", "Request body must be valid JSON."));
      }
    });
  });
}

function readBinary(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", chunk => {
      chunks.push(chunk);
      const totalLength = chunks.reduce((acc, c) => acc + c.length, 0);
      if (totalLength > 20_000_000) {
        reject(httpError(413, "payload_too_large", "Excel file is too large."));
        req.destroy();
      }
    });
    req.on("end", () => {
      resolve(Buffer.concat(chunks));
    });
    req.on("error", err => {
      reject(err);
    });
  });
}

function sendJson(res, statusCode, payload) {
  const body = JSON.stringify(payload, null, 2);
  res.writeHead(statusCode, {
    "content-type": "application/json; charset=utf-8",
    "access-control-allow-origin": "*",
    "access-control-allow-methods": "GET,POST,OPTIONS",
    "access-control-allow-headers": "content-type,x-session-token,authorization",
    "content-length": Buffer.byteLength(body)
  });
  res.end(body);
}

function sendBinary(res, statusCode, body, headers = {}) {
  res.writeHead(statusCode, {
    ...headers,
    "access-control-allow-origin": "*",
    "content-length": body.length
  });
  res.end(body);
}

function sendEmpty(res, statusCode) {
  res.writeHead(statusCode, {
    "access-control-allow-origin": "*",
    "access-control-allow-methods": "GET,POST,OPTIONS",
    "access-control-allow-headers": "content-type,x-session-token,authorization"
  });
  res.end();
}

function sendRedirect(res, location) {
  res.writeHead(302, { location });
  res.end();
}

function serveStatic(res, requestPath) {
  const normalizedPath = requestPath === "/" ? "/index.html" : requestPath;
  const decodedPath = decodeURIComponent(normalizedPath);
  const absolutePath = path.resolve(PUBLIC_DIR, `.${decodedPath}`);

  const isInsidePublic = absolutePath === PUBLIC_DIR || absolutePath.startsWith(PUBLIC_DIR + path.sep);
  if (!isInsidePublic) {
    return sendJson(res, 403, { error: "forbidden", message: "Invalid static path." });
  }

  if (!fs.existsSync(absolutePath) || fs.statSync(absolutePath).isDirectory()) {
    return sendJson(res, 404, { error: "not_found", message: "Static file not found." });
  }

  const contentType = getContentType(absolutePath);
  const body = fs.readFileSync(absolutePath);
  res.writeHead(200, {
    "content-type": contentType,
    "content-length": body.length
  });
  res.end(body);
}

function getContentType(filePath) {
  const extension = path.extname(filePath).toLowerCase();
  if (extension === ".html") return "text/html; charset=utf-8";
  if (extension === ".css") return "text/css; charset=utf-8";
  if (extension === ".js") return "text/javascript; charset=utf-8";
  if (extension === ".json") return "application/json; charset=utf-8";
  if (extension === ".svg") return "image/svg+xml";
  if (extension === ".png") return "image/png";
  return "application/octet-stream";
}

function buildPartsWorkbook(rows) {
  const headers = [
    "Part Number",
    "Project Code",
    "Main Code",
    "Sequence",
    "Revision",
    "Revision Mode",
    "Part Name",
    "Description",
    "Main Category",
    "Sub Category",
    "Source",
    "Requested By",
    "Checked By",
    "Reviewed At"
  ];

  const dataRows = rows.map(row => [
    row.part_number,
    row.project_code,
    row.main_code,
    row.sequence_no,
    row.revision_code,
    row.revision_mode,
    row.part_name,
    row.description,
    row.main_category,
    row.sub_category,
    row.source,
    row.requested_by,
    row.checked_by,
    row.approved_at
  ]);

  const worksheet = buildWorksheetXml([headers, ...dataRows]);
  return zipStore({
    "[Content_Types].xml": `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
  <Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
</Types>`,
    "_rels/.rels": `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
</Relationships>`,
    "xl/workbook.xml": `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <sheets>
    <sheet name="Parts" sheetId="1" r:id="rId1"/>
  </sheets>
</workbook>`,
    "xl/_rels/workbook.xml.rels": `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>
</Relationships>`,
    "xl/worksheets/sheet1.xml": worksheet
  });
}

function buildDocumentsWorkbook(rows) {
  const headers = [
    "Document No",
    "Category",
    "Year",
    "Sequence",
    "Revision",
    "Reference Type",
    "Reference",
    "Document Name",
    "Written By",
    "Creation Date",
    "Checked By",
    "Filename",
    "Reviewed At"
  ];

  const dataRows = rows.map(row => [
    row.document_no,
    `${row.category} (${(CATEGORY_RULES[row.category] && CATEGORY_RULES[row.category].name) || row.category})`,
    row.year_yy,
    row.sequence_no,
    row.revision,
    row.reference_type,
    row.reference_value,
    row.document_name,
    row.written_by,
    row.creation_date,
    row.checked_by,
    row.generated_filename,
    row.approved_at
  ]);

  const worksheet = buildWorksheetXml([headers, ...dataRows]);
  return zipStore({
    "[Content_Types].xml": `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
  <Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
</Types>`,
    "_rels/.rels": `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
</Relationships>`,
    "xl/workbook.xml": `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <sheets>
    <sheet name="Documents" sheetId="1" r:id="rId1"/>
  </sheets>
</workbook>`,
    "xl/_rels/workbook.xml.rels": `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>
</Relationships>`,
    "xl/worksheets/sheet1.xml": worksheet
  });
}

function buildWorksheetXml(rows) {
  const sheetRows = rows.map((row, rowIndex) => {
    const rowNumber = rowIndex + 1;
    const cells = row.map((value, columnIndex) => {
      const ref = `${columnName(columnIndex + 1)}${rowNumber}`;
      return `<c r="${ref}" t="inlineStr"><is><t>${escapeXml(value == null ? "" : value)}</t></is></c>`;
    }).join("");
    return `<row r="${rowNumber}">${cells}</row>`;
  }).join("");

  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <sheetData>${sheetRows}</sheetData>
</worksheet>`;
}

function columnName(index) {
  let name = "";
  let current = index;
  while (current > 0) {
    const remainder = (current - 1) % 26;
    name = String.fromCharCode(65 + remainder) + name;
    current = Math.floor((current - 1) / 26);
  }
  return name;
}

function escapeXml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function zipStore(files) {
  const localParts = [];
  const centralParts = [];
  let offset = 0;

  for (const [name, content] of Object.entries(files)) {
    const nameBuffer = Buffer.from(name, "utf8");
    const dataBuffer = Buffer.from(content, "utf8");
    const crc = crc32(dataBuffer);

    const localHeader = Buffer.alloc(30);
    localHeader.writeUInt32LE(0x04034b50, 0);
    localHeader.writeUInt16LE(20, 4);
    localHeader.writeUInt16LE(0x0800, 6);
    localHeader.writeUInt16LE(0, 8);
    localHeader.writeUInt16LE(0, 10);
    localHeader.writeUInt16LE(0, 12);
    localHeader.writeUInt32LE(crc, 14);
    localHeader.writeUInt32LE(dataBuffer.length, 18);
    localHeader.writeUInt32LE(dataBuffer.length, 22);
    localHeader.writeUInt16LE(nameBuffer.length, 26);
    localHeader.writeUInt16LE(0, 28);

    localParts.push(localHeader, nameBuffer, dataBuffer);

    const centralHeader = Buffer.alloc(46);
    centralHeader.writeUInt32LE(0x02014b50, 0);
    centralHeader.writeUInt16LE(20, 4);
    centralHeader.writeUInt16LE(20, 6);
    centralHeader.writeUInt16LE(0x0800, 8);
    centralHeader.writeUInt16LE(0, 10);
    centralHeader.writeUInt16LE(0, 12);
    centralHeader.writeUInt16LE(0, 14);
    centralHeader.writeUInt32LE(crc, 16);
    centralHeader.writeUInt32LE(dataBuffer.length, 20);
    centralHeader.writeUInt32LE(dataBuffer.length, 24);
    centralHeader.writeUInt16LE(nameBuffer.length, 28);
    centralHeader.writeUInt16LE(0, 30);
    centralHeader.writeUInt16LE(0, 32);
    centralHeader.writeUInt16LE(0, 34);
    centralHeader.writeUInt16LE(0, 36);
    centralHeader.writeUInt32LE(0, 38);
    centralHeader.writeUInt32LE(offset, 42);
    centralParts.push(centralHeader, nameBuffer);

    offset += localHeader.length + nameBuffer.length + dataBuffer.length;
  }

  const centralDirectory = Buffer.concat(centralParts);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(0, 4);
  end.writeUInt16LE(0, 6);
  end.writeUInt16LE(Object.keys(files).length, 8);
  end.writeUInt16LE(Object.keys(files).length, 10);
  end.writeUInt32LE(centralDirectory.length, 12);
  end.writeUInt32LE(offset, 16);
  end.writeUInt16LE(0, 20);

  return Buffer.concat([...localParts, centralDirectory, end]);
}

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) {
      c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
    }
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function httpError(statusCode, code, message) {
  const error = new Error(message);
  error.statusCode = statusCode;
  error.code = code;
  return error;
}
