"""
Test P0 Bugs - Rastreio API and Notas Fiscais Admin Panel
Tests for:
1. GET /api/admin/notas-fiscais - Lista de NFs com notas_compra e notas_venda
2. GET /api/rastreio/{codigo} - Rastreamento ou mensagem de indisponibilidade
3. POST /api/auth/login - Autenticação
4. GET /api/purchase-orders/{po_id} - OC com itens e notas_fiscais_fornecedor
"""
import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

# Test credentials
ADMIN_EMAIL = "projetos.onsolucoes@gmail.com"
ADMIN_PASSWORD = "on123456"


class TestAuthentication:
    """Test authentication endpoints"""
    
    def test_admin_login_success(self):
        """Test admin login returns token and user info"""
        response = requests.post(
            f"{BASE_URL}/api/auth/login",
            json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD}
        )
        
        assert response.status_code == 200, f"Login failed: {response.text}"
        
        data = response.json()
        assert "access_token" in data, "Missing access_token in response"
        assert "user" in data, "Missing user in response"
        assert data["user"]["email"] == ADMIN_EMAIL
        assert data["user"]["role"] == "admin"
        print(f"✅ Admin login successful - token received")
    
    def test_login_invalid_credentials(self):
        """Test login with invalid credentials returns 401"""
        response = requests.post(
            f"{BASE_URL}/api/auth/login",
            json={"email": "invalid@test.com", "password": "wrongpassword"}
        )
        
        assert response.status_code == 401, f"Expected 401, got {response.status_code}"
        print(f"✅ Invalid credentials correctly rejected with 401")


@pytest.fixture
def admin_token():
    """Get admin authentication token"""
    response = requests.post(
        f"{BASE_URL}/api/auth/login",
        json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD}
    )
    if response.status_code == 200:
        return response.json().get("access_token")
    pytest.skip("Admin authentication failed")


@pytest.fixture
def admin_headers(admin_token):
    """Get headers with admin auth token"""
    return {
        "Authorization": f"Bearer {admin_token}",
        "Content-Type": "application/json"
    }


class TestAdminNotasFiscais:
    """Test GET /api/admin/notas-fiscais endpoint - P0 Bug #2"""
    
    def test_admin_notas_fiscais_returns_200(self, admin_headers):
        """Test endpoint returns 200 status"""
        response = requests.get(
            f"{BASE_URL}/api/admin/notas-fiscais",
            headers=admin_headers
        )
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        print(f"✅ /api/admin/notas-fiscais returns 200")
    
    def test_admin_notas_fiscais_structure(self, admin_headers):
        """Test response has correct structure with notas_compra and notas_venda"""
        response = requests.get(
            f"{BASE_URL}/api/admin/notas-fiscais",
            headers=admin_headers
        )
        
        assert response.status_code == 200
        data = response.json()
        
        # Verify required fields exist
        assert "notas_compra" in data, "Missing 'notas_compra' field"
        assert "notas_venda" in data, "Missing 'notas_venda' field"
        assert "total_compra" in data, "Missing 'total_compra' field"
        assert "total_venda" in data, "Missing 'total_venda' field"
        
        # Verify types
        assert isinstance(data["notas_compra"], list), "notas_compra should be a list"
        assert isinstance(data["notas_venda"], list), "notas_venda should be a list"
        assert isinstance(data["total_compra"], int), "total_compra should be int"
        assert isinstance(data["total_venda"], int), "total_venda should be int"
        
        print(f"✅ Response structure correct - notas_compra: {data['total_compra']}, notas_venda: {data['total_venda']}")
    
    def test_admin_notas_fiscais_compra_fields(self, admin_headers):
        """Test notas_compra items have required fields"""
        response = requests.get(
            f"{BASE_URL}/api/admin/notas-fiscais",
            headers=admin_headers
        )
        
        assert response.status_code == 200
        data = response.json()
        
        if data["total_compra"] > 0:
            nf = data["notas_compra"][0]
            required_fields = ["id", "filename", "numero_oc", "codigo_item", "po_id", "item_index"]
            for field in required_fields:
                assert field in nf, f"Missing field '{field}' in nota_compra"
            print(f"✅ notas_compra items have all required fields")
        else:
            print(f"⚠️ No notas_compra found to verify fields")
    
    def test_admin_notas_fiscais_requires_admin(self):
        """Test endpoint requires admin authentication"""
        # Test without auth
        response = requests.get(f"{BASE_URL}/api/admin/notas-fiscais")
        assert response.status_code in [401, 403], f"Expected 401/403 without auth, got {response.status_code}"
        print(f"✅ Endpoint correctly requires authentication")


class TestRastreioAPI:
    """Test GET /api/rastreio/{codigo} endpoint - P0 Bug #1"""
    
    def test_rastreio_valid_code_format(self, admin_headers):
        """Test rastreio with valid tracking code format"""
        # Use a sample tracking code format (BR + 9 digits + BR)
        test_code = "BR123456789BR"
        
        response = requests.get(
            f"{BASE_URL}/api/rastreio/{test_code}",
            headers=admin_headers
        )
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()
        
        # Verify response structure
        assert "codigo" in data, "Missing 'codigo' field"
        assert data["codigo"] == test_code, f"Expected codigo={test_code}, got {data['codigo']}"
        
        # Should have either success=True with eventos OR success=False with fallback info
        assert "success" in data, "Missing 'success' field"
        
        if data["success"]:
            assert "eventos" in data, "Missing 'eventos' when success=True"
            print(f"✅ Rastreio returned success with {len(data.get('eventos', []))} eventos")
        else:
            # When APIs are unavailable, should return helpful info
            assert "message" in data or "link_correios" in data, "Missing fallback info when success=False"
            print(f"✅ Rastreio returned success=False with fallback info: {data.get('message', 'N/A')}")
            if data.get("rastreamento_manual"):
                print(f"   → rastreamento_manual=True, link_correios: {data.get('link_correios', 'N/A')}")
    
    def test_rastreio_returns_link_when_unavailable(self, admin_headers):
        """Test that when APIs fail, response includes link for manual tracking"""
        test_code = "SS987654321BR"  # Likely non-existent code
        
        response = requests.get(
            f"{BASE_URL}/api/rastreio/{test_code}",
            headers=admin_headers
        )
        
        assert response.status_code == 200
        data = response.json()
        
        # When tracking fails, should provide manual link
        if not data.get("success"):
            # Should have link_correios for manual tracking
            if "link_correios" in data:
                assert "rastreamento.correios.com.br" in data["link_correios"]
                print(f"✅ Fallback link provided: {data['link_correios']}")
            else:
                print(f"⚠️ No link_correios in response, but has message: {data.get('message', 'N/A')}")
        else:
            print(f"✅ Rastreio succeeded unexpectedly - APIs working")
    
    def test_rastreio_requires_auth(self):
        """Test rastreio endpoint requires authentication"""
        response = requests.get(f"{BASE_URL}/api/rastreio/BR123456789BR")
        assert response.status_code in [401, 403], f"Expected 401/403 without auth, got {response.status_code}"
        print(f"✅ Rastreio endpoint correctly requires authentication")


class TestPurchaseOrdersWithNFs:
    """Test GET /api/purchase-orders/{po_id} returns items with notas_fiscais_fornecedor"""
    
    def test_get_purchase_orders_list(self, admin_headers):
        """Test getting list of purchase orders"""
        response = requests.get(
            f"{BASE_URL}/api/purchase-orders",
            headers=admin_headers
        )
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        data = response.json()
        
        assert isinstance(data, list), "Response should be a list"
        print(f"✅ Got {len(data)} purchase orders")
        return data
    
    def test_get_single_purchase_order_structure(self, admin_headers):
        """Test single PO has correct structure with items"""
        # First get list of POs
        list_response = requests.get(
            f"{BASE_URL}/api/purchase-orders",
            headers=admin_headers
        )
        
        assert list_response.status_code == 200
        pos = list_response.json()
        
        if not pos:
            pytest.skip("No purchase orders found")
        
        # Get first PO details
        po_id = pos[0]["id"]
        response = requests.get(
            f"{BASE_URL}/api/purchase-orders/{po_id}",
            headers=admin_headers
        )
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        po = response.json()
        
        # Verify structure
        assert "id" in po, "Missing 'id' field"
        assert "numero_oc" in po, "Missing 'numero_oc' field"
        assert "items" in po, "Missing 'items' field"
        assert isinstance(po["items"], list), "items should be a list"
        
        print(f"✅ PO {po['numero_oc']} has {len(po['items'])} items")
    
    def test_purchase_order_items_have_nf_field(self, admin_headers):
        """Test that PO items have notas_fiscais_fornecedor field"""
        # Get list of POs
        list_response = requests.get(
            f"{BASE_URL}/api/purchase-orders",
            headers=admin_headers
        )
        
        assert list_response.status_code == 200
        pos = list_response.json()
        
        if not pos:
            pytest.skip("No purchase orders found")
        
        # Check multiple POs for items with NFs
        found_nf = False
        for po_summary in pos[:10]:  # Check first 10 POs
            po_id = po_summary["id"]
            response = requests.get(
                f"{BASE_URL}/api/purchase-orders/{po_id}",
                headers=admin_headers
            )
            
            if response.status_code != 200:
                continue
            
            po = response.json()
            for item in po.get("items", []):
                # Check if item has notas_fiscais_fornecedor field
                if "notas_fiscais_fornecedor" in item:
                    nfs = item["notas_fiscais_fornecedor"]
                    if nfs and len(nfs) > 0:
                        found_nf = True
                        print(f"✅ Found item with {len(nfs)} NF(s) in PO {po['numero_oc']}")
                        # Verify NF structure
                        nf = nfs[0]
                        assert "id" in nf, "NF missing 'id'"
                        assert "filename" in nf, "NF missing 'filename'"
                        break
            if found_nf:
                break
        
        if not found_nf:
            print(f"⚠️ No items with notas_fiscais_fornecedor found in first 10 POs")


class TestHealthAndVersion:
    """Test basic health and version endpoints"""
    
    def test_health_check(self):
        """Test health endpoint"""
        response = requests.get(f"{BASE_URL}/health")
        assert response.status_code == 200
        data = response.json()
        assert data.get("status") == "healthy"
        print(f"✅ Health check passed")
    
    def test_version_endpoint(self, admin_headers):
        """Test version endpoint"""
        response = requests.get(
            f"{BASE_URL}/api/version",
            headers=admin_headers
        )
        assert response.status_code == 200
        data = response.json()
        assert "version" in data
        print(f"✅ Version: {data.get('version')}")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
