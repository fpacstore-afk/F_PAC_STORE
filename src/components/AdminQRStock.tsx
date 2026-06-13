import React, { useState, useEffect, useRef, useMemo } from 'react';
import { db, auth, handleFirestoreError, OperationType } from '../lib/firebase';
import { collection, onSnapshot, doc, setDoc, query, orderBy, getDoc, getDocs, limit, where } from 'firebase/firestore';
import { products as staticProducts } from '../data/products';
import { useInventory } from '../hooks/useInventory';
import { useAuth } from '../context/AuthContext';
import { Html5Qrcode } from 'html5-qrcode';
import QRCode from 'qrcode';
import toast from 'react-hot-toast';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  QrCode, 
  TrendingUp, 
  Plus, 
  Minus, 
  History, 
  AlertTriangle, 
  Play, 
  Square, 
  CheckCircle, 
  RotateCw, 
  User, 
  Search, 
  Filter, 
  Download, 
  Printer, 
  Tag, 
  LayoutDashboard,
  Smartphone,
  Eye,
  Settings
} from 'lucide-react';

interface StockMovement {
  id: string;
  productId: string;
  productSlug: string;
  productName: string;
  variantKey: string;
  quantity: number;
  type: 'Produção' | 'Venda Local' | 'Ajuste';
  operator: string;
  createdAt: any; // Firestore Timestamp
}

export function AdminQRStock() {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState<'dashboard' | 'scan' | 'generator' | 'history'>('dashboard');
  const { inventory, loading: invLoading } = useInventory();
  
  // Real-time collections
  const [products, setProducts] = useState<any[]>([]);
  const [movements, setMovements] = useState<StockMovement[]>([]);
  const [loadingProducts, setLoadingProducts] = useState(true);
  const [loadingMovements, setLoadingMovements] = useState(true);

  // Scanner state
  const [scanMode, setScanMode] = useState<'entrada' | 'saida'>('entrada');
  const [isScanning, setIsScanning] = useState(false);
  const [cameraPermission, setCameraPermission] = useState<boolean | null>(null);
  const [scannerFeedback, setScannerFeedback] = useState<{
    status: 'success' | 'error' | null;
    message: string;
    productName?: string;
    variantName?: string;
    newStock?: number;
  }>({ status: null, message: '' });
  const [lastScannedCode, setLastScannedCode] = useState<string>('');
  const [scanCooldown, setScanCooldown] = useState(false);

  // Generator state
  const [searchGen, setSearchGen] = useState('');
  const [filterSlug, setFilterSlug] = useState('all');
  const [expandedProduct, setExpandedProduct] = useState<string | null>(null);
  const [generatedQRs, setGeneratedQRs] = useState<Record<string, string>>({});

  // History Filter state
  const [historyTypeFilter, setHistoryTypeFilter] = useState<'all' | 'Produção' | 'Venda Local' | 'Ajuste'>('all');
  const [historySearch, setHistorySearch] = useState('');

  const scannerRef = useRef<Html5Qrcode | null>(null);
  const SCANNER_DIV_ID = "qr-reader-element";

  // Web Audio Synthesizer Beep for physical scanning feedback
  const playBeep = (type: 'success' | 'error') => {
    try {
      const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      
      if (type === 'success') {
        osc.frequency.setValueAtTime(800, ctx.currentTime);
        gain.gain.setValueAtTime(0.08, ctx.currentTime);
        osc.start();
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.12);
        osc.stop(ctx.currentTime + 0.12);
      } else {
        osc.frequency.setValueAtTime(200, ctx.currentTime);
        gain.gain.setValueAtTime(0.12, ctx.currentTime);
        osc.start();
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.25);
        osc.stop(ctx.currentTime + 0.25);
      }
    } catch (e) {
      console.error("Erro no feedback sonoro:", e);
    }
  };

  // Fetch real-time products collection & align with Static Products
  useEffect(() => {
    setLoadingProducts(true);
    const unsubscribe = onSnapshot(collection(db, 'products'), (snapshot) => {
      const dynamicData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      const merged = staticProducts.map(staticP => {
        const dynamicP = dynamicData.find((p: any) => p.id === staticP.id || p.slug === staticP.slug);
        return dynamicP ? { ...staticP, ...dynamicP } : staticP;
      });
      dynamicData.forEach((dynamicP: any) => {
        if (!staticProducts.some(sp => sp.id === dynamicP.id || sp.slug === dynamicP.slug)) {
          merged.push(dynamicP);
        }
      });
      setProducts(merged);
      setLoadingProducts(false);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'products');
      setLoadingProducts(false);
    });
    return () => unsubscribe();
  }, []);

  // Fetch real-time stock movements
  useEffect(() => {
    if (!user) {
      setLoadingMovements(false);
      return;
    }
    setLoadingMovements(true);
    const q = query(collection(db, 'stock_movements'), orderBy('createdAt', 'desc'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const docs = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as StockMovement[];
      setMovements(docs);
      setLoadingMovements(false);
    }, (error) => {
      console.error("Erro ao ler logs de movimentações:", error);
      setLoadingMovements(false);
    });
    return () => unsubscribe();
  }, [user]);

  // Start / Stop Scanner on Tab Action
  useEffect(() => {
    if (activeTab !== 'scan' || !isScanning) {
      cleanupScanner();
    }
    return () => cleanupScanner();
  }, [activeTab, isScanning]);

  const cleanupScanner = async () => {
    if (scannerRef.current) {
      try {
        if (scannerRef.current.isScanning) {
          await scannerRef.current.stop();
        }
      } catch (e) {
        console.error("Erro ao desligar câmera:", e);
      }
      scannerRef.current = null;
    }
  };

  const startScanner = async () => {
    setScannerFeedback({ status: null, message: '' });
    setLastScannedCode('');
    
    // Create element layout hook
    setTimeout(async () => {
      try {
        const html5QrCode = new Html5Qrcode(SCANNER_DIV_ID);
        scannerRef.current = html5QrCode;

        await html5QrCode.start(
          { facingMode: "environment" },
          {
            fps: 12,
            qrbox: (width, height) => {
              const size = Math.min(width, height) * 0.65;
              return { width: size, height: size };
            },
            aspectRatio: 1
          },
          (decodedText) => {
            handleDecodedCode(decodedText);
          },
          (errorMessage) => {
            // Silence error logs for fast search scans
          }
        );
        setIsScanning(true);
        setCameraPermission(true);
      } catch (err: any) {
        console.error("Falha ao abrir câmera:", err);
        setCameraPermission(false);
        setIsScanning(false);
        toast.error("Permissão de câmera negada ou dispositivo sem suporte.");
      }
    }, 150);
  };

  // Cooldown timer helper
  useEffect(() => {
    if (scanCooldown) {
      const timer = setTimeout(() => {
        setScanCooldown(false);
        setLastScannedCode('');
      }, 2000); // 2 seconds safety delay
      return () => clearTimeout(timer);
    }
  }, [scanCooldown]);

  // CORE LOGIC: Parse and commit scanned items
  const handleDecodedCode = async (decodedText: string) => {
    if (scanCooldown) return;
    if (decodedText === lastScannedCode) return;

    setLastScannedCode(decodedText);
    setScanCooldown(true);

    if (!decodedText.startsWith('fpac_qr:')) {
      playBeep('error');
      setScannerFeedback({
        status: 'error',
        message: 'Código inválido! Utilize os QR Codes gerados pelo sistema.'
      });
      return;
    }

    try {
      const content = decodedText.substring(8); // remove prefix
      const [slug, variantKey] = content.split('|');

      if (!slug || !variantKey) {
        playBeep('error');
        setScannerFeedback({
          status: 'error',
          message: 'Estrutura de QR Code corrompida.'
        });
        return;
      }

      // Find the associated product catalog item
      const product = products.find(p => p.slug === slug || p.id === slug);
      if (!product) {
        playBeep('error');
        setScannerFeedback({
          status: 'error',
          message: `Produto com identificador "${slug}" não cadastrado.`
        });
        return;
      }

      // Process Firestore database transaction update
      const changeAmount = scanMode === 'entrada' ? 1 : -1;
      const docRef = doc(db, 'inventory', product.slug);
      const docSnap = await getDoc(docRef);

      let currentVariants: any = {};
      let currentAvailable = true;
      let currentStock = 0;

      if (docSnap.exists()) {
        const data = docSnap.data();
        currentVariants = data.variants || {};
        currentAvailable = data.available ?? true;
        currentStock = data.stock ?? 0;
      }

      // Check current stock of this variation
      const currentVariantData = currentVariants[variantKey] || { stock: 0, available: true };
      const previousVariantStock = Number(currentVariantData.stock) || 0;
      const newVariantStock = previousVariantStock + changeAmount;

      // Rule 11: Error handling to prevent negative stock
      if (changeAmount < 0 && previousVariantStock < 1) {
        playBeep('error');
        setScannerFeedback({
          status: 'error',
          message: `Estoque esgotado! Não é possível retirar unidades desta variação.`,
          productName: product.name,
          variantName: variantKey,
          newStock: 0
        });
        return;
      }

      const tempVariants = {
        ...currentVariants,
        [variantKey]: {
          ...currentVariantData,
          stock: Math.max(0, newVariantStock),
          available: Math.max(0, newVariantStock) > 0
        }
      };

      const totalStock = Object.values(tempVariants).reduce((sum: number, v: any) => {
        if (v.available === false) return sum;
        return sum + (Number(v.stock) || 0);
      }, 0) as number;

      // Update Firestore inventory document
      await setDoc(docRef, {
        stock: totalStock,
        available: totalStock > 0 || currentAvailable,
        variants: tempVariants,
        updatedAt: new Date()
      }, { merge: true });

      // Create log history entry in /stock_movements
      const logRef = doc(collection(db, 'stock_movements'));
      await setDoc(logRef, {
        productId: product.id || '',
        productSlug: product.slug,
        productName: product.name,
        variantKey: variantKey,
        quantity: changeAmount,
        type: changeAmount > 0 ? 'Produção' : 'Venda Local',
        operator: auth.currentUser?.email || 'Administrador',
        createdAt: new Date()
      });

      // UI Success feedback
      playBeep('success');
      setScannerFeedback({
        status: 'success',
        message: changeAmount > 0 
          ? `Adicionado +1 unidade na produção!` 
          : `Retirado -1 unidade por Venda Local!`,
        productName: product.name,
        variantName: variantKey.replace('_', ' / '),
        newStock: Math.max(0, newVariantStock)
      });

    } catch (err: any) {
      console.error("Erro durante lançamento do estoque:", err);
      playBeep('error');
      setScannerFeedback({
        status: 'error',
        message: `Falha ao sincronizar: ${err.message || 'Erro de conexão'}`
      });
    }
  };

  // Pre-generate dataURL for display
  const loadQR = async (slug: string, variantKey: string) => {
    const key = `${slug}:${variantKey}`;
    if (generatedQRs[key]) return;

    try {
      const codeStr = `fpac_qr:${slug}|${variantKey}`;
      const url = await QRCode.toDataURL(codeStr, {
        width: 250,
        margin: 2,
        color: {
          dark: '#000000',
          light: '#ffffff'
        }
      });
      setGeneratedQRs(prev => ({ ...prev, [key]: url }));
    } catch (e) {
      console.error("Falha ao renderizar QR:", e);
    }
  };

  // Toggle variant accordion card
  const toggleProductAccordion = (slug: string) => {
    if (expandedProduct === slug) {
      setExpandedProduct(null);
    } else {
      setExpandedProduct(slug);
      // Automatically pre-load QR representations for its permutations
      const product = products.find(p => p.slug === slug);
      if (product) {
        product.colors?.forEach((c: any) => {
          product.sizes?.forEach((s: string) => {
            loadQR(slug, `${c.name}_${s}`);
          });
        });
      }
    }
  };

  // Trigger individual print of a barcode layout tag
  const printSingleQR = (product: any, colorName: string, size: string, qrUrl: string) => {
    const printWindow = window.open('', '_blank', 'width=380,height=420');
    if (!printWindow) {
      toast.error("O bloqueador de popups impediu a abertura da tela de impressão!");
      return;
    }

    const priceFormatted = Number(product.price).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

    printWindow.document.write(`
      <html>
        <head>
          <title>${product.name} - ${colorName} / ${size}</title>
          <style>
            @import url('https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@600;800&family=Inter:wght@400;700&display=swap');
            body {
              font-family: 'Inter', sans-serif;
              text-align: center;
              margin: 0;
              padding: 20px;
              color: #000;
              background: #fff;
            }
            .brand {
              font-family: 'Space Grotesk', sans-serif;
              font-size: 14px;
              font-weight: 800;
              text-transform: uppercase;
              letter-spacing: 2px;
              margin-bottom: 5px;
            }
            .product-name {
              font-size: 18px;
              font-weight: 700;
              text-transform: uppercase;
              margin: 4px 0;
            }
            .variation {
              display: inline-block;
              background: #000;
              color: #fff;
              font-size: 11px;
              font-weight: 700;
              text-transform: uppercase;
              padding: 4px 10px;
              border-radius: 2px;
              margin: 5px 0 15px 0;
            }
            .qr-container {
              margin: 10px auto;
            }
            .qr-image {
              width: 180px;
              height: 180px;
            }
            .price {
              font-family: 'Space Grotesk', sans-serif;
              font-size: 16px;
              font-weight: 700;
              margin-top: 10px;
            }
            .footer-info {
              font-size: 8px;
              text-transform: uppercase;
              color: #666;
              margin-top: 15px;
              letter-spacing: 0.5px;
            }
            @media print {
              body { padding: 0; }
              @page { size: auto; margin: 0; }
            }
          </style>
        </head>
        <body>
          <div class="brand">F PAC STORE</div>
          <div class="product-name">${product.name}</div>
          <div class="variation">${colorName} &middot; TAMANHO ${size}</div>
          <div class="qr-container">
            <img class="qr-image" src="${qrUrl}" />
          </div>
          <div class="price">${priceFormatted}</div>
          <div class="footer-info">fpacstore.com.br &middot; controle qr</div>
          <script>
            window.onload = function() {
              window.print();
              setTimeout(function() { window.close(); }, 800);
            }
          </script>
        </body>
      </html>
    `);
    printWindow.document.close();
  };

  // PRINT ALL / BATCH QR CODES FOR A PRODUCT
  const printBatchProductQRs = (product: any) => {
    const printWindow = window.open('', '_blank', 'width=800,height=600');
    if (!printWindow) {
      toast.error("O bloqueador de popups impediu a abertura da tela de impressão!");
      return;
    }

    const permutations: any[] = [];
    product.colors?.forEach((c: any) => {
      product.sizes?.forEach((s: string) => {
        const key = `${product.slug}:${c.name}_${s}`;
        const qrUrl = generatedQRs[key];
        if (qrUrl) {
          permutations.push({ color: c.name, size: s, qrUrl });
        }
      });
    });

    if (permutations.length === 0) {
      toast.error("Gere os QR Codes das variações clicando para expandir o produto primeiro.");
      printWindow.close();
      return;
    }

    const priceFormatted = Number(product.price).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

    printWindow.document.write(`
      <html>
        <head>
          <title>Lote de Etiquetas - ${product.name}</title>
          <style>
            @import url('https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@600;800&family=Inter:wght@400;700&display=swap');
            body {
              font-family: 'Inter', sans-serif;
              margin: 0;
              padding: 0;
              background: #fff;
            }
            .page-break {
              page-break-after: always;
              text-align: center;
              box-sizing: border-box;
              height: 100vh;
              display: flex;
              flex-direction: column;
              justify-content: center;
              align-items: center;
              padding: 40px;
            }
            .page-break:last-child {
              page-break-after: avoid;
            }
            .brand {
              font-family: 'Space Grotesk', sans-serif;
              font-size: 16px;
              font-weight: 800;
              text-transform: uppercase;
              letter-spacing: 3px;
              margin-bottom: 8px;
            }
            .product-name {
              font-size: 22px;
              font-weight: 700;
              text-transform: uppercase;
              margin: 4px 0;
            }
            .variation {
              display: inline-block;
              background: #000;
              color: #fff;
              font-size: 12px;
              font-weight: 700;
              text-transform: uppercase;
              padding: 5px 14px;
              border-radius: 2px;
              margin: 10px 0 25px 0;
              letter-spacing: 1px;
            }
            .qr-image {
              width: 220px;
              height: 220px;
            }
            .price {
              font-family: 'Space Grotesk', sans-serif;
              font-size: 18px;
              font-weight: 700;
              margin-top: 15px;
            }
            .footer-info {
              font-size: 9px;
              text-transform: uppercase;
              color: #666;
              margin-top: 20px;
              letter-spacing: 1px;
            }
          </style>
        </head>
        <body>
          ${permutations.map((item, index) => `
            <div class="page-break">
              <div class="brand">F PAC STORE</div>
              <div class="product-name">${product.name}</div>
              <div class="variation">${item.color} &middot; TAMANHO ${item.size}</div>
              <div class="qr-container">
                <img class="qr-image" src="${item.qrUrl}" />
              </div>
              <div class="price">${priceFormatted}</div>
              <div class="footer-info">etiqueta de variação &middot; lote: #${index+1}</div>
            </div>
          `).join('')}
          <script>
            window.onload = function() {
              window.print();
              setTimeout(function() { window.close(); }, 1000);
            }
          </script>
        </body>
      </html>
    `);
    printWindow.document.close();
  };

  // DASHBOARD MATH CALCULATIONS
  const stats = useMemo(() => {
    // 1. Current stock calculation
    let totalStock = 0;
    let productsBelowThresh = 0;

    products.forEach(p => {
      const inv = inventory[p.slug];
      if (inv) {
        if (inv.variants && Object.keys(inv.variants).length > 0) {
          Object.entries(inv.variants).forEach(([vKey, vData]: [string, any]) => {
            const stockVal = Number(vData.stock) || 0;
            totalStock += stockVal;
            if (stockVal < 4 && vData.available !== false) {
              productsBelowThresh++;
            }
          });
        } else {
          const stockVal = Number(inv.stock) || 0;
          totalStock += stockVal;
          if (stockVal < 4 && inv.available !== false) {
            productsBelowThresh++;
          }
        }
      } else {
        // Fallback to static stock calculations
        totalStock += 0;
      }
    });

    // 2. Produced today & Sold today from stock_movements
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    let producedToday = 0;
    let soldToday = 0;

    movements.forEach(m => {
      if (m.createdAt) {
        const mDate = m.createdAt.toDate();
        if (mDate >= today) {
          if (m.type === 'Produção') {
            producedToday += Number(m.quantity) || 0;
          } else if (m.type === 'Venda Local') {
            // Note: sales quantity is saved as negative -1, so let's take absolute value
            soldToday += Math.abs(Number(m.quantity)) || 0;
          }
        }
      }
    });

    return { 
      totalStock, 
      producedToday, 
      soldToday, 
      productsBelowThresh 
    };
  }, [products, inventory, movements]);

  // FILTERED GENERATOR PRODUCTS GRID
  const filteredProductsGen = useMemo(() => {
    return products.filter(p => {
      const matchesSearch = p.name?.toLowerCase().includes(searchGen.toLowerCase()) || p.slug?.toLowerCase().includes(searchGen.toLowerCase());
      const matchesSlug = filterSlug === 'all' || p.slug === filterSlug;
      return matchesSearch && matchesSlug;
    });
  }, [products, searchGen, filterSlug]);

  // FILTERED MOVEMENT HISTORIC
  const filteredMovements = useMemo(() => {
    return movements.filter(m => {
      const matchesType = historyTypeFilter === 'all' || m.type === historyTypeFilter;
      const matchesSearch = historySearch === '' || 
        m.productName?.toLowerCase().includes(historySearch.toLowerCase()) ||
        m.productSlug?.toLowerCase().includes(historySearch.toLowerCase()) ||
        m.variantKey?.toLowerCase().includes(historySearch.toLowerCase()) ||
        m.operator?.toLowerCase().includes(historySearch.toLowerCase());
      return matchesType && matchesSearch;
    });
  }, [movements, historyTypeFilter, historySearch]);

  return (
    <div className="w-full bg-white p-4 md:p-8 rounded-sm">
      {/* Title & Introduction Block */}
      <div className="border-b border-gray-100 pb-6 mb-8 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <div className="flex items-center gap-3">
            <QrCode className="text-[#eab308] w-6 h-6 md:w-8 md:h-8 animate-pulse" />
            <h2 className="text-xl md:text-2xl font-black uppercase tracking-wider text-black">Controle de Estoque por QR Code</h2>
          </div>
          <p className="text-xs text-gray-500 mt-1">Sincronização em tempo real do estoque físico da fábrica com o e-commerce público.</p>
        </div>
        
        {/* Navigation Tabs bar inside the Stock control component */}
        <div className="flex bg-gray-50 p-1 rounded-sm border border-gray-100 w-full md:w-auto">
          <button 
            onClick={() => setActiveTab('dashboard')} 
            className={`flex-1 md:flex-none flex items-center justify-center gap-2 px-4 py-2.5 text-[10px] uppercase font-black tracking-widest transition-all ${activeTab === 'dashboard' ? 'bg-black text-white shadow-sm' : 'text-gray-500 hover:text-black'}`}
          >
            <LayoutDashboard className="w-3.5 h-3.5" />
            Painel Geral
          </button>
          <button 
            onClick={() => setActiveTab('scan')} 
            className={`flex-1 md:flex-none flex items-center justify-center gap-2 px-4 py-2.5 text-[10px] uppercase font-black tracking-widest transition-all ${activeTab === 'scan' ? 'bg-black text-[#eab308] shadow-sm' : 'text-gray-500 hover:text-black'}`}
          >
            <Smartphone className="w-3.5 h-3.5" />
            Bipar QR Code
          </button>
          <button 
            onClick={() => setActiveTab('generator')} 
            className={`flex-1 md:flex-none flex items-center justify-center gap-2 px-4 py-2.5 text-[10px] uppercase font-black tracking-widest transition-all ${activeTab === 'generator' ? 'bg-black text-white shadow-sm' : 'text-gray-500 hover:text-black'}`}
          >
            <QrCode className="w-3.5 h-3.5" />
            Gerar QRs
          </button>
          <button 
            onClick={() => setActiveTab('history')} 
            className={`flex-1 md:flex-none flex items-center justify-center gap-2 px-4 py-2.5 text-[10px] uppercase font-black tracking-widest transition-all ${activeTab === 'history' ? 'bg-black text-white shadow-sm' : 'text-gray-500 hover:text-black'}`}
          >
            <History className="w-3.5 h-3.5" />
            Logs
          </button>
        </div>
      </div>

      {/* RENDER DYNAMIC ACTIVE TAB */}
      
      {/* 1. DASHBOARD VIEW */}
      {activeTab === 'dashboard' && (
        <div className="space-y-8 animate-in fade-in duration-350">
          
          {/* Quick Metrics Cards */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-gray-50 p-6 border border-gray-100 flex flex-col justify-between">
              <span className="text-[9px] font-black uppercase tracking-widest text-black/50">Estoque Geral F PAC</span>
              <span className="text-3xl font-black text-black mt-3 block">
                {invLoading ? <RotateCw className="w-6 h-6 animate-spin text-gray-300" /> : stats.totalStock}
              </span>
              <div className="h-1 bg-black/10 mt-4 rounded-full overflow-hidden">
                <div className="h-full bg-black rounded-full" style={{ width: '70%' }} />
              </div>
            </div>

            <div className="bg-amber-50/50 p-6 border border-amber-100 flex flex-col justify-between">
              <span className="text-[9px] font-black uppercase tracking-widest text-amber-800/70">Produzidos Hoje</span>
              <span className="text-3xl font-black text-amber-600 mt-3 block">
                +{stats.producedToday}
              </span>
              <span className="text-[9px] font-bold text-amber-900/65 mt-4 block uppercase tracking-wide">
                Entradas de fabricação
              </span>
            </div>

            <div className="bg-blue-50/60 p-6 border border-blue-100 flex flex-col justify-between">
              <span className="text-[9px] font-black uppercase tracking-widest text-blue-800/70">Vendidos Hoje (Local)</span>
              <span className="text-3xl font-black text-blue-600 mt-3 block">
                {stats.soldToday}
              </span>
              <span className="text-[9px] font-bold text-blue-900/65 mt-4 block uppercase tracking-wide">
                Saídas imediatas
              </span>
            </div>

            <div className={`p-6 border flex flex-col justify-between transition-colors ${stats.productsBelowThresh > 0 ? 'bg-rose-50/70 border-rose-150' : 'bg-gray-50 border-gray-100'}`}>
              <span className="text-[9px] font-black uppercase tracking-widest text-gray-500">Alertas Estoque Crítico</span>
              <span className={`text-3xl font-black mt-3 block ${stats.productsBelowThresh > 0 ? 'text-rose-600' : 'text-gray-400'}`}>
                {stats.productsBelowThresh}
              </span>
              <span className={`text-[9px] font-bold mt-4 block uppercase tracking-wide ${stats.productsBelowThresh > 0 ? 'text-rose-800/60' : 'text-gray-400'}`}>
                {stats.productsBelowThresh > 0 ? 'Necessita de Produção' : 'Estoque Saudável (< 4 un)'}
              </span>
            </div>
          </div>

          {/* Quick Production Flow instructions banner */}
          <div className="bg-black text-white p-5 md:p-6 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
            <div className="space-y-1">
              <h3 className="text-sm font-black uppercase tracking-widest text-[#eab308]">Acelere sua Fabricação Interna</h3>
              <p className="text-xs text-gray-400 max-w-xl">Imprima etiquetas de QR code, grude nas camisas produzidas. O operador só precisa abrir a câmera no celular, bipar e o estoque sincroniza na hora.</p>
            </div>
            <button 
              onClick={() => setActiveTab('scan')} 
              className="bg-[#eab308] hover:bg-white text-black text-xs font-black uppercase tracking-widest py-3 px-6 transition-all shrink-0 cursor-pointer border-0"
            >
              Iniciar Leitura de Câmera
            </button>
          </div>

          {/* Critical low variants & Recent movements splits */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
            
            {/* Low stock alerts */}
            <div className="lg:col-span-5 space-y-4">
              <div className="flex items-center justify-between">
                <h4 className="text-xs font-black uppercase tracking-widest text-black/60 flex items-center gap-1.5">
                  <AlertTriangle className="w-4 h-4 text-rose-500" />
                  Alerta de Reposição Crítica
                </h4>
                <span className="text-[9px] bg-rose-100 text-rose-800 font-black tracking-widest uppercase px-2 py-0.5 rounded-none">Urgente</span>
              </div>

              <div className="border border-gray-100 divide-y divide-gray-100 max-h-[350px] overflow-y-auto bg-white rounded-none">
                {productsBelowThreshCount(products, inventory) === 0 ? (
                  <div className="p-8 text-center text-xs text-gray-400">
                    Nenhuma variação com estoque menor que 4 unidades. Tudo excelente!
                  </div>
                ) : (
                  renderLowStockItems(products, inventory, loadQR)
                )}
              </div>
            </div>

            {/* Recent logs */}
            <div className="lg:col-span-7 space-y-4">
              <div className="flex items-center justify-between">
                <h4 className="text-xs font-black uppercase tracking-widest text-black/60 flex items-center gap-1.5">
                  <History className="w-4 h-4 text-black" />
                  Movimentações Recentes
                </h4>
                <button onClick={() => setActiveTab('history')} className="text-[10px] font-black text-[#eab308] hover:underline uppercase tracking-widest bg-transparent border-0 cursor-pointer">Ver Tudo</button>
              </div>

              <div className="border border-gray-100 bg-white shadow-sm overflow-hidden divide-y divide-gray-100 rounded-none max-h-[350px] overflow-y-auto">
                {loadingMovements ? (
                  <div className="p-8 text-center text-xs text-gray-400">
                    <RotateCw className="w-5 h-5 animate-spin mx-auto text-[#eab308] mb-2" />
                    Buscando movimentações...
                  </div>
                ) : movements.length === 0 ? (
                  <div className="p-8 text-center text-xs text-gray-400">
                    Nenhuma movimentação por QR code registrada até o momento.
                  </div>
                ) : (
                  movements.slice(0, 10).map((m) => {
                    const mDate = m.createdAt ? m.createdAt.toDate() : new Date();
                    return (
                      <div key={m.id} className="p-4 flex items-center justify-between text-xs hover:bg-gray-50/50 transition">
                        <div className="space-y-1">
                          <div className="flex items-center gap-2">
                            <span className="font-extrabold uppercase text-black">{m.productName}</span>
                            <span className="bg-gray-100 font-mono text-[9px] text-gray-600 px-2 py-0.5 font-semibold">{m.variantKey.replace('_', ' / ')}</span>
                          </div>
                          <p className="text-[10px] text-gray-400 flex items-center gap-1.5">
                            <User className="w-3 h-3 text-gray-300" />
                            {m.operator} &middot; {mDate.toLocaleDateString('pt-BR')} às {mDate.toLocaleTimeString('pt-BR', {hour: '2-digit', minute:'2-digit'})}
                          </p>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className={`font-black tracking-wider text-[11px] px-2 py-1 uppercase rounded-none border ${
                            m.type === 'Produção' 
                              ? 'bg-amber-50 border-amber-200 text-amber-700' 
                              : m.type === 'Venda Local' 
                              ? 'bg-blue-50 border-blue-200 text-blue-700' 
                              : 'bg-gray-100 border-gray-200 text-gray-700'
                          }`}>
                            {m.type}
                          </span>
                          <span className={`font-mono text-[13px] font-black w-10 text-right ${m.quantity > 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                            {m.quantity > 0 ? `+${m.quantity}` : m.quantity}
                          </span>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>

          </div>

        </div>
      )}

      {/* 2. LIVE CAMERA SCANNER VIEW */}
      {activeTab === 'scan' && (
        <div className="space-y-8 animate-in fade-in duration-350">
          
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
            
            {/* Action control bar and camera scanner screen */}
            <div className="lg:col-span-7 space-y-6">
              
              {/* Scan Mode Toggle Slider */}
              <div className="bg-gray-100 p-1 flex rounded-none border border-gray-200">
                <button 
                  onClick={() => setScanMode('entrada')} 
                  className={`flex-1 flex items-center justify-center gap-2 py-3.5 text-xs font-black uppercase tracking-widest border-0 transition-all cursor-pointer ${
                    scanMode === 'entrada' 
                      ? 'bg-[#eab308] text-black shadow-md' 
                      : 'text-gray-500 hover:text-black bg-transparent'
                  }`}
                >
                  <Plus className="w-4 h-4" />
                  Produção / Entrada (+1)
                </button>
                <button 
                  onClick={() => setScanMode('saida')} 
                  className={`flex-1 flex items-center justify-center gap-2 py-3.5 text-xs font-black uppercase tracking-widest border-0 transition-all cursor-pointer ${
                    scanMode === 'saida' 
                      ? 'bg-rose-600 text-white shadow-md' 
                      : 'text-gray-500 hover:text-black bg-transparent'
                  }`}
                >
                  <Minus className="w-4 h-4" />
                  Venda Local / Baixa (-1)
                </button>
              </div>

              {/* Physical Scanner Visual Box Frame */}
              <div className="relative border border-gray-200 bg-[#0a0a0f] p-4 flex flex-col items-center justify-center overflow-hidden min-h-[400px]">
                {isScanning ? (
                  <div className="w-full max-w-[420px] mx-auto space-y-4">
                    {/* Glowing scanning target borders overlay */}
                    <div className="relative overflow-hidden border-2 border-white/10 rounded-sm">
                      <div id={SCANNER_DIV_ID} className="w-full bg-black aspect-square"></div>
                      
                      {/* Laser red scan animator overlay line */}
                      <div className="absolute inset-x-0 h-[2px] bg-red-500 shadow-[0_0_10px_#ef4444] animate-[bounce_3s_infinite] top-0 pointer-events-none" />
                      
                      {/* Scanned target box overlays */}
                      <div className="absolute top-4 left-4 w-6 h-6 border-t-2 border-l-2 border-[#eab308]" />
                      <div className="absolute top-4 right-4 w-6 h-6 border-t-2 border-r-2 border-[#eab308]" />
                      <div className="absolute bottom-4 left-4 w-6 h-6 border-b-2 border-l-2 border-[#eab308]" />
                      <div className="absolute bottom-4 right-4 w-6 h-6 border-b-2 border-r-2 border-[#eab308]" />
                    </div>

                    <div className="flex justify-between items-center px-2">
                      <span className="text-[10px] text-gray-400 uppercase tracking-widest animate-pulse flex items-center gap-1.5">
                        <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
                        Câmera Ativa
                      </span>
                      <button 
                        onClick={() => setIsScanning(false)} 
                        className="text-[10px] border border-white/25 hover:border-white text-white hover:bg-white/10 px-4 py-2 font-black uppercase tracking-widest bg-transparent cursor-pointer transition-all"
                      >
                        Desligar Leitor
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="text-center p-8 space-y-6">
                    <div className="w-16 h-16 bg-white/[0.04] border border-white/10 rounded-full flex items-center justify-center mx-auto">
                      <QrCode className="w-8 h-8 text-white/50" />
                    </div>
                    <div className="space-y-2">
                      <h4 className="text-sm font-bold text-white uppercase tracking-widest">Leitor de Câmera Desativado</h4>
                      <p className="text-xs text-gray-400 max-w-sm mx-auto">Utilize a câmera do seu smartphone (Android ou iPhone) para escanear a etiqueta do produto e validar instantaneamente a contagem.</p>
                    </div>
                    <button 
                      onClick={startScanner}
                      className="bg-white hover:bg-[#eab308] text-black hover:text-black text-xs font-black uppercase tracking-widest px-8 py-3.5 transition-all border-0 shadow-lg cursor-pointer flex items-center gap-2 mx-auto"
                    >
                      <Plus className="w-4 h-4" /> Unlocked Câmera & Escanear
                    </button>
                  </div>
                )}
              </div>

            </div>

            {/* Scan results & action confirmations pane */}
            <div className="lg:col-span-5 space-y-6">
              <h4 className="text-xs font-black uppercase tracking-widest text-black/60 flex items-center gap-2">
                Resultado do Escaneamento
              </h4>

              <div className="border border-gray-100 bg-gray-50/50 p-6 min-h-[300px] flex flex-col justify-between relative rounded-none shadow-sm overflow-hidden">
                <AnimatePresence mode="wait">
                  {scannerFeedback.status === null ? (
                    <motion.div 
                      key="idle" 
                      initial={{ opacity: 0 }} 
                      animate={{ opacity: 1 }} 
                      exit={{ opacity: 0 }}
                      className="my-auto text-center p-6 space-y-3"
                    >
                      <Smartphone className="w-10 h-10 text-gray-300 mx-auto animate-bounce" />
                      <p className="text-xs text-gray-400">Aguardando leitura de QR Code para processar alteração...</p>
                    </motion.div>
                  ) : (
                    <motion.div 
                      key="result"
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -10 }}
                      className="space-y-6 w-full"
                    >
                      {/* Status header indicator badge */}
                      <div className={`p-4 border flex items-center gap-3 ${
                        scannerFeedback.status === 'success' 
                          ? 'bg-emerald-50 border-emerald-200 text-emerald-800' 
                          : 'bg-rose-50 border-rose-200 text-rose-800'
                      }`}>
                        {scannerFeedback.status === 'success' ? (
                          <CheckCircle className="w-5 h-5 text-emerald-600 shrink-0" />
                        ) : (
                          <AlertTriangle className="w-5 h-5 text-rose-600 shrink-0" />
                        )}
                        <span className="text-xs font-black uppercase tracking-[0.05em]">{scannerFeedback.message}</span>
                      </div>

                      {/* Decoded item profile information card */}
                      {scannerFeedback.productName && (
                        <div className="bg-white p-5 border border-gray-100 space-y-4">
                          <span className="text-[8px] font-black uppercase text-gray-400 tracking-widest block">Dados da Variação Sincronizados</span>
                          
                          <div className="space-y-1">
                            <h5 className="text-sm font-black text-black uppercase tracking-wide">{scannerFeedback.productName}</h5>
                            <div className="flex flex-wrap gap-2 pt-1">
                              <span className="bg-black text-white text-[9px] font-black uppercase tracking-widest px-2.5 py-1">
                                {scannerFeedback.variantName}
                              </span>
                              <span className="bg-gray-100 border border-gray-200 text-[10px] text-gray-700 font-mono font-bold px-2.5 py-1">
                                Cód: {lastScannedCode.replace('fpac_qr:', '')}
                              </span>
                            </div>
                          </div>

                          <div className="border-t border-gray-100 pt-4 flex justify-between items-center">
                            <span className="text-xs text-gray-500">Novo Estoque Real:</span>
                            <span className="font-mono text-base font-black text-black bg-gray-50 px-3 py-1 border border-gray-100">
                              {scannerFeedback.newStock ?? 0} unidades
                            </span>
                          </div>
                        </div>
                      )}

                      {/* Continuous Scanning note banner */}
                      <p className="text-[10px] text-center text-gray-400 animate-pulse uppercase tracking-wide">
                        Leitor bloqueado por 2s para evitar duplicações. Pronto para o próximo bipe!
                      </p>
                    </motion.div>
                  )}
                </AnimatePresence>
                
                {/* Visual success/error flashing feedback screen borders overlay */}
                {scannerFeedback.status === 'success' && (
                  <div className="absolute inset-0 border-4 border-emerald-500 pointer-events-none animate-[ping_1.5s_infinite] opacity-15" />
                )}
                {scannerFeedback.status === 'error' && (
                  <div className="absolute inset-0 border-4 border-rose-500 pointer-events-none animate-[ping_1.5s_infinite] opacity-15" />
                )}
              </div>

            </div>

          </div>

        </div>
      )}

      {/* 3. QR CODES GENERATOR & TAG PRINTING LIST */}
      {activeTab === 'generator' && (
        <div className="space-y-6 animate-in fade-in duration-350">
          
          {/* Filters search and filter header toolbar */}
          <div className="flex flex-col md:flex-row gap-4 justify-between items-center bg-gray-50 p-4 border border-gray-100">
            <div className="relative w-full md:w-80">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-4 h-4" />
              <input 
                type="text" 
                placeholder="Pesquisar camisas..." 
                value={searchGen}
                onChange={(e) => setSearchGen(e.target.value)}
                className="w-full bg-white border border-gray-200 pl-10 pr-4 py-2.5 text-xs uppercase font-extrabold tracking-wider focus:outline-none focus:border-[#eab308] rounded-none text-black"
              />
            </div>

            <div className="flex gap-2 w-full md:w-auto shrink-0">
              <select 
                value={filterSlug} 
                onChange={(e) => setFilterSlug(e.target.value)}
                className="w-full md:w-auto bg-white border border-gray-200 px-4 py-2.5 text-xs font-black uppercase tracking-widest focus:outline-none focus:border-[#eab308] rounded-none text-black cursor-pointer"
              >
                <option value="all">Filtro Coleção: Todas</option>
                <option value="force">Linha FORCE</option>
                <option value="mark">Linha MARK</option>
                <option value="prime">Linha PRIME</option>
              </select>
            </div>
          </div>

          {/* Grid stack table of products */}
          <div className="border border-gray-100 divide-y divide-gray-100">
            {filteredProductsGen.length === 0 ? (
              <div className="p-12 text-center text-xs text-gray-400 bg-white">
                Nenhum produto cadastrado que atenda à busca informada.
              </div>
            ) : (
              filteredProductsGen.map((product) => {
                const isExpanded = expandedProduct === product.slug;
                
                return (
                  <div key={product.id} className="bg-white">
                    {/* Main Row summary profile */}
                    <div className="flex flex-col md:flex-row md:items-center justify-between p-4 md:p-6 gap-4">
                      
                      {/* Profile thumb & basic stats details */}
                      <div className="flex items-center gap-4">
                        <div className="w-12 h-12 bg-gray-50 flex items-center justify-center shrink-0 border border-gray-100 relative overflow-hidden">
                          {product.images && product.images[0] ? (
                            <img src={product.images[0]} alt={product.name} className="object-cover w-full h-full" />
                          ) : (
                            <Tag className="w-5 h-5 text-gray-300" />
                          )}
                        </div>

                        <div className="space-y-1">
                          <span className="text-[8px] bg-black text-white px-1.5 py-0.5 font-black uppercase tracking-widest">{product.slug}</span>
                          <h4 className="text-sm font-black uppercase tracking-wide text-black">{product.name}</h4>
                          <p className="text-[10px] text-gray-400">{product.headline || 'Camiseta Linha Exclusiva'}</p>
                        </div>
                      </div>

                      {/* Action buttons list */}
                      <div className="flex gap-2">
                        <button 
                          onClick={() => toggleProductAccordion(product.slug)} 
                          className={`px-4 py-2 text-[10px] uppercase font-black tracking-widest border transition-all flex items-center gap-2 cursor-pointer bg-white ${
                            isExpanded ? 'border-black text-black' : 'border-gray-200 text-gray-500 hover:text-black hover:border-gray-300'
                          }`}
                        >
                          <Eye className="w-3.5 h-3.5" />
                          {isExpanded ? 'Recolher Códigos' : 'Ver Variações QRs'}
                        </button>
                        
                        <button 
                          onClick={() => {
                            // Expand first to populate QR states if necessary, then print
                            if (!isExpanded) {
                              toggleProductAccordion(product.slug);
                            }
                            setTimeout(() => printBatchProductQRs(product), 500);
                          }}
                          className="bg-black hover:bg-[#eab308] text-white hover:text-black px-4 py-2 text-[10px] uppercase font-black tracking-widest transition-all flex items-center gap-2 border-0 cursor-pointer shadow-sm"
                        >
                          <Printer className="w-3.5 h-3.5" />
                          Etiquetas em Lote
                        </button>
                      </div>

                    </div>

                    {/* Expandable Accordion: Permutations of Sizes & Colors */}
                    <AnimatePresence>
                      {isExpanded && (
                        <motion.div 
                          initial={{ height: 0, opacity: 0 }}
                          animate={{ height: 'auto', opacity: 1 }}
                          exit={{ height: 0, opacity: 0 }}
                          className="overflow-hidden bg-gray-50/50 border-t border-gray-100"
                        >
                          <div className="p-4 md:p-6 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                            
                            {/* Color & Size Cross Permutations */}
                            {product.colors?.map((color: any) => (
                              product.sizes?.map((size: string) => {
                                const vKey = `${color.name}_${size}`;
                                const qrKey = `${product.slug}:${vKey}`;
                                const qrUrl = generatedQRs[qrKey];
                                const currentStockAmount = inventory[product.slug]?.variants?.[vKey]?.stock ?? 0;

                                return (
                                  <div key={qrKey} className="bg-white p-4 border border-gray-100 space-y-4 shadow-sm relative flex flex-col justify-between">
                                    <div className="space-y-1.5 border-b border-gray-100 pb-3">
                                      <div className="flex justify-between items-center">
                                        <span className="font-extrabold uppercase text-xs text-black">{color.name}</span>
                                        <span className="bg-gray-100 font-bold font-mono text-[10px] text-gray-700 px-2.5 py-0.5">Tamanho {size}</span>
                                      </div>
                                      <p className="text-[9px] font-mono font-semibold text-gray-400 overflow-hidden text-ellipsis whitespace-nowrap">Cód: {product.slug}|{vKey}</p>
                                    </div>

                                    {/* Calculated variant state display */}
                                    <div className="flex justify-between items-center bg-gray-50 p-2 border border-gray-100 text-[11px]">
                                      <span className="text-gray-500">Estoque atual:</span>
                                      <span className={`font-mono font-black ${currentStockAmount < 4 ? 'text-rose-600' : 'text-emerald-600'}`}>
                                        {currentStockAmount} unidades {currentStockAmount < 4 && '(Crítico)'}
                                      </span>
                                    </div>

                                    {/* Dynamic QR Code box preview */}
                                    <div className="bg-gray-100/50 flex flex-col items-center justify-center p-3 border border-gray-100 aspect-square rounded-sm">
                                      {qrUrl ? (
                                        <img src={qrUrl} alt={qrKey} className="w-32 h-32" />
                                      ) : (
                                        <div className="w-32 h-32 flex items-center justify-center">
                                          <RotateCw className="w-6 h-6 animate-spin text-gray-300" />
                                        </div>
                                      )}
                                      <span className="text-[8px] font-black uppercase text-gray-400 tracking-widest mt-2">{product.slug} &middot; {vKey}</span>
                                    </div>

                                    {/* Downloader & Printer utility bar */}
                                    <div className="grid grid-cols-2 gap-2 pt-2">
                                      <a 
                                        href={qrUrl} 
                                        download={`FPAC_QR_${product.slug}_${vKey}.png`}
                                        className="border border-gray-200 hover:border-black text-gray-500 hover:text-black py-2.5 text-[10px] uppercase font-black tracking-widest rounded-none text-center transition flex items-center justify-center gap-1 cursor-pointer bg-white"
                                      >
                                        <Download className="w-3 h-3" />
                                        Salvar Image
                                      </a>
                                      
                                      <button 
                                        onClick={() => printSingleQR(product, color.name, size, qrUrl)}
                                        className="bg-black hover:bg-black/80 text-white py-2.5 text-[10px] uppercase font-black tracking-widest rounded-none transition flex items-center justify-center gap-1 cursor-pointer border-0 shadow-sm"
                                      >
                                        <Printer className="w-3.5 h-3.5" />
                                        Imprimir Tag
                                      </button>
                                    </div>

                                  </div>
                                );
                              })
                            ))}

                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>

                  </div>
                );
              })
            )}
          </div>

        </div>
      )}

      {/* 4. STOCK MOVEMENTS HISTORY LEDGER */}
      {activeTab === 'history' && (
        <div className="space-y-6 animate-in fade-in duration-350">
          
          {/* Filtering options bar */}
          <div className="flex flex-col md:flex-row gap-4 justify-between items-center bg-gray-50 p-4 border border-gray-100">
            <div className="relative w-full md:w-80">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-4 h-4" />
              <input 
                type="text" 
                placeholder="Filtrar por produto, operador..." 
                value={historySearch}
                onChange={(e) => setHistorySearch(e.target.value)}
                className="w-full bg-white border border-gray-200 pl-10 pr-4 py-2.5 text-xs uppercase font-extrabold tracking-wider focus:outline-none focus:border-[#eab308] rounded-none text-black"
              />
            </div>

            <div className="flex gap-2 w-full md:w-auto shrink-0 select-none">
              <select 
                value={historyTypeFilter} 
                onChange={(e) => setHistoryTypeFilter(e.target.value as any)}
                className="w-full md:w-auto bg-white border border-gray-200 px-4 py-2.5 text-xs font-black uppercase tracking-widest focus:outline-none focus:border-[#eab308] rounded-none text-black cursor-pointer"
              >
                <option value="all">Todas as Movimentações</option>
                <option value="Produção">Lançamentos de Produção</option>
                <option value="Venda Local">Lançamentos de Vendas Locais</option>
                <option value="Ajuste">Ajustes Manuais</option>
              </select>
            </div>
          </div>

          {/* Historical Logs Tabular Structure */}
          <div className="border border-gray-100 bg-white overflow-x-auto rounded-none">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-100 uppercase tracking-widest text-[#000]/60 font-black text-[9px]">
                  <th className="p-4">Data / Hora</th>
                  <th className="p-4">Variação de Produto</th>
                  <th className="p-4">Tipo Movimentação</th>
                  <th className="p-4">Quantidade</th>
                  <th className="p-4">Operador</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {loadingMovements ? (
                  <tr>
                    <td colSpan={5} className="p-12 text-center text-gray-400">
                      <RotateCw className="w-5 h-5 animate-spin mx-auto text-[#eab308] mb-2" />
                      Carregando logs de estoque...
                    </td>
                  </tr>
                ) : filteredMovements.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="p-12 text-center text-gray-400">
                      Nenhuma movimentação atende aos critérios de pesquisa selecionados.
                    </td>
                  </tr>
                ) : (
                  filteredMovements.map((m) => {
                    const mDate = m.createdAt ? m.createdAt.toDate() : new Date();
                    return (
                      <tr key={m.id} className="hover:bg-gray-50/50 transition">
                        <td className="p-4 font-mono text-[11px] text-gray-500">
                          {mDate.toLocaleDateString('pt-BR')} {mDate.toLocaleTimeString('pt-BR', {hour: '2-digit', minute:'2-digit', second:'2-digit'})}
                        </td>
                        <td className="p-4">
                          <div className="space-y-0.5">
                            <span className="font-extrabold uppercase text-black block">{m.productName}</span>
                            <span className="inline-block bg-gray-100 text-gray-600 font-mono font-bold text-[9px] px-2 py-0.5">{m.variantKey.replace('_', ' / ')}</span>
                          </div>
                        </td>
                        <td className="p-4">
                          <span className={`inline-block font-black tracking-wider text-[10px] px-2.5 py-1 uppercase rounded-none border ${
                            m.type === 'Produção' 
                              ? 'bg-amber-50 border-amber-200 text-amber-700' 
                              : m.type === 'Venda Local' 
                              ? 'bg-blue-50 border-blue-200 text-blue-700' 
                              : 'bg-gray-100 border-gray-200 text-gray-700'
                          }`}>
                            {m.type}
                          </span>
                        </td>
                        <td className="p-4 font-mono font-black text-sm">
                          <span className={m.quantity > 0 ? 'text-emerald-600' : 'text-rose-600'}>
                            {m.quantity > 0 ? `+${m.quantity}` : m.quantity}
                          </span>
                        </td>
                        <td className="p-4 text-gray-500 font-medium">
                          {m.operator}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

        </div>
      )}

    </div>
  );
}

// Low stock calculations helper
function productsBelowThreshCount(products: any[], inventory: Record<string, any>) {
  let count = 0;
  products.forEach(p => {
    const inv = inventory[p.slug];
    if (inv?.variants) {
      Object.entries(inv.variants).forEach(([vKey, vData]: [string, any]) => {
        if (vData.stock < 4 && vData.available !== false) count++;
      });
    }
  });
  return count;
}

// Low Stock render list helper
function renderLowStockItems(products: any[], inventory: Record<string, any>, loadQR: any) {
  const list: React.ReactNode[] = [];
  products.forEach(p => {
    const inv = inventory[p.slug];
    if (inv?.variants) {
      Object.entries(inv.variants).forEach(([vKey, vData]: [string, any]) => {
        if (vData.stock < 4 && vData.available !== false) {
          list.push(
            <div key={`${p.slug}-${vKey}`} className="p-3.5 flex justify-between items-center text-xs hover:bg-gray-50 transition">
              <div className="space-y-0.5">
                <span className="font-bold uppercase text-black text-[11px]">{p.name}</span>
                <span className="block text-[10px] text-gray-400 font-semibold">{vKey.replace('_', ' / ')}</span>
              </div>
              <div className="text-right">
                <span className="text-[11px] font-mono font-black text-rose-600 bg-rose-50 px-2 py-1 border border-rose-100 max-w-[80px] block">
                  {vData.stock} un
                </span>
                <span className="text-[8px] text-rose-800/60 uppercase tracking-wider font-extrabold mt-0.5 block">Reposição Urgente</span>
              </div>
            </div>
          );
        }
      });
    }
  });
  return <>{list}</>;
}
