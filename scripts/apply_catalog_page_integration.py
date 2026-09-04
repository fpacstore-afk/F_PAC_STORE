from pathlib import Path
import subprocess


def replace_between(text: str, start_marker: str, end_marker: str, replacement: str) -> str:
    start = text.find(start_marker)
    if start < 0:
        raise SystemExit(f"start marker not found: {start_marker!r}")
    end = text.find(end_marker, start)
    if end < 0:
        raise SystemExit(f"end marker not found: {end_marker!r}")
    return text[:start] + replacement + text[end:]


def replace_required(text: str, old: str, new: str, label: str) -> str:
    if old in text:
        return text.replace(old, new)
    if new in text:
        return text
    raise SystemExit(f"required replacement not found for {label}")


catalog_path = Path("src/pages/Catalog.tsx")
catalog = catalog_path.read_text()

catalog_import = "import { buildSellableCatalog } from '../lib/catalogProducts';\n"
if catalog_import not in catalog:
    anchor = "import { WeeklyPromotion } from '../types/promotions';\n"
    if anchor not in catalog:
        raise SystemExit("Catalog import anchor not found")
    catalog = catalog.replace(anchor, anchor + catalog_import, 1)

catalog = catalog.replace(
    "const [products, setProducts] = useState<any[]>(staticProducts);",
    "const [products, setProducts] = useState<any[]>(() => buildSellableCatalog(staticProducts, []));",
    1,
)

catalog_effect = '''  // Real-time product snapshot syncing. Firestore/admin data is authoritative;
  // static data is only a fallback for fields the admin has not configured.
  useEffect(() => {
    setLoading(true);
    const q = collection(db, 'products');
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const dynamicData = snapshot.docs.map(docSnap => ({ id: docSnap.id, ...docSnap.data() }));
      setProducts(buildSellableCatalog(staticProducts, dynamicData));
      setLoading(false);
    }, (error) => {
      console.warn("Erro/Quota no Firestore ao carregar catálogo. Usando catálogo estático fallback:", error);
      setProducts(buildSellableCatalog(staticProducts, []));
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

'''
catalog = replace_between(
    catalog,
    "  // Real-time product snapshot syncing\n",
    "  // Filter and Search displayed products\n",
    catalog_effect,
)

catalog_path.write_text(catalog)


detail_path = Path("src/pages/ProductDetail.tsx")
detail = detail_path.read_text()

detail_import = 'import { buildSellableCatalog, resolveCatalogProduct } from "../lib/catalogProducts";\n'
if detail_import not in detail:
    anchor = 'import { WeeklyPromotion } from "../types/promotions";\n'
    if anchor not in detail:
        raise SystemExit("ProductDetail import anchor not found")
    detail = detail.replace(anchor, anchor + detail_import, 1)

old_initial = '''  const initialProduct = getProductBySlug(slug || "");
  const [product, setProduct] = useState<Product | null>(
    (initialProduct as any) || null,
  );
'''
new_initial = '''  const initialProduct = resolveCatalogProduct(slug || "", staticProducts, []);
  const [product, setProduct] = useState<Product | null>(
    (initialProduct as Product | null) || null,
  );
'''
if old_initial in detail:
    detail = detail.replace(old_initial, new_initial, 1)
elif "const initialProduct = resolveCatalogProduct" not in detail:
    raise SystemExit("ProductDetail initial product block not found")

all_products_effect = '''  useEffect(() => {
    const q = collection(db, "products");
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const dynamicData = snapshot.docs.map((docSnap) => ({
        id: docSnap.id,
        ...docSnap.data(),
      }));
      setAllProducts(buildSellableCatalog(staticProducts, dynamicData));
    }, (error) => {
      console.error("Erro ao carregar catálogo relacionado:", error);
      setAllProducts(buildSellableCatalog(staticProducts, []));
    });
    return () => unsubscribe();
  }, []);
'''
detail = replace_between(
    detail,
    '  useEffect(() => {\n    const q = collection(db, "products");\n',
    '  const [showReviewForm, setShowReviewForm] = useState(false);\n',
    all_products_effect,
)

product_sync_effect = '''  useEffect(() => {
    if (!slug) return;

    const decodedSlug = decodeURIComponent(slug).trim();
    const slugLower = decodedSlug.toLowerCase();

    // Base models are managed on their model pages, not as sellable catalog items.
    if (slugLower === "force" || slugLower === "mark" || slugLower === "prime") {
      setLoading(false);
      return;
    }

    setLoading(true);
    const unsubscribe = onSnapshot(
      collection(db, "products"),
      (snapshot) => {
        const dynamicData = snapshot.docs.map((docSnap) => ({
          id: docSnap.id,
          ...docSnap.data(),
        }));
        setProduct(resolveCatalogProduct(decodedSlug, staticProducts, dynamicData) as Product | null);
        setLoading(false);
      },
      (error) => {
        console.error("Erro ao carregar produto:", error);
        setProduct(resolveCatalogProduct(decodedSlug, staticProducts, []) as Product | null);
        setLoading(false);
      },
    );

    return () => unsubscribe();
  }, [slug]);

'''
detail = replace_between(
    detail,
    '  useEffect(() => {\n    if (!slug) return;\n',
    '  const isPrime = false;\n',
    product_sync_effect,
)

detail = detail.replace(
    'const sizes = product.sizes || ["P", "M", "G", "GG"];',
    'const sizes = product.sizes || [];',
    1,
)

detail_path.write_text(detail)


# Administrative inventory safety: never invent stock for missing variants/sizes.
admin_path = Path("src/components/admin/products/ProductManagementDrawer.tsx")
admin = admin_path.read_text()
admin = replace_required(
    admin,
    "sizeStock: DEFAULT_SIZES.map(s => ({ size: s, quantity: 10, minStock: 2, reserved: 0 }))",
    "sizeStock: DEFAULT_SIZES.map(s => ({ size: s, quantity: 0, minStock: 2, reserved: 0 }))",
    "initial form size stock",
)
admin = replace_required(
    admin,
    "quantity: product.stock ? Math.floor(product.stock / sizes.length) : 10,",
    "quantity: 0,",
    "existing product missing size stock",
)
admin = replace_required(
    admin,
    "stockVal = foundSize ? Number(foundSize.quantity) || 0 : 5;",
    "stockVal = foundSize ? Number(foundSize.quantity) || 0 : 0;",
    "missing variant stock fallback",
)
admin = replace_required(
    admin,
    "sizeStock: defaultSizes.map(s => ({ size: s, quantity: 10, minStock: 2, reserved: 0 }))",
    "sizeStock: defaultSizes.map(s => ({ size: s, quantity: 0, minStock: 2, reserved: 0 }))",
    "new product size stock",
)
admin = replace_required(
    admin,
    "initMap[key] = 10;",
    "initMap[key] = 0;",
    "new product variant initial map",
)
admin = replace_required(
    admin,
    "currentStock: 10,",
    "currentStock: 0,",
    "new product variant current stock",
)
admin = replace_required(
    admin,
    "directStockValue: 10,",
    "directStockValue: 0,",
    "new product variant direct stock",
)
admin = replace_required(
    admin,
    "const currentStock = existingRow ? calculateResultingStock(existingRow) : (newInitMap[key] ?? 10);",
    "const currentStock = existingRow ? calculateResultingStock(existingRow) : (newInitMap[key] ?? 0);",
    "new variation sync fallback",
)
admin = replace_required(
    admin,
    "quantity: prev.sizeStock?.find(st => st.size === s)?.quantity ?? 10,",
    "quantity: prev.sizeStock?.find(st => st.size === s)?.quantity ?? 0,",
    "new size fallback",
)
admin_path.write_text(admin)

# The workflow historically only committed storefront pages. Commit the admin safety
# correction here on the safe branch so it is preserved, then let CI validate the commit.
if subprocess.run(["git", "diff", "--quiet", "--", str(admin_path)]).returncode != 0:
    subprocess.run(["git", "config", "user.name", "github-actions[bot]"], check=True)
    subprocess.run(["git", "config", "user.email", "41898282+github-actions[bot]@users.noreply.github.com"], check=True)
    subprocess.run(["git", "add", str(admin_path)], check=True)
    subprocess.run(["git", "commit", "-m", "fix: default unknown catalog inventory to zero"], check=True)
    subprocess.run(["git", "push", "origin", "HEAD:fix/catalog-products-certification"], check=True)

print("Catalog storefront integration and zero-safe admin inventory defaults applied.")
