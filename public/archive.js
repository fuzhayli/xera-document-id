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
  SOP: "SOP (SOP / Instruction)",
  MARKETING: "MARKETING (Marketing Material ID)"
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
      <td>${escapeHtml(formatCategory(record.category))}</td>
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

  return state.archive.filter(record => {
    if (category && record.category !== category) return false;
    if (year && record.year_yy !== year) return false;
    if (!search) return true;

    const haystack = normalizeSearch([
      record.document_no,
      record.generated_filename,
      record.document_name,
      record.reference_value,
      record.written_by,
      record.revision_changed_by,
      record.revision,
      record.next_revision,
      record.category
    ].join(" "));
    return haystack.includes(search);
  });
}

function clearFilters() {
  elements.searchInput.value = "";
  elements.categoryFilter.value = "";
  elements.yearFilter.value = "";
  renderArchive();
}

async function apiGet(path) {
  const response = await fetch(path);
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
