import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { apiGet, API, formatBRL } from '../utils/api';

// Mapeamento de lotes por pessoa para cálculo de comissões
const LOTES_POR_PESSOA = {
  'MARIA': [1,2,3,4,5,6,7,8,9,10,11,12,43,44,45,46,47,48,49,50,51,52,53],
  'MYLENA': [80,81,82,83,84,85,86,87,88,89,90,91,92,93,94,95,96,97],
  'FABIO': [32,33,34,35,36,37,38,39,40,41,42],
};
const PERCENTUAL_COMISSAO = 1.5;

// OCs cotadas por admin (João) - não geram comissão
const OCS_EXCLUIDAS_COMISSAO = ['OC-2.118938', 'OC-2.118941'];

// Função para extrair número do lote
const extrairNumeroLote = (loteStr) => {
  if (!loteStr) return null;
  const match = String(loteStr).match(/(\d+)/);
  return match ? parseInt(match[1]) : null;
};

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
  const totalLucroPrevisto = filteredItems.reduce((sum, item) => sum + (item.lucro_liquido || 0), 0);
  const totalVenda = filteredItems.reduce((sum, item) => sum + ((item.preco_venda || 0) * item.quantidade), 0);
  const totalCompra = filteredItems.reduce((sum, item) => sum + ((item.preco_compra || 0) * item.quantidade), 0);
  const totalFreteCompra = filteredItems.reduce((sum, item) => sum + (item.frete_compra || 0), 0);
  const totalFreteEnvio = filteredItems.reduce((sum, item) => sum + (item.frete_envio || 0), 0);
  const totalFretes = totalFreteCompra + totalFreteEnvio;
  
  // Imposto previsto (11% do valor de venda de todos os itens)
  const totalImpostoPrevisto = filteredItems.reduce((sum, item) => {
    const valorVenda = (item.preco_venda || 0) * item.quantidade;
    return sum + (valorVenda * 0.11);
  }, 0);
  
  // Lucro realizado (soma do lucro dos itens em separação + em trânsito + entregues)
  const totalLucroRealizado = filteredItems
    .filter(item => item.status === 'em_separacao' || item.status === 'em_transito' || item.status === 'entregue')
    .reduce((sum, item) => sum + (item.lucro_liquido || 0), 0);

  // Calcular total de comissões a pagar (baseado nos lotes, itens entregue/em_transito)
  const totalComissoes = filteredItems
    .filter(item => item.status === 'entregue' || item.status === 'em_transito')
    .reduce((sum, item) => {
      const numeroLote = extrairNumeroLote(item.lote);
      if (!numeroLote) return sum;
      
      // Verificar se o lote pertence a algum cotador elegível para comissão
      for (const [pessoa, lotes] of Object.entries(LOTES_POR_PESSOA)) {
        if (lotes.includes(numeroLote)) {
          const valorVenda = (item.preco_venda || 0) * (item.quantidade || 1);
          return sum + (valorVenda * (PERCENTUAL_COMISSAO / 100));
        }
      }
      return sum;
    }, 0);

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
          <div className="stat-label">Total de Fretes</div>
          <div className="stat-value" style={{ color: '#6366f1', fontSize: '1.8rem' }}>{formatBRL(totalFretes)}</div>
          <div style={{ fontSize: '0.75rem', color: '#6b7280', marginTop: '0.25rem' }}>
            {formatBRL(totalFreteCompra)} + {formatBRL(totalFreteEnvio)}
          </div>
          <div style={{ fontSize: '0.7rem', color: '#9ca3af' }}>
            (Compra + Envio)
          </div>
        </div>
        <div className="stat-card" style={{ borderColor: totalLucroPrevisto > 0 ? '#10b981' : '#ef4444' }}>
          <div className="stat-label">Lucro Previsto</div>
          <div className="stat-value" style={{ color: totalLucroPrevisto > 0 ? '#10b981' : '#ef4444', fontSize: '1.8rem' }}>
            {formatBRL(totalLucroPrevisto)}
          </div>
        </div>
        <div className="stat-card" style={{ borderColor: '#dc2626' }}>
          <div className="stat-label">Imposto Previsto (11%)</div>
          <div className="stat-value" style={{ color: '#dc2626', fontSize: '1.8rem' }}>
            {formatBRL(totalImpostoPrevisto)}
          </div>
        </div>
        <div className="stat-card" style={{ borderColor: '#7c3aed', background: '#faf5ff' }}>
          <div className="stat-label">Total Comissões a Pagar</div>
          <div className="stat-value" style={{ color: '#7c3aed', fontSize: '1.8rem', fontWeight: '800' }}>
            {formatBRL(totalComissoes)}
          </div>
          <div style={{ fontSize: '0.75rem', color: '#6b7280', marginTop: '0.25rem' }}>
            (1,5% do valor vendido)
          </div>
        </div>
        <div className="stat-card" style={{ borderColor: '#059669', background: '#f0fdf4' }}>
          <div className="stat-label">Lucro Realizado</div>
          <div className="stat-value" style={{ color: '#059669', fontSize: '1.8rem', fontWeight: '800' }}>
            {formatBRL(totalLucroRealizado)}
          </div>
          <div style={{ fontSize: '0.75rem', color: '#6b7280', marginTop: '0.25rem' }}>
            (Em trânsito + Entregues)
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
              <option value="em_separacao">Em Separação</option>
              <option value="em_transito">Em Trânsito</option>
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
                      {item.preco_venda ? formatBRL(item.preco_venda * item.quantidade) : '-'}
                    </td>
                    <td>
                      {item.preco_compra ? formatBRL(item.preco_compra * item.quantidade) : '-'}
                    </td>
                    <td>
                      {item.frete_compra ? formatBRL(item.frete_compra) : '-'}
                    </td>
                    <td>
                      {item.frete_envio ? formatBRL(item.frete_envio) : '-'}
                    </td>
                    <td>
                      {item.lucro_liquido !== undefined && item.lucro_liquido !== null ? (
                        <strong style={{ color: item.lucro_liquido > 0 ? '#10b981' : '#ef4444' }}>
                          {formatBRL(item.lucro_liquido)}
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
