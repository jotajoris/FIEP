"""
Modelos Pydantic para o sistema FIEP OC
"""
from pydantic import BaseModel, Field, ConfigDict, EmailStr
from typing import List, Optional, Dict
from datetime import datetime, timezone
from enum import Enum
import uuid


class UserRole(str, Enum):
    ADMIN = "admin"
    USER = "user"


class ItemStatus(str, Enum):
    PENDENTE = "pendente"
    COTADO = "cotado"
    COMPRADO = "comprado"
    EM_SEPARACAO = "em_separacao"
    PRONTO_ENVIO = "pronto_envio"
    EM_TRANSITO = "em_transito"
    ENTREGUE = "entregue"


class User(BaseModel):
    model_config = ConfigDict(extra="ignore")
    
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    email: EmailStr
    hashed_password: str
    role: UserRole
    owner_name: Optional[str] = None
    needs_password_change: bool = True
    reset_token: Optional[str] = None
    reset_token_expires: Optional[datetime] = None
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class UserCreate(BaseModel):
    email: EmailStr
    password: str
    role: UserRole
    owner_name: Optional[str] = None


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class LoginResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: dict


class ChangePasswordRequest(BaseModel):
    current_password: str
    new_password: str


class ResetPasswordRequest(BaseModel):
    email: EmailStr


class ConfirmResetPasswordRequest(BaseModel):
    token: str
    new_password: str


class UpdateProfileRequest(BaseModel):
    owner_name: str


class ReferenceItem(BaseModel):
    model_config = ConfigDict(extra="ignore")
    
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    lote: str
    lot_number: int
    regiao: str
    descricao: str
    unidade: str
    marca_modelo: str
    codigo_item: str
    responsavel: str
    preco_venda_unitario: Optional[float] = None
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class FonteCompra(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    quantidade: int
    preco_unitario: float
    frete: float = 0
    link: str = ""
    fornecedor: str = ""


class Notificacao(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    tipo: str
    titulo: str
    numero_oc: str
    codigo_item: str
    descricao_item: str
    lida: bool = False
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class NotaFiscalDoc(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    filename: str
    content_type: str
    file_data: str
    ncm: Optional[str] = None
    uploaded_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    uploaded_by: Optional[str] = None


class POItem(BaseModel):
    codigo_item: str
    descricao: str = ""
    quantidade: int
    unidade: str = "UN"
    marca_modelo: str = ""
    lote: str = ""
    lot_number: int = 0
    regiao: str = ""
    endereco_entrega: str = ""
    responsavel: str = ""
    status: ItemStatus = ItemStatus.PENDENTE
    ncm: Optional[str] = None  # Código NCM de 8 dígitos (extraído da OC)
    link_compra: Optional[str] = None
    preco_compra: Optional[float] = None
    preco_venda: Optional[float] = None
    imposto: Optional[float] = None
    frete_compra: Optional[float] = None
    frete_envio: Optional[float] = None
    lucro_liquido: Optional[float] = None
    fontes_compra: List[FonteCompra] = []
    quantidade_comprada: Optional[int] = None  # Quantidade efetivamente comprada (pode ser maior que a necessária)
    data_cotacao: Optional[datetime] = None
    data_compra: Optional[datetime] = None
    data_envio: Optional[datetime] = None
    data_entrega: Optional[datetime] = None
    codigo_rastreio: Optional[str] = None
    rastreio_eventos: List[dict] = []
    notas_fiscais_fornecedor: List[NotaFiscalDoc] = []
    nota_fiscal_revenda: Optional[NotaFiscalDoc] = None
    nf_emitida_pronto_despacho: bool = False
    no_carrinho: bool = False  # Checkbox para marcar itens no carrinho
    observacao: Optional[str] = None  # Campo de observação visível para todos


class PurchaseOrder(BaseModel):
    model_config = ConfigDict(extra="ignore")
    
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    numero_oc: str
    cliente: str = "FIEP"
    cnpj_requisitante: str = ""
    data_entrega: Optional[str] = None  # Data de entrega no formato YYYY-MM-DD
    endereco_entrega: Optional[str] = ""  # Endereço de entrega
    items: List[POItem]
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    created_by: Optional[str] = None


class PurchaseOrderCreate(BaseModel):
    numero_oc: str
    data_entrega: Optional[str] = None  # Data de entrega no formato YYYY-MM-DD
    endereco_entrega: Optional[str] = None  # Endereço de entrega
    items: List[POItem]
    created_by: Optional[str] = None


class ItemStatusUpdate(BaseModel):
    status: ItemStatus
    link_compra: Optional[str] = None
    preco_compra: Optional[float] = None
    preco_venda: Optional[float] = None
    imposto: Optional[float] = None
    frete_compra: Optional[float] = None
    frete_envio: Optional[float] = None
    fontes_compra: Optional[List[FonteCompra]] = None
    codigo_rastreio: Optional[str] = None
    no_carrinho: Optional[bool] = None  # Checkbox para marcar itens no carrinho
    observacao: Optional[str] = None  # Campo de observação


class ItemFullUpdate(BaseModel):
    descricao: Optional[str] = None
    quantidade: Optional[int] = None
    unidade: Optional[str] = None
    responsavel: Optional[str] = None
    lote: Optional[str] = None
    marca_modelo: Optional[str] = None
    status: Optional[str] = None
    preco_venda: Optional[float] = None
    no_carrinho: Optional[bool] = None
    observacao: Optional[str] = None
    quantidade_comprada: Optional[int] = None  # Quantidade efetivamente comprada (pode ser maior que a necessária)


class ResponsavelBreakdown(BaseModel):
    """Breakdown de itens por status para cada responsável"""
    total: int = 0
    pendente: int = 0
    cotado: int = 0
    comprado: int = 0
    em_separacao: int = 0
    em_transito: int = 0
    entregue: int = 0


class DashboardStats(BaseModel):
    total_ocs: int
    total_items: int
    items_pendentes: int
    items_cotados: int
    items_comprados: int
    items_em_separacao: int
    items_pronto_envio: int
    items_em_transito: int
    items_entregues: int
    items_por_responsavel: Dict[str, ResponsavelBreakdown]


class AdminSummary(BaseModel):
    numero_oc: str
    codigo_item: str
    nome_item: str
    quem_cotou: str
    preco_compra: Optional[float]
    preco_venda: Optional[float]
    imposto: Optional[float]
    frete_compra: Optional[float]
    frete_envio: Optional[float]
    lucro_liquido: Optional[float]
    status: str


class CommissionPayment(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    owner_name: str
    valor_pago: float
    percentual_comissao: float
    valor_venda_total: float
    itens_pagos: List[dict]
    data_pagamento: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    observacao: Optional[str] = None
    created_by: Optional[str] = None


class CommissionPaymentCreate(BaseModel):
    owner_name: str
    valor_pago: float
    percentual_comissao: float
    valor_venda_total: float
    itens_pagos: List[dict]
    observacao: Optional[str] = None


class CommissionPaymentUpdate(BaseModel):
    valor_pago: Optional[float] = None
    observacao: Optional[str] = None
