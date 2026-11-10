// O treino serie a serie (09/11/2026). Pedido: "separe o numero de series como se
// fosse um jogo ... base (quanto eu fiz semana passada), ai mostra um aviso: faca +1
// rep pra progredir, e ele parabeniza quando faca mais".
//
// Uma serie por tela: a base, a meta, as repeticoes num toque e o "Feito". Depois de
// cada serie vem o veredito (subiu, igual, abaixo) e o descanso; no fim, a conta que
// libera ou nao a carga do PROXIMO treino. As regras moram em treino.js: aqui e so tela.

import { campoNumero, h, icone, numeroBr, selo } from './dom.js';
import { METODOS, planoDeHoje, regraDaCarga, resultadoDoExercicio, veredito } from './treino.js';
import * as movimento from './movimento.js';

const kg = (v) => `${numeroBr(v)} kg`;
const reps = (n) => `${n} ${Math.abs(n) === 1 ? 'rep' : 'reps'}`;

let aberto = null;
/** A partida aberta agora (onde o descanso e a barra 3D devem aparecer), ou null. */
export const jogoAberto = () => aberto;

/**
 * partida: {
 *   ex, indice, ultima, quando ('03/11', 'anotado' ou null), comecarEm (passo ou null),
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
  const d = h('dialog', { class: 'jogo' },
    h('div', { class: 'jogo-topo' },
      h('button', { class: 'botao-redondo', 'aria-label': 'Fechar e voltar ao treino', onclick: () => d.close() }, icone('fechar')),
      h('div', { class: 'jogo-titulo' }, num, nome),
      metodo),
    fases,
    h('div', { class: 'jogo-palco' }, cena, carimbo),
    descanso,
    corpo);

  const plano = () => planoDeHoje(o.ex, o.ultima, o.feitas().length);
  const feita = (lista, i) => (lista[i] && lista[i].reps > 0 ? lista[i] : null);
  const pendenteDepoisDe = (passos, lista, de) => {
    for (let i = de; i < passos.length; i += 1) if (feita(lista, i) === null) return i;
    for (let i = 0; i < de; i += 1) if (feita(lista, i) === null) return i;
    return -1;
  };

  function desenharFases(passos, lista, atual) {
    fases.replaceChildren(...passos.map((p, i) => {
      const f = feita(lista, i);
      const v = f ? veredito(f, p.base) : null;
      return h('li', {}, h('button', {
        class: 'fase-pilula', 'data-estado': i === atual ? 'atual' : f ? 'feita' : 'pendente', 'data-tipo': v?.tipo ?? null,
        'aria-current': i === atual ? 'step' : null,
        'aria-label': `${p.rotulo}${f ? `: ${kg(f.carga)} × ${f.reps}, ${v.tipo === 'nova' ? 'base registrada' : v.texto}` : ''}`,
        onclick: () => mostrarPasso(i, i < atual ? -1 : 1),
      }, h('span', { texto: p.curto })));
    }));
  }

  function mostrarPasso(i, direcao = 1) {
    // Tocar numa serie que falta de um exercicio encerrado volta a valer o roteiro.
    if (o.encerrado() && feita(o.feitas(), i) === null) o.reabrir();
    const pl = plano();
    const lista = o.feitas();
    const passo = pl.passos[i];
    const ja = feita(lista, i);
    // A carga ja usada hoje vale mais que a do plano (drop e a carga propria dele).
    const cargaDeHoje = passo.t === 'd' ? null : [...lista].reverse().find((s) => s.reps > 0 && !s.t)?.carga ?? null;
    const valor = ja ? { carga: ja.carga, reps: ja.reps } : { carga: cargaDeHoje ?? passo.alvo.carga, reps: passo.alvo.reps };
    const doTipo = pl.passos.filter((p) => p.tipo === passo.tipo).length;
    desenharFases(pl.passos, lista, i);

    const aoVivo = h('div', { class: 'ao-vivo', 'aria-live': 'polite' });
    const acertarAoVivo = () => {
      const v = veredito(valor, passo.base);
      aoVivo.replaceChildren(passo.base === null
        ? h('span', { class: 'selo', 'data-tipo': 'nova' }, h('span', { texto: 'Vira a base' }))
        : selo(v.tipo === 'igual' ? { tipo: 'igual', texto: 'Igual à base' } : v));
    };
    const campoReps = campoNumero(`${passo.rotulo}, repetições`, valor.reps, false, (v) => { valor.reps = v; acertarAoVivo(); }, 'campo-jogo grande');
    const campoCarga = campoNumero(`${passo.rotulo}, carga em kg`, valor.carga, true, (v) => { valor.carga = v; acertarAoVivo(); }, 'campo-jogo');
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

    const feito = () => {
      if (travado()) return;
      if (valor.reps <= 0) { movimento.nega(campoReps); return; }
      travar();
      o.gravar(i, valor);
      mudou = true;
      o.cena?.atualizar();
      const depois = plano();
      const listaDepois = o.feitas();
      const proximo = pendenteDepoisDe(depois.passos, listaDepois, i + 1);
      if (!ja) estampar(veredito(valor, passo.base), passo, valor, pl.faixa);
      if (proximo === -1) {
        if (!ja) o.descansar(null);
        mostrarFim();
        return;
      }
      if (!ja) {
        const s = depois.passos[proximo].descansoS;
        if (s === 0) o.pararDescanso(); else o.descansar(s);
      }
      mostrarPasso(proximo, 1);
    };

    const algumFeito = lista.some((s) => s.reps > 0);
    corpo.replaceChildren(
      h('h2', { class: 'jogo-etapa' }, passo.rotulo, doTipo > 1 ? h('small', { texto: ` de ${doTipo}` }) : null),
      h('div', { class: 'jogo-base' },
        h('span', { class: 'jogo-rotulo', texto: 'Base' }),
        passo.base
          ? h('b', { texto: `${kg(passo.base.carga)} × ${passo.base.reps}` })
          : h('b', { class: 'sem', texto: 'ainda não tem' }),
        passo.base && o.quando ? h('span', { class: 'jogo-quando', texto: o.quando === 'anotado' ? 'anotado no plano' : `em ${o.quando}` }) : null),
      h('div', { class: 'jogo-meta', 'data-tipo': pl.tipo },
        h('span', { class: 'jogo-rotulo', texto: 'Meta' }),
        h('b', { texto: `${kg(passo.alvo.carga)} × ${passo.alvo.reps}` }),
        h('p', { texto: passo.dica })),
      numero('reps', 'reps', campoReps, 'reps', 'uma repetição'),
      aoVivo,
      numero('carga', 'kg', campoCarga, 'carga', 'um quilo'),
      h('button', { class: 'botao principal cheio jogo-feito', onclick: feito }, icone('check'), ja ? 'Salvar' : 'Feito'),
      h('div', { class: 'jogo-acoes' },
        ja ? h('button', {
          class: 'botao texto', onclick: () => { o.desmarcar(i); mudou = true; o.cena?.atualizar(); mostrarPasso(i, 1); }, texto: 'Desmarcar',
        }) : h('span'),
        algumFeito ? h('button', {
          class: 'botao texto', onclick: () => { o.encerrar(); mudou = true; o.cena?.atualizar(); mostrarFim(); }, texto: 'Encerrar exercício',
        }) : null));
    acertarAoVivo();
    movimento.passoEntrou(corpo, direcao);
  }

  /** O veredito da serie que acabou de ser feita, grande, em cima da barra. */
  function estampar(v, passo, valor, faixa) {
    const titulo = v.tipo === 'nova' ? 'Base registrada' : v.tipo === 'igual' ? 'Igual à base' : v.texto;
    let sub = 'Na próxima, a meta é passar disso.';
    if (v.tipo === 'reps') sub = `Passou a base: ${passo.base.reps} → ${valor.reps}. Boa!`;
    if (v.tipo === 'carga') sub = `${kg(valor.carga)}: mais carga que da última vez. Boa!`;
    if (v.tipo === 'igual') sub = `${kg(valor.carga)} × ${valor.reps}, como da última vez.`;
    if (v.tipo === 'abaixo') {
      sub = valor.carga < passo.base.carga
        ? `Hoje ${kg(valor.carga)}; a base era ${kg(passo.base.carga)}.`
        : `Hoje ${valor.reps}; a base era ${passo.base.reps}.`;
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
    const pl = plano();
    const lista = o.feitas();
    desenharFases(pl.passos, lista, -1);
    const r = resultadoDoExercicio(o.ex, lista, o.ultima);
    const proximo = o.proximo();
    const linhas = pl.passos.map((p, i) => ({ p, f: feita(lista, i) })).filter((x) => x.f !== null);
    const cargas = linhas.filter((x) => !x.p.t).map((x) => x.f.carga);
    let caixa = null;
    if (r !== null && r.liberou !== null) {
      caixa = h('div', { class: 'caixa-carga liberada' },
        h('span', { class: 'caixa-icone' }, icone('liberada')),
        h('b', { texto: 'Carga liberada' }),
        h('p', { class: 'caixa-grande', texto: `Próximo treino: ${kg(r.liberou)}` }),
        h('p', { texto: `Você fechou ${regraDaCarga(o.ex)}.` }));
    } else if (r !== null && linhas.length < pl.passos.length) {
      caixa = h('div', { class: 'caixa-carga' },
        h('b', { texto: `Encerrado com ${linhas.length} de ${pl.passos.length}` }),
        h('p', { texto: `No próximo treino a carga continua em ${kg(Math.max(...cargas))}. Ela sobe com ${regraDaCarga(o.ex)}.` }));
    } else if (r !== null) {
      caixa = h('div', { class: 'caixa-carga' },
        h('b', { texto: `Faltam ${reps(r.faltam)} para liberar ${kg(r.nova)}` }),
        h('p', { texto: `A carga sobe com ${regraDaCarga(o.ex)}. Por enquanto, a próxima meta é +1 rep onde faltou.` }));
    }
    const liberada = r !== null && r.liberou !== null ? caixa : null;
    corpo.replaceChildren(
      h('h2', { class: 'jogo-etapa fim', texto: 'Exercício fechado' }),
      r === null || r.tipo === 'nova'
        ? h('div', { class: 'fim-resultado' }, h('b', { texto: 'Primeiro registro' }), h('span', { texto: 'vira a base do próximo treino' }))
        : h('div', { class: 'fim-resultado', 'data-tipo': r.tipo },
          selo(r.tipo === 'igual' ? { tipo: 'igual', texto: 'Igual à última vez' } : r, 'grande'),
          h('span', { texto: o.quando && o.quando !== 'anotado' ? `contra ${o.quando}` : 'contra o que estava anotado' })),
      h('ol', { class: 'fim-lista' }, linhas.map(({ p, f }) => h('li', {},
        h('span', { texto: p.rotulo }),
        h('b', { texto: `${kg(f.carga)} × ${f.reps}` }),
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

  d.addEventListener('close', () => {
    clearTimeout(relogioDoCarimbo);
    aberto = null;
    o.cena?.foco(null);
    d.remove();
    aoFechar({ mudou, ex: o.ex });
  });
  document.body.append(d);
  aberto = { descansoHost: descanso, cenaHost: cena };
  d.showModal();
  carregar(partida);
  movimento.jogoAbriu(d);
  return d;
}
