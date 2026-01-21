"""
Test suite for FIEP OC Management System - Estoque Bug Fixes
Tests the following bug fixes:
1. Estoque zerado mesmo com itens comprados em excesso
2. Cálculo de lucro incorreto usando quantidade comprada ao invés da necessária
3. Falta de indicador de estoque disponível em itens pendentes

Test OC: c885f4bb-fc52-44f4-b064-1503707b994a (OC-2.118938)
Test Item: 114641 (20 unidades compradas, 1 necessária)
Expected: 19 unidades em estoque, lucro ~R$ 1.532,58
"""

import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

# Test credentials
ADMIN_EMAIL = "projetos.onsolucoes@gmail.com"
ADMIN_PASSWORD = "on123456"

# Test data
TEST_OC_ID = "c885f4bb-fc52-44f4-b064-1503707b994a"
TEST_ITEM_CODIGO = "114641"
EXPECTED_QUANTIDADE_COMPRADA = 20
EXPECTED_QUANTIDADE_NECESSARIA = 1
EXPECTED_ESTOQUE = 19  # 20 - 1 = 19
EXPECTED_LUCRO_APPROX = 1532.58  # Calculated with quantidade_necessaria


@pytest.fixture(scope="module")
def auth_token():
    """Get authentication token for admin user"""
    response = requests.post(
        f"{BASE_URL}/api/auth/login",
        json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD}
    )
    assert response.status_code == 200, f"Login failed: {response.text}"
    return response.json()["access_token"]


@pytest.fixture(scope="module")
def api_client(auth_token):
    """Create authenticated API client"""
    session = requests.Session()
    session.headers.update({
        "Authorization": f"Bearer {auth_token}",
        "Content-Type": "application/json"
    })
    return session


class TestEstoqueEndpoint:
    """Tests for /api/estoque endpoint - Bug #1: Estoque zerado"""
    
    def test_estoque_endpoint_returns_200(self, api_client):
        """Test that estoque endpoint returns 200"""
        response = api_client.get(f"{BASE_URL}/api/estoque")
        assert response.status_code == 200
        print("✓ /api/estoque returns 200")
    
    def test_estoque_has_items(self, api_client):
        """Test that estoque has items when there are excess purchases"""
        response = api_client.get(f"{BASE_URL}/api/estoque")
        data = response.json()
        
        assert "estoque" in data
        assert "total_itens_diferentes" in data
        assert data["total_itens_diferentes"] >= 1, "Should have at least 1 item in stock"
        print(f"✓ Estoque has {data['total_itens_diferentes']} different items")
    
    def test_estoque_item_114641_exists(self, api_client):
        """Test that item 114641 appears in estoque with correct quantity"""
        response = api_client.get(f"{BASE_URL}/api/estoque")
        data = response.json()
        
        # Find item 114641
        item_114641 = None
        for item in data["estoque"]:
            if item["codigo_item"] == TEST_ITEM_CODIGO:
                item_114641 = item
                break
        
        assert item_114641 is not None, f"Item {TEST_ITEM_CODIGO} should be in estoque"
        assert item_114641["quantidade_estoque"] == EXPECTED_ESTOQUE, \
            f"Expected {EXPECTED_ESTOQUE} units in stock, got {item_114641['quantidade_estoque']}"
        print(f"✓ Item {TEST_ITEM_CODIGO} has {item_114641['quantidade_estoque']} units in stock")
    
    def test_estoque_item_has_origin_oc(self, api_client):
        """Test that estoque item shows origin OC"""
        response = api_client.get(f"{BASE_URL}/api/estoque")
        data = response.json()
        
        item_114641 = next((i for i in data["estoque"] if i["codigo_item"] == TEST_ITEM_CODIGO), None)
        assert item_114641 is not None
        
        assert "ocs_origem" in item_114641
        assert len(item_114641["ocs_origem"]) >= 1
        
        origin = item_114641["ocs_origem"][0]
        assert origin["numero_oc"] == "OC-2.118938"
        assert origin["quantidade_comprada"] == EXPECTED_QUANTIDADE_COMPRADA
        assert origin["quantidade_necessaria"] == EXPECTED_QUANTIDADE_NECESSARIA
        assert origin["excedente"] == EXPECTED_ESTOQUE
        print(f"✓ Item {TEST_ITEM_CODIGO} origin OC: {origin['numero_oc']}")


class TestEstoqueMapaEndpoint:
    """Tests for /api/estoque/mapa endpoint - Bug #3: Indicador de estoque"""
    
    def test_estoque_mapa_returns_200(self, api_client):
        """Test that estoque/mapa endpoint returns 200"""
        response = api_client.get(f"{BASE_URL}/api/estoque/mapa")
        assert response.status_code == 200
        print("✓ /api/estoque/mapa returns 200")
    
    def test_estoque_mapa_returns_dict(self, api_client):
        """Test that estoque/mapa returns a dictionary"""
        response = api_client.get(f"{BASE_URL}/api/estoque/mapa")
        data = response.json()
        
        assert isinstance(data, dict), "Response should be a dictionary"
        print(f"✓ /api/estoque/mapa returns dict with {len(data)} items")
    
    def test_estoque_mapa_has_item_114641(self, api_client):
        """Test that estoque/mapa includes item 114641 with correct quantity"""
        response = api_client.get(f"{BASE_URL}/api/estoque/mapa")
        data = response.json()
        
        assert TEST_ITEM_CODIGO in data, f"Item {TEST_ITEM_CODIGO} should be in estoque mapa"
        assert data[TEST_ITEM_CODIGO] == EXPECTED_ESTOQUE, \
            f"Expected {EXPECTED_ESTOQUE} units, got {data[TEST_ITEM_CODIGO]}"
        print(f"✓ Estoque mapa has {TEST_ITEM_CODIGO}: {data[TEST_ITEM_CODIGO]} units")


class TestLucroCalculation:
    """Tests for lucro calculation - Bug #2: Lucro incorreto"""
    
    def test_get_oc_with_item_114641(self, api_client):
        """Test that we can get the OC with item 114641"""
        response = api_client.get(f"{BASE_URL}/api/purchase-orders/{TEST_OC_ID}")
        assert response.status_code == 200
        
        data = response.json()
        assert data["numero_oc"] == "OC-2.118938"
        print(f"✓ Got OC {data['numero_oc']}")
    
    def test_item_114641_lucro_is_positive(self, api_client):
        """Test that item 114641 has positive lucro (not negative)"""
        response = api_client.get(f"{BASE_URL}/api/purchase-orders/{TEST_OC_ID}")
        data = response.json()
        
        # Find item 114641
        item_114641 = None
        for item in data["items"]:
            if item["codigo_item"] == TEST_ITEM_CODIGO:
                item_114641 = item
                break
        
        assert item_114641 is not None, f"Item {TEST_ITEM_CODIGO} not found in OC"
        
        lucro = item_114641.get("lucro_liquido")
        assert lucro is not None, "Lucro should be calculated"
        assert lucro > 0, f"Lucro should be positive, got {lucro}"
        print(f"✓ Item {TEST_ITEM_CODIGO} lucro: R$ {lucro:.2f} (positive)")
    
    def test_item_114641_lucro_is_correct(self, api_client):
        """Test that item 114641 lucro is approximately R$ 1.532,58"""
        response = api_client.get(f"{BASE_URL}/api/purchase-orders/{TEST_OC_ID}")
        data = response.json()
        
        item_114641 = next((i for i in data["items"] if i["codigo_item"] == TEST_ITEM_CODIGO), None)
        assert item_114641 is not None
        
        lucro = item_114641.get("lucro_liquido")
        
        # Allow 1% tolerance for rounding
        tolerance = EXPECTED_LUCRO_APPROX * 0.01
        assert abs(lucro - EXPECTED_LUCRO_APPROX) < tolerance, \
            f"Expected lucro ~{EXPECTED_LUCRO_APPROX}, got {lucro}"
        print(f"✓ Item {TEST_ITEM_CODIGO} lucro: R$ {lucro:.2f} (expected ~R$ {EXPECTED_LUCRO_APPROX:.2f})")
    
    def test_lucro_uses_quantidade_necessaria(self, api_client):
        """Test that lucro is calculated using quantidade necessária, not comprada"""
        response = api_client.get(f"{BASE_URL}/api/purchase-orders/{TEST_OC_ID}")
        data = response.json()
        
        item_114641 = next((i for i in data["items"] if i["codigo_item"] == TEST_ITEM_CODIGO), None)
        assert item_114641 is not None
        
        # Get values
        preco_venda = item_114641.get("preco_venda", 0)
        quantidade_necessaria = item_114641.get("quantidade", 0)
        fontes = item_114641.get("fontes_compra", [])
        
        # Calculate expected lucro using quantidade_necessaria
        if fontes:
            total_qtd_comprada = sum(f.get("quantidade", 0) for f in fontes)
            total_custo = sum(f.get("quantidade", 0) * f.get("preco_unitario", 0) for f in fontes)
            total_frete = sum(f.get("frete", 0) for f in fontes)
            
            if total_qtd_comprada > 0:
                custo_unitario = total_custo / total_qtd_comprada
                custo_para_venda = custo_unitario * quantidade_necessaria
                frete_proporcional = (total_frete / total_qtd_comprada) * quantidade_necessaria
            else:
                custo_para_venda = 0
                frete_proporcional = 0
        else:
            custo_para_venda = item_114641.get("preco_compra", 0) * quantidade_necessaria
            frete_proporcional = item_114641.get("frete_compra", 0)
        
        receita = preco_venda * quantidade_necessaria
        impostos = receita * 0.11
        frete_envio = item_114641.get("frete_envio", 0) or 0
        
        expected_lucro = receita - custo_para_venda - frete_proporcional - impostos - frete_envio
        actual_lucro = item_114641.get("lucro_liquido", 0)
        
        # Allow small tolerance for rounding
        assert abs(actual_lucro - expected_lucro) < 1, \
            f"Lucro calculation mismatch. Expected {expected_lucro:.2f}, got {actual_lucro:.2f}"
        
        print(f"✓ Lucro calculation verified:")
        print(f"  - Receita: R$ {receita:.2f} (preco_venda × quantidade_necessaria)")
        print(f"  - Custo: R$ {custo_para_venda:.2f}")
        print(f"  - Impostos: R$ {impostos:.2f}")
        print(f"  - Lucro: R$ {actual_lucro:.2f}")


class TestPlanilhaItensEndpoint:
    """Tests for /api/planilha-itens endpoint"""
    
    def test_planilha_itens_returns_200(self, api_client):
        """Test that planilha-itens endpoint returns 200"""
        response = api_client.get(f"{BASE_URL}/api/planilha-itens")
        assert response.status_code == 200
        print("✓ /api/planilha-itens returns 200")
    
    def test_planilha_itens_has_statistics(self, api_client):
        """Test that planilha-itens returns statistics"""
        response = api_client.get(f"{BASE_URL}/api/planilha-itens")
        data = response.json()
        
        assert "estatisticas" in data
        stats = data["estatisticas"]
        
        assert "total_itens_diferentes" in stats
        assert "total_quantidade_necessaria" in stats
        assert "total_quantidade_comprada" in stats
        assert "total_quantidade_faltante" in stats
        assert "percentual_comprado" in stats
        
        print(f"✓ Planilha statistics:")
        print(f"  - Itens diferentes: {stats['total_itens_diferentes']}")
        print(f"  - Qtd necessária: {stats['total_quantidade_necessaria']}")
        print(f"  - Qtd comprada: {stats['total_quantidade_comprada']}")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
