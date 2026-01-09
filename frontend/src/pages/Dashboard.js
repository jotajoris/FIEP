import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { apiGet, apiPost, apiDelete, API, formatBRL } from '../utils/api';
import { useAuth } from '../contexts/AuthContext';

const Dashboard = () => {
  const { isAdmin } = useAuth();
  const [stats, setStats] = useState(null);
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [seeded, setSeeded] = useState(false);
  const [selectedOrders, setSelectedOrders] = useState(new Set());
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const [statsRes, ordersRes] = await Promise.all([
        apiGet(`${API}/dashboard`),
        apiGet(`${API}/purchase-orders`)
      ]);
      setStats(statsRes.data);
      setOrders(ordersRes.data);
      setSelectedOrders(new Set()); // Limpar seleção ao recarregar
    } catch (error) {
      console.error('Erro ao carregar dados:', error);
    } finally {
      setLoading(false);
    }
  };

  const seedDatabase = async () => {
    try {
      setSeeded(true);
      const response = await apiPost(`${API}/reference-items/seed`);
      alert(response.data.message);
    } catch (error) {
      console.error('Erro ao popular banco:', error);
      alert('Erro ao popular banco de dados');
    }
  };

  // Calcular valor total de uma OC
  const calcularValorTotalOC = (order) => {
    return order.items.reduce((total, item) => {
      const precoVenda = item.preco_venda || 0;
      const quantidade = item.quantidade || 0;
      return total + (precoVenda * quantidade);
    }, 0);
  };

  // Toggle seleção de uma OC
  const toggleSelectOrder = (orderId) => {
    const newSelected = new Set(selectedOrders);
    if (newSelected.has(orderId)) {
      newSelected.delete(orderId);
    } else {
      newSelected.add(orderId);
    }
    setSelectedOrders(newSelected);
  };

  // Selecionar/deselecionar todas
  const toggleSelectAll = () => {
    if (selectedOrders.size === orders.length) {
      setSelectedOrders(new Set());
    } else {
      setSelectedOrders(new Set(orders.map(o => o.id)));
    }
  };

  // Deletar OCs selecionadas
  const handleDeleteSelected = async () => {
    if (selectedOrders.size === 0) return;
    
    const count = selectedOrders.size;
    if (!window.confirm(`Tem certeza que deseja deletar ${count} OC(s) selecionada(s)?`)) {
      return;
    }

    setDeleting(true);
    try {
      const deletePromises = Array.from(selectedOrders).map(orderId => 
        apiDelete(`${API}/purchase-orders/${orderId}`)
      );
      await Promise.all(deletePromises);
      alert(`${count} OC(s) deletada(s) com sucesso!`);
      loadData();
    } catch (error) {
      console.error('Erro ao deletar OCs:', error);
      alert('Erro ao deletar algumas OCs. Recarregue a página.');
      loadData();
    } finally {
      setDeleting(false);
    }
  };

  const handleDeleteOrder = async (orderId, numeroOC) => {
    if (!window.confirm(`Tem certeza que deseja deletar a OC ${numeroOC}?`)) {
      return;
    }

    try {
      await apiDelete(`${API}/purchase-orders/${orderId}`);
      alert('OC deletada com sucesso!');
      loadData();
    } catch (error) {
      console.error('Erro ao deletar OC:', error);
      alert('Erro ao deletar OC');
    }
  };

  // Formatar valor em BRL
  const formatCurrency = (value) => {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL'
    }).format(value);
  };

  if (loading) {
    return <div className="loading" data-testid="loading-dashboard">Carregando...</div>;
  }

  return (
    <div data-testid="dashboard-page">
      <div className="page-header">
        <h1 className="page-title" data-testid="dashboard-title">Dashboard</h1>
        <p className="page-subtitle">Visão geral das Ordens de Compra FIEP</p>
      </div>

      {!seeded && isAdmin() && (
        <div className="card" style={{ marginBottom: '2rem', background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)', color: 'white' }}>
          <h3 style={{ marginBottom: '1rem' }}>Primeiro acesso?</h3>
          <p style={{ marginBottom: '1rem' }}>Popule o banco de dados com os itens de referência do Excel.</p>
          <button onClick={seedDatabase} className="btn btn-secondary" data-testid="seed-database-btn">
            Popular Banco de Dados
          </button>
        </div>
      )}

      {stats && (
        <>
          <div className="stats-grid">
            {isAdmin() && (
              <div className="stat-card" style={{ borderColor: '#667eea' }} data-testid="stat-total-ocs">
                <div className="stat-label">Total OCs</div>
                <div className="stat-value" style={{ color: '#667eea' }}>{stats.total_ocs}</div>
              </div>
            )}
            <Link 
              to="/items/status/pendente" 
              className="stat-card" 
              style={{ borderColor: '#f59e0b', cursor: 'pointer', textDecoration: 'none' }} 
              data-testid="stat-pendentes"
            >
              <div className="stat-label">Pendentes</div>
              <div className="stat-value" style={{ color: '#f59e0b' }}>{stats.items_pendentes}</div>
            </Link>
            <Link 
              to="/items/status/cotado" 
              className="stat-card" 
              style={{ borderColor: '#3b82f6', cursor: 'pointer', textDecoration: 'none' }} 
              data-testid="stat-cotados"
            >
              <div className="stat-label">Cotados</div>
              <div className="stat-value" style={{ color: '#3b82f6' }}>{stats.items_cotados}</div>
            </Link>
            <Link 
              to="/items/status/comprado" 
              className="stat-card" 
              style={{ borderColor: '#10b981', cursor: 'pointer', textDecoration: 'none' }} 
              data-testid="stat-comprados"
            >
              <div className="stat-label">Comprados</div>
              <div className="stat-value" style={{ color: '#10b981' }}>{stats.items_comprados}</div>
            </Link>
            <Link 
              to="/items/status/entregue" 
              className="stat-card" 
              style={{ borderColor: '#22c55e', cursor: 'pointer', textDecoration: 'none' }} 
              data-testid="stat-entregues"
            >
              <div className="stat-label">Entregues</div>
              <div className="stat-value" style={{ color: '#22c55e' }}>{stats.items_entregues}</div>
            </Link>
            <div className="stat-card" style={{ borderColor: '#8b5cf6' }} data-testid="stat-total-items">
              <div className="stat-label">Total Itens</div>
              <div className="stat-value" style={{ color: '#8b5cf6' }}>{stats.total_items}</div>
            </div>
          </div>

          {isAdmin() && (
            <div className="card" style={{ marginBottom: '2rem' }}>
              <h2 style={{ marginBottom: '1.5rem', fontSize: '1.5rem', fontWeight: '700' }}>Itens por Responsável</h2>
              <div className="owner-grid">
                {Object.entries(stats.items_por_responsavel).map(([owner, count]) => (
                  <Link key={owner} to={`/owner/${owner}`} className="owner-card" data-testid={`owner-card-${owner.toLowerCase()}`}>
                    <div className="owner-name">{owner}</div>
                    <div className="owner-count">{count}</div>
                  </Link>
                ))}
              </div>
            </div>
          )}
        </>
      )}

      <div className="card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
          <h2 style={{ fontSize: '1.5rem', fontWeight: '700' }}>Ordens de Compra</h2>
          <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
            {isAdmin() && selectedOrders.size > 0 && (
              <button 
                onClick={handleDeleteSelected}
                disabled={deleting}
                className="btn"
                style={{ 
                  background: '#ef4444',
                  color: 'white',
                  padding: '0.5rem 1rem',
                  fontSize: '0.9rem'
                }}
                data-testid="delete-selected-btn"
              >
                {deleting ? 'Deletando...' : `🗑️ Deletar ${selectedOrders.size} selecionada(s)`}
              </button>
            )}
            {isAdmin() && (
              <Link to="/create-po" className="btn btn-primary" data-testid="create-po-btn">
                + Nova OC
              </Link>
            )}
          </div>
        </div>
        
        {orders.length === 0 ? (
          <p style={{ textAlign: 'center', color: '#718096', padding: '2rem' }} data-testid="no-orders-message">
            Nenhuma ordem de compra cadastrada ainda.
          </p>
        ) : (
          <div className="table-container">
            <table data-testid="orders-table">
              <thead>
                <tr>
                  {isAdmin() && (
                    <th style={{ width: '40px', textAlign: 'center' }}>
                      <input 
                        type="checkbox"
                        checked={selectedOrders.size === orders.length && orders.length > 0}
                        onChange={toggleSelectAll}
                        style={{ width: '18px', height: '18px', cursor: 'pointer' }}
                        title="Selecionar todas"
                        data-testid="select-all-checkbox"
                      />
                    </th>
                  )}
                  <th>Número OC</th>
                  <th>Data Criação</th>
                  <th style={{ textAlign: 'center' }}>Qtd Itens</th>
                  <th style={{ textAlign: 'right' }}>Valor Total</th>
                  <th>Ações</th>
                </tr>
              </thead>
              <tbody>
                {orders.map((order) => {
                  const valorTotal = calcularValorTotalOC(order);
                  return (
                    <tr 
                      key={order.id} 
                      data-testid={`order-row-${order.numero_oc}`}
                      style={{ 
                        background: selectedOrders.has(order.id) ? '#e8f4fd' : 'transparent'
                      }}
                    >
                      {isAdmin() && (
                        <td style={{ textAlign: 'center' }}>
                          <input 
                            type="checkbox"
                            checked={selectedOrders.has(order.id)}
                            onChange={() => toggleSelectOrder(order.id)}
                            style={{ width: '18px', height: '18px', cursor: 'pointer' }}
                            data-testid={`select-order-${order.numero_oc}`}
                          />
                        </td>
                      )}
                      <td><strong>{order.numero_oc}</strong></td>
                      <td>{new Date(order.created_at).toLocaleDateString('pt-BR')}</td>
                      <td style={{ textAlign: 'center' }}>
                        <span style={{ 
                          background: '#e2e8f0', 
                          padding: '0.25rem 0.75rem', 
                          borderRadius: '12px',
                          fontWeight: '600',
                          fontSize: '0.9rem'
                        }}>
                          {order.items.length}
                        </span>
                      </td>
                      <td style={{ textAlign: 'right', fontWeight: '600', color: valorTotal > 0 ? '#059669' : '#718096' }}>
                        {valorTotal > 0 ? formatCurrency(valorTotal) : '-'}
                      </td>
                      <td>
                        <div style={{ display: 'flex', gap: '0.5rem' }}>
                          <Link to={`/po/${order.id}`} className="btn btn-secondary" style={{ padding: '0.5rem 1rem', fontSize: '0.85rem' }} data-testid={`view-po-${order.numero_oc}`}>
                            Ver Detalhes
                          </Link>
                          {isAdmin() && (
                            <button 
                              onClick={() => handleDeleteOrder(order.id, order.numero_oc)}
                              className="btn"
                              style={{ 
                                padding: '0.5rem 1rem', 
                                fontSize: '0.85rem',
                                background: '#ef4444',
                                color: 'white'
                              }}
                              data-testid={`delete-po-${order.numero_oc}`}
                            >
                              Deletar
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};

export default Dashboard;
