import React from 'react';

/**
 * Componente reutilizável para exibir resumo de busca com popup
 * Usado no Dashboard para busca por Código, Nome e Marca/Modelo
 */
const SearchSummaryPopup = ({ 
  resumo, 
  termo, 
  icon, 
  label, 
  onClose, 
  orders,
  getStatusEmoji 
}) => {
  if (!resumo) return null;

  return (
    <div style={{ 
      marginTop: '0.5rem', 
      padding: '0.75rem', 
      background: '#f8fafc', 
      borderRadius: '8px',
      border: '1px solid #94a3b8',
      fontSize: '0.8rem',
      position: 'absolute',
      zIndex: 100,
      minWidth: '380px',
      maxWidth: '480px',
      boxShadow: '0 4px 12px rgba(0,0,0,0.15)'
    }}>
      {/* Header */}
      <div style={{ 
        fontWeight: '700', 
        color: '#1e293b', 
        marginBottom: '0.5rem', 
        display: 'flex', 
        justifyContent: 'space-between', 
        alignItems: 'center' 
      }}>
        <span>{icon} {label}: &quot;{resumo.termoEncontrado || termo}&quot;</span>
        <button
          onClick={onClose}
          style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '1rem' }}
          data-testid="close-popup-btn"
        >×</button>
      </div>
      
      {/* Legenda dos emojis */}
      <div style={{ 
        display: 'flex', 
        gap: '0.5rem', 
        flexWrap: 'wrap',
        marginBottom: '0.5rem', 
        padding: '0.35rem', 
        background: '#e2e8f0', 
        borderRadius: '4px',
        fontSize: '0.65rem',
        color: '#475569'
      }}>
        <span>⏳Pend.</span>
        <span>💰Cot.</span>
        <span>🛒Comp.</span>
        <span>📦Sep.</span>
        <span style={{ color: '#94a3b8' }}>🚚Trâns.</span>
        <span style={{ color: '#94a3b8' }}>✅Entreg.</span>
      </div>
      
      {/* Seção: Pendentes */}
      {resumo.pendentes.length > 0 && (
        <div style={{ marginBottom: '0.75rem' }}>
          <div style={{ 
            fontWeight: '600', 
            color: '#166534', 
            fontSize: '0.75rem', 
            marginBottom: '0.25rem', 
            background: '#dcfce7', 
            padding: '0.25rem 0.5rem', 
            borderRadius: '4px' 
          }}>
            📋 PENDENTES ({resumo.totalPendentes} un)
          </div>
          <div style={{ maxHeight: '120px', overflowY: 'auto' }}>
            {resumo.pendentes.map((item, idx) => (
              <div key={idx} style={{ 
                display: 'flex', 
                justifyContent: 'space-between', 
                padding: '0.2rem 0',
                borderBottom: idx < resumo.pendentes.length - 1 ? '1px solid #e2e8f0' : 'none',
                alignItems: 'center'
              }}>
                <a 
                  href={`/po/${orders.find(o => o.numero_oc === item.numero_oc)?.id}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{ 
                    color: '#2563eb', 
                    textDecoration: 'none', 
                    display: 'flex', 
                    alignItems: 'center', 
                    gap: '0.25rem' 
                  }}
                  title="Abrir OC em nova guia"
                >
                  <span>{getStatusEmoji(item.status)}</span>
                  {item.numero_oc}
                  {item.codigo_item && <span style={{ color: '#64748b', fontSize: '0.7rem' }}>({item.codigo_item})</span>}
                  <span style={{ fontSize: '0.65rem' }}>↗</span>
                </a>
                <span style={{ fontWeight: '600', color: '#0369a1' }}>{item.quantidade} un</span>
              </div>
            ))}
          </div>
        </div>
      )}
      
      {/* Seção: Finalizados */}
      {resumo.finalizados.length > 0 && (
        <div style={{ marginBottom: '0.5rem' }}>
          <div style={{ 
            fontWeight: '600', 
            color: '#64748b', 
            fontSize: '0.75rem', 
            marginBottom: '0.25rem', 
            background: '#f1f5f9', 
            padding: '0.25rem 0.5rem', 
            borderRadius: '4px' 
          }}>
            ✅ FINALIZADOS ({resumo.totalFinalizados} un)
          </div>
          <div style={{ maxHeight: '80px', overflowY: 'auto', opacity: 0.7 }}>
            {resumo.finalizados.map((item, idx) => (
              <div key={idx} style={{ 
                display: 'flex', 
                justifyContent: 'space-between', 
                padding: '0.2rem 0',
                borderBottom: idx < resumo.finalizados.length - 1 ? '1px solid #e2e8f0' : 'none',
                alignItems: 'center'
              }}>
                <a 
                  href={`/po/${orders.find(o => o.numero_oc === item.numero_oc)?.id}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{ 
                    color: '#64748b', 
                    textDecoration: 'none', 
                    display: 'flex', 
                    alignItems: 'center', 
                    gap: '0.25rem' 
                  }}
                  title="Abrir OC em nova guia"
                >
                  <span>{getStatusEmoji(item.status)}</span>
                  {item.numero_oc}
                  {item.codigo_item && <span style={{ color: '#94a3b8', fontSize: '0.7rem' }}>({item.codigo_item})</span>}
                  <span style={{ fontSize: '0.65rem' }}>↗</span>
                </a>
                <span style={{ fontWeight: '600', color: '#64748b' }}>{item.quantidade} un</span>
              </div>
            ))}
          </div>
        </div>
      )}
      
      {/* Total geral */}
      <div style={{ 
        paddingTop: '0.5rem', 
        borderTop: '2px solid #94a3b8',
        display: 'flex',
        justifyContent: 'space-between',
        fontWeight: '700'
      }}>
        <span style={{ color: '#1e293b' }}>TOTAL GERAL:</span>
        <span style={{ color: '#dc2626', fontSize: '1rem' }}>
          {resumo.totalPendentes + resumo.totalFinalizados} un
        </span>
      </div>
    </div>
  );
};

export default SearchSummaryPopup;
