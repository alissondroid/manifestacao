// Cliente WebSocket com reconexão automática.

export class Net {
  constructor(handlers) {
    this.h = handlers; // { open, close, message(msg) }
    this.ws = null;
    this.retry = 0;
    this.joinMsg = null; // reenviado a cada (re)conexão
    this.connected = false;
  }

  connect() {
    const proto = location.protocol === 'https:' ? 'wss' : 'ws';
    const ws = new WebSocket(`${proto}://${location.host}/ws`);
    this.ws = ws;

    ws.onopen = () => {
      this.retry = 0;
      this.connected = true;
      this.h.open?.();
      if (this.joinMsg) this.send(this.joinMsg);
    };
    ws.onmessage = (ev) => {
      let msg;
      try { msg = JSON.parse(ev.data); } catch { return; }
      this.h.message?.(msg);
    };
    ws.onclose = () => {
      this.connected = false;
      this.h.close?.();
      const wait = Math.min(8000, 500 * 2 ** this.retry++);
      setTimeout(() => this.connect(), wait);
    };
    ws.onerror = () => ws.close();
  }

  join(payload) {
    this.enter({ t: 'join', ...payload });
  }

  watch() {
    this.enter({ t: 'watch' });
  }

  enter(msg) {
    this.joinMsg = msg;
    if (this.connected) this.send(msg);
  }

  /** Fecha e reabre o socket (o cookie de sessão é lido no handshake). */
  reconnect() {
    this.retry = 0;
    this.ws?.close();
  }

  send(obj) {
    if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(obj));
  }
}
