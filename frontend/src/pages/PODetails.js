import React, { useState, useEffect, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { apiGet, apiPatch, apiDelete, API, formatBRL } from '../utils/api';
import { useAuth } from '../contexts/AuthContext';
import { v4 as uuidv4 } from 'uuid';
import Pagination from '../components/Pagination';

// Helper para calcular contagem regressiva e status de atraso
const calcularStatusEntrega = (dataEntrega) => {
  if (!dataEntrega) return null;
  
  try {
    const hoje = new Date();
    hoje.setHours(0, 0, 0, 0);
    
    const entrega = new Date(dataEntrega + 'T00:00:00');
    const diffTime = entrega.getTime() - hoje.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    
    const dataFormatada = entrega.toLocaleDateString('pt-BR');
    
    if (diffDays < 0) {
      return {
        atrasado: true,
        dias: Math.abs(diffDays),
        texto: `${Math.abs(diffDays)} dia(s) em atraso`,
        dataFormatada,
        cor: '#dc2626',
        bg: '#fef2f2'
      };
    } else if (diffDays === 0) {
      return {
        atrasado: false,
        dias: 0,
        texto: 'Entrega HOJE!',
        dataFormatada,
        cor: '#f59e0b',
        bg: '#fffbeb'
      };
    } else if (diffDays <= 3) {
      return {
        atrasado: false,
        dias: diffDays,
        texto: `${diffDays} dia(s) restante(s)`,
        dataFormatada,
        cor: '#f59e0b',
        bg: '#fffbeb'
      };
    } else if (diffDays <= 7) {
      return {
        atrasado: false,
        dias: diffDays,
        texto: `${diffDays} dias restantes`,
        dataFormatada,
        cor: '#3b82f6',
        bg: '#eff6ff'
      };
    } else {
      return {
        atrasado: false,
        dias: diffDays,
        texto: `${diffDays} dias restantes`,
        dataFormatada,
        cor: '#22c55e',
        bg: '#f0fdf4'
      };
    }
  } catch (e) {
    return null;
  }
};

const PODetails = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const { isAdmin } = useAuth();
  const [po, setPo] = useState(null);
  const [loading, setLoading] = useState(true);
  const [editingItem, setEditingItem] = useState(null);
  const [formData, setFormData] = useState({});
  
  // Estado para edição do endereço
  const [editandoEndereco, setEditandoEndereco] = useState(false);
  const [novoEndereco, setNovoEndereco] = useState('');
  const [salvandoEndereco, setSalvandoEndereco] = useState(false);
  
  // Paginação
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(5);

  useEffect(() => {
    loadPO();
  }, [id]);

  const loadPO = async () => {
    try {
      const response = await apiGet(`${API}/purchase-orders/${id}`);
      setPo(response.data);
    } catch (error) {
      console.error('Erro ao carregar OC:', error);
      alert('Ordem de Compra não encontrada');
      navigate('/');
    } finally {
      setLoading(false);
    }
  };

  // Função para salvar o endereço de entrega
  const handleSalvarEndereco = async () => {
    setSalvandoEndereco(true);
    try {
      await apiPatch(`${API}/purchase-orders/${id}/endereco-entrega`, {
        endereco_entrega: novoEndereco
      });
      setPo(prev => ({ ...prev, endereco_entrega: novoEndereco.toUpperCase() }));
      setEditandoEndereco(false);
      alert('Endereço atualizado com sucesso!');
    } catch (error) {
      console.error('Erro ao atualizar endereço:', error);
      alert('Erro ao atualizar endereço');
    } finally {
      setSalvandoEndereco(false);
    }
  };

  const handleDelete = async () => {
    if (!window.confirm('Tem certeza que deseja deletar esta Ordem de Compra? Esta ação não pode ser desfeita.')) {
      return;
    }

    try {
      await apiDelete(`${API}/purchase-orders/${id}`);
      alert('Ordem de Compra deletada com sucesso!');
      navigate('/');
    } catch (error) {
      console.error('Erro ao deletar OC:', error);
      alert('Erro ao deletar Ordem de Compra');
    }
  };

  const startEdit = (item, itemIndex) => {
    // Usar índice para evitar conflito com itens de mesmo código
    setEditingItem(itemIndex);
    
    const fontesExistentes = item.fontes_compra && item.fontes_compra.length > 0 
      ? item.fontes_compra 
      : [];
    
    setFormData({
      status: item.status,
      preco_venda: item.preco_venda || '',
      imposto: item.imposto || '',
      frete_envio: item.frete_envio || '',
      fontes_compra: fontesExistentes.length > 0 ? fontesExistentes : [{
        id: uuidv4(),
        quantidade: item.quantidade || 1,
        preco_unitario: item.preco_compra || '',
        frete: item.frete_compra || '',
        link: item.link_compra || '',
        fornecedor: ''
      }],
      quantidade_total: item.quantidade,
      _itemIndex: itemIndex  // Guardar índice para o save
    });
  };

  const cancelEdit = () => {
    setEditingItem(null);
    setFormData({});
  };

  const addFonteCompra = () => {
    setFormData({
      ...formData,
      fontes_compra: [...formData.fontes_compra, {
        id: uuidv4(),
        quantidade: 1,
        preco_unitario: '',
        frete: '',
        link: '',
        fornecedor: ''
      }]
    });
  };

  const removeFonteCompra = (index) => {
    const newFontes = formData.fontes_compra.filter((_, i) => i !== index);
    setFormData({ ...formData, fontes_compra: newFontes });
  };

  const updateFonteCompra = (index, field, value) => {
    const newFontes = [...formData.fontes_compra];
    newFontes[index] = { ...newFontes[index], [field]: value };
    setFormData({ ...formData, fontes_compra: newFontes });
  };

  const calcularTotalFontes = () => {
    let totalQtd = 0;
    let totalCusto = 0;
    let totalFrete = 0;
    
    formData.fontes_compra?.forEach(fc => {
      const qtd = parseInt(fc.quantidade) || 0;
      const preco = parseFloat(fc.preco_unitario) || 0;
      const frete = parseFloat(fc.frete) || 0;
      totalQtd += qtd;
      totalCusto += qtd * preco;
      totalFrete += frete;
    });
    
    return { totalQtd, totalCusto, totalFrete };
  };

  const saveEdit = async (item, itemIndex) => {
    try {
      const payload = {
        status: formData.status,
        preco_venda: formData.preco_venda ? parseFloat(formData.preco_venda) : null,
        imposto: formData.imposto ? parseFloat(formData.imposto) : null,
        frete_envio: formData.frete_envio ? parseFloat(formData.frete_envio) : null,
        fontes_compra: formData.fontes_compra.map(fc => ({
          id: fc.id,
          quantidade: parseInt(fc.quantidade) || 0,
          preco_unitario: parseFloat(fc.preco_unitario) || 0,
          frete: parseFloat(fc.frete) || 0,
          link: fc.link || '',
          fornecedor: fc.fornecedor || ''
        })).filter(fc => fc.quantidade > 0)
      };
      
      // Usar endpoint com índice para evitar problema com itens duplicados
      await apiPatch(`${API}/purchase-orders/${id}/items/by-index/${itemIndex}`, payload);
      
      setEditingItem(null);
      setFormData({});
      loadPO();
    } catch (error) {
      console.error('Erro ao atualizar item:', error);
      alert('Erro ao atualizar item');
    }
  };

  const getStatusBadge = (status) => {
    return <span className={`status-badge status-${status}`} data-testid={`status-${status}`}>{status}</span>;
  };

  // Calcular valor total da OC
  const calcularValorTotal = () => {
    if (!po) return 0;
    return po.items.reduce((total, item) => {
      const precoVenda = item.preco_venda || 0;
      const quantidade = item.quantidade || 0;
      return total + (precoVenda * quantidade);
    }, 0);
  };

  if (loading) {
    return <div className="loading" data-testid="loading-po">Carregando...</div>;
  }

  if (!po) {
    return null;
  }

  const valorTotal = calcularValorTotal();

  return (
    <div data-testid="po-details-page">
      <div className="page-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', justifyContent: 'space-between', width: '100%' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
            <button onClick={() => navigate('/')} className="btn btn-secondary" data-testid="back-btn">
              ← Voltar
            </button>
            <div>
              <h1 className="page-title" data-testid="po-number">OC {po.numero_oc}</h1>
              <p className="page-subtitle">Criada em {new Date(po.created_at).toLocaleDateString('pt-BR')}</p>
            </div>
          </div>
          {isAdmin() && (
            <button 
              onClick={handleDelete} 
              className="btn" 
              style={{ 
                background: '#ef4444', 
                color: 'white',
                padding: '0.75rem 1.5rem'
              }}
              data-testid="delete-po-btn"
            >
              🗑️ Deletar OC
            </button>
          )}
        </div>
      </div>

      <div className="card" style={{ marginBottom: '2rem' }}>
        <h2 style={{ fontSize: '1.5rem', fontWeight: '700', marginBottom: '1rem' }}>Informações da OC</h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '1rem' }}>
          <div>
            <div className="stat-label">Número OC</div>
            <div style={{ fontSize: '1.25rem', fontWeight: '700', color: '#2d3748' }}>{po.numero_oc}</div>
          </div>
          <div>
            <div className="stat-label">Cliente</div>
            <div style={{ fontSize: '1.25rem', fontWeight: '700', color: '#2d3748' }}>{po.cliente}</div>
          </div>
          <div>
            <div className="stat-label">Total de Itens</div>
            <div style={{ fontSize: '1.25rem', fontWeight: '700', color: '#667eea' }}>
              <span style={{ 
                background: '#e0e7ff', 
                padding: '0.25rem 0.75rem', 
                borderRadius: '12px' 
              }}>
                {po.items.length} {po.items.length === 1 ? 'item' : 'itens'}
              </span>
            </div>
          </div>
          <div>
            <div className="stat-label">Valor Total (Venda)</div>
            <div style={{ fontSize: '1.25rem', fontWeight: '700', color: valorTotal > 0 ? '#059669' : '#718096' }}>
              {valorTotal > 0 ? formatBRL(valorTotal) : 'Não informado'}
            </div>
          </div>
          {/* Endereço de Entrega dentro do grid */}
          <div style={{ gridColumn: 'span 2' }}>
            <div className="stat-label">📍 Endereço de Entrega</div>
            <div style={{ 
              fontSize: '1rem', 
              fontWeight: '600', 
              color: po.endereco_entrega ? '#1f2937' : '#9ca3af',
              background: po.endereco_entrega ? '#f0f9ff' : '#f3f4f6',
              padding: '0.5rem 0.75rem',
              borderRadius: '8px',
              marginTop: '0.25rem'
            }}>
              {po.endereco_entrega || 'Endereço não informado'}
            </div>
          </div>
        </div>
        {/* Data de Entrega */}
        <div style={{ 
          marginTop: '1.5rem', 
          paddingTop: '1rem', 
          borderTop: '1px solid #e2e8f0',
          display: 'flex',
          flexDirection: 'column',
          gap: '1rem'
        }}>
          {po.data_entrega && (() => {
            const statusEntrega = calcularStatusEntrega(po.data_entrega);
            if (!statusEntrega) return null;
            return (
              <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
                <span style={{ fontWeight: '600', color: '#4a5568' }}>📅 Data de Entrega:</span>
                <div style={{ 
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '0.5rem',
                  padding: '0.4rem 0.75rem',
                  borderRadius: '8px',
                  background: statusEntrega.bg,
                  border: `2px solid ${statusEntrega.cor}`
                }}>
                  <span style={{ fontWeight: '600', color: statusEntrega.cor }}>
                    {statusEntrega.dataFormatada}
                  </span>
                  <span style={{
                    padding: '0.15rem 0.5rem',
                    borderRadius: '12px',
                    fontSize: '0.8rem',
                    fontWeight: '700',
                    background: statusEntrega.cor,
                    color: 'white'
                  }}>
                    {statusEntrega.atrasado ? `⚠️ ${statusEntrega.texto}` : statusEntrega.texto}
                  </span>
                </div>
              </div>
            );
          })()}
        </div>
      </div>

      <div className="card">
        <h2 style={{ fontSize: '1.5rem', fontWeight: '700', marginBottom: '1.5rem' }}>
          Itens da Ordem de Compra ({po.items.length})
        </h2>
        
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {po.items.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage).map((item, index) => (
            <div key={index} className="card" style={{ background: '#f7fafc', border: '1px solid #e2e8f0' }} data-testid={`item-card-${item.codigo_item}`}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', marginBottom: '1rem' }}>
                <div>
                  <h3 style={{ fontSize: '1.1rem', fontWeight: '700', marginBottom: '0.5rem' }}>
                    Código: {item.codigo_item}
                  </h3>
                  <p style={{ color: '#4a5568', marginBottom: '0.5rem' }}>{item.descricao}</p>
                  <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', fontSize: '0.9rem', color: '#718096' }}>
                    <span><strong>Lote:</strong> {item.lote}</span>
                    <span><strong>Região:</strong> {item.regiao}</span>
                    <span><strong>Responsável:</strong> <strong style={{ color: '#667eea' }}>{item.responsavel}</strong></span>
                    <span><strong>Quantidade:</strong> {item.quantidade} {item.unidade}</span>
                    {item.marca_modelo && <span><strong>Marca/Modelo:</strong> {item.marca_modelo}</span>}
                  </div>
                </div>
                <div>
                  {getStatusBadge(item.status)}
                </div>
              </div>

              {editingItem === index ? (
                <div style={{ marginTop: '1rem', padding: '1rem', background: 'white', borderRadius: '8px' }}>
                  {/* Status e campos admin */}
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem', marginBottom: '1.5rem' }}>
                    <div className="form-group">
                      <label className="form-label">Status</label>
                      <select
                        className="form-input"
                        value={formData.status}
                        onChange={(e) => setFormData({ ...formData, status: e.target.value })}
                        data-testid={`select-status-${item.codigo_item}`}
                      >
                        <option value="pendente">Pendente</option>
                        <option value="cotado">Cotado</option>
                        <option value="comprado">Comprado</option>
                        <option value="em_separacao">Em Separação</option>
                        <option value="em_transito">Em Trânsito</option>
                        <option value="entregue">Entregue</option>
                      </select>
                    </div>
                    
                    {isAdmin() && (
                      <>
                        <div className="form-group">
                          <label className="form-label">Preço Venda Unit. (R$)</label>
                          <input
                            type="number"
                            step="0.01"
                            className="form-input"
                            value={formData.preco_venda}
                            onChange={(e) => setFormData({ ...formData, preco_venda: e.target.value })}
                            data-testid={`input-preco-venda-${item.codigo_item}`}
                          />
                        </div>
                        <div className="form-group">
                          <label className="form-label">Imposto (R$)</label>
                          <input
                            type="number"
                            step="0.01"
                            className="form-input"
                            value={formData.imposto}
                            onChange={(e) => setFormData({ ...formData, imposto: e.target.value })}
                            data-testid={`input-imposto-${item.codigo_item}`}
                          />
                        </div>
                        <div className="form-group">
                          <label className="form-label">Frete Envio/Embalagem (R$)</label>
                          <input
                            type="number"
                            step="0.01"
                            className="form-input"
                            value={formData.frete_envio}
                            onChange={(e) => setFormData({ ...formData, frete_envio: e.target.value })}
                            data-testid={`input-frete-envio-${item.codigo_item}`}
                          />
                        </div>
                      </>
                    )}
                  </div>

                  {/* Fontes de Compra */}
                  <div style={{ borderTop: '2px solid #e2e8f0', paddingTop: '1rem', marginTop: '1rem' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                      <h4 style={{ margin: 0, fontSize: '1rem', fontWeight: '600', color: '#4a5568' }}>
                        📦 Locais de Compra
                      </h4>
                      <button
                        type="button"
                        onClick={addFonteCompra}
                        className="btn btn-secondary"
                        style={{ padding: '0.4rem 0.8rem', fontSize: '0.85rem' }}
                        data-testid={`add-fonte-${item.codigo_item}`}
                      >
                        + Adicionar Local
                      </button>
                    </div>

                    {formData.fontes_compra?.map((fonte, idx) => (
                      <div 
                        key={fonte.id} 
                        style={{ 
                          background: '#f0f4f8', 
                          padding: '1rem', 
                          borderRadius: '8px', 
                          marginBottom: '0.75rem',
                          border: '1px solid #e2e8f0'
                        }}
                      >
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
                          <span style={{ fontWeight: '600', color: '#667eea', fontSize: '0.9rem' }}>
                            Local #{idx + 1}
                          </span>
                          {formData.fontes_compra.length > 1 && (
                            <button
                              type="button"
                              onClick={() => removeFonteCompra(idx)}
                              style={{ 
                                background: '#ef4444', 
                                color: 'white', 
                                border: 'none', 
                                padding: '0.25rem 0.5rem', 
                                borderRadius: '4px', 
                                cursor: 'pointer',
                                fontSize: '0.8rem'
                              }}
                            >
                              Remover
                            </button>
                          )}
                        </div>
                        
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '0.75rem' }}>
                          <div className="form-group" style={{ marginBottom: 0 }}>
                            <label className="form-label" style={{ fontSize: '0.8rem' }}>Quantidade</label>
                            <input
                              type="number"
                              className="form-input"
                              value={fonte.quantidade}
                              onChange={(e) => updateFonteCompra(idx, 'quantidade', e.target.value)}
                              min="1"
                              style={{ padding: '0.5rem' }}
                            />
                          </div>
                          <div className="form-group" style={{ marginBottom: 0 }}>
                            <label className="form-label" style={{ fontSize: '0.8rem' }}>Preço Unit. (R$)</label>
                            <input
                              type="number"
                              step="0.01"
                              className="form-input"
                              value={fonte.preco_unitario}
                              onChange={(e) => updateFonteCompra(idx, 'preco_unitario', e.target.value)}
                              style={{ padding: '0.5rem' }}
                            />
                          </div>
                          <div className="form-group" style={{ marginBottom: 0 }}>
                            <label className="form-label" style={{ fontSize: '0.8rem' }}>Frete (R$)</label>
                            <input
                              type="number"
                              step="0.01"
                              className="form-input"
                              value={fonte.frete}
                              onChange={(e) => updateFonteCompra(idx, 'frete', e.target.value)}
                              style={{ padding: '0.5rem' }}
                            />
                          </div>
                          <div className="form-group" style={{ marginBottom: 0, gridColumn: 'span 2' }}>
                            <label className="form-label" style={{ fontSize: '0.8rem' }}>Link de Compra</label>
                            <input
                              type="url"
                              className="form-input"
                              value={fonte.link}
                              onChange={(e) => updateFonteCompra(idx, 'link', e.target.value)}
                              placeholder="https://..."
                              style={{ padding: '0.5rem' }}
                            />
                          </div>
                          <div className="form-group" style={{ marginBottom: 0 }}>
                            <label className="form-label" style={{ fontSize: '0.8rem' }}>Fornecedor</label>
                            <input
                              type="text"
                              className="form-input"
                              value={fonte.fornecedor}
                              onChange={(e) => updateFonteCompra(idx, 'fornecedor', e.target.value)}
                              placeholder="Nome do fornecedor"
                              style={{ padding: '0.5rem' }}
                            />
                          </div>
                        </div>
                      </div>
                    ))}

                    {/* Resumo das fontes */}
                    {formData.fontes_compra?.length > 0 && (
                      <div style={{ 
                        background: '#e8f4fd', 
                        padding: '0.75rem 1rem', 
                        borderRadius: '8px', 
                        marginTop: '1rem',
                        display: 'flex',
                        gap: '2rem',
                        flexWrap: 'wrap',
                        fontSize: '0.9rem'
                      }}>
                        {(() => {
                          const { totalQtd, totalCusto, totalFrete } = calcularTotalFontes();
                          const qtdRestante = (formData.quantidade_total || item.quantidade) - totalQtd;
                          return (
                            <>
                              <span>
                                <strong>Total Qtd:</strong> {totalQtd} / {formData.quantidade_total || item.quantidade}
                                {qtdRestante > 0 && <span style={{ color: '#f59e0b' }}> (faltam {qtdRestante})</span>}
                                {qtdRestante < 0 && <span style={{ color: '#ef4444' }}> (excedeu {Math.abs(qtdRestante)})</span>}
                              </span>
                              <span><strong>Custo Total:</strong> {formatBRL(totalCusto)}</span>
                              <span><strong>Frete Total:</strong> {formatBRL(totalFrete)}</span>
                            </>
                          );
                        })()}
                      </div>
                    )}
                  </div>

                  <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end', marginTop: '1.5rem' }}>
                    <button onClick={cancelEdit} className="btn btn-secondary" style={{ padding: '0.5rem 1rem', fontSize: '0.9rem' }} data-testid={`cancel-edit-${index}`}>
                      Cancelar
                    </button>
                    <button onClick={() => saveEdit(item, index)} className="btn btn-primary" style={{ padding: '0.5rem 1rem', fontSize: '0.9rem' }} data-testid={`save-edit-${index}`}>
                      Salvar
                    </button>
                  </div>
                </div>
              ) : (
                <div style={{ marginTop: '1rem' }}>
                  {/* Mostrar fontes de compra se existirem */}
                  {item.fontes_compra && item.fontes_compra.length > 0 && (
                    <div style={{ marginBottom: '1rem', padding: '0.75rem', background: '#e8f4fd', borderRadius: '8px' }}>
                      <div style={{ fontWeight: '600', marginBottom: '0.5rem', color: '#4a5568', fontSize: '0.9rem' }}>
                        📦 Locais de Compra ({item.fontes_compra.length})
                      </div>
                      {item.fontes_compra.map((fc, idx) => (
                        <div key={fc.id || idx} style={{ 
                          display: 'flex', 
                          gap: '1rem', 
                          fontSize: '0.85rem',
                          padding: '0.5rem',
                          background: 'white',
                          borderRadius: '4px',
                          marginBottom: '0.25rem',
                          flexWrap: 'wrap'
                        }}>
                          <span><strong>Qtd:</strong> {fc.quantidade}</span>
                          <span><strong>Preço:</strong> {formatBRL(fc.preco_unitario)}</span>
                          <span><strong>Frete:</strong> {formatBRL(fc.frete || 0)}</span>
                          {fc.fornecedor && <span><strong>Fornecedor:</strong> {fc.fornecedor}</span>}
                          {fc.link && (
                            <a href={fc.link} target="_blank" rel="noopener noreferrer" style={{ color: '#667eea' }}>
                              Ver link
                            </a>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                  
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div style={{ display: 'flex', gap: '1.5rem', fontSize: '0.9rem', flexWrap: 'wrap' }}>
                      {item.preco_venda && (
                        <span>
                          <strong>Preço Venda:</strong> {formatBRL(item.preco_venda)}
                          {item.quantidade && <small> (Total: {formatBRL(item.preco_venda * item.quantidade)})</small>}
                        </span>
                      )}
                      {item.preco_compra && <span><strong>Compra Média:</strong> {formatBRL(item.preco_compra)}</span>}
                      {item.frete_compra && <span><strong>Frete Compra:</strong> {formatBRL(item.frete_compra)}</span>}
                      {isAdmin() && item.frete_envio && <span><strong>Frete Envio:</strong> {formatBRL(item.frete_envio)}</span>}
                      {isAdmin() && item.lucro_liquido !== undefined && item.lucro_liquido !== null && <span><strong>Lucro:</strong> <span style={{ color: item.lucro_liquido > 0 ? '#10b981' : '#ef4444', fontWeight: '700' }}>{formatBRL(item.lucro_liquido)}</span></span>}
                    </div>
                    <button onClick={() => startEdit(item, index)} className="btn btn-secondary" style={{ padding: '0.5rem 1rem', fontSize: '0.85rem' }} data-testid={`edit-item-${index}`}>
                      Editar
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))}
          
          {/* Paginação */}
          {po.items.length > 5 && (
            <Pagination
              totalItems={po.items.length}
              currentPage={currentPage}
              itemsPerPage={itemsPerPage}
              onPageChange={setCurrentPage}
              onItemsPerPageChange={setItemsPerPage}
            />
          )}
        </div>
      </div>
    </div>
  );
};

export default PODetails;
