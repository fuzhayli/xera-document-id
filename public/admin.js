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
const REVISION_CATEGORIES = ["D", "MD", "EC", "QMS", "SOP"];
const state = {
  currentUser: null,
  notifications: [],
  editingNotification: null
};

const elements = {
  apiStatus: document.getElementById("apiStatus"),
  currentAdminName: document.getElementById("currentAdminName"),
  adminState: document.getElementById("adminState"),
  userManagementLink: document.getElementById("userManagementLink"),
  refreshBtn: document.getElementById("refreshBtn"),
  pendingCount: document.getElementById("pendingCount"),
  approvedCount: document.getElementById("approvedCount"),
  sequenceCount: document.getElementById("sequenceCount"),
  auditCount: document.getElementById("auditCount"),
  notificationCount: document.getElementById("notificationCount"),
  notificationBody: document.getElementById("notificationBody"),
  partRevisionPendingCount: document.getElementById("partRevisionPendingCount"),
  partRevisionPendingBody: document.getElementById("partRevisionPendingBody"),
  revisionPendingCount: document.getElementById("revisionPendingCount"),
  revisionPendingBody: document.getElementById("revisionPendingBody"),
  documentsBody: document.getElementById("documentsBody"),
  sequenceBody: document.getElementById("sequenceBody"),
  auditBody: document.getElementById("auditBody"),
  sequenceSection: document.getElementById("sequenceSection"),
  notificationSection: document.getElementById("notificationSection"),
  partRevisionPendingSection: document.getElementById("partRevisionPendingSection"),
  revisionPendingSection: document.getElementById("revisionPendingSection"),
  approvedDocumentsSection: document.getElementById("approvedDocumentsSection"),
  auditSection: document.getElementById("auditSection"),
  messageBox: document.getElementById("messageBox"),
  notificationEditModal: document.getElementById("notificationEditModal"),
  notificationEditBackdrop: document.getElementById("notificationEditBackdrop"),
  notificationEditForm: document.getElementById("notificationEditForm"),
  notificationEditTitle: document.getElementById("notificationEditTitle"),
  notificationEditItem: document.getElementById("notificationEditItem"),
  notificationEditMessage: document.getElementById("notificationEditMessage"),
  notificationEditDocumentFields: document.getElementById("notificationEditDocumentFields"),
  notificationEditPartFields: document.getElementById("notificationEditPartFields"),
  notificationDocumentNo: document.getElementById("notificationDocumentNo"),
  notificationGeneratedFilename: document.getElementById("notificationGeneratedFilename"),
  notificationDocumentName: document.getElementById("notificationDocumentName"),
  notificationReferenceField: document.getElementById("notificationReferenceField"),
  notificationReferenceValue: document.getElementById("notificationReferenceValue"),
  notificationPartNumber: document.getElementById("notificationPartNumber"),
  notificationPartName: document.getElementById("notificationPartName"),
  notificationDescription: document.getElementById("notificationDescription"),
  notificationMainCategory: document.getElementById("notificationMainCategory"),
  notificationSubCategory: document.getElementById("notificationSubCategory"),
  notificationEditCancelBtn: document.getElementById("notificationEditCancelBtn"),
  notificationEditSaveBtn: document.getElementById("notificationEditSaveBtn")
};

document.addEventListener("DOMContentLoaded", init);

// Admin Review is intentionally data-dense: it manages auto-publish reviews,
// revision approvals, sequence state, official records and audit history.
async function init() {
  const user = await Auth.requireAuth();
  if (!user) return;
  if (!Auth.hasAnyPermission(user, ["document_admin", "part_admin"])) {
    if (Auth.hasPermission(user, "user_admin")) {
      window.location.href = "/users.html";
      return;
    }
    window.location.href = "/";
    return;
  }
  state.currentUser = user;
  elements.currentAdminName.textContent = `${user.display_name} (${Auth.roleLabel(user)})`;
  applyAdminAccess();
  elements.refreshBtn.addEventListener("click", refreshAll);
  elements.notificationBody.addEventListener("click", handleNotificationAction);
  elements.partRevisionPendingBody.addEventListener("click", handlePartRevisionPendingAction);
  elements.revisionPendingBody.addEventListener("click", handleRevisionPendingAction);
  elements.documentsBody.addEventListener("click", handleDocumentAction);
  elements.notificationEditForm.addEventListener("submit", handleNotificationEditSubmit);
  elements.notificationEditCancelBtn.addEventListener("click", closeNotificationEditModal);
  elements.notificationEditBackdrop.addEventListener("click", closeNotificationEditModal);
  await refreshAll();
}

function applyAdminAccess() {
  const canManageDocuments = Auth.hasPermission(state.currentUser, "document_admin");
  const canManageParts = Auth.hasPermission(state.currentUser, "part_admin");
  const canManageUsers = Auth.hasPermission(state.currentUser, "user_admin");

  elements.userManagementLink.classList.toggle("hidden", !canManageUsers);
  elements.sequenceSection.classList.toggle("hidden", !canManageDocuments);
  elements.revisionPendingSection.classList.toggle("hidden", !canManageDocuments);
  elements.approvedDocumentsSection.classList.toggle("hidden", !canManageDocuments);
  elements.notificationSection.classList.toggle("hidden", !(canManageDocuments || canManageParts));
  elements.partRevisionPendingSection.classList.toggle("hidden", !canManageParts);
}

async function refreshAll() {
  elements.adminState.textContent = "Loading";
  hideMessage();
  const canManageDocuments = Auth.hasPermission(state.currentUser, "document_admin");
  const canManageParts = Auth.hasPermission(state.currentUser, "part_admin");

  try {
    const data = {
      partRevisionPending: { revision_requests: [] },
      revisionPending: { revision_requests: [] },
      notifications: { notifications: [] },
      documents: { documents: [] },
      sequences: { sequences: [] },
      audit: { audit_logs: [] }
    };
    const requests = [
      apiGet("/api/admin/audit-logs?limit=100").then(result => { data.audit = result; })
    ];

    if (canManageDocuments) {
      requests.push(
        apiGet("/api/admin/revision-requests/pending").then(result => { data.revisionPending = result; }),
        apiGet("/api/documents").then(result => { data.documents = result; }),
        apiGet("/api/admin/sequences").then(result => { data.sequences = result; })
      );
    }

    if (canManageParts) {
      requests.push(
        apiGet("/api/admin/parts/revision-requests/pending").then(result => { data.partRevisionPending = result; })
      );
    }

    if (canManageDocuments || canManageParts) {
      requests.push(
        apiGet("/api/admin/notifications").then(result => { data.notifications = result; })
      );
    }

    await Promise.all(requests);

    const partRevisionRows = data.partRevisionPending.revision_requests || [];
    const revisionRows = data.revisionPending.revision_requests || [];
    const notificationRows = data.notifications.notifications || [];

    renderNotifications(notificationRows);
    renderPartRevisionPending(partRevisionRows);
    renderRevisionPending(revisionRows);
    renderDocuments(data.documents.documents || []);
    renderSequences(data.sequences.sequences || []);
    renderAudit(data.audit.audit_logs || []);
    elements.pendingCount.textContent = notificationRows.length + partRevisionRows.length + revisionRows.length;
    setApiStatus(true);
    elements.adminState.textContent = "Ready";
  } catch (error) {
    setApiStatus(false);
    elements.adminState.textContent = "Check required";
    showMessage(error.message, "error");
  }
}

async function handleNotificationAction(event) {
  const button = event.target.closest("button[data-action]");
  if (!button) return;

  const notificationId = Number(button.dataset.id);
  const action = button.dataset.action;
  const notification = state.notifications.find(item => Number(item.id) === notificationId);
  if (!notification) return;

  button.disabled = true;

  try {
    if (action === "notification-okay") {
      const result = await apiPost(`/api/admin/notifications/${notificationId}/okay`, {});
      showMessage(`${getNotificationItemLabel(notification, result)} marked OK.`, "success");
    }

    if (action === "notification-edit") {
      openNotificationEditModal(notification);
      button.disabled = false;
      return;
    }

    if (action === "notification-reject") {
      const metadata = parseMetadata(notification);
      const domain = getNotificationDomain(notification, metadata);
      const defaultReason = domain === "document"
        ? "Document ID request is not accepted."
        : "Part code request is not accepted.";
      const reason = window.prompt("Reject reason", defaultReason);
      if (reason === null) {
        button.disabled = false;
        return;
      }
      const result = await apiPost(`/api/admin/notifications/${notificationId}/reject`, { reason });
      showMessage(`${getNotificationItemLabel(notification, result)} rejected.`, "success");
    }

    await refreshAll();
  } catch (error) {
    showMessage(error.message, "error");
    button.disabled = false;
  }
}

async function handlePartRevisionPendingAction(event) {
  const button = event.target.closest("button[data-action]");
  if (!button) return;

  const requestId = button.dataset.id;
  const action = button.dataset.action;

  button.disabled = true;

  try {
    if (action === "approve-part-revision") {
      const revisionType = promptPartRevisionType(button.dataset.revisionType || "minor");
      if (revisionType === null) {
        button.disabled = false;
        return;
      }
      const result = await apiPost(`/api/admin/parts/revision-requests/${requestId}/approve`, { revision_type: revisionType });
      showMessage(`${formatPartRevisionType(revisionType)} part revision approved: ${result.part.part_number}.`, "success");
    }

    if (action === "reject-part-revision") {
      const reason = window.prompt("Reject reason", "Part revision update is not required.");
      if (reason === null) {
        button.disabled = false;
        return;
      }
      await apiPost(`/api/admin/parts/revision-requests/${requestId}/reject`, { reason });
      showMessage(`Part revision request #${requestId} rejected.`, "success");
    }

    await refreshAll();
  } catch (error) {
    showMessage(error.message, "error");
    button.disabled = false;
  }
}

async function handleRevisionPendingAction(event) {
  const button = event.target.closest("button[data-action]");
  if (!button) return;

  const requestId = button.dataset.id;
  const action = button.dataset.action;

  button.disabled = true;

  try {
    if (action === "approve-revision") {
      const result = await apiPost(`/api/admin/revision-requests/${requestId}/approve`, {});
      showMessage(`Revision approved: ${result.document.generated_filename}.`, "success");
    }

    if (action === "reject-revision") {
      const reason = window.prompt("Reject reason", "Revision update is not required.");
      if (reason === null) {
        button.disabled = false;
        return;
      }
      await apiPost(`/api/admin/revision-requests/${requestId}/reject`, { reason });
      showMessage(`Revision request #${requestId} rejected.`, "success");
    }

    await refreshAll();
  } catch (error) {
    showMessage(error.message, "error");
    button.disabled = false;
  }
}

async function handleDocumentAction(event) {
  const button = event.target.closest("button[data-action]");
  if (!button) return;

  const documentId = button.dataset.id;
  const action = button.dataset.action;

  button.disabled = true;
  try {
    if (action === "rename") {
      const currentName = button.dataset.name || "";
      const nextName = window.prompt("New document name", currentName);
      if (nextName === null || nextName.trim() === currentName.trim()) {
        button.disabled = false;
        return;
      }
      const result = await apiPost(`/api/admin/documents/${documentId}/rename`, {
        document_name: nextName
      });
      showMessage(`Document renamed: ${result.document.generated_filename}`, "success");
    }

    if (action === "revision") {
      const currentRevision = button.dataset.revision || "r00";
      const confirmed = window.confirm(`Update revision for ${button.dataset.documentNo} from ${currentRevision} to the next revision?`);
      if (!confirmed) {
        button.disabled = false;
        return;
      }
      const result = await apiPost(`/api/admin/documents/${documentId}/revision`, {});
      showMessage(`Revision updated: ${result.document.generated_filename}`, "success");
    }

    await refreshAll();
  } catch (error) {
    showMessage(error.message, "error");
    button.disabled = false;
  }
}

function renderNotifications(notifications) {
  state.notifications = notifications;
  elements.notificationCount.textContent = `${notifications.length} notifications`;

  if (notifications.length === 0) {
    elements.notificationBody.innerHTML = '<tr><td colspan="6" class="empty-cell">No review notifications</td></tr>';
    return;
  }

  elements.notificationBody.innerHTML = notifications.map(notification => {
    const metadata = parseMetadata(notification);
    const domain = getNotificationDomain(notification, metadata);
    const approveLabel = metadata.action === "edit_request" ? "Approve" : "OK";
    return `
      <tr>
        <td>
          <div class="action-row">
            <button class="compact-btn approve-btn" type="button" data-action="notification-okay" data-id="${notification.id}">${approveLabel}</button>
            <button class="compact-btn secondary-btn" type="button" data-action="notification-edit" data-id="${notification.id}">Edit</button>
            ${["document", "part"].includes(domain) ? `<button class="compact-btn reject-btn" type="button" data-action="notification-reject" data-id="${notification.id}">Reject</button>` : ""}
          </div>
        </td>
        <td>${escapeHtml(formatNotificationType(notification))}</td>
        <td class="mono-cell">${escapeHtml(metadata.label || getNotificationItemLabel(notification))}</td>
        <td>${escapeHtml(notification.body || "-")}</td>
        <td>${escapeHtml(notification.source_name || metadata.created_by || "-")}</td>
        <td>${formatDateTime(notification.created_at)}</td>
      </tr>
    `;
  }).join("");
}

function renderPartRevisionPending(requests) {
  elements.partRevisionPendingCount.textContent = `${requests.length} requests`;

  if (requests.length === 0) {
    elements.partRevisionPendingBody.innerHTML = '<tr><td colspan="8" class="empty-cell">No pending part revision requests</td></tr>';
    return;
  }

  elements.partRevisionPendingBody.innerHTML = requests.map(request => `
    <tr>
      <td>
        <div class="action-row">
          <button class="compact-btn approve-btn" type="button" data-action="approve-part-revision" data-id="${request.id}" data-revision-type="${escapeHtml(request.revision_type || "minor")}">Approve</button>
          <button class="compact-btn reject-btn" type="button" data-action="reject-part-revision" data-id="${request.id}">Reject</button>
        </div>
      </td>
      <td class="mono-cell">${escapeHtml(request.current_part_number || "-")}</td>
      <td class="mono-cell">${escapeHtml(request.current_revision_code || "-")}</td>
      <td class="mono-cell">${escapeHtml(request.requested_revision_code || "-")}</td>
      <td>${escapeHtml(formatPartRevisionType(request.revision_type))}</td>
      <td>${escapeHtml(request.part_name || "-")}</td>
      <td>${escapeHtml(request.requested_by || "-")}</td>
      <td>${formatDateTime(request.created_at)}</td>
    </tr>
  `).join("");
}

function promptPartRevisionType(defaultType) {
  let current = normalizePartRevisionType(defaultType) || "minor";
  while (true) {
    const value = window.prompt("Approve as revision type (minor or major)", current);
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

function renderRevisionPending(requests) {
  elements.revisionPendingCount.textContent = `${requests.length} requests`;

  if (requests.length === 0) {
    elements.revisionPendingBody.innerHTML = '<tr><td colspan="8" class="empty-cell">No pending revision requests</td></tr>';
    return;
  }

  elements.revisionPendingBody.innerHTML = requests.map(request => `
    <tr>
      <td>
        <div class="action-row">
          <button class="compact-btn approve-btn" type="button" data-action="approve-revision" data-id="${request.id}">Approve</button>
          <button class="compact-btn reject-btn" type="button" data-action="reject-revision" data-id="${request.id}">Reject</button>
        </div>
      </td>
      <td class="mono-cell">${escapeHtml(request.document_no || "-")}</td>
      <td class="mono-cell">${escapeHtml(request.current_revision || "-")}</td>
      <td class="mono-cell">${escapeHtml(request.requested_revision || "-")}</td>
      <td class="mono-cell">${escapeHtml(request.generated_filename || "-")}</td>
      <td>${escapeHtml(request.document_name || "-")}</td>
      <td>${escapeHtml(request.requested_by || "-")}</td>
      <td>${formatDateTime(request.created_at)}</td>
    </tr>
  `).join("");
}

function renderDocuments(documents) {
  elements.approvedCount.textContent = documents.length;

  if (documents.length === 0) {
    elements.documentsBody.innerHTML = '<tr><td colspan="7" class="empty-cell">No official documents</td></tr>';
    return;
  }

  elements.documentsBody.innerHTML = documents.map(documentRecord => `
    <tr>
      <td>
        <div class="action-row">
          <button class="compact-btn secondary-btn" type="button" data-action="rename" data-id="${documentRecord.id}" data-name="${escapeHtml(documentRecord.document_name)}">Edit Name</button>
          ${canUpdateRevision(documentRecord) ? `<button class="compact-btn secondary-btn" type="button" data-action="revision" data-id="${documentRecord.id}" data-document-no="${escapeHtml(documentRecord.document_no)}" data-revision="${escapeHtml(documentRecord.revision || "")}">Revision Update</button>` : ""}
        </div>
      </td>
      <td class="mono-cell">${escapeHtml(documentRecord.document_no)}</td>
      <td class="mono-cell">${escapeHtml(documentRecord.generated_filename)}</td>
      <td>${escapeHtml(formatCategory(documentRecord.category))}</td>
      <td>${escapeHtml(documentRecord.document_name)}</td>
      <td>${escapeHtml(documentRecord.checked_by || "-")}</td>
      <td>${formatDateTime(documentRecord.approved_at)}</td>
    </tr>
  `).join("");
}

function canUpdateRevision(documentRecord) {
  return REVISION_CATEGORIES.includes(documentRecord.category)
    && /^r\d{2}$/.test(documentRecord.revision || "");
}

function renderSequences(sequences) {
  elements.sequenceCount.textContent = sequences.length;

  if (sequences.length === 0) {
    elements.sequenceBody.innerHTML = '<tr><td colspan="3" class="empty-cell">No sequences yet</td></tr>';
    return;
  }

  elements.sequenceBody.innerHTML = sequences.map(sequence => `
    <tr>
      <td class="mono-cell">${escapeHtml(sequence.scope_key)}</td>
      <td class="mono-cell">${escapeHtml(sequence.next_sequence)}</td>
      <td>${formatDateTime(sequence.updated_at)}</td>
    </tr>
  `).join("");
}

function renderAudit(events) {
  elements.auditCount.textContent = events.length;

  if (events.length === 0) {
    elements.auditBody.innerHTML = '<tr><td colspan="4" class="empty-cell">No audit events</td></tr>';
    return;
  }

  elements.auditBody.innerHTML = events.map(event => `
    <tr>
      <td>${formatDateTime(event.created_at)}</td>
      <td>${escapeHtml(event.actor_name || "-")}</td>
      <td>${escapeHtml(event.action)}</td>
      <td class="mono-cell">${escapeHtml(event.entity_type)} #${escapeHtml(event.entity_id)}</td>
    </tr>
  `).join("");
}

function openNotificationEditModal(notification) {
  const metadata = parseMetadata(notification);
  const domain = getNotificationDomain(notification, metadata);
  state.editingNotification = notification;
  hideNotificationEditMessage();

  elements.notificationEditTitle.textContent = domain === "document" ? "Edit Document Review" : "Edit Part Review";
  elements.notificationEditItem.textContent = getNotificationItemLabel(notification);
  elements.notificationEditDocumentFields.classList.toggle("hidden", domain !== "document");
  elements.notificationEditPartFields.classList.toggle("hidden", domain !== "part");

  if (domain === "document") {
    elements.notificationDocumentNo.value = metadata.document_no || "";
    elements.notificationGeneratedFilename.value = metadata.generated_filename || "";
    elements.notificationDocumentName.value = metadata.document_name || "";
    elements.notificationReferenceValue.value = metadata.reference_value || "";
    elements.notificationReferenceField.classList.toggle("hidden", !canEditNotificationReference(metadata.category));
  } else {
    elements.notificationPartNumber.value = metadata.part_number || "";
    elements.notificationPartName.value = metadata.part_name || "";
    elements.notificationDescription.value = metadata.description || "";
    elements.notificationMainCategory.value = metadata.main_category || "";
    elements.notificationSubCategory.value = metadata.sub_category || "";
  }

  elements.notificationEditModal.classList.remove("hidden");
  document.body.classList.add("modal-open");
}

function closeNotificationEditModal() {
  state.editingNotification = null;
  elements.notificationEditModal.classList.add("hidden");
  document.body.classList.remove("modal-open");
  elements.notificationEditSaveBtn.disabled = false;
  hideNotificationEditMessage();
}

async function handleNotificationEditSubmit(event) {
  event.preventDefault();
  const notification = state.editingNotification;
  if (!notification) return;

  const body = collectNotificationEditBody(notification);
  if (!body) return;

  elements.notificationEditSaveBtn.disabled = true;
  try {
    await apiPost(`/api/admin/notifications/${notification.id}/edit`, body);
    const label = getNotificationItemLabel(notification);
    closeNotificationEditModal();
    showMessage(`${label} reviewed with edits.`, "success");
    await refreshAll();
  } catch (error) {
    showNotificationEditMessage(error.message, "error");
    elements.notificationEditSaveBtn.disabled = false;
  }
}

function collectNotificationEditBody(notification) {
  const metadata = parseMetadata(notification);
  const domain = getNotificationDomain(notification, metadata);

  if (domain === "document") {
    const documentNo = elements.notificationDocumentNo.value.trim();
    const generatedFilename = elements.notificationGeneratedFilename.value.trim();
    const documentName = elements.notificationDocumentName.value.trim();
    if (!documentNo || !documentName) {
      showNotificationEditMessage("Document no and document name are required.", "error");
      return null;
    }
    const body = {
      document_no: documentNo,
      document_name: documentName
    };
    if (generatedFilename && generatedFilename !== (metadata.generated_filename || "")) {
      body.generated_filename = generatedFilename;
    }
    if (canEditNotificationReference(metadata.category)) {
      body.reference_value = elements.notificationReferenceValue.value.trim();
    }
    return body;
  }

  const partName = elements.notificationPartName.value.trim();
  const partNumber = elements.notificationPartNumber.value.trim();
  const description = elements.notificationDescription.value.trim();
  const mainCategory = elements.notificationMainCategory.value.trim();
  const subCategory = elements.notificationSubCategory.value.trim();
  if (!partNumber || !partName || !description || !mainCategory) {
    showNotificationEditMessage("Part number, part name, description and main category are required.", "error");
    return null;
  }
  return {
    part_number: partNumber,
    part_name: partName,
    description,
    main_category: mainCategory,
    sub_category: subCategory
  };
}

function getNotificationDomain(notification, metadata = parseMetadata(notification)) {
  if (metadata.domain) return metadata.domain;
  if (notification.entity_type === "document_record") return "document";
  if (notification.entity_type === "part_record") return "part";
  return "document";
}

function showNotificationEditMessage(message, type) {
  elements.notificationEditMessage.textContent = message;
  elements.notificationEditMessage.className = `message-box ${type}`;
}

function hideNotificationEditMessage() {
  elements.notificationEditMessage.textContent = "";
  elements.notificationEditMessage.className = "message-box hidden";
}

function parseMetadata(notification) {
  try {
    return JSON.parse(notification.metadata_json || "{}") || {};
  } catch {
    return {};
  }
}

function formatNotificationType(notification) {
  const metadata = parseMetadata(notification);
  if (notification.type === "document_edit_request" || (metadata.domain === "document" && metadata.action === "edit_request")) return "Document Edit";
  if (notification.type === "part_edit_request" || (metadata.domain === "part" && metadata.action === "edit_request")) return "Part Edit";
  if (metadata.domain === "document" || notification.type === "document_auto_published") return "Document";
  if (metadata.domain === "part" || notification.type === "part_auto_published") return "Part";
  return notification.type || "-";
}

function getNotificationItemLabel(notification, result = null) {
  if (result && result.document) return result.document.document_no || result.document.generated_filename || "Document";
  if (result && result.part) return result.part.part_number || "Part";
  const metadata = parseMetadata(notification);
  return metadata.label || metadata.document_no || metadata.part_number || `#${notification.entity_id}`;
}

function canEditNotificationReference(category) {
  return ["D", "R", "MD", "MR", "EC"].includes(category);
}

async function apiGet(path) {
  const response = await fetch(path, {
    headers: Auth.authHeaders()
  });
  return parseResponse(response);
}

async function apiPost(path, body) {
  const response = await fetch(path, {
    method: "POST",
    headers: {
      ...Auth.authHeaders(),
      "content-type": "application/json",
    },
    body: JSON.stringify(body)
  });
  return parseResponse(response);
}

async function parseResponse(response) {
  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.message || "Request failed.");
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
