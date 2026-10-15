import * as THREE from 'three';

export const SUN_DIR = new THREE.Vector3(-0.45, 0.78, 0.42).normalize();

const vertex = /* glsl */ `
  varying vec3 vDir;
  void main() {
    vDir = normalize(position);
    vec4 p = modelViewMatrix * vec4(position, 1.0);
    gl_Position = projectionMatrix * p;
  }
`;

const fragment = /* glsl */ `
  uniform vec3 top;
  uniform vec3 mid;
  uniform vec3 horizon;
  uniform vec3 sunDir;
  varying vec3 vDir;
  void main() {
    vec3 d = normalize(vDir);
    float h = clamp(d.y, -0.2, 1.0);
    vec3 col = mix(horizon, mid, smoothstep(0.0, 0.25, h));
    col = mix(col, top, smoothstep(0.2, 0.9, h));
    float s = max(dot(d, normalize(sunDir)), 0.0);
    col += vec3(1.0, 0.92, 0.75) * (pow(s, 900.0) * 6.0 + pow(s, 24.0) * 0.28 + pow(s, 5.0) * 0.08);
    if (d.y < 0.0) col = mix(col, horizon * 0.8, smoothstep(0.0, -0.2, d.y));
    gl_FragColor = vec4(col, 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

function skyMaterial() {
  return new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
    uniforms: {
      top: { value: new THREE.Color('#2f6fc4') },
      mid: { value: new THREE.Color('#79aee6') },
      horizon: { value: new THREE.Color('#d6e6f2') },
      sunDir: { value: SUN_DIR },
    },
    vertexShader: vertex,
    fragmentShader: fragment,
  });
}

function cloudTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const ctx = c.getContext('2d');
  for (let i = 0; i < 14; i++) {
    const x = 30 + Math.random() * 68;
    const y = 50 + Math.random() * 28;
    const r = 18 + Math.random() * 26;
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, 'rgba(255,255,255,0.55)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 128, 128);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** Céu em degradê com sol, nuvens e mapa de ambiente para reflexos nos vidros. */
export function createSky(scene, renderer, rng = Math.random) {
  const dome = new THREE.Mesh(new THREE.SphereGeometry(900, 32, 16), skyMaterial());
  dome.renderOrder = -10;
  scene.add(dome);

  const tex = cloudTexture();
  for (let i = 0; i < 22; i++) {
    const m = new THREE.Sprite(new THREE.SpriteMaterial({
      map: tex, transparent: true, opacity: 0.8, depthWrite: false, fog: false,
    }));
    const a = rng() * Math.PI * 2;
    const dist = 350 + rng() * 350;
    m.position.set(Math.cos(a) * dist, 120 + rng() * 160, Math.sin(a) * dist);
    m.scale.setScalar(220 + rng() * 260);
    scene.add(m);
  }

  // mapa de ambiente gerado do próprio céu
  const pmrem = new THREE.PMREMGenerator(renderer);
  const envScene = new THREE.Scene();
  envScene.add(new THREE.Mesh(new THREE.SphereGeometry(100, 32, 16), skyMaterial()));
  scene.environment = pmrem.fromScene(envScene, 0.02).texture;
  scene.environmentIntensity = 0.55;
  pmrem.dispose();

  return { dome };
}
