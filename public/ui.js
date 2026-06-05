(function () {
  const ICONS = {
    dashboard: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 11.5 12 4l9 7.5"></path><path d="M5 10.5V20h5v-5h4v5h5v-9.5"></path></svg>',
    plus: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14"></path><path d="M5 12h14"></path></svg>',
    list: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 7h11"></path><path d="M8 12h11"></path><path d="M8 17h11"></path><path d="M4 7h.01"></path><path d="M4 12h.01"></path><path d="M4 17h.01"></path></svg>',
    document: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 3h8l4 4v14H7z"></path><path d="M15 3v5h5"></path><path d="M10 12h6"></path><path d="M10 16h6"></path></svg>',
    box: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m21 8-9-5-9 5 9 5 9-5Z"></path><path d="M3 8v8l9 5 9-5V8"></path><path d="M12 13v8"></path></svg>',
    shield: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3 20 6v6c0 5-3.4 8-8 9-4.6-1-8-4-8-9V6l8-3Z"></path><path d="m9 12 2 2 4-5"></path></svg>',
    archive: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16v13H4z"></path><path d="M3 4h18v3H3z"></path><path d="M9 11h6"></path></svg>',
    settings: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 15.5A3.5 3.5 0 1 0 12 8a3.5 3.5 0 0 0 0 7.5Z"></path><path d="M19 13.5v-3l-2.1-.4a7 7 0 0 0-.8-1.9l1.2-1.8-2.1-2.1-1.8 1.2a7 7 0 0 0-1.9-.8L11.1 2H8.1l-.4 2.1a7 7 0 0 0-1.9.8L4 3.7 1.9 5.8l1.2 1.8a7 7 0 0 0-.8 1.9L.2 9.9v3l2.1.4c.2.7.5 1.3.8 1.9L1.9 17l2.1 2.1 1.8-1.2c.6.4 1.2.7 1.9.8l.4 2.1h3l.4-2.1c.7-.2 1.3-.5 1.9-.8l1.8 1.2 2.1-2.1-1.2-1.8c.4-.6.7-1.2.8-1.9l2.1-.4Z" transform="translate(2 1) scale(.83)"></path></svg>',
    users: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M16 20c0-2.2-1.8-4-4-4H8c-2.2 0-4 1.8-4 4"></path><path d="M10 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z"></path><path d="M22 20c0-2-1.2-3.4-3-3.8"></path><path d="M17 4.4a3.5 3.5 0 0 1 0 6.8"></path></svg>',
    user: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 21a8 8 0 0 0-16 0"></path><path d="M12 13a5 5 0 1 0 0-10 5 5 0 0 0 0 10Z"></path></svg>',
    bell: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9"></path><path d="M10 21h4"></path></svg>',
    logout: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path><path d="m16 17 5-5-5-5"></path><path d="M21 12H9"></path></svg>'
  };

  const NAV_GROUPS = [
    {
      label: "Workspace",
      items: [
        { href: "/", label: "Dashboard", icon: "dashboard", match: ["/", "/index.html"] }
      ]
    },
    {
      label: "Requests",
      items: [
        { href: "/?view=new", label: "New Request", icon: "plus", view: "new", match: ["/part-request.html"] },
        { href: "/?view=my", label: "My Requests", icon: "list", view: "my" }
      ]
    },
    {
      label: "Lists",
      items: [
        { href: "/documents.html", label: "Documents", icon: "document", match: ["/documents.html"] },
        { href: "/parts.html", label: "Parts", icon: "box", match: ["/parts.html"] }
      ]
    },
    {
      label: "Archives",
      items: [
        { href: "/archive.html", label: "Document Archive", icon: "archive", match: ["/archive.html"] },
        { href: "/parts-archive.html", label: "Parts Archive", icon: "archive", match: ["/parts-archive.html"] }
      ]
    },
    {
      label: "Admin",
      items: [
        { href: "/admin.html", label: "Admin Review", icon: "settings", match: ["/admin.html"], permissions: ["document_admin", "part_admin"] },
        { href: "/deleted-items.html", label: "Deleted Items", icon: "archive", match: ["/deleted-items.html"], permissions: ["document_admin", "part_admin"] },
        { href: "/users.html", label: "Users", icon: "users", match: ["/users.html"], permissions: ["user_admin"] }
      ]
    }
  ];

  document.addEventListener("DOMContentLoaded", initChrome);
  document.addEventListener("DOMContentLoaded", disableFilterFormEnter);
  document.addEventListener("DOMContentLoaded", initSearchScopePickers);
  document.addEventListener("click", closeSearchScopesOnOutsideClick);

  window.XeraSearchScopes = {
    getSelected(scopeId) {
      const picker = document.getElementById(scopeId);
      if (!picker) return [];
      return [...picker.querySelectorAll("[data-search-scope-option]:checked")].map(input => input.value);
    },
    clear(scopeId) {
      const picker = document.getElementById(scopeId);
      if (!picker) return;
      picker.querySelectorAll("[data-search-scope-option]").forEach(input => {
        input.checked = false;
      });
      updateSearchScopeLabel(picker);
    }
  };

  async function initChrome() {
    if (document.body.classList.contains("auth-page") || document.body.classList.contains("embed-mode") || isEmbedRequest()) return;

    document.body.classList.add("app-page");
    wrapExistingContent();
    buildSidebar();
    markActiveNav();
    await applyUserChrome();
    setupThemeToggler();
  }

  function isEmbedRequest() {
    return Boolean(new URLSearchParams(window.location.search).get("embed"));
  }

  function disableFilterFormEnter() {
    document.querySelectorAll(".filter-form").forEach(form => {
      form.addEventListener("submit", event => {
        event.preventDefault();
      });
      form.addEventListener("keydown", event => {
        if (event.key !== "Enter") return;
        if (!isTextEntryField(event.target)) return;
        event.preventDefault();
        event.stopPropagation();
      }, true);
    });
  }

  function isTextEntryField(target) {
    const tagName = String(target?.tagName || "").toLowerCase();
    const inputType = String(target?.type || "").toLowerCase();
    if (tagName === "textarea") return true;
    return tagName === "input" && !["button", "checkbox", "file", "radio", "reset", "submit"].includes(inputType);
  }

  function initSearchScopePickers() {
    document.querySelectorAll("[data-search-scope]").forEach(picker => {
      picker.querySelectorAll("[data-search-scope-option]").forEach(input => {
        input.addEventListener("change", () => updateSearchScopeLabel(picker));
      });
      picker.addEventListener("keydown", event => {
        if (event.key === "Escape") picker.open = false;
      });
      updateSearchScopeLabel(picker);
    });
  }

  function updateSearchScopeLabel(picker) {
    const label = picker.querySelector("[data-search-scope-label]");
    if (!label) return;
    const selected = [...picker.querySelectorAll("[data-search-scope-option]:checked")];
    if (selected.length === 0) {
      label.textContent = "All fields";
    } else if (selected.length === 1) {
      label.textContent = selected[0].dataset.label || selected[0].value;
    } else {
      label.textContent = `${selected.length} fields`;
    }
  }

  function closeSearchScopesOnOutsideClick(event) {
    document.querySelectorAll("[data-search-scope][open]").forEach(picker => {
      if (!picker.contains(event.target)) picker.open = false;
    });
  }

  function wrapExistingContent() {
    if (document.querySelector(".app-main")) return;
    const appMain = document.createElement("div");
    appMain.className = "app-main";

    for (const node of [...document.body.childNodes]) {
      if (node.nodeName === "SCRIPT") continue;
      appMain.appendChild(node);
    }

    document.body.insertBefore(appMain, document.body.firstChild);
  }

  function buildSidebar() {
    if (document.querySelector(".app-sidebar")) return;

    const sidebar = document.createElement("aside");
    sidebar.className = "app-sidebar";
    sidebar.innerHTML = `
      <a class="sidebar-logo" href="/" aria-label="XERA Dashboard">
        <img src="/logo.png" alt="XERA">
      </a>
      <nav class="sidebar-nav" aria-label="Primary navigation">
        ${NAV_GROUPS.map(group => `
          <section class="sidebar-group${group.items.every(item => item.permissions) ? " hidden" : ""}">
            <span class="sidebar-group-label">${group.label}</span>
            <div class="sidebar-group-links">
              ${group.items.map(renderNavItem).join("")}
            </div>
          </section>
        `).join("")}
      </nav>
      <div class="sidebar-footer">
        <span class="sidebar-footer-icon">${ICONS.shield}</span>
        <span>
          <strong>XERA Control Center</strong>
          <small>&copy; 2024 XERA. All rights reserved.</small>
        </span>
      </div>
    `;

    document.body.insertBefore(sidebar, document.body.firstChild);
  }

  function renderNavItem(item) {
    return `
      <a class="sidebar-link${item.permissions ? " permission-only hidden" : ""}" href="${item.href}" data-match="${(item.match || []).join("|")}" data-view="${item.view || ""}" data-permissions="${(item.permissions || []).join("|")}">
        <span class="sidebar-icon">${ICONS[item.icon]}</span>
        <span>${item.label}</span>
      </a>
    `;
  }

  function markActiveNav() {
    const path = window.location.pathname;
    const view = new URLSearchParams(window.location.search).get("view") || "";

    document.querySelectorAll(".sidebar-link").forEach(link => {
      const matches = (link.dataset.match || "").split("|").filter(Boolean);
      const isViewMatch = link.dataset.view && matchesIndexView(path, view, link.dataset.view);
      const isDashboardMatch = matches.includes(path) && !link.dataset.view && !view;
      const isPageMatch = matches.includes(path) && !["/", "/index.html"].includes(path);
      link.classList.toggle("active", isDashboardMatch || isPageMatch || isViewMatch);
    });
  }

  function matchesIndexView(path, view, expectedView) {
    return ["/", "/index.html"].includes(path) && view === expectedView;
  }

  async function applyUserChrome() {
    if (!window.Auth) return;
    const user = await Auth.me();

    document.querySelectorAll(".permission-only").forEach(link => {
      const permissions = (link.dataset.permissions || "").split("|").filter(Boolean);
      link.classList.toggle("hidden", !Auth.hasAnyPermission(user, permissions));
    });
    syncSidebarGroups();
    await applyAdminTaskBadge(user);

    const strip = document.querySelector(".user-strip");
    if (!strip || !user) return;
    if (strip.dataset.enhanced !== "true") {
      strip.dataset.enhanced = "true";
      strip.insertAdjacentHTML("afterbegin", `
        <span class="user-avatar">${ICONS.user}</span>
        <span class="user-identity">
          <span class="user-name">${escapeHtml(user.display_name)}</span>
          <span class="user-role">${escapeHtml(user.position || Auth.roleLabel(user))}</span>
        </span>
      `);
    }
    ensureTopbarActions(strip);
    await applyNotificationBadge(user);
  }

  function syncSidebarGroups() {
    document.querySelectorAll(".sidebar-group").forEach(group => {
      const hasVisibleLink = [...group.querySelectorAll(".sidebar-link")]
        .some(link => !link.classList.contains("hidden"));
      group.classList.toggle("hidden", !hasVisibleLink);
    });
  }

  function ensureTopbarActions(strip) {
    if (!strip.querySelector(".notification-btn")) {
      strip.insertAdjacentHTML("beforeend", `
        <button class="top-icon-btn notification-btn" type="button" aria-label="Notifications">
          ${ICONS.bell}
          <span class="notification-badge hidden">0</span>
        </button>
      `);
    }

    if (!strip.querySelector("#logoutBtn.top-icon-btn") && !strip.querySelector("[data-global-logout]")) {
      strip.insertAdjacentHTML("beforeend", `
        <button class="top-icon-btn" data-global-logout type="button" aria-label="Logout">
          ${ICONS.logout}
        </button>
      `);
      strip.querySelector("[data-global-logout]").addEventListener("click", Auth.logout);
    }
  }

  async function applyAdminTaskBadge(user) {
    if (!Auth.hasAnyPermission(user, ["document_admin", "part_admin"])) return;
    const adminLinks = [...document.querySelectorAll('.sidebar-link[href="/admin.html"]')];
    if (adminLinks.length === 0) return;

    try {
      const response = await fetch("/api/admin/tasks/summary", {
        headers: Auth.authHeaders()
      });
      if (!response.ok) return;
      const data = await response.json();
      const count = Number(data.summary && data.summary.total || 0);
      for (const link of adminLinks) {
        link.querySelector(".nav-badge")?.remove();
        if (count > 0) {
          link.insertAdjacentHTML("beforeend", `<span class="nav-badge">${count > 99 ? "99+" : count}</span>`);
        }
      }
    } catch {
      // Navigation badges are best-effort; page-level admin tables remain authoritative.
    }
  }

  async function applyNotificationBadge(user) {
    if (!user) return;
    try {
      const response = await fetch("/api/notifications/my", {
        headers: Auth.authHeaders()
      });
      if (!response.ok) return;
      const data = await response.json();
      const count = (data.notifications || [])
        .filter(notification => notification.status === "unread")
        .length;
      document.querySelectorAll(".notification-badge").forEach(badge => {
        badge.textContent = count > 99 ? "99+" : String(count);
        badge.classList.toggle("hidden", count === 0);
      });
    } catch {
      // Notification badges are best-effort; page-level lists remain authoritative.
    }
  }

  function escapeHtml(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function setupThemeToggler() {
    const strip = document.querySelector(".user-strip");
    if (!strip || document.getElementById("themeToggleBtn")) return;

    const hasDivider = strip.querySelector(".topbar-divider");
    if (!hasDivider) {
      strip.insertAdjacentHTML("beforeend", '<div class="topbar-divider" aria-hidden="true"></div>');
    }

    const toggleHtml = `
      <button id="themeToggleBtn" class="theme-toggle-btn" type="button" aria-label="Toggle Theme">
        <svg class="sun-icon hidden" viewBox="0 0 24 24" aria-hidden="true">
          <circle cx="12" cy="12" r="4"></circle>
          <path d="M12 2v2"></path>
          <path d="M12 20v2"></path>
          <path d="M4.93 4.93l1.41 1.41"></path>
          <path d="M17.66 17.66l1.41 1.41"></path>
          <path d="M2 12h2"></path>
          <path d="M20 12h2"></path>
          <path d="M6.34 17.66l-1.41 1.41"></path>
          <path d="M19.07 4.93l-1.41 1.41"></path>
        </svg>
        <svg class="moon-icon hidden" viewBox="0 0 24 24" aria-hidden="true">
          <path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"></path>
        </svg>
      </button>
    `;
    strip.insertAdjacentHTML("beforeend", toggleHtml);

    const btn = document.getElementById("themeToggleBtn");
    const sun = btn.querySelector(".sun-icon");
    const moon = btn.querySelector(".moon-icon");

    const updateIcons = (theme) => {
      if (theme === "dark") {
        sun.classList.remove("hidden");
        moon.classList.add("hidden");
      } else {
        sun.classList.add("hidden");
        moon.classList.remove("hidden");
      }
    };

    const currentTheme = document.documentElement.getAttribute("data-theme") || "light";
    updateIcons(currentTheme);

    btn.addEventListener("click", () => {
      const activeTheme = document.documentElement.getAttribute("data-theme") || "light";
      const newTheme = activeTheme === "dark" ? "light" : "dark";
      document.documentElement.setAttribute("data-theme", newTheme);
      localStorage.setItem("xera-theme", newTheme);
      updateIcons(newTheme);

      // Propagate to any active iframes
      document.querySelectorAll("iframe").forEach(iframe => {
        try {
          if (iframe.contentDocument) {
            iframe.contentDocument.documentElement.setAttribute("data-theme", newTheme);
          }
        } catch (e) {}
      });
    });

    // Listen to newly loaded iframes to ensure theme alignment
    document.addEventListener("load", (event) => {
      if (event.target.tagName === "IFRAME") {
        try {
          const activeTheme = document.documentElement.getAttribute("data-theme") || "light";
          event.target.contentDocument.documentElement.setAttribute("data-theme", activeTheme);
        } catch (e) {}
      }
    }, true);
  }
})();
