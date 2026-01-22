"""
Rastreamento dos Correios - Routes
"""
import asyncio
import logging
import httpx
from datetime import datetime, timezone
from fastapi import APIRouter, HTTPException, Depends

from auth import get_current_user
from utils.database import db

router = APIRouter(tags=["Rastreamento"])
logger = logging.getLogger(__name__)


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
                        await asyncio.sleep(2)
                        continue
        except Exception as e:
            logger.warning(f"Erro ao consultar SeuRastreio (tentativa {tentativa+1}): {str(e)}")
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


@router.get("/rastreio/{codigo}")
async def buscar_rastreio(codigo: str, current_user: dict = Depends(get_current_user)):
    """Buscar rastreamento de um código dos Correios"""
    result = await buscar_rastreio_api(codigo)
    return {
        "codigo": codigo,
        **result
    }


@router.post("/purchase-orders/{po_id}/items/{codigo_item}/rastreio")
async def definir_codigo_rastreio(
    po_id: str,
    codigo_item: str,
    data: dict,
    current_user: dict = Depends(get_current_user)
):
    """Define o código de rastreio e move para Em Trânsito"""
    codigo_rastreio = data.get('codigo_rastreio', '').strip().upper()
    
    if not codigo_rastreio:
        raise HTTPException(status_code=400, detail="Código de rastreio é obrigatório")
    
    po = await db.purchase_orders.find_one({"id": po_id}, {"_id": 0})
    
    if not po:
        raise HTTPException(status_code=404, detail="Ordem de Compra não encontrada")
    
    item_updated = False
    
    for item in po['items']:
        if item['codigo_item'] == codigo_item:
            item['codigo_rastreio'] = codigo_rastreio
            item['status'] = 'em_transito'
            item['data_envio'] = datetime.now(timezone.utc).isoformat()
            
            # Buscar eventos de rastreio
            rastreio_result = await buscar_rastreio_api(codigo_rastreio)
            if rastreio_result.get('success'):
                item['historico_rastreio'] = rastreio_result.get('eventos', [])
            
            item_updated = True
            break
    
    if not item_updated:
        raise HTTPException(status_code=404, detail="Item não encontrado")
    
    await db.purchase_orders.update_one(
        {"id": po_id},
        {"$set": {"items": po['items']}}
    )
    
    return {"message": "Código de rastreio definido com sucesso", "codigo_rastreio": codigo_rastreio}


@router.post("/purchase-orders/{po_id}/items/{codigo_item}/atualizar-rastreio")
async def atualizar_rastreio(
    po_id: str,
    codigo_item: str,
    current_user: dict = Depends(get_current_user)
):
    """Atualiza as informações de rastreio de um item"""
    po = await db.purchase_orders.find_one({"id": po_id}, {"_id": 0})
    
    if not po:
        raise HTTPException(status_code=404, detail="Ordem de Compra não encontrada")
    
    item_found = None
    item_index = None
    
    for idx, item in enumerate(po['items']):
        if item['codigo_item'] == codigo_item:
            item_found = item
            item_index = idx
            break
    
    if not item_found:
        raise HTTPException(status_code=404, detail="Item não encontrado")
    
    codigo_rastreio = item_found.get('codigo_rastreio')
    if not codigo_rastreio:
        raise HTTPException(status_code=400, detail="Item não possui código de rastreio")
    
    rastreio_result = await buscar_rastreio_api(codigo_rastreio)
    
    if rastreio_result.get('success'):
        eventos = rastreio_result.get('eventos', [])
        po['items'][item_index]['historico_rastreio'] = eventos
        
        # Verificar se foi entregue
        entregue = False
        for evento in eventos:
            status_lower = evento.get('status', '').lower()
            if 'entregue' in status_lower or 'objeto entregue' in status_lower:
                entregue = True
                break
        
        if entregue and po['items'][item_index]['status'] != 'entregue':
            po['items'][item_index]['status'] = 'entregue'
            po['items'][item_index]['data_entrega'] = datetime.now(timezone.utc).isoformat()
            
            # Criar notificação de entrega
            notificacao = {
                "id": str(__import__('uuid').uuid4()),
                "tipo": "entrega",
                "numero_oc": po.get('numero_oc'),
                "codigo_item": codigo_item,
                "descricao": item_found.get('descricao', '')[:50],
                "data": datetime.now(timezone.utc).isoformat(),
                "lida": False,
                "responsavel": item_found.get('responsavel', '')
            }
            await db.notificacoes.insert_one(notificacao)
        
        await db.purchase_orders.update_one(
            {"id": po_id},
            {"$set": {"items": po['items']}}
        )
        
        return {
            "message": "Rastreio atualizado com sucesso",
            "eventos": eventos,
            "entregue": entregue
        }
    
    return {
        "message": "Não foi possível atualizar o rastreio",
        "eventos": [],
        "entregue": False
    }


@router.post("/purchase-orders/{po_id}/items/{codigo_item}/marcar-entregue")
async def marcar_item_entregue(
    po_id: str,
    codigo_item: str,
    current_user: dict = Depends(get_current_user)
):
    """Marca um item como entregue manualmente"""
    po = await db.purchase_orders.find_one({"id": po_id}, {"_id": 0})
    
    if not po:
        raise HTTPException(status_code=404, detail="Ordem de Compra não encontrada")
    
    item_updated = False
    
    for item in po['items']:
        if item['codigo_item'] == codigo_item:
            item['status'] = 'entregue'
            item['data_entrega'] = datetime.now(timezone.utc).isoformat()
            item_updated = True
            break
    
    if not item_updated:
        raise HTTPException(status_code=404, detail="Item não encontrado")
    
    await db.purchase_orders.update_one(
        {"id": po_id},
        {"$set": {"items": po['items']}}
    )
    
    return {"message": "Item marcado como entregue"}
