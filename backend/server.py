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

class NotaFiscalDoc(BaseModel):
    """Documento de Nota Fiscal (PDF ou XML)"""
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    filename: str
    content_type: str  # application/pdf ou text/xml
    file_data: str  # Base64 encoded
    ncm: Optional[str] = None  # NCM extraído ou manual
    uploaded_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    uploaded_by: Optional[str] = None

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
    # Campos para Notas Fiscais
    notas_fiscais_fornecedor: List[NotaFiscalDoc] = []  # Múltiplas NFs de fornecedores
    nota_fiscal_revenda: Optional[NotaFiscalDoc] = None  # NF de revenda (única)
    nf_emitida_pronto_despacho: bool = False  # Checkbox de NF emitida/pronto para despacho

class PurchaseOrder(BaseModel):
    model_config = ConfigDict(extra="ignore")
    
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    numero_oc: str
    cliente: str = "FIEP"
    cnpj_requisitante: str = ""  # CNPJ do cliente/requisitante extraído do PDF
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
        
        # Extrair CNPJ do requisitante/cliente (FIEP/SESI)
        # CNPJ padrão: XX.XXX.XXX/XXXX-XX
        cnpj_requisitante = ""
        cnpj_patterns = [
            r'CNPJ[:\s]*(\d{2}\.\d{3}\.\d{3}/\d{4}-\d{2})',
            r'(\d{2}\.\d{3}\.\d{3}/\d{4}-\d{2})'
        ]
        
        for pattern in cnpj_patterns:
            cnpj_matches = re.findall(pattern, full_text)
            if cnpj_matches:
                # O primeiro CNPJ geralmente é do cliente/requisitante
                # O CNPJ da ON (fornecedor) é 46.663.556/0001-69, então pegamos outro
                for cnpj in cnpj_matches:
                    if cnpj != "46.663.556/0001-69":  # Ignorar CNPJ do fornecedor (ON)
                        cnpj_requisitante = cnpj
                        break
                break
        
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
                                        # Pegar descrição completa (sem limite de partes)
                                        descricao = ' '.join(descricao_parts) if descricao_parts else f"Item {codigo}"
                                        item_data = {
                                            "codigo_item": codigo,
                                            "quantidade": quantidade,
                                            "descricao": descricao,  # Descrição completa sem truncar
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
            "regiao": regiao,
            "cnpj_requisitante": cnpj_requisitante
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
            # SEMPRE usar a descrição do Excel (mais completa)
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
    
    # OTIMIZAÇÃO: Batch query - buscar todas as referências de uma vez
    all_codigo_items = [item["codigo_item"] for item in oc_data["items"]]
    all_ref_items = await db.reference_items.find(
        {"codigo_item": {"$in": all_codigo_items}},
        {"_id": 0}
    ).to_list(5000)
    
    # Criar lookup dictionary
    ref_lookup = {}
    for ref in all_ref_items:
        codigo = ref["codigo_item"]
        if codigo not in ref_lookup:
            ref_lookup[codigo] = []
        ref_lookup[codigo].append(ref)
    
    for item in oc_data["items"]:
        # Buscar do lookup
        ref_items = ref_lookup.get(item["codigo_item"], [])
        
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
            # SEMPRE usar a descrição do Excel (mais completa)
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
            
            # OTIMIZAÇÃO: Batch query - buscar todas as referências de uma vez
            all_codigo_items = [item["codigo_item"] for item in oc_data["items"]]
            all_ref_items = await db.reference_items.find(
                {"codigo_item": {"$in": all_codigo_items}},
                {"_id": 0}
            ).to_list(5000)
            
            # Criar lookup dictionary
            ref_lookup = {}
            for ref in all_ref_items:
                codigo = ref["codigo_item"]
                if codigo not in ref_lookup:
                    ref_lookup[codigo] = []
                ref_lookup[codigo].append(ref)
            
            for item in oc_data["items"]:
                # Buscar do lookup
                ref_items = ref_lookup.get(item["codigo_item"], [])
                
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
                cnpj_requisitante=oc_data.get("cnpj_requisitante", ""),
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
    
    # OTIMIZAÇÃO: Batch query - buscar todas as referências de uma vez
    all_codigo_items = [item.codigo_item for item in po_create.items]
    all_ref_items = await db.reference_items.find(
        {"codigo_item": {"$in": all_codigo_items}},
        {"_id": 0}
    ).to_list(5000)
    
    # Criar lookup dictionary
    ref_lookup = {}
    for ref in all_ref_items:
        codigo = ref["codigo_item"]
        if codigo not in ref_lookup:
            ref_lookup[codigo] = []
        ref_lookup[codigo].append(ref)
    
    import random
    
    for item in po_create.items:
        # Buscar do lookup
        ref_items = ref_lookup.get(item.codigo_item, [])
        
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
            
            # Preencher com dados da referência selecionada
            item.responsavel = selected_ref['responsavel']
            item.lote = selected_ref['lote']
            item.lot_number = selected_ref['lot_number']
            item.regiao = selected_ref.get('regiao', item.regiao or '')
            # SEMPRE usar a descrição do Excel (mais completa)
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
            # SEMPRE usar a descrição do Excel (mais completa)
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

@api_router.patch("/purchase-orders/{po_id}/items/by-index/{item_index}")
async def update_item_by_index_status(
    po_id: str, 
    item_index: int, 
    update: ItemStatusUpdate, 
    current_user: dict = Depends(get_current_user)
):
    """Atualizar item por índice - resolve problema de itens duplicados"""
    po = await db.purchase_orders.find_one({"id": po_id}, {"_id": 0})
    
    if not po:
        raise HTTPException(status_code=404, detail="Ordem de Compra não encontrada")
    
    if item_index < 0 or item_index >= len(po['items']):
        raise HTTPException(status_code=404, detail="Índice de item inválido")
    
    item = po['items'][item_index]
    
    # Verificar permissão
    if current_user['role'] != 'admin' and item.get('responsavel') != current_user.get('owner_name'):
        raise HTTPException(status_code=403, detail="Você só pode editar seus próprios itens")
    
    item['status'] = update.status
    
    # Atualizar fontes de compra
    if update.fontes_compra is not None:
        item['fontes_compra'] = [fc.model_dump() for fc in update.fontes_compra]
        
        total_custo = 0
        total_frete = 0
        total_qtd = 0
        for fc in update.fontes_compra:
            total_custo += fc.quantidade * fc.preco_unitario
            total_frete += fc.frete
            total_qtd += fc.quantidade
        
        if total_qtd > 0:
            item['preco_compra'] = round(total_custo / total_qtd, 2)
        item['frete_compra'] = total_frete
    
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
    
    fontes = item.get('fontes_compra', [])
    if fontes and len(fontes) > 0:
        total_custo_compra = sum(fc['quantidade'] * fc['preco_unitario'] for fc in fontes)
        total_frete_compra = sum(fc.get('frete', 0) for fc in fontes)
        
        if preco_venda is not None:
            receita_total = preco_venda * quantidade
            impostos = receita_total * 0.11
            frete_envio = item.get('frete_envio', 0) or 0
            item['lucro_liquido'] = round(receita_total - total_custo_compra - total_frete_compra - impostos - frete_envio, 2)
            item['imposto'] = round(impostos, 2)
    elif item.get('preco_compra') is not None and preco_venda is not None:
        receita_total = preco_venda * quantidade
        custo_total = item['preco_compra'] * quantidade
        impostos = receita_total * 0.11
        frete_compra = item.get('frete_compra', 0) or 0
        frete_envio = item.get('frete_envio', 0) or 0
        item['lucro_liquido'] = round(receita_total - custo_total - impostos - frete_compra - frete_envio, 2)
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
    
    if update.codigo_rastreio is not None:
        item['codigo_rastreio'] = update.codigo_rastreio.strip().upper() if update.codigo_rastreio else None
    
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
    
    # OTIMIZAÇÃO: Coletar todos os codigos primeiro
    all_codigos = set()
    for po in pos:
        for item in po['items']:
            if not item.get('responsavel'):
                all_codigos.add(item["codigo_item"])
    
    # Buscar todas as referências de uma vez
    all_ref_items = await db.reference_items.find(
        {"codigo_item": {"$in": list(all_codigos)}},
        {"_id": 0}
    ).to_list(10000)
    
    # Criar lookup
    ref_lookup = {}
    for ref in all_ref_items:
        codigo = ref["codigo_item"]
        if codigo not in ref_lookup:
            ref_lookup[codigo] = []
        ref_lookup[codigo].append(ref)
    
    for po in pos:
        updated = False
        for item in po['items']:
            if not item.get('responsavel'):
                ref_items = ref_lookup.get(item["codigo_item"], [])
                
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
    
    # OTIMIZAÇÃO: Coletar todos os codigos primeiro
    all_codigos = set()
    for po in pos:
        for item in po['items']:
            if not item.get('marca_modelo'):
                all_codigos.add(item["codigo_item"])
    
    # Buscar todas as referências de uma vez
    all_ref_items = await db.reference_items.find(
        {"codigo_item": {"$in": list(all_codigos)}},
        {"_id": 0}
    ).to_list(10000)
    
    # Criar lookup
    ref_lookup = {}
    for ref in all_ref_items:
        codigo = ref["codigo_item"]
        if codigo not in ref_lookup:
            ref_lookup[codigo] = []
        ref_lookup[codigo].append(ref)
    
    for po in pos:
        updated = False
        for item in po['items']:
            if not item.get('marca_modelo'):
                ref_items = ref_lookup.get(item["codigo_item"], [])
                
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

@api_router.post("/purchase-orders/update-descriptions")
async def update_all_descriptions(current_user: dict = Depends(require_admin)):
    """Atualizar descrições de todos os itens com as descrições completas do Excel (ADMIN ONLY)"""
    pos = await db.purchase_orders.find({}, {"_id": 0}).to_list(1000)
    total_updated = 0
    
    for po in pos:
        updated = False
        for item in po['items']:
            codigo_item = item.get('codigo_item')
            if codigo_item:
                # Buscar descrição completa no Excel
                ref_item = await db.reference_items.find_one(
                    {"codigo_item": codigo_item},
                    {"_id": 0, "descricao": 1}
                )
                if ref_item and ref_item.get('descricao'):
                    old_desc = item.get('descricao', '')
                    new_desc = ref_item['descricao']
                    # Atualizar se a descrição do Excel for diferente/mais completa
                    if old_desc != new_desc:
                        item['descricao'] = new_desc
                        total_updated += 1
                        updated = True
        
        if updated:
            await db.purchase_orders.update_one(
                {"id": po['id']},
                {"$set": {"items": po['items']}}
            )
    
    return {"message": f"{total_updated} descrições atualizadas com sucesso"}

@api_router.get("/backup/export")
async def export_backup(current_user: dict = Depends(require_admin)):
    """Exportar backup completo do sistema (ADMIN ONLY)"""
    from datetime import datetime
    
    # Buscar todos os dados COMPLETOS
    pos = await db.purchase_orders.find({}, {"_id": 0}).to_list(10000)
    users = await db.users.find({}, {"_id": 0}).to_list(1000)  # Incluir tudo para restauração
    reference_items = await db.reference_items.find({}, {"_id": 0}).to_list(10000)
    notifications = await db.notifications.find({}, {"_id": 0}).to_list(10000)
    
    # Calcular estatísticas detalhadas
    total_items = 0
    status_counts = {}
    items_com_cotacao = 0
    items_com_link = 0
    total_valor_venda = 0
    
    for po in pos:
        for item in po.get('items', []):
            total_items += 1
            status = item.get('status', 'pendente')
            status_counts[status] = status_counts.get(status, 0) + 1
            
            # Contar cotações
            fontes = item.get('fontes_compra', [])
            if fontes and len(fontes) > 0:
                items_com_cotacao += 1
                for f in fontes:
                    if f.get('link'):
                        items_com_link += 1
            
            # Somar valor de venda
            preco_venda = item.get('preco_venda', 0) or 0
            quantidade = item.get('quantidade', 0) or 0
            total_valor_venda += preco_venda * quantidade
    
    backup = {
        "backup_info": {
            "data_export": datetime.now().isoformat(),
            "versao": "2.0",
            "sistema": "FIEP - Sistema de Gestão de OCs",
            "estatisticas": {
                "total_ocs": len(pos),
                "total_itens": total_items,
                "total_usuarios": len(users),
                "total_itens_referencia": len(reference_items),
                "total_notificacoes": len(notifications),
                "items_com_cotacao": items_com_cotacao,
                "items_com_link": items_com_link,
                "valor_total_venda": round(total_valor_venda, 2),
                "status_itens": status_counts
            }
        },
        "purchase_orders": pos,
        "users": users,
        "reference_items": reference_items,
        "notifications": notifications
    }
    
    return backup

@api_router.post("/backup/restore")
async def restore_backup(current_user: dict = Depends(require_admin)):
    """Restaurar backup do sistema - CUIDADO: substitui todos os dados! (ADMIN ONLY)"""
    # Este endpoint espera o JSON do backup no body
    # Será chamado via upload de arquivo no frontend
    pass

@api_router.post("/backup/restore-data")
async def restore_backup_data(backup_data: dict, current_user: dict = Depends(require_admin)):
    """Restaurar dados do backup (ADMIN ONLY) - SUBSTITUI TODOS OS DADOS!"""
    from datetime import datetime
    
    try:
        # Verificar se é um backup válido
        if "backup_info" not in backup_data or "purchase_orders" not in backup_data:
            raise HTTPException(status_code=400, detail="Arquivo de backup inválido")
        
        # Estatísticas antes
        ocs_antes = await db.purchase_orders.count_documents({})
        
        # Restaurar Purchase Orders
        if backup_data.get("purchase_orders"):
            # Limpar coleção existente
            await db.purchase_orders.delete_many({})
            # Inserir dados do backup
            if len(backup_data["purchase_orders"]) > 0:
                await db.purchase_orders.insert_many(backup_data["purchase_orders"])
        
        # Restaurar Reference Items (se existir no backup)
        if backup_data.get("reference_items") and len(backup_data["reference_items"]) > 0:
            await db.reference_items.delete_many({})
            await db.reference_items.insert_many(backup_data["reference_items"])
        
        # Restaurar Notifications (se existir no backup)
        if backup_data.get("notifications") and len(backup_data["notifications"]) > 0:
            await db.notifications.delete_many({})
            await db.notifications.insert_many(backup_data["notifications"])
        
        # NÃO restaurar usuários automaticamente (segurança)
        # Os usuários devem ser restaurados manualmente se necessário
        
        # Estatísticas depois
        ocs_depois = await db.purchase_orders.count_documents({})
        refs_depois = await db.reference_items.count_documents({})
        
        return {
            "success": True,
            "message": "Backup restaurado com sucesso!",
            "detalhes": {
                "data_backup": backup_data.get("backup_info", {}).get("data_export", "N/A"),
                "ocs_antes": ocs_antes,
                "ocs_restauradas": ocs_depois,
                "itens_referencia": refs_depois
            }
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Erro ao restaurar backup: {str(e)}")

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

# ============== FUNÇÕES DE NOTAS FISCAIS ==============

def extract_ncm_from_xml(xml_content: str) -> Optional[str]:
    """Extrair TODOS os NCMs de um XML de Nota Fiscal Eletrônica (NFe)"""
    import xml.etree.ElementTree as ET
    try:
        # Remover BOM se existir
        if xml_content.startswith('\ufeff'):
            xml_content = xml_content[1:]
        
        root = ET.fromstring(xml_content)
        
        # Namespace padrão da NFe
        namespaces = {
            'nfe': 'http://www.portalfiscal.inf.br/nfe'
        }
        
        ncm_list = set()  # Usar set para evitar duplicatas
        
        # Tentar encontrar NCM com namespace
        ncm_elements = root.findall('.//nfe:NCM', namespaces)
        for elem in ncm_elements:
            if elem.text:
                ncm_list.add(elem.text.strip())
        
        # Tentar sem namespace
        if not ncm_list:
            ncm_elements = root.findall('.//NCM')
            for elem in ncm_elements:
                if elem.text:
                    ncm_list.add(elem.text.strip())
        
        # Tentar padrão alternativo
        if not ncm_list:
            for elem in root.iter():
                if elem.tag.endswith('NCM') and elem.text:
                    ncm_list.add(elem.text.strip())
        
        if ncm_list:
            return ', '.join(sorted(ncm_list))
        
        return None
    except Exception as e:
        logging.error(f"Erro ao extrair NCM do XML: {str(e)}")
        return None

def extract_ncm_from_pdf(pdf_bytes: bytes) -> Optional[str]:
    """Tentar extrair TODOS os NCMs de um PDF de Nota Fiscal"""
    try:
        doc = fitz.open(stream=pdf_bytes, filetype="pdf")
        full_text = ""
        
        for page in doc:
            full_text += page.get_text()
        
        doc.close()
        
        ncm_list = set()  # Usar set para evitar duplicatas
        
        # Padrões comuns de NCM em NFs
        # NCM tem 8 dígitos no formato: XXXX.XX.XX ou XXXXXXXX
        patterns = [
            r'NCM[:\s]*(\d{4}[\.\s]?\d{2}[\.\s]?\d{2})',
            r'NCM[:\s]*(\d{8})',
            r'Classifica[çc][ãa]o Fiscal[:\s]*(\d{4}[\.\s]?\d{2}[\.\s]?\d{2})',
            r'Classifica[çc][ãa]o Fiscal[:\s]*(\d{8})',
            r'(\d{4}\.\d{2}\.\d{2})',  # Padrão com pontos
        ]
        
        for pattern in patterns:
            matches = re.findall(pattern, full_text, re.IGNORECASE)
            for match in matches:
                # Remover pontos e espaços e normalizar
                ncm = re.sub(r'[\.\s]', '', match)
                if len(ncm) == 8 and ncm.isdigit():
                    ncm_list.add(ncm)
        
        if ncm_list:
            return ', '.join(sorted(ncm_list))
        
        return None
    except Exception as e:
        logging.error(f"Erro ao extrair NCM do PDF: {str(e)}")
        return None

import base64

def extract_numero_nf_from_xml(xml_content: str) -> Optional[str]:
    """Extrair número da Nota Fiscal do XML"""
    import xml.etree.ElementTree as ET
    try:
        if xml_content.startswith('\ufeff'):
            xml_content = xml_content[1:]
        
        root = ET.fromstring(xml_content)
        
        namespaces = {'nfe': 'http://www.portalfiscal.inf.br/nfe'}
        
        # Tentar encontrar número da NF com namespace
        # nNF = número da nota fiscal
        for tag in ['nNF', 'nf', 'numero']:
            elements = root.findall(f'.//nfe:{tag}', namespaces)
            if elements and elements[0].text:
                return elements[0].text.strip()
            elements = root.findall(f'.//{tag}')
            if elements and elements[0].text:
                return elements[0].text.strip()
        
        # Tentar encontrar no texto
        for elem in root.iter():
            if elem.tag.endswith('nNF') and elem.text:
                return elem.text.strip()
        
        return None
    except Exception as e:
        logging.error(f"Erro ao extrair número da NF do XML: {str(e)}")
        return None

def extract_numero_nf_from_pdf(pdf_bytes: bytes) -> Optional[str]:
    """Tentar extrair número da NF de um PDF"""
    try:
        doc = fitz.open(stream=pdf_bytes, filetype="pdf")
        full_text = ""
        
        for page in doc:
            full_text += page.get_text()
        
        doc.close()
        
        # Padrões comuns para número de NF
        patterns = [
            r'N[°º]?\s*(?:da\s*)?(?:NF|Nota|Nota Fiscal)[:\s]*(\d{6,9})',
            r'(?:NF|Nota Fiscal)\s*N[°º]?\s*(\d{6,9})',
            r'N[úu]mero[:\s]*(\d{6,9})',
            r'(\d{9})',  # Número de 9 dígitos solto
        ]
        
        for pattern in patterns:
            match = re.search(pattern, full_text, re.IGNORECASE)
            if match:
                num = match.group(1)
                if len(num) >= 6:
                    return num
        
        return None
    except Exception as e:
        logging.error(f"Erro ao extrair número da NF do PDF: {str(e)}")
        return None

class NFUploadRequest(BaseModel):
    """Request para upload de nota fiscal"""
    filename: str
    content_type: str
    file_data: str  # Base64
    ncm_manual: Optional[str] = None
    tipo: str  # "fornecedor" ou "revenda"

class NFUpdateNCMRequest(BaseModel):
    """Request para atualizar NCM manualmente"""
    ncm: str

class NFEmitidaRequest(BaseModel):
    """Request para marcar NF como emitida/pronto para despacho"""
    nf_emitida_pronto_despacho: bool

@api_router.post("/purchase-orders/{po_id}/items/by-index/{item_index}/notas-fiscais")
async def upload_nota_fiscal(
    po_id: str,
    item_index: int,
    request: NFUploadRequest,
    current_user: dict = Depends(get_current_user)
):
    """Upload de nota fiscal para um item"""
    po = await db.purchase_orders.find_one({"id": po_id}, {"_id": 0})
    
    if not po:
        raise HTTPException(status_code=404, detail="Ordem de Compra não encontrada")
    
    if item_index < 0 or item_index >= len(po['items']):
        raise HTTPException(status_code=404, detail="Índice de item inválido")
    
    item = po['items'][item_index]
    
    # Tentar extrair NCM e número da NF
    ncm = request.ncm_manual
    numero_nf = None
    try:
        file_bytes = base64.b64decode(request.file_data)
        
        if request.content_type == 'text/xml' or request.filename.endswith('.xml'):
            xml_content = file_bytes.decode('utf-8')
            if not ncm:
                ncm = extract_ncm_from_xml(xml_content)
            numero_nf = extract_numero_nf_from_xml(xml_content)
        elif request.content_type == 'application/pdf' or request.filename.endswith('.pdf'):
            if not ncm:
                ncm = extract_ncm_from_pdf(file_bytes)
            numero_nf = extract_numero_nf_from_pdf(file_bytes)
    except Exception as e:
        logging.error(f"Erro ao processar arquivo: {str(e)}")
    
    # Criar documento da NF
    nf_doc = {
        "id": str(uuid.uuid4()),
        "filename": request.filename,
        "content_type": request.content_type,
        "file_data": request.file_data,
        "ncm": ncm,
        "numero_nf": numero_nf,  # Número da NF extraído
        "uploaded_at": datetime.now(timezone.utc).isoformat(),
        "uploaded_by": current_user.get('sub')
    }
    
    if request.tipo == "fornecedor":
        # Adicionar às NFs de fornecedor (múltiplas)
        if 'notas_fiscais_fornecedor' not in item:
            item['notas_fiscais_fornecedor'] = []
        item['notas_fiscais_fornecedor'].append(nf_doc)
    elif request.tipo == "revenda":
        # Substituir NF de revenda (única)
        item['nota_fiscal_revenda'] = nf_doc
    else:
        raise HTTPException(status_code=400, detail="Tipo deve ser 'fornecedor' ou 'revenda'")
    
    await db.purchase_orders.update_one(
        {"id": po_id},
        {"$set": {"items": po['items']}}
    )
    
    return {
        "success": True,
        "message": "Nota fiscal adicionada com sucesso",
        "nf_id": nf_doc["id"],
        "ncm": ncm or "NCM NAO ENCONTRADO"
    }

@api_router.get("/purchase-orders/{po_id}/items/by-index/{item_index}/notas-fiscais/{nf_id}/download")
async def download_nota_fiscal(
    po_id: str,
    item_index: int,
    nf_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Download de uma nota fiscal específica"""
    po = await db.purchase_orders.find_one({"id": po_id}, {"_id": 0})
    
    if not po:
        raise HTTPException(status_code=404, detail="Ordem de Compra não encontrada")
    
    if item_index < 0 or item_index >= len(po['items']):
        raise HTTPException(status_code=404, detail="Índice de item inválido")
    
    item = po['items'][item_index]
    
    # Procurar NF de fornecedor
    for nf in item.get('notas_fiscais_fornecedor', []):
        if nf['id'] == nf_id:
            return {
                "filename": nf['filename'],
                "content_type": nf['content_type'],
                "file_data": nf['file_data']
            }
    
    # Procurar NF de revenda
    nf_revenda = item.get('nota_fiscal_revenda')
    if nf_revenda and nf_revenda['id'] == nf_id:
        return {
            "filename": nf_revenda['filename'],
            "content_type": nf_revenda['content_type'],
            "file_data": nf_revenda['file_data']
        }
    
    raise HTTPException(status_code=404, detail="Nota fiscal não encontrada")

@api_router.delete("/purchase-orders/{po_id}/items/by-index/{item_index}/notas-fiscais/{nf_id}")
async def delete_nota_fiscal(
    po_id: str,
    item_index: int,
    nf_id: str,
    tipo: str,  # Query param: "fornecedor" ou "revenda"
    current_user: dict = Depends(get_current_user)
):
    """Deletar uma nota fiscal específica"""
    po = await db.purchase_orders.find_one({"id": po_id}, {"_id": 0})
    
    if not po:
        raise HTTPException(status_code=404, detail="Ordem de Compra não encontrada")
    
    if item_index < 0 or item_index >= len(po['items']):
        raise HTTPException(status_code=404, detail="Índice de item inválido")
    
    item = po['items'][item_index]
    
    if tipo == "fornecedor":
        # Remover das NFs de fornecedor
        if 'notas_fiscais_fornecedor' in item:
            item['notas_fiscais_fornecedor'] = [
                nf for nf in item['notas_fiscais_fornecedor'] if nf['id'] != nf_id
            ]
    elif tipo == "revenda":
        # Remover NF de revenda
        if item.get('nota_fiscal_revenda') and item['nota_fiscal_revenda']['id'] == nf_id:
            item['nota_fiscal_revenda'] = None
    else:
        raise HTTPException(status_code=400, detail="Tipo deve ser 'fornecedor' ou 'revenda'")
    
    await db.purchase_orders.update_one(
        {"id": po_id},
        {"$set": {"items": po['items']}}
    )
    
    return {"success": True, "message": "Nota fiscal removida com sucesso"}

@api_router.patch("/purchase-orders/{po_id}/items/by-index/{item_index}/notas-fiscais/{nf_id}/ncm")
async def update_nf_ncm(
    po_id: str,
    item_index: int,
    nf_id: str,
    request: NFUpdateNCMRequest,
    current_user: dict = Depends(get_current_user)
):
    """Atualizar NCM de uma nota fiscal manualmente"""
    po = await db.purchase_orders.find_one({"id": po_id}, {"_id": 0})
    
    if not po:
        raise HTTPException(status_code=404, detail="Ordem de Compra não encontrada")
    
    if item_index < 0 or item_index >= len(po['items']):
        raise HTTPException(status_code=404, detail="Índice de item inválido")
    
    item = po['items'][item_index]
    updated = False
    
    # Procurar e atualizar NF de fornecedor
    for nf in item.get('notas_fiscais_fornecedor', []):
        if nf['id'] == nf_id:
            nf['ncm'] = request.ncm.upper()
            updated = True
            break
    
    # Procurar e atualizar NF de revenda
    nf_revenda = item.get('nota_fiscal_revenda')
    if not updated and nf_revenda and nf_revenda['id'] == nf_id:
        nf_revenda['ncm'] = request.ncm.upper()
        updated = True
    
    if not updated:
        raise HTTPException(status_code=404, detail="Nota fiscal não encontrada")
    
    await db.purchase_orders.update_one(
        {"id": po_id},
        {"$set": {"items": po['items']}}
    )
    
    return {"success": True, "message": "NCM atualizado com sucesso"}

@api_router.patch("/purchase-orders/{po_id}/items/by-index/{item_index}/nf-emitida")
async def update_nf_emitida_status(
    po_id: str,
    item_index: int,
    request: NFEmitidaRequest,
    current_user: dict = Depends(get_current_user)
):
    """Atualizar status de NF emitida/pronto para despacho"""
    po = await db.purchase_orders.find_one({"id": po_id}, {"_id": 0})
    
    if not po:
        raise HTTPException(status_code=404, detail="Ordem de Compra não encontrada")
    
    if item_index < 0 or item_index >= len(po['items']):
        raise HTTPException(status_code=404, detail="Índice de item inválido")
    
    item = po['items'][item_index]
    item['nf_emitida_pronto_despacho'] = request.nf_emitida_pronto_despacho
    
    await db.purchase_orders.update_one(
        {"id": po_id},
        {"$set": {"items": po['items']}}
    )
    
    return {"success": True, "message": "Status atualizado com sucesso"}

@api_router.patch("/purchase-orders/{po_id}/items/by-index/{item_index}/endereco-entrega")
async def update_endereco_entrega(
    po_id: str,
    item_index: int,
    endereco: str = "",
    current_user: dict = Depends(get_current_user)
):
    """Atualizar endereço de entrega de um item manualmente"""
    po = await db.purchase_orders.find_one({"id": po_id}, {"_id": 0})
    
    if not po:
        raise HTTPException(status_code=404, detail="Ordem de Compra não encontrada")
    
    if item_index < 0 or item_index >= len(po['items']):
        raise HTTPException(status_code=404, detail="Índice de item inválido")
    
    item = po['items'][item_index]
    item['endereco_entrega'] = endereco.upper()
    
    await db.purchase_orders.update_one(
        {"id": po_id},
        {"$set": {"items": po['items']}}
    )
    
    return {"success": True, "message": "Endereço atualizado com sucesso"}

class EnderecoRequest(BaseModel):
    endereco: str

@api_router.patch("/purchase-orders/{po_id}/items/by-index/{item_index}/endereco")
async def update_endereco_entrega_v2(
    po_id: str,
    item_index: int,
    request: EnderecoRequest,
    current_user: dict = Depends(get_current_user)
):
    """Atualizar endereço de entrega de um item manualmente (v2 com body)"""
    po = await db.purchase_orders.find_one({"id": po_id}, {"_id": 0})
    
    if not po:
        raise HTTPException(status_code=404, detail="Ordem de Compra não encontrada")
    
    if item_index < 0 or item_index >= len(po['items']):
        raise HTTPException(status_code=404, detail="Índice de item inválido")
    
    item = po['items'][item_index]
    item['endereco_entrega'] = request.endereco.upper()
    
    await db.purchase_orders.update_one(
        {"id": po_id},
        {"$set": {"items": po['items']}}
    )
    
    return {"success": True, "message": "Endereço atualizado com sucesso"}

# ============== ENDPOINTS ADMIN - COMISSÕES E NOTAS FISCAIS ==============

class ComissaoUpdate(BaseModel):
    """Atualizar comissão de um responsável"""
    percentual: float
    pago: bool = False

@api_router.get("/admin/comissoes")
async def get_comissoes(current_user: dict = Depends(require_admin)):
    """Obter dados de comissões por responsável (apenas usuários não-admin)"""
    
    # Obter todos os usuários não-admin
    usuarios = await db.users.find({"role": {"$ne": "admin"}}, {"_id": 0}).to_list(length=100)
    
    # Obter comissões salvas
    comissoes_salvas = await db.comissoes.find({}, {"_id": 0}).to_list(length=100)
    comissoes_dict = {c['responsavel']: c for c in comissoes_salvas}
    
    # Obter todas as OCs para calcular lucro
    pos = await db.purchase_orders.find({}, {"_id": 0}).to_list(length=1000)
    
    # Calcular lucro por responsável (apenas itens entregues)
    lucro_por_responsavel = {}
    # Função para normalizar nome do responsável
    def normalizar_nome(nome):
        if not nome:
            return ''
        # Remover sufixos comuns de email e domínios
        nome = nome.upper().strip()
        nome = nome.replace('ONSOLUCOES', '').replace('.ONSOLUCOES', '')
        nome = nome.replace('.', '').strip()
        return nome
    
    for po in pos:
        for item in po.get('items', []):
            responsavel_raw = item.get('responsavel', '').upper().strip()
            responsavel = normalizar_nome(responsavel_raw)
            if responsavel and item.get('status') == 'entregue':
                lucro = item.get('lucro_liquido', 0) or 0
                if responsavel not in lucro_por_responsavel:
                    lucro_por_responsavel[responsavel] = 0
                lucro_por_responsavel[responsavel] += lucro
    
    # Montar resposta - apenas responsáveis com itens (sem duplicar usuários)
    resultado = []
    responsaveis_processados = set()
    
    # Processar responsáveis que têm lucro nos itens
    for responsavel, lucro in lucro_por_responsavel.items():
        if responsavel and responsavel != 'NÃO ATRIBUÍDO' and responsavel not in responsaveis_processados:
            responsaveis_processados.add(responsavel)
            comissao = comissoes_dict.get(responsavel, {})
            resultado.append({
                'responsavel': responsavel,
                'email': None,
                'lucro_entregue': lucro,
                'percentual_comissao': comissao.get('percentual', 0),
                'valor_comissao': lucro * (comissao.get('percentual', 0) / 100),
                'pago': comissao.get('pago', False)
            })
    
    # Adicionar usuários não-admin que não têm itens ainda (para poder definir % antecipadamente)
    for user in usuarios:
        nome = user.get('display_name') or user.get('email', '').split('@')[0]
        nome_normalizado = normalizar_nome(nome)
        if nome_normalizado and nome_normalizado not in responsaveis_processados:
            responsaveis_processados.add(nome_normalizado)
            comissao = comissoes_dict.get(nome_normalizado, {})
            resultado.append({
                'responsavel': nome_normalizado,
                'email': user.get('email'),
                'lucro_entregue': 0,
                'percentual_comissao': comissao.get('percentual', 0),
                'valor_comissao': 0,
                'pago': comissao.get('pago', False)
            })
    
    return sorted(resultado, key=lambda x: x['lucro_entregue'], reverse=True)

@api_router.patch("/admin/comissoes/{responsavel}")
async def update_comissao(
    responsavel: str,
    request: ComissaoUpdate,
    current_user: dict = Depends(require_admin)
):
    """Atualizar comissão de um responsável"""
    
    await db.comissoes.update_one(
        {"responsavel": responsavel.upper()},
        {"$set": {
            "responsavel": responsavel.upper(),
            "percentual": request.percentual,
            "pago": request.pago
        }},
        upsert=True
    )
    
    return {"success": True, "message": "Comissão atualizada com sucesso"}

@api_router.get("/admin/notas-fiscais")
async def get_todas_notas_fiscais(current_user: dict = Depends(require_admin)):
    """Obter todas as notas fiscais do sistema (compra e venda)"""
    
    pos = await db.purchase_orders.find({}, {"_id": 0}).to_list(length=1000)
    
    nfs_compra = []  # NFs de fornecedor
    nfs_venda = []   # NFs de revenda (ON)
    
    for po in pos:
        for idx, item in enumerate(po.get('items', [])):
            # NFs de compra (fornecedor)
            for nf in item.get('notas_fiscais_fornecedor', []):
                nfs_compra.append({
                    'id': nf.get('id'),
                    'filename': nf.get('filename'),
                    'content_type': nf.get('content_type'),
                    'ncm': nf.get('ncm'),
                    'numero_nf': nf.get('numero_nf'),  # Número da NF
                    'uploaded_at': nf.get('uploaded_at'),
                    'numero_oc': po.get('numero_oc'),
                    'codigo_item': item.get('codigo_item'),
                    'descricao': item.get('descricao', '')[:50],
                    'po_id': po.get('id'),
                    'item_index': idx
                })
            
            # NF de venda (revenda)
            nf_revenda = item.get('nota_fiscal_revenda')
            if nf_revenda:
                nfs_venda.append({
                    'id': nf_revenda.get('id'),
                    'filename': nf_revenda.get('filename'),
                    'content_type': nf_revenda.get('content_type'),
                    'ncm': nf_revenda.get('ncm'),
                    'numero_nf': nf_revenda.get('numero_nf'),  # Número da NF
                    'uploaded_at': nf_revenda.get('uploaded_at'),
                    'numero_oc': po.get('numero_oc'),
                    'codigo_item': item.get('codigo_item'),
                    'descricao': item.get('descricao', '')[:50],
                    'po_id': po.get('id'),
                    'item_index': idx
                })
    
    # Ordenar por data de upload (mais recente primeiro)
    nfs_compra.sort(key=lambda x: x.get('uploaded_at', ''), reverse=True)
    nfs_venda.sort(key=lambda x: x.get('uploaded_at', ''), reverse=True)
    
    return {
        'notas_compra': nfs_compra,
        'notas_venda': nfs_venda,
        'total_compra': len(nfs_compra),
        'total_venda': len(nfs_venda)
    }

@api_router.get("/admin/itens-responsavel/{responsavel}")
async def get_itens_responsavel(responsavel: str, current_user: dict = Depends(require_admin)):
    """Obter todos os itens entregues de um responsável para seleção de pagamento"""
    
    # Função para normalizar nome do responsável
    def normalizar_nome(nome):
        if not nome:
            return ''
        nome = nome.upper().strip()
        nome = nome.replace('ONSOLUCOES', '').replace('.ONSOLUCOES', '')
        nome = nome.replace('.', '').strip()
        return nome
    
    responsavel_normalizado = normalizar_nome(responsavel)
    
    pos = await db.purchase_orders.find({}, {"_id": 0}).to_list(length=1000)
    
    # Obter IDs de itens já pagos
    pagamentos = await db.pagamentos.find({}, {"_id": 0}).to_list(length=1000)
    itens_pagos = set()
    for pag in pagamentos:
        for item_id in pag.get('itens_ids', []):
            itens_pagos.add(item_id)
    
    itens = []
    for po in pos:
        for idx, item in enumerate(po.get('items', [])):
            resp_raw = item.get('responsavel', '').upper().strip()
            resp = normalizar_nome(resp_raw)
            if resp == responsavel_normalizado and item.get('status') == 'entregue':
                item_id = f"{po.get('id')}_{idx}"
                itens.append({
                    'id': item_id,
                    'po_id': po.get('id'),
                    'item_index': idx,
                    'numero_oc': po.get('numero_oc'),
                    'codigo_item': item.get('codigo_item'),
                    'descricao': item.get('descricao', '')[:30],
                    'lucro_liquido': item.get('lucro_liquido', 0) or 0,
                    'data_entrega': item.get('data_entrega'),
                    'pago': item_id in itens_pagos
                })
    
    # Ordenar por data de entrega (mais recente primeiro)
    itens.sort(key=lambda x: x.get('data_entrega', '') or '', reverse=True)
    
    return itens

class PagamentoCreate(BaseModel):
    """Criar pagamento de comissão"""
    responsavel: str
    itens_ids: List[str]
    percentual: float
    valor_comissao: float
    total_lucro: float

@api_router.get("/admin/pagamentos")
async def get_pagamentos(current_user: dict = Depends(require_admin)):
    """Obter histórico de pagamentos"""
    pagamentos = await db.pagamentos.find({}, {"_id": 0}).to_list(length=1000)
    # Ordenar por data (mais recente primeiro)
    pagamentos.sort(key=lambda x: x.get('data', ''), reverse=True)
    return pagamentos

@api_router.post("/admin/pagamentos")
async def create_pagamento(request: PagamentoCreate, current_user: dict = Depends(require_admin)):
    """Registrar pagamento de comissão"""
    
    pagamento = {
        "id": str(uuid.uuid4()),
        "responsavel": request.responsavel.upper(),
        "itens_ids": request.itens_ids,
        "percentual": request.percentual,
        "valor_comissao": request.valor_comissao,
        "total_lucro": request.total_lucro,
        "qtd_itens": len(request.itens_ids),
        "data": datetime.now(timezone.utc).isoformat(),
        "pago_por": current_user.get('sub')
    }
    
    await db.pagamentos.insert_one(pagamento)
    
    return {"success": True, "message": "Pagamento registrado com sucesso", "pagamento_id": pagamento["id"]}

class PagamentoUpdate(BaseModel):
    """Atualizar pagamento"""
    valor_comissao: Optional[float] = None
    percentual: Optional[float] = None

@api_router.patch("/admin/pagamentos/{pagamento_id}")
async def update_pagamento(
    pagamento_id: str,
    request: PagamentoUpdate,
    current_user: dict = Depends(require_admin)
):
    """Editar um pagamento existente"""
    
    update_data = {}
    if request.valor_comissao is not None:
        update_data["valor_comissao"] = request.valor_comissao
    if request.percentual is not None:
        update_data["percentual"] = request.percentual
    
    if not update_data:
        raise HTTPException(status_code=400, detail="Nenhum campo para atualizar")
    
    result = await db.pagamentos.update_one(
        {"id": pagamento_id},
        {"$set": update_data}
    )
    
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Pagamento não encontrado")
    
    return {"success": True, "message": "Pagamento atualizado com sucesso"}

@api_router.delete("/admin/pagamentos/{pagamento_id}")
async def delete_pagamento(
    pagamento_id: str,
    current_user: dict = Depends(require_admin)
):
    """Deletar um pagamento"""
    
    result = await db.pagamentos.delete_one({"id": pagamento_id})
    
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Pagamento não encontrado")
    
    return {"success": True, "message": "Pagamento deletado com sucesso"}

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
    allow_origins=["*", "https://onlicitacoes.com", "https://pedidos-fiep.emergent.host", "https://fieporders.preview.emergentagent.com"],
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
