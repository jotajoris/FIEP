// Service Worker para gerenciar cache e atualizações
const CACHE_VERSION = 'v1';
const CACHE_NAME = `on-licitacoes-${CACHE_VERSION}`;

// Arquivos que NÃO devem ser cacheados (sempre buscar do servidor)
const NO_CACHE = [
  '/index.html',
  '/',
  '/api/',
  '/manifest.json'
];

// Quando o SW é instalado
self.addEventListener('install', (event) => {
  console.log('[SW] Instalando nova versão...');
  // Ativa imediatamente sem esperar
  self.skipWaiting();
});

// Quando o SW é ativado
self.addEventListener('activate', (event) => {
  console.log('[SW] Ativando nova versão...');
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          // Remove caches antigos
          if (cacheName !== CACHE_NAME) {
            console.log('[SW] Removendo cache antigo:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    }).then(() => {
      // Assume controle de todas as abas imediatamente
      return self.clients.claim();
    })
  );
});

// Intercepta requisições
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  
  // Para requisições de API ou arquivos que não devem ser cacheados
  if (url.pathname.startsWith('/api/') || NO_CACHE.some(path => url.pathname === path || url.pathname.endsWith('.html'))) {
    event.respondWith(
      fetch(event.request).catch(() => caches.match(event.request))
    );
    return;
  }
  
  // Para outros arquivos (JS, CSS, imagens), usar estratégia network-first
  event.respondWith(
    fetch(event.request)
      .then((response) => {
        // Clone a resposta para armazenar no cache
        const responseClone = response.clone();
        caches.open(CACHE_NAME).then((cache) => {
          cache.put(event.request, responseClone);
        });
        return response;
      })
      .catch(() => {
        // Se falhar, tentar do cache
        return caches.match(event.request);
      })
  );
});

// Escuta mensagens para forçar atualização
self.addEventListener('message', (event) => {
  if (event.data === 'skipWaiting') {
    self.skipWaiting();
  }
});
