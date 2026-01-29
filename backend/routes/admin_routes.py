"""
Admin Routes - Rotas administrativas
Inclui: comissões, notas fiscais, pagamentos, itens por responsável
"""
from fastapi import APIRouter, HTTPException, Depends
from typing import List, Optional, Dict
from datetime import datetime, timezone
import uuid

from auth import require_admin, get_current_user
from models import CommissionPayment, CommissionPaymentCreate, CommissionPaymentUpdate

router = APIRouter(prefix="/admin", tags=["Admin"])

# Database reference will be set from server.py
db = None

# Constants imported from server
LOT_ASSIGNMENTS = None
LOT_TO_OWNER = None
EXCLUDED_OCS_FROM_COMMISSION = None

def init_admin_routes(database, lot_assignments, lot_to_owner, excluded_ocs):
    """Initialize the admin routes with database and constants"""
    global db, LOT_ASSIGNMENTS, LOT_TO_OWNER, EXCLUDED_OCS_FROM_COMMISSION
    db = database
    LOT_ASSIGNMENTS = lot_assignments
    LOT_TO_OWNER = lot_to_owner
    EXCLUDED_OCS_FROM_COMMISSION = excluded_ocs


def get_responsible_by_lot(lot_number: int) -> str:
    """Get responsible name by lot number"""
    return LOT_TO_OWNER.get(lot_number, "Não atribuído")


@router.get("/comissoes")
async def get_comissoes(current_user: dict = Depends(require_admin)):
    """Obter resumo de comissões por responsável"""
    pos = await db.purchase_orders.find({}, {"_id": 0}).to_list(length=10000)
    
    # Calcular comissão por responsável
    comissoes = {}
    
    for po in pos:
        numero_oc = po.get('numero_oc', '')
        
        # Ignorar OCs excluídas
        if numero_oc in EXCLUDED_OCS_FROM_COMMISSION:
            continue
            
        for item in po.get('items', []):
            # Determinar responsável: primeiro pelo lote, depois pelo campo responsavel
            responsavel = None
            lote_str = item.get('lote', '')
            
            # Tentar extrair número do lote
            if lote_str:
                import re
                match = re.search(r'\d+', str(lote_str))
                if match:
                    lot_num = int(match.group())
                    responsavel = get_responsible_by_lot(lot_num)
                    if responsavel == "Não atribuído":
                        responsavel = None
            
            # Se não encontrou pelo lote, usa o campo responsavel
            if not responsavel:
                responsavel = item.get('responsavel')
            
            if not responsavel:
                continue
            
            if responsavel not in comissoes:
                comissoes[responsavel] = {
                    'responsavel': responsavel,
                    'total_itens': 0,
                    'itens_finalizados': 0,
                    'valor_total_compra': 0,
                    'valor_total_venda': 0,
                    'lucro_bruto': 0,
                    'percentual_comissao': 5,  # Default 5%
                    'valor_comissao': 0
                }
            
            comissoes[responsavel]['total_itens'] += 1
            
            # Só conta para comissão se estiver em trânsito ou entregue
            status = item.get('status', '').lower()
            if status in ['em_transito', 'entregue']:
                comissoes[responsavel]['itens_finalizados'] += 1
                
                quantidade = item.get('quantidade', 1) or 1
                preco_compra = item.get('preco', 0) or 0
                preco_venda = item.get('preco_venda', 0) or 0
                
                valor_compra = preco_compra * quantidade
                valor_venda = preco_venda * quantidade
                
                comissoes[responsavel]['valor_total_compra'] += valor_compra
                comissoes[responsavel]['valor_total_venda'] += valor_venda
                comissoes[responsavel]['lucro_bruto'] += (valor_venda - valor_compra)
    
    # Carregar percentuais customizados de comissão
    config = await db.config.find_one({"tipo": "comissoes"})
    percentuais_custom = config.get('percentuais', {}) if config else {}
    
    # Calcular valor final de comissão
    for resp, dados in comissoes.items():
        percentual = percentuais_custom.get(resp, 5)
        dados['percentual_comissao'] = percentual
        dados['valor_comissao'] = dados['lucro_bruto'] * (percentual / 100)
    
    return list(comissoes.values())


@router.patch("/comissoes/{responsavel}")
async def update_comissao_percentual(
    responsavel: str,
    data: dict,
    current_user: dict = Depends(require_admin)
):
    """Atualizar percentual de comissão de um responsável"""
    percentual = data.get('percentual', 5)
    
    # Salvar no banco
    await db.config.update_one(
        {"tipo": "comissoes"},
        {"$set": {f"percentuais.{responsavel}": percentual}},
        upsert=True
    )
    
    return {"success": True, "message": f"Percentual de {responsavel} atualizado para {percentual}%"}


@router.get("/notas-fiscais")
async def get_todas_notas_fiscais(current_user: dict = Depends(require_admin)):
    """Obter todas as notas fiscais do sistema (compra e venda)"""
    pos = await db.purchase_orders.find({}, {"_id": 0}).to_list(length=1000)
    
    nfs_compra = []
    nfs_venda = []
    nf_por_filename = {}
    
    for po in pos:
        for idx, item in enumerate(po.get('items', [])):
            # NFs de compra (fornecedor)
            for nf in item.get('notas_fiscais_fornecedor', []):
                filename = nf.get('filename', '')
                
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
                    'numero_nf': nf.get('numero_nf'),
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
                    'numero_nf': nf_revenda.get('numero_nf'),
                    'uploaded_at': nf_revenda.get('uploaded_at'),
                    'numero_oc': po.get('numero_oc'),
                    'codigo_item': item.get('codigo_item'),
                    'descricao': item.get('descricao', '')[:50],
                    'po_id': po.get('id'),
                    'item_index': idx,
                    'baixado_por': nf_revenda.get('baixado_por'),
                    'baixado_em': nf_revenda.get('baixado_em')
                })
    
    # Marcar NFs duplicadas
    for nf in nfs_compra:
        filename = nf.get('filename', '')
        itens_usando = nf_por_filename.get(filename, [])
        nf['duplicada'] = len(itens_usando) > 1
        nf['itens_usando'] = itens_usando if len(itens_usando) > 1 else []
        nf['qtd_usos'] = len(itens_usando)
    
    # NFs duplicadas únicas
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
    
    # Ordenar por data
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


@router.get("/itens-responsavel/{responsavel}")
async def get_itens_responsavel(
    responsavel: str,
    current_user: dict = Depends(require_admin)
):
    """Obter todos os itens de um responsável específico"""
    pos = await db.purchase_orders.find({}, {"_id": 0}).to_list(length=10000)
    
    itens = []
    
    for po in pos:
        numero_oc = po.get('numero_oc', '')
        
        # Ignorar OCs excluídas
        if numero_oc in EXCLUDED_OCS_FROM_COMMISSION:
            continue
            
        for idx, item in enumerate(po.get('items', [])):
            # Determinar responsável do item
            item_responsavel = None
            lote_str = item.get('lote', '')
            
            if lote_str:
                import re
                match = re.search(r'\d+', str(lote_str))
                if match:
                    lot_num = int(match.group())
                    item_responsavel = get_responsible_by_lot(lot_num)
                    if item_responsavel == "Não atribuído":
                        item_responsavel = None
            
            if not item_responsavel:
                item_responsavel = item.get('responsavel')
            
            # Filtrar pelo responsável solicitado
            if item_responsavel != responsavel:
                continue
            
            # Adicionar item
            status = item.get('status', '').lower()
            quantidade = item.get('quantidade', 1) or 1
            preco_compra = item.get('preco', 0) or 0
            preco_venda = item.get('preco_venda', 0) or 0
            
            valor_compra = preco_compra * quantidade
            valor_venda = preco_venda * quantidade
            lucro = valor_venda - valor_compra
            
            itens.append({
                'numero_oc': numero_oc,
                'po_id': po.get('id'),
                'item_index': idx,
                'codigo_item': item.get('codigo_item'),
                'descricao': item.get('descricao', '')[:100],
                'quantidade': quantidade,
                'status': status,
                'preco_compra': preco_compra,
                'preco_venda': preco_venda,
                'valor_total_compra': valor_compra,
                'valor_total_venda': valor_venda,
                'lucro': lucro,
                'lote': item.get('lote'),
                'data_entrega': po.get('data_entrega'),
                'finalizado': status in ['em_transito', 'entregue']
            })
    
    return itens


@router.get("/pagamentos")
async def get_pagamentos(current_user: dict = Depends(require_admin)):
    """Listar todos os pagamentos de comissão"""
    pagamentos = await db.commission_payments.find({}, {"_id": 0}).to_list(length=1000)
    return pagamentos


@router.post("/pagamentos")
async def create_pagamento(
    data: CommissionPaymentCreate,
    current_user: dict = Depends(require_admin)
):
    """Registrar novo pagamento de comissão"""
    pagamento = {
        "id": str(uuid.uuid4()),
        "responsavel": data.responsavel,
        "valor_comissao": data.valor_comissao,
        "data_pagamento": data.data_pagamento or datetime.now(timezone.utc).isoformat(),
        "observacao": data.observacao,
        "created_at": datetime.now(timezone.utc).isoformat(),
        "created_by": current_user.get('sub')
    }
    
    await db.commission_payments.insert_one(pagamento)
    return pagamento


@router.patch("/pagamentos/{pagamento_id}")
async def update_pagamento(
    pagamento_id: str,
    data: CommissionPaymentUpdate,
    current_user: dict = Depends(require_admin)
):
    """Atualizar um pagamento existente"""
    update_data = {}
    if data.valor_comissao is not None:
        update_data["valor_comissao"] = data.valor_comissao
    if data.data_pagamento is not None:
        update_data["data_pagamento"] = data.data_pagamento
    if data.observacao is not None:
        update_data["observacao"] = data.observacao
    
    if update_data:
        update_data["updated_at"] = datetime.now(timezone.utc).isoformat()
        update_data["updated_by"] = current_user.get('sub')
        
        await db.commission_payments.update_one(
            {"id": pagamento_id},
            {"$set": update_data}
        )
    
    return {"success": True, "message": "Pagamento atualizado"}


@router.delete("/pagamentos/{pagamento_id}")
async def delete_pagamento(
    pagamento_id: str,
    current_user: dict = Depends(require_admin)
):
    """Excluir um pagamento"""
    result = await db.commission_payments.delete_one({"id": pagamento_id})
    
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Pagamento não encontrado")
    
    return {"success": True, "message": "Pagamento excluído"}
