import React, { useState, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { apiPost, API } from '../utils/api';

const CreatePO = () => {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState('manual'); // 'manual' or 'pdf'
  const [numeroOC, setNumeroOC] = useState('');
  const [enderecoEntrega, setEnderecoEntrega] = useState('');
  const [items, setItems] = useState([{
    codigo_item: '',
    quantidade: 1,
    unidade: 'UN',
    preco_venda: ''
  }]);
  const [pdfFile, setPdfFile] = useState(null);
  const [loading, setLoading] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  
  // Estados para preview do PDF
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
    
    const files = e.dataTransfer.files;
    if (files && files.length > 0) {
      const file = files[0];
      if (file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')) {
        setPdfFile(file);
      } else {
        alert('Por favor, selecione apenas arquivos PDF');
      }
    }
  }, []);

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
        const continuar = window.confirm(
          `A Ordem de Compra "${numeroOC}" já existe no sistema.\n\n` +
          `Deseja continuar mesmo assim? Isso criará uma OC duplicada.`
        );
        
        if (continuar) {
          // Tentar novamente com número modificado
          const novoNumero = `${numeroOC}-DUPLICATA-${Date.now()}`;
          try {
            const response = await apiPost(`${API}/purchase-orders`, {
              numero_oc: novoNumero,
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
            
            alert(`Ordem de Compra criada com número modificado: ${novoNumero}`);
            navigate(`/po/${response.data.id}`);
          } catch (secondError) {
            console.error('Erro ao criar OC duplicada:', secondError);
            alert('Erro ao criar Ordem de Compra duplicada. Tente novamente.');
          }
        }
      } else {
        alert(error.response?.data?.detail || 'Erro ao criar Ordem de Compra. Verifique os dados.');
      }
    } finally {
      setLoading(false);
    }
  };

  // Preview do PDF (não cria a OC ainda)
  const handlePreviewPDF = async (e) => {
    e.preventDefault();
    
    if (!pdfFile) {
      alert('Por favor, selecione um arquivo PDF');
      return;
    }

    setLoading(true);
    try {
      const formData = new FormData();
      formData.append('file', pdfFile);

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
        const continuar = window.confirm(
          `A Ordem de Compra "${pdfPreview.numero_oc}" já existe no sistema.\n\n` +
          `Deseja continuar mesmo assim? Isso criará uma OC duplicada.`
        );
        
        if (continuar) {
          // Tentar novamente com número modificado
          const novoNumero = `${pdfPreview.numero_oc}-DUPLICATA-${Date.now()}`;
          try {
            const response = await apiPost(`${API}/purchase-orders`, {
              numero_oc: novoNumero,
              endereco_entrega: pdfPreview.endereco_entrega || '',
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
            
            alert(`OC criada com número modificado: ${novoNumero}! ${pdfPreview.items.length} itens.`);
            navigate(`/po/${response.data.id}`);
          } catch (secondError) {
            console.error('Erro ao criar OC duplicada:', secondError);
            alert('Erro ao criar Ordem de Compra duplicada. Tente novamente.');
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
      preco_venda: item.preco_venda || ''
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
      preco_venda: editForm.preco_venda ? parseFloat(editForm.preco_venda) : null
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
      preco_venda: ''
    });
  };

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
              <div style={{ background: '#f0f4f8', padding: '1rem', borderRadius: '8px', marginBottom: '1.5rem' }}>
                <strong>Endereço de Entrega:</strong> {pdfPreview.endereco_entrega}
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
                        <td style={{ padding: '0.5rem' }}>{item.lote || '-'}</td>
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
                          {item.preco_venda ? `R$ ${item.preco_venda.toFixed(2)}` : '-'}
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
            {activeTab === 'pdf' && (
              <form onSubmit={handlePreviewPDF}>
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
                    {isDragging ? 'Solte o PDF aqui!' : 'Upload de PDF da Ordem de Compra'}
                  </h3>
                  <p style={{ color: '#718096', marginBottom: '2rem', maxWidth: '600px', margin: '0 auto 2rem' }}>
                    {isDragging ? (
                      <span style={{ color: '#667eea', fontWeight: '600' }}>Solte o arquivo para fazer upload</span>
                    ) : (
                      <>
                        <strong>Arraste e solte</strong> o PDF aqui ou clique para selecionar
                        <br /><br />
                        O sistema irá extrair automaticamente:
                        <br />• Número da OC
                        <br />• Código dos itens
                        <br />• Quantidades
                        <br />• Endereço de entrega
                      </>
                    )}
                  </p>

                  <div className="form-group">
                    <input
                      type="file"
                      accept=".pdf"
                      onChange={(e) => setPdfFile(e.target.files[0])}
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
                        📁 Selecionar PDF
                      </label>
                    )}
                    {pdfFile && (
                      <div style={{ 
                        marginTop: '1.5rem', 
                        padding: '1rem', 
                        background: '#d4edda', 
                        borderRadius: '8px',
                        display: 'inline-block'
                      }}>
                        <p style={{ color: '#155724', fontWeight: '600', margin: 0 }}>
                          ✓ Arquivo selecionado: {pdfFile.name}
                        </p>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setPdfFile(null);
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
                          Remover arquivo
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
                    disabled={loading || !pdfFile}
                    data-testid="preview-pdf-btn"
                    style={{ padding: '0.75rem 2rem' }}
                  >
                    {loading ? 'Processando...' : '→ Ler PDF e Visualizar'}
                  </button>
                </div>
              </form>
            )}
          </>
        )}
      </div>
    </div>
  );
};

export default CreatePO;
