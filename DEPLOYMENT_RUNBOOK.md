# Runbook de Deploy para Produção (Deployment Runbook)

**Projeto:** F PAC STORE  
**Domínio Oficial:** `https://fpacstore.com.br`  
**Firebase Project ID:** `fpac-store62`  
**Serviço Cloud Run:** `ais-pre-5qzcpkpneat5vzmwyn7iab`  
**Região GCP:** `us-west2`  

---

## 1. Pré-Requisitos e Autenticação

Execute o login no Google Cloud SDK e selecione o projeto oficial:

```bash
# 1.1. Login e Seleção do Projeto Google Cloud
gcloud auth login
gcloud config set project fpac-store62

# 1.2. Login na CLI do Firebase
firebase login
firebase use fpac-store62
```

---

## 2. Configuração de Segredos no Google Cloud Secret Manager

Provisione ou atualize as credenciais no Secret Manager sem expor valores em arquivos do repositório:

```bash
# 2.1. Criar ou atualizar os segredos obrigatórios
gcloud secrets create MERCADO_PAGO_ACCESS_TOKEN --data-file=- <<< "SEU_MERCADO_PAGO_ACCESS_TOKEN"
gcloud secrets create MERCADO_PAGO_WEBHOOK_SECRET --data-file=- <<< "SEU_MERCADO_PAGO_WEBHOOK_SECRET"
gcloud secrets create MELHOR_ENVIO_TOKEN --data-file=- <<< "SEU_MELHOR_ENVIO_TOKEN"
gcloud secrets create RESEND_API_KEY --data-file=- <<< "SEU_RESEND_API_KEY"
gcloud secrets create ADMIN_API_KEY --data-file=- <<< "SUA_ADMIN_API_KEY"
gcloud secrets create SHIPPING_WEBHOOK_SECRET --data-file=- <<< "SEU_SHIPPING_WEBHOOK_SECRET"
gcloud secrets create SHEETS_SYNC_SECRET --data-file=- <<< "SEU_SHEETS_SYNC_SECRET"
gcloud secrets create FIREBASE_SERVICE_ACCOUNT --data-file=/caminho/para/service-account.json

# 2.2. Conceder permissão de leitura ao Service Account do Cloud Run
PROJECT_NUMBER=$(gcloud projects describe fpac-store62 --format="value(projectNumber)")
gcloud projects add-iam-policy-binding fpac-store62 \
  --member="serviceAccount:${PROJECT_NUMBER}-compute@developer.gserviceaccount.com" \
  --role="roles/secretmanager.secretAccessor"
```

---

## 3. Build da Aplicação e Pré-Verificação Local

Antes de publicar, execute o ciclo local de compilação e preflight:

```bash
# 3.1. Instalação e Limpeza
npm ci
npm run clean

# 3.2. Verificação de Tipos e Lint
npm run lint

# 3.3. Compilação do Frontend (Vite) e Backend (Esbuild)
npm run build

# 3.4. Execução do Preflight Automatizado
npm run preflight:production
```

---

## 4. Publicação do Backend no Google Cloud Run

Faça o deploy do serviço Express no Cloud Run mapeando as variáveis e secrets:

```bash
gcloud run deploy ais-pre-5qzcpkpneat5vzmwyn7iab \
  --project=fpac-store62 \
  --region=us-west2 \
  --source=. \
  --platform=managed \
  --allow-unauthenticated \
  --set-env-vars="NODE_ENV=production,FIREBASE_PROJECT_ID=fpac-store62,FIREBASE_DATABASE_ID=ai-studio-a7d50f8c-9b01-4490-9a13-dd8892e0c41a,ALLOWED_ORIGINS=https://fpacstore.com.br,https://www.fpacstore.com.br,ORIGIN_CEP=89234-100,MELHOR_ENVIO_URL=https://www.melhorenvio.com.br,MERCADO_PAGO_WEBHOOK_URL=https://fpacstore.com.br/api/webhook/mercadopago" \
  --set-secrets="MERCADO_PAGO_ACCESS_TOKEN=MERCADO_PAGO_ACCESS_TOKEN:latest,MERCADO_PAGO_WEBHOOK_SECRET=MERCADO_PAGO_WEBHOOK_SECRET:latest,MELHOR_ENVIO_TOKEN=MELHOR_ENVIO_TOKEN:latest,RESEND_API_KEY=RESEND_API_KEY:latest,ADMIN_API_KEY=ADMIN_API_KEY:latest,SHIPPING_WEBHOOK_SECRET=SHIPPING_WEBHOOK_SECRET:latest,SHEETS_SYNC_SECRET=SHEETS_SYNC_SECRET:latest,FIREBASE_SERVICE_ACCOUNT=FIREBASE_SERVICE_ACCOUNT:latest" \
  --timeout=300 \
  --memory=1Gi \
  --cpu=1 \
  --min-instances=1 \
  --max-instances=10
```

---

## 5. Publicação de Regras, Índices e Firebase Hosting

Publique o ecossistema Firebase preservando o Database ID e Site oficiais:

```bash
# 5.1. Deploy de Security Rules e Índices do Firestore
firebase deploy --only firestore:rules,firestore:indexes --project fpac-store62

# 5.2. Deploy de Regras do Firebase Storage
firebase deploy --only storage --project fpac-store62

# 5.3. Deploy do Firebase Hosting (com rewrite para o Cloud Run)
firebase deploy --only hosting:fpac-store62 --project fpac-store62
```

---

## 6. Configuração e Validação de Domínio Customizado

Garanta que os registros DNS apontem para o Firebase Hosting:

1. Acesse o console do Firebase em **Hosting > Adicionar domínio personalizado**.
2. Insira `fpacstore.com.br` e `www.fpacstore.com.br`.
3. Verifique os registros DNS do tipo **A** e **TXT** no provedor de domínio.
4. Aguarde o provisionamento automático do certificado SSL pela Google Trust Services.

---

## 7. Configuração do Webhook no Painel Mercado Pago

1. Acesse o painel de desenvolvedor do Mercado Pago.
2. Navegue até **Suas integrações > Webhooks / Notificações IPN**.
3. Configure a URL de Notificação para:
   ```text
   https://fpacstore.com.br/api/webhook/mercadopago
   ```
4. Marque os tópicos obrigatórios:
   - `payment` (Pagamentos)
   - `merchant_order` (Ordens de Pagamento)
5. Copie o **Secret de Assinatura** e certifique-se de que corresponda a `MERCADO_PAGO_WEBHOOK_SECRET` no Secret Manager.

---

## 8. Smoke Test Pós-Deploy

Execute os testes de verificação funcional imediata pós-publicação:

```bash
# 8.1. Health Check do Backend via Domínio Principal
curl -f -s -i https://fpacstore.com.br/api/health
# Resposta esperada: HTTP/2 200 OK com {"status":"ok", "timestamp":"..."}

# 8.2. Verificação de CORS
curl -s -I -H "Origin: https://fpacstore.com.br" https://fpacstore.com.br/api/health | grep -i "access-control-allow-origin"
# Resposta esperada: access-control-allow-origin: https://fpacstore.com.br

# 8.3. Verificação de Fallback SPA (Rota de Produtos)
curl -s -I https://fpacstore.com.br/produto/camiseta-force | grep -i "content-type: text/html"

# 8.4. Verificação de Rota Inexistente de API (Isolamento JSON 404)
curl -s https://fpacstore.com.br/api/rota-inexistente-teste | grep -i "Rota de API não encontrada"
```
