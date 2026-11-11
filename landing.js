"use strict";

const form = document.getElementById("guest-form");
const nameField = document.getElementById("guest-name");
const errorText = document.getElementById("guest-error");
const guestKey = "ecolingo-classroom-player";
const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)");

function showGuestError(message) {
  errorText.textContent = message;
  errorText.hidden = !message;
  if (message) nameField.setAttribute("aria-invalid", "true");
  else nameField.removeAttribute("aria-invalid");
}

nameField.addEventListener("input", () => showGuestError(""));

form.addEventListener("submit", (event) => {
  event.preventDefault();
  const name = nameField.value.trim().replace(/\s+/g, " ");
  if (!name) {
    showGuestError("Enter your name or a nickname to play.");
    nameField.focus();
    return;
  }

  try {
    const previous = JSON.parse(sessionStorage.getItem(guestKey) || "null");
    if (previous?.id) {
      sessionStorage.removeItem("ecolingo-classroom-progress-" + previous.id);
      sessionStorage.removeItem("ecolingo-classroom-auth-" + previous.id);
    }
    const id = Array.from(crypto.getRandomValues(new Uint8Array(16)), (byte) => byte.toString(16).padStart(2, "0")).join("");
    sessionStorage.setItem(guestKey, JSON.stringify({ id, name }));
  } catch {
    showGuestError("Allow site storage in your browser to start a guest session.");
    return;
  }

  location.assign("app.html?mode=guest");
});

document.querySelectorAll(".focus-name").forEach((link) => {
  link.addEventListener("click", (event) => {
    event.preventDefault();
    nameField.focus({ preventScroll: true });
    form.scrollIntoView({ block: "center" });
  });
});

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

if (!reducedMotion.matches && matchMedia("(pointer: fine)").matches) {
  const hero = document.querySelector(".hero");
  const photo = document.querySelector(".hero-photo");
  let frame = 0;
  hero.addEventListener("pointermove", (event) => {
    cancelAnimationFrame(frame);
    frame = requestAnimationFrame(() => {
      const bounds = hero.getBoundingClientRect();
      photo.style.setProperty("--move-x", ((event.clientX - bounds.left) / bounds.width - 0.5) * -16 + "px");
      photo.style.setProperty("--move-y", ((event.clientY - bounds.top) / bounds.height - 0.5) * -12 + "px");
    });
  });
  hero.addEventListener("pointerleave", () => {
    cancelAnimationFrame(frame);
    photo.style.setProperty("--move-x", "0px");
    photo.style.setProperty("--move-y", "0px");
  });
}

const answers = document.querySelectorAll("[data-answer]");
const feedback = document.querySelector(".sample-feedback");
answers.forEach((button) => {
  button.setAttribute("aria-pressed", "false");
  button.addEventListener("click", () => {
    answers.forEach((option) => option.setAttribute("aria-pressed", String(option === button)));
    const correct = button.dataset.answer === "right";
    feedback.dataset.result = correct ? "correct" : "retry";
    feedback.textContent = correct
      ? "Correct. Planning meals makes it easier to buy only what you’ll use."
      : "Try again. Which option helps you buy only what you’ll use?";
  });
});
