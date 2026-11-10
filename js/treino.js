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

/**
 * Metodos de treino (09/11/2026), so para o exercicio em que a pessoa escolher.
 * Cada um muda o roteiro (o que vem depois de cada serie), o descanso e a regra
 * que libera a carga. Em `series`: no myo-reps conta as mini-series e no
 * rest-pause as pausas (a ativacao e a serie principal vem antes, sempre uma).
 */
export const METODOS = {
  fst7: { nome: 'FST-7', resumo: '7 séries com a mesma carga e só 30 a 45 s de descanso.', rotulo: 'Séries', series: 7, descansoS: 40 },
  myo: { nome: 'Myo-reps', resumo: 'Uma série de ativação e mini-séries curtas, com 20 s entre elas.', rotulo: 'Mini-séries', series: 4, descansoS: 20, faixa: { min: 12, max: 20 } },
  drop: { nome: 'Drop set', resumo: 'Depois da última série, baixa a carga e continua sem descanso.', rotulo: 'Séries', drops: 2 },
  restpause: { nome: 'Rest-pause', resumo: 'Uma série principal e pausas de 20 s com a mesma carga.', rotulo: 'Pausas', series: 2, descansoS: 20 },
};

const numero = (v, padrao = null) => (typeof v === 'number' && Number.isFinite(v) ? v : padrao);
// t: 'm' = mini-serie ou pausa (mesma carga), 'd' = drop. Sem t e serie de trabalho.
const serie = (s) => ({
  carga: numero(s?.carga, 0),
  reps: Math.max(0, Math.round(numero(s?.reps, 0))),
  ...(s?.t === 'm' || s?.t === 'd' ? { t: s.t } : {}),
});

function lerExercicio(e) {
  if (typeof e !== 'object' || e === null || typeof e.id !== 'string' || typeof e.nome !== 'string' || e.nome.trim() === '') return null;
  const min = numero(e.faixa?.min);
  const max = numero(e.faixa?.max);
  const metodo = typeof e.metodo === 'string' && Object.hasOwn(METODOS, e.metodo) ? e.metodo : null;
  return {
    id: e.id,
    nome: e.nome.trim(),
    faixa: min !== null && max !== null && min > 0 && max >= min ? { min, max } : null,
    series: Math.min(10, Math.max(1, Math.round(numero(e.series, 3)))),
    metodo,
    drops: metodo === 'drop' ? Math.min(4, Math.max(1, Math.round(numero(e.drops, METODOS.drop.drops)))) : 0,
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
      // exercicios que a pessoa encerrou antes de fazer o roteiro inteiro
      encerrados: (Array.isArray(s.encerrados) ? s.encerrados : []).filter((id) => typeof id === 'string'),
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

const arredondar = (v) => Math.round(v * 10) / 10;
const fmtNumero = (v) => String(arredondar(v)).replace('.', ',');
const fmtKg = (v) => `${fmtNumero(v)} kg`;
const plural = (n, um, varios) => (Math.abs(n) === 1 ? um : varios);

/** A faixa de repeticoes do exercicio: a anotada, a do metodo ou 8 a 12. */
export const faixaDe = (exercicio) => exercicio.faixa ?? METODOS[exercicio.metodo]?.faixa ?? FAIXA_PADRAO;

/** Quantas repeticoes tem cada mini-serie do myo-reps: perto de um quarto do teto, de 3 a 5. */
export const alvoDaMini = (faixa) => Math.min(5, Math.max(3, Math.round(faixa.max / 4)));

/**
 * O roteiro do exercicio: um passo por serie, na ordem em que acontecem. A lista
 * gravada na sessao segue a mesma ordem. `descansoS` e o descanso ANTES do passo:
 * null usa o descanso dos Ajustes, 0 e sem descanso. `total` estica o roteiro
 * quando a pessoa fez series a mais.
 */
export function roteiro(exercicio, total = 0) {
  const m = exercicio.metodo;
  const passos = [];
  const por = (tipo, rotulo, curto, descansoS = null) => passos.push({
    tipo, ...(tipo === 'mini' || tipo === 'pausa' ? { t: 'm' } : tipo === 'drop' ? { t: 'd' } : {}), rotulo, curto, descansoS,
  });
  const mini = () => { const i = passos.filter((p) => p.tipo === 'mini').length + 1; por('mini', `Mini ${i}`, `M${i}`, METODOS.myo.descansoS); };
  const pausa = () => { const i = passos.filter((p) => p.tipo === 'pausa').length + 1; por('pausa', `Pausa ${i}`, `P${i}`, METODOS.restpause.descansoS); };
  const drop = () => { const i = passos.filter((p) => p.tipo === 'drop').length + 1; por('drop', `Drop ${i}`, `D${i}`, 0); };
  const normal = () => { const i = passos.length + 1; por('serie', `Série ${i}`, String(i), m === 'fst7' && i > 1 ? METODOS.fst7.descansoS : null); };

  if (m === 'myo') {
    por('ativacao', 'Ativação', 'A');
    for (let i = 0; i < exercicio.series; i += 1) mini();
  } else if (m === 'restpause') {
    por('serie', 'Série principal', '1');
    for (let i = 0; i < exercicio.series; i += 1) pausa();
  } else {
    for (let i = 0; i < exercicio.series; i += 1) normal();
    if (m === 'drop') for (let i = 0; i < exercicio.drops; i += 1) drop();
  }
  const extra = m === 'myo' ? mini : m === 'restpause' ? pausa : m === 'drop' ? drop : normal;
  while (passos.length < total) extra();
  return passos;
}

/**
 * A conta que libera a carga, sobre as series de um dia. A carga de trabalho e a
 * mais pesada entre as series sem tipo (aquecimento mais leve fica de fora).
 *  - normal, FST-7 e drop set: o teto da faixa em todas as series (drops nao contam);
 *  - myo-reps: a ativacao no teto e todas as minis no alvo;
 *  - rest-pause: a serie principal no teto, com as pausas feitas.
 * `faltam` e quantas repeticoes separam o dia da carga nova.
 */
export function progressao(exercicio, series) {
  const validas = feitas(series);
  const semTipo = validas.filter((s) => !s.t);
  if (semTipo.length === 0) return null;
  const faixa = faixaDe(exercicio);
  const carga = Math.max(...semTipo.map((s) => s.carga));
  const trabalho = semTipo.filter((s) => s.carga === carga);
  const minis = validas.filter((s) => s.t === 'm');
  let faltam = 0;
  let completo;
  if (exercicio.metodo === 'myo' || exercicio.metodo === 'restpause') {
    faltam = Math.max(0, faixa.max - trabalho[0].reps);
    if (exercicio.metodo === 'myo') {
      const alvo = alvoDaMini(faixa);
      for (let i = 0; i < exercicio.series; i += 1) faltam += Math.max(0, alvo - (minis[i]?.reps ?? 0));
    }
    completo = minis.length >= exercicio.series;
  } else {
    for (let i = 0; i < exercicio.series; i += 1) faltam += Math.max(0, faixa.max - (trabalho[i]?.reps ?? 0));
    completo = trabalho.length >= exercicio.series;
  }
  return { carga, nova: arredondar(carga + passoDeCarga(carga)), sobe: completo && faltam === 0, faltam, completo };
}

/** O exercicio esta fechado no dia: fez o roteiro inteiro, ou a pessoa encerrou antes (com algo feito). */
export function completoNaSessao(exercicio, sessao) {
  const n = feitas(sessao.exercicios[exercicio.id]).length;
  return n >= roteiro(exercicio).length || (n > 0 && (sessao.encerrados ?? []).includes(exercicio.id));
}

/** A regra que libera a carga, em uma linha, para a tela. */
export function regraDaCarga(exercicio) {
  const faixa = faixaDe(exercicio);
  const n = exercicio.series;
  if (exercicio.metodo === 'myo') return `${faixa.max} na ativação e ${n} ${plural(n, 'mini', 'minis')} de ${alvoDaMini(faixa)}`;
  if (exercicio.metodo === 'restpause') return `${faixa.max} na série principal, com as pausas feitas`;
  if (exercicio.metodo === 'drop') return `${faixa.max} em todas as ${n} séries (os drops não contam)`;
  return n === 1 ? `${faixa.max} na série` : `${faixa.max} em todas as ${n} séries`;
}

/**
 * O treino de hoje no exercicio, passo a passo. Cada passo traz a `base` (o que foi
 * feito nele da ultima vez, ou null), o `alvo` de hoje e a `dica` que explica o alvo.
 * tipo:
 *  - 'primeira': nada anotado ainda;
 *  - 'subir': a ultima vez liberou a carga;
 *  - 'bater': mesma carga, uma repeticao a mais onde ficou abaixo do teto.
 */
export function planoDeHoje(exercicio, ultima, total = 0) {
  const faixa = faixaDe(exercicio);
  const p = ultima ? progressao(exercicio, ultima.series) : null;
  const validas = ultima ? feitas(ultima.series) : [];
  const trabalho = p ? validas.filter((s) => !s.t && s.carga === p.carga) : [];
  const anteriores = { m: validas.filter((s) => s.t === 'm'), d: validas.filter((s) => s.t === 'd') };
  const tipo = p === null ? 'primeira' : p.sobe ? 'subir' : 'bater';
  const carga = p === null ? null : p.sobe ? p.nova : p.carga;
  const cargaDeHoje = carga ?? exercicio.referencia?.carga ?? 0;
  const vez = { w: 0, m: 0, d: 0 };
  let cargaDoDrop = cargaDeHoje;
  let alvoPrincipal = faixa.min;

  const passos = roteiro(exercicio, total).map((passo) => {
    if (passo.t === 'd') {
      const base = anteriores.d[vez.d] ?? null;
      vez.d += 1;
      // Mesma carga de trabalho da ultima vez: repete os drops de la. Senao, 20% a menos a cada um.
      cargaDoDrop = base && tipo === 'bater' ? base.carga : Math.round(cargaDoDrop * 0.8);
      return { ...passo, base, alvo: { carga: cargaDoDrop, reps: base ? base.reps + 1 : faixa.min }, dica: base ? 'Sem descanso: baixe a carga e passe a base.' : 'Sem descanso: baixe a carga e vá até onde der.' };
    }
    if (passo.t === 'm') {
      const base = anteriores.m[vez.m] ?? null;
      vez.m += 1;
      if (passo.tipo === 'mini') {
        const reps = alvoDaMini(faixa);
        return { ...passo, base, alvo: { carga: cargaDeHoje, reps }, dica: `Mini de ${reps} com a mesma carga.` };
      }
      return { ...passo, base, alvo: { carga: cargaDeHoje, reps: base ? base.reps + 1 : Math.max(1, Math.round(alvoPrincipal / 3)) }, dica: base ? '+1 rep sobre a base, com a mesma carga.' : 'Mesma carga, até onde der.' };
    }
    const base = trabalho[vez.w] ?? null;
    vez.w += 1;
    let reps = faixa.min;
    let dica = 'Primeiro registro: o que você fizer vira a base.';
    if (tipo === 'subir') {
      dica = `Carga nova. Qualquer número de ${faixa.min} a ${faixa.max} vale.`;
    } else if (tipo === 'bater') {
      const antes = base?.reps ?? trabalho[trabalho.length - 1]?.reps ?? faixa.min;
      reps = Math.min(faixa.max, Math.max(faixa.min, antes + 1));
      dica = antes >= faixa.max
        ? `Repita o teto de ${faixa.max}.`
        : `+${reps - antes} ${plural(reps - antes, 'rep', 'reps')} sobre a base para progredir.`;
    }
    alvoPrincipal = reps;
    return { ...passo, base, alvo: { carga: cargaDeHoje, reps }, dica };
  });

  let texto = `Escolha uma carga que dê ${faixa.min}–${faixa.max} repetições.`;
  if (tipo === 'subir') {
    const motivo = exercicio.metodo === 'myo' ? `ativação em ${faixa.max} e minis completas`
      : exercicio.metodo === 'restpause' ? `a série principal chegou a ${faixa.max}`
        : `você fechou ${faixa.max} em todas as séries`;
    texto = `Suba para ${fmtKg(carga)}: ${motivo}.`;
  } else if (tipo === 'bater') {
    const reps = passos.filter((x) => !x.t).map((x) => x.alvo.reps);
    const resto = exercicio.metodo === 'myo' ? ` na ativação, depois ${exercicio.series} ${plural(exercicio.series, 'mini', 'minis')} de ${alvoDaMini(faixa)}`
      : exercicio.metodo === 'restpause' ? ' na série principal, depois as pausas'
        : exercicio.metodo === 'drop' ? `, depois ${exercicio.drops} ${plural(exercicio.drops, 'drop', 'drops')}` : '';
    texto = `Mantenha ${fmtKg(carga)} e busque ${reps.join(', ')}${resto}.`;
  }
  return { tipo, carga, faixa, passos, texto };
}

/** O resumo do plano de hoje: a carga, as repeticoes de cada passo e a frase. */
export function sugestao(exercicio, ultima) {
  const plano = planoDeHoje(exercicio, ultima);
  return { tipo: plano.tipo, carga: plano.carga, reps: plano.passos.map((p) => p.alvo.reps), texto: plano.texto };
}

/**
 * Uma serie contra a base dela. tipo: 'carga' (mais peso), 'reps' (mais
 * repeticoes com o mesmo peso), 'igual', 'abaixo' ou 'nova' (nao havia base).
 */
export function veredito(feita, base) {
  if (!base) return { tipo: 'nova', texto: 'Base registrada' };
  const dCarga = arredondar(feita.carga - base.carga);
  const dReps = feita.reps - base.reps;
  if (dCarga > 0) return { tipo: 'carga', texto: `+${fmtNumero(dCarga)} kg` };
  if (dCarga < 0) return { tipo: 'abaixo', texto: `−${fmtNumero(-dCarga)} kg` };
  if (dReps > 0) return { tipo: 'reps', texto: `+${dReps} ${plural(dReps, 'rep', 'reps')}` };
  if (dReps < 0) return { tipo: 'abaixo', texto: `−${-dReps} ${plural(dReps, 'rep', 'reps')}` };
  return { tipo: 'igual', texto: 'Igual' };
}

/**
 * O exercicio de hoje contra a ultima vez: subiu a carga, fez mais repeticoes no
 * total, ficou igual ou abaixo. `liberou` e a carga do proximo treino quando o dia
 * fechou a regra; senao, `faltam` diz quantas repeticoes faltaram.
 */
export function resultadoDoExercicio(exercicio, series, ultima) {
  const hoje = progressao(exercicio, series);
  if (hoje === null) return null;
  const antes = ultima ? progressao(exercicio, ultima.series) : null;
  const fim = { liberou: hoje.sobe ? hoje.nova : null, faltam: hoje.faltam, nova: hoje.nova };
  if (antes === null) return { tipo: 'nova', texto: 'Primeiro registro', ...fim };
  // Com a mesma carga, compara serie com serie (trabalho com trabalho, mini com mini,
  // drop com drop). Serie a mais, sem base, nao conta; serie do roteiro de hoje que
  // existia na base e nao foi feita conta como zero.
  const grupos = (lista, carga) => {
    const v = feitas(lista);
    return { w: v.filter((s) => !s.t && s.carga === carga), m: v.filter((s) => s.t === 'm'), d: v.filter((s) => s.t === 'd') };
  };
  const a = grupos(series, hoje.carga);
  const b = grupos(ultima.series, antes.carga);
  const pedidos = { w: 0, m: 0, d: 0 };
  for (const p of roteiro(exercicio)) pedidos[p.t ?? 'w'] += 1;
  let dReps = 0;
  for (const k of ['w', 'm', 'd']) {
    b[k].forEach((base, i) => {
      if (a[k][i]) dReps += a[k][i].reps - base.reps;
      else if (i < pedidos[k]) dReps -= base.reps;
    });
  }
  const v = veredito({ carga: hoje.carga, reps: dReps }, { carga: antes.carga, reps: 0 });
  return { tipo: v.tipo, texto: v.texto, ...fim };
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
