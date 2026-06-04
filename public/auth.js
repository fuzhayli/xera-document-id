(function () {
  const TOKEN_KEY = "xeraSessionToken";
  const ROLE_LABELS = {
    user: "User",
    part_admin: "Part List Admin",
    document_admin: "Document List Admin",
    user_admin: "User Permissions Admin",
    all_admin: "All Admin",
    admin: "All Admin"
  };
  const ROLE_PERMISSIONS = {
    user: [],
    part_admin: ["part_admin"],
    document_admin: ["document_admin"],
    user_admin: ["user_admin"],
    all_admin: ["part_admin", "document_admin", "user_admin"],
    admin: ["part_admin", "document_admin", "user_admin"]
  };
  const ADMIN_PERMISSIONS = ["part_admin", "document_admin", "user_admin"];

  function getToken() {
    return localStorage.getItem(TOKEN_KEY) || "";
  }

  function setSession(token) {
    localStorage.setItem(TOKEN_KEY, token);
  }

  function clearSession() {
    localStorage.removeItem(TOKEN_KEY);
  }

  function authHeaders(extra = {}) {
    const token = getToken();
    return {
      ...extra,
      ...(token ? { authorization: `Bearer ${token}` } : {})
    };
  }

  async function me() {
    const response = await fetch("/api/auth/me", {
      headers: authHeaders()
    });
    if (!response.ok) return null;
    const data = await response.json();
    return data.user;
  }

  async function requireAuth() {
    const user = await me();
    if (user) return user;
    const next = `${window.location.pathname}${window.location.search}`;
    window.location.href = `/login.html?next=${encodeURIComponent(next)}`;
    return null;
  }

  async function logout() {
    try {
      await fetch("/api/auth/logout", {
        method: "POST",
        headers: authHeaders()
      });
    } finally {
      clearSession();
      window.location.href = "/login.html";
    }
  }

  function normalizeRole(role) {
    const normalized = String(role || "user").trim().toLowerCase().replace(/[\s-]+/g, "_");
    return ROLE_LABELS[normalized] ? normalized : "user";
  }

  function hasPermission(user, permission) {
    if (!user) return false;
    return getPermissions(user).includes(permission);
  }

  function hasAnyPermission(user, permissions) {
    return (permissions || []).some(permission => hasPermission(user, permission));
  }

  function isAdmin(user) {
    return getPermissions(user).length > 0;
  }

  function roleLabel(roleOrUser) {
    if (typeof roleOrUser === "object" && roleOrUser) {
      const permissions = getPermissions(roleOrUser);
      if (permissions.length === 0) return ROLE_LABELS.user;
      if (permissions.length === ADMIN_PERMISSIONS.length) return ROLE_LABELS.all_admin;
      return permissions.map(permission => ROLE_LABELS[permission]).join(" + ");
    }
    const role = roleOrUser;
    const normalized = normalizeRole(role);
    return ROLE_LABELS[normalized] || "User";
  }

  function getPermissions(user) {
    if (!user) return [];
    if (Array.isArray(user.permissions)) {
      return ADMIN_PERMISSIONS.filter(permission => user.permissions.includes(permission));
    }
    return ROLE_PERMISSIONS[normalizeRole(user.role)] || [];
  }

  window.Auth = {
    getToken,
    setSession,
    clearSession,
    authHeaders,
    me,
    requireAuth,
    logout,
    hasPermission,
    hasAnyPermission,
    isAdmin,
    roleLabel,
    getPermissions
  };
})();
