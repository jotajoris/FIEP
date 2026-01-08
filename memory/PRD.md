# FIEP - Sistema de Gestão de Ordens de Compra (OCs)

## Descrição do Projeto
Plataforma web para gerenciamento de ordens de compra (OCs) do cliente FIEP.

## Requisitos Principais
1. **Criação de OCs** - Manual ou via upload de PDF
2. **Distribuição automática** - Itens distribuídos para responsáveis baseado em lotes
3. **Rastreamento de status** - Pendente, Cotado, Comprado, Entregue
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

## Próximas Tarefas (Backlog)

### P1 - Alta Prioridade
- [ ] **Esqueci a Senha** - Botão na tela de login com envio de email
- [ ] **Edição de Perfil** - Usuário editar nome, exibir no header

### P2 - Média Prioridade
- [ ] **Refatoração do Backend** - Dividir server.py em módulos menores
- [ ] **Extrair lógica de atribuição** - Função reutilizável

### P3 - Baixa Prioridade
- [ ] **Multi-Fornecedor** - Comprar item de múltiplos fornecedores

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
