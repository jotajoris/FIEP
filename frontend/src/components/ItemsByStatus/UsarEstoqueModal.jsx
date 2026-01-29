/**
 * UsarEstoqueModal - Modal para usar itens do estoque
 * Extraído de ItemsByStatus.js
 */
import React, { useState, useEffect } from 'react';
import { apiGet, apiPost, API, formatBRL } from '../../utils/api';

const UsarEstoqueModal = ({ item, onClose, onSuccess }) => {
  const [loading, setLoading] = useState(true);
  const [detalhes, setDetalhes] = useState(null);
  const [quantidade, setQuantidade] = useState(0);
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    const carregarDetalhes = async () => {
      try {
        const response = await apiGet(`${API}/estoque/detalhes/${item.codigo_item}`);
        setDetalhes(response.data);
        
        // Calcular quantidade sugerida
        const qtdNecessaria = item.quantidade || 1;
        const qtdDisponivel = response.data.quantidade_estoque || 0;
        setQuantidade(Math.min(qtdNecessaria, qtdDisponivel));
      } catch (error) {
        console.error('Erro ao carregar estoque:', error);
        alert('Erro ao carregar detalhes do estoque');
        onClose();
      } finally {
        setLoading(false);
      }
    };

    if (item?.codigo_item) {
      carregarDetalhes();
    }
  }, [item, onClose]);

  const handleUsar = async () => {
    if (quantidade <= 0) {
      alert('Informe uma quantidade válida');
      return;
    }

    setSalvando(true);
    try {
      const response = await apiPost(`${API}/estoque/usar`, {
        po_id: item.po_id,
        item_index: item._itemIndexInPO,
        quantidade_usar: quantidade
      });

      alert(response.data.mensagem || 'Estoque utilizado com sucesso!');
      if (onSuccess) onSuccess();
      onClose();
    } catch (error) {
      console.error('Erro ao usar estoque:', error);
      alert(error.response?.data?.detail || 'Erro ao usar estoque');
    } finally {
      setSalvando(false);
    }
  };

  if (loading) {
    return (
      <div style={overlayStyle}>
        <div style={modalStyle}>
          <div style={{ textAlign: 'center', padding: '2rem' }}>
            ⏳ Carregando detalhes do estoque...
          </div>
        </div>
      </div>
    );
  }

  const qtdNecessaria = item.quantidade || 1;
  const qtdDisponivel = detalhes?.quantidade_estoque || 0;

  return (
    <div style={overlayStyle} onClick={onClose}>
      <div style={modalStyle} onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div style={{ 
          display: 'flex', 
          justifyContent: 'space-between', 
          alignItems: 'center',
          marginBottom: '1rem',
          paddingBottom: '1rem',
          borderBottom: '1px solid #e5e7eb'
        }}>
          <h3 style={{ margin: 0, color: '#1f2937' }}>
            📦 Usar do Estoque
          </h3>
          <button
            onClick={onClose}
            style={{
              background: 'none',
              border: 'none',
              fontSize: '1.5rem',
              cursor: 'pointer',
              color: '#6b7280'
            }}
          >
            ×
          </button>
        </div>

        {/* Item Info */}
        <div style={{ 
          background: '#f8fafc', 
          padding: '1rem', 
          borderRadius: '8px',
          marginBottom: '1rem'
        }}>
          <div style={{ fontWeight: '600', color: '#1f2937' }}>
            {item.codigo_item}
          </div>
          <div style={{ fontSize: '0.85rem', color: '#6b7280', marginTop: '0.25rem' }}>
            {item.descricao?.substring(0, 100)}
          </div>
        </div>

        {/* Quantidades */}
        <div style={{ 
          display: 'grid', 
          gridTemplateColumns: '1fr 1fr',
          gap: '1rem',
          marginBottom: '1rem'
        }}>
          <div style={{ 
            background: '#fef3c7', 
            padding: '0.75rem', 
            borderRadius: '6px',
            textAlign: 'center'
          }}>
            <div style={{ fontSize: '0.75rem', color: '#92400e' }}>Necessário</div>
            <div style={{ fontSize: '1.25rem', fontWeight: '700', color: '#92400e' }}>
              {qtdNecessaria} {item.unidade || 'UN'}
            </div>
          </div>
          
          <div style={{ 
            background: '#dcfce7', 
            padding: '0.75rem', 
            borderRadius: '6px',
            textAlign: 'center'
          }}>
            <div style={{ fontSize: '0.75rem', color: '#166534' }}>Disponível</div>
            <div style={{ fontSize: '1.25rem', fontWeight: '700', color: '#166534' }}>
              {qtdDisponivel} {item.unidade || 'UN'}
            </div>
          </div>
        </div>

        {/* OCs de Origem */}
        {detalhes?.ocs_origem && detalhes.ocs_origem.length > 0 && (
          <div style={{ marginBottom: '1rem' }}>
            <div style={{ fontSize: '0.8rem', color: '#6b7280', marginBottom: '0.5rem' }}>
              Origem do estoque:
            </div>
            <div style={{ 
              maxHeight: '120px', 
              overflowY: 'auto',
              fontSize: '0.75rem'
            }}>
              {detalhes.ocs_origem.map((oc, idx) => (
                <div 
                  key={idx}
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    padding: '0.35rem 0',
                    borderBottom: idx < detalhes.ocs_origem.length - 1 ? '1px solid #e5e7eb' : 'none'
                  }}
                >
                  <span>{oc.numero_oc}</span>
                  <span style={{ color: '#22c55e' }}>{oc.excedente} UN</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Input de quantidade */}
        <div style={{ marginBottom: '1.5rem' }}>
          <label style={{ 
            display: 'block', 
            fontSize: '0.85rem', 
            color: '#374151',
            marginBottom: '0.5rem'
          }}>
            Quantidade a usar:
          </label>
          <input
            type="number"
            min="1"
            max={qtdDisponivel}
            value={quantidade}
            onChange={(e) => setQuantidade(parseInt(e.target.value) || 0)}
            style={{
              width: '100%',
              padding: '0.75rem',
              fontSize: '1.1rem',
              border: '2px solid #3b82f6',
              borderRadius: '6px',
              textAlign: 'center'
            }}
          />
        </div>

        {/* Aviso de atendimento */}
        {quantidade > 0 && (
          <div style={{ 
            padding: '0.75rem',
            background: quantidade >= qtdNecessaria ? '#dcfce7' : '#fef3c7',
            borderRadius: '6px',
            marginBottom: '1rem',
            fontSize: '0.85rem',
            textAlign: 'center'
          }}>
            {quantidade >= qtdNecessaria ? (
              <span style={{ color: '#166534' }}>
                ✅ Atende 100% da necessidade → Status mudará para <strong>Comprado</strong>
              </span>
            ) : (
              <span style={{ color: '#92400e' }}>
                ⚠️ Atende parcialmente ({quantidade} de {qtdNecessaria})
              </span>
            )}
          </div>
        )}

        {/* Botões */}
        <div style={{ display: 'flex', gap: '1rem' }}>
          <button
            onClick={onClose}
            style={{
              flex: 1,
              padding: '0.75rem',
              background: '#f3f4f6',
              border: '1px solid #d1d5db',
              borderRadius: '6px',
              cursor: 'pointer',
              fontSize: '0.9rem'
            }}
          >
            Cancelar
          </button>
          <button
            onClick={handleUsar}
            disabled={salvando || quantidade <= 0}
            style={{
              flex: 1,
              padding: '0.75rem',
              background: salvando ? '#94a3b8' : '#22c55e',
              color: 'white',
              border: 'none',
              borderRadius: '6px',
              cursor: salvando ? 'wait' : 'pointer',
              fontSize: '0.9rem',
              fontWeight: '600'
            }}
          >
            {salvando ? '⏳ Processando...' : '📦 Usar do Estoque'}
          </button>
        </div>
      </div>
    </div>
  );
};

// Styles
const overlayStyle = {
  position: 'fixed',
  top: 0,
  left: 0,
  right: 0,
  bottom: 0,
  background: 'rgba(0, 0, 0, 0.5)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  zIndex: 1000
};

const modalStyle = {
  background: 'white',
  borderRadius: '12px',
  padding: '1.5rem',
  width: '90%',
  maxWidth: '450px',
  maxHeight: '90vh',
  overflowY: 'auto',
  boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1)'
};

export default UsarEstoqueModal;
