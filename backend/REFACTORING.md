# Arquitetura de Refatoração do Backend FIEP OC

## Estado Atual (Após Refatoração Parcial - 27/01/2026)

O arquivo `server.py` possui ~6461 linhas (reduzido de ~6841 linhas).
Rotas de autenticação e rastreamento foram extraídas e **estão em uso**.

## Estrutura de Diretórios Atual

```
/app/backend/
├── server.py                 # Entry point - config, routers e rotas restantes (~6461 linhas)
├── config.py                 # ✅ Configurações centralizadas
├── auth.py                   # ✅ Autenticação JWT
├── models/
│   ├── __init__.py           # ✅ Re-exports
│   └── schemas.py            # ✅ Pydantic models
├── routes/
│   ├── __init__.py           # ✅ Package init
│   ├── auth_routes.py        # ✅ Rotas de autenticação (EM USO)
│   ├── item_routes.py        # 🔄 Criado mas NÃO em uso (duplicado em server.py)
│   ├── rastreio_routes.py    # ✅ Rotas de rastreamento (EM USO)
│   ├── po_routes.py          # 🔄 Pendente
│   ├── estoque_routes.py     # 🔄 Pendente
│   ├── planilha_routes.py    # 🔄 Pendente
│   ├── nf_routes.py          # 🔄 Pendente
│   ├── admin_routes.py       # 🔄 Pendente
│   └── notificacao_routes.py # 🔄 Pendente
├── services/
│   ├── __init__.py           # ✅ Exports
│   ├── email_service.py      # ✅ Serviço de envio de emails
│   ├── pdf_service.py        # ✅ Extração de PDFs
│   ├── estoque_service.py    # ✅ Lógica de estoque
│   └── rastreio_service.py   # 🔄 Pendente (função buscar_rastreio_api)
└── utils/
    ├── __init__.py
    ├── config.py             # ✅ Re-exports de config.py
    └── database.py           # ✅ Conexão MongoDB
```

## Progresso da Refatoração

### ✅ Concluído (27/01/2026)
- auth_routes.py incluído no server.py via `api_router.include_router(auth_router)`
- rastreio_routes.py incluído no server.py via `api_router.include_router(rastreio_router)`
- notificacao_routes.py **NOVO** - criado e incluído no server.py
- Rotas duplicadas de autenticação removidas do server.py (~180 linhas)
- Rotas duplicadas de rastreamento removidas do server.py (~200 linhas)
- Rotas duplicadas de notificações removidas do server.py (~40 linhas)
- **Total de linhas removidas: ~420 linhas (de 6841 para 6421)**

### 🔄 Próximos Passos
1. **item_routes.py**: Já existe mas não está em uso. Incluir no server.py e remover duplicatas.
2. **po_routes.py**: Extrair rotas de Purchase Orders (~1500 linhas)
3. **estoque_routes.py**: Extrair rotas de estoque (~800 linhas)
4. **notificacao_routes.py**: Extrair rotas de notificações (~150 linhas)

## Módulos a Extrair do server.py

### 1. po_routes.py (~1500 linhas)
- `POST /purchase-orders/preview-pdf`
- `POST /purchase-orders/upload-pdf`
- `POST /purchase-orders/upload-multiple-pdfs`
- `GET /purchase-orders/check-duplicate/{numero_oc}`
- `POST /purchase-orders` (create)
- `GET /purchase-orders` (list)
- `GET /purchase-orders/list/simple`
- `GET /purchase-orders/{po_id}`
- `DELETE /purchase-orders/{po_id}`
- `PUT /purchase-orders/{po_id}`
- `PATCH /purchase-orders/{po_id}/data-entrega`

### 2. estoque_routes.py (~800 linhas)
- `GET /estoque`
- `GET /estoque/mapa`
- `GET /estoque/detalhes/{codigo_item}`
- `POST /estoque/usar`
- `PATCH /estoque/ajustar`
- `DELETE /estoque/limpar/{po_id}/{item_index}`
- `POST /estoque/resetar-uso/{po_id}/{item_index}`
- `POST /admin/limpar-dados-estoque-inconsistentes`

### 3. planilha_routes.py (~400 linhas)
- `GET /planilha-itens`
- `GET /planilha-contrato`
- `GET /limites-contrato`
- `GET /limites-contrato/mapa`
- `POST /admin/importar-limites-contrato`

### 4. nf_routes.py (~600 linhas)
- Rotas de Notas Fiscais de Fornecedor
- Rotas de NF de Venda da OC
- Upload de arquivos XML/PDF
- Extração de NCM

### 5. admin_routes.py (~500 linhas)
- `GET /admin/summary`
- `GET /backup/export`
- `POST /backup/restore`
- `POST /backup/restore-data`
- `GET/POST/PUT/DELETE /admin/commission-payments`
- `POST /purchase-orders/fix-responsaveis`
- `POST /purchase-orders/normalize-fornecedores`

### 6. notificacao_routes.py (~150 linhas)
- `GET /notificacoes`
- `PATCH /notificacoes/{id}/marcar-lida`
- `POST /notificacoes/marcar-todas-lidas`

## Dependências Entre Módulos

```
server.py
  └── routes/
        ├── auth_routes.py → auth.py, services/email_service.py
        ├── po_routes.py → services/pdf_service.py, config.py
        ├── item_routes.py → config.py (TAX_PERCENTAGE)
        ├── rastreio_routes.py → (httpx)
        ├── estoque_routes.py → reverter_uso_estoque (função)
        └── planilha_routes.py → config.py
```

## Funções Helper a Extrair para services/

### estoque_service.py
- `reverter_uso_estoque(item, po_id, numero_oc)` - Reverte uso de estoque quando item volta para pendente

### pdf_service.py (já existe)
- `extract_oc_from_pdf(pdf_bytes)` - Extrai dados de OC do PDF
- `extract_data_entrega_from_pdf(pdf_bytes)` - Extrai data de entrega do PDF

## Prioridade de Refatoração

1. **Alta** - Módulos já implementados precisam ser usados no server.py
2. **Média** - po_routes.py e estoque_routes.py (maior volume de código)
3. **Baixa** - admin_routes.py, nf_routes.py (menos alterados)

## Como Integrar Novos Módulos

```python
# server.py
from routes.auth_routes import router as auth_router
from routes.item_routes import router as item_router
from routes.rastreio_routes import router as rastreio_router
# ...

api_router.include_router(auth_router)
api_router.include_router(item_router)
api_router.include_router(rastreio_router)
```

## Notas Importantes

1. Os módulos em `routes/` já existentes (auth_routes.py, item_routes.py) NÃO estão sendo usados no server.py atual
2. O server.py contém código duplicado com os módulos
3. A função `reverter_uso_estoque` precisa ser movida para um service antes de ser importada em estoque_routes.py
4. APScheduler (background tasks) deve permanecer em server.py

---
Última atualização: 22/01/2026
