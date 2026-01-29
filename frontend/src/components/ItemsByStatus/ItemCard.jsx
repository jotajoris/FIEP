/**
 * ItemCard - Componente para exibir um item individual
 * Com informações de preço, status, NFs, etc.
 */
import React from 'react';
import { formatBRL } from '../../utils/api';

const ItemCard = ({
  item,
  index,
  isSelected,
  onSelect,
  onEdit,
  onViewImage,
  showCheckbox = true,
  showPrices = true,
  isAdmin,
  status
}) => {
  // Calcular valores
  const preco = item.preco || 0;
  const quantidade = item.quantidade || 1;
  const qtdComprada = item.quantidade_comprada || quantidade;
  const valorTotal = preco * quantidade;
  const precoVenda = item.preco_venda || 0;
  const valorVenda = precoVenda * quantidade;
  const lucro = valorVenda - valorTotal;

  // Verificar se tem imagem
  const temImagem = item.imagem_url || item.image_url;

  return (
    <div
      style={{
        background: isSelected ? '#eff6ff' : '#fafafa',
        border: isSelected ? '2px solid #3b82f6' : '1px solid #e5e7eb',
        borderRadius: '8px',
        padding: '1rem',
        marginBottom: '0.75rem'
      }}
      data-testid={`item-card-${item.codigo_item}`}
    >
      {/* Header do item */}
      <div style={{ 
        display: 'flex', 
        justifyContent: 'space-between', 
        alignItems: 'flex-start',
        marginBottom: '0.75rem'
      }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.75rem' }}>
          {showCheckbox && (
            <input
              type="checkbox"
              checked={isSelected}
              onChange={() => onSelect && onSelect(item)}
              style={{ marginTop: '0.25rem' }}
              data-testid={`checkbox-${item.codigo_item}`}
            />
          )}
          
          {/* Imagem do item */}
          {temImagem && (
            <div
              onClick={() => onViewImage && onViewImage(item.imagem_url || item.image_url)}
              style={{
                width: '50px',
                height: '50px',
                borderRadius: '6px',
                overflow: 'hidden',
                cursor: 'pointer',
                flexShrink: 0,
                border: '1px solid #d1d5db'
              }}
            >
              <img
                src={item.imagem_url || item.image_url}
                alt={item.codigo_item}
                style={{ width: '100%', height: '100%', objectFit: 'cover' }}
              />
            </div>
          )}
          
          <div>
            <div style={{ fontWeight: '600', color: '#1f2937', fontSize: '0.95rem' }}>
              {item.codigo_item}
              {item.ncm && (
                <span style={{ 
                  marginLeft: '0.5rem',
                  fontSize: '0.7rem',
                  color: '#6b7280',
                  fontWeight: 'normal'
                }}>
                  NCM: {item.ncm}
                </span>
              )}
            </div>
            <div style={{ 
              fontSize: '0.85rem', 
              color: '#4b5563',
              maxWidth: '400px',
              lineHeight: '1.3'
            }}>
              {item.descricao?.substring(0, 100)}
              {item.descricao?.length > 100 && '...'}
            </div>
            {item.marca_modelo && (
              <div style={{ fontSize: '0.8rem', color: '#6b7280', marginTop: '0.25rem' }}>
                🏷️ {item.marca_modelo}
              </div>
            )}
          </div>
        </div>
        
        <button
          onClick={() => onEdit && onEdit(item)}
          style={{
            background: '#f3f4f6',
            border: '1px solid #d1d5db',
            padding: '0.35rem 0.75rem',
            borderRadius: '6px',
            cursor: 'pointer',
            fontSize: '0.8rem',
            color: '#374151'
          }}
          data-testid={`edit-item-${item.codigo_item}`}
        >
          ✏️ Editar
        </button>
      </div>
      
      {/* Informações de quantidade e valores */}
      <div style={{ 
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))',
        gap: '0.75rem',
        fontSize: '0.8rem'
      }}>
        {/* Quantidade */}
        <div>
          <span style={{ color: '#6b7280' }}>Quantidade:</span>
          <span style={{ marginLeft: '0.25rem', fontWeight: '600' }}>
            {quantidade} {item.unidade || 'un'}
          </span>
          {qtdComprada !== quantidade && (
            <span style={{ color: '#f59e0b', marginLeft: '0.25rem' }}>
              (Comprado: {qtdComprada})
            </span>
          )}
        </div>
        
        {/* Lote */}
        {item.lote && (
          <div>
            <span style={{ color: '#6b7280' }}>Lote:</span>
            <span style={{ marginLeft: '0.25rem', fontWeight: '600' }}>{item.lote}</span>
          </div>
        )}
        
        {/* Responsável */}
        {item.responsavel && (
          <div>
            <span style={{ color: '#6b7280' }}>Responsável:</span>
            <span style={{ marginLeft: '0.25rem', fontWeight: '600' }}>{item.responsavel}</span>
          </div>
        )}
        
        {/* Fornecedor */}
        {item.fornecedor && (
          <div>
            <span style={{ color: '#6b7280' }}>Fornecedor:</span>
            <span style={{ marginLeft: '0.25rem', fontWeight: '600' }}>{item.fornecedor}</span>
          </div>
        )}
      </div>
      
      {/* Valores (se mostrar preços) */}
      {showPrices && (preco > 0 || precoVenda > 0) && (
        <div style={{ 
          display: 'flex',
          gap: '1.5rem',
          marginTop: '0.75rem',
          paddingTop: '0.75rem',
          borderTop: '1px solid #e5e7eb',
          fontSize: '0.85rem'
        }}>
          {preco > 0 && (
            <div>
              <span style={{ color: '#6b7280' }}>Preço Compra:</span>
              <span style={{ marginLeft: '0.25rem', fontWeight: '600', color: '#dc2626' }}>
                {formatBRL(preco)}
              </span>
              {quantidade > 1 && (
                <span style={{ color: '#9ca3af', marginLeft: '0.25rem' }}>
                  (Total: {formatBRL(valorTotal)})
                </span>
              )}
            </div>
          )}
          
          {precoVenda > 0 && (
            <div>
              <span style={{ color: '#6b7280' }}>Preço Venda:</span>
              <span style={{ marginLeft: '0.25rem', fontWeight: '600', color: '#22c55e' }}>
                {formatBRL(precoVenda)}
              </span>
              {quantidade > 1 && (
                <span style={{ color: '#9ca3af', marginLeft: '0.25rem' }}>
                  (Total: {formatBRL(valorVenda)})
                </span>
              )}
            </div>
          )}
          
          {preco > 0 && precoVenda > 0 && (
            <div>
              <span style={{ color: '#6b7280' }}>Lucro:</span>
              <span style={{ 
                marginLeft: '0.25rem', 
                fontWeight: '600', 
                color: lucro >= 0 ? '#22c55e' : '#dc2626' 
              }}>
                {formatBRL(lucro)}
              </span>
            </div>
          )}
        </div>
      )}
      
      {/* Observação */}
      {item.observacao && (
        <div style={{ 
          marginTop: '0.75rem',
          padding: '0.5rem',
          background: '#fef3c7',
          borderRadius: '4px',
          fontSize: '0.8rem',
          color: '#92400e'
        }}>
          📝 {item.observacao}
        </div>
      )}
      
      {/* Link de compra */}
      {item.link_compra && (
        <div style={{ marginTop: '0.5rem' }}>
          <a
            href={item.link_compra}
            target="_blank"
            rel="noopener noreferrer"
            style={{ fontSize: '0.8rem', color: '#3b82f6' }}
          >
            🔗 Ver produto
          </a>
        </div>
      )}
    </div>
  );
};

export default ItemCard;
