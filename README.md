# 🏃 ATHLO — Backend API

> Sistema de inclusão, acompanhamento e desenvolvimento de atletas amputados  
> Desenvolvido para a **ONG ASDA Sorocaba** (@asdasorocaba)

---

## 🚀 Stack

| Tecnologia | Versão |
|---|---|
| Node.js | 20+ |
| TypeScript | 5.x |
| Express | 4.x |
| Prisma ORM | 5.x |
| MySQL | 8.x |
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

### 4. Popular banco com dados iniciais

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
| POST | `/api/v1/auth/register` | Cadastro |
| POST | `/api/v1/auth/login` | Login |
| POST | `/api/v1/auth/refresh` | Renovar token |
| POST | `/api/v1/auth/logout` | Logout |
| GET | `/api/v1/auth/me` | Usuário atual |

### Athletes
| Método | Rota | Descrição |
|---|---|---|
| GET | `/api/v1/athletes` | Listar atletas |
| GET | `/api/v1/athletes/:id` | Detalhar atleta |
| POST | `/api/v1/athletes` | Cadastrar atleta |
| PATCH | `/api/v1/athletes/:id` | Atualizar atleta |
| DELETE | `/api/v1/athletes/:id` | Remover atleta |

### Events, Trainings, Donations, Notifications
> Padrão REST similar — ver rotas em `src/routes/`

---

## 👥 Roles

| Role | Descrição |
|---|---|
| `ADMIN` | Acesso total |
| `COACH` | Gerencia treinos e atletas |
| `VOLUNTEER` | Acesso básico |
| `DONOR` | Visualização pública |
| `ATHLETE` | Acesso ao próprio perfil |

---

## 🔐 Credenciais padrão (seed)

| E-mail | Senha | Role |
|---|---|---|
| admin@asdasorocaba.org.br | Admin@2024 | ADMIN |
| coach@asdasorocaba.org.br | Coach@2024 | COACH |

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

*ATHLO © 2024 — ASDA Sorocaba*
