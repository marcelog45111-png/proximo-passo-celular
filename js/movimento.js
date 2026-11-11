// O movimento do app (07/11/2026), em GSAP + ScrollTrigger. A tela e refeita a
// cada desenho, entao todo efeito se registra num contexto que e desfeito no
// desenho seguinte. Regras:
// - O conteudo e visivel por padrao: sem GSAP (ou com "menos movimento") nada
//   fica escondido, so nao anima.
// - So anima transform e opacity. Nada infinito.
// - Marcar uma serie nao repete a entrada da tela: entrada e so ao trocar de aba
//   ou de dia.

const g = () => window.gsap ?? null;
const St = () => window.ScrollTrigger ?? null;
const menos = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
const pode = () => g() !== null && !menos();

// O ScrollTrigger deixa um laco de requestAnimationFrame rodando para sempre, para
// um defeito de repintura do Firefox (_rafBugFix). O app e do Safari do iPhone, e o
// laco manteria a tela acordada a 60 quadros por segundo com tudo parado: corta aqui.
if (St()) {
  const raf = window.requestAnimationFrame;
  window.requestAnimationFrame = function semLacoDoFirefox(f) {
    if (f?.name !== '_rafBugFix') return raf.call(window, f);
    window.requestAnimationFrame = raf;
    return 0;
  };
}

if (g() && St()) {
  g().registerPlugin(St());
  // O teclado do iPhone muda a altura: nao pode refazer as medidas por isso.
  St().config({ ignoreMobileResize: true });
}

let contexto = null;
const ultimos = new Map();

export function novoDesenho() {
  contexto?.revert();
  contexto = g()?.context(() => {}) ?? null;
}

const noContexto = (fn) => { if (contexto) contexto.add(fn); else fn(); };

/** Cartoes entram conforme chegam na tela, em grupo. Uma vez so por entrada. */
export function entrada(tela) {
  if (!pode()) return;
  noContexto(() => {
    const topo = tela.querySelectorAll('.palco-data, .titulo-grande, .subtitulo, .palco-numeros > *, .dieta-resumo > *');
    if (topo.length > 0) g().from(topo, { y: 14, autoAlpha: 0, duration: 0.5, stagger: 0.05, ease: 'power3.out', clearProps: 'all' });
    const pecas = tela.querySelectorAll('.cartao, .secao, .botao-rodape');
    if (St() && pecas.length > 0) {
      g().set(pecas, { y: 22, autoAlpha: 0 });
      St().batch(pecas, {
        start: 'top 97%',
        once: true,
        onEnter: (lote) => g().to(lote, { y: 0, autoAlpha: 1, duration: 0.5, stagger: 0.06, ease: 'power3.out', clearProps: 'transform,opacity,visibility' }),
      });
    }
  });
}

/** O topo do treino reage a rolagem: a barra gira, a camera sobe e o titulo fica para tras. */
export function rolagemDoPalco(palco, aoMudar) {
  if (!pode() || !St()) return;
  noContexto(() => {
    const v = { p: 0 };
    const gatilho = { trigger: palco, start: 'top 60px', end: 'bottom 60px', scrub: 0.45 };
    g().to(v, { p: 1, ease: 'none', onUpdate: () => aoMudar(v.p), scrollTrigger: gatilho });
    const titulo = palco.querySelector('.titulo-grande');
    if (titulo) g().to(titulo, { yPercent: -24, autoAlpha: 0.15, ease: 'none', scrollTrigger: { ...gatilho, end: 'center 60px' } });
    const numeros = palco.querySelector('.palco-numeros');
    if (numeros) g().to(numeros, { y: 16, ease: 'none', scrollTrigger: gatilho });
  });
}

/** O numero corre do que era ate o que e agora, sem repetir quando nao mudou. */
export function contar(el, chave, fim, formatar = (v) => String(Math.round(v))) {
  const inicio = ultimos.get(chave) ?? 0;
  ultimos.set(chave, fim);
  el.textContent = formatar(fim);
  if (!pode() || inicio === fim) return;
  const v = { n: inicio };
  el.textContent = formatar(inicio);
  g().to(v, { n: fim, duration: 0.7, ease: 'power2.out', onUpdate: () => { if (el.isConnected) el.textContent = formatar(v.n); }, onComplete: () => { el.textContent = formatar(fim); } });
}

/** O anel e as barras da dieta crescem a partir de onde estavam. */
export function anel(circulo, volta, fracao, chave = 'anel') {
  const antes = ultimos.get(chave) ?? 0;
  ultimos.set(chave, fracao);
  circulo.setAttribute('stroke-dashoffset', String(volta * (1 - fracao)));
  if (!pode() || antes === fracao) return;
  g().fromTo(circulo, { attr: { 'stroke-dashoffset': volta * (1 - antes) } }, { attr: { 'stroke-dashoffset': volta * (1 - fracao) }, duration: 0.9, ease: 'power3.out' });
}
export function barraCresce(i, chave, fracao) {
  const antes = ultimos.get(chave) ?? 0;
  ultimos.set(chave, fracao);
  if (!pode() || antes === fracao || fracao === 0) return;
  g().fromTo(i, { scaleX: fracao > 0 ? antes / fracao : 1 }, { scaleX: 1, duration: 0.8, ease: 'power3.out', clearProps: 'transform' });
}

/** A pilula da aba escolhida desliza da aba anterior. */
let abaAntes = null;
export function pilulaDasAbas(luz, indice) {
  const de = abaAntes ?? indice;
  abaAntes = indice;
  if (!pode() || de === indice) return;
  // A pilula ja nasce no lugar certo (CSS); so anda a diferenca ate chegar.
  g().fromTo(luz, { xPercent: (de - indice) * 100 }, { xPercent: 0, duration: 0.45, ease: 'back.out(1.5)', clearProps: 'transform' });
}

// ---------- o treino serie a serie (09/11/2026) ----------
// A partida e uma folha por cima da tela: nao entra no contexto do desenho (que e
// desfeito a cada redesenho da tela de baixo). Tudo aqui e curto e se limpa sozinho.

/** A partida abre: as fases entram em fila e a barra chega por ultimo. */
export function jogoAbriu(dialogo) {
  if (!pode()) return;
  g().from(dialogo.querySelectorAll('.fase-pilula'), { y: -10, autoAlpha: 0, duration: 0.4, stagger: 0.04, ease: 'back.out(2)', clearProps: 'all' });
}

/** Troca de serie: o passo novo entra do lado para onde a pessoa esta indo. */
export function passoEntrou(corpo, direcao) {
  if (!pode()) return;
  // O botao que grava nao sai do lugar nem some: e nele que o polegar esta.
  const pecas = [...corpo.children].filter((el) => !el.matches('.jogo-feito, .jogo-acoes'));
  g().from(pecas, { x: 26 * direcao, autoAlpha: 0, duration: 0.34, stagger: 0.035, ease: 'power3.out', clearProps: 'all' });
}

/** Mais ou menos uma repeticao: o numero da um pulinho para o lado que mudou. */
export function numeroMudou(campo, quanto) {
  if (!pode()) return;
  g().fromTo(campo, { y: quanto > 0 ? 7 : -7, scale: 0.94 }, { y: 0, scale: 1, duration: 0.3, ease: 'back.out(3)', overwrite: true, clearProps: 'transform' });
}

/** "Feito" sem repeticoes: o numero balanca, dizendo que falta ele. */
export function nega(campo) {
  campo.focus();
  if (!pode()) return;
  g().fromTo(campo, { x: -8 }, { x: 0, duration: 0.5, ease: 'elastic.out(1.4, 0.3)', overwrite: true, clearProps: 'transform' });
}

/** Faiscas saindo do meio: so quando a serie passou a base ou a carga foi liberada. */
function faiscas(host, n = 14, raio = 96) {
  for (let i = 0; i < n; i += 1) {
    const f = document.createElement('i');
    f.className = 'faisca';
    host.append(f);
    const angulo = (i / n) * Math.PI * 2 + Math.random() * 0.5;
    const alcance = raio * (0.55 + Math.random() * 0.6);
    g().fromTo(f,
      { x: 0, y: 0, scale: 1, autoAlpha: 1 },
      { x: Math.cos(angulo) * alcance, y: Math.sin(angulo) * alcance * 0.62, scale: 0.2, autoAlpha: 0, duration: 0.7 + Math.random() * 0.35, ease: 'power3.out', onComplete: () => f.remove() });
  }
}

/** O veredito da serie bate em cima da barra, fica um instante e sai. */
export function carimbo(el, subiu) {
  if (!pode()) return;
  g().killTweensOf(el);
  g().timeline()
    .fromTo(el, { scale: subiu ? 1.5 : 1.12, autoAlpha: 0, y: 0 }, { scale: 1, autoAlpha: 1, duration: subiu ? 0.5 : 0.3, ease: subiu ? 'back.out(2.4)' : 'power2.out' })
    .to(el, { autoAlpha: 0, y: -10, duration: 0.35, ease: 'power2.in', clearProps: 'all' }, 2.6);
  if (subiu) faiscas(el);
}

/** O fim do exercicio: as series em fila e, com a carga liberada, a caixa estala. */
export function fimEntrou(corpo, caixaLiberada) {
  if (!pode()) return;
  g().from(corpo.children, { y: 16, autoAlpha: 0, duration: 0.4, stagger: 0.05, ease: 'power3.out', clearProps: 'all' });
  g().from(corpo.querySelectorAll('.fim-lista li'), { x: -14, autoAlpha: 0, duration: 0.35, stagger: 0.06, delay: 0.12, ease: 'power3.out', clearProps: 'all' });
  if (!caixaLiberada) return;
  const icone = caixaLiberada.querySelector('.caixa-icone');
  g().timeline({ delay: 0.45 })
    .fromTo(caixaLiberada, { scale: 0.9 }, { scale: 1, duration: 0.7, ease: 'elastic.out(1.1, 0.45)', clearProps: 'transform' })
    .fromTo(icone, { rotation: -28, scale: 0.4 }, { rotation: 0, scale: 1, duration: 0.7, ease: 'elastic.out(1.2, 0.4)', clearProps: 'transform' }, 0)
    .add(() => faiscas(icone, 18, 150), 0.05);
}

/** O cartao fechado encolhe do tamanho que tinha, e o proximo exercicio vem para a vista. */
export function cartaoFechou(cartao, alturaAntes, proximo) {
  const ir = () => proximo?.scrollIntoView({ block: 'start', behavior: pode() ? 'smooth' : 'auto' });
  if (!pode()) { ir(); return; }
  const altura = cartao.offsetHeight;
  g().fromTo(cartao, { height: alturaAntes, overflow: 'hidden' }, {
    height: altura, duration: 0.45, ease: 'power3.inOut', clearProps: 'height,overflow',
    onComplete: ir,
  });
  g().from(cartao.querySelectorAll('.ex-resumo > *'), { y: 10, autoAlpha: 0, duration: 0.4, stagger: 0.04, delay: 0.1, ease: 'power3.out', clearProps: 'all' });
}

export function cartaoAbriu(cartao, alturaAntes) {
  if (!pode()) return;
  const altura = cartao.offsetHeight;
  g().fromTo(cartao, { height: alturaAntes, overflow: 'hidden' }, { height: altura, duration: 0.4, ease: 'power3.out', clearProps: 'height,overflow' });
}

/** O balao novo do Garry sobe do campo. */
export function balaoNovo(balao) {
  if (!pode() || !balao) return;
  g().from(balao, { y: 14, scale: 0.96, autoAlpha: 0, duration: 0.35, ease: 'back.out(1.7)', clearProps: 'all' });
}

/** A marca e o formulario de entrar, em sequencia. */
export function telaDeEntrada(tela) {
  if (!pode()) return;
  noContexto(() => {
    const tl = g().timeline();
    const marca = tela.querySelector('.marca');
    if (marca) tl.from(marca, { scale: 0.6, rotation: -10, autoAlpha: 0, duration: 0.8, ease: 'elastic.out(1, 0.6)', clearProps: 'all' });
    tl.from([...tela.children].filter((f) => f !== marca), { y: 18, autoAlpha: 0, duration: 0.5, stagger: 0.07, ease: 'power3.out', clearProps: 'all' }, '-=0.5');
  });
}

// ---------- o Editar treino (10/11/2026) ----------
// Tambem e uma folha por cima da tela: fora do contexto do desenho.

/** O editor abre: o placar e as linhas dos exercicios entram em fila. */
export function editorAbriu(folha) {
  if (!pode()) return;
  g().from(folha.querySelectorAll('.ed-placar, .ed-grupo, .ed-ex-linha, .ed-ex, .ed-novo'), { y: 16, autoAlpha: 0, duration: 0.45, stagger: 0.035, delay: 0.12, ease: 'power3.out', clearProps: 'all' });
}

/**
 * A lista mudou (abriu, fechou, subiu, desceu, entrou ou saiu um exercicio): cada linha
 * desliza de onde estava (FLIP), a que abriu cresce da altura de linha e as secoes
 * dela entram em fila. `antes` = Map(id -> {top, h}) medido antes de redesenhar.
 */
export function editorMudou(lista, antes, abertoId) {
  if (!pode()) return;
  for (const el of lista.children) {
    const a = antes.get(el.dataset.id);
    if (!a) {
      g().from(el, { y: 18, autoAlpha: 0, duration: 0.42, ease: 'power3.out', clearProps: 'all' });
      continue;
    }
    const r = el.getBoundingClientRect();
    const dy = a.top - r.top;
    if (Math.abs(dy) > 1) g().from(el, { y: dy, duration: 0.45, ease: 'power3.out', clearProps: 'transform' });
    if (Math.abs(a.h - r.height) > 1) {
      g().fromTo(el, { height: a.h, overflow: 'hidden' }, { height: r.height, duration: 0.42, ease: 'power3.out', clearProps: 'height,overflow' });
      if (el.dataset.id === abertoId) {
        g().from(el.querySelectorAll('.ed-secao, .ed-botoes'), { y: 12, autoAlpha: 0, duration: 0.36, stagger: 0.04, delay: 0.08, ease: 'power3.out', clearProps: 'all' });
      }
    }
  }
}

/** A luz das pilulas desliza da escolha anterior para a nova (a pilula que desliza do animation-components, em GSAP). */
const pilulasAntes = new Map();
export function pilulaDosChips(grupo, chave) {
  const luz = grupo.querySelector('.ed-chip-luz');
  const ativo = grupo.querySelector('[aria-pressed="true"]');
  if (!luz) return;
  if (!ativo) { luz.style.opacity = '0'; return; }
  const x = ativo.offsetLeft;
  const w = ativo.offsetWidth;
  // a escolhida fica a vista dentro da fileira que rola de lado
  const sobra = (grupo.clientWidth - w) / 2;
  if (x < grupo.scrollLeft || x + w > grupo.scrollLeft + grupo.clientWidth) grupo.scrollLeft = Math.max(0, x - sobra);
  const antes = pilulasAntes.get(chave);
  pilulasAntes.set(chave, { x, w });
  luz.style.opacity = '1';
  if (!pode() || !antes || (antes.x === x && antes.w === w)) {
    if (g()) g().set(luz, { x, width: w }); else { luz.style.width = `${w}px`; luz.style.transform = `translateX(${x}px)`; }
    return;
  }
  g().fromTo(luz, { x: antes.x, width: antes.w }, { x, width: w, duration: 0.42, ease: 'back.out(1.5)' });
  g().fromTo(ativo, { scale: 0.94 }, { scale: 1, duration: 0.35, ease: 'back.out(3)', clearProps: 'transform' });
}

/** A folha do cardio: as secoes sobem em fila. */
export function cardioAbriu(folha) {
  if (!pode()) return;
  g().from(folha.querySelectorAll('.cardio-folha .ed-secao, .folha-corpo > .botao'), { y: 14, autoAlpha: 0, duration: 0.4, stagger: 0.04, delay: 0.1, ease: 'power3.out', clearProps: 'all' });
}

/** Trocou de semana: os seis dias entram do lado para onde a pessoa foi. */
export function semanaMudou(dias, direcao) {
  if (!pode() || !dias) return;
  g().from(dias.children, { x: 36 * direcao, autoAlpha: 0, duration: 0.38, stagger: { each: 0.03, from: direcao > 0 ? 'start' : 'end' }, ease: 'power3.out', clearProps: 'all' });
}

/**
 * Trocou de dia ou de semana (11/11/2026, "ao passar pro lado dos dias, tem muito lag"): a entrada
 * inteira da tela escondia todos os cartoes e criava um gatilho de rolagem para cada um, tudo no
 * mesmo quadro em que a barra 3D trocava de treino. Aqui so o que esta na tela entra, rapido e sem
 * ScrollTrigger; o que esta abaixo da dobra ja nasce no lugar.
 */
export function trocaLeve(tela, direcao = 0) {
  if (!pode()) return;
  const alto = window.innerHeight;
  const visiveis = [...tela.querySelectorAll('.palco-data, .titulo-grande, .palco-numeros, .progresso, .placar, .cartao, .secao, .botao-rodape')]
    .filter((el) => { const r = el.getBoundingClientRect(); return r.bottom > 0 && r.top < alto; });
  if (visiveis.length === 0) return;
  noContexto(() => {
    g().from(visiveis, { x: 18 * direcao, y: direcao === 0 ? 8 : 0, autoAlpha: 0, duration: 0.26, stagger: 0.025, ease: 'power2.out', clearProps: 'transform,opacity,visibility' });
  });
}

/** A folha da evolucao: numeros e cartoes sobem, as linhas da planilha entram em fila. */
export function evolucaoAbriu(folha) {
  if (!pode()) return;
  g().from(folha.querySelectorAll('.evo-numero, .evo-cartao'), { y: 16, autoAlpha: 0, duration: 0.45, stagger: 0.06, delay: 0.05, ease: 'power3.out', clearProps: 'all' });
  // so as linhas que aparecem (a planilha pode ter dezenas): as de baixo ja nascem no lugar
  const alto = window.innerHeight;
  const linhas = [...folha.querySelectorAll('.pl-grupo, .pl-linha:not(.pl-cabeca)')].filter((el) => el.getBoundingClientRect().top < alto);
  if (linhas.length > 0) g().from(linhas, { x: -10, autoAlpha: 0, duration: 0.32, stagger: 0.025, delay: 0.3, ease: 'power2.out', clearProps: 'all' });
}

/** A trajetoria do exercicio: a linha se desenha da esquerda para a direita, os pontos acendem. */
export function trajetoriaEntrou(svg) {
  if (!pode() || !svg) return;
  const linha = svg.querySelector('.traj-linha');
  const area = svg.querySelector('.traj-area');
  const pontos = svg.querySelectorAll('.traj-ponto');
  if (linha) g().fromTo(linha, { strokeDashoffset: 1 }, { strokeDashoffset: 0, duration: 1.1, ease: 'power2.inOut' });
  if (area) g().from(area, { autoAlpha: 0, duration: 0.6, delay: 0.7, ease: 'power1.out' });
  if (pontos.length > 0) g().from(pontos, { scale: 0, transformOrigin: '50% 50%', duration: 0.35, stagger: 0.9 / Math.max(1, pontos.length), ease: 'back.out(2)', clearProps: 'transform' });
}

/** A linha do exercicio na planilha acende e apaga devagar, para o olho achar onde esta. */
export function linhaAcesa(linha) {
  if (!pode() || !linha) return;
  g().fromTo(linha, { backgroundColor: 'rgba(57, 226, 122, 0.22)' }, { backgroundColor: 'rgba(57, 226, 122, 0.06)', duration: 1.4, delay: 0.35, ease: 'power2.out' });
}
