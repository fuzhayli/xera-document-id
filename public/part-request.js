const state = {
  rules: {
    projects: [],
    main_codes: [],
    revision_modes: []
  },
  parts: [],
  previewValid: false,
  previewController: null,
  partNumberTouched: false,
  requests: []
};

const elements = {
  apiStatus: document.getElementById("apiStatus"),
  currentUserName: document.getElementById("currentUserName"),
  logoutBtn: document.getElementById("logoutBtn"),
  requestState: document.getElementById("requestState"),
  refreshBtn: document.getElementById("refreshBtn"),
  form: document.getElementById("partRequestForm"),
  partNumber: document.getElementById("partNumber"),
  projectCode: document.getElementById("projectCode"),
  mainCode: document.getElementById("mainCode"),
  revisionMode: document.getElementById("revisionMode"),
  revisionCode: document.getElementById("revisionCode"),
  partName: document.getElementById("partName"),
  description: document.getElementById("description"),
  descriptionOptions: document.getElementById("descriptionOptions"),
  subCategory: document.getElementById("subCategory"),
  subCategoryOptions: document.getElementById("subCategoryOptions"),
  clearBtn: document.getElementById("clearBtn"),
  submitBtn: document.getElementById("submitBtn"),
  messageBox: document.getElementById("messageBox"),
  previewState: document.getElementById("previewState"),
  partNumberPreview: document.getElementById("partNumberPreview"),
  mainCategoryPreview: document.getElementById("mainCategoryPreview"),
  requestSuccessModal: document.getElementById("requestSuccessModal"),
  submittedRequestName: document.getElementById("submittedRequestName"),
  newRequestAfterSubmitBtn: document.getElementById("newRequestAfterSubmitBtn"),
  closeAfterSubmitBtn: document.getElementById("closeAfterSubmitBtn"),
  requestCount: document.getElementById("requestCount"),
  requestsBody: document.getElementById("requestsBody")
};

document.addEventListener("DOMContentLoaded", init);

async function init() {
  applyEmbedMode();
  const user = await Auth.requireAuth();
  if (!user) return;
  elements.currentUserName.textContent = `${user.display_name} (${Auth.roleLabel(user)})`;
  elements.logoutBtn.addEventListener("click", Auth.logout);
  elements.refreshBtn.addEventListener("click", refreshAll);
  elements.form.addEventListener("input", event => {
    if (event.target === elements.partNumber) state.partNumberTouched = true;
    updatePreview();
  });
  elements.form.addEventListener("change", handleFormChange);
  elements.form.addEventListener("submit", submitRequest);
  elements.clearBtn.addEventListener("click", clearForm);
  elements.newRequestAfterSubmitBtn.addEventListener("click", startNewRequest);
  elements.closeAfterSubmitBtn.addEventListener("click", closeRequestScreen);
  await refreshAll();
}

async function refreshAll() {
  elements.requestState.textContent = "Loading";
  hideMessage();

  try {
    const [rules, requests, parts] = await Promise.all([
      apiGet("/api/parts/rules"),
      apiGet("/api/parts/requests/my"),
      apiGet("/api/parts")
    ]);
    state.rules = rules;
    state.requests = requests.requests || [];
    state.parts = parts.parts || [];
    renderRules();
    renderReadyOptions();
    renderRequests();
    setApiStatus(true);
    elements.requestState.textContent = "Ready";
    updateRevisionDefault();
    updatePreview();
  } catch (error) {
    setApiStatus(false);
    elements.requestState.textContent = "Check required";
    showMessage(error.message, "error");
  }
}

function renderRules() {
  elements.projectCode.innerHTML = state.rules.projects.map(project => (
    `<option value="${escapeHtml(project.code)}">${escapeHtml(project.code)} - ${escapeHtml(project.description)}</option>`
  )).join("");

  elements.mainCode.innerHTML = state.rules.main_codes.map(mainCode => (
    `<option value="${escapeHtml(mainCode.code)}">${escapeHtml(mainCode.code)} - ${escapeHtml(mainCode.name)}</option>`
  )).join("");

  elements.revisionMode.innerHTML = state.rules.revision_modes.map(mode => (
    `<option value="${escapeHtml(mode.code)}">${escapeHtml(mode.name)}</option>`
  )).join("");

  elements.projectCode.value = elements.projectCode.value || "X101";
  elements.mainCode.value = elements.mainCode.value || "2";
  elements.revisionMode.value = elements.revisionMode.value || "released";
}

function handleFormChange(event) {
  if (event.target === elements.revisionMode) updateRevisionDefault();
  if ([elements.projectCode, elements.mainCode].includes(event.target)) renderReadyOptions();
  updatePreview();
}

function updateRevisionDefault() {
  const selected = state.rules.revision_modes.find(mode => mode.code === elements.revisionMode.value);
  elements.revisionCode.value = selected ? selected.defaultRevision : "01A";
}

function renderReadyOptions() {
  const projectCode = elements.projectCode.value;
  const mainCode = elements.mainCode.value;
  const scopedParts = state.parts.filter(part =>
    part.project_code === projectCode && part.main_code === mainCode
  );
  const fallbackParts = scopedParts.length > 0
    ? scopedParts
    : state.parts.filter(part => part.main_code === mainCode);

  renderDatalist(elements.descriptionOptions, uniqueSorted(fallbackParts.map(part => part.description)));
  renderDatalist(elements.subCategoryOptions, uniqueSorted(fallbackParts.map(part => part.sub_category)));
}

function renderDatalist(datalist, values) {
  datalist.innerHTML = values
    .map(value => `<option value="${escapeHtml(normalizeDisplayText(value))}"></option>`)
    .join("");
}

function collectFormData() {
  return {
    project_code: elements.projectCode.value,
    main_code: elements.mainCode.value,
    part_number: state.partNumberTouched ? elements.partNumber.value.trim() : "",
    revision_mode: elements.revisionMode.value,
    revision_code: elements.revisionCode.value,
    part_name: elements.partName.value,
    description: elements.description.value,
    sub_category: elements.subCategory.value
  };
}

function updatePreview() {
  window.clearTimeout(updatePreview.timer);
  updatePreview.timer = window.setTimeout(loadPreview, 220);
}

async function loadPreview() {
  if (state.previewController) state.previewController.abort();
  state.previewController = new AbortController();

  elements.previewState.textContent = "Checking";
  elements.submitBtn.disabled = true;

  try {
    const data = await apiPost("/api/parts/preview", collectFormData(), state.previewController.signal);
    state.previewValid = Boolean(data.valid);
    if (data.valid) {
      if (!state.partNumberTouched || !elements.partNumber.value.trim()) {
        elements.partNumber.value = data.part_number_preview;
      }
      elements.partNumberPreview.textContent = data.part_number_preview;
      elements.mainCategoryPreview.textContent = normalizeDisplayText(data.main_category_preview);
      elements.previewState.textContent = "Valid";
      elements.submitBtn.disabled = false;
      hideMessage();
    } else {
      renderPreviewErrors(data.errors || ["Validation failed."]);
    }
  } catch (error) {
    if (error.name === "AbortError") return;
    renderPreviewErrors([error.message]);
  }
}

function renderPreviewErrors(errors) {
  state.previewValid = false;
  elements.partNumberPreview.textContent = "-";
  elements.mainCategoryPreview.textContent = "-";
  elements.previewState.textContent = "Check required";
  elements.submitBtn.disabled = true;
  showMessage(errors.join(" "), "warning");
}

async function submitRequest(event) {
  event.preventDefault();
  elements.submitBtn.disabled = true;

  try {
    const data = await apiPost("/api/parts/requests", collectFormData());
    showRequestSubmitted(data.request);
    window.parent?.postMessage({
      type: "xera-part-request-created",
      requestId: data.request.id
    }, "*");
    clearTextFields();
    await refreshRequests();
  } catch (error) {
    showMessage(error.message, "error");
  } finally {
    updatePreview();
  }
}

function applyEmbedMode() {
  const params = new URLSearchParams(window.location.search);
  if (params.get("embed")) {
    document.body.classList.add("embed-mode");
  }
}

async function refreshRequests() {
  const data = await apiGet("/api/parts/requests/my");
  state.requests = data.requests || [];
  renderRequests();
}

function renderRequests() {
  elements.requestCount.textContent = `${state.requests.length} records`;
  if (state.requests.length === 0) {
    elements.requestsBody.innerHTML = '<tr><td colspan="8" class="empty-cell">No records</td></tr>';
    return;
  }

  elements.requestsBody.innerHTML = state.requests.map(request => `
    <tr>
      <td><span class="status-pill status-${escapeHtml(request.status)}">${escapeHtml(request.status)}</span></td>
      <td class="mono-cell">${escapeHtml(request.part_number)}</td>
      <td>${escapeHtml(request.part_name)}</td>
      <td>${escapeHtml(normalizeDisplayText(request.main_category))}</td>
      <td>${escapeHtml(normalizeDisplayText(request.sub_category || "-"))}</td>
      <td>${escapeHtml(request.checked_by || "-")}</td>
      <td>${escapeHtml(getPartRequestResultNote(request))}</td>
      <td>${formatDateTime(request.created_at)}</td>
    </tr>
  `).join("");
}

function getPartRequestResultNote(request) {
  if (request.status === "rejected") return request.reject_reason || "Rejected";
  if (request.status === "approved") return request.checked_by ? `Approved by ${request.checked_by}` : "Approved";
  return "-";
}

function clearForm() {
  hideSuccessModal();
  clearTextFields();
  state.partNumberTouched = false;
  elements.partNumber.value = "";
  elements.projectCode.value = "X101";
  elements.mainCode.value = "2";
  elements.revisionMode.value = "released";
  updateRevisionDefault();
  hideMessage();
  updatePreview();
}

function startNewRequest() {
  clearForm();
}

function showRequestSubmitted(request) {
  const requestName = formatSubmittedPartRequestName(request);
  showMessage(`Request submitted and auto-published: ${requestName}`, "success");
  elements.submittedRequestName.textContent = requestName;
  elements.requestSuccessModal.classList.remove("hidden");
  document.body.classList.add("modal-open");
  elements.submitBtn.disabled = true;
}

function formatSubmittedPartRequestName(request) {
  const partNumber = request.part_number || `#${request.id}`;
  return request.part_name ? `${partNumber}_${request.part_name}` : partNumber;
}

function hideSuccessModal() {
  elements.requestSuccessModal.classList.add("hidden");
  document.body.classList.remove("modal-open");
}

function closeRequestScreen() {
  hideSuccessModal();
  const params = new URLSearchParams(window.location.search);
  if (params.get("embed")) {
    window.parent?.postMessage({ type: "xera-part-request-close" }, "*");
    return;
  }
  window.location.href = "/parts.html";
}

function clearTextFields() {
  state.partNumberTouched = false;
  elements.partNumber.value = "";
  elements.partName.value = "";
  elements.description.value = "";
  elements.subCategory.value = "";
}

async function apiGet(path) {
  const response = await fetch(path, {
    headers: Auth.authHeaders()
  });
  return parseResponse(response);
}

async function apiPost(path, body, signal) {
  const response = await fetch(path, {
    method: "POST",
    headers: {
      ...Auth.authHeaders(),
      "content-type": "application/json"
    },
    body: JSON.stringify(body),
    signal
  });
  return parseResponse(response);
}

async function parseResponse(response) {
  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.message || (data.errors && data.errors.join(" ")) || "Request failed.");
  }
  return data;
}

function showMessage(message, type) {
  elements.messageBox.textContent = message;
  elements.messageBox.className = `message-box ${type}`;
}

function hideMessage() {
  elements.messageBox.className = "message-box hidden";
  elements.messageBox.textContent = "";
}

function setApiStatus(isOnline) {
  elements.apiStatus.className = `status-dot ${isOnline ? "status-ok" : "status-muted"}`;
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

function uniqueSorted(values) {
  return [...new Set(values
    .map(value => normalizeDisplayText(value).trim())
    .filter(Boolean)
  )].sort((a, b) => a.localeCompare(b, "en"));
}

function normalizeDisplayText(value) {
  return String(value ?? "")
    .replaceAll("\u0130", "I")
    .replaceAll("\u0131", "i")
    .replaceAll("\u011e", "G")
    .replaceAll("\u011f", "g")
    .replaceAll("\u00dc", "U")
    .replaceAll("\u00fc", "u")
    .replaceAll("\u015e", "S")
    .replaceAll("\u015f", "s")
    .replaceAll("\u00d6", "O")
    .replaceAll("\u00f6", "o")
    .replaceAll("\u00c7", "C")
    .replaceAll("\u00e7", "c")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
