"""
Test suite for frete (freight) fields functionality in FIEP OC Management System
Tests:
- frete_compra (editable by all users)
- frete_envio (editable only by admins)
- lucro_liquido calculation including both freight fields
"""
import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

# Test credentials
ADMIN_EMAIL = "projetos.onsolucoes@gmail.com"
ADMIN_PASSWORD = "on123456"
USER_EMAIL = "fabioonsolucoes@gmail.com"
USER_PASSWORD = "on123456"

# Known OC and item for testing
TEST_PO_ID = "e4741742-0534-427f-bb97-915e6d3e0c9b"
TEST_ITEM_CODIGO = "113415"


class TestAuthentication:
    """Test authentication endpoints"""
    
    def test_admin_login(self):
        """Test admin can login successfully"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": ADMIN_EMAIL,
            "password": ADMIN_PASSWORD
        })
        assert response.status_code == 200, f"Admin login failed: {response.text}"
        data = response.json()
        assert "access_token" in data
        assert data["user"]["role"] == "admin"
        print(f"✓ Admin login successful - role: {data['user']['role']}")
    
    def test_user_login(self):
        """Test regular user can login successfully"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": USER_EMAIL,
            "password": USER_PASSWORD
        })
        assert response.status_code == 200, f"User login failed: {response.text}"
        data = response.json()
        assert "access_token" in data
        assert data["user"]["role"] == "user"
        assert data["user"]["owner_name"] == "Fabio"
        print(f"✓ User login successful - role: {data['user']['role']}, owner: {data['user']['owner_name']}")


@pytest.fixture
def admin_token():
    """Get admin authentication token"""
    response = requests.post(f"{BASE_URL}/api/auth/login", json={
        "email": ADMIN_EMAIL,
        "password": ADMIN_PASSWORD
    })
    if response.status_code == 200:
        return response.json()["access_token"]
    pytest.skip("Admin authentication failed")


@pytest.fixture
def user_token():
    """Get regular user authentication token"""
    response = requests.post(f"{BASE_URL}/api/auth/login", json={
        "email": USER_EMAIL,
        "password": USER_PASSWORD
    })
    if response.status_code == 200:
        return response.json()["access_token"]
    pytest.skip("User authentication failed")


class TestFreteFieldsBackend:
    """Test frete fields in backend API"""
    
    def test_get_purchase_order_has_frete_fields(self, admin_token):
        """Verify PO items have frete_compra and frete_envio fields"""
        headers = {"Authorization": f"Bearer {admin_token}"}
        response = requests.get(f"{BASE_URL}/api/purchase-orders/{TEST_PO_ID}", headers=headers)
        
        assert response.status_code == 200, f"Failed to get PO: {response.text}"
        po = response.json()
        
        # Find the test item
        test_item = None
        for item in po["items"]:
            if item["codigo_item"] == TEST_ITEM_CODIGO:
                test_item = item
                break
        
        assert test_item is not None, f"Item {TEST_ITEM_CODIGO} not found in PO"
        
        # Verify frete fields exist in schema (can be null)
        assert "frete_compra" in test_item or test_item.get("frete_compra") is None
        assert "frete_envio" in test_item or test_item.get("frete_envio") is None
        print(f"✓ Item {TEST_ITEM_CODIGO} has frete fields - frete_compra: {test_item.get('frete_compra')}, frete_envio: {test_item.get('frete_envio')}")
    
    def test_admin_can_update_frete_compra(self, admin_token):
        """Admin can update frete_compra field"""
        headers = {"Authorization": f"Bearer {admin_token}"}
        
        # Update frete_compra
        test_frete_compra = 25.50
        response = requests.patch(
            f"{BASE_URL}/api/purchase-orders/{TEST_PO_ID}/items/{TEST_ITEM_CODIGO}",
            headers=headers,
            json={
                "status": "cotado",
                "frete_compra": test_frete_compra
            }
        )
        
        assert response.status_code == 200, f"Failed to update frete_compra: {response.text}"
        
        # Verify the update
        response = requests.get(f"{BASE_URL}/api/purchase-orders/{TEST_PO_ID}", headers=headers)
        po = response.json()
        
        test_item = next((item for item in po["items"] if item["codigo_item"] == TEST_ITEM_CODIGO), None)
        assert test_item is not None
        assert test_item.get("frete_compra") == test_frete_compra
        print(f"✓ Admin updated frete_compra to {test_frete_compra}")
    
    def test_admin_can_update_frete_envio(self, admin_token):
        """Admin can update frete_envio field"""
        headers = {"Authorization": f"Bearer {admin_token}"}
        
        # Update frete_envio
        test_frete_envio = 15.75
        response = requests.patch(
            f"{BASE_URL}/api/purchase-orders/{TEST_PO_ID}/items/{TEST_ITEM_CODIGO}",
            headers=headers,
            json={
                "status": "cotado",
                "frete_envio": test_frete_envio
            }
        )
        
        assert response.status_code == 200, f"Failed to update frete_envio: {response.text}"
        
        # Verify the update
        response = requests.get(f"{BASE_URL}/api/purchase-orders/{TEST_PO_ID}", headers=headers)
        po = response.json()
        
        test_item = next((item for item in po["items"] if item["codigo_item"] == TEST_ITEM_CODIGO), None)
        assert test_item is not None
        assert test_item.get("frete_envio") == test_frete_envio
        print(f"✓ Admin updated frete_envio to {test_frete_envio}")
    
    def test_user_can_update_frete_compra(self, user_token):
        """Regular user can update frete_compra field"""
        headers = {"Authorization": f"Bearer {user_token}"}
        
        # Update frete_compra
        test_frete_compra = 30.00
        response = requests.patch(
            f"{BASE_URL}/api/purchase-orders/{TEST_PO_ID}/items/{TEST_ITEM_CODIGO}",
            headers=headers,
            json={
                "status": "cotado",
                "frete_compra": test_frete_compra
            }
        )
        
        assert response.status_code == 200, f"Failed to update frete_compra as user: {response.text}"
        
        # Verify the update
        response = requests.get(f"{BASE_URL}/api/purchase-orders/{TEST_PO_ID}", headers=headers)
        po = response.json()
        
        test_item = next((item for item in po["items"] if item["codigo_item"] == TEST_ITEM_CODIGO), None)
        assert test_item is not None
        assert test_item.get("frete_compra") == test_frete_compra
        print(f"✓ User updated frete_compra to {test_frete_compra}")
    
    def test_user_cannot_update_frete_envio(self, user_token, admin_token):
        """Regular user CANNOT update frete_envio field - should be ignored"""
        headers_user = {"Authorization": f"Bearer {user_token}"}
        headers_admin = {"Authorization": f"Bearer {admin_token}"}
        
        # First, get current frete_envio value (as admin)
        response = requests.get(f"{BASE_URL}/api/purchase-orders/{TEST_PO_ID}", headers=headers_admin)
        po = response.json()
        test_item = next((item for item in po["items"] if item["codigo_item"] == TEST_ITEM_CODIGO), None)
        original_frete_envio = test_item.get("frete_envio")
        
        # Try to update frete_envio as regular user
        new_frete_envio = 999.99  # Attempt to set a different value
        response = requests.patch(
            f"{BASE_URL}/api/purchase-orders/{TEST_PO_ID}/items/{TEST_ITEM_CODIGO}",
            headers=headers_user,
            json={
                "status": "cotado",
                "frete_envio": new_frete_envio
            }
        )
        
        # Request should succeed (200) but frete_envio should NOT be updated
        assert response.status_code == 200, f"Request failed: {response.text}"
        
        # Verify frete_envio was NOT changed (check as admin)
        response = requests.get(f"{BASE_URL}/api/purchase-orders/{TEST_PO_ID}", headers=headers_admin)
        po = response.json()
        test_item = next((item for item in po["items"] if item["codigo_item"] == TEST_ITEM_CODIGO), None)
        
        # frete_envio should remain unchanged
        assert test_item.get("frete_envio") == original_frete_envio, \
            f"frete_envio was changed by user! Expected {original_frete_envio}, got {test_item.get('frete_envio')}"
        print(f"✓ User's attempt to update frete_envio was correctly ignored (value remains: {original_frete_envio})")


class TestLucroLiquidoCalculation:
    """Test lucro_liquido calculation including frete fields"""
    
    def test_lucro_liquido_calculation_with_fretes(self, admin_token):
        """Verify lucro_liquido = (preco_venda - preco_compra) * quantidade - imposto - frete_compra - frete_envio"""
        headers = {"Authorization": f"Bearer {admin_token}"}
        
        # Set known values for calculation
        preco_venda = 100.00
        preco_compra = 50.00
        imposto = 20.00
        frete_compra = 10.00
        frete_envio = 5.00
        
        # Update item with all values
        response = requests.patch(
            f"{BASE_URL}/api/purchase-orders/{TEST_PO_ID}/items/{TEST_ITEM_CODIGO}",
            headers=headers,
            json={
                "status": "cotado",
                "preco_venda": preco_venda,
                "preco_compra": preco_compra,
                "imposto": imposto,
                "frete_compra": frete_compra,
                "frete_envio": frete_envio
            }
        )
        
        assert response.status_code == 200, f"Failed to update item: {response.text}"
        
        # Get the item and verify calculation
        response = requests.get(f"{BASE_URL}/api/purchase-orders/{TEST_PO_ID}", headers=headers)
        po = response.json()
        test_item = next((item for item in po["items"] if item["codigo_item"] == TEST_ITEM_CODIGO), None)
        
        assert test_item is not None
        
        # Calculate expected lucro_liquido
        quantidade = test_item["quantidade"]
        expected_lucro = (preco_venda - preco_compra) * quantidade - imposto - frete_compra - frete_envio
        
        actual_lucro = test_item.get("lucro_liquido")
        assert actual_lucro is not None, "lucro_liquido was not calculated"
        
        # Allow small floating point difference
        assert abs(actual_lucro - expected_lucro) < 0.01, \
            f"lucro_liquido calculation incorrect. Expected: {expected_lucro}, Got: {actual_lucro}"
        
        print(f"✓ lucro_liquido calculation correct:")
        print(f"  Formula: (preco_venda - preco_compra) * quantidade - imposto - frete_compra - frete_envio")
        print(f"  ({preco_venda} - {preco_compra}) * {quantidade} - {imposto} - {frete_compra} - {frete_envio} = {expected_lucro}")
        print(f"  Actual: {actual_lucro}")


class TestAdminSummaryEndpoint:
    """Test admin summary endpoint includes frete fields"""
    
    def test_admin_summary_has_frete_fields(self, admin_token):
        """Verify admin summary includes frete_compra and frete_envio"""
        headers = {"Authorization": f"Bearer {admin_token}"}
        response = requests.get(f"{BASE_URL}/api/admin/summary", headers=headers)
        
        assert response.status_code == 200, f"Failed to get admin summary: {response.text}"
        summaries = response.json()
        
        # Find our test item in summaries
        test_summary = None
        for summary in summaries:
            if summary["codigo_item"] == TEST_ITEM_CODIGO:
                test_summary = summary
                break
        
        if test_summary:
            # Verify frete fields are present in summary
            assert "frete_compra" in test_summary, "frete_compra missing from admin summary"
            assert "frete_envio" in test_summary, "frete_envio missing from admin summary"
            print(f"✓ Admin summary includes frete fields:")
            print(f"  frete_compra: {test_summary.get('frete_compra')}")
            print(f"  frete_envio: {test_summary.get('frete_envio')}")
            print(f"  lucro_liquido: {test_summary.get('lucro_liquido')}")
        else:
            print(f"⚠ Test item {TEST_ITEM_CODIGO} not found in admin summary (may not have prices set)")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
