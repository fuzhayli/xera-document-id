let currentUser = null;
const MVP_CATEGORIES = ["D", "R", "MD", "MR", "EC", "MARKETING", "QMS", "TEMPLATE", "SOP"];

const CATEGORY_LABELS = {
  D: "D (General Purpose Document)",
  R: "R (Record Purpose Document)",
  MD: "MD (Manufacturing Dynamic Document)",
  MR: "MR (Manufacturing Record Document)",
  EC: "EC (Engineering Change)",
  MARKETING: "MARKETING (Marketing Material ID)",
  QMS: "QMS (Quality Management)",
  TEMPLATE: "TEMPLATE (Template / QT)",
  SOP: "SOP (SOP / Instruction)"
};

const EXCEL_REFERENCE_OPTIONS = {
  D: ["N/A", "R&D", "QARA", "General", "GR10X", "GR10X-40K", "GR10X-50K", "VR10X-40K", "VR10X-50K", "GR10X-40KC1", "GR10X-50K2", "XEBT-W6"],
  R: ["N/A", "R&D", "QARA", "General", "GR10X", "GR10X-40K", "GR10X-50K", "VR10X-40K", "VR10X-50K", "GR10X-40KC1", "GR10X-50K2"],
  MANUFACTURING: ["N/A", "General", "GR10X", "GR10X-40K", "GR10X-50K", "VR10X-40K", "VR10X-50K", "GR10X-40KC1", "GR10X-50K2"],
  MARKETING: ["GR10X", "XEBTW6"],
  SOP_INCOMING: ["1501-1107"],
  TEMPLATE: ["05", "18"]
};

const state = {
  categories: [],
  myRequests: [],
  myPartRequests: [],
  myNotifications: [],
  requestFilter: "all",
  selectedCategory: null,
  previewValid: false,
  previewController: null,
  documentNoTouched: false,
  ecOrderDocumentNames: [],
  ecOrderDocumentNamesLoaded: false,
  autoFilledEcDocumentName: false,
  autoFilledSopDocumentName: false,
  activeView: "overview"
};

const elements = {
  apiStatus: document.getElementById("apiStatus"),
  overviewPanel: document.getElementById("overviewPanel"),
  dashboardState: document.getElementById("dashboardState"),
  refreshOverviewBtn: document.getElementById("refreshOverviewBtn"),
  overviewPendingCount: document.getElementById("overviewPendingCount"),
  overviewApprovedCount: document.getElementById("overviewApprovedCount"),
  overviewPublishedCount: document.getElementById("overviewPublishedCount"),
  overviewSequenceCount: document.getElementById("overviewSequenceCount"),
  overviewAuditCount: document.getElementById("overviewAuditCount"),
  partOverviewPendingCount: document.getElementById("partOverviewPendingCount"),
  partOverviewApprovedCount: document.getElementById("partOverviewApprovedCount"),
  partOverviewPublishedCount: document.getElementById("partOverviewPublishedCount"),
  partOverviewSequenceCount: document.getElementById("partOverviewSequenceCount"),
  partOverviewAuditCount: document.getElementById("partOverviewAuditCount"),
  notificationBadge: document.getElementById("notificationBadge"),
  recentActivityBody: document.getElementById("recentActivityBody"),
  viewAllActivityBtn: document.getElementById("viewAllActivityBtn"),
  overviewMessageBox: document.getElementById("overviewMessageBox"),
  categoryTabs: document.getElementById("categoryTabs"),
  categorySummary: document.getElementById("categorySummary"),
  currentUserName: document.getElementById("currentUserName"),
  adminLink: document.getElementById("adminLink"),
  userManagementLink: document.getElementById("userManagementLink"),
  adminControlViewLink: document.getElementById("adminControlViewLink"),
  userManagementViewLink: document.getElementById("userManagementViewLink"),
  logoutBtn: document.getElementById("logoutBtn"),
  viewSwitcher: document.getElementById("viewSwitcher"),
  overviewViewBtn: document.getElementById("overviewViewBtn"),
  newRequestViewBtn: document.getElementById("newRequestViewBtn"),
  myRequestsViewBtn: document.getElementById("myRequestsViewBtn"),
  requestPanel: document.getElementById("requestPanel"),
  previewPanel: document.getElementById("previewPanel"),
  myRequestsPanel: document.getElementById("myRequestsPanel"),
  form: document.getElementById("requestForm"),
  documentNo: document.getElementById("documentNo"),
  referenceType: document.getElementById("referenceType"),
  referenceLabel: document.getElementById("referenceLabel"),
  referenceValue: document.getElementById("referenceValue"),
  referenceOptions: document.getElementById("referenceOptions"),
  extraFields: document.getElementById("extraFields"),
  extraTypeField: document.getElementById("extraTypeField"),
  extraTypeLabel: document.getElementById("extraTypeLabel"),
  extraType: document.getElementById("extraType"),
  extraCodeField: document.getElementById("extraCodeField"),
  extraCodeLabel: document.getElementById("extraCodeLabel"),
  extraCode: document.getElementById("extraCode"),
  extraVersionField: document.getElementById("extraVersionField"),
  extraVersionLabel: document.getElementById("extraVersionLabel"),
  extraVersion: document.getElementById("extraVersion"),
  languageField: document.getElementById("languageField"),
  language: document.getElementById("language"),
  documentName: document.getElementById("documentName"),
  writtenBy: document.getElementById("writtenBy"),
  creationDate: document.getElementById("creationDate"),
  creationDateDisplay: document.getElementById("creationDateDisplay"),
  revision: document.getElementById("revision"),
  revisionField: document.getElementById("revisionField"),
  submitBtn: document.getElementById("submitBtn"),
  clearBtn: document.getElementById("clearBtn"),
  refreshRequestsBtn: document.getElementById("refreshRequestsBtn"),
  previewState: document.getElementById("previewState"),
  documentNoPreview: document.getElementById("documentNoPreview"),
  filenamePreview: document.getElementById("filenamePreview"),
  messageBox: document.getElementById("messageBox"),
  requestSuccessModal: document.getElementById("requestSuccessModal"),
  submittedRequestName: document.getElementById("submittedRequestName"),
  newRequestAfterSubmitBtn: document.getElementById("newRequestAfterSubmitBtn"),
  closeAfterSubmitBtn: document.getElementById("closeAfterSubmitBtn"),
  requestCount: document.getElementById("requestCount"),
  clearRequestFilterBtn: document.getElementById("clearRequestFilterBtn"),
  requestsBody: document.getElementById("requestsBody")
};

const referenceLabels = {
  model: "Model Name / ID",
  part: "Part Code",
  department: "Department",
  task: "Task",
  brand: "Brand",
  process: "Process No."
};

const CATEGORY_FORM_RULES = {
  D: {
    referenceType: "model",
    referencePlaceholder: "GR10X-40K",
    referenceOptions: EXCEL_REFERENCE_OPTIONS.D,
    usesRevision: true
  },
  R: {
    referenceType: "department",
    referencePlaceholder: "R&D",
    referenceOptions: EXCEL_REFERENCE_OPTIONS.R,
    usesRevision: false
  },
  MD: {
    referenceType: "model",
    referencePlaceholder: "GR10X-40K",
    referenceOptions: EXCEL_REFERENCE_OPTIONS.MANUFACTURING,
    usesRevision: true
  },
  MR: {
    referenceType: "model",
    referencePlaceholder: "GR10X-40K",
    referenceOptions: EXCEL_REFERENCE_OPTIONS.MANUFACTURING,
    usesRevision: false
  },
  EC: {
    referenceType: "model",
    referencePlaceholder: "GR10X-40K",
    referenceOptions: EXCEL_REFERENCE_OPTIONS.MANUFACTURING,
    usesRevision: true,
    extraSelect: {
      label: "EC Type",
      options: [
        ["R", "R - Request"],
        ["RR", "Rr - Related Request (with No.)"],
        ["E", "E - Evaluation"],
        ["O", "O - Order / Output"],
        ["N", "N - Notice"]
      ],
      selected: "R"
    },
    extraCode: {
      label: "EC Order",
      placeholder: "A",
      value: "A",
      options: { listId: "ecOrderOptions", maxLength: 1 }
    }
  },
  MARKETING: {
    referenceType: "model",
    referencePlaceholder: "GR10X",
    referenceOptions: EXCEL_REFERENCE_OPTIONS.MARKETING,
    usesRevision: false,
    extraSelect: {
      label: "Material Type",
      options: [
        ["CA", "CA - Catalogue"],
        ["BR", "BR - Brochure"],
        ["LE", "LE - Leaflet"],
        ["GE", "GE - General"]
      ],
      selected: "BR"
    },
    extraCode: {
      label: "Serial No",
      placeholder: "01",
      value: "01"
    },
    extraVersion: {
      label: "Version",
      placeholder: "1",
      value: "1"
    },
    language: "EN"
  },
  QMS: {
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
  SOP: {
    referenceType: "process",
    referencePlaceholder: "13",
    referenceOptions: ["13"],
    lockReferenceType: true,
    usesRevision: true,
    extraSelect: {
      label: "SOP Template",
      options: [
        ["STANDARD", "Standard SOP - XQS-{Process}-{No}"],
        ["INCOMING", "Incoming Inspection - XQS-{Part Code}"]
      ],
      selected: "STANDARD"
    }
  }
};

document.addEventListener("DOMContentLoaded", init);

// User Panel owns the request form. The backend remains authoritative for
// number allocation; this page only asks for previews and submits requests.
async function init() {
  applyEmbedMode();
  currentUser = await Auth.requireAuth();
  if (!currentUser) return;
  applyCurrentUser();
  syncCreationDate();

  bindEvents();

  try {
    await loadRules();
    setApiStatus(true);
    renderCategoryTabs();
    syncCategoryPanel();
    await setView(getInitialView(), { skipUrlUpdate: true });
  } catch (error) {
    setApiStatus(false);
    showOverviewMessage(error.message, "error");
  }
}

function bindEvents() {
  elements.overviewViewBtn.addEventListener("click", () => setView("overview"));
  elements.newRequestViewBtn.addEventListener("click", openNewRequest);
  elements.myRequestsViewBtn.addEventListener("click", () => openMyRequests("all"));
  elements.viewAllActivityBtn.addEventListener("click", () => openMyRequests("all"));
  elements.refreshOverviewBtn.addEventListener("click", loadDashboardOverview);
  elements.overviewPanel.addEventListener("click", handleOverviewCardClick);
  elements.logoutBtn.addEventListener("click", Auth.logout);
  elements.form.addEventListener("input", event => {
    if (event.target === elements.documentNo) state.documentNoTouched = true;
    if (event.target === elements.documentName) {
      state.autoFilledEcDocumentName = false;
      state.autoFilledSopDocumentName = false;
    }
    if (event.target === elements.extraCode && state.selectedCategory === "EC") {
      normalizeEcOrderInput();
      applyEcOrderDocumentName({ force: true });
    }
    if (event.target === elements.referenceValue) {
      applySopIncomingDocumentName();
    }
    hideSuccessActions();
    updatePreview();
  });
  elements.form.addEventListener("change", event => {
    hideSuccessActions();
    applyTemplateDependentFields();
    if (state.selectedCategory === "EC" && event.target === elements.extraCode) {
      normalizeEcOrderInput();
      applyEcOrderDocumentName({ force: true });
    }
    if (state.selectedCategory === "SOP" && event.target === elements.extraType) {
      applySopIncomingDocumentName({ force: true });
    }
    updateReferenceLabel();
    updatePreview();
  });
  elements.form.addEventListener("submit", submitRequest);
  elements.clearBtn.addEventListener("click", clearForm);
  elements.refreshRequestsBtn.addEventListener("click", refreshNewRequest);
  elements.clearRequestFilterBtn.addEventListener("click", () => openMyRequests("all"));
  elements.newRequestAfterSubmitBtn.addEventListener("click", resetRequestScreen);
  elements.closeAfterSubmitBtn.addEventListener("click", closeRequestScreen);
  window.addEventListener("popstate", () => setView(getInitialView(), { skipUrlUpdate: true }));
  window.addEventListener("xera-notifications-updated", loadDashboardOverview);
}

function openNewRequest() {
  if (state.activeView !== "new") {
    clearForm({ resetCategory: true });
  }
  setView("new");
}

function openMyRequests(filter = "all") {
  state.requestFilter = filter;
  setView("my");
}

function handleOverviewCardClick(event) {
  const partCard = event.target.closest("[data-part-request-filter]");
  if (partCard) {
    window.location.href = "/part-request.html#myPartRequestsPanel";
    return;
  }

  const card = event.target.closest("[data-request-filter]");
  if (!card) return;
  openMyRequests(card.dataset.requestFilter || "all");
}

function applyEmbedMode() {
  const params = new URLSearchParams(window.location.search);
  if (params.get("embed") !== "request") return;
  document.documentElement.classList.add("embed-pending");
  document.body.classList.add("embed-mode");
}

function getInitialView() {
  const params = new URLSearchParams(window.location.search);
  if (params.get("embed") === "request") return "new";
  const view = params.get("view");
  const filter = params.get("filter");
  state.requestFilter = ["pending", "approved", "published", "all"].includes(filter) ? filter : "all";
  return ["new", "my"].includes(view) ? view : "overview";
}

async function setView(view, options = {}) {
  state.activeView = view;
  if (!options.skipUrlUpdate) updateViewUrl(view);

  const showNew = view === "new";
  const showMy = view === "my";
  const showOverview = view === "overview";

  elements.overviewPanel.classList.toggle("hidden", !showOverview);
  elements.requestPanel.classList.toggle("hidden", !showNew);
  elements.previewPanel.classList.toggle("hidden", !showNew || !state.selectedCategory);
  elements.myRequestsPanel.classList.toggle("hidden", !showMy);
  elements.overviewViewBtn.classList.toggle("active", showOverview);
  elements.newRequestViewBtn.classList.toggle("active", showNew);
  elements.myRequestsViewBtn.classList.toggle("active", showMy);

  if (document.body.classList.contains("embed-mode") && showNew) {
    document.documentElement.classList.remove("embed-pending");
  }

  if (showOverview) await loadDashboardOverview();
  if (showMy) await loadRequests();
  if (showNew) {
    syncCategoryPanel();
    updatePreview();
  }
}

function updateViewUrl(view) {
  if (document.body.classList.contains("embed-mode")) return;
  const filterQuery = view === "my" && state.requestFilter !== "all"
    ? `&filter=${encodeURIComponent(state.requestFilter)}`
    : "";
  const nextUrl = view === "overview" ? "/" : `/?view=${encodeURIComponent(view)}${filterQuery}`;
  window.history.pushState({}, "", nextUrl);
}

function applyCurrentUser() {
  elements.currentUserName.textContent = `${currentUser.display_name} (${Auth.roleLabel(currentUser)})`;
  elements.writtenBy.value = currentUser ? currentUser.display_name : "";
  const canUseAdminControl = Auth.hasAnyPermission(currentUser, ["document_admin", "part_admin"]);
  const canManageUsers = Auth.hasPermission(currentUser, "user_admin");
  elements.adminLink.classList.toggle("hidden", !canUseAdminControl);
  elements.userManagementLink.classList.toggle("hidden", !canManageUsers);
  elements.adminControlViewLink.classList.toggle("hidden", !canUseAdminControl);
  elements.userManagementViewLink.classList.toggle("hidden", !canManageUsers);
}

async function loadRules() {
  const data = await apiGet("/api/rules");
  const categories = data.categories.filter(category =>
    MVP_CATEGORIES.includes(category.code) && category.implemented
  );
  if (!categories.some(category => category.code === "TEMPLATE")) {
    const qmsIndex = categories.findIndex(category => category.code === "QMS");
    const insertIndex = qmsIndex >= 0 ? qmsIndex + 1 : categories.length;
    categories.splice(insertIndex, 0, {
      code: "TEMPLATE",
      name: "Template / QT",
      prefix: "XQT",
      suffixType: "revision",
      requiresSequence: true,
      implemented: true,
      example: "XQT-05-01_Quotation Form Template_EN_r01"
    });
  }
  state.categories = categories;
}

function renderCategoryTabs() {
  elements.categoryTabs.innerHTML = "";

  for (const category of state.categories) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "category-tab";
    button.dataset.category = category.code;
    button.innerHTML = `<strong>${escapeHtml(category.code)}</strong><span>${escapeHtml(category.name)}</span>`;
    button.addEventListener("click", () => {
      state.selectedCategory = category.code;
      state.documentNoTouched = false;
      state.autoFilledEcDocumentName = false;
      state.autoFilledSopDocumentName = false;
      elements.documentNo.value = "";
      applyCategoryDefaults();
      renderCategoryTabs();
      syncCategoryPanel();
      updatePreview();
    });
    elements.categoryTabs.appendChild(button);
  }

  document.querySelectorAll(".category-tab").forEach(button => {
    button.classList.toggle("active", button.dataset.category === state.selectedCategory);
  });
}

function syncCategoryPanel() {
  const hasCategory = Boolean(state.selectedCategory);
  elements.requestPanel.classList.toggle("waiting-category", !hasCategory);
  elements.form.classList.toggle("hidden", !hasCategory);
  elements.previewPanel.classList.toggle("hidden", state.activeView !== "new" || !hasCategory);
  if (!hasCategory) resetPreview();
}

function applyCategoryDefaults() {
  const category = currentCategory();
  if (!category) {
    elements.categorySummary.textContent = "Document Type";
    hideExtraFields();
    setReferenceOptions([]);
    setReferenceTypeLocked(false);
    updateReferenceLabel();
    return;
  }

  const formRule = CATEGORY_FORM_RULES[category.code] || {};
  elements.categorySummary.textContent = CATEGORY_LABELS[category.code] || `${category.code} document`;
  hideExtraFields();

  if (formRule.referenceType) elements.referenceType.value = formRule.referenceType;
  elements.referenceValue.placeholder = formRule.referencePlaceholder || "Reference";
  setReferenceOptions(formRule.referenceOptions || []);
  setReferenceTypeLocked(Boolean(formRule.lockReferenceType));
  applyExtraFieldRules(formRule);

  if (category.code === "EC") {
    loadEcOrderDocumentNames().then(() => {
      if (state.selectedCategory !== "EC") return;
      if (applyEcOrderDocumentName()) updatePreview();
    });
  }

  elements.revisionField.classList.toggle("hidden", !formRule.usesRevision);
  if (!formRule.usesRevision) elements.revision.value = "r00";

  updateReferenceLabel();
  applyTemplateDependentFields();
}

function applyExtraFieldRules(formRule) {
  if (formRule.extraSelect) {
    showExtraSelect(formRule.extraSelect.label, formRule.extraSelect.options, formRule.extraSelect.selected);
  }
  if (formRule.extraCode) {
    showExtraCode(
      formRule.extraCode.label,
      formRule.extraCode.placeholder,
      formRule.extraCode.value,
      formRule.extraCode.options || {}
    );
  }
  if (formRule.extraVersion) {
    showExtraVersion(formRule.extraVersion.label, formRule.extraVersion.placeholder, formRule.extraVersion.value);
  }
  if (formRule.language) {
    showLanguage(formRule.language);
  }
}

function hideExtraFields() {
  elements.extraFields.classList.add("hidden");
  elements.extraTypeField.classList.add("hidden");
  elements.extraCodeField.classList.add("hidden");
  elements.extraVersionField.classList.add("hidden");
  elements.languageField.classList.add("hidden");
}

function showExtraSelect(label, options, selected) {
  elements.extraFields.classList.remove("hidden");
  elements.extraTypeField.classList.remove("hidden");
  elements.extraTypeLabel.textContent = label;
  elements.extraType.innerHTML = options
    .map(([value, text]) => `<option value="${escapeHtml(value)}">${escapeHtml(text)}</option>`)
    .join("");
  elements.extraType.value = selected;
}

function showExtraCode(label, placeholder, value, options = {}) {
  elements.extraFields.classList.remove("hidden");
  elements.extraCodeField.classList.remove("hidden");
  elements.extraCodeLabel.textContent = label;
  elements.extraCode.placeholder = placeholder;
  elements.extraCode.value = value;
  if (options.listId) {
    elements.extraCode.setAttribute("list", options.listId);
  } else {
    elements.extraCode.removeAttribute("list");
  }
  if (options.maxLength) {
    elements.extraCode.setAttribute("maxlength", String(options.maxLength));
  } else {
    elements.extraCode.removeAttribute("maxlength");
  }
}

function showExtraVersion(label, placeholder, value) {
  elements.extraFields.classList.remove("hidden");
  elements.extraVersionField.classList.remove("hidden");
  elements.extraVersionLabel.textContent = label;
  elements.extraVersion.placeholder = placeholder;
  elements.extraVersion.value = value;
}

function showLanguage(value) {
  elements.extraFields.classList.remove("hidden");
  elements.languageField.classList.remove("hidden");
  elements.language.value = value;
}

function setReferenceOptions(options) {
  elements.referenceOptions.innerHTML = options
    .map(option => `<option value="${escapeHtml(option)}"></option>`)
    .join("");
}

function setReferenceTypeLocked(isLocked) {
  elements.referenceType.disabled = Boolean(isLocked);
  elements.referenceType.closest(".field")?.classList.toggle("locked-field", Boolean(isLocked));
}

async function loadEcOrderDocumentNames() {
  if (state.ecOrderDocumentNamesLoaded) return;

  const [documentsResult, requestsResult] = await Promise.allSettled([
    apiGet("/api/documents"),
    apiGet("/api/requests/my")
  ]);

  const documents = documentsResult.status === "fulfilled" ? documentsResult.value.documents || [] : [];
  const requests = requestsResult.status === "fulfilled" ? requestsResult.value.requests || [] : [];
  state.ecOrderDocumentNames = buildEcOrderDocumentNames(documents, requests);
  state.ecOrderDocumentNamesLoaded = true;
}

function buildEcOrderDocumentNames(documents, requests) {
  const entries = [];

  for (const documentRecord of documents) {
    if (documentRecord.category !== "EC") continue;
    const meta = parseEcDocumentNo(documentRecord.document_no);
    if (!meta || !documentRecord.document_name) continue;
    entries.push({
      year_yy: documentRecord.year_yy || meta.year_yy,
      order: meta.order,
      document_name: documentRecord.document_name,
      document_no: documentRecord.document_no,
      sort_at: documentRecord.approved_at || documentRecord.created_at || "",
      priority: getEcOrderNamePriority(meta, "approved")
    });
  }

  for (const request of requests) {
    if (request.category !== "EC" || !["pending", "approved"].includes(request.status)) continue;
    const payload = parseJsonObject(request.payload_json);
    const meta = parseEcDocumentNo(request.document_no);
    const order = normalizeEcOrderValue(payload.detail_code || request.detail_code || (meta && meta.order));
    const yearYy = request.year_yy || payload.year_yy || (meta && meta.year_yy);
    if (!order || !yearYy || !request.document_name) continue;
    entries.push({
      year_yy: yearYy,
      order,
      document_name: request.document_name,
      document_no: request.document_no,
      sort_at: request.created_at || request.updated_at || "",
      priority: getEcOrderNamePriority(meta, request.status)
    });
  }

  entries.sort((a, b) => {
    if (a.priority !== b.priority) return b.priority - a.priority;
    return String(b.sort_at || "").localeCompare(String(a.sort_at || ""));
  });

  const byOrderAndYear = new Map();
  for (const entry of entries) {
    const key = `${entry.year_yy}:${entry.order}`;
    if (!byOrderAndYear.has(key)) byOrderAndYear.set(key, entry);
  }
  return [...byOrderAndYear.values()];
}

function parseEcDocumentNo(documentNo) {
  const match = String(documentNo || "").trim().match(/^XEC-(\d{2})([A-Z])-(Rr|RR|R|E|O|N)(?:-(\d{2,3}))?$/i);
  if (!match) return null;
  return {
    year_yy: match[1],
    order: match[2].toUpperCase(),
    type: match[3].toUpperCase() === "RR" ? "Rr" : match[3].toUpperCase(),
    sequence_no: match[4] || ""
  };
}

function getEcOrderNamePriority(meta, status) {
  let priority = status === "pending" ? 20 : 10;
  if (meta && meta.type === "R" && !meta.sequence_no) priority += 100;
  return priority;
}

function applyEcOrderDocumentName(options = {}) {
  if (state.selectedCategory !== "EC") return false;
  const order = normalizeEcOrderInput();
  if (!order) return false;

  const match = findEcOrderDocumentName(order);
  if (match && (options.force || state.autoFilledEcDocumentName || !elements.documentName.value.trim())) {
    elements.documentName.value = match.document_name;
    state.autoFilledEcDocumentName = true;
    return true;
  }

  if (!match && state.autoFilledEcDocumentName) {
    elements.documentName.value = "";
    state.autoFilledEcDocumentName = false;
    return true;
  }

  return false;
}

function findEcOrderDocumentName(order) {
  const selectedYear = getSelectedYearYy();
  const sameYear = state.ecOrderDocumentNames.find(entry => entry.order === order && entry.year_yy === selectedYear);
  if (sameYear) return sameYear;
  return state.ecOrderDocumentNames
    .filter(entry => entry.order === order)
    .sort((a, b) => String(b.year_yy || "").localeCompare(String(a.year_yy || "")))[0] || null;
}

function getSelectedYearYy() {
  const creationDate = syncCreationDate();
  return creationDate.slice(2, 4);
}

function normalizeEcOrderInput() {
  const normalized = normalizeEcOrderValue(elements.extraCode.value) || "";
  if (elements.extraCode.value !== normalized) elements.extraCode.value = normalized;
  return normalized;
}

function normalizeEcOrderValue(value) {
  const match = String(value || "").trim().toUpperCase().match(/[A-Z]/);
  return match ? match[0] : "";
}

function parseJsonObject(value) {
  try {
    const parsed = JSON.parse(value || "{}");
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch (error) {
    return {};
  }
}

function applyTemplateDependentFields() {
  const category = currentCategory();
  if (!category) return;

  if (category.code === "SOP") {
    const incoming = elements.extraType.value === "INCOMING";
    elements.referenceType.value = incoming ? "part" : "process";
    elements.referenceValue.placeholder = incoming ? "1501-1107" : "13";
    setReferenceOptions(incoming ? EXCEL_REFERENCE_OPTIONS.SOP_INCOMING : ["13"]);
    setReferenceTypeLocked(true);
    if (!incoming && state.autoFilledSopDocumentName) {
      elements.documentName.value = "";
      state.autoFilledSopDocumentName = false;
    }
    if (incoming) applySopIncomingDocumentName();
  }
}

function applySopIncomingDocumentName(options = {}) {
  if (state.selectedCategory !== "SOP" || elements.extraType.value !== "INCOMING") return false;

  const partCode = elements.referenceValue.value.trim();
  if (!partCode) {
    if (state.autoFilledSopDocumentName) {
      elements.documentName.value = "";
      state.autoFilledSopDocumentName = false;
      return true;
    }
    return false;
  }

  const nextName = `${partCode} Incoming Inspection SOP`;
  if (options.force || state.autoFilledSopDocumentName || !elements.documentName.value.trim()) {
    elements.documentName.value = nextName;
    state.autoFilledSopDocumentName = true;
    return true;
  }

  return false;
}

function updateReferenceLabel() {
  const type = elements.referenceType.value;
  elements.referenceLabel.textContent = referenceLabels[type] || "Reference";
}

function collectFormData() {
  const isTemplate = state.selectedCategory === "TEMPLATE";
  const creationDate = syncCreationDate();
  return {
    category: isTemplate ? "QMS" : (state.selectedCategory || ""),
    document_no: state.documentNoTouched ? elements.documentNo.value : "",
    reference_type: elements.referenceType.value,
    reference_value: elements.referenceValue.value,
    document_name: elements.documentName.value,
    written_by: currentUser ? currentUser.display_name : elements.writtenBy.value,
    creation_date: creationDate,
    revision: elements.revision.value || "r00",
    control_status: "controlled",
    detail_type: isTemplate ? "QT" : elements.extraType.value,
    detail_code: elements.extraCode.value,
    detail_version: elements.extraVersion.value,
    language: elements.language.value
  };
}

function updatePreview() {
  if (state.activeView !== "new" || !state.selectedCategory) {
    resetPreview();
    return;
  }
  window.clearTimeout(updatePreview.timer);
  updatePreview.timer = window.setTimeout(loadPreview, 220);
}

async function loadPreview() {
  // Preview runs on every meaningful input change. It is debounced by
  // updatePreview() so typing does not flood the backend.
  if (state.previewController) state.previewController.abort();
  state.previewController = new AbortController();

  elements.previewState.textContent = "Checking";
  elements.submitBtn.disabled = true;

  try {
    const data = await apiPost("/api/preview", collectFormData(), state.previewController.signal);
    state.previewValid = Boolean(data.valid);

    if (data.valid) {
      if (!state.documentNoTouched || !elements.documentNo.value.trim()) {
        elements.documentNo.value = data.document_no_preview;
      }
      elements.documentNoPreview.textContent = data.document_no_preview;
      elements.filenamePreview.textContent = data.generated_filename_preview;
      elements.previewState.textContent = "Valid";
      elements.submitBtn.disabled = false;
      hideMessage();
    } else {
      renderPreviewErrors(data.errors || ["Validation failed."]);
    }
  } catch (error) {
    if (error.name === "AbortError") return;
    renderPreviewErrors([error.message]);
  }
}

function resetPreview() {
  window.clearTimeout(updatePreview.timer);
  if (state.previewController) state.previewController.abort();
  state.previewController = null;
  state.previewValid = false;
  elements.previewState.textContent = "Waiting for input";
  elements.documentNoPreview.textContent = "-";
  elements.filenamePreview.textContent = "-";
  elements.submitBtn.disabled = true;
  hideMessage();
}

function renderPreviewErrors(errors) {
  state.previewValid = false;
  elements.documentNoPreview.textContent = "-";
  elements.filenamePreview.textContent = "-";
  elements.previewState.textContent = "Check required";
  elements.submitBtn.disabled = true;
  showMessage(errors.join(" "), "warning");
}

async function submitRequest(event) {
  event.preventDefault();
  elements.submitBtn.disabled = true;

  try {
    const data = await apiPost("/api/requests", collectFormData());
    state.previewValid = false;
    showRequestSubmitted(data.request);
    window.parent?.postMessage({ type: "xera-request-created", requestId: data.request.id }, "*");
    await Promise.all([loadRequests(), loadDashboardOverview()]);
  } catch (error) {
    showMessage(error.message, "error");
    hideSuccessActions();
  } finally {
    elements.submitBtn.disabled = !state.previewValid;
  }
}

async function loadRequests() {
  const requests = await loadMyRequests();
  renderRequests(requests);
}

async function loadDashboardOverview() {
  elements.dashboardState.textContent = "Loading";
  hideOverviewMessage();

  try {
    const [requests, partRequests, notifications] = await Promise.all([
      loadMyRequests(),
      loadMyPartRequests(),
      loadMyNotifications()
    ]);
    const documentOverview = buildOverviewFromRequests(requests, notifications);
    const partOverview = buildPartOverviewFromRequests(partRequests, notifications);
    renderDashboardOverview(documentOverview);
    renderPartDashboardOverview(partOverview);
    renderRecentActivity(requests, partRequests);
    updateNotificationBadge(countUnreadNotifications(notifications));
    elements.dashboardState.textContent = "Ready";
    setApiStatus(true);
  } catch (error) {
    elements.dashboardState.textContent = "Check required";
    setApiStatus(false);
    showOverviewMessage(error.message, "error");
  }
}

async function loadMyRequests() {
  const data = await apiGet("/api/requests/my");
  state.myRequests = data.requests || [];
  return state.myRequests;
}

async function loadMyPartRequests() {
  const data = await apiGet("/api/parts/requests/my");
  state.myPartRequests = data.requests || [];
  return state.myPartRequests;
}

async function loadMyNotifications() {
  const data = await apiGet("/api/notifications/my");
  state.myNotifications = data.notifications || [];
  return state.myNotifications;
}

function countUnreadNotifications(notifications) {
  return notifications.filter(notification => notification.status === "unread").length;
}

function buildOverviewFromRequests(requests, notifications = []) {
  return {
    notifications: countUnreadEntityNotifications(notifications, "document_record"),
    created: requests.length,
    reviewed: requests.filter(request => isReviewedByAdmin(request)).length,
    sequences: new Set(
      requests
        .filter(request => request.sequence_no && request.sequence_no !== "000")
        .map(request => `${request.category}-${request.year_yy}-${request.sequence_no}`)
    ).size,
    audit_events: requests.length
  };
}

function buildPartOverviewFromRequests(requests, notifications = []) {
  return {
    notifications: countUnreadPartNotifications(notifications),
    created: requests.length,
    reviewed: requests.filter(request => isReviewedByAdmin(request)).length,
    sequences: new Set(
      requests
        .filter(request => request.sequence_no)
        .map(request => `${request.project_code}-${request.main_code}-${request.sequence_no}`)
    ).size,
    audit_events: requests.length
  };
}

function renderDashboardOverview(overview) {
  elements.overviewPendingCount.textContent = overview.notifications || 0;
  elements.overviewApprovedCount.textContent = overview.created || 0;
  elements.overviewPublishedCount.textContent = overview.reviewed || 0;
  elements.overviewSequenceCount.textContent = overview.sequences || 0;
  elements.overviewAuditCount.textContent = overview.audit_events || 0;
}

function renderPartDashboardOverview(overview) {
  elements.partOverviewPendingCount.textContent = overview.notifications || 0;
  elements.partOverviewApprovedCount.textContent = overview.created || 0;
  elements.partOverviewPublishedCount.textContent = overview.reviewed || 0;
  elements.partOverviewSequenceCount.textContent = overview.sequences || 0;
  elements.partOverviewAuditCount.textContent = overview.audit_events || 0;
}

function countUnreadEntityNotifications(notifications, entityType) {
  return notifications.filter(notification =>
    notification.status === "unread" && notification.entity_type === entityType
  ).length;
}

function countUnreadPartNotifications(notifications) {
  return notifications.filter(notification =>
    notification.status === "unread" && isPartNotification(notification)
  ).length;
}

function isPartNotification(notification) {
  if (["part_record", "part_request", "part_revision_request"].includes(notification.entity_type)) return true;
  if (String(notification.type || "").startsWith("part_")) return true;
  return parseNotificationMetadata(notification).domain === "part";
}

function parseNotificationMetadata(notification) {
  try {
    return JSON.parse(notification.metadata_json || "{}") || {};
  } catch {
    return {};
  }
}

function isReviewedByAdmin(request) {
  return request.status === "approved"
    && request.checked_by
    && request.checked_by !== "Auto Published";
}

function renderRecentActivity(requests, partRequests) {
  const documentRows = requests.map(request => ({
    item: request.document_no || request.generated_filename || `${request.category || "DOC"} Request`,
    description: request.document_name || request.reference_value || "-",
    type: "Document Request",
    status: request.status,
    user: currentUser ? currentUser.display_name : "-",
    date: request.created_at,
    icon: "document"
  }));

  const partRows = partRequests.map(request => ({
    item: request.part_number || "Part Request",
    description: request.part_name || request.description || "-",
    type: "Part Request",
    status: request.status,
    user: request.requested_by || (currentUser ? currentUser.display_name : "-"),
    date: request.created_at,
    icon: "part"
  }));

  const rows = [...documentRows, ...partRows]
    .sort((a, b) => String(b.date || "").localeCompare(String(a.date || "")))
    .slice(0, 5);

  if (rows.length === 0) {
    elements.recentActivityBody.innerHTML = '<tr><td colspan="5" class="empty-cell">No recent activity</td></tr>';
    return;
  }

  elements.recentActivityBody.innerHTML = rows.map(row => `
    <tr>
      <td>
        <span class="activity-item">
          <span class="activity-icon activity-icon-${escapeHtml(row.icon)}">${activityIcon(row.icon)}</span>
          <span>
            <strong>${escapeHtml(row.item)}</strong>
            <small>${escapeHtml(row.description)}</small>
          </span>
        </span>
      </td>
      <td><span class="type-pill">${escapeHtml(row.type)}</span></td>
      <td><span class="status-pill status-${escapeHtml(row.status)}">${escapeHtml(formatStatus(row.status))}</span></td>
      <td>${escapeHtml(row.user)}</td>
      <td>${escapeHtml(formatDateTime(row.date))}</td>
    </tr>
  `).join("");
}

function updateNotificationBadge(count) {
  if (!elements.notificationBadge) return;
  elements.notificationBadge.textContent = count > 99 ? "99+" : String(count);
  elements.notificationBadge.classList.toggle("hidden", count === 0);
}

function renderRequests(requests) {
  const filteredRequests = filterRequests(requests, state.requestFilter);
  const filterLabel = getRequestFilterLabel(state.requestFilter);
  elements.requestCount.textContent = state.requestFilter === "all"
    ? `${filteredRequests.length} records`
    : `${filteredRequests.length} ${filterLabel.toLowerCase()} records`;
  elements.clearRequestFilterBtn.classList.toggle("hidden", state.requestFilter === "all");

  if (filteredRequests.length === 0) {
    elements.requestsBody.innerHTML = '<tr><td colspan="7" class="empty-cell">No records</td></tr>';
    return;
  }

  elements.requestsBody.innerHTML = filteredRequests.map(request => {
    const docNo = request.document_no || request.generated_filename || "-";
    return `
      <tr>
        <td><span class="status-pill status-${escapeHtml(request.status)}">${escapeHtml(request.status)}</span></td>
        <td>${escapeHtml(formatRequestCategory(request))}</td>
        <td>${escapeHtml(docNo)}</td>
        <td>${escapeHtml(request.document_name)}</td>
        <td>${escapeHtml(request.reference_value || "-")}</td>
        <td>${escapeHtml(request.creation_date)}</td>
        <td>${escapeHtml(request.checked_by || "-")}</td>
      </tr>
    `;
  }).join("");
}

function formatRequestCategory(request) {
  if (String(request.document_no || "").startsWith("XQT-")) return CATEGORY_LABELS.TEMPLATE || "TEMPLATE";
  return CATEGORY_LABELS[request.category] || request.category || "-";
}

function filterRequests(requests, filter) {
  if (filter === "published") return requests.filter(request => request.status === "approved");
  if (filter === "pending" || filter === "approved") {
    return requests.filter(request => request.status === filter);
  }
  return requests;
}

function getRequestFilterLabel(filter) {
  const labels = {
    pending: "Pending",
    approved: "Approved",
    published: "Published"
  };
  return labels[filter] || "All";
}

function formatStatus(status) {
  const labels = {
    pending: "Pending",
    approved: "Approved",
    rejected: "Rejected",
    published: "Published",
    completed: "Completed"
  };
  return labels[status] || status || "-";
}

function formatDateTime(value) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("tr-TR", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  });
}

function activityIcon(type) {
  if (type === "part") {
    return '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m21 8-9-5-9 5 9 5 9-5Z"></path><path d="M3 8v8l9 5 9-5V8"></path></svg>';
  }
  return '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 3h8l4 4v14H7z"></path><path d="M15 3v5h5"></path><path d="M12 12v6"></path><path d="M9 15h6"></path></svg>';
}

function clearForm(options = {}) {
  if (options.resetCategory) {
    state.selectedCategory = null;
    renderCategoryTabs();
  }
  state.documentNoTouched = false;
  state.autoFilledEcDocumentName = false;
  state.autoFilledSopDocumentName = false;
  elements.documentNo.value = "";
  elements.referenceValue.value = "";
  elements.documentName.value = "";
  elements.revision.value = "r00";
  syncCreationDate();
  hideMessage();
  hideSuccessActions();
  if (state.selectedCategory) applyCategoryDefaults();
  syncCategoryPanel();
  updatePreview();
}

function syncCreationDate() {
  const today = XeraTime.todayDateValue();
  elements.creationDate.value = today;
  if (elements.creationDateDisplay) elements.creationDateDisplay.textContent = today || "Today";
  return today;
}

function resetRequestScreen() {
  clearForm({ resetCategory: true });
}

async function refreshNewRequest() {
  await loadRules();
  if (state.selectedCategory && !state.categories.some(category => category.code === state.selectedCategory)) {
    state.selectedCategory = null;
  }
  renderCategoryTabs();
  if (state.selectedCategory) applyCategoryDefaults();
  syncCategoryPanel();
  updatePreview();
}

function showRequestSubmitted(request) {
  const requestName = request.generated_filename || request.document_no || `#${request.id}`;
  showMessage(`Request submitted and auto-published: ${requestName}`, "success");
  elements.submittedRequestName.textContent = requestName;
  elements.requestSuccessModal.classList.remove("hidden");
  document.body.classList.add("modal-open");
  elements.submitBtn.disabled = true;
}

function hideSuccessActions() {
  elements.requestSuccessModal.classList.add("hidden");
  document.body.classList.remove("modal-open");
}

function closeRequestScreen() {
  hideSuccessActions();
  const params = new URLSearchParams(window.location.search);
  if (params.get("embed") === "request") {
    window.parent?.postMessage({ type: "xera-request-close" }, "*");
    return;
  }
  window.location.href = "/documents.html";
}

function currentCategory() {
  return state.categories.find(category => category.code === state.selectedCategory) || null;
}

async function apiGet(path) {
  const response = await fetch(path, {
    headers: Auth.authHeaders()
  });
  return parseResponse(response);
}

async function apiPost(path, body, signal) {
  const response = await fetch(path, {
    method: "POST",
    headers: {
      ...Auth.authHeaders(),
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
    signal
  });
  return parseResponse(response);
}

async function parseResponse(response) {
  const data = await response.json();
  if (!response.ok) {
    const message = data.message || (data.errors && data.errors.join(" ")) || "Request failed.";
    throw new Error(message);
  }
  return data;
}

function showMessage(message, type) {
  elements.messageBox.textContent = message;
  elements.messageBox.className = `message-box ${type}`;
}

function hideMessage() {
  elements.messageBox.className = "message-box hidden";
  elements.messageBox.textContent = "";
}

function showOverviewMessage(message, type) {
  elements.overviewMessageBox.textContent = message;
  elements.overviewMessageBox.className = `message-box ${type}`;
}

function hideOverviewMessage() {
  elements.overviewMessageBox.className = "message-box hidden";
  elements.overviewMessageBox.textContent = "";
}

function setApiStatus(isOnline) {
  elements.apiStatus.className = `status-dot ${isOnline ? "status-ok" : "status-muted"}`;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

// record-template-document-name-20260609
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
})();
