const state = {
  items: [],
  currentUser: null
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
  deletedBody: document.getElementById("deletedBody")
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
    return `
      <tr>
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

function getFilteredItems() {
  const search = normalizeSearch(elements.searchInput.value);
  const type = elements.typeFilter.value;

  return state.items.filter(item => {
    if (type && item.entity_type !== type) return false;
    if (!search) return true;

    const record = item.record || {};
    const haystack = normalizeSearch([
      item.entity_type,
      item.display_key,
      item.deleted_by,
      item.deleted_at,
      record.document_no,
      record.document_name,
      record.generated_filename,
      record.part_number,
      record.part_name,
      record.description,
      record.main_category,
      record.sub_category
    ].join(" "));
    return haystack.includes(search);
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
  renderDeletedItems();
}

async function apiGet(path) {
  const response = await fetch(path, {
    headers: Auth.authHeaders()
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
