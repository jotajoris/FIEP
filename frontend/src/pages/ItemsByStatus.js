import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { apiGet, apiPatch, apiPost, apiDelete, API, formatBRL } from '../utils/api';
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
  
  // Estados para Notas Fiscais (página Em Separação)
  const [expandedNF, setExpandedNF] = useState({});
  const [uploadingNF, setUploadingNF] = useState(null);
  const [editingEndereco, setEditingEndereco] = useState(null);
  const [enderecoTemp, setEnderecoTemp] = useState('');
  const [ncmManual, setNcmManual] = useState({});
  const fileInputRef = useRef({});
  
  // Estados para visualização por OC (em_separacao)
  const [expandedOC, setExpandedOC] = useState(null);  // OC expandida para ver itens

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
        po.items.forEach((item, itemIndexInPO) => {
          if (item.status === status) {
            // Criar ID único para cada item (combina po_id + índice dentro da OC)
            const uniqueId = `${po.id}_${itemIndexInPO}`;
            allItems.push({
              ...item,
              numero_oc: po.numero_oc,
              po_id: po.id,
              cnpj_requisitante: po.cnpj_requisitante || '',  // CNPJ do cliente/requisitante
              _itemIndexInPO: itemIndexInPO,
              _uniqueId: uniqueId  // ID único para este item
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
    // Usar ID único do item para evitar conflito
    setEditingItem(item._uniqueId);
    
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
      
      // Usar endpoint com índice para evitar problema com itens duplicados
      await apiPatch(`${API}/purchase-orders/${item.po_id}/items/by-index/${item._itemIndexInPO}`, payload);
      
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

  // ============== FUNÇÕES DE NOTAS FISCAIS ==============
  
  const toggleNFSection = (itemKey) => {
    setExpandedNF(prev => ({
      ...prev,
      [itemKey]: !prev[itemKey]
    }));
  };

  const handleFileUpload = async (item, tipo, event) => {
    const file = event.target.files[0];
    if (!file) return;

    const allowedTypes = ['application/pdf', 'text/xml', 'application/xml'];
    const allowedExtensions = ['.pdf', '.xml'];
    
    const fileExtension = file.name.toLowerCase().slice(file.name.lastIndexOf('.'));
    if (!allowedTypes.includes(file.type) && !allowedExtensions.includes(fileExtension)) {
      alert('Apenas arquivos PDF ou XML são aceitos.');
      return;
    }

    setUploadingNF(`${item._uniqueId}-${tipo}`);
    
    try {
      const reader = new FileReader();
      reader.onload = async (e) => {
        const base64 = e.target.result.split(',')[1];
        const contentType = file.type || (fileExtension === '.xml' ? 'text/xml' : 'application/pdf');
        
        const ncm = ncmManual[`${item._uniqueId}-${tipo}`] || null;
        
        const payload = {
          filename: file.name,
          content_type: contentType,
          file_data: base64,
          ncm_manual: ncm,
          tipo: tipo
        };
        
        const response = await apiPost(
          `${API}/purchase-orders/${item.po_id}/items/by-index/${item._itemIndexInPO}/notas-fiscais`,
          payload
        );
        
        alert(`Nota fiscal adicionada! NCM: ${response.data.ncm}`);
        setNcmManual(prev => ({ ...prev, [`${item._uniqueId}-${tipo}`]: '' }));
        loadItems();
      };
      reader.readAsDataURL(file);
    } catch (error) {
      console.error('Erro ao fazer upload:', error);
      alert('Erro ao fazer upload da nota fiscal.');
    } finally {
      setUploadingNF(null);
      // Limpar input
      if (event.target) event.target.value = '';
    }
  };

  const downloadNF = async (item, nfId, filename) => {
    try {
      const response = await apiGet(
        `${API}/purchase-orders/${item.po_id}/items/by-index/${item._itemIndexInPO}/notas-fiscais/${nfId}/download`
      );
      
      const { file_data, content_type, filename: downloadFilename } = response.data;
      
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
      a.download = downloadFilename || filename;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (error) {
      console.error('Erro ao baixar arquivo:', error);
      alert('Erro ao baixar nota fiscal.');
    }
  };

  const deleteNF = async (item, nfId, tipo) => {
    if (!window.confirm('Tem certeza que deseja remover esta nota fiscal?')) {
      return;
    }
    
    try {
      await apiDelete(
        `${API}/purchase-orders/${item.po_id}/items/by-index/${item._itemIndexInPO}/notas-fiscais/${nfId}?tipo=${tipo}`
      );
      alert('Nota fiscal removida com sucesso!');
      loadItems();
    } catch (error) {
      console.error('Erro ao remover NF:', error);
      alert('Erro ao remover nota fiscal.');
    }
  };

  const updateNCM = async (item, nfId, ncmValue) => {
    if (!ncmValue.trim()) {
      alert('Digite o NCM');
      return;
    }
    
    try {
      await apiPatch(
        `${API}/purchase-orders/${item.po_id}/items/by-index/${item._itemIndexInPO}/notas-fiscais/${nfId}/ncm`,
        { ncm: ncmValue.toUpperCase() }
      );
      alert('NCM atualizado!');
      loadItems();
    } catch (error) {
      console.error('Erro ao atualizar NCM:', error);
      alert('Erro ao atualizar NCM.');
    }
  };

  const toggleNFEmitida = async (item) => {
    try {
      await apiPatch(
        `${API}/purchase-orders/${item.po_id}/items/by-index/${item._itemIndexInPO}/nf-emitida`,
        { nf_emitida_pronto_despacho: !item.nf_emitida_pronto_despacho }
      );
      loadItems();
    } catch (error) {
      console.error('Erro ao atualizar status:', error);
      alert('Erro ao atualizar status.');
    }
  };

  // Função para gerar texto dos Dados Adicionais da NF
  const gerarDadosAdicionaisNF = (item) => {
    // Extrair apenas o número da OC (ex: "OC-2.118938" -> "2.118938")
    const numeroOC = item.numero_oc ? item.numero_oc.replace(/^OC-/i, '') : '';
    const endereco = item.endereco_entrega || 'ENDEREÇO NÃO INFORMADO';
    
    return `EMPRESA OPTANTE PELO SIMPLES NACIONAL
Endereço da entrega: ${endereco}
NF referente à OC - ${numeroOC}
DADOS BANCÁRIOS
Banco: 341 - Itaú Unibanco
Conta: 98814-9
Agência: 3978
Chave PIX: 46.663.556/0001-69`;
  };

  const copiarDadosAdicionais = (item) => {
    const texto = gerarDadosAdicionaisNF(item);
    navigator.clipboard.writeText(texto).then(() => {
      alert('Dados Adicionais copiados para a área de transferência!');
    }).catch(err => {
      console.error('Erro ao copiar:', err);
      alert('Erro ao copiar. Selecione o texto manualmente.');
    });
  };

  const startEditEndereco = (item) => {
    setEditingEndereco(item._uniqueId);
    setEnderecoTemp(item.endereco_entrega || '');
  };

  const cancelEditEndereco = () => {
    setEditingEndereco(null);
    setEnderecoTemp('');
  };

  const saveEndereco = async (item) => {
    try {
      await apiPatch(
        `${API}/purchase-orders/${item.po_id}/items/by-index/${item._itemIndexInPO}/endereco`,
        { endereco: enderecoTemp.toUpperCase() }
      );
      setEditingEndereco(null);
      setEnderecoTemp('');
      loadItems();
    } catch (error) {
      console.error('Erro ao salvar endereço:', error);
      alert('Erro ao salvar endereço.');
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
            {displayItems.map((item) => (
              <div 
                key={item._uniqueId} 
                className="card" 
                style={{ background: '#f7fafc', border: '1px solid #e2e8f0' }} 
                data-testid={`item-card-${item._uniqueId}`}
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

                {editingItem === item._uniqueId ? (
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

                      {/* ============== SEÇÃO EM SEPARAÇÃO - LAYOUT EM DUAS COLUNAS ============== */}
                      {status === 'em_separacao' && (
                        <div style={{ width: '100%', marginTop: '1rem' }}>
                          {/* Layout em duas colunas */}
                          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                            
                            {/* ====== COLUNA ESQUERDA ====== */}
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                              
                              {/* CNPJ do Requisitante */}
                              <div style={{ 
                                padding: '0.75rem', 
                                background: '#fef3c7', 
                                borderRadius: '8px',
                                border: '1px solid #fcd34d'
                              }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                  <div>
                                    <div style={{ fontWeight: '600', color: '#92400e', fontSize: '0.8rem', marginBottom: '0.25rem' }}>
                                      CNPJ DO REQUISITANTE
                                    </div>
                                    <div style={{ fontWeight: '700', color: '#1f2937', fontSize: '1rem' }}>
                                      {item.cnpj_requisitante || '03.802.018/0001-03'}
                                    </div>
                                  </div>
                                  <button
                                    onClick={() => {
                                      navigator.clipboard.writeText(item.cnpj_requisitante || '03.802.018/0001-03');
                                      alert('CNPJ copiado!');
                                    }}
                                    className="btn"
                                    style={{ 
                                      padding: '0.4rem 0.8rem', 
                                      background: '#16a34a',
                                      color: 'white',
                                      border: 'none',
                                      borderRadius: '6px',
                                      cursor: 'pointer',
                                      fontWeight: '600',
                                      fontSize: '0.8rem'
                                    }}
                                    data-testid={`copy-cnpj-${item._uniqueId}`}
                                  >
                                    📋 Copiar
                                  </button>
                                </div>
                              </div>

                              {/* NFs de Compra (Fornecedor) */}
                              <div style={{ 
                                padding: '1rem', 
                                background: '#f5f3ff', 
                                borderRadius: '8px',
                                border: '1px solid #c4b5fd'
                              }}>
                                <div style={{ fontWeight: '700', color: '#5b21b6', marginBottom: '0.75rem', fontSize: '0.9rem' }}>
                                  🏭 NFs de Compra (Fornecedor)
                                </div>
                                
                                {/* Lista de NFs existentes */}
                                {item.notas_fiscais_fornecedor && item.notas_fiscais_fornecedor.length > 0 ? (
                                  <div style={{ marginBottom: '0.75rem' }}>
                                    {item.notas_fiscais_fornecedor.map((nf) => (
                                      <div key={nf.id} style={{ 
                                        padding: '0.5rem',
                                        background: 'white',
                                        borderRadius: '4px',
                                        marginBottom: '0.5rem',
                                        border: '1px solid #ddd6fe',
                                        fontSize: '0.85rem'
                                      }}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                                          <span style={{ fontWeight: '600', color: '#374151', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                            {nf.filename.endsWith('.xml') ? '📑' : '📄'} {nf.filename}
                                          </span>
                                          <button onClick={() => downloadNF(item, nf.id, nf.filename)} style={{ padding: '0.2rem 0.4rem', fontSize: '0.7rem', background: '#e5e7eb', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>⬇️</button>
                                          <button onClick={() => deleteNF(item, nf.id, 'fornecedor')} style={{ padding: '0.2rem 0.4rem', fontSize: '0.7rem', background: '#fee2e2', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>🗑️</button>
                                        </div>
                                        {/* NCMs encontrados */}
                                        <div style={{ marginTop: '0.5rem' }}>
                                          {nf.ncm ? (
                                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.25rem' }}>
                                              {nf.ncm.split(',').map((ncmItem, ncmIdx) => (
                                                <span key={ncmIdx} style={{ 
                                                  padding: '0.15rem 0.4rem',
                                                  background: '#dcfce7',
                                                  color: '#166534',
                                                  borderRadius: '4px',
                                                  fontSize: '0.7rem',
                                                  fontWeight: '600'
                                                }}>
                                                  NCM: {ncmItem.trim()}
                                                </span>
                                              ))}
                                            </div>
                                          ) : (
                                            <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                                              <span style={{ 
                                                padding: '0.15rem 0.4rem',
                                                background: '#fee2e2',
                                                color: '#991b1b',
                                                borderRadius: '4px',
                                                fontSize: '0.7rem',
                                                fontWeight: '600'
                                              }}>
                                                NCM: NÃO ENCONTRADO
                                              </span>
                                              <input
                                                type="text"
                                                placeholder="Digite NCM"
                                                className="form-input"
                                                style={{ flex: 1, padding: '0.25rem', fontSize: '0.75rem', textTransform: 'uppercase', maxWidth: '120px' }}
                                                onKeyDown={(e) => {
                                                  if (e.key === 'Enter' && e.target.value) {
                                                    updateNCM(item, nf.id, e.target.value);
                                                  }
                                                }}
                                              />
                                              <button
                                                onClick={(e) => {
                                                  const input = e.target.previousSibling;
                                                  if (input && input.value) updateNCM(item, nf.id, input.value);
                                                }}
                                                style={{ padding: '0.25rem 0.5rem', fontSize: '0.7rem', background: '#3b82f6', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}
                                              >
                                                Salvar
                                              </button>
                                            </div>
                                          )}
                                        </div>
                                      </div>
                                    ))}
                                  </div>
                                ) : (
                                  <div style={{ padding: '0.5rem', background: 'white', borderRadius: '4px', color: '#9ca3af', fontSize: '0.8rem', marginBottom: '0.75rem' }}>
                                    Nenhuma NF de compra adicionada
                                  </div>
                                )}
                                
                                {/* Upload */}
                                <label style={{ 
                                  display: 'block',
                                  padding: '0.5rem',
                                  background: '#7c3aed',
                                  color: 'white',
                                  borderRadius: '6px',
                                  textAlign: 'center',
                                  cursor: 'pointer',
                                  fontWeight: '600',
                                  fontSize: '0.85rem'
                                }}>
                                  {uploadingNF === `${item._uniqueId}-fornecedor` ? 'Enviando...' : '+ Adicionar NF Compra'}
                                  <input type="file" accept=".pdf,.xml" style={{ display: 'none' }} onChange={(e) => handleFileUpload(item, 'fornecedor', e)} />
                                </label>
                              </div>

                              {/* NF de Venda (ON) - Nossa NF */}
                              <div style={{ 
                                padding: '1rem', 
                                background: item.nota_fiscal_revenda ? '#dcfce7' : '#e0f2fe', 
                                borderRadius: '8px',
                                border: `1px solid ${item.nota_fiscal_revenda ? '#86efac' : '#7dd3fc'}`
                              }}>
                                <div style={{ fontWeight: '700', color: item.nota_fiscal_revenda ? '#166534' : '#0369a1', marginBottom: '0.75rem', fontSize: '0.9rem' }}>
                                  🏢 NF de Venda (ON)
                                </div>
                                
                                {item.nota_fiscal_revenda ? (
                                  <div style={{ 
                                    padding: '0.5rem',
                                    background: 'white',
                                    borderRadius: '4px',
                                    border: '1px solid #86efac',
                                    fontSize: '0.85rem',
                                    marginBottom: '0.5rem'
                                  }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.5rem' }}>
                                      <span style={{ fontWeight: '600', color: '#374151', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                        {item.nota_fiscal_revenda.filename.endsWith('.xml') ? '📑' : '📄'} {item.nota_fiscal_revenda.filename}
                                      </span>
                                      <button onClick={() => downloadNF(item, item.nota_fiscal_revenda.id, item.nota_fiscal_revenda.filename)} style={{ padding: '0.2rem 0.4rem', fontSize: '0.7rem', background: '#e5e7eb', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>⬇️</button>
                                      <button onClick={() => deleteNF(item, item.nota_fiscal_revenda.id, 'revenda')} style={{ padding: '0.2rem 0.4rem', fontSize: '0.7rem', background: '#fee2e2', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>🗑️</button>
                                    </div>
                                  </div>
                                ) : (
                                  <label style={{ 
                                    display: 'block',
                                    padding: '0.5rem',
                                    background: '#0ea5e9',
                                    color: 'white',
                                    borderRadius: '6px',
                                    textAlign: 'center',
                                    cursor: 'pointer',
                                    fontWeight: '600',
                                    fontSize: '0.85rem'
                                  }}>
                                    {uploadingNF === `${item._uniqueId}-revenda` ? 'Enviando...' : '+ Adicionar NF Venda'}
                                    <input type="file" accept=".pdf,.xml" style={{ display: 'none' }} onChange={(e) => handleFileUpload(item, 'revenda', e)} />
                                  </label>
                                )}
                              </div>

                              {/* Checkbox NF Emitida / Pronto para Despacho */}
                              <div style={{ 
                                padding: '0.75rem',
                                background: item.nota_fiscal_revenda ? '#dcfce7' : '#fef3c7',
                                borderRadius: '8px',
                                border: `1px solid ${item.nota_fiscal_revenda ? '#86efac' : '#fcd34d'}`
                              }}>
                                <label style={{ 
                                  display: 'flex', 
                                  alignItems: 'center', 
                                  gap: '0.75rem',
                                  cursor: 'pointer',
                                  fontWeight: '600',
                                  color: item.nota_fiscal_revenda ? '#166534' : '#92400e',
                                  fontSize: '0.9rem'
                                }}>
                                  <input
                                    type="checkbox"
                                    checked={item.nf_emitida_pronto_despacho || false}
                                    onChange={() => toggleNFEmitida(item)}
                                    style={{ width: '18px', height: '18px', cursor: 'pointer' }}
                                    data-testid={`checkbox-nf-emitida-${item._uniqueId}`}
                                  />
                                  {item.nota_fiscal_revenda 
                                    ? '✅ NF Emitida / Pronto para Despacho' 
                                    : '⏳ NF Emitida / Pronto para Despacho'}
                                </label>
                              </div>
                            </div>

                            {/* ====== COLUNA DIREITA ====== */}
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                              
                              {/* Endereço de Entrega */}
                              <div style={{ 
                                padding: '1rem', 
                                background: '#f0f9ff', 
                                borderRadius: '8px',
                                border: '1px solid #bae6fd'
                              }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                                  <div style={{ fontWeight: '700', color: '#0369a1', fontSize: '0.9rem' }}>
                                    📍 ENDEREÇO DE ENTREGA
                                  </div>
                                  {editingEndereco !== item._uniqueId && (
                                    <button
                                      onClick={() => startEditEndereco(item)}
                                      className="btn btn-secondary"
                                      style={{ padding: '0.25rem 0.5rem', fontSize: '0.75rem' }}
                                      data-testid={`edit-endereco-${item._uniqueId}`}
                                    >
                                      ✏️ Editar
                                    </button>
                                  )}
                                </div>
                                
                                {editingEndereco === item._uniqueId ? (
                                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                                    <textarea
                                      value={enderecoTemp}
                                      onChange={(e) => setEnderecoTemp(e.target.value)}
                                      className="form-input"
                                      rows={3}
                                      style={{ width: '100%', textTransform: 'uppercase' }}
                                      placeholder="Digite o endereço completo..."
                                    />
                                    <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
                                      <button onClick={cancelEditEndereco} className="btn btn-secondary" style={{ padding: '0.4rem 0.8rem', fontSize: '0.8rem' }}>Cancelar</button>
                                      <button onClick={() => saveEndereco(item)} className="btn btn-primary" style={{ padding: '0.4rem 0.8rem', fontSize: '0.8rem' }}>Salvar</button>
                                    </div>
                                  </div>
                                ) : (
                                  <div style={{ 
                                    padding: '0.75rem', 
                                    background: 'white', 
                                    borderRadius: '6px',
                                    fontSize: '0.9rem',
                                    fontWeight: '600',
                                    color: item.endereco_entrega ? '#1e3a5f' : '#9ca3af'
                                  }}>
                                    {item.endereco_entrega || 'Endereço não informado'}
                                  </div>
                                )}
                              </div>

                              {/* Dados Adicionais da NF */}
                              <div style={{ 
                                padding: '1rem', 
                                background: '#fef9c3', 
                                borderRadius: '8px',
                                border: '1px solid #fcd34d',
                                flex: 1
                              }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
                                  <div style={{ fontWeight: '700', color: '#854d0e', fontSize: '0.9rem' }}>
                                    📋 DADOS ADICIONAIS DA NF
                                  </div>
                                  <button
                                    onClick={() => copiarDadosAdicionais(item)}
                                    className="btn"
                                    style={{ 
                                      padding: '0.4rem 0.8rem', 
                                      fontSize: '0.8rem',
                                      background: '#16a34a',
                                      color: 'white',
                                      border: 'none',
                                      borderRadius: '6px',
                                      cursor: 'pointer',
                                      fontWeight: '600'
                                    }}
                                    data-testid={`copy-dados-nf-${item._uniqueId}`}
                                  >
                                    📋 Copiar
                                  </button>
                                </div>
                                <div style={{ 
                                  padding: '0.75rem', 
                                  background: 'white', 
                                  borderRadius: '6px',
                                  fontSize: '0.8rem',
                                  lineHeight: '1.5',
                                  color: '#1f2937',
                                  border: '1px solid #e5e7eb'
                                }}>
                                  <div style={{ marginBottom: '0.5rem' }}>EMPRESA OPTANTE PELO SIMPLES NACIONAL</div>
                                  <div style={{ marginBottom: '0.5rem' }}><strong>Endereço da entrega: {item.endereco_entrega || 'NÃO INFORMADO'}</strong></div>
                                  <div style={{ marginBottom: '0.5rem' }}>NF referente à OC - {item.numero_oc ? item.numero_oc.replace(/^OC-/i, '') : ''}</div>
                                  <div style={{ marginTop: '0.75rem', paddingTop: '0.5rem', borderTop: '1px dashed #d1d5db' }}>
                                    <div style={{ fontWeight: '600', marginBottom: '0.25rem' }}>DADOS BANCÁRIOS</div>
                                    <div>Banco: 341 - Itaú Unibanco</div>
                                    <div>Conta: 98814-9</div>
                                    <div>Agência: 3978</div>
                                    <div>Chave PIX: 46.663.556/0001-69</div>
                                  </div>
                                </div>
                              </div>
                            </div>
                          </div>
                        </div>
                      )}

                      <button 
                        onClick={() => startEdit(item)} 
                        className="btn btn-secondary" 
                        style={{ padding: '0.5rem 1rem', fontSize: '0.85rem', marginTop: '1rem' }} 
                        data-testid={`edit-item-${item._uniqueId}`}
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
