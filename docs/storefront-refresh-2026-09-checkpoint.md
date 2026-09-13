# Storefront Refresh 2026-09 — Checkpoint

## Baseline

- Repository: `fpacstore-afk/F_PAC_STORE`
- Work branch: `feat/site-refresh-2026-09`
- Base branch: `main`
- Base commit confirmed before editing: `5ac21bf82a566ba25043b2fff3904fdc79f10cf7`
- Main is not to be edited directly.
- No merge or deploy is authorized until validation is complete.

## Protected scope for this refresh

Do not modify unless a concrete defect proves it necessary:

- backend / server behavior
- Mercado Pago integration
- Melhor Envio integration
- Firestore Rules
- deploy / hosting configuration
- GitHub Actions workflows
- infrastructure

Dynamic product prices, inventory, availability and promotions remain authoritative from the existing data sources. The storefront must not replace them with historical or hard-coded business values.

## Public code → screen map

| Screen / public area | Primary implementation | Notes |
| --- | --- | --- |
| Global shell | `src/App.tsx` | Mounts Navbar, Footer, WhatsApp, mini-player, style quiz and all public routes. |
| Home | `src/pages/HomeV2.tsx` | Hero, value props, catalog teaser, FORCE/MARK/PRIME cards, brand statement and community/history cards. |
| Header/navigation | `src/components/Navbar.tsx` | Promo ticker, desktop navigation, product navigation, search, account/auth, cart and mobile menu. |
| Footer | `src/components/Footer.tsx` | Trust strip, store/help links, newsletter, social links and exchanges/returns modal. |
| Product category landing | `src/pages/ProductCategories.tsx` | Public `/catalog` and `/produtos` category chooser. |
| Category results | `src/pages/ProductCategoryPage.tsx` | Public `/produtos/:category`; resolves products from current catalog data and renders product cards. |
| Full catalog | `src/pages/Catalog.tsx` | Public `/catalog/all`; search, filters, sorting, comparison, product grid, promotional content and FAQ. |
| Product detail | `src/pages/ProductDetail.tsx` | Product gallery, variants, inventory, shipping, add-to-cart, related/reviews and legacy PRIME code. High coupling: surgical changes only. |
| PRIME Custom | `src/pages/PrimeCustomApproved.tsx` | Active implementation. `PrimeCustomBuilder.tsx` re-exports this component and `/prime` resolves through that wrapper. |
| Cart | `src/pages/Bag.tsx` | Cart line items, quantity/selection behavior, coupon/promotion presentation, totals and checkout CTA. |
| Checkout | `src/pages/Checkout.tsx` | Customer/delivery/payment progression and order submission UI. Payment/shipping internals are protected. |
| Global styles | `src/index.css` | Tailwind theme, base rules and several mobile/global overrides. |
| Home visual overrides | `src/home-visual-fixes.css` | Mobile/tablet Home/header/footer fixes; should remain narrowly scoped and reversible. |

## Video review — visible navigation

Three owner-provided recordings were inspected before finalizing the backlog.

### PEDIDO DO PROPRIETÁRIO

- Refresh the entire public storefront without destabilizing operations.
- Preserve the F PAC visual system: black, gold/yellow, white; premium streetwear; identity, attitude, authenticity and desire.
- Improve Home, navigation, catalog, product pages, PRIME, cart, checkout and mobile responsiveness.
- Keep public management and shopping flows understandable on a phone.
- Treat PRIME Approved as the active implementation; repository inspection confirms `PrimeCustomBuilder.tsx` is only a re-export of `PrimeCustomApproved.tsx`.
- Do not invent price, stock, promotion or availability data.

### PROBLEMA IDENTIFICADO

Visible in the recordings and/or current implementation:

- Mobile navigation and footer consume substantial vertical space and compete with the persistent radio/WhatsApp controls.
- Home has strong brand blocks but the visual hierarchy is fragmented between hero, values, catalog teaser, collections and community content.
- Product discovery is split between category chooser and a second full catalog, with copy in `Catalog.tsx` still describing the experience primarily as a T-shirt collection.
- Catalog contains static merchandising claims/specifications that can become inaccurate for non-T-shirt categories.
- Category cards are structurally clean but generic; they do not expose dynamic product imagery/count/availability context.
- PRIME is functionally usable but the first-screen hierarchy is dense on mobile and the product/configuration transition can be clearer.
- `ProductDetail.tsx` contains legacy PRIME/customizer logic even though the dedicated PRIME route is active, which increases coupling and regression risk.
- The recordings also show extensive admin/management surfaces. They are not part of the first storefront block and will not be refactored while the current objective is public-storefront safety.

### MELHORIA RECOMENDADA

- Establish a consistent storefront design system through shared spacing, section labels, card radii, typography and trust patterns without broad refactors.
- Make category-first browsing the primary catalog entry and treat `/catalog/all` as an advanced/all-products view.
- Remove or soften static catalog claims that are not valid for every product/category; keep product-specific facts on product data/detail views.
- Improve mobile tap targets, sticky/fixed-control clearance, horizontal overflow prevention and visual hierarchy.
- Keep ProductDetail changes isolated to presentation/CRO blocks after category/Home/navigation work passes validation.
- Improve PRIME mobile hierarchy and CTA clarity without touching its pricing/order/cart contract.

## Priorities

### P0 — safety / correctness

- Preserve dynamic prices, stock, promotions and availability.
- Avoid backend, payment, shipping, rules, workflow or infrastructure changes.
- Remove or prevent misleading storefront-wide hard-coded product claims where they are not universally true.
- Keep mobile content clear of fixed player/WhatsApp controls.

### P1 — low-risk storefront refresh

- Home visual hierarchy and CTA consistency.
- Product category landing and category result cards.
- Global mobile storefront spacing/overflow/accessibility fixes.
- Navigation/footer presentation improvements that do not alter auth/cart/search contracts.

### P2 — conversion and product discovery

- Full catalog hierarchy, filters, product cards and comparison content.
- PRIME first-screen hierarchy and configuration guidance.
- Cart presentation, reassurance and checkout handoff.
- Checkout visual hierarchy only; do not change payment/shipping contracts.

### P3 — surgical/high-coupling

- ProductDetail CRO/visual improvements after P0-P2 are stable.
- Remove or quarantine obsolete ProductDetail PRIME presentation code only if tests and route evidence make it safe.
- Performance cleanup that does not change data contracts.

## Validation gates

For each implementation block:

1. TypeScript: `npm run lint`
2. Production build: `npm run build`
3. Relevant targeted tests (at minimum catalog and PRIME when those areas change)
4. Existing PR validation workflow
5. Review PR diff for protected-scope changes
6. No merge/deploy until the complete storefront block is reviewed and green

Rollback is preserved by keeping all refresh commits isolated on `feat/site-refresh-2026-09` and merging only through a PR.