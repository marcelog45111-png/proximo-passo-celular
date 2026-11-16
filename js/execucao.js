// O video de como fazer o exercicio (16/11/2026). Pedido: "ao usuario clicar em execucao, mostrar um
// video de como a serie e feita ... pode ser configurado pelo usuario OU se existir a serie q eu fiz
// como referencia de execucao (e como se fosse uma biblioteca compartilhada, que o usuario referencia
// com o nome parecido do exercicio)".
//
// Cada exercicio pode ter o proprio link (`video` no plano, posto no Editar treino). Sem ele, vale a
// biblioteca: `biblioteca.json`, publicado junto com o app, com os exercicios do dono que tem video.
// O exercicio da pessoa acha o da biblioteca pelo nome parecido, com a mesma regra do importar
// (corresponder: mesmas palavras, mesmo equipamento, mesmo musculo). O app nao tem servidor: a
// biblioteca e um arquivo estatico, refeito a cada publicacao (ferramentas/celular-build.mjs).
// Aqui so contas puras; a tela mora no app.js.

import { corresponder } from './importar.js';

const ID_YOUTUBE = /^[\w-]{11}$/;

/** Segundos do "t=1m30s" / "t=90" / "start=90" do YouTube; 0 sem tempo. */
function segundosDoLink(t) {
  if (!t) return 0;
  if (/^\d+$/.test(t)) return Number(t);
  const m = /^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?$/.exec(t);
  return m ? Number(m[1] ?? 0) * 3600 + Number(m[2] ?? 0) * 60 + Number(m[3] ?? 0) : 0;
}

/**
 * O que fazer com o link: tocar dentro do app (youtube, vimeo, instagram, tiktok, arquivo de video)
 * ou abrir fora (link). null = nao e um link https.
 * { tipo, url, embed? } — embed e o endereco do player para o iframe.
 */
export function lerVideo(texto) {
  if (typeof texto !== 'string') return null;
  let url;
  try {
    url = new URL(texto.trim());
  } catch {
    return null;
  }
  if (url.protocol !== 'https:') return null;
  const host = url.hostname.replace(/^(www|m)\./, '');
  const partes = url.pathname.split('/').filter(Boolean);
  const limpo = url.toString();

  if (host === 'youtube.com' || host === 'youtu.be' || host === 'youtube-nocookie.com' || host === 'music.youtube.com') {
    let id = null;
    if (host === 'youtu.be') id = partes[0];
    else if (partes[0] === 'watch') id = url.searchParams.get('v');
    else if (['shorts', 'embed', 'live', 'v'].includes(partes[0])) id = partes[1];
    if (!id || !ID_YOUTUBE.test(id)) return { tipo: 'link', url: limpo };
    const inicio = segundosDoLink(url.searchParams.get('t') ?? url.searchParams.get('start'));
    const p = new URLSearchParams({ playsinline: '1', rel: '0', modestbranding: '1', loop: '1', playlist: id });
    if (inicio > 0) p.set('start', String(inicio));
    return { tipo: 'youtube', url: limpo, embed: `https://www.youtube-nocookie.com/embed/${id}?${p}` };
  }
  if (host === 'vimeo.com' || host === 'player.vimeo.com') {
    const id = partes.find((x) => /^\d+$/.test(x));
    return id ? { tipo: 'vimeo', url: limpo, embed: `https://player.vimeo.com/video/${id}?playsinline=1&loop=1` } : { tipo: 'link', url: limpo };
  }
  if (host === 'instagram.com') {
    const i = partes.findIndex((x) => x === 'reel' || x === 'reels' || x === 'p' || x === 'tv');
    const codigo = i === -1 ? null : partes[i + 1];
    return codigo ? { tipo: 'instagram', url: limpo, embed: `https://www.instagram.com/${partes[i] === 'reels' ? 'reel' : partes[i]}/${codigo}/embed` } : { tipo: 'link', url: limpo };
  }
  if (host === 'tiktok.com') {
    const i = partes.indexOf('video');
    const id = i === -1 ? null : partes[i + 1];
    return id && /^\d+$/.test(id) ? { tipo: 'tiktok', url: limpo, embed: `https://www.tiktok.com/embed/v2/${id}` } : { tipo: 'link', url: limpo };
  }
  if (/\.(mp4|m4v|mov|webm)$/i.test(url.pathname)) return { tipo: 'arquivo', url: limpo };
  return { tipo: 'link', url: limpo };
}

/** A biblioteca baixada, conferida: [{nome, video}] so com link que o app entende. */
export function lerBiblioteca(bruto) {
  const itens = Array.isArray(bruto?.exercicios) ? bruto.exercicios : [];
  const vistos = new Set();
  const lista = [];
  for (const x of itens) {
    if (typeof x?.nome !== 'string' || x.nome.trim() === '' || lerVideo(x.video) === null) continue;
    const chave = x.nome.trim().toLowerCase();
    if (vistos.has(chave)) continue;
    vistos.add(chave);
    lista.push({ nome: x.nome.trim(), video: x.video.trim() });
  }
  return lista;
}

/**
 * O video que vale para o exercicio: o dele (posto pela pessoa) vence; sem ele, o da biblioteca com
 * o nome parecido. { video, origem: 'seu' | 'biblioteca', nome (o exercicio da biblioteca) } ou null.
 */
export function videoDoExercicio(ex, biblioteca) {
  const proprio = lerVideo(ex?.video ?? '');
  if (proprio) return { video: proprio, origem: 'seu', nome: ex.nome };
  if (!ex?.nome || !Array.isArray(biblioteca) || biblioteca.length === 0) return null;
  const achado = corresponder(ex.nome, biblioteca);
  if (!achado) return null;
  const v = lerVideo(achado.ex.video);
  return v ? { video: v, origem: 'biblioteca', nome: achado.ex.nome } : null;
}

/** Do plano do dono para a biblioteca: um item por exercicio com video, sem repetir o nome. */
export function bibliotecaDoPlano(plano) {
  const exercicios = [];
  for (const d of plano?.dias ?? []) {
    for (const e of d.exercicios ?? []) {
      if (typeof e?.nome === 'string' && lerVideo(e.video ?? '') !== null) exercicios.push({ nome: e.nome.trim(), video: e.video.trim() });
    }
  }
  return { exercicios: lerBiblioteca({ exercicios }) };
}
