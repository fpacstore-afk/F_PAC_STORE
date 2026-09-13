# Storefront Refresh 2026-09 — Checkpoint

## Baseline

- Repository: `fpacstore-afk/F_PAC_STORE`
- Work branch: `feat/site-refresh-2026-09`
- Base branch: `main`
- Base commit confirmed before editing: `5ac21bf82a566ba25043b2fff3904fdc79f10cf7`
- Current `main` rechecked after implementation: still `5ac21bf82a566ba25043b2fff3904fdc79f10cf7`
- The work branch is ahead of that base and behind by zero commits.
- Main was not edited directly.
- PR #54 remains the integration boundary; no merge or deploy has been performed.

## Protected scope

The refresh intentionally does not modify:

- backend / server behavior
- Mercado Pago integration
- Melhor Envio integration
- Firestore Rules
- deploy / hosting configuration
- GitHub Actions workflows
- infrastructure

Dynamic product prices, inventory, availability and promotions remain authoritative from the existing data sources. Storefront work must not replace them with historical or invented values.

## Public code → screen map

| Screen / public area | Primary implementation | Status / notes |
| --- | --- | --- |
| Global shell | `src/App.tsx` | Public routes remain unchanged except `/catalog/all` now loads the refreshed catalog implementation. |
| Home | `src/pages/HomeV2.tsx` | Refreshed hierarchy, brand positioning, CTAs, collections and community content. |
| Header/navigation | `src/components/Navbar.tsx` + mobile safeguards in CSS | Auth/search/cart/promo contracts preserved; mobile/touch behavior improved without rewriting the coupled component. |
| Footer | `src/components/Footer.tsx` | Refreshed trust, navigation, contact and returns presentation; removed nonfunctional newsletter affordance. |
| Product category landing | `src/pages/ProductCategories.tsx` | Refreshed category-first discovery for `/catalog` and `/produtos`. |
| Category results | `src/pages/ProductCategoryPage.tsx` | Refreshed cards, counts, empty states and dynamic price/product presentation. |
| Full catalog — active | `src/pages/CatalogStorefront.tsx` | New `/catalog/all` implementation using current catalog, inventory, price and promotion sources only. |
| Full catalog — rollback | `src/pages/Catalog.tsx` | Legacy implementation retained unchanged in the repository for immediate route rollback if needed. |
| Product detail | `src/pages/ProductDetail.tsx` | High coupling. Left unchanged in this branch after surgical risk review; findings recorded below. |
| PRIME Custom | `src/pages/PrimeCustomApproved.tsx` | Active implementation confirmed through `PrimeCustomBuilder.tsx`; mobile hierarchy/CRO refreshed without changing cart/upload/data contracts. |
| Cart | `src/pages/Bag.tsx` | Core stock, customer and shipping logic deliberately preserved; benefits from global mobile/touch/fixed-control safeguards. |
| Checkout | `src/pages/Checkout.tsx` | Visual hierarchy and confidence refreshed; `PaymentForm`, PIX, totals, shipping and payment contracts preserved. |
| Global styles | `src/index.css` | Overflow, focus-visible, touch targets, reduced-motion and compact mobile navigation safeguards consolidated. |
| Home visual overrides | `src/home-visual-fixes.css` | Updated to Home canonical-v5 and protects hero/fixed-control clearance on phone/tablet. |

## Video review — visible navigation

Three owner-provided recordings were inspected before implementation.

### PEDIDO DO PROPRIETÁRIO

- Refresh the entire public storefront without destabilizing operations.
- Preserve the F PAC visual system: black, gold/yellow and white; premium streetwear; identity, attitude, authenticity and desire.
- Improve Home, navigation, catalog, product pages, PRIME, cart, checkout and mobile responsiveness.
- Keep shopping flows understandable on a phone.
- Treat PRIME Approved as the active implementation; repository inspection confirmed `PrimeCustomBuilder.tsx` is a re-export of `PrimeCustomApproved.tsx`.
- Do not invent price, stock, promotion or availability data.

### PROBLEMA IDENTIFICADO

Visible in the recordings and/or repository implementation:

- Mobile navigation and footer competed for vertical space with persistent radio/WhatsApp controls.
- Home hierarchy was fragmented between hero, value props, catalog teaser, collections and community content.
- Product discovery was split between category chooser and a second full catalog with T-shirt-specific merchandising copy.
- Legacy `Catalog.tsx` inferred technical specifications and merchandising badges that are not guaranteed by product data.
- Category cards were structurally generic and discovery lacked a clear category-first hierarchy.
- PRIME first-screen hierarchy was dense on mobile and did not explain the customization sequence clearly.
- Footer exposed an email signup control with no submission behavior.
- `ProductDetail.tsx` contains inactive legacy PRIME/customizer code, increasing coupling and regression risk.
- `ProductDetail.tsx` also contains a hard-coded JSON-LD aggregate rating (`4.9`, `32 reviews`) and recommendation helpers that can infer “mais vendido” or technical specifications without explicit product data. These are correctness/trust issues, but fixing them safely requires a surgical patch rather than replacing the full highly coupled file.
- The owner videos also show extensive admin/management surfaces. They were intentionally not refactored while this branch targets the public storefront.

### MELHORIA RECOMENDADA

- Keep a consistent storefront design system through spacing, typography, card radii, black/gold/white hierarchy and confidence patterns.
- Keep category-first browsing as the primary catalog entry and `/catalog/all` as the all-products/search/filter view.
- Render product facts only when backed by current product data.
- Keep dynamic prices, inventory, availability and active promotion logic authoritative.
- Maintain at least 44px mobile tap targets and clearance from persistent controls.
- Fix `ProductDetail.tsx` structured-data/recommendation inference in an isolated patch when a partial-file edit path is available or after a dedicated full-file regression harness is added.
- Avoid refactoring cart, Navbar or ProductDetail business logic simply for visual consistency.

## Priorities and execution status

### P0 — safety / correctness

- [x] Preserve dynamic prices, stock, promotions and availability.
- [x] Avoid backend, payment, shipping, rules, workflow or infrastructure changes.
- [x] Remove storefront-wide inferred/fake merchandising claims from the active full catalog by routing to `CatalogStorefront.tsx`.
- [x] Keep mobile content clear of fixed player/WhatsApp controls.
- [ ] ProductDetail hard-coded aggregate rating / inferred recommendation claims — identified, intentionally deferred because replacing the whole high-coupling file for a small patch is disproportionate risk.

### P1 — low-risk storefront refresh

- [x] Home visual hierarchy and CTA consistency.
- [x] Product category landing and category result cards.
- [x] Global mobile storefront overflow/accessibility/touch-target fixes.
- [x] Footer presentation and trust/navigation improvements.
- [x] Navbar mobile/tablet safety improvements through scoped CSS without changing auth/cart/search behavior.

### P2 — conversion and product discovery

- [x] Full catalog hierarchy, search, collection filters, availability visibility, sorting and product cards.
- [x] PRIME first-screen hierarchy and configuration guidance.
- [x] Checkout visual hierarchy while preserving payment/shipping contracts.
- [x] Cart mobile safety via global touch/fixed-control safeguards while deliberately retaining its coupled shipping/stock/customer logic.

### P3 — surgical/high-coupling

- [ ] ProductDetail structured data correctness: remove hard-coded aggregate rating unless derived from real reviews.
- [ ] ProductDetail recommendation badges/specs: use explicit fields only; do not infer bestseller/specifications from collection names.
- [ ] Remove or quarantine obsolete ProductDetail PRIME presentation code only with dedicated regression coverage.
- [ ] Performance cleanup that does not change data contracts.

## Implemented files

- `src/App.tsx`
- `src/components/Footer.tsx`
- `src/home-visual-fixes.css`
- `src/index.css`
- `src/pages/CatalogStorefront.tsx`
- `src/pages/Checkout.tsx`
- `src/pages/HomeV2.tsx`
- `src/pages/PrimeCustomApproved.tsx`
- `src/pages/ProductCategories.tsx`
- `src/pages/ProductCategoryPage.tsx`
- this checkpoint document

No protected-scope file is present in the PR diff.

## Validation gates

The PR validation workflow covers:

1. TypeScript (`npm run lint`)
2. PRIME sizing tests
3. Catalog product tests
4. Inventory 2.0 tests
5. Orders 2.0 tests
6. Production 2.0 tests
7. Financeiro 2.0 tests
8. Shipping/Entregas 2.0 tests
9. Checkout/Pagamentos tests
10. production build
11. production preflight

Every implementation block was allowed to reach a green validation run before the next riskier block was accepted. The active catalog route was validated green after TypeScript, all targeted suites, build and preflight.

## Rollback

Rollback is preserved at multiple levels:

- all changes remain isolated on `feat/site-refresh-2026-09`;
- PR #54 is not merged;
- `main` remains at the original base commit;
- the legacy `src/pages/Catalog.tsx` remains untouched, so the full catalog route can be reverted by changing one lazy import in `src/App.tsx`;
- no deploy has been triggered from this branch.
