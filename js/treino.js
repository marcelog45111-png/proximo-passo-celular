// Treino com sobrecarga progressiva (04/11/2026). Regras puras.
//
// O plano mora na configuracao `treinoPlano` e cada dia treinado em
// `treinoSessao:<dia>`: as duas sincronizam com o computador como qualquer
// configuracao. A progressao e a dupla, pela faixa de repeticoes de cada
// exercicio (a que o usuario anotou no treino dele; sem faixa, 8 a 12):
// fechou o topo da faixa em todas as series -> sobe a carga e volta ao comeco
// da faixa; senao, mesma carga e uma repeticao a mais onde ficou abaixo.

export const FAIXA_PADRAO = { min: 8, max: 12 };
export const NOMES_DOS_DIAS = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];
export const SIGLAS_DOS_DIAS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

const numero = (v, padrao = null) => (typeof v === 'number' && Number.isFinite(v) ? v : padrao);
const serie = (s) => ({ carga: numero(s?.carga, 0), reps: Math.max(0, Math.round(numero(s?.reps, 0))) });

function lerExercicio(e) {
  if (typeof e !== 'object' || e === null || typeof e.id !== 'string' || typeof e.nome !== 'string' || e.nome.trim() === '') return null;
  const min = numero(e.faixa?.min);
  const max = numero(e.faixa?.max);
  return {
    id: e.id,
    nome: e.nome.trim(),
    faixa: min !== null && max !== null && min > 0 && max >= min ? { min, max } : null,
    series: Math.min(10, Math.max(1, Math.round(numero(e.series, 3)))),
    nota: typeof e.nota === 'string' ? e.nota : '',
    aquecimento: Array.isArray(e.aquecimento) ? e.aquecimento.map(serie).filter((s) => s.reps > 0) : [],
    referencia: e.referencia && typeof e.referencia === 'object'
      ? { carga: numero(e.referencia.carga, 0), reps: (Array.isArray(e.referencia.reps) ? e.referencia.reps : []).map((r) => Math.round(numero(r, 0))).filter((r) => r > 0) }
      : null,
  };
}

/** O plano gravado, conferido. Nunca lanca; plano estragado vira vazio. */
export function lerPlanoTreino(texto) {
  let bruto;
  try {
    bruto = typeof texto === 'string' ? JSON.parse(texto) : texto;
  } catch {
    return { dias: [] };
  }
  const dias = Array.isArray(bruto?.dias) ? bruto.dias : [];
  return {
    dias: dias
      .filter((d) => typeof d?.id === 'string' && Number.isInteger(d.diaSemana) && d.diaSemana >= 0 && d.diaSemana <= 6)
      .map((d) => ({
        id: d.id,
        diaSemana: d.diaSemana,
        nome: typeof d.nome === 'string' && d.nome.trim() !== '' ? d.nome.trim() : NOMES_DOS_DIAS[d.diaSemana],
        nota: typeof d.nota === 'string' ? d.nota : '',
        exercicios: (Array.isArray(d.exercicios) ? d.exercicios : []).map(lerExercicio).filter((e) => e !== null),
      }))
      .sort((a, b) => ((a.diaSemana + 6) % 7) - ((b.diaSemana + 6) % 7)),
  };
}

export function lerSessao(texto) {
  try {
    const s = typeof texto === 'string' ? JSON.parse(texto) : texto;
    if (typeof s?.dia !== 'string') return null;
    const exercicios = {};
    for (const [id, lista] of Object.entries(s.exercicios ?? {})) {
      if (Array.isArray(lista)) exercicios[id] = lista.map(serie);
    }
    const minutos = numero(s.cardio?.minutos);
    return {
      dia: s.dia,
      treinoId: typeof s.treinoId === 'string' ? s.treinoId : null,
      exercicios,
      cardio: minutos !== null ? { minutos, kcal: numero(s.cardio.kcal), tipo: typeof s.cardio.tipo === 'string' ? s.cardio.tipo : '' } : null,
      atualizadoEm: typeof s.atualizadoEm === 'string' ? s.atualizadoEm : '',
    };
  } catch {
    return null;
  }
}

/** Todas as sessoes guardadas nas configuracoes, da mais nova para a mais velha. */
export function sessoesDoConfig(config) {
  return Object.entries(config)
    .filter(([k]) => k.startsWith('treinoSessao:'))
    .map(([, v]) => lerSessao(v))
    .filter((s) => s !== null)
    .sort((a, b) => (a.dia < b.dia ? 1 : -1));
}

const feitas = (lista) => (lista ?? []).filter((s) => s.reps > 0);

/** A ultima vez que o exercicio foi feito antes do dia, ou a referencia anotada no plano. */
export function ultimaVez(exercicio, sessoes, antesDe) {
  for (const s of sessoes) {
    if (s.dia >= antesDe) continue;
    const series = feitas(s.exercicios[exercicio.id]);
    if (series.length > 0) return { dia: s.dia, series };
  }
  const ref = exercicio.referencia;
  if (ref && ref.reps.length > 0) return { dia: null, series: ref.reps.map((reps) => ({ carga: ref.carga, reps })) };
  return null;
}

/** Quanto sobe a carga: pouco nos halteres leves, mais nas maquinas. */
export function passoDeCarga(carga) {
  if (carga < 10) return 1;
  if (carga < 30) return 2;
  return 5;
}

const fmtKg = (v) => `${String(Math.round(v * 10) / 10).replace('.', ',')} kg`;

/**
 * O que fazer hoje no exercicio. tipo:
 *  - 'primeira': nada anotado ainda;
 *  - 'subir': fechou o topo da faixa em todas as series;
 *  - 'bater': mesma carga, uma repeticao a mais onde ficou abaixo do topo.
 */
export function sugestao(exercicio, ultima) {
  const faixa = exercicio.faixa ?? FAIXA_PADRAO;
  if (ultima === null || ultima.series.length === 0) {
    return { tipo: 'primeira', carga: null, reps: Array(exercicio.series).fill(faixa.min), texto: `Escolha uma carga que dê ${faixa.min}–${faixa.max} repetições.` };
  }
  // A carga de trabalho e a mais pesada da ultima vez.
  const carga = Math.max(...ultima.series.map((s) => s.carga));
  const trabalho = ultima.series.filter((s) => s.carga === carga);
  const completas = trabalho.length >= exercicio.series;
  if (completas && trabalho.every((s) => s.reps >= faixa.max)) {
    const nova = carga + passoDeCarga(carga);
    return { tipo: 'subir', carga: nova, reps: Array(exercicio.series).fill(faixa.min), texto: `Suba para ${fmtKg(nova)}: você fechou ${faixa.max} em todas as séries.` };
  }
  const reps = Array.from({ length: exercicio.series }, (_, i) => {
    const antes = trabalho[i]?.reps ?? trabalho[trabalho.length - 1]?.reps ?? faixa.min;
    return Math.min(faixa.max, Math.max(faixa.min, antes + 1));
  });
  return { tipo: 'bater', carga, reps, texto: `Mantenha ${fmtKg(carga)} e busque ${reps.join(', ')}.` };
}

export function textoDasSeries(series) {
  if (series.length === 0) return '';
  const cargas = [...new Set(series.map((s) => s.carga))];
  if (cargas.length === 1) return `${fmtKg(cargas[0])} · ${series.map((s) => s.reps).join(', ')}`;
  return series.map((s) => `${fmtKg(s.carga)}×${s.reps}`).join(' · ');
}

/** Volume (carga × repeticoes) de uma lista de series, para comparar treinos. */
export const volume = (series) => series.reduce((t, s) => t + s.carga * s.reps, 0);

/** O treino do dia da semana, ou null se for descanso. */
export const treinoDoDia = (plano, diaSemana) => plano.dias.find((d) => d.diaSemana === diaSemana) ?? null;

export function novoId() {
  return crypto.randomUUID ? crypto.randomUUID() : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}
