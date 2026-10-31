# Segurança — Reel de 31/10/2026

Referência: https://www.instagram.com/reel/DePJrTNgh3b/, de @krishanu.builds. A legenda observada no navegador recomenda proteger chaves de API, rotas administrativas, banco de dados e senhas. O prompt completo é oferecido pelo autor por mensagem privada e não foi obtido; nenhuma mensagem foi enviada. Esta alteração aplica os quatro temas que estavam acessíveis.

## Verificação e mudanças

- A API já verifica o token Firebase e a permissão administrativa. Agora todas as respostas do middleware administrativo, inclusive negativas e autenticação por chave, enviam `Cache-Control: private, no-store` e variam pelos cabeçalhos de autenticação. O teste de publicação exige essa proteção na revisão candidata e nos domínios públicos.
- Firestore e Storage já isolam estoque, custos, dados pessoais e credenciais das integrações. Perfis de clientes têm campos permitidos e não podem atribuir privilégios. Nenhuma regra do banco foi afrouxada ou alterada nesta revisão.
- Senhas são tratadas pelo Firebase Authentication. A aplicação já impede gravação de senha/token no perfil e apresenta confirmação reservada na recuperação. Configurações do provedor (MFA, proteção de enumeração e política de senha) continuam sem certificação: a identidade de publicação anteriormente recebeu 403 ao consultar essas configurações. Não se alteraram contas ou permissões.
- A configuração do Vite rejeita variáveis públicas `VITE_` que identificam credenciais privadas. Configurações públicas necessárias do Firebase e a public key do Mercado Pago são preservadas.
- A verificação do frontend passa a reconhecer outras assinaturas de credenciais e valores privados presentes no ambiente de build, inclusive formas JSON e URL. Só registra arquivo e categoria do bloqueio. Isso amplia a verificação existente; não certifica todos os possíveis formatos ou todo o histórico Git.
- Logs passam a ocultar nomes equivalentes de credenciais em cabeçalhos, parâmetros, objetos e mensagens: hífens, underscores, camelCase, parâmetros codificados, cookies, Basic/Bearer e blocos de chave privada. A inicialização também deixa de imprimir fragmentos da credencial de pagamento.

## Validação

Testes isolados verificam a rejeição pela configuração real do Vite, os artefatos com segredos simulados, as variantes de log e as respostas administrativas com cliente comum, token inválido e administrador autorizado. Nenhuma cobrança, comunicação com cliente ou alteração de registros de produção é necessária.

TypeScript, build, preflight e suíte completa de regressões passaram antes da etapa de animação da home. A auditoria de produção não apontou vulnerabilidades altas ou críticas; retornou quatro moderadas na cadeia opcional `google-gax → rimraf → glob/minimatch`. A tentativa de correção sem alterar versões principais não as resolveu; não se forçou uma troca incompatível da SDK de banco. O CI repete a validação com Node 22 e emuladores isolados antes da publicação.

Fontes técnicas consultadas: https://vite.dev/guide/env-and-mode e https://firebase.google.com/docs/projects/api-keys.
