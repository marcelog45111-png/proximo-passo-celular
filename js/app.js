// Proximo Passo no iPhone (04/11/2026): treino, dieta e o Garry, ligados ao
// app do computador pela mesma nuvem cifrada. Primeira versao, experimental.

import { criarCifra, deBase64, lerCodigoDeRecuperacao, paraBase64 } from './cifra.js';
import { entrar, ErroNuvem, Nuvem, PROJETO } from './nuvem.js';
import { definirConfig, diaDaSemana, diaLogico, escrever, estadoVazio, podar, Sincronizador, somarDias } from './dados.js';
import {
  completoNaSessao, FAIXA_PADRAO, INTENSIDADES_DO_CARDIO, resumoDoCardio, faixaDe, lerPlanoTreino, lerSessao, METODOS, NOMES_DOS_DIAS, novoId, planoDeHoje, quandoRelativo, regraDaCarga, relogio, DESCANSOS, treinoComAquecimento, MUSCULOS, grupoDoExercicio, analiseDoExercicio, seriesDeTrabalho, ajusteEntreSeries,
  resultadoDoExercicio, roteiro, sessoesDoConfig, SIGLAS_DOS_DIAS, sugestao, textoDasSeries, treinoDoDia, ultimaVez, veredito, volume,
} from './treino.js';
import { PLANO_PADRAO, PERFIL_PADRAO, resumoNutricional, validarPerfil, validarPlano } from './gerado/nutricao.js';
import { abrirChave, configDaIa, conversar } from './garry.js';
import * as movimento from './movimento.js';
import { cargaReps, h, icone, numeroBr, selo } from './dom.js';
import { abrirJogo, jogoAberto } from './jogo.js';

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
  // Semana vista na faixa (10/11/2026): 0 = esta, -1 = a passada, +1 = a que vem.
  semana: 0,
  abertos: new Set(), // exercicios fechados que a pessoa reabriu
  efeito: null, // o que acabou de mudar e merece animar depois do proximo desenho
};

const salvarEstado = () => guardado.gravar('estado', app.estado);

// ---------- DOM ----------

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
// O Editar treino virou um lapis no canto de cima, a esquerda (11/11/2026, "quero que editar
// treino fosse um lapis no canto superior esquerdo"): fica a mao em qualquer ponto da tela.
function barraNav(titulo, progresso = null, editar = null) {
  return h('div', { class: 'barra-nav' },
    editar ? h('button', { class: 'botao-redondo botao-editar', type: 'button', 'aria-label': editar.rotulo, onclick: editar.abrir }, icone('lapis')) : null,
    h('span', { class: 'titulo-nav', 'aria-hidden': 'true', texto: titulo }),
    progresso !== null ? h('span', { class: 'nav-progresso', 'aria-hidden': 'true' }, h('i', { style: `transform:scaleX(${progresso})` })) : null,
    h('button', { class: 'botao-redondo nav-ajustes', 'aria-label': 'Ajustes e sincronização', onclick: abrirAjustes }, icone('ajustes'), h('span', { class: 'ponto-sync' })));
}

function cabeca(titulo, subtitulo = '') {
  const grande = h('h1', { class: 'titulo-grande', texto: titulo });
  return [barraNav(titulo), h('header', { class: 'cabeca' }, grande, subtitulo ? h('p', { class: 'subtitulo', texto: subtitulo }) : null)];
}

/** A barra fica compacta assim que o titulo grande passa por baixo dela. */
function acertarBarra() {
  const barra = document.querySelector('.barra-nav');
  const grande = document.querySelector('.titulo-grande');
  if (barra && grande) barra.classList.toggle('compacta', grande.getBoundingClientRect().top < barra.getBoundingClientRect().bottom - 8);
}
window.addEventListener('scroll', acertarBarra, { passive: true });

const ABAS = [['treino', 'Treino', 'halter'], ['dieta', 'Dieta', 'prato'], ['garry', 'Garry', 'garry']];

function abas() {
  const indice = Math.max(0, ABAS.findIndex(([id]) => id === app.aba));
  const luz = h('span', { class: 'aba-luz', 'aria-hidden': 'true', style: `--i:${indice}` });
  const nav = h('nav', { class: 'abas', 'aria-label': 'Seções' }, luz, ABAS.map(([id, nome, ic]) => h('button', {
    class: 'aba', 'aria-current': app.aba === id ? 'page' : null,
    onclick: () => { app.aba = id; guardado.gravar('aba', id); desenhar(); window.scrollTo(0, 0); },
  }, icone(ic), nome)));
  movimento.pilulaDasAbas(luz, indice);
  return nav;
}

let assinaturaDaTela = null;

function desenhar() {
  const faixaAntes = document.querySelector('.dias')?.scrollLeft ?? null;
  movimento.novoDesenho();
  raiz.replaceChildren();
  if (app.sessao === null) { assinaturaDaTela = 'entrar'; raiz.append(telaEntrar()); movimento.telaDeEntrada(raiz.firstElementChild); return; }
  if (app.sinc === null) { assinaturaDaTela = 'codigo'; raiz.append(telaCodigo()); movimento.telaDeEntrada(raiz.firstElementChild); return; }
  if (app.estado.cursor === 0) {
    assinaturaDaTela = 'baixando';
    raiz.append(telaBaixando());
    app.sinc.receber().then(() => { salvarEstado(); desenhar(); sincronizar(); }).catch((e) => {
      raiz.replaceChildren(telaEntrar(e.message));
    });
    return;
  }
  const tela = app.aba === 'dieta' ? telaDieta() : app.aba === 'garry' ? telaGarry() : telaTreino();
  raiz.append(tela, abas());
  acertarBarra();
  atualizarPontoSync();
  // Entrada so ao trocar de aba ou de dia; marcar uma serie nao repete a tela inteira.
  const assinatura = `${app.aba}|${app.aba === 'treino' ? `${app.diaTreino}|${app.semana}` : ''}`;
  const entrou = assinatura !== assinaturaDaTela;
  assinaturaDaTela = assinatura;
  depoisDeMontar(tela, entrou);
  if (direcaoDaSemana !== 0) { movimento.semanaMudou(tela.querySelector('.dias'), direcaoDaSemana); direcaoDaSemana = 0; }
  if (entrou && app.aba !== 'garry') movimento.entrada(tela);
}

function depoisDeMontar(tela, entrou) {
  if (app.aba === 'treino') ligarPalco(tela);
  if (app.aba === 'dieta') ligarDieta(tela);
  if (app.aba === 'garry' && !entrou) movimento.balaoNovo(tela.querySelector('.conversa > .balao:last-child'));
  const efeito = app.efeito;
  app.efeito = null;
  if (efeito === null) return;
  const cartao = efeito.ex ? tela.querySelector(`[data-ex="${CSS.escape(efeito.ex)}"]`) : null;
  if (cartao && efeito.fechou) movimento.cartaoFechou(cartao, efeito.altura, tela.querySelector('.exercicio.atual'));
  if (cartao && efeito.abriu) movimento.cartaoAbriu(cartao, efeito.altura);
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
const sessaoDe = (dia) => lerSessao(app.estado.config[chaveSessao(dia)] ?? null)
  ?? { dia, treinoId: null, exercicios: {}, cardios: [], cardio: null, encerrados: [], semAquecimento: [], aquecer: {}, atualizadoEm: '' };
// O treino do dia com o aquecimento pensado pelo dia inteiro (treinoComAquecimento): a ordem
// em que os exercicios foram feitos hoje, o que cada musculo ja levou, o que foi treinado
// ontem e anteontem e a carga de hoje de cada exercicio.
const treinoAnotado = (diaSemana, sessao = sessaoDe(hoje()), agora = null) => treinoComAquecimento(treinoDoDia(planoTreino(), diaSemana), {
  sessao, sessoes: sessoesDoConfig(app.estado.config), plano: planoTreino(), hoje: hoje(), agora,
});

function gravarSessao(sessao) {
  sessao.atualizadoEm = new Date().toISOString();
  sessao.cardio = resumoDoCardio(sessao.cardios ?? []);
  mudar((e) => definirConfig(e, chaveSessao(sessao.dia), JSON.stringify(sessao)));
}

const editarODia = () => ({ rotulo: `Editar o treino de ${NOMES_DOS_DIAS[app.diaTreino].toLowerCase()}`, abrir: () => abrirEditor(app.diaTreino) });

function telaTreino() {
  const plano = planoTreino();
  const dia = hoje();
  const semanaHoje = diaDaSemana(dia);
  // A faixa e de segunda a sabado. No domingo ela ja mostra a semana que vem.
  if (app.diaTreino === null) app.diaTreino = semanaHoje === 0 ? 1 : semanaHoje;
  const segundaDeHoje = semanaHoje === 0 ? somarDias(dia, 1) : somarDias(dia, 1 - semanaHoje);
  // Semanas passadas e seguintes (10/11/2026, "faz os dias ficarem centralizados, e uma seta pra
  // esquerda e direita, semanas passadas e semanas seguintes").
  const segunda = somarDias(segundaDeHoje, 7 * app.semana);

  if (plano.dias.length === 0) {
    const vazia = h('main', { class: 'tela' }, cabeca('Treino', dataPorExtenso(dia)));
    vazia.append(h('div', { class: 'cartao' },
      h('p', { texto: 'Seu treino ainda não chegou do computador.' }),
      h('p', { class: 'discreto', texto: 'Ele vem pela sincronização. Se não aparecer em alguns minutos, monte aqui.' }),
      h('button', { class: 'botao principal cheio', style: 'margin-top:10px', onclick: () => abrirEditor(semanaHoje), texto: 'Montar treino' })));
    return vazia;
  }

  const dias = h('div', { class: 'dias', role: 'group', 'aria-label': 'Dia do treino' },
    [1, 2, 3, 4, 5, 6].map((ds) => {
      const data = somarDias(segunda, ds - 1);
      const ehHoje = data === dia;
      // Numa semana que ja passou, o dia diz o que foi feito; nas outras, o que esta no plano.
      const feito = data < dia ? treinoFeitoEm(plano, data, ds) : null;
      const doDia = data < dia && app.semana < 0 ? feito : treinoDoDia(plano, ds);
      return h('button', {
        class: 'dia', 'aria-pressed': String(ds === app.diaTreino), 'data-hoje': ehHoje ? 'sim' : null, 'data-feito': feito ? 'sim' : null,
        'aria-label': `${ehHoje ? 'Hoje, ' : ''}${NOMES_DOS_DIAS[ds]} ${Number(data.slice(8))}: ${doDia?.nome ?? (data < dia && app.semana < 0 ? 'nada registrado' : 'descanso')}${feito ? ', treinou' : ''}`,
        onclick: () => { app.diaTreino = ds; desenhar(); },
      },
      h('span', { class: 'dia-sigla', texto: ehHoje ? 'Hoje' : SIGLAS_DOS_DIAS[ds] }),
      h('b', { class: 'dia-num', texto: String(Number(data.slice(8))) }),
      h('span', { class: 'dia-treino', texto: doDia ? doDia.nome.split(/[ ,]/)[0] : data < dia && app.semana < 0 ? '—' : 'Descanso' }));
    }));
  const [nomeDaSemana, datasDaSemana] = rotuloDaSemana(app.semana, segunda);
  const faixa = h('div', { class: 'semana' },
    h('div', { class: 'semana-topo' },
      h('button', { class: 'semana-seta', type: 'button', 'aria-label': 'Semana anterior', onclick: () => trocarSemana(-1) }, icone('voltar')),
      h('button', {
        class: 'semana-rotulo', type: 'button', 'aria-label': app.semana === 0 ? `${nomeDaSemana}, ${datasDaSemana}` : `${nomeDaSemana}, ${datasDaSemana}. Voltar para esta semana`,
        'data-agora': app.semana === 0 ? 'sim' : null, onclick: () => voltarParaEstaSemana(),
      }, h('b', { texto: nomeDaSemana }), h('span', { texto: datasDaSemana })),
      h('button', { class: 'semana-seta', type: 'button', 'aria-label': 'Próxima semana', onclick: () => trocarSemana(1) }, icone('avancar'))),
    dias);
  ligarDeslizeDaSemana(dias);

  const dataDoDia = somarDias(segunda, app.diaTreino - 1);
  if (app.semana !== 0) return telaDeOutraSemana(plano, faixa, dataDoDia, dia);

  const sessao = sessaoDe(dia);
  const treino = treinoAnotado(app.diaTreino, sessao);
  const sessoes = sessoesDoConfig(app.estado.config);

  if (treino === null) {
    dadosDaBarra = { chave: `descanso-${app.diaTreino}`, placas: [], cardio: cardioDaBarra(sessao) };
    const tela = h('main', { class: 'tela' }, barraNav(`${NOMES_DOS_DIAS[app.diaTreino]}: descanso`, null, editarODia()), faixa,
      h('section', { class: 'palco', 'aria-label': 'Descanso' },
        h('p', { class: 'palco-data', texto: dataPorExtenso(dataDoDia) }),
        h('h1', { class: 'titulo-grande', texto: 'Descanso' }),
        h('div', { class: 'palco-cena' }),
        h('p', { class: 'palco-nota', texto: 'Barra vazia hoje. Não há treino montado para este dia.' })));
    tela.append(h('button', { class: 'botao cheio botao-rodape', style: 'margin-bottom:12px', onclick: () => abrirEditor(app.diaTreino), texto: `Montar treino de ${NOMES_DOS_DIAS[app.diaTreino].toLowerCase()}` }));
    tela.append(cartaoCardio(sessao));
    return tela;
  }

  const feitasDe = (e) => seriesDeTrabalho(sessao.exercicios[e.id]);
  const feitasHoje = treino.exercicios.flatMap(feitasDe);
  const fechados = treino.exercicios.filter((e) => completoNaSessao(e, sessao));
  const completos = fechados.length;
  const total = treino.exercicios.length;
  const totalSeries = treino.exercicios.reduce((n, e) => n + roteiro(e, (sessao.exercicios[e.id] ?? []).length).filter((p) => p.t !== 'a').length, 0);
  const fracao = total > 0 ? completos / total : 0;
  const fechado = total > 0 && completos === total;
  dadosDaBarra = dadosDaBarraDe(treino, sessao, dia);

  // O placar do dia: cada exercicio fechado contra a ultima vez dele.
  const resultados = fechados.map((e) => resultadoDoExercicio(e, sessao.exercicios[e.id], ultimaVez(e, sessoes, dia))).filter((r) => r !== null);
  const marca = (tipo, ic, n, um, varios) => (n === 0 ? null : h('span', { class: 'placar-item', 'data-tipo': tipo }, icone(ic), h('b', { texto: String(n) }), n === 1 ? um : varios));
  const placar = resultados.length === 0 ? null : h('div', { class: 'placar', role: 'group', 'aria-label': 'Exercícios de hoje contra a última vez' },
    marca('reps', 'subir', resultados.filter((r) => r.tipo === 'carga' || r.tipo === 'reps').length, 'acima', 'acima'),
    marca('igual', 'igual', resultados.filter((r) => r.tipo === 'igual').length, 'igual', 'iguais'),
    marca('abaixo', 'descer', resultados.filter((r) => r.tipo === 'abaixo').length, 'abaixo', 'abaixo'),
    marca('liberada', 'liberada', resultados.filter((r) => r.liberou !== null).length, 'carga liberada', 'cargas liberadas'));

  const contador = (chave, valor, resto, rotulo) => {
    const b = h('span', { 'data-contar': chave, 'data-valor': String(valor) });
    return h('div', { class: 'numero' }, h('b', {}, b, resto ? h('small', { texto: resto }) : null), h('span', { texto: rotulo }));
  };
  const tela = h('main', { class: 'tela' },
    barraNav(treino.nome, fracao, editarODia()),
    faixa,
    h('section', { class: 'palco', 'aria-label': `Progresso de ${treino.nome}`, 'data-fechado': fechado ? 'sim' : null },
      h('p', { class: 'palco-data', texto: dataPorExtenso(dataDoDia) }),
      h('h1', { class: 'titulo-grande', texto: treino.nome }),
      treino.nota ? h('p', { class: 'palco-nota', texto: treino.nota }) : null,
      h('div', { class: 'palco-cena' }),
      h('div', { class: 'palco-numeros' },
        contador('ex', completos, `/${total}`, 'exercícios'),
        contador('series', feitasHoje.length, `/${totalSeries}`, 'séries'),
        contador('volume', Math.round(volume(feitasHoje)), ' kg', 'volume hoje')),
      h('div', { class: 'progresso', role: 'progressbar', 'aria-label': 'Exercícios completos', 'aria-valuemin': '0', 'aria-valuemax': String(total), 'aria-valuenow': String(completos) },
        h('i', { style: `width:${fracao * 100}%` })),
      placar,
      app.diaTreino !== semanaHoje ? h('p', { class: 'aviso-dia', texto: 'O que você marcar aqui conta como o treino de hoje.' }) : null));

  // O exercicio da vez e o primeiro que falta.
  const atual = treino.exercicios.find((e) => !completoNaSessao(e, sessao))?.id ?? null;
  treino.exercicios.forEach((ex, i) => tela.append(cartaoExercicio(ex, sessao, sessoes, dia, treino.id, i, ex.id === atual)));

  tela.append(cartaoCardio(sessao));
  return tela;
}

// ---------- semanas passadas e seguintes (10/11/2026) ----------

const MESES_CURTOS = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
/** ["Esta semana", "9 a 14 nov"]; a semana mostrada vai de segunda a sabado. */
function rotuloDaSemana(n, segunda) {
  const sabado = somarDias(segunda, 5);
  const mes = (d) => MESES_CURTOS[Number(d.slice(5, 7)) - 1];
  const datas = mes(segunda) === mes(sabado)
    ? `${Number(segunda.slice(8))} a ${Number(sabado.slice(8))} ${mes(sabado)}`
    : `${Number(segunda.slice(8))} ${mes(segunda)} a ${Number(sabado.slice(8))} ${mes(sabado)}`;
  const nome = n === 0 ? 'Esta semana' : n === -1 ? 'Semana passada' : n === 1 ? 'Próxima semana' : n < 0 ? `Há ${-n} semanas` : `Daqui a ${n} semanas`;
  return [nome, datas];
}

let direcaoDaSemana = 0;
function trocarSemana(d) {
  app.semana = Math.max(-52, Math.min(52, app.semana + d));
  direcaoDaSemana = d;
  desenhar();
}
function voltarParaEstaSemana() {
  if (app.semana === 0) return;
  const semanaHoje = diaDaSemana(hoje());
  direcaoDaSemana = app.semana < 0 ? 1 : -1;
  app.semana = 0;
  app.diaTreino = semanaHoje === 0 ? 1 : semanaHoje;
  desenhar();
}
/** Arrastar os dias para o lado troca de semana, como as setas. */
function ligarDeslizeDaSemana(el) {
  let x0 = null;
  let y0 = null;
  el.addEventListener('touchstart', (ev) => { x0 = ev.touches[0].clientX; y0 = ev.touches[0].clientY; }, { passive: true });
  el.addEventListener('touchend', (ev) => {
    if (x0 === null) return;
    const dx = ev.changedTouches[0].clientX - x0;
    const dy = ev.changedTouches[0].clientY - y0;
    x0 = null;
    if (Math.abs(dx) > 56 && Math.abs(dx) > Math.abs(dy) * 1.5) trocarSemana(dx < 0 ? 1 : -1);
  }, { passive: true });
}

/** O treino que tem serie registrada numa data, ou null. Vale o da sessao (pode ser de outro dia do plano). */
function treinoFeitoEm(plano, data, diaSemanaDaData) {
  const config = app.estado.config;
  if (!config[chaveSessao(data)]) return null;
  const sessao = sessaoDe(data);
  if (!Object.values(sessao.exercicios).some((l) => seriesDeTrabalho(l).length > 0)) return null;
  return (sessao.treinoId && plano.dias.find((d) => d.id === sessao.treinoId)) || treinoDoDia(plano, diaSemanaDaData) || { id: `feito-${data}`, nome: 'Treino', exercicios: [] };
}

/**
 * Outra semana: as que passaram mostram o que foi feito em cada dia (so leitura: o que se
 * marca conta sempre para hoje); as que vem mostram a previa do plano.
 */
function telaDeOutraSemana(plano, faixa, data, dia) {
  const ds = app.diaTreino;
  const passado = data < dia;
  const sessoes = sessoesDoConfig(app.estado.config);
  const sessao = sessaoDe(data);
  const doTreino = passado ? (treinoFeitoEm(plano, data, ds) ?? treinoDoDia(plano, ds)) : treinoDoDia(plano, ds);
  const todos = plano.dias.flatMap((d) => d.exercicios);
  const doPlano = doTreino?.exercicios ?? [];
  // No passado entram tambem os exercicios registrados naquele dia que nao estao no treino de hoje.
  const exercicios = passado
    ? [...doPlano, ...Object.keys(sessao.exercicios).filter((id) => !doPlano.some((e) => e.id === id)).map((id) => todos.find((e) => e.id === id)).filter(Boolean)]
    : doPlano;
  const feitasDe = (e) => seriesDeTrabalho(sessao.exercicios[e.id]);
  const comRegistro = exercicios.filter((e) => feitasDe(e).length > 0);
  const treinou = passado && comRegistro.length > 0;
  const titulo = doTreino?.nome ?? 'Descanso';
  dadosDaBarra = dadosDaBarraDe({ id: `${passado ? 'feito' : 'previa'}-${data}`, exercicios: passado ? comRegistro : exercicios }, sessao, data);

  const contador = (chave, valor, resto, rotulo) => {
    const b = h('span', { 'data-contar': chave, 'data-valor': String(valor) });
    return h('div', { class: 'numero' }, h('b', {}, b, resto ? h('small', { texto: resto }) : null), h('span', { texto: rotulo }));
  };
  const series = exercicios.flatMap(feitasDe);
  const nota = passado
    ? (treinou ? `Registrado em ${dataPorExtenso(data)}. Só para ver: o que você marca conta sempre para hoje.` : 'Nada registrado neste dia.')
    : doTreino ? `Prévia do treino de ${NOMES_DOS_DIAS[ds].toLowerCase()}. No dia, ele aparece aqui para você fazer.` : 'Dia de descanso no plano.';
  const tela = h('main', { class: 'tela' },
    barraNav(titulo, null, editarODia()),
    faixa,
    h('section', { class: 'palco', 'aria-label': titulo },
      h('p', { class: 'palco-data', texto: dataPorExtenso(data) }),
      h('h1', { class: 'titulo-grande', texto: passado && !treinou && !doTreino ? 'Descanso' : titulo }),
      h('div', { class: 'palco-cena' }),
      treinou ? h('div', { class: 'palco-numeros' },
        contador('ex', comRegistro.length, `/${exercicios.length}`, 'exercícios'),
        contador('series', series.length, null, 'séries'),
        contador('volume', Math.round(volume(series)), ' kg', 'volume')) : null,
      h('p', { class: 'palco-nota', texto: nota })));

  if (passado) {
    const pulados = treinou ? exercicios.filter((e) => feitasDe(e).length === 0) : [];
    if (pulados.length > 0) {
      queueMicrotask(() => tela.querySelector('.botao-rodape')?.before(h('p', { class: 'cartao leitura-pulados' },
        h('b', { texto: pulados.length === 1 ? 'Ficou sem registro' : `Ficaram sem registro (${pulados.length})` }),
        h('span', { texto: pulados.map((e) => e.nome).join(', ') }))));
    }
    comRegistro.forEach((e, i) => {
      const lista = feitasDe(e);
      const r = lista.length > 0 ? resultadoDoExercicio(e, sessao.exercicios[e.id], ultimaVez(e, sessoes, data)) : null;
      tela.append(h('div', { class: 'cartao leitura-ex' },
        h('div', { class: 'leitura-topo' },
          h('span', { class: 'leitura-num', texto: String(i + 1).padStart(2, '0') }),
          h('b', { class: 'leitura-nome', texto: e.nome }),
          r ? selo(r) : null),
        lista.length > 0
          ? h('ol', { class: 'leitura-series' }, lista.map((x, k) => h('li', {}, h('span', { texto: `Série ${k + 1}` }), cargaReps(x.carga, x.reps))))
          : h('p', { class: 'discreto', texto: 'Não registrado neste dia.' })));
    });
  } else {
    exercicios.forEach((e, i) => {
      const f = e.faixa ?? METODOS[e.metodo]?.faixa ?? FAIXA_PADRAO;
      const u = ultimaVez(e, sessoes, dia);
      tela.append(h('div', { class: 'cartao leitura-ex' },
        h('div', { class: 'leitura-topo' },
          h('span', { class: 'leitura-num', texto: String(i + 1).padStart(2, '0') }),
          h('b', { class: 'leitura-nome', texto: e.nome }),
          h('span', { class: 'chip', texto: `${f.min}–${f.max} reps` })),
        h('p', { class: 'leitura-plano', texto: `${e.series} ${(METODOS[e.metodo]?.rotulo ?? 'Séries').toLowerCase()}${METODOS[e.metodo] ? ` · ${METODOS[e.metodo].nome}` : ''}${e.nota ? ` · ${e.nota}` : ''}` }),
        u?.series?.length ? h('p', { class: 'discreto', texto: `Última vez: ${new Set(u.series.map((x) => x.carga)).size === 1 ? `${u.series.map((x) => x.reps).join(', ')} reps · ${kg(u.series[0].carga)}` : textoDasSeries(u.series)}` }) : null));
    });
  }
  if (passado && sessao.cardios.length > 0) tela.append(cartaoCardio(sessao, { soLeitura: true }));
  tela.append(h('button', { class: 'botao cheio botao-rodape', onclick: voltarParaEstaSemana, texto: 'Voltar para esta semana' }));
  return tela;
}

// A barra 3D carrega sozinha depois da primeira tela: se falhar (sem WebGL, sem
// o arquivo), o app continua com a barra fina e os numeros.
let dadosDaBarra = null;
let cenaDaBarra = null;
let cenaCarregando = false;
let cenaFalhou = false;

/** Cada exercicio e uma anilha: ganha corpo a cada serie e so encaixa quando o exercicio fecha. */
function dadosDaBarraDe(treino, sessao, dia) {
  return {
    chave: `${treino.id}|${dia}`,
    cardio: cardioDaBarra(sessao),
    placas: treino.exercicios.map((e) => ({
      id: e.id,
      p: completoNaSessao(e, sessao) ? 1 : Math.min(0.95, seriesDeTrabalho(sessao.exercicios[e.id]).length / roteiro(e).filter((x) => x.t !== 'a').length),
    })),
  };
}

// O Editar treino aberto ({ host, dados(), foco() }): a barra vai para o topo dele.
let cenaDoEditor = null;

function aplicarCena() {
  // Com a partida aberta, a barra fica nela; com o editor aberto, no topo dele; senao, no topo do treino.
  const jogo = jogoAberto();
  const ed = jogo ? null : cenaDoEditor;
  const host = jogo?.cenaHost ?? ed?.host ?? document.querySelector('.palco-cena');
  const dados = ed ? ed.dados() : dadosDaBarra;
  if (!host || !cenaDaBarra || dados === null) return;
  cenaDaBarra.montarEm(host);
  cenaDaBarra.mostrar(dados);
  if (ed) cenaDaBarra.foco(ed.foco());
}

/** A barra 3D carrega depois da primeira tela (import), uma vez so. */
function garantirCena() {
  if (cenaDaBarra) { aplicarCena(); return; }
  if (cenaFalhou || cenaCarregando) return;
  cenaCarregando = true;
  import('./barra3d.js')
    .then((m) => { cenaDaBarra = m.criarCena(); aplicarCena(); })
    .catch(() => {
      cenaFalhou = true;
      document.querySelector('.palco-cena')?.setAttribute('data-sem-3d', 'sim');
      cenaDoEditor?.host.setAttribute('data-sem-3d', 'sim');
    });
}

function ligarPalco(tela) {
  for (const b of tela.querySelectorAll('[data-contar]')) {
    movimento.contar(b, `treino-${b.dataset.contar}-${app.diaTreino}`, Number(b.dataset.valor), n0);
  }
  const palco = tela.querySelector('.palco');
  if (!palco) return;
  if (cenaFalhou) tela.querySelector('.palco-cena')?.setAttribute('data-sem-3d', 'sim');
  else garantirCena();
  movimento.rolagemDoPalco(palco, (p) => cenaDaBarra?.rolagem(p));
}

const CHANCE = { alta: 'Chance alta', media: 'Chance média', baixa: 'Chance baixa' };
const quandoFoi = (ultima) => (ultima === null ? null : quandoRelativo(ultima.dia, hoje()));
const rotuloDoExtra = (ex) => (ex.metodo === 'myo' ? 'Adicionar mini' : ex.metodo === 'restpause' ? 'Adicionar pausa' : ex.metodo === 'drop' ? 'Adicionar drop' : 'Adicionar série');

/**
 * O cartao mostra o exercicio inteiro antes de comecar: cada serie com a base (a
 * ultima vez) e a meta de hoje. Tocar em "Comecar" ou numa serie abre a partida,
 * uma serie por tela (jogo.js). Depois de feita, a serie mostra o que foi feito e a
 * marca contra a base: subiu a carga, subiu as repeticoes, igual ou abaixo.
 */
function cartaoExercicio(ex, sessao, sessoes, dia, treinoId, indice, atual) {
  const ultima = ultimaVez(ex, sessoes, dia);
  const lista = sessao.exercicios[ex.id] ?? [];
  const plano = planoDeHoje(ex, ultima, lista.length);
  const faixa = plano.faixa;
  const validas = seriesDeTrabalho(lista);
  const completo = completoNaSessao(ex, sessao);
  const pulouAquecimento = (sessao.semAquecimento ?? []).includes(ex.id);
  const analise = analiseDoExercicio(ex, sessoes, dia);
  const serieDeTrabalho = plano.passos.filter((p) => p.t !== 'a').length;
  const metodo = METODOS[ex.metodo] ?? null;
  const cartao = h('section', { class: `cartao exercicio${completo ? ' completo' : ''}${atual ? ' atual' : ''}`, 'aria-label': ex.nome, 'data-ex': ex.id });

  // Exercicio fechado vira uma linha so, com o resultado contra a ultima vez; tocar abre de novo.
  if (completo && !app.abertos.has(ex.id)) {
    const r = resultadoDoExercicio(ex, lista, ultima);
    const maior = validas.filter((s) => !s.t).reduce((m, s) => Math.max(m, s.carga), 0);
    cartao.classList.add('fechado');
    cartao.append(h('button', {
      class: 'ex-resumo',
      'aria-label': `${ex.nome}: feito${r && r.tipo !== 'nova' ? `, ${r.tipo === 'igual' ? 'igual à última vez' : `${r.texto} contra a última vez`}` : ''}${r?.liberou != null ? `, carga liberada para o próximo treino: ${kg(r.liberou)}` : ''}. Abrir para corrigir`,
      onclick: () => {
        app.efeito = { ex: ex.id, abriu: true, altura: cartao.offsetHeight };
        app.abertos.add(ex.id);
        desenhar();
      },
    },
    h('span', { class: 'ex-selo' }, icone('check')),
    h('span', { class: 'ex-resumo-texto' },
      h('span', { class: 'ex-resumo-nome', texto: ex.nome }),
      r?.liberou != null ? h('span', { class: 'ex-resumo-proximo' }, icone('liberada'), `Próximo treino: ${kg(r.liberou)}`) : null),
    h('span', { class: 'ex-resumo-lado' },
      h('span', { class: 'ex-resumo-numeros', texto: `${validas.length} séries · ${numeroBr(maior)} kg` }),
      selo(r))));
    return cartao;
  }

  // Os que ainda vem depois comecam minimizados (10/11/2026, 'todas as series, menos a primeira,
  // comecem minimizadas'): so o nome, a meta de hoje e a chance de evoluir. Tocar abre.
  if (!completo && !atual && !app.abertos.has(ex.id)) {
    const trabalho = plano.passos.filter((p) => !p.t);
    const cargaMeta = trabalho[0]?.alvo.carga ?? 0;
    cartao.classList.add('fechado', 'minimizado');
    cartao.append(h('button', {
      class: 'ex-resumo', 'aria-expanded': 'false',
      'aria-label': `${ex.nome}: ${trabalho.length} séries, meta ${kg(cargaMeta)}${analise.chance ? `, chance de evoluir hoje ${analise.chance.nivel}` : ''}. Abrir`,
      onclick: () => { app.efeito = { ex: ex.id, abriu: true, altura: cartao.offsetHeight }; app.abertos.add(ex.id); desenhar(); },
    },
    h('span', { class: 'ex-num-mini', 'aria-hidden': 'true', texto: String(indice + 1).padStart(2, '0') }),
    h('span', { class: 'ex-resumo-texto' },
      h('span', { class: 'ex-resumo-nome', texto: ex.nome }),
      h('span', { class: 'ex-resumo-meta', texto: `${trabalho.map((p) => p.alvo.reps).join(', ')} reps · ${numeroBr(cargaMeta)} kg${metodo ? ` · ${metodo.nome}` : ''}` })),
    h('span', { class: 'ex-resumo-lado' },
      analise.chance ? h('span', { class: 'chance', 'data-nivel': analise.chance.nivel, texto: CHANCE[analise.chance.nivel] }) : null,
      icone('baixo'))));
    return cartao;
  }

  cartao.append(h('div', { class: 'ex-topo' },
    h('span', { class: 'ex-num', 'aria-hidden': 'true', texto: String(indice + 1).padStart(2, '0') }),
    h('h3', { class: 'ex-nome', texto: ex.nome }),
    h('span', { class: `chip${ex.faixa ? '' : ' padrao'}`, title: ex.faixa ? null : 'Faixa padrão: dá para mudar em Editar treino', texto: `${faixa.min}–${faixa.max} reps` })));
  if (metodo) cartao.append(h('p', { class: 'ex-metodo' }, h('b', { texto: metodo.nome }), ` ${metodo.resumo}`));
  if (ex.nota) cartao.append(h('p', { class: 'ex-nota', texto: ex.nota }));
  cartao.append(h('p', { class: 'sugestao', 'data-tipo': plano.tipo }, plano.tipo === 'subir' ? icone('liberada') : null, h('span', { texto: plano.tipo === 'subir' ? `Carga liberada. ${plano.texto}` : plano.texto })));

  if (ultima) cartao.append(h('p', { class: 'ex-linha', texto: `Treino anterior: ${quandoFoi(ultima)}` }));
  // A leitura da evolucao: a chance de evoluir hoje e o que fazer (analiseDoExercicio).
  if (validas.length === 0 && analise.recomendacao.tipo !== 'subir') {
    cartao.append(h('div', { class: 'ex-analise', 'data-tipo': analise.recomendacao.tipo },
      analise.chance ? h('span', { class: 'chance', 'data-nivel': analise.chance.nivel, texto: `${CHANCE[analise.chance.nivel]} de evoluir hoje` }) : null,
      h('p', { texto: analise.recomendacao.texto })));
  }
  // O porque do aquecimento de hoje (aquecimentoDoDia): frio, ja aquecido, ontem, dia cheio...
  if (validas.length === 0 && ex.aquecerMotivo && !pulouAquecimento) {
    cartao.append(h('p', { class: 'ex-aquecimento', 'data-modo': ex.aquecerModo }, h('b', { texto: 'Aquecimento' }), h('span', { texto: ex.aquecerMotivo })));
  }
  // Todas as series de uma vez: Serie | Anterior (o treino anterior) | Hoje (a meta, ou o que foi feito) | marca.
  const series = h('div', { class: 'series', role: 'group', 'aria-label': `Séries de ${ex.nome}` },
    h('div', { class: 'serie cabecalho', 'aria-hidden': 'true' },
      h('span', { texto: 'Série' }), h('span', { texto: 'Anterior' }), h('span', { texto: 'Hoje' }), h('span')));
  plano.passos.forEach((passo, i) => {
    const f = lista[i] && lista[i].reps > 0 ? lista[i] : null;
    if (passo.t === 'a') {
      // O aquecimento aparece na tabela, apagado: nao tem treino anterior nem conta.
      series.append(h('button', {
        class: `serie aquecimento${f ? ' feita' : ''}`, 'data-chave': `${ex.id}|${i}`,
        'aria-label': `${passo.rotulo}: ${f ? `feito ${kg(f.carga)} vezes ${f.reps}` : pulouAquecimento ? 'pulado' : `${kg(passo.alvo.carga)} vezes ${passo.alvo.reps}`}`,
        onclick: () => jogar(ex.id, i),
      },
      h('span', { class: 'n', texto: passo.curto }),
      h('span', { class: 'anterior', texto: 'aquec.' }),
      h('span', { class: f ? 'hoje' : 'meta' }, f ? cargaReps(f.carga, f.reps, { empilhado: true }) : cargaReps(passo.alvo.carga, passo.alvo.reps, { empilhado: true })),
      h('span', { class: 'selo vazio' }, h('span', { texto: f ? 'feito' : pulouAquecimento ? 'pulado' : 'leve' }))));
      return;
    }
    const v = f ? veredito(f, passo.base) : null;
    const base = passo.base ? cargaReps(passo.base.carga, passo.base.reps, { empilhado: true }) : '—';
    const alvo = cargaReps(passo.alvo.carga, passo.alvo.reps, { empilhado: true });
    series.append(h('button', {
      class: `serie${f ? ' feita' : ''}`, 'data-chave': `${ex.id}|${i}`,
      'aria-label': f
        ? `${passo.rotulo}: feito ${kg(f.carga)} vezes ${f.reps}, ${v.tipo === 'nova' ? 'primeiro registro' : v.tipo === 'igual' ? 'igual ao treino anterior' : v.texto}. Corrigir`
        : `${passo.rotulo}: treino anterior ${passo.base ? `${kg(passo.base.carga)} vezes ${passo.base.reps}` : 'ainda não tem'}, meta ${kg(passo.alvo.carga)} vezes ${passo.alvo.reps}. Fazer agora`,
      onclick: () => jogar(ex.id, i),
    },
    f ? h('i', { class: 'serie-luz', 'aria-hidden': 'true' }) : null,
    h('span', { class: 'n', texto: passo.curto }),
    h('span', { class: 'anterior' }, base),
    f ? h('span', { class: 'hoje' }, cargaReps(f.carga, f.reps, { empilhado: true })) : h('span', { class: 'meta' }, alvo),
    f ? selo(v) : h('span', { class: 'selo vazio' }, h('span', { texto: 'meta' }))));
  });
  cartao.append(series);

  const falta = plano.passos.findIndex((p, i) => !(lista[i] && lista[i].reps > 0) && !(p.t === 'a' && (pulouAquecimento || validas.length > 0)));
  if (falta !== -1 && !(completo && validas.length >= serieDeTrabalho)) {
    cartao.append(h('button', { class: `botao cheio comecar${atual ? ' principal' : ''}`, onclick: () => jogar(ex.id, null) },
      icone('comecar'), validas.length === 0 && plano.passos[falta].t === 'a' ? 'Começar pelo aquecimento' : validas.length === 0 && !lista.some((x) => x.reps > 0) ? 'Começar' : `Continuar: ${plano.passos[falta].rotulo}`));
  }
  cartao.append(h('div', { class: 'ex-acoes' },
    h('button', { class: 'botao texto', onclick: () => { adicionarSerie(ex, treinoId); desenhar(); }, texto: rotuloDoExtra(ex) }),
    completo || !atual ? h('button', { class: 'botao texto', onclick: () => { app.abertos.delete(ex.id); desenhar(); }, texto: 'Recolher' }) : null,
    h('button', { class: 'botao texto', onclick: () => abrirHistorico(ex), texto: 'Histórico' })));
  return cartao;
}

/** Tudo que a partida precisa para andar sozinha: ler e gravar o dia, o descanso e a barra. */
function partidaDe(exId, comecarEm) {
  // Comecar um exercicio fora da ordem refaz a conta: ele vem logo depois dos ja feitos.
  const treino = treinoAnotado(app.diaTreino, sessaoDe(hoje()), exId);
  const indice = treino?.exercicios.findIndex((e) => e.id === exId) ?? -1;
  if (indice === -1) return null;
  const ex = treino.exercicios[indice];
  const ultima = ultimaVez(ex, sessoesDoConfig(app.estado.config), hoje());
  const listaDe = () => sessaoDe(hoje()).exercicios[ex.id] ?? [];
  return {
    ex, indice, ultima, quando: quandoFoi(ultima), comecarEm,
    feitas: listaDe,
    encerrado: () => sessaoDe(hoje()).encerrados.includes(ex.id),
    gravar: (i, valor) => gravarSerie(ex, i, valor, treino.id),
    desmarcar: (i) => gravarSerie(ex, i, { carga: listaDe()[i]?.carga ?? 0, reps: 0 }, treino.id),
    encerrar: () => marcarEncerrado(ex.id, true),
    analise: analiseDoExercicio(ex, sessoesDoConfig(app.estado.config), hoje()),
    ajuste: (feita) => ajusteEntreSeries(ex, feita),
    semAquecimento: () => (sessaoDe(hoje()).semAquecimento ?? []).includes(ex.id),
    pularAquecimento: () => {
      const s = sessaoDe(hoje());
      if (!s.semAquecimento.includes(ex.id)) s.semAquecimento.push(ex.id);
      s.treinoId = treino.id;
      gravarSessao(s);
    },
    reabrir: () => marcarEncerrado(ex.id, false),
    adicionar: () => adicionarSerie(ex, treino.id),
    descansar: (segundos, rotulo, texto) => comecarDescanso(segundos, rotulo, texto, { exId: ex.id, dia: app.diaTreino }),
    pararDescanso,
    cena: {
      montar: (host) => cenaDaBarra?.montarEm(host),
      atualizar: () => {
        dadosDaBarra = dadosDaBarraDe(treino, sessaoDe(hoje()), hoje());
        cenaDaBarra?.mostrar(dadosDaBarra);
      },
      foco: (id) => cenaDaBarra?.foco(id),
    },
    proximo: () => {
      const s = sessaoDe(hoje());
      const falta = [...treino.exercicios.slice(indice + 1), ...treino.exercicios.slice(0, indice)].find((e) => !completoNaSessao(e, s));
      return falta ? partidaDe(falta.id, null) : null;
    },
  };
}

function jogar(exId, passo) {
  const partida = partidaDe(exId, passo);
  if (partida === null) return;
  abrirJogo(partida, ({ mudou, ex }) => {
    if (descanso) document.body.append(descanso.el);
    if (mudou && completoNaSessao(ex, sessaoDe(hoje()))) app.abertos.delete(ex.id);
    desenhar();
    if (mudou) {
      document.querySelector('.exercicio.atual')?.scrollIntoView({ block: 'center', behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
    }
  });
  // Um descanso que ja corria (voltou pela pilula ou abriu outro exercicio) entra na partida com ela.
  if (descanso) jogoAberto()?.descansoHost.append(descanso.el);
}

// A linha vazia da posicao k, com o tipo do roteiro (aquecimento, mini, drop) para a lista nao andar.
const vazia = (ex, k) => { const t = roteiro(ex, k + 1)[k].t; return { carga: 0, reps: 0, ...(t ? { t } : {}) }; };
// Na primeira linha gravada o aquecimento do exercicio fica fixo para o dia.
const fixarAquecimento = (s, ex) => {
  s.aquecer ??= {};
  if (!Number.isInteger(s.aquecer[ex.id])) s.aquecer[ex.id] = roteiro(ex).filter((p) => p.t === 'a').length;
};

function gravarSerie(ex, i, valor, treinoId) {
  const s = sessaoDe(hoje());
  fixarAquecimento(s, ex);
  const lista = s.exercicios[ex.id] ?? [];
  while (lista.length <= i) lista.push(vazia(ex, lista.length));
  const t = roteiro(ex, i + 1)[i].t;
  lista[i] = { carga: valor.carga, reps: valor.reps, ...(t ? { t } : {}), ...(valor.seg > 0 ? { seg: Math.round(valor.seg) } : {}) };
  // series vazias no fim, alem do roteiro, nao precisam ficar guardadas
  const minimo = roteiro(ex).length;
  while (lista.length > minimo && lista.at(-1).reps === 0) lista.pop();
  s.exercicios[ex.id] = lista;
  s.treinoId = treinoId;
  gravarSessao(s);
}

/** Um passo a mais no fim do roteiro (serie, mini, pausa ou drop). Devolve a posicao dele. */
function adicionarSerie(ex, treinoId) {
  const s = sessaoDe(hoje());
  fixarAquecimento(s, ex);
  const lista = s.exercicios[ex.id] ?? [];
  const minimo = roteiro(ex).length;
  while (lista.length < minimo) lista.push(vazia(ex, lista.length));
  lista.push(vazia(ex, lista.length));
  s.exercicios[ex.id] = lista;
  s.treinoId = treinoId;
  gravarSessao(s);
  return lista.length - 1;
}

function marcarEncerrado(exId, sim) {
  const s = sessaoDe(hoje());
  s.encerrados = s.encerrados.filter((id) => id !== exId);
  if (sim) s.encerrados.push(exId);
  gravarSessao(s);
}

// ---------- cardio (11/11/2026, "melhorar a parte do cardio, podendo ser adicional") ----------
// Cardio e extra: o cartao nao cobra nada, so registra. Da para por mais de um no dia
// (esteira e depois bicicleta). A meta e opcional e vale para todo dia: com ela, o anel do
// cartao e a pegada da barra 3D enchem ate a meta; sem ela, acendem quando houver cardio.

const TIPOS_DE_CARDIO = ['Esteira', 'Bicicleta', 'Escada', 'Elíptico', 'Caminhada', 'Corrida', 'Outro'];
const MINUTOS_RAPIDOS = [10, 15, 20, 30, 45, 60];
const METAS_DE_CARDIO = [0, 15, 20, 30, 45, 60];
const metaDoCardio = () => { const v = Number(app.estado.config.cardioMeta); return Number.isFinite(v) && v > 0 ? v : null; };
const minutosDeCardio = (sessao) => (sessao.cardios ?? []).reduce((n, c) => n + c.minutos, 0);
function fracaoDoCardio(sessao) {
  const total = minutosDeCardio(sessao);
  if (total <= 0) return 0;
  const meta = metaDoCardio();
  return meta ? Math.min(1, total / meta) : 1;
}
const cardioDaBarra = (sessao) => ({ f: fracaoDoCardio(sessao), meta: metaDoCardio() !== null });
const numeroDoCampo = (t) => { const v = Number(String(t).replace(',', '.')); return String(t).trim() !== '' && Number.isFinite(v) && v > 0 ? v : null; };

function cartaoCardio(sessao, { soLeitura = false } = {}) {
  const lista = sessao.cardios ?? [];
  const total = minutosDeCardio(sessao);
  const kcal = lista.reduce((n, c) => n + (c.kcal ?? 0), 0);
  const meta = metaDoCardio();
  const fracao = fracaoDoCardio(sessao);
  const chave = soLeitura ? `cardio-${sessao.dia}` : 'cardio';

  const raio = 24;
  const volta = 2 * Math.PI * raio;
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 56 56');
  svg.setAttribute('class', 'cardio-anel-svg');
  svg.innerHTML = `<defs><linearGradient id="grad-cardio" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ff7a59"/><stop offset="1" stop-color="#ffc24a"/></linearGradient></defs>
    <circle class="trilho" cx="28" cy="28" r="${raio}"/><circle class="cheio" cx="28" cy="28" r="${raio}" stroke-dasharray="${volta}" stroke-dashoffset="${volta}"/>`;
  movimento.anel(svg.querySelector('.cheio'), volta, fracao, `anel-${chave}`);
  const minutos = h('b');
  movimento.contar(minutos, `${chave}-min`, total, n0);

  const subtitulo = lista.length === 0
    ? 'Extra: registre só se fizer.'
    : [meta ? (total >= meta ? `meta de ${meta} min batida` : `faltam ${n0(meta - total)} min da meta`) : null, kcal > 0 ? `${n0(kcal)} kcal` : null, lista.length > 1 ? `${lista.length} registros` : null].filter(Boolean).join(' · ') || (lista[0].tipo || 'Cardio');
  const nomeDaIntensidade = (c) => (c.intensidade ? INTENSIDADES_DO_CARDIO[c.intensidade] : null);
  return h('section', { class: 'cartao cartao-cardio', 'aria-label': 'Cardio', 'data-feito': total > 0 ? 'sim' : null },
    h('div', { class: 'cardio-topo' },
      h('div', { class: 'cardio-anel', 'aria-hidden': 'true' }, svg, icone('cardio')),
      h('div', { class: 'cardio-titulo' },
        h('p', { class: 'ex-nome', texto: 'Cardio' }),
        h('p', { class: 'ex-linha', texto: subtitulo })),
      total > 0
        ? h('div', { class: 'cardio-total', 'aria-label': `${n0(total)} minutos de cardio` }, minutos, h('small', { texto: 'min' }))
        : h('span', { class: 'chip cardio-extra', texto: 'Extra' })),
    lista.length === 0 ? null : h('ul', { class: 'cardio-lista' }, lista.map((c) => {
      const info = [nomeDaIntensidade(c), c.kcal ? `${n0(c.kcal)} kcal` : null].filter(Boolean).join(' · ');
      const dentro = [
        h('span', { class: 'cardio-item-tipo', texto: c.tipo || 'Cardio' }),
        info ? h('span', { class: 'cardio-item-info', texto: info }) : null,
        h('b', { class: 'cardio-item-min', texto: `${n0(c.minutos)} min` }),
        soLeitura ? null : icone('avancar'),
      ];
      return h('li', {}, soLeitura
        ? h('div', { class: 'cardio-item' }, dentro)
        : h('button', { class: 'cardio-item', type: 'button', 'aria-label': `${c.tipo || 'Cardio'}, ${n0(c.minutos)} minutos${info ? `, ${info}` : ''}. Editar`, onclick: () => abrirCardio(c.id) }, dentro));
    })),
    soLeitura ? null : h('button', { class: 'botao cheio cardio-mais', type: 'button', onclick: () => abrirCardio(null) },
      icone('mais'), lista.length === 0 ? 'Adicionar cardio' : 'Adicionar outro cardio'));
}

/** Pilulas que trocam na hora (sem redesenhar a folha); a luz desliza para a escolhida. */
function pilulas(chave, rotulo, opcoes, valor, escolher) {
  const grupo = h('div', { class: 'ed-chips', role: 'group', 'aria-label': rotulo, 'data-chave': chave }, h('span', { class: 'ed-chip-luz', 'aria-hidden': 'true' }));
  const botoes = opcoes.map(([v, nome]) => h('button', {
    class: 'ed-chip', type: 'button', 'aria-pressed': String(v === valor), texto: nome,
    onclick: () => { marcar(v); escolher(v); },
  }));
  const marcar = (v) => {
    opcoes.forEach(([o], k) => botoes[k].setAttribute('aria-pressed', String(o === v)));
    movimento.pilulaDosChips(grupo, chave);
  };
  grupo.append(...botoes);
  return { el: grupo, marcar };
}

/** Registrar um cardio novo (id null) ou mudar um que ja esta no dia. */
function abrirCardio(id) {
  const sessao = sessaoDe(hoje());
  const antigo = id ? (sessao.cardios ?? []).find((c) => c.id === id) ?? null : null;
  // Um novo comeca como o ultimo que a pessoa fez (hoje ou em outro dia).
  const ultimo = (sessao.cardios ?? []).at(-1) ?? sessoesDoConfig(app.estado.config).find((s) => (s.cardios ?? []).length > 0)?.cardios.at(-1) ?? null;
  const base = antigo ?? ultimo;
  const atual = { tipo: base?.tipo || 'Esteira', intensidade: base?.intensidade ?? 'moderada', meta: metaDoCardio() ?? 0 };

  const secao = (titulo, ...filhos) => h('div', { class: 'ed-secao' }, h('p', { class: 'ed-titulo', texto: titulo }), ...filhos);
  const tipo = pilulas('cardio-tipo', 'Tipo de cardio', TIPOS_DE_CARDIO.map((t) => [t, t]), atual.tipo, (v) => { atual.tipo = v; });

  const campoMin = h('input', { class: 'campo ed-passo-valor', inputmode: 'numeric', enterkeyhint: 'done', value: String(antigo?.minutos ?? base?.minutos ?? 20), 'aria-label': 'Minutos' });
  const rapidos = pilulas('cardio-min', 'Minutos rápidos', MINUTOS_RAPIDOS.map((m) => [m, `${m} min`]), numeroDoCampo(campoMin.value), (v) => {
    const d = v - (numeroDoCampo(campoMin.value) ?? 0);
    campoMin.value = String(v);
    movimento.numeroMudou(campoMin, d);
  });
  const mexer = (d) => {
    const v = Math.max(1, Math.min(300, Math.round((numeroDoCampo(campoMin.value) ?? 0) + d)));
    campoMin.value = String(v);
    movimento.numeroMudou(campoMin, d);
    rapidos.marcar(v);
  };
  campoMin.addEventListener('focus', () => campoMin.select());
  campoMin.addEventListener('input', () => rapidos.marcar(numeroDoCampo(campoMin.value)));
  const passoMin = h('div', { class: 'ed-passo cardio-passo' },
    h('button', { class: 'ed-passo-botao', type: 'button', 'aria-label': 'Menos 5 minutos', onclick: () => mexer(-5) }, icone('menos')),
    h('div', { class: 'cardio-passo-valor' }, campoMin, h('small', { texto: 'min' })),
    h('button', { class: 'ed-passo-botao', type: 'button', 'aria-label': 'Mais 5 minutos', onclick: () => mexer(5) }, icone('mais')));

  const intensidade = pilulas('cardio-intensidade', 'Intensidade', Object.entries(INTENSIDADES_DO_CARDIO), atual.intensidade, (v) => { atual.intensidade = v; });
  const campoKcal = h('input', { class: 'campo', inputmode: 'numeric', enterkeyhint: 'done', placeholder: 'Opcional', value: antigo?.kcal ?? '', 'aria-label': 'Calorias ativas' });
  const meta = pilulas('cardio-meta', 'Meta de cardio por dia', METAS_DE_CARDIO.map((m) => [m, m === 0 ? 'Sem meta' : `${m} min`]), atual.meta, (v) => { atual.meta = v; });

  const tirar = antigo ? h('button', {
    class: 'botao texto perigo cheio', type: 'button', onclick: (ev) => {
      if (ev.currentTarget.dataset.certeza !== 'sim') { ev.currentTarget.dataset.certeza = 'sim'; ev.currentTarget.textContent = 'Tocar de novo para tirar'; return; }
      const s = sessaoDe(hoje());
      s.cardios = (s.cardios ?? []).filter((c) => c.id !== antigo.id);
      gravarSessao(s);
      d.close();
    }, texto: 'Tirar este cardio',
  }) : null;

  const d = folha(antigo ? 'Editar cardio' : 'Adicionar cardio', [
    h('div', { class: 'cartao cardio-folha' },
      secao('Tipo', tipo.el),
      secao('Quanto tempo', passoMin, rapidos.el),
      secao('Intensidade', intensidade.el),
      secao('Calorias ativas', campoKcal, h('p', { class: 'cardio-dica', texto: 'Se usar o Apple Watch, copie do app Atividade.' })),
      secao('Meta por dia', meta.el, h('p', { class: 'cardio-dica', texto: 'Opcional. Com meta, o anel do cardio e a barra enchem até ela.' }))),
    tirar,
  ], {
    acao: {
      nome: 'Salvar', fazer: () => {
        const min = numeroDoCampo(campoMin.value);
        if (min === null) { campoMin.focus(); movimento.nega(campoMin); return false; }
        if (atual.meta !== (metaDoCardio() ?? 0)) mudar((e) => definirConfig(e, 'cardioMeta', String(atual.meta)));
        const s = sessaoDe(hoje());
        const novo = { id: antigo?.id ?? `c${Date.now().toString(36)}`, tipo: atual.tipo, minutos: Math.round(min), kcal: numeroDoCampo(campoKcal.value), intensidade: atual.intensidade };
        s.cardios = antigo ? (s.cardios ?? []).map((c) => (c.id === antigo.id ? novo : c)) : [...(s.cardios ?? []), novo];
        gravarSessao(s);
        return true;
      },
    },
    aoFechar: () => desenhar(),
  });
  d.classList.add('folha-cardio');
  requestAnimationFrame(() => {
    for (const grupo of d.querySelectorAll('.ed-chips')) movimento.pilulaDosChips(grupo, grupo.dataset.chave);
    movimento.cardioAbriu(d);
  });
}

// descanso entre as series

let descanso = null;
// O descanso conta para baixo e, quando acaba, NAO some (10/11/2026, "caso supere o descanso o
// app comeca a dar aviso vermelho"): fica vermelho e conta o quanto passou, ate a proxima serie
// comecar ou a pessoa tocar em Pular. Apita ao acabar e a cada 30 s passados.
// Fora da partida, tocar na pilula volta para a serie que esta esperando (10/11/2026: "ao clicar
// voce volta para o treino que vc estava pendente esperando"): o mesmo exercicio, ou o proximo que
// falta se ele ja fechou. +30s e Pular continuam sendo so deles.
function voltarAoPendente(de) {
  if (jogoAberto() || !de) return;
  if (app.aba !== 'treino' || app.diaTreino !== de.dia) {
    app.aba = 'treino'; guardado.gravar('aba', 'treino');
    app.diaTreino = de.dia;
    desenhar();
  }
  const s = sessaoDe(hoje());
  const treino = treinoAnotado(de.dia, s);
  const ex = treino?.exercicios.find((e) => e.id === de.exId);
  if (!ex) return;
  if (!completoNaSessao(ex, s)) { jogar(ex.id, null); return; }
  const prox = partidaDe(ex.id, null)?.proximo();
  if (prox) jogar(prox.ex.id, null);
}

function comecarDescanso(segundos, rotulo = 'Descanso', texto = '', de = null) {
  pararDescanso();
  const el = h('div', { class: 'descanso', role: 'timer', 'aria-live': 'off' });
  const tempo = h('b');
  const nomeEl = h('span', { class: 'descanso-rotulo', texto: rotulo });
  const textoEl = h('span', { class: 'descanso-texto', texto });
  const barra = h('i', { class: 'descanso-barra', 'aria-hidden': 'true' });
  const mais = h('button', { class: 'botao', onclick: () => { descansoFim = Math.max(descansoFim, Date.now()) + 30_000; descansoTotal += 30_000; apitos = 0; }, texto: '+30s' });
  el.dataset.rotulo = rotulo;
  const abrir = h('button', { class: 'descanso-abrir', type: 'button', 'aria-label': 'Voltar para a série', onclick: () => voltarAoPendente(de) },
    tempo, h('span', { class: 'pequeno' }, nomeEl, textoEl), icone('seguir'));
  el.append(abrir, mais,
    h('button', { class: 'botao', onclick: pararDescanso, texto: 'Pular' }), barra);
  let descansoFim = Date.now() + segundos * 1000;
  let descansoTotal = segundos * 1000;
  let apitos = 0;
  const tique = () => {
    const resta = Math.ceil((descansoFim - Date.now()) / 1000);
    barra.style.transform = `scaleX(${Math.max(0, (descansoFim - Date.now()) / descansoTotal)})`;
    if (resta <= 0) {
      const passou = Math.floor((Date.now() - descansoFim) / 1000);
      el.dataset.passou = 'sim';
      tempo.textContent = `+${Math.floor(passou / 60)}:${String(passou % 60).padStart(2, '0')}`;
      nomeEl.textContent = 'Passou do descanso';
      textoEl.textContent = `Combinado: ${Math.floor(descansoTotal / 60000)}:${String(Math.round(descansoTotal / 1000) % 60).padStart(2, '0')}`;
      const devidos = 1 + Math.floor(passou / 30);
      if (apitos < devidos) { apitos = devidos; apito(); }
      return;
    }
    if (el.dataset.passou) {
      delete el.dataset.passou;
      nomeEl.textContent = rotulo;
      textoEl.textContent = texto;
    }
    tempo.textContent = `${Math.floor(resta / 60)}:${String(resta % 60).padStart(2, '0')}`;
  };
  // Com a partida aberta, o descanso conta dentro dela; fechou, desce para a pilula de baixo.
  (jogoAberto()?.descansoHost ?? document.body).append(el);
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
    .map((s) => ({ dia: s.dia, series: seriesDeTrabalho(s.exercicios[ex.id]) }))
    .filter((s) => s.series.length > 0)
    .slice(0, 15);
  const melhor = linhas.flatMap((l) => l.series).reduce((m, s) => (m === null || s.carga > m.carga || (s.carga === m.carga && s.reps > m.reps) ? s : m), null);
  folha(ex.nome, [
    melhor ? h('div', { class: 'cartao' }, h('p', { class: 'pequeno', texto: 'Melhor série' }), h('p', { class: 'ex-nome' }, cargaReps(melhor.carga, melhor.reps))) : null,
    linhas.length === 0
      ? h('p', { class: 'discreto', texto: ex.referencia ? `Ainda sem treino registrado aqui. Anotado: ${textoDasSeries(ex.referencia.reps.map((reps) => ({ carga: ex.referencia.carga, reps })))}` : 'Ainda sem treino registrado.' })
      : h('div', { class: 'cartao' }, h('ul', { class: 'lista-simples historico' }, linhas.map((l, i) => {
        // contra o treino anterior do mesmo exercicio: subiu a carga, as repeticoes, igual ou abaixo
        const antes = linhas[i + 1] ?? null;
        const r = antes ? resultadoDoExercicio(ex, l.series, antes) : null;
        return h('li', {}, h('span', { texto: dataCurta(l.dia) }), h('span', { texto: textoDasSeries(l.series) }), selo(r) ?? h('span', { class: 'pequeno', texto: 'primeiro' }));
      }))),
  ]);
}

function abrirEditor(diaSemana) {
  const plano = planoTreino();
  let treino = structuredClone(treinoDoDia(plano, diaSemana)) ?? { id: novoId(), diaSemana, nome: NOMES_DOS_DIAS[diaSemana], nota: '', exercicios: [] };
  const lista = h('div');
  const nome = h('input', { class: 'campo', value: treino.nome, 'aria-label': 'Nome do treino' });
  const qualDia = h('select', { class: 'campo', 'aria-label': 'Dia da semana' }, NOMES_DOS_DIAS.map((n, i) => h('option', { value: String(i), selected: i === diaSemana ? true : null, texto: n })));
  qualDia.addEventListener('change', () => {
    // Dia sem treino comeca vazio (10/11/2026, "quando coloca um dia que nao vai nada, por exemplo
    // no sabado, ele buga"): antes o treino da tela ficava e o Salvar o MUDAVA para o dia novo,
    // apagando o dia de onde ele veio.
    const dia = Number(qualDia.value);
    const outro = treinoDoDia(planoTreino(), dia);
    treino = outro ? structuredClone(outro) : { id: novoId(), diaSemana: dia, nome: NOMES_DOS_DIAS[dia], nota: '', exercicios: [] };
    nome.value = treino.nome;
    abertoId = null;
    redesenhar();
    atualizarTopo();
  });

  const numeroOuNulo = (t) => { const v = Number(String(t).replace(',', '.')); return t !== '' && Number.isFinite(v) && v > 0 ? v : null; };
  // O que o automatico faria com o treino como esta na tela (ordem do plano, carga de hoje).
  const previsaoDoAquecimento = () => {
    const lidos = lerPlanoTreino({ dias: [{ id: 'x', diaSemana: 1, exercicios: treino.exercicios.map((e) => ({ ...e, nome: e.nome || 'Exercício' })) }] }).dias[0].exercicios;
    return treinoComAquecimento({ exercicios: lidos }, { sessoes: sessoesDoConfig(app.estado.config), hoje: hoje() }).exercicios;
  };
  let explicadores = [];
  const explicarAquecimentos = () => { for (const f of explicadores) f?.(); };
  // Refeito em 10/11/2026 ("essa tela de editar o treino da pra entender absolutamente nada";
  // "o design e as funcoes estao muito feias", com threejs-webgl, core-3d-animation,
  // gsap-scrolltrigger e animation-components): um exercicio aberto por vez, os outros sao uma
  // linha com o resumo; numeros com menos e mais; escolhas em pilulas (a luz desliza, GSAP);
  // e a barra 3D do dia no topo, com a anilha do exercicio aberto acesa.
  let abertoId = null;
  const resumoDoEx = (ex) => {
    const f = ex.faixa ?? METODOS[ex.metodo]?.faixa ?? FAIXA_PADRAO;
    const partes = [`${ex.series} ${(METODOS[ex.metodo]?.rotulo ?? 'Séries').toLowerCase()}`, `${f.min} a ${f.max} reps`];
    if (METODOS[ex.metodo]) partes.push(METODOS[ex.metodo].nome);
    if (ex.descansoS) partes.push(`descanso ${relogio(ex.descansoS)}`);
    if (ex.nota) partes.push(ex.nota);
    return partes.join(' · ');
  };
  const secao = (titulo, ...filhos) => h('div', { class: 'ed-secao' }, h('p', { class: 'ed-titulo', texto: titulo }), ...filhos);
  // Escolha em pilulas: a luz desliza da escolha anterior para a nova (movimento.pilulaDosChips).
  const chips = (chave, rotulo, opcoes, atual, escolher) => h('div', { class: 'ed-chips', role: 'group', 'aria-label': rotulo, 'data-chave': chave },
    h('span', { class: 'ed-chip-luz', 'aria-hidden': 'true' }),
    opcoes.map(([valor, nome]) => h('button', {
      class: 'ed-chip', type: 'button', 'aria-pressed': valor === atual ? 'true' : 'false',
      onclick: () => { if (valor !== atual) escolher(valor); }, texto: nome,
    })));
  // Numero com menos e mais do tamanho do polegar; da para tocar no meio e digitar.
  const passo = (rotulo, valor, padrao, [menor, maior], aoMudar) => {
    const campo = h('input', { class: 'campo ed-passo-valor', inputmode: 'numeric', enterkeyhint: 'done', value: valor ?? '', placeholder: String(padrao), 'aria-label': rotulo });
    const mexer = (d) => {
      const agora = Math.round(numeroOuNulo(campo.value) ?? padrao);
      const v = Math.max(menor, Math.min(maior, agora + d));
      if (campo.value === String(v)) return;
      campo.value = String(v);
      movimento.numeroMudou(campo, d);
      aoMudar();
    };
    campo.addEventListener('focus', () => campo.select());
    campo.addEventListener('input', aoMudar);
    return {
      campo,
      el: h('div', { class: 'ed-passo' },
        h('button', { class: 'ed-passo-botao', type: 'button', 'aria-label': `${rotulo}: menos um`, onclick: () => mexer(-1) }, icone('menos')),
        campo,
        h('button', { class: 'ed-passo-botao', type: 'button', 'aria-label': `${rotulo}: mais um`, onclick: () => mexer(1) }, icone('mais'))),
    };
  };
  // O placar e a barra 3D do topo seguem a lista: uma anilha por exercicio.
  const placarEx = h('b');
  const placarSeries = h('b');
  const cenaHost = h('div', { class: 'ed-cena', 'aria-hidden': 'true' });
  const dadosDoEditor = () => ({ chave: `editor|${treino.id}`, placas: treino.exercicios.map((e) => ({ id: e.id, p: e.id === abertoId ? 0.95 : 0.5 })) });
  const atualizarTopo = () => {
    movimento.contar(placarEx, 'editor-ex', treino.exercicios.length);
    movimento.contar(placarSeries, 'editor-series', treino.exercicios.reduce((t, e) => t + (Number(e.series) || 0), 0));
    if (cenaDoEditor) aplicarCena();
  };
  const posicoes = () => new Map([...lista.children].map((el) => { const r = el.getBoundingClientRect(); return [el.dataset.id, { top: r.top, h: r.height }]; }));
  const mudarLista = (fazer) => {
    const antes = posicoes();
    fazer();
    redesenhar();
    movimento.editorMudou(lista, antes, abertoId);
  };
  function redesenhar() {
    explicadores = [];
    queueMicrotask(explicarAquecimentos);
    lista.replaceChildren(...treino.exercicios.map((ex, i) => {
      const numero = String(i + 1).padStart(2, '0');
      if (ex.id !== abertoId) {
        return h('button', {
          class: 'ed-ex-linha', type: 'button', 'data-id': ex.id, 'aria-expanded': 'false',
          'aria-label': `${ex.nome || 'Exercício sem nome'}: ${resumoDoEx(ex)}. Editar`,
          onclick: () => mudarLista(() => { abertoId = ex.id; }),
        },
        h('span', { class: 'ed-num', texto: numero }),
        h('span', { class: 'ed-ex-texto' },
          h('span', { class: 'ed-ex-nome', texto: ex.nome || 'Exercício sem nome' }),
          h('span', { class: 'ed-ex-resumo', texto: resumoDoEx(ex) })),
        icone('baixo'));
      }
      const padraoFaixa = METODOS[ex.metodo]?.faixa ?? FAIXA_PADRAO;
      const rotuloSeries = METODOS[ex.metodo]?.rotulo ?? 'Séries';
      const titulo = h('span', { class: 'ed-ex-nome', texto: ex.nome || 'Novo exercício' });
      const campoNome = h('input', { class: 'campo', value: ex.nome, placeholder: 'Ex.: Puxada aberta', 'aria-label': 'Nome do exercício', enterkeyhint: 'done' });
      const nota = h('input', { class: 'campo', value: ex.nota, placeholder: 'Ex.: lento, pausa embaixo', 'aria-label': 'Execução', enterkeyhint: 'done' });
      const explicaCarga = h('p', { class: 'ed-explica ed-regra' });
      const regra = () => {
        const lido = lerPlanoTreino({ dias: [{ id: 'x', diaSemana: 1, exercicios: [{ ...ex, nome: ex.nome || 'x' }] }] }).dias[0].exercicios[0];
        return `A carga sobe quando você fizer ${regraDaCarga(lido)}.`;
      };
      const pSeries = passo(rotuloSeries, ex.series, 3, [1, 10], () => lerEx());
      const pMin = passo('Repetições, no mínimo', ex.faixa?.min, padraoFaixa.min, [1, 50], () => { if (pMax.campo.value === '') pMax.campo.value = String(padraoFaixa.max); lerEx(); });
      const pMax = passo('Repetições, no máximo', ex.faixa?.max, padraoFaixa.max, [1, 50], () => { if (pMin.campo.value === '') pMin.campo.value = String(padraoFaixa.min); lerEx(); });
      const pDrops = ex.metodo === 'drop' ? passo('Drops', ex.drops || METODOS.drop.drops, METODOS.drop.drops, [1, 4], () => lerEx()) : null;
      // O musculo (para o aquecimento do dia saber quem ja esta quente) e o aquecimento do exercicio.
      const pelo = () => { const g = grupoDoExercicio(ex.nome || '').grupo; return g.startsWith('outro:') ? 'não reconheci' : MUSCULOS[g]; };
      const musculoSel = h('select', { class: 'campo', 'aria-label': 'Músculo' },
        h('option', { value: '', selected: ex.musculo ? null : true, texto: `Pelo nome (${pelo()})` }),
        Object.entries(MUSCULOS).map(([id, n]) => h('option', { value: id, selected: ex.musculo === id ? true : null, texto: n })));
      musculoSel.addEventListener('change', () => { ex.musculo = musculoSel.value || null; explicarAquecimentos(); });
      const modoAtual = () => ex.aquecimentoModo ?? (ex.aquecimento?.length > 0 ? 'manual' : 'auto');
      const lerEx = () => {
        ex.nome = campoNome.value.trim();
        titulo.textContent = ex.nome || 'Novo exercício';
        const a = numeroOuNulo(pMin.campo.value);
        const b = numeroOuNulo(pMax.campo.value);
        ex.faixa = a !== null && b !== null && b >= a ? { min: Math.round(a), max: Math.round(b) } : null;
        ex.series = Math.max(1, Math.min(10, Math.round(numeroOuNulo(pSeries.campo.value) ?? 3)));
        if (pDrops) ex.drops = Math.max(1, Math.min(4, Math.round(numeroOuNulo(pDrops.campo.value) ?? METODOS.drop.drops)));
        ex.nota = nota.value.trim();
        explicaCarga.textContent = a !== null && b !== null && b < a ? 'O máximo precisa ser maior que o mínimo.' : regra();
        musculoSel.options[0].textContent = `Pelo nome (${pelo()})`;
        explicarAquecimentos();
        atualizarTopo();
      };
      for (const c of [campoNome, nota]) {
        c.addEventListener('input', lerEx);
        c.addEventListener('keydown', (ev) => { if (ev.key === 'Enter') c.blur(); });
      }
      const escolher = (fazer) => { lerEx(); fazer(); redesenhar(); atualizarTopo(); };
      const metodoChips = chips(`metodo-${ex.id}`, 'Método', [['', 'Normal'], ...Object.entries(METODOS).map(([id, m]) => [id, m.nome])], ex.metodo ?? '', (v) => escolher(() => {
        ex.metodo = v || null;
        if (METODOS[ex.metodo]?.series) ex.series = METODOS[ex.metodo].series;
        ex.drops = ex.metodo === 'drop' ? METODOS.drop.drops : 0;
      }));
      const descansoChips = chips(`descanso-${ex.id}`, 'Descanso entre as séries', [[0, 'Pelo feeling'], ...DESCANSOS.map((seg) => [seg, relogio(seg)])], ex.descansoS ?? 0, (v) => escolher(() => { ex.descansoS = v || null; }));
      const aquecChips = chips(`aquec-${ex.id}`, 'Aquecimento', [['auto', 'Automático'], ['nenhum', 'Sem'], ['manual', 'Do meu jeito']], modoAtual(), (v) => escolher(() => {
        ex.aquecimentoModo = v;
        // Do meu jeito comeca do que o automatico faria hoje: e so ajustar.
        if (v === 'manual' && !(ex.aquecimento?.length > 0)) {
          const prev = previsaoDoAquecimento()[i];
          ex.aquecimento = (prev?.aquecerDegraus ?? []).map((d) => ({ carga: d.carga ?? 0, reps: d.reps }));
          if (ex.aquecimento.length === 0) ex.aquecimento = [{ carga: 0, reps: 10 }];
        }
      }));
      const degrausManuais = modoAtual() === 'manual' ? h('div', { class: 'ed-degraus' },
        (ex.aquecimento ?? []).map((d, j) => {
          const cargaD = h('input', { class: 'campo curto', inputmode: 'decimal', value: d.carga || '', placeholder: '0', 'aria-label': `Carga do degrau ${j + 1}` });
          const repsD = h('input', { class: 'campo curto', inputmode: 'numeric', value: d.reps || '', placeholder: '0', 'aria-label': `Repetições do degrau ${j + 1}` });
          const lerD = () => { ex.aquecimento[j] = { carga: numeroOuNulo(cargaD.value) ?? 0, reps: Math.round(numeroOuNulo(repsD.value) ?? 0) }; };
          cargaD.addEventListener('input', lerD);
          repsD.addEventListener('input', lerD);
          return h('div', { class: 'ed-degrau' }, h('span', { class: 'ed-degrau-n', texto: `${j + 1}º` }), repsD, h('span', { texto: 'reps com' }), cargaD, h('span', { texto: 'kg' }),
            h('button', { class: 'botao icone', 'aria-label': `Tirar o degrau ${j + 1}`, onclick: () => { ex.aquecimento.splice(j, 1); redesenhar(); } }, icone('fechar')));
        }),
        h('button', { class: 'botao texto', onclick: () => { ex.aquecimento = [...(ex.aquecimento ?? []), { carga: ex.aquecimento?.at(-1)?.carga ?? 0, reps: 8 }]; redesenhar(); }, texto: '+ Degrau' })) : null;
      const explicaAquec = h('p', { class: 'ed-explica' });
      explicadores[i] = () => {
        const prev = previsaoDoAquecimento()[i];
        const modo = modoAtual();
        if (modo === 'nenhum') { explicaAquec.textContent = 'Entra direto na primeira série.'; return; }
        if (modo === 'manual') { explicaAquec.textContent = (ex.aquecimento ?? []).some((d) => d.reps > 0) ? 'Os seus degraus valem em qualquer dia. Não contam na evolução.' : 'Sem degrau anotado: fica sem aquecimento.'; return; }
        const degraus = (prev?.aquecerDegraus ?? []).map((d) => (d.carga ? `${d.reps} reps com ${numeroBr(d.carga)} kg` : `${d.reps} reps com ${Math.round((d.fracao ?? 0) * 100)}%`));
        explicaAquec.textContent = degraus.length ? `Hoje seria: ${degraus.join(', depois ')}. Ajusta sozinho no dia.` : 'Hoje entra direto: o músculo já chega aquecido.';
      };
      explicaCarga.textContent = regra();
      const mover = (d) => {
        const j = i + d;
        if (j < 0 || j >= treino.exercicios.length) return;
        mudarLista(() => { [treino.exercicios[i], treino.exercicios[j]] = [treino.exercicios[j], treino.exercicios[i]]; });
        atualizarTopo();
      };
      const tirar = h('button', {
        class: 'botao texto perigo', onclick: (ev) => {
          if (ev.currentTarget.dataset.certeza !== 'sim') { ev.currentTarget.dataset.certeza = 'sim'; ev.currentTarget.textContent = 'Tocar de novo para tirar'; return; }
          mudarLista(() => { treino.exercicios.splice(i, 1); abertoId = null; });
          atualizarTopo();
        }, texto: 'Tirar exercício',
      });
      return h('div', { class: 'ed-ex', 'data-id': ex.id },
        h('button', { class: 'ed-ex-topo', type: 'button', 'aria-expanded': 'true', onclick: () => { lerEx(); mudarLista(() => { abertoId = null; }); atualizarTopo(); } },
          h('span', { class: 'ed-num', texto: numero }),
          titulo,
          h('span', { class: 'ed-pronto', texto: 'Pronto' })),
        secao('Nome', campoNome),
        secao('Séries e repetições',
          h('div', { class: 'ed-linha-num' }, h('span', { texto: rotuloSeries }), pSeries.el),
          h('div', { class: 'ed-linha-num em-pe' }, h('span', { texto: 'Repetições por série' }), h('div', { class: 'ed-faixa' }, pMin.el, h('span', { texto: 'a' }), pMax.el)),
          explicaCarga),
        secao('Execução', nota),
        secao('Método', metodoChips,
          h('p', { class: 'ed-explica', texto: METODOS[ex.metodo]?.resumo ?? 'Uma série de cada vez. Os outros métodos só se você quiser.' }),
          pDrops ? h('div', { class: 'ed-linha-num' }, h('span', { texto: 'Drops no fim' }), pDrops.el) : null),
        secao('Descanso entre as séries', descansoChips,
          h('p', { class: 'ed-explica', texto: ex.descansoS ? `Cronômetro de ${relogio(ex.descansoS)} depois de cada série.` : 'Sem cronômetro: você começa a próxima quando quiser.' })),
        secao('Aquecimento', aquecChips, degrausManuais, explicaAquec,
          modoAtual() === 'auto' ? h('label', { class: 'ed-sub' }, h('span', { texto: 'Músculo (para saber se já está aquecido)' }), musculoSel) : null),
        h('div', { class: 'ed-botoes' },
          h('div', { class: 'ed-mover' },
            h('button', { class: 'botao icone', 'aria-label': 'Subir na lista', disabled: i === 0 ? true : null, onclick: () => { lerEx(); mover(-1); } }, icone('cima')),
            h('button', { class: 'botao icone', 'aria-label': 'Descer na lista', disabled: i === treino.exercicios.length - 1 ? true : null, onclick: () => { lerEx(); mover(1); } }, icone('baixo'))),
          tirar));
    }));
    if (treino.exercicios.length === 0) {
      lista.replaceChildren(h('p', { class: 'ed-vazio', texto: `${NOMES_DOS_DIAS[treino.diaSemana]} ainda não tem treino. Toque em + Exercício para montar.` }));
    }
    requestAnimationFrame(() => { for (const grupo of lista.querySelectorAll('.ed-chips')) movimento.pilulaDosChips(grupo, grupo.dataset.chave); });
  }
  redesenhar();

  const folhaEd = folha('Editar treino', [
    h('div', { class: 'ed-palco' }, cenaHost, h('p', { class: 'ed-placar' }, placarEx, ' exercícios · ', placarSeries, ' séries')),
    h('div', { class: 'ed-grupo' },
      h('label', { class: 'ed-sub' }, h('span', { texto: 'Dia da semana' }), qualDia),
      h('label', { class: 'ed-sub' }, h('span', { texto: 'Nome do treino' }), nome)),
    h('h2', { class: 'secao', texto: 'Exercícios' }),
    h('p', { class: 'ed-dica', texto: 'Na ordem em que você faz. Toque num exercício para mudar.' }),
    lista,
    h('button', {
      class: 'botao cheio ed-novo', onclick: () => {
        const novo = { id: novoId(), nome: '', faixa: null, series: 3, metodo: null, drops: 0, descansoS: null, nota: '', aquecimento: [], aquecimentoModo: null, musculo: null, referencia: null };
        mudarLista(() => { treino.exercicios.push(novo); abertoId = novo.id; });
        atualizarTopo();
        const aberto = lista.querySelector('.ed-ex');
        aberto?.scrollIntoView({ block: 'start', behavior: 'smooth' });
        aberto?.querySelector('input')?.focus({ preventScroll: true });
      }, texto: '+ Exercício',
    }),
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
        treino.exercicios = treino.exercicios.filter((e) => e.nome !== '').map(({ aquecer, aquecerModo, aquecerDegraus, aquecerMotivo, grupo, composto, ...e }) => {
          const degrausOk = (e.aquecimento ?? []).filter((d) => d.reps > 0);
          return { ...e, aquecimento: degrausOk, aquecimentoModo: e.aquecimentoModo === 'manual' && degrausOk.length === 0 ? 'nenhum' : e.aquecimentoModo ?? null };
        });
        const dias = planoTreino().dias.filter((d) => d.id !== treino.id && d.diaSemana !== treino.diaSemana);
        // Dia sem nenhum exercicio e dia de descanso: nao grava um treino vazio.
        mudar((e) => definirConfig(e, 'treinoPlano', JSON.stringify({ dias: treino.exercicios.length > 0 ? [...dias, treino] : dias })));
        app.diaTreino = treino.diaSemana;
      },
    },
    aoFechar: () => { cenaDoEditor = null; cenaDaBarra?.foco(null); desenhar(); },
  });
  // Sempre na altura cheia: num dia vazio a folha nascia pela metade e pulava ao pôr o primeiro exercicio.
  folhaEd.classList.add('editor-treino');
  cenaDoEditor = { host: cenaHost, dados: dadosDoEditor, foco: () => abertoId };
  if (cenaFalhou) cenaHost.setAttribute('data-sem-3d', 'sim');
  garantirCena();
  atualizarTopo();
  movimento.editorAbriu(folhaEd);
}

function abrirAjustes() {
  const pend = Object.keys(app.estado.pendentes).length;
  const situacao = app.sync.estado === 'erro'
    ? app.sync.mensagem
    : pend > 0 ? `${pend} mudança(s) esperando para subir.` : 'Tudo sincronizado com o computador.';
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
    h('div', { class: 'cartao' },
      h('p', { class: 'pequeno', texto: 'Para usar como app: no Safari, Compartilhar → Adicionar à Tela de Início.' }),
      h('button', { class: 'botao texto perigo', style: 'margin-top:8px', onclick: sair, texto: 'Sair da conta neste iPhone' })),
    h('p', { class: 'pequeno', style: 'text-align:center', texto: 'Próximo Passo no iPhone · versão experimental 0.5' }),
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

function ligarDieta(tela) {
  const circulo = tela.querySelector('.anel .cheio');
  if (circulo) movimento.anel(circulo, Number(circulo.dataset.volta), Number(circulo.dataset.fracao));
  const numero = tela.querySelector('[data-anel-numero]');
  if (numero) movimento.contar(numero, 'dieta-kcal', Number(numero.dataset.anelNumero), n0);
  for (const i of tela.querySelectorAll('[data-macro]')) movimento.barraCresce(i, `macro-${i.dataset.macro}`, Number(i.dataset.fracao));
}

function telaDieta() {
  const { dia, resumo, pesoKg, pesos } = dietaDeHoje();
  const tela = h('main', { class: 'tela' }, cabeca('Dieta', dataPorExtenso(dia)));

  const raio = 58;
  const volta = 2 * Math.PI * raio;
  const fracao = Math.min(1, resumo.alvo.kcal > 0 ? resumo.consumido.kcal / resumo.alvo.kcal : 0);
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 132 132');
  svg.innerHTML = `<defs><linearGradient id="grad-marca" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#39e27a"/><stop offset="1" stop-color="#5bd4e4"/></linearGradient></defs>
    <circle class="trilho" cx="66" cy="66" r="${raio}"/><circle class="cheio" cx="66" cy="66" r="${raio}" stroke-dasharray="${volta}" stroke-dashoffset="${volta * (1 - fracao)}" data-volta="${volta}" data-fracao="${fracao}"/>`;
  const macro = (id, nome, cons, alvo, cor) => {
    const f = Math.min(1, alvo > 0 ? cons / alvo : 0);
    return h('div', { class: 'macro' },
      h('b', {}, n0(cons), h('small', { texto: `/${n0(alvo)} g` })),
      h('span', { texto: nome }),
      h('div', { class: 'trilho' }, h('i', { 'data-macro': id, 'data-fracao': String(f), style: `width:${f * 100}%;background:${cor}` })));
  };
  const faltam = Math.round(resumo.alvo.kcal - resumo.consumido.kcal);
  tela.append(h('section', { class: 'cartao dieta-resumo' },
    h('div', { class: 'anel', role: 'img', 'aria-label': `${n0(resumo.consumido.kcal)} de ${n0(resumo.alvo.kcal)} kcal` }, svg,
      h('div', { class: 'anel-texto' },
        h('b', { 'data-anel-numero': String(Math.round(resumo.consumido.kcal)) }),
        h('span', { texto: `de ${n0(resumo.alvo.kcal)} kcal` }),
        h('span', { class: 'anel-falta', texto: faltam > 0 ? `faltam ${n0(faltam)}` : faltam < 0 ? `${n0(-faltam)} acima` : 'no alvo' }))),
    h('div', { class: 'macros' },
      macro('p', 'Proteína', resumo.consumido.proteina, resumo.alvo.proteina, 'var(--tinta)'),
      macro('c', 'Carboidrato', resumo.consumido.carboidrato, resumo.alvo.carboidrato, 'var(--ciano)'),
      macro('g', 'Gordura', resumo.consumido.gordura, resumo.alvo.gordura, 'var(--laranja)'))));

  tela.append(h('h2', { class: 'secao', texto: 'Refeições do plano' }));
  for (const r of resumo.refeicoes) {
    const aberta = refeicaoAberta.has(r.habitoId) || r.proxima;
    const estado = r.feita ? h('span', { class: 'ref-estado feita' }, icone('check'), 'Feita')
      : r.pulada ? h('span', { class: 'ref-estado pulada', texto: 'Pulei' })
        : r.proxima ? h('span', { class: 'ref-estado proxima', texto: 'Próxima' })
          : h('span', { class: 'ref-kcal', texto: `${n0(r.totais.kcal)} kcal` });
    const cartao = h('section', { class: `cartao refeicao${r.feita ? ' feita' : ''}${r.pulada ? ' pulada' : ''}${r.proxima ? ' proxima-agora' : ''}` },
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
  const sessao = sessaoDe(dia);
  const treino = treinoAnotado(diaDaSemana(dia), sessao);
  const { resumo, pesoKg } = dietaDeHoje();
  return {
    agora: new Date().toLocaleString('pt-BR'),
    hoje: dataPorExtenso(dia),
    treinoDeHoje: treino === null ? 'descanso' : {
      nome: treino.nome,
      exercicios: treino.exercicios.map((ex) => {
        const u = ultimaVez(ex, sessoes, dia);
        return {
          nome: ex.nome, faixa: ex.faixa ?? `${faixaDe(ex).min}-${faixaDe(ex).max} (padrão)`, series: ex.series, nota: ex.nota || undefined,
          metodo: METODOS[ex.metodo] ? `${METODOS[ex.metodo].nome}: ${roteiro(ex).map((p) => p.rotulo).join(', ')}` : undefined,
          regraDaCarga: `sobe com ${regraDaCarga(ex)}`,
          ultimaVez: u ? `${u.dia ?? 'anotado'}: ${textoDasSeries(u.series)}` : null,
          sugestao: sugestao(ex, u).texto,
          feitoHoje: textoDasSeries(seriesDeTrabalho(sessao.exercicios[ex.id])) || null,
          aquecimento: { series: ex.aquecer ?? 0, porque: ex.aquecerMotivo ?? null, escolhidoNoPlano: ex.aquecimentoModo ?? 'auto' },
          musculo: MUSCULOS[ex.grupo] ?? ex.grupo,
          evolucao: (() => { const a = analiseDoExercicio(ex, sessoes, dia); return { chanceDeEvoluirHoje: a.chance ? `${a.chance.nivel} (${a.chance.motivo})` : null, recomendacao: a.recomendacao.texto, treinosSemRecorde: a.estagnado, tendencia: a.tendencia ? `${a.tendencia.direcao}, ${a.tendencia.kgSemana} kg/semana na força estimada` : null }; })(),
        };
      }),
    },
    cardioHoje: sessao.cardios,
    ultimosTreinos: sessoes.slice(0, 6).map((s) => ({
      dia: s.dia,
      treino: plano.dias.find((d) => d.id === s.treinoId)?.nome ?? null,
      series: Object.values(s.exercicios).flat().filter((x) => x.reps > 0 && x.t !== 'a').length,
      volumeKg: Math.round(volume(Object.values(s.exercicios).flat().filter((x) => x.reps > 0))),
      cardio: s.cardios,
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
