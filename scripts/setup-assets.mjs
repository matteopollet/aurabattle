// Copies MediaPipe wasm runtime + downloads .task models into public/
// so the app is self-contained (works on LAN / offline once installed).
import { cpSync, existsSync, mkdirSync, createWriteStream } from 'node:fs';
import { get } from 'node:https';
import { join } from 'node:path';

const root = new URL('..', import.meta.url).pathname;
const pub = join(root, 'public');
const wasmDest = join(pub, 'mediapipe-wasm');
const modelsDest = join(pub, 'models');
mkdirSync(modelsDest, { recursive: true });

// 1) wasm runtime shipped inside the npm package
const wasmSrc = join(root, 'node_modules/@mediapipe/tasks-vision/wasm');
if (existsSync(wasmSrc)) {
  cpSync(wasmSrc, wasmDest, { recursive: true });
  console.log('[assets] wasm copié ->', wasmDest);
} else {
  console.warn('[assets] wasm introuvable, le CDN sera utilisé en fallback');
}

// 2) .task models (Google CDN). Skip download if already present.
const MODELS = {
  'hand_landmarker.task':
    'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task',
  'pose_landmarker.task':
    'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task',
  'face_landmarker.task':
    'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task',
};

const download = (url, dest) =>
  new Promise((resolve) => {
    const file = createWriteStream(dest);
    get(url, (res) => {
      if (res.statusCode !== 200) {
        console.warn(`[assets] échec ${url} (${res.statusCode}) — fallback CDN au runtime`);
        file.close();
        resolve();
        return;
      }
      res.pipe(file);
      file.on('finish', () => file.close(resolve));
    }).on('error', () => {
      console.warn(`[assets] erreur réseau ${url} — fallback CDN au runtime`);
      file.close();
      resolve();
    });
  });

for (const [name, url] of Object.entries(MODELS)) {
  const dest = join(modelsDest, name);
  if (existsSync(dest)) {
    console.log('[assets] déjà présent:', name);
    continue;
  }
  console.log('[assets] téléchargement:', name);
  await download(url, dest);
}
