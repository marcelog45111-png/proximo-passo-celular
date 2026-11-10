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
export function anel(circulo, volta, fracao) {
  const antes = ultimos.get('anel') ?? 0;
  ultimos.set('anel', fracao);
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
