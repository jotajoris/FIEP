import React from 'react';

/**
 * Componente de filtros para a página de itens
 */
const ItemFilters = ({
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
  filterResponsavel,
  setFilterResponsavel,
  filterFornecedor,
  setFilterFornecedor,
  responsaveisDisponiveis = [],
  fornecedoresDisponiveis = [],
  isAdmin,
  displayItemsCount,
  onClearFilters
}) => {
  const hasActiveFilters = filterFornecedor !== 'todos' || 
    filterResponsavel !== 'todos' || 
    searchCodigo?.trim() || 
    searchOC?.trim() || 
    searchDescricao?.trim() || 
    searchMarca?.trim() || 
    searchLink?.trim();

  return (
    <div style={{ 
      marginBottom: '1.5rem', 
      padding: '1rem', 
      background: '#f7fafc', 
      borderRadius: '8px',
      border: '1px solid #e2e8f0'
    }}>
      {/* Campos de Pesquisa */}
      <div style={{ 
        display: 'grid', 
        gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', 
        gap: '1rem',
        marginBottom: '1rem'
      }}>
        <div>
          <label style={{ fontWeight: '600', color: '#4a5568', fontSize: '0.85rem', display: 'block', marginBottom: '0.5rem' }}>
            🔍 Pesquisar Código do Item:
          </label>
          <input
            type="text"
            value={searchCodigo}
            onChange={(e) => setSearchCodigo(e.target.value)}
            placeholder="Digite o código..."
            className="form-input"
            style={{ width: '100%', padding: '0.5rem 1rem' }}
            data-testid="search-codigo"
          />
        </div>
        <div>
          <label style={{ fontWeight: '600', color: '#4a5568', fontSize: '0.85rem', display: 'block', marginBottom: '0.5rem' }}>
            📋 Pesquisar OC:
          </label>
          <input
            type="text"
            value={searchOC}
            onChange={(e) => setSearchOC(e.target.value)}
            placeholder="Digite o número da OC..."
            className="form-input"
            style={{ width: '100%', padding: '0.5rem 1rem' }}
            data-testid="search-oc"
          />
        </div>
        <div>
          <label style={{ fontWeight: '600', color: '#4a5568', fontSize: '0.85rem', display: 'block', marginBottom: '0.5rem' }}>
            📦 Pesquisar Nome do Item:
          </label>
          <input
            type="text"
            value={searchDescricao}
            onChange={(e) => setSearchDescricao(e.target.value)}
            placeholder="Digite o nome/descrição..."
            className="form-input"
            style={{ width: '100%', padding: '0.5rem 1rem' }}
            data-testid="search-descricao"
          />
        </div>
        <div>
          <label style={{ fontWeight: '600', color: '#4a5568', fontSize: '0.85rem', display: 'block', marginBottom: '0.5rem' }}>
            🏷️ Pesquisar Marca:
          </label>
          <input
            type="text"
            value={searchMarca}
            onChange={(e) => setSearchMarca(e.target.value)}
            placeholder="Digite a marca..."
            className="form-input"
            style={{ width: '100%', padding: '0.5rem 1rem' }}
            data-testid="search-marca"
          />
        </div>
        <div>
          <label style={{ fontWeight: '600', color: '#4a5568', fontSize: '0.85rem', display: 'block', marginBottom: '0.5rem' }}>
            🔗 Pesquisar Link:
          </label>
          <input
            type="text"
            value={searchLink}
            onChange={(e) => setSearchLink(e.target.value)}
            placeholder="Digite parte do link..."
            className="form-input"
            style={{ width: '100%', padding: '0.5rem 1rem' }}
            data-testid="search-link"
          />
        </div>
      </div>

      {/* Filtros por Select */}
      <div style={{ 
        display: 'flex', 
        alignItems: 'center', 
        gap: '1.5rem',
        flexWrap: 'wrap'
      }}>
        {/* Filtro por Responsável */}
        {responsaveisDisponiveis.length > 0 && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <label style={{ fontWeight: '600', color: '#4a5568', fontSize: '0.85rem' }}>
              👤 Responsável:
            </label>
            <select
              value={filterResponsavel}
              onChange={(e) => setFilterResponsavel(e.target.value)}
              className="form-input"
              style={{ minWidth: '180px', padding: '0.5rem 1rem' }}
              data-testid="filter-responsavel"
            >
              <option value="todos">TODOS</option>
              <option value="nao_atribuido">⚠️ Não Atribuído</option>
              {responsaveisDisponiveis.map(responsavel => (
                <option key={responsavel} value={responsavel}>{responsavel}</option>
              ))}
            </select>
          </div>
        )}

        {/* Filtro por Fornecedor - apenas admin */}
        {isAdmin && fornecedoresDisponiveis.length > 0 && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <label style={{ fontWeight: '600', color: '#4a5568', fontSize: '0.85rem' }}>
              🏪 Fornecedor:
            </label>
            <select
              value={filterFornecedor}
              onChange={(e) => setFilterFornecedor(e.target.value)}
              className="form-input"
              style={{ minWidth: '180px', padding: '0.5rem 1rem' }}
              data-testid="filter-fornecedor"
            >
              <option value="todos">TODOS</option>
              {fornecedoresDisponiveis.map(fornecedor => (
                <option key={fornecedor} value={fornecedor}>{fornecedor}</option>
              ))}
            </select>
          </div>
        )}
      </div>

      {/* Indicador de filtros ativos */}
      {hasActiveFilters && (
        <div style={{ 
          display: 'flex', 
          alignItems: 'center', 
          gap: '0.75rem', 
          marginTop: '1rem',
          flexWrap: 'wrap'
        }}>
          <span style={{ 
            background: '#667eea', 
            color: 'white', 
            padding: '0.25rem 0.75rem', 
            borderRadius: '12px',
            fontSize: '0.85rem',
            fontWeight: '600'
          }}>
            {displayItemsCount} {displayItemsCount === 1 ? 'item encontrado' : 'itens encontrados'}
          </span>
          <button
            onClick={onClearFilters}
            className="btn btn-secondary"
            style={{ padding: '0.4rem 0.8rem', fontSize: '0.8rem' }}
            data-testid="clear-all-filters"
          >
            ✕ Limpar Filtros
          </button>
        </div>
      )}
    </div>
  );
};

export default ItemFilters;
