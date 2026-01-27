# FIEP - Sistema de Gestão de Ordens de Compra (OCs)

## Descrição do Projeto
Plataforma web para gerenciamento de ordens de compra (OCs) do cliente FIEP.

## Requisitos Principais
1. **Criação de OCs** - Manual ou via upload de PDF
2. **Distribuição automática** - Itens distribuídos para responsáveis baseado em lotes
3. **Rastreamento de status** - Pendente, Cotado, Comprado, Em Separação, Em Trânsito, Entregue
4. **Controle de acesso** - Roles: admin e user
5. **Cálculo financeiro** - Preços, impostos, fretes e lucro líquido

## Usuários do Sistema
### Admins
- projetos.onsolucoes@gmail.com (João)
- comercial.onsolucoes@gmail.com (Mateus)
- gerencia.onsolucoes@gmail.com (Roberto)

### Usuários (Cotadores)
- Maria (maria.onsolucoes@gmail.com) - Lotes 1-12, 43-53
- Mylena (mylena.onsolucoes@gmail.com) - Lotes 80-97
- Fabio (fabioonsolucoes@gmail.com) - Lotes 32-42

**Senha padrão:** on123456

## Versão Atual: 3.3.2 (27/01/2026)

### ✏️ Mudança Manual de Status em "Em Trânsito" (27/01/2026)
- ✅ **Botão "Mudar Status"** adicionado ao componente `RastreioItemCard.jsx`
- ✅ **Menu dropdown** com 3 opções:
  - ✅ Marcar como Entregue
  - 📦 Voltar p/ Em Separação
  - 🛒 Voltar p/ Comprado
- ✅ **Função `mudarStatusItemManual`** criada em `ItemsByStatus.js` para processar a mudança
- ✅ **Disponível apenas para admins**
- ✅ **Útil para:** Casos onde a API dos Correios não atualiza automaticamente

### 🐛 Correção de Bugs P0 (27/01/2026)
- ✅ **API Correios - Rastreamento melhorado**:
  - Detecção automática quando objeto não pertence ao contrato (erro SRO-009)
  - Fallback para APIs públicas: SeuRastreio, LinkeTrack
  - Quando todas APIs falham, retorna `rastreamento_manual=true` com link direto para consulta nos Correios
  - Mensagem clara: "APIs de rastreamento indisponíveis. Tente novamente mais tarde."
- ✅ **Notas Fiscais no Admin Panel** - Verificado funcionando:
  - Endpoint `/api/admin/notas-fiscais` retorna corretamente NFs de compra e venda
  - Testes automatizados confirmando funcionamento (14/14 passaram)
- ✅ **RastreioItemCard.jsx atualizado**:
  - Exibe link para consulta manual nos Correios quando não há eventos
  - UI melhorada para casos de API indisponível

### 📦 API Correios - Rastreamento Automático (27/01/2026)
- ✅ **Integração com API oficial dos Correios** implementada:
  - Autenticação OAuth com token Bearer
  - Credenciais configuradas no `.env` (CNPJ, Token, Contrato, Cartão Postagem)
  - Cache de token para evitar requisições desnecessárias
  - Fallback para API pública se credenciais falharem
- ✅ **Verificação automática 1x ao dia** (job em background):
  - Consulta todos os itens "Em Trânsito"
  - Atualiza eventos de rastreio
  - Move automaticamente para "Entregue" quando detectar entrega
- ✅ **Notificações automáticas** para admins:
  - 🚚 "Saiu para Entrega" - quando o objeto sai para entrega
  - ⚠️ "Tentativa de Entrega" - quando há tentativa sem sucesso
  - ✅ "Item Entregue" - quando o objeto é entregue
- ✅ **Endpoint manual** `/api/rastreio/verificar-todos` (admin only) para forçar verificação
- ✅ **Arquivo criado**: `/app/backend/services/correios_service.py`

### 📦 Código de Rastreio em Lote (Em Trânsito) - 27/01/2026
- ✅ **Funcionalidade de rastreio em lote** adicionada à página "Em Trânsito":
  - Seleção individual de itens via checkbox
  - "Selecionar Todos" para selecionar toda a OC
  - Campo para inserir código de rastreio
  - Botão "Aplicar em X itens" para atualizar todos selecionados
- ✅ **Página "Em Trânsito" reformulada** para usar a mesma visualização por OC que "Em Separação"
- ✅ **Novo componente criado**: `RastreioLoteForm.jsx`
- ✅ **Rotas e endpoints existentes reutilizados**: `/api/purchase-orders/{po_id}/rastreio-multiplo`

### 🔄 Refatoração Frontend - Fase 1 e 2 (27/01/2026)
- ✅ **Componentes extraídos de `ItemsByStatus.js`**:
  - `components/items/DataEntregaBadge.jsx` - Badge de data de entrega com contagem regressiva
  - `components/items/FreteRastreioForm.jsx` - Formulário de frete e rastreio em lote (**EM USO**)
  - `components/items/ItemFilters.jsx` - Filtros de pesquisa e dropdown
  - `components/items/ItemImage.jsx` - Visualização e upload de imagens
  - `components/items/ItemSelectionCheckboxes.jsx` - Checkboxes de seleção (NF, Frete, Status)
  - `components/items/MudarStatusForm.jsx` - Formulário de mudança de status em massa (**EM USO**)
  - `components/items/OcCardHeader.jsx` - Header do card de OC
  - `components/items/Pagination.jsx` - Componente de paginação
  - `components/items/ProntoDespachoToggle.jsx` - Toggle de pronto para despacho
  - `components/items/StatusBadge.jsx` - Badges de status, estoque, despacho
  - `components/items/itemHelpers.js` - Funções utilitárias e constantes
  - `components/items/index.js` - Arquivo de exportações
- ✅ **Redução de código**: `ItemsByStatus.js` reduzido de **~6401 → ~6086 linhas** (~315 linhas extraídas)
- ✅ **Build verificado**: Frontend compila sem erros

### 🔧 Refatoração do Backend - Fase 2 (27/01/2026)
- ✅ **Modularização completa de rotas**: 
  - `routes/auth_routes.py` - Autenticação (login, profile, password reset) - **EM USO**
  - `routes/rastreio_routes.py` - Rastreamento Correios - **EM USO**
  - `routes/notificacao_routes.py` - Notificações (NOVO) - **EM USO**
- ✅ **Routers incluídos em server.py** via `api_router.include_router()`
- ✅ **Redução de código**: `server.py` reduzido de ~6841 para ~6421 linhas (~420 linhas extraídas)
- ✅ **Testes verificados**: 15/15 testes passaram (100%)

### 🚚 Frete e Rastreio Unificado (27/01/2026)
- ✅ **Botão único "Aplicar Frete e Rastreio"** na página "Em Separação"
- ✅ **Seleção múltipla de itens** para aplicar frete dividido + código de rastreio
- ✅ **Cálculo automático** de frete por item (total ÷ número de itens)
- ✅ **Endpoints utilizados**:
  - `POST /api/purchase-orders/{po_id}/frete-envio-multiplo`
  - `POST /api/purchase-orders/{po_id}/rastreio-multiplo`

### 🔧 Refatoração do Backend - Fase 1 (22/01/2026)
- ✅ **Documentação de arquitetura**: `/app/backend/REFACTORING.md` com plano completo
- ✅ **config.py expandido**: Novas constantes centralizadas (STATUS_COMPRADO_OU_ADIANTE, FRONTEND_URL)
- ✅ **services/estoque_service.py**: Funções de negócio extraídas:
  - `reverter_uso_estoque()` - Reverte uso de estoque quando item volta a pendente
  - `atualizar_data_compra()` - Atualiza data de compra automaticamente
  - `calcular_lucro_item()` - Calcula lucro líquido do item
- ✅ **routes/rastreio_routes.py**: Módulo de rotas de rastreamento Correios
- ✅ **utils/config.py**: Re-exporta constantes de config.py
- ✅ **services/__init__.py**: Exporta funções de todos os serviços

### 📊 Importação de Limites do Contrato FIEP (22/01/2026)
- ✅ **Nova funcionalidade**: Importar planilha Excel com limites máximos do contrato
- ✅ **Badge "📊 Contrato: X UN"** nos itens pendentes mostra quantidade máxima do contrato (não apenas do banco)
- ✅ **Endpoints:**
  - `POST /api/admin/importar-limites-contrato` - Upload e parse do Excel
  - `GET /api/limites-contrato` - Lista todos os limites importados
  - `GET /api/limites-contrato/mapa` - Retorna mapa código→quantidade para frontend
- ✅ **UI na página de Estoque:**
  - Seção dedicada para upload da planilha
  - Mostra status "✅ X códigos importados"
  - Botão "📤 Importar Planilha (.xlsx)"
  - Instruções: Coluna J = Código, Coluna H = Quantidade Máxima
- ✅ **Coleção MongoDB**: `limites_contrato` armazena os dados importados
- ✅ **Fallback inteligente**: Se não houver limites importados, usa total do banco de dados

### 📋 Página de Planilha Reformulada (22/01/2026)
- ✅ **Novo endpoint**: `GET /api/planilha-contrato` - Cruza limites do contrato com dados das OCs
- ✅ **Mostra TODOS os itens do contrato FIEP** (1385 itens da planilha importada)
- ✅ **Badge "📊 Contrato FIEP"** no cabeçalho quando usando dados importados
- ✅ **Estatísticas baseadas no contrato:**
  - Itens Diferentes (total de códigos do contrato)
  - Qtd. Total Contrato (soma de todas as quantidades máximas)
  - Qtd. Já Comprada
  - Qtd. Faltante (contrato - comprada)
  - % Comprado
- ✅ **Novos filtros:**
  - 📦 Com OC - Itens que já têm OC no sistema
  - ⏳ Sem OC - Itens do contrato que ainda não têm OC
  - ⚠️ Faltantes - Itens com quantidade faltante > 0
  - ✅ Completos - Itens com quantidade faltante = 0
- ✅ **Coluna "Qtd. Contrato"** destacada em roxo
- ✅ **Indicador visual "SEM OC"** em cinza para itens sem OC
- ✅ **Itens sem OC** mostram descrição em itálico e campos vazios

---

### Versão 3.0.0 (22/01/2026)

### 📸 Upload de Imagem de Itens (22/01/2026)
- ✅ **Drag-and-drop** para upload de imagens (JPEG, PNG, WebP, GIF - máx 5MB)
- ✅ **Miniatura** no card do item (50x50px)
- ✅ **Popup expandido** ao clicar na miniatura (modal com fundo escuro)
- ✅ **Link "🖼️ Ver Imagem"** nas páginas de Estoque e Planilha (abre em nova guia)
- ✅ **Botão de remover** imagem (X vermelho)
- ✅ **Endpoints:**
  - `POST /api/purchase-orders/{po_id}/items/by-index/{item_index}/imagem`
  - `GET /api/item-images/{filename}`
  - `DELETE /api/purchase-orders/{po_id}/items/by-index/{item_index}/imagem`
- ✅ **Armazenamento:** `/app/backend/uploads/item_images`

### 🔗 Agrupar Itens por Código (22/01/2026)
- ✅ **Botão "Agrupar por Código"** na página de Pendentes
- ✅ **Visualização agrupada** mostra itens com mesmo código juntos
- ✅ **Badge "🔥 X OCs"** quando item aparece em múltiplas OCs
- ✅ **Badge "Total: X UN"** mostra quantidade total consolidada
- ✅ **Expansão de detalhes** mostra cada OC com quantidade, responsável e endereço
- ✅ **Botão Editar** individual para cada item no grupo

### 📊 Total da Planilha em Pendentes (22/01/2026)
- ✅ **Badge roxo "📊 Total Planilha: X UN"** nos itens pendentes
- ✅ Aparece quando o item aparece em outras OCs (quantidade total > quantidade do item)
- ✅ Ajuda a negociar melhor com fornecedores sabendo o volume total

---

### 🐛 Correção Crítica P0 - Reversão de Estoque (22/01/2026)
- ✅ **Bug corrigido**: Quando um item era revertido de "Comprado" para "Pendente", os campos `quantidade_usada_estoque` e `estoque_usado_em` da OC de origem NÃO eram limpos, causando corrupção de dados no cálculo do estoque
- ✅ **Solução implementada**:
  - Nova função `reverter_uso_estoque()` no backend (`server.py` linhas ~97-193)
  - Chamada automaticamente em TODOS os endpoints de atualização de status quando item volta para `pendente` ou `cotado`
  - Endpoints atualizados: `update_item_status`, `update_item_by_index_status`, `update_item_by_index`, `atualizar_status_em_massa`
- ✅ **Novo endpoint de migração**: `POST /api/admin/limpar-dados-estoque-inconsistentes`
  - Corrige dados legados em itens que estão pendentes/cotados mas ainda têm dados de uso de estoque
- ✅ **Novo botão na UI**: "🔧 Corrigir Dados" na página de Estoque (cor amarela)
  - Chama o endpoint de migração para admins limparem dados inconsistentes
- ✅ **Testes automatizados**: 14 testes criados em `/app/tests/test_estoque_reverter_bug.py`
  - Todos passando com 100% de sucesso

### Versão 2.8.0 (22/01/2026)

### Funcionalidade "Usar do Estoque" (22/01/2026)
- ✅ **Botão "📦 X em estoque • Usar"** em itens pendentes/cotados que têm estoque disponível
- ✅ **Modal com detalhes do estoque:**
  - Mostra quantidade necessária vs disponível
  - Lista as OCs de origem do estoque com preço, fornecedor e data
  - Campo para informar quantidade a usar
  - Preview se atende 100% ou parcialmente
- ✅ **Fluxo de uso:**
  - Se atende 100%: item muda para "Comprado" automaticamente
  - Se parcial: mantém status + marca "parcialmente atendido pelo estoque"
  - Usa o preço original do estoque
  - Registra de qual OC veio e em qual OC foi usado
  - Deduz corretamente do estoque disponível
- ✅ **Novos endpoints:**
  - `POST /api/estoque/usar` - Consome estoque para um item
  - `GET /api/estoque/detalhes/{codigo_item}` - Detalhes do estoque para o modal

### Versão 2.7.0 (21/01/2026)

### Novas Funcionalidades (21/01/2026)
- ✅ **Nova Aba "📦 Estoque"** - Mostra todos os itens comprados em quantidade maior que a necessária:
  - Código do item, descrição, marca/modelo
  - Quantidade disponível em estoque (excedente)
  - Link de compra, fornecedor, preço unitário
  - Origem (OCs de onde veio o excedente)
  - Busca por código, descrição, marca ou fornecedor

- ✅ **Nova Aba "📋 Planilha de Itens"** - Visão consolidada de TODOS os itens por código:
  - Estatísticas: Itens diferentes, Qtd. Total Necessária, Qtd. Já Comprada, Qtd. Faltante, % Comprado
  - Filtros: Todos, ⚠️ Faltantes, ✅ Completos
  - Tabela com: Código, Descrição, Lotes, Responsáveis, Marcas, Qtd. Total, Comprado, Faltante
  - Expandir detalhes para ver cada OC que tem aquele item (lote, responsável, preço, status)
  - Paginação

- ✅ **Campo "Quantidade Comprada"** na edição de itens:
  - Aparece para itens cotados ou com status posterior
  - Permite informar se comprou mais do que o necessário (ex: kit maior)
  - Mostra cálculo do excedente que irá para o estoque
  - Excedente aparece automaticamente na página de Estoque

- ✅ **Data de Compra Automática** - Salva automaticamente quando o item muda para "comprado"
- ✅ **Frete de Envio em Lote** - Na página "Em Separação":
  - Selecionar itens específicos para aplicar frete de envio
  - Informar valor total que será dividido igualmente entre os itens
  - Checkboxes separados: verde (NF) e laranja (Frete)
- ✅ **Atualizar OCs com PDF** - Preencher dados faltantes (endereço, data) sem perder progresso
- ✅ **Endereço de Entrega Completo** - Visível em todo o sistema com edição inline
- ✅ **Data de Entrega Visível** - Extraída automaticamente do PDF da OC (formato DD/MM/YYYY)
- ✅ **Contagem Regressiva** - Mostra dias restantes para a entrega
- ✅ **Badge de ATRASADO** - Etiqueta vermelha quando a data de entrega passou, com contagem de dias em atraso
- ✅ **Histórico de Cotações** - Itens pendentes mostram cotações anteriores do mesmo código/descrição
- ✅ **NF de Venda Parcial** - Seleção de itens específicos para emitir NF

### Versão Anterior: 2.4.0 (19/01/2026)

### Novas Funcionalidades (12/01/2026)
- ✅ **Campo "Observação"** - Campo de texto visível para todos os usuários em cada item
  - Pode ser adicionado/editado em qualquer página de status
  - Persiste no banco de dados
- ✅ **Checkbox "No Carrinho"** - Disponível apenas na página de itens "Cotados"
  - Permite selecionar múltiplos itens para mover em lote
- ✅ **Botão "Mover para Comprado"** - Aparece quando há itens selecionados
  - Move todos os itens selecionados para status "Comprado" de uma vez
  - Atualiza `data_compra` automaticamente

### Correções Críticas (Sessão Anterior)
- ✅ **BUG CRÍTICO RESOLVIDO**: Usuários não-admin não conseguiam salvar edições
  - **Causa**: Quando o backend filtrava itens por responsável, os índices mudavam
  - **Solução**: Adicionado campo `_originalIndex` que preserva o índice real do item no banco
  - **Frontend atualizado** para usar `_originalIndex` ao salvar

### Refatoração do Backend (12/01/2026)
- ✅ Modelos Pydantic extraídos para `/app/backend/models/schemas.py`
- ✅ Arquivo `server.py` reduzido de 3610 para 3434 linhas
- ✅ Estrutura de pastas criada: `/models`, `/routes`, `/services`, `/utils`

## Funcionalidades Implementadas

### ✅ Autenticação e Autorização
- Login JWT com roles (admin/user)
- Proteção de rotas por role
- Criação de usuários iniciais

### ✅ Gestão de OCs
- Criação manual de OCs
- Upload de PDF para extração automática
- Edição e exclusão de OCs (admin only)
- Visualização de OCs com filtro por responsável

### ✅ Distribuição de Itens
- Atribuição automática por lote
- Itens em múltiplos lotes: sorteio entre não-admins (Maria, Mylena, Fabio)

### ✅ Edição de Itens (CORRIGIDO 12/01/2026)
- **TODOS os usuários autenticados podem editar itens**
- Preço de venda, preço de compra, fontes de compra - editável por todos
- Imposto e frete de envio - editável por todos
- Campo `_originalIndex` garante que o item correto é atualizado

### ✅ Campos Financeiros
- **Preço de Venda** - Auto-preenchido do Excel de referência ou informado manualmente
- **Preço de Compra** - Editável por todos (ou calculado das fontes)
- **Imposto** - Calculado (11% do valor de venda)
- **Frete Compra** - Editável por todos (ou soma das fontes)
- **Frete Envio/Embalagem** - Editável por todos
- **Lucro Líquido** - Calculado automaticamente:
  ```
  lucro = receita_venda - custo_compras - frete_compra - imposto - frete_envio
  ```

### ✅ Multi-Fornecedor (Atualizado: 08/01/2026)
- Cada item pode ter múltiplas **fontes de compra**
- Cada fonte tem: Quantidade, Preço Unitário, Frete, Link, Fornecedor
- Sistema calcula automaticamente:
  - Preço médio de compra
  - Total de frete de compra
  - Lucro líquido considerando todas as fontes
- UI mostra indicador de quantidade restante vs total

### ✅ Dashboard
- Estatísticas por status (clicáveis)
- Filtro por responsável
- Cards de resumo financeiro (admin)

### ✅ Páginas
- Dashboard principal
- Criação de OC (manual + PDF)
- Detalhe de OC
- Itens por Status
- Resumo Completo (admin) - Com totais de fretes

## Stack Tecnológica
- **Backend:** FastAPI, Motor (MongoDB async), PyMuPDF
- **Frontend:** React, React Router, TailwindCSS
- **Database:** MongoDB
- **Integração:** Resend (emails)

## Estrutura de Arquivos
```
/app
├── backend/
│   ├── server.py      # Endpoints principais
│   └── auth.py        # Autenticação JWT
└── frontend/
    └── src/
        ├── pages/
        │   ├── Dashboard.js
        │   ├── CreatePO.js
        │   ├── PODetails.js
        │   ├── ItemsByStatus.js
        │   └── AllItemsSummary.js
        └── contexts/
            └── AuthContext.js
```

## Tarefas Concluídas Recentemente
- [20/01/2026] ✅ **Endereço de Entrega em Todo o Sistema** - Adicionado endereço de entrega em todas as visualizações:
  - Dashboard: Nova coluna na tabela de OCs
  - ItemsByStatus (Em Separação): Badge com ícone 📍 no header de cada OC agrupada
  - ItemsByStatus (Outros): Badge com endereço no header de cada item
  - PODetails: Seção dedicada com endereço da OC
  - Backend atualizado para retornar `endereco_entrega` na listagem simplificada
- [20/01/2026] ✅ **Histórico de Cotações** - Itens pendentes agora mostram cotações anteriores do mesmo código/descrição
  - Exibe fornecedor, preço, frete e link de compras anteriores
  - Botão "📜 Cotações Anteriores" em cada item pendente
  - Facilita reutilização de cotações para itens recorrentes
- [19/01/2026] ✅ **NF de Venda Parcial** - Permite emitir NF para itens selecionados de uma OC (entregas parciais)
- [19/01/2026] ✅ **Múltiplas NFs por OC** - Sistema agora suporta várias NFs de venda por OC
- [19/01/2026] ✅ **Contagem de Itens com NF** - Mostra "X itens prontos, Y restantes" no header da OC
- [19/01/2026] ✅ **Campo Observação no Formulário de Edição** - Observação agora é editada junto com outros campos
- [19/01/2026] ✅ **Observação Visível (Read-only)** - Observação aparece na visualização do item sem botão de edição separado
- [08/01/2026] ✅ Implementação de campos de frete (frete_compra e frete_envio)
- [08/01/2026] ✅ Atualização do cálculo de lucro líquido
- [08/01/2026] ✅ Proteção do campo frete_envio (apenas admin)
- [08/01/2026] ✅ Exibição de fretes na UI e resumo financeiro
- [08/01/2026] ✅ Endereço de entrega único para toda OC
- [08/01/2026] ✅ Campo de preço de venda unitário no cadastro de item
- [08/01/2026] ✅ **Multi-Fornecedor**: Comprar de múltiplos locais por item
- [08/01/2026] ✅ **Filtro "Meus Itens"**: Permite usuários (incluindo admins) ver apenas seus itens na página de status. Usa useMemo para garantir renderização correta.
- [08/01/2026] ✅ **Correção Parser PDF**: Corrigido bug onde PDFs com menos de 3 itens não eram parseados. O fallback agora só é acionado quando NENHUM item é encontrado.
- [08/01/2026] ✅ **Correção Upload PDF**: Corrigido erro "body stream already read" no frontend ao fazer upload de PDFs.
- [08/01/2026] ✅ **Drag and Drop**: Área de upload de PDF agora aceita arrastar e soltar arquivos.
- [08/01/2026] ✅ **Validação OC Duplicada**: Popup de aviso quando tenta criar uma OC que já existe no sistema, com opção de ver a OC existente.
- [09/01/2026] ✅ **Upload Múltiplo de PDFs**: Permite selecionar vários PDFs e criar todas as OCs automaticamente em lote.
- [09/01/2026] ✅ **Esqueci Minha Senha (P1)**: Link na tela de login, página de recuperação de senha com envio de email via Resend.
- [09/01/2026] ✅ **Edição de Perfil (P2)**: Página de perfil do usuário com edição de nome de exibição, alteração de senha, e logout. Nome exibido na navbar.
- [09/01/2026] ✅ **Painel do Responsável (OwnerPanel)**: Corrigido e testado. Ao clicar no nome de um responsável no Dashboard, exibe corretamente todos os itens atribuídos a essa pessoa com colunas detalhadas (Marca/Modelo, Preço formatado em R$, Lote, Status) e filtros por status.
- [09/01/2026] ✅ **Preço de Venda no Modo de Edição**: Agora o preço de venda, valor total e imposto (11%) aparecem em modo somente leitura durante a edição de itens.
- [09/01/2026] ✅ **Correção do Cálculo de Frete e Imposto**: Frete agora é tratado como valor total da compra (não por unidade). Imposto calculado automaticamente como 11% do valor total de venda.
- [09/01/2026] ✅ **Pesquisa e Filtro de OCs**: Dashboard agora tem campo de pesquisa por número de OC e filtros por data (inicial/final).
- [09/01/2026] ✅ **Edição Completa de OC (Admin)**: Nova página `/edit-po/:id` permite admin editar qualquer campo de item: descrição, quantidade, unidade, responsável, lote, marca/modelo, preço de venda e status.
- [09/01/2026] ✅ **Rastreamento Correios**: Novo status "Em Trânsito" com campo para código de rastreio. Funcionalidades:
  - Campo para inserir código de rastreio em itens "Comprados"
  - Botão "🚚 Enviar" que salva código e move item para "Em Trânsito"
  - Página "Em Trânsito" com código clicável para copiar
  - Histórico de rastreio expandível com eventos dos Correios
  - Botão "🔄 Atualizar" para buscar novas informações
  - Atualização automática para "Entregue" quando rastreio indica entrega
- [09/01/2026] ✅ **Sistema de Notificações**: Sininho 🔔 no header com:
  - Contador vermelho de notificações não lidas
  - Dropdown com lista de notificações
  - Cada notificação mostra: OC, código do item, descrição (máx 30 chars)
  - "Marcar todas como lidas" para limpar
  - Notificação automática quando item é entregue
- [09/01/2026] ✅ **Filtros Avançados em Páginas de Status**: Todas as páginas de itens (Pendentes, Cotados, Comprados, Em Trânsito, Entregues) agora possuem:
  - 🔍 Campo de pesquisa por **Código do Item**
  - 📋 Campo de pesquisa por **Número da OC**
  - 👤 Dropdown para filtrar por **Responsável**
  - 🏪 Dropdown para filtrar por **Fornecedor** (apenas admin)
  - Botão "✕ Limpar Filtros" quando filtros estão ativos
  - Contador de itens encontrados com filtros aplicados
- [09/01/2026] ✅ **Novo Status "Em Separação"**: Adicionado status intermediário entre "Comprados" e "Em Trânsito" para itens que chegaram e estão sendo embalados para envio
- [09/01/2026] ✅ **Filtros Avançados no Dashboard**: Seção "Ordens de Compra" agora tem:
  - Pesquisa por número da OC
  - Pesquisa por código do item
  - Pesquisa por responsável
  - Filtros por data inicial e final
- [09/01/2026] ✅ **Inputs em Maiúsculas sem Acentos**: Todos os campos de texto são automaticamente convertidos para MAIÚSCULAS e acentos são removidos
- [09/01/2026] ✅ **Normalização de Fornecedores**: Endpoint criado para unificar fornecedores duplicados (ex: "mercado livre" e "MERCADO LIVRE" → "MERCADO LIVRE")
- [09/01/2026] ✅ **Correção Bug Edição Dupla (EditPO)**: Corrigido bug onde clicar para editar um item abria todos os itens com mesmo código. Agora usa índice ao invés de codigo_item como chave
- [10/01/2026] ✅ **Gestão de Notas Fiscais na página "Em Separação"**: Nova funcionalidade completa para gerenciar NFs:
  - 📍 **Endereço de Entrega**: Exibe endereço da OC com opção de editar manualmente
  - 🏭 **NFs de Fornecedor (múltiplas)**: Upload de PDF ou XML com extração automática de NCM
  - 🏢 **NF de Revenda (única)**: Upload separado para a NF que a empresa emite para revenda
  - 📄 **Extração de NCM**: Automática do XML (usa namespace NFe) e tentativa em PDF via regex
  - ✏️ **NCM Manual**: Campo para inserir NCM manualmente se não encontrado
  - ⬇️ **Download**: Botão para baixar cada NF anexada
  - 🗑️ **Remover**: Botão para excluir NFs
  - ✅ **Checkbox "NF Emitida / Pronto para Despacho"**: Marca quando a NF de revenda foi emitida e o item está pronto para envio
- [10/01/2026] ✅ **Visualização "Em Separação" Agrupada por OC**: Nova interface que:
  - 📦 **Agrupa itens por OC**: Cada OC aparece como um card colapsável
  - 📊 **Indicador de Progresso**: Mostra "X de Y itens com NF emitida" (ex: "3 de 5")
  - ✅ **Status "Pronto para Despacho"**: Card fica verde quando TODOS os itens da OC têm NF emitida
  - 🔽 **Expandir/Colapsar**: Clique no card para ver detalhes de cada item
  - 🔗 **Link "Ver OC Completa"**: Acesso rápido à página de detalhes da OC
- [10/01/2026] ✅ **Sistema de Comissões Baseado em Lotes**: Novo sistema no Painel Admin:
  - 💰 **Comissão fixa de 1,5%** sobre o valor total de venda (não lucro)
  - 📋 **Baseado em LOTES específicos**: Cada cotador recebe comissão dos lotes que cotou originalmente
  - 👥 **Apenas não-admins**: Maria, Mylena e Fabio (João e Mateus são admins e não recebem)
  - 📊 **Lotes atribuídos**:
    - MARIA: 1-12, 43-53
    - MYLENA: 80-97
    - FABIO: 32-42
  - ⏳ **Status para comissão**: Apenas itens "entregue" ou "em_transito" geram comissão
  - 📝 **Registro de Pagamentos**: Admin pode selecionar itens e registrar pagamento de comissão
  - 📜 **Histórico de Pagamentos**: Visualização, edição e exclusão de pagamentos anteriores
- [12/01/2026] ✅ **Filtro "Não Atribuído"**: Novo filtro nos dropdowns de Responsável nas páginas Dashboard e ItemsByStatus para encontrar itens sem responsável ou com responsável inválido
- [12/01/2026] ✅ **Correção de Logging no Backend**: Logger agora é configurado no início do arquivo server.py, resolvendo potenciais erros quando funções de permissão tentavam usar logger antes de ser definido
- [12/01/2026] ✅ **Endpoint de Debug de Permissões**: Novo endpoint `/api/debug/permission/{po_id}/{item_index}` para diagnosticar problemas de autorização em produção
- [12/01/2026] ✅ **Logging Detalhado de Permissões**: Funções de atualização de itens agora logam informações detalhadas sobre verificações de permissão

## Bugs Conhecidos/Em Investigação
- **Bug P0 (Produção)**: Usuários (Maria, Fabio) não conseguem atualizar itens em produção. O código do preview está correto e funcionando. O problema pode ser:
  1. Código antigo ainda em produção (sem as correções de case-insensitive)
  2. Logger não definido causando erro silencioso
  3. Dados inconsistentes no banco de produção
  **Ação necessária**: Usuário precisa fazer novo deploy e testar novamente. Se continuar falhando, usar endpoint de debug para investigar.

## Próximas Tarefas (Backlog)

### P0 - Alta Prioridade (Bugs Críticos)
- [ ] **Bug NFs não salvando**: Notas Fiscais de fornecedor não aparecem no painel Admin após upload

### P1 - Média Prioridade
- [ ] **Bug edição duplicada**: Editar item duplicado abre todas as instâncias simultaneamente

### P2 - Baixa Prioridade
- [ ] **Busca Dashboard**: Busca por código de item no Dashboard não funciona
- [ ] **Performance Em Separação**: Página lenta ao expandir OC com muitos itens

### P3 - Backlog (Adiadas pelo usuário)
- [x] **Refatoração do Backend - Fase 2** - ✅ COMPLETO (27/01/2026)
- [ ] **Refatoração do Backend - Fase 3** - Extrair rotas de estoque, planilha, admin
- **Refatoração Frontend - Fase 1 e 2** - ✅ COMPLETO (27/01/2026) - 12 componentes criados, 2 em uso ativo
- [ ] **Refatoração Frontend - Fase 3** - Substituir mais blocos de código pelos componentes criados
- [ ] **Verificação de Domínio Resend** - Para emails funcionarem externamente

### Notas de Limitações Conhecidas
- **Funcionalidade "Esqueci Minha Senha"**: Emails só são enviados para o endereço cadastrado na conta Resend do usuário (falta verificação de domínio próprio)

## Credenciais de Teste
```
Admin: projetos.onsolucoes@gmail.com / on123456
User (Maria):  maria.onsolucoes@gmail.com / on123456
User (Fabio):  fabioonsolucoes@gmail.com / on123456
```

## Notas Técnicas
- Frete Compra: Campo `frete_compra` no POItem, editável por todos
- Frete Envio: Campo `frete_envio` no POItem, editável apenas por admins
- Lucro só aparece para admins na UI
- AllItemsSummary mostra totais de ambos os fretes

