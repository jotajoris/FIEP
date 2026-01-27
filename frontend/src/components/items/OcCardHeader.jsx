import React, { memo } from 'react';
import { Link } from 'react-router-dom';
import DataEntregaBadge from './DataEntregaBadge';

/**
 * Header do Card de OC - Exibe informações resumidas da OC
 */
const OcCardHeader = memo(({
  oc,
  isExpanded,
  onToggle
}) => {
  return (
    <div 
      onClick={onToggle}
      style={{ 
        display: 'flex', 
        justifyContent: 'space-between', 
        alignItems: 'center',
        cursor: 'pointer',
        padding: '0.5rem'
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
        {/* Indicador de status circular */}
        <div style={{ 
          width: '50px', 
          height: '50px', 
          borderRadius: '50%', 
          background: oc.prontoParaDespacho ? '#22c55e' : '#f59e0b',
          color: 'white',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontWeight: '700',
          fontSize: '0.75rem',
          textAlign: 'center',
          lineHeight: '1.1'
        }}>
          {oc.prontoParaEnvio ? '✓' : oc.totalItens}
        </div>
        
        <div>
          {/* Título e badges */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.25rem', flexWrap: 'wrap' }}>
            <h3 style={{ fontSize: '1.2rem', fontWeight: '700', margin: 0, color: '#1f2937' }}>
              {oc.numero_oc}
            </h3>
            {/* Data de Entrega com contagem regressiva */}
            {oc.data_entrega && <DataEntregaBadge dataEntrega={oc.data_entrega} compact={true} />}
            {/* Badge de Status */}
            {oc.prontoParaEnvio ? (
              <span style={{ 
                background: '#22c55e', 
                color: 'white', 
                padding: '0.2rem 0.6rem', 
                borderRadius: '12px',
                fontSize: '0.75rem',
                fontWeight: '600'
              }}>
                ✅ PRONTO PARA ENVIO
              </span>
            ) : oc.temNFFornecedor ? (
              <span style={{ 
                background: '#3b82f6', 
                color: 'white', 
                padding: '0.2rem 0.6rem', 
                borderRadius: '12px',
                fontSize: '0.75rem',
                fontWeight: '600'
              }}>
                📦 NF FORNECEDOR
              </span>
            ) : null}
          </div>
          
          {/* Endereço de Entrega */}
          {oc.endereco_entrega && (
            <div style={{ 
              display: 'flex', 
              alignItems: 'flex-start', 
              gap: '0.5rem', 
              marginBottom: '0.5rem',
              fontSize: '0.85rem',
              background: '#f0f9ff',
              padding: '0.4rem 0.6rem',
              borderRadius: '6px',
              border: '1px solid #bae6fd',
              maxWidth: '400px'
            }}>
              <span style={{ color: '#0369a1', fontWeight: '600' }}>📍</span>
              <span style={{ color: '#0c4a6e', overflow: 'hidden', textOverflow: 'ellipsis' }}>{oc.endereco_entrega}</span>
            </div>
          )}
          
          {/* Status de NFs */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', fontSize: '0.85rem' }}>
            {/* NF Fornecedor */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <span style={{ 
                color: oc.todosFornecedor ? '#22c55e' : oc.temNFFornecedor ? '#3b82f6' : '#9ca3af',
                fontWeight: '600'
              }}>
                📦 NF Fornecedor:
              </span>
              {oc.itensComNFFornecedor > 0 ? (
                <>
                  <span style={{ color: '#22c55e', fontWeight: '700' }}>
                    {oc.itensComNFFornecedor} de {oc.totalItens}
                  </span>
                  {oc.itensRestantesFornecedor > 0 && (
                    <span style={{ color: '#f59e0b', fontSize: '0.8rem' }}>
                      (falta {oc.itensRestantesFornecedor})
                    </span>
                  )}
                  {oc.todosFornecedor && (
                    <span style={{ color: '#22c55e' }}>✓</span>
                  )}
                </>
              ) : (
                <span style={{ color: '#9ca3af' }}>Nenhuma</span>
              )}
            </div>
            
            {/* NF Venda (ON) */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <span style={{ 
                color: oc.temNFVenda ? '#22c55e' : '#9ca3af',
                fontWeight: '600'
              }}>
                🏢 NF Venda (ON):
              </span>
              {oc.notas_fiscais_venda && oc.notas_fiscais_venda.length > 0 ? (
                <>
                  <span style={{ color: '#22c55e', fontWeight: '700' }}>
                    {oc.itensProntos} de {oc.totalItens}
                  </span>
                  {oc.itensRestantes > 0 && (
                    <span style={{ color: '#f59e0b', fontSize: '0.8rem' }}>
                      (falta {oc.itensRestantes})
                    </span>
                  )}
                  <span style={{ color: '#22c55e' }}>✓ {oc.notas_fiscais_venda.length} NF(s)</span>
                </>
              ) : (
                <span style={{ color: '#9ca3af' }}>Nenhuma</span>
              )}
            </div>
          </div>
        </div>
      </div>
      
      <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
        <Link 
          to={`/po/${oc.po_id}`}
          onClick={(e) => e.stopPropagation()}
          style={{ 
            fontSize: '0.85rem', 
            color: '#667eea', 
            textDecoration: 'underline'
          }}
        >
          Ver OC Completa
        </Link>
        <div style={{ fontSize: '1.5rem', color: '#6b7280' }}>
          {isExpanded ? '▲' : '▼'}
        </div>
      </div>
    </div>
  );
});

OcCardHeader.displayName = 'OcCardHeader';

export default OcCardHeader;
