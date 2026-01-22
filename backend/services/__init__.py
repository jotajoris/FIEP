"""
Services - Lógica de negócio do sistema FIEP OC
"""
from .email_service import send_welcome_email
from .pdf_service import extract_oc_from_pdf, extract_data_entrega_from_pdf
from .estoque_service import (
    reverter_uso_estoque,
    atualizar_data_compra,
    calcular_lucro_item
)

__all__ = [
    'send_welcome_email',
    'extract_oc_from_pdf',
    'extract_data_entrega_from_pdf',
    'reverter_uso_estoque',
    'atualizar_data_compra',
    'calcular_lucro_item'
]
