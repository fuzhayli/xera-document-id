const elements = {
  form: document.getElementById("signupForm"),
  displayName: document.getElementById("displayName"),
  position: document.getElementById("position"),
  email: document.getElementById("email"),
  password: document.getElementById("password"),
  confirmPassword: document.getElementById("confirmPassword"),
  messageBox: document.getElementById("messageBox"),
  loginLink: document.getElementById("loginLink")
};

const nextUrl = getNextUrl();
elements.loginLink.href = `/login.html?next=${encodeURIComponent(nextUrl)}`;
elements.form.addEventListener("submit", signup);

async function signup(event) {
  event.preventDefault();
  hideMessage();

  if (elements.password.value !== elements.confirmPassword.value) {
    showMessage("Passwords do not match.", "error");
    return;
  }

  try {
    const response = await fetch("/api/auth/signup", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        display_name: elements.displayName.value,
        position: elements.position.value,
        email: elements.email.value,
        password: elements.password.value
      })
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.message || "Account could not be created.");
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
