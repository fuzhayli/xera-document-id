const fs = require("node:fs");
const path = require("node:path");

const ROOT_DIR = path.resolve(__dirname, "..");
const PATCH_TAG = "template-ui-20260608";

main();

function main() {
  safePatch("public/app.js", patchAppJs);
  safePatch("public/documents.js", patchDocumentsJs);
  safePatch("public/documents.html", patchDocumentsHtml);
  safePatch("public/archive.js", patchArchiveJs);
  safePatch("public/archive.html", patchArchiveHtml);
  safePatch("public/admin.js", patchAdminJs);
  console.log("Template UI patch applied.");
}

function safePatch(relativePath, patcher) {
  try {
    const filePath = path.join(ROOT_DIR, relativePath);
    const before = fs.readFileSync(filePath, "utf8");
    const after = patcher(before);
    if (after !== before) fs.writeFileSync(filePath, after);
  } catch (error) {
    console.warn(`Template UI patch skipped ${relativePath}: ${error.message}`);
  }
}

function patchAppJs(source) {
  source = replaceOnce(source,
    'const MVP_CATEGORIES = ["D", "R", "MD", "MR", "EC", "MARKETING", "QMS", "SOP"];',
    'const MVP_CATEGORIES = ["D", "R", "MD", "MR", "EC", "MARKETING", "QMS", "TEMPLATE", "SOP"];'
  );

  source = replaceOnce(source,
    lines([
      '  MARKETING: "MARKETING (Marketing Material ID)",',
      '  QMS: "QMS (Quality Management)",',
      '  SOP: "SOP (SOP / Instruction)"'
    ]),
    lines([
      '  MARKETING: "MARKETING (Marketing Material ID)",',
      '  QMS: "QMS (Quality Management)",',
      '  TEMPLATE: "TEMPLATE (Template / QT)",',
      '  SOP: "SOP (SOP / Instruction)"'
    ])
  );

  source = replaceOnce(source,
    '  SOP_INCOMING: ["1501-1107"]',
    lines([
      '  SOP_INCOMING: ["1501-1107"],',
      '  TEMPLATE: ["05", "18"]'
    ])
  );

  source = replaceOnce(source,
    lines([
      'async function loadRules() {',
      '  const data = await apiGet("/api/rules");',
      '  state.categories = data.categories.filter(category =>',
      '    MVP_CATEGORIES.includes(category.code) && category.implemented',
      '  );',
      '}'
    ]),
    lines([
      'async function loadRules() {',
      '  const data = await apiGet("/api/rules");',
      '  const categories = data.categories.filter(category =>',
      '    MVP_CATEGORIES.includes(category.code) && category.implemented',
      '  );',
      '  if (!categories.some(category => category.code === "TEMPLATE")) {',
      '    const qmsIndex = categories.findIndex(category => category.code === "QMS");',
      '    const insertIndex = qmsIndex >= 0 ? qmsIndex + 1 : categories.length;',
      '    categories.splice(insertIndex, 0, {',
      '      code: "TEMPLATE",',
      '      name: "Template / QT",',
      '      prefix: "XQT",',
      '      suffixType: "revision",',
      '      requiresSequence: true,',
      '      implemented: true,',
      '      example: "XQT-05-01_Quotation Form Template_EN_r01"',
      '    });',
      '  }',
      '  state.categories = categories;',
      '}'
    ])
  );

  source = replaceOnce(source,
    lines([
      '  QMS: {',
      '    referenceType: "process",',
      '    referencePlaceholder: "13",',
      '    referenceOptions: ["01", "02", "03", "04", "05", "13", "26"],',
      '    usesRevision: true,',
      '    extraSelect: {',
      '      label: "QMS Type",',
      '      options: [',
      '        ["QM", "QM - Quality Manual"],',
      '        ["QP", "QP - Quality Process"],',
      '        ["QT", "QT - Template"]',
      '      ],',
      '      selected: "QP"',
      '    }',
      '  },',
      '  SOP: {'
    ]),
    lines([
      '  QMS: {',
      '    referenceType: "process",',
      '    referencePlaceholder: "13",',
      '    referenceOptions: ["01", "02", "03", "04", "05", "13", "26"],',
      '    usesRevision: true,',
      '    extraSelect: {',
      '      label: "QMS Type",',
      '      options: [',
      '        ["QM", "QM - Quality Manual"],',
      '        ["QP", "QP - Quality Process"]',
      '      ],',
      '      selected: "QP"',
      '    }',
      '  },',
      '  TEMPLATE: {',
      '    referenceType: "process",',
      '    referencePlaceholder: "05",',
      '    referenceOptions: EXCEL_REFERENCE_OPTIONS.TEMPLATE,',
      '    lockReferenceType: true,',
      '    usesRevision: true',
      '  },',
      '  SOP: {'
    ])
  );

  source = replaceOnce(source,
    lines([
      'function collectFormData() {',
      '  return {',
      '    category: state.selectedCategory || "",',
      '    document_no: state.documentNoTouched ? elements.documentNo.value : "",',
      '    reference_type: elements.referenceType.value,',
      '    reference_value: elements.referenceValue.value,',
      '    document_name: elements.documentName.value,',
      '    written_by: currentUser ? currentUser.display_name : elements.writtenBy.value,',
      '    creation_date: elements.creationDate.value,',
      '    revision: elements.revision.value || "r00",',
      '    control_status: "controlled",',
      '    detail_type: elements.extraType.value,',
      '    detail_code: elements.extraCode.value,',
      '    detail_version: elements.extraVersion.value,',
      '    language: elements.language.value',
      '  };',
      '}'
    ]),
    lines([
      'function collectFormData() {',
      '  const isTemplate = state.selectedCategory === "TEMPLATE";',
      '  return {',
      '    category: isTemplate ? "QMS" : (state.selectedCategory || ""),',
      '    document_no: state.documentNoTouched ? elements.documentNo.value : "",',
      '    reference_type: elements.referenceType.value,',
      '    reference_value: elements.referenceValue.value,',
      '    document_name: elements.documentName.value,',
      '    written_by: currentUser ? currentUser.display_name : elements.writtenBy.value,',
      '    creation_date: elements.creationDate.value,',
      '    revision: elements.revision.value || "r00",',
      '    control_status: "controlled",',
      '    detail_type: isTemplate ? "QT" : elements.extraType.value,',
      '    detail_code: elements.extraCode.value,',
      '    detail_version: elements.extraVersion.value,',
      '    language: elements.language.value',
      '  };',
      '}'
    ])
  );

  source = replaceOnce(source,
    '        <td>${escapeHtml(CATEGORY_LABELS[request.category] || request.category)}</td>',
    '        <td>${escapeHtml(formatRequestCategory(request))}</td>'
  );

  source = replaceOnce(source,
    lines([
      'function filterRequests(requests, filter) {'
    ]),
    lines([
      'function formatRequestCategory(request) {',
      '  if (String(request.document_no || "").startsWith("XQT-")) return CATEGORY_LABELS.TEMPLATE || "TEMPLATE";',
      '  return CATEGORY_LABELS[request.category] || request.category || "-";',
      '}',
      '',
      'function filterRequests(requests, filter) {'
    ])
  );

  return source;
}

function patchDocumentsJs(source) {
  source = addTemplateLabel(source);
  source = replaceOnce(source,
    'const REVISION_CATEGORIES = ["D", "MD", "EC", "QMS", "SOP"];',
    'const REVISION_CATEGORIES = ["D", "MD", "EC", "QMS", "SOP"];'
  );
  source = replaceOnce(source,
    '  category: documentRecord => [documentRecord.category, formatCategory(documentRecord.category)],',
    '  category: documentRecord => [getDocumentCategoryCode(documentRecord), formatDocumentCategory(documentRecord)],'
  );
  source = replaceOnce(source,
    '      <td>${escapeHtml(formatCategory(documentRecord.category))}</td>',
    '      <td>${escapeHtml(formatDocumentCategory(documentRecord))}</td>'
  );
  source = replaceOnce(source,
    '    if (category && documentRecord.category !== category) return false;',
    '    if (category && getDocumentCategoryCode(documentRecord) !== category) return false;'
  );
  source = replaceOnce(source,
    lines([
      'function formatCategory(category) {',
      '  return CATEGORY_LABELS[category] || category || "-";',
      '}'
    ]),
    lines([
      'function getDocumentCategoryCode(documentRecord) {',
      '  if (String(documentRecord.document_no || "").startsWith("XQT-")) return "TEMPLATE";',
      '  return documentRecord.category || "";',
      '}',
      '',
      'function formatDocumentCategory(documentRecord) {',
      '  const category = getDocumentCategoryCode(documentRecord);',
      '  return CATEGORY_LABELS[category] || category || "-";',
      '}',
      '',
      'function formatCategory(category) {',
      '  return CATEGORY_LABELS[category] || category || "-";',
      '}'
    ])
  );
  return source;
}

function patchDocumentsHtml(source) {
  source = addTemplateFilterOption(source);
  source = source.replace('/documents.js?v=edit-modal-scroll-20260608', `/documents.js?v=${PATCH_TAG}`);
  return source;
}

function patchArchiveJs(source) {
  source = addTemplateLabel(source);
  source = replaceOnce(source,
    '  category: record => [record.category, formatCategory(record.category)],',
    '  category: record => [getDocumentCategoryCode(record), formatDocumentCategory(record)],'
  );
  source = replaceOnce(source,
    '      <td>${escapeHtml(formatCategory(record.category))}</td>',
    '      <td>${escapeHtml(formatDocumentCategory(record))}</td>'
  );
  source = replaceOnce(source,
    '    if (category && record.category !== category) return false;',
    '    if (category && getDocumentCategoryCode(record) !== category) return false;'
  );
  source = replaceOnce(source,
    lines([
      'function formatCategory(category) {',
      '  return CATEGORY_LABELS[category] || category || "-";',
      '}'
    ]),
    lines([
      'function getDocumentCategoryCode(record) {',
      '  if (String(record.document_no || "").startsWith("XQT-")) return "TEMPLATE";',
      '  return record.category || "";',
      '}',
      '',
      'function formatDocumentCategory(record) {',
      '  const category = getDocumentCategoryCode(record);',
      '  return CATEGORY_LABELS[category] || category || "-";',
      '}',
      '',
      'function formatCategory(category) {',
      '  return CATEGORY_LABELS[category] || category || "-";',
      '}'
    ])
  );
  return source;
}

function patchArchiveHtml(source) {
  return addTemplateFilterOption(source);
}

function patchAdminJs(source) {
  source = addTemplateLabel(source);
  source = replaceOnce(source,
    'const REVISION_CATEGORIES = ["D", "MD", "EC", "QMS", "SOP"];',
    'const REVISION_CATEGORIES = ["D", "MD", "EC", "QMS", "SOP"];'
  );
  source = replaceOnce(source,
    '      <td>${escapeHtml(formatCategory(documentRecord.category))}</td>',
    '      <td>${escapeHtml(formatDocumentCategory(documentRecord))}</td>'
  );
  source = replaceOnce(source,
    lines([
      'function canUpdateRevision(documentRecord) {',
      '  return REVISION_CATEGORIES.includes(documentRecord.category)',
      '    && /^r\\d{2}$/.test(documentRecord.revision || "");',
      '}'
    ]),
    lines([
      'function canUpdateRevision(documentRecord) {',
      '  return (REVISION_CATEGORIES.includes(documentRecord.category) || String(documentRecord.document_no || "").startsWith("XQT-"))',
      '    && /^r\\d{2}$/.test(documentRecord.revision || "");',
      '}'
    ])
  );
  source = replaceOnce(source,
    lines([
      'function formatCategory(category) {',
      '  return CATEGORY_LABELS[category] || category || "-";',
      '}'
    ]),
    lines([
      'function formatDocumentCategory(documentRecord) {',
      '  if (String(documentRecord.document_no || "").startsWith("XQT-")) return CATEGORY_LABELS.TEMPLATE || "TEMPLATE";',
      '  return CATEGORY_LABELS[documentRecord.category] || documentRecord.category || "-";',
      '}',
      '',
      'function formatCategory(category) {',
      '  return CATEGORY_LABELS[category] || category || "-";',
      '}'
    ])
  );
  return source;
}

function addTemplateLabel(source) {
  return replaceOnce(source,
    lines([
      '  QMS: "QMS (Quality Management)",',
      '  SOP: "SOP (SOP / Instruction)",'
    ]),
    lines([
      '  QMS: "QMS (Quality Management)",',
      '  TEMPLATE: "TEMPLATE (Template / QT)",',
      '  SOP: "SOP (SOP / Instruction)",'
    ])
  );
}

function addTemplateFilterOption(source) {
  return replaceOnce(source,
    lines([
      '            <option value="QMS">QMS (Quality Management)</option>',
      '            <option value="SOP">SOP (SOP / Instruction)</option>'
    ]),
    lines([
      '            <option value="QMS">QMS (Quality Management)</option>',
      '            <option value="TEMPLATE">TEMPLATE (Template / QT)</option>',
      '            <option value="SOP">SOP (SOP / Instruction)</option>'
    ])
  );
}

function lines(items) {
  return items.join("\n");
}

function replaceOnce(source, search, replacement) {
  if (source.includes(replacement)) return source;
  if (!source.includes(search)) return source;
  return source.replace(search, replacement);
}
