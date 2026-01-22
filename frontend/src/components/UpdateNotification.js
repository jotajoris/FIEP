import { useEffect, useState } from 'react';

/**
 * Hook para gerenciar atualizações do app
 * Detecta quando há uma nova versão disponível e oferece opção de atualizar
 */
export const useAppUpdate = () => {
  const [updateAvailable, setUpdateAvailable] = useState(false);
  const [registration, setRegistration] = useState(null);

  useEffect(() => {
    // Registrar Service Worker
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js')
        .then((reg) => {
          console.log('[App] Service Worker registrado');
          setRegistration(reg);
          
          // Verificar atualizações periodicamente (a cada 5 minutos)
          setInterval(() => {
            reg.update();
          }, 5 * 60 * 1000);
          
          // Detectar quando há uma atualização esperando
          reg.addEventListener('updatefound', () => {
            const newWorker = reg.installing;
            newWorker.addEventListener('statechange', () => {
              if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
                // Nova versão disponível
                console.log('[App] Nova versão disponível!');
                setUpdateAvailable(true);
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
          window.location.reload();
        }
      });
    }
  }, []);

  const updateApp = () => {
    if (registration && registration.waiting) {
      // Enviar mensagem para o SW pular a espera
      registration.waiting.postMessage('skipWaiting');
    } else {
      // Se não tem SW waiting, fazer reload forçado
      window.location.reload(true);
    }
  };

  return { updateAvailable, updateApp };
};

/**
 * Componente que mostra um banner quando há atualização disponível
 */
export const UpdateNotification = () => {
  const { updateAvailable, updateApp } = useAppUpdate();

  if (!updateAvailable) return null;

  return (
    <div 
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        background: 'linear-gradient(135deg, #3b82f6 0%, #6366f1 100%)',
        color: 'white',
        padding: '12px 20px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '15px',
        zIndex: 99999,
        boxShadow: '0 4px 12px rgba(0,0,0,0.15)'
      }}
      data-testid="update-notification"
    >
      <span style={{ fontSize: '14px', fontWeight: '500' }}>
        🚀 Nova versão disponível!
      </span>
      <button
        onClick={updateApp}
        style={{
          background: 'white',
          color: '#3b82f6',
          border: 'none',
          borderRadius: '6px',
          padding: '6px 16px',
          fontSize: '13px',
          fontWeight: '600',
          cursor: 'pointer',
          transition: 'transform 0.2s'
        }}
        onMouseEnter={(e) => e.target.style.transform = 'scale(1.05)'}
        onMouseLeave={(e) => e.target.style.transform = 'scale(1)'}
        data-testid="update-button"
      >
        Atualizar Agora
      </button>
    </div>
  );
};

export default UpdateNotification;
