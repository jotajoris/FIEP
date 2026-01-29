# FIEP - Gestão de Ordens de Compra (OCs)

## Visão Geral
Sistema web para gerenciamento de ordens de compra (OCs) para o cliente FIEP.

## Stack Técnica
- **Frontend:** React + TailwindCSS
- **Backend:** FastAPI (Python)
- **Database:** MongoDB
- **Integrações:** Resend (emails), Correios API (rastreamento), PyMuPDF/Tesseract (OCR)

## Funcionalidades Principais

### Gerenciamento de OCs
- [x] Criar OCs manualmente ou via upload de PDF (single/batch)
- [x] Drag-and-drop para upload de PDFs
- [x] Extração automática de dados via OCR (PDFs escaneados)
- [x] Edição de OCs (admin only)
- [x] Atualização segura de OC via re-upload de PDF

### Gerenciamento de Itens
- [x] Status: Pendente → Cotado → Comprado → Em Separação → Em Trânsito → Entregue
- [x] Atribuição de responsáveis
- [x] Histórico de cotações para itens pendentes
- [x] Campo "Observação" por item
- [x] Upload de imagens por código de item
- [x] Agrupamento de itens por código (pendentes/cotados)
- [x] Compra parcial (split de quantidades)
- [x] Envio parcial de itens
- [ ] Agrupar itens dentro da mesma OC (Em Separação) - **EM PROGRESSO**

### Notas Fiscais
- [x] Upload de NF de Venda (XML/PDF)
- [x] Extração automática de NCM
- [x] Detecção de NF duplicada
- [x] Download em lote

### Rastreamento
- [x] Integração com API Correios
- [x] Atualização automática de status
- [x] Códigos de rastreio em massa
- [x] Notificações para admins

### Estoque
- [x] Página de estoque para itens sobressalentes
- [x] "Usar do Estoque" para itens pendentes
- [x] Edição/exclusão de entradas de estoque (admin)

### Dashboard
- [x] Busca avançada (código, descrição, marca/modelo)
- [x] Popup de resumo com agrupamento por status
- [x] Filtros e ações em lote
- [x] Métricas financeiras
- [x] Formato monetário brasileiro (R$)

### Usuários
- [x] Dois roles: admin e user
- [x] Login/Logout
- [x] "Esqueci minha senha"
- [x] Edição de perfil

## Arquitetura de Arquivos

```
/app
├── backend/
│   ├── routes/
│   │   ├── admin_routes.py
│   │   ├── auth_routes.py
│   │   ├── backup_routes.py
│   │   ├── dashboard_routes.py
│   │   ├── estoque_routes.py
│   │   ├── fornecedores_routes.py
│   │   └── limites_routes.py
│   ├── models/schemas.py
│   └── server.py
└── frontend/
    └── src/
        ├── components/
        │   ├── ItemsByStatus/
        │   ├── SearchSummaryPopup.jsx
        │   └── ui/
        ├── hooks/
        └── pages/
            ├── Dashboard.js
            ├── ItemsByStatus.js
            ├── PODetails.js
            └── ...
```

## Changelog Recente

### 2025-01-29 (Sessão atual)
- ✅ **Verificada funcionalidade "Agrupar por Código" em Pendentes/Cotados - COMPLETA**
  - Toggle funciona corretamente em Pendentes (234 grupos) e Cotados (3 grupos)
  - Visualização agrupada mostra itens de diferentes OCs com mesmo código
  - Badges: quantidade de OCs, total, contrato, estoque disponível
  - Expansão de grupos com detalhes por OC
  - Botões "Cotar Todos" / "Comprar Todos" funcionando
  - Edição em grupo e individual implementadas
  - Compra parcial disponível na visualização agrupada

- ✅ **Agrupamento AUTOMÁTICO por código na página "Em Separação" - IMPLEMENTADO**
  - Itens com mesmo código dentro da mesma OC são agrupados automaticamente (sem botão)
  - Quantidade exibida no formato **"20+20 = 40"** quando há múltiplos registros
  - Cards de itens agrupados têm fundo **laranja** (#fff7ed) e borda laranja (#f97316)
  - Badge laranja com "2x" indicando número de registros agrupados
  - Botões de seleção em massa (NF, Frete, Status) disponíveis para grupos
  - Removido botão "Agrupar por Código" - agora é automático

### 2025-01-29 (Sessão anterior)
- ✅ Corrigido erro de sintaxe em `ItemsByStatus.js` (comentários JSX, fechamento de IIFE)
- ✅ Corrigido referência `handleEditClick` → `startEdit`
- ✅ Corrigido warnings ESLint em 5 arquivos (useEffect dependencies)
- ✅ Build do frontend compilando com sucesso

### Sessões Anteriores
- ✅ Popups de pesquisa avançada no Dashboard
- ✅ Correção do bug do Google Translate
- ✅ Correção dos avisos de acessibilidade
- ✅ Início da refatoração do backend e frontend

## Tarefas Pendentes

### P0 (Crítico)
- [x] ~~Finalizar "Agrupar por Código" para Pendentes/Cotados~~ ✅ COMPLETO
- [ ] Implementar "Agrupar por Código" na página Em Separação (dentro da mesma OC)

### P1 (Alta Prioridade)
- [ ] Remover código duplicado do `server.py` (refatoração backend)
- [ ] Integrar componentes restantes em `ItemsByStatus.js` (refatoração frontend)

### P2 (Média Prioridade)
- [ ] Corrigir bug: editar item duplicado abre todos os itens

### P3 (Backlog)
- [ ] Botão "Criar OC" na página Planilha de Contrato
- [ ] Estender visualização agrupada para outras páginas

## Credenciais de Teste
- **Admin (João):**
  - Email: `projetos.onsolucoes@gmail.com`
  - Senha: `on123456`
