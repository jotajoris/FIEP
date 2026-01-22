import React, { useState, useEffect, useMemo } from 'react';
import { Link } from 'react-router-dom';
import axios from 'axios';

const API = process.env.REACT_APP_BACKEND_URL;

const formatBRL = (value) => {
  if (value === null || value === undefined) return 'R$ 0,00';
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
};

const PlanilhaItens = () => {
  const [dados, setDados] = useState({ estatisticas: {}, itens: [] });
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [filtroStatus, setFiltroStatus] = useState('todos'); // todos, faltantes, completos, sem_oc
  const [expandedItem, setExpandedItem] = useState(null);
  const [fonte, setFonte] = useState(null); // 'contrato_fiep' ou null
  
  // Paginação
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 20;

  useEffect(() => {
    loadPlanilha();
  }, []);

  const loadPlanilha = async () => {
    try {
      const token = localStorage.getItem('token');
      // Tentar carregar planilha do contrato primeiro
      const response = await axios.get(`${API}/api/planilha-contrato`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setDados(response.data);
      setFonte(response.data.fonte || null);
    } catch (error) {
      console.error('Erro ao carregar planilha:', error);
      // Fallback para planilha normal
      try {
        const token = localStorage.getItem('token');
        const response = await axios.get(`${API}/api/planilha-itens`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        setDados(response.data);
        setFonte(null);
      } catch (err) {
        console.error('Erro no fallback:', err);
      }
    } finally {
      setLoading(false);
    }
  };

  // Filtrar e buscar
  const filteredItens = useMemo(() => {
    let result = dados.itens || [];
    
    // Filtro de busca
    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      result = result.filter(item => 
        item.codigo_item?.toLowerCase().includes(term) ||
        item.descricao?.toLowerCase().includes(term) ||
        item.lotes?.some(l => l.toLowerCase().includes(term)) ||
        item.responsaveis?.some(r => r.toLowerCase().includes(term)) ||
        item.marcas?.some(m => m.toLowerCase().includes(term))
      );
    }
    
    // Filtro de status
    if (filtroStatus === 'faltantes') {
      result = result.filter(item => item.quantidade_faltante > 0);
    } else if (filtroStatus === 'completos') {
      result = result.filter(item => item.quantidade_faltante === 0);
    } else if (filtroStatus === 'sem_oc') {
      result = result.filter(item => !item.tem_oc);
    } else if (filtroStatus === 'com_oc') {
      result = result.filter(item => item.tem_oc);
    }
    
    return result;
  }, [dados.itens, searchTerm, filtroStatus]);

  // Paginação
  const totalPages = Math.ceil(filteredItens.length / itemsPerPage);
  const paginatedItens = filteredItens.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage
  );

  const stats = dados.estatisticas || {};
  const isContratoFiep = fonte === 'contrato_fiep';

  // Contadores para filtros
  const countFaltantes = useMemo(() => (dados.itens || []).filter(i => i.quantidade_faltante > 0).length, [dados.itens]);
  const countCompletos = useMemo(() => (dados.itens || []).filter(i => i.quantidade_faltante === 0).length, [dados.itens]);
  const countSemOC = useMemo(() => (dados.itens || []).filter(i => !i.tem_oc).length, [dados.itens]);
  const countComOC = useMemo(() => (dados.itens || []).filter(i => i.tem_oc).length, [dados.itens]);

  if (loading) {
    return (
      <div data-testid="planilha-page" style={{ padding: '2rem' }}>
        <p>Carregando planilha...</p>
      </div>
    );
  }

  return (
    <div data-testid="planilha-page" style={{ padding: '2rem' }}>
      {/* Cabeçalho */}
      <div style={{ marginBottom: '2rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
          <h1 style={{ fontSize: '2rem', fontWeight: '700', margin: 0 }}>📋 Planilha de Itens</h1>
          {isContratoFiep && (
            <span style={{
              background: 'linear-gradient(135deg, #7c3aed 0%, #5b21b6 100%)',
              color: 'white',
              padding: '0.35rem 0.85rem',
              borderRadius: '20px',
              fontSize: '0.85rem',
              fontWeight: '700'
            }}>
              📊 Contrato FIEP
            </span>
          )}
        </div>
        <p style={{ color: '#6b7280', marginTop: '0.5rem' }}>
          {isContratoFiep 
            ? 'Visão completa de todos os itens do contrato FIEP - baseado na planilha importada'
            : 'Visão consolidada de todos os itens por código - para saber quanto comprar no total'}
        </p>
      </div>

      {/* Cards de Estatísticas */}
      <div style={{ 
        display: 'grid', 
        gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', 
        gap: '1rem',
        marginBottom: '2rem'
      }}>
        <div className="card" style={{ background: '#f0f9ff', border: '2px solid #3b82f6' }}>
          <div style={{ color: '#1e40af', fontSize: '0.85rem' }}>Itens Diferentes</div>
          <div style={{ fontSize: '1.8rem', fontWeight: '700', color: '#1e40af' }}>
            {stats.total_itens_diferentes || 0}
          </div>
        </div>
        <div className="card" style={{ background: '#f3e8ff', border: '2px solid #8b5cf6' }}>
          <div style={{ color: '#5b21b6', fontSize: '0.85rem' }}>
            {isContratoFiep ? 'Qtd. Total Contrato' : 'Qtd. Total Necessária'}
          </div>
          <div style={{ fontSize: '1.8rem', fontWeight: '700', color: '#5b21b6' }}>
            {stats.total_quantidade_contrato || stats.total_quantidade_necessaria || 0}
          </div>
        </div>
        <div className="card" style={{ background: '#dcfce7', border: '2px solid #22c55e' }}>
          <div style={{ color: '#166534', fontSize: '0.85rem' }}>Qtd. Já Comprada</div>
          <div style={{ fontSize: '1.8rem', fontWeight: '700', color: '#166534' }}>
            {stats.total_quantidade_comprada || 0}
          </div>
        </div>
        <div className="card" style={{ background: '#fee2e2', border: '2px solid #ef4444' }}>
          <div style={{ color: '#991b1b', fontSize: '0.85rem' }}>Qtd. Faltante</div>
          <div style={{ fontSize: '1.8rem', fontWeight: '700', color: '#991b1b' }}>
            {stats.total_quantidade_faltante || 0}
          </div>
        </div>
        <div className="card" style={{ background: '#fef3c7', border: '2px solid #f59e0b' }}>
          <div style={{ color: '#92400e', fontSize: '0.85rem' }}>% Comprado</div>
          <div style={{ fontSize: '1.8rem', fontWeight: '700', color: '#92400e' }}>
            {stats.percentual_comprado || 0}%
          </div>
        </div>
      </div>

      {/* Filtros */}
      <div style={{ display: 'flex', gap: '1rem', marginBottom: '1.5rem', flexWrap: 'wrap', alignItems: 'center' }}>
        <input
          type="text"
          placeholder="🔍 Buscar por código, descrição, lote, responsável ou marca..."
          value={searchTerm}
          onChange={(e) => { setSearchTerm(e.target.value); setCurrentPage(1); }}
          style={{
            flex: '1',
            minWidth: '300px',
            padding: '0.75rem 1rem',
            border: '2px solid #e2e8f0',
            borderRadius: '8px',
            fontSize: '1rem'
          }}
          data-testid="search-planilha"
        />
        
        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
          <button
            onClick={() => { setFiltroStatus('todos'); setCurrentPage(1); }}
            className={`btn ${filtroStatus === 'todos' ? 'btn-primary' : 'btn-secondary'}`}
          >
            Todos ({dados.itens?.length || 0})
          </button>
          {isContratoFiep && (
            <>
              <button
                onClick={() => { setFiltroStatus('com_oc'); setCurrentPage(1); }}
                className={`btn ${filtroStatus === 'com_oc' ? 'btn-primary' : 'btn-secondary'}`}
                style={{ background: filtroStatus === 'com_oc' ? '#3b82f6' : undefined }}
              >
                📦 Com OC ({countComOC})
              </button>
              <button
                onClick={() => { setFiltroStatus('sem_oc'); setCurrentPage(1); }}
                className={`btn ${filtroStatus === 'sem_oc' ? 'btn-primary' : 'btn-secondary'}`}
                style={{ background: filtroStatus === 'sem_oc' ? '#6b7280' : undefined }}
              >
                ⏳ Sem OC ({countSemOC})
              </button>
            </>
          )}
          <button
            onClick={() => { setFiltroStatus('faltantes'); setCurrentPage(1); }}
            className={`btn ${filtroStatus === 'faltantes' ? 'btn-primary' : 'btn-secondary'}`}
            style={{ background: filtroStatus === 'faltantes' ? '#ef4444' : undefined }}
          >
            ⚠️ Faltantes ({countFaltantes})
          </button>
          <button
            onClick={() => { setFiltroStatus('completos'); setCurrentPage(1); }}
            className={`btn ${filtroStatus === 'completos' ? 'btn-primary' : 'btn-secondary'}`}
            style={{ background: filtroStatus === 'completos' ? '#22c55e' : undefined }}
          >
            ✅ Completos ({countCompletos})
          </button>
        </div>
      </div>

      {/* Tabela */}
      <div className="card" style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '1200px' }}>
          <thead>
            <tr style={{ background: '#f8fafc', borderBottom: '2px solid #e2e8f0' }}>
              <th style={{ padding: '1rem', textAlign: 'left', fontWeight: '600' }}>Código</th>
              <th style={{ padding: '1rem', textAlign: 'left', fontWeight: '600' }}>Descrição</th>
              <th style={{ padding: '1rem', textAlign: 'center', fontWeight: '600' }}>Imagem</th>
              <th style={{ padding: '1rem', textAlign: 'center', fontWeight: '600' }}>Lotes</th>
              <th style={{ padding: '1rem', textAlign: 'center', fontWeight: '600' }}>Responsáveis</th>
              <th style={{ padding: '1rem', textAlign: 'center', fontWeight: '600' }}>Marcas</th>
              <th style={{ padding: '1rem', textAlign: 'center', fontWeight: '600', background: '#f3e8ff' }}>
                {isContratoFiep ? 'Qtd. Contrato' : 'Qtd. Total'}
              </th>
              <th style={{ padding: '1rem', textAlign: 'center', fontWeight: '600' }}>Comprado</th>
              <th style={{ padding: '1rem', textAlign: 'center', fontWeight: '600' }}>Faltante</th>
              <th style={{ padding: '1rem', textAlign: 'center', fontWeight: '600' }}>Detalhes</th>
            </tr>
          </thead>
          <tbody>
            {paginatedItens.map((item, idx) => (
              <React.Fragment key={item.codigo_item}>
                <tr 
                  style={{ 
                    borderBottom: '1px solid #e2e8f0',
                    background: !item.tem_oc 
                      ? '#f3f4f6'  // Cinza para sem OC
                      : item.quantidade_faltante > 0 
                        ? '#fef2f2'  // Vermelho claro para faltante
                        : '#f0fdf4',  // Verde claro para completo
                    cursor: item.tem_oc ? 'pointer' : 'default',
                    opacity: item.tem_oc ? 1 : 0.8
                  }}
                  onClick={() => item.tem_oc && setExpandedItem(expandedItem === item.codigo_item ? null : item.codigo_item)}
                  data-testid={`planilha-row-${item.codigo_item}`}
                >
                  <td style={{ padding: '1rem', fontWeight: '600', color: '#1f2937' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      {item.codigo_item}
                      {!item.tem_oc && (
                        <span style={{
                          background: '#6b7280',
                          color: 'white',
                          padding: '0.15rem 0.4rem',
                          borderRadius: '4px',
                          fontSize: '0.65rem',
                          fontWeight: '600'
                        }}>
                          SEM OC
                        </span>
                      )}
                    </div>
                  </td>
                  <td style={{ padding: '1rem', color: '#4b5563', maxWidth: '200px' }}>
                    {item.descricao 
                      ? `${item.descricao.substring(0, 60)}${item.descricao.length > 60 ? '...' : ''}`
                      : <span style={{ color: '#9ca3af', fontStyle: 'italic' }}>Sem descrição</span>
                    }
                  </td>
                  <td style={{ padding: '1rem', textAlign: 'center' }}>
                    {item.imagem_url ? (
                      <a 
                        href={`${API}${item.imagem_url}`}
                        target="_blank" 
                        rel="noopener noreferrer"
                        style={{ color: '#8b5cf6', textDecoration: 'underline', fontWeight: '500' }}
                        onClick={(e) => e.stopPropagation()}
                        data-testid={`planilha-image-link-${item.codigo_item}`}
                      >
                        🖼️ Ver
                      </a>
                    ) : (
                      <span style={{ color: '#9ca3af', fontSize: '0.85rem' }}>-</span>
                    )}
                  </td>
                  <td style={{ padding: '1rem', textAlign: 'center' }}>
                    {item.lotes?.length > 0 ? (
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.25rem', justifyContent: 'center' }}>
                        {item.lotes.slice(0, 3).map((lote, i) => (
                          <span key={i} style={{ 
                            background: '#e2e8f0', 
                            padding: '0.15rem 0.4rem', 
                            borderRadius: '4px',
                            fontSize: '0.75rem'
                          }}>
                            {lote}
                          </span>
                        ))}
                        {item.lotes.length > 3 && (
                          <span style={{ fontSize: '0.75rem', color: '#6b7280' }}>+{item.lotes.length - 3}</span>
                        )}
                      </div>
                    ) : (
                      <span style={{ color: '#9ca3af', fontSize: '0.85rem' }}>-</span>
                    )}
                  </td>
                  <td style={{ padding: '1rem', textAlign: 'center', fontSize: '0.85rem', color: '#667eea' }}>
                    {item.responsaveis?.length > 0 
                      ? `${item.responsaveis.slice(0, 2).join(', ')}${item.responsaveis.length > 2 ? ` +${item.responsaveis.length - 2}` : ''}`
                      : <span style={{ color: '#9ca3af' }}>-</span>
                    }
                  </td>
                  <td style={{ padding: '1rem', textAlign: 'center', fontSize: '0.85rem', color: '#6b7280' }}>
                    {item.marcas?.length > 0 
                      ? `${item.marcas.slice(0, 2).join(', ')}${item.marcas.length > 2 ? ` +${item.marcas.length - 2}` : ''}`
                      : <span style={{ color: '#9ca3af' }}>-</span>
                    }
                  </td>
                  <td style={{ padding: '1rem', textAlign: 'center', fontWeight: '700', background: '#faf5ff', minWidth: '120px' }}>
                    <span style={{
                      background: '#8b5cf6',
                      color: 'white',
                      padding: '0.25rem 0.6rem',
                      borderRadius: '12px',
                      fontWeight: '700',
                      whiteSpace: 'nowrap',
                      display: 'inline-block'
                    }}>
                      {item.quantidade_contrato || item.quantidade_total_necessaria} {item.unidade}
                    </span>
                  </td>
                  <td style={{ padding: '1rem', textAlign: 'center' }}>
                    <span style={{
                      background: item.quantidade_comprada > 0 ? '#22c55e' : '#e2e8f0',
                      color: item.quantidade_comprada > 0 ? 'white' : '#6b7280',
                      padding: '0.25rem 0.5rem',
                      borderRadius: '12px',
                      fontWeight: '600'
                    }}>
                      {item.quantidade_comprada || item.quantidade_total_comprada || 0}
                    </span>
                  </td>
                  <td style={{ padding: '1rem', textAlign: 'center' }}>
                    <span style={{
                      background: item.quantidade_faltante > 0 ? '#ef4444' : '#22c55e',
                      color: 'white',
                      padding: '0.25rem 0.5rem',
                      borderRadius: '12px',
                      fontWeight: '600'
                    }}>
                      {item.quantidade_faltante > 0 ? item.quantidade_faltante : '✓'}
                    </span>
                  </td>
                  <td style={{ padding: '1rem', textAlign: 'center' }}>
                    {item.tem_oc ? (
                      <span style={{ fontSize: '1.2rem' }}>
                        {expandedItem === item.codigo_item ? '▲' : '▼'}
                      </span>
                    ) : (
                      <span style={{ color: '#9ca3af', fontSize: '0.85rem' }}>-</span>
                    )}
                  </td>
                </tr>
                
                {/* Detalhes expandidos */}
                {expandedItem === item.codigo_item && item.tem_oc && (
                  <tr>
                    <td colSpan="10" style={{ padding: '0' }}>
                      <div style={{ 
                        background: '#f8fafc', 
                        padding: '1rem',
                        borderBottom: '2px solid #e2e8f0'
                      }}>
                        <h4 style={{ margin: '0 0 1rem 0', fontSize: '1rem', fontWeight: '600' }}>
                          📋 Detalhes por OC ({item.ocorrencias?.length || 0} ocorrência{item.ocorrencias?.length !== 1 ? 's' : ''})
                        </h4>
                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.9rem' }}>
                          <thead>
                            <tr style={{ background: '#e2e8f0' }}>
                              <th style={{ padding: '0.5rem', textAlign: 'left' }}>OC</th>
                              <th style={{ padding: '0.5rem', textAlign: 'left' }}>Lote</th>
                              <th style={{ padding: '0.5rem', textAlign: 'left' }}>Responsável</th>
                              <th style={{ padding: '0.5rem', textAlign: 'left' }}>Marca/Modelo</th>
                              <th style={{ padding: '0.5rem', textAlign: 'right' }}>Preço Unit.</th>
                              <th style={{ padding: '0.5rem', textAlign: 'center' }}>Qtd.</th>
                              <th style={{ padding: '0.5rem', textAlign: 'center' }}>Status</th>
                            </tr>
                          </thead>
                          <tbody>
                            {item.ocorrencias?.map((oc, i) => (
                              <tr key={i} style={{ 
                                borderBottom: '1px solid #e2e8f0',
                                background: oc.ja_comprado ? '#dcfce7' : 'white'
                              }}>
                                <td style={{ padding: '0.5rem' }}>
                                  <Link to={`/po/${oc.po_id}`} style={{ color: '#667eea' }}>
                                    {oc.numero_oc}
                                  </Link>
                                </td>
                                <td style={{ padding: '0.5rem' }}>{oc.lote}</td>
                                <td style={{ padding: '0.5rem', color: '#667eea', fontWeight: '500' }}>{oc.responsavel}</td>
                                <td style={{ padding: '0.5rem' }}>{oc.marca_modelo || '-'}</td>
                                <td style={{ padding: '0.5rem', textAlign: 'right' }}>{formatBRL(oc.preco_unitario)}</td>
                                <td style={{ padding: '0.5rem', textAlign: 'center', fontWeight: '600' }}>{oc.quantidade}</td>
                                <td style={{ padding: '0.5rem', textAlign: 'center' }}>
                                  <span style={{
                                    padding: '0.15rem 0.4rem',
                                    borderRadius: '8px',
                                    fontSize: '0.75rem',
                                    fontWeight: '600',
                                    background: oc.ja_comprado ? '#22c55e' : '#fcd34d',
                                    color: oc.ja_comprado ? 'white' : '#92400e'
                                  }}>
                                    {oc.status?.replace('_', ' ').toUpperCase()}
                                  </span>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </td>
                  </tr>
                )}
              </React.Fragment>
            ))}
          </tbody>
        </table>
        
        {paginatedItens.length === 0 && (
          <div style={{ padding: '2rem', textAlign: 'center', color: '#6b7280' }}>
            {searchTerm || filtroStatus !== 'todos' 
              ? 'Nenhum item encontrado com os filtros aplicados'
              : 'Nenhum item na planilha'}
          </div>
        )}
      </div>

      {/* Paginação */}
      {totalPages > 1 && (
        <div style={{ display: 'flex', justifyContent: 'center', gap: '0.5rem', marginTop: '1.5rem', flexWrap: 'wrap' }}>
          <button
            onClick={() => setCurrentPage(1)}
            disabled={currentPage === 1}
            className="btn btn-secondary"
          >
            ⏮️
          </button>
          <button
            onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
            disabled={currentPage === 1}
            className="btn btn-secondary"
          >
            ← Anterior
          </button>
          <span style={{ padding: '0.5rem 1rem', display: 'flex', alignItems: 'center', fontWeight: '500' }}>
            Página {currentPage} de {totalPages} ({filteredItens.length} itens)
          </span>
          <button
            onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
            disabled={currentPage === totalPages}
            className="btn btn-secondary"
          >
            Próxima →
          </button>
          <button
            onClick={() => setCurrentPage(totalPages)}
            disabled={currentPage === totalPages}
            className="btn btn-secondary"
          >
            ⏭️
          </button>
        </div>
      )}
    </div>
  );
};

export default PlanilhaItens;
