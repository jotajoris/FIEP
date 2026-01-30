import React, { memo } from 'react';

/**
 * Formulário para mudar status de múltiplos itens em massa
 */
const MudarStatusForm = memo(({
  poId,
  numeroOC,
  totalItens,
  itensSelecionados,
  statusAtual,
  novoStatus,
  aplicando,
  onToggleAll,
  onStatusChange,
  onAplicar
}) => {
  const qtdSelecionados = itensSelecionados?.size || 0;
  const todosSelected = qtdSelecionados === totalItens;

  const statusOptions = [
    { value: 'pendente', label: 'Pendente' },
    { value: 'cotado', label: 'Cotado' },
    { value: 'comprado', label: 'Comprado' },
    { value: 'em_separacao', label: 'Em Separação' },
    { value: 'pronto_envio', label: 'Pronto p/ Envio' },
    { value: 'em_transito', label: 'Em Trânsito' },
    { value: 'entregue', label: 'Entregue' }
  ].filter(opt => opt.value !== statusAtual);

  return (
    <div style={{ 
      marginBottom: '1rem', 
      padding: '1rem', 
      background: '#ede9fe', 
      borderRadius: '8px',
      border: '2px solid #8b5cf6'
    }}>
      <h4 style={{ 
        margin: '0 0 0.75rem 0', 
        fontSize: '1rem', 
        fontWeight: '700', 
        color: '#5b21b6',
        display: 'flex',
        alignItems: 'center',
        gap: '0.5rem'
      }}>
        🔄 Mudar Status dos Itens Selecionados
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
            background: todosSelected ? '#8b5cf6' : '#e2e8f0',
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
        <span style={{ fontSize: '0.9rem', color: '#5b21b6', fontWeight: '600' }}>
          🔄 {qtdSelecionados} de {totalItens} itens selecionados
        </span>
      </div>
      
      {/* Seletor de status e botão aplicar */}
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
            Novo Status:
          </label>
          <select
            value={novoStatus || ''}
            onChange={(e) => onStatusChange(e.target.value)}
            onClick={(e) => e.stopPropagation()}
            style={{
              padding: '0.5rem 0.75rem',
              border: '2px solid #8b5cf6',
              borderRadius: '6px',
              fontSize: '0.9rem',
              fontWeight: '600',
              minWidth: '150px'
            }}
          >
            <option value="">Selecione...</option>
            {statusOptions.map(opt => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
          
          <button
            onClick={(e) => {
              e.stopPropagation();
              onAplicar();
            }}
            disabled={!novoStatus || aplicando}
            style={{
              padding: '0.5rem 1rem',
              background: !novoStatus || aplicando ? '#9ca3af' : '#8b5cf6',
              color: 'white',
              border: 'none',
              borderRadius: '6px',
              fontWeight: '700',
              cursor: !novoStatus || aplicando ? 'not-allowed' : 'pointer',
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

MudarStatusForm.displayName = 'MudarStatusForm';

export default MudarStatusForm;
