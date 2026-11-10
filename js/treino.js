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
    referencia: e.referencia && typeof e.referencia === 'object'
      ? { carga: numero(e.referencia.carga, 0), reps: (Array.isArray(e.referencia.reps) ? e.referencia.reps : []).map((r) => Math.round(numero(r, 0))).filter((r) => r > 0) }
      : null,
  };
}

// Cada exercicio leva quantas series de aquecimento o dia pede (pela ordem do treino).
const comAquecimento = (exercicios) => {
  const regra = aquecimentoDoDia(exercicios);
  return exercicios.map((ex, i) => ({ ...ex, aquecer: regra[i].aquecer, aquecerModo: regra[i].aquecerModo, grupo: regra[i].grupo }));
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
  // as que a regra decidiu pela ordem do treino (aquecimentoDoDia, gravado em `aquecer`).
  const nAquecer = exercicio.aquecimento?.length > 0 ? exercicio.aquecimento.length : (exercicio.aquecer ?? 0);
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
  const cargaDeHoje = carga ?? exercicio.referencia?.carga ?? 0;
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
// Aquecimento (10/11/2026, pedido: "nao faz sentido comecar no pull down sem series de
// aquecimento, pre ativamento do musculo"). A regra:
//  - o plano anotou o aquecimento do exercicio? Vale o dele, como esta;
//  - primeiro exercicio do dia para o musculo: rampa ate perto da carga de trabalho,
//    cada degrau mais pesado e com menos repeticoes (o ultimo degrau pesado ajuda a
//    serie de trabalho). Composto pesado (ate 10 reps): 3 degraus (40% x 10, 60% x 6,
//    80% x 3); composto de 11-15 reps ou isolado ate 12: 2 (50% x 10, 75% x 5); faixa
//    alta: 1 (60% x 8);
//  - musculo ja aquecido no dia: composto pesado ganha 1 serie-ponte (70% x 4); o resto
//    entra direto. Peito e ombro compostos aquecem o triceps; costas compostas, o biceps.
// Aquecimento nunca conta na evolucao nem na conta da carga.

const SEM_ACENTO = (t) => t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
// Ordem importa: o primeiro que casar vence ("posterior de ombro" antes de "posterior").
const GRUPOS = [
  [/panturrilha|gemeos/, 'panturrilha', null],
  [/posterior de ombro|crucifixo inverso|face pull|elevacao lateral|elevacao frontal|frontal|desenvolvimento|arnold/, 'ombro', /desenvolvimento|arnold/],
  [/triceps|frances|testa|coice|anjo|corda|mergulho no banco/, 'triceps', null],
  [/rosca|biceps|martelo|scott/, 'biceps', null],
  [/supino|crucifixo|crossover|voador|peck|paralela|flexao|inclinado|declinado/, 'peito', /supino|paralela|flexao|inclinado|declinado/],
  [/pull.?down|puxada|remada|barra fixa|serrote|unilateral|pullover|graviton/, 'costas', /pull.?down|puxada|remada|barra fixa|serrote|unilateral|graviton/],
  [/agachamento|leg press|hack|afundo|bulgaro|passada|extensora|sissy/, 'quadriceps', /agachamento|leg press|hack|afundo|bulgaro|passada/],
  [/flexora|stiff|terra|romeno|good morning/, 'posterior', /stiff|terra|romeno|good morning/],
  [/gluteo|elevacao pelvica|hip thrust|abdutora/, 'gluteo', /hip thrust|elevacao pelvica/],
];
// Quem, sendo composto, ja deixa outro musculo aquecido.
const AQUECE_TAMBEM = { peito: ['triceps', 'ombro'], ombro: ['triceps'], costas: ['biceps'], quadriceps: ['gluteo', 'posterior'], posterior: ['gluteo'] };

/** O musculo do exercicio pelo nome. Nome que nao casa vira um grupo so dele (isolado). */
export function grupoDoExercicio(nome) {
  const t = SEM_ACENTO(nome);
  for (const [re, grupo, composto] of GRUPOS) if (re.test(t)) return { grupo, composto: composto ? composto.test(t) : false };
  return { grupo: `outro:${t}`, composto: false };
}

const RAMPAS = { 3: [[0.4, 10], [0.6, 6], [0.8, 3]], 2: [[0.5, 10], [0.75, 5]], 1: [[0.6, 8]] };
const PONTE = [[0.7, 4]];

/** Quantas series de aquecimento e de que jeito, para cada exercicio do dia, na ordem. */
export function aquecimentoDoDia(exercicios) {
  const quentes = new Set();
  return exercicios.map((ex) => {
    const { grupo, composto } = grupoDoExercicio(ex.nome);
    const max = faixaDe(ex).max;
    let n = 0;
    let modo = 'rampa';
    if (!quentes.has(grupo)) n = composto ? (max <= 10 ? 3 : max <= 15 ? 2 : 1) : (max <= 12 ? 2 : 1);
    else if (composto && max <= 10) { n = 1; modo = 'ponte'; }
    quentes.add(grupo);
    if (composto) for (const g of AQUECE_TAMBEM[grupo] ?? []) quentes.add(g);
    return { aquecer: n, aquecerModo: modo, grupo, composto };
  });
}

/** A carga do degrau, no passo de carga do exercicio (nunca abaixo de zero). */
export function cargaDoDegrau(cargaDeTrabalho, fracao) {
  if (cargaDeTrabalho <= 0) return 0;
  const passo = passoDeCarga(cargaDeTrabalho);
  return Math.max(0, Math.round((cargaDeTrabalho * fracao) / passo) * passo);
}

/** O alvo e a dica do degrau i do aquecimento, com a carga de trabalho de hoje. */
export function degrauDeAquecimento(exercicio, i, cargaDeTrabalho) {
  const doPlano = exercicio.aquecimento?.[i];
  if (exercicio.aquecimento?.length > 0 && doPlano) {
    return { alvo: { carga: doPlano.carga, reps: doPlano.reps }, fracao: null, dica: 'Aquecimento do seu plano. Leve, longe da falha; não conta na evolução.' };
  }
  const tabela = exercicio.aquecerModo === 'ponte' ? PONTE : RAMPAS[exercicio.aquecer] ?? RAMPAS[1];
  const [fracao, reps] = tabela[Math.min(i, tabela.length - 1)];
  const ultimo = i === tabela.length - 1;
  const dica = exercicio.aquecerModo === 'ponte'
    ? 'Músculo já aquecido: uma série-ponte para a carga pesada.'
    : ultimo && tabela.length > 1 ? 'Último degrau: pesado e rápido, sem cansar. Não conta na evolução.'
      : `${Math.round(fracao * 100)}% da carga de trabalho, leve e sem chegar perto da falha.`;
  return { alvo: { carga: cargaDoDegrau(cargaDeTrabalho, fracao), reps }, fracao, dica };
}

/**
 * A sessao gravada antes do aquecimento existir nao tem as linhas dele: a lista andaria
 * fora do roteiro. Poe as linhas vazias na frente (so quando nao ha nenhuma de aquecimento).
 */
export function alinharSessao(sessao, treino) {
  if (!treino) return sessao;
  for (const ex of treino.exercicios) {
    const lista = sessao.exercicios[ex.id];
    if (!lista || lista.length === 0 || lista.some((s) => s.t === 'a')) continue;
    const k = roteiro(ex).filter((p) => p.t === 'a').length;
    if (k > 0) sessao.exercicios[ex.id] = [...Array.from({ length: k }, () => ({ carga: 0, reps: 0, t: 'a' })), ...lista];
  }
  return sessao;
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
