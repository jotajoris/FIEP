import React, { createContext, useContext, useState, useEffect } from 'react';
import {jwtDecode} from 'jwt-decode';
import axios from 'axios';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

const AuthContext = createContext();

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth deve ser usado dentro de AuthProvider');
  }
  return context;
};

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [token, setToken] = useState(localStorage.getItem('token'));

  useEffect(() => {
    if (token) {
      try {
        const decoded = jwtDecode(token);
        const now = Date.now() / 1000;
        
        if (decoded.exp > now) {
          setUser({
            email: decoded.sub,
            role: decoded.role,
            owner_name: decoded.owner_name,
            user_id: decoded.user_id
          });
        } else {
          logout();
        }
      } catch (error) {
        logout();
      }
    }
    setLoading(false);
  }, [token]);

  const login = async (email, password) => {
    try {
      const response = await axios.post(`${API}/auth/login`, { email, password });
      const { access_token, user: userData } = response.data;
      
      localStorage.setItem('token', access_token);
      setToken(access_token);
      setUser({
        email: userData.email,
        role: userData.role,
        owner_name: userData.owner_name,
        needs_password_change: userData.needs_password_change
      });
      
      return userData;
    } catch (error) {
      throw new Error(error.response?.data?.detail || 'Erro ao fazer login');
    }
  };

  const logout = () => {
    localStorage.removeItem('token');
    setToken(null);
    setUser(null);
  };

  const changePassword = async (currentPassword, newPassword) => {
    try {
      await axios.post(
        `${API}/auth/change-password`,
        { current_password: currentPassword, new_password: newPassword },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      
      if (user) {
        setUser({ ...user, needs_password_change: false });
      }
    } catch (error) {
      throw new Error(error.response?.data?.detail || 'Erro ao alterar senha');
    }
  };

  const resetPassword = async (email) => {
    try {
      await axios.post(`${API}/auth/reset-password`, { email });
    } catch (error) {
      throw new Error(error.response?.data?.detail || 'Erro ao solicitar reset');
    }
  };

  const confirmResetPassword = async (resetToken, newPassword) => {
    try {
      await axios.post(`${API}/auth/confirm-reset-password`, {
        token: resetToken,
        new_password: newPassword
      });
    } catch (error) {
      throw new Error(error.response?.data?.detail || 'Erro ao confirmar reset');
    }
  };

  const isAdmin = () => user?.role === 'admin';

  const getAuthHeaders = () => {
    return token ? { Authorization: `Bearer ${token}` } : {};
  };

  const value = {
    user,
    token,
    loading,
    login,
    logout,
    changePassword,
    resetPassword,
    confirmResetPassword,
    isAdmin,
    getAuthHeaders
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};
