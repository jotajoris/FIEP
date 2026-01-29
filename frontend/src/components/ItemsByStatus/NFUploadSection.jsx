/**
 * NFUploadSection - Seção de upload de notas fiscais
 * Extraído de ItemsByStatus.js para melhorar performance
 */
import React, { useState, useRef } from 'react';
import { apiPost, apiGet, apiDelete, API } from '../../utils/api';

const NFUploadSection = ({ 
  item, 
  tipo = 'fornecedor', // 'fornecedor' ou 'revenda'
  onReload,
  isAdmin 
}) => {
  const [uploading, setUploading] = useState(false);
  const [ncmManual, setNcmManual] = useState('');
  const [expanded, setExpanded] = useState(false);
  const fileInputRef = useRef(null);

  const nfs = tipo === 'fornecedor' 
    ? (item.notas_fiscais_fornecedor || [])
    : (item.nota_fiscal_revenda ? [item.nota_fiscal_revenda] : []);

  const handleUpload = async (event) => {
    const file = event.target.files[0];
    if (!file) return;

    const allowedExtensions = ['.pdf', '.xml'];
    const fileExtension = file.name.toLowerCase().slice(file.name.lastIndexOf('.'));
    
    if (!allowedExtensions.includes(fileExtension)) {
      alert('Apenas arquivos PDF ou XML são aceitos.');
      return;
    }

    setUploading(true);
    
    try {
      const base64 = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (e) => resolve(e.target.result.split(',')[1]);
        reader.onerror = () => reject(new Error('Erro ao ler arquivo'));
        reader.readAsDataURL(file);
      });
      
      const contentType = file.type || (fileExtension === '.xml' ? 'text/xml' : 'application/pdf');
      
      const response = await apiPost(
        `${API}/purchase-orders/${item.po_id}/items/by-index/${item._itemIndexInPO}/notas-fiscais`,
        {
          filename: file.name,
          content_type: contentType,
          file_data: base64,
          ncm_manual: ncmManual || null,
          tipo: tipo
        }
      );
      
      alert(`Nota fiscal adicionada! NCM: ${response.data.ncm || 'Não detectado'}`);
      setNcmManual('');
      if (onReload) onReload();
    } catch (error) {
      console.error('Erro ao fazer upload:', error);
      alert(`Erro: ${error.response?.data?.detail || error.message}`);
    } finally {
      setUploading(false);
      if (event.target) event.target.value = '';
    }
  };

  const handleDownload = async (nf) => {
    try {
      const response = await apiGet(
        `${API}/purchase-orders/${item.po_id}/items/by-index/${item._itemIndexInPO}/notas-fiscais/${nf.id}/download`
      );
      
      const { file_data, content_type, filename } = response.data;
      
      const byteCharacters = atob(file_data);
      const byteArray = new Uint8Array(byteCharacters.length);
      for (let i = 0; i < byteCharacters.length; i++) {
        byteArray[i] = byteCharacters.charCodeAt(i);
      }
      
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
      console.error('Erro ao baixar:', error);
      alert('Erro ao baixar nota fiscal.');
    }
  };

  const handleDelete = async (nf) => {
    if (!window.confirm('Remover esta nota fiscal?')) return;
    
    try {
      await apiDelete(
        `${API}/purchase-orders/${item.po_id}/items/by-index/${item._itemIndexInPO}/notas-fiscais/${nf.id}?tipo=${tipo}`
      );
      alert('Nota fiscal removida!');
      if (onReload) onReload();
    } catch (error) {
      console.error('Erro ao remover:', error);
      alert('Erro ao remover nota fiscal.');
    }
  };

  return (
    <div style={{ 
      marginTop: '0.5rem',
      padding: '0.75rem',
      background: '#f8fafc',
      borderRadius: '6px',
      border: '1px solid #e2e8f0'
    }}>
      {/* Header */}
      <div style={{ 
        display: 'flex', 
        justifyContent: 'space-between', 
        alignItems: 'center',
        marginBottom: expanded ? '0.75rem' : 0
      }}>
        <button
          onClick={() => setExpanded(!expanded)}
          style={{
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem',
            fontSize: '0.85rem',
            color: '#475569'
          }}
        >
          <span>{expanded ? '▼' : '▶'}</span>
          <span>
            {tipo === 'fornecedor' ? '📄 NF Fornecedor' : '📋 NF Venda'}
            {nfs.length > 0 && (
              <span style={{ 
                marginLeft: '0.5rem',
                background: '#22c55e',
                color: 'white',
                padding: '0.1rem 0.4rem',
                borderRadius: '10px',
                fontSize: '0.7rem'
              }}>
                {nfs.length}
              </span>
            )}
          </span>
        </button>
        
        {/* Upload Button */}
        <label style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: '0.25rem',
          padding: '0.35rem 0.75rem',
          background: uploading ? '#94a3b8' : '#3b82f6',
          color: 'white',
          borderRadius: '4px',
          cursor: uploading ? 'wait' : 'pointer',
          fontSize: '0.75rem'
        }}>
          {uploading ? '⏳ Enviando...' : '📤 Upload'}
          <input
            ref={fileInputRef}
            type="file"
            accept=".pdf,.xml"
            onChange={handleUpload}
            disabled={uploading}
            style={{ display: 'none' }}
          />
        </label>
      </div>
      
      {/* Expanded content */}
      {expanded && (
        <div>
          {/* NCM Manual Input */}
          <div style={{ marginBottom: '0.75rem' }}>
            <input
              type="text"
              placeholder="NCM manual (opcional)"
              value={ncmManual}
              onChange={(e) => setNcmManual(e.target.value)}
              style={{
                width: '150px',
                padding: '0.35rem',
                fontSize: '0.75rem',
                border: '1px solid #d1d5db',
                borderRadius: '4px'
              }}
            />
          </div>
          
          {/* Lista de NFs */}
          {nfs.length === 0 ? (
            <div style={{ 
              color: '#9ca3af', 
              fontSize: '0.8rem',
              fontStyle: 'italic' 
            }}>
              Nenhuma nota fiscal
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              {nfs.map((nf, idx) => (
                <div 
                  key={nf.id || idx}
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    padding: '0.5rem',
                    background: 'white',
                    borderRadius: '4px',
                    border: '1px solid #e5e7eb'
                  }}
                >
                  <div style={{ fontSize: '0.8rem' }}>
                    <div style={{ fontWeight: '500', color: '#1f2937' }}>
                      {nf.filename?.substring(0, 40)}
                      {nf.filename?.length > 40 && '...'}
                    </div>
                    {nf.ncm && (
                      <div style={{ color: '#6b7280', fontSize: '0.7rem' }}>
                        NCM: {nf.ncm}
                      </div>
                    )}
                  </div>
                  
                  <div style={{ display: 'flex', gap: '0.5rem' }}>
                    <button
                      onClick={() => handleDownload(nf)}
                      style={{
                        background: '#10b981',
                        color: 'white',
                        border: 'none',
                        padding: '0.25rem 0.5rem',
                        borderRadius: '4px',
                        cursor: 'pointer',
                        fontSize: '0.7rem'
                      }}
                    >
                      ⬇️ Baixar
                    </button>
                    {isAdmin && (
                      <button
                        onClick={() => handleDelete(nf)}
                        style={{
                          background: '#ef4444',
                          color: 'white',
                          border: 'none',
                          padding: '0.25rem 0.5rem',
                          borderRadius: '4px',
                          cursor: 'pointer',
                          fontSize: '0.7rem'
                        }}
                      >
                        🗑️
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default NFUploadSection;
