// Classification des gestes à partir des landmarks MediaPipe (coords normalisées 0..1).
export type Lm = { x: number; y: number; z?: number; visibility?: number };

export type GestureId =
  | 'palm' | 'fist' | 'peace' | 'gun' | 'shaka' | 'point'
  | 'rock' | 'ok' | 'bold' | 'thumbsup' | 'thumbsdown' | 'other';

export type PoseId =
  | 'dab' | 'tpose' | 'crossed' | 'hips' | 'flex' | 'roof' | 'squat' | 'thinker';

export type ExprId = 'smize' | 'brow' | 'jaw' | 'duck' | 'tiger';

const d = (a: Lm, b: Lm) => Math.hypot(a.x - b.x, a.y - b.y);

/** cos de l'angle articulaire en b : ~1 = doigt droit, <0 = plié à 90°+ */
const straight = (a: Lm, b: Lm, c: Lm): number => {
  const ux = b.x - a.x, uy = b.y - a.y;
  const vx = c.x - b.x, vy = c.y - b.y;
  const nu = Math.hypot(ux, uy), nv = Math.hypot(vx, vy);
  return nu && nv ? (ux * vx + uy * vy) / (nu * nv) : 0;
};

// ---------- MAINS (21 landmarks) ----------
export function classifyHand(h: Lm[]): GestureId {
  if (h.length < 21) return 'other';
  const unit = d(h[0], h[9]) || 1e-6;

  const ext = {
    index: straight(h[5], h[6], h[8]) > 0.4,
    middle: straight(h[9], h[10], h[12]) > 0.4,
    ring: straight(h[13], h[14], h[16]) > 0.4,
    pinky: straight(h[17], h[18], h[20]) > 0.4,
  };
  // pouce sorti = tip loin de la base de l'index
  const thumbOut = d(h[4], h[5]) > d(h[2], h[5]) * 1.15;
  const fingers = [ext.index, ext.middle, ext.ring, ext.pinky];
  const nExt = fingers.filter(Boolean).length;

  // OK : pouce+index se touchent, reste ouvert
  if (d(h[4], h[8]) < 0.38 * unit && ext.middle && ext.ring && ext.pinky) return 'ok';

  if (nExt === 4) return 'palm';

  if (ext.index && ext.middle && !ext.ring && !ext.pinky) return 'peace';
  if (ext.index && !ext.middle && !ext.ring && !ext.pinky) return thumbOut ? 'gun' : 'point';
  if (ext.index && !ext.middle && !ext.ring && ext.pinky) return 'rock';
  if (!ext.index && !ext.middle && !ext.ring && ext.pinky && thumbOut) return 'shaka';
  if (!ext.index && ext.middle && !ext.ring && !ext.pinky) return 'bold';

  if (nExt === 0 && thumbOut) {
    if (h[4].y < h[2].y - 0.25 * unit) return 'thumbsup';
    if (h[4].y > h[2].y + 0.55 * unit) return 'thumbsdown';
    return 'fist'; // pouce horizontal = poing
  }
  if (nExt === 0) return 'fist';

  return 'other';
}

// ---------- POSE (33 landmarks BlazePose) ----------
export function classifyPose(p: Lm[]): PoseId[] {
  if (p.length < 33) return [];
  const out: PoseId[] = [];
  const sw = d(p[11], p[12]) || 1e-6; // largeur d'épaules = unité
  const shY = (p[11].y + p[12].y) / 2;
  const hipY = (p[23].y + p[24].y) / 2;
  const kneeY = (p[25].y + p[26].y) / 2;

  const wL = p[15], wR = p[16], eL = p[13], eR = p[14];
  const sL = p[11], sR = p[12], hipL = p[23], hipR = p[24], nose = p[0];

  // T-POSE : bras horizontaux, étendus
  if (
    Math.abs(wL.y - sL.y) < 0.45 * sw && Math.abs(wR.y - sR.y) < 0.45 * sw &&
    Math.abs(wL.x - sL.x) > 1.0 * sw && Math.abs(wR.x - sR.x) > 1.0 * sw &&
    straight(sL, eL, wL) > 0.35 && straight(sR, eR, wR) > 0.35
  ) out.push('tpose');

  // RAISE THE ROOF : deux poignets au-dessus des épaules
  if (wL.y < sL.y - 0.45 * sw && wR.y < sR.y - 0.45 * sw) out.push('roof');

  // DAB : un poignet au visage + autre bras tendu dehors
  const dabL = d(wL, nose) < 0.95 * sw && d(wR, sR) > 1.15 * sw && Math.abs(wR.y - sR.y) < 1.0 * sw;
  const dabR = d(wR, nose) < 0.95 * sw && d(wL, sL) > 1.15 * sw && Math.abs(wL.y - sL.y) < 1.0 * sw;
  if (dabL || dabR) out.push('dab');

  // BRAS CROISÉS : poignets près des coudes opposés, hauteur torse
  const torso = (l: Lm) => l.y > shY - 0.35 * sw && l.y < hipY + 0.35 * sw;
  if (d(wL, eR) < 0.95 * sw && d(wR, eL) < 0.95 * sw && torso(wL) && torso(wR)) out.push('crossed');

  // MAINS AUX HANCHES
  if (d(wL, hipL) < 0.6 * sw && d(wR, hipR) < 0.6 * sw) out.push('hips');

  // FLEX : coudes pliés, poings en hauteur près de la tête
  const bentL = straight(sL, eL, wL) < 0.35;
  const bentR = straight(sR, eR, wR) < 0.35;
  if (bentL && bentR && wL.y < sL.y + 0.35 * sw && wR.y < sR.y + 0.35 * sw &&
      Math.abs(eL.x - sL.x) > 0.3 * sw && Math.abs(eR.x - sR.x) > 0.3 * sw) out.push('flex');

  // PENSEUR : main au visage, autre main basse
  const thinkL = d(wL, nose) < 0.7 * sw && wR.y > hipY - 0.5 * sw && d(wR, sR) < 1.0 * sw;
  const thinkR = d(wR, nose) < 0.7 * sw && wL.y > hipY - 0.5 * sw && d(wL, sL) < 1.0 * sw;
  if ((thinkL || thinkR) && !dabL && !dabR) out.push('thinker');

  // SQUAT : hanches au niveau des genoux
  if (hipY > kneeY - 0.09 && (p[25].visibility ?? 1) > 0.4) out.push('squat');

  return out;
}

// ---------- VISAGE (blendshapes) ----------
export function classifyFace(cats: { categoryName: string; score: number }[]): ExprId[] {
  const s = (n: string) => cats.find((c) => c.categoryName === n)?.score ?? 0;
  const out: ExprId[] = [];

  const smile = (s('mouthSmileLeft') + s('mouthSmileRight')) / 2;
  const squint = (s('eyeSquintLeft') + s('eyeSquintRight')) / 2;
  const wide = (s('eyeWideLeft') + s('eyeWideRight')) / 2;
  const brow = (s('browInnerUp') + s('browOuterUpLeft') + s('browOuterUpRight')) / 3;

  if (s('jawOpen') > 0.45) out.push('jaw');
  if (s('mouthPucker') > 0.5) out.push('duck');
  if (brow > 0.55) out.push('brow');
  if (wide > 0.5 && smile < 0.4) out.push('tiger');
  if (smile > 0.45 && squint > 0.22) out.push('smize');

  return out;
}

/** geste → move id (même nommage) */
export const GESTURE_TO_MOVE: Record<GestureId, string | null> = {
  palm: 'palm', fist: 'fist', peace: 'peace', gun: 'gun', shaka: 'shaka',
  point: 'point', rock: 'rock', ok: 'ok', bold: 'bold',
  thumbsup: 'thumbsup', thumbsdown: 'thumbsdown', other: null,
};
