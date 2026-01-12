"""
Purchase Order routes - Item Updates
Módulo separado para rotas de atualização de itens
"""
import random
from datetime import datetime, timezone
from fastapi import APIRouter, HTTPException, Depends

from auth import get_current_user, require_admin
from models.schemas import (
    ItemStatusUpdate, ItemFullUpdate, ItemStatus
)
from utils.database import db, get_logger
from utils.config import TAX_PERCENTAGE

router = APIRouter(prefix="/purchase-orders", tags=["Items"])
logger = get_logger(__name__)


def calculate_profit(item: dict) -> dict:
    """Calcula o lucro líquido de um item"""
    preco_venda = item.get('preco_venda')
    quantidade = item.get('quantidade', 0)
    
    fontes = item.get('fontes_compra', [])
    if fontes and len(fontes) > 0:
        total_custo_compra = sum(fc['quantidade'] * fc['preco_unitario'] for fc in fontes)
        total_frete_compra = sum(fc.get('frete', 0) for fc in fontes)
        
        if preco_venda is not None:
            receita_total = preco_venda * quantidade
            impostos = receita_total * (TAX_PERCENTAGE / 100)
            frete_envio = item.get('frete_envio', 0) or 0
            item['lucro_liquido'] = round(receita_total - total_custo_compra - total_frete_compra - impostos - frete_envio, 2)
            item['imposto'] = round(impostos, 2)
    elif item.get('preco_compra') is not None and preco_venda is not None:
        receita_total = preco_venda * quantidade
        custo_total = item['preco_compra'] * quantidade
        impostos = receita_total * (TAX_PERCENTAGE / 100)
        frete_compra = item.get('frete_compra', 0) or 0
        frete_envio = item.get('frete_envio', 0) or 0
        item['lucro_liquido'] = round(receita_total - custo_total - impostos - frete_compra - frete_envio, 2)
        item['imposto'] = round(impostos, 2)
    
    return item


def check_item_permission(item: dict, current_user: dict) -> bool:
    """
    Verifica se o usuário tem permissão para editar o item.
    Admins podem editar qualquer item.
    Usuários só podem editar seus próprios itens.
    
    IMPORTANTE: Comparação é case-insensitive e ignora espaços extras.
    """
    if current_user.get('role') == 'admin':
        return True
    
    item_responsavel = (item.get('responsavel') or '').strip().upper()
    user_owner_name = (current_user.get('owner_name') or '').strip().upper()
    
    logger.info(f"Verificando permissão: item_responsavel='{item_responsavel}' vs user_owner_name='{user_owner_name}'")
    
    return item_responsavel == user_owner_name


@router.patch("/{po_id}/items/{codigo_item}")
async def update_item_status(
    po_id: str, 
    codigo_item: str, 
    update: ItemStatusUpdate, 
    current_user: dict = Depends(get_current_user)
):
    """Atualizar status de um item pelo código"""
    po = await db.purchase_orders.find_one({"id": po_id}, {"_id": 0})
    
    if not po:
        raise HTTPException(status_code=404, detail="Ordem de Compra não encontrada")
    
    item_updated = False
    
    for item in po['items']:
        if item['codigo_item'] == codigo_item:
            # Verificar permissão
            if not check_item_permission(item, current_user):
                logger.warning(f"Permissão negada para usuário '{current_user.get('owner_name')}' editar item de '{item.get('responsavel')}'")
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
            
            # Campos simples - todos podem atualizar
            if update.link_compra is not None:
                item['link_compra'] = update.link_compra
            
            if update.preco_compra is not None and not update.fontes_compra:
                item['preco_compra'] = update.preco_compra
            
            if update.frete_compra is not None and not update.fontes_compra:
                item['frete_compra'] = update.frete_compra
            
            # Apenas admins podem editar preço de venda, impostos e frete de envio
            if current_user.get('role') == 'admin':
                if update.preco_venda is not None:
                    item['preco_venda'] = update.preco_venda
                if update.imposto is not None:
                    item['imposto'] = update.imposto
                if update.frete_envio is not None:
                    item['frete_envio'] = update.frete_envio
            
            # Calcular lucro líquido
            item = calculate_profit(item)
            
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
            
            # Atualizar código de rastreio
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


@router.patch("/{po_id}/items/by-index/{item_index}")
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
    
    # Verificar permissão usando função centralizada
    if not check_item_permission(item, current_user):
        item_responsavel = (item.get('responsavel') or '').strip()
        user_owner_name = (current_user.get('owner_name') or '').strip()
        logger.warning(f"Permissão negada: item_responsavel='{item_responsavel}' vs user_owner_name='{user_owner_name}'")
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
    if current_user.get('role') == 'admin':
        if update.preco_venda is not None:
            item['preco_venda'] = update.preco_venda
        if update.imposto is not None:
            item['imposto'] = update.imposto
        if update.frete_envio is not None:
            item['frete_envio'] = update.frete_envio
    
    # Calcular lucro líquido
    item = calculate_profit(item)
    
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


@router.patch("/{po_id}/items/{codigo_item}/full")
async def update_item_full(
    po_id: str, 
    codigo_item: str, 
    update: ItemFullUpdate,
    current_user: dict = Depends(get_current_user)
):
    """Atualização completa do item - apenas admin"""
    if current_user.get('role') != 'admin':
        raise HTTPException(status_code=403, detail="Apenas administradores podem fazer edição completa")
    
    po = await db.purchase_orders.find_one({"id": po_id}, {"_id": 0})
    
    if not po:
        raise HTTPException(status_code=404, detail="Ordem de Compra não encontrada")
    
    item_updated = False
    
    for item in po['items']:
        if item['codigo_item'] == codigo_item:
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
                item['imposto'] = round(update.preco_venda * item.get('quantidade', 0) * (TAX_PERCENTAGE / 100), 2)
            
            item_updated = True
            break
    
    if not item_updated:
        raise HTTPException(status_code=404, detail="Item não encontrado")
    
    await db.purchase_orders.update_one(
        {"id": po_id},
        {"$set": {"items": po['items']}}
    )
    
    return {"message": "Item atualizado com sucesso"}


@router.patch("/{po_id}/items/by-index/{item_index}/full")
async def update_item_by_index(
    po_id: str, 
    item_index: int, 
    update: ItemFullUpdate,
    current_user: dict = Depends(get_current_user)
):
    """Atualização completa do item por índice - apenas admin"""
    if current_user.get('role') != 'admin':
        raise HTTPException(status_code=403, detail="Apenas administradores podem fazer edição completa")
    
    po = await db.purchase_orders.find_one({"id": po_id}, {"_id": 0})
    
    if not po:
        raise HTTPException(status_code=404, detail="Ordem de Compra não encontrada")
    
    if item_index < 0 or item_index >= len(po['items']):
        raise HTTPException(status_code=404, detail="Índice de item inválido")
    
    item = po['items'][item_index]
    
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
        item['imposto'] = round(update.preco_venda * item.get('quantidade', 0) * (TAX_PERCENTAGE / 100), 2)
    
    await db.purchase_orders.update_one(
        {"id": po_id},
        {"$set": {"items": po['items']}}
    )
    
    return {"message": "Item atualizado com sucesso"}
