const state = {
  parts: [],
  hardware: [],
  activeTab: "materials",
  currentUser: null,
  selectedPart: null
};

const API_BASE = window.location.protocol === "file:" ? "http://localhost:32680" : "";

const PROJECT_NAME_BY_CODE = {
  X101: "GR10X",
  "1501": "GR10X",
  "1503": "XEBT-6W",
  X103: "XEBT-6W",
  X102: "VR10X",
  "1504": "VR10X",
  X104: "LFDH",
  X105: "GR20X",
  "9010": "GR10X (other)",
  "1500": "GR10X (other)"
};
const MATERIAL_SEARCH_SCOPE_ID = "materialSearchScope";
const HARDWARE_SEARCH_SCOPE_ID = "hardwareSearchScope";
const MATERIAL_SEARCH_FIELDS = {
  part_number: part => part.part_number,
  part_name: part => part.part_name,
  description: part => part.description,
  main_category: part => part.main_category,
  sub_category: part => part.sub_category,
  project: part => getProjectName(part.project_code),
  project_code: part => part.project_code,
  revision: part => part.revision_code,
  source: part => part.source,
  checked_by: part => part.checked_by
};
const HARDWARE_SEARCH_FIELDS = {
  group: row => row.group_name,
  serial: row => row.serial_no,
  name: row => row.part_name,
  specification: row => row.specification,
  excel_row: row => row.excel_row
};

const elements = {
  apiStatus: document.getElementById("apiStatus"),
  partsState: document.getElementById("partsState"),
  refreshBtn: document.getElementById("refreshBtn"),
  materialTabBtn: document.getElementById("materialTabBtn"),
  hardwareTabBtn: document.getElementById("hardwareTabBtn"),
  materialFilterForm: document.getElementById("materialFilterForm"),
  hardwareFilterForm: document.getElementById("hardwareFilterForm"),
  searchInput: document.getElementById("searchInput"),
  projectNameFilter: document.getElementById("projectNameFilter"),
  projectFilter: document.getElementById("projectFilter"),
  mainFilter: document.getElementById("mainFilter"),
  subFilter: document.getElementById("subFilter"),
  revisionModeFilter: document.getElementById("revisionModeFilter"),
  clearMaterialFiltersBtn: document.getElementById("clearMaterialFiltersBtn"),
  hardwareSearchInput: document.getElementById("hardwareSearchInput"),
  hardwareGroupFilter: document.getElementById("hardwareGroupFilter"),
  clearHardwareFiltersBtn: document.getElementById("clearHardwareFiltersBtn"),
  materialsPanel: document.getElementById("materialsPanel"),
  hardwarePanel: document.getElementById("hardwarePanel"),
  partsCount: document.getElementById("partsCount"),
  hardwareCount: document.getElementById("hardwareCount"),
  partsBody: document.getElementById("partsBody"),
  hardwareBody: document.getElementById("hardwareBody"),
  importBtn: document.getElementById("importBtn"),
  importFileInput: document.getElementById("importFileInput"),
  deletedItemsLink: document.getElementById("deletedItemsLink"),
  messageBox: document.getElementById("messageBox"),
  openPartRequestTopBtn: document.getElementById("openPartRequestTopBtn"),
  openPartRequestBtn: document.getElementById("openPartRequestBtn"),
  partRequestModal: document.getElementById("partRequestModal"),
  partRequestModalBackdrop: document.getElementById("partRequestModalBackdrop"),
  closePartRequestModalBtn: document.getElementById("closePartRequestModalBtn"),
  partRequestFrame: document.getElementById("partRequestFrame"),
  partActionModal: document.getElementById("partActionModal"),
  partActionBackdrop: document.getElementById("partActionBackdrop"),
  closePartActionBtn: document.getElementById("closePartActionBtn"),
  partActionTitle: document.getElementById("partActionTitle"),
  partActionMeta: document.getElementById("partActionMeta"),
  partRevisionRequestBtn: document.getElementById("partRevisionRequestBtn"),
  partDeleteBtn: document.getElementById("partDeleteBtn"),
  partDeleteConfirm: document.getElementById("partDeleteConfirm"),
  cancelPartDeleteBtn: document.getElementById("cancelPartDeleteBtn"),
  confirmPartDeleteBtn: document.getElementById("confirmPartDeleteBtn")
};

document.addEventListener("DOMContentLoaded", init);

async function init() {
  elements.refreshBtn.addEventListener("click", loadData);
  elements.materialTabBtn.addEventListener("click", () => setTab("materials"));
  elements.hardwareTabBtn.addEventListener("click", () => setTab("hardware"));
  elements.materialFilterForm.addEventListener("input", renderParts);
  elements.materialFilterForm.addEventListener("change", renderParts);
  elements.hardwareFilterForm.addEventListener("input", renderHardware);
  elements.hardwareFilterForm.addEventListener("change", renderHardware);
  elements.clearMaterialFiltersBtn.addEventListener("click", clearMaterialFilters);
  elements.clearHardwareFiltersBtn.addEventListener("click", clearHardwareFilters);
  elements.openPartRequestTopBtn.addEventListener("click", openPartRequestModal);
  elements.openPartRequestBtn.addEventListener("click", openPartRequestModal);
  elements.closePartRequestModalBtn.addEventListener("click", closePartRequestModal);
  elements.partRequestModalBackdrop.addEventListener("click", closePartRequestModal);
  elements.closePartActionBtn.addEventListener("click", closePartActionModal);
  elements.partActionBackdrop.addEventListener("click", closePartActionModal);
  elements.partRevisionRequestBtn.addEventListener("click", submitSelectedPartRevisionRequest);
  elements.partDeleteBtn.addEventListener("click", showPartDeleteConfirm);
  elements.cancelPartDeleteBtn.addEventListener("click", hidePartDeleteConfirm);
  elements.confirmPartDeleteBtn.addEventListener("click", deleteSelectedPart);
  window.addEventListener("message", handlePartRequestMessage);
  elements.partsBody.addEventListener("click", handlePartAction);

  elements.importBtn.addEventListener("click", () => elements.importFileInput.click());
  elements.importFileInput.addEventListener("change", handleImportUpload);

  await checkUserRole();
  await loadData();
}

function openPartRequestModal() {
  if (!Auth.getToken()) {
    window.location.href = `/login.html?next=${encodeURIComponent("/parts.html")}`;
    return;
  }
  if (!elements.partRequestFrame.src) {
    elements.partRequestFrame.src = `${API_BASE}/part-request.html?embed=part-request`;
  }
  elements.partRequestModal.classList.remove("hidden");
  document.body.classList.add("modal-open");
}

async function closePartRequestModal() {
  elements.partRequestModal.classList.add("hidden");
  document.body.classList.remove("modal-open");
  await loadData();
}

function handlePartRequestMessage(event) {
  if (!event.data) return;
  if (event.data.type === "xera-part-request-created") {
    elements.partsState.textContent = "Part request created and published. Refreshing list.";
  }
  if (event.data.type === "xera-part-request-close") {
    closePartRequestModal();
  }
}

async function checkUserRole() {
  try {
    const user = await Auth.me();
    state.currentUser = user;
    if (Auth.hasPermission(user, "part_admin")) {
      elements.importBtn.classList.remove("hidden");
      elements.deletedItemsLink.classList.remove("hidden");
    } else {
      elements.importBtn.classList.add("hidden");
      elements.deletedItemsLink.classList.add("hidden");
    }
  } catch (err) {
    state.currentUser = null;
    elements.importBtn.classList.add("hidden");
    elements.deletedItemsLink.classList.add("hidden");
  }
}

async function handleImportUpload(e) {
  const file = e.target.files[0];
  if (!file) return;

  showMessage("", "hidden");

  const originalText = elements.importBtn.textContent;
  elements.importBtn.textContent = "Uploading...";
  elements.importBtn.disabled = true;

  try {
    const arrayBuffer = await file.arrayBuffer();
    const token = Auth.getToken();
    
    const response = await fetch(`${API_BASE}/api/parts/import`, {
      method: "POST",
      headers: {
        "content-type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        ...(token ? { "x-session-token": token, "authorization": `Bearer ${token}` } : {})
      },
      body: arrayBuffer
    });

    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.message || "Failed to import Excel.");
    }

    showMessage(data.message || "Successfully imported parts management list.", "success");
    await loadData();
  } catch (err) {
    showMessage(err.message, "error");
  } finally {
    elements.importBtn.textContent = originalText;
    elements.importBtn.disabled = false;
    elements.importFileInput.value = "";
  }
}

function showMessage(text, type) {
  elements.messageBox.className = "message-box";
  if (type === "hidden" || !text) {
    elements.messageBox.classList.add("hidden");
    return;
  }
  elements.messageBox.classList.add(type);
  elements.messageBox.textContent = text;
  elements.messageBox.classList.remove("hidden");
}

async function loadData() {
  elements.partsState.textContent = "Loading";

  try {
    const [parts, hardware] = await Promise.all([
      apiGet("/api/parts"),
      apiGet("/api/parts/standard-hardware")
    ]);
    state.parts = parts.parts || [];
    state.hardware = hardware.hardware || [];
    populateMaterialFilters();
    populateHardwareFilters();
    renderParts();
    renderHardware();
    setApiStatus(true);
    elements.partsState.textContent = "Ready";
  } catch (error) {
    setApiStatus(false);
    elements.partsState.textContent = error.message;
    state.parts = [];
    state.hardware = [];
    renderParts();
    renderHardware();
  }
}

function setTab(tab) {
  state.activeTab = tab;
  const showMaterials = tab === "materials";
  elements.materialsPanel.classList.toggle("hidden", !showMaterials);
  elements.hardwarePanel.classList.toggle("hidden", showMaterials);
  elements.materialFilterForm.classList.toggle("hidden", !showMaterials);
  elements.hardwareFilterForm.classList.toggle("hidden", showMaterials);
  elements.materialTabBtn.classList.toggle("active", showMaterials);
  elements.hardwareTabBtn.classList.toggle("active", !showMaterials);
}

function populateMaterialFilters() {
  populateSelect(elements.projectNameFilter, uniqueSorted(state.parts.map(part => getProjectName(part.project_code))));
  populateSelect(elements.projectFilter, uniqueSorted(state.parts.map(part => part.project_code)));
  populateSelect(elements.mainFilter, uniqueSorted(state.parts.map(part => part.main_category)));
  populateSelect(elements.subFilter, uniqueSorted(state.parts.map(part => part.sub_category)));
}

function populateHardwareFilters() {
  populateSelect(elements.hardwareGroupFilter, uniqueSorted(state.hardware.map(row => row.group_name)));
}

function populateSelect(select, values) {
  const selected = select.value;
  select.innerHTML = '<option value="">All</option>';
  for (const value of values) {
    const option = document.createElement("option");
    option.value = value;
    option.textContent = normalizeDisplayText(value);
    select.appendChild(option);
  }
  if (values.includes(selected)) select.value = selected;
}

function renderParts() {
  const filtered = getFilteredParts();
  elements.partsCount.textContent = `${filtered.length} of ${state.parts.length} records`;

  if (filtered.length === 0) {
    elements.partsBody.innerHTML = '<tr><td colspan="5" class="empty-cell">No parts</td></tr>';
    return;
  }

  elements.partsBody.innerHTML = filtered.map(part => `
    <tr class="clickable-row" data-part-id="${part.id}">
      <td class="mono-cell">${escapeHtml(part.part_number)}</td>
      <td>${escapeHtml(normalizeDisplayText(part.part_name))}</td>
      <td>${escapeHtml(normalizeDisplayText(part.description || "-"))}</td>
      <td>${escapeHtml(normalizeDisplayText(part.main_category || "-"))}</td>
      <td>${escapeHtml(normalizeDisplayText(part.sub_category || "-"))}</td>
    </tr>
  `).join("");
}

async function handlePartAction(event) {
  const row = event.target.closest("tr[data-part-id]");
  if (!row) return;
  const part = state.parts.find(record => Number(record.id) === Number(row.dataset.partId));
  if (!part) return;
  openPartActionModal(part);
}

function openPartActionModal(part) {
  state.selectedPart = part;
  hidePartDeleteConfirm();
  elements.partActionTitle.textContent = part.part_number || "Part Actions";
  elements.partActionMeta.textContent = normalizeDisplayText(part.part_name || part.description || "Choose an action for this part.");

  const canRevise = canRequestPartRevision(part);
  elements.partRevisionRequestBtn.classList.toggle("hidden", !canRevise);
  elements.partRevisionRequestBtn.disabled = Boolean(part.pending_revision_request_id);
  elements.partRevisionRequestBtn.textContent = part.pending_revision_request_id ? "Revision Pending" : "Revision Request";
  elements.partDeleteBtn.classList.toggle("hidden", !Auth.hasPermission(state.currentUser, "part_admin"));
  elements.partDeleteBtn.disabled = false;
  elements.confirmPartDeleteBtn.disabled = false;

  elements.partActionModal.classList.remove("hidden");
  document.body.classList.add("modal-open");
}

function closePartActionModal() {
  elements.partActionModal.classList.add("hidden");
  document.body.classList.remove("modal-open");
  state.selectedPart = null;
  hidePartDeleteConfirm();
}

async function submitSelectedPartRevisionRequest() {
  const part = state.selectedPart;
  if (!part) return;

  if (!Auth.getToken()) {
    window.location.href = `/login.html?next=${encodeURIComponent("/parts.html")}`;
    return;
  }

  const confirmed = window.confirm(`Send revision request for ${part.part_number}?`);
  if (!confirmed) return;

  elements.partRevisionRequestBtn.disabled = true;
  try {
    const result = await apiPost(`/api/parts/${part.id}/revision-request`, {});
    showMessage(`Revision request sent to Part List Admins: ${result.revision_request.current_revision_code} -> ${result.revision_request.requested_revision_code}`, "success");
    closePartActionModal();
    await loadData();
  } catch (error) {
    showMessage(error.message, "error");
    elements.partRevisionRequestBtn.disabled = false;
  }
}

function showPartDeleteConfirm() {
  elements.partDeleteConfirm.classList.remove("hidden");
}

function hidePartDeleteConfirm() {
  elements.partDeleteConfirm.classList.add("hidden");
}

async function deleteSelectedPart() {
  const part = state.selectedPart;
  if (!part) return;

  if (!Auth.hasPermission(state.currentUser, "part_admin")) return;

  elements.partDeleteBtn.disabled = true;
  elements.confirmPartDeleteBtn.disabled = true;
  try {
    await apiPost(`/api/admin/parts/${part.id}/delete`, { confirm: true });
    showMessage(`${part.part_number} deleted and backed up.`, "success");
    closePartActionModal();
    await loadData();
  } catch (error) {
    showMessage(error.message, "error");
    elements.partDeleteBtn.disabled = false;
    elements.confirmPartDeleteBtn.disabled = false;
  }
}

function canRequestPartRevision(part) {
  return Boolean(part.project_code && part.main_code && part.sequence_no)
    && (/^\d{2}[A-Z]$/.test(part.revision_code || "")
      || /^D\d{2}$/.test(part.revision_code || "")
      || /^C\d{2}$/.test(part.revision_code || ""));
}

function renderHardware() {
  const filtered = getFilteredHardware();
  elements.hardwareCount.textContent = `${filtered.length} of ${state.hardware.length} records`;

  if (filtered.length === 0) {
    elements.hardwareBody.innerHTML = '<tr><td colspan="5" class="empty-cell">No reference records</td></tr>';
    return;
  }

  elements.hardwareBody.innerHTML = filtered.map(row => `
    <tr>
      <td>${escapeHtml(normalizeDisplayText(row.group_name))}</td>
      <td class="mono-cell">${escapeHtml(row.serial_no || "-")}</td>
      <td>${escapeHtml(normalizeDisplayText(row.part_name || "-"))}</td>
      <td>${escapeHtml(normalizeDisplayText(row.specification || "-"))}</td>
      <td class="mono-cell">${escapeHtml(row.source_row)}</td>
    </tr>
  `).join("");
}

function getFilteredParts() {
  const search = normalizeSearch(elements.searchInput.value);
  const projectName = elements.projectNameFilter.value;
  const project = elements.projectFilter.value;
  const main = elements.mainFilter.value;
  const sub = elements.subFilter.value;
  const revisionMode = elements.revisionModeFilter.value;
  const searchFields = getActiveSearchFields(MATERIAL_SEARCH_SCOPE_ID, MATERIAL_SEARCH_FIELDS);

  return state.parts.filter(part => {
    if (projectName && getProjectName(part.project_code) !== projectName) return false;
    if (project && part.project_code !== project) return false;
    if (main && part.main_category !== main) return false;
    if (sub && part.sub_category !== sub) return false;
    if (revisionMode && part.revision_mode !== revisionMode) return false;
    if (!search) return true;
    return matchesScopedSearch(part, search, searchFields, MATERIAL_SEARCH_FIELDS);
  });
}

function getFilteredHardware() {
  const search = normalizeSearch(elements.hardwareSearchInput.value);
  const group = elements.hardwareGroupFilter.value;
  const searchFields = getActiveSearchFields(HARDWARE_SEARCH_SCOPE_ID, HARDWARE_SEARCH_FIELDS);
  return state.hardware.filter(row => {
    if (group && row.group_name !== group) return false;
    if (!search) return true;
    return matchesScopedSearch(row, search, searchFields, HARDWARE_SEARCH_FIELDS);
  });
}

function clearMaterialFilters() {
  elements.searchInput.value = "";
  elements.projectNameFilter.value = "";
  elements.projectFilter.value = "";
  elements.mainFilter.value = "";
  elements.subFilter.value = "";
  elements.revisionModeFilter.value = "";
  window.XeraSearchScopes?.clear(MATERIAL_SEARCH_SCOPE_ID);
  renderParts();
}

function clearHardwareFilters() {
  elements.hardwareSearchInput.value = "";
  elements.hardwareGroupFilter.value = "";
  window.XeraSearchScopes?.clear(HARDWARE_SEARCH_SCOPE_ID);
  renderHardware();
}

function getActiveSearchFields(scopeId, searchFieldMap) {
  const selected = window.XeraSearchScopes?.getSelected(scopeId) || [];
  const validSelected = selected.filter(field => searchFieldMap[field]);
  return validSelected.length ? validSelected : Object.keys(searchFieldMap);
}

function matchesScopedSearch(record, search, searchFields, searchFieldMap) {
  return searchFields.some(field => normalizeSearch(flattenSearchValue(searchFieldMap[field](record))).includes(search));
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

function uniqueSorted(values) {
  return [...new Set(values.filter(Boolean))]
    .sort((a, b) => a.localeCompare(b, "tr"));
}

function getProjectName(projectCode) {
  return PROJECT_NAME_BY_CODE[normalizeProjectCode(projectCode)] || "";
}

function normalizeProjectCode(projectCode) {
  return String(projectCode || "").trim().toUpperCase();
}

function normalizeSearch(value) {
  return String(value || "").toLocaleLowerCase("tr-TR").trim();
}

function normalizeDisplayText(value) {
  return String(value ?? "")
    .replaceAll("İ", "I")
    .replaceAll("ı", "i")
    .replaceAll("Ğ", "G")
    .replaceAll("ğ", "g")
    .replaceAll("Ü", "U")
    .replaceAll("ü", "u")
    .replaceAll("Ş", "S")
    .replaceAll("ş", "s")
    .replaceAll("Ö", "O")
    .replaceAll("ö", "o")
    .replaceAll("Ç", "C")
    .replaceAll("ç", "c");
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
