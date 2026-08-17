# 🏢 ATHLO — Backend API

> SaaS multi-tenant de gestão para pequenas e médias empresas
> Contatos (CRM), financeiro, produtos/serviços, pedidos, agenda e equipe — tudo isolado por empresa.

---

# 🌐 Demonstração Online

## Backend API
https://athlo-backend-r176.onrender.com

## Frontend
https://athlo-web-admin-fdizioprj-hlima-dev1.vercel.app/

> Serviço no plano gratuito do Render — se ficar inativo por um tempo, a
> primeira chamada pode demorar até ~1 minuto para "acordar".

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
| Stripe | 17.x |
| Web Push | 3.x |
| ExcelJS / PDFKit | — |
| Vitest | 4.x |

---

## 📁 Estrutura

```
src/
├── config/          # Configurações (env, prisma)
├── controllers/     # Handlers das rotas
├── middlewares/      # Auth, CSRF, rate limit, errors, logger
├── routes/          # Definição de rotas
├── services/        # Lógica de negócio
├── utils/           # Utilitários (AppError, jwt, cookies, pagination)
└── server.ts        # Entry point
scripts/              # Rotinas para Render Cron Job (lembretes, promoção de admin)
tests/                 # Testes automatizados (Vitest)
```

---

## 🏗️ Modelo multi-tenant

Cada empresa cliente é uma `Organization`. Todo usuário (`User`) tem uma
empresa padrão (`organizationId`/`orgRole`), mas pode ter acesso a **mais de
uma empresa** através de `Membership` — o mesmo login pode representar o
dono de várias unidades/CNPJs, escolhendo qual está usando no momento
(sessão troca de empresa sem precisar de senha de novo). Todos os dados de
negócio (contatos, produtos, faturas, pedidos, eventos) são escopados por
`organizationId` — o middleware de autenticação injeta a organização ativa
da sessão a partir do JWT, e todo acesso passa por esse filtro.

Cada organização tem uma `Subscription` vinculada a um `Plan` (Free /
Starter / Pro) e cobrança real via **Stripe** (Checkout, Billing Portal e
webhooks). Escrita é bloqueada automaticamente quando o trial acaba e não há
assinatura ativa.

Existe também um papel separado, `User.isPlatformAdmin`, para a equipe do
próprio ATHLO administrar todas as empresas clientes — diferente do
`OrgRole.OWNER`, que é o dono de uma empresa cliente específica.

---

## ⚙️ Setup

### 1. Instalar dependências

```bash
npm install
```

### 2. Configurar variáveis de ambiente

```bash
cp .env.example .env
# Edite o .env com suas configurações (ver .env.example para a lista completa,
# incluindo Stripe e Web Push — todas opcionais em desenvolvimento)
```

### 3. Sincronizar o schema com o banco

```bash
npx prisma db push
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
| POST | `/api/v1/auth/login` | Login (pede seleção de empresa se houver mais de uma) |
| POST | `/api/v1/auth/select-organization` | Completa o login escolhendo a empresa |
| POST | `/api/v1/auth/switch-organization` | Troca de empresa já autenticado |
| GET/POST | `/api/v1/auth/organizations` | Lista/cria empresas do login atual |
| POST | `/api/v1/auth/refresh` | Renovar sessão |
| POST | `/api/v1/auth/logout` | Logout |
| GET | `/api/v1/auth/me` | Usuário atual + empresa ativa + assinatura |
| POST | `/api/v1/auth/verify-email` | Confirmar e-mail |
| POST | `/api/v1/auth/resend-verification` | Reenviar confirmação |

### Organização
| Método | Rota | Descrição |
|---|---|---|
| GET | `/api/v1/organization/me` | Dados da empresa |
| PATCH | `/api/v1/organization/me` | Atualizar dados da empresa |
| DELETE | `/api/v1/organization/me` | Excluir empresa e todos os dados (LGPD) |
| GET | `/api/v1/organization/members` | Listar membros da equipe |

### Planos, assinatura e cobrança (Stripe)
| Método | Rota | Descrição |
|---|---|---|
| GET | `/api/v1/plans` | Lista de planos (pública) |
| GET | `/api/v1/plans/subscription` | Assinatura atual da empresa |
| POST | `/api/v1/plans/subscription/checkout` | Cria sessão de Stripe Checkout |
| POST | `/api/v1/plans/subscription/portal` | Cria sessão do Billing Portal |
| POST | `/api/v1/plans/subscription/change` | Trocar para o plano Free |
| POST | `/api/v1/plans/subscription/cancel` | Cancelar assinatura |
| POST | `/api/v1/stripe/webhook` | Webhook do Stripe (corpo bruto) |

### Administração da plataforma
| Método | Rota | Descrição |
|---|---|---|
| GET | `/api/v1/admin/overview` | MRR, assinaturas por status |
| GET | `/api/v1/admin/organizations` | Lista de empresas clientes |
| PATCH | `/api/v1/admin/organizations/:id/status` | Suspender/reativar empresa |

### Notificações push
| Método | Rota | Descrição |
|---|---|---|
| GET | `/api/v1/push/public-key` | Chave pública VAPID |
| POST | `/api/v1/push/subscribe` | Ativar push neste dispositivo |
| POST | `/api/v1/push/unsubscribe` | Desativar push neste dispositivo |

### Convites de equipe
| Método | Rota | Descrição |
|---|---|---|
| GET | `/api/v1/invites` | Listar convites pendentes |
| POST | `/api/v1/invites` | Convidar novo membro (mesmo se já tiver conta em outra empresa) |
| DELETE | `/api/v1/invites/:id` | Revogar convite |

### Contatos, Produtos, Faturas, Pedidos, Eventos, Notificações
> Padrão REST — CRUD completo em `/contacts`, `/products`, `/invoices`
> (+ `PATCH /invoices/:id/pay`, `GET /invoices/:id/pdf`), `/orders`
> (+ `GET /orders/:id/pdf`), `/events`, `/notifications`. Ver rotas em
> `src/routes/`.

### Relatórios
| Método | Rota | Descrição |
|---|---|---|
| GET | `/api/v1/dashboard` | Indicadores do painel |
| GET | `/api/v1/dashboard/export` | Exporta relatório em .xlsx |

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
| admin@athlodemo.com.br | Admin@2024 | OWNER + isPlatformAdmin |

> ⚠️ Altere as senhas em produção!

---

## 📦 Scripts

```bash
npm run dev              # Dev com hot reload
npm run build             # Build TypeScript
npm run start              # Produção
npm run test                # Testes automatizados (Vitest)
npm run db:generate     # Gera Prisma client
npm run db:seed             # Popula banco (planos + empresa demo + backfill de Membership)
npm run db:studio           # Prisma Studio UI
npm run admin:promote      # Promove um usuário a isPlatformAdmin
npm run reminders:invoices # Lembrete de faturas a vencer (Render Cron Job diário)
npm run reminders:events   # Lembrete de compromissos da agenda (Render Cron Job a cada 15 min)
```

---

## 🗺️ Roadmap

- Monitoramento de erros em produção (Sentry)
- Upload de logo da empresa e foto de perfil
- Pipeline de vendas / Kanban de oportunidades

---

*ATHLO © 2026*
