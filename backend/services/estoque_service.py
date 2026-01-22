"""
Serviço de Estoque - Funções de lógica de negócio para gestão de estoque
"""
import logging
from datetime import datetime, timezone
from utils.database import db

logger = logging.getLogger(__name__)


async def reverter_uso_estoque(item: dict, po_id: str, numero_oc: str) -> dict:
    """
    Reverte o uso de estoque quando um item é movido de volta para pendente/cotado.
    
    Esta função:
    1. Verifica se o item usou estoque (via estoque_origem)
    2. Para cada fonte de estoque, decrementa a quantidade_usada_estoque
    3. Remove a entrada em estoque_usado_em da OC de origem
    4. Limpa os campos de estoque do item atual
    
    Retorna um dict com informações sobre o que foi revertido.
    """
    resultado = {
        'estoque_revertido': False,
        'quantidade_revertida': 0,
        'fontes_revertidas': []
    }
    
    estoque_origem = item.get('estoque_origem', [])
    if not estoque_origem:
        # Não usou estoque, apenas limpar campos por segurança
        item['quantidade_do_estoque'] = 0
        item['estoque_origem'] = []
        item['parcialmente_atendido_estoque'] = False
        item['atendido_por_estoque'] = False
        # Remover fonte de compra "ESTOQUE INTERNO" se existir
        if item.get('fontes_compra'):
            item['fontes_compra'] = [
                fc for fc in item['fontes_compra'] 
                if fc.get('fornecedor') != 'ESTOQUE INTERNO'
            ]
        return resultado
    
    logger.info(f"Revertendo uso de estoque para item no po_id={po_id}, estoque_origem={estoque_origem}")
    
    # Processar cada fonte de estoque
    for fonte in estoque_origem:
        numero_oc_origem = fonte.get('numero_oc')
        quantidade_usada = fonte.get('quantidade', 0)
        
        if not numero_oc_origem or quantidade_usada <= 0:
            continue
        
        # Encontrar a OC de origem
        po_origem = await db.purchase_orders.find_one(
            {"numero_oc": numero_oc_origem},
            {"_id": 0}
        )
        
        if not po_origem:
            logger.warning(f"OC de origem {numero_oc_origem} não encontrada para reverter estoque")
            continue
        
        # Encontrar o item com o mesmo código na OC de origem
        codigo_item = item.get('codigo_item')
        item_origem_atualizado = False
        
        for item_origem in po_origem.get('items', []):
            if item_origem.get('codigo_item') != codigo_item:
                continue
            
            # Decrementar quantidade_usada_estoque
            qtd_usada_atual = item_origem.get('quantidade_usada_estoque', 0)
            nova_qtd_usada = max(0, qtd_usada_atual - quantidade_usada)
            item_origem['quantidade_usada_estoque'] = nova_qtd_usada
            
            # Remover entrada em estoque_usado_em que corresponde a esta OC destino
            estoque_usado_em = item_origem.get('estoque_usado_em', [])
            item_origem['estoque_usado_em'] = [
                uso for uso in estoque_usado_em 
                if uso.get('po_id') != po_id
            ]
            
            item_origem_atualizado = True
            logger.info(f"Revertido {quantidade_usada} UN do estoque na OC {numero_oc_origem}, nova qtd_usada={nova_qtd_usada}")
            break
        
        if item_origem_atualizado:
            # Salvar a OC de origem atualizada
            await db.purchase_orders.update_one(
                {"id": po_origem['id']},
                {"$set": {"items": po_origem['items']}}
            )
            
            resultado['fontes_revertidas'].append({
                'numero_oc': numero_oc_origem,
                'quantidade': quantidade_usada
            })
            resultado['quantidade_revertida'] += quantidade_usada
    
    # Limpar campos de estoque do item atual
    item['quantidade_do_estoque'] = 0
    item['estoque_origem'] = []
    item['parcialmente_atendido_estoque'] = False
    item['atendido_por_estoque'] = False
    item['preco_estoque_unitario'] = None
    
    # Remover fonte de compra "ESTOQUE INTERNO" se existir
    if item.get('fontes_compra'):
        item['fontes_compra'] = [
            fc for fc in item['fontes_compra'] 
            if fc.get('fornecedor') != 'ESTOQUE INTERNO'
        ]
    
    resultado['estoque_revertido'] = len(resultado['fontes_revertidas']) > 0
    
    return resultado


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


def calcular_lucro_item(item: dict, tax_percentage: float = 11.0) -> None:
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
    
    if fontes and len(fontes) > 0:
        # Calcular custo total e quantidade total das fontes
        total_custo_fontes = sum(fc.get('quantidade', 0) * fc.get('preco_unitario', 0) for fc in fontes)
        total_qtd_fontes = sum(fc.get('quantidade', 0) for fc in fontes)
        total_frete_fontes = sum(fc.get('frete', 0) for fc in fontes)
        
        if total_qtd_fontes > 0:
            # Custo unitário médio das fontes
            custo_unitario_medio = total_custo_fontes / total_qtd_fontes
            # Frete proporcional por unidade
            frete_por_unidade = total_frete_fontes / total_qtd_fontes
            
            # Calcular para a quantidade NECESSÁRIA (não a comprada)
            custo_proporcional = custo_unitario_medio * quantidade_necessaria
            frete_proporcional = frete_por_unidade * quantidade_necessaria
            
            receita = preco_venda * quantidade_necessaria
            impostos = receita * (tax_percentage / 100)
            frete_envio = item.get('frete_envio', 0) or 0
            
            item['lucro_liquido'] = round(receita - custo_proporcional - frete_proporcional - impostos - frete_envio, 2)
            item['imposto'] = round(impostos, 2)
    
    elif item.get('preco_compra') is not None:
        # Usar preço de compra direto
        receita = preco_venda * quantidade_necessaria
        custo = item['preco_compra'] * quantidade_necessaria
        impostos = receita * (tax_percentage / 100)
        frete_compra = item.get('frete_compra', 0) or 0
        frete_envio = item.get('frete_envio', 0) or 0
        
        item['lucro_liquido'] = round(receita - custo - impostos - frete_compra - frete_envio, 2)
        item['imposto'] = round(impostos, 2)
