# PDV Camaleão - Guia de Deploy

## 📋 Pré-requisitos

- Docker + Docker Compose
- Traefik configurado como reverse proxy
- DNS apontando `app.distribuidoragpbrasil.com.br` para o servidor

---

## 🚀 Deploy via Portainer (Produção)

### 1. Criar Stack no Portainer
1. Acesse Portainer → **Stacks** → **Add Stack**
2. Selecione **Repository** e aponte para o repositório GitHub
3. O Portainer usará o `docker-compose.yml` da raiz automaticamente

### 2. Variáveis de Ambiente (Environment Variables)
Configure no Portainer antes de fazer deploy:

| Variável | Descrição | Exemplo |
|---|---|---|
| `DOMAIN` | Domínio/subdomínio do app | `app.distribuidoragpbrasil.com.br` |
| `POSTGRES_USER` | Usuário do PostgreSQL | `pdv_admin` |
| `POSTGRES_PASSWORD` | **Senha segura** do PostgreSQL | `SuaSenhaSegura123!` |
| `POSTGRES_DB` | Nome do banco | `pdvcamaleao` |
| `JWT_SECRET` | Chave secreta JWT (gere aleatória) | `abc123def456...` |
| `JWT_REFRESH_SECRET` | Chave refresh JWT (gere aleatória) | `xyz789ghi012...` |
| `CORS_ORIGIN` | URL do frontend | `https://app.distribuidoragpbrasil.com.br` |

### 3. Rede Traefik
Certifique-se de que a rede `traefik` existe:
```bash
docker network create traefik
```

### 4. Deploy
Clique em **Deploy the stack** no Portainer.

---

## 🔧 Teste Local

Para testar localmente sem Traefik:

```bash
docker compose -f docker-compose.local.yml up -d --build
```

Acesse: `http://localhost`

**Login demo:**
- Email: `demo@pdvcamaleao.com`
- Senha: `demo123`

**PINs dos operadores:**
- Admin (Carlos): `1234`
- Gerente (Mariana): `2222`
- Caixa (João): `0000`

### Parar

```bash
docker compose -f docker-compose.local.yml down
```

### Limpar dados (reset total)

```bash
docker compose -f docker-compose.local.yml down -v
```

---

## 📁 Estrutura do Projeto

```
PDVCamaleao/
├── client/              # Frontend React + Vite + Tailwind
│   ├── Dockerfile       # Build multi-stage (Vite → Nginx)
│   ├── nginx.conf       # SPA routing + proxy /api/ → server
│   └── src/
├── server/              # Backend Node.js + Express + Prisma
│   ├── Dockerfile       # Build multi-stage (TypeScript → Node)
│   ├── prisma/
│   │   └── schema.prisma
│   └── src/
├── docker-compose.yml       # Produção (com Traefik)
├── docker-compose.local.yml # Teste local (com portas expostas)
├── .env.example             # Template de variáveis de ambiente
└── DEPLOY.md                # Este guia
```

---

## 🔒 Segurança

- **Nunca** use as senhas/chaves padrão em produção
- Gere JWT secrets aleatórios: `openssl rand -hex 32`
- O banco PostgreSQL **não** expõe porta externamente no compose de produção
- HTTPS é gerenciado automaticamente pelo Traefik + Let's Encrypt
