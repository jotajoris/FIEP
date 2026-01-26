import { useEffect } from 'react';

/**
 * Componente para gerenciar atualizações do app
 * Service Worker DESABILITADO temporariamente para evitar problemas de cache
 */
export const UpdateNotification = () => {
  useEffect(() => {
    // DESABILITAR Service Worker - estava causando problemas de cache
    if ('serviceWorker' in navigator) {
      // Desregistrar qualquer SW existente
      navigator.serviceWorker.getRegistrations().then((registrations) => {
        registrations.forEach((registration) => {
          registration.unregister();
          console.log('[App] Service Worker desregistrado');
        });
      });
    }
  }, []);

  return null;
};

export default UpdateNotification;
