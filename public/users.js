const state = {
  currentUser: null,
  users: []
};

const elements = {
  apiStatus: document.getElementById("apiStatus"),
  currentAdminName: document.getElementById("currentAdminName"),
  adminControlLink: document.getElementById("adminControlLink"),
  userState: document.getElementById("userState"),
  refreshBtn: document.getElementById("refreshBtn"),
  logoutBtn: document.getElementById("logoutBtn"),
  form: document.getElementById("createUserForm"),
  displayName: document.getElementById("displayName"),
  position: document.getElementById("position"),
  email: document.getElementById("email"),
  department: document.getElementById("department"),
  password: document.getElementById("password"),
  clearBtn: document.getElementById("clearBtn"),
  messageBox: document.getElementById("messageBox"),
  userCount: document.getElementById("userCount"),
  usersBody: document.getElementById("usersBody")
};

document.addEventListener("DOMContentLoaded", init);

async function init() {
  const user = await Auth.requireAuth();
  if (!user) return;
  if (!Auth.hasPermission(user, "user_admin")) {
    window.location.href = "/";
    return;
  }

  state.currentUser = user;
  elements.currentAdminName.textContent = `${user.display_name} (${Auth.roleLabel(user)})`;
  elements.adminControlLink.classList.toggle("hidden", !Auth.hasAnyPermission(user, ["document_admin", "part_admin"]));
  elements.refreshBtn.addEventListener("click", loadUsers);
  elements.logoutBtn.addEventListener("click", Auth.logout);
  elements.clearBtn.addEventListener("click", clearForm);
  elements.form.addEventListener("submit", createUser);
  elements.usersBody.addEventListener("click", handleUserAction);

  await loadUsers();
}

async function loadUsers() {
  elements.userState.textContent = "Loading";
  hideMessage();

  try {
    const data = await apiGet("/api/admin/users");
    state.users = data.users || [];
    renderUsers();
    setApiStatus(true);
    elements.userState.textContent = "Ready";
  } catch (error) {
    setApiStatus(false);
    elements.userState.textContent = "Check required";
    showMessage(error.message, "error");
  }
}

async function createUser(event) {
  event.preventDefault();
  hideMessage();

  try {
    const result = await apiPost("/api/admin/users", {
      display_name: elements.displayName.value,
      position: elements.position.value,
      permissions: getCreatePermissions(),
      email: elements.email.value,
      department: elements.department.value,
      password: elements.password.value
    });
    showMessage(`User created: ${result.user.email}`, "success");
    clearForm();
    await loadUsers();
  } catch (error) {
    showMessage(error.message, "error");
  }
}

async function handleUserAction(event) {
  const button = event.target.closest("button[data-action]");
  if (!button) return;

  const userId = Number(button.dataset.id);
  const targetUser = state.users.find(user => user.id === userId);
  if (!targetUser) return;

  if (button.dataset.action === "edit") {
    await editUser(targetUser);
    return;
  }

  if (button.dataset.action === "password") {
    await resetPassword(targetUser);
    return;
  }

  if (button.dataset.action === "permissions") {
    await savePermissions(targetUser, button);
  }
}

async function editUser(user) {
  const displayName = window.prompt("Full name", user.display_name || "");
  if (displayName === null) return;

  const position = window.prompt("Position", user.position || "");
  if (position === null) return;

  const department = window.prompt("Department", user.department || "");
  if (department === null) return;

  const email = window.prompt("Email", user.email || "");
  if (email === null) return;

  try {
    const result = await apiPost(`/api/admin/users/${user.id}`, {
      display_name: displayName,
      position,
      department,
      email
    });
    showMessage(`User updated: ${result.user.email}`, "success");
    await loadUsers();
  } catch (error) {
    showMessage(error.message, "error");
  }
}

async function savePermissions(user, button) {
  const permissionBox = document.querySelector(`[data-permissions-for="${user.id}"]`);
  if (!permissionBox) return;
  const permissions = [...permissionBox.querySelectorAll("input[data-permission]:checked")]
    .map(input => input.dataset.permission);

  button.disabled = true;
  try {
    const result = await apiPost(`/api/admin/users/${user.id}/permissions`, {
      permissions
    });
    showMessage(`Permissions updated: ${result.user.email} (${Auth.roleLabel(result.user)})`, "success");
    await loadUsers();
  } catch (error) {
    showMessage(error.message, "error");
    button.disabled = false;
    await loadUsers();
  }
}

async function resetPassword(user) {
  const password = window.prompt(`New password for ${user.email}`, "");
  if (password === null) return;

  try {
    await apiPost(`/api/admin/users/${user.id}/password`, { password });
    showMessage(`Password reset for ${user.email}.`, "success");
    await loadUsers();
  } catch (error) {
    showMessage(error.message, "error");
  }
}

function renderUsers() {
  elements.userCount.textContent = `${state.users.length} users`;

  if (state.users.length === 0) {
    elements.usersBody.innerHTML = '<tr><td colspan="8" class="empty-cell">No users</td></tr>';
    return;
  }

  elements.usersBody.innerHTML = state.users.map(user => `
    <tr>
      <td>
        <div class="action-row">
          <button class="compact-btn secondary-btn" type="button" data-action="edit" data-id="${user.id}">Edit</button>
          <button class="compact-btn secondary-btn" type="button" data-action="permissions" data-id="${user.id}">Save Permissions</button>
          <button class="compact-btn secondary-btn" type="button" data-action="password" data-id="${user.id}">Password</button>
        </div>
      </td>
      <td>${escapeHtml(user.display_name || "-")}</td>
      <td class="mono-cell">${escapeHtml(user.email || "-")}</td>
      <td>${escapeHtml(user.position || "-")}</td>
      <td>${escapeHtml(user.department || "-")}</td>
      <td>${renderPermissionControls(user)}</td>
      <td>${escapeHtml(user.active_sessions || 0)}</td>
      <td>${formatDateTime(user.created_at)}</td>
    </tr>
  `).join("");
}

function renderPermissionControls(user) {
  const permissions = Auth.getPermissions(user);
  const options = [
    ["part_admin", "Part List"],
    ["document_admin", "Document List"],
    ["user_admin", "User Management"]
  ];
  return `
    <div class="permission-checks" data-permissions-for="${user.id}">
      ${options.map(([value, label]) => `
        <label>
          <input type="checkbox" data-permission="${value}" ${permissions.includes(value) ? "checked" : ""}>
          <span>${label}</span>
        </label>
      `).join("")}
    </div>
  `;
}

function clearForm() {
  elements.form.reset();
  elements.form.querySelectorAll('input[name="permissions"]').forEach(input => {
    input.checked = false;
  });
}

function getCreatePermissions() {
  return [...elements.form.querySelectorAll('input[name="permissions"]:checked')]
    .map(input => input.value);
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
  if (!response.ok) throw new Error(data.message || "Request failed.");
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

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
