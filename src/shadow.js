import * as THREE from 'three';

// A câmera de sombra do sol acompanha o jogador. Se ela se mover em passos contínuos, a grade de texels do mapa de
// sombra desliza sobre o mundo e as bordas das sombras (e a auto-sombra de carros e ônibus) tremem a cada passo.
// Ancorar o foco em múltiplos de um texel NO ESPAÇO DA LUZ (não nos eixos do mundo) mantém cada ponto do mundo
// sempre na mesma posição dentro do texel: a sombra fica parada.

const WORLD_UP = new THREE.Vector3(0, 1, 0);
const _right = new THREE.Vector3();
const _up = new THREE.Vector3();

/**
 * Escreve em `out` o ponto mais próximo de (x, 0, z) que cai exatamente na grade de texels da câmera de sombra.
 * `sunDir` é a direção do alvo para o sol (como em SUN_DIR); `texel` é o tamanho do texel em metros.
 */
export function snapShadowFocus(out, x, z, sunDir, texel) {
  const dir = sunDir.clone().normalize();
  // mesmos eixos que THREE.Object3D.lookAt dá à câmera da luz: z = dir (do alvo para a luz), x = up × z, y = z × x
  _right.crossVectors(WORLD_UP, dir).normalize();
  _up.crossVectors(dir, _right).normalize();
  out.set(x, 0, z);
  const r = out.dot(_right);
  const u = out.dot(_up);
  out.addScaledVector(_right, Math.round(r / texel) * texel - r);
  out.addScaledVector(_up, Math.round(u / texel) * texel - u);
  return out;
}
