"""
Rotas de Notificações
"""
from fastapi import APIRouter, HTTPException, Depends
from auth import get_current_user
from utils.database import db

router = APIRouter(prefix="/notificacoes", tags=["Notificações"])


@router.get("")
async def get_notificacoes(current_user: dict = Depends(get_current_user)):
    """Obter notificações do usuário"""
    # Buscar últimas 20 notificações
    cursor = db.notificacoes.find({}, {"_id": 0}).sort("created_at", -1).limit(20)
    notificacoes = []
    async for doc in cursor:
        notificacoes.append(doc)
    
    return notificacoes


@router.get("/nao-lidas/count")
async def get_notificacoes_count(current_user: dict = Depends(get_current_user)):
    """Contar notificações não lidas"""
    count = await db.notificacoes.count_documents({"lida": False})
    return {"count": count}


@router.post("/{notificacao_id}/marcar-lida")
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


@router.post("/marcar-todas-lidas")
async def marcar_todas_lidas(current_user: dict = Depends(get_current_user)):
    """Marcar todas as notificações como lidas"""
    await db.notificacoes.update_many(
        {"lida": False},
        {"$set": {"lida": True}}
    )
    return {"message": "Todas as notificações marcadas como lidas"}
