/**
 * ItemEditForm - Formulário de edição de item
 * Extraído de ItemsByStatus.js
 */
import React, { useState, useEffect, useMemo } from 'react';
import { apiGet, apiPatch, API, formatBRL } from '../../utils/api';

const ItemEditForm = ({ 
  item, 
  status,
  onSave, 
  onCancel,
  isAdmin,
  fornecedoresSistema = []
}) => {
  const [formData, setFormData] = useState({});
  const [saving, setSaving] = useState(false);
  const [fornecedorSugestoes, setFornecedorSugestoes] = useState([]);

  useEffect(() => {
    if (item) {
      setFormData({
        preco: item.preco || '',
        quantidade: item.quantidade || '',
        quantidade_comprada: item.quantidade_comprada || '',
        unidade: item.unidade || 'UN',
        fornecedor: item.fornecedor || '',
        link_compra: item.link_compra || '',
        observacao: item.observacao || '',
        responsavel: item.responsavel || '',
        marca_modelo: item.marca_modelo || '',
        preco_venda: item.preco_venda || '',
        frete: item.frete || '',
        codigo_rastreio: item.codigo_rastreio || ''
      });
    }
  }, [item]);

  const handleChange = (field, value) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    
    // Autocomplete de fornecedor
    if (field === 'fornecedor' && value.length >= 2) {
      const filtered = fornecedoresSistema.filter(f => 
        f.toLowerCase().includes(value.toLowerCase())
      );
      setFornecedorSugestoes(filtered.slice(0, 5));
    } else if (field === 'fornecedor') {
      setFornecedorSugestoes([]);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      // Construir payload apenas com campos alterados
      const updates = {};
      
      if (formData.preco !== item.preco) {
        updates.preco = parseFloat(formData.preco) || 0;
      }
      if (formData.quantidade !== item.quantidade) {
        updates.quantidade = parseInt(formData.quantidade) || 1;
      }
      if (formData.quantidade_comprada !== item.quantidade_comprada) {
        updates.quantidade_comprada = parseInt(formData.quantidade_comprada) || 0;
      }
      if (formData.unidade !== item.unidade) {
        updates.unidade = formData.unidade;
      }
      if (formData.fornecedor !== item.fornecedor) {
        updates.fornecedor = formData.fornecedor;
      }
      if (formData.link_compra !== item.link_compra) {
        updates.link_compra = formData.link_compra;
      }
      if (formData.observacao !== item.observacao) {
        updates.observacao = formData.observacao;
      }
      if (formData.responsavel !== item.responsavel) {
        updates.responsavel = formData.responsavel;
      }
      if (formData.marca_modelo !== item.marca_modelo) {
        updates.marca_modelo = formData.marca_modelo;
      }
      if (formData.preco_venda !== item.preco_venda) {
        updates.preco_venda = parseFloat(formData.preco_venda) || 0;
      }
      if (formData.frete !== item.frete) {
        updates.frete = parseFloat(formData.frete) || 0;
      }
      if (formData.codigo_rastreio !== item.codigo_rastreio) {
        updates.codigo_rastreio = formData.codigo_rastreio;
      }

      await apiPatch(
        `${API}/purchase-orders/${item.po_id}/items/by-index/${item._itemIndexInPO}`,
        updates
      );

      if (onSave) onSave();
    } catch (error) {
      console.error('Erro ao salvar:', error);
      alert(error.response?.data?.detail || 'Erro ao salvar alterações');
    } finally {
      setSaving(false);
    }
  };

  // Campos a mostrar baseado no status
  const showPreco = ['cotado', 'comprado', 'em_separacao', 'em_transito', 'entregue'].includes(status);
  const showFornecedor = ['cotado', 'comprado', 'em_separacao', 'em_transito', 'entregue'].includes(status);
  const showPrecoVenda = ['em_separacao', 'em_transito', 'entregue'].includes(status);
  const showRastreio = ['em_transito', 'entregue'].includes(status);

  return (
    <div style={{
      background: '#fffbeb',
      border: '2px solid #f59e0b',
      borderRadius: '8px',
      padding: '1rem',
      marginBottom: '1rem'
    }}>
      {/* Header */}
      <div style={{ 
        display: 'flex', 
        justifyContent: 'space-between', 
        alignItems: 'center',
        marginBottom: '1rem'
      }}>
        <h4 style={{ margin: 0, color: '#92400e' }}>
          ✏️ Editando: {item.codigo_item}
        </h4>
        <button
          onClick={onCancel}
          style={{
            background: 'none',
            border: 'none',
            fontSize: '1.25rem',
            cursor: 'pointer',
            color: '#6b7280'
          }}
        >
          ×
        </button>
      </div>

      {/* Form Fields */}
      <div style={{ 
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
        gap: '1rem'
      }}>
        {/* Quantidade */}
        <div>
          <label style={labelStyle}>Quantidade:</label>
          <input
            type="number"
            value={formData.quantidade}
            onChange={(e) => handleChange('quantidade', e.target.value)}
            style={inputStyle}
          />
        </div>

        {/* Quantidade Comprada */}
        {showPreco && (
          <div>
            <label style={labelStyle}>Qtd. Comprada:</label>
            <input
              type="number"
              value={formData.quantidade_comprada}
              onChange={(e) => handleChange('quantidade_comprada', e.target.value)}
              style={inputStyle}
            />
          </div>
        )}

        {/* Unidade */}
        <div>
          <label style={labelStyle}>Unidade:</label>
          <input
            type="text"
            value={formData.unidade}
            onChange={(e) => handleChange('unidade', e.target.value)}
            style={inputStyle}
          />
        </div>

        {/* Preço */}
        {showPreco && (
          <div>
            <label style={labelStyle}>Preço Compra (R$):</label>
            <input
              type="number"
              step="0.01"
              value={formData.preco}
              onChange={(e) => handleChange('preco', e.target.value)}
              style={inputStyle}
            />
          </div>
        )}

        {/* Preço Venda */}
        {showPrecoVenda && (
          <div>
            <label style={labelStyle}>Preço Venda (R$):</label>
            <input
              type="number"
              step="0.01"
              value={formData.preco_venda}
              onChange={(e) => handleChange('preco_venda', e.target.value)}
              style={inputStyle}
            />
          </div>
        )}

        {/* Frete */}
        {showPrecoVenda && (
          <div>
            <label style={labelStyle}>Frete (R$):</label>
            <input
              type="number"
              step="0.01"
              value={formData.frete}
              onChange={(e) => handleChange('frete', e.target.value)}
              style={inputStyle}
            />
          </div>
        )}

        {/* Fornecedor */}
        {showFornecedor && (
          <div style={{ position: 'relative' }}>
            <label style={labelStyle}>Fornecedor:</label>
            <input
              type="text"
              value={formData.fornecedor}
              onChange={(e) => handleChange('fornecedor', e.target.value)}
              style={inputStyle}
            />
            {fornecedorSugestoes.length > 0 && (
              <div style={{
                position: 'absolute',
                top: '100%',
                left: 0,
                right: 0,
                background: 'white',
                border: '1px solid #d1d5db',
                borderRadius: '4px',
                boxShadow: '0 4px 6px rgba(0,0,0,0.1)',
                zIndex: 10,
                maxHeight: '150px',
                overflowY: 'auto'
              }}>
                {fornecedorSugestoes.map((f, idx) => (
                  <div
                    key={idx}
                    onClick={() => {
                      handleChange('fornecedor', f);
                      setFornecedorSugestoes([]);
                    }}
                    style={{
                      padding: '0.5rem',
                      cursor: 'pointer',
                      fontSize: '0.85rem',
                      borderBottom: idx < fornecedorSugestoes.length - 1 ? '1px solid #e5e7eb' : 'none'
                    }}
                  >
                    {f}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Link Compra */}
        {showFornecedor && (
          <div style={{ gridColumn: 'span 2' }}>
            <label style={labelStyle}>Link de Compra:</label>
            <input
              type="url"
              value={formData.link_compra}
              onChange={(e) => handleChange('link_compra', e.target.value)}
              style={inputStyle}
            />
          </div>
        )}

        {/* Responsável */}
        {isAdmin && (
          <div>
            <label style={labelStyle}>Responsável:</label>
            <input
              type="text"
              value={formData.responsavel}
              onChange={(e) => handleChange('responsavel', e.target.value)}
              style={inputStyle}
            />
          </div>
        )}

        {/* Marca/Modelo */}
        <div>
          <label style={labelStyle}>Marca/Modelo:</label>
          <input
            type="text"
            value={formData.marca_modelo}
            onChange={(e) => handleChange('marca_modelo', e.target.value)}
            style={inputStyle}
          />
        </div>

        {/* Rastreio */}
        {showRastreio && (
          <div>
            <label style={labelStyle}>Código Rastreio:</label>
            <input
              type="text"
              value={formData.codigo_rastreio}
              onChange={(e) => handleChange('codigo_rastreio', e.target.value)}
              style={inputStyle}
            />
          </div>
        )}

        {/* Observação */}
        <div style={{ gridColumn: '1 / -1' }}>
          <label style={labelStyle}>Observação:</label>
          <textarea
            value={formData.observacao}
            onChange={(e) => handleChange('observacao', e.target.value)}
            style={{ ...inputStyle, minHeight: '60px', resize: 'vertical' }}
          />
        </div>
      </div>

      {/* Botões */}
      <div style={{ 
        display: 'flex', 
        gap: '1rem',
        marginTop: '1rem',
        justifyContent: 'flex-end'
      }}>
        <button
          onClick={onCancel}
          style={{
            padding: '0.5rem 1rem',
            background: '#f3f4f6',
            border: '1px solid #d1d5db',
            borderRadius: '6px',
            cursor: 'pointer'
          }}
        >
          Cancelar
        </button>
        <button
          onClick={handleSave}
          disabled={saving}
          style={{
            padding: '0.5rem 1rem',
            background: saving ? '#94a3b8' : '#22c55e',
            color: 'white',
            border: 'none',
            borderRadius: '6px',
            cursor: saving ? 'wait' : 'pointer',
            fontWeight: '600'
          }}
        >
          {saving ? '⏳ Salvando...' : '💾 Salvar'}
        </button>
      </div>
    </div>
  );
};

// Styles
const labelStyle = {
  display: 'block',
  fontSize: '0.75rem',
  color: '#6b7280',
  marginBottom: '0.25rem'
};

const inputStyle = {
  width: '100%',
  padding: '0.5rem',
  border: '1px solid #d1d5db',
  borderRadius: '4px',
  fontSize: '0.85rem'
};

export default ItemEditForm;
