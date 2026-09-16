import { MOVES } from './moves';

// PHANTØM — l'adversaire IA du mode solo.
// Produit des moves pseudo-réalistes, avec rubber-band pour garder le match serré.
export class Bot {
  name = 'PHANTØM';
  private timer = 0;
  private stopped = false;

  constructor(private applyMove: (moveId: string) => void, private getScores: () => { me: number; bot: number }) {}

  start() {
    this.stopped = false;
    const loop = () => {
      if (this.stopped) return;
      const { me, bot } = this.getScores();
      const diff = bot - me;
      // rubber-band : derrière → accélère, devant → se relâche
      let delay = 1200 + Math.random() * 1400;
      if (diff < -12) delay *= 0.6;
      else if (diff > 15) delay *= 1.5;
      // phases de "réflexion" — le bot n'est pas une machine parfaite
      if (Math.random() < 0.12) delay += 2200;
      this.timer = window.setTimeout(() => {
        this.doMove();
        loop();
      }, delay);
    };
    loop();
  }

  private doMove() {
    // pondération : les gros moves sont plus rares, comme un vrai joueur
    const pool = MOVES.flatMap((m) => Array(Math.max(1, Math.round(24 - m.pts))).fill(m.id));
    const id = pool[Math.floor(Math.random() * pool.length)];
    this.applyMove(id);
  }

  stop() {
    this.stopped = true;
    clearTimeout(this.timer);
  }
}
