const state = {
  archive: []
};

const CATEGORY_LABELS = {
  D: "D (General Purpose Document)",
  R: "R (Record Purpose Document)",
  MD: "MD (Manufacturing Dynamic Document)",
  MR: "MR (Manufacturing Record Document)",
  EC: "EC (Engineering Change)",
  QMS: "QMS (Quality Management)",
  TEMPLATE: "TEMPLATE (Template / QT)",
  SOP: "SOP (SOP / Instruction)",
  MARKETING: "MARKETING (Marketing Material ID)"
};
const DOCUMENT_ARCHIVE_SEARCH_SCOPE_ID = "documentArchiveSearchScope";
const DOCUMENT_ARCHIVE_SEARCH_FIELDS = {
  document_no: record => record.document_no,
  category: record => [getDocumentCategoryCode(record), formatDocumentCategory(record)],
  year: record => record.year_yy,
  old_revision: record => record.revision,
  new_revision: record => record.next_revision,
  old_filename: record => record.generated_filename,
  document_name: record => record.document_name,
  reference: record => record.reference_value,
  written_by: record => record.written_by,
  checked_by: record => record.checked_by,
  changed_by: record => record.revision_changed_by,
  changed_at: record => [record.revision_changed_at, record.revision_changed_at ? formatDateTime(record.revision_changed_at) : ""]
};

const elements = {
  apiStatus: document.getElementById("apiStatus"),
  archiveState: document.getElementById("archiveState"),
  archiveCount: document.getElementById("archiveCount"),
  refreshBtn: document.getElementById("refreshBtn"),
  filterForm: document.getElementById("filterForm"),
  searchInput: document.getElementById("searchInput"),
  categoryFilter: document.getElementById("categoryFilter"),
  yearFilter: document.getElementById("yearFilter"),
  clearFiltersBtn: document.getElementById("clearFiltersBtn"),
  archiveBody: document.getElementById("archiveBody")
};

document.addEventListener("DOMContentLoaded", init);

async function init() {
  const user = await Auth.requireAuth();
  if (!user) return;

  elements.refreshBtn.addEventListener("click", loadArchive);
  elements.filterForm.addEventListener("input", renderArchive);
  elements.filterForm.addEventListener("change", renderArchive);
  elements.clearFiltersBtn.addEventListener("click", clearFilters);
  await loadArchive();
}

async function loadArchive() {
  elements.archiveState.textContent = "Loading";

  try {
    const data = await apiGet("/api/documents/archive");
    state.archive = data.archive || [];
    populateYearFilter(state.archive);
    renderArchive();
    setApiStatus(true);
    elements.archiveState.textContent = "Ready";
  } catch (error) {
    setApiStatus(false);
    elements.archiveState.textContent = error.message;
    renderArchive([]);
  }
}

function populateYearFilter(records) {
  const selected = elements.yearFilter.value;
  const years = [...new Set(records.map(record => record.year_yy).filter(Boolean))]
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

function renderArchive() {
  const filtered = getFilteredArchive();
  elements.archiveCount.textContent = `${filtered.length} of ${state.archive.length} records`;

  if (filtered.length === 0) {
    elements.archiveBody.innerHTML = '<tr><td colspan="11" class="empty-cell">No archived revisions</td></tr>';
    return;
  }

  elements.archiveBody.innerHTML = filtered.map(record => `
    <tr>
      <td class="mono-cell">${escapeHtml(record.document_no)}</td>
      <td>${escapeHtml(formatDocumentCategory(record))}</td>
      <td>${escapeHtml(record.year_yy)}</td>
      <td class="mono-cell">${escapeHtml(record.revision || "-")}</td>
      <td class="mono-cell">${escapeHtml(record.next_revision || "-")}</td>
      <td class="mono-cell filename-cell">${escapeHtml(record.generated_filename || "-")}</td>
      <td>${escapeHtml(record.document_name || "-")}</td>
      <td>${escapeHtml(record.written_by || "-")}</td>
      <td>${escapeHtml(record.checked_by || "-")}</td>
      <td>${escapeHtml(record.revision_changed_by || "-")}</td>
      <td>${formatDateTime(record.revision_changed_at)}</td>
    </tr>
  `).join("");
}

function getFilteredArchive() {
  const search = normalizeSearch(elements.searchInput.value);
  const category = elements.categoryFilter.value;
  const year = elements.yearFilter.value;
  const searchFields = getActiveSearchFields(DOCUMENT_ARCHIVE_SEARCH_SCOPE_ID, DOCUMENT_ARCHIVE_SEARCH_FIELDS);

  return state.archive.filter(record => {
    if (category && getDocumentCategoryCode(record) !== category) return false;
    if (year && record.year_yy !== year) return false;
    if (!search) return true;

    return matchesScopedSearch(record, search, searchFields);
  });
}

function clearFilters() {
  elements.searchInput.value = "";
  elements.categoryFilter.value = "";
  elements.yearFilter.value = "";
  window.XeraSearchScopes?.clear(DOCUMENT_ARCHIVE_SEARCH_SCOPE_ID);
  renderArchive();
}

function getActiveSearchFields(scopeId, searchFieldMap) {
  const selected = window.XeraSearchScopes?.getSelected(scopeId) || [];
  const validSelected = selected.filter(field => searchFieldMap[field]);
  return validSelected.length ? validSelected : Object.keys(searchFieldMap);
}

function matchesScopedSearch(record, search, searchFields) {
  return searchFields.some(field => normalizeSearch(flattenSearchValue(DOCUMENT_ARCHIVE_SEARCH_FIELDS[field](record))).includes(search));
}

function flattenSearchValue(value) {
  return Array.isArray(value) ? value.filter(Boolean).join(" ") : value;
}

async function apiGet(path) {
  const response = await fetch(path, { headers: Auth.authHeaders() });
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

function getDocumentCategoryCode(record) {
  if (String(record.document_no || "").startsWith("XQT-")) return "TEMPLATE";
  return record.category || "";
}

function formatDocumentCategory(record) {
  const category = getDocumentCategoryCode(record);
  return CATEGORY_LABELS[category] || category || "-";
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
