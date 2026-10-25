import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import * as SkeletonUtils from 'three/examples/jsm/utils/SkeletonUtils.js'; // clone()
import { MODELS } from '../shared/config.js';

// Modelos humanos com esqueleto (glTF binário em /public/models):
//  - readyplayer.me.glb: Ready Player Me, roupa em malhas separadas (aceita tingir pele, camisa e calça)
//  - ual1.glb / ual2.glb: Universal Animation Library (Quaternius, CC0) com ossos renomeados
//  - zsky.glb: chute, murro e aceno (Zsky, CC BY 4.0)
// Todos usam o esqueleto padrão do Mixamo; o GLTFLoader remove o ":" dos nomes ("mixamorigHips").

// `direct`: o esqueleto é o padrão do Mixamo e a animação é aplicada como diferença de rotação local
// em relação à pose de repouso (o retargetClip não funcionou com esses arquivos).
// `outfit`: as malhas da roupa original viram camiseta e bermuda (ver outfitRegions): `top` é a parte
// de cima, `bottom` a de baixo, `mixed` tem as duas (o que é azul na textura é o short jeans) e
// `hide` some. `skinFrom`: malha do corpo de onde sai o tom de pele das mangas e canelas repintadas.
// `detail`: quanto do relevo da textura original fica na roupa repintada.
// `drop`: peças soltas da parte de cima que somem, pelo número de vértices de cada uma (no terno do
// Ready Player Me: gravata-borboleta 220 e 63, flor 99 e 13, botões 41 e fivela 24).
// Sem `outfit`, o personagem fica com a roupa original e não troca de roupa.
export const CHARACTERS = {
  rpm: {
    file: 'readyplayer.me.glb', prefix: '', tintable: true, direct: true, detail: 0.1,
    outfit: { top: ['Wolf3D_Outfit_Top'], bottom: ['Wolf3D_Outfit_Bottom'] },
    drop: [220, 63, 99, 13, 41, 24],
  },
};

export const models = {
  ready: false,
  base: {},
  clips: {},
  height: {},
  head: {}, // { top, radius }: topo e raio da cabeça (com cabelo) em relação ao osso da cabeça, para boné e chapéu
  skin: {}, // tom de pele da textura de cada modelo do Mixamo (o do Ready Player Me vem do visual)
};

// ---------- roupa simples: camiseta e bermuda ----------

// Região de cada vértice da roupa: 0 camiseta, 1 bermuda, 2 pele (mangas e canelas), 3 escondido (capuz).
const ARM_SKIN = /(ForeArm|Hand)/;
const LEG_SKIN = /(Left|Right)(Leg|Foot|Toe)/; // canela e pé; "LeftUpLeg" (coxa) não casa
const HEAD = /Head/;

const pixelCache = new Map();
/** Pixels de uma textura (lidos uma vez, para amostrar cores na carga). */
function texPixels(tex) {
  if (pixelCache.has(tex.uuid)) return pixelCache.get(tex.uuid);
  const { image } = tex;
  const c = document.createElement('canvas');
  c.width = image.width;
  c.height = image.height;
  const ctx = c.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(image, 0, 0);
  const px = { d: ctx.getImageData(0, 0, c.width, c.height).data, w: c.width, h: c.height, flipY: tex.flipY };
  pixelCache.set(tex.uuid, px);
  return px;
}

/** Cor (sRGB, 0 a 255) da textura no UV do vértice i. */
function texel(px, uv, i) {
  const x = Math.min(px.w - 1, Math.max(0, Math.floor((uv.getX(i) % 1 + 1) % 1 * px.w)));
  const v = px.flipY ? 1 - uv.getY(i) : uv.getY(i);
  const y = Math.min(px.h - 1, Math.max(0, Math.floor(v * px.h)));
  const p = (y * px.w + x) * 4;
  return [px.d[p], px.d[p + 1], px.d[p + 2]];
}

const _col = new THREE.Color();
const lum = ([r, g, b]) => {
  _col.setRGB(r / 255, g / 255, b / 255, THREE.SRGBColorSpace);
  return 0.2126 * _col.r + 0.7152 * _col.g + 0.0722 * _col.b;
};

/**
 * Marca a região de cada vértice da roupa original pelos ossos que o movem: o que segue o antebraço
 * e a mão vira braço à mostra (manga curta), o que segue a canela vira perna à mostra (bermuda) e o
 * que segue a cabeça (capuz) ou desce mais de 12 cm abaixo do quadril (abas do paletó) some.
 * Lê as posições na pose de repouso, então roda na carga. Guarda também o brilho médio da textura
 * em cada região, para o shader manter as dobras do tecido sem escurecer a cor escolhida.
 */
function outfitRegions(mesh, role, drop) {
  const g = mesh.geometry;
  if (g.attributes.outfitRegion) return;
  const names = mesh.skeleton.bones.map((b) => b.name);
  const si = g.attributes.skinIndex;
  const sw = g.attributes.skinWeight;
  const uv = g.attributes.uv;
  const px = mesh.material.map && uv ? texPixels(mesh.material.map) : null;
  const n = g.attributes.position.count;
  const region = new Float32Array(n);
  mesh.updateMatrixWorld(true);
  const hem = mesh.skeleton.bones.find((b) => /Hips$/.test(b.name)).getWorldPosition(new THREE.Vector3()).y - 0.12;
  const p = new THREE.Vector3();
  const part = role === 'top' && drop ? partSizes(g) : null;
  const sum = [0, 0, 0];
  const cnt = [0, 0, 0];
  for (let i = 0; i < n; i++) {
    let arm = 0;
    let leg = 0;
    let head = 0;
    for (let k = 0; k < 4; k++) {
      const name = names[si.getComponent(i, k)];
      const w = sw.getComponent(i, k);
      if (ARM_SKIN.test(name)) arm += w;
      else if (LEG_SKIN.test(name)) leg += w;
      else if (HEAD.test(name)) head += w;
    }
    const c = px ? texel(px, uv, i) : null;
    let r = role === 'bottom' ? 1 : 0;
    if (role === 'mixed' && c && c[2] > c[0]) r = 1; // jeans azul no meio do moletom
    if (r === 0) {
      p.fromBufferAttribute(g.attributes.position, i);
      mesh.applyBoneTransform(i, p);
      p.applyMatrix4(mesh.matrixWorld);
    }
    if (r === 0 && (head > 0.5 || p.y < hem || part?.[i] && drop.includes(part[i]))) r = 3;
    else if (r === 0 && arm > 0.5) r = 2;
    else if (r === 1 && leg > 0.5) r = 2;
    region[i] = r;
    if (c && r < 3) { sum[r] += lum(c); cnt[r] += 1; }
  }
  g.setAttribute('outfitRegion', new THREE.BufferAttribute(region, 1));
  g.userData.outfitRef = new THREE.Vector3(...sum.map((s, i) => (cnt[i] ? s / cnt[i] : 1)));
}

/** Número de vértices da peça (parte conectada da malha, com vértices soldados pela posição) de cada vértice. */
function partSizes(g) {
  const pos = g.attributes.position;
  const n = pos.count;
  const weld = new Int32Array(n);
  const seen = new Map();
  for (let i = 0; i < n; i++) {
    const k = `${pos.getX(i).toFixed(4)},${pos.getY(i).toFixed(4)},${pos.getZ(i).toFixed(4)}`;
    if (!seen.has(k)) seen.set(k, i);
    weld[i] = seen.get(k);
  }
  const parent = Int32Array.from({ length: n }, (_, i) => i);
  const find = (x) => { while (parent[x] !== x) { parent[x] = parent[parent[x]]; x = parent[x]; } return x; };
  const idx = g.index.array;
  for (let t = 0; t < idx.length; t += 3) {
    const a = find(weld[idx[t]]);
    parent[find(weld[idx[t + 1]])] = a;
    parent[find(weld[idx[t + 2]])] = a;
  }
  const count = new Map();
  const root = Int32Array.from({ length: n }, (_, i) => find(weld[i]));
  for (const r of root) count.set(r, (count.get(r) ?? 0) + 1);
  return Array.from(root, (r) => count.get(r));
}

/** Tom de pele médio da textura, nos vértices das mãos da malha do corpo. */
function sampleSkin(mesh) {
  const g = mesh.geometry;
  const map = mesh.material.map;
  if (!map || !g.attributes.uv) return new THREE.Color('#c98d62');
  const px = texPixels(map);
  const names = mesh.skeleton.bones.map((b) => b.name);
  const si = g.attributes.skinIndex;
  const sw = g.attributes.skinWeight;
  const acc = [0, 0, 0];
  let n = 0;
  for (let i = 0; i < g.attributes.position.count; i++) {
    let w = 0;
    for (let k = 0; k < 4; k++) if (/Hand$/.test(names[si.getComponent(i, k)])) w += sw.getComponent(i, k);
    if (w < 0.9) continue;
    const c = texel(px, g.attributes.uv, i);
    acc[0] += c[0]; acc[1] += c[1]; acc[2] += c[2];
    n += 1;
  }
  if (!n) return new THREE.Color('#c98d62');
  return new THREE.Color().setRGB(acc[0] / n / 255, acc[1] / n / 255, acc[2] / n / 255, THREE.SRGBColorSpace);
}

/**
 * Material da roupa repintada: cada região ganha a cor do `outfit` (camiseta, bermuda, pele), com um
 * pouco do relevo da textura original. As cores são referências: mudar `outfit.top` muda a camiseta.
 */
function outfitMaterial(src, outfit, ref, detail = 0.35) {
  const m = src.clone();
  m.color.set('#ffffff');
  // tecido liso: sem os mapas que desenham lapelas, colete e botões de metal do terno
  m.normalMap = m.aoMap = m.roughnessMap = m.metalnessMap = m.emissiveMap = null;
  m.metalness = 0;
  m.roughness = 0.85;
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uOutfit = { value: [outfit.top, outfit.bottom, outfit.skin] };
    sh.uniforms.uOutfitRef = { value: ref };
    sh.uniforms.uOutfitDetail = { value: detail };
    // a região vai interpolada (uma por canal) e o pixel fica com a mais forte: a divisa passa pelo
    // meio do triângulo, mesmo nos compridos (abas do paletó), em vez de seguir um vértice só
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float outfitRegion;\nvarying vec4 vOutfit;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvOutfit = vec4(equal(vec4(outfitRegion), vec4(0.0, 1.0, 2.0, 3.0)));');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec4 vOutfit;\nuniform vec3 uOutfit[3];\nuniform vec3 uOutfitRef;\nuniform float uOutfitDetail;')
      .replace('#include <map_fragment>', `#include <map_fragment>
  if (vOutfit.w > 0.5) discard;
  int outfitIdx = vOutfit.x >= vOutfit.y && vOutfit.x >= vOutfit.z ? 0 : vOutfit.y >= vOutfit.z ? 1 : 2;
  float outfitRef = outfitIdx == 0 ? uOutfitRef.x : outfitIdx == 1 ? uOutfitRef.y : uOutfitRef.z;
  float outfitLum = dot(diffuseColor.rgb, vec3(0.2126, 0.7152, 0.0722));
  diffuseColor.rgb = uOutfit[outfitIdx] * mix(1.0, clamp(outfitLum / max(outfitRef, 0.001), 0.6, 1.3), uOutfitDetail);`);
  };
  m.customProgramCacheKey = () => 'outfit';
  return m;
}

/** Malha (não o nó pai) com esse nome. */
function meshByName(root, name) {
  let found = null;
  root.traverse((o) => { if (!found && o.isMesh && o.name === name) found = o; });
  return found;
}

/** Mede a cabeça pelos vértices presos ao osso Head (na pose de ligação). */
function measureHead(root, prefix) {
  const head = root.getObjectByName(`${prefix}Head`);
  if (!head) return { top: 0.23, radius: 0.1 };
  root.updateMatrixWorld(true);
  const hp = head.getWorldPosition(new THREE.Vector3());
  const pts = [];
  const v = new THREE.Vector3();
  root.traverse((m) => {
    if (!m.isSkinnedMesh || !m.visible) return;
    const g = m.geometry;
    const si = g.attributes.skinIndex;
    const sw = g.attributes.skinWeight;
    const idx = m.skeleton.bones.map((b) => /Head(Top_End)?$/.test(b.name));
    for (let i = 0; i < g.attributes.position.count; i++) {
      let w = 0;
      for (let k = 0; k < 4; k++) if (idx[si.getComponent(i, k)]) w += sw.getComponent(i, k);
      if (w < 0.5) continue;
      v.fromBufferAttribute(g.attributes.position, i);
      m.applyBoneTransform(i, v);
      v.applyMatrix4(m.matrixWorld);
      pts.push([v.x - hp.x, v.y - hp.y, v.z - hp.z]);
    }
  });
  if (!pts.length) return { top: 0.23, radius: 0.1, cx: 0, cz: 0 };
  // 1) topo bruto (percentil 99,5) e centro da faixa alta da cabeça pelo ponto médio dos extremos
  //    (o osso fica na nuca; a média dos vértices puxaria para o rosto, que tem mais vértices)
  const ys = pts.map((p) => p[1]).sort((a, b) => a - b);
  const top0 = ys[Math.min(ys.length - 1, Math.floor(ys.length * 0.995))];
  const ext = (lo, hi) => {
    const e = { minx: 9, maxx: -9, minz: 9, maxz: -9, n: 0 };
    for (const [x, y, z] of pts) {
      if (y < lo || y > hi) continue;
      e.minx = Math.min(e.minx, x); e.maxx = Math.max(e.maxx, x); e.minz = Math.min(e.minz, z); e.maxz = Math.max(e.maxz, z); e.n += 1;
    }
    return e;
  };
  const e0 = ext(top0 - 0.12, top0);
  const cx = (e0.minx + e0.maxx) / 2;
  const cz = (e0.minz + e0.maxz) / 2;
  // 2) topo só da coroa (7 cm em volta do centro), para ignorar coque e rabo de cavalo
  let top = top0 - 0.08;
  for (const [x, y, z] of pts) if (Math.hypot(x - cx, z - cz) < 0.07 && y > top) top = y;
  // 3) meio-comprimento/largura na altura da aba do boné (8 a 12 cm abaixo do topo)
  const e1 = ext(top - 0.12, top - 0.08);
  const radius = e1.n ? Math.max((e1.maxx - e1.minx) / 2, (e1.maxz - e1.minz) / 2) : 0.1;
  return { top, radius, cx: e1.n ? (e1.minx + e1.maxx) / 2 : cx, cz: e1.n ? (e1.minz + e1.maxz) / 2 : cz };
}

const loader = new GLTFLoader();
const load = (file, onProgress) => loader.loadAsync(`/models/${file}`, onProgress);

/** Espera o navegador pintar, para a tela de carregamento atualizar antes de um trabalho pesado. */
export const nextPaint = () => new Promise((resolve) => { requestAnimationFrame(() => setTimeout(resolve, 0)); });

function findSkinned(root, name) {
  if (name) return root.getObjectByName(name);
  let best = null;
  root.traverse((o) => { if (o.isSkinnedMesh && (!best || o.skeleton.bones.length > best.skeleton.bones.length)) best = o; });
  return best;
}

/** Remove a escala das faixas (deixa o mixer mais leve). */
/** Id do modelo para o corpo (0 masculino, 1 feminino) e o rosto escolhido. */
export function modelId(body, face = 0) {
  const list = MODELS[body === 1 ? 'female' : 'male'];
  return list[Math.min(Math.max(0, face | 0), list.length - 1)];
}

/** `onStage('download', 0..1)` durante o download; `onStage('prepare')` ao montar os modelos. */
export async function loadModels(onStage) {
  if (models.ready) return models;
  const ids = Object.keys(CHARACTERS);
  // ual1/ual2: Universal Animation Library (Quaternius, CC0) com os ossos renomeados para o padrão Mixamo (src/dev-rig.js)
  // zsky.glb: chute, murro e aceno do pacote Animated Character (Zsky, CC BY 4.0), refeitos no padrão Mixamo
  const files = ['ual1.glb', 'ual2.glb', 'zsky.glb', ...ids.map((id) => CHARACTERS[id].file)];
  const done = files.map(() => 0); // fração baixada de cada arquivo
  const report = () => onStage?.('download', done.reduce((a, b) => a + b, 0) / files.length);
  const [ual1, ual2, zsky, ...gltfs] = await Promise.all(files.map((file, i) => load(file, (e) => {
    if (e.lengthComputable && e.total) { done[i] = Math.max(done[i], Math.min(0.99, e.loaded / e.total)); report(); }
  }).then((gltf) => { done[i] = 1; report(); return gltf; })));
  onStage?.('prepare');
  await nextPaint();

  const skins = {};
  ids.forEach((id, i) => {
    const root = gltfs[i].scene;
    root.updateMatrixWorld(true);
    root.traverse((o) => {
      if (!o.isMesh) return;
      o.castShadow = true;
      o.receiveShadow = true;
      if (o.material?.map) o.material.map.anisotropy = 4;
    });
    models.base[id] = root;
    const box = new THREE.Box3().setFromObject(root);
    models.height[id] = box.max.y - box.min.y;
    models.head[id] = measureHead(root, CHARACTERS[id].prefix);
    skins[id] = id === 'rpm' ? findSkinned(root, 'Wolf3D_Body') : findSkinned(root);
    const { outfit, skinFrom, drop } = CHARACTERS[id];
    for (const [role, names] of Object.entries(outfit ?? {})) {
      if (role === 'hide') continue;
      for (const name of names) {
        const m = meshByName(root, name);
        if (m) outfitRegions(m, role, drop);
      }
    }
    if (skinFrom) {
      const body = meshByName(root, skinFrom);
      if (body) models.skin[id] = sampleSkin(body);
    }
  });
  pixelCache.clear(); // os pixels só servem para medir na carga

  const ualSkin1 = findSkinned(ual1.scene);
  const ualSkin2 = findSkinned(ual2.scene);
  for (const sk of [ualSkin1, ualSkin2]) sk.visible = false;
  const u1 = Object.fromEntries(ual1.animations.map((c) => [c.name, c]));
  const u2 = Object.fromEntries(ual2.animations.map((c) => [c.name, c]));

  // Poses de repouso das fontes e dos alvos diretos, lidas ANTES de qualquer retarget mexer nos ossos:
  // rotação local do osso e rotação (no mundo) do pai dele.
  // retargetClip mexe nos ossos do modelo-alvo (inclusive a escala); guarda a pose original para restaurar
  const rest = [];
  for (const id of ids) {
    for (const b of skins[id].skeleton.bones) rest.push([b, b.position.clone(), b.quaternion.clone(), b.scale.clone()]);
  }

  // O repouso dos arquivos nem sempre é a T-pose; as fontes têm o clipe "TPose", que serve de referência.
  const restInfo = (root, poseClip) => {
    let mixer = null;
    if (poseClip) {
      mixer = new THREE.AnimationMixer(root);
      mixer.clipAction(poseClip).play();
      mixer.update(0);
    }
    root.updateMatrixWorld(true);
    const m = new Map();
    root.traverse((o) => {
      // um GLB só de animação não tem skin, e os ossos chegam como nós comuns
      if (!o.isBone && !/^mixamorig/.test(o.name)) return;
      m.set(o.name, {
        pos: o.position.clone(),
        wpos: o.getWorldPosition(new THREE.Vector3()),
        ps: o.parent.getWorldScale(new THREE.Vector3()).x, // escala do pai: o Mixamo vem em cm (raiz 0,01), o resto em metros
        local: o.quaternion.clone(),
        world: o.getWorldQuaternion(new THREE.Quaternion()),
        parentWorld: o.parent.getWorldQuaternion(new THREE.Quaternion()),
      });
    });
    if (mixer) { mixer.stopAllAction(); mixer.uncacheRoot(root); }
    return m;
  };
  const restUal1 = restInfo(ual1.scene, u1.TPose);
  const restUal2 = restInfo(ual2.scene, u2.TPose);
  const restZsky = restInfo(zsky.scene);
  const uz = Object.fromEntries(zsky.animations.map((c) => [c.name, c]));
  const restTargets = {};
  for (const id of ids) {
    if (!CHARACTERS[id].direct) continue;
    // quem foi ligado em outra pose traz o clipe TPose como referência
    const tpose = gltfs[ids.indexOf(id)].animations.find((c) => c.name === 'TPose');
    restTargets[id] = restInfo(models.base[id], tpose);
  }

  // Nome do osso no alvo: o Ready Player Me não tem o prefixo "mixamorig"
  const boneName = (id, name) => (CHARACTERS[id].prefix ? name : name.replace(/^mixamorig/, ''));
  // Cadeia principal: o filho que define a direção de cada osso
  const CHAIN = {
    Hips: 'Spine', Spine: 'Spine1', Spine1: 'Spine2', Spine2: 'Neck', Neck: 'Head',
    LeftShoulder: 'LeftArm', LeftArm: 'LeftForeArm', LeftForeArm: 'LeftHand', LeftHand: 'LeftHandMiddle1',
    RightShoulder: 'RightArm', RightArm: 'RightForeArm', RightForeArm: 'RightHand', RightHand: 'RightHandMiddle1',
    LeftUpLeg: 'LeftLeg', LeftLeg: 'LeftFoot', LeftFoot: 'LeftToeBase', RightUpLeg: 'RightLeg', RightLeg: 'RightFoot', RightFoot: 'RightToeBase',
  };
  for (const f of ['Thumb', 'Index', 'Middle', 'Ring', 'Pinky']) {
    for (const sd of ['Left', 'Right']) { CHAIN[`${sd}Hand${f}1`] = `${sd}Hand${f}2`; CHAIN[`${sd}Hand${f}2`] = `${sd}Hand${f}3`; }
  }
  /**
   * As "T-poses" dos esqueletos não são iguais (no Mixamo as pernas abrem em "A"; no Ready Player Me os braços
   * ficam em "A"). Como a animação é transferida como diferença em relação ao repouso, qualquer desvio entre os
   * repousos vira um desvio constante na pose. Aqui o alvo é posto na T-pose DA FONTE: cada osso é girado no mundo
   * para apontar na mesma direção que o osso correspondente da fonte, e essa pose vira o repouso do alvo.
   */
  const alignedCache = new WeakMap();
  const alignedRest = (id, restSrc, global) => {
    let perId = alignedCache.get(restSrc);
    if (!perId) { perId = new Map(); alignedCache.set(restSrc, perId); }
    if (perId.has(id)) return perId.get(id);
    const root = models.base[id];
    const rt = restTargets[id];
    const byName = new Map();
    root.traverse((o) => { if (o.isBone) byName.set(o.name, o); });
    const saved = [...byName.values()].map((b) => [b, b.quaternion.clone()]);
    for (const [name, r] of rt) byName.get(name)?.quaternion.copy(r.local);
    root.updateMatrixWorld(true);
    const pw = new THREE.Vector3();
    const cw = new THREE.Vector3();
    root.traverse((o) => { // pré-ordem: pais antes dos filhos
      if (!o.isBone) return;
      const base = o.name.replace(/^mixamorig/, '');
      const childBase = CHAIN[base];
      if (!childBase) return;
      const cb = byName.get(boneName(id, `mixamorig${childBase}`));
      const rsA = restSrc.get(`mixamorig${base}`);
      const rsC = restSrc.get(`mixamorig${childBase}`);
      if (!cb || !rsA || !rsC) return;
      const ds = rsC.wpos.clone().sub(rsA.wpos).applyQuaternion(global).normalize();
      o.getWorldPosition(pw);
      cb.getWorldPosition(cw);
      const dt = cw.sub(pw).normalize();
      const q = new THREE.Quaternion().setFromUnitVectors(dt, ds);
      const wq = o.getWorldQuaternion(new THREE.Quaternion()).premultiply(q);
      const pq = o.parent.getWorldQuaternion(new THREE.Quaternion()).invert();
      o.quaternion.copy(pq.multiply(wq));
      o.updateMatrixWorld(true);
    });
    const info = restInfo(root);
    for (const [b, q] of saved) b.quaternion.copy(q);
    root.updateMatrixWorld(true);
    perId.set(id, info);
    return info;
  };

  /**
   * Passa a animação de um esqueleto Mixamo para outro com a mesma pose de repouso no mundo (T-pose).
   * Os eixos locais dos ossos diferem entre os arquivos, então a rotação aplicada ao repouso é levada
   * pelo mundo: P_alvo = Wp_alvo⁻¹ · Wp_fonte · (q_fonte · repouso_fonte⁻¹) · Wp_fonte⁻¹ · Wp_alvo.
   * O quadril também recebe a translação (balanço vertical da passada e, na dança, o balanço lateral),
   * levada pelo mesmo referencial e sem deriva: a média do clipe é descontada.
   */
  const directClip = (id, clip, restSrc, hipsMode = 'vertical') => {
    const restRaw = restTargets[id];
    // rotação global (giro em Y) entre as T-poses, pelo eixo braço esquerdo → braço direito de cada esqueleto:
    // não depende da convenção de eixos do osso do quadril, que muda entre Mixamo, Rigify e Unreal
    const lateral = (rest, tgt = false) => {
      const n = (x) => (tgt ? boneName(id, x) : x);
      const d = rest.get(n('mixamorigLeftArm')).wpos.clone().sub(rest.get(n('mixamorigRightArm')).wpos);
      return Math.atan2(d.z, d.x);
    };
    const global = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), lateral(restSrc) - lateral(restRaw, true));
    const restTarget = alignedRest(id, restSrc, global);
    const tracks = [];
    const q = new THREE.Quaternion();
    const conj = new THREE.Quaternion();
    const HIPS = 'mixamorigHips';
    const HIPS_T = boneName(id, HIPS);
    const hipsTrack = clip.tracks.find((t) => t.name === `${HIPS}.position`);
    if (hipsMode !== 'none' && hipsTrack && restTarget.has(HIPS_T) && restSrc.has(HIPS)) {
      const rs = restSrc.get(HIPS);
      const rt = restTarget.get(HIPS_T);
      const toTarget = rt.parentWorld.clone().invert().multiply(global).multiply(rs.parentWorld);
      const n = hipsTrack.values.length / 3;
      const deltas = [];
      const sum = new THREE.Vector3();
      // unidades: o deslocamento do quadril vem nas unidades locais da fonte (cm no Mixamo, m na UAL) e entra nas do
      // alvo; converte pelo mundo (escala do pai de cada esqueleto)
      const unit = rs.ps / rt.ps; // sem razão de alturas: o tamanho dos corpos é parecido 
      for (let i = 0; i < n; i++) {
        const d = new THREE.Vector3().fromArray(hipsTrack.values, i * 3).sub(rs.pos).multiplyScalar(unit).applyQuaternion(toTarget);
        if (hipsMode === 'vertical') { // só o movimento vertical, no referencial do mundo
          const w = d.applyQuaternion(rt.parentWorld);
          w.x = 0;
          w.z = 0;
          d.copy(w).applyQuaternion(rt.parentWorld.clone().invert());
        }
        deltas.push(d);
        sum.add(d);
      }
      sum.divideScalar(n);
      const out = new Float32Array(n * 3);
      deltas.forEach((d, i) => d.sub(sum).add(rt.pos).toArray(out, i * 3));
      tracks.push(new THREE.VectorKeyframeTrack(`${HIPS_T}.position`, hipsTrack.times.slice(), out));
    }
    for (const t of clip.tracks) {
      const m = t.name.match(/^(.+)\.quaternion$/);
      if (!m) continue;
      const tn = boneName(id, m[1]);
      if (!restTarget.has(tn) || !restSrc.has(m[1])) continue;
      const rs = restSrc.get(m[1]);
      const rt = restTarget.get(tn);
      const rsInv = rs.local.clone().invert();
      const toTarget = rt.parentWorld.clone().invert().multiply(global).multiply(rs.parentWorld); // pai-fonte -> pai-alvo
      const out = new Float32Array(t.values.length);
      for (let i = 0; i < t.values.length; i += 4) {
        q.fromArray(t.values, i).multiply(rsInv); // rotação aplicada ao repouso, no referencial do pai-fonte
        conj.copy(toTarget).invert();
        q.premultiply(toTarget).multiply(conj); // levada ao referencial do pai-alvo
        q.multiply(rt.local); // aplicada ao repouso do alvo
        q.toArray(out, i);
      }
      tracks.push(new THREE.QuaternionKeyframeTrack(`${tn}.quaternion`, t.times.slice(), out));
    }
    return new THREE.AnimationClip(clip.name, clip.duration, tracks);
  };

  // ---- ajustes de naturalidade (só nos corpos do Mixamo) ----
  // Poses fixas usadas por `relaxHands` (mão relaxada nos clipes).
  const Z = new THREE.Vector3(0, 0, 1);
  const X = new THREE.Vector3(1, 0, 0);
  const rotateWorld = (bone, axis, a) => {
    const wq = bone.getWorldQuaternion(new THREE.Quaternion());
    const pq = bone.parent.getWorldQuaternion(new THREE.Quaternion());
    wq.premultiply(new THREE.Quaternion().setFromAxisAngle(axis, a));
    bone.quaternion.copy(pq.invert().multiply(wq));
    bone.updateMatrixWorld(true);
  };
  const FINGERS = ['Index', 'Middle', 'Ring', 'Pinky'];
  const posed = {}; // id -> { relaxed: Map(nome -> quaternion local), fingers: Map }
  for (const id of ids) {
    if (!CHARACTERS[id].direct) continue;
    const root = models.base[id];
    const rt = restTargets[id];
    const byName = new Map();
    root.traverse((o) => { if (o.isBone) byName.set(o.name, o); });
    const saved = [...byName.values()].map((b) => [b, b.quaternion.clone()]);
    for (const [name, r] of rt) byName.get(name)?.quaternion.copy(r.local); // T-pose
    root.updateMatrixWorld(true);
    const P = 'mixamorig';
    // braços ao lado do corpo, cotovelos levemente dobrados
    for (const sd of [1, -1]) {
      const side = sd > 0 ? 'Left' : 'Right';
      const arm = byName.get(`${P}${side}Arm`);
      const fore = byName.get(`${P}${side}ForeArm`);
      if (arm) rotateWorld(arm, Z, -sd * THREE.MathUtils.degToRad(76));
      if (fore) rotateWorld(fore, X, -THREE.MathUtils.degToRad(14));
    }
    const relaxed = new Map();
    for (const side of ['Left', 'Right']) {
      for (const part of ['Arm', 'ForeArm']) {
        const b = byName.get(`${P}${side}${part}`);
        if (b) relaxed.set(b.name, b.quaternion.clone());
      }
      for (const part of ['UpLeg', 'Leg', 'Foot']) { // pernas retas como na T-pose
        const name = `${P}${side}${part}`;
        if (rt.has(name)) relaxed.set(name, rt.get(name).local.clone());
      }
    }
    // dedos levemente curvados (mão relaxada), falange por falange; o polegar fecha um pouco
    for (const [name, r] of rt) byName.get(name)?.quaternion.copy(r.local);
    root.updateMatrixWorld(true);
    const fingers = new Map();
    for (const sd of [1, -1]) {
      const side = sd > 0 ? 'Left' : 'Right';
      FINGERS.forEach((f, k) => {
        for (let j = 1; j <= 3; j++) {
          const b = byName.get(`${P}${side}Hand${f}${j}`);
          if (!b) continue;
          rotateWorld(b, Z, -sd * THREE.MathUtils.degToRad([22, 34, 24][j - 1] + k * 4));
          fingers.set(b.name, b.quaternion.clone());
        }
      });
      for (let j = 2; j <= 3; j++) {
        const b = byName.get(`${P}${side}HandThumb${j}`);
        if (!b) continue;
        rotateWorld(b, new THREE.Vector3(0, 1, 0), sd * THREE.MathUtils.degToRad(18));
        fingers.set(b.name, b.quaternion.clone());
      }
    }
    for (const [b, q] of saved) b.quaternion.copy(q);
    root.updateMatrixWorld(true);
    posed[id] = { relaxed, fingers };
  }

  /** Troca as faixas dos dedos por uma mão relaxada (fixa). */
  const relaxHands = (id, clip) => {
    const { fingers } = posed[id];
    clip.tracks = clip.tracks.filter((t) => !fingers.has(t.name.replace(/\.quaternion$/, '')) || !t.name.endsWith('.quaternion'));
    for (const [name, q] of fingers) clip.tracks.push(new THREE.QuaternionKeyframeTrack(`${name}.quaternion`, [0, clip.duration || 1], [...q.toArray(), ...q.toArray()]));
    return clip;
  };
  const ARMS = ['LeftArm', 'RightArm', 'LeftForeArm', 'RightForeArm'];

  for (const id of ids) {
    if (CHARACTERS[id].direct) {
      const d1 = (name, hips) => directClip(id, u1[name], restUal1, hips);
      const d2 = (name, hips) => directClip(id, u2[name], restUal2, hips);
      const dz = (name, hips) => relaxHands(id, directClip(id, uz[name], restZsky, hips));
      models.clips[id] = {
        idle: d1('idle'),
        walk: d1('walk'),
        run: d1('run'),
        dance: relaxHands(id, d1('dance2', 'full')),
        punch: d1('punch'),
        jab: d1('jab'),
        hook: d2('hook'),
        baton: d1('baton'),
        hit: d1('hit'),
        hitHead: d1('hitHead'),
        knockback: d2('knockback'),
        throw: d2('throw'),
        call: d2('call'),
        yes: d2('yes'),
        no: d2('no'),
        drive: d1('drive'),
        talk: d1('talk'),
        kick: dz('kick'),
        punchR: dz('punchR'),
        wave: dz('wave'),
      };
      for (const [name, clip] of Object.entries(models.clips[id])) clip.name = `${id}-${name}`;
      continue;
    }
    throw new Error(`corpo sem conversão direta: ${id}`);
    for (const [name, clip] of Object.entries(models.clips[id])) clip.name = `${id}-${name}`;
  }
  for (const [bone, pos, quat, scl] of rest) {
    bone.position.copy(pos);
    bone.quaternion.copy(quat);
    bone.scale.copy(scl);
  }
  for (const id of ids) models.base[id].updateMatrixWorld(true);
  models.ready = true;
  return models;
}

/**
 * Clona um corpo. Devolve a raiz, o SkinnedMesh principal, os ossos úteis, as malhas por nome
 * e os materiais tingíveis (já clonados, para não afetar os outros personagens).
 */
export function createCharacter(id) {
  const def = CHARACTERS[id];
  const root = SkeletonUtils.clone(models.base[id]);
  const p = def.prefix;
  const bone = (name) => root.getObjectByName(p + name);
  const meshes = {};
  root.traverse((o) => { if (o.isMesh) meshes[o.name] = o; });

  for (const [name, m] of Object.entries(meshes)) if (/mask$/i.test(name)) m.visible = false; // máscara cirúrgica da Ch16

  const mats = {};
  if (def.tintable) {
    const tint = (meshName, key) => {
      const m = meshes[meshName];
      if (!m) return;
      m.material = m.material.clone();
      mats[key] = m.material;
    };
    tint('Wolf3D_Head', 'skinHead');
    tint('Wolf3D_Body', 'skinBody');
  } else {
    // personagens com textura própria: materiais clonados para poder envelhecer o cabelo
    for (const [name, m] of Object.entries(meshes)) {
      if (!/hair/i.test(name)) continue;
      m.material = m.material.clone();
      mats.hair = m.material;
    }
  }

  // camiseta e bermuda: cores trocadas por quem usa (avatar.js, crowd.js); a pele começa no tom da textura
  let outfit = null;
  if (def.outfit) {
    outfit = { top: new THREE.Color('#f4f4f2'), bottom: new THREE.Color('#35507a'), skin: (models.skin[id] ?? new THREE.Color('#c98d62')).clone() };
    for (const [role, names] of Object.entries(def.outfit)) {
      for (const name of names) {
        const m = meshes[name];
        if (!m) continue;
        if (role === 'hide') m.visible = false;
        else m.material = outfitMaterial(m.material, outfit, m.geometry.userData.outfitRef, def.detail);
      }
    }
  }

  return {
    id,
    kind: MODELS.female.includes(id) ? 'female' : 'male',
    tintable: !!def.tintable,
    outfit,
    skinTone: models.skin[id] ?? null,
    root,
    skin: id === 'rpm' ? findSkinned(root, 'Wolf3D_Body') : findSkinned(root),
    meshes,
    mats,
    bones: {
      hips: bone('Hips'),
      spine1: bone('Spine1'),
      spine2: bone('Spine2'),
      neck: bone('Neck'),
      head: bone('Head'),
      leftArm: bone('LeftArm'),
      leftForeArm: bone('LeftForeArm'),
      leftHand: bone('LeftHand'),
      rightArm: bone('RightArm'),
      rightForeArm: bone('RightForeArm'),
      rightHand: bone('RightHand'),
      leftUpLeg: bone('LeftUpLeg'),
      leftLeg: bone('LeftLeg'),
      leftFoot: bone('LeftFoot'),
      rightUpLeg: bone('RightUpLeg'),
      rightLeg: bone('RightLeg'),
      rightFoot: bone('RightFoot'),
    },
    clips: models.clips[id],
    height: models.height[id],
    head: models.head[id],
  };
}
