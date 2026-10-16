// Qualidade adaptativa: mede o FPS em janelas e, se ficar baixo por janelas seguidas, pede um nível menor.
// Só desce (nunca sobe de volta), para a imagem não oscilar. Sem dependências do navegador, para ser testável.

export const QUALITY = {
  maxLevel: 3,
  lowFps: 28, // abaixo disso a janela conta como ruim
  windowS: 3, // duração de cada janela de medição
  badWindows: 2, // janelas ruins seguidas para descer um nível
  ignoreAbove: 0.25, // quadro mais longo que isso (aba em segundo plano, travada por carga) não entra na média
};

/** `onDrop(novoNivel)` é chamado ao descer. `frame(dtReal)` deve ser chamado a cada quadro. */
export function createQualityMonitor({ level = 0, onDrop }) {
  const s = {
    level, acc: 0, frames: 0, bad: 0,
  };
  return {
    get level() { return s.level; },
    set level(v) { s.level = v; s.acc = 0; s.frames = 0; s.bad = 0; },
    frame(dt) {
      if (dt > QUALITY.ignoreAbove) return;
      s.acc += dt;
      s.frames += 1;
      if (s.acc < QUALITY.windowS) return;
      const fps = s.frames / s.acc;
      s.acc = 0;
      s.frames = 0;
      s.bad = fps < QUALITY.lowFps ? s.bad + 1 : 0;
      if (s.bad >= QUALITY.badWindows && s.level < QUALITY.maxLevel) {
        s.bad = 0;
        s.level += 1;
        onDrop?.(s.level);
      }
    },
  };
}
