import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { formatBRL } from '../utils/api';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

const AdminPanel = () => {
  const [comissoes, setComissoes] = useState([]);
  const [notasFiscais, setNotasFiscais] = useState({ notas_compra: [], notas_venda: [] });
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState('comissoes'); // 'comissoes' ou 'notas'
  const [editingComissao, setEditingComissao] = useState(null);
  const [comissaoForm, setComissaoForm] = useState({ percentual: 0, pago: false });
  const [downloadingNF, setDownloadingNF] = useState(null);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const token = localStorage.getItem('token');
      const headers = { Authorization: `Bearer ${token}` };
      
      const [comissoesRes, nfsRes] = await Promise.all([
        axios.get(`${API}/admin/comissoes`, { headers }),
        axios.get(`${API}/admin/notas-fiscais`, { headers })
      ]);
      
      setComissoes(comissoesRes.data);
      setNotasFiscais(nfsRes.data);
    } catch (error) {
      console.error('Erro ao carregar dados:', error);
    } finally {
      setLoading(false);
    }
  };

  const startEditComissao = (item) => {
    setEditingComissao(item.responsavel);
    setComissaoForm({
      percentual: item.percentual_comissao || 0,
      pago: item.pago || false
    });
  };

  const cancelEditComissao = () => {
    setEditingComissao(null);
    setComissaoForm({ percentual: 0, pago: false });
  };

  const saveComissao = async (responsavel) => {
    try {
      const token = localStorage.getItem('token');
      await axios.patch(
        `${API}/admin/comissoes/${encodeURIComponent(responsavel)}`,
        comissaoForm,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      alert('Comissão atualizada com sucesso!');
      setEditingComissao(null);
      loadData();
    } catch (error) {
      console.error('Erro ao salvar comissão:', error);
      alert('Erro ao salvar comissão');
    }
  };

  const togglePago = async (item) => {
    try {
      const token = localStorage.getItem('token');
      await axios.patch(
        `${API}/admin/comissoes/${encodeURIComponent(item.responsavel)}`,
        { percentual: item.percentual_comissao, pago: !item.pago },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      loadData();
    } catch (error) {
      console.error('Erro ao atualizar status:', error);
      alert('Erro ao atualizar status de pagamento');
    }
  };

  const downloadNF = async (nf) => {
    setDownloadingNF(nf.id);
    try {
      const token = localStorage.getItem('token');
      const response = await axios.get(
        `${API}/purchase-orders/${nf.po_id}/items/by-index/${nf.item_index}/notas-fiscais/${nf.id}/download`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      
      const { file_data, content_type, filename } = response.data;
      
      // Criar blob e fazer download
      const byteCharacters = atob(file_data);
      const byteNumbers = new Array(byteCharacters.length);
      for (let i = 0; i < byteCharacters.length; i++) {
        byteNumbers[i] = byteCharacters.charCodeAt(i);
      }
      const byteArray = new Uint8Array(byteNumbers);
      const blob = new Blob([byteArray], { type: content_type });
      
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename || nf.filename;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (error) {
      console.error('Erro ao baixar NF:', error);
      alert('Erro ao baixar nota fiscal');
    } finally {
      setDownloadingNF(null);
    }
  };

  if (loading) {
    return <div className="loading" data-testid="loading-admin">Carregando...</div>;
  }

  const totalLucroEntregue = comissoes.reduce((sum, c) => sum + (c.lucro_entregue || 0), 0);
  const totalComissoesPendentes = comissoes.filter(c => !c.pago && c.valor_comissao > 0).reduce((sum, c) => sum + c.valor_comissao, 0);

  return (
    <div data-testid="admin-panel-page">
      <div className="page-header">
        <h1 className="page-title" data-testid="admin-title">Painel Administrativo</h1>
        <p className="page-subtitle">Gestão de comissões e notas fiscais</p>
      </div>

      <div className="card" style={{ marginBottom: '2rem' }}>
        <div style={{ display: 'flex', gap: '1rem', marginBottom: '1.5rem' }}>
          <button
            onClick={() => setView('comissoes')}
            className={`btn ${view === 'comissoes' ? 'btn-primary' : 'btn-secondary'}`}
            data-testid="view-comissoes-btn"
          >
            💰 Comissões
          </button>
          <button
            onClick={() => setView('notas')}
            className={`btn ${view === 'notas' ? 'btn-primary' : 'btn-secondary'}`}
            data-testid="view-notas-btn"
          >
            📄 Notas Fiscais ({notasFiscais.total_compra + notasFiscais.total_venda})
          </button>
        </div>

        {/* ============== ABA COMISSÕES ============== */}
        {view === 'comissoes' && (
          <>
            <h2 style={{ fontSize: '1.5rem', fontWeight: '700', marginBottom: '1rem' }}>Comissões por Responsável</h2>
            
            {/* Resumo */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem', marginBottom: '1.5rem' }}>
              <div style={{ padding: '1rem', background: '#ecfdf5', borderRadius: '8px', border: '1px solid #86efac' }}>
                <div style={{ fontSize: '0.85rem', color: '#047857', fontWeight: '600' }}>TOTAL LUCRO ENTREGUE</div>
                <div style={{ fontSize: '1.5rem', fontWeight: '700', color: '#065f46' }}>{formatBRL(totalLucroEntregue)}</div>
              </div>
              <div style={{ padding: '1rem', background: '#fef3c7', borderRadius: '8px', border: '1px solid #fcd34d' }}>
                <div style={{ fontSize: '0.85rem', color: '#92400e', fontWeight: '600' }}>COMISSÕES PENDENTES</div>
                <div style={{ fontSize: '1.5rem', fontWeight: '700', color: '#78350f' }}>{formatBRL(totalComissoesPendentes)}</div>
              </div>
            </div>

            {comissoes.length === 0 ? (
              <p style={{ textAlign: 'center', color: '#718096', padding: '2rem' }} data-testid="no-comissoes-message">
                Nenhum responsável com itens entregues ainda.
              </p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                {comissoes.map((item, index) => (
                  <div 
                    key={index} 
                    className="card" 
                    style={{ 
                      background: item.pago ? '#f0fdf4' : (item.valor_comissao > 0 ? '#fefce8' : '#f9fafb'),
                      border: `1px solid ${item.pago ? '#86efac' : (item.valor_comissao > 0 ? '#fcd34d' : '#e5e7eb')}`
                    }}
                    data-testid={`comissao-${index}`}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '1rem' }}>
                      {/* Info do Responsável */}
                      <div style={{ flex: 1, minWidth: '200px' }}>
                        <div style={{ fontSize: '1.2rem', fontWeight: '700', color: '#1f2937', marginBottom: '0.25rem' }}>
                          {item.responsavel}
                        </div>
                        {item.email && (
                          <div style={{ fontSize: '0.85rem', color: '#6b7280' }}>{item.email}</div>
                        )}
                      </div>

                      {/* Lucro Entregue */}
                      <div style={{ textAlign: 'center', minWidth: '150px' }}>
                        <div style={{ fontSize: '0.75rem', color: '#6b7280', fontWeight: '600' }}>LUCRO ENTREGUE</div>
                        <div style={{ fontSize: '1.3rem', fontWeight: '700', color: '#047857' }}>
                          {formatBRL(item.lucro_entregue)}
                        </div>
                      </div>

                      {/* % Comissão */}
                      <div style={{ textAlign: 'center', minWidth: '120px' }}>
                        <div style={{ fontSize: '0.75rem', color: '#6b7280', fontWeight: '600' }}>% COMISSÃO</div>
                        {editingComissao === item.responsavel ? (
                          <input
                            type="number"
                            value={comissaoForm.percentual}
                            onChange={(e) => setComissaoForm({ ...comissaoForm, percentual: parseFloat(e.target.value) || 0 })}
                            className="form-input"
                            style={{ width: '80px', textAlign: 'center', padding: '0.5rem' }}
                            min="0"
                            max="100"
                            step="0.1"
                          />
                        ) : (
                          <div style={{ fontSize: '1.3rem', fontWeight: '700', color: '#7c3aed' }}>
                            {item.percentual_comissao}%
                          </div>
                        )}
                      </div>

                      {/* Valor Comissão */}
                      <div style={{ textAlign: 'center', minWidth: '150px' }}>
                        <div style={{ fontSize: '0.75rem', color: '#6b7280', fontWeight: '600' }}>VALOR COMISSÃO</div>
                        <div style={{ fontSize: '1.3rem', fontWeight: '700', color: item.valor_comissao > 0 ? '#0891b2' : '#9ca3af' }}>
                          {formatBRL(item.valor_comissao)}
                        </div>
                      </div>

                      {/* Status Pago */}
                      <div style={{ textAlign: 'center', minWidth: '100px' }}>
                        <div style={{ fontSize: '0.75rem', color: '#6b7280', fontWeight: '600', marginBottom: '0.25rem' }}>PAGO</div>
                        {editingComissao === item.responsavel ? (
                          <input
                            type="checkbox"
                            checked={comissaoForm.pago}
                            onChange={(e) => setComissaoForm({ ...comissaoForm, pago: e.target.checked })}
                            style={{ width: '24px', height: '24px', cursor: 'pointer' }}
                          />
                        ) : (
                          <button
                            onClick={() => togglePago(item)}
                            style={{ 
                              padding: '0.5rem 1rem',
                              background: item.pago ? '#22c55e' : '#ef4444',
                              color: 'white',
                              border: 'none',
                              borderRadius: '6px',
                              cursor: 'pointer',
                              fontWeight: '600',
                              fontSize: '0.85rem'
                            }}
                          >
                            {item.pago ? '✓ SIM' : '✗ NÃO'}
                          </button>
                        )}
                      </div>

                      {/* Ações */}
                      <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                        {editingComissao === item.responsavel ? (
                          <>
                            <button
                              onClick={cancelEditComissao}
                              className="btn btn-secondary"
                              style={{ padding: '0.5rem 1rem', fontSize: '0.85rem' }}
                            >
                              Cancelar
                            </button>
                            <button
                              onClick={() => saveComissao(item.responsavel)}
                              className="btn btn-primary"
                              style={{ padding: '0.5rem 1rem', fontSize: '0.85rem' }}
                            >
                              Salvar
                            </button>
                          </>
                        ) : (
                          <button
                            onClick={() => startEditComissao(item)}
                            className="btn btn-secondary"
                            style={{ padding: '0.5rem 1rem', fontSize: '0.85rem' }}
                          >
                            ✏️ Editar %
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}

        {/* ============== ABA NOTAS FISCAIS ============== */}
        {view === 'notas' && (
          <>
            <h2 style={{ fontSize: '1.5rem', fontWeight: '700', marginBottom: '1.5rem' }}>Todas as Notas Fiscais</h2>
            
            {/* Notas de Compra (Fornecedor) */}
            <div style={{ marginBottom: '2rem' }}>
              <h3 style={{ 
                fontSize: '1.1rem', 
                fontWeight: '700', 
                marginBottom: '1rem',
                padding: '0.75rem',
                background: '#f5f3ff',
                borderRadius: '8px',
                color: '#5b21b6',
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem'
              }}>
                🏭 Notas de Compra (Fornecedor) 
                <span style={{ 
                  background: '#7c3aed', 
                  color: 'white', 
                  padding: '0.2rem 0.6rem', 
                  borderRadius: '12px',
                  fontSize: '0.9rem'
                }}>
                  {notasFiscais.total_compra}
                </span>
              </h3>
              
              {notasFiscais.notas_compra.length === 0 ? (
                <p style={{ textAlign: 'center', color: '#718096', padding: '2rem', background: '#f9fafb', borderRadius: '8px' }}>
                  Nenhuma nota fiscal de compra cadastrada.
                </p>
              ) : (
                <div className="table-container">
                  <table data-testid="nfs-compra-table">
                    <thead>
                      <tr>
                        <th>Arquivo</th>
                        <th>OC</th>
                        <th>Código Item</th>
                        <th>Descrição</th>
                        <th>NCM</th>
                        <th>Ação</th>
                      </tr>
                    </thead>
                    <tbody>
                      {notasFiscais.notas_compra.map((nf, index) => (
                        <tr key={index} data-testid={`nf-compra-${index}`}>
                          <td>
                            <span style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                              {nf.filename?.endsWith('.xml') ? '📑' : '📄'}
                              <span style={{ maxWidth: '150px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                {nf.filename}
                              </span>
                            </span>
                          </td>
                          <td><strong>{nf.numero_oc}</strong></td>
                          <td>{nf.codigo_item}</td>
                          <td style={{ maxWidth: '200px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {nf.descricao}
                          </td>
                          <td>
                            {nf.ncm ? (
                              <span style={{ 
                                padding: '0.2rem 0.5rem', 
                                background: '#dcfce7', 
                                color: '#166534',
                                borderRadius: '4px',
                                fontSize: '0.8rem',
                                fontWeight: '600'
                              }}>
                                {nf.ncm}
                              </span>
                            ) : (
                              <span style={{ color: '#9ca3af' }}>-</span>
                            )}
                          </td>
                          <td>
                            <button
                              onClick={() => downloadNF(nf)}
                              disabled={downloadingNF === nf.id}
                              className="btn btn-primary"
                              style={{ padding: '0.4rem 0.8rem', fontSize: '0.8rem' }}
                            >
                              {downloadingNF === nf.id ? '...' : '⬇️ Baixar'}
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* Notas de Venda (ON) */}
            <div>
              <h3 style={{ 
                fontSize: '1.1rem', 
                fontWeight: '700', 
                marginBottom: '1rem',
                padding: '0.75rem',
                background: '#ecfeff',
                borderRadius: '8px',
                color: '#0891b2',
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem'
              }}>
                🏢 Notas de Venda (ON) 
                <span style={{ 
                  background: '#06b6d4', 
                  color: 'white', 
                  padding: '0.2rem 0.6rem', 
                  borderRadius: '12px',
                  fontSize: '0.9rem'
                }}>
                  {notasFiscais.total_venda}
                </span>
              </h3>
              
              {notasFiscais.notas_venda.length === 0 ? (
                <p style={{ textAlign: 'center', color: '#718096', padding: '2rem', background: '#f9fafb', borderRadius: '8px' }}>
                  Nenhuma nota fiscal de venda cadastrada.
                </p>
              ) : (
                <div className="table-container">
                  <table data-testid="nfs-venda-table">
                    <thead>
                      <tr>
                        <th>Arquivo</th>
                        <th>OC</th>
                        <th>Código Item</th>
                        <th>Descrição</th>
                        <th>NCM</th>
                        <th>Ação</th>
                      </tr>
                    </thead>
                    <tbody>
                      {notasFiscais.notas_venda.map((nf, index) => (
                        <tr key={index} data-testid={`nf-venda-${index}`}>
                          <td>
                            <span style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                              {nf.filename?.endsWith('.xml') ? '📑' : '📄'}
                              <span style={{ maxWidth: '150px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                {nf.filename}
                              </span>
                            </span>
                          </td>
                          <td><strong>{nf.numero_oc}</strong></td>
                          <td>{nf.codigo_item}</td>
                          <td style={{ maxWidth: '200px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {nf.descricao}
                          </td>
                          <td>
                            {nf.ncm ? (
                              <span style={{ 
                                padding: '0.2rem 0.5rem', 
                                background: '#dcfce7', 
                                color: '#166534',
                                borderRadius: '4px',
                                fontSize: '0.8rem',
                                fontWeight: '600'
                              }}>
                                {nf.ncm}
                              </span>
                            ) : (
                              <span style={{ color: '#9ca3af' }}>-</span>
                            )}
                          </td>
                          <td>
                            <button
                              onClick={() => downloadNF(nf)}
                              disabled={downloadingNF === nf.id}
                              className="btn btn-primary"
                              style={{ padding: '0.4rem 0.8rem', fontSize: '0.8rem' }}
                            >
                              {downloadingNF === nf.id ? '...' : '⬇️ Baixar'}
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default AdminPanel;
