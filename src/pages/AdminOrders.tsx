import React, { useState, useEffect } from 'react';
import { db, auth, storage } from '../lib/firebase';
import { collection, query, orderBy, onSnapshot, doc, updateDoc, deleteDoc, getDocs, setDoc, getDoc, Timestamp, serverTimestamp } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { signInWithPopup, GoogleAuthProvider, onAuthStateChanged, signOut } from 'firebase/auth';
import { Package, Search, CheckCircle, XCircle, Clock, ExternalLink, LogOut, Loader2, Trash2, Box, Image as ImageIcon, Palette, Maximize2, ToggleLeft, ToggleRight, Plus, Upload, Save, GripVertical } from 'lucide-react';
import { products as staticProducts } from '../data/products';
import { useInventory } from '../hooks/useInventory';
import { cn, resizeImage } from '../lib/utils';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import toast from 'react-hot-toast';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
  TouchSensor,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
  rectSortingStrategy,
  useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

// Estampas list
const staticCatalogEstampas = [
  { id: 'peito-1', name: 'Escrita Peito Core', path: '/estampas/F-PAC-ESCRITA-peito C.png' },
  { id: 'logo-premium', name: 'F PAC Full Logo', path: '/estampas/logo-fpac.png' },
];

interface Order {
  id: string;
  customerName: string;
  customerPhone: string;
  customerEmail?: string;
  address: string;
  number: string;
  complement: string;
  neighborhood: string;
  city: string;
  state: string;
  cep: string;
  items: any[];
  subtotal: number;
  frete: number;
  discount: number;
  total: number;
  paymentMethod: string;
  status: 'pending' | 'validated' | 'cancelled' | 'processing' | 'shipped' | 'delivered';
  createdAt: any;
  deliveredAt?: any;
  paymentLink?: string;
}

import { getApiUrl, getBaseUrl } from '../lib/api';

// Move DraggableSlot outside for focus stability.
const StockInput = ({ initialValue, onSave, className }: { initialValue: number, onSave: (val: number) => void, className?: string }) => {
  const [localValue, setLocalValue] = useState(initialValue);

  useEffect(() => {
    setLocalValue(initialValue);
  }, [initialValue]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = parseInt(e.target.value) || 0;
    setLocalValue(val);
  };

  const handleBlur = () => {
    if (localValue !== initialValue) {
      onSave(localValue);
    }
  };

  return (
    <input 
      type="number" 
      value={localValue} 
      onChange={handleChange}
      onBlur={handleBlur}
      className={className}
    />
  );
};

const DraggableSlot = ({ 
  slotIndex, 
  estampa, 
  available, 
  isEditing, 
  isUploading, 
  imageUrl, 
  handleFileUpload, 
  handleSaveEstampaImage, 
  handleDeleteEstampa,
  toggleAvailability, 
  setEditingEstampaId, 
  setTempEstampaImage, 
  tempEstampaImage, 
  getStock, 
  updateStock 
}: any) => {
  const [tempPosition, setTempPosition] = useState(estampa?.position || '');
  const [tempWidth, setTempWidth] = useState(estampa?.width || '');
  const [tempHeight, setTempHeight] = useState(estampa?.height || '');
  
  // Sync local state when estampa changes or editing mode is triggered
  useEffect(() => {
    if (estampa) {
      setTempPosition(estampa.position || '');
      setTempWidth(estampa.width || '');
      setTempHeight(estampa.height || '');
    } else {
      setTempPosition('');
      setTempWidth('');
      setTempHeight('');
    }
  }, [estampa, isEditing]);

  const estampaId = estampa?.id || '';
  const stock = getStock(estampaId || `slot-${slotIndex}`);

  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging
  } = useSortable({ id: `slot-${slotIndex}` });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 50 : 'auto',
  };

  return (
    <div 
      ref={setNodeRef} 
      style={style}
      className={cn(
        "bg-white border p-3 flex flex-col group relative touch-none", 
        !imageUrl && "border-dashed border-gray-300 opacity-60",
        isDragging && "shadow-2xl border-[#eab308] opacity-90 scale-105"
      )}
    >
      <div className="absolute top-2 left-2 z-10 flex items-center gap-2">
        <div {...attributes} {...listeners} className="cursor-grab active:cursor-grabbing p-1 bg-black/5 rounded hover:bg-black/10 transition-colors">
          <GripVertical size={12} className="text-gray-400" />
        </div>
        <span className="text-[7px] font-black bg-black text-white px-2 py-0.5 uppercase tracking-widest">Slot {slotIndex}</span>
      </div>

      <div className="aspect-square bg-black/5 mb-3 group relative overflow-hidden flex items-center justify-center">
        {imageUrl ? (
          <img src={imageUrl || undefined} className={cn("w-full h-full object-contain grayscale", available && "grayscale-0")} />
        ) : (
          <div className="text-gray-200 flex flex-col items-center">
            <span className="text-sm font-black uppercase">ESGOTADO</span>
          </div>
        )}
        <button 
          onClick={() => {
            setEditingEstampaId(isEditing ? null : (estampaId || `slot-${slotIndex}`));
            setTempEstampaImage(imageUrl);
          }}
          className="absolute inset-0 bg-black/20 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
        >
          <div className="bg-white p-2 text-black shadow-lg">
            <ImageIcon size={16} />
          </div>
        </button>
      </div>
      
      {isEditing ? (
        <div className="mb-3 space-y-2">
           <input 
            type="text" 
            defaultValue={estampa?.name || ''}
            id={`name-${slotIndex}`}
            className="w-full px-2 py-1 border border-black/10 text-[9px] uppercase font-bold focus:outline-none focus:border-[#eab308]"
            placeholder="Nome"
          />
          <input 
            type="text" 
            value={tempEstampaImage} 
            onChange={(e) => setTempEstampaImage(e.target.value)}
            className="w-full px-2 py-1 border border-black/10 text-[8px] focus:outline-none focus:border-[#eab308]"
            placeholder="URL"
          />
          <div className="flex gap-1">
            <label className="bg-black/5 text-black p-2 cursor-pointer hover:bg-black/10 transition-all flex items-center justify-center">
              <Upload size={10} />
              <input 
                type="file" 
                className="hidden" 
                accept="image/*"
                disabled={isUploading}
                onChange={async (e) => {
                  const file = e.target.files?.[0];
                  if (file) {
                    const url = await handleFileUpload(file, 'estampas');
                    setTempEstampaImage(url);
                  }
                }}
              />
            </label>
            <button 
              onClick={() => {
                const nameInput = document.getElementById(`name-${slotIndex}`) as HTMLInputElement;
                handleSaveEstampaImage(estampaId, slotIndex, nameInput?.value || 'Nova Estampa', tempPosition, tempWidth, tempHeight);
              }}
              className="text-[8px] font-black uppercase bg-black text-white px-2 py-1 flex-1 disabled:opacity-50"
              disabled={isUploading}
            >
              {isUploading ? '...' : 'OK'}
            </button>
            <button 
              onClick={() => handleDeleteEstampa(estampaId, slotIndex)}
              className="p-1 bg-red-500 text-white rounded hover:bg-red-600 transition-colors"
              title="Excluir Estampa Permanentemente"
            >
              <Trash2 size={12} />
            </button>
          </div>
          {/* Novas Linhas para Local, Tamanho e Estoque */}
          <div className="grid grid-cols-2 gap-1 pt-1 border-t border-black/5">
             <div className="col-span-2 flex flex-wrap gap-1 mt-1 border-t border-black/5 pt-1">
               {[
                 { label: 'CENTRAL', value: 'PEITO CENTRAL' },
                 { label: 'PEITO', value: 'PEITO LE/LD' },
                 { label: 'COSTAS', value: 'COSTAS' },
                 { label: 'OMBRO', value: 'OMBRO' }
               ].map(loc => {
                 const isActive = tempPosition.split(',').filter(Boolean).includes(loc.value);
                 return (
                   <button
                     key={loc.value}
                     onClick={() => {
                       let positions = tempPosition ? tempPosition.split(',').filter(Boolean) : [];
                       if (isActive) {
                         positions = positions.filter(p => p !== loc.value);
                       } else {
                         positions.push(loc.value);
                       }
                       setTempPosition(positions.join(','));
                     }}
                     className={cn(
                       "px-1 py-0.5 text-[6px] font-black uppercase border transition-colors",
                       isActive ? "bg-black text-[#eab308] border-black" : "bg-white text-gray-300 border-black/10 hover:border-black/30"
                     )}
                   >
                     {loc.label}
                   </button>
                 );
               })}
             </div>
             <div className="grid grid-cols-2 gap-1">
                <div className="flex flex-col">
                  <span className="text-[5px] font-black uppercase text-gray-400">Largura (cm)</span>
                  <input 
                    type="text" 
                    value={tempWidth} 
                    onChange={e => setTempWidth(e.target.value)}
                    className="w-full bg-white border border-black/10 px-1 py-1 text-[7px] uppercase font-bold focus:outline-none focus:border-[#eab308]"
                    placeholder="L"
                  />
                </div>
                <div className="flex flex-col">
                  <span className="text-[5px] font-black uppercase text-gray-400">Altura (cm)</span>
                  <input 
                    type="text" 
                    value={tempHeight} 
                    onChange={e => setTempHeight(e.target.value)}
                    className="w-full bg-white border border-black/10 px-1 py-1 text-[7px] uppercase font-bold focus:outline-none focus:border-[#eab308]"
                    placeholder="H"
                  />
                </div>
             </div>
             <div className="col-span-2 flex items-center gap-1 mt-1 border-t border-black/5 pt-1">
                <span className="text-[7px] font-black uppercase text-gray-400">Estoque:</span>
                <StockInput 
                  initialValue={stock} 
                  onSave={val => updateStock(estampaId || `slot-${slotIndex}`, val)}
                  className="flex-1 bg-white border border-black/10 px-1 py-1 text-[7px] font-bold focus:outline-none focus:border-[#eab308]"
                />
             </div>
          </div>
        </div>
      ) : (
        <div className="flex flex-col border-t pt-3">
          <div className="flex items-center justify-between gap-1 mb-1">
            <span className={cn(
              "text-[9px] font-black uppercase truncate",
              !imageUrl && "text-gray-300"
            )}>
              {imageUrl ? (estampa?.name || 'S/ Nome') : 'ESGOTADO'}
            </span>
            {imageUrl && (
              <button onClick={() => toggleAvailability(estampaId, available)} className={cn("transition-colors", available ? "text-green-600" : "text-gray-300")}>
                {available ? <ToggleRight size={20} /> : <ToggleLeft size={20} />}
              </button>
            )}
          </div>
          {imageUrl && (estampa?.position || estampa?.size || stock >= 0) && (
            <div className="flex flex-wrap gap-1">
              {estampa.position && estampa.position.split(',').filter(Boolean).map((pos: string) => (
                <span key={pos} className="text-[6px] font-black bg-black text-white px-1 py-0.5 whitespace-nowrap">
                  {pos === 'PEITO LE/LD' ? 'PEITO' : pos.replace('PEITO ', '')}
                </span>
              ))}
              {(estampa.width || estampa.height) && (
                <span className="text-[6px] font-black bg-[#eab308] text-black px-1 py-0.5 whitespace-nowrap">
                  {estampa.width || '?'}{estampa.height ? `X${estampa.height}` : ''} CM
                </span>
              )}
              <span className={cn(
                "text-[6px] font-black px-1 py-0.5",
                stock > 0 ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"
              )}>
                QTD: {stock}
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export function AdminOrders() {
  const { user, loading: authLoading, loginWithGoogle } = useAuth();
  const [orders, setOrders] = useState<Order[]>([]);
  const [dynamicProducts, setDynamicProducts] = useState<any[]>([]);
  const [dynamicEstampas, setDynamicEstampas] = useState<any[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'pending' | 'validated' | 'cancelled'>('all');
  const [activeTab, setActiveTab] = useState<'orders' | 'products' | 'stamps' | 'identity'>('orders');
  const [brandConfig, setBrandConfig] = useState<any>(null);
  const [identityFormData, setIdentityFormData] = useState({
    heroUrl: '',
    aboutUrl: '',
    catalogImage1: '',
    catalogImage2: '',
    communityUrls: ['', '', '', '']
  });
  const [editingImagesId, setEditingImagesId] = useState<string | null>(null);
  const [tempImages, setTempImages] = useState<string[]>([]);
  const [tempStampGallery, setTempStampGallery] = useState<string[]>([]);
  const [editingEstampaId, setEditingEstampaId] = useState<string | null>(null);
  const [tempEstampaImage, setTempEstampaImage] = useState<string>('');
  const [isUploading, setIsUploading] = useState(false);
  const [isSendingTest, setIsSendingTest] = useState(false);
  const [numSlots, setNumSlots] = useState(15);
  const { 
    inventory, 
    toggleAvailability, 
    isAvailable, 
    updateStock, 
    updateVariantStock, 
    toggleVariantAvailability,
    getStock
  } = useInventory();

  const VariantToggle = ({ id, variantKey, available, stock }: { id: string, variantKey: string, available: boolean, stock: number }) => (
    <button 
      onClick={() => toggleVariantAvailability(id, variantKey, available)}
      className={cn(
        "p-1 rounded transition-colors", 
        available ? "text-green-600 hover:bg-green-50" : "text-gray-300 hover:bg-red-50"
      )}
    >
      {available ? <ToggleRight size={24} /> : <ToggleLeft size={24} />}
    </button>
  );

  const isAdmin = user?.email === 'fpacstore@gmail.com';

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    }),
    useSensor(TouchSensor, {
      activationConstraint: {
        delay: 200,
        tolerance: 5,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;

    if (over && active.id !== over.id) {
      const oldIndex = parseInt(active.id.toString().split('-')[1]) - 1;
      const newIndex = parseInt(over.id.toString().split('-')[1]) - 1;

      // We need to swap the data in the slots
      const estampaActive = dynamicEstampas.find(e => e.slotIndex === oldIndex + 1);
      const estampaOver = dynamicEstampas.find(e => e.slotIndex === newIndex + 1);

      try {
        const batch: Promise<any>[] = [];
        
        if (estampaActive) {
          batch.push(setDoc(doc(db, 'estampas', estampaActive.id), { ...estampaActive, slotIndex: newIndex + 1 }, { merge: true }));
        }
        
        if (estampaOver) {
          batch.push(setDoc(doc(db, 'estampas', estampaOver.id), { ...estampaOver, slotIndex: oldIndex + 1 }, { merge: true }));
        }

        await Promise.all(batch);
      } catch (error) {
        console.error("Error reordering:", error);
      }
    }
  };


  const handleSaveImages = async (product: any) => {
    setIsUploading(true);
    try {
      const updateData: any = {
        ...product, // Preserve all existing data if it's a first-time save from static
        images: tempImages.filter(img => img.trim() !== ''),
        stampGallery: tempStampGallery,
        updatedAt: new Date()
      };

      // Ensure we have a createdAt date for the orderBy query to work
      if (!updateData.createdAt) {
        updateData.createdAt = new Date();
      }

      // Ensure we don't save the Firestore ID inside the document data
      if (updateData.id) delete updateData.id;

      await setDoc(doc(db, 'products', product.id), updateData, { merge: true });
      setEditingImagesId(null);
      toast.success('Produto atualizado!');
    } catch (error) {
      console.error(error);
      toast.error('Erro ao salvar imagens.');
    } finally {
      setIsUploading(false);
    }
  };

  const handleSaveEstampaImage = async (estampaId: string, slotIndex: number, name: string = 'Nova Estampa', position?: string, width?: string, height?: string) => {
    try {
      const docId = estampaId || `slot-${slotIndex}`;
      await setDoc(doc(db, 'estampas', docId), {
        image: tempEstampaImage,
        slotIndex,
        name,
        position: position || '',
        width: width || '',
        height: height || '',
        updatedAt: new Date(),
        createdAt: new Date() // Fallback if it's new
      }, { merge: true });
      setEditingEstampaId(null);
      toast.success('Estampa salva!');
    } catch (error) {
      console.error(error);
      toast.error('Erro ao salvar imagem da estampa.');
    }
  };

  const handleDeleteEstampa = async (estampaId: string, slotIndex: number) => {
    // Custom non-blocking confirm logic if needed, but let's just use toast or a simple confirm for now
    // Actually, in sandbox, we should avoid confirm().
    // For now I'll just proceed or use a simpler visual cue.
    try {
      await deleteDoc(doc(db, 'estampas', estampaId || `slot-${slotIndex}`));
      toast.success('Estampa excluída.');
    } catch (error) {
      console.error("Erro ao excluir estampa:", error);
      toast.error('Erro ao excluir estampa.');
    }
  };

  const handleFileUpload = async (file: File, folder: string): Promise<string> => {
    setIsUploading(true);
    try {
      const resizedBlob = await resizeImage(file);
      const storageRef = ref(storage, `${folder}/${Date.now()}_${file.name}`);
      const snapshot = await uploadBytes(storageRef, resizedBlob);
      const url = await getDownloadURL(snapshot.ref);
      return url;
    } catch (error) {
      console.error("Upload error:", error);
      toast.error("Erro ao enviar imagem.");
      throw error;
    } finally {
      setIsUploading(false);
    }
  };

  useEffect(() => {
    if (!isAdmin) return;

    // Listen to orders
    const q = query(collection(db, 'orders'), orderBy('createdAt', 'desc'));
    const unsubscribeOrders = onSnapshot(q, (snapshot) => {
      const ordersData = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as Order[];
      setOrders(ordersData);
    }, (error) => {
      console.error("Erro ao escutar pedidos:", error);
    });

    // Listen to products
    const qProducts = collection(db, 'products');
    const unsubscribeProducts = onSnapshot(qProducts, (snapshot) => {
      const pData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      
      // Sort in memory to avoid index requirement and handle missing fields
      const sortedPData = [...pData].sort((a: any, b: any) => {
        const dateA = a.createdAt?.seconds || 0;
        const dateB = b.createdAt?.seconds || 0;
        return dateB - dateA;
      });
      
      setDynamicProducts(sortedPData);
    }, (error) => {
      console.error("Erro ao escutar produtos:", error);
    });

    // Listen to estampas
    const qEstampas = query(collection(db, 'estampas'), orderBy('slotIndex', 'asc'));
    const unsubscribeEstampas = onSnapshot(qEstampas, (snapshot) => {
      const eData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setDynamicEstampas(eData);
      
      // Update numSlots based on highest slotIndex found
      const maxIdx = eData.reduce((max: number, curr: any) => Math.max(max, curr.slotIndex || 0), 15);
      setNumSlots(maxIdx);
    }, (error) => {
      console.error("Erro ao escutar estampas:", error);
    });

    // Listen to brand config
    const unsubscribeBrand = onSnapshot(doc(db, 'config', 'brand'), (snapshot) => {
      if (snapshot.exists()) {
        const data = snapshot.data();
        setBrandConfig(data);
        setIdentityFormData({
          heroUrl: data.heroUrl || '',
          aboutUrl: data.aboutUrl || '',
          catalogImage1: data.catalogImage1 || '',
          catalogImage2: data.catalogImage2 || '',
          communityUrls: data.communityUrls || ['', '', '', '']
        });
      }
    });

    return () => {
      unsubscribeOrders();
      unsubscribeProducts();
      unsubscribeEstampas();
      unsubscribeBrand();
    };
  }, [isAdmin]);

  // Merge static and dynamic products to ensure all products are visible with their latest updates
  const currentProducts = staticProducts.map(staticP => {
    const dynamicP = dynamicProducts.find(p => p.id === staticP.id || p.slug === staticP.slug);
    return dynamicP ? { ...staticP, ...dynamicP } : staticP;
  });
  
  // Also add any dynamic products that don't exist in static (if any)
  dynamicProducts.forEach(dynamicP => {
    if (!staticProducts.find(sp => sp.id === dynamicP.id || sp.slug === dynamicP.slug)) {
      currentProducts.push(dynamicP);
    }
  });

  const currentEstampas = dynamicEstampas.length > 0 ? dynamicEstampas : staticCatalogEstampas;

  const handleLogin = async () => {
    try {
      await loginWithGoogle();
    } catch (error: any) {
      // Errors are handled in AuthContext, but we can log here
      console.error(error);
    }
  };

  const handleLogout = () => signOut(auth);

  const triggerStatusEmail = async (order: any, newStatus: string) => {
    if (!order.customerEmail) {
      console.log(`[EMAIL ADMIN] ⚠️ Pedido ${order.id} não possui e-mail cadastrado.`);
      return;
    }
    
    console.log(`[EMAIL ADMIN] 🚀 Notificando cliente sobre novo status: ${newStatus} (Pedido: ${order.id})`);
    try {
      const emailPayload = {
        email: order.customerEmail.trim(),
        customerName: order.customerName,
        orderId: order.id,
        items: order.items,
        totals: {
          subtotal: order.subtotal || (order.total - (order.frete || 0) + (order.discount || 0)),
          frete: order.frete || 0,
          discount: order.discount || 0,
          finalTotal: order.total
        },
        status: newStatus,
        address: {
          street: order.address,
          number: order.number,
          complement: order.complement || '',
          neighborhood: order.neighborhood,
          city: order.city,
          state: order.state,
          cep: order.cep
        },
        paymentMethod: order.paymentMethod || 'Não informado',
        paymentLink: order.paymentLink || null
      };

      const response = await fetch(getApiUrl('/api/send-confirmation'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(emailPayload)
      });
      const result = await response.json();
      
      if (!result.success) {
        console.error("[EMAIL ADMIN] ❌ Erro ao enviar:", result.error);
        if (result.error?.message?.includes("sandbox")) {
           toast.error("Erro: Resend em modo Sandbox. Verifique o e-mail do destinatário.");
        } else {
           toast.error(`Erro no e-mail: ${result.error?.message || 'Falha no servidor'}`);
        }
      } else {
        console.log(`[EMAIL ADMIN] ✅ E-mail de ${newStatus} disparado.`);
        toast.success(`Notificação de status enviada por e-mail!`);
      }
    } catch (err) {
      console.error("[EMAIL ADMIN] Erro ao enviar e-mail de atualização:", err);
      toast.error("Erro de conexão ao enviar e-mail.");
    }
  };

  const updateStatus = async (orderId: string, newStatus: string) => {
    try {
      console.log(`[STATUS DEBUG] ✨ Atualizando pedido ${orderId} para status: ${newStatus}`);
      const updateData: any = { status: newStatus };
      if (newStatus === 'delivered') {
        updateData.deliveredAt = new Date();
      }
      await updateDoc(doc(db, 'orders', orderId), updateData);
      
      // Fetch fresh order data to ensure we have all fields for the email
      const orderSnap = await getDoc(doc(db, 'orders', orderId));
      if (orderSnap.exists()) {
        const orderData = orderSnap.data();
        // Disparar o e-mail em background
        triggerStatusEmail({ id: orderSnap.id, ...orderData }, newStatus);
        toast.success(`Status atualizado para: ${newStatus}`);
      }
    } catch (error) {
      console.error("[STATUS DEBUG] ❌ Erro ao atualizar status:", error);
      toast.error("Erro ao atualizar status.");
    }
  };

  const formatDate = (timestamp: any) => {
    if (!timestamp) return '';
    try {
      const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
      return date.toLocaleString('pt-BR', {
        day: '2-digit',
        month: '2-digit',
        year: '2-digit',
        hour: '2-digit',
        minute: '2-digit'
      }).replace(',', '');
    } catch (e) {
      return '';
    }
  };

  const notifyCustomer = (order: any, type: 'preparando' | 'enviado' | 'validado' | 'pagamento') => {
    const cleanPhone = order.customerPhone.replace(/\D/g, '');
    let message = '';
    
    if (type === 'pagamento') {
      message = `Olá *${order.customerName.toUpperCase()}*!\n\n🛒 *RECEBEMOS SEU PEDIDO!*\n\nO pedido *#${order.id}* na *F PAC STORE* foi gerado com sucesso.\n\n🔗 *LINK PARA PAGAMENTO:*\n${order.paymentLink || '(Acesse o e-mail ou portal do cliente)'}\n\n⚠️ _Se já pagou, ignore esta mensagem._`;
    } else if (type === 'validado') {
      message = `Olá *${order.customerName.toUpperCase()}*!\n\n✅ *PAGAMENTO CONFIRMADO!*\n\nSeu pedido *#${order.id}* na *F PAC STORE* foi validado.\n\nAcompanhe aqui: ${getBaseUrl()}/#/order/${order.id}`;
    } else if (type === 'preparando') {
      message = `Olá *${order.customerName.toUpperCase()}*!\n\n🛠️ *ESTAMOS PREPARANDO SEU PEDIDO!*\n\nO pedido *#${order.id}* já entrou em produção e logo será enviado.\n\nAcompanhe: ${getBaseUrl()}/#/order/${order.id}`;
    } else if (type === 'enviado') {
      message = `Olá *${order.customerName.toUpperCase()}*!\n\n🚀 *SEU PEDIDO FOI ENVIADO!*\n\nO pedido *#${order.id}* já está a caminho. Em breve você receberá o código de rastreio.\n\nAcompanhe: ${getBaseUrl()}/#/order/${order.id}`;
    }

    window.open(`https://wa.me/${cleanPhone}?text=${encodeURIComponent(message)}`, '_blank');
  };

  const handleStatusUpdate = async (order: Order, status: string) => {
    await updateStatus(order.id, status);
    // WhatsApp manual
    if (status === 'validated') notifyCustomer(order, 'validado');
    if (status === 'processing') notifyCustomer(order, 'preparando');
    if (status === 'shipped') notifyCustomer(order, 'enviado');
  };

  const handleSendTestEmail = async () => {
    setIsSendingTest(true);
    
    // Feedback manual imediato
    console.log('[TESTE] Botão clicado. Iniciando requisição...');

    try {
      const response = await fetch(getApiUrl('/api/send-confirmation'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: 'fpacstore@gmail.com',
          customerName: 'CLIENTE TESTE ADMIN',
          orderId: 'TEST-ADMIN-' + Math.floor(Math.random() * 1000),
          items: [
            { name: 'TESTE DE SISTEMA', color: 'PRETO', size: 'G', quantity: 1, price: 0, printConfigs: [] }
          ],
          totals: {
            frete: 0,
            discount: 0,
            finalTotal: 0
          },
          status: 'pending'
        })
      });

      const result = await response.json();
      
      if (response.ok && result.success) {
        toast.success('E-mail de teste enviado!');
      } else {
        toast.error('Erro no servidor: ' + (result.error || 'Erro desconhecido'));
      }
    } catch (err: any) {
      console.error('[TESTE] Erro de rede:', err);
      toast.error('Erro de rede ao conectar com o servidor.');
    } finally {
      setIsSendingTest(false);
    }
  };

  const handleSaveIdentity = async () => {
    setIsUploading(true);
    try {
      await setDoc(doc(db, 'config', 'brand'), {
        ...identityFormData,
        updatedAt: serverTimestamp()
      }, { merge: true });
      toast.success('Identidade visual atualizada!');
    } catch (error) {
      console.error(error);
      toast.error('Erro ao salvar identidade.');
    } finally {
      setIsUploading(false);
    }
  };

  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const handleDeleteOrder = async (orderId: string) => {
    try {
      await deleteDoc(doc(db, 'orders', orderId));
      toast.success("Pedido excluído permanentemente.");
      setConfirmDeleteId(null);
    } catch (error: any) {
      console.error("Erro ao excluir pedido:", error);
      toast.error(`Erro: ${error.message || 'Não foi possível excluir'}`);
    }
  };

  const filteredOrders = orders.filter(order => {
    const matchesSearch = order.id.toLowerCase().includes(searchTerm.toLowerCase()) || order.customerName.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesStatus = statusFilter === 'all' || order.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  if (authLoading) return <div className="min-h-screen flex items-center justify-center"><Loader2 className="animate-spin text-[#eab308]" size={48} /></div>;

  if (!user || !isAdmin) {
    return (
      <div className="min-h-screen pt-32 flex flex-col items-center justify-center text-center px-4">
        {!user ? (
          <>
            <Package size={64} className="text-gray-300 mb-6" />
            <h1 className="text-3xl font-black uppercase mb-4">Gestão de Pedidos</h1>
            <button onClick={handleLogin} className="bg-black text-white px-8 py-3 font-bold uppercase hover:bg-[#eab308] hover:text-black transition-all">Entrar com Google</button>
          </>
        ) : (
          <>
            <XCircle size={64} className="text-red-500 mb-6" />
            <h1 className="text-3xl font-black uppercase mb-4">Acesso Negado</h1>
            <button onClick={handleLogout} className="text-gray-500 underline">Sair</button>
          </>
        )}
      </div>
    );
  }

  return (
    <div className="min-h-screen pt-32 md:pt-48 pb-24 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
      <div className="flex flex-col md:flex-row md:items-center justify-between mb-12 gap-6">
        <div>
          <h1 className="text-4xl font-black uppercase tracking-tighter">GESTÃO <span className="text-[#eab308]">F PAC</span></h1>
          <p className="text-gray-500 text-xs uppercase tracking-widest font-bold">Controle total da sua loja</p>
        </div>
      </div>

      <div className="flex border-b border-black/10 mb-8 overflow-x-auto scrollbar-none">
        <button onClick={() => setActiveTab('orders')} className={cn("px-8 py-4 text-[10px] font-black uppercase tracking-widest border-b-2 transition-all shrink-0", activeTab === 'orders' ? "border-[#eab308] text-black bg-black/[0.02]" : "border-transparent text-gray-400 hover:text-black")}>Pedidos</button>
        <button onClick={() => setActiveTab('products')} className={cn("px-8 py-4 text-[10px] font-black uppercase tracking-widest border-b-2 transition-all shrink-0", activeTab === 'products' ? "border-[#eab308] text-black bg-black/[0.02]" : "border-transparent text-gray-400 hover:text-black")}>Produtos</button>
        <button onClick={() => setActiveTab('stamps')} className={cn("px-8 py-4 text-[10px] font-black uppercase tracking-widest border-b-2 transition-all shrink-0", activeTab === 'stamps' ? "border-[#eab308] text-black bg-black/[0.02]" : "border-transparent text-gray-400 hover:text-black")}>Estampas</button>
        <button onClick={() => setActiveTab('identity')} className={cn("px-8 py-4 text-[10px] font-black uppercase tracking-widest border-b-2 transition-all shrink-0", activeTab === 'identity' ? "border-[#eab308] text-black bg-black/[0.02]" : "border-transparent text-gray-400 hover:text-black")}>Identidade</button>
      </div>

      {activeTab === 'orders' ? (
        <div className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
            <div className="md:col-span-2 relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
              <input type="text" placeholder="Buscar pedido..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} className="w-full pl-10 pr-4 py-3 border border-black/10 rounded-none text-sm" />
            </div>
            <select value={statusFilter} onChange={e => setStatusFilter(e.target.value as any)} className="w-full py-3 px-4 border border-black/10 rounded-none text-sm">
              <option value="all">Todos os Status</option>
              <option value="pending">Pendentes</option>
              <option value="validated">Validados</option>
              <option value="cancelled">Cancelados</option>
            </select>
          </div>

          {filteredOrders.map(order => (
            <div key={order.id} className="bg-white border border-black/10 p-6 flex flex-col md:flex-row gap-6 hover:shadow-lg transition-all">
               <div className="flex-1">
                  <div className="flex justify-between items-start mb-2">
                    <div className="flex flex-col gap-1">
                      <span className="text-[10px] font-black text-[#eab308] uppercase tracking-widest">#{order.id}</span>
                      <p className="text-[9px] font-bold text-gray-500 uppercase tracking-tighter">
                        {formatDate(order.createdAt)} 
                        {order.deliveredAt ? ` — ENTREGA: ${formatDate(order.deliveredAt)}` : ' — (AGUARDANDO ENTREGA)'}
                      </p>
                    </div>
                    <span className={cn("px-3 py-1 text-[8px] font-black uppercase tracking-[0.2em] rounded-full", 
                      order.status === 'delivered' ? 'bg-green-100 text-green-700 border border-green-200' : 
                      order.status === 'cancelled' ? 'bg-red-100 text-red-700 border border-red-200' :
                      order.status === 'validated' ? 'bg-blue-100 text-blue-700 border border-blue-200' :
                      order.status === 'processing' ? 'bg-purple-100 text-purple-700 border border-purple-200' :
                      order.status === 'shipped' ? 'bg-orange-100 text-orange-700 border border-orange-200' :
                      'bg-yellow-100 text-yellow-700 border border-yellow-200'
                    )}>{order.status === 'pending' ? 'AGUARDANDO PGTO' : order.status.toUpperCase()}</span>
                  </div>
                  
                  <div className="flex flex-col md:flex-row gap-8 mb-6">
                    <div className="flex-1">
                      <h3 className="text-xl font-black uppercase tracking-tight text-black flex items-center gap-2">
                        {order.customerName}
                        <a href={`https://wa.me/${order.customerPhone.replace(/\D/g, '')}`} target="_blank" className="text-green-500 hover:scale-110 transition-transform">
                          <ExternalLink size={16} />
                        </a>
                      </h3>
                      <p className="text-xs text-gray-400 font-bold mb-4">{order.customerEmail || 'Sem e-mail'}</p>
                      
                      <div className="bg-black/[0.02] border-l-2 border-black/10 p-3 mb-4">
                        <p className="text-[9px] font-black uppercase text-gray-400 mb-1">Endereço de Entrega</p>
                        <p className="text-[11px] font-medium leading-relaxed">
                          {typeof order.address === 'object' ? (
                            <>
                              {(order.address as any).street}, {order.number || (order.address as any).number} {order.complement || (order.address as any).complement ? `(${order.complement || (order.address as any).complement})` : ''}<br/>
                              {(order.address as any).neighborhood} — {(order.address as any).city}/{(order.address as any).state}<br/>
                              CEP: {(order.address as any).cep}
                            </>
                          ) : (
                            <>
                              {order.address}, {order.number} {order.complement ? `(${order.complement})` : ''}<br/>
                              {order.neighborhood} — {order.city}/{order.state}<br/>
                              CEP: {order.cep}
                            </>
                          )}
                        </p>
                      </div>
                    </div>

                    <div className="flex-1">
                      <div className="grid grid-cols-2 gap-4 text-[10px] uppercase font-bold text-gray-400">
                        <div>
                          <p className="text-black mb-1 border-b border-black/5 pb-1">Carrinho:</p>
                          <div className="space-y-1">
                            {order.items.map((it, idx) => (
                              <p key={idx} className="text-[11px] text-gray-600">
                                <span className="font-black text-black">{it.quantity}x</span> {it.name} <span className="text-[9px] bg-black/5 px-1">{it.size}</span>
                              </p>
                            ))}
                          </div>
                        </div>
                        <div>
                          <p className="text-black mb-1 border-b border-black/5 pb-1">Pagamento:</p>
                          <p className="text-[11px] text-black font-black mb-1">{order.paymentMethod || 'MERCADO PAGO'}</p>
                          <p className="text-black mb-1 mt-3 border-b border-black/5 pb-1">Total:</p>
                          <p className="text-xl text-black font-black tracking-tighter">R$ {order.total?.toFixed(2)}</p>
                        </div>
                      </div>
                    </div>
                  </div>
               </div>
               <div className="md:w-48 flex flex-col gap-2">
                  {order.status === 'pending' && (
                    <div className="flex flex-col gap-2">
                       <button onClick={() => handleStatusUpdate(order, 'validated')} className="w-full bg-green-600 text-white py-2 text-[10px] font-black uppercase tracking-widest hover:bg-green-700 transition-colors">Validar Pagamento</button>
                       <button 
                        onClick={() => notifyCustomer(order, 'pagamento')}
                        className="w-full bg-[#eab308] text-black py-2 text-[10px] font-black uppercase tracking-widest hover:bg-black hover:text-white transition-colors"
                       >
                         Enviar Link Pagto
                       </button>
                    </div>
                  )}
                  {order.status === 'validated' && (
                    <button onClick={() => handleStatusUpdate(order, 'processing')} className="w-full bg-blue-600 text-white py-2 text-[10px] font-black uppercase tracking-widest hover:bg-blue-700 transition-colors">Iniciar Produção</button>
                  )}
                  {order.status === 'processing' && (
                    <button onClick={() => handleStatusUpdate(order, 'shipped')} className="w-full bg-purple-600 text-white py-2 text-[10px] font-black uppercase tracking-widest hover:bg-purple-700 transition-colors">Marcar como Enviado</button>
                  )}
                  {order.status === 'shipped' && (
                    <button onClick={() => handleStatusUpdate(order, 'delivered')} className="w-full bg-green-800 text-white py-2 text-[10px] font-black uppercase tracking-widest hover:bg-green-900 transition-colors">Entregue</button>
                  )}
                  
                  <div className="grid grid-cols-2 gap-2">
                    <button 
                      onClick={() => notifyCustomer(order, order.status === 'validated' ? 'validado' : order.status === 'processing' ? 'preparando' : 'enviado')}
                      className="flex items-center justify-center gap-1 bg-green-500 text-white py-2 text-[8px] font-black uppercase tracking-widest hover:bg-green-600 transition-all"
                    >
                      WhatsApp
                    </button>
                    <button 
                      onClick={() => {
                        toast.promise(
                          triggerStatusEmail(order, order.status),
                          {
                            loading: 'Enviando e-mail...',
                            success: 'E-mail reenviado!',
                            error: 'Erro ao enviar e-mail'
                          }
                        )
                      }}
                      className="flex items-center justify-center gap-1 bg-gray-100 text-gray-600 py-2 text-[8px] font-black uppercase tracking-widest hover:bg-black hover:text-white transition-all"
                    >
                      Reenviar E-mail
                    </button>
                  </div>

                  {confirmDeleteId === order.id ? (
                    <div className="flex flex-col gap-2 p-2 bg-red-50 border border-red-200">
                      <p className="text-[9px] font-black text-red-600 uppercase text-center mb-1">Confirmar exclusão?</p>
                      <div className="grid grid-cols-2 gap-2">
                        <button 
                          onClick={() => handleDeleteOrder(order.id)} 
                          className="bg-red-600 text-white py-2 text-[10px] font-black uppercase hover:bg-red-700 transition-colors"
                        >
                          Sim
                        </button>
                        <button 
                          onClick={() => setConfirmDeleteId(null)} 
                          className="bg-gray-200 text-gray-600 py-2 text-[10px] font-black uppercase hover:bg-gray-300 transition-colors"
                        >
                          Não
                        </button>
                      </div>
                    </div>
                  ) : (
                    <>
                      <button onClick={() => updateStatus(order.id, 'cancelled')} className="w-full border border-red-600 text-red-600 py-2 text-[10px] font-black uppercase tracking-widest hover:bg-red-50 transition-colors">Cancelar</button>
                      <button 
                        onClick={() => setConfirmDeleteId(order.id)} 
                        className="w-full flex items-center justify-center gap-2 border border-red-600 text-red-600 py-2 text-[10px] font-black uppercase tracking-widest hover:bg-red-600 hover:text-white transition-all"
                      >
                        <Trash2 size={12} /> Excluir Pedido
                      </button>
                    </>
                  )}
               </div>
            </div>
          ))}
        </div>
      ) : activeTab === 'products' ? (
        <div className="space-y-12">
          {/* Inventory Items Management using Dynamic Products */}
          <section>
            <h2 className="text-xl font-black uppercase mb-8 flex items-center gap-2">Gerenciar Catálogo de Produtos</h2>
            <div className="flex flex-col gap-8">
              {currentProducts.map(p => {
                const available = isAvailable(p.id);
                const itemInventory = inventory[p.id];
                
                return (
                  <div key={p.id} className="bg-white border border-black/10 overflow-hidden group">
                    <div className="p-6 bg-black/[0.02] border-b border-black/10 flex items-center justify-between">
                       <div className="flex items-center gap-4">
                         <div className="w-16 h-16 bg-black/5 flex-shrink-0">
                           <img src={p.images?.[0] || undefined} className={cn("w-full h-full object-contain grayscale", available && "grayscale-0")} />
                         </div>
                         <div>
                           <h4 className="font-heading font-black text-lg uppercase truncate">{p.name || 'Sem Nome'}</h4>
                           <span className={cn("text-[10px] font-bold uppercase tracking-widest", available ? "text-green-600" : "text-red-500")}>
                             {available ? 'Visível na Loja' : 'Oculto na Loja'}
                           </span>
                         </div>
                       </div>
                       <div className="flex items-center gap-2">
                         <button 
                           onClick={() => toggleAvailability(p.id, available)} 
                           className={cn("flex items-center gap-2 px-6 py-2.5 text-[10px] font-black uppercase tracking-widest transition-all border-2", available ? "border-red-500 bg-red-500/10 text-red-500 hover:bg-red-500 hover:text-white" : "border-green-600 bg-green-600/10 text-green-600 hover:bg-green-600 hover:text-white")}
                         >
                           {available ? <XCircle size={14} /> : <CheckCircle size={14} />}
                           {available ? 'Bloquear' : 'Desbloquear'}
                         </button>
                         <button 
                           onClick={async () => {
                             if(confirm(`Excluir ${p.name}?`)) {
                               await deleteDoc(doc(db, 'products', p.id));
                               toast.success('Produto removido');
                             }
                           }}
                           className="p-2 bg-red-500/10 text-red-500 hover:bg-red-500 hover:text-white transition-all"
                         >
                           <Trash2 size={14} />
                         </button>
                       </div>
                    </div>

                    <div className="p-6">
                      {/* Image Management Section */}
                      <div className="mb-8 border-b border-black/5 pb-8">
                        <div className="flex items-center justify-between mb-4">
                          <h5 className="text-[10px] font-black uppercase tracking-[0.2em] text-black">Galeria de Imagens</h5>
                          <button 
                            onClick={() => {
                              if (editingImagesId === p.id) {
                                setEditingImagesId(null);
                              } else {
                                setEditingImagesId(p.id);
                                setTempImages([...(p.images || [])]);
                                setTempStampGallery([...(p.stampGallery || ['', '', '', ''])]);
                              }
                            }}
                            className="text-[10px] font-bold uppercase text-[#eab308] hover:underline"
                          >
                            {editingImagesId === p.id ? 'Cancelar' : 'Gerenciar Imagens'}
                          </button>
                        </div>
                        
                        {editingImagesId === p.id ? (
                          <div className="space-y-6">
                            <div className="space-y-4">
                              <label className="text-[8px] font-black uppercase text-gray-400 block mb-2">Fotos do Modelo</label>
                              {tempImages.map((img, idx) => (
                                <div key={idx} className="flex flex-col gap-2">
                                  <div className="flex gap-2">
                                    <input 
                                      type="text" 
                                      value={img} 
                                      onChange={(e) => {
                                        const newImgs = [...tempImages];
                                        newImgs[idx] = e.target.value;
                                        setTempImages(newImgs);
                                      }}
                                      className="flex-1 px-3 py-2 border border-black/10 text-xs focus:outline-none focus:border-[#eab308]"
                                      placeholder="URL da Imagem"
                                    />
                                    <button 
                                      onClick={() => setTempImages(tempImages.filter((_, i) => i !== idx))}
                                      className="p-2 text-red-500 hover:bg-red-50 transition-colors"
                                    >
                                      <Trash2 size={16} />
                                    </button>
                                  </div>
                                  {img && (
                                    <div className="w-24 aspect-[3/4] border border-black/5 flex-shrink-0 mb-2 overflow-hidden bg-black/5">
                                      <img src={img || undefined} className="w-full h-full object-contain" />
                                    </div>
                                  )}
                                </div>
                              ))}
                              <div className="flex flex-wrap gap-4">
                                <button 
                                  onClick={() => setTempImages([...tempImages, ''])}
                                  className="text-[10px] font-black uppercase tracking-widest flex items-center gap-2 px-3 py-2 bg-gray-100 border border-black/10 hover:bg-black hover:text-white transition-all"
                                >
                                  <Plus size={14} /> Link Manual
                                </button>
                                
                                <label className="text-[10px] font-black uppercase tracking-widest flex items-center gap-2 px-3 py-2 bg-[#eab308]/10 text-[#eab308] border border-[#eab308]/20 hover:bg-[#eab308] hover:text-black cursor-pointer transition-all">
                                  <Upload size={14} /> 
                                  {isUploading ? 'Subindo...' : 'Subir Imagem'}
                                  <input 
                                    type="file" 
                                    className="hidden" 
                                    accept="image/*"
                                    disabled={isUploading}
                                    onChange={async (e) => {
                                      const file = e.target.files?.[0];
                                      if (file) {
                                        const url = await handleFileUpload(file, 'products');
                                        setTempImages([...tempImages, url]);
                                      }
                                    }}
                                  />
                                </label>
                              </div>
                            </div>

                            {(p.slug === 'force' || p.slug === 'mark' || p.name?.toUpperCase().includes('FORCE') || p.name?.toUpperCase().includes('MARK')) && (
                              <div className="space-y-4 pt-4 border-t border-black/5">
                                <label className="text-[8px] font-black uppercase text-[#eab308] block mb-2">Galeria de Estampas (4 Cards)</label>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                  {[0, 1, 2, 3].map((idx) => (
                                    <div key={idx} className="flex flex-col gap-2 bg-black/[0.02] p-2 border border-black/5">
                                      <div className="flex gap-2">
                                        <input 
                                          type="text" 
                                          value={tempStampGallery[idx] || ''} 
                                          onChange={(e) => {
                                            const newStamps = [...tempStampGallery];
                                            while (newStamps.length < 4) newStamps.push('');
                                            newStamps[idx] = e.target.value;
                                            setTempStampGallery(newStamps);
                                          }}
                                          className="flex-1 px-3 py-2 border border-black/10 text-[10px] focus:outline-none focus:border-[#eab308]"
                                          placeholder={`Estampa ${idx + 1}`}
                                        />
                                        <label className="p-2 bg-black/5 text-black hover:bg-black hover:text-white cursor-pointer transition-colors">
                                          <Upload size={12} />
                                          <input 
                                            type="file" 
                                            className="hidden" 
                                            accept="image/*"
                                            disabled={isUploading}
                                            onChange={async (e) => {
                                              const file = e.target.files?.[0];
                                              if (file) {
                                                try {
                                                  const url = await handleFileUpload(file, 'estampas');
                                                  const newStamps = [...tempStampGallery];
                                                  while (newStamps.length < 4) newStamps.push('');
                                                  newStamps[idx] = url;
                                                  setTempStampGallery(newStamps);
                                                } catch (err) {
                                                  console.error("Card upload error:", err);
                                                }
                                              }
                                            }}
                                          />
                                        </label>
                                      </div>
                                      {tempStampGallery[idx] && (
                                        <div className="w-20 aspect-[3/4] bg-white border border-black/5 mt-1 overflow-hidden">
                                          <img src={tempStampGallery[idx] || undefined} className="w-full h-full object-contain" />
                                        </div>
                                      )}
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )}

                            <div className="pt-6 border-t border-black/5 flex justify-end gap-4">
                              <button 
                                onClick={() => setEditingImagesId(null)}
                                className="px-4 py-2 text-[10px] font-black uppercase tracking-widest border border-black/10 hover:bg-gray-100 transition-colors"
                              >
                                Cancelar
                              </button>
                              <button 
                                onClick={() => handleSaveImages(p)}
                                className={cn(
                                  "px-6 py-2 text-[10px] font-black uppercase tracking-widest flex items-center gap-2 transition-all",
                                  isUploading ? "bg-gray-200 text-gray-400 cursor-not-allowed" : "bg-black text-white hover:bg-[#eab308] hover:text-black"
                                )}
                                disabled={isUploading}
                              >
                                {isUploading ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />} 
                                {isUploading ? 'Salvando...' : 'Salvar Alterações'}
                              </button>
                            </div>
                          </div>
                        ) : (
                          <div className="flex flex-col gap-4">
                             <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-none">
                                {p.images?.map((img: string, idx: number) => (
                                  <div key={idx} className="w-16 h-16 bg-black/5 flex-shrink-0">
                                    <img src={img || undefined} className="w-full h-full object-contain" />
                                  </div>
                                ))}
                             </div>
                             {p.stampGallery && p.stampGallery.some((s: string) => s) && (
                               <div className="mt-2">
                                  <h6 className="text-[7px] font-black uppercase text-gray-400 mb-2">Stamps Ativos:</h6>
                                  <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-none">
                                    {p.stampGallery.filter((s: string) => s).map((img: string, idx: number) => (
                                      <div key={idx} className="w-10 h-10 bg-black/5 flex-shrink-0 border border-black/5">
                                        <img src={img || undefined} className="w-full h-full object-contain" />
                                      </div>
                                    ))}
                                  </div>
                               </div>
                             )}
                          </div>
                        )}
                      </div>

                      <div className="mb-6 flex gap-4">
                         <div className="flex-1">
                            <label className="text-[10px] font-black uppercase text-gray-400 block mb-2 tracking-widest">Estoque Total Ativo (Soma das Variantes Disponíveis)</label>
                            <div className="flex items-center gap-2">
                               <input 
                                 type="number" 
                                 value={itemInventory?.stock ?? 0} 
                                 readOnly
                                 className="w-full px-4 py-2 border border-black/10 text-sm font-bold bg-gray-50 text-gray-400 cursor-not-allowed outline-none"
                               />
                            </div>
                         </div>
                      </div>

                      <div className="space-y-6">
                        <div className="flex items-center justify-between">
                          <h5 className="text-[10px] font-black uppercase tracking-[0.2em] text-black">Controle por Variante (Cor / Tamanho)</h5>
                          {(!p.colors || p.colors.length === 0) && (
                            <span className="text-[8px] font-bold text-red-500 uppercase">⚠️ Nenhuma cor definida no cadastro</span>
                          )}
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
                          {((p.colors && p.colors.length > 0) ? p.colors : (staticProducts.find(sp => sp.slug === p.slug)?.colors || [{ name: 'Padrão', hex: '#000000' }])).map((color: any) => (
                            ((p.sizes && p.sizes.length > 0) ? p.sizes : (staticProducts.find(sp => sp.slug === p.slug)?.sizes || ['P', 'M', 'G', 'GG'])).map((size: string) => {
                              const variantKey = `${color.name}_${size}`;
                              const vData = itemInventory?.variants?.[variantKey];
                              const vAvailable = vData?.available ?? true;
                              const vStock = vData?.stock ?? (itemInventory?.stock ?? 0);
                              
                              return (
                                <div key={variantKey} className={cn("p-3 border transition-all", vAvailable ? "border-black/5 bg-white" : "border-red-500/20 bg-red-500/[0.02] opacity-60")}>
                                  <div className="flex items-center justify-between mb-3">
                                    <div className="flex items-center gap-2">
                                      <div className="w-3 h-3 rounded-full border border-black/10" style={{ backgroundColor: color.hex }} />
                                      <span className="text-[10px] font-black uppercase">{color.name} / {size}</span>
                                    </div>
                                    <VariantToggle 
                                      id={p.id} 
                                      variantKey={variantKey} 
                                      available={vAvailable} 
                                      stock={vStock}
                                    />
                                  </div>
                                  <div className="flex items-center gap-2">
                                     <span className="text-[8px] font-black uppercase text-gray-400">Qtd:</span>
                                     <StockInput 
                                       initialValue={vStock} 
                                       onSave={(val) => {
                                         updateVariantStock(p.id, variantKey, val);
                                       }}
                                       className="w-full bg-transparent border-b border-black/10 text-[10px] font-bold focus:outline-none focus:border-[#eab308]"
                                     />
                                  </div>
                                </div>
                              );
                            })
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        </div>
      ) : activeTab === 'stamps' ? (
        <div className="space-y-12">
          <section>
             <div className="flex flex-col md:flex-row md:items-center justify-between mb-8 gap-4">
                <h2 className="text-xl font-black uppercase flex items-center gap-2">Disponibilidade de Estampas ({numSlots} Slots)</h2>
                <button 
                  onClick={() => setNumSlots(prev => prev + 1)}
                  className="flex items-center gap-2 bg-[#eab308] text-black px-4 py-2 text-[10px] font-black uppercase tracking-widest hover:bg-black hover:text-[#eab308] transition-all"
                >
                  <Plus size={14} /> Adicionar Novo Slot
                </button>
             </div>
             
             <DndContext 
               sensors={sensors}
               collisionDetection={closestCenter}
               onDragEnd={handleDragEnd}
             >
               <SortableContext 
                 items={Array.from({ length: numSlots }, (_, i) => `slot-${i + 1}`)}
                 strategy={rectSortingStrategy}
               >
                 <div className="space-y-12">
                   {/* Destaques (1 & 2) */}
                   <div className="bg-black/5 p-4 rounded-xl">
                     <h3 className="text-[10px] font-black uppercase tracking-[0.3em] mb-4 text-black/40">Destaques Principais (Slots 1 & 2)</h3>
                     <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-2 gap-3">
                       {[1, 2].map(slotIndex => {
                         const estampa = dynamicEstampas.find(e => e.slotIndex === slotIndex);
                         const estampaId = estampa?.id || '';
                         const available = isAvailable(estampaId || `slot-${slotIndex}`);
                         const isEditing = editingEstampaId === (estampaId || `slot-${slotIndex}`);
                         const imageUrl = estampa?.image || estampa?.path || '';
                         return (
                           <DraggableSlot 
                             key={`slot-${slotIndex}`}
                             slotIndex={slotIndex}
                             estampa={estampa}
                             available={available}
                             isEditing={isEditing}
                             isUploading={isUploading}
                             imageUrl={imageUrl}
                             handleFileUpload={handleFileUpload}
                             handleSaveEstampaImage={handleSaveEstampaImage}
                             handleDeleteEstampa={handleDeleteEstampa}
                             toggleAvailability={toggleAvailability}
                             setEditingEstampaId={setEditingEstampaId}
                             setTempEstampaImage={setTempEstampaImage}
                             tempEstampaImage={tempEstampaImage}
                             getStock={getStock}
                             updateStock={updateStock}
                           />
                         );
                       })}
                     </div>
                   </div>

                   {/* Categorized Slots (3+) */}
                   {(() => {
                     const categories = [
                       { id: 'peito', label: 'PEITO', value: 'PEITO LE/LD' },
                       { id: 'central', label: 'CENTRAL', value: 'PEITO CENTRAL' },
                       { id: 'costas', label: 'COSTAS', value: 'COSTAS' },
                       { id: 'ombro', label: 'OMBRO', value: 'OMBRO' },
                     ];

                     const slotsFrom3 = Array.from({ length: numSlots - 2 }, (_, i) => i + 3);
                     const categorizedSlotIndices = new Set();

                     return (
                       <div className="space-y-12">
                         {categories.map(cat => {
                           const slotsInCat = slotsFrom3.filter(slotIndex => {
                             const estampa = dynamicEstampas.find(e => e.slotIndex === slotIndex);
                             return estampa?.position && estampa.position.split(',').includes(cat.value);
                           });

                           if (slotsInCat.length === 0) return null;
                           slotsInCat.forEach(s => categorizedSlotIndices.add(s));

                           return (
                             <div key={cat.id}>
                               <h3 className="text-[10px] font-black uppercase tracking-[0.3em] mb-4 text-black/40">Identidades {cat.label}</h3>
                               <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                                 {slotsInCat.map(slotIndex => {
                                   const estampa = dynamicEstampas.find(e => e.slotIndex === slotIndex);
                                   const estampaId = estampa?.id || '';
                                   const available = isAvailable(estampaId || `slot-${slotIndex}`);
                                   const isEditing = editingEstampaId === (estampaId || `slot-${slotIndex}`);
                                   const imageUrl = estampa?.image || estampa?.path || '';
                                   return (
                                     <DraggableSlot 
                                       key={`slot-${slotIndex}`}
                                       slotIndex={slotIndex}
                                       estampa={estampa}
                                       available={available}
                                       isEditing={isEditing}
                                       isUploading={isUploading}
                                       imageUrl={imageUrl}
                                       handleFileUpload={handleFileUpload}
                                       handleSaveEstampaImage={handleSaveEstampaImage}
                                       handleDeleteEstampa={handleDeleteEstampa}
                                       toggleAvailability={toggleAvailability}
                                       setEditingEstampaId={setEditingEstampaId}
                                       setTempEstampaImage={setTempEstampaImage}
                                       tempEstampaImage={tempEstampaImage}
                                       getStock={getStock}
                                       updateStock={updateStock}
                                     />
                                   );
                                 })}
                               </div>
                             </div>
                           );
                         })}

                         {/* Outros / Vazios */}
                         {(() => {
                           const remainingSlots = slotsFrom3.filter(s => !categorizedSlotIndices.has(s));
                           if (remainingSlots.length === 0) return null;

                           return (
                             <div>
                               <h3 className="text-[10px] font-black uppercase tracking-[0.3em] mb-4 text-black/40">Outros / Slots Vazios</h3>
                               <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                                 {remainingSlots.map(slotIndex => {
                                   const estampa = dynamicEstampas.find(e => e.slotIndex === slotIndex);
                                   const estampaId = estampa?.id || '';
                                   const available = isAvailable(estampaId || `slot-${slotIndex}`);
                                   const isEditing = editingEstampaId === (estampaId || `slot-${slotIndex}`);
                                   const imageUrl = estampa?.image || estampa?.path || '';
                                   return (
                                     <DraggableSlot 
                                       key={`slot-${slotIndex}`}
                                       slotIndex={slotIndex}
                                       estampa={estampa}
                                       available={available}
                                       isEditing={isEditing}
                                       isUploading={isUploading}
                                       imageUrl={imageUrl}
                                       handleFileUpload={handleFileUpload}
                                       handleSaveEstampaImage={handleSaveEstampaImage}
                                       handleDeleteEstampa={handleDeleteEstampa}
                                       toggleAvailability={toggleAvailability}
                                       setEditingEstampaId={setEditingEstampaId}
                                       setTempEstampaImage={setTempEstampaImage}
                                       tempEstampaImage={tempEstampaImage}
                                       getStock={getStock}
                                       updateStock={updateStock}
                                     />
                                   );
                                 })}
                               </div>
                             </div>
                           );
                         })()}
                       </div>
                     );
                   })()}
                 </div>
               </SortableContext>
             </DndContext>
          </section>
        </div>
      ) : (
        <div className="space-y-12">
          <section>
             <h2 className="text-xl font-black uppercase mb-8 flex items-center gap-2">Identidade Visual do Site</h2>
             <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                {/* Hero Background */}
                <div className="bg-white border p-6 flex flex-col gap-4">
                   <div className="flex justify-between items-center">
                      <h3 className="text-xs font-black uppercase tracking-widest">Banner Inicial (Background)</h3>
                   </div>
                   <div className="aspect-video bg-black/5 overflow-hidden flex items-center justify-center relative group">
                      {identityFormData.heroUrl ? (
                        <img src={identityFormData.heroUrl || undefined} className="w-full h-full object-contain" />
                      ) : <ImageIcon className="text-gray-200" size={48} />}
                   </div>
                   <div className="flex gap-2">
                      <input 
                        type="text" 
                        value={identityFormData.heroUrl}
                        onChange={e => setIdentityFormData({...identityFormData, heroUrl: e.target.value})}
                        className="flex-1 px-3 py-2 border border-black/10 text-[10px] focus:outline-none focus:border-[#eab308]"
                        placeholder="URL da Imagem"
                      />
                      <label className="bg-black text-white px-4 py-2 cursor-pointer hover:bg-[#eab308] hover:text-black transition-all">
                        <Upload size={14} />
                        <input 
                          type="file" 
                          className="hidden" 
                          accept="image/*"
                          onChange={async (e) => {
                            const file = e.target.files?.[0];
                            if (file) {
                              const url = await handleFileUpload(file, 'identity');
                              setIdentityFormData({...identityFormData, heroUrl: url});
                            }
                          }}
                        />
                      </label>
                   </div>
                </div>
                                    {/* About Section Image */}
                <div className="bg-white border p-6 flex flex-col gap-4">
                   <div className="flex justify-between items-center">
                      <h3 className="text-xs font-black uppercase tracking-widest">Seção Sobre (Imagem PDV)</h3>
                   </div>
                   <div className="aspect-video bg-black/5 overflow-hidden flex items-center justify-center relative group">
                      {identityFormData.aboutUrl ? (
                        <img src={identityFormData.aboutUrl || undefined} className="w-full h-full object-contain" />
                      ) : <ImageIcon className="text-gray-200" size={48} />}
                   </div>
                   <div className="flex gap-2">
                      <input 
                        type="text" 
                        value={identityFormData.aboutUrl}
                        onChange={e => setIdentityFormData({...identityFormData, aboutUrl: e.target.value})}
                        className="flex-1 px-3 py-2 border border-black/10 text-[10px] focus:outline-none focus:border-[#eab308]"
                        placeholder="URL da Imagem"
                      />
                      <label className="bg-black text-white px-4 py-2 cursor-pointer hover:bg-[#eab308] hover:text-black transition-all">
                        <Upload size={14} />
                        <input 
                          type="file" 
                          className="hidden" 
                          accept="image/*"
                          onChange={async (e) => {
                            const file = e.target.files?.[0];
                            if (file) {
                              const url = await handleFileUpload(file, 'identity');
                              setIdentityFormData({...identityFormData, aboutUrl: url});
                            }
                          }}
                        />
                      </label>
                   </div>
                </div>

                {/* Catalog Images */}
                <div className="bg-white border p-6 flex flex-col gap-4">
                   <div className="flex justify-between items-center">
                      <h3 className="text-xs font-black uppercase tracking-widest">Card Catálogo 1</h3>
                   </div>
                   <div className="aspect-video bg-black/5 overflow-hidden flex items-center justify-center relative group">
                      {identityFormData.catalogImage1 ? (
                        <img src={identityFormData.catalogImage1 || undefined} className="w-full h-full object-contain" />
                      ) : <ImageIcon className="text-gray-200" size={48} />}
                   </div>
                   <div className="flex gap-2">
                      <input 
                        type="text" 
                        value={identityFormData.catalogImage1}
                        onChange={e => setIdentityFormData({...identityFormData, catalogImage1: e.target.value})}
                        className="flex-1 px-3 py-2 border border-black/10 text-[10px] focus:outline-none focus:border-[#eab308]"
                        placeholder="URL da Imagem"
                      />
                      <label className="bg-black text-white px-4 py-2 cursor-pointer hover:bg-[#eab308] hover:text-black transition-all">
                        <Upload size={14} />
                        <input 
                          type="file" 
                          className="hidden" 
                          accept="image/*"
                          onBlur={() => {}}
                          onChange={async (e) => {
                            const file = e.target.files?.[0];
                            if (file) {
                              const url = await handleFileUpload(file, 'identity');
                              setIdentityFormData({...identityFormData, catalogImage1: url});
                            }
                          }}
                        />
                      </label>
                   </div>
                </div>

                <div className="bg-white border p-6 flex flex-col gap-4">
                   <div className="flex justify-between items-center">
                      <h3 className="text-xs font-black uppercase tracking-widest">Card Catálogo 2</h3>
                   </div>
                   <div className="aspect-video bg-black/5 overflow-hidden flex items-center justify-center relative group">
                      {identityFormData.catalogImage2 ? (
                        <img src={identityFormData.catalogImage2 || undefined} className="w-full h-full object-contain" />
                      ) : <ImageIcon className="text-gray-200" size={48} />}
                   </div>
                   <div className="flex gap-2">
                      <input 
                        type="text" 
                        value={identityFormData.catalogImage2}
                        onChange={e => setIdentityFormData({...identityFormData, catalogImage2: e.target.value})}
                        className="flex-1 px-3 py-2 border border-black/10 text-[10px] focus:outline-none focus:border-[#eab308]"
                        placeholder="URL da Imagem"
                      />
                      <label className="bg-black text-white px-4 py-2 cursor-pointer hover:bg-[#eab308] hover:text-black transition-all">
                        <Upload size={14} />
                        <input 
                          type="file" 
                          className="hidden" 
                          accept="image/*"
                          onChange={async (e) => {
                            const file = e.target.files?.[0];
                            if (file) {
                              const url = await handleFileUpload(file, 'identity');
                              setIdentityFormData({...identityFormData, catalogImage2: url});
                            }
                          }}
                        />
                      </label>
                   </div>
                </div>

                {/* Community Grid */}
                <div className="bg-white border p-6 flex flex-col gap-4 md:col-span-2">
                   <h3 className="text-xs font-black uppercase tracking-widest mb-4">Galeria da HISTÓRIA (#Community)</h3>
                   <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                      {identityFormData.communityUrls.map((url, idx) => (
                        <div key={idx} className="space-y-2">
                           <div className="aspect-square bg-black/5 overflow-hidden flex items-center justify-center relative group">
                              {url ? (
                                <img src={url || undefined} className="w-full h-full object-contain" />
                              ) : <ImageIcon className="text-gray-100" size={24} />}
                           </div>
                           <div className="flex gap-1">
                              <input 
                                type="text" 
                                value={url}
                                onChange={e => {
                                  const newUrls = [...identityFormData.communityUrls];
                                  newUrls[idx] = e.target.value;
                                  setIdentityFormData({...identityFormData, communityUrls: newUrls});
                                }}
                                className="flex-1 px-2 py-1 border border-black/10 text-[8px] focus:outline-none focus:border-[#eab308]"
                                placeholder={`Imagem ${idx + 1}`}
                              />
                              <label className="bg-black text-white p-2 cursor-pointer hover:bg-[#eab308] hover:text-black transition-all">
                                <Upload size={10} />
                                <input 
                                  type="file" 
                                  className="hidden" 
                                  accept="image/*"
                                  onChange={async (e) => {
                                    const file = e.target.files?.[0];
                                    if (file) {
                                      const url = await handleFileUpload(file, 'identity');
                                      const newUrls = [...identityFormData.communityUrls];
                                      newUrls[idx] = url;
                                      setIdentityFormData({...identityFormData, communityUrls: newUrls});
                                    }
                                  }}
                                />
                              </label>
                           </div>
                        </div>
                      ))}
                   </div>
                </div>
             </div>
             
             <div className="mt-12 flex justify-center">
                <button 
                  onClick={handleSaveIdentity}
                  disabled={isUploading}
                  className="bg-black text-white px-12 py-4 font-black uppercase tracking-[0.2em] hover:bg-[#eab308] hover:text-black transition-all disabled:bg-gray-300 disabled:text-gray-500"
                >
                  {isUploading ? 'Salvando...' : 'Salvar Toda Identidade'}
                </button>
             </div>
          </section>
        </div>
      )}
    </div>
  );
}
