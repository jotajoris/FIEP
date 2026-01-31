import React, { useState, useEffect, useMemo } from 'react';
import { apiGet, API } from '../utils/api';
import Pagination from '../components/Pagination';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL || '';

const Galeria = () => {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [imagensMap, setImagensMap] = useState({});
  
  // Upload state
  const [uploadingItem, setUploadingItem] = useState(null);
  const [imagemExpandida, setImagemExpandida] = useState(null);
  
  // Filtros
  const [filtros, setFiltros] = useState({
    codigo: '',
    descricao: ''
  });
  
  // Paginação
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(20);

  useEffect(() => {
    loadItems();
    loadImagensMap();
  }, []);

  const loadItems = async () => {
    setLoading(true);
    try {
      // Buscar todos os itens únicos de todas as OCs
      const response = await apiGet(`${API}/purchase-orders?limit=0`);
      const purchaseOrders = response.data.data || response.data || [];
      
      // Extrair itens únicos por código
      const itemsMap = {};
      purchaseOrders.forEach(po => {
        po.items.forEach(item => {
          const codigo = item.codigo_item;
          if (!itemsMap[codigo]) {
            itemsMap[codigo] = {
              codigo_item: codigo,
              descricao: item.descricao || '',
              marca_modelo: item.marca_modelo || '',
              ncm: item.ncm || '',
              unidade: item.unidade || '',
              qtd_total: 0,
              ocs: []
            };
          }
          itemsMap[codigo].qtd_total += item.quantidade || 0;
          if (!itemsMap[codigo].ocs.includes(po.numero_oc)) {
            itemsMap[codigo].ocs.push(po.numero_oc);
          }
          // Usar descrição mais completa se disponível
          if (item.descricao && item.descricao.length > itemsMap[codigo].descricao.length) {
            itemsMap[codigo].descricao = item.descricao;
          }
        });
      });
      
      // Converter para array e ordenar por código
      const itemsArray = Object.values(itemsMap).sort((a, b) => 
        a.codigo_item.localeCompare(b.codigo_item)
      );
      
      setItems(itemsArray);
    } catch (err) {
      console.error('Erro ao carregar itens:', err);
      setError('Erro ao carregar itens');
    } finally {
      setLoading(false);
    }
  };

  const loadImagensMap = async () => {
    try {
      const response = await apiGet(`${API}/imagens-itens/mapa`);
      setImagensMap(response.data || {});
    } catch (err) {
      console.warn('Erro ao carregar mapa de imagens:', err);
    }
  };

  // Função para fazer upload de imagem
  const handleImageUpload = async (codigoItem, event) => {
    const file = event.target.files[0];
    if (!file) return;

    // Validar tipo
    if (!file.type.startsWith('image/')) {
      alert('Por favor, selecione apenas arquivos de imagem.');
      return;
    }

    // Validar tamanho (max 5MB)
    if (file.size > 5 * 1024 * 1024) {
      alert('A imagem deve ter no máximo 5MB.');
      return;
    }

    setUploadingItem(codigoItem);

    try {
      const formData = new FormData();
      formData.append('file', file);

      const token = localStorage.getItem('token');
      const response = await fetch(`${API}/itens/${codigoItem}/imagem`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`
        },
        body: formData
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.detail || 'Erro no upload');
      }

      const data = await response.json();
      
      // Atualizar mapa de imagens
      setImagensMap(prev => ({
        ...prev,
        [codigoItem]: data.imagem_url
      }));

      alert('Imagem salva com sucesso!');
    } catch (err) {
      console.error('Erro no upload:', err);
      alert('Erro ao fazer upload: ' + err.message);
    } finally {
      setUploadingItem(null);
    }
  };

  // Construir URL da imagem
  const getImageUrl = (codigoItem) => {
    const imagemUrl = imagensMap[codigoItem];
    if (!imagemUrl) return null;
    
    if (imagemUrl.startsWith('http')) {
      return imagemUrl;
    } else if (imagemUrl.startsWith('/api/')) {
      return `${BACKEND_URL}${imagemUrl}`;
    } else if (imagemUrl.startsWith('data:')) {
      return imagemUrl;
    } else {
      return `${BACKEND_URL}/api/item-images-db/${codigoItem}`;
    }
  };

  // Filtrar itens
  const itensFiltrados = useMemo(() => {
    return items.filter(item => {
      const matchCodigo = !filtros.codigo || 
        item.codigo_item.toLowerCase().includes(filtros.codigo.toLowerCase());
      const matchDescricao = !filtros.descricao || 
        item.descricao.toLowerCase().includes(filtros.descricao.toLowerCase());
      return matchCodigo && matchDescricao;
    });
  }, [items, filtros]);

  // Paginação
  const totalPages = Math.ceil(itensFiltrados.length / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const itensPaginados = itensFiltrados.slice(startIndex, startIndex + itemsPerPage);

  // Reset página ao filtrar
  useEffect(() => {
    setCurrentPage(1);
  }, [filtros]);

  if (loading) {
    return (
      <div data-testid="galeria-page">
        <div className="page-header">
          <h1 className="page-title">🖼️ Galeria de Itens</h1>
        </div>
        <div className="card" style={{ textAlign: 'center', padding: '3rem' }}>
          <p>Carregando itens...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div data-testid="galeria-page">
        <div className="page-header">
          <h1 className="page-title">🖼️ Galeria de Itens</h1>
        </div>
        <div className="card" style={{ textAlign: 'center', padding: '3rem', color: '#dc2626' }}>
          <p>{error}</p>
          <button onClick={loadItems} className="btn btn-primary" style={{ marginTop: '1rem' }}>
            Tentar novamente
          </button>
        </div>
      </div>
    );
  }

  return (
    <div data-testid="galeria-page">
      <div className="page-header">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
          <div>
            <h1 className="page-title">🖼️ Galeria de Itens</h1>
            <p className="page-subtitle">{items.length} itens únicos no sistema</p>
          </div>
          <div style={{ 
            background: '#e0e7ff', 
            padding: '0.75rem 1.5rem', 
            borderRadius: '8px',
            fontWeight: '600',
            color: '#4338ca'
          }}>
            {Object.keys(imagensMap).length} fotos cadastradas
          </div>
        </div>
      </div>

      {/* Filtros */}
      <div className="card" style={{ marginBottom: '1.5rem' }}>
        <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', alignItems: 'center' }}>
          <div style={{ flex: '1', minWidth: '150px' }}>
            <label style={{ fontSize: '0.8rem', color: '#6b7280', marginBottom: '0.25rem', display: 'block' }}>
              Código
            </label>
            <input
              type="text"
              placeholder="Buscar por código..."
              value={filtros.codigo}
              onChange={(e) => setFiltros(prev => ({ ...prev, codigo: e.target.value }))}
              style={{ 
                width: '100%', 
                padding: '0.5rem 0.75rem', 
                border: '1px solid #d1d5db', 
                borderRadius: '6px',
                fontSize: '0.9rem'
              }}
              data-testid="filter-codigo"
            />
          </div>
          <div style={{ flex: '2', minWidth: '250px' }}>
            <label style={{ fontSize: '0.8rem', color: '#6b7280', marginBottom: '0.25rem', display: 'block' }}>
              Descrição
            </label>
            <input
              type="text"
              placeholder="Buscar por descrição..."
              value={filtros.descricao}
              onChange={(e) => setFiltros(prev => ({ ...prev, descricao: e.target.value }))}
              style={{ 
                width: '100%', 
                padding: '0.5rem 0.75rem', 
                border: '1px solid #d1d5db', 
                borderRadius: '6px',
                fontSize: '0.9rem'
              }}
              data-testid="filter-descricao"
            />
          </div>
          <div style={{ minWidth: '120px' }}>
            <label style={{ fontSize: '0.8rem', color: '#6b7280', marginBottom: '0.25rem', display: 'block' }}>
              Itens/página
            </label>
            <select
              value={itemsPerPage}
              onChange={(e) => setItemsPerPage(Number(e.target.value))}
              style={{ 
                width: '100%', 
                padding: '0.5rem 0.75rem', 
                border: '1px solid #d1d5db', 
                borderRadius: '6px',
                fontSize: '0.9rem'
              }}
            >
              <option value={10}>10</option>
              <option value={20}>20</option>
              <option value={50}>50</option>
              <option value={100}>100</option>
            </select>
          </div>
          {(filtros.codigo || filtros.descricao) && (
            <button
              onClick={() => setFiltros({ codigo: '', descricao: '' })}
              style={{ 
                padding: '0.5rem 1rem', 
                background: '#6b7280', 
                color: 'white', 
                border: 'none', 
                borderRadius: '6px',
                cursor: 'pointer',
                alignSelf: 'flex-end',
                marginBottom: '2px'
              }}
            >
              Limpar filtros
            </button>
          )}
        </div>
        <div style={{ marginTop: '0.75rem', fontSize: '0.85rem', color: '#6b7280' }}>
          Mostrando {itensFiltrados.length} de {items.length} itens
        </div>
      </div>

      {/* Grid de Itens */}
      <div style={{ 
        display: 'grid', 
        gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', 
        gap: '1rem' 
      }}>
        {itensPaginados.map((item) => {
          const imageUrl = getImageUrl(item.codigo_item);
          const isUploading = uploadingItem === item.codigo_item;
          
          return (
            <div 
              key={item.codigo_item}
              className="card"
              style={{ 
                padding: '1rem',
                display: 'flex',
                flexDirection: 'column',
                gap: '0.75rem',
                transition: 'box-shadow 0.2s',
                cursor: 'default'
              }}
              data-testid={`galeria-item-${item.codigo_item}`}
            >
              {/* Imagem */}
              <div style={{ 
                width: '100%', 
                height: '180px', 
                background: '#f3f4f6',
                borderRadius: '8px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                overflow: 'hidden',
                position: 'relative'
              }}>
                {imageUrl ? (
                  <img
                    src={imageUrl}
                    alt={item.codigo_item}
                    style={{ 
                      maxWidth: '100%', 
                      maxHeight: '100%', 
                      objectFit: 'contain',
                      cursor: 'pointer'
                    }}
                    onClick={() => setImagemExpandida(imageUrl)}
                    onError={(e) => {
                      e.target.style.display = 'none';
                      e.target.nextSibling.style.display = 'flex';
                    }}
                  />
                ) : null}
                <div style={{ 
                  display: imageUrl ? 'none' : 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  color: '#9ca3af',
                  gap: '0.5rem'
                }}>
                  <span style={{ fontSize: '2.5rem' }}>📷</span>
                  <span style={{ fontSize: '0.85rem' }}>Sem foto</span>
                </div>
                
                {/* Botão de Upload sobre a imagem */}
                <label
                  style={{
                    position: 'absolute',
                    bottom: '8px',
                    right: '8px',
                    background: isUploading ? '#9ca3af' : '#3b82f6',
                    color: 'white',
                    padding: '0.4rem 0.75rem',
                    borderRadius: '6px',
                    fontSize: '0.75rem',
                    fontWeight: '600',
                    cursor: isUploading ? 'wait' : 'pointer',
                    boxShadow: '0 2px 4px rgba(0,0,0,0.2)',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.25rem'
                  }}
                >
                  {isUploading ? '⏳ Enviando...' : '📤 Upload'}
                  <input
                    type="file"
                    accept="image/*"
                    onChange={(e) => handleImageUpload(item.codigo_item, e)}
                    disabled={isUploading}
                    style={{ display: 'none' }}
                  />
                </label>
              </div>

              {/* Código */}
              <div style={{ 
                fontWeight: '700', 
                fontSize: '1.1rem', 
                color: '#1e40af',
                fontFamily: 'monospace'
              }}>
                {item.codigo_item}
              </div>

              {/* Descrição */}
              <div style={{ 
                fontSize: '0.85rem', 
                color: '#4b5563',
                lineHeight: '1.4',
                minHeight: '2.8rem',
                overflow: 'hidden',
                display: '-webkit-box',
                WebkitLineClamp: 2,
                WebkitBoxOrient: 'vertical'
              }} title={item.descricao}>
                {item.descricao || 'Sem descrição'}
              </div>

              {/* Info adicional */}
              <div style={{ 
                display: 'flex', 
                justifyContent: 'space-between', 
                fontSize: '0.75rem', 
                color: '#9ca3af',
                borderTop: '1px solid #f3f4f6',
                paddingTop: '0.5rem'
              }}>
                <span>Qtd total: {item.qtd_total}</span>
                <span>{item.ocs.length} OC(s)</span>
              </div>
            </div>
          );
        })}
      </div>

      {/* Paginação */}
      {totalPages > 1 && (
        <div style={{ marginTop: '2rem' }}>
          <Pagination
            currentPage={currentPage}
            totalPages={totalPages}
            onPageChange={setCurrentPage}
            totalItems={itensFiltrados.length}
            itemsPerPage={itemsPerPage}
          />
        </div>
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
            zIndex: 2000,
            cursor: 'zoom-out'
          }}
          data-testid="image-modal"
        >
          <img
            src={imagemExpandida}
            alt="Imagem expandida"
            style={{
              maxWidth: '90vw',
              maxHeight: '90vh',
              objectFit: 'contain',
              borderRadius: '8px',
              boxShadow: '0 4px 20px rgba(0,0,0,0.5)'
            }}
            onClick={(e) => e.stopPropagation()}
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
              fontSize: '1.25rem',
              cursor: 'pointer',
              boxShadow: '0 2px 8px rgba(0,0,0,0.3)'
            }}
          >
            ✕
          </button>
        </div>
      )}
    </div>
  );
};

export default Galeria;
