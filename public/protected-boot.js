(function () {
  const protectedPaths = new Set([
    "/",
    "/index.html",
    "/admin.html",
    "/deleted-items.html",
    "/users.html",
    "/part-request.html"
  ]);
  const path = window.location.pathname || "/";

  if (!protectedPaths.has(path)) return;
  if (new URLSearchParams(window.location.search).get("embed")) return;

  document.documentElement.classList.add("auth-pending");

  let token = "";
  try {
    token = localStorage.getItem("xeraSessionToken") || "";
  } catch {
    token = "";
  }

  if (!token) {
    const next = `${window.location.pathname}${window.location.search}`;
    window.location.replace(`/login.html?next=${encodeURIComponent(next)}`);
  }
})();
