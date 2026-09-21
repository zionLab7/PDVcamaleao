# 🚀 Como Subir o PDV Camaleão no Servidor (Docker & Portainer)

O PDV Camaleão foi convertido em um **Web App SaaS Multi-Tenant**. Cada comércio tem seus dados isolados e acessa via navegador.

---

## 📦 Estrutura dos Serviços (Docker Compose)

O sistema é composto por 3 containers orquestrados:
1. **`db`**: PostgreSQL 16 com volume persistente para dados seguros.
2. **`server`**: API Node.js + Express + Prisma ORM (porta interna 3001).
3. **`client`**: Frontend Web React 19 compilado servido via Nginx (porta 80). Faz proxy transparente de `/api/` para o container do backend.

---

## 🛠️ Opção 1: Deploy Direto via Terminal (SSH no Servidor)

1. Envie a pasta do projeto para o seu servidor VPS (ex: via Git ou rsync/scp):
   ```bash
   git clone <seu-repositorio> pdv-camaleao
   cd pdv-camaleao
   ```

2. Suba os containers com um único comando:
   ```bash
   docker compose up -d --build
   ```

3. O container do backend executa automaticamente o **`prisma db push`** e o **`seed`** inicial com os dados da loja de demonstração.

4. Acesse no navegador:
   ```
   http://IP_DO_SEU_SERVIDOR/
   ```

---

## 🐳 Opção 2: Deploy no Portainer (Stacks)

1. Abra seu painel do **Portainer**.
2. Vá em **Stacks** → **Add stack**.
3. Escolha **Repository** (se o projeto estiver no GitHub/GitLab) ou cole o conteúdo do `docker-compose.yml` na aba **Web editor**.
4. Configure as variáveis de ambiente opcionais (ou use os padrões seguros):
   - `POSTGRES_USER`: `pdv_admin`
   - `POSTGRES_PASSWORD`: `uma_senha_forte_aqui`
   - `POSTGRES_DB`: `pdvcamaleao`
   - `JWT_SECRET`: `sua_chave_jwt_secreta`
   - `PORT`: `80`
5. Clique em **Deploy the stack**.

---

## 🔑 Credenciais Iniciais de Demonstração (Seed)

O banco já vem inicializado com uma loja pronta para uso:

### 1. Login da Loja (Camada de Empresa)
- **E-mail**: `demo@pdvcamaleao.com`
- **Senha**: `demo123`

### 2. Operadores de Caixa (Camada de Caixa - PIN)
- **Dono (Carlos Oliveira)**: PIN `1234` (Acesso completo a estoque, relatórios e ajustes)
- **Gerente (Mariana Santos)**: PIN `2222` (Operações e estoque)
- **Caixa (João Pedro)**: PIN `0000` (Frente de caixa rápida)

---

## 👥 Como Cadastrar um Novo Cliente / Loja

Como definido, o cadastro de novos clientes é feito internamente pela sua equipe administrativa.

Para criar um novo cliente no banco de dados, você pode:

1. **Via script (terminal no servidor)**:
   ```bash
   docker exec -it pdv_server npx ts-node -e '
   const { PrismaClient } = require("@prisma/client");
   const bcrypt = require("bcrypt");
   const prisma = new PrismaClient();
   async function addStore(name, email, pass) {
     const hash = await bcrypt.hash(pass, 12);
     const pin = await bcrypt.hash("1234", 10);
     const t = await prisma.tenant.create({
       data: {
         name, email, password: hash,
         storeSetting: { create: { storeName: name } },
         users: { create: [{ name: "Dono", role: "admin", pin }] },
         cashRegisters: { create: [{ isOpen: true, currentBalance: 0 }] }
       }
     });
     console.log("Loja criada! ID:", t.id);
   }
   addStore("Padaria Estrela", "padaria@estrela.com", "senha123");
   '
   ```

2. **Ou conectando diretamente no PostgreSQL** usando o DBeaver / pgAdmin / TablePlus apontando para a porta 5432 do seu servidor.
