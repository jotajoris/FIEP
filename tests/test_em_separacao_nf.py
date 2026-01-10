"""
Test suite for 'Em Separação' page functionality:
- NF (Nota Fiscal) upload/download/delete for fornecedor and revenda
- NCM extraction from XML and PDF
- Endereco (address) editing
- NF Emitida checkbox toggle
"""
import pytest
import requests
import os
import base64

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

# Test credentials
ADMIN_EMAIL = "projetos.onsolucoes@gmail.com"
ADMIN_PASSWORD = "on123456"

# Test data - PO with item in 'em_separacao' status
TEST_PO_ID = "c885f4bb-fc52-44f4-b064-1503707b994a"
TEST_ITEM_INDEX = 0  # First item in the PO

# Sample XML NFe with NCM
SAMPLE_XML_NFE = """<?xml version="1.0" encoding="UTF-8"?>
<nfeProc xmlns="http://www.portalfiscal.inf.br/nfe" versao="4.00">
  <NFe xmlns="http://www.portalfiscal.inf.br/nfe">
    <infNFe Id="NFe12345678901234567890123456789012345678901234" versao="4.00">
      <det nItem="1">
        <prod>
          <cProd>TEST001</cProd>
          <xProd>PRODUTO TESTE</xProd>
          <NCM>12345678</NCM>
          <CFOP>5102</CFOP>
          <uCom>UN</uCom>
          <qCom>1</qCom>
          <vUnCom>100.00</vUnCom>
          <vProd>100.00</vProd>
        </prod>
      </det>
    </infNFe>
  </NFe>
</nfeProc>
"""


@pytest.fixture(scope="module")
def admin_token():
    """Get admin authentication token"""
    response = requests.post(
        f"{BASE_URL}/api/auth/login",
        json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD}
    )
    assert response.status_code == 200, f"Admin login failed: {response.text}"
    return response.json()["access_token"]


@pytest.fixture(scope="module")
def auth_headers(admin_token):
    """Get authorization headers"""
    return {"Authorization": f"Bearer {admin_token}"}


class TestEmSeparacaoPageLoad:
    """Test that items with 'em_separacao' status can be loaded"""
    
    def test_get_purchase_orders(self, auth_headers):
        """Test fetching purchase orders"""
        response = requests.get(f"{BASE_URL}/api/purchase-orders", headers=auth_headers)
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        
        # Find items with em_separacao status
        em_separacao_items = []
        for po in data:
            for item in po.get('items', []):
                if item.get('status') == 'em_separacao':
                    em_separacao_items.append({
                        'po_id': po['id'],
                        'codigo_item': item['codigo_item'],
                        'endereco_entrega': item.get('endereco_entrega', '')
                    })
        
        print(f"Found {len(em_separacao_items)} items with 'em_separacao' status")
        assert len(em_separacao_items) > 0, "No items with 'em_separacao' status found"
    
    def test_get_specific_po_with_em_separacao_item(self, auth_headers):
        """Test fetching specific PO with em_separacao item"""
        response = requests.get(f"{BASE_URL}/api/purchase-orders/{TEST_PO_ID}", headers=auth_headers)
        assert response.status_code == 200
        
        po = response.json()
        assert po['id'] == TEST_PO_ID
        
        # Check item has em_separacao status
        item = po['items'][TEST_ITEM_INDEX]
        assert item['status'] == 'em_separacao', f"Item status is {item['status']}, expected 'em_separacao'"
        
        # Verify endereco_entrega field exists
        assert 'endereco_entrega' in item, "endereco_entrega field missing"
        print(f"Item endereco_entrega: {item.get('endereco_entrega', 'N/A')}")


class TestEnderecoEntrega:
    """Test address editing functionality"""
    
    def test_update_endereco_entrega(self, auth_headers):
        """Test updating delivery address"""
        new_endereco = "RUA TESTE 123, CENTRO, CURITIBA - PR"
        
        response = requests.patch(
            f"{BASE_URL}/api/purchase-orders/{TEST_PO_ID}/items/by-index/{TEST_ITEM_INDEX}/endereco",
            json={"endereco": new_endereco},
            headers=auth_headers
        )
        assert response.status_code == 200
        data = response.json()
        assert data['success'] == True
        
        # Verify the update persisted
        response = requests.get(f"{BASE_URL}/api/purchase-orders/{TEST_PO_ID}", headers=auth_headers)
        assert response.status_code == 200
        item = response.json()['items'][TEST_ITEM_INDEX]
        assert item['endereco_entrega'] == new_endereco.upper()
        print(f"Endereco updated successfully to: {item['endereco_entrega']}")
    
    def test_restore_original_endereco(self, auth_headers):
        """Restore original address"""
        original_endereco = "AVENIDA EUCLIDES DA CUNHA DE 1071/1072 AO FIM, 1660, ZONA 05, MARINGA"
        
        response = requests.patch(
            f"{BASE_URL}/api/purchase-orders/{TEST_PO_ID}/items/by-index/{TEST_ITEM_INDEX}/endereco",
            json={"endereco": original_endereco},
            headers=auth_headers
        )
        assert response.status_code == 200


class TestNotasFiscaisFornecedor:
    """Test NF Fornecedor upload/download/delete"""
    
    def test_upload_nf_fornecedor_xml(self, auth_headers):
        """Test uploading XML NF for fornecedor with NCM extraction"""
        xml_base64 = base64.b64encode(SAMPLE_XML_NFE.encode('utf-8')).decode('utf-8')
        
        payload = {
            "filename": "nf_test_fornecedor.xml",
            "content_type": "text/xml",
            "file_data": xml_base64,
            "ncm_manual": None,
            "tipo": "fornecedor"
        }
        
        response = requests.post(
            f"{BASE_URL}/api/purchase-orders/{TEST_PO_ID}/items/by-index/{TEST_ITEM_INDEX}/notas-fiscais",
            json=payload,
            headers=auth_headers
        )
        assert response.status_code == 200
        data = response.json()
        assert data['success'] == True
        assert 'nf_id' in data
        assert data['ncm'] == '12345678', f"NCM extraction failed, got: {data['ncm']}"
        print(f"NF uploaded with ID: {data['nf_id']}, NCM extracted: {data['ncm']}")
        
        # Store NF ID for later tests
        pytest.nf_fornecedor_id = data['nf_id']
    
    def test_download_nf_fornecedor(self, auth_headers):
        """Test downloading NF fornecedor"""
        nf_id = getattr(pytest, 'nf_fornecedor_id', None)
        if not nf_id:
            pytest.skip("No NF ID from previous test")
        
        response = requests.get(
            f"{BASE_URL}/api/purchase-orders/{TEST_PO_ID}/items/by-index/{TEST_ITEM_INDEX}/notas-fiscais/{nf_id}/download",
            headers=auth_headers
        )
        assert response.status_code == 200
        data = response.json()
        assert 'file_data' in data
        assert 'filename' in data
        assert data['filename'] == 'nf_test_fornecedor.xml'
        print(f"NF downloaded successfully: {data['filename']}")
    
    def test_update_ncm_manually(self, auth_headers):
        """Test updating NCM manually"""
        nf_id = getattr(pytest, 'nf_fornecedor_id', None)
        if not nf_id:
            pytest.skip("No NF ID from previous test")
        
        new_ncm = "87654321"
        response = requests.patch(
            f"{BASE_URL}/api/purchase-orders/{TEST_PO_ID}/items/by-index/{TEST_ITEM_INDEX}/notas-fiscais/{nf_id}/ncm",
            json={"ncm": new_ncm},
            headers=auth_headers
        )
        assert response.status_code == 200
        data = response.json()
        assert data['success'] == True
        print(f"NCM updated to: {new_ncm}")
    
    def test_delete_nf_fornecedor(self, auth_headers):
        """Test deleting NF fornecedor"""
        nf_id = getattr(pytest, 'nf_fornecedor_id', None)
        if not nf_id:
            pytest.skip("No NF ID from previous test")
        
        response = requests.delete(
            f"{BASE_URL}/api/purchase-orders/{TEST_PO_ID}/items/by-index/{TEST_ITEM_INDEX}/notas-fiscais/{nf_id}?tipo=fornecedor",
            headers=auth_headers
        )
        assert response.status_code == 200
        data = response.json()
        assert data['success'] == True
        print("NF fornecedor deleted successfully")


class TestNotaFiscalRevenda:
    """Test NF Revenda upload/download/delete (single NF per item)"""
    
    def test_upload_nf_revenda(self, auth_headers):
        """Test uploading NF revenda"""
        xml_base64 = base64.b64encode(SAMPLE_XML_NFE.encode('utf-8')).decode('utf-8')
        
        payload = {
            "filename": "nf_revenda.xml",
            "content_type": "text/xml",
            "file_data": xml_base64,
            "ncm_manual": "99999999",  # Manual NCM
            "tipo": "revenda"
        }
        
        response = requests.post(
            f"{BASE_URL}/api/purchase-orders/{TEST_PO_ID}/items/by-index/{TEST_ITEM_INDEX}/notas-fiscais",
            json=payload,
            headers=auth_headers
        )
        assert response.status_code == 200
        data = response.json()
        assert data['success'] == True
        assert data['ncm'] == '99999999', "Manual NCM should be used"
        print(f"NF Revenda uploaded with ID: {data['nf_id']}")
        
        pytest.nf_revenda_id = data['nf_id']
    
    def test_verify_nf_revenda_stored(self, auth_headers):
        """Verify NF revenda is stored correctly"""
        response = requests.get(f"{BASE_URL}/api/purchase-orders/{TEST_PO_ID}", headers=auth_headers)
        assert response.status_code == 200
        
        item = response.json()['items'][TEST_ITEM_INDEX]
        assert item.get('nota_fiscal_revenda') is not None, "NF Revenda not stored"
        assert item['nota_fiscal_revenda']['filename'] == 'nf_revenda.xml'
        print("NF Revenda verified in database")
    
    def test_download_nf_revenda(self, auth_headers):
        """Test downloading NF revenda"""
        nf_id = getattr(pytest, 'nf_revenda_id', None)
        if not nf_id:
            pytest.skip("No NF ID from previous test")
        
        response = requests.get(
            f"{BASE_URL}/api/purchase-orders/{TEST_PO_ID}/items/by-index/{TEST_ITEM_INDEX}/notas-fiscais/{nf_id}/download",
            headers=auth_headers
        )
        assert response.status_code == 200
        data = response.json()
        assert data['filename'] == 'nf_revenda.xml'
        print("NF Revenda downloaded successfully")
    
    def test_delete_nf_revenda(self, auth_headers):
        """Test deleting NF revenda"""
        nf_id = getattr(pytest, 'nf_revenda_id', None)
        if not nf_id:
            pytest.skip("No NF ID from previous test")
        
        response = requests.delete(
            f"{BASE_URL}/api/purchase-orders/{TEST_PO_ID}/items/by-index/{TEST_ITEM_INDEX}/notas-fiscais/{nf_id}?tipo=revenda",
            headers=auth_headers
        )
        assert response.status_code == 200
        data = response.json()
        assert data['success'] == True
        print("NF Revenda deleted successfully")
    
    def test_verify_nf_revenda_deleted(self, auth_headers):
        """Verify NF revenda is deleted"""
        response = requests.get(f"{BASE_URL}/api/purchase-orders/{TEST_PO_ID}", headers=auth_headers)
        assert response.status_code == 200
        
        item = response.json()['items'][TEST_ITEM_INDEX]
        assert item.get('nota_fiscal_revenda') is None, "NF Revenda should be deleted"
        print("NF Revenda deletion verified")


class TestNFEmitidaCheckbox:
    """Test NF Emitida / Pronto para Despacho checkbox"""
    
    def test_toggle_nf_emitida_on(self, auth_headers):
        """Test setting NF emitida to true"""
        response = requests.patch(
            f"{BASE_URL}/api/purchase-orders/{TEST_PO_ID}/items/by-index/{TEST_ITEM_INDEX}/nf-emitida",
            json={"nf_emitida_pronto_despacho": True},
            headers=auth_headers
        )
        assert response.status_code == 200
        data = response.json()
        assert data['success'] == True
        
        # Verify
        response = requests.get(f"{BASE_URL}/api/purchase-orders/{TEST_PO_ID}", headers=auth_headers)
        item = response.json()['items'][TEST_ITEM_INDEX]
        assert item.get('nf_emitida_pronto_despacho') == True
        print("NF Emitida set to True")
    
    def test_toggle_nf_emitida_off(self, auth_headers):
        """Test setting NF emitida to false"""
        response = requests.patch(
            f"{BASE_URL}/api/purchase-orders/{TEST_PO_ID}/items/by-index/{TEST_ITEM_INDEX}/nf-emitida",
            json={"nf_emitida_pronto_despacho": False},
            headers=auth_headers
        )
        assert response.status_code == 200
        
        # Verify
        response = requests.get(f"{BASE_URL}/api/purchase-orders/{TEST_PO_ID}", headers=auth_headers)
        item = response.json()['items'][TEST_ITEM_INDEX]
        assert item.get('nf_emitida_pronto_despacho') == False
        print("NF Emitida set to False")
    
    def test_restore_nf_emitida_state(self, auth_headers):
        """Restore original state"""
        response = requests.patch(
            f"{BASE_URL}/api/purchase-orders/{TEST_PO_ID}/items/by-index/{TEST_ITEM_INDEX}/nf-emitida",
            json={"nf_emitida_pronto_despacho": True},
            headers=auth_headers
        )
        assert response.status_code == 200


class TestNCMExtraction:
    """Test NCM extraction from different file types"""
    
    def test_ncm_extraction_from_xml_with_namespace(self, auth_headers):
        """Test NCM extraction from XML with NFe namespace"""
        xml_with_namespace = """<?xml version="1.0" encoding="UTF-8"?>
<nfeProc xmlns="http://www.portalfiscal.inf.br/nfe" versao="4.00">
  <NFe xmlns="http://www.portalfiscal.inf.br/nfe">
    <infNFe Id="NFe12345" versao="4.00">
      <det nItem="1">
        <prod>
          <NCM>11223344</NCM>
        </prod>
      </det>
    </infNFe>
  </NFe>
</nfeProc>
"""
        xml_base64 = base64.b64encode(xml_with_namespace.encode('utf-8')).decode('utf-8')
        
        payload = {
            "filename": "nf_ncm_test.xml",
            "content_type": "text/xml",
            "file_data": xml_base64,
            "ncm_manual": None,
            "tipo": "fornecedor"
        }
        
        response = requests.post(
            f"{BASE_URL}/api/purchase-orders/{TEST_PO_ID}/items/by-index/{TEST_ITEM_INDEX}/notas-fiscais",
            json=payload,
            headers=auth_headers
        )
        assert response.status_code == 200
        data = response.json()
        assert data['ncm'] == '11223344', f"NCM extraction failed, got: {data['ncm']}"
        print(f"NCM extracted correctly: {data['ncm']}")
        
        # Cleanup
        requests.delete(
            f"{BASE_URL}/api/purchase-orders/{TEST_PO_ID}/items/by-index/{TEST_ITEM_INDEX}/notas-fiscais/{data['nf_id']}?tipo=fornecedor",
            headers=auth_headers
        )
    
    def test_manual_ncm_overrides_extraction(self, auth_headers):
        """Test that manual NCM overrides automatic extraction"""
        xml_base64 = base64.b64encode(SAMPLE_XML_NFE.encode('utf-8')).decode('utf-8')
        
        payload = {
            "filename": "nf_manual_ncm.xml",
            "content_type": "text/xml",
            "file_data": xml_base64,
            "ncm_manual": "MANUAL123",  # Manual NCM should override
            "tipo": "fornecedor"
        }
        
        response = requests.post(
            f"{BASE_URL}/api/purchase-orders/{TEST_PO_ID}/items/by-index/{TEST_ITEM_INDEX}/notas-fiscais",
            json=payload,
            headers=auth_headers
        )
        assert response.status_code == 200
        data = response.json()
        assert data['ncm'] == 'MANUAL123', f"Manual NCM should be used, got: {data['ncm']}"
        print(f"Manual NCM used correctly: {data['ncm']}")
        
        # Cleanup
        requests.delete(
            f"{BASE_URL}/api/purchase-orders/{TEST_PO_ID}/items/by-index/{TEST_ITEM_INDEX}/notas-fiscais/{data['nf_id']}?tipo=fornecedor",
            headers=auth_headers
        )


class TestErrorHandling:
    """Test error handling for NF endpoints"""
    
    def test_invalid_po_id(self, auth_headers):
        """Test with invalid PO ID"""
        response = requests.post(
            f"{BASE_URL}/api/purchase-orders/invalid-po-id/items/by-index/0/notas-fiscais",
            json={
                "filename": "test.xml",
                "content_type": "text/xml",
                "file_data": "dGVzdA==",
                "tipo": "fornecedor"
            },
            headers=auth_headers
        )
        assert response.status_code == 404
    
    def test_invalid_item_index(self, auth_headers):
        """Test with invalid item index"""
        response = requests.post(
            f"{BASE_URL}/api/purchase-orders/{TEST_PO_ID}/items/by-index/999/notas-fiscais",
            json={
                "filename": "test.xml",
                "content_type": "text/xml",
                "file_data": "dGVzdA==",
                "tipo": "fornecedor"
            },
            headers=auth_headers
        )
        assert response.status_code == 404
    
    def test_invalid_tipo(self, auth_headers):
        """Test with invalid tipo"""
        response = requests.post(
            f"{BASE_URL}/api/purchase-orders/{TEST_PO_ID}/items/by-index/{TEST_ITEM_INDEX}/notas-fiscais",
            json={
                "filename": "test.xml",
                "content_type": "text/xml",
                "file_data": "dGVzdA==",
                "tipo": "invalid_tipo"
            },
            headers=auth_headers
        )
        assert response.status_code == 400
    
    def test_download_nonexistent_nf(self, auth_headers):
        """Test downloading non-existent NF"""
        response = requests.get(
            f"{BASE_URL}/api/purchase-orders/{TEST_PO_ID}/items/by-index/{TEST_ITEM_INDEX}/notas-fiscais/nonexistent-id/download",
            headers=auth_headers
        )
        assert response.status_code == 404


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
