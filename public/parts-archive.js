const state = {
  archive: []
};

const API_BASE = window.location.protocol === "file:" ? "http://localhost:32680" : "";

const elements = {
  apiStatus: document.getElementById("apiStatus"),
  archiveState: document.getElementById("archiveState"),
  archiveCount: document.getElementById("archiveCount"),
  refreshBtn: document.getElementById("refreshBtn"),
  filterForm: document.getElementById("filterForm"),
  searchInput: document.getElementById("searchInput"),
  projectFilter: document.getElementById("projectFilter"),
  mainFilter: document.getElementById("mainFilter"),
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
    const data = await apiGet("/api/parts/archive");
    state.archive = data.archive || [];
    populateFilters();
    renderArchive();
    setApiStatus(true);
    elements.archiveState.textContent = "Ready";
  } catch (error) {
    setApiStatus(false);
    elements.archiveState.textContent = error.message;
    renderArchive();
  }
}

function populateFilters() {
  populateSelect(elements.projectFilter, uniqueSorted(state.archive.map(record => record.project_code)));
  populateSelect(elements.mainFilter, uniqueSorted(state.archive.map(record => record.main_category)));
}

function populateSelect(select, values) {
  const selected = select.value;
  select.innerHTML = '<option value="">All</option>';
  for (const value of values) {
    const option = document.createElement("option");
    option.value = value;
    option.textContent = value;
    select.appendChild(option);
  }
  if (values.includes(selected)) select.value = selected;
}

function renderArchive() {
  const filtered = getFilteredArchive();
  elements.archiveCount.textContent = `${filtered.length} of ${state.archive.length} records`;

  if (filtered.length === 0) {
    elements.archiveBody.innerHTML = '<tr><td colspan="6" class="empty-cell">No archived part revisions</td></tr>';
    return;
  }

  elements.archiveBody.innerHTML = filtered.map(record => `
    <tr>
      <td class="mono-cell">${escapeHtml(record.part_number)}</td>
      <td class="mono-cell">${escapeHtml(record.current_part_number || "-")}</td>
      <td>${escapeHtml(record.part_name || "-")}</td>
      <td>${escapeHtml(record.description || "-")}</td>
      <td>${escapeHtml(record.main_category || "-")}</td>
      <td>${escapeHtml(record.sub_category || "-")}</td>
    </tr>
  `).join("");
}

function getFilteredArchive() {
  const search = normalizeSearch(elements.searchInput.value);
  const project = elements.projectFilter.value;
  const main = elements.mainFilter.value;

  return state.archive.filter(record => {
    if (project && record.project_code !== project) return false;
    if (main && record.main_category !== main) return false;
    if (!search) return true;
    const haystack = normalizeSearch([
      record.part_number,
      record.current_part_number,
      record.part_name,
      record.description,
      record.main_category,
      record.sub_category,
      record.project_code
    ].join(" "));
    return haystack.includes(search);
  });
}

function clearFilters() {
  elements.searchInput.value = "";
  elements.projectFilter.value = "";
  elements.mainFilter.value = "";
  renderArchive();
}

async function apiGet(path) {
  const response = await fetch(`${API_BASE}${path}`);
  const data = await response.json();
  if (!response.ok) throw new Error(data.message || "Request failed.");
  return data;
}

function setApiStatus(isOnline) {
  elements.apiStatus.className = `status-dot ${isOnline ? "status-ok" : "status-muted"}`;
}

function uniqueSorted(values) {
  return [...new Set(values.filter(Boolean))]
    .sort((a, b) => a.localeCompare(b, "tr"));
}

function normalizeSearch(value) {
  return String(value || "").toLocaleLowerCase("tr-TR").trim();
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
