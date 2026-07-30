const state = {
  projects: [],
  archive: []
};

const {
  apiGet,
  escapeHtml,
  normalizeSearch,
  getActiveSearchFields,
  matchesScopedSearch
} = window.XeraUi;
const PART_ARCHIVE_SEARCH_SCOPE_ID = "partArchiveSearchScope";
const PART_ARCHIVE_SEARCH_FIELDS = {
  archived_part_number: record => record.part_number,
  current_part_number: record => record.current_part_number,
  part_name: record => record.part_name,
  description: record => record.description,
  main_category: record => record.main_category,
  sub_category: record => record.sub_category,
  project_code: record => record.project_code
};

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
const setApiStatus = isOnline => window.XeraUi.setApiStatus(elements.apiStatus, isOnline);

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
    const [rules, data] = await Promise.all([
      apiGet("/api/parts/rules"),
      apiGet("/api/parts/archive")
    ]);
    state.projects = rules.projects || [];
    state.archive = data.archive || [];
    populateFilters();
    renderArchive();
    setApiStatus(true);
    elements.archiveState.textContent = "Ready";
  } catch (error) {
    setApiStatus(false);
    elements.archiveState.textContent = error.message;
    state.projects = [];
    state.archive = [];
    renderArchive();
  }
}

function populateFilters() {
  const projectCodes = uniqueSorted([
    ...state.projects.map(project => project.code),
    ...state.archive.map(record => record.project_code)
  ]);
  populateProjectSelect(elements.projectFilter, projectCodes);
  populateSelect(elements.mainFilter, uniqueSorted(state.archive.map(record => record.main_category)));
}

function populateProjectSelect(select, projectCodes) {
  const selected = select.value;
  const projectByCode = new Map(state.projects.map(project => [project.code, project]));
  select.innerHTML = '<option value="">All</option>';
  for (const code of projectCodes) {
    const option = document.createElement("option");
    const project = projectByCode.get(code);
    option.value = code;
    option.textContent = project ? `${code} - ${project.description}` : code;
    select.appendChild(option);
  }
  if (projectCodes.includes(selected)) select.value = selected;
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
  const searchFields = getActiveSearchFields(PART_ARCHIVE_SEARCH_SCOPE_ID, PART_ARCHIVE_SEARCH_FIELDS);

  return state.archive.filter(record => {
    if (project && record.project_code !== project) return false;
    if (main && record.main_category !== main) return false;
    if (!search) return true;
    return matchesScopedSearch(record, search, searchFields, PART_ARCHIVE_SEARCH_FIELDS);
  });
}

function clearFilters() {
  elements.searchInput.value = "";
  elements.projectFilter.value = "";
  elements.mainFilter.value = "";
  window.XeraSearchScopes?.clear(PART_ARCHIVE_SEARCH_SCOPE_ID);
  renderArchive();
}
function uniqueSorted(values) {
  return [...new Set(values.filter(Boolean))]
    .sort((a, b) => a.localeCompare(b, "tr"));
}
