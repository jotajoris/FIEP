import React, { memo, useState } from 'react';

/**
 * Formulário para adicionar/editar código de rastreio em lote
 * Usado na página "Em Trânsito" para atualizar rastreios
 */
const RastreioLoteForm = memo(({
  poId,
  totalItens,
  itensSelecionados,
  codigoRastreio,
  aplicando,
  onToggleAll,
  onRastreioChange,
  onAplicar,
  modo = 'adicionar' // 'adicionar' ou 'atualizar'
}) => {
  const qtdSelecionados = itensSelecionados?.size || 0;
  const todosSelected = qtdSelecionados === totalItens;

  const titulo = modo === 'atualizar' 
    ? '📦 Atualizar Código de Rastreio' 
    : '📦 Adicionar Código de Rastreio';

  const corPrimaria = modo === 'atualizar' ? '#8b5cf6' : '#3b82f6';
  const corFundo = modo === 'atualizar' ? '#f5f3ff' : '#eff6ff';
  const corBorda = modo === 'atualizar' ? '#c4b5fd' : '#93c5fd';

  return (
    <div style={{ 
      marginBottom: '1rem', 
      padding: '1rem', 
      background: corFundo, 
      borderRadius: '8px',
      border: `2px solid ${corBorda}`
    }}>
      <h4 style={{ 
        margin: '0 0 0.75rem 0', 
        fontSize: '1rem', 
        fontWeight: '700', 
        color: corPrimaria,
        display: 'flex',
        alignItems: 'center',
        gap: '0.5rem'
      }}>
        {titulo}
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
            background: todosSelected ? corPrimaria : '#e2e8f0',
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
        <span style={{ fontSize: '0.9rem', color: corPrimaria, fontWeight: '600' }}>
          📦 {qtdSelecionados} de {totalItens} itens selecionados
        </span>
      </div>
      
      {/* Campo de código e botão aplicar */}
      {qtdSelecionados > 0 && (
        <div style={{ 
          display: 'flex', 
          gap: '0.75rem', 
          marginTop: '0.75rem',
          alignItems: 'center',
          flexWrap: 'wrap',
          padding: '0.75rem',
          background: 'white',
          borderRadius: '8px'
        }}>
          <label style={{ fontWeight: '600', color: '#374151', fontSize: '0.9rem' }}>
            Código:
          </label>
          <input
            type="text"
            placeholder="AB123456789BR"
            value={codigoRastreio || ''}
            onChange={(e) => onRastreioChange(e.target.value.toUpperCase())}
            style={{
              padding: '0.5rem 0.75rem',
              border: `2px solid ${corPrimaria}`,
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
          
          <button
            onClick={(e) => {
              e.stopPropagation();
              onAplicar();
            }}
            disabled={!codigoRastreio?.trim() || aplicando}
            style={{
              padding: '0.5rem 1rem',
              background: !codigoRastreio?.trim() || aplicando ? '#9ca3af' : '#22c55e',
              color: 'white',
              border: 'none',
              borderRadius: '6px',
              fontWeight: '700',
              cursor: !codigoRastreio?.trim() || aplicando ? 'not-allowed' : 'pointer',
              fontSize: '0.9rem'
            }}
          >
            {aplicando ? '⏳ Aplicando...' : `✓ Aplicar em ${qtdSelecionados} itens`}
          </button>
        </div>
      )}
    </div>
  );
});

RastreioLoteForm.displayName = 'RastreioLoteForm';

export default RastreioLoteForm;
