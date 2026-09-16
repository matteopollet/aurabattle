// Confetti canvas maison — zéro dépendance.
const PALETTE = ['#22d3ee', '#ff3d81', '#ffd166', '#b8f04a', '#ffffff', '#a78bfa'];

export function confetti(durationMs = 2800) {
  const canvas = document.createElement('canvas');
  canvas.style.cssText = 'position:fixed;inset:0;z-index:90;pointer-events:none';
  canvas.width = innerWidth;
  canvas.height = innerHeight;
  document.body.appendChild(canvas);
  const ctx = canvas.getContext('2d')!;

  interface P { x: number; y: number; vx: number; vy: number; r: number; rot: number; vr: number; c: string; shape: number }
  const parts: P[] = [];
  const spawn = (x: number, dir: number) => {
    for (let i = 0; i < 14; i++) {
      parts.push({
        x, y: innerHeight + 10,
        vx: dir * (2 + Math.random() * 7) + (Math.random() - 0.5) * 3,
        vy: -(9 + Math.random() * 9),
        r: 4 + Math.random() * 6,
        rot: Math.random() * Math.PI,
        vr: (Math.random() - 0.5) * 0.3,
        c: PALETTE[Math.floor(Math.random() * PALETTE.length)],
        shape: Math.random() < 0.3 ? 1 : 0,
      });
    }
  };

  const start = performance.now();
  let lastBurst = 0;
  const step = () => {
    const now = performance.now();
    const t = now - start;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    if (t < durationMs * 0.5 && now - lastBurst > 90) {
      lastBurst = now;
      spawn(0, 1);
      spawn(innerWidth, -1);
    }
    for (const p of parts) {
      p.vy += 0.28;
      p.vx *= 0.99;
      p.x += p.vx;
      p.y += p.vy;
      p.rot += p.vr;
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rot);
      ctx.fillStyle = p.c;
      ctx.globalAlpha = Math.max(0, 1 - Math.max(0, t - durationMs * 0.6) / (durationMs * 0.4));
      if (p.shape) { ctx.beginPath(); ctx.arc(0, 0, p.r * 0.6, 0, Math.PI * 2); ctx.fill(); }
      else ctx.fillRect(-p.r / 2, -p.r / 4, p.r, p.r / 2);
      ctx.restore();
    }
    if (t < durationMs && parts.length) requestAnimationFrame(step);
    else canvas.remove();
  };
  requestAnimationFrame(step);
}
