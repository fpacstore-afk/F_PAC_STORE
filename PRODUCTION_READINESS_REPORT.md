# Relatório de Prontidão para Produção (Production Readiness Report)

**Projeto:** F PAC STORE  
**Domínio Oficial:** `https://fpacstore.com.br` / `https://www.fpacstore.com.br`  
**Base Funcional:** FASE 9.6.8 (100% Certificada e Congelada)  
**Data:** 18 de Agosto de 2026  
**Status Geral:** **PRONTO PARA DEPLOY (0 BLOQUEIOS TÉCNICOS)**

---

## 1. Sumário Executivo de Infraestrutura

| Componente | Configuração Oficial | Estado de Conformidade |
| :--- | :--- | :--- |
| **Firebase Project** | `fpac-store62` | Preservado e Auditado |
| **Firebase Hosting Site** | `fpac-store62` | Rewrite ativo para Cloud Run |
| **Firestore Database** | `ai-studio-a7d50f8c-9b01-4490-9a13-dd8892e0c41a` | Índices e Security Rules compilados |
| **Storage Bucket** | `fpac-store62.firebasestorage.app` | Regras RBAC auditadas |
| **Backend Compute** | Google Cloud Run (`ais-pre-5qzcpkpneat5vzmwyn7iab`) | Região `us-west2` |
| **Runtime & Servidor** | Node.js / Express em `server.ts` (dist/server.cjs) | Porta dinâmica `process.env.PORT` |
| **Frontend Framework** | React 18 + Vite SPA | Bundle otimizado em `dist/` |
| **CORS Whitelist** | `https://fpacstore.com.br`, `https://www.fpacstore.com.br` | Estrito e validado |

---

## 2. Matriz de Auditoria e Certificação

### 2.1. Cobertura de Testes e Regressão
- **Total de Suítes Executadas:** 15/15 suítes aprovadas (100% PASS, 0 FAIL).
- **Hardening de Fuso Horário e Execução Comercial (Fase 9.6.7):** 49/49 testes aprovados sem desvio de UTC/America/Sao_Paulo.
- **Governança e Imutabilidade Orçamentária (Fase 9.6.6):** 30/30 testes aprovados.
- **Fechamento e Aprendizado Histórico (Fase 9.6.8):** 154/154 testes aprovados.

### 2.2. Segurança e Gestão de Segredos
- **Vazamento de Segredos em Código:** 0 ocorrências detectadas.
- **Variáveis VITE_* Públicas:** Apenas credenciais públicas de cliente (API keys de frontend e preset de upload).
- **Variáveis Privadas e Tokens de Gateway:** Isolados para injeção exclusiva via Google Cloud Secret Manager.
- **Variável Legada `MP_ACCESS_TOKEN`:** Removida e validada via preflight.
- **Paridade de Credenciais Mercado Pago:** Validação estrita entre Public Key e Access Token (ambos no mesmo modo `APP_USR-` ou `TEST-`).

### 2.3. Roteamento e Resiliência
- **Fallback SPA:** `/*` serve `dist/index.html` em produção para navegação de rotas no cliente.
- **Isolamento de API:** `/api/**` retorna 404/500 JSON sem interceptação pelo fallback de HTML.
- **Health Check Endpoint:** `GET /api/health` retorna `{"status":"ok", "timestamp":"..."}` com HTTP 200 e zero exposição de variáveis ou metadados de infraestrutura.

---

## 3. Lista de Configurações a Preencher no Secret Manager (Sem Dados Sensíveis)

Antes do deploy em produção, certifique-se de que os seguintes nomes de secrets estejam provisionados no Google Cloud Secret Manager:

1. `MERCADO_PAGO_ACCESS_TOKEN` (Chave de produção `APP_USR-...`)
2. `MERCADO_PAGO_WEBHOOK_SECRET` (Assinatura de validação de notificações)
3. `MELHOR_ENVIO_TOKEN` (Token JWT de autenticação de frete)
4. `RESEND_API_KEY` (Chave para automação de emails transacionais)
5. `SHIPPING_WEBHOOK_SECRET` (Chave de autenticação do webhook de rastreio)
6. `SHEETS_SYNC_SECRET` (Chave para sincronização de pedidos com planilhas)
7. `ADMIN_API_KEY` (Chave para automações de cron e integrações administrativas)
8. `FIREBASE_SERVICE_ACCOUNT` (Credencial JSON da Service Account)

---

## 4. Declaração de Não-Deploy
- **Nenhum deploy para Cloud Run ou Firebase Hosting foi realizado nesta etapa.**
- A base de código está 100% compilada, testada e empacotada no arquivo binário `fpac_store_production_ready.zip`.
