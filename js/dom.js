// As pecas de tela que o app e o treino serie a serie usam (09/11/2026).

export function h(tag, attrs = {}, ...filhos) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs ?? {})) {
    if (v === null || v === undefined || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else if (k === 'texto') el.textContent = v;
    else el.setAttribute(k, v === true ? '' : String(v));
  }
  for (const f of filhos.flat()) if (f !== null && f !== undefined && f !== false) el.append(f instanceof Node ? f : document.createTextNode(String(f)));
  return el;
}

const CAMINHOS = {
  halter: 'M3 10v4M6 7v10M18 7v10M21 10v4M6 12h12',
  prato: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18Zm0 4a5 5 0 1 1 0 10 5 5 0 0 1 0-10Z',
  garry: 'M12 3c4.97 0 9 3.58 9 8s-4.03 8-9 8c-1.2 0-2.35-.2-3.4-.58L4 20l1.3-3.6C3.87 15 3 13.1 3 11c0-4.42 4.03-8 9-8ZM9 10v2M15 10v2',
  ajustes: 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6ZM19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1Z',
  check: 'M5 12.5l4.5 4.5L19 7.5',
  menos: 'M6 12h12',
  mais: 'M12 6v12M6 12h12',
  subir: 'M12 19V5M5 12l7-7 7 7',
  descer: 'M12 5v14M5 12l7 7 7-7',
  igual: 'M6 9.5h12M6 14.5h12',
  cima: 'M6 15l6-6 6 6',
  baixo: 'M6 9l6 6 6-6',
  enviar: 'M12 19V5M5 12l7-7 7 7',
  fechar: 'M6 6l12 12M18 6L6 18',
  comecar: 'M8 5.5v13l11-6.5Z',
  parar: 'M7 7h10v10H7Z',
  voltar: 'M15 5l-7 7 7 7',
  avancar: 'M9 5l7 7-7 7',
  lapis: 'M4 20h4.5L19.3 9.2a2.1 2.1 0 0 0 0-3L17.8 4.7a2.1 2.1 0 0 0-3 0L4 15.5V20ZM13.5 6l4.5 4.5',
  cardio: 'M3 12h4l2.2-5 4.2 10 2.4-5H21',
  liberada: 'M8 11V7.5a4 4 0 0 1 7.6-1.7M6 11h12v9H6ZM12 14.5v2',
  seguir: 'M5 12h14M13 6l6 6-6 6',
};

export function icone(nome) {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', nome === 'ajustes' ? '1.8' : '2.2');
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');
  svg.setAttribute('aria-hidden', 'true');
  const p = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  p.setAttribute('d', CAMINHOS[nome]);
  svg.append(p);
  return svg;
}

export const numeroBr = (v) => String(Math.round(v * 10) / 10).replace('.', ',');

/** Campo de numero: toca, abre o teclado numerico com o valor ja selecionado. */
export function campoNumero(rotulo, valor, decimal, aoMudar, classe = 'campo-serie') {
  const input = h('input', {
    class: classe, type: 'text', inputmode: decimal ? 'decimal' : 'numeric', enterkeyhint: 'done',
    value: numeroBr(valor), 'aria-label': rotulo, autocomplete: 'off',
  });
  input.addEventListener('focus', () => input.select());
  input.addEventListener('keydown', (ev) => { if (ev.key === 'Enter') input.blur(); });
  input.addEventListener('change', () => {
    const v = Number(input.value.replace(',', '.'));
    const limpo = Number.isFinite(v) && v >= 0 ? (decimal ? Math.round(v * 10) / 10 : Math.round(v)) : 0;
    input.value = numeroBr(limpo);
    aoMudar(limpo);
  });
  return input;
}

const ICONE_DO_VEREDITO = { carga: 'subir', reps: 'subir', igual: 'igual', abaixo: 'descer' };

/** A marca de uma serie ou de um exercicio contra a ultima vez: seta, sinal e o quanto. */
export function selo(v, classe = '') {
  if (!v) return null;
  const ic = ICONE_DO_VEREDITO[v.tipo];
  return h('span', { class: `selo${classe ? ` ${classe}` : ''}`, 'data-tipo': v.tipo }, ic ? icone(ic) : null, h('span', { texto: v.tipo === 'nova' ? 'Primeiro' : v.texto }));
}

// Uma serie na tela (10/11/2026, "nao gosto muito da ideia de 40kg x 10, e muito feio
// visualmente"): as repeticoes primeiro, em negrito, e a carga ao lado numa etiqueta apagada.
// `empilhado` poe a carga embaixo, para as colunas estreitas da tabela do cartao.
export function cargaReps(carga, reps, { empilhado = false } = {}) {
  return h('span', { class: `cr${empilhado ? ' empilhado' : ''}` },
    h('span', { class: 'cr-reps' }, h('b', { texto: String(reps) }), h('small', { texto: reps === 1 ? 'rep' : 'reps' })),
    h('span', { class: 'cr-kg', texto: `${numeroBr(carga)} kg` }));
}
