import * as THREE from 'three';
import { createCharacter } from '../models.js';
import { SKINS, MODELS } from '../../shared/config.js';
import { HEIGHT_SCALE } from '../avatar.js';

// Figurante leve: o personagem do jogo com um esqueleto e só dois clipes (parado e andando), sem acessórios.
// Serve para a fila, os mesários e os vizinhos. Quem joga usa o Avatar completo.

const BASE_SKIN = new THREE.Color('#f3d2b8');

export function createFigurante({
  female = false, seed = 0, shirt = '#ffffff', pants = '#35507a',
}) {
  const id = female ? MODELS.female[seed % MODELS.female.length] : 'rpm';
  const c = createCharacter(id);
  const group = new THREE.Group();
  group.add(c.root);
  if (c.tintable) {
    const skin = new THREE.Color(SKINS[seed % SKINS.length]);
    const tint = new THREE.Color(skin.r / BASE_SKIN.r, skin.g / BASE_SKIN.g, skin.b / BASE_SKIN.b);
    c.mats.skinHead.color.copy(tint);
    c.mats.skinBody.color.copy(tint);
    c.outfit.skin.copy(skin);
    for (const name of ['Wolf3D_Teeth', 'EyeLeft', 'EyeRight']) if (c.meshes[name]) c.meshes[name].visible = false;
  } else if (c.lookSkin) c.outfit.skin.set(SKINS[seed % SKINS.length]);
  if (c.outfit) { c.outfit.top.set(shirt); c.outfit.bottom.set(pants); }
  c.bones.hips.scale.setScalar(HEIGHT_SCALE[seed % HEIGHT_SCALE.length]);
  c.root.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = false; } });

  const mixer = new THREE.AnimationMixer(c.root);
  const idle = mixer.clipAction(c.clips.idle);
  const walk = mixer.clipAction(c.clips.walk);
  idle.play(); walk.play();
  idle.setEffectiveWeight(1); walk.setEffectiveWeight(0);
  mixer.update((seed % 17) * 0.37); // cada um começa num ponto diferente do movimento
  let w = 0; // peso do andar (0..1)
  return {
    group,
    height: c.height,
    update(dt, anim, speed = 0) {
      const target = anim === 'walk' ? 1 : 0;
      w += (target - w) * Math.min(1, dt * 8);
      idle.setEffectiveWeight(1 - w);
      walk.setEffectiveWeight(w);
      walk.timeScale = Math.min(2, Math.max(0.6, speed / 1.5));
      mixer.update(dt);
    },
    dispose() { mixer.stopAllAction(); group.removeFromParent(); },
  };
}
