import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { apiGet, apiPatch, apiDelete, API } from '../utils/api';
import { useAuth } from '../contexts/AuthContext';

const PODetails = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const { isAdmin } = useAuth();
  const [po, setPo] = useState(null);
  const [loading, setLoading] = useState(true);
  const [editingItem, setEditingItem] = useState(null);
  const [formData, setFormData] = useState({});

  useEffect(() => {
    loadPO();
  }, [id]);

  const loadPO = async () => {
    try {
      const response = await apiGet(`${API}/purchase-orders/${id}`);
      setPo(response.data);
    } catch (error) {
      console.error('Erro ao carregar OC:', error);
      alert('Ordem de Compra não encontrada');
      navigate('/');
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!window.confirm('Tem certeza que deseja deletar esta Ordem de Compra? Esta ação não pode ser desfeita.')) {
      return;
    }

    try {
      await apiDelete(`${API}/purchase-orders/${id}`);
      alert('Ordem de Compra deletada com sucesso!');
      navigate('/');
    } catch (error) {
      console.error('Erro ao deletar OC:', error);
      alert('Erro ao deletar Ordem de Compra');
    }
  };

  const startEdit = (item) => {
    setEditingItem(item.codigo_item);
    setFormData({
      status: item.status,
      link_compra: item.link_compra || '',
      preco_compra: item.preco_compra || '',
      preco_venda: item.preco_venda || '',
      imposto: item.imposto || '',
      custo_frete: item.custo_frete || ''
    });
  };

  const cancelEdit = () => {
    setEditingItem(null);
    setFormData({});
  };

  const saveEdit = async (item) => {
    try {
      await apiPatch(`${API}/purchase-orders/${id}/items/${item.codigo_item}`, {
        status: formData.status,
        link_compra: formData.link_compra || null,
        preco_compra: formData.preco_compra ? parseFloat(formData.preco_compra) : null,
        preco_venda: formData.preco_venda ? parseFloat(formData.preco_venda) : null,
        imposto: formData.imposto ? parseFloat(formData.imposto) : null,
        custo_frete: formData.custo_frete ? parseFloat(formData.custo_frete) : null
      });
      
      setEditingItem(null);
      setFormData({});
      loadPO();
    } catch (error) {
      console.error('Erro ao atualizar item:', error);
      alert('Erro ao atualizar item');
    }
  };

  const getStatusBadge = (status) => {
    return <span className={`status-badge status-${status}`} data-testid={`status-${status}`}>{status}</span>;
  };

  if (loading) {
    return <div className="loading" data-testid="loading-po">Carregando...</div>;
  }

  if (!po) {
    return null;
  }

  return (
    <div data-testid="po-details-page">
      <div className="page-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', justifyContent: 'space-between', width: '100%' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
            <button onClick={() => navigate('/')} className="btn btn-secondary" data-testid="back-btn">
              ← Voltar
            </button>
            <div>
              <h1 className="page-title" data-testid="po-number">OC {po.numero_oc}</h1>
              <p className="page-subtitle">Criada em {new Date(po.created_at).toLocaleDateString('pt-BR')}</p>
            </div>
          </div>
          {isAdmin() && (
            <button 
              onClick={handleDelete} 
              className="btn" 
              style={{ 
                background: '#ef4444', 
                color: 'white',
                padding: '0.75rem 1.5rem'
              }}
              data-testid="delete-po-btn"
            >
              🗑️ Deletar OC
            </button>
          )}
        </div>
      </div>

      <div className="card" style={{ marginBottom: '2rem' }}>
        <h2 style={{ fontSize: '1.5rem', fontWeight: '700', marginBottom: '1rem' }}>Informações da OC</h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem' }}>
          <div>
            <div className="stat-label">Número OC</div>
            <div style={{ fontSize: '1.5rem', fontWeight: '700', color: '#2d3748' }}>{po.numero_oc}</div>
          </div>
          <div>
            <div className="stat-label">Cliente</div>
            <div style={{ fontSize: '1.5rem', fontWeight: '700', color: '#2d3748' }}>{po.cliente}</div>
          </div>
          <div>
            <div className="stat-label">Total de Itens</div>
            <div style={{ fontSize: '1.5rem', fontWeight: '700', color: '#667eea' }}>{po.items.length}</div>
          </div>
        </div>
      </div>

      <div className="card">
        <h2 style={{ fontSize: '1.5rem', fontWeight: '700', marginBottom: '1.5rem' }}>Itens da Ordem de Compra</h2>
        
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {po.items.map((item, index) => (
            <div key={index} className="card" style={{ background: '#f7fafc', border: '1px solid #e2e8f0' }} data-testid={`item-card-${item.codigo_item}`}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', marginBottom: '1rem' }}>
                <div>
                  <h3 style={{ fontSize: '1.1rem', fontWeight: '700', marginBottom: '0.5rem' }}>
                    Código: {item.codigo_item}
                  </h3>
                  <p style={{ color: '#4a5568', marginBottom: '0.5rem' }}>{item.descricao}</p>
                  <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', fontSize: '0.9rem', color: '#718096' }}>
                    <span><strong>Lote:</strong> {item.lote}</span>
                    <span><strong>Região:</strong> {item.regiao}</span>
                    <span><strong>Responsável:</strong> <strong style={{ color: '#667eea' }}>{item.responsavel}</strong></span>
                    <span><strong>Quantidade:</strong> {item.quantidade} {item.unidade}</span>
                    {item.marca_modelo && <span><strong>Marca/Modelo:</strong> {item.marca_modelo}</span>}
                  </div>
                </div>
                <div>
                  {getStatusBadge(item.status)}
                </div>
              </div>

              {editingItem === item.codigo_item ? (
                <div style={{ marginTop: '1rem', padding: '1rem', background: 'white', borderRadius: '8px' }}>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '1rem', marginBottom: '1rem' }}>
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
                    <div className="form-group">
                      <label className="form-label">Preço Compra (R$)</label>
                      <input
                        type="number"
                        step="0.01"
                        className="form-input"
                        value={formData.preco_compra}
                        onChange={(e) => setFormData({ ...formData, preco_compra: e.target.value })}
                        data-testid={`input-preco-compra-${item.codigo_item}`}
                      />
                    </div>
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
                  </div>
                  <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
                    <button onClick={cancelEdit} className="btn btn-secondary" style={{ padding: '0.5rem 1rem', fontSize: '0.9rem' }} data-testid={`cancel-edit-${item.codigo_item}`}>
                      Cancelar
                    </button>
                    <button onClick={() => saveEdit(item)} className="btn btn-primary" style={{ padding: '0.5rem 1rem', fontSize: '0.9rem' }} data-testid={`save-edit-${item.codigo_item}`}>
                      Salvar
                    </button>
                  </div>
                </div>
              ) : (
                <div style={{ marginTop: '1rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div style={{ display: 'flex', gap: '1.5rem', fontSize: '0.9rem', flexWrap: 'wrap' }}>
                    {item.marca_modelo && <span><strong>Marca/Modelo:</strong> {item.marca_modelo}</span>}
                    {item.preco_venda && (
                      <span>
                        <strong>Preço Venda:</strong> R$ {item.preco_venda.toFixed(2)}
                        {item.quantidade && <small> (Total: R$ {(item.preco_venda * item.quantidade).toFixed(2)})</small>}
                      </span>
                    )}
                    {item.preco_compra && <span><strong>Compra:</strong> R$ {item.preco_compra.toFixed(2)}</span>}
                    {item.imposto && <span><strong>Imposto:</strong> R$ {item.imposto.toFixed(2)}</span>}
                    {item.custo_frete && <span><strong>Frete:</strong> R$ {item.custo_frete.toFixed(2)}</span>}
                    {item.lucro_liquido && <span><strong>Lucro:</strong> <span style={{ color: item.lucro_liquido > 0 ? '#10b981' : '#ef4444', fontWeight: '700' }}>R$ {item.lucro_liquido.toFixed(2)}</span></span>}
                  </div>
                  <button onClick={() => startEdit(item)} className="btn btn-secondary" style={{ padding: '0.5rem 1rem', fontSize: '0.85rem' }} data-testid={`edit-item-${item.codigo_item}`}>
                    Editar
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default PODetails;
