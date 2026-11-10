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
// t: 'm' = mini-serie ou pausa (mesma carga), 'd' = drop, 'a' = aquecimento (nunca conta na evolucao).
// Sem t e serie de trabalho.
// seg: quanto a serie durou, do "Comecar serie" ao "Parar" (10/11/2026); so quando medida.
const serie = (s) => {
  const seg = Math.round(numero(s?.seg, 0));
  return {
    carga: numero(s?.carga, 0),
    reps: Math.max(0, Math.round(numero(s?.reps, 0))),
    ...(s?.t === 'm' || s?.t === 'd' || s?.t === 'a' ? { t: s.t } : {}),
    ...(seg > 0 && seg < 3600 ? { seg } : {}),
  };
};

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
    // Descanso entre as series deste exercicio, escolhido no Editar treino (10/11/2026). null = pelo
    // feeling: sem cronometro. Os intervalos do metodo (drop, myo, rest-pause, FST-7) valem sempre.
    descansoS: numero(e.descansoS) !== null && e.descansoS >= 15 && e.descansoS <= 600 ? Math.round(e.descansoS) : null,
    nota: typeof e.nota === 'string' ? e.nota : '',
    aquecimento: Array.isArray(e.aquecimento) ? e.aquecimento.map(serie).filter((s) => s.reps > 0) : [],
    // Como aquecer, escolhido no Editar treino: auto (a regra do dia), nenhum ou manual (a lista
    // acima). Sem escolha: manual se ha lista, senao auto.
    aquecimentoModo: MODOS_DE_AQUECIMENTO.includes(e.aquecimentoModo) ? e.aquecimentoModo : null,
    // O musculo escolhido quando o nome nao diz (ou diz errado); null = pelo nome.
    musculo: typeof e.musculo === 'string' && Object.hasOwn(MUSCULOS, e.musculo) ? e.musculo : null,
    referencia: e.referencia && typeof e.referencia === 'object'
      ? { carga: numero(e.referencia.carga, 0), reps: (Array.isArray(e.referencia.reps) ? e.referencia.reps : []).map((r) => Math.round(numero(r, 0))).filter((r) => r > 0) }
      : null,
  };
}

// Cada exercicio leva quantas series de aquecimento o dia pede (pela ordem do treino).
// Sem sessao nem carga: a previsao pela ordem do plano (treinoComAquecimento refina para hoje).
const comAquecimento = (exercicios) => {
  const regra = aquecimentoDoDia(exercicios);
  return exercicios.map((ex, i) => ({ ...ex, ...regra[i] }));
};

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
        exercicios: comAquecimento((Array.isArray(d.exercicios) ? d.exercicios : []).map(lerExercicio).filter((e) => e !== null)),
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
      // exercicios em que a pessoa pulou o aquecimento hoje
      semAquecimento: (Array.isArray(s.semAquecimento) ? s.semAquecimento : []).filter((id) => typeof id === 'string'),
      // quantas series de aquecimento cada exercicio tinha quando comecou (a lista segue o roteiro).
      // Sessao de antes disso: as linhas de aquecimento que ja estao na lista.
      aquecer: Object.fromEntries(Object.entries(exercicios).filter(([, l]) => l.length > 0).map(([id, l]) => {
        const n = s.aquecer?.[id];
        return [id, Number.isInteger(n) && n >= 0 && n <= 20 ? n : l.filter((x) => x.t === 'a').length];
      })),
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

// As series que contam: feitas e de trabalho (o aquecimento fica sempre de fora da evolucao).
const feitas = (lista) => (lista ?? []).filter((s) => s.reps > 0 && s.t !== 'a');
export const seriesDeTrabalho = feitas;

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
  const normal = () => { const i = passos.filter((p) => p.tipo === 'serie').length + 1; por('serie', `Série ${i}`, String(i), m === 'fst7' && i > 1 ? METODOS.fst7.descansoS : null); };

  // O aquecimento vem antes de tudo (10/11/2026). Quantas series: as anotadas no plano ou
  // as que a regra do dia decidiu (aquecimentoDoDia, gravado em `aquecer`).
  const nAquecer = exercicio.aquecer ?? exercicio.aquecimento?.length ?? 0;
  for (let i = 1; i <= nAquecer; i += 1) passos.push({ tipo: 'aquecimento', t: 'a', rotulo: `Aquecimento ${i}`, curto: `A${i}`, descansoS: null });

  if (m === 'myo') {
    por('ativacao', 'Ativação', 'At');
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
  return n >= roteiro(exercicio).filter((p) => p.t !== 'a').length || (n > 0 && (sessao.encerrados ?? []).includes(exercicio.id));
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
  const cargaDeHoje = cargaDeTrabalhoDeHoje(exercicio, ultima);
  const vez = { w: 0, m: 0, d: 0 };
  let cargaDoDrop = cargaDeHoje;
  let alvoPrincipal = faixa.min;

  let iAquecimento = 0;
  const passos = roteiro(exercicio, total).map((passo) => {
    if (passo.t === 'a') {
      const degrau = degrauDeAquecimento(exercicio, iAquecimento, cargaDeHoje);
      iAquecimento += 1;
      return { ...passo, base: null, alvo: degrau.alvo, dica: degrau.dica, fracao: degrau.fracao };
    }
    if (passo.t === 'd') {
      const base = anteriores.d[vez.d] ?? null;
      vez.d += 1;
      // Mesma carga de trabalho da ultima vez: repete os drops de la. Senao, 20% a menos a cada um.
      cargaDoDrop = base && tipo === 'bater' ? base.carga : Math.round(cargaDoDrop * 0.8);
      return { ...passo, base, alvo: { carga: cargaDoDrop, reps: base ? base.reps + 1 : faixa.min }, dica: base ? 'Carga mais baixa: passe o treino anterior.' : 'Carga mais baixa: vá até onde der.' };
    }
    if (passo.t === 'm') {
      const base = anteriores.m[vez.m] ?? null;
      vez.m += 1;
      if (passo.tipo === 'mini') {
        const reps = alvoDaMini(faixa);
        return { ...passo, base, alvo: { carga: cargaDeHoje, reps }, dica: `Mini de ${reps} com a mesma carga.` };
      }
      return { ...passo, base, alvo: { carga: cargaDeHoje, reps: base ? base.reps + 1 : Math.max(1, Math.round(alvoPrincipal / 3)) }, dica: base ? '+1 rep sobre o treino anterior, com a mesma carga.' : 'Mesma carga, até onde der.' };
    }
    const base = trabalho[vez.w] ?? null;
    vez.w += 1;
    let reps = faixa.min;
    let dica = 'Primeiro registro: o que você fizer vira a referência do próximo treino.';
    if (tipo === 'subir') {
      dica = `Carga nova. Qualquer número de ${faixa.min} a ${faixa.max} vale.`;
    } else if (tipo === 'bater') {
      const antes = base?.reps ?? trabalho[trabalho.length - 1]?.reps ?? faixa.min;
      reps = Math.min(faixa.max, Math.max(faixa.min, antes + 1));
      dica = antes >= faixa.max
        ? `Repita o teto de ${faixa.max}.`
        : `+${reps - antes} ${plural(reps - antes, 'rep', 'reps')} sobre o treino anterior para progredir.`;
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
  return { tipo: plano.tipo, carga: plano.carga, reps: plano.passos.filter((p) => p.t !== 'a').map((p) => p.alvo.reps), texto: plano.texto };
}

/**
 * Uma serie contra a base dela. tipo: 'carga' (mais peso), 'reps' (mais
 * repeticoes com o mesmo peso), 'igual', 'abaixo' ou 'nova' (nao havia base).
 */
export function veredito(feita, base) {
  if (!base) return { tipo: 'nova', texto: 'Primeiro registro' };
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
  for (const p of roteiro(exercicio)) if (p.t !== 'a') pedidos[p.t ?? 'w'] += 1;
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

/**
 * Quando foi o treino anterior, do jeito que se fala (10/11/2026, pedido: "e treino
 * anterior e tem que ser mostrada a data tipo 1 semana passada, (2), mes passado").
 * Dias corridos entre os dois dias logicos ('AAAA-MM-DD'). null = anotado no plano.
 */
export function quandoRelativo(dia, hoje) {
  if (dia === null) return 'anotado no plano';
  const n = Math.round((Date.UTC(...partesDoDia(hoje)) - Date.UTC(...partesDoDia(dia))) / 86_400_000);
  if (n <= 0) return 'hoje';
  if (n === 1) return 'ontem';
  if (n < 7) return `há ${n} dias`;
  if (n < 14) return 'semana passada';
  if (n < 30) return `há ${Math.floor(n / 7)} semanas`;
  if (n < 60) return 'mês passado';
  if (n < 365) return `há ${Math.floor(n / 30)} meses`;
  return n < 730 ? 'ano passado' : `há ${Math.floor(n / 365)} anos`;
}
const partesDoDia = (dia) => { const [a, m, d] = dia.split('-').map(Number); return [a, m - 1, d]; };

/**
 * As regras do tempo de cada serie (10/11/2026, pedido: "um botao comecar e parar a
 * serie, isso serve pro tempo, pq o tempo tem caracteristicas do tipo de serie que e,
 * se e drop, myo etc, tem que esse sistema com regras"). A serie e medida do
 * "Comecar" ao "Parar"; o que muda com o metodo e ATE ONDE ir e o que vem DEPOIS.
 *
 *  - serie comum: ate a meta de repeticoes; depois, o descanso do exercicio (ou nenhum: pelo feeling);
 *  - FST-7: ate a meta, mesma carga nas 7; entre elas so 30 a 45 s (40);
 *  - drop set: as series de trabalho ate a meta; a ultima e cada drop ate a falha;
 *    entre elas nao ha descanso, so 10 s para baixar a carga;
 *  - myo-reps: ativacao ate ficar a 1-2 reps da falha; minis com o alvo curto;
 *    entre elas 20 s (3 a 5 respiracoes fundas);
 *  - rest-pause: a principal ate a falha; pausas de 20 s e de novo ate a falha.
 *
 * regraDaSerie -> { ate: 'meta' | 'falha', curto, durante }
 * intervaloAntes(proximo, exercicio) -> { segundos (null = sem cronometro: o descanso do exercicio e pelo feeling), rotulo, texto }
 */
export const TROCA_DE_CARGA_S = 10;

export function regraDaSerie(exercicio, passo, proximo = null) {
  const faixa = faixaDe(exercicio);
  const nota = exercicio.nota ? ` · ${exercicio.nota}` : '';
  if (passo.tipo === 'aquecimento') return { ate: 'aquecimento', curto: 'Aquecimento', durante: 'Leve e controlado, longe da falha: prepara o músculo e a articulação.' };
  if (passo.tipo === 'drop') return { ate: 'falha', curto: 'Até a falha', durante: `${fmtKg(passo.alvo.carga)}, sem descanso: vá até a falha.` };
  if (passo.tipo === 'ativacao') return { ate: 'falha', curto: 'Quase a falha', durante: `Ativação: pare a 1–2 reps da falha (${faixa.min}–${faixa.max} reps)${nota}.` };
  if (passo.tipo === 'mini') return { ate: 'meta', curto: 'Até a meta', durante: `Mini de ${passo.alvo.reps} com a mesma carga. Não saiu ${passo.alvo.reps}? Encerre as minis.` };
  if (passo.tipo === 'pausa') return { ate: 'falha', curto: 'Até a falha', durante: 'Mesma carga, de novo até a falha.' };
  if (exercicio.metodo === 'restpause') return { ate: 'falha', curto: 'Até a falha', durante: `Série principal: até a falha, com boa técnica${nota}.` };
  if (exercicio.metodo === 'drop' && proximo?.tipo === 'drop') {
    return { ate: 'falha', curto: 'Até a falha', durante: `Última antes dos drops: até a falha. Ao parar, baixe para ${fmtKg(proximo.alvo.carga)}.` };
  }
  if (exercicio.metodo === 'fst7') return { ate: 'meta', curto: 'Até a meta', durante: `Mesma carga nas 7 séries, descanso curto entre elas${nota}.` };
  // Serie comum: a meta ja esta no cartao; aqui so a nota do exercicio, se houver.
  return { ate: 'meta', curto: 'Até a meta', durante: exercicio.nota };
}

export const DESCANSOS = [45, 60, 90, 120, 150, 180, 240, 300];

/** O intervalo antes do proximo passo (null = acabou o exercicio). segundos null = sem cronometro. */
export function intervaloAntes(proximo, exercicio = null) {
  const doExercicio = { segundos: exercicio?.descansoS ?? null, rotulo: 'Descanso', texto: '' };
  if (proximo === null) return doExercicio;
  // Entre os degraus do aquecimento nao ha cronometro: troca a carga e segue.
  if (proximo.tipo === 'aquecimento') return { segundos: null, rotulo: 'Descanso', texto: '' };
  if (proximo.tipo === 'drop') return { segundos: TROCA_DE_CARGA_S, rotulo: 'Troca de carga', texto: `Baixe para ${fmtKg(proximo.alvo.carga)}` };
  if (proximo.tipo === 'mini') return { segundos: proximo.descansoS, rotulo: 'Respire', texto: '3 a 5 respirações fundas' };
  if (proximo.tipo === 'pausa') return { segundos: proximo.descansoS, rotulo: 'Pausa', texto: 'Solte a carga e volte' };
  if (proximo.descansoS !== null) return { segundos: proximo.descansoS, rotulo: 'Descanso curto', texto: '30 a 45 s no FST-7' };
  return doExercicio;
}

/** 75 -> '1:15'. */
export const relogio = (seg) => `${Math.floor(seg / 60)}:${String(Math.floor(seg % 60)).padStart(2, '0')}`;

// ---------------------------------------------------------------------------
// Aquecimento (10/11/2026). Primeiro pedido: "nao faz sentido comecar no pull down sem series
// de aquecimento, pre ativamento do musculo". Segundo, no mesmo dia: "o aquecimento deve
// englobar uma logica global a todas as series do dia, fadiga acumulada e a ordem dos
// exercicios ... e a opcao de aquecimento pode ser tirada ou editada".
//
// A conta anda pelo dia inteiro: primeiro os exercicios ja comecados, na ordem em que foram
// feitos de verdade (a ordem da sessao), depois os que faltam, na ordem do plano. Por musculo
// ela guarda:
//  - calor: series feitas nele hoje (aquecimento e trabalho); o composto passa meio calor
//    para quem ajuda (peito -> triceps e ombro; costas -> biceps; quadriceps -> gluteo...);
//  - series pesadas: de composto ate 10 reps, nele;
// e o total de series de trabalho do dia (o corpo ja quente).
// Para cada exercicio no automatico:
//  1. frio, o exercicio pede: composto ate 6 reps 4 degraus, ate 10 3, ate 15 2, mais 1;
//     isolado ate 12 reps 2, mais 1. Cada degrau mais pesado e com menos reps;
//  2. quente (calor >= 2): composto pesado faz 1 serie-ponte (70% x 4) para sentir a carga
//     nova, a nao ser que o musculo ja tenha 9+ series pesadas (ai so gastaria energia);
//     o resto entra direto. Morno (so ajudou em outro exercicio): um degrau a menos
//     (composto fica com 1, isolado pode entrar direto);
//  3. musculo treinado ontem ou anteontem e ainda frio ou morno: um degrau leve a mais (ainda
//     recuperando, sobe mais devagar), ate 4;
//  4. com 12+ series de trabalho no dia: um degrau a menos, nunca abaixo de 1 (o corpo ja
//     esta quente; falta so acostumar o musculo com a carga);
//  5. com a carga de hoje: degrau sem carga, na carga de trabalho ou com a mesma carga de
//     outro degrau sai (fica o mais pesado).
// A pessoa escolhe no Editar treino: automatico, sem aquecimento ou do jeito dela (carga x
// reps). Exercicio ja comecado hoje fica com o aquecimento de quando comecou (`sessao.aquecer`),
// porque a lista gravada segue o roteiro. Aquecimento nunca conta na evolucao nem na carga.

const SEM_ACENTO = (t) => t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/** Os musculos que o app conhece, com o nome da tela. */
export const MUSCULOS = {
  peito: 'Peito', costas: 'Costas', ombro: 'Ombro', triceps: 'Tríceps', biceps: 'Bíceps', antebraco: 'Antebraço',
  trapezio: 'Trapézio', quadriceps: 'Quadríceps', posterior: 'Posterior de coxa', gluteo: 'Glúteo', adutores: 'Adutores',
  panturrilha: 'Panturrilha', lombar: 'Lombar', abdomen: 'Abdômen',
};
// Ordem importa: o primeiro que casar vence ("posterior de ombro" antes de "posterior", "leg
// curl" antes de "curl", "remada alta" antes de "remada"). [nome, musculo, quando e composto]
const GRUPOS = [
  [/panturrilha|gemeos|soleo/, 'panturrilha', null],
  [/gluteo|hip thrust|elevacao pelvica|abdutora|abducao/, 'gluteo', /hip thrust|elevacao pelvica/],
  [/adutora|adutor|aducao/, 'adutores', null],
  [/encolhimento|trapezio|remada alta/, 'trapezio', /remada alta/],
  [/posterior de ombro|deltoide|crucifixo inverso|face pull|elevacao lateral|elevacao frontal|frontal|desenvolvimento|arnold|militar|overhead|shoulder/, 'ombro', /desenvolvimento|arnold|militar|overhead|shoulder press/],
  [/triceps|frances|testa|coice|anjo|corda|mergulho no banco|pushdown/, 'triceps', null],
  [/flexora|leg curl|stiff|terra|romeno|good morning|nordic/, 'posterior', /stiff|terra|romeno|good morning/],
  [/rosca|biceps|martelo|scott|curl/, 'biceps', null],
  [/supino|crucifixo|crossover|voador|peck|pec deck|paralela|flexao|inclinado|declinado|chest|fly/, 'peito', /supino|paralela|flexao|inclinado|declinado|chest press/],
  [/pull.?down|puxada|remada|barra fixa|serrote|unilateral|pullover|graviton|pulley|t.?bar|cavalinho/, 'costas', /pull.?down|puxada|remada|barra fixa|serrote|unilateral|graviton|t.?bar|cavalinho/],
  [/agachamento|leg press|leg 45|hack|afundo|bulgaro|passada|extensora|sissy|squat/, 'quadriceps', /agachamento|leg press|leg 45|hack|afundo|bulgaro|passada|squat/],
  [/lombar|hiperextensao|banco romano/, 'lombar', null],
  [/abdominal|abdomen|prancha|crunch|infra|obliquo|elevacao de pernas/, 'abdomen', null],
  [/antebraco|punho/, 'antebraco', null],
];
// Concordancia: 'costas frias', 'adutores aquecidos', 'panturrilha treinada'.
const GENERO = { costas: 'fp', adutores: 'mp', panturrilha: 'f', lombar: 'f' };
const concorda = (grupo, palavra) => { const g = GENERO[grupo] ?? 'm'; const base = g[0] === 'f' ? palavra.replace(/o$/, 'a') : palavra; return g[1] === 'p' ? `${base}s` : base; };
const COMPOSTOS = GRUPOS.map(([, , c]) => c).filter(Boolean);
// Quem, sendo composto, ja deixa outro musculo aquecido.
const AQUECE_TAMBEM = { peito: ['triceps', 'ombro'], ombro: ['triceps'], costas: ['biceps'], quadriceps: ['gluteo', 'posterior', 'adutores'], posterior: ['gluteo', 'lombar'], gluteo: ['posterior'] };

/** O musculo do exercicio pelo nome. Nome que nao casa vira um grupo so dele (isolado). */
export function grupoDoExercicio(nome) {
  const t = SEM_ACENTO(nome);
  for (const [re, grupo, composto] of GRUPOS) if (re.test(t)) return { grupo, composto: composto ? composto.test(t) : false };
  return { grupo: `outro:${t}`, composto: false };
}

/**
 * O musculo que vale: o escolhido no Editar treino ou o do nome. Nome desconhecido sem escolha
 * fica num grupo so dele, e composto se a faixa for pesada (ate 8 reps).
 */
export function musculoDoExercicio(ex) {
  const pelo = grupoDoExercicio(ex.nome);
  const conhecido = !pelo.grupo.startsWith('outro:');
  if (ex.musculo && Object.hasOwn(MUSCULOS, ex.musculo)) {
    if (ex.musculo === pelo.grupo) return { ...pelo, reconhecido: true };
    const composto = COMPOSTOS.some((re) => re.test(SEM_ACENTO(ex.nome))) || (!conhecido && faixaDe(ex).max <= 8);
    return { grupo: ex.musculo, composto, reconhecido: true };
  }
  if (conhecido) return { ...pelo, reconhecido: true };
  return { grupo: pelo.grupo, composto: faixaDe(ex).max <= 8, reconhecido: false };
}

const RAMPAS = {
  4: [[0.4, 10], [0.55, 6], [0.7, 4], [0.85, 2]],
  3: [[0.4, 10], [0.6, 6], [0.8, 3]],
  2: [[0.5, 10], [0.75, 5]],
  1: [[0.6, 8]],
};
const PONTE = [[0.7, 4]];
const PESADAS_SEM_PONTE = 9;
const DIA_CHEIO = 12;
export const MODOS_DE_AQUECIMENTO = ['auto', 'nenhum', 'manual'];

/** A carga do degrau, no passo de carga do exercicio (nunca abaixo de zero). */
export function cargaDoDegrau(cargaDeTrabalho, fracao) {
  if (cargaDeTrabalho <= 0) return 0;
  const passo = passoDeCarga(cargaDeTrabalho);
  return Math.max(0, Math.round((cargaDeTrabalho * fracao) / passo) * passo);
}

const pedeFrio = (composto, max) => (composto ? (max <= 6 ? 4 : max <= 10 ? 3 : max <= 15 ? 2 : 1) : (max <= 12 ? 2 : 1));

/** Os degraus de uma tabela, com a carga de hoje (sem carga conhecida, so a fracao). */
function degrausDaTabela(tabela, cargaDeTrabalho, limpar) {
  const lista = tabela.map(([fracao, reps]) => ({ fracao, reps, carga: cargaDeTrabalho > 0 ? cargaDoDegrau(cargaDeTrabalho, fracao) : null }));
  if (!limpar || !(cargaDeTrabalho > 0)) return lista;
  return lista.filter((d, i) => d.carga > 0 && d.carga < cargaDeTrabalho && lista.slice(i + 1).every((o) => o.carga !== d.carga));
}

const juntarNomes = (nomes) => (nomes.length <= 1 ? nomes.join('') : `${nomes.slice(0, -1).join(', ')} e ${nomes.at(-1)}`);
const degraus = (n) => `${n} ${n === 1 ? 'degrau' : 'degraus'}`;

/**
 * O aquecimento de cada exercicio do dia, olhando o dia inteiro. `exercicios` na ordem do
 * plano; a resposta vem na mesma ordem. ctx (tudo opcional):
 *  - sessao: a de hoje (a ordem real, as series feitas e o aquecimento de quem ja comecou);
 *  - recentes: {musculo: dias atras} dos musculos treinados ontem e anteontem;
 *  - cargas: {exId: carga de trabalho de hoje}, para tirar degrau repetido;
 *  - agora: o exercicio que a pessoa esta comecando (entra logo depois dos ja comecados).
 * Cada item: { aquecer (quantos), aquecerModo (rampa, ponte, direto, manual, nenhum),
 * aquecerDegraus [{carga|null, reps, fracao|null}], aquecerMotivo, grupo, composto }.
 */
export function aquecimentoDoDia(exercicios, ctx = {}) {
  const sessao = ctx.sessao ?? null;
  const listaDe = (ex) => sessao?.exercicios?.[ex.id] ?? [];
  const comecou = (ex) => listaDe(ex).some((s) => s.reps > 0);
  const ordemDaSessao = Object.keys(sessao?.exercicios ?? {});
  const comecados = exercicios.filter(comecou).sort((a, b) => ordemDaSessao.indexOf(a.id) - ordemDaSessao.indexOf(b.id));
  // o que a pessoa esta comecando agora vem logo depois dos ja comecados, fora da ordem do plano
  const agora = exercicios.find((e) => e.id === ctx.agora && !comecou(e)) ?? null;
  const ordem = [...comecados, ...(agora ? [agora] : []), ...exercicios.filter((e) => !comecou(e) && e !== agora)];

  const calor = {};
  const pesadas = {};
  const quem = {};
  let doDia = 0;
  const somar = (tabela, g, v) => { tabela[g] = (tabela[g] ?? 0) + v; };
  const resposta = new Map();

  for (const ex of ordem) {
    const { grupo, composto } = musculoDoExercicio(ex);
    const max = faixaDe(ex).max;
    const nome = MUSCULOS[grupo] ?? ex.nome;
    const carga = ctx.cargas?.[ex.id] ?? 0;
    const escolha = MODOS_DE_AQUECIMENTO.includes(ex.aquecimentoModo) ? ex.aquecimentoModo : ex.aquecimento?.length > 0 ? 'manual' : 'auto';
    let modo;
    let lista;
    let motivo;

    if (escolha === 'nenhum') {
      modo = 'nenhum';
      lista = [];
      motivo = 'Sem aquecimento: escolhido no Editar treino.';
    } else if (escolha === 'manual' && ex.aquecimento?.length > 0) {
      modo = 'manual';
      lista = ex.aquecimento.map((s) => ({ carga: s.carga, reps: s.reps, fracao: null }));
      motivo = 'O seu aquecimento, anotado no Editar treino.';
    } else {
      const c = calor[grupo] ?? 0;
      const deQuem = quem[grupo]?.length ? ` (${juntarNomes([...new Set(quem[grupo])])})` : '';
      const extras = [];
      let n;
      let principal;
      if (c >= 2) {
        if (composto && max <= 10 && (pesadas[grupo] ?? 0) < PESADAS_SEM_PONTE) {
          modo = 'ponte';
          n = 1;
          principal = `${nome} ${concorda(grupo, 'já aquecido')}${deQuem}: só uma série-ponte para sentir a carga pesada.`;
        } else {
          modo = 'direto';
          n = 0;
          principal = composto && max <= 10
            ? `${nome} já fez ${Math.round(pesadas[grupo])} séries pesadas hoje: entra direto, sem gastar energia.`
            : `${nome} ${concorda(grupo, 'já aquecido')}${deQuem}: entra direto.`;
        }
      } else {
        n = pedeFrio(composto, max);
        if (c > 0) n = Math.max(composto ? 1 : 0, n - 1);
        const dias = ctx.recentes?.[grupo];
        if (dias && n > 0 && n < 4) {
          n += 1;
          extras.push(`${nome} ${concorda(grupo, 'treinado')} ${dias === 1 ? 'ontem' : 'anteontem'}: um degrau leve a mais.`);
        }
        if (doDia >= DIA_CHEIO && n > 1) {
          n -= 1;
          extras.push(`Já são ${doDia} séries hoje: corpo quente, subida mais curta.`);
        }
        modo = n > 0 ? 'rampa' : 'direto';
        const quantos = n === 0 ? 'entra direto' : `subida em ${degraus(n)}`;
        principal = c > 0 ? `${nome} já trabalhou ajudando${deQuem}: ${quantos}.`
          : doDia === 0 && ex === ordem[0] ? `Primeiro exercício do treino, ${nome.toLowerCase()} ${concorda(grupo, 'frio')}: ${quantos}.`
            : `${nome} ainda ${concorda(grupo, 'frio')} hoje: ${quantos}.`;
      }
      lista = n > 0 ? degrausDaTabela(modo === 'ponte' ? PONTE : RAMPAS[n], carga, true) : [];
      if (lista.length < n) extras.push(lista.length === 0 ? 'Com a carga de hoje, aquecer não muda nada: entra direto.' : 'Com a carga de hoje, os degraus repetidos saíram.');
      if (lista.length === 0) modo = 'direto';
      motivo = [principal, ...extras].join(' ');
    }

    // Exercicio ja comecado hoje: o aquecimento fica como estava (a lista gravada segue o roteiro).
    const fixo = sessao?.aquecer?.[ex.id];
    if (typeof fixo === 'number' && fixo !== lista.length) {
      lista = ex.aquecimento?.length === fixo && escolha !== 'nenhum'
        ? ex.aquecimento.map((s) => ({ carga: s.carga, reps: s.reps, fracao: null }))
        : degrausDaTabela(RAMPAS[Math.min(4, Math.max(1, fixo))], carga, false).slice(0, fixo);
      while (lista.length < fixo) lista.push({ ...lista.at(-1) });
      modo = fixo === 0 ? 'direto' : modo === 'manual' ? 'manual' : 'rampa';
      motivo = fixo === 0 ? 'Você começou este exercício sem aquecimento hoje.' : 'Mantido como estava quando você começou o exercício.';
    }

    // O que o exercicio deixa no corpo: feito (comecado) ou o que o plano manda (ainda nao).
    const gravada = listaDe(ex);
    const trabalhoPlano = roteiro({ ...ex, aquecer: 0, aquecimento: [] }).length;
    const feitas = gravada.filter((s) => s.reps > 0 && s.t !== 'a').length;
    const encerrado = (sessao?.encerrados ?? []).includes(ex.id);
    const trabalho = comecou(ex) ? (encerrado ? feitas : Math.max(feitas, trabalhoPlano)) : trabalhoPlano;
    const aquecidas = comecou(ex) ? gravada.filter((s) => s.reps > 0 && s.t === 'a').length : lista.length;
    somar(calor, grupo, aquecidas + trabalho);
    if (composto && max <= 10) somar(pesadas, grupo, trabalho);
    (quem[grupo] ??= []).push(ex.nome);
    if (composto) {
      for (const g of AQUECE_TAMBEM[grupo] ?? []) {
        somar(calor, g, trabalho / 2);
        (quem[g] ??= []).push(ex.nome);
      }
    }
    doDia += trabalho;
    resposta.set(ex.id, { aquecer: lista.length, aquecerModo: modo, aquecerDegraus: lista, aquecerMotivo: motivo, grupo, composto });
  }
  return exercicios.map((ex) => resposta.get(ex.id));
}

/** A carga de trabalho de hoje no exercicio (a mesma conta do planoDeHoje). */
export function cargaDeTrabalhoDeHoje(exercicio, ultima) {
  const p = ultima ? progressao(exercicio, ultima.series) : null;
  const carga = p === null ? null : p.sobe ? p.nova : p.carga;
  return carga ?? exercicio.referencia?.carga ?? 0;
}

/** {musculo: dias atras} dos musculos com series de trabalho ontem e anteontem. */
export function musculosRecentes(plano, sessoes, hoje) {
  const porId = new Map(plano.dias.flatMap((d) => d.exercicios.map((e) => [e.id, e])));
  const recentes = {};
  for (const s of sessoes) {
    const dias = diasEntre(s.dia, hoje);
    if (dias < 1 || dias > 2) continue;
    for (const [id, lista] of Object.entries(s.exercicios)) {
      const ex = porId.get(id);
      if (!ex || feitas(lista).length === 0) continue;
      const { grupo } = musculoDoExercicio(ex);
      recentes[grupo] = Math.min(recentes[grupo] ?? 9, dias);
    }
  }
  return recentes;
}

/**
 * O treino do dia com o aquecimento decidido pelo dia inteiro: a ordem real da sessao, o que
 * cada musculo ja fez, o que foi treinado ontem e a carga de hoje de cada exercicio.
 */
export function treinoComAquecimento(treino, { sessao = null, sessoes = [], plano = null, hoje = null, agora = null } = {}) {
  if (!treino) return treino;
  const cargas = {};
  for (const ex of treino.exercicios) cargas[ex.id] = cargaDeTrabalhoDeHoje(ex, ultimaVez(ex, sessoes, hoje ?? '9999-12-31'));
  const recentes = plano && hoje ? musculosRecentes(plano, sessoes, hoje) : null;
  const regra = aquecimentoDoDia(treino.exercicios, { sessao, cargas, recentes, agora });
  return { ...treino, exercicios: treino.exercicios.map((ex, i) => ({ ...ex, ...regra[i] })) };
}

/** O alvo e a dica do degrau i do aquecimento, com a carga de trabalho de hoje. */
export function degrauDeAquecimento(exercicio, i, cargaDeTrabalho) {
  const lista = exercicio.aquecerDegraus ?? (exercicio.aquecimento?.length > 0
    ? exercicio.aquecimento.map((s) => ({ carga: s.carga, reps: s.reps, fracao: null }))
    : degrausDaTabela(RAMPAS[Math.min(4, Math.max(1, exercicio.aquecer ?? 1))], cargaDeTrabalho, false));
  const d = lista[Math.min(i, lista.length - 1)] ?? { carga: 0, reps: 8, fracao: null };
  const carga = d.fracao !== null && d.fracao !== undefined ? cargaDoDegrau(cargaDeTrabalho, d.fracao) : d.carga ?? 0;
  const ultimo = i === lista.length - 1;
  const dica = exercicio.aquecerModo === 'manual' || d.fracao === null || d.fracao === undefined
    ? 'O seu aquecimento. Leve, longe da falha; não conta na evolução.'
    : exercicio.aquecerModo === 'ponte' ? 'Série-ponte: sinta a carga pesada sem cansar. Não conta na evolução.'
      : ultimo && lista.length > 1 ? 'Último degrau: pesado e rápido, sem cansar. Não conta na evolução.'
        : `${Math.round(d.fracao * 100)}% da carga de trabalho, leve e longe da falha.`;
  return { alvo: { carga, reps: d.reps }, fracao: d.fracao ?? null, dica };
}

// ---------------------------------------------------------------------------
// A evolucao do exercicio (10/11/2026, pedido: "o app tem que ser inteligente o suficiente
// pra entender se o individuo vai evoluir no treino"). Tudo sai das sessoes gravadas:
//  - forca estimada (1RM de Epley: carga x (1 + reps/30)) da melhor serie de trabalho de
//    cada treino; com mais de 12 reps a estimativa e menos confiavel, mas a mesma conta no
//    mesmo exercicio serve para comparar;
//  - tendencia: reta de minimos quadrados da forca contra o tempo (kg por semana), com 3
//    treinos ou mais nas ultimas 8 semanas; sobe/cai se passa de 0,5% por semana;
//  - recorde: o treino que passou a melhor forca anterior em mais de 1% (ou mais reps com
//    a mesma carga); 3 treinos seguidos sem recorde = estagnado (convencao de 3-4 treinos);
//  - queda: forca 3% abaixo do treino anterior em 2 treinos seguidos = sinal de fadiga;
//  - previsao: reps que faltam para a carga subir / ganho medio de reps por treino com a
//    mesma carga = treinos ate subir;
//  - chance de evoluir hoje (alta, media, baixa) e UMA recomendacao, nesta ordem: carga
//    liberada > queda > estagnado > subindo > faltam reps > manter.
// A recomendacao e conselho: nada muda sozinho no plano.

export const forcaEstimada = (carga, reps) => (reps <= 0 ? 0 : carga * (1 + reps / 30));
const diasEntre = (a, b) => Math.round((Date.UTC(...partesDoDia(b)) - Date.UTC(...partesDoDia(a))) / 86_400_000);

/** Cada treino do exercicio (do mais velho ao mais novo): forca, carga de trabalho e reps nela. */
export function historicoDoExercicio(exercicio, sessoes, antesDe) {
  const linhas = [];
  for (const s of sessoes) {
    if (s.dia >= antesDe) continue;
    const trabalho = feitas(s.exercicios[exercicio.id]).filter((x) => !x.t);
    if (trabalho.length === 0) continue;
    const carga = Math.max(...trabalho.map((x) => x.carga));
    const naCarga = trabalho.filter((x) => x.carga === carga);
    const forca = Math.max(...trabalho.map((x) => forcaEstimada(x.carga, x.reps)));
    linhas.push({ dia: s.dia, carga, reps: naCarga.reduce((t, x) => t + x.reps, 0), series: naCarga.length, forca: arredondar(forca) });
  }
  return linhas.sort((a, b) => (a.dia < b.dia ? -1 : 1));
}

function retaPorSemana(pontos) {
  const n = pontos.length;
  const mx = pontos.reduce((t, p) => t + p.x, 0) / n;
  const my = pontos.reduce((t, p) => t + p.y, 0) / n;
  const sxx = pontos.reduce((t, p) => t + (p.x - mx) ** 2, 0);
  if (sxx === 0) return 0;
  return (pontos.reduce((t, p) => t + (p.x - mx) * (p.y - my), 0) / sxx) * 7;
}

export function analiseDoExercicio(exercicio, sessoes, hoje) {
  const hist = historicoDoExercicio(exercicio, sessoes, hoje);
  const ultima = ultimaVez(exercicio, sessoes, hoje);
  const prog = ultima ? progressao(exercicio, ultima.series) : null;
  const faixa = faixaDe(exercicio);
  const base = { treinos: hist.length, historico: hist.slice(-8) };
  if (hist.length === 0) {
    if (prog?.sobe) {
      return { ...base, tendencia: null, estagnado: 0, recorde: null, previsao: null, chance: { nivel: 'alta', motivo: 'o anotado no plano já fecha o teto' },
        recomendacao: { tipo: 'subir', texto: `Carga liberada: suba para ${fmtKg(prog.nova)}.` } };
    }
    return { ...base, tendencia: null, estagnado: 0, recorde: null, previsao: null, chance: null,
      recomendacao: { tipo: 'primeira', texto: `Primeiro registro: uma carga que dê ${faixa.min}–${faixa.max} reps, parando com 1–2 de sobra.` } };
  }
  // Recordes, do mais velho ao mais novo: forca nova ou mais reps com a mesma carga.
  let melhor = null;
  let semRecorde = 0;
  const repsNaCarga = new Map();
  for (const h of hist) {
    const repsAntes = repsNaCarga.get(h.carga);
    const recorde = melhor === null || h.forca > melhor.forca * 1.01 || (repsAntes !== undefined && h.reps > repsAntes);
    if (recorde) semRecorde = 0; else semRecorde += 1;
    if (melhor === null || h.forca > melhor.forca) melhor = h;
    repsNaCarga.set(h.carga, Math.max(repsAntes ?? 0, h.reps));
  }
  const recentes = hist.filter((h) => diasEntre(h.dia, hoje) <= 56);
  let tendencia = null;
  if (recentes.length >= 3) {
    const kgSemana = retaPorSemana(recentes.map((h) => ({ x: diasEntre(recentes[0].dia, h.dia), y: h.forca })));
    const media = recentes.reduce((t, h) => t + h.forca, 0) / recentes.length;
    const pct = media > 0 ? (kgSemana / media) * 100 : 0;
    tendencia = { kgSemana: arredondar(kgSemana), pctSemana: arredondar(pct), direcao: pct >= 0.5 ? 'sobe' : pct <= -0.5 ? 'cai' : 'estavel' };
  }
  const n = hist.length;
  const caiu = (a, b) => b.forca < a.forca * 0.97;
  const quedaSeguida = n >= 3 && caiu(hist[n - 3], hist[n - 2]) && caiu(hist[n - 2], hist[n - 1]);
  // Ganho medio de reps por treino com a mesma carga (so pares seguidos na mesma carga).
  const ganhos = [];
  for (let i = 1; i < n; i += 1) if (hist[i].carga === hist[i - 1].carga) ganhos.push(hist[i].reps - hist[i - 1].reps);
  const ganhoMedio = ganhos.length > 0 ? ganhos.reduce((t, g) => t + g, 0) / ganhos.length : null;
  let previsao = null;
  if (prog && !prog.sobe && prog.faltam > 0) {
    previsao = { faltam: prog.faltam, treinos: ganhoMedio !== null && ganhoMedio > 0 ? Math.max(1, Math.ceil(prog.faltam / ganhoMedio)) : null, cargaNova: prog.nova };
  }
  const deload = cargaDoDegrau(hist[n - 1].carga, 0.9);
  let recomendacao;
  let chance;
  if (prog?.sobe) {
    recomendacao = { tipo: 'subir', texto: `Carga liberada: suba para ${fmtKg(prog.nova)}. Qualquer número de ${faixa.min} a ${faixa.max} reps vale.` };
    chance = { nivel: 'alta', motivo: 'o último treino fechou o teto da faixa' };
  } else if (quedaSeguida) {
    recomendacao = { tipo: 'queda', texto: `A força caiu em 2 treinos seguidos: sinal de fadiga. Hoje mantenha ${fmtKg(hist[n - 1].carga)} e capriche na técnica; se cair de novo, uma semana de deload com ${fmtKg(deload)}.` };
    chance = { nivel: 'baixa', motivo: 'queda nos 2 últimos treinos' };
  } else if (semRecorde >= 3) {
    recomendacao = { tipo: 'estagnado', texto: `${semRecorde} treinos sem recorde. Sugestão: deload hoje com ${fmtKg(deload)} (−10%) e volte a subir; ou mude uma coisa só (mais 1 série, ou outra faixa de reps).` };
    chance = { nivel: 'baixa', motivo: `${semRecorde} treinos sem recorde` };
  } else if (tendencia?.direcao === 'sobe') {
    recomendacao = { tipo: 'sobe', texto: `Evoluindo: +${fmtNumero(tendencia.kgSemana)} kg por semana na força estimada. Siga o plano.` };
    chance = { nivel: 'alta', motivo: 'força subindo nas últimas semanas' };
  } else if (previsao) {
    recomendacao = { tipo: 'faltam', texto: previsao.treinos
      ? `Faltam ${previsao.faltam} ${plural(previsao.faltam, 'rep', 'reps')} para subir para ${fmtKg(previsao.cargaNova)}: no seu ritmo, ~${previsao.treinos} ${plural(previsao.treinos, 'treino', 'treinos')}.`
      : `Faltam ${previsao.faltam} ${plural(previsao.faltam, 'rep', 'reps')} para subir para ${fmtKg(previsao.cargaNova)}. Busque +1 rep onde ficou abaixo.` };
    chance = semRecorde === 0 ? { nivel: 'alta', motivo: 'o último treino foi recorde' } : { nivel: 'media', motivo: 'o último treino não passou o anterior' };
  } else {
    recomendacao = { tipo: 'manter', texto: 'Mantenha a carga e busque +1 rep onde ficou abaixo.' };
    chance = { nivel: 'media', motivo: 'pouco histórico' };
  }
  if (n < 2 && chance.nivel === 'alta' && !prog?.sobe) chance = { nivel: 'media', motivo: 'só um treino anotado' };
  return { ...base, tendencia, estagnado: semRecorde, recorde: melhor, previsao, chance, recomendacao };
}

/**
 * Ajuste no meio do exercicio (autorregulacao): uma serie de trabalho mostra se a carga
 * do dia esta certa. Passou do teto da faixa em 3 reps ou mais: leve, a proxima sobe um
 * passo. Ficou 2 reps ou mais abaixo do minimo: pesada, desce um passo. Devolve
 * { carga, texto } ou null.
 */
export function ajusteEntreSeries(exercicio, serieFeita) {
  if (!serieFeita || serieFeita.t || serieFeita.carga <= 0) return null;
  const faixa = faixaDe(exercicio);
  const passo = passoDeCarga(serieFeita.carga);
  if (serieFeita.reps >= faixa.max + 3) {
    return { carga: arredondar(serieFeita.carga + passo), texto: `${serieFeita.reps} reps passou o teto de ${faixa.max}: a carga está leve. Próxima com ${fmtKg(serieFeita.carga + passo)}.` };
  }
  if (serieFeita.reps <= faixa.min - 2 && serieFeita.carga - passo > 0) {
    return { carga: arredondar(serieFeita.carga - passo), texto: `${serieFeita.reps} reps ficou abaixo de ${faixa.min}: a carga está pesada. Próxima com ${fmtKg(serieFeita.carga - passo)}.` };
  }
  return null;
}
