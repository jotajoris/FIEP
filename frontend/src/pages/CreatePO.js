import React, { useState } from 'react';
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
    
    if (!numeroOC.trim()) {
      alert('Por favor, preencha o número da OC');
      return;
    }

    if (items.some(item => !item.codigo_item.trim())) {
      alert('Por favor, preencha o código de todos os itens');
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
      alert('Erro ao criar Ordem de Compra. Verifique os dados.');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmitPDF = async (e) => {
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
      const response = await fetch(`${API}/purchase-orders/upload-pdf`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`
        },
        body: formData
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.detail || 'Erro ao fazer upload do PDF');
      }

      const data = await response.json();
      
      let message = `OC ${data.numero_oc} criada com sucesso! ${data.total_items} itens importados.`;
      if (data.items_without_ref && data.items_without_ref.length > 0) {
        message += `\n\nAVISO: ${data.items_without_ref.length} itens não foram encontrados no banco de referência e não foram atribuídos a responsáveis.`;
      }
      
      alert(message);
      navigate(`/po/${data.po_id}`);
    } catch (error) {
      console.error('Erro ao fazer upload:', error);
      alert(error.message || 'Erro ao processar PDF. Verifique o arquivo e tente novamente.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div data-testid="create-po-page">
      <div className="page-header">
        <h1 className="page-title" data-testid="create-po-title">Nova Ordem de Compra</h1>
        <p className="page-subtitle">Cadastre uma nova OC recebida do FIEP</p>
      </div>

      <div className="card">
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
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                <h3 style={{ fontSize: '1.2rem', fontWeight: '700' }}>Itens da OC</h3>
                <button 
                  type="button" 
                  onClick={addItem} 
                  className="btn btn-primary" 
                  data-testid="add-item-btn"
                  style={{ fontSize: '0.95rem' }}
                >
                  + Adicionar Item
                </button>
              </div>

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
          <form onSubmit={handleSubmitPDF}>
            <div style={{ textAlign: 'center', padding: '3rem', background: '#f7fafc', borderRadius: '12px' }}>
              <div style={{ fontSize: '4rem', marginBottom: '1rem' }}>📄</div>
              <h3 style={{ fontSize: '1.5rem', fontWeight: '700', marginBottom: '1rem' }}>
                Upload de PDF da Ordem de Compra
              </h3>
              <p style={{ color: '#718096', marginBottom: '2rem', maxWidth: '600px', margin: '0 auto 2rem' }}>
                Faça upload do PDF da OC recebida do FIEP. O sistema irá extrair automaticamente:
                <br />• Número da OC
                <br />• Código dos itens
                <br />• Quantidades
                <br />• Endereço de entrega
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
                <label 
                  htmlFor="pdf-upload" 
                  className="btn btn-primary"
                  style={{ 
                    padding: '1rem 3rem', 
                    fontSize: '1.1rem',
                    cursor: 'pointer',
                    display: 'inline-block'
                  }}
                  data-testid="pdf-upload-label"
                >
                  Selecionar Arquivo PDF
                </label>
              </div>

              {pdfFile && (
                <div style={{ marginTop: '1.5rem', padding: '1rem', background: 'white', borderRadius: '8px' }}>
                  <p style={{ color: '#10b981', fontWeight: '600' }} data-testid="selected-file-name">
                    ✓ Arquivo selecionado: {pdfFile.name}
                  </p>
                </div>
              )}
            </div>

            <div style={{ display: 'flex', gap: '1rem', justifyContent: 'flex-end', marginTop: '2rem' }}>
              <button type="button" onClick={() => navigate('/')} className="btn btn-secondary" data-testid="cancel-pdf-btn">
                Cancelar
              </button>
              <button 
                type="submit" 
                className="btn btn-primary" 
                disabled={loading || !pdfFile}
                data-testid="submit-pdf-btn"
              >
                {loading ? 'Processando PDF...' : 'Importar OC do PDF'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};

export default CreatePO;
