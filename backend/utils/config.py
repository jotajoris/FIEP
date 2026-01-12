"""
Configuration and constants for the FIEP OC Management System
"""

# Mapeamento de lotes para responsáveis
LOT_ASSIGNMENTS = {
    'Maria': list(range(1, 13)) + list(range(43, 54)),
    'Mateus': list(range(13, 21)) + list(range(54, 67)),
    'João': list(range(21, 32)) + list(range(67, 80)),
    'Mylena': list(range(80, 98)),
    'Fabio': list(range(32, 43))
}

# Criar reverse mapping (lote -> responsável)
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

# OCs excluídas do cálculo de comissão (cotadas por admin)
EXCLUDED_OCS_FROM_COMMISSION = ['OC-2.118938', 'OC-2.118941']

# Percentual de comissão
COMMISSION_PERCENTAGE = 1.5

# Percentual de imposto
TAX_PERCENTAGE = 11.0

# Responsáveis não-admin (recebem comissão)
NON_ADMIN_RESPONSAVEIS = ['Maria', 'Mylena', 'Fabio']

# Usuários iniciais do sistema
INITIAL_USERS = [
    # Admins (com owner_name associado)
    {"email": "projetos.onsolucoes@gmail.com", "role": "admin", "owner_name": "João"},
    {"email": "comercial.onsolucoes@gmail.com", "role": "admin", "owner_name": "Mateus"},
    {"email": "gerencia.onsolucoes@gmail.com", "role": "admin", "owner_name": "Roberto"},
    # Users
    {"email": "maria.onsolucoes@gmail.com", "role": "user", "owner_name": "Maria"},
    {"email": "mylena.onsolucoes@gmail.com", "role": "user", "owner_name": "Mylena"},
    {"email": "fabioonsolucoes@gmail.com", "role": "user", "owner_name": "Fabio"},
]

DEFAULT_PASSWORD = "on123456"


def get_responsible_by_lot(lot_number: int) -> str:
    """Retorna o responsável baseado no número do lote"""
    return LOT_TO_OWNER.get(lot_number, "Não atribuído")
