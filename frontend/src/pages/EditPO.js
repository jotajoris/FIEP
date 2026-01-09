import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { apiGet, apiPatch, API, formatBRL } from '../utils/api';
import { useAuth } from '../contexts/AuthContext';

const RESPONSAVEIS = ['Maria', 'Mateus', 'João', 'Mylena', 'Fabio'];

// Função para remover acentos e converter para maiúsculas
const normalizeText = (text) => {
  if (!text) return '';
  return text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase();
};

const EditPO = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const { isAdmin } = useAuth();
  const [order, setOrder] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editingItem, setEditingItem] = useState(null); // Agora usa índice
  const [editForm, setEditForm] = useState({});

  useEffect(() => {
    if (!isAdmin()) {
      navigate('/');
      return;
    }
    loadOrder();
  }, [id, isAdmin, navigate]);

  const loadOrder = async () => {
    try {
      const response = await apiGet(`${API}/purchase-orders/${id}`);
      setOrder(response.data);
    } catch (error) {
      console.error('Erro ao carregar OC:', error);
      alert('Erro ao carregar OC');
      navigate('/');
    } finally {
      setLoading(false);
    }
  };

  const startEditItem = (item, index) => {
    setEditingItem(index); // Usar índice em vez de codigo_item
    setEditForm({
      codigo_item: item.codigo_item,
      descricao: item.descricao || '',
      quantidade: item.quantidade || 1,
      unidade: item.unidade || 'UN',
      responsavel: item.responsavel || '',
      lote: item.lote || '',
      marca_modelo: item.marca_modelo || '',
      preco_venda: item.preco_venda || '',
      status: item.status || 'pendente',
      itemIndex: index // Guardar o índice para o save
    });
  };

  const cancelEdit = () => {
    setEditingItem(null);
    setEditForm({});
  };

  const saveItem = async () => {
    setSaving(true);
    try {
      // Usar o novo endpoint que aceita índice
      const fullUpdate = {
        descricao: editForm.descricao,
        quantidade: parseInt(editForm.quantidade) || 1,
        unidade: editForm.unidade,
        responsavel: editForm.responsavel,
        lote: editForm.lote,
        marca_modelo: editForm.marca_modelo,
        status: editForm.status,
        preco_venda: editForm.preco_venda ? parseFloat(editForm.preco_venda) : null
      };

      await apiPatch(`${API}/purchase-orders/${id}/items/by-index/${editForm.itemIndex}/full`, fullUpdate);

      alert('Item atualizado com sucesso!');
      setEditingItem(null);
      setEditForm({});
      loadOrder();
    } catch (error) {
      console.error('Erro ao atualizar item:', error);
      alert('Erro ao atualizar item. Verifique os dados.');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <div className="loading" data-testid="loading-edit-po">Carregando...</div>;
  }

  if (!order) {
    return <div className="loading">OC não encontrada</div>;
  }

  return (
    <div data-testid="edit-po-page">
      <div className="page-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <button 
            onClick={() => navigate('/')} 
            className="btn btn-secondary"
            data-testid="back-btn"
          >
            ← Voltar
          </button>
          <div>
            <h1 className="page-title" data-testid="edit-po-title">
              Editar OC: {order.numero_oc}
            </h1>
            <p className="page-subtitle">
              Modifique os dados dos itens desta ordem de compra
            </p>
          </div>
        </div>
      </div>

      {/* Informações da OC */}
      <div className="card" style={{ marginBottom: '1.5rem' }}>
        <div style={{ display: 'flex', gap: '2rem', flexWrap: 'wrap' }}>
          <div>
            <span style={{ fontWeight: '600', color: '#4a5568' }}>Número OC:</span>
            <span style={{ marginLeft: '0.5rem', fontWeight: '700', color: '#667eea' }}>{order.numero_oc}</span>
          </div>
          <div>
            <span style={{ fontWeight: '600', color: '#4a5568' }}>Data Criação:</span>
            <span style={{ marginLeft: '0.5rem' }}>{new Date(order.created_at).toLocaleDateString('pt-BR')}</span>
          </div>
          <div>
            <span style={{ fontWeight: '600', color: '#4a5568' }}>Total de Itens:</span>
            <span style={{ marginLeft: '0.5rem' }}>{order.items.length}</span>
          </div>
          {order.endereco_entrega && (
            <div>
              <span style={{ fontWeight: '600', color: '#4a5568' }}>Endereço:</span>
              <span style={{ marginLeft: '0.5rem' }}>{order.endereco_entrega}</span>
            </div>
          )}
        </div>
      </div>

      {/* Lista de Itens */}
      <div className="card">
        <h2 style={{ marginBottom: '1.5rem', fontSize: '1.25rem', fontWeight: '700' }}>
          Itens da OC ({order.items.length})
        </h2>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {order.items.map((item, index) => (
            <div 
              key={`item-${index}`}
              className="card"
              style={{ 
                background: editingItem === index ? '#fffbeb' : '#f7fafc',
                border: editingItem === index ? '2px solid #f59e0b' : '1px solid #e2e8f0'
              }}
              data-testid={`edit-item-card-${index}`}
            >
              {editingItem === index ? (
                /* Modo de Edição */
                <div>
                  <div style={{ 
                    display: 'flex', 
                    justifyContent: 'space-between', 
                    alignItems: 'center',
                    marginBottom: '1rem',
                    paddingBottom: '1rem',
                    borderBottom: '2px solid #f59e0b'
                  }}>
                    <h3 style={{ margin: 0, color: '#b45309' }}>
                      ✏️ Editando Item #{index + 1}
                    </h3>
                  </div>

                  <div style={{ 
                    display: 'grid', 
                    gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', 
                    gap: '1rem',
                    marginBottom: '1.5rem'
                  }}>
                    {/* Código do Item */}
                    <div className="form-group">
                      <label className="form-label">Código do Item</label>
                      <input
                        type="text"
                        className="form-input"
                        value={editForm.codigo_item}
                        disabled
                        style={{ background: '#e2e8f0' }}
                      />
                    </div>

                    {/* Descrição */}
                    <div className="form-group" style={{ gridColumn: 'span 2' }}>
                      <label className="form-label">Descrição</label>
                      <input
                        type="text"
                        className="form-input"
                        value={editForm.descricao}
                        onChange={(e) => setEditForm({ ...editForm, descricao: normalizeText(e.target.value) })}
                        style={{ textTransform: 'uppercase' }}
                        data-testid="edit-descricao"
                      />
                    </div>

                    {/* Quantidade */}
                    <div className="form-group">
                      <label className="form-label">Quantidade</label>
                      <input
                        type="number"
                        min="1"
                        className="form-input"
                        value={editForm.quantidade}
                        onChange={(e) => setEditForm({ ...editForm, quantidade: e.target.value })}
                        data-testid="edit-quantidade"
                      />
                    </div>

                    {/* Unidade */}
                    <div className="form-group">
                      <label className="form-label">Unidade</label>
                      <select
                        className="form-input"
                        value={editForm.unidade}
                        onChange={(e) => setEditForm({ ...editForm, unidade: e.target.value })}
                        data-testid="edit-unidade"
                      >
                        <option value="UN">UN</option>
                        <option value="PC">PC</option>
                        <option value="PÇA">PÇA</option>
                        <option value="CJ">CJ</option>
                        <option value="KIT">KIT</option>
                        <option value="MT">MT</option>
                        <option value="M">M</option>
                        <option value="RL">RL</option>
                      </select>
                    </div>

                    {/* Responsável */}
                    <div className="form-group">
                      <label className="form-label">Responsável</label>
                      <select
                        className="form-input"
                        value={editForm.responsavel}
                        onChange={(e) => setEditForm({ ...editForm, responsavel: e.target.value })}
                        data-testid="edit-responsavel"
                      >
                        <option value="">Selecione...</option>
                        {RESPONSAVEIS.map(r => (
                          <option key={r} value={r}>{r}</option>
                        ))}
                      </select>
                    </div>

                    {/* Lote */}
                    <div className="form-group">
                      <label className="form-label">Lote</label>
                      <input
                        type="text"
                        className="form-input"
                        value={editForm.lote}
                        onChange={(e) => setEditForm({ ...editForm, lote: normalizeText(e.target.value) })}
                        style={{ textTransform: 'uppercase' }}
                        data-testid="edit-lote"
                      />
                    </div>

                    {/* Marca/Modelo */}
                    <div className="form-group">
                      <label className="form-label">Marca/Modelo</label>
                      <input
                        type="text"
                        className="form-input"
                        value={editForm.marca_modelo}
                        onChange={(e) => setEditForm({ ...editForm, marca_modelo: normalizeText(e.target.value) })}
                        style={{ textTransform: 'uppercase' }}
                        data-testid="edit-marca-modelo"
                      />
                    </div>

                    {/* Preço de Venda */}
                    <div className="form-group">
                      <label className="form-label">Preço Venda Unit. (R$)</label>
                      <input
                        type="number"
                        step="0.01"
                        className="form-input"
                        value={editForm.preco_venda}
                        onChange={(e) => setEditForm({ ...editForm, preco_venda: e.target.value })}
                        data-testid="edit-preco-venda"
                      />
                    </div>

                    {/* Status */}
                    <div className="form-group">
                      <label className="form-label">Status</label>
                      <select
                        className="form-input"
                        value={editForm.status}
                        onChange={(e) => setEditForm({ ...editForm, status: e.target.value })}
                        data-testid="edit-status"
                      >
                        <option value="pendente">Pendente</option>
                        <option value="cotado">Cotado</option>
                        <option value="comprado">Comprado</option>
                        <option value="em_separacao">Em Separação</option>
                        <option value="em_transito">Em Trânsito</option>
                        <option value="entregue">Entregue</option>
                      </select>
                    </div>
                  </div>

                  {/* Botões de Ação */}
                  <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end' }}>
                    <button
                      onClick={cancelEdit}
                      className="btn btn-secondary"
                      disabled={saving}
                      data-testid="cancel-edit-btn"
                    >
                      Cancelar
                    </button>
                    <button
                      onClick={saveItem}
                      className="btn btn-primary"
                      disabled={saving}
                      data-testid="save-edit-btn"
                    >
                      {saving ? 'Salvando...' : '💾 Salvar Alterações'}
                    </button>
                  </div>
                </div>
              ) : (
                /* Modo de Visualização */
                <div>
                  <div style={{ 
                    display: 'flex', 
                    justifyContent: 'space-between', 
                    alignItems: 'start',
                    marginBottom: '0.75rem'
                  }}>
                    <div>
                      <div style={{ display: 'flex', gap: '1rem', alignItems: 'center', marginBottom: '0.5rem' }}>
                        <span style={{ 
                          background: '#667eea', 
                          color: 'white', 
                          padding: '0.25rem 0.75rem', 
                          borderRadius: '4px',
                          fontSize: '0.85rem',
                          fontWeight: '600'
                        }}>
                          #{index + 1}
                        </span>
                        <strong style={{ fontSize: '1.1rem' }}>Código: {item.codigo_item}</strong>
                        <span className={`status-badge status-${item.status}`}>{item.status}</span>
                      </div>
                      <p style={{ color: '#4a5568', marginBottom: '0.5rem' }}>{item.descricao}</p>
                    </div>
                    <button
                      onClick={() => startEditItem(item, index)}
                      className="btn"
                      style={{ 
                        background: '#f59e0b', 
                        color: 'white',
                        padding: '0.5rem 1rem',
                        fontSize: '0.85rem'
                      }}
                      data-testid={`start-edit-${index}`}
                    >
                      ✏️ Editar
                    </button>
                  </div>

                  <div style={{ 
                    display: 'flex', 
                    gap: '1.5rem', 
                    flexWrap: 'wrap',
                    fontSize: '0.9rem',
                    color: '#718096'
                  }}>
                    <span>
                      <strong>Responsável:</strong>{' '}
                      <span style={{ color: '#667eea', fontWeight: '600' }}>{item.responsavel || '-'}</span>
                    </span>
                    <span><strong>Quantidade:</strong> {item.quantidade} {item.unidade}</span>
                    <span><strong>Lote:</strong> {item.lote || '-'}</span>
                    <span><strong>Marca/Modelo:</strong> {item.marca_modelo || '-'}</span>
                    {item.preco_venda && (
                      <>
                        <span><strong>Preço Venda:</strong> {formatBRL(item.preco_venda)}</span>
                        <span>
                          <strong>Valor Total:</strong>{' '}
                          <span style={{ color: '#059669', fontWeight: '600' }}>
                            {formatBRL(item.preco_venda * item.quantidade)}
                          </span>
                        </span>
                      </>
                    )}
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default EditPO;
