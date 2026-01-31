import React, { useState, useEffect, useRef } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { apiGet, apiPost, API } from '../utils/api';

const Layout = ({ children }) => {
  const location = useLocation();
  const navigate = useNavigate();
  const { user, logout, isAdmin } = useAuth();
  const [notificacoes, setNotificacoes] = useState([]);
  const [notificacoesCount, setNotificacoesCount] = useState(0);
  const [showNotificacoes, setShowNotificacoes] = useState(false);
  const notificacoesRef = useRef(null);
  
  // Estados para o modal "Ver todas"
  const [showModalNotificacoes, setShowModalNotificacoes] = useState(false);
  const [todasNotificacoes, setTodasNotificacoes] = useState([]);
  const [searchNotificacoes, setSearchNotificacoes] = useState('');
  const [loadingTodasNotificacoes, setLoadingTodasNotificacoes] = useState(false);
  
  const [showUserMenu, setShowUserMenu] = useState(false);
  const userMenuRef = useRef(null);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  
  const isActive = (path) => {
    return location.pathname === path ? 'active' : '';
  };

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  // Fechar menu do usuário ao clicar fora
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (userMenuRef.current && !userMenuRef.current.contains(event.target)) {
        setShowUserMenu(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Carregar contagem de notificações
  useEffect(() => {
    const loadNotificacoesCount = async () => {
      try {
        const response = await apiGet(`${API}/notificacoes/nao-lidas/count`);
        setNotificacoesCount(response.data.count);
      } catch (error) {
        console.error('Erro ao carregar notificações:', error);
      }
    };

    if (user) {
      loadNotificacoesCount();
      // Atualizar a cada 30 segundos
      const interval = setInterval(loadNotificacoesCount, 30000);
      return () => clearInterval(interval);
    }
  }, [user]);

  // Carregar notificações quando abrir o dropdown
  const loadNotificacoes = async () => {
    try {
      const response = await apiGet(`${API}/notificacoes`);
      setNotificacoes(response.data);
    } catch (error) {
      console.error('Erro ao carregar notificações:', error);
    }
  };

  const toggleNotificacoes = () => {
    if (!showNotificacoes) {
      loadNotificacoes();
    }
    setShowNotificacoes(!showNotificacoes);
  };

  const marcarComoLida = async (id) => {
    try {
      await apiPost(`${API}/notificacoes/${id}/marcar-lida`, {});
      setNotificacoes(prev => prev.map(n => n.id === id ? { ...n, lida: true } : n));
      setNotificacoesCount(prev => Math.max(0, prev - 1));
    } catch (error) {
      console.error('Erro ao marcar notificação como lida:', error);
    }
  };

  const marcarTodasComoLidas = async () => {
    try {
      await apiPost(`${API}/notificacoes/marcar-todas-lidas`, {});
      setNotificacoes(prev => prev.map(n => ({ ...n, lida: true })));
      setTodasNotificacoes(prev => prev.map(n => ({ ...n, lida: true })));
      setNotificacoesCount(0);
    } catch (error) {
      console.error('Erro ao marcar todas como lidas:', error);
    }
  };

  // Abrir modal "Ver todas" com todas as notificações
  const abrirVerTodas = async () => {
    setShowNotificacoes(false);
    setShowModalNotificacoes(true);
    setLoadingTodasNotificacoes(true);
    try {
      const response = await apiGet(`${API}/notificacoes?limit=500`);
      setTodasNotificacoes(response.data);
    } catch (error) {
      console.error('Erro ao carregar todas notificações:', error);
    } finally {
      setLoadingTodasNotificacoes(false);
    }
  };

  // Filtrar notificações por pesquisa
  const notificacoesFiltradas = todasNotificacoes.filter(notif => {
    if (!searchNotificacoes.trim()) return true;
    const search = searchNotificacoes.toLowerCase();
    return (
      (notif.numero_oc && notif.numero_oc.toLowerCase().includes(search)) ||
      (notif.codigo_item && notif.codigo_item.toLowerCase().includes(search)) ||
      (notif.codigo_rastreio && notif.codigo_rastreio.toLowerCase().includes(search)) ||
      (notif.descricao_item && notif.descricao_item.toLowerCase().includes(search)) ||
      (notif.titulo && notif.titulo.toLowerCase().includes(search)) ||
      (notif.mensagem && notif.mensagem.toLowerCase().includes(search))
    );
  });

  // Fechar dropdown ao clicar fora
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (notificacoesRef.current && !notificacoesRef.current.contains(event.target)) {
        setShowNotificacoes(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);
  
  return (
    <div className="layout-container">
      <nav className="navbar" data-testid="main-navbar">
        <div className="nav-content" style={{ position: 'relative' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', width: '100%', justifyContent: 'space-between' }}>
            <Link to="/" className="nav-brand" data-testid="nav-brand">
              FIEP | Gestão OC
            </Link>
            
            {/* Botão Hamburger - Mobile Only */}
            <button
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="mobile-menu-btn"
              style={{
                display: 'none',
                background: 'none',
                border: 'none',
                fontSize: '1.5rem',
                cursor: 'pointer',
                padding: '0.5rem'
              }}
              data-testid="mobile-menu-btn"
            >
              {mobileMenuOpen ? '✕' : '☰'}
            </button>
          </div>
          
          <ul className={`nav-links ${mobileMenuOpen ? 'mobile-open' : ''}`}>
            {/* Menu Principal - Visível para todos */}
            <li>
              <Link to="/" className={`nav-link ${isActive('/')}`} data-testid="nav-dashboard" onClick={() => setMobileMenuOpen(false)}>
                📊 Dashboard
              </Link>
            </li>
            {user?.owner_name && (
              <li>
                <Link to={`/owner/${user.owner_name}`} className={`nav-link ${isActive(`/owner/${user.owner_name}`)}`} data-testid="nav-my-items" onClick={() => setMobileMenuOpen(false)}>
                  📋 Meus Itens
                </Link>
              </li>
            )}
            <li>
              <Link to="/estoque" className={`nav-link ${isActive('/estoque')}`} data-testid="nav-estoque" onClick={() => setMobileMenuOpen(false)}>
                📦 Estoque
              </Link>
            </li>
            <li>
              <Link to="/galeria" className={`nav-link ${isActive('/galeria')}`} data-testid="nav-galeria" onClick={() => setMobileMenuOpen(false)}>
                🖼️ Galeria
              </Link>
            </li>
            
            <li>
              <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                {/* Sininho de Notificações */}
                <div ref={notificacoesRef} style={{ position: 'relative' }}>
                  <button
                    onClick={toggleNotificacoes}
                    style={{
                      background: 'none',
                      border: 'none',
                      cursor: 'pointer',
                      padding: '0.5rem',
                      position: 'relative',
                      fontSize: '1.25rem'
                    }}
                    data-testid="notifications-bell"
                    title="Notificações"
                  >
                    🔔
                    {notificacoesCount > 0 && (
                      <span style={{
                        position: 'absolute',
                        top: '0',
                        right: '0',
                        background: '#ef4444',
                        color: 'white',
                        borderRadius: '50%',
                        width: '18px',
                        height: '18px',
                        fontSize: '0.7rem',
                        fontWeight: '700',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center'
                      }}>
                        {notificacoesCount > 9 ? '9+' : notificacoesCount}
                      </span>
                    )}
                  </button>

                  {/* Dropdown de Notificações */}
                  {showNotificacoes && (
                    <div style={{
                      position: 'absolute',
                      top: '100%',
                      right: '0',
                      width: '360px',
                      maxHeight: '400px',
                      overflowY: 'auto',
                      background: 'white',
                      borderRadius: '8px',
                      boxShadow: '0 4px 20px rgba(0,0,0,0.15)',
                      zIndex: 1000,
                      border: '1px solid #e2e8f0'
                    }} data-testid="notifications-dropdown">
                      {/* Header */}
                      <div style={{
                        padding: '0.75rem 1rem',
                        borderBottom: '1px solid #e2e8f0',
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        background: '#f7fafc'
                      }}>
                        <span style={{ fontWeight: '600', color: '#2d3748' }}>
                          Notificações
                        </span>
                        <div style={{ display: 'flex', gap: '0.75rem' }}>
                          <button
                            onClick={abrirVerTodas}
                            style={{
                              background: 'none',
                              border: 'none',
                              color: '#3b82f6',
                              cursor: 'pointer',
                              fontSize: '0.8rem',
                              fontWeight: '500'
                            }}
                            data-testid="view-all-notifications"
                          >
                            Ver todas
                          </button>
                          {notificacoesCount > 0 && (
                            <button
                              onClick={marcarTodasComoLidas}
                              style={{
                                background: 'none',
                                border: 'none',
                                color: '#667eea',
                                cursor: 'pointer',
                                fontSize: '0.8rem',
                                fontWeight: '500'
                              }}
                              data-testid="mark-all-read"
                            >
                              Marcar todas lidas
                            </button>
                          )}
                        </div>
                      </div>

                      {/* Lista de Notificações */}
                      {notificacoes.length === 0 ? (
                        <div style={{
                          padding: '2rem 1rem',
                          textAlign: 'center',
                          color: '#718096'
                        }}>
                          Nenhuma notificação
                        </div>
                      ) : (
                        <div>
                          {notificacoes.map((notif) => (
                            <div
                              key={notif.id}
                              onClick={() => !notif.lida && marcarComoLida(notif.id)}
                              style={{
                                padding: '0.75rem 1rem',
                                borderBottom: '1px solid #f0f0f0',
                                cursor: notif.lida ? 'default' : 'pointer',
                                background: notif.lida ? 'white' : '#f0f7ff',
                                transition: 'background 0.2s'
                              }}
                              data-testid={`notification-${notif.id}`}
                            >
                              <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.75rem' }}>
                                <span style={{ fontSize: '1.25rem' }}>
                                  {notif.tipo === 'entrega' ? '✅' : 
                                   notif.tipo === 'saiu_entrega' ? '🚚' : 
                                   notif.tipo === 'tentativa' ? '⚠️' : '🔔'}
                                </span>
                                <div style={{ flex: 1 }}>
                                  <div style={{
                                    fontWeight: notif.lida ? '400' : '600',
                                    color: notif.tipo === 'entrega' ? '#16a34a' : 
                                           notif.tipo === 'saiu_entrega' ? '#2563eb' : 
                                           notif.tipo === 'tentativa' ? '#d97706' : '#2d3748',
                                    fontSize: '0.9rem',
                                    marginBottom: '0.25rem'
                                  }}>
                                    {notif.titulo}
                                  </div>
                                  {notif.mensagem && (
                                    <div style={{
                                      fontSize: '0.85rem',
                                      color: '#4a5568',
                                      marginBottom: '0.25rem'
                                    }}>
                                      {notif.mensagem}
                                    </div>
                                  )}
                                  <div style={{
                                    fontSize: '0.85rem',
                                    color: '#4a5568',
                                    marginBottom: '0.25rem'
                                  }}>
                                    <strong>OC:</strong> {notif.numero_oc} | <strong>Item:</strong> {notif.codigo_item}
                                    {notif.codigo_rastreio && (
                                      <> | <strong>Rastreio:</strong> {notif.codigo_rastreio}</>
                                    )}
                                  </div>
                                  <div style={{
                                    fontSize: '0.8rem',
                                    color: '#718096'
                                  }}>
                                    {notif.descricao_item}
                                  </div>
                                  <div style={{
                                    fontSize: '0.75rem',
                                    color: '#a0aec0',
                                    marginTop: '0.25rem'
                                  }}>
                                    {new Date(notif.created_at).toLocaleString('pt-BR')}
                                  </div>
                                </div>
                                {!notif.lida && (
                                  <span style={{
                                    width: '8px',
                                    height: '8px',
                                    borderRadius: '50%',
                                    background: '#667eea',
                                    flexShrink: 0,
                                    marginTop: '6px'
                                  }} />
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {/* Nome do usuário com menu suspenso */}
                <div ref={userMenuRef} style={{ position: 'relative' }}>
                  <button
                    onClick={() => setShowUserMenu(!showUserMenu)}
                    style={{
                      background: 'none',
                      border: 'none',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.5rem',
                      padding: '0.5rem 0.75rem',
                      borderRadius: '8px',
                      color: '#4a5568',
                      fontSize: '0.9rem',
                      fontWeight: '500',
                      transition: 'background 0.2s'
                    }}
                    data-testid="user-menu-button"
                  >
                    <span style={{ 
                      width: '28px', 
                      height: '28px', 
                      borderRadius: '50%', 
                      background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                      color: 'white',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: '0.75rem',
                      fontWeight: '700'
                    }}>
                      {(user?.owner_name || user?.email || '?').charAt(0).toUpperCase()}
                    </span>
                    {user?.owner_name || user?.email}
                    <span style={{ fontSize: '1.2rem', marginLeft: '0.25rem' }}>☰</span>
                  </button>

                  {/* Menu Dropdown do Usuário */}
                  {showUserMenu && (
                    <div style={{
                      position: 'absolute',
                      top: '100%',
                      right: '0',
                      width: '200px',
                      background: 'white',
                      borderRadius: '8px',
                      boxShadow: '0 4px 20px rgba(0,0,0,0.15)',
                      zIndex: 1000,
                      border: '1px solid #e2e8f0',
                      overflow: 'hidden'
                    }} data-testid="user-dropdown">
                      {isAdmin() && (
                        <>
                          <Link
                            to="/admin"
                            onClick={() => setShowUserMenu(false)}
                            style={{
                              display: 'block',
                              padding: '0.75rem 1rem',
                              color: '#4a5568',
                              textDecoration: 'none',
                              fontSize: '0.9rem',
                              borderBottom: '1px solid #f0f0f0',
                              transition: 'background 0.2s'
                            }}
                            onMouseEnter={(e) => e.target.style.background = '#f7fafc'}
                            onMouseLeave={(e) => e.target.style.background = 'transparent'}
                            data-testid="menu-admin"
                          >
                            ⚙️ Admin
                          </Link>
                          <Link
                            to="/create-po"
                            onClick={() => setShowUserMenu(false)}
                            style={{
                              display: 'block',
                              padding: '0.75rem 1rem',
                              color: '#4a5568',
                              textDecoration: 'none',
                              fontSize: '0.9rem',
                              borderBottom: '1px solid #f0f0f0',
                              transition: 'background 0.2s'
                            }}
                            onMouseEnter={(e) => e.target.style.background = '#f7fafc'}
                            onMouseLeave={(e) => e.target.style.background = 'transparent'}
                            data-testid="menu-nova-oc"
                          >
                            ➕ Nova OC
                          </Link>
                          <Link
                            to="/resumo-completo"
                            onClick={() => setShowUserMenu(false)}
                            style={{
                              display: 'block',
                              padding: '0.75rem 1rem',
                              color: '#4a5568',
                              textDecoration: 'none',
                              fontSize: '0.9rem',
                              borderBottom: '1px solid #f0f0f0',
                              transition: 'background 0.2s'
                            }}
                            onMouseEnter={(e) => e.target.style.background = '#f7fafc'}
                            onMouseLeave={(e) => e.target.style.background = 'transparent'}
                            data-testid="menu-resumo"
                          >
                            📊 Resumo Completo
                          </Link>
                        </>
                      )}
                      <Link
                        to="/planilha-itens"
                        onClick={() => setShowUserMenu(false)}
                        style={{
                          display: 'block',
                          padding: '0.75rem 1rem',
                          color: '#4a5568',
                          textDecoration: 'none',
                          fontSize: '0.9rem',
                          borderBottom: '1px solid #f0f0f0',
                          transition: 'background 0.2s'
                        }}
                        onMouseEnter={(e) => e.target.style.background = '#f7fafc'}
                        onMouseLeave={(e) => e.target.style.background = 'transparent'}
                        data-testid="menu-planilha"
                      >
                        📋 Planilha
                      </Link>
                      <Link
                        to="/profile"
                        onClick={() => setShowUserMenu(false)}
                        style={{
                          display: 'block',
                          padding: '0.75rem 1rem',
                          color: '#4a5568',
                          textDecoration: 'none',
                          fontSize: '0.9rem',
                          borderBottom: '1px solid #f0f0f0',
                          transition: 'background 0.2s'
                        }}
                        onMouseEnter={(e) => e.target.style.background = '#f7fafc'}
                        onMouseLeave={(e) => e.target.style.background = 'transparent'}
                        data-testid="menu-perfil"
                      >
                        👤 Meu Perfil
                      </Link>
                      <button
                        onClick={() => {
                          setShowUserMenu(false);
                          handleLogout();
                        }}
                        style={{
                          display: 'block',
                          width: '100%',
                          padding: '0.75rem 1rem',
                          color: '#dc2626',
                          background: 'none',
                          border: 'none',
                          fontSize: '0.9rem',
                          textAlign: 'left',
                          cursor: 'pointer',
                          transition: 'background 0.2s'
                        }}
                        onMouseEnter={(e) => e.target.style.background = '#fef2f2'}
                        onMouseLeave={(e) => e.target.style.background = 'transparent'}
                        data-testid="menu-logout"
                      >
                        🚪 Sair
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </li>
          </ul>
        </div>
      </nav>
      <main className="main-content">
        {children}
      </main>

      {/* Modal Ver Todas Notificações */}
      {showModalNotificacoes && (
        <div 
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: 'rgba(0,0,0,0.5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 2000
          }}
          onClick={() => setShowModalNotificacoes(false)}
        >
          <div 
            style={{
              background: 'white',
              borderRadius: '12px',
              width: '90%',
              maxWidth: '700px',
              maxHeight: '85vh',
              display: 'flex',
              flexDirection: 'column',
              boxShadow: '0 20px 60px rgba(0,0,0,0.3)'
            }}
            onClick={e => e.stopPropagation()}
          >
            {/* Header do Modal */}
            <div style={{
              padding: '1.25rem 1.5rem',
              borderBottom: '1px solid #e2e8f0',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              background: '#f7fafc',
              borderRadius: '12px 12px 0 0'
            }}>
              <h2 style={{ margin: 0, fontSize: '1.25rem', fontWeight: '600', color: '#2d3748' }}>
                🔔 Todas as Notificações
              </h2>
              <button
                onClick={() => setShowModalNotificacoes(false)}
                style={{
                  background: 'none',
                  border: 'none',
                  fontSize: '1.5rem',
                  cursor: 'pointer',
                  color: '#718096',
                  lineHeight: 1
                }}
              >
                ×
              </button>
            </div>

            {/* Campo de Pesquisa */}
            <div style={{ padding: '1rem 1.5rem', borderBottom: '1px solid #e2e8f0' }}>
              <input
                type="text"
                placeholder="🔍 Pesquisar por OC, código do item, rastreio ou nome..."
                value={searchNotificacoes}
                onChange={(e) => setSearchNotificacoes(e.target.value)}
                style={{
                  width: '100%',
                  padding: '0.75rem 1rem',
                  border: '2px solid #e2e8f0',
                  borderRadius: '8px',
                  fontSize: '0.95rem',
                  outline: 'none',
                  transition: 'border-color 0.2s'
                }}
                onFocus={(e) => e.target.style.borderColor = '#667eea'}
                onBlur={(e) => e.target.style.borderColor = '#e2e8f0'}
                data-testid="search-notifications"
              />
              {searchNotificacoes && (
                <div style={{ marginTop: '0.5rem', fontSize: '0.85rem', color: '#718096' }}>
                  {notificacoesFiltradas.length} resultado(s) encontrado(s)
                </div>
              )}
            </div>

            {/* Lista de Notificações */}
            <div style={{ flex: 1, overflowY: 'auto', padding: '0' }}>
              {loadingTodasNotificacoes ? (
                <div style={{ padding: '3rem', textAlign: 'center', color: '#718096' }}>
                  ⏳ Carregando notificações...
                </div>
              ) : notificacoesFiltradas.length === 0 ? (
                <div style={{ padding: '3rem', textAlign: 'center', color: '#718096' }}>
                  {searchNotificacoes ? 'Nenhuma notificação encontrada para esta pesquisa' : 'Nenhuma notificação'}
                </div>
              ) : (
                notificacoesFiltradas.map((notif) => (
                  <div
                    key={notif.id}
                    onClick={() => !notif.lida && marcarComoLida(notif.id)}
                    style={{
                      padding: '1rem 1.5rem',
                      borderBottom: '1px solid #f0f0f0',
                      cursor: notif.lida ? 'default' : 'pointer',
                      background: notif.lida ? 'white' : '#f0f7ff',
                      transition: 'background 0.2s'
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'flex-start', gap: '1rem' }}>
                      <span style={{ fontSize: '1.5rem' }}>
                        {notif.tipo === 'entrega' ? '✅' : 
                         notif.tipo === 'saiu_entrega' ? '🚚' : 
                         notif.tipo === 'tentativa' ? '⚠️' : '🔔'}
                      </span>
                      <div style={{ flex: 1 }}>
                        <div style={{
                          fontWeight: notif.lida ? '400' : '600',
                          color: notif.tipo === 'entrega' ? '#16a34a' : 
                                 notif.tipo === 'saiu_entrega' ? '#2563eb' : 
                                 notif.tipo === 'tentativa' ? '#d97706' : '#2d3748',
                          fontSize: '1rem',
                          marginBottom: '0.25rem'
                        }}>
                          {notif.titulo}
                        </div>
                        {notif.mensagem && (
                          <div style={{
                            fontSize: '0.9rem',
                            color: '#4a5568',
                            marginBottom: '0.5rem'
                          }}>
                            {notif.mensagem}
                          </div>
                        )}
                        <div style={{
                          fontSize: '0.85rem',
                          color: '#4a5568',
                          marginBottom: '0.25rem',
                          display: 'flex',
                          gap: '1rem',
                          flexWrap: 'wrap'
                        }}>
                          <span><strong>OC:</strong> {notif.numero_oc}</span>
                          <span><strong>Item:</strong> {notif.codigo_item}</span>
                          {notif.codigo_rastreio && (
                            <span><strong>Rastreio:</strong> {notif.codigo_rastreio}</span>
                          )}
                        </div>
                        <div style={{
                          fontSize: '0.85rem',
                          color: '#718096'
                        }}>
                          {notif.descricao_item}
                        </div>
                        <div style={{
                          fontSize: '0.8rem',
                          color: '#a0aec0',
                          marginTop: '0.5rem'
                        }}>
                          {new Date(notif.created_at).toLocaleString('pt-BR')}
                        </div>
                      </div>
                      {!notif.lida && (
                        <span style={{
                          width: '10px',
                          height: '10px',
                          borderRadius: '50%',
                          background: '#667eea',
                          flexShrink: 0,
                          marginTop: '6px'
                        }} />
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>

            {/* Footer do Modal */}
            <div style={{
              padding: '1rem 1.5rem',
              borderTop: '1px solid #e2e8f0',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              background: '#f7fafc',
              borderRadius: '0 0 12px 12px'
            }}>
              <span style={{ fontSize: '0.9rem', color: '#718096' }}>
                {todasNotificacoes.length} notificação(ões) total
              </span>
              <button
                onClick={() => setShowModalNotificacoes(false)}
                className="btn btn-primary"
                style={{ padding: '0.5rem 1.5rem' }}
              >
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Layout;
