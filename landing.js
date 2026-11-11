"use strict";

const signInButton = document.getElementById("google-sign-in");
const signInStatus = document.getElementById("sign-in-status");
const auth = window.EcoLingoAuth;
const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)");
let returningPlayer = false;

const params = new URLSearchParams(location.search);
if (params.get("signin") === "failed" || params.has("error") || params.has("error_code") || params.has("error_description")) {
  signInStatus.textContent = "Google sign-in could not be completed. Please try again.";
}

signInButton.addEventListener("click", async () => {
  if (returningPlayer) {
    location.assign(auth.appUrl().href);
    return;
  }
  signInButton.disabled = true;
  signInStatus.textContent = "Opening Google…";
  try {
    if (!auth) throw new Error("Sign-in is unavailable.");
    await auth.signIn();
  } catch (error) {
    console.warn("EcoLingo sign-in:", error.message);
    signInStatus.textContent = "Google sign-in is unavailable right now. Please try again.";
    signInButton.disabled = false;
  }
});

signInButton.disabled = false;

if (auth?.client) {
  auth.client.auth.getSession().then(({ data }) => {
    if (!auth.googleUser(data.session?.user)) return;
    returningPlayer = true;
    signInButton.querySelector("span").textContent = "Continue playing";
  }).catch(() => {});
}

if ("IntersectionObserver" in window && !reducedMotion.matches) {
  const reveal = new IntersectionObserver((entries) => {
    for (const entry of entries) {
      if (!entry.isIntersecting) continue;
      entry.target.classList.add("in-view");
      reveal.unobserve(entry.target);
    }
  }, { threshold: 0.14 });
  document.querySelectorAll(".reveal").forEach((element) => {
    element.classList.add("reveal-ready");
    reveal.observe(element);
  });
}
