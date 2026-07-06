(function () {
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const controllers = [];

  function resizeCanvas(canvas) {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const rect = canvas.getBoundingClientRect();
    const width = Math.max(1, Math.floor(rect.width * dpr));
    const height = Math.max(1, Math.floor(rect.height * dpr));

    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width;
      canvas.height = height;
    }

    const ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    return { ctx, width: rect.width, height: rect.height, dpr };
  }

  function createCanvasController(canvas, drawFrame) {
    if (!canvas || reduceMotion.matches) return () => {};

    let frame = 0;
    let raf = 0;
    let pointer = { x: 0.5, y: 0.5, active: false };

    const onPointerMove = (event) => {
      const rect = canvas.getBoundingClientRect();
      pointer = {
        x: (event.clientX - rect.left) / Math.max(rect.width, 1),
        y: (event.clientY - rect.top) / Math.max(rect.height, 1),
        active: true,
      };
    };

    const onPointerLeave = () => {
      pointer.active = false;
    };

    const tick = (time) => {
      if (!document.hidden) {
        const surface = resizeCanvas(canvas);
        drawFrame({ ...surface, time: time / 1000, frame, pointer });
        frame += 1;
      }
      raf = window.requestAnimationFrame(tick);
    };

    const onResize = () => resizeCanvas(canvas);

    canvas.addEventListener('pointermove', onPointerMove);
    canvas.addEventListener('pointerleave', onPointerLeave);
    window.addEventListener('resize', onResize, { passive: true });
    raf = window.requestAnimationFrame(tick);

    return () => {
      window.cancelAnimationFrame(raf);
      canvas.removeEventListener('pointermove', onPointerMove);
      canvas.removeEventListener('pointerleave', onPointerLeave);
      window.removeEventListener('resize', onResize);
    };
  }

  function drawGlow(ctx, x, y, radius, color) {
    const gradient = ctx.createRadialGradient(x, y, 0, x, y, radius);
    gradient.addColorStop(0, color);
    gradient.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.fill();
  }

  function createParticleField(canvas) {
    const particles = Array.from({ length: 72 }, (_, index) => ({
      seed: index * 19.17,
      speed: 0.16 + (index % 7) * 0.018,
      size: 1.5 + (index % 5) * 0.45,
      hue: index % 3,
    }));

    return createCanvasController(canvas, ({ ctx, width, height, time, pointer }) => {
      ctx.clearRect(0, 0, width, height);
      drawGlow(ctx, width * 0.28, height * 0.12, Math.min(width, height) * 0.52, 'rgba(34,211,238,0.08)');
      drawGlow(ctx, width * 0.78, height * 0.82, Math.min(width, height) * 0.45, 'rgba(139,92,246,0.08)');

      for (const p of particles) {
        const drift = time * p.speed + p.seed;
        const orbit = Math.sin(drift * 0.7) * 0.12;
        const cursorX = pointer.active ? (pointer.x - 0.5) * 44 : 0;
        const cursorY = pointer.active ? (pointer.y - 0.5) * 32 : 0;
        const x = ((Math.sin(drift) * 0.45 + 0.5 + orbit) % 1) * width + cursorX;
        const y = ((Math.cos(drift * 0.84) * 0.42 + 0.5) % 1) * height + cursorY;
        const colors = ['34,211,238', '59,130,246', '139,92,246'];

        ctx.fillStyle = `rgba(${colors[p.hue]},0.58)`;
        ctx.shadowColor = `rgba(${colors[p.hue]},0.65)`;
        ctx.shadowBlur = 14;
        ctx.beginPath();
        ctx.arc(x, y, p.size, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.shadowBlur = 0;
    });
  }

  function createNodeGrid(canvas) {
    return createCanvasController(canvas, ({ ctx, width, height, time, pointer }) => {
      ctx.clearRect(0, 0, width, height);
      ctx.strokeStyle = 'rgba(255,255,255,0.055)';
      ctx.lineWidth = 1;

      const cell = 60;
      for (let x = 0; x <= width; x += cell) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, height);
        ctx.stroke();
      }
      for (let y = 0; y <= height; y += cell) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(width, y);
        ctx.stroke();
      }

      const nodes = [
        [0.21, 0.3, '34,211,238'],
        [0.5, 0.2, '139,92,246'],
        [0.79, 0.4, '59,130,246'],
        [0.33, 0.7, '52,211,153'],
        [0.67, 0.6, '34,211,238'],
        [0.87, 0.8, '139,92,246'],
      ];

      for (const [nx, ny, color] of nodes) {
        const x = nx * width;
        const y = ny * height;
        const dx = pointer.active ? pointer.x * width - x : 9999;
        const dy = pointer.active ? pointer.y * height - y : 9999;
        const influence = Math.max(0, 1 - Math.hypot(dx, dy) / 240);
        const pulse = 0.55 + Math.sin(time * 2.2 + x * 0.01) * 0.18 + influence * 0.5;
        drawGlow(ctx, x, y, 36 + influence * 42, `rgba(${color},${0.08 + influence * 0.12})`);
        ctx.fillStyle = `rgba(${color},${pulse})`;
        ctx.beginPath();
        ctx.arc(x, y, 3 + influence * 3, 0, Math.PI * 2);
        ctx.fill();
      }
    });
  }

  function createHudRadar(canvas) {
    return createCanvasController(canvas, ({ ctx, width, height, time }) => {
      ctx.clearRect(0, 0, width, height);
      const cx = width / 2;
      const cy = height / 2;
      const radius = Math.min(width, height) * 0.38;

      ctx.strokeStyle = 'rgba(34,211,238,0.18)';
      ctx.lineWidth = 1;
      for (let r = radius / 3; r <= radius; r += radius / 3) {
        ctx.beginPath();
        ctx.arc(cx, cy, r, 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.beginPath();
      ctx.moveTo(cx - radius, cy);
      ctx.lineTo(cx + radius, cy);
      ctx.moveTo(cx, cy - radius);
      ctx.lineTo(cx, cy + radius);
      ctx.stroke();

      const angle = time * 1.6;
      const gradient = ctx.createConicGradient(angle, cx, cy);
      gradient.addColorStop(0, 'rgba(34,211,238,0)');
      gradient.addColorStop(0.08, 'rgba(34,211,238,0.28)');
      gradient.addColorStop(0.16, 'rgba(34,211,238,0)');
      gradient.addColorStop(1, 'rgba(34,211,238,0)');
      ctx.fillStyle = gradient;
      ctx.beginPath();
      ctx.arc(cx, cy, radius, 0, Math.PI * 2);
      ctx.fill();
    });
  }

  function createNebula(canvas) {
    return createCanvasController(canvas, ({ ctx, width, height, time, pointer }) => {
      ctx.clearRect(0, 0, width, height);
      const px = pointer.active ? (pointer.x - 0.5) * 60 : Math.sin(time * 0.5) * 18;
      const py = pointer.active ? (pointer.y - 0.5) * 40 : Math.cos(time * 0.4) * 18;
      drawGlow(ctx, width * 0.34 + px, height * 0.42 + py, Math.min(width, height) * 0.52, 'rgba(34,211,238,0.12)');
      drawGlow(ctx, width * 0.68 - px, height * 0.52 - py, Math.min(width, height) * 0.45, 'rgba(139,92,246,0.12)');
      drawGlow(ctx, width * 0.56, height * 0.72, Math.min(width, height) * 0.35, 'rgba(59,130,246,0.09)');
    });
  }

  function initHomeAnimations() {
    controllers.push(createParticleField(document.getElementById('hero-canvas')));
    controllers.push(createNodeGrid(document.getElementById('grid-canvas')));
    controllers.push(createHudRadar(document.getElementById('hud-canvas')));
    controllers.push(createNebula(document.getElementById('cta-canvas')));
  }

  document.addEventListener('DOMContentLoaded', initHomeAnimations);
  window.addEventListener('pagehide', () => {
    while (controllers.length) controllers.pop()();
  });
})();
