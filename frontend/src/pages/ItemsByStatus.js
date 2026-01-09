import React, { useState, useEffect, useMemo } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { apiGet, apiPatch, apiPost, API, formatBRL } from '../utils/api';
import { useAuth } from '../contexts/AuthContext';
import { v4 as uuidv4 } from 'uuid';
import { normalizeText } from '../utils/textUtils';

const ItemsByStatus = () => {
  const { status } = useParams();
  const navigate = useNavigate();
  const { isAdmin, user } = useAuth();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [editingItem, setEditingItem] = useState(null);
  const [formData, setFormData] = useState({});
  const [showOnlyMine, setShowOnlyMine] = useState(false);
  const [filterFornecedor, setFilterFornecedor] = useState('todos');
  const [filterResponsavel, setFilterResponsavel] = useState('todos');
  const [searchCodigo, setSearchCodigo] = useState('');
  const [searchOC, setSearchOC] = useState('');
  const [expandedRastreio, setExpandedRastreio] = useState({});
  const [codigosRastreio, setCodigosRastreio] = useState({});  // Objeto com código por item
  const [salvandoRastreio, setSalvandoRastreio] = useState(null);

  const statusLabels = {
    'pendente': 'Pendentes',
    'cotado': 'Cotados',
    'comprado': 'Comprados',
    'em_separacao': 'Em Separação',
    'em_transito': 'Em Trânsito',
    'entregue': 'Entregues'
  };

  useEffect(() => {
    loadItems();
  }, [status]);

  const loadItems = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await apiGet(`${API}/purchase-orders`);
      
      const allItems = [];
      response.data.forEach(po => {
        po.items.forEach(item => {
          if (item.status === status) {
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
      setError('Erro ao carregar itens. Clique para tentar novamente.');
    } finally {
      setLoading(false);
    }
  };

  // Extrair lista única de fornecedores dos itens
  const fornecedoresDisponiveis = useMemo(() => {
    const fornecedores = new Set();
    items.forEach(item => {
      if (item.fontes_compra && item.fontes_compra.length > 0) {
        item.fontes_compra.forEach(fc => {
          if (fc.fornecedor && fc.fornecedor.trim()) {
            fornecedores.add(fc.fornecedor.trim());
          }
        });
      }
    });
    return Array.from(fornecedores).sort();
  }, [items]);

  // Extrair lista única de responsáveis dos itens
  const responsaveisDisponiveis = useMemo(() => {
    const responsaveis = new Set();
    items.forEach(item => {
      if (item.responsavel && item.responsavel.trim()) {
        responsaveis.add(item.responsavel.trim());
      }
    });
    return Array.from(responsaveis).sort();
  }, [items]);

  // Usar useMemo para garantir o recálculo correto quando o filtro mudar
  const displayItems = useMemo(() => {
    let filtered = items;
    
    // Filtro por "Meus Itens"
    if (showOnlyMine && user?.owner_name) {
      filtered = filtered.filter(item => item.responsavel === user.owner_name);
    }
    
    // Filtro por fornecedor (apenas se não for "todos")
    if (filterFornecedor !== 'todos') {
      filtered = filtered.filter(item => {
        if (!item.fontes_compra || item.fontes_compra.length === 0) return false;
        return item.fontes_compra.some(fc => fc.fornecedor === filterFornecedor);
      });
    }
    
    // Filtro por responsável (apenas se não for "todos")
    if (filterResponsavel !== 'todos') {
      filtered = filtered.filter(item => item.responsavel === filterResponsavel);
    }
    
    // Pesquisa por código do item
    if (searchCodigo.trim()) {
      const termo = searchCodigo.trim().toLowerCase();
      filtered = filtered.filter(item => 
        item.codigo_item && item.codigo_item.toLowerCase().includes(termo)
      );
    }
    
    // Pesquisa por OC
    if (searchOC.trim()) {
      const termo = searchOC.trim().toLowerCase();
      filtered = filtered.filter(item => 
        item.numero_oc && item.numero_oc.toLowerCase().includes(termo)
      );
    }
    
    return filtered;
  }, [items, showOnlyMine, user?.owner_name, filterFornecedor, filterResponsavel, searchCodigo, searchOC]);
  
  const myItemsCount = useMemo(() => {
    if (!user?.owner_name) return 0;
    return items.filter(item => item.responsavel === user.owner_name).length;
  }, [items, user?.owner_name]);

  const startEdit = (item) => {
    setEditingItem(`${item.po_id}-${item.codigo_item}`);
    
    // Se já tem fontes de compra, usar elas; senão criar uma vazia
    // Garantir que cada fonte tenha um ID
    const fontesExistentes = (item.fontes_compra && item.fontes_compra.length > 0)
      ? item.fontes_compra.map(fc => ({
          ...fc,
          id: fc.id || uuidv4(),
          quantidade: fc.quantidade || 1,
          preco_unitario: fc.preco_unitario || '',
          frete: fc.frete || '',
          link: fc.link || '',
          fornecedor: fc.fornecedor || ''
        }))
      : [];
    
    setFormData({
      status: item.status || 'pendente',
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
      quantidade_total: item.quantidade || 1
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

  const saveEdit = async (item) => {
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
      
      await apiPatch(`${API}/purchase-orders/${item.po_id}/items/${item.codigo_item}`, payload);
      
      setEditingItem(null);
      setFormData({});
      loadItems();
    } catch (error) {
      console.error('Erro ao atualizar item:', error);
      alert('Erro ao atualizar item');
    }
  };

  // Funções de Rastreio
  const toggleRastreio = (itemKey) => {
    setExpandedRastreio(prev => ({
      ...prev,
      [itemKey]: !prev[itemKey]
    }));
  };

  const copiarCodigo = (codigo) => {
    navigator.clipboard.writeText(codigo);
    alert('Código copiado!');
  };

  const salvarCodigoRastreio = async (item) => {
    const itemKey = `${item.po_id}-${item.codigo_item}`;
    const codigo = codigosRastreio[itemKey] || '';
    
    if (!codigo.trim()) {
      alert('Digite o código de rastreio');
      return;
    }
    
    setSalvandoRastreio(itemKey);
    try {
      await apiPost(`${API}/purchase-orders/${item.po_id}/items/${item.codigo_item}/rastreio`, {
        codigo_rastreio: codigo.trim()
      });
      // Limpar apenas o código desse item
      setCodigosRastreio(prev => {
        const newState = { ...prev };
        delete newState[itemKey];
        return newState;
      });
      alert('Código de rastreio salvo! Item movido para "Em Trânsito".');
      loadItems();
    } catch (error) {
      console.error('Erro ao salvar código de rastreio:', error);
      alert('Erro ao salvar código de rastreio');
    } finally {
      setSalvandoRastreio(null);
    }
  };

  const handleCodigoRastreioChange = (item, value) => {
    const itemKey = `${item.po_id}-${item.codigo_item}`;
    setCodigosRastreio(prev => ({
      ...prev,
      [itemKey]: value.toUpperCase()
    }));
  };

  const atualizarRastreio = async (item) => {
    try {
      await apiPost(`${API}/purchase-orders/${item.po_id}/items/${item.codigo_item}/atualizar-rastreio`, {});
      alert('Rastreio atualizado!');
      loadItems();
    } catch (error) {
      console.error('Erro ao atualizar rastreio:', error);
      alert('Não foi possível atualizar o rastreio. As APIs de rastreamento podem estar temporariamente indisponíveis.');
    }
  };

  const marcarComoEntregue = async (item) => {
    if (!window.confirm('Tem certeza que deseja marcar este item como entregue?')) {
      return;
    }
    
    try {
      await apiPost(`${API}/purchase-orders/${item.po_id}/items/${item.codigo_item}/marcar-entregue`, {});
      alert('Item marcado como entregue!');
      loadItems();
    } catch (error) {
      console.error('Erro ao marcar como entregue:', error);
      alert('Erro ao marcar como entregue');
    }
  };

  if (loading) {
    return <div className="loading" data-testid="loading-items">Carregando...</div>;
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
        <div style={{ display: 'flex', gap: '1rem' }}>
          <button 
            onClick={() => navigate('/')} 
            className="btn btn-secondary"
          >
            ← Voltar ao Dashboard
          </button>
          <button 
            onClick={loadItems} 
            className="btn btn-primary"
          >
            🔄 Tentar Novamente
          </button>
        </div>
      </div>
    );
  }

  return (
    <div data-testid="items-by-status-page">
      <div className="page-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', justifyContent: 'space-between', width: '100%' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
            <button onClick={() => navigate('/')} className="btn btn-secondary" data-testid="back-btn">
              ← Voltar
            </button>
            <div>
              <h1 className="page-title" data-testid="status-title">
                Itens {statusLabels[status] || status}
              </h1>
              <p className="page-subtitle">
                {showOnlyMine ? (
                  <>{displayItems.length} de {items.length} itens (filtrado por {user?.owner_name})</>
                ) : (
                  <>{items.length} {items.length === 1 ? 'item' : 'itens'} com status "{status}"</>
                )}
              </p>
            </div>
          </div>
          
          {/* Botão Meus Itens */}
          {user?.owner_name && (
            <button
              onClick={() => setShowOnlyMine(!showOnlyMine)}
              className={showOnlyMine ? 'btn btn-primary' : 'btn btn-secondary'}
              style={{ 
                padding: '0.6rem 1.2rem',
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem'
              }}
              data-testid="filter-my-items-btn"
            >
              {showOnlyMine ? '👤 Meus Itens ✓' : '👤 Meus Itens'}
              {showOnlyMine && (
                <span style={{ 
                  background: 'white', 
                  color: '#667eea', 
                  borderRadius: '50%', 
                  padding: '0.1rem 0.5rem',
                  fontSize: '0.8rem',
                  fontWeight: '700'
                }}>
                  {displayItems.length}
                </span>
              )}
            </button>
          )}
        </div>
      </div>

      {/* Seção de Filtros */}
      <div style={{ 
        marginBottom: '1.5rem', 
        padding: '1rem', 
        background: '#f7fafc', 
        borderRadius: '8px',
        border: '1px solid #e2e8f0'
      }}>
        {/* Campos de Pesquisa */}
        <div style={{ 
          display: 'grid', 
          gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', 
          gap: '1rem',
          marginBottom: '1rem'
        }}>
          <div>
            <label style={{ fontWeight: '600', color: '#4a5568', fontSize: '0.85rem', display: 'block', marginBottom: '0.5rem' }}>
              🔍 Pesquisar Código do Item:
            </label>
            <input
              type="text"
              value={searchCodigo}
              onChange={(e) => setSearchCodigo(e.target.value)}
              placeholder="Digite o código..."
              className="form-input"
              style={{ width: '100%', padding: '0.5rem 1rem' }}
              data-testid="search-codigo"
            />
          </div>
          <div>
            <label style={{ fontWeight: '600', color: '#4a5568', fontSize: '0.85rem', display: 'block', marginBottom: '0.5rem' }}>
              📋 Pesquisar OC:
            </label>
            <input
              type="text"
              value={searchOC}
              onChange={(e) => setSearchOC(e.target.value)}
              placeholder="Digite o número da OC..."
              className="form-input"
              style={{ width: '100%', padding: '0.5rem 1rem' }}
              data-testid="search-oc"
            />
          </div>
        </div>

        {/* Filtros por Select */}
        <div style={{ 
          display: 'flex', 
          alignItems: 'center', 
          gap: '1.5rem',
          flexWrap: 'wrap'
        }}>
          {/* Filtro por Responsável */}
          {responsaveisDisponiveis.length > 0 && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
              <label style={{ fontWeight: '600', color: '#4a5568', fontSize: '0.85rem' }}>
                👤 Responsável:
              </label>
              <select
                value={filterResponsavel}
                onChange={(e) => setFilterResponsavel(e.target.value)}
                className="form-input"
                style={{ minWidth: '180px', padding: '0.5rem 1rem' }}
                data-testid="filter-responsavel"
              >
                <option value="todos">Todos</option>
                {responsaveisDisponiveis.map(responsavel => (
                  <option key={responsavel} value={responsavel}>{responsavel}</option>
                ))}
              </select>
            </div>
          )}

          {/* Filtro por Fornecedor - apenas admin */}
          {isAdmin() && fornecedoresDisponiveis.length > 0 && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
              <label style={{ fontWeight: '600', color: '#4a5568', fontSize: '0.85rem' }}>
                🏪 Fornecedor:
              </label>
              <select
                value={filterFornecedor}
                onChange={(e) => setFilterFornecedor(e.target.value)}
                className="form-input"
                style={{ minWidth: '180px', padding: '0.5rem 1rem' }}
                data-testid="filter-fornecedor"
              >
                <option value="todos">Todos</option>
                {fornecedoresDisponiveis.map(fornecedor => (
                  <option key={fornecedor} value={fornecedor}>{fornecedor}</option>
                ))}
              </select>
            </div>
          )}
        </div>

        {/* Indicador de filtros ativos */}
        {(filterFornecedor !== 'todos' || filterResponsavel !== 'todos' || searchCodigo.trim() || searchOC.trim()) && (
          <div style={{ 
            display: 'flex', 
            alignItems: 'center', 
            gap: '0.75rem', 
            marginTop: '1rem',
            flexWrap: 'wrap'
          }}>
            <span style={{ 
              background: '#667eea', 
              color: 'white', 
              padding: '0.25rem 0.75rem', 
              borderRadius: '12px',
              fontSize: '0.85rem',
              fontWeight: '600'
            }}>
              {displayItems.length} {displayItems.length === 1 ? 'item encontrado' : 'itens encontrados'}
            </span>
            <button
              onClick={() => {
                setFilterFornecedor('todos');
                setFilterResponsavel('todos');
                setSearchCodigo('');
                setSearchOC('');
              }}
              className="btn btn-secondary"
              style={{ padding: '0.4rem 0.8rem', fontSize: '0.8rem' }}
              data-testid="clear-all-filters"
            >
              ✕ Limpar Filtros
            </button>
          </div>
        )}
      </div>

      <div className="card">
        {displayItems.length === 0 ? (
          <p style={{ textAlign: 'center', color: '#718096', padding: '2rem' }} data-testid="no-items-message">
            {showOnlyMine 
              ? `Nenhum item de ${user?.owner_name} com status "${status}" encontrado.`
              : `Nenhum item com status "${status}" encontrado.`
            }
          </p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            {displayItems.map((item, index) => (
              <div 
                key={`${item.po_id}-${item.codigo_item}-${index}`} 
                className="card" 
                style={{ background: '#f7fafc', border: '1px solid #e2e8f0' }} 
                data-testid={`item-card-${item.codigo_item}`}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', marginBottom: '1rem' }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', gap: '1rem', alignItems: 'center', marginBottom: '0.5rem' }}>
                      <h3 style={{ fontSize: '1.1rem', fontWeight: '700', margin: 0 }}>
                        Código: {item.codigo_item}
                      </h3>
                      <Link 
                        to={`/po/${item.po_id}`} 
                        style={{ fontSize: '0.85rem', color: '#667eea', textDecoration: 'underline' }}
                        data-testid={`link-oc-${item.codigo_item}`}
                      >
                        OC: {item.numero_oc}
                      </Link>
                    </div>
                    <p style={{ color: '#4a5568', marginBottom: '0.5rem' }}>{item.descricao}</p>
                    <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', fontSize: '0.9rem', color: '#718096' }}>
                      <span><strong>Responsável:</strong> <strong style={{ color: '#667eea' }}>{item.responsavel}</strong></span>
                      <span><strong>Quantidade:</strong> {item.quantidade} {item.unidade}</span>
                      <span><strong>Lote:</strong> {item.lote}</span>
                      {item.marca_modelo && <span><strong>Marca/Modelo:</strong> {item.marca_modelo}</span>}
                    </div>
                  </div>
                </div>

                {editingItem === `${item.po_id}-${item.codigo_item}` ? (
                  <div style={{ marginTop: '1rem', padding: '1rem', background: 'white', borderRadius: '8px' }}>
                    {/* Status e Informações de Venda (somente leitura) */}
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '1rem', marginBottom: '1.5rem' }}>
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
                      
                      {/* Preço de Venda - Somente leitura para todos */}
                      {item.preco_venda && (
                        <div className="form-group">
                          <label className="form-label">Preço Venda Unit.</label>
                          <div 
                            style={{ 
                              padding: '0.75rem', 
                              background: '#f0f4f8', 
                              borderRadius: '8px', 
                              fontWeight: '600',
                              color: '#3b82f6'
                            }}
                            data-testid={`display-preco-venda-${item.codigo_item}`}
                          >
                            {formatBRL(item.preco_venda)}
                          </div>
                        </div>
                      )}

                      {/* Valor Total de Venda - Calculado */}
                      {item.preco_venda && (
                        <div className="form-group">
                          <label className="form-label">Valor Total Venda</label>
                          <div 
                            style={{ 
                              padding: '0.75rem', 
                              background: '#e8f4fd', 
                              borderRadius: '8px', 
                              fontWeight: '700',
                              color: '#2563eb'
                            }}
                            data-testid={`display-valor-total-${item.codigo_item}`}
                          >
                            {formatBRL((item.preco_venda || 0) * (item.quantidade || 0))}
                          </div>
                        </div>
                      )}

                      {/* Imposto - Calculado automaticamente (11% do valor total) - Somente leitura */}
                      {item.preco_venda && (
                        <div className="form-group">
                          <label className="form-label">Imposto (11%)</label>
                          <div 
                            style={{ 
                              padding: '0.75rem', 
                              background: '#fef3c7', 
                              borderRadius: '8px', 
                              fontWeight: '600',
                              color: '#b45309'
                            }}
                            data-testid={`display-imposto-${item.codigo_item}`}
                          >
                            {formatBRL(((item.preco_venda || 0) * (item.quantidade || 0)) * 0.11)}
                          </div>
                        </div>
                      )}
                      
                      {/* Frete Envio - Editável apenas para admin */}
                      {isAdmin() && (
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
                          key={fonte.id || `fonte-${idx}`} 
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
                                onChange={(e) => updateFonteCompra(idx, 'fornecedor', normalizeText(e.target.value))}
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
                      <button onClick={cancelEdit} className="btn btn-secondary" style={{ padding: '0.5rem 1rem' }} data-testid={`cancel-edit-${item.codigo_item}`}>
                        Cancelar
                      </button>
                      <button onClick={() => saveEdit(item)} className="btn btn-primary" style={{ padding: '0.5rem 1rem' }} data-testid={`save-edit-${item.codigo_item}`}>
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
                            <strong>Preço Venda Unit.:</strong> {formatBRL(item.preco_venda)}
                          </span>
                        )}
                        {item.preco_venda && (
                          <span>
                            <strong>Valor Total Venda:</strong> <strong style={{ color: '#3b82f6' }}>{formatBRL((item.preco_venda || 0) * (item.quantidade || 0))}</strong>
                          </span>
                        )}
                        {item.preco_compra && (
                          <span>
                            <strong>Preço Compra Médio:</strong> {formatBRL(item.preco_compra)}
                          </span>
                        )}
                        {item.frete_compra && (
                          <span>
                            <strong>Frete Compra:</strong> {formatBRL(item.frete_compra)}
                          </span>
                        )}
                        {isAdmin() && item.frete_envio && (
                          <span>
                            <strong>Frete Envio:</strong> {formatBRL(item.frete_envio)}
                          </span>
                        )}
                        {isAdmin() && item.lucro_liquido !== undefined && item.lucro_liquido !== null && (
                          <span>
                            <strong>Lucro Líquido:</strong>{' '}
                            <span style={{ color: item.lucro_liquido > 0 ? '#10b981' : '#ef4444', fontWeight: '700' }}>
                              {formatBRL(item.lucro_liquido)}
                            </span>
                          </span>
                        )}
                      </div>
                      
                      {/* Seção de Rastreio para itens Comprados */}
                      {status === 'comprado' && isAdmin() && !item.codigo_rastreio && (
                        <div style={{ 
                          marginTop: '1rem', 
                          padding: '1rem', 
                          background: '#f0fdf4', 
                          borderRadius: '8px',
                          border: '1px solid #86efac'
                        }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
                            <label style={{ fontWeight: '600', color: '#166534', fontSize: '0.9rem' }}>
                              📦 Código de Rastreio:
                            </label>
                            <input
                              type="text"
                              placeholder="Ex: AA123456789BR"
                              value={codigosRastreio[`${item.po_id}-${item.codigo_item}`] || ''}
                              onChange={(e) => handleCodigoRastreioChange(item, e.target.value)}
                              className="form-input"
                              style={{ 
                                flex: 1, 
                                minWidth: '180px', 
                                padding: '0.5rem',
                                textTransform: 'uppercase'
                              }}
                              data-testid={`input-rastreio-${item.codigo_item}`}
                            />
                            <button
                              onClick={() => salvarCodigoRastreio(item)}
                              disabled={salvandoRastreio === `${item.po_id}-${item.codigo_item}`}
                              className="btn btn-primary"
                              style={{ padding: '0.5rem 1rem', fontSize: '0.85rem' }}
                              data-testid={`btn-salvar-rastreio-${item.codigo_item}`}
                            >
                              {salvandoRastreio === `${item.po_id}-${item.codigo_item}` ? 'Salvando...' : '🚚 Enviar'}
                            </button>
                          </div>
                        </div>
                      )}

                      {/* Exibir Rastreio para itens Em Trânsito */}
                      {(status === 'em_transito' || item.codigo_rastreio) && item.codigo_rastreio && (
                        <div style={{ 
                          marginTop: '1rem', 
                          padding: '1rem', 
                          background: '#f5f3ff', 
                          borderRadius: '8px',
                          border: '1px solid #c4b5fd'
                        }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                              <span style={{ fontWeight: '600', color: '#5b21b6', fontSize: '0.9rem' }}>
                                📦 Rastreio:
                              </span>
                              <code style={{ 
                                background: '#ede9fe', 
                                padding: '0.25rem 0.75rem', 
                                borderRadius: '4px',
                                fontWeight: '700',
                                color: '#6d28d9',
                                fontSize: '0.95rem'
                              }}>
                                {item.codigo_rastreio}
                              </code>
                              <button
                                onClick={() => copiarCodigo(item.codigo_rastreio)}
                                style={{ 
                                  background: 'none', 
                                  border: 'none', 
                                  cursor: 'pointer',
                                  fontSize: '1rem'
                                }}
                                title="Copiar código"
                                data-testid={`btn-copiar-${item.codigo_item}`}
                              >
                                📋
                              </button>
                            </div>
                            <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                              <button
                                onClick={() => atualizarRastreio(item)}
                                className="btn btn-secondary"
                                style={{ padding: '0.4rem 0.8rem', fontSize: '0.8rem' }}
                                data-testid={`btn-atualizar-rastreio-${item.codigo_item}`}
                              >
                                🔄 Atualizar
                              </button>
                              <button
                                onClick={() => toggleRastreio(`${item.po_id}-${item.codigo_item}`)}
                                className="btn btn-secondary"
                                style={{ padding: '0.4rem 0.8rem', fontSize: '0.8rem' }}
                                data-testid={`btn-toggle-rastreio-${item.codigo_item}`}
                              >
                                {expandedRastreio[`${item.po_id}-${item.codigo_item}`] ? '▲ Ocultar' : '▼ Ver Histórico'}
                              </button>
                              {isAdmin() && status === 'em_transito' && (
                                <button
                                  onClick={() => marcarComoEntregue(item)}
                                  className="btn"
                                  style={{ 
                                    padding: '0.4rem 0.8rem', 
                                    fontSize: '0.8rem',
                                    background: '#22c55e',
                                    color: 'white'
                                  }}
                                  data-testid={`btn-marcar-entregue-${item.codigo_item}`}
                                >
                                  ✓ Marcar Entregue
                                </button>
                              )}
                            </div>
                          </div>
                          
                          {item.data_envio && (
                            <div style={{ fontSize: '0.85rem', color: '#6b7280', marginBottom: '0.5rem' }}>
                              <strong>Enviado em:</strong> {new Date(item.data_envio).toLocaleString('pt-BR')}
                            </div>
                          )}
                          
                          {/* Histórico de Rastreio Expandível */}
                          {expandedRastreio[`${item.po_id}-${item.codigo_item}`] && (
                            <div style={{ 
                              marginTop: '0.75rem', 
                              padding: '0.75rem', 
                              background: 'white', 
                              borderRadius: '6px',
                              maxHeight: '300px',
                              overflowY: 'auto'
                            }}>
                              {item.rastreio_eventos && item.rastreio_eventos.length > 0 ? (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                                  {item.rastreio_eventos.map((evento, idx) => (
                                    <div 
                                      key={idx} 
                                      style={{ 
                                        padding: '0.75rem', 
                                        background: idx === 0 ? '#f0fdf4' : '#f9fafb',
                                        borderRadius: '4px',
                                        borderLeft: idx === 0 ? '3px solid #22c55e' : '3px solid #d1d5db'
                                      }}
                                    >
                                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.25rem' }}>
                                        <strong style={{ color: idx === 0 ? '#166534' : '#374151', fontSize: '0.85rem' }}>
                                          {evento.status}
                                        </strong>
                                        <span style={{ fontSize: '0.8rem', color: '#6b7280' }}>
                                          {evento.data} {evento.hora}
                                        </span>
                                      </div>
                                      <div style={{ fontSize: '0.8rem', color: '#4b5563' }}>
                                        📍 {evento.local}
                                      </div>
                                      {evento.subStatus && evento.subStatus.length > 0 && (
                                        <div style={{ fontSize: '0.75rem', color: '#6b7280', marginTop: '0.25rem' }}>
                                          {evento.subStatus.join(' • ')}
                                        </div>
                                      )}
                                    </div>
                                  ))}
                                </div>
                              ) : (
                                <div style={{ textAlign: 'center', color: '#6b7280', padding: '1rem' }}>
                                  Nenhum evento de rastreio disponível ainda.
                                  <br />
                                  <small>Clique em "Atualizar" para buscar informações.</small>
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      )}

                      <button 
                        onClick={() => startEdit(item)} 
                        className="btn btn-secondary" 
                        style={{ padding: '0.5rem 1rem', fontSize: '0.85rem', marginTop: '1rem' }} 
                        data-testid={`edit-item-${item.codigo_item}`}
                      >
                        Editar
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default ItemsByStatus;
