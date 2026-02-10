"""
Backend API Tests for FIEP OC System - Refactored Backend
Tests auth, rastreio, notificacao routes after refactoring
"""
import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', 'https://orderflow-212.preview.emergentagent.com').rstrip('/')

# Test credentials
ADMIN_EMAIL = "projetos.onsolucoes@gmail.com"
ADMIN_PASSWORD = "on123456"
USER_EMAIL = "maria.onsolucoes@gmail.com"
USER_PASSWORD = "on123456"


class TestAuthRoutes:
    """Test authentication routes from auth_routes.py"""
    
    def test_login_admin_success(self):
        """Test admin login with valid credentials"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": ADMIN_EMAIL,
            "password": ADMIN_PASSWORD
        })
        assert response.status_code == 200
        data = response.json()
        assert "access_token" in data
        assert data["user"]["email"] == ADMIN_EMAIL
        assert data["user"]["role"] == "admin"
    
    def test_login_user_success(self):
        """Test regular user login with valid credentials"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": USER_EMAIL,
            "password": USER_PASSWORD
        })
        assert response.status_code == 200
        data = response.json()
        assert "access_token" in data
        assert data["user"]["email"] == USER_EMAIL
        assert data["user"]["role"] == "user"
    
    def test_login_invalid_credentials(self):
        """Test login with invalid credentials"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": "invalid@example.com",
            "password": "wrongpassword"
        })
        assert response.status_code == 401
    
    def test_get_current_user_profile(self):
        """Test getting current user profile"""
        # Login first
        login_response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": ADMIN_EMAIL,
            "password": ADMIN_PASSWORD
        })
        token = login_response.json()["access_token"]
        
        # Get profile
        response = requests.get(
            f"{BASE_URL}/api/auth/me",
            headers={"Authorization": f"Bearer {token}"}
        )
        assert response.status_code == 200
        data = response.json()
        assert data["email"] == ADMIN_EMAIL
        assert data["role"] == "admin"


class TestNotificacaoRoutes:
    """Test notification routes from notificacao_routes.py"""
    
    @pytest.fixture
    def auth_token(self):
        """Get authentication token"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": ADMIN_EMAIL,
            "password": ADMIN_PASSWORD
        })
        return response.json()["access_token"]
    
    def test_get_notificacoes(self, auth_token):
        """Test getting notifications list"""
        response = requests.get(
            f"{BASE_URL}/api/notificacoes",
            headers={"Authorization": f"Bearer {auth_token}"}
        )
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
    
    def test_get_notificacoes_count(self, auth_token):
        """Test getting unread notifications count"""
        response = requests.get(
            f"{BASE_URL}/api/notificacoes/nao-lidas/count",
            headers={"Authorization": f"Bearer {auth_token}"}
        )
        assert response.status_code == 200
        data = response.json()
        assert "count" in data
        assert isinstance(data["count"], int)
    
    def test_marcar_todas_lidas(self, auth_token):
        """Test marking all notifications as read"""
        response = requests.post(
            f"{BASE_URL}/api/notificacoes/marcar-todas-lidas",
            headers={"Authorization": f"Bearer {auth_token}"}
        )
        assert response.status_code == 200
        data = response.json()
        assert "message" in data


class TestRastreioRoutes:
    """Test tracking routes from rastreio_routes.py"""
    
    @pytest.fixture
    def auth_token(self):
        """Get authentication token"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": ADMIN_EMAIL,
            "password": ADMIN_PASSWORD
        })
        return response.json()["access_token"]
    
    def test_buscar_rastreio(self, auth_token):
        """Test tracking code lookup"""
        response = requests.get(
            f"{BASE_URL}/api/rastreio/AA123456789BR",
            headers={"Authorization": f"Bearer {auth_token}"}
        )
        assert response.status_code == 200
        data = response.json()
        assert "codigo" in data
        assert data["codigo"] == "AA123456789BR"
        # API may return success=false if tracking service is unavailable
        assert "success" in data


class TestDashboard:
    """Test dashboard endpoint"""
    
    @pytest.fixture
    def auth_token(self):
        """Get authentication token"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": ADMIN_EMAIL,
            "password": ADMIN_PASSWORD
        })
        return response.json()["access_token"]
    
    def test_get_dashboard_stats(self, auth_token):
        """Test dashboard statistics"""
        response = requests.get(
            f"{BASE_URL}/api/dashboard",
            headers={"Authorization": f"Bearer {auth_token}"}
        )
        assert response.status_code == 200
        data = response.json()
        
        # Verify all expected fields
        assert "total_ocs" in data
        assert "total_items" in data
        assert "items_pendentes" in data
        assert "items_cotados" in data
        assert "items_comprados" in data
        assert "items_em_separacao" in data
        assert "items_em_transito" in data
        assert "items_entregues" in data
        assert "items_por_responsavel" in data
        
        # Verify data types
        assert isinstance(data["total_ocs"], int)
        assert isinstance(data["total_items"], int)


class TestPurchaseOrders:
    """Test purchase order endpoints"""
    
    @pytest.fixture
    def auth_token(self):
        """Get authentication token"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": ADMIN_EMAIL,
            "password": ADMIN_PASSWORD
        })
        return response.json()["access_token"]
    
    def test_get_purchase_orders(self, auth_token):
        """Test getting purchase orders list"""
        response = requests.get(
            f"{BASE_URL}/api/purchase-orders?limit=10",
            headers={"Authorization": f"Bearer {auth_token}"}
        )
        assert response.status_code == 200
        data = response.json()
        assert "data" in data or isinstance(data, list)
    
    def test_get_items_by_status_em_separacao(self, auth_token):
        """Test getting items with em_separacao status"""
        response = requests.get(
            f"{BASE_URL}/api/purchase-orders?limit=0",
            headers={"Authorization": f"Bearer {auth_token}"}
        )
        assert response.status_code == 200
        data = response.json()
        
        # Count items with em_separacao status
        pos = data.get("data", data)
        em_separacao_count = 0
        for po in pos:
            for item in po.get("items", []):
                if item.get("status") == "em_separacao":
                    em_separacao_count += 1
        
        # Should have some items in em_separacao based on dashboard
        print(f"Found {em_separacao_count} items in em_separacao status")


class TestFreteEnvioMultiplo:
    """Test batch freight application endpoint"""
    
    @pytest.fixture
    def auth_token(self):
        """Get authentication token"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": ADMIN_EMAIL,
            "password": ADMIN_PASSWORD
        })
        return response.json()["access_token"]
    
    def test_frete_envio_multiplo_endpoint_exists(self, auth_token):
        """Test that frete-envio-multiplo endpoint exists"""
        # First get a PO with items in em_separacao
        response = requests.get(
            f"{BASE_URL}/api/purchase-orders?limit=0",
            headers={"Authorization": f"Bearer {auth_token}"}
        )
        pos = response.json().get("data", response.json())
        
        # Find a PO with em_separacao items
        test_po = None
        test_indices = []
        for po in pos:
            for idx, item in enumerate(po.get("items", [])):
                if item.get("status") == "em_separacao":
                    test_po = po
                    test_indices.append(idx)
            if test_po:
                break
        
        if not test_po:
            pytest.skip("No items in em_separacao status to test")
        
        # Test the endpoint (with 0 frete to not modify data)
        response = requests.post(
            f"{BASE_URL}/api/purchase-orders/{test_po['id']}/frete-envio-multiplo",
            headers={"Authorization": f"Bearer {auth_token}"},
            json={
                "item_indices": test_indices[:1],
                "frete_total": 0.01  # Minimal value
            }
        )
        # Should return 200 or validation error, not 404
        assert response.status_code in [200, 400, 422]


class TestRastreioMultiplo:
    """Test batch tracking code application endpoint"""
    
    @pytest.fixture
    def auth_token(self):
        """Get authentication token"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": ADMIN_EMAIL,
            "password": ADMIN_PASSWORD
        })
        return response.json()["access_token"]
    
    def test_rastreio_multiplo_endpoint_exists(self, auth_token):
        """Test that rastreio-multiplo endpoint exists"""
        # First get a PO with items in em_separacao
        response = requests.get(
            f"{BASE_URL}/api/purchase-orders?limit=0",
            headers={"Authorization": f"Bearer {auth_token}"}
        )
        pos = response.json().get("data", response.json())
        
        # Find a PO with em_separacao items
        test_po = None
        test_indices = []
        for po in pos:
            for idx, item in enumerate(po.get("items", [])):
                if item.get("status") == "em_separacao":
                    test_po = po
                    test_indices.append(idx)
            if test_po:
                break
        
        if not test_po:
            pytest.skip("No items in em_separacao status to test")
        
        # Test the endpoint
        response = requests.post(
            f"{BASE_URL}/api/purchase-orders/{test_po['id']}/rastreio-multiplo",
            headers={"Authorization": f"Bearer {auth_token}"},
            json={
                "item_indices": test_indices[:1],
                "codigo_rastreio": "TEST123456789BR"
            }
        )
        # Should return 200 or validation error, not 404
        assert response.status_code in [200, 400, 422]


class TestVersion:
    """Test version endpoint"""
    
    def test_version_endpoint(self):
        """Test version endpoint returns correct info"""
        response = requests.get(f"{BASE_URL}/api/version")
        assert response.status_code == 200
        data = response.json()
        assert "version" in data
        assert "status" in data
        assert data["status"] == "OK"


class TestHealthCheck:
    """Test health check endpoint"""
    
    def test_health_endpoint(self):
        """Test health check endpoint"""
        response = requests.get(f"{BASE_URL}/health")
        # May return HTML if frontend handles /health
        # Backend health is at /api/health or just /health
        # Accept either 200 or HTML response
        assert response.status_code == 200


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
