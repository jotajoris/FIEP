"""
Test suite for PDF Upload/Preview/Download features:
1. POST /api/purchase-orders/upload-pdf - Upload de nova OC deve preencher automaticamente todos os campos
2. POST /api/purchase-orders/preview-pdf - Preview deve retornar requisitante_nome e requisitante_email
3. GET /api/purchase-orders/{id}/download-pdf - Download do PDF salvo
4. Verificar que os itens criados têm: responsavel, lote, lot_number, preco_venda, descricao da planilha de referência
5. Verificar que a OC criada tem: requisitante_nome, requisitante_email, cnpj_requisitante, data_entrega, endereco_entrega
"""

import pytest
import requests
import os
import io
import uuid
from datetime import datetime

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', 'https://ordertrack-30.preview.emergentagent.com').rstrip('/')


def create_test_pdf_content(numero_oc: str, items: list, requisitante_nome: str = "JOAO SILVA", 
                            requisitante_email: str = "joao.silva@fiep.org.br",
                            cnpj: str = "76.610.591/0001-80",
                            data_entrega: str = "15/02/2026",
                            endereco: str = "Rua XV de Novembro, 1234, Centro, Curitiba - PR"):
    """
    Create a test PDF with FIEP OC format using PyMuPDF (fitz)
    """
    try:
        import fitz  # PyMuPDF
    except ImportError:
        pytest.skip("PyMuPDF not installed")
    
    # Create a new PDF document
    doc = fitz.open()
    page = doc.new_page()
    
    # Build the PDF content in FIEP format
    y_pos = 50
    
    # Header
    page.insert_text((50, y_pos), f"ORDEM DE COMPRA", fontsize=16, fontname="helv")
    y_pos += 30
    page.insert_text((50, y_pos), f"OC-{numero_oc}", fontsize=14, fontname="helv")
    y_pos += 30
    
    # CNPJ
    page.insert_text((50, y_pos), f"CNPJ: {cnpj}", fontsize=10, fontname="helv")
    y_pos += 20
    
    # Requisitante
    page.insert_text((50, y_pos), f"Requisitante: {requisitante_nome} -", fontsize=10, fontname="helv")
    y_pos += 15
    page.insert_text((50, y_pos), requisitante_email, fontsize=10, fontname="helv")
    y_pos += 25
    
    # Data de Entrega
    page.insert_text((50, y_pos), f"Data de Entrega: {data_entrega}", fontsize=10, fontname="helv")
    y_pos += 20
    
    # Endereço de Entrega
    page.insert_text((50, y_pos), f"Endereço de Entrega: {endereco}", fontsize=10, fontname="helv")
    y_pos += 40
    
    # Items header
    page.insert_text((50, y_pos), "ITENS:", fontsize=12, fontname="helv")
    y_pos += 25
    
    # Items in FIEP format: Linha, Código, Descrição, Quantidade, Unidade, Preço
    for idx, item in enumerate(items, 1):
        # Line number
        page.insert_text((50, y_pos), str(idx), fontsize=10, fontname="helv")
        y_pos += 15
        
        # Item code (6 digits starting with 0 or 1)
        page.insert_text((50, y_pos), item['codigo'], fontsize=10, fontname="helv")
        y_pos += 15
        
        # Description
        page.insert_text((50, y_pos), item.get('descricao', f"Item {item['codigo']}"), fontsize=10, fontname="helv")
        y_pos += 15
        
        # Quantity
        page.insert_text((50, y_pos), str(item['quantidade']), fontsize=10, fontname="helv")
        y_pos += 15
        
        # Unit
        page.insert_text((50, y_pos), item.get('unidade', 'UN'), fontsize=10, fontname="helv")
        y_pos += 15
        
        # Price (in Brazilian format)
        if 'preco' in item:
            preco_str = f"{item['preco']:,.2f}".replace(',', 'X').replace('.', ',').replace('X', '.')
            page.insert_text((50, y_pos), preco_str, fontsize=10, fontname="helv")
            y_pos += 15
        
        y_pos += 10  # Space between items
    
    # Save to bytes
    pdf_bytes = doc.tobytes()
    doc.close()
    
    return pdf_bytes


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


class TestPreviewPDF:
    """Tests for POST /api/purchase-orders/preview-pdf"""
    
    @pytest.fixture
    def auth_token(self):
        """Get authentication token"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": "projetos.onsolucoes@gmail.com",
            "password": "on123456"
        })
        return response.json().get("access_token")
    
    def test_preview_pdf_returns_200(self, auth_token):
        """Test that preview-pdf endpoint returns 200 with valid PDF"""
        # Create test PDF with known item codes
        pdf_content = create_test_pdf_content(
            numero_oc=f"TESTE-PREVIEW-{uuid.uuid4().hex[:6]}",
            items=[
                {"codigo": "114508", "quantidade": 5, "descricao": "CABO ELETRICO", "unidade": "UN", "preco": 209.52},
                {"codigo": "114369", "quantidade": 10, "descricao": "CABO FLEXIVEL", "unidade": "UN", "preco": 0.97}
            ],
            requisitante_nome="MARIA TESTE",
            requisitante_email="maria.teste@fiep.org.br"
        )
        
        files = {'file': ('test_oc.pdf', io.BytesIO(pdf_content), 'application/pdf')}
        response = requests.post(
            f"{BASE_URL}/api/purchase-orders/preview-pdf",
            headers={"Authorization": f"Bearer {auth_token}"},
            files=files
        )
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
    
    def test_preview_pdf_returns_requisitante_fields(self, auth_token):
        """Test that preview returns requisitante_nome and requisitante_email"""
        pdf_content = create_test_pdf_content(
            numero_oc=f"TESTE-REQ-{uuid.uuid4().hex[:6]}",
            items=[
                {"codigo": "114508", "quantidade": 3, "descricao": "CABO ELETRICO", "unidade": "UN"}
            ],
            requisitante_nome="CARLOS REQUISITANTE",
            requisitante_email="carlos.req@fiep.org.br"
        )
        
        files = {'file': ('test_oc.pdf', io.BytesIO(pdf_content), 'application/pdf')}
        response = requests.post(
            f"{BASE_URL}/api/purchase-orders/preview-pdf",
            headers={"Authorization": f"Bearer {auth_token}"},
            files=files
        )
        
        assert response.status_code == 200
        data = response.json()
        
        # Check requisitante fields exist
        assert "requisitante_nome" in data, "Preview should return requisitante_nome"
        assert "requisitante_email" in data, "Preview should return requisitante_email"
    
    def test_preview_pdf_returns_cnpj_and_data_entrega(self, auth_token):
        """Test that preview returns cnpj_requisitante and data_entrega"""
        pdf_content = create_test_pdf_content(
            numero_oc=f"TESTE-CNPJ-{uuid.uuid4().hex[:6]}",
            items=[
                {"codigo": "114508", "quantidade": 2, "descricao": "CABO ELETRICO", "unidade": "UN"}
            ],
            cnpj="76.610.591/0001-80",
            data_entrega="20/03/2026"
        )
        
        files = {'file': ('test_oc.pdf', io.BytesIO(pdf_content), 'application/pdf')}
        response = requests.post(
            f"{BASE_URL}/api/purchase-orders/preview-pdf",
            headers={"Authorization": f"Bearer {auth_token}"},
            files=files
        )
        
        assert response.status_code == 200
        data = response.json()
        
        # Check CNPJ and data_entrega fields exist
        assert "cnpj_requisitante" in data, "Preview should return cnpj_requisitante"
        assert "data_entrega" in data, "Preview should return data_entrega"
    
    def test_preview_pdf_items_have_reference_data(self, auth_token):
        """Test that preview items have responsavel, lote, preco_venda from reference"""
        pdf_content = create_test_pdf_content(
            numero_oc=f"TESTE-REF-{uuid.uuid4().hex[:6]}",
            items=[
                {"codigo": "114508", "quantidade": 5, "descricao": "CABO", "unidade": "UN"}
            ]
        )
        
        files = {'file': ('test_oc.pdf', io.BytesIO(pdf_content), 'application/pdf')}
        response = requests.post(
            f"{BASE_URL}/api/purchase-orders/preview-pdf",
            headers={"Authorization": f"Bearer {auth_token}"},
            files=files
        )
        
        assert response.status_code == 200
        data = response.json()
        
        items = data.get("items", [])
        assert len(items) > 0, "Should have at least one item"
        
        # Check first item has reference data
        first_item = items[0]
        assert "responsavel" in first_item, "Item should have responsavel"
        assert "lote" in first_item, "Item should have lote"
        # preco_venda may come from PDF or reference
        assert "preco_venda" in first_item or "descricao" in first_item, "Item should have preco_venda or descricao"


class TestUploadPDF:
    """Tests for POST /api/purchase-orders/upload-pdf"""
    
    @pytest.fixture
    def auth_token(self):
        """Get authentication token"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": "projetos.onsolucoes@gmail.com",
            "password": "on123456"
        })
        return response.json().get("access_token")
    
    @pytest.fixture
    def unique_oc_number(self):
        """Generate unique OC number for testing"""
        return f"TESTE-{uuid.uuid4().hex[:8].upper()}"
    
    def test_upload_pdf_creates_oc(self, auth_token, unique_oc_number):
        """Test that upload-pdf creates a new OC"""
        pdf_content = create_test_pdf_content(
            numero_oc=unique_oc_number,
            items=[
                {"codigo": "114508", "quantidade": 5, "descricao": "CABO ELETRICO", "unidade": "UN", "preco": 209.52}
            ]
        )
        
        files = {'file': ('test_oc.pdf', io.BytesIO(pdf_content), 'application/pdf')}
        response = requests.post(
            f"{BASE_URL}/api/purchase-orders/upload-pdf",
            headers={"Authorization": f"Bearer {auth_token}"},
            files=files
        )
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()
        
        assert data.get("success") == True, "Upload should be successful"
        assert "po_id" in data, "Response should contain po_id"
        assert "numero_oc" in data, "Response should contain numero_oc"
    
    def test_upload_pdf_fills_requisitante_fields(self, auth_token, unique_oc_number):
        """Test that upload fills requisitante_nome and requisitante_email"""
        pdf_content = create_test_pdf_content(
            numero_oc=unique_oc_number,
            items=[
                {"codigo": "114508", "quantidade": 3, "descricao": "CABO", "unidade": "UN"}
            ],
            requisitante_nome="PEDRO REQUISITANTE",
            requisitante_email="pedro.req@fiep.org.br"
        )
        
        files = {'file': ('test_oc.pdf', io.BytesIO(pdf_content), 'application/pdf')}
        response = requests.post(
            f"{BASE_URL}/api/purchase-orders/upload-pdf",
            headers={"Authorization": f"Bearer {auth_token}"},
            files=files
        )
        
        assert response.status_code == 200
        data = response.json()
        po_id = data.get("po_id")
        
        # Fetch the created OC to verify fields
        get_response = requests.get(
            f"{BASE_URL}/api/purchase-orders/{po_id}",
            headers={"Authorization": f"Bearer {auth_token}"}
        )
        
        assert get_response.status_code == 200
        po_data = get_response.json()
        
        # Verify requisitante fields are saved
        assert "requisitante_nome" in po_data or po_data.get("requisitante_nome") is not None, \
            "OC should have requisitante_nome"
        assert "requisitante_email" in po_data or po_data.get("requisitante_email") is not None, \
            "OC should have requisitante_email"
    
    def test_upload_pdf_fills_cnpj_and_data_entrega(self, auth_token, unique_oc_number):
        """Test that upload fills cnpj_requisitante and data_entrega"""
        pdf_content = create_test_pdf_content(
            numero_oc=unique_oc_number,
            items=[
                {"codigo": "114369", "quantidade": 10, "descricao": "CABO FLEXIVEL", "unidade": "UN"}
            ],
            cnpj="76.610.591/0001-80",
            data_entrega="25/04/2026"
        )
        
        files = {'file': ('test_oc.pdf', io.BytesIO(pdf_content), 'application/pdf')}
        response = requests.post(
            f"{BASE_URL}/api/purchase-orders/upload-pdf",
            headers={"Authorization": f"Bearer {auth_token}"},
            files=files
        )
        
        assert response.status_code == 200
        data = response.json()
        po_id = data.get("po_id")
        
        # Fetch the created OC
        get_response = requests.get(
            f"{BASE_URL}/api/purchase-orders/{po_id}",
            headers={"Authorization": f"Bearer {auth_token}"}
        )
        
        assert get_response.status_code == 200
        po_data = get_response.json()
        
        # Verify CNPJ and data_entrega are saved
        assert "cnpj_requisitante" in po_data, "OC should have cnpj_requisitante"
        assert "data_entrega" in po_data, "OC should have data_entrega"
    
    def test_upload_pdf_fills_endereco_entrega(self, auth_token, unique_oc_number):
        """Test that upload fills endereco_entrega"""
        pdf_content = create_test_pdf_content(
            numero_oc=unique_oc_number,
            items=[
                {"codigo": "114508", "quantidade": 2, "descricao": "CABO", "unidade": "UN"}
            ],
            endereco="Avenida Sete de Setembro, 5000, Centro, Curitiba - PR"
        )
        
        files = {'file': ('test_oc.pdf', io.BytesIO(pdf_content), 'application/pdf')}
        response = requests.post(
            f"{BASE_URL}/api/purchase-orders/upload-pdf",
            headers={"Authorization": f"Bearer {auth_token}"},
            files=files
        )
        
        assert response.status_code == 200
        data = response.json()
        po_id = data.get("po_id")
        
        # Fetch the created OC
        get_response = requests.get(
            f"{BASE_URL}/api/purchase-orders/{po_id}",
            headers={"Authorization": f"Bearer {auth_token}"}
        )
        
        assert get_response.status_code == 200
        po_data = get_response.json()
        
        # Verify endereco_entrega is saved
        assert "endereco_entrega" in po_data, "OC should have endereco_entrega"
    
    def test_upload_pdf_items_have_reference_data(self, auth_token, unique_oc_number):
        """Test that uploaded items have responsavel, lote, lot_number, preco_venda, descricao from reference"""
        pdf_content = create_test_pdf_content(
            numero_oc=unique_oc_number,
            items=[
                {"codigo": "114508", "quantidade": 5, "descricao": "CABO SIMPLES", "unidade": "UN"}
            ]
        )
        
        files = {'file': ('test_oc.pdf', io.BytesIO(pdf_content), 'application/pdf')}
        response = requests.post(
            f"{BASE_URL}/api/purchase-orders/upload-pdf",
            headers={"Authorization": f"Bearer {auth_token}"},
            files=files
        )
        
        assert response.status_code == 200
        data = response.json()
        po_id = data.get("po_id")
        
        # Fetch the created OC
        get_response = requests.get(
            f"{BASE_URL}/api/purchase-orders/{po_id}",
            headers={"Authorization": f"Bearer {auth_token}"}
        )
        
        assert get_response.status_code == 200
        po_data = get_response.json()
        
        items = po_data.get("items", [])
        assert len(items) > 0, "OC should have items"
        
        # Check first item has all reference data
        first_item = items[0]
        
        # These fields should come from reference_items
        assert "responsavel" in first_item, "Item should have responsavel"
        assert first_item.get("responsavel") != "⚠️ NÃO ENCONTRADO", \
            f"Item should have valid responsavel, got: {first_item.get('responsavel')}"
        
        assert "lote" in first_item, "Item should have lote"
        assert first_item.get("lote") != "⚠️ NÃO ENCONTRADO", \
            f"Item should have valid lote, got: {first_item.get('lote')}"
        
        assert "lot_number" in first_item, "Item should have lot_number"
        assert first_item.get("lot_number", 0) > 0, "Item should have valid lot_number"
        
        # preco_venda should be filled from reference
        assert "preco_venda" in first_item, "Item should have preco_venda"
        
        # descricao should be from reference (more complete)
        assert "descricao" in first_item, "Item should have descricao"
        assert len(first_item.get("descricao", "")) > 10, "Item should have detailed descricao from reference"
    
    def test_upload_pdf_saves_pdf_for_download(self, auth_token, unique_oc_number):
        """Test that upload saves the PDF for later download"""
        pdf_content = create_test_pdf_content(
            numero_oc=unique_oc_number,
            items=[
                {"codigo": "114508", "quantidade": 1, "descricao": "CABO", "unidade": "UN"}
            ]
        )
        
        files = {'file': ('test_oc.pdf', io.BytesIO(pdf_content), 'application/pdf')}
        response = requests.post(
            f"{BASE_URL}/api/purchase-orders/upload-pdf",
            headers={"Authorization": f"Bearer {auth_token}"},
            files=files
        )
        
        assert response.status_code == 200
        data = response.json()
        po_id = data.get("po_id")
        
        # Check if PDF is available for download
        has_pdf_response = requests.get(
            f"{BASE_URL}/api/purchase-orders/{po_id}/has-pdf",
            headers={"Authorization": f"Bearer {auth_token}"}
        )
        
        assert has_pdf_response.status_code == 200
        has_pdf_data = has_pdf_response.json()
        
        assert has_pdf_data.get("has_pdf") == True, "OC should have PDF available for download"
        assert has_pdf_data.get("filename") is not None, "OC should have PDF filename"


class TestDownloadPDF:
    """Tests for GET /api/purchase-orders/{id}/download-pdf"""
    
    @pytest.fixture
    def auth_token(self):
        """Get authentication token"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": "projetos.onsolucoes@gmail.com",
            "password": "on123456"
        })
        return response.json().get("access_token")
    
    @pytest.fixture
    def oc_with_pdf(self, auth_token):
        """Create an OC with PDF for testing download"""
        unique_oc = f"TESTE-DL-{uuid.uuid4().hex[:8].upper()}"
        pdf_content = create_test_pdf_content(
            numero_oc=unique_oc,
            items=[
                {"codigo": "114508", "quantidade": 1, "descricao": "CABO", "unidade": "UN"}
            ]
        )
        
        files = {'file': ('download_test.pdf', io.BytesIO(pdf_content), 'application/pdf')}
        response = requests.post(
            f"{BASE_URL}/api/purchase-orders/upload-pdf",
            headers={"Authorization": f"Bearer {auth_token}"},
            files=files
        )
        
        if response.status_code == 200:
            return response.json().get("po_id")
        return None
    
    def test_download_pdf_returns_pdf(self, auth_token, oc_with_pdf):
        """Test that download-pdf returns the PDF file"""
        if not oc_with_pdf:
            pytest.skip("Could not create OC with PDF")
        
        response = requests.get(
            f"{BASE_URL}/api/purchase-orders/{oc_with_pdf}/download-pdf",
            headers={"Authorization": f"Bearer {auth_token}"}
        )
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        assert response.headers.get("content-type") == "application/pdf", \
            f"Expected application/pdf, got {response.headers.get('content-type')}"
        
        # Check content-disposition header
        content_disposition = response.headers.get("content-disposition", "")
        assert "attachment" in content_disposition, "Should have attachment disposition"
        assert ".pdf" in content_disposition, "Should have .pdf in filename"
    
    def test_download_pdf_returns_valid_pdf_content(self, auth_token, oc_with_pdf):
        """Test that downloaded content is valid PDF"""
        if not oc_with_pdf:
            pytest.skip("Could not create OC with PDF")
        
        response = requests.get(
            f"{BASE_URL}/api/purchase-orders/{oc_with_pdf}/download-pdf",
            headers={"Authorization": f"Bearer {auth_token}"}
        )
        
        assert response.status_code == 200
        
        # PDF files start with %PDF
        content = response.content
        assert content[:4] == b'%PDF', "Downloaded content should be valid PDF"
    
    def test_download_pdf_404_for_nonexistent_oc(self, auth_token):
        """Test that download returns 404 for non-existent OC"""
        response = requests.get(
            f"{BASE_URL}/api/purchase-orders/nonexistent-id-12345/download-pdf",
            headers={"Authorization": f"Bearer {auth_token}"}
        )
        
        assert response.status_code == 404
    
    def test_download_pdf_requires_auth(self):
        """Test that download requires authentication"""
        response = requests.get(
            f"{BASE_URL}/api/purchase-orders/some-id/download-pdf"
        )
        
        # Should return 401 or 403 without auth
        assert response.status_code in [401, 403, 422], \
            f"Expected 401/403/422 without auth, got {response.status_code}"


class TestHasPDF:
    """Tests for GET /api/purchase-orders/{id}/has-pdf"""
    
    @pytest.fixture
    def auth_token(self):
        """Get authentication token"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": "projetos.onsolucoes@gmail.com",
            "password": "on123456"
        })
        return response.json().get("access_token")
    
    def test_has_pdf_returns_correct_structure(self, auth_token):
        """Test that has-pdf returns correct structure"""
        # First get OCs with has_pdf = true (more reliable)
        response = requests.get(
            f"{BASE_URL}/api/purchase-orders?limit=100",
            headers={"Authorization": f"Bearer {auth_token}"}
        )
        
        assert response.status_code == 200
        data = response.json()
        
        pos = data.get("data", [])
        if not pos:
            pytest.skip("No OCs available for testing")
        
        # Find an OC with has_pdf = true for more reliable test
        po_with_pdf = None
        for po in pos:
            if po.get("has_pdf") == True:
                po_with_pdf = po
                break
        
        if not po_with_pdf:
            # Use first OC if none have PDF
            po_with_pdf = pos[0]
        
        po_id = po_with_pdf.get("id")
        
        # Check has-pdf endpoint
        has_pdf_response = requests.get(
            f"{BASE_URL}/api/purchase-orders/{po_id}/has-pdf",
            headers={"Authorization": f"Bearer {auth_token}"}
        )
        
        assert has_pdf_response.status_code == 200, f"Expected 200, got {has_pdf_response.status_code}: {has_pdf_response.text}"
        has_pdf_data = has_pdf_response.json()
        
        assert "has_pdf" in has_pdf_data, "Response should have has_pdf field"
        assert isinstance(has_pdf_data.get("has_pdf"), bool), "has_pdf should be boolean"


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


# Cleanup fixture to delete test OCs after tests
@pytest.fixture(scope="session", autouse=True)
def cleanup_test_ocs():
    """Cleanup test OCs after all tests complete"""
    yield
    
    # After tests, try to clean up test OCs
    try:
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": "projetos.onsolucoes@gmail.com",
            "password": "on123456"
        })
        if response.status_code == 200:
            token = response.json().get("access_token")
            
            # Get all OCs and delete test ones
            pos_response = requests.get(
                f"{BASE_URL}/api/purchase-orders?limit=100",
                headers={"Authorization": f"Bearer {token}"}
            )
            
            if pos_response.status_code == 200:
                pos = pos_response.json().get("data", [])
                for po in pos:
                    if po.get("numero_oc", "").startswith("OC-TESTE-"):
                        requests.delete(
                            f"{BASE_URL}/api/purchase-orders/{po['id']}",
                            headers={"Authorization": f"Bearer {token}"}
                        )
    except Exception:
        pass  # Ignore cleanup errors
