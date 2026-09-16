import { defineConfig } from 'vite';
import basicSsl from '@vitejs/plugin-basic-ssl';

// HTTP par défaut (localhost = contexte sécurisé, la caméra marche).
// AURA_SSL=1 → HTTPS auto-signé, requis pour la caméra sur mobile en LAN.
export default defineConfig({
  plugins: process.env.AURA_SSL ? [basicSsl()] : [],
  server: {
    host: true,
    port: 5174,
  },
});
