# 🏢 ATHLO — Backend API

> SaaS multi-tenant de gestão para pequenas e médias empresas
> Contatos (CRM), financeiro, produtos/serviços, agenda e equipe — tudo isolado por empresa.

---

## 🚀 Stack

| Tecnologia | Versão |
|---|---|
| Node.js | 20+ |
| TypeScript | 5.x |
| Express | 4.x |
| Prisma ORM | 5.x |
| PostgreSQL | 14+ |
| Zod | 3.x |
| JWT | 9.x |
| Bcrypt | 2.x |

---

## 📁 Estrutura

```
src/
├── config/          # Configurações (env, prisma)
├── controllers/     # Handlers das rotas
├── middlewares/     # Auth, errors, logger
├── routes/          # Definição de rotas
├── services/        # Lógica de negócio
├── utils/           # Utilitários (AppError, jwt, pagination)
└── server.ts        # Entry point
```

---

## 🏗️ Modelo multi-tenant

Cada empresa cliente é uma `Organization`. Todo usuário (`User`) pertence a
uma organização (`organizationId`) e tem um papel dentro dela (`orgRole`:
`OWNER`, `ADMIN` ou `MEMBER`). Todos os dados de negócio (contatos, produtos,
faturas, eventos) são escopados por `organizationId` — o middleware de
autenticação injeta a organização do usuário a partir do JWT, e todo acesso
passa por esse filtro.

Cada organização tem uma `Subscription` vinculada a um `Plan` (Free /
Starter / Pro), controlando limites de uso (usuários, contatos). A
integração de cobrança real (Stripe) ainda não está plugada — os campos
`stripeCustomerId`/`stripePriceId` já existem no schema para isso.

---

## ⚙️ Setup

### 1. Instalar dependências

```bash
npm install
```

### 2. Configurar variáveis de ambiente

```bash
cp .env.example .env
# Edite o .env com suas configurações
```

### 3. Criar banco e rodar migrations

```bash
npm run db:migrate
```

### 4. Popular banco com dados iniciais (planos + empresa demo)

```bash
npm run db:seed
```

### 5. Rodar em desenvolvimento

```bash
npm run dev
```

---

## 📡 Endpoints

### Auth
| Método | Rota | Descrição |
|---|---|---|
| POST | `/api/v1/auth/register` | Cadastro (cria empresa nova, ou entra via `inviteToken`) |
| POST | `/api/v1/auth/login` | Login |
| POST | `/api/v1/auth/refresh` | Renovar token |
| POST | `/api/v1/auth/logout` | Logout |
| GET | `/api/v1/auth/me` | Usuário atual + empresa + assinatura |

### Organização
| Método | Rota | Descrição |
|---|---|---|
| GET | `/api/v1/organization/me` | Dados da empresa |
| PATCH | `/api/v1/organization/me` | Atualizar dados da empresa |
| GET | `/api/v1/organization/members` | Listar membros da equipe |

### Planos e assinatura
| Método | Rota | Descrição |
|---|---|---|
| GET | `/api/v1/plans` | Lista de planos (pública) |
| GET | `/api/v1/plans/subscription` | Assinatura atual da empresa |
| POST | `/api/v1/plans/subscription/change` | Trocar de plano |
| POST | `/api/v1/plans/subscription/cancel` | Cancelar assinatura |

### Convites de equipe
| Método | Rota | Descrição |
|---|---|---|
| GET | `/api/v1/invites` | Listar convites pendentes |
| POST | `/api/v1/invites` | Convidar novo membro |
| DELETE | `/api/v1/invites/:id` | Revogar convite |

### Contatos, Produtos, Faturas, Eventos, Notificações
> Padrão REST — CRUD completo em `/contacts`, `/products`, `/invoices`
> (+ `PATCH /invoices/:id/pay`), `/events`, `/notifications`. Ver rotas em
> `src/routes/`.

---

## 👥 Papéis (orgRole)

| Papel | Descrição |
|---|---|
| `OWNER` | Dono da empresa — acesso total, incluindo assinatura |
| `ADMIN` | Gerencia equipe, dados e configurações da empresa |
| `MEMBER` | Acesso operacional (contatos, financeiro, agenda) |

---

## 🔐 Credenciais padrão (seed)

| E-mail | Senha | Papel |
|---|---|---|
| admin@athlodemo.com.br | Admin@2024 | OWNER |

> ⚠️ Altere as senhas em produção!

---

## 📦 Scripts

```bash
npm run dev          # Dev com hot reload
npm run build        # Build TypeScript
npm run start        # Produção
npm run db:generate  # Gera Prisma client
npm run db:migrate   # Cria/roda migrations
npm run db:studio    # Prisma Studio UI
npm run db:seed      # Popula banco
npm run db:reset     # Reseta banco
```

---

## 🗺️ Roadmap

- Integração de cobrança real (Stripe Checkout + webhooks)
- Enforcement automático de limites de plano
- Pipeline de vendas / Kanban de oportunidades
- Testes automatizados e CI

---

*ATHLO © 2026*
