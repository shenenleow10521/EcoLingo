"use strict";

(() => {
  const hero = document.querySelector(".hero");
  const stage = document.querySelector(".atlas-stage");
  const canvas = document.getElementById("atlas-canvas");
  const detail = document.getElementById("atlas-detail");
  const nodes = [...document.querySelectorAll(".map-node")];
  const units = [
    { sdg: "17", title: "The 17 Goals", description: "Start with the global goals and why they matter.", x: -.65, z: .38 },
    { sdg: "4", title: "Learning for change", description: "Explore how education helps people build a more sustainable future.", x: -.45, z: -.63 },
    { sdg: "12", title: "Use less, waste less", description: "Find practical ways to cut waste and make better use of resources.", x: .17, z: .47 },
    { sdg: "13", title: "Act on campus", description: "Explore climate action you can take in everyday life.", x: .67, z: -.43 },
  ];
  let selected = 0;
  let selectedAt = 0;
  let pulseAt = 0;
  let pulseOrigin = null;

  nodes.forEach((node, index) => {
    node.addEventListener("click", () => {
      if (selected === index) return;
      selected = index;
      selectedAt = performance.now();
      nodes.forEach((item, i) => item.setAttribute("aria-pressed", String(i === index)));
      document.getElementById("atlas-number").textContent = units[index].sdg;
      document.getElementById("atlas-title").textContent = units[index].title;
      document.getElementById("atlas-description").textContent = units[index].description;
      detail.classList.remove("changed");
      requestAnimationFrame(() => detail.classList.add("changed"));
      updateScene();
    });
  });

  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  const motion = matchMedia("(prefers-reduced-motion: reduce)");
  const finePointer = matchMedia("(pointer: fine)");
  const steps = 33;
  const vertices = new Float32Array(steps * steps * 3);
  const screenX = new Float32Array(steps * steps);
  const screenY = new Float32Array(steps * steps);
  const target = { x: 0, y: 0, lightX: 72, lightY: 43 };
  const camera = { ...target };
  const cameraKeys = Object.keys(camera);
  const lastNodePositions = nodes.map(() => ({}));
  let width = 0, height = 0, scale = 0;
  let raf = 0, visible = true, lastFrame = 0;
  let yawCos, yawSin, pitchCos, pitchSin;
  let pointer = null;

  function elevation(x, z) {
    const ridge = .53 * Math.exp(-((x + .17) ** 2 * 6 + (z + .05) ** 2 * 4));
    const crest = .4 * Math.exp(-((x - .54) ** 2 * 15 + (z + .26) ** 2 * 10));
    const foothill = .24 * Math.exp(-((x + .52) ** 2 * 9 + (z - .58) ** 2 * 13));
    const texture = Math.sin(x * 10 + z * 3) * Math.cos(z * 7 - x * 4) * .041;
    const edge = Math.max(0, 1 - Math.max(Math.abs(x), Math.abs(z)) ** 6);
    return Math.max(0, (ridge + crest + foothill + texture) * edge);
  }

  for (let row = 0; row < steps; row++) {
    for (let col = 0; col < steps; col++) {
      const x = col / (steps - 1) * 2.14 - 1.07;
      const z = row / (steps - 1) * 2.14 - 1.07;
      const i = (row * steps + col) * 3;
      vertices[i] = x;
      vertices[i + 1] = z;
      vertices[i + 2] = elevation(x, z);
    }
  }

  function sizeScene() {
    const rect = stage.getBoundingClientRect();
    width = Math.max(1, rect.width);
    height = Math.max(1, rect.height);
    scale = Math.min(width * .337, height * .48);
    const dpr = Math.min(devicePixelRatio || 1, 2);
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    updateScene();
  }

  function setCamera() {
    const yaw = -.49 + camera.x * .45;
    const pitch = .95 + camera.y * .27;
    yawCos = Math.cos(yaw);
    yawSin = Math.sin(yaw);
    pitchCos = Math.cos(pitch);
    pitchSin = Math.sin(pitch);
  }

  function project(x, z, y) {
    const across = x * yawCos - z * yawSin;
    const depth = x * yawSin + z * yawCos;
    return [
      width * .50 + (across + camera.x * .14) * scale,
      height * .58 + (depth * pitchCos - y * pitchSin + camera.y * .075) * scale,
    ];
  }

  function paintTerrain(time) {
    const centerX = width * .51, centerY = height * .53;
    const glow = ctx.createRadialGradient(centerX, centerY, 0, centerX, centerY, width * .53);
    glow.addColorStop(0, "#69e8a027");
    glow.addColorStop(.60, "#24a87312");
    glow.addColorStop(1, "#24a87300");
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, width, height);

    const corner = [[-1.12, -1.12], [1.12, -1.12], [1.12, 1.12], [-1.12, 1.12]];
    ctx.beginPath();
    corner.forEach(([x, z], i) => {
      const [sx, sy] = project(x, z, -.075);
      if (i) ctx.lineTo(sx, sy); else ctx.moveTo(sx, sy);
    });
    ctx.closePath();
    ctx.fillStyle = "#0b251b85";
    ctx.fill();
    ctx.strokeStyle = "#80d79a53";
    ctx.setLineDash([4, 6]);
    ctx.stroke();
    ctx.setLineDash([]);

    for (let i = 0; i < screenX.length; i++) {
      const x = vertices[i * 3], z = vertices[i * 3 + 1];
      const y = vertices[i * 3 + 2] + Math.sin(time * 1.75 + z * 7 + x * 4) * .013;
      let [sx, sy] = project(x, z, y);
      if (pointer && !motion.matches) {
        const dx = sx - pointer.x, dy = sy - pointer.y;
        const force = Math.exp(-(dx * dx + dy * dy) / (scale * scale * .28));
        sx += dx * force * .18;
        sy += dy * force * .13 - force * 16;
      }
      screenX[i] = sx;
      screenY[i] = sy;
    }

    for (let i = 0; i < steps; i++) {
      const major = i % 4 === 0;
      ctx.lineWidth = major ? 1.03 : .65;
      ctx.strokeStyle = major ? "#9cedad84" : "#7deba34c";
      ctx.beginPath();
      for (let j = 0; j < steps; j++) {
        const n = i * steps + j;
        if (j) ctx.lineTo(screenX[n], screenY[n]); else ctx.moveTo(screenX[n], screenY[n]);
      }
      ctx.stroke();
      ctx.strokeStyle = major ? "#9cedad72" : "#7deba342";
      ctx.beginPath();
      for (let j = 0; j < steps; j++) {
        const n = j * steps + i;
        if (j) ctx.lineTo(screenX[n], screenY[n]); else ctx.moveTo(screenX[n], screenY[n]);
      }
      ctx.stroke();
    }
  }

  function paintRoute(time, locations) {
    ctx.beginPath();
    locations.forEach(([x, y], i) => {
      if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y);
    });
    ctx.lineWidth = 1.1;
    ctx.strokeStyle = "#c4f57e68";
    ctx.setLineDash([3, 6]);
    ctx.stroke();
    ctx.setLineDash([]);

    if (motion.matches) return;
    for (let i = 0; i < 8; i++) {
      const offset = (time * .65 + i * .39) % (locations.length - 1);
      const leg = Math.floor(offset), t = offset - leg;
      const [x1, y1] = locations[leg], [x2, y2] = locations[leg + 1];
      const x = x1 + (x2 - x1) * t, y = y1 + (y2 - y1) * t;
      ctx.beginPath();
      ctx.arc(x, y, 1.8, 0, Math.PI * 2);
      ctx.fillStyle = "#d8ffa5d9";
      ctx.fill();
    }
  }

  function paintPulse(x, y, progress, color) {
    if (progress < 0 || progress >= 1) return;
    ctx.beginPath();
    ctx.ellipse(x, y, 16 + 73 * progress, 12 + 35 * progress, 0, 0, Math.PI * 2);
    ctx.lineWidth = 1.1;
    ctx.globalAlpha = 1 - progress;
    ctx.strokeStyle = color;
    ctx.stroke();
    ctx.globalAlpha = 1;
  }

  function paintScene(now) {
    setCamera();
    ctx.clearRect(0, 0, width, height);
    const time = motion.matches ? 0 : now / 1000;
    paintTerrain(time);
    const locations = units.map((unit) => project(unit.x, unit.z, elevation(unit.x, unit.z) + .115));
    paintRoute(time, locations);

    if (!motion.matches) {
      for (let i = 0; i < 24; i++) {
        const x = width * ((i * .173 + .11 + Math.sin(time * .24 + i) * .013) % 1);
        const y = height * ((i * .291 + .06 - time * (.009 + i % 3 * .003)) % 1 + 1) % height;
        ctx.beginPath();
        ctx.arc(x, y, i % 5 === 0 ? 1.6 : .8, 0, Math.PI * 2);
        ctx.fillStyle = i % 5 === 0 ? "#ccfba88e" : "#8bd49d70";
        ctx.fill();
      }
      const [x, y] = locations[selected];
      paintPulse(x, y, (now - selectedAt) / 880, "#c4f57eba");
      if (pulseOrigin) paintPulse(pulseOrigin.x, pulseOrigin.y, (now - pulseAt) / 850, "#8be9a8ba");
    }
    locations.forEach(([x, y], i) => {
      const previous = lastNodePositions[i];
      const nodeX = x.toFixed(1), nodeY = y.toFixed(1);
      if (previous.x !== nodeX) nodes[i].style.setProperty("--node-x", nodeX + "px");
      if (previous.y !== nodeY) nodes[i].style.setProperty("--node-y", nodeY + "px");
      previous.x = nodeX;
      previous.y = nodeY;
    });
  }

  function frame(now) {
    raf = 0;
    if (!visible || document.hidden || motion.matches) return;
    if (now - lastFrame >= 15) {
      lastFrame = now;
      for (const key of cameraKeys) {
        const delta = target[key] - camera[key];
        camera[key] = Math.abs(delta) < .001 ? target[key] : camera[key] + delta * .105;
      }
      hero.style.setProperty("--spot-x", camera.lightX.toFixed(2) + "%");
      hero.style.setProperty("--spot-y", camera.lightY.toFixed(2) + "%");
      hero.style.setProperty("--grid-x", (camera.x * 23).toFixed(2) + "px");
      hero.style.setProperty("--grid-y", (camera.y * 18).toFixed(2) + "px");
      paintScene(now);
    }
    raf = requestAnimationFrame(frame);
  }

  function updateScene() {
    if (!width || !height) return;
    if (motion.matches) {
      if (raf) cancelAnimationFrame(raf);
      raf = 0;
      camera.x = camera.y = 0;
      pointer = null;
      for (const property of ["--spot-x", "--spot-y", "--grid-x", "--grid-y"]) hero.style.removeProperty(property);
      paintScene(0);
    } else if (!raf && visible && !document.hidden) {
      paintScene(performance.now());
      raf = requestAnimationFrame(frame);
    }
  }

  hero.addEventListener("pointermove", (event) => {
    if (!finePointer.matches || motion.matches || event.pointerType !== "mouse") return;
    const bounds = hero.getBoundingClientRect();
    const x = (event.clientX - bounds.left) / bounds.width, y = (event.clientY - bounds.top) / bounds.height;
    target.x = x * 2 - 1;
    target.y = y * 2 - 1;
    target.lightX = x * 100;
    target.lightY = y * 100;
    const atlasBounds = stage.getBoundingClientRect();
    pointer = { x: event.clientX - atlasBounds.left, y: event.clientY - atlasBounds.top };
  }, { passive: true });

  hero.addEventListener("pointerleave", () => {
    Object.assign(target, { x: 0, y: 0, lightX: 72, lightY: 43 });
    pointer = null;
  });

  stage.addEventListener("click", (event) => {
    if (motion.matches || event.target.closest("button")) return;
    const bounds = stage.getBoundingClientRect();
    pulseOrigin = { x: event.clientX - bounds.left, y: event.clientY - bounds.top };
    pulseAt = performance.now();
  });

  if ("ResizeObserver" in window) new ResizeObserver(sizeScene).observe(stage);
  else window.addEventListener("resize", sizeScene);
  if ("IntersectionObserver" in window) {
    new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting;
      updateScene();
    }, { rootMargin: "60px" }).observe(stage);
  }
  document.addEventListener("visibilitychange", updateScene);
  motion.addEventListener("change", updateScene);
  sizeScene();
})();
