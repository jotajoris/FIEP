/**
 * ItemFilters - Componente de filtros para a página de itens
 * Extraído de ItemsByStatus.js
 */
import React from 'react';

const ItemFilters = ({
  showOnlyMine,
  setShowOnlyMine,
  filterFornecedor,
  setFilterFornecedor,
  filterResponsavel,
  setFilterResponsavel,
  searchCodigo,
  setSearchCodigo,
  searchOC,
  setSearchOC,
  searchDescricao,
  setSearchDescricao,
  searchMarca,
  setSearchMarca,
  searchLink,
  setSearchLink,
  fornecedoresUnicos,
  responsaveisUnicos,
  clearFilters,
  hasActiveFilters,
  isAdmin
}) => {
  return (
    <div style={{ 
      background: '#f8f9fa', 
      padding: '1rem', 
      borderRadius: '8px', 
      marginBottom: '1.5rem',
      border: '1px solid #e9ecef'
    }}>
      {/* Linha 1: Campos de busca */}
      <div style={{ 
        display: 'flex', 
        gap: '1rem', 
        flexWrap: 'wrap', 
        marginBottom: '1rem' 
      }}>
        <div style={{ flex: '1', minWidth: '150px' }}>
          <label style={{ display: 'block', marginBottom: '0.25rem', fontSize: '0.8rem', color: '#666' }}>
            🔍 Pesquisar Código do Item:
          </label>
          <input
            type="text"
            placeholder="Digite o código..."
            value={searchCodigo}
            onChange={(e) => setSearchCodigo(e.target.value)}
            className="form-input"
            style={{ width: '100%' }}
            data-testid="filter-codigo"
          />
        </div>
        
        <div style={{ flex: '1', minWidth: '150px' }}>
          <label style={{ display: 'block', marginBottom: '0.25rem', fontSize: '0.8rem', color: '#666' }}>
            📋 Pesquisar OC:
          </label>
          <input
            type="text"
            placeholder="Digite o número da OC..."
            value={searchOC}
            onChange={(e) => setSearchOC(e.target.value)}
            className="form-input"
            style={{ width: '100%' }}
            data-testid="filter-oc"
          />
        </div>
        
        <div style={{ flex: '1', minWidth: '150px' }}>
          <label style={{ display: 'block', marginBottom: '0.25rem', fontSize: '0.8rem', color: '#666' }}>
            📦 Pesquisar Nome do Item:
          </label>
          <input
            type="text"
            placeholder="Digite o nome/descrição..."
            value={searchDescricao}
            onChange={(e) => setSearchDescricao(e.target.value)}
            className="form-input"
            style={{ width: '100%' }}
            data-testid="filter-descricao"
          />
        </div>
        
        <div style={{ flex: '1', minWidth: '150px' }}>
          <label style={{ display: 'block', marginBottom: '0.25rem', fontSize: '0.8rem', color: '#666' }}>
            🏷️ Pesquisar Marca:
          </label>
          <input
            type="text"
            placeholder="Digite a marca..."
            value={searchMarca}
            onChange={(e) => setSearchMarca(e.target.value)}
            className="form-input"
            style={{ width: '100%' }}
            data-testid="filter-marca"
          />
        </div>
        
        <div style={{ flex: '1', minWidth: '150px' }}>
          <label style={{ display: 'block', marginBottom: '0.25rem', fontSize: '0.8rem', color: '#666' }}>
            🔗 Pesquisar Link:
          </label>
          <input
            type="text"
            placeholder="Digite parte do link..."
            value={searchLink}
            onChange={(e) => setSearchLink(e.target.value)}
            className="form-input"
            style={{ width: '100%' }}
            data-testid="filter-link"
          />
        </div>
      </div>
      
      {/* Linha 2: Filtros de seleção */}
      <div style={{ 
        display: 'flex', 
        gap: '1rem', 
        flexWrap: 'wrap', 
        alignItems: 'center' 
      }}>
        <div>
          <label style={{ display: 'block', marginBottom: '0.25rem', fontSize: '0.8rem', color: '#666' }}>
            👤 Responsável:
          </label>
          <select
            value={filterResponsavel}
            onChange={(e) => setFilterResponsavel(e.target.value)}
            className="form-input"
            style={{ minWidth: '150px' }}
            data-testid="filter-responsavel"
          >
            <option value="todos">TODOS</option>
            {responsaveisUnicos.map(resp => (
              <option key={resp} value={resp}>{resp}</option>
            ))}
          </select>
        </div>
        
        <div>
          <label style={{ display: 'block', marginBottom: '0.25rem', fontSize: '0.8rem', color: '#666' }}>
            🏪 Fornecedor:
          </label>
          <select
            value={filterFornecedor}
            onChange={(e) => setFilterFornecedor(e.target.value)}
            className="form-input"
            style={{ minWidth: '150px' }}
            data-testid="filter-fornecedor"
          >
            <option value="todos">TODOS</option>
            {fornecedoresUnicos.map(forn => (
              <option key={forn} value={forn}>{forn}</option>
            ))}
          </select>
        </div>
        
        {!isAdmin && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <input
              type="checkbox"
              id="showOnlyMine"
              checked={showOnlyMine}
              onChange={(e) => setShowOnlyMine(e.target.checked)}
              data-testid="filter-only-mine"
            />
            <label htmlFor="showOnlyMine" style={{ fontSize: '0.9rem', cursor: 'pointer' }}>
              👤 Mostrar apenas meus itens
            </label>
          </div>
        )}
        
        {hasActiveFilters && (
          <button
            onClick={clearFilters}
            style={{
              background: '#dc3545',
              color: 'white',
              border: 'none',
              padding: '0.5rem 1rem',
              borderRadius: '4px',
              cursor: 'pointer',
              fontSize: '0.85rem'
            }}
            data-testid="clear-filters-btn"
          >
            ✕ Limpar Filtros
          </button>
        )}
      </div>
    </div>
  );
};

export default ItemFilters;
