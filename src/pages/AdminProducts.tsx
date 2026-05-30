import React, { useState, useEffect, useMemo, useRef } from 'react';
import { db, storage } from '../lib/firebase';
import { collection, addDoc, deleteDoc, doc, onSnapshot, query, orderBy, serverTimestamp, updateDoc } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { 
  Plus, Trash2, Edit3, Save, X, Loader2, ArrowLeft, 
  Image as ImageIcon, Check, ChevronRight, Upload, Search,
  Box, AlertTriangle, CheckCircle2, TrendingUp, Package,
  BarChart3, Settings2, Eye, EyeOff, ChevronDown, ChevronUp,
  SlidersHorizontal, ArrowUpDown, PlusCircle, RefreshCw, 
  Layers, Lock, Database, FileText, Image, ExternalLink, Sparkles, Filter, CheckCircle
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { Logo } from '../components/Logo';
import { useAuth } from '../context/AuthContext';
import { cn, resizeImage, convertDriveUrlToDirect } from '../lib/utils';
import { motion, AnimatePresence } from 'framer-motion';
import toast from 'react-hot-toast';
import { useInventory } from '../hooks/useInventory';

interface Product {
  id: string;
  name: string;
  slug: string;
  headline: string;
  description: string;
  price: number;
  images: string[];
  imageStampSizes?: string[];
  stampGallery?: string[];
  stampGallerySizes?: string[];
  sizes: string[];
  colors: { name: string; hex: string }[];
  specs: string[];
  isNew?: boolean;
  isBestseller?: boolean;
  stock?: number;
  minStock?: number;
  category?: string;
  parentSlug?: string;
  stampSize?: string;
  status?: string;
}

const PRESET_COLORS = [
  { name: 'Preto', hex: '#000000' },
  { name: 'Branco', hex: '#ffffff' },
  { name: 'Off White', hex: '#FAF9F6' },
  { name: 'Azul Marinho', hex: '#1b263b' },
  { name: 'Verde Militar', hex: '#3f4238' },
  { name: 'Cinza Mescla', hex: '#cfdbd5' },
  { name: 'Marrom Café', hex: '#4a3c31' },
  { name: 'Bege', hex: '#e3d5ca' }
];

export default function AdminProducts({ isEmbedded = false }: { isEmbedded?: boolean }) {
  const { user, loading: authLoading } = useAuth();
  const { 
    inventory, 
    updateVariantStock, 
    updateMultipleVariantStocks,
    toggleAvailability, 
    toggleVariantAvailability, 
    toggleColorAvailability, 
    loading: inventoryLoading 
  } = useInventory();
  
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [isUploading, setIsUploading] = useState(false);
  const isAdmin = user?.email === 'fpacstore@gmail.com' || user?.email === 'atendimento@fpacstore.com.br';
  
  // Create / Register state
  const [isAdding, setIsAdding] = useState(false);

  // Active view toggle: 'hierarchy' (Model -> Estampa) vs 'flat' (Simple catalog table list)
  const [viewMode, setViewMode] = useState<'hierarchy' | 'flat'>('hierarchy');
  
  // Expanded Right-side SlideDrawer Product Model
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [drawerTab, setDrawerTab] = useState<'details' | 'stock' | 'media' | 'variants_setup'>('details');
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [restoringForce, setRestoringForce] = useState(false);
  const hasForce = useMemo(() => {
    return products.some(p => String(p.slug || '').toLowerCase() === 'force');
  }, [products]);

  // Filters state
  const [activeSidebarFilter, setActiveSidebarFilter] = useState<string>('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [sortBy, setSortBy] = useState<'name' | 'stock-asc' | 'stock-desc' | 'price-asc' | 'price-desc'>('name');

  // Pagination for premium catalog rendering
  const [visibleCount, setVisibleCount] = useState<number>(12);

  // Form Registration/Edit State
  const [formData, setFormData] = useState<Partial<Product>>({
    name: '',
    slug: '',
    headline: '',
    description: '',
    price: undefined,
    images: [''],
    imageStampSizes: [''],
    stampGallery: ['', '', '', ''],
    stampGallerySizes: ['', '', '', ''],
    sizes: ['P', 'M', 'G', 'GG'],
    colors: [
      { name: 'Branco', hex: '#ffffff' },
      { name: 'Preto', hex: '#000000' },
      { name: 'Off White', hex: '#FAF9F6' },
      { name: 'Azul Marinho', hex: '#1b263b' },
      { name: 'Verde Militar', hex: '#3f4238' }
    ],
    specs: ['100% Algodão Premium | Gramatura 240GSM'],
    isNew: false,
    isBestseller: false,
    stock: 0,
    minStock: 5,
    category: 'Camisetas',
    parentSlug: '',
    stampSize: ''
  });

  // Pull database data & Auto purge test items which pollute the clean catalog
  useEffect(() => {
    const q = collection(db, 'products');
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const allDocs = snapshot.docs.map(doc => {
        const item = { id: doc.id, ...doc.data() } as Product;
        if (item.slug === 'force' || item.slug === 'mark' || item.slug === 'prime') {
          item.parentSlug = '';
        }
        return item;
      });

      if (isAdmin) {
        // Auto-heal parent collections (FORCE, MARK, PRIME) if deleted or hidden in Firestore
        const parentSlugs = ['force', 'mark', 'prime'];
        parentSlugs.forEach(async (slug) => {
          const docsWithSlug = allDocs.filter(p => String(p.slug || '').toLowerCase() === slug);
          
          if (docsWithSlug.length === 0) {
            console.log(`Auto-healing missing base card for ${slug}...`);
            const baseProduct = slug === 'force' ? {
              name: "FORCE",
              slug: "force",
              headline: "Camisas com estampas de texto",
              price: 89.90,
              costPrice: 42.00,
              description: "A camiseta FORCE é a combinação estética minimalista com atitude marcante. Entrega estrutura, conforto e um caimento firme no corpo com estampas em DTF de alta definição que garante cores intensas, mantendo a peça sofisticada e confortável em qualquer ocasião.",
              images: [],
              sizes: ["P", "M", "G", "GG"],
              colors: [
                { name: "Branco", hex: "#ffffff" },
                { name: "Preto", hex: "#000000" },
                { name: "Off White", hex: "#FAF9F6" },
                { name: "Azul Marinho", hex: "#1b263b" },
                { name: "Verde Militar", hex: "#3f4238" }
              ],
              specs: ["90% Algodão e 10 Poliéster Premium", "Gramatura 240gsm", "Modelagem Oversized", "Ribana Canelada 3cm", "Tecido Macio", "Reforço de gola ombro a ombro"],
              status: "active",
              createdAt: serverTimestamp()
            } : slug === 'mark' ? {
              name: "MARK",
              slug: "mark",
              headline: "Camisas com estampas de desenho",
              price: 99.90,
              costPrice: 48.00,
              description: "A linha MARK foca na identidade visual através de artes exclusivas. Uma peça que fala por si só, mantendo o padrão de qualidade F PAC com tecido encorpado e durabilidade extrema.",
              images: [],
              sizes: ["P", "M", "G", "GG"],
              colors: [
                { name: "Branco", hex: "#ffffff" },
                { name: "Preto", hex: "#000000" },
                { name: "Off White", hex: "#FAF9F6" },
                { name: "Azul Marinho", hex: "#1b263b" },
                { name: "Verde Militar", hex: "#3f4238" }
              ],
              specs: ["90% Algodão e 10 Poliéster Premium", "Gramatura 240gsm", "Ribana Canelada 3cm", "Tecido Macio", "Estampa DTF de qualidade", "Resistente a lavagens"],
              status: "active",
              createdAt: serverTimestamp()
            } : {
              name: "PRIME",
              slug: "prime",
              headline: "Camisas para personalizar",
              price: 119.90,
              costPrice: 55.00,
              description: "A tela em branco para a sua identidade. A linha PRIME permite que você escolha entre nossas estampas exclusivas para criar uma peça única. Qualidade impecável com o toque de personalização que você procura.",
              images: [],
              sizes: ["P", "M", "G", "GG"],
              colors: [
                { name: "Branco", hex: "#ffffff" },
                { name: "Preto", hex: "#000000" },
                { name: "Off White", hex: "#FAF9F6" },
                { name: "Azul Marinho", hex: "#1b263b" },
                { name: "Verde Militar", hex: "#3f4238" }
              ],
              specs: ["90% Algodão e 10% Poliéster", "Fio 30.1 Penteado", "Pode ser personalizada", "Conforto térmico"],
              status: "active",
              createdAt: serverTimestamp()
            };

            try {
              await addDoc(collection(db, 'products'), baseProduct);
              console.log(`Auto-healed and restored base product ${slug} successfully in database!`);
            } catch (err) {
              console.error(`Failed to auto-heal ${slug}:`, err);
            }
          } else {
            // If they exist but are hidden/draft, activate them!
            docsWithSlug.forEach(async (docP) => {
              if (docP.status === 'hidden' || docP.status === 'draft') {
                try {
                  await updateDoc(doc(db, 'products', docP.id), { status: 'active' });
                  console.log(`Auto-activated hidden/draft base card for ${slug} in Firestore`);
                } catch (err) {
                  console.error(`Failed to auto-activate ${slug} in Firestore:`, err);
                }
              }
            });
          }
        });

        allDocs.forEach(async (p) => {
          const itemName = String(p.name || '').toUpperCase();
          const itemSlug = String(p.slug || '').toUpperCase();
          const isTest = 
            itemName.includes('TESTE') || 
            itemSlug.includes('TESTE') ||
            itemName.includes('TEST') || 
            itemSlug.includes('TEST') ||
            itemName === 'PRODUTO TESTE PAGAMENTO' ||
            itemSlug === 'PRODUTO-TESTE-PAGAMENTO' ||
            itemName.includes('PAGAMENTO TESTE') ||
            itemSlug.includes('pagamento-teste') ||
            itemSlug === 'teste-checkout' ||
            itemName === 'TESTE CHECKOUT';
          
          if (isTest) {
            try {
              await deleteDoc(doc(db, 'products', p.id));
              if (p.slug) {
                await deleteDoc(doc(db, 'inventory', p.slug));
              }
              console.log("Auto-purged test entry:", p.id, p.slug);
            } catch (err) {
              console.error("Auto-purge failure:", err);
            }
          }
        });
      }

      const data = allDocs.filter(p => {
        const itemName = String(p.name || '').toUpperCase();
        const itemSlug = String(p.slug || '').toUpperCase();
        return !(
          itemName.includes('TESTE') || 
          itemSlug.includes('TESTE') ||
          itemName.includes('TEST') || 
          itemSlug.includes('TEST') ||
          itemName === 'PRODUTO TESTE PAGAMENTO' ||
          itemSlug === 'PRODUTO-TESTE-PAGAMENTO' ||
          itemName.includes('PAGAMENTO TESTE') ||
          itemSlug.includes('pagamento-teste') ||
          itemSlug === 'teste-checkout' ||
          itemName === 'TESTE CHECKOUT'
        );
      });
      
      const sortedData = [...data].sort((a, b) => {
        const dateA = (a as any).createdAt?.seconds || 0;
        const dateB = (b as any).createdAt?.seconds || 0;
        return dateB - dateA;
      });

      setProducts(sortedData);
      setLoading(false);
    }, (error) => {
      console.error("Firebase fetch error:", error);
      setLoading(false);
    });

    return () => unsubscribe();
  }, [isAdmin]);

  // Compute live KPIs metrics from physical inventory
  const stats = useMemo(() => {
    let totalItems = 0;
    const itemsByProduct: Record<string, number> = {};
    const itemsByColor: Record<string, number> = {};
    const itemsBySize: Record<string, number> = {};

    Object.entries(inventory).forEach(([slug, data]: [string, any]) => {
      const p = products.find(prod => prod.slug === slug || prod.id === slug);
      if (!p || !p.name) return;

      const stockVal = data.stock || 0;
      totalItems += stockVal;
      itemsByProduct[p.name] = stockVal;

      if (data.variants) {
        Object.entries(data.variants).forEach(([vKey, vData]: [string, any]) => {
          const parts = vKey.split('_');
          if (parts.length > 1) {
            const [color, size] = parts;
            itemsByColor[color] = (itemsByColor[color] || 0) + (vData.stock || 0);
            itemsBySize[size] = (itemsBySize[size] || 0) + (vData.stock || 0);
          } else {
            const size = vKey;
            itemsBySize[size] = (itemsBySize[size] || 0) + (vData.stock || 0);
          }
        });
      }
    });

    const lowStock = products.filter(p => {
      const inv = inventory[p.slug];
      return inv && inv.stock > 0 && inv.stock <= (p.minStock || 5);
    }).length;
    
    const outOfStock = products.filter(p => !inventory[p.slug] || inventory[p.slug].stock === 0).length;
    const totalVariations = products.filter(p => !!p.parentSlug).length;
    
    return {
      totalProducts: products.length,
      totalVariations,
      totalItems,
      itemsByProduct,
      itemsByColor,
      itemsBySize,
      lowStock,
      outOfStock
    };
  }, [products, inventory]);

  const handleCreateSlug = (name: string) => {
    return String(name || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, '-').replace(/[^\w-]+/g, '');
  };

  // Submit new product form
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const cleanData = { ...formData };
      if (!cleanData.parentSlug || cleanData.parentSlug.trim() === '') {
        delete cleanData.parentSlug;
      }
      if (!cleanData.stampSize || cleanData.stampSize.trim() === '') {
        delete cleanData.stampSize;
      }

      const slug = cleanData.slug || handleCreateSlug(cleanData.name || '');
      const finalData = { ...cleanData, slug, createdAt: serverTimestamp() };
      
      await addDoc(collection(db, 'products'), finalData);
      
      resetForm();
      toast.success("Novo produto publicado no banco com sucesso!");
      // Keep drawer open for filling the next product immediately, with completely clean fields.
    } catch (error) {
      console.error(error);
      toast.error("Erro ao salvar produto.");
    } finally {
      setLoading(false);
    }
  };

  const resetForm = () => {
    setFormData({
      name: '',
      slug: '',
      headline: '',
      description: '',
      price: undefined,
      images: [''],
      imageStampSizes: [''],
      stampGallery: ['', '', '', ''],
      stampGallerySizes: ['', '', '', ''],
      sizes: ['P', 'M', 'G', 'GG'],
      colors: [
        { name: 'Branco', hex: '#ffffff' },
        { name: 'Preto', hex: '#000000' },
        { name: 'Off White', hex: '#FAF9F6' },
        { name: 'Azul Marinho', hex: '#1b263b' },
        { name: 'Verde Militar', hex: '#3f4238' }
      ],
      specs: ['100% Algodão Premium | Gramatura 240GSM'],
      isNew: false,
      isBestseller: false,
      stock: 0,
      minStock: 5,
      category: 'Camisetas',
      parentSlug: '',
      stampSize: ''
    });
  };

  const handleDelete = async (id: string, slug: string) => {
    if (deletingId !== id) {
      setDeletingId(id);
      toast.error('Clique novamente no ícone de lixeira para confirmar a exclusão!', { id: 'delete-confirm-prod', duration: 4000 });
      setTimeout(() => {
        setDeletingId(prev => prev === id ? null : prev);
      }, 4000);
      return;
    }

    toast.dismiss('delete-confirm-prod');
    try {
      await deleteDoc(doc(db, 'products', id));
      if (slug) {
        await deleteDoc(doc(db, 'inventory', slug));
      }
      toast.success('Produto excluído com sucesso.');
      if (selectedProduct && selectedProduct.id === id) {
        setSelectedProduct(null);
      }
      setDeletingId(null);
    } catch (err) {
      toast.error('Erro ao remover produto.');
    }
  };

  const handleRestoreForce = async () => {
    setRestoringForce(true);
    try {
      const forceProduct = {
        name: "FORCE",
        slug: "force",
        headline: "Camisas com estampas de texto",
        price: 89.90,
        costPrice: 42.00,
        description: "A camiseta FORCE é a combinação estética minimalista com atitude marcante. Entrega estrutura, conforto e um caimento firme no corpo com estampas em DTF de alta definição que garante cores intensas, mantendo a peça sofisticada e confortável em qualquer ocasião.",
        images: [],
        sizes: ["P", "M", "G", "GG"],
        colors: [
          { name: "Branco", hex: "#ffffff" },
          { name: "Preto", hex: "#000000" },
          { name: "Off White", hex: "#FAF9F6" },
          { name: "Azul Marinho", hex: "#1b263b" },
          { name: "Verde Militar", hex: "#3f4238" }
        ],
        specs: ["90% Algodão e 10 Poliéster Premium", "Gramatura 240gsm", "Modelagem Oversized", "Ribana Canelada 3cm", "Tecido Macio", "Reforço de gola ombro a ombro"],
        createdAt: serverTimestamp()
      };
      
      await addDoc(collection(db, 'products'), forceProduct);
      toast.success("Card FORCE base restaurado com sucesso no banco de dados!");
    } catch (err) {
      console.error(err);
      toast.error("Erro ao restaurar o FORCE.");
    } finally {
      setRestoringForce(false);
    }
  };

  const handleFileUpload = async (file: File): Promise<string> => {
    setIsUploading(true);
    try {
      const resizedBlob = await resizeImage(file, 800, 800);
      try {
        const storageRef = ref(storage, `products/${Date.now()}_${file.name}`);
        const snapshot = await uploadBytes(storageRef, resizedBlob);
        const url = await getDownloadURL(snapshot.ref);
        return url;
      } catch (storageError) {
        console.warn("Firebase Storage upload failed, falling back to compressed Base64:", storageError);
        return new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.readAsDataURL(resizedBlob);
          reader.onloadend = () => {
            const base64data = reader.result as string;
            resolve(base64data);
          };
          reader.onerror = (e) => reject(e);
        });
      }
    } catch (error) {
      console.error("Upload error:", error);
      toast.error("Erro ao enviar imagem.");
      throw error;
    } finally {
      setIsUploading(false);
    }
  };

  // Filter & Sort core engine
  const filteredProducts = useMemo(() => {
    return products.filter(p => {
      const inv = inventory[p.slug];
      const totalStockVal = inv?.stock || 0;
      const available = inv?.available !== false;

      // Sidebar pre-filtering matching UI index specifications
      if (activeSidebarFilter === 'force') {
        const matchesForce = p.slug === 'force' || p.parentSlug === 'force';
        if (!matchesForce) return false;
      } else if (activeSidebarFilter === 'mark') {
        const matchesMark = p.slug === 'mark' || p.parentSlug === 'mark';
        if (!matchesMark) return false;
      } else if (activeSidebarFilter === 'prime') {
        if (p.slug !== 'prime' && p.parentSlug !== 'prime') return false;
      } else if (activeSidebarFilter === 'low') {
        const isLow = totalStockVal > 0 && totalStockVal <= (p.minStock || 5);
        if (!isLow) return false;
      } else if (activeSidebarFilter === 'out') {
        const isOut = totalStockVal === 0;
        if (!isOut) return false;
      } else if (activeSidebarFilter === 'draft') {
        if (available) return false;
      } else if (activeSidebarFilter === 'bestseller') {
        if (!p.isBestseller) return false;
      } else if (activeSidebarFilter === 'new') {
        if (!p.isNew) return false;
      }

      // Search matching parameters
      const matchesSearch = String(p.name || '').toLowerCase().includes(searchTerm.toLowerCase()) || 
                            String(p.headline || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
                            String(p.slug || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
                            String(p.parentSlug || '').toLowerCase().includes(searchTerm.toLowerCase());
      
      const matchesCategory = categoryFilter === 'all' || p.category === categoryFilter;

      return matchesSearch && matchesCategory;
    }).sort((a, b) => {
      const invA = inventory[a.slug]?.stock || 0;
      const invB = inventory[b.slug]?.stock || 0;

      if (sortBy === 'name') {
        return (a.name || '').localeCompare(b.name || '');
      } else if (sortBy === 'stock-asc') {
        return invA - invB;
      } else if (sortBy === 'stock-desc') {
        return invB - invA;
      } else if (sortBy === 'price-asc') {
        return a.price - b.price;
      } else if (sortBy === 'price-desc') {
        return b.price - a.price;
      }
      return 0;
    });
  }, [products, inventory, activeSidebarFilter, searchTerm, categoryFilter, sortBy]);

  // Sidebar count indicators
  const sidebarCounts = useMemo(() => {
    const counts = {
      all: products.length,
      force: products.filter(p => p.slug === 'force' || p.parentSlug === 'force').length,
      mark: products.filter(p => p.slug === 'mark' || p.parentSlug === 'mark').length,
      prime: products.filter(p => p.slug === 'prime' || p.parentSlug === 'prime').length,
      low: 0,
      out: 0,
      draft: 0,
      bestseller: products.filter(p => p.isBestseller).length,
      new: products.filter(p => p.isNew).length,
    };

    products.forEach(p => {
      const inv = inventory[p.slug];
      const stock = inv?.stock || 0;
      const av = inv?.available !== false;

      if (stock > 0 && stock <= (p.minStock || 5)) counts.low++;
      if (stock === 0) counts.out++;
      if (!av) counts.draft++;
    });

    return counts;
  }, [products, inventory]);

  // Hierarchical modeling structure grouping: Category Model -> Prints associated
  const hierarchicalViewData = useMemo(() => {
    // 1. Root Models (We map items that don't have parentSlug, or model headers)
    const models = products.filter(p => !p.parentSlug);
    // 2. Children Prints (mapped by parentSlug)
    const childrenByParent: Record<string, Product[]> = {};
    products.forEach(p => {
      if (p.parentSlug) {
        if (!childrenByParent[p.parentSlug]) {
          childrenByParent[p.parentSlug] = [];
        }
        childrenByParent[p.parentSlug].push(p);
      }
    });

    // Apply exact same filters & search metrics to hierarchy
    const finalModels = models.filter(m => {
      const children = childrenByParent[m.slug] || [];
      const isMatchSearchSelf = String(m.name || '').toLowerCase().includes(searchTerm.toLowerCase()) || 
                                String(m.headline || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
                                String(m.slug || '').toLowerCase().includes(searchTerm.toLowerCase());
      
      const childrenMatchSearch = children.some(c => 
        String(c.name || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
        String(c.slug || '').toLowerCase().includes(searchTerm.toLowerCase())
      );

      const matchesCat = categoryFilter === 'all' || m.category === categoryFilter;

      const totalInventoryStock = (inventory[m.slug]?.stock || 0) + children.reduce((acc, c) => acc + (inventory[c.slug]?.stock || 0), 0);
      const isModelLow = totalInventoryStock > 0 && totalInventoryStock <= (m.minStock || 5);
      const isModelOut = totalInventoryStock === 0;
      const isModelDraft = inventory[m.slug]?.available === false;

      // Sidebar pre-filtering integration
      if (activeSidebarFilter === 'force' && m.slug !== 'force') return false;
      if (activeSidebarFilter === 'mark' && m.slug !== 'mark') return false;
      if (activeSidebarFilter === 'prime' && m.slug !== 'prime') return false;
      if (activeSidebarFilter === 'low' && !isModelLow) return false;
      if (activeSidebarFilter === 'out' && !isModelOut) return false;
      if (activeSidebarFilter === 'draft' && !isModelDraft) return false;
      if (activeSidebarFilter === 'bestseller' && !m.isBestseller) return false;
      if (activeSidebarFilter === 'new' && !m.isNew) return false;

      return (isMatchSearchSelf || childrenMatchSearch) && matchesCat;
    });

    return {
      models: finalModels,
      childrenByParent
    };
  }, [products, inventory, searchTerm, categoryFilter, activeSidebarFilter]);

  // Handle immediate field modifications from expanded Drawer
  const handleProductUpdate = async (updatedFields: Partial<Product>) => {
    if (!selectedProduct) return;
    try {
      await updateDoc(doc(db, 'products', selectedProduct.id), updatedFields);
      setSelectedProduct(prev => prev ? { ...prev, ...updatedFields } : null);
      toast.success("Produto atualizado com sucesso!");
    } catch (err) {
      console.error(err);
      toast.error("Erro ao salvar produto.");
    }
  };

  const openProductDrawer = (product: Product, tab: typeof drawerTab = 'details') => {
    setSelectedProduct(product);
    setDrawerTab(tab);
  };

  if (!isEmbedded && authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-white">
        <Loader2 className="animate-spin text-black" size={48} />
      </div>
    );
  }

  // Access Guard
  if (!isEmbedded && (!user || !isAdmin)) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-4 bg-white">
        <h1 className="text-3xl font-black uppercase mb-4 tracking-tighter">Acesso Restrito</h1>
        <p className="text-sm text-gray-400 uppercase tracking-widest font-bold mb-8 text-center max-w-sm">
          Você precisa de credenciais de administrador para acessar o painel de inventário.
        </p>
        <Link to="/" className="bg-black text-white px-8 py-4 text-[10px] font-black uppercase tracking-widest hover:bg-[#eab308] hover:text-black transition-all">
          Voltar para a Loja
        </Link>
      </div>
    );
  }

  return (
    <div className={cn(isEmbedded ? "relative w-full" : "min-h-screen bg-[#f8f8fa] pt-20 md:pt-24 pb-24 font-sans text-black relative overflow-x-hidden")}>
      <div className={cn(isEmbedded ? "w-full mx-auto" : "max-w-[1700px] mx-auto px-4 md:px-8")}>
        
        {/* PREMIUM CMS HEADER */}
        <div className="flex flex-col xl:flex-row xl:items-end justify-between gap-8 mb-10 border-b border-black/[0.06] pb-8">
          <div className="space-y-3">
            <div className="flex items-center gap-3">
              <span className="bg-black text-white px-2.5 py-1 text-[8px] font-black uppercase tracking-[0.3em] rounded-sm">STUDIO CMS</span>
              <div className="h-[1px] w-8 bg-[#eab308]" />
              <span className="text-gray-400 text-[9px] font-bold uppercase tracking-widest font-mono">STOCK MANAGER PRO</span>
            </div>
            <h1 className="text-3xl md:text-5xl font-black uppercase tracking-tighter italic mr-2">
              PAINEL DE <span className="text-[#eab308]">INVENTÁRIO</span>
            </h1>
            <p className="text-gray-500 text-xs font-medium uppercase tracking-[0.08em] max-w-2xl">
              Gestão ágil de catálogo no padrão e-commerce premium. Controle modelos e estampas de forma compacta e atualize estoques ou mídias URLs em tempo real.
            </p>
          </div>

          {/* SHOPIFY-STYLE PERFORMANCE METRICS KEY CARDS */}
          <div className="flex flex-row gap-3 overflow-x-auto pb-2 scrollbar-none shrink-0 w-full xl:w-auto">
             <StatCard label="PRODUTOS" value={stats.totalProducts} icon={<Package size={14} className="text-black/40" />} color="text-black" />
             <StatCard label="ESTAMPAS ATIVAS" value={stats.totalVariations} icon={<Sparkles size={14} className="text-[#eab308]" />} color="text-[#eab308]" />
             <StatCard label="ESTOQUE FISICO" value={stats.totalItems} icon={<Database size={14} className="text-emerald-500" />} color="text-emerald-600" />
             <StatCard label="BAIXO ESTOQUE" value={stats.lowStock} icon={<AlertTriangle size={14} />} color="text-amber-500" />
             <StatCard label="ESGOTADOS" value={stats.outOfStock} icon={<X size={14} />} color="text-rose-500" />
          </div>
        </div>

        {/* WORKSPACE SIDEBAR + DATA GRID */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          
          {/* LEFT INDEX CMS SIDEBAR */}
          <div className="lg:col-span-3 sticky top-24 space-y-6">
            <div className="bg-white border border-black/[0.06] p-5 shadow-sm rounded-none">
              <div className="flex items-center gap-2 mb-4">
                <Filter size={12} className="text-black/40" />
                <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-neutral-400">FILTROS DE ACESSO</h3>
              </div>
              <nav className="space-y-1">
                {[
                  { id: 'all', label: 'Todos os Produtos', count: sidebarCounts.all, icon: <Package size={13} /> },
                  { id: 'force', label: 'Linha FORCE', count: sidebarCounts.force, icon: <Layers size={13} className="text-black/60" /> },
                  { id: 'mark', label: 'Linha MARK', count: sidebarCounts.mark, icon: <Layers size={13} className="text-black/60" /> },
                  { id: 'prime', label: 'Linha PRIME', count: sidebarCounts.prime, icon: <CheckCircle size={13} className="text-amber-500" /> },
                  { id: 'low', label: 'Baixo Estoque', count: sidebarCounts.low, icon: <AlertTriangle size={13} className="text-amber-500" /> },
                  { id: 'out', label: 'Itens Esgotados', count: sidebarCounts.out, icon: <X size={13} className="text-rose-500" /> },
                  { id: 'draft', label: 'Inativos / Rascunhos', count: sidebarCounts.draft, icon: <EyeOff size={13} className="text-gray-400" /> },
                  { id: 'bestseller', label: 'Mais Vendidos', count: sidebarCounts.bestseller, icon: <TrendingUp size={13} className="text-blue-500" /> },
                  { id: 'new', label: 'Lançamentos', count: sidebarCounts.new, icon: <SlidersHorizontal size={13} className="text-violet-500" /> },
                ].map((menu) => (
                  <button
                    key={menu.id}
                    onClick={() => {
                      setActiveSidebarFilter(menu.id);
                      setVisibleCount(12); // Reset pagination
                    }}
                    className={cn(
                      "w-full flex items-center justify-between px-3.5 py-3 text-[11px] font-bold uppercase tracking-wider transition-all border",
                      activeSidebarFilter === menu.id 
                        ? "bg-black text-white border-black shadow-sm translate-x-1" 
                        : "bg-transparent text-gray-600 border-transparent hover:border-black/5 hover:bg-black/[0.015]"
                    )}
                  >
                    <div className="flex items-center gap-2.5">
                      {menu.icon}
                      <span>{menu.label}</span>
                    </div>
                    <span className={cn(
                      "text-[9px] px-2 py-0.5 font-black font-mono leading-none rounded-sm border",
                      activeSidebarFilter === menu.id 
                        ? "bg-[#eab308] text-black border-[#eab308]" 
                        : "bg-black/[0.02] text-black/50 border-black/[0.05]"
                    )}>
                      {menu.count}
                    </span>
                  </button>
                ))}
              </nav>
            </div>

            {/* Quick Metrics of distribution */}
            <div className="hidden lg:block space-y-4">
              <MetricsSummaryList label="Estoque Consolidado - Por Cor" items={stats.itemsByColor} />
              <MetricsSummaryList label="Estoque Consolidado - Por Tamanho" items={stats.itemsBySize} />
            </div>
          </div>

          {/* MAIN DATAGRID PANEL */}
          <div className="lg:col-span-9 space-y-6">
            
            {!hasForce && (
              <div className="bg-amber-50 border border-amber-200 p-4 flex flex-col sm:flex-row items-center justify-between gap-4 shadow-xs rounded-none">
                <div className="flex items-center gap-3">
                  <AlertTriangle size={24} className="text-amber-500 shrink-0" />
                  <div>
                    <h4 className="text-[10px] font-black uppercase tracking-widest text-amber-800">Modelo Base FORCE Ausente</h4>
                    <p className="text-xs text-amber-700 font-medium font-sans">O card FORCE base foi excluído do catálogo. Ele é necessário para agrupar estampas no catálogo e para os filtros corretos de buscas.</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={handleRestoreForce}
                  disabled={restoringForce}
                  className="px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white text-[9px] font-black uppercase tracking-widest transition-all rounded-none hover:shadow-xs disabled:opacity-50 shrink-0 cursor-pointer"
                >
                  {restoringForce ? "Restaurando..." : "Recriar Card FORCE"}
                </button>
              </div>
            )}

            {/* COMPACT CMS SEARCH & ADVANCED FILTER HEADER */}
            <div className="bg-white border border-black/[0.06] p-4 flex flex-col xl:flex-row items-center justify-between gap-4 shadow-sm">
              
              {/* Intelligent Input */}
              <div className="relative w-full xl:max-w-md">
                <Search size={14} className="absolute left-4 top-1/2 -translate-y-1/2 text-black/30" />
                <input 
                  type="text"
                  value={searchTerm}
                  onChange={e => {
                    setSearchTerm(e.target.value);
                    setVisibleCount(12);
                  }}
                  placeholder="Pesquisar por estampa, SKU, modelo..."
                  className="w-full bg-[#fcfcfd] border border-black/10 pl-10 pr-4 py-3 text-[11px] font-black uppercase tracking-wider focus:bg-white focus:ring-1 focus:ring-[#eab308] focus:border-[#eab308] outline-none transition-all placeholder:text-gray-400"
                />
              </div>

              {/* Layout architectures, sorting and Actions */}
              <div className="flex flex-wrap items-center gap-3 w-full xl:w-auto xl:justify-end">
                
                {/* Visual View Architecture Toggle (Hierarchical vs Flat) */}
                <div className="flex items-center border border-black/10 rounded-none overflow-hidden bg-white">
                  <button 
                    onClick={() => setViewMode('hierarchy')}
                    className={cn(
                      "px-4 py-2.5 text-[9px] font-black uppercase tracking-widest transition-colors flex items-center gap-2",
                      viewMode === 'hierarchy' ? "bg-black text-[#eab308]" : "text-gray-500 hover:bg-black/5"
                    )}
                    title="Visão Coleções (Model -> Estampa)"
                  >
                    <Layers size={12} /> Hierarquia
                  </button>
                  <button 
                    onClick={() => setViewMode('flat')}
                    className={cn(
                      "px-4 py-2.5 text-[9px] font-black uppercase tracking-widest transition-colors flex items-center gap-2",
                      viewMode === 'flat' ? "bg-black text-[#eab308]" : "text-gray-500 hover:bg-black/5"
                    )}
                    title="Catálogo Geral Plano"
                  >
                    <Database size={12} /> Catálogo Plano
                  </button>
                </div>

                <select
                  value={categoryFilter}
                  onChange={e => {
                    setCategoryFilter(e.target.value);
                    setVisibleCount(12);
                  }}
                  className="bg-white border border-black/10 px-4 py-2.5 text-[10px] font-black uppercase tracking-wider focus:outline-none focus:ring-1 focus:ring-[#eab308] h-[37px]"
                >
                  <option value="all">Filtro Sessão: Todas</option>
                  <option value="Camisetas">Sessão: Camisetas</option>
                  <option value="Moletons">Sessão: Moletons</option>
                  <option value="Acessórios">Sessão: Acessórios</option>
                  <option value="Limited">Sessão: Limited</option>
                </select>

                <select
                  value={sortBy}
                  onChange={e => setSortBy(e.target.value as any)}
                  className="bg-white border border-black/10 px-4 py-2.5 text-[10px] font-black uppercase tracking-wider focus:outline-none focus:ring-1 focus:ring-[#eab308] h-[37px]"
                >
                  <option value="name">Ordenar por: Nome A-Z</option>
                  <option value="stock-asc">Estoque: Crescente</option>
                  <option value="stock-desc">Estoque: Decrescente</option>
                  <option value="price-asc">Preço: Menor primeiro</option>
                  <option value="price-desc">Preço: Maior primeiro</option>
                </select>

                <button 
                  onClick={() => { if (!isAdding) { resetForm(); } setIsAdding(!isAdding); }}
                  className={cn(
                    "px-5 py-2.5 text-[9px] font-black uppercase tracking-widest transition-all shadow-sm flex items-center justify-center gap-1.5 h-[37px] grow sm:grow-0",
                    isAdding 
                      ? "bg-red-600 text-white hover:bg-red-700" 
                      : "bg-[#eab308] text-black hover:bg-black hover:text-white"
                  )}
                >
                  {isAdding ? <><X size={12} /> FECHAR</> : <><Plus size={12} /> NOVO PRODUTO</>}
                </button>
              </div>
            </div>

            {/* REGISTER NEW PRODUCT DRAWER/ACCORDION - BRAND NEW DESIGN */}
            <AnimatePresence>
              {isAdding && (
                <motion.div 
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  className="overflow-hidden bg-white border border-black/10 shadow-md relative"
                >
                  <div className="absolute top-0 left-0 w-full h-[3px] bg-[#eab308]" />
                  <div className="p-6 md:p-8 space-y-6">
                    <div className="flex items-center justify-between border-b border-black/[0.05] pb-4">
                      <h2 className="text-base font-black uppercase tracking-tight italic text-black flex items-center gap-2">
                        <PlusCircle className="text-[#eab308]" size={16} />
                        PUBLICAR NOVO ITEM NO CATÁLOGO
                      </h2>
                      <button 
                        onClick={() => { setIsAdding(false); resetForm(); }}
                        className="text-gray-400 hover:text-red-500 transition-colors"
                      >
                        <X size={16} />
                      </button>
                    </div>

                    <form onSubmit={handleSubmit} className="space-y-6">
                      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                        <div className="md:col-span-2 space-y-1">
                          <label className="text-[9px] font-black text-black/55 uppercase tracking-widest block">Nome do Produto</label>
                          <input 
                            required 
                            type="text" 
                            value={formData.name} 
                            onChange={e => setFormData({...formData, name: e.target.value})} 
                            className="w-full bg-[#fafafa] border border-black/10 p-3 text-[11px] font-black uppercase focus:bg-white focus:border-[#eab308] outline-none" 
                            placeholder="Ex: Camiseta FORCE Shadow" 
                          />
                        </div>
                        <div className="space-y-1">
                          <label className="text-[9px] font-black text-black/55 uppercase tracking-widest block">Categoria</label>
                          <select 
                            value={formData.category} 
                            onChange={e => setFormData({...formData, category: e.target.value})} 
                            className="w-full bg-[#fafafa] border border-black/10 p-3 text-[11px] font-black uppercase focus:bg-white focus:border-[#eab308] outline-none cursor-pointer h-[42px]"
                          >
                            <option value="Camisetas">Camisetas</option>
                            <option value="Moletons">Moletons</option>
                            <option value="Acessórios">Acessórios</option>
                            <option value="Limited">Limited Edition</option>
                          </select>
                        </div>
                        <div className="space-y-1">
                          <label className="text-[9px] font-black text-black/55 uppercase tracking-widest block">Preço de Venda (R$)</label>
                          <input 
                            required 
                            type="number" 
                            step="0.01" 
                            value={formData.price === undefined || formData.price === 0 ? '' : formData.price} 
                            onChange={e => {
                              const val = e.target.value;
                              setFormData({...formData, price: val === '' ? undefined : (parseFloat(val) || 0)});
                            }} 
                            className="w-full bg-[#fafafa] border border-black/10 p-3 text-[11px] font-black italic focus:bg-white focus:border-[#eab308] outline-none" 
                          />
                        </div>
                      </div>

                      {/* Line bindings structure */}
                      <div className="bg-[#eab308]/5 p-4 border border-[#eab308]/15 space-y-3">
                        <div className="flex items-center gap-1.5">
                          <Sparkles size={13} className="text-[#eab308]" />
                          <h4 className="text-[9px] font-black uppercase tracking-[0.15em] text-black">Vinculação de Linha / Coleção</h4>
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                          <div className="space-y-1">
                            <label className="block text-[8px] font-black text-black/40 uppercase tracking-wider">Modo Integrativo</label>
                            <select 
                              value={formData.parentSlug ? 'variation' : (formData.slug === 'force' || formData.slug === 'mark' || formData.slug === 'prime' ? 'parent' : 'standard')} 
                              onChange={(e) => {
                                const val = e.target.value;
                                if (val === 'standard' || val === 'parent') {
                                  setFormData({ ...formData, parentSlug: '', stampSize: '' });
                                } else {
                                  setFormData({ ...formData, parentSlug: 'force' });
                                }
                              }}
                              className="w-full bg-white border border-black/10 p-2.5 text-[10px] font-black uppercase tracking-wider h-[38px]"
                            >
                              <option value="standard">Produto Standalone (Ex: Solo)</option>
                              <option value="parent">Modelo / Base de Coleção (Ex: FORCE)</option>
                              <option value="variation">Estampa Vinculada a Modelo Base</option>
                            </select>
                          </div>

                          {formData.parentSlug !== undefined && (
                            <>
                              <div className="space-y-1">
                                <label className="block text-[8px] font-black text-black/40 uppercase tracking-wider">Modelo Pai Correspondente</label>
                                <select 
                                  value={formData.parentSlug || 'force'} 
                                  onChange={e => setFormData({ ...formData, parentSlug: e.target.value })} 
                                  className="w-full bg-white border border-black/10 p-2.5 text-[10px] font-black uppercase tracking-wider h-[38px]"
                                >
                                  <option value="">-- Sem Dependência --</option>
                                  <option value="force">FORCE</option>
                                  <option value="mark">MARK</option>
                                  <option value="prime">PRIME</option>
                                </select>
                              </div>

                              <div className="space-y-1">
                                <label className="block text-[8px] font-black text-black/40 uppercase tracking-wider">Medida Geral da Estampa</label>
                                <input 
                                  type="text" 
                                  value={formData.stampSize || ''} 
                                  onChange={e => setFormData({ ...formData, stampSize: e.target.value })} 
                                  className="w-full bg-white border border-black/10 p-2.5 text-[10px] font-black uppercase tracking-wider h-[38px]" 
                                  placeholder="Ex: Peito (10cm)" 
                                />
                              </div>
                            </>
                          )}
                        </div>
                      </div>

                      {/* Slugs and badges */}
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <div className="space-y-1">
                          <label className="text-[9px] font-black text-black/55 uppercase tracking-widest block">Ref Slug (SKU único)</label>
                          <input 
                            type="text" 
                            required
                            value={formData.slug} 
                            onChange={e => setFormData({...formData, slug: handleCreateSlug(e.target.value)})} 
                            className="w-full bg-[#fafafa] border border-black/10 p-2.5 text-[11px] font-mono focus:bg-white focus:border-[#eab308] outline-none" 
                            placeholder="Ex: force-shadow" 
                          />
                        </div>
                        <div className="space-y-1">
                          <label className="text-[9px] font-black text-black/55 uppercase tracking-widest block">Headline Destaque</label>
                          <input 
                            type="text" 
                            value={formData.headline} 
                            onChange={e => setFormData({...formData, headline: e.target.value})} 
                            className="w-full bg-[#fafafa] border border-black/10 p-2.5 text-[11px] font-black focus:bg-white focus:border-[#eab308] outline-none" 
                            placeholder="Ex: ALGODÃO OVERSIZED | 240GSM" 
                          />
                        </div>
                        <div className="flex items-center gap-4 p-2.5 bg-gray-50 border border-black/[0.04]">
                          <button 
                            type="button" 
                            onClick={() => setFormData({...formData, isNew: !formData.isNew})} 
                            className={cn("flex-1 px-3 py-2 text-[8px] font-black uppercase tracking-widest border transition-colors", formData.isNew ? "bg-[#eab308] text-black border-[#eab308]" : "bg-white text-gray-400 border-black/10")}
                          >
                            Lançamento (New)
                          </button>
                          <button 
                            type="button" 
                            onClick={() => setFormData({...formData, isBestseller: !formData.isBestseller})} 
                            className={cn("flex-1 px-3 py-2 text-[8px] font-black uppercase tracking-widest border transition-colors", formData.isBestseller ? "bg-[#eab308] text-black border-[#eab308]" : "bg-white text-gray-400 border-black/10")}
                          >
                            Destaque (Best)
                          </button>
                        </div>
                      </div>

                      <div className="space-y-1">
                        <label className="text-[9px] font-black text-black/55 uppercase tracking-widest block">Descrição do Produto</label>
                        <textarea 
                          rows={2} 
                          value={formData.description} 
                          onChange={e => setFormData({...formData, description: e.target.value})} 
                          className="w-full bg-[#fafafa] border border-black/10 p-3 text-[11px] font-bold focus:bg-white focus:border-[#eab308] outline-none leading-relaxed text-black" 
                          placeholder="Detalhes completos..."
                        />
                      </div>

                      <button
                        type="submit"
                        disabled={loading}
                        className="w-full bg-black hover:bg-[#eab308] text-white hover:text-black font-black py-4 uppercase tracking-[0.25em] text-[10px] transition-all flex items-center justify-center gap-2 cursor-pointer"
                      >
                        {loading ? <Loader2 className="animate-spin" size={14} /> : <><Save size={14} /> PUBLICAR PRODUTO NO BANCO</>}
                      </button>
                    </form>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* ERROR STATS OR NO RESULT MESSAGE */}
            {filteredProducts.length === 0 && (
              <div className="bg-white border border-black/[0.05] p-16 text-center space-y-3">
                <Box className="mx-auto text-black/10" size={32} />
                <p className="text-sm font-black uppercase tracking-widest text-[#eab308]">SEM ITENS CORRESPONDENTES</p>
                <p className="text-xs text-gray-400 uppercase tracking-wider font-semibold max-w-sm mx-auto">
                  Por favor redefina seus parâmetros na barra de pesquisa ou retorne ao filtro Geral da loja.
                </p>
                <button 
                  onClick={() => { setActiveSidebarFilter('all'); setSearchTerm(''); setCategoryFilter('all'); }} 
                  className="bg-black text-[#eab308] hover:bg-[#eab308] hover:text-black transition-colors px-6 py-3 text-[9px] font-black uppercase tracking-widest cursor-pointer"
                >
                  Exibir Todo o Catálogo
                </button>
              </div>
            )}

            {/* CATEGORIZED HIERARCHICAL FOLDERS VIEW (MODEL -> ESTAMPA -> VARIATION GRID) */}
            {viewMode === 'hierarchy' && filteredProducts.length > 0 && (
              <div className="space-y-6">
                {hierarchicalViewData.models.slice(0, visibleCount).map((model) => {
                  const stampChildren = hierarchicalViewData.childrenByParent[model.slug] || [];
                  
                  // Consolidate stocks from parent + children from dynamic inventory hook
                  const parentStock = inventory[model.slug]?.stock || 0;
                  const childrenStockSum = stampChildren.reduce((acc, c) => acc + (inventory[c.slug]?.stock || 0), 0);
                  const totalConsolidatedStock = parentStock + childrenStockSum;

                  const isModelAvailable = inventory[model.slug]?.available !== false;

                  return (
                    <div key={model.id} className="bg-white border border-black/[0.07] shadow-xs relative overflow-hidden transition-all hover:border-black/15">
                      
                      {/* HIGHLIGHT STRIP FOR MODEL GROUP */}
                      <div className="h-[2.5px] bg-black/80 w-full" />

                      {/* ROOT MODEL ROW: EXTREMELY COMPACT */}
                      <div className="p-4 md:px-5 bg-neutral-50 border-b border-black/[0.04] flex flex-col md:flex-row md:items-center justify-between gap-4">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-12 bg-gray-100 border border-black/5 shrink-0 overflow-hidden relative group">
                            <img 
                              src={model.images?.[0] || 'https://images.unsplash.com/photo-1521572267360-ee0c2909d518?w=100&q=80'} 
                              referrerPolicy="no-referrer"
                              alt={model.name} 
                              className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-110" 
                            />
                          </div>
                          <div>
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="text-[7px] font-black tracking-widest uppercase bg-black text-[#eab308] px-1 py-0.5 rounded-xs">LINHA MÃE</span>
                              <span className="text-[8px] font-mono font-bold text-gray-400 uppercase tracking-widest">{model.slug}</span>
                              <span className="text-gray-300">•</span>
                              <span className="text-[8px] font-black uppercase text-gray-400">{model.category}</span>
                            </div>
                            <h2 className="text-sm font-black uppercase text-black italic tracking-tight">{model.name}</h2>
                            <p className="text-[8.5px] font-bold text-black/40 uppercase tracking-wider">{model.headline} • R$ {model.price?.toFixed(2)}</p>
                          </div>
                        </div>

                        {/* Inventory quick overview */}
                        <div className="flex items-center gap-6 text-xs text-black/50 pr-4">
                          <div className="text-left font-mono">
                            <span className="text-[7.5px] block font-sans font-black uppercase text-gray-400 tracking-wider">Estampas Registradas</span>
                            <span className="text-[11px] font-black text-black italic tracking-tight">{stampChildren.length} artes</span>
                          </div>
                          <div className="text-left font-mono">
                            <span className="text-[7.5px] block font-sans font-black uppercase text-gray-400 tracking-wider">Estoque Geral Integrado</span>
                            <span className={cn(
                              "text-[11px] font-black italic",
                              totalConsolidatedStock === 0 ? "text-rose-600 font-bold" : totalConsolidatedStock < 10 ? "text-amber-500" : "text-black"
                            )}>
                              {totalConsolidatedStock} un
                            </span>
                          </div>
                          <div className="text-left">
                            <span className="text-[7.5px] block font-sans font-black uppercase text-gray-400 tracking-wider">Status Geral</span>
                            <button 
                              onClick={() => toggleAvailability(model.slug, isModelAvailable)}
                              className={cn(
                                "text-[9px] font-black uppercase px-1.5 py-0.5 border cursor-pointer",
                                isModelAvailable ? "border-emerald-500 text-emerald-600 bg-emerald-50" : "border-rose-300 text-rose-500 bg-rose-50"
                              )}
                            >
                              {isModelAvailable ? "ATIVO" : "INATIVO"}
                            </button>
                          </div>
                        </div>

                        {/* Top quick model actions */}
                        <div className="flex items-center gap-1.5 shrink-0 self-end md:self-auto">
                          <button 
                            onClick={() => openProductDrawer(model, 'stock')}
                            className="px-2.5 py-2 text-[8px] font-black uppercase tracking-wider border bg-white text-black border-black/10 hover:bg-black hover:text-white hover:border-black transition-all flex items-center gap-1"
                          >
                            <Database size={10} /> Estoque
                          </button>
                          <button 
                            onClick={() => openProductDrawer(model, 'media')}
                            className="px-2.5 py-2 text-[8px] font-black uppercase tracking-wider border bg-white text-black border-black/10 hover:bg-black hover:text-white hover:border-black transition-all flex items-center gap-1"
                          >
                            <ImageIcon size={10} /> Imagens
                          </button>
                          <button 
                            onClick={() => openProductDrawer(model, 'details')}
                            className="px-2.5 py-2 text-[8px] font-black uppercase tracking-wider border bg-black text-[#eab308] border-black hover:bg-[#eab308] hover:text-black transition-all flex items-center gap-1"
                          >
                            <Edit3 size={10} /> EDITAR / EXPANDIR
                          </button>
                          <button 
                            onClick={() => handleDelete(model.id, model.slug)}
                            className={cn(
                              "px-2.5 py-2 text-[8px] font-black uppercase tracking-wider border transition-all flex items-center gap-1",
                              deletingId === model.id 
                                ? "bg-rose-600 text-white border-rose-700 font-bold animate-pulse" 
                                : "bg-rose-50 hover:bg-rose-600 text-rose-500 hover:text-white border-rose-200"
                            )}
                            title="Excluir Linha Mãe"
                          >
                            <Trash2 size={10} /> {deletingId === model.id ? "CONFIRMA?" : "EXCLUIR"}
                          </button>
                        </div>
                      </div>

                      {/* CONFINED NESTED CHILDRENS (ESTAMPAS) */}
                      {stampChildren.length > 0 ? (
                        <div className="divide-y divide-black/[0.04] bg-white pl-4 md:pl-10 relative">
                          {/* Tree visual guideline */}
                          <div className="absolute left-2 md:left-5 top-0 bottom-4 w-[1px] bg-black/10" />

                          {stampChildren.map((stamp) => {
                            const isStampAvailable = inventory[stamp.slug]?.available !== false;
                            const stampStock = inventory[stamp.slug]?.stock || 0;
                            const variationCount = (stamp.colors?.length || 0) * (stamp.sizes?.length || 0);

                            return (
                              <div key={stamp.id} className="p-3 md:p-4 flex flex-col md:flex-row md:items-center justify-between gap-3 relative hover:bg-black/[0.01] transition-all">
                                
                                {/* Little tree connector */}
                                <div className="absolute left-[-16px] md:left-[-20px] top-1/2 -translate-y-1/2 w-4 h-[1px] bg-black/10" />

                                <div className="flex items-center gap-3">
                                  <div className="w-8 h-10 bg-gray-100 border border-black/5 shrink-0 overflow-hidden relative">
                                    <img 
                                      src={stamp.images?.[0] || 'https://images.unsplash.com/photo-1521572267360-ee0c2909d518?w=100&q=80'} 
                                      referrerPolicy="no-referrer"
                                      alt={stamp.name} 
                                      className="w-full h-full object-cover" 
                                    />
                                  </div>
                                  <div>
                                    <div className="flex items-center gap-2">
                                      <span className="text-[8px] font-mono font-bold text-gray-400 uppercase tracking-widest">{stamp.slug}</span>
                                      {stamp.isNew && <span className="text-[7px] font-black uppercase bg-[#eab308]/15 text-black border border-[#eab308]/30 px-1 py-0.2 rounded-xs">NEW</span>}
                                      {stamp.isBestseller && <span className="text-[7px] font-black uppercase bg-black text-[#eab308] px-1 py-0.2 rounded-xs">BEST</span>}
                                    </div>
                                    <h3 className="text-xs font-bold text-black uppercase tracking-tight">{stamp.name}</h3>
                                    <p className="text-[8px] text-gray-400 uppercase font-bold tracking-wider">{stamp.headline || 'Estampa da Coleção'}</p>
                                  </div>
                                </div>

                                <div className="flex flex-wrap items-center gap-4 text-xs pr-2">
                                  <div className="text-left font-mono">
                                    <span className="text-[7px] block font-sans font-black uppercase text-gray-400 tracking-wider">Variações</span>
                                    <span className="text-[10px] font-semibold text-black">{variationCount} combinações</span>
                                  </div>
                                  <div className="text-left font-mono">
                                    <span className="text-[7px] block font-sans font-black uppercase text-gray-400 tracking-wider">Estoque Físico</span>
                                    <span className={cn(
                                      "text-[10px] font-black",
                                      stampStock === 0 ? "text-rose-500 font-bold" : "text-black"
                                    )}>
                                      {stampStock} un
                                    </span>
                                  </div>
                                  <div className="text-left font-mono">
                                    <span className="text-[7px] block font-sans font-black uppercase text-gray-400 tracking-wider">Status</span>
                                    <button 
                                      onClick={() => toggleAvailability(stamp.slug, isStampAvailable)}
                                      className={cn(
                                        "text-[8px] font-bold uppercase px-1 py-0.1 border cursor-pointer",
                                        isStampAvailable ? "border-emerald-400 text-emerald-600 bg-emerald-50" : "border-rose-200 text-rose-500 bg-rose-50"
                                      )}
                                    >
                                      {isStampAvailable ? "ATIVO" : "INATIVO"}
                                    </button>
                                  </div>
                                </div>

                                <div className="flex items-center gap-1.5 shrink-0 self-end md:self-auto">
                                  <button 
                                    onClick={() => openProductDrawer(stamp, 'stock')}
                                    className="px-2 py-1.5 text-[8px] font-black uppercase border border-black/10 bg-white hover:bg-black hover:text-white transition-all"
                                  >
                                    Estoque
                                  </button>
                                  <button 
                                    onClick={() => openProductDrawer(stamp, 'media')}
                                    className="px-2 py-1.5 text-[8px] font-black uppercase border border-black/10 bg-white hover:bg-black hover:text-white transition-all"
                                  >
                                    Imagens
                                  </button>
                                  <button 
                                    onClick={() => openProductDrawer(stamp, 'details')}
                                    className="px-2.5 py-1.5 text-[8px] font-black uppercase bg-black text-[#eab308] border border-black hover:bg-neutral-800 transition-all flex items-center gap-1"
                                  >
                                    <SlidersHorizontal size={9} /> EXPANDIR
                                  </button>
                                  <button 
                                    onClick={() => handleDelete(stamp.id, stamp.slug)}
                                    className={cn(
                                      "p-1 px-1.5 transition-colors border rounded-sm",
                                      deletingId === stamp.id 
                                        ? "bg-rose-600 text-white border-rose-700 font-bold text-[8px] uppercase tracking-wide px-2" 
                                        : "text-rose-400 hover:text-rose-600 hover:bg-rose-50 border-transparent"
                                    )}
                                    title="Remover Estampa"
                                  >
                                    {deletingId === stamp.id ? "CONFIRMA?" : <Trash2 size={11} />}
                                  </button>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      ) : (
                        <div className="p-4 pl-10 text-[9px] font-semibold uppercase tracking-widest text-gray-400 bg-white">
                          Nenhuma estampa registrada para esta linha sob o filtro atual. Base pura ativa no catálogo.
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            {/* CATALOG FLAT VIEW (A PURE CONDENSED TABLE AS REQUESTED IN LAYOUT NOVO) */}
            {viewMode === 'flat' && filteredProducts.length > 0 && (
              <div className="bg-white border border-black/[0.06] shadow-sm rounded-none overflow-x-auto">
                <table className="w-full text-left border-collapse min-w-[750px] table-fixed">
                  <thead>
                    <tr className="border-b border-black/[0.08] bg-neutral-50">
                      <th className="p-3 text-[9px] font-black uppercase tracking-widest text-[#eab308] w-2/5">Informações do Produto</th>
                      <th className="p-3 text-[9px] font-black uppercase tracking-widest text-[#eab308] w-1/5">Modelo Vinculado</th>
                      <th className="p-3 text-[9px] font-black uppercase tracking-widest text-[#eab308] w-1/10">Preço</th>
                      <th className="p-3 text-[9px] font-black uppercase tracking-widest text-[#eab308] w-1/10 text-center">Estoque Físico</th>
                      <th className="p-3 text-[9px] font-black uppercase tracking-widest text-[#eab308] w-1/10 text-center">Status</th>
                      <th className="p-3 text-[9px] font-black uppercase tracking-widest text-[#eab308] w-1/5 text-right">Ações</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-black/[0.04]">
                    {filteredProducts.slice(0, visibleCount).map((p) => {
                      const totalStockVal = inventory[p.slug]?.stock || 0;
                      const isAvailable = inventory[p.slug]?.available !== false;
                      const parentText = p.parentSlug ? String(p.parentSlug).toUpperCase() : "LINHA SOLO / BASE";

                      return (
                        <tr key={p.id} className="hover:bg-black/[0.01] transition-colors">
                          <td className="p-3">
                            <div className="flex items-center gap-3">
                              <div className="w-8 h-10 bg-gray-100 border border-black/5 shrink-0 overflow-hidden relative">
                                <img 
                                  src={p.images?.[0] || 'https://images.unsplash.com/photo-1521572267360-ee0c2909d518?w=100&q=80'} 
                                  referrerPolicy="no-referrer"
                                  alt={p.name} 
                                  className="w-full h-full object-cover" 
                                />
                              </div>
                              <div className="truncate">
                                <div className="flex items-center gap-1.5 flex-wrap">
                                  <span className="text-[8px] font-mono text-gray-400 font-bold">{p.slug}</span>
                                  {p.isNew && <span className="bg-[#eab308]/15 text-black text-[7px] px-1 py-0.1 border border-[#eab308]/30 font-black">NEW</span>}
                                  {p.isBestseller && <span className="bg-black text-[#eab308] text-[7px] px-1 py-0.1 font-black">BEST</span>}
                                </div>
                                <h4 className="text-xs font-bold text-black uppercase truncate">{p.name}</h4>
                                <p className="text-[8.5px] text-gray-400 truncate uppercase mt-0.5">{p.headline}</p>
                              </div>
                            </div>
                          </td>
                          <td className="p-3">
                            <span className="font-mono text-[9px] font-black uppercase bg-neutral-100 px-2 py-1 border border-neutral-200 text-neutral-600 rounded-sm">
                              {parentText}
                            </span>
                          </td>
                          <td className="p-3">
                            <span className="font-mono text-xs font-bold">R$ {p.price?.toFixed(2)}</span>
                          </td>
                          <td className="p-3 text-center">
                            <span className={cn(
                              "font-mono text-xs font-black px-2 py-0.5 border rounded-sm",
                              totalStockVal === 0 
                                ? "bg-rose-50 text-rose-600 border-rose-300 font-bold" 
                                : totalStockVal < 10 
                                  ? "bg-amber-50 text-amber-600 border-amber-300" 
                                  : "bg-emerald-50 text-emerald-600 border-emerald-300"
                            )}>
                              {totalStockVal}
                            </span>
                          </td>
                          <td className="p-3 text-center">
                            <button 
                              onClick={() => toggleAvailability(p.slug, isAvailable)}
                              className={cn(
                                "text-[9px] font-black px-2 py-1 border cursor-pointer",
                                isAvailable ? "border-emerald-500 text-emerald-600 bg-emerald-50" : "border-rose-300 text-rose-500 bg-rose-50"
                              )}
                            >
                              {isAvailable ? "ATIVO" : "INATIVO"}
                            </button>
                          </td>
                          <td className="p-3 text-right">
                            <div className="flex items-center justify-end gap-1.5">
                              <button 
                                onClick={() => openProductDrawer(p, 'stock')}
                                className="p-1.5 bg-neutral-100 hover:bg-black hover:text-white transition-all text-gray-700 border border-neutral-200"
                                title="Editar Grade Estoque"
                              >
                                <Database size={11} />
                              </button>
                              <button 
                                onClick={() => openProductDrawer(p, 'media')}
                                className="p-1.5 bg-neutral-100 hover:bg-black hover:text-white transition-all text-gray-700 border border-neutral-200"
                                title="URLs de Mídia"
                              >
                                <ImageIcon size={11} />
                              </button>
                              <button 
                                onClick={() => openProductDrawer(p, 'details')}
                                className="px-2.5 py-1.5 bg-black text-[#eab308] hover:bg-neutral-800 transition-all text-[8.5px] font-black uppercase flex items-center gap-1"
                              >
                                <Edit3 size={10} /> EXPANDIR
                              </button>
                              <button 
                                onClick={() => handleDelete(p.id, p.slug)}
                                className={cn(
                                  "p-1.5 transition-all border",
                                  deletingId === p.id 
                                    ? "bg-rose-500 text-white border-rose-600 font-bold text-[8.5px] uppercase tracking-wide px-2 animate-pulse" 
                                    : "bg-rose-50 hover:bg-rose-600 text-rose-500 hover:text-white border-rose-200"
                                )}
                                title="Excluir do Catálogo"
                              >
                                {deletingId === p.id ? "CONFIRMA?" : <Trash2 size={11} />}
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}

            {/* PAGINATION / PAGINACÃO INTELECTUAL */}
            {filteredProducts.length > visibleCount && (
              <div className="flex justify-center pt-4">
                <button
                  onClick={() => setVisibleCount(prev => prev + 12)}
                  className="bg-black hover:bg-[#eab308] text-white hover:text-black font-black uppercase text-[10px] tracking-widest px-8 py-3.5 border border-black shadow-sm transition-all cursor-pointer"
                >
                  CARREGAR MAIS PRODUTOS (+12)
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* DYNAMIC RIGHT-SIDE WORKSPACE DRAWER ("EXPANDIR") */}
      <AnimatePresence>
        {selectedProduct && (
          <>
            {/* Backdrop */}
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 0.5 }}
              exit={{ opacity: 0 }}
              onClick={() => setSelectedProduct(null)}
              className="fixed inset-0 bg-black z-50 cursor-pointer"
            />

            {/* Elegant Right Slide-over Panel */}
            <motion.div 
              initial={{ x: '100%' }}
              animate={{ x: 0 }}
              exit={{ x: '100%' }}
              transition={{ type: 'spring', damping: 25, stiffness: 200 }}
              className="fixed top-0 right-0 h-full w-full sm:max-w-xl md:max-w-2xl bg-white shadow-2xl z-50 flex flex-col border-l border-neutral-300"
            >
              
              {/* Drawer Top Header info */}
              <div className="p-5 bg-neutral-900 text-white flex items-center justify-between border-b border-black shrink-0">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-12 bg-white/10 shrink-0 overflow-hidden relative border border-white/10">
                    <img 
                      src={selectedProduct.images?.[0] || 'https://images.unsplash.com/photo-1521572267360-ee0c2909d518?w=100&q=80'} 
                      referrerPolicy="no-referrer"
                      alt={selectedProduct.name} 
                      className="w-full h-full object-cover" 
                    />
                  </div>
                  <div>
                    <span className="text-[7.5px] bg-[#eab308] text-black px-1.5 py-0.5 rounded-xs font-black uppercase tracking-wider block w-fit leading-none mb-1">
                      {selectedProduct.category?.toUpperCase() || "CAMISETAS"}
                    </span>
                    <h2 className="text-sm font-black uppercase tracking-tight truncate max-w-sm italic">
                      {selectedProduct.name}
                    </h2>
                    <p className="text-[9px] text-gray-400 font-mono">
                      Ref SKU: <span className="text-white font-bold">{selectedProduct.slug}</span>
                    </p>
                  </div>
                </div>
                <button 
                  onClick={() => setSelectedProduct(null)}
                  className="p-2 text-gray-400 hover:text-white transition-colors cursor-pointer"
                >
                  <X size={20} />
                </button>
              </div>

              {/* SEGMENTED TAB CLASSIFICATIONS */}
              <div className="flex bg-neutral-100 border-b border-black/[0.1] shrink-0 overflow-x-auto scrollbar-none">
                {[
                  { id: 'details', label: 'Dados Gerais', icon: <Edit3 size={11} /> },
                  { id: 'stock', label: 'Estoque Grade', icon: <Database size={11} /> },
                  { id: 'media', label: 'URLs & Galeria', icon: <ImageIcon size={11} /> },
                  { id: 'variants_setup', label: 'Variantes Setup', icon: <Settings2 size={11} /> }
                ].map((t) => (
                  <button
                    key={t.id}
                    onClick={() => setDrawerTab(t.id as any)}
                    className={cn(
                      "flex-1 px-4 py-3.5 text-[9px] font-black uppercase tracking-widest border-r border-black/[0.08] transition-all flex items-center justify-center gap-2 cursor-pointer shrink-0 min-w-[120px]",
                      drawerTab === t.id 
                        ? "bg-white text-black border-b-[2.5px] border-b-[#eab308] font-black" 
                        : "text-gray-500 hover:bg-neutral-200"
                    )}
                  >
                    {t.icon}
                    <span>{t.label}</span>
                  </button>
                ))}
              </div>

              {/* DRAWER SCROLLABLE DYNAMIC WORKSPACE */}
              <div className="flex-1 overflow-y-auto p-6 md:p-8 space-y-6">
                
                {/* DETAILS COMPONENT CONTENT */}
                {drawerTab === 'details' && (
                  <DrawerDetailsTab 
                    product={selectedProduct} 
                    onUpdate={handleProductUpdate} 
                    products={products}
                  />
                )}

                {/* STOCK MATRIX GRID SYSTEM */}
                {drawerTab === 'stock' && (
                  <DrawerStockMatrixTab 
                    product={selectedProduct} 
                    inventory={inventory}
                    updateVariantStock={updateVariantStock}
                    updateMultipleVariantStocks={updateMultipleVariantStocks}
                    products={products}
                  />
                )}

                {/* IMAGES & URL MANAGEMENT ZONE */}
                {drawerTab === 'media' && (
                  <DrawerMediaTab 
                    product={selectedProduct} 
                    onUpdate={handleProductUpdate} 
                    handleFileUpload={handleFileUpload}
                    isUploading={isUploading}
                  />
                )}

                {/* CONFIGURATIONS & GRIDS ENABLEMENT */}
                {drawerTab === 'variants_setup' && (
                  <DrawerVariantsSetupTab 
                    product={selectedProduct} 
                    inventory={inventory[selectedProduct.slug] || { available: true, stock: 0, variants: {} }}
                    onUpdate={handleProductUpdate}
                    toggleVariantAvailability={toggleVariantAvailability}
                    toggleColorAvailability={toggleColorAvailability}
                  />
                )}
              </div>

              {/* DRAWER QUICK PERSISTENT SAVING HINT FOOTER */}
              <div className="p-4 bg-neutral-50 border-t border-black/[0.08] text-center shrink-0 flex items-center justify-between text-[9px] font-bold text-gray-400 uppercase tracking-widest">
                <span>CMS F PAC ADMIN CONTROL</span>
                <span className="text-[#eab308]">● Alterações persistem em tempo real no banco</span>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}

/* ====================================================
SUBCOMPONENTS - DETAILS TAB
==================================================== */
function DrawerDetailsTab({ 
  product, 
  onUpdate, 
  products 
}: { 
  product: Product; 
  onUpdate: (updatedFields: Partial<Product>) => Promise<void>; 
  products: Product[] 
}) {
  const [localState, setLocalState] = useState<Partial<Product>>({ ...product });
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setLocalState({ ...product });
  }, [product]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const cleanData = { ...localState };
      if (!cleanData.parentSlug || cleanData.parentSlug.trim() === '') {
        delete cleanData.parentSlug;
      }
      if (!cleanData.stampSize || cleanData.stampSize.trim() === '') {
        delete cleanData.stampSize;
      }
      await onUpdate(cleanData);
    } finally {
      setLoading(false);
    }
  };

  const handleSpecChange = (index: number, val: string) => {
    const list = [...(localState.specs || [])];
    list[index] = val;
    setLocalState({ ...localState, specs: list });
  };

  const addSpecLine = () => {
    setLocalState({ ...localState, specs: [...(localState.specs || []), ''] });
  };

  const removeSpecLine = (index: number) => {
    const list = (localState.specs || []).filter((_, i) => i !== index);
    setLocalState({ ...localState, specs: list });
  };

  return (
    <form onSubmit={handleSave} className="space-y-5">
      <div className="text-[10px] font-black uppercase tracking-[0.2em] text-[#eab308] flex items-center gap-1">
        <SlidersHorizontal size={12} /> DADOS CADASTRAIS CORE
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="space-y-1">
          <label className="text-[8px] font-black uppercase tracking-wider text-gray-400">Nome do Produto</label>
          <input 
            type="text" 
            required 
            value={localState.name || ''} 
            onChange={e => setLocalState({...localState, name: e.target.value})}
            className="w-full bg-neutral-50 border border-neutral-300 p-2.5 text-xs font-semibold focus:bg-white focus:border-black outline-none"
          />
        </div>
        
        <div className="space-y-1">
          <label className="text-[8px] font-black uppercase tracking-wider text-gray-400">Preço de Venda (R$)</label>
          <input 
            type="number" 
            step="0.01" 
            required 
            value={localState.price === undefined || localState.price === 0 ? '' : localState.price} 
            onChange={e => {
              const val = e.target.value;
              setLocalState({...localState, price: val === '' ? undefined : (parseFloat(val) || 0)});
            }}
            className="w-full bg-neutral-50 border border-neutral-300 p-2.5 text-xs font-semibold focus:bg-white focus:border-black outline-none"
          />
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="space-y-1">
          <label className="text-[8px] font-black uppercase tracking-wider text-gray-400">Slogan / Headline Comercial</label>
          <input 
            type="text" 
            value={localState.headline || ''} 
            onChange={e => setLocalState({...localState, headline: e.target.value})}
            className="w-full bg-neutral-50 border border-neutral-300 p-2.5 text-xs font-semibold focus:bg-white focus:border-black outline-none"
            placeholder="Ex: ALGODÃO OVERSIZED | 240GSM"
          />
        </div>
        
        <div className="space-y-1">
          <label className="text-[8px] font-black uppercase tracking-wider text-gray-400">Ref Slug (SKU)</label>
          <input 
            type="text" 
            disabled 
            value={localState.slug || ''} 
            className="w-full bg-[#f0f0f2] border border-neutral-300 p-2.5 text-xs font-mono font-bold text-gray-400 outline-none"
            title="Slugs são chaves exclusivas de banco e não alteráveis preventivamente."
          />
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 bg-neutral-50 p-3 border border-neutral-200">
        <div className="space-y-1">
          <label className="text-[8px] font-black uppercase tracking-wider text-gray-400">Coleção / Modelo Pai</label>
          <select 
            value={localState.parentSlug || ''} 
            onChange={e => setLocalState({...localState, parentSlug: e.target.value})}
            className="w-full bg-white border border-neutral-300 p-2 text-xs font-semibold h-[34px]"
          >
            <option value="">-- Standalone (Nenhum) --</option>
            <option value="force">Linha FORCE</option>
            <option value="mark">Linha MARK</option>
            <option value="prime">Linha PRIME</option>
          </select>
        </div>

        <div className="space-y-1">
          <label className="text-[8px] font-black uppercase tracking-wider text-gray-400">Estampa Medida</label>
          <input 
            type="text" 
            value={localState.stampSize || ''} 
            onChange={e => setLocalState({...localState, stampSize: e.target.value})}
            className="w-full bg-white border border-neutral-300 p-2 text-xs font-semibold h-[34px]"
            placeholder="Ex: Peito (10cm)"
          />
        </div>

        <div className="space-y-1">
          <label className="text-[8px] font-black uppercase tracking-wider text-gray-400">Mínimo Mock Estoque</label>
          <input 
            type="number" 
            value={localState.minStock || 5} 
            onChange={e => setLocalState({...localState, minStock: parseInt(e.target.value) || 0})}
            className="w-full bg-white border border-neutral-300 p-2 text-xs font-semibold h-[34px]"
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="flex items-center gap-2 p-3 bg-neutral-50 border border-neutral-200">
          <input 
            type="checkbox" 
            id="isNew"
            checked={!!localState.isNew} 
            onChange={e => setLocalState({...localState, isNew: e.target.checked})}
            className="w-4 h-4 text-black border-neutral-300 rounded-sm focus:ring-[#eab308]"
          />
          <label htmlFor="isNew" className="text-[9px] font-black uppercase tracking-wider select-none text-gray-700 cursor-pointer">Sinalizar Lançamento (New)</label>
        </div>

        <div className="flex items-center gap-2 p-3 bg-neutral-50 border border-neutral-200">
          <input 
            type="checkbox" 
            id="isBestseller"
            checked={!!localState.isBestseller} 
            onChange={e => setLocalState({...localState, isBestseller: e.target.checked})}
            className="w-4 h-4 text-black border-neutral-300 rounded-sm focus:ring-[#eab308]"
          />
          <label htmlFor="isBestseller" className="text-[9px] font-black uppercase tracking-wider select-none text-gray-700 cursor-pointer">Sinalizar Destaque (Best)</label>
        </div>
      </div>

      <div className="space-y-1">
        <label className="text-[8px] font-black uppercase tracking-wider text-gray-400">Descrição Comercial Complementar</label>
        <textarea 
          rows={3}
          value={localState.description || ''} 
          onChange={e => setLocalState({...localState, description: e.target.value})}
          className="w-full bg-neutral-50 border border-neutral-300 p-2.5 text-xs font-medium leading-relaxed focus:bg-white focus:border-black outline-none"
        />
      </div>

      <div className="space-y-2 border-t border-neutral-200 pt-4">
        <div className="flex items-center justify-between">
          <label className="text-[8px] font-black uppercase tracking-wider text-gray-400">Ficha Técnica de Materiais</label>
          <button 
            type="button" 
            onClick={addSpecLine}
            className="text-[8px] font-black text-emerald-600 uppercase tracking-widest flex items-center gap-1 hover:underline cursor-pointer"
          >
            <Plus size={10} /> Inserir Linha
          </button>
        </div>
        
        <div className="space-y-2">
          {(localState.specs || []).map((spec, i) => (
            <div key={i} className="flex items-center gap-2">
              <input 
                type="text" 
                value={spec} 
                onChange={e => handleSpecChange(i, e.target.value)}
                className="flex-1 bg-neutral-50 border border-neutral-300 p-2 text-xs font-semibold focus:bg-white outline-none"
                placeholder="Ex: 100% Algodão Premium | Fio 30.1 Penteado"
              />
              <button 
                type="button" 
                onClick={() => removeSpecLine(i)}
                className="text-gray-400 hover:text-rose-500 transition-colors cursor-pointer"
              >
                <X size={14} />
              </button>
            </div>
          ))}
          {(localState.specs || []).length === 0 && (
            <div className="text-[10px] text-gray-400 italic">Nenhuma especificação definida.</div>
          )}
        </div>
      </div>

      <button
        type="submit"
        disabled={loading}
        className="w-full bg-black hover:bg-[#eab308] text-white hover:text-black font-black uppercase text-[10px] tracking-[0.2em] py-4 transition-all flex items-center justify-center gap-2 cursor-pointer mt-4"
      >
        {loading ? <Loader2 className="animate-spin" size={13} /> : <><Save size={13} /> SALVAR INFORMAÇÕES CADASTRAIS</>}
      </button>
    </form>
  );
}

/* ====================================================
SUBCOMPONENTS - STOCK MATRIX TAB
==================================================== */
function DrawerStockMatrixTab({
  product,
  inventory,
  updateVariantStock,
  updateMultipleVariantStocks,
  products
}: {
  product: Product;
  inventory: any;
  updateVariantStock: (id: string, variantKey: string, stock: number) => Promise<void>;
  updateMultipleVariantStocks: (id: string, updates: { [variantKey: string]: number }) => Promise<void>;
  products?: Product[];
}) {
  const [activeCellEditing, setActiveCellEditing] = useState<string | null>(null);
  const [cellTempVal, setCellTempVal] = useState<string>('');
  const [globalBulkStock, setGlobalBulkStock] = useState<string>('');
  const [confirmingBulk, setConfirmingBulk] = useState(false);
  
  // Safe extraction of keys mapping colors and sizes
  const sizes = useMemo(() => {
    return product.sizes?.length > 0 ? product.sizes : ['P', 'M', 'G', 'GG'];
  }, [product.sizes]);

  const colors = useMemo(() => {
    return product.colors?.length > 0 ? product.colors : [{ name: 'Sem Cor', hex: '#ccc' }];
  }, [product.colors]);

  const hasColors = product.colors && product.colors.length > 0;

  // Real-time stock calculator
  const getCellStock = (colorName: string, sizeName: string) => {
    const key = hasColors ? `${colorName}_${sizeName}` : sizeName;
    const prodInv = inventory?.[product.slug] || {};
    const variants = prodInv.variants || {};
    return variants[key]?.stock !== undefined ? Number(variants[key].stock) : 0;
  };

  const isMotherLine = product.slug === 'force' || product.slug === 'mark' || product.slug === 'prime';

  if (isMotherLine) {
    const stampsList = (products || []).filter(p => p.parentSlug === product.slug);
    return (
      <div className="space-y-6">
        <div className="text-[10px] font-black uppercase tracking-[0.2em] text-[#eab308] flex items-center gap-1.5">
          <Database size={12} /> INVENTÁRIO INTEGRADO - LINHA MÃE
        </div>
        
        <div className="p-5 border-l-4 border-[#eab308] bg-neutral-950 text-white shadow-md rounded-xs">
          <h4 className="text-xs font-black uppercase tracking-wider mb-2 text-[#eab308]">INFORMAÇÃO DE FLUXO</h4>
          <p className="text-[11px] font-bold uppercase text-gray-300 leading-relaxed">
            ESTE PRODUTO REPRESENTA A <span className="text-white font-black">LINHA MÃE / COLEÇÃO</span> PRINCIPAL. COMO DETERMINADO PELAS REGRAS DE NEGÓCIO DA F PAC STORE:
          </p>
          <ul className="list-disc list-inside text-[10px] text-gray-400 mt-2 space-y-1 font-sans">
            <li>NÃO POSSUI ESTOQUE DIRETO DE COMPRA</li>
            <li>NÃO É VENDIDO DIRETAMENTE OU COM CORES/TAMANHOS PRÓPRIOS</li>
            <li>ESTOQUE FÍSICO REAL É EDITADO NAS ESTAMPAS INDIVIDUAIS ABAIXO</li>
          </ul>
        </div>

        <div>
          <h3 className="text-[10px] font-black uppercase tracking-widest text-gray-400 mb-3 block">Estampas da Coleção ({stampsList.length})</h3>
          <div className="space-y-2 max-h-[40vh] overflow-y-auto scrollbar-none pr-1">
            {stampsList.length > 0 ? stampsList.map(stamp => {
              const stampInv = inventory?.[stamp.slug] || {};
              const stampStock = stampInv.stock !== undefined ? Number(stampInv.stock) : 0;
              return (
                <div key={stamp.id} className="p-4 bg-white border border-neutral-200 flex items-center justify-between gap-4">
                  <div className="flex items-center gap-3">
                    <img 
                      src={stamp.images?.[0] || '/estampas/logo-fpac.png'} 
                      alt={stamp.name} 
                      className="w-10 h-12 object-cover border border-black/10 rounded"
                      onError={e => { e.currentTarget.src = '/estampas/logo-fpac.png'; }}
                    />
                    <div>
                      <h4 className="text-xs font-black uppercase text-black">{stamp.name}</h4>
                      <p className="text-[9px] text-gray-400 font-bold uppercase tracking-wider font-mono">REF: {stamp.slug}</p>
                    </div>
                  </div>
                  <div className="text-right flex items-center gap-4">
                    <div className="flex flex-col items-end">
                      <span className="text-[8px] font-black text-gray-400 uppercase tracking-widest">Estoque Real</span>
                      <span className={cn("text-xs font-black italic", stampStock > 0 ? "text-emerald-600" : "text-rose-500")}>
                        {stampStock} un.
                      </span>
                    </div>
                  </div>
                </div>
              );
            }) : (
              <p className="text-xs font-bold text-gray-400 uppercase italic">Nenhuma estampa vinculada à {product.name} ainda.</p>
            )}
          </div>
        </div>
      </div>
    );
  }

  const handleUpdate = async (colorName: string, sizeName: string, value: number) => {
    const key = hasColors ? `${colorName}_${sizeName}` : sizeName;
    const boundedVal = Math.max(0, value);
    try {
      await updateVariantStock(product.slug, key, boundedVal);
      toast.success(`Estoque para ${colorName} - ${sizeName} setado para ${boundedVal}`);
    } catch {
      toast.error("Erro ao persistir estoque no Firestore.");
    }
  };

  const handleApplyBulk = async () => {
    const parsed = parseInt(globalBulkStock);
    if (isNaN(parsed) || parsed < 0) {
      toast.error("Digite um valor numérico válido (maior ou igual a 0).");
      return;
    }
    if (!confirmingBulk) {
      setConfirmingBulk(true);
      toast.error(`Clique novamente no botão para confirmar a alteração em lote para ${parsed} unidades!`, { id: "bulk-confirm" });
      setTimeout(() => setConfirmingBulk(false), 3000);
      return;
    }
    toast.dismiss("bulk-confirm");
    setConfirmingBulk(false);

    try {
      const updates: { [variantKey: string]: number } = {};
      for (const color of colors) {
        for (const size of sizes) {
          const key = hasColors ? `${color.name}_${size}` : size;
          updates[key] = parsed;
        }
      }
      await updateMultipleVariantStocks(product.slug, updates);
      toast.success("Grade atualizada em lote com sucesso!");
    } catch {
      toast.error("Erro ao aplicar em lote.");
    }
  };

  return (
    <div className="space-y-6">
      <div className="text-[10px] font-black uppercase tracking-[0.2em] text-[#eab308] flex items-center gap-1.5">
        <Database size={12} /> GRADE DE ESTOQUE ATALHO
      </div>

      <p className="text-[11px] text-gray-500 font-medium leading-relaxed uppercase">
        Use a planilha interativa para alterar a grade física instantaneamente. Pressione os botões <span className="font-mono text-black">[-1] / [+1]</span> ou clique no número para digitar livremente.
      </p>

      {/* COMPACT INTERACTIVE PLANILHA / TABLE */}
      <div className="border border-black/[0.08] overflow-x-auto bg-white shadow-sm">
        <table className="w-full text-center border-collapse text-[11px]">
          <thead>
            <tr className="bg-neutral-50 border-b border-black/[0.08]">
              <th className="p-3 text-left font-black uppercase tracking-wider text-gray-400 w-1/3 text-[9px]">Sabor / Cor</th>
              {sizes.map(size => (
                <th key={size} className="p-3 font-black uppercase tracking-wider text-black text-[9px]">{size}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-black/[0.04]">
            {colors.map(color => (
              <tr key={color.name} className="hover:bg-neutral-50/50">
                <td className="p-3 text-left font-bold text-gray-700 uppercase flex items-center gap-2">
                  <span className="w-3.5 h-3.5 border border-black/10 inline-block shadow-xs" style={{ backgroundColor: color.hex }} />
                  <span className="truncate">{color.name}</span>
                </td>
                
                {sizes.map(size => {
                  const currentStock = getCellStock(color.name, size);
                  const isCurrentEditing = activeCellEditing === `${color.name}_${size}`;

                  return (
                    <td key={size} className="p-2.5 font-mono">
                      <div className="flex flex-col items-center gap-1.5 justify-center">
                        
                        {/* Interactive dynamic editable input */}
                        {isCurrentEditing ? (
                          <div className="flex items-center gap-1">
                            <input 
                              type="number" 
                              value={cellTempVal === '0' ? '' : cellTempVal}
                              onChange={e => setCellTempVal(e.target.value)}
                              autoFocus
                              className="w-12 text-center p-1 font-bold border border-black outline-none bg-white text-xs h-[26px]"
                              onKeyDown={e => {
                                if (e.key === 'Enter') {
                                  handleUpdate(color.name, size, parseInt(cellTempVal) || 0);
                                  setActiveCellEditing(null);
                                } else if (e.key === 'Escape') {
                                  setActiveCellEditing(null);
                                }
                              }}
                            />
                            <button 
                              onClick={() => {
                                handleUpdate(color.name, size, parseInt(cellTempVal) || 0);
                                setActiveCellEditing(null);
                              }}
                              className="p-1 bg-emerald-500 text-white rounded-xs cursor-pointer"
                            >
                              <Check size={11} />
                            </button>
                          </div>
                        ) : (
                          <span 
                            onClick={() => {
                              setActiveCellEditing(`${color.name}_${size}`);
                              setCellTempVal(String(currentStock));
                            }}
                            className={cn(
                              "text-xs font-black cursor-pointer px-3 py-1 bg-neutral-100 hover:bg-[#eab308] hover:text-black transition-colors rounded-sm border select-none inline-block min-w-[32px] text-center",
                              currentStock === 0 ? "bg-rose-50 border-rose-200 text-rose-500 font-bold" : "border-neutral-200"
                            )}
                            title="Clique para editar manualmente"
                          >
                            {currentStock}
                          </span>
                        )}

                        {/* Increment / Decrement actions button row */}
                        <div className="flex items-center gap-1 shrink-0">
                          <button 
                            onClick={() => handleUpdate(color.name, size, currentStock - 1)}
                            className="w-5 h-5 bg-neutral-50 hover:bg-neutral-200 text-[10px] font-black border border-neutral-200 flex items-center justify-center rounded-xs transition-colors cursor-pointer"
                          >
                            -
                          </button>
                          <button 
                            onClick={() => handleUpdate(color.name, size, currentStock + 1)}
                            className="w-5 h-5 bg-neutral-50 hover:bg-neutral-200 text-[10px] font-black border border-neutral-200 flex items-center justify-center rounded-xs transition-colors cursor-pointer"
                          >
                            +
                          </button>
                        </div>
                      </div>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* METRIC REABASTECIMENTO RÁPIDO / BULK RE-STOCK */}
      <div className="p-4 bg-neutral-50 border border-neutral-200 space-y-3">
        <div className="flex items-center gap-2">
          <RefreshCw size={13} className="text-[#eab308]" />
          <h4 className="text-[10px] font-black uppercase tracking-wider text-black">Reabastecimento Rápido da Grade</h4>
        </div>
        <p className="text-[10px] text-gray-500 uppercase leading-normal">
          Para agilizar reabastecimentos de fábrica ou de lote de entrada, configure todas as variantes correspondentes para o mesmo valor simultaneamente:
        </p>
        <div className="flex gap-2">
          <input 
            type="number"
            min="0"
            placeholder="Ex: 10"
            value={globalBulkStock}
            onChange={e => setGlobalBulkStock(e.target.value)}
            className="bg-white border border-neutral-300 p-2 text-xs font-bold font-mono w-28 focus:border-black outline-none"
          />
          <button
            onClick={handleApplyBulk}
            className={cn(
              "text-[9px] font-black uppercase tracking-widest px-4 py-2 transition-all cursor-pointer",
              confirmingBulk 
                ? "bg-amber-500 hover:bg-amber-600 text-black animate-pulse" 
                : "bg-black hover:bg-[#eab308] text-white hover:text-black"
            )}
          >
            {confirmingBulk ? "Confirmar Aplicar?" : "Aplicar em Toda a Grade"}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ====================================================
SUBCOMPONENTS - MEDIA TAB (URLs & STORAGE FILE UPLOADER)
==================================================== */
function DrawerMediaTab({
  product,
  onUpdate,
  handleFileUpload,
  isUploading
}: {
  product: Product;
  onUpdate: (updatedFields: Partial<Product>) => Promise<void>;
  handleFileUpload: (file: File) => Promise<string>;
  isUploading: boolean;
}) {
  const [images, setImages] = useState<string[]>(product.images || []);
  const [stampGallery, setStampGallery] = useState<string[]>(product.stampGallery || ['', '', '', '']);
  const [newUrlInput, setNewUrlInput] = useState<string>('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setImages(product.images || []);
    setStampGallery(product.stampGallery || ['', '', '', '']);
  }, [product]);

  const persistMedia = async (updatedList: string[], isGalleryChange = false) => {
    if (isGalleryChange) {
      await onUpdate({ stampGallery: updatedList });
    } else {
      await onUpdate({ images: updatedList });
    }
  };

  const handleAddUrl = async () => {
    if (!newUrlInput.trim()) return;
    const directUrl = convertDriveUrlToDirect(newUrlInput.trim());
    const list = [...images, directUrl];
    setImages(list);
    setNewUrlInput('');
    await persistMedia(list);
    toast.success(directUrl !== newUrlInput.trim() ? "Link do Google Drive convertido e inserido!" : "URL inserida!");
  };

  const handleRemoveImage = async (index: number) => {
    const list = images.filter((_, i) => i !== index);
    setImages(list);
    await persistMedia(list);
    toast.success("Mídia removida.");
  };

  const handleSwapToMain = async (index: number) => {
    if (index === 0) return;
    const list = [...images];
    const [target] = list.splice(index, 1);
    list.unshift(target);
    setImages(list);
    await persistMedia(list);
    toast.success("Imagem principal alterada!");
  };

  const handleLocalFileUploader = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    try {
      const file = files[0];
      const url = await handleFileUpload(file);
      const list = [...images, url];
      setImages(list);
      await persistMedia(list);
      toast.success("Arquivo enviado ao Firebase e cadastrado!");
    } catch (err) {
      console.error(err);
    }
  };

  const updateGalleryAtIndex = async (index: number, value: string) => {
    const directUrl = convertDriveUrlToDirect(value);
    const list = [...stampGallery];
    list[index] = directUrl;
    setStampGallery(list);
    await persistMedia(list, true);
    if (directUrl !== value.trim() && value.trim() !== '') {
      toast.success("Link do Google Drive convertido!");
    }
  };

  return (
    <div className="space-y-6">
      <div className="text-[10px] font-black uppercase tracking-[0.2em] text-[#eab308] flex items-center gap-1.5">
        <ImageIcon size={12} /> ARQUIVOS DE IMAGEM & URLs CDN
      </div>

      {/* DRAG-ZONE AND REAL-TIME FILE UPLOADER */}
      <div className="border-2 border-dashed border-neutral-300 p-5 bg-neutral-50 hover:bg-neutral-100 transition-colors text-center relative cursor-pointer" onClick={() => fileInputRef.current?.click()}>
        <input 
          type="file" 
          ref={fileInputRef} 
          onChange={handleLocalFileUploader} 
          accept="image/*" 
          className="hidden" 
        />
        {isUploading ? (
          <div className="flex flex-col items-center gap-2 justify-center py-4">
            <Loader2 className="animate-spin text-[#eab308]" size={24} />
            <p className="text-[10px] font-black uppercase tracking-wider text-black">Redimensionando e Transmitindo arquivo...</p>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-2 justify-center py-3">
            <Upload size={22} className="text-gray-400" />
            <p className="text-[10px] font-black uppercase tracking-wider text-black">Enviar do Computador para o Storage</p>
            <p className="text-[8.5px] text-gray-400 uppercase">Auto-compressão inteligente & Otimização de I/O</p>
          </div>
        )}
      </div>

      <div className="text-[8px] font-black text-gray-400 uppercase tracking-widest text-center">OU INSERIR VIA ENDEREÇO MANUAL</div>

      {/* INSERT URL MANUALLY */}
      <div className="flex gap-2">
        <input 
          type="text" 
          placeholder="https://exemplo.com/imagem-principal.jpg"
          value={newUrlInput}
          onChange={e => setNewUrlInput(e.target.value)}
          className="flex-1 bg-neutral-50 border border-neutral-300 p-2 text-xs focus:bg-white focus:border-black outline-none"
        />
        <button
          onClick={handleAddUrl}
          className="bg-black hover:bg-[#eab308] text-white hover:text-black px-4 py-2 text-[10px] uppercase font-black tracking-wider transition-colors cursor-pointer"
        >
          Inserir Link
        </button>
      </div>

      {/* ACTIVE IMAGES ROSTER CARDS */}
      <div className="space-y-3">
        <div className="text-[9px] font-black uppercase tracking-wider text-black/50">Mídias do Carrossel em Ordem ({images.length})</div>
        <div className="grid grid-cols-2 gap-3">
          {images.map((img, idx) => (
            <div key={idx} className="border border-neutral-200 p-2.5 bg-neutral-50 flex gap-2.5 relative group">
              <div className="w-14 h-16 bg-neutral-200 shrink-0 overflow-hidden relative border border-neutral-300">
                <img 
                  src={img} 
                  referrerPolicy="no-referrer"
                  alt={`Preview ${idx + 1}`} 
                  className="w-full h-full object-cover" 
                  onError={(e) => { (e.target as HTMLImageElement).src = 'https://images.unsplash.com/photo-1521572267360-ee0c2909d518?w=100&q=80' }}
                />
                
                {idx === 0 && (
                  <span className="absolute bottom-0 left-0 w-full text-center text-[7px] font-black tracking-widest bg-[#eab308] text-black uppercase py-0.5">
                    PRINCIPAL
                  </span>
                )}
              </div>
              
              <div className="flex-1 flex flex-col justify-between truncate min-w-0">
                <span className="font-mono text-[8px] font-bold text-gray-400 block truncate" title={img}>{img}</span>
                <div className="flex items-center gap-1.5 mt-2">
                  {idx > 0 && (
                    <button 
                      onClick={() => handleSwapToMain(idx)}
                      className="text-[8px] font-black uppercase bg-white px-2 py-1 text-black border border-neutral-300 hover:border-black hover:bg-black hover:text-[#eab308] cursor-pointer"
                    >
                      Swap Main
                    </button>
                  )}
                  <button 
                    onClick={() => handleRemoveImage(idx)}
                    className="text-[8px] font-black uppercase bg-white px-2 py-1 text-rose-500 border border-rose-200 hover:border-rose-400 hover:bg-rose-50 cursor-pointer"
                  >
                    Excluir
                  </button>
                </div>
              </div>
            </div>
          ))}
          {images.length === 0 && (
            <div className="col-span-2 text-center text-gray-400 p-8 text-xs italic">Nenhuma imagem principal ou carrossel cadastrado.</div>
          )}
        </div>
      </div>

      {/* STAMP COOP GALLERY (REFERENCE PRINTS / ARTWORK DETAILED GALLERY) */}
      <div className="space-y-3 border-t border-neutral-200 pt-5">
        <div className="flex items-center justify-between">
          <div className="text-[9px] font-black uppercase tracking-wider text-black/50">Galeria de Estampas Técnicas (Geminadas)</div>
          <span className="text-[8px] font-black text-[#eab308] uppercase">Até 4 referências</span>
        </div>
        
        <p className="text-[10px] text-gray-400 uppercase font-medium leading-[14px]">
          Links para imagens detalhadas do zoom da arte, ideal para o carrossel avançado de estampas selecionáveis na página do produto.
        </p>

        <div className="space-y-2">
          {stampGallery.map((galleryLink, index) => (
            <div key={index} className="flex gap-2 items-center">
              <span className="font-mono text-[9px] font-black text-gray-400 w-6 text-right">#{index + 1}</span>
              <input 
                type="text"
                placeholder="https://exemplo.com/detalhe-estampa.jpg"
                value={galleryLink || ''}
                onChange={e => updateGalleryAtIndex(index, e.target.value)}
                className="flex-1 bg-neutral-50 border border-neutral-300 p-2 text-xs focus:bg-white outline-none"
              />
              {galleryLink && (
                <div className="w-8 h-8 shrink-0 overflow-hidden border border-neutral-300">
                  <img src={galleryLink} alt="Thumb" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ====================================================
SUBCOMPONENTS - VARIANTS SETUP TAB
==================================================== */
function DrawerVariantsSetupTab({
  product,
  inventory,
  onUpdate,
  toggleVariantAvailability,
  toggleColorAvailability
}: {
  product: Product;
  inventory: any;
  onUpdate: (updatedFields: Partial<Product>) => Promise<void>;
  toggleVariantAvailability: (id: string, variantKey: string, currentStatus: boolean) => Promise<void>;
  toggleColorAvailability: (id: string, colorName: string, currentStatus: boolean) => Promise<void>;
}) {
  const [newColorName, setNewColorName] = useState('');
  const [newColorHex, setNewColorHex] = useState('#000000');
  const [activeSizes, setActiveSizes] = useState<string[]>(product.sizes || ['P', 'M', 'G', 'GG']);
  const [confirmingRemoveColor, setConfirmingRemoveColor] = useState<string | null>(null);

  const isMotherLine = product.slug === 'force' || product.slug === 'mark' || product.slug === 'prime';

  if (isMotherLine) {
    return (
      <div className="space-y-6">
        <div className="text-[10px] font-black uppercase tracking-[0.2em] text-[#eab308] flex items-center gap-1.5">
          <Settings2 size={12} /> GRADE DE CONFIGURAÇÃO - LINHA MÃE
        </div>
        
        <div className="p-5 border-l-4 border-neutral-400 bg-neutral-900 text-white shadow-md rounded-xs">
          <h4 className="text-xs font-black uppercase tracking-wider mb-2 text-neutral-450">CONFIGURAÇÃO RESTRITA</h4>
          <p className="text-[11px] font-bold uppercase text-gray-300 leading-relaxed">
            A LINHA MÃE FUNGE EXCLUSIVAMENTE COMO <span className="text-white font-black">AGRUPADOR DE COLEÇÃO</span>. TODA E QUALQUER VARIAÇÃO DE CORES FÍSICAS E TAMANHOS DEVE SER INTEGRADA DIRETAMENTE NA GRADE DE SUAS ESTAMPAS FILHAS.
          </p>
        </div>
      </div>
    );
  }

  const handleAddColor = async () => {
    if (!newColorName.trim()) {
      toast.error("Preencha o nome da cor!");
      return;
    }
    const currentColors = product.colors || [];
    if (currentColors.some(c => c.name.toLowerCase() === newColorName.trim().toLowerCase())) {
      toast.error("Esta cor já existe nesta grade!");
      return;
    }

    const updatedColors = [...currentColors, { name: newColorName.trim(), hex: newColorHex }];
    await onUpdate({ colors: updatedColors });
    setNewColorName('');
    toast.success("Cor adicionada à grade!");
  };

  const handleRemoveColor = async (colorName: string) => {
    if (confirmingRemoveColor !== colorName) {
      setConfirmingRemoveColor(colorName);
      toast.error(`Clique de novo na lixeira para excluir a cor "${colorName}"`, { id: `del-color-${colorName}`, duration: 3000 });
      setTimeout(() => {
        setConfirmingRemoveColor(prev => prev === colorName ? null : prev);
      }, 3000);
      return;
    }
    toast.dismiss(`del-color-${colorName}`);
    setConfirmingRemoveColor(null);
    const updatedColors = (product.colors || []).filter(c => c.name !== colorName);
    await onUpdate({ colors: updatedColors });
    toast.success("Cor removida.");
  };

  const handleToggleSize = async (sizeToToggle: string) => {
    let updatedSizes;
    if (activeSizes.includes(sizeToToggle)) {
      if (activeSizes.length <= 1) {
        toast.error("Mantenha ao menos 1 tamanho ativo na grade.");
        return;
      }
      updatedSizes = activeSizes.filter(s => s !== sizeToToggle);
    } else {
      updatedSizes = [...activeSizes, sizeToToggle];
    }
    setActiveSizes(updatedSizes);
    await onUpdate({ sizes: updatedSizes });
  };

  const hasColors = product.colors && product.colors.length > 0;
  const variants = inventory?.variants || {};

  return (
    <div className="space-y-6">
      <div className="text-[10px] font-black uppercase tracking-[0.2em] text-[#eab308] flex items-center gap-1.5">
        <Settings2 size={12} /> CONFIGURADOR DE GRAVIDADE / VARIANTES
      </div>

      {/* SIZES MANAGEMENT */}
      <div className="space-y-2 border-b border-neutral-200 pb-5">
        <div className="text-[10px] font-black uppercase text-black">Tamanhos Ativos do Gradeamento</div>
        <p className="text-[10px] text-gray-400 uppercase leading-normal">
          Selecione quais tamanhos este produto possui. Desmarcar descarta a visualização do tamanho na vitrine.
        </p>
        <div className="flex gap-2 flex-wrap">
          {['PP', 'P', 'M', 'G', 'GG', 'XG', 'EG', 'U'].map((size) => {
            const isActive = activeSizes.includes(size);
            return (
              <button
                key={size}
                onClick={() => handleToggleSize(size)}
                className={cn(
                  "w-12 h-10 text-xs font-black uppercase tracking-widest border transition-all cursor-pointer",
                  isActive 
                    ? "bg-black text-[#eab308] border-black" 
                    : "bg-white text-gray-400 border-neutral-200 hover:border-black"
                )}
              >
                {size}
              </button>
            );
          })}
        </div>
      </div>

      {/* COLORS SELECTION */}
      <div className="space-y-4">
        <div className="text-[10px] font-black uppercase text-black">Cores Cadastradas</div>
        
        {/* Adicionar nova cor */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 bg-neutral-50 p-3.5 border border-neutral-200">
          <div className="space-y-1">
            <label className="text-[8px] font-black uppercase text-gray-400">Nome da Cor</label>
            <input 
              type="text" 
              placeholder="Ex: Verde Militar"
              value={newColorName}
              onChange={e => setNewColorName(e.target.value)}
              className="w-full bg-white border border-neutral-300 p-2 text-xs font-semibold outline-none focus:border-black h-[32px] uppercase"
            />
          </div>
          <div className="space-y-1">
            <label className="text-[8px] font-black uppercase text-gray-400">Cor Hexadecimal</label>
            <div className="flex gap-1.5 items-center">
              <input 
                type="color" 
                value={newColorHex}
                onChange={e => setNewColorHex(e.target.value)}
                className="w-8 h-[32px] cursor-pointer p-0 bg-transparent border-0"
              />
              <input 
                type="text" 
                value={newColorHex}
                onChange={e => setNewColorHex(e.target.value)}
                className="flex-1 bg-white border border-neutral-300 p-2 text-xs font-mono font-bold uppercase h-[32px]"
              />
            </div>
          </div>
          <div className="flex items-end">
            <button
              onClick={handleAddColor}
              className="w-full bg-black hover:bg-[#eab308] text-white hover:text-black text-[9px] font-black uppercase tracking-wider h-[32px] transition-colors cursor-pointer"
            >
              Adicionar Cor
            </button>
          </div>
        </div>

        {/* Sugestões rápidas de cores presetadas */}
        <div className="bg-neutral-50/50 p-3 border border-dashed border-neutral-200">
          <label className="text-[8px] font-black uppercase text-gray-400 block mb-2">Sugestões Rápidas (Toque para adicionar à grade)</label>
          <div className="flex flex-wrap gap-2">
            {PRESET_COLORS.map(color => {
              const isAlreadyInProduct = (product.colors || []).some(c => c.name.toLowerCase() === color.name.toLowerCase());
              return (
                <button
                  key={color.name}
                  type="button"
                  onClick={async () => {
                    if (isAlreadyInProduct) {
                      toast.error(`A cor "${color.name}" já está na grade!`);
                      return;
                    }
                    const updatedColors = [...(product.colors || []), color];
                    await onUpdate({ colors: updatedColors });
                    toast.success(`Cor "${color.name}" adicionada ao produto!`);
                  }}
                  disabled={isAlreadyInProduct}
                  className={cn(
                    "flex items-center gap-1.5 px-2.5 py-1.5 border text-[9px] font-black uppercase tracking-wider transition-all rounded-xs cursor-pointer",
                    isAlreadyInProduct 
                      ? "opacity-40 bg-neutral-100 text-gray-400 border-neutral-200 cursor-not-allowed" 
                      : "bg-white hover:bg-black hover:text-white border-neutral-300 shadow-xs"
                  )}
                >
                  <span className="w-2.5 h-2.5 rounded-full border border-black/10 shrink-0" style={{ backgroundColor: color.hex }} />
                  <span>{color.name}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Cores atuais */}
        <div className="space-y-2">
          {product.colors && product.colors.length > 0 ? (
            product.colors.map(color => {
              // Check overall availability status
              // If there's at least one variant active for this color name
              const relatedVariants = Object.entries(variants).filter(([k]) => k.startsWith(`${color.name}_`));
              const isColorGloballyActive = relatedVariants.length > 0 
                ? relatedVariants.some(([_, v]: [any, any]) => v.available !== false)
                : true;

              return (
                <div key={color.name} className="flex items-center justify-between p-2.5 bg-neutral-50 border border-neutral-200">
                  <div className="flex items-center gap-3">
                    <span className="w-4 h-4 rounded-full border border-black/10 shadow-xs" style={{ backgroundColor: color.hex }} />
                    <span className="text-xs font-black uppercase">{color.name}</span>
                    <span className="text-gray-300 text-[10px] font-mono">({color.hex})</span>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => toggleColorAvailability(product.slug, color.name, isColorGloballyActive)}
                      className={cn(
                        "text-[8px] font-black uppercase px-2 py-1 border transition-colors cursor-pointer",
                        isColorGloballyActive ? "border-emerald-500 text-emerald-600 bg-emerald-50" : "border-rose-300 text-rose-500 bg-rose-50"
                      )}
                    >
                      {isColorGloballyActive ? "Ativada na Loja" : "Desativada"}
                    </button>
                    <button 
                      onClick={() => handleRemoveColor(color.name)}
                      className={cn(
                        "p-1 cursor-pointer transition-all duration-200 uppercase font-black text-[9px] flex items-center justify-center",
                        confirmingRemoveColor === color.name 
                          ? "text-rose-600 bg-rose-50 border border-rose-200 px-2 animate-pulse" 
                          : "text-gray-400 hover:text-rose-600"
                      )}
                    >
                      {confirmingRemoveColor === color.name ? "CONFIRMA?" : <Trash2 size={13} />}
                    </button>
                  </div>
                </div>
              );
            })
          ) : (
            <div className="text-center p-4 text-gray-400 italic text-xs">Coleção simples (Sem variação de cores habilitada).</div>
          )}
        </div>
      </div>
    </div>
  );
}

/* ====================================================
KPI / STAT CARD ( Shopify Styled Dashboard Card )
==================================================== */
function StatCard({ label, value, icon, color }: { label: string; value: number | string; icon: React.ReactNode; color: string }) {
  return (
    <div className="bg-white border border-black/[0.06] p-4 font-mono w-44 shrink-0 shadow-xs">
      <div className="flex items-center justify-between mb-2">
        <span className="text-[7.5px] font-sans font-black tracking-widest text-neutral-400 uppercase">{label}</span>
        {icon}
      </div>
      <div className={cn("text-2xl font-black italic tracking-tighter", color)}>
        {value}
      </div>
    </div>
  );
}

/* ====================================================
LIST OF SUB-KEY METRICS ITEMS
==================================================== */
function MetricsSummaryList({ label, items }: { label: string; items: Record<string, number> }) {
  return (
    <div className="bg-white border border-black/[0.06] p-4 font-mono shadow-xs text-[11px]">
      <div className="text-[7.5px] font-sans font-black tracking-widest text-[#eab308] uppercase border-b border-neutral-100 pb-2 mb-2">
        {label}
      </div>
      <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
        {Object.entries(items).map(([key, val]) => (
          <div key={key} className="flex items-center justify-between">
            <span className="text-gray-500 uppercase truncate pr-2 max-w-[130px] font-bold">{key}</span>
            <span className="font-black text-black">{val} un</span>
          </div>
        ))}
        {Object.keys(items).length === 0 && (
          <div className="text-[10px] text-gray-400 italic py-2">Sem distribuição registrada.</div>
        )}
      </div>
    </div>
  );
}
