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
- [x] Status: Pendente → Cotado → Comprado → Em Separação → **Pronto p/ Envio** → Em Trânsito → Entregue
- [x] Atribuição de responsáveis
- [x] Histórico de cotações para itens pendentes
- [x] Campo "Observação" por item
- [x] Upload de imagens por código de item
- [x] Agrupamento de itens por código (pendentes/cotados)
- [x] Compra parcial (split de quantidades)
- [x] Envio parcial de itens
- [x] Agrupar itens dentro da mesma OC (Em Separação) ✅

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

### 2026-01-31 (Sessão atual - Continuação 6)
- ✅ **CORREÇÃO CRÍTICA: Detecção de postagem real nos Correios**
  - Problema: Sistema marcava itens como "em trânsito" mesmo quando só a etiqueta foi emitida
  - Solução: Nova lógica que diferencia "etiqueta emitida" de "objeto postado"
  - Indicadores de postagem real: "objeto postado", "objeto recebido", "encaminhado", etc.
  - Indicadores ignorados: "etiqueta emitida", "objeto criado eletronicamente", "pré-postagem", etc.
  - 4 itens incorretamente marcados foram revertidos para "pronto_envio"
  - Notificações falsas de "Item Postado" foram marcadas como lidas

- ✅ **Scheduler de rastreio atualizado**
  - Antes: 1x ao dia às 15h Brasília
  - Agora: 1x por hora (a cada hora cheia: 00:00, 01:00, ..., 23:00)
  - Maior frequência de atualização para detectar entregas mais rapidamente

- ✅ **Correção de imagens de itens**
  - Padronizado formato de armazenamento (base64 separado no MongoDB)
  - Migradas imagens legadas (disco e data URL) para novo formato
  - Headers de cache adicionados para melhor performance
  - Itens corrigidos: 089981, 113690, 114850, 114647

- ✅ **OTIMIZAÇÃO DE PERFORMANCE - Página "Em Separação"**
  - Novo endpoint: `/api/items/by-status/{status}` com agregação MongoDB
  - Antes: 10MB de dados, ~0.27s de carregamento
  - Depois: 220KB de dados, ~0.06s de carregamento
  - Melhoria: 4x mais rápido, 46x menos dados transferidos

- ✅ **Dados Bancários Editáveis (Dados Adicionais da NF)**
  - Novo endpoint: `/api/purchase-orders/{po_id}/dados-bancarios` (GET/PATCH)
  - Novo endpoint: `/api/dados-bancarios/todas-ocs` (GET)
  - Dados são salvos permanentemente no banco por OC
  - Funciona independente de haver ou não itens pendentes

- ✅ **Notas Fiscais no Admin - Correção**
  - Agora mostra TODAS as NFs: 10 de Compra (Fornecedor) + 35 de Venda (ON)
  - NFs de Venda no nível da OC agora são listadas corretamente
  - Total: 45 NFs disponíveis para download

- ✅ **Download de PDF da OC**
  - Novo endpoint: `/api/purchase-orders/{po_id}/download-pdf`
  - Novo endpoint: `/api/purchase-orders/{po_id}/has-pdf`
  - PDF é salvo automaticamente ao criar OC ou atualizar com PDF
  - Botão "Download PDF" (verde) aparece na página da OC quando disponível

### 2025-01-30 (Sessão atual - Continuação 5)
- ✅ **Bug Fix: Frontend quebrado (página em branco)**
  - Corrigido erro de sintaxe em `Estoque.js` - bloco `try` sem `catch/finally`
  - Removido `}` extra na linha 240 que fechava a função prematuramente
  - Dashboard e todas as páginas voltaram a funcionar normalmente

- ✅ **Testado e validado:**
  - Dashboard carregando com todas as estatísticas
  - Página Estoque funcionando com listagem e paginação
  - Adicionar quantidade a item existente no estoque funcionando via API

### 2025-01-30 (Sessão anterior - Continuação 4)
- ✅ **Página de Estoque melhorada:**
  - Adicionada coluna de IMAGEM com miniatura do item (60x60px)
  - Miniaturas clicáveis para ver imagem em tamanho real
  - Botão de upload de foto diretamente na tabela
  - Botão de excluir imagem (X vermelho)
  - Paginação com opções: 5, 10, 15, 20, Tudo
  - Navegação entre páginas com botões "Anterior" e "Próximo"
  
- ✅ **Adicionar itens manualmente ao estoque:**
  - Modal para buscar item por código
  - Se item já existe no estoque: mostra quantidade atual e permite adicionar mais
  - Se item não existe: permite criar entrada manual com descrição e foto
  - Campos: Quantidade, Preço unitário, Fornecedor
  - Upload de foto diretamente no modal
  - Endpoints backend criados: `/api/estoque/adicionar-manual` e `/api/estoque/adicionar-quantidade`

### 2025-01-30 (Sessão atual - Continuação 3)
- ✅ **"Dados Adicionais da NF" movido para header da OC:**
  - Agora aparece no card da OC (área amarela) em vez de dentro do item
  - Mostra: Endereço, número OC, Dados Bancários (Banco Itaú, Ag, Cc, PIX)
  - Botão "📋 Copiar" para copiar todos os dados
  
- ✅ **Botão "Edit" no endereço de entrega:**
  - Endereço editável inline no header da OC
  - Campos de edição aparecem ao clicar em "✏️ Edit"
  - Botões "✓ Salvar" e "✕ Cancelar"

- ✅ **Foto do item maior com funcionalidades:**
  - Tamanho aumentado de 40px para 60px
  - Drag-and-drop para adicionar imagem
  - Click para selecionar arquivo
  - Botão de excluir quando tem foto
  - Funciona em "Em Separação" e "Pronto para Envio"

### 2025-01-30 (Sessão atual - Continuação 2)
- ✅ **Reorganização da página "Em Separação":**
  - Movidos "📍 Endereço de Entrega" e "📝 Dados Adicionais da NF" para o card da OC
  - Seção de NF no item simplificada para mostrar apenas "NF de Compra"
  - Adicionados emojis identificadores nos checkboxes: 📄 (NF), 🚚 (Frete), 🔄 (Status)
  - Foto do item restaurada na visualização
  - Removidos: checkbox "NF Emitida/Pronto para Despacho" e seção "Mover para Pronto p/ Envio"
  - Removido campo "Quantidade Efetivamente Comprada" do formulário de edição

- ✅ **Nova página "Pronto para Envio" reorganizada:**
  - Agora agrupa itens por OC (similar a "Em Separação")
  - Mostra: código, quantidade, descrição, checkboxes para frete e status
  - Seções de NF de Venda (download), Frete/Rastreio, e Mudar Status em Massa
  - Visualização simplificada dos itens com foto

### 2025-01-30 (Sessão atual - Continuação)
- ✅ **BUG FIX CRÍTICO: Edição de itens em "Em Separação" restaurada**
  - **Problema:** Após adicionar agrupamento automático, os itens não podiam ser editados
  - **Causa:** O código que renderiza itens agrupados não verificava `editingItem` para mostrar o formulário de edição
  - **Solução:** Adicionada verificação condicional - quando um item está sendo editado, exibe `renderEditForm(item)` em vez da visualização compacta
  - **Arquivo modificado:** `/app/frontend/src/pages/ItemsByStatus.js` (linha ~4228)
  - Botões "Cancelar" e "Salvar" funcionando corretamente
  - Formulário completo com todos os campos (Status, Preço, NF, Observação, Locais de Compra, etc.)

### 2025-01-30 (Sessão anterior)
- ✅ **Agrupamento automático por código em PODetails.js - IMPLEMENTADO**
  - Itens com mesmo código são agrupados automaticamente
  - Quantidade no formato "20+20 = 40 UN" em laranja
  - Badge "2x" para indicar múltiplos registros

- ✅ **Novo status "PRONTO P/ ENVIO" - IMPLEMENTADO**
  - Adicionado novo status entre "Em Separação" e "Em Trânsito"
  - Card no Dashboard com cor verde-água (#14b8a6)
  - Página dedicada em `/items/status/pronto_envio`
  - Dropdown de status atualizado em todas as páginas
  - Cores e labels configurados em itemHelpers.js

- ✅ **Dashboard reorganizado**
  - Removido card "Total Itens"
  - Total de itens agora aparece no título "Itens por Responsável (Total: X itens)"
  - Breakdown por responsável atualizado com novo status

### 2025-01-29 (Sessão anterior)
- ✅ **Verificada funcionalidade "Agrupar por Código" em Pendentes/Cotados - COMPLETA**

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
- [x] ~~Bug: Edição de itens quebrada em "Em Separação"~~ ✅ CORRIGIDO
- [x] ~~Implementar "Agrupar por Código" na página Em Separação (dentro da mesma OC)~~ ✅ IMPLEMENTADO

### P1 (Alta Prioridade)
- [x] ~~Completar "Dados Adicionais da NF" editável (modal + backend endpoint)~~ ✅
- [ ] Remover código duplicado do `server.py` (refatoração backend)
- [ ] Integrar componentes restantes em `ItemsByStatus.js` (refatoração frontend)

### P2 (Média Prioridade)
- [ ] Corrigir bug: editar item duplicado abre todos os itens (recorrente)

### P3 (Backlog)
- [ ] Implementar API Correios para cálculo de frete (Preços e Prazos)
- [ ] Download de relatório Excel da página "Estoque"
- [ ] Botão "Criar OC" na página Planilha de Contrato
- [ ] Estender visualização agrupada para outras páginas

## Credenciais de Teste
- **Admin (João):**
  - Email: `projetos.onsolucoes@gmail.com`
  - Senha: `on123456`
