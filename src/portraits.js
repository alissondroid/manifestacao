import * as THREE from 'three';
import { Avatar } from './avatar.js';

// Personagens prontos, como os cards do lobby. Cada um é um conjunto de valores do visual.
export const PRESETS = [
  { id: 'homem', name: 'Homem', look: { body: 0, age: 0, face: 0, skin: 2, hairStyle: 0, hair: 1, beard: 0, shirt: 0, top: 0, pants: 0 } },
  { id: 'mulher', name: 'Mulher', look: { body: 1, age: 0, face: 0, skin: 1, hairStyle: 4, hair: 1, beard: 0, shirt: 6, top: 0, pants: 3 } },
];

/**
 * Renderiza o busto de cada personagem pronto em um <canvas class="portrait" data-preset="i">.
 * Usa um render target do próprio renderer do jogo, então o retrato é o modelo 3D de verdade.
 */
export function renderPortraits(renderer, side = 0) {
  const W = 176;
  const H = 208;
  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#15211b');
  scene.add(new THREE.HemisphereLight('#e8f0ff', '#5a5040', 1.4));
  const key = new THREE.DirectionalLight('#fff2dc', 2.2);
  key.position.set(1.2, 2.4, 2.2);
  scene.add(key);
  const rim = new THREE.DirectionalLight('#9ad0ff', 1.2);
  rim.position.set(-1.5, 1.6, -1.5);
  scene.add(rim);

  // enquadra cabeça e ombros, como uma foto 3x4
  const camera = new THREE.PerspectiveCamera(24, W / H, 0.1, 10);
  camera.position.set(0.2, 1.62, 1.25);
  camera.lookAt(0, 1.47, 0);

  const rt = new THREE.WebGLRenderTarget(W, H, { samples: 4 });
  rt.texture.colorSpace = THREE.SRGBColorSpace;
  const pixels = new Uint8Array(W * H * 4);
  const prevTarget = renderer.getRenderTarget();

  document.querySelectorAll('canvas.portrait').forEach((canvas) => {
    const preset = PRESETS[Number(canvas.dataset.preset)];
    if (!preset) return;
    const avatar = new Avatar({ ...preset.look, flag: 0, sign: '', side, equip: {} });
    avatar.update(0.5, 'idle');
    avatar.group.rotation.y = -0.25;
    scene.add(avatar.group);
    // enquadra a cabeça de cada modelo (as alturas variam de um para outro)
    avatar.group.updateMatrixWorld(true);
    const head = new THREE.Vector3();
    avatar.char.bones.head.getWorldPosition(head);
    camera.position.set(0.15, head.y + 0.08, 1.15);
    camera.lookAt(0, head.y - 0.02, 0);
    renderer.setRenderTarget(rt);
    renderer.render(scene, camera);
    renderer.readRenderTargetPixels(rt, 0, 0, W, H, pixels);
    scene.remove(avatar.group);
    avatar.dispose();

    canvas.width = W;
    canvas.height = H;
    const ctx = canvas.getContext('2d');
    const img = ctx.createImageData(W, H);
    for (let y = 0; y < H; y++) { // o render target vem de cabeça para baixo
      img.data.set(pixels.subarray((H - 1 - y) * W * 4, (H - y) * W * 4), y * W * 4);
    }
    ctx.putImageData(img, 0, 0);
  });

  renderer.setRenderTarget(prevTarget);
  rt.dispose();
}
