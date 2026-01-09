import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { apiGet, API, formatBRL } from '../utils/api';

const AllItemsSummary = () => {
  const [allItems, setAllItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filterResponsavel, setFilterResponsavel] = useState('todos');
  const [filterStatus, setFilterStatus] = useState('todos');

  useEffect(() => {
    loadAllItems();
  }, []);

  const loadAllItems = async () => {
    try {
      const response = await apiGet(`${API}/purchase-orders`);
      
      // Flatten todos os itens de todas as OCs
      const items = [];
      response.data.forEach(po => {
        po.items.forEach(item => {
          items.push({
            ...item,
            numero_oc: po.numero_oc,
            po_id: po.id,
            data_criacao: po.created_at
          });
        });
      });
      
      setAllItems(items);
    } catch (error) {
      console.error('Erro ao carregar itens:', error);
    } finally {
      setLoading(false);
    }
  };

  const filteredItems = allItems.filter(item => {
    if (filterResponsavel !== 'todos' && item.responsavel !== filterResponsavel) {
      return false;
    }
    if (filterStatus !== 'todos' && item.status !== filterStatus) {
      return false;
    }
    return true;
  });

  const responsaveis = ['Maria', 'Mateus', 'João', 'Mylena', 'Fabio'];

  // Calcular totais
  const totalLucro = filteredItems.reduce((sum, item) => sum + (item.lucro_liquido || 0), 0);
  const totalVenda = filteredItems.reduce((sum, item) => sum + ((item.preco_venda || 0) * item.quantidade), 0);
  const totalCompra = filteredItems.reduce((sum, item) => sum + ((item.preco_compra || 0) * item.quantidade), 0);
  const totalFreteCompra = filteredItems.reduce((sum, item) => sum + (item.frete_compra || 0), 0);
  const totalFreteEnvio = filteredItems.reduce((sum, item) => sum + (item.frete_envio || 0), 0);

  if (loading) {
    return <div className="loading" data-testid="loading-summary">Carregando...</div>;
  }

  return (
    <div data-testid="all-items-summary-page">
      <div className="page-header">
        <h1 className="page-title" data-testid="summary-title">Resumo Completo - Todos os Itens</h1>
        <p className="page-subtitle">Visão geral de todos os itens de todas as OCs</p>
      </div>

      {/* Estatísticas */}
      <div className="stats-grid" style={{ marginBottom: '2rem' }}>
        <div className="stat-card" style={{ borderColor: '#8b5cf6' }}>
          <div className="stat-label">Total de Itens</div>
          <div className="stat-value" style={{ color: '#8b5cf6' }}>{filteredItems.length}</div>
        </div>
        <div className="stat-card" style={{ borderColor: '#3b82f6' }}>
          <div className="stat-label">Valor Total Venda</div>
          <div className="stat-value" style={{ color: '#3b82f6', fontSize: '1.8rem' }}>{formatBRL(totalVenda)}</div>
        </div>
        <div className="stat-card" style={{ borderColor: '#f59e0b' }}>
          <div className="stat-label">Valor Total Compra</div>
          <div className="stat-value" style={{ color: '#f59e0b', fontSize: '1.8rem' }}>{formatBRL(totalCompra)}</div>
        </div>
        <div className="stat-card" style={{ borderColor: '#6366f1' }}>
          <div className="stat-label">Total Frete Compra</div>
          <div className="stat-value" style={{ color: '#6366f1', fontSize: '1.8rem' }}>{formatBRL(totalFreteCompra)}</div>
        </div>
        <div className="stat-card" style={{ borderColor: '#ec4899' }}>
          <div className="stat-label">Total Frete Envio</div>
          <div className="stat-value" style={{ color: '#ec4899', fontSize: '1.8rem' }}>{formatBRL(totalFreteEnvio)}</div>
        </div>
        <div className="stat-card" style={{ borderColor: totalLucro > 0 ? '#10b981' : '#ef4444' }}>
          <div className="stat-label">Lucro Total</div>
          <div className="stat-value" style={{ color: totalLucro > 0 ? '#10b981' : '#ef4444', fontSize: '1.8rem' }}>
            {formatBRL(totalLucro)}
          </div>
        </div>
      </div>

      <div className="card">
        {/* Filtros */}
        <div style={{ display: 'flex', gap: '1rem', marginBottom: '1.5rem', flexWrap: 'wrap' }}>
          <div>
            <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '600' }}>Responsável:</label>
            <select 
              className="form-input" 
              value={filterResponsavel}
              onChange={(e) => setFilterResponsavel(e.target.value)}
              style={{ minWidth: '150px' }}
              data-testid="filter-responsavel"
            >
              <option value="todos">Todos</option>
              {responsaveis.map(r => (
                <option key={r} value={r}>{r}</option>
              ))}
            </select>
          </div>
          
          <div>
            <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '600' }}>Status:</label>
            <select 
              className="form-input" 
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
              style={{ minWidth: '150px' }}
              data-testid="filter-status"
            >
              <option value="todos">Todos</option>
              <option value="pendente">Pendente</option>
              <option value="cotado">Cotado</option>
              <option value="comprado">Comprado</option>
              <option value="entregue">Entregue</option>
            </select>
          </div>
        </div>

        {/* Tabela */}
        {filteredItems.length === 0 ? (
          <p style={{ textAlign: 'center', color: '#718096', padding: '2rem' }}>
            Nenhum item encontrado com os filtros selecionados.
          </p>
        ) : (
          <div className="table-container">
            <table data-testid="items-table">
              <thead>
                <tr>
                  <th>OC</th>
                  <th>Código</th>
                  <th>Descrição</th>
                  <th>Responsável</th>
                  <th>Qtd</th>
                  <th>Status</th>
                  <th>Link</th>
                  <th>Venda</th>
                  <th>Compra</th>
                  <th>Fr. Compra</th>
                  <th>Fr. Envio</th>
                  <th>Lucro</th>
                  <th>Ações</th>
                </tr>
              </thead>
              <tbody>
                {filteredItems.map((item, index) => (
                  <tr key={index} data-testid={`item-row-${item.codigo_item}`}>
                    <td><strong>{item.numero_oc}</strong></td>
                    <td>{item.codigo_item}</td>
                    <td style={{ maxWidth: '200px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {item.descricao}
                    </td>
                    <td><strong style={{ color: '#667eea' }}>{item.responsavel}</strong></td>
                    <td>{item.quantidade} {item.unidade}</td>
                    <td><span className={`status-badge status-${item.status}`}>{item.status}</span></td>
                    <td>
                      {item.link_compra ? (
                        <a href={item.link_compra} target="_blank" rel="noopener noreferrer" style={{ color: '#667eea' }}>
                          Link
                        </a>
                      ) : '-'}
                    </td>
                    <td>
                      {item.preco_venda ? `R$ ${(item.preco_venda * item.quantidade).toFixed(2)}` : '-'}
                    </td>
                    <td>
                      {item.preco_compra ? `R$ ${(item.preco_compra * item.quantidade).toFixed(2)}` : '-'}
                    </td>
                    <td>
                      {item.frete_compra ? `R$ ${item.frete_compra.toFixed(2)}` : '-'}
                    </td>
                    <td>
                      {item.frete_envio ? `R$ ${item.frete_envio.toFixed(2)}` : '-'}
                    </td>
                    <td>
                      {item.lucro_liquido !== undefined && item.lucro_liquido !== null ? (
                        <strong style={{ color: item.lucro_liquido > 0 ? '#10b981' : '#ef4444' }}>
                          R$ {item.lucro_liquido.toFixed(2)}
                        </strong>
                      ) : '-'}
                    </td>
                    <td>
                      <Link 
                        to={`/po/${item.po_id}`} 
                        className="btn btn-secondary" 
                        style={{ padding: '0.4rem 0.8rem', fontSize: '0.8rem' }}
                        data-testid={`view-item-${item.codigo_item}`}
                      >
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

export default AllItemsSummary;
