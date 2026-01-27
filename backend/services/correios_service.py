"""
Serviço de integração com a API dos Correios
Rastreamento de objetos e atualização automática de status
"""
import os
import httpx
import logging
from datetime import datetime, timezone, timedelta
from typing import Optional, Dict, List, Any

logger = logging.getLogger(__name__)

# Configurações da API dos Correios
CORREIOS_API_URL = os.environ.get('CORREIOS_API_URL', 'https://api.correios.com.br')
CORREIOS_RASTRO_URL = os.environ.get('CORREIOS_RASTRO_URL', 'https://api.correios.com.br/srorastro/v1')

# Credenciais (serão carregadas do .env)
CORREIOS_USUARIO = os.environ.get('CORREIOS_USUARIO')
CORREIOS_SENHA = os.environ.get('CORREIOS_SENHA')
CORREIOS_CARTAO_POSTAGEM = os.environ.get('CORREIOS_CARTAO_POSTAGEM')
CORREIOS_CONTRATO = os.environ.get('CORREIOS_CONTRATO')

# Cache do token
_token_cache = {
    'token': None,
    'expires_at': None
}

# Mapeamento de eventos dos Correios para status do sistema
EVENTOS_ENTREGA = [
    'BDE',  # Objeto entregue ao destinatário
    'BDI',  # Objeto entregue ao destinatário
    'OEC',  # Objeto entregue ao destinatário
]

EVENTOS_SAIU_ENTREGA = [
    'OEC',  # Objeto saiu para entrega ao destinatário
]

EVENTOS_TENTATIVA_ENTREGA = [
    'BDR',  # Objeto não entregue - destinatário ausente
    'LDI',  # Objeto aguardando retirada
]

EVENTOS_EM_TRANSITO = [
    'RO',   # Objeto postado
    'DO',   # Objeto em trânsito
    'PO',   # Objeto postado
    'PAR',  # Objeto em trânsito
]

# Descrições de eventos que indicam entrega
DESCRICOES_ENTREGA = [
    'objeto entregue',
    'entrega realizada',
    'entregue ao destinatário',
]

# Descrições de eventos que indicam saiu para entrega
DESCRICOES_SAIU_ENTREGA = [
    'saiu para entrega',
    'objeto saiu para entrega',
    'com o carteiro',
]

# Descrições de eventos que indicam tentativa de entrega
DESCRICOES_TENTATIVA = [
    'não entregue',
    'ausente',
    'carteiro não atendido',
    'aguardando retirada',
    'tentativa de entrega',
]


async def obter_token_correios() -> Optional[str]:
    """
    Obtém token de autenticação da API dos Correios.
    Usa cache para evitar requisições desnecessárias.
    """
    global _token_cache
    
    # Verificar se tem token válido em cache
    if _token_cache['token'] and _token_cache['expires_at']:
        if datetime.now(timezone.utc) < _token_cache['expires_at']:
            return _token_cache['token']
    
    if not CORREIOS_USUARIO or not CORREIOS_SENHA:
        logger.error("Credenciais dos Correios não configuradas")
        return None
    
    try:
        import base64
        
        async with httpx.AsyncClient(timeout=30.0) as client:
            # Autenticação Basic: base64(usuario:senha)
            credentials = base64.b64encode(f"{CORREIOS_USUARIO}:{CORREIOS_SENHA}".encode()).decode()
            
            # Endpoint com cartão de postagem
            if CORREIOS_CARTAO_POSTAGEM:
                endpoint = f"{CORREIOS_API_URL}/token/v1/autentica/cartaopostagem"
                payload = {
                    "numero": CORREIOS_CARTAO_POSTAGEM
                }
                if CORREIOS_CONTRATO:
                    payload["contrato"] = CORREIOS_CONTRATO
            else:
                # Autenticação simples sem cartão
                endpoint = f"{CORREIOS_API_URL}/token/v1/autentica"
                payload = {}
            
            logger.info(f"Obtendo token dos Correios: {endpoint}")
            
            response = await client.post(
                endpoint,
                json=payload,
                headers={
                    "Authorization": f"Basic {credentials}",
                    "Content-Type": "application/json",
                    "Accept": "application/json"
                }
            )
            
            if response.status_code == 201 or response.status_code == 200:
                data = response.json()
                token = data.get('token')
                
                # expiraEm pode vir como string datetime ou int (segundos)
                expires_em = data.get('expiraEm')
                if isinstance(expires_em, str):
                    # É uma data/hora no formato ISO
                    try:
                        expires_at = datetime.fromisoformat(expires_em.replace('Z', '+00:00'))
                        # Garantir que tem timezone
                        if expires_at.tzinfo is None:
                            expires_at = expires_at.replace(tzinfo=timezone.utc)
                        _token_cache['expires_at'] = expires_at - timedelta(minutes=5)  # 5min de margem
                    except:
                        _token_cache['expires_at'] = datetime.now(timezone.utc) + timedelta(hours=23)
                elif isinstance(expires_em, int):
                    _token_cache['expires_at'] = datetime.now(timezone.utc) + timedelta(seconds=expires_em - 300)
                else:
                    _token_cache['expires_at'] = datetime.now(timezone.utc) + timedelta(hours=23)
                
                # Atualizar cache
                _token_cache['token'] = token
                
                logger.info("Token dos Correios obtido com sucesso")
                return token
            else:
                logger.error(f"Erro ao obter token dos Correios: {response.status_code} - {response.text}")
                return None
                
    except Exception as e:
        logger.error(f"Exceção ao obter token dos Correios: {str(e)}")
        return None


async def rastrear_objeto_correios(codigo_rastreio: str) -> Dict[str, Any]:
    """
    Consulta o rastreamento de um objeto na API dos Correios.
    
    Args:
        codigo_rastreio: Código de rastreio do objeto (ex: BR123456789BR)
        
    Returns:
        Dict com informações do rastreamento ou erro
    """
    if not codigo_rastreio:
        return {"success": False, "error": "Código de rastreio não informado"}
    
    # Limpar e formatar código
    codigo = codigo_rastreio.strip().upper()
    
    # Obter token
    token = await obter_token_correios()
    if not token:
        # Fallback para API pública (LinkeTrack) se não tiver credenciais
        return await _rastrear_fallback(codigo)
    
    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            endpoint = f"{CORREIOS_RASTRO_URL}/objetos/{codigo}"
            
            response = await client.get(
                endpoint,
                params={"resultado": "T"},  # T = Todos os eventos
                headers={
                    "Accept": "application/json",
                    "Authorization": f"Bearer {token}"
                }
            )
            
            if response.status_code == 200:
                data = response.json()
                
                # Verificar se o objeto pertence ao contrato
                objetos = data.get('objetos', [])
                if objetos and objetos[0].get('mensagem'):
                    msg = objetos[0].get('mensagem', '')
                    if 'não pertence ao contrato' in msg.lower() or 'SRO-009' in msg:
                        # Objeto não pertence ao contrato, usar fallback
                        logger.info(f"Objeto {codigo} não pertence ao contrato, usando fallback")
                        return await _rastrear_fallback(codigo)
                
                return _processar_resposta_correios(data, codigo)
            elif response.status_code == 401:
                # Token expirado, limpar cache e tentar novamente
                _token_cache['token'] = None
                _token_cache['expires_at'] = None
                logger.warning("Token expirado, obtendo novo...")
                return await rastrear_objeto_correios(codigo)
            else:
                logger.warning(f"Erro na API Correios: {response.status_code}")
                # Fallback para API pública
                return await _rastrear_fallback(codigo)
                
    except Exception as e:
        logger.error(f"Exceção ao rastrear objeto: {str(e)}")
        return await _rastrear_fallback(codigo)


def _processar_resposta_correios(data: Dict, codigo: str) -> Dict[str, Any]:
    """
    Processa a resposta da API dos Correios e extrai eventos formatados.
    """
    try:
        objetos = data.get('objetos', [])
        if not objetos:
            return {"success": False, "error": "Objeto não encontrado", "codigo": codigo}
        
        objeto = objetos[0]
        eventos_raw = objeto.get('eventos', [])
        
        eventos = []
        entregue = False
        saiu_para_entrega = False
        tentativa_entrega = False
        
        for evento in eventos_raw:
            descricao = evento.get('descricao', '')
            descricao_lower = descricao.lower()
            
            # Verificar tipo de evento
            tipo = evento.get('tipo', '')
            
            # Detectar entrega
            if tipo in EVENTOS_ENTREGA or any(d in descricao_lower for d in DESCRICOES_ENTREGA):
                entregue = True
            
            # Detectar saiu para entrega
            if tipo in EVENTOS_SAIU_ENTREGA or any(d in descricao_lower for d in DESCRICOES_SAIU_ENTREGA):
                saiu_para_entrega = True
            
            # Detectar tentativa de entrega
            if tipo in EVENTOS_TENTATIVA_ENTREGA or any(d in descricao_lower for d in DESCRICOES_TENTATIVA):
                tentativa_entrega = True
            
            # Formatar evento
            unidade = evento.get('unidade', {})
            eventos.append({
                "data": evento.get('dtHrCriado', '')[:10] if evento.get('dtHrCriado') else '',
                "hora": evento.get('dtHrCriado', '')[11:16] if evento.get('dtHrCriado') else '',
                "local": unidade.get('nome', evento.get('unidadeDestino', {}).get('nome', '')),
                "cidade": unidade.get('endereco', {}).get('cidade', ''),
                "uf": unidade.get('endereco', {}).get('uf', ''),
                "status": descricao,
                "tipo": tipo,
                "subStatus": evento.get('detalhe', ''),
            })
        
        return {
            "success": True,
            "codigo": codigo,
            "eventos": eventos,
            "entregue": entregue,
            "saiu_para_entrega": saiu_para_entrega,
            "tentativa_entrega": tentativa_entrega,
            "ultimo_evento": eventos[0] if eventos else None
        }
        
    except Exception as e:
        logger.error(f"Erro ao processar resposta: {str(e)}")
        return {"success": False, "error": str(e), "codigo": codigo}


async def _rastrear_fallback(codigo: str) -> Dict[str, Any]:
    """
    Fallback para APIs públicas de rastreamento.
    Tenta múltiplas APIs em sequência.
    """
    # Lista de fallbacks a tentar em ordem
    fallback_apis = [
        _rastrear_seurastreio,
        _rastrear_linketrack,
    ]
    
    errors = []
    for api_func in fallback_apis:
        try:
            result = await api_func(codigo)
            if result.get('success'):
                return result
            errors.append(f"{api_func.__name__}: {result.get('error', 'falhou')}")
        except Exception as e:
            logger.warning(f"Fallback {api_func.__name__} falhou: {str(e)}")
            errors.append(f"{api_func.__name__}: {str(e)[:50]}")
            continue
    
    # Se todas as APIs falharem, retornar status de indisponibilidade
    return {
        "success": False, 
        "error": "APIs de rastreamento indisponíveis. Tente novamente mais tarde.",
        "codigo": codigo,
        "detalhes": errors,
        "rastreamento_manual": True  # Flag para indicar que o usuário pode rastrear manualmente no site dos Correios
    }


async def _rastrear_seurastreio(codigo: str) -> Dict[str, Any]:
    """
    Fallback usando API SeuRastreio.com.br (gratuita, sem autenticação).
    """
    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            response = await client.get(
                f"https://seurastreio.com.br/api/public/rastreio/{codigo}",
                headers={"Accept": "application/json"}
            )
            
            if response.status_code == 200:
                data = response.json()
                
                if data.get('status') == 'found' and data.get('ultimoEvento'):
                    ultimo = data.get('ultimoEvento', {})
                    status_desc = ultimo.get('descricao', '')
                    status_lower = status_desc.lower()
                    
                    entregue = any(d in status_lower for d in DESCRICOES_ENTREGA)
                    saiu_para_entrega = any(d in status_lower for d in DESCRICOES_SAIU_ENTREGA)
                    tentativa_entrega = any(d in status_lower for d in DESCRICOES_TENTATIVA)
                    
                    evento = {
                        "data": ultimo.get('data', ''),
                        "hora": ultimo.get('hora', ''),
                        "local": ultimo.get('local', ''),
                        "cidade": ultimo.get('cidade', ''),
                        "uf": ultimo.get('uf', ''),
                        "status": status_desc,
                        "tipo": '',
                        "subStatus": '',
                    }
                    
                    return {
                        "success": True,
                        "codigo": codigo,
                        "eventos": [evento],
                        "entregue": entregue,
                        "saiu_para_entrega": saiu_para_entrega,
                        "tentativa_entrega": tentativa_entrega,
                        "ultimo_evento": evento,
                        "fonte": "seurastreio",
                        "link_detalhes": data.get('linkDetalhesCompletos', '')
                    }
                elif data.get('status') == 'no_events':
                    return {
                        "success": True,
                        "codigo": codigo,
                        "eventos": [],
                        "entregue": False,
                        "saiu_para_entrega": False,
                        "tentativa_entrega": False,
                        "ultimo_evento": None,
                        "fonte": "seurastreio",
                        "mensagem": "Objeto postado, aguardando movimentação"
                    }
    except Exception as e:
        logger.warning(f"SeuRastreio API falhou: {str(e)}")
    
    return {"success": False, "error": "SeuRastreio indisponível", "codigo": codigo}


async def _rastrear_linketrack(codigo: str) -> Dict[str, Any]:
    """
    Fallback usando API LinkeTrack (gratuita, com credenciais de teste).
    """
    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            response = await client.get(
                f"https://api.linketrack.com/track/json",
                params={
                    "user": "teste",
                    "token": "1abcd00b2731640e886fb41a8a9671ad1434c599dbaa0a0de9a5aa619f29a83f",
                    "codigo": codigo
                },
                headers={"Accept": "application/json"}
            )
            
            if response.status_code == 200:
                data = response.json()
                eventos_raw = data.get('eventos', [])
                
                eventos = []
                entregue = False
                saiu_para_entrega = False
                tentativa_entrega = False
                
                for evento in eventos_raw:
                    status = evento.get('status', '')
                    status_lower = status.lower()
                    
                    if any(d in status_lower for d in DESCRICOES_ENTREGA):
                        entregue = True
                    if any(d in status_lower for d in DESCRICOES_SAIU_ENTREGA):
                        saiu_para_entrega = True
                    if any(d in status_lower for d in DESCRICOES_TENTATIVA):
                        tentativa_entrega = True
                    
                    eventos.append({
                        "data": evento.get('data', ''),
                        "hora": evento.get('hora', ''),
                        "local": evento.get('local', ''),
                        "cidade": evento.get('local', '').split(' - ')[0] if ' - ' in evento.get('local', '') else '',
                        "uf": evento.get('local', '').split(' - ')[-1] if ' - ' in evento.get('local', '') else '',
                        "status": status,
                        "tipo": '',
                        "subStatus": evento.get('subStatus', []),
                    })
                
                if eventos:
                    return {
                        "success": True,
                        "codigo": codigo,
                        "eventos": eventos,
                        "entregue": entregue,
                        "saiu_para_entrega": saiu_para_entrega,
                        "tentativa_entrega": tentativa_entrega,
                        "ultimo_evento": eventos[0] if eventos else None,
                        "fonte": "linketrack"
                    }
                    
    except Exception as e:
        logger.warning(f"LinkeTrack API falhou: {str(e)}")
    
    return {"success": False, "error": "LinkeTrack indisponível", "codigo": codigo}


def verificar_status_evento(eventos: List[Dict]) -> Dict[str, bool]:
    """
    Analisa lista de eventos e retorna flags de status.
    """
    result = {
        "entregue": False,
        "saiu_para_entrega": False,
        "tentativa_entrega": False,
        "em_transito": False,
        "deve_notificar": False,
        "tipo_notificacao": None
    }
    
    if not eventos:
        return result
    
    for evento in eventos:
        status = (evento.get('status', '') or evento.get('descricao', '')).lower()
        tipo = evento.get('tipo', '')
        
        # Verificar entrega
        if tipo in EVENTOS_ENTREGA or any(d in status for d in DESCRICOES_ENTREGA):
            result["entregue"] = True
            result["deve_notificar"] = True
            result["tipo_notificacao"] = "entrega"
            break
        
        # Verificar saiu para entrega
        if tipo in EVENTOS_SAIU_ENTREGA or any(d in status for d in DESCRICOES_SAIU_ENTREGA):
            result["saiu_para_entrega"] = True
            result["deve_notificar"] = True
            result["tipo_notificacao"] = "saiu_entrega"
        
        # Verificar tentativa
        if tipo in EVENTOS_TENTATIVA_ENTREGA or any(d in status for d in DESCRICOES_TENTATIVA):
            result["tentativa_entrega"] = True
            result["deve_notificar"] = True
            result["tipo_notificacao"] = "tentativa"
    
    # Se não entregue nem saiu, está em trânsito
    if not result["entregue"] and not result["saiu_para_entrega"]:
        result["em_transito"] = True
    
    return result
