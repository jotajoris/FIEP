import React, { memo } from 'react';

/**
 * Botão para alternar o status "Pronto para Despacho" de uma OC
 */
const ProntoDespachoToggle = memo(({
  poId,
  isPronto,
  isLoading,
  onToggle
}) => {
  return (
    <div style={{ 
      marginBottom: '1rem', 
      padding: '1rem', 
      background: isPronto ? '#dcfce7' : '#fef3c7', 
      borderRadius: '8px',
      border: `2px solid ${isPronto ? '#22c55e' : '#f59e0b'}`,
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center'
    }}>
      <div>
        <h4 style={{ 
          margin: '0 0 0.25rem 0', 
          fontSize: '1rem', 
          fontWeight: '700', 
          color: isPronto ? '#166534' : '#92400e'
        }}>
          {isPronto ? '✅ OC Pronta para Despacho' : '⏳ OC em Preparação'}
        </h4>
        <p style={{ 
          margin: 0, 
          fontSize: '0.85rem', 
          color: isPronto ? '#15803d' : '#a16207' 
        }}>
          {isPronto 
            ? 'Esta OC será priorizada na listagem para facilitar o envio.' 
            : 'Marque como pronta quando todos os itens estiverem preparados.'}
        </p>
      </div>
      
      <button
        onClick={(e) => {
          e.stopPropagation();
          onToggle();
        }}
        disabled={isLoading}
        style={{
          padding: '0.75rem 1.5rem',
          background: isLoading ? '#9ca3af' : isPronto ? '#dc2626' : '#22c55e',
          color: 'white',
          border: 'none',
          borderRadius: '8px',
          fontWeight: '700',
          cursor: isLoading ? 'wait' : 'pointer',
          fontSize: '0.95rem',
          display: 'flex',
          alignItems: 'center',
          gap: '0.5rem'
        }}
      >
        {isLoading ? (
          '⏳ Atualizando...'
        ) : isPronto ? (
          <>❌ Desmarcar Pronto</>
        ) : (
          <>✅ Marcar como Pronto</>
        )}
      </button>
    </div>
  );
});

ProntoDespachoToggle.displayName = 'ProntoDespachoToggle';

export default ProntoDespachoToggle;
