import React, { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { apiGet, API, formatBRL } from '../utils/api';

const OwnerPanel = () => {
  const { name } = useParams();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('todos');

  useEffect(() => {
    loadItems();
  }, [name]);

  const loadItems = async () => {
    try {
      const response = await apiGet(`${API}/purchase-orders`);
      
      const allItems = [];
      response.data.forEach(po => {
        po.items.forEach(item => {
          // Filtrar pelo responsável
          if (item.responsavel === name) {
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

  const filteredItems = statusFilter === 'todos' 
    ? items 
    : items.filter(item => item.status === statusFilter);

  const stats = {
    total: items.length,
    pendente: items.filter(i => i.status === 'pendente').length,
    cotado: items.filter(i => i.status === 'cotado').length,
    comprado: items.filter(i => i.status === 'comprado').length,
    entregue: items.filter(i => i.status === 'entregue').length
  };

  if (loading) {
    return <div className="loading" data-testid="loading-owner">Carregando...</div>;
  }

  return (
    <div data-testid="owner-panel-page">
      <div className="page-header">
        <h1 className="page-title" data-testid="owner-name">Painel de {name}</h1>
        <p className="page-subtitle">Seus itens e cotações</p>
      </div>

      <div className="stats-grid" style={{ marginBottom: '2rem' }}>
        <div className="stat-card" style={{ borderColor: '#8b5cf6' }} data-testid="owner-stat-total">
          <div className="stat-label">Total de Itens</div>
          <div className="stat-value" style={{ color: '#8b5cf6' }}>{stats.total}</div>
        </div>
        <div className="stat-card" style={{ borderColor: '#f59e0b' }} data-testid="owner-stat-pendente">
          <div className="stat-label">Pendentes</div>
          <div className="stat-value" style={{ color: '#f59e0b' }}>{stats.pendente}</div>
        </div>
        <div className="stat-card" style={{ borderColor: '#3b82f6' }} data-testid="owner-stat-cotado">
          <div className="stat-label">Cotados</div>
          <div className="stat-value" style={{ color: '#3b82f6' }}>{stats.cotado}</div>
        </div>
        <div className="stat-card" style={{ borderColor: '#10b981' }} data-testid="owner-stat-comprado">
          <div className="stat-label">Comprados</div>
          <div className="stat-value" style={{ color: '#10b981' }}>{stats.comprado}</div>
        </div>
        <div className="stat-card" style={{ borderColor: '#22c55e' }} data-testid="owner-stat-entregue">
          <div className="stat-label">Entregues</div>
          <div className="stat-value" style={{ color: '#22c55e' }}>{stats.entregue}</div>
        </div>
      </div>

      <div className="card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem', flexWrap: 'wrap', gap: '1rem' }}>
          <h2 style={{ fontSize: '1.5rem', fontWeight: '700' }}>Meus Itens</h2>
          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
            <button
              onClick={() => setStatusFilter('todos')}
              className={`btn ${statusFilter === 'todos' ? 'btn-primary' : 'btn-secondary'}`}
              style={{ padding: '0.5rem 1rem', fontSize: '0.85rem' }}
              data-testid="filter-todos"
            >
              Todos
            </button>
            <button
              onClick={() => setStatusFilter('pendente')}
              className={`btn ${statusFilter === 'pendente' ? 'btn-primary' : 'btn-secondary'}`}
              style={{ padding: '0.5rem 1rem', fontSize: '0.85rem' }}
              data-testid="filter-pendente"
            >
              Pendentes
            </button>
            <button
              onClick={() => setStatusFilter('cotado')}
              className={`btn ${statusFilter === 'cotado' ? 'btn-primary' : 'btn-secondary'}`}
              style={{ padding: '0.5rem 1rem', fontSize: '0.85rem' }}
              data-testid="filter-cotado"
            >
              Cotados
            </button>
            <button
              onClick={() => setStatusFilter('comprado')}
              className={`btn ${statusFilter === 'comprado' ? 'btn-primary' : 'btn-secondary'}`}
              style={{ padding: '0.5rem 1rem', fontSize: '0.85rem' }}
              data-testid="filter-comprado"
            >
              Comprados
            </button>
            <button
              onClick={() => setStatusFilter('entregue')}
              className={`btn ${statusFilter === 'entregue' ? 'btn-primary' : 'btn-secondary'}`}
              style={{ padding: '0.5rem 1rem', fontSize: '0.85rem' }}
              data-testid="filter-entregue"
            >
              Entregues
            </button>
          </div>
        </div>

        {filteredItems.length === 0 ? (
          <p style={{ textAlign: 'center', color: '#718096', padding: '2rem' }} data-testid="no-items-message">
            Nenhum item encontrado.
          </p>
        ) : (
          <div className="table-container">
            <table data-testid="owner-items-table">
              <thead>
                <tr>
                  <th>Nº OC</th>
                  <th>Código</th>
                  <th>Descrição</th>
                  <th>Lote</th>
                  <th>Quantidade</th>
                  <th>Status</th>
                  <th>Ações</th>
                </tr>
              </thead>
              <tbody>
                {filteredItems.map((item, index) => (
                  <tr key={index} data-testid={`owner-item-${item.codigo_item}`}>
                    <td><strong>{item.numero_oc}</strong></td>
                    <td>{item.codigo_item}</td>
                    <td style={{ maxWidth: '300px' }}>{item.descricao}</td>
                    <td>{item.lote}</td>
                    <td>{item.quantidade} {item.unidade}</td>
                    <td><span className={`status-badge status-${item.status}`}>{item.status}</span></td>
                    <td>
                      <Link to={`/po/${item.po_id}`} className="btn btn-secondary" style={{ padding: '0.4rem 0.8rem', fontSize: '0.8rem' }} data-testid={`view-po-${item.codigo_item}`}>
                        Ver OC
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};

export default OwnerPanel;
