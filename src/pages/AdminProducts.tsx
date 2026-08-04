import React, { useState, useEffect } from 'react';
import { db } from '../lib/firebase';
import { collection, onSnapshot, query, orderBy, serverTimestamp } from 'firebase/firestore';
import { Plus, Box, Layers, RefreshCw, Sparkles, CheckCircle2, ShieldCheck, ArrowLeft } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Logo } from '../components/Logo';
import { useAuth } from '../context/AuthContext';
import { Product } from '../types/product';
import { AdminProductsList } from '../components/admin/products/AdminProductsList';
import { ProductFormWizard } from '../components/admin/products/ProductFormWizard';
import toast from 'react-hot-toast';

export default function AdminProducts({ isEmbedded = false }: { isEmbedded?: boolean }) {
  const { user } = useAuth();
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  
  // View mode: 'list' or 'wizard'
  const [viewMode, setViewMode] = useState<'list' | 'wizard'>('list');
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);

  // Real-time Firestore subscription for `products`
  useEffect(() => {
    const q = collection(db, 'products');
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const list: Product[] = snapshot.docs.map((d) => {
        const data = d.data();
        return {
          id: d.id,
          name: data.name || 'Produto sem nome',
          slug: data.slug || d.id,
          sku: data.sku || '',
          headline: data.headline || '',
          description: data.description || '',
          price: data.price || 0,
          promotionalPrice: data.promotionalPrice || undefined,
          costPrice: data.costPrice || undefined,
          category: data.category || 'Camisetas',
          collection: data.collection || 'FORCE',
          brand: data.brand || 'F PAC STORE',
          status: data.status || 'active',
          isNew: !!data.isNew,
          isBestseller: !!data.isBestseller,
          is_prime: !!data.is_prime,
          
          images: Array.isArray(data.images) ? data.images : [],
          colorVariants: Array.isArray(data.colorVariants) ? data.colorVariants : [],
          videos: Array.isArray(data.videos) ? data.videos : [],

          sizes: Array.isArray(data.sizes) ? data.sizes : ['P', 'M', 'G', 'GG'],
          colors: Array.isArray(data.colors) ? data.colors : [],
          sizeStock: Array.isArray(data.sizeStock) ? data.sizeStock : [],
          stock: data.stock || 0,
          minStock: data.minStock || 5,

          weight: data.weight || 0.35,
          width: data.width || 25,
          height: data.height || 3,
          length: data.length || 30,
          specs: Array.isArray(data.specs) ? data.specs : [],
          tags: Array.isArray(data.tags) ? data.tags : [],
          createdAt: data.createdAt,
          updatedAt: data.updatedAt
        };
      });

      // Filter out raw internal test products
      const cleanList = list.filter((p) => {
        const n = p.name.toUpperCase();
        return !n.includes('TESTE') && !n.includes('TEST');
      });

      setProducts(cleanList);
      setLoading(false);
    }, (error) => {
      console.error('Error fetching products from Firestore:', error);
      toast.error('Erro ao sincronizar produtos.');
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  const handleStartAdd = () => {
    setEditingProduct(null);
    setViewMode('wizard');
  };

  const handleStartEdit = (product: Product) => {
    setEditingProduct(product);
    setViewMode('wizard');
  };

  const handleWizardSuccess = () => {
    setViewMode('list');
    setEditingProduct(null);
  };

  const handleWizardCancel = () => {
    setViewMode('list');
    setEditingProduct(null);
  };

  return (
    <div className={`min-h-screen bg-[#0a0a0f] font-sans ${isEmbedded ? 'p-0' : 'p-4 md:p-8'}`}>
      {!isEmbedded && (
        <header className="mb-8 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pb-6 border-b border-white/10">
          <div className="flex items-center gap-4">
            <Link to="/" className="hover:opacity-80 transition-opacity">
              <Logo className="h-8 w-auto text-white" />
            </Link>
            <div className="h-6 w-px bg-white/20" />
            <div>
              <span className="text-[10px] font-black uppercase tracking-[0.25em] text-[#eab308] block">
                ADMIN PAINEL CMS
              </span>
              <h1 className="text-xl font-black uppercase tracking-tight text-white">
                Gestão de Produtos & Catálogo
              </h1>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <Link
              to="/"
              className="px-4 py-2 rounded-xl bg-white/5 hover:bg-white/10 text-white text-xs font-bold uppercase transition-colors flex items-center gap-1.5 border border-white/10"
            >
              <ArrowLeft size={14} /> Voltar à Loja
            </Link>
          </div>
        </header>
      )}

      {/* RENDER CONTENT */}
      {loading ? (
        <div className="py-24 text-center text-xs text-gray-500 uppercase font-bold tracking-widest animate-pulse">
          Carregando catálogo de produtos...
        </div>
      ) : viewMode === 'wizard' ? (
        <ProductFormWizard
          initialProduct={editingProduct}
          onSaveSuccess={handleWizardSuccess}
          onCancel={handleWizardCancel}
        />
      ) : (
        <AdminProductsList
          products={products}
          onEditProduct={handleStartEdit}
          onAddNewProduct={handleStartAdd}
        />
      )}
    </div>
  );
}
