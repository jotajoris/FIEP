"""
Fornecedores Routes - Rotas para fornecedores e CEP
"""
from fastapi import APIRouter, HTTPException, Depends
from typing import List, Optional
import requests
import re
import logging

from auth import get_current_user

logger = logging.getLogger(__name__)

router = APIRouter(tags=["Fornecedores"])

# Database reference
db = None

def init_fornecedores_routes(database):
    """Initialize fornecedores routes with database"""
    global db
    db = database


@router.get("/fornecedores")
async def get_fornecedores(current_user: dict = Depends(get_current_user)):
    """Listar todos os fornecedores únicos do sistema"""
    pos = await db.purchase_orders.find({}, {"_id": 0, "items.fornecedor": 1}).to_list(length=10000)
    
    fornecedores = set()
    for po in pos:
        for item in po.get('items', []):
            if item.get('fornecedor'):
                fornecedores.add(item['fornecedor'])
    
    return sorted(list(fornecedores))


@router.post("/buscar-cep")
async def buscar_cep(
    data: dict,
    current_user: dict = Depends(get_current_user)
):
    """Buscar CEP baseado no endereço"""
    endereco = data.get('endereco', '')
    
    if not endereco:
        raise HTTPException(status_code=400, detail="Endereço não informado")
    
    try:
        # Extrair UF do endereço (últimas 2 letras ou entre parênteses)
        uf_match = re.search(r'[-/\s]([A-Z]{2})(?:\s|$|,|\))', endereco.upper())
        uf = uf_match.group(1) if uf_match else 'PR'  # Default PR
        
        # Extrair cidade - geralmente antes do UF
        cidade_match = re.search(r'[-/]\s*([^-/,]+?)[-/\s]*(?:[A-Z]{2})(?:\s|$|,|\))', endereco)
        if cidade_match:
            cidade = cidade_match.group(1).strip()
        else:
            # Tentar extrair cidade de forma alternativa
            parts = endereco.replace('-', '/').split('/')
            cidade = parts[-2].strip() if len(parts) >= 2 else 'Curitiba'
        
        # Extrair logradouro - primeira parte significativa
        logradouro_match = re.search(r'^([^,\d-]+)', endereco)
        logradouro = logradouro_match.group(1).strip() if logradouro_match else ''
        
        # Limpar o logradouro
        logradouro = re.sub(r'^\s*(Rua|Av\.?|Avenida|R\.?|Travessa|Trav\.?|Praça|Alameda|Al\.?)\s*', '', logradouro, flags=re.IGNORECASE).strip()
        
        # Se logradouro ainda estiver muito longo, pegar apenas o nome principal
        if ' ' in logradouro:
            # Pegar apenas a primeira palavra significativa (o nome da rua)
            palavras = logradouro.split()
            if palavras:
                logradouro = palavras[0]
        
        logger.info(f"Buscando CEP: UF={uf}, Cidade={cidade}, Logradouro={logradouro}")
        
        # Tentar buscar pelo ViaCEP
        url = f"https://viacep.com.br/ws/{uf}/{cidade}/{logradouro}/json/"
        response = requests.get(url, timeout=5)
        
        if response.status_code == 200:
            data = response.json()
            if isinstance(data, list) and len(data) > 0:
                cep = data[0].get('cep', '').replace('-', '')
                return {
                    "success": True,
                    "cep": cep,
                    "endereco_completo": f"{data[0].get('logradouro', '')} - {data[0].get('bairro', '')} - {cidade}/{uf}",
                    "dados": data[0]
                }
        
        # Tentar busca alternativa com cidade diferente
        return {
            "success": False,
            "message": f"CEP não encontrado para: {cidade}/{uf} - {logradouro}",
            "tentativa": {"uf": uf, "cidade": cidade, "logradouro": logradouro}
        }
        
    except Exception as e:
        logger.error(f"Erro ao buscar CEP: {str(e)}")
        return {
            "success": False,
            "message": f"Erro ao buscar CEP: {str(e)}"
        }
