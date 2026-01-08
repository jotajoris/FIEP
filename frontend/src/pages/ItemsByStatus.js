import React, { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { apiGet, apiPatch, API } from '../utils/api';
import { useAuth } from '../contexts/AuthContext';
import { v4 as uuidv4 } from 'uuid';

const ItemsByStatus = () => {
  const { status } = useParams();
  const navigate = useNavigate();
  const { isAdmin, user } = useAuth();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editingItem, setEditingItem] = useState(null);
  const [formData, setFormData] = useState({});
  const [showOnlyMine, setShowOnlyMine] = useState(false);

  const statusLabels = {
    'pendente': 'Pendentes',
    'cotado': 'Cotados',
    'comprado': 'Comprados',
    'entregue': 'Entregues'
  };

  useEffect(() => {
    loadItems();
  }, [status]);

  const loadItems = async () => {
    try {
      const response = await apiGet(`${API}/purchase-orders`);
      
      const allItems = [];
      response.data.forEach(po => {
        po.items.forEach(item => {
          if (item.status === status) {
            allItems.push({
              ...item,
              numero_oc: po.numero_oc,
              po_id: po.id
            });
          }
        });
      });
      
      setItems(allItems);
    } catch (error) {
      console.error('Erro ao carregar itens:', error);
    } finally {
      setLoading(false);
    }
  };

  // Calcular itens a serem mostrados
  const displayItems = showOnlyMine && user?.owner_name
    ? items.filter(item => item.responsavel === user.owner_name)
    : items;
  
  const myItemsCount = user?.owner_name 
    ? items.filter(item => item.responsavel === user.owner_name).length 
    : 0;

  const startEdit = (item) => {
    setEditingItem(`${item.po_id}-${item.codigo_item}`);
    
    // Se já tem fontes de compra, usar elas; senão criar uma vazia
    const fontesExistentes = item.fontes_compra && item.fontes_compra.length > 0 
      ? item.fontes_compra 
      : [];
    
    setFormData({
      status: item.status,
      preco_venda: item.preco_venda || '',
      imposto: item.imposto || '',
      frete_envio: item.frete_envio || '',
      fontes_compra: fontesExistentes.length > 0 ? fontesExistentes : [{
        id: uuidv4(),
        quantidade: item.quantidade || 1,
        preco_unitario: item.preco_compra || '',
        frete: item.frete_compra || '',
        link: item.link_compra || '',
        fornecedor: ''
      }],
      quantidade_total: item.quantidade
    });
  };

  const cancelEdit = () => {
    setEditingItem(null);
    setFormData({});
  };

  const addFonteCompra = () => {
    setFormData({
      ...formData,
      fontes_compra: [...formData.fontes_compra, {
        id: uuidv4(),
        quantidade: 1,
        preco_unitario: '',
        frete: '',
        link: '',
        fornecedor: ''
      }]
    });
  };

  const removeFonteCompra = (index) => {
    const newFontes = formData.fontes_compra.filter((_, i) => i !== index);
    setFormData({ ...formData, fontes_compra: newFontes });
  };

  const updateFonteCompra = (index, field, value) => {
    const newFontes = [...formData.fontes_compra];
    newFontes[index] = { ...newFontes[index], [field]: value };
    setFormData({ ...formData, fontes_compra: newFontes });
  };

  const calcularTotalFontes = () => {
    let totalQtd = 0;
    let totalCusto = 0;
    let totalFrete = 0;
    
    formData.fontes_compra?.forEach(fc => {
      const qtd = parseInt(fc.quantidade) || 0;
      const preco = parseFloat(fc.preco_unitario) || 0;
      const frete = parseFloat(fc.frete) || 0;
      totalQtd += qtd;
      totalCusto += qtd * preco;
      totalFrete += frete;
    });
    
    return { totalQtd, totalCusto, totalFrete };
  };

  const saveEdit = async (item) => {
    try {
      const payload = {
        status: formData.status,
        preco_venda: formData.preco_venda ? parseFloat(formData.preco_venda) : null,
        imposto: formData.imposto ? parseFloat(formData.imposto) : null,
        frete_envio: formData.frete_envio ? parseFloat(formData.frete_envio) : null,
        fontes_compra: formData.fontes_compra.map(fc => ({
          id: fc.id,
          quantidade: parseInt(fc.quantidade) || 0,
          preco_unitario: parseFloat(fc.preco_unitario) || 0,
          frete: parseFloat(fc.frete) || 0,
          link: fc.link || '',
          fornecedor: fc.fornecedor || ''
        })).filter(fc => fc.quantidade > 0)
      };
      
      await apiPatch(`${API}/purchase-orders/${item.po_id}/items/${item.codigo_item}`, payload);
      
      setEditingItem(null);
      setFormData({});
      loadItems();
    } catch (error) {
      console.error('Erro ao atualizar item:', error);
      alert('Erro ao atualizar item');
    }
  };

  if (loading) {
    return <div className="loading" data-testid="loading-items">Carregando...</div>;
  }

  return (
    <div data-testid="items-by-status-page">
      <div className="page-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', justifyContent: 'space-between', width: '100%' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
            <button onClick={() => navigate('/')} className="btn btn-secondary" data-testid="back-btn">
              ← Voltar
            </button>
            <div>
              <h1 className="page-title" data-testid="status-title">
                Itens {statusLabels[status] || status}
              </h1>
              <p className="page-subtitle">
                {showOnlyMine ? (
                  <>{filteredItems.length} de {items.length} itens (filtrado por {user?.owner_name})</>
                ) : (
                  <>{items.length} {items.length === 1 ? 'item' : 'itens'} com status "{status}"</>
                )}
              </p>
            </div>
          </div>
          
          {/* Botão Meus Itens */}
          {user?.owner_name && (
            <button
              onClick={() => setShowOnlyMine(!showOnlyMine)}
              className={showOnlyMine ? 'btn btn-primary' : 'btn btn-secondary'}
              style={{ 
                padding: '0.6rem 1.2rem',
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem'
              }}
              data-testid="filter-my-items-btn"
            >
              {showOnlyMine ? '👤 Meus Itens ✓' : '👤 Meus Itens'}
              {showOnlyMine && (
                <span style={{ 
                  background: 'white', 
                  color: '#667eea', 
                  borderRadius: '50%', 
                  padding: '0.1rem 0.5rem',
                  fontSize: '0.8rem',
                  fontWeight: '700'
                }}>
                  {filteredItems.length}
                </span>
              )}
            </button>
          )}
        </div>
      </div>

      <div className="card">
        {filteredItems.length === 0 ? (
          <p style={{ textAlign: 'center', color: '#718096', padding: '2rem' }} data-testid="no-items-message">
            {showOnlyMine 
              ? `Nenhum item de ${user?.owner_name} com status "${status}" encontrado.`
              : `Nenhum item com status "${status}" encontrado.`
            }
          </p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            {filteredItems.map((item, index) => (
              <div 
                key={`${item.po_id}-${item.codigo_item}`} 
                className="card" 
                style={{ background: '#f7fafc', border: '1px solid #e2e8f0' }} 
                data-testid={`item-card-${item.codigo_item}`}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', marginBottom: '1rem' }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', gap: '1rem', alignItems: 'center', marginBottom: '0.5rem' }}>
                      <h3 style={{ fontSize: '1.1rem', fontWeight: '700', margin: 0 }}>
                        Código: {item.codigo_item}
                      </h3>
                      <Link 
                        to={`/po/${item.po_id}`} 
                        style={{ fontSize: '0.85rem', color: '#667eea', textDecoration: 'underline' }}
                        data-testid={`link-oc-${item.codigo_item}`}
                      >
                        OC: {item.numero_oc}
                      </Link>
                    </div>
                    <p style={{ color: '#4a5568', marginBottom: '0.5rem' }}>{item.descricao}</p>
                    <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', fontSize: '0.9rem', color: '#718096' }}>
                      <span><strong>Responsável:</strong> <strong style={{ color: '#667eea' }}>{item.responsavel}</strong></span>
                      <span><strong>Quantidade:</strong> {item.quantidade} {item.unidade}</span>
                      <span><strong>Lote:</strong> {item.lote}</span>
                      {item.marca_modelo && <span><strong>Marca/Modelo:</strong> {item.marca_modelo}</span>}
                    </div>
                  </div>
                </div>

                {editingItem === `${item.po_id}-${item.codigo_item}` ? (
                  <div style={{ marginTop: '1rem', padding: '1rem', background: 'white', borderRadius: '8px' }}>
                    {/* Status */}
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem', marginBottom: '1.5rem' }}>
                      <div className="form-group">
                        <label className="form-label">Status</label>
                        <select
                          className="form-input"
                          value={formData.status}
                          onChange={(e) => setFormData({ ...formData, status: e.target.value })}
                          data-testid={`select-status-${item.codigo_item}`}
                        >
                          <option value="pendente">Pendente</option>
                          <option value="cotado">Cotado</option>
                          <option value="comprado">Comprado</option>
                          <option value="entregue">Entregue</option>
                        </select>
                      </div>
                      
                      {isAdmin() && (
                        <>
                          <div className="form-group">
                            <label className="form-label">Preço Venda Unit. (R$)</label>
                            <input
                              type="number"
                              step="0.01"
                              className="form-input"
                              value={formData.preco_venda}
                              onChange={(e) => setFormData({ ...formData, preco_venda: e.target.value })}
                              data-testid={`input-preco-venda-${item.codigo_item}`}
                            />
                          </div>
                          <div className="form-group">
                            <label className="form-label">Imposto (R$)</label>
                            <input
                              type="number"
                              step="0.01"
                              className="form-input"
                              value={formData.imposto}
                              onChange={(e) => setFormData({ ...formData, imposto: e.target.value })}
                              data-testid={`input-imposto-${item.codigo_item}`}
                            />
                          </div>
                          <div className="form-group">
                            <label className="form-label">Frete Envio/Embalagem (R$)</label>
                            <input
                              type="number"
                              step="0.01"
                              className="form-input"
                              value={formData.frete_envio}
                              onChange={(e) => setFormData({ ...formData, frete_envio: e.target.value })}
                              data-testid={`input-frete-envio-${item.codigo_item}`}
                            />
                          </div>
                        </>
                      )}
                    </div>

                    {/* Fontes de Compra */}
                    <div style={{ borderTop: '2px solid #e2e8f0', paddingTop: '1rem', marginTop: '1rem' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                        <h4 style={{ margin: 0, fontSize: '1rem', fontWeight: '600', color: '#4a5568' }}>
                          📦 Locais de Compra
                        </h4>
                        <button
                          type="button"
                          onClick={addFonteCompra}
                          className="btn btn-secondary"
                          style={{ padding: '0.4rem 0.8rem', fontSize: '0.85rem' }}
                          data-testid={`add-fonte-${item.codigo_item}`}
                        >
                          + Adicionar Local
                        </button>
                      </div>

                      {formData.fontes_compra?.map((fonte, idx) => (
                        <div 
                          key={fonte.id} 
                          style={{ 
                            background: '#f0f4f8', 
                            padding: '1rem', 
                            borderRadius: '8px', 
                            marginBottom: '0.75rem',
                            border: '1px solid #e2e8f0'
                          }}
                        >
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
                            <span style={{ fontWeight: '600', color: '#667eea', fontSize: '0.9rem' }}>
                              Local #{idx + 1}
                            </span>
                            {formData.fontes_compra.length > 1 && (
                              <button
                                type="button"
                                onClick={() => removeFonteCompra(idx)}
                                style={{ 
                                  background: '#ef4444', 
                                  color: 'white', 
                                  border: 'none', 
                                  padding: '0.25rem 0.5rem', 
                                  borderRadius: '4px', 
                                  cursor: 'pointer',
                                  fontSize: '0.8rem'
                                }}
                              >
                                Remover
                              </button>
                            )}
                          </div>
                          
                          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '0.75rem' }}>
                            <div className="form-group" style={{ marginBottom: 0 }}>
                              <label className="form-label" style={{ fontSize: '0.8rem' }}>Quantidade</label>
                              <input
                                type="number"
                                className="form-input"
                                value={fonte.quantidade}
                                onChange={(e) => updateFonteCompra(idx, 'quantidade', e.target.value)}
                                min="1"
                                style={{ padding: '0.5rem' }}
                              />
                            </div>
                            <div className="form-group" style={{ marginBottom: 0 }}>
                              <label className="form-label" style={{ fontSize: '0.8rem' }}>Preço Unit. (R$)</label>
                              <input
                                type="number"
                                step="0.01"
                                className="form-input"
                                value={fonte.preco_unitario}
                                onChange={(e) => updateFonteCompra(idx, 'preco_unitario', e.target.value)}
                                style={{ padding: '0.5rem' }}
                              />
                            </div>
                            <div className="form-group" style={{ marginBottom: 0 }}>
                              <label className="form-label" style={{ fontSize: '0.8rem' }}>Frete (R$)</label>
                              <input
                                type="number"
                                step="0.01"
                                className="form-input"
                                value={fonte.frete}
                                onChange={(e) => updateFonteCompra(idx, 'frete', e.target.value)}
                                style={{ padding: '0.5rem' }}
                              />
                            </div>
                            <div className="form-group" style={{ marginBottom: 0, gridColumn: 'span 2' }}>
                              <label className="form-label" style={{ fontSize: '0.8rem' }}>Link de Compra</label>
                              <input
                                type="url"
                                className="form-input"
                                value={fonte.link}
                                onChange={(e) => updateFonteCompra(idx, 'link', e.target.value)}
                                placeholder="https://..."
                                style={{ padding: '0.5rem' }}
                              />
                            </div>
                            <div className="form-group" style={{ marginBottom: 0 }}>
                              <label className="form-label" style={{ fontSize: '0.8rem' }}>Fornecedor</label>
                              <input
                                type="text"
                                className="form-input"
                                value={fonte.fornecedor}
                                onChange={(e) => updateFonteCompra(idx, 'fornecedor', e.target.value)}
                                placeholder="Nome do fornecedor"
                                style={{ padding: '0.5rem' }}
                              />
                            </div>
                          </div>
                        </div>
                      ))}

                      {/* Resumo das fontes */}
                      {formData.fontes_compra?.length > 0 && (
                        <div style={{ 
                          background: '#e8f4fd', 
                          padding: '0.75rem 1rem', 
                          borderRadius: '8px', 
                          marginTop: '1rem',
                          display: 'flex',
                          gap: '2rem',
                          flexWrap: 'wrap',
                          fontSize: '0.9rem'
                        }}>
                          {(() => {
                            const { totalQtd, totalCusto, totalFrete } = calcularTotalFontes();
                            const qtdRestante = (formData.quantidade_total || item.quantidade) - totalQtd;
                            return (
                              <>
                                <span>
                                  <strong>Total Qtd:</strong> {totalQtd} / {formData.quantidade_total || item.quantidade}
                                  {qtdRestante > 0 && <span style={{ color: '#f59e0b' }}> (faltam {qtdRestante})</span>}
                                  {qtdRestante < 0 && <span style={{ color: '#ef4444' }}> (excedeu {Math.abs(qtdRestante)})</span>}
                                </span>
                                <span><strong>Custo Total:</strong> R$ {totalCusto.toFixed(2)}</span>
                                <span><strong>Frete Total:</strong> R$ {totalFrete.toFixed(2)}</span>
                              </>
                            );
                          })()}
                        </div>
                      )}
                    </div>

                    <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end', marginTop: '1.5rem' }}>
                      <button onClick={cancelEdit} className="btn btn-secondary" style={{ padding: '0.5rem 1rem' }} data-testid={`cancel-edit-${item.codigo_item}`}>
                        Cancelar
                      </button>
                      <button onClick={() => saveEdit(item)} className="btn btn-primary" style={{ padding: '0.5rem 1rem' }} data-testid={`save-edit-${item.codigo_item}`}>
                        Salvar
                      </button>
                    </div>
                  </div>
                ) : (
                  <div style={{ marginTop: '1rem' }}>
                    {/* Mostrar fontes de compra se existirem */}
                    {item.fontes_compra && item.fontes_compra.length > 0 && (
                      <div style={{ marginBottom: '1rem', padding: '0.75rem', background: '#e8f4fd', borderRadius: '8px' }}>
                        <div style={{ fontWeight: '600', marginBottom: '0.5rem', color: '#4a5568', fontSize: '0.9rem' }}>
                          📦 Locais de Compra ({item.fontes_compra.length})
                        </div>
                        {item.fontes_compra.map((fc, idx) => (
                          <div key={fc.id || idx} style={{ 
                            display: 'flex', 
                            gap: '1rem', 
                            fontSize: '0.85rem',
                            padding: '0.5rem',
                            background: 'white',
                            borderRadius: '4px',
                            marginBottom: '0.25rem',
                            flexWrap: 'wrap'
                          }}>
                            <span><strong>Qtd:</strong> {fc.quantidade}</span>
                            <span><strong>Preço:</strong> R$ {fc.preco_unitario?.toFixed(2)}</span>
                            <span><strong>Frete:</strong> R$ {(fc.frete || 0).toFixed(2)}</span>
                            {fc.fornecedor && <span><strong>Fornecedor:</strong> {fc.fornecedor}</span>}
                            {fc.link && (
                              <a href={fc.link} target="_blank" rel="noopener noreferrer" style={{ color: '#667eea' }}>
                                Ver link
                              </a>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                    
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div style={{ display: 'flex', gap: '1.5rem', fontSize: '0.9rem', flexWrap: 'wrap' }}>
                        {item.preco_venda && (
                          <span>
                            <strong>Preço Venda Unit.:</strong> R$ {item.preco_venda.toFixed(2)}
                          </span>
                        )}
                        {item.preco_venda && (
                          <span>
                            <strong>Valor Total Venda:</strong> <strong style={{ color: '#3b82f6' }}>R$ {(item.preco_venda * item.quantidade).toFixed(2)}</strong>
                          </span>
                        )}
                        {item.preco_compra && (
                          <span>
                            <strong>Preço Compra Médio:</strong> R$ {item.preco_compra.toFixed(2)}
                          </span>
                        )}
                        {item.frete_compra && (
                          <span>
                            <strong>Frete Compra:</strong> R$ {item.frete_compra.toFixed(2)}
                          </span>
                        )}
                        {isAdmin() && item.frete_envio && (
                          <span>
                            <strong>Frete Envio:</strong> R$ {item.frete_envio.toFixed(2)}
                          </span>
                        )}
                        {isAdmin() && item.lucro_liquido !== undefined && item.lucro_liquido !== null && (
                          <span>
                            <strong>Lucro Líquido:</strong>{' '}
                            <span style={{ color: item.lucro_liquido > 0 ? '#10b981' : '#ef4444', fontWeight: '700' }}>
                              R$ {item.lucro_liquido.toFixed(2)}
                            </span>
                          </span>
                        )}
                      </div>
                      <button 
                        onClick={() => startEdit(item)} 
                        className="btn btn-secondary" 
                        style={{ padding: '0.5rem 1rem', fontSize: '0.85rem' }} 
                        data-testid={`edit-item-${item.codigo_item}`}
                      >
                        Editar
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default ItemsByStatus;
