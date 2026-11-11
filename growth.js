"use strict";

(() => {
  const lessons = [
    { sdg: "17", title: "The 17 Goals", summary: "Meet the UN Sustainable Development Goals and see how the 17 goals connect." },
    { sdg: "4", title: "Learning for change", summary: "Explore how quality education helps people build more sustainable communities." },
    { sdg: "12", title: "Use less, waste less", summary: "See how refilling, repairing and taking smaller portions can cut everyday waste." },
    { sdg: "13", title: "Act on campus", summary: "Find small ways to reduce emissions, from walking to class to saving energy in your room." },
  ];
  const hero = document.querySelector(".hero");
  const scene = document.getElementById("plant-scene");
  const canvas = document.getElementById("air");
  const motion = matchMedia("(prefers-reduced-motion: reduce)");
  const fine = matchMedia("(pointer: fine)");
  const picker = document.querySelector(".unit-picker");
  const preview = document.getElementById("unit-preview");
  const sdg = document.getElementById("preview-sdg");
  const title = document.getElementById("preview-title");
  const summary = document.getElementById("preview-summary");
  const buttons = [...picker.querySelectorAll("button")];
  const leaves = [...scene.querySelectorAll(".grow-layer")];
  let selected = 0;

  function selectLesson(index) {
    if (selected === index || !lessons[index]) return;
    selected = index;
    const lesson = lessons[index];
    buttons.forEach((button, i) => button.setAttribute("aria-pressed", String(i === index)));
    leaves.forEach((leaf, i) => leaf.classList.toggle("selected", i === index));
    sdg.textContent = "SDG " + lesson.sdg;
    title.textContent = lesson.title;
    summary.textContent = lesson.summary;
    preview.style.setProperty("--unit", buttons[index].style.getPropertyValue("--unit"));
    preview.classList.remove("is-changing");
    void preview.offsetWidth;
    preview.classList.add("is-changing");
  }

  picker.addEventListener("click", (event) => {
    const button = event.target.closest("button[data-lesson]");
    if (button) selectLesson(Number(button.dataset.lesson) - 1);
  });
  scene.addEventListener("click", (event) => {
    if (!event.target.closest(".blade")) return;
    const leaf = event.target.closest("[data-leaf]");
    if (leaf) selectLesson(Number(leaf.dataset.leaf) - 1);
  });

  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  const seeds = Array.from({ length: 32 }, (_, i) => ({
    x: (i * .618 + .125) % 1,
    y: (i * .413 + .07) % 1,
    size: i % 5 === 0 ? 2.8 : 1.25,
    speed: .009 + i % 4 * .006,
  }));
  const aim = { x: .73, y: .45 };
  const wind = { ...aim };
  let width = 0, height = 0, raf = 0, last = 0;
  let visible = true;

  function resize() {
    const rect = hero.getBoundingClientRect();
    width = rect.width;
    height = rect.height;
    const ratio = Math.min(devicePixelRatio || 1, 1.5);
    canvas.width = Math.round(width * ratio);
    canvas.height = Math.round(height * ratio);
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    update();
  }

  function paint(now) {
    wind.x += (aim.x - wind.x) * .12;
    wind.y += (aim.y - wind.y) * .12;
    const x = wind.x - .73, y = wind.y - .45;
    hero.style.setProperty("--glow-x", (wind.x * 100).toFixed(1) + "%");
    hero.style.setProperty("--glow-y", (wind.y * 100).toFixed(1) + "%");
    scene.style.setProperty("--scene-x", (54 + x * 69).toFixed(1) + "%");
    scene.style.setProperty("--scene-y", (32 + y * 52).toFixed(1) + "%");
    scene.style.setProperty("--plant-x", (x * 37).toFixed(1) + "px");
    scene.style.setProperty("--plant-y", (y * 19).toFixed(1) + "px");
    scene.style.setProperty("--plant-tilt", (x * 9).toFixed(1) + "deg");
    scene.style.setProperty("--ray-x", (x * 72).toFixed(1) + "px");

    ctx.clearRect(0, 0, width, height);
    const time = now / 1000;
    seeds.forEach((seed, i) => {
      const drift = Math.sin(time * .76 + i) * 19;
      const sx = seed.x * width + drift + x * (35 + i % 7 * 7);
      const phase = ((seed.y - time * seed.speed) % 1 + 1) % 1;
      const sy = phase * height + y * 41;
      const glow = (Math.sin(time * 1.4 + i * 2) + 1) / 2;
      ctx.globalAlpha = .15 + glow * .46;
      ctx.fillStyle = i % 5 === 0 ? "#e5ecaa" : "#a4cd7a";
      ctx.beginPath();
      ctx.ellipse(sx, sy, seed.size, seed.size * .56, time * .7 + i, 0, Math.PI * 2);
      ctx.fill();
    });
    ctx.globalAlpha = 1;
  }

  function frame(now) {
    raf = 0;
    if (!visible || document.hidden || motion.matches) return;
    if (now - last >= 15) {
      paint(now);
      last = now;
    }
    raf = requestAnimationFrame(frame);
  }

  function update() {
    if (motion.matches) {
      cancelAnimationFrame(raf);
      raf = 0;
      ctx.clearRect(0, 0, width, height);
      ["--glow-x", "--glow-y"].forEach((name) => hero.style.removeProperty(name));
      ["--scene-x", "--scene-y", "--plant-x", "--plant-y", "--plant-tilt", "--ray-x"].forEach((name) => scene.style.removeProperty(name));
      return;
    }
    if (visible && !document.hidden && !raf) raf = requestAnimationFrame(frame);
  }

  hero.addEventListener("pointermove", (event) => {
    if (!fine.matches || event.pointerType !== "mouse" || motion.matches) return;
    const box = hero.getBoundingClientRect();
    aim.x = (event.clientX - box.left) / box.width;
    aim.y = (event.clientY - box.top) / box.height;
  }, { passive: true });
  hero.addEventListener("pointerleave", () => Object.assign(aim, { x: .73, y: .45 }));
  if ("ResizeObserver" in window) new ResizeObserver(resize).observe(hero);
  else window.addEventListener("resize", resize);
  if ("IntersectionObserver" in window) new IntersectionObserver(([entry]) => {
    visible = entry.isIntersecting;
    update();
  }).observe(hero);
  motion.addEventListener("change", update);
  document.addEventListener("visibilitychange", update);
  resize();
})();
