/**
 * useItemFilters - Hook para gerenciar filtros de itens
 * Extraído de ItemsByStatus.js para melhor organização
 */
import { useState, useMemo } from 'react';

export const useItemFilters = (items, user, isAdmin) => {
  const [showOnlyMine, setShowOnlyMine] = useState(false);
  const [filterFornecedor, setFilterFornecedor] = useState('todos');
  const [filterResponsavel, setFilterResponsavel] = useState('todos');
  const [searchCodigo, setSearchCodigo] = useState('');
  const [searchOC, setSearchOC] = useState('');
  const [searchDescricao, setSearchDescricao] = useState('');
  const [searchMarca, setSearchMarca] = useState('');
  const [searchLink, setSearchLink] = useState('');

  // Lista de fornecedores únicos
  const fornecedoresUnicos = useMemo(() => {
    const fornecedores = new Set();
    items.forEach(item => {
      if (item.fornecedor) {
        fornecedores.add(item.fornecedor);
      }
    });
    return Array.from(fornecedores).sort();
  }, [items]);

  // Lista de responsáveis únicos
  const responsaveisUnicos = useMemo(() => {
    const responsaveis = new Set();
    items.forEach(item => {
      if (item.responsavel) {
        responsaveis.add(item.responsavel);
      }
    });
    return Array.from(responsaveis).sort();
  }, [items]);

  // Aplicar filtros
  const filteredItems = useMemo(() => {
    let result = [...items];

    // Filtro "Meus Itens"
    if (showOnlyMine && user) {
      const userEmail = user.email;
      const userName = user.owner_name || user.name;
      result = result.filter(item => 
        item.responsavel === userName || 
        item.responsavel === userEmail
      );
    }

    // Filtro por fornecedor
    if (filterFornecedor !== 'todos') {
      result = result.filter(item => item.fornecedor === filterFornecedor);
    }

    // Filtro por responsável
    if (filterResponsavel !== 'todos') {
      result = result.filter(item => item.responsavel === filterResponsavel);
    }

    // Busca por código
    if (searchCodigo) {
      const termo = searchCodigo.toLowerCase();
      result = result.filter(item => 
        item.codigo_item?.toLowerCase().includes(termo)
      );
    }

    // Busca por OC
    if (searchOC) {
      const termo = searchOC.toLowerCase();
      result = result.filter(item => 
        item.numero_oc?.toLowerCase().includes(termo)
      );
    }

    // Busca por descrição
    if (searchDescricao) {
      const termo = searchDescricao.toLowerCase();
      result = result.filter(item => 
        item.descricao?.toLowerCase().includes(termo)
      );
    }

    // Busca por marca
    if (searchMarca) {
      const termo = searchMarca.toLowerCase();
      result = result.filter(item => 
        item.marca_modelo?.toLowerCase().includes(termo)
      );
    }

    // Busca por link
    if (searchLink) {
      const termo = searchLink.toLowerCase();
      result = result.filter(item => 
        item.link_compra?.toLowerCase().includes(termo)
      );
    }

    return result;
  }, [items, showOnlyMine, filterFornecedor, filterResponsavel, 
      searchCodigo, searchOC, searchDescricao, searchMarca, searchLink, user]);

  // Limpar todos os filtros
  const clearFilters = () => {
    setShowOnlyMine(false);
    setFilterFornecedor('todos');
    setFilterResponsavel('todos');
    setSearchCodigo('');
    setSearchOC('');
    setSearchDescricao('');
    setSearchMarca('');
    setSearchLink('');
  };

  // Verificar se há filtros ativos
  const hasActiveFilters = showOnlyMine || 
    filterFornecedor !== 'todos' || 
    filterResponsavel !== 'todos' ||
    searchCodigo || searchOC || searchDescricao || searchMarca || searchLink;

  return {
    // States
    showOnlyMine,
    setShowOnlyMine,
    filterFornecedor,
    setFilterFornecedor,
    filterResponsavel,
    setFilterResponsavel,
    searchCodigo,
    setSearchCodigo,
    searchOC,
    setSearchOC,
    searchDescricao,
    setSearchDescricao,
    searchMarca,
    setSearchMarca,
    searchLink,
    setSearchLink,
    
    // Computed
    filteredItems,
    fornecedoresUnicos,
    responsaveisUnicos,
    hasActiveFilters,
    
    // Actions
    clearFilters
  };
};

export default useItemFilters;
