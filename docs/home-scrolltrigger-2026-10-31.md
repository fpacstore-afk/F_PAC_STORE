# Home — ScrollTrigger

GSAP 3.15.0 e ScrollTrigger são carregados sob demanda exclusivamente na home, por `useHomeMotion`. Visitantes com movimento reduzido mantêm o conteúdo estático e a biblioteca não é solicitada até que a preferência mude.

- Títulos, cards e fotografias entram conforme se aproximam da tela, com deslocamento menor em celulares.
- A imagem principal do bloco “Identidade em cada detalhe” tem profundidade sincronizada com a rolagem.
- O hero, a seção PRIME e a barra de progresso acompanham a posição da página com suavização própria do ScrollTrigger.
- O scroll continua nativo. Não há seção fixada pelo plugin, desvio da roda do mouse ou carregamento de scripts por CDN.
- Conteúdo novo do catálogo/Instagram é registrado quando chega. Imagens, fontes e mudanças de tamanho atualizam as posições das animações.
- O contexto de cada breakpoint desfaz seus estilos, listeners e triggers ao mudar de tamanho, trocar a preferência de movimento ou sair da home. Conteúdo focado pelo teclado termina sua entrada imediatamente.
- Conteúdo permanece visível se o módulo opcional não carregar.

TypeScript, build e suíte completa de regressões passaram após a instalação. O lockfile adiciona somente GSAP. A prévia gerenciada inicia, mas o servidor de desenvolvimento existente bloqueia módulos de origem; nenhuma exceção de produção foi adicionada para contornar essa limitação. A conferência visual é feita também no site publicado, após os checks automáticos.

Referências: https://gsap.com/docs/v3/Plugins/ScrollTrigger/ e https://gsap.com/docs/v3/GSAP/gsap.matchMedia().
