import React from 'react';

const Pagination = ({ 
  totalItems, 
  currentPage, 
  itemsPerPage, 
  onPageChange, 
  onItemsPerPageChange,
  showItemsPerPage = true 
}) => {
  const totalPages = Math.ceil(totalItems / itemsPerPage);
  const startItem = (currentPage - 1) * itemsPerPage + 1;
  const endItem = Math.min(currentPage * itemsPerPage, totalItems);

  const itemsPerPageOptions = [5, 10, 15, 20, 'Tudo'];

  // Gerar array de páginas para mostrar
  const getPageNumbers = () => {
    const pages = [];
    const maxVisible = 5;
    
    if (totalPages <= maxVisible) {
      for (let i = 1; i <= totalPages; i++) pages.push(i);
    } else {
      if (currentPage <= 3) {
        for (let i = 1; i <= 4; i++) pages.push(i);
        pages.push('...');
        pages.push(totalPages);
      } else if (currentPage >= totalPages - 2) {
        pages.push(1);
        pages.push('...');
        for (let i = totalPages - 3; i <= totalPages; i++) pages.push(i);
      } else {
        pages.push(1);
        pages.push('...');
        for (let i = currentPage - 1; i <= currentPage + 1; i++) pages.push(i);
        pages.push('...');
        pages.push(totalPages);
      }
    }
    return pages;
  };

  if (totalItems === 0) return null;

  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      padding: '1rem',
      background: '#f9fafb',
      borderRadius: '8px',
      marginTop: '1rem',
      flexWrap: 'wrap',
      gap: '1rem'
    }}>
      {/* Info de itens */}
      <div style={{ fontSize: '0.85rem', color: '#6b7280' }}>
        Mostrando <strong>{startItem}-{endItem}</strong> de <strong>{totalItems}</strong> itens
      </div>

      {/* Controles de paginação */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
        {/* Botão Anterior */}
        <button
          onClick={() => onPageChange(currentPage - 1)}
          disabled={currentPage === 1}
          style={{
            padding: '0.4rem 0.8rem',
            border: '1px solid #d1d5db',
            borderRadius: '6px',
            background: currentPage === 1 ? '#f3f4f6' : 'white',
            color: currentPage === 1 ? '#9ca3af' : '#374151',
            cursor: currentPage === 1 ? 'not-allowed' : 'pointer',
            fontSize: '0.85rem'
          }}
        >
          ← Anterior
        </button>

        {/* Números de página */}
        <div style={{ display: 'flex', gap: '0.25rem' }}>
          {getPageNumbers().map((page, idx) => (
            <button
              key={idx}
              onClick={() => page !== '...' && onPageChange(page)}
              disabled={page === '...'}
              style={{
                padding: '0.4rem 0.75rem',
                border: '1px solid',
                borderColor: page === currentPage ? '#3b82f6' : '#d1d5db',
                borderRadius: '6px',
                background: page === currentPage ? '#3b82f6' : 'white',
                color: page === currentPage ? 'white' : page === '...' ? '#9ca3af' : '#374151',
                cursor: page === '...' ? 'default' : 'pointer',
                fontSize: '0.85rem',
                fontWeight: page === currentPage ? '600' : '400',
                minWidth: '36px'
              }}
            >
              {page}
            </button>
          ))}
        </div>

        {/* Botão Próximo */}
        <button
          onClick={() => onPageChange(currentPage + 1)}
          disabled={currentPage === totalPages || totalPages === 0}
          style={{
            padding: '0.4rem 0.8rem',
            border: '1px solid #d1d5db',
            borderRadius: '6px',
            background: currentPage === totalPages ? '#f3f4f6' : 'white',
            color: currentPage === totalPages ? '#9ca3af' : '#374151',
            cursor: currentPage === totalPages ? 'not-allowed' : 'pointer',
            fontSize: '0.85rem'
          }}
        >
          Próximo →
        </button>
      </div>

      {/* Seletor de itens por página */}
      {showItemsPerPage && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <span style={{ fontSize: '0.85rem', color: '#6b7280' }}>Por página:</span>
          <select
            value={itemsPerPage === totalItems ? 'Tudo' : itemsPerPage}
            onChange={(e) => {
              const value = e.target.value;
              if (value === 'Tudo') {
                onItemsPerPageChange(totalItems);
              } else {
                onItemsPerPageChange(parseInt(value));
              }
              onPageChange(1); // Voltar para primeira página
            }}
            style={{
              padding: '0.4rem 0.6rem',
              border: '1px solid #d1d5db',
              borderRadius: '6px',
              background: 'white',
              fontSize: '0.85rem',
              cursor: 'pointer'
            }}
          >
            {itemsPerPageOptions.map(option => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </div>
      )}
    </div>
  );
};

export default Pagination;
