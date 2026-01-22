"""
Configurações e constantes do sistema FIEP OC
"""
import os
import logging
from pathlib import Path
from dotenv import load_dotenv
from motor.motor_asyncio import AsyncIOMotorClient

# Configurar logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# Carregar variáveis de ambiente
ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

# MongoDB
mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

# Resend (email)
RESEND_API_KEY = os.environ.get('RESEND_API_KEY', '')
SENDER_EMAIL = os.environ.get('SENDER_EMAIL', 'onboarding@resend.dev')
FRONTEND_URL = os.environ.get('FRONTEND_URL', 'http://localhost:3000')

# Mapeamento de lotes para responsáveis
LOT_ASSIGNMENTS = {
    'Maria': list(range(1, 13)) + list(range(43, 54)),
    'Mateus': list(range(13, 21)) + list(range(54, 67)),
    'João': list(range(21, 32)) + list(range(67, 80)),
    'Mylena': list(range(80, 98)),
    'Fabio': list(range(32, 43))
}

# Reverse mapping (lote -> responsável)
LOT_TO_OWNER = {}
for owner, lots in LOT_ASSIGNMENTS.items():
    for lot in lots:
        LOT_TO_OWNER[lot] = owner

# Email to owner name mapping
EMAIL_TO_OWNER = {
    'maria.onsolucoes@gmail.com': 'Maria',
    'mylena.onsolucoes@gmail.com': 'Mylena',
    'fabioonsolucoes@gmail.com': 'Fabio'
}

# OCs excluídas do cálculo de comissão
EXCLUDED_OCS_FROM_COMMISSION = ['OC-2.118938', 'OC-2.118941']

# Percentuais
COMMISSION_PERCENTAGE = 1.5
TAX_PERCENTAGE = 11.0

# Usuários não-admin que recebem comissão
NON_ADMIN_RESPONSAVEIS = ['Maria', 'Mylena', 'Fabio']

# Usuários iniciais
INITIAL_USERS = [
    {"email": "projetos.onsolucoes@gmail.com", "role": "admin", "owner_name": "João"},
    {"email": "comercial.onsolucoes@gmail.com", "role": "admin", "owner_name": "Mateus"},
    {"email": "gerencia.onsolucoes@gmail.com", "role": "admin", "owner_name": "Roberto"},
    {"email": "maria.onsolucoes@gmail.com", "role": "user", "owner_name": "Maria"},
    {"email": "mylena.onsolucoes@gmail.com", "role": "user", "owner_name": "Mylena"},
    {"email": "fabioonsolucoes@gmail.com", "role": "user", "owner_name": "Fabio"},
]

DEFAULT_PASSWORD = "on123456"

# Status de itens que são considerados "comprados"
STATUS_COMPRADO_OU_ADIANTE = ['comprado', 'em_separacao', 'em_transito', 'entregue']


def get_responsible_by_lot(lot_number: int) -> str:
    """Retorna o responsável baseado no número do lote"""
    return LOT_TO_OWNER.get(lot_number, "Não atribuído")


def get_logger(name: str = __name__):
    """Retorna um logger configurado"""
    return logging.getLogger(name)
