# Revisão dos vídeos de segurança — 29/10/2026

Referências observadas no navegador:

- [20 coisas antes de lançar o app, @_daniellcruz](https://www.instagram.com/reel/DcZw8Gdxfsn/): a lista foi lida nos quadros do vídeo.
- [Login: hash, sal, sessão e recuperação, @destravandosaas](https://www.instagram.com/reel/DfFMcLDxUHn/): legenda e demonstração visual acessíveis. Não foi produzida uma transcrição integral do áudio.

Esta revisão complementa `docs/security-hardening-2026-10-29.md`. A plataforma usa Firebase/Firestore, não Supabase ou um banco SQL próprio.

## Correções desta revisão

1. O backend e seus source maps passam de `dist/` para `build-server/`. Firebase e Cloudflare já excluíam esses arquivos, mas o Express servia a pasta `dist` no acesso direto ao Cloud Run. A separação remove essa dependência de exclusões específicas do provedor.
2. O runtime bloqueia requisições a artefatos privados, mapas, arquivos de ambiente, chaves e diretórios internos, inclusive nomes codificados. O frontend continua em `dist/`.
3. O build falha se o frontend contiver artefatos privados, links simbólicos ou assinaturas reconhecidas de chaves privadas/tokens GitHub. A verificação não imprime valores encontrados e não pretende reconhecer todos os formatos de segredo.
4. Erros 404 da API não refletem a URL ou seus parâmetros; retornam uma mensagem fixa e `no-store`.
5. Recuperação de senha usa a mesma confirmação para conta existente ou inexistente. Erros operacionais de envio continuam sendo tratados como falha; a interface não confirma um envio que falhou por rede ou limite.
6. Erros de autenticação passam por mensagens permitidas, sem imprimir o objeto completo do provedor, credenciais, e-mail submetido ou instruções internas de configuração.
7. Atualização de perfil só envia os campos de cadastro conhecidos. Regras do Firestore também limitam criação/alteração de perfis pelos próprios clientes a esses campos; senha, token e campos de privilégios não podem ser injetados. Metadados antigos não alterados são preservados e o acesso administrativo autorizado continua disponível.
8. O formulário identifica corretamente senha nova e senha atual para o gerenciador de senhas do navegador.

## Comparação dos 20 itens

| Item do vídeo | Situação e evidência |
| --- | --- |
| 1. Esconder API keys | Segredos dos provedores e identidade administrativa ficam no servidor. A configuração pública do Firebase identifica o projeto e não substitui autorização. Build público reforçado nesta revisão. |
| 2. Limpar secrets do Git | Árvore rastreada atual examinada: 595 arquivos, sem arquivo `.env` privado ou assinatura de chave privada/token GitHub reconhecida. Isso não certifica todo o histórico nem todos os formatos de segredo; não houve reescrita de histórico ou rotação sem evidência de credencial exposta. |
| 3. Public Key DB | Chave pública do Firebase é esperada. Não foi ocultada de forma artificial nem substituída por chave administrativa no cliente. Restrições efetivas da chave na conta Cloud continuam sem certificação. |
| 4. Ativar RLS | Equivalente nesta arquitetura: Firestore/Storage Security Rules, autenticação e autorização no servidor. Emuladores isolados verificam negativas de acesso. Regras de perfil reforçadas nesta revisão. |
| 5. Criptografia de dados | HTTPS e proteção de artes privadas já implementados. Configurações de criptografia da conta Cloud e políticas de retenção não foram certificadas por esta revisão de código. |
| 6. Auth server side | API verifica token Firebase e autorização; identidade enviada no corpo não concede acesso. Mantido. |
| 7. Restringir acessos | Clientes não leem estoque, custos, todos os usuários ou dados privados de outros clientes. Acesso administrativo exige identidade autorizada. Mantido. |
| 8. Bloquear mass assignment | Checkout usa dados e preços autoritativos do servidor; catálogo usa projeção permitida. Perfil agora tem allowlist no cliente e nas regras do banco. |
| 9. Proteger cookies | A API usa token Bearer do Firebase, sem cookie próprio de sessão criado pelo Express. Flags de cookie não substituem esse fluxo. CSP permanece aplicada contra execução de scripts indevidos. |
| 10. Hash nas senhas | Senhas são entregues ao Firebase Authentication, sem tabela própria de senhas. Não foi implementado hash caseiro nem armazenamento de senha no perfil. |
| 11. Rate limit | Limites locais e transacionais entre instâncias para operações públicas sensíveis, pagamentos, contatos e artes. Mantido; limites do provedor de login são separados. |
| 12. Bot protection | Quotas e limites existentes reduzem abuso. App Check, CAPTCHA específico e regras anti-bot da conta Cloudflare não foram ativados ou certificados nesta execução. Não são declarados equivalentes a uma proteção anti-bot completa. |
| 13. Queries parametrizadas | Consultas usam SDK Firestore e validação de identificadores; não há SQL concatenado nesse fluxo. |
| 14. Validação dos inputs | Limites de corpo, campos de checkout, preço, frete, ownership e uploads já cobertos por testes. Perfil reforçado. |
| 15. “Vazar conteúdo” | O texto exibido no vídeo é ambíguo. Não é tratado como instrução para divulgar dados. Foram reforçadas as proteções contra exposição de arquivos internos e reflexão de dados em erros. |
| 16. Restringir uploads | Decodificação real, formatos e limites de imagem, remoção de metadados, artes privadas e bloqueio de importação de redes internas já presentes. Mantido. |
| 17. Trim respostas de API | Catálogo tem allowlist em todos os níveis; preços de custo e fornecedores não passam para a projeção pública. Erro 404 agora também tem resposta mínima. |
| 18. Security headers | CSP, HSTS, nosniff, política de referenciador e permissões consistentes em Express, Firebase e Cloudflare. Mantido. |
| 19. Forçar HTTPS | Hosting/Cloud Run em HTTPS e HSTS/CSP de produção. Não se desativou validação TLS. |
| 20. Scan de dependências | `npm run security:audit` bloqueia publicação com vulnerabilidades altas/críticas em dependências de produção. Mantido; o novo scan de artefatos também executa no build. |

## Segundo vídeo: login e sessões

O fluxo existente usa `signInWithEmailAndPassword`, `signInWithPopup`, `sendPasswordResetEmail`, `getIdToken` e `signOut` do Firebase. O servidor verifica tokens, sua assinatura, validade e permissão; os testes já cobrem falha de restauração de sessão, troca de conta e impedimento de repetir mutação como visitante.

Hash/sal e emissão/validação de links de recuperação ficam com o provedor. A aplicação não cria um link próprio reutilizável, não envia uma senha por e-mail e não grava senha no Firestore. Nesta revisão, a apresentação do resultado de recuperação e dos erros de autenticação ficou mais reservada. Isso reduz enumeração pela interface; ativar a proteção de enumeração no provedor é necessário para cobrir também chamadas diretas à API do Firebase.

**Dois fatores não foram ativados.** A ativação no Firebase exige verificar o suporte/configuração do projeto e cadastrar um segundo fator da conta; a integração de desafio e recuperação também precisa ser validada antes de exigir MFA. No login Google, dois fatores dependem da proteção da própria conta Google. As ferramentas autenticadas disponíveis nesta execução permitem a publicação do código, mas não oferecem leitura/alteração de configuração do Firebase Authentication nem o cadastro do fator pessoal do proprietário. Não foram criadas contas, alteradas senhas ou coletados códigos de recuperação.

Permanecem sem confirmação na conta do provedor: MFA, proteção de enumeração de e-mails, política de senha e proteção específica contra bots no login. Não foram acrescentados bloqueios apenas no navegador apresentados como segurança de servidor. A revisão não atesta esses recursos como ativos.

Documentação primária consultada:

- https://firebase.google.com/docs/projects/api-keys
- https://firebase.google.com/docs/auth/web/password-auth
- https://firebase.google.com/docs/auth/web/totp-mfa
- https://firebase.google.com/docs/auth/limits
- https://expressjs.com/en/resources/middleware/serve-static/
- https://vite.dev/config/shared-options

## Validação e limites

Testes novos usam somente diretórios temporários, servidor local e banco isolado: bloqueio de artefatos em GET/HEAD, frontend permitido, scan de artefatos, mensagens de autenticação, recuperação com conta ausente, falha de rede/limite, whitelist de perfil e não reflexão de parâmetros da API. As regras são verificadas contra emuladores com projeto `demo-`, incluindo injeção de senha/token/privilégios e preservação de metadados antigos.

O fluxo de publicação valida a revisão candidata sem tráfego antes de promovê-la. Esta alteração não movimenta estoque, altera pedidos, faz cobranças ou envia mensagens a clientes. O reset é testado com dependência simulada, sem e-mails reais. O marcador da reorganização de estoque não é utilizado nesta publicação.
