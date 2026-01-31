import React, { useState, useEffect, useMemo, useRef, useCallback, memo } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { apiGet, apiPatch, apiPost, apiDelete, API, BACKEND_URL, formatBRL, API_URL } from '../utils/api';
import { useAuth } from '../contexts/AuthContext';
import { v4 as uuidv4 } from 'uuid';
import { normalizeText } from '../utils/textUtils';

// Importar componentes modularizados
import {
  DataEntregaBadge,
  ItemFilters,
  Pagination,
  FreteRastreioForm,
  ItemImage,
  StatusBadge,
  EstoqueBadge,
  DespachoReadyBadge,
  ItemSelectionCheckboxes,
  MudarStatusForm,
  OcCardHeader,
  ProntoDespachoToggle,
  RastreioLoteForm,
  RastreioItemCard,
  calcularStatusEntrega,
  statusLabels,
  statusColors,
  statusOptions
} from '../components/items';

// Importar novos componentes refatorados
import { UsarEstoqueModal } from '../components/ItemsByStatus';

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
  const [editingEnderecoOC, setEditingEnderecoOC] = useState(null);  // OC com endereço sendo editado
  const [enderecoOCTemp, setEnderecoOCTemp] = useState('');  // Endereço temporário da OC
  const [ncmManual, setNcmManual] = useState({});
  const fileInputRef = useRef({});
  
  // Estados para visualização por OC (em_separacao)
  const [expandedOC, setExpandedOC] = useState(null);  // OC expandida para ver itens
  const [uploadingNFVendaOC, setUploadingNFVendaOC] = useState(null);  // Upload de NF de Venda da OC
  const [ocNFVenda, setOcNFVenda] = useState({});  // {po_id: nf_data} - NFs de Venda por OC
  const [ocNFsVenda, setOcNFsVenda] = useState({});  // {po_id: [nfs]} - Lista de todas NFs de Venda por OC
  const [ocProntoDespacho, setOcProntoDespacho] = useState({});  // {po_id: boolean} - Status pronto despacho por OC
  const [itensParaNFVenda, setItensParaNFVenda] = useState({});  // {po_id: Set(uniqueId)} - Itens selecionados para NF de Venda
  const [agruparPorCodigoOC, setAgruparPorCodigoOC] = useState({});  // {po_id: boolean} - Agrupar itens por código dentro da OC
  
  // Estados para edição dos Dados Bancários da NF
  const [editingDadosNF, setEditingDadosNF] = useState(null);  // po_id da OC sendo editada
  const [dadosNFTemp, setDadosNFTemp] = useState({
    banco: '341 - Itaú Unibanco',
    conta: '98814-9',
    agencia: '3978',
    pix: '46.663.556/0001-69'
  });
  const [dadosBancariosPorOC, setDadosBancariosPorOC] = useState({});  // {po_id: {banco, conta, agencia, pix}}
  
  // Paginação para Em Separação
  const [emSeparacaoPage, setEmSeparacaoPage] = useState(1);
  const ITEMS_PER_PAGE_EM_SEPARACAO = 5;
  
  // Estados para frete de envio em lote
  const [itensParaFrete, setItensParaFrete] = useState({});  // {po_id: Set(item_index)} - Itens selecionados para frete
  const [freteEnvioTotal, setFreteEnvioTotal] = useState({});  // {po_id: valor} - Valor total do frete por OC
  const [aplicandoFrete, setAplicandoFrete] = useState(null);  // po_id do frete sendo aplicado
  const [statusNoFrete, setStatusNoFrete] = useState({});  // {po_id: status} - Status a aplicar junto com frete (Em Separação)
  const [statusNoRastreio, setStatusNoRastreio] = useState({});  // {po_id: status} - Status a aplicar junto com rastreio (Em Trânsito)
  
  // Estados para código de rastreio em lote
  const [codigoRastreioLote, setCodigoRastreioLote] = useState({});  // {po_id: codigo} - Código de rastreio por OC
  const [aplicandoRastreio, setAplicandoRastreio] = useState(null);  // po_id do rastreio sendo aplicado
  const [itensParaRastreio, setItensParaRastreio] = useState({});  // {po_id: Set(item_index)} - Itens selecionados para rastreio (Em Trânsito)
  
  // Estados para mudança de status em massa
  const [novoStatusMassa, setNovoStatusMassa] = useState({});  // {po_id: status} - Status selecionado para mudança em massa
  const [aplicandoStatusMassa, setAplicandoStatusMassa] = useState(null);  // po_id do status sendo aplicado
  const [itensParaStatus, setItensParaStatus] = useState({});  // {po_id: Set(item_index)} - Itens selecionados para mudança de status
  
  // Estados para carrinho e mover em lote
  const [selectedItems, setSelectedItems] = useState(new Set());  // Itens selecionados para mover
  const [movingToComprado, setMovingToComprado] = useState(false);  // Loading do botão
  const [editingObservacao, setEditingObservacao] = useState(null);  // Item com observação sendo editada
  const [observacaoTemp, setObservacaoTemp] = useState('');  // Valor temporário da observação
  
  // Estados para autocomplete de fornecedor
  const [fornecedoresSistema, setFornecedoresSistema] = useState([]);  // Lista de fornecedores do sistema
  const [fornecedorSugestoes, setFornecedorSugestoes] = useState([]);  // Sugestões filtradas
  const [activeFornecedorIdx, setActiveFornecedorIdx] = useState(null);  // Índice do campo de fornecedor ativo

  // Estados para histórico de cotações (itens pendentes)
  const [historicoCotacoes, setHistoricoCotacoes] = useState({});  // {uniqueId: {historico: [], loading: boolean}}
  const [expandedHistorico, setExpandedHistorico] = useState({});  // {uniqueId: boolean} - histórico expandido

  // Estado para mapa de estoque disponível (itens pendentes/cotados)
  const [estoqueDisponivel, setEstoqueDisponivel] = useState({});  // {codigo_item: quantidade}

  // Estados para modal "Usar do Estoque"
  const [showUsarEstoqueModal, setShowUsarEstoqueModal] = useState(null);  // item para usar estoque
  const [estoqueDetalhes, setEstoqueDetalhes] = useState(null);  // detalhes do estoque para o modal
  const [quantidadeUsar, setQuantidadeUsar] = useState(0);  // quantidade a usar
  const [usandoEstoque, setUsandoEstoque] = useState(false);  // loading

  // Estados para upload de imagem
  const [uploadingImage, setUploadingImage] = useState(null);  // _uniqueId do item com upload em andamento
  const [imagemExpandida, setImagemExpandida] = useState(null);  // URL da imagem para popup expandido
  const [dragOver, setDragOver] = useState(null);  // _uniqueId do item com drag over

  // Estados para CEP
  const [cepTemp, setCepTemp] = useState('');  // CEP temporário durante edição
  const [buscandoCep, setBuscandoCep] = useState(false);  // Loading ao buscar CEP

  // Estados para modal de Envio Parcial
  const [showEnvioParcialModal, setShowEnvioParcialModal] = useState(null);  // item para envio parcial
  const [envioParcialData, setEnvioParcialData] = useState({
    quantidade_enviar: '',
    codigo_rastreio: '',
    frete_envio: ''
  });
  const [aplicandoEnvioParcial, setAplicandoEnvioParcial] = useState(false);

  // Paginação
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(5);
  
  // Visualização agrupada por código (para pendentes)
  const [viewMode, setViewMode] = useState('normal');  // 'normal' ou 'grouped'
  const [expandedGroups, setExpandedGroups] = useState(new Set());  // Grupos expandidos
  
  // Edição em grupo
  const [editingGroupCode, setEditingGroupCode] = useState(null);  // código do item sendo editado em grupo
  const [groupEditMode, setGroupEditMode] = useState('individual');  // 'individual' ou 'all'
  const [editingGroupItem, setEditingGroupItem] = useState(null);  // item individual sendo editado no grupo
  const [groupFormData, setGroupFormData] = useState({
    preco_unitario: '',
    frete: '',
    fornecedor: '',
    link: ''
  });
  
  // Total real da planilha (todos os itens, todos os status)
  const [totalPlanilhaReal, setTotalPlanilhaReal] = useState({});
  
  // Limites do contrato FIEP (quantidade máxima por código)
  const [limitesContrato, setLimitesContrato] = useState({});
  
  // Mapa de imagens por código de item
  const [imagensItens, setImagensItens] = useState({});
  
  // Timestamp de cache para forçar reload de imagens - atualizado apenas após upload/delete
  const [imageCacheTimestamp, setImageCacheTimestamp] = useState(Date.now());
  
  // Itens que irão na próxima remessa por OC (não estão em separação/pronto/transito/entregue)
  const [itensProximaRemessaPorOC, setItensProximaRemessaPorOC] = useState({});

  const statusLabels = {
    'pendente': 'Pendentes',
    'cotado': 'Cotados',
    'comprado': 'Comprados',
    'em_separacao': 'Em Separação',
    'pronto_envio': 'Pronto p/ Envio',
    'em_transito': 'Em Trânsito',
    'entregue': 'Entregues'
  };

  useEffect(() => {
    loadItems();
    loadFornecedoresSistema();
    loadImagensItens();
    setSelectedItems(new Set());  // Limpar seleção ao trocar de status
    setCurrentPage(1);  // Reset página ao trocar de status
  }, [status]); // eslint-disable-line react-hooks/exhaustive-deps
  
  // Carregar mapa de imagens por código
  const loadImagensItens = async () => {
    try {
      const response = await apiGet(`${API}/imagens-itens/mapa`);
      setImagensItens(response.data || {});
    } catch (err) {
      console.warn('Erro ao carregar mapa de imagens:', err);
    }
  };

  const loadItems = async () => {
    setLoading(true);
    setError(null);
    try {
      // Para status específicos (em_separacao, pronto_envio, em_transito, entregue), 
      // usar endpoint otimizado que filtra no banco de dados
      const statusOtimizados = ['em_separacao', 'pronto_envio', 'em_transito', 'entregue'];
      let purchaseOrders = [];
      
      if (statusOtimizados.includes(status)) {
        // ENDPOINT OTIMIZADO - busca apenas itens do status específico
        const response = await apiGet(`${API}/items/by-status/${status}`);
        purchaseOrders = response.data?.data || [];
        
        // Nota: itens pendentes por OC não são carregados no endpoint otimizado
        // A funcionalidade "Próxima Remessa" não estará disponível para status otimizados
        // mas o carregamento será muito mais rápido
      } else {
        // Para pendentes e cotados, manter lógica antiga (precisa de todos os itens para agrupamento)
        const response = await apiGet(`${API}/purchase-orders?limit=0`);
        purchaseOrders = response.data.data || response.data || [];
      }
      
      // Para itens pendentes ou cotados, carregar também o mapa de estoque disponível
      if (status === 'pendente' || status === 'cotado') {
        try {
          const estoqueResponse = await apiGet(`${API}/estoque/mapa`);
          setEstoqueDisponivel(estoqueResponse.data || {});
        } catch (err) {
          console.warn('Erro ao carregar mapa de estoque:', err);
          setEstoqueDisponivel({});
        }
        
        // Carregar total real da planilha (todos os status) - fallback
        try {
          const planilhaResponse = await apiGet(`${API}/planilha-itens`);
          const planilhaData = planilhaResponse.data?.itens || planilhaResponse.data || [];
          const totaisPlanilha = {};
          planilhaData.forEach(item => {
            totaisPlanilha[item.codigo_item] = item.quantidade_total_necessaria || 0;
          });
          setTotalPlanilhaReal(totaisPlanilha);
        } catch (err) {
          console.warn('Erro ao carregar planilha:', err);
          setTotalPlanilhaReal({});
        }
        
        // Carregar limites do contrato FIEP (fonte de verdade para "Total Planilha")
        try {
          const limitesResponse = await apiGet(`${API}/limites-contrato/mapa`);
          if (limitesResponse.data && Object.keys(limitesResponse.data).length > 0) {
            setLimitesContrato(limitesResponse.data);
          }
        } catch (err) {
          console.warn('Limites do contrato não importados ainda:', err);
          setLimitesContrato({});
        }
      }
      
      const allItems = [];
      const nfVendaByOC = {}; // Armazenar NF de Venda por OC (última)
      const nfsVendaByOC = {}; // Armazenar todas NFs de Venda por OC
      const prontoDespachoByOC = {}; // Armazenar status "pronto para despacho" por OC
      
      // Verificar se estamos usando endpoint otimizado (itens já vêm filtrados)
      const statusOtimizados = ['em_separacao', 'pronto_envio', 'em_transito', 'entregue'];
      const usandoEndpointOtimizado = statusOtimizados.includes(status);
      
      purchaseOrders.forEach(po => {
        // Armazenar NF de Venda da OC (se existir)
        if (po.nota_fiscal_venda) {
          nfVendaByOC[po.id] = po.nota_fiscal_venda;
        }
        // Armazenar todas NFs de Venda (para NF parcial)
        if (po.notas_fiscais_venda && po.notas_fiscais_venda.length > 0) {
          nfsVendaByOC[po.id] = po.notas_fiscais_venda;
        }
        // Armazenar status "pronto para despacho"
        prontoDespachoByOC[po.id] = po.pronto_despacho || false;
        
        po.items.forEach((item, itemIndexInPO) => {
          // Se usando endpoint otimizado, todos os itens já são do status certo
          // Senão, filtrar pelo status
          if (usandoEndpointOtimizado || item.status === status) {
            // Usar o índice original do banco se disponível, senão usar o índice do array
            const realIndex = item._originalIndex !== undefined ? item._originalIndex : 
                             (item._itemIndexInPO !== undefined ? item._itemIndexInPO : itemIndexInPO);
            const uniqueId = `${po.id}_${realIndex}`;
            allItems.push({
              ...item,
              numero_oc: po.numero_oc,
              po_id: po.id,
              cnpj_requisitante: po.cnpj_requisitante || '',
              data_entrega: po.data_entrega || null, // Data de entrega da OC
              endereco_entrega_oc: po.endereco_entrega || null, // Endereço de entrega da OC
              _itemIndexInPO: realIndex,  // USAR ÍNDICE ORIGINAL DO BANCO
              _uniqueId: uniqueId,
              _ocNFVenda: po.nota_fiscal_venda || null, // NF de Venda da OC
              _ocNFsVenda: po.notas_fiscais_venda || [], // Todas NFs de Venda da OC
              _ocProntoDespacho: po.pronto_despacho || false // Status pronto para despacho da OC
            });
          }
        });
      });
      
      // Calcular itens que irão na próxima remessa por OC (apenas para endpoints não otimizados)
      if (!usandoEndpointOtimizado) {
        const statusAvancados = ['em_separacao', 'pronto_envio', 'em_transito', 'entregue'];
        const itensPendentesMap = {};
        purchaseOrders.forEach(po => {
          const itensPendentes = po.items
            .filter(item => !statusAvancados.includes(item.status))
            .map(item => item.codigo_item);
          if (itensPendentes.length > 0) {
            itensPendentesMap[po.id] = [...new Set(itensPendentes)]; // Remove duplicatas
          }
        });
        setItensProximaRemessaPorOC(itensPendentesMap);
      }
      
      setItems(allItems);
      setOcNFVenda(nfVendaByOC); // Atualizar estado de NF de Venda por OC
      setOcNFsVenda(nfsVendaByOC); // Atualizar estado de todas NFs de Venda por OC
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

  // ====== AGRUPAMENTO POR CÓDIGO (para pendentes e cotados) ======
  const itemsGroupedByCode = useMemo(() => {
    if ((status !== 'pendente' && status !== 'cotado') || viewMode !== 'grouped') return [];
    
    const grouped = {};
    
    displayItems.forEach(item => {
      const codigo = item.codigo_item;
      if (!grouped[codigo]) {
        grouped[codigo] = {
          codigo_item: codigo,
          descricao: item.descricao,
          marca_modelo: item.marca_modelo,
          unidade: item.unidade || 'UN',
          items: [],
          total_quantidade: 0,
          estoqueDisponivel: estoqueDisponivel[codigo] || 0,
          // Priorizar imagem do mapa (fonte de verdade) depois do item
          imagem_url: imagensItens[codigo] || item.imagem_url
        };
      }
      grouped[codigo].items.push(item);
      grouped[codigo].total_quantidade += item.quantidade || 0;
      // Atualizar imagem se não tinha (usar mapa ou item)
      if (!grouped[codigo].imagem_url) {
        grouped[codigo].imagem_url = imagensItens[codigo] || item.imagem_url;
      }
    });
    
    // Converter para array e ordenar por quantidade total (maior primeiro)
    return Object.values(grouped).sort((a, b) => {
      // Primeiro, itens que aparecem em múltiplas OCs
      if (a.items.length !== b.items.length) {
        return b.items.length - a.items.length;
      }
      // Depois por quantidade total
      return b.total_quantidade - a.total_quantidade;
    });
  }, [displayItems, status, viewMode, estoqueDisponivel, imagensItens]);

  // Total da planilha para cada código (para mostrar ao cotar)
  const totalPlanilhaPorCodigo = useMemo(() => {
    const totais = {};
    items.forEach(item => {
      const codigo = item.codigo_item;
      if (!totais[codigo]) {
        totais[codigo] = 0;
      }
      totais[codigo] += item.quantidade || 0;
    });
    return totais;
  }, [items]);

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
    if (status !== 'em_separacao' && status !== 'em_transito' && status !== 'pronto_envio') return [];
    
    const grouped = {};
    displayItems.forEach(item => {
      const ocId = item.po_id;
      if (!grouped[ocId]) {
        grouped[ocId] = {
          po_id: ocId,
          numero_oc: item.numero_oc,
          cnpj_requisitante: item.cnpj_requisitante,
          data_entrega: item.data_entrega || null, // Data de entrega da OC
          endereco_entrega: item.endereco_entrega_oc || item.endereco_entrega || null, // Endereço de entrega da OC
          nota_fiscal_venda: ocNFVenda[ocId] || item._ocNFVenda || null, // NF de Venda da OC
          notas_fiscais_venda: ocNFsVenda[ocId] || item._ocNFsVenda || [], // Todas NFs de Venda
          pronto_despacho: ocProntoDespacho[ocId] || item._ocProntoDespacho || false, // Status pronto para despacho
          items: []
        };
      }
      grouped[ocId].items.push(item);
    });
    
    // Converter para array e calcular estatísticas
    return Object.values(grouped).map(oc => {
      const totalItens = oc.items.length;
      
      // Calcular quantos itens já estão em alguma NF de Venda (ON)
      const nfsVenda = oc.notas_fiscais_venda || [];
      const itensComNFVenda = new Set();
      nfsVenda.forEach(nf => {
        if (nf.itens_indices) {
          nf.itens_indices.forEach(idx => itensComNFVenda.add(idx));
        }
      });
      
      // Calcular quantos itens têm NF de Fornecedor
      let itensComNFFornecedor = 0;
      oc.items.forEach(item => {
        const nfsFornecedor = item.notas_fiscais_fornecedor || [];
        if (nfsFornecedor && nfsFornecedor.length > 0) {
          itensComNFFornecedor++;
        }
      });
      
      // Contar itens com NF de Venda dentro dos itens atuais
      let itensComNFVendaCount = 0;
      oc.items.forEach(item => {
        if (itensComNFVenda.has(item._itemIndexInPO)) {
          itensComNFVendaCount++;
        }
      });
      
      const itensRestantesVenda = totalItens - itensComNFVendaCount;
      const itensRestantesFornecedor = totalItens - itensComNFFornecedor;
      
      // Determinar status para ordenação
      // Prioridade: 1) Tem NF Venda + NF Fornecedor, 2) Só NF Fornecedor, 3) Sem NF
      const temNFVenda = nfsVenda.length > 0;
      const temNFFornecedor = itensComNFFornecedor > 0;
      const todosFornecedor = itensComNFFornecedor === totalItens;
      const todosVenda = itensComNFVendaCount === totalItens;
      
      let prioridadeOrdenacao = 3; // Sem NF
      if (temNFVenda && temNFFornecedor) {
        prioridadeOrdenacao = 1; // Pronto para envio (tem ambas)
      } else if (temNFFornecedor) {
        prioridadeOrdenacao = 2; // Só NF Fornecedor
      }
      
      return {
        ...oc,
        totalItens,
        // NF de Venda (ON)
        itensProntos: itensComNFVendaCount,
        itensRestantes: itensRestantesVenda,
        itensComNFIndices: itensComNFVenda,
        // NF de Fornecedor
        itensComNFFornecedor,
        itensRestantesFornecedor,
        todosFornecedor,
        temNFFornecedor,
        // NF de Venda
        temNFVenda,
        todosVenda,
        // Status geral
        prontoParaDespacho: oc.pronto_despacho,
        prontoParaEnvio: temNFVenda && todosFornecedor,
        prioridadeOrdenacao
      };
    }).sort((a, b) => {
      // NOVA ORDENAÇÃO: Prontos para despacho (verdes) SEMPRE no topo
      if (a.prontoParaDespacho && !b.prontoParaDespacho) return -1;
      if (!a.prontoParaDespacho && b.prontoParaDespacho) return 1;
      
      // Depois: 1) Prontos para envio, 2) Com NF Fornecedor, 3) Sem NF
      if (a.prioridadeOrdenacao !== b.prioridadeOrdenacao) {
        return a.prioridadeOrdenacao - b.prioridadeOrdenacao;
      }
      // Dentro da mesma prioridade, ordenar por itens com NF
      if (a.itensComNFFornecedor !== b.itensComNFFornecedor) {
        return b.itensComNFFornecedor - a.itensComNFFornecedor;
      }
      return b.totalItens - a.totalItens;
    });
  }, [status, displayItems, ocNFVenda, ocNFsVenda, ocProntoDespacho]);

  // Paginação para Em Separação
  const paginatedOCs = useMemo(() => {
    const startIdx = (emSeparacaoPage - 1) * ITEMS_PER_PAGE_EM_SEPARACAO;
    return itemsGroupedByOC.slice(startIdx, startIdx + ITEMS_PER_PAGE_EM_SEPARACAO);
  }, [itemsGroupedByOC, emSeparacaoPage]);
  
  const totalPagesEmSeparacao = Math.ceil(itemsGroupedByOC.length / ITEMS_PER_PAGE_EM_SEPARACAO);

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
      quantidade_comprada: item.quantidade_comprada || '',  // Quantidade efetivamente comprada
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
        quantidade_comprada: formData.quantidade_comprada ? parseInt(formData.quantidade_comprada) : null,  // Quantidade efetivamente comprada
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

  // ================== FUNÇÕES DE UPLOAD DE IMAGEM ==================
  
  const handleImageUpload = async (item, file, groupItems = null) => {
    if (!file) return;
    
    // Validar tipo
    const allowedTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
    if (!allowedTypes.includes(file.type)) {
      alert('Tipo de arquivo não permitido. Use: JPEG, PNG, WebP ou GIF');
      return;
    }
    
    // Validar tamanho (5MB)
    if (file.size > 5 * 1024 * 1024) {
      alert('Arquivo muito grande. Máximo: 5MB');
      return;
    }
    
    setUploadingImage(item._uniqueId);
    
    try {
      const formData = new FormData();
      formData.append('file', file);
      
      const token = localStorage.getItem('token');
      const response = await fetch(
        `${API}/purchase-orders/${item.po_id}/items/by-index/${item._itemIndexInPO}/imagem`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${token}`
          },
          body: formData
        }
      );
      
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.detail || 'Erro ao enviar imagem');
      }
      
      const result = await response.json();
      
      // O backend agora atualiza automaticamente TODOS os itens com o mesmo código
      // Não é mais necessário propagar manualmente
      
      // Atualizar timestamp de cache ANTES de recarregar para forçar refresh das imagens
      setImageCacheTimestamp(Date.now());
      
      // Recarregar mapa de imagens e itens
      await loadImagensItens();
      await loadItems();
      
      alert(`✅ Imagem salva com sucesso!\n\nA imagem foi vinculada ao código ${item.codigo_item} e aparecerá automaticamente em todas as OCs.`);
    } catch (error) {
      console.error('Erro ao enviar imagem:', error);
      alert('Erro ao enviar imagem: ' + error.message);
    } finally {
      setUploadingImage(null);
    }
  };
  
  const handleDeleteImage = async (item) => {
    if (!window.confirm(`Remover imagem do item ${item.codigo_item}?\n\nA imagem será removida de TODAS as OCs com este código.`)) return;
    
    setUploadingImage(item._uniqueId);
    
    try {
      const token = localStorage.getItem('token');
      const response = await fetch(
        `${API}/purchase-orders/${item.po_id}/items/by-index/${item._itemIndexInPO}/imagem`,
        {
          method: 'DELETE',
          headers: {
            'Authorization': `Bearer ${token}`
          }
        }
      );
      
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.detail || 'Erro ao remover imagem');
      }
      
      // Atualizar timestamp de cache ANTES de recarregar para forçar refresh
      setImageCacheTimestamp(Date.now());
      
      // Recarregar mapa de imagens e itens
      await loadImagensItens();
      await loadItems();
    } catch (error) {
      console.error('Erro ao remover imagem:', error);
      alert('Erro ao remover imagem: ' + error.message);
    } finally {
      setUploadingImage(null);
    }
  };
  
  // ================== FUNÇÕES DE EDIÇÃO EM GRUPO ==================
  
  const startGroupEdit = (codigoItem, mode = 'individual', item = null) => {
    setEditingGroupCode(codigoItem);
    setGroupEditMode(mode);
    setEditingGroupItem(item ? item._uniqueId : null);
    
    if (mode === 'individual' && item) {
      // Preencher com dados do item individual
      setGroupFormData({
        preco_unitario: item.fontes_compra?.[0]?.preco_unitario || '',
        frete: item.fontes_compra?.[0]?.frete || '',
        fornecedor: item.fontes_compra?.[0]?.fornecedor || '',
        link: item.fontes_compra?.[0]?.link || '',
        quantidade_comprar: item.quantidade || 1  // Para compra parcial
      });
    } else {
      // Limpar para edição em grupo
      setGroupFormData({
        preco_unitario: '',
        frete: '',
        fornecedor: '',
        link: '',
        quantidade_comprar: ''
      });
    }
  };
  
  const cancelGroupEdit = () => {
    setEditingGroupCode(null);
    setGroupEditMode('individual');
    setEditingGroupItem(null);
    setGroupFormData({ preco_unitario: '', frete: '', fornecedor: '', link: '', quantidade_comprar: '' });
  };
  
  // Função para compra parcial
  const compraParcial = async (item) => {
    const quantidadeComprar = parseInt(groupFormData.quantidade_comprar) || 0;
    const quantidadeTotal = item.quantidade || 1;
    
    if (quantidadeComprar <= 0) {
      alert('Informe a quantidade a comprar');
      return;
    }
    
    if (quantidadeComprar >= quantidadeTotal) {
      // Se vai comprar tudo, usar fluxo normal
      await saveGroupEdit([item]);
      return;
    }
    
    try {
      await apiPost(
        `${API}/purchase-orders/${item.po_id}/items/by-index/${item._itemIndexInPO}/compra-parcial`,
        {
          quantidade_comprar: quantidadeComprar,
          preco_unitario: parseFloat(groupFormData.preco_unitario) || 0,
          frete: parseFloat(groupFormData.frete) || 0,
          fornecedor: groupFormData.fornecedor || '',
          link: groupFormData.link || ''
        }
      );
      
      cancelGroupEdit();
      loadItems();
      alert(`✅ Compra parcial realizada!\n\n${quantidadeComprar} de ${quantidadeTotal} unidades foram compradas.\n\nAs ${quantidadeTotal - quantidadeComprar} unidades restantes continuam em "Cotados".`);
    } catch (error) {
      console.error('Erro na compra parcial:', error);
      alert('Erro na compra parcial: ' + (error.response?.data?.detail || error.message));
    }
  };

  // Envio parcial de um item em separação
  const envioParcial = async () => {
    const item = showEnvioParcialModal;
    if (!item) return;
    
    const quantidadeEnviar = parseInt(envioParcialData.quantidade_enviar) || 0;
    const quantidadeTotal = item.quantidade || 1;
    
    if (quantidadeEnviar <= 0) {
      alert('Informe a quantidade a enviar');
      return;
    }
    
    if (quantidadeEnviar >= quantidadeTotal) {
      alert(`Para enviar todas as ${quantidadeTotal} unidades, use o formulário de frete/rastreio normal.\nEste recurso é apenas para envio parcial.`);
      return;
    }
    
    setAplicandoEnvioParcial(true);
    
    try {
      await apiPost(
        `${API}/purchase-orders/${item.po_id}/items/by-index/${item._itemIndexInPO}/envio-parcial`,
        {
          quantidade_enviar: quantidadeEnviar,
          codigo_rastreio: envioParcialData.codigo_rastreio?.trim() || null,
          frete_envio: envioParcialData.frete_envio ? parseFloat(envioParcialData.frete_envio) : null
        }
      );
      
      setShowEnvioParcialModal(null);
      setEnvioParcialData({ quantidade_enviar: '', codigo_rastreio: '', frete_envio: '' });
      loadItems();
      
      alert(`✅ Envio parcial realizado!\n\n📦 ${quantidadeEnviar} de ${quantidadeTotal} unidades foram enviadas.\n\n📋 As ${quantidadeTotal - quantidadeEnviar} unidades restantes continuam em "Em Separação".`);
    } catch (error) {
      console.error('Erro no envio parcial:', error);
      alert('Erro no envio parcial: ' + (error.response?.data?.detail || error.message));
    } finally {
      setAplicandoEnvioParcial(false);
    }
  };
  
  const saveGroupEdit = async (items) => {
    try {
      // Se é edição individual, só salvar um item
      const itemsToSave = groupEditMode === 'individual' 
        ? items.filter(i => i._uniqueId === editingGroupItem)
        : items;
      
      // Determinar o novo status baseado no status atual da página
      const novoStatus = status === 'cotado' ? 'comprado' : 'cotado';
      
      for (const item of itemsToSave) {
        const fontesCompra = [{
          quantidade: item.quantidade || 1,
          preco_unitario: parseFloat(groupFormData.preco_unitario) || 0,
          frete: parseFloat(groupFormData.frete) || 0,
          link: groupFormData.link || '',
          fornecedor: groupFormData.fornecedor || ''
        }];
        
        await apiPatch(
          `${API}/purchase-orders/${item.po_id}/items/by-index/${item._itemIndexInPO}`,
          {
            status: novoStatus,
            fontes_compra: fontesCompra
          }
        );
      }
      
      cancelGroupEdit();
      loadItems();
      
      const acaoTexto = status === 'cotado' ? 'comprado(s)' : 'cotado(s)';
      const msg = groupEditMode === 'all' 
        ? `${itemsToSave.length} item(ns) ${acaoTexto} com sucesso!`
        : `Item ${acaoTexto} com sucesso!`;
      alert(msg);
    } catch (error) {
      console.error('Erro ao salvar:', error);
      alert('Erro ao salvar: ' + (error.response?.data?.detail || error.message));
    }
  };
  
  // ================== FIM FUNÇÕES DE EDIÇÃO EM GRUPO ==================
  
  const handleDragOver = (e, itemId) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOver(itemId);
  };
  
  const handleDragLeave = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOver(null);
  };
  
  const handleDrop = async (e, item) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOver(null);
    
    const files = e.dataTransfer.files;
    if (files && files.length > 0) {
      await handleImageUpload(item, files[0]);
    }
  };

  // ================== FIM FUNÇÕES DE UPLOAD DE IMAGEM ==================

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

  // Função para mudar status de um item manualmente (usado em Em Trânsito)
  const mudarStatusItemManual = async (item, novoStatus) => {
    const statusLabels = {
      'pendente': 'Pendente',
      'cotado': 'Cotado',
      'comprado': 'Comprado',
      'em_separacao': 'Em Separação',
      'em_transito': 'Em Trânsito',
      'entregue': 'Entregue'
    };
    
    if (!window.confirm(`Alterar status do item ${item.codigo_item} para "${statusLabels[novoStatus]}"?`)) {
      return;
    }
    
    try {
      await apiPatch(`${API}/purchase-orders/${item.po_id}/items/by-index/${item._itemIndexInPO}`, {
        status: novoStatus
      });
      alert(`✅ Status alterado para "${statusLabels[novoStatus]}"!`);
      loadItems();
    } catch (error) {
      console.error('Erro ao mudar status:', error);
      alert('Erro ao mudar status: ' + (error.response?.data?.detail || error.message));
    }
  };

  // Função para editar código de rastreio e frete de um item
  const editarRastreioFrete = async (item, editData) => {
    try {
      const payload = {};
      
      // Só incluir campos que foram alterados
      if (editData.codigo_rastreio !== item.codigo_rastreio) {
        payload.codigo_rastreio = editData.codigo_rastreio?.trim() || null;
      }
      if (editData.frete_envio !== item.frete_envio) {
        payload.frete_envio = editData.frete_envio ? parseFloat(editData.frete_envio) : null;
      }
      
      if (Object.keys(payload).length === 0) {
        return; // Nada para atualizar
      }
      
      await apiPatch(`${API}/purchase-orders/${item.po_id}/items/by-index/${item._itemIndexInPO}`, payload);
      
      const mensagens = [];
      if (payload.codigo_rastreio !== undefined) mensagens.push(`Rastreio: ${payload.codigo_rastreio || 'removido'}`);
      if (payload.frete_envio !== undefined) mensagens.push(`Frete: R$ ${(payload.frete_envio || 0).toFixed(2)}`);
      
      alert(`✅ Atualizado!\n${mensagens.join('\n')}`);
      loadItems();
    } catch (error) {
      console.error('Erro ao editar rastreio/frete:', error);
      alert('Erro ao editar: ' + (error.response?.data?.detail || error.message));
    }
  };

  // ============== FUNÇÕES DE NOTAS FISCAIS ==============
  
  const toggleNFSection = (itemKey) => {
    setExpandedNF(prev => ({
      ...prev,
      [itemKey]: !prev[itemKey]
    }));
  };

  // ============== FUNÇÃO PARA BUSCAR HISTÓRICO DE COTAÇÕES ==============
  const buscarHistoricoCotacoes = async (item) => {
    const uniqueId = item._uniqueId;
    
    // Se já está carregando ou já tem dados, não buscar novamente
    if (historicoCotacoes[uniqueId]?.loading) return;
    if (historicoCotacoes[uniqueId]?.historico?.length > 0) {
      // Apenas expandir/colapsar
      setExpandedHistorico(prev => ({ ...prev, [uniqueId]: !prev[uniqueId] }));
      return;
    }
    
    // Marcar como carregando
    setHistoricoCotacoes(prev => ({
      ...prev,
      [uniqueId]: { historico: [], loading: true }
    }));
    setExpandedHistorico(prev => ({ ...prev, [uniqueId]: true }));
    
    try {
      const params = new URLSearchParams();
      if (item.codigo_item) params.append('codigo_item', item.codigo_item);
      if (item.descricao) params.append('descricao', item.descricao);
      
      const response = await apiGet(`${API}/items/historico-cotacoes?${params.toString()}`);
      
      setHistoricoCotacoes(prev => ({
        ...prev,
        [uniqueId]: { 
          historico: response.data.historico || [], 
          loading: false,
          encontrado: response.data.encontrado
        }
      }));
    } catch (error) {
      console.error('Erro ao buscar histórico:', error);
      setHistoricoCotacoes(prev => ({
        ...prev,
        [uniqueId]: { historico: [], loading: false, erro: true }
      }));
    }
  };

  const toggleHistorico = (uniqueId) => {
    setExpandedHistorico(prev => ({ ...prev, [uniqueId]: !prev[uniqueId] }));
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
      // Usar Promise para aguardar a leitura do arquivo
      const base64 = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (e) => resolve(e.target.result.split(',')[1]);
        reader.onerror = (e) => reject(new Error('Erro ao ler arquivo'));
        reader.readAsDataURL(file);
      });
      
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
      
      alert(`Nota fiscal adicionada! NCM: ${response.data.ncm || 'Não detectado'}`);
      setNcmManual(prev => ({ ...prev, [`${item._uniqueId}-${tipo}`]: '' }));
      // Recarregar apenas este item para manter seção expandida
      await reloadSingleItem(item.po_id, item._itemIndexInPO, item._uniqueId);
    } catch (error) {
      console.error('Erro ao fazer upload:', error);
      alert(`Erro ao fazer upload da nota fiscal: ${error.response?.data?.detail || error.message}`);
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

  const deleteNFVendaOC = async (poId, nfId = null) => {
    if (!window.confirm('Tem certeza que deseja remover esta NF de Venda?')) return;
    
    try {
      const url = nfId 
        ? `${API}/purchase-orders/${poId}/nf-venda?nf_id=${nfId}`
        : `${API}/purchase-orders/${poId}/nf-venda`;
      await apiDelete(url);
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

  // ============== FUNÇÕES PARA FRETE DE ENVIO EM LOTE ==============
  
  // Toggle seleção de item para frete
  const toggleItemParaFrete = (poId, itemIndex) => {
    setItensParaFrete(prev => {
      const currentSet = prev[poId] || new Set();
      const newSet = new Set(currentSet);
      if (newSet.has(itemIndex)) {
        newSet.delete(itemIndex);
      } else {
        newSet.add(itemIndex);
      }
      return { ...prev, [poId]: newSet };
    });
  };

  // Selecionar/desselecionar todos os itens para frete
  const toggleAllItensParaFrete = (poId, items) => {
    const currentSet = itensParaFrete[poId] || new Set();
    if (currentSet.size === items.length) {
      // Se todos já estão selecionados, desseleciona todos
      setItensParaFrete(prev => ({ ...prev, [poId]: new Set() }));
    } else {
      // Seleciona todos
      const newSet = new Set(items.map(item => item._itemIndexInPO));
      setItensParaFrete(prev => ({ ...prev, [poId]: newSet }));
    }
  };

  // Aplicar frete de envio dividido entre os itens selecionados
  const aplicarFreteEnvio = async (poId) => {
    const selectedIndices = itensParaFrete[poId];
    const freteTotal = parseFloat(freteEnvioTotal[poId] || 0);
    
    if (!selectedIndices || selectedIndices.size === 0) {
      alert('Selecione ao menos um item para aplicar o frete.');
      return;
    }
    
    if (freteTotal <= 0) {
      alert('Informe um valor de frete maior que zero.');
      return;
    }
    
    const fretePorItem = (freteTotal / selectedIndices.size).toFixed(2);
    
    if (!window.confirm(
      `Aplicar frete de ${formatBRL(freteTotal)} dividido entre ${selectedIndices.size} item(s)?\n\n` +
      `Cada item receberá: ${formatBRL(parseFloat(fretePorItem))}`
    )) {
      return;
    }
    
    setAplicandoFrete(poId);
    
    try {
      const response = await apiPost(`${API}/purchase-orders/${poId}/frete-envio-multiplo`, {
        item_indices: Array.from(selectedIndices),
        frete_total: freteTotal
      });
      
      alert(
        `✅ Frete aplicado com sucesso!\n\n` +
        `• Total: ${formatBRL(freteTotal)}\n` +
        `• Por item: ${formatBRL(response.data.frete_por_item)}\n` +
        `• Itens atualizados: ${response.data.quantidade_itens}`
      );
      
      // Limpar seleção e valor
      setItensParaFrete(prev => ({ ...prev, [poId]: new Set() }));
      setFreteEnvioTotal(prev => ({ ...prev, [poId]: '' }));
      
      // Recarregar dados
      loadItems();
    } catch (error) {
      console.error('Erro ao aplicar frete:', error);
      alert('Erro ao aplicar frete: ' + (error.response?.data?.detail || error.message));
    } finally {
      setAplicandoFrete(null);
    }
  };

  // Aplicar frete, código de rastreio e status em lote (botão único)
  const aplicarFreteERastreio = async (poId) => {
    const selectedIndices = itensParaFrete[poId];
    const freteTotal = parseFloat(freteEnvioTotal[poId] || 0);
    const codigoRastreio = codigoRastreioLote[poId]?.trim() || '';
    const novoStatus = statusNoFrete[poId] || '';
    
    if (!selectedIndices || selectedIndices.size === 0) {
      alert('Selecione ao menos um item.');
      return;
    }
    
    if (freteTotal <= 0 && !codigoRastreio && !novoStatus) {
      alert('Informe o valor do frete, código de rastreio e/ou novo status.');
      return;
    }
    
    const fretePorItem = freteTotal > 0 ? (freteTotal / selectedIndices.size) : 0;
    
    const statusLabels = {
      'em_transito': '🚚 Em Trânsito',
      'entregue': '✅ Entregue',
      'comprado': '🛒 Comprado'
    };
    
    let mensagem = `Aplicar para ${selectedIndices.size} item(s):\n`;
    if (freteTotal > 0) {
      mensagem += `• Frete: ${formatBRL(freteTotal)} (${formatBRL(fretePorItem)}/item)\n`;
    }
    if (codigoRastreio) {
      mensagem += `• Rastreio: ${codigoRastreio}\n`;
    }
    if (novoStatus) {
      mensagem += `• Status: ${statusLabels[novoStatus] || novoStatus}\n`;
    }
    mensagem += '\nConfirmar?';
    
    if (!window.confirm(mensagem)) {
      return;
    }
    
    setAplicandoFrete(poId);
    
    try {
      // Aplicar frete se informado
      if (freteTotal > 0) {
        await apiPost(`${API}/purchase-orders/${poId}/frete-envio-multiplo`, {
          item_indices: Array.from(selectedIndices),
          frete_total: freteTotal
        });
      }
      
      // Aplicar rastreio se informado
      if (codigoRastreio) {
        await apiPost(`${API}/purchase-orders/${poId}/rastreio-multiplo`, {
          item_indices: Array.from(selectedIndices),
          codigo_rastreio: codigoRastreio
        });
      }
      
      // Aplicar mudança de status se informado
      if (novoStatus) {
        await apiPost(`${API}/purchase-orders/${poId}/status-multiplo`, {
          item_indices: Array.from(selectedIndices),
          novo_status: novoStatus
        });
      }
      
      let alertMsg = `✅ Aplicado com sucesso para ${selectedIndices.size} item(s)!\n\n`;
      if (freteTotal > 0) {
        alertMsg += `• Frete: ${formatBRL(fretePorItem)} por item\n`;
      }
      if (codigoRastreio) {
        alertMsg += `• Rastreio: ${codigoRastreio}\n`;
      }
      if (novoStatus) {
        alertMsg += `• Status: ${statusLabels[novoStatus] || novoStatus}\n`;
      }
      
      alert(alertMsg);
      
      // Limpar campos
      setItensParaFrete(prev => ({ ...prev, [poId]: new Set() }));
      setFreteEnvioTotal(prev => ({ ...prev, [poId]: '' }));
      setCodigoRastreioLote(prev => ({ ...prev, [poId]: '' }));
      setStatusNoFrete(prev => ({ ...prev, [poId]: '' }));
      
      // Recarregar dados
      loadItems();
    } catch (error) {
      console.error('Erro ao aplicar:', error);
      alert('Erro ao aplicar: ' + (error.response?.data?.detail || error.message));
    } finally {
      setAplicandoFrete(null);
    }
  };

  // Aplicar código de rastreio em lote (mantido para compatibilidade)
  const aplicarRastreioEmLote = async (poId) => {
    const selectedIndices = itensParaFrete[poId];  // Usa a mesma seleção do frete
    const codigoRastreio = codigoRastreioLote[poId]?.trim();
    
    if (!selectedIndices || selectedIndices.size === 0) {
      alert('Selecione ao menos um item para aplicar o código de rastreio.');
      return;
    }
    
    if (!codigoRastreio) {
      alert('Informe o código de rastreio.');
      return;
    }
    
    if (!window.confirm(
      `Aplicar código de rastreio "${codigoRastreio}" para ${selectedIndices.size} item(s)?`
    )) {
      return;
    }
    
    setAplicandoRastreio(poId);
    
    try {
      const response = await apiPost(`${API}/purchase-orders/${poId}/rastreio-multiplo`, {
        item_indices: Array.from(selectedIndices),
        codigo_rastreio: codigoRastreio
      });
      
      alert(
        `✅ Código de rastreio aplicado!\n\n` +
        `• Código: ${codigoRastreio}\n` +
        `• Itens atualizados: ${response.data.quantidade_itens}`
      );
      
      // Limpar código
      setCodigoRastreioLote(prev => ({ ...prev, [poId]: '' }));
      
      // Recarregar dados
      loadItems();
    } catch (error) {
      console.error('Erro ao aplicar rastreio:', error);
      alert('Erro ao aplicar rastreio: ' + (error.response?.data?.detail || error.message));
    } finally {
      setAplicandoRastreio(null);
    }
  };

  // ============ FUNÇÕES PARA RASTREIO EM LOTE (EM TRÂNSITO) ============
  
  // Toggle seleção de item para rastreio (Em Trânsito)
  const toggleItemParaRastreio = (poId, itemIndex) => {
    setItensParaRastreio(prev => {
      const currentSet = prev[poId] || new Set();
      const newSet = new Set(currentSet);
      if (newSet.has(itemIndex)) {
        newSet.delete(itemIndex);
      } else {
        newSet.add(itemIndex);
      }
      return { ...prev, [poId]: newSet };
    });
  };

  // Selecionar/desselecionar todos os itens para rastreio
  const toggleAllItensParaRastreio = (poId, items) => {
    const currentSet = itensParaRastreio[poId] || new Set();
    if (currentSet.size === items.length) {
      // Se todos já estão selecionados, desseleciona todos
      setItensParaRastreio(prev => ({ ...prev, [poId]: new Set() }));
    } else {
      // Seleciona todos
      const newSet = new Set(items.map(item => item._itemIndexInPO));
      setItensParaRastreio(prev => ({ ...prev, [poId]: newSet }));
    }
  };

  // Aplicar rastreio em lote para itens "Em Trânsito"
  const aplicarRastreioEmTransito = async (poId) => {
    const selectedIndices = itensParaRastreio[poId];
    const codigoRastreio = codigoRastreioLote[poId]?.trim();
    
    if (!selectedIndices || selectedIndices.size === 0) {
      alert('Selecione ao menos um item para aplicar o código de rastreio.');
      return;
    }
    
    if (!codigoRastreio) {
      alert('Informe o código de rastreio.');
      return;
    }
    
    if (!window.confirm(
      `Aplicar/atualizar código de rastreio "${codigoRastreio}" para ${selectedIndices.size} item(s)?`
    )) {
      return;
    }
    
    setAplicandoRastreio(poId);
    
    try {
      const response = await apiPost(`${API}/purchase-orders/${poId}/rastreio-multiplo`, {
        item_indices: Array.from(selectedIndices),
        codigo_rastreio: codigoRastreio
      });
      
      alert(
        `✅ Código de rastreio aplicado!\n\n` +
        `• Código: ${codigoRastreio}\n` +
        `• Itens atualizados: ${response.data.quantidade_itens}`
      );
      
      // Limpar seleção e código
      setItensParaRastreio(prev => ({ ...prev, [poId]: new Set() }));
      setCodigoRastreioLote(prev => ({ ...prev, [poId]: '' }));
      
      // Recarregar dados
      loadItems();
    } catch (error) {
      console.error('Erro ao aplicar rastreio:', error);
      alert('Erro ao aplicar rastreio: ' + (error.response?.data?.detail || error.message));
    } finally {
      setAplicandoRastreio(null);
    }
  };

  // Aplicar RASTREIO, FRETE E STATUS em lote para itens em trânsito (atualização/correção)
  const aplicarRastreioEFreteEmTransito = async (poId) => {
    const selectedIndices = itensParaRastreio[poId];
    const codigoRastreio = codigoRastreioLote[poId]?.trim();
    const freteTotal = parseFloat(freteEnvioTotal[poId] || 0);
    const novoStatus = statusNoRastreio[poId] || '';
    
    if (!selectedIndices || selectedIndices.size === 0) {
      alert('Selecione ao menos um item.');
      return;
    }
    
    if (!codigoRastreio && freteTotal <= 0 && !novoStatus) {
      alert('Informe o código de rastreio, valor do frete e/ou novo status.');
      return;
    }
    
    const fretePorItem = freteTotal > 0 ? (freteTotal / selectedIndices.size) : 0;
    
    const statusLabels = {
      'entregue': '✅ Entregue',
      'em_separacao': '📦 Em Separação',
      'comprado': '🛒 Comprado'
    };
    
    let mensagem = `Aplicar alterações em ${selectedIndices.size} item(s)?\n\n`;
    if (codigoRastreio) mensagem += `📦 Código: ${codigoRastreio}\n`;
    if (freteTotal > 0) mensagem += `🚚 Frete Total: R$ ${freteTotal.toFixed(2)} (R$ ${fretePorItem.toFixed(2)}/item)\n`;
    if (novoStatus) mensagem += `🔄 Status: ${statusLabels[novoStatus] || novoStatus}\n`;
    
    if (!window.confirm(mensagem)) {
      return;
    }
    
    setAplicandoRastreio(poId);
    
    try {
      // Aplicar rastreio e frete se informados
      if (codigoRastreio || freteTotal > 0) {
        const payload = {
          item_indices: Array.from(selectedIndices)
        };
        
        if (codigoRastreio) {
          payload.codigo_rastreio = codigoRastreio;
        }
        if (freteTotal > 0) {
          payload.frete_por_item = fretePorItem;
        }
        
        await apiPost(`${API}/purchase-orders/${poId}/rastreio-frete-multiplo`, payload);
      }
      
      // Aplicar mudança de status se informado
      if (novoStatus) {
        await apiPost(`${API}/purchase-orders/${poId}/status-multiplo`, {
          item_indices: Array.from(selectedIndices),
          novo_status: novoStatus
        });
      }
      
      let alertMsg = `✅ Atualização aplicada!\n\n`;
      alertMsg += `• Itens atualizados: ${selectedIndices.size}\n`;
      if (codigoRastreio) alertMsg += `• Código: ${codigoRastreio}\n`;
      if (freteTotal > 0) alertMsg += `• Frete por item: R$ ${fretePorItem.toFixed(2)}\n`;
      if (novoStatus) alertMsg += `• Status: ${statusLabels[novoStatus] || novoStatus}`;
      
      alert(alertMsg);
      
      // Limpar seleção e valores
      setItensParaRastreio(prev => ({ ...prev, [poId]: new Set() }));
      setCodigoRastreioLote(prev => ({ ...prev, [poId]: '' }));
      setFreteEnvioTotal(prev => ({ ...prev, [poId]: '' }));
      setStatusNoRastreio(prev => ({ ...prev, [poId]: '' }));
      
      // Recarregar dados
      loadItems();
    } catch (error) {
      console.error('Erro ao aplicar:', error);
      alert('Erro: ' + (error.response?.data?.detail || error.message));
    } finally {
      setAplicandoRastreio(null);
    }
  };

  // Toggle seleção de item para mudança de status
  const toggleItemParaStatus = (poId, itemIndex) => {
    setItensParaStatus(prev => {
      const currentSet = prev[poId] || new Set();
      const newSet = new Set(currentSet);
      if (newSet.has(itemIndex)) {
        newSet.delete(itemIndex);
      } else {
        newSet.add(itemIndex);
      }
      return { ...prev, [poId]: newSet };
    });
  };

  // Selecionar/desselecionar todos os itens para mudança de status
  const toggleAllItensParaStatus = (poId, items) => {
    const currentSet = itensParaStatus[poId] || new Set();
    if (currentSet.size === items.length) {
      // Se todos já estão selecionados, desseleciona todos
      setItensParaStatus(prev => ({ ...prev, [poId]: new Set() }));
    } else {
      // Seleciona todos
      const newSet = new Set(items.map(item => item._itemIndexInPO));
      setItensParaStatus(prev => ({ ...prev, [poId]: newSet }));
    }
  };

  // Aplicar mudança de status para itens selecionados
  const aplicarStatusEmMassa = async (poId, numeroOC, totalItens) => {
    const novoStatus = novoStatusMassa[poId];
    const itensSelecionados = itensParaStatus[poId] || new Set();
    
    if (!novoStatus) {
      alert('Selecione um status');
      return;
    }
    
    if (itensSelecionados.size === 0) {
      alert('Selecione ao menos um item para mudar o status');
      return;
    }
    
    const statusLabels = {
      'pendente': 'Pendente',
      'cotado': 'Cotado',
      'comprado': 'Comprado',
      'em_separacao': 'Em Separação',
      'em_transito': 'Em Trânsito',
      'entregue': 'Entregue'
    };
    
    if (!window.confirm(
      `Mudar o status de ${itensSelecionados.size} item(s) da ${numeroOC} para "${statusLabels[novoStatus]}"?\n\n` +
      `Esta ação não pode ser desfeita facilmente.`
    )) {
      return;
    }
    
    setAplicandoStatusMassa(poId);
    
    try {
      const response = await apiPost(`${API}/purchase-orders/${poId}/status-em-massa`, {
        novo_status: novoStatus,
        item_indices: Array.from(itensSelecionados)
      });
      
      alert(
        `✅ Status atualizado com sucesso!\n\n` +
        `• OC: ${response.data.numero_oc}\n` +
        `• Novo status: ${statusLabels[novoStatus]}\n` +
        `• Itens atualizados: ${response.data.itens_atualizados} de ${response.data.total_itens}`
      );
      
      // Limpar seleção
      setNovoStatusMassa(prev => ({ ...prev, [poId]: '' }));
      setItensParaStatus(prev => ({ ...prev, [poId]: new Set() }));
      
      // Recarregar dados
      loadItems();
    } catch (error) {
      console.error('Erro ao atualizar status:', error);
      alert('Erro ao atualizar status: ' + (error.response?.data?.detail || error.message));
    } finally {
      setAplicandoStatusMassa(null);
    }
  };

  // Toggle "Pronto para Despacho" da OC inteira (apenas flag visual)
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
  
  // Mover itens selecionados para "Pronto para Envio"
  const moverParaProntoEnvio = async (poId) => {
    const itensSelecionados = itensParaStatus[poId];
    if (!itensSelecionados || itensSelecionados.size === 0) {
      alert('⚠️ Selecione pelo menos um item para mover para "Pronto p/ Envio"');
      return;
    }
    
    try {
      // Buscar a OC para ter os dados corretos
      const response = await apiGet(`${API}/purchase-orders/${poId}`);
      const ocData = response.data;
      
      if (ocData && ocData.items) {
        for (const idx of itensSelecionados) {
          const item = ocData.items[idx];
          if (item && item.status === 'em_separacao') {
            await apiPatch(`${API}/purchase-orders/${poId}/items/by-index/${idx}`, {
              status: 'pronto_envio'
            });
          }
        }
      }
      
      alert(`✅ ${itensSelecionados.size} item(s) movido(s) para "Pronto p/ Envio"!`);
      // Limpar seleção
      setItensParaStatus(prev => ({ ...prev, [poId]: new Set() }));
      loadItems();
    } catch (error) {
      console.error('Erro ao mover itens:', error);
      alert('Erro ao mover itens: ' + (error.message || 'Erro desconhecido'));
    }
  };

  // Dados bancários padrão
  const dadosBancariosDefault = {
    banco: '341 - Itaú Unibanco',
    conta: '98814-9',
    agencia: '3978',
    pix: '46.663.556/0001-69'
  };
  
  // Função para obter dados bancários (customizados ou padrão)
  const getDadosBancarios = (poId) => {
    return dadosBancariosPorOC[poId] || dadosBancariosDefault;
  };

  // Função para gerar texto dos Dados Adicionais da NF
  const gerarDadosAdicionaisNF = (item) => {
    // Extrair apenas o número da OC (ex: "OC-2.118938" -> "2.118938")
    const numeroOC = item.numero_oc ? item.numero_oc.replace(/^OC-/i, '') : '';
    // Preferir endereço da OC (que pode ter CEP) sobre o do item
    const endereco = item.endereco_entrega_oc || item.endereco_entrega || 'ENDEREÇO NÃO INFORMADO';
    
    // Buscar itens que irão na próxima remessa para esta OC
    const itensPendentes = itensProximaRemessaPorOC[item.po_id] || [];
    
    // Obter dados bancários (customizados ou padrão)
    const dados = getDadosBancarios(item.po_id);
    
    let texto = `Endereço da entrega: ${endereco}
NF referente à OC - ${numeroOC}`;
    
    // Só mostrar linha de próxima remessa se houver itens pendentes
    if (itensPendentes.length > 0) {
      texto += `\nItens que irão na próxima remessa: ${itensPendentes.join(', ')}`;
    }
    
    texto += `\nDADOS BANCÁRIOS
Banco: ${dados.banco}
Conta: ${dados.conta}
Agência: ${dados.agencia}
Chave PIX: ${dados.pix}`;
    
    return texto;
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

  const startEditEndereco = async (item) => {
    setEditingEndereco(item._uniqueId);
    let endereco = item.endereco_entrega || '';
    
    // Verificar se já tem CEP no endereço
    const cepMatch = endereco.match(/CEP[:\s]*\d{5}-?\d{3}/i);
    
    if (!cepMatch && endereco.length > 10) {
      // Se não tem CEP, buscar automaticamente e adicionar ao endereço
      setBuscandoCep(true);
      try {
        const cepEncontrado = await buscarCepPeloEndereco(endereco);
        if (cepEncontrado) {
          // Formatar o CEP corretamente
          const cepFormatado = cepEncontrado.replace('-', '');
          const cepComHifen = `${cepFormatado.substring(0,5)}-${cepFormatado.substring(5)}`;
          // Adicionar CEP ao final do endereço
          endereco = `${endereco}, CEP: ${cepComHifen}`;
        }
      } catch (error) {
        console.error('Erro ao buscar CEP automaticamente:', error);
      } finally {
        setBuscandoCep(false);
      }
    }
    
    setEnderecoTemp(endereco);
    setCepTemp('');
  };

  const cancelEditEndereco = () => {
    setEditingEndereco(null);
    setEnderecoTemp('');
    setCepTemp('');
  };

  // Buscar endereço pelo CEP usando ViaCEP (gratuita e sem autenticação)
  const buscarEnderecoPorCep = async () => {
    if (!cepTemp || cepTemp.length < 8) {
      alert('Informe um CEP válido (8 dígitos)');
      return;
    }
    
    const cepLimpo = cepTemp.replace(/\D/g, '');
    
    setBuscandoCep(true);
    try {
      const response = await fetch(`https://viacep.com.br/ws/${cepLimpo}/json/`);
      const data = await response.json();
      
      if (data.erro) {
        alert('CEP não encontrado');
        return;
      }
      
      // Montar endereço completo
      const endereco = `${data.logradouro}, ${data.bairro}, ${data.localidade} - ${data.uf}, CEP ${cepLimpo.substring(0, 5)}-${cepLimpo.substring(5)}`.toUpperCase();
      setEnderecoTemp(endereco);
    } catch (error) {
      console.error('Erro ao buscar CEP:', error);
      alert('Erro ao buscar CEP. Tente novamente.');
    } finally {
      setBuscandoCep(false);
    }
  };

  // Buscar CEP automaticamente pelo endereço (usando API do backend)
  const buscarCepPeloEndereco = async (endereco) => {
    if (!endereco || endereco.length < 10) return null;
    
    // Se já tem CEP no endereço, retornar ele
    const cepExistente = endereco.match(/CEP\s*(\d{5}-?\d{3})/i);
    if (cepExistente) {
      return cepExistente[1].replace('-', '');
    }
    
    try {
      const response = await apiPost(`${API}/buscar-cep`, { endereco });
      if (response.data.success) {
        return response.data.cep;
      }
    } catch (error) {
      console.error('Erro ao buscar CEP pelo endereço:', error);
    }
    return null;
  };

  // Adicionar CEP ao endereço se não existir
  const adicionarCepAoEndereco = async (item) => {
    if (!item.endereco_entrega) return;
    
    // Verificar se já tem CEP
    if (/CEP\s*\d{5}-?\d{3}/i.test(item.endereco_entrega)) {
      return; // Já tem CEP
    }
    
    const cep = await buscarCepPeloEndereco(item.endereco_entrega);
    if (cep) {
      // Atualizar o endereço com o CEP
      const novoEndereco = `${item.endereco_entrega}, CEP ${cep.substring(0,5)}-${cep.substring(5)}`;
      try {
        await apiPatch(
          `${API}/purchase-orders/${item.po_id}/items/by-index/${item._itemIndexInPO}/endereco`,
          { endereco: novoEndereco.toUpperCase() }
        );
        return novoEndereco;
      } catch (error) {
        console.error('Erro ao atualizar endereço com CEP:', error);
      }
    }
    return null;
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

  // ============== USAR DO ESTOQUE ==============
  const abrirModalUsarEstoque = async (item) => {
    try {
      // Buscar detalhes do estoque disponível
      const response = await apiGet(`${API}/estoque/detalhes/${item.codigo_item}`);
      const detalhes = response.data;
      
      if (detalhes.total_disponivel <= 0) {
        alert('Não há estoque disponível para este item.');
        return;
      }
      
      // Para itens pendentes/cotados, ignorar quantidade_do_estoque anterior
      // (o usuário pode ter voltado o status para testar ou corrigir)
      const statusPodeUsarEstoque = ['pendente', 'cotado'];
      const ignorarQtdAnterior = statusPodeUsarEstoque.includes(item.status);
      
      const qtdJaAtendida = ignorarQtdAnterior ? 0 : (item.quantidade_do_estoque || 0);
      const qtdFaltante = (item.quantidade || 0) - qtdJaAtendida;
      
      if (qtdFaltante <= 0) {
        alert('Este item já foi totalmente atendido.');
        return;
      }
      
      // Máximo que pode usar: o menor entre disponível e faltante
      const maxUsar = Math.min(detalhes.total_disponivel, qtdFaltante);
      
      setEstoqueDetalhes(detalhes);
      setQuantidadeUsar(maxUsar); // Já seta o máximo permitido
      setShowUsarEstoqueModal(item);
    } catch (error) {
      console.error('Erro ao buscar detalhes do estoque:', error);
      alert('Erro ao buscar detalhes do estoque.');
    }
  };

  // Funções de modal de estoque movidas para UsarEstoqueModal componente

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
              <option value="pronto_envio">Pronto p/ Envio</option>
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
            
            {/* Botão Agrupar por Código (para pendentes e cotados) */}
            {(status === 'pendente' || status === 'cotado') && (
              <button
                onClick={() => {
                  setViewMode(viewMode === 'grouped' ? 'normal' : 'grouped');
                  setCurrentPage(1);
                }}
                style={{ 
                  padding: '0.6rem 1.2rem',
                  background: viewMode === 'grouped' ? '#8b5cf6' : '#f3f4f6',
                  color: viewMode === 'grouped' ? 'white' : '#4b5563',
                  border: viewMode === 'grouped' ? 'none' : '1px solid #d1d5db',
                  borderRadius: '8px',
                  fontWeight: '600',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.5rem'
                }}
                data-testid="toggle-grouped-view-btn"
              >
                {viewMode === 'grouped' ? '🔗 Agrupado ✓' : '🔗 Agrupar por Código'}
                {viewMode === 'grouped' && (
                  <span style={{ 
                    background: 'white', 
                    color: '#8b5cf6', 
                    borderRadius: '50%', 
                    padding: '0.1rem 0.5rem',
                    fontSize: '0.8rem',
                    fontWeight: '700'
                  }}>
                    {itemsGroupedByCode.length}
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
        ) : (status === 'em_separacao' || status === 'em_transito' || status === 'pronto_envio') ? (
          /* ============ VISUALIZAÇÃO POR OC (Em Separação / Em Trânsito / Pronto p/ Envio) ============ */
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            {/* Contador e paginação no topo */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
              <span style={{ color: '#718096', fontSize: '0.9rem' }}>
                Mostrando {((emSeparacaoPage - 1) * ITEMS_PER_PAGE_EM_SEPARACAO) + 1}-{Math.min(emSeparacaoPage * ITEMS_PER_PAGE_EM_SEPARACAO, itemsGroupedByOC.length)} de {itemsGroupedByOC.length} OCs
              </span>
              {totalPagesEmSeparacao > 1 && (
                <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                  <button
                    onClick={() => setEmSeparacaoPage(p => Math.max(1, p - 1))}
                    disabled={emSeparacaoPage === 1}
                    style={{
                      padding: '0.5rem 1rem',
                      border: '1px solid #e2e8f0',
                      borderRadius: '6px',
                      background: emSeparacaoPage === 1 ? '#f3f4f6' : 'white',
                      cursor: emSeparacaoPage === 1 ? 'not-allowed' : 'pointer',
                      opacity: emSeparacaoPage === 1 ? 0.5 : 1
                    }}
                  >
                    ← Anterior
                  </button>
                  <span style={{ padding: '0 0.5rem', fontWeight: '600' }}>
                    {emSeparacaoPage} / {totalPagesEmSeparacao}
                  </span>
                  <button
                    onClick={() => setEmSeparacaoPage(p => Math.min(totalPagesEmSeparacao, p + 1))}
                    disabled={emSeparacaoPage === totalPagesEmSeparacao}
                    style={{
                      padding: '0.5rem 1rem',
                      border: '1px solid #e2e8f0',
                      borderRadius: '6px',
                      background: emSeparacaoPage === totalPagesEmSeparacao ? '#f3f4f6' : 'white',
                      cursor: emSeparacaoPage === totalPagesEmSeparacao ? 'not-allowed' : 'pointer',
                      opacity: emSeparacaoPage === totalPagesEmSeparacao ? 0.5 : 1
                    }}
                  >
                    Próximo →
                  </button>
                </div>
              )}
            </div>
            
            {paginatedOCs.map((oc) => (
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
                      {oc.prontoParaEnvio ? '✓' : oc.totalItens}
                    </div>
                    
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.25rem', flexWrap: 'wrap' }}>
                        <h3 style={{ fontSize: '1.2rem', fontWeight: '700', margin: 0, color: '#1f2937' }}>
                          {oc.numero_oc}
                        </h3>
                        {/* Data de Entrega com contagem regressiva */}
                        {oc.data_entrega && <DataEntregaBadge dataEntrega={oc.data_entrega} compact={true} />}
                        {/* Badge de Status */}
                        {oc.prontoParaEnvio ? (
                          <span style={{ 
                            background: '#22c55e', 
                            color: 'white', 
                            padding: '0.2rem 0.6rem', 
                            borderRadius: '12px',
                            fontSize: '0.75rem',
                            fontWeight: '600'
                          }}>
                            ✅ PRONTO PARA ENVIO
                          </span>
                        ) : oc.temNFFornecedor ? (
                          <span style={{ 
                            background: '#3b82f6', 
                            color: 'white', 
                            padding: '0.2rem 0.6rem', 
                            borderRadius: '12px',
                            fontSize: '0.75rem',
                            fontWeight: '600'
                          }}>
                            📦 NF FORNECEDOR
                          </span>
                        ) : null}
                      </div>
                      
                      {/* Endereço de Entrega da OC */}
                      <div style={{ 
                        display: 'flex', 
                        alignItems: 'center', 
                        gap: '0.5rem', 
                        marginBottom: '0.5rem',
                        fontSize: '0.85rem',
                        background: '#dbeafe',
                        padding: '0.5rem 0.75rem',
                        borderRadius: '6px',
                        border: '1px solid #93c5fd',
                        maxWidth: '100%'
                      }}>
                        <span style={{ color: '#1e40af', fontWeight: '700' }}>📍</span>
                        {editingEnderecoOC === oc.po_id ? (
                          <div style={{ flex: 1, display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                            <textarea
                              value={enderecoOCTemp}
                              onChange={(e) => setEnderecoOCTemp(e.target.value)}
                              className="form-input"
                              style={{ flex: 1, minHeight: '60px', textTransform: 'uppercase', fontSize: '0.85rem' }}
                              placeholder="Endereço completo com CEP"
                              onClick={(e) => e.stopPropagation()}
                            />
                            <button
                              onClick={async (e) => {
                                e.stopPropagation();
                                try {
                                  const response = await apiPatch(`/purchase-orders/${oc.po_id}`, {
                                    endereco_entrega: enderecoOCTemp
                                  });
                                  if (response.ok) {
                                    alert('Endereço atualizado!');
                                    setEditingEnderecoOC(null);
                                    loadItems();
                                  }
                                } catch (err) {
                                  alert('Erro ao atualizar endereço');
                                }
                              }}
                              style={{ padding: '0.4rem 0.6rem', fontSize: '0.75rem', background: '#22c55e', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', whiteSpace: 'nowrap' }}
                            >
                              ✓ Salvar
                            </button>
                            <button
                              onClick={(e) => { e.stopPropagation(); setEditingEnderecoOC(null); }}
                              style={{ padding: '0.4rem 0.6rem', fontSize: '0.75rem', background: '#9ca3af', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}
                            >
                              ✕
                            </button>
                          </div>
                        ) : (
                          <>
                            <span style={{ color: '#1e3a5f', fontWeight: '500', flex: 1 }}>{oc.endereco_entrega || 'Não informado'}</span>
                            <button
                              onClick={(e) => { 
                                e.stopPropagation(); 
                                setEditingEnderecoOC(oc.po_id); 
                                setEnderecoOCTemp(oc.endereco_entrega || ''); 
                              }}
                              style={{ padding: '0.2rem 0.5rem', fontSize: '0.7rem', background: '#3b82f6', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}
                            >
                              ✏️ Edit
                            </button>
                          </>
                        )}
                      </div>
                      
                      {/* DADOS ADICIONAIS DA NF - em amarelo */}
                      <div style={{ 
                        background: '#fef9c3', 
                        padding: '0.75rem',
                        borderRadius: '6px',
                        border: '1px solid #fde047',
                        marginBottom: '0.5rem'
                      }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                          <span style={{ fontSize: '0.85rem', color: '#854d0e', fontWeight: '700' }}>
                            📝 DADOS ADICIONAIS DA NF
                          </span>
                          <div style={{ display: 'flex', gap: '0.5rem' }}>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                const dados = getDadosBancarios(oc.po_id);
                                setDadosNFTemp(dados);
                                setEditingDadosNF(oc.po_id);
                              }}
                              style={{ padding: '0.25rem 0.5rem', fontSize: '0.7rem', background: '#3b82f6', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}
                            >
                              ✏️ Editar
                            </button>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                const numeroOC = oc.numero_oc ? oc.numero_oc.replace(/^OC-/i, '') : '';
                                const endereco = oc.endereco_entrega || 'ENDEREÇO NÃO INFORMADO';
                                const itensPendentes = itensProximaRemessaPorOC[oc.po_id] || [];
                                const dados = getDadosBancarios(oc.po_id);
                                let texto = `Endereço da entrega: ${endereco}
NF referente à OC - ${numeroOC}`;
                                if (itensPendentes.length > 0) {
                                  texto += `\nItens que irão na próxima remessa: ${itensPendentes.join(', ')}`;
                                }
                                texto += `\nDADOS BANCÁRIOS
Banco: ${dados.banco}
Conta: ${dados.conta}
Agência: ${dados.agencia}
Chave PIX: ${dados.pix}`;
                                navigator.clipboard.writeText(texto).then(() => {
                                  alert('Dados Adicionais copiados!');
                                });
                              }}
                              style={{ padding: '0.25rem 0.5rem', fontSize: '0.7rem', background: '#eab308', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}
                            >
                              📋 Copiar
                            </button>
                          </div>
                        </div>
                        
                        {/* Modal de edição dos dados bancários */}
                        {editingDadosNF === oc.po_id ? (
                          <div style={{ 
                            background: 'white', 
                            padding: '1rem', 
                            borderRadius: '6px',
                            border: '1px solid #e5e7eb'
                          }} onClick={(e) => e.stopPropagation()}>
                            <div style={{ marginBottom: '0.75rem' }}>
                              <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: '600', marginBottom: '0.25rem' }}>Banco</label>
                              <input
                                type="text"
                                value={dadosNFTemp.banco}
                                onChange={(e) => setDadosNFTemp(prev => ({ ...prev, banco: e.target.value }))}
                                style={{ width: '100%', padding: '0.5rem', border: '1px solid #d1d5db', borderRadius: '4px', fontSize: '0.85rem' }}
                              />
                            </div>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem', marginBottom: '0.75rem' }}>
                              <div>
                                <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: '600', marginBottom: '0.25rem' }}>Conta</label>
                                <input
                                  type="text"
                                  value={dadosNFTemp.conta}
                                  onChange={(e) => setDadosNFTemp(prev => ({ ...prev, conta: e.target.value }))}
                                  style={{ width: '100%', padding: '0.5rem', border: '1px solid #d1d5db', borderRadius: '4px', fontSize: '0.85rem' }}
                                />
                              </div>
                              <div>
                                <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: '600', marginBottom: '0.25rem' }}>Agência</label>
                                <input
                                  type="text"
                                  value={dadosNFTemp.agencia}
                                  onChange={(e) => setDadosNFTemp(prev => ({ ...prev, agencia: e.target.value }))}
                                  style={{ width: '100%', padding: '0.5rem', border: '1px solid #d1d5db', borderRadius: '4px', fontSize: '0.85rem' }}
                                />
                              </div>
                            </div>
                            <div style={{ marginBottom: '0.75rem' }}>
                              <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: '600', marginBottom: '0.25rem' }}>Chave PIX</label>
                              <input
                                type="text"
                                value={dadosNFTemp.pix}
                                onChange={(e) => setDadosNFTemp(prev => ({ ...prev, pix: e.target.value }))}
                                style={{ width: '100%', padding: '0.5rem', border: '1px solid #d1d5db', borderRadius: '4px', fontSize: '0.85rem' }}
                              />
                            </div>
                            <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
                              <button
                                onClick={() => setEditingDadosNF(null)}
                                style={{ padding: '0.5rem 1rem', background: '#6b7280', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '0.85rem' }}
                              >
                                Cancelar
                              </button>
                              <button
                                onClick={() => {
                                  setDadosBancariosPorOC(prev => ({ ...prev, [oc.po_id]: { ...dadosNFTemp } }));
                                  setEditingDadosNF(null);
                                  alert('Dados bancários atualizados!');
                                }}
                                style={{ padding: '0.5rem 1rem', background: '#16a34a', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '0.85rem', fontWeight: '600' }}
                              >
                                ✓ Salvar
                              </button>
                            </div>
                          </div>
                        ) : (
                          <pre style={{ 
                            whiteSpace: 'pre-wrap', 
                            fontSize: '0.75rem', 
                            color: '#713f12',
                            background: 'white',
                            padding: '0.5rem',
                            borderRadius: '4px',
                            margin: 0
                          }}
                          onClick={(e) => e.stopPropagation()}
                          >
{(() => {
  const dados = getDadosBancarios(oc.po_id);
  return `Endereço: ${oc.endereco_entrega || 'NÃO INFORMADO'}
OC: ${oc.numero_oc ? oc.numero_oc.replace(/^OC-/i, '') : ''}${(itensProximaRemessaPorOC[oc.po_id] || []).length > 0 ? `\nPróxima remessa: ${(itensProximaRemessaPorOC[oc.po_id] || []).join(', ')}` : ''}
DADOS BANCÁRIOS - Banco: ${dados.banco} | Ag: ${dados.agencia} | Cc: ${dados.conta} | PIX: ${dados.pix}`;
})()}
                          </pre>
                        )}
                      </div>
                      
                      {/* Status de NFs */}
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', fontSize: '0.85rem' }}>
                        {/* NF Fornecedor */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                          <span style={{ 
                            color: oc.todosFornecedor ? '#22c55e' : oc.temNFFornecedor ? '#3b82f6' : '#9ca3af',
                            fontWeight: '600'
                          }}>
                            📦 NF Fornecedor:
                          </span>
                          {oc.itensComNFFornecedor > 0 ? (
                            <>
                              <span style={{ color: '#22c55e', fontWeight: '700' }}>
                                {oc.itensComNFFornecedor} de {oc.totalItens}
                              </span>
                              {oc.itensRestantesFornecedor > 0 && (
                                <span style={{ color: '#f59e0b', fontSize: '0.8rem' }}>
                                  (falta {oc.itensRestantesFornecedor})
                                </span>
                              )}
                              {oc.todosFornecedor && (
                                <span style={{ color: '#22c55e' }}>✓</span>
                              )}
                            </>
                          ) : (
                            <span style={{ color: '#9ca3af' }}>Nenhuma</span>
                          )}
                        </div>
                        
                        {/* NF Venda (ON) */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                          <span style={{ 
                            color: oc.temNFVenda ? '#22c55e' : '#9ca3af',
                            fontWeight: '600'
                          }}>
                            🏢 NF Venda (ON):
                          </span>
                          {oc.notas_fiscais_venda && oc.notas_fiscais_venda.length > 0 ? (
                            <>
                              <span style={{ color: '#22c55e', fontWeight: '700' }}>
                                {oc.itensProntos} de {oc.totalItens}
                              </span>
                              {oc.itensRestantes > 0 && (
                                <span style={{ color: '#f59e0b', fontSize: '0.8rem' }}>
                                  (falta {oc.itensRestantes})
                                </span>
                              )}
                              <span style={{ color: '#22c55e' }}>✓ {oc.notas_fiscais_venda.length} NF(s)</span>
                            </>
                          ) : (
                            <span style={{ color: '#9ca3af' }}>Nenhuma</span>
                          )}
                        </div>
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
                    
                    {/* ======== SEÇÕES ESPECÍFICAS PARA EM SEPARAÇÃO ======== */}
                    {status === 'em_separacao' && (
                    <>
                    {/* NF de Venda da OC (1 por OC inteira) */}
                    <div style={{ 
                      marginBottom: '1.5rem', 
                      padding: '1rem', 
                      background: oc.notas_fiscais_venda && oc.notas_fiscais_venda.length > 0 ? '#dcfce7' : '#fef3c7', 
                      borderRadius: '8px',
                      border: `2px solid ${oc.notas_fiscais_venda && oc.notas_fiscais_venda.length > 0 ? '#22c55e' : '#f59e0b'}`
                    }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
                        <h4 style={{ 
                          margin: 0, 
                          fontSize: '1rem', 
                          fontWeight: '700', 
                          color: oc.notas_fiscais_venda && oc.notas_fiscais_venda.length > 0 ? '#166534' : '#92400e'
                        }}>
                          🏢 NF de Venda (ON) - {oc.numero_oc}
                        </h4>
                        {oc.itensProntos > 0 && (
                          <span style={{ 
                            background: '#22c55e', 
                            color: 'white', 
                            padding: '0.25rem 0.75rem', 
                            borderRadius: '12px',
                            fontSize: '0.8rem',
                            fontWeight: '600'
                          }}>
                            ✓ {oc.itensProntos} de {oc.totalItens} itens com NF
                          </span>
                        )}
                      </div>
                      
                      {/* Lista de NFs existentes */}
                      {oc.notas_fiscais_venda && oc.notas_fiscais_venda.length > 0 && (
                        <div style={{ marginBottom: '1rem' }}>
                          {oc.notas_fiscais_venda.map((nf, nfIdx) => (
                            <div 
                              key={nf.id || nfIdx}
                              style={{ 
                                display: 'flex', 
                                alignItems: 'center', 
                                justifyContent: 'space-between',
                                padding: '0.75rem',
                                background: 'white',
                                borderRadius: '6px',
                                marginBottom: '0.5rem'
                              }}
                            >
                              <div>
                                <span style={{ fontWeight: '600' }}>
                                  {nf.filename.endsWith('.xml') ? '📑' : '📄'} {nf.filename}
                                </span>
                                {nf.numero_nf && (
                                  <span style={{ marginLeft: '0.75rem', color: '#6b7280', fontSize: '0.9rem' }}>
                                    (NF: {nf.numero_nf})
                                  </span>
                                )}
                                {nf.itens_indices && nf.itens_indices.length > 0 && (
                                  <span style={{ marginLeft: '0.75rem', color: '#22c55e', fontSize: '0.85rem', fontWeight: '600' }}>
                                    • {nf.itens_indices.length} item(s)
                                  </span>
                                )}
                              </div>
                              <div style={{ display: 'flex', gap: '0.5rem' }}>
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    downloadNFVendaOC(oc.po_id, nf.filename);
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
                                    deleteNFVendaOC(oc.po_id, nf.id);
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
                                  🗑️
                                </button>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                      
                      {/* Botão para adicionar nova NF */}
                      <div style={{ textAlign: 'center' }}>
                        {oc.itensRestantes > 0 && (
                          <p style={{ color: '#f59e0b', fontSize: '0.9rem', marginBottom: '0.75rem' }}>
                            {oc.itensRestantes} item(s) ainda sem NF de Venda
                          </p>
                        )}
                        <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
                          {/* Botão para PDF */}
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              const input = document.createElement('input');
                              input.type = 'file';
                              input.accept = '.pdf';
                              input.onchange = (ev) => {
                                if (ev.target.files && ev.target.files[0]) {
                                  uploadNFVendaOC(oc.po_id, ev.target.files[0], oc.items);
                                }
                              };
                              input.click();
                            }}
                            disabled={uploadingNFVendaOC === oc.po_id}
                            style={{ 
                              padding: '0.6rem 1.2rem', 
                              fontSize: '0.9rem', 
                              background: uploadingNFVendaOC === oc.po_id ? '#9ca3af' : '#22c55e', 
                              color: 'white', 
                              border: 'none', 
                              borderRadius: '8px',
                              cursor: uploadingNFVendaOC === oc.po_id ? 'not-allowed' : 'pointer',
                              fontWeight: '600'
                            }}
                          >
                            {uploadingNFVendaOC === oc.po_id ? '⏳ Enviando...' : '📄 Subir PDF'}
                          </button>
                          
                          {/* Botão para XML */}
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              const input = document.createElement('input');
                              input.type = 'file';
                              input.accept = '.xml';
                              input.onchange = (ev) => {
                                if (ev.target.files && ev.target.files[0]) {
                                  uploadNFVendaOC(oc.po_id, ev.target.files[0], oc.items);
                                }
                              };
                              input.click();
                            }}
                            disabled={uploadingNFVendaOC === oc.po_id}
                            style={{ 
                              padding: '0.6rem 1.2rem', 
                              fontSize: '0.9rem', 
                              background: uploadingNFVendaOC === oc.po_id ? '#9ca3af' : '#3b82f6', 
                              color: 'white', 
                              border: 'none', 
                              borderRadius: '8px',
                              cursor: uploadingNFVendaOC === oc.po_id ? 'not-allowed' : 'pointer',
                              fontWeight: '600'
                            }}
                          >
                            📋 Subir XML
                          </button>
                        </div>
                        {getItensSelecionados(oc.po_id).size > 0 && (
                          <p style={{ fontSize: '0.8rem', color: '#16a34a', margin: '0.5rem 0 0 0' }}>
                            📌 {getItensSelecionados(oc.po_id).size} item(s) selecionado(s)
                          </p>
                        )}
                        </div>
                    </div>

                    {/* ============== SEÇÃO FRETE DE ENVIO EM LOTE ============== */}
                    {isAdmin() && (
                      <FreteRastreioForm
                        poId={oc.po_id}
                        totalItens={oc.items.length}
                        itensSelecionados={itensParaFrete[oc.po_id]}
                        freteTotal={freteEnvioTotal[oc.po_id]}
                        codigoRastreio={codigoRastreioLote[oc.po_id]}
                        novoStatus={statusNoFrete[oc.po_id]}
                        aplicando={aplicandoFrete === oc.po_id}
                        onToggleAll={() => toggleAllItensParaFrete(oc.po_id, oc.items)}
                        onFreteChange={(value) => setFreteEnvioTotal(prev => ({ ...prev, [oc.po_id]: value }))}
                        onRastreioChange={(value) => setCodigoRastreioLote(prev => ({ ...prev, [oc.po_id]: value }))}
                        onStatusChange={(value) => setStatusNoFrete(prev => ({ ...prev, [oc.po_id]: value }))}
                        onAplicar={() => aplicarFreteERastreio(oc.po_id)}
                      />
                    )}

                    {/* ============== SEÇÃO MUDAR STATUS EM MASSA (apenas em_separacao) ============== */}
                    {isAdmin() && status === 'em_separacao' && (
                      <MudarStatusForm
                        poId={oc.po_id}
                        numeroOC={oc.numero_oc}
                        totalItens={oc.items.length}
                        itensSelecionados={itensParaStatus[oc.po_id]}
                        statusAtual={status}
                        novoStatus={novoStatusMassa[oc.po_id]}
                        aplicando={aplicandoStatusMassa === oc.po_id}
                        onToggleAll={() => toggleAllItensParaStatus(oc.po_id, oc.items)}
                        onStatusChange={(value) => setNovoStatusMassa(prev => ({ ...prev, [oc.po_id]: value }))}
                        onAplicar={() => aplicarStatusEmMassa(oc.po_id, oc.numero_oc, oc.items.length)}
                      />
                    )}

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
                    </>
                    )}
                    {/* ======== FIM SEÇÕES EM SEPARAÇÃO ======== */}
                    
                    {/* ======== SEÇÃO RASTREIO, FRETE E STATUS EM LOTE (EM TRÂNSITO) ======== */}
                    {status === 'em_transito' && isAdmin() && (
                      <RastreioLoteForm
                        poId={oc.po_id}
                        totalItens={oc.items.length}
                        itensSelecionados={itensParaRastreio[oc.po_id]}
                        codigoRastreio={codigoRastreioLote[oc.po_id]}
                        freteTotal={freteEnvioTotal[oc.po_id]}
                        novoStatus={statusNoRastreio[oc.po_id]}
                        aplicando={aplicandoRastreio === oc.po_id}
                        onToggleAll={() => toggleAllItensParaRastreio(oc.po_id, oc.items)}
                        onRastreioChange={(value) => setCodigoRastreioLote(prev => ({ ...prev, [oc.po_id]: value }))}
                        onFreteChange={(value) => setFreteEnvioTotal(prev => ({ ...prev, [oc.po_id]: value }))}
                        onStatusChange={(value) => setStatusNoRastreio(prev => ({ ...prev, [oc.po_id]: value }))}
                        onAplicar={() => aplicarRastreioEFreteEmTransito(oc.po_id)}
                        modo="atualizar"
                      />
                    )}

                    {/* ======== SEÇÃO PRONTO PARA ENVIO ======== */}
                    {status === 'pronto_envio' && (
                      <>
                      {/* NF de Venda e XML para download */}
                      {oc.notas_fiscais_venda && oc.notas_fiscais_venda.length > 0 && (
                        <div style={{ 
                          marginBottom: '1rem', 
                          padding: '1rem', 
                          background: '#dcfce7', 
                          borderRadius: '8px',
                          border: '2px solid #22c55e'
                        }}>
                          <h4 style={{ margin: '0 0 0.75rem 0', fontSize: '0.9rem', fontWeight: '700', color: '#166534' }}>
                            📄 NF de Venda ({oc.notas_fiscais_venda.length})
                          </h4>
                          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                            {oc.notas_fiscais_venda.map((nf, nfIdx) => (
                              <button
                                key={nf.id || nfIdx}
                                onClick={() => downloadNFVendaOC(oc.po_id, nf.filename)}
                                style={{ 
                                  padding: '0.4rem 0.8rem', 
                                  fontSize: '0.85rem', 
                                  background: nf.filename.endsWith('.xml') ? '#7c3aed' : '#667eea', 
                                  color: 'white', 
                                  border: 'none', 
                                  borderRadius: '6px', 
                                  cursor: 'pointer' 
                                }}
                              >
                                {nf.filename.endsWith('.xml') ? '📑' : '📄'} {nf.filename}
                              </button>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Informações de Frete */}
                      <div style={{ 
                        marginBottom: '1rem', 
                        padding: '1rem', 
                        background: '#fef3c7', 
                        borderRadius: '8px',
                        border: '1px solid #fcd34d'
                      }}>
                        <h4 style={{ margin: '0 0 0.5rem 0', fontSize: '0.9rem', fontWeight: '700', color: '#92400e' }}>
                          🚚 Informações de Frete/Rastreio
                        </h4>
                        <FreteRastreioForm
                          poId={oc.po_id}
                          totalItens={oc.items.length}
                          itensSelecionados={itensParaFrete[oc.po_id]}
                          freteTotal={freteEnvioTotal[oc.po_id]}
                          codigoRastreio={codigoRastreioLote[oc.po_id]}
                          novoStatus={statusNoFrete[oc.po_id]}
                          aplicando={aplicandoFrete === oc.po_id}
                          onToggleAll={() => toggleAllItensParaFrete(oc.po_id, oc.items)}
                          onFreteChange={(value) => setFreteEnvioTotal(prev => ({ ...prev, [oc.po_id]: value }))}
                          onRastreioChange={(value) => setCodigoRastreioLote(prev => ({ ...prev, [oc.po_id]: value }))}
                          onStatusChange={(value) => setStatusNoFrete(prev => ({ ...prev, [oc.po_id]: value }))}
                          onAplicar={() => aplicarFreteERastreio(oc.po_id)}
                        />
                      </div>

                      {/* Mudar Status em Massa */}
                      {isAdmin() && (
                        <MudarStatusForm
                          poId={oc.po_id}
                          numeroOC={oc.numero_oc}
                          totalItens={oc.items.length}
                          itensSelecionados={itensParaStatus[oc.po_id]}
                          statusAtual={status}
                          novoStatus={novoStatusMassa[oc.po_id]}
                          aplicando={aplicandoStatusMassa === oc.po_id}
                          onToggleAll={() => toggleAllItensParaStatus(oc.po_id, oc.items)}
                          onStatusChange={(value) => setNovoStatusMassa(prev => ({ ...prev, [oc.po_id]: value }))}
                          onAplicar={() => aplicarStatusEmMassa(oc.po_id, oc.numero_oc, oc.items.length)}
                        />
                      )}
                      </>
                    )}
                    {/* ======== FIM SEÇÃO PRONTO PARA ENVIO ======== */}

                    {/* Lista de Itens da OC */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                      {/* Lógica de agrupamento AUTOMÁTICO por código */}
                      {(() => {
                        // SEMPRE agrupa automaticamente itens por código na página Em Separação
                        if (status === 'em_separacao') {
                          const itensAgrupados = {};
                          oc.items.forEach(item => {
                            const codigo = item.codigo_item || 'sem_codigo';
                            if (!itensAgrupados[codigo]) {
                              itensAgrupados[codigo] = [];
                            }
                            itensAgrupados[codigo].push(item);
                          });
                          
                          return Object.entries(itensAgrupados).map(([codigo, itensDoGrupo]) => {
                            const quantidades = itensDoGrupo.map(i => i.quantidade || 1);
                            const quantidadeTotal = quantidades.reduce((sum, q) => sum + q, 0);
                            const temMultiplos = itensDoGrupo.length > 1;
                            // Formato "20+20+10" quando tem múltiplos itens
                            const quantidadeFormatada = temMultiplos ? quantidades.join('+') : quantidades[0];
                            
                            const todosComNF = itensDoGrupo.every(i => oc.itensComNFIndices?.has(i._itemIndexInPO));
                            const algumSelecionadoNF = itensDoGrupo.some(i => getItensSelecionados(oc.po_id).has(i._uniqueId));
                            const algumSelecionadoFrete = itensDoGrupo.some(i => itensParaFrete[oc.po_id]?.has(i._itemIndexInPO));
                            const algumSelecionadoStatus = itensDoGrupo.some(i => itensParaStatus[oc.po_id]?.has(i._itemIndexInPO));
                            
                            return (
                              <div 
                                key={codigo}
                                className="card"
                                style={{
                                  // Itens duplicados ficam LARANJA
                                  background: todosComNF ? '#dcfce7' : temMultiplos ? '#fff7ed' : algumSelecionadoNF ? '#f0fdf4' : algumSelecionadoFrete ? '#fef9c3' : algumSelecionadoStatus ? '#f3e8ff' : '#f8fafc',
                                  border: todosComNF ? '2px solid #16a34a' : temMultiplos ? '2px solid #f97316' : algumSelecionadoNF ? '2px solid #22c55e' : algumSelecionadoFrete ? '2px solid #f59e0b' : algumSelecionadoStatus ? '2px solid #8b5cf6' : '1px solid #e2e8f0'
                                }}
                                data-testid={`grupo-${codigo}`}
                              >
                                {/* Header do grupo */}
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: temMultiplos ? '1rem' : '0.5rem' }}>
                                  <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                                    {/* Badge só aparece quando há múltiplos itens */}
                                    {temMultiplos && (
                                      <div style={{
                                        background: '#f97316',
                                        color: 'white',
                                        padding: '0.5rem 1rem',
                                        borderRadius: '8px',
                                        fontWeight: '700'
                                      }}>
                                        {itensDoGrupo.length}x
                                      </div>
                                    )}
                                    <div>
                                      <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: '700' }}>
                                        Código: {codigo}
                                      </h3>
                                      <p style={{ margin: '0.25rem 0 0', fontSize: '0.85rem', color: '#6b7280' }}>
                                        {itensDoGrupo[0]?.descricao?.substring(0, 100)}{itensDoGrupo[0]?.descricao?.length > 100 ? '...' : ''}
                                      </p>
                                    </div>
                                  </div>
                                  <div style={{ textAlign: 'right' }}>
                                    {/* Quantidade no formato "20+20" em LARANJA quando tem múltiplos */}
                                    <div style={{ 
                                      fontSize: '1.1rem', 
                                      fontWeight: '700', 
                                      color: temMultiplos ? '#ea580c' : '#1f2937',
                                      background: temMultiplos ? '#ffedd5' : 'transparent',
                                      padding: temMultiplos ? '0.25rem 0.75rem' : '0',
                                      borderRadius: '6px',
                                      display: 'inline-block'
                                    }}>
                                      {temMultiplos ? `${quantidadeFormatada} = ${quantidadeTotal}` : quantidadeTotal} {itensDoGrupo[0]?.unidade || 'UN'}
                                    </div>
                                    {temMultiplos && (
                                      <div style={{ fontSize: '0.8rem', color: '#c2410c', marginTop: '0.25rem' }}>
                                        {itensDoGrupo.length} registros agrupados
                                      </div>
                                    )}
                                  </div>
                                </div>
                                
                                {/* Seleção em massa - só aparece quando há múltiplos itens */}
                                {temMultiplos && (
                                <div style={{ 
                                  display: 'flex', 
                                  gap: '1rem', 
                                  flexWrap: 'wrap',
                                  padding: '0.75rem',
                                  background: '#fed7aa',
                                  borderRadius: '6px',
                                  marginBottom: '1rem'
                                }}>
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      itensDoGrupo.forEach(item => {
                                        if (!getItensSelecionados(oc.po_id).has(item._uniqueId)) {
                                          toggleItemParaNFVenda(oc.po_id, item._uniqueId);
                                        }
                                      });
                                    }}
                                    style={{
                                      padding: '0.4rem 0.8rem',
                                      background: '#22c55e',
                                      color: 'white',
                                      border: 'none',
                                      borderRadius: '4px',
                                      cursor: 'pointer',
                                      fontSize: '0.8rem'
                                    }}
                                  >
                                    ✅ Selecionar Todos p/ NF
                                  </button>
                                  {isAdmin() && (
                                    <>
                                      <button
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          itensDoGrupo.forEach(item => {
                                            if (!itensParaFrete[oc.po_id]?.has(item._itemIndexInPO)) {
                                              toggleItemParaFrete(oc.po_id, item._itemIndexInPO);
                                            }
                                          });
                                        }}
                                        style={{
                                          padding: '0.4rem 0.8rem',
                                          background: '#f59e0b',
                                          color: 'white',
                                          border: 'none',
                                          borderRadius: '4px',
                                          cursor: 'pointer',
                                          fontSize: '0.8rem'
                                        }}
                                      >
                                        🚚 Selecionar Todos p/ Frete
                                      </button>
                                      <button
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          itensDoGrupo.forEach(item => {
                                            if (!itensParaStatus[oc.po_id]?.has(item._itemIndexInPO)) {
                                              toggleItemParaStatus(oc.po_id, item._itemIndexInPO);
                                            }
                                          });
                                        }}
                                        style={{
                                          padding: '0.4rem 0.8rem',
                                          background: '#8b5cf6',
                                          color: 'white',
                                          border: 'none',
                                          borderRadius: '4px',
                                          cursor: 'pointer',
                                          fontSize: '0.8rem'
                                        }}
                                      >
                                        🔄 Selecionar Todos p/ Status
                                      </button>
                                    </>
                                  )}
                                </div>
                                )}
                                
                                {/* Lista de itens do grupo */}
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                                  {itensDoGrupo.map((item, idx) => {
                                    const isSelectedForNF = getItensSelecionados(oc.po_id).has(item._uniqueId);
                                    const isSelectedForFrete = itensParaFrete[oc.po_id]?.has(item._itemIndexInPO) || false;
                                    const isSelectedForStatus = itensParaStatus[oc.po_id]?.has(item._itemIndexInPO) || false;
                                    const jaTemNF = oc.itensComNFIndices && oc.itensComNFIndices.has(item._itemIndexInPO);
                                    const isEditing = editingItem === item._uniqueId;
                                    
                                    // Se está editando, mostrar formulário completo
                                    if (isEditing) {
                                      return (
                                        <div 
                                          key={item._uniqueId}
                                          className="card"
                                          style={{
                                            background: '#f0f9ff',
                                            border: '2px solid #3b82f6',
                                            padding: '1rem'
                                          }}
                                        >
                                          <div style={{ marginBottom: '0.75rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                            <span style={{ fontWeight: '700', color: '#1e40af' }}>
                                              ✏️ Editando Item #{idx + 1} - {item.codigo_item}
                                            </span>
                                            <button
                                              onClick={cancelEdit}
                                              style={{
                                                background: '#ef4444',
                                                color: 'white',
                                                border: 'none',
                                                padding: '0.25rem 0.75rem',
                                                borderRadius: '4px',
                                                cursor: 'pointer',
                                                fontSize: '0.85rem'
                                              }}
                                            >
                                              ✕ Cancelar
                                            </button>
                                          </div>
                                          {renderEditForm(item)}
                                        </div>
                                      );
                                    }
                                    
                                    // Visualização COMPLETA do item
                                    return (
                                      <div 
                                        key={item._uniqueId}
                                        className="card"
                                        style={{
                                          padding: '1rem',
                                          background: jaTemNF ? '#dcfce7' : isSelectedForNF ? '#d1fae5' : 'white',
                                          borderRadius: '8px',
                                          border: jaTemNF ? '2px solid #16a34a' : isSelectedForNF ? '2px solid #22c55e' : '1px solid #e5e7eb'
                                        }}
                                      >
                                        {/* Header com checkboxes e badge */}
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.75rem' }}>
                                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                                            {/* Foto do item - tamanho maior com funcionalidades */}
                                            <ItemImage
                                              codigoItem={item.codigo_item}
                                              imagemUrl={imagensItens[item.codigo_item] ? `${API_URL}/itens/${item.codigo_item}/imagem?t=${imageCacheTimestamp}` : null}
                                              onUpload={async (file) => {
                                                const formData = new FormData();
                                                formData.append('file', file);
                                                try {
                                                  const response = await fetch(`${API_URL}/itens/${item.codigo_item}/imagem`, {
                                                    method: 'POST',
                                                    body: formData,
                                                    headers: {
                                                      'Authorization': `Bearer ${localStorage.getItem('token')}`
                                                    }
                                                  });
                                                  if (response.ok) {
                                                    setImagensItens(prev => ({ ...prev, [item.codigo_item]: true }));
                                                    setImageCacheTimestamp(Date.now());
                                                    alert('Imagem enviada com sucesso!');
                                                  }
                                                } catch (err) {
                                                  alert('Erro ao enviar imagem');
                                                }
                                              }}
                                              onDelete={async () => {
                                                if (window.confirm('Excluir imagem deste item?')) {
                                                  try {
                                                    const response = await fetch(`${API_URL}/itens/${item.codigo_item}/imagem`, {
                                                      method: 'DELETE',
                                                      headers: {
                                                        'Authorization': `Bearer ${localStorage.getItem('token')}`
                                                      }
                                                    });
                                                    if (response.ok) {
                                                      setImagensItens(prev => ({ ...prev, [item.codigo_item]: false }));
                                                      setImageCacheTimestamp(Date.now());
                                                      alert('Imagem removida!');
                                                    }
                                                  } catch (err) {
                                                    alert('Erro ao remover imagem');
                                                  }
                                                }
                                              }}
                                              canEdit={true}
                                              size="normal"
                                            />
                                            {/* Checkboxes com emojis */}
                                            <div style={{ display: 'flex', gap: '0.25rem', alignItems: 'center' }}>
                                              <label style={{ display: 'flex', alignItems: 'center', gap: '2px', cursor: 'pointer', padding: '0.2rem 0.4rem', background: isSelectedForNF ? '#dcfce7' : '#f3f4f6', borderRadius: '4px', fontSize: '0.75rem' }}>
                                                <input
                                                  type="checkbox"
                                                  checked={isSelectedForNF}
                                                  onChange={() => toggleItemParaNFVenda(oc.po_id, item._uniqueId)}
                                                  style={{ width: '14px', height: '14px', accentColor: '#22c55e' }}
                                                />
                                                📄
                                              </label>
                                              {isAdmin() && (
                                                <>
                                                  <label style={{ display: 'flex', alignItems: 'center', gap: '2px', cursor: 'pointer', padding: '0.2rem 0.4rem', background: isSelectedForFrete ? '#fef9c3' : '#f3f4f6', borderRadius: '4px', fontSize: '0.75rem' }}>
                                                    <input
                                                      type="checkbox"
                                                      checked={isSelectedForFrete}
                                                      onChange={() => toggleItemParaFrete(oc.po_id, item._itemIndexInPO)}
                                                      style={{ width: '14px', height: '14px', accentColor: '#f59e0b' }}
                                                    />
                                                    🚚
                                                  </label>
                                                  <label style={{ display: 'flex', alignItems: 'center', gap: '2px', cursor: 'pointer', padding: '0.2rem 0.4rem', background: isSelectedForStatus ? '#f3e8ff' : '#f3f4f6', borderRadius: '4px', fontSize: '0.75rem' }}>
                                                    <input
                                                      type="checkbox"
                                                      checked={isSelectedForStatus}
                                                      onChange={() => toggleItemParaStatus(oc.po_id, item._itemIndexInPO)}
                                                      style={{ width: '14px', height: '14px', accentColor: '#8b5cf6' }}
                                                    />
                                                    🔄
                                                  </label>
                                                </>
                                              )}
                                            </div>
                                            <span style={{ 
                                              background: '#667eea', 
                                              color: 'white', 
                                              padding: '0.25rem 0.75rem', 
                                              borderRadius: '12px', 
                                              fontSize: '0.85rem',
                                              fontWeight: '600'
                                            }}>
                                              Item #{idx + 1}
                                            </span>
                                            {jaTemNF && (
                                              <span style={{ 
                                                background: '#22c55e', 
                                                color: 'white', 
                                                padding: '0.25rem 0.75rem', 
                                                borderRadius: '12px', 
                                                fontSize: '0.75rem',
                                                fontWeight: '600'
                                              }}>
                                                ✓ NF OK
                                              </span>
                                            )}
                                          </div>
                                          <button
                                            onClick={() => startEdit(item)}
                                            className="btn btn-primary"
                                            style={{ padding: '0.4rem 0.8rem', fontSize: '0.85rem' }}
                                          >
                                            ✏️ Editar
                                          </button>
                                        </div>

                                        {/* Código e Descrição */}
                                        <div style={{ marginBottom: '0.75rem' }}>
                                          <div style={{ display: 'flex', gap: '1rem', alignItems: 'center', marginBottom: '0.25rem' }}>
                                            <span style={{ fontWeight: '700', fontSize: '1rem', color: '#1f2937' }}>
                                              Código: {item.codigo_item}
                                            </span>
                                            {item.ncm && (
                                              <span style={{ fontSize: '0.8rem', color: '#6b7280' }}>
                                                NCM: {item.ncm}
                                              </span>
                                            )}
                                          </div>
                                          <p style={{ margin: 0, fontSize: '0.9rem', color: '#4b5563' }}>
                                            {item.descricao}
                                          </p>
                                        </div>

                                        {/* Grid de informações */}
                                        <div style={{ 
                                          display: 'grid', 
                                          gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', 
                                          gap: '0.75rem',
                                          marginBottom: '0.75rem',
                                          padding: '0.75rem',
                                          background: '#f8fafc',
                                          borderRadius: '8px'
                                        }}>
                                          <div>
                                            <div style={{ fontSize: '0.75rem', color: '#6b7280', fontWeight: '600' }}>QUANTIDADE</div>
                                            <div style={{ fontSize: '1rem', fontWeight: '700', color: '#1f2937' }}>
                                              {item.quantidade || 1} {item.unidade || 'UN'}
                                            </div>
                                          </div>
                                          <div>
                                            <div style={{ fontSize: '0.75rem', color: '#6b7280', fontWeight: '600' }}>RESPONSÁVEL</div>
                                            <div style={{ fontSize: '0.9rem', fontWeight: '600', color: '#4338ca' }}>
                                              {item.responsavel || 'Não atribuído'}
                                            </div>
                                          </div>
                                          {item.preco > 0 && (
                                            <div>
                                              <div style={{ fontSize: '0.75rem', color: '#6b7280', fontWeight: '600' }}>VALOR COMPRA</div>
                                              <div style={{ fontSize: '1rem', fontWeight: '700', color: '#dc2626' }}>
                                                {formatBRL(item.preco)}
                                              </div>
                                            </div>
                                          )}
                                          {item.preco_venda > 0 && (
                                            <div>
                                              <div style={{ fontSize: '0.75rem', color: '#6b7280', fontWeight: '600' }}>VALOR VENDA</div>
                                              <div style={{ fontSize: '1rem', fontWeight: '700', color: '#059669' }}>
                                                {formatBRL(item.preco_venda)}
                                              </div>
                                            </div>
                                          )}
                                          {item.fornecedor && (
                                            <div>
                                              <div style={{ fontSize: '0.75rem', color: '#6b7280', fontWeight: '600' }}>FORNECEDOR</div>
                                              <div style={{ fontSize: '0.9rem', fontWeight: '600', color: '#0369a1' }}>
                                                {item.fornecedor}
                                              </div>
                                            </div>
                                          )}
                                        </div>

                                        {/* Observação (se houver) */}
                                        {item.observacao && (
                                          <div style={{ 
                                            padding: '0.75rem', 
                                            background: '#f0f9ff', 
                                            borderRadius: '8px', 
                                            border: '1px solid #bae6fd',
                                            marginBottom: '0.75rem'
                                          }}>
                                            <div style={{ fontSize: '0.75rem', color: '#0369a1', fontWeight: '600', marginBottom: '0.25rem' }}>
                                              💬 OBSERVAÇÃO
                                            </div>
                                            <div style={{ color: '#1e3a8a', fontSize: '0.9rem' }}>
                                              {item.observacao}
                                            </div>
                                          </div>
                                        )}

                                        {/* Seção de Gestão de NF */}
                                        {renderNFSection(item)}
                                      </div>
                                    );
                                  })}
                                </div>
                              </div>
                            );
                          });
                        }

                        // VISUALIZAÇÃO SIMPLIFICADA PARA PRONTO PARA ENVIO
                        if (status === 'pronto_envio') {
                          return oc.items.map((item) => {
                            const isSelectedForFrete = itensParaFrete[oc.po_id]?.has(item._itemIndexInPO) || false;
                            const isSelectedForStatus = itensParaStatus[oc.po_id]?.has(item._itemIndexInPO) || false;
                            
                            return (
                              <div 
                                key={item._uniqueId}
                                className="card"
                                style={{
                                  padding: '1rem',
                                  background: isSelectedForStatus ? '#f3e8ff' : isSelectedForFrete ? '#fef9c3' : 'white',
                                  borderRadius: '8px',
                                  border: isSelectedForStatus ? '2px solid #8b5cf6' : isSelectedForFrete ? '2px solid #f59e0b' : '1px solid #e5e7eb'
                                }}
                              >
                                <div style={{ display: 'flex', gap: '1rem', alignItems: 'flex-start' }}>
                                  {/* Foto do item - com funcionalidades */}
                                  <ItemImage
                                    codigoItem={item.codigo_item}
                                    imagemUrl={imagensItens[item.codigo_item] ? `${API_URL}/itens/${item.codigo_item}/imagem?t=${imageCacheTimestamp}` : null}
                                    onUpload={async (file) => {
                                      const formData = new FormData();
                                      formData.append('file', file);
                                      try {
                                        const response = await fetch(`${API_URL}/itens/${item.codigo_item}/imagem`, {
                                          method: 'POST',
                                          body: formData,
                                          headers: {
                                            'Authorization': `Bearer ${localStorage.getItem('token')}`
                                          }
                                        });
                                        if (response.ok) {
                                          setImagensItens(prev => ({ ...prev, [item.codigo_item]: true }));
                                          setImageCacheTimestamp(Date.now());
                                        }
                                      } catch (err) {
                                        console.error('Erro ao enviar imagem', err);
                                      }
                                    }}
                                    onDelete={async () => {
                                      if (window.confirm('Excluir imagem deste item?')) {
                                        try {
                                          const response = await fetch(`${API_URL}/itens/${item.codigo_item}/imagem`, {
                                            method: 'DELETE',
                                            headers: {
                                              'Authorization': `Bearer ${localStorage.getItem('token')}`
                                            }
                                          });
                                          if (response.ok) {
                                            setImagensItens(prev => ({ ...prev, [item.codigo_item]: false }));
                                            setImageCacheTimestamp(Date.now());
                                          }
                                        } catch (err) {
                                          console.error('Erro ao remover imagem', err);
                                        }
                                      }
                                    }}
                                    canEdit={true}
                                    size="normal"
                                  />
                                  
                                  {/* Informações do item */}
                                  <div style={{ flex: 1 }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.5rem' }}>
                                      <div>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                          <span style={{ fontWeight: '700', fontSize: '1rem', color: '#1f2937' }}>
                                            {item.codigo_item}
                                          </span>
                                          <span style={{ 
                                            background: '#14b8a6', 
                                            color: 'white', 
                                            padding: '0.15rem 0.5rem', 
                                            borderRadius: '10px', 
                                            fontSize: '0.7rem',
                                            fontWeight: '600'
                                          }}>
                                            {item.quantidade || 1} {item.unidade || 'UN'}
                                          </span>
                                        </div>
                                        <p style={{ margin: '0.25rem 0 0', fontSize: '0.85rem', color: '#6b7280' }}>
                                          {item.descricao?.substring(0, 80)}{item.descricao?.length > 80 ? '...' : ''}
                                        </p>
                                      </div>
                                      
                                      {/* Checkboxes com emojis */}
                                      <div style={{ display: 'flex', gap: '0.25rem' }}>
                                        <label style={{ display: 'flex', alignItems: 'center', gap: '2px', cursor: 'pointer', padding: '0.2rem 0.4rem', background: isSelectedForFrete ? '#fef9c3' : '#f3f4f6', borderRadius: '4px', fontSize: '0.75rem' }}>
                                          <input
                                            type="checkbox"
                                            checked={isSelectedForFrete}
                                            onChange={() => toggleItemParaFrete(oc.po_id, item._itemIndexInPO)}
                                            style={{ width: '14px', height: '14px', accentColor: '#f59e0b' }}
                                          />
                                          🚚
                                        </label>
                                        <label style={{ display: 'flex', alignItems: 'center', gap: '2px', cursor: 'pointer', padding: '0.2rem 0.4rem', background: isSelectedForStatus ? '#f3e8ff' : '#f3f4f6', borderRadius: '4px', fontSize: '0.75rem' }}>
                                          <input
                                            type="checkbox"
                                            checked={isSelectedForStatus}
                                            onChange={() => toggleItemParaStatus(oc.po_id, item._itemIndexInPO)}
                                            style={{ width: '14px', height: '14px', accentColor: '#8b5cf6' }}
                                          />
                                          🔄
                                        </label>
                                      </div>
                                    </div>
                                    
                                    {/* Info de frete e rastreio */}
                                    <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', fontSize: '0.8rem' }}>
                                      {item.frete_envio > 0 && (
                                        <span style={{ color: '#f59e0b', fontWeight: '600' }}>
                                          🚚 Frete: {formatBRL(item.frete_envio)}
                                        </span>
                                      )}
                                      {item.codigo_rastreio && (
                                        <span style={{ color: '#3b82f6', fontWeight: '600' }}>
                                          📦 {item.codigo_rastreio}
                                        </span>
                                      )}
                                    </div>
                                  </div>
                                </div>
                              </div>
                            );
                          });
                        }
                        
                        // Visualização normal para EM TRÂNSITO (não agrupa)
                        return oc.items.map((item) => {
                        const isSelectedForRastreio = itensParaRastreio[oc.po_id]?.has(item._itemIndexInPO) || false;
                        
                        // VISUALIZAÇÃO SIMPLIFICADA PARA EM TRÂNSITO
                        return (
                          <RastreioItemCard
                            key={item._uniqueId}
                            item={item}
                            isSelected={isSelectedForRastreio}
                            onToggleSelect={() => toggleItemParaRastreio(oc.po_id, item._itemIndexInPO)}
                            onMudarStatus={mudarStatusItemManual}
                            isAdmin={isAdmin()}
                            formatBRL={formatBRL}
                          />
                        );
                      });
                      })()}
                    </div>
                  </div>
                )}
              </div>
            ))}
            
            {/* Paginação no final */}
            {totalPagesEmSeparacao > 1 && (
              <div style={{ display: 'flex', justifyContent: 'center', gap: '0.5rem', alignItems: 'center', marginTop: '1rem', paddingTop: '1rem', borderTop: '1px solid #e2e8f0' }}>
                <button
                  onClick={() => setEmSeparacaoPage(p => Math.max(1, p - 1))}
                  disabled={emSeparacaoPage === 1}
                  style={{
                    padding: '0.5rem 1rem',
                    border: '1px solid #e2e8f0',
                    borderRadius: '6px',
                    background: emSeparacaoPage === 1 ? '#f3f4f6' : 'white',
                    cursor: emSeparacaoPage === 1 ? 'not-allowed' : 'pointer',
                    opacity: emSeparacaoPage === 1 ? 0.5 : 1
                  }}
                >
                  ← Anterior
                </button>
                <span style={{ padding: '0 1rem', fontWeight: '600' }}>
                  Página {emSeparacaoPage} de {totalPagesEmSeparacao}
                </span>
                <button
                  onClick={() => setEmSeparacaoPage(p => Math.min(totalPagesEmSeparacao, p + 1))}
                  disabled={emSeparacaoPage === totalPagesEmSeparacao}
                  style={{
                    padding: '0.5rem 1rem',
                    border: '1px solid #e2e8f0',
                    borderRadius: '6px',
                    background: emSeparacaoPage === totalPagesEmSeparacao ? '#f3f4f6' : 'white',
                    cursor: emSeparacaoPage === totalPagesEmSeparacao ? 'not-allowed' : 'pointer',
                    opacity: emSeparacaoPage === totalPagesEmSeparacao ? 0.5 : 1
                  }}
                >
                  Próximo →
                </button>
              </div>
            )}
          </div>
        ) : (status === 'pendente' || status === 'cotado') && viewMode === 'grouped' ? (
          /* ============ VISUALIZAÇÃO AGRUPADA POR CÓDIGO (pendentes e cotados) ============ */
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            {itemsGroupedByCode.map((group) => {
              const isExpanded = expandedGroups.has(group.codigo_item);
              // Priorizar limites do contrato FIEP, fallback para total do banco
              const totalPlanilha = limitesContrato[group.codigo_item] || totalPlanilhaReal[group.codigo_item] || 0;
              const usandoLimiteContrato = !!limitesContrato[group.codigo_item];
              
              return (
                <div 
                  key={group.codigo_item} 
                  className="card" 
                  style={{ 
                    background: group.items.length > 1 ? '#fef3c7' : '#f7fafc', 
                    border: group.items.length > 1 ? '2px solid #f59e0b' : '1px solid #e2e8f0',
                    overflow: 'hidden'
                  }} 
                  data-testid={`grouped-card-${group.codigo_item}`}
                >
                  {/* Header do Grupo */}
                  <div 
                    onClick={() => {
                      const newExpanded = new Set(expandedGroups);
                      if (isExpanded) {
                        newExpanded.delete(group.codigo_item);
                      } else {
                        newExpanded.add(group.codigo_item);
                      }
                      setExpandedGroups(newExpanded);
                    }}
                    style={{ 
                      cursor: 'pointer',
                      padding: '1rem',
                      background: group.items.length > 1 ? 'linear-gradient(135deg, #fef3c7 0%, #fde68a 100%)' : 'transparent'
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start' }}>
                      <div style={{ flex: 1 }}>
                        <div style={{ display: 'flex', gap: '1rem', alignItems: 'center', marginBottom: '0.5rem', flexWrap: 'wrap' }}>
                          <h3 style={{ fontSize: '1.2rem', fontWeight: '700', margin: 0 }}>
                            📦 {group.codigo_item}
                          </h3>
                          
                          {/* Badge de múltiplas OCs */}
                          {group.items.length > 1 && (
                            <span style={{
                              background: '#f59e0b',
                              color: 'white',
                              padding: '0.25rem 0.75rem',
                              borderRadius: '20px',
                              fontSize: '0.85rem',
                              fontWeight: '700'
                            }}>
                              🔥 {group.items.length} OCs
                            </span>
                          )}
                          
                          {/* Total de quantidade */}
                          <span style={{
                            background: '#3b82f6',
                            color: 'white',
                            padding: '0.25rem 0.75rem',
                            borderRadius: '20px',
                            fontSize: '0.85rem',
                            fontWeight: '600'
                          }}>
                            Total: {group.total_quantidade} {group.unidade}
                          </span>
                          
                          {/* Total na planilha (sempre mostrar) */}
                          <span style={{
                            background: usandoLimiteContrato ? '#7c3aed' : '#8b5cf6',
                            color: 'white',
                            padding: '0.25rem 0.75rem',
                            borderRadius: '20px',
                            fontSize: '0.85rem',
                            fontWeight: '600'
                          }}
                          title={usandoLimiteContrato 
                            ? "Quantidade máxima do contrato FIEP (importada da planilha)" 
                            : "Quantidade total deste item em todas as OCs do sistema"}
                          >
                            📊 {usandoLimiteContrato ? 'Contrato' : 'Planilha'}: {totalPlanilha} {group.unidade}
                          </span>
                          
                          {/* Estoque disponível */}
                          {group.estoqueDisponivel > 0 && (
                            <span style={{
                              background: '#10b981',
                              color: 'white',
                              padding: '0.25rem 0.75rem',
                              borderRadius: '20px',
                              fontSize: '0.85rem',
                              fontWeight: '600'
                            }}>
                              📦 Estoque: {group.estoqueDisponivel}
                            </span>
                          )}
                          
                          {/* Miniatura da imagem */}
                          {group.imagem_url ? (
                            <div 
                              onClick={(e) => {
                                e.stopPropagation();
                                setImagemExpandida(`${BACKEND_URL}${group.imagem_url}?t=${imageCacheTimestamp}`);
                              }}
                              style={{ 
                                width: '80px', 
                                height: '80px', 
                                borderRadius: '8px',
                                overflow: 'hidden',
                                cursor: 'pointer',
                                border: '2px solid #22c55e',
                                boxShadow: '0 2px 6px rgba(0,0,0,0.15)',
                                flexShrink: 0
                              }}
                            >
                              <img 
                                src={`${BACKEND_URL}${group.imagem_url}?t=${imageCacheTimestamp}`} 
                                alt={`Imagem ${group.codigo_item}`}
                                style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                                onError={(e) => {
                                  e.target.style.display = 'none';
                                  e.target.parentElement.innerHTML = '<span style="font-size: 1.5rem; color: #ef4444;">⚠️</span>';
                                }}
                              />
                            </div>
                          ) : (
                            <div 
                              onClick={(e) => {
                                e.stopPropagation();
                                // Abrir seletor de arquivo para o primeiro item do grupo
                                const firstItem = group.items[0];
                                if (firstItem) {
                                  const inputId = `img-input-group-${group.codigo_item}`;
                                  document.getElementById(inputId)?.click();
                                }
                              }}
                              style={{ 
                                width: '80px', 
                                height: '80px', 
                                borderRadius: '8px',
                                border: '2px dashed #cbd5e1',
                                background: '#f8fafc',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                flexShrink: 0,
                                cursor: 'pointer',
                                transition: 'all 0.2s'
                              }}
                              onMouseEnter={(e) => e.target.style.borderColor = '#3b82f6'}
                              onMouseLeave={(e) => e.target.style.borderColor = '#cbd5e1'}
                            >
                              <span style={{ fontSize: '2rem', color: '#94a3b8' }}>📷</span>
                            </div>
                          )}
                          {/* Input file escondido para upload no grupo */}
                          <input
                            id={`img-input-group-${group.codigo_item}`}
                            type="file"
                            accept="image/jpeg,image/png,image/webp,image/gif"
                            onChange={(e) => {
                              const firstItem = group.items[0];
                              if (firstItem && e.target.files[0]) {
                                // Passar todos os itens do grupo para propagar a imagem
                                handleImageUpload(firstItem, e.target.files[0], group.items);
                              }
                            }}
                            style={{ display: 'none' }}
                          />
                        </div>
                        
                        <p style={{ color: '#4a5568', marginBottom: '0.5rem', fontSize: '0.9rem', lineHeight: '1.4' }}>
                          {group.descricao}
                        </p>
                        
                        {/* Marca/Modelo */}
                        {group.marca_modelo && (
                          <p style={{ color: '#6b7280', marginBottom: '0.5rem', fontSize: '0.85rem' }}>
                            🏷️ <strong>Marca/Modelo:</strong> {group.marca_modelo}
                          </p>
                        )}
                        
                        {/* Lista resumida das OCs */}
                        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                          {group.items.map((item, idx) => (
                            <span key={idx} style={{
                              background: 'white',
                              padding: '0.25rem 0.5rem',
                              borderRadius: '6px',
                              fontSize: '0.8rem',
                              border: '1px solid #e5e7eb'
                            }}>
                              <strong>{item.numero_oc}</strong>: {item.quantidade} {item.unidade}
                              {item.responsavel && <span style={{ color: '#6b7280' }}> ({item.responsavel})</span>}
                            </span>
                          ))}
                        </div>
                      </div>
                      
                      <button style={{
                        background: 'transparent',
                        border: 'none',
                        fontSize: '1.5rem',
                        cursor: 'pointer',
                        padding: '0.5rem'
                      }}>
                        {isExpanded ? '▲' : '▼'}
                      </button>
                    </div>
                  </div>
                  
                  {/* Itens expandidos */}
                  {isExpanded && (
                    <div style={{ 
                      padding: '1rem', 
                      borderTop: '1px solid #e5e7eb',
                      background: 'white'
                    }}>
                      {/* Barra de ações do grupo */}
                      <div style={{ 
                        display: 'flex', 
                        justifyContent: 'space-between', 
                        alignItems: 'center',
                        marginBottom: '1rem',
                        padding: '0.75rem',
                        background: '#f0f9ff',
                        borderRadius: '8px'
                      }}>
                        <h4 style={{ margin: 0, color: '#4b5563' }}>
                          Detalhes por OC ({group.items.length} itens)
                        </h4>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            startGroupEdit(group.codigo_item, 'all');
                          }}
                          style={{
                            padding: '0.5rem 1rem',
                            background: status === 'cotado' ? '#3b82f6' : '#22c55e',
                            color: 'white',
                            border: 'none',
                            borderRadius: '8px',
                            fontWeight: '600',
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '0.5rem'
                          }}
                        >
                          {status === 'cotado' ? '🛒' : '🚀'} {status === 'cotado' ? 'Comprar Todos' : 'Cotar Todos'} ({group.total_quantidade} {group.unidade})
                        </button>
                      </div>
                      
                      {/* Formulário de edição em grupo (Cotar Todos / Comprar Todos) */}
                      {editingGroupCode === group.codigo_item && groupEditMode === 'all' && (
                        <div style={{ 
                          padding: '1rem', 
                          background: status === 'cotado' ? '#eff6ff' : '#ecfdf5', 
                          borderRadius: '8px',
                          marginBottom: '1rem',
                          border: status === 'cotado' ? '2px solid #3b82f6' : '2px solid #22c55e'
                        }}>
                          <h5 style={{ margin: '0 0 0.75rem 0', color: status === 'cotado' ? '#1e40af' : '#166534' }}>
                            {status === 'cotado' ? '🛒 Comprar Todos' : '✅ Cotar Todos'} - {group.items.length} itens ({group.total_quantidade} {group.unidade})
                          </h5>
                          <p style={{ fontSize: '0.85rem', color: '#4b5563', marginBottom: '1rem' }}>
                            Os dados abaixo serão aplicados a TODOS os itens deste grupo{status === 'cotado' ? ' e o status será alterado para COMPRADO' : ''}:
                          </p>
                          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '1rem', marginBottom: '1rem' }}>
                            <div>
                              <label style={{ fontSize: '0.85rem', fontWeight: '600', color: '#374151' }}>Preço Unitário (R$)</label>
                              <input
                                type="number"
                                step="0.01"
                                value={groupFormData.preco_unitario}
                                onChange={(e) => setGroupFormData({...groupFormData, preco_unitario: e.target.value})}
                                onClick={(e) => e.stopPropagation()}
                                style={{ width: '100%', padding: '0.5rem', borderRadius: '6px', border: '1px solid #d1d5db' }}
                                placeholder="0,00"
                              />
                            </div>
                            <div>
                              <label style={{ fontSize: '0.85rem', fontWeight: '600', color: '#374151' }}>Frete (R$)</label>
                              <input
                                type="number"
                                step="0.01"
                                value={groupFormData.frete}
                                onChange={(e) => setGroupFormData({...groupFormData, frete: e.target.value})}
                                onClick={(e) => e.stopPropagation()}
                                style={{ width: '100%', padding: '0.5rem', borderRadius: '6px', border: '1px solid #d1d5db' }}
                                placeholder="0,00"
                              />
                            </div>
                            <div>
                              <label style={{ fontSize: '0.85rem', fontWeight: '600', color: '#374151' }}>Fornecedor</label>
                              <input
                                type="text"
                                value={groupFormData.fornecedor}
                                onChange={(e) => setGroupFormData({...groupFormData, fornecedor: e.target.value})}
                                onClick={(e) => e.stopPropagation()}
                                style={{ width: '100%', padding: '0.5rem', borderRadius: '6px', border: '1px solid #d1d5db' }}
                                placeholder="Nome do fornecedor"
                              />
                            </div>
                            <div>
                              <label style={{ fontSize: '0.85rem', fontWeight: '600', color: '#374151' }}>Link</label>
                              <input
                                type="text"
                                value={groupFormData.link}
                                onChange={(e) => setGroupFormData({...groupFormData, link: e.target.value})}
                                onClick={(e) => e.stopPropagation()}
                                style={{ width: '100%', padding: '0.5rem', borderRadius: '6px', border: '1px solid #d1d5db' }}
                                placeholder="URL do produto"
                              />
                            </div>
                          </div>
                          <div style={{ display: 'flex', gap: '0.5rem' }}>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                saveGroupEdit(group.items);
                              }}
                              style={{
                                padding: '0.5rem 1rem',
                                background: '#22c55e',
                                color: 'white',
                                border: 'none',
                                borderRadius: '6px',
                                fontWeight: '600',
                                cursor: 'pointer'
                              }}
                            >
                              ✅ Salvar Todos
                            </button>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                cancelGroupEdit();
                              }}
                              style={{
                                padding: '0.5rem 1rem',
                                background: '#f3f4f6',
                                color: '#4b5563',
                                border: '1px solid #d1d5db',
                                borderRadius: '6px',
                                cursor: 'pointer'
                              }}
                            >
                              Cancelar
                            </button>
                          </div>
                        </div>
                      )}
                      
                      {/* Lista de itens individuais */}
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                        {group.items.map((item, idx) => (
                          <div key={idx} style={{
                            padding: '0.75rem',
                            background: editingGroupItem === item._uniqueId ? '#fef3c7' : '#f9fafb',
                            borderRadius: '8px',
                            border: editingGroupItem === item._uniqueId ? '2px solid #f59e0b' : '1px solid #e5e7eb'
                          }}>
                            {/* Header do item */}
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                              <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', flexWrap: 'wrap' }}>
                                <Link 
                                  to={`/po/${item.po_id}`} 
                                  style={{ fontWeight: '600', color: '#667eea' }}
                                  onClick={(e) => e.stopPropagation()}
                                >
                                  {item.numero_oc}
                                </Link>
                                <span style={{ 
                                  background: '#e0e7ff', 
                                  padding: '0.15rem 0.5rem', 
                                  borderRadius: '4px',
                                  fontSize: '0.85rem'
                                }}>
                                  {item.quantidade} {item.unidade}
                                </span>
                                {item.responsavel && (
                                  <span style={{ color: '#6b7280', fontSize: '0.85rem' }}>
                                    👤 {item.responsavel}
                                  </span>
                                )}
                                {item.lote && (
                                  <span style={{ color: '#6b7280', fontSize: '0.85rem' }}>
                                    📍 Lote {item.lote}
                                  </span>
                                )}
                              </div>
                              
                              {/* Botão Editar Individual */}
                              {editingGroupItem !== item._uniqueId && (
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    startGroupEdit(group.codigo_item, 'individual', item);
                                  }}
                                  style={{
                                    padding: '0.4rem 0.8rem',
                                    background: status === 'cotado' ? '#3b82f6' : '#667eea',
                                    color: 'white',
                                    border: 'none',
                                    borderRadius: '6px',
                                    fontSize: '0.8rem',
                                    cursor: 'pointer'
                                  }}
                                >
                                  {status === 'cotado' ? '🛒 Comprar' : '✏️ Cotar'}
                                </button>
                              )}
                            </div>
                            
                            {/* Formulário de edição individual */}
                            {editingGroupItem === item._uniqueId && (
                              <div style={{ 
                                marginTop: '0.75rem',
                                padding: '0.75rem',
                                background: 'white',
                                borderRadius: '6px',
                                border: '1px solid #fcd34d'
                              }}>
                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '0.75rem', marginBottom: '0.75rem' }}>
                                  <div>
                                    <label style={{ fontSize: '0.75rem', fontWeight: '600', color: '#374151' }}>Preço Unit.</label>
                                    <input
                                      type="number"
                                      step="0.01"
                                      value={groupFormData.preco_unitario}
                                      onChange={(e) => setGroupFormData({...groupFormData, preco_unitario: e.target.value})}
                                      onClick={(e) => e.stopPropagation()}
                                      style={{ width: '100%', padding: '0.4rem', borderRadius: '4px', border: '1px solid #d1d5db', fontSize: '0.85rem' }}
                                      placeholder="0,00"
                                    />
                                  </div>
                                  <div>
                                    <label style={{ fontSize: '0.75rem', fontWeight: '600', color: '#374151' }}>Frete</label>
                                    <input
                                      type="number"
                                      step="0.01"
                                      value={groupFormData.frete}
                                      onChange={(e) => setGroupFormData({...groupFormData, frete: e.target.value})}
                                      onClick={(e) => e.stopPropagation()}
                                      style={{ width: '100%', padding: '0.4rem', borderRadius: '4px', border: '1px solid #d1d5db', fontSize: '0.85rem' }}
                                      placeholder="0,00"
                                    />
                                  </div>
                                  <div>
                                    <label style={{ fontSize: '0.75rem', fontWeight: '600', color: '#374151' }}>Fornecedor</label>
                                    <input
                                      type="text"
                                      value={groupFormData.fornecedor}
                                      onChange={(e) => setGroupFormData({...groupFormData, fornecedor: e.target.value})}
                                      onClick={(e) => e.stopPropagation()}
                                      style={{ width: '100%', padding: '0.4rem', borderRadius: '4px', border: '1px solid #d1d5db', fontSize: '0.85rem' }}
                                      placeholder="Fornecedor"
                                    />
                                  </div>
                                  <div>
                                    <label style={{ fontSize: '0.75rem', fontWeight: '600', color: '#374151' }}>Link</label>
                                    <input
                                      type="text"
                                      value={groupFormData.link}
                                      onChange={(e) => setGroupFormData({...groupFormData, link: e.target.value})}
                                      onClick={(e) => e.stopPropagation()}
                                      style={{ width: '100%', padding: '0.4rem', borderRadius: '4px', border: '1px solid #d1d5db', fontSize: '0.85rem' }}
                                      placeholder="URL"
                                    />
                                  </div>
                                </div>
                                
                                {/* Campo de quantidade para compra parcial (só no status cotado) */}
                                {status === 'cotado' && (
                                  <div style={{ 
                                    marginBottom: '0.75rem', 
                                    padding: '0.75rem', 
                                    background: '#fef3c7', 
                                    borderRadius: '6px',
                                    border: '1px solid #fcd34d'
                                  }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
                                      <span style={{ fontSize: '0.85rem', fontWeight: '600', color: '#92400e' }}>
                                        📦 Quantidade a comprar:
                                      </span>
                                      <input
                                        type="number"
                                        min="1"
                                        max={item.quantidade}
                                        value={groupFormData.quantidade_comprar}
                                        onChange={(e) => setGroupFormData({...groupFormData, quantidade_comprar: e.target.value})}
                                        onClick={(e) => e.stopPropagation()}
                                        style={{ 
                                          width: '80px', 
                                          padding: '0.4rem', 
                                          borderRadius: '4px', 
                                          border: '2px solid #f59e0b', 
                                          fontSize: '0.9rem',
                                          fontWeight: '600',
                                          textAlign: 'center'
                                        }}
                                      />
                                      <span style={{ fontSize: '0.85rem', color: '#78350f' }}>
                                        de {item.quantidade} {item.unidade || 'UN'}
                                      </span>
                                      {parseInt(groupFormData.quantidade_comprar) < item.quantidade && parseInt(groupFormData.quantidade_comprar) > 0 && (
                                        <span style={{ 
                                          fontSize: '0.75rem', 
                                          background: '#3b82f6', 
                                          color: 'white', 
                                          padding: '0.2rem 0.5rem', 
                                          borderRadius: '4px' 
                                        }}>
                                          → {item.quantidade - parseInt(groupFormData.quantidade_comprar)} ficam em Cotados
                                        </span>
                                      )}
                                    </div>
                                  </div>
                                )}
                                
                                <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                                  {/* Botão de compra - muda comportamento baseado na quantidade */}
                                  {status === 'cotado' ? (
                                    <>
                                      <button
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          const qtdComprar = parseInt(groupFormData.quantidade_comprar) || 0;
                                          if (qtdComprar < item.quantidade && qtdComprar > 0) {
                                            // Compra parcial
                                            compraParcial(item);
                                          } else {
                                            // Compra total
                                            saveGroupEdit([item]);
                                          }
                                        }}
                                        style={{
                                          padding: '0.4rem 0.8rem',
                                          background: parseInt(groupFormData.quantidade_comprar) < item.quantidade && parseInt(groupFormData.quantidade_comprar) > 0 ? '#f59e0b' : '#22c55e',
                                          color: 'white',
                                          border: 'none',
                                          borderRadius: '4px',
                                          fontSize: '0.8rem',
                                          cursor: 'pointer',
                                          fontWeight: '600'
                                        }}
                                      >
                                        {parseInt(groupFormData.quantidade_comprar) < item.quantidade && parseInt(groupFormData.quantidade_comprar) > 0 
                                          ? `🛒 Comprar ${groupFormData.quantidade_comprar} (Parcial)` 
                                          : `✅ Comprar Todos (${item.quantidade})`}
                                      </button>
                                    </>
                                  ) : (
                                    <button
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        saveGroupEdit([item]);
                                      }}
                                      style={{
                                        padding: '0.4rem 0.8rem',
                                        background: '#22c55e',
                                        color: 'white',
                                        border: 'none',
                                        borderRadius: '4px',
                                        fontSize: '0.8rem',
                                        cursor: 'pointer'
                                      }}
                                    >
                                      ✅ Salvar
                                    </button>
                                  )}
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      cancelGroupEdit();
                                    }}
                                    style={{
                                      padding: '0.4rem 0.8rem',
                                      background: '#f3f4f6',
                                      color: '#4b5563',
                                      border: '1px solid #d1d5db',
                                      borderRadius: '4px',
                                      fontSize: '0.8rem',
                                      cursor: 'pointer'
                                    }}
                                  >
                                    Cancelar
                                  </button>
                                </div>
                              </div>
                            )}
                            
                            {/* Informações adicionais: marca/modelo e endereço */}
                            {!editingGroupItem && (
                              <div style={{ marginTop: '0.5rem' }}>
                                {/* Marca/Modelo */}
                                {item.marca_modelo && (
                                  <div style={{ 
                                    fontSize: '0.8rem', 
                                    color: '#6b7280',
                                    marginBottom: '0.25rem'
                                  }}>
                                    🏷️ {item.marca_modelo}
                                  </div>
                                )}
                                
                                {/* Endereço de entrega */}
                                {item.endereco_entrega_oc && (
                                  <div style={{ 
                                    fontSize: '0.8rem', 
                                    color: '#4b5563',
                                    background: '#f0f9ff',
                                    padding: '0.25rem 0.5rem',
                                    borderRadius: '4px'
                                  }}>
                                    📍 {item.endereco_entrega_oc}
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
            
            {/* Info quando não há itens agrupáveis */}
            {itemsGroupedByCode.length === 0 && (
              <div className="card" style={{ textAlign: 'center', padding: '2rem' }}>
                <p style={{ color: '#6b7280' }}>Nenhum item para agrupar</p>
              </div>
            )}
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
                    <div style={{ display: 'flex', gap: '1rem', alignItems: 'center', marginBottom: '0.5rem', flexWrap: 'wrap' }}>
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
                      {/* Data de Entrega com contagem regressiva */}
                      {item.data_entrega && <DataEntregaBadge dataEntrega={item.data_entrega} compact={true} todosEntregues={status === 'entregue'} />}
                      
                      {/* Indicador de Estoque Disponível + Botão Usar (só para pendentes e cotados) */}
                      {(status === 'pendente' || status === 'cotado') && estoqueDisponivel[item.codigo_item] > 0 && (
                        <button
                          onClick={() => abrirModalUsarEstoque(item)}
                          style={{
                            background: '#10b981',
                            color: 'white',
                            padding: '0.25rem 0.6rem',
                            borderRadius: '12px',
                            fontSize: '0.75rem',
                            fontWeight: '700',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '0.25rem',
                            boxShadow: '0 1px 3px rgba(16, 185, 129, 0.3)',
                            border: 'none',
                            cursor: 'pointer',
                            transition: 'all 0.2s'
                          }}
                          onMouseEnter={(e) => e.target.style.background = '#059669'}
                          onMouseLeave={(e) => e.target.style.background = '#10b981'}
                          data-testid={`usar-estoque-btn-${item.codigo_item}`}
                        >
                          📦 {estoqueDisponivel[item.codigo_item]} em estoque • Usar
                        </button>
                      )}
                      
                      {/* Total na Planilha (para pendentes e cotados) */}
                      {(status === 'pendente' || status === 'cotado') && (limitesContrato[item.codigo_item] || totalPlanilhaReal[item.codigo_item]) && (
                        <span 
                          style={{
                            background: limitesContrato[item.codigo_item] ? '#7c3aed' : '#8b5cf6',
                            color: 'white',
                            padding: '0.25rem 0.6rem',
                            borderRadius: '12px',
                            fontSize: '0.75rem',
                            fontWeight: '600',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '0.25rem'
                          }}
                          title={limitesContrato[item.codigo_item] 
                            ? `Quantidade máxima do contrato FIEP (importada da planilha)` 
                            : `Quantidade total deste item em TODAS as OCs do sistema (todos os status)`}
                          data-testid={`total-planilha-${item.codigo_item}`}
                        >
                          📊 {limitesContrato[item.codigo_item] ? 'Contrato' : 'Total Planilha'}: {limitesContrato[item.codigo_item] || totalPlanilhaReal[item.codigo_item]} {item.unidade || 'UN'}
                        </span>
                      )}
                      
                      {/* Mostrar se foi parcialmente atendido pelo estoque */}
                      {item.parcialmente_atendido_estoque && (
                        <span style={{
                          background: '#fef3c7',
                          color: '#92400e',
                          padding: '0.25rem 0.6rem',
                          borderRadius: '12px',
                          fontSize: '0.75rem',
                          fontWeight: '600',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '0.25rem',
                          border: '1px solid #f59e0b'
                        }}>
                          ⚠️ Parcialmente atendido ({item.quantidade_do_estoque || 0} do estoque, faltam {item.quantidade_faltante || 0})
                        </span>
                      )}
                    </div>
                    <p style={{ color: '#4a5568', marginBottom: '0.5rem' }}>{item.descricao}</p>
                    
                    {/* Endereço de Entrega da OC */}
                    {item.endereco_entrega_oc && (
                      <div style={{ 
                        display: 'flex', 
                        alignItems: 'flex-start', 
                        gap: '0.5rem', 
                        marginBottom: '0.5rem',
                        fontSize: '0.85rem',
                        background: '#f0f9ff',
                        padding: '0.4rem 0.6rem',
                        borderRadius: '6px',
                        border: '1px solid #bae6fd'
                      }}>
                        <span style={{ color: '#0369a1', fontWeight: '600' }}>📍</span>
                        <span style={{ color: '#0c4a6e' }}>{item.endereco_entrega_oc}</span>
                      </div>
                    )}
                    
                    {/* Data da Compra (aparece para itens comprados ou adiante) */}
                    {item.data_compra && ['comprado', 'em_separacao', 'em_transito', 'entregue'].includes(status) && (
                      <div style={{ 
                        display: 'inline-flex', 
                        alignItems: 'center', 
                        gap: '0.5rem', 
                        marginBottom: '0.5rem',
                        fontSize: '0.85rem',
                        background: '#dcfce7',
                        padding: '0.4rem 0.6rem',
                        borderRadius: '6px',
                        border: '1px solid #86efac'
                      }}>
                        <span style={{ color: '#166534', fontWeight: '600' }}>🛒</span>
                        <span style={{ color: '#166534', fontWeight: '600' }}>
                          Data da Compra: {(() => {
                            try {
                              // Tenta parsear diferentes formatos
                              const dataStr = item.data_compra;
                              let data;
                              if (dataStr.includes('T')) {
                                // Formato ISO
                                data = new Date(dataStr);
                              } else {
                                // Formato YYYY-MM-DD
                                data = new Date(dataStr + 'T00:00:00');
                              }
                              return data.toLocaleDateString('pt-BR');
                            } catch {
                              return item.data_compra;
                            }
                          })()}
                        </span>
                      </div>
                    )}
                    
                    <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', fontSize: '0.9rem', color: '#718096' }}>
                      <span><strong>Responsável:</strong> <strong style={{ color: '#667eea' }}>{item.responsavel}</strong></span>
                      <span><strong>Quantidade:</strong> {item.quantidade} {item.unidade}</span>
                      <span><strong>Lote:</strong> {item.lote}</span>
                      {item.marca_modelo && <span><strong>Marca/Modelo:</strong> {item.marca_modelo}</span>}
                      {item.preco_venda && <span><strong>Valor Unit.:</strong> <strong style={{ color: '#3b82f6' }}>{formatBRL(item.preco_venda)}</strong></span>}
                      {item.preco_venda && <span><strong>Valor Total:</strong> <strong style={{ color: '#22c55e' }}>{formatBRL((item.preco_venda || 0) * (item.quantidade || 0))}</strong></span>}
                    </div>
                  </div>
                </div>

                {/* ============ HISTÓRICO DE COTAÇÕES (APENAS PENDENTES) ============ */}
                {status === 'pendente' && (
                  <div style={{ 
                    marginBottom: '1rem', 
                    padding: '0.75rem', 
                    background: '#fef3c7', 
                    borderRadius: '8px',
                    border: '1px solid #fcd34d'
                  }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ fontWeight: '600', color: '#92400e', fontSize: '0.9rem' }}>
                        📜 Cotações Anteriores
                      </span>
                      <button
                        onClick={() => buscarHistoricoCotacoes(item)}
                        style={{ 
                          padding: '0.4rem 0.8rem', 
                          fontSize: '0.8rem', 
                          background: historicoCotacoes[item._uniqueId]?.encontrado ? '#22c55e' : '#f59e0b', 
                          color: 'white', 
                          border: 'none', 
                          borderRadius: '6px', 
                          cursor: 'pointer',
                          fontWeight: '600'
                        }}
                        data-testid={`btn-historico-${item._uniqueId}`}
                      >
                        {historicoCotacoes[item._uniqueId]?.loading 
                          ? '⏳ Buscando...' 
                          : historicoCotacoes[item._uniqueId]?.encontrado
                            ? `✓ ${historicoCotacoes[item._uniqueId]?.historico?.length || 0} encontrado(s)`
                            : expandedHistorico[item._uniqueId]
                              ? '▲ Ocultar'
                              : '🔍 Buscar'}
                      </button>
                    </div>
                    
                    {/* Exibir histórico quando expandido */}
                    {expandedHistorico[item._uniqueId] && historicoCotacoes[item._uniqueId] && (
                      <div style={{ marginTop: '0.75rem' }}>
                        {historicoCotacoes[item._uniqueId].loading ? (
                          <div style={{ textAlign: 'center', padding: '1rem', color: '#6b7280' }}>
                            Buscando cotações anteriores...
                          </div>
                        ) : historicoCotacoes[item._uniqueId].historico?.length > 0 ? (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                            <div style={{ fontSize: '0.8rem', color: '#166534', fontWeight: '600', marginBottom: '0.25rem' }}>
                              ✅ Este item já foi cotado/comprado anteriormente:
                            </div>
                            {historicoCotacoes[item._uniqueId].historico.map((hist, idx) => (
                              <div 
                                key={idx}
                                style={{ 
                                  padding: '0.6rem', 
                                  background: 'white', 
                                  borderRadius: '6px',
                                  border: '1px solid #d1fae5',
                                  fontSize: '0.85rem'
                                }}
                              >
                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem', alignItems: 'center' }}>
                                  {hist.fornecedor && (
                                    <span style={{ fontWeight: '600', color: '#374151' }}>
                                      🏪 {hist.fornecedor}
                                    </span>
                                  )}
                                  {hist.preco_unitario > 0 && (
                                    <span style={{ color: '#059669', fontWeight: '600' }}>
                                      💰 {formatBRL(hist.preco_unitario)}
                                    </span>
                                  )}
                                  {hist.frete > 0 && (
                                    <span style={{ color: '#6b7280', fontSize: '0.8rem' }}>
                                      (+ {formatBRL(hist.frete)} frete)
                                    </span>
                                  )}
                                  <span style={{ 
                                    fontSize: '0.75rem', 
                                    padding: '0.15rem 0.4rem', 
                                    background: hist.status === 'entregue' ? '#dcfce7' : '#e0f2fe',
                                    color: hist.status === 'entregue' ? '#166534' : '#0369a1',
                                    borderRadius: '4px',
                                    fontWeight: '500'
                                  }}>
                                    {hist.status.toUpperCase()}
                                  </span>
                                  <span style={{ fontSize: '0.75rem', color: '#9ca3af' }}>
                                    {hist.numero_oc}
                                  </span>
                                </div>
                                {hist.link && (
                                  <div style={{ marginTop: '0.4rem' }}>
                                    <a 
                                      href={hist.link} 
                                      target="_blank" 
                                      rel="noopener noreferrer"
                                      style={{ 
                                        fontSize: '0.8rem', 
                                        color: '#2563eb', 
                                        wordBreak: 'break-all',
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: '0.25rem'
                                      }}
                                    >
                                      🔗 {hist.link.length > 60 ? hist.link.substring(0, 60) + '...' : hist.link}
                                    </a>
                                    <button
                                      onClick={() => {
                                        navigator.clipboard.writeText(hist.link);
                                        alert('Link copiado!');
                                      }}
                                      style={{ 
                                        marginTop: '0.25rem',
                                        padding: '0.2rem 0.5rem', 
                                        fontSize: '0.7rem', 
                                        background: '#e5e7eb', 
                                        border: 'none', 
                                        borderRadius: '4px', 
                                        cursor: 'pointer' 
                                      }}
                                    >
                                      📋 Copiar Link
                                    </button>
                                  </div>
                                )}
                              </div>
                            ))}
                          </div>
                        ) : (
                          <div style={{ 
                            textAlign: 'center', 
                            padding: '0.75rem', 
                            color: '#6b7280',
                            background: 'white',
                            borderRadius: '6px',
                            fontSize: '0.85rem'
                          }}>
                            Nenhuma cotação anterior encontrada para este item.
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}

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
                          <option value="pronto_envio">Pronto p/ Envio</option>
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
                                    {buscandoCep && (
                                      <div style={{ 
                                        padding: '0.5rem', 
                                        background: '#f0f9ff', 
                                        borderRadius: '4px', 
                                        fontSize: '0.85rem',
                                        color: '#3b82f6',
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: '0.5rem'
                                      }}>
                                        ⏳ Buscando CEP automaticamente...
                                      </div>
                                    )}
                                    <textarea
                                      value={enderecoTemp}
                                      onChange={(e) => setEnderecoTemp(e.target.value)}
                                      className="form-input"
                                      rows={3}
                                      style={{ width: '100%', textTransform: 'uppercase' }}
                                      placeholder="Endereço completo com CEP..."
                                      disabled={buscandoCep}
                                    />
                                    <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
                                      <button onClick={cancelEditEndereco} className="btn btn-secondary" style={{ padding: '0.4rem 0.8rem', fontSize: '0.8rem' }}>Cancelar</button>
                                      <button 
                                        onClick={() => saveEndereco(item)} 
                                        className="btn btn-primary" 
                                        style={{ padding: '0.4rem 0.8rem', fontSize: '0.8rem' }}
                                        disabled={buscandoCep}
                                      >
                                        Salvar
                                      </button>
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
                                  <div style={{ marginBottom: '0.5rem' }}><strong>Endereço da entrega: {item.endereco_entrega_oc || item.endereco_entrega || 'NÃO INFORMADO'}</strong></div>
                                  <div style={{ marginBottom: '0.5rem' }}>NF referente à OC - {item.numero_oc ? item.numero_oc.replace(/^OC-/i, '') : ''}</div>
                                  {(itensProximaRemessaPorOC[item.po_id] || []).length > 0 && (
                                    <div style={{ marginBottom: '0.5rem', color: '#0369a1', fontWeight: '500' }}>
                                      Próxima remessa: {(itensProximaRemessaPorOC[item.po_id] || []).join(', ')}
                                    </div>
                                  )}
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

                      {/* ============ OBSERVAÇÃO - VISÍVEL PARA TODOS (SOMENTE LEITURA) ============ */}
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

                        {/* ===== ÁREA DE IMAGEM + BOTÃO EDITAR ===== */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                          {/* Miniatura de Imagem ou Botão Upload */}
                          {(() => {
                            // Priorizar mapa de imagens, depois imagem do item
                            const imagemUrl = imagensItens[item.codigo_item] || item.imagem_url;
                            return (
                          <div 
                            style={{ 
                              width: '80px', 
                              height: '80px', 
                              borderRadius: '8px',
                              border: imagemUrl ? '2px solid #22c55e' : '2px dashed #cbd5e1',
                              background: dragOver === item._uniqueId ? '#dbeafe' : (imagemUrl ? 'transparent' : '#f8fafc'),
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              cursor: 'pointer',
                              overflow: 'hidden',
                              position: 'relative',
                              transition: 'all 0.2s'
                            }}
                            onDragOver={(e) => handleDragOver(e, item._uniqueId)}
                            onDragLeave={handleDragLeave}
                            onDrop={(e) => handleDrop(e, item)}
                            onClick={() => {
                              if (imagemUrl) {
                                setImagemExpandida(`${BACKEND_URL}${imagemUrl}?t=${imageCacheTimestamp}`);
                              } else {
                                document.getElementById(`img-input-${item._uniqueId}`).click();
                              }
                            }}
                            data-testid={`image-zone-${item.codigo_item}`}
                          >
                            {imagemUrl ? (
                              <>
                                <img 
                                  src={`${BACKEND_URL}${imagemUrl}?t=${imageCacheTimestamp}`} 
                                  alt={`Imagem ${item.codigo_item}`}
                                  style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                                  onError={(e) => {
                                    // Esconder imagem quebrada mas manter container
                                    e.target.style.display = 'none';
                                    // Mostrar indicador de erro no lugar
                                    const errorSpan = document.createElement('span');
                                    errorSpan.style.cssText = 'font-size: 1.5rem; color: #ef4444;';
                                    errorSpan.innerHTML = '⚠️';
                                    errorSpan.title = 'Imagem corrompida - clique no X para remover';
                                    e.target.parentElement.insertBefore(errorSpan, e.target);
                                  }}
                                  data-testid={`image-thumbnail-${item.codigo_item}`}
                                />
                                {/* Botão remover no canto - SEMPRE visível quando tem URL de imagem */}
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleDeleteImage(item);
                                  }}
                                  style={{
                                    position: 'absolute',
                                    top: '-6px',
                                    right: '-6px',
                                    width: '22px',
                                    height: '22px',
                                    borderRadius: '50%',
                                    background: '#ef4444',
                                    color: 'white',
                                    border: '2px solid white',
                                    fontSize: '0.7rem',
                                    cursor: 'pointer',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    boxShadow: '0 2px 4px rgba(0,0,0,0.2)',
                                    zIndex: 10
                                  }}
                                  data-testid={`delete-image-btn-${item.codigo_item}`}
                                  title="Remover imagem"
                                >
                                  ✕
                                </button>
                              </>
                            ) : uploadingImage === item._uniqueId ? (
                              <span style={{ fontSize: '0.8rem', color: '#64748b' }}>⏳</span>
                            ) : (
                              <span style={{ fontSize: '2rem', color: '#94a3b8' }}>📷</span>
                            )}
                          </div>
                            );
                          })()}
                          <input
                            id={`img-input-${item._uniqueId}`}
                            type="file"
                            accept="image/jpeg,image/png,image/webp,image/gif"
                            onChange={(e) => handleImageUpload(item, e.target.files[0])}
                            style={{ display: 'none' }}
                            disabled={uploadingImage === item._uniqueId}
                          />
                          
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
      
      {/* Modal de Usar do Estoque - Componente refatorado */}
      {showUsarEstoqueModal && (
        <UsarEstoqueModal
          item={showUsarEstoqueModal}
          onClose={() => {
            setShowUsarEstoqueModal(null);
            setEstoqueDetalhes(null);
            setQuantidadeUsar(0);
          }}
          onSuccess={() => loadItems()}
        />
      )}
      
      {/* Modal de Imagem Expandida */}
      {/* Modal de Envio Parcial */}
      {showEnvioParcialModal && (
        <div 
          onClick={() => setShowEnvioParcialModal(null)}
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: 'rgba(0,0,0,0.5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 9998,
            padding: '2rem'
          }}
          data-testid="envio-parcial-modal"
        >
          <div 
            onClick={(e) => e.stopPropagation()}
            style={{
              background: 'white',
              borderRadius: '12px',
              padding: '1.5rem',
              maxWidth: '450px',
              width: '100%',
              boxShadow: '0 8px 32px rgba(0,0,0,0.2)'
            }}
          >
            <h3 style={{ 
              margin: '0 0 1rem 0', 
              fontSize: '1.2rem', 
              color: '#8b5cf6',
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem'
            }}>
              📦 Envio Parcial
            </h3>
            
            <div style={{ 
              background: '#f5f3ff', 
              padding: '0.75rem', 
              borderRadius: '8px', 
              marginBottom: '1rem',
              border: '1px solid #c4b5fd'
            }}>
              <p style={{ margin: 0, fontSize: '0.9rem', color: '#374151' }}>
                <strong>Item:</strong> {showEnvioParcialModal.codigo_item}
              </p>
              <p style={{ margin: '0.25rem 0 0 0', fontSize: '0.9rem', color: '#374151' }}>
                <strong>Quantidade disponível:</strong> {showEnvioParcialModal.quantidade} {showEnvioParcialModal.unidade}
              </p>
            </div>
            
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              {/* Quantidade a enviar */}
              <div>
                <label style={{ fontWeight: '600', color: '#374151', fontSize: '0.9rem', display: 'block', marginBottom: '0.25rem' }}>
                  📦 Quantidade a enviar: *
                </label>
                <input
                  type="number"
                  min="1"
                  max={showEnvioParcialModal.quantidade - 1}
                  placeholder={`1 a ${showEnvioParcialModal.quantidade - 1}`}
                  value={envioParcialData.quantidade_enviar}
                  onChange={(e) => setEnvioParcialData(prev => ({ ...prev, quantidade_enviar: e.target.value }))}
                  style={{
                    width: '100%',
                    padding: '0.6rem',
                    border: '2px solid #8b5cf6',
                    borderRadius: '6px',
                    fontSize: '1rem',
                    fontWeight: '600'
                  }}
                />
                {envioParcialData.quantidade_enviar && (
                  <p style={{ margin: '0.25rem 0 0 0', fontSize: '0.8rem', color: '#6b7280' }}>
                    📋 {showEnvioParcialModal.quantidade - parseInt(envioParcialData.quantidade_enviar || 0)} unidades permanecerão em &quot;Em Separação&quot;
                  </p>
                )}
              </div>
              
              {/* Código de Rastreio */}
              <div>
                <label style={{ fontWeight: '600', color: '#374151', fontSize: '0.9rem', display: 'block', marginBottom: '0.25rem' }}>
                  🔍 Código de Rastreio (opcional):
                </label>
                <input
                  type="text"
                  placeholder="AB123456789BR"
                  value={envioParcialData.codigo_rastreio}
                  onChange={(e) => setEnvioParcialData(prev => ({ ...prev, codigo_rastreio: e.target.value.toUpperCase() }))}
                  style={{
                    width: '100%',
                    padding: '0.6rem',
                    border: '1px solid #d1d5db',
                    borderRadius: '6px',
                    fontSize: '1rem',
                    fontFamily: 'monospace'
                  }}
                />
              </div>
              
              {/* Frete */}
              <div>
                <label style={{ fontWeight: '600', color: '#374151', fontSize: '0.9rem', display: 'block', marginBottom: '0.25rem' }}>
                  🚚 Frete (R$) - opcional:
                </label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  placeholder="0,00"
                  value={envioParcialData.frete_envio}
                  onChange={(e) => setEnvioParcialData(prev => ({ ...prev, frete_envio: e.target.value }))}
                  style={{
                    width: '100%',
                    padding: '0.6rem',
                    border: '1px solid #d1d5db',
                    borderRadius: '6px',
                    fontSize: '1rem'
                  }}
                />
              </div>
            </div>
            
            {/* Botões */}
            <div style={{ display: 'flex', gap: '1rem', marginTop: '1.5rem' }}>
              <button
                onClick={() => setShowEnvioParcialModal(null)}
                style={{
                  flex: 1,
                  padding: '0.75rem',
                  background: '#f3f4f6',
                  color: '#374151',
                  border: '1px solid #d1d5db',
                  borderRadius: '6px',
                  cursor: 'pointer',
                  fontSize: '0.95rem',
                  fontWeight: '600'
                }}
              >
                Cancelar
              </button>
              <button
                onClick={envioParcial}
                disabled={aplicandoEnvioParcial || !envioParcialData.quantidade_enviar}
                style={{
                  flex: 1,
                  padding: '0.75rem',
                  background: aplicandoEnvioParcial || !envioParcialData.quantidade_enviar ? '#9ca3af' : '#8b5cf6',
                  color: 'white',
                  border: 'none',
                  borderRadius: '6px',
                  cursor: aplicandoEnvioParcial || !envioParcialData.quantidade_enviar ? 'not-allowed' : 'pointer',
                  fontSize: '0.95rem',
                  fontWeight: '700'
                }}
              >
                {aplicandoEnvioParcial ? '⏳ Enviando...' : '✅ Confirmar Envio'}
              </button>
            </div>
          </div>
        </div>
      )}

      {imagemExpandida && (
        <div 
          onClick={() => setImagemExpandida(null)}
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: 'rgba(0,0,0,0.85)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 9999,
            cursor: 'pointer',
            padding: '2rem'
          }}
          data-testid="image-modal"
        >
          <div style={{ position: 'relative', maxWidth: '90vw', maxHeight: '90vh' }}>
            <img 
              src={imagemExpandida} 
              alt="Imagem expandida"
              style={{ 
                maxWidth: '100%', 
                maxHeight: '85vh', 
                borderRadius: '12px',
                boxShadow: '0 8px 32px rgba(0,0,0,0.3)'
              }}
              onClick={(e) => e.stopPropagation()}
            />
            <button
              onClick={() => setImagemExpandida(null)}
              style={{
                position: 'absolute',
                top: '-15px',
                right: '-15px',
                width: '36px',
                height: '36px',
                borderRadius: '50%',
                background: 'white',
                border: 'none',
                fontSize: '1.2rem',
                cursor: 'pointer',
                boxShadow: '0 2px 8px rgba(0,0,0,0.2)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}
            >
              ✕
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default ItemsByStatus;
