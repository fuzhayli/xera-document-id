const fs = require("node:fs");
const path = require("node:path");

const ROOT_DIR = path.resolve(__dirname, "..");
const PATCH_TAG = "record-template-name-20260609-2";
const PATCH_MARKER = "record-template-document-name-20260609";
const TEMPLATE_SUFFIX_REPLACEMENT = '.replace(/\\s*[-–—:_]?\\s*template(?:[_\\-\\s]?[a-z]{2})?\\s*$/i, "")';

main();

function main() {
  safePatch("public/index.html", patchIndexHtml);
  safePatch("public/app.js", patchAppJs);
  console.log("Record request template-name patch applied.");
}

function safePatch(relativePath, patcher) {
  try {
    const filePath = path.join(ROOT_DIR, relativePath);
    const before = fs.readFileSync(filePath, "utf8");
    const after = patcher(before);
    if (after !== before) fs.writeFileSync(filePath, after);
  } catch (error) {
    console.warn(`Record template-name patch skipped ${relativePath}: ${error.message}`);
  }
}

function patchIndexHtml(source) {
  source = replaceOnce(source,
    lines([
      '        <label class="field">',
      '          <span>Document Name</span>',
      '          <input id="documentName" name="document_name" autocomplete="off" placeholder="Risk Management Report">',
      '        </label>'
    ]),
    lines([
      '        <div class="grid two hidden" id="documentNameModeFields">',
      '          <label class="field">',
      '            <span>Document Name Source</span>',
      '            <select id="documentNameSource" name="document_name_source">',
      '              <option value="template">Use ready template</option>',
      '              <option value="other">Other</option>',
      '            </select>',
      '          </label>',
      '',
      '          <label class="field hidden" id="templateNameField">',
      '            <span>Template Name</span>',
      '            <select id="documentNameTemplate" name="document_name_template">',
      '              <option value="">Loading templates...</option>',
      '            </select>',
      '          </label>',
      '        </div>',
      '',
      '        <label class="field" id="documentNameField">',
      '          <span>Document Name</span>',
      '          <input id="documentName" name="document_name" autocomplete="off" placeholder="Risk Management Report">',
      '        </label>'
    ])
  );

  source = source.replace(/\/app\.js(?:\?v=[^"]*)?"><\/script>/, `/app.js?v=${PATCH_TAG}"></script>`);
  return source;
}

function patchAppJs(source) {
  source = source.replaceAll('.replace(/\\s*[-–—:]?\\s*template\\s*$/i, "")', TEMPLATE_SUFFIX_REPLACEMENT);
  source = source.replaceAll('.replace(/s*[-–—:]?s*templates*$/i, "")', TEMPLATE_SUFFIX_REPLACEMENT);
  return appendOnce(source, PATCH_MARKER, recordTemplateNamePatch());
}

function recordTemplateNamePatch() {
  return String.raw`

// ${PATCH_MARKER}
(function installRecordTemplateDocumentNamePatch() {
  if (globalThis.__recordTemplateDocumentNamePatchInstalled) return;
  globalThis.__recordTemplateDocumentNamePatchInstalled = true;

  state.recordTemplateDocumentNames = state.recordTemplateDocumentNames || [];
  state.recordTemplateDocumentNamesLoaded = Boolean(state.recordTemplateDocumentNamesLoaded);
  state.autoFilledRecordTemplateDocumentName = false;

  Object.assign(elements, {
    documentNameModeFields: document.getElementById("documentNameModeFields"),
    documentNameSource: document.getElementById("documentNameSource"),
    templateNameField: document.getElementById("templateNameField"),
    documentNameTemplate: document.getElementById("documentNameTemplate"),
    documentNameField: document.getElementById("documentNameField")
  });

  const originalApplyCategoryDefaults = applyCategoryDefaults;
  applyCategoryDefaults = function patchedApplyCategoryDefaults() {
    const result = originalApplyCategoryDefaults.apply(this, arguments);
    refreshRecordDocumentNameMode();
    return result;
  };

  const originalClearForm = clearForm;
  clearForm = function patchedClearForm() {
    if (elements.documentNameSource) elements.documentNameSource.value = "template";
    if (elements.documentNameTemplate) elements.documentNameTemplate.value = "";
    state.autoFilledRecordTemplateDocumentName = false;
    return originalClearForm.apply(this, arguments);
  };

  const originalCollectFormData = collectFormData;
  collectFormData = function patchedCollectFormData() {
    syncRecordTemplateSelectionToDocumentName({ force: true });
    return originalCollectFormData.apply(this, arguments);
  };

  document.addEventListener("DOMContentLoaded", () => {
    if (!elements.documentNameSource || !elements.documentNameTemplate) return;

    elements.documentNameSource.addEventListener("change", () => {
      state.autoFilledRecordTemplateDocumentName = false;
      refreshRecordDocumentNameMode({ force: true });
      updatePreview();
    });

    elements.documentNameTemplate.addEventListener("change", () => {
      syncRecordTemplateSelectionToDocumentName({ force: true });
      updatePreview();
    });
  });

  function refreshRecordDocumentNameMode(options = {}) {
    if (!elements.documentNameModeFields || !elements.documentNameField || !elements.documentName) return;

    const isRecordRequest = state.selectedCategory === "R";
    elements.documentNameModeFields.classList.toggle("hidden", !isRecordRequest);

    if (!isRecordRequest) {
      elements.templateNameField?.classList.add("hidden");
      elements.documentNameField.classList.remove("hidden");
      elements.documentName.disabled = false;
      return;
    }

    if (!elements.documentNameSource.value) elements.documentNameSource.value = "template";
    const useTemplate = elements.documentNameSource.value === "template";
    elements.templateNameField?.classList.toggle("hidden", !useTemplate);
    elements.documentNameField.classList.toggle("hidden", useTemplate);
    elements.documentName.disabled = useTemplate;

    if (!useTemplate) {
      if (options.force && state.autoFilledRecordTemplateDocumentName) {
        elements.documentName.value = "";
        state.autoFilledRecordTemplateDocumentName = false;
      }
      return;
    }

    loadRecordTemplateDocumentNames()
      .then(() => {
        renderRecordTemplateOptions();
        syncRecordTemplateSelectionToDocumentName({ force: true });
        updatePreview();
      })
      .catch(error => {
        renderRecordTemplateOptions([]);
        showMessage("Template list could not be loaded. Select Other and enter the document name manually. " + error.message, "warning");
      });
  }

  async function loadRecordTemplateDocumentNames() {
    if (state.recordTemplateDocumentNamesLoaded) return;
    const data = await apiGet("/api/documents");
    state.recordTemplateDocumentNames = buildRecordTemplateDocumentNames(data.documents || []);
    state.recordTemplateDocumentNamesLoaded = true;
  }

  function renderRecordTemplateOptions(options = state.recordTemplateDocumentNames) {
    if (!elements.documentNameTemplate) return;
    const currentValue = elements.documentNameTemplate.value;

    if (!options.length) {
      elements.documentNameTemplate.disabled = true;
      elements.documentNameTemplate.innerHTML = '<option value="">No registered templates available</option>';
      elements.documentName.value = "";
      state.autoFilledRecordTemplateDocumentName = false;
      return;
    }

    elements.documentNameTemplate.disabled = false;
    elements.documentNameTemplate.innerHTML = options
      .map(option => '<option value="' + escapeHtml(option) + '">' + escapeHtml(option) + '</option>')
      .join("");
    elements.documentNameTemplate.value = options.includes(currentValue) ? currentValue : options[0];
  }

  function buildRecordTemplateDocumentNames(documents) {
    const byName = new Map();
    for (const documentRecord of documents) {
      if (!isRegisteredTemplateDocument(documentRecord)) continue;
      const documentName = stripTrailingTemplateLabel(documentRecord.document_name);
      if (!documentName) continue;
      const key = documentName.toLocaleLowerCase("en-US");
      if (!byName.has(key)) byName.set(key, documentName);
    }
    return [...byName.values()].sort((a, b) => a.localeCompare(b, "en", { sensitivity: "base" }));
  }

  function isRegisteredTemplateDocument(documentRecord) {
    return String(documentRecord.document_no || "").startsWith("XQT-")
      || documentRecord.category === "TEMPLATE";
  }

  function stripTrailingTemplateLabel(value) {
    return String(value || "")
      .trim()
      .replace(/\s*[-–—:_]?\s*template(?:[_\-\s]?[a-z]{2})?\s*$/i, "")
      .trim();
  }

  function syncRecordTemplateSelectionToDocumentName(options = {}) {
    if (state.selectedCategory !== "R" || !elements.documentNameSource || elements.documentNameSource.value !== "template") return false;
    if (!elements.documentNameTemplate || elements.documentNameTemplate.disabled) return false;

    const selectedName = elements.documentNameTemplate.value.trim();
    if (!selectedName) {
      elements.documentName.value = "";
      state.autoFilledRecordTemplateDocumentName = false;
      return false;
    }

    if (options.force || state.autoFilledRecordTemplateDocumentName || !elements.documentName.value.trim() || elements.documentName.disabled) {
      elements.documentName.value = selectedName;
      state.autoFilledRecordTemplateDocumentName = true;
      return true;
    }
    return false;
  }
})();`;
}

function lines(items) {
  return items.join("\n");
}

function replaceOnce(source, search, replacement) {
  if (source.includes(replacement)) return source;
  if (!source.includes(search)) return source;
  return source.replace(search, replacement);
}

function appendOnce(source, marker, addition) {
  if (source.includes(marker)) return source;
  return `${source.trimEnd()}${addition}\n`;
}
