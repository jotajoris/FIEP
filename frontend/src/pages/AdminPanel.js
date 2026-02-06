import React, { useState, useEffect, useMemo } from 'react';
import axios from 'axios';
import { formatBRL } from '../utils/api';
import Pagination from '../components/Pagination';
import { useAuth } from '../contexts/AuthContext';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

// Componente de Relatório
const RelatorioSection = () => {
  const [downloadingRelatorio, setDownloadingRelatorio] = useState(false);
  const [reprocessandoRequisitantes, setReprocessandoRequisitantes] = useState(false);
  const [resultadoReprocessamento, setResultadoReprocessamento] = useState(null);

  const downloadRelatorioCompleto = async () => {
    setDownloadingRelatorio(true);
    try {
      const token = localStorage.getItem('token');
      const response = await axios.get(`${API}/admin/relatorio-completo`, {
        headers: { Authorization: `Bearer ${token}` },
        responseType: 'blob'
      });
      
      // Criar link de download
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      
      // Extrair nome do arquivo do header ou usar padrão
      const contentDisposition = response.headers['content-disposition'];
      let filename = 'relatorio_completo_ocs.xlsx';
      if (contentDisposition) {
        const filenameMatch = contentDisposition.match(/filename[^;=\n]*=((['"]).*?\2|[^;\n]*)/);
        if (filenameMatch && filenameMatch[1]) {
          filename = filenameMatch[1].replace(/['"]/g, '');
        }
      }
      
      link.setAttribute('download', filename);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
      
      alert('✅ Relatório baixado com sucesso!');
    } catch (error) {
      console.error('Erro ao baixar relatório:', error);
      alert('❌ Erro ao baixar relatório: ' + (error.response?.data?.detail || error.message));
    } finally {
      setDownloadingRelatorio(false);
    }
  };

  const reprocessarRequisitantes = async () => {
    if (!window.confirm('Isso vai reprocessar TODAS as OCs para extrair o requisitante dos PDFs. Continuar?')) {
      return;
    }
    
    setReprocessandoRequisitantes(true);
    setResultadoReprocessamento(null);
    try {
      const token = localStorage.getItem('token');
      const response = await axios.post(`${API}/admin/reprocessar-requisitantes`, {}, {
        headers: { Authorization: `Bearer ${token}` }
      });
      
      setResultadoReprocessamento(response.data);
      alert(`✅ Processamento concluído!\n${response.data.total_atualizados} OCs atualizadas.`);
    } catch (error) {
      console.error('Erro ao reprocessar requisitantes:', error);
      alert('❌ Erro: ' + (error.response?.data?.detail || error.message));
    } finally {
      setReprocessandoRequisitantes(false);
    }
  };

  return (
    <>
      <h2 style={{ fontSize: '1.5rem', fontWeight: '700', marginBottom: '1rem', color: '#16a34a' }}>
        📊 Relatórios
      </h2>
      
      {/* Relatório Completo de OCs */}
      <div style={{ 
        background: '#f0fdf4', 
        border: '2px solid #22c55e', 
        borderRadius: '12px', 
        padding: '1.5rem',
        marginBottom: '1.5rem'
      }}>
        <h3 style={{ fontSize: '1.2rem', fontWeight: '700', marginBottom: '0.75rem', color: '#166534' }}>
          📥 Relatório Completo de OCs
        </h3>
        <p style={{ color: '#166534', marginBottom: '1rem', fontSize: '0.9rem' }}>
          Baixe um arquivo Excel com todas as OCs, status de cada item, códigos de rastreio, 
          prazos de entrega e muito mais. Ideal para controle e evitar penalidades por atraso.
        </p>
        
        <div style={{ background: 'white', padding: '1rem', borderRadius: '8px', marginBottom: '1rem' }}>
          <h4 style={{ fontSize: '0.95rem', fontWeight: '600', marginBottom: '0.5rem' }}>📋 O relatório inclui:</h4>
          <ul style={{ fontSize: '0.85rem', color: '#374151', marginLeft: '1.5rem', lineHeight: '1.8' }}>
            <li><strong>Aba 1 - Relatório Completo:</strong> Todos os itens de todas as OCs com status, rastreio, preços, etc.</li>
            <li><strong>Aba 2 - Resumo por OC:</strong> Visão geral de cada OC com contagem de itens por status</li>
            <li><strong>Aba 3 - ⚠️ ATRASADOS:</strong> Lista de itens com data de entrega vencida que ainda não foram entregues</li>
          </ul>
        </div>
        
        <button
          onClick={downloadRelatorioCompleto}
          disabled={downloadingRelatorio}
          style={{
            padding: '1rem 2rem',
            fontSize: '1.1rem',
            fontWeight: '700',
            background: downloadingRelatorio ? '#9ca3af' : '#16a34a',
            color: 'white',
            border: 'none',
            borderRadius: '8px',
            cursor: downloadingRelatorio ? 'not-allowed' : 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem'
          }}
          data-testid="download-relatorio-btn"
        >
          {downloadingRelatorio ? (
            <>⏳ Gerando relatório...</>
          ) : (
            <>📥 Baixar Relatório Excel</>
          )}
        </button>
      </div>
      
      {/* Reprocessar Requisitantes */}
      <div style={{ 
        background: '#fef3c7', 
        border: '2px solid #f59e0b', 
        borderRadius: '12px', 
        padding: '1.5rem' 
      }}>
        <h3 style={{ fontSize: '1.2rem', fontWeight: '700', marginBottom: '0.75rem', color: '#92400e' }}>
          🔄 Reprocessar Requisitantes
        </h3>
        <p style={{ color: '#92400e', marginBottom: '1rem', fontSize: '0.9rem' }}>
          Extrai automaticamente o nome e email do requisitante de todas as OCs que têm PDF salvo.
          Útil para preencher o campo Requisitante em OCs antigas.
        </p>
        
        <button
          onClick={reprocessarRequisitantes}
          disabled={reprocessandoRequisitantes}
          style={{
            padding: '0.75rem 1.5rem',
            fontSize: '1rem',
            fontWeight: '600',
            background: reprocessandoRequisitantes ? '#9ca3af' : '#f59e0b',
            color: 'white',
            border: 'none',
            borderRadius: '8px',
            cursor: reprocessandoRequisitantes ? 'not-allowed' : 'pointer'
          }}
          data-testid="reprocessar-requisitantes-btn"
        >
          {reprocessandoRequisitantes ? '⏳ Processando...' : '🔄 Reprocessar Requisitantes'}
        </button>
        
        {resultadoReprocessamento && (
          <div style={{ marginTop: '1rem', padding: '1rem', background: 'white', borderRadius: '8px' }}>
            <h4 style={{ fontSize: '0.95rem', fontWeight: '600', marginBottom: '0.5rem', color: '#166534' }}>
              ✅ Resultado do Processamento
            </h4>
            <ul style={{ fontSize: '0.85rem', color: '#374151' }}>
              <li><strong>Total processados:</strong> {resultadoReprocessamento.total_processados}</li>
              <li><strong>Atualizados:</strong> {resultadoReprocessamento.total_atualizados}</li>
              <li><strong>Sem requisitante no PDF:</strong> {resultadoReprocessamento.total_sem_requisitante}</li>
            </ul>
          </div>
        )}
      </div>
    </>
  );
};

// Componente de Lucro Total (ADMIN ONLY)
const LucroTotalSection = () => {
  const [resumo, setResumo] = useState(null);
  const [itensEntregues, setItensEntregues] = useState([]);
  const [loading, setLoading] = useState(true);
  const [custosDiversos, setCustosDiversos] = useState([]);
  const [novoCusto, setNovoCusto] = useState({ descricao: '', valor: '', categoria: 'correios' });
  const [adicionandoCusto, setAdicionandoCusto] = useState(false);
  const [configuracoes, setConfiguracoes] = useState({ percentual_imposto: 11, frete_correios_mensal: 0 });
  const [editandoConfig, setEditandoConfig] = useState(false);
  const [mostrarItens, setMostrarItens] = useState(false);
  const [fechamentos, setFechamentos] = useState([]);
  const [mostrarHistorico, setMostrarHistorico] = useState(false);
  const [marcandoPago, setMarcandoPago] = useState(false);

  useEffect(() => {
    carregarResumo();
    carregarFechamentos();
  }, []);

  const carregarResumo = async () => {
    setLoading(true);
    try {
      const token = localStorage.getItem('token');
      const response = await axios.get(`${API}/admin/resumo-lucro`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setResumo(response.data.resumo);
      setItensEntregues(response.data.itens || []);
      setCustosDiversos(response.data.custos_diversos || []);
      setConfiguracoes(response.data.configuracoes || { percentual_imposto: 11, frete_correios_mensal: 0 });
    } catch (error) {
      console.error('Erro ao carregar resumo:', error);
      alert('Erro ao carregar resumo de lucro');
    } finally {
      setLoading(false);
    }
  };

  const carregarFechamentos = async () => {
    try {
      const token = localStorage.getItem('token');
      const response = await axios.get(`${API}/admin/fechamentos-lucro`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setFechamentos(response.data.fechamentos || []);
    } catch (error) {
      console.log('Nenhum fechamento anterior encontrado');
    }
  };

  const adicionarCusto = async () => {
    if (!novoCusto.descricao || !novoCusto.valor) {
      alert('Preencha descrição e valor');
      return;
    }
    
    try {
      const token = localStorage.getItem('token');
      await axios.post(`${API}/admin/custos-diversos`, novoCusto, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setNovoCusto({ descricao: '', valor: '', categoria: 'outros' });
      setAdicionandoCusto(false);
      carregarResumo();
    } catch (error) {
      alert('Erro ao adicionar custo: ' + (error.response?.data?.detail || error.message));
    }
  };

  const removerCusto = async (custoId) => {
    if (!window.confirm('Remover este custo?')) return;
    
    try {
      const token = localStorage.getItem('token');
      await axios.delete(`${API}/admin/custos-diversos/${custoId}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      carregarResumo();
    } catch (error) {
      alert('Erro ao remover custo');
    }
  };

  const salvarConfiguracoes = async () => {
    try {
      const token = localStorage.getItem('token');
      await axios.patch(`${API}/admin/configuracoes`, configuracoes, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setEditandoConfig(false);
      carregarResumo();
      alert('Configurações salvas!');
    } catch (error) {
      alert('Erro ao salvar configurações');
    }
  };

  const marcarPagamento = async (pago) => {
    if (pago && !window.confirm('Deseja fechar este período e marcar como PAGO?\n\nIsso irá:\n• Arquivar o resumo atual no histórico\n• Os custos diversos serão mantidos para referência\n• Você poderá continuar adicionando novos custos')) {
      return;
    }
    
    setMarcandoPago(true);
    try {
      const token = localStorage.getItem('token');
      const response = await axios.patch(`${API}/admin/resumo-lucro/pagamento`, { pago }, {
        headers: { Authorization: `Bearer ${token}` }
      });
      
      if (response.data.message) {
        alert(response.data.message);
      }
      
      carregarResumo();
      carregarFechamentos();
    } catch (error) {
      alert('Erro ao atualizar status de pagamento');
    } finally {
      setMarcandoPago(false);
    }
  };

  if (loading) return <div style={{ padding: '2rem', textAlign: 'center' }}>Carregando...</div>;

  return (
    <>
      <h2 style={{ fontSize: '1.5rem', fontWeight: '700', marginBottom: '1rem', color: '#059669' }}>
        💰 Lucro Total - Visão Completa
      </h2>

      {/* Configurações */}
      <div style={{ background: '#fef3c7', border: '2px solid #f59e0b', borderRadius: '12px', padding: '1rem', marginBottom: '1.5rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
          <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: '700', color: '#92400e' }}>⚙️ Configurações</h3>
          {!editandoConfig ? (
            <button onClick={() => setEditandoConfig(true)} style={{ padding: '0.4rem 0.8rem', fontSize: '0.8rem', background: '#f59e0b', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>
              ✏️ Editar
            </button>
          ) : (
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <button onClick={() => setEditandoConfig(false)} style={{ padding: '0.4rem 0.8rem', fontSize: '0.8rem', background: '#6b7280', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>Cancelar</button>
              <button onClick={salvarConfiguracoes} style={{ padding: '0.4rem 0.8rem', fontSize: '0.8rem', background: '#16a34a', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>✓ Salvar</button>
            </div>
          )}
        </div>
        <div style={{ display: 'flex', gap: '2rem', flexWrap: 'wrap' }}>
          <div>
            <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: '600', color: '#78350f', marginBottom: '0.25rem' }}>Imposto (%)</label>
            {editandoConfig ? (
              <input type="number" step="0.1" value={configuracoes.percentual_imposto} onChange={(e) => setConfiguracoes(prev => ({ ...prev, percentual_imposto: parseFloat(e.target.value) || 0 }))} style={{ padding: '0.4rem', border: '1px solid #d1d5db', borderRadius: '4px', width: '80px' }} />
            ) : (
              <span style={{ fontSize: '1.1rem', fontWeight: '700', color: '#dc2626' }}>{configuracoes.percentual_imposto}%</span>
            )}
          </div>
          <div>
            <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: '600', color: '#78350f', marginBottom: '0.25rem' }}>Frete Correios Mensal (R$)</label>
            {editandoConfig ? (
              <input type="number" step="0.01" value={configuracoes.frete_correios_mensal} onChange={(e) => setConfiguracoes(prev => ({ ...prev, frete_correios_mensal: parseFloat(e.target.value) || 0 }))} style={{ padding: '0.4rem', border: '1px solid #d1d5db', borderRadius: '4px', width: '120px' }} />
            ) : (
              <span style={{ fontSize: '1.1rem', fontWeight: '700', color: '#f59e0b' }}>{formatBRL(configuracoes.frete_correios_mensal)}</span>
            )}
          </div>
        </div>
      </div>

      {/* Resumo Principal */}
      {resumo && (
        <div style={{ 
          background: resumo.pago ? '#dcfce7' : '#fef2f2', 
          border: `3px solid ${resumo.pago ? '#22c55e' : '#ef4444'}`, 
          borderRadius: '12px', 
          padding: '1.5rem', 
          marginBottom: '1.5rem' 
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
            <h3 style={{ margin: 0, fontSize: '1.2rem', fontWeight: '700', color: resumo.pago ? '#166534' : '#dc2626' }}>
              {resumo.pago ? '✅ LUCRO PAGO' : '⏳ LUCRO PENDENTE'}
            </h3>
            <button
              onClick={() => marcarPagamento(!resumo.pago)}
              style={{
                padding: '0.5rem 1rem',
                fontSize: '0.9rem',
                fontWeight: '700',
                background: resumo.pago ? '#dc2626' : '#16a34a',
                color: 'white',
                border: 'none',
                borderRadius: '6px',
                cursor: marcandoPago ? 'wait' : 'pointer',
                opacity: marcandoPago ? 0.7 : 1
              }}
              disabled={marcandoPago}
            >
              {marcandoPago ? '⏳ Processando...' : (resumo.pago ? '❌ Marcar como Não Pago' : '✓ Fechar Período e Marcar como Pago')}
            </button>
          </div>
          
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '1rem' }}>
            <div style={{ background: 'white', padding: '1rem', borderRadius: '8px', textAlign: 'center' }}>
              <div style={{ fontSize: '0.8rem', color: '#6b7280' }}>Itens Entregues</div>
              <div style={{ fontSize: '1.5rem', fontWeight: '700', color: '#8b5cf6' }}>{resumo.total_itens_entregues}</div>
            </div>
            <div style={{ background: 'white', padding: '1rem', borderRadius: '8px', textAlign: 'center' }}>
              <div style={{ fontSize: '0.8rem', color: '#6b7280' }}>Total Venda</div>
              <div style={{ fontSize: '1.3rem', fontWeight: '700', color: '#3b82f6' }}>{formatBRL(resumo.total_venda)}</div>
            </div>
            <div style={{ background: 'white', padding: '1rem', borderRadius: '8px', textAlign: 'center' }}>
              <div style={{ fontSize: '0.8rem', color: '#6b7280' }}>Total Compra</div>
              <div style={{ fontSize: '1.3rem', fontWeight: '700', color: '#f59e0b' }}>{formatBRL(resumo.total_compra)}</div>
            </div>
            <div style={{ background: 'white', padding: '1rem', borderRadius: '8px', textAlign: 'center' }}>
              <div style={{ fontSize: '0.8rem', color: '#6b7280' }}>Frete Compra</div>
              <div style={{ fontSize: '1.3rem', fontWeight: '700', color: '#6366f1' }}>{formatBRL(resumo.total_frete_compra)}</div>
            </div>
            <div style={{ background: 'white', padding: '1rem', borderRadius: '8px', textAlign: 'center' }}>
              <div style={{ fontSize: '0.8rem', color: '#6b7280' }}>Imposto ({resumo.percentual_imposto}%)</div>
              <div style={{ fontSize: '1.3rem', fontWeight: '700', color: '#dc2626' }}>{formatBRL(resumo.total_imposto)}</div>
            </div>
            <div style={{ background: 'white', padding: '1rem', borderRadius: '8px', textAlign: 'center' }}>
              <div style={{ fontSize: '0.8rem', color: '#6b7280' }}>Frete Correios</div>
              <div style={{ fontSize: '1.3rem', fontWeight: '700', color: '#a855f7' }}>{formatBRL(resumo.frete_correios_mensal)}</div>
            </div>
            <div style={{ background: 'white', padding: '1rem', borderRadius: '8px', textAlign: 'center' }}>
              <div style={{ fontSize: '0.8rem', color: '#6b7280' }}>Custos Diversos</div>
              <div style={{ fontSize: '1.3rem', fontWeight: '700', color: '#ec4899' }}>{formatBRL(resumo.total_custos_diversos)}</div>
            </div>
            <div style={{ background: resumo.lucro_liquido > 0 ? '#dcfce7' : '#fef2f2', padding: '1rem', borderRadius: '8px', textAlign: 'center', border: '2px solid ' + (resumo.lucro_liquido > 0 ? '#22c55e' : '#ef4444') }}>
              <div style={{ fontSize: '0.8rem', color: '#6b7280', fontWeight: '600' }}>LUCRO LÍQUIDO</div>
              <div style={{ fontSize: '1.8rem', fontWeight: '800', color: resumo.lucro_liquido > 0 ? '#16a34a' : '#dc2626' }}>
                {formatBRL(resumo.lucro_liquido)}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Custos Diversos */}
      <div style={{ background: '#fdf2f8', border: '2px solid #ec4899', borderRadius: '12px', padding: '1rem', marginBottom: '1.5rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
          <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: '700', color: '#9d174d' }}>
            📋 Custos Diversos ({custosDiversos.length})
          </h3>
          <button
            onClick={() => setAdicionandoCusto(!adicionandoCusto)}
            style={{ padding: '0.4rem 0.8rem', fontSize: '0.8rem', background: '#ec4899', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}
          >
            {adicionandoCusto ? 'Cancelar' : '+ Adicionar Custo'}
          </button>
        </div>

        {adicionandoCusto && (
          <div style={{ background: 'white', padding: '1rem', borderRadius: '8px', marginBottom: '1rem' }}>
            <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', alignItems: 'flex-end' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: '600', marginBottom: '0.25rem' }}>Descrição</label>
                <input
                  type="text"
                  value={novoCusto.descricao}
                  onChange={(e) => setNovoCusto(prev => ({ ...prev, descricao: e.target.value }))}
                  placeholder="Ex: Caixas de papelão"
                  style={{ padding: '0.5rem', border: '1px solid #d1d5db', borderRadius: '4px', width: '200px' }}
                />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: '600', marginBottom: '0.25rem' }}>Valor (R$)</label>
                <input
                  type="number"
                  step="0.01"
                  value={novoCusto.valor}
                  onChange={(e) => setNovoCusto(prev => ({ ...prev, valor: e.target.value }))}
                  placeholder="0.00"
                  style={{ padding: '0.5rem', border: '1px solid #d1d5db', borderRadius: '4px', width: '100px' }}
                />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: '600', marginBottom: '0.25rem' }}>Categoria</label>
                <select
                  value={novoCusto.categoria}
                  onChange={(e) => setNovoCusto(prev => ({ ...prev, categoria: e.target.value }))}
                  style={{ padding: '0.5rem', border: '1px solid #d1d5db', borderRadius: '4px' }}
                >
                  <option value="correios">📦 Correios</option>
                  <option value="embalagem">📦 Embalagem</option>
                  <option value="transporte">🚗 Transporte</option>
                  <option value="estacionamento">🅿️ Estacionamento</option>
                  <option value="material">🛠️ Material</option>
                  <option value="outros">📋 Outros</option>
                </select>
              </div>
              <button
                onClick={adicionarCusto}
                style={{ padding: '0.5rem 1rem', background: '#16a34a', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontWeight: '600' }}
              >
                ✓ Adicionar
              </button>
            </div>
          </div>
        )}

        {custosDiversos.length > 0 ? (
          <div style={{ background: 'white', borderRadius: '8px', overflow: 'hidden' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
              <thead>
                <tr style={{ background: '#f9fafb' }}>
                  <th style={{ padding: '0.75rem', textAlign: 'left', borderBottom: '1px solid #e5e7eb' }}>Descrição</th>
                  <th style={{ padding: '0.75rem', textAlign: 'center', borderBottom: '1px solid #e5e7eb' }}>Categoria</th>
                  <th style={{ padding: '0.75rem', textAlign: 'right', borderBottom: '1px solid #e5e7eb' }}>Valor</th>
                  <th style={{ padding: '0.75rem', textAlign: 'center', borderBottom: '1px solid #e5e7eb' }}>Data</th>
                  <th style={{ padding: '0.75rem', textAlign: 'center', borderBottom: '1px solid #e5e7eb' }}>Ação</th>
                </tr>
              </thead>
              <tbody>
                {custosDiversos.map((custo) => (
                  <tr key={custo.id}>
                    <td style={{ padding: '0.75rem', borderBottom: '1px solid #e5e7eb' }}>{custo.descricao}</td>
                    <td style={{ padding: '0.75rem', textAlign: 'center', borderBottom: '1px solid #e5e7eb' }}>
                      <span style={{ padding: '0.25rem 0.5rem', background: '#f3f4f6', borderRadius: '4px', fontSize: '0.75rem' }}>
                        {custo.categoria}
                      </span>
                    </td>
                    <td style={{ padding: '0.75rem', textAlign: 'right', borderBottom: '1px solid #e5e7eb', fontWeight: '600', color: '#dc2626' }}>
                      {formatBRL(custo.valor)}
                    </td>
                    <td style={{ padding: '0.75rem', textAlign: 'center', borderBottom: '1px solid #e5e7eb', fontSize: '0.8rem', color: '#6b7280' }}>
                      {custo.data ? new Date(custo.data).toLocaleDateString('pt-BR') : '-'}
                    </td>
                    <td style={{ padding: '0.75rem', textAlign: 'center', borderBottom: '1px solid #e5e7eb' }}>
                      <button
                        onClick={() => removerCusto(custo.id)}
                        style={{ padding: '0.25rem 0.5rem', background: '#ef4444', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '0.75rem' }}
                      >
                        🗑️
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr style={{ background: '#fdf2f8' }}>
                  <td colSpan={2} style={{ padding: '0.75rem', fontWeight: '700' }}>TOTAL CUSTOS DIVERSOS</td>
                  <td style={{ padding: '0.75rem', textAlign: 'right', fontWeight: '800', color: '#ec4899', fontSize: '1.1rem' }}>
                    {formatBRL(custosDiversos.reduce((sum, c) => sum + (c.valor || 0), 0))}
                  </td>
                  <td colSpan={2}></td>
                </tr>
              </tfoot>
            </table>
          </div>
        ) : (
          <div style={{ background: 'white', padding: '1.5rem', borderRadius: '8px', textAlign: 'center', color: '#6b7280' }}>
            Nenhum custo diverso cadastrado. Clique em &quot;+ Adicionar Custo&quot; para começar.
          </div>
        )}
      </div>

      {/* Tabela de Itens Entregues (Planilha Lucro Total) */}
      <div style={{ background: '#f0fdf4', border: '2px solid #22c55e', borderRadius: '12px', padding: '1rem', marginBottom: '1.5rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
          <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: '700', color: '#166534' }}>
            📊 Planilha de Lucro - Itens Entregues ({itensEntregues.length})
          </h3>
          <button
            onClick={() => setMostrarItens(!mostrarItens)}
            style={{ padding: '0.4rem 0.8rem', fontSize: '0.8rem', background: '#22c55e', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}
          >
            {mostrarItens ? '▲ Ocultar' : '▼ Expandir'}
          </button>
        </div>

        {mostrarItens && (
          <div style={{ background: 'white', borderRadius: '8px', overflow: 'auto', maxHeight: '500px' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem' }}>
              <thead style={{ position: 'sticky', top: 0, background: '#f9fafb' }}>
                <tr>
                  <th style={{ padding: '0.6rem', textAlign: 'left', borderBottom: '2px solid #e5e7eb', whiteSpace: 'nowrap' }}>Código</th>
                  <th style={{ padding: '0.6rem', textAlign: 'left', borderBottom: '2px solid #e5e7eb', whiteSpace: 'nowrap' }}>OC</th>
                  <th style={{ padding: '0.6rem', textAlign: 'center', borderBottom: '2px solid #e5e7eb', whiteSpace: 'nowrap' }}>Qtd</th>
                  <th style={{ padding: '0.6rem', textAlign: 'right', borderBottom: '2px solid #e5e7eb', whiteSpace: 'nowrap' }}>Compra</th>
                  <th style={{ padding: '0.6rem', textAlign: 'right', borderBottom: '2px solid #e5e7eb', whiteSpace: 'nowrap' }}>Venda</th>
                  <th style={{ padding: '0.6rem', textAlign: 'right', borderBottom: '2px solid #e5e7eb', whiteSpace: 'nowrap' }}>Frete</th>
                  <th style={{ padding: '0.6rem', textAlign: 'right', borderBottom: '2px solid #e5e7eb', whiteSpace: 'nowrap' }}>Imposto ({resumo?.percentual_imposto || 11}%)</th>
                  <th style={{ padding: '0.6rem', textAlign: 'right', borderBottom: '2px solid #e5e7eb', whiteSpace: 'nowrap', fontWeight: '700', color: '#166534' }}>Lucro</th>
                </tr>
              </thead>
              <tbody>
                {itensEntregues.map((item, idx) => {
                  const lucroItem = item.valor_venda_total - item.valor_compra_total - item.frete_compra - item.imposto;
                  return (
                    <tr key={idx} style={{ borderBottom: '1px solid #e5e7eb' }}>
                      <td style={{ padding: '0.5rem 0.6rem', fontWeight: '600' }}>{item.codigo_item}</td>
                      <td style={{ padding: '0.5rem 0.6rem' }}>{item.numero_oc}</td>
                      <td style={{ padding: '0.5rem 0.6rem', textAlign: 'center' }}>{item.quantidade}</td>
                      <td style={{ padding: '0.5rem 0.6rem', textAlign: 'right', color: '#f59e0b' }}>{formatBRL(item.valor_compra_total)}</td>
                      <td style={{ padding: '0.5rem 0.6rem', textAlign: 'right', color: '#3b82f6' }}>{formatBRL(item.valor_venda_total)}</td>
                      <td style={{ padding: '0.5rem 0.6rem', textAlign: 'right', color: '#6366f1' }}>{formatBRL(item.frete_compra)}</td>
                      <td style={{ padding: '0.5rem 0.6rem', textAlign: 'right', color: '#dc2626' }}>{formatBRL(item.imposto)}</td>
                      <td style={{ padding: '0.5rem 0.6rem', textAlign: 'right', fontWeight: '700', color: lucroItem > 0 ? '#16a34a' : '#dc2626' }}>
                        {formatBRL(lucroItem)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr style={{ background: '#dcfce7', fontWeight: '700' }}>
                  <td colSpan={3} style={{ padding: '0.75rem', fontSize: '0.9rem' }}>TOTAIS</td>
                  <td style={{ padding: '0.75rem', textAlign: 'right', color: '#f59e0b' }}>{formatBRL(resumo?.total_compra || 0)}</td>
                  <td style={{ padding: '0.75rem', textAlign: 'right', color: '#3b82f6' }}>{formatBRL(resumo?.total_venda || 0)}</td>
                  <td style={{ padding: '0.75rem', textAlign: 'right', color: '#6366f1' }}>{formatBRL(resumo?.total_frete_compra || 0)}</td>
                  <td style={{ padding: '0.75rem', textAlign: 'right', color: '#dc2626' }}>{formatBRL(resumo?.total_imposto || 0)}</td>
                  <td style={{ padding: '0.75rem', textAlign: 'right', color: '#16a34a', fontSize: '1rem' }}>{formatBRL(resumo?.lucro_liquido || 0)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>

      {/* Histórico de Fechamentos */}
      <div style={{ background: '#f3f4f6', border: '1px solid #d1d5db', borderRadius: '12px', padding: '1rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
          <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: '700', color: '#374151' }}>
            📜 Histórico de Fechamentos ({fechamentos.length})
          </h3>
          <button
            onClick={() => setMostrarHistorico(!mostrarHistorico)}
            style={{ padding: '0.4rem 0.8rem', fontSize: '0.8rem', background: '#6b7280', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}
          >
            {mostrarHistorico ? '▲ Ocultar' : '▼ Ver Histórico'}
          </button>
        </div>

        {mostrarHistorico && (
          fechamentos.length > 0 ? (
            <div style={{ background: 'white', borderRadius: '8px', overflow: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem' }}>
                <thead>
                  <tr style={{ background: '#f9fafb' }}>
                    <th style={{ padding: '0.6rem', textAlign: 'left', borderBottom: '2px solid #e5e7eb' }}>Data Fechamento</th>
                    <th style={{ padding: '0.6rem', textAlign: 'center', borderBottom: '2px solid #e5e7eb' }}>Itens</th>
                    <th style={{ padding: '0.6rem', textAlign: 'right', borderBottom: '2px solid #e5e7eb' }}>Venda</th>
                    <th style={{ padding: '0.6rem', textAlign: 'right', borderBottom: '2px solid #e5e7eb' }}>Compra</th>
                    <th style={{ padding: '0.6rem', textAlign: 'right', borderBottom: '2px solid #e5e7eb' }}>Custos</th>
                    <th style={{ padding: '0.6rem', textAlign: 'right', borderBottom: '2px solid #e5e7eb', fontWeight: '700' }}>Lucro</th>
                    <th style={{ padding: '0.6rem', textAlign: 'center', borderBottom: '2px solid #e5e7eb' }}>Fechado Por</th>
                  </tr>
                </thead>
                <tbody>
                  {fechamentos.map((f, idx) => {
                    const lucro = (f.resumo?.total_venda || 0) - (f.resumo?.total_compra || 0) - (f.resumo?.total_frete_compra || 0) - (f.resumo?.total_imposto || 0) - (f.resumo?.total_custos_diversos || 0);
                    return (
                      <tr key={idx} style={{ borderBottom: '1px solid #e5e7eb' }}>
                        <td style={{ padding: '0.5rem 0.6rem' }}>
                          {new Date(f.data_fechamento).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                        </td>
                        <td style={{ padding: '0.5rem 0.6rem', textAlign: 'center' }}>{f.resumo?.total_itens_entregues || 0}</td>
                        <td style={{ padding: '0.5rem 0.6rem', textAlign: 'right', color: '#3b82f6' }}>{formatBRL(f.resumo?.total_venda || 0)}</td>
                        <td style={{ padding: '0.5rem 0.6rem', textAlign: 'right', color: '#f59e0b' }}>{formatBRL(f.resumo?.total_compra || 0)}</td>
                        <td style={{ padding: '0.5rem 0.6rem', textAlign: 'right', color: '#dc2626' }}>{formatBRL(f.resumo?.total_custos_diversos || 0)}</td>
                        <td style={{ padding: '0.5rem 0.6rem', textAlign: 'right', fontWeight: '700', color: lucro > 0 ? '#16a34a' : '#dc2626' }}>
                          {formatBRL(lucro)}
                        </td>
                        <td style={{ padding: '0.5rem 0.6rem', textAlign: 'center', fontSize: '0.75rem' }}>{f.fechado_por}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <div style={{ background: 'white', padding: '1rem', borderRadius: '8px', textAlign: 'center', color: '#6b7280' }}>
              Nenhum fechamento realizado ainda.
            </div>
          )
        )}
      </div>
    </>
  );
};

const AdminPanel = () => {
  const { isAdmin } = useAuth();
  const [comissoes, setComissoes] = useState([]);
  const [notasFiscais, setNotasFiscais] = useState({ notas_compra: [], notas_venda: [], notas_duplicadas: [], total_duplicadas: 0 });
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState(isAdmin() ? 'comissoes' : 'notas'); // Moderador começa em notas
  const [expandedResponsavel, setExpandedResponsavel] = useState(null);
  const [itensResponsavel, setItensResponsavel] = useState([]);
  const [selectedItens, setSelectedItens] = useState([]);
  const [comissaoPercentual, setComissaoPercentual] = useState({});
  const [pagamentos, setPagamentos] = useState([]);
  const [downloadingNF, setDownloadingNF] = useState(null);
  const [editingPagamento, setEditingPagamento] = useState(null);
  const [editPagamentoForm, setEditPagamentoForm] = useState({ valor_comissao: 0 });
  
  // Seleção de NFs para download bulk
  const [selectedNFsCompra, setSelectedNFsCompra] = useState(new Set());
  const [selectedNFsVenda, setSelectedNFsVenda] = useState(new Set());
  const [downloadingBulk, setDownloadingBulk] = useState(false);
  
  // Atualização em massa de OCs
  const [atualizandoOCs, setAtualizandoOCs] = useState(false);
  const [resultadoAtualizacao, setResultadoAtualizacao] = useState(null);
  
  // Reprocessar itens com planilha
  const [reprocessandoItens, setReprocessandoItens] = useState(false);
  const [resultadoReprocessamento, setResultadoReprocessamento] = useState(null);
  
  // Gerenciamento de usuários
  const [usuarios, setUsuarios] = useState([]);
  const [loadingUsuarios, setLoadingUsuarios] = useState(false);
  const [promovendo, setPromovendo] = useState(null);
  
  // Paginação para NFs
  const [nfCompraPage, setNfCompraPage] = useState(1);
  const [nfCompraPerPage, setNfCompraPerPage] = useState(5);
  const [nfVendaPage, setNfVendaPage] = useState(1);
  const [nfVendaPerPage, setNfVendaPerPage] = useState(5);
  
  // Paginação para itens do responsável
  const [itensPage, setItensPage] = useState(1);
  const [itensPerPage, setItensPerPage] = useState(5);
  
  // Campos de pesquisa para NFs
  const [searchNFCompra, setSearchNFCompra] = useState('');
  const [searchNFVenda, setSearchNFVenda] = useState('');

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const token = localStorage.getItem('token');
      const headers = { Authorization: `Bearer ${token}` };
      
      const [comissoesRes, nfsRes, pagamentosRes] = await Promise.all([
        axios.get(`${API}/admin/comissoes`, { headers }),
        axios.get(`${API}/admin/notas-fiscais`, { headers }),
        axios.get(`${API}/admin/pagamentos`, { headers }).catch(() => ({ data: [] }))
      ]);
      
      setComissoes(comissoesRes.data);
      setNotasFiscais(nfsRes.data);
      setPagamentos(pagamentosRes.data || []);
    } catch (error) {
      console.error('Erro ao carregar dados:', error);
    } finally {
      setLoading(false);
    }
  };

  // Função para atualizar múltiplas OCs com PDFs
  const handleAtualizarOCsEmMassa = async (event) => {
    const files = event.target.files;
    if (!files || files.length === 0) return;
    
    const pdfFiles = Array.from(files).filter(f => f.name.toLowerCase().endsWith('.pdf'));
    
    if (pdfFiles.length === 0) {
      alert('Nenhum arquivo PDF selecionado');
      return;
    }
    
    if (!window.confirm(
      `Atualizar ${pdfFiles.length} OC(s) com os PDFs selecionados?\n\n` +
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
    
    setAtualizandoOCs(true);
    setResultadoAtualizacao(null);
    
    try {
      const formData = new FormData();
      pdfFiles.forEach(file => {
        formData.append('files', file);
      });
      
      const token = localStorage.getItem('token');
      const response = await fetch(`${API}/admin/atualizar-todas-ocs-pdf`, {
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
      
      setResultadoAtualizacao(result);
      
      const sucessos = result.resultados.filter(r => r.success && r.campos_atualizados[0] !== "Nenhum campo precisou ser atualizado").length;
      const jaTinham = result.resultados.filter(r => r.success && r.campos_atualizados[0] === "Nenhum campo precisou ser atualizado").length;
      const erros = result.resultados.filter(r => !r.success).length;
      
      alert(
        `✅ Processamento concluído!\n\n` +
        `📊 Resultados:\n` +
        `• ${sucessos} OC(s) atualizada(s)\n` +
        `• ${jaTinham} OC(s) já estavam completas\n` +
        `• ${erros} erro(s)\n\n` +
        `Veja os detalhes abaixo.`
      );
      
    } catch (error) {
      console.error('Erro ao atualizar OCs:', error);
      alert(`❌ Erro ao atualizar: ${error.message}`);
    } finally {
      setAtualizandoOCs(false);
      event.target.value = '';
    }
  };

  // Função para reprocessar itens com dados da planilha
  const handleReprocessarItensPlanilha = async (numeroOc = null) => {
    const confirmar = window.confirm(
      numeroOc 
        ? `Reprocessar os itens da OC ${numeroOc} com os dados da planilha?\n\nIsso irá atualizar: descrição, lote, responsável, região, marca/modelo.`
        : `Reprocessar TODAS as OCs com os dados da planilha?\n\nIsso irá atualizar: descrição, lote, responsável, região, marca/modelo.\n\n⚠️ Esta operação pode demorar alguns minutos.`
    );
    
    if (!confirmar) return;
    
    setReprocessandoItens(true);
    setResultadoReprocessamento(null);
    
    try {
      const token = localStorage.getItem('token');
      const url = numeroOc 
        ? `${API}/admin/reprocessar-itens-planilha?numero_oc=${encodeURIComponent(numeroOc)}`
        : `${API}/admin/reprocessar-itens-planilha`;
      
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      
      const result = await response.json();
      
      if (!response.ok) {
        throw new Error(result.detail || 'Erro ao reprocessar');
      }
      
      setResultadoReprocessamento(result);
      
      alert(
        `✅ Reprocessamento concluído!\n\n` +
        `📊 Resultados:\n` +
        `• ${result.ocs_processadas} OC(s) processada(s)\n` +
        `• ${result.ocs_atualizadas} OC(s) atualizada(s)\n` +
        `• ${result.itens_atualizados} item(ns) atualizado(s)\n` +
        (result.itens_nao_encontrados_na_planilha?.length > 0 
          ? `\n⚠️ ${result.itens_nao_encontrados_na_planilha.length} item(ns) não encontrado(s) na planilha`
          : '')
      );
      
    } catch (error) {
      console.error('Erro ao reprocessar:', error);
      alert(`❌ Erro ao reprocessar: ${error.message}`);
    } finally {
      setReprocessandoItens(false);
    }
  };

  // Carregar lista de usuários
  const loadUsuarios = async () => {
    setLoadingUsuarios(true);
    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`${API}/users`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await response.json();
      if (response.ok) {
        setUsuarios(data.users || []);
        if (!data.users || data.users.length === 0) {
          alert('Nenhum usuário encontrado no sistema.');
        }
      } else {
        console.error('Erro na resposta:', data);
        alert(`Erro ao carregar usuários: ${data.detail || 'Erro desconhecido'}`);
      }
    } catch (error) {
      console.error('Erro ao carregar usuários:', error);
      alert(`Erro ao carregar usuários: ${error.message}`);
    } finally {
      setLoadingUsuarios(false);
    }
  };

  // Promover usuário a admin
  // Alterar role do usuário (admin, moderador, user)
  const handleAlterarRole = async (email, novoRole) => {
    const roleNames = { admin: 'Administrador', moderador: 'Moderador', user: 'Usuário' };
    if (!window.confirm(`Alterar ${email} para ${roleNames[novoRole]}?`)) return;
    
    setPromovendo(email);
    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`${API}/users/${encodeURIComponent(email)}/role`, {
        method: 'PATCH',
        headers: { 
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ role: novoRole })
      });
      const data = await response.json();
      
      if (response.ok) {
        alert(`✅ ${data.message}`);
        loadUsuarios();
      } else {
        alert(`❌ Erro: ${data.detail || 'Erro desconhecido'}`);
      }
    } catch (error) {
      alert(`❌ Erro: ${error.message}`);
    } finally {
      setPromovendo(null);
    }
  };

  // Filtrar e Paginar NFs de Compra
  const filteredNfCompra = useMemo(() => {
    if (!searchNFCompra.trim()) return notasFiscais.notas_compra;
    const term = searchNFCompra.toLowerCase();
    return notasFiscais.notas_compra.filter(nf => 
      (nf.filename || '').toLowerCase().includes(term) ||
      (nf.numero_nf || '').toLowerCase().includes(term) ||
      (nf.numero_oc || '').toLowerCase().includes(term) ||
      (nf.codigo_item || '').toLowerCase().includes(term)
    );
  }, [notasFiscais.notas_compra, searchNFCompra]);

  const paginatedNfCompra = useMemo(() => {
    const start = (nfCompraPage - 1) * nfCompraPerPage;
    return filteredNfCompra.slice(start, start + nfCompraPerPage);
  }, [filteredNfCompra, nfCompraPage, nfCompraPerPage]);

  // Filtrar e Paginar NFs de Venda
  const filteredNfVenda = useMemo(() => {
    if (!searchNFVenda.trim()) return notasFiscais.notas_venda;
    const term = searchNFVenda.toLowerCase();
    return notasFiscais.notas_venda.filter(nf => 
      (nf.filename || '').toLowerCase().includes(term) ||
      (nf.numero_nf || '').toLowerCase().includes(term) ||
      (nf.numero_oc || '').toLowerCase().includes(term) ||
      (nf.codigo_item || '').toLowerCase().includes(term)
    );
  }, [notasFiscais.notas_venda, searchNFVenda]);

  const paginatedNfVenda = useMemo(() => {
    const start = (nfVendaPage - 1) * nfVendaPerPage;
    return filteredNfVenda.slice(start, start + nfVendaPerPage);
  }, [filteredNfVenda, nfVendaPage, nfVendaPerPage]);

  // Reset página ao filtrar
  useEffect(() => {
    setNfCompraPage(1);
  }, [searchNFCompra]);

  useEffect(() => {
    setNfVendaPage(1);
  }, [searchNFVenda]);

  // Paginação de itens do responsável
  const paginatedItensResponsavel = useMemo(() => {
    const start = (itensPage - 1) * itensPerPage;
    return itensResponsavel.slice(start, start + itensPerPage);
  }, [itensResponsavel, itensPage, itensPerPage]);

  const loadItensResponsavel = async (responsavel) => {
    try {
      const token = localStorage.getItem('token');
      const response = await axios.get(
        `${API}/admin/itens-responsavel/${encodeURIComponent(responsavel)}`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      setItensResponsavel(response.data);
      setSelectedItens([]);
      setItensPage(1);  // Reset página
    } catch (error) {
      console.error('Erro ao carregar itens:', error);
      setItensResponsavel([]);
    }
  };

  const toggleExpandResponsavel = async (responsavel) => {
    if (expandedResponsavel === responsavel) {
      setExpandedResponsavel(null);
      setItensResponsavel([]);
    } else {
      setExpandedResponsavel(responsavel);
      await loadItensResponsavel(responsavel);
    }
  };

  const toggleSelectItem = (itemId) => {
    setSelectedItens(prev => 
      prev.includes(itemId) 
        ? prev.filter(id => id !== itemId)
        : [...prev, itemId]
    );
  };

  const selectAllItens = () => {
    const naosPagos = itensResponsavel.filter(item => !item.pago);
    if (selectedItens.length === naosPagos.length) {
      setSelectedItens([]);
    } else {
      setSelectedItens(naosPagos.map(item => item.id));
    }
  };

  const calcularTotalSelecionado = () => {
    // Agora calcula o valor total de VENDA (não lucro)
    return itensResponsavel
      .filter(item => selectedItens.includes(item.id))
      .reduce((sum, item) => sum + (item.valor_venda || 0), 0);
  };

  const registrarPagamento = async (responsavel) => {
    if (selectedItens.length === 0) {
      alert('Selecione pelo menos um item');
      return;
    }
    
    // Comissão fixa de 1.5%
    const percentual = 1.5;

    const totalVenda = calcularTotalSelecionado();
    const valorComissao = totalVenda * (percentual / 100);
    
    if (!window.confirm(`Confirmar pagamento de ${formatBRL(valorComissao)} (${percentual}% de ${formatBRL(totalVenda)}) para ${getNome(responsavel)}?`)) {
      return;
    }

    try {
      const token = localStorage.getItem('token');
      await axios.post(
        `${API}/admin/pagamentos`,
        {
          responsavel,
          itens_ids: selectedItens,
          percentual,
          valor_comissao: valorComissao,
          total_venda: totalVenda
        },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      alert('Pagamento registrado com sucesso!');
      setSelectedItens([]);
      loadData();
      loadItensResponsavel(responsavel);
    } catch (error) {
      console.error('Erro ao registrar pagamento:', error);
      alert('Erro ao registrar pagamento');
    }
  };

  const startEditPagamento = (pag) => {
    setEditingPagamento(pag.id);
    setEditPagamentoForm({ valor_comissao: pag.valor_comissao });
  };

  const cancelEditPagamento = () => {
    setEditingPagamento(null);
    setEditPagamentoForm({ valor_comissao: 0 });
  };

  const savePagamento = async (pagamentoId) => {
    try {
      const token = localStorage.getItem('token');
      await axios.patch(
        `${API}/admin/pagamentos/${pagamentoId}`,
        { valor_comissao: editPagamentoForm.valor_comissao },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      alert('Pagamento atualizado!');
      setEditingPagamento(null);
      loadData();
    } catch (error) {
      console.error('Erro ao atualizar pagamento:', error);
      alert('Erro ao atualizar pagamento');
    }
  };

  const deletePagamento = async (pagamentoId, responsavel) => {
    if (!window.confirm('Tem certeza que deseja deletar este pagamento? Os itens voltarão a ficar como não pagos.')) {
      return;
    }
    
    try {
      const token = localStorage.getItem('token');
      await axios.delete(
        `${API}/admin/pagamentos/${pagamentoId}`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      alert('Pagamento deletado!');
      loadData();
      if (expandedResponsavel === responsavel) {
        loadItensResponsavel(responsavel);
      }
    } catch (error) {
      console.error('Erro ao deletar pagamento:', error);
      alert('Erro ao deletar pagamento');
    }
  };

  const downloadNF = async (nf) => {
    setDownloadingNF(nf.id);
    try {
      const token = localStorage.getItem('token');
      const response = await axios.get(
        `${API}/purchase-orders/${nf.po_id}/items/by-index/${nf.item_index}/notas-fiscais/${nf.id}/download`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      
      const { file_data, content_type, filename } = response.data;
      
      const byteCharacters = atob(file_data);
      const byteNumbers = new Array(byteCharacters.length);
      for (let i = 0; i < byteCharacters.length; i++) {
        byteNumbers[i] = byteCharacters.charCodeAt(i);
      }
      const byteArray = new Uint8Array(byteNumbers);
      const blob = new Blob([byteArray], { type: content_type });
      
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename || nf.filename;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (error) {
      console.error('Erro ao baixar NF:', error);
      alert('Erro ao baixar nota fiscal');
    } finally {
      setDownloadingNF(null);
    }
  };

  // Toggle seleção de NF de Compra
  const toggleNFCompraSelection = (nf) => {
    const key = `${nf.po_id}_${nf.item_index}_${nf.id}`;
    setSelectedNFsCompra(prev => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  };

  // Toggle seleção de NF de Venda
  const toggleNFVendaSelection = (nf) => {
    const key = `${nf.po_id}_${nf.item_index}_${nf.id}`;
    setSelectedNFsVenda(prev => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  };

  // Selecionar todas as NFs de Compra da página atual
  const selectAllNFsCompra = () => {
    const allKeys = paginatedNfCompra.map(nf => `${nf.po_id}_${nf.item_index}_${nf.id}`);
    const allSelected = allKeys.every(key => selectedNFsCompra.has(key));
    
    if (allSelected) {
      // Desselecionar todos
      setSelectedNFsCompra(prev => {
        const next = new Set(prev);
        allKeys.forEach(key => next.delete(key));
        return next;
      });
    } else {
      // Selecionar todos
      setSelectedNFsCompra(prev => {
        const next = new Set(prev);
        allKeys.forEach(key => next.add(key));
        return next;
      });
    }
  };

  // Selecionar todas as NFs de Venda da página atual
  const selectAllNFsVenda = () => {
    const allKeys = paginatedNfVenda.map(nf => `${nf.po_id}_${nf.item_index}_${nf.id}`);
    const allSelected = allKeys.every(key => selectedNFsVenda.has(key));
    
    if (allSelected) {
      setSelectedNFsVenda(prev => {
        const next = new Set(prev);
        allKeys.forEach(key => next.delete(key));
        return next;
      });
    } else {
      setSelectedNFsVenda(prev => {
        const next = new Set(prev);
        allKeys.forEach(key => next.add(key));
        return next;
      });
    }
  };

  // Download em bulk das NFs selecionadas
  const downloadBulkNFs = async (tipo) => {
    const selectedSet = tipo === 'compra' ? selectedNFsCompra : selectedNFsVenda;
    const nfList = tipo === 'compra' ? notasFiscais.notas_compra : notasFiscais.notas_venda;
    
    if (selectedSet.size === 0) {
      alert('Selecione pelo menos uma NF para baixar');
      return;
    }

    setDownloadingBulk(true);
    try {
      const token = localStorage.getItem('token');
      
      // Montar lista de NFs para download
      const nfsToDownload = nfList
        .filter(nf => selectedSet.has(`${nf.po_id}_${nf.item_index}_${nf.id}`))
        .map(nf => ({
          po_id: nf.po_id,
          item_index: nf.item_index,
          nf_id: nf.id,
          tipo: tipo === 'compra' ? 'fornecedor' : 'revenda'
        }));

      const response = await axios.post(
        `${API}/admin/notas-fiscais/bulk-download`,
        { nfs: nfsToDownload },
        { headers: { Authorization: `Bearer ${token}` } }
      );

      const { file_data, filename, content_type } = response.data;
      
      // Criar download
      const byteCharacters = atob(file_data);
      const byteNumbers = new Array(byteCharacters.length);
      for (let i = 0; i < byteCharacters.length; i++) {
        byteNumbers[i] = byteCharacters.charCodeAt(i);
      }
      const byteArray = new Uint8Array(byteNumbers);
      const blob = new Blob([byteArray], { type: content_type });
      
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);

      // Limpar seleção e recarregar dados
      if (tipo === 'compra') {
        setSelectedNFsCompra(new Set());
      } else {
        setSelectedNFsVenda(new Set());
      }
      
      // Recarregar para mostrar quem baixou
      await loadData();
      
      alert(`${nfsToDownload.length} NF(s) baixadas com sucesso!`);
    } catch (error) {
      console.error('Erro ao baixar NFs em bulk:', error);
      alert('Erro ao baixar notas fiscais');
    } finally {
      setDownloadingBulk(false);
    }
  };

  // Extrair nome limpo do responsável
  const getNome = (responsavel) => {
    if (!responsavel) return '';
    // Remover sufixos comuns de email
    let nome = responsavel.replace(/onsolucoes/gi, '').replace(/\.$/g, '').trim();
    // Se tiver ponto, pegar só a primeira parte
    nome = nome.split('.')[0];
    // Capitalizar primeira letra
    return nome.charAt(0).toUpperCase() + nome.slice(1).toLowerCase();
  };

  if (loading) {
    return <div className="loading" data-testid="loading-admin">Carregando...</div>;
  }

  const totalVendaEntregue = comissoes.reduce((sum, c) => sum + (c.valor_venda_total || 0), 0);

  return (
    <div data-testid="admin-panel-page">
      <div className="page-header">
        <h1 className="page-title" data-testid="admin-title">Painel Administrativo</h1>
        <p className="page-subtitle">Gestão de comissões e notas fiscais</p>
      </div>

      <div className="card" style={{ marginBottom: '2rem' }}>
        <div style={{ display: 'flex', gap: '1rem', marginBottom: '1.5rem', flexWrap: 'wrap' }}>
          {/* Comissões - apenas para Admin */}
          {isAdmin() && (
            <button
              onClick={() => setView('comissoes')}
              className={`btn ${view === 'comissoes' ? 'btn-primary' : 'btn-secondary'}`}
              data-testid="view-comissoes-btn"
            >
              💰 Comissões
            </button>
          )}
          <button
            onClick={() => setView('notas')}
            className={`btn ${view === 'notas' ? 'btn-primary' : 'btn-secondary'}`}
            data-testid="view-notas-btn"
          >
            📄 Notas Fiscais ({notasFiscais.total_compra + notasFiscais.total_venda})
          </button>
          <button
            onClick={() => setView('atualizar-ocs')}
            className={`btn ${view === 'atualizar-ocs' ? 'btn-primary' : 'btn-secondary'}`}
            data-testid="view-atualizar-ocs-btn"
          >
            🔄 Atualizar OCs
          </button>
          {/* Usuários - apenas para Admin */}
          {isAdmin() && (
            <button
              onClick={() => { setView('usuarios'); loadUsuarios(); }}
              className={`btn ${view === 'usuarios' ? 'btn-primary' : 'btn-secondary'}`}
              data-testid="view-usuarios-btn"
            >
              👥 Usuários
            </button>
          )}
          <button
            onClick={() => setView('relatorio')}
            className={`btn ${view === 'relatorio' ? 'btn-primary' : 'btn-secondary'}`}
            data-testid="view-relatorio-btn"
            style={{ background: view === 'relatorio' ? '#16a34a' : '#6b7280' }}
          >
            📊 Relatório
          </button>
          {/* Lucro Total - apenas para Admin */}
          {isAdmin() && (
            <button
              onClick={() => setView('lucro-total')}
              className={`btn ${view === 'lucro-total' ? 'btn-primary' : 'btn-secondary'}`}
              data-testid="view-lucro-total-btn"
              style={{ background: view === 'lucro-total' ? '#059669' : '#6b7280' }}
            >
              💵 Lucro Total
            </button>
          )}
        </div>

        {/* ============== ABA RELATÓRIO ============== */}
        {view === 'relatorio' && (
          <RelatorioSection />
        )}

        {/* ============== ABA LUCRO TOTAL (Admin Only) ============== */}
        {view === 'lucro-total' && isAdmin() && (
          <LucroTotalSection />
        )}

        {/* ============== ABA USUÁRIOS ============== */}
        {view === 'usuarios' && isAdmin() && (
          <>
            <h2 style={{ fontSize: '1.5rem', fontWeight: '700', marginBottom: '1rem' }}>Gerenciamento de Usuários</h2>
            <p style={{ fontSize: '0.9rem', color: '#6b7280', marginBottom: '1rem' }}>
              Gerencie os usuários do sistema. Admins têm acesso total, usuários comuns veem apenas seus próprios itens.
            </p>
            
            <button
              onClick={loadUsuarios}
              disabled={loadingUsuarios}
              className="btn btn-secondary"
              style={{ marginBottom: '1rem' }}
            >
              {loadingUsuarios ? '⏳ Carregando...' : '🔄 Atualizar Lista'}
            </button>
            
            {loadingUsuarios ? (
              <p>Carregando usuários...</p>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr style={{ background: '#f3f4f6' }}>
                      <th style={{ padding: '0.75rem', textAlign: 'left', borderBottom: '2px solid #e5e7eb' }}>Email</th>
                      <th style={{ padding: '0.75rem', textAlign: 'left', borderBottom: '2px solid #e5e7eb' }}>Nome</th>
                      <th style={{ padding: '0.75rem', textAlign: 'center', borderBottom: '2px solid #e5e7eb' }}>Role</th>
                      <th style={{ padding: '0.75rem', textAlign: 'center', borderBottom: '2px solid #e5e7eb' }}>Ações</th>
                    </tr>
                  </thead>
                  <tbody>
                    {usuarios.length === 0 ? (
                      <tr>
                        <td colSpan={4} style={{ padding: '1rem', textAlign: 'center', color: '#6b7280' }}>
                          Nenhum usuário encontrado. Clique em Atualizar Lista.
                        </td>
                      </tr>
                    ) : (
                      usuarios.map((user, idx) => (
                        <tr key={user.email || idx} style={{ borderBottom: '1px solid #e5e7eb' }}>
                          <td style={{ padding: '0.75rem' }}>{user.email}</td>
                          <td style={{ padding: '0.75rem' }}>{user.owner_name || user.name || '-'}</td>
                          <td style={{ padding: '0.75rem', textAlign: 'center' }}>
                            <span style={{
                              padding: '0.25rem 0.75rem',
                              borderRadius: '12px',
                              fontSize: '0.8rem',
                              fontWeight: '600',
                              background: user.role === 'admin' ? '#dbeafe' : user.role === 'moderador' ? '#fef3c7' : '#f3f4f6',
                              color: user.role === 'admin' ? '#1d4ed8' : user.role === 'moderador' ? '#d97706' : '#6b7280'
                            }}>
                              {user.role === 'admin' ? '👑 Admin' : user.role === 'moderador' ? '🔰 Moderador' : '👤 Usuário'}
                            </span>
                          </td>
                          <td style={{ padding: '0.75rem', textAlign: 'center' }}>
                            <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'center', flexWrap: 'wrap' }}>
                              {user.role === 'admin' ? (
                                <>
                                  <button
                                    onClick={() => handleAlterarRole(user.email, 'moderador')}
                                    disabled={promovendo === user.email}
                                    className="btn"
                                    style={{
                                      padding: '0.4rem 0.75rem',
                                      fontSize: '0.75rem',
                                      background: '#fef3c7',
                                      color: '#d97706',
                                      border: 'none',
                                      borderRadius: '6px',
                                      cursor: promovendo === user.email ? 'wait' : 'pointer'
                                    }}
                                  >
                                    {promovendo === user.email ? '⏳' : '🔰 Moderador'}
                                  </button>
                                  <button
                                    onClick={() => handleAlterarRole(user.email, 'user')}
                                    disabled={promovendo === user.email}
                                    className="btn"
                                    style={{
                                      padding: '0.4rem 0.75rem',
                                      fontSize: '0.75rem',
                                      background: '#fee2e2',
                                      color: '#dc2626',
                                      border: 'none',
                                      borderRadius: '6px',
                                      cursor: promovendo === user.email ? 'wait' : 'pointer'
                                    }}
                                  >
                                    {promovendo === user.email ? '⏳' : '⬇️ Usuário'}
                                  </button>
                                </>
                              ) : user.role === 'moderador' ? (
                                <>
                                  <button
                                    onClick={() => handleAlterarRole(user.email, 'admin')}
                                    disabled={promovendo === user.email}
                                    className="btn"
                                    style={{
                                      padding: '0.4rem 0.75rem',
                                      fontSize: '0.75rem',
                                      background: '#dbeafe',
                                      color: '#1d4ed8',
                                      border: 'none',
                                      borderRadius: '6px',
                                      cursor: promovendo === user.email ? 'wait' : 'pointer'
                                    }}
                                  >
                                    {promovendo === user.email ? '⏳' : '👑 Admin'}
                                  </button>
                                  <button
                                    onClick={() => handleAlterarRole(user.email, 'user')}
                                    disabled={promovendo === user.email}
                                    className="btn"
                                    style={{
                                      padding: '0.4rem 0.75rem',
                                      fontSize: '0.75rem',
                                      background: '#fee2e2',
                                      color: '#dc2626',
                                      border: 'none',
                                      borderRadius: '6px',
                                      cursor: promovendo === user.email ? 'wait' : 'pointer'
                                    }}
                                  >
                                    {promovendo === user.email ? '⏳' : '⬇️ Usuário'}
                                  </button>
                                </>
                              ) : (
                                <>
                                  <button
                                    onClick={() => handleAlterarRole(user.email, 'admin')}
                                    disabled={promovendo === user.email}
                                    className="btn"
                                    style={{
                                      padding: '0.4rem 0.75rem',
                                      fontSize: '0.75rem',
                                      background: '#dbeafe',
                                      color: '#1d4ed8',
                                      border: 'none',
                                      borderRadius: '6px',
                                      cursor: promovendo === user.email ? 'wait' : 'pointer'
                                    }}
                                  >
                                    {promovendo === user.email ? '⏳' : '👑 Admin'}
                                  </button>
                                  <button
                                    onClick={() => handleAlterarRole(user.email, 'moderador')}
                                    disabled={promovendo === user.email}
                                    className="btn"
                                    style={{
                                      padding: '0.4rem 0.75rem',
                                      fontSize: '0.75rem',
                                      background: '#fef3c7',
                                      color: '#d97706',
                                      border: 'none',
                                      borderRadius: '6px',
                                      cursor: promovendo === user.email ? 'wait' : 'pointer'
                                    }}
                                  >
                                    {promovendo === user.email ? '⏳' : '🔰 Moderador'}
                                  </button>
                                </>
                              )}
                            </div>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}

        {/* ============== ABA ATUALIZAR OCS ============== */}
        {view === 'atualizar-ocs' && (
          <>
            <h2 style={{ fontSize: '1.5rem', fontWeight: '700', marginBottom: '1rem' }}>Atualizar OCs com PDFs</h2>
            <p style={{ fontSize: '0.9rem', color: '#6b7280', marginBottom: '1rem' }}>
              Selecione múltiplos PDFs de OCs para preencher automaticamente os dados faltantes (endereço de entrega, data de entrega).
              <br />
              <strong>Nenhum dado dos itens será alterado</strong> - status, responsáveis, fontes de compra, notas fiscais e observações são preservados.
            </p>
            
            <div style={{ 
              padding: '1.5rem', 
              background: '#f0f9ff', 
              borderRadius: '12px', 
              border: '2px dashed #3b82f6',
              textAlign: 'center',
              marginBottom: '1.5rem'
            }}>
              <label 
                style={{ 
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '0.5rem',
                  padding: '1rem 2rem',
                  background: atualizandoOCs ? '#9ca3af' : '#3b82f6',
                  color: 'white',
                  borderRadius: '8px',
                  cursor: atualizandoOCs ? 'wait' : 'pointer',
                  fontWeight: '600',
                  fontSize: '1rem'
                }}
              >
                {atualizandoOCs ? '⏳ Processando...' : '📁 Selecionar PDFs das OCs'}
                <input 
                  type="file" 
                  accept=".pdf"
                  multiple
                  onChange={handleAtualizarOCsEmMassa}
                  disabled={atualizandoOCs}
                  style={{ display: 'none' }}
                />
              </label>
              <p style={{ marginTop: '1rem', fontSize: '0.85rem', color: '#6b7280' }}>
                Você pode selecionar múltiplos arquivos PDF de uma vez
              </p>
            </div>
            
            {/* Resultado da atualização */}
            {resultadoAtualizacao && (
              <div style={{ marginTop: '1.5rem' }}>
                <h3 style={{ fontSize: '1.1rem', fontWeight: '600', marginBottom: '1rem' }}>
                  📊 Resultado do Processamento
                </h3>
                <div style={{ 
                  background: '#f9fafb', 
                  borderRadius: '8px', 
                  border: '1px solid #e5e7eb',
                  overflow: 'hidden'
                }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.9rem' }}>
                    <thead>
                      <tr style={{ background: '#f3f4f6' }}>
                        <th style={{ padding: '0.75rem', textAlign: 'left', borderBottom: '1px solid #e5e7eb' }}>Arquivo</th>
                        <th style={{ padding: '0.75rem', textAlign: 'left', borderBottom: '1px solid #e5e7eb' }}>OC</th>
                        <th style={{ padding: '0.75rem', textAlign: 'left', borderBottom: '1px solid #e5e7eb' }}>Status</th>
                        <th style={{ padding: '0.75rem', textAlign: 'left', borderBottom: '1px solid #e5e7eb' }}>Campos Atualizados</th>
                      </tr>
                    </thead>
                    <tbody>
                      {resultadoAtualizacao.resultados.map((r, idx) => (
                        <tr key={idx} style={{ borderBottom: '1px solid #e5e7eb' }}>
                          <td style={{ padding: '0.75rem' }}>{r.arquivo}</td>
                          <td style={{ padding: '0.75rem', fontWeight: '600' }}>{r.numero_oc || '-'}</td>
                          <td style={{ padding: '0.75rem' }}>
                            {r.success ? (
                              <span style={{ color: '#059669' }}>✅ OK</span>
                            ) : (
                              <span style={{ color: '#dc2626' }}>❌ Erro</span>
                            )}
                          </td>
                          <td style={{ padding: '0.75rem', fontSize: '0.85rem' }}>
                            {r.success ? (
                              r.campos_atualizados.map((c, i) => (
                                <div key={i}>{c}</div>
                              ))
                            ) : (
                              <span style={{ color: '#dc2626' }}>{r.erro}</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
            
            {/* Seção de Reprocessamento com Planilha */}
            <div style={{ marginTop: '2rem', paddingTop: '2rem', borderTop: '2px solid #e5e7eb' }}>
              <h3 style={{ fontSize: '1.25rem', fontWeight: '700', marginBottom: '1rem' }}>
                🔄 Reprocessar Itens com Planilha
              </h3>
              <p style={{ fontSize: '0.9rem', color: '#6b7280', marginBottom: '1rem' }}>
                Use esta opção para atualizar os dados dos itens (descrição, lote, responsável, região, marca/modelo) 
                com base na planilha de referência. Útil quando uma OC foi criada antes da planilha ser carregada.
              </p>
              
              <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
                <button
                  onClick={() => handleReprocessarItensPlanilha()}
                  disabled={reprocessandoItens}
                  className="btn btn-primary"
                  style={{ 
                    padding: '0.75rem 1.5rem',
                    background: reprocessandoItens ? '#9ca3af' : '#8b5cf6',
                    cursor: reprocessandoItens ? 'wait' : 'pointer'
                  }}
                  data-testid="reprocessar-todas-ocs-btn"
                >
                  {reprocessandoItens ? '⏳ Processando...' : '🔄 Reprocessar TODAS as OCs'}
                </button>
                
                <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                  <input
                    type="text"
                    placeholder="Ex: OC-3.100117"
                    id="numeroOcReprocessar"
                    style={{
                      padding: '0.75rem',
                      border: '1px solid #d1d5db',
                      borderRadius: '6px',
                      fontSize: '0.9rem',
                      width: '150px'
                    }}
                  />
                  <button
                    onClick={() => {
                      const numeroOc = document.getElementById('numeroOcReprocessar').value.trim();
                      if (numeroOc) {
                        handleReprocessarItensPlanilha(numeroOc);
                      } else {
                        alert('Digite o número da OC');
                      }
                    }}
                    disabled={reprocessandoItens}
                    className="btn"
                    style={{ 
                      padding: '0.75rem 1rem',
                      background: reprocessandoItens ? '#9ca3af' : '#3b82f6',
                      color: 'white',
                      cursor: reprocessandoItens ? 'wait' : 'pointer'
                    }}
                  >
                    Reprocessar OC específica
                  </button>
                </div>
              </div>
              
              {/* Resultado do reprocessamento */}
              {resultadoReprocessamento && (
                <div style={{ 
                  marginTop: '1rem', 
                  padding: '1rem', 
                  background: resultadoReprocessamento.success ? '#f0fdf4' : '#fef2f2',
                  borderRadius: '8px',
                  border: `1px solid ${resultadoReprocessamento.success ? '#86efac' : '#fca5a5'}`
                }}>
                  <div style={{ fontWeight: '600', marginBottom: '0.5rem' }}>
                    {resultadoReprocessamento.success ? '✅ Reprocessamento concluído' : '❌ Erro'}
                  </div>
                  {resultadoReprocessamento.success && (
                    <>
                      <div>OCs processadas: {resultadoReprocessamento.ocs_processadas}</div>
                      <div>OCs atualizadas: {resultadoReprocessamento.ocs_atualizadas}</div>
                      <div>Itens atualizados: {resultadoReprocessamento.itens_atualizados}</div>
                      {resultadoReprocessamento.itens_nao_encontrados_na_planilha?.length > 0 && (
                        <div style={{ marginTop: '0.5rem', color: '#dc2626' }}>
                          ⚠️ Itens não encontrados na planilha: {resultadoReprocessamento.itens_nao_encontrados_na_planilha.join(', ')}
                        </div>
                      )}
                    </>
                  )}
                </div>
              )}
            </div>
          </>
        )}

        {/* ============== ABA COMISSÕES (Admin Only) ============== */}
        {view === 'comissoes' && isAdmin() && (
          <>
            <h2 style={{ fontSize: '1.5rem', fontWeight: '700', marginBottom: '1rem' }}>Comissões por Responsável</h2>
            <p style={{ fontSize: '0.9rem', color: '#6b7280', marginBottom: '1rem' }}>
              Sistema de comissões baseado nos <strong>LOTES</strong> atribuídos originalmente. Comissão fixa de <strong>1,5%</strong> sobre o valor total de venda.
            </p>
            
            {/* Resumo */}
            <div style={{ 
              padding: '1rem', 
              background: '#ecfdf5', 
              borderRadius: '8px', 
              border: '1px solid #86efac',
              marginBottom: '1.5rem'
            }}>
              <div style={{ fontSize: '0.85rem', color: '#047857', fontWeight: '600' }}>TOTAL VALOR VENDIDO (Entregue/Em Trânsito)</div>
              <div style={{ fontSize: '1.5rem', fontWeight: '700', color: '#065f46' }}>{formatBRL(totalVendaEntregue)}</div>
              <div style={{ fontSize: '0.9rem', color: '#047857', marginTop: '0.25rem' }}>
                Comissão Total (1,5%): <strong>{formatBRL(totalVendaEntregue * 0.015)}</strong>
              </div>
            </div>

            {comissoes.length === 0 ? (
              <p style={{ textAlign: 'center', color: '#718096', padding: '2rem' }}>
                Nenhum responsável com itens entregues/em trânsito ainda.
              </p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                {comissoes.map((item, index) => {
                  const nome = getNome(item.responsavel);
                  const isExpanded = expandedResponsavel === item.responsavel;
                  const pagamentosDoResponsavel = pagamentos.filter(p => p.responsavel === item.responsavel);
                  
                  return (
                    <div 
                      key={index} 
                      className="card" 
                      style={{ 
                        background: '#f9fafb',
                        border: '1px solid #e5e7eb'
                      }}
                    >
                      {/* Header do responsável */}
                      <div 
                        onClick={() => toggleExpandResponsavel(item.responsavel)}
                        style={{ 
                          display: 'flex', 
                          justifyContent: 'space-between', 
                          alignItems: 'center',
                          cursor: 'pointer',
                          padding: '0.5rem'
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                          <div style={{ 
                            width: '40px', 
                            height: '40px', 
                            borderRadius: '50%', 
                            background: '#7c3aed',
                            color: 'white',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            fontWeight: '700',
                            fontSize: '1.2rem'
                          }}>
                            {nome.charAt(0)}
                          </div>
                          <div>
                            <div style={{ fontSize: '1.2rem', fontWeight: '700', color: '#1f2937' }}>
                              {nome}
                            </div>
                            <div style={{ fontSize: '0.85rem', color: '#6b7280' }}>
                              Valor vendido: <strong style={{ color: '#047857' }}>{formatBRL(item.valor_venda_total)}</strong>
                              {item.qtd_itens > 0 && <span style={{ marginLeft: '0.5rem' }}>({item.qtd_itens} itens)</span>}
                            </div>
                            <div style={{ fontSize: '0.8rem', color: '#6b7280' }}>
                              Comissão (1,5%): <strong style={{ color: '#7c3aed' }}>{formatBRL(item.valor_comissao)}</strong>
                            </div>
                          </div>
                        </div>
                        <div style={{ fontSize: '1.5rem', color: '#6b7280' }}>
                          {isExpanded ? '▲' : '▼'}
                        </div>
                      </div>

                      {/* Área expandida com itens */}
                      {isExpanded && (
                        <div style={{ marginTop: '1rem', padding: '1rem', background: 'white', borderRadius: '8px' }}>
                          {/* Controles */}
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', flexWrap: 'wrap', gap: '1rem' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                              <button
                                onClick={selectAllItens}
                                className="btn btn-secondary"
                                style={{ padding: '0.4rem 0.8rem', fontSize: '0.85rem' }}
                              >
                                {selectedItens.length === itensResponsavel.filter(i => !i.pago).length ? '✗ Desmarcar Todos' : '✓ Selecionar Todos'}
                              </button>
                              <span style={{ fontSize: '0.9rem', color: '#6b7280' }}>
                                {selectedItens.length} de {itensResponsavel.filter(i => !i.pago).length} selecionados
                              </span>
                            </div>
                            
                            <div style={{ fontSize: '0.9rem', fontWeight: '600', color: '#7c3aed' }}>
                              Comissão fixa: 1,5%
                            </div>
                          </div>

                          {/* Lista de itens */}
                          {itensResponsavel.length === 0 ? (
                            <p style={{ textAlign: 'center', color: '#9ca3af', padding: '1rem' }}>
                              Nenhum item entregue/em trânsito encontrado para os lotes atribuídos
                            </p>
                          ) : (
                            <div style={{ maxHeight: '300px', overflowY: 'auto', marginBottom: '1rem' }}>
                              <table style={{ width: '100%', fontSize: '0.85rem' }}>
                                <thead>
                                  <tr style={{ background: '#f3f4f6' }}>
                                    <th style={{ padding: '0.5rem', textAlign: 'left' }}>✓</th>
                                    <th style={{ padding: '0.5rem', textAlign: 'left' }}>OC</th>
                                    <th style={{ padding: '0.5rem', textAlign: 'left' }}>Item</th>
                                    <th style={{ padding: '0.5rem', textAlign: 'left' }}>Lote</th>
                                    <th style={{ padding: '0.5rem', textAlign: 'right' }}>Valor Venda</th>
                                    <th style={{ padding: '0.5rem', textAlign: 'right' }}>Comissão</th>
                                    <th style={{ padding: '0.5rem', textAlign: 'center' }}>Status</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {itensResponsavel.map((itemResp, idx) => (
                                    <tr 
                                      key={idx} 
                                      style={{ 
                                        background: itemResp.pago ? '#f0fdf4' : (selectedItens.includes(itemResp.id) ? '#fef3c7' : 'white'),
                                        opacity: itemResp.pago ? 0.7 : 1
                                      }}
                                    >
                                      <td style={{ padding: '0.5rem' }}>
                                        <input
                                          type="checkbox"
                                          checked={selectedItens.includes(itemResp.id)}
                                          onChange={() => toggleSelectItem(itemResp.id)}
                                          disabled={itemResp.pago}
                                          style={{ width: '18px', height: '18px', cursor: itemResp.pago ? 'not-allowed' : 'pointer' }}
                                        />
                                      </td>
                                      <td style={{ padding: '0.5rem' }}>{itemResp.numero_oc}</td>
                                      <td style={{ padding: '0.5rem' }}>{itemResp.codigo_item}</td>
                                      <td style={{ padding: '0.5rem', fontWeight: '600', color: '#7c3aed' }}>{itemResp.lote}</td>
                                      <td style={{ padding: '0.5rem', textAlign: 'right', fontWeight: '600', color: '#047857' }}>
                                        {formatBRL(itemResp.valor_venda || 0)}
                                      </td>
                                      <td style={{ padding: '0.5rem', textAlign: 'right', fontWeight: '600', color: '#7c3aed' }}>
                                        {formatBRL(itemResp.valor_comissao || 0)}
                                      </td>
                                      <td style={{ padding: '0.5rem', textAlign: 'center' }}>
                                        {itemResp.pago ? (
                                          <span style={{ color: '#22c55e', fontWeight: '600' }}>✓ PAGO</span>
                                        ) : (
                                          <span style={{ color: '#f59e0b', fontWeight: '600' }}>PENDENTE</span>
                                        )}
                                      </td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          )}

                          {/* Resumo e botão de pagamento */}
                          {selectedItens.length > 0 && (
                            <div style={{ 
                              padding: '1rem', 
                              background: '#fef9c3', 
                              borderRadius: '8px',
                              display: 'flex',
                              justifyContent: 'space-between',
                              alignItems: 'center',
                              flexWrap: 'wrap',
                              gap: '1rem'
                            }}>
                              <div>
                                <div style={{ fontSize: '0.85rem', color: '#92400e' }}>Valor Total Venda Selecionado:</div>
                                <div style={{ fontSize: '1.3rem', fontWeight: '700', color: '#78350f' }}>
                                  {formatBRL(calcularTotalSelecionado())}
                                </div>
                                <div style={{ fontSize: '0.9rem', color: '#92400e' }}>
                                  Comissão (1,5%): <strong>{formatBRL(calcularTotalSelecionado() * 0.015)}</strong>
                                </div>
                              </div>
                              <button
                                onClick={() => registrarPagamento(item.responsavel)}
                                className="btn btn-primary"
                                style={{ padding: '0.75rem 1.5rem', fontSize: '1rem' }}
                              >
                                💰 Registrar Pagamento
                              </button>
                            </div>
                          )}

                          {/* Histórico de pagamentos */}
                          {pagamentosDoResponsavel.length > 0 && (
                            <div style={{ marginTop: '1rem', padding: '1rem', background: '#f0fdf4', borderRadius: '8px' }}>
                              <div style={{ fontWeight: '700', color: '#166534', marginBottom: '0.75rem' }}>
                                📋 Histórico de Pagamentos
                              </div>
                              {pagamentosDoResponsavel.map((pag, idx) => (
                                <div key={idx} style={{ 
                                  padding: '0.75rem', 
                                  background: 'white', 
                                  borderRadius: '6px',
                                  marginBottom: '0.5rem',
                                  border: '1px solid #bbf7d0'
                                }}>
                                  {editingPagamento === pag.id ? (
                                    // Modo edição
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
                                      <span>{new Date(pag.data).toLocaleDateString('pt-BR')}</span>
                                      <span>{pag.qtd_itens} itens</span>
                                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                        <span>R$</span>
                                        <input
                                          type="number"
                                          value={editPagamentoForm.valor_comissao}
                                          onChange={(e) => setEditPagamentoForm({ valor_comissao: parseFloat(e.target.value) || 0 })}
                                          className="form-input"
                                          style={{ width: '100px', padding: '0.3rem' }}
                                          step="0.01"
                                        />
                                      </div>
                                      <button
                                        onClick={() => savePagamento(pag.id)}
                                        style={{ padding: '0.3rem 0.6rem', background: '#22c55e', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '0.8rem' }}
                                      >
                                        ✓ Salvar
                                      </button>
                                      <button
                                        onClick={cancelEditPagamento}
                                        style={{ padding: '0.3rem 0.6rem', background: '#9ca3af', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '0.8rem' }}
                                      >
                                        ✗ Cancelar
                                      </button>
                                    </div>
                                  ) : (
                                    // Modo visualização
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.9rem' }}>
                                      <div style={{ display: 'flex', alignItems: 'center', gap: '1.5rem' }}>
                                        <span style={{ color: '#6b7280' }}>{new Date(pag.data).toLocaleDateString('pt-BR')}</span>
                                        <span>{pag.qtd_itens} itens</span>
                                        <span style={{ color: '#047857', fontWeight: '700' }}>{formatBRL(pag.valor_comissao)}</span>
                                        <span style={{ color: '#6b7280', fontSize: '0.8rem' }}>({pag.percentual}%)</span>
                                      </div>
                                      <div style={{ display: 'flex', gap: '0.5rem' }}>
                                        <button
                                          onClick={() => startEditPagamento(pag)}
                                          style={{ padding: '0.3rem 0.6rem', background: '#3b82f6', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '0.75rem' }}
                                        >
                                          ✏️ Editar
                                        </button>
                                        <button
                                          onClick={() => deletePagamento(pag.id, item.responsavel)}
                                          style={{ padding: '0.3rem 0.6rem', background: '#ef4444', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '0.75rem' }}
                                        >
                                          🗑️ Deletar
                                        </button>
                                      </div>
                                    </div>
                                  )}
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </>
        )}

        {/* ============== ABA NOTAS FISCAIS ============== */}
        {view === 'notas' && (
          <>
            <h2 style={{ fontSize: '1.5rem', fontWeight: '700', marginBottom: '1.5rem' }}>Todas as Notas Fiscais</h2>
            
            {/* Aviso de NFs Duplicadas */}
            {notasFiscais.notas_duplicadas && notasFiscais.notas_duplicadas.length > 0 && (
              <div style={{ 
                marginBottom: '1.5rem', 
                padding: '1rem', 
                background: '#fef3c7', 
                border: '1px solid #f59e0b',
                borderRadius: '8px'
              }}>
                <h3 style={{ fontSize: '1rem', fontWeight: '700', color: '#92400e', marginBottom: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  ⚠️ NFs Usadas em Múltiplos Itens ({notasFiscais.total_duplicadas})
                </h3>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                  {notasFiscais.notas_duplicadas.map((nf, idx) => (
                    <div key={idx} style={{ 
                      padding: '0.5rem 0.75rem', 
                      background: 'white', 
                      borderRadius: '6px',
                      fontSize: '0.85rem'
                    }}>
                      <div style={{ fontWeight: '600', color: '#92400e' }}>
                        📄 {nf.filename} - NF: {nf.numero_nf || '-'} (usada em {nf.qtd_usos} itens)
                      </div>
                      <div style={{ fontSize: '0.75rem', color: '#6b7280', marginTop: '0.25rem' }}>
                        Itens: {nf.itens.map(i => `${i.numero_oc}/${i.codigo_item}`).join(', ')}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
            
            {/* Layout em duas colunas */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2rem' }}>
              
              {/* Coluna Esquerda - Notas de Compra (Fornecedor) */}
              <div>
                <h3 style={{ 
                  fontSize: '1.1rem', 
                  fontWeight: '700', 
                  marginBottom: '1rem',
                  padding: '0.75rem',
                  background: '#f5f3ff',
                  borderRadius: '8px',
                  color: '#5b21b6',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.5rem'
                }}>
                  🏭 NFs de Compra (Fornecedor) 
                  <span style={{ 
                    background: '#7c3aed', 
                    color: 'white', 
                    padding: '0.2rem 0.6rem', 
                    borderRadius: '12px',
                    fontSize: '0.9rem'
                  }}>
                    {notasFiscais.total_compra}
                  </span>
                </h3>
                
                {/* Botões de ação bulk */}
                {notasFiscais.notas_compra.length > 0 && (
                  <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.75rem', flexWrap: 'wrap' }}>
                    <button
                      onClick={selectAllNFsCompra}
                      style={{ 
                        padding: '0.4rem 0.8rem',
                        background: paginatedNfCompra.every(nf => selectedNFsCompra.has(`${nf.po_id}_${nf.item_index}_${nf.id}`)) ? '#94a3b8' : '#e2e8f0',
                        color: '#374151',
                        border: 'none',
                        borderRadius: '6px',
                        cursor: 'pointer',
                        fontSize: '0.8rem'
                      }}
                    >
                      {paginatedNfCompra.every(nf => selectedNFsCompra.has(`${nf.po_id}_${nf.item_index}_${nf.id}`)) ? '☑️ Desselecionar' : '☐ Selecionar Todos'}
                    </button>
                    {selectedNFsCompra.size > 0 && (
                      <button
                        onClick={() => downloadBulkNFs('compra')}
                        disabled={downloadingBulk}
                        style={{ 
                          padding: '0.4rem 0.8rem',
                          background: downloadingBulk ? '#9ca3af' : '#22c55e',
                          color: 'white',
                          border: 'none',
                          borderRadius: '6px',
                          cursor: downloadingBulk ? 'not-allowed' : 'pointer',
                          fontSize: '0.8rem',
                          fontWeight: '600'
                        }}
                      >
                        {downloadingBulk ? '⏳ Baixando...' : `📦 Baixar ${selectedNFsCompra.size} NF(s) em ZIP`}
                      </button>
                    )}
                  </div>
                )}
                
                {/* Campo de Pesquisa NFs de Compra */}
                <div style={{ marginBottom: '0.75rem' }}>
                  <input
                    type="text"
                    placeholder="🔍 Pesquisar NF, OC, código..."
                    value={searchNFCompra}
                    onChange={(e) => setSearchNFCompra(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '0.5rem 0.75rem',
                      border: '1px solid #e2e8f0',
                      borderRadius: '6px',
                      fontSize: '0.85rem'
                    }}
                    data-testid="search-nf-compra"
                  />
                  {searchNFCompra && (
                    <div style={{ fontSize: '0.75rem', color: '#6b7280', marginTop: '0.25rem' }}>
                      Mostrando {filteredNfCompra.length} de {notasFiscais.notas_compra.length} NFs
                    </div>
                  )}
                </div>
                
                {notasFiscais.notas_compra.length === 0 ? (
                  <p style={{ textAlign: 'center', color: '#718096', padding: '2rem', background: '#f9fafb', borderRadius: '8px' }}>
                    Nenhuma NF de compra
                  </p>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                    {paginatedNfCompra.map((nf, index) => {
                      const nfKey = `${nf.po_id}_${nf.item_index}_${nf.id}`;
                      const isSelected = selectedNFsCompra.has(nfKey);
                      return (
                        <div 
                          key={index} 
                          style={{ 
                            padding: '0.75rem',
                            background: isSelected ? '#e0f2fe' : (nf.duplicada ? '#fef3c7' : 'white'),
                            borderRadius: '6px',
                            border: isSelected ? '2px solid #0ea5e9' : (nf.duplicada ? '1px solid #f59e0b' : '1px solid #e5e7eb'),
                            display: 'flex',
                            alignItems: 'flex-start',
                            gap: '0.75rem'
                          }}
                        >
                          {/* Checkbox */}
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => toggleNFCompraSelection(nf)}
                            style={{ width: '18px', height: '18px', cursor: 'pointer', marginTop: '4px', flexShrink: 0 }}
                          />
                          
                          <div style={{ 
                            width: '28px', 
                            height: '28px', 
                            borderRadius: '50%', 
                            background: nf.duplicada ? '#f59e0b' : '#7c3aed',
                            color: 'white',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            fontWeight: '700',
                            fontSize: '0.8rem',
                            flexShrink: 0
                          }}>
                            {nf.duplicada ? '⚠️' : (nfCompraPage - 1) * nfCompraPerPage + index + 1}
                          </div>
                          
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontWeight: '600', fontSize: '0.85rem', color: '#1f2937', display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                              NF: {nf.numero_nf || '-'}
                              {nf.duplicada && (
                                <span style={{ fontSize: '0.7rem', background: '#f59e0b', color: 'white', padding: '0.1rem 0.4rem', borderRadius: '4px' }}>
                                  {nf.qtd_usos}x
                                </span>
                              )}
                            </div>
                            <div style={{ fontSize: '0.75rem', color: '#6b7280' }}>
                              OC: {nf.numero_oc}
                            </div>
                            {/* Indicação de quem baixou */}
                            {nf.baixado_por && (
                              <div style={{ 
                                fontSize: '0.7rem', 
                                color: '#dc2626', 
                                marginTop: '0.25rem',
                                fontWeight: '500'
                              }}>
                                ⬇️ Baixada por: {nf.baixado_por}
                              </div>
                            )}
                          </div>
                          
                          <button
                            onClick={() => downloadNF(nf)}
                            disabled={downloadingNF === nf.id}
                            style={{ 
                              padding: '0.4rem 0.8rem',
                              background: '#7c3aed',
                              color: 'white',
                              border: 'none',
                              borderRadius: '6px',
                              cursor: 'pointer',
                              fontSize: '0.8rem',
                              flexShrink: 0
                            }}
                          >
                            {downloadingNF === nf.id ? '...' : '⬇️'}
                          </button>
                        </div>
                      );
                    })}
                    {/* Paginação NFs Compra */}
                    {filteredNfCompra.length > 5 && (
                      <Pagination
                        totalItems={filteredNfCompra.length}
                        currentPage={nfCompraPage}
                        itemsPerPage={nfCompraPerPage}
                        onPageChange={setNfCompraPage}
                        onItemsPerPageChange={setNfCompraPerPage}
                      />
                    )}
                  </div>
                )}
              </div>

              {/* Coluna Direita - Notas de Venda (ON) */}
              <div>
                <h3 style={{ 
                  fontSize: '1.1rem', 
                  fontWeight: '700', 
                  marginBottom: '1rem',
                  padding: '0.75rem',
                  background: '#ecfeff',
                  borderRadius: '8px',
                  color: '#0891b2',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.5rem'
                }}>
                  🏢 NFs de Venda (ON) 
                  <span style={{ 
                    background: '#06b6d4', 
                    color: 'white', 
                    padding: '0.2rem 0.6rem', 
                    borderRadius: '12px',
                    fontSize: '0.9rem'
                  }}>
                    {notasFiscais.total_venda}
                  </span>
                </h3>
                
                {/* Botões de ação bulk para NFs de Venda */}
                {notasFiscais.notas_venda.length > 0 && (
                  <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.75rem', flexWrap: 'wrap' }}>
                    <button
                      onClick={selectAllNFsVenda}
                      style={{ 
                        padding: '0.4rem 0.8rem',
                        background: paginatedNfVenda.every(nf => selectedNFsVenda.has(`${nf.po_id}_${nf.item_index}_${nf.id}`)) ? '#94a3b8' : '#e2e8f0',
                        color: '#374151',
                        border: 'none',
                        borderRadius: '6px',
                        cursor: 'pointer',
                        fontSize: '0.8rem'
                      }}
                    >
                      {paginatedNfVenda.every(nf => selectedNFsVenda.has(`${nf.po_id}_${nf.item_index}_${nf.id}`)) ? '☑️ Desselecionar' : '☐ Selecionar Todos'}
                    </button>
                    {selectedNFsVenda.size > 0 && (
                      <button
                        onClick={() => downloadBulkNFs('venda')}
                        disabled={downloadingBulk}
                        style={{ 
                          padding: '0.4rem 0.8rem',
                          background: downloadingBulk ? '#9ca3af' : '#22c55e',
                          color: 'white',
                          border: 'none',
                          borderRadius: '6px',
                          cursor: downloadingBulk ? 'not-allowed' : 'pointer',
                          fontSize: '0.8rem',
                          fontWeight: '600'
                        }}
                      >
                        {downloadingBulk ? '⏳ Baixando...' : `📦 Baixar ${selectedNFsVenda.size} NF(s) em ZIP`}
                      </button>
                    )}
                  </div>
                )}
                
                {/* Campo de Pesquisa NFs de Venda */}
                <div style={{ marginBottom: '0.75rem' }}>
                  <input
                    type="text"
                    placeholder="🔍 Pesquisar NF, OC, código..."
                    value={searchNFVenda}
                    onChange={(e) => setSearchNFVenda(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '0.5rem 0.75rem',
                      border: '1px solid #e2e8f0',
                      borderRadius: '6px',
                      fontSize: '0.85rem'
                    }}
                    data-testid="search-nf-venda"
                  />
                  {searchNFVenda && (
                    <div style={{ fontSize: '0.75rem', color: '#6b7280', marginTop: '0.25rem' }}>
                      Mostrando {filteredNfVenda.length} de {notasFiscais.notas_venda.length} NFs
                    </div>
                  )}
                </div>
                
                {notasFiscais.notas_venda.length === 0 ? (
                  <p style={{ textAlign: 'center', color: '#718096', padding: '2rem', background: '#f9fafb', borderRadius: '8px' }}>
                    Nenhuma NF de venda
                  </p>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                    {paginatedNfVenda.map((nf, index) => {
                      const nfKey = `${nf.po_id}_${nf.item_index}_${nf.id}`;
                      const isSelected = selectedNFsVenda.has(nfKey);
                      return (
                        <div 
                          key={index} 
                          style={{ 
                            padding: '0.75rem',
                            background: isSelected ? '#e0f2fe' : (nf.duplicada ? '#fef3c7' : 'white'),
                            borderRadius: '6px',
                            border: isSelected ? '2px solid #0ea5e9' : (nf.duplicada ? '1px solid #f59e0b' : '1px solid #e5e7eb'),
                            display: 'flex',
                            alignItems: 'flex-start',
                            gap: '0.75rem'
                          }}
                        >
                          {/* Checkbox */}
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => toggleNFVendaSelection(nf)}
                            style={{ width: '18px', height: '18px', cursor: 'pointer', marginTop: '4px', flexShrink: 0 }}
                          />
                          
                          <div style={{ 
                            width: '28px', 
                            height: '28px', 
                            borderRadius: '50%', 
                            background: nf.duplicada ? '#f59e0b' : '#06b6d4',
                            color: 'white',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            fontWeight: '700',
                            fontSize: '0.8rem',
                            flexShrink: 0
                          }}>
                            {nf.duplicada ? '⚠️' : (nfVendaPage - 1) * nfVendaPerPage + index + 1}
                          </div>
                          
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontWeight: '600', fontSize: '0.85rem', color: '#1f2937', display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                              NF: {nf.numero_nf || '-'}
                              {nf.duplicada && (
                                <span style={{ fontSize: '0.7rem', background: '#f59e0b', color: 'white', padding: '0.1rem 0.4rem', borderRadius: '4px' }}>
                                  {nf.qtd_usos}x
                                </span>
                              )}
                            </div>
                            <div style={{ fontSize: '0.75rem', color: '#6b7280' }}>
                              OC: {nf.numero_oc}
                            </div>
                            {/* Indicação de quem baixou */}
                            {nf.baixado_por && (
                              <div style={{ 
                                fontSize: '0.7rem', 
                                color: '#dc2626', 
                                marginTop: '0.25rem',
                                fontWeight: '500'
                              }}>
                                ⬇️ Baixada por: {nf.baixado_por}
                              </div>
                            )}
                          </div>
                          
                          <button
                            onClick={() => downloadNF(nf)}
                            disabled={downloadingNF === nf.id}
                            style={{ 
                              padding: '0.4rem 0.8rem',
                              background: '#06b6d4',
                              color: 'white',
                              border: 'none',
                              borderRadius: '6px',
                              cursor: 'pointer',
                              fontSize: '0.8rem',
                              flexShrink: 0
                            }}
                          >
                            {downloadingNF === nf.id ? '...' : '⬇️'}
                          </button>
                        </div>
                      );
                    })}
                    {/* Paginação NFs Venda */}
                    {filteredNfVenda.length > 5 && (
                      <Pagination
                        totalItems={filteredNfVenda.length}
                        currentPage={nfVendaPage}
                        itemsPerPage={nfVendaPerPage}
                        onPageChange={setNfVendaPage}
                        onItemsPerPageChange={setNfVendaPerPage}
                      />
                    )}
                  </div>
                )}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default AdminPanel;
