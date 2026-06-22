const state = {
  parts: [],
  hardware: [],
  activeTab: "materials",
  currentUser: null,
  selectedPart: null,
  materialSort: { field: "", direction: "" },
  hardwareSort: { field: "", direction: "" },
  customExportOpen: false,
  customExportSelectedIds: new Set()
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
const MATERIAL_SORT_FIELDS = {
  part_number: part => part.part_number,
  part_name: part => normalizeDisplayText(part.part_name),
  description: part => normalizeDisplayText(part.description),
  main_category: part => normalizeDisplayText(part.main_category),
  sub_category: part => normalizeDisplayText(part.sub_category)
};
const HARDWARE_SORT_FIELDS = {
  group: row => normalizeDisplayText(row.group_name),
  serial: row => row.serial_no,
  name: row => normalizeDisplayText(row.part_name),
  specification: row => normalizeDisplayText(row.specification),
  excel_row: row => row.source_row || row.excel_row
};
const SORT_COLLATOR = new Intl.Collator("tr", { numeric: true, sensitivity: "base" });

const elements = {
  apiStatus: document.getElementById("apiStatus"),
  partsState: document.getElementById("partsState"),
  refreshBtn: document.getElementById("refreshBtn"),
  partsExportBtn: document.getElementById("partsExportBtn"),
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
  customExportBtn: document.getElementById("customExportBtn"),
  customExportPanel: document.getElementById("customExportPanel"),
  customExportForm: document.getElementById("customExportForm"),
  customExportState: document.getElementById("customExportState"),
  closeCustomExportBtn: document.getElementById("closeCustomExportBtn"),
  customExportCreatedBy: document.getElementById("customExportCreatedBy"),
  customExportStartDate: document.getElementById("customExportStartDate"),
  customExportEndDate: document.getElementById("customExportEndDate"),
  selectVisiblePartsBtn: document.getElementById("selectVisiblePartsBtn"),
  clearSelectedPartsBtn: document.getElementById("clearSelectedPartsBtn"),
  downloadCustomExportBtn: document.getElementById("downloadCustomExportBtn"),
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
  partEditBtn: document.getElementById("partEditBtn"),
  partEditForm: document.getElementById("partEditForm"),
  partEditMessage: document.getElementById("partEditMessage"),
  partEditPartNumber: document.getElementById("partEditPartNumber"),
  partEditPartName: document.getElementById("partEditPartName"),
  partEditDescription: document.getElementById("partEditDescription"),
  partEditMainCategory: document.getElementById("partEditMainCategory"),
  partEditSubCategory: document.getElementById("partEditSubCategory"),
  cancelPartEditBtn: document.getElementById("cancelPartEditBtn"),
  savePartEditBtn: document.getElementById("savePartEditBtn"),
  partRevisionRequestBtn: document.getElementById("partRevisionRequestBtn"),
  partDeleteBtn: document.getElementById("partDeleteBtn"),
  partDeleteConfirm: document.getElementById("partDeleteConfirm"),
  cancelPartDeleteBtn: document.getElementById("cancelPartDeleteBtn"),
  confirmPartDeleteBtn: document.getElementById("confirmPartDeleteBtn"),
  materialSortButtons: document.querySelectorAll("[data-material-sort]"),
  hardwareSortButtons: document.querySelectorAll("[data-hardware-sort]")
};

document.addEventListener("DOMContentLoaded", init);

async function init() {
  state.currentUser = await Auth.requireAuth();
  if (!state.currentUser) return;

  elements.refreshBtn.addEventListener("click", loadData);
  elements.partsExportBtn.addEventListener("click", downloadPartsExport);
  elements.materialTabBtn.addEventListener("click", () => setTab("materials"));
  elements.hardwareTabBtn.addEventListener("click", () => setTab("hardware"));
  elements.materialFilterForm.addEventListener("input", renderParts);
  elements.materialFilterForm.addEventListener("change", renderParts);
  elements.hardwareFilterForm.addEventListener("input", renderHardware);
  elements.hardwareFilterForm.addEventListener("change", renderHardware);
  elements.clearMaterialFiltersBtn.addEventListener("click", clearMaterialFilters);
  elements.clearHardwareFiltersBtn.addEventListener("click", clearHardwareFilters);
  elements.customExportBtn.addEventListener("click", openCustomExportPanel);
  elements.closeCustomExportBtn.addEventListener("click", closeCustomExportPanel);
  elements.customExportForm.addEventListener("input", renderParts);
  elements.customExportForm.addEventListener("change", renderParts);
  elements.selectVisiblePartsBtn.addEventListener("click", selectVisibleParts);
  elements.clearSelectedPartsBtn.addEventListener("click", clearSelectedParts);
  elements.downloadCustomExportBtn.addEventListener("click", downloadCustomExport);
  elements.openPartRequestTopBtn.addEventListener("click", openPartRequestModal);
  elements.openPartRequestBtn.addEventListener("click", openPartRequestModal);
  elements.closePartRequestModalBtn.addEventListener("click", closePartRequestModal);
  elements.partRequestModalBackdrop.addEventListener("click", closePartRequestModal);
  elements.closePartActionBtn.addEventListener("click", closePartActionModal);
  elements.partActionBackdrop.addEventListener("click", closePartActionModal);
  elements.partEditBtn.addEventListener("click", showPartEditForm);
  elements.partEditForm.addEventListener("submit", submitPartEdit);
  elements.cancelPartEditBtn.addEventListener("click", hidePartEditForm);
  elements.partRevisionRequestBtn.addEventListener("click", submitSelectedPartRevisionRequest);
  elements.partDeleteBtn.addEventListener("click", showPartDeleteConfirm);
  elements.cancelPartDeleteBtn.addEventListener("click", hidePartDeleteConfirm);
  elements.confirmPartDeleteBtn.addEventListener("click", deleteSelectedPart);
  window.addEventListener("message", handlePartRequestMessage);
  elements.partsBody.addEventListener("click", handlePartAction);

  elements.importBtn.addEventListener("click", () => elements.importFileInput.click());
  elements.importFileInput.addEventListener("change", handleImportUpload);
  elements.materialSortButtons.forEach(button => button.addEventListener("click", handleMaterialSortClick));
  elements.hardwareSortButtons.forEach(button => button.addEventListener("click", handleHardwareSortClick));

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
    const user = state.currentUser;
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

async function downloadPartsExport() {
  elements.partsExportBtn.disabled = true;
  try {
    await Auth.downloadFile(`${API_BASE}/api/parts/export.xlsx`, "xera-parts.xlsx");
  } catch (error) {
    showMessage(error.message, "error");
  } finally {
    elements.partsExportBtn.disabled = false;
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
    populateCustomExportFilters();
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
  if (tab !== "materials") closeCustomExportPanel();
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

function populateCustomExportFilters() {
  populateSelect(elements.customExportCreatedBy, uniqueSorted(state.parts.map(getPartCreatedBy)));
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
  const filtered = applySort(getFilteredParts(), state.materialSort, MATERIAL_SORT_FIELDS);
  updateSortHeaders(elements.materialSortButtons, state.materialSort, "materialSort");
  elements.partsCount.textContent = state.customExportOpen
    ? `${filtered.length} of ${state.parts.length} records, ${state.customExportSelectedIds.size} selected`
    : `${filtered.length} of ${state.parts.length} records`;
  updateCustomExportState(filtered.length);

  if (filtered.length === 0) {
    elements.partsBody.innerHTML = '<tr><td colspan="5" class="empty-cell">No parts</td></tr>';
    return;
  }

  elements.partsBody.innerHTML = filtered.map(part => `
    <tr class="clickable-row ${state.customExportSelectedIds.has(Number(part.id)) ? "export-selected" : ""}" data-part-id="${part.id}">
      <td class="part-number-cell mono-cell">${escapeHtml(part.part_number)}</td>
      <td class="part-name-cell">${formatPartName(part.part_name)}</td>
      <td class="part-description-cell">${escapeHtml(normalizeDisplayText(part.description || "-"))}</td>
      <td class="part-category-cell">${escapeHtml(normalizeDisplayText(part.main_category || "-"))}</td>
      <td class="part-category-cell">${escapeHtml(normalizeDisplayText(part.sub_category || "-"))}</td>
    </tr>
  `).join("");
}

function handleMaterialSortClick(event) {
  const field = event.currentTarget.dataset.materialSort;
  state.materialSort = getNextSortState(state.materialSort, field);
  renderParts();
}

function openCustomExportPanel() {
  state.customExportOpen = true;
  elements.customExportPanel.classList.remove("hidden");
  elements.materialsPanel.classList.add("custom-export-active");
  setTab("materials");
  renderParts();
}

function closeCustomExportPanel() {
  state.customExportOpen = false;
  state.customExportSelectedIds.clear();
  elements.customExportCreatedBy.value = "";
  elements.customExportStartDate.value = "";
  elements.customExportEndDate.value = "";
  elements.customExportPanel.classList.add("hidden");
  elements.materialsPanel.classList.remove("custom-export-active");
  renderParts();
}

function toggleCustomExportSelection(partId) {
  const id = Number(partId);
  if (state.customExportSelectedIds.has(id)) {
    state.customExportSelectedIds.delete(id);
  } else {
    state.customExportSelectedIds.add(id);
  }
  renderParts();
}

function selectVisibleParts() {
  for (const part of getFilteredParts()) {
    state.customExportSelectedIds.add(Number(part.id));
  }
  renderParts();
}

function clearSelectedParts() {
  state.customExportSelectedIds.clear();
  renderParts();
}

async function downloadCustomExport() {
  const ids = [...state.customExportSelectedIds];
  if (ids.length === 0) {
    showMessage("Please select at least one part for special export.", "error");
    return;
  }

  const originalText = elements.downloadCustomExportBtn.textContent;
  elements.downloadCustomExportBtn.textContent = "Exporting...";
  elements.downloadCustomExportBtn.disabled = true;

  try {
    const response = await fetch(`${API_BASE}/api/parts/custom-export.xlsx`, {
      method: "POST",
      headers: {
        ...Auth.authHeaders(),
        "content-type": "application/json"
      },
      body: JSON.stringify({ part_ids: ids })
    });

    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      throw new Error(data.message || "Custom export failed.");
    }

    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = getDownloadFilename(response, "xera-parts-custom.xlsx");
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
    showMessage(`${ids.length} selected parts exported.`, "success");
  } catch (error) {
    showMessage(error.message, "error");
  } finally {
    elements.downloadCustomExportBtn.textContent = originalText;
    elements.downloadCustomExportBtn.disabled = false;
  }
}

function updateCustomExportState(visibleCount = getFilteredParts().length) {
  if (!state.customExportOpen) return;
  elements.customExportState.textContent = `${visibleCount} visible, ${state.customExportSelectedIds.size} selected.`;
}

async function handlePartAction(event) {
  const row = event.target.closest("tr[data-part-id]");
  if (!row) return;
  const part = state.parts.find(record => Number(record.id) === Number(row.dataset.partId));
  if (!part) return;
  if (state.customExportOpen) {
    toggleCustomExportSelection(part.id);
    return;
  }
  openPartActionModal(part);
}

function openPartActionModal(part) {
  state.selectedPart = part;
  hidePartDeleteConfirm();
  hidePartEditForm();
  elements.partActionTitle.textContent = part.part_number || "Part Actions";
  elements.partActionMeta.textContent = normalizeDisplayText(part.part_name || part.description || "Choose an action for this part.");

  const canRevise = canRequestPartRevision(part);
  const canEdit = canEditPart(part);
  elements.partEditBtn.classList.toggle("hidden", !canEdit);
  elements.partEditBtn.disabled = Boolean(part.pending_edit_request_id) && !Auth.hasPermission(state.currentUser, "part_admin");
  elements.partEditBtn.textContent = elements.partEditBtn.disabled ? "Edit Pending" : "Edit";
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
  hidePartEditForm();
}

function canEditPart(part) {
  if (Auth.hasPermission(state.currentUser, "part_admin")) return true;
  if (!state.currentUser || !Auth.getToken()) return false;
  if (part.source !== "request") return false;
  return Number(part.requested_by_user_id) === Number(state.currentUser.id);
}

function showPartEditForm() {
  const part = state.selectedPart;
  if (!part) return;
  hidePartDeleteConfirm();
  hidePartEditMessage();
  fillPartEditForm(part);
  elements.partEditForm.classList.remove("hidden");
}

function hidePartEditForm() {
  elements.partEditForm.classList.add("hidden");
  elements.savePartEditBtn.disabled = false;
  hidePartEditMessage();
}

function fillPartEditForm(part) {
  elements.partEditPartNumber.value = part.part_number || "";
  elements.partEditPartName.value = normalizeDisplayText(part.part_name || "");
  elements.partEditDescription.value = normalizeDisplayText(part.description || "");
  elements.partEditMainCategory.value = normalizeDisplayText(part.main_category || "");
  elements.partEditSubCategory.value = normalizeDisplayText(part.sub_category || "");
}

async function submitPartEdit(event) {
  event.preventDefault();
  const part = state.selectedPart;
  if (!part) return;

  const body = collectPartEditBody();
  if (!body.part_number || !body.part_name || !body.description || !body.main_category) {
    showPartEditMessage("Part number, part name, description and main category are required.", "error");
    return;
  }

  const isAdmin = Auth.hasPermission(state.currentUser, "part_admin");
  const endpoint = isAdmin ? `/api/admin/parts/${part.id}/edit` : `/api/parts/${part.id}/edit`;
  elements.savePartEditBtn.disabled = true;

  try {
    const result = await apiPost(endpoint, body);
    const summary = formatPartEditSummary(part, result, body);
    if (result.status === "pending_review") {
      showMessage(`${part.part_number} edit request sent to Part List Admins.`, "success");
    } else {
      showMessage(`${result.part.part_number} updated.`, "success");
    }
    closePartActionModal();
    window.alert(summary);
    await loadData();
  } catch (error) {
    showPartEditMessage(error.message, "error");
    elements.savePartEditBtn.disabled = false;
  }
}

function collectPartEditBody() {
  return {
    part_number: elements.partEditPartNumber.value.trim(),
    part_name: elements.partEditPartName.value.trim(),
    description: elements.partEditDescription.value.trim(),
    main_category: elements.partEditMainCategory.value.trim(),
    sub_category: elements.partEditSubCategory.value.trim()
  };
}

function formatPartEditSummary(before, result, body) {
  if (result.status === "pending_review") {
    return `Edit request sent for ${before.part_number}.\n\n${formatChangedFields([
      ["Part Number", before.part_number, body.part_number],
      ["Part Name", normalizeDisplayText(before.part_name), body.part_name],
      ["Description", normalizeDisplayText(before.description), body.description],
      ["Main Category", normalizeDisplayText(before.main_category), body.main_category],
      ["Sub Category", normalizeDisplayText(before.sub_category), body.sub_category]
    ])}`;
  }

  const after = result.part || {};
  return `${after.part_number || before.part_number} updated.\n\n${formatChangedFields([
    ["Part Number", before.part_number, after.part_number],
    ["Part Name", normalizeDisplayText(before.part_name), normalizeDisplayText(after.part_name)],
    ["Description", normalizeDisplayText(before.description), normalizeDisplayText(after.description)],
    ["Main Category", normalizeDisplayText(before.main_category), normalizeDisplayText(after.main_category)],
    ["Sub Category", normalizeDisplayText(before.sub_category), normalizeDisplayText(after.sub_category)]
  ])}`;
}

function formatChangedFields(rows) {
  const changes = rows
    .map(([label, before, after]) => ({
      label,
      before: normalizeSummaryValue(before),
      after: normalizeSummaryValue(after)
    }))
    .filter(change => change.before !== change.after);

  if (changes.length === 0) return "No visible field changes.";
  return changes
    .map(change => `${change.label}: ${change.before || "-"} -> ${change.after || "-"}`)
    .join("\n");
}

function normalizeSummaryValue(value) {
  return String(value ?? "").trim();
}

function showPartEditMessage(message, type) {
  elements.partEditMessage.textContent = message;
  elements.partEditMessage.className = `message-box ${type}`;
}

function hidePartEditMessage() {
  elements.partEditMessage.textContent = "";
  elements.partEditMessage.className = "message-box hidden";
}

async function submitSelectedPartRevisionRequest() {
  const part = state.selectedPart;
  if (!part) return;

  if (!Auth.getToken()) {
    window.location.href = `/login.html?next=${encodeURIComponent("/parts.html")}`;
    return;
  }

  const revisionType = promptPartRevisionType("minor");
  if (revisionType === null) return;

  const confirmed = window.confirm(`Send ${formatPartRevisionType(revisionType).toLowerCase()} revision request for ${part.part_number}?`);
  if (!confirmed) return;

  elements.partRevisionRequestBtn.disabled = true;
  try {
    const result = await apiPost(`/api/parts/${part.id}/revision-request`, { revision_type: revisionType });
    showMessage(`${formatPartRevisionType(revisionType)} revision request sent to Part List Admins: ${result.revision_request.current_revision_code} -> ${result.revision_request.requested_revision_code}`, "success");
    closePartActionModal();
    await loadData();
  } catch (error) {
    showMessage(error.message, "error");
    elements.partRevisionRequestBtn.disabled = false;
  }
}

function promptPartRevisionType(defaultType) {
  let current = defaultType || "minor";
  while (true) {
    const value = window.prompt("Revision type (minor or major)", current);
    if (value === null) return null;

    const normalized = normalizePartRevisionType(value);
    if (normalized) return normalized;

    window.alert("Please enter minor or major.");
    current = value;
  }
}

function normalizePartRevisionType(value) {
  const type = String(value || "").trim().toLowerCase();
  if (type === "minor" || type === "min") return "minor";
  if (type === "major" || type === "maj") return "major";
  return "";
}

function formatPartRevisionType(type) {
  return normalizePartRevisionType(type) === "major" ? "Major" : "Minor";
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
  const filtered = applySort(getFilteredHardware(), state.hardwareSort, HARDWARE_SORT_FIELDS);
  updateSortHeaders(elements.hardwareSortButtons, state.hardwareSort, "hardwareSort");
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

function handleHardwareSortClick(event) {
  const field = event.currentTarget.dataset.hardwareSort;
  state.hardwareSort = getNextSortState(state.hardwareSort, field);
  renderHardware();
}

function getFilteredParts() {
  const search = normalizeSearch(elements.searchInput.value);
  const projectName = elements.projectNameFilter.value;
  const project = elements.projectFilter.value;
  const main = elements.mainFilter.value;
  const sub = elements.subFilter.value;
  const revisionMode = elements.revisionModeFilter.value;
  const searchFields = getActiveSearchFields(MATERIAL_SEARCH_SCOPE_ID, MATERIAL_SEARCH_FIELDS);
  const customCreatedBy = state.customExportOpen ? elements.customExportCreatedBy.value : "";
  const customStartDate = state.customExportOpen ? elements.customExportStartDate.value : "";
  const customEndDate = state.customExportOpen ? elements.customExportEndDate.value : "";

  return state.parts.filter(part => {
    if (projectName && getProjectName(part.project_code) !== projectName) return false;
    if (project && part.project_code !== project) return false;
    if (main && part.main_category !== main) return false;
    if (sub && part.sub_category !== sub) return false;
    if (revisionMode && part.revision_mode !== revisionMode) return false;
    if (customCreatedBy && getPartCreatedBy(part) !== customCreatedBy) return false;
    if (!isPartInCustomExportDateRange(part, customStartDate, customEndDate)) return false;
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
  state.materialSort = { field: "", direction: "" };
  window.XeraSearchScopes?.clear(MATERIAL_SEARCH_SCOPE_ID);
  renderParts();
}

function clearHardwareFilters() {
  elements.hardwareSearchInput.value = "";
  elements.hardwareGroupFilter.value = "";
  state.hardwareSort = { field: "", direction: "" };
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

function getNextSortState(current, field) {
  if (!field) return { field: "", direction: "" };
  if (current.field !== field) return { field, direction: "asc" };
  if (current.direction === "asc") return { field, direction: "desc" };
  return { field: "", direction: "" };
}

function updateSortHeaders(buttons, sortState, datasetName) {
  buttons.forEach(button => {
    const isActive = button.dataset[datasetName] === sortState.field && sortState.direction;
    const direction = isActive ? sortState.direction : "";
    button.dataset.sortDirection = direction;
    button.closest("th")?.setAttribute("aria-sort", direction === "asc"
      ? "ascending"
      : direction === "desc"
        ? "descending"
        : "none");
  });
}

function applySort(records, sortState, sortFields) {
  const sortValue = sortFields[sortState.field];
  if (!sortValue || !sortState.direction) return records;
  return records
    .map((record, index) => ({ record, index }))
    .sort((left, right) => {
      const leftValue = normalizeSortValue(sortValue(left.record));
      const rightValue = normalizeSortValue(sortValue(right.record));
      if (leftValue.empty && rightValue.empty) return left.index - right.index;
      if (leftValue.empty) return 1;
      if (rightValue.empty) return -1;
      const result = SORT_COLLATOR.compare(String(leftValue.value), String(rightValue.value));
      if (result === 0) return left.index - right.index;
      return sortState.direction === "desc" ? -result : result;
    })
    .map(item => item.record);
}

function normalizeSortValue(value) {
  const firstValue = Array.isArray(value)
    ? value.find(item => String(item ?? "").trim())
    : value;
  const text = String(firstValue ?? "").trim();
  return {
    empty: !text || text === "-",
    value: text
  };
}

function getPartCreatedBy(part) {
  return part.requested_by || part.checked_by || "";
}

function isPartInCustomExportDateRange(part, startDate, endDate) {
  if (!startDate && !endDate) return true;
  const createdDate = dateOnly(part.created_at);
  if (!createdDate) return false;
  if (startDate && createdDate < startDate) return false;
  if (endDate && createdDate > endDate) return false;
  return true;
}

function dateOnly(value) {
  if (!value) return "";
  const text = String(value);
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return text;
  const date = new Date(text);
  if (Number.isNaN(date.getTime())) return "";
  return XeraTime.toDateValue(date);
}

function getDownloadFilename(response, fallback) {
  const disposition = response.headers.get("content-disposition") || "";
  const match = disposition.match(/filename="?([^";]+)"?/i);
  return match ? match[1] : fallback;
}

function parsePartNumber(partNumber) {
  const match = String(partNumber || "").trim().match(/^([A-Z0-9]{4})-([1-9])(\d{3})-([A-Z0-9]{3})$/i);
  if (!match) {
    return {
      projectCode: "",
      mainCode: "",
      sequenceNo: "",
      revisionCode: "",
      revisionMode: ""
    };
  }

  const revisionCode = match[4].toUpperCase();
  return {
    projectCode: match[1].toUpperCase(),
    mainCode: match[2],
    sequenceNo: match[3],
    revisionCode,
    revisionMode: inferPartRevisionMode(revisionCode)
  };
}

function inferPartRevisionMode(revisionCode) {
  const code = sanitizeCompactValue(revisionCode);
  if (/^D\d{2}$/.test(code)) return "design";
  if (/^C\d{2}$/.test(code)) return "change";
  if (/^\d{2}[A-Z]$/.test(code)) return "released";
  return "released";
}

function sanitizeCompactValue(value) {
  return normalizeDisplayText(value).toUpperCase().replace(/\s+/g, "").replace(/[^A-Z0-9]/g, "");
}

function sanitizeSequenceValue(value) {
  const sequence = String(value ?? "").replace(/\D/g, "");
  if (!/^\d{1,3}$/.test(sequence)) return "";
  return sequence.padStart(3, "0");
}

async function apiGet(path) {
  const response = await fetch(`${API_BASE}${path}`, { headers: Auth.authHeaders() });
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

function formatPartName(value) {
  return normalizeDisplayText(value)
    .split(/(\s+)/)
    .map(part => {
      if (!part) return "";
      if (/^\s+$/.test(part)) return escapeHtml(part);

      return part
        .split("_")
        .map((segment, index, segments) => {
          const suffix = index < segments.length - 1 ? "_" : "";
          return `<span class="part-name-token" style="display:inline-block;white-space:nowrap">${escapeHtml(segment + suffix)}</span>`;
        })
        .join("");
    })
    .join("");
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
