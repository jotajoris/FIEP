"""
Backup Routes - Rotas de backup e restauração
"""
from fastapi import APIRouter, HTTPException, Depends
from typing import Dict
from datetime import datetime, timezone
import json

from auth import require_admin

router = APIRouter(prefix="/backup", tags=["Backup"])

# Database reference
db = None

def init_backup_routes(database):
    """Initialize backup routes with database"""
    global db
    db = database


@router.get("/export")
async def export_backup(current_user: dict = Depends(require_admin)):
    """Exportar todos os dados do sistema"""
    # Coletar todos os dados
    purchase_orders = await db.purchase_orders.find({}, {"_id": 0}).to_list(length=10000)
    users = await db.users.find({}, {"_id": 0}).to_list(length=1000)
    reference_items = await db.reference_items.find({}, {"_id": 0}).to_list(length=10000)
    estoque = await db.estoque.find({}, {"_id": 0}).to_list(length=10000)
    notificacoes = await db.notificacoes.find({}, {"_id": 0}).to_list(length=10000)
    limites_contrato = await db.limites_contrato.find({}, {"_id": 0}).to_list(length=10000)
    commission_payments = await db.commission_payments.find({}, {"_id": 0}).to_list(length=10000)
    config = await db.config.find({}, {"_id": 0}).to_list(length=100)
    item_images = await db.item_images.find({}, {"_id": 0}).to_list(length=10000)
    
    backup = {
        "version": "3.3",
        "created_at": datetime.now(timezone.utc).isoformat(),
        "created_by": current_user.get('sub'),
        "data": {
            "purchase_orders": purchase_orders,
            "users": users,
            "reference_items": reference_items,
            "estoque": estoque,
            "notificacoes": notificacoes,
            "limites_contrato": limites_contrato,
            "commission_payments": commission_payments,
            "config": config,
            "item_images": item_images
        },
        "counts": {
            "purchase_orders": len(purchase_orders),
            "users": len(users),
            "reference_items": len(reference_items),
            "estoque": len(estoque),
            "notificacoes": len(notificacoes),
            "limites_contrato": len(limites_contrato),
            "commission_payments": len(commission_payments),
            "item_images": len(item_images)
        }
    }
    
    return backup


@router.post("/restore")
async def restore_backup_preview(current_user: dict = Depends(require_admin)):
    """Preview do restore - retorna contagens sem executar"""
    return {
        "message": "Use /backup/restore-data para restaurar o backup",
        "warning": "Esta operação irá SUBSTITUIR todos os dados existentes!"
    }


@router.post("/restore-data")
async def restore_backup(
    backup: Dict,
    current_user: dict = Depends(require_admin)
):
    """Restaurar backup completo"""
    try:
        data = backup.get('data', {})
        
        # Limpar coleções existentes
        collections_to_clear = [
            'purchase_orders', 'reference_items', 'estoque',
            'notificacoes', 'limites_contrato', 'commission_payments',
            'config', 'item_images'
        ]
        
        results = {}
        
        for collection in collections_to_clear:
            if collection in data and data[collection]:
                # Deletar existentes
                await db[collection].delete_many({})
                
                # Inserir novos
                await db[collection].insert_many(data[collection])
                results[collection] = len(data[collection])
        
        # Usuários são tratados separadamente (não deletamos todos)
        if 'users' in data and data['users']:
            # Atualizar ou inserir usuários
            for user in data['users']:
                await db.users.update_one(
                    {"email": user['email']},
                    {"$set": user},
                    upsert=True
                )
            results['users'] = len(data['users'])
        
        return {
            "success": True,
            "message": "Backup restaurado com sucesso!",
            "restored": results
        }
        
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Erro ao restaurar backup: {str(e)}"
        )
