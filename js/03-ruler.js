// ── Ruler (zoom-aware) ──
function drawRuler() {
  const c = rulerCanvas, dpr = devicePixelRatio || 1;
  const w = c.parentElement.clientWidth;
  c.width = w * dpr; c.height = 20 * dpr;
  c.style.width = w + 'px'; c.style.height = '20px';
  const ctx = c.getContext('2d');
  ctx.scale(dpr, dpr);
  ctx.fillStyle = '#111'; ctx.fillRect(0, 0, w, 20);

  const visDur = visibleDuration();
  const visStart = visibleStart();
  // Choose interval based on visible duration
  let interval;
  if (visDur > 300) interval = 30;
  else if (visDur > 120) interval = 15;
  else if (visDur > 60) interval = 10;
  else if (visDur > 30) interval = 5;
  else if (visDur > 10) interval = 2;
  else if (visDur > 4) interval = 1;
  else if (visDur > 2) interval = 0.5;
  else interval = 0.25;

  ctx.fillStyle = '#666'; ctx.font = '9px sans-serif'; ctx.strokeStyle = '#444';
  const firstTick = Math.floor(visStart / interval) * interval;
  for (let t = firstTick; t <= visStart + visDur; t += interval) {
    const x = ((t - visStart) / visDur) * w;
    if (x < -20 || x > w + 20) continue;
    ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, 12); ctx.stroke();
    const label = interval < 1 ? `${t.toFixed(1)}s` : fmtShort(t);
    ctx.fillText(label, x + 2, 18);
  }
}
