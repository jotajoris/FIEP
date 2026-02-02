import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import axios from 'axios';

const API = process.env.REACT_APP_BACKEND_URL;

const formatBRL = (value) => {
  if (value === null || value === undefined) return 'R$ 0,00';
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
};

const Estoque = () => {
  const [estoque, setEstoque] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [totalItens, setTotalItens] = useState(0);
  
  // Estados para paginação
  const [itemsPerPage, setItemsPerPage] = useState(10);
  const [currentPage, setCurrentPage] = useState(1);
  
  // Estados para edição
  const [editingOC, setEditingOC] = useState(null); // {po_id, item_index, quantidade_atual, quantidade_necessaria}
  const [novaQuantidade, setNovaQuantidade] = useState(0);
  const [salvando, setSalvando] = useState(false);
  
  // Estado para edição inline da quantidade do estoque
  const [editingQuantidadeItem, setEditingQuantidadeItem] = useState(null);
  const [novaQuantidadeEstoque, setNovaQuantidadeEstoque] = useState(0);
  
  // Estados para adicionar item manual ao estoque
  const [showAddModal, setShowAddModal] = useState(false);
  const [codigoBusca, setCodigoBusca] = useState('');
  const [itemEncontrado, setItemEncontrado] = useState(null);
  const [itemExistenteEstoque, setItemExistenteEstoque] = useState(null); // Item já no estoque
  const [buscando, setBuscando] = useState(false);
  const [addQuantidade, setAddQuantidade] = useState(0);
  const [addPreco, setAddPreco] = useState(0);
  const [addFornecedor, setAddFornecedor] = useState('ENTRADA MANUAL');
  const [addDescricao, setAddDescricao] = useState('');
  const [imagemPreview, setImagemPreview] = useState(null);
  const [uploadingImage, setUploadingImage] = useState(false);
  const imageInputRef = React.useRef(null);
  
  // Estados para upload de planilha de limites do contrato
  const [uploadingLimites, setUploadingLimites] = useState(false);
  const [limitesInfo, setLimitesInfo] = useState(null); // Info sobre limites importados
  const fileInputRef = React.useRef(null);
  
  // Cache de imagens
  const [imagensCache, setImagensCache] = useState({});
  const [imageCacheTimestamp, setImageCacheTimestamp] = useState(Date.now());

  useEffect(() => {
    loadEstoque();
    loadLimitesInfo();
    loadImagensCache();
  }, []);
  
  // Reset para página 1 quando buscar ou mudar quantidade por página
  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, itemsPerPage]);

  const loadEstoque = async () => {
    try {
      const token = localStorage.getItem('token');
      const response = await axios.get(`${API}/api/estoque`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setEstoque(response.data.estoque || []);
      setTotalItens(response.data.total_itens_diferentes || 0);
    } catch (error) {
      console.error('Erro ao carregar estoque:', error);
    } finally {
      setLoading(false);
    }
  };
  
  // Carregar cache de imagens
  const loadImagensCache = async () => {
    try {
      const token = localStorage.getItem('token');
      const response = await axios.get(`${API}/api/itens/imagens-disponiveis`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      const cache = {};
      (response.data.codigos || []).forEach(codigo => {
        cache[codigo] = true;
      });
      setImagensCache(cache);
    } catch (error) {
      console.warn('Cache de imagens não carregado:', error);
    }
  };
  
  // Carregar info sobre limites do contrato
  const loadLimitesInfo = async () => {
    try {
      const token = localStorage.getItem('token');
      const response = await axios.get(`${API}/api/limites-contrato`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (response.data?.total > 0) {
        setLimitesInfo({
          total: response.data.total,
          dataImportacao: response.data.limites?.[0]?.data_importacao
        });
      }
    } catch (error) {
      console.warn('Limites não carregados:', error);
    }
  };
  
  // Upload de planilha de limites do contrato
  const handleUploadLimites = async (event) => {
    const file = event.target.files[0];
    if (!file) return;
    
    if (!file.name.toLowerCase().endsWith('.xlsx') && !file.name.toLowerCase().endsWith('.xls')) {
      alert('Por favor, selecione um arquivo Excel (.xlsx ou .xls)');
      return;
    }
    
    setUploadingLimites(true);
    
    try {
      const token = localStorage.getItem('token');
      const formData = new FormData();
      formData.append('file', file);
      
      const response = await axios.post(`${API}/api/admin/importar-limites-contrato`, formData, {
        headers: { 
          Authorization: `Bearer ${token}`,
          'Content-Type': 'multipart/form-data'
        }
      });
      
      alert(`✅ Limites importados com sucesso!\n\n• ${response.data.itens_importados} códigos de itens\n• ${response.data.linhas_processadas} linhas processadas\n\nO badge "📊 Contrato" na página de Pendentes agora mostrará os valores da planilha.`);
      loadLimitesInfo();
    } catch (error) {
      console.error('Erro ao importar limites:', error);
      alert('Erro ao importar planilha: ' + (error.response?.data?.detail || error.message));
    } finally {
      setUploadingLimites(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  // Buscar item pelo código
  const buscarItem = async () => {
    if (!codigoBusca.trim()) return;
    
    setBuscando(true);
    setItemEncontrado(null);
    setItemExistenteEstoque(null);
    
    try {
      const token = localStorage.getItem('token');
      
      // Primeiro, verificar se já existe no estoque
      const itemNoEstoque = estoque.find(e => e.codigo_item === codigoBusca);
      if (itemNoEstoque) {
        setItemExistenteEstoque(itemNoEstoque);
        // Pegar o preço do primeiro fornecedor se existir
        if (itemNoEstoque.preco_unitario) {
          setAddPreco(itemNoEstoque.preco_unitario);
        }
        if (itemNoEstoque.fornecedor) {
          setAddFornecedor(itemNoEstoque.fornecedor);
        }
        setBuscando(false);
        return;
      }
      
      // Se não existe no estoque, buscar nas OCs
      const response = await axios.get(`${API}/api/purchase-orders?limit=0`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      
      const pos = response.data.data || [];
      
      // Coletar TODOS os fornecedores/preços para este item
      const fornecedoresEncontrados = [];
      let primeiroItem = null;
      
      for (const po of pos) {
        for (let idx = 0; idx < (po.items || []).length; idx++) {
          const item = po.items[idx];
          if (item.codigo_item === codigoBusca) {
            // Verificar fontes de compra
            const fontes = item.fontes_compra || [];
            if (fontes.length > 0) {
              fontes.forEach(fonte => {
                if (fonte.fornecedor && fonte.preco_unitario > 0) {
                  fornecedoresEncontrados.push({
                    fornecedor: fonte.fornecedor,
                    preco: fonte.preco_unitario,
                    oc: po.numero_oc,
                    quantidade: fonte.quantidade
                  });
                }
              });
            } else if (item.preco > 0) {
              // Usar preço do item se não tiver fontes
              fornecedoresEncontrados.push({
                fornecedor: item.fornecedor || 'NÃO INFORMADO',
                preco: item.preco / (item.quantidade || 1),
                oc: po.numero_oc,
                quantidade: item.quantidade
              });
            }
            
            // Guardar primeiro item encontrado com status comprado ou posterior
            if (!primeiroItem && ['comprado', 'em_separacao', 'pronto_envio', 'em_transito', 'entregue'].includes(item.status)) {
              primeiroItem = {
                ...item,
                po_id: po.id,
                numero_oc: po.numero_oc,
                item_index: idx
              };
            }
          }
        }
      }
      
      if (primeiroItem) {
        setItemEncontrado({
          ...primeiroItem,
          fornecedores: fornecedoresEncontrados
        });
        setAddDescricao(primeiroItem.descricao || '');
        
        // Preencher com o primeiro fornecedor encontrado
        if (fornecedoresEncontrados.length > 0) {
          setAddPreco(fornecedoresEncontrados[0].preco);
          setAddFornecedor(fornecedoresEncontrados[0].fornecedor);
        }
        setBuscando(false);
        return;
      }
      
      // Item não encontrado - permitir adicionar manualmente
      setItemEncontrado({
        codigo_item: codigoBusca,
        descricao: '',
        status: 'novo',
        isNew: true
      });
      setAddDescricao('');
      
    } catch (error) {
      console.error('Erro ao buscar item:', error);
      alert('Erro ao buscar item.');
    } finally {
      setBuscando(false);
    }
  };

  // Adicionar quantidade ao estoque
  const adicionarAoEstoque = async () => {
    if (!itemEncontrado || addQuantidade <= 0) return;
    
    setSalvando(true);
    try {
      const token = localStorage.getItem('token');
      
      // Se é um item novo (não existe em nenhuma OC)
      if (itemEncontrado.isNew) {
        // Criar entrada direta no estoque
        await axios.post(`${API}/api/estoque/adicionar-manual`, {
          codigo_item: codigoBusca,
          descricao: addDescricao,
          quantidade: addQuantidade,
          preco_unitario: addPreco,
          fornecedor: addFornecedor
        }, {
          headers: { Authorization: `Bearer ${token}` }
        });
        
        alert(`Adicionado ${addQuantidade} UN do item ${codigoBusca} ao estoque!`);
      } else {
        // Item encontrado em OC - usar endpoint de adicionar quantidade
        await axios.post(`${API}/api/estoque/adicionar-quantidade`, {
          codigo_item: itemEncontrado.codigo_item,
          quantidade: addQuantidade,
          preco_unitario: addPreco,
          fornecedor: addFornecedor
        }, {
          headers: { Authorization: `Bearer ${token}` }
        });
        
        alert(`Adicionado ${addQuantidade} UN ao estoque do item ${itemEncontrado.codigo_item}!`);
      }
      
      setShowAddModal(false);
      setCodigoBusca('');
      setItemEncontrado(null);
      setItemExistenteEstoque(null);
      setAddQuantidade(0);
      setAddPreco(0);
      setAddDescricao('');
      loadEstoque();
    } catch (error) {
      console.error('Erro ao adicionar ao estoque:', error);
      alert('Erro ao adicionar ao estoque: ' + (error.response?.data?.detail || error.message));
    } finally {
      setSalvando(false);
    }
  };
  
  // Adicionar quantidade a item existente no estoque
  const adicionarAoEstoqueExistente = async () => {
    if (!itemExistenteEstoque || addQuantidade <= 0) return;
    
    setSalvando(true);
    try {
      const token = localStorage.getItem('token');
      
      // Sempre usar o endpoint de adicionar quantidade
      await axios.post(`${API}/api/estoque/adicionar-quantidade`, {
        codigo_item: itemExistenteEstoque.codigo_item,
        quantidade: addQuantidade,
        preco_unitario: addPreco,
        fornecedor: addFornecedor
      }, {
        headers: { Authorization: `Bearer ${token}` }
      });
      
      alert(`Adicionado +${addQuantidade} UN ao estoque do item ${itemExistenteEstoque.codigo_item}!`);
      setShowAddModal(false);
      setCodigoBusca('');
      setItemEncontrado(null);
      setItemExistenteEstoque(null);
      setAddQuantidade(0);
      setAddPreco(0);
      loadEstoque();
    } catch (error) {
      console.error('Erro ao adicionar ao estoque:', error);
      alert('Erro ao adicionar ao estoque: ' + (error.response?.data?.detail || error.message));
    } finally {
      setSalvando(false);
    }
  };
  
  // Upload de imagem do item
  const handleUploadImagem = async (codigoItem, file) => {
    if (!file) return;
    
    setUploadingImage(true);
    try {
      const token = localStorage.getItem('token');
      const formData = new FormData();
      formData.append('file', file);
      
      await axios.post(`${API}/api/itens/${codigoItem}/imagem`, formData, {
        headers: { 
          Authorization: `Bearer ${token}`,
          'Content-Type': 'multipart/form-data'
        }
      });
      
      setImagensCache(prev => ({ ...prev, [codigoItem]: true }));
      setImageCacheTimestamp(Date.now());
      alert('Imagem enviada com sucesso!');
    } catch (error) {
      console.error('Erro ao enviar imagem:', error);
      alert('Erro ao enviar imagem: ' + (error.response?.data?.detail || error.message));
    } finally {
      setUploadingImage(false);
    }
  };
  
  // Excluir imagem do item
  const handleDeleteImagem = async (codigoItem) => {
    if (!window.confirm('Excluir imagem deste item?')) return;
    
    try {
      const token = localStorage.getItem('token');
      await axios.delete(`${API}/api/itens/${codigoItem}/imagem`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      
      setImagensCache(prev => ({ ...prev, [codigoItem]: false }));
      setImageCacheTimestamp(Date.now());
      alert('Imagem removida!');
    } catch (error) {
      console.error('Erro ao excluir imagem:', error);
    }
  };

  // Ajustar quantidade total do estoque de um item (por código)
  const handleAjustarQuantidade = async (codigoItem, novaQtd) => {
    if (novaQtd < 0) {
      alert('Quantidade não pode ser negativa');
      return;
    }
    
    setSalvando(true);
    try {
      const token = localStorage.getItem('token');
      await axios.patch(`${API}/api/estoque/ajustar-quantidade/${codigoItem}`, {
        nova_quantidade: novaQtd
      }, {
        headers: { Authorization: `Bearer ${token}` }
      });
      
      alert(`Quantidade do item ${codigoItem} ajustada para ${novaQtd}!`);
      setEditingQuantidadeItem(null);
      loadEstoque();
    } catch (error) {
      console.error('Erro ao ajustar quantidade:', error);
      alert('Erro ao ajustar quantidade: ' + (error.response?.data?.detail || error.message));
    } finally {
      setSalvando(false);
    }
  };

  // Ajustar quantidade de estoque (via modal)
  const handleAjustarEstoque = async () => {
    if (!editingOC) return;
    
    setSalvando(true);
    try {
      const token = localStorage.getItem('token');
      await axios.patch(`${API}/api/estoque/ajustar`, {
        po_id: editingOC.po_id,
        item_index: editingOC.item_index,
        nova_quantidade_comprada: novaQuantidade
      }, {
        headers: { Authorization: `Bearer ${token}` }
      });
      
      alert('Estoque ajustado com sucesso!');
      setEditingOC(null);
      loadEstoque();
    } catch (error) {
      console.error('Erro ao ajustar estoque:', error);
      alert('Erro ao ajustar estoque: ' + (error.response?.data?.detail || error.message));
    } finally {
      setSalvando(false);
    }
  };

  // Limpar estoque de uma OC
  const handleLimparEstoque = async (po_id, item_index, numero_oc) => {
    if (!window.confirm(`Tem certeza que deseja remover o excedente de estoque da ${numero_oc}? A quantidade comprada será igualada à necessária.`)) {
      return;
    }
    
    try {
      const token = localStorage.getItem('token');
      await axios.delete(`${API}/api/estoque/limpar/${po_id}/${item_index}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      
      alert('Estoque limpo com sucesso!');
      loadEstoque();
    } catch (error) {
      console.error('Erro ao limpar estoque:', error);
      alert('Erro ao limpar estoque: ' + (error.response?.data?.detail || error.message));
    }
  };

  // Limpar dados inconsistentes de estoque
  const handleLimparDadosInconsistentes = async () => {
    if (!window.confirm('Isso vai corrigir dados de estoque em itens que estão pendentes/cotados mas ainda têm dados de uso de estoque. Deseja continuar?')) {
      return;
    }
    
    try {
      const token = localStorage.getItem('token');
      const response = await axios.post(`${API}/api/admin/limpar-dados-estoque-inconsistentes`, {}, {
        headers: { Authorization: `Bearer ${token}` }
      });
      
      const { itens_corrigidos, detalhes } = response.data;
      
      if (itens_corrigidos > 0) {
        alert(`${itens_corrigidos} item(ns) corrigido(s):\n${detalhes.map(d => `• ${d.numero_oc} - Item ${d.codigo_item}`).join('\n')}`);
        loadEstoque();
      } else {
        alert('Nenhum dado inconsistente encontrado!');
      }
    } catch (error) {
      console.error('Erro ao limpar dados inconsistentes:', error);
      alert('Erro ao limpar dados: ' + (error.response?.data?.detail || error.message));
    }
  };

  // Abrir modal de edição
  const abrirEdicao = (oc, codigoItem) => {
    setEditingOC({
      po_id: oc.po_id,
      item_index: oc.item_index,
      numero_oc: oc.numero_oc,
      quantidade_comprada: oc.quantidade_comprada,
      quantidade_necessaria: oc.quantidade_necessaria,
      codigo_item: codigoItem
    });
    setNovaQuantidade(oc.quantidade_comprada);
  };

  // Filtrar por busca
  const filteredEstoque = estoque.filter(item => {
    const term = searchTerm.toLowerCase();
    return (
      item.codigo_item?.toLowerCase().includes(term) ||
      item.descricao?.toLowerCase().includes(term) ||
      item.marca_modelo?.toLowerCase().includes(term) ||
      item.fornecedor?.toLowerCase().includes(term)
    );
  });
  
  // Paginação
  const totalPages = itemsPerPage === 'all' ? 1 : Math.ceil(filteredEstoque.length / itemsPerPage);
  const paginatedEstoque = itemsPerPage === 'all' 
    ? filteredEstoque 
    : filteredEstoque.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);

  if (loading) {
    return (
      <div data-testid="estoque-page" style={{ padding: '2rem' }}>
        <p>Carregando estoque...</p>
      </div>
    );
  }

  return (
    <div data-testid="estoque-page" style={{ padding: '2rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <h1 style={{ fontSize: '2rem', fontWeight: '700', margin: 0 }}>📦 Estoque</h1>
          <p style={{ color: '#6b7280', marginTop: '0.5rem' }}>
            Itens comprados em quantidade maior que a necessária
          </p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
          <button
            onClick={() => setShowAddModal(true)}
            style={{
              background: '#3b82f6',
              color: 'white',
              border: 'none',
              padding: '0.75rem 1.25rem',
              borderRadius: '8px',
              cursor: 'pointer',
              fontWeight: '600',
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem'
            }}
          >
            ➕ Adicionar ao Estoque
          </button>
          <button
            onClick={handleLimparDadosInconsistentes}
            data-testid="btn-limpar-inconsistentes"
            style={{
              background: '#f59e0b',
              color: 'white',
              border: 'none',
              padding: '0.75rem 1.25rem',
              borderRadius: '8px',
              cursor: 'pointer',
              fontWeight: '600',
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem'
            }}
            title="Corrige dados de estoque em itens pendentes/cotados"
          >
            🔧 Corrigir Dados
          </button>
          <div style={{ 
            background: '#dcfce7', 
            padding: '1rem 1.5rem', 
            borderRadius: '12px',
            border: '2px solid #22c55e'
          }}>
            <div style={{ fontSize: '0.85rem', color: '#166534' }}>Total de Itens em Estoque</div>
            <div style={{ fontSize: '2rem', fontWeight: '700', color: '#166534' }}>{totalItens}</div>
          </div>
        </div>
      </div>
      
      {/* Upload de Planilha de Limites do Contrato */}
      <div style={{ 
        marginBottom: '1.5rem', 
        padding: '1rem 1.5rem', 
        background: 'linear-gradient(135deg, #ede9fe 0%, #ddd6fe 100%)', 
        borderRadius: '12px',
        border: '2px solid #8b5cf6'
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
          <div>
            <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: '700', color: '#5b21b6' }}>
              📊 Planilha de Limites do Contrato FIEP
            </h3>
            <p style={{ margin: '0.25rem 0 0', fontSize: '0.875rem', color: '#6d28d9' }}>
              {limitesInfo 
                ? `✅ ${limitesInfo.total} códigos importados` 
                : 'Importe a planilha para mostrar os limites máximos do contrato na tela de Pendentes'}
            </p>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <input
              type="file"
              accept=".xlsx,.xls"
              onChange={handleUploadLimites}
              ref={fileInputRef}
              style={{ display: 'none' }}
              id="upload-limites-input"
              data-testid="upload-limites-input"
            />
            <label
              htmlFor="upload-limites-input"
              style={{
                background: uploadingLimites ? '#9ca3af' : '#7c3aed',
                color: 'white',
                border: 'none',
                padding: '0.6rem 1.25rem',
                borderRadius: '8px',
                cursor: uploadingLimites ? 'wait' : 'pointer',
                fontWeight: '600',
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem',
                fontSize: '0.9rem'
              }}
              data-testid="btn-upload-limites"
            >
              {uploadingLimites ? '⏳ Importando...' : '📤 Importar Planilha (.xlsx)'}
            </label>
          </div>
        </div>
        <p style={{ margin: '0.75rem 0 0', fontSize: '0.8rem', color: '#7c3aed' }}>
          💡 A planilha deve ter: Coluna J = Código do Item, Coluna H = Quantidade Máxima
        </p>
      </div>

      {/* Busca e Paginação */}
      <div style={{ marginBottom: '1.5rem', display: 'flex', gap: '1rem', alignItems: 'center', flexWrap: 'wrap', justifyContent: 'space-between' }}>
        <input
          type="text"
          placeholder="🔍 Buscar por código, descrição, marca ou fornecedor..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          style={{
            flex: 1,
            minWidth: '300px',
            maxWidth: '500px',
            padding: '0.75rem 1rem',
            border: '2px solid #e2e8f0',
            borderRadius: '8px',
            fontSize: '1rem'
          }}
          data-testid="search-estoque"
        />
        
        {/* Controle de itens por página */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <span style={{ fontSize: '0.9rem', color: '#6b7280' }}>Mostrar:</span>
          <select
            value={itemsPerPage}
            onChange={(e) => setItemsPerPage(e.target.value === 'all' ? 'all' : parseInt(e.target.value))}
            style={{
              padding: '0.5rem 1rem',
              border: '2px solid #e2e8f0',
              borderRadius: '6px',
              fontSize: '0.9rem',
              cursor: 'pointer'
            }}
          >
            <option value={5}>5</option>
            <option value={10}>10</option>
            <option value={15}>15</option>
            <option value={20}>20</option>
            <option value="all">Tudo</option>
          </select>
          <span style={{ fontSize: '0.85rem', color: '#9ca3af' }}>
            ({filteredEstoque.length} itens)
          </span>
        </div>
      </div>

      {/* Lista de Estoque */}
      {filteredEstoque.length === 0 ? (
        <div className="card" style={{ textAlign: 'center', padding: '3rem' }}>
          <p style={{ fontSize: '1.2rem', color: '#6b7280' }}>
            {searchTerm ? 'Nenhum item encontrado com esse termo' : 'Nenhum item em estoque'}
          </p>
          <p style={{ color: '#9ca3af', marginTop: '0.5rem' }}>
            Itens aparecem aqui quando a quantidade comprada é maior que a quantidade necessária na OC.
          </p>
        </div>
      ) : (
        <>
        <div className="card">
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: '#f8fafc', borderBottom: '2px solid #e2e8f0' }}>
                <th style={{ padding: '1rem', textAlign: 'center', fontWeight: '600', width: '80px' }}>Imagem</th>
                <th style={{ padding: '1rem', textAlign: 'left', fontWeight: '600' }}>Código</th>
                <th style={{ padding: '1rem', textAlign: 'left', fontWeight: '600' }}>Descrição</th>
                <th style={{ padding: '1rem', textAlign: 'center', fontWeight: '600' }}>Qtd. Estoque</th>
                <th style={{ padding: '1rem', textAlign: 'left', fontWeight: '600' }}>Fornecedor</th>
                <th style={{ padding: '1rem', textAlign: 'right', fontWeight: '600' }}>Preço Unit.</th>
                <th style={{ padding: '1rem', textAlign: 'center', fontWeight: '600' }}>Origem</th>
              </tr>
            </thead>
            <tbody>
              {paginatedEstoque.map((item, idx) => (
                <tr 
                  key={idx} 
                  style={{ 
                    borderBottom: '1px solid #e2e8f0',
                    background: idx % 2 === 0 ? 'white' : '#f8fafc'
                  }}
                  data-testid={`estoque-row-${item.codigo_item}`}
                >
                  {/* Miniatura da Imagem */}
                  <td style={{ padding: '0.5rem', textAlign: 'center' }}>
                    <div style={{ position: 'relative', display: 'inline-block' }}>
                      {imagensCache[item.codigo_item] || item.imagem_url ? (
                        <div style={{ position: 'relative' }}>
                          <img 
                            src={`${API}/api/itens/${item.codigo_item}/imagem?t=${imageCacheTimestamp}`}
                            alt={item.codigo_item}
                            style={{
                              width: '60px',
                              height: '60px',
                              objectFit: 'cover',
                              borderRadius: '8px',
                              border: '2px solid #e2e8f0',
                              cursor: 'pointer'
                            }}
                            onClick={() => window.open(`${API}/api/itens/${item.codigo_item}/imagem?t=${imageCacheTimestamp}`, '_blank')}
                            onError={(e) => {
                              e.target.style.display = 'none';
                              e.target.nextSibling.style.display = 'flex';
                            }}
                          />
                          <div style={{ display: 'none', width: '60px', height: '60px', background: '#f3f4f6', borderRadius: '8px', alignItems: 'center', justifyContent: 'center', color: '#9ca3af', fontSize: '1.5rem' }}>
                            📷
                          </div>
                          <button
                            onClick={() => handleDeleteImagem(item.codigo_item)}
                            style={{
                              position: 'absolute',
                              top: '-5px',
                              right: '-5px',
                              width: '20px',
                              height: '20px',
                              borderRadius: '50%',
                              border: 'none',
                              background: '#ef4444',
                              color: 'white',
                              fontSize: '0.7rem',
                              cursor: 'pointer',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center'
                            }}
                            title="Excluir imagem"
                          >
                            ✕
                          </button>
                        </div>
                      ) : (
                        <label style={{
                          width: '60px',
                          height: '60px',
                          background: '#f3f4f6',
                          borderRadius: '8px',
                          border: '2px dashed #d1d5db',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          cursor: 'pointer',
                          color: '#9ca3af',
                          fontSize: '1.2rem'
                        }}
                        title="Adicionar imagem"
                        >
                          📷
                          <input
                            type="file"
                            accept="image/*"
                            style={{ display: 'none' }}
                            onChange={(e) => {
                              if (e.target.files[0]) {
                                handleUploadImagem(item.codigo_item, e.target.files[0]);
                              }
                            }}
                          />
                        </label>
                      )}
                    </div>
                  </td>
                  <td style={{ padding: '1rem', fontWeight: '600', color: '#1f2937' }}>
                    {item.codigo_item}
                  </td>
                  <td style={{ padding: '1rem', color: '#4b5563', maxWidth: '250px' }}>
                    {item.descricao?.substring(0, 80)}{item.descricao?.length > 80 ? '...' : ''}
                    {item.marca_modelo && (
                      <div style={{ fontSize: '0.8rem', color: '#9ca3af', marginTop: '0.25rem' }}>
                        {item.marca_modelo}
                      </div>
                    )}
                  </td>
                  <td style={{ padding: '1rem', textAlign: 'center' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem' }}>
                      {editingQuantidadeItem === item.codigo_item ? (
                        <>
                          <input
                            type="number"
                            value={novaQuantidadeEstoque}
                            onChange={(e) => setNovaQuantidadeEstoque(parseInt(e.target.value) || 0)}
                            min="0"
                            style={{
                              width: '70px',
                              padding: '0.35rem',
                              fontSize: '1rem',
                              fontWeight: '700',
                              textAlign: 'center',
                              border: '2px solid #22c55e',
                              borderRadius: '8px'
                            }}
                            autoFocus
                          />
                          <button
                            onClick={() => handleAjustarQuantidade(item.codigo_item, novaQuantidadeEstoque)}
                            style={{
                              background: '#22c55e',
                              color: 'white',
                              border: 'none',
                              borderRadius: '4px',
                              padding: '0.35rem 0.5rem',
                              cursor: 'pointer',
                              fontSize: '0.85rem'
                            }}
                            title="Salvar"
                          >
                            ✓
                          </button>
                          <button
                            onClick={() => setEditingQuantidadeItem(null)}
                            style={{
                              background: '#ef4444',
                              color: 'white',
                              border: 'none',
                              borderRadius: '4px',
                              padding: '0.35rem 0.5rem',
                              cursor: 'pointer',
                              fontSize: '0.85rem'
                            }}
                            title="Cancelar"
                          >
                            ✕
                          </button>
                        </>
                      ) : (
                        <>
                          <span style={{
                            background: '#22c55e',
                            color: 'white',
                            padding: '0.35rem 0.75rem',
                            borderRadius: '20px',
                            fontWeight: '700',
                            fontSize: '1rem'
                          }}>
                            {item.quantidade_estoque} {item.unidade}
                          </span>
                          <button
                            onClick={() => {
                              setEditingQuantidadeItem(item.codigo_item);
                              setNovaQuantidadeEstoque(item.quantidade_estoque);
                            }}
                            style={{
                              background: '#f59e0b',
                              color: 'white',
                              border: 'none',
                              borderRadius: '4px',
                              padding: '0.25rem 0.4rem',
                              cursor: 'pointer',
                              fontSize: '0.75rem'
                            }}
                            title="Editar quantidade"
                          >
                            ✏️
                          </button>
                        </>
                      )}
                    </div>
                  </td>
                  <td style={{ padding: '1rem', color: '#6b7280' }}>
                    {item.fornecedor || '-'}
                    {item.link_compra && (
                      <div style={{ marginTop: '0.25rem' }}>
                        <a 
                          href={item.link_compra} 
                          target="_blank" 
                          rel="noopener noreferrer"
                          style={{ color: '#3b82f6', fontSize: '0.8rem' }}
                        >
                          🔗 Link
                        </a>
                      </div>
                    )}
                  </td>
                  <td style={{ padding: '1rem', textAlign: 'right', fontWeight: '600', color: '#059669' }}>
                    {formatBRL(item.preco_unitario)}
                  </td>
                  <td style={{ padding: '1rem', textAlign: 'center' }}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                      {item.ocs_origem?.map((oc, i) => (
                        <div key={i} style={{ 
                          fontSize: '0.8rem', 
                          padding: '0.5rem',
                          background: '#f0f9ff',
                          borderRadius: '6px',
                          border: '1px solid #bae6fd'
                        }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.25rem' }}>
                            <Link 
                              to={`/po/${oc.po_id}`}
                              style={{ color: '#0369a1', fontWeight: '600' }}
                            >
                              {oc.numero_oc}
                            </Link>
                            <div style={{ display: 'flex', gap: '0.25rem' }}>
                              <button
                                onClick={() => abrirEdicao(oc, item.codigo_item)}
                                style={{
                                  background: '#f59e0b',
                                  color: 'white',
                                  border: 'none',
                                  borderRadius: '4px',
                                  padding: '0.2rem 0.4rem',
                                  fontSize: '0.7rem',
                                  cursor: 'pointer'
                                }}
                                title="Editar quantidade"
                              >
                                ✏️
                              </button>
                              <button
                                onClick={() => handleLimparEstoque(oc.po_id, oc.item_index, oc.numero_oc)}
                                style={{
                                  background: '#ef4444',
                                  color: 'white',
                                  border: 'none',
                                  borderRadius: '4px',
                                  padding: '0.2rem 0.4rem',
                                  fontSize: '0.7rem',
                                  cursor: 'pointer'
                                }}
                                title="Remover excedente"
                              >
                                🗑️
                              </button>
                            </div>
                          </div>
                          <div style={{ fontSize: '0.75rem', color: '#64748b' }}>
                            Comprado: {oc.quantidade_comprada} | Necessário: {oc.quantidade_necessaria} | Estoque: {oc.excedente}
                          </div>
                          {oc.quantidade_usada_estoque > 0 && (
                            <div style={{ fontSize: '0.7rem', color: '#059669', marginTop: '0.25rem' }}>
                              ✅ {oc.quantidade_usada_estoque} UN já usados de outras OCs
                            </div>
                          )}
                          {oc.usado_em && oc.usado_em.length > 0 && (
                            <div style={{ 
                              marginTop: '0.5rem', 
                              padding: '0.4rem',
                              background: '#fef3c7',
                              borderRadius: '4px',
                              fontSize: '0.7rem',
                              color: '#92400e'
                            }}>
                              <strong>Usado em:</strong>
                              {oc.usado_em.map((uso, j) => (
                                <div key={j}>
                                  📦 {uso.quantidade} UN → {uso.numero_oc} ({uso.data})
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        
        {/* Paginação */}
        {itemsPerPage !== 'all' && totalPages > 1 && (
          <div style={{ 
            display: 'flex', 
            justifyContent: 'center', 
            alignItems: 'center', 
            gap: '0.5rem', 
            marginTop: '1.5rem' 
          }}>
            <button
              onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
              disabled={currentPage === 1}
              style={{
                padding: '0.5rem 1rem',
                border: '2px solid #e2e8f0',
                borderRadius: '6px',
                background: currentPage === 1 ? '#f3f4f6' : 'white',
                cursor: currentPage === 1 ? 'not-allowed' : 'pointer',
                fontWeight: '500'
              }}
            >
              ← Anterior
            </button>
            
            <div style={{ display: 'flex', gap: '0.25rem' }}>
              {Array.from({ length: totalPages }, (_, i) => i + 1)
                .filter(page => {
                  if (totalPages <= 7) return true;
                  if (page === 1 || page === totalPages) return true;
                  if (page >= currentPage - 1 && page <= currentPage + 1) return true;
                  return false;
                })
                .map((page, idx, arr) => (
                  <React.Fragment key={page}>
                    {idx > 0 && arr[idx - 1] !== page - 1 && (
                      <span style={{ padding: '0.5rem', color: '#9ca3af' }}>...</span>
                    )}
                    <button
                      onClick={() => setCurrentPage(page)}
                      style={{
                        padding: '0.5rem 0.75rem',
                        border: page === currentPage ? '2px solid #3b82f6' : '2px solid #e2e8f0',
                        borderRadius: '6px',
                        background: page === currentPage ? '#3b82f6' : 'white',
                        color: page === currentPage ? 'white' : '#374151',
                        cursor: 'pointer',
                        fontWeight: '600'
                      }}
                    >
                      {page}
                    </button>
                  </React.Fragment>
                ))
              }
            </div>
            
            <button
              onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))}
              disabled={currentPage === totalPages}
              style={{
                padding: '0.5rem 1rem',
                border: '2px solid #e2e8f0',
                borderRadius: '6px',
                background: currentPage === totalPages ? '#f3f4f6' : 'white',
                cursor: currentPage === totalPages ? 'not-allowed' : 'pointer',
                fontWeight: '500'
              }}
            >
              Próximo →
            </button>
          </div>
        )}
        </>
      )}
      
      {/* Modal de Edição de Estoque */}
      {editingOC && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(0,0,0,0.5)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 9999
        }}>
          <div style={{
            background: 'white',
            borderRadius: '12px',
            padding: '1.5rem',
            width: '90%',
            maxWidth: '400px',
            boxShadow: '0 20px 60px rgba(0,0,0,0.3)'
          }}>
            <h3 style={{ margin: '0 0 1rem 0', color: '#1e293b' }}>
              ✏️ Editar Estoque
            </h3>
            
            <div style={{ marginBottom: '1rem' }}>
              <strong>{editingOC.numero_oc}</strong>
            </div>
            
            <div style={{ marginBottom: '1rem' }}>
              <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '500' }}>
                Quantidade Comprada:
              </label>
              <input
                type="number"
                min="0"
                value={novaQuantidade}
                onChange={(e) => setNovaQuantidade(parseInt(e.target.value) || 0)}
                style={{
                  width: '100%',
                  padding: '0.75rem',
                  borderRadius: '8px',
                  border: '2px solid #e2e8f0',
                  fontSize: '1rem'
                }}
              />
              <div style={{ fontSize: '0.8rem', color: '#64748b', marginTop: '0.25rem' }}>
                Valor atual: {editingOC.quantidade_comprada}
              </div>
            </div>
            
            <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
              <button
                onClick={() => setEditingOC(null)}
                style={{
                  padding: '0.5rem 1rem',
                  borderRadius: '6px',
                  border: '1px solid #e2e8f0',
                  background: 'white',
                  cursor: 'pointer'
                }}
              >
                Cancelar
              </button>
              <button
                onClick={handleAjustarEstoque}
                disabled={salvando}
                style={{
                  padding: '0.5rem 1rem',
                  borderRadius: '6px',
                  border: 'none',
                  background: salvando ? '#94a3b8' : '#10b981',
                  color: 'white',
                  cursor: salvando ? 'not-allowed' : 'pointer',
                  fontWeight: '600'
                }}
              >
                {salvando ? 'Salvando...' : 'Salvar'}
              </button>
            </div>
            
            {/* Preview do novo estoque */}
            {novaQuantidade !== editingOC.quantidade_comprada && (
              <div style={{
                marginTop: '1rem',
                padding: '0.75rem',
                background: '#f0f9ff',
                borderRadius: '8px',
                fontSize: '0.85rem'
              }}>
                <div>Quantidade necessária: <strong>{editingOC.quantidade_necessaria}</strong></div>
                <div>Nova quantidade comprada: <strong>{novaQuantidade}</strong></div>
                <div style={{ 
                  marginTop: '0.5rem',
                  color: novaQuantidade > editingOC.quantidade_necessaria ? '#059669' : '#f59e0b'
                }}>
                  {novaQuantidade > editingOC.quantidade_necessaria 
                    ? `✅ Novo estoque: ${novaQuantidade - editingOC.quantidade_necessaria} UN`
                    : `⚠️ Sem excedente para estoque`
                  }
                </div>
              </div>
            )}
          </div>
        </div>
      )}
      
      {/* Modal de Adicionar ao Estoque */}
      {showAddModal && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(0,0,0,0.5)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 9999
        }}>
          <div style={{
            background: 'white',
            borderRadius: '16px',
            padding: '2rem',
            width: '90%',
            maxWidth: '550px',
            maxHeight: '85vh',
            overflow: 'auto',
            boxShadow: '0 20px 60px rgba(0,0,0,0.3)'
          }}>
            <h2 style={{ margin: '0 0 1.5rem 0', color: '#1e293b' }}>
              ➕ Adicionar ao Estoque
            </h2>
            
            {/* Busca por código */}
            <div style={{ marginBottom: '1.5rem' }}>
              <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '500' }}>
                Código do Item:
              </label>
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <input
                  type="text"
                  value={codigoBusca}
                  onChange={(e) => setCodigoBusca(e.target.value.toUpperCase())}
                  placeholder="Digite o código do item"
                  style={{
                    flex: 1,
                    padding: '0.75rem',
                    borderRadius: '8px',
                    border: '2px solid #e2e8f0',
                    fontSize: '1rem'
                  }}
                  onKeyPress={(e) => e.key === 'Enter' && buscarItem()}
                />
                <button
                  onClick={buscarItem}
                  disabled={buscando || !codigoBusca.trim()}
                  style={{
                    padding: '0.75rem 1.25rem',
                    borderRadius: '8px',
                    border: 'none',
                    background: buscando ? '#94a3b8' : '#3b82f6',
                    color: 'white',
                    cursor: buscando ? 'not-allowed' : 'pointer',
                    fontWeight: '600'
                  }}
                >
                  {buscando ? '🔄' : '🔍 Buscar'}
                </button>
              </div>
              <div style={{ fontSize: '0.8rem', color: '#64748b', marginTop: '0.5rem' }}>
                Se o código não existir, você poderá criar uma entrada manual
              </div>
            </div>
            
            {/* Item já existe no estoque */}
            {itemExistenteEstoque && (
              <div style={{ 
                background: '#fef3c7', 
                padding: '1rem', 
                borderRadius: '8px',
                marginBottom: '1.5rem',
                border: '2px solid #f59e0b'
              }}>
                <div style={{ fontWeight: '600', marginBottom: '0.75rem', color: '#92400e' }}>
                  📦 Item já existe no estoque!
                </div>
                <div style={{ display: 'flex', gap: '1rem', alignItems: 'flex-start' }}>
                  {/* Miniatura com upload */}
                  <div>
                    <label style={{ 
                      width: '80px', 
                      height: '80px', 
                      background: imagensCache[itemExistenteEstoque.codigo_item] || itemExistenteEstoque.imagem_url ? 'transparent' : '#f3f4f6', 
                      borderRadius: '8px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      overflow: 'hidden',
                      border: '2px dashed #d1d5db',
                      cursor: 'pointer',
                      position: 'relative'
                    }}>
                      {imagensCache[itemExistenteEstoque.codigo_item] || itemExistenteEstoque.imagem_url ? (
                        <>
                          <img 
                            src={`${API}/api/itens/${itemExistenteEstoque.codigo_item}/imagem?t=${imageCacheTimestamp}`}
                            alt={itemExistenteEstoque.codigo_item}
                            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                            onError={(e) => e.target.src = ''}
                          />
                          <div style={{
                            position: 'absolute',
                            bottom: 0,
                            left: 0,
                            right: 0,
                            background: 'rgba(0,0,0,0.5)',
                            color: 'white',
                            fontSize: '0.65rem',
                            textAlign: 'center',
                            padding: '0.15rem'
                          }}>
                            Trocar
                          </div>
                        </>
                      ) : (
                        <div style={{ textAlign: 'center', color: '#9ca3af' }}>
                          <div style={{ fontSize: '1.5rem' }}>📷</div>
                          <div style={{ fontSize: '0.65rem' }}>Adicionar</div>
                        </div>
                      )}
                      <input
                        type="file"
                        accept="image/*"
                        style={{ display: 'none' }}
                        onChange={(e) => {
                          if (e.target.files[0]) {
                            handleUploadImagem(itemExistenteEstoque.codigo_item, e.target.files[0]);
                          }
                        }}
                      />
                    </label>
                    {uploadingImage && (
                      <div style={{ fontSize: '0.7rem', color: '#6b7280', marginTop: '0.25rem', textAlign: 'center' }}>
                        Enviando...
                      </div>
                    )}
                  </div>
                  <div style={{ flex: 1, fontSize: '0.9rem', color: '#374151' }}>
                    <strong>Código:</strong> {itemExistenteEstoque.codigo_item}<br />
                    <strong>Descrição:</strong> {itemExistenteEstoque.descricao?.substring(0, 60)}...<br />
                    <strong>Qtd. atual:</strong> <span style={{ color: '#059669', fontWeight: '700' }}>{itemExistenteEstoque.quantidade_estoque} {itemExistenteEstoque.unidade}</span>
                  </div>
                </div>
                
                {/* Adicionar quantidade */}
                <div style={{ marginTop: '1rem', padding: '1rem', background: 'white', borderRadius: '8px' }}>
                  <div style={{ marginBottom: '0.75rem' }}>
                    <label style={{ display: 'block', marginBottom: '0.25rem', fontWeight: '500', fontSize: '0.9rem' }}>
                      Quantidade a adicionar:
                    </label>
                    <input
                      type="number"
                      min="1"
                      value={addQuantidade}
                      onChange={(e) => setAddQuantidade(parseInt(e.target.value) || 0)}
                      style={{
                        width: '100%',
                        padding: '0.5rem',
                        borderRadius: '6px',
                        border: '2px solid #e2e8f0',
                        fontSize: '1rem'
                      }}
                    />
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                    <div>
                      <label style={{ display: 'block', marginBottom: '0.25rem', fontWeight: '500', fontSize: '0.85rem' }}>
                        Preço unitário (R$):
                      </label>
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        value={addPreco}
                        onChange={(e) => setAddPreco(parseFloat(e.target.value) || 0)}
                        style={{
                          width: '100%',
                          padding: '0.5rem',
                          borderRadius: '6px',
                          border: '2px solid #e2e8f0'
                        }}
                      />
                    </div>
                    <div>
                      <label style={{ display: 'block', marginBottom: '0.25rem', fontWeight: '500', fontSize: '0.85rem' }}>
                        Fornecedor:
                      </label>
                      <input
                        type="text"
                        value={addFornecedor}
                        onChange={(e) => setAddFornecedor(e.target.value.toUpperCase())}
                        style={{
                          width: '100%',
                          padding: '0.5rem',
                          borderRadius: '6px',
                          border: '2px solid #e2e8f0'
                        }}
                      />
                    </div>
                  </div>
                  
                  {addQuantidade > 0 && (
                    <div style={{ 
                      marginTop: '0.75rem', 
                      padding: '0.5rem', 
                      background: '#dcfce7', 
                      borderRadius: '6px',
                      fontSize: '0.9rem',
                      color: '#166534',
                      fontWeight: '600'
                    }}>
                      ✅ Novo total: {itemExistenteEstoque.quantidade_estoque + addQuantidade} {itemExistenteEstoque.unidade}
                    </div>
                  )}
                </div>
              </div>
            )}
            
            {/* Item encontrado em OC ou item novo */}
            {itemEncontrado && !itemExistenteEstoque && (
              <div style={{ 
                background: itemEncontrado.isNew ? '#f0f9ff' : '#f0fdf4', 
                padding: '1rem', 
                borderRadius: '8px',
                marginBottom: '1.5rem',
                border: `2px solid ${itemEncontrado.isNew ? '#3b82f6' : '#22c55e'}`
              }}>
                <div style={{ fontWeight: '600', marginBottom: '0.75rem', color: itemEncontrado.isNew ? '#1e40af' : '#166534' }}>
                  {itemEncontrado.isNew ? '🆕 Novo item - Preencha os dados:' : '✅ Item encontrado:'}
                </div>
                
                <div style={{ display: 'flex', gap: '1rem', alignItems: 'flex-start' }}>
                  {/* Upload de foto */}
                  <div>
                    <label style={{
                      width: '80px',
                      height: '80px',
                      background: imagensCache[codigoBusca] ? 'transparent' : '#f3f4f6',
                      borderRadius: '8px',
                      border: '2px dashed #d1d5db',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      cursor: 'pointer',
                      overflow: 'hidden',
                      position: 'relative'
                    }}>
                      {imagensCache[codigoBusca] ? (
                        <>
                          <img 
                            src={`${API}/api/itens/${codigoBusca}/imagem?t=${imageCacheTimestamp}`}
                            alt={codigoBusca}
                            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                          />
                          <div style={{
                            position: 'absolute',
                            bottom: 0,
                            left: 0,
                            right: 0,
                            background: 'rgba(0,0,0,0.5)',
                            color: 'white',
                            fontSize: '0.65rem',
                            textAlign: 'center',
                            padding: '0.15rem'
                          }}>
                            Trocar
                          </div>
                        </>
                      ) : (
                        <div style={{ textAlign: 'center', color: '#9ca3af' }}>
                          <div style={{ fontSize: '1.5rem' }}>📷</div>
                          <div style={{ fontSize: '0.65rem' }}>Adicionar</div>
                        </div>
                      )}
                      <input
                        type="file"
                        accept="image/*"
                        style={{ display: 'none' }}
                        onChange={(e) => {
                          if (e.target.files[0]) {
                            handleUploadImagem(codigoBusca, e.target.files[0]);
                          }
                        }}
                      />
                    </label>
                  </div>
                  
                  <div style={{ flex: 1, fontSize: '0.9rem', color: '#374151' }}>
                    <strong>Código:</strong> {itemEncontrado.codigo_item}<br />
                    {!itemEncontrado.isNew && (
                      <>
                        <strong>Descrição:</strong> {itemEncontrado.descricao?.substring(0, 60)}...<br />
                        <strong>OC:</strong> {itemEncontrado.numero_oc}<br />
                        <strong>Status:</strong> {itemEncontrado.status}
                      </>
                    )}
                  </div>
                </div>
                
                {/* Campos para item novo */}
                {itemEncontrado.isNew && (
                  <div style={{ marginTop: '1rem' }}>
                    <label style={{ display: 'block', marginBottom: '0.25rem', fontWeight: '500', fontSize: '0.9rem' }}>
                      Descrição do Item:
                    </label>
                    <textarea
                      value={addDescricao}
                      onChange={(e) => setAddDescricao(e.target.value.toUpperCase())}
                      placeholder="Ex: CABO USB TIPO C 1M"
                      style={{
                        width: '100%',
                        padding: '0.5rem',
                        borderRadius: '6px',
                        border: '2px solid #e2e8f0',
                        minHeight: '60px',
                        resize: 'vertical'
                      }}
                    />
                  </div>
                )}
                
                {/* Quantidade, preço e fornecedor */}
                <div style={{ marginTop: '1rem', padding: '1rem', background: 'white', borderRadius: '8px' }}>
                  <div style={{ marginBottom: '0.75rem' }}>
                    <label style={{ display: 'block', marginBottom: '0.25rem', fontWeight: '500', fontSize: '0.9rem' }}>
                      Quantidade a adicionar:
                    </label>
                    <input
                      type="number"
                      min="1"
                      value={addQuantidade}
                      onChange={(e) => setAddQuantidade(parseInt(e.target.value) || 0)}
                      style={{
                        width: '100%',
                        padding: '0.5rem',
                        borderRadius: '6px',
                        border: '2px solid #e2e8f0',
                        fontSize: '1rem'
                      }}
                    />
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                    <div>
                      <label style={{ display: 'block', marginBottom: '0.25rem', fontWeight: '500', fontSize: '0.85rem' }}>
                        Preço unitário (R$):
                      </label>
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        value={addPreco}
                        onChange={(e) => setAddPreco(parseFloat(e.target.value) || 0)}
                        style={{
                          width: '100%',
                          padding: '0.5rem',
                          borderRadius: '6px',
                          border: '2px solid #e2e8f0'
                        }}
                      />
                    </div>
                    <div>
                      <label style={{ display: 'block', marginBottom: '0.25rem', fontWeight: '500', fontSize: '0.85rem' }}>
                        Fornecedor:
                      </label>
                      <input
                        type="text"
                        value={addFornecedor}
                        onChange={(e) => setAddFornecedor(e.target.value.toUpperCase())}
                        style={{
                          width: '100%',
                          padding: '0.5rem',
                          borderRadius: '6px',
                          border: '2px solid #e2e8f0'
                        }}
                      />
                    </div>
                  </div>
                </div>
              </div>
            )}
            
            {/* Botões */}
            <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end' }}>
              <button
                onClick={() => {
                  setShowAddModal(false);
                  setCodigoBusca('');
                  setItemEncontrado(null);
                  setItemExistenteEstoque(null);
                  setAddQuantidade(0);
                  setAddPreco(0);
                  setAddDescricao('');
                }}
                style={{
                  padding: '0.75rem 1.25rem',
                  borderRadius: '8px',
                  border: '1px solid #e2e8f0',
                  background: 'white',
                  cursor: 'pointer',
                  fontWeight: '500'
                }}
              >
                Cancelar
              </button>
              {itemExistenteEstoque && (
                <button
                  onClick={adicionarAoEstoqueExistente}
                  disabled={salvando || addQuantidade <= 0}
                  style={{
                    padding: '0.75rem 1.25rem',
                    borderRadius: '8px',
                    border: 'none',
                    background: salvando || addQuantidade <= 0 ? '#94a3b8' : '#f59e0b',
                    color: 'white',
                    cursor: salvando || addQuantidade <= 0 ? 'not-allowed' : 'pointer',
                    fontWeight: '600'
                  }}
                >
                  {salvando ? '⏳ Adicionando...' : `➕ Adicionar +${addQuantidade}`}
                </button>
              )}
              {itemEncontrado && !itemExistenteEstoque && (
                <button
                  onClick={adicionarAoEstoque}
                  disabled={salvando || addQuantidade <= 0 || (itemEncontrado.isNew && !addDescricao.trim())}
                  style={{
                    padding: '0.75rem 1.25rem',
                    borderRadius: '8px',
                    border: 'none',
                    background: salvando || addQuantidade <= 0 || (itemEncontrado.isNew && !addDescricao.trim()) ? '#94a3b8' : '#10b981',
                    color: 'white',
                    cursor: salvando || addQuantidade <= 0 || (itemEncontrado.isNew && !addDescricao.trim()) ? 'not-allowed' : 'pointer',
                    fontWeight: '600'
                  }}
                >
                  {salvando ? '⏳ Adicionando...' : '✅ Adicionar ao Estoque'}
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Estoque;
