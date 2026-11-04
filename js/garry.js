// O Garry no iPhone (04/11/2026). Mesmo provedor, modelo e chave que o
// computador usa: os tres vem da sincronizacao (a chave chega cifrada duas
// vezes, pela nuvem e pela cifra da conta, e so e aberta aqui). Nesta primeira
// versao ele conversa sobre o treino e a dieta; nao muda nada sozinho.

export function configDaIa(config) {
  const baseUrl = String(config.iaBaseUrl ?? 'https://openrouter.ai/api/v1').replace(/\/+$/, '');
  let host = '';
  try {
    host = new URL(baseUrl).host;
  } catch {
    return null;
  }
  const modelo = config[`iaModelo:${host}`] ?? config.iaModelo ?? '';
  const cifrada = config[`iaChave:${host}`];
  return { baseUrl, host, modelo, cifrada: cifrada && cifrada !== 'apagada' ? cifrada : null };
}

export async function abrirChave(cifrada, cifra) {
  try {
    const aberto = await cifra.decifrar(cifrada);
    return typeof aberto?.chave === 'string' && aberto.chave !== '' ? aberto.chave : null;
  } catch {
    return null;
  }
}

export const INSTRUCOES = [
  'Seu nome é Garry. Você é o assistente do app Próximo Passo e agora está no iPhone da pessoa, ajudando no treino e na dieta.',
  'Responda em português do Brasil, curto (até 6 linhas), direto e firme, sem culpa, sem diagnóstico e sem comparar a pessoa com ninguém.',
  'O treino segue sobrecarga progressiva por dupla progressão: na faixa de repetições do exercício, fechou o topo em todas as séries, sobe a carga e volta ao começo da faixa.',
  'Use só os números do contexto. Se faltar dado, diga o que falta. Você não consegue mudar o treino nem a dieta daqui: diga o que a pessoa pode tocar no app.',
].join('\n');

/** Tira o raciocinio que alguns modelos mandam no texto. */
export function limparTexto(t) {
  return t.replace(/<think>[\s\S]*?(<\/think>|$)/g, '').replace(/^\s+/, '');
}

/**
 * Pergunta ao modelo com a resposta chegando aos poucos.
 * aoTrecho(textoAteAgora) e chamado a cada pedaco. Devolve o texto final.
 */
export async function conversar({ baseUrl, host, modelo, chave }, mensagens, contexto, aoTrecho, f = fetch) {
  const corpo = {
    model: modelo,
    stream: true,
    max_tokens: 1200,
    messages: [
      { role: 'system', content: `${INSTRUCOES}\n\nContexto de agora (JSON):\n${JSON.stringify(contexto)}` },
      ...mensagens.slice(-12).map((m) => ({ role: m.papel === 'eu' ? 'user' : 'assistant', content: m.texto })),
    ],
  };
  // Mesmo cuidado do computador: o modelo que pensa por padrao demora demais no plano gratuito.
  if (host === 'openrouter.ai') corpo.reasoning = { effort: 'low', exclude: true };
  if (host === 'integrate.api.nvidia.com') corpo.chat_template_kwargs = { enable_thinking: false };
  const headers = { Authorization: `Bearer ${chave}`, 'Content-Type': 'application/json' };
  if (host === 'openrouter.ai') headers['X-Title'] = 'Proximo Passo (iPhone)';

  let resposta;
  try {
    resposta = await f(`${baseUrl}/chat/completions`, { method: 'POST', headers, body: JSON.stringify(corpo) });
  } catch {
    throw new Error('Não consegui falar com a IA. Confira a internet do celular.');
  }
  if (!resposta.ok) {
    const texto = await resposta.text().catch(() => '');
    if (resposta.status === 401 || resposta.status === 403) throw new Error('O provedor recusou a chave da IA. Troque a chave no app do computador.');
    if (resposta.status === 402) throw new Error('Sem saldo no provedor da IA. Os modelos ":free" funcionam sem saldo: escolha um no computador.');
    if (resposta.status === 429) throw new Error('A cota da IA acabou por agora. Tente mais tarde.');
    throw new Error(`A IA respondeu ${resposta.status}. ${texto.slice(0, 140)}`);
  }

  let acumulado = '';
  const leitor = resposta.body.getReader();
  const dec = new TextDecoder();
  let sobra = '';
  for (;;) {
    const { value, done } = await leitor.read();
    if (done) break;
    sobra += dec.decode(value, { stream: true });
    const linhas = sobra.split('\n');
    sobra = linhas.pop() ?? '';
    for (const linha of linhas) {
      const l = linha.trim();
      if (!l.startsWith('data:')) continue;
      const dado = l.slice(5).trim();
      if (dado === '[DONE]') continue;
      try {
        const pedaco = JSON.parse(dado).choices?.[0]?.delta?.content;
        if (typeof pedaco === 'string' && pedaco !== '') {
          acumulado += pedaco;
          aoTrecho(limparTexto(acumulado));
        }
      } catch {
        // linha de comentario ou pedaco partido: ignora
      }
    }
  }
  const final = limparTexto(acumulado).trim();
  if (final === '') throw new Error('A IA não devolveu resposta. Tente de novo.');
  return final;
}
