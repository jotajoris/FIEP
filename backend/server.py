from fastapi import FastAPI, APIRouter, HTTPException, Depends, UploadFile, File
from fastapi.security import HTTPBearer
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import logging
import asyncio
from pathlib import Path
from pydantic import BaseModel, Field, ConfigDict, EmailStr
from typing import List, Optional, Dict
import uuid
from datetime import datetime, timezone, timedelta
from enum import Enum
import openpyxl
import resend
import fitz  # PyMuPDF
import re
from auth import (
    verify_password, get_password_hash, create_access_token,
    get_current_user, require_admin
)

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

# Resend configuration
resend.api_key = os.environ.get('RESEND_API_KEY', '')
SENDER_EMAIL = os.environ.get('SENDER_EMAIL', 'onboarding@resend.dev')

# MongoDB connection
mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

# Create the main app without a prefix
app = FastAPI()

# Create a router with the /api prefix
api_router = APIRouter(prefix="/api")
security = HTTPBearer()

# Mapeamento de lotes para responsáveis
LOT_ASSIGNMENTS = {
    'Maria': list(range(1, 13)) + list(range(43, 54)),
    'Mateus': list(range(13, 21)) + list(range(54, 67)),
    'João': list(range(21, 32)) + list(range(67, 80)),
    'Mylena': list(range(80, 98)),
    'Fabio': list(range(32, 43))
}

# Criar reverse mapping (lote -> responsável)
LOT_TO_OWNER = {}
for owner, lots in LOT_ASSIGNMENTS.items():
    for lot in lots:
        LOT_TO_OWNER[lot] = owner

# Email to owner name mapping
EMAIL_TO_OWNER = {
    'maria.onsolucoes@gmail.com': 'Maria',
    'mylena.onsolucoes@gmail.com': 'Mylena',
    'fabioonsolucoes@gmail.com': 'Fabio'
}

class UserRole(str, Enum):
    ADMIN = "admin"
    USER = "user"

class ItemStatus(str, Enum):
    PENDENTE = "pendente"
    COTADO = "cotado"
    COMPRADO = "comprado"
    ENTREGUE = "entregue"

# Models
class User(BaseModel):
    model_config = ConfigDict(extra="ignore")
    
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    email: EmailStr
    hashed_password: str
    role: UserRole
    owner_name: Optional[str] = None  # Para usuários não-admin
    needs_password_change: bool = True
    reset_token: Optional[str] = None
    reset_token_expires: Optional[datetime] = None
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class UserCreate(BaseModel):
    email: EmailStr
    password: str
    role: UserRole
    owner_name: Optional[str] = None

class LoginRequest(BaseModel):
    email: EmailStr
    password: str

class LoginResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: dict

class ChangePasswordRequest(BaseModel):
    current_password: str
    new_password: str

class ResetPasswordRequest(BaseModel):
    email: EmailStr

class ConfirmResetPasswordRequest(BaseModel):
    token: str
    new_password: str

class ReferenceItem(BaseModel):
    model_config = ConfigDict(extra="ignore")
    
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    lote: str
    lot_number: int
    regiao: str
    descricao: str
    unidade: str
    marca_modelo: str
    codigo_item: str
    responsavel: str
    preco_venda_unitario: Optional[float] = None
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class POItem(BaseModel):
    codigo_item: str
    descricao: str = ""
    quantidade: int
    unidade: str = "UN"
    marca_modelo: str = ""
    lote: str = ""
    lot_number: int = 0
    regiao: str = ""
    endereco_entrega: str = ""
    responsavel: str = ""
    status: ItemStatus = ItemStatus.PENDENTE
    link_compra: Optional[str] = None
    preco_compra: Optional[float] = None
    preco_venda: Optional[float] = None
    imposto: Optional[float] = None
    custo_frete: Optional[float] = None
    lucro_liquido: Optional[float] = None
    data_cotacao: Optional[datetime] = None
    data_compra: Optional[datetime] = None
    data_entrega: Optional[datetime] = None

class PurchaseOrder(BaseModel):
    model_config = ConfigDict(extra="ignore")
    
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    numero_oc: str
    cliente: str = "FIEP"
    items: List[POItem]
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    created_by: Optional[str] = None

class PurchaseOrderCreate(BaseModel):
    numero_oc: str
    items: List[POItem]
    created_by: Optional[str] = None

class ItemStatusUpdate(BaseModel):
    status: ItemStatus
    link_compra: Optional[str] = None
    preco_compra: Optional[float] = None
    preco_venda: Optional[float] = None
    imposto: Optional[float] = None
    custo_frete: Optional[float] = None

class DashboardStats(BaseModel):
    total_ocs: int
    total_items: int
    items_pendentes: int
    items_cotados: int
    items_comprados: int
    items_entregues: int
    items_por_responsavel: Dict[str, int]

class AdminSummary(BaseModel):
    numero_oc: str
    codigo_item: str
    nome_item: str
    quem_cotou: str
    preco_compra: Optional[float]
    preco_venda: Optional[float]
    imposto: Optional[float]
    custo_frete: Optional[float]
    lucro_liquido: Optional[float]
    status: str

# Helper function
def get_responsible_by_lot(lot_number: int) -> str:
    return LOT_TO_OWNER.get(lot_number, "Não atribuído")

def extract_oc_from_pdf(pdf_bytes: bytes) -> dict:
    """Extrair dados de OC de um PDF"""
    try:
        doc = fitz.open(stream=pdf_bytes, filetype="pdf")
        full_text = ""
        
        for page in doc:
            full_text += page.get_text()
        
        doc.close()
        
        # Extrair número da OC - procurar por padrões como OC-X.XXXXXX
        oc_patterns = [
            r'OC[- ]?(\d+[\.\d]+)',  # OC-2.121437 ou OC 2.121437
            r'Ordem de Compra[:\s]+(\d+[\.\d]+)',
            r'N[úu]mero[:\s]+(\d+[\.\d]+)'
        ]
        
        numero_oc = None
        for pattern in oc_patterns:
            oc_match = re.search(pattern, full_text, re.IGNORECASE)
            if oc_match:
                numero_oc = f"OC-{oc_match.group(1)}"
                break
        
        if not numero_oc:
            numero_oc = "OC-" + str(uuid.uuid4())[:8]
        
        # Extrair endereço de entrega
        endereco_patterns = [
            r'Endere[çc]o de Entrega[:\s]*(.*?)(?:\n\n|Linha|Item)',
            r'Local de Entrega[:\s]*(.*?)(?:\n\n|Linha|Item)',
            r'Entregar em[:\s]*(.*?)(?:\n\n|Linha|Item)'
        ]
        
        endereco_entrega = ""
        for pattern in endereco_patterns:
            endereco_match = re.search(pattern, full_text, re.IGNORECASE | re.DOTALL)
            if endereco_match:
                endereco_entrega = endereco_match.group(1).strip()
                # Limpar quebras de linha
                endereco_entrega = ' '.join(endereco_entrega.split())
                break
        
        # Extrair região de entrega
        regiao = ""
        regiao_match = re.search(r'Regi[ãa]o[:\s]*(.*?)(?:\n|$)', full_text, re.IGNORECASE)
        if regiao_match:
            regiao = regiao_match.group(1).strip()
        
        # Extrair itens - procurar por código de 6 dígitos seguido de quantidade e descrição
        items = []
        
        # Padrão mais robusto para extrair itens da tabela
        # Procura por: CÓDIGO (6 dígitos) seguido de quantidade e unidade
        lines = full_text.split('\n')
        
        for i, line in enumerate(lines):
            # Procurar por código de 6 dígitos
            codigo_match = re.search(r'\b(\d{6})\b', line)
            if codigo_match:
                codigo = codigo_match.group(1)
                
                # Tentar extrair quantidade e unidade na mesma linha ou próximas
                quantidade = 0
                unidade = "UN"
                
                # Procurar padrão: NÚMERO seguido de UN/KG/PC/M etc
                qty_match = re.search(r'\b(\d+)\s*(UN|UND|UNID|KG|PC|M|L|CX)\b', line, re.IGNORECASE)
                if qty_match:
                    quantidade = int(qty_match.group(1))
                    unidade = qty_match.group(2).upper()
                else:
                    # Procurar nas próximas 2 linhas
                    for j in range(i+1, min(i+3, len(lines))):
                        qty_match = re.search(r'\b(\d+)\s*(UN|UND|UNID|KG|PC|M|L|CX)\b', lines[j], re.IGNORECASE)
                        if qty_match:
                            quantidade = int(qty_match.group(1))
                            unidade = qty_match.group(2).upper()
                            break
                
                if quantidade > 0:
                    # Extrair descrição (geralmente está na linha seguinte ou na mesma linha após o código)
                    descricao = ""
                    
                    # Tentar extrair descrição da linha atual (após o código)
                    desc_part = line.split(codigo, 1)
                    if len(desc_part) > 1:
                        descricao = desc_part[1].strip()
                        # Remover quantidade e unidade se aparecerem na descrição
                        descricao = re.sub(r'\b\d+\s*(UN|UND|UNID|KG|PC|M|L|CX)\b', '', descricao, flags=re.IGNORECASE)
                        descricao = descricao.strip()
                    
                    # Se descrição está vazia, procurar nas próximas linhas
                    if not descricao or len(descricao) < 5:
                        for j in range(i+1, min(i+4, len(lines))):
                            if lines[j].strip() and not re.match(r'^\d+$', lines[j].strip()):
                                descricao = lines[j].strip()
                                break
                    
                    items.append({
                        "codigo_item": codigo,
                        "quantidade": quantidade,
                        "descricao": descricao or f"Item {codigo}",
                        "unidade": unidade,
                        "endereco_entrega": endereco_entrega,
                        "regiao": regiao
                    })
        
        return {
            "numero_oc": numero_oc,
            "items": items,
            "endereco_entrega": endereco_entrega,
            "regiao": regiao
        }
    
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Erro ao processar PDF: {str(e)}")


async def send_password_reset_email(email: str, reset_token: str):
    """Envia email com link de reset de senha"""
    reset_link = f"{os.environ.get('FRONTEND_URL', 'http://localhost:3000')}/reset-password?token={reset_token}"
    
    html_content = f"""
    <!DOCTYPE html>
    <html>
    <head>
        <style>
            body {{ font-family: Arial, sans-serif; line-height: 1.6; color: #333; }}
            .container {{ max-width: 600px; margin: 0 auto; padding: 20px; }}
            .header {{ background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }}
            .content {{ background: #f9f9f9; padding: 30px; border-radius: 0 0 10px 10px; }}
            .button {{ display: inline-block; padding: 12px 30px; background: #667eea; color: white; text-decoration: none; border-radius: 5px; margin: 20px 0; }}
            .footer {{ text-align: center; margin-top: 20px; color: #666; font-size: 12px; }}
        </style>
    </head>
    <body>
        <div class="container">
            <div class="header">
                <h1>FIEP | Gestão OC</h1>
            </div>
            <div class="content">
                <h2>Troca de Senha</h2>
                <p>Olá,</p>
                <p>Você recebeu acesso à plataforma de Gestão de Ordens de Compra FIEP.</p>
                <p>Sua senha temporária é: <strong>on123456</strong></p>
                <p>Por favor, clique no botão abaixo para alterar sua senha:</p>
                <a href="{reset_link}" class="button">Alterar Senha</a>
                <p><small>Ou copie e cole este link no navegador:<br>{reset_link}</small></p>
                <p>Este link expira em 24 horas.</p>
            </div>
            <div class="footer">
                <p>Se você não solicitou este email, por favor ignore.</p>
            </div>
        </div>
    </body>
    </html>
    """
    
    try:
        params = {
            "from": SENDER_EMAIL,
            "to": [email],
            "subject": "Bem-vindo à Plataforma FIEP - Troca de Senha",
            "html": html_content
        }
        await asyncio.to_thread(resend.Emails.send, params)
        return True
    except Exception as e:
        logging.error(f"Erro ao enviar email: {str(e)}")
        return False

# Authentication Routes
@api_router.post("/auth/seed-users")
async def seed_users(force_recreate: bool = False):
    """Criar usuários iniciais do sistema"""
    users_data = [
        # Admins
        {"email": "projetos.onsolucoes@gmail.com", "role": UserRole.ADMIN, "owner_name": None},
        {"email": "comercial.onsolucoes@gmail.com", "role": UserRole.ADMIN, "owner_name": None},
        {"email": "gerencia.onsolucoes@gmail.com", "role": UserRole.ADMIN, "owner_name": None},
        # Users
        {"email": "maria.onsolucoes@gmail.com", "role": UserRole.USER, "owner_name": "Maria"},
        {"email": "mylena.onsolucoes@gmail.com", "role": UserRole.USER, "owner_name": "Mylena"},
        {"email": "fabioonsolucoes@gmail.com", "role": UserRole.USER, "owner_name": "Fabio"},
    ]
    
    default_password = "on123456"
    created_count = 0
    
    # Se force_recreate, deletar todos os usuários
    if force_recreate:
        await db.users.delete_many({})
    
    for user_data in users_data:
        # Verificar se usuário já existe
        existing = await db.users.find_one({"email": user_data["email"]}, {"_id": 0})
        if existing and not force_recreate:
            continue
        
        # Se existe e force_recreate, deletar
        if existing and force_recreate:
            await db.users.delete_one({"email": user_data["email"]})
        
        # Criar reset token
        reset_token = str(uuid.uuid4())
        reset_expires = datetime.now(timezone.utc) + timedelta(hours=24)
        
        user = User(
            email=user_data["email"],
            hashed_password=get_password_hash(default_password),
            role=user_data["role"],
            owner_name=user_data["owner_name"],
            needs_password_change=False,  # Não forçar troca de senha
            reset_token=reset_token,
            reset_token_expires=reset_expires
        )
        
        doc = user.model_dump()
        doc['created_at'] = doc['created_at'].isoformat()
        if doc['reset_token_expires']:
            doc['reset_token_expires'] = doc['reset_token_expires'].isoformat()
        
        await db.users.insert_one(doc)
        
        # Enviar email apenas se RESEND_API_KEY estiver configurado
        if os.environ.get('RESEND_API_KEY'):
            await send_password_reset_email(user.email, reset_token)
        
        created_count += 1
    
    return {"message": f"{created_count} usuários criados com senha padrão: on123456"}

@api_router.post("/auth/login", response_model=LoginResponse)
async def login(request: LoginRequest):
    """Login de usuário"""
    user = await db.users.find_one({"email": request.email}, {"_id": 0})
    
    if not user or not verify_password(request.password, user['hashed_password']):
        raise HTTPException(status_code=401, detail="Email ou senha incorretos")
    
    # Criar token
    access_token = create_access_token(
        data={
            "sub": user['email'],
            "role": user['role'],
            "owner_name": user.get('owner_name'),
            "user_id": user['id']
        }
    )
    
    return LoginResponse(
        access_token=access_token,
        user={
            "email": user['email'],
            "role": user['role'],
            "owner_name": user.get('owner_name'),
            "needs_password_change": user.get('needs_password_change', False)
        }
    )

@api_router.post("/auth/change-password")
async def change_password(request: ChangePasswordRequest, current_user: dict = Depends(get_current_user)):
    """Trocar senha do usuário logado"""
    user = await db.users.find_one({"email": current_user['sub']}, {"_id": 0})
    
    if not user or not verify_password(request.current_password, user['hashed_password']):
        raise HTTPException(status_code=401, detail="Senha atual incorreta")
    
    # Atualizar senha
    new_hashed = get_password_hash(request.new_password)
    await db.users.update_one(
        {"email": current_user['sub']},
        {"$set": {
            "hashed_password": new_hashed,
            "needs_password_change": False,
            "reset_token": None,
            "reset_token_expires": None
        }}
    )
    
    return {"message": "Senha alterada com sucesso"}

@api_router.post("/auth/reset-password")
async def reset_password(request: ResetPasswordRequest):
    """Solicitar reset de senha"""
    user = await db.users.find_one({"email": request.email}, {"_id": 0})
    
    if not user:
        # Não revelar se email existe
        return {"message": "Se o email existir, você receberá instruções"}
    
    # Gerar token
    reset_token = str(uuid.uuid4())
    reset_expires = datetime.now(timezone.utc) + timedelta(hours=24)
    
    await db.users.update_one(
        {"email": request.email},
        {"$set": {
            "reset_token": reset_token,
            "reset_token_expires": reset_expires.isoformat()
        }}
    )
    
    # Enviar email
    await send_password_reset_email(request.email, reset_token)
    
    return {"message": "Se o email existir, você receberá instruções"}

@api_router.post("/auth/confirm-reset-password")
async def confirm_reset_password(request: ConfirmResetPasswordRequest):
    """Confirmar reset de senha com token"""
    user = await db.users.find_one({"reset_token": request.token}, {"_id": 0})
    
    if not user:
        raise HTTPException(status_code=400, detail="Token inválido")
    
    # Verificar expiração
    if user.get('reset_token_expires'):
        expires = datetime.fromisoformat(user['reset_token_expires'])
        if datetime.now(timezone.utc) > expires:
            raise HTTPException(status_code=400, detail="Token expirado")
    
    # Atualizar senha
    new_hashed = get_password_hash(request.new_password)
    await db.users.update_one(
        {"reset_token": request.token},
        {"$set": {
            "hashed_password": new_hashed,
            "needs_password_change": False,
            "reset_token": None,
            "reset_token_expires": None
        }}
    )
    
    return {"message": "Senha alterada com sucesso"}

@api_router.get("/auth/me")
async def get_me(current_user: dict = Depends(get_current_user)):
    """Obter informações do usuário logado"""
    return current_user

# Routes
@api_router.get("/")
async def root():
    return {"message": "Sistema de Gestão de Ordens de Compra FIEP"}

@api_router.post("/reference-items/seed")
async def seed_reference_items(current_user: dict = Depends(require_admin)):
    """Popula banco com itens de referência do Excel (ADMIN ONLY)"""
    try:
        file_path = Path("/app/items_data.xlsx")
        if not file_path.exists():
            raise HTTPException(status_code=404, detail="Arquivo Excel não encontrado")
        
        wb = openpyxl.load_workbook(file_path)
        sheet = wb.active
        
        items = []
        for row in sheet.iter_rows(min_row=2, values_only=True):
            lote_str = str(row[0]) if row[0] else ""
            codigo_item = str(row[12]) if row[12] else ""
            
            if not lote_str or not codigo_item:
                continue
            
            try:
                lot_number = int(lote_str.replace("Lote", "").replace("lote", "").strip())
            except:
                continue
            
            responsavel = get_responsible_by_lot(lot_number)
            
            # Extrair preço unitário (coluna F - index 5)
            preco_venda = None
            if row[5] is not None:
                try:
                    preco_venda = float(row[5])
                except:
                    pass
            
            item = ReferenceItem(
                lote=lote_str,
                lot_number=lot_number,
                regiao=str(row[1]) if row[1] else "",
                descricao=str(row[2]) if row[2] else "",
                unidade=str(row[3]) if row[3] else "",
                marca_modelo=str(row[11]) if row[11] else "",
                codigo_item=codigo_item,
                responsavel=responsavel,
                preco_venda_unitario=preco_venda
            )
            items.append(item.model_dump())
        
        await db.reference_items.delete_many({})
        
        if items:
            for item in items:
                item['created_at'] = item['created_at'].isoformat()
            await db.reference_items.insert_many(items)
        
        return {"message": f"{len(items)} itens de referência carregados com sucesso"}
    
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Erro ao carregar itens: {str(e)}")

@api_router.get("/reference-items", response_model=List[ReferenceItem])
async def get_reference_items(codigo: Optional[str] = None, current_user: dict = Depends(get_current_user)):
    query = {}
    if codigo:
        query["codigo_item"] = codigo
    
    items = await db.reference_items.find(query, {"_id": 0}).to_list(5000)
    for item in items:
        if isinstance(item['created_at'], str):
            item['created_at'] = datetime.fromisoformat(item['created_at'])
    return items

@api_router.post("/purchase-orders/upload-pdf")
async def upload_pdf_purchase_order(file: UploadFile = File(...), current_user: dict = Depends(require_admin)):
    """Upload de PDF de Ordem de Compra (ADMIN ONLY)"""
    
    if not file.filename.endswith('.pdf'):
        raise HTTPException(status_code=400, detail="Apenas arquivos PDF são aceitos")
    
    # Ler conteúdo do PDF
    pdf_content = await file.read()
    
    # Extrair dados
    oc_data = extract_oc_from_pdf(pdf_content)
    
    if not oc_data["items"]:
        raise HTTPException(status_code=400, detail="Nenhum item encontrado no PDF. Verifique o formato do arquivo.")
    
    # Processar itens com dados de referência
    processed_items = []
    items_without_ref = []
    
    import random
    
    for item in oc_data["items"]:
        # Buscar TODAS as ocorrências deste código (em todos os lotes)
        ref_items = await db.reference_items.find(
            {"codigo_item": item["codigo_item"]},
            {"_id": 0}
        ).to_list(100)
        
        if ref_items:
            # Se existem múltiplas ocorrências (item em vários lotes)
            if len(ref_items) > 1:
                # Pegar apenas responsáveis não-admin
                non_admin_items = [ri for ri in ref_items if ri['responsavel'] in ['Maria', 'Mylena', 'Fabio']]
                
                if non_admin_items:
                    # Escolher aleatoriamente entre os não-admins
                    selected_ref = random.choice(non_admin_items)
                else:
                    # Se não houver não-admins, usar o primeiro disponível
                    selected_ref = ref_items[0]
            else:
                # Se existe apenas uma ocorrência, usar ela
                selected_ref = ref_items[0]
            
            # Preencher dados
            item["responsavel"] = selected_ref['responsavel']
            item["lote"] = selected_ref['lote']
            item["lot_number"] = selected_ref['lot_number']
            item["regiao"] = selected_ref['regiao']
            if not item.get("descricao") or len(item["descricao"]) < 10:
                item["descricao"] = selected_ref['descricao']
            if not item.get("marca_modelo"):
                item["marca_modelo"] = selected_ref.get('marca_modelo', '')
            
            # Preencher preço de venda
            if selected_ref.get('preco_venda_unitario'):
                item["preco_venda"] = selected_ref['preco_venda_unitario']
                # Calcular imposto (11%)
                item["imposto"] = round(item["preco_venda"] * item["quantidade"] * 0.11, 2)
        else:
            # Item não encontrado na referência
            items_without_ref.append(item["codigo_item"])
            item["responsavel"] = "⚠️ NÃO ENCONTRADO"
            item["lote"] = "⚠️ NÃO ENCONTRADO"
            item["lot_number"] = 0
            item["regiao"] = item.get("regiao", "")
            item["marca_modelo"] = ""
            if not item.get("descricao"):
                item["descricao"] = f"Item {item['codigo_item']}"
        
        # Garantir que todos os campos obrigatórios existem
        item.setdefault("status", ItemStatus.PENDENTE)
        item.setdefault("preco_compra", None)
        item.setdefault("preco_venda", None)
        item.setdefault("imposto", None)
        item.setdefault("custo_frete", None)
        item.setdefault("lucro_liquido", None)
        
        po_item = POItem(**item)
        processed_items.append(po_item)
    
    # Criar OC
    po = PurchaseOrder(
        numero_oc=oc_data["numero_oc"],
        items=processed_items,
        created_by=current_user.get('sub')
    )
    
    doc = po.model_dump()
    doc['created_at'] = doc['created_at'].isoformat()
    
    await db.purchase_orders.insert_one(doc)
    
    warning = ""
    if items_without_ref:
        warning = f" ATENÇÃO: {len(items_without_ref)} itens não encontrados no banco de referência: {', '.join(items_without_ref[:5])}"
    
    return {
        "success": True,
        "message": f"OC criada com sucesso a partir do PDF{warning}",
        "po_id": po.id,
        "numero_oc": po.numero_oc,
        "total_items": len(processed_items),
        "items_without_ref": items_without_ref
    }

@api_router.post("/purchase-orders", response_model=PurchaseOrder)
async def create_purchase_order(po_create: PurchaseOrderCreate, current_user: dict = Depends(require_admin)):
    """Criar nova Ordem de Compra (ADMIN ONLY)"""
    
    processed_items = []
    items_not_found = []
    
    for item in po_create.items:
        # Buscar TODAS as ocorrências deste código (em todos os lotes)
        ref_items = await db.reference_items.find(
            {"codigo_item": item.codigo_item},
            {"_id": 0}
        ).to_list(100)
        
        if ref_items:
            # Se existem múltiplas ocorrências (item em vários lotes)
            if len(ref_items) > 1:
                # Pegar apenas responsáveis não-admin
                import random
                non_admin_items = [ri for ri in ref_items if ri['responsavel'] in ['Maria', 'Mylena', 'Fabio']]
                
                if non_admin_items:
                    # Escolher aleatoriamente entre os não-admins
                    selected_ref = random.choice(non_admin_items)
                else:
                    # Se não houver não-admins, usar o primeiro disponível
                    selected_ref = ref_items[0]
            else:
                # Se existe apenas uma ocorrência, usar ela
                selected_ref = ref_items[0]
            
            # Preencher com dados da referência selecionada
            item.responsavel = selected_ref['responsavel']
            item.lote = selected_ref['lote']
            item.lot_number = selected_ref['lot_number']
            item.regiao = selected_ref.get('regiao', item.regiao or '')
            if not item.descricao or len(item.descricao) < 10:
                item.descricao = selected_ref['descricao']
            if not item.marca_modelo:
                item.marca_modelo = selected_ref.get('marca_modelo', '')
            
            # Preencher preço de venda automaticamente
            if not item.preco_venda and selected_ref.get('preco_venda_unitario'):
                item.preco_venda = selected_ref['preco_venda_unitario']
            
            # Calcular imposto automaticamente (11% do preço de venda total)
            if item.preco_venda and not item.imposto:
                item.imposto = round(item.preco_venda * item.quantidade * 0.11, 2)
        else:
            # Item não encontrado - marcar claramente
            items_not_found.append(item.codigo_item)
            if not item.responsavel:
                item.responsavel = "⚠️ NÃO ENCONTRADO"
            if not item.lote:
                item.lote = "⚠️ NÃO ENCONTRADO"
            if not item.regiao:
                item.regiao = item.regiao or "Verificar PDF"
            item.lot_number = 0
            if not item.descricao:
                item.descricao = f"Item {item.codigo_item} - VERIFICAR MANUALMENTE"
        
        processed_items.append(item)
    
    po = PurchaseOrder(
        numero_oc=po_create.numero_oc,
        items=processed_items,
        created_by=current_user.get('sub')
    )
    
    doc = po.model_dump()
    doc['created_at'] = doc['created_at'].isoformat()
    
    await db.purchase_orders.insert_one(doc)
    
    return po

@api_router.get("/purchase-orders", response_model=List[PurchaseOrder])
async def get_purchase_orders(current_user: dict = Depends(get_current_user)):
    """Listar Ordens de Compra"""
    query = {}
    
    pos = await db.purchase_orders.find(query, {"_id": 0}).to_list(1000)
    
    for po in pos:
        if isinstance(po['created_at'], str):
            po['created_at'] = datetime.fromisoformat(po['created_at'])
        
        # Se não for admin, filtrar apenas itens do responsável
        if current_user['role'] != 'admin' and current_user.get('owner_name'):
            po['items'] = [item for item in po['items'] if item.get('responsavel') == current_user['owner_name']]
    
    return pos

@api_router.get("/purchase-orders/{po_id}", response_model=PurchaseOrder)
async def get_purchase_order(po_id: str, current_user: dict = Depends(get_current_user)):
    """Obter detalhes de uma OC"""
    po = await db.purchase_orders.find_one({"id": po_id}, {"_id": 0})
    
    if not po:
        raise HTTPException(status_code=404, detail="Ordem de Compra não encontrada")
    
    if isinstance(po['created_at'], str):
        po['created_at'] = datetime.fromisoformat(po['created_at'])
    
    # Se não for admin, filtrar apenas itens do responsável
    if current_user['role'] != 'admin' and current_user.get('owner_name'):
        po['items'] = [item for item in po['items'] if item.get('responsavel') == current_user['owner_name']]
    
    return po

@api_router.delete("/purchase-orders/{po_id}")
async def delete_purchase_order(po_id: str, current_user: dict = Depends(require_admin)):
    """Deletar uma OC (ADMIN ONLY)"""
    result = await db.purchase_orders.delete_one({"id": po_id})
    
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Ordem de Compra não encontrada")
    
    return {"message": "Ordem de Compra deletada com sucesso"}

@api_router.put("/purchase-orders/{po_id}")
async def update_purchase_order(po_id: str, po_update: PurchaseOrderCreate, current_user: dict = Depends(require_admin)):
    """Atualizar uma OC (ADMIN ONLY)"""
    po = await db.purchase_orders.find_one({"id": po_id}, {"_id": 0})
    
    if not po:
        raise HTTPException(status_code=404, detail="Ordem de Compra não encontrada")
    
    # Processar itens
    processed_items = []
    for item in po_update.items:
        ref_item = await db.reference_items.find_one(
            {"codigo_item": item.codigo_item},
            {"_id": 0}
        )
        
        if ref_item:
            item.responsavel = ref_item['responsavel']
            item.lote = ref_item['lote']
            item.lot_number = ref_item['lot_number']
            item.regiao = ref_item['regiao']
            if not item.descricao:
                item.descricao = ref_item['descricao']
            if not item.marca_modelo:
                item.marca_modelo = ref_item['marca_modelo']
        
        processed_items.append(item)
    
    # Atualizar
    await db.purchase_orders.update_one(
        {"id": po_id},
        {"$set": {
            "numero_oc": po_update.numero_oc,
            "items": [item.model_dump() for item in processed_items]
        }}
    )
    
    return {"message": "Ordem de Compra atualizada com sucesso"}

@api_router.patch("/purchase-orders/{po_id}/items/{codigo_item}")
async def update_item_status(po_id: str, codigo_item: str, update: ItemStatusUpdate, current_user: dict = Depends(get_current_user)):
    """Atualizar status de um item"""
    po = await db.purchase_orders.find_one({"id": po_id}, {"_id": 0})
    
    if not po:
        raise HTTPException(status_code=404, detail="Ordem de Compra não encontrada")
    
    item_updated = False
    for item in po['items']:
        if item['codigo_item'] == codigo_item:
            # Verificar permissão
            if current_user['role'] != 'admin' and item.get('responsavel') != current_user.get('owner_name'):
                raise HTTPException(status_code=403, detail="Você só pode editar seus próprios itens")
            
            item['status'] = update.status
            
            # Apenas admins podem editar preços
            if current_user['role'] == 'admin':
                if update.preco_compra is not None:
                    item['preco_compra'] = update.preco_compra
                if update.preco_venda is not None:
                    item['preco_venda'] = update.preco_venda
                if update.imposto is not None:
                    item['imposto'] = update.imposto
                if update.custo_frete is not None:
                    item['custo_frete'] = update.custo_frete
                
                # Calcular lucro líquido
                if (item.get('preco_venda') is not None and 
                    item.get('preco_compra') is not None):
                    lucro_bruto = (item['preco_venda'] - item['preco_compra']) * item['quantidade']
                    impostos = item.get('imposto', 0)
                    frete = item.get('custo_frete', 0)
                    item['lucro_liquido'] = lucro_bruto - impostos - frete
            
            # Atualizar datas
            now = datetime.now(timezone.utc).isoformat()
            if update.status == ItemStatus.COTADO:
                item['data_cotacao'] = now
            elif update.status == ItemStatus.COMPRADO:
                item['data_compra'] = now
            elif update.status == ItemStatus.ENTREGUE:
                item['data_entrega'] = now
            
            item_updated = True
            break
    
    if not item_updated:
        raise HTTPException(status_code=404, detail="Item não encontrado")
    
    await db.purchase_orders.update_one(
        {"id": po_id},
        {"$set": {"items": po['items']}}
    )
    
    return {"message": "Item atualizado com sucesso"}

@api_router.get("/dashboard", response_model=DashboardStats)
async def get_dashboard_stats(current_user: dict = Depends(get_current_user)):
    """Estatísticas do dashboard"""
    pos = await db.purchase_orders.find({}, {"_id": 0}).to_list(1000)
    
    total_ocs = len(pos)
    all_items = []
    for po in pos:
        # Filtrar itens baseado no role
        if current_user['role'] != 'admin' and current_user.get('owner_name'):
            filtered_items = [item for item in po['items'] if item.get('responsavel') == current_user['owner_name']]
            all_items.extend(filtered_items)
        else:
            all_items.extend(po['items'])
    
    total_items = len(all_items)
    items_pendentes = sum(1 for item in all_items if item['status'] == ItemStatus.PENDENTE)
    items_cotados = sum(1 for item in all_items if item['status'] == ItemStatus.COTADO)
    items_comprados = sum(1 for item in all_items if item['status'] == ItemStatus.COMPRADO)
    items_entregues = sum(1 for item in all_items if item['status'] == ItemStatus.ENTREGUE)
    
    items_por_responsavel = {}
    for owner in ['Maria', 'Mateus', 'João', 'Mylena', 'Fabio']:
        items_por_responsavel[owner] = sum(1 for item in all_items if item.get('responsavel') == owner)
    
    return DashboardStats(
        total_ocs=total_ocs,
        total_items=total_items,
        items_pendentes=items_pendentes,
        items_cotados=items_cotados,
        items_comprados=items_comprados,
        items_entregues=items_entregues,
        items_por_responsavel=items_por_responsavel
    )

@api_router.get("/admin/summary", response_model=List[AdminSummary])
async def get_admin_summary(current_user: dict = Depends(require_admin)):
    """Resumo financeiro para admins (ADMIN ONLY)"""
    pos = await db.purchase_orders.find({}, {"_id": 0}).to_list(1000)
    
    summaries = []
    for po in pos:
        for item in po['items']:
            if item.get('preco_compra') or item.get('preco_venda'):
                summary = AdminSummary(
                    numero_oc=po['numero_oc'],
                    codigo_item=item['codigo_item'],
                    nome_item=item['descricao'][:50] + "..." if len(item['descricao']) > 50 else item['descricao'],
                    quem_cotou=item.get('responsavel', 'N/A'),
                    preco_compra=item.get('preco_compra'),
                    preco_venda=item.get('preco_venda'),
                    imposto=item.get('imposto'),
                    custo_frete=item.get('custo_frete'),
                    lucro_liquido=item.get('lucro_liquido'),
                    status=item['status']
                )
                summaries.append(summary)
    
    return summaries

@api_router.get("/items/duplicates")
async def get_duplicate_items(current_user: dict = Depends(get_current_user)):
    """Encontrar itens duplicados por código"""
    pos = await db.purchase_orders.find({}, {"_id": 0}).to_list(1000)
    
    codigo_count = {}
    for po in pos:
        items_to_check = po['items']
        
        # Filtrar por responsável se não for admin
        if current_user['role'] != 'admin' and current_user.get('owner_name'):
            items_to_check = [item for item in po['items'] if item.get('responsavel') == current_user['owner_name']]
        
        for item in items_to_check:
            codigo = item['codigo_item']
            if codigo not in codigo_count:
                codigo_count[codigo] = []
            codigo_count[codigo].append({
                'numero_oc': po['numero_oc'],
                'quantidade': item['quantidade'],
                'status': item['status']
            })
    
    duplicates = {codigo: occurrences for codigo, occurrences in codigo_count.items() if len(occurrences) > 1}
    
    return {
        "total_duplicados": len(duplicates),
        "duplicados": duplicates
    }

# Include the router in the main app
app.include_router(api_router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=os.environ.get('CORS_ORIGINS', '*').split(','),
    allow_methods=["*"],
    allow_headers=["*"],
)

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()
