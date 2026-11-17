// A dieta mexida pelo iPhone (17/11/2026). Pedido: "corrija a dieta, nao tem como eu configurar e nao tem
// como eu colocar os alimentos e o peso tambem ta terrivelmente terrivel". Aqui moram as contas (sem tela):
// buscar alimento na tabela e nos salvos, a quantidade, a linha do consumo_extra (igual a do PC), o item do
// plano, as refeicoes que o PC aceita e a tendencia do peso. A conta do dia continua a do PC (nutricao.js).

import { INSTRUCAO_ESTIMATIVA, lerEstimativa, macrosDoItem, TABELA_ALIMENTOS, textoDaMedida } from './gerado/nutricao.js';

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

/** Todas as palavras da busca aparecem no nome (sem acento, em qualquer ordem). */
function bate(nome, busca) {
  const alvo = semAcento(nome);
  return semAcento(busca).split(/\s+/).filter(Boolean).every((p) => alvo.includes(p));
}

/** A tabela e o salvo viram a mesma coisa para a tela: de onde veio, o nome e a porcao de base. */
export function escolhaDaTabela(a) {
  return { origem: 'tabela', id: a.id, nome: a.nome, base: a.porcao, unidade: a.unidade, medida: a.medida ?? null, macros: { kcal: a.kcal, proteina: a.proteina, carboidrato: a.carboidrato, gordura: a.gordura } };
}
export function escolhaDoSalvo(s) {
  return {
    origem: 'salvo', id: s.id, nome: s.nome, base: s.peso ?? 1, unidade: s.unidade ?? 'porção', medida: s.quantidade ?? null,
    macros: { kcal: s.kcal, proteina: s.proteina, carboidrato: s.carboidrato, gordura: s.gordura },
  };
}

/** Busca vazia: os ultimos salvos ("Usados antes"). Com texto: os salvos e a tabela que batem. */
export function buscarAlimentos(busca, salvos, tabela = TABELA_ALIMENTOS) {
  const t = String(busca ?? '').trim();
  if (t === '') return { salvos: salvos.slice(0, 6).map(escolhaDoSalvo), tabela: [] };
  return {
    salvos: salvos.filter((s) => bate(s.nome, t)).slice(0, 6).map(escolhaDoSalvo),
    tabela: tabela.filter((a) => bate(a.nome, t)).slice(0, 10).map(escolhaDaTabela),
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
