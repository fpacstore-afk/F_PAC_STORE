# Verificação e correções de autenticação — 08/11/2026

## Configuração confirmada

A conta da loja no Console do Firebase permite consultar o projeto `fpac-store62`. O projeto já usa Authentication with Identity Platform e o plano Blaze. A limitação anterior `firebaseauth.configs.get` pertence à identidade técnica do pipeline, não comprova que o proprietário está sem acesso.

Na consulta inicial:

- Proteção contra enumeração de e-mails ativada.
- Limite nativo de novas contas por IP de 100 por hora.
- Política de senha com mínimo de 6 caracteres, sem atualização forçada no login.
- MFA por SMS desativado.
- A API pública de configuração usada pelo SDK retornou ausência de chave reCAPTCHA e estado não configurado para e-mail/senha. Essa consulta não cria contas nem realiza login.
- O estado TOTP é conferido separadamente pela identidade de execução existente, pois a tela do Firebase mostra apenas o controle de SMS.

## Correções

O site passa a tratar o desafio de segundo fator retornado pelo Firebase tanto no login Google quanto no login com senha. O código de 6 números é validado contra um fator pertencente ao desafio. A sessão é concluída pelo provedor, sem aceitar autenticação apenas no navegador. Erros exibidos não contêm códigos, tokens ou detalhes da conta.

Em **Minha conta → Segurança da conta**, o titular pode configurar seu aplicativo autenticador. O fluxo exige e-mail verificado, confirmação recente de identidade e um código do aparelho do titular. O Firebase fornece a chave de configuração; a aplicação mantém sua cópia somente na memória da página e gera o QR code localmente. Essa cópia não é registrada em perfil, armazenamento persistente, backend da loja ou logs. O próprio Firebase é responsável pelo armazenamento e pela validação do fator após o cadastro confirmado pelo titular. A aplicação não oferece exclusão de fatores nesta alteração.

A ativação do recurso TOTP no projeto não cadastra automaticamente um autenticador em nenhuma conta. O titular precisa finalizar a configuração no próprio aparelho. Até essa confirmação, não se deve afirmar que a conta está protegida por dois fatores.

Novos cadastros passam a validar a política de senha do provedor antes de criar a conta, com orientação de mínimo de 12 caracteres. O job de configuração usa a identidade já utilizada pela aplicação, sem alterar IAM, permissões ou credenciais. Ele habilita TOTP opcional, conserva o estado de SMS, preserva requisitos mais fortes, mantém a proteção contra enumeração e exige mínimo de 12 caracteres para novas senhas. Não força mudança de senha no login nem modifica usuários, pedidos ou dados financeiros.

O job relê e verifica a configuração depois da alteração. Os registros `AUTH_SECURITY_BEFORE` e `AUTH_SECURITY_AFTER` contêm somente indicadores de configuração, sem chaves, códigos ou contas de usuários. Ele executa somente no push autorizado com `[auth-hardening-20261108]`, depois da publicação da interface compatível. O resultado do job, e não a leitura limitada da identidade de CI, determina o estado verificado.

## Proteção contra robôs

O reCAPTCHA foi confirmado como não configurado. A SDK Firebase atual suporta a integração nativa quando habilitada no provedor. Esta entrega não a habilita silenciosamente: a ativação aceita termos específicos do Google e pode gerar cobranças acima da franquia. A proteção por cotas e os limites das APIs existentes continuam operando.

Antes da ativação, a opção concreta é iniciar em **AUDIT** para observar o tráfego, ajustar e validar o login; somente depois considerar **ENFORCE**, conforme orientação oficial. AUDIT mede risco e não equivale a bloquear robôs. O plano separado está implementado e só executa com o marcador `[recaptcha-audit-20261108]`, após autorização explícita dos termos e cobrança; o push desta correção usa apenas `[auth-hardening-20261108]`. O plano conserva configurações existentes e nunca reduz ENFORCE para AUDIT. A etapa depende da autorização para o serviço e de uma validação de tráfego real; não é possível demonstrar eficácia contra bots apenas com testes unitários.

## Verificação

As regressões cobrem desafio TOTP, rejeição de fator indevido e código inválido, mensagens reservadas, preservação de políticas mais fortes, SMS desativado, ausência de ativação implícita de reCAPTCHA e preservação de logins existentes. O pipeline executa ainda todos os testes isolados, TypeScript, build público sem segredos e emuladores das regras de acesso.

Fontes primárias:

- https://firebase.google.com/docs/auth/web/totp-mfa
- https://docs.cloud.google.com/identity-platform/docs/password-policy
- https://docs.cloud.google.com/identity-platform/docs/recaptcha-enterprise
- https://docs.cloud.google.com/recaptcha/docs/billing-information
