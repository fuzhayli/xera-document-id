const elements = {
  form: document.getElementById("loginForm"),
  email: document.getElementById("email"),
  password: document.getElementById("password"),
  messageBox: document.getElementById("messageBox"),
  signupDivider: document.getElementById("signupDivider"),
  signupLink: document.getElementById("signupLink")
};

const nextUrl = getNextUrl();
configureSignupLink();
elements.form.addEventListener("submit", login);

async function configureSignupLink() {
  try {
    const response = await fetch("/api/public-config");
    const config = await response.json();
    if (!response.ok || !config.allow_public_signup) return;

    elements.signupLink.href = `/signup.html?next=${encodeURIComponent(nextUrl)}`;
    elements.signupDivider.hidden = false;
    elements.signupLink.hidden = false;
  } catch {
    elements.signupDivider.hidden = true;
    elements.signupLink.hidden = true;
  }
}

async function login(event) {
  event.preventDefault();
  hideMessage();

  try {
    const response = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        email: elements.email.value,
        password: elements.password.value
      })
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.message || "Login failed.");
    Auth.setSession(data.token);
    window.location.href = nextUrl;
  } catch (error) {
    showMessage(error.message, "error");
  }
}

function getNextUrl() {
  const params = new URLSearchParams(window.location.search);
  const next = params.get("next") || "/documents.html";
  if (!next.startsWith("/") || next.startsWith("//")) return "/documents.html";
  return next;
}

function showMessage(message, type) {
  elements.messageBox.textContent = message;
  elements.messageBox.className = `message-box ${type}`;
}

function hideMessage() {
  elements.messageBox.className = "message-box hidden";
  elements.messageBox.textContent = "";
}
