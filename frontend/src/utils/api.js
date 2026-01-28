import axios from 'axios';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
export { BACKEND_URL };
export const API = `${BACKEND_URL}/api`;
export const API_URL = API; // Alias para componentes que usam API_URL

// Configuração padrão com timeout
const axiosConfig = {
  timeout: 30000, // 30 segundos
};

export const getAuthHeaders = (isFormData = false) => {
  const token = localStorage.getItem('token');
  const headers = token ? { Authorization: `Bearer ${token}` } : {};
  
  // Não definir Content-Type para FormData (axios define automaticamente com boundary)
  if (!isFormData) {
    headers['Content-Type'] = 'application/json';
  }
  
  return headers;
};

export const apiGet = (url) => {
  return axios.get(url, { ...axiosConfig, headers: getAuthHeaders() });
};

export const apiPost = (url, data) => {
  const isFormData = data instanceof FormData;
  return axios.post(url, data, { ...axiosConfig, headers: getAuthHeaders(isFormData) });
};

export const apiPatch = (url, data) => {
  const isFormData = data instanceof FormData;
  return axios.patch(url, data, { ...axiosConfig, headers: getAuthHeaders(isFormData) });
};

export const apiDelete = (url) => {
  return axios.delete(url, { ...axiosConfig, headers: getAuthHeaders() });
};

// Formatar valor monetário no padrão brasileiro: R$ 1.234,56
export const formatBRL = (value) => {
  if (value === null || value === undefined || isNaN(value)) return 'R$ 0,00';
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(value);
};
