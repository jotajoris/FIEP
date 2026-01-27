/**
 * Helpers e utilitários para a página de Itens por Status
 */

// Helper para calcular contagem regressiva e status de atraso
export const calcularStatusEntrega = (dataEntrega, todosEntregues = false) => {
  if (!dataEntrega) return null;
  
  try {
    const hoje = new Date();
    hoje.setHours(0, 0, 0, 0);
    
    const entrega = new Date(dataEntrega + 'T00:00:00');
    const diffTime = entrega.getTime() - hoje.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    
    // Formatar data para exibição (DD/MM/YYYY)
    const dataFormatada = entrega.toLocaleDateString('pt-BR');
    
    // Se todos os itens foram entregues, mostrar status positivo
    if (todosEntregues) {
      return {
        atrasado: false,
        entregue: true,
        dias: 0,
        texto: '✅ ENTREGUE',
        dataFormatada,
        cor: '#22c55e',
        bg: '#f0fdf4'
      };
    }
    
    if (diffDays < 0) {
      return {
        atrasado: true,
        dias: Math.abs(diffDays),
        texto: `${Math.abs(diffDays)} dia(s) em atraso`,
        dataFormatada,
        cor: '#dc2626',
        bg: '#fef2f2'
      };
    } else if (diffDays === 0) {
      return {
        atrasado: false,
        dias: 0,
        texto: 'Entrega HOJE!',
        dataFormatada,
        cor: '#f59e0b',
        bg: '#fffbeb'
      };
    } else if (diffDays <= 3) {
      return {
        atrasado: false,
        dias: diffDays,
        texto: `${diffDays} dia(s) restante(s)`,
        dataFormatada,
        cor: '#f59e0b',
        bg: '#fffbeb'
      };
    } else if (diffDays <= 7) {
      return {
        atrasado: false,
        dias: diffDays,
        texto: `${diffDays} dias restantes`,
        dataFormatada,
        cor: '#3b82f6',
        bg: '#eff6ff'
      };
    } else {
      return {
        atrasado: false,
        dias: diffDays,
        texto: `${diffDays} dias restantes`,
        dataFormatada,
        cor: '#22c55e',
        bg: '#f0fdf4'
      };
    }
  } catch (e) {
    return null;
  }
};

// Labels de status
export const statusLabels = {
  pendente: 'Pendentes',
  cotado: 'Cotados',
  comprado: 'Comprados',
  em_separacao: 'Em Separação',
  em_transito: 'Em Trânsito',
  entregue: 'Entregues'
};

// Cores de status
export const statusColors = {
  pendente: { bg: '#fef3c7', color: '#92400e' },
  cotado: { bg: '#dbeafe', color: '#1e40af' },
  comprado: { bg: '#d1fae5', color: '#065f46' },
  em_separacao: { bg: '#fce7f3', color: '#9d174d' },
  em_transito: { bg: '#e0e7ff', color: '#3730a3' },
  entregue: { bg: '#dcfce7', color: '#166534' }
};

// Opções de status para dropdown
export const statusOptions = [
  { value: 'pendente', label: 'Pendente' },
  { value: 'cotado', label: 'Cotado' },
  { value: 'comprado', label: 'Comprado' },
  { value: 'em_separacao', label: 'Em Separação' },
  { value: 'em_transito', label: 'Em Trânsito' },
  { value: 'entregue', label: 'Entregue' }
];
