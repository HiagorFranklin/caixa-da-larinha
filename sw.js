/* Service worker do Caixa da Larinha: deixa o app abrir sem internet.
   Ao mudar qualquer arquivo do app, aumente o número em VERSAO (ex.: "v4" -> "v5") e use o MESMO valor
   nos links do index.html: styles.css?v5 e app.js?v5. Assim a página nova nunca carrega o estilo antigo. */
const VERSAO = "v4";
const CACHE = "caixa-da-larinha-" + VERSAO;
const ARQUIVOS = [
  "./",
  "./index.html",
  "./styles.css?" + VERSAO,
  "./app.js?" + VERSAO,
  "./manifest.webmanifest",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./icons/icon-maskable-512.png",
  "./icons/apple-touch-icon.png",
  "./icons/favicon-48.png"
];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ARQUIVOS)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith("caixa-da-larinha-") && k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);

  // Fontes do Google: usa a cópia guardada e atualiza em segundo plano
  if (url.hostname === "fonts.googleapis.com" || url.hostname === "fonts.gstatic.com") {
    e.respondWith(
      caches.open(CACHE).then(async (c) => {
        const cached = await c.match(req);
        const net = fetch(req).then((r) => { if (r.ok || r.type === "opaque") c.put(req, r.clone()); return r; }).catch(() => cached);
        return cached || net;
      })
    );
    return;
  }

  if (url.origin !== self.location.origin) return;

  // Página: tenta a internet primeiro (pega atualizações), cai para a cópia offline
  if (req.mode === "navigate") {
    e.respondWith(
      fetch(req).then((r) => { const copy = r.clone(); caches.open(CACHE).then((c) => c.put("./index.html", copy)); return r; })
        .catch(() => caches.match("./index.html"))
    );
    return;
  }

  // Demais arquivos: cópia offline primeiro, atualizando em segundo plano
  e.respondWith(
    caches.open(CACHE).then(async (c) => {
      const cached = await c.match(req);
      const net = fetch(req).then((r) => { if (r.ok) c.put(req, r.clone()); return r; }).catch(() => cached);
      return cached || net;
    })
  );
});
