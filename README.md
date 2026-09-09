# ATHLO — API

Backend do ATHLO: SaaS multi-tenant de gestão para PMEs (contatos, financeiro,
produtos, pedidos, agenda e equipe). Express + Prisma + PostgreSQL.

## Demo

- API: https://athlo-backend-r176.onrender.com
- Frontend: https://athlo-web-admin-fdizioprj-hlima-dev1.vercel.app/

No plano free do Render — se ficar parado um tempo, o primeiro request
demora ~1 min pra acordar o serviço.

## Como o multi-tenant funciona

Cada cliente é uma `Organization`. Todo `User` tem uma empresa padrão
(`organizationId`/`orgRole`), mas pode ter acesso a mais de uma via
`Membership` — é assim que dá pra um mesmo login administrar várias
unidades/CNPJs, trocando de empresa sem digitar senha de novo. Todo dado de
negócio é escopado por `organizationId`, injetado pelo middleware de auth a
partir do JWT.

Cobrança é via Stripe (Checkout, Billing Portal, webhooks) — a assinatura
fica vinculada a um `Plan` e escrita é bloqueada automaticamente se o trial
acabou e não tem plano ativo.

`User.isPlatformAdmin` é separado do `orgRole` — é o time do ATHLO
administrando a plataforma inteira, não o dono de uma empresa cliente.

## Setup

```bash
npm install
cp .env.example .env   # preenche com suas variáveis
npx prisma db push
npm run db:seed        # planos + empresa demo
npm run dev
```

## Endpoints principais

**Auth** — `/auth/register`, `/auth/login` (pede seleção de empresa se
houver mais de uma), `/auth/select-organization`, `/auth/switch-organization`,
`/auth/organizations` (listar/criar), `/auth/refresh`, `/auth/logout`,
`/auth/me`, `/auth/verify-email`, `/auth/resend-verification`

**Organização** — `/organization/me` (GET/PATCH/DELETE), `/organization/members`

**Cobrança** — `/plans`, `/plans/subscription`, `/plans/subscription/checkout`,
`/plans/subscription/portal`, `/plans/subscription/change`,
`/plans/subscription/cancel`, `/stripe/webhook`

**Admin da plataforma** — `/admin/overview`, `/admin/organizations`,
`/admin/organizations/:id/status`, `/admin/errors`, `/admin/errors/summary`,
`/admin/errors/:id/resolve`

**Push** — `/push/public-key`, `/push/subscribe`, `/push/unsubscribe`

**Equipe** — `/invites` (GET/POST), `/invites/:id` (DELETE)

**CRUD padrão** — `/contacts`, `/products`, `/invoices` (+ `/pay`, `/pdf`),
`/orders` (+ `/pdf`), `/events`, `/notifications`

**Relatórios** — `/dashboard`, `/dashboard/export` (xlsx)

## Papéis (orgRole)

`OWNER` (acesso total, inclusive assinatura), `ADMIN` (equipe e
configurações), `MEMBER` (operacional).

## Credenciais do seed

O `npm run db:seed` cria um usuário admin de demonstração — a senha não
é publicada aqui porque o ambiente de demo ao vivo usa Stripe em modo
**live** (cobrança real). Pra testar o login, rode o seed localmente
(ver `prisma/seed.ts`) e troque a senha antes de usar em produção.

## Scripts

```bash
npm run dev                # hot reload
npm run build               # compila TS
npm run test                 # Vitest
npm run db:seed              # popula banco
npm run admin:promote        # promove um usuário a isPlatformAdmin
npm run admin:list           # lista quem já é isPlatformAdmin
npm run reminders:invoices   # Render Cron Job diário
npm run reminders:events     # Render Cron Job a cada 15min
```

## Stack

Node, TypeScript, Express, Prisma, PostgreSQL, Zod, JWT, Stripe, Web Push,
ExcelJS, PDFKit, Vitest.

## Falta

- Upload de logo/avatar
- Pipeline de vendas / Kanban
