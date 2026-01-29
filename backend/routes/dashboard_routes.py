"""
Dashboard Routes - Rotas do dashboard e estatísticas
"""
from fastapi import APIRouter, Depends
from typing import List

from auth import get_current_user, require_admin
from models import DashboardStats, AdminSummary, ItemStatus

router = APIRouter(tags=["Dashboard"])

# Database reference
db = None

def init_dashboard_routes(database):
    """Initialize dashboard routes with database"""
    global db
    db = database


@router.get("/dashboard", response_model=DashboardStats)
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
            if filtered_items:
                ocs_with_user_items += 1
            all_items.extend(filtered_items)
        else:
            all_items.extend(po['items'])
    
    total_ocs = len(pos) if current_user['role'] == 'admin' else ocs_with_user_items
    
    total_items = len(all_items)
    items_pendentes = sum(1 for item in all_items if item['status'] == ItemStatus.PENDENTE)
    items_cotados = sum(1 for item in all_items if item['status'] == ItemStatus.COTADO)
    items_comprados = sum(1 for item in all_items if item['status'] == ItemStatus.COMPRADO)
    items_em_separacao = sum(1 for item in all_items if item['status'] == ItemStatus.EM_SEPARACAO)
    items_em_transito = sum(1 for item in all_items if item['status'] == ItemStatus.EM_TRANSITO)
    items_entregues = sum(1 for item in all_items if item['status'] == ItemStatus.ENTREGUE)
    
    items_por_responsavel = {}
    if current_user['role'] == 'admin':
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


@router.get("/items/duplicates")
async def get_duplicate_items(current_user: dict = Depends(get_current_user)):
    """Retorna itens com códigos duplicados (mesmo código em múltiplas OCs)"""
    pos = await db.purchase_orders.find({}, {"_id": 0}).to_list(1000)
    
    # Agrupar itens por código
    items_by_code = {}
    for po in pos:
        for idx, item in enumerate(po['items']):
            codigo = item.get('codigo_item', '')
            if codigo:
                if codigo not in items_by_code:
                    items_by_code[codigo] = []
                items_by_code[codigo].append({
                    'po_id': po['id'],
                    'numero_oc': po['numero_oc'],
                    'item_index': idx,
                    'descricao': item.get('descricao', ''),
                    'status': item.get('status', ''),
                    'quantidade': item.get('quantidade', 1),
                    'responsavel': item.get('responsavel', '')
                })
    
    # Filtrar apenas códigos que aparecem em múltiplas OCs
    duplicates = {
        codigo: items 
        for codigo, items in items_by_code.items() 
        if len(items) > 1
    }
    
    return duplicates


@router.get("/reference-items")
async def get_reference_items(current_user: dict = Depends(get_current_user)):
    """Listar itens de referência do sistema"""
    items = await db.reference_items.find({}, {"_id": 0}).to_list(10000)
    return items


@router.get("/items/historico-cotacoes")
async def get_historico_cotacoes(
    codigo_item: str,
    current_user: dict = Depends(get_current_user)
):
    """Buscar histórico de cotações de um item em todas as OCs"""
    pos = await db.purchase_orders.find({}, {"_id": 0}).to_list(1000)
    
    historico = []
    for po in pos:
        for item in po['items']:
            if item.get('codigo_item') == codigo_item:
                # Só incluir se tiver cotações
                fontes = item.get('fontes_compra', [])
                if fontes:
                    historico.append({
                        'numero_oc': po['numero_oc'],
                        'po_id': po['id'],
                        'status': item.get('status'),
                        'data_cotacao': item.get('data_cotacao'),
                        'fontes_compra': fontes,
                        'preco_final': item.get('preco'),
                        'fornecedor_final': item.get('fornecedor')
                    })
    
    # Ordenar por data de cotação (mais recentes primeiro)
    historico.sort(key=lambda x: x.get('data_cotacao') or '', reverse=True)
    
    return historico
