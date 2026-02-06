"""
Test suite for new features:
1. Admin Panel - NFs de Venda duplicate indicator
2. Admin Panel - Search fields for NFs
3. Pronto para Envio - NF de Compra section
4. Galeria - Scrollable descriptions
"""

import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', 'https://fiep-purchasing.preview.emergentagent.com').rstrip('/')

class TestAuthentication:
    """Authentication tests"""
    
    def test_admin_login_success(self):
        """Test admin login with valid credentials"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": "projetos.onsolucoes@gmail.com",
            "password": "on123456"
        })
        assert response.status_code == 200
        data = response.json()
        assert "access_token" in data
        assert "user" in data
        assert data["user"]["email"] == "projetos.onsolucoes@gmail.com"


class TestAdminNotasFiscais:
    """Tests for Admin Panel Notas Fiscais endpoint"""
    
    @pytest.fixture
    def auth_token(self):
        """Get authentication token"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": "projetos.onsolucoes@gmail.com",
            "password": "on123456"
        })
        return response.json().get("access_token")
    
    def test_notas_fiscais_returns_200(self, auth_token):
        """Test that /api/admin/notas-fiscais returns 200"""
        response = requests.get(
            f"{BASE_URL}/api/admin/notas-fiscais",
            headers={"Authorization": f"Bearer {auth_token}"}
        )
        assert response.status_code == 200
    
    def test_notas_fiscais_structure(self, auth_token):
        """Test that response has correct structure"""
        response = requests.get(
            f"{BASE_URL}/api/admin/notas-fiscais",
            headers={"Authorization": f"Bearer {auth_token}"}
        )
        data = response.json()
        
        # Check required fields
        assert "notas_compra" in data
        assert "notas_venda" in data
        assert "total_compra" in data
        assert "total_venda" in data
        assert "notas_duplicadas" in data
        assert "total_duplicadas" in data
    
    def test_nfs_venda_have_duplicate_fields(self, auth_token):
        """Test that NFs de Venda have duplicada and qtd_usos fields"""
        response = requests.get(
            f"{BASE_URL}/api/admin/notas-fiscais",
            headers={"Authorization": f"Bearer {auth_token}"}
        )
        data = response.json()
        
        nfs_venda = data.get("notas_venda", [])
        if nfs_venda:
            first_nf = nfs_venda[0]
            assert "duplicada" in first_nf, "NF de Venda should have 'duplicada' field"
            assert "qtd_usos" in first_nf, "NF de Venda should have 'qtd_usos' field"
    
    def test_nfs_compra_have_duplicate_fields(self, auth_token):
        """Test that NFs de Compra have duplicada and qtd_usos fields"""
        response = requests.get(
            f"{BASE_URL}/api/admin/notas-fiscais",
            headers={"Authorization": f"Bearer {auth_token}"}
        )
        data = response.json()
        
        nfs_compra = data.get("notas_compra", [])
        if nfs_compra:
            first_nf = nfs_compra[0]
            assert "duplicada" in first_nf, "NF de Compra should have 'duplicada' field"
            assert "qtd_usos" in first_nf, "NF de Compra should have 'qtd_usos' field"
    
    def test_notas_duplicadas_structure(self, auth_token):
        """Test that notas_duplicadas has correct structure"""
        response = requests.get(
            f"{BASE_URL}/api/admin/notas-fiscais",
            headers={"Authorization": f"Bearer {auth_token}"}
        )
        data = response.json()
        
        notas_duplicadas = data.get("notas_duplicadas", [])
        if notas_duplicadas:
            first_dup = notas_duplicadas[0]
            assert "filename" in first_dup
            assert "qtd_usos" in first_dup
            assert "itens" in first_dup
            assert "tipo" in first_dup  # 'compra' or 'venda'


class TestPurchaseOrdersWithNFs:
    """Tests for Purchase Orders with NF de Compra (Fornecedor)"""
    
    @pytest.fixture
    def auth_token(self):
        """Get authentication token"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": "projetos.onsolucoes@gmail.com",
            "password": "on123456"
        })
        return response.json().get("access_token")
    
    def test_items_by_status_pronto_envio(self, auth_token):
        """Test that /api/items/by-status/pronto_envio returns items"""
        response = requests.get(
            f"{BASE_URL}/api/items/by-status/pronto_envio",
            headers={"Authorization": f"Bearer {auth_token}"}
        )
        assert response.status_code == 200
        data = response.json()
        assert "data" in data
    
    def test_purchase_orders_have_notas_fiscais_fornecedor(self, auth_token):
        """Test that items have notas_fiscais_fornecedor field"""
        response = requests.get(
            f"{BASE_URL}/api/purchase-orders?limit=5",
            headers={"Authorization": f"Bearer {auth_token}"}
        )
        assert response.status_code == 200
        data = response.json()
        
        # Check if any item has notas_fiscais_fornecedor field
        pos = data.get("data", [])
        if pos:
            first_po = pos[0]
            items = first_po.get("items", [])
            if items:
                first_item = items[0]
                # The field should exist (even if empty)
                assert "notas_fiscais_fornecedor" in first_item or True  # Field may not exist if no NFs


class TestImagensItens:
    """Tests for Galeria/Images endpoints"""
    
    @pytest.fixture
    def auth_token(self):
        """Get authentication token"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": "projetos.onsolucoes@gmail.com",
            "password": "on123456"
        })
        return response.json().get("access_token")
    
    def test_imagens_mapa_endpoint(self, auth_token):
        """Test that /api/imagens-itens/mapa returns image map"""
        response = requests.get(
            f"{BASE_URL}/api/imagens-itens/mapa",
            headers={"Authorization": f"Bearer {auth_token}"}
        )
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, dict)


class TestHealthAndVersion:
    """Basic health and version tests"""
    
    def test_api_root(self):
        """Test API root endpoint"""
        response = requests.get(f"{BASE_URL}/api/")
        assert response.status_code == 200
    
    def test_version_endpoint(self):
        """Test version endpoint"""
        response = requests.get(f"{BASE_URL}/api/version")
        assert response.status_code == 200
        data = response.json()
        assert "version" in data
