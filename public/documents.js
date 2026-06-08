const state = {
  documents: [],
  currentUser: null,
  selectedDocument: null
};

const API_BASE = window.location.protocol === "file:" ? "http://localhost:32680" : "";

const CATEGORY_LABELS = {
  D: "D (General Purpose Document)",
  R: "R (Record Purpose Document)",
  MD: "MD (Manufacturing Dynamic Document)",
  MR: "MR (Manufacturing Record Document)",
  EC: "EC (Engineering Change)",
  QMS: "QMS (Quality Management)",
  SOP: "SOP (SOP / Instruction)",
  MARKETING: "MARKETING (Marketing Material ID)"
};
const REVISION_CATEGORIES = ["D", "MD", "EC", "QMS", "SOP"];
const DOCUMENT_SEARCH_SCOPE_ID = "documentSearchScope";
const DOCUMENT_SEARCH_FIELDS = {
  document_no: documentRecord => documentRecord.document_no,
  category: documentRecord => [documentRecord.category, formatCategory(documentRecord.category)],
  year: documentRecord => documentRecord.year_yy,
  revision: documentRecord => documentRecord.revision,
  filename: documentRecord => documentRecord.generated_filename,
  document_name: documentRecord => documentRecord.document_name,
  reference: documentRecord => documentRecord.reference_value,
  written_by: documentRecord => documentRecord.written_by,
  creation_date: documentRecord => documentRecord.creation_date,
  checked_by: documentRecord => documentRecord.checked_by,
  reviewed_at: documentRecord => [documentRecord.approved_at, documentRecord.approved_at ? formatDateTime(documentRecord.approved_at) : ""],
  revision_updated: documentRecord => [documentRecord.revision_updated_at, documentRecord.revision_updated_at ? formatDateTime(documentRecord.revision_updated_at) : ""]
};

const elements = {
  apiStatus: document.getElementById("apiStatus"),
  documentState: document.getElementById("documentState"),
  documentCount: document.getElementById("documentCount"),
  refreshBtn: document.getElementById("refreshBtn"),
  openRequestModalBtn: document.getElementById("openRequestModalBtn"),
  openRequestModalPanelBtn: document.getElementById("openRequestModalPanelBtn"),
  adminControlLink: document.getElementById("adminControlLink"),
  userManagementLink: document.getElementById("userManagementLink"),
  deletedItemsLink: document.getElementById("deletedItemsLink"),
  requestModal: document.getElementById("requestModal"),
  requestModalBackdrop: document.getElementById("requestModalBackdrop"),
  closeRequestModalBtn: document.getElementById("closeRequestModalBtn"),
  requestFrame: document.getElementById("requestFrame"),
  documentActionModal: document.getElementById("documentActionModal"),
  documentActionBackdrop: document.getElementById("documentActionBackdrop"),
  closeDocumentActionBtn: document.getElementById("closeDocumentActionBtn"),
  documentActionTitle: document.getElementById("documentActionTitle"),
  documentActionMeta: document.getElementById("documentActionMeta"),
  documentEditBtn: document.getElementById("documentEditBtn"),
  documentEditForm: document.getElementById("documentEditForm"),
  documentEditMessage: document.getElementById("documentEditMessage"),
  documentEditCategory: document.getElementById("documentEditCategory"),
  documentEditCompanyCode: document.getElementById("documentEditCompanyCode"),
  documentEditYearYy: document.getElementById("documentEditYearYy"),
  documentEditSequenceNo: document.getElementById("documentEditSequenceNo"),
  documentEditRevision: document.getElementById("documentEditRevision"),
  documentEditDocumentNo: document.getElementById("documentEditDocumentNo"),
  documentEditGeneratedFilename: document.getElementById("documentEditGeneratedFilename"),
  documentEditReferenceType: document.getElementById("documentEditReferenceType"),
  documentEditReferenceValue: document.getElementById("documentEditReferenceValue"),
  documentEditDocumentName: document.getElementById("documentEditDocumentName"),
  documentEditWrittenBy: document.getElementById("documentEditWrittenBy"),
  documentEditCreationDate: document.getElementById("documentEditCreationDate"),
  documentEditControlStatus: document.getElementById("documentEditControlStatus"),
  documentEditDetailType: document.getElementById("documentEditDetailType"),
  documentEditDetailCode: document.getElementById("documentEditDetailCode"),
  documentEditDetailVersion: document.getElementById("documentEditDetailVersion"),
  documentEditLanguage: document.getElementById("documentEditLanguage"),
  cancelDocumentEditBtn: document.getElementById("cancelDocumentEditBtn"),
  saveDocumentEditBtn: document.getElementById("saveDocumentEditBtn"),
  documentRevisionRequestBtn: document.getElementById("documentRevisionRequestBtn"),
  documentDeleteBtn: document.getElementById("documentDeleteBtn"),
  documentDeleteConfirm: document.getElementById("documentDeleteConfirm"),
  cancelDocumentDeleteBtn: document.getElementById("cancelDocumentDeleteBtn"),
  confirmDocumentDeleteBtn: document.getElementById("confirmDocumentDeleteBtn"),
  filterForm: document.getElementById("filterForm"),
  searchInput: document.getElementById("searchInput"),
  categoryFilter: document.getElementById("categoryFilter"),
  yearFilter: document.getElementById("yearFilter"),
  clearFiltersBtn: document.getElementById("clearFiltersBtn"),
  documentsBody: document.getElementById("documentsBody")
};

document.addEventListener("DOMContentLoaded", init);

// Document List is the public landing page. Logged-in users get request actions;
// admins additionally see links back to admin-only screens.
async function init() {
  elements.refreshBtn.addEventListener("click", loadDocuments);
  elements.openRequestModalBtn.addEventListener("click", openRequestModal);
  elements.openRequestModalPanelBtn.addEventListener("click", openRequestModal);
  elements.closeRequestModalBtn.addEventListener("click", closeRequestModal);
  elements.requestModalBackdrop.addEventListener("click", closeRequestModal);
  elements.closeDocumentActionBtn.addEventListener("click", closeDocumentActionModal);
  elements.documentActionBackdrop.addEventListener("click", closeDocumentActionModal);
  elements.documentEditBtn.addEventListener("click", showDocumentEditForm);
  elements.documentEditForm.addEventListener("submit", submitDocumentEdit);
  elements.cancelDocumentEditBtn.addEventListener("click", hideDocumentEditForm);
  elements.documentRevisionRequestBtn.addEventListener("click", submitSelectedRevisionRequest);
  elements.documentDeleteBtn.addEventListener("click", showDocumentDeleteConfirm);
  elements.cancelDocumentDeleteBtn.addEventListener("click", hideDocumentDeleteConfirm);
  elements.confirmDocumentDeleteBtn.addEventListener("click", deleteSelectedDocument);
  window.addEventListener("message", event => {
    if (event.data && event.data.type === "xera-request-created") {
      elements.documentState.textContent = "Request created and published. Refreshing list.";
    }
    if (event.data && event.data.type === "xera-request-close") {
      closeRequestModal();
    }
  });
  elements.filterForm.addEventListener("input", renderDocuments);
  elements.filterForm.addEventListener("change", renderDocuments);
  elements.clearFiltersBtn.addEventListener("click", clearFilters);
  elements.documentsBody.addEventListener("click", handleDocumentAction);
  await applySessionLinks();
  await loadDocuments();
}

async function applySessionLinks() {
  const user = await Auth.me();
  state.currentUser = user;
  elements.adminControlLink.classList.toggle("hidden", !Auth.hasPermission(user, "document_admin"));
  elements.userManagementLink.classList.toggle("hidden", !Auth.hasPermission(user, "user_admin"));
  elements.deletedItemsLink.classList.toggle("hidden", !Auth.hasPermission(user, "document_admin"));
}

function openRequestModal() {
  if (!Auth.getToken()) {
    window.location.href = `/login.html?next=${encodeURIComponent("/documents.html")}`;
    return;
  }
  const requestUrl = `${API_BASE}/?embed=request&view=new`;
  if (!elements.requestFrame.src) {
    elements.requestFrame.src = requestUrl;
  }
  elements.requestModal.classList.remove("hidden");
  document.body.classList.add("modal-open");
}

async function closeRequestModal() {
  elements.requestModal.classList.add("hidden");
  document.body.classList.remove("modal-open");
  await loadDocuments();
}

async function loadDocuments() {
  elements.documentState.textContent = "Loading";

  try {
    const data = await apiGet("/api/documents");
    state.documents = data.documents || [];
    populateYearFilter(state.documents);
    renderDocuments();
    setApiStatus(true);
    elements.documentState.textContent = "Ready";
  } catch (error) {
    setApiStatus(false);
    elements.documentState.textContent = error.message;
    renderDocuments([]);
  }
}

function populateYearFilter(documents) {
  const selected = elements.yearFilter.value;
  const years = [...new Set(documents.map(documentRecord => documentRecord.year_yy).filter(Boolean))]
    .sort((a, b) => b.localeCompare(a));

  elements.yearFilter.innerHTML = '<option value="">All</option>';
  for (const year of years) {
    const option = document.createElement("option");
    option.value = year;
    option.textContent = year;
    elements.yearFilter.appendChild(option);
  }

  if (years.includes(selected)) elements.yearFilter.value = selected;
}

function renderDocuments() {
  const filtered = getFilteredDocuments();
  elements.documentCount.textContent = `${filtered.length} of ${state.documents.length} records`;

  if (filtered.length === 0) {
    elements.documentsBody.innerHTML = '<tr><td colspan="12" class="empty-cell">No official documents</td></tr>';
    return;
  }

  elements.documentsBody.innerHTML = filtered.map(documentRecord => `
    <tr class="clickable-row" data-document-id="${documentRecord.id}">
      <td class="mono-cell">${escapeHtml(documentRecord.document_no)}</td>
      <td>${escapeHtml(formatCategory(documentRecord.category))}</td>
      <td>${escapeHtml(documentRecord.year_yy)}</td>
      <td class="mono-cell">${escapeHtml(documentRecord.revision || "-")}</td>
      <td class="mono-cell filename-cell">${escapeHtml(documentRecord.generated_filename)}</td>
      <td class="document-name-cell">${escapeHtml(documentRecord.document_name)}</td>
      <td>${escapeHtml(documentRecord.reference_value || "-")}</td>
      <td>${escapeHtml(documentRecord.written_by || "-")}</td>
      <td>${escapeHtml(documentRecord.creation_date || "-")}</td>
      <td>${escapeHtml(documentRecord.checked_by || "-")}</td>
      <td>${formatDateTime(documentRecord.approved_at)}</td>
      <td>${formatDateTime(documentRecord.revision_updated_at)}</td>
    </tr>
  `).join("");
}

async function handleDocumentAction(event) {
  const row = event.target.closest("tr[data-document-id]");
  if (!row) return;
  const documentRecord = state.documents.find(record => Number(record.id) === Number(row.dataset.documentId));
  if (!documentRecord) return;
  openDocumentActionModal(documentRecord);
}

function openDocumentActionModal(documentRecord) {
  state.selectedDocument = documentRecord;
  hideDocumentDeleteConfirm();
  hideDocumentEditForm();
  elements.documentActionTitle.textContent = documentRecord.document_no || "Document Actions";
  elements.documentActionMeta.textContent = documentRecord.document_name || "Choose an action for this document.";

  const canEdit = canEditDocument(documentRecord);
  elements.documentEditBtn.classList.toggle("hidden", !canEdit);
  elements.documentEditBtn.disabled = Boolean(documentRecord.pending_edit_request_id) && !Auth.hasPermission(state.currentUser, "document_admin");
  elements.documentEditBtn.textContent = elements.documentEditBtn.disabled ? "Edit Pending" : "Edit";
  const canRevise = canRequestRevision(documentRecord);
  elements.documentRevisionRequestBtn.classList.toggle("hidden", !canRevise);
  elements.documentRevisionRequestBtn.disabled = Boolean(documentRecord.pending_revision_request_id);
  elements.documentRevisionRequestBtn.textContent = documentRecord.pending_revision_request_id ? "Revision Pending" : "Revision Request";
  elements.documentDeleteBtn.classList.toggle("hidden", !Auth.hasPermission(state.currentUser, "document_admin"));
  elements.documentDeleteBtn.disabled = false;
  elements.confirmDocumentDeleteBtn.disabled = false;

  elements.documentActionModal.classList.remove("hidden");
  document.body.classList.add("modal-open");
}

function closeDocumentActionModal() {
  elements.documentActionModal.classList.add("hidden");
  document.body.classList.remove("modal-open");
  state.selectedDocument = null;
  hideDocumentDeleteConfirm();
  hideDocumentEditForm();
}

function canEditDocument(documentRecord) {
  if (Auth.hasPermission(state.currentUser, "document_admin")) return true;
  if (!state.currentUser || !Auth.getToken()) return false;
  return Number(documentRecord.requested_by_user_id) === Number(state.currentUser.id);
}

function showDocumentEditForm() {
  const documentRecord = state.selectedDocument;
  if (!documentRecord) return;
  hideDocumentDeleteConfirm();
  hideDocumentEditMessage();
  fillDocumentEditForm(documentRecord);
  elements.documentEditForm.classList.remove("hidden");
}

function hideDocumentEditForm() {
  elements.documentEditForm.classList.add("hidden");
  elements.saveDocumentEditBtn.disabled = false;
  hideDocumentEditMessage();
}

function fillDocumentEditForm(documentRecord) {
  elements.documentEditCategory.value = documentRecord.category || "D";
  elements.documentEditCompanyCode.value = documentRecord.company_code || "X";
  elements.documentEditYearYy.value = documentRecord.year_yy || "";
  elements.documentEditSequenceNo.value = documentRecord.sequence_no || "";
  elements.documentEditRevision.value = documentRecord.revision || "";
  elements.documentEditDocumentNo.value = documentRecord.document_no || "";
  elements.documentEditGeneratedFilename.value = documentRecord.generated_filename || "";
  elements.documentEditReferenceType.value = documentRecord.reference_type || "model";
  elements.documentEditReferenceValue.value = documentRecord.reference_value || "";
  elements.documentEditDocumentName.value = documentRecord.document_name || "";
  elements.documentEditWrittenBy.value = documentRecord.written_by || "";
  elements.documentEditCreationDate.value = documentRecord.creation_date || "";
  elements.documentEditControlStatus.value = documentRecord.control_status || "controlled";
  elements.documentEditDetailType.value = documentRecord.detail_type || "";
  elements.documentEditDetailCode.value = documentRecord.detail_code || "";
  elements.documentEditDetailVersion.value = documentRecord.detail_version || "";
  elements.documentEditLanguage.value = documentRecord.language || "";
}

async function submitDocumentEdit(event) {
  event.preventDefault();
  const documentRecord = state.selectedDocument;
  if (!documentRecord) return;

  const body = collectDocumentEditBody(documentRecord);
  if (!body.document_no || !body.document_name || !body.reference_value) {
    showDocumentEditMessage("Document no, document name and reference are required.", "error");
    return;
  }

  const isAdmin = Auth.hasPermission(state.currentUser, "document_admin");
  const endpoint = isAdmin ? `/api/admin/documents/${documentRecord.id}/edit` : `/api/documents/${documentRecord.id}/edit`;
  elements.saveDocumentEditBtn.disabled = true;

  try {
    const result = await apiPost(endpoint, body);
    if (result.status === "pending_review") {
      elements.documentState.textContent = `${documentRecord.document_no} edit request sent to Document List Admins.`;
    } else {
      elements.documentState.textContent = `${result.document.document_no} updated.`;
    }
    closeDocumentActionModal();
    await loadDocuments();
  } catch (error) {
    showDocumentEditMessage(error.message, "error");
    elements.saveDocumentEditBtn.disabled = false;
  }
}

function collectDocumentEditBody(documentRecord) {
  const body = {
    category: elements.documentEditCategory.value,
    company_code: elements.documentEditCompanyCode.value.trim(),
    year_yy: elements.documentEditYearYy.value.trim(),
    sequence_no: elements.documentEditSequenceNo.value.trim(),
    revision: elements.documentEditRevision.value.trim(),
    document_no: elements.documentEditDocumentNo.value.trim(),
    reference_type: elements.documentEditReferenceType.value.trim(),
    reference_value: elements.documentEditReferenceValue.value.trim(),
    document_name: elements.documentEditDocumentName.value.trim(),
    written_by: elements.documentEditWrittenBy.value.trim(),
    creation_date: elements.documentEditCreationDate.value,
    control_status: elements.documentEditControlStatus.value,
    detail_type: elements.documentEditDetailType.value.trim(),
    detail_code: elements.documentEditDetailCode.value.trim(),
    detail_version: elements.documentEditDetailVersion.value.trim(),
    language: elements.documentEditLanguage.value.trim()
  };

  const generatedFilename = elements.documentEditGeneratedFilename.value.trim();
  if (generatedFilename !== (documentRecord.generated_filename || "")) {
    body.generated_filename = generatedFilename;
  }
  return body;
}

function showDocumentEditMessage(message, type) {
  elements.documentEditMessage.textContent = message;
  elements.documentEditMessage.className = `message-box ${type}`;
}

function hideDocumentEditMessage() {
  elements.documentEditMessage.textContent = "";
  elements.documentEditMessage.className = "message-box hidden";
}

async function submitSelectedRevisionRequest() {
  const documentRecord = state.selectedDocument;
  if (!documentRecord) return;

  if (!Auth.getToken()) {
    window.location.href = `/login.html?next=${encodeURIComponent("/documents.html")}`;
    return;
  }

  const confirmed = window.confirm(`Send revision update request for ${documentRecord.document_no}?`);
  if (!confirmed) return;

  elements.documentRevisionRequestBtn.disabled = true;
  try {
    const result = await apiPost(`/api/documents/${documentRecord.id}/revision-request`, {});
    elements.documentState.textContent = `Revision request sent to Document List Admins: ${result.revision_request.current_revision} -> ${result.revision_request.requested_revision}`;
    closeDocumentActionModal();
    await loadDocuments();
  } catch (error) {
    elements.documentState.textContent = error.message;
    elements.documentRevisionRequestBtn.disabled = false;
  }
}

function showDocumentDeleteConfirm() {
  elements.documentDeleteConfirm.classList.remove("hidden");
}

function hideDocumentDeleteConfirm() {
  elements.documentDeleteConfirm.classList.add("hidden");
}

async function deleteSelectedDocument() {
  const documentRecord = state.selectedDocument;
  if (!documentRecord) return;

  if (!Auth.hasPermission(state.currentUser, "document_admin")) return;

  elements.documentDeleteBtn.disabled = true;
  elements.confirmDocumentDeleteBtn.disabled = true;
  try {
    await apiPost(`/api/admin/documents/${documentRecord.id}/delete`, { confirm: true });
    elements.documentState.textContent = `${documentRecord.document_no} deleted and backed up.`;
    closeDocumentActionModal();
    await loadDocuments();
  } catch (error) {
    elements.documentState.textContent = error.message;
    elements.documentDeleteBtn.disabled = false;
    elements.confirmDocumentDeleteBtn.disabled = false;
  }
}

function canRequestRevision(documentRecord) {
  return REVISION_CATEGORIES.includes(documentRecord.category)
    && /^r\d{2}$/.test(documentRecord.revision || "");
}

function getFilteredDocuments() {
  const search = normalizeSearch(elements.searchInput.value);
  const category = elements.categoryFilter.value;
  const year = elements.yearFilter.value;
  const searchFields = getActiveSearchFields(DOCUMENT_SEARCH_SCOPE_ID, DOCUMENT_SEARCH_FIELDS);

  return state.documents.filter(documentRecord => {
    if (category && documentRecord.category !== category) return false;
    if (year && documentRecord.year_yy !== year) return false;
    if (!search) return true;

    return matchesScopedSearch(documentRecord, search, searchFields);
  });
}

function clearFilters() {
  elements.searchInput.value = "";
  elements.categoryFilter.value = "";
  elements.yearFilter.value = "";
  window.XeraSearchScopes?.clear(DOCUMENT_SEARCH_SCOPE_ID);
  renderDocuments();
}

function getActiveSearchFields(scopeId, searchFieldMap) {
  const selected = window.XeraSearchScopes?.getSelected(scopeId) || [];
  const validSelected = selected.filter(field => searchFieldMap[field]);
  return validSelected.length ? validSelected : Object.keys(searchFieldMap);
}

function matchesScopedSearch(record, search, searchFields) {
  return searchFields.some(field => normalizeSearch(flattenSearchValue(DOCUMENT_SEARCH_FIELDS[field](record))).includes(search));
}

function flattenSearchValue(value) {
  return Array.isArray(value) ? value.filter(Boolean).join(" ") : value;
}

async function apiGet(path) {
  const response = await fetch(`${API_BASE}${path}`);
  const data = await response.json();
  if (!response.ok) throw new Error(data.message || "Request failed.");
  return data;
}

async function apiPost(path, body) {
  const response = await fetch(`${API_BASE}${path}`, {
    method: "POST",
    headers: {
      ...Auth.authHeaders(),
      "content-type": "application/json"
    },
    body: JSON.stringify(body)
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.message || "Request failed.");
  return data;
}

function setApiStatus(isOnline) {
  elements.apiStatus.className = `status-dot ${isOnline ? "status-ok" : "status-muted"}`;
}

function normalizeSearch(value) {
  return String(value || "").toLocaleLowerCase("tr-TR").trim();
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

function formatCategory(category) {
  return CATEGORY_LABELS[category] || category || "-";
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
