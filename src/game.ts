import { GESTURE_TO_MOVE } from './gestures';
import { MOVE_BY_ID, NAMED_COMBOS, type MoveDef, type PlayerId } from './moves';
import type { FrameData } from './vision';
import type { Judge } from './judge';
import { sfx } from './sfx';

export type Mode = 'solo' | 'local' | 'online';

export interface FeedMsg {
  who?: PlayerId;
  text: string;
  pts?: number;
  kind: 'move' | 'combo' | 'sys' | 'penalty';
}

export interface PlayerStats {
  moves: number;
  bestCombo: number;
  signature: string | null;
}

export interface BattleResult {
  winner: PlayerId | 'draw';
  scores: Record<PlayerId, number>;
  stats: Record<PlayerId, PlayerStats>;
  margin: number;
}

export interface Hooks {
  score(p: PlayerId, total: number, delta: number): void;
  feed(m: FeedMsg): void;
  chip(p: PlayerId, def: MoveDef): void;
  banner(text: string, danger?: boolean): void;
  tick(remainingMs: number): void;
  end(result: BattleResult): void;
  remoteMove?(id: string, total: number): void;
  remoteScore?(total: number): void;
}

type GameEvent =
  | { type: 'double'; until: number }
  | { type: 'stasis'; until: number; announced: Set<PlayerId> }
  | { type: 'ban'; until: number; move: string }
  | { type: 'hype'; until: number };

interface SixSample { t: number; l: number; r: number }

class Tracker {
  active = new Set<string>();
  holdSince = new Map<string, number>();
  lastTrigger = new Map<string, number>();
  useCount = new Map<string, number>();
  history: { id: string; t: number }[] = [];
  six: SixSample[] = [];
  sixGap = 0;
  lastAny = 0;
  lastTaunt = 0;
  moves = 0;
  bestCombo = 0;
}

export class Battle {
  scores: Record<PlayerId, number> = { p1: 0, p2: 0 };
  live = false;
  private trackers: Record<PlayerId, Tracker> = { p1: new Tracker(), p2: new Tracker() };
  private interval = 0;
  private endAt = 0;
  private nextEventAt = 0;
  private event: GameEvent | null = null;
  private lastMotion: Record<PlayerId, number> = { p1: 0, p2: 0 };
  private syncTimer = 0;
  private endSent = false;

  constructor(
    public mode: Mode,
    public names: Record<PlayerId, string>,
    private hooks: Hooks,
    private judge: Judge,
    public duration = 30_000,
  ) {}

  private tr(p: PlayerId) { return this.trackers[p]; }

  start() {
    this.live = true;
    const now = performance.now();
    this.endAt = now + this.duration;
    this.nextEventAt = now + 7000 + Math.random() * 3000;
    this.interval = window.setInterval(() => this.tick(), 100);
    this.syncTimer = window.setInterval(() => this.hooks.remoteScore?.(Math.round(this.scores.p1)), 2000);
    this.hooks.feed({ text: 'Le juge ouvre la session. 30 secondes.', kind: 'sys' });
  }

  private tick() {
    const now = performance.now();
    const remaining = this.endAt - now;
    if (remaining <= 0) return this.finish();

    this.hooks.tick(remaining);

    // événements
    if (!this.event && now > this.nextEventAt) this.spawnEvent(now);
    if (this.event && now > this.event.until) this.event = null;
    if (this.event?.type === 'stasis') {
      // stase mesurée par la caméra locale : p2 seulement en duel local
      const tracked: PlayerId[] = this.mode === 'local' ? ['p1', 'p2'] : ['p1'];
      tracked.forEach((p) => {
        if (this.lastMotion[p] < 0.06) {
          this.addScore(p, 0.5);
          if (!this.event || this.event.type !== 'stasis') return;
          if (!this.event.announced.has(p)) {
            this.event.announced.add(p);
            this.judge.stasis(this.names[p]);
          }
        }
      });
    }

    // taunts idle (uniquement les joueurs vus par la caméra)
    const tracked: PlayerId[] = this.mode === 'local' ? ['p1', 'p2'] : ['p1'];
    tracked.forEach((p) => {
      const tr = this.tr(p);
      if (tr.lastAny && now - tr.lastAny > 5500 && now - tr.lastTaunt > 8000) {
        tr.lastTaunt = now;
        this.judge.idle(this.names[p]);
      }
    });
  }

  private spawnEvent(now: number) {
    const types: GameEvent['type'][] = ['double', 'ban', 'stasis', 'hype'];
    const type = types[Math.floor(Math.random() * types.length)];
    switch (type) {
      case 'double':
        this.event = { type, until: now + 5000 };
        this.hooks.banner('⚡ AURA ×2', false);
        this.judge.event('<em>Double aura</em> pendant 5 secondes. Fonce.');
        break;
      case 'ban': {
        const banned = ['dab', 'palm', 'fist', 'peace', 'tpose', 'flex', 'point'][Math.floor(Math.random() * 7)];
        this.event = { type, until: now + 6000, move: banned };
        this.hooks.banner(`🚫 ${MOVE_BY_ID.get(banned)!.label} INTERDIT`, true);
        this.judge.banned(MOVE_BY_ID.get(banned)!.label);
        break;
      }
      case 'stasis':
        this.event = { type, until: now + 4000, announced: new Set() };
        this.hooks.banner('🧊 STASE — RESTE IMMOBILE', false);
        this.judge.event('<em>Stase</em>. Qui bouge perd. 4 secondes.');
        break;
      case 'hype':
        this.event = { type, until: now + 6000 };
        this.hooks.banner('🔥 PROCHAIN MOVE +15', false);
        this.judge.event('Le prochain move vaut <em>+15 bonus</em>. À qui ?');
        break;
    }
    sfx.event();
    this.nextEventAt = now + 9000 + Math.random() * 5000;
  }

  // ---------- ingestion vision ----------
  ingestFrame(f: FrameData) {
    if (!this.live) return;
    this.lastMotion = f.motion;
    const players: PlayerId[] = this.mode === 'local' ? ['p1', 'p2'] : ['p1'];

    for (const p of players) {
      const detected = this.collectDetected(p, f);
      const tr = this.tr(p);

      // met à jour les holds
      for (const id of detected) if (!tr.active.has(id)) tr.holdSince.set(id, f.t);
      for (const id of [...tr.active]) if (!detected.has(id)) tr.holdSince.delete(id);
      tr.active = detected;

      if (!detected.size) continue;
      const best = [...detected].sort(
        (a, b) => (MOVE_BY_ID.get(b)?.pts ?? 0) - (MOVE_BY_ID.get(a)?.pts ?? 0),
      )[0];
      this.tryTrigger(p, best, f.t);
    }
  }

  private collectDetected(p: PlayerId, f: FrameData): Set<string> {
    const out = new Set<string>();
    const hands = f.hands.filter((h) => h.player === p);
    const pose = f.poses.find((pp) => pp.player === p);
    const face = f.faces.find((ff) => ff.player === p);

    if (this.detectSixSeven(p, hands, f.t)) out.add('sixseven');
    if (pose) pose.poses.forEach((id) => out.add(id));
    for (const h of hands) {
      const id = GESTURE_TO_MOVE[h.gesture];
      if (id) out.add(id);
    }
    if (face) face.exprs.forEach((id) => out.add(id));
    return out;
  }

  /** Le fameux 6-7 : deux paumes ouvertes qui alternent en opposition de phase. */
  private detectSixSeven(p: PlayerId, hands: { gesture: string; cx: number; cy: number }[], t: number): boolean {
    const tr = this.tr(p);
    const palms = hands.filter((h) => h.gesture === 'palm').sort((a, b) => a.cx - b.cx);
    if (palms.length >= 2) {
      tr.six.push({ t, l: palms[0].cy, r: palms[1].cy });
      tr.sixGap = 0;
    } else if (++tr.sixGap > 8) {
      tr.six = [];
    }
    while (tr.six.length && t - tr.six[0].t > 1400) tr.six.shift();
    const s = tr.six;
    if (s.length < 8) return false;

    let disagree = 0, pairs = 0;
    let rangeL = 0, rangeR = 0;
    const lVals = s.map((v) => v.l), rVals = s.map((v) => v.r);
    rangeL = Math.max(...lVals) - Math.min(...lVals);
    rangeR = Math.max(...rVals) - Math.min(...rVals);
    for (let i = 1; i < s.length; i++) {
      const dl = s[i].l - s[i - 1].l;
      const dr = s[i].r - s[i - 1].r;
      if (Math.abs(dl) > 0.004 && Math.abs(dr) > 0.004) {
        pairs++;
        if (Math.sign(dl) !== Math.sign(dr)) disagree++;
      }
    }
    return pairs >= 4 && disagree / pairs > 0.55 && rangeL > 0.03 && rangeR > 0.03;
  }

  /** Point d'entrée unique pour tout move (vision, bot, réseau, debug). */
  applyMove(p: PlayerId, moveId: string, now = performance.now(), reportedTotal?: number) {
    if (!this.live) return;
    this.tryTrigger(p, moveId, now, true, reportedTotal);
  }

  private tryTrigger(p: PlayerId, moveId: string, now: number, force = false, reportedTotal?: number) {
    const tr = this.tr(p);
    const def = MOVE_BY_ID.get(moveId);
    if (!def) return;

    const lastT = tr.lastTrigger.get(moveId) ?? -1e9;
    if (now - lastT < 1400) return;

    // move distant : le score rapporté par le pair fait foi, on applique tel quel
    if (reportedTotal !== undefined) {
      tr.lastTrigger.set(moveId, now);
      tr.lastAny = now;
      tr.moves++;
      this.scores[p] = reportedTotal;
      this.hooks.score(p, reportedTotal, def.pts);
      this.hooks.chip(p, def);
      this.hooks.feed({ who: p, text: `${def.glyph} ${def.label}`, pts: def.pts, kind: 'move' });
      this.judge.move(moveId, def.pts, def.pts >= 18);
      return;
    }

    // edge-trigger : pas de re-score tant que le move est tenu (sauf hold 2.5s → pulse)
    const holdStart = tr.holdSince.get(moveId);
    const isEdge = force || holdStart === undefined || holdStart >= now - 60;
    const held = holdStart !== undefined ? now - holdStart : 0;
    if (!isEdge && held < 2500) return;

    // move banni ?
    if (this.event?.type === 'ban' && this.event.move === moveId) {
      tr.lastTrigger.set(moveId, now);
      tr.lastAny = now;
      this.addScore(p, -8);
      this.hooks.feed({ who: p, text: `${def.label} — MOVE INTERDIT`, pts: -8, kind: 'penalty' });
      this.judge.say(`${this.names[p]} tente le move interdit. <em>-8.</em> Le tribunal est formel.`);
      sfx.penalty();
      return;
    }

    tr.lastTrigger.set(moveId, now);
    tr.lastAny = now;
    tr.moves++;
    if (isEdge) tr.holdSince.set(moveId, now);
    else tr.holdSince.set(moveId, now); // pulse toutes les 2.5s

    const uses = (tr.useCount.get(moveId) ?? 0) + 1;
    tr.useCount.set(moveId, uses);
    const fatigue = uses <= 2 ? 1 : uses === 3 ? 0.5 : 0.25;

    let mult = 1;
    if (this.event?.type === 'double') mult *= 2;
    if (!isEdge) mult *= 0.6;

    // combo : moves distincts dans les 4 dernières secondes
    tr.history = tr.history.filter((h) => now - h.t < 4000);
    tr.history.push({ id: moveId, t: now });
    const distinct = new Set(tr.history.map((h) => h.id)).size;
    tr.bestCombo = Math.max(tr.bestCombo, distinct);
    const comboBonus = distinct >= 2 ? Math.round(def.pts * 0.25 * (distinct - 1)) : 0;

    let pts = Math.round(def.pts * mult * fatigue) + comboBonus;

    if (this.event?.type === 'hype') {
      pts += 15;
      this.event = null;
      this.hooks.banner(`${this.names[p]} RÉCUPÈRE LE +15`, false);
    }

    this.addScore(p, pts);
    this.hooks.chip(p, def);
    this.hooks.feed({ who: p, text: `${def.glyph} ${def.label}`, pts, kind: 'move' });
    sfx.score(pts >= 18);

    if (uses >= 3 && Math.random() < 0.7) this.judge.fatigue();
    else this.judge.move(moveId, pts, pts >= 18);
    if (distinct >= 3) this.judge.combo(distinct);

    // combos nommés
    const seq = tr.history.map((h) => h.id);
    for (const c of NAMED_COMBOS) {
      const n = c.seq.length;
      if (seq.length >= n && seq.slice(-n).every((id, i) => id === c.seq[i])) {
        this.addScore(p, c.bonus);
        this.hooks.feed({ who: p, text: `✦ ${c.label}`, pts: c.bonus, kind: 'combo' });
        this.judge.namedCombo(c.label);
        sfx.combo();
        tr.history = [];
        break;
      }
    }

    this.hooks.remoteMove?.(moveId, Math.round(this.scores[p]));
    navigator.vibrate?.(15);
  }

  private addScore(p: PlayerId, delta: number) {
    this.scores[p] = Math.max(0, this.scores[p] + delta);
    this.hooks.score(p, this.scores[p], delta);
  }

  /** Réseau : l'adversaire envoie son move, on le score ici (en p2). */
  ingestRemoteMove(moveId: string, total: number) {
    this.applyMove('p2', moveId, performance.now(), total);
  }
  ingestRemoteScore(total: number) {
    this.scores.p2 = total;
    this.hooks.score('p2', total, 0);
  }

  finish(): BattleResult {
    if (!this.live) return this.lastResult!;
    this.live = false;
    clearInterval(this.interval);
    clearInterval(this.syncTimer);
    this.hooks.tick(0);
    const s1 = Math.round(this.scores.p1), s2 = Math.round(this.scores.p2);
    const result: BattleResult = {
      winner: s1 === s2 ? 'draw' : s1 > s2 ? 'p1' : 'p2',
      scores: { p1: s1, p2: s2 },
      margin: Math.abs(s1 - s2),
      stats: {
        p1: this.statOf('p1'),
        p2: this.statOf('p2'),
      },
    };
    this.lastResult = result;
    this.hooks.end(result);
    return result;
  }

  private lastResult?: BattleResult;

  get endedByHost() { return this.endSent; }
  markEndSent() { this.endSent = true; }

  private statOf(p: PlayerId): PlayerStats {
    const tr = this.tr(p);
    let signature: string | null = null;
    let max = 0;
    tr.useCount.forEach((n, id) => { if (n > max) { max = n; signature = id; } });
    return { moves: tr.moves, bestCombo: tr.bestCombo, signature };
  }

  destroy() {
    this.live = false;
    clearInterval(this.interval);
    clearInterval(this.syncTimer);
  }
}
