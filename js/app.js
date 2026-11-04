// Proximo Passo no iPhone (04/11/2026): treino, dieta e o Garry, ligados ao
// app do computador pela mesma nuvem cifrada. Primeira versao, experimental.

import { criarCifra, deBase64, lerCodigoDeRecuperacao, paraBase64 } from './cifra.js';
import { entrar, ErroNuvem, Nuvem, PROJETO } from './nuvem.js';
import { definirConfig, diaDaSemana, diaLogico, escrever, estadoVazio, podar, Sincronizador, somarDias } from './dados.js';
import {
  FAIXA_PADRAO, lerPlanoTreino, lerSessao, NOMES_DOS_DIAS, novoId, sessoesDoConfig, SIGLAS_DOS_DIAS,
  sugestao, textoDasSeries, treinoDoDia, ultimaVez, volume,
} from './treino.js';
import { PLANO_PADRAO, PERFIL_PADRAO, resumoNutricional, validarPerfil, validarPlano } from './gerado/nutricao.js';
import { abrirChave, configDaIa, conversar } from './garry.js';

// ---------- guardado no aparelho ----------

const guardado = {
  ler(nome, padrao = null) {
    try {
      const v = localStorage.getItem(`pp-${nome}`);
      return v === null ? padrao : JSON.parse(v);
    } catch {
      return padrao;
    }
  },
  gravar(nome, valor) {
    try {
      if (valor === null) localStorage.removeItem(`pp-${nome}`);
      else localStorage.setItem(`pp-${nome}`, JSON.stringify(valor));
    } catch {
      // armazenamento cheio ou bloqueado: o app segue, so nao lembra
    }
  },
};

/** Projeto do Supabase; so para a verificacao local da para trocar por um falso em 127.0.0.1. */
function projetoEmUso() {
  const teste = guardado.ler('projeto-teste');
  return teste && /^http:\/\/127\.0\.0\.1:\d+$/.test(teste.url) ? teste : PROJETO;
}
{
  const p = new URLSearchParams(location.search);
  if (p.has('projeto-teste')) {
    guardado.gravar('projeto-teste', { url: p.get('projeto-teste'), chavePublica: p.get('chave-teste') ?? '' });
    history.replaceState(null, '', location.pathname);
  }
}

let dispositivo = guardado.ler('dispositivo');
if (!dispositivo) {
  dispositivo = `iphone-${novoId()}`;
  guardado.gravar('dispositivo', dispositivo);
}

const app = {
  sessao: guardado.ler('sessao'),
  estado: Object.assign(estadoVazio(), guardado.ler('estado', {})),
  cifra: null,
  sinc: null,
  aba: guardado.ler('aba', 'treino'),
  sync: { estado: 'ok', mensagem: '', ultima: guardado.ler('ultima-sync') },
  conversa: guardado.ler('conversa', []),
  diaTreino: null,
  rascunho: {},
  descansoS: guardado.ler('descanso', 90),
};

const salvarEstado = () => guardado.gravar('estado', app.estado);

// ---------- DOM ----------

function h(tag, attrs = {}, ...filhos) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs ?? {})) {
    if (v === null || v === undefined || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else if (k === 'texto') el.textContent = v;
    else el.setAttribute(k, v === true ? '' : String(v));
  }
  for (const f of filhos.flat()) if (f !== null && f !== undefined && f !== false) el.append(f instanceof Node ? f : document.createTextNode(String(f)));
  return el;
}

function icone(nome) {
  const caminhos = {
    halter: 'M3 10v4M6 7v10M18 7v10M21 10v4M6 12h12',
    prato: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18Zm0 4a5 5 0 1 1 0 10 5 5 0 0 1 0-10Z',
    garry: 'M12 3c4.97 0 9 3.58 9 8s-4.03 8-9 8c-1.2 0-2.35-.2-3.4-.58L4 20l1.3-3.6C3.87 15 3 13.1 3 11c0-4.42 4.03-8 9-8ZM9 10v2M15 10v2',
    ajustes: 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6ZM19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1Z',
    check: 'M5 12.5l4.5 4.5L19 7.5',
    menos: 'M6 12h12',
    mais: 'M12 6v12M6 12h12',
    subir: 'M12 19V5M5 12l7-7 7 7',
    cima: 'M6 15l6-6 6 6',
    baixo: 'M6 9l6 6 6-6',
    enviar: 'M12 19V5M5 12l7-7 7 7',
  };
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', nome === 'ajustes' ? '1.8' : '2.2');
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');
  svg.setAttribute('aria-hidden', 'true');
  const p = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  p.setAttribute('d', caminhos[nome]);
  svg.append(p);
  return svg;
}

const raiz = document.getElementById('app');
const n0 = (v) => Math.round(v).toLocaleString('pt-BR');
const kg = (v) => `${String(Math.round(v * 10) / 10).replace('.', ',')} kg`;
const dataCurta = (dia) => `${dia.slice(8, 10)}/${dia.slice(5, 7)}`;
const hoje = () => diaLogico(new Date());

function dataPorExtenso(dia) {
  const [a, m, d] = dia.split('-').map(Number);
  return new Date(a, m - 1, d).toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' });
}

// ---------- sincronizacao ----------

let timerSync = null;
function sincronizarLogo(espera = 1200) {
  clearTimeout(timerSync);
  timerSync = setTimeout(() => sincronizar(), espera);
}

async function sincronizar() {
  if (app.sinc === null) return;
  try {
    const r = await app.sinc.sincronizar();
    app.sync = { estado: Object.keys(app.estado.pendentes).length > 0 ? 'esperando' : 'ok', mensagem: '', ultima: new Date().toISOString() };
    guardado.gravar('ultima-sync', app.sync.ultima);
    podar(app.estado, hoje());
    salvarEstado();
    if (r.recebidos > 0) desenhar();
  } catch (e) {
    app.sync = { ...app.sync, estado: 'erro', mensagem: e instanceof ErroNuvem ? e.message : 'A sincronização falhou. Tento de novo sozinho.' };
    if (e instanceof ErroNuvem && e.tipo === 'login') {
      app.sessao = null;
      guardado.gravar('sessao', null);
      desenhar();
      return;
    }
  }
  atualizarPontoSync();
}

function atualizarPontoSync() {
  const ponto = document.querySelector('.ponto-sync');
  if (!ponto) return;
  const esperando = Object.keys(app.estado.pendentes).length > 0;
  ponto.dataset.estado = app.sync.estado === 'erro' ? 'erro' : esperando ? 'esperando' : 'ok';
}

/** Toda mudanca do celular passa por aqui: vale na hora e sobe logo depois. */
function mudar(fn) {
  fn(app.estado);
  salvarEstado();
  atualizarPontoSync();
  sincronizarLogo();
}

async function ligar() {
  const segredo = guardado.ler('segredo');
  if (app.sessao === null || segredo === null) return false;
  app.cifra = await criarCifra(deBase64(segredo));
  const nuvem = new Nuvem({
    projeto: projetoEmUso(),
    sessao: () => app.sessao,
    guardarSessao: (s) => { app.sessao = s; guardado.gravar('sessao', s); },
  });
  app.sinc = new Sincronizador({ nuvem, cifra: app.cifra, dispositivo, estado: app.estado, guardar: salvarEstado, aoProgresso: (n) => progressoInicial(n) });
  return true;
}

// ---------- entrar ----------

function telaEntrar(erro = '') {
  const email = h('input', { class: 'campo', type: 'email', autocomplete: 'username', inputmode: 'email', placeholder: 'seu@email.com', value: app.sessao?.email ?? '' });
  const senha = h('input', { class: 'campo', type: 'password', autocomplete: 'current-password', placeholder: 'Senha' });
  const msg = h('p', { class: 'erro', role: 'alert', texto: erro });
  const botao = h('button', { class: 'botao principal cheio', type: 'submit', texto: 'Entrar' });
  const form = h('form', {
    onsubmit: async (ev) => {
      ev.preventDefault();
      botao.disabled = true;
      botao.textContent = 'Entrando…';
      msg.textContent = '';
      try {
        app.sessao = await entrar(email.value.trim(), senha.value, { projeto: projetoEmUso() });
        guardado.gravar('sessao', app.sessao);
        desenhar();
      } catch (e) {
        msg.textContent = e.message;
        botao.disabled = false;
        botao.textContent = 'Entrar';
      }
    },
  },
  h('label', { class: 'rotulo', texto: 'E-mail da sincronização' }), email,
  h('label', { class: 'rotulo', texto: 'Senha' }), senha,
  msg, h('div', { style: 'height:16px' }), botao);
  return h('main', { class: 'entrada' },
    h('img', { class: 'marca', src: 'icone.png', alt: '' }),
    h('h1', { texto: 'Próximo Passo' }),
    h('p', { class: 'discreto', texto: 'Entre com a mesma conta da sincronização do app do computador.' }),
    form);
}

function telaCodigo(erro = '') {
  const campo = h('textarea', { class: 'campo', rows: '3', autocapitalize: 'characters', autocomplete: 'off', spellcheck: 'false', placeholder: 'XXXX-XXXX-XXXX-…', style: 'padding:12px 14px;font-family:ui-monospace,monospace' });
  const msg = h('p', { class: 'erro', role: 'alert', texto: erro });
  const botao = h('button', { class: 'botao principal cheio', type: 'submit', texto: 'Continuar' });
  return h('main', { class: 'entrada' },
    h('img', { class: 'marca', src: 'icone.png', alt: '' }),
    h('h1', { texto: 'Código de recuperação' }),
    h('p', { class: 'discreto', texto: 'É o código de 13 grupos que o app do computador mostrou ao ligar a sincronização (Ajustes > Sincronização). Ele abre os seus dados: fica só neste iPhone.' }),
    h('form', {
      onsubmit: async (ev) => {
        ev.preventDefault();
        const segredo = lerCodigoDeRecuperacao(campo.value);
        if (segredo === null) { msg.textContent = 'Esse não é um código de recuperação. Confira as letras e os números.'; return; }
        botao.disabled = true;
        botao.textContent = 'Conferindo…';
        guardado.gravar('segredo', paraBase64(segredo));
        try {
          await ligar();
          if (!(await app.sinc.codigoConfere())) throw new Error('O código não abre os dados desta conta. Confira no computador.');
          desenhar();
        } catch (e) {
          guardado.gravar('segredo', null);
          app.sinc = null;
          msg.textContent = e.message;
          botao.disabled = false;
          botao.textContent = 'Continuar';
        }
      },
    }, campo, msg, h('div', { style: 'height:16px' }), botao),
    h('button', { class: 'botao texto', style: 'margin:16px auto 0', onclick: sair, texto: 'Usar outra conta' }));
}

let barraInicial = null;
function telaBaixando() {
  barraInicial = h('i');
  const texto = h('p', { class: 'discreto', id: 'baixando-texto', texto: 'Trazendo seus dados da nuvem pela primeira vez…' });
  return h('main', { class: 'entrada' },
    h('img', { class: 'marca', src: 'icone.png', alt: '' }),
    h('h1', { texto: 'Quase lá' }),
    texto,
    h('div', { class: 'barra', role: 'progressbar', 'aria-label': 'Baixando' }, barraInicial));
}

function progressoInicial(n) {
  const t = document.getElementById('baixando-texto');
  if (t) t.textContent = `Trazendo seus dados da nuvem pela primeira vez… ${n0(n)} itens`;
  if (barraInicial) barraInicial.style.width = `${Math.min(95, 8 + Math.log10(n + 1) * 20)}%`;
}

// ---------- moldura ----------

/**
 * Titulo grande do iOS: rola com a tela e, quando some, o nome aparece pequeno
 * na barra fixa de cima (com o vidro do sistema por tras).
 */
function cabeca(titulo, subtitulo = '') {
  const barra = h('div', { class: 'barra-nav' },
    h('span', { class: 'titulo-nav', 'aria-hidden': 'true', texto: titulo }),
    h('button', { class: 'botao-redondo', 'aria-label': 'Ajustes e sincronização', onclick: abrirAjustes }, icone('ajustes'), h('span', { class: 'ponto-sync' })));
  const grande = h('h1', { class: 'titulo-grande', texto: titulo });
  return [barra, h('header', { class: 'cabeca' }, grande, subtitulo ? h('p', { class: 'subtitulo', texto: subtitulo }) : null)];
}

/** A barra fica compacta assim que o titulo grande passa por baixo dela. */
function acertarBarra() {
  const barra = document.querySelector('.barra-nav');
  const grande = document.querySelector('.titulo-grande');
  if (barra && grande) barra.classList.toggle('compacta', grande.getBoundingClientRect().top < barra.getBoundingClientRect().bottom - 8);
}
window.addEventListener('scroll', acertarBarra, { passive: true });

function abas() {
  const aba = (id, nome, ic) => h('button', {
    class: 'aba', 'aria-current': app.aba === id ? 'page' : null,
    onclick: () => { app.aba = id; guardado.gravar('aba', id); desenhar(); window.scrollTo(0, 0); },
  }, icone(ic), nome);
  return h('nav', { class: 'abas', 'aria-label': 'Seções' }, aba('treino', 'Treino', 'halter'), aba('dieta', 'Dieta', 'prato'), aba('garry', 'Garry', 'garry'));
}

function desenhar() {
  raiz.replaceChildren();
  if (app.sessao === null) { raiz.append(telaEntrar()); return; }
  if (app.sinc === null) { raiz.append(telaCodigo()); return; }
  if (app.estado.cursor === 0) {
    raiz.append(telaBaixando());
    app.sinc.receber().then(() => { salvarEstado(); desenhar(); sincronizar(); }).catch((e) => {
      raiz.replaceChildren(telaEntrar(e.message));
    });
    return;
  }
  const faixaAntes = document.querySelector('.dias')?.scrollLeft ?? null;
  const tela = app.aba === 'dieta' ? telaDieta() : app.aba === 'garry' ? telaGarry() : telaTreino();
  raiz.append(tela, abas());
  centrarDia(faixaAntes);
  acertarBarra();
  atualizarPontoSync();
}

/** O dia escolhido (no comeco, hoje) fica no meio da faixa; trocar de dia desliza ate ele. */
function centrarDia(faixaAntes) {
  const faixa = document.querySelector('.dias');
  const sel = faixa?.querySelector('[aria-pressed="true"]');
  if (!faixa || !sel) return;
  const alvo = sel.offsetLeft - (faixa.clientWidth - sel.offsetWidth) / 2;
  if (faixaAntes === null || !app.deslizarDia) {
    faixa.scrollLeft = alvo;
  } else {
    faixa.scrollLeft = faixaAntes;
    faixa.scrollTo({ left: alvo, behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth' });
  }
  app.deslizarDia = false;
}

// ---------- treino ----------

const planoTreino = () => lerPlanoTreino(app.estado.config.treinoPlano ?? '{"dias":[]}');
const chaveSessao = (dia) => `treinoSessao:${dia}`;
const sessaoDe = (dia) => lerSessao(app.estado.config[chaveSessao(dia)] ?? null) ?? { dia, treinoId: null, exercicios: {}, cardio: null, atualizadoEm: '' };

function gravarSessao(sessao) {
  sessao.atualizadoEm = new Date().toISOString();
  mudar((e) => definirConfig(e, chaveSessao(sessao.dia), JSON.stringify(sessao)));
}

function telaTreino() {
  const plano = planoTreino();
  const dia = hoje();
  const semanaHoje = diaDaSemana(dia);
  // A faixa e de segunda a sabado. No domingo ela ja mostra a semana que vem.
  if (app.diaTreino === null) app.diaTreino = semanaHoje === 0 ? 1 : semanaHoje;
  const segunda = semanaHoje === 0 ? somarDias(dia, 1) : somarDias(dia, 1 - semanaHoje);
  const tela = h('main', { class: 'tela' }, cabeca('Treino', dataPorExtenso(dia)));

  if (plano.dias.length === 0) {
    tela.append(h('div', { class: 'cartao' },
      h('p', { texto: 'Seu treino ainda não chegou do computador.' }),
      h('p', { class: 'discreto', texto: 'Ele vem pela sincronização. Se não aparecer em alguns minutos, monte aqui.' }),
      h('button', { class: 'botao principal cheio', style: 'margin-top:10px', onclick: () => abrirEditor(semanaHoje), texto: 'Montar treino' })));
    return tela;
  }

  tela.append(h('div', { class: 'dias', role: 'group', 'aria-label': 'Dia do treino' },
    [1, 2, 3, 4, 5, 6].map((ds) => {
      const data = somarDias(segunda, ds - 1);
      const doDia = treinoDoDia(plano, ds);
      const ehHoje = data === dia;
      return h('button', {
        class: 'dia', 'aria-pressed': String(ds === app.diaTreino), 'data-hoje': ehHoje ? 'sim' : null,
        'aria-label': `${ehHoje ? 'Hoje, ' : ''}${NOMES_DOS_DIAS[ds]} ${Number(data.slice(8))}: ${doDia?.nome ?? 'descanso'}`,
        onclick: () => { app.diaTreino = ds; app.deslizarDia = true; desenhar(); },
      },
      h('span', { class: 'dia-sigla', texto: ehHoje ? 'Hoje' : SIGLAS_DOS_DIAS[ds] }),
      h('b', { class: 'dia-num', texto: String(Number(data.slice(8))) }),
      h('span', { class: 'dia-treino', texto: doDia ? doDia.nome.split(/[ ,]/)[0] : 'Descanso' }));
    })));

  const treino = treinoDoDia(plano, app.diaTreino);
  const sessao = sessaoDe(dia);
  const sessoes = sessoesDoConfig(app.estado.config);
  if (treino === null) {
    tela.append(h('section', { class: 'cartao vazio' },
      h('h2', { class: 'treino-nome', texto: `${NOMES_DOS_DIAS[app.diaTreino]} é descanso` }),
      h('p', { class: 'discreto', texto: 'Não há treino montado para este dia.' }),
      h('button', { class: 'botao cheio', onclick: () => abrirEditor(app.diaTreino), texto: `Montar treino de ${NOMES_DOS_DIAS[app.diaTreino].toLowerCase()}` })));
    tela.append(cartaoCardio(sessao));
    return tela;
  }

  const feitasHoje = treino.exercicios.flatMap((e) => (sessao.exercicios[e.id] ?? []).filter((s) => s.reps > 0));
  const completos = treino.exercicios.filter((e) => (sessao.exercicios[e.id] ?? []).filter((s) => s.reps > 0).length >= e.series).length;
  const total = treino.exercicios.length;
  tela.append(h('section', { class: 'treino-cabeca' },
    h('h2', { class: 'treino-nome', texto: treino.nome }),
    treino.nota ? h('p', { class: 'discreto', texto: treino.nota }) : null,
    app.diaTreino !== semanaHoje ? h('p', { class: 'aviso-dia', texto: `O que você marcar aqui conta como o treino de hoje.` }) : null,
    h('p', { class: 'treino-progresso', texto: `${completos} de ${total} exercícios · ${feitasHoje.length} séries · ${n0(volume(feitasHoje))} kg` }),
    h('div', { class: 'progresso', role: 'progressbar', 'aria-label': 'Exercícios completos', 'aria-valuemin': '0', 'aria-valuemax': String(total), 'aria-valuenow': String(completos) },
      h('i', { style: `width:${total > 0 ? (completos / total) * 100 : 0}%` }))));
  for (const ex of treino.exercicios) tela.append(cartaoExercicio(ex, sessao, sessoes, dia, treino.id));

  tela.append(cartaoCardio(sessao));
  tela.append(h('button', { class: 'botao cheio', style: 'margin-top:8px', onclick: () => abrirEditor(app.diaTreino), texto: 'Editar treino' }));
  return tela;
}

function cartaoExercicio(ex, sessao, sessoes, dia, treinoId) {
  const ultima = ultimaVez(ex, sessoes, dia);
  const sug = sugestao(ex, ultima);
  const faixa = ex.faixa ?? FAIXA_PADRAO;
  const feitas = sessao.exercicios[ex.id] ?? [];
  const total = Math.max(ex.series, feitas.length);
  const completo = feitas.filter((s) => s.reps > 0).length >= ex.series;
  const cartao = h('section', { class: `cartao exercicio${completo ? ' completo' : ''}`, 'aria-label': ex.nome });

  cartao.append(h('div', { class: 'ex-topo' },
    h('h3', { class: 'ex-nome', texto: ex.nome }),
    h('span', { class: `chip${ex.faixa ? '' : ' padrao'}`, title: ex.faixa ? null : 'Faixa padrão: dá para mudar em Editar treino', texto: `${faixa.min}–${faixa.max} reps` })));
  if (ex.nota) cartao.append(h('p', { class: 'ex-nota', texto: ex.nota }));
  if (ex.aquecimento.length > 0) cartao.append(h('p', { class: 'ex-linha', texto: `Aquecimento: ${ex.aquecimento.map((s) => `${kg(s.carga)}×${s.reps}`).join(' · ')}` }));
  if (ultima) cartao.append(h('p', { class: 'ex-linha', texto: `${ultima.dia ? `Última vez (${dataCurta(ultima.dia)})` : 'Anotado'}: ${textoDasSeries(ultima.series)}` }));
  cartao.append(h('p', { class: 'sugestao', 'data-tipo': sug.tipo }, sug.tipo === 'subir' ? icone('subir') : null, h('span', { texto: sug.texto })));

  const cargaPadrao = sug.carga ?? ultima?.series.at(-1)?.carga ?? ex.referencia?.carga ?? 0;
  for (let i = 0; i < total; i += 1) {
    const chave = `${ex.id}|${i}`;
    const feita = feitas[i] && feitas[i].reps > 0 ? feitas[i] : null;
    const valor = feita ?? app.rascunho[chave] ?? { carga: cargaPadrao, reps: sug.reps[i] ?? sug.reps.at(-1) ?? faixa.min };
    cartao.append(linhaSerie(ex, i, valor, feita !== null, sessao, treinoId));
  }
  cartao.append(h('div', { class: 'ex-acoes' },
    h('button', {
      class: 'botao texto', onclick: () => {
        const s = sessaoDe(dia);
        const lista = s.exercicios[ex.id] ?? [];
        while (lista.length < total) lista.push({ carga: 0, reps: 0 });
        lista.push({ carga: 0, reps: 0 });
        s.exercicios[ex.id] = lista;
        s.treinoId = treinoId;
        gravarSessao(s);
        desenhar();
      }, texto: 'Adicionar série',
    }),
    h('button', { class: 'botao texto', onclick: () => abrirHistorico(ex), texto: 'Histórico' })));
  return cartao;
}

function passo(rotulo, valor, delta, aoMudar, decimal) {
  const input = h('input', { type: 'text', inputmode: decimal ? 'decimal' : 'numeric', value: String(valor).replace('.', ','), 'aria-label': rotulo });
  const ler = () => {
    const v = Number(input.value.replace(',', '.'));
    return Number.isFinite(v) && v >= 0 ? v : 0;
  };
  const definir = (v) => {
    const limpo = Math.max(0, Math.round(v * 10) / 10);
    input.value = String(limpo).replace('.', ',');
    aoMudar(limpo);
  };
  input.addEventListener('change', () => definir(ler()));
  input.addEventListener('focus', () => input.select());
  return h('div', { class: 'passo' },
    h('button', { 'aria-label': `Menos ${rotulo}`, onclick: () => definir(ler() - delta(ler(), -1)) }, icone('menos')),
    h('label', {}, input, h('small', { texto: rotulo })),
    h('button', { 'aria-label': `Mais ${rotulo}`, onclick: () => definir(ler() + delta(ler(), 1)) }, icone('mais')));
}

const deltaCarga = (v, sentido) => (sentido < 0 ? (v <= 20 ? 1 : 2.5) : (v < 20 ? 1 : 2.5));

function linhaSerie(ex, i, valor, feita, sessao, treinoId) {
  const chave = `${ex.id}|${i}`;
  const atual = { ...valor };
  const linha = h('div', { class: `serie${feita ? ' feita' : ''}` });
  const aoMudar = () => {
    if (linha.classList.contains('feita')) gravarSerie(ex, i, atual, treinoId);
    else app.rascunho[chave] = { ...atual };
  };
  linha.append(
    h('span', { class: 'n', texto: String(i + 1) }),
    passo('kg', atual.carga, deltaCarga, (v) => { atual.carga = v; aoMudar(); }, true),
    passo('reps', atual.reps, () => 1, (v) => { atual.reps = Math.round(v); aoMudar(); }, false),
    h('button', {
      class: 'check', 'aria-label': `Série ${i + 1} feita`, 'aria-pressed': String(feita),
      onclick: () => {
        if (linha.classList.contains('feita')) {
          gravarSerie(ex, i, { carga: atual.carga, reps: 0 }, treinoId);
          app.rascunho[chave] = { ...atual };
        } else {
          if (atual.reps <= 0) return;
          gravarSerie(ex, i, atual, treinoId);
          delete app.rascunho[chave];
          comecarDescanso();
        }
        desenhar();
      },
    }, icone('check')));
  return linha;
}

function gravarSerie(ex, i, valor, treinoId) {
  const s = sessaoDe(hoje());
  const lista = s.exercicios[ex.id] ?? [];
  while (lista.length <= i) lista.push({ carga: 0, reps: 0 });
  lista[i] = { carga: valor.carga, reps: valor.reps };
  // series vazias no fim nao precisam ficar guardadas
  while (lista.length > ex.series && lista.at(-1).reps === 0) lista.pop();
  s.exercicios[ex.id] = lista;
  s.treinoId = treinoId;
  gravarSessao(s);
}

function cartaoCardio(sessao) {
  const c = sessao.cardio;
  const tipo = h('select', { class: 'campo', 'aria-label': 'Tipo de cardio' },
    ['Esteira', 'Bicicleta', 'Escada', 'Elíptico', 'Caminhada', 'Corrida', 'Outro'].map((t) => h('option', { value: t, selected: c?.tipo === t ? true : null, texto: t })));
  const minutos = h('input', { class: 'campo', inputmode: 'numeric', placeholder: 'Minutos', value: c?.minutos ?? '', 'aria-label': 'Minutos' });
  const kcal = h('input', { class: 'campo', inputmode: 'numeric', placeholder: 'kcal', value: c?.kcal ?? '', 'aria-label': 'Calorias ativas' });
  return h('section', { class: 'cartao' },
    h('p', { class: 'ex-nome', texto: 'Cardio' }),
    h('p', { class: 'ex-linha', texto: c ? `Hoje: ${c.tipo || 'cardio'} · ${n0(c.minutos)} min${c.kcal ? ` · ${n0(c.kcal)} kcal` : ''}` : 'Copie do Apple Watch (app Atividade) quando terminar.' }),
    h('div', { class: 'ed-linha', style: 'margin-top:10px' }, tipo, minutos, kcal),
    h('button', {
      class: 'botao cheio', style: 'margin-top:10px', onclick: () => {
        const min = Number(minutos.value.replace(',', '.'));
        if (!Number.isFinite(min) || min <= 0) { minutos.focus(); return; }
        const k = Number(kcal.value.replace(',', '.'));
        const s = sessaoDe(hoje());
        s.cardio = { tipo: tipo.value, minutos: min, kcal: Number.isFinite(k) && k > 0 ? k : null };
        gravarSessao(s);
        desenhar();
      }, texto: c ? 'Atualizar cardio' : 'Salvar cardio',
    }));
}

// descanso entre as series

let descanso = null;
function comecarDescanso() {
  pararDescanso();
  const fim = Date.now() + app.descansoS * 1000;
  const el = h('div', { class: 'descanso', role: 'timer', 'aria-live': 'off' });
  const tempo = h('b');
  el.append(h('span', { class: 'pequeno', texto: 'Descanso' }), tempo,
    h('button', { class: 'botao', onclick: () => { descansoFim += 30_000; }, texto: '+30s' }),
    h('button', { class: 'botao', onclick: pararDescanso, texto: 'Pular' }));
  let descansoFim = fim;
  const tique = () => {
    const resta = Math.ceil((descansoFim - Date.now()) / 1000);
    if (resta <= 0) {
      el.dataset.fim = 'sim';
      tempo.textContent = 'Bora!';
      apito();
      clearInterval(descanso.relogio);
      descanso.relogio = null;
      setTimeout(pararDescanso, 4000);
      return;
    }
    tempo.textContent = `${Math.floor(resta / 60)}:${String(resta % 60).padStart(2, '0')}`;
  };
  document.body.append(el);
  descanso = { el, relogio: setInterval(tique, 250) };
  tique();
}
function pararDescanso() {
  if (descanso === null) return;
  if (descanso.relogio) clearInterval(descanso.relogio);
  descanso.el.remove();
  descanso = null;
}
function apito() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.frequency.value = 880;
    g.gain.setValueAtTime(0.2, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.4);
    o.connect(g).connect(ctx.destination);
    o.start();
    o.stop(ctx.currentTime + 0.4);
  } catch {
    // sem som: tudo bem
  }
}

// ---------- folhas ----------

function folha(titulo, corpo, { acao = null, aoFechar = null } = {}) {
  const d = h('dialog', { class: 'folha', 'aria-label': titulo });
  const fechar = () => d.close();
  d.append(
    h('div', { class: 'folha-topo' },
      h('button', { class: 'botao texto esq', onclick: fechar, texto: acao ? 'Cancelar' : 'Fechar' }),
      h('h2', { texto: titulo }),
      acao ? h('button', { class: 'botao texto dir', onclick: () => { if (acao.fazer() !== false) fechar(); }, texto: acao.nome }) : h('span')),
    h('div', { class: 'folha-corpo' }, corpo));
  d.addEventListener('close', () => { d.remove(); aoFechar?.(); });
  d.addEventListener('click', (ev) => { if (ev.target === d) fechar(); });
  document.body.append(d);
  d.showModal();
  return d;
}

function abrirHistorico(ex) {
  const linhas = sessoesDoConfig(app.estado.config)
    .map((s) => ({ dia: s.dia, series: (s.exercicios[ex.id] ?? []).filter((x) => x.reps > 0) }))
    .filter((s) => s.series.length > 0)
    .slice(0, 15);
  const melhor = linhas.flatMap((l) => l.series).reduce((m, s) => (m === null || s.carga > m.carga || (s.carga === m.carga && s.reps > m.reps) ? s : m), null);
  folha(ex.nome, [
    melhor ? h('div', { class: 'cartao' }, h('p', { class: 'pequeno', texto: 'Melhor série' }), h('p', { class: 'ex-nome', texto: `${kg(melhor.carga)} × ${melhor.reps}` })) : null,
    linhas.length === 0
      ? h('p', { class: 'discreto', texto: ex.referencia ? `Ainda sem treino registrado aqui. Anotado: ${textoDasSeries(ex.referencia.reps.map((reps) => ({ carga: ex.referencia.carga, reps })))}` : 'Ainda sem treino registrado.' })
      : h('div', { class: 'cartao' }, h('ul', { class: 'lista-simples' }, linhas.map((l) => h('li', {}, h('span', { texto: dataCurta(l.dia) }), h('span', { texto: textoDasSeries(l.series) }), h('span', { class: 'pequeno', texto: `${n0(volume(l.series))} kg` }))))),
  ]);
}

function abrirEditor(diaSemana) {
  const plano = planoTreino();
  let treino = structuredClone(treinoDoDia(plano, diaSemana)) ?? { id: novoId(), diaSemana, nome: NOMES_DOS_DIAS[diaSemana], nota: '', exercicios: [] };
  const lista = h('div');
  const nome = h('input', { class: 'campo', value: treino.nome, 'aria-label': 'Nome do treino' });
  const qualDia = h('select', { class: 'campo', 'aria-label': 'Dia da semana' }, NOMES_DOS_DIAS.map((n, i) => h('option', { value: String(i), selected: i === diaSemana ? true : null, texto: n })));
  qualDia.addEventListener('change', () => {
    const outro = treinoDoDia(planoTreino(), Number(qualDia.value));
    if (outro) {
      treino = structuredClone(outro);
      nome.value = treino.nome;
    } else treino.diaSemana = Number(qualDia.value);
    redesenhar();
  });

  const numeroOuNulo = (t) => { const v = Number(String(t).replace(',', '.')); return t !== '' && Number.isFinite(v) && v > 0 ? v : null; };
  function redesenhar() {
    lista.replaceChildren(...treino.exercicios.map((ex, i) => {
      const campoNome = h('input', { class: 'campo', value: ex.nome, placeholder: 'Exercício', 'aria-label': 'Nome do exercício' });
      const min = h('input', { class: 'campo', inputmode: 'numeric', value: ex.faixa?.min ?? '', placeholder: String(FAIXA_PADRAO.min) });
      const max = h('input', { class: 'campo', inputmode: 'numeric', value: ex.faixa?.max ?? '', placeholder: String(FAIXA_PADRAO.max) });
      const series = h('input', { class: 'campo', inputmode: 'numeric', value: ex.series });
      const nota = h('input', { class: 'campo', value: ex.nota, placeholder: 'Nota (ex.: volta lenta)' });
      const ler = () => {
        ex.nome = campoNome.value.trim();
        const a = numeroOuNulo(min.value);
        const b = numeroOuNulo(max.value);
        ex.faixa = a !== null && b !== null && b >= a ? { min: a, max: b } : null;
        ex.series = Math.max(1, Math.min(10, Math.round(numeroOuNulo(series.value) ?? 3)));
        ex.nota = nota.value.trim();
      };
      for (const c of [campoNome, min, max, series, nota]) c.addEventListener('input', ler);
      const mover = (d) => { const j = i + d; if (j < 0 || j >= treino.exercicios.length) return; [treino.exercicios[i], treino.exercicios[j]] = [treino.exercicios[j], treino.exercicios[i]]; redesenhar(); };
      return h('div', { class: 'ed-ex' }, campoNome,
        h('div', { class: 'ed-linha' },
          h('label', {}, 'Reps mín.', min), h('label', {}, 'Reps máx.', max), h('label', {}, 'Séries', series)),
        nota,
        h('div', { class: 'ed-botoes' },
          h('button', { class: 'botao icone', 'aria-label': 'Subir na lista', onclick: () => mover(-1) }, icone('cima')),
          h('button', { class: 'botao icone', 'aria-label': 'Descer na lista', onclick: () => mover(1) }, icone('baixo')),
          h('button', { class: 'botao perigo', onclick: () => { treino.exercicios.splice(i, 1); redesenhar(); }, texto: 'Tirar' })));
    }));
  }
  redesenhar();

  folha('Editar treino', [
    h('label', { class: 'rotulo', texto: 'Dia' }), qualDia,
    h('label', { class: 'rotulo', texto: 'Nome' }), nome,
    h('h2', { class: 'secao', texto: 'Exercícios' }), lista,
    h('button', { class: 'botao cheio', onclick: () => { treino.exercicios.push({ id: novoId(), nome: '', faixa: null, series: 3, nota: '', aquecimento: [], referencia: null }); redesenhar(); lista.lastElementChild?.querySelector('input')?.focus(); }, texto: '+ Exercício' }),
    plano.dias.some((d) => d.id === treino.id) ? h('button', {
      class: 'botao texto perigo', style: 'margin-top:18px', onclick: (ev) => {
        if (ev.currentTarget.dataset.certeza !== 'sim') { ev.currentTarget.dataset.certeza = 'sim'; ev.currentTarget.textContent = 'Tocar de novo para apagar o dia'; return; }
        const novo = { dias: planoTreino().dias.filter((d) => d.id !== treino.id) };
        mudar((e) => definirConfig(e, 'treinoPlano', JSON.stringify(novo)));
        ev.currentTarget.closest('dialog').close();
      }, texto: 'Apagar este dia do treino',
    }) : null,
  ], {
    acao: {
      nome: 'Salvar',
      fazer: () => {
        treino.nome = nome.value.trim() || NOMES_DOS_DIAS[treino.diaSemana];
        treino.exercicios = treino.exercicios.filter((e) => e.nome !== '');
        const dias = planoTreino().dias.filter((d) => d.id !== treino.id && d.diaSemana !== treino.diaSemana);
        mudar((e) => definirConfig(e, 'treinoPlano', JSON.stringify({ dias: [...dias, treino] })));
        app.diaTreino = treino.diaSemana;
      },
    },
    aoFechar: desenhar,
  });
}

function abrirAjustes() {
  const pend = Object.keys(app.estado.pendentes).length;
  const situacao = app.sync.estado === 'erro'
    ? app.sync.mensagem
    : pend > 0 ? `${pend} mudança(s) esperando para subir.` : 'Tudo sincronizado com o computador.';
  const descansoSel = h('select', { class: 'campo', 'aria-label': 'Descanso entre séries' },
    [60, 90, 120, 150, 180].map((s) => h('option', { value: String(s), selected: s === app.descansoS ? true : null, texto: `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')} min` })));
  descansoSel.addEventListener('change', () => { app.descansoS = Number(descansoSel.value); guardado.gravar('descanso', app.descansoS); });
  const linhaSit = h('p', { class: 'discreto', texto: situacao });
  folha('Ajustes', [
    h('div', { class: 'cartao' },
      h('p', { class: 'pequeno', texto: 'Conta' }), h('p', { texto: app.sessao?.email ?? '' }),
      h('p', { class: 'pequeno', style: 'margin-top:12px', texto: 'Sincronização' }), linhaSit,
      app.sync.ultima ? h('p', { class: 'pequeno', texto: `Última: ${new Date(app.sync.ultima).toLocaleString('pt-BR')}` }) : null,
      h('button', {
        class: 'botao cheio', style: 'margin-top:12px', onclick: async (ev) => {
          ev.currentTarget.disabled = true;
          linhaSit.textContent = 'Sincronizando…';
          await sincronizar();
          linhaSit.textContent = app.sync.estado === 'erro' ? app.sync.mensagem : 'Tudo sincronizado com o computador.';
          ev.currentTarget.disabled = false;
        }, texto: 'Sincronizar agora',
      })),
    h('div', { class: 'cartao' }, h('label', { class: 'rotulo', style: 'margin-top:0', texto: 'Descanso entre séries' }), descansoSel),
    h('div', { class: 'cartao' },
      h('p', { class: 'pequeno', texto: 'Para usar como app: no Safari, Compartilhar → Adicionar à Tela de Início.' }),
      h('button', { class: 'botao texto perigo', style: 'margin-top:8px', onclick: sair, texto: 'Sair da conta neste iPhone' })),
    h('p', { class: 'pequeno', style: 'text-align:center', texto: 'Próximo Passo no iPhone · versão experimental 0.2' }),
  ]);
}

function sair() {
  for (const nome of ['sessao', 'segredo', 'estado', 'conversa', 'ultima-sync']) guardado.gravar(nome, null);
  app.sessao = null;
  app.sinc = null;
  app.cifra = null;
  app.estado = estadoVazio();
  app.conversa = [];
  document.querySelectorAll('dialog').forEach((d) => d.close());
  desenhar();
}

// ---------- dieta ----------

function lerJson(texto, padrao) {
  try {
    return texto === undefined ? padrao : JSON.parse(texto);
  } catch {
    return padrao;
  }
}

function dietaDeHoje() {
  const dia = hoje();
  const e = app.estado;
  const plano = validarPlano(lerJson(e.config.planoAlimentar, null)) ?? PLANO_PADRAO;
  const perfil = e.config.perfilNutricao ? validarPerfil(lerJson(e.config.perfilNutricao, null)) : PERFIL_PADRAO;
  const pesos = Object.values(e.pesos).sort((a, b) => (a.dia_logico < b.dia_logico ? -1 : 1));
  const pesoKg = pesos.length > 0 ? pesos.at(-1).valor_kg : null;
  const marcados = Object.values(e.marcas).filter((m) => m.dia_logico === dia).map((m) => m.habito_id);
  const puladas = Object.values(e.puladas).filter((p) => p.dia === dia).map((p) => p.habito_id);
  const extras = Object.values(e.consumo).filter((c) => c.dia === dia)
    .sort((a, b) => (a.registrado_em < b.registrado_em ? -1 : 1))
    .map((c) => ({ id: c.id, dia: c.dia, descricao: c.descricao, kcal: c.kcal, proteina: c.proteina, carboidrato: c.carboidrato, gordura: c.gordura, registradoEm: c.registrado_em, refeicaoHabitoId: c.refeicao_habito ?? null }));
  const agora = new Date();
  const resumo = resumoNutricional({
    plano, perfil, pesoKg, marcadosIds: marcados, puladasIds: puladas, extrasDoDia: extras,
    horaAgora: `${String(agora.getHours()).padStart(2, '0')}:${String(agora.getMinutes()).padStart(2, '0')}`,
  });
  return { dia, resumo, pesoKg, pesos };
}

const refeicaoAberta = new Set();

function telaDieta() {
  const { dia, resumo, pesoKg, pesos } = dietaDeHoje();
  const tela = h('main', { class: 'tela' }, cabeca('Dieta', dataPorExtenso(dia)));

  const raio = 54;
  const volta = 2 * Math.PI * raio;
  const fracao = Math.min(1, resumo.alvo.kcal > 0 ? resumo.consumido.kcal / resumo.alvo.kcal : 0);
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 132 132');
  svg.innerHTML = `<defs><linearGradient id="grad-marca" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#34c759"/><stop offset="1" stop-color="#2fa8dc"/></linearGradient></defs>
    <circle class="trilho" cx="66" cy="66" r="${raio}"/><circle class="cheio" cx="66" cy="66" r="${raio}" stroke-dasharray="${volta}" stroke-dashoffset="${volta * (1 - fracao)}"/>`;
  const macro = (nome, cons, alvo, cor) => h('div', { class: 'macro' },
    h('div', {}, h('span', { texto: nome }), h('span', {}, h('b', { texto: n0(cons) }), ` / ${n0(alvo)} g`)),
    h('div', { class: 'trilho' }, h('i', { style: `width:${Math.min(100, alvo > 0 ? (cons / alvo) * 100 : 0)}%;background:${cor}` })));
  tela.append(h('section', { class: 'cartao' }, h('div', { class: 'anel-linha' },
    h('div', { class: 'anel', role: 'img', 'aria-label': `${n0(resumo.consumido.kcal)} de ${n0(resumo.alvo.kcal)} kcal` }, svg,
      h('div', { class: 'anel-texto' }, h('b', { texto: n0(resumo.consumido.kcal) }), h('span', { texto: `de ${n0(resumo.alvo.kcal)} kcal` }))),
    h('div', { class: 'macros' },
      macro('Proteína', resumo.consumido.proteina, resumo.alvo.proteina, 'var(--verde)'),
      macro('Carboidrato', resumo.consumido.carboidrato, resumo.alvo.carboidrato, 'var(--ciano)'),
      macro('Gordura', resumo.consumido.gordura, resumo.alvo.gordura, 'var(--laranja)')))));

  tela.append(h('h2', { class: 'secao', texto: 'Refeições do plano' }));
  for (const r of resumo.refeicoes) {
    const aberta = refeicaoAberta.has(r.habitoId) || r.proxima;
    const estado = r.feita ? h('span', { class: 'ref-estado feita' }, icone('check'), 'Feita')
      : r.pulada ? h('span', { class: 'ref-estado pulada', texto: 'Pulei' })
        : r.proxima ? h('span', { class: 'ref-estado proxima', texto: 'Próxima' })
          : h('span', { class: 'ref-kcal', texto: `${n0(r.totais.kcal)} kcal` });
    const cartao = h('section', { class: `cartao refeicao${r.feita ? ' feita' : ''}${r.pulada ? ' pulada' : ''}` },
      h('button', {
        class: 'ref-topo', 'aria-expanded': String(aberta),
        onclick: () => { if (refeicaoAberta.has(r.habitoId)) refeicaoAberta.delete(r.habitoId); else refeicaoAberta.add(r.habitoId); desenhar(); },
      }, h('span', { class: 'ref-hora', texto: r.hora }), h('span', { class: 'ref-titulo', texto: r.titulo }), estado));
    if (aberta) {
      const itens = r.comido.length > 0
        ? r.comido.map((c) => h('li', {}, h('span', { texto: c.descricao }), h('span', { texto: `${n0(c.kcal)} kcal` })))
        : r.itensComMacros.map((i) => h('li', {}, h('span', { texto: `${i.nome} · ${String(i.quantidade).replace('.', ',')} ${i.unidade}` }), h('span', { texto: `${n0(i.calculado.kcal)} kcal` })));
      cartao.append(h('ul', { class: 'ref-itens' }, itens,
        h('li', {}, h('span', { texto: r.comido.length > 0 ? 'Registrado no computador' : 'Total' }), h('b', { texto: `${n0(r.totais.kcal)} kcal · ${n0(r.totais.proteina)} g P` }))));
      const marca = (comeu) => mudar((e) => {
        escrever(e, 'marcas_habito', [r.habitoId, dia], comeu ? { habito_id: r.habitoId, dia_logico: dia, marcado_em: new Date().toISOString() } : null);
      });
      const pula = (pulou) => mudar((e) => {
        escrever(e, 'refeicoes_puladas', [dia, r.habitoId], pulou ? { dia, habito_id: r.habitoId, em: new Date().toISOString() } : null);
      });
      cartao.append(h('div', { class: 'ref-acoes' },
        r.feita
          ? h('button', { class: 'botao', onclick: () => { marca(false); desenhar(); }, texto: 'Desfazer' })
          : r.pulada
            ? h('button', { class: 'botao', onclick: () => { pula(false); desenhar(); }, texto: 'Desfazer "Pulei"' })
            : [h('button', { class: 'botao principal', onclick: () => { marca(true); refeicaoAberta.delete(r.habitoId); desenhar(); }, texto: 'Comi' }),
              h('button', { class: 'botao', onclick: () => { pula(true); refeicaoAberta.delete(r.habitoId); desenhar(); }, texto: 'Pulei' })]));
    }
    tela.append(cartao);
  }

  if (resumo.extras.length > 0) {
    tela.append(h('h2', { class: 'secao', texto: 'Fora do plano' }), h('section', { class: 'cartao' },
      h('ul', { class: 'lista-simples' }, resumo.extras.map((x) => h('li', {}, h('span', { texto: x.descricao }), h('span', { class: 'pequeno', texto: `${n0(x.kcal)} kcal` }))))));
  }

  tela.append(h('h2', { class: 'secao', texto: 'Para hoje' }), h('section', { class: 'cartao' },
    h('ul', { class: 'lista-simples' }, resumo.dicas.map((d) => h('li', { texto: d })))));

  const pesoHoje = app.estado.pesos[dia];
  const campoPeso = h('input', { class: 'campo', inputmode: 'decimal', placeholder: pesoKg ? String(pesoKg).replace('.', ',') : 'kg', value: pesoHoje ? String(pesoHoje.valor_kg).replace('.', ',') : '', 'aria-label': 'Peso de hoje em kg' });
  const anterior = pesos.filter((p) => p.dia_logico < dia).at(-1);
  tela.append(h('h2', { class: 'secao', texto: 'Peso' }), h('section', { class: 'cartao' },
    h('p', { class: 'discreto', style: 'margin:0 0 10px', texto: pesoHoje ? `Hoje: ${kg(pesoHoje.valor_kg)}` : anterior ? `Último: ${kg(anterior.valor_kg)} em ${dataCurta(anterior.dia_logico)}` : 'Nenhum peso registrado ainda.' }),
    h('div', { class: 'peso-linha' }, campoPeso, h('button', {
      class: 'botao principal', onclick: () => {
        const v = Number((campoPeso.value || campoPeso.placeholder).replace(',', '.'));
        if (!Number.isFinite(v) || v < 25 || v > 350) { campoPeso.focus(); return; }
        mudar((e) => escrever(e, 'registros_peso', [dia], { dia_logico: dia, valor_kg: Math.round(v * 10) / 10, registrado_em: new Date().toISOString() }));
        desenhar();
      }, texto: pesoHoje ? 'Corrigir' : 'Registrar',
    }))));
  return tela;
}

// ---------- Garry ----------

function contextoDoGarry() {
  const dia = hoje();
  const plano = planoTreino();
  const sessoes = sessoesDoConfig(app.estado.config);
  const treino = treinoDoDia(plano, diaDaSemana(dia));
  const sessao = sessaoDe(dia);
  const { resumo, pesoKg } = dietaDeHoje();
  return {
    agora: new Date().toLocaleString('pt-BR'),
    hoje: dataPorExtenso(dia),
    treinoDeHoje: treino === null ? 'descanso' : {
      nome: treino.nome,
      exercicios: treino.exercicios.map((ex) => {
        const u = ultimaVez(ex, sessoes, dia);
        return {
          nome: ex.nome, faixa: ex.faixa ?? `${FAIXA_PADRAO.min}-${FAIXA_PADRAO.max} (padrão)`, series: ex.series, nota: ex.nota || undefined,
          ultimaVez: u ? `${u.dia ?? 'anotado'}: ${textoDasSeries(u.series)}` : null,
          sugestao: sugestao(ex, u).texto,
          feitoHoje: textoDasSeries((sessao.exercicios[ex.id] ?? []).filter((s) => s.reps > 0)) || null,
        };
      }),
    },
    cardioHoje: sessao.cardio,
    ultimosTreinos: sessoes.slice(0, 6).map((s) => ({
      dia: s.dia,
      treino: plano.dias.find((d) => d.id === s.treinoId)?.nome ?? null,
      series: Object.values(s.exercicios).flat().filter((x) => x.reps > 0).length,
      volumeKg: Math.round(volume(Object.values(s.exercicios).flat().filter((x) => x.reps > 0))),
      cardio: s.cardio,
    })),
    semana: plano.dias.map((d) => `${NOMES_DOS_DIAS[d.diaSemana]}: ${d.nome}`),
    dieta: {
      alvo: resumo.alvo, consumido: resumo.consumido, restante: resumo.restante, percentual: resumo.percentual,
      refeicoes: resumo.refeicoes.map((r) => ({ hora: r.hora, titulo: r.titulo, kcal: Math.round(r.totais.kcal), proteina: Math.round(r.totais.proteina), feita: r.feita, pulada: r.pulada, proxima: r.proxima })),
      foraDoPlano: resumo.extras.map((x) => `${x.descricao} (${Math.round(x.kcal)} kcal)`),
      faltaNoDia: resumo.faltaNoDia,
    },
    pesoKg,
  };
}

let garryOcupado = false;

function telaGarry() {
  const tela = h('main', { class: 'tela' }, cabeca('Garry'));
  const conversa = h('div', { class: 'conversa', 'aria-live': 'polite' });
  if (app.conversa.length === 0) {
    conversa.append(h('div', { class: 'garry-rosto', 'aria-hidden': 'true' }, h('i'), h('i')),
      h('p', { class: 'discreto', style: 'text-align:center;margin:0 0 6px', texto: 'Eu vejo seu treino e sua dieta de hoje. Pergunte.' }),
      h('div', { class: 'sugestoes' }, ['Como está meu treino de hoje?', 'O que eu como agora?', 'Onde eu estou evoluindo?'].map((t) => h('button', { onclick: () => perguntar(t), texto: t }))));
  }
  for (const m of app.conversa) conversa.append(h('div', { class: `balao ${m.papel}`, texto: m.texto }));
  tela.append(conversa);
  if (app.conversa.length > 0) {
    tela.append(h('button', { class: 'botao texto', style: 'display:block;margin:0 auto', onclick: () => { app.conversa = []; guardado.gravar('conversa', []); desenhar(); }, texto: 'Nova conversa' }));
  }
  const campo = h('textarea', { rows: '1', placeholder: 'Mensagem', 'aria-label': 'Mensagem para o Garry', enterkeyhint: 'send' });
  campo.addEventListener('keydown', (ev) => { if (ev.key === 'Enter' && !ev.shiftKey) { ev.preventDefault(); enviar(); } });
  const enviar = () => { const t = campo.value.trim(); if (t !== '' && !garryOcupado) { campo.value = ''; perguntar(t); } };
  tela.append(h('div', { class: 'caixa' }, campo, h('button', { 'aria-label': 'Enviar', onclick: enviar }, icone('enviar'))));
  requestAnimationFrame(() => window.scrollTo(0, document.body.scrollHeight));
  return tela;
}

async function perguntar(texto) {
  if (garryOcupado) return;
  garryOcupado = true;
  app.conversa.push({ papel: 'eu', texto });
  desenhar();
  const balao = h('div', { class: 'balao garry pensando' });
  document.querySelector('.conversa')?.append(balao);
  window.scrollTo(0, document.body.scrollHeight);
  try {
    const ia = configDaIa(app.estado.config);
    if (ia === null || ia.modelo === '') throw new Error('A IA ainda não está configurada no app do computador (Garry > ⚙).');
    const chave = ia.cifrada ? await abrirChave(ia.cifrada, app.cifra) : null;
    if (chave === null) throw new Error(`A chave da IA (${ia.host}) não está salva na conta. No computador, salve a chave com a sincronização ligada.`);
    const final = await conversar({ ...ia, chave }, app.conversa, contextoDoGarry(), (parcial) => {
      balao.classList.remove('pensando');
      balao.textContent = parcial;
      window.scrollTo(0, document.body.scrollHeight);
    });
    app.conversa.push({ papel: 'garry', texto: final });
  } catch (e) {
    app.conversa.push({ papel: 'erro', texto: e.message });
  }
  app.conversa = app.conversa.slice(-40);
  guardado.gravar('conversa', app.conversa);
  garryOcupado = false;
  if (app.aba === 'garry') desenhar();
}

// ---------- comeco ----------

document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') sincronizar(); });
setInterval(() => { if (document.visibilityState === 'visible') sincronizar(); }, 30_000);
if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('sw.js').catch(() => {});

(async () => {
  try {
    await ligar();
  } catch {
    guardado.gravar('segredo', null);
  }
  desenhar();
  if (app.sinc !== null && app.estado.cursor > 0) sincronizar();
})();
