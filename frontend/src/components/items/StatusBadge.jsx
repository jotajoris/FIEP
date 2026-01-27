import React from 'react';
import { statusColors, statusLabels } from './itemHelpers';

/**
 * Badge que exibe o status de um item com cor correspondente
 */
const StatusBadge = ({ status, size = 'normal' }) => {
  const colors = statusColors[status] || { bg: '#e2e8f0', color: '#475569' };
  const label = statusLabels[status] || status;
  
  const isSmall = size === 'small';
  
  return (
    <span style={{
      padding: isSmall ? '0.2rem 0.5rem' : '0.35rem 0.75rem',
      borderRadius: '9999px',
      fontSize: isSmall ? '0.7rem' : '0.75rem',
      fontWeight: '600',
      background: colors.bg,
      color: colors.color,
      whiteSpace: 'nowrap'
    }}>
      {label}
    </span>
  );
};

/**
 * Badge para exibir disponibilidade em estoque
 */
export const EstoqueBadge = ({ quantidade, show = true }) => {
  if (!show || !quantidade || quantidade <= 0) return null;
  
  return (
    <span style={{
      display: 'inline-flex',
      alignItems: 'center',
      gap: '0.25rem',
      padding: '0.2rem 0.5rem',
      background: '#dcfce7',
      color: '#166534',
      borderRadius: '4px',
      fontSize: '0.75rem',
      fontWeight: '600',
      border: '1px solid #86efac'
    }}>
      📦 {quantidade} em estoque
    </span>
  );
};

/**
 * Badge para indicar item "Pronto para Despacho"
 */
export const DespachoReadyBadge = ({ isReady }) => {
  if (!isReady) return null;
  
  return (
    <span style={{
      display: 'inline-flex',
      alignItems: 'center',
      gap: '0.25rem',
      padding: '0.25rem 0.6rem',
      background: '#22c55e',
      color: 'white',
      borderRadius: '6px',
      fontSize: '0.75rem',
      fontWeight: '700'
    }}>
      ✅ Pronto p/ Despacho
    </span>
  );
};

/**
 * Badge de NF Emitida
 */
export const NFEmitidaBadge = ({ isEmitida, onClick }) => {
  return (
    <button
      onClick={onClick}
      style={{
        padding: '0.2rem 0.5rem',
        borderRadius: '4px',
        fontSize: '0.75rem',
        fontWeight: '600',
        border: 'none',
        cursor: 'pointer',
        background: isEmitida ? '#dcfce7' : '#fef2f2',
        color: isEmitida ? '#166534' : '#dc2626'
      }}
    >
      {isEmitida ? '✅ NF Emitida' : '❌ NF Pendente'}
    </button>
  );
};

export default StatusBadge;
