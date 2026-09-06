from pathlib import Path
import subprocess


def replace_required(text: str, old: str, new: str, label: str) -> str:
    if old in text:
        return text.replace(old, new)
    if new in text:
        return text
    raise SystemExit(f"required replacement not found for {label}")


# Storefront authority integration must already be present before applying the
# final administrative inventory safety correction.
catalog = Path("src/pages/Catalog.tsx").read_text()
detail = Path("src/pages/ProductDetail.tsx").read_text()
if "buildSellableCatalog" not in catalog:
    raise SystemExit("Catalog storefront authority integration missing")
if "resolveCatalogProduct" not in detail or "buildSellableCatalog" not in detail:
    raise SystemExit("ProductDetail storefront authority integration missing")

# Administrative inventory safety: never invent stock for missing variants/sizes.
# Existing inventory, variantsStock and sizeStock values remain untouched.
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
admin = replace_required(admin, "initMap[key] = 10;", "initMap[key] = 0;", "new product variant initial map")
admin = replace_required(admin, "currentStock: 10,", "currentStock: 0,", "new product variant current stock")
admin = replace_required(admin, "directStockValue: 10,", "directStockValue: 0,", "new product variant direct stock")
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

# The existing workflow commits storefront pages only. Commit this safe-branch
# admin correction here; the subsequent PR validation run certifies it.
if subprocess.run(["git", "diff", "--quiet", "--", str(admin_path)]).returncode != 0:
    subprocess.run(["git", "config", "user.name", "github-actions[bot]"], check=True)
    subprocess.run(["git", "config", "user.email", "41898282+github-actions[bot]@users.noreply.github.com"], check=True)
    subprocess.run(["git", "add", str(admin_path)], check=True)
    subprocess.run(["git", "commit", "-m", "fix: default unknown catalog inventory to zero"], check=True)
    subprocess.run(["git", "push", "origin", "HEAD:fix/catalog-products-certification"], check=True)

print("Catalog authority verified and zero-safe admin inventory defaults applied.")
