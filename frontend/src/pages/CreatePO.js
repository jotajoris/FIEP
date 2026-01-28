import React, { useState, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { apiPost, API, formatBRL } from '../utils/api';

const CreatePO = () => {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState('pdf'); // 'pdf', 'manual', or 'atualizar'
  const [numeroOC, setNumeroOC] = useState('');
  const [enderecoEntrega, setEnderecoEntrega] = useState('');
  const [items, setItems] = useState([{
    codigo_item: '',
    quantidade: 1,
    unidade: 'UN',
    preco_venda: ''
  }]);
  const [pdfFiles, setPdfFiles] = useState([]);  // Alterado para múltiplos arquivos
  const [loading, setLoading] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [uploadMode, setUploadMode] = useState('single'); // 'single' ou 'multiple'
  const [multipleResults, setMultipleResults] = useState(null); // Resultados do upload múltiplo
  
  // Estados para atualização de OCs
  const [updateFiles, setUpdateFiles] = useState([]);
  const [updateResults, setUpdateResults] = useState(null);
  const [isDraggingUpdate, setIsDraggingUpdate] = useState(false);
  
  // Estados para preview do PDF (modo single)
  const [pdfPreview, setPdfPreview] = useState(null);
  const [showPreview, setShowPreview] = useState(false);
  const [editingPreviewItem, setEditingPreviewItem] = useState(null);
  const [editForm, setEditForm] = useState({});

  // Handlers para drag and drop
  const handleDragEnter = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  }, []);

  const handleDragOver = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  const handleDrop = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    
    const files = Array.from(e.dataTransfer.files).filter(
      f => f.type === 'application/pdf' || f.name.toLowerCase().endsWith('.pdf')
    );
    
    if (files.length > 0) {
      if (files.length === 1) {
        setPdfFiles(files);
        setUploadMode('single');
      } else {
        setPdfFiles(files);
        setUploadMode('multiple');
      }
    } else {
      alert('Por favor, selecione apenas arquivos PDF');
    }
  }, []);
  
  // Handler para seleção de arquivos via input
  const handleFileSelect = (e) => {
    const files = Array.from(e.target.files).filter(
      f => f.type === 'application/pdf' || f.name.toLowerCase().endsWith('.pdf')
    );
    if (files.length > 0) {
      if (files.length === 1) {
        setPdfFiles(files);
        setUploadMode('single');
      } else {
        setPdfFiles(files);
        setUploadMode('multiple');
      }
    }
  };
  
  // Upload múltiplo
  const handleMultipleUpload = async () => {
    if (pdfFiles.length === 0) return;
    
    setLoading(true);
    setMultipleResults(null);
    
    try {
      const token = localStorage.getItem('token');
      const formData = new FormData();
      pdfFiles.forEach(file => {
        formData.append('files', file);
      });
      
      const response = await fetch(`${API}/purchase-orders/upload-multiple-pdfs`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`
        },
        body: formData
      });
      
      const data = await response.json();
      
      if (!response.ok) {
        throw new Error(data.detail || 'Erro ao processar PDFs');
      }
      
      setMultipleResults(data);
      
    } catch (error) {
      console.error('Erro no upload múltiplo:', error);
      alert(error.message || 'Erro ao processar PDFs');
    } finally {
      setLoading(false);
    }
  };

  const addItem = () => {
    setItems([...items, {
      codigo_item: '',
      quantidade: 1,
      unidade: 'UN',
      preco_venda: ''
    }]);
  };

  const removeItem = (index) => {
    const newItems = items.filter((_, i) => i !== index);
    setItems(newItems);
  };

  const updateItem = (index, field, value) => {
    const newItems = [...items];
    newItems[index][field] = value;
    setItems(newItems);
  };

  const handleSubmitManual = async (e) => {
    e.preventDefault();
    
    if (!items.some(item => item.codigo_item)) {
      alert('Adicione pelo menos um item com código');
      return;
    }

    setLoading(true);
    try {
      const response = await apiPost(`${API}/purchase-orders`, {
        numero_oc: numeroOC,
        endereco_entrega: enderecoEntrega,
        items: items.map(item => ({
          ...item,
          quantidade: parseInt(item.quantidade),
          preco_venda: item.preco_venda ? parseFloat(item.preco_venda) : null,
          endereco_entrega: enderecoEntrega,
          lote: '',
          lot_number: 0,
          regiao: ''
        }))
      });

      alert('Ordem de Compra criada com sucesso!');
      navigate(`/po/${response.data.id}`);
    } catch (error) {
      console.error('Erro ao criar OC:', error);
      
      // Verificar se é erro de OC duplicada
      if (error.response?.status === 409) {
        const verExistente = window.confirm(
          `⚠️ A Ordem de Compra "${numeroOC}" já existe no sistema!\n\n` +
          `Não é possível criar uma OC com o mesmo número.\n\n` +
          `Deseja visualizar a OC existente?`
        );
        
        if (verExistente) {
          // Buscar ID da OC existente e navegar
          try {
            const token = localStorage.getItem('token');
            const checkResponse = await fetch(`${API}/purchase-orders/check-duplicate/${encodeURIComponent(numeroOC)}`, {
              headers: { 'Authorization': `Bearer ${token}` }
            });
            const checkData = await checkResponse.json();
            if (checkData.exists && checkData.existing_po?.id) {
              navigate(`/po/${checkData.existing_po.id}`);
            } else {
              navigate('/');
            }
          } catch {
            navigate('/');
          }
        }
      } else {
        alert(error.response?.data?.detail || 'Erro ao criar Ordem de Compra. Verifique os dados.');
      }
    } finally {
      setLoading(false);
    }
  };

  // Preview do PDF (não cria a OC ainda) - modo single
  const handlePreviewPDF = async (e) => {
    e.preventDefault();
    
    if (pdfFiles.length === 0) {
      alert('Por favor, selecione um arquivo PDF');
      return;
    }

    setLoading(true);
    try {
      const formData = new FormData();
      formData.append('file', pdfFiles[0]);

      const token = localStorage.getItem('token');
      const response = await fetch(`${API}/purchase-orders/preview-pdf`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`
        },
        body: formData
      });

      const data = await response.json();
      
      if (!response.ok) {
        throw new Error(data.detail || 'Erro ao processar PDF');
      }

      setPdfPreview(data);
      setShowPreview(true);
    } catch (error) {
      console.error('Erro ao processar PDF:', error);
      alert(error.message || 'Erro ao processar PDF. Verifique o arquivo e tente novamente.');
    } finally {
      setLoading(false);
    }
  };

  // Confirmar criação da OC após preview (usa dados editados)
  const handleConfirmPDF = async () => {
    if (!pdfPreview || pdfPreview.items.length === 0) {
      alert('Erro: nenhum item para criar');
      return;
    }

    setLoading(true);
    try {
      // Criar OC usando os dados editados do preview (não re-processa o PDF)
      const response = await apiPost(`${API}/purchase-orders`, {
        numero_oc: pdfPreview.numero_oc,
        endereco_entrega: pdfPreview.endereco_entrega || '',
        data_entrega: pdfPreview.data_entrega || null,
        items: pdfPreview.items.map(item => ({
          codigo_item: item.codigo_item,
          quantidade: parseInt(item.quantidade) || 1,
          unidade: item.unidade || 'UN',
          descricao: item.descricao || '',
          endereco_entrega: pdfPreview.endereco_entrega || '',
          responsavel: item.responsavel || '',
          lote: item.lote || '',
          lot_number: 0,
          regiao: item.regiao || '',
          preco_venda: item.preco_venda || null
        }))
      });

      alert(`OC ${pdfPreview.numero_oc} criada com sucesso! ${pdfPreview.items.length} itens.`);
      navigate(`/po/${response.data.id}`);
    } catch (error) {
      console.error('Erro ao criar OC:', error);
      
      // Verificar se é erro de OC duplicada
      if (error.response?.status === 409) {
        const verExistente = window.confirm(
          `⚠️ A Ordem de Compra "${pdfPreview.numero_oc}" já existe no sistema!\n\n` +
          `Não é possível criar uma OC com o mesmo número.\n\n` +
          `Deseja visualizar a OC existente?`
        );
        
        if (verExistente) {
          // Buscar ID da OC existente e navegar
          try {
            const token = localStorage.getItem('token');
            const checkResponse = await fetch(`${API}/purchase-orders/check-duplicate/${encodeURIComponent(pdfPreview.numero_oc)}`, {
              headers: { 'Authorization': `Bearer ${token}` }
            });
            const checkData = await checkResponse.json();
            if (checkData.exists && checkData.existing_po?.id) {
              navigate(`/po/${checkData.existing_po.id}`);
            } else {
              navigate('/');
            }
          } catch {
            navigate('/');
          }
        }
      } else {
        alert(error.response?.data?.detail || error.message || 'Erro ao criar Ordem de Compra.');
      }
    } finally {
      setLoading(false);
    }
  };

  const cancelPreview = () => {
    setShowPreview(false);
    setPdfPreview(null);
    setPdfFile(null);
    setEditingPreviewItem(null);
    setEditForm({});
  };

  // Funções para editar itens no preview
  const startEditPreviewItem = (index) => {
    const item = pdfPreview.items[index];
    setEditingPreviewItem(index);
    setEditForm({
      codigo_item: item.codigo_item,
      quantidade: item.quantidade,
      unidade: item.unidade,
      descricao: item.descricao || '',
      responsavel: item.responsavel || '',
      preco_venda: item.preco_venda || '',
      lote: item.lote || ''
    });
  };

  const saveEditPreviewItem = () => {
    if (editingPreviewItem === null) return;
    
    const updatedItems = [...pdfPreview.items];
    updatedItems[editingPreviewItem] = {
      ...updatedItems[editingPreviewItem],
      codigo_item: editForm.codigo_item,
      quantidade: parseInt(editForm.quantidade) || 1,
      unidade: editForm.unidade,
      descricao: editForm.descricao,
      responsavel: editForm.responsavel,
      preco_venda: editForm.preco_venda ? parseFloat(editForm.preco_venda) : null,
      lote: editForm.lote
    };
    
    setPdfPreview({
      ...pdfPreview,
      items: updatedItems
    });
    setEditingPreviewItem(null);
    setEditForm({});
  };

  const cancelEditPreviewItem = () => {
    setEditingPreviewItem(null);
    setEditForm({});
  };

  const removePreviewItem = (index) => {
    if (!window.confirm('Remover este item da OC?')) return;
    
    const updatedItems = pdfPreview.items.filter((_, i) => i !== index);
    setPdfPreview({
      ...pdfPreview,
      items: updatedItems,
      total_items: updatedItems.length
    });
  };

  const addPreviewItem = () => {
    const newItem = {
      codigo_item: '',
      quantidade: 1,
      unidade: 'UN',
      descricao: '',
      responsavel: '',
      lote: '',
      preco_venda: null
    };
    
    setPdfPreview({
      ...pdfPreview,
      items: [...pdfPreview.items, newItem],
      total_items: pdfPreview.items.length + 1
    });
    
    // Iniciar edição do novo item
    setEditingPreviewItem(pdfPreview.items.length);
    setEditForm({
      codigo_item: '',
      quantidade: 1,
      unidade: 'UN',
      descricao: '',
      responsavel: '',
      lote: '',
      preco_venda: ''
    });
  };

  // ============== FUNÇÕES PARA ATUALIZAR OCs ==============
  
  const handleUpdateDragEnter = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDraggingUpdate(true);
  }, []);

  const handleUpdateDragLeave = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDraggingUpdate(false);
  }, []);

  const handleUpdateDragOver = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  const handleUpdateDrop = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDraggingUpdate(false);
    
    const files = Array.from(e.dataTransfer.files).filter(
      f => f.type === 'application/pdf' || f.name.toLowerCase().endsWith('.pdf')
    );
    
    if (files.length > 0) {
      setUpdateFiles(prev => [...prev, ...files]);
    }
  }, []);

  const handleUpdateFileSelect = (e) => {
    const files = Array.from(e.target.files).filter(
      f => f.type === 'application/pdf' || f.name.toLowerCase().endsWith('.pdf')
    );
    if (files.length > 0) {
      setUpdateFiles(prev => [...prev, ...files]);
    }
  };

  const removeUpdateFile = (index) => {
    setUpdateFiles(prev => prev.filter((_, i) => i !== index));
  };

  const clearUpdateFiles = () => {
    setUpdateFiles([]);
    setUpdateResults(null);
  };

  const handleUpdateOCs = async () => {
    if (updateFiles.length === 0) {
      alert('Selecione pelo menos um arquivo PDF');
      return;
    }

    setLoading(true);
    setUpdateResults(null);

    try {
      const formData = new FormData();
      updateFiles.forEach(file => {
        formData.append('files', file);
      });

      const response = await apiPost(`${API}/admin/atualizar-todas-ocs-pdf`, formData);

      setUpdateResults(response.data);
      setUpdateFiles([]);
    } catch (error) {
      console.error('Erro ao atualizar OCs:', error);
      const errorData = error.response?.data;
      let errorMessage = 'Erro ao atualizar OCs';
      
      if (typeof errorData === 'string') {
        errorMessage = errorData;
      } else if (errorData?.detail) {
        errorMessage = typeof errorData.detail === 'string' ? errorData.detail : JSON.stringify(errorData.detail);
      } else if (errorData?.message) {
        errorMessage = errorData.message;
      } else if (error.message) {
        errorMessage = error.message;
      }
      
      alert(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  // ============ HANDLERS NCM ============
  return (
    <div data-testid="create-po-page">
      <div className="page-header">
        <h1 className="page-title" data-testid="create-po-title">Nova Ordem de Compra</h1>
        <p className="page-subtitle">Cadastre uma nova OC recebida do FIEP</p>
      </div>

      <div className="card">
        {/* Preview do PDF */}
        {showPreview && pdfPreview ? (
          <div data-testid="pdf-preview">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
              <div>
                <h2 style={{ fontSize: '1.5rem', fontWeight: '700', marginBottom: '0.5rem' }}>
                  📋 Preview da OC: {pdfPreview.numero_oc}
                </h2>
                <p style={{ color: '#718096' }}>
                  {pdfPreview.items.length} itens • Revise e edite antes de confirmar
                </p>
              </div>
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <button 
                  onClick={addPreviewItem}
                  className="btn btn-secondary"
                  data-testid="add-preview-item-btn"
                >
                  + Adicionar Item
                </button>
                <button 
                  onClick={cancelPreview} 
                  className="btn btn-secondary"
                  data-testid="cancel-preview-btn"
                >
                  ← Voltar
                </button>
              </div>
            </div>

            {pdfPreview.endereco_entrega && (
              <div style={{ background: '#f0f4f8', padding: '1rem', borderRadius: '8px', marginBottom: '1rem' }}>
                <strong>📍 Endereço de Entrega:</strong> {pdfPreview.endereco_entrega}
                {pdfPreview.cep && <span style={{ marginLeft: '0.5rem', color: '#22c55e', fontWeight: '600' }}>✓ CEP encontrado</span>}
              </div>
            )}
            
            {pdfPreview.data_entrega && (
              <div style={{ background: '#dcfce7', padding: '1rem', borderRadius: '8px', marginBottom: '1.5rem' }}>
                <strong>📅 Data de Entrega:</strong> {new Date(pdfPreview.data_entrega + 'T00:00:00').toLocaleDateString('pt-BR')}
              </div>
            )}

            {pdfPreview.items_without_ref?.length > 0 && (
              <div style={{ background: '#fef3c7', padding: '1rem', borderRadius: '8px', marginBottom: '1.5rem', border: '1px solid #f59e0b' }}>
                <strong>⚠️ Atenção:</strong> {pdfPreview.items_without_ref.length} itens não encontrados no banco de referência:
                <br />
                <small>{pdfPreview.items_without_ref.join(', ')}</small>
              </div>
            )}

            <div style={{ maxHeight: '450px', overflowY: 'auto', marginBottom: '1.5rem' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead style={{ position: 'sticky', top: 0, background: '#667eea', color: 'white' }}>
                  <tr>
                    <th style={{ padding: '0.75rem', textAlign: 'left' }}>#</th>
                    <th style={{ padding: '0.75rem', textAlign: 'left' }}>Código</th>
                    <th style={{ padding: '0.75rem', textAlign: 'left' }}>Descrição</th>
                    <th style={{ padding: '0.75rem', textAlign: 'center' }}>Qtd</th>
                    <th style={{ padding: '0.75rem', textAlign: 'left' }}>Responsável</th>
                    <th style={{ padding: '0.75rem', textAlign: 'left' }}>Lote</th>
                    <th style={{ padding: '0.75rem', textAlign: 'right' }}>Preço Venda</th>
                    <th style={{ padding: '0.75rem', textAlign: 'center' }}>Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {pdfPreview.items.map((item, index) => (
                    editingPreviewItem === index ? (
                      <tr key={index} style={{ background: '#e8f4fd' }}>
                        <td style={{ padding: '0.5rem' }}>{index + 1}</td>
                        <td style={{ padding: '0.5rem' }}>
                          <input
                            type="text"
                            className="form-input"
                            value={editForm.codigo_item}
                            onChange={(e) => setEditForm({...editForm, codigo_item: e.target.value})}
                            style={{ padding: '0.4rem', width: '90px' }}
                          />
                        </td>
                        <td style={{ padding: '0.5rem' }}>
                          <input
                            type="text"
                            className="form-input"
                            value={editForm.descricao}
                            onChange={(e) => setEditForm({...editForm, descricao: e.target.value})}
                            style={{ padding: '0.4rem', width: '100%' }}
                          />
                        </td>
                        <td style={{ padding: '0.5rem' }}>
                          <div style={{ display: 'flex', gap: '0.25rem' }}>
                            <input
                              type="number"
                              className="form-input"
                              value={editForm.quantidade}
                              onChange={(e) => setEditForm({...editForm, quantidade: e.target.value})}
                              style={{ padding: '0.4rem', width: '60px' }}
                              min="1"
                            />
                            <input
                              type="text"
                              className="form-input"
                              value={editForm.unidade}
                              onChange={(e) => setEditForm({...editForm, unidade: e.target.value})}
                              style={{ padding: '0.4rem', width: '50px' }}
                            />
                          </div>
                        </td>
                        <td style={{ padding: '0.5rem' }}>
                          <select
                            className="form-input"
                            value={editForm.responsavel}
                            onChange={(e) => setEditForm({...editForm, responsavel: e.target.value})}
                            style={{ padding: '0.4rem' }}
                          >
                            <option value="">Selecione...</option>
                            <option value="Maria">Maria</option>
                            <option value="Mateus">Mateus</option>
                            <option value="João">João</option>
                            <option value="Mylena">Mylena</option>
                            <option value="Fabio">Fabio</option>
                          </select>
                        </td>
                        <td style={{ padding: '0.5rem' }}>
                          <input
                            type="text"
                            className="form-input"
                            value={editForm.lote}
                            onChange={(e) => setEditForm({...editForm, lote: e.target.value})}
                            style={{ padding: '0.4rem', width: '70px' }}
                            placeholder="Lote"
                          />
                        </td>
                        <td style={{ padding: '0.5rem' }}>
                          <input
                            type="number"
                            step="0.01"
                            className="form-input"
                            value={editForm.preco_venda}
                            onChange={(e) => setEditForm({...editForm, preco_venda: e.target.value})}
                            style={{ padding: '0.4rem', width: '80px' }}
                            placeholder="R$"
                          />
                        </td>
                        <td style={{ padding: '0.5rem', textAlign: 'center' }}>
                          <div style={{ display: 'flex', gap: '0.25rem', justifyContent: 'center' }}>
                            <button
                              onClick={saveEditPreviewItem}
                              style={{ background: '#10b981', color: 'white', border: 'none', padding: '0.3rem 0.6rem', borderRadius: '4px', cursor: 'pointer', fontSize: '0.8rem' }}
                            >
                              ✓
                            </button>
                            <button
                              onClick={cancelEditPreviewItem}
                              style={{ background: '#6b7280', color: 'white', border: 'none', padding: '0.3rem 0.6rem', borderRadius: '4px', cursor: 'pointer', fontSize: '0.8rem' }}
                            >
                              ✕
                            </button>
                          </div>
                        </td>
                      </tr>
                    ) : (
                      <tr 
                        key={index} 
                        style={{ 
                          background: index % 2 === 0 ? '#f7fafc' : 'white',
                          borderBottom: '1px solid #e2e8f0'
                        }}
                      >
                        <td style={{ padding: '0.75rem' }}>{index + 1}</td>
                        <td style={{ padding: '0.75rem', fontWeight: '600' }}>{item.codigo_item}</td>
                        <td style={{ padding: '0.75rem', maxWidth: '200px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {item.descricao}
                        </td>
                        <td style={{ padding: '0.75rem', textAlign: 'center' }}>
                          {item.quantidade} {item.unidade}
                        </td>
                        <td style={{ padding: '0.75rem' }}>
                          <span style={{ 
                            color: item.responsavel?.includes('NÃO ENCONTRADO') ? '#ef4444' : '#667eea',
                            fontWeight: '600'
                          }}>
                            {item.responsavel || '-'}
                          </span>
                        </td>
                        <td style={{ padding: '0.75rem' }}>{item.lote || '-'}</td>
                        <td style={{ padding: '0.75rem', textAlign: 'right' }}>
                          {item.preco_venda ? formatBRL(item.preco_venda) : '-'}
                        </td>
                        <td style={{ padding: '0.75rem', textAlign: 'center' }}>
                          <div style={{ display: 'flex', gap: '0.25rem', justifyContent: 'center' }}>
                            <button
                              onClick={() => startEditPreviewItem(index)}
                              style={{ background: '#3b82f6', color: 'white', border: 'none', padding: '0.3rem 0.6rem', borderRadius: '4px', cursor: 'pointer', fontSize: '0.75rem' }}
                              title="Editar"
                            >
                              ✏️
                            </button>
                            <button
                              onClick={() => removePreviewItem(index)}
                              style={{ background: '#ef4444', color: 'white', border: 'none', padding: '0.3rem 0.6rem', borderRadius: '4px', cursor: 'pointer', fontSize: '0.75rem' }}
                              title="Remover"
                            >
                              🗑️
                            </button>
                          </div>
                        </td>
                      </tr>
                    )
                  ))}
                </tbody>
              </table>
            </div>

            <div style={{ display: 'flex', gap: '1rem', justifyContent: 'flex-end', borderTop: '2px solid #e2e8f0', paddingTop: '1.5rem' }}>
              <button 
                onClick={addPreviewItem}
                className="btn btn-secondary"
                style={{ marginRight: 'auto' }}
                data-testid="add-preview-item-btn-bottom"
              >
                + Adicionar Item
              </button>
              <button 
                onClick={cancelPreview} 
                className="btn btn-secondary"
                style={{ padding: '0.75rem 1.5rem' }}
                data-testid="cancel-confirm-btn"
              >
                Cancelar
              </button>
              <button 
                onClick={handleConfirmPDF} 
                className="btn btn-primary"
                disabled={loading || editingPreviewItem !== null}
                style={{ padding: '0.75rem 2rem', fontSize: '1.1rem' }}
                data-testid="confirm-oc-btn"
              >
                {loading ? 'Criando...' : `✓ Confirmar e Criar OC (${pdfPreview.items.length} itens)`}
              </button>
            </div>
          </div>
        ) : (
          <>
            {/* Tabs */}
            <div style={{ display: 'flex', gap: '1rem', marginBottom: '2rem', borderBottom: '2px solid #e2e8f0' }}>
              <button
                onClick={() => setActiveTab('pdf')}
                className={activeTab === 'pdf' ? 'btn btn-primary' : 'btn btn-secondary'}
                style={{ 
                  borderRadius: '8px 8px 0 0', 
                  borderBottom: activeTab === 'pdf' ? '3px solid #667eea' : 'none',
                  padding: '0.75rem 2rem'
                }}
                data-testid="tab-pdf"
              >
                📄 Upload PDF
              </button>
              <button
                onClick={() => setActiveTab('manual')}
                className={activeTab === 'manual' ? 'btn btn-primary' : 'btn btn-secondary'}
                style={{ 
                  borderRadius: '8px 8px 0 0', 
                  borderBottom: activeTab === 'manual' ? '3px solid #667eea' : 'none',
                  padding: '0.75rem 2rem'
                }}
                data-testid="tab-manual"
              >
                📝 Cadastro Manual
              </button>
              <button
                onClick={() => setActiveTab('atualizar')}
                className={activeTab === 'atualizar' ? 'btn btn-primary' : 'btn btn-secondary'}
                style={{ 
                  borderRadius: '8px 8px 0 0', 
                  borderBottom: activeTab === 'atualizar' ? '3px solid #f59e0b' : 'none',
                  padding: '0.75rem 2rem',
                  background: activeTab === 'atualizar' ? '#f59e0b' : undefined
                }}
                data-testid="tab-atualizar"
              >
                🔄 Atualizar OC
              </button>
            </div>

            {/* Formulário Manual */}
            {activeTab === 'manual' && (
              <form onSubmit={handleSubmitManual}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: '1rem', marginBottom: '1.5rem' }}>
                  <div className="form-group">
                    <label className="form-label" htmlFor="numero-oc">Número da OC *</label>
                    <input
                      id="numero-oc"
                      type="text"
                      className="form-input"
                      value={numeroOC}
                      onChange={(e) => setNumeroOC(e.target.value)}
                      placeholder="Ex: OC-2024-001"
                      required
                      data-testid="input-numero-oc"
                    />
                  </div>

                  <div className="form-group">
                    <label className="form-label" htmlFor="endereco-entrega">Endereço de Entrega</label>
                    <input
                      id="endereco-entrega"
                      type="text"
                      className="form-input"
                      value={enderecoEntrega}
                      onChange={(e) => setEnderecoEntrega(e.target.value)}
                      placeholder="Rua, número, bairro, cidade (aplica para todos os itens)"
                      data-testid="input-endereco-oc"
                    />
                  </div>
                </div>

                <div style={{ marginBottom: '1.5rem' }}>
                  <h3 style={{ fontSize: '1.2rem', fontWeight: '700', marginBottom: '1rem' }}>Itens da OC</h3>

                  {items.map((item, index) => (
                    <div key={index} className="card" style={{ marginBottom: '1rem', background: '#f7fafc' }} data-testid={`item-form-${index}`}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                        <h4 style={{ fontSize: '1rem', fontWeight: '600' }}>Item {index + 1}</h4>
                        {items.length > 1 && (
                          <button 
                            type="button" 
                            onClick={() => removeItem(index)} 
                            style={{ 
                              background: '#ef4444', 
                              color: 'white', 
                              padding: '0.5rem 1rem', 
                              borderRadius: '8px', 
                              border: 'none', 
                              cursor: 'pointer',
                              fontWeight: '600'
                            }} 
                            data-testid={`remove-item-${index}`}
                          >
                            Remover
                          </button>
                        )}
                      </div>

                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '1rem' }}>
                        <div className="form-group">
                          <label className="form-label">Código do Item *</label>
                          <input
                            type="text"
                            className="form-input"
                            value={item.codigo_item}
                            onChange={(e) => updateItem(index, 'codigo_item', e.target.value)}
                            placeholder="Ex: 107712"
                            required
                            data-testid={`input-codigo-${index}`}
                          />
                          <small style={{ color: '#718096', fontSize: '0.85rem' }}>
                            Descrição e marca serão buscadas automaticamente
                          </small>
                        </div>

                        <div className="form-group">
                          <label className="form-label">Quantidade *</label>
                          <input
                            type="number"
                            className="form-input"
                            value={item.quantidade}
                            onChange={(e) => updateItem(index, 'quantidade', e.target.value)}
                            min="1"
                            required
                            data-testid={`input-quantidade-${index}`}
                          />
                        </div>

                        <div className="form-group">
                          <label className="form-label">Unidade</label>
                          <input
                            type="text"
                            className="form-input"
                            value={item.unidade}
                            onChange={(e) => updateItem(index, 'unidade', e.target.value)}
                            placeholder="UN, KG, M, etc"
                            data-testid={`input-unidade-${index}`}
                          />
                        </div>

                        <div className="form-group">
                          <label className="form-label">Preço Venda Unit. (R$)</label>
                          <input
                            type="number"
                            step="0.01"
                            className="form-input"
                            value={item.preco_venda}
                            onChange={(e) => updateItem(index, 'preco_venda', e.target.value)}
                            placeholder="Opcional"
                            data-testid={`input-preco-venda-${index}`}
                          />
                          <small style={{ color: '#718096', fontSize: '0.85rem' }}>
                            Deixe vazio para usar valor da planilha
                          </small>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>

                <div style={{ display: 'flex', gap: '1rem', justifyContent: 'flex-end' }}>
                  <button 
                    type="button" 
                    onClick={addItem} 
                    className="btn btn-secondary" 
                    data-testid="add-item-btn"
                    style={{ marginRight: 'auto' }}
                  >
                    + Adicionar Item
                  </button>
                  <button type="button" onClick={() => navigate('/')} className="btn btn-secondary" data-testid="cancel-btn">
                    Cancelar
                  </button>
                  <button type="submit" className="btn btn-primary" disabled={loading} data-testid="submit-po-btn">
                    {loading ? 'Criando...' : 'Criar Ordem de Compra'}
                  </button>
                </div>
              </form>
            )}

            {/* Formulário PDF */}
            {activeTab === 'pdf' && !multipleResults && (
              <form onSubmit={uploadMode === 'single' ? handlePreviewPDF : (e) => { e.preventDefault(); handleMultipleUpload(); }}>
                <div 
                  onDragEnter={handleDragEnter}
                  onDragLeave={handleDragLeave}
                  onDragOver={handleDragOver}
                  onDrop={handleDrop}
                  style={{ 
                    textAlign: 'center', 
                    padding: '3rem', 
                    background: isDragging ? '#e8f4fd' : '#f7fafc', 
                    borderRadius: '12px',
                    border: isDragging ? '3px dashed #667eea' : '3px dashed #e2e8f0',
                    transition: 'all 0.2s ease',
                    cursor: 'pointer'
                  }}
                  onClick={() => document.getElementById('pdf-upload').click()}
                  data-testid="pdf-drop-zone"
                >
                  <div style={{ 
                    fontSize: '4rem', 
                    marginBottom: '1rem',
                    transform: isDragging ? 'scale(1.1)' : 'scale(1)',
                    transition: 'transform 0.2s ease'
                  }}>
                    {isDragging ? '📥' : '📄'}
                  </div>
                  <h3 style={{ fontSize: '1.5rem', fontWeight: '700', marginBottom: '1rem' }}>
                    {isDragging ? 'Solte os PDFs aqui!' : 'Upload de PDFs de Ordens de Compra'}
                  </h3>
                  <p style={{ color: '#718096', marginBottom: '2rem', maxWidth: '600px', margin: '0 auto 2rem' }}>
                    {isDragging ? (
                      <span style={{ color: '#667eea', fontWeight: '600' }}>Solte os arquivos para fazer upload</span>
                    ) : (
                      <>
                        <strong>Arraste e solte</strong> um ou mais PDFs aqui ou clique para selecionar
                        <br /><br />
                        📑 <strong>1 PDF:</strong> Preview e edição antes de criar
                        <br />📚 <strong>Múltiplos PDFs:</strong> Criação automática em lote
                      </>
                    )}
                  </p>

                  <div className="form-group">
                    <input
                      type="file"
                      accept=".pdf"
                      multiple
                      onChange={handleFileSelect}
                      style={{ display: 'none' }}
                      id="pdf-upload"
                      data-testid="input-pdf-file"
                    />
                    {!isDragging && (
                      <label 
                        htmlFor="pdf-upload" 
                        className="btn btn-primary"
                        style={{ 
                          padding: '1rem 3rem', 
                          fontSize: '1.1rem', 
                          cursor: 'pointer',
                          display: 'inline-block'
                        }}
                        onClick={(e) => e.stopPropagation()}
                      >
                        📁 Selecionar PDF(s)
                      </label>
                    )}
                    {pdfFiles.length > 0 && (
                      <div style={{ 
                        marginTop: '1.5rem', 
                        padding: '1rem', 
                        background: uploadMode === 'multiple' ? '#fff3cd' : '#d4edda', 
                        borderRadius: '8px',
                        display: 'inline-block',
                        maxWidth: '500px'
                      }}>
                        <p style={{ color: uploadMode === 'multiple' ? '#856404' : '#155724', fontWeight: '600', margin: 0 }}>
                          {uploadMode === 'multiple' ? '📚' : '✓'} {pdfFiles.length} arquivo(s) selecionado(s):
                        </p>
                        <ul style={{ 
                          textAlign: 'left', 
                          margin: '0.5rem 0', 
                          padding: '0 1rem',
                          maxHeight: '150px',
                          overflowY: 'auto'
                        }}>
                          {pdfFiles.map((file, idx) => (
                            <li key={idx} style={{ fontSize: '0.9rem', color: '#4a5568' }}>
                              {file.name}
                            </li>
                          ))}
                        </ul>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setPdfFiles([]);
                            setUploadMode('single');
                          }}
                          style={{
                            marginTop: '0.5rem',
                            background: 'transparent',
                            border: 'none',
                            color: '#856404',
                            cursor: 'pointer',
                            textDecoration: 'underline',
                            fontSize: '0.9rem'
                          }}
                        >
                          Limpar seleção
                        </button>
                      </div>
                    )}
                  </div>
                </div>

                <div style={{ display: 'flex', gap: '1rem', justifyContent: 'flex-end', marginTop: '2rem' }}>
                  <button type="button" onClick={() => navigate('/')} className="btn btn-secondary" data-testid="cancel-pdf-btn">
                    Cancelar
                  </button>
                  <button 
                    type="submit" 
                    className="btn btn-primary" 
                    disabled={loading || pdfFiles.length === 0}
                    data-testid="preview-pdf-btn"
                    style={{ padding: '0.75rem 2rem' }}
                  >
                    {loading ? 'Processando...' : (
                      uploadMode === 'multiple' 
                        ? `🚀 Criar ${pdfFiles.length} OCs Automaticamente` 
                        : '→ Ler PDF e Visualizar'
                    )}
                  </button>
                </div>
              </form>
            )}
            
            {/* Resultados do Upload Múltiplo */}
            {activeTab === 'pdf' && multipleResults && (
              <div className="card" style={{ padding: '2rem' }}>
                <h2 style={{ marginBottom: '1.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  📊 Resultado do Upload em Lote
                </h2>
                
                {/* Resumo */}
                <div style={{ 
                  display: 'grid', 
                  gridTemplateColumns: 'repeat(4, 1fr)', 
                  gap: '1rem', 
                  marginBottom: '2rem' 
                }}>
                  <div style={{ padding: '1rem', background: '#e8f5e9', borderRadius: '8px', textAlign: 'center' }}>
                    <div style={{ fontSize: '2rem', fontWeight: '700', color: '#2e7d32' }}>
                      {multipleResults.success.length}
                    </div>
                    <div style={{ color: '#388e3c' }}>Criadas ✓</div>
                  </div>
                  <div style={{ padding: '1rem', background: '#fff3e0', borderRadius: '8px', textAlign: 'center' }}>
                    <div style={{ fontSize: '2rem', fontWeight: '700', color: '#f57c00' }}>
                      {multipleResults.duplicates.length}
                    </div>
                    <div style={{ color: '#ef6c00' }}>Duplicadas</div>
                  </div>
                  <div style={{ padding: '1rem', background: '#ffebee', borderRadius: '8px', textAlign: 'center' }}>
                    <div style={{ fontSize: '2rem', fontWeight: '700', color: '#c62828' }}>
                      {multipleResults.failed.length}
                    </div>
                    <div style={{ color: '#d32f2f' }}>Erro</div>
                  </div>
                  <div style={{ padding: '1rem', background: '#e3f2fd', borderRadius: '8px', textAlign: 'center' }}>
                    <div style={{ fontSize: '2rem', fontWeight: '700', color: '#1565c0' }}>
                      {multipleResults.total_items_created}
                    </div>
                    <div style={{ color: '#1976d2' }}>Itens criados</div>
                  </div>
                </div>
                
                {/* OCs Criadas com Sucesso */}
                {multipleResults.success.length > 0 && (
                  <div style={{ marginBottom: '1.5rem' }}>
                    <h3 style={{ color: '#2e7d32', marginBottom: '0.5rem' }}>✓ OCs Criadas com Sucesso:</h3>
                    <div style={{ maxHeight: '200px', overflowY: 'auto' }}>
                      {multipleResults.success.map((item, idx) => (
                        <div key={idx} style={{ 
                          padding: '0.5rem 1rem', 
                          background: '#e8f5e9', 
                          marginBottom: '0.25rem',
                          borderRadius: '4px',
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center'
                        }}>
                          <span><strong>{item.numero_oc}</strong> - {item.total_items} itens</span>
                          <button 
                            onClick={() => navigate(`/po/${item.po_id}`)}
                            className="btn btn-secondary"
                            style={{ padding: '0.25rem 0.75rem', fontSize: '0.85rem' }}
                          >
                            Ver OC
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                
                {/* OCs Duplicadas */}
                {multipleResults.duplicates.length > 0 && (
                  <div style={{ marginBottom: '1.5rem' }}>
                    <h3 style={{ color: '#f57c00', marginBottom: '0.5rem' }}>⚠️ OCs já existentes (não criadas):</h3>
                    <div style={{ maxHeight: '150px', overflowY: 'auto' }}>
                      {multipleResults.duplicates.map((item, idx) => (
                        <div key={idx} style={{ 
                          padding: '0.5rem 1rem', 
                          background: '#fff3e0', 
                          marginBottom: '0.25rem',
                          borderRadius: '4px',
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center'
                        }}>
                          <span>{item.numero_oc} <small>({item.filename})</small></span>
                          <button 
                            onClick={() => navigate(`/po/${item.existing_id}`)}
                            className="btn btn-secondary"
                            style={{ padding: '0.25rem 0.75rem', fontSize: '0.85rem' }}
                          >
                            Ver existente
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                
                {/* Erros */}
                {multipleResults.failed.length > 0 && (
                  <div style={{ marginBottom: '1.5rem' }}>
                    <h3 style={{ color: '#c62828', marginBottom: '0.5rem' }}>❌ Erros:</h3>
                    <div style={{ maxHeight: '150px', overflowY: 'auto' }}>
                      {multipleResults.failed.map((item, idx) => (
                        <div key={idx} style={{ 
                          padding: '0.5rem 1rem', 
                          background: '#ffebee', 
                          marginBottom: '0.25rem',
                          borderRadius: '4px'
                        }}>
                          <strong>{item.filename}</strong>: {item.error}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                
                <div style={{ display: 'flex', gap: '1rem', justifyContent: 'flex-end', borderTop: '1px solid #e2e8f0', paddingTop: '1rem' }}>
                  <button 
                    onClick={() => {
                      setMultipleResults(null);
                      setPdfFiles([]);
                    }}
                    className="btn btn-secondary"
                  >
                    Fazer novo upload
                  </button>
                  <button 
                    onClick={() => navigate('/')}
                    className="btn btn-primary"
                  >
                    Ir para Dashboard
                  </button>
                </div>
              </div>
            )}

            {/* Aba Atualizar OC */}
            {activeTab === 'atualizar' && (
              <div>
                <div style={{ 
                  padding: '1rem', 
                  background: '#fef3c7', 
                  borderRadius: '8px', 
                  marginBottom: '1.5rem',
                  border: '1px solid #f59e0b'
                }}>
                  <h3 style={{ color: '#92400e', marginBottom: '0.5rem' }}>🔄 Atualizar OCs Existentes</h3>
                  <p style={{ color: '#78350f', fontSize: '0.9rem' }}>
                    Faça upload dos PDFs das OCs que já existem no sistema para atualizar:
                    <strong> Endereço de Entrega</strong>, <strong>Data de Entrega</strong> e <strong style={{ color: '#6366f1' }}>NCM dos itens</strong>.
                    <br />
                    <small>Os dados dos itens (status, preços, fornecedores, NFs) serão preservados.</small>
                  </p>
                </div>

                {/* Área de Drop */}
                <div
                  onDragEnter={handleUpdateDragEnter}
                  onDragLeave={handleUpdateDragLeave}
                  onDragOver={handleUpdateDragOver}
                  onDrop={handleUpdateDrop}
                  style={{
                    border: `3px dashed ${isDraggingUpdate ? '#f59e0b' : '#e2e8f0'}`,
                    borderRadius: '12px',
                    padding: '3rem 2rem',
                    textAlign: 'center',
                    background: isDraggingUpdate ? '#fffbeb' : '#fafafa',
                    transition: 'all 0.3s ease',
                    marginBottom: '1.5rem'
                  }}
                  data-testid="update-dropzone"
                >
                  <div style={{ fontSize: '4rem', marginBottom: '1rem' }}>🔄</div>
                  <h3 style={{ fontSize: '1.3rem', fontWeight: '700', marginBottom: '0.5rem', color: '#f59e0b' }}>
                    {isDraggingUpdate ? 'Solte os PDFs aqui!' : 'Arraste os PDFs das OCs para atualizar'}
                  </h3>
                  <p style={{ color: '#718096', marginBottom: '1.5rem' }}>
                    ou selecione os arquivos manualmente
                  </p>
                  <input
                    type="file"
                    accept=".pdf"
                    multiple
                    onChange={handleUpdateFileSelect}
                    style={{ display: 'none' }}
                    id="update-pdf-input"
                    data-testid="update-file-input"
                  />
                  <label 
                    htmlFor="update-pdf-input" 
                    className="btn"
                    style={{ 
                      padding: '0.75rem 2rem', 
                      cursor: 'pointer',
                      background: '#f59e0b',
                      color: 'white',
                      fontWeight: '600',
                      fontSize: '1rem'
                    }}
                  >
                    📁 Selecionar PDFs
                  </label>
                </div>

                {/* Lista de arquivos selecionados */}
                {updateFiles.length > 0 && (
                  <div style={{ marginBottom: '1.5rem' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
                      <h4 style={{ margin: 0 }}>📋 {updateFiles.length} arquivo(s) selecionado(s):</h4>
                      <button 
                        onClick={clearUpdateFiles}
                        className="btn btn-secondary"
                        style={{ padding: '0.25rem 0.75rem', fontSize: '0.85rem' }}
                      >
                        Limpar tudo
                      </button>
                    </div>
                    <div style={{ maxHeight: '200px', overflowY: 'auto', border: '1px solid #e2e8f0', borderRadius: '8px' }}>
                      {updateFiles.map((file, idx) => (
                        <div 
                          key={idx} 
                          style={{ 
                            display: 'flex', 
                            justifyContent: 'space-between', 
                            alignItems: 'center',
                            padding: '0.5rem 1rem',
                            borderBottom: idx < updateFiles.length - 1 ? '1px solid #e2e8f0' : 'none',
                            background: idx % 2 === 0 ? '#f8f9fa' : 'white'
                          }}
                        >
                          <span>📄 {file.name}</span>
                          <button 
                            onClick={() => removeUpdateFile(idx)}
                            style={{ 
                              background: 'none', 
                              border: 'none', 
                              color: '#ef4444', 
                              cursor: 'pointer',
                              fontSize: '1.2rem'
                            }}
                          >
                            ×
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Botão de Atualizar */}
                {updateFiles.length > 0 && !updateResults && (
                  <div style={{ textAlign: 'center' }}>
                    <button
                      onClick={handleUpdateOCs}
                      disabled={loading}
                      className="btn btn-primary"
                      style={{ 
                        padding: '1rem 3rem', 
                        fontSize: '1.1rem',
                        background: '#f59e0b'
                      }}
                      data-testid="btn-atualizar-ocs"
                    >
                      {loading ? '⏳ Atualizando...' : `🔄 Atualizar ${updateFiles.length} OC(s)`}
                    </button>
                  </div>
                )}

                {/* Resultados da Atualização */}
                {updateResults && (
                  <div style={{ 
                    background: '#f0fdf4', 
                    border: '1px solid #22c55e', 
                    borderRadius: '8px', 
                    padding: '1.5rem'
                  }}>
                    <h3 style={{ color: '#166534', marginBottom: '1rem' }}>
                      ✓ Processamento Concluído
                    </h3>
                    
                    {/* Resumo */}
                    <div style={{ 
                      display: 'grid', 
                      gridTemplateColumns: 'repeat(4, 1fr)', 
                      gap: '1rem',
                      marginBottom: '1.5rem'
                    }}>
                      <div style={{ background: '#dcfce7', padding: '1rem', borderRadius: '8px', textAlign: 'center' }}>
                        <div style={{ fontSize: '2rem', fontWeight: '700', color: '#16a34a' }}>
                          {updateResults.atualizados || 0}
                        </div>
                        <div style={{ color: '#166534' }}>Atualizadas</div>
                      </div>
                      <div style={{ background: '#e0e7ff', padding: '1rem', borderRadius: '8px', textAlign: 'center' }}>
                        <div style={{ fontSize: '2rem', fontWeight: '700', color: '#6366f1' }}>
                          {updateResults.total_ncm_atualizados || 0}
                        </div>
                        <div style={{ color: '#4338ca' }}>NCM Atualizados</div>
                      </div>
                      <div style={{ background: '#fef9c3', padding: '1rem', borderRadius: '8px', textAlign: 'center' }}>
                        <div style={{ fontSize: '2rem', fontWeight: '700', color: '#ca8a04' }}>
                          {updateResults.sem_alteracao || 0}
                        </div>
                        <div style={{ color: '#854d0e' }}>Sem Alteração</div>
                      </div>
                      <div style={{ background: '#fee2e2', padding: '1rem', borderRadius: '8px', textAlign: 'center' }}>
                        <div style={{ fontSize: '2rem', fontWeight: '700', color: '#dc2626' }}>
                          {updateResults.erros || 0}
                        </div>
                        <div style={{ color: '#991b1b' }}>Erros</div>
                      </div>
                    </div>

                    {/* Detalhes */}
                    {updateResults.resultados && updateResults.resultados.length > 0 && (
                      <div style={{ maxHeight: '300px', overflowY: 'auto' }}>
                        <h4 style={{ marginBottom: '0.5rem' }}>Detalhes:</h4>
                        {updateResults.resultados.map((item, idx) => (
                          <div 
                            key={idx} 
                            style={{ 
                              padding: '0.75rem', 
                              background: item.success ? (item.campos_atualizados?.length > 0 ? '#dcfce7' : '#fef9c3') : '#fee2e2',
                              marginBottom: '0.5rem',
                              borderRadius: '4px',
                              fontSize: '0.9rem'
                            }}
                          >
                            <strong>{item.numero_oc || item.filename}</strong>
                            {item.success ? (
                              item.campos_atualizados?.length > 0 ? (
                                <>
                                  <span style={{ color: '#166534' }}> - ✓ Atualizado: {item.campos_atualizados.join(', ')}</span>
                                  {item.ncm_encontrados > 0 && (
                                    <span style={{ color: '#6366f1', marginLeft: '0.5rem' }}>
                                      (🏷️ {item.ncm_encontrados} NCMs)
                                    </span>
                                  )}
                                </>
                              ) : (
                                <span style={{ color: '#854d0e' }}> - Sem alterações necessárias</span>
                              )
                            ) : (
                              <span style={{ color: '#991b1b' }}> - ✗ {item.error || item.message}</span>
                            )}
                          </div>
                        ))}
                      </div>
                    )}

                    <div style={{ display: 'flex', gap: '1rem', justifyContent: 'flex-end', borderTop: '1px solid #e2e8f0', paddingTop: '1rem', marginTop: '1rem' }}>
                      <button 
                        onClick={clearUpdateFiles}
                        className="btn btn-secondary"
                      >
                        Fazer nova atualização
                      </button>
                      <button 
                        onClick={() => navigate('/')}
                        className="btn btn-primary"
                      >
                        Ir para Dashboard
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
};

export default CreatePO;
