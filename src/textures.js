import * as THREE from 'three';
import { SIDES } from '../shared/config.js';

// Todas as texturas são desenhadas em canvas (sem arquivos de imagem).

export function canvasTexture(w, h, draw, { repeat = [1, 1], tile = true, aniso = 8 } = {}) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = aniso;
  if (tile) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(...repeat);
  return t;
}

const rnd = (a, b) => a + Math.random() * (b - a);

function speckle(ctx, w, h, base, spread, count, size = 2) {
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, w, h);
  for (let i = 0; i < count; i++) {
    const v = Math.floor(128 + (Math.random() - 0.5) * spread);
    ctx.fillStyle = `rgba(${v},${v},${v},0.3)`;
    ctx.fillRect(Math.random() * w, Math.random() * h, size, size);
  }
}

// ---------- Chão ----------

export function asphaltTexture(repeat) {
  return canvasTexture(512, 512, (ctx, w, h) => {
    speckle(ctx, w, h, '#5d6064', 90, 14000, 2);
    for (let i = 0; i < 40; i++) { // manchas de desgaste
      ctx.fillStyle = `rgba(${Math.random() < 0.5 ? '20,20,22' : '90,90,94'},0.07)`;
      ctx.beginPath();
      ctx.ellipse(Math.random() * w, Math.random() * h, rnd(20, 80), rnd(10, 40), Math.random() * 3, 0, 6.3);
      ctx.fill();
    }
    ctx.strokeStyle = 'rgba(15,15,16,0.5)'; // rachaduras
    ctx.lineWidth = 1;
    for (let i = 0; i < 7; i++) {
      let x = Math.random() * w;
      let y = Math.random() * h;
      ctx.beginPath();
      ctx.moveTo(x, y);
      for (let k = 0; k < 8; k++) { x += rnd(-18, 18); y += rnd(6, 22); ctx.lineTo(x, y); }
      ctx.stroke();
    }
  }, { repeat });
}

/** Faixa exclusiva de ônibus: asfalto pintado de vermelho-terra. */
export function busLaneTexture(repeat) {
  return canvasTexture(512, 512, (ctx, w, h) => {
    speckle(ctx, w, h, '#9b3a2e', 70, 12000, 2);
    for (let i = 0; i < 30; i++) {
      ctx.fillStyle = 'rgba(40,20,18,0.07)';
      ctx.beginPath();
      ctx.ellipse(Math.random() * w, Math.random() * h, rnd(20, 70), rnd(10, 30), Math.random() * 3, 0, 6.3);
      ctx.fill();
    }
  }, { repeat });
}

/** Calçada de mosaico preto e branco, como a da Paulista. Cada tile = 4 m. */
export function mosaicTexture(repeat) {
  return canvasTexture(256, 256, (ctx, w, h) => {
    ctx.fillStyle = '#dedad1';
    ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = '#2f2f31';
    ctx.lineWidth = 22;
    ctx.lineCap = 'butt';
    for (let band = 0; band < 4; band++) {
      ctx.beginPath();
      for (let x = 0; x <= w; x += 4) {
        const y = band * 64 + 32 + Math.sin((x / w) * Math.PI * 4) * 16;
        if (x === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      }
      ctx.stroke();
    }
    for (let i = 0; i < 5000; i++) { // sujeira e desgaste
      ctx.fillStyle = `rgba(${Math.random() < 0.5 ? '255,255,255' : '0,0,0'},0.05)`;
      ctx.fillRect(Math.random() * w, Math.random() * h, 2, 2);
    }
  }, { repeat });
}

export function concreteTexture(repeat, base = '#a9a69f') {
  return canvasTexture(256, 256, (ctx, w, h) => {
    speckle(ctx, w, h, base, 60, 6000, 2);
    ctx.strokeStyle = 'rgba(40,40,40,0.18)';
    ctx.lineWidth = 2;
    ctx.strokeRect(0, 0, w, h);
  }, { repeat });
}

export function grassTexture(repeat) {
  return canvasTexture(256, 256, (ctx, w, h) => {
    speckle(ctx, w, h, '#5f8a42', 80, 9000, 3);
    for (let i = 0; i < 900; i++) {
      ctx.fillStyle = `hsla(${rnd(70, 110)},45%,${rnd(25, 45)}%,0.35)`;
      ctx.fillRect(Math.random() * w, Math.random() * h, 1.5, rnd(3, 7));
    }
  }, { repeat });
}

// ---------- Fachadas ----------
// Cada tile cobre 8 m de largura por 7,2 m de altura (2 pavimentos, 2 vãos).

function facadeDraw(kind, tint) {
  return (ctx, w, h) => {
    if (kind === 'glass') {
      const g = ctx.createLinearGradient(0, 0, w, h);
      g.addColorStop(0, '#6aa0b8');
      g.addColorStop(0.5, '#3d7893');
      g.addColorStop(1, '#2b5870');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);
      for (let fy = 0; fy < 2; fy++) {
        for (let fx = 0; fx < 2; fx++) {
          const x = fx * (w / 2);
          const y = fy * (h / 2);
          ctx.fillStyle = `rgba(${Math.random() < 0.5 ? '255,255,255' : '0,20,40'},${rnd(0.04, 0.16)})`;
          ctx.fillRect(x + 3, y + 5, w / 2 - 6, h / 2 - 22);
          ctx.fillStyle = 'rgba(210,225,235,0.5)'; // reflexo do céu
          ctx.fillRect(x + 3, y + 5, w / 2 - 6, 5);
        }
      }
      ctx.fillStyle = '#26323a'; // faixas de piso
      for (let i = 0; i < 2; i++) ctx.fillRect(0, i * (h / 2) + h / 2 - 16, w, 16);
      ctx.fillStyle = '#1d262c'; // montantes
      for (let i = 0; i <= 2; i++) ctx.fillRect(i * (w / 2) - 1.5, 0, 3, h);
    } else if (kind === 'apartment') {
      ctx.fillStyle = tint;
      ctx.fillRect(0, 0, w, h);
      speckle(ctx, w, h, tint, 30, 3500, 2);
      for (let fy = 0; fy < 2; fy++) {
        const y = fy * (h / 2);
        ctx.fillStyle = '#d9d6cf'; // laje da varanda
        ctx.fillRect(0, y + h / 2 - 14, w, 14);
        ctx.fillStyle = 'rgba(30,40,50,0.35)'; // guarda-corpo
        ctx.fillRect(0, y + h / 2 - 44, w, 28);
        for (let fx = 0; fx < 2; fx++) {
          const x = fx * (w / 2) + 20;
          ctx.fillStyle = '#e9e9e6';
          ctx.fillRect(x - 3, y + 14, w / 2 - 34, h / 2 - 62);
          ctx.fillStyle = Math.random() < 0.3 ? '#e8d9a0' : '#27394d';
          ctx.fillRect(x, y + 17, w / 2 - 40, h / 2 - 68);
          ctx.fillStyle = 'rgba(255,255,255,0.18)';
          ctx.fillRect(x, y + 17, (w / 2 - 40) / 2, h / 2 - 68);
        }
      }
    } else if (kind === 'office') {
      // escritório dos anos 70: concreto bege com faixas de janelas estreitas
      speckle(ctx, w, h, tint, 35, 5000, 2);
      for (let fy = 0; fy < 2; fy++) {
        const y = fy * (h / 2);
        for (let i = 0; i < 6; i++) {
          const x = 6 + i * (w / 6);
          ctx.fillStyle = '#2b3640';
          ctx.fillRect(x, y + 20, w / 6 - 14, h / 2 - 40);
          ctx.fillStyle = `rgba(${Math.random() < 0.5 ? '200,215,225' : '20,30,40'},${rnd(0.08, 0.25)})`;
          ctx.fillRect(x, y + 20, w / 6 - 14, h / 2 - 40);
          ctx.fillStyle = 'rgba(0,0,0,0.25)';
          ctx.fillRect(x, y + 20, w / 6 - 14, 3);
        }
        ctx.fillStyle = 'rgba(0,0,0,0.08)';
        ctx.fillRect(0, y + h / 2 - 8, w, 8);
      }
    } else if (kind === 'stripes') {
      // residencial com faixas coloridas entre os andares
      speckle(ctx, w, h, '#ecebe6', 25, 3000, 2);
      for (let fy = 0; fy < 2; fy++) {
        const y = fy * (h / 2);
        ctx.fillStyle = tint;
        ctx.fillRect(0, y + h / 2 - 26, w, 26);
        for (let fx = 0; fx < 3; fx++) {
          const x = fx * (w / 3) + 10;
          ctx.fillStyle = Math.random() < 0.25 ? '#d8cfa8' : '#2c3b4b';
          ctx.fillRect(x, y + 18, w / 3 - 20, h / 2 - 56);
          ctx.fillStyle = 'rgba(255,255,255,0.2)';
          ctx.fillRect(x, y + 18, (w / 3 - 20) / 2, h / 2 - 56);
        }
      }
    } else { // classic
      ctx.fillStyle = tint;
      ctx.fillRect(0, 0, w, h);
      speckle(ctx, w, h, tint, 40, 5000, 2);
      for (let fy = 0; fy < 2; fy++) {
        for (let fx = 0; fx < 2; fx++) {
          const x = fx * (w / 2) + 26;
          const y = fy * (h / 2) + 18;
          ctx.fillStyle = '#f1efe9';
          ctx.fillRect(x - 5, y - 5, w / 2 - 42, h / 2 - 40);
          ctx.fillStyle = '#233447';
          ctx.fillRect(x, y, w / 2 - 52, h / 2 - 50);
          ctx.fillStyle = '#f1efe9';
          ctx.fillRect(x + (w / 2 - 52) / 2 - 1, y, 2, h / 2 - 50);
        }
        ctx.fillStyle = 'rgba(255,255,255,0.35)';
        ctx.fillRect(0, fy * (h / 2), w, 4);
      }
    }
  };
}

const facadeCache = new Map();
export function facadeTexture(kind, tint = '#d8d2c6') {
  const key = `${kind}${tint}`;
  if (!facadeCache.has(key)) facadeCache.set(key, canvasTexture(512, 460, (ctx, w, h) => { ctx.scale(2, 2); facadeDraw(kind, tint)(ctx, w / 2, h / 2); }));
  return facadeCache.get(key);
}

/** Térreo comercial: vitrines, letreiros e toldos. Tile = 12 m × 6 m. */
export function shopfrontTexture() {
  const brands = ['#c0392b', '#1f6f9c', '#e8a317', '#2d8a5b', '#6b3fa0', '#222831'];
  return canvasTexture(512, 256, (ctx, w, h) => {
    ctx.fillStyle = '#cfcac0';
    ctx.fillRect(0, 0, w, h);
    const n = 3;
    for (let i = 0; i < n; i++) {
      const x = (i * w) / n;
      const bw = w / n;
      ctx.fillStyle = brands[Math.floor(Math.random() * brands.length)];
      ctx.fillRect(x + 6, 18, bw - 12, 46); // letreiro
      ctx.fillStyle = 'rgba(255,255,255,0.85)';
      ctx.fillRect(x + 24, 34, bw - 48, 12);
      ctx.fillStyle = '#1b2a36'; // vitrine
      ctx.fillRect(x + 8, 72, bw - 16, h - 90);
      ctx.fillStyle = 'rgba(180,215,235,0.3)';
      ctx.fillRect(x + 8, 72, (bw - 16) / 2, h - 90);
      ctx.fillStyle = '#10181f'; // porta
      ctx.fillRect(x + bw / 2 - 14, 92, 28, h - 110);
    }
  });
}

export function ledScreenTexture() {
  return canvasTexture(512, 288, (ctx, w, h) => {
    const g = ctx.createLinearGradient(0, 0, w, h);
    g.addColorStop(0, '#0b1d3a');
    g.addColorStop(1, '#3a0f2e');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#fafafa';
    ctx.textAlign = 'center';
    ctx.font = '800 54px system-ui, sans-serif';
    ctx.fillText('AVENIDA PAULISTA', w / 2, h / 2 - 8);
    ctx.font = '600 28px system-ui, sans-serif';
    ctx.fillStyle = '#fcd34d';
    ctx.fillText('ELEIÇÕES 2026 · AO VIVO', w / 2, h / 2 + 40);
  }, { tile: false });
}


// ---------- Sinalização pintada e totens ----------

/** Bicicleta e seta brancas pintadas na ciclovia (fundo transparente). */
export function bikeSymbolTexture() {
  return canvasTexture(256, 256, (ctx, w) => {
    ctx.clearRect(0, 0, w, w);
    ctx.strokeStyle = '#f1f1ec';
    ctx.fillStyle = '#f1f1ec';
    ctx.lineWidth = 9;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    for (const cx of [70, 186]) { ctx.beginPath(); ctx.arc(cx, 150, 40, 0, Math.PI * 2); ctx.stroke(); }
    ctx.beginPath();
    ctx.moveTo(70, 150); ctx.lineTo(112, 92); ctx.lineTo(170, 92); ctx.lineTo(186, 150);
    ctx.moveTo(112, 92); ctx.lineTo(128, 150); ctx.lineTo(70, 150);
    ctx.moveTo(128, 150); ctx.lineTo(170, 92);
    ctx.moveTo(104, 78); ctx.lineTo(126, 78);
    ctx.moveTo(170, 92); ctx.lineTo(164, 70); ctx.lineTo(182, 66);
    ctx.stroke();
    // seta do sentido
    ctx.beginPath();
    ctx.moveTo(128, 6); ctx.lineTo(108, 34); ctx.lineTo(121, 34); ctx.lineTo(121, 56); ctx.lineTo(135, 56); ctx.lineTo(135, 34); ctx.lineTo(148, 34);
    ctx.closePath();
    ctx.fill();
  }, { tile: false });
}

/** Texto alongado pintado no asfalto (ex.: ÔNIBUS). */
export function roadTextTexture(text) {
  return canvasTexture(512, 256, (ctx, w, h) => {
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = 'rgba(240,240,235,0.92)';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = '800 150px "Arial Narrow", Arial, sans-serif';
    ctx.save();
    ctx.translate(w / 2, h / 2);
    ctx.scale(0.9, 1.4);
    ctx.fillText(text, 0, 6);
    ctx.restore();
  }, { tile: false });
}

/** Totem preto de esquina com o nome da rua na vertical, como os da Paulista. */
export function streetTotemTexture(name) {
  return canvasTexture(128, 1024, (ctx, w, h) => {
    ctx.fillStyle = '#1b1c1e';
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#f2f2ee';
    ctx.textAlign = 'center';
    ctx.font = '700 40px system-ui, sans-serif';
    ctx.fillText('↑', w / 2, 52);
    ctx.font = '600 17px system-ui, sans-serif';
    ctx.fillText('Próxima', w / 2, 78);
    ctx.fillText('Rua', w / 2, 98);
    ctx.save();
    ctx.translate(w / 2 + 16, 720);
    ctx.rotate(-Math.PI / 2);
    ctx.textAlign = 'left';
    ctx.font = '700 52px system-ui, sans-serif';
    ctx.fillText(name, 0, 0, 590);
    ctx.restore();
    // placa de proibido retornar
    ctx.fillStyle = '#ffffff';
    ctx.beginPath(); ctx.arc(w / 2, 840, 38, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#d0181f'; ctx.lineWidth = 8;
    ctx.beginPath(); ctx.arc(w / 2, 840, 34, 0, Math.PI * 2); ctx.stroke();
    ctx.strokeStyle = '#111'; ctx.lineWidth = 6;
    ctx.beginPath(); ctx.moveTo(w / 2 - 10, 860); ctx.lineTo(w / 2 - 10, 832); ctx.arc(w / 2, 832, 10, Math.PI, 0); ctx.lineTo(w / 2 + 10, 850); ctx.stroke();
    ctx.strokeStyle = '#d0181f'; ctx.lineWidth = 7;
    ctx.beginPath(); ctx.moveTo(w / 2 - 24, 816); ctx.lineTo(w / 2 + 24, 864); ctx.stroke();
  }, { tile: false });
}

// ---------- Bandeiras e estampas ----------

const star = (ctx, cx, cy, r, color) => {
  ctx.fillStyle = color;
  ctx.beginPath();
  for (let i = 0; i < 10; i++) {
    const rad = i % 2 ? r * 0.4 : r;
    const a = (Math.PI / 5) * i - Math.PI / 2;
    ctx.lineTo(cx + Math.cos(a) * rad, cy + Math.sin(a) * rad);
  }
  ctx.closePath();
  ctx.fill();
};

export function drawBrazilFlag(ctx, w, h) {
  ctx.fillStyle = '#009c3b';
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = '#ffdf00';
  ctx.beginPath();
  ctx.moveTo(w * 0.06, h / 2);
  ctx.lineTo(w / 2, h * 0.1);
  ctx.lineTo(w * 0.94, h / 2);
  ctx.lineTo(w / 2, h * 0.9);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = '#002776';
  ctx.beginPath();
  ctx.arc(w / 2, h / 2, h * 0.27, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = h * 0.045;
  ctx.beginPath();
  ctx.arc(w / 2, h * 0.78, h * 0.5, Math.PI * 1.2, Math.PI * 1.8);
  ctx.stroke();
  for (let i = 0; i < 14; i++) {
    ctx.fillStyle = '#fff';
    ctx.fillRect(w / 2 + rnd(-0.2, 0.2) * h, h / 2 + rnd(-0.17, 0.14) * h, 1.6, 1.6);
  }
}

/** Círculo-A anarquista. */
function circleA(ctx, cx, cy, r, color, lw) {
  ctx.strokeStyle = color;
  ctx.lineWidth = lw;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(cx - r * 0.62, cy + r * 0.72);
  ctx.lineTo(cx, cy - r * 0.9);
  ctx.lineTo(cx + r * 0.62, cy + r * 0.72);
  ctx.moveTo(cx - r * 0.92, cy + r * 0.2);
  ctx.lineTo(cx + r * 0.92, cy + r * 0.05);
  ctx.stroke();
}

function drawSideFlag(ctx, w, h, side) {
  const s = SIDES[side];
  ctx.textAlign = 'center';
  if (side === 0) { // Petista (13): fundo vermelho e estrela branca
    ctx.fillStyle = s.color;
    ctx.fillRect(0, 0, w, h);
    star(ctx, w / 2, h * 0.38, h * 0.2, '#fff');
    ctx.fillStyle = '#fff';
    ctx.font = `800 ${h * 0.24}px system-ui, sans-serif`;
    ctx.fillText(`${SIDES[0].short.toUpperCase()} ${SIDES[0].num}`, w / 2, h * 0.86);
  } else if (side === 1) { // Bolsonarista (22): verde com faixa amarela
    ctx.fillStyle = s.color;
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#ffdf00';
    ctx.fillRect(0, h * 0.34, w, h * 0.32);
    ctx.fillStyle = '#0a3d1d';
    ctx.font = `800 ${h * 0.24}px system-ui, sans-serif`;
    ctx.fillText(`${SIDES[1].short.toUpperCase()} ${SIDES[1].num}`, w / 2, h * 0.58);
    ctx.fillStyle = '#fff';
    ctx.font = `700 ${h * 0.12}px system-ui, sans-serif`;
    ctx.fillText('BRASIL', w / 2, h * 0.9);
  } else if (side === 2) { // anarquistas: preta e vermelha na diagonal, círculo-A
    ctx.fillStyle = '#111';
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#b3121b';
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(w, 0);
    ctx.lineTo(0, h);
    ctx.closePath();
    ctx.fill();
    circleA(ctx, w / 2, h / 2, h * 0.3, '#fff', h * 0.05);
  } else { // sem partido: branca com faixa verde e amarela, sem número
    ctx.fillStyle = '#f7f7f4';
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#009c3b';
    ctx.fillRect(0, h * 0.86, w, h * 0.14);
    ctx.fillStyle = '#ffdf00';
    ctx.fillRect(0, h * 0.8, w, h * 0.06);
    ctx.fillStyle = '#2b3240';
    ctx.font = `800 ${h * 0.2}px system-ui, sans-serif`;
    ctx.fillText('SEM PARTIDO', w / 2, h * 0.42);
    ctx.font = `600 ${h * 0.11}px system-ui, sans-serif`;
    ctx.fillStyle = '#5b6677';
    ctx.fillText('O POVO NA RUA', w / 2, h * 0.64);
  }
}

const flagCache = new Map();
/** kind: 'brasil' | 'candidato'. */
export function flagTexture(kind, side = 0) {
  const key = kind === 'brasil' ? 'brasil' : `cand-${side}`;
  if (!flagCache.has(key)) {
    flagCache.set(key, canvasTexture(240, 160, (ctx, w, h) => {
      if (kind === 'brasil') drawBrazilFlag(ctx, w, h); else drawSideFlag(ctx, w, h, side);
    }, { tile: false }));
  }
  return flagCache.get(key);
}

/** Estampa do peito/costas da camisa do lado (fundo transparente). */
export function shirtDecalTexture(side) {
  const key = `decal-${side}`;
  if (!flagCache.has(key)) {
    const s = SIDES[side];
    flagCache.set(key, canvasTexture(128, 128, (ctx, w, h) => {
      ctx.textAlign = 'center';
      if (side === 2) {
        circleA(ctx, w / 2, h / 2, 46, '#f2f2f2', 7);
      } else if (side === 3) {
        ctx.fillStyle = '#2b3240';
        ctx.font = '800 30px system-ui, sans-serif';
        ctx.fillText('SEM', w / 2, 54);
        ctx.fillText('PARTIDO', w / 2, 88);
        ctx.fillStyle = '#009c3b';
        ctx.fillRect(20, 100, 88, 6);
        ctx.fillStyle = '#ffdf00';
        ctx.fillRect(20, 106, 88, 4);
      } else {
        ctx.fillStyle = side === 0 ? '#ffffff' : '#ffdf00';
        ctx.font = '800 76px system-ui, sans-serif';
        ctx.fillText(s.num, w / 2, 88);
        ctx.font = '700 20px system-ui, sans-serif';
        ctx.fillText(s.short.toUpperCase(), w / 2, 112);
        if (side === 0) star(ctx, w / 2, 20, 12, '#fff');
      }
    }, { tile: false }));
  }
  return flagCache.get(key);
}

/** Ruído suave de tecido/pele, multiplicado pelas cores dos vértices do avatar. */
export function fabricTexture() {
  return canvasTexture(128, 128, (ctx, w, h) => {
    ctx.fillStyle = '#f2f2f2';
    ctx.fillRect(0, 0, w, h);
    for (let i = 0; i < 9000; i++) {
      const v = 215 + Math.floor(Math.random() * 40);
      ctx.fillStyle = `rgb(${v},${v},${v})`;
      ctx.fillRect(Math.random() * w, Math.random() * h, 1, 1);
    }
    ctx.fillStyle = 'rgba(0,0,0,0.05)'; // trama
    for (let y = 0; y < h; y += 3) ctx.fillRect(0, y, w, 1);
  }, { repeat: [6, 6], aniso: 4 });
}

/** Placa azul de rua. */
export function streetSignTexture(text = 'AV. PAULISTA') {
  return canvasTexture(256, 64, (ctx, w, h) => {
    ctx.fillStyle = '#1d4e9e';
    ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 3;
    ctx.strokeRect(4, 4, w - 8, h - 8);
    ctx.fillStyle = '#fff';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = '700 30px system-ui, sans-serif';
    ctx.fillText(text, w / 2, h / 2 + 1);
  }, { tile: false });
}

/** Lambe-lambe colado em postes e tapumes. */
export function posterTexture(side) {
  const s = SIDES[side];
  return canvasTexture(128, 192, (ctx, w, h) => {
    ctx.fillStyle = side === 2 ? '#111' : side === 3 ? '#f4efe4' : '#f7f1e3';
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = s.color;
    ctx.fillRect(0, 0, w, 54);
    ctx.textAlign = 'center';
    ctx.fillStyle = side === 1 ? '#ffdf00' : '#fff';
    ctx.font = '800 28px system-ui, sans-serif';
    ctx.fillText(side === 2 ? 'Ⓐ' : s.num, w / 2, 40);
    ctx.fillStyle = side === 2 ? '#eee' : '#2b2b2b';
    ctx.font = '800 22px system-ui, sans-serif';
    const lines = side === 0 ? ['VEM PRA', 'PAULISTA'] : side === 1 ? ['TODOS NA', 'AVENIDA'] : side === 2 ? ['NEM UM', 'NEM OUTRO'] : ['A RUA É', 'DO POVO'];
    ctx.fillText(lines[0], w / 2, 100);
    ctx.fillText(lines[1], w / 2, 130);
    ctx.fillStyle = 'rgba(0,0,0,0.12)'; // desgaste
    for (let i = 0; i < 25; i++) ctx.fillRect(Math.random() * w, Math.random() * h, 6, 2);
  }, { tile: false });
}

export function signTexture(text) {
  return canvasTexture(256, 170, (ctx, w, h) => {
    ctx.fillStyle = '#fafaf9';
    ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = '#1c1917';
    ctx.lineWidth = 8;
    ctx.strokeRect(4, 4, w - 8, h - 8);
    ctx.fillStyle = '#1c1917';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const lines = [];
    let line = '';
    for (const word of text.split(' ')) {
      const test = line ? `${line} ${word}` : word;
      if (test.length > 10 && line) { lines.push(line); line = word; } else line = test;
    }
    if (line) lines.push(line);
    const shown = lines.slice(0, 3);
    const size = shown.length === 1 ? 44 : shown.length === 2 ? 38 : 30;
    ctx.font = `800 ${size}px system-ui, sans-serif`;
    shown.forEach((l, i) => ctx.fillText(l, w / 2, h / 2 + (i - (shown.length - 1) / 2) * (size + 6)));
  }, { tile: false });
}

/** Faixa de protesto para os carros de som. */
export function bannerTexture(side) {
  const s = SIDES[side];
  return canvasTexture(512, 128, (ctx, w, h) => {
    ctx.fillStyle = s.color;
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = side === 0 ? '#fff' : '#ffdf00';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = '800 76px system-ui, sans-serif';
    ctx.fillText(`${s.short.toUpperCase()} ${s.num}`, w / 2, h / 2 + 4);
  }, { tile: false });
}

// ---------- Rosto pintado (mapa do UV da esfera da cabeça) ----------
// Na SphereGeometry do three, o centro do rosto (+z) fica em u = 0,25 e o topo em v = 1.

const faceCache = new Map();
export function faceTexture({ skin, hair, beard, female, iris, hairStyle }) {
  const key = [skin, hair, beard, female, iris, hairStyle].join('|');
  if (faceCache.has(key)) return faceCache.get(key);
  const W = 512;
  const H = 256;
  const cx = W * 0.25;
  const tex = canvasTexture(W, H, (ctx) => {
    ctx.fillStyle = skin;
    ctx.fillRect(0, 0, W, H);
    // sombreamento suave: têmporas e queixo
    const shadeK = ctx.createRadialGradient(cx, 128, 20, cx, 128, 150);
    shadeK.addColorStop(0, 'rgba(255,255,255,0.06)');
    shadeK.addColorStop(1, 'rgba(0,0,0,0.12)');
    ctx.fillStyle = shadeK;
    ctx.fillRect(0, 0, W, H);

    // bochechas
    for (const sx of [-1, 1]) {
      const g = ctx.createRadialGradient(cx + sx * 46, 148, 2, cx + sx * 46, 148, 26);
      g.addColorStop(0, female ? 'rgba(220,90,110,0.25)' : 'rgba(200,100,90,0.14)');
      g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, W, H);
    }

    // sobrancelhas
    ctx.strokeStyle = hair;
    ctx.lineCap = 'round';
    ctx.lineWidth = female ? 4 : 6;
    for (const sx of [-1, 1]) {
      ctx.beginPath();
      ctx.moveTo(cx + sx * 16, 100);
      ctx.quadraticCurveTo(cx + sx * 36, 92, cx + sx * 52, 98);
      ctx.stroke();
    }

    // olhos: amêndoa branca, íris, pupila, brilho, cílios e pálpebra
    for (const sx of [-1, 1]) {
      const ex = cx + sx * 34;
      const ey = 118;
      ctx.fillStyle = '#f6f3ee';
      ctx.beginPath();
      ctx.ellipse(ex, ey, 15, 9, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = iris;
      ctx.beginPath();
      ctx.arc(ex, ey + 1, 7, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#0a0a0a';
      ctx.beginPath();
      ctx.arc(ex, ey + 1, 3.6, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.85)';
      ctx.beginPath();
      ctx.arc(ex - 2.5, ey - 2, 1.8, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#2a1d16';
      ctx.lineWidth = female ? 2.6 : 1.8;
      ctx.beginPath();
      ctx.ellipse(ex, ey, 15, 9, 0, Math.PI * 1.05, Math.PI * 1.95);
      ctx.stroke();
      ctx.strokeStyle = 'rgba(0,0,0,0.18)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.ellipse(ex, ey, 15, 9, 0, Math.PI * 0.1, Math.PI * 0.9);
      ctx.stroke();
    }

    // nariz: sombra lateral e narinas
    const ng = ctx.createLinearGradient(cx - 14, 0, cx + 14, 0);
    ng.addColorStop(0, 'rgba(0,0,0,0.1)');
    ng.addColorStop(0.5, 'rgba(255,255,255,0.05)');
    ng.addColorStop(1, 'rgba(0,0,0,0.1)');
    ctx.fillStyle = ng;
    ctx.fillRect(cx - 14, 122, 28, 36);
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    for (const sx of [-1, 1]) {
      ctx.beginPath();
      ctx.ellipse(cx + sx * 7, 158, 3.5, 2.2, 0, 0, Math.PI * 2);
      ctx.fill();
    }

    // boca
    const lip = female ? '#b24a5a' : '#9a5a55';
    ctx.strokeStyle = 'rgba(60,20,20,0.55)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(cx - 18, 176);
    ctx.quadraticCurveTo(cx, 182, cx + 18, 176);
    ctx.stroke();
    ctx.fillStyle = lip;
    ctx.beginPath();
    ctx.moveTo(cx - 18, 176);
    ctx.quadraticCurveTo(cx, 170, cx + 18, 176);
    ctx.quadraticCurveTo(cx, 190, cx - 18, 176);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.18)';
    ctx.beginPath();
    ctx.ellipse(cx, 183, 9, 2.5, 0, 0, Math.PI * 2);
    ctx.fill();

    // barba ou bigode (pintados por cima da pele; a geometria adiciona o volume)
    if (beard >= 1) {
      ctx.fillStyle = hair;
      ctx.globalAlpha = 0.85;
      ctx.beginPath();
      ctx.ellipse(cx, 166, 26, 5, 0, Math.PI, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
    }
    if (beard === 2) {
      ctx.fillStyle = hair;
      ctx.globalAlpha = 0.75;
      ctx.beginPath();
      ctx.moveTo(cx - 70, 150);
      ctx.quadraticCurveTo(cx - 60, 230, cx, 236);
      ctx.quadraticCurveTo(cx + 60, 230, cx + 70, 150);
      ctx.quadraticCurveTo(cx + 40, 185, cx, 192);
      ctx.quadraticCurveTo(cx - 40, 185, cx - 70, 150);
      ctx.fill();
      ctx.globalAlpha = 1;
    } else if (!female) {
      ctx.fillStyle = 'rgba(0,0,0,0.07)'; // barba por fazer
      ctx.beginPath();
      ctx.ellipse(cx, 200, 58, 36, 0, 0, Math.PI * 2);
      ctx.fill();
    }

    // linha do cabelo (escurece o topo quando há cabelo)
    if (hairStyle !== 2) {
      const hg = ctx.createLinearGradient(0, 0, 0, 70);
      hg.addColorStop(0, hair);
      hg.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = hg;
      ctx.globalAlpha = hairStyle === 1 ? 0.55 : 0.9;
      ctx.fillRect(0, 0, W, 70);
      ctx.globalAlpha = 1;
    }
  }, { tile: false, aniso: 8 });
  tex.wrapS = THREE.RepeatWrapping;
  faceCache.set(key, tex);
  return tex;
}

// ---------- Normal maps a partir de um mapa de altura desenhado ----------

export function normalFromHeight(size, drawHeight, strength = 2, repeat = [1, 1]) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const ctx = c.getContext('2d');
  drawHeight(ctx, size, size);
  const { data } = ctx.getImageData(0, 0, size, size);
  const h = (x, y) => data[(((y + size) % size) * size + ((x + size) % size)) * 4] / 255;
  const out = ctx.createImageData(size, size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = (h(x + 1, y) - h(x - 1, y)) * strength;
      const dy = (h(x, y + 1) - h(x, y - 1)) * strength;
      const len = Math.hypot(dx, dy, 1);
      const i = (y * size + x) * 4;
      out.data[i] = ((-dx / len) * 0.5 + 0.5) * 255;
      out.data[i + 1] = ((dy / len) * 0.5 + 0.5) * 255;
      out.data[i + 2] = (1 / len) * 255;
      out.data[i + 3] = 255;
    }
  }
  ctx.putImageData(out, 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(...repeat);
  t.anisotropy = 8;
  return t;
}

export const asphaltNormal = (repeat) => normalFromHeight(256, (ctx, w, h) => {
  ctx.fillStyle = '#808080';
  ctx.fillRect(0, 0, w, h);
  for (let i = 0; i < 2600; i++) { // brita
    const v = 90 + Math.floor(Math.random() * 110);
    ctx.fillStyle = `rgb(${v},${v},${v})`;
    ctx.beginPath();
    ctx.arc(Math.random() * w, Math.random() * h, 1 + Math.random() * 2.2, 0, 6.3);
    ctx.fill();
  }
  ctx.strokeStyle = '#303030'; // rachaduras
  ctx.lineWidth = 1.5;
  for (let i = 0; i < 5; i++) {
    let x = Math.random() * w;
    let y = Math.random() * h;
    ctx.beginPath();
    ctx.moveTo(x, y);
    for (let k = 0; k < 8; k++) { x += rnd(-18, 18); y += rnd(6, 22); ctx.lineTo(x, y); }
    ctx.stroke();
  }
}, 1.6, repeat);

export const mosaicNormal = (repeat) => normalFromHeight(256, (ctx, w, h) => {
  ctx.fillStyle = '#8c8c8c';
  ctx.fillRect(0, 0, w, h);
  for (let i = 0; i < 1800; i++) { // pedras portuguesas: pequenos relevos
    const v = 110 + Math.floor(Math.random() * 60);
    ctx.fillStyle = `rgb(${v},${v},${v})`;
    ctx.fillRect(Math.floor(Math.random() * w / 6) * 6 + 1, Math.floor(Math.random() * h / 6) * 6 + 1, 4, 4);
  }
}, 1.2, repeat);

// ---------- Telão com conteúdo animado ----------

export class LedTicker {
  constructor() {
    this.canvas = document.createElement('canvas');
    this.canvas.width = 512;
    this.canvas.height = 288;
    this.ctx = this.canvas.getContext('2d');
    this.texture = new THREE.CanvasTexture(this.canvas);
    this.texture.colorSpace = THREE.SRGBColorSpace;
    this.texture.anisotropy = 4;
    this.messages = [
      'ELEIÇÕES 2026 · AVENIDA PAULISTA AO VIVO',
      SIDES.map((sd) => sd.short.toUpperCase()).join(' · '),
      'ESCOLHA SEU LADO E ENTRE NA AVENIDA',
      'MANIFESTAÇÃO ONLINE · GRÁTIS NO NAVEGADOR',
    ];
    this.last = -1;
    this.draw(0);
  }

  setOnline(counts) { this.counts = counts; }

  update(time) {
    if (time - this.last < 0.08) return;
    this.last = time;
    this.draw(time);
    this.texture.needsUpdate = true;
  }

  draw(time) {
    const { ctx, canvas: { width: w, height: h } } = this;
    const g = ctx.createLinearGradient(0, 0, w, h);
    g.addColorStop(0, '#07122a');
    g.addColorStop(1, '#2a0f2a');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#d7192b'; // selo AO VIVO piscando
    if (Math.floor(time * 1.5) % 2 === 0) {
      ctx.beginPath();
      ctx.arc(34, 34, 9, 0, 6.3);
      ctx.fill();
    }
    ctx.fillStyle = '#fff';
    ctx.textAlign = 'left';
    ctx.font = '800 22px system-ui, sans-serif';
    ctx.fillText('AO VIVO', 52, 42);
    ctx.textAlign = 'center';
    ctx.font = '800 50px system-ui, sans-serif';
    ctx.fillText('AVENIDA PAULISTA', w / 2, 140);
    if (this.counts) {
      ctx.font = '700 22px system-ui, sans-serif';
      ctx.fillStyle = '#9ad0ff';
      ctx.fillText(`${this.counts.reduce((a, b) => a + b, 0)} pessoas na avenida agora`, w / 2, 180);
    }
    // faixa de notícias rolando
    ctx.fillStyle = '#fcd34d';
    ctx.fillRect(0, h - 56, w, 56);
    ctx.fillStyle = '#1c1917';
    ctx.font = '800 30px system-ui, sans-serif';
    ctx.textAlign = 'left';
    const text = this.messages.join('     •     ');
    const tw = ctx.measureText(text).width + 200;
    const x = w - ((time * 90) % tw);
    ctx.fillText(text, x, h - 18);
    ctx.fillText(text, x - tw, h - 18);
    // grade de LEDs
    ctx.fillStyle = 'rgba(0,0,0,0.18)';
    for (let y = 0; y < h; y += 4) ctx.fillRect(0, y, w, 1);
  }
}

// ---------- Cartaz e bandeira personalizados (comprados na loja) ----------

function wrapWords(text, maxChars, maxLines) {
  const lines = [];
  let line = '';
  for (const word of String(text).split(' ')) {
    const test = line ? `${line} ${word}` : word;
    if (test.length > maxChars && line) { lines.push(line); line = word; } else line = test;
  }
  if (line) lines.push(line);
  return lines.slice(0, maxLines);
}

/** Estampa da camisa personalizada (símbolo e texto em `fg`), sem fundo. */
function drawShirtPrint(ctx, w, h, design) {
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = design.fg;
  let top = h / 2;
  if (design.emblem) {
    ctx.font = `${Math.round(h * 0.4)}px system-ui, "Apple Color Emoji", "Segoe UI Emoji", sans-serif`;
    ctx.fillText(design.emblem, w / 2, h * 0.32);
    top = h * 0.74;
  }
  const lines = wrapWords(design.text || '', 8, 2);
  if (!lines.length) return;
  const size = Math.round(h * (design.emblem ? 0.16 : 0.3) * (lines.length === 1 ? 1 : 0.8));
  ctx.font = `800 ${size}px system-ui, sans-serif`;
  lines.forEach((l, i) => ctx.fillText(l, w / 2, top + (i - (lines.length - 1) / 2) * (size + 2), w * 0.92));
}

/** Estampa (fundo transparente) da camisa personalizada, para o peito e as costas do avatar. */
export function shirtPrintTexture(design) {
  const key = `shirt${JSON.stringify([design.text, design.fg, design.emblem])}`;
  if (!designCache.has(key)) {
    designCache.set(key, canvasTexture(128, 128, (ctx, w, h) => drawShirtPrint(ctx, w, h, design), { tile: false }));
  }
  return designCache.get(key);
}

/**
 * Desenha o cartaz (kind 'sign'), a bandeira ('flag') ou a prévia da camisa ('shirt', 'plainshirt')
 * de um desenho {text, bg, fg, emblem}.
 */
export function drawDesign(ctx, w, h, kind, design) {
  const sign = kind === 'sign';
  ctx.fillStyle = design.bg;
  ctx.fillRect(0, 0, w, h);
  if (kind === 'shirt') drawShirtPrint(ctx, w, h, design);
  if (kind === 'shirt' || kind === 'plainshirt') return;
  if (sign) {
    ctx.strokeStyle = design.fg;
    ctx.lineWidth = 8;
    ctx.strokeRect(4, 4, w - 8, h - 8);
  } else {
    ctx.fillStyle = design.fg;
    ctx.fillRect(0, h - 12, w, 12);
    ctx.fillRect(0, 0, w, 6);
  }
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  let top = h / 2;
  if (design.emblem) {
    ctx.font = `${Math.round(h * 0.3)}px system-ui, "Apple Color Emoji", "Segoe UI Emoji", sans-serif`;
    ctx.fillStyle = design.fg;
    ctx.fillText(design.emblem, w / 2, h * 0.3);
    top = h * 0.66;
  }
  const lines = wrapWords(design.text || '', sign ? 12 : 9, design.emblem ? 2 : 3);
  if (!lines.length) return;
  const size = Math.round((sign ? 44 : 40) * (lines.length === 1 ? 1 : lines.length === 2 ? 0.82 : 0.66) * (design.emblem ? 0.85 : 1));
  ctx.font = `800 ${size}px system-ui, sans-serif`;
  ctx.fillStyle = design.fg;
  lines.forEach((l, i) => ctx.fillText(l, w / 2, top + (i - (lines.length - 1) / 2) * (size + 4)));
}

const designCache = new Map();
export function designTexture(kind, design) {
  const key = kind + JSON.stringify(design);
  if (!designCache.has(key)) {
    const sign = kind === 'sign';
    designCache.set(key, canvasTexture(sign ? 256 : 240, sign ? 170 : 160, (ctx, w, h) => drawDesign(ctx, w, h, kind, design), { tile: false }));
  }
  return designCache.get(key);
}

/** Faixa dos pórticos da corrida. */
export function archBannerTexture(text, color) {
  return canvasTexture(512, 96, (ctx, w, h) => {
    ctx.fillStyle = color;
    ctx.fillRect(0, 0, w, h);
    for (let i = 0; i < w; i += 32) { // xadrez nas bordas
      ctx.fillStyle = (i / 32) % 2 ? '#fff' : '#111';
      ctx.fillRect(i, 0, 32, 10);
      ctx.fillRect(i, h - 10, 32, 10);
    }
    ctx.fillStyle = '#fff';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = '800 54px system-ui, sans-serif';
    ctx.fillText(text, w / 2, h / 2 + 2);
  }, { tile: false });
}
