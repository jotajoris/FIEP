/**
 * OCCard - Componente de card para OC agrupada
 * Mostra informações da OC e seus itens
 */
import React from 'react';
import { Link } from 'react-router-dom';
import { formatBRL } from '../../utils/api';

const OCCard = ({
  oc,
  isExpanded,
  onToggleExpand,
  prontoDespacho,
  onToggleProntoDespacho,
  children,
  isAdmin
}) => {
  // Calcular totais
  const totalItens = oc.items?.length || 0;
  const valorTotal = oc.items?.reduce((sum, item) => {
    const preco = item.preco || 0;
    const qtd = item.quantidade || 1;
    return sum + (preco * qtd);
  }, 0) || 0;

  // Calcular status de entrega
  const calcularStatusEntrega = () => {
    if (!oc.data_entrega) return null;
    
    try {
      const hoje = new Date();
      hoje.setHours(0, 0, 0, 0);
      
      const entrega = new Date(oc.data_entrega + 'T00:00:00');
      const diffTime = entrega.getTime() - hoje.getTime();
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
      
      const dataFormatada = entrega.toLocaleDateString('pt-BR');
      
      if (diffDays < 0) {
        return { atrasado: true, dias: Math.abs(diffDays), dataFormatada, cor: '#dc2626', bg: '#fef2f2' };
      } else if (diffDays === 0) {
        return { texto: 'HOJE', dataFormatada, cor: '#f59e0b', bg: '#fffbeb' };
      } else if (diffDays <= 3) {
        return { dias: diffDays, dataFormatada, cor: '#f59e0b', bg: '#fffbeb' };
      } else if (diffDays <= 7) {
        return { dias: diffDays, dataFormatada, cor: '#3b82f6', bg: '#eff6ff' };
      } else {
        return { dias: diffDays, dataFormatada, cor: '#22c55e', bg: '#f0fdf4' };
      }
    } catch (e) {
      return null;
    }
  };

  const statusEntrega = calcularStatusEntrega();

  return (
    <div 
      style={{ 
        background: prontoDespacho ? '#dcfce7' : 'white', 
        borderRadius: '12px', 
        padding: '1.25rem',
        marginBottom: '1rem',
        boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
        border: prontoDespacho ? '2px solid #22c55e' : '1px solid #e5e7eb'
      }}
      data-testid={`oc-card-${oc.numero_oc}`}
    >
      {/* Header da OC */}
      <div style={{ 
        display: 'flex', 
        justifyContent: 'space-between', 
        alignItems: 'flex-start',
        marginBottom: '1rem'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          {/* Badge com quantidade de itens */}
          <div style={{
            background: '#6366f1',
            color: 'white',
            borderRadius: '50%',
            width: '40px',
            height: '40px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontWeight: 'bold',
            fontSize: '1rem'
          }}>
            {totalItens}
          </div>
          
          <div>
            <h3 style={{ margin: 0, fontSize: '1.25rem', color: '#1f2937' }}>
              {oc.numero_oc}
              {prontoDespacho && (
                <span style={{ 
                  marginLeft: '0.5rem',
                  background: '#22c55e',
                  color: 'white',
                  padding: '0.2rem 0.5rem',
                  borderRadius: '4px',
                  fontSize: '0.7rem',
                  fontWeight: 'normal'
                }}>
                  ✅ PRONTO PARA DESPACHO
                </span>
              )}
            </h3>
            
            {/* Status de entrega */}
            {statusEntrega && (
              <div style={{ 
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.25rem',
                marginTop: '0.25rem',
                padding: '0.2rem 0.5rem',
                borderRadius: '4px',
                fontSize: '0.75rem',
                background: statusEntrega.bg,
                color: statusEntrega.cor
              }}>
                {statusEntrega.atrasado ? (
                  <>⚠️ {statusEntrega.dias}d atrasado</>
                ) : statusEntrega.texto ? (
                  <>⏰ {statusEntrega.texto}</>
                ) : (
                  <>{statusEntrega.dataFormatada} (-{statusEntrega.dias}d)</>
                )}
              </div>
            )}
          </div>
        </div>
        
        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
          {/* Botão pronto despacho (apenas admin) */}
          {isAdmin && onToggleProntoDespacho && (
            <button
              onClick={() => onToggleProntoDespacho(oc.id)}
              style={{
                background: prontoDespacho ? '#dc2626' : '#22c55e',
                color: 'white',
                border: 'none',
                padding: '0.4rem 0.8rem',
                borderRadius: '6px',
                cursor: 'pointer',
                fontSize: '0.75rem'
              }}
              data-testid={`toggle-pronto-${oc.numero_oc}`}
            >
              {prontoDespacho ? '❌ Desmarcar' : '✅ Pronto'}
            </button>
          )}
          
          <Link 
            to={`/po/${oc.id}`}
            style={{ 
              color: '#6366f1', 
              textDecoration: 'none',
              fontSize: '0.85rem',
              padding: '0.4rem 0.8rem',
              border: '1px solid #6366f1',
              borderRadius: '6px'
            }}
          >
            Ver OC Completa
          </Link>
          
          <button
            onClick={() => onToggleExpand(oc.id)}
            style={{
              background: isExpanded ? '#6366f1' : '#e5e7eb',
              color: isExpanded ? 'white' : '#374151',
              border: 'none',
              padding: '0.4rem 0.8rem',
              borderRadius: '6px',
              cursor: 'pointer',
              fontSize: '0.85rem'
            }}
            data-testid={`expand-oc-${oc.numero_oc}`}
          >
            {isExpanded ? '▼ Recolher' : '▶ Expandir'}
          </button>
        </div>
      </div>
      
      {/* Endereço de entrega */}
      {oc.endereco_entrega && (
        <div style={{ 
          fontSize: '0.85rem', 
          color: '#6b7280',
          marginBottom: '0.75rem',
          display: 'flex',
          alignItems: 'flex-start',
          gap: '0.25rem'
        }}>
          <span>📍</span>
          <span>{oc.endereco_entrega}</span>
        </div>
      )}
      
      {/* Info resumida de NFs */}
      <div style={{ 
        display: 'flex', 
        gap: '1rem', 
        fontSize: '0.8rem', 
        color: '#6b7280',
        marginBottom: isExpanded ? '1rem' : 0
      }}>
        <span>📄 NF Fornecedor: {oc.nf_fornecedor_count || 'Nenhuma'}</span>
        <span>📋 NF Venda (ON): {oc.nf_venda_count || 0} de {totalItens}</span>
        {oc.nf_venda_count === totalItens && totalItens > 0 && (
          <span style={{ color: '#22c55e' }}>✓ {totalItens} NF(s)</span>
        )}
      </div>
      
      {/* Conteúdo expandido (itens) */}
      {isExpanded && children}
    </div>
  );
};

export default OCCard;
