import React from 'react';
import { formatBRL } from '../../utils/api';

/**
 * Formulário para aplicar frete, rastreio e mudança de status em lote
 */
const FreteRastreioForm = ({
  poId,
  totalItens,
  itensSelecionados,
  freteTotal,
  codigoRastreio,
  novoStatus,
  aplicando,
  onToggleAll,
  onFreteChange,
  onRastreioChange,
  onStatusChange,
  onAplicar
}) => {
  const qtdSelecionados = itensSelecionados?.size || 0;
  const todosSelected = qtdSelecionados === totalItens;
  const fretePorItem = qtdSelecionados > 0 ? (parseFloat(freteTotal || 0) / qtdSelecionados) : 0;

  return (
    <div style={{ 
      marginBottom: '1rem', 
      padding: '1rem', 
      background: '#fef3c7', 
      borderRadius: '8px',
      border: '2px solid #f59e0b'
    }}>
      <h4 style={{ 
        margin: '0 0 0.75rem 0', 
        fontSize: '1rem', 
        fontWeight: '700', 
        color: '#92400e',
        display: 'flex',
        alignItems: 'center',
        gap: '0.5rem'
      }}>
        🚚 Frete, Rastreio e Status (Aplicar em Lote)
      </h4>
      
      <div style={{ display: 'flex', gap: '1rem', alignItems: 'center', flexWrap: 'wrap' }}>
        {/* Botão selecionar/desselecionar todos */}
        <button
          onClick={(e) => {
            e.stopPropagation();
            onToggleAll();
          }}
          style={{ 
            padding: '0.4rem 0.8rem',
            background: todosSelected ? '#f59e0b' : '#e2e8f0',
            color: todosSelected ? 'white' : '#374151',
            border: 'none',
            borderRadius: '6px',
            cursor: 'pointer',
            fontSize: '0.85rem',
            fontWeight: '600'
          }}
        >
          {todosSelected ? '☑️ Desmarcar Todos' : '☐ Selecionar Todos'}
        </button>
        
        {/* Contador de selecionados */}
        <span style={{ fontSize: '0.9rem', color: '#92400e', fontWeight: '600' }}>
          🚚 {qtdSelecionados} de {totalItens} itens selecionados
        </span>
      </div>
      
      {/* Campos de frete, rastreio, status e botão aplicar */}
      {qtdSelecionados > 0 && (
        <div style={{ 
          display: 'flex', 
          flexDirection: 'column',
          gap: '0.75rem', 
          marginTop: '0.75rem',
          padding: '0.75rem',
          background: 'white',
          borderRadius: '8px'
        }}>
          {/* Linha do Frete */}
          <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', flexWrap: 'wrap' }}>
            <label style={{ fontWeight: '600', color: '#374151', fontSize: '0.9rem', minWidth: '100px' }}>
              💰 Frete Total:
            </label>
            <input
              type="number"
              step="0.01"
              min="0"
              placeholder="R$ 0,00"
              value={freteTotal || ''}
              onChange={(e) => onFreteChange(e.target.value)}
              style={{
                padding: '0.5rem 0.75rem',
                border: '2px solid #f59e0b',
                borderRadius: '6px',
                fontSize: '1rem',
                fontWeight: '600',
                width: '120px'
              }}
              onClick={(e) => e.stopPropagation()}
            />
            {freteTotal > 0 && (
              <span style={{ color: '#6b7280', fontSize: '0.85rem' }}>
                ÷ {qtdSelecionados} = <strong style={{ color: '#166534' }}>{formatBRL(fretePorItem)}</strong>/item
              </span>
            )}
          </div>
          
          {/* Linha do Rastreio */}
          <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', flexWrap: 'wrap' }}>
            <label style={{ fontWeight: '600', color: '#374151', fontSize: '0.9rem', minWidth: '100px' }}>
              📦 Rastreio:
            </label>
            <input
              type="text"
              placeholder="AB123456789BR"
              value={codigoRastreio || ''}
              onChange={(e) => onRastreioChange(e.target.value.toUpperCase())}
              style={{
                padding: '0.5rem 0.75rem',
                border: '2px solid #3b82f6',
                borderRadius: '6px',
                fontSize: '1rem',
                fontWeight: '600',
                fontFamily: 'monospace',
                flex: 1,
                minWidth: '150px',
                maxWidth: '250px'
              }}
              onClick={(e) => e.stopPropagation()}
            />
          </div>
          
          {/* Linha do Status */}
          <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', flexWrap: 'wrap' }}>
            <label style={{ fontWeight: '600', color: '#374151', fontSize: '0.9rem', minWidth: '100px' }}>
              🔄 Mudar Status:
            </label>
            <select
              value={novoStatus || ''}
              onChange={(e) => onStatusChange(e.target.value)}
              onClick={(e) => e.stopPropagation()}
              style={{
                padding: '0.5rem 0.75rem',
                border: '2px solid #8b5cf6',
                borderRadius: '6px',
                fontSize: '0.95rem',
                fontWeight: '600',
                background: 'white',
                cursor: 'pointer',
                minWidth: '180px'
              }}
            >
              <option value="">-- Manter atual --</option>
              <option value="em_transito">🚚 Em Trânsito</option>
              <option value="entregue">✅ Entregue</option>
              <option value="comprado">🛒 Comprado</option>
            </select>
            {novoStatus === 'em_transito' && (
              <span style={{ fontSize: '0.8rem', color: '#7c3aed', fontWeight: '500' }}>
                ✨ Ideal para envio!
              </span>
            )}
          </div>
          
          {/* Botão único de aplicar */}
          <button
            onClick={(e) => {
              e.stopPropagation();
              onAplicar();
            }}
            disabled={aplicando}
            style={{
              padding: '0.75rem 1.5rem',
              background: aplicando ? '#9ca3af' : '#22c55e',
              color: 'white',
              border: 'none',
              borderRadius: '6px',
              fontWeight: '700',
              cursor: aplicando ? 'wait' : 'pointer',
              fontSize: '1rem',
              marginTop: '0.5rem'
            }}
          >
            {aplicando ? '⏳ Aplicando...' : `✅ Aplicar em ${qtdSelecionados} itens`}
          </button>
        </div>
      )}
    </div>
  );
};

export default FreteRastreioForm;
