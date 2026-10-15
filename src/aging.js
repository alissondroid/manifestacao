import * as THREE from 'three';
import { aimBone, grayMap } from './avatar.js';

// Envelhecimento dos modelos humanos (não há modelos de idosos; os dois corpos ganham sinais
// de idade): cabelo/barba grisalhos e sem gorro no homem, pele mais pálida, óculos de leitura,
// postura curvada, bengala na mão direita e passo mais lento.

const _d = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _p = new THREE.Vector3();

const GRAY_HAIR = new THREE.Color('#d9d6cf');
const CANE_MAT = new THREE.MeshStandardMaterial({ color: '#5a3a22', roughness: 0.6 });
const TIP_MAT = new THREE.MeshStandardMaterial({ color: '#222', roughness: 0.9 });
const FRAME_MAT = new THREE.MeshStandardMaterial({ color: '#8c7b5a', metalness: 0.6, roughness: 0.35 });
const LENS_MAT = new THREE.MeshStandardMaterial({ color: '#cfe3f0', transparent: true, opacity: 0.35, roughness: 0.1 });

/** Materiais e malhas: chamado uma vez por personagem idoso (depois de createCharacter). */
export function ageCharacter(char) {
  const { meshes, mats } = char;
  if (char.tintable) {
    if (meshes.Mesh) meshes.Mesh.visible = false; // sem o gorro: cabeça calva
    const beard = meshes.Wolf3D_Beard;
    if (beard) {
      beard.visible = true;
      if (!mats.beard) beard.material = beard.material.clone();
      beard.material.color.copy(GRAY_HAIR);
      mats.beard = beard.material;
    }
  }
  if (mats.hair?.map) { // cabelo dos personagens do Mixamo: textura em cinza claro, cor branca
    const gm = grayMap(mats.hair.map);
    mats.hair.map = gm;
    mats.hair.color.set('#ece8e2');
  }
  for (const key of ['skinHead', 'skinBody']) {
    const m = mats[key];
    if (m) m.color.lerp(new THREE.Color('#d8d2cc'), 0.25); // pele mais pálida
  }
  if (char.tintable && char.outfit) char.outfit.skin.lerp(new THREE.Color('#d8d2cc'), 0.25); // braços e canelas também
}

/** Óculos de leitura finos (grupo a ser preso ao osso da cabeça). */
export function createReadingGlasses() {
  const g = new THREE.Group();
  const lens = new THREE.CylinderGeometry(0.024, 0.024, 0.004, 16).rotateX(Math.PI / 2);
  for (const x of [-0.034, 0.034]) {
    const rim = new THREE.Mesh(new THREE.TorusGeometry(0.024, 0.0025, 6, 18), FRAME_MAT);
    rim.position.set(x, 0, 0);
    const l = new THREE.Mesh(lens, LENS_MAT);
    l.position.set(x, 0, 0);
    g.add(rim, l);
  }
  const bridge = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.003, 0.003), FRAME_MAT);
  bridge.position.set(0, 0.006, 0);
  g.add(bridge);
  for (const x of [-0.058, 0.058]) {
    const arm = new THREE.Mesh(new THREE.BoxGeometry(0.003, 0.003, 0.11), FRAME_MAT);
    arm.position.set(x, 0.006, -0.055);
    g.add(arm);
  }
  return g;
}

/** Bengala com cabo curvo; a origem fica no cabo, e o corpo desce até o chão. */
export function createCane() {
  const g = new THREE.Group();
  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.014, 0.86, 8).translate(0, -0.43, 0), CANE_MAT);
  const handle = new THREE.Mesh(new THREE.TorusGeometry(0.05, 0.012, 8, 14, Math.PI).rotateY(Math.PI / 2), CANE_MAT);
  handle.position.set(0, 0, 0.05);
  const tip = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.016, 0.03, 8).translate(0, -0.875, 0), TIP_MAT);
  shaft.castShadow = handle.castShadow = true;
  g.add(shaft, handle, tip);
  return g;
}

/**
 * Pose de idoso, aplicada a cada quadro depois do mixer: tronco curvado para a frente,
 * cabeça compensando e braço direito apoiado na bengala.
 */
export function poseElderly(bones, group, { cane = true } = {}) {
  group.getWorldQuaternion(_q);
  const world = (x, y, z) => _d.set(x, y, z).normalize().applyQuaternion(_q).clone();
  aimBone(bones.spine1, bones.spine2, world(0, 0.86, 0.5), 1);
  aimBone(bones.neck, bones.head, world(0, 0.95, 0.32), 1);
  if (cane) {
    aimBone(bones.rightArm, bones.rightForeArm, world(-0.15, -0.9, 0.35), 1);
    aimBone(bones.rightForeArm, bones.rightHand, world(-0.05, -0.85, 0.5), 1);
  }
}

/** A bengala segue a mão direita, sempre vertical, e estica até tocar o chão. */
export function updateCane(cane, handBone, group) {
  handBone.getWorldPosition(_p);
  group.worldToLocal(_p);
  cane.position.set(_p.x, _p.y, _p.z);
  cane.scale.y = Math.max(0.6, _p.y / 0.89);
}
