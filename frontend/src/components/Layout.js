import React from 'react';
import { Link, useLocation } from 'react-router-dom';

const Layout = ({ children }) => {
  const location = useLocation();
  
  const isActive = (path) => {
    return location.pathname === path ? 'active' : '';
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
