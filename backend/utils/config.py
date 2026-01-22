"""
Configurações centralizadas do sistema FIEP OC
Re-exporta configurações de /app/backend/config.py
"""
from config import (
    db,
    client,
    logger,
    get_logger,
    LOT_ASSIGNMENTS,
    LOT_TO_OWNER,
    EMAIL_TO_OWNER,
    EXCLUDED_OCS_FROM_COMMISSION,
    COMMISSION_PERCENTAGE,
    TAX_PERCENTAGE,
    NON_ADMIN_RESPONSAVEIS,
    INITIAL_USERS,
    DEFAULT_PASSWORD,
    RESEND_API_KEY,
    SENDER_EMAIL,
    FRONTEND_URL,
    STATUS_COMPRADO_OU_ADIANTE,
    get_responsible_by_lot
)

__all__ = [
    'db',
    'client', 
    'logger',
    'get_logger',
    'LOT_ASSIGNMENTS',
    'LOT_TO_OWNER',
    'EMAIL_TO_OWNER',
    'EXCLUDED_OCS_FROM_COMMISSION',
    'COMMISSION_PERCENTAGE',
    'TAX_PERCENTAGE',
    'NON_ADMIN_RESPONSAVEIS',
    'INITIAL_USERS',
    'DEFAULT_PASSWORD',
    'RESEND_API_KEY',
    'SENDER_EMAIL',
    'FRONTEND_URL',
    'STATUS_COMPRADO_OU_ADIANTE',
    'get_responsible_by_lot'
]
