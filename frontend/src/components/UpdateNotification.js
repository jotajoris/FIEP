import { useEffect } from 'react';

/**
 * Componente que gerencia atualizações automáticas do app
 * Detecta quando há uma nova versão e recarrega automaticamente
 */
export const UpdateNotification = () => {
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;

    navigator.serviceWorker.register('/sw.js')
      .then((reg) => {
        console.log('[App] Service Worker registrado');
        
        // Verificar atualizações periodicamente (a cada 1 minuto)
        setInterval(() => {
          reg.update();
        }, 60 * 1000);
        
        // Detectar quando há uma atualização esperando
        reg.addEventListener('updatefound', () => {
          const newWorker = reg.installing;
          newWorker.addEventListener('statechange', () => {
            if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
              // Nova versão disponível - atualizar AUTOMATICAMENTE
              console.log('[App] Nova versão detectada! Atualizando automaticamente...');
              newWorker.postMessage('skipWaiting');
            }
          });
        });
      })
      .catch((err) => {
        console.log('[App] Erro ao registrar Service Worker:', err);
      });

    // Recarregar quando o SW assume controle
    let refreshing = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (!refreshing) {
        refreshing = true;
        console.log('[App] Recarregando para nova versão...');
        window.location.reload();
      }
    });
  }, []);

  // Não renderiza nada - atualização é automática
  return null;
};

export default UpdateNotification;
