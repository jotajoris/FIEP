import React, { useState, useEffect, useRef } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { apiGet, apiPatch, API } from '../utils/api';

const Layout = ({ children }) => {
  const { user, logout, isAdmin } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [notificacoes, setNotificacoes] = useState([]);
  const [notificacoesCount, setNotificacoesCount] = useState(0);
  const [showNotificacoes, setShowNotificacoes] = useState(false);
  const notificacoesRef = useRef(null);
  
  // Modal "Ver Todas"
  const [showModalNotificacoes, setShowModalNotificacoes] = useState(false);
  const [todasNotificacoes, setTodasNotificacoes] = useState([]);
  const [loadingTodasNotificacoes, setLoadingTodasNotificacoes] = useState(false);
  const [buscaNotificacao, setBuscaNotificacao] = useState('');
  
  const [showUserMenu, setShowUserMenu] = useState(false);
  const userMenuRef = useRef(null);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const isActive = (path) => location.pathname === path ? 'active' : '';

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  // Fechar menus ao clicar fora
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (notificacoesRef.current && !notificacoesRef.current.contains(event.target)) {
        setShowNotificacoes(false);
      }
      if (userMenuRef.current && !userMenuRef.current.contains(event.target)) {
        setShowUserMenu(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Carregar notificações
  useEffect(() => {
    const fetchNotificacoes = async () => {
      try {
        const response = await apiGet(`${API}/notificacoes?limit=10`);
        setNotificacoes(response.data.notificacoes || []);
        setNotificacoesCount(response.data.count || 0);
      } catch (error) {
        console.error('Erro ao carregar notificações:', error);
      }
    };
    fetchNotificacoes();
    const interval = setInterval(fetchNotificacoes, 60000);
    return () => clearInterval(interval);
  }, []);

  const toggleNotificacoes = () => setShowNotificacoes(!showNotificacoes);

  const marcarComoLida = async (id) => {
    try {
      await apiPatch(`${API}/notificacoes/${id}/lida`);
      setNotificacoes(prev => prev.map(n => n.id === id ? { ...n, lida: true } : n));
      setNotificacoesCount(prev => Math.max(0, prev - 1));
    } catch (error) {
      console.error('Erro ao marcar notificação:', error);
    }
  };

  const marcarTodasComoLidas = async () => {
    try {
      await apiPatch(`${API}/notificacoes/marcar-todas-lidas`);
      setNotificacoes(prev => prev.map(n => ({ ...n, lida: true })));
      setNotificacoesCount(0);
    } catch (error) {
      console.error('Erro:', error);
    }
  };

  const abrirVerTodas = async () => {
    setShowModalNotificacoes(true);
    setShowNotificacoes(false);
    setLoadingTodasNotificacoes(true);
    try {
      const response = await apiGet(`${API}/notificacoes?limit=100`);
      setTodasNotificacoes(response.data.notificacoes || []);
    } catch (error) {
      console.error('Erro:', error);
    } finally {
      setLoadingTodasNotificacoes(false);
    }
  };

  const notificacoesFiltradas = todasNotificacoes.filter(notif => {
    if (!buscaNotificacao) return true;
    const search = buscaNotificacao.toLowerCase();
    return (
      (notif.numero_oc && notif.numero_oc.toLowerCase().includes(search)) ||
      (notif.codigo_item && notif.codigo_item.toLowerCase().includes(search)) ||
      (notif.titulo && notif.titulo.toLowerCase().includes(search))
    );
  });

  return (
    <div className="layout-container">
      <nav className="navbar" data-testid="main-navbar">
        <div className="nav-content">
          <Link to="/" className="nav-brand" data-testid="nav-brand">
            FIEP | Gestão OC
          </Link>
          
          {/* Desktop: Menu horizontal */}
          <ul className="nav-links desktop-only">
            <li><Link to="/" className={`nav-link ${isActive('/')}`}>📊 Dashboard</Link></li>
            {user?.owner_name && (
              <li><Link to={`/owner/${user.owner_name}`} className={`nav-link ${isActive(`/owner/${user.owner_name}`)}`}>📋 Meus Itens</Link></li>
            )}
            <li><Link to="/estoque" className={`nav-link ${isActive('/estoque')}`}>📦 Estoque</Link></li>
            <li><Link to="/galeria" className={`nav-link ${isActive('/galeria')}`}>🖼️ Galeria</Link></li>
            
            <li>
              <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                {/* Sininho Desktop */}
                <div ref={notificacoesRef} style={{ position: 'relative' }}>
                  <button onClick={toggleNotificacoes} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '0.5rem', position: 'relative', fontSize: '1.25rem' }} title="Notificações">
                    🔔
                    {notificacoesCount > 0 && (
                      <span style={{ position: 'absolute', top: '0', right: '0', background: '#ef4444', color: 'white', borderRadius: '50%', width: '18px', height: '18px', fontSize: '0.7rem', fontWeight: '700', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        {notificacoesCount > 9 ? '9+' : notificacoesCount}
                      </span>
                    )}
                  </button>

                  {showNotificacoes && (
                    <div style={{ position: 'absolute', top: '100%', right: '0', width: '360px', maxHeight: '400px', overflowY: 'auto', background: 'white', borderRadius: '8px', boxShadow: '0 4px 20px rgba(0,0,0,0.15)', zIndex: 1000, border: '1px solid #e2e8f0' }}>
                      <div style={{ padding: '0.75rem 1rem', borderBottom: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#f7fafc' }}>
                        <span style={{ fontWeight: '600', color: '#2d3748' }}>Notificações</span>
                        <div style={{ display: 'flex', gap: '0.75rem' }}>
                          <button onClick={abrirVerTodas} style={{ background: 'none', border: 'none', color: '#3b82f6', cursor: 'pointer', fontSize: '0.8rem', fontWeight: '500' }}>Ver todas</button>
                          {notificacoesCount > 0 && (
                            <button onClick={marcarTodasComoLidas} style={{ background: 'none', border: 'none', color: '#667eea', cursor: 'pointer', fontSize: '0.8rem', fontWeight: '500' }}>Marcar lidas</button>
                          )}
                        </div>
                      </div>
                      {notificacoes.length === 0 ? (
                        <div style={{ padding: '2rem 1rem', textAlign: 'center', color: '#718096' }}>Nenhuma notificação</div>
                      ) : (
                        notificacoes.map((notif) => (
                          <div key={notif.id} onClick={() => !notif.lida && marcarComoLida(notif.id)} style={{ padding: '0.75rem 1rem', borderBottom: '1px solid #f0f0f0', cursor: notif.lida ? 'default' : 'pointer', background: notif.lida ? 'white' : '#f0f7ff' }}>
                            <div style={{ fontWeight: notif.lida ? '400' : '600', fontSize: '0.9rem', marginBottom: '0.25rem' }}>{notif.titulo}</div>
                            <div style={{ fontSize: '0.85rem', color: '#4a5568' }}><strong>OC:</strong> {notif.numero_oc} | <strong>Item:</strong> {notif.codigo_item}</div>
                            <div style={{ fontSize: '0.75rem', color: '#a0aec0', marginTop: '0.25rem' }}>{new Date(notif.created_at).toLocaleString('pt-BR')}</div>
                          </div>
                        ))
                      )}
                    </div>
                  )}
                </div>

                {/* Menu Usuário Desktop */}
                <div ref={userMenuRef} style={{ position: 'relative' }}>
                  <button onClick={() => setShowUserMenu(!showUserMenu)} style={{ background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.5rem 0.75rem', borderRadius: '8px', color: '#4a5568', fontSize: '0.9rem', fontWeight: '500' }}>
                    <span style={{ width: '28px', height: '28px', borderRadius: '50%', background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.75rem', fontWeight: '700' }}>{(user?.owner_name || user?.email || '?').charAt(0).toUpperCase()}</span>
                    {user?.owner_name || user?.email}
                    <span style={{ fontSize: '1.2rem' }}>☰</span>
                  </button>

                  {showUserMenu && (
                    <div style={{ position: 'absolute', top: '100%', right: '0', width: '200px', background: 'white', borderRadius: '8px', boxShadow: '0 4px 20px rgba(0,0,0,0.15)', zIndex: 1000, border: '1px solid #e2e8f0', overflow: 'hidden' }}>
                      {isAdmin() && (
                        <>
                          <Link to="/admin" onClick={() => setShowUserMenu(false)} style={{ display: 'block', padding: '0.75rem 1rem', color: '#4a5568', textDecoration: 'none', fontSize: '0.9rem', borderBottom: '1px solid #f0f0f0' }}>⚙️ Admin</Link>
                          <Link to="/create-po" onClick={() => setShowUserMenu(false)} style={{ display: 'block', padding: '0.75rem 1rem', color: '#4a5568', textDecoration: 'none', fontSize: '0.9rem', borderBottom: '1px solid #f0f0f0' }}>➕ Nova OC</Link>
                          <Link to="/resumo-completo" onClick={() => setShowUserMenu(false)} style={{ display: 'block', padding: '0.75rem 1rem', color: '#4a5568', textDecoration: 'none', fontSize: '0.9rem', borderBottom: '1px solid #f0f0f0' }}>📊 Resumo Completo</Link>
                        </>
                      )}
                      <Link to="/planilha-itens" onClick={() => setShowUserMenu(false)} style={{ display: 'block', padding: '0.75rem 1rem', color: '#4a5568', textDecoration: 'none', fontSize: '0.9rem', borderBottom: '1px solid #f0f0f0' }}>📋 Planilha</Link>
                      <Link to="/profile" onClick={() => setShowUserMenu(false)} style={{ display: 'block', padding: '0.75rem 1rem', color: '#4a5568', textDecoration: 'none', fontSize: '0.9rem', borderBottom: '1px solid #f0f0f0' }}>👤 Meu Perfil</Link>
                      <button onClick={() => { setShowUserMenu(false); handleLogout(); }} style={{ display: 'block', width: '100%', padding: '0.75rem 1rem', color: '#dc2626', background: 'none', border: 'none', fontSize: '0.9rem', textAlign: 'left', cursor: 'pointer' }}>🚪 Sair</button>
                    </div>
                  )}
                </div>
              </div>
            </li>
          </ul>

          {/* Mobile: Sininho + Nome + Hamburger */}
          <div className="mobile-header-right mobile-only">
            <button onClick={toggleNotificacoes} className="mobile-icon-btn">
              🔔
              {notificacoesCount > 0 && <span className="notification-badge">{notificacoesCount > 9 ? '9+' : notificacoesCount}</span>}
            </button>
            <span className="mobile-user-name">{user?.owner_name?.split(' ')[0] || ''}</span>
            <button onClick={() => setMobileMenuOpen(!mobileMenuOpen)} className="mobile-menu-btn">
              {mobileMenuOpen ? '✕' : '☰'}
            </button>
          </div>
        </div>

        {/* Menu Mobile Expandido */}
        {mobileMenuOpen && (
          <div className="mobile-menu-dropdown">
            <Link to="/" onClick={() => setMobileMenuOpen(false)} className={`mobile-menu-item ${isActive('/') ? 'active' : ''}`}>📊 Dashboard</Link>
            {user?.owner_name && (
              <Link to={`/owner/${user.owner_name}`} onClick={() => setMobileMenuOpen(false)} className={`mobile-menu-item ${isActive(`/owner/${user.owner_name}`) ? 'active' : ''}`}>📋 Meus Itens</Link>
            )}
            <Link to="/estoque" onClick={() => setMobileMenuOpen(false)} className={`mobile-menu-item ${isActive('/estoque') ? 'active' : ''}`}>📦 Estoque</Link>
            <Link to="/galeria" onClick={() => setMobileMenuOpen(false)} className={`mobile-menu-item ${isActive('/galeria') ? 'active' : ''}`}>🖼️ Galeria</Link>
            <div className="mobile-menu-divider"></div>
            {isAdmin() && (
              <>
                <Link to="/admin" onClick={() => setMobileMenuOpen(false)} className="mobile-menu-item">⚙️ Admin</Link>
                <Link to="/create-po" onClick={() => setMobileMenuOpen(false)} className="mobile-menu-item">➕ Nova OC</Link>
                <Link to="/resumo-completo" onClick={() => setMobileMenuOpen(false)} className="mobile-menu-item">📊 Resumo</Link>
              </>
            )}
            <Link to="/planilha-itens" onClick={() => setMobileMenuOpen(false)} className="mobile-menu-item">📋 Planilha</Link>
            <Link to="/profile" onClick={() => setMobileMenuOpen(false)} className="mobile-menu-item">👤 Meu Perfil</Link>
            <button onClick={() => { setMobileMenuOpen(false); handleLogout(); }} className="mobile-menu-item logout">🚪 Sair</button>
          </div>
        )}
      </nav>

      <main className="main-content">
        {children}
      </main>

      {/* Modal Ver Todas Notificações */}
      {showModalNotificacoes && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 2000, padding: '1rem' }}>
          <div style={{ background: 'white', borderRadius: '12px', width: '100%', maxWidth: '600px', maxHeight: '80vh', display: 'flex', flexDirection: 'column', boxShadow: '0 20px 60px rgba(0,0,0,0.3)' }}>
            <div style={{ padding: '1rem 1.5rem', borderBottom: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h2 style={{ margin: 0, fontSize: '1.25rem', fontWeight: '600' }}>Todas as Notificações</h2>
              <button onClick={() => setShowModalNotificacoes(false)} style={{ background: 'none', border: 'none', fontSize: '1.5rem', cursor: 'pointer', color: '#718096' }}>✕</button>
            </div>
            <div style={{ padding: '1rem 1.5rem', borderBottom: '1px solid #e2e8f0' }}>
              <input type="text" placeholder="Buscar por OC, Item, Rastreio..." value={buscaNotificacao} onChange={(e) => setBuscaNotificacao(e.target.value)} style={{ width: '100%', padding: '0.75rem 1rem', border: '1px solid #e2e8f0', borderRadius: '8px', fontSize: '0.9rem' }} />
            </div>
            <div style={{ flex: 1, overflowY: 'auto', padding: '0.5rem' }}>
              {loadingTodasNotificacoes ? (
                <div style={{ padding: '2rem', textAlign: 'center', color: '#718096' }}>Carregando...</div>
              ) : notificacoesFiltradas.length === 0 ? (
                <div style={{ padding: '2rem', textAlign: 'center', color: '#718096' }}>Nenhuma notificação encontrada</div>
              ) : (
                notificacoesFiltradas.map((notif) => (
                  <div key={notif.id} style={{ padding: '0.75rem 1rem', borderBottom: '1px solid #f0f0f0', background: notif.lida ? 'white' : '#f0f7ff' }}>
                    <div style={{ fontWeight: notif.lida ? '400' : '600', fontSize: '0.9rem', marginBottom: '0.25rem' }}>{notif.titulo}</div>
                    <div style={{ fontSize: '0.85rem', color: '#4a5568' }}><strong>OC:</strong> {notif.numero_oc} | <strong>Item:</strong> {notif.codigo_item}</div>
                    <div style={{ fontSize: '0.75rem', color: '#a0aec0', marginTop: '0.25rem' }}>{new Date(notif.created_at).toLocaleString('pt-BR')}</div>
                  </div>
                ))
              )}
            </div>
            <div style={{ padding: '1rem 1.5rem', borderTop: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: '0.9rem', color: '#718096' }}>{notificacoesFiltradas.length} notificação(ões)</span>
              <button onClick={() => setShowModalNotificacoes(false)} className="btn btn-primary" style={{ padding: '0.5rem 1.5rem' }}>Fechar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Layout;
