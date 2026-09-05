const fs = require('fs');

const path = 'src/components/admin/products/ProductManagementDrawer.tsx';
let source = fs.readFileSync(path, 'utf8');

function replaceOnce(oldText, newText, label) {
  if (!source.includes(oldText)) {
    if (source.includes(newText)) return;
    throw new Error(`Patch target not found: ${label}`);
  }
  source = source.replace(oldText, newText);
}

replaceOnce(
`  useEffect(() => {
    if (!product?.id) {
      setMovements([]);
      return;
    }

    const q = query(
      collection(db, 'stock_movements'),
      where('productId', '==', product.id),
      orderBy('createdAt', 'desc'),
      limit(25)
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const list = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
      setMovements(list);
    }, (error) => {
      console.warn('Stock movements subscribe fallback:', error);
    });

    return () => unsubscribe();
  }, [product?.id]);`,
`  useEffect(() => {
    const movementProductSlug = product?.slug?.trim();
    if (!movementProductSlug) {
      setMovements([]);
      return;
    }

    const q = query(
      collection(db, 'stock_movements'),
      where('productSlug', '==', movementProductSlug),
      orderBy('createdAt', 'desc'),
      limit(25)
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const list = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
      setMovements(list);
    }, (error) => {
      console.warn('Stock movements subscribe fallback:', error);
    });

    return () => unsubscribe();
  }, [product?.slug]);`,
  'movement history identity'
);

replaceOnce(
`        costPrice: formData.costPrice ? Number(formData.costPrice) : null,
        stock: calculatedTotalStock,
        available: isAvailableGlobal,
        sizeStock: sizeStockSummary,
        variantsStock: newVariantsStockMap,
        minStock: Number(formData.minStock) || 2,`,
`        costPrice: formData.costPrice ? Number(formData.costPrice) : null,
        // Inventory 2.0 is the quantity authority. Quantity mirrors are written
        // only after the official backend mutation succeeds.
        minStock: Number(formData.minStock) || 2,`,
  'remove product quantity authority from primary payload'
);

replaceOnce(
`      const invPayload = {
        stock: calculatedTotalStock,
        available: isAvailableGlobal,
        variants: newInventoryVariantsMap,
        updatedAt: new Date()
      };

`,
``,
  'remove unused inventory payload'
);

replaceOnce(
`      // 3. Register stock movements for any changed variants via official API
      for (const mov of changedMovements) {
        try {
          await recordStockMovementInDb(
            productSlug,
            mov.variantKey,
            'adjust',
            mov.newStock,
            mov.notes || 'Ajuste no cadastro do produto'
          );
        } catch (movErr) {
          console.error(\`Error recording stock movement for \${productSlug} (\${mov.variantKey}):\`, movErr);
        }
      }

      toast.success('✓ Produto e estoque atualizados com sucesso!', { id: toastId });`,
`      // 3. Register stock movements through the official Inventory 2.0 API.
      // Any failure must abort the success path instead of being silently ignored.
      for (const mov of changedMovements) {
        await recordStockMovementInDb(
          productSlug,
          mov.variantKey,
          'adjust',
          mov.newStock,
          mov.notes || 'Ajuste no cadastro do produto'
        );
      }

      if (!targetId) {
        throw new Error('PRODUCT_ID_MISSING_AFTER_SAVE');
      }

      // Compatibility mirrors for legacy catalog/admin readers are refreshed only
      // after authoritative inventory mutations succeed. They are not stock authority.
      await updateDoc(doc(db, 'products', targetId), {
        stock: calculatedTotalStock,
        available: isAvailableGlobal,
        sizeStock: sizeStockSummary,
        variantsStock: newVariantsStockMap,
        updatedAt: new Date().toISOString()
      });

      toast.success('✓ Produto e estoque atualizados com sucesso!', { id: toastId });`,
  'make official inventory mutation mandatory'
);

fs.writeFileSync(path, source);
