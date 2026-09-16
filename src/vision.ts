import {
  FaceLandmarker, FilesetResolver, HandLandmarker, PoseLandmarker,
} from '@mediapipe/tasks-vision';
import {
  classifyFace, classifyHand, classifyPose,
  type ExprId, type GestureId, type Lm, type PoseId,
} from './gestures';
import type { PlayerId } from './moves';

export interface HandObs { player: PlayerId; gesture: GestureId; cx: number; cy: number; lms: Lm[] }
export interface PoseObs { player: PlayerId; poses: PoseId[]; lms: Lm[] }
export interface FaceObs { player: PlayerId; exprs: ExprId[]; lms: Lm[] }

export interface FrameData {
  t: number;
  hands: HandObs[];
  poses: PoseObs[];
  faces: FaceObs[];
  motion: Record<PlayerId, number>; // 0..1 niveau de mouvement
}

export type AssignMode = 'single' | 'split';

const HAND_BONES: [number, number][] = [
  [0,1],[1,2],[2,3],[3,4],[0,5],[5,6],[6,7],[7,8],[5,9],[9,10],[10,11],[11,12],
  [9,13],[13,14],[14,15],[15,16],[13,17],[17,18],[18,19],[19,20],[0,17],
];
const POSE_BONES: [number, number][] = [
  [11,12],[11,13],[13,15],[12,14],[14,16],[11,23],[12,24],[23,24],
  [23,25],[25,27],[24,26],[26,28],[15,17],[16,18],[15,19],[16,20],[17,19],[18,20],
];
const FACE_OVAL = [10,338,297,332,284,251,389,356,454,323,361,288,397,365,379,378,400,377,152,148,176,149,150,136,172,58,132,93,234,127,162,21,54,103,67,109,10];

export const COLORS: Record<PlayerId, string> = { p1: '#22d3ee', p2: '#ff3d81' };

export class VisionEngine {
  private hand?: HandLandmarker;
  private pose?: PoseLandmarker;
  private face?: FaceLandmarker;
  private video?: HTMLVideoElement;
  private overlay?: CanvasRenderingContext2D;
  private raf = 0;
  private running = false;
  private lastRun = 0;
  private minGap = 40;
  private tickN = 0;
  private lastFaces: { faceLandmarks: Lm[][]; faceBlendshapes: { categories: { categoryName: string; score: number }[] }[] } | null = null;
  private prevPts: Record<PlayerId, Lm[] | undefined> = { p1: undefined, p2: undefined };
  private mode: AssignMode = 'single';
  loaded = false;

  async load(): Promise<void> {
    const base = import.meta.env.BASE_URL; // '/' en dev, '/aurabattle/' sur GitHub Pages
    let fileset;
    try {
      fileset = await FilesetResolver.forVisionTasks(`${base}mediapipe-wasm`);
    } catch {
      fileset = await FilesetResolver.forVisionTasks(
        'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.18/wasm',
      );
    }
    const mk = (model: string, delegate: 'GPU' | 'CPU') => ({
      baseOptions: { modelAssetPath: `${base}models/${model}`, delegate },
      runningMode: 'VIDEO' as const,
    });
    try {
      [this.hand, this.pose, this.face] = await Promise.all([
        HandLandmarker.createFromOptions(fileset, { ...mk('hand_landmarker.task', 'GPU'), numHands: 4, minHandDetectionConfidence: 0.45, minHandPresenceConfidence: 0.4 }),
        PoseLandmarker.createFromOptions(fileset, { ...mk('pose_landmarker.task', 'GPU'), numPoses: 2, minPoseDetectionConfidence: 0.45 }),
        FaceLandmarker.createFromOptions(fileset, { ...mk('face_landmarker.task', 'GPU'), numFaces: 2, outputFaceBlendshapes: true, minFaceDetectionConfidence: 0.4 }),
      ]);
    } catch {
      [this.hand, this.pose, this.face] = await Promise.all([
        HandLandmarker.createFromOptions(fileset, { ...mk('hand_landmarker.task', 'CPU'), numHands: 4, minHandDetectionConfidence: 0.45, minHandPresenceConfidence: 0.4 }),
        PoseLandmarker.createFromOptions(fileset, { ...mk('pose_landmarker.task', 'CPU'), numPoses: 2, minPoseDetectionConfidence: 0.45 }),
        FaceLandmarker.createFromOptions(fileset, { ...mk('face_landmarker.task', 'CPU'), numFaces: 2, outputFaceBlendshapes: true, minFaceDetectionConfidence: 0.4 }),
      ]);
    }
    this.loaded = true;
  }

  attach(video: HTMLVideoElement, overlay: HTMLCanvasElement, mode: AssignMode) {
    this.video = video;
    this.mode = mode;
    const ctx = overlay.getContext('2d');
    this.overlay = ctx ?? undefined;
    const fit = () => {
      overlay.width = video.videoWidth || video.clientWidth;
      overlay.height = video.videoHeight || video.clientHeight;
    };
    video.addEventListener('loadedmetadata', fit);
    fit();
  }

  start(onFrame: (f: FrameData) => void) {
    if (this.running) return;
    this.running = true;
    const step = () => {
      if (!this.running) return;
      this.raf = requestAnimationFrame(step);
      const now = performance.now();
      if (now - this.lastRun < this.minGap) return;
      this.lastRun = now;
      const v = this.video;
      if (!v || v.readyState < 2 || !v.videoWidth) return;

      const t0 = performance.now();
      const frame = this.detect(v, now);
      // throttle adaptatif : si l'inférence est lente, on baisse la cadence
      const cost = performance.now() - t0;
      this.minGap = this.minGap * 0.9 + Math.min(160, Math.max(40, cost * 1.6)) * 0.1;
      onFrame(frame);
      this.draw(frame, v);
    };
    this.raf = requestAnimationFrame(step);
  }

  stop() {
    this.running = false;
    cancelAnimationFrame(this.raf);
    this.overlay?.clearRect(0, 0, 9999, 9999);
  }

  private side(x: number): PlayerId {
    // image x>0.5 = moitié droite de l'image = moitié GAUCHE de l'écran (vidéo mirroirée)
    return x > 0.5 ? 'p1' : 'p2';
  }

  private detect(v: HTMLVideoElement, t: number): FrameData {
    this.tickN++;
    const handsRes = this.hand?.detectForVideo(v, t);
    const posesRes = this.pose?.detectForVideo(v, t);
    const faceEvery = this.minGap > 80 ? 6 : 3; // visage moins souvent si lent
    if (this.tickN % faceEvery === 0) {
      try { this.lastFaces = (this.face?.detectForVideo(v, t) as typeof this.lastFaces) ?? null; }
      catch { /* frame irrégulière */ }
    }

    const pick = (x: number): PlayerId => (this.mode === 'split' ? this.side(x) : 'p1');
    const hands: HandObs[] = [];
    const poses: PoseObs[] = [];
    const faces: FaceObs[] = [];
    const motion: Record<PlayerId, number> = { p1: 0, p2: 0 };

    for (const lms of (posesRes?.landmarks ?? []) as Lm[][]) {
      const cx = (lms[11].x + lms[12].x) / 2;
      const player = pick(cx);
      poses.push({ player, poses: classifyPose(lms), lms });
      // mouvement = déplacement moyen des points clés
      const prev = this.prevPts[player];
      if (prev && prev.length === lms.length) {
        let acc = 0;
        const idx = [0, 11, 12, 13, 14, 15, 16, 23, 24];
        for (const i of idx) acc += Math.hypot(lms[i].x - prev[i].x, lms[i].y - prev[i].y);
        motion[player] = Math.min(1, (acc / idx.length) * 26);
      }
      this.prevPts[player] = lms;
    }
    if (!poses.length) { this.prevPts.p1 = undefined; this.prevPts.p2 = undefined; }

    for (const lms of (handsRes?.landmarks ?? []) as Lm[][]) {
      const g = classifyHand(lms);
      hands.push({ player: pick(lms[0].x), gesture: g, cx: lms[0].x, cy: lms[0].y, lms });
      const p = pick(lms[0].x);
      motion[p] = Math.min(1, motion[p] + 0.04);
    }

    const fr = this.lastFaces;
    if (fr) {
      fr.faceLandmarks.forEach((lms, i) => {
        if (!lms?.length) return;
        const cats = fr.faceBlendshapes?.[i]?.categories ?? [];
        faces.push({ player: pick(lms[1]?.x ?? 0.5), exprs: classifyFace(cats), lms });
      });
    }

    return { t, hands, poses, faces, motion };
  }

  private draw(frame: FrameData, v: HTMLVideoElement) {
    const ctx = this.overlay;
    if (!ctx) return;
    const c = ctx.canvas;
    const w = c.width, h = c.height;
    ctx.clearRect(0, 0, w, h);
    // coords mirroirées comme la vidéo affichée
    const X = (l: Lm) => (1 - l.x) * w;
    const Y = (l: Lm) => l.y * h;

    ctx.lineCap = 'round';

    for (const p of frame.poses) {
      ctx.strokeStyle = COLORS[p.player] + 'aa';
      ctx.lineWidth = Math.max(2, w / 400);
      for (const [a, b] of POSE_BONES) {
        if (!p.lms[a] || !p.lms[b]) continue;
        ctx.beginPath(); ctx.moveTo(X(p.lms[a]), Y(p.lms[a])); ctx.lineTo(X(p.lms[b]), Y(p.lms[b])); ctx.stroke();
      }
    }
    for (const hd of frame.hands) {
      ctx.strokeStyle = COLORS[hd.player];
      ctx.lineWidth = Math.max(1.5, w / 500);
      ctx.shadowColor = COLORS[hd.player];
      ctx.shadowBlur = 8;
      for (const [a, b] of HAND_BONES) {
        ctx.beginPath(); ctx.moveTo(X(hd.lms[a]), Y(hd.lms[a])); ctx.lineTo(X(hd.lms[b]), Y(hd.lms[b])); ctx.stroke();
      }
      ctx.shadowBlur = 0;
      ctx.fillStyle = '#ffffff';
      for (const i of [4, 8, 12, 16, 20]) {
        ctx.beginPath(); ctx.arc(X(hd.lms[i]), Y(hd.lms[i]), Math.max(2, w / 300), 0, Math.PI * 2); ctx.fill();
      }
    }
    for (const f of frame.faces) {
      ctx.strokeStyle = COLORS[f.player] + '55';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      FACE_OVAL.forEach((i, k) => {
        const l = f.lms[i];
        if (!l) return;
        if (k === 0) ctx.moveTo(X(l), Y(l)); else ctx.lineTo(X(l), Y(l));
      });
      ctx.closePath(); ctx.stroke();
    }
  }
}
