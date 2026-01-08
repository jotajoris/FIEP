from fastapi import FastAPI, APIRouter, HTTPException, UploadFile, File
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import logging
from pathlib import Path
from pydantic import BaseModel, Field, ConfigDict
from typing import List, Optional, Dict
import uuid
from datetime import datetime, timezone
from enum import Enum
import openpyxl
from io import BytesIO

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

# MongoDB connection
mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

# Create the main app without a prefix
app = FastAPI()

# Create a router with the /api prefix
api_router = APIRouter(prefix="/api")

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

class ItemStatus(str, Enum):
    PENDENTE = "pendente"
    COTADO = "cotado"
    COMPRADO = "comprado"
    ENTREGUE = "entregue"

# Models
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

# Routes
@api_router.get("/")
async def root():
    return {"message": "Sistema de Gestão de Ordens de Compra FIEP"}

@api_router.post("/reference-items/seed")
async def seed_reference_items():
    """Popula banco com itens de referência do Excel"""
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
            
            # Extrair número do lote
            try:
                lot_number = int(lote_str.replace("Lote", "").replace("lote", "").strip())
            except:
                continue
            
            responsavel = get_responsible_by_lot(lot_number)
            
            item = ReferenceItem(
                lote=lote_str,
                lot_number=lot_number,
                regiao=str(row[1]) if row[1] else "",
                descricao=str(row[2]) if row[2] else "",
                unidade=str(row[3]) if row[3] else "",
                marca_modelo=str(row[11]) if row[11] else "",
                codigo_item=codigo_item,
                responsavel=responsavel
            )
            items.append(item.model_dump())
        
        # Limpar coleção existente
        await db.reference_items.delete_many({})
        
        # Inserir novos itens
        if items:
            for item in items:
                item['created_at'] = item['created_at'].isoformat()
            await db.reference_items.insert_many(items)
        
        return {"message": f"{len(items)} itens de referência carregados com sucesso"}
    
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Erro ao carregar itens: {str(e)}")

@api_router.get("/reference-items", response_model=List[ReferenceItem])
async def get_reference_items(codigo: Optional[str] = None):
    query = {}
    if codigo:
        query["codigo_item"] = codigo
    
    items = await db.reference_items.find(query, {"_id": 0}).to_list(5000)
    for item in items:
        if isinstance(item['created_at'], str):
            item['created_at'] = datetime.fromisoformat(item['created_at'])
    return items

@api_router.post("/purchase-orders", response_model=PurchaseOrder)
async def create_purchase_order(po_create: PurchaseOrderCreate):
    """Criar nova Ordem de Compra"""
    
    # Processar cada item e atribuir responsável
    processed_items = []
    for item in po_create.items:
        # Buscar item de referência
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
    
    po = PurchaseOrder(
        numero_oc=po_create.numero_oc,
        items=processed_items,
        created_by=po_create.created_by
    )
    
    doc = po.model_dump()
    doc['created_at'] = doc['created_at'].isoformat()
    
    await db.purchase_orders.insert_one(doc)
    return po

@api_router.get("/purchase-orders", response_model=List[PurchaseOrder])
async def get_purchase_orders(responsavel: Optional[str] = None):
    """Listar Ordens de Compra"""
    query = {}
    
    pos = await db.purchase_orders.find(query, {"_id": 0}).to_list(1000)
    
    for po in pos:
        if isinstance(po['created_at'], str):
            po['created_at'] = datetime.fromisoformat(po['created_at'])
        
        # Filtrar items se responsável especificado
        if responsavel:
            po['items'] = [item for item in po['items'] if item.get('responsavel') == responsavel]
    
    return pos

@api_router.get("/purchase-orders/{po_id}", response_model=PurchaseOrder)
async def get_purchase_order(po_id: str):
    """Obter detalhes de uma OC"""
    po = await db.purchase_orders.find_one({"id": po_id}, {"_id": 0})
    
    if not po:
        raise HTTPException(status_code=404, detail="Ordem de Compra não encontrada")
    
    if isinstance(po['created_at'], str):
        po['created_at'] = datetime.fromisoformat(po['created_at'])
    
    return po

@api_router.patch("/purchase-orders/{po_id}/items/{codigo_item}")
async def update_item_status(po_id: str, codigo_item: str, update: ItemStatusUpdate):
    """Atualizar status de um item"""
    po = await db.purchase_orders.find_one({"id": po_id}, {"_id": 0})
    
    if not po:
        raise HTTPException(status_code=404, detail="Ordem de Compra não encontrada")
    
    # Atualizar item
    item_updated = False
    for item in po['items']:
        if item['codigo_item'] == codigo_item:
            item['status'] = update.status
            
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
    
    # Salvar atualização
    await db.purchase_orders.update_one(
        {"id": po_id},
        {"$set": {"items": po['items']}}
    )
    
    return {"message": "Item atualizado com sucesso"}

@api_router.get("/dashboard", response_model=DashboardStats)
async def get_dashboard_stats():
    """Estatísticas do dashboard"""
    pos = await db.purchase_orders.find({}, {"_id": 0}).to_list(1000)
    
    total_ocs = len(pos)
    all_items = []
    for po in pos:
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
async def get_admin_summary():
    """Resumo financeiro para admins"""
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
async def get_duplicate_items():
    """Encontrar itens duplicados por código"""
    pos = await db.purchase_orders.find({}, {"_id": 0}).to_list(1000)
    
    codigo_count = {}
    for po in pos:
        for item in po['items']:
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
