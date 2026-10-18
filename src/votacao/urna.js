import { criarUrna, PARTIDOS } from '../../shared/votacao.js';

// A urna na tela: teclado numérico, BRANCO, CORRIGE e CONFIRMA, com os sons. Os votos ficam só na memória
// desta tela e somem quando ela fecha: nada é enviado a ninguém.

let ctx = null;
function beep(freq, ms, vol = 0.12) {
  try {
    ctx ||= new (window.AudioContext || window.webkitAudioContext)();
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = 'square';
    o.frequency.value = freq;
    g.gain.setValueAtTime(vol, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + ms / 1000);
    o.connect(g).connect(ctx.destination);
    o.start();
    o.stop(ctx.currentTime + ms / 1000);
  } catch { /* sem áudio */ }
}

const el = (tag, cls, html) => { const n = document.createElement(tag); if (cls) n.className = cls; if (html != null) n.innerHTML = html; return n; };
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

const SILHUETA = (cor) => `<svg viewBox="0 0 60 72" aria-hidden="true"><rect width="60" height="72" fill="${cor}22"/><circle cx="30" cy="26" r="14" fill="${cor}"/><path d="M4 72c2-20 14-28 26-28s24 8 26 28z" fill="${cor}"/></svg>`;

/** Abre a urna. `onDone()` é chamado quando o último cargo é confirmado. Retorna `close()`. */
export function openUrna(root, { onDone }) {
  const urna = criarUrna();
  root.replaceChildren();
  root.hidden = false;

  const screen = el('div', 'urna-screen');
  const keys = el('div', 'urna-keys');
  const body = el('div', 'urna-body');
  body.append(screen, keys);
  const note = el('p', 'urna-note', 'Simulador educativo · candidatos e partidos fictícios · seu voto não é guardado');
  root.append(body, note);

  const draw = (v) => {
    if (v.done) {
      screen.innerHTML = '<div class="urna-fim"><b>FIM</b><span>VOTOU</span></div>';
      return;
    }
    const slots = Array.from({ length: v.tamanho }, (_, i) => `<i class="${v.digitos[i] ? 'on' : ''}">${v.digitos[i] ?? ''}</i>`).join('');
    let info = '';
    if (v.status === 'candidato') {
      const cor = v.partido?.cor ?? '#667';
      info = `<div class="u-cand"><div class="u-foto">${SILHUETA(cor)}</div>
        <dl><dt>Nome</dt><dd>${esc(v.candidato.nome)}</dd><dt>Partido</dt><dd>${esc(v.partido?.sigla ?? '')} · ${esc(v.partido?.nome ?? '')}</dd></dl></div>`;
    } else if (v.status === 'nulo') {
      info = '<div class="u-aviso"><b>NÚMERO ERRADO</b><span>VOTO NULO</span></div>';
    } else if (v.status === 'branco') {
      info = '<div class="u-aviso"><b>VOTO EM BRANCO</b></div>';
    }
    screen.innerHTML = `
      <header><small>SEU VOTO PARA</small><b>${esc(v.cargo)}</b><em>${v.posicao}/${v.total}</em></header>
      <div class="u-digits ${v.branco ? 'off' : ''}">${slots}</div>
      ${info}
      <footer>
        <span>Aperte a tecla:</span>
        <span><b class="g">VERDE</b> para CONFIRMAR este voto</span>
        <span><b class="o">LARANJA</b> para REINICIAR este voto</span>
        ${v.digitos === '' && !v.branco ? '<span><b class="w">BRANCO</b> para votar em BRANCO</span>' : ''}
      </footer>`;
  };

  const act = (fn, tone = 880) => {
    const v = fn();
    draw(v);
    if (v.done) {
      beep(520, 1400, 0.16);
      setTimeout(() => { close(); onDone?.(); }, 2600);
    } else if (v.confirmou) beep(660, 220);
    else beep(tone, 70);
  };

  for (const d of ['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', '']) {
    if (d === '') { keys.append(el('span', 'k-empty')); continue; }
    const b = el('button', 'k', d);
    b.type = 'button';
    b.onclick = () => act(() => urna.digita(d));
    keys.append(b);
  }
  const mk = (cls, text, fn) => { const b = el('button', `k big ${cls}`, text); b.type = 'button'; b.onclick = fn; keys.append(b); };
  mk('w', 'BRANCO', () => act(() => urna.brancoBtn(), 700));
  mk('o', 'CORRIGE', () => act(() => urna.corrige(), 600));
  mk('g', 'CONFIRMA', () => act(() => urna.confirma(), 880));

  const onKey = (e) => {
    if (e.key >= '0' && e.key <= '9') act(() => urna.digita(e.key));
    else if (e.key === 'Backspace' || e.key === 'Delete') act(() => urna.corrige(), 600);
    else if (e.key === 'Enter') act(() => urna.confirma());
    else if (e.key === 'b' || e.key === 'B') act(() => urna.brancoBtn(), 700);
    else return;
    e.preventDefault();
    e.stopPropagation();
  };
  window.addEventListener('keydown', onKey, true);
  function close() {
    window.removeEventListener('keydown', onKey, true);
    root.hidden = true;
    root.replaceChildren();
  }
  draw(urna.view());
  return close;
}

export { PARTIDOS };
