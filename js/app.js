// Proximo Passo no iPhone (04/11/2026): treino, dieta e o Garry, ligados ao
// app do computador pela mesma nuvem cifrada. Primeira versao, experimental.

import { codigoDeRecuperacao, criarCifra, deBase64, gerarSegredo, lerCodigoDeRecuperacao, paraBase64 } from './cifra.js';
import { entrar, ErroNuvem, inscrever, Nuvem, PROJETO } from './nuvem.js';
import { definirConfig, diaDaSemana, diaLogico, escrever, estadoVazio, podar, Sincronizador, somarDias, VERSAO_DOS_DADOS } from './dados.js';
import {
  completoNaSessao, FAIXA_PADRAO, INTENSIDADES_DO_CARDIO, resumoDoCardio, faixaDe, lerPlanoTreino, lerSessao, METODOS, NOMES_DOS_DIAS, novoId, planoDeHoje, quandoRelativo, regraDaCarga, relogio, DESCANSOS, treinoComAquecimento, MUSCULOS, grupoDoExercicio, analiseDoExercicio, seriesDeTrabalho, ajusteEntreSeries,
  gruposDeBiset, proximoNoBiset, passoDeCarga, progressao, resultadoDoExercicio, roteiro, planilhaSemanal, resumoDaSemana, trajetoriaDoExercicio, sessoesDoConfig, SIGLAS_DOS_DIAS, sugestao, textoDasSeries, treinoDoDia, ultimaVez, veredito, volume,
} from './treino.js';
import { guardarAlimentos, lerAlimentosSalvos, macrosDoItem, MEDIDAS, necessidadeDiaria, PLANO_PADRAO, PERFIL_PADRAO, resumoNutricional, textoDaMedida, validarPerfil, validarPlano } from './gerado/nutricao.js';
import {
  ATIVIDADES, buscarAlimentos, descricaoDaEscolha, escolhaDoItem, escolhaDoSalvo, estimarComIa, gravarItens, interpretarDieta, itemDoPlano, itemImportadoEm,
  itensDaRefeicao, lerAlimentoProprio, leituraDoPeso, lerRotulo, linhaDoConsumo, macrosDaEscolha, macrosNaQuantidade, novaRefeicao, OBJETIVOS, passoDe,
  pesosDoPeriodo, planoDaImportacao, prepararPlano, REFEICOES, SEXOS, tendenciaDoPeso, totalDoPlanoDe,
} from './dieta.js';
import { abrirChave, configDaIa, conversar } from './garry.js';
import * as movimento from './movimento.js';
import { cargaReps, h, icone, numeroBr, selo } from './dom.js';
import { abrirJogo, jogoAberto } from './jogo.js';
import { corresponder, interpretarTreino, LIMITES, notaDoImportado, paraPlano } from './importar.js';
import { lerBiblioteca, lerVideo, videoDoExercicio } from './execucao.js';

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

// Aparelho com dados de antes de uma versao nova dos dados: baixa tudo de novo uma vez (17/11/2026: os
// alimentos salvos do PC so chegam assim). O que mudou aqui e ainda nao subiu fica em pendentes e vence.
{
  const salvo = guardado.ler('estado', null);
  if (salvo && (salvo.versao ?? 1) < VERSAO_DOS_DADOS) guardado.gravar('estado', { ...salvo, versao: VERSAO_DOS_DADOS, cursor: 0 });
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
  recolhidos: new Set(), // exercicios abertos que a pessoa recolheu tocando no nome (o da vez tambem)
  efeito: null, // o que acabou de mudar e merece animar depois do proximo desenho
  // Entrada (11/11/2026, inscrever-se): 'criar' ou 'entrar'; e o passo depois do login sem chave no aparelho:
  // null = ver a nuvem, 'codigo' = pedir o codigo, 'erro' = a nuvem falhou (app.erroConta).
  modoEntrada: guardado.ler('sessao') ? 'entrar' : 'criar',
  passoConta: null,
  erroConta: '',
  codigoNovo: null, // o codigo da conta que acabou de nascer neste iPhone: aparece uma vez
};

const salvarEstado = () => guardado.gravar('estado', app.estado);
// A biblioteca de execucao (16/11/2026, execucao.js): a ultima baixada fica no aparelho para abrir sem internet.
let biblioteca = lerBiblioteca({ exercicios: guardado.ler('biblioteca', []) });

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

/**
 * Criar conta ou entrar (11/11/2026, "area de inscrever-se, como todos que vao usar o app nao tem o app do
 * PC"). Quem cria a conta aqui ganha a chave dos dados neste iPhone e o codigo de recuperacao nos Ajustes.
 * Quem ja tem conta (no computador ou noutro iPhone) entra e digita o codigo de la.
 */
function telaEntrar(erro = '') {
  const criando = app.modoEntrada === 'criar';
  const email = h('input', { class: 'campo', type: 'email', autocomplete: criando ? 'email' : 'username', inputmode: 'email', placeholder: 'seu@email.com', value: app.sessao?.email ?? '' });
  const senha = h('input', { class: 'campo', type: 'password', autocomplete: criando ? 'new-password' : 'current-password', placeholder: criando ? 'Pelo menos 6 caracteres' : 'Senha' });
  const repetir = criando ? h('input', { class: 'campo', type: 'password', autocomplete: 'new-password', placeholder: 'A mesma senha' }) : null;
  const msg = h('p', { class: 'erro', role: 'alert', texto: erro });
  const rotulo = criando ? 'Criar conta' : 'Entrar';
  const botao = h('button', { class: 'botao principal cheio', type: 'submit', texto: rotulo });
  const trocar = (modo) => { if (app.modoEntrada === modo) return; app.modoEntrada = modo; desenhar(); };
  const form = h('form', {
    onsubmit: async (ev) => {
      ev.preventDefault();
      msg.textContent = '';
      const e = email.value.trim();
      if (!e.includes('@')) { msg.textContent = 'Digite o seu e-mail.'; email.focus(); return; }
      if (criando && senha.value.length < 6) { msg.textContent = 'A senha precisa de pelo menos 6 caracteres.'; senha.focus(); return; }
      if (criando && senha.value !== repetir.value) { msg.textContent = 'As duas senhas não são iguais.'; repetir.focus(); return; }
      botao.disabled = true;
      botao.textContent = criando ? 'Criando…' : 'Entrando…';
      try {
        if (criando) {
          const sessao = await inscrever(e, senha.value, { projeto: projetoEmUso() });
          if (sessao === null) {
            app.modoEntrada = 'entrar';
            desenhar();
            raiz.querySelector('.erro').textContent = 'Conta criada. Abra o e-mail de confirmação e depois entre aqui.';
            return;
          }
          app.sessao = sessao;
        } else {
          app.sessao = await entrar(e, senha.value, { projeto: projetoEmUso() });
        }
        guardado.gravar('sessao', app.sessao);
        app.passoConta = null;
        desenhar();
      } catch (falha) {
        msg.textContent = falha.message;
        botao.disabled = false;
        botao.textContent = rotulo;
      }
    },
  },
  h('label', { class: 'rotulo', texto: 'E-mail' }), email,
  h('label', { class: 'rotulo', texto: 'Senha' }), senha,
  criando ? h('label', { class: 'rotulo', texto: 'Repita a senha' }) : null, repetir,
  msg, h('div', { style: 'height:16px' }), botao);
  return h('main', { class: 'entrada' },
    h('img', { class: 'marca', src: 'icone.png', alt: '' }),
    h('h1', { texto: 'Próximo Passo' }),
    h('div', { class: 'entrada-modos', role: 'group', 'aria-label': 'Criar conta ou entrar' },
      h('button', { type: 'button', class: 'entrada-modo', 'aria-pressed': String(criando), onclick: () => trocar('criar') }, 'Criar conta'),
      h('button', { type: 'button', class: 'entrada-modo', 'aria-pressed': String(!criando), onclick: () => trocar('entrar') }, 'Já tenho conta')),
    h('p', { class: 'discreto', texto: criando
      ? 'Treino e dieta no seu iPhone. Seus dados vão cifrados: só abrem com o código que fica nos Ajustes deste aparelho.'
      : 'Entre com a conta que você criou aqui ou no app do computador.' }),
    form);
}

/** Logo depois do login: conta nova (nuvem vazia) nasce aqui; conta com dados pede o codigo. */
let preparando = null;
function prepararConta() {
  if (preparando) return;
  preparando = (async () => {
    // Conta ligando agora (sem chave neste aparelho): os dados daqui comecam do zero. Sobra de outra conta
    // (outra pessoa no mesmo iPhone) nunca pode entrar nem subir cifrada com a chave nova.
    app.estado = estadoVazio();
    app.conversa = [];
    salvarEstado();
    guardado.gravar('conversa', null);
    // Aparelho novo para a nuvem: o recebimento pula as linhas do proprio aparelho, e quem saiu e entrou de
    // novo neste iPhone nunca mais via o que gravou daqui (11/11/2026).
    dispositivo = `iphone-${novoId()}`;
    guardado.gravar('dispositivo', dispositivo);
    const nuvem = new Nuvem({ projeto: projetoEmUso(), sessao: () => app.sessao, guardarSessao: (sessao) => { app.sessao = sessao; guardado.gravar('sessao', sessao); } });
    const temDados = (await nuvem.receber(0, 1)).length > 0;
    if (temDados) { app.passoConta = 'codigo'; return; }
    const segredo = gerarSegredo();
    guardado.gravar('segredo', paraBase64(segredo));
    await ligar();
    await app.sinc.criarNuvem();
    app.codigoNovo = codigoDeRecuperacao(segredo);
  })().catch((e) => {
    if (e instanceof ErroNuvem && e.tipo === 'login') { sair(); return; }
    guardado.gravar('segredo', null);
    app.sinc = null;
    app.passoConta = 'erro';
    app.erroConta = e instanceof ErroNuvem ? e.message : 'Não consegui preparar a conta agora.';
  }).finally(() => { preparando = null; desenhar(); });
}

function telaPreparando() {
  const erro = app.passoConta === 'erro';
  return h('main', { class: 'entrada' },
    h('img', { class: 'marca', src: 'icone.png', alt: '' }),
    h('h1', { texto: erro ? 'Não deu agora' : 'Preparando sua conta' }),
    h('p', { class: 'discreto', texto: erro ? app.erroConta : 'Conferindo a nuvem…' }),
    erro ? h('button', { class: 'botao principal cheio', onclick: () => { app.passoConta = null; desenhar(); }, texto: 'Tentar de novo' }) : null,
    h('button', { class: 'botao texto', style: 'margin:16px auto 0', onclick: sair, texto: 'Usar outra conta' }));
}

/** O codigo de recuperacao numa folha: ao criar a conta (uma vez) e pelos Ajustes. */
function mostrarCodigo(codigo, { novo = false } = {}) {
  const aviso = h('p', { class: 'pequeno', role: 'status' });
  folha(novo ? 'Sua conta está pronta' : 'Código de recuperação', [
    h('p', { class: 'codigo-explica', texto: novo
      ? 'Este é o seu código de recuperação. Ele abre os seus dados em outro aparelho (outro iPhone ou o app do computador). Guarde num lugar seguro: sem ele, os dados não abrem em outro lugar.'
      : 'Digite este código quando entrar com esta conta em outro aparelho (outro iPhone ou o app do computador). Não mostre para ninguém: ele abre os seus dados.' }),
    h('p', { class: 'codigo-caixa', 'aria-label': `Código: ${codigo.split('-').join(' ')}` }, ...codigo.split('-').map((g) => h('span', { texto: g }))),
    h('button', {
      class: 'botao principal cheio', onclick: async () => {
        try { await navigator.clipboard.writeText(codigo); aviso.textContent = 'Copiado.'; } catch { aviso.textContent = 'Não deu para copiar: anote à mão.'; }
      }, texto: 'Copiar o código',
    }),
    aviso,
    h('p', { class: 'pequeno', texto: 'Ele fica sempre em Ajustes > Código de recuperação.' }),
  ]);
}

function telaCodigo(erro = '') {
  const campo = h('textarea', { class: 'campo', rows: '3', autocapitalize: 'characters', autocomplete: 'off', spellcheck: 'false', placeholder: 'XXXX-XXXX-XXXX-…', style: 'padding:12px 14px;font-family:ui-monospace,monospace' });
  const msg = h('p', { class: 'erro', role: 'alert', texto: erro });
  const botao = h('button', { class: 'botao principal cheio', type: 'submit', texto: 'Continuar' });
  return h('main', { class: 'entrada' },
    h('img', { class: 'marca', src: 'icone.png', alt: '' }),
    h('h1', { texto: 'Código de recuperação' }),
    h('p', { class: 'discreto', texto: 'Esta conta já tem dados. Digite o código de 13 grupos: está em Ajustes > Código de recuperação no aparelho onde a conta foi criada (no app do computador, em Ajustes > Sincronização). Ele fica só neste iPhone.' }),
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
          if (!(await app.sinc.codigoConfere())) throw new Error('O código não abre os dados desta conta. Confira no outro aparelho.');
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
  const rolagemAntes = window.scrollY;
  movimento.novoDesenho();
  raiz.replaceChildren();
  if (app.sessao === null) { assinaturaDaTela = 'entrar'; raiz.append(telaEntrar()); movimento.telaDeEntrada(raiz.firstElementChild); return; }
  if (app.sinc === null) {
    assinaturaDaTela = 'conta';
    raiz.append(app.passoConta === 'codigo' ? telaCodigo() : telaPreparando());
    movimento.telaDeEntrada(raiz.firstElementChild);
    if (app.passoConta === null) prepararConta();
    return;
  }
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
  // A tela e refeita do zero: enquanto ela esta vazia o navegador encosta a rolagem no topo (17/11/2026,
  // "toda vez que eu clico para abrir um exercicio recolhido ele volta pro topo da pagina"). Devolve onde
  // a pessoa estava antes de pintar. Trocar de aba continua indo para o topo (o clique da aba rola depois).
  if (window.scrollY !== rolagemAntes) window.scrollTo(0, rolagemAntes);
  acertarBarra();
  atualizarPontoSync();
  // Entrada so ao trocar de aba ou de dia; marcar uma serie nao repete a tela inteira.
  const assinatura = `${app.aba}|${app.aba === 'treino' ? `${app.diaTreino}|${app.semana}` : ''}`;
  const entrou = assinatura !== assinaturaDaTela;
  // So o dia ou a semana mudou, dentro do treino: entrada leve (trocaLeve), nao a da tela inteira.
  const soODia = entrou && app.aba === 'treino' && assinaturaDaTela?.startsWith('treino|');
  assinaturaDaTela = assinatura;
  depoisDeMontar(tela, entrou);
  const direcao = direcaoDaSemana;
  if (direcaoDaSemana !== 0) { movimento.semanaMudou(tela.querySelector('.dias'), direcaoDaSemana); direcaoDaSemana = 0; }
  if (soODia) movimento.trocaLeve(tela, direcao);
  else if (entrou && app.aba !== 'garry') movimento.entrada(tela);
  if (app.codigoNovo) {
    const codigo = app.codigoNovo;
    app.codigoNovo = null;
    mostrarCodigo(codigo, { novo: true });
  }
}

function depoisDeMontar(tela, entrou) {
  if (app.aba === 'treino') ligarPalco(tela);
  if (app.aba === 'dieta') ligarDieta(tela);
  if (app.aba === 'garry' && !entrou) movimento.balaoNovo(tela.querySelector('.conversa > .balao:last-child'));
  const efeito = app.efeito;
  app.efeito = null;
  if (efeito === null) return;
  const cartao = efeito.ex ? tela.querySelector(`[data-ex="${CSS.escape(efeito.ex)}"]`) : null;
  if (cartao && efeito.fechou) movimento.cartaoFechou(cartao, efeito.altura, efeito.ficar ? null : tela.querySelector('.exercicio.atual'));
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
      h('p', { texto: 'Ainda não há treino aqui.' }),
      h('p', { class: 'discreto', texto: 'Monte o seu: os dias da semana e os exercícios de cada um. Se você usa o app do computador, o treino de lá chega sozinho.' }),
      h('button', { class: 'botao principal cheio', style: 'margin-top:10px', onclick: () => abrirEditor(semanaHoje), texto: 'Montar treino' }),
      h('button', { class: 'botao cheio imp-entrada', style: 'margin-top:8px', onclick: () => abrirImportacao() }, icone('ia'), 'Importar treino com IA (foto ou texto)')));
    // O cardio vale para todos, com ou sem treino montado (16/11/2026, "o cardio nao aparece para todos
    // os usuarios"): quem acabou de criar a conta pelo iPhone nao tem plano e ficava sem o cartao.
    vazia.append(cartaoCardio(sessaoDe(dia)));
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
        onclick: () => { if (app.diaTreino === ds) return; app.diaTreino = ds; desenharLogo(); },
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
        class: 'semana-rotulo', type: 'button', 'aria-label': app.semana === 0 ? `${nomeDaSemana}, ${datasDaSemana}. Ver a evolução por semana` : `${nomeDaSemana}, ${datasDaSemana}. Voltar para esta semana`,
        'data-agora': app.semana === 0 ? 'sim' : null, onclick: () => (app.semana === 0 ? abrirEvolucao() : voltarParaEstaSemana()),
      }, h('b', {}, nomeDaSemana, app.semana === 0 ? icone('grafico') : null), h('span', { texto: datasDaSemana })),
      h('button', { class: 'semana-seta', type: 'button', 'aria-label': 'Próxima semana', onclick: () => trocarSemana(1) }, icone('avancar'))),
    dias);
  ligarDeslizeDaSemana(dias);

  const dataDoDia = somarDias(segunda, app.diaTreino - 1);
  if (app.semana !== 0) return telaDeOutraSemana(plano, faixa, dataDoDia, dia);

  const sessao = sessaoDe(dia);
  const treino = treinoAnotado(app.diaTreino, sessao);
  const sessoes = sessoesDoConfig(app.estado.config);
  // O cardio e do DIA escolhido (11/11/2026, "eu adiciono que fiz 20 min e ele coloca na semana
  // inteira"): o cartao mostrava sempre o de hoje em qualquer dia da faixa. Cada dia mostra o seu
  // (16/11/2026: todo dia tem o cartao; o passado registra no proprio dia, o futuro so mostra). No domingo a faixa ja e a
  // semana que vem (hoje nao esta nela): o cartao de hoje fica, com o nome dizendo que e de hoje.
  const cardioDeHoje = dataDoDia === dia || semanaHoje === 0;
  const sessaoDoDia = dataDoDia === dia ? sessao : sessaoDe(dataDoDia);
  const sessaoDoCardio = cardioDeHoje ? sessao : sessaoDoDia;
  const cartaoDoCardio = () => cartaoCardio(sessaoDoCardio, { deHoje: cardioDeHoje && dataDoDia !== dia, futuro: !cardioDeHoje && dataDoDia > dia });
  const cardioNaBarra = cardioDaBarra(sessaoDoCardio);

  if (treino === null) {
    dadosDaBarra = { chave: `descanso-${app.diaTreino}`, placas: [], cardio: cardioNaBarra };
    const tela = h('main', { class: 'tela' }, barraNav(`${NOMES_DOS_DIAS[app.diaTreino]}: descanso`, null, editarODia()), faixa,
      h('section', { class: 'palco', 'aria-label': 'Descanso' },
        h('p', { class: 'palco-data', texto: dataPorExtenso(dataDoDia) }),
        h('h1', { class: 'titulo-grande', texto: 'Descanso' }),
        h('div', { class: 'palco-cena' }),
        h('p', { class: 'palco-nota', texto: 'Barra vazia hoje. Não há treino montado para este dia.' })));
    tela.append(h('button', { class: 'botao cheio botao-rodape', style: 'margin-bottom:12px', onclick: () => abrirEditor(app.diaTreino), texto: `Montar treino de ${NOMES_DOS_DIAS[app.diaTreino].toLowerCase()}` }));
    const cartao = cartaoDoCardio();
    if (cartao) tela.append(cartao);
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
  dadosDaBarra = { ...dadosDaBarraDe(treino, sessao, dia), cardio: cardioNaBarra };

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
  // Bi-set (17/11/2026): os cartoes do grupo ficam ligados, com a etiqueta em cima do primeiro.
  const grupos = gruposDeBiset(treino.exercicios);
  const porId = new Map(treino.exercicios.map((e) => [e.id, e]));
  treino.exercicios.forEach((ex, i) => {
    const g = grupos.get(ex.id);
    if (g && g.pos === 0) {
      tela.append(h('p', { class: 'biset-rotulo' }, h('b', { texto: g.nome }), h('span', { texto: `${g.ids.map((id) => porId.get(id)?.nome).join(' + ')} · uma série de cada, sem descanso entre eles` })));
    }
    const cartao = cartaoExercicio(ex, sessao, sessoes, dia, treino.id, i, ex.id === atual);
    if (g) cartao.classList.add('biset', g.pos === 0 ? 'biset-primeiro' : g.pos === g.ids.length - 1 ? 'biset-ultimo' : 'biset-meio');
    tela.append(cartao);
  });

  const cartao = cartaoDoCardio();
  if (cartao) tela.append(cartao);
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
let desenhoMarcado = false;
/** Desenha no proximo quadro; pedidos seguidos no mesmo quadro viram um desenho so. */
function desenharLogo() {
  if (desenhoMarcado) return;
  desenhoMarcado = true;
  requestAnimationFrame(() => { desenhoMarcado = false; desenhar(); });
}
function trocarSemana(d) {
  app.semana = Math.max(-52, Math.min(52, app.semana + d));
  direcaoDaSemana = d;
  desenharLogo();
}
function voltarParaEstaSemana() {
  if (app.semana === 0) return;
  const semanaHoje = diaDaSemana(hoje());
  direcaoDaSemana = app.semana < 0 ? 1 : -1;
  app.semana = 0;
  app.diaTreino = semanaHoje === 0 ? 1 : semanaHoje;
  desenhar();
}
/**
 * Arrastar os dias para o lado troca de semana, como as setas. A faixa segue o dedo (so transform,
 * no compositor); passou de 56 px, ela sai para o lado e a semana nova entra do outro. Antes nada
 * mexia ate soltar e a tela inteira era refeita no mesmo quadro: parecia travado (11/11/2026).
 */
function ligarDeslizeDaSemana(el) {
  let x0 = null;
  let y0 = null;
  let dx = 0;
  let lado = null; // 'x' quando o gesto e de lado; 'y' quando e rolagem
  const gs = () => window.gsap ?? null;
  const solto = () => { x0 = null; lado = null; };
  el.addEventListener('touchstart', (ev) => {
    x0 = ev.touches[0].clientX; y0 = ev.touches[0].clientY; dx = 0; lado = null;
    gs()?.killTweensOf(el);
  }, { passive: true });
  el.addEventListener('touchmove', (ev) => {
    if (x0 === null) return;
    dx = ev.touches[0].clientX - x0;
    const dy = ev.touches[0].clientY - y0;
    if (lado === null && Math.abs(dx) + Math.abs(dy) > 8) lado = Math.abs(dx) > Math.abs(dy) * 1.2 ? 'x' : 'y';
    if (lado !== 'x') return;
    // resistencia: anda menos que o dedo, como as listas do iPhone
    el.style.transform = `translate3d(${dx * 0.6}px,0,0)`;
    el.style.opacity = String(Math.max(0.35, 1 - Math.abs(dx) / 400));
  }, { passive: true });
  const soltar = () => {
    if (x0 === null) return;
    const foi = lado === 'x' && Math.abs(dx) > 56;
    const d = dx < 0 ? 1 : -1;
    solto();
    const g = gs();
    if (foi) {
      if (!g) { el.style.transform = ''; el.style.opacity = ''; trocarSemana(d); return; }
      // A troca nao espera o fim da animacao (com a pagina em segundo plano ela quase nao anda).
      g.to(el, { x: dx * 0.6 - d * 70, autoAlpha: 0, duration: 0.12, ease: 'power2.in' });
      setTimeout(() => trocarSemana(d), 120);
    } else if (el.style.transform) {
      if (!g) { el.style.transform = ''; el.style.opacity = ''; return; }
      g.to(el, { x: 0, autoAlpha: 1, duration: 0.25, ease: 'power3.out', clearProps: 'all' });
    }
  };
  el.addEventListener('touchend', soltar, { passive: true });
  el.addEventListener('touchcancel', soltar, { passive: true });
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
  tela.append(cartaoCardio(sessao, { futuro: !passado }));
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
const rotuloDoTirar = (ex) => (ex.metodo === 'myo' ? 'Tirar mini' : ex.metodo === 'restpause' ? 'Tirar pausa' : ex.metodo === 'drop' ? 'Tirar drop' : 'Tirar série');

/**
 * O cartao mostra o exercicio inteiro antes de comecar: cada serie com a base (a
 * ultima vez) e a meta de hoje. Tocar em "Comecar" ou numa serie abre a partida,
 * uma serie por tela (jogo.js). Depois de feita, a serie mostra o que foi feito e a
 * marca contra a base: subiu a carga, subiu as repeticoes, igual ou abaixo.
 */
/**
 * A dica do anel: o pedaco debaixo do dedo (ou do mouse) acende e mostra a serie. O anel comeca no alto e
 * anda no sentido do relogio, um pedaco por serie. Some 1,2 s depois de soltar.
 */
function ligarDicaDoAnel(caixa, dica, n, textoDe) {
  let some = null;
  const mostrar = (ev) => {
    const r = caixa.getBoundingClientRect();
    const dx = ev.clientX - (r.left + r.width / 2);
    const dy = ev.clientY - (r.top + r.height / 2);
    if (Math.hypot(dx, dy) < r.width * 0.22) { esconder(); return; }
    const graus = (Math.atan2(dx, -dy) * 180 / Math.PI + 360) % 360;
    const k = Math.min(n - 1, Math.floor(graus / (360 / n)));
    const texto = textoDe(k);
    if (!texto) return;
    clearTimeout(some);
    dica.textContent = texto;
    dica.dataset.visivel = 'sim';
    caixa.querySelectorAll('.pedaco, .enche').forEach((c) => c.classList.remove('foco'));
    caixa.querySelectorAll(`[data-k="${k}"]`).forEach((c) => c.classList.add('foco'));
  };
  const esconder = (atraso = 0) => {
    clearTimeout(some);
    some = setTimeout(() => {
      delete dica.dataset.visivel;
      caixa.querySelectorAll('.foco').forEach((c) => c.classList.remove('foco'));
    }, atraso);
  };
  caixa.addEventListener('pointerdown', (ev) => { caixa.setPointerCapture?.(ev.pointerId); mostrar(ev); });
  caixa.addEventListener('pointermove', (ev) => { if (ev.pointerType === 'mouse' || ev.buttons) mostrar(ev); });
  caixa.addEventListener('pointerup', () => esconder(1200));
  caixa.addEventListener('pointercancel', () => esconder(1200));
  caixa.addEventListener('pointerleave', (ev) => { if (ev.pointerType === 'mouse') esconder(300); });
}

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
        app.recolhidos.delete(ex.id);
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
  if (!completo && (app.recolhidos.has(ex.id) || (!atual && !app.abertos.has(ex.id)))) {
    const trabalho = plano.passos.filter((p) => !p.t);
    const cargaMeta = trabalho[0]?.alvo.carga ?? 0;
    cartao.classList.add('fechado', 'minimizado');
    cartao.append(h('button', {
      class: 'ex-resumo', 'aria-expanded': 'false',
      'aria-label': `${ex.nome}: ${trabalho.length} séries, meta ${kg(cargaMeta)}${analise.chance ? `, chance de evoluir hoje ${analise.chance.nivel}` : ''}. Abrir`,
      onclick: () => { app.efeito = { ex: ex.id, abriu: true, altura: cartao.offsetHeight }; app.abertos.add(ex.id); app.recolhidos.delete(ex.id); desenhar(); },
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

  // Tocar no nome recolhe o cartao (11/11/2026, "ao clicar no nome do exercicio ele minimizasse e se
  // clicasse de novo ele voltava"); a linha recolhida abre de novo. Fica no lugar (nao rola para o proximo).
  const recolher = () => {
    app.efeito = { ex: ex.id, fechou: true, ficar: true, altura: cartao.offsetHeight };
    app.abertos.delete(ex.id);
    app.recolhidos.add(ex.id);
    desenhar();
  };
  cartao.append(h('div', { class: 'ex-topo' },
    h('span', { class: 'ex-num', 'aria-hidden': 'true', texto: String(indice + 1).padStart(2, '0') }),
    h('h3', { class: 'ex-nome' }, h('button', { class: 'ex-nome-botao', type: 'button', 'aria-expanded': 'true', 'aria-label': `${ex.nome}: recolher`, onclick: recolher }, ex.nome, icone('cima'))),
    h('span', { class: `chip${ex.faixa ? '' : ' padrao'}`, title: ex.faixa ? null : 'Faixa padrão: dá para mudar em Editar treino', texto: `${faixa.min}–${faixa.max} reps` })));
  // O cartao como placar (17/11/2026). Pedidos: "ta muito cheio de informacao eu fico maluco", depois
  // "eu n disse pra voce acabar com tudo ... repaginada para que fique bem separado as coisas, e
  // facilmente legivel", e por fim "ta horrivel ... use skills threejs-webgl, core-3d-animation,
  // gsap-scrolltrigger e animation-components". Nada some; cada coisa ganha a sua forma:
  //  - etiquetas: execucao, metodo, video;
  //  - o placar: a carga de hoje em numero grande (CountUp) e o anel do quanto falta para a carga
  //    subir (o anel que se desenha), com a frase do plano e quando foi o treino anterior embaixo;
  //  - a leitura da evolucao numa faixa com a chance;
  //  - o aquecimento em degraus (pilulas), com o porque;
  //  - cada serie numa coluna: reps grandes, a carga, o treino anterior embaixo, o veredito quando feita.
  // As pecas entram em cascata pelo GSAP (movimento.placarEntrou); a barra 3D do topo ja acende o
  // exercicio da vez. Componentes React (Magic UI/React Bits) nao entram: o app nao usa React, so as ideias.
  const temVideo = videoDoExercicio(ex, biblioteca) !== null;
  const etiquetas = [
    ex.nota ? h('span', { class: 'ex-etq nota' }, h('small', { texto: 'Execução' }), h('span', { texto: ex.nota })) : null,
    metodo ? h('span', { class: 'ex-etq metodo' }, h('small', { texto: 'Método' }), h('span', { texto: metodo.nome })) : null,
    temVideo ? h('button', { class: 'ex-etq video', type: 'button', onclick: () => abrirExecucao(ex.id) }, icone('comecar'), h('span', { texto: 'Ver execução' })) : null,
  ].filter(Boolean);
  if (etiquetas.length) cartao.append(h('div', { class: 'ex-etiquetas' }, etiquetas));
  if (metodo) cartao.append(h('p', { class: 'ex-legenda', texto: metodo.resumo }));

  // O placar: a carga de hoje em numero grande, a frase do plano e quando foi o treino anterior.
  // O anel do quanto faltava saiu (17/11/2026, "o anel ele soma todas as reps e deixa extremamente
  // confuso ... se tem isso [a frase] voce ta misturando mt as coisas"): a frase ja diz o que fazer.
  const trabalho = plano.passos.map((p, i) => ({ p, i, f: lista[i] && lista[i].reps > 0 ? lista[i] : null })).filter((x) => x.p.t !== 'a');
  const cargaHoje = trabalho.find((x) => !x.p.t)?.p.alvo.carga ?? 0;
  const numeroCarga = h('b');
  movimento.contar(numeroCarga, `placar-carga-${ex.id}`, cargaHoje, (v) => numeroBr(Math.round(v * 10) / 10));
  // O anel volta com outro sentido (17/11/2026, "deixe o anel significando o progresso pra evoluir NO
  // EXERCICIO"; antes ele somava as reps que faltavam e confundia). Um pedaco por serie de trabalho: acende
  // quando a serie DE HOJE bate o topo da faixa (na piramide, a meta do degrau), que e o que faz a carga
  // subir. Todos acesos = carga liberada para o proximo treino. Embaixo, quantas bateram no treino anterior.
  // So as series que a regra conta: as do plano (serie a mais nao vira pedaco); no myo e no rest-pause, a
  // ativacao/serie principal. 10, 10, 11 = 3/3: o anel nunca passa de cheio.
  const deTrabalho = trabalho.filter((x) => !x.p.t).slice(0, ex.metodo === 'myo' || ex.metodo === 'restpause' ? 1 : ex.series);
  const topoDe = (k) => (ex.metodo === 'piramide' ? deTrabalho[k]?.p.alvo.reps ?? faixa.max : faixa.max);
  const noTopoHoje = deTrabalho.filter((x, k) => x.f && x.f.reps >= topoDe(k)).length;
  const n = Math.max(1, deTrabalho.length);
  const liberou = noTopoHoje >= n;
  const cargaNova = Math.round((cargaHoje + passoDeCarga(cargaHoje)) * 10) / 10;
  // Cada pedaco enche pelo quanto a serie de hoje chegou da meta (17/11/2026: "fez 9 de 10? O segmento
  // fica apagado, exatamente como se tivesse feito 0"): 9 de 10 = 90% do pedaco, em laranja; 10 ou mais
  // = cheio e verde (nunca passa de cheio); serie nao feita = vazio. Antes de comecar, tudo vazio.
  // O desenho (17/11/2026, "bugou TUDO": nao dava para saber qual pedaco era qual serie e as pontas
  // redondas invadiam o vizinho). Cada pedaco leva o numero da serie do lado de fora, as pontas sao retas e
  // ha um espaco claro entre eles. O anel comeca no alto e anda no sentido do relogio: 1, 2, 3...
  const centroXY = 48;
  const raio = 30;
  const volta = 2 * Math.PI * raio;
  const fresta = n > 1 ? 6 : 0;
  const pedaco = volta / n - fresta;
  const fracDe = (x, k) => (x.f ? Math.min(1, x.f.reps / topoDe(k)) : 0);
  const anelSvg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  anelSvg.setAttribute('viewBox', '0 0 96 96');
  anelSvg.setAttribute('class', 'placar-anel-svg');
  anelSvg.setAttribute('aria-hidden', 'true');
  const pecas = deTrabalho.slice(0, n).map((x, k) => {
    const inicio = -(k * volta) / n - fresta / 2;
    const fr = fracDe(x, k);
    const cheio = pedaco * fr;
    // A cor diz o quanto chegou (17/11/2026: 'variando as cores, so q o verde e o completo').
    const classe = !x.f ? 'vazio' : fr >= 1 ? 'aceso' : fr >= 0.8 ? 'perto' : fr >= 0.5 ? 'meio' : 'longe';
    const meio = ((k + 0.5) / n) * 2 * Math.PI;
    const lx = (centroXY + 42 * Math.sin(meio)).toFixed(1);
    const ly = (centroXY - 42 * Math.cos(meio)).toFixed(1);
    return {
      arcos: `<circle class="pedaco" data-k="${k}" cx="${centroXY}" cy="${centroXY}" r="${raio}" stroke-dasharray="${pedaco} ${volta - pedaco}" stroke-dashoffset="${inicio}"/>${cheio > 0 ? `<circle class="enche ${classe}" data-k="${k}" cx="${centroXY}" cy="${centroXY}" r="${raio}" stroke-dasharray="${cheio} ${volta - cheio}" stroke-dashoffset="${inicio}"/>` : ''}`,
      numero: `<text class="pedaco-n ${classe}" data-k="${k}" x="${lx}" y="${ly}">${k + 1}</text>`,
    };
  });
  // Sem os numeros 1, 2, 3 em volta (17/11/2026, pedido): so os pedacos. A janela corta a margem que eles usavam.
  anelSvg.setAttribute('viewBox', '12 12 72 72');
  anelSvg.innerHTML = `<g transform="rotate(-90 ${centroXY} ${centroXY})">${pecas.map((p) => p.arcos).join('')}</g>`;
  const centro = liberou
    ? h('span', { class: 'placar-anel-centro liberada' }, icone('liberada'))
    : h('span', { class: 'placar-anel-centro' }, h('b', {}, String(noTopoHoje), h('small', { class: 'de', texto: `/${n}` })));
  // Uma frase so dizendo quanto falta (as quatro pecas soltas "0/3", "todas com 10", "-> 60 kg" e
  // "antes: 1 de 3" nao diziam). A comparacao com a semana passada fica nos selos de cada coluna.
  const alvoTexto = ex.metodo === 'piramide' ? 'a meta' : String(faixa.max);
  const faltamSeries = n - noTopoHoje;
  // Todas as series feitas que ficaram abaixo da meta, nao so a ultima (17/11/2026: o texto se contradizia).
  const abaixo = deTrabalho.map((x, k) => ({ x, k })).filter(({ x, k }) => x.f && x.f.reps < topoDe(k));
  const fazer = noTopoHoje === 0 && !deTrabalho.some((x) => x.f)
    ? `Faça ${alvoTexto} nas ${n} séries`
    : `Falta${faltamSeries > 1 ? 'm' : ''} ${faltamSeries} ${faltamSeries > 1 ? 'séries' : 'série'} com ${alvoTexto}`;
  // Passar o dedo (ou o mouse) no anel mostra cada serie: '1a serie · 10 reps' (17/11/2026, pedido).
  const dica = h('span', { class: 'anel-dica', role: 'status', 'aria-live': 'polite' });
  const caixaDoAnel = h('div', { class: 'placar-anel-caixa' }, anelSvg, centro, dica);
  ligarDicaDoAnel(caixaDoAnel, dica, n, (k) => {
    const x = deTrabalho[k];
    if (!x) return null;
    const nome = `${k + 1}ª série`;
    if (!x.f) return `${nome} · meta ${topoDe(k)}`;
    return `${nome} · ${x.f.reps} ${x.f.reps === 1 ? 'rep' : 'reps'}${x.f.reps >= topoDe(k) ? ' ✓' : ` de ${topoDe(k)}`}`;
  });
  const anel = h('div', {
    class: 'placar-anel', 'data-liberou': liberou ? 'sim' : null,
    'aria-label': liberou ? `Todas as séries na meta: a carga sobe para ${kg(cargaNova)} no próximo treino` : `${noTopoHoje} de ${n} séries na meta. ${fazer} para a carga subir para ${kg(cargaNova)}`,
  },
  caixaDoAnel,
  h('span', { class: 'placar-anel-texto' }, liberou
    ? [h('b', { texto: 'Carga liberada' }), h('small', { texto: `próximo: ${kg(cargaNova)}` })]
    : [h('span', { texto: fazer }), h('b', { texto: kg(cargaNova) }),
      ...abaixo.map(({ x, k }) => h('small', { class: 'perto', texto: `${k + 1}ª série: faltou ${topoDe(k) - x.f.reps} ${topoDe(k) - x.f.reps === 1 ? 'rep' : 'reps'}` }))]));
  cartao.append(h('div', { class: 'placar-ex', 'data-tipo': plano.tipo },
    h('div', { class: 'placar-carga' },
      h('span', { class: 'placar-rotulo', texto: plano.tipo === 'subir' ? 'Carga nova hoje' : 'Carga de hoje' }),
      h('div', { class: 'placar-numero' }, numeroCarga, h('small', { texto: 'kg' })),
      h('p', { class: 'placar-frase', texto: plano.texto }),
      ultima ? h('p', { class: 'placar-quando', texto: `Treino anterior: ${quandoFoi(ultima)}` }) : null),
    anel));

  // A leitura da evolucao: a chance de evoluir hoje e o que fazer (analiseDoExercicio).
  if (validas.length === 0 && analise.recomendacao.tipo !== 'subir') {
    cartao.append(h('div', { class: 'ex-leitura', 'data-tipo': analise.recomendacao.tipo },
      analise.chance ? h('span', { class: 'chance', 'data-nivel': analise.chance.nivel, texto: CHANCE[analise.chance.nivel] }) : null,
      h('p', { texto: analise.recomendacao.texto })));
  }

  // O aquecimento em degraus.
  const aquec = plano.passos.map((p, i) => ({ p, i, f: lista[i] && lista[i].reps > 0 ? lista[i] : null })).filter((x) => x.p.t === 'a');
  if (aquec.length > 0) {
    const pulado = (x) => !x.f && (pulouAquecimento || validas.length > 0);
    cartao.append(h('div', { class: 'aquec-bloco' },
      h('div', { class: 'bloco-topo' }, h('span', { class: 'bloco-titulo', texto: 'Aquecimento' }), h('span', { class: 'bloco-dica', texto: 'não conta na evolução' })),
      h('div', { class: 'aquec-degraus' }, aquec.map((x, k) => h('button', {
        class: `aquec-degrau${x.f ? ' feito' : pulado(x) ? ' pulado' : ''}`, type: 'button', 'data-chave': `${ex.id}|${x.i}`,
        'aria-label': `${x.p.rotulo}: ${x.f ? `feito ${kg(x.f.carga)} vezes ${x.f.reps}` : pulado(x) ? 'pulado' : `${kg(x.p.alvo.carga)} vezes ${x.p.alvo.reps}`}`,
        onclick: () => jogar(ex.id, x.i),
      },
      h('span', { class: 'aquec-n', texto: x.f ? '✓' : String(k + 1) }),
      h('span', { class: 'aquec-valor' }, h('b', { texto: `${numeroBr((x.f ?? x.p.alvo).carga)} kg` }), h('span', { texto: `× ${(x.f ?? x.p.alvo).reps}` }))))),
      ex.aquecerMotivo && validas.length === 0 && !pulouAquecimento ? h('p', { class: 'bloco-legenda', texto: ex.aquecerMotivo }) : null));
  }

  // As series: uma coluna por serie que vale.
  const comparacao = (cmp) => (cmp === null ? h('span', { class: 'col-antes', texto: '1ª vez' })
    : cmp.tipo === 'igual' ? h('span', { class: 'col-vazio', 'aria-hidden': 'true' })
      : cmp.tipo === 'nova' ? h('span', { class: 'col-antes', texto: '1ª vez' }) : selo(cmp));
  const proxima = trabalho.find((x) => !x.f)?.i ?? -1;
  const coluna = ({ p: passo, i, f }) => {
    const v = f ? veredito(f, passo.base) : null;
    const mostra = f ?? passo.alvo;
    const ehDrop = passo.t === 'd';
    return h('button', {
      class: `${ehDrop ? 'col-drop' : 'col-serie'}${f ? ' feita' : ''}${i === proxima ? ' proxima' : ''}`, type: 'button', 'data-chave': `${ex.id}|${i}`, 'data-tipo': v?.tipo ?? null,
      'aria-label': f
        ? `${passo.rotulo}: feito ${kg(f.carga)} vezes ${f.reps}, ${v.tipo === 'nova' ? 'primeiro registro' : v.tipo === 'igual' ? 'igual ao treino anterior' : v.texto}. Corrigir`
        : `${passo.rotulo}: meta ${kg(passo.alvo.carga)} vezes ${passo.alvo.reps}, treino anterior ${passo.base ? `${kg(passo.base.carga)} vezes ${passo.base.reps}` : 'ainda não tem'}. Fazer agora`,
      onclick: () => jogar(ex.id, i),
    },
    h('span', { class: 'col-rotulo', texto: passo.tipo === 'serie' ? `Série ${passo.curto}` : passo.rotulo }),
    h('span', { class: 'col-reps' }, h('b', { texto: String(mostra.reps) }), h('small', { texto: 'reps' })),
    h('span', { class: 'col-carga', texto: `${numeroBr(mostra.carga)} kg` }),
    // Contra a mesma serie do treino anterior, no selo de seta (17/11/2026: 'quero q deixe nessa estrutura,
    // e quando manteve a rep deixa vazio e quando sobe aumenta'). Antes de fazer, compara a meta; depois, o
    // que foi feito. Igual = vazio. Sem treino anterior: '1ª vez'.
    // No drop (meia coluna) o selo e so o numero: '+1', '−2'. A cor diz se subiu ou caiu.
    ehDrop ? comparacaoCurta(f ? v : passo.base ? veredito(passo.alvo, passo.base) : null) : comparacao(f ? v : passo.base ? veredito(passo.alvo, passo.base) : null));
  };
  const comparacaoCurta = (cmp) => (!cmp || cmp.tipo === 'igual' || cmp.tipo === 'nova' ? null
    : h('span', { class: 'selo', 'data-tipo': cmp.tipo }, h('span', { texto: cmp.texto.replace(/ (reps?|kg)$/, '') })));
  // Os drops sao meio quadrado colado na serie que tem o drop (17/11/2026: 'quando for drop quero que seja
  // metade de um quadrado ligado a serie que tem drop'): a ultima serie e os drops viram um bloco so; com
  // mais de um drop, eles se empilham nessa metade.
  const series = trabalho.filter((x) => x.p.t !== 'd');
  const drops = trabalho.filter((x) => x.p.t === 'd');
  const blocos = series.map((x, k) => (k === series.length - 1 && drops.length > 0
    ? h('div', { class: 'col-grupo', role: 'group', 'aria-label': `${x.p.rotulo} com ${drops.length} ${drops.length === 1 ? 'drop' : 'drops'}` },
      coluna(x), h('div', { class: 'col-drops' }, drops.map(coluna)))
    : coluna(x)));
  cartao.append(h('div', { class: 'series-bloco' },
    h('div', { class: 'bloco-topo' }, h('span', { class: 'bloco-titulo', texto: 'Séries' }), ultima ? h('span', { class: 'bloco-dica', texto: `comparado com ${quandoFoi(ultima)}` }) : null),
    h('div', { class: 'colunas-series', role: 'group', 'aria-label': `Séries de ${ex.nome}` }, blocos)));
  movimento.placarEntrou(cartao, ex.id);

  const falta = plano.passos.findIndex((p, i) => !(lista[i] && lista[i].reps > 0) && !(p.t === 'a' && (pulouAquecimento || validas.length > 0)));
  if (falta !== -1 && !(completo && validas.length >= serieDeTrabalho)) {
    cartao.append(h('button', { class: `botao cheio comecar${atual ? ' principal' : ''}`, onclick: () => jogar(ex.id, null) },
      icone('comecar'), validas.length === 0 && plano.passos[falta].t === 'a' ? 'Começar pelo aquecimento' : validas.length === 0 && !lista.some((x) => x.reps > 0) ? 'Começar' : `Continuar: ${plano.passos[falta].rotulo}`));
  }
  // O "Adicionar serie" do cartao saiu (11/11/2026: "e pra remover esse adicionar serie, e inutil").
  // Serie a mais que ja existe (de antes, ou do "Mais uma serie" do fim do exercicio) ainda sai pelo
  // "Tirar serie", que so aparece quando ha uma. Com algo anotado nela, o primeiro toque so avisa.
  const aMais = lista.length - roteiro(ex).length;
  const ultimaAMais = aMais > 0 ? lista.at(-1) : null;
  cartao.append(h('div', { class: 'ex-acoes' },
    ultimaAMais ? h('button', {
      class: 'botao texto perigo', 'aria-label': `${rotuloDoTirar(ex)} a mais${aMais > 1 ? ' (a última)' : ''}`,
      onclick: (ev) => {
        if (ultimaAMais.reps > 0 && ev.currentTarget.dataset.certeza !== 'sim') {
          ev.currentTarget.dataset.certeza = 'sim';
          ev.currentTarget.textContent = `Apagar ${numeroBr(ultimaAMais.carga)} kg × ${ultimaAMais.reps}?`;
          return;
        }
        removerSerie(ex, treinoId);
        desenhar();
      },
      texto: rotuloDoTirar(ex),
    }) : null,
    // O 'Recolher' do fim do cartao saiu (17/11/2026, pedido); recolher continua tocando no nome.
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
    remover: () => removerSerie(ex, treino.id),
    noPlano: () => roteiro(ex).length,
    descansar: (segundos, rotulo, texto) => comecarDescanso(segundos, rotulo, texto, { exId: ex.id, dia: app.diaTreino }),
    pararDescanso,
    verExecucao: () => abrirExecucao(ex.id),
    // Bi-set (17/11/2026): depois de uma serie, para qual exercicio do grupo ir e se ha descanso antes.
    // `aindaTemAqui`: se este exercicio ainda tem serie depois da que acabou (a do momento pode nao estar gravada).
    grupoBiset: gruposDeBiset(treino.exercicios).get(ex.id) ?? null,
    biset: (aindaTemAqui) => {
      const grupo = gruposDeBiset(treino.exercicios).get(ex.id);
      if (!grupo) return null;
      const s = sessaoDe(hoje());
      const porId = new Map(treino.exercicios.map((e) => [e.id, e]));
      const r = proximoNoBiset(grupo, ex.id, (id) => (id === ex.id ? aindaTemAqui : !completoNaSessao(porId.get(id), s)));
      if (!r || r.id === ex.id) return r ? { ...r, mesmo: true } : null;
      // O descanso do grupo: o primeiro que tiver um definido no Editar treino.
      const descansoS = grupo.ids.map((id) => porId.get(id)?.descansoS).find((v) => v) ?? null;
      return { ...r, descansoS, partida: () => partidaDe(r.id, null), nome: porId.get(r.id)?.nome ?? '' };
    },
    temVideo: () => videoDoExercicio(exercicioDoPlano(ex.id) ?? ex, biblioteca) !== null,
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
    if (descanso) { document.body.append(descanso.el); descanso.tique(); }
    if (mudou && completoNaSessao(ex, sessaoDe(hoje()))) app.abertos.delete(ex.id);
    desenhar();
    if (mudou) {
      document.querySelector('.exercicio.atual')?.scrollIntoView({ block: 'center', behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
    }
  });
  // Um descanso que ja corria (voltou pela pilula ou abriu outro exercicio) entra na partida com ela.
  if (descanso) { jogoAberto()?.descansoHost.append(descanso.el); descanso.tique(); }
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

/** Tira a ultima serie das que passaram do plano (as do plano nunca saem). Devolve se tirou. */
function removerSerie(ex, treinoId) {
  const s = sessaoDe(hoje());
  const lista = s.exercicios[ex.id] ?? [];
  if (lista.length <= roteiro(ex).length) return false;
  lista.pop();
  s.exercicios[ex.id] = lista;
  s.treinoId = treinoId;
  gravarSessao(s);
  return true;
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

// Todo dia tem o seu cartao (16/11/2026, "o cardio literalmente ta sumindo de alguns dias"): antes so
// hoje e os dias passados COM cardio tinham; dia passado sem registro e os dias da frente ficavam sem
// nada. Agora: hoje e dias passados registram e editam no proprio dia (esqueceu de anotar ontem? da);
// dia que vem mostra o cartao, mas so registra quando chegar.
function cartaoCardio(sessao, { futuro = false, deHoje = false } = {}) {
  const soLeitura = futuro;
  const lista = sessao.cardios ?? [];
  const total = minutosDeCardio(sessao);
  const kcal = lista.reduce((n, c) => n + (c.kcal ?? 0), 0);
  const meta = metaDoCardio();
  const fracao = fracaoDoCardio(sessao);
  const chave = `cardio-${sessao.dia}`;

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
    ? (futuro ? 'Extra: você registra no dia.' : sessao.dia < hoje() ? 'Nada registrado neste dia.' : 'Extra: registre só se fizer.')
    : [meta ? (total >= meta ? `meta de ${meta} min batida` : `faltam ${n0(meta - total)} min da meta`) : null, kcal > 0 ? `${n0(kcal)} kcal` : null, lista.length > 1 ? `${lista.length} registros` : null].filter(Boolean).join(' · ') || (lista[0].tipo || 'Cardio');
  const nomeDaIntensidade = (c) => (c.intensidade ? INTENSIDADES_DO_CARDIO[c.intensidade] : null);
  return h('section', { class: 'cartao cartao-cardio', 'aria-label': 'Cardio', 'data-feito': total > 0 ? 'sim' : null },
    h('div', { class: 'cardio-topo' },
      h('div', { class: 'cardio-anel', 'aria-hidden': 'true' }, svg, icone('cardio')),
      h('div', { class: 'cardio-titulo' },
        h('p', { class: 'ex-nome', texto: deHoje ? 'Cardio de hoje' : 'Cardio' }),
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
        : h('button', { class: 'cardio-item', type: 'button', 'aria-label': `${c.tipo || 'Cardio'}, ${n0(c.minutos)} minutos${info ? `, ${info}` : ''}. Editar`, onclick: () => abrirCardio(c.id, sessao.dia) }, dentro));
    })),
    soLeitura ? null : h('button', { class: 'botao cheio cardio-mais', type: 'button', onclick: () => abrirCardio(null, sessao.dia) },
      icone('mais'), lista.length === 0 ? (sessao.dia < hoje() ? 'Adicionar cardio neste dia' : 'Adicionar cardio') : 'Adicionar outro cardio'));
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

/** Registrar um cardio novo (id null) ou mudar um que ja esta no dia (hoje, ou um dia que passou). */
function abrirCardio(id, dia = hoje()) {
  const sessao = sessaoDe(dia);
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
      const s = sessaoDe(dia);
      s.cardios = (s.cardios ?? []).filter((c) => c.id !== antigo.id);
      gravarSessao(s);
      d.close();
    }, texto: 'Tirar este cardio',
  }) : null;

  const d = folha(`${antigo ? 'Editar cardio' : 'Adicionar cardio'}${dia !== hoje() ? ` · ${dataCurta(dia)}` : ''}`, [
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
        const s = sessaoDe(dia);
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

// A ilha do descanso (16/11/2026). Pedido: "a regra do cronometro ta zoada, nao tem pausa, e tem que
// ser tipo a ilha do iphone e melhor apresentavel pro usuario". Uma pilula preta no topo, como a
// Dynamic Island com uma Atividade ao Vivo: o anel que esvazia, o nome e o tempo. Tocar abre a ilha
// com Pausar/Retomar, -15 s, +15 s, Pular e (fora da serie) Voltar para a serie. Dentro da serie ela
// fica logo abaixo do topo; fora, presa no alto da tela.
// O tempo e guardado no aparelho: o iPhone pode fechar o app em segundo plano e o descanso volta de
// onde estava ao abrir de novo.
function comecarDescanso(segundos, rotulo = 'Descanso', texto = '', de = null) {
  montarDescanso({ fim: Date.now() + segundos * 1000, total: segundos * 1000, pausadoResta: null, rotulo, texto, de, apitos: 0 });
}

function montarDescanso(estado) {
  pararDescanso();
  const s = estado;
  const el = h('div', { class: 'ilha', role: 'timer', 'aria-live': 'off', 'data-aberta': 'nao' });
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('class', 'ilha-anel');
  svg.setAttribute('aria-hidden', 'true');
  svg.innerHTML = '<circle cx="12" cy="12" r="9" pathLength="1" class="ilha-anel-fundo"/><circle cx="12" cy="12" r="9" pathLength="1" class="ilha-anel-cheio"/>';
  const cheio = svg.querySelector('.ilha-anel-cheio');
  const nomeEl = h('span', { class: 'ilha-nome' });
  const tempo = h('b', { class: 'ilha-tempo' });
  const textoEl = h('p', { class: 'ilha-texto' });
  const pausa = h('button', { class: 'ilha-botao ilha-pausa', type: 'button', onclick: () => alternarPausa() });
  const menos = h('button', { class: 'ilha-botao', type: 'button', 'aria-label': 'Menos 15 segundos', onclick: () => somar(-15) }, '−15');
  const mais = h('button', { class: 'ilha-botao', type: 'button', 'aria-label': 'Mais 15 segundos', onclick: () => somar(15) }, '+15');
  const pular = h('button', { class: 'ilha-botao ilha-pular', type: 'button', onclick: pararDescanso, texto: 'Pular' });
  const voltar = h('button', { class: 'ilha-voltar', type: 'button', onclick: () => { fechar(); voltarAoPendente(s.de); } }, 'Voltar para a série', icone('seguir'));
  const topo = h('button', { class: 'ilha-topo', type: 'button', 'aria-expanded': 'false', onclick: () => (el.dataset.aberta === 'sim' ? fechar() : abrir()) },
    svg, nomeEl, tempo);
  el.append(topo, h('div', { class: 'ilha-corpo' }, h('div', { class: 'ilha-dentro' }, textoEl, h('div', { class: 'ilha-botoes' }, menos, pausa, mais, pular), voltar)));

  const fmt = (seg) => `${Math.floor(seg / 60)}:${String(seg % 60).padStart(2, '0')}`;
  const resta = () => (s.pausadoResta ?? (s.fim - Date.now()));
  const guardar = () => guardado.gravar('descanso', { fim: s.fim, total: s.total, pausadoResta: s.pausadoResta, rotulo: s.rotulo, texto: s.texto, de: s.de, apitos: s.apitos });
  let fecharDepois = null;
  function abrir() { el.dataset.aberta = 'sim'; topo.setAttribute('aria-expanded', 'true'); clearTimeout(fecharDepois); }
  function fechar() { el.dataset.aberta = 'nao'; topo.setAttribute('aria-expanded', 'false'); clearTimeout(fecharDepois); }
  function alternarPausa() {
    if (s.pausadoResta === null) s.pausadoResta = Math.max(0, s.fim - Date.now());
    else { s.fim = Date.now() + s.pausadoResta; s.pausadoResta = null; }
    guardar();
    tique();
  }
  function somar(seg) {
    if (s.pausadoResta !== null) s.pausadoResta = Math.max(0, s.pausadoResta + seg * 1000);
    else s.fim = (seg > 0 ? Math.max(Date.now(), s.fim) : s.fim) + seg * 1000;
    s.total = Math.max(1000, s.total + seg * 1000);
    if (resta() > 0) s.apitos = 0;
    guardar();
    tique();
  }
  function tique() {
    const r = resta();
    const pausado = s.pausadoResta !== null;
    el.dataset.pausado = pausado ? 'sim' : 'nao';
    pausa.replaceChildren(icone(pausado ? 'comecar' : 'pausa'), pausado ? 'Retomar' : 'Pausar');
    pausa.setAttribute('aria-pressed', pausado ? 'true' : 'false');
    cheio.style.strokeDashoffset = String(1 - Math.max(0, Math.min(1, r / s.total)));
    voltar.hidden = jogoAberto() !== null || !s.de;
    if (r <= 0) {
      const passou = Math.floor(-r / 1000);
      el.dataset.passou = 'sim';
      tempo.textContent = `+${fmt(passou)}`;
      nomeEl.textContent = 'Passou do descanso';
      textoEl.textContent = `Combinado: ${fmt(Math.round(s.total / 1000))}. Pode começar a próxima série.`;
      const devidos = 1 + Math.floor(passou / 30);
      if (s.apitos < devidos) { s.apitos = devidos; guardar(); apito(); }
      return;
    }
    delete el.dataset.passou;
    tempo.textContent = fmt(Math.ceil(r / 1000));
    nomeEl.textContent = pausado ? 'Pausado' : s.rotulo;
    textoEl.textContent = s.texto || (pausado ? 'O descanso está parado. Toque em Retomar.' : 'Respire. A próxima série começa quando o tempo acabar.');
  }
  el.dataset.rotulo = s.rotulo;
  // Com a partida aberta, a ilha fica dentro dela, abaixo do topo; fechou, sobe para o alto da tela.
  (jogoAberto()?.descansoHost ?? document.body).append(el);
  // Tocar fora da ilha aberta fecha ela, como no iPhone.
  const foraDaIlha = (ev) => { if (el.dataset.aberta === 'sim' && !el.contains(ev.target)) fechar(); };
  document.addEventListener('pointerdown', foraDaIlha, true);
  descanso = { el, relogio: setInterval(tique, 250), tique, soltar: () => document.removeEventListener('pointerdown', foraDaIlha, true) };
  guardar();
  tique();
  // Nasce aberta por um instante, como a ilha do iPhone quando uma atividade comeca.
  abrir();
  fecharDepois = setTimeout(fechar, 2600);
}
function pararDescanso() {
  if (descanso === null) return;
  if (descanso.relogio) clearInterval(descanso.relogio);
  descanso.soltar?.();
  descanso.el.remove();
  descanso = null;
  guardado.gravar('descanso', null);
}
/** O descanso que estava correndo quando o app fechou volta (ate 15 min depois de acabar). */
function retomarDescanso() {
  const g = guardado.ler('descanso');
  if (!g || typeof g.total !== 'number' || typeof g.fim !== 'number') return;
  if (g.pausadoResta === null && Date.now() - g.fim > 15 * 60_000) { guardado.gravar('descanso', null); return; }
  montarDescanso({ ...g, pausadoResta: typeof g.pausadoResta === 'number' ? g.pausadoResta : null, apitos: Number(g.apitos) || 0 });
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

// ---------- execucao: o video de como fazer (16/11/2026) ----------
// Pedido: "ao usuario clicar em execucao, mostrar um video de como a serie e feita ... pode ser
// configurado pelo usuario OU se existir a serie q eu fiz como referencia". O link da pessoa vence;
// sem ele, o da biblioteca com o nome parecido (videoDoExercicio). As contas moram em execucao.js.

async function carregarBiblioteca() {
  try {
    const r = await fetch('biblioteca.json', { cache: 'no-cache' });
    if (!r.ok) return;
    const lista = lerBiblioteca(await r.json());
    const mudou = JSON.stringify(lista) !== JSON.stringify(biblioteca);
    biblioteca = lista;
    guardado.gravar('biblioteca', lista);
    if (mudou && app.cifra !== null && !document.querySelector('dialog[open]')) desenhar();
  } catch {
    // sem internet: vale a guardada
  }
}

/** O exercicio como esta gravado no plano (com o link do video), pelo id. */
function exercicioDoPlano(id) {
  for (const d of planoTreino().dias) for (const e of d.exercicios) if (e.id === id) return e;
  return null;
}

/** Grava (ou tira, com '') o link do video do exercicio, mexendo so nele no plano gravado. */
function gravarVideo(exId, url) {
  let bruto;
  try {
    bruto = JSON.parse(app.estado.config.treinoPlano ?? '{"dias":[]}');
  } catch {
    return false;
  }
  let achou = false;
  for (const d of bruto?.dias ?? []) for (const e of d?.exercicios ?? []) if (e?.id === exId) { e.video = url; achou = true; }
  if (achou) mudar((e) => definirConfig(e, 'treinoPlano', JSON.stringify(bruto)));
  return achou;
}

/** O player do video: dentro do app quando da (YouTube, Vimeo, Instagram, TikTok, arquivo), senao o link. */
function playerDoVideo(v) {
  if (v.tipo === 'arquivo') {
    const video = h('video', { class: 'exec-player', src: v.url, controls: true, playsinline: true, loop: true, muted: true, autoplay: true, preload: 'metadata' });
    video.muted = true;
    return video;
  }
  if (v.embed) {
    return h('iframe', {
      class: `exec-player${v.tipo === 'instagram' || v.tipo === 'tiktok' ? ' em-pe' : ''}`, src: v.embed, title: 'Vídeo da execução',
      allow: 'autoplay; encrypted-media; picture-in-picture; fullscreen', allowfullscreen: true, referrerpolicy: 'strict-origin-when-cross-origin',
    });
  }
  return h('a', { class: 'botao cheio exec-abrir', href: v.url, target: '_blank', rel: 'noopener' }, icone('comecar'), 'Abrir o vídeo');
}

const ORIGEM_DO_VIDEO = { youtube: 'YouTube', vimeo: 'Vimeo', instagram: 'Instagram', tiktok: 'TikTok', arquivo: 'o navegador', link: 'o navegador' };

function abrirExecucao(exId) {
  const inicial = exercicioDoPlano(exId);
  if (inicial === null) return;
  const corpo = h('div', { class: 'exec' });
  const desenharExec = () => {
    const ex = exercicioDoPlano(exId) ?? inicial;
    const v = videoDoExercicio(ex, biblioteca);
    const campo = h('input', { class: 'campo', type: 'url', inputmode: 'url', autocomplete: 'off', autocapitalize: 'off', spellcheck: 'false', enterkeyhint: 'done', value: ex.video, placeholder: 'https://youtube.com/…', 'aria-label': 'Link do vídeo da execução' });
    const aviso = h('p', { class: 'ed-explica', role: 'status' });
    const salvar = () => {
      const url = campo.value.trim();
      if (url !== '' && lerVideo(url) === null) { aviso.textContent = 'Use o link completo, começando com https://'; movimento.nega(campo); return; }
      if (url === ex.video) return;
      gravarVideo(exId, url);
      desenharExec();
    };
    campo.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); salvar(); } });
    corpo.replaceChildren(
      v ? h('div', { class: 'exec-video' }, playerDoVideo(v.video)) : h('div', { class: 'exec-vazio' },
        icone('comecar'),
        h('b', { texto: 'Ainda não há vídeo deste exercício' }),
        h('p', { texto: 'Cole abaixo o link de um vídeo mostrando a execução: YouTube, Instagram, TikTok ou Vimeo.' })),
      v ? h('p', { class: 'exec-origem' },
        h('span', { class: 'chip', texto: v.origem === 'seu' ? 'Seu vídeo' : 'Da biblioteca' }),
        v.origem === 'biblioteca' && v.nome.toLowerCase() !== ex.nome.toLowerCase() ? h('span', { texto: `de “${v.nome}”` }) : null,
        v.video.embed ? h('a', { href: v.video.url, target: '_blank', rel: 'noopener', texto: `Abrir no ${ORIGEM_DO_VIDEO[v.video.tipo]}` }) : null) : null,
      ex.nota ? h('div', { class: 'cartao exec-nota' }, h('span', { class: 'jogo-rotulo', texto: 'Como fazer' }), h('p', { texto: ex.nota })) : null,
      h('div', { class: 'cartao exec-link' },
        h('label', { class: 'ed-sub' }, h('span', { texto: ex.video ? 'Seu link' : v?.origem === 'biblioteca' ? 'Prefere outro vídeo? Cole o seu link' : 'Link do vídeo' }), campo),
        aviso,
        h('div', { class: 'exec-botoes' },
          ex.video ? h('button', { class: 'botao texto perigo', type: 'button', onclick: () => { gravarVideo(exId, ''); desenharExec(); }, texto: 'Tirar meu vídeo' }) : h('span'),
          h('button', { class: 'botao principal', type: 'button', onclick: salvar, texto: 'Salvar link' }))));
  };
  desenharExec();
  folha(`Execução: ${inicial.nome}`, [corpo], { aoFechar: () => { if (!jogoAberto()) desenhar(); } }).classList.add('folha-exec');
}

// ---------- evolucao por semana e trajetoria (11/11/2026) ----------
// Pedido: "ao clicar no esta semana quero uma planilha de evolucao do treino ao longo de cada
// semana" e "se for no historico a trajetoria do exercicio especifico". As contas sao puras
// (planilhaSemanal, resumoDaSemana, trajetoriaDoExercicio em treino.js); aqui so a tela.
// As colunas sao 3D (evolucao3d.js, carregado na hora); sem WebGL viram barras simples.

const fmtVolume = (kg) => (kg >= 1000 ? `${numeroBr(kg / 1000)} t` : `${Math.round(kg)} kg`);
const METRICAS = [
  { id: 'volume', nome: 'Volume', fmt: fmtVolume },
  { id: 'series', nome: 'Séries', fmt: (n) => String(n) },
  { id: 'treinos', nome: 'Treinos', fmt: (n) => String(n) },
];
const diaMes = (d) => `${Number(d.slice(8))}/${Number(d.slice(5, 7))}`;
const ICONE_DELTA = { sobe: 'subir', cai: 'descer', igual: 'igual' };
const TEXTO_DELTA = { sobe: 'mais forte que a vez anterior', cai: 'mais fraca que a vez anterior', igual: 'igual à vez anterior' };

function comparacaoDaSemana(rotulo, agora, antes, fmt) {
  const tipo = agora > antes ? 'sobe' : agora < antes ? 'cai' : 'igual';
  return h('div', { class: 'evo-numero', 'data-delta': tipo },
    h('b', { texto: fmt(agora) }),
    h('span', { class: 'evo-rotulo', texto: rotulo }),
    h('span', { class: 'evo-delta' }, icone(ICONE_DELTA[tipo]), `${fmt(antes)} antes`));
}

function abrirEvolucao({ foco = null } = {}) {
  const plano = planoTreino();
  const sessoes = sessoesDoConfig(app.estado.config);
  const dia = hoje();
  const { semanas, linhas } = planilhaSemanal(plano, sessoes, dia, 8);
  const resumo = resumoDaSemana(sessoes, dia);
  const exPorId = new Map(plano.dias.flatMap((d) => d.exercicios.map((e) => [e.id, e])));
  let metrica = 'volume';
  let colunas = null;
  let escolhida = null;
  let fechada = false;

  // ----- o topo: esta semana contra o mesmo trecho da passada -----
  const ate = resumo.ateODia >= 6 ? 'a semana inteira' : `até ${NOMES_DOS_DIAS[(resumo.ateODia + 1) % 7].toLowerCase()}`;
  const topo = h('section', { class: 'evo-topo', 'aria-label': 'Esta semana' },
    h('p', { class: 'pequeno', texto: `Esta semana, ${ate}, contra o mesmo trecho da passada` }),
    h('div', { class: 'evo-numeros' },
      comparacaoDaSemana('treinos', resumo.agora.treinos, resumo.antes.treinos, String),
      comparacaoDaSemana('séries', resumo.agora.series, resumo.antes.series, String),
      comparacaoDaSemana('volume', resumo.agora.volume, resumo.antes.volume, fmtVolume)));

  // ----- as colunas 3D, uma por semana -----
  const palco = h('div', { class: 'evo-palco' });
  const legendas = h('div', { class: 'evo-legendas', role: 'group', 'aria-label': 'Semanas' });
  const chips = h('div', { class: 'evo-chips', role: 'group', 'aria-label': 'O que medir' });
  const desenharChips = () => chips.replaceChildren(...METRICAS.map((m) => h('button', {
    class: 'evo-chip', type: 'button', 'aria-pressed': String(m.id === metrica),
    onclick: () => { if (m.id === metrica) return; metrica = m.id; desenharChips(); desenharLegendas(); colunas?.mudar(valores()); barrasSem3d(); },
  }, m.nome)));
  const valores = () => semanas.map((s) => s[metrica]);
  const desenharLegendas = () => {
    const m = METRICAS.find((x) => x.id === metrica);
    legendas.replaceChildren(...semanas.map((s, i) => h('button', {
      class: 'evo-legenda', type: 'button', 'aria-pressed': String(escolhida === i), 'data-atual': s.atual ? 'sim' : null,
      'aria-label': `${s.atual ? 'Esta semana' : `Semana de ${s.rotulo}`}: ${m.fmt(s[metrica])} de ${m.nome.toLowerCase()}${s.recordes ? `, ${s.recordes} ${s.recordes === 1 ? 'recorde' : 'recordes'}` : ''}`,
      onclick: () => escolherSemana(escolhida === i ? null : i),
    },
    h('b', { texto: s[metrica] > 0 ? m.fmt(s[metrica]) : '—' }),
    h('span', { texto: s.atual ? 'Esta' : diaMes(s.inicio) }),
    s.recordes ? h('i', { class: 'evo-rec', 'aria-hidden': 'true', texto: `★${s.recordes > 1 ? s.recordes : ''}` }) : null)));
  };
  // Sem WebGL: barras simples no mesmo lugar.
  const barrasSem3d = () => {
    if (palco.dataset.sem3d !== 'sim') return;
    const max = Math.max(...valores(), 1);
    palco.replaceChildren(...valores().map((v, i) => h('i', { class: 'evo-barra', 'data-atual': semanas[i].atual ? 'sim' : null, style: `height:${Math.max(3, (v / max) * 100)}%` })));
  };

  // ----- a planilha: melhor serie de cada exercicio em cada semana -----
  const cabeca = h('div', { class: 'pl-linha pl-cabeca', role: 'row' },
    h('span', { class: 'pl-nome', role: 'columnheader', texto: 'Exercício' }),
    semanas.map((s, i) => h('span', { class: 'pl-celula', role: 'columnheader', 'data-col': String(i), 'data-atual': s.atual ? 'sim' : null, texto: s.atual ? 'Esta' : diaMes(s.inicio) })));
  const corpo = [];
  let grupo = null;
  for (const l of linhas) {
    if (l.treino !== grupo) {
      grupo = l.treino;
      corpo.push(h('div', { class: 'pl-grupo', role: 'row' }, h('span', { role: 'rowheader', texto: grupo })));
    }
    const temAlgo = l.celulas.some((c) => c !== null);
    corpo.push(h('div', { class: 'pl-linha', role: 'row', 'data-ex': l.id, 'data-vazia': temAlgo ? null : 'sim' },
      h('button', { class: 'pl-nome', role: 'rowheader', type: 'button', 'aria-label': `${l.nome}: ver a trajetória`, onclick: () => abrirHistorico(exPorId.get(l.id)) }, h('span', { texto: l.nome }), icone('avancar')),
      l.celulas.map((c, i) => (c === null
        ? h('span', { class: 'pl-celula vazia', role: 'cell', 'data-col': String(i), 'aria-label': 'não treinou', texto: '—' })
        : h('span', {
          class: 'pl-celula', role: 'cell', 'data-col': String(i), 'data-delta': c.delta, 'data-recorde': c.recorde ? 'sim' : null,
          'aria-label': `${cargaRepsTexto(c)}${c.recorde ? ', recorde' : c.delta ? `, ${TEXTO_DELTA[c.delta]}` : ', primeira vez'}`,
        },
        h('b', { texto: `${numeroBr(c.carga)}×${c.reps}` }),
        c.recorde ? h('i', { class: 'pl-rec', 'aria-hidden': 'true', texto: '★' }) : c.delta ? h('i', { class: 'pl-seta', 'aria-hidden': 'true' }, icone(ICONE_DELTA[c.delta])) : null)))));
  }
  const tabela = h('div', { class: 'planilha', role: 'table', 'aria-label': 'Melhor série de cada exercício, por semana', style: `--colunas:${semanas.length}` }, cabeca, corpo);
  const rolagem = h('div', { class: 'planilha-rolagem' }, tabela);

  function escolherSemana(i) {
    escolhida = i;
    colunas?.destacar(i);
    desenharLegendas();
    tabela.dataset.escolhida = i === null ? '' : String(i);
    for (const el of tabela.querySelectorAll('[data-col]')) el.toggleAttribute('data-escolhida', i !== null && el.dataset.col === String(i));
    if (i !== null) {
      const alvo = cabeca.querySelector(`[data-col="${i}"]`);
      if (alvo) rolagem.scrollTo({ left: alvo.offsetLeft - rolagem.clientWidth / 2 + alvo.offsetWidth / 2, behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth' });
    }
  }

  desenharChips();
  desenharLegendas();
  const vazio = !semanas.some((s) => s.treinos > 0);
  const d = folha('Evolução por semana', [
    topo,
    h('section', { class: 'cartao evo-cartao', 'aria-label': 'Semana a semana' },
      h('div', { class: 'evo-cabeca' }, h('h3', { class: 'secao-titulo', texto: 'Semana a semana' }), chips),
      palco, legendas,
      h('p', { class: 'discreto pequeno', texto: vazio ? 'Ainda sem treino registrado nestas 8 semanas.' : 'Toque numa semana para ver a coluna dela na planilha. ★ = semana com recorde.' })),
    h('section', { class: 'cartao evo-cartao', 'aria-label': 'Planilha' },
      h('h3', { class: 'secao-titulo', texto: 'Planilha' }),
      h('p', { class: 'discreto pequeno', texto: 'A melhor série de cada exercício na semana (kg × reps), contra a vez anterior: ' },
        h('span', { class: 'pl-leg', 'data-delta': 'sobe' }, icone('subir'), 'mais forte '),
        h('span', { class: 'pl-leg', 'data-delta': 'igual' }, icone('igual'), 'igual '),
        h('span', { class: 'pl-leg', 'data-delta': 'cai' }, icone('descer'), 'mais fraca '),
        h('span', { class: 'pl-leg', 'data-recorde': 'sim' }, '★ recorde'), '. Toque no exercício para ver a trajetória.'),
      rolagem),
  ], { aoFechar: () => { fechada = true; colunas?.destruir(); colunas = null; } });
  d.classList.add('folha-evolucao');

  // Quatro semanas cabem certinho ao lado do nome; a de agora a vista (a planilha comeca no fim).
  const nomeLargura = rolagem.clientWidth < 360 ? 112 : 128;
  const coluna = Math.floor((rolagem.clientWidth - nomeLargura) / 4);
  tabela.style.setProperty('--nome', `${nomeLargura}px`);
  tabela.style.setProperty('--col', `${coluna}px`);
  rolagem.style.setProperty('--nome-largura', `${nomeLargura}px`);
  rolagem.scrollLeft = rolagem.scrollWidth;
  movimento.evolucaoAbriu(d);
  // depois de a folha abrir (a rolagem pedida durante a abertura se perde)
  if (foco) setTimeout(() => { if (d.open) focarLinhaDaPlanilha(d, foco); }, 380);
  // As colunas 3D depois do primeiro quadro (a folha ja tem tamanho); falhou, barras simples.
  requestAnimationFrame(() => {
    import('./evolucao3d.js')
      .then((m) => { if (!fechada) colunas = m.criarColunas(palco, valores(), semanas.length - 1); })
      .catch(() => { palco.dataset.sem3d = 'sim'; barrasSem3d(); });
  });
}

const cargaRepsTexto = (s) => `${numeroBr(s.carga)} quilos vezes ${s.reps}`;

/** A trajetoria do exercicio: a forca estimada de cada treino, numa linha que se desenha. */
function cartaoTrajetoria(ex, sessoes) {
  const pontos = trajetoriaDoExercicio(ex, sessoes);
  if (pontos.length === 0) return null;
  const legenda = h('p', { class: 'traj-legenda', 'aria-live': 'polite' });
  const descrever = (p) => `${dataCurta(p.dia)} · ${numeroBr(p.carga)} kg × ${Math.round(p.reps / Math.max(1, p.series))}${p.series > 1 ? ` (${p.series} séries)` : ''} · força ${numeroBr(p.forca)} kg${p.recorde ? ' · recorde' : p.subiuCarga ? ' · subiu a carga' : ''}`;
  const analise = analiseDoExercicio(ex, sessoes, '9999-12-31');
  const primeiro = pontos[0];
  const ultimo = pontos.at(-1);
  const mudou = ultimo.forca - primeiro.forca;
  const resumo = pontos.length < 2
    ? 'Um treino registrado: a linha começa no próximo.'
    : analise.tendencia
      ? `${analise.tendencia.direcao === 'sobe' ? 'Subindo' : analise.tendencia.direcao === 'cai' ? 'Caindo' : 'Estável'}: ${analise.tendencia.kgSemana > 0 ? '+' : ''}${numeroBr(analise.tendencia.kgSemana)} kg por semana na força estimada.`
      : `De ${numeroBr(primeiro.forca)} para ${numeroBr(ultimo.forca)} kg (${mudou >= 0 ? '+' : ''}${numeroBr(mudou)}) em ${pontos.length} treinos.`;

  // ----- o desenho (SVG; mesma escala de tempo: dia sem treino e espaco) -----
  const W = 340;
  const H = 170;
  const M = { l: 36, r: 14, t: 16, b: 26 };
  const ns = 'http://www.w3.org/2000/svg';
  const s = (tag, attrs = {}) => { const el = document.createElementNS(ns, tag); for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, String(v)); return el; };
  const t0 = Date.parse(primeiro.dia);
  const t1 = Date.parse(ultimo.dia);
  const vMin = Math.min(...pontos.map((p) => p.forca));
  const vMax = Math.max(...pontos.map((p) => p.forca));
  const folga = Math.max(1, (vMax - vMin) * 0.15);
  const lo = vMin - folga;
  const hi = vMax + folga;
  const x = (p) => (pontos.length === 1 ? (W + M.l - M.r) / 2 : M.l + ((Date.parse(p.dia) - t0) / Math.max(1, t1 - t0)) * (W - M.l - M.r));
  const y = (v) => M.t + (1 - (v - lo) / (hi - lo)) * (H - M.t - M.b);
  const svg = s('svg', { viewBox: `0 0 ${W} ${H}`, class: 'traj-svg', role: 'img', 'aria-label': `Trajetória da força estimada de ${ex.nome}: ${resumo}` });
  const idGrad = `traj-${Math.random().toString(36).slice(2, 8)}`;
  const defs = s('defs');
  const grad = s('linearGradient', { id: idGrad, x1: 0, y1: 0, x2: 0, y2: 1 });
  grad.append(s('stop', { offset: '0%', 'stop-color': '#39e27a', 'stop-opacity': 0.32 }), s('stop', { offset: '100%', 'stop-color': '#39e27a', 'stop-opacity': 0 }));
  defs.append(grad);
  svg.append(defs);
  for (const v of [lo + (hi - lo) * 0.15, (lo + hi) / 2, hi - (hi - lo) * 0.15]) {
    svg.append(s('line', { x1: M.l, x2: W - M.r, y1: y(v), y2: y(v), class: 'traj-grade' }));
    const rot = s('text', { x: M.l - 6, y: y(v) + 4, class: 'traj-eixo', 'text-anchor': 'end' });
    rot.textContent = String(Math.round(v));
    svg.append(rot);
  }
  for (const [p, ancora] of [[primeiro, 'start'], ...(pontos.length > 1 ? [[ultimo, 'end']] : [])]) {
    const t = s('text', { x: x(p), y: H - 6, class: 'traj-eixo', 'text-anchor': ancora });
    t.textContent = dataCurta(p.dia);
    svg.append(t);
  }
  if (pontos.length > 1) {
    const caminho = pontos.map((p, i) => `${i === 0 ? 'M' : 'L'}${x(p).toFixed(1)},${y(p.forca).toFixed(1)}`).join(' ');
    svg.append(s('path', { d: `${caminho} L${x(ultimo).toFixed(1)},${H - M.b} L${x(primeiro).toFixed(1)},${H - M.b} Z`, fill: `url(#${idGrad})`, class: 'traj-area' }));
    svg.append(s('path', { d: caminho, class: 'traj-linha', pathLength: 1 }));
  }
  const bolinhas = pontos.map((p, i) => {
    const c = s('circle', { cx: x(p), cy: y(p.forca), r: p.recorde ? 6 : 4.5, class: 'traj-ponto', 'data-recorde': p.recorde ? 'sim' : 'nao', 'data-subiu': p.subiuCarga ? 'sim' : 'nao', tabindex: 0, role: 'button', 'aria-label': descrever(p) });
    c.addEventListener('click', () => escolher(i));
    c.addEventListener('keydown', (ev) => { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); escolher(i); } });
    svg.append(c);
    return c;
  });
  function escolher(i) {
    bolinhas.forEach((b, k) => b.classList.toggle('escolhido', k === i));
    legenda.textContent = descrever(pontos[i]);
  }
  escolher(pontos.length - 1);

  const cartao = h('div', { class: 'cartao traj' },
    h('div', { class: 'traj-cabeca' }, h('p', { class: 'pequeno', texto: 'Trajetória · força estimada' }), h('b', { class: 'traj-numero', texto: `${numeroBr(ultimo.forca)} kg` })),
    h('p', { class: 'traj-resumo', texto: resumo }),
    svg,
    legenda,
    h('p', { class: 'discreto pequeno', texto: 'Força estimada = quanto você levantaria uma vez, pela melhor série do treino (fórmula de Epley). Ponto azul: subiu a carga. Ponto com anel: recorde.' }));
  requestAnimationFrame(() => movimento.trajetoriaEntrou(svg));
  return cartao;
}

/** Acende a linha do exercicio na planilha da evolucao e a traz para o meio da folha. */
function focarLinhaDaPlanilha(folhaEvolucao, exId) {
  const linha = folhaEvolucao.querySelector(`.pl-linha[data-ex="${CSS.escape(exId)}"]`);
  if (!linha) return;
  for (const outra of folhaEvolucao.querySelectorAll('.pl-linha.pl-foco')) outra.classList.remove('pl-foco');
  linha.classList.add('pl-foco');
  linha.scrollIntoView({ block: 'center', behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth' });
  movimento.linhaAcesa(linha);
}

const NOME_DA_SEMANA = (s, i, total) => (s.atual ? 'Esta semana' : i === total - 2 ? 'Semana passada' : s.rotulo);

/**
 * O historico conectado com "Esta semana" (11/11/2026, "historico fica centralizado e mostra o historico
 * CONECTADO (COM ESTA SEMANA), aproveita a funcao que ja tem"): a mesma conta da planilha da evolucao
 * (planilhaSemanal), so a linha deste exercicio, da semana de agora para tras. Leva para a evolucao.
 */
function cartaoSemanaASemana(ex, todas) {
  const { semanas, linhas } = planilhaSemanal(planoTreino(), todas, hoje(), 8);
  const linha = linhas.find((l) => l.id === ex.id);
  if (!linha) return null;
  const primeira = linha.celulas.findIndex((c) => c !== null);
  if (primeira === -1) return null;
  const itens = [];
  for (let i = semanas.length - 1; i >= primeira; i -= 1) {
    const s = semanas[i];
    const c = linha.celulas[i];
    const marca = c === null ? null
      : c.recorde ? h('span', { class: 'sem-marca', 'data-recorde': 'sim', texto: '★ recorde' })
        : c.delta ? h('span', { class: 'sem-marca', 'data-delta': c.delta }, icone(ICONE_DELTA[c.delta]), c.delta === 'sobe' ? 'mais forte' : c.delta === 'cai' ? 'mais fraca' : 'igual')
          : h('span', { class: 'sem-marca', texto: 'primeira vez' });
    itens.push(h('li', { class: 'sem-item', 'data-atual': s.atual ? 'sim' : null, 'data-vazia': c === null ? 'sim' : null },
      h('span', { class: 'sem-nome' }, h('b', { texto: NOME_DA_SEMANA(s, i, semanas.length) }), s.atual || i === semanas.length - 2 ? h('small', { texto: s.rotulo }) : null),
      c === null
        ? h('span', { class: 'sem-serie vazia', texto: s.atual ? 'ainda não treinou' : 'não treinou' })
        : h('span', { class: 'sem-serie' }, h('b', { texto: `${numeroBr(c.carga)} × ${c.reps}` }), h('small', { texto: `${c.series} ${c.series === 1 ? 'série' : 'séries'}` })),
      marca ?? h('span')));
  }
  const abrirNaEvolucao = () => {
    // Veio da evolucao (folha embaixo): volta para ela, na linha deste exercicio. Senao, abre a evolucao.
    const embaixo = document.querySelector('dialog.folha-evolucao[open]');
    const aqui = [...document.querySelectorAll('dialog.folha[open]')].at(-1);
    if (embaixo && aqui && aqui !== embaixo) { aqui.close(); focarLinhaDaPlanilha(embaixo, ex.id); return; }
    aqui?.close();
    abrirEvolucao({ foco: ex.id });
  };
  return h('section', { class: 'cartao sem-cartao', 'aria-label': 'Semana a semana' },
    h('p', { class: 'pequeno', texto: 'Semana a semana · melhor série de cada semana' }),
    h('ul', { class: 'sem-lista' }, itens),
    h('button', { class: 'botao texto sem-ir', type: 'button', onclick: abrirNaEvolucao }, icone('grafico'), 'Ver com os outros exercícios'));
}

function abrirHistorico(ex) {
  const todas = sessoesDoConfig(app.estado.config);
  const linhas = todas
    .map((s) => ({ dia: s.dia, series: seriesDeTrabalho(s.exercicios[ex.id]) }))
    .filter((s) => s.series.length > 0)
    .slice(0, 15);
  const melhor = linhas.flatMap((l) => l.series).reduce((m, s) => (m === null || s.carga > m.carga || (s.carga === m.carga && s.reps > m.reps) ? s : m), null);
  folha(ex.nome, [
    cartaoTrajetoria(ex, todas),
    cartaoSemanaASemana(ex, todas),
    melhor ? h('div', { class: 'cartao' }, h('p', { class: 'pequeno', texto: 'Melhor série' }), h('p', { class: 'ex-nome' }, cargaReps(melhor.carga, melhor.reps))) : null,
    linhas.length === 0
      ? h('p', { class: 'discreto', texto: ex.referencia ? `Ainda sem treino registrado aqui. Anotado: ${textoDasSeries(ex.referencia.reps.map((reps) => ({ carga: ex.referencia.carga, reps })))}` : 'Ainda sem treino registrado.' })
      : h('div', { class: 'cartao' }, h('p', { class: 'pequeno', texto: 'Cada treino' }), h('ul', { class: 'lista-simples historico' }, linhas.map((l, i) => {
        // contra o treino anterior do mesmo exercicio: subiu a carga, as repeticoes, igual ou abaixo
        const antes = linhas[i + 1] ?? null;
        const r = antes ? resultadoDoExercicio(ex, l.series, antes) : null;
        return h('li', {}, h('span', { texto: dataCurta(l.dia) }), h('span', { texto: textoDasSeries(l.series) }), selo(r) ?? h('span', { class: 'pequeno', texto: 'primeiro' }));
      }))),
  ]);
}

// ---------- importar treino com IA (11/11/2026) ----------
// Montar treino -> Importar com IA -> Imagem ou Texto -> Interpretar -> Revisar -> Salvar. As regras
// (o que a IA pode devolver, a correspondencia com os exercicios da pessoa e o plano novo) estao em
// importar.js; aqui so a tela. Nada e salvo sem o toque em "Salvar"; salvar usa o mesmo caminho do
// Editar treino (`treinoPlano` pela sincronizacao).

let ultimaLeitura = null; // { assinatura, resultado }: a mesma entrada nao vai duas vezes para a IA

async function prepararImagem(arquivo) {
  if (!String(arquivo.type).startsWith('image/')) throw new Error(`"${arquivo.name || 'arquivo'}" não é uma imagem.`);
  if (arquivo.size > LIMITES.bytesPorImagem) throw new Error(`"${arquivo.name || 'imagem'}" passa de 15 MB. Mande um print ou uma foto menor.`);
  let bitmap;
  try {
    bitmap = await createImageBitmap(arquivo);
  } catch {
    throw new Error(`Não consegui abrir "${arquivo.name || 'a imagem'}". Tente um print ou uma foto em JPG ou PNG.`);
  }
  // A IA le bem ate ~1600 px; maior so pesa no envio (e a cota cobra por tamanho).
  const escala = Math.min(1, LIMITES.ladoMaximo / Math.max(bitmap.width, bitmap.height));
  const tela = document.createElement('canvas');
  tela.width = Math.max(1, Math.round(bitmap.width * escala));
  tela.height = Math.max(1, Math.round(bitmap.height * escala));
  tela.getContext('2d').drawImage(bitmap, 0, 0, tela.width, tela.height);
  bitmap.close?.();
  return { url: tela.toDataURL('image/jpeg', 0.85), nome: arquivo.name || 'imagem' };
}

const lerNumeros = (t) => String(t).split(/[\/;,\s]+/).map((p) => Number(p.replace(',', '.').replace(/[^0-9.]/g, ''))).filter((n) => Number.isFinite(n) && n > 0);
const textoDasCargas = (cargas) => ((cargas ?? []).filter((c) => c !== null).length === 0 ? '' : [...new Set(cargas.filter((c) => c !== null))].length === 1 ? numeroBr(cargas.find((c) => c !== null)) : cargas.map((c) => (c === null ? '?' : numeroBr(c))).join('/'));
const textoDoAquecimento = (a) => (a ?? []).map((x) => `${numeroBr(x.carga)}×${x.reps}`).join(', ');
function lerAquecimento(t) {
  return String(t).split(/[,;]+/).map((p) => p.match(/(\d+(?:[.,]\d+)?)\s*(?:kg)?\s*[x×*]\s*(\d+)/i)).filter(Boolean)
    .map((m) => ({ carga: Number(m[1].replace(',', '.')), reps: Number(m[2]) })).filter((a) => a.reps > 0 && a.reps <= 100 && a.carga >= 0 && a.carga <= 1000);
}

/** O que a IA leu, pronto para revisar: cada exercicio ja olha se e um que a pessoa tem. */
function paraRevisar(lido) {
  const existentes = planoTreino().dias.flatMap((d) => d.exercicios.map((e) => ({ id: e.id, nome: e.nome, dia: d.nome })));
  return {
    modelo: lido.modelo,
    aviso: lido.problema,
    dias: lido.dias.map((d) => ({
      ...d,
      exercicios: d.exercicios.map((x) => {
        const achado = corresponder(x.nome, existentes);
        return { ...x, nota: notaDoImportado(x), usarId: achado?.ex.id ?? null, achado, existentes };
      }),
    })),
  };
}

function abrirImportacao() {
  const cfg = configDaIa(app.estado.config);
  const est = { modo: 'imagem', imagens: [], texto: '', lendo: false, erro: '', revisao: null };
  const corpo = h('div', { class: 'imp' });
  const d = folha('Importar treino com IA', [corpo]);
  d.classList.add('folha-importar');

  const adicionarArquivos = async (lista) => {
    const arquivos = [...lista].filter((a) => a && a.size !== undefined);
    if (arquivos.length === 0) return;
    est.erro = '';
    for (const a of arquivos) {
      if (est.imagens.length >= LIMITES.imagens) { est.erro = `Até ${LIMITES.imagens} imagens de uma vez.`; break; }
      try {
        est.imagens.push(await prepararImagem(a));
      } catch (e) {
        est.erro = e.message;
      }
    }
    est.modo = 'imagem';
    desenharImportacao();
  };
  // Colar imagem (Ctrl+V no computador, "Colar" no iPhone) e arrastar e soltar em qualquer lugar da folha.
  d.addEventListener('paste', (ev) => {
    if (est.revisao || est.lendo) return;
    const arquivos = [...(ev.clipboardData?.items ?? [])].filter((i) => i.kind === 'file' && i.type.startsWith('image/')).map((i) => i.getAsFile());
    if (arquivos.length === 0) return;
    ev.preventDefault();
    adicionarArquivos(arquivos);
  });
  d.addEventListener('dragover', (ev) => { if (!est.revisao && !est.lendo) { ev.preventDefault(); corpo.dataset.solta = 'sim'; } });
  d.addEventListener('dragleave', () => { delete corpo.dataset.solta; });
  d.addEventListener('drop', (ev) => {
    delete corpo.dataset.solta;
    if (est.revisao || est.lendo) return;
    ev.preventDefault();
    adicionarArquivos(ev.dataTransfer?.files ?? []);
  });

  async function interpretar() {
    if (est.lendo) return;
    const texto = est.modo === 'texto' ? est.texto.trim() : '';
    const imagens = est.modo === 'imagem' ? est.imagens.map((i) => i.url) : [];
    if (!texto && imagens.length === 0) { est.erro = est.modo === 'texto' ? 'Cole o treino no campo.' : 'Escolha, arraste ou cole uma imagem.'; desenharImportacao(); return; }
    const assinatura = JSON.stringify([texto, imagens.map((u) => `${u.length}:${u.slice(-80)}`)]);
    est.erro = '';
    if (ultimaLeitura?.assinatura === assinatura) {
      est.revisao = paraRevisar(structuredClone(ultimaLeitura.resultado));
      desenharImportacao();
      return;
    }
    est.lendo = true;
    desenharImportacao();
    try {
      const chave = await abrirChave(cfg.cifrada, app.cifra);
      if (!chave) throw new Error('A chave da IA não abriu. Salve de novo em Ajustes > Garry (IA).');
      const lido = await interpretarTreino({ ...cfg, chave }, { texto, imagens });
      ultimaLeitura = { assinatura, resultado: structuredClone(lido) };
      est.revisao = paraRevisar(lido);
    } catch (e) {
      est.erro = e.message;
    } finally {
      est.lendo = false;
      if (d.open) desenharImportacao();
    }
  }

  function salvar(msg) {
    const dias = est.revisao.dias;
    const semDia = dias.find((x) => x.diaSemana === null);
    if (semDia) { msg.textContent = `Escolha o dia da semana de "${semDia.nome}".`; return; }
    const repetido = dias.find((x, i) => dias.findIndex((y) => y.diaSemana === x.diaSemana) !== i);
    if (repetido) { msg.textContent = `Dois treinos na ${NOMES_DOS_DIAS[repetido.diaSemana].toLowerCase()}. Mude o dia de um deles.`; return; }
    const vazio = dias.find((x) => !x.exercicios.some((e) => e.nome.trim() !== ''));
    if (vazio) { msg.textContent = `"${vazio.nome}" ficou sem exercício. Tire o dia ou acrescente um.`; return; }
    const atual = planoTreino();
    const plano = paraPlano(dias, atual);
    const novo = JSON.stringify(plano);
    if (novo === (app.estado.config.treinoPlano ?? '')) { msg.textContent = 'Nada mudou: o treino já está assim.'; return; }
    mudar((e) => definirConfig(e, 'treinoPlano', novo));
    ultimaLeitura = null;
    const primeiro = [...dias].map((x) => x.diaSemana).filter((x) => x >= 1 && x <= 6).sort()[0];
    if (primeiro) { app.diaTreino = primeiro; app.semana = 0; }
    document.querySelectorAll('dialog[open]').forEach((x) => x.close());
    desenhar();
  }

  function desenharImportacao() {
    if (!cfg?.cifrada) {
      corpo.replaceChildren(h('div', { class: 'cartao' },
        h('p', { texto: 'Para importar com IA, salve a chave do Garry.' }),
        h('p', { class: 'discreto', texto: 'É a mesma chave que o Garry usa (grátis no openrouter.ai/keys). Fica cifrada na sua conta.' }),
        h('button', { class: 'botao principal cheio', style: 'margin-top:12px', onclick: () => { d.close(); abrirAjustes(); }, texto: 'Abrir Ajustes' })));
      return;
    }
    if (est.revisao) { corpo.replaceChildren(...telaDeRevisao()); return; }
    const modo = (m, rotulo) => h('button', { type: 'button', class: 'entrada-modo', 'aria-pressed': String(est.modo === m), disabled: est.lendo ? true : null, onclick: () => { est.modo = m; est.erro = ''; desenharImportacao(); } }, rotulo);
    const partes = [h('div', { class: 'entrada-modos imp-modos', role: 'group', 'aria-label': 'Importar de' }, modo('imagem', 'Imagem'), modo('texto', 'Texto'))];
    if (est.modo === 'imagem') {
      const escolher = h('input', { type: 'file', accept: 'image/*', multiple: true, class: 'imp-arquivo', 'aria-label': 'Escolher imagens do treino' });
      escolher.addEventListener('change', () => adicionarArquivos(escolher.files ?? []));
      partes.push(
        h('label', { class: 'imp-solta', 'data-vazia': est.imagens.length === 0 ? 'sim' : null }, escolher, icone('imagem'),
          h('b', { texto: est.imagens.length === 0 ? 'Escolher fotos ou prints' : 'Mais uma imagem' }),
          h('span', { texto: 'ou arraste para cá, ou cole (Ctrl+V). Um dia por imagem, até 6.' })),
        est.imagens.length > 0 ? h('div', { class: 'imp-fotos' }, est.imagens.map((img, i) => h('figure', { class: 'imp-foto' },
          h('img', { src: img.url, alt: `Imagem ${i + 1}: ${img.nome}` }),
          h('button', { class: 'imp-foto-tirar', type: 'button', 'aria-label': `Tirar a imagem ${i + 1}`, disabled: est.lendo ? true : null, onclick: () => { est.imagens.splice(i, 1); desenharImportacao(); } }, icone('fechar'))))) : null);
    } else {
      const campo = h('textarea', { class: 'campo imp-texto', rows: '10', placeholder: 'Cole aqui o treino, do jeito que estiver. Ex.:\nSegunda — Peito e ombros\nSupino inclinado — 3x8-12 — 30kg\nElevação lateral — 3x12 — 10kg\nDescanso 2 minutos', 'aria-label': 'Texto do treino' });
      campo.value = est.texto;
      campo.addEventListener('input', () => { est.texto = campo.value; });
      partes.push(campo);
    }
    partes.push(h('p', { class: 'erro', role: 'alert', texto: est.erro }));
    partes.push(est.lendo
      ? h('div', { class: 'imp-lendo', role: 'status' }, h('i', { class: 'imp-giro', 'aria-hidden': 'true' }), h('span', { texto: est.modo === 'imagem' ? 'Lendo as imagens… pode levar até um minuto.' : 'Lendo o treino…' }))
      : h('button', { class: 'botao principal cheio', onclick: interpretar }, icone('ia'), 'Interpretar treino'));
    partes.push(h('p', { class: 'pequeno imp-rodape', texto: 'A IA só transcreve o que estiver escrito: o que faltar fica em branco para você completar. Nada é salvo antes de você revisar.' }));
    corpo.replaceChildren(...partes.filter(Boolean));
  }

  function telaDeRevisao() {
    const rev = est.revisao;
    const atual = planoTreino();
    const msg = h('p', { class: 'erro', role: 'alert' });
    const total = rev.dias.reduce((n, x) => n + x.exercicios.length, 0);
    const dias = rev.dias.map((dia, iDia) => cartaoDoDiaImportado(dia, iDia, atual));
    return [
      h('p', { class: 'imp-resumo', texto: `Li ${rev.dias.length} ${rev.dias.length === 1 ? 'treino' : 'treinos'} e ${total} exercícios. Confira e corrija o que precisar: nada foi salvo ainda.` }),
      rev.aviso ? h('p', { class: 'imp-aviso', texto: `A IA avisou: ${rev.aviso}` }) : null,
      ...dias,
      msg,
      h('button', { class: 'botao principal cheio imp-salvar', onclick: () => salvar(msg), texto: rev.dias.length === 1 ? 'Salvar o treino' : `Salvar os ${rev.dias.length} treinos` }),
      h('button', { class: 'botao texto', style: 'margin:8px auto 0;display:block', onclick: () => { est.revisao = null; desenharImportacao(); }, texto: 'Voltar e ler de novo' }),
    ].filter(Boolean);
  }

  function cartaoDoDiaImportado(dia, iDia, atual) {
    const dias = est.revisao.dias;
    const qual = h('select', { class: 'campo', 'aria-label': `Dia da semana de ${dia.nome}` },
      h('option', { value: '', selected: dia.diaSemana === null ? true : null, texto: 'Escolha o dia' }),
      [1, 2, 3, 4, 5, 6, 0].map((n) => h('option', { value: String(n), selected: dia.diaSemana === n ? true : null, texto: NOMES_DOS_DIAS[n] })));
    qual.addEventListener('change', () => { dia.diaSemana = qual.value === '' ? null : Number(qual.value); desenharImportacao(); });
    const nome = h('input', { class: 'campo', value: dia.nome, 'aria-label': 'Nome do treino' });
    nome.addEventListener('input', () => { dia.nome = nome.value; });
    const antigo = dia.diaSemana === null ? null : atual.dias.find((x) => x.diaSemana === dia.diaSemana);
    const repetido = dia.diaSemana !== null && dias.filter((x) => x.diaSemana === dia.diaSemana).length > 1;
    const lista = h('div', { class: 'imp-lista' }, dia.exercicios.map((x, i) => linhaImportada(dia, x, i)));
    ligarArrasto(lista, dia);
    return h('section', { class: 'cartao imp-dia', 'data-sem-dia': dia.diaSemana === null ? 'sim' : null },
      h('div', { class: 'imp-dia-topo' },
        h('label', { class: 'ed-sub' }, h('span', { texto: 'Dia' }), qual),
        h('button', { class: 'botao icone', type: 'button', 'aria-label': `Não importar ${dia.nome}`, onclick: () => { dias.splice(iDia, 1); if (dias.length === 0) est.revisao = null; desenharImportacao(); } }, icone('fechar'))),
      h('label', { class: 'ed-sub' }, h('span', { texto: 'Nome do treino' }), nome),
      dia.diaSemana === null ? h('p', { class: 'imp-aviso', texto: 'A imagem não diz o dia: escolha acima.' }) : null,
      repetido ? h('p', { class: 'imp-aviso', texto: `Outro treino importado também está na ${NOMES_DOS_DIAS[dia.diaSemana].toLowerCase()}.` }) : null,
      antigo ? h('p', { class: 'imp-troca', texto: `Vai trocar o treino atual de ${NOMES_DOS_DIAS[dia.diaSemana].toLowerCase()} ("${antigo.nome}"). O que já foi feito nos treinos continua no histórico.` }) : null,
      dia.nota ? h('p', { class: 'imp-nota-dia', texto: dia.nota }) : null,
      lista,
      h('button', {
        class: 'botao cheio ed-novo', onclick: () => {
          dia.exercicios.push({ chave: novoId(), nome: '', series: null, faixa: null, repsFeitas: null, cargas: null, aquecimento: [], descansoS: null, metodo: null, nota: '', confianca: 'alta', usarId: null, achado: null, existentes: dia.exercicios[0]?.existentes ?? [] });
          desenharImportacao();
          corpo.querySelectorAll('.imp-dia')[iDia]?.querySelector('.imp-ex:last-child .imp-nome')?.focus();
        }, texto: '+ Exercício',
      }));
  }

  function linhaImportada(dia, x, i) {
    const duvida = x.confianca === 'baixa';
    const nome = h('input', { class: 'campo imp-nome', value: x.nome, 'aria-label': `Exercício ${i + 1}`, placeholder: 'Nome do exercício' });
    nome.addEventListener('input', () => { x.nome = nome.value; });
    nome.addEventListener('change', () => {
      // nome corrigido: confere de novo se e um exercicio que a pessoa ja tem
      x.achado = corresponder(x.nome, x.existentes);
      x.usarId = x.achado?.ex.id ?? null;
      desenharImportacao();
    });
    const numeroCampo = (rotulo, valor, padrao, aoMudar) => {
      const c = h('input', { class: 'campo', inputmode: 'numeric', value: valor ?? '', placeholder: padrao, 'aria-label': rotulo });
      c.addEventListener('input', () => aoMudar(c.value.trim()));
      return h('label', { class: 'ed-sub' }, h('span', { texto: rotulo }), c);
    };
    const series = numeroCampo('Séries', x.series, '3 · padrão', (v) => { const n = Math.round(Number(v)); x.series = v && n >= 1 && n <= 10 ? n : null; });
    const min = numeroCampo('Reps mín.', x.faixa?.min, '8 · padrão', (v) => { const n = Math.round(Number(v)); x.faixa = v && n > 0 ? { min: n, max: Math.max(n, x.faixa?.max ?? n) } : null; });
    const max = numeroCampo('Reps máx.', x.faixa?.max, '12 · padrão', (v) => { const n = Math.round(Number(v)); if (v && n > 0 && x.faixa) x.faixa = { min: Math.min(x.faixa.min, n), max: n }; else if (v && n > 0) x.faixa = { min: n, max: n }; });
    const carga = h('input', { class: 'campo', inputmode: 'decimal', value: textoDasCargas(x.cargas), placeholder: 'kg', 'aria-label': 'Carga (uma por série: 40/35/30)' });
    carga.addEventListener('input', () => { const ns = lerNumeros(carga.value); x.cargas = ns.length > 0 ? ns : null; });
    const descanso = h('select', { class: 'campo', 'aria-label': 'Descanso' },
      h('option', { value: '', selected: x.descansoS ? null : true, texto: 'Pelo feeling' }),
      [...new Set([...DESCANSOS, ...(x.descansoS ? [x.descansoS] : [])])].sort((a, b) => a - b).map((s) => h('option', { value: String(s), selected: x.descansoS === s ? true : null, texto: relogio(s) })));
    descanso.addEventListener('change', () => { x.descansoS = descanso.value ? Number(descanso.value) : null; });
    const metodo = h('select', { class: 'campo', 'aria-label': 'Método' },
      h('option', { value: '', selected: x.metodo ? null : true, texto: 'Normal' }),
      Object.entries(METODOS).map(([id, m]) => h('option', { value: id, selected: x.metodo === id ? true : null, texto: m.nome })));
    metodo.addEventListener('change', () => { x.metodo = metodo.value || null; });
    const aquec = h('input', { class: 'campo', value: textoDoAquecimento(x.aquecimento), placeholder: 'ex.: 20×12, 30×8', 'aria-label': 'Aquecimento' });
    aquec.addEventListener('input', () => { x.aquecimento = lerAquecimento(aquec.value); });
    const nota = h('input', { class: 'campo', value: x.nota ?? '', placeholder: 'Nota (execução, RIR, técnica)', 'aria-label': 'Nota' });
    nota.addEventListener('input', () => { x.nota = nota.value; });

    // Se e um exercicio que a pessoa ja tem (o historico continua) ou um novo; nunca troca calado.
    const usado = x.usarId ? x.existentes.find((e) => e.id === x.usarId) : null;
    const escolher = h('select', { class: 'campo imp-escolher', 'aria-label': 'É um exercício que você já tem?' },
      h('option', { value: '', selected: usado ? null : true, texto: usado ? 'Não é esse: exercício novo' : 'É um do seu treino? Escolher…' }),
      x.existentes.map((e) => h('option', { value: e.id, selected: usado?.id === e.id ? true : null, texto: `${e.nome} (${e.dia})` })));
    escolher.addEventListener('change', () => {
      const e = x.existentes.find((y) => y.id === escolher.value) ?? null;
      x.usarId = e?.id ?? null;
      if (e && !x.achado) x.nome = e.nome; // escolhido da lista: fica o nome que ja estava no treino
      desenharImportacao();
    });
    const vinculo = usado
      ? h('p', { class: 'imp-vinculo', 'data-tipo': x.achado?.confianca === 'alta' ? 'igual' : 'parecido' }, icone('check'),
        h('span', { texto: x.achado?.confianca === 'media' ? `Parece "${usado.nome}": o histórico continua` : `Já está no seu treino: o histórico continua` }))
      : h('p', { class: 'imp-vinculo', 'data-tipo': 'novo' }, h('span', { texto: 'Exercício novo' }));

    const mover = (delta) => {
      const j = i + delta;
      if (j < 0 || j >= dia.exercicios.length) return;
      [dia.exercicios[i], dia.exercicios[j]] = [dia.exercicios[j], dia.exercicios[i]];
      desenharImportacao();
    };
    return h('div', { class: 'imp-ex', 'data-chave': x.chave, 'data-confianca': x.confianca },
      h('div', { class: 'imp-linha' },
        h('button', { class: 'imp-arrastar', type: 'button', 'aria-label': `Mudar a ordem de ${x.nome || 'exercício'} (arraste, ou use as setas)` }, icone('arrastar')),
        vinculo,
        h('button', { class: 'botao icone', type: 'button', 'aria-label': 'Subir', disabled: i === 0 ? true : null, onclick: () => mover(-1) }, icone('cima')),
        h('button', { class: 'botao icone', type: 'button', 'aria-label': 'Descer', disabled: i === dia.exercicios.length - 1 ? true : null, onclick: () => mover(1) }, icone('baixo')),
        h('button', { class: 'botao icone', type: 'button', 'aria-label': `Tirar ${x.nome || 'exercício'}`, onclick: () => { dia.exercicios.splice(i, 1); desenharImportacao(); } }, icone('fechar'))),
      nome,
      duvida ? h('p', { class: 'imp-duvida', texto: 'A IA não teve certeza desta linha: confira.' }) : null,
      x.existentes.length > 0 ? escolher : null,
      h('div', { class: 'imp-campos' }, series, min, max),
      h('div', { class: 'imp-campos imp-campos-2' },
        h('label', { class: 'ed-sub' }, h('span', { texto: 'Carga (kg)' }), carga),
        h('label', { class: 'ed-sub' }, h('span', { texto: 'Descanso' }), descanso)),
      h('div', { class: 'imp-campos imp-campos-2' },
        h('label', { class: 'ed-sub' }, h('span', { texto: 'Método' }), metodo),
        h('label', { class: 'ed-sub' }, h('span', { texto: 'Aquecimento' }), aquec)),
      nota);
  }

  // Arrastar pela alca: a linha segue o dedo e troca de lugar com as vizinhas; ao soltar, a ordem fica.
  function ligarArrasto(lista, dia) {
    lista.addEventListener('pointerdown', (ev) => {
      const alca = ev.target.closest('.imp-arrastar');
      if (!alca) return;
      const linha = alca.closest('.imp-ex');
      ev.preventDefault();
      try { alca.setPointerCapture(ev.pointerId); } catch { /* sem captura: a janela ouve igual */ }
      linha.dataset.arrastando = 'sim';
      let ultimoY = ev.clientY;
      const mover = (e) => {
        ultimoY = e.clientY;
        const irmas = [...lista.children].filter((x) => x !== linha);
        const depois = irmas.find((x) => { const r = x.getBoundingClientRect(); return ultimoY < r.top + r.height / 2; });
        if (depois) { if (linha.nextElementSibling !== depois) lista.insertBefore(linha, depois); } else if (lista.lastElementChild !== linha) lista.append(linha);
      };
      const soltar = () => {
        window.removeEventListener('pointermove', mover);
        window.removeEventListener('pointerup', soltar);
        window.removeEventListener('pointercancel', soltar);
        delete linha.dataset.arrastando;
        const ordem = [...lista.children].map((x) => x.dataset.chave);
        dia.exercicios.sort((a, b) => ordem.indexOf(a.chave) - ordem.indexOf(b.chave));
        desenharImportacao();
      };
      window.addEventListener('pointermove', mover);
      window.addEventListener('pointerup', soltar);
      window.addEventListener('pointercancel', soltar);
    });
  }

  desenharImportacao();
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
    if (ex.biset) partes.push('bi-set com o próximo');
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
      // O link do video da execucao (16/11/2026). Vazio = vale o da biblioteca, se houver um parecido.
      const campoVideo = h('input', { class: 'campo', type: 'url', inputmode: 'url', autocomplete: 'off', autocapitalize: 'off', spellcheck: 'false', value: ex.video ?? '', placeholder: 'Link do vídeo (YouTube, Instagram, TikTok…)', 'aria-label': 'Link do vídeo da execução', enterkeyhint: 'done' });
      const explicaVideo = h('p', { class: 'ed-explica' });
      const lerVideoDoCampo = () => {
        ex.video = campoVideo.value.trim();
        const v = videoDoExercicio({ nome: ex.nome, video: ex.video }, biblioteca);
        explicaVideo.textContent = ex.video !== '' && lerVideo(ex.video) === null ? 'Use o link completo, começando com https://. Sem isso o vídeo não entra.'
          : ex.video !== '' ? 'Aparece ao tocar em Execução na série.'
            : v ? `Sem link seu: vale o da biblioteca (${v.nome}).` : 'Opcional. Aparece ao tocar em Execução na série.';
      };
      lerVideoDoCampo();
      campoVideo.addEventListener('input', lerVideoDoCampo);
      campoVideo.addEventListener('keydown', (ev) => { if (ev.key === 'Enter') campoVideo.blur(); });
      for (const c of [campoNome, nota]) {
        c.addEventListener('input', lerEx);
        c.addEventListener('keydown', (ev) => { if (ev.key === 'Enter') c.blur(); });
      }
      const escolher = (fazer) => { lerEx(); fazer(); redesenhar(); atualizarTopo(); };
      // Bi-set com o proximo exercicio (17/11/2026). So existe se ha um proximo.
      const proximoEx = treino.exercicios[i + 1] ?? null;
      const bisetChips = proximoEx ? chips(`biset-${ex.id}`, 'Bi-set com o próximo', [['nao', 'Não'], ['sim', 'Sim']], ex.biset ? 'sim' : 'nao', (v) => escolher(() => { ex.biset = v === 'sim'; })) : null;
      const metodoChips = chips(`metodo-${ex.id}`, 'Método', [['', 'Normal'], ...Object.entries(METODOS).map(([id, m]) => [id, m.nome])], ex.metodo ?? '', (v) => escolher(() => {
        // Trocou o metodo: as series de antes eram outra coisa e nao servem de treino anterior (16/11/2026).
        // A carga de trabalho de ate agora fica como ponto de partida, sem repeticoes inventadas.
        if ((v || null) !== (ex.metodo ?? null)) {
          const u = ultimaVez(ex, sessoesDoConfig(app.estado.config), hoje());
          const carga = u ? Math.max(...u.series.filter((x) => !x.t).map((x) => x.carga), 0) : ex.referencia?.carga ?? 0;
          ex.desde = hoje();
          ex.referencia = carga > 0 ? { carga, reps: [] } : null;
        }
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
        secao('Execução', nota, campoVideo, explicaVideo),
        secao('Método', metodoChips,
          h('p', { class: 'ed-explica', texto: METODOS[ex.metodo]?.resumo ?? 'Uma série de cada vez. Os outros métodos só se você quiser.' }),
          pDrops ? h('div', { class: 'ed-linha-num' }, h('span', { texto: 'Drops no fim' }), pDrops.el) : null),
        bisetChips ? secao('Bi-set com o próximo', bisetChips,
          h('p', { class: 'ed-explica', texto: ex.biset ? `Uma série deste e, sem descanso, uma de ${proximoEx.nome || 'o próximo'}. O descanso vem depois do par.` : `Junta com ${proximoEx.nome || 'o próximo exercício'}: vocês alternam série a série, sem descanso entre os dois.` })) : null,
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
    h('button', { class: 'botao cheio imp-entrada', type: 'button', onclick: () => abrirImportacao() }, icone('ia'), 'Importar treino com IA'),
    h('h2', { class: 'secao', texto: 'Exercícios' }),
    h('p', { class: 'ed-dica', texto: 'Na ordem em que você faz. Toque num exercício para mudar.' }),
    lista,
    h('button', {
      class: 'botao cheio ed-novo', onclick: () => {
        const novo = { id: novoId(), nome: '', faixa: null, series: 3, metodo: null, drops: 0, descansoS: null, nota: '', video: '', biset: false, aquecimento: [], aquecimentoModo: null, musculo: null, referencia: null };
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
    : pend > 0 ? `${pend} mudança(s) esperando para subir.` : 'Tudo sincronizado.';
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
          linhaSit.textContent = app.sync.estado === 'erro' ? app.sync.mensagem : 'Tudo sincronizado.';
          ev.currentTarget.disabled = false;
        }, texto: 'Sincronizar agora',
      })),
    h('div', { class: 'cartao' },
      h('p', { class: 'pequeno', texto: 'Código de recuperação' }),
      h('p', { class: 'discreto', texto: 'Abre os seus dados em outro aparelho. Não mostre para ninguém.' }),
      h('button', {
        class: 'botao cheio', style: 'margin-top:10px', onclick: () => {
          const segredo = guardado.ler('segredo');
          if (segredo) mostrarCodigo(codigoDeRecuperacao(deBase64(segredo)));
        }, texto: 'Mostrar o código',
      })),
    cartaoChaveDoGarry(),
    h('div', { class: 'cartao' },
      h('p', { class: 'pequeno', texto: 'Para usar como app: no Safari, Compartilhar → Adicionar à Tela de Início.' }),
      h('button', { class: 'botao texto perigo', style: 'margin-top:8px', onclick: sair, texto: 'Sair da conta neste iPhone' })),
    h('p', { class: 'pequeno', style: 'text-align:center', texto: 'Próximo Passo no iPhone · versão experimental 0.5' }),
  ]);
}

/**
 * A chave da IA do Garry (11/11/2026): sem o app do computador, ela e salva daqui. Vai cifrada na conta, no
 * mesmo lugar que o computador usa (iaChave:<host>), e o modelo gratis do OpenRouter vira o padrao.
 */
const MODELO_GRATIS = 'nvidia/nemotron-3-ultra-550b-a55b:free';
function cartaoChaveDoGarry() {
  const ia = configDaIa(app.estado.config);
  const temChave = ia?.cifrada != null;
  const campo = h('input', { class: 'campo', type: 'password', autocomplete: 'off', placeholder: 'sk-or-…', 'aria-label': 'Chave da IA' });
  const msg = h('p', { class: 'pequeno', role: 'status' });
  return h('div', { class: 'cartao' },
    h('p', { class: 'pequeno', texto: 'Garry (IA)' }),
    h('p', { class: 'discreto', texto: temChave
      ? `Chave salva na conta (${ia.host}). Para trocar, cole outra.`
      : 'Para conversar com o Garry, crie uma chave grátis em openrouter.ai/keys e cole aqui.' }),
    h('div', { style: 'height:8px' }), campo,
    h('button', {
      class: 'botao cheio', style: 'margin-top:10px', onclick: async () => {
        const chave = campo.value.trim();
        if (chave.length < 10) { msg.textContent = 'Cole a chave inteira.'; return; }
        const cfg = configDaIa(app.estado.config);
        if (!cfg || !app.cifra) { msg.textContent = 'Entre na conta antes.'; return; }
        const cifrada = await app.cifra.cifrar({ chave });
        mudar((e) => {
          definirConfig(e, `iaChave:${cfg.host}`, cifrada);
          if (!cfg.modelo) definirConfig(e, `iaModelo:${cfg.host}`, MODELO_GRATIS);
        });
        campo.value = '';
        msg.textContent = 'Chave salva na conta.';
      }, texto: temChave ? 'Trocar a chave' : 'Salvar a chave',
    }),
    msg);
}

function sair() {
  for (const nome of ['sessao', 'segredo', 'estado', 'conversa', 'ultima-sync']) guardado.gravar(nome, null);
  app.sessao = null;
  app.passoConta = null;
  app.codigoNovo = null;
  app.modoEntrada = 'entrar';
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

function planoDaConta() {
  return validarPlano(lerJson(app.estado.config.planoAlimentar, null)) ?? PLANO_PADRAO;
}
function perfilDaConta() {
  return app.estado.config.perfilNutricao ? validarPerfil(lerJson(app.estado.config.perfilNutricao, null)) : PERFIL_PADRAO;
}
function salvosDaConta() {
  return lerAlimentosSalvos(app.estado.config.alimentosSalvos ?? null);
}
/** Guarda (no comeco da lista) alimentos novos, como o PC faz: o mesmo nome e quantidade troca o antigo. */
function guardarSalvos(itens) {
  const lista = guardarAlimentos(salvosDaConta(), itens, novoId);
  mudar((e) => definirConfig(e, 'alimentosSalvos', JSON.stringify(lista)));
  return lista;
}

function dietaDeHoje() {
  const dia = hoje();
  const e = app.estado;
  const plano = planoDaConta();
  const perfil = perfilDaConta();
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
  return { dia, resumo, pesoKg, pesos, plano, perfil };
}

const refeicaoAberta = new Set();
// A proxima refeicao abre sozinha; fechar a mao fica fechado (antes ela nunca fechava).
const refeicaoFechada = new Set();
const dietaUi = { periodo: 30, pesoSel: null };

function ligarDieta(tela) {
  const circulo = tela.querySelector('.anel .cheio');
  if (circulo) movimento.anel(circulo, Number(circulo.dataset.volta), Number(circulo.dataset.fracao));
  const numero = tela.querySelector('[data-anel-numero]');
  if (numero) movimento.contar(numero, 'dieta-kcal', Number(numero.dataset.anelNumero), n0);
  for (const i of tela.querySelectorAll('[data-macro]')) movimento.barraCresce(i, `macro-${i.dataset.macro}`, Number(i.dataset.fracao));
  const peso = tela.querySelector('[data-peso-numero]');
  if (peso) movimento.contar(peso, 'peso-numero', Number(peso.dataset.pesoNumero), (v) => numeroBr(Math.round(v * 10) / 10));
  movimento.pesoEntrou(tela.querySelector('.peso-grafico'), `${dietaUi.periodo}`);
  for (const g of tela.querySelectorAll('.peso-cartao .ed-chips')) movimento.pilulaDosChips(g, g.dataset.chave);
}

// ---------- registrar o que comeu ----------

/**
 * Grava um alimento no dia. Numa refeicao (17/11/2026), como o PC faz no "somar": se ela ainda vale o plano,
 * o plano vira registrado antes (senao o total cairia para so este alimento); a refeicao fica feita.
 * `comPlano` falso = so isto (a pessoa comeu so este alimento nessa refeicao).
 */
function registrarComida({ descricao, macros, refeicao = null, comPlano = true }) {
  const { dia, resumo } = dietaDeHoje();
  const r = refeicao ? resumo.refeicoes.find((x) => x.habitoId === refeicao) : null;
  mudar((e) => {
    if (r) {
      // Com a refeicao feita "como no plano", o plano vira registrado antes (senao o total cairia para so
      // este alimento). Nao feita: entra so este; os alimentos do plano a pessoa marca um a um.
      if (r.comido.length === 0 && r.feita && comPlano) {
        for (const i of r.itensComMacros) {
          const id = novoId();
          escrever(e, 'consumo_extra', [id], linhaDoConsumo({ id, dia, descricao: `${i.nome} · ${textoDaMedida(i.quantidade, i.unidade)}`, macros: i.calculado, refeicao }));
        }
      }
      escrever(e, 'marcas_habito', [refeicao, dia], { habito_id: refeicao, dia_logico: dia, marcado_em: new Date().toISOString() });
      escrever(e, 'refeicoes_puladas', [dia, refeicao], null);
    }
    const id = novoId();
    escrever(e, 'consumo_extra', [id], linhaDoConsumo({ id, dia, descricao, macros, refeicao: r ? refeicao : null }));
  });
}

/** Tira um alimento registrado; o ultimo de uma refeicao desmarca a refeicao (igual ao PC). */
function tirarComida(c) {
  mudar((e) => {
    escrever(e, 'consumo_extra', [c.id], null);
    const ref = c.refeicaoHabitoId;
    if (ref && !Object.values(e.consumo).some((x) => x.dia === c.dia && x.refeicao_habito === ref)) escrever(e, 'marcas_habito', [ref, c.dia], null);
  });
}


/**
 * Escolher um alimento (17/11/2026): busca na tabela e nos salvos (os do PC tambem), alimento proprio com a
 * tabela nutricional e "Calcular com a IA". Depois de escolher: a quantidade, com os macros na hora.
 * modo 'dia' grava no dia (com a refeicao); modo 'plano' devolve para o editor do plano.
 */
function escolherAlimento({ modo, refeicao = null, aoEscolher = null }) {
  const { resumo } = modo === 'dia' ? dietaDeHoje() : { resumo: null };
  const est = { busca: '', escolha: null, quantidade: 0, refeicao, comPlano: true, proprio: false, ia: { lendo: false, erro: '', achados: [] } };
  const corpo = h('div', { class: 'ali' });
  const d = folha(modo === 'plano' ? 'Alimento do plano' : 'Adicionar alimento', [corpo], {
    acao: {
      nome: 'Adicionar', fazer: () => {
        if (est.proprio) return salvarProprio();
        if (!est.escolha) { movimento.nega(corpo.querySelector('.ali-busca') ?? corpo); return false; }
        const macros = macrosDaEscolha(est.escolha, est.quantidade);
        if (est.escolha.origem === 'salvo') guardarSalvos([salvoDaEscolha(est.escolha)]); // sobe para o topo dos usados
        if (modo === 'plano') { aoEscolher?.(est.escolha, est.quantidade); return true; }
        registrarComida({ descricao: descricaoDaEscolha(est.escolha, est.quantidade), macros, refeicao: est.refeicao, comPlano: est.comPlano });
        if (est.refeicao) refeicaoAberta.add(est.refeicao);
        desenhar();
        return true;
      },
    },
  });
  d.classList.add('folha-alimento');

  const salvoDaEscolha = (e) => salvosDaConta().find((s) => s.id === e.id) ?? null;

  // ---- a lista ----
  const campo = h('input', { class: 'campo ali-busca', type: 'search', enterkeyhint: 'search', placeholder: 'Buscar: arroz, whey, pão…', autocomplete: 'off', 'aria-label': 'Buscar alimento' });
  const lista = h('div', { class: 'ali-lista' });
  const linha = (escolha) => h('button', {
    class: 'ali-linha', type: 'button', onclick: () => escolher(escolha),
  }, h('span', { class: 'ali-nome', texto: escolha.nome }),
  h('span', { class: 'ali-sub', texto: `${escolha.origem === 'tabela' ? textoDaMedida(escolha.base, escolha.unidade) + (escolha.medida ? ` · ${escolha.medida}` : '') : escolha.medida ?? textoDaMedida(escolha.base, escolha.unidade)} · ${n0(escolha.macros.kcal)} kcal` }),
  h('span', { class: 'ali-p', texto: `${numeroBr(escolha.macros.proteina)} g P` }));
  const desenharLista = () => {
    const { salvos, tabela, taco } = buscarAlimentos(est.busca, salvosDaConta());
    const ia = configDaIa(app.estado.config);
    const blocos = [];
    // A IA vem antes da lista longa: e o caminho para o que nao esta em tabela nenhuma (marca, prato pronto).
    if (est.busca.length >= 2 && ia?.cifrada) {
      blocos.push(h('button', { class: 'ali-ia', type: 'button', disabled: est.ia.lendo, onclick: calcularComIa },
        icone('ia'), h('span', { texto: est.ia.lendo ? 'Calculando…' : `Calcular “${est.busca}” com a IA` }), h('small', { texto: 'escreva a quantidade junto: “2 ovos fritos”, “150 g de frango”' })));
    } else if (est.busca.length >= 2) {
      blocos.push(h('button', { class: 'ali-ia ali-ia-sem', type: 'button', onclick: () => { d.close(); abrirAjustes(); } },
        icone('ia'), h('span', { texto: 'Calcular com a IA' }), h('small', { texto: 'salve a chave do Garry em Ajustes (grátis)' })));
    }
    if (est.ia.erro) blocos.push(h('p', { class: 'ali-erro', role: 'alert', texto: est.ia.erro }));
    if (est.ia.achados.length > 0) blocos.push(h('p', { class: 'ed-titulo', texto: 'Calculado pela IA' }), est.ia.achados.map((s) => linha(escolhaDoSalvo(s))));
    if (salvos.length > 0) blocos.push(h('p', { class: 'ed-titulo', texto: est.busca ? 'Seus alimentos' : 'Usados antes' }), salvos.map(linha));
    if (tabela.length > 0) blocos.push(h('p', { class: 'ed-titulo', texto: 'Tabela' }), tabela.map(linha));
    if (taco.length > 0) blocos.push(h('p', { class: 'ed-titulo', texto: 'Tabela TACO · por 100 g' }), taco.map(linha));
    if (est.busca && salvos.length + tabela.length + taco.length === 0 && est.ia.achados.length === 0) blocos.push(h('p', { class: 'discreto ali-nada', texto: `Nada com “${est.busca}” nas tabelas.` }));
    blocos.push(h('button', { class: 'ali-proprio', type: 'button', onclick: () => { est.proprio = true; if (!proprio.nome) proprio.nome = est.busca.trim(); desenharTudo(); } },
      icone('mais'), h('span', { texto: 'Alimento próprio' }), h('small', { texto: 'foto do rótulo, a IA ou você escreve' })));
    lista.replaceChildren(...blocos.flat());
  };
  campo.addEventListener('input', () => { est.busca = campo.value; est.ia.erro = ''; desenharLista(); });

  const calcularComIa = async () => {
    const ia = configDaIa(app.estado.config);
    if (!ia?.cifrada) return;
    est.ia.lendo = true; est.ia.erro = ''; desenharLista();
    try {
      const chave = await abrirChave(ia.cifrada, app.cifra);
      if (!chave) throw new Error('A chave da IA não abriu. Salve de novo em Ajustes > Garry (IA).');
      const itens = await estimarComIa({ ...ia, chave }, est.busca);
      const lista2 = guardarSalvos(itens);
      est.ia.achados = itens.map((it) => lista2.find((s) => s.nome === it.nome) ?? null).filter(Boolean);
      if (est.ia.achados.length === 1) escolher(escolhaDoSalvo(est.ia.achados[0]));
    } catch (erro) {
      est.ia.erro = erro.message;
    } finally {
      est.ia.lendo = false;
      if (!est.escolha) desenharLista();
    }
  };

  // ---- a quantidade ----
  const escolher = (escolha) => {
    est.escolha = escolha;
    est.quantidade = escolha.base;
    desenharTudo();
  };
  const painelEscolhido = () => {
    const e = est.escolha;
    const valor = h('input', { class: 'campo ed-passo-valor ali-qtd', inputmode: 'decimal', enterkeyhint: 'done', value: numeroBr(est.quantidade), 'aria-label': `Quantidade em ${e.unidade}` });
    const kcal = h('b', { class: 'ali-kcal' });
    const macros = h('div', { class: 'ali-macros' });
    const atualizar = (pulo = 0) => {
      const m = macrosDaEscolha(e, est.quantidade);
      movimento.contar(kcal, 'ali-kcal', m.kcal, n0);
      macros.replaceChildren(
        ...[['Proteína', m.proteina, 'p'], ['Carbo', m.carboidrato, 'c'], ['Gordura', m.gordura, 'g']].map(([n, v, c]) => h('span', { class: `ali-macro m-${c}` }, h('b', { texto: `${numeroBr(v)} g` }), h('small', { texto: n }))));
      if (pulo) movimento.numeroMudou(valor, pulo);
    };
    const mexer = (sinal) => {
      const passo = passoDe(e.unidade, est.quantidade);
      const novo = Math.max(passo, Math.round((est.quantidade + sinal * passo) / passo) * passo);
      est.quantidade = Math.min(5000, Math.round(novo * 10) / 10);
      valor.value = numeroBr(est.quantidade);
      atualizar(sinal);
    };
    valor.addEventListener('focus', () => valor.select());
    valor.addEventListener('input', () => {
      const v = Number(valor.value.replace(',', '.'));
      if (Number.isFinite(v) && v > 0 && v <= 5000) { est.quantidade = v; atualizar(); }
    });
    const blocos = [
      h('div', { class: 'ali-escolhido-topo' },
        h('div', {}, h('p', { class: 'ali-escolhido-nome', texto: e.nome }), h('p', { class: 'ali-sub', texto: `Base: ${[textoDaMedida(e.base, e.unidade), e.medida].filter((t, i, l) => t && l.indexOf(t) === i).join(' · ')}` })),
        h('button', { class: 'botao texto', type: 'button', onclick: () => { est.escolha = null; desenharTudo(); campo.focus(); }, texto: 'Trocar' })),
      h('div', { class: 'ali-quanto' },
        h('div', { class: 'ed-passo ali-passo' },
          h('button', { class: 'ed-passo-botao', type: 'button', 'aria-label': 'Menos', onclick: () => mexer(-1) }, icone('menos')),
          h('div', { class: 'ali-passo-valor' }, valor, h('small', { texto: e.unidade === 'un' ? 'un' : e.unidade })),
          h('button', { class: 'ed-passo-botao', type: 'button', 'aria-label': 'Mais', onclick: () => mexer(1) }, icone('mais'))),
        h('div', { class: 'ali-total' }, kcal, h('small', { texto: 'kcal' }))),
      macros,
    ];
    if (modo === 'dia') {
      const opcoes = [[null, 'Fora do plano'], ...resumo.refeicoes.map((r) => [r.habitoId, r.titulo])];
      const destino = pilulas('ali-destino', 'Onde entra', opcoes, est.refeicao, (v) => { est.refeicao = v; desenharJunto(); });
      const junto = h('div', { class: 'ali-junto' });
      const desenharJunto = () => {
        const r = resumo.refeicoes.find((x) => x.habitoId === est.refeicao);
        if (!r || !r.feita || r.comido.length > 0 || r.itens.length === 0) { junto.replaceChildren(); return; }
        const p = pilulas('ali-junto', 'Com o plano', [[true, `${r.titulo} do plano + isto`], [false, 'Só isto']], est.comPlano, (v) => { est.comPlano = v; });
        junto.replaceChildren(p.el, h('p', { class: 'cardio-dica', texto: est.comPlano ? `Conta ${n0(r.planejado.kcal)} kcal do plano mais este alimento.` : 'Conta só este alimento nessa refeição.' }));
        requestAnimationFrame(() => movimento.pilulaDosChips(p.el, 'ali-junto'));
      };
      desenharJunto();
      blocos.push(h('div', { class: 'ed-secao ali-onde' }, h('p', { class: 'ed-titulo', texto: 'Onde entra' }), destino.el, junto));
      requestAnimationFrame(() => movimento.pilulaDosChips(destino.el, 'ali-destino'));
    }
    atualizar();
    return h('div', { class: 'cartao ali-escolhido' }, blocos);
  };

  // ---- o alimento proprio ----
  const proprio = { nome: '', quantidade: '100', unidade: 'g', kcal: '', proteina: '', carboidrato: '', gordura: '' };
  const campos = {};
  const salvarProprio = () => {
    for (const [k, el] of Object.entries(campos)) proprio[k] = el.value;
    const lido = lerAlimentoProprio(proprio);
    if (lido.erro) { aviso.textContent = lido.erro; movimento.nega(campos[lido.campo] ?? campos.nome); return false; }
    const lista2 = guardarSalvos([lido.item]);
    const novo = lista2[0];
    est.proprio = false;
    escolher(escolhaDoSalvo(novo));
    return false; // fica aberta: agora e escolher a quantidade
  };
  const aviso = h('p', { class: 'ali-erro', role: 'alert' });
  // A IA preenche a tabela (17/11/2026: "tem que POR TUDO MACRO isso e TERRIVEL"): pela foto do rotulo
  // ou pelo nome. A pessoa so confere e salva.
  const iaProprio = { lendo: '', erro: '' };
  const lerCampos = () => { for (const [k, el] of Object.entries(campos)) proprio[k] = el.value; };
  const comIa = async (rotulo, fazer) => {
    const ia = configDaIa(app.estado.config);
    if (!ia?.cifrada) { iaProprio.erro = 'Para a IA preencher, salve a chave do Garry em Ajustes (grátis no openrouter.ai/keys).'; desenharTudo(); return; }
    lerCampos();
    iaProprio.lendo = rotulo; iaProprio.erro = '';
    desenharTudo();
    try {
      const chave = await abrirChave(ia.cifrada, app.cifra);
      if (!chave) throw new Error('A chave da IA não abriu. Salve de novo em Ajustes > Garry (IA).');
      await fazer({ ...ia, chave });
    } catch (e) {
      iaProprio.erro = e.message;
    } finally {
      iaProprio.lendo = '';
      if (d.open && est.proprio) desenharTudo();
    }
  };
  const preencher = (v) => {
    for (const k of ['nome', 'quantidade', 'kcal', 'proteina', 'carboidrato', 'gordura']) if (v[k] !== undefined && v[k] !== null) proprio[k] = k === 'nome' ? v[k] : numeroBr(v[k]);
    if (v.unidade) proprio.unidade = v.unidade;
    iaProprio.feito = true;
  };
  const lerFotoDoRotulo = (arquivo) => comIa('rotulo', async (ia) => {
    const img = await prepararImagem(arquivo);
    const r = await lerRotulo(ia, img.url);
    preencher({ nome: proprio.nome.trim() || r.nome || '', quantidade: r.porcao, unidade: r.unidade, kcal: r.kcal, proteina: r.proteina, carboidrato: r.carboidrato, gordura: r.gordura });
  });
  const preencherPeloNome = () => comIa('nome', async (ia) => {
    const nome = proprio.nome.trim();
    if (!nome) throw new Error('Escreva o nome do alimento (e a marca, se tiver) para a IA calcular.');
    const qtd = Number(String(proprio.quantidade).replace(',', '.'));
    const pedido = Number.isFinite(qtd) && qtd > 0 ? `${nome}, ${textoDaMedida(qtd, proprio.unidade)}` : nome;
    const [item] = await estimarComIa(ia, pedido);
    if (!item) throw new Error('A IA não achou esse alimento. Escreva de outro jeito.');
    const peso = item.peso ?? null;
    preencher({ quantidade: peso ?? (Number.isFinite(qtd) && qtd > 0 ? qtd : 1), unidade: peso ? (item.unidade === 'ml' ? 'ml' : 'g') : proprio.unidade, kcal: item.kcal, proteina: item.proteina, carboidrato: item.carboidrato, gordura: item.gordura });
  });
  const painelProprio = () => {
    const c = (k, rotulo, extra = {}) => {
      campos[k] = h('input', { class: 'campo', value: proprio[k], 'aria-label': rotulo, ...extra });
      return h('label', { class: 'ali-campo' }, h('span', { texto: rotulo }), campos[k]);
    };
    const unidade = pilulas('ali-unidade', 'Unidade', [['g', 'g'], ['ml', 'ml'], ...MEDIDAS.map((m) => [m, m])], proprio.unidade, (v) => { proprio.unidade = v; });
    requestAnimationFrame(() => movimento.pilulaDosChips(unidade.el, 'ali-unidade'));
    const foto = h('input', { type: 'file', accept: 'image/*', class: 'imp-arquivo', 'aria-label': 'Tirar foto do rótulo', disabled: iaProprio.lendo ? true : null });
    foto.addEventListener('change', () => { const a = foto.files?.[0]; if (a) lerFotoDoRotulo(a); });
    const lendo = (qual, texto) => (iaProprio.lendo === qual ? h('span', { class: 'ali-ia-lendo' }, h('i', { class: 'imp-giro', 'aria-hidden': 'true' }), texto) : null);
    return h('div', { class: 'cartao ali-escolhido ali-form' },
      h('div', { class: 'ali-escolhido-topo' }, h('p', { class: 'ali-escolhido-nome', texto: 'Alimento próprio' }),
        h('button', { class: 'botao texto', type: 'button', onclick: () => { est.proprio = false; desenharTudo(); }, texto: 'Voltar' })),
      h('div', { class: 'ali-ia-atalhos' },
        h('label', { class: 'ali-ia-atalho', 'data-lendo': iaProprio.lendo === 'rotulo' ? 'sim' : null }, foto, icone('imagem'),
          lendo('rotulo', 'Lendo o rótulo…') ?? h('span', {}, h('b', { texto: 'Foto do rótulo' }), h('small', { texto: 'a IA lê a tabela' }))),
        h('button', { class: 'ali-ia-atalho', type: 'button', disabled: iaProprio.lendo ? true : null, onclick: preencherPeloNome, 'data-lendo': iaProprio.lendo === 'nome' ? 'sim' : null }, icone('ia'),
          lendo('nome', 'Calculando…') ?? h('span', {}, h('b', { texto: 'Preencher com a IA' }), h('small', { texto: 'pelo nome e quantidade' })))),
      iaProprio.erro ? h('p', { class: 'ali-erro', role: 'alert', texto: iaProprio.erro }) : null,
      iaProprio.feito && !iaProprio.lendo && !iaProprio.erro ? h('p', { class: 'ali-ia-ok', role: 'status', texto: 'Preenchido. Confira os números e salve.' }) : null,
      c('nome', 'Nome', { placeholder: 'Ex.: Tapioca com queijo', enterkeyhint: 'next' }),
      h('div', { class: 'ed-secao ali-por' }, h('p', { class: 'ed-titulo', texto: 'A tabela nutricional vale por' }),
        h('div', { class: 'ali-por-linha' }, c('quantidade', 'Quantidade', { inputmode: 'decimal' })), unidade.el),
      h('div', { class: 'ali-grade' },
        c('kcal', 'Calorias (kcal)', { inputmode: 'decimal' }), c('proteina', 'Proteína (g)', { inputmode: 'decimal' }),
        c('carboidrato', 'Carboidrato (g)', { inputmode: 'decimal' }), c('gordura', 'Gordura (g)', { inputmode: 'decimal' })),
      aviso,
      h('button', { class: 'botao principal cheio', type: 'button', onclick: salvarProprio, texto: 'Salvar e escolher a quantidade' }),
      h('p', { class: 'cardio-dica', texto: 'Fica salvo nos seus alimentos, aqui e no computador.' }));
  };

  const desenharTudo = () => {
    if (est.proprio) corpo.replaceChildren(painelProprio());
    else if (est.escolha) corpo.replaceChildren(painelEscolhido());
    else { corpo.replaceChildren(campo, lista); desenharLista(); }
    movimento.alimentoMudou(corpo);
  };
  desenharTudo();
  setTimeout(() => { if (!est.escolha && !est.proprio) campo.focus(); }, 60);
  return d;
}

// ---------- a meta: objetivo e dados para a conta ----------

function abrirMetaDieta() {
  const perfil = { ...perfilDaConta() };
  const { pesoKg, plano } = dietaDeHoje();
  const secao = (titulo, ...filhos) => h('div', { class: 'ed-secao' }, h('p', { class: 'ed-titulo', texto: titulo }), ...filhos);
  const previa = h('div', { class: 'meta-previa', 'aria-live': 'polite' });
  const desenharPrevia = () => {
    const nec = necessidadeDiaria(perfil, pesoKg);
    const doPlano = totalDoPlanoDe(plano);
    if (!nec) {
      previa.replaceChildren(h('p', { class: 'meta-falta', texto: pesoKg === null ? 'Registre o peso para calcular a sua meta.' : 'Preencha sexo, idade e altura para calcular.' }),
        h('p', { class: 'cardio-dica', texto: plano.length > 0 ? `Sem isso, a meta do dia é o total do seu plano: ${n0(doPlano.kcal)} kcal.` : 'Sem isso, a meta do dia é o total do plano (monte o plano depois).' }));
      return;
    }
    const b = h('b', { class: 'meta-kcal' });
    previa.replaceChildren(h('div', { class: 'meta-linha' }, b, h('small', { texto: 'kcal por dia' })),
      h('div', { class: 'meta-macros' }, ...[['Proteína', nec.proteina], ['Carbo', nec.carboidrato], ['Gordura', nec.gordura]].map(([n, v]) => h('span', {}, h('b', { texto: `${n0(v)} g` }), h('small', { texto: n })))),
      h('p', { class: 'cardio-dica', texto: `Pela fórmula de Mifflin-St Jeor com ${kg(pesoKg)}${plano.length > 0 ? `. Seu plano soma ${n0(doPlano.kcal)} kcal` : ''}.` }));
    movimento.contar(b, 'meta-kcal', nec.kcal, n0);
  };
  const num = (k, rotulo, sufixo, min, max) => {
    const el = h('input', { class: 'campo', inputmode: 'numeric', value: perfil[k] ?? '', placeholder: '—', 'aria-label': rotulo });
    el.addEventListener('input', () => { const v = Number(el.value); perfil[k] = Number.isFinite(v) && v >= min && v <= max ? Math.round(v) : null; desenharPrevia(); });
    return h('label', { class: 'ali-campo' }, h('span', { texto: `${rotulo} (${sufixo})` }), el);
  };
  const objetivo = pilulas('meta-objetivo', 'Objetivo', OBJETIVOS.map(([v, n]) => [v, n.split(' ')[0]]), perfil.objetivo, (v) => { perfil.objetivo = v; desenharPrevia(); });
  const sexo = pilulas('meta-sexo', 'Sexo', SEXOS, perfil.sexo, (v) => { perfil.sexo = v; desenharPrevia(); });
  const atividade = pilulas('meta-atividade', 'Atividade', ATIVIDADES, perfil.atividade, (v) => { perfil.atividade = v; desenharPrevia(); });
  const d = folha('Meta da dieta', [
    h('div', { class: 'cartao cardio-folha' },
      previa,
      secao('Objetivo', objetivo.el),
      secao('Você', sexo.el, h('div', { class: 'ali-grade' }, num('idade', 'Idade', 'anos', 12, 100), num('alturaCm', 'Altura', 'cm', 100, 250))),
      secao('Atividade no dia', atividade.el, h('p', { class: 'cardio-dica', texto: 'Leve: pouco movimento. Moderada: treino 3 a 5 vezes. Alta: treino quase todo dia ou trabalho físico.' }))),
  ], {
    acao: {
      nome: 'Salvar', fazer: () => {
        mudar((e) => definirConfig(e, 'perfilNutricao', JSON.stringify(validarPerfil(perfil))));
        desenhar();
      },
    },
  });
  d.classList.add('folha-meta');
  desenharPrevia();
  requestAnimationFrame(() => { for (const [g, k] of [[objetivo, 'meta-objetivo'], [sexo, 'meta-sexo'], [atividade, 'meta-atividade']]) movimento.pilulaDosChips(g.el, k); });
  movimento.cardioAbriu(d);
}

// ---------- o plano: montar e mexer pelo iPhone ----------

function abrirPlanoDieta() {
  const rasc = structuredClone(planoDaConta());
  const { perfil, pesoKg } = dietaDeHoje();
  const corpo = h('div', { class: 'pl-editor' });
  const d = folha('Meu plano', [corpo], {
    acao: {
      nome: 'Salvar', fazer: () => {
        const pronto = prepararPlano(rasc);
        if (pronto.erro) { erro.textContent = pronto.erro; erro.scrollIntoView({ block: 'center' }); return false; }
        const texto = JSON.stringify(pronto.plano);
        if (!validarPlano(JSON.parse(texto))) { erro.textContent = 'O plano ficou com algum item estranho. Confira as quantidades.'; return false; }
        mudar((e) => definirConfig(e, 'planoAlimentar', texto));
        desenhar();
      },
    },
  });
  d.classList.add('folha-plano');
  const erro = h('p', { class: 'ali-erro', role: 'alert' });

  const desenharEditor = () => {
    const total = totalDoPlanoDe(rasc);
    const nec = necessidadeDiaria(perfil, pesoKg);
    const ordem = [...rasc].sort((a, b) => (a.hora < b.hora ? -1 : 1));
    const topo = h('div', { class: 'cartao pl-total' },
      h('div', { class: 'meta-linha' }, h('b', { class: 'meta-kcal', texto: n0(total.kcal) }), h('small', { texto: nec ? `de ${n0(nec.kcal)} kcal da meta` : 'kcal no dia' })),
      h('div', { class: 'meta-macros' }, ...[['Proteína', total.proteina], ['Carbo', total.carboidrato], ['Gordura', total.gordura]].map(([n, v]) => h('span', {}, h('b', { texto: `${n0(v)} g` }), h('small', { texto: n })))));
    const cartoes = ordem.map((r) => {
      const hora = h('input', { class: 'campo pl-hora', type: 'time', value: r.hora, 'aria-label': `Hora de ${r.titulo}` });
      hora.addEventListener('change', () => { if (/^\d\d:\d\d$/.test(hora.value)) { r.hora = hora.value; desenharEditor(); } });
      const titulo = h('input', { class: 'campo pl-nome', value: r.titulo, 'aria-label': 'Nome da refeição', maxlength: '60' });
      titulo.addEventListener('input', () => { r.titulo = titulo.value; });
      const tot = totalDoPlanoDe([r]);
      const itens = r.itens.map((item, k) => {
        const escolha = escolhaDoItem(item);
        const m = macrosDoItem(item);
        const mexer = (sinal) => {
          const passo = passoDe(item.unidade, item.quantidade);
          const novo = Math.max(passo, Math.round((item.quantidade + sinal * passo) / passo) * passo);
          r.itens[k] = itemDoPlano(escolha, Math.round(novo * 10) / 10, item.id);
          desenharEditor();
        };
        return h('li', { class: 'pl-item' },
          h('div', { class: 'pl-item-texto' }, h('span', { class: 'ali-nome', texto: item.nome }), h('span', { class: 'ali-sub', texto: `${n0(m.kcal)} kcal · ${numeroBr(m.proteina)} g P` })),
          h('div', { class: 'pl-item-qtd' },
            h('button', { class: 'pl-mini', type: 'button', 'aria-label': `Menos ${item.nome}`, onclick: () => mexer(-1) }, icone('menos')),
            h('span', { class: 'pl-item-valor', texto: textoDaMedida(item.quantidade, item.unidade) }),
            h('button', { class: 'pl-mini', type: 'button', 'aria-label': `Mais ${item.nome}`, onclick: () => mexer(1) }, icone('mais'))),
          h('button', { class: 'pl-mini pl-tirar', type: 'button', 'aria-label': `Tirar ${item.nome}`, onclick: () => { r.itens.splice(k, 1); desenharEditor(); } }, icone('fechar')));
      });
      return h('section', { class: 'cartao pl-refeicao', 'data-ref': r.habitoId },
        h('div', { class: 'pl-cabeca' }, hora, titulo,
          h('button', {
            class: 'pl-mini pl-tirar', type: 'button', 'aria-label': `Tirar ${r.titulo}`, onclick: (ev) => {
              const b = ev.currentTarget;
              if (r.itens.length > 0 && b.dataset.certeza !== 'sim') { b.dataset.certeza = 'sim'; b.classList.add('certeza'); b.setAttribute('aria-label', `Tocar de novo para tirar ${r.titulo}`); return; }
              rasc.splice(rasc.indexOf(r), 1);
              desenharEditor();
            },
          }, icone('fechar'))),
        h('ul', { class: 'pl-itens' }, itens),
        h('div', { class: 'pl-rodape' },
          h('button', {
            class: 'botao texto', type: 'button', onclick: () => escolherAlimento({
              modo: 'plano', aoEscolher: (escolha, q) => { r.itens.push(itemDoPlano(escolha, q, novoId())); desenharEditor(); },
            }),
          }, icone('mais'), ' Alimento'),
          h('span', { class: 'pl-soma', texto: `${n0(tot.kcal)} kcal · ${n0(tot.proteina)} g P` })));
    });
    const nova = novaRefeicao(rasc);
    const importar = h('button', { class: 'ali-ia pl-importar', type: 'button', onclick: () => { d.close(); abrirImportarDieta(); } },
      icone('ia'), h('span', { texto: 'Importar a dieta com IA' }), h('small', { texto: 'print, foto ou texto: a IA monta as refeições com os macros' }));
    corpo.replaceChildren(topo, importar, ...cartoes,
      nova ? h('button', { class: 'botao cheio pl-nova', type: 'button', onclick: () => { rasc.push(nova); desenharEditor(); } }, icone('mais'), ` ${nova.titulo}`) : h('p', { class: 'cardio-dica pl-cheio', texto: 'O plano tem as cinco refeições do dia.' }),
      erro,
      h('p', { class: 'cardio-dica', texto: 'O plano é o mesmo do computador: salvar aqui troca lá também.' }));
  };
  desenharEditor();
  movimento.planoAbriu(d);
}

// ---------- o peso ----------

const PERIODOS_PESO = [[7, '7 dias'], [30, '30 dias'], [90, '90 dias'], [null, 'Tudo']];

/** O grafico do peso: linha, area, a reta da tendencia e um ponto por registro (tocar = escolher o dia). */
function graficoDoPeso(pesos, tendencia, dia) {
  const L = 340; const A = 150; const M = { e: 30, d: 12, t: 14, b: 22 };
  const lista = pesosDoPeriodo(pesos, dietaUi.periodo, dia);
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', `0 0 ${L} ${A}`);
  svg.setAttribute('class', 'peso-grafico');
  svg.setAttribute('role', 'img');
  if (lista.length === 0) {
    svg.setAttribute('aria-label', 'Sem registros no período');
    svg.innerHTML = `<text x="${L / 2}" y="${A / 2}" text-anchor="middle" class="peso-vazio">Sem registros neste período</text>`;
    return svg;
  }
  const ms = (d) => Date.UTC(+d.slice(0, 4), +d.slice(5, 7) - 1, +d.slice(8, 10));
  const x0 = dietaUi.periodo === null ? ms(lista[0].dia_logico) : ms(dia) - (dietaUi.periodo - 1) * 86_400_000;
  const x1 = Math.max(ms(dia), ms(lista.at(-1).dia_logico));
  const vs = lista.map((p) => p.valor_kg);
  const min = Math.floor((Math.min(...vs) - 0.4) * 2) / 2;
  const max = Math.ceil((Math.max(...vs) + 0.4) * 2) / 2;
  const X = (d) => M.e + (x1 === x0 ? 0.5 : (ms(d) - x0) / (x1 - x0)) * (L - M.e - M.d);
  const Y = (v) => M.t + (1 - (v - min) / (max - min)) * (A - M.t - M.b);
  const pts = lista.map((p) => [X(p.dia_logico), Y(p.valor_kg)]);
  const linha = pts.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(1)},${y.toFixed(1)}`).join(' ');
  const area = `${linha} L${pts.at(-1)[0].toFixed(1)},${A - M.b} L${pts[0][0].toFixed(1)},${A - M.b} Z`;
  const guias = [min, (min + max) / 2, max].map((v) => `<line class="peso-guia" x1="${M.e}" x2="${L - M.d}" y1="${Y(v)}" y2="${Y(v)}"/><text class="peso-eixo" x="${M.e - 6}" y="${Y(v) + 3.5}" text-anchor="end">${numeroBr(Math.round(v * 10) / 10)}</text>`).join('');
  let reta = '';
  if (tendencia) {
    const xa = Math.max(x0, ms(tendencia.desde));
    const ya = tendencia.inicio + tendencia.porDia * ((xa - ms(tendencia.desde)) / 86_400_000);
    const yb = tendencia.inicio + tendencia.porDia * ((x1 - ms(tendencia.desde)) / 86_400_000);
    const xa2 = M.e + (x1 === x0 ? 0.5 : (xa - x0) / (x1 - x0)) * (L - M.e - M.d);
    reta = `<line class="peso-tendencia-reta" x1="${xa2.toFixed(1)}" y1="${Y(ya).toFixed(1)}" x2="${(L - M.d).toFixed(1)}" y2="${Y(yb).toFixed(1)}"/>`;
  }
  const rotulo = (d) => `${d.slice(8, 10)}/${d.slice(5, 7)}`;
  const eixoX = `<text class="peso-eixo" x="${M.e}" y="${A - 6}">${rotulo(new Date(x0).toISOString().slice(0, 10))}</text><text class="peso-eixo" x="${L - M.d}" y="${A - 6}" text-anchor="end">${rotulo(dia)}</text>`;
  svg.innerHTML = `<defs><linearGradient id="peso-area" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#5bd4e4" stop-opacity="0.32"/><stop offset="1" stop-color="#5bd4e4" stop-opacity="0"/></linearGradient>
    <linearGradient id="peso-linha" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#39e27a"/><stop offset="1" stop-color="#5bd4e4"/></linearGradient></defs>
    ${guias}${eixoX}<path class="peso-area" d="${area}"/>${reta}<path class="peso-linha" d="${linha}" pathLength="1"/>
    ${lista.map((p, i) => `<g class="peso-ponto${p.dia_logico === dietaUi.pesoSel ? ' escolhido' : ''}" data-dia="${p.dia_logico}"><circle class="peso-alvo" cx="${pts[i][0]}" cy="${pts[i][1]}" r="14"/><circle class="peso-bola" cx="${pts[i][0]}" cy="${pts[i][1]}" r="${lista.length > 40 ? 2.4 : 3.6}"/></g>`).join('')}`;
  svg.setAttribute('aria-label', `Peso de ${rotulo(lista[0].dia_logico)} a ${rotulo(lista.at(-1).dia_logico)}: de ${kg(lista[0].valor_kg)} a ${kg(lista.at(-1).valor_kg)}`);
  // Arrastar o dedo mostra o dia mais perto; soltar escolhe.
  const perto = (ev) => {
    const r = svg.getBoundingClientRect();
    const x = ((ev.clientX - r.left) / r.width) * L;
    let melhor = 0;
    pts.forEach(([px], i) => { if (Math.abs(px - x) < Math.abs(pts[melhor][0] - x)) melhor = i; });
    return melhor;
  };
  const dica = (i) => {
    svg.querySelectorAll('.peso-ponto').forEach((g, k) => g.classList.toggle('mira', k === i));
    const caixa = svg.closest('.peso-cartao')?.querySelector('.peso-dica');
    if (caixa) {
      caixa.textContent = `${rotulo(lista[i].dia_logico)} · ${kg(lista[i].valor_kg)}`;
      caixa.style.left = `${(pts[i][0] / L) * 100}%`;
      caixa.style.top = `${(pts[i][1] / A) * 100}%`;
      caixa.hidden = false;
    }
  };
  svg.addEventListener('pointerdown', (ev) => { svg.setPointerCapture?.(ev.pointerId); dica(perto(ev)); });
  svg.addEventListener('pointermove', (ev) => { if (ev.buttons || ev.pointerType === 'mouse') dica(perto(ev)); });
  svg.addEventListener('pointerup', (ev) => {
    const i = perto(ev);
    dietaUi.pesoSel = dietaUi.pesoSel === lista[i].dia_logico ? null : lista[i].dia_logico;
    desenhar();
  });
  svg.addEventListener('pointerleave', () => { const c = svg.closest('.peso-cartao')?.querySelector('.peso-dica'); if (c) c.hidden = true; });
  return svg;
}

function cartaoPeso({ dia, pesos, perfil }) {
  const ultimo = pesos.at(-1) ?? null;
  const tendencia = tendenciaDoPeso(pesos, dia);
  const sel = dietaUi.pesoSel ? app.estado.pesos[dietaUi.pesoSel] ?? null : null;
  if (dietaUi.pesoSel && !sel) dietaUi.pesoSel = null;
  const alvoDia = sel ? sel.dia_logico : dia;
  const doAlvo = app.estado.pesos[alvoDia] ?? null;
  let valor = doAlvo?.valor_kg ?? ultimo?.valor_kg ?? 70;

  const campo = h('input', { class: 'campo ed-passo-valor peso-valor', inputmode: 'decimal', enterkeyhint: 'done', value: numeroBr(valor), 'aria-label': `Peso de ${alvoDia === dia ? 'hoje' : dataCurta(alvoDia)} em kg` });
  campo.addEventListener('focus', () => campo.select());
  campo.addEventListener('input', () => { const v = Number(campo.value.replace(',', '.')); if (Number.isFinite(v)) valor = v; });
  const mexer = (d) => { valor = Math.round((valor + d) * 10) / 10; campo.value = numeroBr(valor); movimento.numeroMudou(campo, d); };
  // segurar o - ou o + anda sozinho
  const botao = (d, rot, ic) => {
    let relogio = null;
    const parar = () => { clearInterval(relogio); relogio = null; };
    const b = h('button', { class: 'ed-passo-botao', type: 'button', 'aria-label': rot, onclick: (ev) => { if (ev.detail === 0) mexer(d); } }, icone(ic));
    b.addEventListener('pointerdown', () => { mexer(d); parar(); let n = 0; relogio = setInterval(() => { n += 1; if (n > 3) mexer(d); }, 110); });
    for (const t of ['pointerup', 'pointerleave', 'pointercancel']) b.addEventListener(t, parar);
    return b;
  };
  const gravar = () => {
    const v = Number(String(campo.value).replace(',', '.'));
    if (!Number.isFinite(v) || v < 25 || v > 350) { movimento.nega(campo); return; }
    mudar((e) => escrever(e, 'registros_peso', [alvoDia], { dia_logico: alvoDia, valor_kg: Math.round(v * 10) / 10, registrado_em: new Date().toISOString() }));
    dietaUi.pesoSel = null;
    desenhar();
  };

  const seta = tendencia === null ? null : Math.abs(tendencia.porSemana) < 0.05 ? 'igual' : tendencia.porSemana > 0 ? 'subir' : 'descer';
  const periodo = pilulas('peso-periodo', 'Período do gráfico', PERIODOS_PESO, dietaUi.periodo, (v) => { dietaUi.periodo = v; desenhar(); });
  periodo.el.dataset.chave = 'peso-periodo';
  const anterior = pesos.filter((p) => p.dia_logico < (ultimo?.dia_logico ?? dia)).at(-1);
  const delta = ultimo && anterior ? Math.round((ultimo.valor_kg - anterior.valor_kg) * 10) / 10 : null;

  return h('section', { class: 'cartao peso-cartao' },
    h('div', { class: 'peso-topo' },
      h('div', { class: 'peso-numero' },
        ultimo ? h('b', { 'data-peso-numero': String(ultimo.valor_kg) }) : h('b', { texto: '—' }), h('small', { texto: 'kg' }),
        h('span', { class: 'peso-quando', texto: !ultimo ? 'nenhum registro ainda' : ultimo.dia_logico === dia ? 'hoje' : `em ${dataCurta(ultimo.dia_logico)}` })),
      tendencia ? h('div', { class: `peso-tendencia${seta ? ` t-${seta}` : ''}` }, icone(seta),
        h('b', { texto: `${tendencia.porSemana > 0 ? '+' : tendencia.porSemana < 0 ? '−' : ''}${numeroBr(Math.abs(tendencia.porSemana))}` }), h('small', { texto: 'kg/sem' }))
        : delta !== null ? h('div', { class: 'peso-tendencia' }, h('b', { texto: `${delta > 0 ? '+' : delta < 0 ? '−' : ''}${numeroBr(Math.abs(delta))}` }), h('small', { texto: 'desde o anterior' })) : null),
    h('p', { class: 'peso-leitura', texto: leituraDoPeso(tendencia, perfil.objetivo, ultimo?.valor_kg ?? null) }),
    h('div', { class: 'peso-grafico-caixa' }, graficoDoPeso(pesos, tendencia, dia), h('div', { class: 'peso-dica', hidden: true })),
    periodo.el,
    h('div', { class: 'peso-registro' },
      h('p', { class: 'ed-titulo', texto: sel ? `Corrigir ${dataCurta(alvoDia)}` : doAlvo ? 'Peso de hoje (registrado)' : 'Peso de hoje' }),
      h('div', { class: 'peso-registro-linha' },
        h('div', { class: 'ed-passo peso-passo' }, botao(-0.1, 'Menos 100 gramas', 'menos'), h('div', { class: 'ali-passo-valor' }, campo, h('small', { texto: 'kg' })), botao(0.1, 'Mais 100 gramas', 'mais')),
        h('button', { class: 'botao principal peso-gravar', type: 'button', onclick: gravar }, doAlvo ? 'Corrigir' : 'Registrar')),
      sel ? h('div', { class: 'peso-sel' },
        h('button', { class: 'botao texto', type: 'button', onclick: () => { dietaUi.pesoSel = null; desenhar(); }, texto: 'Voltar para hoje' }),
        h('button', {
          class: 'botao texto perigo', type: 'button', onclick: (ev) => {
            const b = ev.currentTarget;
            if (b.dataset.certeza !== 'sim') { b.dataset.certeza = 'sim'; b.textContent = `Tocar de novo para apagar ${dataCurta(alvoDia)}`; return; }
            mudar((e) => escrever(e, 'registros_peso', [alvoDia], null));
            dietaUi.pesoSel = null;
            desenhar();
          }, texto: 'Apagar este dia',
        })) : null));
}

// ---------- a tela ----------

// ---------- a refeicao alimento por alimento (17/11/2026) ----------
// "nao tem opcao de se eu comi tal alimento ou nao, e so sim ou nao, HORRIVEL": cada alimento do plano
// e um toque (comi / nao comi) com a quantidade de hoje; "Comi tudo" continua para o dia normal.

let toqueNaRefeicao = null; // o alimento que acabou de mudar (anima so ele)

/** Grava a refeicao como `itens` diz (comi/nao comi e quanto), no formato do PC. */
function gravarRefeicao(r, dia, itens, extras) {
  const g = gravarItens(itens, extras);
  mudar((e) => {
    for (const id of g.apagar) escrever(e, 'consumo_extra', [id], null);
    for (const l of g.linhas) {
      const id = l.id ?? novoId();
      escrever(e, 'consumo_extra', [id], linhaDoConsumo({ id, dia, descricao: l.descricao, macros: l.macros, refeicao: r.habitoId }));
    }
    const jaMarcada = Object.values(e.marcas).some((m) => m.habito_id === r.habitoId && m.dia_logico === dia);
    if (g.marcar && !jaMarcada) escrever(e, 'marcas_habito', [r.habitoId, dia], { habito_id: r.habitoId, dia_logico: dia, marcado_em: new Date().toISOString() });
    if (!g.marcar && jaMarcada) escrever(e, 'marcas_habito', [r.habitoId, dia], null);
    if (g.marcar && Object.values(e.puladas).some((p) => p.dia === dia && p.habito_id === r.habitoId)) escrever(e, 'refeicoes_puladas', [dia, r.habitoId], null);
  });
}

function corpoDaRefeicao(r, dia) {
  const { itens, extras } = itensDaRefeicao(r);
  const aplicar = (novos, chave) => { toqueNaRefeicao = chave; gravarRefeicao(r, dia, novos, extras); refeicaoAberta.add(r.habitoId); refeicaoFechada.delete(r.habitoId); desenhar(); };
  const comidos = itens.filter((x) => x.comeu);
  const linhas = itens.map((x, k) => {
    const chave = `${r.habitoId}:${x.item.id}`;
    const m = macrosNaQuantidade(x.item, x.quantidade);
    const alternar = () => aplicar(itens.map((y, j) => (j === k ? { ...y, comeu: !y.comeu, quantidade: y.comeu ? y.item.quantidade : y.quantidade } : y)), chave);
    const mexer = (sinal) => {
      const passo = passoDe(x.item.unidade, x.quantidade);
      const novo = Math.round(Math.max(passo, Math.round((x.quantidade + sinal * passo) / passo) * passo) * 10) / 10;
      aplicar(itens.map((y, j) => (j === k ? { ...y, quantidade: Math.min(5000, novo) } : y)), chave);
    };
    const mudou = x.comeu && Math.abs(x.quantidade - x.item.quantidade) > 1e-9;
    const li = h('li', { class: 'ref-item', 'data-comeu': x.comeu ? 'sim' : 'nao', 'data-toque': toqueNaRefeicao === chave ? 'sim' : null },
      h('button', { class: 'ref-item-toque', type: 'button', 'aria-pressed': String(x.comeu), 'aria-label': `Comi ${x.item.nome}`, onclick: alternar },
        h('span', { class: 'ref-check', 'aria-hidden': 'true' }, icone('check')),
        h('span', { class: 'ref-item-texto' },
          h('span', { class: 'ref-item-nome', texto: x.item.nome }),
          h('span', { class: 'ref-item-sub', texto: x.comeu
            ? `${n0(m.kcal)} kcal · ${numeroBr(m.proteina)} g P`
            : `${textoDaMedida(x.quantidade, x.item.unidade)} · ${n0(m.kcal)} kcal · ${numeroBr(m.proteina)} g P` }))),
      x.comeu ? h('div', { class: 'ref-item-qtd' },
        h('button', { class: 'pl-mini', type: 'button', 'aria-label': `Menos ${x.item.nome}`, onclick: () => mexer(-1) }, icone('menos')),
        h('span', { class: 'ref-item-valor', 'data-mudou': mudou ? 'sim' : null, texto: textoDaMedida(x.quantidade, x.item.unidade) }),
        h('button', { class: 'pl-mini', type: 'button', 'aria-label': `Mais ${x.item.nome}`, onclick: () => mexer(1) }, icone('mais'))) : null);
    return li;
  });
  const extrasLi = extras.map((c) => h('li', { class: 'ref-item ref-item-extra', 'data-comeu': 'sim' },
    h('span', { class: 'ref-item-toque ref-item-fixo' },
      h('span', { class: 'ref-check ref-check-mais', 'aria-hidden': 'true' }, icone('mais')),
      h('span', { class: 'ref-item-texto' }, h('span', { class: 'ref-item-nome', texto: quantidadeOuNome(c.descricao).nome }),
        h('span', { class: 'ref-item-sub', texto: `${quantidadeOuNome(c.descricao).resto}${n0(c.kcal)} kcal · ${numeroBr(c.proteina)} g P · fora do plano` }))),
    h('div', { class: 'ref-item-qtd' }, h('button', { class: 'pl-mini pl-tirar', type: 'button', 'aria-label': `Tirar ${c.descricao}`, onclick: () => { tirarComida(c); desenhar(); } }, icone('fechar')))));

  const somaComida = r.feita ? r.totais : null;
  const resumoTexto = r.pulada ? 'Você marcou que pulou.'
    : r.feita ? `Comeu ${n0(somaComida.kcal)} de ${n0(r.planejado.kcal)} kcal · ${n0(somaComida.proteina)} g P`
      : itens.length > 0 ? `Toque no que você comeu · plano ${n0(r.planejado.kcal)} kcal · ${n0(r.planejado.proteina)} g P` : 'Nada no plano desta refeição.';
  const todos = itens.length > 0 && comidos.length === itens.length && itens.every((x) => Math.abs(x.quantidade - x.item.quantidade) < 1e-9);
  const comiTudo = () => aplicar(itens.map((y) => ({ ...y, comeu: true, quantidade: y.item.quantidade })), `${r.habitoId}:tudo`);
  const nadaComido = () => {
    // Tudo sai: os alimentos do plano e os acrescentados; a refeicao volta a nao feita.
    mudar((e) => {
      for (const c of r.comido) escrever(e, 'consumo_extra', [c.id], null);
      escrever(e, 'marcas_habito', [r.habitoId, dia], null);
    });
    desenhar();
  };
  const pula = (pulou) => {
    mudar((e) => escrever(e, 'refeicoes_puladas', [dia, r.habitoId], pulou ? { dia, habito_id: r.habitoId, em: new Date().toISOString() } : null));
    if (pulou) { refeicaoAberta.delete(r.habitoId); refeicaoFechada.add(r.habitoId); }
    desenhar();
  };
  const mais = h('button', { class: 'botao', type: 'button', onclick: () => escolherAlimento({ modo: 'dia', refeicao: r.habitoId }) }, icone('mais'), ' Alimento');
  const acoes = r.pulada
    ? [h('button', { class: 'botao', type: 'button', onclick: () => pula(false), texto: 'Desfazer "Pulei"' })]
    : r.feita
      ? [todos ? null : h('button', { class: 'botao', type: 'button', onclick: comiTudo }, icone('check'), ' Comi tudo'), mais,
        h('button', { class: 'botao', type: 'button', onclick: nadaComido, texto: 'Desmarcar' })]
      : [itens.length > 0 ? h('button', { class: 'botao principal', type: 'button', onclick: comiTudo }, icone('check'), ' Comi tudo') : null, mais,
        h('button', { class: 'botao', type: 'button', onclick: () => pula(true), texto: 'Pulei' })];
  const corpo = [
    h('p', { class: 'ref-resumo', role: 'status', texto: resumoTexto }),
    h('ul', { class: 'ref-lista' }, linhas, extrasLi),
    h('div', { class: 'ref-acoes' }, acoes.filter(Boolean)),
  ];
  if (toqueNaRefeicao?.startsWith(`${r.habitoId}:`)) toqueNaRefeicao = null;
  return corpo;
}

/** "Pão de forma · 2 fatias" -> { nome: 'Pão de forma', resto: '2 fatias · ' }. */
function quantidadeOuNome(descricao) {
  const t = String(descricao);
  const i = t.indexOf(' · ');
  return i > 0 ? { nome: t.slice(0, i), resto: `${t.slice(i + 3)} · ` } : { nome: t, resto: '' };
}

// ---------- importar a dieta com IA (17/11/2026) ----------
// "nao tem como importar com ia a minha dieta": print, foto ou texto -> a IA transcreve as refeicoes e
// os alimentos com os macros -> revisar (quantidade, tirar, nome e hora) -> salvar como o plano.

function abrirImportarDieta() {
  const cfg = configDaIa(app.estado.config);
  const est = { modo: 'imagem', imagens: [], texto: '', lendo: false, erro: '', revisao: null, certeza: false };
  const corpo = h('div', { class: 'imp' });
  const d = folha('Importar dieta com IA', [corpo]);
  d.classList.add('folha-importar', 'folha-importar-dieta');

  const adicionarArquivos = async (lista) => {
    const arquivos = [...lista].filter((a) => a && a.size !== undefined);
    if (arquivos.length === 0) return;
    est.erro = '';
    for (const a of arquivos) {
      if (est.imagens.length >= LIMITES.imagens) { est.erro = `Até ${LIMITES.imagens} imagens de uma vez.`; break; }
      try { est.imagens.push(await prepararImagem(a)); } catch (e) { est.erro = e.message; }
    }
    est.modo = 'imagem';
    desenharImp();
  };
  d.addEventListener('paste', (ev) => {
    if (est.revisao || est.lendo) return;
    const arquivos = [...(ev.clipboardData?.items ?? [])].filter((i) => i.kind === 'file' && i.type.startsWith('image/')).map((i) => i.getAsFile());
    if (arquivos.length === 0) return;
    ev.preventDefault();
    adicionarArquivos(arquivos);
  });
  d.addEventListener('dragover', (ev) => { if (!est.revisao && !est.lendo) { ev.preventDefault(); corpo.dataset.solta = 'sim'; } });
  d.addEventListener('dragleave', () => { delete corpo.dataset.solta; });
  d.addEventListener('drop', (ev) => {
    delete corpo.dataset.solta;
    if (est.revisao || est.lendo) return;
    ev.preventDefault();
    adicionarArquivos(ev.dataTransfer?.files ?? []);
  });

  async function interpretar() {
    if (est.lendo) return;
    const texto = est.modo === 'texto' ? est.texto.trim() : '';
    const imagens = est.modo === 'imagem' ? est.imagens.map((i) => i.url) : [];
    if (!texto && imagens.length === 0) { est.erro = est.modo === 'texto' ? 'Cole a dieta no campo.' : 'Escolha, arraste ou cole uma imagem da dieta.'; desenharImp(); return; }
    est.erro = '';
    est.lendo = true;
    desenharImp();
    try {
      const chave = await abrirChave(cfg.cifrada, app.cifra);
      if (!chave) throw new Error('A chave da IA não abriu. Salve de novo em Ajustes > Garry (IA).');
      const lido = await interpretarDieta({ ...cfg, chave }, { texto, imagens });
      est.revisao = lido;
      est.certeza = false;
    } catch (e) {
      est.erro = e.message;
    } finally {
      est.lendo = false;
      if (d.open) desenharImp();
    }
  }

  function salvar(msg) {
    const plano = planoDaImportacao(est.revisao.refeicoes, novoId);
    if (plano.length === 0) { msg.textContent = 'Todas as refeições ficaram vazias.'; return; }
    const pronto = prepararPlano(plano);
    if (pronto.erro) { msg.textContent = pronto.erro; return; }
    const texto = JSON.stringify(pronto.plano);
    if (!validarPlano(JSON.parse(texto))) { msg.textContent = 'Algum alimento ficou com número estranho. Confira as quantidades.'; return; }
    const atual = planoDaConta();
    if (atual.length > 0 && !est.certeza) {
      est.certeza = true;
      msg.textContent = `Isso troca o seu plano atual (${n0(totalDoPlanoDe(atual).kcal)} kcal). Toque de novo para confirmar.`;
      return;
    }
    // Os alimentos lidos ficam nos salvos: aparecem em "Usados antes" para registrar depois, sem macro na mao.
    guardarSalvos(est.revisao.refeicoes.flatMap((r) => r.itens).slice(0, 60).map((i) => ({
      nome: i.nome, quantidade: textoDaMedida(i.quantidade, i.unidade === 'un' ? 'unidade' : i.unidade), peso: i.quantidade, unidade: i.unidade === 'un' ? 'unidade' : i.unidade, ...i.macros,
    })));
    mudar((e) => definirConfig(e, 'planoAlimentar', texto));
    document.querySelectorAll('dialog[open]').forEach((x) => x.close());
    desenhar();
  }

  function desenharImp() {
    if (!cfg?.cifrada) {
      corpo.replaceChildren(h('div', { class: 'cartao' },
        h('p', { texto: 'Para importar com IA, salve a chave do Garry.' }),
        h('p', { class: 'discreto', texto: 'É a mesma chave que o Garry usa (grátis no openrouter.ai/keys). Fica cifrada na sua conta.' }),
        h('button', { class: 'botao principal cheio', style: 'margin-top:12px', onclick: () => { d.close(); abrirAjustes(); }, texto: 'Abrir Ajustes' })));
      return;
    }
    if (est.revisao) { corpo.replaceChildren(...revisaoDaDieta()); return; }
    const modo = (m, rotulo) => h('button', { type: 'button', class: 'entrada-modo', 'aria-pressed': String(est.modo === m), disabled: est.lendo ? true : null, onclick: () => { est.modo = m; est.erro = ''; desenharImp(); } }, rotulo);
    const partes = [h('div', { class: 'entrada-modos imp-modos', role: 'group', 'aria-label': 'Importar de' }, modo('imagem', 'Imagem'), modo('texto', 'Texto'))];
    if (est.modo === 'imagem') {
      const escolher = h('input', { type: 'file', accept: 'image/*', multiple: true, class: 'imp-arquivo', 'aria-label': 'Escolher imagens da dieta' });
      escolher.addEventListener('change', () => adicionarArquivos(escolher.files ?? []));
      partes.push(
        h('label', { class: 'imp-solta', 'data-vazia': est.imagens.length === 0 ? 'sim' : null }, escolher, icone('imagem'),
          h('b', { texto: est.imagens.length === 0 ? 'Foto ou print da dieta' : 'Mais uma imagem' }),
          h('span', { texto: 'a do nutricionista, um PDF fotografado, um print. Até 6.' })),
        est.imagens.length > 0 ? h('div', { class: 'imp-fotos' }, est.imagens.map((img, i) => h('figure', { class: 'imp-foto' },
          h('img', { src: img.url, alt: `Imagem ${i + 1}: ${img.nome}` }),
          h('button', { class: 'imp-foto-tirar', type: 'button', 'aria-label': `Tirar a imagem ${i + 1}`, disabled: est.lendo ? true : null, onclick: () => { est.imagens.splice(i, 1); desenharImp(); } }, icone('fechar'))))) : null);
    } else {
      const campo = h('textarea', { class: 'campo imp-texto', rows: '10', placeholder: 'Cole aqui a dieta, do jeito que estiver. Ex.:\nCafé da manhã 07:30\n3 ovos mexidos\n2 fatias de pão integral\nAlmoço\n150 g de arroz, 120 g de frango grelhado, feijão', 'aria-label': 'Texto da dieta' });
      campo.value = est.texto;
      campo.addEventListener('input', () => { est.texto = campo.value; });
      partes.push(campo);
    }
    partes.push(h('p', { class: 'erro', role: 'alert', texto: est.erro }));
    partes.push(est.lendo
      ? h('div', { class: 'imp-lendo', role: 'status' }, h('i', { class: 'imp-giro', 'aria-hidden': 'true' }), h('span', { texto: 'Lendo a dieta e calculando os macros… pode levar até um minuto.' }))
      : h('button', { class: 'botao principal cheio', onclick: interpretar }, icone('ia'), 'Ler a dieta'));
    partes.push(h('p', { class: 'pequeno imp-rodape', texto: 'A IA transcreve o que estiver escrito e calcula os macros pela TACO. Nada é salvo antes de você revisar.' }));
    corpo.replaceChildren(...partes.filter(Boolean));
  }

  function revisaoDaDieta() {
    const rev = est.revisao;
    const msg = h('p', { class: 'erro', role: 'alert' });
    const total = totalDoPlanoDe(planoDaImportacao(rev.refeicoes, () => 'x'));
    const nItens = rev.refeicoes.reduce((n, r) => n + r.itens.length, 0);
    const cartoes = rev.refeicoes.map((r, iR) => {
      const soma = r.itens.reduce((t, i) => ({ kcal: t.kcal + i.macros.kcal, proteina: t.proteina + i.macros.proteina }), { kcal: 0, proteina: 0 });
      const hora = h('input', { class: 'campo pl-hora', type: 'time', value: r.hora, 'aria-label': `Hora de ${r.titulo}` });
      hora.addEventListener('change', () => { if (/^\d\d:\d\d$/.test(hora.value)) { r.hora = hora.value; } });
      const titulo = h('input', { class: 'campo pl-nome', value: r.titulo, maxlength: '60', 'aria-label': 'Nome da refeição' });
      titulo.addEventListener('input', () => { r.titulo = titulo.value; });
      const slot = REFEICOES.find((x) => x.habitoId === r.habitoId);
      return h('section', { class: 'cartao pl-refeicao imp-refeicao' },
        h('div', { class: 'pl-cabeca' }, hora, titulo,
          h('button', { class: 'pl-mini pl-tirar', type: 'button', 'aria-label': `Tirar ${r.titulo}`, onclick: () => { rev.refeicoes.splice(iR, 1); desenharImp(); } }, icone('fechar'))),
        h('p', { class: 'imp-nota-dia', texto: `No computador conta como ${slot.titulo}${r.juntou.length ? `. Juntei aqui: ${r.juntou.join(', ')}` : ''}.` }),
        h('ul', { class: 'pl-itens' }, r.itens.map((i, k) => {
          const mexer = (sinal) => {
            const passo = passoDe(i.unidade, i.quantidade);
            const novo = Math.round(Math.max(passo, Math.round((i.quantidade + sinal * passo) / passo) * passo) * 10) / 10;
            r.itens[k] = itemImportadoEm(i, Math.min(5000, novo));
            desenharImp();
          };
          return h('li', { class: 'pl-item', 'data-confianca': i.confianca },
            h('div', { class: 'pl-item-texto' }, h('span', { class: 'ali-nome', texto: i.nome }),
              h('span', { class: 'ali-sub', texto: `${n0(i.macros.kcal)} kcal · ${numeroBr(i.macros.proteina)} g P · ${numeroBr(i.macros.carboidrato)} C · ${numeroBr(i.macros.gordura)} G${i.como ? ` · “${i.como}”` : ''}${i.confianca === 'baixa' ? ' · confira' : ''}` })),
            h('div', { class: 'pl-item-qtd' },
              h('button', { class: 'pl-mini', type: 'button', 'aria-label': `Menos ${i.nome}`, onclick: () => mexer(-1) }, icone('menos')),
              h('span', { class: 'pl-item-valor', texto: textoDaMedida(i.quantidade, i.unidade) }),
              h('button', { class: 'pl-mini', type: 'button', 'aria-label': `Mais ${i.nome}`, onclick: () => mexer(1) }, icone('mais'))),
            h('button', { class: 'pl-mini pl-tirar', type: 'button', 'aria-label': `Tirar ${i.nome}`, onclick: () => { r.itens.splice(k, 1); if (r.itens.length === 0) rev.refeicoes.splice(iR, 1); desenharImp(); } }, icone('fechar')));
        })),
        h('div', { class: 'pl-rodape' }, h('span', { class: 'pl-soma', texto: `${n0(soma.kcal)} kcal · ${n0(soma.proteina)} g P` })));
    });
    return [
      h('div', { class: 'cartao pl-total' },
        h('div', { class: 'meta-linha' }, h('b', { class: 'meta-kcal', texto: n0(total.kcal) }), h('small', { texto: 'kcal no dia' })),
        h('div', { class: 'meta-macros' }, ...[['Proteína', total.proteina], ['Carbo', total.carboidrato], ['Gordura', total.gordura]].map(([n, v]) => h('span', {}, h('b', { texto: `${n0(v)} g` }), h('small', { texto: n }))))),
      h('p', { class: 'imp-resumo', texto: `Li ${rev.refeicoes.length} ${rev.refeicoes.length === 1 ? 'refeição' : 'refeições'} e ${nItens} alimentos. Ajuste o que precisar: nada foi salvo ainda.` }),
      rev.problema ? h('p', { class: 'imp-aviso', texto: `A IA avisou: ${rev.problema}` }) : null,
      ...cartoes,
      msg,
      h('button', { class: 'botao principal cheio imp-salvar', onclick: () => salvar(msg), texto: 'Usar como meu plano' }),
      h('button', { class: 'botao texto', style: 'margin:8px auto 0;display:block', onclick: () => { est.revisao = null; desenharImp(); }, texto: 'Voltar e ler de novo' }),
    ].filter(Boolean);
  }

  desenharImp();
}

function telaDieta() {
  const { dia, resumo, pesos, plano, perfil } = dietaDeHoje();
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
  const semMeta = resumo.alvo.kcal === 0;
  tela.append(h('section', { class: 'cartao dieta-resumo' },
    h('button', { class: 'dieta-meta-botao', type: 'button', onclick: abrirMetaDieta, 'aria-label': 'Ajustar a meta da dieta' },
      icone('ajustes'), h('span', { texto: semMeta ? 'Definir meta' : resumo.fonteAlvo === 'perfil' ? `Meta: ${OBJETIVOS.find(([v]) => v === perfil.objetivo)?.[1] ?? ''}` : 'Meta: o plano' })),
    h('div', { class: 'anel', role: 'img', 'aria-label': `${n0(resumo.consumido.kcal)} de ${n0(resumo.alvo.kcal)} kcal` }, svg,
      h('div', { class: 'anel-texto' },
        h('b', { 'data-anel-numero': String(Math.round(resumo.consumido.kcal)) }),
        h('span', { texto: semMeta ? 'kcal hoje' : `de ${n0(resumo.alvo.kcal)} kcal` }),
        semMeta ? null : h('span', { class: 'anel-falta', texto: faltam > 0 ? `faltam ${n0(faltam)}` : faltam < 0 ? `${n0(-faltam)} acima` : 'no alvo' }))),
    h('div', { class: 'macros' },
      macro('p', 'Proteína', resumo.consumido.proteina, resumo.alvo.proteina, 'var(--tinta)'),
      macro('c', 'Carboidrato', resumo.consumido.carboidrato, resumo.alvo.carboidrato, 'var(--ciano)'),
      macro('g', 'Gordura', resumo.consumido.gordura, resumo.alvo.gordura, 'var(--laranja)')),
    h('button', { class: 'botao principal cheio dieta-adicionar', type: 'button', onclick: () => escolherAlimento({ modo: 'dia', refeicao: null }) }, icone('mais'), ' Adicionar alimento')));

  tela.append(h('div', { class: 'secao-linha' }, h('h2', { class: 'secao', texto: 'Refeições' }),
    h('button', { class: 'botao texto secao-acao', type: 'button', onclick: abrirImportarDieta }, icone('ia'), ' Importar'),
    plano.length > 0 ? h('button', { class: 'botao texto secao-acao', type: 'button', onclick: abrirPlanoDieta }, icone('lapis'), ' Editar') : null));
  if (resumo.refeicoes.length === 0) {
    tela.append(h('section', { class: 'cartao vazio dieta-vazia' },
      h('p', { class: 'dieta-vazia-titulo', texto: 'Monte o seu plano' }),
      h('p', { class: 'discreto', texto: 'Mande um print, foto ou o texto da sua dieta e a IA monta tudo, com os macros. Ou monte à mão com a tabela TACO. O mesmo plano vale no computador.' }),
      h('button', { class: 'botao principal cheio', type: 'button', onclick: abrirImportarDieta }, icone('ia'), ' Importar minha dieta com IA'),
      h('button', { class: 'botao cheio', type: 'button', style: 'margin-top:8px', onclick: abrirPlanoDieta }, icone('mais'), ' Montar à mão')));
  }
  for (const r of resumo.refeicoes) {
    const aberta = refeicaoAberta.has(r.habitoId) || (r.proxima && !refeicaoFechada.has(r.habitoId));
    const parte = r.feita && r.comido.length > 0 ? itensDaRefeicao(r) : null;
    const comeuParte = parte && parte.itens.some((x) => x.comeu) && parte.itens.some((x) => !x.comeu);
    const estado = comeuParte ? h('span', { class: 'ref-estado feita parcial' }, icone('check'), `${parte.itens.filter((x) => x.comeu).length} de ${parte.itens.length}`)
      : r.feita ? h('span', { class: 'ref-estado feita' }, icone('check'), 'Feita')
      : r.pulada ? h('span', { class: 'ref-estado pulada', texto: 'Pulei' })
        : r.proxima ? h('span', { class: 'ref-estado proxima', texto: 'Próxima' })
          : h('span', { class: 'ref-kcal', texto: `${n0(r.totais.kcal)} kcal` });
    const cartao = h('section', { class: `cartao refeicao${r.feita ? ' feita' : ''}${r.pulada ? ' pulada' : ''}${r.proxima ? ' proxima-agora' : ''}`, 'data-ref': r.habitoId },
      h('button', {
        class: 'ref-topo', 'aria-expanded': String(aberta),
        onclick: () => {
          if (aberta) { refeicaoAberta.delete(r.habitoId); refeicaoFechada.add(r.habitoId); } else { refeicaoAberta.add(r.habitoId); refeicaoFechada.delete(r.habitoId); }
          desenhar();
        },
      }, h('span', { class: 'ref-hora', texto: r.hora }), h('span', { class: 'ref-titulo', texto: r.titulo }), estado));
    if (aberta) cartao.append(...corpoDaRefeicao(r, dia));
    tela.append(cartao);
  }

  if (resumo.extras.length > 0) {
    tela.append(h('h2', { class: 'secao', texto: 'Fora do plano' }), h('section', { class: 'cartao' },
      h('ul', { class: 'lista-simples fora-do-plano' }, resumo.extras.map((x) => h('li', {},
        h('span', { texto: x.descricao }), h('span', { class: 'pequeno', texto: `${n0(x.kcal)} kcal` }),
        h('button', { class: 'pl-mini pl-tirar', type: 'button', 'aria-label': `Tirar ${x.descricao}`, onclick: () => { tirarComida(x); desenhar(); } }, icone('fechar')))))));
  }

  if (resumo.refeicoes.length > 0) {
    tela.append(h('h2', { class: 'secao', texto: 'Para hoje' }), h('section', { class: 'cartao' },
      h('ul', { class: 'lista-simples' }, resumo.dicas.map((d) => h('li', { texto: d })))));
  }

  tela.append(h('h2', { class: 'secao', texto: 'Peso' }), cartaoPeso({ dia, pesos, perfil }));
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
    if (chave === null) throw new Error(`A chave da IA (${ia.host}) não está salva na conta. Salve em Ajustes > Garry (IA).`);
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

// Sem zoom (16/11/2026, "o app nao pode dar zoom pra fora e nem pra dentro"). O viewport ja diz
// user-scalable=no, mas o Safari ignora isso desde o iOS 10: a pinca chega como gesturestart/change
// (so no Safari) e como toque de dois dedos. O toque duplo para de dar zoom pelo touch-action do CSS.
for (const tipo of ['gesturestart', 'gesturechange', 'gestureend']) document.addEventListener(tipo, (e) => e.preventDefault(), { passive: false });
document.addEventListener('touchmove', (e) => { if (e.touches.length > 1 || (typeof e.scale === 'number' && e.scale !== 1)) e.preventDefault(); }, { passive: false });
document.addEventListener('wheel', (e) => { if (e.ctrlKey) e.preventDefault(); }, { passive: false });

document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') sincronizar(); });
setInterval(() => { if (document.visibilityState === 'visible') sincronizar(); }, 30_000);
// A versao nova chega sozinha (11/11/2026, "pra mim no celular nao foi"). O app na Tela de Inicio volta do
// segundo plano sem recarregar: ao voltar, procura um service worker novo; quando ele assume, a pagina
// recarrega com o codigo novo. Nunca no meio de uma serie ou com uma folha aberta: espera fechar.
if ('serviceWorker' in navigator && location.protocol === 'https:') {
  const tinhaVersao = navigator.serviceWorker.controller !== null;
  let registro = null;
  let recarregar = false;
  const recarregarSePuder = () => {
    if (!recarregar) return;
    if (document.querySelector('dialog[open]')) return; // a serie ou uma folha aberta: depois
    recarregar = false;
    location.reload();
  };
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!tinhaVersao) return; // a primeira instalacao nao precisa recarregar
    recarregar = true;
    recarregarSePuder();
  });
  document.addEventListener('close', recarregarSePuder, true); // fechou a serie/folha: agora pode
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') registro?.update().catch(() => {});
    else recarregarSePuder();
  });
  navigator.serviceWorker.register('sw.js', { updateViaCache: 'none' })
    .then((r) => { registro = r; })
    .catch(() => {});
}

(async () => {
  try {
    await ligar();
  } catch {
    guardado.gravar('segredo', null);
  }
  desenhar();
  retomarDescanso();
  carregarBiblioteca();
  if (app.sinc !== null && app.estado.cursor > 0) sincronizar();
})();
