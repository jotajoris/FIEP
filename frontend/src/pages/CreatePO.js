import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { apiPost, API } from '../utils/api';

const CreatePO = () => {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState('manual'); // 'manual' or 'pdf'
  const [numeroOC, setNumeroOC] = useState('');
  const [items, setItems] = useState([{
    codigo_item: '',
    quantidade: 1,
    unidade: 'UN',
    endereco_entrega: ''
  }]);
  const [pdfFile, setPdfFile] = useState(null);
  const [loading, setLoading] = useState(false);

  const addItem = () => {
    setItems([...items, {
      codigo_item: '',
      quantidade: 1,
      unidade: 'UN',
      endereco_entrega: ''
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

  const handleSubmit = async (e) => {
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
      const response = await axios.post(`${API}/purchase-orders`, {
        numero_oc: numeroOC,
        items: items.map(item => ({
          ...item,
          quantidade: parseInt(item.quantidade),
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

  return (
    <div data-testid="create-po-page">
      <div className="page-header">
        <h1 className="page-title" data-testid="create-po-title">Nova Ordem de Compra</h1>
        <p className="page-subtitle">Cadastre uma nova OC recebida do FIEP</p>
      </div>

      <div className="card">
        <form onSubmit={handleSubmit}>
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

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem' }}>
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
                      Sistema buscará descrição e marca/modelo automaticamente
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

                  <div className="form-group" style={{ gridColumn: 'span 2' }}>
                    <label className="form-label">Endereço de Entrega</label>
                    <input
                      type="text"
                      className="form-input"
                      value={item.endereco_entrega}
                      onChange={(e) => updateItem(index, 'endereco_entrega', e.target.value)}
                      placeholder="Rua, número, bairro, cidade"
                      data-testid={`input-endereco-${index}`}
                    />
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
      </div>
    </div>
  );
};

export default CreatePO;
