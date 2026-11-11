// Abre o app sem internet (04/11/2026). Rede primeiro, para a versao nova
// chegar sozinha; sem rede, a copia guardada. Os dados nunca passam por aqui:
// a nuvem e a IA ficam de fora (outro endereco).
// O GitHub Pages manda max-age=600: sem 'no-cache', o "rede primeiro" pegava a copia do navegador
// por ate 10 minutos e o celular ficava na versao velha (11/11/2026). Agora sempre confere com o
// servidor (ETag: se nada mudou, volta 304 sem baixar de novo).

const CACHE = 'pp-celular-v21';
const ARQUIVOS = [
  './', 'index.html', 'estilo.css', 'manifest.webmanifest', 'icone.png',
  'js/app.js', 'js/cifra.js', 'js/nuvem.js', 'js/dados.js', 'js/treino.js', 'js/garry.js', 'js/gerado/nutricao.js', 'js/movimento.js', 'js/barra3d.js', 'js/evolucao3d.js', 'js/importar.js', 'js/dom.js', 'js/jogo.js',
  'vendor/gsap.min.js', 'vendor/ScrollTrigger.min.js', 'vendor/three.min.js',
  'fontes/big-shoulders-display-latin-wght-normal.woff2',
];

self.addEventListener('install', (ev) => {
  ev.waitUntil(caches.open(CACHE).then((c) => c.addAll(ARQUIVOS.map((a) => new Request(a, { cache: 'reload' })))).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (ev) => {
  ev.waitUntil(caches.keys().then((nomes) => Promise.all(nomes.filter((n) => n !== CACHE).map((n) => caches.delete(n)))).then(() => self.clients.claim()));
});

self.addEventListener('fetch', (ev) => {
  const url = new URL(ev.request.url);
  if (ev.request.method !== 'GET' || url.origin !== self.location.origin) return;
  ev.respondWith(
    fetch(ev.request.url, { cache: 'no-cache', credentials: 'same-origin' })
      .then((r) => {
        if (!r.ok) throw new Error(String(r.status));
        const copia = r.clone();
        caches.open(CACHE).then((c) => c.put(ev.request, copia));
        return r;
      })
      .catch(() => caches.match(ev.request).then((r) => r ?? caches.match('index.html'))),
  );
});
