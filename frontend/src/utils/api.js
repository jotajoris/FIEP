import axios from 'axios';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
export const API = `${BACKEND_URL}/api`;

export const getAuthHeaders = () => {
  const token = localStorage.getItem('token');
  return token ? { Authorization: `Bearer ${token}` } : {};
};

export const apiGet = (url) => {
  return axios.get(url, { headers: getAuthHeaders() });
};

export const apiPost = (url, data) => {
  return axios.post(url, data, { headers: getAuthHeaders() });
};

export const apiPatch = (url, data) => {
  return axios.patch(url, data, { headers: getAuthHeaders() });
};

export const apiDelete = (url) => {
  return axios.delete(url, { headers: getAuthHeaders() });
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
