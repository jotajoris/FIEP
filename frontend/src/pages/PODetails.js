import React, { useState, useEffect, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { apiGet, apiPatch, apiDelete, API, formatBRL } from '../utils/api';
import { useAuth } from '../contexts/AuthContext';
import { v4 as uuidv4 } from 'uuid';
import Pagination from '../components/Pagination';

// URL do backend para imagens
const BACKEND_URL = process.env.REACT_APP_BACKEND_URL || '';

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
  
  // Estado para atualização com PDF
  const [atualizandoPDF, setAtualizandoPDF] = useState(false);
  
  // Estado para upload de imagem
  const [uploadingImage, setUploadingImage] = useState(null);
  const [imagemExpandida, setImagemExpandida] = useState(null);
  
  // Paginação
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(5);

  // Filtros de pesquisa
  const [filtros, setFiltros] = useState({
    codigo: '',
    descricao: '',
    fornecedor: '',
    status: ''
  });

  // Agrupamento automático de itens com mesmo código (para Em Separação)
  const itensAgrupados = useMemo(() => {
    if (!po?.items) return [];
    
    // Agrupar itens pelo código
    const grouped = {};
    po.items.forEach((item, originalIndex) => {
      const codigo = item.codigo_item || 'sem_codigo';
      if (!grouped[codigo]) {
        grouped[codigo] = {
          codigo_item: codigo,
          items: [],
          originalIndices: []
        };
      }
      grouped[codigo].items.push(item);
      grouped[codigo].originalIndices.push(originalIndex);
    });
    
    // Converter para array mantendo a ordem do primeiro item de cada grupo
    const result = [];
    const processedCodes = new Set();
    
    po.items.forEach((item, originalIndex) => {
      const codigo = item.codigo_item || 'sem_codigo';
      if (!processedCodes.has(codigo)) {
        processedCodes.add(codigo);
        const group = grouped[codigo];
        
        // Calcular totais do grupo
        const quantidades = group.items.map(i => i.quantidade || 1);
        const quantidadeTotal = quantidades.reduce((sum, q) => sum + q, 0);
        const temMultiplos = group.items.length > 1;
        const quantidadeFormatada = temMultiplos ? quantidades.join('+') : String(quantidades[0]);
        
        result.push({
          ...group,
          quantidades,
          quantidadeTotal,
          temMultiplos,
          quantidadeFormatada,
          firstItem: group.items[0],
          firstIndex: group.originalIndices[0]
        });
      }
    });
    
    return result;
  }, [po?.items]);

  // Filtrar itens agrupados baseado nos filtros de pesquisa
  const itensAgrupadosFiltrados = useMemo(() => {
    if (!itensAgrupados) return [];
    
    return itensAgrupados.filter(group => {
      const item = group.firstItem;
      
      // Filtro por código
      if (filtros.codigo) {
        const codigoMatch = (item.codigo_item || '').toLowerCase().includes(filtros.codigo.toLowerCase());
        if (!codigoMatch) return false;
      }
      
      // Filtro por descrição/nome
      if (filtros.descricao) {
        const descricaoMatch = (item.descricao || '').toLowerCase().includes(filtros.descricao.toLowerCase());
        if (!descricaoMatch) return false;
      }
      
      // Filtro por fornecedor
      if (filtros.fornecedor) {
        const fornecedorMatch = (item.fornecedor || '').toLowerCase().includes(filtros.fornecedor.toLowerCase());
        if (!fornecedorMatch) return false;
      }
      
      // Filtro por status
      if (filtros.status) {
        const statusMatch = (item.status || '').toLowerCase() === filtros.status.toLowerCase();
        if (!statusMatch) return false;
      }
      
      return true;
    });
  }, [itensAgrupados, filtros]);

  // Reset página quando filtros mudam
  useEffect(() => {
    setCurrentPage(1);
  }, [filtros]);

  useEffect(() => {
    loadPO();
    // eslint-disable-next-line react-hooks/exhaustive-deps
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

  // Função para atualizar OC com PDF (preencher dados faltantes)
  const handleAtualizarComPDF = async (event) => {
    const file = event.target.files[0];
    if (!file) return;
    
    if (!file.name.toLowerCase().endsWith('.pdf')) {
      alert('Por favor, selecione um arquivo PDF');
      return;
    }
    
    if (!window.confirm(
      `Atualizar ${po.numero_oc} com o PDF "${file.name}"?\n\n` +
      `Esta ação irá:\n` +
      `✅ Preencher ENDEREÇO DE ENTREGA (se estiver vazio)\n` +
      `✅ Preencher DATA DE ENTREGA (se estiver vazia)\n\n` +
      `Esta ação NÃO altera:\n` +
      `🔒 Status dos itens\n` +
      `🔒 Responsáveis\n` +
      `🔒 Fontes de compra\n` +
      `🔒 Notas fiscais\n` +
      `🔒 Observações`
    )) {
      event.target.value = '';
      return;
    }
    
    setAtualizandoPDF(true);
    
    try {
      const formData = new FormData();
      formData.append('file', file);
      
      const token = localStorage.getItem('token');
      const response = await fetch(`${API}/purchase-orders/${id}/atualizar-pdf`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`
        },
        body: formData
      });
      
      const result = await response.json();
      
      if (!response.ok) {
        throw new Error(result.detail || 'Erro ao atualizar');
      }
      
      if (result.campos_atualizados && result.campos_atualizados.length > 0) {
        alert(
          `✅ ${result.message}\n\n` +
          `Campos atualizados:\n${result.campos_atualizados.map(c => `• ${c}`).join('\n')}`
        );
        // Recarregar a OC para mostrar os novos dados
        loadPO();
      } else {
        alert('ℹ️ Nenhum campo precisou ser atualizado (todos já estão preenchidos)');
      }
    } catch (error) {
      console.error('Erro ao atualizar com PDF:', error);
      alert(`❌ Erro ao atualizar: ${error.message}`);
    } finally {
      setAtualizandoPDF(false);
      event.target.value = '';
    }
  };

  // Função para upload de imagem do item
  const handleImageUpload = async (item, file, itemIndex) => {
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
    
    setUploadingImage(itemIndex);
    
    try {
      const formData = new FormData();
      formData.append('file', file);
      
      const token = localStorage.getItem('token');
      const response = await fetch(
        `${API}/itens/${item.codigo_item}/imagem`,
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
      
      // Recarregar a OC para mostrar a nova imagem
      await loadPO();
      
      alert(`✅ Imagem salva com sucesso!\n\nA imagem foi vinculada ao código ${item.codigo_item} e aparecerá automaticamente em todas as OCs.`);
    } catch (error) {
      console.error('Erro ao enviar imagem:', error);
      alert('Erro ao enviar imagem: ' + error.message);
    } finally {
      setUploadingImage(null);
    }
  };

  // Função para deletar imagem do item
  const handleDeleteImage = async (item, itemIndex) => {
    if (!window.confirm(`Remover imagem do item ${item.codigo_item}?\n\nA imagem será removida de TODAS as OCs com este código.`)) return;
    
    setUploadingImage(itemIndex);
    
    try {
      const token = localStorage.getItem('token');
      const response = await fetch(
        `${API}/purchase-orders/${id}/items/by-index/${itemIndex}/imagem`,
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
      
      await loadPO();
      alert('✅ Imagem removida com sucesso!');
    } catch (error) {
      console.error('Erro ao remover imagem:', error);
      alert('Erro ao remover imagem: ' + error.message);
    } finally {
      setUploadingImage(null);
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
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <label 
                className="btn"
                style={{ 
                  background: '#3b82f6', 
                  color: 'white',
                  padding: '0.75rem 1.5rem',
                  cursor: atualizandoPDF ? 'wait' : 'pointer',
                  opacity: atualizandoPDF ? 0.7 : 1
                }}
                data-testid="update-pdf-btn"
              >
                {atualizandoPDF ? '⏳ Atualizando...' : '📄 Atualizar com PDF'}
                <input 
                  type="file" 
                  accept=".pdf"
                  onChange={handleAtualizarComPDF}
                  disabled={atualizandoPDF}
                  style={{ display: 'none' }}
                />
              </label>
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
            </div>
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
          {/* Endereço de Entrega dentro do grid - com edição para admins */}
          <div style={{ gridColumn: 'span 2' }}>
            <div className="stat-label" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              📍 Endereço de Entrega
              {isAdmin() && !editandoEndereco && (
                <button
                  onClick={() => {
                    setNovoEndereco(po.endereco_entrega || '');
                    setEditandoEndereco(true);
                  }}
                  style={{
                    background: 'none',
                    border: 'none',
                    cursor: 'pointer',
                    fontSize: '0.8rem',
                    color: '#3b82f6',
                    padding: '0.1rem 0.3rem'
                  }}
                  title="Editar endereço"
                  data-testid="edit-endereco-btn"
                >
                  ✏️
                </button>
              )}
            </div>
            {editandoEndereco ? (
              <div style={{ marginTop: '0.25rem' }}>
                <textarea
                  value={novoEndereco}
                  onChange={(e) => setNovoEndereco(e.target.value)}
                  placeholder="Digite o endereço de entrega..."
                  style={{
                    width: '100%',
                    padding: '0.5rem 0.75rem',
                    borderRadius: '8px',
                    border: '2px solid #3b82f6',
                    fontSize: '1rem',
                    fontWeight: '600',
                    minHeight: '60px',
                    resize: 'vertical'
                  }}
                  data-testid="endereco-input"
                />
                <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.5rem' }}>
                  <button
                    onClick={handleSalvarEndereco}
                    disabled={salvandoEndereco}
                    className="btn btn-primary"
                    style={{ padding: '0.4rem 0.8rem', fontSize: '0.85rem' }}
                    data-testid="save-endereco-btn"
                  >
                    {salvandoEndereco ? 'Salvando...' : '✅ Salvar'}
                  </button>
                  <button
                    onClick={() => setEditandoEndereco(false)}
                    className="btn"
                    style={{ 
                      padding: '0.4rem 0.8rem', 
                      fontSize: '0.85rem',
                      background: '#e2e8f0',
                      color: '#4a5568'
                    }}
                    data-testid="cancel-endereco-btn"
                  >
                    ❌ Cancelar
                  </button>
                </div>
              </div>
            ) : (
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
            )}
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
          {itensAgrupadosFiltrados.some(g => g.temMultiplos) && (
            <span style={{ 
              fontSize: '0.9rem', 
              fontWeight: '500', 
              color: '#ea580c',
              marginLeft: '0.75rem'
            }}>
              ({itensAgrupadosFiltrados.length} códigos únicos)
            </span>
          )}
          {/* Indicador de filtro ativo */}
          {(filtros.codigo || filtros.descricao || filtros.fornecedor || filtros.status) && (
            <span style={{ 
              fontSize: '0.85rem', 
              fontWeight: '500', 
              color: '#6366f1',
              marginLeft: '0.75rem'
            }}>
              🔍 Mostrando {itensAgrupadosFiltrados.length} de {itensAgrupados.length}
            </span>
          )}
        </h2>

        {/* BARRA DE FILTROS */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
          gap: '0.75rem',
          marginBottom: '1.5rem',
          padding: '1rem',
          background: '#f1f5f9',
          borderRadius: '8px',
          border: '1px solid #e2e8f0'
        }}>
          {/* Filtro por Código */}
          <div>
            <label style={{ fontSize: '0.75rem', fontWeight: '600', color: '#64748b', marginBottom: '0.25rem', display: 'block' }}>
              🔢 Código
            </label>
            <input
              type="text"
              placeholder="Buscar código..."
              value={filtros.codigo}
              onChange={(e) => setFiltros(prev => ({ ...prev, codigo: e.target.value }))}
              style={{
                width: '100%',
                padding: '0.5rem 0.75rem',
                border: '1px solid #cbd5e1',
                borderRadius: '6px',
                fontSize: '0.9rem'
              }}
              data-testid="filtro-codigo"
            />
          </div>
          
          {/* Filtro por Descrição/Nome */}
          <div>
            <label style={{ fontSize: '0.75rem', fontWeight: '600', color: '#64748b', marginBottom: '0.25rem', display: 'block' }}>
              📝 Descrição/Nome
            </label>
            <input
              type="text"
              placeholder="Buscar descrição..."
              value={filtros.descricao}
              onChange={(e) => setFiltros(prev => ({ ...prev, descricao: e.target.value }))}
              style={{
                width: '100%',
                padding: '0.5rem 0.75rem',
                border: '1px solid #cbd5e1',
                borderRadius: '6px',
                fontSize: '0.9rem'
              }}
              data-testid="filtro-descricao"
            />
          </div>
          
          {/* Filtro por Fornecedor */}
          <div>
            <label style={{ fontSize: '0.75rem', fontWeight: '600', color: '#64748b', marginBottom: '0.25rem', display: 'block' }}>
              🏢 Fornecedor
            </label>
            <input
              type="text"
              placeholder="Buscar fornecedor..."
              value={filtros.fornecedor}
              onChange={(e) => setFiltros(prev => ({ ...prev, fornecedor: e.target.value }))}
              style={{
                width: '100%',
                padding: '0.5rem 0.75rem',
                border: '1px solid #cbd5e1',
                borderRadius: '6px',
                fontSize: '0.9rem'
              }}
              data-testid="filtro-fornecedor"
            />
          </div>
          
          {/* Filtro por Status */}
          <div>
            <label style={{ fontSize: '0.75rem', fontWeight: '600', color: '#64748b', marginBottom: '0.25rem', display: 'block' }}>
              📊 Status
            </label>
            <select
              value={filtros.status}
              onChange={(e) => setFiltros(prev => ({ ...prev, status: e.target.value }))}
              style={{
                width: '100%',
                padding: '0.5rem 0.75rem',
                border: '1px solid #cbd5e1',
                borderRadius: '6px',
                fontSize: '0.9rem',
                background: 'white'
              }}
              data-testid="filtro-status"
            >
              <option value="">Todos</option>
              <option value="pendente">⏳ Pendente</option>
              <option value="cotado">💰 Cotado</option>
              <option value="comprado">🛒 Comprado</option>
              <option value="em_separacao">📦 Em Separação</option>
              <option value="pronto_envio">🚚 Pronto p/ Envio</option>
              <option value="em_transito">✈️ Em Trânsito</option>
              <option value="entregue">✅ Entregue</option>
            </select>
          </div>
          
          {/* Botão Limpar Filtros */}
          {(filtros.codigo || filtros.descricao || filtros.fornecedor || filtros.status) && (
            <div style={{ display: 'flex', alignItems: 'flex-end' }}>
              <button
                onClick={() => setFiltros({ codigo: '', descricao: '', fornecedor: '', status: '' })}
                style={{
                  padding: '0.5rem 1rem',
                  background: '#ef4444',
                  color: 'white',
                  border: 'none',
                  borderRadius: '6px',
                  cursor: 'pointer',
                  fontSize: '0.85rem',
                  fontWeight: '600'
                }}
                data-testid="limpar-filtros"
              >
                ✕ Limpar
              </button>
            </div>
          )}
        </div>
        
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {itensAgrupadosFiltrados.length === 0 ? (
            <div style={{
              padding: '2rem',
              textAlign: 'center',
              background: '#fef3c7',
              borderRadius: '8px',
              color: '#92400e'
            }}>
              <div style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>🔍</div>
              <div style={{ fontWeight: '600' }}>Nenhum item encontrado</div>
              <div style={{ fontSize: '0.9rem' }}>Tente ajustar os filtros de pesquisa</div>
            </div>
          ) : (
            itensAgrupadosFiltrados.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage).map((group, groupIndex) => {
            const item = group.firstItem;
            const realIndex = group.firstIndex;
            
            return (
            <div 
              key={group.codigo_item} 
              className="card" 
              style={{ 
                background: group.temMultiplos ? '#fff7ed' : '#f7fafc', 
                border: group.temMultiplos ? '2px solid #f97316' : '1px solid #e2e8f0' 
              }} 
              data-testid={`item-card-${item.codigo_item}`}
            >
              {/* HEADER COM AGRUPAMENTO - Mostra quando há múltiplos itens */}
              {group.temMultiplos && (
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '1rem',
                  marginBottom: '1rem',
                  padding: '0.75rem',
                  background: '#fed7aa',
                  borderRadius: '8px'
                }}>
                  <div style={{
                    background: '#f97316',
                    color: 'white',
                    padding: '0.5rem 1rem',
                    borderRadius: '8px',
                    fontWeight: '700',
                    fontSize: '1.1rem'
                  }}>
                    {group.items.length}x
                  </div>
                  <div>
                    <div style={{ fontWeight: '700', color: '#c2410c', fontSize: '1rem' }}>
                      Itens agrupados: {group.quantidadeFormatada} = {group.quantidadeTotal} {item.unidade || 'UN'}
                    </div>
                    <div style={{ fontSize: '0.85rem', color: '#9a3412' }}>
                      {group.items.length} registros com código {group.codigo_item}
                    </div>
                  </div>
                </div>
              )}
              
              {/* Renderizar cada item do grupo */}
              {group.items.map((groupItem, itemIdx) => {
                const itemRealIndex = group.originalIndices[itemIdx];
                const isLastItem = itemIdx === group.items.length - 1;
                
                return (
                <div 
                  key={itemIdx}
                  style={{ 
                    borderBottom: !isLastItem ? '1px dashed #e5e7eb' : 'none',
                    paddingBottom: !isLastItem ? '1rem' : '0',
                    marginBottom: !isLastItem ? '1rem' : '0'
                  }}
                >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', marginBottom: '1rem' }}>
                <div style={{ display: 'flex', gap: '1rem', flex: 1 }}>
                  {/* Área de foto do item */}
                  <div style={{ 
                    width: '80px', 
                    minWidth: '80px',
                    display: 'flex', 
                    flexDirection: 'column', 
                    alignItems: 'center',
                    gap: '0.25rem'
                  }}>
                    {groupItem.imagem_url ? (
                      <div style={{ position: 'relative' }}>
                        <img 
                          src={`${BACKEND_URL}${groupItem.imagem_url}?t=${Date.now()}`}
                          alt={`Foto do item ${groupItem.codigo_item}`}
                          style={{ 
                            width: '70px', 
                            height: '70px', 
                            objectFit: 'cover', 
                            borderRadius: '8px',
                            border: '2px solid #e2e8f0',
                            cursor: 'pointer'
                          }}
                          onClick={() => setImagemExpandida(`${BACKEND_URL}${groupItem.imagem_url}?t=${Date.now()}`)}
                        />
                        <button
                          onClick={() => handleDeleteImage(groupItem, itemRealIndex)}
                          disabled={uploadingImage === itemRealIndex}
                          style={{
                            position: 'absolute',
                            top: '-6px',
                            right: '-6px',
                            width: '20px',
                            height: '20px',
                            borderRadius: '50%',
                            background: '#ef4444',
                            color: 'white',
                            border: 'none',
                            cursor: 'pointer',
                            fontSize: '0.7rem',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center'
                          }}
                          title="Remover foto"
                        >
                          ×
                        </button>
                      </div>
                    ) : (
                      <label style={{ 
                        width: '70px', 
                        height: '70px', 
                        border: '2px dashed #cbd5e0',
                        borderRadius: '8px',
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        justifyContent: 'center',
                        cursor: 'pointer',
                        background: '#f8fafc',
                        transition: 'all 0.2s'
                      }}>
                        <input
                          type="file"
                          accept="image/*"
                          style={{ display: 'none' }}
                          onChange={(e) => handleImageUpload(item, e.target.files[0], realIndex)}
                          disabled={uploadingImage === realIndex}
                        />
                        {uploadingImage === realIndex ? (
                          <span style={{ fontSize: '0.7rem', color: '#718096' }}>⏳</span>
                        ) : (
                          <>
                            <span style={{ fontSize: '1.2rem' }}>📷</span>
                            <span style={{ fontSize: '0.6rem', color: '#718096', textAlign: 'center' }}>Adicionar foto</span>
                          </>
                        )}
                      </label>
                    )}
                  </div>

                  {/* Informações do item */}
                  <div style={{ flex: 1 }}>
                    <h3 style={{ fontSize: '1.1rem', fontWeight: '700', marginBottom: '0.5rem' }}>
                      Código: {groupItem.codigo_item}
                    </h3>
                    <p style={{ color: '#4a5568', marginBottom: '0.5rem' }}>{groupItem.descricao}</p>
                    <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', fontSize: '0.9rem', color: '#718096' }}>
                      <span><strong>Lote:</strong> {groupItem.lote}</span>
                      <span><strong>Região:</strong> {groupItem.regiao}</span>
                      <span><strong>Responsável:</strong> <strong style={{ color: '#667eea' }}>{groupItem.responsavel}</strong></span>
                      <span><strong>Quantidade:</strong> {groupItem.quantidade} {groupItem.unidade}</span>
                      {groupItem.marca_modelo && <span><strong>Marca/Modelo:</strong> {groupItem.marca_modelo}</span>}
                    </div>
                  </div>
                </div>
                <div>
                  {getStatusBadge(groupItem.status)}
                </div>
              </div>

              {editingItem === itemRealIndex ? (
                <div style={{ marginTop: '1rem', padding: '1rem', background: 'white', borderRadius: '8px' }}>
                  {/* Status e campos admin */}
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem', marginBottom: '1.5rem' }}>
                    <div className="form-group">
                      <label className="form-label">Status</label>
                      <select
                        className="form-input"
                        value={formData.status}
                        onChange={(e) => setFormData({ ...formData, status: e.target.value })}
                        data-testid={`select-status-${groupItem.codigo_item}`}
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
                            data-testid={`input-preco-venda-${groupItem.codigo_item}`}
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
                            data-testid={`input-imposto-${groupItem.codigo_item}`}
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
                            data-testid={`input-frete-envio-${groupItem.codigo_item}`}
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
                        data-testid={`add-fonte-${groupItem.codigo_item}`}
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
                          const qtdRestante = (formData.quantidade_total || groupItem.quantidade) - totalQtd;
                          return (
                            <>
                              <span>
                                <strong>Total Qtd:</strong> {totalQtd} / {formData.quantidade_total || groupItem.quantidade}
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
                    <button onClick={cancelEdit} className="btn btn-secondary" style={{ padding: '0.5rem 1rem', fontSize: '0.9rem' }} data-testid={`cancel-edit-${itemRealIndex}`}>
                      Cancelar
                    </button>
                    <button onClick={() => saveEdit(groupItem, itemRealIndex)} className="btn btn-primary" style={{ padding: '0.5rem 1rem', fontSize: '0.9rem' }} data-testid={`save-edit-${itemRealIndex}`}>
                      Salvar
                    </button>
                  </div>
                </div>
              ) : (
                <div style={{ marginTop: '1rem' }}>
                  {/* Mostrar fontes de compra se existirem */}
                  {groupItem.fontes_compra && groupItem.fontes_compra.length > 0 && (
                    <div style={{ marginBottom: '1rem', padding: '0.75rem', background: '#e8f4fd', borderRadius: '8px' }}>
                      <div style={{ fontWeight: '600', marginBottom: '0.5rem', color: '#4a5568', fontSize: '0.9rem' }}>
                        📦 Locais de Compra ({groupItem.fontes_compra.length})
                      </div>
                      {groupItem.fontes_compra.map((fc, idx) => (
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
                      {groupItem.preco_venda && (
                        <span>
                          <strong>Preço Venda:</strong> {formatBRL(groupItem.preco_venda)}
                          {groupItem.quantidade && <small> (Total: {formatBRL(groupItem.preco_venda * groupItem.quantidade)})</small>}
                        </span>
                      )}
                      {groupItem.preco_compra && <span><strong>Compra Média:</strong> {formatBRL(groupItem.preco_compra)}</span>}
                      {groupItem.frete_compra && <span><strong>Frete Compra:</strong> {formatBRL(groupItem.frete_compra)}</span>}
                      {isAdmin() && groupItem.frete_envio && <span><strong>Frete Envio:</strong> {formatBRL(groupItem.frete_envio)}</span>}
                      {isAdmin() && groupItem.lucro_liquido !== undefined && groupItem.lucro_liquido !== null && <span><strong>Lucro:</strong> <span style={{ color: groupItem.lucro_liquido > 0 ? '#10b981' : '#ef4444', fontWeight: '700' }}>{formatBRL(groupItem.lucro_liquido)}</span></span>}
                    </div>
                    <button onClick={() => startEdit(groupItem, itemRealIndex)} className="btn btn-secondary" style={{ padding: '0.5rem 1rem', fontSize: '0.85rem' }} data-testid={`edit-item-${itemRealIndex}`}>
                      Editar
                    </button>
                  </div>
                </div>
              )}
                </div>
                );
              })}
            </div>
          );
          })
          )}
          
          {/* Modal de imagem expandida */}
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
                zIndex: 1000,
                cursor: 'pointer'
              }}
            >
              <img 
                src={imagemExpandida}
                alt="Imagem expandida"
                style={{ 
                  maxWidth: '90%', 
                  maxHeight: '90%', 
                  objectFit: 'contain',
                  borderRadius: '8px'
                }}
              />
              <button
                onClick={() => setImagemExpandida(null)}
                style={{
                  position: 'absolute',
                  top: '20px',
                  right: '20px',
                  background: 'white',
                  border: 'none',
                  borderRadius: '50%',
                  width: '40px',
                  height: '40px',
                  fontSize: '1.5rem',
                  cursor: 'pointer'
                }}
              >
                ×
              </button>
            </div>
          )}
          
          {/* Paginação */}
          {itensAgrupadosFiltrados.length > 5 && (
            <Pagination
              totalItems={itensAgrupadosFiltrados.length}
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
