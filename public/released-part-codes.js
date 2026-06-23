const state = {
  items: [],
  currentUser: null
};

const RELEASED_SEARCH_SCOPE_ID = "releasedSearchScope";
const RELEASED_SEARCH_FIELDS = {
  part_code: item => item.display_key,
  name: item => getRecordName(item.record || {}),
  details: item => getRecordDetails(item.record || {}),
  deleted_by: item => item.deleted_by,
  released_by: item => item.released_for_reuse_by,
  released_at: item => [item.released_for_reuse_at, item.released_for_reuse_at ? formatDateTime(item.released_for_reuse_at) : ""]
};

const elements = {
  apiStatus: document.getElementById("apiStatus"),
  currentAdminName: document.getElementById("currentAdminName"),
  releasedState: document.getElementById("releasedState"),
  releasedCount: document.getElementById("releasedCount"),
  refreshBtn: document.getElementById("refreshBtn"),
  filterForm: document.getElementById("filterForm"),
  searchInput: document.getElementById("searchInput"),
  clearFiltersBtn: document.getElementById("clearFiltersBtn"),
  messageBox: document.getElementById("messageBox"),
  releasedBody: document.getElementById("releasedBody")
};

document.addEventListener("DOMContentLoaded", init);

async function init() {
  const user = await Auth.requireAuth();
  if (!user) return;
  if (!Auth.hasPermission(user, "part_admin")) {
    window.location.href = "/";
    return;
  }

  state.currentUser = user;
  elements.currentAdminName.textContent = `${user.display_name} (${Auth.roleLabel(user)})`;
  elements.refreshBtn.addEventListener("click", loadReleasedPartCodes);
  elements.filterForm.addEventListener("input", renderReleasedPartCodes);
  elements.filterForm.addEventListener("change", renderReleasedPartCodes);
  elements.clearFiltersBtn.addEventListener("click", clearFilters);
  await loadReleasedPartCodes();
}

async function loadReleasedPartCodes() {
  elements.releasedState.textContent = "Loading";

  try {
    const data = await apiGet("/api/admin/deleted-items/released-part-codes");
    state.items = data.items || [];
    renderReleasedPartCodes();
    setApiStatus(true);
    elements.releasedState.textContent = "Ready";
  } catch (error) {
    setApiStatus(false);
    elements.releasedState.textContent = error.message;
    state.items = [];
    renderReleasedPartCodes();
  }
}

function renderReleasedPartCodes() {
  const filtered = getFilteredItems();
  elements.releasedCount.textContent = `${filtered.length} of ${state.items.length} items`;

  if (filtered.length === 0) {
    elements.releasedBody.innerHTML = '<tr><td colspan="7" class="empty-cell">No re-requestable codes or IDs</td></tr>';
    return;
  }

  elements.releasedBody.innerHTML = filtered.map(item => {
    const record = item.record || {};
    return `
      <tr>
        <td class="mono-cell">${escapeHtml(item.display_key || "-")}</td>
        <td>${escapeHtml(getRecordName(record))}</td>
        <td>${escapeHtml(getRecordDetails(record))}</td>
        <td>${escapeHtml(item.deleted_by || "-")}</td>
        <td>${formatDateTime(item.deleted_at)}</td>
        <td>${escapeHtml(item.released_for_reuse_by || "-")}</td>
        <td>${formatDateTime(item.released_for_reuse_at)}</td>
      </tr>
    `;
  }).join("");
}

function getFilteredItems() {
  const search = normalizeSearch(elements.searchInput.value);
  const searchFields = getActiveSearchFields(RELEASED_SEARCH_SCOPE_ID, RELEASED_SEARCH_FIELDS);

  return state.items.filter(item => {
    if (!search) return true;
    return searchFields.some(field => normalizeSearch(flattenSearchValue(RELEASED_SEARCH_FIELDS[field](item))).includes(search));
  });
}

function getRecordName(record) {
  return record.part_name || "-";
}

function getRecordDetails(record) {
  return [record.description, record.main_category, record.sub_category].filter(Boolean).join(" | ") || "-";
}

function clearFilters() {
  elements.searchInput.value = "";
  window.XeraSearchScopes?.clear(RELEASED_SEARCH_SCOPE_ID);
  renderReleasedPartCodes();
}

function getActiveSearchFields(scopeId, searchFieldMap) {
  const selected = window.XeraSearchScopes?.getSelected(scopeId) || [];
  const validSelected = selected.filter(field => searchFieldMap[field]);
  return validSelected.length ? validSelected : Object.keys(searchFieldMap);
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
