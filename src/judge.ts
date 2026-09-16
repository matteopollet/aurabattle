// LE JUGE — l'IA qui commente. Texte + synthèse vocale fr.
const pick = <T,>(arr: T[]): T => arr[Math.floor(Math.random() * arr.length)];

const MOVE_LINES: Record<string, string[]> = {
  sixseven: ['<em>SIX-SEPT.</em> Le move de l\'année.', 'Il a osé le six-sept. Respect total.', '6…7. Légendaire.'],
  dab: ['Un dab en 2026. Le jury apprécie l\'audace.', 'Dab validé. À contre-courant, j\'aime.'],
  tpose: ['La T-pose. Dominance absolue du terrain.', 'Il affirme son territoire.'],
  flex: ['Regardez-moi ces biceps.', 'Fonte de qualité.'],
  rock: ['Les cornes sont sorties. L\'arène tremble.', 'Métallique. J\'approuve.'],
  bold: ['Vulgaire. Mais l\'audace paie.', 'Le jury note le manque de respect. Avec le sourire.'],
  gun: ['Pan pan. Finger guns classiques.', 'Il tire à l\'aura pure.'],
  peace: ['Peace and aura.', 'Pacifiste mais stylé.'],
  shaka: ['Shaka. Détente maximale.', 'Les vibes hawaïennes entrent dans l\'arène.'],
  point: ['Il désigne son destin.', 'Le point du destin, bien placé.'],
  palm: ['Parle à ma main.', 'Stop net. Mur d\'aura.'],
  fist: ['Poing levé. Détermination.', 'Solide.'],
  ok: ['Tout est carré.', 'Précision chirurgicale.'],
  thumbsup: ['Validé par le pouce.', 'Simple. Efficace.'],
  thumbsdown: ['Le pouce provocateur. Le public adore.', 'Il nargue.'],
  roof: ['Le toit est soulevé.', 'Il soulève l\'arène entière.'],
  squat: ['Le squat slave. Ancré au sol.', 'Hanches basses, aura haute.'],
  hips: ['Mains aux hanches. Posture de capitaine.', 'Super-héros de comptoir, mais ça marche.'],
  crossed: ['Bras croisés. Impassible.', 'Le mur est dressé.'],
  thinker: ['Il réfléchit. Dangereux.', 'Le penseur calcule son prochain move.'],
  smize: ['Il sourit avec les yeux. Technique avancée.', 'Le smize. Tyra serait fière.'],
  brow: ['Sourcil levé. Il doute de son adversaire.', 'Un sourcil vaut mille mots.'],
  jaw: ['Le cri de guerre résonne.', 'Mâchoire au sol, aura au plafond.'],
  duck: ['Duck face. Retour en 2012.', 'Les lèvres parlent.'],
  tiger: ['L\'œil du tigre. Il ne cligne plus.', 'Contact visuel total. Effrayant.'],
};

const COMBO_LINES = [
  'COMBO <em>×{n}</em>. Il est en feu.',
  'Enchaînement <em>×{n}</em>, le jury est debout.',
  '×{n} moves distincts. Fluidité de démon.',
];
const FATIGUE_LINES = [
  'Encore celui-là ? Ça devient mid.',
  'Le jury a déjà vu ce move. Points réduits.',
  'Répétition détectée. L\'aura s\'ennuie.',
];
const IDLE_LINES = [
  '{name} est AFK ? L\'aura n\'attend pas.',
  '{name} regarde le plafond. Bouge.',
  'Silence radio côté {name}.',
];
const STASIS_LINES = [
  'Stase totale. L\'immobilité paie.',
  '{name} est une statue. Une statue riche.',
];

export class Judge {
  private voice?: SpeechSynthesisVoice;
  private lastSpeak = 0;
  onSay: (html: string) => void = () => {};
  onTalking: (talking: boolean) => void = () => {};
  enabled = true;

  constructor() {
    const load = () => {
      this.voice = speechSynthesis.getVoices().find((v) => v.lang.startsWith('fr'));
    };
    if ('speechSynthesis' in window) {
      load();
      speechSynthesis.onvoiceschanged = load;
    }
  }

  say(html: string, speak = false) {
    this.onSay(html);
    if (!speak || !this.enabled || !('speechSynthesis' in window)) return;
    const now = performance.now();
    if (now - this.lastSpeak < 1600) return; // pas de bégaiement
    this.lastSpeak = now;
    const text = html.replace(/<[^>]+>/g, '');
    const u = new SpeechSynthesisUtterance(text);
    u.lang = 'fr-FR';
    u.rate = 1.15;
    u.pitch = 0.85;
    if (this.voice) u.voice = this.voice;
    u.onstart = () => this.onTalking(true);
    u.onend = () => this.onTalking(false);
    speechSynthesis.speak(u);
  }

  move(moveId: string, pts: number, big: boolean) {
    const lines = MOVE_LINES[moveId];
    const base = lines ? pick(lines) : pick(['Noté.', 'Vu.', 'Hmm. Intéressant.', 'Le jury observe.']);
    this.say(base.replace('{pts}', String(pts)), big);
  }
  combo(n: number) { this.say(pick(COMBO_LINES).replace('{n}', String(n)), n >= 4); }
  namedCombo(label: string) { this.say(`<em>${label}</em> ! Combo signature !`, true); }
  fatigue() { this.say(pick(FATIGUE_LINES)); }
  idle(name: string) { this.say(pick(IDLE_LINES).replace('{name}', name)); }
  stasis(name: string) { this.say(pick(STASIS_LINES).replace('{name}', name)); }
  banned(moveLabel: string) { this.say(`<em>${moveLabel}</em> est INTERDIT. -8 si tu tentes.`, true); }
  event(text: string) { this.say(text, true); }
  verdict(html: string) { this.say(html, true); }
}
