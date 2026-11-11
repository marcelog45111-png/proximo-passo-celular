// A barra do treino (07/11/2026): o progresso do dia em 3D, em Three.js.
//
// Cada exercicio e uma anilha. Sem nenhuma serie ela e um fantasma na luva; cada
// serie da corpo a ela; a ultima serie a encaixa com impacto. Treino fechado, a
// barra sobe. Nao e enfeite: da para ler o dia olhando para ela.
//
// So desenha quando algo muda (nada de laco infinito: e o celular de quem esta
// treinando, com bateria). Sem WebGL, criarCena lanca e o app fica com a barra
// fina de sempre.

import * as THREE from '../vendor/three.min.js';

const COR_A = new THREE.Color('#39e27a');
const COR_B = new THREE.Color('#5bd4e4');
const COR_FANTASMA = new THREE.Color('#7f8b86');
const COR_BORRACHA = new THREE.Color('#333b37');
const COR_CARDIO = new THREE.Color('#ff8a4c');

// A barra e mais curta que uma olimpica de verdade: no celular, o que importa sao as anilhas.
const INICIO_LUVA = 1.9;
const LARGURA_LUVAS = 1.9;
const LARGO_DA_ANILHA = 0.26;

const menosMovimento = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
const g = () => window.gsap ?? null;

/** Sala escura com tiras de luz: e o que o aco reflete. */
function salaDeLuz() {
  const sala = new THREE.Scene();
  sala.add(new THREE.Mesh(new THREE.BoxGeometry(30, 30, 30), new THREE.MeshBasicMaterial({ color: 0x050807, side: THREE.BackSide })));
  const tira = (cor, forca, l, a, x, y, z) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(l, a), new THREE.MeshBasicMaterial({ color: new THREE.Color(cor).multiplyScalar(forca), side: THREE.DoubleSide }));
    m.position.set(x, y, z);
    m.lookAt(0, 0, 0);
    sala.add(m);
  };
  tira('#ffffff', 9, 20, 2.2, 0, 12, 3);
  tira('#ffffff', 2.4, 3, 12, -13, 3, 7);
  tira('#39e27a', 5, 2.4, 10, 13, -2, 4);
  tira('#5bd4e4', 5, 14, 1.4, 0, -6, 12);
  return sala;
}

/** Perfil de anilha de borracha: cubo, rebaixo e aro. Raio 1 e largura 1; cada anilha so escala. */
function geometriaDaAnilha() {
  const p = [[0.13, -0.5], [0.25, -0.5], [0.29, -0.36], [0.72, -0.36], [0.78, -0.5], [0.965, -0.5], [1, -0.43], [1, 0.43], [0.965, 0.5], [0.78, 0.5], [0.72, 0.36], [0.29, 0.36], [0.25, 0.5], [0.13, 0.5]];
  const g3 = new THREE.LatheGeometry(p.map(([r, y]) => new THREE.Vector2(r, y)), 64);
  g3.rotateZ(Math.PI / 2);
  return g3;
}

/** A escrita no rebaixo: e ela que deixa ver a barra girar. */
function texturaDaFace() {
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = 512;
  const x = c.getContext('2d');
  x.clearRect(0, 0, 512, 512);
  x.translate(256, 256);
  x.fillStyle = 'rgba(232,240,236,.86)';
  x.font = "700 40px 'Big Shoulders Display', system-ui, sans-serif";
  x.textAlign = 'center';
  x.textBaseline = 'middle';
  const texto = 'PRÓXIMO PASSO · PRÓXIMO PASSO · ';
  [...texto].forEach((letra, i) => {
    x.save();
    x.rotate((i / texto.length) * Math.PI * 2);
    x.translate(0, -186);
    x.fillText(letra, 0, 0);
    x.restore();
  });
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

function brilhoDoChao() {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 64;
  const x = c.getContext('2d');
  const r = x.createRadialGradient(128, 32, 0, 128, 32, 128);
  r.addColorStop(0, 'rgba(255,255,255,1)');
  r.addColorStop(1, 'rgba(255,255,255,0)');
  x.fillStyle = r;
  x.setTransform(1, 0, 0, 0.25, 0, 24);
  x.fillRect(0, -96, 256, 256);
  return new THREE.CanvasTexture(c);
}

export function criarCena() {
  const canvas = document.createElement('canvas');
  canvas.className = 'cena-3d';
  canvas.setAttribute('aria-hidden', 'true');
  const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true, powerPreference: 'low-power' });
  // No iPhone (tela de toque, densidade 3) 2x com antialias pesava em toda troca de dia, que
  // anima a barra quadro a quadro: 1,5x tem 44% menos pixels e a diferenca nao aparece (11/11/2026).
  renderer.setPixelRatio(Math.min(matchMedia('(pointer: coarse)').matches ? 1.5 : 2, window.devicePixelRatio || 1));
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;

  const cena = new THREE.Scene();
  const pm = new THREE.PMREMGenerator(renderer);
  cena.environment = pm.fromScene(salaDeLuz(), 0.035).texture;
  pm.dispose();

  const camera = new THREE.PerspectiveCamera(30, 2, 0.1, 60);
  const CAM_A = new THREE.Vector3(-3.1, 0.7, 8);
  const CAM_B = new THREE.Vector3(-1.2, 1.9, 7);
  const ALVO = new THREE.Vector3(-0.22, -0.02, 0);

  let pendente = false;
  const pedir = () => {
    if (pendente) return;
    pendente = true;
    requestAnimationFrame(() => {
      pendente = false;
      renderer.render(cena, camera);
    });
  };

  // ---------- a barra ----------

  const barra = new THREE.Group();
  cena.add(barra);
  const aco = new THREE.MeshStandardMaterial({ color: 0xcfd8dc, metalness: 1, roughness: 0.24 });
  const acoEscuro = new THREE.MeshStandardMaterial({ color: 0x8d979b, metalness: 1, roughness: 0.42 });
  const cilindro = (raio, largura, material, x = 0) => {
    const m = new THREE.Mesh(new THREE.CylinderGeometry(raio, raio, largura, 32), material);
    m.rotation.z = Math.PI / 2;
    m.position.x = x;
    barra.add(m);
    return m;
  };
  cilindro(0.07, 3.7, acoEscuro);
  for (const lado of [-1, 1]) {
    cilindro(0.145, 2.15, aco, lado * 2.88);
    cilindro(0.235, 0.13, aco, lado * 1.8);
    cilindro(0.16, 0.05, acoEscuro, lado * 3.96);
    for (const d of [-0.2, 0.2]) cilindro(0.075, 0.03, aco, lado * (0.72 + d));
  }

  const geoAnilha = geometriaDaAnilha();
  const geoAro = new THREE.CylinderGeometry(1.004, 1.004, 0.34, 64, 1, true);
  geoAro.rotateZ(Math.PI / 2);
  const geoFace = new THREE.RingGeometry(0.3, 0.71, 64);
  const texFace = texturaDaFace();
  const geoPulso = new THREE.RingGeometry(0.96, 1.04, 64);

  const chao = new THREE.Mesh(new THREE.PlaneGeometry(13, 3.4), new THREE.MeshBasicMaterial({ map: brilhoDoChao(), color: 0x39e27a, transparent: true, opacity: 0.1, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false }));
  chao.rotation.x = -Math.PI / 2;
  chao.position.set(-0.3, -1.06, 0.2);
  cena.add(chao);

  const estado = { giro: 0, rolo: 0 };
  const acertarGiro = () => {
    barra.rotation.x = estado.giro + estado.rolo * Math.PI * 1.6;
    camera.position.lerpVectors(CAM_A, CAM_B, estado.rolo);
    camera.lookAt(ALVO);
    pedir();
  };

  // ---------- o cardio (11/11/2026) ----------
  // O cardio do dia acende a pegada da barra, do meio para os colares: meia pegada = metade da
  // meta. Sem meta, acende inteira quando houver cardio. Com meta e sem cardio, fica so o trilho.
  const PEGADA = 3.36; // de colar a colar (os colares estao em +-1,8)
  const geoPegada = new THREE.CylinderGeometry(0.094, 0.094, 1, 32, 1, true);
  geoPegada.rotateZ(Math.PI / 2);
  const matPegada = new THREE.MeshBasicMaterial({ color: COR_CARDIO, transparent: true, opacity: 0, depthWrite: false, toneMapped: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide });
  const matTrilho = new THREE.MeshBasicMaterial({ color: COR_CARDIO, transparent: true, opacity: 0, depthWrite: false, toneMapped: false, side: THREE.DoubleSide });
  const pegada = new THREE.Mesh(geoPegada, matPegada);
  const trilhoDaPegada = new THREE.Mesh(geoPegada, matTrilho);
  trilhoDaPegada.scale.x = PEGADA;
  // o three.js do app e enxuto (sem TorusGeometry): a ponta e uma cinta curta e um pouco mais grossa
  const geoPonta = new THREE.CylinderGeometry(0.112, 0.112, 0.034, 40, 1, true);
  geoPonta.rotateZ(Math.PI / 2);
  const matPonta = new THREE.MeshBasicMaterial({ color: COR_CARDIO, transparent: true, opacity: 0, depthWrite: false, toneMapped: false, side: THREE.DoubleSide });
  const pontas = [-1, 1].map((lado) => { const m = new THREE.Mesh(geoPonta, matPonta); m.userData.lado = lado; return m; });
  barra.add(trilhoDaPegada, pegada, ...pontas);
  const cardio = { v: 0, alvo: 0, meta: false, brilho: 0.62 };
  function desenharCardio() {
    const f = cardio.v;
    pegada.visible = f > 0.002;
    pegada.scale.x = Math.max(0.001, f * PEGADA);
    matPegada.opacity = cardio.brilho;
    matTrilho.opacity = cardio.meta ? 0.07 : 0;
    for (const m of pontas) {
      m.visible = f > 0.002;
      m.position.x = m.userData.lado * f * PEGADA / 2;
    }
    matPonta.opacity = Math.min(1, cardio.brilho + 0.3);
    pedir();
  }
  function mudarCardio(c) {
    const f = Math.max(0, Math.min(1, c?.f ?? 0));
    cardio.meta = Boolean(c?.meta);
    if (f === cardio.alvo) { desenharCardio(); return; }
    const antes = cardio.alvo;
    cardio.alvo = f;
    const gs = g();
    if (!gs || menosMovimento()) { cardio.v = f; desenharCardio(); return; }
    gs.to(cardio, { v: f, duration: 1.1, ease: 'power3.out', onUpdate: desenharCardio });
    // bateu a meta (ou o primeiro cardio sem meta): a pegada pisca
    if (f === 1 && antes < 1) gs.fromTo(cardio, { brilho: 1 }, { brilho: 0.62, duration: 1.2, delay: 0.7, ease: 'power2.out', onUpdate: desenharCardio });
  }

  // ---------- as anilhas ----------

  let chaveAtual = null;
  let anilhas = [];
  let fechado = false;

  function criarAnilha(i, total, id) {
    const n = Math.max(total, 1);
    const largura = Math.min(LARGO_DA_ANILHA, LARGURA_LUVAS / n);
    const raio = total <= 1 ? 1 : 1 - 0.36 * (i / (total - 1));
    const distancia = INICIO_LUVA + largura * (i + 0.5);
    const cor = COR_A.clone().lerp(COR_B, total <= 1 ? 0 : i / (total - 1));
    const material = new THREE.MeshStandardMaterial({ color: COR_FANTASMA.clone(), metalness: 0.35, roughness: 0.38, transparent: true, opacity: 0.14 });
    const aro = new THREE.MeshBasicMaterial({ color: cor, transparent: true, opacity: 0.2, depthWrite: false, toneMapped: false });
    const face = new THREE.MeshBasicMaterial({ map: texFace, transparent: true, opacity: 0, depthWrite: false });
    const pedacos = [];
    for (const lado of [-1, 1]) {
      const grupo = new THREE.Group();
      grupo.position.x = lado * distancia;
      grupo.scale.set(largura, raio, raio);
      const corpo = new THREE.Mesh(geoAnilha, material);
      const luz = new THREE.Mesh(geoAro, aro);
      const rosto = new THREE.Mesh(geoFace, face);
      rosto.rotation.y = lado * Math.PI / 2;
      rosto.position.x = lado * 0.372;
      rosto.renderOrder = 2;
      grupo.add(corpo, luz, rosto);
      // A maior anilha mostra a face de dentro para a camera: a escrita vai nela tambem.
      if (i === 0) {
        const dentro = new THREE.Mesh(geoFace, face);
        dentro.rotation.y = -lado * Math.PI / 2;
        dentro.position.x = -lado * 0.372;
        dentro.renderOrder = 2;
        grupo.add(dentro);
      }
      barra.add(grupo);
      pedacos.push({ grupo, lado });
    }
    return { id, material, aro, face, pedacos, distancia, cor, p: 0, f: 1 };
  }

  function apagarAnilhas() {
    for (const a of anilhas) {
      for (const { grupo } of a.pedacos) barra.remove(grupo);
      a.material.dispose();
      a.aro.dispose();
      a.face.dispose();
    }
    anilhas = [];
  }

  /** O quanto a anilha aparece para cada fracao de series feitas. */
  const aparencia = (p) => ({
    corpo: p === 0 ? 0.14 : 0.62 + 0.38 * p,
    aro: p === 0 ? 0.2 : 0.34 + 0.66 * p * p,
    face: p === 0 ? 0 : 0.25 + 0.75 * p,
    mistura: p === 0 ? 0 : 1,
  });

  // a.f e o quanto a anilha aparece quando a partida esta num exercicio: 1 na dele, menos nas outras.
  function aplicar(a, v) {
    const corpo = v.corpo * a.f;
    a.material.opacity = corpo;
    a.material.transparent = corpo < 0.995;
    a.material.depthWrite = corpo >= 0.5;
    a.material.color.copy(COR_FANTASMA).lerp(COR_BORRACHA, v.mistura);
    a.aro.opacity = v.aro * a.f;
    a.face.opacity = v.face * a.f;
  }

  /** Com a partida aberta, a anilha do exercicio da vez fica acesa e as outras recuam. */
  let focoAtual = null;
  function focar(id) {
    focoAtual = id;
    const gs = g();
    for (const a of anilhas) {
      const alvo = id === null || a.id === id ? 1 : 0.3;
      if (a.f === alvo) continue;
      if (gs && !menosMovimento()) gs.to(a, { f: alvo, duration: 0.45, ease: 'power2.out', onUpdate: () => { aplicar(a, aparencia(a.p)); pedir(); } });
      else { a.f = alvo; aplicar(a, aparencia(a.p)); }
    }
    pedir();
  }

  function impacto(a) {
    const gs = g();
    if (!gs) return;
    gs.fromTo(barra.position, { y: -0.075 }, { y: 0, duration: 0.65, ease: 'elastic.out(1.1, 0.32)', onUpdate: pedir });
    for (const { lado } of a.pedacos) {
      const pulso = new THREE.Mesh(geoPulso, new THREE.MeshBasicMaterial({ color: a.cor, transparent: true, opacity: 0.95, depthWrite: false, side: THREE.DoubleSide, toneMapped: false, blending: THREE.AdditiveBlending }));
      pulso.rotation.y = Math.PI / 2;
      pulso.position.x = lado * (a.distancia + 0.14);
      barra.add(pulso);
      gs.to(pulso.scale, { x: 1.55, y: 1.55, duration: 0.55, ease: 'power2.out' });
      gs.to(pulso.material, {
        opacity: 0, duration: 0.55, ease: 'power2.out', onUpdate: pedir,
        onComplete: () => { barra.remove(pulso); pulso.material.dispose(); },
      });
    }
    gs.fromTo(a.aro, { opacity: 1 }, { opacity: 1, duration: 0.3, onUpdate: pedir });
  }

  /** Os dois lados entram correndo pela luva e batem no lugar. */
  function encaixar(a) {
    const gs = g();
    if (!gs || menosMovimento()) { pedir(); return; }
    let bateu = false;
    for (const { grupo, lado } of a.pedacos) {
      gs.fromTo(grupo.position, { x: lado * (a.distancia + 1.5) }, {
        x: lado * a.distancia, duration: 0.34, ease: 'power3.in', onUpdate: pedir,
        onComplete: () => { if (!bateu) { bateu = true; impacto(a); } },
      });
    }
  }

  function comemorar() {
    const gs = g();
    if (!gs || menosMovimento()) return;
    const tl = gs.timeline({ delay: 0.4, onUpdate: pedir });
    tl.to(barra.position, { y: 0.34, duration: 0.5, ease: 'power3.out' })
      .to(estado, { giro: estado.giro + Math.PI * 2, duration: 1.1, ease: 'power2.inOut', onUpdate: acertarGiro }, 0)
      .to(chao.material, { opacity: 0.34, duration: 0.5, ease: 'power2.out' }, 0)
      .to(barra.position, { y: 0, duration: 0.75, ease: 'bounce.out' }, 0.75)
      .to(chao.material, { opacity: 0.2, duration: 0.6 }, 0.9);
  }

  function trocarDeTreino(placas) {
    const gs = g();
    apagarAnilhas();
    anilhas = placas.map((pl, i) => criarAnilha(i, placas.length, pl.id));
    anilhas.forEach((a, i) => {
      a.p = placas[i].p;
      a.f = focoAtual === null || a.id === focoAtual ? 1 : 0.3;
      aplicar(a, aparencia(a.p));
    });
    if (gs && !menosMovimento()) {
      // A barra chega rolando e as anilhas ja feitas entram uma a uma.
      gs.killTweensOf(estado);
      gs.fromTo(estado, { giro: -1.5 }, { giro: 0, duration: 0.8, ease: 'power3.out', onUpdate: acertarGiro });
      anilhas.forEach((a, i) => {
        for (const { grupo, lado } of a.pedacos) {
          gs.fromTo(grupo.position, { x: lado * (a.distancia + 1.1) }, { x: lado * a.distancia, duration: 0.5, delay: 0.03 * i, ease: 'power3.out', onUpdate: pedir });
        }
      });
    } else {
      estado.giro = 0;
      acertarGiro();
    }
  }

  function mudarSeries(placas) {
    const gs = g();
    anilhas.forEach((a, i) => {
      const novo = placas[i].p;
      if (novo === a.p) return;
      const antes = aparencia(a.p);
      const depois = aparencia(novo);
      const fechou = novo === 1 && a.p < 1;
      a.p = novo;
      if (gs && !menosMovimento()) {
        const v = { ...antes };
        gs.to(v, { ...depois, duration: fechou ? 0.2 : 0.45, ease: 'power2.out', onUpdate: () => { aplicar(a, v); pedir(); } });
        if (fechou) encaixar(a);
      } else {
        aplicar(a, depois);
      }
    });
  }

  // ---------- girar com o dedo (de lado; para cima e para baixo a pagina rola) ----------

  let dedo = null;
  canvas.addEventListener('pointerdown', (ev) => {
    dedo = { x: ev.clientX, t: performance.now(), v: 0 };
    g()?.killTweensOf(estado);
  });
  window.addEventListener('pointermove', (ev) => {
    if (dedo === null) return;
    const agora = performance.now();
    const dx = ev.clientX - dedo.x;
    dedo.v = dx / Math.max(agora - dedo.t, 1);
    dedo.x = ev.clientX;
    dedo.t = agora;
    estado.giro += dx * 0.012;
    acertarGiro();
  });
  const soltar = () => {
    if (dedo === null) return;
    const v = dedo.v;
    dedo = null;
    if (g() && !menosMovimento() && Math.abs(v) > 0.05) {
      g().to(estado, { giro: estado.giro + v * 1.3, duration: 1.1, ease: 'power3.out', onUpdate: acertarGiro });
    }
  };
  window.addEventListener('pointerup', soltar);
  window.addEventListener('pointercancel', soltar);

  // ---------- tamanho ----------

  function medir(host) {
    const l = host.clientWidth;
    const a = host.clientHeight;
    if (l === 0 || a === 0) return;
    renderer.setSize(l, a, false);
    camera.aspect = l / a;
    // Mantem a largura da barra em qualquer tela: quem muda e o angulo vertical.
    // Em faixa muito baixa (a partida numa tela pequena) quem manda e a altura: as anilhas nao podem cortar.
    camera.fov = Math.max(17.5, THREE.MathUtils.radToDeg(2 * Math.atan(Math.tan(THREE.MathUtils.degToRad(27)) / camera.aspect)));
    camera.updateProjectionMatrix();
    acertarGiro();
  }
  const observador = new ResizeObserver((itens) => medir(itens[0].target));
  let hostAtual = null;

  canvas.addEventListener('webglcontextrestored', pedir);
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') pedir(); });
  // A fonte da escrita das anilhas chega depois: redesenha a textura quando ela chegar.
  document.fonts?.load("700 40px 'Big Shoulders Display'").then(() => {
    const nova = texturaDaFace();
    texFace.image = nova.image;
    texFace.needsUpdate = true;
    pedir();
  }).catch(() => {});

  return {
    /** A tela e refeita a cada desenho: o canvas (e o contexto WebGL) passa de uma para a outra. */
    montarEm(host) {
      if (hostAtual !== host) {
        if (hostAtual) observador.unobserve(hostAtual);
        hostAtual = host;
        host.append(canvas);
        observador.observe(host);
      }
      medir(host);
    },

    /** dados: { chave, placas: [{id, p}], cardio?: {f, meta} } com p e f de 0 a 1. */
    mostrar({ chave, placas, cardio: c = null }) {
      mudarCardio(c);
      const todas = placas.length > 0 && placas.every((pl) => pl.p === 1);
      const mudouDeTreino = chave !== chaveAtual || placas.length !== anilhas.length || placas.some((pl, i) => pl.id !== anilhas[i].id);
      if (mudouDeTreino) {
        chaveAtual = chave;
        trocarDeTreino(placas);
      } else {
        mudarSeries(placas);
      }
      if (todas && !fechado && !mudouDeTreino) comemorar();
      fechado = todas;
      chao.material.opacity = placas.length === 0 ? 0.05 : 0.08 + 0.12 * (placas.filter((pl) => pl.p === 1).length / placas.length);
      pedir();
    },

    /** O exercicio da partida aberta (id), ou null quando ela fecha. */
    foco: focar,

    /** Progresso da rolagem do topo, de 0 a 1. */
    rolagem(p) {
      estado.rolo = p;
      acertarGiro();
    },
  };
}
