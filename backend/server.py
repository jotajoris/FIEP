from fastapi import FastAPI, APIRouter, HTTPException, Depends, UploadFile, File, Body
from fastapi.security import HTTPBearer
from fastapi.responses import JSONResponse
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import logging
import asyncio
from pathlib import Path

# Configure logging FIRST - before any logger usage
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

from typing import List, Optional, Dict
import uuid
from datetime import datetime, timezone, timedelta
import openpyxl
import resend
import fitz  # PyMuPDF
import re
from pydantic import BaseModel

# Importar modelos do módulo models
from models import (
    UserRole, ItemStatus, User, UserCreate, LoginRequest, LoginResponse,
    ChangePasswordRequest, ResetPasswordRequest, ConfirmResetPasswordRequest,
    ReferenceItem, FonteCompra, Notificacao, NotaFiscalDoc,
    POItem, PurchaseOrder, PurchaseOrderCreate, ItemStatusUpdate, ItemFullUpdate,
    DashboardStats, AdminSummary, CommissionPayment, CommissionPaymentCreate,
    CommissionPaymentUpdate
)

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

# OCs excluídas do cálculo de comissão
EXCLUDED_OCS_FROM_COMMISSION = ['OC-2.118938', 'OC-2.118941']

# Health check endpoint (for Kubernetes)
@app.get("/health")
async def health_check():
    """Health check endpoint for Kubernetes deployment"""
    return {"status": "healthy", "service": "fiep-oc-backend"}

# Helper function
def get_responsible_by_lot(lot_number: int) -> str:
    return LOT_TO_OWNER.get(lot_number, "Não atribuído")

def atualizar_data_compra(item: dict, novo_status: str) -> None:
    """
    Atualiza a data de compra do item automaticamente:
    - Se mudar para comprado/em_separacao/em_transito/entregue: salva a data atual (se não existir)
    - Se voltar para pendente/cotado: remove a data de compra
    """
    status_comprado_ou_adiante = ['comprado', 'em_separacao', 'em_transito', 'entregue']
    status_antes_compra = ['pendente', 'cotado']
    
    if novo_status in status_comprado_ou_adiante:
        # Se ainda não tem data de compra, salva a data atual
        if not item.get('data_compra'):
            item['data_compra'] = datetime.now(timezone.utc).strftime('%Y-%m-%d')
    elif novo_status in status_antes_compra:
        # Remove a data de compra se voltar para pendente ou cotado
        item['data_compra'] = None


def calcular_lucro_item(item: dict) -> None:
    """
    Calcula o lucro líquido do item usando a QUANTIDADE NECESSÁRIA (não a quantidade comprada).
    
    O lucro é calculado apenas sobre o que será vendido (quantidade necessária da OC),
    mesmo que tenha sido comprado mais (excedente vai para estoque).
    
    Fórmula:
    - Receita = preço_venda × quantidade_necessária
    - Custo = custo_unitário_médio × quantidade_necessária (ou preço_compra × quantidade)
    - Impostos = 11% da receita
    - Lucro = Receita - Custo - Frete_compra_proporcional - Impostos - Frete_envio
    """
    preco_venda = item.get('preco_venda')
    quantidade_necessaria = item.get('quantidade', 0)
    
    if not preco_venda or not quantidade_necessaria:
        return
    
    fontes = item.get('fontes_compra', [])
    receita_total = preco_venda * quantidade_necessaria
    impostos = receita_total * 0.11
    item['imposto'] = round(impostos, 2)
    
    if fontes and len(fontes) > 0:
        # Calcular custo médio ponderado das fontes de compra
        total_quantidade_comprada = sum(fc.get('quantidade', 0) for fc in fontes)
        total_custo_fontes = sum(fc.get('quantidade', 0) * fc.get('preco_unitario', 0) for fc in fontes)
        total_frete_fontes = sum(fc.get('frete', 0) for fc in fontes)
        
        if total_quantidade_comprada > 0:
            # Custo unitário médio ponderado
            custo_unitario_medio = total_custo_fontes / total_quantidade_comprada
            # Custo apenas da quantidade necessária
            custo_para_venda = custo_unitario_medio * quantidade_necessaria
            # Frete proporcional à quantidade necessária
            frete_proporcional = (total_frete_fontes / total_quantidade_comprada) * quantidade_necessaria
        else:
            custo_para_venda = 0
            frete_proporcional = 0
        
        frete_envio = item.get('frete_envio', 0) or 0
        item['lucro_liquido'] = round(receita_total - custo_para_venda - frete_proporcional - impostos - frete_envio, 2)
    elif item.get('preco_compra') is not None:
        # Cálculo tradicional (sem fontes de compra)
        custo_total = item['preco_compra'] * quantidade_necessaria
        frete_compra = item.get('frete_compra', 0) or 0
        frete_envio = item.get('frete_envio', 0) or 0
        item['lucro_liquido'] = round(receita_total - custo_total - frete_compra - impostos - frete_envio, 2)


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
        
        # Extrair Data de Entrega (formato DD/MM/YYYY)
        # A data pode estar em diferentes formatos e locais no PDF
        data_entrega = None
        data_patterns = [
            r'Data de Entrega[:\s]*(\d{2}/\d{2}/\d{4})',
            r'Data Entrega[:\s]*(\d{2}/\d{2}/\d{4})',
            r'Entrega[:\s]*(\d{2}/\d{2}/\d{4})',
            r'Prazo de Entrega[:\s]*(\d{2}/\d{2}/\d{4})',
            r'Dt\.\s*Entrega[:\s]*(\d{2}/\d{2}/\d{4})'
        ]
        
        for pattern in data_patterns:
            data_match = re.search(pattern, full_text, re.IGNORECASE)
            if data_match:
                try:
                    # Converter de DD/MM/YYYY para ISO format
                    data_str = data_match.group(1)
                    dia, mes, ano = data_str.split('/')
                    data_entrega = f"{ano}-{mes}-{dia}"  # ISO format YYYY-MM-DD
                    break
                except:
                    pass
        
        # Se não encontrou nos padrões acima, buscar na tabela de itens
        # O formato é geralmente: "requisição DD/MM/YYYY" no final de cada linha de item
        if not data_entrega:
            # Buscar todas as datas no formato DD/MM/YYYY após um número de requisição
            date_after_req = re.findall(r'\d{1,2}\.\d{2}\.\d{6,}\s*(\d{2}/\d{2}/\d{4})', full_text)
            if date_after_req:
                try:
                    data_str = date_after_req[0]  # Pegar a primeira data encontrada
                    dia, mes, ano = data_str.split('/')
                    # Validar se é uma data futura ou recente (não muito antiga)
                    if int(ano) >= 2024:
                        data_entrega = f"{ano}-{mes}-{dia}"
                except:
                    pass
        
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
                                            valid_units = ['UN', 'UND', 'UNID', 'KG', 'PC', 'PÇA', 'PÇ', 'PCA', 'M', 'L', 'CX', 'PAR', 'PCT', 'KIT', 'JG', 'JOGO', 'RL', 'ROLO', 'MT', 'METRO', 'CT', 'CEN', 'CENTO', 'MILHEIRO', 'MIL']
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
                    
                    qty_match = re.search(r'\b(\d+)\s*(UN|UND|UNID|KG|PC|M|L|CX|KIT|CT|CEN|CENTO|PAR|PCT)\b', line, re.IGNORECASE)
                    if qty_match:
                        quantidade = int(qty_match.group(1))
                        unidade = qty_match.group(2).upper()
                    else:
                        for j in range(i+1, min(i+8, len(lines))):
                            qty_match = re.search(r'\b(\d+)\s*(UN|UND|UNID|KG|PC|M|L|CX|KIT|CT|CEN|CENTO|PAR|PCT)\b', lines[j], re.IGNORECASE)
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
            "cnpj_requisitante": cnpj_requisitante,
            "data_entrega": data_entrega
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

# Endpoint de diagnóstico SIMPLES - mostra os itens do usuário e o problema
@api_router.get("/debug/meus-itens")
async def debug_meus_itens(current_user: dict = Depends(get_current_user)):
    """
    Endpoint de diagnóstico simples - acesse logado como Maria ou Fabio
    URL: https://onlicitacoes.com/api/debug/meus-itens
    """
    user_email = current_user.get('sub', '')
    user_role = current_user.get('role', '')
    user_owner_name = current_user.get('owner_name') or ''
    
    # Buscar todas as OCs
    all_pos = await db.purchase_orders.find({}, {"_id": 0}).to_list(1000)
    
    # Encontrar itens que DEVERIAM ser do usuário
    meus_itens = []
    for po in all_pos:
        for idx, item in enumerate(po.get('items', [])):
            item_resp = item.get('responsavel', '')
            # Verificar se o nome bate (case-insensitive)
            if item_resp.strip().upper() == user_owner_name.strip().upper():
                meus_itens.append({
                    "po_id": po['id'],
                    "numero_oc": po['numero_oc'],
                    "item_index": idx,
                    "codigo_item": item.get('codigo_item'),
                    "responsavel_no_item": item_resp,
                    "status": item.get('status'),
                    "comparacao": {
                        "item_responsavel_raw": item_resp,
                        "item_responsavel_upper": item_resp.strip().upper(),
                        "user_owner_name_raw": user_owner_name,
                        "user_owner_name_upper": user_owner_name.strip().upper(),
                        "match": item_resp.strip().upper() == user_owner_name.strip().upper()
                    }
                })
    
    return {
        "usuario_logado": {
            "email": user_email,
            "role": user_role,
            "owner_name": user_owner_name,
            "owner_name_upper": user_owner_name.strip().upper() if user_owner_name else None,
            "owner_name_bytes": [ord(c) for c in user_owner_name] if user_owner_name else []
        },
        "total_itens_encontrados": len(meus_itens),
        "primeiros_5_itens": meus_itens[:5],
        "mensagem": "Se 'total_itens_encontrados' é 0 e você é Maria/Fabio, o owner_name não está correto no seu token/usuário"
    }

# Endpoint de diagnóstico para debug do bug de permissão
@api_router.get("/debug/permission/{po_id}/{item_index}")
async def debug_permission(po_id: str, item_index: int, current_user: dict = Depends(get_current_user)):
    """Endpoint de diagnóstico para verificar problema de permissão"""
    po = await db.purchase_orders.find_one({"id": po_id}, {"_id": 0})
    
    if not po:
        return {"error": "OC não encontrada"}
    
    if item_index < 0 or item_index >= len(po['items']):
        return {"error": "Índice inválido"}
    
    item = po['items'][item_index]
    
    item_responsavel_raw = item.get('responsavel') or ''
    user_owner_name_raw = current_user.get('owner_name') or ''
    item_responsavel = item_responsavel_raw.strip().upper()
    user_owner_name = user_owner_name_raw.strip().upper()
    user_role = current_user.get('role', '')
    
    return {
        "user_info": {
            "email": current_user.get('sub'),
            "role": user_role,
            "owner_name_raw": user_owner_name_raw,
            "owner_name_normalized": user_owner_name,
            "owner_name_bytes": [ord(c) for c in user_owner_name_raw]
        },
        "item_info": {
            "codigo_item": item.get('codigo_item'),
            "responsavel_raw": item_responsavel_raw,
            "responsavel_normalized": item_responsavel,
            "responsavel_bytes": [ord(c) for c in item_responsavel_raw],
            "status": item.get('status')
        },
        "permission_check": {
            "is_admin": user_role == 'admin',
            "names_match": item_responsavel == user_owner_name,
            "would_allow": user_role == 'admin' or item_responsavel == user_owner_name
        }
    }

# Routes
@api_router.get("/")
async def root():
    return {"message": "Sistema de Gestão de Ordens de Compra FIEP"}

# ENDPOINT DE VERIFICAÇÃO DE VERSÃO - USE PARA CONFIRMAR QUE O DEPLOY FOI FEITO
@api_router.get("/version")
async def get_version():
    return {
        "version": "2.2.0",
        "deploy_date": "2025-01-12",
        "fix": "Checkbox carrinho, mover em lote para Comprado, campo observação",
        "status": "OK"
    }

# ENDPOINT DE DEBUG DO UPDATE - MOSTRA EXATAMENTE O QUE ACONTECE
@api_router.patch("/debug-update/{po_id}/{item_index}")
async def debug_update(
    po_id: str, 
    item_index: int, 
    update: ItemStatusUpdate, 
    current_user: dict = Depends(get_current_user)
):
    """Debug do update - retorna detalhes do que aconteceu"""
    debug_info = {
        "user": current_user.get('sub'),
        "role": current_user.get('role'),
        "po_id": po_id,
        "item_index": item_index,
        "update_recebido": {
            "status": update.status,
            "preco_venda": update.preco_venda,
            "fontes_compra": len(update.fontes_compra) if update.fontes_compra else 0
        }
    }
    
    po = await db.purchase_orders.find_one({"id": po_id}, {"_id": 0})
    
    if not po:
        debug_info["erro"] = "OC não encontrada"
        return debug_info
    
    if item_index < 0 or item_index >= len(po['items']):
        debug_info["erro"] = f"Índice inválido. Total items: {len(po['items'])}"
        return debug_info
    
    item = po['items'][item_index]
    
    debug_info["item_antes"] = {
        "codigo": item.get('codigo_item'),
        "preco_compra": item.get('preco_compra'),
        "preco_venda": item.get('preco_venda'),
        "fontes_compra": len(item.get('fontes_compra', []))
    }
    
    # APLICAR TODAS AS ALTERAÇÕES SEM RESTRIÇÃO
    item['status'] = update.status
    atualizar_data_compra(item, update.status)  # Atualiza data de compra automaticamente
    
    if update.fontes_compra is not None:
        item['fontes_compra'] = [fc.model_dump() for fc in update.fontes_compra]
        total_custo = sum(fc.quantidade * fc.preco_unitario for fc in update.fontes_compra)
        total_frete = sum(fc.frete for fc in update.fontes_compra)
        total_qtd = sum(fc.quantidade for fc in update.fontes_compra)
        if total_qtd > 0:
            item['preco_compra'] = round(total_custo / total_qtd, 2)
        item['frete_compra'] = total_frete
    
    if update.preco_venda is not None:
        item['preco_venda'] = update.preco_venda
    
    if update.imposto is not None:
        item['imposto'] = update.imposto
    
    if update.frete_envio is not None:
        item['frete_envio'] = update.frete_envio
    
    debug_info["item_depois"] = {
        "codigo": item.get('codigo_item'),
        "preco_compra": item.get('preco_compra'),
        "preco_venda": item.get('preco_venda'),
        "fontes_compra": len(item.get('fontes_compra', []))
    }
    
    # Salvar
    result = await db.purchase_orders.update_one(
        {"id": po_id},
        {"$set": {"items": po['items']}}
    )
    
    debug_info["mongodb"] = {
        "matched": result.matched_count,
        "modified": result.modified_count
    }
    
    # Verificar se salvou
    po_verificar = await db.purchase_orders.find_one({"id": po_id}, {"_id": 0})
    item_verificar = po_verificar['items'][item_index]
    
    debug_info["item_verificado"] = {
        "preco_compra": item_verificar.get('preco_compra'),
        "preco_venda": item_verificar.get('preco_venda'),
        "fontes_compra": len(item_verificar.get('fontes_compra', []))
    }
    
    debug_info["sucesso"] = True
    return debug_info

# ENDPOINT DE TESTE DIRETO - PARA DEBUG DEFINITIVO
@api_router.post("/test-update-direto/{po_id}/{item_index}")
async def test_update_direto(po_id: str, item_index: int, current_user: dict = Depends(get_current_user)):
    """
    Teste direto de update - faz uma edição simples e retorna o resultado
    """
    try:
        # 1. Buscar a OC
        po = await db.purchase_orders.find_one({"id": po_id}, {"_id": 0})
        
        if not po:
            return {"erro": "OC não encontrada", "po_id": po_id}
        
        if item_index < 0 or item_index >= len(po['items']):
            return {"erro": "Índice inválido", "item_index": item_index, "total": len(po['items'])}
        
        # 2. Pegar o item
        item = po['items'][item_index]
        valor_antigo = item.get('preco_compra')
        
        # 3. Fazer uma edição de teste
        item['preco_compra'] = 12345.67
        item['_teste_update'] = "FUNCIONOU"
        
        # 4. Salvar
        result = await db.purchase_orders.update_one(
            {"id": po_id},
            {"$set": {"items": po['items']}}
        )
        
        # 5. Buscar novamente para confirmar
        po_depois = await db.purchase_orders.find_one({"id": po_id}, {"_id": 0})
        item_depois = po_depois['items'][item_index]
        
        return {
            "sucesso": True,
            "usuario": current_user.get('sub'),
            "role": current_user.get('role'),
            "valor_antigo": valor_antigo,
            "valor_novo": item_depois.get('preco_compra'),
            "teste_campo": item_depois.get('_teste_update'),
            "mongodb_matched": result.matched_count,
            "mongodb_modified": result.modified_count
        }
    except Exception as e:
        return {"erro": str(e)}

# ENDPOINT DE TESTE DE EDIÇÃO - PARA DEBUG
@api_router.post("/test-edit/{po_id}/{item_index}")
async def test_edit(po_id: str, item_index: int, current_user: dict = Depends(get_current_user)):
    """Endpoint de teste para verificar se edição funciona"""
    po = await db.purchase_orders.find_one({"id": po_id}, {"_id": 0})
    
    if not po:
        return {"error": "OC não encontrada", "po_id": po_id}
    
    if item_index < 0 or item_index >= len(po['items']):
        return {"error": "Índice inválido", "item_index": item_index, "total_items": len(po['items'])}
    
    item = po['items'][item_index]
    
    # Tentar atualizar
    try:
        item['_test_edit'] = "OK"
        await db.purchase_orders.update_one(
            {"id": po_id},
            {"$set": {"items": po['items']}}
        )
        return {
            "success": True,
            "message": "Edição funcionou!",
            "user": current_user.get('sub'),
            "role": current_user.get('role'),
            "item_codigo": item.get('codigo_item')
        }
    except Exception as e:
        return {"error": str(e)}

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


@api_router.get("/items/historico-cotacoes")
async def get_historico_cotacoes(
    codigo_item: Optional[str] = None,
    descricao: Optional[str] = None,
    current_user: dict = Depends(get_current_user)
):
    """
    Buscar histórico de cotações anteriores para um item.
    Retorna links e fornecedores de itens já cotados/comprados com mesmo código ou descrição similar.
    """
    if not codigo_item and not descricao:
        return {"historico": [], "encontrado": False}
    
    # Buscar todas as OCs
    pos = await db.purchase_orders.find({}, {"_id": 0}).to_list(5000)
    
    historico = []
    seen_combinations = set()  # Para evitar duplicatas
    
    # Status que indicam que o item já foi cotado
    status_cotados = ['cotado', 'comprado', 'em_separacao', 'em_transito', 'entregue']
    
    for po in pos:
        for item in po.get('items', []):
            item_status = item.get('status', '').lower()
            
            # Verificar se o item já foi cotado
            if item_status not in status_cotados:
                continue
            
            # Verificar se é o mesmo item (por código ou descrição similar)
            match_codigo = codigo_item and item.get('codigo_item', '').upper() == codigo_item.upper()
            match_descricao = descricao and descricao.upper() in (item.get('descricao', '') or '').upper()
            
            if not match_codigo and not match_descricao:
                continue
            
            # Extrair fontes de compra do item
            fontes_compra = item.get('fontes_compra', [])
            
            for fonte in fontes_compra:
                fornecedor = fonte.get('fornecedor', '').strip()
                link = fonte.get('link', '').strip()
                preco = fonte.get('preco_unitario', 0)
                frete = fonte.get('frete', 0)
                
                # Criar chave única para evitar duplicatas
                key = f"{fornecedor}_{link}_{preco}"
                if key in seen_combinations:
                    continue
                seen_combinations.add(key)
                
                if fornecedor or link:
                    historico.append({
                        "numero_oc": po.get('numero_oc', ''),
                        "codigo_item": item.get('codigo_item', ''),
                        "descricao": item.get('descricao', ''),
                        "status": item_status,
                        "fornecedor": fornecedor,
                        "link": link,
                        "preco_unitario": preco,
                        "frete": frete,
                        "data_compra": item.get('updated_at') or item.get('created_at', '')
                    })
    
    # Ordenar por data mais recente
    historico.sort(key=lambda x: x.get('data_compra', ''), reverse=True)
    
    # Limitar a 10 resultados mais recentes
    historico = historico[:10]
    
    return {
        "historico": historico,
        "encontrado": len(historico) > 0,
        "total": len(historico)
    }

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
        "data_entrega": oc_data.get("data_entrega"),
        "cnpj_requisitante": oc_data.get("cnpj_requisitante", ""),
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
    
    # Criar OC com data de entrega extraída do PDF
    po = PurchaseOrder(
        numero_oc=oc_data["numero_oc"],
        items=processed_items,
        created_by=current_user.get('sub')
    )
    
    doc = po.model_dump()
    doc['created_at'] = doc['created_at'].isoformat()
    
    # Adicionar data de entrega e CNPJ do requisitante
    if oc_data.get("data_entrega"):
        doc['data_entrega'] = oc_data["data_entrega"]
    if oc_data.get("cnpj_requisitante"):
        doc['cnpj_requisitante'] = oc_data["cnpj_requisitante"]
    
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
            
            # Criar OC com data de entrega
            po = PurchaseOrder(
                numero_oc=oc_data["numero_oc"],
                cnpj_requisitante=oc_data.get("cnpj_requisitante", ""),
                items=processed_items,
                created_by=current_user.get('sub')
            )
            
            doc = po.model_dump()
            doc['created_at'] = doc['created_at'].isoformat()
            
            # Adicionar data de entrega se extraída do PDF
            if oc_data.get("data_entrega"):
                doc['data_entrega'] = oc_data["data_entrega"]
            
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
        data_entrega=po_create.data_entrega,
        items=processed_items,
        created_by=current_user.get('sub')
    )
    
    doc = po.model_dump()
    doc['created_at'] = doc['created_at'].isoformat()
    
    await db.purchase_orders.insert_one(doc)
    
    return po

@api_router.get("/purchase-orders")
async def get_purchase_orders(
    current_user: dict = Depends(get_current_user),
    page: int = 1,
    limit: int = 5,
    search: str = None,
    responsavel: str = None
):
    """Listar Ordens de Compra com paginação server-side"""
    query = {}
    
    # Busca total primeiro (para paginação)
    total = await db.purchase_orders.count_documents(query)
    
    # Paginação
    skip = (page - 1) * limit
    
    # Se limit = 0, retornar todos (para compatibilidade)
    if limit == 0:
        pos = await db.purchase_orders.find(query, {"_id": 0}).to_list(1000)
    else:
        pos = await db.purchase_orders.find(query, {"_id": 0}).skip(skip).limit(limit).to_list(limit)
    
    for po in pos:
        if isinstance(po['created_at'], str):
            po['created_at'] = datetime.fromisoformat(po['created_at'])
        
        # Adicionar índice original a cada item ANTES de filtrar
        for idx, item in enumerate(po['items']):
            item['_originalIndex'] = idx
        
        # Se não for admin, filtrar apenas itens do responsável (case-insensitive)
        if current_user['role'] != 'admin' and current_user.get('owner_name'):
            user_name = current_user['owner_name'].strip().upper()
            po['items'] = [item for item in po['items'] if (item.get('responsavel') or '').strip().upper() == user_name]
    
    return {
        "data": pos,
        "total": total,
        "page": page,
        "limit": limit,
        "total_pages": (total + limit - 1) // limit if limit > 0 else 1
    }


@api_router.get("/purchase-orders/list/simple")
async def get_purchase_orders_simple(
    current_user: dict = Depends(get_current_user),
    search_oc: str = None,
    search_codigo: str = None,
    search_descricao: str = None,
    search_responsavel: str = None,
    date_from: str = None,
    date_to: str = None
):
    """Listar Ordens de Compra de forma simplificada (para carregamento rápido)
    Retorna apenas dados essenciais sem os itens completos
    Suporta filtros server-side para performance"""
    query = {}
    
    pos = await db.purchase_orders.find(query, {
        "_id": 0,
        "id": 1,
        "numero_oc": 1,
        "created_at": 1,
        "data_entrega": 1,  # Data de entrega
        "endereco_entrega": 1,  # Endereço de entrega
        "cnpj_requisitante": 1,
        "items": 1  # Necessário para contagem e filtro
    }).to_list(1000)
    
    result = []
    for po in pos:
        if isinstance(po.get('created_at'), str):
            po['created_at'] = datetime.fromisoformat(po['created_at'])
        
        # Filtro por número da OC
        if search_oc:
            if search_oc.lower() not in po['numero_oc'].lower():
                continue
        
        # Filtro por data
        if date_from or date_to:
            po_date = po['created_at']
            if isinstance(po_date, str):
                po_date = datetime.fromisoformat(po_date)
            
            if date_from:
                from_date = datetime.fromisoformat(date_from)
                if po_date.date() < from_date.date():
                    continue
            
            if date_to:
                to_date = datetime.fromisoformat(date_to)
                if po_date.date() > to_date.date():
                    continue
        
        items = po.get('items', [])
        
        # Se não for admin, filtrar apenas itens do responsável
        if current_user['role'] != 'admin' and current_user.get('owner_name'):
            user_name = current_user['owner_name'].strip().upper()
            items = [item for item in items if (item.get('responsavel') or '').strip().upper() == user_name]
        
        # Filtro por código do item
        if search_codigo:
            search_codigo_upper = search_codigo.upper()
            items = [item for item in items if search_codigo_upper in (item.get('codigo_item') or '').upper()]
            if not items:
                continue  # Pular OC se nenhum item corresponder
        
        # Filtro por descrição/nome do item
        if search_descricao:
            search_descricao_upper = search_descricao.upper()
            items = [item for item in items if search_descricao_upper in (item.get('descricao') or '').upper()]
            if not items:
                continue  # Pular OC se nenhum item corresponder
        
        # Filtro por responsável
        if search_responsavel:
            if search_responsavel == 'nao_atribuido':
                items = [item for item in items if 
                    not item.get('responsavel') or 
                    item.get('responsavel', '').strip() == '' or
                    'NÃO ENCONTRADO' in item.get('responsavel', '') or
                    'Não atribuído' in item.get('responsavel', '')
                ]
            else:
                items = [item for item in items if item.get('responsavel') == search_responsavel]
            
            if not items:
                continue  # Pular OC se nenhum item corresponder
        
        # Calcular resumo dos itens
        total_items = len(items)
        if total_items == 0:
            continue  # Pular OCs sem itens para o usuário
            
        valor_total = sum(
            (item.get('preco_venda') or 0) * (item.get('quantidade') or 1) 
            for item in items
        )
        
        result.append({
            "id": po['id'],
            "numero_oc": po['numero_oc'],
            "created_at": po['created_at'],
            "data_entrega": po.get('data_entrega'),  # Data de entrega extraída do PDF
            "endereco_entrega": po.get('endereco_entrega'),  # Endereço de entrega extraído do PDF
            "cnpj_requisitante": po.get('cnpj_requisitante', ''),
            "total_items": total_items,
            "valor_total": valor_total,
            # Resumo por status
            "status_count": {
                "pendente": sum(1 for i in items if i.get('status') == 'pendente'),
                "cotado": sum(1 for i in items if i.get('status') == 'cotado'),
                "comprado": sum(1 for i in items if i.get('status') == 'comprado'),
                "em_separacao": sum(1 for i in items if i.get('status') == 'em_separacao'),
                "em_transito": sum(1 for i in items if i.get('status') == 'em_transito'),
                "entregue": sum(1 for i in items if i.get('status') == 'entregue'),
            }
        })
    
    return result

@api_router.get("/purchase-orders/{po_id}")
async def get_purchase_order(po_id: str, current_user: dict = Depends(get_current_user)):
    """Obter detalhes de uma OC"""
    po = await db.purchase_orders.find_one({"id": po_id}, {"_id": 0})
    
    if not po:
        raise HTTPException(status_code=404, detail="Ordem de Compra não encontrada")
    
    if isinstance(po['created_at'], str):
        po['created_at'] = datetime.fromisoformat(po['created_at'])
    
    # Adicionar índice original a cada item ANTES de filtrar
    for idx, item in enumerate(po['items']):
        item['_originalIndex'] = idx
    
    # Se não for admin, filtrar apenas itens do responsável (case-insensitive)
    if current_user['role'] != 'admin' and current_user.get('owner_name'):
        user_name = current_user['owner_name'].strip().upper()
        po['items'] = [item for item in po['items'] if (item.get('responsavel') or '').strip().upper() == user_name]
    
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
    
    # OTIMIZAÇÃO: Batch query - buscar todas as referências de uma vez
    all_codigo_items = [item.codigo_item for item in po_update.items]
    all_ref_items = await db.reference_items.find(
        {"codigo_item": {"$in": all_codigo_items}},
        {"_id": 0}
    ).to_list(5000)
    
    # Criar lookup dictionary
    ref_lookup = {ref["codigo_item"]: ref for ref in all_ref_items}
    
    # Processar itens
    processed_items = []
    for item in po_update.items:
        ref_item = ref_lookup.get(item.codigo_item)
        
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
            "data_entrega": po_update.data_entrega,
            "items": [item.model_dump() for item in processed_items]
        }}
    )
    
    return {"message": "Ordem de Compra atualizada com sucesso"}


@api_router.patch("/purchase-orders/{po_id}/data-entrega")
async def update_data_entrega(
    po_id: str,
    data_entrega: str = Body(..., embed=True),
    current_user: dict = Depends(require_admin)
):
    """Atualizar data de entrega de uma OC (ADMIN ONLY)"""
    po = await db.purchase_orders.find_one({"id": po_id}, {"_id": 0})
    
    if not po:
        raise HTTPException(status_code=404, detail="Ordem de Compra não encontrada")
    
    # Validar formato da data (YYYY-MM-DD ou DD/MM/YYYY)
    try:
        if '/' in data_entrega:
            # Converter de DD/MM/YYYY para YYYY-MM-DD
            dia, mes, ano = data_entrega.split('/')
            data_entrega = f"{ano}-{mes}-{dia}"
        # Validar que é uma data válida
        datetime.strptime(data_entrega, '%Y-%m-%d')
    except ValueError:
        raise HTTPException(status_code=400, detail="Data inválida. Use o formato DD/MM/AAAA ou AAAA-MM-DD")
    
    await db.purchase_orders.update_one(
        {"id": po_id},
        {"$set": {"data_entrega": data_entrega}}
    )
    
    return {"message": "Data de entrega atualizada com sucesso", "data_entrega": data_entrega}


@api_router.patch("/purchase-orders/{po_id}/items/{codigo_item}")
async def update_item_status(po_id: str, codigo_item: str, update: ItemStatusUpdate, current_user: dict = Depends(get_current_user)):
    """Atualizar status de um item"""
    logger.info(f"update_item_status chamado: po_id={po_id}, codigo_item={codigo_item}, user={current_user.get('sub')}")
    
    po = await db.purchase_orders.find_one({"id": po_id}, {"_id": 0})
    
    if not po:
        raise HTTPException(status_code=404, detail="Ordem de Compra não encontrada")
    
    item_updated = False
    user_role = current_user.get('role', '')
    user_email = current_user.get('sub', '')
    
    for item in po['items']:
        if item['codigo_item'] == codigo_item:
            # PERMISSÃO SIMPLIFICADA: Qualquer usuário autenticado pode editar
            logger.info(f"Usuário {user_email} (role={user_role}) editando item {codigo_item}")
            
            item['status'] = update.status
            atualizar_data_compra(item, update.status)  # Atualiza data de compra automaticamente
            
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
            
            # Preço de venda pode ser editado por qualquer usuário
            if update.preco_venda is not None:
                item['preco_venda'] = update.preco_venda
            
            # Imposto e frete de envio são restritos a admins
            if current_user['role'] == 'admin':
                if update.imposto is not None:
                    item['imposto'] = update.imposto
                if update.frete_envio is not None:
                    item['frete_envio'] = update.frete_envio
            
            # Calcular lucro líquido usando a função centralizada
            calcular_lucro_item(item)
            
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
    """Atualizar item por índice - QUALQUER USUÁRIO PODE EDITAR"""
    logger.info(f"update_item_by_index_status: po_id={po_id}, item_index={item_index}, user={current_user.get('sub')}")
    
    # Buscar OC diretamente sem filtro
    po = await db.purchase_orders.find_one({"id": po_id}, {"_id": 0})
    
    if not po:
        raise HTTPException(status_code=404, detail="Ordem de Compra não encontrada")
    
    if item_index < 0 or item_index >= len(po['items']):
        raise HTTPException(status_code=404, detail="Índice de item inválido")
    
    item = po['items'][item_index]
    logger.info(f"Editando item {item.get('codigo_item')} - user: {current_user.get('sub')}")
    
    # APLICAR TODAS AS ALTERAÇÕES - SEM RESTRIÇÕES
    item['status'] = update.status
    atualizar_data_compra(item, update.status)  # Atualiza data de compra automaticamente
    
    # Fontes de compra
    if update.fontes_compra is not None:
        item['fontes_compra'] = [fc.model_dump() for fc in update.fontes_compra]
        total_custo = sum(fc.quantidade * fc.preco_unitario for fc in update.fontes_compra)
        total_frete = sum(fc.frete for fc in update.fontes_compra)
        total_qtd = sum(fc.quantidade for fc in update.fontes_compra)
        if total_qtd > 0:
            item['preco_compra'] = round(total_custo / total_qtd, 2)
        item['frete_compra'] = total_frete
    
    # Preço de venda - TODOS podem editar
    if update.preco_venda is not None:
        item['preco_venda'] = update.preco_venda
    
    # Imposto - TODOS podem editar
    if update.imposto is not None:
        item['imposto'] = update.imposto
    
    # Frete envio - TODOS podem editar
    if update.frete_envio is not None:
        item['frete_envio'] = update.frete_envio
    
    # Link de compra
    if update.link_compra is not None:
        item['link_compra'] = update.link_compra
    
    # Preço de compra manual
    if update.preco_compra is not None and not update.fontes_compra:
        item['preco_compra'] = update.preco_compra
    
    # Frete de compra manual
    if update.frete_compra is not None and not update.fontes_compra:
        item['frete_compra'] = update.frete_compra
    
    # Código de rastreio
    if update.codigo_rastreio is not None:
        item['codigo_rastreio'] = update.codigo_rastreio.strip().upper() if update.codigo_rastreio else None
    
    # No carrinho - checkbox
    if update.no_carrinho is not None:
        item['no_carrinho'] = update.no_carrinho
    
    # Observação
    if update.observacao is not None:
        item['observacao'] = update.observacao
    
    # Calcular lucro usando a função centralizada
    calcular_lucro_item(item)
    
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
    
    # SALVAR
    await db.purchase_orders.update_one(
        {"id": po_id},
        {"$set": {"items": po['items']}}
    )
    
    return {"message": "Item atualizado com sucesso"}

# Endpoint para mover múltiplos itens do carrinho para Comprado
@api_router.post("/purchase-orders/mover-carrinho-para-comprado")
async def mover_carrinho_para_comprado(
    items: List[dict],
    current_user: dict = Depends(get_current_user)
):
    """
    Move múltiplos itens marcados como 'no_carrinho' para status 'comprado'
    Recebe lista de: [{"po_id": "xxx", "item_index": 0}, ...]
    """
    logger.info(f"mover_carrinho_para_comprado: {len(items)} itens, user={current_user.get('sub')}")
    
    updated_count = 0
    errors = []
    now = datetime.now(timezone.utc).isoformat()
    
    # Agrupar por po_id para otimizar updates
    items_by_po = {}
    for item_info in items:
        po_id = item_info.get('po_id')
        item_index = item_info.get('item_index')
        if po_id and item_index is not None:
            if po_id not in items_by_po:
                items_by_po[po_id] = []
            items_by_po[po_id].append(item_index)
    
    for po_id, indices in items_by_po.items():
        try:
            po = await db.purchase_orders.find_one({"id": po_id}, {"_id": 0})
            if not po:
                errors.append(f"OC {po_id} não encontrada")
                continue
            
            for item_index in indices:
                if 0 <= item_index < len(po['items']):
                    item = po['items'][item_index]
                    item['status'] = 'comprado'
                    item['no_carrinho'] = False
                    atualizar_data_compra(item, 'comprado')  # Usa a função padronizada
                    updated_count += 1
                else:
                    errors.append(f"Índice {item_index} inválido na OC {po_id}")
            
            await db.purchase_orders.update_one(
                {"id": po_id},
                {"$set": {"items": po['items']}}
            )
        except Exception as e:
            errors.append(f"Erro ao atualizar OC {po_id}: {str(e)}")
    
    return {
        "message": f"{updated_count} itens movidos para Comprado",
        "updated_count": updated_count,
        "errors": errors if errors else None
    }

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
            
            # Recalcular imposto e lucro usando a função centralizada
            calcular_lucro_item(item)
            
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
        atualizar_data_compra(item, update.status)  # Atualiza data de compra automaticamente
    if update.preco_venda is not None:
        item['preco_venda'] = update.preco_venda
    if update.quantidade_comprada is not None:
        item['quantidade_comprada'] = update.quantidade_comprada
    
    # Recalcular imposto e lucro usando a função centralizada
    calcular_lucro_item(item)
    
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
        # Filtrar itens baseado no role (case-insensitive)
        if current_user['role'] != 'admin' and current_user.get('owner_name'):
            user_name = current_user['owner_name'].strip().upper()
            filtered_items = [item for item in po['items'] if (item.get('responsavel') or '').strip().upper() == user_name]
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
        # Admin vê todos os responsáveis com breakdown por status
        for owner in ['Maria', 'Mateus', 'João', 'Mylena', 'Fabio']:
            owner_items = [item for item in all_items if (item.get('responsavel') or '').strip().upper() == owner.upper()]
            items_por_responsavel[owner] = {
                "total": len(owner_items),
                "pendente": sum(1 for item in owner_items if item['status'] == ItemStatus.PENDENTE),
                "cotado": sum(1 for item in owner_items if item['status'] == ItemStatus.COTADO),
                "comprado": sum(1 for item in owner_items if item['status'] == ItemStatus.COMPRADO),
                "em_separacao": sum(1 for item in owner_items if item['status'] == ItemStatus.EM_SEPARACAO),
                "em_transito": sum(1 for item in owner_items if item['status'] == ItemStatus.EM_TRANSITO),
                "entregue": sum(1 for item in owner_items if item['status'] == ItemStatus.ENTREGUE)
            }
    else:
        # Usuário não-admin vê apenas seus próprios itens com breakdown
        owner_name = current_user.get('owner_name')
        if owner_name:
            user_name = owner_name.strip().upper()
            owner_items = [item for item in all_items if (item.get('responsavel') or '').strip().upper() == user_name]
            items_por_responsavel[owner_name] = {
                "total": len(owner_items),
                "pendente": sum(1 for item in owner_items if item['status'] == ItemStatus.PENDENTE),
                "cotado": sum(1 for item in owner_items if item['status'] == ItemStatus.COTADO),
                "comprado": sum(1 for item in owner_items if item['status'] == ItemStatus.COMPRADO),
                "em_separacao": sum(1 for item in owner_items if item['status'] == ItemStatus.EM_SEPARACAO),
                "em_transito": sum(1 for item in owner_items if item['status'] == ItemStatus.EM_TRANSITO),
                "entregue": sum(1 for item in owner_items if item['status'] == ItemStatus.ENTREGUE)
            }
    
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
        
        # Filtrar por responsável se não for admin (case-insensitive)
        if current_user['role'] != 'admin' and current_user.get('owner_name'):
            user_name = current_user['owner_name'].strip().upper()
            items_to_check = [item for item in po['items'] if (item.get('responsavel') or '').strip().upper() == user_name]
        
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
        
        # Lista de valores que NÃO são NCM (CEPs, códigos de barras, etc.)
        invalid_ncms = {
            '17582008', '83005430',  # CEPs
            '83704614',  # Código de vendedor/outro
        }
        
        # Estratégia 1: Procurar padrão "NCM/SH" seguido diretamente por 8 dígitos (mais confiável)
        # Em DANFEs, o NCM aparece na coluna NCM/SH
        ncm_direct_pattern = r'NCM[/\s]*SH[:\s]*(\d{8})'
        matches = re.findall(ncm_direct_pattern, full_text, re.IGNORECASE)
        for m in matches:
            if len(m) == 8 and m.isdigit() and m not in invalid_ncms:
                ncm_list.add(m)
        
        # Estratégia 2: Procurar na estrutura típica de DANFE
        # O NCM geralmente aparece após o código do produto e antes do CFOP
        # Padrão: linha com NCM/SH seguida de 8 dígitos em formato específico
        ncm_table_pattern = r'(?:NCM|NCM/SH)\s*\n?\s*(\d{8})'
        matches = re.findall(ncm_table_pattern, full_text, re.IGNORECASE | re.MULTILINE)
        for m in matches:
            if len(m) == 8 and m.isdigit() and m not in invalid_ncms:
                # Verificar se os primeiros 2 dígitos são capítulos válidos de NCM
                capitulo = int(m[:2])
                # Capítulos comuns: 84, 85 (máquinas/elétricos), 73 (ferro/aço), etc.
                # Capítulos válidos: 01-97
                if 1 <= capitulo <= 97:
                    ncm_list.add(m)
        
        # Estratégia 3: Buscar números de 8 dígitos que começam com capítulos comuns
        # Capítulos mais comuns em compras: 84, 85, 73, 39, 40, 48, 90, etc.
        common_chapters = ['84', '85', '73', '39', '40', '48', '90', '94', '72', '76', '83']
        all_8digit = re.findall(r'\b(\d{8})\b', full_text)
        for num in all_8digit:
            if num[:2] in common_chapters and num not in invalid_ncms:
                ncm_list.add(num)
        
        # Estratégia 4: Padrões tradicionais com formatação
        patterns = [
            r'NCM[:\s]*(\d{4}[\.\s]?\d{2}[\.\s]?\d{2})',
            r'Classifica[çc][ãa]o Fiscal[:\s]*(\d{4}[\.\s]?\d{2}[\.\s]?\d{2})',
            r'(\d{4}\.\d{2}\.\d{2})',  # Padrão com pontos (mais específico)
        ]
        
        for pattern in patterns:
            matches = re.findall(pattern, full_text, re.IGNORECASE)
            for match in matches:
                ncm = re.sub(r'[\.\s]', '', match)
                if len(ncm) == 8 and ncm.isdigit() and ncm not in invalid_ncms:
                    capitulo = int(ncm[:2])
                    if 1 <= capitulo <= 97:
                        ncm_list.add(ncm)
        
        if ncm_list:
            # Ordenar e retornar
            return ', '.join(sorted(ncm_list))
        
        return None
    except Exception as e:
        logging.error(f"Erro ao extrair NCM do PDF: {str(e)}")
        return None


def extract_items_with_ncm_from_pdf(pdf_bytes: bytes) -> List[dict]:
    """Extrair lista de itens com seus respectivos NCMs do PDF de NF"""
    try:
        doc = fitz.open(stream=pdf_bytes, filetype="pdf")
        full_text = ""
        for page in doc:
            full_text += page.get_text()
        doc.close()
        
        items = []
        invalid_ncms = {'17582008', '83005430', '83704614'}
        
        # Procurar seção de produtos
        start = full_text.find("DADOS DO PRODUTO")
        if start == -1:
            start = full_text.find("DADOS DOS PRODUTOS")
        
        if start != -1:
            # Pegar seção de produtos (até CÁLCULO ou DADOS ADICIONAIS)
            end_markers = ["CÁLCULO DO ISSQN", "DADOS ADICIONAIS", "INFORMAÇÕES COMPLEMENTARES"]
            end = len(full_text)
            for marker in end_markers:
                idx = full_text.find(marker, start)
                if idx != -1 and idx < end:
                    end = idx
            
            product_section = full_text[start:end]
            
            # Encontrar todos os NCMs de 8 dígitos na seção de produtos
            ncm_matches = list(re.finditer(r'\b(\d{8})\b', product_section))
            
            for match in ncm_matches:
                ncm = match.group(1)
                capitulo = int(ncm[:2])
                
                # Verificar se é um NCM válido (capítulos 01-97)
                if 1 <= capitulo <= 97 and ncm not in invalid_ncms:
                    # A descrição pode estar ANTES ou DEPOIS do NCM dependendo do layout
                    # Tentar primeiro DEPOIS do NCM (padrão mais comum em DANFEs)
                    after_text = product_section[match.end():match.end()+500]
                    lines_after = after_text.split('\n')[:8]
                    
                    descricao = ""
                    for line in lines_after:
                        line = line.strip()
                        # Descrição tem mais de 15 chars, contém letras e não é cabeçalho
                        if len(line) > 15 and re.search(r'[A-Za-z]', line):
                            if not any(header in line.upper() for header in ['DESCRIÇÃO', 'NCM/SH', 'CFOP', 'QUANT', 'VALOR', 'DADOS DO', 'CST', 'ALÍQUOTA']):
                                # Limpar a descrição (remover | Ped: etc)
                                descricao = re.sub(r'\s*\|\s*Ped:.*', '', line)
                                descricao = descricao[:80].strip()
                                break
                    
                    # Se não encontrou depois, tentar antes
                    if not descricao:
                        before_text = product_section[:match.start()]
                        lines_before = before_text.split('\n')[-10:]
                        
                        for line in reversed(lines_before):
                            line = line.strip()
                            if len(line) > 15 and re.search(r'[A-Za-z]', line):
                                if not any(header in line.upper() for header in ['DESCRIÇÃO', 'NCM/SH', 'CFOP', 'QUANT', 'VALOR', 'DADOS DO']):
                                    descricao = re.sub(r'\s*\|\s*Ped:.*', '', line)
                                    descricao = descricao[:80].strip()
                                    break
                    
                    if descricao:
                        items.append({
                            'descricao': descricao.upper(),
                            'ncm': ncm
                        })
        
        # Remover duplicatas mantendo ordem
        seen = set()
        unique_items = []
        for item in items:
            key = (item['descricao'], item['ncm'])
            if key not in seen:
                seen.add(key)
                unique_items.append(item)
        
        return unique_items
    except Exception as e:
        logging.error(f"Erro ao extrair itens do PDF: {str(e)}")
        return []


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
    
    # Tentar extrair NCM, número da NF e itens
    ncm = request.ncm_manual
    numero_nf = None
    itens_nf = []  # Lista de itens com NCMs
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
            # Extrair itens com NCMs
            itens_nf = extract_items_with_ncm_from_pdf(file_bytes)
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
        "itens_nf": itens_nf,  # Lista de itens com NCMs
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
        "ncm": ncm or "NCM NAO ENCONTRADO",
        "itens_nf": itens_nf
    }


# ============== ENDPOINTS PARA NF DE VENDA DA OC (não do item) ==============

class NFVendaOCRequest(BaseModel):
    filename: str
    content_type: str
    file_data: str  # Base64
    itens_indices: Optional[List[int]] = None  # Índices dos itens incluídos na NF


@api_router.post("/purchase-orders/{po_id}/nf-venda")
async def add_nf_venda_oc(
    po_id: str,
    request: NFVendaOCRequest,
    current_user: dict = Depends(get_current_user)
):
    """Adicionar NF de Venda para a OC (pode ser parcial com itens selecionados)"""
    po = await db.purchase_orders.find_one({"id": po_id}, {"_id": 0})
    
    if not po:
        raise HTTPException(status_code=404, detail="Ordem de Compra não encontrada")
    
    # Extrair número da NF do PDF se aplicável
    numero_nf = None
    if request.filename.lower().endswith('.pdf'):
        try:
            import base64
            pdf_bytes = base64.b64decode(request.file_data)
            doc = fitz.open(stream=pdf_bytes, filetype="pdf")
            text = ""
            for page in doc:
                text += page.get_text()
            doc.close()
            
            nf_patterns = [
                r'NF[- ]?e?[:\s]*(\d{6,})',
                r'N[úu]mero[:\s]*(\d{6,})',
                r'NOTA FISCAL[:\s]*(\d{6,})'
            ]
            for pattern in nf_patterns:
                match = re.search(pattern, text, re.IGNORECASE)
                if match:
                    numero_nf = match.group(1)
                    break
        except Exception as e:
            logger.warning(f"Erro ao extrair número da NF: {e}")
    
    # Se itens_indices foi fornecido, usar; senão, incluir todos os itens
    items = po.get('items', [])
    total_itens = len(items)
    
    # Determinar quais itens serão incluídos nesta NF
    if request.itens_indices is not None and len(request.itens_indices) > 0:
        itens_nf = request.itens_indices
    else:
        # Incluir todos os itens que estão em "em_separacao"
        itens_nf = [i for i, item in enumerate(items) if item.get('status') == 'em_separacao']
    
    nf_doc = {
        "id": str(uuid.uuid4()),
        "filename": request.filename,
        "content_type": request.content_type,
        "file_data": request.file_data,
        "numero_nf": numero_nf,
        "uploaded_at": datetime.now(timezone.utc).isoformat(),
        "uploaded_by": current_user.get('sub'),
        "itens_indices": itens_nf  # Guardar quais itens estão na NF
    }
    
    # Mesclar com NF existente se houver (para permitir múltiplas NFs parciais)
    existing_nfs = po.get('notas_fiscais_venda', [])
    existing_nfs.append(nf_doc)
    
    # Também manter retrocompatibilidade com nota_fiscal_venda (última NF)
    await db.purchase_orders.update_one(
        {"id": po_id},
        {"$set": {
            "nota_fiscal_venda": nf_doc,
            "notas_fiscais_venda": existing_nfs
        }}
    )
    
    return {
        "success": True,
        "message": f"NF de Venda adicionada para {len(itens_nf)} item(s)",
        "nf_id": nf_doc["id"],
        "numero_nf": numero_nf,
        "itens_incluidos": len(itens_nf),
        "total_itens_oc": total_itens
    }


@api_router.get("/purchase-orders/{po_id}/nf-venda/download")
async def download_nf_venda_oc(
    po_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Download da NF de Venda da OC"""
    po = await db.purchase_orders.find_one({"id": po_id}, {"_id": 0})
    
    if not po:
        raise HTTPException(status_code=404, detail="Ordem de Compra não encontrada")
    
    nf_venda = po.get('nota_fiscal_venda')
    if not nf_venda:
        raise HTTPException(status_code=404, detail="NF de Venda não encontrada")
    
    return {
        "filename": nf_venda['filename'],
        "content_type": nf_venda['content_type'],
        "file_data": nf_venda['file_data']
    }


@api_router.delete("/purchase-orders/{po_id}/nf-venda")
async def delete_nf_venda_oc(
    po_id: str,
    nf_id: Optional[str] = None,
    current_user: dict = Depends(get_current_user)
):
    """Remover NF de Venda da OC (específica ou todas)"""
    po = await db.purchase_orders.find_one({"id": po_id}, {"_id": 0})
    
    if not po:
        raise HTTPException(status_code=404, detail="Ordem de Compra não encontrada")
    
    if nf_id:
        # Remover NF específica da lista
        existing_nfs = po.get('notas_fiscais_venda', [])
        existing_nfs = [nf for nf in existing_nfs if nf.get('id') != nf_id]
        
        # Atualizar nota_fiscal_venda para a última NF ou None
        last_nf = existing_nfs[-1] if existing_nfs else None
        
        await db.purchase_orders.update_one(
            {"id": po_id},
            {"$set": {
                "notas_fiscais_venda": existing_nfs,
                "nota_fiscal_venda": last_nf
            }}
        )
    else:
        # Remover todas as NFs
        await db.purchase_orders.update_one(
            {"id": po_id},
            {"$unset": {"nota_fiscal_venda": "", "notas_fiscais_venda": ""}}
        )
    
    return {"success": True, "message": "NF de Venda removida"}


class ProntoDespachoOCRequest(BaseModel):
    pronto_despacho: bool


@api_router.patch("/purchase-orders/{po_id}/pronto-despacho")
async def toggle_pronto_despacho_oc(
    po_id: str,
    request: ProntoDespachoOCRequest,
    current_user: dict = Depends(get_current_user)
):
    """Marcar OC inteira como Pronta para Despacho"""
    po = await db.purchase_orders.find_one({"id": po_id}, {"_id": 0})
    
    if not po:
        raise HTTPException(status_code=404, detail="Ordem de Compra não encontrada")
    
    await db.purchase_orders.update_one(
        {"id": po_id},
        {"$set": {"pronto_despacho": request.pronto_despacho}}
    )
    
    return {"success": True, "pronto_despacho": request.pronto_despacho}


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


class BulkDownloadRequest(BaseModel):
    nfs: List[dict]  # Lista de {po_id, item_index, nf_id, tipo}


@api_router.post("/admin/notas-fiscais/bulk-download")
async def bulk_download_notas_fiscais(
    request: BulkDownloadRequest,
    current_user: dict = Depends(require_admin)
):
    """Download de múltiplas notas fiscais em formato ZIP"""
    import zipfile
    import io
    import base64
    
    if not request.nfs:
        raise HTTPException(status_code=400, detail="Nenhuma NF selecionada")
    
    # Criar arquivo ZIP em memória
    zip_buffer = io.BytesIO()
    user_name = current_user.get('owner_name', current_user.get('email', 'admin'))
    downloaded_at = datetime.now(timezone.utc).isoformat()
    
    with zipfile.ZipFile(zip_buffer, 'w', zipfile.ZIP_DEFLATED) as zip_file:
        for nf_info in request.nfs:
            po_id = nf_info.get('po_id')
            item_index = nf_info.get('item_index')
            nf_id = nf_info.get('nf_id')
            tipo = nf_info.get('tipo', 'fornecedor')
            
            po = await db.purchase_orders.find_one({"id": po_id}, {"_id": 0})
            if not po or item_index >= len(po['items']):
                continue
            
            item = po['items'][item_index]
            nf_data = None
            
            if tipo == 'fornecedor':
                for nf in item.get('notas_fiscais_fornecedor', []):
                    if nf['id'] == nf_id:
                        nf_data = nf
                        break
            else:
                nf_revenda = item.get('nota_fiscal_revenda')
                if nf_revenda and nf_revenda['id'] == nf_id:
                    nf_data = nf_revenda
            
            if nf_data:
                # Decodificar arquivo base64
                file_bytes = base64.b64decode(nf_data['file_data'])
                filename = f"{po['numero_oc']}_{item.get('codigo_item', 'item')}_{nf_data['filename']}"
                zip_file.writestr(filename, file_bytes)
                
                # Marcar NF como baixada
                if tipo == 'fornecedor':
                    for idx, nf in enumerate(item.get('notas_fiscais_fornecedor', [])):
                        if nf['id'] == nf_id:
                            await db.purchase_orders.update_one(
                                {"id": po_id},
                                {"$set": {
                                    f"items.{item_index}.notas_fiscais_fornecedor.{idx}.baixado_por": user_name,
                                    f"items.{item_index}.notas_fiscais_fornecedor.{idx}.baixado_em": downloaded_at
                                }}
                            )
                            break
                else:
                    await db.purchase_orders.update_one(
                        {"id": po_id},
                        {"$set": {
                            f"items.{item_index}.nota_fiscal_revenda.baixado_por": user_name,
                            f"items.{item_index}.nota_fiscal_revenda.baixado_em": downloaded_at
                        }}
                    )
    
    zip_buffer.seek(0)
    zip_base64 = base64.b64encode(zip_buffer.read()).decode('utf-8')
    
    return {
        "filename": f"notas_fiscais_{datetime.now().strftime('%Y%m%d_%H%M%S')}.zip",
        "content_type": "application/zip",
        "file_data": zip_base64,
        "total_nfs": len(request.nfs)
    }


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
    """Obter dados de comissões por responsável baseado em lotes específicos
    
    Sistema de Comissões:
    - Comissão fixa de 1.5% sobre o VALOR TOTAL DA VENDA
    - Apenas para itens com status "entregue" ou "em_transito"
    - Baseado em LOTES específicos atribuídos a cada pessoa
    - Apenas usuários não-admin (Maria, Mylena, Fabio)
    """
    
    # Mapeamento fixo de LOTES por pessoa (baseado na cotação original)
    # Formato: "Lote XX" onde XX é o número
    LOTES_POR_PESSOA = {
        'MARIA': [1,2,3,4,5,6,7,8,9,10,11,12,43,44,45,46,47,48,49,50,51,52,53],
        'MYLENA': [80,81,82,83,84,85,86,87,88,89,90,91,92,93,94,95,96,97],
        'FABIO': [32,33,34,35,36,37,38,39,40,41,42],
    }
    
    # OCs que foram cotadas por ADMIN (João/Mateus) e não devem gerar comissão
    # mesmo que o lote esteja na lista de alguém
    OCS_EXCLUIDAS_COMISSAO = ['OC-2.118938', 'OC-2.118941']
    
    # Comissão fixa de 1.5%
    PERCENTUAL_COMISSAO = 1.5
    
    def extrair_numero_lote(lote_str):
        """Extrai o número do lote de strings como 'Lote 36' ou '36'"""
        if not lote_str:
            return None
        import re
        match = re.search(r'(\d+)', str(lote_str))
        return int(match.group(1)) if match else None
    
    # Obter todas as OCs
    pos = await db.purchase_orders.find({}, {"_id": 0}).to_list(length=1000)
    
    # Calcular valor de venda por pessoa baseado nos lotes
    valor_venda_por_pessoa = {nome: 0 for nome in LOTES_POR_PESSOA.keys()}
    itens_por_pessoa = {nome: [] for nome in LOTES_POR_PESSOA.keys()}
    
    for po in pos:
        numero_oc = po.get('numero_oc', '')
        
        # Pular OCs que foram cotadas por admin
        if numero_oc in OCS_EXCLUIDAS_COMISSAO:
            continue
            
        for item in po.get('items', []):
            item_status = item.get('status', '')
            # Apenas itens "entregue" ou "em_transito" geram comissão
            if item_status not in ['entregue', 'em_transito']:
                continue
                
            numero_lote = extrair_numero_lote(item.get('lote', ''))
            if numero_lote is None:
                continue
            
            # Verificar a qual pessoa pertence este lote
            for pessoa, lotes in LOTES_POR_PESSOA.items():
                if numero_lote in lotes:
                    # Calcular valor total de venda do item
                    preco_venda = item.get('preco_venda', 0) or 0
                    quantidade = item.get('quantidade', 1) or 1
                    valor_total_venda = preco_venda * quantidade
                    
                    valor_venda_por_pessoa[pessoa] += valor_total_venda
                    itens_por_pessoa[pessoa].append({
                        'numero_oc': numero_oc,
                        'codigo_item': item.get('codigo_item'),
                        'lote': item.get('lote'),
                        'valor_venda': valor_total_venda,
                        'status': item_status
                    })
                    break  # Cada lote pertence a apenas uma pessoa
    
    # Montar resposta
    resultado = []
    for pessoa, valor_venda in valor_venda_por_pessoa.items():
        valor_comissao = valor_venda * (PERCENTUAL_COMISSAO / 100)
        resultado.append({
            'responsavel': pessoa,
            'email': None,
            'valor_venda_total': valor_venda,
            'percentual_comissao': PERCENTUAL_COMISSAO,
            'valor_comissao': valor_comissao,
            'lotes_atribuidos': LOTES_POR_PESSOA[pessoa],
            'qtd_itens': len(itens_por_pessoa[pessoa])
        })
    
    return sorted(resultado, key=lambda x: x['valor_venda_total'], reverse=True)

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
    
    # Para detectar duplicatas, usamos o filename como chave
    nf_por_filename = {}  # filename -> lista de itens que usam essa NF
    
    for po in pos:
        for idx, item in enumerate(po.get('items', [])):
            # NFs de compra (fornecedor)
            for nf in item.get('notas_fiscais_fornecedor', []):
                filename = nf.get('filename', '')
                
                # Rastrear quais itens usam cada NF
                if filename not in nf_por_filename:
                    nf_por_filename[filename] = []
                nf_por_filename[filename].append({
                    'numero_oc': po.get('numero_oc'),
                    'codigo_item': item.get('codigo_item')
                })
                
                nfs_compra.append({
                    'id': nf.get('id'),
                    'filename': filename,
                    'content_type': nf.get('content_type'),
                    'ncm': nf.get('ncm'),
                    'numero_nf': nf.get('numero_nf'),  # Número da NF
                    'uploaded_at': nf.get('uploaded_at'),
                    'numero_oc': po.get('numero_oc'),
                    'codigo_item': item.get('codigo_item'),
                    'descricao': item.get('descricao', '')[:50],
                    'po_id': po.get('id'),
                    'item_index': idx,
                    'baixado_por': nf.get('baixado_por'),
                    'baixado_em': nf.get('baixado_em')
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
                    'item_index': idx,
                    'baixado_por': nf_revenda.get('baixado_por'),
                    'baixado_em': nf_revenda.get('baixado_em')
                })
    
    # Marcar NFs que são usadas em múltiplos itens
    for nf in nfs_compra:
        filename = nf.get('filename', '')
        itens_usando = nf_por_filename.get(filename, [])
        nf['duplicada'] = len(itens_usando) > 1
        nf['itens_usando'] = itens_usando if len(itens_usando) > 1 else []
        nf['qtd_usos'] = len(itens_usando)
    
    # Criar lista de NFs duplicadas (únicas por filename)
    nfs_duplicadas = []
    filenames_vistos = set()
    for nf in nfs_compra:
        if nf.get('duplicada') and nf['filename'] not in filenames_vistos:
            filenames_vistos.add(nf['filename'])
            nfs_duplicadas.append({
                'filename': nf['filename'],
                'numero_nf': nf.get('numero_nf'),
                'ncm': nf.get('ncm'),
                'qtd_usos': nf['qtd_usos'],
                'itens': nf['itens_usando']
            })
    
    # Ordenar por data de upload (mais recente primeiro)
    nfs_compra.sort(key=lambda x: x.get('uploaded_at', ''), reverse=True)
    nfs_venda.sort(key=lambda x: x.get('uploaded_at', ''), reverse=True)
    
    return {
        'notas_compra': nfs_compra,
        'notas_venda': nfs_venda,
        'total_compra': len(nfs_compra),
        'total_venda': len(nfs_venda),
        'notas_duplicadas': nfs_duplicadas,
        'total_duplicadas': len(nfs_duplicadas)
    }

@api_router.get("/admin/itens-responsavel/{responsavel}")
async def get_itens_responsavel(responsavel: str, current_user: dict = Depends(require_admin)):
    """Obter todos os itens entregues/em_transito de uma pessoa baseado nos LOTES atribuídos
    
    Sistema de Comissões baseado em LOTES específicos.
    """
    
    # Mapeamento fixo de LOTES por pessoa (baseado na cotação original)
    LOTES_POR_PESSOA = {
        'MARIA': [1,2,3,4,5,6,7,8,9,10,11,12,43,44,45,46,47,48,49,50,51,52,53],
        'MYLENA': [80,81,82,83,84,85,86,87,88,89,90,91,92,93,94,95,96,97],
        'FABIO': [32,33,34,35,36,37,38,39,40,41,42],
    }
    
    # OCs que foram cotadas por ADMIN (João/Mateus) e não devem gerar comissão
    OCS_EXCLUIDAS_COMISSAO = ['OC-2.118938', 'OC-2.118941']
    
    # Comissão fixa de 1.5%
    PERCENTUAL_COMISSAO = 1.5
    
    def extrair_numero_lote(lote_str):
        """Extrai o número do lote de strings como 'Lote 36' ou '36'"""
        if not lote_str:
            return None
        import re
        match = re.search(r'(\d+)', str(lote_str))
        return int(match.group(1)) if match else None
    
    responsavel_upper = responsavel.upper().strip()
    
    # Verificar se o responsável existe no mapeamento
    if responsavel_upper not in LOTES_POR_PESSOA:
        return []
    
    lotes_do_responsavel = LOTES_POR_PESSOA[responsavel_upper]
    
    pos = await db.purchase_orders.find({}, {"_id": 0}).to_list(length=1000)
    
    # Obter IDs de itens já pagos
    pagamentos = await db.pagamentos.find({}, {"_id": 0}).to_list(length=1000)
    itens_pagos = set()
    for pag in pagamentos:
        for item_id in pag.get('itens_ids', []):
            itens_pagos.add(item_id)
    
    itens = []
    for po in pos:
        numero_oc = po.get('numero_oc', '')
        
        # Pular OCs que foram cotadas por admin
        if numero_oc in OCS_EXCLUIDAS_COMISSAO:
            continue
            
        for idx, item in enumerate(po.get('items', [])):
            item_status = item.get('status', '')
            # Apenas itens "entregue" ou "em_transito" geram comissão
            if item_status not in ['entregue', 'em_transito']:
                continue
            
            numero_lote = extrair_numero_lote(item.get('lote', ''))
            if numero_lote is None or numero_lote not in lotes_do_responsavel:
                continue
            
            # Calcular valor total de venda
            preco_venda = item.get('preco_venda', 0) or 0
            quantidade = item.get('quantidade', 1) or 1
            valor_total_venda = preco_venda * quantidade
            valor_comissao = valor_total_venda * (PERCENTUAL_COMISSAO / 100)
            
            item_id = f"{po.get('id')}_{idx}"
            itens.append({
                'id': item_id,
                'po_id': po.get('id'),
                'item_index': idx,
                'numero_oc': numero_oc,
                'codigo_item': item.get('codigo_item'),
                'descricao': (item.get('descricao', '') or '')[:30],
                'lote': item.get('lote'),
                'valor_venda': valor_total_venda,
                'valor_comissao': valor_comissao,
                'status': item_status,
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
    total_venda: float  # Valor total de venda (1.5% sobre este valor)

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
        "total_venda": request.total_venda,
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


@api_router.get("/fornecedores")
async def get_fornecedores(current_user: dict = Depends(get_current_user)):
    """Buscar lista de fornecedores únicos do sistema"""
    
    pos = await db.purchase_orders.find({}, {"_id": 0, "items.fontes_compra.fornecedor": 1}).to_list(1000)
    
    fornecedores = set()
    for po in pos:
        for item in po.get('items', []):
            for fonte in item.get('fontes_compra', []):
                fornecedor = fonte.get('fornecedor', '').strip()
                if fornecedor:
                    fornecedores.add(fornecedor)
    
    return {"fornecedores": sorted(list(fornecedores))}


@api_router.patch("/purchase-orders/{po_id}/endereco-entrega")
async def update_po_endereco_entrega(
    po_id: str,
    data: dict,
    current_user: dict = Depends(require_admin)
):
    """Atualizar endereço de entrega da OC (apenas admin)"""
    
    endereco = data.get("endereco_entrega", "").strip().upper()
    
    result = await db.purchase_orders.update_one(
        {"id": po_id},
        {"$set": {"endereco_entrega": endereco}}
    )
    
    if result.modified_count == 0:
        raise HTTPException(status_code=404, detail="OC não encontrada")
    
    return {"success": True, "endereco_entrega": endereco}


@api_router.post("/purchase-orders/{po_id}/status-em-massa")
async def atualizar_status_em_massa(
    po_id: str,
    data: dict,
    current_user: dict = Depends(require_admin)
):
    """
    Atualizar o status de itens selecionados de uma OC.
    
    Body:
    {
        "novo_status": "entregue",  // pendente, cotado, comprado, em_separacao, em_transito, entregue
        "item_indices": [0, 1, 2]   // Opcional: Se não fornecido, atualiza todos os itens
    }
    """
    
    novo_status = data.get("novo_status", "").strip().lower()
    item_indices = data.get("item_indices")  # Lista de índices ou None
    
    status_validos = ["pendente", "cotado", "comprado", "em_separacao", "em_transito", "entregue"]
    
    if novo_status not in status_validos:
        raise HTTPException(status_code=400, detail=f"Status inválido. Use: {', '.join(status_validos)}")
    
    # Buscar OC
    po = await db.purchase_orders.find_one({"id": po_id}, {"_id": 0})
    if not po:
        raise HTTPException(status_code=404, detail="OC não encontrada")
    
    # Atualizar status dos itens (selecionados ou todos)
    items = po.get('items', [])
    itens_atualizados = 0
    
    # Se item_indices foi fornecido, usar apenas esses índices
    if item_indices is not None:
        indices_set = set(item_indices)
        for idx, item in enumerate(items):
            if idx in indices_set:
                status_anterior = item.get('status', 'pendente')
                if status_anterior != novo_status:
                    item['status'] = novo_status
                    atualizar_data_compra(item, novo_status)  # Atualiza data de compra automaticamente
                    itens_atualizados += 1
    else:
        # Atualizar todos os itens
        for item in items:
            status_anterior = item.get('status', 'pendente')
            if status_anterior != novo_status:
                item['status'] = novo_status
                atualizar_data_compra(item, novo_status)  # Atualiza data de compra automaticamente
                itens_atualizados += 1
    
    # Salvar alterações
    await db.purchase_orders.update_one(
        {"id": po_id},
        {"$set": {"items": items}}
    )
    
    return {
        "success": True,
        "numero_oc": po.get('numero_oc'),
        "novo_status": novo_status,
        "itens_atualizados": itens_atualizados,
        "total_itens": len(items)
    }


@api_router.post("/purchase-orders/{po_id}/frete-envio-multiplo")
async def aplicar_frete_envio_multiplo(
    po_id: str,
    data: dict,
    current_user: dict = Depends(require_admin)
):
    """
    Aplicar frete de envio dividido entre múltiplos itens.
    
    Body:
    {
        "item_indices": [0, 1, 2],  // Índices dos itens
        "frete_total": 150.00       // Valor total do frete a ser dividido
    }
    
    O frete será dividido igualmente entre os itens selecionados.
    """
    
    item_indices = data.get("item_indices", [])
    frete_total = data.get("frete_total", 0)
    
    if not item_indices:
        raise HTTPException(status_code=400, detail="Nenhum item selecionado")
    
    if frete_total <= 0:
        raise HTTPException(status_code=400, detail="Valor do frete deve ser maior que zero")
    
    # Buscar OC
    po = await db.purchase_orders.find_one({"id": po_id}, {"_id": 0})
    if not po:
        raise HTTPException(status_code=404, detail="OC não encontrada")
    
    # Calcular frete por item (dividido igualmente)
    frete_por_item = round(frete_total / len(item_indices), 2)
    
    # Atualizar cada item
    items = po.get('items', [])
    itens_atualizados = []
    
    for idx in item_indices:
        if idx < 0 or idx >= len(items):
            continue
        
        items[idx]['frete_envio'] = frete_por_item
        itens_atualizados.append({
            "indice": idx,
            "codigo_item": items[idx].get('codigo_item', ''),
            "frete_envio": frete_por_item
        })
        
        # Recalcular lucro líquido usando a função centralizada
        calcular_lucro_item(items[idx])
    
    # Salvar alterações
    await db.purchase_orders.update_one(
        {"id": po_id},
        {"$set": {"items": items}}
    )
    
    return {
        "success": True,
        "frete_total": frete_total,
        "frete_por_item": frete_por_item,
        "itens_atualizados": itens_atualizados,
        "quantidade_itens": len(itens_atualizados)
    }


@api_router.post("/purchase-orders/{po_id}/atualizar-pdf")
async def atualizar_oc_com_pdf(
    po_id: str,
    file: UploadFile = File(...),
    current_user: dict = Depends(require_admin)
):
    """
    Atualizar uma OC existente com dados de um novo PDF.
    
    Esta função PRESERVA todos os dados importantes dos itens:
    - Status (pendente, cotado, comprado, etc.)
    - Responsável
    - Fontes de compra (fornecedor, preço, link)
    - Notas fiscais anexadas
    - Observações
    - Frete, valor unitário de venda, etc.
    
    Atualiza apenas:
    - Endereço de entrega (se estava vazio)
    - Data de entrega (se estava vazia)
    - Outros campos do cabeçalho da OC
    """
    
    # Buscar OC existente
    existing_po = await db.purchase_orders.find_one({"id": po_id}, {"_id": 0})
    if not existing_po:
        raise HTTPException(status_code=404, detail="OC não encontrada")
    
    # Processar o PDF
    if not file.filename.lower().endswith('.pdf'):
        raise HTTPException(status_code=400, detail="Arquivo deve ser PDF")
    
    content = await file.read()
    
    try:
        pdf_doc = fitz.open(stream=content, filetype="pdf")
        full_text = ""
        for page in pdf_doc:
            full_text += page.get_text()
        pdf_doc.close()
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Erro ao ler PDF: {str(e)}")
    
    # Extrair dados do PDF
    # Endereço de Entrega
    endereco_patterns = [
        r'Endere[çc]o de Entrega[:\s]*(.*?)(?:\n\n|Linha|Item)',
        r'Local de Entrega[:\s]*(.*?)(?:\n\n|Linha|Item)',
        r'Entregar em[:\s]*(.*?)(?:\n\n|Linha|Item)'
    ]
    
    novo_endereco = ""
    for pattern in endereco_patterns:
        endereco_match = re.search(pattern, full_text, re.IGNORECASE | re.DOTALL)
        if endereco_match:
            novo_endereco = endereco_match.group(1).strip()
            novo_endereco = ' '.join(novo_endereco.split()).upper()
            break
    
    # Data de Entrega
    nova_data_entrega = None
    data_patterns = [
        r'Data de Entrega[:\s]*(\d{2}/\d{2}/\d{4})',
        r'Data Entrega[:\s]*(\d{2}/\d{2}/\d{4})',
        r'Entrega[:\s]*(\d{2}/\d{2}/\d{4})',
        r'Prazo de Entrega[:\s]*(\d{2}/\d{2}/\d{4})',
        r'Dt\.\s*Entrega[:\s]*(\d{2}/\d{2}/\d{4})'
    ]
    
    for pattern in data_patterns:
        data_match = re.search(pattern, full_text, re.IGNORECASE)
        if data_match:
            try:
                data_str = data_match.group(1)
                dia, mes, ano = data_str.split('/')
                nova_data_entrega = f"{ano}-{mes}-{dia}"
                break
            except:
                pass
    
    # Se não encontrou, buscar na tabela de itens
    if not nova_data_entrega:
        date_after_req = re.findall(r'\d{1,2}\.\d{2}\.\d{6,}\s*(\d{2}/\d{2}/\d{4})', full_text)
        if date_after_req:
            try:
                data_str = date_after_req[0]
                dia, mes, ano = data_str.split('/')
                nova_data_entrega = f"{ano}-{mes}-{dia}"
            except:
                pass
    
    # Preparar atualizações - SÓ atualiza campos vazios ou inexistentes
    updates = {}
    campos_atualizados = []
    
    # Atualizar endereço se estava vazio
    endereco_atual = existing_po.get('endereco_entrega', '').strip()
    if not endereco_atual and novo_endereco:
        updates['endereco_entrega'] = novo_endereco
        campos_atualizados.append(f"endereco_entrega: {novo_endereco}")
    
    # Atualizar data de entrega se estava vazia
    data_atual = existing_po.get('data_entrega', '').strip() if existing_po.get('data_entrega') else ''
    if not data_atual and nova_data_entrega:
        updates['data_entrega'] = nova_data_entrega
        campos_atualizados.append(f"data_entrega: {nova_data_entrega}")
    
    if not updates:
        return {
            "success": True,
            "message": "Nenhum campo precisou ser atualizado (todos já estão preenchidos)",
            "numero_oc": existing_po['numero_oc'],
            "campos_atualizados": []
        }
    
    # Aplicar atualizações
    await db.purchase_orders.update_one(
        {"id": po_id},
        {"$set": updates}
    )
    
    return {
        "success": True,
        "message": f"OC {existing_po['numero_oc']} atualizada com sucesso!",
        "numero_oc": existing_po['numero_oc'],
        "campos_atualizados": campos_atualizados,
        "dados_preservados": [
            "Status de todos os itens",
            "Responsáveis dos itens",
            "Fontes de compra",
            "Notas fiscais",
            "Observações",
            "Valores de frete e venda"
        ]
    }


@api_router.post("/admin/atualizar-todas-ocs-pdf")
async def atualizar_todas_ocs_com_pdfs(
    files: List[UploadFile] = File(...),
    current_user: dict = Depends(require_admin)
):
    """
    Atualizar múltiplas OCs de uma vez com seus PDFs.
    Cada PDF deve corresponder a uma OC existente (pelo número da OC no PDF).
    
    Preserva todos os dados dos itens, só atualiza campos vazios do cabeçalho.
    """
    
    resultados = []
    
    for file in files:
        if not file.filename.lower().endswith('.pdf'):
            resultados.append({
                "arquivo": file.filename,
                "success": False,
                "erro": "Arquivo não é PDF"
            })
            continue
        
        content = await file.read()
        
        try:
            pdf_doc = fitz.open(stream=content, filetype="pdf")
            full_text = ""
            for page in pdf_doc:
                full_text += page.get_text()
            pdf_doc.close()
        except Exception as e:
            resultados.append({
                "arquivo": file.filename,
                "success": False,
                "erro": f"Erro ao ler PDF: {str(e)}"
            })
            continue
        
        # Extrair número da OC
        oc_patterns = [
            r'(?:OC|Ordem de Compra)[:\s\-]*(\d+[\.\-]?\d+)',
            r'(?:N[úu]mero|N[°º])[:\s]*(\d+[\.\-]?\d+)',
            r'(\d{1,2}\.\d{6,})'
        ]
        
        numero_oc = None
        for pattern in oc_patterns:
            match = re.search(pattern, full_text, re.IGNORECASE)
            if match:
                numero_oc = f"OC-{match.group(1)}"
                break
        
        if not numero_oc:
            resultados.append({
                "arquivo": file.filename,
                "success": False,
                "erro": "Não foi possível identificar o número da OC no PDF"
            })
            continue
        
        # Buscar OC existente
        existing_po = await db.purchase_orders.find_one({"numero_oc": numero_oc}, {"_id": 0})
        if not existing_po:
            resultados.append({
                "arquivo": file.filename,
                "numero_oc": numero_oc,
                "success": False,
                "erro": f"OC {numero_oc} não encontrada no sistema"
            })
            continue
        
        # Extrair dados do PDF
        # Endereço
        endereco_patterns = [
            r'Endere[çc]o de Entrega[:\s]*(.*?)(?:\n\n|Linha|Item)',
            r'Local de Entrega[:\s]*(.*?)(?:\n\n|Linha|Item)',
            r'Entregar em[:\s]*(.*?)(?:\n\n|Linha|Item)'
        ]
        
        novo_endereco = ""
        for pattern in endereco_patterns:
            endereco_match = re.search(pattern, full_text, re.IGNORECASE | re.DOTALL)
            if endereco_match:
                novo_endereco = endereco_match.group(1).strip()
                novo_endereco = ' '.join(novo_endereco.split()).upper()
                break
        
        # Data de Entrega
        nova_data_entrega = None
        data_patterns = [
            r'Data de Entrega[:\s]*(\d{2}/\d{2}/\d{4})',
            r'Data Entrega[:\s]*(\d{2}/\d{2}/\d{4})',
            r'Entrega[:\s]*(\d{2}/\d{2}/\d{4})',
            r'Prazo de Entrega[:\s]*(\d{2}/\d{2}/\d{4})',
            r'Dt\.\s*Entrega[:\s]*(\d{2}/\d{2}/\d{4})'
        ]
        
        for pattern in data_patterns:
            data_match = re.search(pattern, full_text, re.IGNORECASE)
            if data_match:
                try:
                    data_str = data_match.group(1)
                    dia, mes, ano = data_str.split('/')
                    nova_data_entrega = f"{ano}-{mes}-{dia}"
                    break
                except:
                    pass
        
        if not nova_data_entrega:
            date_after_req = re.findall(r'\d{1,2}\.\d{2}\.\d{6,}\s*(\d{2}/\d{2}/\d{4})', full_text)
            if date_after_req:
                try:
                    data_str = date_after_req[0]
                    dia, mes, ano = data_str.split('/')
                    nova_data_entrega = f"{ano}-{mes}-{dia}"
                except:
                    pass
        
        # Preparar atualizações
        updates = {}
        campos_atualizados = []
        
        endereco_atual = existing_po.get('endereco_entrega', '').strip()
        if not endereco_atual and novo_endereco:
            updates['endereco_entrega'] = novo_endereco
            campos_atualizados.append(f"endereco: {novo_endereco[:50]}...")
        
        data_atual = existing_po.get('data_entrega', '').strip() if existing_po.get('data_entrega') else ''
        if not data_atual and nova_data_entrega:
            updates['data_entrega'] = nova_data_entrega
            campos_atualizados.append(f"data_entrega: {nova_data_entrega}")
        
        if updates:
            await db.purchase_orders.update_one(
                {"id": existing_po['id']},
                {"$set": updates}
            )
        
        resultados.append({
            "arquivo": file.filename,
            "numero_oc": numero_oc,
            "success": True,
            "campos_atualizados": campos_atualizados if campos_atualizados else ["Nenhum campo precisou ser atualizado"]
        })
    
    atualizadas = sum(1 for r in resultados if r.get('success') and r.get('campos_atualizados', [''])[0] != "Nenhum campo precisou ser atualizado")
    
    return {
        "success": True,
        "total_arquivos": len(files),
        "ocs_atualizadas": atualizadas,
        "resultados": resultados
    }


@api_router.post("/admin/migrar-enderecos")
async def migrar_enderecos_itens_para_oc(current_user: dict = Depends(require_admin)):
    """
    Migrar endereços de entrega dos itens para o nível da OC.
    Para cada OC sem endereco_entrega, busca o endereço do primeiro item que tenha.
    """
    
    # Buscar todas as OCs que não têm endereco_entrega
    pos = await db.purchase_orders.find(
        {"$or": [{"endereco_entrega": ""}, {"endereco_entrega": None}, {"endereco_entrega": {"$exists": False}}]},
        {"_id": 0, "id": 1, "numero_oc": 1, "items.endereco_entrega": 1}
    ).to_list(1000)
    
    migrados = 0
    erros = []
    
    for po in pos:
        # Buscar o primeiro item que tenha endereço de entrega
        endereco = None
        for item in po.get('items', []):
            item_endereco = item.get('endereco_entrega', '').strip()
            if item_endereco:
                endereco = item_endereco
                break
        
        if endereco:
            try:
                await db.purchase_orders.update_one(
                    {"id": po['id']},
                    {"$set": {"endereco_entrega": endereco}}
                )
                migrados += 1
            except Exception as e:
                erros.append(f"{po['numero_oc']}: {str(e)}")
    
    return {
        "success": True,
        "total_ocs_processadas": len(pos),
        "enderecos_migrados": migrados,
        "erros": erros
    }


@api_router.post("/admin/recalcular-lucros")
async def recalcular_lucros_todos_itens(current_user: dict = Depends(require_admin)):
    """
    Endpoint de migração para recalcular o lucro de todos os itens.
    Usa a nova fórmula que considera apenas a quantidade necessária, não a quantidade comprada.
    """
    pos = await db.purchase_orders.find({}, {"_id": 0}).to_list(5000)
    
    itens_recalculados = 0
    ocs_atualizadas = 0
    
    for po in pos:
        items_modified = False
        for item in po.get('items', []):
            old_lucro = item.get('lucro_liquido')
            calcular_lucro_item(item)
            new_lucro = item.get('lucro_liquido')
            
            if old_lucro != new_lucro:
                itens_recalculados += 1
                items_modified = True
        
        if items_modified:
            await db.purchase_orders.update_one(
                {"id": po['id']},
                {"$set": {"items": po['items']}}
            )
            ocs_atualizadas += 1
    
    return {
        "success": True,
        "itens_recalculados": itens_recalculados,
        "ocs_atualizadas": ocs_atualizadas
    }


# ============== ESTOQUE ==============
@api_router.get("/estoque")
async def listar_estoque(current_user: dict = Depends(get_current_user)):
    """
    Lista todos os itens em estoque (quantidade comprada > quantidade necessária).
    Agrupa por código do item e mostra o total disponível em estoque.
    
    A quantidade comprada pode vir de:
    1. Campo quantidade_comprada do item (se preenchido)
    2. Soma das quantidades das fontes de compra
    """
    
    # Buscar todos os itens de todas as OCs
    pos = await db.purchase_orders.find(
        {},
        {"_id": 0, "id": 1, "numero_oc": 1, "items": 1}
    ).to_list(5000)
    
    # Mapa de estoque: codigo_item -> {info do estoque}
    estoque_map = {}
    
    for po in pos:
        for idx, item in enumerate(po.get('items', [])):
            quantidade_necessaria = item.get('quantidade', 0)
            status = item.get('status', 'pendente')
            
            # Só considerar itens já comprados (comprado ou posterior)
            if status not in ['comprado', 'em_separacao', 'em_transito', 'entregue']:
                continue
            
            # Calcular quantidade comprada:
            # 1. Se tem campo quantidade_comprada, usar ele
            # 2. Senão, somar quantidades das fontes de compra
            quantidade_comprada = item.get('quantidade_comprada')
            
            if not quantidade_comprada:
                fontes = item.get('fontes_compra', [])
                if fontes:
                    quantidade_comprada = sum(f.get('quantidade', 0) for f in fontes)
                else:
                    quantidade_comprada = 0
            
            # Quantidade já usada do estoque
            quantidade_usada_estoque = item.get('quantidade_usada_estoque', 0)
            
            # Se a quantidade comprada é maior que a necessária + já usada, tem excedente
            if quantidade_comprada and quantidade_comprada > (quantidade_necessaria + quantidade_usada_estoque):
                excedente = quantidade_comprada - quantidade_necessaria - quantidade_usada_estoque
                codigo_item = item.get('codigo_item', '')
                
                # Pegar informações da fonte de compra (link, fornecedor)
                fontes = item.get('fontes_compra', [])
                link_compra = fontes[0].get('link', '') if fontes else ''
                fornecedor = fontes[0].get('fornecedor', '') if fontes else ''
                preco_unitario = fontes[0].get('preco_unitario', 0) if fontes else item.get('preco_compra', 0)
                
                if codigo_item not in estoque_map:
                    estoque_map[codigo_item] = {
                        'codigo_item': codigo_item,
                        'descricao': item.get('descricao', ''),
                        'marca_modelo': item.get('marca_modelo', ''),
                        'unidade': item.get('unidade', 'UN'),
                        'quantidade_estoque': excedente,
                        'link_compra': link_compra,
                        'fornecedor': fornecedor,
                        'preco_unitario': preco_unitario,
                        'ocs_origem': [{
                            'numero_oc': po.get('numero_oc'),
                            'po_id': po.get('id'),
                            'quantidade_comprada': quantidade_comprada,
                            'quantidade_necessaria': quantidade_necessaria,
                            'quantidade_usada_estoque': quantidade_usada_estoque,
                            'excedente': excedente,
                            'data_compra': item.get('data_compra')
                        }]
                    }
                else:
                    # Soma ao estoque existente
                    estoque_map[codigo_item]['quantidade_estoque'] += excedente
                    estoque_map[codigo_item]['ocs_origem'].append({
                        'numero_oc': po.get('numero_oc'),
                        'po_id': po.get('id'),
                        'quantidade_comprada': quantidade_comprada,
                        'quantidade_necessaria': quantidade_necessaria,
                        'quantidade_usada_estoque': quantidade_usada_estoque,
                        'excedente': excedente,
                        'data_compra': item.get('data_compra')
                    })
                    # Atualiza link/fornecedor se não tinha
                    if not estoque_map[codigo_item]['link_compra'] and link_compra:
                        estoque_map[codigo_item]['link_compra'] = link_compra
                        estoque_map[codigo_item]['fornecedor'] = fornecedor
    
    # Converter para lista
    estoque_list = list(estoque_map.values())
    
    # Ordenar por quantidade em estoque (maior primeiro)
    estoque_list.sort(key=lambda x: x['quantidade_estoque'], reverse=True)
    
    return {
        "total_itens_diferentes": len(estoque_list),
        "estoque": estoque_list
    }


@api_router.get("/estoque/mapa")
async def get_estoque_mapa(current_user: dict = Depends(get_current_user)):
    """
    Retorna um mapa simplificado de código do item -> quantidade em estoque.
    Usado pelo frontend para mostrar indicadores de estoque disponível em itens pendentes/cotados.
    """
    # Buscar todos os itens de todas as OCs
    pos = await db.purchase_orders.find(
        {},
        {"_id": 0, "items": 1}
    ).to_list(5000)
    
    # Mapa de estoque: codigo_item -> quantidade_estoque
    estoque_mapa = {}
    
    for po in pos:
        for item in po.get('items', []):
            quantidade_necessaria = item.get('quantidade', 0)
            status = item.get('status', 'pendente')
            
            # Só considerar itens já comprados (comprado ou posterior)
            if status not in ['comprado', 'em_separacao', 'em_transito', 'entregue']:
                continue
            
            # Calcular quantidade comprada
            quantidade_comprada = item.get('quantidade_comprada')
            
            if not quantidade_comprada:
                fontes = item.get('fontes_compra', [])
                if fontes:
                    quantidade_comprada = sum(f.get('quantidade', 0) for f in fontes)
                else:
                    quantidade_comprada = 0
            
            # Quantidade já usada do estoque
            quantidade_usada_estoque = item.get('quantidade_usada_estoque', 0)
            
            # Se a quantidade comprada é maior que a necessária + já usada, tem excedente
            if quantidade_comprada and quantidade_comprada > (quantidade_necessaria + quantidade_usada_estoque):
                excedente = quantidade_comprada - quantidade_necessaria - quantidade_usada_estoque
                codigo_item = item.get('codigo_item', '')
                
                if codigo_item:
                    if codigo_item not in estoque_mapa:
                        estoque_mapa[codigo_item] = 0
                    estoque_mapa[codigo_item] += excedente
    
    return estoque_mapa


@api_router.get("/estoque/verificar/{codigo_item}")
async def verificar_estoque_item(codigo_item: str, current_user: dict = Depends(get_current_user)):
    """
    Verifica se um item específico tem quantidade em estoque.
    Usado para mostrar no item pendente/cotado se há estoque disponível.
    """
    
    # Buscar todos os itens com esse código
    pos = await db.purchase_orders.find(
        {"items.codigo_item": codigo_item},
        {"_id": 0, "numero_oc": 1, "items": 1}
    ).to_list(5000)
    
    quantidade_total_estoque = 0
    detalhes = []
    
    for po in pos:
        for item in po.get('items', []):
            if item.get('codigo_item') == codigo_item:
                status = item.get('status', 'pendente')
                
                # Só considerar itens já comprados
                if status not in ['comprado', 'em_separacao', 'em_transito', 'entregue']:
                    continue
                
                quantidade_necessaria = item.get('quantidade', 0)
                
                # Calcular quantidade comprada
                quantidade_comprada = item.get('quantidade_comprada')
                if not quantidade_comprada:
                    fontes = item.get('fontes_compra', [])
                    if fontes:
                        quantidade_comprada = sum(f.get('quantidade', 0) for f in fontes)
                    else:
                        quantidade_comprada = 0
                
                # Quantidade já usada do estoque
                quantidade_usada_estoque = item.get('quantidade_usada_estoque', 0)
                
                if quantidade_comprada and quantidade_comprada > (quantidade_necessaria + quantidade_usada_estoque):
                    excedente = quantidade_comprada - quantidade_necessaria - quantidade_usada_estoque
                    quantidade_total_estoque += excedente
                    detalhes.append({
                        'numero_oc': po.get('numero_oc'),
                        'excedente': excedente
                    })
    
    return {
        "codigo_item": codigo_item,
        "em_estoque": quantidade_total_estoque > 0,
        "quantidade_disponivel": quantidade_total_estoque,
        "detalhes": detalhes
    }


# ============== PLANILHA DE ITENS CONSOLIDADA ==============
@api_router.get("/planilha-itens")
async def listar_planilha_itens(current_user: dict = Depends(get_current_user)):
    """
    Retorna uma visão consolidada de todos os itens por código.
    Agrupa por código_item e mostra:
    - Total necessário (soma de todas as OCs)
    - Total já comprado (itens com status comprado ou posterior)
    - Diferença (quanto ainda falta comprar)
    - Detalhes de cada ocorrência (lote, responsável, valor, OC)
    """
    
    # Buscar todos os itens de todas as OCs
    pos = await db.purchase_orders.find(
        {},
        {"_id": 0, "id": 1, "numero_oc": 1, "items": 1}
    ).to_list(5000)
    
    # Mapa: codigo_item -> {info consolidada}
    itens_map = {}
    status_comprado_ou_adiante = ['comprado', 'em_separacao', 'em_transito', 'entregue']
    
    for po in pos:
        for idx, item in enumerate(po.get('items', [])):
            codigo_item = item.get('codigo_item', '')
            if not codigo_item:
                continue
            
            quantidade = item.get('quantidade', 0)
            status = item.get('status', 'pendente')
            ja_comprado = status in status_comprado_ou_adiante
            
            # Pegar info das fontes de compra
            fontes = item.get('fontes_compra', [])
            preco_unitario = fontes[0].get('preco_unitario', 0) if fontes else item.get('preco_compra', 0)
            
            ocorrencia = {
                'numero_oc': po.get('numero_oc'),
                'po_id': po.get('id'),
                'lote': item.get('lote', ''),
                'responsavel': item.get('responsavel', ''),
                'marca_modelo': item.get('marca_modelo', ''),
                'preco_unitario': preco_unitario,
                'quantidade': quantidade,
                'status': status,
                'ja_comprado': ja_comprado,
                'quantidade_comprada': item.get('quantidade_comprada'),
                'data_compra': item.get('data_compra')
            }
            
            if codigo_item not in itens_map:
                itens_map[codigo_item] = {
                    'codigo_item': codigo_item,
                    'descricao': item.get('descricao', ''),
                    'unidade': item.get('unidade', 'UN'),
                    'quantidade_total_necessaria': quantidade,
                    'quantidade_total_comprada': quantidade if ja_comprado else 0,
                    'quantidade_faltante': 0 if ja_comprado else quantidade,
                    'ocorrencias': [ocorrencia],
                    'lotes_unicos': set([item.get('lote', '')]),
                    'responsaveis_unicos': set([item.get('responsavel', '')]),
                    'marcas_unicas': set([item.get('marca_modelo', '')])
                }
            else:
                itens_map[codigo_item]['quantidade_total_necessaria'] += quantidade
                if ja_comprado:
                    itens_map[codigo_item]['quantidade_total_comprada'] += quantidade
                else:
                    itens_map[codigo_item]['quantidade_faltante'] += quantidade
                itens_map[codigo_item]['ocorrencias'].append(ocorrencia)
                itens_map[codigo_item]['lotes_unicos'].add(item.get('lote', ''))
                itens_map[codigo_item]['responsaveis_unicos'].add(item.get('responsavel', ''))
                itens_map[codigo_item]['marcas_unicas'].add(item.get('marca_modelo', ''))
    
    # Converter sets para listas e calcular estatísticas
    resultado = []
    for codigo, dados in itens_map.items():
        dados['lotes'] = sorted([l for l in dados['lotes_unicos'] if l])
        dados['responsaveis'] = sorted([r for r in dados['responsaveis_unicos'] if r])
        dados['marcas'] = sorted([m for m in dados['marcas_unicas'] if m])
        del dados['lotes_unicos']
        del dados['responsaveis_unicos']
        del dados['marcas_unicas']
        
        # Ordenar ocorrências por lote
        dados['ocorrencias'].sort(key=lambda x: x.get('lote', ''))
        
        resultado.append(dados)
    
    # Ordenar por quantidade faltante (maior primeiro)
    resultado.sort(key=lambda x: x['quantidade_faltante'], reverse=True)
    
    # Estatísticas gerais
    total_itens_diferentes = len(resultado)
    total_quantidade_necessaria = sum(r['quantidade_total_necessaria'] for r in resultado)
    total_quantidade_comprada = sum(r['quantidade_total_comprada'] for r in resultado)
    total_quantidade_faltante = sum(r['quantidade_faltante'] for r in resultado)
    
    return {
        "estatisticas": {
            "total_itens_diferentes": total_itens_diferentes,
            "total_quantidade_necessaria": total_quantidade_necessaria,
            "total_quantidade_comprada": total_quantidade_comprada,
            "total_quantidade_faltante": total_quantidade_faltante,
            "percentual_comprado": round((total_quantidade_comprada / total_quantidade_necessaria * 100) if total_quantidade_necessaria > 0 else 0, 1)
        },
        "itens": resultado
    }


# ============== USAR ESTOQUE ==============
@api_router.post("/estoque/usar")
async def usar_estoque(
    data: dict,
    current_user: dict = Depends(get_current_user)
):
    """
    Usa itens do estoque para atender um item pendente/cotado.
    
    - Se a quantidade do estoque atende 100%: muda para "Comprado"
    - Se atende parcialmente: mantém status + marca como "parcialmente atendido"
    - Registra o preço original do estoque
    - Registra de qual OC veio o estoque
    
    Body:
    {
        "po_id": "...",
        "item_index": 0,
        "quantidade_usar": 10
    }
    """
    
    po_id = data.get('po_id')
    item_index = data.get('item_index')
    quantidade_usar = data.get('quantidade_usar', 0)
    
    if not po_id or item_index is None or quantidade_usar <= 0:
        raise HTTPException(status_code=400, detail="Dados inválidos")
    
    # Buscar OC destino
    po = await db.purchase_orders.find_one({"id": po_id}, {"_id": 0})
    if not po:
        raise HTTPException(status_code=404, detail="OC não encontrada")
    
    if item_index < 0 or item_index >= len(po.get('items', [])):
        raise HTTPException(status_code=400, detail="Índice de item inválido")
    
    item = po['items'][item_index]
    codigo_item = item.get('codigo_item')
    quantidade_necessaria = item.get('quantidade', 0)
    
    # Verificar estoque disponível e buscar detalhes
    estoque_response = await verificar_estoque_item(codigo_item, current_user)
    quantidade_disponivel = estoque_response.get('quantidade_disponivel', 0)
    
    if quantidade_disponivel <= 0:
        raise HTTPException(status_code=400, detail="Não há estoque disponível para este item")
    
    # Limitar a quantidade a usar ao necessário e ao disponível
    # Não pode usar mais do que o item precisa!
    quantidade_faltante = quantidade_necessaria - item.get('quantidade_do_estoque', 0)
    quantidade_efetiva = min(quantidade_usar, quantidade_disponivel, quantidade_faltante)
    
    if quantidade_efetiva <= 0:
        raise HTTPException(status_code=400, detail="Este item já foi totalmente atendido ou não há quantidade faltante")
    
    # Buscar informações do estoque (preço, OC de origem)
    pos_com_estoque = await db.purchase_orders.find(
        {"items.codigo_item": codigo_item},
        {"_id": 0, "id": 1, "numero_oc": 1, "items": 1}
    ).to_list(1000)
    
    # Encontrar as OCs que têm excedente deste item
    fontes_estoque = []
    for po_origem in pos_com_estoque:
        for idx, item_origem in enumerate(po_origem.get('items', [])):
            if item_origem.get('codigo_item') != codigo_item:
                continue
            
            status_origem = item_origem.get('status', 'pendente')
            if status_origem not in ['comprado', 'em_separacao', 'em_transito', 'entregue']:
                continue
            
            # Calcular quantidade comprada
            qtd_comprada = item_origem.get('quantidade_comprada')
            if not qtd_comprada:
                fontes = item_origem.get('fontes_compra', [])
                if fontes:
                    qtd_comprada = sum(f.get('quantidade', 0) for f in fontes)
                else:
                    qtd_comprada = 0
            
            qtd_necessaria_origem = item_origem.get('quantidade', 0)
            
            # Já usado anteriormente
            qtd_ja_usada = item_origem.get('quantidade_usada_estoque', 0)
            
            # Excedente disponível
            excedente = qtd_comprada - qtd_necessaria_origem - qtd_ja_usada
            
            if excedente > 0:
                # Pegar preço unitário
                fontes = item_origem.get('fontes_compra', [])
                if fontes:
                    preco_unitario = fontes[0].get('preco_unitario', 0)
                else:
                    preco_unitario = item_origem.get('preco_compra', 0)
                
                fontes_estoque.append({
                    'po_id': po_origem.get('id'),
                    'numero_oc': po_origem.get('numero_oc'),
                    'item_index': idx,
                    'excedente_disponivel': excedente,
                    'preco_unitario': preco_unitario
                })
    
    if not fontes_estoque:
        raise HTTPException(status_code=400, detail="Estoque não encontrado")
    
    # Usar o estoque das fontes disponíveis
    quantidade_restante = quantidade_efetiva
    ocs_utilizadas = []
    preco_medio_ponderado = 0
    total_usado = 0
    
    for fonte in fontes_estoque:
        if quantidade_restante <= 0:
            break
        
        qtd_usar_desta_fonte = min(quantidade_restante, fonte['excedente_disponivel'])
        
        # Registrar uso na OC de origem
        po_origem = await db.purchase_orders.find_one({"id": fonte['po_id']}, {"_id": 0})
        if po_origem:
            item_origem = po_origem['items'][fonte['item_index']]
            qtd_ja_usada = item_origem.get('quantidade_usada_estoque', 0)
            item_origem['quantidade_usada_estoque'] = qtd_ja_usada + qtd_usar_desta_fonte
            
            # Registrar para quais OCs foi usado
            if 'estoque_usado_em' not in item_origem:
                item_origem['estoque_usado_em'] = []
            item_origem['estoque_usado_em'].append({
                'po_id': po_id,
                'numero_oc': po.get('numero_oc'),
                'quantidade': qtd_usar_desta_fonte,
                'data': datetime.now(timezone.utc).strftime('%Y-%m-%d')
            })
            
            await db.purchase_orders.update_one(
                {"id": fonte['po_id']},
                {"$set": {"items": po_origem['items']}}
            )
        
        ocs_utilizadas.append({
            'numero_oc': fonte['numero_oc'],
            'quantidade': qtd_usar_desta_fonte,
            'preco_unitario': fonte['preco_unitario']
        })
        
        preco_medio_ponderado += fonte['preco_unitario'] * qtd_usar_desta_fonte
        total_usado += qtd_usar_desta_fonte
        quantidade_restante -= qtd_usar_desta_fonte
    
    # Calcular preço médio
    preco_medio = preco_medio_ponderado / total_usado if total_usado > 0 else 0
    
    # Atualizar item destino
    quantidade_anterior_estoque = item.get('quantidade_do_estoque', 0)
    item['quantidade_do_estoque'] = quantidade_anterior_estoque + total_usado
    item['preco_estoque_unitario'] = preco_medio
    
    # Registrar origem do estoque
    if 'estoque_origem' not in item:
        item['estoque_origem'] = []
    item['estoque_origem'].extend(ocs_utilizadas)
    
    # Verificar se atende toda a necessidade
    quantidade_total_atendida = item.get('quantidade_do_estoque', 0)
    
    if quantidade_total_atendida >= quantidade_necessaria:
        # Atende 100% - mudar para Comprado
        item['status'] = 'comprado'
        item['atendido_por_estoque'] = True
        atualizar_data_compra(item, 'comprado')
        
        # Adicionar fonte de compra com preço do estoque
        if 'fontes_compra' not in item or not item['fontes_compra']:
            item['fontes_compra'] = []
        
        item['fontes_compra'].append({
            'id': str(uuid.uuid4()),
            'quantidade': quantidade_necessaria,
            'preco_unitario': preco_medio,
            'frete': 0,
            'link': '',
            'fornecedor': 'ESTOQUE INTERNO'
        })
        
        # Recalcular lucro
        calcular_lucro_item(item)
        mensagem = f"Item totalmente atendido pelo estoque ({total_usado} UN)"
    else:
        # Atende parcialmente
        item['parcialmente_atendido_estoque'] = True
        item['quantidade_faltante'] = quantidade_necessaria - quantidade_total_atendida
        mensagem = f"Item parcialmente atendido pelo estoque ({total_usado} UN). Faltam {item['quantidade_faltante']} UN"
    
    # Salvar item destino
    await db.purchase_orders.update_one(
        {"id": po_id},
        {"$set": {"items": po['items']}}
    )
    
    return {
        "success": True,
        "codigo_item": codigo_item,
        "quantidade_usada": total_usado,
        "quantidade_total_atendida": quantidade_total_atendida,
        "quantidade_necessaria": quantidade_necessaria,
        "atendido_totalmente": quantidade_total_atendida >= quantidade_necessaria,
        "preco_unitario_estoque": round(preco_medio, 2),
        "ocs_origem": ocs_utilizadas,
        "mensagem": mensagem
    }


@api_router.get("/estoque/detalhes/{codigo_item}")
async def get_estoque_detalhes(codigo_item: str, current_user: dict = Depends(get_current_user)):
    """
    Retorna detalhes do estoque disponível para um item específico.
    Usado no modal de "Usar do Estoque" para mostrar de onde vem e o preço.
    """
    # Buscar todas as OCs com este item
    pos = await db.purchase_orders.find(
        {"items.codigo_item": codigo_item},
        {"_id": 0, "id": 1, "numero_oc": 1, "items": 1}
    ).to_list(1000)
    
    fontes = []
    total_disponivel = 0
    
    for po in pos:
        for idx, item in enumerate(po.get('items', [])):
            if item.get('codigo_item') != codigo_item:
                continue
            
            status = item.get('status', 'pendente')
            if status not in ['comprado', 'em_separacao', 'em_transito', 'entregue']:
                continue
            
            # Calcular quantidade comprada
            qtd_comprada = item.get('quantidade_comprada')
            if not qtd_comprada:
                fontes_compra = item.get('fontes_compra', [])
                if fontes_compra:
                    qtd_comprada = sum(f.get('quantidade', 0) for f in fontes_compra)
                else:
                    qtd_comprada = 0
            
            qtd_necessaria = item.get('quantidade', 0)
            qtd_ja_usada = item.get('quantidade_usada_estoque', 0)
            
            excedente = qtd_comprada - qtd_necessaria - qtd_ja_usada
            
            if excedente > 0:
                # Pegar preço unitário
                fontes_compra = item.get('fontes_compra', [])
                if fontes_compra:
                    preco = fontes_compra[0].get('preco_unitario', 0)
                    fornecedor = fontes_compra[0].get('fornecedor', '')
                else:
                    preco = item.get('preco_compra', 0)
                    fornecedor = ''
                
                fontes.append({
                    'numero_oc': po.get('numero_oc'),
                    'quantidade_disponivel': excedente,
                    'preco_unitario': preco,
                    'fornecedor': fornecedor,
                    'data_compra': item.get('data_compra')
                })
                total_disponivel += excedente
    
    return {
        "codigo_item": codigo_item,
        "total_disponivel": total_disponivel,
        "fontes": fontes
    }


@app.on_event("startup")
async def startup_event():
    """Iniciar job de verificação de rastreios e criar índices no MongoDB"""
    global rastreio_task
    
    # Criar índices para otimizar queries
    try:
        # Índices para purchase_orders
        await db.purchase_orders.create_index("id", unique=True)
        await db.purchase_orders.create_index("numero_oc")
        await db.purchase_orders.create_index("items.status")
        await db.purchase_orders.create_index("items.responsavel")
        await db.purchase_orders.create_index("created_at")
        
        # Índices para users
        await db.users.create_index("email", unique=True)
        await db.users.create_index("owner_name")
        
        # Índices para reference_items
        await db.reference_items.create_index("codigo_item")
        await db.reference_items.create_index("descricao")
        
        # Índices para notifications
        await db.notifications.create_index("user_email")
        await db.notifications.create_index("created_at")
        
        logging.getLogger(__name__).info("Índices do MongoDB criados/verificados com sucesso")
    except Exception as e:
        logging.getLogger(__name__).warning(f"Erro ao criar índices: {e}")
    
    # Iniciar job de verificação de rastreios
    rastreio_task = asyncio.create_task(verificar_rastreios_em_transito())
    logging.getLogger(__name__).info("Job de verificação de rastreios iniciado")

# Include the router in the main app
app.include_router(api_router)

# CORS Configuration - usando variável de ambiente
cors_origins_env = os.environ.get('CORS_ORIGINS', '*')
if cors_origins_env == '*':
    # Wildcard não pode ser usado com credentials
    app.add_middleware(
        CORSMiddleware,
        allow_credentials=False,
        allow_origins=["*"],
        allow_methods=["*"],
        allow_headers=["*"],
    )
else:
    # Lista específica de origens permite credentials
    cors_origins_list = [origin.strip() for origin in cors_origins_env.split(',')]
    app.add_middleware(
        CORSMiddleware,
        allow_credentials=True,
        allow_origins=cors_origins_list,
        allow_methods=["*"],
        allow_headers=["*"],
    )

# Middleware para headers anti-cache (forçar atualização)
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request

class NoCacheMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        response = await call_next(request)
        response.headers["Cache-Control"] = "no-cache, no-store, must-revalidate"
        response.headers["Pragma"] = "no-cache"
        response.headers["Expires"] = "0"
        return response

app.add_middleware(NoCacheMiddleware)

# Logger já configurado no início do arquivo

@app.on_event("shutdown")
async def shutdown_db_client():
    global rastreio_task
    if rastreio_task:
        rastreio_task.cancel()
    client.close()
