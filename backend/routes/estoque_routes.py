"""
Estoque Routes - Rotas de gestão de estoque
Usa coleção separada 'estoque_manual' para itens adicionados manualmente
"""
from fastapi import APIRouter, HTTPException, Depends
from typing import Dict, List, Optional
from datetime import datetime, timezone
import logging
import uuid

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
    Lista todos os itens em estoque.
    Combina:
    1. Itens com excedente de compra em OCs (quantidade_comprada > quantidade_necessaria)
    2. Itens adicionados manualmente na coleção 'estoque_manual'
    """
    estoque_map = {}
    
    # 1. Buscar excedentes das OCs (itens comprados a mais)
    pos = await db.purchase_orders.find(
        {},
        {"_id": 0, "id": 1, "numero_oc": 1, "items": 1}
    ).to_list(5000)
    
    for po in pos:
        for idx, item in enumerate(po.get('items', [])):
            quantidade_necessaria = item.get('quantidade', 0)
            status = item.get('status', 'pendente')
            
            # Só considerar itens que já foram comprados
            if status not in ['comprado', 'em_separacao', 'pronto_envio', 'em_transito', 'entregue']:
                continue
            
            # Ignorar itens atendidos por estoque
            if item.get('atendido_por_estoque'):
                continue
            
            # Calcular quantidade comprada
            fontes = item.get('fontes_compra', [])
            if fontes:
                quantidade_comprada = sum(f.get('quantidade', 0) for f in fontes)
            else:
                quantidade_comprada = item.get('quantidade_comprada', 0)
            
            quantidade_usada_estoque = item.get('quantidade_usada_estoque', 0)
            
            # Verificar se há excedente
            if quantidade_comprada and quantidade_comprada > (quantidade_necessaria + quantidade_usada_estoque):
                excedente = quantidade_comprada - quantidade_necessaria - quantidade_usada_estoque
                codigo_item = item.get('codigo_item', '')
                
                if not codigo_item:
                    continue
                
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
                        'disponivel': excedente,
                        'link_compra': link_compra,
                        'fornecedor': fornecedor,
                        'preco_unitario': preco_unitario,
                        'imagem_url': item.get('imagem_url'),
                        'origem': 'excedente_oc',
                        'ocs_origem': [{
                            'numero_oc': po.get('numero_oc'),
                            'po_id': po.get('id'),
                            'item_index': idx,
                            'quantidade': excedente
                        }]
                    }
                else:
                    estoque_map[codigo_item]['quantidade_estoque'] += excedente
                    estoque_map[codigo_item]['disponivel'] += excedente
                    estoque_map[codigo_item]['ocs_origem'].append({
                        'numero_oc': po.get('numero_oc'),
                        'po_id': po.get('id'),
                        'item_index': idx,
                        'quantidade': excedente
                    })
    
    # 2. Buscar itens adicionados manualmente
    itens_manuais = await db.estoque_manual.find({}, {"_id": 0}).to_list(5000)
    
    for item in itens_manuais:
        codigo_item = item.get('codigo_item', '')
        quantidade = item.get('quantidade', 0)
        quantidade_usada = item.get('quantidade_usada', 0)
        disponivel = quantidade - quantidade_usada
        
        if disponivel <= 0 or not codigo_item:
            continue
        
        if codigo_item not in estoque_map:
            estoque_map[codigo_item] = {
                'codigo_item': codigo_item,
                'descricao': item.get('descricao', ''),
                'marca_modelo': item.get('marca_modelo', ''),
                'unidade': item.get('unidade', 'UN'),
                'quantidade_estoque': disponivel,
                'disponivel': disponivel,
                'link_compra': item.get('link_compra', ''),
                'fornecedor': item.get('fornecedor', 'ESTOQUE MANUAL'),
                'preco_unitario': item.get('preco_unitario', 0),
                'imagem_url': item.get('imagem_url'),
                'origem': 'manual',
                'estoque_manual_id': item.get('id'),
                'ocs_origem': []
            }
        else:
            estoque_map[codigo_item]['quantidade_estoque'] += disponivel
            estoque_map[codigo_item]['disponivel'] += disponivel
    
    result = sorted(estoque_map.values(), key=lambda x: x['codigo_item'])
    
    return {
        "total_itens_diferentes": len(result),
        "estoque": result,
        "items": result  # Alias para compatibilidade
    }


@router.get("/mapa")
async def get_estoque_mapa(current_user: dict = Depends(get_current_user)):
    """Retorna mapa simples de código -> quantidade disponível"""
    estoque = await listar_estoque(current_user)
    return {item['codigo_item']: item['disponivel'] for item in estoque.get('items', [])}


@router.get("/verificar/{codigo_item}")
async def verificar_estoque_item(
    codigo_item: str,
    current_user: dict = Depends(get_current_user)
):
    """Verifica disponibilidade de um item específico no estoque"""
    estoque = await listar_estoque(current_user)
    
    for item in estoque.get('items', []):
        if item['codigo_item'] == codigo_item:
            return {
                "codigo_item": codigo_item,
                "disponivel": item['disponivel'],
                "descricao": item.get('descricao', ''),
                "preco_unitario": item.get('preco_unitario', 0),
                "fornecedor": item.get('fornecedor', ''),
                "origem": item.get('origem', 'desconhecida'),
                "imagem_url": item.get('imagem_url')
            }
    
    return {
        "codigo_item": codigo_item,
        "disponivel": 0,
        "descricao": "",
        "preco_unitario": 0,
        "fornecedor": "",
        "origem": None
    }


@router.post("/adicionar-manual")
async def adicionar_estoque_manual(
    data: dict,
    current_user: dict = Depends(get_current_user)
):
    """
    Adiciona item manualmente ao estoque.
    Usa coleção separada 'estoque_manual'.
    """
    codigo_item = data.get('codigo_item', '').strip()
    descricao = data.get('descricao', '').strip()
    quantidade = data.get('quantidade', 0)
    preco_unitario = data.get('preco_unitario', 0)
    fornecedor = data.get('fornecedor', 'ENTRADA MANUAL').strip()
    
    if not codigo_item:
        raise HTTPException(status_code=400, detail="Código do item é obrigatório")
    
    if quantidade <= 0:
        raise HTTPException(status_code=400, detail="Quantidade deve ser maior que 0")
    
    # Verificar se já existe no estoque manual
    item_existente = await db.estoque_manual.find_one(
        {"codigo_item": codigo_item},
        {"_id": 0}
    )
    
    if item_existente:
        # Adicionar à quantidade existente
        nova_quantidade = item_existente.get('quantidade', 0) + quantidade
        
        # Adicionar ao histórico de entradas
        historico = item_existente.get('historico_entradas', [])
        historico.append({
            "data": datetime.now(timezone.utc).isoformat(),
            "quantidade": quantidade,
            "preco_unitario": preco_unitario,
            "fornecedor": fornecedor,
            "usuario": current_user.get('email', '')
        })
        
        await db.estoque_manual.update_one(
            {"codigo_item": codigo_item},
            {"$set": {
                "quantidade": nova_quantidade,
                "preco_unitario": preco_unitario,
                "fornecedor": fornecedor,
                "historico_entradas": historico,
                "updated_at": datetime.now(timezone.utc).isoformat()
            }}
        )
        
        return {
            "success": True,
            "message": f"Adicionado +{quantidade} UN ao estoque de {codigo_item}. Total: {nova_quantidade} UN",
            "quantidade_anterior": item_existente.get('quantidade', 0),
            "quantidade_nova": nova_quantidade
        }
    else:
        # Criar novo item no estoque
        novo_item = {
            "id": str(uuid.uuid4()),
            "codigo_item": codigo_item,
            "descricao": descricao or f"Item {codigo_item}",
            "quantidade": quantidade,
            "quantidade_usada": 0,
            "unidade": "UN",
            "preco_unitario": preco_unitario,
            "fornecedor": fornecedor,
            "imagem_url": None,
            "historico_entradas": [{
                "data": datetime.now(timezone.utc).isoformat(),
                "quantidade": quantidade,
                "preco_unitario": preco_unitario,
                "fornecedor": fornecedor,
                "usuario": current_user.get('email', '')
            }],
            "historico_saidas": [],
            "created_at": datetime.now(timezone.utc).isoformat(),
            "updated_at": datetime.now(timezone.utc).isoformat()
        }
        
        await db.estoque_manual.insert_one(novo_item)
        
        return {
            "success": True,
            "message": f"Item {codigo_item} adicionado ao estoque com {quantidade} UN",
            "item_id": novo_item['id']
        }


@router.patch("/editar/{codigo_item}")
async def editar_estoque_manual(
    codigo_item: str,
    data: dict,
    current_user: dict = Depends(require_admin)
):
    """Edita um item do estoque manual (apenas admin)"""
    item = await db.estoque_manual.find_one({"codigo_item": codigo_item}, {"_id": 0})
    
    if not item:
        raise HTTPException(status_code=404, detail=f"Item {codigo_item} não encontrado no estoque manual")
    
    updates = {}
    
    if 'descricao' in data:
        updates['descricao'] = data['descricao']
    if 'quantidade' in data:
        updates['quantidade'] = data['quantidade']
    if 'preco_unitario' in data:
        updates['preco_unitario'] = data['preco_unitario']
    if 'fornecedor' in data:
        updates['fornecedor'] = data['fornecedor']
    
    if updates:
        updates['updated_at'] = datetime.now(timezone.utc).isoformat()
        await db.estoque_manual.update_one(
            {"codigo_item": codigo_item},
            {"$set": updates}
        )
    
    return {"success": True, "message": f"Item {codigo_item} atualizado"}


@router.delete("/remover/{codigo_item}")
async def remover_estoque_manual(
    codigo_item: str,
    current_user: dict = Depends(require_admin)
):
    """Remove um item do estoque manual (apenas admin)"""
    result = await db.estoque_manual.delete_one({"codigo_item": codigo_item})
    
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail=f"Item {codigo_item} não encontrado no estoque manual")
    
    return {"success": True, "message": f"Item {codigo_item} removido do estoque"}


@router.post("/adicionar-quantidade")
async def adicionar_quantidade_estoque(
    data: dict,
    current_user: dict = Depends(get_current_user)
):
    """Adiciona quantidade a um item já existente no estoque"""
    return await adicionar_estoque_manual(data, current_user)


@router.get("/manual")
async def listar_estoque_manual(current_user: dict = Depends(get_current_user)):
    """Lista apenas os itens do estoque manual"""
    itens = await db.estoque_manual.find({}, {"_id": 0}).to_list(5000)
    
    result = []
    for item in itens:
        disponivel = item.get('quantidade', 0) - item.get('quantidade_usada', 0)
        result.append({
            **item,
            'disponivel': disponivel
        })
    
    return {
        "total": len(result),
        "items": sorted(result, key=lambda x: x['codigo_item'])
    }
