"use strict";

(() => {
  const questions = [
    { sdg: "17", unit: "The 17 Goals", color: "#84b8cf", question: "How many Sustainable Development Goals are there?", choices: ["12", "17"], answer: 1, note: "The UN adopted 17 goals in 2015." },
    { sdg: "4", unit: "Learning for change", color: "#ed917f", question: "What is SDG 4 about?", choices: ["Quality education", "Clean water"], answer: 0, note: "SDG 4 covers education and lifelong learning." },
    { sdg: "12", unit: "Use less, waste less", color: "#edc876", question: "Which of these is an example of reuse?", choices: ["Buy a new plastic bottle", "Refill your own bottle"], answer: 1, note: "Refilling keeps the same bottle in use." },
    { sdg: "13", unit: "Act on campus", color: "#b4d975", question: "Your class is 1 km away. Which choice has the lowest carbon footprint?", choices: ["Walk", "Drive alone"], answer: 0, note: "Walking produces almost no emissions on a short trip." },
  ];
  const hero = document.querySelector(".hero");
  const scene = document.getElementById("plant-scene");
  const canvas = document.getElementById("air");
  const motion = matchMedia("(prefers-reduced-motion: reduce)");
  const fine = matchMedia("(pointer: fine)");
  const label = document.getElementById("demo-unit");
  const question = document.getElementById("demo-question");
  const questionWrap = document.getElementById("demo-question-wrap");
  const options = document.getElementById("demo-options");
  const next = document.getElementById("demo-next");
  const feedback = document.getElementById("demo-feedback");
  const progress = document.getElementById("leaf-progress");
  const points = document.getElementById("demo-points");
  const score = points.parentElement;
  const particleHost = document.getElementById("leaf-particles");
  const leaves = [...scene.querySelectorAll(".grow-layer")];
  const outlines = [...scene.querySelectorAll(".leaf-outlines > use")];
  const progressLeaves = [...progress.children];
  const leafCenters = [[33,45], [68,30], [37,21], [66,14]];
  let index = 0;
  let solved = false;
  let countFrame = 0;

  function restartAnimation(element, className) {
    element.classList.remove(className);
    void element.offsetWidth;
    element.classList.add(className);
  }

  function renderQuestion() {
    const item = questions[index];
    const dot = document.createElement("span");
    const unit = document.createElement("b");
    unit.textContent = item.unit;
    label.replaceChildren(dot, "SDG " + item.sdg, unit);
    label.style.setProperty("--unit", item.color);
    question.textContent = item.question;
    options.replaceChildren(...item.choices.map((choice, i) => {
      const button = document.createElement("button");
      const key = document.createElement("span");
      button.type = "button";
      button.dataset.choice = String(i);
      key.textContent = "AB"[i];
      button.append(key, choice);
      return button;
    }));
    feedback.textContent = "Answer correctly to grow a new leaf.";
    delete feedback.dataset.state;
    next.hidden = true;
    solved = false;
    restartAnimation(questionWrap, "question-in");
  }

  function countPoints(end) {
    cancelAnimationFrame(countFrame);
    const start = Number(points.textContent);
    if (motion.matches) { points.textContent = String(end); return; }
    const began = performance.now();
    function step(now) {
      const fraction = Math.min(1, (now - began) / 440);
      points.textContent = String(Math.round(start + (end - start) * (1 - (1 - fraction) ** 3)));
      if (fraction < 1) countFrame = requestAnimationFrame(step);
    }
    countFrame = requestAnimationFrame(step);
  }

  function releaseSpores(leafIndex) {
    if (motion.matches) return;
    const particles = document.createDocumentFragment();
    const [x, y] = leafCenters[leafIndex];
    for (let i = 0; i < 19; i++) {
      const leaf = document.createElement("i");
      const direction = i / 19 * Math.PI * 2;
      const distance = 22 + Math.random() * 110;
      leaf.style.setProperty("--origin-x", x + "%");
      leaf.style.setProperty("--origin-y", y + "%");
      leaf.style.setProperty("--dx", Math.cos(direction) * distance + "px");
      leaf.style.setProperty("--dy", Math.sin(direction) * distance - 22 + "px");
      leaf.style.setProperty("--spin", Math.round(direction * 120) + "deg");
      leaf.style.setProperty("--size", (3 + Math.random() * 6).toFixed(1) + "px");
      leaf.style.setProperty("--wait", (Math.random() * .26).toFixed(2) + "s");
      particles.append(leaf);
    }
    particleHost.replaceChildren(particles);
  }

  options.addEventListener("click", (event) => {
    const button = event.target.closest("button[data-choice]");
    if (!button || solved) return;
    const item = questions[index];
    options.querySelectorAll(".is-wrong").forEach((choice) => choice.classList.remove("is-wrong"));
    if (Number(button.dataset.choice) !== item.answer) {
      restartAnimation(button, "is-wrong");
      feedback.dataset.state = "wrong";
      feedback.textContent = "Try the other answer.";
      return;
    }

    solved = true;
    const final = index === questions.length - 1;
    if (final) scene.classList.add("complete");
    button.classList.add("is-correct");
    options.querySelectorAll("button").forEach((choice) => { choice.disabled = true; });
    leaves[index].classList.add("grown");
    outlines[index].classList.add("grown");
    progressLeaves[index].classList.add("grown");
    progressLeaves[index].style.setProperty("--earned", item.color);
    progress.setAttribute("aria-label", (index + 1) + " of 4 demo leaves grown");
    scene.style.setProperty("--leaf-tone", item.color);
    countPoints((index + 1) * 10);
    releaseSpores(index);
    restartAnimation(scene, "burst");
    restartAnimation(score, "earned");
    feedback.dataset.state = "correct";
    feedback.textContent = final ? "All 4 leaves grown! " + item.note : item.note + " +10 points";
    next.firstChild.textContent = final ? "Play again " : "Next ";
    next.hidden = false;
    next.focus({ preventScroll: true });
  });

  next.addEventListener("click", () => {
    if (!solved) return;
    index++;
    if (index === questions.length) {
      index = 0;
      cancelAnimationFrame(countFrame);
      points.textContent = "0";
      [...leaves, ...outlines, ...progressLeaves].forEach((leaf) => leaf.classList.remove("grown"));
      progress.setAttribute("aria-label", "0 of 4 demo leaves grown");
      particleHost.replaceChildren();
      scene.classList.remove("burst", "complete");
    }
    renderQuestion();
    question.focus({ preventScroll: true });
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
    scene.style.setProperty("--plant-x", (x * 58).toFixed(1) + "px");
    scene.style.setProperty("--plant-y", (y * 19).toFixed(1) + "px");
    scene.style.setProperty("--plant-tilt", (x * 15).toFixed(1) + "deg");
    scene.style.setProperty("--ray-x", (x * 100).toFixed(1) + "px");

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
