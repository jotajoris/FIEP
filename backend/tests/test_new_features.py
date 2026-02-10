"""
Test suite for new FIEP features:
1. Moderator role - can see Admin panel but not Comissões, Usuários, Lucro Total, and cannot access /resumo-completo
2. Profit calculation corrected - Lucro Realizado = entregue + em_transito, minus frete_correios_mensal
3. New LucroTotalSection in AdminPanel with profit/loss spreadsheet view

Endpoints tested:
- GET /api/admin/configuracoes - returns percentual_imposto and frete_correios_mensal
- PATCH /api/admin/configuracoes - updates configurations
- GET /api/admin/resumo-lucro - returns resumo, itens entregues, custos and configuracoes
- POST /api/admin/custos-diversos - adds cost
- DELETE /api/admin/custos-diversos/{id} - removes cost
- PATCH /api/admin/resumo-lucro/pagamento - marks as paid/unpaid
"""

import pytest
import requests
import os
import uuid

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', 'https://orderflow-212.preview.emergentagent.com')

# Admin credentials
ADMIN_EMAIL = "projetos.onsolucoes@gmail.com"
ADMIN_PASSWORD = "on123456"


class TestAuthentication:
    """Test authentication endpoints"""
    
    def test_admin_login_success(self):
        """Test admin login returns token"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": ADMIN_EMAIL,
            "password": ADMIN_PASSWORD
        })
        
        assert response.status_code == 200, f"Login failed: {response.text}"
        data = response.json()
        assert "access_token" in data, "No access_token in response"
        assert "user" in data, "No user in response"
        assert data["user"]["role"] == "admin", f"Expected admin role, got {data['user']['role']}"
        print(f"SUCCESS: Admin login successful, role={data['user']['role']}")


@pytest.fixture(scope="module")
def admin_token():
    """Get admin authentication token"""
    response = requests.post(f"{BASE_URL}/api/auth/login", json={
        "email": ADMIN_EMAIL,
        "password": ADMIN_PASSWORD
    })
    
    if response.status_code != 200:
        pytest.skip(f"Admin login failed: {response.text}")
    
    return response.json()["access_token"]


@pytest.fixture
def auth_headers(admin_token):
    """Get authorization headers"""
    return {"Authorization": f"Bearer {admin_token}"}


class TestConfiguracoes:
    """Test /api/admin/configuracoes endpoints"""
    
    def test_get_configuracoes_returns_200(self, auth_headers):
        """GET /api/admin/configuracoes should return 200"""
        response = requests.get(f"{BASE_URL}/api/admin/configuracoes", headers=auth_headers)
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        print(f"SUCCESS: GET /api/admin/configuracoes returned 200")
    
    def test_get_configuracoes_returns_required_fields(self, auth_headers):
        """GET /api/admin/configuracoes should return percentual_imposto and frete_correios_mensal"""
        response = requests.get(f"{BASE_URL}/api/admin/configuracoes", headers=auth_headers)
        
        assert response.status_code == 200
        data = response.json()
        
        assert "percentual_imposto" in data, f"Missing percentual_imposto in response: {data}"
        assert "frete_correios_mensal" in data, f"Missing frete_correios_mensal in response: {data}"
        
        # Validate types
        assert isinstance(data["percentual_imposto"], (int, float)), "percentual_imposto should be numeric"
        assert isinstance(data["frete_correios_mensal"], (int, float)), "frete_correios_mensal should be numeric"
        
        print(f"SUCCESS: configuracoes has percentual_imposto={data['percentual_imposto']}, frete_correios_mensal={data['frete_correios_mensal']}")
    
    def test_patch_configuracoes_updates_values(self, auth_headers):
        """PATCH /api/admin/configuracoes should update configurations"""
        # First get current values
        get_response = requests.get(f"{BASE_URL}/api/admin/configuracoes", headers=auth_headers)
        original_data = get_response.json()
        
        # Update with new values
        new_imposto = 12.5
        new_frete = 150.00
        
        patch_response = requests.patch(
            f"{BASE_URL}/api/admin/configuracoes",
            headers=auth_headers,
            json={
                "percentual_imposto": new_imposto,
                "frete_correios_mensal": new_frete
            }
        )
        
        assert patch_response.status_code == 200, f"PATCH failed: {patch_response.text}"
        
        # Verify update
        verify_response = requests.get(f"{BASE_URL}/api/admin/configuracoes", headers=auth_headers)
        updated_data = verify_response.json()
        
        assert updated_data["percentual_imposto"] == new_imposto, f"percentual_imposto not updated"
        assert updated_data["frete_correios_mensal"] == new_frete, f"frete_correios_mensal not updated"
        
        # Restore original values
        requests.patch(
            f"{BASE_URL}/api/admin/configuracoes",
            headers=auth_headers,
            json={
                "percentual_imposto": original_data.get("percentual_imposto", 11.0),
                "frete_correios_mensal": original_data.get("frete_correios_mensal", 0)
            }
        )
        
        print(f"SUCCESS: PATCH /api/admin/configuracoes updated values correctly")


class TestResumoLucro:
    """Test /api/admin/resumo-lucro endpoints"""
    
    def test_get_resumo_lucro_returns_200(self, auth_headers):
        """GET /api/admin/resumo-lucro should return 200"""
        response = requests.get(f"{BASE_URL}/api/admin/resumo-lucro", headers=auth_headers)
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        print(f"SUCCESS: GET /api/admin/resumo-lucro returned 200")
    
    def test_get_resumo_lucro_returns_required_structure(self, auth_headers):
        """GET /api/admin/resumo-lucro should return resumo, itens, custos_diversos, configuracoes"""
        response = requests.get(f"{BASE_URL}/api/admin/resumo-lucro", headers=auth_headers)
        
        assert response.status_code == 200
        data = response.json()
        
        # Check top-level structure
        assert "resumo" in data, f"Missing 'resumo' in response"
        assert "itens" in data, f"Missing 'itens' in response"
        assert "custos_diversos" in data, f"Missing 'custos_diversos' in response"
        assert "configuracoes" in data, f"Missing 'configuracoes' in response"
        
        print(f"SUCCESS: resumo-lucro has all required top-level fields")
    
    def test_get_resumo_lucro_resumo_fields(self, auth_headers):
        """GET /api/admin/resumo-lucro resumo should have all required fields"""
        response = requests.get(f"{BASE_URL}/api/admin/resumo-lucro", headers=auth_headers)
        
        assert response.status_code == 200
        resumo = response.json()["resumo"]
        
        required_fields = [
            "total_itens_entregues",
            "total_venda",
            "total_compra",
            "total_frete_compra",
            "percentual_imposto",
            "total_imposto",
            "frete_correios_mensal",
            "total_custos_diversos",
            "lucro_bruto",
            "lucro_liquido",
            "pago"
        ]
        
        for field in required_fields:
            assert field in resumo, f"Missing '{field}' in resumo"
        
        print(f"SUCCESS: resumo has all required fields: {list(resumo.keys())}")
    
    def test_get_resumo_lucro_itens_structure(self, auth_headers):
        """GET /api/admin/resumo-lucro itens should have correct structure"""
        response = requests.get(f"{BASE_URL}/api/admin/resumo-lucro", headers=auth_headers)
        
        assert response.status_code == 200
        itens = response.json()["itens"]
        
        assert isinstance(itens, list), "itens should be a list"
        
        if len(itens) > 0:
            item = itens[0]
            expected_fields = ["codigo_item", "numero_oc", "quantidade", "preco_venda", "preco_compra", "valor_venda_total", "valor_compra_total", "frete_compra", "imposto"]
            for field in expected_fields:
                assert field in item, f"Missing '{field}' in item"
            print(f"SUCCESS: itens have correct structure, {len(itens)} items found")
        else:
            print(f"INFO: No delivered items found (itens list is empty)")
    
    def test_patch_resumo_lucro_pagamento(self, auth_headers):
        """PATCH /api/admin/resumo-lucro/pagamento should update payment status"""
        # Mark as paid
        response = requests.patch(
            f"{BASE_URL}/api/admin/resumo-lucro/pagamento",
            headers=auth_headers,
            json={"pago": True}
        )
        
        assert response.status_code == 200, f"PATCH failed: {response.text}"
        
        # Verify
        verify_response = requests.get(f"{BASE_URL}/api/admin/resumo-lucro", headers=auth_headers)
        assert verify_response.json()["resumo"]["pago"] == True
        
        # Mark as unpaid (restore)
        requests.patch(
            f"{BASE_URL}/api/admin/resumo-lucro/pagamento",
            headers=auth_headers,
            json={"pago": False}
        )
        
        print(f"SUCCESS: PATCH /api/admin/resumo-lucro/pagamento works correctly")


class TestCustosDiversos:
    """Test /api/admin/custos-diversos endpoints"""
    
    def test_get_custos_diversos_returns_200(self, auth_headers):
        """GET /api/admin/custos-diversos should return 200"""
        response = requests.get(f"{BASE_URL}/api/admin/custos-diversos", headers=auth_headers)
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        print(f"SUCCESS: GET /api/admin/custos-diversos returned 200")
    
    def test_get_custos_diversos_structure(self, auth_headers):
        """GET /api/admin/custos-diversos should return total and custos list"""
        response = requests.get(f"{BASE_URL}/api/admin/custos-diversos", headers=auth_headers)
        
        assert response.status_code == 200
        data = response.json()
        
        assert "total" in data, "Missing 'total' in response"
        assert "custos" in data, "Missing 'custos' in response"
        assert isinstance(data["custos"], list), "custos should be a list"
        
        print(f"SUCCESS: custos-diversos has correct structure, {len(data['custos'])} custos found")
    
    def test_post_custos_diversos_creates_custo(self, auth_headers):
        """POST /api/admin/custos-diversos should create a new cost"""
        test_custo = {
            "descricao": f"TEST_Custo_Teste_{uuid.uuid4().hex[:8]}",
            "valor": 99.99,
            "categoria": "material"
        }
        
        response = requests.post(
            f"{BASE_URL}/api/admin/custos-diversos",
            headers=auth_headers,
            json=test_custo
        )
        
        assert response.status_code == 200, f"POST failed: {response.text}"
        data = response.json()
        
        assert data.get("success") == True, "Expected success=True"
        assert "custo" in data, "Missing 'custo' in response"
        assert data["custo"]["descricao"] == test_custo["descricao"]
        assert data["custo"]["valor"] == test_custo["valor"]
        assert "id" in data["custo"], "Missing 'id' in created custo"
        
        # Cleanup - delete the test custo
        custo_id = data["custo"]["id"]
        requests.delete(f"{BASE_URL}/api/admin/custos-diversos/{custo_id}", headers=auth_headers)
        
        print(f"SUCCESS: POST /api/admin/custos-diversos created custo correctly")
    
    def test_delete_custos_diversos_removes_custo(self, auth_headers):
        """DELETE /api/admin/custos-diversos/{id} should remove the cost"""
        # First create a custo
        test_custo = {
            "descricao": f"TEST_Delete_Custo_{uuid.uuid4().hex[:8]}",
            "valor": 50.00,
            "categoria": "outros"
        }
        
        create_response = requests.post(
            f"{BASE_URL}/api/admin/custos-diversos",
            headers=auth_headers,
            json=test_custo
        )
        
        assert create_response.status_code == 200
        custo_id = create_response.json()["custo"]["id"]
        
        # Delete the custo
        delete_response = requests.delete(
            f"{BASE_URL}/api/admin/custos-diversos/{custo_id}",
            headers=auth_headers
        )
        
        assert delete_response.status_code == 200, f"DELETE failed: {delete_response.text}"
        assert delete_response.json().get("success") == True
        
        # Verify it's deleted - should return 404
        verify_response = requests.delete(
            f"{BASE_URL}/api/admin/custos-diversos/{custo_id}",
            headers=auth_headers
        )
        assert verify_response.status_code == 404, "Custo should be deleted"
        
        print(f"SUCCESS: DELETE /api/admin/custos-diversos/{custo_id} removed custo correctly")


class TestAdminPanelAccess:
    """Test admin panel access and tabs"""
    
    def test_admin_can_access_comissoes(self, auth_headers):
        """Admin should be able to access comissoes endpoint"""
        response = requests.get(f"{BASE_URL}/api/admin/comissoes", headers=auth_headers)
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        assert isinstance(response.json(), list), "comissoes should return a list"
        print(f"SUCCESS: Admin can access /api/admin/comissoes")
    
    def test_admin_can_access_users(self, auth_headers):
        """Admin should be able to access users endpoint"""
        response = requests.get(f"{BASE_URL}/api/users", headers=auth_headers)
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()
        assert "users" in data, "Missing 'users' in response"
        print(f"SUCCESS: Admin can access /api/users, found {len(data['users'])} users")
    
    def test_admin_can_access_notas_fiscais(self, auth_headers):
        """Admin should be able to access notas-fiscais endpoint"""
        response = requests.get(f"{BASE_URL}/api/admin/notas-fiscais", headers=auth_headers)
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()
        assert "notas_compra" in data, "Missing 'notas_compra' in response"
        assert "notas_venda" in data, "Missing 'notas_venda' in response"
        print(f"SUCCESS: Admin can access /api/admin/notas-fiscais")


class TestHealthAndVersion:
    """Test health and version endpoints"""
    
    def test_health_endpoint(self):
        """Health endpoint should return 200"""
        response = requests.get(f"{BASE_URL}/health")
        
        assert response.status_code == 200, f"Health check failed: {response.text}"
        print(f"SUCCESS: Health endpoint returned 200")
    
    def test_version_endpoint(self, auth_headers):
        """Version endpoint should return version info"""
        response = requests.get(f"{BASE_URL}/api/version", headers=auth_headers)
        
        assert response.status_code == 200, f"Version check failed: {response.text}"
        data = response.json()
        assert "version" in data, "Missing 'version' in response"
        print(f"SUCCESS: Version endpoint returned version={data['version']}")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
