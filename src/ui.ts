import { MOVES, type MoveCat } from './moves';
import { sfx } from './sfx';

export function h<K extends keyof HTMLElementTagNameMap>(tag: K, html?: string): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  if (html !== undefined) el.innerHTML = html;
  return el;
}

export function toast(msg: string, err = false) {
  document.querySelectorAll('.toast').forEach((t) => t.remove());
  const t = h('div', msg);
  t.className = `toast${err ? ' err' : ''}`;
  document.body.appendChild(t);
  setTimeout(() => t.remove(), 3800);
}

export function countdown(): Promise<void> {
  return new Promise((resolve) => {
    const wrap = h('div');
    wrap.className = 'countdown';
    document.body.appendChild(wrap);
    const seq = ['3', '2', '1', 'GO'];
    let i = 0;
    const next = () => {
      if (i >= seq.length) { wrap.remove(); resolve(); return; }
      const isGo = i === seq.length - 1;
      wrap.innerHTML = '';
      const s = h('span', seq[i]);
      if (isGo) s.className = 'go';
      wrap.appendChild(s);
      sfx.count(isGo);
      i++;
      setTimeout(next, isGo ? 600 : 850);
    };
    next();
  });
}

/** Points qui flottent au-dessus de la zone du joueur. */
export function floatPts(container: HTMLElement, text: string, p: 'p1' | 'p2', big = false) {
  const el = h('div', text);
  el.className = 'float-pts';
  el.style.color = p === 'p1' ? 'var(--p1)' : 'var(--p2)';
  el.style.fontSize = big ? '2.4rem' : '1.5rem';
  el.style.left = `${(p === 'p1' ? 22 : 78) + (Math.random() * 16 - 8)}%`;
  el.style.top = `${38 + Math.random() * 14}%`;
  container.appendChild(el);
  setTimeout(() => el.remove(), 1200);
}

export function movesModal(onClose: () => void): HTMLElement {
  const back = h('div');
  back.className = 'modal-back';
  const cats: { id: MoveCat; title: string }[] = [
    { id: 'special', title: 'Signature' },
    { id: 'hands', title: 'Mains' },
    { id: 'pose', title: 'Poses' },
    { id: 'face', title: 'Visage' },
  ];
  const modal = h('div');
  modal.className = 'moves-modal';
  let inner = `<h2>LA GRILLE DES MOVES</h2>
    <p class="hint">Le juge regarde ta caméra et score chaque move. Varie : répéter le même move fatigue l'aura (points réduits). Enchaîne des moves différents en 4s pour des combos. Certains enchaînements secrets valent des bonus…</p>`;
  for (const c of cats) {
    inner += `<div class="moves-cat"><h3>${c.title}</h3><div class="moves-grid">`;
    for (const m of MOVES.filter((mm) => mm.cat === c.id)) {
      inner += `<div class="move-card"><div class="g">${m.glyph}</div><div><div class="n">${m.label} <span class="p">+${m.pts}</span></div><div class="d">${m.desc}</div></div></div>`;
    }
    inner += '</div></div>';
  }
  inner += `<div style="text-align:center"><button class="btn primary modal-close">COMPRIS, CHEF</button></div>`;
  modal.innerHTML = inner;
  back.appendChild(modal);
  back.addEventListener('click', (e) => { if (e.target === back) { back.remove(); onClose(); } });
  modal.querySelector('.modal-close')!.addEventListener('click', () => { back.remove(); onClose(); });
  return back;
}
