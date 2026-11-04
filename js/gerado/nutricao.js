// GERADO por ferramentas/celular-build.mjs a partir de src/domain/nutricao.ts. Nao edite.
// Nutricao (25/09/2026, pedido do usuario: "como se voce fosse um
// nutricionista esportivo cuidando de mim"). Puro: sem banco, sem tela.
//
// - O plano alimentar e uma lista de refeicoes com alimentos e quantidades;
//   kcal e macros saem da tabela (valores por porcao, base TACO/rotulos).
// - Cada refeicao e ligada a um habito da dieta (dieta.ts): marcar a
//   refeicao continua dando o XP de sempre, e so a refeicao marcada conta
//   como consumida.
// - O que foi comido fora do plano entra como "extra" (estimado pela IA ou
//   escrito a mao) e soma no dia.
// - O alvo do dia e a necessidade estimada (Mifflin-St Jeor) quando o perfil
//   esta completo; sem perfil, o alvo e o proprio plano.
// Os textos informam numeros. Nada de cobranca nem culpa (regra do produto).

                                        

                         
               
                   
                      
                  
 

/** Valores por `porcao` unidades (100 g, 100 ml ou 1 unidade). */
                                          
             
               
                   
                 
                                                                 
                  
 

                               
             
                                                                             
                            
               
                     
                   
                                                                      
                  
 

                                
             
               
                 
                   
                        
 

                                                      
                                                     

                                 
                     
                                        
                       
                          
                       
 

                                              
             
              
                    
                       
     
                                                                     
                                                                         
     
                                   
                                                                                       
                           
 

export const TABELA_ALIMENTOS                      = [
  { id: 'leite-integral', nome: 'Leite integral', unidade: 'ml', porcao: 100, kcal: 60, proteina: 3.2, carboidrato: 4.6, gordura: 3.3 },
  { id: 'banana-pequena', nome: 'Banana pequena', unidade: 'un', porcao: 1, medida: 'cerca de 70 g', kcal: 62, proteina: 0.9, carboidrato: 16, gordura: 0.2 },
  { id: 'aveia', nome: 'Aveia em flocos', unidade: 'g', porcao: 100, kcal: 394, proteina: 13.9, carboidrato: 66.6, gordura: 8.5 },
  { id: 'leite-po-integral', nome: 'Leite em pó integral', unidade: 'g', porcao: 100, kcal: 497, proteina: 25.4, carboidrato: 39.2, gordura: 26.9 },
  { id: 'pasta-amendoim', nome: 'Pasta de amendoim', unidade: 'g', porcao: 100, kcal: 588, proteina: 25, carboidrato: 20, gordura: 50 },
  { id: 'arroz-branco', nome: 'Arroz branco cozido', unidade: 'g', porcao: 100, kcal: 128, proteina: 2.5, carboidrato: 28.1, gordura: 0.2 },
  { id: 'feijao-carioca', nome: 'Feijão carioca cozido', unidade: 'g', porcao: 100, kcal: 76, proteina: 4.8, carboidrato: 13.6, gordura: 0.5 },
  { id: 'carne-magra', nome: 'Carne bovina magra (patinho)', unidade: 'g', porcao: 100, kcal: 219, proteina: 35.9, carboidrato: 0, gordura: 7.3 },
  { id: 'legumes', nome: 'Legumes cozidos', unidade: 'g', porcao: 100, kcal: 30, proteina: 1.5, carboidrato: 6, gordura: 0.2 },
  { id: 'azeite', nome: 'Azeite de oliva', unidade: 'un', porcao: 1, medida: 'colher de sopa (8 ml)', kcal: 72, proteina: 0, carboidrato: 0, gordura: 8 },
  { id: 'pao-integral', nome: 'Pão integral', unidade: 'un', porcao: 1, medida: 'fatia de 25 g', kcal: 63, proteina: 2.4, carboidrato: 12.5, gordura: 0.9 },
  { id: 'ovo', nome: 'Ovo', unidade: 'un', porcao: 1, medida: '50 g', kcal: 73, proteina: 6.7, carboidrato: 0.3, gordura: 4.8 },
  { id: 'requeijao-light', nome: 'Requeijão light', unidade: 'g', porcao: 100, kcal: 180, proteina: 11, carboidrato: 3, gordura: 14 },
  { id: 'laranja', nome: 'Laranja', unidade: 'un', porcao: 1, medida: 'média, 130 g', kcal: 62, proteina: 1.3, carboidrato: 15, gordura: 0.1 },
  { id: 'castanha-para', nome: 'Castanha-do-pará', unidade: 'un', porcao: 1, medida: '4 g', kcal: 26, proteina: 0.6, carboidrato: 0.5, gordura: 2.6 },
  { id: 'frango-grelhado', nome: 'Peito de frango grelhado', unidade: 'g', porcao: 100, kcal: 159, proteina: 32, carboidrato: 0, gordura: 2.5 },
  { id: 'batata-doce', nome: 'Batata-doce cozida', unidade: 'g', porcao: 100, kcal: 77, proteina: 0.6, carboidrato: 18.4, gordura: 0.1 },
  { id: 'macarrao', nome: 'Macarrão cozido', unidade: 'g', porcao: 100, kcal: 102, proteina: 3.4, carboidrato: 19.9, gordura: 1.2 },
  { id: 'whey', nome: 'Whey protein', unidade: 'g', porcao: 30, kcal: 120, proteina: 24, carboidrato: 3, gordura: 1.5 },
  { id: 'pao-frances', nome: 'Pão francês', unidade: 'un', porcao: 1, medida: '50 g', kcal: 150, proteina: 4, carboidrato: 29, gordura: 1.5 },
  { id: 'iogurte-natural', nome: 'Iogurte natural', unidade: 'g', porcao: 100, kcal: 51, proteina: 4.1, carboidrato: 1.9, gordura: 3 },
  { id: 'mussarela', nome: 'Queijo muçarela', unidade: 'g', porcao: 100, kcal: 330, proteina: 22.6, carboidrato: 3, gordura: 25.2 },
  { id: 'atum', nome: 'Atum em água', unidade: 'g', porcao: 100, kcal: 116, proteina: 26, carboidrato: 0, gordura: 1 },
  { id: 'maca', nome: 'Maçã', unidade: 'un', porcao: 1, medida: 'média, 130 g', kcal: 72, proteina: 0.3, carboidrato: 19, gordura: 0.2 },
  { id: 'mel', nome: 'Mel', unidade: 'un', porcao: 1, medida: 'colher de sopa (15 g)', kcal: 46, proteina: 0, carboidrato: 12.4, gordura: 0 },
];

const item = (id        , alimentoId        , quantidade        )               => {
  const a = TABELA_ALIMENTOS.find((x) => x.id === alimentoId) ;
  return { id, alimentoId, nome: a.nome, quantidade, unidade: a.unidade };
};

/** O plano que o usuario passou em 25/09/2026 (objetivo: ganhar massa). */
export const PLANO_PADRAO                           = [];

export const PERFIL_PADRAO                 = { objetivo: 'ganhar', sexo: null, idade: null, alturaCm: null, atividade: 'moderada' };

// ---------- contas ----------

const um = (v        ) => Math.round(v * 10) / 10;
const ZERO         = { kcal: 0, proteina: 0, carboidrato: 0, gordura: 0 };

export function macrosDoItem(i              , tabela                      = TABELA_ALIMENTOS)         {
  if (i.alimentoId === null) return i.macros ? { ...i.macros } : { ...ZERO };
  const a = tabela.find((x) => x.id === i.alimentoId);
  if (!a) return i.macros ? { ...i.macros } : { ...ZERO };
  const f = i.quantidade / a.porcao;
  return { kcal: Math.round(a.kcal * f), proteina: um(a.proteina * f), carboidrato: um(a.carboidrato * f), gordura: um(a.gordura * f) };
}

export function somarMacros(lista                   )         {
  const s = lista.reduce((t, m) => ({
    kcal: t.kcal + m.kcal, proteina: t.proteina + m.proteina, carboidrato: t.carboidrato + m.carboidrato, gordura: t.gordura + m.gordura,
  }), { ...ZERO });
  return { kcal: Math.round(s.kcal), proteina: um(s.proteina), carboidrato: um(s.carboidrato), gordura: um(s.gordura) };
}

export function totaisDaRefeicao(r               , tabela                      = TABELA_ALIMENTOS)         {
  return somarMacros(r.itens.map((i) => macrosDoItem(i, tabela)));
}

export function totaisDoPlano(plano                          , tabela                      = TABELA_ALIMENTOS)         {
  return somarMacros(plano.map((r) => totaisDaRefeicao(r, tabela)));
}

const FATOR_ATIVIDADE                            = { leve: 1.375, moderada: 1.55, alta: 1.725 };
const AJUSTE_OBJETIVO                           = { ganhar: 1.1, perder: 0.85, manter: 1 };
/** Gramas por kg de peso. Ganhar e perder pedem proteina alta. */
const PROTEINA_POR_KG                           = { ganhar: 2, perder: 2.2, manter: 1.8 };
const GORDURA_POR_KG                           = { ganhar: 1, perder: 0.8, manter: 0.9 };

/** Mifflin-St Jeor x fator de atividade x ajuste do objetivo. null sem dados. */
export function necessidadeDiaria(perfil                , pesoKg               )                {
  if (pesoKg === null || perfil.sexo === null || perfil.idade === null || perfil.alturaCm === null) return null;
  const tmb = 10 * pesoKg + 6.25 * perfil.alturaCm - 5 * perfil.idade + (perfil.sexo === 'masculino' ? 5 : -161);
  const kcal = Math.round(tmb * FATOR_ATIVIDADE[perfil.atividade] * AJUSTE_OBJETIVO[perfil.objetivo]);
  const proteina = Math.round(pesoKg * PROTEINA_POR_KG[perfil.objetivo]);
  const gordura = Math.round(pesoKg * GORDURA_POR_KG[perfil.objetivo]);
  const carboidrato = Math.max(0, Math.round((kcal - proteina * 4 - gordura * 9) / 4));
  return { kcal, proteina, carboidrato, gordura };
}

// ---------- o dia ----------

                                                       
                                                           
                                                                               
                 
                    
                                                 
                         
                 
                                                                                   
                  
                   
 

                                    
               
                                
                             
                       
                    
                   
                                                                
                     
                              
                           
                         
                  
     
                                                                       
                                                                               
                                                                                
     
                            
     
                                                                                
                                                                            
     
                                                              
 

/** Abaixo disso a diferenca e ruido da estimativa: nao vale um aviso. */
export const FOLGA_KCAL = 150;

const minutos = (hora        ) => Number(hora.slice(0, 2)) * 60 + Number(hora.slice(3, 5));
const n0 = (v        ) => Math.round(v).toLocaleString('pt-BR');

export function resumoNutricional(entrada   
                                  
                         
                        
                                 
                                       
                    
                               
                                                                            
                                 
 )                    {
  const tabela = entrada.tabela ?? TABELA_ALIMENTOS;
  const agora = minutos(entrada.horaAgora);
  const marcados = new Set(entrada.marcadosIds);
  const puladas = new Set((entrada.puladasIds ?? []).filter((id) => !marcados.has(id)));
  const ordenado = [...entrada.plano].sort((a, b) => minutos(a.hora) - minutos(b.hora));
  // A proxima e a primeira nao feita que ainda esta na hora (ate 1 h de atraso).
  const proxima = ordenado.find((r) => !marcados.has(r.habitoId) && !puladas.has(r.habitoId) && minutos(r.hora) >= agora - 60) ?? null;
  const doPlano = new Set(ordenado.map((r) => r.habitoId));
  const ligado = (e              ) => e.refeicaoHabitoId != null && doPlano.has(e.refeicaoHabitoId);
  const refeicoes                   = ordenado.map((r) => {
    const planejado = totaisDaRefeicao(r, tabela);
    const comido = entrada.extrasDoDia.filter((e) => e.refeicaoHabitoId === r.habitoId);
    return {
      ...r,
      itensComMacros: r.itens.map((i) => ({ ...i, calculado: macrosDoItem(i, tabela) })),
      planejado,
      comido,
      totais: comido.length > 0 ? somarMacros(comido) : planejado,
      feita: marcados.has(r.habitoId),
      pulada: puladas.has(r.habitoId),
      proxima: proxima?.id === r.id,
    };
  });
  // Registrado como uma refeicao que depois foi desmarcada: continua comido, vira extra.
  const extras = entrada.extrasDoDia.filter((e) => !ligado(e) || !marcados.has(e.refeicaoHabitoId ));
  const totalDoPlano = somarMacros(refeicoes.map((r) => r.planejado));
  const necessidade = necessidadeDiaria(entrada.perfil, entrada.pesoKg);
  const alvo = necessidade ?? totalDoPlano;
  const consumido = somarMacros([...refeicoes.filter((r) => r.feita).map((r) => r.totais), ...extras]);
  const restante         = {
    kcal: Math.max(0, alvo.kcal - consumido.kcal),
    proteina: um(Math.max(0, alvo.proteina - consumido.proteina)),
    carboidrato: um(Math.max(0, alvo.carboidrato - consumido.carboidrato)),
    gordura: um(Math.max(0, alvo.gordura - consumido.gordura)),
  };
  const percentual = alvo.kcal > 0 ? Math.round((consumido.kcal / alvo.kcal) * 100) : 0;

  const dicas           = [];
  const abertas = refeicoes.filter((r) => !r.feita && !r.pulada);
  const projetado = somarMacros([consumido, ...abertas.map((r) => r.totais)]);
  const faltaNoDia                = alvo.kcal - projetado.kcal >= FOLGA_KCAL ? {
    kcal: Math.round(alvo.kcal - projetado.kcal),
    proteina: um(Math.max(0, alvo.proteina - projetado.proteina)),
    carboidrato: um(Math.max(0, alvo.carboidrato - projetado.carboidrato)),
    gordura: um(Math.max(0, alvo.gordura - projetado.gordura)),
  } : null;
  const proximaResumo = refeicoes.find((r) => r.proxima);
  if (proximaResumo) {
    const nomes = proximaResumo.itensComMacros.slice(0, 3).map((i) => i.nome.toLocaleLowerCase('pt-BR')).join(', ');
    dicas.push(`Próxima refeição às ${proximaResumo.hora}: ${nomes}${proximaResumo.itens.length > 3 ? '…' : ''} — ${n0(proximaResumo.totais.kcal)} kcal e ${n0(proximaResumo.totais.proteina)} g de proteína.`);
  } else if (abertas.length === 0 && refeicoes.length > 0) {
    dicas.push(`Plano do dia fechado: ${n0(consumido.kcal)} kcal e ${n0(consumido.proteina)} g de proteína.`);
  } else if (abertas.length > 0) {
    dicas.push('Os horários das refeições de hoje já passaram. Marque as que você fez para a conta do dia ficar certa.');
  }
  const proteinaQueFalta = somarMacros(abertas.map((r) => r.totais)).proteina;
  dicas.push(`Proteína de hoje: ${n0(consumido.proteina)} de ${n0(alvo.proteina)} g${abertas.length > 0 ? `. As refeições que faltam trazem ${n0(proteinaQueFalta)} g` : ''}.`);
  if (necessidade && Math.abs(totalDoPlano.kcal - necessidade.kcal) > necessidade.kcal * 0.08) {
    const meta = entrada.perfil.objetivo === 'ganhar' ? 'ganhar massa' : entrada.perfil.objetivo === 'perder' ? 'reduzir gordura' : 'manter o peso';
    dicas.push(`Seu plano soma ${n0(totalDoPlano.kcal)} kcal; a estimativa para ${meta} é ${n0(necessidade.kcal)} kcal por dia.`);
  }
  if (entrada.pesoKg !== null) {
    dicas.push(`Água: cerca de ${(entrada.pesoKg * 0.035).toFixed(1).replace('.', ',')} L hoje (35 ml por kg).`);
  }

  const menores = refeicoes.filter((r) => r.feita && r.comido.length > 0 && r.planejado.kcal - r.totais.kcal > 0);
  const kcalAbaixo = Math.round(menores.reduce((s, r) => s + (r.planejado.kcal - r.totais.kcal), 0));
  const abaixoDoPlano = kcalAbaixo >= FOLGA_KCAL ? { kcal: kcalAbaixo, refeicoes: menores.map((r) => r.titulo) } : null;
  return { alvo, fonteAlvo: necessidade ? 'perfil' : 'plano', necessidade, totalDoPlano, consumido, restante, percentual, refeicoes, proximaId: proxima?.id ?? null, extras, dicas, faltaNoDia, abaixoDoPlano };
}

/**
 * "Esse foi seu almoco?": a refeicao do plano ainda nao feita mais perto da
 * hora, de ate 3 h antes a 1h30 depois. Longe de todas, null (e um extra).
 */
export function sugerirRefeicao(plano                          , marcadosIds                   , horaAgora        )                       {
  const agora = minutos(horaAgora);
  const candidatas = plano
    .filter((r) => !marcadosIds.includes(r.habitoId))
    .map((r) => ({ r, d: minutos(r.hora) - agora }))
    .filter(({ d }) => d >= -180 && d <= 90)
    .sort((a, b) => Math.abs(a.d) - Math.abs(b.d));
  return candidatas[0]?.r ?? null;
}

// ---------- refeicao ajustada na tela (14/10/2026) ----------
// Pedido: "a refeicao do app ainda ta pouco interativa". O cartao abre e a
// pessoa ajusta o que comeu de verdade: cada item com a quantidade de hoje
// (0 = nao comeu). `quantidades` usa o id do item; o que faltar vale o plano.

/** Quantidade de hoje de um item; invalida ou ausente = a do plano. */
function quantidadeDeHoje(i              , quantidades                                  )         {
  const q = quantidades[i.id];
  return typeof q === 'number' && Number.isFinite(q) && q >= 0 && q <= 5000 ? q : i.quantidade;
}

const decimal = (v        ) => (Number.isInteger(v) ? String(v) : String(Math.round(v * 100) / 100).replace('.', ','));

export function itensComidosDaRefeicao(r               , quantidades                                  , tabela                      = TABELA_ALIMENTOS)                 {
  const itens                 = [];
  for (const i of r.itens) {
    const q = quantidadeDeHoje(i, quantidades);
    if (q === 0) continue;
    const a = i.alimentoId === null ? null : tabela.find((x) => x.id === i.alimentoId) ?? null;
    if (a === null) {
      // Item livre: os macros sao da porcao inteira; escala pela fracao. Medido em
      // g/ml (calculado pela IA com o peso, 30/10/2026), o registrado diz os gramas.
      const f = q / i.quantidade;
      const m = i.macros ?? ZERO;
      const quantidade = i.unidade !== 'un' ? `${decimal(q)} ${i.unidade}` : f === 1 ? undefined : f === 0.5 ? 'metade' : `${decimal(f)}×`;
      itens.push({ nome: i.nome, ...(quantidade ? { quantidade } : {}),
        kcal: Math.round(m.kcal * f), proteina: um(m.proteina * f), carboidrato: um(m.carboidrato * f), gordura: um(m.gordura * f) });
      continue;
    }
    const quantidade = a.unidade === 'un' ? (a.medida ? `${decimal(q)}× ${a.medida}` : `${decimal(q)} un`) : `${decimal(q)} ${a.unidade}`;
    itens.push({ nome: i.nome, quantidade, ...macrosDoItem({ ...i, quantidade: q }, tabela) });
  }
  return itens;
}

/** Nada mudou: marcar a refeicao basta, sem registrar o comido. */
/**
 * Alimentos da tabela acrescentados na refeicao de hoje (21/10/2026: "fui
 * colocar que eu bebi leite na ceia e n tem como colocar os itens pre
 * definidos"). Quantidade 0, negativa ou alimento fora da tabela fica de fora.
 */
export function itensAcrescentados(extras                                                       , tabela                      = TABELA_ALIMENTOS)                 {
  const itens                 = [];
  for (const x of extras) {
    const a = tabela.find((t) => t.id === x.alimentoId);
    if (!a || !Number.isFinite(x.quantidade) || x.quantidade <= 0 || x.quantidade > 5000) continue;
    const q = x.quantidade;
    const quantidade = a.unidade === 'un' ? (a.medida ? `${decimal(q)}× ${a.medida}` : `${decimal(q)} un`) : `${decimal(q)} ${a.unidade}`;
    itens.push({ nome: a.nome, quantidade, ...macrosDoItem({ id: a.id, alimentoId: a.id, nome: a.nome, quantidade: q, unidade: a.unidade }, tabela) });
  }
  return itens;
}

export function refeicaoIgualAoPlano(r               , quantidades                                  )          {
  return r.itens.every((i) => quantidadeDeHoje(i, quantidades) === i.quantidade);
}

// ---------- entrada de fora (tela e IA) ----------

const HORA = /^([01]\d|2[0-3]):[0-5]\d$/;
const numero = (v         )         => (typeof v === 'number' ? v : Number(String(v ?? '').replace(',', '.')));
const texto = (v         , max        )                => (typeof v === 'string' && v.trim().length > 0 && v.trim().length <= max ? v.trim() : null);

function lerMacros(v         )                {
  if (typeof v !== 'object' || v === null) return null;
  const o = v                           ;
  const m = { kcal: numero(o.kcal), proteina: numero(o.proteina ?? 0), carboidrato: numero(o.carboidrato ?? 0), gordura: numero(o.gordura ?? 0) };
  if (!Object.values(m).every((x) => Number.isFinite(x) && x >= 0 && x <= 10000)) return null;
  return { kcal: Math.round(m.kcal), proteina: um(m.proteina), carboidrato: um(m.carboidrato), gordura: um(m.gordura) };
}

/** O plano editado na tela. null se qualquer parte estiver fora do formato. */
export function validarPlano(bruto         )                         {
  if (!Array.isArray(bruto) || bruto.length === 0 || bruto.length > 10) return null;
  const plano                  = [];
  for (const r of bruto) {
    if (typeof r !== 'object' || r === null) return null;
    const o = r                           ;
    const id = texto(o.id, 40); const titulo = texto(o.titulo, 60); const habitoId = texto(o.habitoId, 40);
    if (!id || !titulo || !habitoId || typeof o.hora !== 'string' || !HORA.test(o.hora) || !Array.isArray(o.itens) || o.itens.length > 30) return null;
    const itens                 = [];
    for (const i of o.itens) {
      if (typeof i !== 'object' || i === null) return null;
      const x = i                           ;
      const idItem = texto(x.id, 40); const nome = texto(x.nome, 80); const quantidade = numero(x.quantidade);
      const unidade = x.unidade === 'g' || x.unidade === 'ml' || x.unidade === 'un' ? x.unidade : null;
      const alimentoId = x.alimentoId === null ? null : texto(x.alimentoId, 60);
      if (!idItem || !nome || !unidade || !Number.isFinite(quantidade) || quantidade <= 0 || quantidade > 5000) return null;
      if (x.alimentoId !== null && alimentoId === null) return null;
      const novo               = { id: idItem, alimentoId, nome, quantidade, unidade };
      if (x.macros !== undefined) { const m = lerMacros(x.macros); if (!m) return null; novo.macros = m; }
      if (alimentoId === null && !novo.macros) return null;
      itens.push(novo);
    }
    plano.push({ id, hora: o.hora, titulo, habitoId, itens });
  }
  if (new Set(plano.map((r) => r.habitoId)).size !== plano.length) return null;
  return plano;
}

export function validarPerfil(bruto         )                 {
  if (typeof bruto !== 'object' || bruto === null) return { ...PERFIL_PADRAO };
  const o = bruto                           ;
  const faixa = (v         , min        , max        ) => { const n = numero(v); return v === null || v === undefined || v === '' || !Number.isFinite(n) || n < min || n > max ? null : Math.round(n); };
  return {
    objetivo: o.objetivo === 'ganhar' || o.objetivo === 'perder' || o.objetivo === 'manter' ? o.objetivo : PERFIL_PADRAO.objetivo,
    sexo: o.sexo === 'masculino' || o.sexo === 'feminino' ? o.sexo : null,
    idade: faixa(o.idade, 12, 100),
    alturaCm: faixa(o.alturaCm, 100, 250),
    atividade: o.atividade === 'leve' || o.atividade === 'moderada' || o.atividade === 'alta' ? o.atividade : PERFIL_PADRAO.atividade,
  };
}

/**
 * Medida caseira do alimento proprio (03/11/2026: "q quantidade tem que ver opcoes pra mim
 * como gramas, unidade, ml entre outros"): a tabela nutricional vale por N dela.
 */
export const MEDIDAS = ['unidade', 'fatia', 'colher', 'xícara', 'copo', 'scoop', 'porção']         ;
                                            
                                                
const PLURAL                         = { unidade: 'unidades', fatia: 'fatias', colher: 'colheres', 'xícara': 'xícaras', copo: 'copos', scoop: 'scoops', 'porção': 'porções' };
const ehMedida = (u         )              => (MEDIDAS                      ).includes(u);

/** "250 ml", "1 fatia", "3 colheres". */
export function textoDaMedida(valor        , unidade               )         {
  const nome = ehMedida(unidade) && valor > 1 ? PLURAL[unidade] : unidade;
  return `${decimal(valor)} ${nome}`;
}

/** "2 fatias" -> 2 fatia; so o texto inteiro, como o ajuste do registrado escreve. */
function medidaDoTexto(q        )                                            {
  const achado = /^(\d+(?:,\d+)?) (\p{L}+)$/u.exec(q.trim());
  if (!achado) return null;
  const palavra = achado[2] ;
  const unidade = MEDIDAS.find((m) => m === palavra || PLURAL[m] === palavra);
  return unidade ? { valor: numeroBr(achado[1] ), unidade } : null;
}

                                              
               
                      
                                                                                                                                        
                
                          
 

/** O peso que o texto diz: "1 colher de sopa (15 g)" = 15 g; "2× 50 g" = 100 g; sem g nem ml, null. */
function pesoDoTexto(q        )                                                {
  const peso = [...q.matchAll(/(\d+(?:,\d+)?)\s?(g|ml)\b/g)].at(-1);
  if (!peso) return null;
  const vezes = /^(\d+(?:,\d+)?)× /.exec(q);
  return { valor: Math.round(numeroBr(peso[1] ) * (vezes ? numeroBr(vezes[1] ) : 1) * 100) / 100, unidade: peso[2]               };
}

// Gordura pura tem ~9 kcal/g: acima disso o numero nao e do peso dito.
const KCAL_POR_GRAMA_MAX = 9.5;
const cabeNoPeso = (m        , peso        ) => m.kcal <= KCAL_POR_GRAMA_MAX * peso && m.proteina + m.carboidrato + m.gordura <= 1.05 * peso;
const escalar = (m        , f        )         => ({ kcal: Math.round(m.kcal * f), proteina: um(m.proteina * f), carboidrato: um(m.carboidrato * f), gordura: um(m.gordura * f) });

/**
 * Um item da IA (ou salvo) com o peso conferido (30/10/2026: "a quantidade esta
 * majoritariamente errada"). O peso vem do campo numerico ou do texto. Numeros que
 * nao cabem no peso mas cabem nele por 100 g sao do rotulo: escalados. Se nem
 * assim cabem, o peso sai e o item volta a ser porcao.
 */
function lerItemEstimado(bruto         )                      {
  const o = (typeof bruto === 'object' && bruto !== null ? bruto : {})                           ;
  const nome = texto(o.nome, 80);
  let m = lerMacros(o);
  if (!nome || !m) return null;
  const q = texto(o.quantidade, 60);
  const doTexto = q ? pesoDoTexto(q) : null;
  const numeroDoPeso = numero(o.peso);
  let peso                                                = null;
  if (o.peso !== undefined && o.peso !== null && o.peso !== '') {
    // Medida caseira: os numeros sao da tabela por N dela, sem a conferencia por grama.
    if (ehMedida(o.unidade)) {
      if (!Number.isFinite(numeroDoPeso) || numeroDoPeso <= 0 || numeroDoPeso > 5000) return { nome, ...(q ? { quantidade: q } : {}), ...m };
      const valor = Math.round(numeroDoPeso * 100) / 100;
      return { nome, quantidade: q ?? textoDaMedida(valor, o.unidade), peso: valor, unidade: o.unidade, ...m };
    }
    const unidade = o.unidade === undefined || o.unidade === null || o.unidade === 'g' ? 'g' : o.unidade === 'ml' ? 'ml' : null;
    if (unidade && Number.isFinite(numeroDoPeso) && numeroDoPeso > 0 && numeroDoPeso <= 5000) peso = { valor: Math.round(numeroDoPeso * 100) / 100, unidade };
  } else {
    peso = doTexto && doTexto.valor > 0 && doTexto.valor <= 5000 ? doTexto : null;
  }
  if (peso && !cabeNoPeso(m, peso.valor)) {
    const doRotulo = escalar(m, peso.valor / 100);
    if (cabeNoPeso(doRotulo, peso.valor)) m = doRotulo; else peso = null;
  }
  if (!peso) return { nome, ...(q ? { quantidade: q } : {}), ...m };
  const dito = `${decimal(peso.valor)} ${peso.unidade}`;
  const quantidade = !q ? dito
    : !doTexto ? `${q} (${dito})`
    : doTexto.valor === peso.valor && doTexto.unidade === peso.unidade ? q : dito;
  return { nome, quantidade, peso: peso.valor, unidade: peso.unidade, ...m };
}

/**
 * Le a resposta da IA: {"itens":[{nome, quantidade, peso, unidade, kcal, proteina, carboidrato, gordura}]}.
 * Aceita texto e cerca de codigo em volta; recusa (null) se algum item vier torto.
 */
export function lerEstimativa(resposta        )                        {
  const ini = resposta.indexOf('{');
  const fim = resposta.lastIndexOf('}');
  if (ini < 0 || fim <= ini) return null;
  let dados         ;
  try { dados = JSON.parse(resposta.slice(ini, fim + 1)); } catch { return null; }
  const lista = (dados                       )?.itens;
  if (!Array.isArray(lista) || lista.length === 0 || lista.length > 30) return null;
  const itens                 = [];
  for (const i of lista) {
    const lido = lerItemEstimado(i);
    if (!lido) return null;
    itens.push(lido);
  }
  return itens;
}

// ---------- registrado hoje e alimentos salvos (28/10/2026) ----------
// Pedido com print do almoco: "o registrado hoje, eu posso alterar as (g)",
// "cada alimento pesquisado deve ser salvo, caso eu queira usar novamente" e
// "uma pequena opcao ... de ser um alimento especifico e eu coloco tudo do alimento".

                                     
                                                             
               
                
                                                                                                                  
                         
 

const numeroBr = (t        ) => Number(t.replace(',', '.'));

/**
 * O total que a descricao registrada diz: "Arroz · 280 g" = 280 g; "Arroz · 2× 2
 * colheres (150 g)" = 300 g (o "N×" e o que a pessoa aumentou na tela). Sem g
 * nem ml, vale como porcao: 1, ou o " · N×" do fim, que o proprio ajuste escreve.
 */
export function quantidadeDoComido(descricao        )                     {
  const porcoes = /^(.*) · (\d+(?:,\d+)?)×$/.exec(descricao);
  if (porcoes) return { nome: porcoes[1] , valor: numeroBr(porcoes[2] ), unidade: 'porção' };
  const corte = descricao.indexOf(' · ');
  if (corte > 0) {
    const resto = descricao.slice(corte + 3);
    const peso = pesoDoTexto(resto) ?? medidaDoTexto(resto);
    if (peso) return { nome: descricao.slice(0, corte), ...peso };
  }
  return { nome: descricao, valor: 1, unidade: 'porção' };
}

/** O item registrado com outra quantidade: kcal e macros na mesma proporcao. Fora de 0–5000, null. */
export function comidoAjustado(c                                , para        )                                        {
  if (!Number.isFinite(para) || para <= 0 || para > 5000) return null;
  const q = quantidadeDoComido(c.descricao);
  const f = para / q.valor;
  // Folga minima: 84,3 × 0,5 vira 42,1499… em ponto flutuante.
  const umDecimal = (v        ) => Math.round(v * f * 10 + 1e-9) / 10;
  const descricao = q.unidade === 'porção'
    ? (para === 1 ? q.nome : `${q.nome} · ${decimal(para)}×`)
    : `${q.nome} · ${textoDaMedida(para, q.unidade)}`;
  return { descricao, kcal: Math.round(c.kcal * f), proteina: umDecimal(c.proteina), carboidrato: umDecimal(c.carboidrato), gordura: umDecimal(c.gordura) };
}

                                                     
             
 

const LIMITE_SALVOS = 200;
const chaveDoAlimento = (a              ) =>
  `${a.nome}|${a.quantidade ?? ''}`.normalize('NFD').replace(/[̀-ͯ]/g, '').toLocaleLowerCase('pt-BR').trim();

/** Os alimentos novos vao para o topo; o mesmo alimento (sem diferenca de acento) e trocado, nao repetido. */
export function guardarAlimentos(lista                          , novos                         , gerarId               = () => crypto.randomUUID())                  {
  let resultado = [...lista];
  for (const n of novos) {
    const chave = chaveDoAlimento(n);
    const antigo = resultado.find((a) => chaveDoAlimento(a) === chave);
    resultado = [{ ...n, id: antigo?.id ?? gerarId() }, ...resultado.filter((a) => a !== antigo)];
  }
  return resultado.slice(0, LIMITE_SALVOS);
}

export function lerAlimentosSalvos(bruto               )                  {
  if (bruto === null) return [];
  let dados         ;
  try { dados = JSON.parse(bruto); } catch { return []; }
  if (!Array.isArray(dados)) return [];
  // Os salvos antes de 30/10/2026 nao tem o peso: sai do texto ("100g"), como na resposta da IA.
  return dados.flatMap((x) => {
    const id = texto((x                    )?.id, 80);
    const item = lerItemEstimado(x);
    return id && item ? [{ id, ...item }] : [];
  });
}

/**
 * Instrucao fixa para a IA estimar uma refeicao. 30/10/2026: a IA devolvia os 100 g
 * do rotulo ("Pasta de Amendoim (Dr Peanut) · 100g · 590 kcal") para quem come uma
 * colher; agora ela manda o peso em numero e a porcao de uma vez, nunca o rotulo.
 */
export const INSTRUCAO_ESTIMATIVA = [
  'Você é um nutricionista esportivo brasileiro. Estime calorias e macronutrientes do que a pessoa comeu,',
  'usando a tabela TACO e o rótulo da marca quando ela for citada.',
  'Quantidade: se a pessoa disse (gramas, ml, unidades, fatias, colheres, copos, scoops), use exatamente o que ela disse e converta para gramas ou ml.',
  'Se não disse, use a porção que uma pessoa come de uma vez, em medida caseira — nunca 100 g só porque o rótulo traz os valores por 100 g.',
  'Exemplos de porção: pasta de amendoim 1 colher de sopa (15 g); azeite 1 colher de sopa (13 ml); whey 1 scoop (30 g); requeijão 1 colher de sopa (20 g);',
  'pão francês 1 unidade (50 g); ovo 1 unidade (50 g); banana 1 unidade (90 g); leite 1 copo (200 ml); arroz cozido 4 colheres de sopa (100 g).',
  'kcal e macros são do TOTAL dessa quantidade, não de 100 g: com o rótulo por 100 g, multiplique pela fração (15 g = 0,15 × o valor de 100 g).',
  'Responda SOMENTE com JSON, sem texto antes ou depois, no formato:',
  '{"itens":[{"nome":"Pasta de amendoim","quantidade":"1 colher de sopa (15 g)","peso":15,"unidade":"g","kcal":89,"proteina":3.8,"carboidrato":2.7,"gordura":7.1}]}',
  '"peso" é o total em gramas (ou ml, com "unidade":"ml"), em número. Um item por alimento. Números sem unidades dentro deles.',
].join(' ');
