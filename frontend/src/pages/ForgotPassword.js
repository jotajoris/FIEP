import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { API } from '../utils/api';

const ForgotPassword = () => {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const response = await fetch(`${API}/auth/reset-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email })
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.detail || 'Erro ao solicitar reset');
      }

      setSent(true);
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
    }} data-testid="forgot-password-page">
      <div className="card" style={{ width: '100%', maxWidth: '400px', margin: '1rem' }}>
        <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
          <h1 style={{ 
            fontSize: '1.75rem', 
            fontWeight: '800',
            background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
            WebkitBackgroundClip: 'text',
            backgroundClip: 'text',
            WebkitTextFillColor: 'transparent'
          }}>
            Recuperar Senha
          </h1>
          <p style={{ color: '#718096', marginTop: '0.5rem' }}>
            {sent ? 'Verifique seu email' : 'Digite seu email para receber instruções'}
          </p>
        </div>

        {sent ? (
          <div style={{ textAlign: 'center' }}>
            <div style={{
              padding: '2rem',
              background: '#d4edda',
              borderRadius: '12px',
              marginBottom: '1.5rem'
            }}>
              <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>📧</div>
              <h3 style={{ color: '#155724', marginBottom: '0.5rem' }}>Email enviado!</h3>
              <p style={{ color: '#155724', fontSize: '0.9rem' }}>
                Se o email <strong>{email}</strong> estiver cadastrado, você receberá um link para redefinir sua senha.
              </p>
            </div>
            <p style={{ color: '#718096', fontSize: '0.85rem', marginBottom: '1rem' }}>
              Não recebeu? Verifique sua pasta de spam ou tente novamente.
            </p>
            <button 
              onClick={() => { setSent(false); setEmail(''); }}
              className="btn btn-secondary"
              style={{ marginRight: '0.5rem' }}
            >
              Tentar outro email
            </button>
            <Link to="/login" className="btn btn-primary">
              Voltar ao Login
            </Link>
          </div>
        ) : (
          <form onSubmit={handleSubmit}>
            {error && (
              <div style={{
                padding: '1rem',
                background: '#fee',
                color: '#c33',
                borderRadius: '8px',
                marginBottom: '1rem',
                fontSize: '0.9rem'
              }}>
                {error}
              </div>
            )}

            <div className="form-group">
              <label className="form-label" htmlFor="email">Email</label>
              <input
                id="email"
                type="email"
                className="form-input"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="seu@email.com"
                required
                data-testid="input-email"
              />
            </div>

            <button 
              type="submit" 
              className="btn btn-primary" 
              disabled={loading}
              style={{ width: '100%', marginTop: '1rem' }}
              data-testid="send-reset-button"
            >
              {loading ? 'Enviando...' : 'Enviar Link de Recuperação'}
            </button>

            <div style={{ textAlign: 'center', marginTop: '1.5rem' }}>
              <Link to="/login" style={{ color: '#667eea', textDecoration: 'none' }}>
                ← Voltar ao Login
              </Link>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};

export default ForgotPassword;
