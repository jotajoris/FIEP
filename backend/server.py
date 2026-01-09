from fastapi import FastAPI, APIRouter, HTTPException, Depends, UploadFile, File
from fastapi.security import HTTPBearer
from fastapi.responses import JSONResponse
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

# Background task control
rastreio_task = None

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

# Health check endpoint (for Kubernetes)
@app.get("/health")
async def health_check():
    """Health check endpoint for Kubernetes deployment"""
    return {"status": "healthy", "service": "fiep-oc-backend"}

class UserRole(str, Enum):
    ADMIN = "admin"
    USER = "user"

class ItemStatus(str, Enum):
    PENDENTE = "pendente"
    COTADO = "cotado"
    COMPRADO = "comprado"
    EM_SEPARACAO = "em_separacao"
    EM_TRANSITO = "em_transito"
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

class FonteCompra(BaseModel):
    """Representa uma fonte/local de compra para um item"""
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    quantidade: int
    preco_unitario: float
    frete: float = 0
    link: str = ""
    fornecedor: str = ""

class Notificacao(BaseModel):
    """Notificação de evento do sistema"""
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    tipo: str  # "entrega", "novo_item", etc
    titulo: str
    numero_oc: str
    codigo_item: str
    descricao_item: str
    lida: bool = False
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
    frete_compra: Optional[float] = None
    frete_envio: Optional[float] = None
    lucro_liquido: Optional[float] = None
    fontes_compra: List[FonteCompra] = []  # Lista de fontes/locais de compra
    data_cotacao: Optional[datetime] = None
    data_compra: Optional[datetime] = None
    data_envio: Optional[datetime] = None  # Data de envio (quando entrou em trânsito)
    data_entrega: Optional[datetime] = None
    codigo_rastreio: Optional[str] = None  # Código de rastreio dos Correios
    rastreio_eventos: List[dict] = []  # Histórico de eventos do rastreio

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
    frete_compra: Optional[float] = None
    frete_envio: Optional[float] = None
    fontes_compra: Optional[List[FonteCompra]] = None
    codigo_rastreio: Optional[str] = None  # Código de rastreio dos Correios

class ItemFullUpdate(BaseModel):
    """Atualização completa do item - apenas admin"""
    descricao: Optional[str] = None
    quantidade: Optional[int] = None
    unidade: Optional[str] = None
    responsavel: Optional[str] = None
    lote: Optional[str] = None
    marca_modelo: Optional[str] = None
    status: Optional[str] = None
    preco_venda: Optional[float] = None

class DashboardStats(BaseModel):
    total_ocs: int
    total_items: int
    items_pendentes: int
    items_cotados: int
    items_comprados: int
    items_em_separacao: int
    items_em_transito: int
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
    frete_compra: Optional[float]
    frete_envio: Optional[float]
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
                endereco_entrega = ' '.join(endereco_entrega.split())
                break
        
        # Extrair região de entrega
        regiao = ""
        regiao_match = re.search(r'Regi[ãa]o[:\s]*(.*?)(?:\n|$)', full_text, re.IGNORECASE)
        if regiao_match:
            regiao = regiao_match.group(1).strip()
        
        # ========== PARSER MELHORADO PARA PDFS FIEP ==========
        items = []
        seen_items = set()
        lines = full_text.split('\n')
        
        # Códigos de produto FIEP começam com 0 ou 1 (ex: 089847, 114720)
        # Códigos NCM começam com 8 ou 9 (ex: 853890, 903180) - ignorar
        
        for i, line in enumerate(lines):
            line_stripped = line.strip()
            
            # Procurar código de 6 dígitos que começa com 0 ou 1
            if re.match(r'^([01]\d{5})$', line_stripped):
                codigo = line_stripped
                
                # Verificar se linha anterior é número de linha (1-50)
                if i > 0:
                    prev = lines[i-1].strip()
                    if re.match(r'^\d{1,2}$', prev):
                        try:
                            linha_num = int(prev)
                            if 1 <= linha_num <= 100:
                                # Procurar quantidade nas próximas linhas (aumentado para 40 linhas para descrições longas)
                                quantidade = 0
                                unidade = "UN"
                                descricao_parts = []
                                preco_pdf = None  # Inicializar aqui
                                
                                for j in range(i+1, min(i+40, len(lines))):
                                    check_line = lines[j].strip()
                                    
                                    # Se encontrar outro código de produto, parar
                                    if re.match(r'^([01]\d{5})$', check_line):
                                        break
                                    
                                    # Coletar descrição (até encontrar quantidade)
                                    if len(check_line) > 2 and not re.match(r'^[\d.,]+$', check_line):
                                        if check_line not in ['UN', 'UND', 'UNID', 'KG', 'PC', 'M', 'L', 'CX', 'PAR', 'KIT']:
                                            if 'Descritivo Completo' not in check_line and 'CFOP' not in check_line:
                                                descricao_parts.append(check_line)
                                    
                                    # Procurar quantidade (número isolado seguido de unidade)
                                    qty_match = re.match(r'^(\d+)$', check_line)
                                    if qty_match and quantidade == 0:
                                        qty = int(qty_match.group(1))
                                        # Verificar se próxima linha é unidade
                                        if j+1 < len(lines):
                                            unit_line = lines[j+1].strip().upper()
                                            # Lista expandida de unidades aceitas
                                            valid_units = ['UN', 'UND', 'UNID', 'KG', 'PC', 'PÇA', 'PÇ', 'PCA', 'M', 'L', 'CX', 'PAR', 'PCT', 'KIT', 'JG', 'JOGO', 'RL', 'ROLO', 'MT', 'METRO']
                                            if unit_line in valid_units:
                                                quantidade = qty
                                                # Normalizar unidades
                                                if unit_line in ['UND', 'UNID', 'PÇA', 'PÇ', 'PCA', 'PC']:
                                                    unidade = 'UN'
                                                elif unit_line in ['MT', 'METRO']:
                                                    unidade = 'M'
                                                elif unit_line in ['JOGO']:
                                                    unidade = 'JG'
                                                elif unit_line in ['ROLO']:
                                                    unidade = 'RL'
                                                else:
                                                    unidade = unit_line
                                                
                                                # EXTRAIR PREÇO: Após a unidade vem o preço unitário (formato: 518,95)
                                                # Estrutura: QTD -> UN -> PREÇO_UNITARIO -> TOTAL
                                                preco_pdf = None
                                                if j+2 < len(lines):
                                                    preco_line = lines[j+2].strip()
                                                    # Preço no formato brasileiro: 518,95 ou 1.234,56
                                                    preco_match = re.match(r'^(\d{1,3}(?:\.\d{3})*,\d{2})$', preco_line)
                                                    if preco_match:
                                                        # Converter formato BR para float
                                                        preco_str = preco_match.group(1).replace('.', '').replace(',', '.')
                                                        try:
                                                            preco_pdf = float(preco_str)
                                                        except:
                                                            pass
                                                
                                                break
                                
                                if quantidade > 0:
                                    key = f"{linha_num}-{codigo}"
                                    if key not in seen_items:
                                        seen_items.add(key)
                                        descricao = ' '.join(descricao_parts[:6]) if descricao_parts else f"Item {codigo}"
                                        item_data = {
                                            "codigo_item": codigo,
                                            "quantidade": quantidade,
                                            "descricao": descricao[:250],
                                            "unidade": unidade,
                                            "endereco_entrega": endereco_entrega,
                                            "regiao": regiao
                                        }
                                        # Adicionar preço extraído do PDF se encontrado
                                        try:
                                            if preco_pdf is not None:
                                                item_data["preco_venda_pdf"] = preco_pdf
                                        except NameError:
                                            pass
                                        items.append(item_data)
                        except ValueError:
                            pass
        
        # Método 2 (fallback): Se NENHUM item encontrado, tentar padrão mais genérico
        if len(items) == 0:
            items = []
            seen_codes = set()
            
            for i, line in enumerate(lines):
                # Procurar códigos que começam com 0 ou 1
                codigo_match = re.search(r'\b([01]\d{5})\b', line)
                if codigo_match:
                    codigo = codigo_match.group(1)
                    
                    if codigo in seen_codes:
                        continue
                    
                    # Procurar quantidade
                    quantidade = 0
                    unidade = "UN"
                    
                    qty_match = re.search(r'\b(\d+)\s*(UN|UND|UNID|KG|PC|M|L|CX|KIT)\b', line, re.IGNORECASE)
                    if qty_match:
                        quantidade = int(qty_match.group(1))
                        unidade = qty_match.group(2).upper()
                    else:
                        for j in range(i+1, min(i+8, len(lines))):
                            qty_match = re.search(r'\b(\d+)\s*(UN|UND|UNID|KG|PC|M|L|CX|KIT)\b', lines[j], re.IGNORECASE)
                            if qty_match:
                                quantidade = int(qty_match.group(1))
                                unidade = qty_match.group(2).upper()
                                break
                    
                    if quantidade > 0:
                        seen_codes.add(codigo)
                        items.append({
                            "codigo_item": codigo,
                            "quantidade": quantidade,
                            "descricao": f"Item {codigo}",
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
        # Admins (com owner_name associado)
        {"email": "projetos.onsolucoes@gmail.com", "role": UserRole.ADMIN, "owner_name": "João"},
        {"email": "comercial.onsolucoes@gmail.com", "role": UserRole.ADMIN, "owner_name": "Mateus"},
        {"email": "gerencia.onsolucoes@gmail.com", "role": UserRole.ADMIN, "owner_name": "Roberto"},
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

class UpdateProfileRequest(BaseModel):
    owner_name: str

@api_router.patch("/auth/profile")
async def update_profile(request: UpdateProfileRequest, current_user: dict = Depends(get_current_user)):
    """Atualizar perfil do usuário logado"""
    await db.users.update_one(
        {"email": current_user['sub']},
        {"$set": {"owner_name": request.owner_name}}
    )
    
    return {"message": "Perfil atualizado com sucesso", "owner_name": request.owner_name}

@api_router.get("/auth/me")
async def get_current_user_profile(current_user: dict = Depends(get_current_user)):
    """Obter dados do usuário logado"""
    user = await db.users.find_one({"email": current_user['sub']}, {"_id": 0, "hashed_password": 0})
    if not user:
        raise HTTPException(status_code=404, detail="Usuário não encontrado")
    return user

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

@api_router.post("/purchase-orders/preview-pdf")
async def preview_pdf_purchase_order(file: UploadFile = File(...), current_user: dict = Depends(require_admin)):
    """Preview de PDF de Ordem de Compra - retorna itens sem criar OC (ADMIN ONLY)"""
    
    if not file.filename.endswith('.pdf'):
        raise HTTPException(status_code=400, detail="Apenas arquivos PDF são aceitos")
    
    # Ler conteúdo do PDF
    pdf_content = await file.read()
    
    # Extrair dados
    oc_data = extract_oc_from_pdf(pdf_content)
    
    if not oc_data["items"]:
        raise HTTPException(status_code=400, detail="Nenhum item encontrado no PDF. Verifique o formato do arquivo.")
    
    # Processar itens com dados de referência (preview apenas)
    preview_items = []
    items_without_ref = []
    
    import random
    
    for item in oc_data["items"]:
        # Buscar TODAS as ocorrências deste código (em todos os lotes)
        ref_items = await db.reference_items.find(
            {"codigo_item": item["codigo_item"]},
            {"_id": 0}
        ).to_list(100)
        
        preview_item = {
            "codigo_item": item["codigo_item"],
            "quantidade": item["quantidade"],
            "unidade": item.get("unidade", "UN"),
            "descricao": item.get("descricao", ""),
            "endereco_entrega": item.get("endereco_entrega", ""),
            "regiao": item.get("regiao", "")
        }
        
        # PRIORIDADE: Usar preço do PDF se disponível
        if item.get("preco_venda_pdf"):
            preview_item["preco_venda"] = item["preco_venda_pdf"]
        
        if ref_items:
            if len(ref_items) > 1:
                non_admin_items = [ri for ri in ref_items if ri['responsavel'] in ['Maria', 'Mylena', 'Fabio']]
                selected_ref = random.choice(non_admin_items) if non_admin_items else ref_items[0]
            else:
                selected_ref = ref_items[0]
            
            preview_item["responsavel"] = selected_ref['responsavel']
            preview_item["lote"] = selected_ref['lote']
            preview_item["marca_modelo"] = selected_ref.get('marca_modelo', '')
            if not preview_item["descricao"] or len(preview_item["descricao"]) < 10:
                preview_item["descricao"] = selected_ref['descricao']
            
            # Só usa preço da planilha se não tiver preço do PDF
            if not preview_item.get("preco_venda") and selected_ref.get('preco_venda_unitario'):
                preview_item["preco_venda"] = selected_ref['preco_venda_unitario']
        else:
            items_without_ref.append(item["codigo_item"])
            preview_item["responsavel"] = "⚠️ NÃO ENCONTRADO"
            preview_item["lote"] = "⚠️ NÃO ENCONTRADO"
            preview_item["marca_modelo"] = ""
        
        preview_items.append(preview_item)
    
    return {
        "numero_oc": oc_data["numero_oc"],
        "endereco_entrega": oc_data.get("endereco_entrega", ""),
        "items": preview_items,
        "total_items": len(preview_items),
        "items_without_ref": items_without_ref
    }

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
    
    # Verificar se OC já existe
    existing_po = await db.purchase_orders.find_one({"numero_oc": oc_data["numero_oc"]}, {"_id": 0})
    if existing_po:
        raise HTTPException(status_code=409, detail=f"Ordem de Compra {oc_data['numero_oc']} já existe no sistema")
    
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

@api_router.post("/purchase-orders/upload-multiple-pdfs")
async def upload_multiple_pdfs(files: List[UploadFile] = File(...), current_user: dict = Depends(require_admin)):
    """Upload de múltiplos PDFs de Ordens de Compra (ADMIN ONLY)"""
    import random
    
    results = {
        "success": [],
        "failed": [],
        "duplicates": [],
        "total_processed": 0,
        "total_items_created": 0
    }
    
    for file in files:
        try:
            if not file.filename.endswith('.pdf'):
                results["failed"].append({
                    "filename": file.filename,
                    "error": "Arquivo não é PDF"
                })
                continue
            
            # Ler conteúdo do PDF
            pdf_content = await file.read()
            
            # Extrair dados
            oc_data = extract_oc_from_pdf(pdf_content)
            
            if not oc_data.get("items"):
                results["failed"].append({
                    "filename": file.filename,
                    "error": "Nenhum item encontrado no PDF"
                })
                continue
            
            # Verificar se OC já existe
            existing_po = await db.purchase_orders.find_one({"numero_oc": oc_data["numero_oc"]}, {"_id": 0})
            if existing_po:
                results["duplicates"].append({
                    "filename": file.filename,
                    "numero_oc": oc_data["numero_oc"],
                    "existing_id": existing_po["id"]
                })
                continue
            
            # Processar itens com dados de referência
            processed_items = []
            
            for item in oc_data["items"]:
                # Buscar referência
                ref_items = await db.reference_items.find(
                    {"codigo_item": item["codigo_item"]},
                    {"_id": 0}
                ).to_list(100)
                
                responsavel = item.get("responsavel", "")
                lote = item.get("lote", "")
                lot_number = 0
                
                if ref_items:
                    ref_item = ref_items[0]
                    if len(ref_items) > 1:
                        ref_item = random.choice(ref_items)
                    responsavel = ref_item.get("quem_cotou", "")
                    lote = ref_item.get("lote", "")
                    try:
                        lot_number = int(''.join(filter(str.isdigit, lote))) if lote else 0
                    except:
                        lot_number = 0
                
                preco_venda = item.get("preco_venda_pdf") or item.get("preco_venda")
                
                processed_items.append(POItem(
                    codigo_item=item["codigo_item"],
                    quantidade=int(item.get("quantidade", 1)),
                    unidade=item.get("unidade", "UN"),
                    descricao=item.get("descricao", ""),
                    endereco_entrega=oc_data.get("endereco_entrega", ""),
                    responsavel=responsavel,
                    lote=lote,
                    lot_number=lot_number,
                    regiao=item.get("regiao", ""),
                    status="pendente",
                    preco_venda=preco_venda
                ))
            
            # Criar OC
            po = PurchaseOrder(
                numero_oc=oc_data["numero_oc"],
                endereco_entrega=oc_data.get("endereco_entrega", ""),
                items=processed_items,
                created_by=current_user.get('sub')
            )
            
            doc = po.model_dump()
            doc['created_at'] = doc['created_at'].isoformat()
            
            await db.purchase_orders.insert_one(doc)
            
            results["success"].append({
                "filename": file.filename,
                "numero_oc": po.numero_oc,
                "po_id": po.id,
                "total_items": len(processed_items)
            })
            results["total_items_created"] += len(processed_items)
            
        except Exception as e:
            results["failed"].append({
                "filename": file.filename,
                "error": str(e)
            })
    
    results["total_processed"] = len(files)
    
    return results

@api_router.get("/purchase-orders/check-duplicate/{numero_oc}")
async def check_duplicate_purchase_order(numero_oc: str, current_user: dict = Depends(require_admin)):
    """Verificar se OC já existe (ADMIN ONLY)"""
    existing_po = await db.purchase_orders.find_one({"numero_oc": numero_oc}, {"_id": 0})
    
    if existing_po:
        return {
            "exists": True,
            "message": f"Ordem de Compra {numero_oc} já existe no sistema",
            "existing_po": {
                "id": existing_po["id"],
                "numero_oc": existing_po["numero_oc"],
                "created_at": existing_po["created_at"],
                "total_items": len(existing_po["items"])
            }
        }
    else:
        return {
            "exists": False,
            "message": f"Ordem de Compra {numero_oc} não existe no sistema"
        }

@api_router.post("/purchase-orders", response_model=PurchaseOrder)
async def create_purchase_order(po_create: PurchaseOrderCreate, current_user: dict = Depends(require_admin)):
    """Criar nova Ordem de Compra (ADMIN ONLY)"""
    
    # Verificar se OC já existe
    existing_po = await db.purchase_orders.find_one({"numero_oc": po_create.numero_oc}, {"_id": 0})
    if existing_po:
        raise HTTPException(status_code=409, detail=f"Ordem de Compra {po_create.numero_oc} já existe no sistema")
    
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
            
            # Atualizar fontes de compra (todos podem editar)
            if update.fontes_compra is not None:
                item['fontes_compra'] = [fc.model_dump() for fc in update.fontes_compra]
                
                # Calcular totais das fontes de compra
                total_custo = 0
                total_frete = 0
                total_qtd = 0
                for fc in update.fontes_compra:
                    total_custo += fc.quantidade * fc.preco_unitario
                    total_frete += fc.frete
                    total_qtd += fc.quantidade
                
                # Atualizar campos consolidados baseados nas fontes
                if total_qtd > 0:
                    item['preco_compra'] = round(total_custo / total_qtd, 2)  # Preço médio unitário
                item['frete_compra'] = total_frete
            
            # Campos simples - todos podem atualizar
            if update.link_compra is not None:
                item['link_compra'] = update.link_compra
            
            if update.preco_compra is not None and not update.fontes_compra:
                item['preco_compra'] = update.preco_compra
            
            if update.frete_compra is not None and not update.fontes_compra:
                item['frete_compra'] = update.frete_compra
            
            # Apenas admins podem editar preço de venda, impostos e frete de envio
            if current_user['role'] == 'admin':
                if update.preco_venda is not None:
                    item['preco_venda'] = update.preco_venda
                if update.imposto is not None:
                    item['imposto'] = update.imposto
                if update.frete_envio is not None:
                    item['frete_envio'] = update.frete_envio
            
            # Calcular lucro líquido
            preco_venda = item.get('preco_venda')
            quantidade = item.get('quantidade', 0)
            
            # Se tem fontes de compra, usar os totais das fontes
            fontes = item.get('fontes_compra', [])
            if fontes and len(fontes) > 0:
                total_custo_compra = sum(fc['quantidade'] * fc['preco_unitario'] for fc in fontes)
                total_frete_compra = sum(fc.get('frete', 0) for fc in fontes)  # Frete é valor total, não por unidade
                
                if preco_venda is not None:
                    receita_total = preco_venda * quantidade
                    # Imposto é sempre 11% do valor total de venda
                    impostos = receita_total * 0.11
                    frete_envio = item.get('frete_envio', 0) or 0
                    item['lucro_liquido'] = round(receita_total - total_custo_compra - total_frete_compra - impostos - frete_envio, 2)
                    # Armazenar o imposto calculado para referência
                    item['imposto'] = round(impostos, 2)
            elif item.get('preco_compra') is not None and preco_venda is not None:
                # Cálculo tradicional
                receita_total = preco_venda * quantidade
                custo_total = item['preco_compra'] * quantidade
                # Imposto é sempre 11% do valor total de venda
                impostos = receita_total * 0.11
                frete_compra = item.get('frete_compra', 0) or 0  # Frete é valor total
                frete_envio = item.get('frete_envio', 0) or 0
                item['lucro_liquido'] = round(receita_total - custo_total - impostos - frete_compra - frete_envio, 2)
                # Armazenar o imposto calculado para referência
                item['imposto'] = round(impostos, 2)
            
            # Atualizar datas
            now = datetime.now(timezone.utc).isoformat()
            if update.status == ItemStatus.COTADO:
                item['data_cotacao'] = now
            elif update.status == ItemStatus.COMPRADO:
                item['data_compra'] = now
            elif update.status == ItemStatus.EM_TRANSITO:
                item['data_envio'] = now
            elif update.status == ItemStatus.ENTREGUE:
                item['data_entrega'] = now
            
            # Atualizar código de rastreio se fornecido
            if update.codigo_rastreio is not None:
                item['codigo_rastreio'] = update.codigo_rastreio.strip().upper() if update.codigo_rastreio else None
            
            item_updated = True
            break
    
    if not item_updated:
        raise HTTPException(status_code=404, detail="Item não encontrado")
    
    await db.purchase_orders.update_one(
        {"id": po_id},
        {"$set": {"items": po['items']}}
    )
    
    return {"message": "Item atualizado com sucesso"}

@api_router.patch("/purchase-orders/{po_id}/items/{codigo_item}/full")
async def update_item_full(
    po_id: str, 
    codigo_item: str, 
    update: ItemFullUpdate,
    current_user: dict = Depends(get_current_user)
):
    """Atualização completa do item - apenas admin"""
    if current_user['role'] != 'admin':
        raise HTTPException(status_code=403, detail="Apenas administradores podem fazer edição completa")
    
    po = await db.purchase_orders.find_one({"id": po_id}, {"_id": 0})
    if not po:
        raise HTTPException(status_code=404, detail="OC não encontrada")
    
    item_updated = False
    for item in po['items']:
        if item['codigo_item'] == codigo_item:
            # Atualizar campos se fornecidos
            if update.descricao is not None:
                item['descricao'] = update.descricao
            if update.quantidade is not None:
                item['quantidade'] = update.quantidade
            if update.unidade is not None:
                item['unidade'] = update.unidade
            if update.responsavel is not None:
                item['responsavel'] = update.responsavel
            if update.lote is not None:
                item['lote'] = update.lote
            if update.marca_modelo is not None:
                item['marca_modelo'] = update.marca_modelo
            
            # Recalcular imposto e lucro se tiver preço de venda
            preco_venda = item.get('preco_venda')
            quantidade = item.get('quantidade', 0)
            
            if preco_venda is not None:
                receita_total = preco_venda * quantidade
                impostos = receita_total * 0.11
                item['imposto'] = round(impostos, 2)
                
                # Recalcular lucro se tiver fontes de compra ou preço de compra
                fontes = item.get('fontes_compra', [])
                if fontes and len(fontes) > 0:
                    total_custo_compra = sum(fc['quantidade'] * fc['preco_unitario'] for fc in fontes)
                    total_frete_compra = sum(fc.get('frete', 0) for fc in fontes)
                    frete_envio = item.get('frete_envio', 0) or 0
                    item['lucro_liquido'] = round(receita_total - total_custo_compra - total_frete_compra - impostos - frete_envio, 2)
                elif item.get('preco_compra') is not None:
                    custo_total = item['preco_compra'] * quantidade
                    frete_compra = item.get('frete_compra', 0) or 0
                    frete_envio = item.get('frete_envio', 0) or 0
                    item['lucro_liquido'] = round(receita_total - custo_total - impostos - frete_compra - frete_envio, 2)
            
            item_updated = True
            break
    
    if not item_updated:
        raise HTTPException(status_code=404, detail="Item não encontrado")
    
    await db.purchase_orders.update_one(
        {"id": po_id},
        {"$set": {"items": po['items']}}
    )
    
    return {"message": "Item atualizado com sucesso"}

@api_router.patch("/purchase-orders/{po_id}/items/by-index/{item_index}/full")
async def update_item_by_index(
    po_id: str, 
    item_index: int, 
    update: ItemFullUpdate,
    current_user: dict = Depends(get_current_user)
):
    """Atualização completa do item por índice - apenas admin"""
    if current_user['role'] != 'admin':
        raise HTTPException(status_code=403, detail="Apenas administradores podem fazer edição completa")
    
    po = await db.purchase_orders.find_one({"id": po_id}, {"_id": 0})
    if not po:
        raise HTTPException(status_code=404, detail="OC não encontrada")
    
    if item_index < 0 or item_index >= len(po['items']):
        raise HTTPException(status_code=404, detail="Índice de item inválido")
    
    item = po['items'][item_index]
    
    # Atualizar campos se fornecidos
    if update.descricao is not None:
        item['descricao'] = update.descricao
    if update.quantidade is not None:
        item['quantidade'] = update.quantidade
    if update.unidade is not None:
        item['unidade'] = update.unidade
    if update.responsavel is not None:
        item['responsavel'] = update.responsavel
    if update.lote is not None:
        item['lote'] = update.lote
    if update.marca_modelo is not None:
        item['marca_modelo'] = update.marca_modelo
    if update.status is not None:
        item['status'] = update.status
    if update.preco_venda is not None:
        item['preco_venda'] = update.preco_venda
    
    # Recalcular imposto e lucro se tiver preço de venda
    preco_venda = item.get('preco_venda')
    quantidade = item.get('quantidade', 0)
    
    if preco_venda is not None:
        receita_total = preco_venda * quantidade
        impostos = receita_total * 0.11
        item['imposto'] = round(impostos, 2)
        
        # Recalcular lucro se tiver fontes de compra ou preço de compra
        fontes = item.get('fontes_compra', [])
        if fontes and len(fontes) > 0:
            total_custo_compra = sum(fc['quantidade'] * fc['preco_unitario'] for fc in fontes)
            total_frete_compra = sum(fc.get('frete', 0) for fc in fontes)
            frete_envio = item.get('frete_envio', 0) or 0
            item['lucro_liquido'] = round(receita_total - total_custo_compra - total_frete_compra - impostos - frete_envio, 2)
        elif item.get('preco_compra') is not None:
            custo_total = item['preco_compra'] * quantidade
            frete_compra = item.get('frete_compra', 0) or 0
            frete_envio = item.get('frete_envio', 0) or 0
            item['lucro_liquido'] = round(receita_total - custo_total - impostos - frete_compra - frete_envio, 2)
    
    await db.purchase_orders.update_one(
        {"id": po_id},
        {"$set": {"items": po['items']}}
    )
    
    return {"message": "Item atualizado com sucesso"}

@api_router.get("/dashboard", response_model=DashboardStats)
async def get_dashboard_stats(current_user: dict = Depends(get_current_user)):
    """Estatísticas do dashboard"""
    pos = await db.purchase_orders.find({}, {"_id": 0}).to_list(1000)
    
    all_items = []
    ocs_with_user_items = 0
    
    for po in pos:
        # Filtrar itens baseado no role
        if current_user['role'] != 'admin' and current_user.get('owner_name'):
            filtered_items = [item for item in po['items'] if item.get('responsavel') == current_user['owner_name']]
            if filtered_items:  # Só contar OCs que têm itens do usuário
                ocs_with_user_items += 1
            all_items.extend(filtered_items)
        else:
            all_items.extend(po['items'])
    
    # Para admins, total_ocs é o total de OCs. Para usuários, é apenas OCs com seus itens
    total_ocs = len(pos) if current_user['role'] == 'admin' else ocs_with_user_items
    
    total_items = len(all_items)
    items_pendentes = sum(1 for item in all_items if item['status'] == ItemStatus.PENDENTE)
    items_cotados = sum(1 for item in all_items if item['status'] == ItemStatus.COTADO)
    items_comprados = sum(1 for item in all_items if item['status'] == ItemStatus.COMPRADO)
    items_em_separacao = sum(1 for item in all_items if item['status'] == ItemStatus.EM_SEPARACAO)
    items_em_transito = sum(1 for item in all_items if item['status'] == ItemStatus.EM_TRANSITO)
    items_entregues = sum(1 for item in all_items if item['status'] == ItemStatus.ENTREGUE)
    
    # Para usuários não-admin, mostrar apenas seus próprios itens no breakdown por responsável
    items_por_responsavel = {}
    if current_user['role'] == 'admin':
        # Admin vê todos os responsáveis
        for owner in ['Maria', 'Mateus', 'João', 'Mylena', 'Fabio']:
            items_por_responsavel[owner] = sum(1 for item in all_items if item.get('responsavel') == owner)
    else:
        # Usuário não-admin vê apenas seus próprios itens
        owner_name = current_user.get('owner_name')
        if owner_name:
            items_por_responsavel[owner_name] = sum(1 for item in all_items if item.get('responsavel') == owner_name)
    
    return DashboardStats(
        total_ocs=total_ocs,
        total_items=total_items,
        items_pendentes=items_pendentes,
        items_cotados=items_cotados,
        items_comprados=items_comprados,
        items_em_separacao=items_em_separacao,
        items_em_transito=items_em_transito,
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
                    frete_compra=item.get('frete_compra'),
                    frete_envio=item.get('frete_envio'),
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

@api_router.post("/purchase-orders/fix-responsaveis")
async def fix_responsaveis(current_user: dict = Depends(require_admin)):
    """Corrigir responsáveis faltantes nas OCs existentes (ADMIN ONLY)"""
    import random
    
    pos = await db.purchase_orders.find({}, {"_id": 0}).to_list(1000)
    total_fixed = 0
    
    for po in pos:
        updated = False
        for item in po['items']:
            if not item.get('responsavel'):
                # Buscar responsável do banco de referência
                ref_items = await db.reference_items.find(
                    {"codigo_item": item["codigo_item"]},
                    {"_id": 0}
                ).to_list(100)
                
                if ref_items:
                    # Preferir não-admins
                    non_admin_items = [ri for ri in ref_items if ri.get('responsavel') in ['Maria', 'Mylena', 'Fabio']]
                    
                    if non_admin_items:
                        selected_ref = random.choice(non_admin_items)
                    else:
                        selected_ref = ref_items[0]
                    
                    item['responsavel'] = selected_ref.get('responsavel', '')
                    item['lote'] = selected_ref.get('lote', '')
                    item['lot_number'] = selected_ref.get('lot_number', 0)
                    total_fixed += 1
                    updated = True
        
        if updated:
            await db.purchase_orders.update_one(
                {"id": po['id']},
                {"$set": {"items": po['items']}}
            )
    
    return {"message": f"{total_fixed} itens corrigidos com sucesso"}

@api_router.post("/purchase-orders/fix-marca-modelo")
async def fix_marca_modelo(current_user: dict = Depends(require_admin)):
    """Corrigir marca/modelo faltantes nas OCs existentes (ADMIN ONLY)"""
    import random
    
    pos = await db.purchase_orders.find({}, {"_id": 0}).to_list(1000)
    total_fixed = 0
    
    for po in pos:
        updated = False
        for item in po['items']:
            if not item.get('marca_modelo'):
                # Buscar marca_modelo do banco de referência
                ref_items = await db.reference_items.find(
                    {"codigo_item": item["codigo_item"]},
                    {"_id": 0}
                ).to_list(100)
                
                if ref_items:
                    # Procurar uma referência com marca_modelo preenchido
                    for ref in ref_items:
                        marca = ref.get('marca_modelo', '')
                        if marca and marca != '#N/A':
                            item['marca_modelo'] = marca
                            total_fixed += 1
                            updated = True
                            break
        
        if updated:
            await db.purchase_orders.update_one(
                {"id": po['id']},
                {"$set": {"items": po['items']}}
            )
    
    return {"message": f"{total_fixed} itens corrigidos com marca/modelo"}

@api_router.post("/purchase-orders/normalize-fornecedores")
async def normalize_fornecedores(current_user: dict = Depends(require_admin)):
    """Normalizar fornecedores (maiúsculas, sem acentos) e unificar duplicados (ADMIN ONLY)"""
    import unicodedata
    
    def normalize_text(text):
        if not text:
            return ''
        # Remove acentos e converte para maiúsculas
        normalized = unicodedata.normalize('NFD', text)
        without_accents = ''.join(c for c in normalized if unicodedata.category(c) != 'Mn')
        return without_accents.upper().strip()
    
    pos = await db.purchase_orders.find({}, {"_id": 0}).to_list(1000)
    total_normalized = 0
    
    for po in pos:
        updated = False
        for item in po['items']:
            fontes = item.get('fontes_compra', [])
            for fonte in fontes:
                fornecedor_original = fonte.get('fornecedor', '')
                fornecedor_normalizado = normalize_text(fornecedor_original)
                if fornecedor_original != fornecedor_normalizado:
                    fonte['fornecedor'] = fornecedor_normalizado
                    total_normalized += 1
                    updated = True
        
        if updated:
            await db.purchase_orders.update_one(
                {"id": po['id']},
                {"$set": {"items": po['items']}}
            )
    
    return {"message": f"{total_normalized} fornecedores normalizados com sucesso"}

# ================== RASTREAMENTO CORREIOS ==================

import httpx

async def buscar_rastreio_api(codigo: str) -> dict:
    """Tenta buscar rastreio em múltiplas APIs"""
    eventos = []
    
    # Tentar API do Seu Rastreio primeiro (com retry)
    for tentativa in range(3):
        try:
            async with httpx.AsyncClient(timeout=15.0) as client:
                response = await client.get(
                    f"https://seurastreio.com.br/api/public/rastreio/{codigo}",
                    headers={
                        "Accept": "application/json",
                        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
                    }
                )
                if response.status_code == 200:
                    data = response.json()
                    if data.get('success') and data.get('eventos'):
                        for evento in data.get('eventos', []):
                            eventos.append({
                                "data": evento.get('data', ''),
                                "hora": evento.get('hora', ''),
                                "local": evento.get('local', evento.get('cidade', '')),
                                "status": evento.get('descricao', evento.get('status', '')),
                                "subStatus": evento.get('subStatus', [])
                            })
                        return {"success": True, "eventos": eventos}
                    elif data.get('status') == 'service_error':
                        # API temporariamente indisponível, aguardar e tentar novamente
                        await asyncio.sleep(2)
                        continue
        except Exception as e:
            logging.getLogger(__name__).warning(f"Erro ao consultar SeuRastreio (tentativa {tentativa+1}): {str(e)}")
            await asyncio.sleep(1)
    
    # Fallback: tentar LinkTrack
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            response = await client.get(
                f"https://api.linketrack.com/track/json?user=teste&token=1abcd00b2731640e886fb41a8a9671ad1434c599dbaa0a0de9a5aa619f29a83f&codigo={codigo}",
                headers={"Accept": "application/json"}
            )
            if response.status_code == 200:
                data = response.json()
                for evento in data.get('eventos', []):
                    eventos.append({
                        "data": evento.get('data', ''),
                        "hora": evento.get('hora', ''),
                        "local": evento.get('local', ''),
                        "status": evento.get('status', ''),
                        "subStatus": evento.get('subStatus', [])
                    })
                if eventos:
                    return {"success": True, "eventos": eventos}
    except Exception:
        pass
    
    return {"success": False, "eventos": [], "message": "Não foi possível consultar o rastreio. APIs indisponíveis."}

@api_router.get("/rastreio/{codigo}")
async def buscar_rastreio(codigo: str, current_user: dict = Depends(get_current_user)):
    """Buscar rastreamento de um código dos Correios"""
    result = await buscar_rastreio_api(codigo)
    return {
        "codigo": codigo,
        **result
    }

@api_router.post("/purchase-orders/{po_id}/items/{codigo_item}/rastreio")
async def definir_codigo_rastreio(
    po_id: str,
    codigo_item: str,
    data: dict,
    current_user: dict = Depends(get_current_user)
):
    """Definir código de rastreio para um item e mudar status para em_transito"""
    codigo_rastreio = data.get('codigo_rastreio', '').strip().upper()
    
    if not codigo_rastreio:
        raise HTTPException(status_code=400, detail="Código de rastreio é obrigatório")
    
    po = await db.purchase_orders.find_one({"id": po_id}, {"_id": 0})
    if not po:
        raise HTTPException(status_code=404, detail="OC não encontrada")
    
    item_found = False
    for item in po['items']:
        if item['codigo_item'] == codigo_item:
            item['codigo_rastreio'] = codigo_rastreio
            item['status'] = ItemStatus.EM_TRANSITO.value
            item['data_envio'] = datetime.now(timezone.utc).isoformat()
            
            # Tentar buscar rastreio inicial
            try:
                async with httpx.AsyncClient(timeout=10.0) as client:
                    response = await client.get(
                        f"https://api.linketrack.com/track/json?user=teste&token=1abcd00b2731640e886fb41a8a9671ad1434c599dbaa0a0de9a5aa619f29a83f&codigo={codigo_rastreio}",
                        headers={"Accept": "application/json"}
                    )
                    if response.status_code == 200:
                        data = response.json()
                        eventos = []
                        for evento in data.get('eventos', []):
                            eventos.append({
                                "data": evento.get('data', ''),
                                "hora": evento.get('hora', ''),
                                "local": evento.get('local', ''),
                                "status": evento.get('status', ''),
                                "subStatus": evento.get('subStatus', [])
                            })
                        item['rastreio_eventos'] = eventos
            except Exception:
                item['rastreio_eventos'] = []
            
            item_found = True
            break
    
    if not item_found:
        raise HTTPException(status_code=404, detail="Item não encontrado")
    
    await db.purchase_orders.update_one(
        {"id": po_id},
        {"$set": {"items": po['items']}}
    )
    
    return {"message": "Código de rastreio definido com sucesso", "status": "em_transito"}

@api_router.post("/purchase-orders/{po_id}/items/{codigo_item}/atualizar-rastreio")
async def atualizar_rastreio(
    po_id: str,
    codigo_item: str,
    current_user: dict = Depends(get_current_user)
):
    """Atualizar eventos de rastreio de um item"""
    po = await db.purchase_orders.find_one({"id": po_id}, {"_id": 0})
    if not po:
        raise HTTPException(status_code=404, detail="OC não encontrada")
    
    item_found = False
    for item in po['items']:
        if item['codigo_item'] == codigo_item:
            codigo_rastreio = item.get('codigo_rastreio')
            if not codigo_rastreio:
                raise HTTPException(status_code=400, detail="Item não possui código de rastreio")
            
            # Buscar rastreio atualizado
            try:
                async with httpx.AsyncClient(timeout=10.0) as client:
                    response = await client.get(
                        f"https://api.linketrack.com/track/json?user=teste&token=1abcd00b2731640e886fb41a8a9671ad1434c599dbaa0a0de9a5aa619f29a83f&codigo={codigo_rastreio}",
                        headers={"Accept": "application/json"}
                    )
                    if response.status_code == 200:
                        data = response.json()
                        eventos = []
                        entregue = False
                        for evento in data.get('eventos', []):
                            eventos.append({
                                "data": evento.get('data', ''),
                                "hora": evento.get('hora', ''),
                                "local": evento.get('local', ''),
                                "status": evento.get('status', ''),
                                "subStatus": evento.get('subStatus', [])
                            })
                            # Verificar se foi entregue
                            status_lower = evento.get('status', '').lower()
                            if 'entregue' in status_lower or 'entrega realizada' in status_lower:
                                entregue = True
                        
                        item['rastreio_eventos'] = eventos
                        
                        # Se foi entregue, atualizar status e criar notificação
                        if entregue:
                            item['status'] = ItemStatus.ENTREGUE.value
                            item['data_entrega'] = datetime.now(timezone.utc).isoformat()
                            
                            # Criar notificação de entrega
                            notificacao = {
                                "id": str(uuid.uuid4()),
                                "tipo": "entrega",
                                "titulo": "Item Entregue",
                                "numero_oc": po.get('numero_oc', ''),
                                "codigo_item": codigo_item,
                                "descricao_item": item.get('descricao', '')[:30] + ('...' if len(item.get('descricao', '')) > 30 else ''),
                                "lida": False,
                                "created_at": datetime.now(timezone.utc).isoformat()
                            }
                            await db.notificacoes.insert_one(notificacao)
            except Exception as e:
                raise HTTPException(status_code=500, detail=f"Erro ao buscar rastreio: {str(e)}")
            
            item_found = True
            break
    
    if not item_found:
        raise HTTPException(status_code=404, detail="Item não encontrado")
    
    await db.purchase_orders.update_one(
        {"id": po_id},
        {"$set": {"items": po['items']}}
    )
    
    return {"message": "Rastreio atualizado com sucesso"}

@api_router.post("/purchase-orders/{po_id}/items/{codigo_item}/marcar-entregue")
async def marcar_item_entregue(
    po_id: str,
    codigo_item: str,
    current_user: dict = Depends(get_current_user)
):
    """Marcar um item como entregue manualmente"""
    if current_user['role'] != 'admin':
        raise HTTPException(status_code=403, detail="Apenas administradores podem marcar como entregue")
    
    po = await db.purchase_orders.find_one({"id": po_id}, {"_id": 0})
    if not po:
        raise HTTPException(status_code=404, detail="OC não encontrada")
    
    item_found = False
    for item in po['items']:
        if item['codigo_item'] == codigo_item:
            now = datetime.now(timezone.utc)
            item['status'] = ItemStatus.ENTREGUE.value
            item['data_entrega'] = now.isoformat()
            
            # Adicionar evento de entrega manual ao histórico
            if 'rastreio_eventos' not in item or not item['rastreio_eventos']:
                item['rastreio_eventos'] = []
            
            item['rastreio_eventos'].insert(0, {
                "data": now.strftime("%d/%m/%Y"),
                "hora": now.strftime("%H:%M"),
                "local": "Marcado manualmente",
                "status": "Objeto entregue ao destinatário",
                "subStatus": ["Entrega confirmada pelo sistema"]
            })
            
            # Criar notificação
            notificacao = {
                "id": str(uuid.uuid4()),
                "tipo": "entrega",
                "titulo": "Item Entregue",
                "numero_oc": po.get('numero_oc', ''),
                "codigo_item": codigo_item,
                "descricao_item": item.get('descricao', '')[:30] + ('...' if len(item.get('descricao', '')) > 30 else ''),
                "lida": False,
                "created_at": now.isoformat()
            }
            await db.notificacoes.insert_one(notificacao)
            
            item_found = True
            break
    
    if not item_found:
        raise HTTPException(status_code=404, detail="Item não encontrado")
    
    await db.purchase_orders.update_one(
        {"id": po_id},
        {"$set": {"items": po['items']}}
    )
    
    return {"message": "Item marcado como entregue com sucesso"}

# ================== NOTIFICAÇÕES ==================

@api_router.get("/notificacoes")
async def get_notificacoes(current_user: dict = Depends(get_current_user)):
    """Obter notificações do usuário"""
    # Buscar últimas 20 notificações
    cursor = db.notificacoes.find({}, {"_id": 0}).sort("created_at", -1).limit(20)
    notificacoes = []
    async for doc in cursor:
        notificacoes.append(doc)
    
    return notificacoes

@api_router.get("/notificacoes/nao-lidas/count")
async def get_notificacoes_count(current_user: dict = Depends(get_current_user)):
    """Contar notificações não lidas"""
    count = await db.notificacoes.count_documents({"lida": False})
    return {"count": count}

@api_router.post("/notificacoes/{notificacao_id}/marcar-lida")
async def marcar_notificacao_lida(
    notificacao_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Marcar uma notificação como lida"""
    result = await db.notificacoes.update_one(
        {"id": notificacao_id},
        {"$set": {"lida": True}}
    )
    
    if result.modified_count == 0:
        raise HTTPException(status_code=404, detail="Notificação não encontrada")
    
    return {"message": "Notificação marcada como lida"}

@api_router.post("/notificacoes/marcar-todas-lidas")
async def marcar_todas_lidas(current_user: dict = Depends(get_current_user)):
    """Marcar todas as notificações como lidas"""
    await db.notificacoes.update_many(
        {"lida": False},
        {"$set": {"lida": True}}
    )
    return {"message": "Todas as notificações marcadas como lidas"}

# ================== VERIFICAÇÃO AUTOMÁTICA DE RASTREIO ==================

async def verificar_rastreios_em_transito():
    """Verifica todos os itens em trânsito e atualiza status se entregue"""
    logger = logging.getLogger(__name__)
    
    while True:
        try:
            logger.info("Iniciando verificação automática de rastreios...")
            
            # Buscar todas as OCs com itens em trânsito
            cursor = db.purchase_orders.find(
                {"items.status": "em_transito"},
                {"_id": 0}
            )
            
            itens_atualizados = 0
            
            async for po in cursor:
                for item in po['items']:
                    if item.get('status') == 'em_transito' and item.get('codigo_rastreio'):
                        codigo = item['codigo_rastreio']
                        
                        # Tentar buscar rastreio
                        result = await buscar_rastreio_api(codigo)
                        
                        if result.get('success') and result.get('eventos'):
                            eventos = result['eventos']
                            item['rastreio_eventos'] = eventos
                            
                            # Verificar se foi entregue
                            entregue = False
                            for evento in eventos:
                                status_lower = (evento.get('status') or '').lower()
                                if 'entregue' in status_lower or 'entrega realizada' in status_lower or 'destinatário' in status_lower:
                                    entregue = True
                                    break
                            
                            if entregue:
                                now = datetime.now(timezone.utc)
                                item['status'] = ItemStatus.ENTREGUE.value
                                item['data_entrega'] = now.isoformat()
                                
                                # Criar notificação
                                notificacao = {
                                    "id": str(uuid.uuid4()),
                                    "tipo": "entrega",
                                    "titulo": "Item Entregue",
                                    "numero_oc": po.get('numero_oc', ''),
                                    "codigo_item": item['codigo_item'],
                                    "descricao_item": item.get('descricao', '')[:30] + ('...' if len(item.get('descricao', '')) > 30 else ''),
                                    "lida": False,
                                    "created_at": now.isoformat()
                                }
                                await db.notificacoes.insert_one(notificacao)
                                
                                itens_atualizados += 1
                                logger.info(f"Item {item['codigo_item']} da OC {po['numero_oc']} marcado como entregue automaticamente")
                            
                            # Atualizar OC no banco
                            await db.purchase_orders.update_one(
                                {"id": po['id']},
                                {"$set": {"items": po['items']}}
                            )
            
            if itens_atualizados > 0:
                logger.info(f"Verificação concluída. {itens_atualizados} itens atualizados para entregue.")
            else:
                logger.info("Verificação concluída. Nenhum item novo entregue.")
                
        except Exception as e:
            logger.error(f"Erro na verificação automática de rastreios: {str(e)}")
        
        # Aguardar 30 minutos antes da próxima verificação
        await asyncio.sleep(1800)

@app.on_event("startup")
async def startup_event():
    """Iniciar job de verificação de rastreios ao iniciar o servidor"""
    global rastreio_task
    rastreio_task = asyncio.create_task(verificar_rastreios_em_transito())
    logging.getLogger(__name__).info("Job de verificação de rastreios iniciado")

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
    global rastreio_task
    if rastreio_task:
        rastreio_task.cancel()
    client.close()
