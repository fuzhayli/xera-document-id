const fs = require("node:fs");
const path = require("node:path");

const ROOT_DIR = path.resolve(__dirname, "..");
const PATCH_TAG = "template-category-20260608";

main();

function main() {
  patchServer();
  patchPublicApp();
  patchDocumentsList();
  patchArchive();
  patchAdmin();
  patchImportScript();
  console.log("Template category patch applied.");
}

function patchServer() {
  const filePath = path.join(ROOT_DIR, "server", "index.js");
  let source = read(filePath);

  source = replaceOnce(source, `  QMS: {
    code: "QMS",
    name: "Quality Management",
    prefix: "XQ",
    suffixType: "revision",
    requiresSequence: true,
    implemented: true,
    example: "XQP-13_Control of Manufacturing Realization_r00"
  },
  SOP: {`, `  QMS: {
    code: "QMS",
    name: "Quality Management",
    prefix: "XQ",
    suffixType: "revision",
    requiresSequence: true,
    implemented: true,
    example: "XQP-13_Control of Manufacturing Realization_r00"
  },
  TEMPLATE: {
    code: "TEMPLATE",
    name: "Template",
    prefix: "XQT",
    suffixType: "revision",
    requiresSequence: true,
    implemented: true,
    example: "XQT-05-01_Quotation Form Template_EN_r01"
  },
  SOP: {`);

  source = replaceOnce(source, `  await backfillUserPermissions();
  await ensureColumn("document_records", "revision_updated_by_user_id", "INTEGER REFERENCES users(id)");`, `  await backfillUserPermissions();
  await migrateTemplateCategory();
  await ensureColumn("document_records", "revision_updated_by_user_id", "INTEGER REFERENCES users(id)");`);

  source = replaceOnce(source, `async function backfillUserPermissions() {
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

async function upsertSeedUser(seed) {`, `async function backfillUserPermissions() {
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

async function migrateTemplateCategory() {
  await db.prepare("UPDATE document_records SET category = 'TEMPLATE' WHERE document_no LIKE 'XQT-%'").run();
  await db.prepare("UPDATE document_requests SET category = 'TEMPLATE' WHERE document_no LIKE 'XQT-%'").run();
  await db.prepare("UPDATE document_revision_archive SET category = 'TEMPLATE' WHERE document_no LIKE 'XQT-%'").run();
}

async function upsertSeedUser(seed) {`);

  source = source.replace("Category is required and must be one of D, R, MD, MR, EC, QMS, SOP, MARKETING.", "Category is required and must be one of D, R, MD, MR, EC, QMS, TEMPLATE, SOP, MARKETING.");
  source = source.replace(`if (rule && ["D", "R", "MD", "MR", "EC", "QMS", "SOP", "MARKETING"].includes(rule.code) && !input.reference_value)`, `if (rule && ["D", "R", "MD", "MR", "EC", "QMS", "TEMPLATE", "SOP", "MARKETING"].includes(rule.code) && !input.reference_value)`);
  source = source.replace(`if (rule && (rule.code === "QMS" || (rule.code === "SOP" && !isIncomingSop(input))) && !/^\\d{2}$/.test(input.reference_value))`, `if (rule && (rule.code === "QMS" || rule.code === "TEMPLATE" || (rule.code === "SOP" && !isIncomingSop(input))) && !/^\\d{2}$/.test(input.reference_value))`);
  source = source.replace(`  if (rule && rule.code === "QMS") {
    const qmsType = input.detail_type || "QP";
    if (!["QM", "QP", "QT"].includes(qmsType)) errors.push("QMS type must be QM, QP or QT.");
  }`, `  if (rule && rule.code === "QMS") {
    const qmsType = input.detail_type || "QP";
    if (!["QM", "QP"].includes(qmsType)) errors.push("QMS type must be QM or QP.");
  }`);

  source = source.replace(`  if (rule.code === "QMS" && (input.detail_type || "QP") === "QT") return \`XQT-${input.reference_value}-\`;`, `  if (rule.code === "TEMPLATE") return \`XQT-${input.reference_value}-\`;`);
  source = source.replace(`  if (rule.code === "QMS") {
    const qmsType = input.detail_type || "QP";
    if (qmsType === "QM") return \`XQM-${input.year_yy}\`;
    if (qmsType === "QT") return \`XQT-${input.reference_value}-${sequenceNo}\`;
    return \`XQP-${input.reference_value}\`;
  }`, `  if (rule.code === "TEMPLATE") {
    return \`XQT-${input.reference_value}-${sequenceNo}\`;
  }

  if (rule.code === "QMS") {
    const qmsType = input.detail_type || "QP";
    if (qmsType === "QM") return \`XQM-${input.year_yy}\`;
    return \`XQP-${input.reference_value}\`;
  }`);
  source = source.replace(`  if (["QMS", "SOP"].includes(rule.code)) {`, `  if (["QMS", "TEMPLATE", "SOP"].includes(rule.code)) {`);
  source = source.replace(`  if (rule.code === "QMS") {
    const qmsType = input.detail_type || "QP";
    if (qmsType === "QM") {
      const match = documentNo.match(/^XQM-(\d{2})$/);
      if (!match) return { valid: false, error: \`QMS manual document no must look like XQM-${input.year_yy}.\` };
      if (match[1] !== input.year_yy) return { valid: false, error: \`QMS manual year must match ${input.year_yy}.\` };
      return { valid: true, sequence_no: "000" };
    }
    if (qmsType === "QT") {
      const match = documentNo.match(/^XQT-(\d{2})-(\d{2,3})$/);
      if (!match) return { valid: false, error: \`QMS template document no must look like XQT-${input.reference_value}-01.\` };
      if (match[1] !== input.reference_value) return { valid: false, error: \`QMS process must match ${input.reference_value}.\` };
      return { valid: true, sequence_no: match[2] };
    }
    const match = documentNo.match(/^XQP-(\d{2})$/);
    if (!match) return { valid: false, error: \`QMS process document no must look like XQP-${input.reference_value}.\` };
    if (match[1] !== input.reference_value) return { valid: false, error: \`QMS process must match ${input.reference_value}.\` };
    return { valid: true, sequence_no: "000" };
  }`, `  if (rule.code === "TEMPLATE") {
    const match = documentNo.match(/^XQT-(\d{2})-(\d{2,3})$/);
    if (!match) return { valid: false, error: \`Template document no must look like XQT-${input.reference_value}-01.\` };
    if (match[1] !== input.reference_value) return { valid: false, error: \`Template process must match ${input.reference_value}.\` };
    return { valid: true, sequence_no: match[2] };
  }

  if (rule.code === "QMS") {
    const qmsType = input.detail_type || "QP";
    if (qmsType === "QM") {
      const match = documentNo.match(/^XQM-(\d{2})$/);
      if (!match) return { valid: false, error: \`QMS manual document no must look like XQM-${input.year_yy}.\` };
      if (match[1] !== input.year_yy) return { valid: false, error: \`QMS manual year must match ${input.year_yy}.\` };
      return { valid: true, sequence_no: "000" };
    }
    const match = documentNo.match(/^XQP-(\d{2})$/);
    if (!match) return { valid: false, error: \`QMS process document no must look like XQP-${input.reference_value}.\` };
    if (match[1] !== input.reference_value) return { valid: false, error: \`QMS process must match ${input.reference_value}.\` };
    return { valid: true, sequence_no: "000" };
  }`);
  source = source.replace(`  const width = rule.code === "QMS" && (input.detail_type || "QP") === "QT" ? 2 : 3;`, `  const width = rule.code === "TEMPLATE" ? 2 : 3;`);
  source = source.replace(`  if (rule.code === "QMS") return (input.detail_type || "QP") === "QT";`, `  if (rule.code === "TEMPLATE") return true;
  if (rule.code === "QMS") return false;`);
  source = source.replace(`function canEditDocumentReferenceValue(documentRecord) {
  return ["D", "R", "MD", "MR", "EC"].includes(documentRecord.category);
}`, `function canEditDocumentReferenceValue(documentRecord) {
  return ["D", "R", "MD", "MR", "EC", "TEMPLATE"].includes(documentRecord.category);
}`);

  write(filePath, source);
}

function patchPublicApp() {
  const filePath = path.join(ROOT_DIR, "public", "app.js");
  let source = read(filePath);
  source = source.replace(`const MVP_CATEGORIES = ["D", "R", "MD", "MR", "EC", "MARKETING", "QMS", "SOP"];`, `const MVP_CATEGORIES = ["D", "R", "MD", "MR", "EC", "MARKETING", "QMS", "TEMPLATE", "SOP"];`);
  source = source.replace(`  MARKETING: "MARKETING (Marketing Material ID)",
  QMS: "QMS (Quality Management)",
  SOP: "SOP (SOP / Instruction)"`, `  MARKETING: "MARKETING (Marketing Material ID)",
  QMS: "QMS (Quality Management)",
  TEMPLATE: "TEMPLATE (Template / QT)",
  SOP: "SOP (SOP / Instruction)"`);
  source = source.replace(`  SOP_INCOMING: ["1501-1107"]`, `  SOP_INCOMING: ["1501-1107"],
  TEMPLATE: ["05", "18"]`);
  source = source.replace(`  QMS: {
    referenceType: "process",
    referencePlaceholder: "13",
    referenceOptions: ["01", "02", "03", "04", "05", "13", "26"],
    usesRevision: true,
    extraSelect: {
      label: "QMS Type",
      options: [
        ["QM", "QM - Quality Manual"],
        ["QP", "QP - Quality Process"],
        ["QT", "QT - Template"]
      ],
      selected: "QP"
    }
  },
  SOP: {`, `  QMS: {
    referenceType: "process",
    referencePlaceholder: "13",
    referenceOptions: ["01", "02", "03", "04", "05", "13", "26"],
    usesRevision: true,
    extraSelect: {
      label: "QMS Type",
      options: [
        ["QM", "QM - Quality Manual"],
        ["QP", "QP - Quality Process"]
      ],
      selected: "QP"
    }
  },
  TEMPLATE: {
    referenceType: "process",
    referencePlaceholder: "05",
    referenceOptions: EXCEL_REFERENCE_OPTIONS.TEMPLATE,
    lockReferenceType: true,
    usesRevision: true
  },
  SOP: {`);
  write(filePath, source);
}

function patchDocumentsList() {
  patchLabels(path.join(ROOT_DIR, "public", "documents.js"));
  const htmlPath = path.join(ROOT_DIR, "public", "documents.html");
  let html = read(htmlPath);
  html = html.replace(`<option value="QMS">QMS (Quality Management)</option>
            <option value="SOP">SOP (SOP / Instruction)</option>`, `<option value="QMS">QMS (Quality Management)</option>
            <option value="TEMPLATE">TEMPLATE (Template / QT)</option>
            <option value="SOP">SOP (SOP / Instruction)</option>`);
  html = html.replace(`<option value="QMS">QMS</option>
                  <option value="SOP">SOP</option>`, `<option value="QMS">QMS</option>
                  <option value="TEMPLATE">TEMPLATE</option>
                  <option value="SOP">SOP</option>`);
  html = html.replace(`/documents.js?v=edit-modal-scroll-20260608`, `/documents.js?v=${PATCH_TAG}`);
  write(htmlPath, html);
}

function patchArchive() {
  patchLabels(path.join(ROOT_DIR, "public", "archive.js"));
  const htmlPath = path.join(ROOT_DIR, "public", "archive.html");
  let html = read(htmlPath);
  html = html.replace(`<option value="QMS">QMS (Quality Management)</option>
            <option value="SOP">SOP (SOP / Instruction)</option>`, `<option value="QMS">QMS (Quality Management)</option>
            <option value="TEMPLATE">TEMPLATE (Template / QT)</option>
            <option value="SOP">SOP (SOP / Instruction)</option>`);
  write(htmlPath, html);
}

function patchAdmin() {
  patchLabels(path.join(ROOT_DIR, "public", "admin.js"));
}

function patchLabels(filePath) {
  let source = read(filePath);
  source = source.replace(`  QMS: "QMS (Quality Management)",
  SOP: "SOP (SOP / Instruction)",`, `  QMS: "QMS (Quality Management)",
  TEMPLATE: "TEMPLATE (Template / QT)",
  SOP: "SOP (SOP / Instruction)",`);
  source = source.replace(`const REVISION_CATEGORIES = ["D", "MD", "EC", "QMS", "SOP"];`, `const REVISION_CATEGORIES = ["D", "MD", "EC", "QMS", "TEMPLATE", "SOP"];`);
  write(filePath, source);
}

function patchImportScript() {
  const filePath = path.join(ROOT_DIR, "scripts", "import-document-number-list-r00.js");
  if (!fs.existsSync(filePath)) return;
  let source = read(filePath);
  source = source.replaceAll(`["QMS", "XQT-`, `["TEMPLATE", "XQT-`);
  source = source.replaceAll(`category: "QMS",\n      year_yy: "26",\n      sequence_no: sequenceNo,\n      document_no: \`XQT-`, `category: "TEMPLATE",\n      year_yy: "26",\n      sequence_no: sequenceNo,\n      document_no: \`XQT-`);
  source = source.replaceAll(`category: "QMS",\n      year_yy: "26",\n      sequence_no: sequenceNo,\n      document_no: \`XQT-`, `category: "TEMPLATE",\n      year_yy: "26",\n      sequence_no: sequenceNo,\n      document_no: \`XQT-`);
  write(filePath, source);
}

function read(filePath) {
  return fs.readFileSync(filePath, "utf8");
}

function write(filePath, content) {
  fs.writeFileSync(filePath, content);
}

function replaceOnce(source, from, to) {
  if (source.includes(to)) return source;
  if (!source.includes(from)) return source;
  return source.replace(from, to);
}
