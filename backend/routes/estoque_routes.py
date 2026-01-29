"""
Estoque Routes - Rotas de gestão de estoque
"""
from fastapi import APIRouter, HTTPException, Depends
from typing import Dict, List, Optional
from datetime import datetime, timezone
import logging

from auth import get_current_user, require_admin

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/estoque", tags=["Estoque"])

# Database reference
db = None

def init_estoque_routes(database):
    """Initialize estoque routes with database"""
    global db
    db = database


@router.get("")
async def listar_estoque(current_user: dict = Depends(get_current_user)):
    """
    Lista todos os itens em estoque (quantidade comprada > quantidade necessária).
    Agrupa por código do item e mostra o total disponível em estoque.
    """
    pos = await db.purchase_orders.find(
        {},
        {"_id": 0, "id": 1, "numero_oc": 1, "items": 1}
    ).to_list(5000)
    
    estoque_map = {}
    
    for po in pos:
        for idx, item in enumerate(po.get('items', [])):
            quantidade_necessaria = item.get('quantidade', 0)
            status = item.get('status', 'pendente')
            
            if status not in ['comprado', 'em_separacao', 'em_transito', 'entregue']:
                continue
            
            if item.get('atendido_por_estoque'):
                continue
            
            fontes = item.get('fontes_compra', [])
            if fontes:
                quantidade_comprada = sum(f.get('quantidade', 0) for f in fontes)
            else:
                quantidade_comprada = item.get('quantidade_comprada', 0)
            
            quantidade_usada_estoque = item.get('quantidade_usada_estoque', 0)
            
            if quantidade_comprada and quantidade_comprada > (quantidade_necessaria + quantidade_usada_estoque):
                excedente = quantidade_comprada - quantidade_necessaria - quantidade_usada_estoque
                codigo_item = item.get('codigo_item', '')
                
                link_compra = fontes[0].get('link', '') if fontes else ''
                fornecedor = fontes[0].get('fornecedor', '') if fontes else ''
                preco_unitario = fontes[0].get('preco_unitario', 0) if fontes else item.get('preco_compra', 0)
                estoque_usado_em = item.get('estoque_usado_em', [])
                
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
                        'imagem_url': item.get('imagem_url'),
                        'ocs_origem': [{
                            'numero_oc': po.get('numero_oc'),
                            'po_id': po.get('id'),
                            'item_index': idx,
                            'quantidade_comprada': quantidade_comprada,
                            'quantidade_necessaria': quantidade_necessaria,
                            'quantidade_usada_estoque': quantidade_usada_estoque,
                            'excedente': excedente,
                            'data_compra': item.get('data_compra'),
                            'usado_em': estoque_usado_em
                        }]
                    }
                else:
                    estoque_map[codigo_item]['quantidade_estoque'] += excedente
                    estoque_map[codigo_item]['ocs_origem'].append({
                        'numero_oc': po.get('numero_oc'),
                        'po_id': po.get('id'),
                        'item_index': idx,
                        'quantidade_comprada': quantidade_comprada,
                        'quantidade_necessaria': quantidade_necessaria,
                        'quantidade_usada_estoque': quantidade_usada_estoque,
                        'excedente': excedente,
                        'data_compra': item.get('data_compra'),
                        'usado_em': estoque_usado_em
                    })
    
    result = sorted(estoque_map.values(), key=lambda x: x['codigo_item'])
    return result


@router.get("/mapa")
async def get_estoque_mapa(current_user: dict = Depends(get_current_user)):
    """
    Retorna um mapa de códigos de item para quantidade disponível em estoque.
    Otimizado para verificação rápida no frontend.
    """
    estoque_lista = await listar_estoque(current_user)
    return {item['codigo_item']: item['quantidade_estoque'] for item in estoque_lista}


@router.get("/verificar/{codigo_item}")
async def verificar_estoque(
    codigo_item: str,
    current_user: dict = Depends(get_current_user)
):
    """Verifica se há estoque disponível para um código de item específico"""
    estoque_lista = await listar_estoque(current_user)
    
    for item in estoque_lista:
        if item['codigo_item'] == codigo_item:
            return {
                'disponivel': True,
                'quantidade': item['quantidade_estoque'],
                'detalhes': item
            }
    
    return {
        'disponivel': False,
        'quantidade': 0,
        'detalhes': None
    }


@router.get("/detalhes/{codigo_item}")
async def get_estoque_detalhes(
    codigo_item: str,
    current_user: dict = Depends(get_current_user)
):
    """Retorna detalhes completos do estoque de um item específico"""
    estoque_lista = await listar_estoque(current_user)
    
    for item in estoque_lista:
        if item['codigo_item'] == codigo_item:
            return item
    
    raise HTTPException(status_code=404, detail="Item não encontrado no estoque")


@router.patch("/ajustar")
async def ajustar_estoque(
    data: dict,
    current_user: dict = Depends(require_admin)
):
    """
    Ajusta manualmente a quantidade em estoque de um item.
    Usado para correções administrativas.
    """
    po_id = data.get('po_id')
    item_index = data.get('item_index')
    nova_quantidade_comprada = data.get('quantidade_comprada')
    
    if not po_id or item_index is None or nova_quantidade_comprada is None:
        raise HTTPException(status_code=400, detail="po_id, item_index e quantidade_comprada são obrigatórios")
    
    result = await db.purchase_orders.update_one(
        {"id": po_id},
        {"$set": {f"items.{item_index}.quantidade_comprada": nova_quantidade_comprada}}
    )
    
    if result.modified_count == 0:
        raise HTTPException(status_code=404, detail="Item não encontrado")
    
    return {"success": True, "message": "Estoque ajustado com sucesso"}


@router.delete("/limpar/{po_id}/{item_index}")
async def limpar_estoque_item(
    po_id: str,
    item_index: int,
    current_user: dict = Depends(require_admin)
):
    """Remove o excedente de estoque de um item específico"""
    po = await db.purchase_orders.find_one({"id": po_id}, {"_id": 0})
    if not po:
        raise HTTPException(status_code=404, detail="OC não encontrada")
    
    items = po.get('items', [])
    if item_index >= len(items):
        raise HTTPException(status_code=404, detail="Item não encontrado")
    
    item = items[item_index]
    quantidade_necessaria = item.get('quantidade', 0)
    
    # Definir quantidade_comprada igual à quantidade necessária para zerar o excedente
    result = await db.purchase_orders.update_one(
        {"id": po_id},
        {"$set": {f"items.{item_index}.quantidade_comprada": quantidade_necessaria}}
    )
    
    return {"success": True, "message": "Excedente de estoque removido"}


@router.post("/resetar-uso/{po_id}/{item_index}")
async def resetar_uso_estoque(
    po_id: str,
    item_index: int,
    current_user: dict = Depends(require_admin)
):
    """Reseta os campos de uso de estoque de um item"""
    result = await db.purchase_orders.update_one(
        {"id": po_id},
        {"$set": {
            f"items.{item_index}.quantidade_usada_estoque": 0,
            f"items.{item_index}.estoque_usado_em": []
        }}
    )
    
    if result.modified_count == 0:
        raise HTTPException(status_code=404, detail="Item não encontrado")
    
    return {"success": True, "message": "Uso de estoque resetado"}
