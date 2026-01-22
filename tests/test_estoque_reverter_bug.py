"""
Test suite for P0 Bug Fix: Estoque reversal when item status changes from 'comprado' to 'pendente'

Bug Description:
When an item was reverted from 'comprado' to 'pendente', the fields quantidade_usada_estoque 
and estoque_usado_em in the origin OC were not being cleared, causing data corruption.

Test Data:
- OC Origem: OC-2.118938 (po_id: c885f4bb-fc52-44f4-b064-1503707b994a)
  - Item 114641: comprado 10, necessário 1, estoque disponível 9
- OC Destino: OC-2.118941 (po_id: 7e7e32af-96a1-4d7f-a474-c341b4344e01)
  - Item 114641: pendente, necessita 2

Tests:
1. Verify estoque shows correct quantity (9 UN) after data cleanup
2. Test complete flow: use estoque -> verify estoque decreased -> revert to pendente -> verify estoque restored
3. Test 'Corrigir Dados' button endpoint
4. Verify fields atendido_por_estoque, quantidade_do_estoque, estoque_origem are cleared on status revert
"""

import pytest
import requests
import os
import time

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

# Test data
OC_ORIGEM_ID = "c885f4bb-fc52-44f4-b064-1503707b994a"
OC_ORIGEM_NUMERO = "OC-2.118938"
OC_DESTINO_ID = "7e7e32af-96a1-4d7f-a474-c341b4344e01"
OC_DESTINO_NUMERO = "OC-2.118941"
CODIGO_ITEM = "114641"

# Credentials
ADMIN_EMAIL = "projetos.onsolucoes@gmail.com"
ADMIN_PASSWORD = "on123456"


@pytest.fixture(scope="module")
def auth_token():
    """Get authentication token"""
    response = requests.post(f"{BASE_URL}/api/auth/login", json={
        "email": ADMIN_EMAIL,
        "password": ADMIN_PASSWORD
    })
    assert response.status_code == 200, f"Login failed: {response.text}"
    return response.json().get("access_token")


@pytest.fixture(scope="module")
def api_client(auth_token):
    """Shared requests session with auth"""
    session = requests.Session()
    session.headers.update({
        "Content-Type": "application/json",
        "Authorization": f"Bearer {auth_token}"
    })
    return session


class TestEstoqueQuantidadeCorreta:
    """Test 1: Verify estoque shows correct quantity (9 UN)"""
    
    def test_estoque_endpoint_returns_200(self, api_client):
        """Estoque endpoint should return 200"""
        response = api_client.get(f"{BASE_URL}/api/estoque")
        assert response.status_code == 200
    
    def test_estoque_has_item_114641(self, api_client):
        """Estoque should have item 114641"""
        response = api_client.get(f"{BASE_URL}/api/estoque")
        data = response.json()
        
        estoque = data.get('estoque', [])
        item = next((i for i in estoque if i.get('codigo_item') == CODIGO_ITEM), None)
        
        assert item is not None, f"Item {CODIGO_ITEM} not found in estoque"
    
    def test_estoque_quantidade_correta(self, api_client):
        """Item 114641 should have 9 UN in estoque (10 compradas - 1 necessária)"""
        response = api_client.get(f"{BASE_URL}/api/estoque")
        data = response.json()
        
        estoque = data.get('estoque', [])
        item = next((i for i in estoque if i.get('codigo_item') == CODIGO_ITEM), None)
        
        assert item is not None
        # Estoque = quantidade_comprada - quantidade_necessaria - quantidade_usada_estoque
        # Expected: 10 - 1 - 0 = 9
        assert item.get('quantidade_estoque') == 9, f"Expected 9 UN, got {item.get('quantidade_estoque')}"


class TestFluxoCompletoEstoque:
    """Test 2: Complete flow - use estoque -> verify decreased -> revert -> verify restored"""
    
    def test_01_verificar_estado_inicial_oc_destino(self, api_client):
        """Verify OC destino item is in pendente status"""
        response = api_client.get(f"{BASE_URL}/api/purchase-orders/{OC_DESTINO_ID}")
        assert response.status_code == 200
        
        po = response.json()
        item = next((i for i in po.get('items', []) if i.get('codigo_item') == CODIGO_ITEM), None)
        
        assert item is not None, f"Item {CODIGO_ITEM} not found in OC destino"
        assert item.get('status') == 'pendente', f"Item should be pendente, got {item.get('status')}"
    
    def test_02_usar_estoque(self, api_client):
        """Use estoque to fulfill item in OC destino"""
        # Find item index in OC destino
        response = api_client.get(f"{BASE_URL}/api/purchase-orders/{OC_DESTINO_ID}")
        po = response.json()
        
        item_index = None
        for idx, item in enumerate(po.get('items', [])):
            if item.get('codigo_item') == CODIGO_ITEM:
                item_index = idx
                break
        
        assert item_index is not None, f"Item {CODIGO_ITEM} not found"
        
        # Use estoque
        response = api_client.post(f"{BASE_URL}/api/estoque/usar", json={
            "po_id": OC_DESTINO_ID,
            "item_index": item_index,
            "quantidade_usar": 2  # Item needs 2 units
        })
        
        assert response.status_code == 200, f"Failed to use estoque: {response.text}"
        
        data = response.json()
        assert data.get('success') == True
        assert data.get('quantidade_usada') == 2
        assert data.get('atendido_totalmente') == True
    
    def test_03_verificar_estoque_diminuiu(self, api_client):
        """Verify estoque decreased after using"""
        response = api_client.get(f"{BASE_URL}/api/estoque")
        data = response.json()
        
        estoque = data.get('estoque', [])
        item = next((i for i in estoque if i.get('codigo_item') == CODIGO_ITEM), None)
        
        assert item is not None
        # After using 2 units: 10 - 1 - 2 = 7
        assert item.get('quantidade_estoque') == 7, f"Expected 7 UN after using 2, got {item.get('quantidade_estoque')}"
    
    def test_04_verificar_item_destino_comprado(self, api_client):
        """Verify item in OC destino is now 'comprado' with estoque data"""
        response = api_client.get(f"{BASE_URL}/api/purchase-orders/{OC_DESTINO_ID}")
        po = response.json()
        
        item = next((i for i in po.get('items', []) if i.get('codigo_item') == CODIGO_ITEM), None)
        
        assert item is not None
        assert item.get('status') == 'comprado', f"Item should be comprado, got {item.get('status')}"
        assert item.get('atendido_por_estoque') == True
        assert item.get('quantidade_do_estoque') == 2
        assert len(item.get('estoque_origem', [])) > 0
    
    def test_05_verificar_oc_origem_registrou_uso(self, api_client):
        """Verify OC origem registered the estoque usage"""
        response = api_client.get(f"{BASE_URL}/api/purchase-orders/{OC_ORIGEM_ID}")
        po = response.json()
        
        item = next((i for i in po.get('items', []) if i.get('codigo_item') == CODIGO_ITEM), None)
        
        assert item is not None
        assert item.get('quantidade_usada_estoque') == 2, f"Expected quantidade_usada_estoque=2, got {item.get('quantidade_usada_estoque')}"
        
        estoque_usado_em = item.get('estoque_usado_em', [])
        assert len(estoque_usado_em) > 0, "estoque_usado_em should have entries"
        
        # Verify it points to OC destino
        uso = estoque_usado_em[0]
        assert uso.get('po_id') == OC_DESTINO_ID
    
    def test_06_reverter_para_pendente(self, api_client):
        """Revert item status from 'comprado' to 'pendente'"""
        # Find item index
        response = api_client.get(f"{BASE_URL}/api/purchase-orders/{OC_DESTINO_ID}")
        po = response.json()
        
        item_index = None
        for idx, item in enumerate(po.get('items', [])):
            if item.get('codigo_item') == CODIGO_ITEM:
                item_index = idx
                break
        
        # Update status to pendente
        response = api_client.patch(
            f"{BASE_URL}/api/purchase-orders/{OC_DESTINO_ID}/items/by-index/{item_index}",
            json={"status": "pendente"}
        )
        
        assert response.status_code == 200, f"Failed to revert status: {response.text}"
    
    def test_07_verificar_estoque_restaurado(self, api_client):
        """Verify estoque was restored after reverting to pendente"""
        response = api_client.get(f"{BASE_URL}/api/estoque")
        data = response.json()
        
        estoque = data.get('estoque', [])
        item = next((i for i in estoque if i.get('codigo_item') == CODIGO_ITEM), None)
        
        assert item is not None
        # After reverting: should be back to 9 (10 - 1 - 0)
        assert item.get('quantidade_estoque') == 9, f"Expected 9 UN after revert, got {item.get('quantidade_estoque')}"
    
    def test_08_verificar_campos_limpos_item_destino(self, api_client):
        """Verify estoque fields were cleared in OC destino item"""
        response = api_client.get(f"{BASE_URL}/api/purchase-orders/{OC_DESTINO_ID}")
        po = response.json()
        
        item = next((i for i in po.get('items', []) if i.get('codigo_item') == CODIGO_ITEM), None)
        
        assert item is not None
        assert item.get('status') == 'pendente'
        assert item.get('atendido_por_estoque') == False, f"atendido_por_estoque should be False, got {item.get('atendido_por_estoque')}"
        assert item.get('quantidade_do_estoque', 0) == 0, f"quantidade_do_estoque should be 0, got {item.get('quantidade_do_estoque')}"
        assert len(item.get('estoque_origem', [])) == 0, f"estoque_origem should be empty, got {item.get('estoque_origem')}"
    
    def test_09_verificar_campos_limpos_oc_origem(self, api_client):
        """Verify estoque usage was cleared in OC origem (THE BUG FIX)"""
        response = api_client.get(f"{BASE_URL}/api/purchase-orders/{OC_ORIGEM_ID}")
        po = response.json()
        
        item = next((i for i in po.get('items', []) if i.get('codigo_item') == CODIGO_ITEM), None)
        
        assert item is not None
        # THIS IS THE BUG FIX: quantidade_usada_estoque should be 0 after revert
        assert item.get('quantidade_usada_estoque', 0) == 0, \
            f"BUG: quantidade_usada_estoque should be 0 after revert, got {item.get('quantidade_usada_estoque')}"
        
        # estoque_usado_em should not have entry for OC destino
        estoque_usado_em = item.get('estoque_usado_em', [])
        destino_entries = [u for u in estoque_usado_em if u.get('po_id') == OC_DESTINO_ID]
        assert len(destino_entries) == 0, \
            f"BUG: estoque_usado_em should not have entry for OC destino, got {destino_entries}"


class TestCorrigirDadosEndpoint:
    """Test 3: Test 'Corrigir Dados' button endpoint"""
    
    def test_limpar_dados_inconsistentes_endpoint(self, api_client):
        """Test POST /api/admin/limpar-dados-estoque-inconsistentes"""
        response = api_client.post(f"{BASE_URL}/api/admin/limpar-dados-estoque-inconsistentes")
        
        assert response.status_code == 200, f"Endpoint failed: {response.text}"
        
        data = response.json()
        assert data.get('success') == True
        assert 'itens_corrigidos' in data
        assert 'detalhes' in data


class TestCamposLimposAoReverter:
    """Test 4: Verify fields are cleared when reverting status"""
    
    def test_campos_estoque_limpos_em_pendente(self, api_client):
        """Verify all estoque fields are cleared when item is in pendente status"""
        response = api_client.get(f"{BASE_URL}/api/purchase-orders/{OC_DESTINO_ID}")
        po = response.json()
        
        item = next((i for i in po.get('items', []) if i.get('codigo_item') == CODIGO_ITEM), None)
        
        assert item is not None
        
        # All these fields should be cleared/false/empty for pendente items
        assert item.get('atendido_por_estoque') in [False, None], \
            f"atendido_por_estoque should be False/None, got {item.get('atendido_por_estoque')}"
        
        assert item.get('quantidade_do_estoque', 0) == 0, \
            f"quantidade_do_estoque should be 0, got {item.get('quantidade_do_estoque')}"
        
        assert len(item.get('estoque_origem', [])) == 0, \
            f"estoque_origem should be empty, got {item.get('estoque_origem')}"
        
        assert item.get('parcialmente_atendido_estoque') in [False, None], \
            f"parcialmente_atendido_estoque should be False/None, got {item.get('parcialmente_atendido_estoque')}"


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
