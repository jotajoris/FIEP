import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { apiGet, apiPatch, apiPost, apiDelete, API, formatBRL } from '../utils/api';
import { useAuth } from '../contexts/AuthContext';
import { v4 as uuidv4 } from 'uuid';
import { normalizeText } from '../utils/textUtils';
import Pagination from '../components/Pagination';

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
  const [searchDescricao, setSearchDescricao] = useState('');  // Pesquisa por nome/descrição
  const [searchMarca, setSearchMarca] = useState('');  // Pesquisa por marca
  const [searchLink, setSearchLink] = useState('');  // Pesquisa por link de compra
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
  const [uploadingNFVendaOC, setUploadingNFVendaOC] = useState(null);  // Upload de NF de Venda da OC
  const [ocNFVenda, setOcNFVenda] = useState({});  // {po_id: nf_data} - NFs de Venda por OC
  const [ocProntoDespacho, setOcProntoDespacho] = useState({});  // {po_id: boolean} - Status pronto despacho por OC
  const [itensParaNFVenda, setItensParaNFVenda] = useState({});  // {po_id: Set(uniqueId)} - Itens selecionados para NF de Venda
  
  // Estados para carrinho e mover em lote
  const [selectedItems, setSelectedItems] = useState(new Set());  // Itens selecionados para mover
  const [movingToComprado, setMovingToComprado] = useState(false);  // Loading do botão
  const [editingObservacao, setEditingObservacao] = useState(null);  // Item com observação sendo editada
  const [observacaoTemp, setObservacaoTemp] = useState('');  // Valor temporário da observação
  
  // Estados para autocomplete de fornecedor
  const [fornecedoresSistema, setFornecedoresSistema] = useState([]);  // Lista de fornecedores do sistema
  const [fornecedorSugestoes, setFornecedorSugestoes] = useState([]);  // Sugestões filtradas
  const [activeFornecedorIdx, setActiveFornecedorIdx] = useState(null);  // Índice do campo de fornecedor ativo

  // Paginação
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(5);

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
    loadFornecedoresSistema();
    setSelectedItems(new Set());  // Limpar seleção ao trocar de status
    setCurrentPage(1);  // Reset página ao trocar de status
  }, [status]);

  const loadItems = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await apiGet(`${API}/purchase-orders?limit=0`);
      
      // O endpoint retorna {data: [...], total: ..., page: ...}
      const purchaseOrders = response.data.data || response.data || [];
      
      const allItems = [];
      const nfVendaByOC = {}; // Armazenar NF de Venda por OC
      const prontoDespachoByOC = {}; // Armazenar status "pronto para despacho" por OC
      
      purchaseOrders.forEach(po => {
        // Armazenar NF de Venda da OC (se existir)
        if (po.nota_fiscal_venda) {
          nfVendaByOC[po.id] = po.nota_fiscal_venda;
        }
        // Armazenar status "pronto para despacho"
        prontoDespachoByOC[po.id] = po.pronto_despacho || false;
        
        po.items.forEach((item, itemIndexInPO) => {
          if (item.status === status) {
            // Usar o índice original do banco se disponível, senão usar o índice do array
            const realIndex = item._originalIndex !== undefined ? item._originalIndex : itemIndexInPO;
            const uniqueId = `${po.id}_${realIndex}`;
            allItems.push({
              ...item,
              numero_oc: po.numero_oc,
              po_id: po.id,
              cnpj_requisitante: po.cnpj_requisitante || '',
              _itemIndexInPO: realIndex,  // USAR ÍNDICE ORIGINAL DO BANCO
              _uniqueId: uniqueId,
              _ocNFVenda: po.nota_fiscal_venda || null, // NF de Venda da OC
              _ocProntoDespacho: po.pronto_despacho || false // Status pronto para despacho da OC
            });
          }
        });
      });
      
      setItems(allItems);
      setOcNFVenda(nfVendaByOC); // Atualizar estado de NF de Venda por OC
      setOcProntoDespacho(prontoDespachoByOC); // Atualizar estado de pronto despacho por OC
    } catch (error) {
      console.error('Erro ao carregar itens:', error);
      setError('Erro ao carregar itens. Clique para tentar novamente.');
    } finally {
      setLoading(false);
    }
  };

  // Recarregar apenas um item específico sem recarregar toda a lista
  // Preserva estados de expansão e não causa "refresh" visual
  const reloadSingleItem = async (po_id, itemIndex, uniqueId) => {
    try {
      const response = await apiGet(`${API}/purchase-orders/${po_id}`);
      const po = response.data;
      
      if (!po || !po.items) return;
      
      // Encontrar o item específico no PO
      const updatedItem = po.items[itemIndex];
      if (!updatedItem) return;
      
      // Atualizar apenas esse item no estado
      setItems(prevItems => prevItems.map(item => {
        if (item._uniqueId === uniqueId) {
          return {
            ...updatedItem,
            numero_oc: po.numero_oc,
            po_id: po.id,
            cnpj_requisitante: po.cnpj_requisitante || '',
            _itemIndexInPO: itemIndex,
            _uniqueId: uniqueId
          };
        }
        return item;
      }));
    } catch (error) {
      console.error('Erro ao recarregar item:', error);
      // Em caso de erro, faz reload completo como fallback
      loadItems();
    }
  };

  // Carregar lista de fornecedores do sistema para autocomplete
  const loadFornecedoresSistema = async () => {
    try {
      const response = await apiGet(`${API}/fornecedores`);
      setFornecedoresSistema(response.data.fornecedores || []);
    } catch (error) {
      console.error('Erro ao carregar fornecedores:', error);
    }
  };

  // Filtrar sugestões de fornecedor baseado no texto digitado
  const filterFornecedorSugestoes = (texto, idx) => {
    setActiveFornecedorIdx(idx);
    if (!texto || texto.length < 1) {
      setFornecedorSugestoes([]);
      return;
    }
    const textoNorm = texto.toUpperCase();
    const sugestoes = fornecedoresSistema.filter(f => 
      f.toUpperCase().includes(textoNorm)
    ).slice(0, 8);  // Limitar a 8 sugestões
    setFornecedorSugestoes(sugestoes);
  };

  // Selecionar fornecedor da lista de sugestões
  const selecionarFornecedor = (fornecedor, idx) => {
    updateFonteCompra(idx, 'fornecedor', fornecedor);
    setFornecedorSugestoes([]);
    setActiveFornecedorIdx(null);
  };

  // Fechar sugestões ao clicar fora
  const fecharSugestoes = () => {
    setTimeout(() => {
      setFornecedorSugestoes([]);
      setActiveFornecedorIdx(null);
    }, 200);
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
    
    // Filtro por responsável
    if (filterResponsavel !== 'todos') {
      if (filterResponsavel === 'nao_atribuido') {
        // Filtrar itens sem responsável ou com responsável inválido
        filtered = filtered.filter(item => 
          !item.responsavel || 
          item.responsavel.trim() === '' || 
          item.responsavel.includes('NÃO ENCONTRADO') ||
          item.responsavel.includes('Não atribuído')
        );
      } else {
        filtered = filtered.filter(item => item.responsavel === filterResponsavel);
      }
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
    
    // Pesquisa por descrição/nome do item
    if (searchDescricao.trim()) {
      const termo = searchDescricao.trim().toLowerCase();
      filtered = filtered.filter(item => 
        item.descricao && item.descricao.toLowerCase().includes(termo)
      );
    }
    
    // Pesquisa por marca
    if (searchMarca.trim()) {
      const termo = searchMarca.trim().toLowerCase();
      filtered = filtered.filter(item => 
        item.marca_modelo && item.marca_modelo.toLowerCase().includes(termo)
      );
    }
    
    // Pesquisa por link de compra
    if (searchLink.trim()) {
      const termo = searchLink.trim().toLowerCase();
      filtered = filtered.filter(item => 
        item.fontes_compra && item.fontes_compra.some(fc => 
          fc.link && fc.link.toLowerCase().includes(termo)
        )
      );
    }
    
    return filtered;
  }, [items, showOnlyMine, user?.owner_name, filterFornecedor, filterResponsavel, searchCodigo, searchOC, searchDescricao, searchMarca, searchLink]);

  // Itens paginados
  const paginatedItems = useMemo(() => {
    const startIndex = (currentPage - 1) * itemsPerPage;
    return displayItems.slice(startIndex, startIndex + itemsPerPage);
  }, [displayItems, currentPage, itemsPerPage]);

  // Reset página quando filtros mudam
  useEffect(() => {
    setCurrentPage(1);
  }, [showOnlyMine, filterFornecedor, filterResponsavel, searchCodigo, searchOC, searchDescricao, searchMarca, searchLink]);
  
  const myItemsCount = useMemo(() => {
    if (!user?.owner_name) return 0;
    return items.filter(item => item.responsavel === user.owner_name).length;
  }, [items, user?.owner_name]);

  // Agrupar itens por OC para a visualização "Em Separação"
  const itemsGroupedByOC = useMemo(() => {
    if (status !== 'em_separacao') return [];
    
    const grouped = {};
    displayItems.forEach(item => {
      const ocId = item.po_id;
      if (!grouped[ocId]) {
        grouped[ocId] = {
          po_id: ocId,
          numero_oc: item.numero_oc,
          cnpj_requisitante: item.cnpj_requisitante,
          nota_fiscal_venda: ocNFVenda[ocId] || item._ocNFVenda || null, // NF de Venda da OC
          pronto_despacho: ocProntoDespacho[ocId] || item._ocProntoDespacho || false, // Status pronto para despacho
          items: []
        };
      }
      grouped[ocId].items.push(item);
    });
    
    // Converter para array e calcular estatísticas
    return Object.values(grouped).map(oc => {
      const totalItens = oc.items.length;
      
      return {
        ...oc,
        totalItens,
        prontoParaDespacho: oc.pronto_despacho // Agora é controlado pelo checkbox da OC
      };
    }).sort((a, b) => {
      // Ordenar: prontos para despacho primeiro, depois por número de itens
      if (a.prontoParaDespacho !== b.prontoParaDespacho) {
        return a.prontoParaDespacho ? -1 : 1;
      }
      return b.totalItens - a.totalItens;
    });
  }, [status, displayItems, ocNFVenda, ocProntoDespacho]);

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
      observacao: item.observacao || '',  // Campo de observação
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
      console.log('saveEdit chamado para item:', item);
      console.log('formData:', formData);
      console.log('item._itemIndexInPO:', item._itemIndexInPO);
      
      const payload = {
        status: formData.status,
        preco_venda: formData.preco_venda ? parseFloat(formData.preco_venda) : null,
        imposto: formData.imposto ? parseFloat(formData.imposto) : null,
        frete_envio: formData.frete_envio ? parseFloat(formData.frete_envio) : null,
        observacao: formData.observacao || '',  // Salvar observação
        fontes_compra: formData.fontes_compra.map(fc => ({
          id: fc.id,
          quantidade: parseInt(fc.quantidade) || 0,
          preco_unitario: parseFloat(fc.preco_unitario) || 0,
          frete: parseFloat(fc.frete) || 0,
          link: fc.link || '',
          fornecedor: fc.fornecedor || ''
        })).filter(fc => fc.quantidade > 0)
      };
      
      console.log('Payload:', payload);
      console.log('URL:', `${API}/purchase-orders/${item.po_id}/items/by-index/${item._itemIndexInPO}`);
      
      // Usar endpoint com índice para evitar problema com itens duplicados
      const response = await apiPatch(`${API}/purchase-orders/${item.po_id}/items/by-index/${item._itemIndexInPO}`, payload);
      console.log('Resposta:', response.data);
      
      setEditingItem(null);
      setFormData({});
      loadItems();
    } catch (error) {
      console.error('Erro ao atualizar item:', error);
      console.error('Error response:', error.response?.data);
      alert('Erro ao atualizar item: ' + (error.response?.data?.detail || error.message));
    }
  };

  // Funções para Carrinho
  const toggleItemSelection = (item) => {
    const itemKey = item._uniqueId;
    setSelectedItems(prev => {
      const newSet = new Set(prev);
      if (newSet.has(itemKey)) {
        newSet.delete(itemKey);
      } else {
        newSet.add(itemKey);
      }
      return newSet;
    });
  };

  const toggleCarrinho = async (item) => {
    try {
      const newValue = !item.no_carrinho;
      await apiPatch(`${API}/purchase-orders/${item.po_id}/items/by-index/${item._itemIndexInPO}`, {
        status: item.status,
        no_carrinho: newValue
      });
      loadItems();
    } catch (error) {
      console.error('Erro ao atualizar carrinho:', error);
      alert('Erro ao atualizar carrinho');
    }
  };

  const moverParaComprado = async () => {
    if (selectedItems.size === 0) {
      alert('Selecione pelo menos um item');
      return;
    }
    
    const confirmacao = window.confirm(`Mover ${selectedItems.size} item(s) para "Comprado"?`);
    if (!confirmacao) return;
    
    setMovingToComprado(true);
    try {
      // Montar lista de itens para mover
      const itensParaMover = items
        .filter(item => selectedItems.has(item._uniqueId))
        .map(item => ({
          po_id: item.po_id,
          item_index: item._itemIndexInPO
        }));
      
      const response = await apiPost(`${API}/purchase-orders/mover-carrinho-para-comprado`, itensParaMover);
      alert(response.data.message);
      setSelectedItems(new Set());
      loadItems();
    } catch (error) {
      console.error('Erro ao mover itens:', error);
      alert('Erro ao mover itens: ' + (error.response?.data?.detail || error.message));
    } finally {
      setMovingToComprado(false);
    }
  };

  // Funções para Observação
  const iniciarEdicaoObservacao = (item) => {
    setEditingObservacao(item._uniqueId);
    setObservacaoTemp(item.observacao || '');
  };

  const salvarObservacao = async (item) => {
    try {
      await apiPatch(`${API}/purchase-orders/${item.po_id}/items/by-index/${item._itemIndexInPO}`, {
        status: item.status,
        observacao: observacaoTemp
      });
      setEditingObservacao(null);
      setObservacaoTemp('');
      loadItems();
    } catch (error) {
      console.error('Erro ao salvar observação:', error);
      alert('Erro ao salvar observação');
    }
  };

  const cancelarEdicaoObservacao = () => {
    setEditingObservacao(null);
    setObservacaoTemp('');
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
        // Recarregar apenas este item para manter seção expandida
        await reloadSingleItem(item.po_id, item._itemIndexInPO, item._uniqueId);
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
      // Recarregar apenas este item para manter seção expandida
      await reloadSingleItem(item.po_id, item._itemIndexInPO, item._uniqueId);
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
      // Recarregar apenas este item para manter seção expandida
      await reloadSingleItem(item.po_id, item._itemIndexInPO, item._uniqueId);
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
      // Recarregar apenas este item para manter seção expandida
      await reloadSingleItem(item.po_id, item._itemIndexInPO, item._uniqueId);
    } catch (error) {
      console.error('Erro ao atualizar status:', error);
      alert('Erro ao atualizar status.');
    }
  };

  // ============== FUNÇÕES PARA NF DE VENDA DA OC (não do item) ==============

  const uploadNFVendaOC = async (poId, file, ocItems) => {
    // Obter os índices dos itens selecionados
    const selectedSet = itensParaNFVenda[poId] || new Set();
    const itensIndices = [];
    
    // Converter uniqueIds em índices dos itens
    if (selectedSet.size > 0 && ocItems) {
      ocItems.forEach(item => {
        if (selectedSet.has(item._uniqueId)) {
          itensIndices.push(item._itemIndexInPO);
        }
      });
    }
    
    if (itensIndices.length === 0 && ocItems) {
      // Se nenhum item foi selecionado, incluir todos
      ocItems.forEach(item => {
        itensIndices.push(item._itemIndexInPO);
      });
    }
    
    setUploadingNFVendaOC(poId);
    try {
      const reader = new FileReader();
      reader.onload = async () => {
        const base64 = reader.result.split(',')[1];
        const payload = {
          filename: file.name.toUpperCase(),
          content_type: file.type || 'application/pdf',
          file_data: base64,
          itens_indices: itensIndices
        };
        
        const response = await apiPost(`${API}/purchase-orders/${poId}/nf-venda`, payload);
        alert(`NF de Venda adicionada para ${response.data.itens_incluidos} item(s)!`);
        // Limpar seleção após adicionar NF
        setItensParaNFVenda(prev => ({ ...prev, [poId]: new Set() }));
        loadItems(); // Recarregar para atualizar dados da OC
      };
      reader.readAsDataURL(file);
    } catch (error) {
      console.error('Erro ao enviar NF de Venda:', error);
      alert('Erro ao enviar NF de Venda.');
    } finally {
      setUploadingNFVendaOC(null);
    }
  };

  const downloadNFVendaOC = async (poId, filename) => {
    try {
      const response = await apiGet(`${API}/purchase-orders/${poId}/nf-venda/download`);
      const { file_data, content_type } = response.data;
      
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
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (error) {
      console.error('Erro ao baixar NF de Venda:', error);
      alert('Erro ao baixar NF de Venda.');
    }
  };

  const deleteNFVendaOC = async (poId) => {
    if (!window.confirm('Tem certeza que deseja remover a NF de Venda desta OC?')) return;
    
    try {
      await apiDelete(`${API}/purchase-orders/${poId}/nf-venda`);
      alert('NF de Venda removida!');
      loadItems();
    } catch (error) {
      console.error('Erro ao remover NF de Venda:', error);
      alert('Erro ao remover NF de Venda.');
    }
  };

  // Toggle seleção de item para NF de Venda
  const toggleItemParaNFVenda = (poId, itemUniqueId) => {
    setItensParaNFVenda(prev => {
      const currentSet = prev[poId] || new Set();
      const newSet = new Set(currentSet);
      if (newSet.has(itemUniqueId)) {
        newSet.delete(itemUniqueId);
      } else {
        newSet.add(itemUniqueId);
      }
      return { ...prev, [poId]: newSet };
    });
  };

  // Selecionar/desselecionar todos os itens de uma OC
  const toggleTodosItensNFVenda = (poId, items) => {
    setItensParaNFVenda(prev => {
      const currentSet = prev[poId] || new Set();
      const allSelected = items.every(item => currentSet.has(item._uniqueId));
      
      if (allSelected) {
        // Desselecionar todos
        return { ...prev, [poId]: new Set() };
      } else {
        // Selecionar todos
        const newSet = new Set(items.map(item => item._uniqueId));
        return { ...prev, [poId]: newSet };
      }
    });
  };

  // Obter itens selecionados de uma OC
  const getItensSelecionados = (poId) => {
    return itensParaNFVenda[poId] || new Set();
  };

  // Toggle "Pronto para Despacho" da OC inteira
  const toggleProntoDespachoOC = async (poId) => {
    const currentValue = ocProntoDespacho[poId] || false;
    try {
      await apiPatch(`${API}/purchase-orders/${poId}/pronto-despacho`, {
        pronto_despacho: !currentValue
      });
      // Atualizar estado local imediatamente para feedback visual
      setOcProntoDespacho(prev => ({ ...prev, [poId]: !currentValue }));
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

  // Função para renderizar o conteúdo completo de um item (edição, NF, etc)
  // Usada tanto na visualização normal quanto na agrupada por OC
  const renderItemContent = (item) => {
    return (
      <>
        {editingItem === item._uniqueId ? (
          renderEditForm(item)
        ) : (
          renderItemDetails(item)
        )}
      </>
    );
  };

  // Renderiza detalhes do item quando NÃO está em modo de edição
  const renderItemDetails = (item) => {
    return (
      <>
        {/* Fontes de Compra */}
        {item.fontes_compra && item.fontes_compra.length > 0 && (
          <div style={{ marginTop: '0.5rem', padding: '0.75rem', background: '#f0fdf4', borderRadius: '8px', border: '1px solid #bbf7d0' }}>
            <div style={{ fontWeight: '600', color: '#166534', marginBottom: '0.5rem', fontSize: '0.9rem' }}>
              🛒 Locais de Compra ({item.fontes_compra.length})
            </div>
            {item.fontes_compra.map((fc, idx) => (
              <div key={fc.id || idx} style={{ fontSize: '0.85rem', color: '#4a5568', marginBottom: '0.25rem' }}>
                <span><strong>Qtd:</strong> {fc.quantidade}</span>
                <span style={{ marginLeft: '1rem' }}><strong>Preço:</strong> {formatBRL(fc.preco_unitario)}</span>
                <span style={{ marginLeft: '1rem' }}><strong>Frete:</strong> {formatBRL(fc.frete)}</span>
                {fc.fornecedor && <span style={{ marginLeft: '1rem' }}><strong>Fornecedor:</strong> {fc.fornecedor}</span>}
                {fc.link && (
                  <a href={fc.link} target="_blank" rel="noopener noreferrer" style={{ marginLeft: '1rem', color: '#667eea' }}>
                    Ver link
                  </a>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Seção de NFs para Em Separação */}
        {status === 'em_separacao' && renderNFSection(item)}

        {/* Seção de Rastreio para Em Trânsito */}
        {status === 'em_transito' && renderRastreioSection(item)}

        {/* Observação - visível para todos (somente leitura) */}
        {item.observacao && (
          <div style={{ marginTop: '1rem', padding: '0.75rem', background: '#f0f9ff', borderRadius: '8px', border: '1px solid #bae6fd' }}>
            <div style={{ display: 'flex', alignItems: 'center', marginBottom: '0.5rem' }}>
              <span style={{ fontWeight: '600', color: '#0369a1', fontSize: '0.85rem' }}>💬 Observação</span>
            </div>
            <div style={{ color: '#1e3a8a' }}>
              {item.observacao}
            </div>
          </div>
        )}

        {/* Ações: Checkbox Carrinho + Botão Editar */}
        <div style={{ marginTop: '1rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          {/* Checkbox para marcar no carrinho (apenas para cotado) */}
          {status === 'cotado' && (
            <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', padding: '0.5rem', background: item.no_carrinho ? '#dcfce7' : '#f3f4f6', borderRadius: '8px', border: item.no_carrinho ? '2px solid #22c55e' : '1px solid #d1d5db' }}>
              <input
                type="checkbox"
                checked={selectedItems.has(item._uniqueId)}
                onChange={() => toggleItemSelection(item)}
                style={{ width: '18px', height: '18px', cursor: 'pointer' }}
              />
              <span style={{ fontWeight: '500', color: selectedItems.has(item._uniqueId) ? '#15803d' : '#4b5563' }}>
                🛒 Selecionar p/ Comprar
              </span>
            </label>
          )}
          
          {status !== 'cotado' && <div></div>}
          
          <button
            onClick={() => startEdit(item)}
            className="btn btn-primary"
            style={{ padding: '0.5rem 1rem' }}
            data-testid={`edit-btn-${item.codigo_item}`}
          >
            ✏️ Editar
          </button>
        </div>
      </>
    );
  };

  // Renderiza a seção de Notas Fiscais (para Em Separação)
  const renderNFSection = (item) => {
    const isExpanded = expandedNF[item._uniqueId];
    
    return (
      <div style={{ marginTop: '1rem' }}>
        {/* Header com botão toggle */}
        <div 
          onClick={() => toggleNFSection(item._uniqueId)}
          style={{ 
            display: 'flex', 
            justifyContent: 'space-between', 
            alignItems: 'center',
            padding: '0.75rem',
            background: isExpanded ? '#667eea' : '#e2e8f0',
            borderRadius: isExpanded ? '8px 8px 0 0' : '8px',
            cursor: 'pointer',
            transition: 'all 0.2s ease'
          }}
        >
          <span style={{ fontWeight: '600', color: isExpanded ? 'white' : '#4a5568' }}>
            📄 Gestão de Notas Fiscais
          </span>
          <button
            style={{ 
              padding: '0.4rem 0.8rem', 
              fontSize: '0.85rem', 
              background: isExpanded ? 'white' : '#667eea', 
              color: isExpanded ? '#667eea' : 'white', 
              border: 'none', 
              borderRadius: '6px',
              fontWeight: '600',
              cursor: 'pointer'
            }}
          >
            {isExpanded ? '✓ Fechar' : '✏️ Abrir'}
          </button>
        </div>

        {/* Conteúdo expansível */}
        {isExpanded && (
          <div style={{ 
            padding: '1rem',
            background: '#f8fafc',
            border: '1px solid #e2e8f0',
            borderTop: 'none',
            borderRadius: '0 0 8px 8px'
          }}>
            {/* Grid de duas colunas para NFs e Dados */}
            <div style={{ 
              display: 'grid', 
              gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', 
              gap: '1rem'
            }}>
              {/* Coluna Esquerda: CNPJ e NFs */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                {/* CNPJ do Requisitante */}
                {item.cnpj_requisitante && (
                  <div style={{ 
                    padding: '0.75rem', 
                    background: '#fef3c7', 
                    borderRadius: '8px',
                    border: '1px solid #fcd34d'
                  }}>
                    <div style={{ fontSize: '0.75rem', color: '#92400e', fontWeight: '600', marginBottom: '0.25rem' }}>
                      CNPJ DO REQUISITANTE
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      <span style={{ fontWeight: '600', color: '#78350f' }}>{item.cnpj_requisitante}</span>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          navigator.clipboard.writeText(item.cnpj_requisitante);
                          alert('CNPJ copiado!');
                        }}
                        style={{ 
                          padding: '0.25rem 0.5rem', 
                          fontSize: '0.75rem', 
                          background: '#f59e0b', 
                          color: 'white', 
                          border: 'none', 
                          borderRadius: '4px',
                          cursor: 'pointer'
                        }}
                      >
                        📋 Copiar
                      </button>
                    </div>
                  </div>
                )}

            {/* NFs de Compra (Fornecedor) */}
            <div style={{ 
              padding: '0.75rem', 
              background: '#f3e8ff', 
              borderRadius: '8px',
              border: '1px solid #c4b5fd'
            }}>
              <div style={{ fontSize: '0.85rem', color: '#6b21a8', fontWeight: '600', marginBottom: '0.5rem' }}>
                📄 NFs de Compra (Fornecedor)
              </div>
              {item.notas_fiscais_fornecedor && item.notas_fiscais_fornecedor.length > 0 ? (
                item.notas_fiscais_fornecedor.map((nf, idx) => (
                  <div key={nf.id || idx} style={{ 
                    padding: '0.5rem', 
                    background: 'white', 
                    borderRadius: '4px', 
                    marginBottom: '0.25rem',
                    fontSize: '0.8rem'
                  }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span>{nf.filename}</span>
                      <div style={{ display: 'flex', gap: '0.25rem' }}>
                        <button
                          onClick={() => downloadNF(item, nf.id, nf.filename)}
                          style={{ padding: '0.2rem 0.4rem', fontSize: '0.7rem', background: '#667eea', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}
                        >
                          ⬇️
                        </button>
                        <button
                          onClick={() => deleteNF(item, nf.id, 'fornecedor')}
                          style={{ padding: '0.2rem 0.4rem', fontSize: '0.7rem', background: '#ef4444', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}
                        >
                          🗑️
                        </button>
                      </div>
                    </div>
                    {/* Lista de itens da NF com seus NCMs */}
                    {nf.itens_nf && nf.itens_nf.length > 0 && (
                      <div style={{ 
                        marginTop: '0.5rem', 
                        padding: '0.5rem',
                        background: '#f0fdf4',
                        borderRadius: '6px',
                        border: '1px solid #86efac'
                      }}>
                        <div style={{ fontSize: '0.7rem', color: '#166534', fontWeight: '600', marginBottom: '0.4rem' }}>
                          📦 Itens da NF ({nf.itens_nf.length}):
                        </div>
                        {nf.itens_nf.map((itemNf, itemIdx) => (
                          <div 
                            key={itemIdx} 
                            style={{ 
                              display: 'flex', 
                              justifyContent: 'space-between', 
                              alignItems: 'center',
                              padding: '0.3rem 0.5rem',
                              background: 'white',
                              borderRadius: '4px',
                              marginBottom: '0.25rem',
                              fontSize: '0.7rem'
                            }}
                          >
                            <span style={{ 
                              flex: 1, 
                              overflow: 'hidden', 
                              textOverflow: 'ellipsis', 
                              whiteSpace: 'nowrap',
                              color: '#374151',
                              marginRight: '0.5rem'
                            }}>
                              {itemNf.descricao}
                            </span>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', flexShrink: 0 }}>
                              <span style={{ 
                                background: '#fef3c7', 
                                padding: '0.1rem 0.4rem', 
                                borderRadius: '3px',
                                fontWeight: '600',
                                color: '#92400e'
                              }}>
                                {itemNf.ncm}
                              </span>
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  navigator.clipboard.writeText(itemNf.ncm);
                                  alert(`NCM ${itemNf.ncm} copiado!`);
                                }}
                                style={{ 
                                  padding: '0.1rem 0.3rem', 
                                  fontSize: '0.6rem', 
                                  background: '#f59e0b', 
                                  color: 'white', 
                                  border: 'none', 
                                  borderRadius: '3px', 
                                  cursor: 'pointer' 
                                }}
                              >
                                📋
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                    {/* NCM único (fallback para NFs antigas sem lista de itens) */}
                    {(!nf.itens_nf || nf.itens_nf.length === 0) && nf.ncm && (
                      <div style={{ 
                        marginTop: '0.25rem', 
                        display: 'flex', 
                        alignItems: 'center', 
                        gap: '0.5rem',
                        padding: '0.25rem 0.5rem',
                        background: '#fef3c7',
                        borderRadius: '4px'
                      }}>
                        <span style={{ fontSize: '0.75rem', color: '#92400e' }}>
                          <strong>NCM:</strong> {nf.ncm}
                        </span>
                        <button
                          onClick={() => {
                            navigator.clipboard.writeText(nf.ncm);
                            alert('NCM copiado!');
                          }}
                          style={{ 
                            padding: '0.15rem 0.35rem', 
                            fontSize: '0.65rem', 
                            background: '#f59e0b', 
                            color: 'white', 
                            border: 'none', 
                            borderRadius: '3px', 
                            cursor: 'pointer' 
                          }}
                        >
                          📋
                        </button>
                      </div>
                    )}
                  </div>
                ))
              ) : (
                <div style={{ color: '#9ca3af', fontSize: '0.8rem' }}>Nenhuma NF de compra adicionada</div>
              )}
              <button
                onClick={() => {
                  const input = document.createElement('input');
                  input.type = 'file';
                  input.accept = '.pdf,.xml';
                  input.onchange = (e) => handleFileUpload(item, 'fornecedor', e);
                  input.click();
                }}
                disabled={uploadingNF === item._uniqueId}
                style={{ 
                  marginTop: '0.5rem',
                  padding: '0.4rem 0.8rem', 
                  fontSize: '0.8rem', 
                  background: '#7c3aed', 
                  color: 'white', 
                  border: 'none', 
                  borderRadius: '6px',
                  cursor: 'pointer',
                  width: '100%'
                }}
              >
                {uploadingNF === item._uniqueId ? 'Enviando...' : '+ Adicionar NF Compra'}
              </button>
            </div>
          </div>

          {/* Coluna Direita: Endereço e Dados Adicionais */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            {/* Endereço de Entrega */}
            <div style={{ 
              padding: '0.75rem', 
              background: '#dbeafe', 
              borderRadius: '8px',
              border: '1px solid #93c5fd'
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                <div style={{ fontSize: '0.85rem', color: '#1e40af', fontWeight: '600' }}>
                  📍 ENDEREÇO DE ENTREGA
                </div>
                {editingEndereco !== item._uniqueId && (
                  <button
                    onClick={() => startEditEndereco(item)}
                    style={{ padding: '0.2rem 0.5rem', fontSize: '0.7rem', background: '#3b82f6', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}
                  >
                    ✏️ Editar
                  </button>
                )}
              </div>
              {editingEndereco === item._uniqueId ? (
                <div>
                  <textarea
                    value={enderecoTemp}
                    onChange={(e) => setEnderecoTemp(e.target.value)}
                    className="form-input"
                    style={{ width: '100%', minHeight: '60px', marginBottom: '0.5rem' }}
                  />
                  <div style={{ display: 'flex', gap: '0.5rem' }}>
                    <button onClick={() => saveEndereco(item)} style={{ padding: '0.3rem 0.6rem', fontSize: '0.8rem', background: '#22c55e', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>
                      Salvar
                    </button>
                    <button onClick={cancelEditEndereco} style={{ padding: '0.3rem 0.6rem', fontSize: '0.8rem', background: '#9ca3af', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>
                      Cancelar
                    </button>
                  </div>
                </div>
              ) : (
                <div style={{ color: '#1e3a5f', fontSize: '0.9rem', fontWeight: '500' }}>
                  {item.endereco_entrega || 'Não informado'}
                </div>
              )}
            </div>

            {/* Dados Adicionais da NF */}
            <div style={{ 
              padding: '0.75rem', 
              background: '#fef9c3', 
              borderRadius: '8px',
              border: '1px solid #fde047'
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                <div style={{ fontSize: '0.85rem', color: '#854d0e', fontWeight: '600' }}>
                  📝 DADOS ADICIONAIS DA NF
                </div>
                <button
                  onClick={() => copiarDadosAdicionais(item)}
                  style={{ padding: '0.3rem 0.6rem', fontSize: '0.75rem', background: '#eab308', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}
                >
                  📋 Copiar
                </button>
              </div>
              <pre style={{ 
                whiteSpace: 'pre-wrap', 
                fontSize: '0.75rem', 
                color: '#713f12',
                background: 'white',
                padding: '0.5rem',
                borderRadius: '4px',
                margin: 0
              }}>
                {gerarDadosAdicionaisNF(item)}
              </pre>
            </div>
          </div>
        </div>
        </div>
        )}
      </div>
    );
  };

  // Renderiza a seção de Rastreio (para Em Trânsito)
  const renderRastreioSection = (item) => {
    const hasRastreio = item.codigo_rastreio && item.codigo_rastreio.trim();
    
    return (
      <div style={{ marginTop: '1rem', padding: '0.75rem', background: '#fef3c7', borderRadius: '8px', border: '1px solid #fcd34d' }}>
        <div style={{ fontWeight: '600', color: '#92400e', marginBottom: '0.5rem', fontSize: '0.9rem' }}>
          📦 Rastreamento
        </div>
        {hasRastreio ? (
          <div style={{ fontSize: '0.85rem' }}>
            <span><strong>Código:</strong> {item.codigo_rastreio}</span>
            {item.status_rastreio && (
              <span style={{ marginLeft: '1rem' }}><strong>Status:</strong> {item.status_rastreio}</span>
            )}
          </div>
        ) : (
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <input
              type="text"
              placeholder="Código de rastreio"
              value={codigosRastreio[item._uniqueId] || ''}
              onChange={(e) => setCodigosRastreio({...codigosRastreio, [item._uniqueId]: e.target.value.toUpperCase()})}
              className="form-input"
              style={{ flex: 1, padding: '0.4rem' }}
            />
            <button
              onClick={() => salvarCodigoRastreio(item)}
              disabled={salvandoRastreio === item._uniqueId}
              className="btn btn-primary"
              style={{ padding: '0.4rem 0.8rem' }}
            >
              {salvandoRastreio === item._uniqueId ? 'Salvando...' : 'Salvar'}
            </button>
          </div>
        )}
      </div>
    );
  };

  // Renderiza o formulário de edição do item
  const renderEditForm = (item) => {
    return (
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
              />
            </div>
          )}
        </div>

        {/* Campo de Observação */}
        <div style={{ borderTop: '2px solid #e2e8f0', paddingTop: '1rem', marginTop: '1rem' }}>
          <div className="form-group">
            <label className="form-label" style={{ fontSize: '1rem', fontWeight: '600', color: '#4a5568' }}>
              💬 Observação
            </label>
            <textarea
              className="form-input"
              value={formData.observacao || ''}
              onChange={(e) => setFormData({ ...formData, observacao: e.target.value.toUpperCase() })}
              placeholder="Digite uma observação sobre este item..."
              rows={3}
              style={{ resize: 'vertical', minHeight: '80px' }}
            />
          </div>
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
                <div className="form-group" style={{ marginBottom: 0, position: 'relative' }}>
                  <label className="form-label" style={{ fontSize: '0.8rem' }}>Fornecedor</label>
                  <input
                    type="text"
                    className="form-input"
                    value={fonte.fornecedor}
                    onChange={(e) => {
                      updateFonteCompra(idx, 'fornecedor', normalizeText(e.target.value));
                      filterFornecedorSugestoes(e.target.value, idx);
                    }}
                    onFocus={() => filterFornecedorSugestoes(fonte.fornecedor, idx)}
                    onBlur={fecharSugestoes}
                    placeholder="Nome do fornecedor"
                    style={{ padding: '0.5rem' }}
                    autoComplete="off"
                  />
                  {/* Menu de sugestões */}
                  {activeFornecedorIdx === idx && fornecedorSugestoes.length > 0 && (
                    <div style={{
                      position: 'absolute',
                      top: '100%',
                      left: 0,
                      right: 0,
                      background: 'white',
                      border: '1px solid #e2e8f0',
                      borderRadius: '8px',
                      boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
                      zIndex: 1000,
                      maxHeight: '200px',
                      overflowY: 'auto'
                    }}>
                      {fornecedorSugestoes.map((sugestao, sIdx) => (
                        <div
                          key={sIdx}
                          onMouseDown={() => selecionarFornecedor(sugestao, idx)}
                          style={{
                            padding: '0.5rem 0.75rem',
                            cursor: 'pointer',
                            borderBottom: sIdx < fornecedorSugestoes.length - 1 ? '1px solid #f0f0f0' : 'none',
                            background: 'white',
                            fontSize: '0.85rem'
                          }}
                          onMouseEnter={(e) => e.target.style.background = '#f0f4ff'}
                          onMouseLeave={(e) => e.target.style.background = 'white'}
                        >
                          {sugestao}
                        </div>
                      ))}
                    </div>
                  )}
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
          <button onClick={cancelEdit} className="btn btn-secondary" style={{ padding: '0.5rem 1rem' }}>
            Cancelar
          </button>
          <button onClick={() => saveEdit(item)} className="btn btn-primary" style={{ padding: '0.5rem 1rem' }}>
            Salvar
          </button>
        </div>
      </div>
    );
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
                  <>{items.length} {items.length === 1 ? 'item' : 'itens'} com status &quot;{status}&quot;</>
                )}
              </p>
            </div>
          </div>
          
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            {/* Botão Mover para Comprado - aparece quando há itens selecionados */}
            {status === 'cotado' && selectedItems.size > 0 && (
              <button
                onClick={moverParaComprado}
                disabled={movingToComprado}
                style={{ 
                  padding: '0.6rem 1.2rem',
                  background: movingToComprado ? '#9ca3af' : '#22c55e',
                  color: 'white',
                  border: 'none',
                  borderRadius: '8px',
                  fontWeight: '600',
                  cursor: movingToComprado ? 'not-allowed' : 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.5rem',
                  boxShadow: '0 2px 4px rgba(0,0,0,0.1)'
                }}
                data-testid="mover-para-comprado-btn"
              >
                {movingToComprado ? '⏳ Movendo...' : `🛒 Mover ${selectedItems.size} para Comprado`}
              </button>
            )}
            
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
          <div>
            <label style={{ fontWeight: '600', color: '#4a5568', fontSize: '0.85rem', display: 'block', marginBottom: '0.5rem' }}>
              📦 Pesquisar Nome do Item:
            </label>
            <input
              type="text"
              value={searchDescricao}
              onChange={(e) => setSearchDescricao(e.target.value)}
              placeholder="Digite o nome/descrição..."
              className="form-input"
              style={{ width: '100%', padding: '0.5rem 1rem' }}
              data-testid="search-descricao"
            />
          </div>
          <div>
            <label style={{ fontWeight: '600', color: '#4a5568', fontSize: '0.85rem', display: 'block', marginBottom: '0.5rem' }}>
              🏷️ Pesquisar Marca:
            </label>
            <input
              type="text"
              value={searchMarca}
              onChange={(e) => setSearchMarca(e.target.value)}
              placeholder="Digite a marca..."
              className="form-input"
              style={{ width: '100%', padding: '0.5rem 1rem' }}
              data-testid="search-marca"
            />
          </div>
          <div>
            <label style={{ fontWeight: '600', color: '#4a5568', fontSize: '0.85rem', display: 'block', marginBottom: '0.5rem' }}>
              🔗 Pesquisar Link:
            </label>
            <input
              type="text"
              value={searchLink}
              onChange={(e) => setSearchLink(e.target.value)}
              placeholder="Digite parte do link..."
              className="form-input"
              style={{ width: '100%', padding: '0.5rem 1rem' }}
              data-testid="search-link"
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
                <option value="nao_atribuido">⚠️ Não Atribuído</option>
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
        {(filterFornecedor !== 'todos' || filterResponsavel !== 'todos' || searchCodigo.trim() || searchOC.trim() || searchDescricao.trim() || searchMarca.trim() || searchLink.trim()) && (
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
        ) : status === 'em_separacao' ? (
          /* ============ VISUALIZAÇÃO POR OC (Em Separação) ============ */
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            {itemsGroupedByOC.map((oc) => (
              <div 
                key={oc.po_id} 
                className="card" 
                style={{ 
                  background: oc.prontoParaDespacho ? '#f0fdf4' : '#f7fafc', 
                  border: oc.prontoParaDespacho ? '2px solid #22c55e' : '1px solid #e2e8f0',
                  transition: 'all 0.2s ease'
                }} 
                data-testid={`oc-card-${oc.po_id}`}
              >
                {/* Header da OC - Clicável para expandir */}
                <div 
                  onClick={() => setExpandedOC(expandedOC === oc.po_id ? null : oc.po_id)}
                  style={{ 
                    display: 'flex', 
                    justifyContent: 'space-between', 
                    alignItems: 'center',
                    cursor: 'pointer',
                    padding: '0.5rem'
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                    {/* Indicador de status */}
                    <div style={{ 
                      width: '50px', 
                      height: '50px', 
                      borderRadius: '50%', 
                      background: oc.prontoParaDespacho ? '#22c55e' : '#f59e0b',
                      color: 'white',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontWeight: '700',
                      fontSize: '0.75rem',
                      textAlign: 'center',
                      lineHeight: '1.1'
                    }}>
                      {oc.prontoParaDespacho ? '✓' : oc.totalItens}
                    </div>
                    
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.25rem' }}>
                        <h3 style={{ fontSize: '1.2rem', fontWeight: '700', margin: 0, color: '#1f2937' }}>
                          {oc.numero_oc}
                        </h3>
                        {oc.prontoParaDespacho && (
                          <span style={{ 
                            background: '#22c55e', 
                            color: 'white', 
                            padding: '0.2rem 0.6rem', 
                            borderRadius: '12px',
                            fontSize: '0.75rem',
                            fontWeight: '600'
                          }}>
                            PRONTO PARA DESPACHO
                          </span>
                        )}
                      </div>
                      <div style={{ fontSize: '0.9rem', color: '#6b7280' }}>
                        <strong style={{ color: '#667eea' }}>
                          {oc.totalItens} {oc.totalItens === 1 ? 'item' : 'itens'}
                        </strong>
                        {oc.nota_fiscal_venda && (
                          <span style={{ marginLeft: '0.5rem', color: '#16a34a' }}>
                            • NF Anexada
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                  
                  <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                    <Link 
                      to={`/po/${oc.po_id}`}
                      onClick={(e) => e.stopPropagation()}
                      style={{ 
                        fontSize: '0.85rem', 
                        color: '#667eea', 
                        textDecoration: 'underline'
                      }}
                    >
                      Ver OC Completa
                    </Link>
                    <div style={{ fontSize: '1.5rem', color: '#6b7280' }}>
                      {expandedOC === oc.po_id ? '▲' : '▼'}
                    </div>
                  </div>
                </div>

                {/* Área expandida - Itens da OC */}
                {expandedOC === oc.po_id && (
                  <div style={{ marginTop: '1rem', borderTop: '1px solid #e5e7eb', paddingTop: '1rem' }}>
                    
                    {/* NF de Venda da OC (1 por OC inteira) */}
                    <div style={{ 
                      marginBottom: '1.5rem', 
                      padding: '1rem', 
                      background: oc.nota_fiscal_venda ? '#dcfce7' : '#fef3c7', 
                      borderRadius: '8px',
                      border: `2px solid ${oc.nota_fiscal_venda ? '#22c55e' : '#f59e0b'}`
                    }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
                        <h4 style={{ 
                          margin: 0, 
                          fontSize: '1rem', 
                          fontWeight: '700', 
                          color: oc.nota_fiscal_venda ? '#166534' : '#92400e'
                        }}>
                          🏢 NF de Venda (ON) - {oc.numero_oc}
                        </h4>
                        {oc.nota_fiscal_venda && (
                          <span style={{ 
                            background: '#22c55e', 
                            color: 'white', 
                            padding: '0.25rem 0.75rem', 
                            borderRadius: '12px',
                            fontSize: '0.8rem',
                            fontWeight: '600'
                          }}>
                            ✓ NF Anexada
                          </span>
                        )}
                      </div>
                      
                      {oc.nota_fiscal_venda ? (
                        <div style={{ 
                          display: 'flex', 
                          alignItems: 'center', 
                          justifyContent: 'space-between',
                          padding: '0.75rem',
                          background: 'white',
                          borderRadius: '6px'
                        }}>
                          <div>
                            <span style={{ fontWeight: '600' }}>
                              {oc.nota_fiscal_venda.filename.endsWith('.xml') ? '📑' : '📄'} {oc.nota_fiscal_venda.filename}
                            </span>
                            {oc.nota_fiscal_venda.numero_nf && (
                              <span style={{ marginLeft: '1rem', color: '#6b7280', fontSize: '0.9rem' }}>
                                (NF: {oc.nota_fiscal_venda.numero_nf})
                              </span>
                            )}
                          </div>
                          <div style={{ display: 'flex', gap: '0.5rem' }}>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                downloadNFVendaOC(oc.po_id, oc.nota_fiscal_venda.filename);
                              }}
                              style={{ 
                                padding: '0.4rem 0.8rem', 
                                fontSize: '0.85rem', 
                                background: '#667eea', 
                                color: 'white', 
                                border: 'none', 
                                borderRadius: '6px', 
                                cursor: 'pointer' 
                              }}
                            >
                              ⬇️ Baixar
                            </button>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                deleteNFVendaOC(oc.po_id);
                              }}
                              style={{ 
                                padding: '0.4rem 0.8rem', 
                                fontSize: '0.85rem', 
                                background: '#ef4444', 
                                color: 'white', 
                                border: 'none', 
                                borderRadius: '6px', 
                                cursor: 'pointer' 
                              }}
                            >
                              🗑️ Remover
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div style={{ textAlign: 'center' }}>
                          <p style={{ color: '#92400e', fontSize: '0.9rem', marginBottom: '0.75rem' }}>
                            Adicione a NF de Venda (ON) para esta OC completa
                          </p>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              const input = document.createElement('input');
                              input.type = 'file';
                              input.accept = '.pdf,.xml';
                              input.onchange = (ev) => {
                                if (ev.target.files && ev.target.files[0]) {
                                  uploadNFVendaOC(oc.po_id, ev.target.files[0]);
                                }
                              };
                              input.click();
                            }}
                            disabled={uploadingNFVendaOC === oc.po_id}
                            style={{ 
                              padding: '0.6rem 1.5rem', 
                              fontSize: '0.9rem', 
                              background: uploadingNFVendaOC === oc.po_id ? '#9ca3af' : '#22c55e', 
                              color: 'white', 
                              border: 'none', 
                              borderRadius: '8px',
                              cursor: uploadingNFVendaOC === oc.po_id ? 'not-allowed' : 'pointer',
                              fontWeight: '600'
                            }}
                          >
                            {uploadingNFVendaOC === oc.po_id ? '⏳ Enviando...' : '+ Adicionar NF de Venda (ON)'}
                          </button>
                        </div>
                      )}
                    </div>

                    {/* Checkbox Pronto para Despacho da OC */}
                    <div style={{ 
                      marginBottom: '1.5rem', 
                      padding: '1rem', 
                      background: oc.pronto_despacho ? '#dcfce7' : '#fef2f2', 
                      borderRadius: '8px',
                      border: `2px solid ${oc.pronto_despacho ? '#22c55e' : '#fca5a5'}`
                    }}>
                      <label style={{ 
                        display: 'flex', 
                        alignItems: 'center', 
                        gap: '0.75rem',
                        cursor: 'pointer',
                        fontSize: '1rem',
                        fontWeight: '600'
                      }}>
                        <input
                          type="checkbox"
                          checked={oc.pronto_despacho || false}
                          onChange={(e) => {
                            e.stopPropagation();
                            toggleProntoDespachoOC(oc.po_id);
                          }}
                          style={{ 
                            width: '22px', 
                            height: '22px', 
                            cursor: 'pointer',
                            accentColor: '#22c55e'
                          }}
                        />
                        <span style={{ color: oc.pronto_despacho ? '#16a34a' : '#dc2626' }}>
                          {oc.pronto_despacho ? '✅ NF Emitida / Pronto para Despacho' : '⏳ NF Emitida / Pronto para Despacho'}
                        </span>
                      </label>
                    </div>

                    {/* Seleção de Itens para NF de Venda */}
                    <div style={{ 
                      marginBottom: '1rem', 
                      padding: '0.75rem', 
                      background: '#f0f4ff', 
                      borderRadius: '8px',
                      border: '1px solid #c7d2fe',
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      flexWrap: 'wrap',
                      gap: '0.5rem'
                    }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            toggleTodosItensNFVenda(oc.po_id, oc.items);
                          }}
                          style={{ 
                            padding: '0.4rem 0.8rem',
                            background: oc.items.every(item => getItensSelecionados(oc.po_id).has(item._uniqueId)) ? '#6366f1' : '#e2e8f0',
                            color: oc.items.every(item => getItensSelecionados(oc.po_id).has(item._uniqueId)) ? 'white' : '#374151',
                            border: 'none',
                            borderRadius: '6px',
                            cursor: 'pointer',
                            fontSize: '0.85rem',
                            fontWeight: '600'
                          }}
                        >
                          {oc.items.every(item => getItensSelecionados(oc.po_id).has(item._uniqueId)) ? '☑️ Desmarcar Todos' : '☐ Selecionar Todos'}
                        </button>
                        <span style={{ fontSize: '0.9rem', color: '#4338ca', fontWeight: '600' }}>
                          📋 {getItensSelecionados(oc.po_id).size} de {oc.items.length} itens selecionados para NF
                        </span>
                      </div>
                      {getItensSelecionados(oc.po_id).size > 0 && (
                        <span style={{ 
                          padding: '0.3rem 0.6rem',
                          background: '#22c55e',
                          color: 'white',
                          borderRadius: '6px',
                          fontSize: '0.8rem',
                          fontWeight: '600'
                        }}>
                          ✓ Itens prontos para emissão
                        </span>
                      )}
                    </div>

                    {/* Lista de Itens da OC */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                      {oc.items.map((item) => {
                        const isSelectedForNF = getItensSelecionados(oc.po_id).has(item._uniqueId);
                        return (
                          <div 
                            key={item._uniqueId} 
                            className="card" 
                            style={{ 
                              background: isSelectedForNF ? '#f0fdf4' : 'white', 
                              border: isSelectedForNF ? '2px solid #22c55e' : '1px solid #e2e8f0'
                            }} 
                            data-testid={`item-card-${item._uniqueId}`}
                          >
                            {/* Checkbox e Renderização do item */}
                            <div style={{ display: 'flex', gap: '1rem', alignItems: 'flex-start' }}>
                              {/* Checkbox para seleção */}
                              <div style={{ paddingTop: '0.25rem' }}>
                                <input
                                  type="checkbox"
                                  checked={isSelectedForNF}
                                  onChange={(e) => {
                                    e.stopPropagation();
                                    toggleItemParaNFVenda(oc.po_id, item._uniqueId);
                                  }}
                                  style={{ 
                                    width: '20px', 
                                    height: '20px', 
                                    cursor: 'pointer',
                                    accentColor: '#22c55e'
                                  }}
                                  title="Selecionar para NF de Venda"
                                />
                              </div>
                              
                              {/* Conteúdo do item */}
                              <div style={{ flex: 1 }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', marginBottom: '1rem' }}>
                                  <div style={{ flex: 1 }}>
                                    <div style={{ display: 'flex', gap: '1rem', alignItems: 'center', marginBottom: '0.5rem' }}>
                                      <h3 style={{ fontSize: '1.1rem', fontWeight: '700', margin: 0 }}>
                                        Código: {item.codigo_item}
                                      </h3>
                                      {isSelectedForNF && (
                                        <span style={{ 
                                          background: '#22c55e',
                                          color: 'white',
                                          padding: '0.15rem 0.5rem',
                                          borderRadius: '8px',
                                          fontSize: '0.7rem',
                                          fontWeight: '600'
                                        }}>
                                          ✓ SELECIONADO
                                        </span>
                                      )}
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

                                {/* Reutiliza a renderização de edição/NF do item original */}
                                {renderItemContent(item)}
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        ) : (
          /* ============ VISUALIZAÇÃO NORMAL (outros status) ============ */
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            {paginatedItems.map((item) => (
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
                            <div className="form-group" style={{ marginBottom: 0, position: 'relative' }}>
                              <label className="form-label" style={{ fontSize: '0.8rem' }}>Fornecedor</label>
                              <input
                                type="text"
                                className="form-input"
                                value={fonte.fornecedor}
                                onChange={(e) => {
                                  updateFonteCompra(idx, 'fornecedor', normalizeText(e.target.value));
                                  filterFornecedorSugestoes(e.target.value, idx);
                                }}
                                onFocus={() => filterFornecedorSugestoes(fonte.fornecedor, idx)}
                                onBlur={fecharSugestoes}
                                placeholder="Nome do fornecedor"
                                style={{ padding: '0.5rem' }}
                                autoComplete="off"
                              />
                              {/* Menu de sugestões */}
                              {activeFornecedorIdx === idx && fornecedorSugestoes.length > 0 && (
                                <div style={{
                                  position: 'absolute',
                                  top: '100%',
                                  left: 0,
                                  right: 0,
                                  background: 'white',
                                  border: '1px solid #e2e8f0',
                                  borderRadius: '8px',
                                  boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
                                  zIndex: 1000,
                                  maxHeight: '200px',
                                  overflowY: 'auto'
                                }}>
                                  {fornecedorSugestoes.map((sugestao, sIdx) => (
                                    <div
                                      key={sIdx}
                                      onMouseDown={() => selecionarFornecedor(sugestao, idx)}
                                      style={{
                                        padding: '0.5rem 0.75rem',
                                        cursor: 'pointer',
                                        borderBottom: sIdx < fornecedorSugestoes.length - 1 ? '1px solid #f0f0f0' : 'none',
                                        background: 'white',
                                        fontSize: '0.85rem'
                                      }}
                                      onMouseEnter={(e) => e.target.style.background = '#f0f4ff'}
                                      onMouseLeave={(e) => e.target.style.background = 'white'}
                                    >
                                      {sugestao}
                                    </div>
                                  ))}
                                </div>
                              )}
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
                                  <small>Clique em &quot;Atualizar&quot; para buscar informações.</small>
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

                      {/* ============ OBSERVAÇÃO - VISÍVEL PARA TODOS ============ */}
                      <div style={{ marginTop: '1rem', padding: '0.75rem', background: '#f0f9ff', borderRadius: '8px', border: '1px solid #bae6fd' }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                          <span style={{ fontWeight: '600', color: '#0369a1', fontSize: '0.85rem' }}>💬 Observação</span>
                          {editingObservacao !== item._uniqueId && (
                            <button
                              onClick={() => iniciarEdicaoObservacao(item)}
                              style={{ padding: '0.25rem 0.5rem', fontSize: '0.75rem', background: '#0ea5e9', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}
                              data-testid={`btn-observacao-${item._uniqueId}`}
                            >
                              {item.observacao ? 'Editar' : 'Adicionar'}
                            </button>
                          )}
                        </div>
                        {editingObservacao === item._uniqueId ? (
                          <div style={{ display: 'flex', gap: '0.5rem' }}>
                            <textarea
                              value={observacaoTemp}
                              onChange={(e) => setObservacaoTemp(e.target.value)}
                              placeholder="Digite uma observação..."
                              style={{ flex: 1, padding: '0.5rem', borderRadius: '4px', border: '1px solid #ccc', minHeight: '60px', resize: 'vertical' }}
                              data-testid={`textarea-observacao-${item._uniqueId}`}
                            />
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                              <button onClick={() => salvarObservacao(item)} style={{ padding: '0.5rem', background: '#22c55e', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }} data-testid={`btn-salvar-observacao-${item._uniqueId}`}>✓</button>
                              <button onClick={cancelarEdicaoObservacao} style={{ padding: '0.5rem', background: '#ef4444', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }} data-testid={`btn-cancelar-observacao-${item._uniqueId}`}>✕</button>
                            </div>
                          </div>
                        ) : (
                          <div style={{ color: item.observacao ? '#1e3a8a' : '#94a3b8', fontStyle: item.observacao ? 'normal' : 'italic' }}>
                            {item.observacao || 'Nenhuma observação'}
                          </div>
                        )}
                      </div>

                      {/* ============ CHECKBOX NO CARRINHO - APENAS PARA COTADO ============ */}
                      <div style={{ marginTop: '1rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        {status === 'cotado' && (
                          <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', padding: '0.5rem', background: selectedItems.has(item._uniqueId) ? '#dcfce7' : '#f3f4f6', borderRadius: '8px', border: selectedItems.has(item._uniqueId) ? '2px solid #22c55e' : '1px solid #d1d5db' }}>
                            <input
                              type="checkbox"
                              checked={selectedItems.has(item._uniqueId)}
                              onChange={() => toggleItemSelection(item)}
                              style={{ width: '18px', height: '18px', cursor: 'pointer' }}
                              data-testid={`checkbox-carrinho-${item._uniqueId}`}
                            />
                            <span style={{ fontWeight: '500', color: selectedItems.has(item._uniqueId) ? '#15803d' : '#4b5563' }}>
                              🛒 Selecionar p/ Comprar
                            </span>
                          </label>
                        )}
                        
                        {status !== 'cotado' && <div></div>}

                        <button 
                          onClick={() => startEdit(item)} 
                          className="btn btn-secondary" 
                          style={{ padding: '0.5rem 1rem', fontSize: '0.85rem' }} 
                          data-testid={`edit-item-${item._uniqueId}`}
                        >
                          Editar
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            ))}
            
            {/* Paginação */}
            {displayItems.length > 5 && (
              <Pagination
                totalItems={displayItems.length}
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

export default ItemsByStatus;
