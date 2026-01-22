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
  
  // Estados para edição
  const [editingOC, setEditingOC] = useState(null); // {po_id, item_index, quantidade_atual, quantidade_necessaria}
  const [novaQuantidade, setNovaQuantidade] = useState(0);
  const [salvando, setSalvando] = useState(false);
  
  // Estados para adicionar item manual ao estoque
  const [showAddModal, setShowAddModal] = useState(false);
  const [codigoBusca, setCodigoBusca] = useState('');
  const [itemEncontrado, setItemEncontrado] = useState(null);
  const [buscando, setBuscando] = useState(false);
  const [addQuantidade, setAddQuantidade] = useState(0);
  const [addPreco, setAddPreco] = useState(0);
  const [addFornecedor, setAddFornecedor] = useState('ENTRADA MANUAL');

  useEffect(() => {
    loadEstoque();
  }, []);

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

  // Buscar item pelo código
  const buscarItem = async () => {
    if (!codigoBusca.trim()) return;
    
    setBuscando(true);
    setItemEncontrado(null);
    
    try {
      const token = localStorage.getItem('token');
      const response = await axios.get(`${API}/api/purchase-orders?limit=0`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      
      const pos = response.data.data || [];
      
      // Buscar item com status "comprado" ou posterior
      for (const po of pos) {
        for (let idx = 0; idx < po.items.length; idx++) {
          const item = po.items[idx];
          if (item.codigo_item === codigoBusca && 
              ['comprado', 'em_separacao', 'em_transito', 'entregue'].includes(item.status)) {
            setItemEncontrado({
              ...item,
              po_id: po.id,
              numero_oc: po.numero_oc,
              item_index: idx
            });
            setBuscando(false);
            return;
          }
        }
      }
      
      alert('Item não encontrado ou não está em status "Comprado" ou superior.');
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
      
      // Buscar OC completa
      const poResponse = await axios.get(`${API}/api/purchase-orders/${itemEncontrado.po_id}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      
      const po = poResponse.data;
      const item = po.items[itemEncontrado.item_index];
      
      // Calcular nova quantidade total comprada
      const fontes = item.fontes_compra || [];
      const qtdAtual = fontes.length > 0 
        ? fontes.reduce((sum, f) => sum + (f.quantidade || 0), 0)
        : (item.quantidade_comprada || item.quantidade || 0);
      
      const novaQtdTotal = qtdAtual + addQuantidade;
      
      // Adicionar nova fonte de compra
      if (!item.fontes_compra) {
        item.fontes_compra = [];
      }
      
      item.fontes_compra.push({
        id: Date.now().toString(),
        quantidade: addQuantidade,
        preco_unitario: addPreco,
        frete: 0,
        fornecedor: addFornecedor,
        link: ''
      });
      
      // Atualizar quantidade_comprada
      item.quantidade_comprada = novaQtdTotal;
      
      // Salvar
      await axios.patch(`${API}/api/purchase-orders/${itemEncontrado.po_id}`, {
        items: po.items
      }, {
        headers: { Authorization: `Bearer ${token}` }
      });
      
      alert(`Adicionado ${addQuantidade} UN ao estoque do item ${itemEncontrado.codigo_item}!`);
      setShowAddModal(false);
      setCodigoBusca('');
      setItemEncontrado(null);
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

  // Ajustar quantidade de estoque
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

  if (loading) {
    return (
      <div data-testid="estoque-page" style={{ padding: '2rem' }}>
        <p>Carregando estoque...</p>
      </div>
    );
  }

  return (
    <div data-testid="estoque-page" style={{ padding: '2rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
        <div>
          <h1 style={{ fontSize: '2rem', fontWeight: '700', margin: 0 }}>📦 Estoque</h1>
          <p style={{ color: '#6b7280', marginTop: '0.5rem' }}>
            Itens comprados em quantidade maior que a necessária
          </p>
        </div>
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

      {/* Busca */}
      <div style={{ marginBottom: '1.5rem' }}>
        <input
          type="text"
          placeholder="🔍 Buscar por código, descrição, marca ou fornecedor..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          style={{
            width: '100%',
            maxWidth: '500px',
            padding: '0.75rem 1rem',
            border: '2px solid #e2e8f0',
            borderRadius: '8px',
            fontSize: '1rem'
          }}
          data-testid="search-estoque"
        />
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
        <div className="card">
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: '#f8fafc', borderBottom: '2px solid #e2e8f0' }}>
                <th style={{ padding: '1rem', textAlign: 'left', fontWeight: '600' }}>Código</th>
                <th style={{ padding: '1rem', textAlign: 'left', fontWeight: '600' }}>Descrição</th>
                <th style={{ padding: '1rem', textAlign: 'center', fontWeight: '600' }}>Qtd. Estoque</th>
                <th style={{ padding: '1rem', textAlign: 'left', fontWeight: '600' }}>Marca/Modelo</th>
                <th style={{ padding: '1rem', textAlign: 'left', fontWeight: '600' }}>Fornecedor</th>
                <th style={{ padding: '1rem', textAlign: 'right', fontWeight: '600' }}>Preço Unit.</th>
                <th style={{ padding: '1rem', textAlign: 'center', fontWeight: '600' }}>Link</th>
                <th style={{ padding: '1rem', textAlign: 'center', fontWeight: '600' }}>Origem</th>
              </tr>
            </thead>
            <tbody>
              {filteredEstoque.map((item, idx) => (
                <tr 
                  key={idx} 
                  style={{ 
                    borderBottom: '1px solid #e2e8f0',
                    background: idx % 2 === 0 ? 'white' : '#f8fafc'
                  }}
                  data-testid={`estoque-row-${item.codigo_item}`}
                >
                  <td style={{ padding: '1rem', fontWeight: '600', color: '#1f2937' }}>
                    {item.codigo_item}
                  </td>
                  <td style={{ padding: '1rem', color: '#4b5563', maxWidth: '250px' }}>
                    {item.descricao?.substring(0, 80)}{item.descricao?.length > 80 ? '...' : ''}
                  </td>
                  <td style={{ padding: '1rem', textAlign: 'center' }}>
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
                  </td>
                  <td style={{ padding: '1rem', color: '#6b7280' }}>
                    {item.marca_modelo || '-'}
                  </td>
                  <td style={{ padding: '1rem', color: '#6b7280' }}>
                    {item.fornecedor || '-'}
                  </td>
                  <td style={{ padding: '1rem', textAlign: 'right', fontWeight: '600', color: '#059669' }}>
                    {formatBRL(item.preco_unitario)}
                  </td>
                  <td style={{ padding: '1rem', textAlign: 'center' }}>
                    {item.link_compra ? (
                      <a 
                        href={item.link_compra} 
                        target="_blank" 
                        rel="noopener noreferrer"
                        style={{ color: '#3b82f6', textDecoration: 'underline' }}
                      >
                        🔗 Ver
                      </a>
                    ) : '-'}
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
                                onClick={() => abrirEdicao(oc)}
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
          </div>
        </div>
      )}
    </div>
  );
};

export default Estoque;
