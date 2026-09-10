// Cache applicatif : l'app reste utilisable sans réseau (tunnels, zones blanches).
//
// IMPORTANT : à chaque mise à jour de app.js, styles.css ou vehicles.js,
// incrémenter ce numéro ET le reporter dans index.html (?v=…) et dans
// l'import de vehicles.js en tête de app.js. Sans ça, un appareil qui a déjà
// visité l'application peut se retrouver avec un fichier à jour chargé aux
// côtés d'un autre resté sur son ancienne version — le nom d'URL différent
// force chaque fichier à être re-téléchargé ensemble, quel que soit l'état
// du cache HTTP du navigateur ou du CDN.
const VERSION = 21;
const CACHE = `ev-saving-v${VERSION}`;
const FICHIERS = [
  './',
  `./index.html`,
  `./styles.css?v=${VERSION}`,
  `./app.js?v=${VERSION}`,
  `./vehicles.js?v=${VERSION}`,
  './manifest.webmanifest',
  './icons/icon.svg',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(FICHIERS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((cles) => Promise.all(cles.filter((c) => c !== CACHE).map((c) => caches.delete(c))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  e.respondWith(
    // { cache: 'no-store' } : sans cela, ce fetch « réseau » peut être servi
    // par le cache HTTP du navigateur ou du CDN plutôt que d'aller vraiment
    // au réseau, et mélanger une page à jour avec un script périmé (ou
    // l'inverse) — deux fichiers d'une même mise à jour se retrouvant sur des
    // versions différentes. Les noms de fichiers étant eux-mêmes versionnés
    // (voir index.html), ce filet n'intervient qu'en dernier recours.
    fetch(e.request, { cache: 'no-store' })
      .then((rep) => {
        const copie = rep.clone();
        caches.open(CACHE).then((c) => c.put(e.request, copie)).catch(() => {});
        return rep;
      })
      .catch(() => caches.match(e.request).then((r) => r || caches.match('./index.html'))),
  );
});
