import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { apiGet, apiPost, apiDelete, API } from '../utils/api';
import { useAuth } from '../contexts/AuthContext';

const Dashboard = () => {
  const { isAdmin } = useAuth();
  const [stats, setStats] = useState(null);
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [seeded, setSeeded] = useState(false);

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

  const handleDeleteOrder = async (orderId, numeroOC) => {
    if (!window.confirm(`Tem certeza que deseja deletar a OC ${numeroOC}?`)) {
      return;
    }

    try {
      await apiDelete(`${API}/purchase-orders/${orderId}`);
      alert('OC deletada com sucesso!');
      loadData(); // Recarregar dados
    } catch (error) {
      console.error('Erro ao deletar OC:', error);
      alert('Erro ao deletar OC');
    }
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
            <div className="stat-card" style={{ borderColor: '#f59e0b' }} data-testid="stat-pendentes">
              <div className="stat-label">Pendentes</div>
              <div className="stat-value" style={{ color: '#f59e0b' }}>{stats.items_pendentes}</div>
            </div>
            <div className="stat-card" style={{ borderColor: '#3b82f6' }} data-testid="stat-cotados">
              <div className="stat-label">Cotados</div>
              <div className="stat-value" style={{ color: '#3b82f6' }}>{stats.items_cotados}</div>
            </div>
            <div className="stat-card" style={{ borderColor: '#10b981' }} data-testid="stat-comprados">
              <div className="stat-label">Comprados</div>
              <div className="stat-value" style={{ color: '#10b981' }}>{stats.items_comprados}</div>
            </div>
            <div className="stat-card" style={{ borderColor: '#22c55e' }} data-testid="stat-entregues">
              <div className="stat-label">Entregues</div>
              <div className="stat-value" style={{ color: '#22c55e' }}>{stats.items_entregues}</div>
            </div>
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
          {isAdmin() && (
            <Link to="/create-po" className="btn btn-primary" data-testid="create-po-btn">
              + Nova OC
            </Link>
          )}
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
                  <th>Número OC</th>
                  <th>Data Criação</th>
                  <th>Total Itens</th>
                  <th>Ações</th>
                </tr>
              </thead>
              <tbody>
                {orders.map((order) => (
                  <tr key={order.id} data-testid={`order-row-${order.numero_oc}`}>
                    <td><strong>{order.numero_oc}</strong></td>
                    <td>{new Date(order.created_at).toLocaleDateString('pt-BR')}</td>
                    <td>{order.items.length}</td>
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
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};

export default Dashboard;
