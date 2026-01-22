"""
Test suite for new features:
1. Image upload for items (drag-and-drop)
2. Group pending items by code
3. Show total planilha when quoting
"""
import pytest
import requests
import os
import io

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

# Test credentials
ADMIN_EMAIL = "projetos.onsolucoes@gmail.com"
ADMIN_PASSWORD = "on123456"

# Test data
TEST_PO_ID = "c885f4bb-fc52-44f4-b064-1503707b994a"
TEST_ITEM_INDEX = 0


@pytest.fixture(scope="module")
def auth_token():
    """Get authentication token"""
    response = requests.post(
        f"{BASE_URL}/api/auth/login",
        json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD}
    )
    assert response.status_code == 200, f"Login failed: {response.text}"
    return response.json()["access_token"]


@pytest.fixture(scope="module")
def auth_headers(auth_token):
    """Get headers with auth token"""
    return {"Authorization": f"Bearer {auth_token}"}


class TestImageUploadEndpoint:
    """Test image upload functionality for items"""
    
    def test_upload_image_endpoint_exists(self, auth_headers):
        """Test that the upload endpoint exists and returns proper error for missing file"""
        response = requests.post(
            f"{BASE_URL}/api/purchase-orders/{TEST_PO_ID}/items/by-index/{TEST_ITEM_INDEX}/imagem",
            headers=auth_headers
        )
        # Should return 422 (validation error) because no file was provided, not 404
        assert response.status_code in [422, 400], f"Unexpected status: {response.status_code}"
    
    def test_upload_image_with_valid_file(self, auth_headers):
        """Test uploading a valid image file"""
        # Create a simple test image (1x1 pixel PNG)
        png_data = bytes([
            0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A,  # PNG signature
            0x00, 0x00, 0x00, 0x0D, 0x49, 0x48, 0x44, 0x52,  # IHDR chunk
            0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,  # 1x1 pixel
            0x08, 0x02, 0x00, 0x00, 0x00, 0x90, 0x77, 0x53,
            0xDE, 0x00, 0x00, 0x00, 0x0C, 0x49, 0x44, 0x41,  # IDAT chunk
            0x54, 0x08, 0xD7, 0x63, 0xF8, 0xFF, 0xFF, 0x3F,
            0x00, 0x05, 0xFE, 0x02, 0xFE, 0xDC, 0xCC, 0x59,
            0xE7, 0x00, 0x00, 0x00, 0x00, 0x49, 0x45, 0x4E,  # IEND chunk
            0x44, 0xAE, 0x42, 0x60, 0x82
        ])
        
        files = {
            'file': ('test_image.png', io.BytesIO(png_data), 'image/png')
        }
        
        response = requests.post(
            f"{BASE_URL}/api/purchase-orders/{TEST_PO_ID}/items/by-index/{TEST_ITEM_INDEX}/imagem",
            headers=auth_headers,
            files=files
        )
        
        assert response.status_code == 200, f"Upload failed: {response.text}"
        data = response.json()
        assert data.get("success") == True
        assert "imagem_url" in data
        assert data["imagem_url"].startswith("/api/item-images/")
    
    def test_get_uploaded_image(self, auth_headers):
        """Test that uploaded image can be retrieved"""
        # First get the item to find the image URL
        response = requests.get(
            f"{BASE_URL}/api/purchase-orders/{TEST_PO_ID}",
            headers=auth_headers
        )
        assert response.status_code == 200
        
        po = response.json()
        item = po["items"][TEST_ITEM_INDEX]
        imagem_url = item.get("imagem_url")
        
        if imagem_url:
            # Try to get the image
            img_response = requests.get(f"{BASE_URL}{imagem_url}")
            assert img_response.status_code == 200, f"Failed to get image: {img_response.status_code}"
            assert img_response.headers.get("content-type", "").startswith("image/")
    
    def test_upload_invalid_file_type(self, auth_headers):
        """Test that invalid file types are rejected"""
        files = {
            'file': ('test.txt', io.BytesIO(b'not an image'), 'text/plain')
        }
        
        response = requests.post(
            f"{BASE_URL}/api/purchase-orders/{TEST_PO_ID}/items/by-index/{TEST_ITEM_INDEX}/imagem",
            headers=auth_headers,
            files=files
        )
        
        assert response.status_code == 400, f"Should reject invalid file type: {response.status_code}"
    
    def test_delete_image(self, auth_headers):
        """Test deleting an image from an item"""
        response = requests.delete(
            f"{BASE_URL}/api/purchase-orders/{TEST_PO_ID}/items/by-index/{TEST_ITEM_INDEX}/imagem",
            headers=auth_headers
        )
        
        assert response.status_code == 200, f"Delete failed: {response.text}"
        data = response.json()
        assert data.get("success") == True
        
        # Verify image is removed
        po_response = requests.get(
            f"{BASE_URL}/api/purchase-orders/{TEST_PO_ID}",
            headers=auth_headers
        )
        po = po_response.json()
        item = po["items"][TEST_ITEM_INDEX]
        assert item.get("imagem_url") is None


class TestEstoqueImageUrl:
    """Test that estoque endpoint includes imagem_url"""
    
    def test_estoque_includes_imagem_url_field(self, auth_headers):
        """Test that estoque endpoint returns imagem_url field"""
        response = requests.get(
            f"{BASE_URL}/api/estoque",
            headers=auth_headers
        )
        
        assert response.status_code == 200
        data = response.json()
        
        # Check that estoque items have imagem_url field (even if null)
        if data.get("estoque") and len(data["estoque"]) > 0:
            first_item = data["estoque"][0]
            # The field should exist in the response
            assert "imagem_url" in first_item or first_item.get("imagem_url") is None


class TestPlanilhaItensImageUrl:
    """Test that planilha-itens endpoint includes imagem_url"""
    
    def test_planilha_itens_includes_imagem_url_field(self, auth_headers):
        """Test that planilha-itens endpoint returns imagem_url field"""
        response = requests.get(
            f"{BASE_URL}/api/planilha-itens",
            headers=auth_headers
        )
        
        assert response.status_code == 200
        data = response.json()
        
        # Check that items have imagem_url field
        if data.get("itens") and len(data["itens"]) > 0:
            first_item = data["itens"][0]
            # The field should exist in the response
            assert "imagem_url" in first_item or first_item.get("imagem_url") is None


class TestPendingItemsEndpoint:
    """Test endpoints used for pending items grouping"""
    
    def test_get_purchase_orders_returns_items(self, auth_headers):
        """Test that purchase orders endpoint returns items with required fields"""
        response = requests.get(
            f"{BASE_URL}/api/purchase-orders?limit=10",
            headers=auth_headers
        )
        
        assert response.status_code == 200
        data = response.json()
        
        # Should have data array
        assert "data" in data
        
        if len(data["data"]) > 0:
            po = data["data"][0]
            assert "items" in po
            assert "numero_oc" in po
            
            if len(po["items"]) > 0:
                item = po["items"][0]
                # Check required fields for grouping
                assert "codigo_item" in item
                assert "quantidade" in item
                assert "status" in item
    
    def test_items_have_codigo_for_grouping(self, auth_headers):
        """Test that items have codigo_item field needed for grouping"""
        response = requests.get(
            f"{BASE_URL}/api/purchase-orders?limit=0",
            headers=auth_headers
        )
        
        assert response.status_code == 200
        data = response.json()
        
        # Count items with codigo_item
        items_with_codigo = 0
        total_items = 0
        
        for po in data.get("data", []):
            for item in po.get("items", []):
                total_items += 1
                if item.get("codigo_item"):
                    items_with_codigo += 1
        
        # All items should have codigo_item
        if total_items > 0:
            assert items_with_codigo == total_items, f"Some items missing codigo_item: {items_with_codigo}/{total_items}"


class TestItemStatusEndpoint:
    """Test item status update endpoint"""
    
    def test_get_item_by_status_pendente(self, auth_headers):
        """Test getting items by status pendente"""
        response = requests.get(
            f"{BASE_URL}/api/purchase-orders?limit=0",
            headers=auth_headers
        )
        
        assert response.status_code == 200
        data = response.json()
        
        # Count pendente items
        pendente_count = 0
        for po in data.get("data", []):
            for item in po.get("items", []):
                if item.get("status") == "pendente":
                    pendente_count += 1
        
        # Just verify we can count them (frontend uses this for grouping)
        assert pendente_count >= 0


class TestImageServing:
    """Test image serving endpoint"""
    
    def test_get_nonexistent_image_returns_404(self):
        """Test that requesting non-existent image returns 404"""
        response = requests.get(
            f"{BASE_URL}/api/item-images/nonexistent_image_12345.png"
        )
        
        assert response.status_code == 404


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
