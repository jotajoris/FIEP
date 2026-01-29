/**
 * useNotasFiscais - Hook para gerenciar upload/download de notas fiscais
 * Extraído de ItemsByStatus.js
 */
import { useState, useRef } from 'react';
import { apiPost, apiGet, apiDelete, API } from '../utils/api';

export const useNotasFiscais = (reloadSingleItem) => {
  const [expandedNF, setExpandedNF] = useState({});
  const [uploadingNF, setUploadingNF] = useState(null);
  const [ncmManual, setNcmManual] = useState({});
  const fileInputRef = useRef({});

  const toggleNF = (uniqueId) => {
    setExpandedNF(prev => ({ ...prev, [uniqueId]: !prev[uniqueId] }));
  };

  const handleFileUpload = async (item, tipo, event) => {
    const file = event.target.files[0];
    if (!file) return;

    const allowedTypes = ['application/pdf', 'text/xml', 'application/xml'];
    const allowedExtensions = ['.pdf', '.xml'];
    
    const fileExtension = file.name.toLowerCase().slice(file.name.lastIndexOf('.'));
    if (!allowedTypes.includes(file.type) && !allowedExtensions.includes(fileExtension)) {
      alert('Apenas arquivos PDF ou XML são aceitos.');
      return;
    }

    setUploadingNF(`${item._uniqueId}-${tipo}`);
    
    try {
      // Usar Promise para aguardar a leitura do arquivo
      const base64 = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (e) => resolve(e.target.result.split(',')[1]);
        reader.onerror = (e) => reject(new Error('Erro ao ler arquivo'));
        reader.readAsDataURL(file);
      });
      
      const contentType = file.type || (fileExtension === '.xml' ? 'text/xml' : 'application/pdf');
      const ncm = ncmManual[`${item._uniqueId}-${tipo}`] || null;
      
      const payload = {
        filename: file.name,
        content_type: contentType,
        file_data: base64,
        ncm_manual: ncm,
        tipo: tipo
      };
      
      const response = await apiPost(
        `${API}/purchase-orders/${item.po_id}/items/by-index/${item._itemIndexInPO}/notas-fiscais`,
        payload
      );
      
      alert(`Nota fiscal adicionada! NCM: ${response.data.ncm || 'Não detectado'}`);
      setNcmManual(prev => ({ ...prev, [`${item._uniqueId}-${tipo}`]: '' }));
      
      if (reloadSingleItem) {
        await reloadSingleItem(item.po_id, item._itemIndexInPO, item._uniqueId);
      }
    } catch (error) {
      console.error('Erro ao fazer upload:', error);
      alert(`Erro ao fazer upload da nota fiscal: ${error.response?.data?.detail || error.message}`);
    } finally {
      setUploadingNF(null);
      if (event.target) event.target.value = '';
    }
  };

  const downloadNF = async (item, nfId, filename) => {
    try {
      const response = await apiGet(
        `${API}/purchase-orders/${item.po_id}/items/by-index/${item._itemIndexInPO}/notas-fiscais/${nfId}/download`
      );
      
      const { file_data, content_type, filename: downloadFilename } = response.data;
      
      // Criar blob e fazer download
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
      a.download = downloadFilename || filename;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (error) {
      console.error('Erro ao baixar arquivo:', error);
      alert('Erro ao baixar nota fiscal.');
    }
  };

  const deleteNF = async (item, nfId, tipo) => {
    if (!window.confirm('Tem certeza que deseja remover esta nota fiscal?')) {
      return;
    }
    
    try {
      await apiDelete(
        `${API}/purchase-orders/${item.po_id}/items/by-index/${item._itemIndexInPO}/notas-fiscais/${nfId}?tipo=${tipo}`
      );
      alert('Nota fiscal removida com sucesso!');
      
      if (reloadSingleItem) {
        await reloadSingleItem(item.po_id, item._itemIndexInPO, item._uniqueId);
      }
    } catch (error) {
      console.error('Erro ao remover NF:', error);
      alert('Erro ao remover nota fiscal.');
    }
  };

  return {
    expandedNF,
    setExpandedNF,
    uploadingNF,
    ncmManual,
    setNcmManual,
    fileInputRef,
    toggleNF,
    handleFileUpload,
    downloadNF,
    deleteNF
  };
};

export default useNotasFiscais;
