const state = {
  documents: []
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

const elements = {
  apiStatus: document.getElementById("apiStatus"),
  documentState: document.getElementById("documentState"),
  documentCount: document.getElementById("documentCount"),
  refreshBtn: document.getElementById("refreshBtn"),
  openRequestModalBtn: document.getElementById("openRequestModalBtn"),
  openRequestModalPanelBtn: document.getElementById("openRequestModalPanelBtn"),
  adminControlLink: document.getElementById("adminControlLink"),
  userManagementLink: document.getElementById("userManagementLink"),
  requestModal: document.getElementById("requestModal"),
  requestModalBackdrop: document.getElementById("requestModalBackdrop"),
  closeRequestModalBtn: document.getElementById("closeRequestModalBtn"),
  requestFrame: document.getElementById("requestFrame"),
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
  elements.adminControlLink.classList.toggle("hidden", !Auth.hasPermission(user, "document_admin"));
  elements.userManagementLink.classList.toggle("hidden", !Auth.hasPermission(user, "user_admin"));
}

function openRequestModal() {
  if (!Auth.getToken()) {
    window.location.href = `/login.html?next=${encodeURIComponent("/documents.html")}`;
    return;
  }
  if (!elements.requestFrame.src) {
    elements.requestFrame.src = `${API_BASE}/?embed=request`;
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
    elements.documentsBody.innerHTML = '<tr><td colspan="13" class="empty-cell">No official documents</td></tr>';
    return;
  }

  elements.documentsBody.innerHTML = filtered.map(documentRecord => `
    <tr>
      <td>${renderRevisionRequestAction(documentRecord)}</td>
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
  const button = event.target.closest("button[data-action='revision-request']");
  if (!button) return;

  if (!Auth.getToken()) {
    window.location.href = `/login.html?next=${encodeURIComponent("/documents.html")}`;
    return;
  }

  const confirmed = window.confirm(`Send revision update request for ${button.dataset.documentNo}?`);
  if (!confirmed) return;

  button.disabled = true;
  try {
    const result = await apiPost(`/api/documents/${button.dataset.id}/revision-request`, {});
    elements.documentState.textContent = `Revision request sent to Document List Admins: ${result.revision_request.current_revision} -> ${result.revision_request.requested_revision}`;
    await loadDocuments();
  } catch (error) {
    elements.documentState.textContent = error.message;
    button.disabled = false;
  }
}

function renderRevisionRequestAction(documentRecord) {
  if (!canRequestRevision(documentRecord)) return "-";
  if (documentRecord.pending_revision_request_id) {
    return '<button class="compact-btn secondary-btn" type="button" disabled>Pending</button>';
  }
  return `<button class="compact-btn secondary-btn" type="button" data-action="revision-request" data-id="${documentRecord.id}" data-document-no="${escapeHtml(documentRecord.document_no)}">Revision Request</button>`;
}

function canRequestRevision(documentRecord) {
  return REVISION_CATEGORIES.includes(documentRecord.category)
    && /^r\d{2}$/.test(documentRecord.revision || "");
}

function getFilteredDocuments() {
  const search = normalizeSearch(elements.searchInput.value);
  const category = elements.categoryFilter.value;
  const year = elements.yearFilter.value;

  return state.documents.filter(documentRecord => {
    if (category && documentRecord.category !== category) return false;
    if (year && documentRecord.year_yy !== year) return false;
    if (!search) return true;

    const haystack = normalizeSearch([
      documentRecord.document_no,
      documentRecord.generated_filename,
      documentRecord.document_name,
      documentRecord.reference_value,
      documentRecord.written_by,
      documentRecord.checked_by,
      documentRecord.creation_date,
      documentRecord.revision,
      documentRecord.revision_updated_at,
      documentRecord.category
    ].join(" "));
    return haystack.includes(search);
  });
}

function clearFilters() {
  elements.searchInput.value = "";
  elements.categoryFilter.value = "";
  elements.yearFilter.value = "";
  renderDocuments();
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
