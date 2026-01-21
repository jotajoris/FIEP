import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import Dashboard from './pages/Dashboard';
import CreatePO from './pages/CreatePO';
import PODetails from './pages/PODetails';
import EditPO from './pages/EditPO';
import AdminPanel from './pages/AdminPanel';
import AllItemsSummary from './pages/AllItemsSummary';
import ItemsByStatus from './pages/ItemsByStatus';
import OwnerPanel from './pages/OwnerPanel';
import Estoque from './pages/Estoque';
import PlanilhaItens from './pages/PlanilhaItens';
import Login from './pages/Login';
import ChangePassword from './pages/ChangePassword';
import ForgotPassword from './pages/ForgotPassword';
import ResetPassword from './pages/ResetPassword';
import Profile from './pages/Profile';
import Layout from './components/Layout';
import './App.css';

const ProtectedRoute = ({ children, adminOnly = false }) => {
  const { user, loading } = useAuth();

  if (loading) {
    return <div className="loading">Carregando...</div>;
  }

  if (!user) {
    return <Navigate to="/login" />;
  }

  if (adminOnly && user.role !== 'admin') {
    return <Navigate to="/" />;
  }

  if (user.needs_password_change) {
    return <Navigate to="/change-password" />;
  }

  return children;
};

function AppRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/forgot-password" element={<ForgotPassword />} />
      <Route path="/reset-password" element={<ResetPassword />} />
      <Route path="/change-password" element={<ChangePassword />} />
      
      <Route path="/" element={
        <ProtectedRoute>
          <Layout><Dashboard /></Layout>
        </ProtectedRoute>
      } />
      
      <Route path="/profile" element={
        <ProtectedRoute>
          <Layout><Profile /></Layout>
        </ProtectedRoute>
      } />
      
      <Route path="/create-po" element={
        <ProtectedRoute adminOnly>
          <Layout><CreatePO /></Layout>
        </ProtectedRoute>
      } />
      
      <Route path="/po/:id" element={
        <ProtectedRoute>
          <Layout><PODetails /></Layout>
        </ProtectedRoute>
      } />
      
      <Route path="/edit-po/:id" element={
        <ProtectedRoute adminOnly>
          <Layout><EditPO /></Layout>
        </ProtectedRoute>
      } />
      
      <Route path="/admin" element={
        <ProtectedRoute adminOnly>
          <Layout><AdminPanel /></Layout>
        </ProtectedRoute>
      } />
      
      <Route path="/resumo-completo" element={
        <ProtectedRoute adminOnly>
          <Layout><AllItemsSummary /></Layout>
        </ProtectedRoute>
      } />
      
      <Route path="/items/status/:status" element={
        <ProtectedRoute>
          <Layout><ItemsByStatus /></Layout>
        </ProtectedRoute>
      } />
      
      <Route path="/owner/:name" element={
        <ProtectedRoute>
          <Layout><OwnerPanel /></Layout>
        </ProtectedRoute>
      } />
    </Routes>
  );
}

function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <AppRoutes />
      </BrowserRouter>
    </AuthProvider>
  );
}

export default App;
