import React, { useState, useEffect, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { apiGet, apiPost, apiDelete, API, formatBRL } from '../utils/api';
import { useAuth } from '../contexts/AuthContext';
import Pagination from '../components/Pagination';

const Dashboard = () => {
  const { isAdmin } = useAuth();
  const [stats, setStats] = useState(null);
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [seeded, setSeeded] = useState(false);
  const [selectedOrders, setSelectedOrders] = useState(new Set());
  const [deleting, setDeleting] = useState(false);
  
  // Paginação
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(5);
  
  // Filtros
  const [searchTerm, setSearchTerm] = useState('');
  const [searchCodigoItem, setSearchCodigoItem] = useState('');
  const [searchResponsavel, setSearchResponsavel] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  
  // Loading de filtro (para feedback visual)
  const [filtering, setFiltering] = useState(false);

  useEffect(() => {
    loadData();
  }, []);

  // Recarregar quando filtros mudam (com debounce)
  useEffect(() => {
    const timer = setTimeout(() => {
      loadData();
    }, 300);
    return () => clearTimeout(timer);
  }, [searchTerm, searchCodigoItem, searchResponsavel, dateFrom, dateTo]);

  // Filtrar ordens (agora é feito no servidor, mas mantemos para paginação local)
  const filteredOrders = useMemo(() => {
    return orders; // Filtros já aplicados no servidor
  }, [orders]);

  // Dados paginados
  const paginatedOrders = useMemo(() => {
    const startIndex = (currentPage - 1) * itemsPerPage;
    return filteredOrders.slice(startIndex, startIndex + itemsPerPage);
  }, [filteredOrders, currentPage, itemsPerPage]);

  // Reset página quando filtros mudam
  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, searchCodigoItem, searchResponsavel, dateFrom, dateTo]);

  const clearFilters = () => {
    setSearchTerm('');
    setSearchCodigoItem('');
    setSearchResponsavel('');
    setDateFrom('');
    setDateTo('');
  };

  const loadData = async () => {
    setLoading(true);
    setFiltering(true);
    setError(null);
    try {
      // Construir query params para filtros
      const params = new URLSearchParams();
      if (searchTerm) params.append('search_oc', searchTerm);
      if (searchCodigoItem) params.append('search_codigo', searchCodigoItem);
      if (searchResponsavel) params.append('search_responsavel', searchResponsavel);
      if (dateFrom) params.append('date_from', dateFrom);
      if (dateTo) params.append('date_to', dateTo);
      
      const queryString = params.toString();
      const ordersUrl = `${API}/purchase-orders/list/simple${queryString ? '?' + queryString : ''}`;
      
      const [statsRes, ordersRes] = await Promise.all([
        apiGet(`${API}/dashboard`),
        apiGet(ordersUrl)
      ]);
      setStats(statsRes.data);
      setOrders(ordersRes.data);
      setSelectedOrders(new Set());
    } catch (error) {
      console.error('Erro ao carregar dados:', error);
      setError('Erro ao carregar dados. Clique para tentar novamente.');
    } finally {
      setLoading(false);
      setFiltering(false);
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

  const exportBackup = async () => {
    try {
      const response = await apiGet(`${API}/backup/export`);
      const backup = response.data;
      
      // Criar arquivo JSON para download
      const dataStr = JSON.stringify(backup, null, 2);
      const dataBlob = new Blob([dataStr], { type: 'application/json' });
      const url = URL.createObjectURL(dataBlob);
      
      // Criar link de download
      const link = document.createElement('a');
      link.href = url;
      const dataAtual = new Date().toISOString().split('T')[0];
      const horaAtual = new Date().toTimeString().split(' ')[0].replace(/:/g, '-');
      link.download = `backup_fiep_${dataAtual}_${horaAtual}.json`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      
      const stats = backup.backup_info.estatisticas;
      alert(`✅ Backup exportado com sucesso!\n\n📊 Estatísticas:\n- ${stats.total_ocs} OCs\n- ${stats.total_itens} Itens\n- ${stats.items_com_cotacao || 0} com cotação\n- ${stats.items_com_link || 0} com link\n- R$ ${(stats.valor_total_venda || 0).toLocaleString('pt-BR', {minimumFractionDigits: 2})} valor total`);
    } catch (error) {
      console.error('Erro ao exportar backup:', error);
      alert('❌ Erro ao exportar backup');
    }
  };

  const handleRestoreBackup = async (event) => {
    const file = event.target.files[0];
    if (!file) return;
    
    // Confirmar antes de restaurar
    const confirma = window.confirm(
      `⚠️ ATENÇÃO!\n\nVocê está prestes a RESTAURAR o backup "${file.name}".\n\nIsso irá SUBSTITUIR todos os dados atuais do sistema!\n\nTem certeza que deseja continuar?`
    );
    
    if (!confirma) {
      event.target.value = '';
      return;
    }
    
    // Segunda confirmação
    const confirma2 = window.confirm(
      `🚨 CONFIRMAÇÃO FINAL\n\nTodos os dados atuais serão PERDIDOS e substituídos pelo backup.\n\nDigite "RESTAURAR" no próximo prompt para confirmar.`
    );
    
    if (!confirma2) {
      event.target.value = '';
      return;
    }
    
    const digitou = window.prompt('Digite "RESTAURAR" para confirmar:');
    if (digitou !== 'RESTAURAR') {
      alert('Restauração cancelada.');
      event.target.value = '';
      return;
    }
    
    try {
      const fileContent = await file.text();
      const backupData = JSON.parse(fileContent);
      
      // Verificar se é um backup válido
      if (!backupData.backup_info || !backupData.purchase_orders) {
        alert('❌ Arquivo de backup inválido!');
        event.target.value = '';
        return;
      }
      
      const response = await apiPost(`${API}/backup/restore-data`, backupData);
      
      if (response.data.success) {
        alert(`✅ Backup restaurado com sucesso!\n\n📊 Detalhes:\n- Data do backup: ${response.data.detalhes.data_backup}\n- OCs restauradas: ${response.data.detalhes.ocs_restauradas}\n- Itens de referência: ${response.data.detalhes.itens_referencia}\n\nA página será recarregada.`);
        window.location.reload();
      } else {
        alert('❌ Erro ao restaurar backup');
      }
    } catch (error) {
      console.error('Erro ao restaurar backup:', error);
      alert(`❌ Erro ao restaurar backup: ${error.message}`);
    }
    
    event.target.value = '';
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

  // Selecionar/deselecionar todas (apenas das filtradas)
  const toggleSelectAll = () => {
    if (selectedOrders.size === filteredOrders.length) {
      setSelectedOrders(new Set());
    } else {
      setSelectedOrders(new Set(filteredOrders.map(o => o.id)));
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

  if (loading) {
    return <div className="loading" data-testid="loading-dashboard">Carregando...</div>;
  }

  if (error) {
    return (
      <div style={{ 
        display: 'flex', 
        flexDirection: 'column', 
        alignItems: 'center', 
        justifyContent: 'center', 
        minHeight: '50vh',
        gap: '1rem'
      }}>
        <div style={{ fontSize: '3rem' }}>⚠️</div>
        <p style={{ color: '#e53e3e', fontSize: '1.1rem' }}>{error}</p>
        <button 
          onClick={loadData} 
          className="btn btn-primary"
          style={{ padding: '0.75rem 2rem' }}
        >
          🔄 Tentar Novamente
        </button>
      </div>
    );
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
              to="/items/status/em_separacao" 
              className="stat-card" 
              style={{ borderColor: '#f97316', cursor: 'pointer', textDecoration: 'none' }} 
              data-testid="stat-em-separacao"
            >
              <div className="stat-label">Em Separação</div>
              <div className="stat-value" style={{ color: '#f97316' }}>{stats.items_em_separacao || 0}</div>
            </Link>
            <Link 
              to="/items/status/em_transito" 
              className="stat-card" 
              style={{ borderColor: '#8b5cf6', cursor: 'pointer', textDecoration: 'none' }} 
              data-testid="stat-em-transito"
            >
              <div className="stat-label">Em Trânsito</div>
              <div className="stat-value" style={{ color: '#8b5cf6' }}>{stats.items_em_transito || 0}</div>
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
            <div className="stat-card" style={{ borderColor: '#6b7280' }} data-testid="stat-total-items">
              <div className="stat-label">Total Itens</div>
              <div className="stat-value" style={{ color: '#6b7280' }}>{stats.total_items}</div>
            </div>
          </div>

          {isAdmin() && (
            <div className="card" style={{ marginBottom: '2rem' }}>
              <h2 style={{ marginBottom: '1.5rem', fontSize: '1.5rem', fontWeight: '700' }}>Itens por Responsável</h2>
              <div className="owner-grid">
                {Object.entries(stats.items_por_responsavel).map(([owner, breakdown]) => (
                  <Link key={owner} to={`/owner/${owner}`} className="owner-card" data-testid={`owner-card-${owner.toLowerCase()}`} style={{ padding: '1rem', minHeight: '140px' }}>
                    <div className="owner-name" style={{ marginBottom: '0.5rem' }}>{owner}</div>
                    <div className="owner-count" style={{ marginBottom: '0.75rem' }}>{breakdown.total || breakdown}</div>
                    {breakdown.total !== undefined && (
                      <div style={{ fontSize: '0.7rem', color: '#6b7280', lineHeight: '1.4' }}>
                        {breakdown.pendente > 0 && <div style={{ color: '#f59e0b' }}>⏳ Pendente: {breakdown.pendente}</div>}
                        {breakdown.cotado > 0 && <div style={{ color: '#3b82f6' }}>📋 Cotado: {breakdown.cotado}</div>}
                        {breakdown.comprado > 0 && <div style={{ color: '#8b5cf6' }}>🛒 Comprado: {breakdown.comprado}</div>}
                        {breakdown.em_separacao > 0 && <div style={{ color: '#ec4899' }}>📦 Separação: {breakdown.em_separacao}</div>}
                        {breakdown.em_transito > 0 && <div style={{ color: '#06b6d4' }}>🚚 Trânsito: {breakdown.em_transito}</div>}
                        {breakdown.entregue > 0 && <div style={{ color: '#22c55e' }}>✅ Entregue: {breakdown.entregue}</div>}
                      </div>
                    )}
                  </Link>
                ))}
              </div>
            </div>
          )}

          {/* Área Admin - Backup */}
          {isAdmin() && (
            <div className="card" style={{ 
              marginBottom: '2rem', 
              background: 'linear-gradient(135deg, #059669 0%, #047857 100%)', 
              color: 'white' 
            }}>
              <div style={{ marginBottom: '1rem' }}>
                <h3 style={{ marginBottom: '0.5rem', fontSize: '1.2rem' }}>🔐 Backup do Sistema</h3>
                <p style={{ fontSize: '0.9rem', opacity: 0.9 }}>
                  Exporte ou restaure todos os dados: OCs, itens, cotações, links, fornecedores, fretes, valores.
                </p>
              </div>
              <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
                <button 
                  onClick={exportBackup} 
                  className="btn"
                  style={{ 
                    background: 'white', 
                    color: '#059669',
                    padding: '0.75rem 1.5rem',
                    fontWeight: '600',
                    fontSize: '1rem'
                  }}
                  data-testid="export-backup-btn"
                >
                  📥 Exportar Backup
                </button>
                <label 
                  className="btn"
                  style={{ 
                    background: '#fbbf24', 
                    color: '#78350f',
                    padding: '0.75rem 1.5rem',
                    fontWeight: '600',
                    fontSize: '1rem',
                    cursor: 'pointer'
                  }}
                  data-testid="restore-backup-btn"
                >
                  📤 Restaurar Backup
                  <input 
                    type="file" 
                    accept=".json"
                    onChange={handleRestoreBackup}
                    style={{ display: 'none' }}
                  />
                </label>
              </div>
            </div>
          )}
        </>
      )}

      <div className="card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem', flexWrap: 'wrap', gap: '1rem' }}>
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

        {/* Filtros e Pesquisa */}
        <div style={{ 
          display: 'flex', 
          gap: '1rem', 
          marginBottom: '1.5rem', 
          flexWrap: 'wrap',
          padding: '1rem',
          background: '#f7fafc',
          borderRadius: '8px',
          border: '1px solid #e2e8f0'
        }}>
          {/* Pesquisa por número da OC */}
          <div style={{ flex: '1', minWidth: '150px' }}>
            <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '600', fontSize: '0.85rem', color: '#4a5568' }}>
              📋 Número OC
            </label>
            <input
              type="text"
              placeholder="Ex: OC-2.118..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="form-input"
              style={{ width: '100%' }}
              data-testid="search-oc-input"
            />
          </div>
          
          {/* Pesquisa por código do item */}
          <div style={{ flex: '1', minWidth: '150px' }}>
            <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '600', fontSize: '0.85rem', color: '#4a5568' }}>
              🔍 Código Item
            </label>
            <input
              type="text"
              placeholder="Ex: 114641..."
              value={searchCodigoItem}
              onChange={(e) => setSearchCodigoItem(e.target.value)}
              className="form-input"
              style={{ width: '100%' }}
              data-testid="search-codigo-input"
            />
          </div>
          
          {/* Filtro por responsável */}
          <div style={{ flex: '1', minWidth: '140px' }}>
            <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '600', fontSize: '0.85rem', color: '#4a5568' }}>
              👤 Responsável
            </label>
            <select
              value={searchResponsavel}
              onChange={(e) => setSearchResponsavel(e.target.value)}
              className="form-input"
              style={{ width: '100%' }}
              data-testid="search-responsavel-input"
            >
              <option value="">Todos</option>
              <option value="nao_atribuido">⚠️ Não Atribuído</option>
              <option value="Maria">Maria</option>
              <option value="Mateus">Mateus</option>
              <option value="João">João</option>
              <option value="Mylena">Mylena</option>
              <option value="Fabio">Fabio</option>
            </select>
          </div>
          
          {/* Filtro por data inicial */}
          <div style={{ minWidth: '130px' }}>
            <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '600', fontSize: '0.85rem', color: '#4a5568' }}>
              📅 De
            </label>
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              className="form-input"
              style={{ width: '100%' }}
              data-testid="date-from-input"
            />
          </div>
          
          {/* Filtro por data final */}
          <div style={{ minWidth: '130px' }}>
            <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '600', fontSize: '0.85rem', color: '#4a5568' }}>
              📅 Até
            </label>
            <input
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              className="form-input"
              style={{ width: '100%' }}
              data-testid="date-to-input"
            />
          </div>
          
          {/* Botão Limpar Filtros */}
          {(searchTerm || searchCodigoItem || searchResponsavel || dateFrom || dateTo) && (
            <div style={{ display: 'flex', alignItems: 'flex-end' }}>
              <button
                onClick={clearFilters}
                className="btn btn-secondary"
                style={{ padding: '0.75rem 1rem', fontSize: '0.85rem' }}
                data-testid="clear-filters-btn"
              >
                ✕ Limpar
              </button>
            </div>
          )}
        </div>

        {/* Contador de resultados */}
        {(searchTerm || dateFrom || dateTo) && (
          <div style={{ marginBottom: '1rem', color: '#718096', fontSize: '0.9rem' }}>
            Mostrando {filteredOrders.length} de {orders.length} OCs
          </div>
        )}
        
        {filteredOrders.length === 0 ? (
          <p style={{ textAlign: 'center', color: '#718096', padding: '2rem' }} data-testid="no-orders-message">
            {orders.length === 0 
              ? 'Nenhuma ordem de compra cadastrada ainda.'
              : 'Nenhuma OC encontrada com os filtros aplicados.'
            }
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
                        checked={selectedOrders.size === filteredOrders.length && filteredOrders.length > 0}
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
                {paginatedOrders.map((order) => (
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
                          {order.total_items}
                        </span>
                      </td>
                      <td style={{ textAlign: 'right', fontWeight: '600', color: order.valor_total > 0 ? '#059669' : '#718096' }}>
                        {order.valor_total > 0 ? formatBRL(order.valor_total) : '-'}
                      </td>
                      <td>
                        <div style={{ display: 'flex', gap: '0.5rem' }}>
                          <Link to={`/po/${order.id}`} className="btn btn-secondary" style={{ padding: '0.5rem 1rem', fontSize: '0.85rem' }} data-testid={`view-po-${order.numero_oc}`}>
                            Ver Detalhes
                          </Link>
                          {isAdmin() && (
                            <>
                              <Link 
                                to={`/edit-po/${order.id}`} 
                                className="btn"
                                style={{ 
                                  padding: '0.5rem 1rem', 
                                  fontSize: '0.85rem',
                                  background: '#f59e0b',
                                  color: 'white'
                                }}
                                data-testid={`edit-po-${order.numero_oc}`}
                              >
                                Editar
                              </Link>
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
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                ))}
              </tbody>
            </table>
            
            {/* Paginação */}
            {filteredOrders.length > 5 && (
              <Pagination
                totalItems={filteredOrders.length}
                currentPage={currentPage}
                itemsPerPage={itemsPerPage}
                onPageChange={setCurrentPage}
                onItemsPerPageChange={setItemsPerPage}
              />
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default Dashboard;
