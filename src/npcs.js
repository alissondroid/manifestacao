import * as THREE from 'three';
import { signTexture } from './textures.js';

// Tipos especiais de figurante: vendedor de água, policial e equipe de reportagem. Só os objetos
// (adereços) e as cores; quem monta a pessoa e a posiciona é o crowd.js.

const mat = (color, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.7, ...extra });
const shadowed = (g) => { g.traverse((o) => { if (o.isMesh) o.castShadow = true; }); return g; };

export const NPC_ROLES = {
  water: { top: ['#8ec5ff', '#ffffff'], bottom: ['#35507a', '#20252b'] },
  police: { top: ['#1b2a4a'], bottom: ['#10141c'] },
  reporter: { top: ['#ffffff', '#2b2f36', '#d9e2ec'], bottom: ['#20252b', '#35507a'] },
  camera: { top: ['#2b2f36'], bottom: ['#20252b'] },
};

/** Caixa de isopor com garrafas em cima e a etiqueta "ÁGUA GELADA"; a origem fica no centro da caixa. */
export function createCooler() {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.28, 0.3), mat('#f5f7fa'));
  const lid = new THREE.Mesh(new THREE.BoxGeometry(0.48, 0.05, 0.32), mat('#2f6fbf'));
  lid.position.y = 0.165;
  g.add(body, lid);
  const label = new THREE.MeshStandardMaterial({ map: signTexture('ÁGUA GELADA'), roughness: 0.8 });
  for (const s of [1, -1]) {
    const plane = new THREE.Mesh(new THREE.PlaneGeometry(0.34, 0.2), label);
    plane.position.z = 0.152 * s;
    if (s < 0) plane.rotation.y = Math.PI;
    g.add(plane);
  }
  for (const x of [-0.13, 0, 0.13]) {
    const bottle = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.2, 8), mat('#7cc4f2', { transparent: true, opacity: 0.85 }));
    bottle.position.set(x, 0.29, 0);
    const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.014, 0.03, 6), mat('#1e66d0'));
    cap.position.set(x, 0.405, 0);
    g.add(bottle, cap);
  }
  return shadowed(g);
}

/** Placa de vendedor numa haste: a origem fica na mão e a haste sobe. */
export function createWaterSign() {
  const g = new THREE.Group();
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 1.3, 6).translate(0, 0.5, 0), mat('#d4d4d0', { metalness: 0.3 }));
  const board = new THREE.Mesh(new THREE.PlaneGeometry(0.56, 0.37), new THREE.MeshStandardMaterial({ map: signTexture('ÁGUA 2 REAIS'), side: THREE.DoubleSide, roughness: 0.85 }));
  board.position.set(0, 1.0, 0);
  g.add(pole, board);
  return shadowed(g);
}

/** Quepe de policial; a origem fica na base da copa (mesma convenção do boné do avatar). */
export function createPoliceCap() {
  const g = new THREE.Group();
  const crown = new THREE.Mesh(new THREE.SphereGeometry(0.115, 18, 10, 0, Math.PI * 2, 0, Math.PI * 0.5), mat('#16213b'));
  const visor = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.014, 0.15), mat('#0b0f19'));
  visor.position.set(0, 0.01, 0.15);
  const badge = new THREE.Mesh(new THREE.SphereGeometry(0.016, 8, 6), mat('#e0b700', { metalness: 0.5 }));
  badge.position.set(0, 0.045, 0.112);
  g.add(crown, visor, badge);
  return g;
}

/** Cassetete no cinto. */
export function createBelt() {
  const g = new THREE.Group();
  const stick = new THREE.Mesh(new THREE.CylinderGeometry(0.017, 0.02, 0.42, 8), mat('#101114'));
  stick.rotation.z = 0.12;
  stick.rotation.x = 0.1;
  const holster = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.1, 0.09), mat('#101114'));
  holster.position.set(0.0, 0.12, 0.0);
  g.add(stick, holster);
  return shadowed(g);
}

/** Microfone de mão: a origem fica na mão, com a esponja para cima. */
export function createMic() {
  const g = new THREE.Group();
  const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.018, 0.13, 8).translate(0, 0.04, 0), mat('#15171c'));
  const ball = new THREE.Mesh(new THREE.SphereGeometry(0.032, 10, 8), mat('#b8bec7', { metalness: 0.4 }));
  ball.position.y = 0.13;
  const band = new THREE.Mesh(new THREE.CylinderGeometry(0.033, 0.033, 0.012, 10), mat('#d33'));
  band.position.y = 0.1;
  g.add(handle, ball, band);
  return shadowed(g);
}

/** Câmera de ombro apontada para +Z; a origem fica na mão. */
export function createCamera() {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.22, 0.4), mat('#1b1d22'));
  body.position.set(0, 0.12, 0.05);
  const lens = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.085, 0.2, 14).rotateX(Math.PI / 2), mat('#0e0f12'));
  lens.position.set(0, 0.12, 0.35);
  const glass = new THREE.Mesh(new THREE.CircleGeometry(0.06, 14), mat('#2c4a6e', { metalness: 0.8, roughness: 0.2 }));
  glass.position.set(0, 0.12, 0.452);
  const light = new THREE.Mesh(new THREE.SphereGeometry(0.012, 6, 5), mat('#ff2020', { emissive: '#ff0000', emissiveIntensity: 1 }));
  light.position.set(0.07, 0.24, 0.15);
  g.add(body, lens, glass, light);
  return shadowed(g);
}
