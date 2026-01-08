import React from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import Dashboard from './pages/Dashboard';
import CreatePO from './pages/CreatePO';
import PODetails from './pages/PODetails';
import AdminPanel from './pages/AdminPanel';
import OwnerPanel from './pages/OwnerPanel';
import Layout from './components/Layout';
import './App.css';

function App() {
  return (
    <BrowserRouter>
      <Layout>
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/create-po" element={<CreatePO />} />
          <Route path="/po/:id" element={<PODetails />} />
          <Route path="/admin" element={<AdminPanel />} />
          <Route path="/owner/:name" element={<OwnerPanel />} />
        </Routes>
      </Layout>
    </BrowserRouter>
  );
}

export default App;
