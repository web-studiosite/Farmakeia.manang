# 💊 FARMAKEIA — Pharmacy Management System

**FARMAKEIA** é um sistema profissional, robusto e completo para gestão operacional, farmacêutica e financeira de drogarias e farmácias, construído com foco em alta confiabilidade, controle estrito de estoque **FEFO (First Expired, First Out)**, prevenção de perdas e reconciliação financeira de caixas.

---

## 🚀 Arquitetura & Tecnologias

- **Frontend:** HTML5, CSS3 Moderno (Design System Farmacêutico), Vanilla JavaScript (ES Modules), Fontes Google (*Plus Jakarta Sans* & *JetBrains Mono*).
- **Backend & Database:** **Supabase** (PostgreSQL, Supabase Auth, Row Level Security - RLS, Stored Procedures Atômicas / RPCs).
- **Deploy:** 100% Estático. Pode ser hospedado diretamente no **GitHub Pages**, Vercel, Netlify ou qualquer servidor web estático sem necessidade de Node.js em produção.

---

## 📋 Funcionalidades Principais

### 1. Frente de Caixa & Vendas (PDV)
- Busca instantânea por nome comercial, DCB (genérico) ou leitor de código de barras (EAN-13).
- **Consumo Atômico FEFO:** As baixas no estoque sempre consomem primeiro os lotes com vencimento mais próximo.
- **Fracionamento de Embalagens:** Venda por Unidade Base (comprimido/frasco), Blister/Carteira ou Caixa completa com conversão automática de multiplicadores.
- **Comprovante Térmico (80mm/58mm):** Impressão direta formatada e compartilhamento direto via WhatsApp e Web Share API.
- **Reversão / Estorno Atômico:** Cancelamento de vendas por administradores recompõe os lotes exatos no estoque.

### 2. Gestão de Lotes & Validades (FEFO)
- Matriz de vencimentos em 5 níveis visuais:
  - 🔴 **Vencido** (Bloqueio automático de venda)
  - 🟠 **Crítico (<30 dias)**
  - 🟡 **Atenção (31 a 60 dias)**
  - 🔵 **Preventivo (61 a 90 dias)**
  - 🟢 **Regular (>90 dias)**
- Registro auditável de perdas e descartes com baixa imediata de estoque (Vencimento, Quebra/Avaria, Furto, Ajuste).

### 3. Armazém & Entradas de Mercadorias
- Entrada unificada de notas fiscais com cadastro rápido de fornecedores e produtos.
- Registro de lotes, datas de validade, custos de aquisição e novos preços de venda.

### 4. Controle de Caixa, Sangrias & Fechamento Cego
- Abertura de sessões por operador com conferência de fundo de troco inicial.
- Registro de **Sangrias** categorizadas (Destino: Cofre/Sócio vs. Depósito Bancário).
- **Fechamento Cego:** O operador informa a contagem física do dinheiro sem ver o saldo do sistema antes da conciliação.
- Identificação automática de divergências (*Sobra* ou *Falta*).

### 5. Gestão de Capital & Patrimônio Real
- Rastreio de Aportes de Sócios e Retiradas de Lucro.
- Valoração do Estoque a Preço de Custo vs. Preço de Venda.
- Estimativa do Patrimônio Farmacêutico Total (Capital Líquido + Estoque a Custo + Saldo em Gavetas).

### 6. Trilha de Auditoria Inviolável
- Registro de todas as operações críticas (Vendas, Estornos, Sangrias, Ajustes de Preço, Entradas de NF e Fechamentos).

---

## 🌐 Deploy no GitHub Pages (Zero Build / 100% Código Puro)

O **FARMAKEIA** foi estruturado em JavaScript Moderno Nativo (ES Modules) e CSS puro, permitindo deploy instantâneo em qualquer hospedagem estática:

1. Suba os arquivos do projeto para o seu repositório no GitHub (`git add .`, `git commit -m "Deploy FARMAKEIA"`, `git push origin main`).
2. No seu repositório no GitHub, clique em **Settings** > **Pages** (no menu lateral esquerdo).
3. Na seção **Build and deployment**:
   - **Source:** Selecione `Deploy from a branch`.
   - **Branch:** Selecione `main` e diretório `/ (root)`.
   - Clique em **Save**.
4. Em menos de 1 minuto seu sistema estará ativo no link:
   `https://seu-usuario.github.io/nome-do-repositorio/`
5. Acesse o sistema pelo navegador, clique em **Configurar Supabase** na tela inicial para inserir sua URL e Anon Key do Supabase, e crie seu primeiro usuário administrador!

---

## 🛠️ Como Configurar o Supabase

1. Crie um projeto gratuito ou pago no [Supabase](https://supabase.com).
2. Acesse o menu **SQL Editor** no painel do Supabase.
3. Copie todo o conteúdo do arquivo [`schema.sql`](./schema.sql) deste repositório e clique em **RUN**.
4. Acesse **Project Settings > API** no Supabase e copie a **Project URL** e a **anon public key**.
5. No FARMAKEIA, clique em **Configurações** (ou no link "Configurar Supabase" na tela de login) e cole suas credenciais.
6. Crie seu primeiro usuário administrador pela tela de cadastro inicial.
