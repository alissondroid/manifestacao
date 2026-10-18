// Cliente WebSocket com reconexão automática.

// Fechamentos que o servidor faz de propósito: reconectar só repetiria o problema (duas abas da mesma
// conta se expulsariam em ciclo; um banido ficaria batendo no servidor). Quem decide voltar é o usuário.
export const FATAL_CLOSE = {
  4000: 'Você entrou em outro lugar (outra aba ou aparelho). Recarregue a página para voltar a esta.',
  4001: 'Sua conta foi excluída.',
  4003: 'Seu acesso foi bloqueado.',
};

export class Net {
  constructor(handlers, path = '/ws') {
    this.path = path;
    this.h = handlers; // { open, close, message(msg) }
    this.ws = null;
    this.retry = 0;
    this.joinMsg = null; // reenviado a cada (re)conexão
    this.connected = false;
    this.stopped = false; // o servidor encerrou de propósito: não reconecta sozinho
  }

  connect() {
    const proto = location.protocol === 'https:' ? 'wss' : 'ws';
    const ws = new WebSocket(`${proto}://${location.host}${this.path}`);
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
    ws.onclose = (ev) => {
      this.connected = false;
      const fatal = FATAL_CLOSE[ev?.code];
      this.h.close?.(ev?.code, fatal);
      if (fatal) this.stopped = true;
      if (this.stopped) return;
      // espera exponencial com jitter: depois de um reinício do servidor, todos voltam espalhados no tempo
      const base = Math.min(8000, 500 * 2 ** this.retry++);
      setTimeout(() => this.connect(), base * (0.5 + Math.random() * 0.5));
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
    if (this.stopped) { this.stopped = false; this.connect(); return; }
    this.ws?.close();
  }

  /** Página fechando ou indo para o cache: avisa o servidor já, em vez de esperar o batimento notar. */
  leave() {
    this.stopped = true;
    this.ws?.close(1000);
  }

  send(obj) {
    if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(obj));
  }
}
