# Runbook de Rollback Operacional (Rollback Runbook)

**Projeto:** F PAC STORE  
**Domínio Oficial:** `https://fpacstore.com.br`  
**Serviço Cloud Run:** `ais-pre-5qzcpkpneat5vzmwyn7iab`  
**Região GCP:** `us-west2`  
**Hosting Site:** `fpac-store62`  

---

## 1. Procedimento de Rollback no Google Cloud Run (Backend)

Em caso de instabilidade, regressão ou falha de inicialização na nova versão do backend, realize a reversão instantânea de tráfego para a revisão anterior estável.

### Passo 1.1: Listar as Revisões do Cloud Run
Identifique o nome da revisão saudável anterior:

```bash
gcloud run revisions list \
  --service=ais-pre-5qzcpkpneat5vzmwyn7iab \
  --region=us-west2 \
  --project=fpac-store62 \
  --format="table(name,active,creationTimestamp)"
```

### Passo 1.2: Direcionar 100% do Tráfego para a Revisão Anterior Saudável
Supondo que a revisão anterior saudável seja `ais-pre-5qzcpkpneat5vzmwyn7iab-00042-xyz`:

```bash
# Substitua REVISAO_ANTERIOR_SAUDAVEL pelo nome obtido no passo 1.1
gcloud run services update-traffic ais-pre-5qzcpkpneat5vzmwyn7iab \
  --region=us-west2 \
  --project=fpac-store62 \
  --to-revisions=REVISAO_ANTERIOR_SAUDAVEL=100
```

---

## 2. Procedimento de Rollback no Firebase Hosting (Frontend)

Se a falha for relacionada aos assets ou bundle do frontend servidos via Firebase Hosting:

### Passo 2.1: Rollback via Firebase CLI / Console
Acesse o console do Firebase ou reverta via CLI apontando para o release anterior:

```bash
# Opção A: Pelo Firebase Console
# 1. Acesse https://console.firebase.google.com/project/fpac-store62/hosting/sites/fpac-store62
# 2. Localize a lista de Histórico de versões (Release History).
# 3. No menu de três pontos da versão anterior estável, clique em "Reverter" (Rollback).

# Opção B: Re-deploy local do pacote/dist anterior validado
firebase deploy --only hosting:fpac-store62 --project fpac-store62
```

---

## 3. Validação Imediata Pós-Rollback

Após aplicar o rollback, execute a verificação obrigatória de integridade:

```bash
# 3.1. Teste de Health Check
curl -f -s -i https://fpacstore.com.br/api/health

# Saída esperada:
# HTTP/2 200
# {"status":"ok","timestamp":"..."}

# 3.2. Verificação de Integridade dos Logs no Cloud Logging
gcloud logging read "resource.type=cloud_run_revision AND resource.labels.service_name=ais-pre-5qzcpkpneat5vzmwyn7iab" \
  --project=fpac-store62 \
  --limit=20 \
  --format="table(timestamp,severity,textPayload)"
```
