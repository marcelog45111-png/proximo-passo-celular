// A dieta mexida pelo iPhone (17/11/2026). Pedido: "corrija a dieta, nao tem como eu configurar e nao tem
// como eu colocar os alimentos e o peso tambem ta terrivelmente terrivel". Aqui moram as contas (sem tela):
// buscar alimento na tabela e nos salvos, a quantidade, a linha do consumo_extra (igual a do PC), o item do
// plano, as refeicoes que o PC aceita e a tendencia do peso. A conta do dia continua a do PC (nutricao.js).

import { INSTRUCAO_ESTIMATIVA, lerEstimativa, macrosDoItem, TABELA_ALIMENTOS, textoDaMedida } from './gerado/nutricao.js';
import { TACO } from './gerado/taco.js';
import { modeloParaImagem } from './importar.js';

/**
 * As refeicoes sao os habitos da dieta do PC (HABITOS_PADRAO em src/domain/dieta.ts): o PC so aceita esses
 * ids e marcar a refeicao da o XP dele. Por isso o plano tem no maximo estas cinco.
 */
export const REFEICOES = [
  { habitoId: 'cafe', titulo: 'Café da manhã', hora: '07:30' },
  { habitoId: 'almoco', titulo: 'Almoço', hora: '12:30' },
  { habitoId: 'lanche', titulo: 'Lanche da tarde', hora: '16:00' },
  { habitoId: 'jantar', titulo: 'Jantar', hora: '20:00' },
  { habitoId: 'ceia', titulo: 'Ceia', hora: '22:30' },
];

export const OBJETIVOS = [['ganhar', 'Ganhar massa'], ['manter', 'Manter'], ['perder', 'Perder gordura']];
export const ATIVIDADES = [['leve', 'Leve'], ['moderada', 'Moderada'], ['alta', 'Alta']];
export const SEXOS = [['masculino', 'Masculino'], ['feminino', 'Feminino']];

const um = (v) => Math.round(v * 10) / 10;
export const semAcento = (t) => String(t ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/**
 * Quanto o nome combina com a busca (maior = mais perto; -Infinity = nao tem todas as palavras). Na TACO
 * "frango" acha 20 linhas: o nome que comeca com a palavra vem antes, o mais curto (mais comum) antes do
 * comprido, e "cru" por ultimo (quase ninguem pesa a comida crua no prato).
 */
export function pontosDaBusca(nome, busca) {
  const alvo = semAcento(nome);
  const palavras = semAcento(busca).split(/\s+/).filter(Boolean);
  if (palavras.length === 0 || !palavras.every((p) => alvo.includes(p))) return -Infinity;
  let pts = 0;
  if (alvo.startsWith(palavras[0])) pts += 100;
  const partes = alvo.split(/[,()/]+/).map((x) => x.trim());
  pts += palavras.filter((p) => partes.some((x) => x.startsWith(p))).length * 10;
  if (/\bcrua?\b/.test(alvo) && !palavras.some((p) => p.startsWith('cru'))) pts -= 15;
  return pts - alvo.length * 0.2;
}

/** A tabela e o salvo viram a mesma coisa para a tela: de onde veio, o nome e a porcao de base. */
export function escolhaDaTabela(a) {
  return { origem: 'tabela', id: a.id, nome: a.nome, base: a.porcao, unidade: a.unidade, medida: a.medida ?? null, macros: { kcal: a.kcal, proteina: a.proteina, carboidrato: a.carboidrato, gordura: a.gordura } };
}
/** A TACO vale por 100 g; no plano o item vai com os macros prontos (o PC nao conhece o id da TACO). */
export function escolhaDaTaco(a) {
  return { origem: 'taco', id: a.id, nome: a.nome, base: 100, unidade: a.unidade, medida: null, macros: { kcal: a.kcal, proteina: a.proteina, carboidrato: a.carboidrato, gordura: a.gordura } };
}
export function escolhaDoSalvo(s) {
  return {
    origem: 'salvo', id: s.id, nome: s.nome, base: s.peso ?? 1, unidade: s.unidade ?? 'porção', medida: s.quantidade ?? null,
    macros: { kcal: s.kcal, proteina: s.proteina, carboidrato: s.carboidrato, gordura: s.gordura },
  };
}

const melhores = (lista, busca, nomeDe, n) => lista
  .map((x) => ({ x, p: pontosDaBusca(nomeDe(x), busca) }))
  .filter((o) => o.p > -Infinity)
  .sort((a, b) => b.p - a.p)
  .slice(0, n)
  .map((o) => o.x);

/**
 * Busca vazia: os ultimos salvos ("Usados antes"). Com texto: os salvos, a tabela do app (com medida
 * caseira) e a TACO inteira (591 alimentos, por 100 g; 17/11/2026: "tem que POR TUDO MACRO"), sem
 * repetir o mesmo nome.
 */
export function buscarAlimentos(busca, salvos, tabela = TABELA_ALIMENTOS, taco = TACO) {
  const t = String(busca ?? '').trim();
  if (t === '') return { salvos: salvos.slice(0, 6).map(escolhaDoSalvo), tabela: [], taco: [] };
  const daTabela = melhores(tabela, t, (a) => a.nome, 8);
  const vistos = new Set(daTabela.map((a) => semAcento(a.nome)));
  return {
    salvos: melhores(salvos, t, (s) => s.nome, 6).map(escolhaDoSalvo),
    tabela: daTabela.map(escolhaDaTabela),
    taco: melhores(taco, t, (a) => a.nome, 12).filter((a) => !vistos.has(semAcento(a.nome))).map(escolhaDaTaco),
  };
}

/** De quanto em quanto o - e o + andam: grama/ml de 10 em 10 (de 5 ate 50), o resto de meia em meia. */
export function passoDe(unidade, valor) {
  if (unidade === 'g' || unidade === 'ml') return valor < 50 ? 5 : 10;
  return 0.5;
}

/** Os macros da escolha na quantidade da pessoa. */
export function macrosDaEscolha(escolha, quantidade) {
  if (escolha.origem === 'tabela') return macrosDoItem({ alimentoId: escolha.id, quantidade, unidade: escolha.unidade });
  const f = escolha.base > 0 ? quantidade / escolha.base : 1;
  const m = escolha.macros;
  return { kcal: Math.round(m.kcal * f), proteina: um(m.proteina * f), carboidrato: um(m.carboidrato * f), gordura: um(m.gordura * f) };
}

/** "Arroz branco cozido · 150 g", "Ovo · 2 un", "Pão de forma · 2 fatias": o mesmo jeito do PC. */
export function descricaoDaEscolha(escolha, quantidade) {
  return `${escolha.nome} · ${textoDaMedida(quantidade, escolha.unidade)}`;
}

/** A linha do consumo_extra, igual a que o PC grava (sincroniza). */
export function linhaDoConsumo({ id, dia, descricao, macros, refeicao = null, agora = new Date() }) {
  return {
    id, dia, descricao,
    kcal: Math.round(macros.kcal), proteina: um(macros.proteina), carboidrato: um(macros.carboidrato), gordura: um(macros.gordura),
    registrado_em: agora.toISOString(), refeicao_habito: refeicao,
  };
}

/**
 * O item do plano. Da tabela, guarda o id e a quantidade (o PC recalcula); do salvo, guarda os macros
 * prontos. O plano so aceita g, ml e un: a medida caseira vai no nome.
 */
export function itemDoPlano(escolha, quantidade, id) {
  if (escolha.origem === 'tabela') return { id, alimentoId: escolha.id, nome: escolha.nome, quantidade, unidade: escolha.unidade };
  if (escolha.origem === 'item') return { id, alimentoId: null, nome: escolha.nome, quantidade, unidade: escolha.unidade, macros: macrosDaEscolha(escolha, quantidade) };
  const simples = escolha.unidade === 'g' || escolha.unidade === 'ml';
  return {
    id, alimentoId: null,
    nome: simples ? escolha.nome : `${escolha.nome} (${textoDaMedida(quantidade, escolha.unidade)})`,
    quantidade: simples ? quantidade : Math.max(0.5, quantidade),
    unidade: simples ? escolha.unidade : 'un',
    macros: macrosDaEscolha(escolha, quantidade),
  };
}

/** A escolha de um item que ja esta no plano (para trocar a quantidade dele). */
export function escolhaDoItem(item, tabela = TABELA_ALIMENTOS) {
  const a = item.alimentoId ? tabela.find((x) => x.id === item.alimentoId) : null;
  if (a) return escolhaDaTabela(a);
  return { origem: 'item', id: item.id, nome: item.nome, base: item.quantidade, unidade: item.unidade, medida: null, macros: item.macros ?? { kcal: 0, proteina: 0, carboidrato: 0, gordura: 0 } };
}

/** Ler o "alimento proprio" da tela. Devolve o item salvo (formato do PC) ou o motivo. */
export function lerAlimentoProprio({ nome, quantidade, unidade, kcal, proteina, carboidrato, gordura }) {
  const n = String(nome ?? '').trim().slice(0, 80);
  if (n === '') return { erro: 'Dê um nome ao alimento.', campo: 'nome' };
  const num = (v) => (v === '' || v === null || v === undefined ? NaN : Number(String(v).replace(',', '.')));
  const q = num(quantidade);
  if (!Number.isFinite(q) || q <= 0 || q > 5000) return { erro: 'A tabela vale por quanto? Ex.: 100 g, 1 fatia.', campo: 'quantidade' };
  const k = num(kcal);
  if (!Number.isFinite(k) || k < 0 || k > 5000) return { erro: 'Escreva as calorias.', campo: 'kcal' };
  const macro = (v) => { const x = num(v); return Number.isFinite(x) && x >= 0 && x <= 1000 ? um(x) : 0; };
  return { item: { nome: n, quantidade: textoDaMedida(q, unidade), peso: q, unidade, kcal: Math.round(k), proteina: macro(proteina), carboidrato: macro(carboidrato), gordura: macro(gordura) } };
}

// ---------- o plano ----------

export const totalDoPlanoDe = (refeicoes) => refeicoes.reduce((t, r) => {
  for (const i of r.itens) {
    const m = macrosDoItem(i);
    t.kcal += m.kcal; t.proteina += m.proteina; t.carboidrato += m.carboidrato; t.gordura += m.gordura;
  }
  return t;
}, { kcal: 0, proteina: 0, carboidrato: 0, gordura: 0 });

/** A proxima refeicao que ainda cabe no plano (as cinco do PC), ou null. */
export function novaRefeicao(plano) {
  const usadas = new Set(plano.map((r) => r.habitoId));
  const livre = REFEICOES.find((r) => !usadas.has(r.habitoId));
  return livre ? { id: livre.habitoId, habitoId: livre.habitoId, titulo: livre.titulo, hora: livre.hora, itens: [] } : null;
}

/** Ordena pela hora e confere o que o PC confere (hora, nome, ids das cinco, sem repetir). */
export function prepararPlano(plano) {
  const ids = new Set(REFEICOES.map((r) => r.habitoId));
  if (plano.length === 0) return { erro: 'O plano precisa de pelo menos uma refeição.' };
  for (const r of plano) {
    if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(r.hora)) return { erro: `A hora de "${r.titulo || 'uma refeição'}" está estranha.` };
    if (String(r.titulo ?? '').trim() === '') return { erro: 'Toda refeição precisa de um nome.' };
    if (!ids.has(r.habitoId)) return { erro: 'Refeição desconhecida no plano.' };
  }
  if (new Set(plano.map((r) => r.habitoId)).size !== plano.length) return { erro: 'Há refeições repetidas.' };
  const pronto = [...plano].sort((a, b) => (a.hora < b.hora ? -1 : 1)).map((r) => ({ ...r, titulo: r.titulo.trim().slice(0, 60) }));
  return { plano: pronto };
}

// ---------- o peso ----------

const diaEmMs = (dia) => Date.UTC(Number(dia.slice(0, 4)), Number(dia.slice(5, 7)) - 1, Number(dia.slice(8, 10)));
const DIA_MS = 86_400_000;

/** Os pesos do periodo (7, 30, 90 dias ou tudo), mais velhos primeiro. */
export function pesosDoPeriodo(pesos, dias, hoje) {
  const lista = [...pesos].sort((a, b) => (a.dia_logico < b.dia_logico ? -1 : 1));
  if (dias === null) return lista;
  const corte = diaEmMs(hoje) - (dias - 1) * DIA_MS;
  return lista.filter((p) => diaEmMs(p.dia_logico) >= corte);
}

/**
 * Tendencia do peso por minimos quadrados nos ultimos 21 dias (a mesma janela do PC): kg por semana.
 * Pede 3 registros espalhados por 7 dias ou mais; senao, nao opina.
 */
export function tendenciaDoPeso(pesos, hoje, janela = 21) {
  const usados = pesosDoPeriodo(pesos, janela, hoje);
  if (usados.length < 3) return null;
  const xs = usados.map((p) => (diaEmMs(p.dia_logico) - diaEmMs(usados[0].dia_logico)) / DIA_MS);
  if (xs.at(-1) < 7) return null;
  const ys = usados.map((p) => p.valor_kg);
  const mx = xs.reduce((a, b) => a + b, 0) / xs.length;
  const my = ys.reduce((a, b) => a + b, 0) / ys.length;
  let num = 0;
  let den = 0;
  xs.forEach((x, i) => { num += (x - mx) * (ys[i] - my); den += (x - mx) ** 2; });
  if (den === 0) return null;
  const porDia = num / den;
  return { porSemana: Math.round(porDia * 7 * 100) / 100, dias: Math.round(xs.at(-1)), registros: usados.length, inicio: my - porDia * mx, porDia, desde: usados[0].dia_logico };
}

/** O ritmo de referencia do objetivo, em kg por semana (0,25 a 0,5% do peso para ganhar ou perder). */
export function ritmoDoObjetivo(objetivo, pesoKg) {
  if (pesoKg === null) return null;
  if (objetivo === 'manter') return { min: -0.2, max: 0.2 };
  const a = um(pesoKg * 0.0025);
  const b = um(pesoKg * 0.005);
  return objetivo === 'ganhar' ? { min: a, max: b } : { min: -b, max: -a };
}

/** Uma frase neutra sobre a tendencia contra o objetivo (o peso nao muda de cor: so diz o dado). */
export function leituraDoPeso(tendencia, objetivo, pesoKg) {
  if (tendencia === null) return 'Registre o peso em 3 dias de uma semana para ver a tendência.';
  const ritmo = ritmoDoObjetivo(objetivo, pesoKg);
  const v = tendencia.porSemana;
  const txt = (x) => `${x > 0 ? '+' : x < 0 ? '−' : ''}${String(Math.abs(x)).replace('.', ',')}`;
  const ref = ritmo ? (objetivo === 'manter' ? ' Para manter: perto de 0.' : ` Para ${objetivo === 'ganhar' ? 'ganhar massa' : 'perder gordura'}: ${txt(ritmo.min)} a ${txt(ritmo.max)} kg por semana.`) : '';
  const ritmoAtual = Math.abs(v) < 0.05 ? 'Peso parado' : `${txt(v)} kg por semana`;
  return `${ritmoAtual} nos últimos ${tendencia.dias} dias.${ref}`;
}

// ---------- a IA calcula o alimento ----------

/** Pede a estimativa ao mesmo provedor do Garry; devolve os itens (formato do PC) ou lanca o motivo. */
export async function estimarComIa({ baseUrl, host, modelo, chave }, texto, f = fetch) {
  const corpo = {
    model: modelo, temperature: 0, max_tokens: 1200,
    messages: [{ role: 'system', content: INSTRUCAO_ESTIMATIVA }, { role: 'user', content: String(texto).slice(0, 600) }],
  };
  // Sem raciocinio: o modelo pensando gastava o limite e a resposta vinha vazia (21/10/2026, PC).
  if (host === 'openrouter.ai') corpo.reasoning = { enabled: false };
  if (host === 'integrate.api.nvidia.com') corpo.chat_template_kwargs = { enable_thinking: false };
  const headers = { Authorization: `Bearer ${chave}`, 'Content-Type': 'application/json' };
  if (host === 'openrouter.ai') headers['X-Title'] = 'Proximo Passo (iPhone)';
  const controle = new AbortController();
  const relogio = setTimeout(() => controle.abort(), 60_000);
  let resposta;
  try {
    resposta = await f(`${baseUrl}/chat/completions`, { method: 'POST', headers, body: JSON.stringify(corpo), signal: controle.signal });
  } catch {
    throw new Error(controle.signal.aborted ? 'A IA demorou demais. Tente de novo.' : 'Não consegui falar com a IA. Confira a internet.');
  } finally {
    clearTimeout(relogio);
  }
  if (!resposta.ok) {
    if (resposta.status === 401 || resposta.status === 403) throw new Error('O provedor recusou a chave da IA. Troque em Ajustes > Garry (IA).');
    if (resposta.status === 402) throw new Error('Sem saldo no provedor da IA. Os modelos ":free" funcionam sem saldo.');
    if (resposta.status === 429) throw new Error('A cota grátis da IA acabou por agora. Use o alimento próprio.');
    throw new Error(`A IA respondeu ${resposta.status}. Tente de novo.`);
  }
  const dados = await resposta.json().catch(() => null);
  const conteudo = dados?.choices?.[0]?.message?.content;
  const lido = lerEstimativa(Array.isArray(conteudo) ? conteudo.map((c) => c?.text ?? '').join('') : String(conteudo ?? ''));
  if (!lido) throw new Error('A IA não devolveu uma conta que dê para usar. Tente escrever de outro jeito.');
  return lido;
}

// ---------- a refeicao alimento por alimento (17/11/2026) ----------
// Pedido: "nao tem opcao de se eu comi tal alimento ou nao, e so sim ou nao, HORRIVEL". Tudo pelo mesmo
// formato do PC: refeicao marcada sem registrado = o plano inteiro; com registrado = so o registrado.
// Cada alimento do plano comido vira uma linha do consumo_extra com o nome do item.

const nomeDaLinha = (descricao) => { const t = String(descricao); const i = t.indexOf(' · '); return i > 0 ? t.slice(0, i) : t; };
const mesmoNome = (a, b) => semAcento(a).trim() === semAcento(b).trim();

/** A quantidade de uma linha registrada na unidade do item do plano ("150 g", "2 un"); senao pela kcal. */
function quantidadeDaLinha(linha, item) {
  const resto = String(linha.descricao).split(' · ')[1] ?? '';
  const m = /^(\d+(?:,\d+)?)\s*(g|ml|un)\b/.exec(resto.trim());
  if (m && m[2] === item.unidade) return Number(m[1].replace(',', '.'));
  if (item.calculado.kcal > 0) return Math.round((item.quantidade * linha.kcal / item.calculado.kcal) * 10) / 10;
  return item.quantidade;
}

/**
 * Como cada alimento do plano esta hoje nessa refeicao: comeu ou nao, e quanto. `extras` sao os
 * alimentos acrescentados que nao sao do plano. `r` e uma refeicao do resumoNutricional.
 */
export function itensDaRefeicao(r) {
  const usados = new Set();
  const comRegistro = r.comido.length > 0;
  const itens = r.itensComMacros.map((item) => {
    const linha = comRegistro ? r.comido.find((c) => !usados.has(c.id) && mesmoNome(nomeDaLinha(c.descricao), item.nome)) ?? null : null;
    if (linha) usados.add(linha.id);
    return { item, linha, comeu: comRegistro ? linha !== null : r.feita, quantidade: linha ? quantidadeDaLinha(linha, item) : item.quantidade };
  });
  return { itens, extras: r.comido.filter((c) => !usados.has(c.id)) };
}

/** Os macros de um item do plano numa quantidade (proporcional ao do plano). */
export function macrosNaQuantidade(item, quantidade) {
  const f = item.quantidade > 0 ? quantidade / item.quantidade : 1;
  const m = item.calculado;
  return { kcal: Math.round(m.kcal * f), proteina: um(m.proteina * f), carboidrato: um(m.carboidrato * f), gordura: um(m.gordura * f) };
}

/**
 * O que gravar para a refeicao ficar como `itens` diz. Devolve { marcar, linhas, apagar }:
 * marcar = a refeicao fica feita; linhas = as do consumo_extra a gravar (id existente reaproveitado,
 * null = nova); apagar = ids que saem. Tudo comido como no plano (e nada a mais) = so a marca.
 */
export function gravarItens(itens, extras) {
  const comidos = itens.filter((x) => x.comeu);
  const existentes = itens.map((x) => x.linha?.id).filter(Boolean);
  const comoNoPlano = itens.length > 0 && comidos.length === itens.length && extras.length === 0
    && comidos.every((x) => Math.abs(x.quantidade - x.item.quantidade) < 1e-9);
  if (comoNoPlano) return { marcar: true, linhas: [], apagar: existentes };
  if (comidos.length === 0 && extras.length === 0) return { marcar: false, linhas: [], apagar: existentes };
  const linhas = comidos.map((x) => ({
    id: x.linha?.id ?? null,
    descricao: `${x.item.nome} · ${textoDaMedida(x.quantidade, x.item.unidade)}`,
    macros: macrosNaQuantidade(x.item, x.quantidade),
  }));
  const ficam = new Set(linhas.map((l) => l.id).filter(Boolean));
  return { marcar: true, linhas, apagar: existentes.filter((id) => !ficam.has(id)) };
}

// ---------- a IA le a dieta e o rotulo ----------

/** Um pedido ao provedor da pessoa (texto e, se houver, imagens). Devolve o texto da resposta. */
export async function pedirIa(ia, { sistema, texto, imagens = [], maxTokens = 4000, esperaMs = 120_000 }, f = fetch) {
  const { baseUrl, host, chave } = ia;
  const modelo = imagens.length > 0 ? await modeloParaImagem(ia, f) : ia.modelo;
  const corpo = {
    model: modelo, temperature: 0, max_tokens: maxTokens,
    messages: [
      { role: 'system', content: sistema },
      { role: 'user', content: imagens.length > 0 ? [{ type: 'text', text: texto }, ...imagens.map((url) => ({ type: 'image_url', image_url: { url } }))] : texto },
    ],
  };
  // Sem raciocinio: o modelo pensando gastava o limite e a resposta vinha vazia (21/10/2026, PC).
  if (host === 'openrouter.ai') corpo.reasoning = { enabled: false };
  if (host === 'integrate.api.nvidia.com') corpo.chat_template_kwargs = { enable_thinking: false };
  const headers = { Authorization: `Bearer ${chave}`, 'Content-Type': 'application/json' };
  if (host === 'openrouter.ai') headers['X-Title'] = 'Proximo Passo (iPhone)';
  const controle = new AbortController();
  const relogio = setTimeout(() => controle.abort(), esperaMs);
  let resposta;
  try {
    resposta = await f(`${baseUrl}/chat/completions`, { method: 'POST', headers, body: JSON.stringify(corpo), signal: controle.signal });
  } catch {
    throw new Error(controle.signal.aborted ? 'A IA demorou demais. Tente de novo.' : 'Não consegui falar com a IA. Confira a internet.');
  } finally {
    clearTimeout(relogio);
  }
  if (!resposta.ok) {
    const t = await resposta.text().catch(() => '');
    if (resposta.status === 401 || resposta.status === 403) throw new Error('O provedor recusou a chave da IA. Troque em Ajustes > Garry (IA).');
    if (resposta.status === 402) throw new Error('Sem saldo no provedor da IA. Os modelos ":free" funcionam sem saldo.');
    if (resposta.status === 413) throw new Error('A imagem ficou grande demais para a IA. Mande uma de cada vez.');
    if (resposta.status === 429) throw new Error('A cota grátis da IA acabou por agora. Tente mais tarde.');
    if (imagens.length > 0 && /image|vision|multimodal/i.test(t)) throw new Error('Este modelo não lê imagem. Cole como texto.');
    throw new Error(`A IA respondeu ${resposta.status}. Tente de novo.`);
  }
  const dados = await resposta.json().catch(() => null);
  const conteudo = dados?.choices?.[0]?.message?.content;
  return Array.isArray(conteudo) ? conteudo.map((c) => c?.text ?? '').join('') : String(conteudo ?? '');
}

export function jsonDaResposta(texto, oQue) {
  const t = String(texto ?? '').replace(/```(?:json)?/gi, '');
  const ini = t.indexOf('{');
  const fim = t.lastIndexOf('}');
  if (ini === -1 || fim <= ini) throw new Error(`A IA não devolveu ${oQue} que dê para ler. Tente de novo.`);
  try {
    return JSON.parse(t.slice(ini, fim + 1));
  } catch {
    throw new Error(`A IA devolveu ${oQue} quebrado. Tente de novo.`);
  }
}

const numeroIa = (v, min, max) => {
  const n = typeof v === 'number' ? v : Number(String(v ?? '').replace(',', '.').replace(/[^0-9.-]/g, ''));
  return Number.isFinite(n) && n >= min && n <= max && String(v ?? '').trim() !== '' ? n : null;
};

export const INSTRUCAO_IMPORTAR_DIETA = [
  'Voce le planos de dieta escritos por pessoas ou nutricionistas (prints, fotos, PDFs fotografados, mensagens, anotacoes) e devolve SO um JSON, sem texto antes ou depois.',
  'Transcreva as refeicoes e os alimentos com as quantidades escritas. NUNCA invente alimento ou refeicao que nao aparece.',
  'Para cada alimento calcule kcal, proteina, carboidrato e gordura do TOTAL daquela quantidade: use os valores escritos na dieta quando houver; senao a tabela TACO (alimento pronto como se come: arroz cozido, frango grelhado) e o rotulo da marca citada.',
  'Formato:',
  '{"legivel": true|false, "problema": null|"o que impediu a leitura", "refeicoes": [{"titulo": "nome como escrito, ex. Cafe da manha", "hora": "HH:MM"|null, "itens": [{"nome": "alimento, ex. Arroz branco cozido", "quantidade": numero, "unidade": "g"|"ml"|"un", "como": "quantidade como escrita, ex. 4 colheres de sopa"|null, "kcal": n, "proteina": n, "carboidrato": n, "gordura": n, "confianca": "alta"|"media"|"baixa"}]}]}',
  'Detalhes:',
  '- Quantidade em gramas (g) ou ml sempre que der para converter (4 colheres de sopa de arroz = 100 g; 1 copo de leite = 200 ml). Use "un" so para o que se conta: ovo, fatia de pao, fruta inteira, scoop.',
  '- Opcoes ("arroz OU macarrao"): use a primeira e ponha a outra no nome entre parenteses.',
  '- Mais de 5 refeicoes: mantenha todas, na ordem do dia.',
  '- Se a imagem estiver ilegivel ou nao for uma dieta, devolva legivel false e diga o problema. Marque confianca "baixa" no que ficou duvidoso.',
].join('\n');

/** Confere o que a IA leu da dieta. Devolve { refeicoes, problema } ou lanca o motivo. */
export function validarDietaImportada(bruto) {
  if (!bruto || typeof bruto !== 'object') throw new Error('A IA não devolveu uma dieta que dê para ler.');
  const lidas = (Array.isArray(bruto.refeicoes) ? bruto.refeicoes : []).map((r) => {
    const titulo = typeof r?.titulo === 'string' && r.titulo.trim() ? r.titulo.trim().slice(0, 60) : null;
    const hm = typeof r?.hora === 'string' ? /^([01]?\d|2[0-3])\s*[:h]\s*([0-5]\d)?$/.exec(r.hora.trim()) : null;
    const hora = hm ? `${hm[1].padStart(2, '0')}:${hm[2] ?? '00'}` : null;
    const itens = (Array.isArray(r?.itens) ? r.itens : []).map((i) => {
      const nome = typeof i?.nome === 'string' ? i.nome.trim().slice(0, 80) : '';
      const unidade = i?.unidade === 'g' || i?.unidade === 'ml' || i?.unidade === 'un' ? i.unidade : null;
      const quantidade = numeroIa(i?.quantidade, 0.1, 5000);
      const kcal = numeroIa(i?.kcal, 0, 5000);
      if (!nome || !unidade || quantidade === null || kcal === null) return null;
      const macro = (v) => um(numeroIa(v, 0, 1000) ?? 0);
      const como = typeof i?.como === 'string' && i.como.trim() ? i.como.trim().slice(0, 60) : null;
      return {
        nome, quantidade: Math.round(quantidade * 10) / 10, unidade, como,
        macros: { kcal: Math.round(kcal), proteina: macro(i.proteina), carboidrato: macro(i.carboidrato), gordura: macro(i.gordura) },
        confianca: i?.confianca === 'baixa' || i?.confianca === 'media' ? i.confianca : 'alta',
      };
    }).filter(Boolean).slice(0, 30);
    return { titulo, hora, itens };
  }).filter((r) => r.itens.length > 0);
  if (lidas.length === 0) {
    throw new Error(bruto.legivel === false && bruto.problema ? `A IA não conseguiu ler: ${bruto.problema}` : 'Não achei refeições com alimentos. Mande uma imagem mais nítida ou cole o texto.');
  }
  return { refeicoes: lidas, problema: typeof bruto.problema === 'string' && bruto.problema.trim() ? bruto.problema.trim().slice(0, 200) : null };
}

const PALAVRAS_DA_REFEICAO = [
  ['cafe', /caf[eé]|desjejum|manh[aã]|breakfast|acordar/],
  ['almoco', /almo[cç]o|lunch/],
  ['jantar', /jantar|janta\b|dinner/],
  ['ceia', /ceia|antes de dormir|supper/],
  ['lanche', /lanche|pr[eé][- ]?treino|p[oó]s[- ]?treino|tarde|cola[cç][aã]o|snack/],
];
const emMinutos = (hora) => Number(hora.slice(0, 2)) * 60 + Number(hora.slice(3, 5));

/**
 * As refeicoes lidas nas cinco que o PC aceita (cafe, almoco, lanche, jantar, ceia): pelo nome, depois
 * pela hora mais perto das que sobraram. Mais de cinco: a que sobra junta na de hora mais perto (o
 * nome dela fica em `juntou`). Devolve [{ habitoId, titulo, hora, itens, juntou }] na ordem do dia.
 */
export function encaixarRefeicoes(lidas) {
  const livres = new Map(REFEICOES.map((r) => [r.habitoId, r]));
  const saida = [];
  const sobrou = [];
  for (const lida of lidas) {
    const nome = semAcento(lida.titulo ?? '');
    const achada = PALAVRAS_DA_REFEICAO.find(([id, re]) => livres.has(id) && re.test(nome));
    if (achada) { saida.push({ lida, base: livres.get(achada[0]) }); livres.delete(achada[0]); } else sobrou.push(lida);
  }
  const resto = [];
  for (const lida of sobrou) {
    if (livres.size === 0) { resto.push(lida); continue; }
    const perto = (a, b) => Math.abs(emMinutos(a.hora) - emMinutos(lida.hora)) - Math.abs(emMinutos(b.hora) - emMinutos(lida.hora));
    const alvo = lida.hora ? [...livres.values()].sort(perto)[0] : [...livres.values()][0];
    saida.push({ lida, base: alvo });
    livres.delete(alvo.habitoId);
  }
  const prontas = saida.map(({ lida, base }) => ({ habitoId: base.habitoId, titulo: lida.titulo ?? base.titulo, hora: lida.hora ?? base.hora, itens: [...lida.itens], juntou: [] }));
  for (const lida of resto) {
    const h = lida.hora ? emMinutos(lida.hora) : null;
    const alvo = h === null ? prontas.at(-1) : [...prontas].sort((a, b) => Math.abs(emMinutos(a.hora) - h) - Math.abs(emMinutos(b.hora) - h))[0];
    alvo.itens.push(...lida.itens);
    alvo.juntou.push(lida.titulo ?? 'Refeição');
  }
  return prontas.sort((a, b) => emMinutos(a.hora) - emMinutos(b.hora));
}

/** O plano no formato do PC a partir das refeicoes encaixadas (e revisadas). */
export function planoDaImportacao(refeicoes, gerarId) {
  return refeicoes.filter((r) => r.itens.length > 0).map((r) => ({
    id: r.habitoId, habitoId: r.habitoId,
    titulo: String(r.titulo ?? '').trim().slice(0, 60) || REFEICOES.find((x) => x.habitoId === r.habitoId).titulo,
    hora: r.hora,
    itens: r.itens.slice(0, 30).map((i) => ({
      id: gerarId(), alimentoId: null,
      nome: (i.como && i.unidade === 'un' ? `${i.nome} (${i.como})` : i.nome).slice(0, 80),
      quantidade: i.quantidade, unidade: i.unidade, macros: i.macros,
    })),
  }));
}

/** Um item importado em outra quantidade (macros proporcionais). */
export function itemImportadoEm(i, quantidade) {
  const f = i.quantidade > 0 ? quantidade / i.quantidade : 1;
  const m = i.macros;
  return { ...i, quantidade, como: null, macros: { kcal: Math.round(m.kcal * f), proteina: um(m.proteina * f), carboidrato: um(m.carboidrato * f), gordura: um(m.gordura * f) } };
}

/** Le a dieta (texto e/ou imagens) e devolve as refeicoes encaixadas nas cinco do PC. */
export async function interpretarDieta(ia, { texto = '', imagens = [] }, f = fetch) {
  const pedido = texto.trim()
    ? `Dieta para importar (como a pessoa colou):\n"""\n${texto.trim().slice(0, 12000)}\n"""${imagens.length ? '\nAs imagens fazem parte da mesma dieta.' : ''}`
    : `Leia a dieta ${imagens.length > 1 ? `destas ${imagens.length} imagens` : 'desta imagem'}.`;
  const resposta = await pedirIa(ia, { sistema: INSTRUCAO_IMPORTAR_DIETA, texto: pedido, imagens, maxTokens: 8000, esperaMs: 150_000 }, f);
  const lido = validarDietaImportada(jsonDaResposta(resposta, 'uma dieta'));
  return { refeicoes: encaixarRefeicoes(lido.refeicoes), problema: lido.problema };
}

export const INSTRUCAO_ROTULO = [
  'Voce le a tabela nutricional de um rotulo de alimento brasileiro numa foto e devolve SO um JSON, sem texto antes ou depois.',
  'Use a coluna da PORCAO (nao a de 100 g) quando as duas existirem. Copie os numeros como estao no rotulo; nao estime.',
  'Formato: {"legivel": true|false, "problema": null|"texto", "nome": "nome do produto e marca, se aparecer"|null, "porcao": numero, "unidade": "g"|"ml", "medida": "medida caseira escrita, ex. 2 fatias"|null, "kcal": n, "proteina": n, "carboidrato": n, "gordura": n}',
  'Se nao for um rotulo ou estiver ilegivel, legivel false e o problema.',
].join('\n');

/** Le a foto do rotulo: { nome, porcao, unidade, medida, kcal, proteina, carboidrato, gordura }. */
export async function lerRotulo(ia, imagem, f = fetch) {
  const resposta = await pedirIa(ia, { sistema: INSTRUCAO_ROTULO, texto: 'Leia a tabela nutricional deste rótulo.', imagens: [imagem], maxTokens: 800, esperaMs: 90_000 }, f);
  const b = jsonDaResposta(resposta, 'um rótulo');
  if (b.legivel === false) throw new Error(b.problema ? `A IA não conseguiu ler o rótulo: ${b.problema}` : 'Não deu para ler o rótulo. Tire outra foto, mais perto e sem reflexo.');
  const porcao = numeroIa(b.porcao, 0.1, 5000);
  const kcal = numeroIa(b.kcal, 0, 5000);
  if (porcao === null || kcal === null) throw new Error('Não achei a porção e as calorias no rótulo. Tire outra foto, mais perto.');
  const macro = (v) => um(numeroIa(v, 0, 1000) ?? 0);
  return {
    nome: typeof b.nome === 'string' && b.nome.trim() ? b.nome.trim().slice(0, 80) : null,
    porcao, unidade: b.unidade === 'ml' ? 'ml' : 'g', medida: typeof b.medida === 'string' && b.medida.trim() ? b.medida.trim().slice(0, 40) : null,
    kcal: Math.round(kcal), proteina: macro(b.proteina), carboidrato: macro(b.carboidrato), gordura: macro(b.gordura),
  };
}
