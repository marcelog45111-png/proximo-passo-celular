// Cifra da sincronizacao no iPhone (04/11/2026). E a mesma do computador
// (src/main/sync/cifra.ts), feita com o Web Crypto do Safari:
//
//   segredo (32 bytes) -> HKDF-SHA256 "dados" -> AES-256-GCM (iv | tag | corpo, base64)
//                      -> HKDF-SHA256 "ids"   -> HMAC-SHA256 do "tabela \0 chave" (hex)
//
// test/celular/cifra.test.ts cifra de um lado e abre do outro, nos dois sentidos.

const ALFABETO = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
const TAMANHO_SEGREDO = 32;
const TAMANHO_CODIGO = Math.ceil((TAMANHO_SEGREDO * 8) / 5);
const texto = new TextEncoder();

/** 32 bytes sorteados: a chave de uma conta criada no iPhone (11/11/2026, sem o app do computador). */
export function gerarSegredo() {
  return crypto.getRandomValues(new Uint8Array(TAMANHO_SEGREDO));
}

/** Os 32 bytes no codigo de recuperacao (13 grupos de 4), igual ao do computador (src/main/sync/cifra.ts). */
export function codigoDeRecuperacao(segredo) {
  let bits = 0;
  let acumulado = 0;
  let saida = '';
  for (const byte of segredo) {
    acumulado = (acumulado << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      saida += ALFABETO[(acumulado >>> (bits - 5)) & 31];
      bits -= 5;
    }
    acumulado &= (1 << bits) - 1;
  }
  if (bits > 0) saida += ALFABETO[(acumulado << (5 - bits)) & 31];
  return saida.match(/.{1,4}/g).join('-');
}

/** O codigo de recuperacao (13 grupos de 4) virando os 32 bytes; null se nao for um codigo. */
export function lerCodigoDeRecuperacao(digitado) {
  const limpo = String(digitado).toUpperCase().replace(/[\s-]/g, '');
  if (limpo.length !== TAMANHO_CODIGO) return null;
  const bytes = [];
  let bits = 0;
  let acumulado = 0;
  for (const letra of limpo) {
    const valor = ALFABETO.indexOf(letra);
    if (valor < 0) return null;
    acumulado = (acumulado << 5) | valor;
    bits += 5;
    if (bits >= 8) {
      bytes.push((acumulado >>> (bits - 8)) & 255);
      bits -= 8;
    }
    acumulado &= (1 << bits) - 1;
  }
  if (bytes.length !== TAMANHO_SEGREDO || acumulado !== 0) return null;
  return new Uint8Array(bytes);
}

export function paraBase64(bytes) {
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

export function deBase64(b64) {
  const s = atob(b64);
  const bytes = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i += 1) bytes[i] = s.charCodeAt(i);
  return bytes;
}

async function derivar(segredo, uso) {
  const base = await crypto.subtle.importKey('raw', segredo, 'HKDF', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits(
    { name: 'HKDF', hash: 'SHA-256', salt: texto.encode('proximo-passo-sync'), info: texto.encode(uso) },
    base,
    256,
  );
  return new Uint8Array(bits);
}

export async function criarCifra(segredo) {
  const chaveDados = await crypto.subtle.importKey('raw', await derivar(segredo, 'dados'), 'AES-GCM', false, ['encrypt', 'decrypt']);
  const chaveIds = await crypto.subtle.importKey('raw', await derivar(segredo, 'ids'), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return {
    async idOpaco(tabela, chaveJson) {
      const assinatura = new Uint8Array(await crypto.subtle.sign('HMAC', chaveIds, texto.encode(`${tabela}\u0000${chaveJson}`)));
      return [...assinatura].map((b) => b.toString(16).padStart(2, '0')).join('');
    },
    async cifrar(obj) {
      const iv = crypto.getRandomValues(new Uint8Array(12));
      // O Web Crypto devolve corpo | tag; o computador guarda iv | tag | corpo.
      const saida = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, chaveDados, texto.encode(JSON.stringify(obj))));
      const corpo = saida.subarray(0, saida.length - 16);
      const tag = saida.subarray(saida.length - 16);
      const tudo = new Uint8Array(12 + 16 + corpo.length);
      tudo.set(iv, 0);
      tudo.set(tag, 12);
      tudo.set(corpo, 28);
      return paraBase64(tudo);
    },
    /** Lanca se o texto foi adulterado ou se a chave e outra. */
    async decifrar(b64) {
      const bytes = deBase64(b64);
      if (bytes.length < 12 + 16 + 1) throw new Error('Item cifrado curto demais.');
      const junto = new Uint8Array(bytes.length - 12);
      junto.set(bytes.subarray(28), 0);
      junto.set(bytes.subarray(12, 28), bytes.length - 28);
      const claro = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: bytes.subarray(0, 12) }, chaveDados, junto);
      return JSON.parse(new TextDecoder().decode(claro));
    },
  };
}
