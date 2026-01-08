import React, { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { apiGet, apiPatch, API } from '../utils/api';
import { useAuth } from '../contexts/AuthContext';

const ItemsByStatus = () => {
  const { status } = useParams();
  const navigate = useNavigate();
  const { isAdmin } = useAuth();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editingItem, setEditingItem] = useState(null);
  const [formData, setFormData] = useState({});

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
      
      // Flatten todos os itens de todas as OCs
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

  const startEdit = (item) => {
    setEditingItem(`${item.po_id}-${item.codigo_item}`);
    setFormData({
      status: item.status,
      link_compra: item.link_compra || '',
      preco_compra: item.preco_compra || '',
      preco_venda: item.preco_venda || '',
      imposto: item.imposto || '',
      frete_compra: item.frete_compra || '',
      frete_envio: item.frete_envio || ''
    });
  };

  const cancelEdit = () => {
    setEditingItem(null);
    setFormData({});
  };

  const saveEdit = async (item) => {
    try {
      await apiPatch(`${API}/purchase-orders/${item.po_id}/items/${item.codigo_item}`, {
        status: formData.status,
        link_compra: formData.link_compra || null,
        preco_compra: formData.preco_compra ? parseFloat(formData.preco_compra) : null,
        preco_venda: formData.preco_venda ? parseFloat(formData.preco_venda) : null,
        imposto: formData.imposto ? parseFloat(formData.imposto) : null,
        frete_compra: formData.frete_compra ? parseFloat(formData.frete_compra) : null,
        frete_envio: formData.frete_envio ? parseFloat(formData.frete_envio) : null
      });
      
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
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <button onClick={() => navigate('/')} className="btn btn-secondary" data-testid="back-btn">
            ← Voltar
          </button>
          <div>
            <h1 className="page-title" data-testid="status-title">
              Itens {statusLabels[status] || status}
            </h1>
            <p className="page-subtitle">
              {items.length} {items.length === 1 ? 'item' : 'itens'} com status "{status}"
            </p>
          </div>
        </div>
      </div>

      <div className="card">
        {items.length === 0 ? (
          <p style={{ textAlign: 'center', color: '#718096', padding: '2rem' }} data-testid="no-items-message">
            Nenhum item com status "{status}" encontrado.
          </p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            {items.map((item, index) => (
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
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem', marginBottom: '1rem' }}>
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
                      
                      <div className="form-group" style={{ gridColumn: 'span 2' }}>
                        <label className="form-label">Link de Compra</label>
                        <input
                          type="url"
                          className="form-input"
                          value={formData.link_compra}
                          onChange={(e) => setFormData({ ...formData, link_compra: e.target.value })}
                          placeholder="https://..."
                          data-testid={`input-link-${item.codigo_item}`}
                        />
                      </div>
                      
                      <div className="form-group">
                        <label className="form-label">Preço Compra (R$)</label>
                        <input
                          type="number"
                          step="0.01"
                          className="form-input"
                          value={formData.preco_compra}
                          onChange={(e) => setFormData({ ...formData, preco_compra: e.target.value })}
                          placeholder="Preço que você conseguiu"
                          data-testid={`input-preco-compra-${item.codigo_item}`}
                        />
                      </div>
                      
                      {isAdmin() && (
                        <>
                          <div className="form-group">
                            <label className="form-label">Preço Venda (R$)</label>
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
                            <label className="form-label">Frete (R$)</label>
                            <input
                              type="number"
                              step="0.01"
                              className="form-input"
                              value={formData.custo_frete}
                              onChange={(e) => setFormData({ ...formData, custo_frete: e.target.value })}
                              data-testid={`input-frete-${item.codigo_item}`}
                            />
                          </div>
                        </>
                      )}
                    </div>
                    <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
                      <button onClick={cancelEdit} className="btn btn-secondary" style={{ padding: '0.5rem 1rem' }} data-testid={`cancel-edit-${item.codigo_item}`}>
                        Cancelar
                      </button>
                      <button onClick={() => saveEdit(item)} className="btn btn-primary" style={{ padding: '0.5rem 1rem' }} data-testid={`save-edit-${item.codigo_item}`}>
                        Salvar
                      </button>
                    </div>
                  </div>
                ) : (
                  <div style={{ marginTop: '1rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div style={{ display: 'flex', gap: '1.5rem', fontSize: '0.9rem', flexWrap: 'wrap' }}>
                      {item.link_compra && (
                        <span>
                          <strong>Link:</strong>{' '}
                          <a 
                            href={item.link_compra} 
                            target="_blank" 
                            rel="noopener noreferrer"
                            style={{ color: '#667eea', textDecoration: 'underline' }}
                          >
                            Ver link de compra
                          </a>
                        </span>
                      )}
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
                          <strong>Preço Compra Unit.:</strong> R$ {item.preco_compra.toFixed(2)}
                        </span>
                      )}
                      {item.preco_compra && (
                        <span>
                          <strong>Total Compra:</strong> R$ {(item.preco_compra * item.quantidade).toFixed(2)}
                        </span>
                      )}
                      {item.imposto && (
                        <span>
                          <strong>Imposto:</strong> R$ {item.imposto.toFixed(2)}
                        </span>
                      )}
                      {isAdmin() && item.lucro_liquido && (
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
