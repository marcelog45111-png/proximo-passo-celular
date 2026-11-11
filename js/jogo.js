// O treino serie a serie (09/11/2026). Pedido: "separe o numero de series como se
// fosse um jogo ... base (quanto eu fiz semana passada), ai mostra um aviso: faca +1
// rep pra progredir, e ele parabeniza quando faca mais".
//
// Uma serie por tela: a meta e o treino anterior, Comecar/Parar (o tempo da serie, com a
// regra do metodo), as repeticoes e o "Feito". Depois de
// cada serie vem o veredito (subiu, igual, abaixo) e o descanso; no fim, a conta que
// libera ou nao a carga do PROXIMO treino. As regras moram em treino.js: aqui e so tela.

import { campoNumero, h, icone, numeroBr, selo, cargaReps } from './dom.js';
import { intervaloAntes, METODOS, planoDeHoje, regraDaCarga, regraDaSerie, relogio, resultadoDoExercicio, veredito } from './treino.js';
import * as movimento from './movimento.js';

const kg = (v) => `${numeroBr(v)} kg`;
const CHANCE = { alta: 'Chance alta', media: 'Chance média', baixa: 'Chance baixa' };
const reps = (n) => `${n} ${Math.abs(n) === 1 ? 'rep' : 'reps'}`;

let aberto = null;
/** A partida aberta agora (onde o descanso e a barra 3D devem aparecer), ou null. */
export const jogoAberto = () => aberto;

/** Prende a pagina no lugar (o iOS rola o body atras de um dialog modal); devolve quem solta. */
function prenderPagina() {
  const raiz = document.documentElement;
  const y = window.scrollY;
  raiz.style.setProperty('--preso-em', `${-y}px`);
  raiz.classList.add('jogo-aberto');
  return () => {
    raiz.classList.remove('jogo-aberto');
    raiz.style.removeProperty('--preso-em');
    window.scrollTo(0, y);
  };
}

/**
 * partida: {
 *   ex, indice, ultima, quando ('semana passada', 'anotado no plano' ou null), comecarEm (passo ou null),
 *   feitas(): a lista do dia, na ordem do roteiro; encerrado(): bool,
 *   gravar(i, {carga, reps}), desmarcar(i), encerrar(), reabrir(), adicionar(): indice novo,
 *   descansar(segundos | null), pararDescanso(),
 *   cena: { montar(host), atualizar(), foco(id) } | null,
 *   proximo(): a partida do proximo exercicio que falta, ou null
 * }
 */
export function abrirJogo(partida, aoFechar) {
  let o = partida;
  let mudou = false;
  let relogioDoCarimbo = null;
  let relogioDaSerie = null;
  let contando = null; // { i, desde }: a serie com o relogio andando
  let medida = null; // { i, seg }: a serie que parou e espera as repeticoes
  const valores = new Map(); // o rascunho de cada passo (carga, reps, seg) ate o Feito
  // Toque duplo no "Feito" nao pode gravar a serie seguinte nem pular para o proximo exercicio.
  let travaAte = 0;
  const travado = () => Date.now() < travaAte;
  const travar = () => { travaAte = Date.now() + 450; };

  const num = h('span', { class: 'jogo-num', 'aria-hidden': 'true' });
  const nome = h('b', { class: 'jogo-nome' });
  const metodo = h('span', { class: 'chip' });
  const fases = h('ol', { class: 'fases', 'aria-label': 'Séries deste exercício' });
  const cena = h('div', { class: 'jogo-cena' });
  const carimbo = h('div', { class: 'carimbo', role: 'status', 'aria-live': 'polite' });
  const descanso = h('div', { class: 'jogo-descanso' });
  const corpo = h('div', { class: 'jogo-corpo' });
  // replaceChildren escreve "null" na tela: as pecas que nao valem agora ficam de fora.
  const trocarCorpo = (...pecas) => corpo.replaceChildren(...pecas.filter((p) => p !== null && p !== undefined && p !== false));
  const d = h('dialog', { class: 'jogo' },
    // Seta de voltar a esquerda (a pagina anterior: a serie de antes, ou desfazer o relogio) e o X a
    // direita, que fecha e volta ao treino (10/11/2026, pedido).
    h('div', { class: 'jogo-topo' },
      h('button', { class: 'botao-redondo', 'aria-label': 'Voltar', onclick: () => voltar() }, icone('voltar')),
      h('div', { class: 'jogo-titulo' }, num, nome, metodo),
      h('button', { class: 'botao-redondo', 'aria-label': 'Fechar e voltar ao treino', onclick: () => d.close() }, icone('fechar'))),
    fases,
    h('div', { class: 'jogo-palco' }, cena, carimbo),
    descanso,
    corpo);

  const plano = () => planoDeHoje(o.ex, o.ultima, o.feitas().length);
  let naTela = null; // o passo na tela (numero) ou 'fim'
  function voltar() {
    if (naTela === 'fim') { mostrarPasso(Math.max(0, plano().passos.length - 1), -1); return; }
    const i = naTela ?? 0;
    if (contando?.i === i) { contando = null; mostrarPasso(i, 0); return; }
    if (medida?.i === i && feita(o.feitas(), i) === null) { medida = null; if (valores.has(i)) valores.get(i).seg = 0; mostrarPasso(i, 0); return; }
    if (i > 0) { mostrarPasso(i - 1, -1); return; }
    d.close();
  }
  const feita = (lista, i) => (lista[i] && lista[i].reps > 0 ? lista[i] : null);
  // Aquecimento pulado nao e pendente: o roteiro segue para as series de trabalho.
  const pendenteDepoisDe = (passos, lista, de) => {
    // e depois que uma serie de trabalho foi feita, aquecer ja nao faz sentido.
    const trabalhou = lista.some((x, k) => x.reps > 0 && passos[k]?.t !== 'a');
    const falta = (i) => feita(lista, i) === null && !(passos[i]?.t === 'a' && (trabalhou || o.semAquecimento?.()));
    for (let i = de; i < passos.length; i += 1) if (falta(i)) return i;
    for (let i = 0; i < de; i += 1) if (falta(i)) return i;
    return -1;
  };

  function desenharFases(passos, lista, atual) {
    fases.replaceChildren(...passos.map((p, i) => {
      const f = feita(lista, i);
      const v = f && p.t !== 'a' ? veredito(f, p.base) : null;
      const pulada = p.t === 'a' && !f && o.semAquecimento?.();
      return h('li', {}, h('button', {
        class: `fase-pilula${p.t === 'a' ? ' aquecimento' : ''}`, 'data-estado': i === atual ? 'atual' : f ? 'feita' : pulada ? 'pulada' : 'pendente', 'data-tipo': v?.tipo ?? (f ? 'igual' : null),
        'aria-current': i === atual ? 'step' : null,
        'aria-label': `${p.rotulo}${f ? `: ${f.reps} reps com ${kg(f.carga)}${v ? `, ${v.tipo === 'nova' ? 'primeiro registro' : v.texto}` : ''}` : pulada ? ': pulado' : ''}`,
        onclick: () => mostrarPasso(i, i < atual ? -1 : 1),
      }, h('span', { texto: p.curto })));
    }));
  }

  // A serie em tres momentos (10/11/2026, "os kg tem que vir primeiro e algo como um botao
  // comecar e parar a serie, isso serve pro tempo"): preparar (a carga primeiro, a meta e a
  // regra do metodo) -> contando (o relogio da serie e o Parar) -> anotar (as repeticoes).
  // O "Anotar sem cronometro" pula direto para o anotar; serie ja feita abre no anotar.
  function mostrarPasso(i, direcao = 1) {
    naTela = i;
    clearInterval(relogioDaSerie);
    relogioDaSerie = null;
    // Tocar numa serie que falta de um exercicio encerrado volta a valer o roteiro.
    if (o.encerrado() && feita(o.feitas(), i) === null) o.reabrir();
    const pl = plano();
    const lista = o.feitas();
    const passo = pl.passos[i];
    const proximoPasso = pl.passos[i + 1] ?? null;
    const regra = regraDaSerie(o.ex, passo, proximoPasso);
    const ja = feita(lista, i);
    // A carga ja usada hoje vale mais que a do plano (drop e a carga propria dele).
    const aquecendo = passo.t === 'a';
    // Autorregulacao (ajusteEntreSeries): a ultima serie de trabalho feita antes desta mostrou carga
    // leve ou pesada demais? Esta ja vem corrigida, com o motivo. Sai do que esta gravado, entao
    // vale tambem depois de fechar e abrir a tela.
    const anteriorFeita = (() => { for (let k = i - 1; k >= 0; k -= 1) if (lista[k]?.reps > 0 && !lista[k].t && !pl.passos[k]?.t) return lista[k]; return null; })();
    const ajuste = ja || passo.t ? null : o.ajuste?.(anteriorFeita) ?? null;
    const cargaDeHoje = passo.t === 'd' || aquecendo ? null : ajuste?.carga ?? [...lista].reverse().find((s) => s.reps > 0 && !s.t)?.carga ?? null;
    // Com a carga corrigida no meio do exercicio, a meta acompanha: a carga nova, no comeco da faixa.
    const alvo = ajuste ? { carga: ajuste.carga, reps: pl.faixa.min } : passo.alvo;
    const dicaDoPasso = ajuste ? `Carga ajustada hoje: qualquer número de ${pl.faixa.min} a ${pl.faixa.max} reps vale.` : passo.dica;
    if (!valores.has(i)) valores.set(i, ja ? { carga: ja.carga, reps: ja.reps, seg: ja.seg ?? 0 } : { carga: cargaDeHoje ?? alvo.carga, reps: alvo.reps, seg: 0 });
    const primeiraDeTrabalho = !aquecendo && !passo.t && pl.passos.findIndex((p) => p.t !== 'a') === i;
    const valor = valores.get(i);
    const doTipo = pl.passos.filter((p) => p.tipo === passo.tipo).length;
    const fase = ja || medida?.i === i ? 'anotar' : contando?.i === i ? 'contando' : 'preparar';
    desenharFases(pl.passos, lista, i);

    const aoVivo = h('div', { class: 'ao-vivo', 'aria-live': 'polite' });
    const acertarAoVivo = () => {
      if (aquecendo) { aoVivo.replaceChildren(h('span', { class: 'selo' }, h('span', { texto: 'Aquecimento: não conta' }))); return; }
      const v = veredito(valor, passo.base);
      aoVivo.replaceChildren(passo.base === null
        ? h('span', { class: 'selo', 'data-tipo': 'nova' }, h('span', { texto: 'Primeiro registro' }))
        : selo(v.tipo === 'igual' ? { tipo: 'igual', texto: 'Igual ao anterior' } : v));
    };
    const campoReps = campoNumero(`${passo.rotulo}, repetições`, valor.reps, false, (v) => { valor.reps = v; acertarAoVivo(); }, 'campo-jogo grande');
    const campoCarga = campoNumero(`${passo.rotulo}, carga em kg`, valor.carga, true, (v) => { valor.carga = v; acertarAoVivo(); }, `campo-jogo${fase === 'preparar' ? ' grande' : ''}`);
    const andar = (campo, chave, quanto) => () => {
      valor[chave] = Math.max(0, Math.round((valor[chave] + quanto) * 10) / 10);
      campo.value = numeroBr(valor[chave]);
      acertarAoVivo();
      movimento.numeroMudou(campo, quanto);
    };
    const numero = (classe, unidade, campo, chave, oQue) => h('div', { class: `passo-numero ${classe}` },
      h('button', { class: 'passo-botao', 'aria-label': `Menos ${oQue}`, onclick: andar(campo, chave, -1) }, icone('menos')),
      h('label', { class: 'passo-valor' }, campo, h('span', { texto: unidade })),
      h('button', { class: 'passo-botao', 'aria-label': `Mais ${oQue}`, onclick: andar(campo, chave, 1) }, icone('mais')));

    const comecar = () => {
      if (travado()) return;
      travar();
      o.pararDescanso();
      contando = { i, desde: Date.now() };
      mostrarPasso(i, 0);
    };
    const parar = () => {
      if (travado() || !contando) return;
      travar();
      medida = { i, seg: Math.max(1, Math.round((Date.now() - contando.desde) / 1000)) };
      valor.seg = medida.seg;
      contando = null;
      mostrarPasso(i, 0);
    };
    const semRelogio = () => { medida = { i, seg: 0 }; valor.seg = 0; mostrarPasso(i, 0); };

    const feito = () => {
      if (travado()) return;
      if (valor.reps <= 0) { movimento.nega(campoReps); return; }
      travar();
      o.gravar(i, valor);
      mudou = true;
      medida = null;
      valores.delete(i);
      o.cena?.atualizar();
      const depois = plano();
      const listaDepois = o.feitas();
      const proximo = pendenteDepoisDe(depois.passos, listaDepois, i + 1);
      if (!ja && !aquecendo) estampar(veredito(valor, passo.base), passo, valor, pl.faixa);
      // A proxima serie de trabalho recalcula a carga pelo que acabou de ser gravado.
      if (!ja && !aquecendo && !passo.t) { const seguinte = depois.passos.findIndex((p, k) => k > i && !p.t && feita(listaDepois, k) === null); if (seguinte !== -1) valores.delete(seguinte); }
      if (!ja) {
        // Descanso so quando o exercicio (ou o metodo) define um; pelo feeling, nenhum cronometro.
        const pausa = intervaloAntes(proximo === -1 ? null : depois.passos[proximo], o.ex);
        if (pausa.segundos) o.descansar(pausa.segundos, pausa.rotulo, pausa.texto); else o.pararDescanso();
      }
      if (proximo === -1) {
        mostrarFim();
        return;
      }
      mostrarPasso(proximo, 1);
    };

    // A meta e o treino anterior num cartao so: o que vale hoje em cima, a referencia embaixo.
    const anterior = aquecendo ? null : passo.base
      ? h('p', { class: 'jogo-anterior' }, h('span', { texto: 'Treino anterior' }), h('b', {}, cargaReps(passo.base.carga, passo.base.reps)), h('span', { class: 'jogo-quando', texto: o.quando ?? '' }), passo.base.seg ? h('span', { class: 'jogo-quando', texto: `em ${relogio(passo.base.seg)}` }) : null)
      : h('p', { class: 'jogo-anterior' }, h('span', { texto: 'Treino anterior' }), h('b', { class: 'sem', texto: 'ainda não tem' }));
    // Antes da primeira serie de trabalho: a chance de evoluir hoje e o porque (analiseDoExercicio).
    const analise = o.analise ?? null;
    const chance = primeiraDeTrabalho && !ja && analise?.chance
      ? h('p', { class: 'jogo-chance' }, h('span', { class: 'chance', 'data-nivel': analise.chance.nivel, texto: CHANCE[analise.chance.nivel] }), h('span', { texto: analise.recomendacao.texto }))
      : null;
    // O porque do aquecimento (o dia inteiro: frio, ja aquecido, ontem, dia cheio) no 1o degrau,
    // ou na 1a serie quando o app decidiu entrar direto.
    const entraDireto = primeiraDeTrabalho && (o.ex.aquecer ?? 0) === 0 && o.ex.aquecerModo !== 'nenhum';
    const porque = !ja && o.ex.aquecerMotivo && ((aquecendo && pl.passos.findIndex((p) => p.t === 'a') === i) || entraDireto)
      ? h('p', { class: 'jogo-porque' }, h('b', { texto: entraDireto ? 'Sem aquecimento' : 'Por que assim' }), h('span', { texto: o.ex.aquecerMotivo }))
      : null;
    const cartaoMeta = h('div', { class: 'jogo-meta', 'data-tipo': aquecendo ? 'aquecimento' : pl.tipo },
      h('span', { class: 'jogo-rotulo', texto: aquecendo ? 'Leve' : 'Meta' }),
      h('b', {}, cargaReps(alvo.carga, alvo.reps)),
      h('p', { texto: dicaDoPasso }),
      porque,
      anterior,
      chance);
    const avisoDeAjuste = ajuste ? h('p', { class: 'jogo-ajuste', role: 'status' }, icone(ajuste.carga > (lista.findLast?.((x) => x.reps > 0 && !x.t)?.carga ?? 0) ? 'subir' : 'descer'), ajuste.texto) : null;
    const titulo = h('h2', { class: 'jogo-etapa' }, passo.rotulo, doTipo > 1 ? h('small', { texto: ` de ${doTipo}` }) : null,
      h('span', { class: 'jogo-regra', 'data-ate': regra.ate, texto: regra.curto }));

    // O tipo da serie e a execucao anotada no plano (ex.: 'Lento'), sempre a mostra.
    const tipoDaSerie = () => h('div', { class: 'jogo-tipo' },
      h('span', { class: 'tipo-chip', texto: aquecendo ? 'Aquecimento · não conta' : `${METODOS[o.ex.metodo]?.nome ?? 'Série normal'}${passo.tipo !== 'serie' ? ` · ${passo.rotulo}` : ''}` }),
      o.ex.nota ? h('span', { class: 'tipo-chip nota' }, h('small', { texto: 'Execução' }), o.ex.nota) : null);
    const comoFazer = regra.durante && regra.durante !== o.ex.nota ? h('p', { class: 'jogo-como', texto: regra.durante }) : null;

    const algumFeito = lista.some((s) => s.reps > 0);
    const acoes = h('div', { class: 'jogo-acoes' },
      fase === 'preparar' ? h('button', { class: 'botao texto', onclick: semRelogio, texto: 'Anotar sem cronômetro' })
        : ja ? h('button', { class: 'botao texto', onclick: () => { o.desmarcar(i); mudou = true; valores.delete(i); o.cena?.atualizar(); mostrarPasso(i, 1); }, texto: 'Desmarcar' })
          : fase === 'anotar' && valor.seg > 0 ? h('button', { class: 'botao texto', onclick: () => { medida = null; valor.seg = 0; mostrarPasso(i, 0); }, texto: 'Medir de novo' }) : h('span'),
      aquecendo && !ja && fase !== 'contando' ? h('button', {
        class: 'botao texto', onclick: () => {
          o.pularAquecimento?.();
          const k = pendenteDepoisDe(plano().passos, o.feitas(), i);
          if (k === -1) mostrarFim(); else mostrarPasso(k, 1);
        }, texto: 'Pular aquecimento',
      }) : algumFeito && fase !== 'contando' ? h('button', {
        class: 'botao texto', onclick: () => { o.encerrar(); mudou = true; o.cena?.atualizar(); mostrarFim(); }, texto: 'Encerrar exercício',
      }) : null);

    if (fase === 'preparar') {
      corpo.dataset.fase = 'preparar';
      trocarCorpo(
        titulo,
        avisoDeAjuste,
        cartaoMeta,
        numero('carga primeiro', 'kg', campoCarga, 'carga', 'um quilo'),
        tipoDaSerie(),
        comoFazer,
        h('button', { class: 'botao principal cheio jogo-feito', onclick: comecar }, icone('comecar'), 'Começar série'),
        acoes);
    } else if (fase === 'contando') {
      corpo.dataset.fase = 'contando';
      const tempo = h('b', { class: 'jogo-relogio', role: 'timer', 'aria-label': 'Tempo da série' });
      const tique = () => { tempo.textContent = relogio((Date.now() - contando.desde) / 1000); };
      tique();
      relogioDaSerie = setInterval(tique, 250);
      trocarCorpo(
        titulo,
        h('div', { class: 'jogo-contando' },
          // As repeticoes sao o numero grande enquanto a serie roda; o relogio vem embaixo, menor
          // (10/11/2026: 'a meta 13 reps grande pq ele ta escondendo'; depois 'é mais importante
          // quantas reps eu vou fazer do que o cronometro').
          h('div', { class: 'jogo-alvo', 'data-ate': regra.ate },
            h('span', { class: 'jogo-rotulo', texto: regra.ate === 'falha' ? 'Até a falha' : aquecendo ? 'Aquecimento' : 'Meta' }),
            h('b', {}, String(alvo.reps), h('small', { texto: ' reps' })),
            h('span', { class: 'jogo-alvo-carga', texto: `com ${kg(valor.carga)}` })),
          h('div', { class: 'jogo-tempo' }, h('span', { class: 'jogo-rotulo', texto: 'Tempo da série' }), tempo),
          tipoDaSerie(),
          comoFazer),
        h('button', { class: 'botao cheio jogo-feito jogo-parar', onclick: parar }, icone('parar'), 'Parar série'),
        acoes);
    } else {
      corpo.dataset.fase = 'anotar';
      trocarCorpo(
        titulo,
        valor.seg > 0 ? h('p', { class: 'jogo-durou' }, 'Série em ', h('b', { texto: relogio(valor.seg) }), passo.base?.seg ? ` · anterior ${relogio(passo.base.seg)}` : '') : null,
        numero('carga', 'kg', campoCarga, 'carga', 'um quilo'),
        numero('reps', 'reps', campoReps, 'reps', 'uma repetição'),
        aoVivo,
        h('button', { class: 'botao principal cheio jogo-feito', onclick: feito }, icone('check'), ja ? 'Salvar' : 'Feito'),
        acoes);
      acertarAoVivo();
    }
    if (direcao !== 0) movimento.passoEntrou(corpo, direcao);
  }

  /** O veredito da serie que acabou de ser feita, grande, em cima da barra. */
  function estampar(v, passo, valor, faixa) {
    const titulo = v.tipo === 'nova' ? 'Primeiro registro' : v.tipo === 'igual' ? 'Igual ao anterior' : v.texto;
    let sub = 'Na próxima, a meta é passar disso.';
    if (v.tipo === 'reps') sub = `Passou o treino anterior: ${passo.base.reps} → ${valor.reps}. Boa!`;
    if (v.tipo === 'carga') sub = `${kg(valor.carga)}: mais carga que da última vez. Boa!`;
    if (v.tipo === 'igual') sub = `${valor.reps} reps com ${kg(valor.carga)}, como da última vez.`;
    if (v.tipo === 'abaixo') {
      sub = valor.carga < passo.base.carga
        ? `Hoje ${kg(valor.carga)}; no treino anterior, ${kg(passo.base.carga)}.`
        : `Hoje ${valor.reps}; no treino anterior, ${passo.base.reps}.`;
    }
    if (!passo.t && valor.reps >= faixa.max && v.tipo !== 'abaixo') sub += ` Teto de ${faixa.max} batido.`;
    const subiu = v.tipo === 'reps' || v.tipo === 'carga';
    carimbo.dataset.tipo = v.tipo;
    carimbo.replaceChildren(h('b', {}, subiu ? icone('subir') : null, titulo), h('span', { texto: sub }));
    clearTimeout(relogioDoCarimbo);
    relogioDoCarimbo = setTimeout(() => carimbo.replaceChildren(), 3200);
    movimento.carimbo(carimbo, subiu);
  }

  function mostrarFim() {
    naTela = 'fim';
    corpo.dataset.fase = 'fim';
    clearInterval(relogioDaSerie);
    const pl = plano();
    const lista = o.feitas();
    desenharFases(pl.passos, lista, -1);
    const r = resultadoDoExercicio(o.ex, lista, o.ultima);
    const proximo = o.proximo();
    const linhas = pl.passos.map((p, i) => ({ p, f: feita(lista, i) })).filter((x) => x.f !== null && x.p.t !== 'a');
    const cargas = linhas.filter((x) => !x.p.t).map((x) => x.f.carga);
    // o aquecimento nao entra na conta do que faltou
    const deTrabalho = pl.passos.filter((p) => p.t !== 'a').length;
    let caixa = null;
    if (r !== null && r.liberou !== null) {
      caixa = h('div', { class: 'caixa-carga liberada' },
        h('span', { class: 'caixa-icone' }, icone('liberada')),
        h('b', { texto: 'Carga liberada' }),
        h('p', { class: 'caixa-grande', texto: `Próximo treino: ${kg(r.liberou)}` }),
        h('p', { texto: `Você fechou ${regraDaCarga(o.ex)}.` }));
    } else if (r !== null && linhas.length < deTrabalho) {
      caixa = h('div', { class: 'caixa-carga' },
        h('b', { texto: `Encerrado com ${linhas.length} de ${deTrabalho}` }),
        h('p', { texto: `No próximo treino a carga continua em ${kg(Math.max(...cargas))}. Ela sobe com ${regraDaCarga(o.ex)}.` }));
    } else if (r !== null) {
      caixa = h('div', { class: 'caixa-carga' },
        h('b', { texto: `Faltam ${reps(r.faltam)} para liberar ${kg(r.nova)}` }),
        h('p', { texto: `A carga sobe com ${regraDaCarga(o.ex)}. Por enquanto, a próxima meta é +1 rep onde faltou.` }));
    }
    const liberada = r !== null && r.liberou !== null ? caixa : null;
    trocarCorpo(
      h('h2', { class: 'jogo-etapa fim', texto: 'Exercício fechado' }),
      r === null || r.tipo === 'nova'
        ? h('div', { class: 'fim-resultado' }, h('b', { texto: 'Primeiro registro' }), h('span', { texto: 'vira a referência do próximo treino' }))
        : h('div', { class: 'fim-resultado', 'data-tipo': r.tipo },
          selo(r.tipo === 'igual' ? { tipo: 'igual', texto: 'Igual ao anterior' } : r, 'grande'),
          h('span', { texto: o.quando && o.quando !== 'anotado no plano' ? `contra o treino anterior (${o.quando})` : 'contra o que estava anotado' })),
      h('ol', { class: 'fim-lista' }, linhas.map(({ p, f }) => h('li', {},
        h('span', { texto: p.rotulo }),
        cargaReps(f.carga, f.reps),
        selo(veredito(f, p.base)) ?? h('span')))),
      caixa,
      proximo
        ? h('button', { class: 'botao principal cheio jogo-feito', onclick: () => { if (!travado()) { travar(); carregar(proximo); } } }, h('span', { class: 'corta', texto: `Próximo: ${proximo.ex.nome}` }), icone('seguir'))
        : h('button', { class: 'botao principal cheio jogo-feito', onclick: () => { if (!travado()) d.close(); }, texto: 'Voltar ao treino' }),
      h('div', { class: 'jogo-acoes' },
        h('button', {
          class: 'botao texto', onclick: () => { const novo = o.adicionar(); mudou = true; o.cena?.atualizar(); mostrarPasso(novo, 1); },
          texto: METODOS[o.ex.metodo] ? 'Mais um passo' : 'Mais uma série',
        }),
        proximo ? h('button', { class: 'botao texto', onclick: () => d.close(), texto: 'Voltar ao treino' }) : null));
    movimento.fimEntrou(corpo, liberada);
  }

  function carregar(nova) {
    o = nova;
    valores.clear();
    contando = null;
    medida = null;
    num.textContent = String(o.indice + 1).padStart(2, '0');
    nome.textContent = o.ex.nome;
    metodo.textContent = METODOS[o.ex.metodo]?.nome ?? '';
    metodo.hidden = !METODOS[o.ex.metodo];
    d.setAttribute('aria-label', `${o.ex.nome}, série a série`);
    o.cena?.montar(cena);
    o.cena?.foco(o.ex.id);
    const pl = plano();
    const i = o.comecarEm ?? pendenteDepoisDe(pl.passos, o.feitas(), 0);
    if (i === -1 || (o.comecarEm === null && o.encerrado())) mostrarFim();
    else mostrarPasso(Math.min(i, pl.passos.length - 1), 1);
  }

  // A tela da serie fica parada (10/11/2026, "eu consigo movimentar para baixo na tela do
  // iPhone, assim bugando o sistema de eu contar reps"). No Safari o arrasto dentro do
  // dialog passava para a pagina do treino atras dele e puxava a tela junto com a barra do
  // Safari; o toque no menos/mais virava rolagem. Agora a pagina de tras fica presa enquanto
  // a serie esta aberta, e o arrasto so rola o dialog quando ele nao cabe (texto grande),
  // sem o elastico das pontas.
  const soltarPagina = prenderPagina();
  let toqueY = 0;
  d.addEventListener('touchstart', (ev) => { toqueY = ev.touches[0]?.clientY ?? 0; }, { passive: true });
  d.addEventListener('touchmove', (ev) => {
    if (ev.touches.length > 1) return;
    const dy = (ev.touches[0]?.clientY ?? 0) - toqueY;
    const naoRola = d.scrollHeight <= d.clientHeight + 1;
    const noTopo = d.scrollTop <= 0 && dy > 0;
    const noFim = d.scrollTop + d.clientHeight >= d.scrollHeight - 1 && dy < 0;
    if (naoRola || noTopo || noFim) ev.preventDefault();
  }, { passive: false });

  d.addEventListener('close', () => {
    clearTimeout(relogioDoCarimbo);
    clearInterval(relogioDaSerie);
    aberto = null;
    o.cena?.foco(null);
    d.remove();
    soltarPagina();
    aoFechar({ mudou, ex: o.ex });
  });
  document.body.append(d);
  aberto = { descansoHost: descanso, cenaHost: cena };
  d.showModal();
  carregar(partida);
  movimento.jogoAbriu(d);
  return d;
}
