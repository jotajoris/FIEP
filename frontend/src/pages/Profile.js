import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { apiGet, apiPatch, API } from '../utils/api';

const Profile = () => {
  const navigate = useNavigate();
  const { user, logout, refreshUser } = useAuth();
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  
  const [formData, setFormData] = useState({
    owner_name: '',
    email: ''
  });

  // Password change
  const [showPasswordForm, setShowPasswordForm] = useState(false);
  const [passwordData, setPasswordData] = useState({
    current_password: '',
    new_password: '',
    confirm_password: ''
  });

  useEffect(() => {
    if (user) {
      setFormData({
        owner_name: user.owner_name || '',
        email: user.email || ''
      });
    }
  }, [user]);

  const handleSaveProfile = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    setSaving(true);

    try {
      const response = await apiPatch(`${API}/auth/profile`, {
        owner_name: formData.owner_name
      });
      
      setSuccess('Perfil atualizado com sucesso!');
      
      // Refresh user data
      if (refreshUser) {
        await refreshUser();
      }
      
      setTimeout(() => setSuccess(''), 3000);
    } catch (err) {
      setError(err.response?.data?.detail || 'Erro ao atualizar perfil');
    } finally {
      setSaving(false);
    }
  };

  const handleChangePassword = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');

    if (passwordData.new_password.length < 6) {
      setError('A nova senha deve ter pelo menos 6 caracteres');
      return;
    }

    if (passwordData.new_password !== passwordData.confirm_password) {
      setError('As senhas não conferem');
      return;
    }

    setSaving(true);

    try {
      await apiPatch(`${API}/auth/change-password`, {
        current_password: passwordData.current_password,
        new_password: passwordData.new_password
      });
      
      setSuccess('Senha alterada com sucesso!');
      setShowPasswordForm(false);
      setPasswordData({ current_password: '', new_password: '', confirm_password: '' });
      setTimeout(() => setSuccess(''), 3000);
    } catch (err) {
      setError(err.response?.data?.detail || 'Erro ao alterar senha');
    } finally {
      setSaving(false);
    }
  };

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  if (!user) {
    return (
      <div style={{ padding: '2rem', textAlign: 'center' }}>
        <p>Carregando...</p>
      </div>
    );
  }

  return (
    <div className="container" data-testid="profile-page">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '2rem' }}>
        <div>
          <Link to="/" style={{ color: '#667eea', textDecoration: 'none', fontSize: '0.9rem' }}>
            ← Voltar ao Dashboard
          </Link>
          <h1 className="page-title" style={{ marginTop: '0.5rem' }}>Meu Perfil</h1>
        </div>
      </div>

      <div style={{ maxWidth: '600px' }}>
        {/* Mensagens */}
        {error && (
          <div style={{
            padding: '1rem',
            background: '#fee',
            color: '#c33',
            borderRadius: '8px',
            marginBottom: '1rem'
          }}>
            {error}
          </div>
        )}
        {success && (
          <div style={{
            padding: '1rem',
            background: '#d4edda',
            color: '#155724',
            borderRadius: '8px',
            marginBottom: '1rem'
          }}>
            {success}
          </div>
        )}

        {/* Informações do Perfil */}
        <div className="card" style={{ marginBottom: '1.5rem' }}>
          <h2 style={{ marginBottom: '1.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            👤 Informações Pessoais
          </h2>
          
          <form onSubmit={handleSaveProfile}>
            <div className="form-group">
              <label className="form-label">Email</label>
              <input
                type="email"
                className="form-input"
                value={formData.email}
                disabled
                style={{ background: '#f7fafc', cursor: 'not-allowed' }}
              />
              <small style={{ color: '#718096' }}>O email não pode ser alterado</small>
            </div>

            <div className="form-group">
              <label className="form-label">Nome de Exibição</label>
              <input
                type="text"
                className="form-input"
                value={formData.owner_name}
                onChange={(e) => setFormData({ ...formData, owner_name: e.target.value })}
                placeholder="Seu nome"
                data-testid="input-owner-name"
              />
              <small style={{ color: '#718096' }}>Este nome será exibido na navegação e nos itens atribuídos</small>
            </div>

            <div className="form-group">
              <label className="form-label">Função</label>
              <div style={{ 
                padding: '0.75rem', 
                background: user.role === 'admin' ? '#e8f5e9' : '#e3f2fd', 
                borderRadius: '8px',
                display: 'inline-block'
              }}>
                {user.role === 'admin' ? '👑 Administrador' : '👤 Usuário'}
              </div>
            </div>

            <button 
              type="submit" 
              className="btn btn-primary" 
              disabled={saving}
              data-testid="save-profile-btn"
            >
              {saving ? 'Salvando...' : 'Salvar Alterações'}
            </button>
          </form>
        </div>

        {/* Segurança */}
        <div className="card" style={{ marginBottom: '1.5rem' }}>
          <h2 style={{ marginBottom: '1.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            🔒 Segurança
          </h2>

          {!showPasswordForm ? (
            <button 
              onClick={() => setShowPasswordForm(true)}
              className="btn btn-secondary"
              data-testid="change-password-btn"
            >
              Alterar Senha
            </button>
          ) : (
            <form onSubmit={handleChangePassword}>
              <div className="form-group">
                <label className="form-label">Senha Atual</label>
                <input
                  type="password"
                  className="form-input"
                  value={passwordData.current_password}
                  onChange={(e) => setPasswordData({ ...passwordData, current_password: e.target.value })}
                  placeholder="••••••••"
                  required
                  data-testid="input-current-password"
                />
              </div>

              <div className="form-group">
                <label className="form-label">Nova Senha</label>
                <input
                  type="password"
                  className="form-input"
                  value={passwordData.new_password}
                  onChange={(e) => setPasswordData({ ...passwordData, new_password: e.target.value })}
                  placeholder="••••••••"
                  required
                  minLength={6}
                  data-testid="input-new-password"
                />
              </div>

              <div className="form-group">
                <label className="form-label">Confirmar Nova Senha</label>
                <input
                  type="password"
                  className="form-input"
                  value={passwordData.confirm_password}
                  onChange={(e) => setPasswordData({ ...passwordData, confirm_password: e.target.value })}
                  placeholder="••••••••"
                  required
                  data-testid="input-confirm-new-password"
                />
              </div>

              <div style={{ display: 'flex', gap: '1rem' }}>
                <button 
                  type="button"
                  onClick={() => {
                    setShowPasswordForm(false);
                    setPasswordData({ current_password: '', new_password: '', confirm_password: '' });
                    setError('');
                  }}
                  className="btn btn-secondary"
                >
                  Cancelar
                </button>
                <button 
                  type="submit" 
                  className="btn btn-primary" 
                  disabled={saving}
                  data-testid="save-password-btn"
                >
                  {saving ? 'Salvando...' : 'Alterar Senha'}
                </button>
              </div>
            </form>
          )}
        </div>

        {/* Logout */}
        <div className="card">
          <h2 style={{ marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            🚪 Sessão
          </h2>
          <p style={{ color: '#718096', marginBottom: '1rem' }}>
            Encerrar sua sessão atual e sair da plataforma.
          </p>
          <button 
            onClick={handleLogout}
            className="btn btn-secondary"
            style={{ background: '#fed7d7', color: '#c53030', border: 'none' }}
            data-testid="logout-btn"
          >
            Sair da Conta
          </button>
        </div>
      </div>
    </div>
  );
};

export default Profile;
