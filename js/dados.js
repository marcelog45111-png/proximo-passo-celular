// Os dados do iPhone (04/11/2026): so o pedaco do banco do computador que o
// treino, a dieta e o Garry usam, guardado no aparelho. Cada mudanca feita aqui
// vira um item igual ao que o computador manda ({tabela, chave, linha, esquema})
// e sobe cifrado; o computador aplica sem saber que veio de um celular.
//
// Funcoes puras sobre um objeto `estado`; quem guarda e quem fala com a nuvem e
// o Sincronizador, no fim do arquivo.

/** Configuracoes que o celular le ou grava. O resto do banco passa e e esquecido. */
const CONFIGS = ['planoAlimentar', 'perfilNutricao', 'iaBaseUrl', 'iaModelo', 'treinoPlano'];
const PREFIXOS = ['iaModelo:', 'iaChave:', 'treinoSessao:'];
export const guardaConfig = (nome) => CONFIGS.includes(nome) || PREFIXOS.some((p) => nome.startsWith(p));

const TABELAS = new Set(['configuracoes', 'marcas_habito', 'refeicoes_puladas', 'consumo_extra', 'registros_peso']);
const DIAS_GUARDADOS = 120;

export function estadoVazio() {
  return { cursor: 0, esquema: 0, config: {}, marcas: {}, puladas: {}, consumo: {}, pesos: {}, pendentes: {} };
}

/** Onde cada tabela mora no estado: [colecao, nome da entrada]. */
function lugar(tabela, chave) {
  switch (tabela) {
    case 'configuracoes': return guardaConfig(String(chave[0])) ? ['config', String(chave[0])] : null;
    case 'marcas_habito': return ['marcas', `${chave[0]}|${chave[1]}`];
    case 'refeicoes_puladas': return ['puladas', `${chave[0]}|${chave[1]}`];
    case 'consumo_extra': return ['consumo', String(chave[0])];
    case 'registros_peso': return ['pesos', String(chave[0])];
    default: return null;
  }
}

function gravarNoEstado(estado, tabela, chave, linha) {
  const onde = lugar(tabela, chave);
  if (onde === null) return false;
  const [colecao, nome] = onde;
  if (linha === null) delete estado[colecao][nome];
  else estado[colecao][nome] = tabela === 'configuracoes' ? String(linha.valor) : { ...linha };
  return true;
}

/** Aplica itens decifrados que vieram de outro aparelho. Devolve quantos importam aqui. */
export function aplicarItens(estado, itens) {
  let aplicados = 0;
  for (const item of itens) {
    if (!item || typeof item.tabela !== 'string' || !Array.isArray(item.chave)) continue;
    if (typeof item.esquema === 'number') estado.esquema = Math.max(estado.esquema, item.esquema);
    if (!TABELAS.has(item.tabela)) continue;
    // Mudanca feita aqui e ainda nao enviada vence: ela sobe na mesma rodada.
    if (estado.pendentes[chaveDoItem(item.tabela, item.chave)]) continue;
    if (gravarNoEstado(estado, item.tabela, item.chave, item.linha ?? null)) aplicados += 1;
  }
  return aplicados;
}

export const chaveDoItem = (tabela, chave) => `${tabela}\u0000${JSON.stringify(chave)}`;

/** Uma mudanca feita no celular: vale na hora aqui e fica esperando para subir. */
export function escrever(estado, tabela, chave, linha) {
  gravarNoEstado(estado, tabela, chave, linha);
  estado.pendentes[chaveDoItem(tabela, chave)] = { tabela, chave, linha };
}

export const definirConfig = (estado, nome, valor) => escrever(estado, 'configuracoes', [nome], { chave: nome, valor });

/** Tira o que e velho demais para o celular (o computador continua com tudo). */
export function podar(estado, hoje) {
  const limite = somarDias(hoje, -DIAS_GUARDADOS);
  for (const [k, v] of Object.entries(estado.marcas)) if (v.dia_logico < limite) delete estado.marcas[k];
  for (const [k, v] of Object.entries(estado.puladas)) if (v.dia < limite) delete estado.puladas[k];
  for (const [k, v] of Object.entries(estado.consumo)) if (v.dia < limite) delete estado.consumo[k];
  for (const k of Object.keys(estado.config)) if (k.startsWith('treinoSessao:') && k.slice(13) < limite) delete estado.config[k];
}

// ---------- dia logico (o mesmo do computador: o dia vira as 04:00) ----------

const dois = (n) => String(n).padStart(2, '0');
const formatar = (d) => `${d.getFullYear()}-${dois(d.getMonth() + 1)}-${dois(d.getDate())}`;

export function diaLogico(instante = new Date(), virada = 4) {
  const local = new Date(instante.getTime());
  if (local.getHours() < virada) local.setDate(local.getDate() - 1);
  return formatar(local);
}

export function somarDias(dia, n) {
  const [a, m, d] = dia.split('-').map(Number);
  return formatar(new Date(a, m - 1, d + n));
}

export function diaDaSemana(dia) {
  const [a, m, d] = dia.split('-').map(Number);
  return new Date(a, m - 1, d).getDay();
}

// ---------- o sincronizador ----------

const VERIFICADOR = '__verificador';
const LOTE_RECEBER = 1000;
const LOTE_ENVIO = 100;

/**
 * d: { nuvem, cifra, dispositivo, estado, guardar(estado), aoProgresso?(n) }
 * Rodada: RECEBER e depois ENVIAR, como o computador.
 */
export class Sincronizador {
  constructor(d) {
    this.d = d;
    this.rodando = null;
  }

  /** Confere o codigo de recuperacao pelo verificador que o primeiro computador gravou. */
  async codigoConfere() {
    const achado = await this.d.nuvem.buscar(await this.d.cifra.idOpaco(VERIFICADOR, JSON.stringify(['ok'])));
    if (achado === null) return false;
    try {
      const item = await this.d.cifra.decifrar(achado.dados);
      return item?.linha?.texto === 'proximo-passo';
    } catch {
      return false;
    }
  }

  sincronizar() {
    // Um pedido por vez: quem chamar durante uma rodada espera a mesma.
    if (this.rodando === null) this.rodando = this.rodada().finally(() => { this.rodando = null; });
    return this.rodando;
  }

  async rodada() {
    const recebidos = await this.receber();
    const enviados = await this.enviar();
    return { recebidos, enviados };
  }

  async receber() {
    const { nuvem, cifra, estado } = this.d;
    let aplicados = 0;
    let lidos = 0;
    for (;;) {
      const lote = await nuvem.receber(estado.cursor, LOTE_RECEBER);
      if (lote.length === 0) break;
      const itens = [];
      for (const linha of lote) {
        estado.cursor = Math.max(estado.cursor, Number(linha.versao));
        if (linha.dispositivo === this.d.dispositivo) continue;
        try {
          itens.push(await cifra.decifrar(linha.dados));
        } catch {
          // item de outra chave ou estragado: ignorado, como no computador
        }
      }
      aplicados += aplicarItens(estado, itens);
      lidos += lote.length;
      this.d.aoProgresso?.(lidos);
      this.d.guardar(estado);
      if (lote.length < LOTE_RECEBER) break;
    }
    return aplicados;
  }

  async enviar() {
    const { nuvem, cifra, estado } = this.d;
    const fila = Object.entries(estado.pendentes);
    let enviados = 0;
    for (let i = 0; i < fila.length; i += LOTE_ENVIO) {
      const pedaco = fila.slice(i, i + LOTE_ENVIO);
      const itens = [];
      for (const [, p] of pedaco) {
        const item = { tabela: p.tabela, chave: p.chave, linha: p.linha, esquema: estado.esquema };
        itens.push({ chave: await cifra.idOpaco(p.tabela, JSON.stringify(p.chave)), dados: await cifra.cifrar(item), dispositivo: this.d.dispositivo });
      }
      await nuvem.enviar(itens);
      // So tira da fila o que nao mudou de novo enquanto subia.
      for (const [k, p] of pedaco) if (estado.pendentes[k] === p) delete estado.pendentes[k];
      enviados += itens.length;
      this.d.guardar(estado);
    }
    return enviados;
  }
}
