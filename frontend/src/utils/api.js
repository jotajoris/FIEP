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
