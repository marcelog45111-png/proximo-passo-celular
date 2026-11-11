// As colunas da evolucao por semana em 3D (11/11/2026, pedido: "uma planilha de evolucao do
// treino ao longo de cada semana", com as skills threejs-webgl, core-3d-animation e
// gsap-scrolltrigger). Uma coluna por semana, da mais velha (esquerda) a esta (direita).
// O three.js do app e enxuto (vendor/three.min.js: so as pecas da barra, sem luzes nem camera
// ortografica). Por isso a luz e pintada: cada face da caixa tem o seu tom (tampa clara, frente
// media, lados escuros), em material sem luz, o mais barato para o iPhone. A camera e de
// perspectiva com angulo bem fechado e longe: quase sem fuga, as colunas ficam no mesmo x das
// legendas do DOM. Desempenho (o que pesava no iPhone ao trocar de dia): desenha so quando algo
// muda, 1,5x de pixels na tela de toque, e ao fechar a folha tudo e liberado.
import * as THREE from '../vendor/three.min.js';

const g = () => window.gsap ?? null;
const menos = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
const COR_A = new THREE.Color('#39e27a');
const COR_B = new THREE.Color('#5bd4e4');
const COR_VAZIA = new THREE.Color('#2d3430');
const PASSO = 1.2;
const ALTURA = 2.4;
// tom de cada face da caixa: +x, -x, tampa, fundo, frente, tras
const TONS = [0.5, 0.42, 1.18, 0.2, 0.82, 0.3];

/**
 * Monta as colunas em `host`. `valores`: numero por semana. `atual`: indice da semana de agora.
 * Devolve { mudar(valores), destacar(i|null), destruir() }.
 */
export function criarColunas(host, valores, atual = valores.length - 1) {
  const n = valores.length;
  const canvas = document.createElement('canvas');
  canvas.className = 'evo-3d';
  canvas.setAttribute('aria-hidden', 'true');
  const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true, powerPreference: 'low-power' });
  renderer.setPixelRatio(Math.min(matchMedia('(pointer: coarse)').matches ? 1.5 : 2, window.devicePixelRatio || 1));
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  const cena = new THREE.Scene();
  const largura = n * PASSO;
  const FOV = 9;
  const camera = new THREE.PerspectiveCamera(FOV, 2, 1, 200);
  const ALVO = new THREE.Vector3(0, 1.15, 0);

  const chao = new THREE.Mesh(new THREE.BoxGeometry(largura - 0.15, 0.05, 1.15), new THREE.MeshBasicMaterial({ color: 0x1b2220 }));
  chao.position.y = -0.03;
  cena.add(chao);

  const geo = new THREE.BoxGeometry(0.74, 1, 0.74);
  geo.translate(0, 0.5, 0); // cresce de baixo para cima pela escala em y
  const colunas = valores.map((_, i) => {
    const cor = COR_A.clone().lerp(COR_B, n === 1 ? 1 : i / (n - 1));
    const faces = TONS.map(() => new THREE.MeshBasicMaterial({ transparent: true, opacity: 1 }));
    const m = new THREE.Mesh(geo, faces);
    m.position.x = (i - (n - 1) / 2) * PASSO;
    m.scale.y = 0.001;
    m.userData = { cor, vazia: false, brilho: i === atual ? 1.12 : 1, opacidade: 1 };
    cena.add(m);
    return m;
  });
  const pintar = (c) => {
    const { cor, vazia, brilho, opacidade } = c.userData;
    c.material.forEach((mat, f) => {
      mat.color.copy(vazia ? COR_VAZIA : cor).multiplyScalar(Math.min(1.35, TONS[f] * (vazia ? 1 : brilho)));
      mat.opacity = opacidade;
    });
  };
  colunas.forEach(pintar);

  let pendente = false;
  const pedir = () => {
    if (pendente) return;
    pendente = true;
    requestAnimationFrame(() => { pendente = false; renderer.render(cena, camera); });
  };

  // A camera fica longe o bastante para a largura das colunas caber na tela, olhando um pouco de cima.
  const medir = () => {
    const l = host.clientWidth;
    const a = host.clientHeight;
    if (l === 0 || a === 0) return;
    renderer.setSize(l, a, false);
    camera.aspect = l / a;
    const horizontal = 2 * Math.atan(Math.tan(THREE.MathUtils.degToRad(FOV / 2)) * camera.aspect);
    const dist = (largura / 2 + 0.2) / Math.tan(horizontal / 2);
    camera.position.set(0, ALVO.y + dist * 0.2, dist);
    camera.lookAt(ALVO);
    camera.updateProjectionMatrix();
    pedir();
  };
  const observador = new ResizeObserver(medir);
  observador.observe(host);
  host.append(canvas);
  medir();

  const alturas = (vals) => {
    const max = Math.max(...vals, 0);
    return vals.map((v) => (max <= 0 || v <= 0 ? 0.04 : Math.max(0.08, (v / max) * ALTURA)));
  };

  function mudar(vals) {
    colunas.forEach((c, i) => { c.userData.vazia = !(vals[i] > 0); pintar(c); });
    const hs = alturas(vals);
    const gs = g();
    if (!gs || menos()) {
      colunas.forEach((c, i) => { c.scale.y = hs[i]; });
      pedir();
      return;
    }
    // cresce da esquerda para a direita: a semana de agora chega por ultimo
    gs.to(colunas.map((c) => c.scale), { y: (i) => hs[i], duration: 0.9, stagger: 0.06, ease: 'power3.out', onUpdate: pedir });
  }

  function destacar(i) {
    const gs = g();
    colunas.forEach((c, k) => {
      const alvo = { opacidade: i === null || k === i ? 1 : 0.3, brilho: k === i || (i === null && k === atual) ? 1.12 : 1 };
      if (gs && !menos()) gs.to(c.userData, { ...alvo, duration: 0.3, ease: 'power2.out', onUpdate: () => { pintar(c); pedir(); } });
      else { Object.assign(c.userData, alvo); pintar(c); }
    });
    pedir();
  }

  mudar(valores);

  return {
    mudar,
    destacar,
    destruir() {
      observador.disconnect();
      g()?.killTweensOf(colunas.map((c) => c.scale));
      g()?.killTweensOf(colunas.map((c) => c.userData));
      for (const c of colunas) c.material.forEach((m) => m.dispose());
      geo.dispose();
      chao.geometry.dispose();
      chao.material.dispose();
      renderer.dispose();
      renderer.forceContextLoss?.();
      canvas.remove();
    },
  };
}
