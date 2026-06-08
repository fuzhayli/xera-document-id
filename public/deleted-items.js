const state = {
  items: [],
  selectedItem: null,
  currentUser: null
};
const DELETED_SEARCH_SCOPE_ID = "deletedSearchScope";
const DELETED_SEARCH_FIELDS = {
  type: item => formatType(item.entity_type),
  record: item => item.display_key,
  name: item => getRecordName(item, item.record || {}),
  details: item => getRecordDetails(item, item.record || {}),
  deleted_by: item => item.deleted_by,
  deleted_at: item => [item.deleted_at, item.deleted_at ? formatDateTime(item.deleted_at) : ""]
};

const elements = {
  apiStatus: document.getElementById("apiStatus"),
  currentAdminName: document.getElementById("currentAdminName"),
  deletedState: document.getElementById("deletedState"),
  deletedCount: document.getElementById("deletedCount"),
  refreshBtn: document.getElementById("refreshBtn"),
  filterForm: document.getElementById("filterForm"),
  searchInput: document.getElementById("searchInput"),
  typeFilter: document.getElementById("typeFilter"),
  clearFiltersBtn: document.getElementById("clearFiltersBtn"),
  messageBox: document.getElementById("messageBox"),
  deletedBody: document.getElementById("deletedBody"),
  deletedActionModal: document.getElementById("deletedActionModal"),
  deletedActionBackdrop: document.getElementById("deletedActionBackdrop"),
  closeDeletedActionBtn: document.getElementById("closeDeletedActionBtn"),
  cancelDeletedActionBtn: document.getElementById("cancelDeletedActionBtn"),
  republishDeletedItemBtn: document.getElementById("republishDeletedItemBtn"),
  deletedActionTitle: document.getElementById("deletedActionTitle"),
  deletedActionMeta: document.getElementById("deletedActionMeta"),
  deletedActionDetails: document.getElementById("deletedActionDetails")
};

document.addEventListener("DOMContentLoaded", init);

async function init() {
  const user = await Auth.requireAuth();
  if (!user) return;
  if (!Auth.hasAnyPermission(user, ["document_admin", "part_admin"])) {
    window.location.href = "/";
    return;
  }

  state.currentUser = user;
  elements.currentAdminName.textContent = `${user.display_name} (${Auth.roleLabel(user)})`;
  populateTypeFilter(user);
  elements.refreshBtn.addEventListener("click", loadDeletedItems);
  elements.filterForm.addEventListener("input", renderDeletedItems);
  elements.filterForm.addEventListener("change", renderDeletedItems);
  elements.clearFiltersBtn.addEventListener("click", clearFilters);
  elements.deletedBody.addEventListener("click", handleDeletedItemRowClick);
  elements.deletedBody.addEventListener("pointerup", handleDeletedItemRowPointer);
  elements.deletedBody.addEventListener("keydown", handleDeletedItemRowKeydown);
  elements.deletedActionBackdrop.addEventListener("click", closeDeletedActionModal);
  elements.closeDeletedActionBtn.addEventListener("click", closeDeletedActionModal);
  elements.cancelDeletedActionBtn.addEventListener("click", closeDeletedActionModal);
  elements.republishDeletedItemBtn.addEventListener("click", republishSelectedDeletedItem);
  await loadDeletedItems();
}

function populateTypeFilter(user) {
  elements.typeFilter.innerHTML = '<option value="">All</option>';
  if (Auth.hasPermission(user, "document_admin")) {
    elements.typeFilter.insertAdjacentHTML("beforeend", '<option value="document">Documents</option>');
  }
  if (Auth.hasPermission(user, "part_admin")) {
    elements.typeFilter.insertAdjacentHTML("beforeend", '<option value="part">Parts</option>');
  }

  const requestedType = new URLSearchParams(window.location.search).get("type") || "";
  if ([...elements.typeFilter.options].some(option => option.value === requestedType)) {
    elements.typeFilter.value = requestedType;
  }
}

async function loadDeletedItems() {
  elements.deletedState.textContent = "Loading";

  try {
    const data = await apiGet("/api/admin/deleted-items");
    state.items = data.items || [];
    renderDeletedItems();
    setApiStatus(true);
    elements.deletedState.textContent = "Ready";
  } catch (error) {
    setApiStatus(false);
    elements.deletedState.textContent = error.message;
    state.items = [];
    renderDeletedItems();
  }
}

function renderDeletedItems() {
  const filtered = getFilteredItems();
  elements.deletedCount.textContent = `${filtered.length} of ${state.items.length} records`;

  if (filtered.length === 0) {
    elements.deletedBody.innerHTML = '<tr><td colspan="6" class="empty-cell">No deleted records</td></tr>';
    return;
  }

  elements.deletedBody.innerHTML = filtered.map(item => {
    const record = item.record || {};
    const label = item.display_key || `${formatType(item.entity_type)} #${item.entity_id}`;
    return `
      <tr class="clickable-row" tabindex="0" role="button" aria-label="${escapeHtml(`Open ${label}`)}" data-id="${escapeHtml(item.id)}">
        <td>${escapeHtml(formatType(item.entity_type))}</td>
        <td class="mono-cell">${escapeHtml(item.display_key || "-")}</td>
        <td>${escapeHtml(getRecordName(item, record))}</td>
        <td>${escapeHtml(getRecordDetails(item, record))}</td>
        <td>${escapeHtml(item.deleted_by || "-")}</td>
        <td>${formatDateTime(item.deleted_at)}</td>
      </tr>
    `;
  }).join("");
}

function handleDeletedItemRowClick(event) {
  if (event.detail === 0) return;
  openDeletedItemFromEvent(event);
}

function handleDeletedItemRowPointer(event) {
  if (event.pointerType === "mouse") return;
  openDeletedItemFromEvent(event);
}

function openDeletedItemFromEvent(event) {
  const row = event.target.closest("tr[data-id]");
  if (!row) return;
  openDeletedActionModal(row.dataset.id);
}

function handleDeletedItemRowKeydown(event) {
  if (!["Enter", " "].includes(event.key)) return;
  const row = event.target.closest("tr[data-id]");
  if (!row) return;
  event.preventDefault();
  openDeletedActionModal(row.dataset.id);
}

function openDeletedActionModal(itemId) {
  const item = state.items.find(candidate => Number(candidate.id) === Number(itemId));
  if (!item) return;

  state.selectedItem = item;
  const record = item.record || {};
  const label = item.display_key || `${formatType(item.entity_type)} #${item.entity_id}`;
  elements.deletedActionTitle.textContent = label;
  elements.deletedActionMeta.textContent = `${formatType(item.entity_type)} | Deleted ${formatDateTime(item.deleted_at)}`;
  elements.deletedActionDetails.innerHTML = buildDeletedActionDetails(item, record);
  elements.republishDeletedItemBtn.disabled = !canRepublishItem(item);
  elements.deletedActionModal.classList.remove("hidden");
  document.body.classList.add("modal-open");
}

function closeDeletedActionModal() {
  state.selectedItem = null;
  elements.deletedActionModal.classList.add("hidden");
  document.body.classList.remove("modal-open");
  elements.republishDeletedItemBtn.disabled = false;
}

async function republishSelectedDeletedItem() {
  const item = state.selectedItem;
  if (!item || !canRepublishItem(item)) return;

  const label = item.display_key || `${formatType(item.entity_type)} #${item.entity_id}`;

  elements.republishDeletedItemBtn.disabled = true;
  showMessage("", "hidden");
  elements.deletedState.textContent = "Republishing";

  try {
    await apiPost(`/api/admin/deleted-items/${item.id}/republish`, {});
    showMessage(`${label} republished.`, "success");
    closeDeletedActionModal();
    await loadDeletedItems();
  } catch (error) {
    showMessage(error.message, "error");
    elements.deletedState.textContent = "Check required";
    elements.republishDeletedItemBtn.disabled = false;
  }
}

function buildDeletedActionDetails(item, record) {
  const rows = [
    ["Type", formatType(item.entity_type)],
    ["Record", item.display_key || "-"],
    ["Name", getRecordName(item, record)],
    ["Details", getRecordDetails(item, record)],
    ["Deleted By", item.deleted_by || "-"],
    ["Deleted At", formatDateTime(item.deleted_at)]
  ];

  return rows.map(([label, value]) => `
    <div>
      <dt>${escapeHtml(label)}</dt>
      <dd>${escapeHtml(value)}</dd>
    </div>
  `).join("");
}

function canRepublishItem(item) {
  if (item.entity_type === "document") return Auth.hasPermission(state.currentUser, "document_admin");
  if (item.entity_type === "part") return Auth.hasPermission(state.currentUser, "part_admin");
  return false;
}

function getFilteredItems() {
  const search = normalizeSearch(elements.searchInput.value);
  const type = elements.typeFilter.value;
  const searchFields = getActiveSearchFields(DELETED_SEARCH_SCOPE_ID, DELETED_SEARCH_FIELDS);

  return state.items.filter(item => {
    if (type && item.entity_type !== type) return false;
    if (!search) return true;

    return matchesScopedSearch(item, search, searchFields);
  });
}

function getRecordName(item, record) {
  if (item.entity_type === "document") return record.document_name || "-";
  return record.part_name || "-";
}

function getRecordDetails(item, record) {
  if (item.entity_type === "document") {
    return [record.category, record.revision, record.generated_filename].filter(Boolean).join(" | ") || "-";
  }
  return [record.description, record.main_category, record.sub_category].filter(Boolean).join(" | ") || "-";
}

function clearFilters() {
  elements.searchInput.value = "";
  elements.typeFilter.value = "";
  window.XeraSearchScopes?.clear(DELETED_SEARCH_SCOPE_ID);
  renderDeletedItems();
}

function getActiveSearchFields(scopeId, searchFieldMap) {
  const selected = window.XeraSearchScopes?.getSelected(scopeId) || [];
  const validSelected = selected.filter(field => searchFieldMap[field]);
  return validSelected.length ? validSelected : Object.keys(searchFieldMap);
}

function matchesScopedSearch(item, search, searchFields) {
  return searchFields.some(field => normalizeSearch(flattenSearchValue(DELETED_SEARCH_FIELDS[field](item))).includes(search));
}

function flattenSearchValue(value) {
  return Array.isArray(value) ? value.filter(Boolean).join(" ") : value;
}

async function apiGet(path) {
  const response = await fetch(path, {
    headers: Auth.authHeaders()
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.message || "Request failed.");
  return data;
}

async function apiPost(path, body) {
  const response = await fetch(path, {
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

function showMessage(text, type) {
  elements.messageBox.className = "message-box";
  if (type === "hidden" || !text) {
    elements.messageBox.classList.add("hidden");
    elements.messageBox.textContent = "";
    return;
  }
  elements.messageBox.classList.add(type);
  elements.messageBox.textContent = text;
  elements.messageBox.classList.remove("hidden");
}

function setApiStatus(isOnline) {
  elements.apiStatus.className = `status-dot ${isOnline ? "status-ok" : "status-muted"}`;
}

function normalizeSearch(value) {
  return String(value || "").toLocaleLowerCase("tr-TR").trim();
}

function formatType(type) {
  return type === "document" ? "Document" : "Part";
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

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
