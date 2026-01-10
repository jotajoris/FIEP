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
- projetos.onsolucoes@gmail.com
- comercial.onsolucoes@gmail.com
- gerencia.onsolucoes@gmail.com

### Usuários (Cotadores)
- Maria (maria.onsolucoes@gmail.com) - Lotes 1-12, 43-53
- Mateus (Lotes 13-20, 54-66)
- João (Lotes 21-31, 67-79)
- Mylena (mylena.onsolucoes@gmail.com) - Lotes 80-97
- Fabio (fabioonsolucoes@gmail.com) - Lotes 32-42

**Senha padrão:** on123456

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

### ✅ Campos Financeiros (Atualizado: 08/01/2026)
- **Preço de Venda** - Auto-preenchido do Excel de referência ou informado manualmente
- **Preço de Compra** - Editável por todos (ou calculado das fontes)
- **Imposto** - Calculado (11% do valor de venda)
- **Frete Compra** - Editável por todos (ou soma das fontes)
- **Frete Envio/Embalagem** - Editável apenas por admins
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

## Próximas Tarefas (Backlog)

### P3 - Baixa Prioridade (Adiadas pelo usuário)
- [ ] **Refatoração do Backend** - Dividir server.py em módulos menores (usuário concordou em adiar)
- [ ] **Verificação de Domínio Resend** - Para emails funcionarem externamente (adiado pelo usuário)

### Notas de Limitações Conhecidas
- **Funcionalidade "Esqueci Minha Senha"**: Emails só são enviados para o endereço cadastrado na conta Resend do usuário (falta verificação de domínio próprio)

## Credenciais de Teste
```
Admin: projetos.onsolucoes@gmail.com / on123456
User:  fabioonsolucoes@gmail.com / on123456
```

## Notas Técnicas
- Frete Compra: Campo `frete_compra` no POItem, editável por todos
- Frete Envio: Campo `frete_envio` no POItem, editável apenas por admins
- Lucro só aparece para admins na UI
- AllItemsSummary mostra totais de ambos os fretes
