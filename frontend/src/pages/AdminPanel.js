import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { formatBRL } from '../utils/api';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

const AdminPanel = () => {
  const [comissoes, setComissoes] = useState([]);
  const [notasFiscais, setNotasFiscais] = useState({ notas_compra: [], notas_venda: [] });
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState('comissoes');
  const [expandedResponsavel, setExpandedResponsavel] = useState(null);
  const [itensResponsavel, setItensResponsavel] = useState([]);
  const [selectedItens, setSelectedItens] = useState([]);
  const [comissaoPercentual, setComissaoPercentual] = useState({});
  const [pagamentos, setPagamentos] = useState([]);
  const [downloadingNF, setDownloadingNF] = useState(null);
  const [editingPagamento, setEditingPagamento] = useState(null);
  const [editPagamentoForm, setEditPagamentoForm] = useState({ valor_comissao: 0 });

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const token = localStorage.getItem('token');
      const headers = { Authorization: `Bearer ${token}` };
      
      const [comissoesRes, nfsRes, pagamentosRes] = await Promise.all([
        axios.get(`${API}/admin/comissoes`, { headers }),
        axios.get(`${API}/admin/notas-fiscais`, { headers }),
        axios.get(`${API}/admin/pagamentos`, { headers }).catch(() => ({ data: [] }))
      ]);
      
      setComissoes(comissoesRes.data);
      setNotasFiscais(nfsRes.data);
      setPagamentos(pagamentosRes.data || []);
    } catch (error) {
      console.error('Erro ao carregar dados:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadItensResponsavel = async (responsavel) => {
    try {
      const token = localStorage.getItem('token');
      const response = await axios.get(
        `${API}/admin/itens-responsavel/${encodeURIComponent(responsavel)}`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      setItensResponsavel(response.data);
      setSelectedItens([]);
    } catch (error) {
      console.error('Erro ao carregar itens:', error);
      setItensResponsavel([]);
    }
  };

  const toggleExpandResponsavel = async (responsavel) => {
    if (expandedResponsavel === responsavel) {
      setExpandedResponsavel(null);
      setItensResponsavel([]);
    } else {
      setExpandedResponsavel(responsavel);
      await loadItensResponsavel(responsavel);
    }
  };

  const toggleSelectItem = (itemId) => {
    setSelectedItens(prev => 
      prev.includes(itemId) 
        ? prev.filter(id => id !== itemId)
        : [...prev, itemId]
    );
  };

  const selectAllItens = () => {
    const naosPagos = itensResponsavel.filter(item => !item.pago);
    if (selectedItens.length === naosPagos.length) {
      setSelectedItens([]);
    } else {
      setSelectedItens(naosPagos.map(item => item.id));
    }
  };

  const calcularTotalSelecionado = () => {
    // Agora calcula o valor total de VENDA (não lucro)
    return itensResponsavel
      .filter(item => selectedItens.includes(item.id))
      .reduce((sum, item) => sum + (item.valor_venda || 0), 0);
  };

  const registrarPagamento = async (responsavel) => {
    if (selectedItens.length === 0) {
      alert('Selecione pelo menos um item');
      return;
    }
    
    // Comissão fixa de 1.5%
    const percentual = 1.5;

    const totalVenda = calcularTotalSelecionado();
    const valorComissao = totalVenda * (percentual / 100);
    
    if (!window.confirm(`Confirmar pagamento de ${formatBRL(valorComissao)} (${percentual}% de ${formatBRL(totalVenda)}) para ${getNome(responsavel)}?`)) {
      return;
    }

    try {
      const token = localStorage.getItem('token');
      await axios.post(
        `${API}/admin/pagamentos`,
        {
          responsavel,
          itens_ids: selectedItens,
          percentual,
          valor_comissao: valorComissao,
          total_venda: totalVenda
        },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      alert('Pagamento registrado com sucesso!');
      setSelectedItens([]);
      loadData();
      loadItensResponsavel(responsavel);
    } catch (error) {
      console.error('Erro ao registrar pagamento:', error);
      alert('Erro ao registrar pagamento');
    }
  };

  const startEditPagamento = (pag) => {
    setEditingPagamento(pag.id);
    setEditPagamentoForm({ valor_comissao: pag.valor_comissao });
  };

  const cancelEditPagamento = () => {
    setEditingPagamento(null);
    setEditPagamentoForm({ valor_comissao: 0 });
  };

  const savePagamento = async (pagamentoId) => {
    try {
      const token = localStorage.getItem('token');
      await axios.patch(
        `${API}/admin/pagamentos/${pagamentoId}`,
        { valor_comissao: editPagamentoForm.valor_comissao },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      alert('Pagamento atualizado!');
      setEditingPagamento(null);
      loadData();
    } catch (error) {
      console.error('Erro ao atualizar pagamento:', error);
      alert('Erro ao atualizar pagamento');
    }
  };

  const deletePagamento = async (pagamentoId, responsavel) => {
    if (!window.confirm('Tem certeza que deseja deletar este pagamento? Os itens voltarão a ficar como não pagos.')) {
      return;
    }
    
    try {
      const token = localStorage.getItem('token');
      await axios.delete(
        `${API}/admin/pagamentos/${pagamentoId}`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      alert('Pagamento deletado!');
      loadData();
      if (expandedResponsavel === responsavel) {
        loadItensResponsavel(responsavel);
      }
    } catch (error) {
      console.error('Erro ao deletar pagamento:', error);
      alert('Erro ao deletar pagamento');
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

  // Extrair nome limpo do responsável
  const getNome = (responsavel) => {
    if (!responsavel) return '';
    // Remover sufixos comuns de email
    let nome = responsavel.replace(/onsolucoes/gi, '').replace(/\.$/g, '').trim();
    // Se tiver ponto, pegar só a primeira parte
    nome = nome.split('.')[0];
    // Capitalizar primeira letra
    return nome.charAt(0).toUpperCase() + nome.slice(1).toLowerCase();
  };

  if (loading) {
    return <div className="loading" data-testid="loading-admin">Carregando...</div>;
  }

  const totalVendaEntregue = comissoes.reduce((sum, c) => sum + (c.valor_venda_total || 0), 0);

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
            <p style={{ fontSize: '0.9rem', color: '#6b7280', marginBottom: '1rem' }}>
              Sistema de comissões baseado nos <strong>LOTES</strong> atribuídos originalmente. Comissão fixa de <strong>1,5%</strong> sobre o valor total de venda.
            </p>
            
            {/* Resumo */}
            <div style={{ 
              padding: '1rem', 
              background: '#ecfdf5', 
              borderRadius: '8px', 
              border: '1px solid #86efac',
              marginBottom: '1.5rem'
            }}>
              <div style={{ fontSize: '0.85rem', color: '#047857', fontWeight: '600' }}>TOTAL VALOR VENDIDO (Entregue/Em Trânsito)</div>
              <div style={{ fontSize: '1.5rem', fontWeight: '700', color: '#065f46' }}>{formatBRL(totalVendaEntregue)}</div>
              <div style={{ fontSize: '0.9rem', color: '#047857', marginTop: '0.25rem' }}>
                Comissão Total (1,5%): <strong>{formatBRL(totalVendaEntregue * 0.015)}</strong>
              </div>
            </div>

            {comissoes.length === 0 ? (
              <p style={{ textAlign: 'center', color: '#718096', padding: '2rem' }}>
                Nenhum responsável com itens entregues/em trânsito ainda.
              </p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                {comissoes.map((item, index) => {
                  const nome = getNome(item.responsavel);
                  const isExpanded = expandedResponsavel === item.responsavel;
                  const pagamentosDoResponsavel = pagamentos.filter(p => p.responsavel === item.responsavel);
                  
                  return (
                    <div 
                      key={index} 
                      className="card" 
                      style={{ 
                        background: '#f9fafb',
                        border: '1px solid #e5e7eb'
                      }}
                    >
                      {/* Header do responsável */}
                      <div 
                        onClick={() => toggleExpandResponsavel(item.responsavel)}
                        style={{ 
                          display: 'flex', 
                          justifyContent: 'space-between', 
                          alignItems: 'center',
                          cursor: 'pointer',
                          padding: '0.5rem'
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                          <div style={{ 
                            width: '40px', 
                            height: '40px', 
                            borderRadius: '50%', 
                            background: '#7c3aed',
                            color: 'white',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            fontWeight: '700',
                            fontSize: '1.2rem'
                          }}>
                            {nome.charAt(0)}
                          </div>
                          <div>
                            <div style={{ fontSize: '1.2rem', fontWeight: '700', color: '#1f2937' }}>
                              {nome}
                            </div>
                            <div style={{ fontSize: '0.85rem', color: '#6b7280' }}>
                              Valor vendido: <strong style={{ color: '#047857' }}>{formatBRL(item.valor_venda_total)}</strong>
                              {item.qtd_itens > 0 && <span style={{ marginLeft: '0.5rem' }}>({item.qtd_itens} itens)</span>}
                            </div>
                            <div style={{ fontSize: '0.8rem', color: '#6b7280' }}>
                              Comissão (1,5%): <strong style={{ color: '#7c3aed' }}>{formatBRL(item.valor_comissao)}</strong>
                            </div>
                          </div>
                        </div>
                        <div style={{ fontSize: '1.5rem', color: '#6b7280' }}>
                          {isExpanded ? '▲' : '▼'}
                        </div>
                      </div>

                      {/* Área expandida com itens */}
                      {isExpanded && (
                        <div style={{ marginTop: '1rem', padding: '1rem', background: 'white', borderRadius: '8px' }}>
                          {/* Controles */}
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', flexWrap: 'wrap', gap: '1rem' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                              <button
                                onClick={selectAllItens}
                                className="btn btn-secondary"
                                style={{ padding: '0.4rem 0.8rem', fontSize: '0.85rem' }}
                              >
                                {selectedItens.length === itensResponsavel.filter(i => !i.pago).length ? '✗ Desmarcar Todos' : '✓ Selecionar Todos'}
                              </button>
                              <span style={{ fontSize: '0.9rem', color: '#6b7280' }}>
                                {selectedItens.length} de {itensResponsavel.filter(i => !i.pago).length} selecionados
                              </span>
                            </div>
                            
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                              <label style={{ fontSize: '0.9rem', fontWeight: '600' }}>% Comissão:</label>
                              <input
                                type="number"
                                value={comissaoPercentual[item.responsavel] || ''}
                                onChange={(e) => setComissaoPercentual({...comissaoPercentual, [item.responsavel]: parseFloat(e.target.value) || 0})}
                                className="form-input"
                                style={{ width: '70px', padding: '0.4rem', textAlign: 'center' }}
                                min="0"
                                max="100"
                                step="0.1"
                                placeholder="0"
                              />
                              <span>%</span>
                            </div>
                          </div>

                          {/* Lista de itens */}
                          {itensResponsavel.length === 0 ? (
                            <p style={{ textAlign: 'center', color: '#9ca3af', padding: '1rem' }}>
                              Nenhum item entregue encontrado
                            </p>
                          ) : (
                            <div style={{ maxHeight: '300px', overflowY: 'auto', marginBottom: '1rem' }}>
                              <table style={{ width: '100%', fontSize: '0.85rem' }}>
                                <thead>
                                  <tr style={{ background: '#f3f4f6' }}>
                                    <th style={{ padding: '0.5rem', textAlign: 'left' }}>✓</th>
                                    <th style={{ padding: '0.5rem', textAlign: 'left' }}>OC</th>
                                    <th style={{ padding: '0.5rem', textAlign: 'left' }}>Item</th>
                                    <th style={{ padding: '0.5rem', textAlign: 'right' }}>Lucro</th>
                                    <th style={{ padding: '0.5rem', textAlign: 'center' }}>Status</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {itensResponsavel.map((itemResp, idx) => (
                                    <tr 
                                      key={idx} 
                                      style={{ 
                                        background: itemResp.pago ? '#f0fdf4' : (selectedItens.includes(itemResp.id) ? '#fef3c7' : 'white'),
                                        opacity: itemResp.pago ? 0.7 : 1
                                      }}
                                    >
                                      <td style={{ padding: '0.5rem' }}>
                                        <input
                                          type="checkbox"
                                          checked={selectedItens.includes(itemResp.id)}
                                          onChange={() => toggleSelectItem(itemResp.id)}
                                          disabled={itemResp.pago}
                                          style={{ width: '18px', height: '18px', cursor: itemResp.pago ? 'not-allowed' : 'pointer' }}
                                        />
                                      </td>
                                      <td style={{ padding: '0.5rem' }}>{itemResp.numero_oc}</td>
                                      <td style={{ padding: '0.5rem' }}>{itemResp.codigo_item}</td>
                                      <td style={{ padding: '0.5rem', textAlign: 'right', fontWeight: '600', color: '#047857' }}>
                                        {formatBRL(itemResp.lucro_liquido || 0)}
                                      </td>
                                      <td style={{ padding: '0.5rem', textAlign: 'center' }}>
                                        {itemResp.pago ? (
                                          <span style={{ color: '#22c55e', fontWeight: '600' }}>✓ PAGO</span>
                                        ) : (
                                          <span style={{ color: '#f59e0b', fontWeight: '600' }}>PENDENTE</span>
                                        )}
                                      </td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          )}

                          {/* Resumo e botão de pagamento */}
                          {selectedItens.length > 0 && (
                            <div style={{ 
                              padding: '1rem', 
                              background: '#fef9c3', 
                              borderRadius: '8px',
                              display: 'flex',
                              justifyContent: 'space-between',
                              alignItems: 'center',
                              flexWrap: 'wrap',
                              gap: '1rem'
                            }}>
                              <div>
                                <div style={{ fontSize: '0.85rem', color: '#92400e' }}>Total Selecionado:</div>
                                <div style={{ fontSize: '1.3rem', fontWeight: '700', color: '#78350f' }}>
                                  {formatBRL(calcularTotalSelecionado())}
                                </div>
                                {comissaoPercentual[item.responsavel] > 0 && (
                                  <div style={{ fontSize: '0.9rem', color: '#92400e' }}>
                                    Comissão ({comissaoPercentual[item.responsavel]}%): <strong>{formatBRL(calcularTotalSelecionado() * (comissaoPercentual[item.responsavel] / 100))}</strong>
                                  </div>
                                )}
                              </div>
                              <button
                                onClick={() => registrarPagamento(item.responsavel)}
                                className="btn btn-primary"
                                style={{ padding: '0.75rem 1.5rem', fontSize: '1rem' }}
                              >
                                💰 Registrar Pagamento
                              </button>
                            </div>
                          )}

                          {/* Histórico de pagamentos */}
                          {pagamentosDoResponsavel.length > 0 && (
                            <div style={{ marginTop: '1rem', padding: '1rem', background: '#f0fdf4', borderRadius: '8px' }}>
                              <div style={{ fontWeight: '700', color: '#166534', marginBottom: '0.75rem' }}>
                                📋 Histórico de Pagamentos
                              </div>
                              {pagamentosDoResponsavel.map((pag, idx) => (
                                <div key={idx} style={{ 
                                  padding: '0.75rem', 
                                  background: 'white', 
                                  borderRadius: '6px',
                                  marginBottom: '0.5rem',
                                  border: '1px solid #bbf7d0'
                                }}>
                                  {editingPagamento === pag.id ? (
                                    // Modo edição
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
                                      <span>{new Date(pag.data).toLocaleDateString('pt-BR')}</span>
                                      <span>{pag.qtd_itens} itens</span>
                                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                        <span>R$</span>
                                        <input
                                          type="number"
                                          value={editPagamentoForm.valor_comissao}
                                          onChange={(e) => setEditPagamentoForm({ valor_comissao: parseFloat(e.target.value) || 0 })}
                                          className="form-input"
                                          style={{ width: '100px', padding: '0.3rem' }}
                                          step="0.01"
                                        />
                                      </div>
                                      <button
                                        onClick={() => savePagamento(pag.id)}
                                        style={{ padding: '0.3rem 0.6rem', background: '#22c55e', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '0.8rem' }}
                                      >
                                        ✓ Salvar
                                      </button>
                                      <button
                                        onClick={cancelEditPagamento}
                                        style={{ padding: '0.3rem 0.6rem', background: '#9ca3af', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '0.8rem' }}
                                      >
                                        ✗ Cancelar
                                      </button>
                                    </div>
                                  ) : (
                                    // Modo visualização
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.9rem' }}>
                                      <div style={{ display: 'flex', alignItems: 'center', gap: '1.5rem' }}>
                                        <span style={{ color: '#6b7280' }}>{new Date(pag.data).toLocaleDateString('pt-BR')}</span>
                                        <span>{pag.qtd_itens} itens</span>
                                        <span style={{ color: '#047857', fontWeight: '700' }}>{formatBRL(pag.valor_comissao)}</span>
                                        <span style={{ color: '#6b7280', fontSize: '0.8rem' }}>({pag.percentual}%)</span>
                                      </div>
                                      <div style={{ display: 'flex', gap: '0.5rem' }}>
                                        <button
                                          onClick={() => startEditPagamento(pag)}
                                          style={{ padding: '0.3rem 0.6rem', background: '#3b82f6', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '0.75rem' }}
                                        >
                                          ✏️ Editar
                                        </button>
                                        <button
                                          onClick={() => deletePagamento(pag.id, item.responsavel)}
                                          style={{ padding: '0.3rem 0.6rem', background: '#ef4444', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '0.75rem' }}
                                        >
                                          🗑️ Deletar
                                        </button>
                                      </div>
                                    </div>
                                  )}
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </>
        )}

        {/* ============== ABA NOTAS FISCAIS ============== */}
        {view === 'notas' && (
          <>
            <h2 style={{ fontSize: '1.5rem', fontWeight: '700', marginBottom: '1.5rem' }}>Todas as Notas Fiscais</h2>
            
            {/* Layout em duas colunas */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2rem' }}>
              
              {/* Coluna Esquerda - Notas de Compra (Fornecedor) */}
              <div>
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
                  🏭 NFs de Compra (Fornecedor) 
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
                    Nenhuma NF de compra
                  </p>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                    {notasFiscais.notas_compra.map((nf, index) => (
                      <div 
                        key={index} 
                        style={{ 
                          padding: '0.75rem',
                          background: 'white',
                          borderRadius: '6px',
                          border: '1px solid #e5e7eb',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          gap: '0.75rem'
                        }}
                      >
                        <div style={{ 
                          width: '28px', 
                          height: '28px', 
                          borderRadius: '50%', 
                          background: '#7c3aed',
                          color: 'white',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          fontWeight: '700',
                          fontSize: '0.8rem',
                          flexShrink: 0
                        }}>
                          {index + 1}
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontWeight: '600', fontSize: '0.85rem', color: '#1f2937' }}>
                            NF: {nf.numero_nf || '-'}
                          </div>
                          <div style={{ fontSize: '0.75rem', color: '#6b7280' }}>
                            OC: {nf.numero_oc}
                          </div>
                        </div>
                        <button
                          onClick={() => downloadNF(nf)}
                          disabled={downloadingNF === nf.id}
                          style={{ 
                            padding: '0.4rem 0.8rem',
                            background: '#7c3aed',
                            color: 'white',
                            border: 'none',
                            borderRadius: '6px',
                            cursor: 'pointer',
                            fontSize: '0.8rem',
                            flexShrink: 0
                          }}
                        >
                          {downloadingNF === nf.id ? '...' : '⬇️'}
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Coluna Direita - Notas de Venda (ON) */}
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
                  🏢 NFs de Venda (ON) 
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
                    Nenhuma NF de venda
                  </p>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                    {notasFiscais.notas_venda.map((nf, index) => (
                      <div 
                        key={index} 
                        style={{ 
                          padding: '0.75rem',
                          background: 'white',
                          borderRadius: '6px',
                          border: '1px solid #e5e7eb',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          gap: '0.75rem'
                        }}
                      >
                        <div style={{ 
                          width: '28px', 
                          height: '28px', 
                          borderRadius: '50%', 
                          background: '#06b6d4',
                          color: 'white',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          fontWeight: '700',
                          fontSize: '0.8rem',
                          flexShrink: 0
                        }}>
                          {index + 1}
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontWeight: '600', fontSize: '0.85rem', color: '#1f2937' }}>
                            NF: {nf.numero_nf || '-'}
                          </div>
                          <div style={{ fontSize: '0.75rem', color: '#6b7280' }}>
                            OC: {nf.numero_oc}
                          </div>
                        </div>
                        <button
                          onClick={() => downloadNF(nf)}
                          disabled={downloadingNF === nf.id}
                          style={{ 
                            padding: '0.4rem 0.8rem',
                            background: '#06b6d4',
                            color: 'white',
                            border: 'none',
                            borderRadius: '6px',
                            cursor: 'pointer',
                            fontSize: '0.8rem',
                            flexShrink: 0
                          }}
                        >
                          {downloadingNF === nf.id ? '...' : '⬇️'}
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default AdminPanel;
