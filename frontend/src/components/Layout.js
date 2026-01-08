import React from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

const Layout = ({ children }) => {
  const location = useLocation();
  const navigate = useNavigate();
  const { user, logout, isAdmin } = useAuth();
  
  const isActive = (path) => {
    return location.pathname === path ? 'active' : '';
  };

  const handleLogout = () => {
    logout();
    navigate('/login');
  };
  
  return (
    <div className="layout-container">
      <nav className="navbar" data-testid="main-navbar">
        <div className="nav-content">
          <Link to="/" className="nav-brand" data-testid="nav-brand">
            FIEP | Gestão OC
          </Link>
          <ul className="nav-links">
            <li>
              <Link to="/" className={`nav-link ${isActive('/')}`} data-testid="nav-dashboard">
                Dashboard
              </Link>
            </li>
            {isAdmin() && (
              <>
                <li>
                  <Link to="/create-po" className={`nav-link ${isActive('/create-po')}`} data-testid="nav-create-po">
                    Nova OC
                  </Link>
                </li>
                <li>
                  <Link to="/admin" className={`nav-link ${isActive('/admin')}`} data-testid="nav-admin">
                    Admin
                  </Link>
                </li>
              </>
            )}
            {user?.owner_name && (
              <li>
                <Link to={`/owner/${user.owner_name}`} className={`nav-link ${isActive(`/owner/${user.owner_name}`)}`} data-testid="nav-my-items">
                  Meus Itens
                </Link>
              </li>
            )}
            <li>
              <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                <span style={{ color: '#4a5568', fontSize: '0.9rem', fontWeight: '500' }} data-testid="user-email">
                  {user?.email}
                </span>
                <button
                  onClick={handleLogout}
                  className="btn btn-secondary"
                  style={{ padding: '0.5rem 1rem', fontSize: '0.85rem' }}
                  data-testid="logout-button"
                >
                  Sair
                </button>
              </div>
            </li>
          </ul>
        </div>
      </nav>
      <main className="main-content">
        {children}
      </main>
    </div>
  );
};

export default Layout;
