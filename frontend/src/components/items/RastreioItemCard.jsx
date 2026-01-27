import React, { memo, useState } from 'react';

/**
 * Componente de exibição de rastreio para itens "Em Trânsito"
 * Mostra código de rastreio, status atual e eventos expandíveis
 */
const RastreioItemCard = memo(({
  item,
  isSelected,
  onToggleSelect,
  onAtualizarRastreio,
  isAdmin
}) => {
  const [expanded, setExpanded] = useState(false);
  
  const eventos = item.rastreio_eventos || [];
  const ultimoEvento = eventos[0];
  const codigoRastreio = item.codigo_rastreio || '';
  
  // Determinar cor do status baseado no último evento
  const getStatusColor = () => {
    if (!ultimoEvento) return { bg: '#f3f4f6', color: '#6b7280', text: 'Aguardando atualização' };
    
    const status = (ultimoEvento.status || '').toLowerCase();
    
    if (status.includes('entregue') || status.includes('entrega realizada')) {
      return { bg: '#dcfce7', color: '#166534', text: ultimoEvento.status };
    }
    if (status.includes('saiu para entrega') || status.includes('com o carteiro')) {
      return { bg: '#dbeafe', color: '#1e40af', text: ultimoEvento.status };
    }
    if (status.includes('não entregue') || status.includes('ausente') || status.includes('tentativa')) {
      return { bg: '#fef3c7', color: '#92400e', text: ultimoEvento.status };
    }
    if (status.includes('trânsito') || status.includes('encaminhado') || status.includes('postado')) {
      return { bg: '#e0e7ff', color: '#3730a3', text: ultimoEvento.status };
    }
    
    return { bg: '#f3f4f6', color: '#374151', text: ultimoEvento.status };
  };
  
  const statusInfo = getStatusColor();

  return (
    <div 
      style={{ 
        background: isSelected ? '#f5f3ff' : 'white',
        border: isSelected ? '2px solid #8b5cf6' : '1px solid #e2e8f0',
        borderRadius: '8px',
        padding: '1rem',
        marginBottom: '0.75rem'
      }}
    >
      {/* Header: Checkbox + Código + Descrição */}
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.75rem' }}>
        {/* Checkbox de seleção */}
        {isAdmin && (
          <input
            type="checkbox"
            checked={isSelected}
            onChange={onToggleSelect}
            style={{ 
              width: '20px', 
              height: '20px', 
              cursor: 'pointer',
              accentColor: '#8b5cf6',
              marginTop: '0.25rem'
            }}
            title="Selecionar para atualizar rastreio"
          />
        )}
        
        {/* Info do Item */}
        <div style={{ flex: 1 }}>
          {/* Código e Descrição */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap', marginBottom: '0.5rem' }}>
            <span style={{ 
              fontWeight: '700', 
              fontSize: '1rem',
              color: '#1f2937',
              fontFamily: 'monospace',
              background: '#f3f4f6',
              padding: '0.2rem 0.5rem',
              borderRadius: '4px'
            }}>
              {item.codigo_item}
            </span>
            <span style={{ 
              color: '#6b7280', 
              fontSize: '0.9rem',
              flex: 1,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap'
            }}>
              {item.descricao?.substring(0, 60)}{item.descricao?.length > 60 ? '...' : ''}
            </span>
          </div>
          
          {/* Código de Rastreio em destaque */}
          <div style={{ 
            display: 'flex', 
            alignItems: 'center', 
            gap: '1rem',
            flexWrap: 'wrap'
          }}>
            {/* Código de Rastreio */}
            <div style={{ 
              display: 'flex', 
              alignItems: 'center', 
              gap: '0.5rem',
              background: '#fef3c7',
              padding: '0.4rem 0.75rem',
              borderRadius: '6px',
              border: '1px solid #fcd34d'
            }}>
              <span style={{ fontSize: '1.1rem' }}>📦</span>
              <span style={{ 
                fontWeight: '700', 
                fontSize: '1rem',
                fontFamily: 'monospace',
                color: '#92400e',
                letterSpacing: '0.5px'
              }}>
                {codigoRastreio || 'Sem código'}
              </span>
            </div>
            
            {/* Status Atual (colapsado) */}
            <div 
              onClick={() => setExpanded(!expanded)}
              style={{ 
                display: 'flex', 
                alignItems: 'center', 
                gap: '0.5rem',
                background: statusInfo.bg,
                padding: '0.4rem 0.75rem',
                borderRadius: '6px',
                cursor: 'pointer',
                transition: 'all 0.2s'
              }}
            >
              <span style={{ 
                fontWeight: '600', 
                fontSize: '0.85rem',
                color: statusInfo.color,
                maxWidth: '250px',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap'
              }}>
                {statusInfo.text}
              </span>
              <span style={{ 
                fontSize: '0.8rem', 
                color: statusInfo.color,
                transition: 'transform 0.2s',
                transform: expanded ? 'rotate(180deg)' : 'rotate(0deg)'
              }}>
                ▼
              </span>
            </div>
            
            {/* Quantidade de eventos */}
            {eventos.length > 0 && (
              <span style={{ 
                fontSize: '0.8rem', 
                color: '#6b7280',
                background: '#f3f4f6',
                padding: '0.25rem 0.5rem',
                borderRadius: '4px'
              }}>
                {eventos.length} evento{eventos.length !== 1 ? 's' : ''}
              </span>
            )}
          </div>
        </div>
      </div>
      
      {/* Eventos de Rastreamento (expandível) */}
      {expanded && (
        <div style={{ 
          marginTop: '1rem',
          paddingTop: '1rem',
          borderTop: '1px solid #e2e8f0'
        }}>
          <h4 style={{ 
            margin: '0 0 0.75rem 0', 
            fontSize: '0.9rem', 
            fontWeight: '600', 
            color: '#374151',
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem'
          }}>
            📋 Histórico de Rastreamento
            {codigoRastreio && (
              <a 
                href={`https://rastreamento.correios.com.br/app/index.php?objetos=${codigoRastreio}`}
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  fontSize: '0.75rem',
                  color: '#3b82f6',
                  textDecoration: 'underline'
                }}
              >
                Ver nos Correios ↗
              </a>
            )}
          </h4>
          
          {eventos.length > 0 ? (
            <div style={{ 
              display: 'flex', 
              flexDirection: 'column', 
              gap: '0.5rem',
              maxHeight: '300px',
              overflowY: 'auto'
            }}>
              {eventos.map((evento, idx) => (
                <div 
                  key={idx}
                  style={{
                    display: 'flex',
                    gap: '0.75rem',
                    padding: '0.5rem',
                    background: idx === 0 ? '#f0fdf4' : '#f9fafb',
                    borderRadius: '6px',
                    borderLeft: idx === 0 ? '3px solid #22c55e' : '3px solid #d1d5db'
                  }}
                >
                  {/* Data/Hora */}
                  <div style={{ 
                    minWidth: '100px',
                    fontSize: '0.8rem',
                    color: '#6b7280'
                  }}>
                    <div style={{ fontWeight: '600' }}>{evento.data}</div>
                    <div>{evento.hora}</div>
                  </div>
                  
                  {/* Status e Local */}
                  <div style={{ flex: 1 }}>
                    <div style={{ 
                      fontWeight: idx === 0 ? '600' : '400',
                      fontSize: '0.85rem',
                      color: idx === 0 ? '#166534' : '#374151',
                      marginBottom: '0.25rem'
                    }}>
                      {evento.status}
                    </div>
                    {(evento.local || evento.cidade) && (
                      <div style={{ 
                        fontSize: '0.8rem', 
                        color: '#6b7280'
                      }}>
                        📍 {evento.local || evento.cidade}{evento.uf ? ` - ${evento.uf}` : ''}
                      </div>
                    )}
                    {evento.subStatus && (
                      <div style={{ 
                        fontSize: '0.75rem', 
                        color: '#9ca3af',
                        fontStyle: 'italic',
                        marginTop: '0.25rem'
                      }}>
                        {Array.isArray(evento.subStatus) ? evento.subStatus.join(', ') : evento.subStatus}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div style={{ 
              textAlign: 'center', 
              padding: '1.5rem',
              background: '#fef3c7',
              borderRadius: '8px',
              border: '1px solid #fcd34d'
            }}>
              <div style={{ 
                color: '#92400e',
                fontSize: '0.9rem',
                marginBottom: '0.75rem'
              }}>
                ⏳ Aguardando dados de rastreamento
              </div>
              <div style={{ 
                fontSize: '0.85rem', 
                color: '#78350f'
              }}>
                Os eventos serão atualizados automaticamente quando disponíveis.
              </div>
              {codigoRastreio && (
                <a 
                  href={`https://rastreamento.correios.com.br/app/index.php?objetos=${codigoRastreio}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{
                    display: 'inline-block',
                    marginTop: '1rem',
                    padding: '0.5rem 1rem',
                    background: '#ffffff',
                    color: '#1d4ed8',
                    borderRadius: '6px',
                    border: '1px solid #3b82f6',
                    textDecoration: 'none',
                    fontSize: '0.85rem',
                    fontWeight: '600'
                  }}
                >
                  🔍 Consultar no site dos Correios
                </a>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
});

RastreioItemCard.displayName = 'RastreioItemCard';

export default RastreioItemCard;
