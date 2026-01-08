import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

const ChangePassword = () => {
  const navigate = useNavigate();
  const { changePassword, user } = useAuth();
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess(false);

    if (newPassword !== confirmPassword) {
      setError('As senhas não coincidem');
      return;
    }

    if (newPassword.length < 6) {
      setError('A nova senha deve ter pelo menos 6 caracteres');
      return;
    }

    setLoading(true);

    try {
      await changePassword(currentPassword, newPassword);
      setSuccess(true);
      setTimeout(() => navigate('/'), 2000);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ 
      minHeight: '100vh', 
      display: 'flex', 
      alignItems: 'center', 
      justifyContent: 'center',
      background: 'linear-gradient(135deg, #f5f7fa 0%, #c3cfe2 100%)'
    }} data-testid="change-password-page">
      <div className="card" style={{ width: '100%', maxWidth: '500px', margin: '1rem' }}>
        <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
          <h1 style={{ fontSize: '1.8rem', fontWeight: '800' }} data-testid="change-password-title">
            Alterar Senha
          </h1>
          {user?.needs_password_change && (
            <p style={{ color: '#f59e0b', marginTop: '0.5rem', fontWeight: '600' }}>
              ⚠️ Você precisa alterar sua senha antes de continuar
            </p>
          )}
        </div>

        <form onSubmit={handleSubmit}>
          {error && (
            <div style={{
              padding: '1rem',
              background: '#fee',
              color: '#c33',
              borderRadius: '8px',
              marginBottom: '1rem'
            }} data-testid="error-message">
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
            }} data-testid="success-message">
              ✓ Senha alterada com sucesso! Redirecionando...
            </div>
          )}

          <div className="form-group">
            <label className="form-label">Senha Atual</label>
            <input
              type="password"
              className="form-input"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              placeholder="Senha atual (on123456)"
              required
              data-testid="input-current-password"
            />
          </div>

          <div className="form-group">
            <label className="form-label">Nova Senha</label>
            <input
              type="password"
              className="form-input"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder="Mínimo 6 caracteres"
              required
              data-testid="input-new-password"
            />
          </div>

          <div className="form-group">
            <label className="form-label">Confirmar Nova Senha</label>
            <input
              type="password"
              className="form-input"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="Digite novamente"
              required
              data-testid="input-confirm-password"
            />
          </div>

          <button 
            type="submit" 
            className="btn btn-primary" 
            disabled={loading || success}
            style={{ width: '100%', marginTop: '1rem' }}
            data-testid="submit-button"
          >
            {loading ? 'Alterando...' : 'Alterar Senha'}
          </button>

          {!user?.needs_password_change && (
            <button 
              type="button"
              onClick={() => navigate('/')}
              className="btn btn-secondary" 
              style={{ width: '100%', marginTop: '0.5rem' }}
              data-testid="cancel-button"
            >
              Cancelar
            </button>
          )}
        </form>
      </div>
    </div>
  );
};

export default ChangePassword;
