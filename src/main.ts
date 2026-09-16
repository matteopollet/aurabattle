import './style.css';
import { VisionEngine } from './vision';
import { Battle, type BattleResult, type FeedMsg, type Mode } from './game';
import { Judge } from './judge';
import { Bot } from './bot';
import { OnlineRoom, type NetMsg } from './online';
import { confetti } from './confetti';
import { countdown, floatPts, h, movesModal, toast } from './ui';
import { MOVES, MOVE_BY_ID, type PlayerId } from './moves';
import { sfx } from './sfx';

const app = document.getElementById('app')!;
const vision = new VisionEngine();
const judge = new Judge();
const params = new URLSearchParams(location.search);
const DEBUG = params.has('debug');
const NOVISION = params.has('novision');

let stream: MediaStream | null = null;
let battle: Battle | null = null;
let bot: Bot | null = null;
let room: OnlineRoom | null = null;
let myName = localStorage.getItem('aura-name') ?? '';
let mode: Mode = 'solo';
let iWantRematch = false;
let peerWantsRematch = false;
let wakeLock: { release(): Promise<void> } | null = null;

// charge les modèles en arrière-plan dès le menu
const visionReady = NOVISION ? Promise.resolve(false) : vision.load().then(() => true).catch(() => false);

// ============================== MENU ==============================
function renderMenu() {
  cleanupBattle();
  app.innerHTML = '';
  const s = h('div');
  s.className = 'screen';
  s.id = 'screen-menu';
  s.innerHTML = `
    <div class="logo-wrap">
      <div class="logo">AURA<small>B A T T L E</small></div>
    </div>
    <p class="tagline">30 secondes. Une caméra. <b>Le juge regarde tout.</b>
      Moves, combos, provocations — chaque geste vaut de l'aura.
      Le fameux <span class="six">six-sept</span> vaut +20.</p>
    <input id="name-input" class="code-input" maxlength="14" placeholder="TON BLAZE"
      value="${myName.replace(/"/g, '&quot;')}" style="font-size:1rem;letter-spacing:0.15em;width:min(400px,92vw)" />
    <div class="menu-grid">
      <button class="btn p1" id="btn-solo"><span>⚔ SOLO</span><span class="sub">vs PHANTØM</span></button>
      <button class="btn p2" id="btn-local"><span>👥 DUEL LOCAL</span><span class="sub">2 joueurs, 1 caméra</span></button>
      <button class="btn" id="btn-online"><span>🌐 DUEL EN LIGNE</span><span class="sub">code de room</span></button>
      <button class="btn ghost" id="btn-moves"><span>📜 GRILLE DES MOVES</span></button>
    </div>
    <div class="menu-footer">
      <span class="cam-status" id="cam-status"><span class="cam-dot"></span><span id="cam-status-txt">caméra : en attente</span></span>
      <span class="tag" id="ai-status">l'IA se charge…</span>
      <button class="btn ghost sm" id="btn-sound">🔊 juge vocal</button>
    </div>
    <div class="marquee"><div class="marquee-track">${marqueeContent()}</div></div>`;
  app.appendChild(s);

  const nameInput = s.querySelector<HTMLInputElement>('#name-input')!;
  nameInput.addEventListener('input', () => {
    myName = nameInput.value.toUpperCase();
    localStorage.setItem('aura-name', myName);
  });

  const aiTag = s.querySelector('#ai-status')! as HTMLElement;
  visionReady.then((ok) => {
    aiTag.textContent = ok ? 'IA prête' : 'IA hors-ligne (mode démo dispo)';
    aiTag.style.color = ok ? 'var(--lime)' : 'var(--bad)';
  });

  const sndBtn = s.querySelector<HTMLButtonElement>('#btn-sound')!;
  const paintSnd = () => (sndBtn.textContent = judge.enabled ? '🔊 juge vocal' : '🔇 juge muet');
  paintSnd();
  sndBtn.onclick = () => { judge.enabled = !judge.enabled; paintSnd(); if (!judge.enabled) speechSynthesis?.cancel(); };

  s.querySelector('#btn-moves')!.addEventListener('click', () => document.body.appendChild(movesModal(() => {})));
  s.querySelector('#btn-solo')!.addEventListener('click', () => startGame('solo'));
  s.querySelector('#btn-local')!.addEventListener('click', () => startGame('local'));
  s.querySelector('#btn-online')!.addEventListener('click', () => renderLobby());
  if (stream) updateCamStatus(true); else updateCamStatus();
}

function marqueeContent(): string {
  const items = MOVES.map((m) => `<span>${m.glyph} ${m.label} <b>+${m.pts}</b></span>`).join('');
  return items + items;
}

function updateCamStatus(ok?: boolean) {
  const el = document.querySelector('#cam-status');
  const txt = document.querySelector('#cam-status-txt');
  if (!el || !txt) return;
  if (ok === true) { el.className = 'cam-status ok'; txt.textContent = 'caméra : prête'; }
  else if (ok === false) { el.className = 'cam-status err'; txt.textContent = 'caméra : refusée — mode démo possible'; }
}

async function ensureCamera(): Promise<boolean> {
  if (stream) return true;
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: 'user', width: { ideal: 960 }, height: { ideal: 540 } },
      audio: false,
    });
    updateCamStatus(true);
    return true;
  } catch {
    updateCamStatus(false);
    toast('Caméra refusée. Active-la ou joue en mode démo.', true);
    return false;
  }
}

// ============================== LOBBY ONLINE ==============================
function renderLobby() {
  app.innerHTML = '';
  const s = h('div');
  s.className = 'screen';
  s.id = 'screen-lobby';
  s.innerHTML = `
    <div class="lobby-card">
      <h2>DUEL EN LIGNE</h2>
      <div class="lobby-row" style="margin-bottom:14px">
        <button class="btn primary" id="btn-create">CRÉER UNE ROOM</button>
      </div>
      <div class="lobby-row">
        <input id="join-input" class="code-input" maxlength="4" placeholder="CODE" />
      </div>
      <div class="lobby-row" style="margin-top:10px">
        <button class="btn" id="btn-join">REJOINDRE</button>
      </div>
      <div class="lobby-status" id="lobby-status"></div>
    </div>
    <div class="lobby-card" id="host-card" style="display:none">
      <h2>CODE DE LA ROOM</h2>
      <div class="room-code" id="room-code">----</div>
      <div class="lobby-row">
        <button class="btn sm" id="btn-copy">COPIER LE LIEN</button>
        <button class="btn primary sm" id="btn-launch" disabled>LANCER ⚔</button>
      </div>
      <div class="lobby-status" id="host-status">En attente d'un challenger…</div>
    </div>
    <button class="btn ghost sm" id="btn-back">← retour</button>`;
  app.appendChild(s);
  s.querySelector('#btn-back')!.addEventListener('click', () => { room?.destroy(); room = null; pendingRemoteStream = null; renderMenu(); });

  s.querySelector('#btn-launch')!.addEventListener('click', () => {
    mode = 'online';
    room?.send({ t: 'start', at: Date.now() });
    void launchBattle();
  });

  s.querySelector('#btn-create')!.addEventListener('click', async () => {
    const status = s.querySelector('#lobby-status')!;
    status.textContent = 'Caméra + connexion…';
    if (!(await ensureCamera()) && !DEBUG) return;
    await visionReady;
    room = new OnlineRoom();
    wireRoom();
    try {
      const code = await room.host(stream ?? new MediaStream());
      (s.querySelector('#host-card') as HTMLElement).style.display = 'block';
      s.querySelector('#room-code')!.textContent = code;
      s.querySelector('#btn-copy')!.addEventListener('click', () => {
        void navigator.clipboard?.writeText(`${location.origin}${location.pathname}#${code}`);
        toast('Lien copié — envoie-le à ton adversaire');
      });
    } catch {
      status.textContent = 'Impossible de créer la room (réseau ?).';
    }
  });

  s.querySelector('#btn-join')!.addEventListener('click', async () => {
    const code = (s.querySelector<HTMLInputElement>('#join-input')!).value.trim().toUpperCase();
    const status = s.querySelector('#lobby-status')!;
    if (code.length !== 4) { status.textContent = 'Code à 4 caractères requis.'; return; }
    status.textContent = 'Caméra + connexion…';
    if (!(await ensureCamera()) && !DEBUG) return;
    await visionReady;
    room = new OnlineRoom();
    wireRoom();
    try {
      await room.join(code, stream ?? new MediaStream());
      status.textContent = 'Connecté ! En attente du lancement…';
      status.classList.add('live');
    } catch {
      status.textContent = 'Room introuvable. Vérifie le code.';
      room.destroy(); room = null;
    }
  });

  // join via #CODE dans l'URL
  const hash = location.hash.replace('#', '').toUpperCase();
  if (/^[A-Z0-9]{4}$/.test(hash)) {
    (s.querySelector<HTMLInputElement>('#join-input')!).value = hash;
    (s.querySelector('#btn-join') as HTMLButtonElement).click();
  }
}

function wireRoom() {
  if (!room) return;
  room.onstatus = (st) => {
    if (st === 'connected') {
      room!.send({ t: 'name', v: myName || 'ANON' });
      const hs = document.querySelector('#host-status');
      if (hs) { hs.textContent = 'Adversaire connecté !'; hs.classList.add('live'); }
      (document.querySelector('#btn-launch') as HTMLButtonElement | null)?.removeAttribute('disabled');
      const ls = document.querySelector('#lobby-status');
      if (ls) { ls.textContent = 'Connecté !'; ls.classList.add('live'); }
    }
  };
  room.onstream = (remote) => {
    const rv = document.querySelector<HTMLVideoElement>('#remote-video');
    if (rv) rv.srcObject = remote;
    pendingRemoteStream = remote;
  };
  room.onmsg = onNetMsg;
  (window as unknown as { __room: OnlineRoom }).__room = room;
  room.onpeerclose = () => {
    toast('Adversaire déconnecté — victoire par forfait.');
    if (battle?.live) { battle.scores.p1 += 25; battle.finish(); }
  };
}

let pendingRemoteStream: MediaStream | null = null;
let remoteName = 'RIVAL';

function onNetMsg(m: NetMsg) {
  switch (m.t) {
    case 'name':
      remoteName = m.v || 'RIVAL';
      updateNameTag();
      break;
    case 'start':
      mode = 'online';
      iWantRematch = peerWantsRematch = false;
      void launchBattle();
      break;
    case 'mv':
      battle?.ingestRemoteMove(m.id, m.total);
      break;
    case 'score':
      battle?.ingestRemoteScore(m.v);
      break;
    case 'end':
      onRemoteEnd(m.host, m.guest);
      break;
    case 'rematch':
      peerWantsRematch = true;
      if (iWantRematch) {
        if (room?.isHost) room.send({ t: 'start', at: Date.now() });
        void launchBattle();
      } else {
        toast(`${remoteName} veut la revanche !`);
        document.querySelector('#btn-rematch')?.classList.add('primary');
      }
      break;
    case 'bye':
      room?.destroy(); room = null;
      break;
  }
}

function updateNameTag() {
  const el = document.querySelector('.fighter.p2 .f-name span');
  if (el) el.textContent = remoteName;
}

// ============================== BATTLE ==============================
interface Refs {
  timer: HTMLElement; feed: HTMLElement; judgeSay: HTMLElement; judgeOrb: HTMLElement;
  score: Record<PlayerId, HTMLElement>; fill: Record<PlayerId, HTMLElement>;
  arena: HTMLElement; chipsWrap: HTMLElement;
}

async function startGame(m: Mode) {
  mode = m;
  sfx.unlock();
  if (!(await ensureCamera()) && !DEBUG) {
    // caméra refusée → proposer le mode démo
    if (!confirm('Sans caméra, le juge ne voit rien. Lancer le mode démo (clics pour simuler les moves) ?')) return;
  }
  const ok = await visionReady;
  if (!ok && !DEBUG) toast('Modèles IA non chargés — mode démo.', true);
  void launchBattle();
}

let launching = false;
async function launchBattle() {
  if (launching || battle?.live) return;
  launching = true;
  iWantRematch = false;
  peerWantsRematch = false;
  renderBattleScreen();
  await countdown();
  launching = false;
  if (!document.getElementById('timer')) return; // quitté pendant le countdown
  startBattleEngine();
}

function renderBattleScreen() {
  cleanupBattle(false);
  const names = currentNames();
  app.innerHTML = '';
  const s = h('div');
  s.className = 'screen';
  s.id = 'screen-battle';

  const arenaInner =
    mode === 'local'
      ? `<div class="cam-panel" id="panel-main">
          <video id="cam" class="mirror" autoplay playsinline muted></video>
          <canvas class="overlay" id="overlay"></canvas>
          <div class="zone-split"></div>
          <div class="zone-label z1">◀ ${names.p1}</div>
          <div class="zone-label z2">${names.p2} ▶</div>
          <div class="move-chips" id="chips"></div>
        </div>`
      : mode === 'solo'
      ? `<div class="cam-panel" id="panel-main">
          <video id="cam" class="mirror" autoplay playsinline muted></video>
          <canvas class="overlay" id="overlay"></canvas>
          <div class="move-chips" id="chips"></div>
        </div>
        <div class="orb-panel" id="panel-bot"><div class="orb"></div><div class="orb-tag">${names.p2}</div>
          <div class="move-chips" id="chips-p2"></div></div>`
      : `<div class="cam-panel" id="panel-main">
          <video id="cam" class="mirror" autoplay playsinline muted></video>
          <canvas class="overlay" id="overlay"></canvas>
          <div class="move-chips" id="chips"></div>
        </div>
        <div class="cam-panel" id="panel-remote">
          <video id="remote-video" autoplay playsinline muted></video>
          <div class="zone-label z2">${remoteName}</div>
          <div class="move-chips" id="chips-p2"></div>
        </div>`;

  s.innerHTML = `
    <div class="hud">
      <div class="fighter p1">
        <div class="f-name"><div class="avatar p1"></div><span>${names.p1}</span></div>
        <div class="f-score" id="score-p1">0</div>
        <div class="aura-bar"><div class="aura-fill" id="fill-p1"></div></div>
      </div>
      <div class="timer-wrap"><div class="timer" id="timer">30</div><div class="timer-label">secondes</div></div>
      <div class="fighter p2">
        <div class="f-name"><span>${names.p2}</span><div class="avatar p2"></div></div>
        <div class="f-score" id="score-p2">0</div>
        <div class="aura-bar"><div class="aura-fill" id="fill-p2"></div></div>
      </div>
    </div>
    <div class="arena" id="arena">${arenaInner}</div>
    <div class="judge-bar">
      <div class="judge-orb" id="judge-orb"></div>
      <span class="judge-name">LE&nbsp;JUGE</span>
      <span class="judge-say" id="judge-say">Que le battle commence.</span>
      <button class="btn ghost sm" id="btn-quit" style="margin-left:auto;flex:none">✕</button>
    </div>
    <div class="feed" id="feed"></div>`;
  app.appendChild(s);
  s.querySelector('#btn-quit')!.addEventListener('click', () => {
    room?.send({ t: 'bye' });
    renderMenu();
  });

  const video = s.querySelector<HTMLVideoElement>('#cam')!;
  if (stream) video.srcObject = stream;
  else {
    const panel = s.querySelector('#panel-main')!;
    panel.appendChild(h('div', '<div>📷</div><div>caméra indisponible<br>mode démo : utilise les boutons</div>')).className = 'cam-off';
  }
  const overlay = s.querySelector<HTMLCanvasElement>('#overlay')!;
  if (vision.loaded && stream) {
    vision.attach(video, overlay, mode === 'local' ? 'split' : 'single');
  }
  if (pendingRemoteStream) {
    const rv = s.querySelector<HTMLVideoElement>('#remote-video');
    if (rv) rv.srcObject = pendingRemoteStream;
  }
}

function currentNames(): Record<PlayerId, string> {
  const me = myName || 'JOUEUR 1';
  if (mode === 'solo') return { p1: me, p2: 'PHANTØM' };
  if (mode === 'local') return { p1: me, p2: 'JOUEUR 2' };
  return { p1: me, p2: remoteName };
}

function startBattleEngine() {
  const refs: Refs = {
    timer: document.getElementById('timer')!,
    feed: document.getElementById('feed')!,
    judgeSay: document.getElementById('judge-say')!,
    judgeOrb: document.getElementById('judge-orb')!,
    score: { p1: document.getElementById('score-p1')!, p2: document.getElementById('score-p2')! },
    fill: { p1: document.getElementById('fill-p1')!, p2: document.getElementById('fill-p2')! },
    arena: document.getElementById('arena')!,
    chipsWrap: document.getElementById('chips')!,
  };

  judge.onSay = (html) => { refs.judgeSay.innerHTML = html; };
  judge.onTalking = (t) => refs.judgeOrb.classList.toggle('talking', t);

  let lastSec = 31;
  let barScale = 50;

  battle = new Battle(mode, currentNames(), {
    score(p, total, delta) {
      barScale = Math.max(barScale, total);
      refs.score[p].textContent = String(Math.round(total));
      refs.score[p].classList.remove('bump');
      void refs.score[p].offsetWidth;
      refs.score[p].classList.add('bump');
      refs.fill[p].style.width = `${Math.min(100, (total / barScale) * 100)}%`;
      refs.fill[OTHER_OF[p]].style.width = `${Math.min(100, (battle!.scores[OTHER_OF[p]] / barScale) * 100)}%`;
      if (delta >= 3) floatPts(refs.arena, `+${Math.round(delta)}`, p, delta >= 15);
    },
    feed(m) { addFeed(refs, m); },
    chip(p, def) { showChip(refs, p, def.label); },
    banner(text, danger) { showBanner(refs, text, danger); },
    tick(ms) {
      const sec = Math.ceil(ms / 1000);
      refs.timer.textContent = String(sec);
      refs.timer.classList.toggle('low', sec <= 5);
      if (sec !== lastSec) { lastSec = sec; if (sec <= 3 && sec > 0) sfx.count(); }
      if (mode === 'solo') {
        document.querySelector('.orb-panel')?.classList.toggle('rage', battle!.scores.p2 - battle!.scores.p1 > 12);
      }
    },
    end(result) { onBattleEnd(result); },
    remoteMove: mode === 'online' ? (id, total) => room?.send({ t: 'mv', id, total }) : undefined,
    remoteScore: mode === 'online' ? (v) => room?.send({ t: 'score', v }) : undefined,
  }, judge);

  if (vision.loaded && stream) {
    vision.start((f) => battle!.ingestFrame(f));
  }
  if (mode === 'solo') {
    bot = new Bot((id) => battle!.applyMove('p2', id), () => ({ me: battle!.scores.p1, bot: battle!.scores.p2 }));
    bot.start();
  }
  battle.start();
  (window as unknown as { __battle: Battle }).__battle = battle;
  buildDebugPanel();
  try { void (navigator as unknown as { wakeLock?: { request(t: string): Promise<{ release(): Promise<void> }> } }).wakeLock?.request('screen').then((w) => (wakeLock = w)); } catch { /* noop */ }
}

const OTHER_OF: Record<PlayerId, PlayerId> = { p1: 'p2', p2: 'p1' };

function addFeed(refs: Refs, m: FeedMsg) {
  const line = h('div');
  line.className = `feed-line ${m.kind}`;
  const who = m.who ? `<span class="who ${m.who}">${battle?.names[m.who] ?? m.who}</span>` : '';
  const pts = m.pts !== undefined ? `<span class="pts${m.pts < 0 ? ' neg' : ''}">${m.pts > 0 ? '+' : ''}${Math.round(m.pts)}</span>` : '';
  line.innerHTML = `${who}<span class="what">${m.text}</span>${pts}`;
  refs.feed.prepend(line);
  while (refs.feed.children.length > 6) refs.feed.lastElementChild?.remove();
}

function showChip(refs: Refs, p: PlayerId, label: string) {
  const wrap = (p === 'p2' ? document.getElementById('chips-p2') : null) ?? refs.chipsWrap;
  const c = h('div', label);
  c.className = `chip ${p}`;
  wrap.appendChild(c);
  setTimeout(() => c.classList.add('out'), 1400);
  setTimeout(() => c.remove(), 1700);
  while (wrap.children.length > 3) wrap.firstElementChild?.remove();
}

function showBanner(refs: Refs, text: string, danger = false) {
  refs.arena.querySelectorAll('.event-banner').forEach((b) => b.remove());
  const b = h('div', text);
  b.className = `event-banner${danger ? ' danger' : ''}`;
  refs.arena.appendChild(b);
  setTimeout(() => b.classList.add('out'), 2400);
  setTimeout(() => b.remove(), 2800);
}

// ============================== END / RESULTS ==============================
function onBattleEnd(result: BattleResult) {
  vision.stop();
  bot?.stop(); bot = null;
  void wakeLock?.release(); wakeLock = null;

  if (mode === 'online' && room) {
    if (room.isHost) {
      // l'hôte envoie les scores absolus (host = son p1)
      room.send({ t: 'end', host: Math.round(battle!.scores.p1), guest: Math.round(battle!.scores.p2) });
      showResults(result);
    } else {
      // le guest attend le verdict de l'hôte (2.5s max → fallback local)
      judge.say('Le jury délibère…');
      remoteVerdictTimer = window.setTimeout(() => showResults(result), 2500);
      pendingLocalResult = result;
    }
  } else {
    showResults(result);
  }
}

let remoteVerdictTimer = 0;
let pendingLocalResult: BattleResult | null = null;

function onRemoteEnd(host: number, guest: number) {
  if (!battle) return;
  if (battle.live) battle.finish(); // propage le verdict de l'hôte
  clearTimeout(remoteVerdictTimer);
  // mapping : hôte → p1 côté hôte ; guest → p2 côté hôte. Chez le guest, p1 = lui-même.
  const meIsHost = room?.isHost ?? true;
  const my = meIsHost ? host : guest;
  const opp = meIsHost ? guest : host;
  const result: BattleResult = {
    winner: my === opp ? 'draw' : my > opp ? 'p1' : 'p2',
    scores: { p1: my, p2: opp },
    margin: Math.abs(my - opp),
    stats: pendingLocalResult?.stats ?? { p1: { moves: 0, bestCombo: 0, signature: null }, p2: { moves: 0, bestCombo: 0, signature: null } },
  };
  showResults(result);
}

function showResults(result: BattleResult) {
  pendingLocalResult = null;
  document.querySelector('.debug-panel')?.remove();
  const names = battle?.names ?? currentNames();
  const { winner, margin } = result;
  const iWon = winner === 'p1';
  if (winner !== 'draw') sfx.win(); else sfx.buzz();
  if (iWon || (mode === 'local' && winner !== 'draw')) confetti();

  const verdict = winner === 'draw'
    ? 'Égalité parfaite. Le jury est scié.'
    : margin < 10
      ? 'Photo finish. <em>Un cheveu d\'aura</em> a fait la différence.'
      : margin < 30
        ? 'Victoire nette, sans discussion.'
        : 'Démonstration. L\'écart d\'aura est <em>abyssal</em>.';

  const sig = (p: PlayerId) => {
    const id = result.stats[p].signature;
    return id ? `${MOVE_BY_ID.get(id)!.glyph} ${MOVE_BY_ID.get(id)!.label}` : '—';
  };
  const wName = winner === 'draw' ? 'ÉGALITÉ' : names[winner].toUpperCase();

  app.innerHTML = '';
  const s = h('div');
  s.className = 'screen';
  s.id = 'screen-results';
  s.innerHTML = `
    <div class="winner-tag">${winner === 'draw' ? 'le juge ne tranche pas' : 'vainqueur du battle'}</div>
    <div class="winner-name ${winner === 'draw' ? 'draw' : winner}">${wName}</div>
    <div class="score-line"><span class="s1">${result.scores.p1}</span><span class="sep">—</span><span class="s2">${result.scores.p2}</span></div>
    <p class="verdict">${verdict}</p>
    <div class="stats-grid">
      <div class="stat-card"><div class="v">${result.stats.p1.moves} / ${result.stats.p2.moves}</div><div class="k">moves joués</div></div>
      <div class="stat-card"><div class="v">×${result.stats.p1.bestCombo} / ×${result.stats.p2.bestCombo}</div><div class="k">meilleur combo</div></div>
      <div class="stat-card"><div class="v" style="font-size:0.8rem">${sig('p1')}</div><div class="k">signature ${names.p1}</div></div>
      <div class="stat-card"><div class="v" style="font-size:0.8rem">${sig('p2')}</div><div class="k">signature ${names.p2}</div></div>
    </div>
    <div class="results-actions">
      <button class="btn primary" id="btn-rematch">⚔ REVANCHE</button>
      <button class="btn ghost" id="btn-menu">MENU</button>
    </div>`;
  app.appendChild(s);

  judge.verdict(winner === 'draw' ? 'Égalité. Incroyable.' : `${names[winner]} remporte le battle.`);

  s.querySelector('#btn-menu')!.addEventListener('click', () => {
    room?.send({ t: 'bye' });
    room?.destroy(); room = null;
    renderMenu();
  });
  s.querySelector('#btn-rematch')!.addEventListener('click', (e) => {
    if (mode === 'online') {
      iWantRematch = true;
      room?.send({ t: 'rematch' });
      (e.target as HTMLButtonElement).textContent = 'EN ATTENTE…';
      if (peerWantsRematch) {
        if (room?.isHost) room.send({ t: 'start', at: Date.now() });
        void launchBattle();
      }
    } else {
      void launchBattle();
    }
  });
}

function cleanupBattle(destroyRoom = true) {
  vision.stop();
  battle?.destroy();
  battle = null;
  bot?.stop(); bot = null;
  if (destroyRoom) { room?.destroy(); room = null; pendingRemoteStream = null; remoteName = 'RIVAL'; }
  clearTimeout(remoteVerdictTimer);
  pendingLocalResult = null;
  document.querySelector('.debug-panel')?.remove();
  speechSynthesis?.cancel();
}

// ============================== DEBUG / DÉMO ==============================
function buildDebugPanel() {
  if (!DEBUG && vision.loaded && stream) return;
  document.querySelector('.debug-panel')?.remove();
  const panel = h('div');
  panel.className = 'debug-panel';
  const players: PlayerId[] = mode === 'local' ? ['p1', 'p2'] : ['p1'];
  let inner = '<h4>🛠 mode démo — trigger un move</h4>';
  for (const p of players) {
    inner += `<div style="font-size:.6rem;color:var(--${p});margin:6px 0 4px">${p.toUpperCase()}</div><div class="dbg-moves">`;
    for (const m of MOVES) inner += `<button data-p="${p}" data-m="${m.id}">${m.glyph}${m.label}</button>`;
    inner += '</div>';
  }
  panel.innerHTML = inner;
  panel.addEventListener('click', (e) => {
    const b = (e.target as HTMLElement).closest('button');
    if (!b) return;
    battle?.applyMove(b.dataset.p as PlayerId, b.dataset.m!, performance.now());
  });
  document.body.appendChild(panel);
}

// ============================== BOOT ==============================
window.addEventListener('hashchange', () => {
  const hash = location.hash.replace('#', '');
  if (/^[A-Za-z0-9]{4}$/.test(hash) && !battle) renderLobby();
});
if (/^[A-Za-z0-9]{4}$/.test(location.hash.replace('#', ''))) renderLobby();
else renderMenu();
