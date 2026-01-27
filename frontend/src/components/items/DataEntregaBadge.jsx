import React from 'react';
import { calcularStatusEntrega } from './itemHelpers';

/**
 * Badge para exibir data de entrega com contagem regressiva
 */
const DataEntregaBadge = ({ dataEntrega, compact = false, todosEntregues = false }) => {
  const status = calcularStatusEntrega(dataEntrega, todosEntregues);
  if (!status) return null;
  
  if (compact) {
    return (
      <span style={{
        padding: '0.2rem 0.5rem',
        borderRadius: '4px',
        fontSize: '0.75rem',
        fontWeight: '600',
        background: status.bg,
        color: status.cor,
        border: `1px solid ${status.cor}`,
        whiteSpace: 'nowrap'
      }}>
        {status.entregue ? '✅ ' : status.atrasado ? '⚠️ ' : '📅 '}{status.dataFormatada}
        {status.entregue && ' ✓'}
        {status.atrasado && ` (-${status.dias}d)`}
        {!status.atrasado && !status.entregue && status.dias <= 3 && ` (${status.dias}d)`}
      </span>
    );
  }
  
  return (
    <div style={{
      display: 'inline-flex',
      alignItems: 'center',
      gap: '0.5rem',
      padding: '0.4rem 0.75rem',
      borderRadius: '8px',
      background: status.bg,
      border: `2px solid ${status.cor}`,
    }}>
      <span style={{ fontWeight: '600', color: status.cor }}>
        📅 {status.dataFormatada}
      </span>
      <span style={{
        padding: '0.15rem 0.5rem',
        borderRadius: '12px',
        fontSize: '0.8rem',
        fontWeight: '700',
        background: status.cor,
        color: 'white'
      }}>
        {status.atrasado ? `⚠️ ${status.texto}` : status.texto}
      </span>
    </div>
  );
};

export default DataEntregaBadge;
