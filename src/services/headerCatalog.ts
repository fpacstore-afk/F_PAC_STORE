export type HeaderCatalogState =
  | { status: 'loading'; products: any[] }
  | { status: 'ready'; products: any[] }
  | { status: 'error'; products: any[] };

type Subscribe = (next: (products: any[]) => void, error: () => void) => () => void;

async function loadCatalog(): Promise<Subscribe> {
  const [{ products }, { buildSellableCatalog }, { subscribePublicProductSnapshot }] = await Promise.all([
    import('../data/products'),
    import('../lib/catalogProducts'),
    import('./publicProducts'),
  ]);
  return (next, error) => subscribePublicProductSnapshot(snapshot => {
    next(buildSellableCatalog(products, snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }))));
  }, error);
}

/** A closed search must neither subscribe late nor receive stale callbacks. */
export function observeHeaderCatalog(
  update: (state: HeaderCatalogState) => void,
  load: () => Promise<Subscribe> = loadCatalog,
) {
  let active = true;
  let unsubscribe: (() => void) | undefined;
  update({ status: 'loading', products: [] });
  const fail = () => { if (active) update({ status: 'error', products: [] }); };
  void Promise.resolve().then(load).then(subscribe => {
    if (!active) return;
    unsubscribe = subscribe(products => {
      if (active) update({ status: 'ready', products });
    }, fail);
  }).catch(fail);
  return () => { active = false; unsubscribe?.(); };
}
