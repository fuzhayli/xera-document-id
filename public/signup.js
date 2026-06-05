const elements = {
  form: document.getElementById("signupForm"),
  displayName: document.getElementById("displayName"),
  position: document.getElementById("position"),
  email: document.getElementById("email"),
  password: document.getElementById("password"),
  confirmPassword: document.getElementById("confirmPassword"),
  messageBox: document.getElementById("messageBox"),
  loginLink: document.getElementById("loginLink"),
  createAccountBtn: document.getElementById("createAccountBtn"),
  loginConfirmModal: document.getElementById("loginConfirmModal"),
  loginConfirmBackdrop: document.getElementById("loginConfirmBackdrop"),
  stayOnSignupBtn: document.getElementById("stayOnSignupBtn"),
  confirmLoginBtn: document.getElementById("confirmLoginBtn"),
  signupSuccessModal: document.getElementById("signupSuccessModal"),
  continueAfterSignupBtn: document.getElementById("continueAfterSignupBtn")
};

const nextUrl = getNextUrl();
let pendingLoginUrl = "";

elements.loginLink.href = `/login.html?next=${encodeURIComponent(nextUrl)}`;
elements.form.addEventListener("submit", signup);
elements.loginLink.addEventListener("click", confirmLoginNavigation);
elements.loginConfirmBackdrop.addEventListener("click", closeLoginConfirmModal);
elements.stayOnSignupBtn.addEventListener("click", closeLoginConfirmModal);
elements.confirmLoginBtn.addEventListener("click", goToLogin);
elements.continueAfterSignupBtn.addEventListener("click", () => {
  window.location.href = nextUrl;
});
document.addEventListener("keydown", event => {
  if (event.key === "Escape" && !elements.loginConfirmModal.classList.contains("hidden")) {
    closeLoginConfirmModal();
  }
});

async function signup(event) {
  event.preventDefault();
  hideMessage();

  if (elements.password.value !== elements.confirmPassword.value) {
    showMessage("Passwords do not match.", "error");
    return;
  }

  elements.createAccountBtn.disabled = true;

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
    showSignupSuccessModal();
  } catch (error) {
    showMessage(error.message, "error");
    elements.createAccountBtn.disabled = false;
  }
}

function confirmLoginNavigation(event) {
  event.preventDefault();
  pendingLoginUrl = elements.loginLink.href;
  elements.loginConfirmModal.classList.remove("hidden");
  document.body.classList.add("modal-open");
  elements.stayOnSignupBtn.focus();
}

function closeLoginConfirmModal() {
  elements.loginConfirmModal.classList.add("hidden");
  document.body.classList.remove("modal-open");
  elements.loginLink.focus();
}

function goToLogin() {
  window.location.href = pendingLoginUrl || elements.loginLink.href;
}

function showSignupSuccessModal() {
  elements.signupSuccessModal.classList.remove("hidden");
  document.body.classList.add("modal-open");
  elements.continueAfterSignupBtn.focus();
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
