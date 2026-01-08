import React, { useState, useEffect } from 'react';
import axios from 'axios';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

const AdminPanel = () => {
  const [summary, setSummary] = useState([]);
  const [duplicates, setDuplicates] = useState(null);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState('summary'); // 'summary' or 'duplicates'

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const [summaryRes, duplicatesRes] = await Promise.all([
        axios.get(`${API}/admin/summary`),
        axios.get(`${API}/items/duplicates`)
      ]);
      setSummary(summaryRes.data);
      setDuplicates(duplicatesRes.data);
    } catch (error) {
      console.error('Erro ao carregar dados:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return <div className="loading" data-testid="loading-admin">Carregando...</div>;
  }

  return (
    <div data-testid="admin-panel-page">
      <div className="page-header">
        <h1 className="page-title" data-testid="admin-title">Painel Administrativo</h1>
        <p className="page-subtitle">Resumo financeiro e análise de itens</p>
      </div>

      <div className="card" style={{ marginBottom: '2rem' }}>
        <div style={{ display: 'flex', gap: '1rem', marginBottom: '1.5rem' }}>
          <button
            onClick={() => setView('summary')}
            className={`btn ${view === 'summary' ? 'btn-primary' : 'btn-secondary'}`}
            data-testid="view-summary-btn"
          >
            Resumo Financeiro
          </button>
          <button
            onClick={() => setView('duplicates')}
            className={`btn ${view === 'duplicates' ? 'btn-primary' : 'btn-secondary'}`}
            data-testid="view-duplicates-btn"
          >
            Itens Duplicados ({duplicates?.total_duplicados || 0})
          </button>
        </div>

        {view === 'summary' && (
          <>
            <h2 style={{ fontSize: '1.5rem', fontWeight: '700', marginBottom: '1.5rem' }}>Resumo Financeiro</h2>
            {summary.length === 0 ? (
              <p style={{ textAlign: 'center', color: '#718096', padding: '2rem' }} data-testid="no-summary-message">
                Nenhum dado financeiro cadastrado ainda.
              </p>
            ) : (
              <div className="table-container">
                <table data-testid="summary-table">
                  <thead>
                    <tr>
                      <th>Nº OC</th>
                      <th>Código</th>
                      <th>Item</th>
                      <th>Responsável</th>
                      <th>Compra</th>
                      <th>Venda</th>
                      <th>Imposto</th>
                      <th>Frete</th>
                      <th>Lucro Líquido</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {summary.map((item, index) => (
                      <tr key={index} data-testid={`summary-row-${index}`}>
                        <td><strong>{item.numero_oc}</strong></td>
                        <td>{item.codigo_item}</td>
                        <td>{item.nome_item}</td>
                        <td><strong style={{ color: '#667eea' }}>{item.quem_cotou}</strong></td>
                        <td>{item.preco_compra ? `R$ ${item.preco_compra.toFixed(2)}` : '-'}</td>
                        <td>{item.preco_venda ? `R$ ${item.preco_venda.toFixed(2)}` : '-'}</td>
                        <td>{item.imposto ? `R$ ${item.imposto.toFixed(2)}` : '-'}</td>
                        <td>{item.custo_frete ? `R$ ${item.custo_frete.toFixed(2)}` : '-'}</td>
                        <td>
                          {item.lucro_liquido ? (
                            <strong style={{ color: item.lucro_liquido > 0 ? '#10b981' : '#ef4444' }}>
                              R$ {item.lucro_liquido.toFixed(2)}
                            </strong>
                          ) : '-'}
                        </td>
                        <td><span className={`status-badge status-${item.status}`}>{item.status}</span></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}

        {view === 'duplicates' && duplicates && (
          <>
            <h2 style={{ fontSize: '1.5rem', fontWeight: '700', marginBottom: '1.5rem' }}>Itens Duplicados</h2>
            {duplicates.total_duplicados === 0 ? (
              <p style={{ textAlign: 'center', color: '#718096', padding: '2rem' }} data-testid="no-duplicates-message">
                Nenhum item duplicado encontrado.
              </p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                {Object.entries(duplicates.duplicados).map(([codigo, occurrences]) => (
                  <div key={codigo} className="card" style={{ background: '#fff7ed', border: '1px solid #fb923c' }} data-testid={`duplicate-${codigo}`}>
                    <h3 style={{ fontSize: '1.1rem', fontWeight: '700', marginBottom: '0.5rem', color: '#ea580c' }}>
                      Código: {codigo}
                    </h3>
                    <p style={{ marginBottom: '1rem', color: '#9a3412' }}>
                      Aparece em {occurrences.length} OCs diferentes
                    </p>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '0.5rem' }}>
                      {occurrences.map((occ, index) => (
                        <div key={index} style={{ padding: '0.75rem', background: 'white', borderRadius: '6px', fontSize: '0.9rem' }}>
                          <div><strong>OC:</strong> {occ.numero_oc}</div>
                          <div><strong>Quantidade:</strong> {occ.quantidade}</div>
                          <div><span className={`status-badge status-${occ.status}`} style={{ fontSize: '0.75rem' }}>{occ.status}</span></div>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
};

export default AdminPanel;
