import Peer from 'peerjs';
import type { DataConnection, MediaConnection } from 'peerjs';

const PREFIX = 'aurabattle-v1-';
const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const makeCode = () => Array.from({ length: 4 }, () => ALPHABET[Math.floor(Math.random() * ALPHABET.length)]).join('');

export type NetMsg =
  | { t: 'name'; v: string }
  | { t: 'start'; at: number }
  | { t: 'mv'; id: string; total: number }
  | { t: 'score'; v: number }
  | { t: 'end'; host: number; guest: number }
  | { t: 'rematch' }
  | { t: 'bye' };

export class OnlineRoom {
  peer?: Peer;
  conn?: DataConnection;
  call?: MediaConnection;
  isHost = false;

  onmsg: (m: NetMsg) => void = () => {};
  onstream: (s: MediaStream) => void = () => {};
  onstatus: (s: string) => void = () => {};
  onpeerclose: () => void = () => {};

  private wireStream(stream: MediaStream) {
    this.peer!.on('call', (c) => {
      c.answer(stream);
      c.on('stream', (s) => this.onstream(s));
    });
  }

  private wireConn(conn: DataConnection) {
    this.conn = conn;
    conn.on('data', (d) => this.onmsg(d as NetMsg));
    conn.on('close', () => this.onpeerclose());
    conn.on('error', () => this.onpeerclose());
  }

  /** Crée une room, retourne le code à 4 lettres. */
  host(stream: MediaStream): Promise<string> {
    return new Promise((resolve, reject) => {
      const tryCode = () => {
        const code = makeCode();
        const peer = new Peer(PREFIX + code);
        peer.on('open', () => {
          this.peer = peer;
          this.isHost = true;
          this.wireStream(stream);
          peer.on('connection', (conn) => {
            this.wireConn(conn);
            conn.on('open', () => {
              this.onstatus('connected');
              this.call = peer.call(conn.peer, stream);
              this.call.on('stream', (s) => this.onstream(s));
            });
          });
          resolve(code);
        });
        peer.on('error', (e) => {
          if (e.type === 'unavailable-id') { peer.destroy(); tryCode(); }
          else reject(e);
        });
      };
      tryCode();
    });
  }

  join(code: string, stream: MediaStream): Promise<void> {
    return new Promise((resolve, reject) => {
      const peer = new Peer();
      const timeout = setTimeout(() => reject(new Error('timeout')), 12000);
      peer.on('open', () => {
        this.peer = peer;
        this.wireStream(stream);
        const conn = peer.connect(PREFIX + code.toUpperCase(), { reliable: true });
        this.wireConn(conn);
        conn.on('open', () => {
          this.onstatus('connected');
          this.call = peer.call(PREFIX + code.toUpperCase(), stream);
          this.call.on('stream', (s) => this.onstream(s));
          clearTimeout(timeout);
          resolve();
        });
        conn.on('error', () => { clearTimeout(timeout); reject(new Error('connexion échouée')); });
      });
      peer.on('error', (e) => { clearTimeout(timeout); reject(e); });
    });
  }

  send(m: NetMsg) {
    try { this.conn?.send(m); } catch { /* peer parti */ }
  }

  destroy() {
    try { this.conn?.close(); } catch { /* noop */ }
    try { this.call?.close(); } catch { /* noop */ }
    try { this.peer?.destroy(); } catch { /* noop */ }
  }
}
