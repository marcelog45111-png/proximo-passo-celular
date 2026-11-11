// A nuvem do app (Supabase) vista do iPhone (04/11/2026): o mesmo login por
// e-mail e senha e a mesma tabela `registros` que o computador usa
// (src/main/sync/supabase.ts). So id opaco e texto cifrado passam por aqui.

export const PROJETO = {
  url: 'https://dhuvkjhvximyxiiseoit.supabase.co',
  chavePublica: 'sb_publishable_nrNQrj0usotUSFHeCEihRw_5uK8UqTl',
};

const COLUNAS = 'chave,dados,dispositivo,versao';
const ESPERA_MS = 25_000;

export class ErroNuvem extends Error {
  constructor(tipo, mensagem) {
    super(mensagem);
    this.tipo = tipo;
  }
}

const MENSAGENS_DE_LOGIN = {
  invalid_credentials: 'E-mail ou senha não conferem.',
  invalid_grant: 'E-mail ou senha não conferem.',
  email_not_confirmed: 'Confirme o e-mail que o Supabase mandou e tente de novo.',
  over_request_rate_limit: 'Muitas tentativas seguidas. Espere um minuto e tente de novo.',
};

async function chamar(f, url, init) {
  const controle = new AbortController();
  const relogio = setTimeout(() => controle.abort(), ESPERA_MS);
  try {
    return await f(url, { ...init, signal: controle.signal });
  } catch {
    throw new ErroNuvem('offline', 'Sem conexão com a nuvem. Confira a internet do celular.');
  } finally {
    clearTimeout(relogio);
  }
}

async function lerJson(resposta) {
  try {
    const t = await resposta.text();
    return t === '' ? {} : JSON.parse(t);
  } catch {
    return {};
  }
}

function sessaoDe(corpo, agora) {
  return {
    accessToken: String(corpo.access_token),
    refreshToken: String(corpo.refresh_token),
    expiraEm: agora + Number(corpo.expires_in ?? 3600) * 1000,
    usuarioId: String(corpo.user?.id ?? ''),
    email: String(corpo.user?.email ?? ''),
  };
}

export async function entrar(email, senha, { projeto = PROJETO, f = fetch, agora = Date.now } = {}) {
  const r = await chamar(f, `${projeto.url}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { apikey: projeto.chavePublica, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: senha }),
  });
  const corpo = await lerJson(r);
  if (!r.ok) throw new ErroNuvem('login', MENSAGENS_DE_LOGIN[String(corpo.error_code ?? corpo.error ?? '')] ?? 'A nuvem recusou o login. Confira o e-mail e a senha.');
  return sessaoDe(corpo, agora());
}

const MENSAGENS_DE_INSCRICAO = {
  user_already_exists: 'Já existe uma conta com este e-mail. Toque em Entrar.',
  email_exists: 'Já existe uma conta com este e-mail. Toque em Entrar.',
  weak_password: 'Senha fraca: use pelo menos 6 caracteres.',
  email_address_invalid: 'Esse e-mail não parece certo. Confira e tente de novo.',
  validation_failed: 'Confira o e-mail e a senha.',
  signup_disabled: 'As inscrições estão fechadas agora.',
  over_request_rate_limit: 'Muitas tentativas seguidas. Espere um minuto e tente de novo.',
  over_email_send_rate_limit: 'Muitas tentativas seguidas. Espere um minuto e tente de novo.',
};

/**
 * Cria a conta (11/11/2026: "area de inscrever-se, como todos que vao usar o app nao tem o app do PC").
 * Com o e-mail confirmado sozinho (o projeto esta assim), ja volta com a sessao. Se o projeto passar a
 * pedir confirmacao, volta null: a pessoa confirma o e-mail e entra.
 */
export async function inscrever(email, senha, { projeto = PROJETO, f = fetch, agora = Date.now } = {}) {
  const r = await chamar(f, `${projeto.url}/auth/v1/signup`, {
    method: 'POST',
    headers: { apikey: projeto.chavePublica, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: senha }),
  });
  const corpo = await lerJson(r);
  if (!r.ok) throw new ErroNuvem('inscricao', MENSAGENS_DE_INSCRICAO[String(corpo.error_code ?? corpo.code ?? '')] ?? 'A nuvem não criou a conta agora. Tente de novo em instantes.');
  return corpo.access_token ? sessaoDe(corpo, agora()) : null;
}

export class Nuvem {
  /** d: { projeto, sessao(): Sessao|null, guardarSessao(s), f?, agora? } */
  constructor(d) {
    this.d = d;
    this.projeto = d.projeto ?? PROJETO;
    this.f = d.f ?? ((...a) => fetch(...a));
    this.agora = d.agora ?? Date.now;
  }

  async renovar(sessao) {
    const r = await chamar(this.f, `${this.projeto.url}/auth/v1/token?grant_type=refresh_token`, {
      method: 'POST',
      headers: { apikey: this.projeto.chavePublica, 'Content-Type': 'application/json' },
      body: JSON.stringify({ refresh_token: sessao.refreshToken }),
    });
    if (!r.ok) throw new ErroNuvem('login', 'Sua sessão venceu. Entre de novo nos Ajustes.');
    const nova = sessaoDe(await lerJson(r), this.agora());
    this.d.guardarSessao(nova);
    return nova;
  }

  async sessaoValida() {
    const s = this.d.sessao();
    if (s === null) throw new ErroNuvem('login', 'Entre na sua conta.');
    return s.expiraEm - this.agora() < 60_000 ? this.renovar(s) : s;
  }

  async pedir(caminho, { method = 'GET', body, prefer } = {}, jaRenovou = false) {
    const sessao = await this.sessaoValida();
    const headers = { apikey: this.projeto.chavePublica, Authorization: `Bearer ${sessao.accessToken}` };
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    if (prefer) headers.Prefer = prefer;
    const r = await chamar(this.f, `${this.projeto.url}${caminho}`, { method, headers, body });
    if (r.status === 401 && !jaRenovou) {
      await this.renovar(sessao);
      return this.pedir(caminho, { method, body, prefer }, true);
    }
    if (!r.ok) throw new ErroNuvem('outro', `A nuvem respondeu ${r.status}. Tente de novo em instantes.`);
    return lerJson(r);
  }

  async receber(desde, limite) {
    const linhas = await this.pedir(`/rest/v1/registros?select=${COLUNAS}&versao=gt.${desde}&order=versao.asc&limit=${limite}`);
    return Array.isArray(linhas) ? linhas : [];
  }

  async buscar(chave) {
    const linhas = await this.pedir(`/rest/v1/registros?select=${COLUNAS}&chave=eq.${encodeURIComponent(chave)}&limit=1`);
    return Array.isArray(linhas) && linhas.length > 0 ? linhas[0] : null;
  }

  /** Grava (ou substitui) e devolve a versao que cada item ganhou. */
  async enviar(itens) {
    const linhas = await this.pedir('/rest/v1/registros?select=chave,versao', {
      method: 'POST',
      body: JSON.stringify(itens),
      prefer: 'resolution=merge-duplicates,return=representation',
    });
    return (Array.isArray(linhas) ? linhas : []).map((l) => ({ chave: String(l.chave), versao: Number(l.versao) }));
  }
}
