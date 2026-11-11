// Importar treino com IA (11/11/2026). Pedido: no "Montar treino", importar um treino inteiro de uma
// imagem (print, foto, tabela) ou de um texto (WhatsApp, bloco de notas, planilha), revisar e salvar
// tudo de uma vez no plano que ja existe (`treinoPlano`), sem sistema paralelo.
//
// Como esta dividido:
//  - a IA so LE: devolve um JSON do que esta escrito, sem inventar (INSTRUCAO_IMPORTAR);
//  - validarImportacao confere tudo o que veio (numero fora da faixa vira vazio, nome vazio sai,
//    exercicio repetido sai, dia da semana pelo nome quando a IA nao disse);
//  - corresponder liga o exercicio lido a um que a pessoa ja tem no plano (sinonimos, ingles,
//    abreviacao, erro de digitacao), mas so quando e o MESMO movimento: equipamento diferente
//    ou palavra que muda o exercicio ("inclinado" x "reto") nunca vira o mesmo;
//  - paraPlano monta o `treinoPlano` novo: os dias importados entram no lugar dos mesmos dias da
//    semana; os outros dias ficam como estavam. Exercicio que bateu com um antigo herda o id dele:
//    o historico e a progressao continuam.
// O app do celular nao tem servidor: a chamada usa a chave de IA da propria pessoa, guardada
// cifrada na conta e aberta so no aparelho (o mesmo caminho do Garry).
import { grupoDoExercicio, METODOS, NOMES_DOS_DIAS, novoId } from './treino.js';

export const LIMITES = { imagens: 6, bytesPorImagem: 15 * 1024 * 1024, ladoMaximo: 1600, texto: 12000 };

const SEM_ACENTO = (t) => String(t ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

export const INSTRUCAO_IMPORTAR = [
  'Voce le treinos de musculacao escritos por pessoas (prints, fotos de fichas, tabelas, mensagens de WhatsApp, anotacoes) e devolve SO um JSON, sem texto antes ou depois.',
  'Regra principal: transcreva o que esta escrito. NUNCA invente series, repeticoes, cargas, descanso ou exercicios que nao aparecem. O que nao estiver escrito fica null.',
  'Formato:',
  '{"legivel": true|false, "problema": null|"o que impediu a leitura", "dias": [{"diaSemana": 0-6|null (0 domingo, 1 segunda ... 6 sabado; null se o treino nao diz o dia, como "Treino A"), "nome": "nome do treino como escrito, ex. Peito e ombros ou Treino A", "nota": "observacoes gerais do dia"|null, "exercicios": [{"nome": "nome do exercicio como escrito, corrigindo so erro de digitacao obvio", "series": numero de series de TRABALHO|null, "faixa": {"min": n, "max": n}|null (meta de repeticoes: "8-12" = 8 e 12; "12" = 12 e 12), "repsFeitas": [reps de cada serie ja feita]|null, "cargas": [carga em kg de cada serie de trabalho, na ordem]|null, "aquecimento": [{"carga": kg|null, "reps": n}], "descansoS": segundos|null, "rir": "texto"|null, "rpe": "texto"|null, "metodo": "drop"|"restpause"|"myo"|"fst7"|null, "tecnica": "outra tecnica escrita (bi-set com X, cluster, parciais...)"|null, "nota": "execucao, progressao, observacoes"|null, "confianca": "alta"|"media"|"baixa"}]}]}',
  'Detalhes:',
  '- Uma entrada por exercicio, na ordem em que aparece. Nao repita o mesmo exercicio duas vezes por ter visto em duas imagens.',
  '- "3x8-12 30kg" = series 3, faixa 8 a 12, cargas [30,30,30]. "4x10 40/35/30/25" = cargas diferentes por serie, na ordem. Carga so se estiver escrita.',
  '- Series de aquecimento, preparacao ou reconhecimento ficam em "aquecimento", NUNCA em series.',
  '- Meta de repeticoes (o que se busca, como 8-12) vai em faixa. Repeticoes ja feitas (um registro, como "40kg: 12, 10, 9") vao em repsFeitas com as cargas; nao confunda as duas.',
  '- Descanso escrito ("descanso 2 min", "90s") vale para os exercicios do bloco/dia onde aparece. Converta para segundos.',
  '- RIR/RPE escritos para um grupo de exercicios ("RIR 1-2 nos compostos") vao em cada exercicio a que se aplicam.',
  '- Drop set, rest-pause, myo-reps e FST-7 vao em metodo; outras tecnicas (bi-set, tri-set, cluster, parciais, isometria) vao em tecnica.',
  '- Se a imagem estiver ilegivel ou nao for um treino, devolva legivel false e diga o problema. Se so uma parte estiver ilegivel, leia o resto e marque confianca "baixa" no que ficou duvidoso.',
  '- Treino dividido em dias (segunda a sabado, A/B/C, dia 1/2/3) vira um item em "dias" para cada um.',
].join('\n');

// ---------- ler e conferir a resposta ----------

/** O JSON da resposta da IA, mesmo com cerca de codigo ou texto em volta. */
export function extrairJson(texto) {
  const t = String(texto ?? '').replace(/```(?:json)?/gi, '');
  const ini = t.indexOf('{');
  const fim = t.lastIndexOf('}');
  if (ini === -1 || fim <= ini) throw new Error('A IA não devolveu um treino que dê para ler. Tente de novo.');
  try {
    return JSON.parse(t.slice(ini, fim + 1));
  } catch {
    throw new Error('A IA devolveu um treino quebrado. Tente de novo.');
  }
}

const NOMES_PARA_DIA = [
  ['domingo', 'dom'], ['segunda', 'seg', '2a', '2ª'], ['terca', 'ter', '3a', '3ª'], ['quarta', 'qua', '4a', '4ª'],
  ['quinta', 'qui', '5a', '5ª'], ['sexta', 'sex', '6a', '6ª'], ['sabado', 'sab'],
];
const DIAS_EM_INGLES = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
/** O dia da semana escrito no nome ("Segunda — Peito", "SEG", "Monday"), ou null. */
export function diaDoTexto(texto) {
  const t = SEM_ACENTO(texto);
  for (let d = 0; d < 7; d += 1) {
    const nomes = [...NOMES_PARA_DIA[d], DIAS_EM_INGLES[d]].map((n) => SEM_ACENTO(n).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
    if (new RegExp(`(^|[^a-z0-9])(${nomes.join('|')})(-?feira)?([^a-z0-9]|$)`).test(t)) return d;
  }
  return null;
}

const numero = (v, min, max, casas = 0) => {
  const limpo = typeof v === 'string' ? v.replace(',', '.').replace(/[^0-9.\-]/g, '') : '';
  const n = typeof v === 'number' ? v : limpo !== '' ? Number(limpo) : NaN;
  if (!Number.isFinite(n) || n < min || n > max) return null;
  const f = 10 ** casas;
  return Math.round(n * f) / f;
};
const textoOuNull = (v, max = 300) => (typeof v === 'string' && v.trim() !== '' ? v.trim().slice(0, max) : null);

function lerFaixa(v) {
  if (v && typeof v === 'object') {
    const min = numero(v.min, 1, 100);
    const max = numero(v.max, 1, 100);
    if (min !== null && max !== null) return { min: Math.min(min, max), max: Math.max(min, max) };
    if (min !== null || max !== null) return { min: min ?? max, max: max ?? min };
    return null;
  }
  if (typeof v === 'string') {
    const m = v.match(/(\d+)\s*(?:-|–|a|até|to)\s*(\d+)/i);
    if (m) return lerFaixa({ min: Number(m[1]), max: Number(m[2]) });
  }
  const n = numero(v, 1, 100);
  return n === null ? null : { min: n, max: n };
}

const METODOS_LIDOS = { drop: 'drop', dropset: 'drop', 'drop-set': 'drop', restpause: 'restpause', 'rest-pause': 'restpause', myo: 'myo', 'myo-reps': 'myo', myoreps: 'myo', fst7: 'fst7', 'fst-7': 'fst7' };

function lerExercicioImportado(e) {
  const nome = textoOuNull(e?.nome, 80);
  if (!nome) return null;
  const cargas = Array.isArray(e.cargas) ? e.cargas.map((c) => numero(c, 0, 1000, 1)) : null;
  const repsFeitas = Array.isArray(e.repsFeitas) ? e.repsFeitas.map((r) => numero(r, 1, 100)).filter((r) => r !== null) : null;
  const aquecimento = (Array.isArray(e.aquecimento) ? e.aquecimento : [])
    .map((a) => ({ carga: numero(a?.carga, 0, 1000, 1) ?? 0, reps: numero(a?.reps, 1, 100) }))
    .filter((a) => a.reps !== null);
  const metodo = METODOS_LIDOS[SEM_ACENTO(e.metodo).replace(/\s+/g, '')] ?? null;
  return {
    chave: novoId(),
    nome,
    series: numero(e.series, 1, 10),
    faixa: lerFaixa(e.faixa),
    repsFeitas: repsFeitas && repsFeitas.length > 0 ? repsFeitas : null,
    cargas: cargas && cargas.some((c) => c !== null) ? cargas : null,
    aquecimento,
    descansoS: numero(e.descansoS, 10, 900),
    rir: textoOuNull(String(e.rir ?? '') || null, 20),
    rpe: textoOuNull(String(e.rpe ?? '') || null, 20),
    metodo,
    tecnica: textoOuNull(e.tecnica, 120),
    nota: textoOuNull(e.nota, 300),
    confianca: ['alta', 'media', 'baixa'].includes(e.confianca) ? e.confianca : 'media',
  };
}

const assinaturaDoExercicio = (x) => JSON.stringify([SEM_ACENTO(x.nome).replace(/\s+/g, ' '), x.series, x.faixa, x.cargas]);

/**
 * O que a IA devolveu, conferido. Nunca lanca por campo ruim: o campo vira null. Lanca so se nao
 * houver treino nenhum (com o problema que a IA contou, quando contou).
 */
export function validarImportacao(bruto) {
  const legivel = bruto?.legivel !== false;
  const dias = [];
  for (const d of Array.isArray(bruto?.dias) ? bruto.dias : []) {
    const nome = textoOuNull(d?.nome, 60);
    const diaSemana = numero(d?.diaSemana, 0, 6) ?? (nome ? diaDoTexto(nome) : null);
    const vistos = new Set();
    const exercicios = [];
    for (const e of Array.isArray(d?.exercicios) ? d.exercicios : []) {
      const x = lerExercicioImportado(e);
      if (!x) continue;
      const a = assinaturaDoExercicio(x);
      if (vistos.has(a)) continue; // o mesmo exercicio lido duas vezes (duas imagens, linha repetida)
      vistos.add(a);
      exercicios.push(x);
    }
    if (exercicios.length === 0) continue;
    // o mesmo dia em duas imagens: junta, sem repetir exercicio
    const igual = dias.find((o) => o.diaSemana === diaSemana && SEM_ACENTO(o.nome) === SEM_ACENTO(nome ?? ''));
    if (igual) {
      const ja = new Set(igual.exercicios.map(assinaturaDoExercicio));
      igual.exercicios.push(...exercicios.filter((x) => !ja.has(assinaturaDoExercicio(x))));
      continue;
    }
    dias.push({ chave: novoId(), diaSemana, nome: nome ?? (diaSemana !== null ? NOMES_DOS_DIAS[diaSemana] : 'Treino'), nota: textoOuNull(d?.nota, 300), exercicios });
  }
  if (dias.length === 0) {
    const problema = textoOuNull(bruto?.problema, 200);
    throw new Error(problema
      ? `Não deu para ler o treino: ${problema}. Mande uma imagem mais nítida ou cole o texto.`
      : legivel ? 'Não achei nenhum exercício. Confira se a imagem ou o texto é um treino.' : 'A imagem está ilegível. Mande uma mais nítida (de frente, com luz) ou cole o texto.');
  }
  return { dias, problema: legivel ? null : textoOuNull(bruto?.problema, 200) };
}

// ---------- o mesmo exercicio que a pessoa ja tem ----------

// Ingles e jeitos comuns de escrever -> o nome em portugues (so movimento identico).
const SINONIMOS = [
  [/\bincline (?:bench )?press\b|\bincline bench\b/g, 'supino inclinado'],
  [/\bdecline (?:bench )?press\b/g, 'supino declinado'],
  [/\bbench press\b|\bflat bench\b|\bbench\b/g, 'supino reto'],
  [/\b(?:lat pull ?down|puxada alta|puxada frontal|puxada pela frente|puxada frente)\b/g, 'puxada frente'],
  [/\blateral raises?\b|\bside raises?\b/g, 'elevacao lateral'],
  [/\bfront raises?\b/g, 'elevacao frontal'],
  [/\b(?:shoulder|overhead|military) press\b/g, 'desenvolvimento'],
  [/\bhack squat\b/g, 'hack'],
  [/\bbulgarian split squat\b/g, 'bulgaro'],
  [/\bsquats?\b/g, 'agachamento'],
  [/\bleg press\b/g, 'leg press'],
  [/\bleg extensions?\b/g, 'cadeira extensora'],
  [/\blying leg curls?\b/g, 'mesa flexora'],
  [/\bseated leg curls?\b/g, 'cadeira flexora'],
  [/\b(?:romanian deadlift|rdl)\b/g, 'terra romeno'],
  [/\bdeadlift\b/g, 'levantamento terra'],
  [/\b(?:bent over|barbell) rows?\b/g, 'remada curvada'],
  [/\b(?:seated|cable) rows?\b/g, 'remada baixa'],
  [/\bt-?bar rows?\b/g, 'remada cavalinho'],
  [/\bhammer curls?\b/g, 'rosca martelo'],
  [/\bbarbell curls?\b/g, 'rosca direta'],
  [/\b(?:triceps )?push ?downs?\b/g, 'triceps polia'],
  [/\bskull ?crushers?\b/g, 'triceps testa'],
  [/\b(?:french press|overhead triceps extension)\b/g, 'triceps frances'],
  [/\bdips\b/g, 'paralela'],
  [/\b(?:pec deck|fly machine|machine fly)\b/g, 'voador'],
  [/\bcable cross ?overs?\b/g, 'crossover'],
  [/\bcalf raises?\b/g, 'panturrilha'],
  [/\bhip thrusts?\b/g, 'elevacao pelvica'],
  [/\blunges?\b/g, 'afundo'],
];
// Abreviacoes comuns de ficha.
const ABREVIACOES = { sup: 'supino', inc: 'inclinado', incl: 'inclinado', elev: 'elevacao', desenv: 'desenvolvimento', agach: 'agachamento', maq: 'maquina', halt: 'halter', hbt: 'halter', c: 'com', tri: 'triceps', bi: 'biceps', pux: 'puxada', rem: 'remada' };
const EQUIPAMENTO = { halter: 'halter', halteres: 'halter', dumbbell: 'halter', dumbbells: 'halter', db: 'halter', barra: 'barra', barbell: 'barra', maquina: 'maquina', machine: 'maquina', polia: 'polia', cabo: 'polia', cable: 'polia', smith: 'smith', livre: 'barra', kettlebell: 'kettlebell' };
const VAZIAS = new Set(['com', 'de', 'da', 'do', 'das', 'dos', 'na', 'no', 'nas', 'nos', 'em', 'a', 'o', 'e', 'the', 'with', 'on', 'x']);

function palavras(nome) {
  let t = SEM_ACENTO(nome).replace(/c\//g, 'com ');
  for (const [re, pt] of SINONIMOS) t = t.replace(re, pt);
  const nucleo = [];
  const equipamento = new Set();
  for (let p of t.split(/[^a-z0-9]+/).filter(Boolean)) {
    p = ABREVIACOES[p] ?? p;
    if (VAZIAS.has(p) || /^\d+$/.test(p)) continue;
    if (Object.hasOwn(EQUIPAMENTO, p)) { if (EQUIPAMENTO[p]) equipamento.add(EQUIPAMENTO[p]); continue; }
    nucleo.push(p.length > 4 ? p.replace(/(es|s)$/, '') : p);
  }
  return { nucleo: [...new Set(nucleo)].sort(), equipamento };
}

function distancia(a, b) {
  const m = a.length;
  const n = b.length;
  const d = Array.from({ length: m + 1 }, (_, i) => [i, ...Array(n).fill(0)]);
  for (let j = 1; j <= n; j += 1) d[0][j] = j;
  for (let i = 1; i <= m; i += 1) for (let j = 1; j <= n; j += 1) d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return d[m][n];
}
// Palavras de exercicio que existem: duas DIFERENTES daqui nunca sao erro de digitacao uma da outra
// ("inclinado" x "declinado", "lateral" x "frontal", "baixa" x "alta"). O erro de digitacao so vale
// para palavra que nao esta aqui ("remda", "inclnado").
const VOCABULARIO = new Set(('supino reto inclinado declinado elevacao lateral frontal posterior puxada frente remada baixa alta curvada '
  + 'cavalinho unilateral rosca direta martelo scott concentrada alternada triceps testa frances corda polia agachamento livre hack sumo '
  + 'terra romeno stiff leg press cadeira mesa extensora flexora abdutora adutora panturrilha sentado sentada crucifixo voador crossover '
  + 'desenvolvimento arnold paralela fixa afundo bulgaro passada pelvica encolhimento face pull abdominal prancha inverso inversa aberta '
  + 'fechada neutra supinada pronada serrote pullover graviton smith banco declinada inclinada reta lombar hiperextensao gluteo biceps '
  + 'peito costas ombro perna coice anjo kickback vertical horizontal articulado articulada').split(' '));
function palavraIgual(a, b) {
  if (a === b) return true;
  if (VOCABULARIO.has(a) && VOCABULARIO.has(b)) return false;
  const menor = Math.min(a.length, b.length);
  if (menor >= 4 && (a.startsWith(b) || b.startsWith(a)) && Math.abs(a.length - b.length) <= 3) return true;
  return menor >= 5 && distancia(a, b) <= (Math.max(a.length, b.length) >= 8 ? 2 : 1);
}
const mesmasPalavras = (xs, ys) => xs.length === ys.length && xs.every((x) => ys.some((y) => palavraIgual(x, y))) && ys.every((y) => xs.some((x) => palavraIgual(x, y)));

/**
 * O exercicio que a pessoa ja tem e que e o MESMO movimento, ou null. alta = mesmas palavras e mesmo
 * equipamento; media = mesmas palavras e um dos dois nao diz o equipamento. Equipamento diferente,
 * palavra a mais ou a menos (inclinado, unilateral, sentado...) ou musculo diferente nunca casam.
 */
export function corresponder(nome, existentes) {
  const lido = palavras(nome);
  if (lido.nucleo.length === 0) return null;
  const grupoLido = grupoDoExercicio(nome).grupo;
  let achado = null;
  for (const ex of existentes) {
    const dele = palavras(ex.nome);
    if (!mesmasPalavras(lido.nucleo, dele.nucleo)) continue;
    const grupoDele = grupoDoExercicio(ex.nome).grupo;
    if (!grupoLido.startsWith('outro:') && !grupoDele.startsWith('outro:') && grupoLido !== grupoDele) continue;
    const a = [...lido.equipamento].sort().join();
    const b = [...dele.equipamento].sort().join();
    if (a !== b && a !== '' && b !== '') continue;
    const confianca = a === b ? 'alta' : 'media';
    if (!achado || (confianca === 'alta' && achado.confianca !== 'alta')) achado = { ex, confianca };
  }
  return achado;
}

// ---------- do treino revisado ao plano ----------

/** O que vai para a nota do exercicio: RIR, RPE, tecnica e observacao, como estavam escritos. */
export function notaDoImportado(x) {
  return [x.rir ? `RIR ${x.rir.replace(/^rir\s*/i, '')}` : null, x.rpe ? `RPE ${x.rpe.replace(/^rpe\s*/i, '')}` : null, x.tecnica, x.nota].filter(Boolean).join(' · ');
}

/**
 * O `treinoPlano` novo: os dias revisados entram no lugar dos dias da mesma semana; os outros ficam.
 * revisados: [{diaSemana, nome, nota, exercicios: [{nome, series, faixa, cargas, repsFeitas, aquecimento,
 * descansoS, metodo, nota, usarId}]}] (usarId = o id do exercicio antigo que e o mesmo).
 */
export function paraPlano(revisados, planoAtual) {
  const atuais = planoAtual?.dias ?? [];
  const usados = new Set();
  const dias = revisados.map((d) => {
    const antigo = atuais.find((a) => a.diaSemana === d.diaSemana);
    return {
      id: antigo?.id ?? `imp-${novoId()}`,
      diaSemana: d.diaSemana,
      nome: d.nome.trim() || NOMES_DOS_DIAS[d.diaSemana],
      nota: d.nota ?? '',
      exercicios: d.exercicios.filter((x) => x.nome.trim() !== '').map((x) => {
        const id = x.usarId && !usados.has(x.usarId) ? x.usarId : novoId();
        usados.add(id);
        const cargas = (x.cargas ?? []).filter((c) => c !== null);
        const reps = x.repsFeitas ?? [];
        const metodo = x.metodo && Object.hasOwn(METODOS, x.metodo) ? x.metodo : null;
        return {
          id,
          nome: x.nome.trim(),
          faixa: x.faixa,
          series: x.series ?? METODOS[metodo]?.series ?? 3,
          metodo,
          drops: metodo === 'drop' ? METODOS.drop.drops : 0,
          descansoS: x.descansoS !== null && x.descansoS >= 15 && x.descansoS <= 600 ? x.descansoS : null,
          nota: x.nota ?? '',
          aquecimento: x.aquecimento ?? [],
          aquecimentoModo: (x.aquecimento ?? []).length > 0 ? 'manual' : null,
          musculo: null,
          // a carga lida guia o primeiro treino; so com reps FEITAS escritas vira o treino anterior
          // (sem elas, nada de inventar 8 reps em cada serie)
          referencia: cargas.length > 0
            ? { carga: cargas[0], reps, ...(new Set(cargas).size > 1 ? { cargas } : {}) }
            : null,
        };
      }),
    };
  });
  const trocados = new Set(dias.map((d) => d.diaSemana));
  return { dias: [...atuais.filter((a) => !trocados.has(a.diaSemana)), ...dias] };
}

// ---------- a chamada a IA ----------

// Modelos gratis do OpenRouter que leem imagem (conferidos em 11/11/2026); o primeiro que existir.
const PREFERIDOS_COM_IMAGEM = ['nvidia/nemotron-3.5-super-vl:free', 'google/gemma-4-31b-it:free', 'google/gemma-4-26b-a4b-it:free', 'thinkingmachines/inkling-2-small:free'];

/** O modelo para ler imagem: o da pessoa, se ler; senao um gratis que leia (so no OpenRouter). */
export async function modeloParaImagem({ baseUrl, host, modelo }, f = fetch) {
  if (host !== 'openrouter.ai') return modelo;
  let lista;
  try {
    const r = await f(`${baseUrl}/models`);
    lista = (await r.json())?.data ?? [];
  } catch {
    return modelo; // sem a lista, tenta com o da pessoa
  }
  const leImagem = (m) => (m.architecture?.input_modalities ?? []).includes('image') && (m.architecture?.output_modalities ?? ['text']).includes('text');
  const dela = lista.find((m) => m.id === modelo);
  if (dela && leImagem(dela)) return modelo;
  const gratis = lista.filter((m) => leImagem(m) && Number(m.pricing?.prompt) === 0 && Number(m.pricing?.completion) === 0);
  const escolhido = PREFERIDOS_COM_IMAGEM.find((id) => gratis.some((m) => m.id === id)) ?? gratis.find((m) => !/lyria|audio/i.test(m.id) && m.id !== 'openrouter/free')?.id;
  if (!escolhido) throw new Error('Nenhum modelo grátis lê imagem agora. Cole o treino como texto.');
  return escolhido;
}

const ESPERA_MS = 150_000;

/** Manda o texto e/ou as imagens (data URLs) e devolve o treino lido e conferido. */
export async function interpretarTreino(ia, { texto = '', imagens = [] }, f = fetch) {
  const { baseUrl, host, modelo, chave } = ia;
  const usar = imagens.length > 0 ? await modeloParaImagem(ia, f) : modelo;
  const pedido = texto.trim()
    ? `Treino para importar (texto como a pessoa colou):\n"""\n${texto.trim().slice(0, LIMITES.texto)}\n"""${imagens.length ? '\nAs imagens anexadas fazem parte do mesmo treino.' : ''}`
    : `Leia o treino ${imagens.length > 1 ? `destas ${imagens.length} imagens (podem ser dias diferentes ou partes do mesmo dia)` : 'desta imagem'}.`;
  const corpo = {
    model: usar,
    temperature: 0,
    max_tokens: 8000,
    messages: [
      { role: 'system', content: INSTRUCAO_IMPORTAR },
      { role: 'user', content: [{ type: 'text', text: pedido }, ...imagens.map((url) => ({ type: 'image_url', image_url: { url } }))] },
    ],
  };
  if (host === 'openrouter.ai') corpo.reasoning = { effort: 'low', exclude: true };
  if (host === 'integrate.api.nvidia.com') corpo.chat_template_kwargs = { enable_thinking: false };
  const headers = { Authorization: `Bearer ${chave}`, 'Content-Type': 'application/json' };
  if (host === 'openrouter.ai') headers['X-Title'] = 'Proximo Passo (iPhone)';
  const controle = new AbortController();
  const relogio = setTimeout(() => controle.abort(), ESPERA_MS);
  let resposta;
  try {
    resposta = await f(`${baseUrl}/chat/completions`, { method: 'POST', headers, body: JSON.stringify(corpo), signal: controle.signal });
  } catch {
    throw new Error(controle.signal.aborted ? 'A IA demorou demais. Tente de novo (com menos imagens, se puder).' : 'Não consegui falar com a IA. Confira a internet.');
  } finally {
    clearTimeout(relogio);
  }
  if (!resposta.ok) {
    const t = await resposta.text().catch(() => '');
    if (resposta.status === 401 || resposta.status === 403) throw new Error('O provedor recusou a chave da IA. Troque em Ajustes > Garry (IA).');
    if (resposta.status === 402) throw new Error('Sem saldo no provedor da IA. Os modelos ":free" funcionam sem saldo.');
    if (resposta.status === 413) throw new Error('As imagens ficaram grandes demais para a IA. Mande menos de uma vez.');
    if (resposta.status === 429) throw new Error('A cota grátis da IA acabou por agora. Tente mais tarde ou cole o texto.');
    if (/image|vision|multimodal/i.test(t)) throw new Error('Este modelo não lê imagem. Cole o treino como texto.');
    throw new Error(`A IA respondeu ${resposta.status}. Tente de novo.`);
  }
  const dados = await resposta.json().catch(() => null);
  const conteudo = dados?.choices?.[0]?.message?.content;
  const textoDaResposta = Array.isArray(conteudo) ? conteudo.map((c) => c?.text ?? '').join('') : String(conteudo ?? '');
  return { ...validarImportacao(extrairJson(textoDaResposta)), modelo: usar };
}
