export type PlayerId = 'p1' | 'p2';
export type MoveCat = 'special' | 'hands' | 'pose' | 'face';

export interface MoveDef {
  id: string;
  label: string;
  pts: number;
  cat: MoveCat;
  glyph: string;
  desc: string;
}

export const MOVES: MoveDef[] = [
  // — le move signature —
  { id: 'sixseven', label: 'SIX-SEPT', pts: 20, cat: 'special', glyph: '67', desc: 'Deux paumes ouvertes qui alternent haut-bas, comme des balances.' },

  // — mains —
  { id: 'gun',       label: 'FINGER GUNS',      pts: 9,  cat: 'hands', glyph: '☞', desc: 'Pouce + index tendus, les autres pliés.' },
  { id: 'peace',     label: 'PEACE',            pts: 7,  cat: 'hands', glyph: '✌', desc: 'Index + majeur en V.' },
  { id: 'shaka',     label: 'SHAKA',            pts: 9,  cat: 'hands', glyph: '🤙', desc: 'Pouce + auriculaire dehors.' },
  { id: 'palm',      label: 'TALK TO THE HAND', pts: 6,  cat: 'hands', glyph: '✋', desc: 'Paume ouverte face caméra.' },
  { id: 'point',     label: 'POINT DU DESTIN',  pts: 8,  cat: 'hands', glyph: '👆', desc: 'Index seul tendu.' },
  { id: 'fist',      label: 'POING D’AURA',     pts: 7,  cat: 'hands', glyph: '✊', desc: 'Poing fermé.' },
  { id: 'rock',      label: 'CORNES DU CHAOS',  pts: 11, cat: 'hands', glyph: '🤘', desc: 'Index + auriculaire levés.' },
  { id: 'ok',        label: 'C’EST CARRÉ',      pts: 6,  cat: 'hands', glyph: '👌', desc: 'Pouce et index en cercle.' },
  { id: 'thumbsup',  label: 'POUCE VALIDÉ',     pts: 5,  cat: 'hands', glyph: '👍', desc: 'Pouce vers le ciel.' },
  { id: 'thumbsdown',label: 'POUCE PROVOQ',     pts: 8,  cat: 'hands', glyph: '👎', desc: 'Pouce vers le sol. Manque de respect assumé.' },
  { id: 'bold',      label: 'AUDACE TOTALE',    pts: 13, cat: 'hands', glyph: '🖕', desc: 'Le majeur assume tout. Risqué, récompensé.' },

  // — poses —
  { id: 'dab',      label: 'DAB',               pts: 12, cat: 'pose', glyph: '💁', desc: 'Tête dans le coude, autre bras tendu.' },
  { id: 'tpose',    label: 'T-POSE',            pts: 14, cat: 'pose', glyph: '🧍', desc: 'Bras à l’horizontale. Dominance pure.' },
  { id: 'crossed',  label: 'BRAS CROISÉS',      pts: 8,  cat: 'pose', glyph: '🙅', desc: 'Bras croisés sur la poitrine.' },
  { id: 'hips',     label: 'MAINS AUX HANCHES', pts: 9,  cat: 'pose', glyph: '🦸', desc: 'Super-héros de comptoir.' },
  { id: 'flex',     label: 'DOUBLE BICEPS',     pts: 13, cat: 'pose', glyph: '💪', desc: 'Les deux bras fléchis, coudes dehors.' },
  { id: 'roof',     label: 'RAISE THE ROOF',    pts: 10, cat: 'pose', glyph: '🙌', desc: 'Deux bras au ciel.' },
  { id: 'squat',    label: 'SQUAT SLAVE',       pts: 11, cat: 'pose', glyph: '🏋', desc: 'Hanches au sol, dos fier.' },
  { id: 'thinker',  label: 'LE PENSEUR',        pts: 8,  cat: 'pose', glyph: '🤔', desc: 'Main au menton, regard perdu.' },

  // — visage —
  { id: 'smize',  label: 'SMIZE',           pts: 8, cat: 'face', glyph: '😏', desc: 'Souris avec les yeux.' },
  { id: 'brow',   label: 'SOURCIL ALPHA',   pts: 7, cat: 'face', glyph: '🤨', desc: 'Sourcils au plafond.' },
  { id: 'jaw',    label: 'CRI DE GUERRE',   pts: 9, cat: 'face', glyph: '😱', desc: 'Mâchoire décrochée.' },
  { id: 'duck',   label: 'DUCK FACE',       pts: 7, cat: 'face', glyph: '😗', desc: 'Lèvres en avant, années 2010.' },
  { id: 'tiger',  label: 'ŒIL DU TIGRE',    pts: 8, cat: 'face', glyph: '👀', desc: 'Yeux grand ouverts, contact total.' },
];

export const MOVE_BY_ID = new Map(MOVES.map((m) => [m.id, m]));

/** Combos nommés : séquences exactes (derniers moves, ordre chronologique) → bonus */
export const NAMED_COMBOS: { seq: string[]; label: string; bonus: number }[] = [
  { seq: ['dab', 'tpose'],        label: 'TRANSITION ALPHA',  bonus: 15 },
  { seq: ['gun', 'point'],        label: 'DOUBLE TAP',        bonus: 12 },
  { seq: ['fist', 'flex'],        label: 'FULL MUSCLE',       bonus: 14 },
  { seq: ['peace', 'smize'],      label: 'SELFIE GAME',       bonus: 12 },
  { seq: ['roof', 'squat'],       label: 'VERTIGO',           bonus: 12 },
  { seq: ['crossed', 'tpose'],    label: 'LIBÉRATION',        bonus: 13 },
  { seq: ['sixseven', 'dab'],     label: 'GÉNÉRATION Z',      bonus: 16 },
  { seq: ['thumbsdown', 'bold'],  label: 'ZÉRO RESPECT',      bonus: 15 },
  { seq: ['shaka', 'peace'],      label: 'GOOD VIBES ONLY',   bonus: 11 },
  { seq: ['thinker', 'point'],    label: 'EURÊKA',            bonus: 12 },
];
