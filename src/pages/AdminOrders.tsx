import React, { useState, useEffect } from 'react';
import { db, auth, storage } from '../lib/firebase';
import { collection, query, orderBy, onSnapshot, doc, updateDoc, deleteDoc, getDocs, setDoc, getDoc, Timestamp, serverTimestamp } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { signInWithPopup, GoogleAuthProvider, onAuthStateChanged, signOut } from 'firebase/auth';
import { Package, Search, CheckCircle, XCircle, Clock, ExternalLink, LogOut, Loader2, Trash2, Box, Image as ImageIcon, Palette, Maximize2, ToggleLeft, ToggleRight, Plus, Upload, Save, GripVertical, Mail, MessageCircle, RefreshCw, ChevronDown, ChevronUp } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
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

const PRIME_LOCATIONS = ["Frente", "Costas", "Manga", "Peito", "Barra"];

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
  address: any; // Can be string or object
  number?: string;
  complement?: string;
  neighborhood?: string;
  city?: string;
  state?: string;
  cep?: string;
  items: any[];
  subtotal: number;
  shipping: number;
  couponDiscount?: number;
  pixDiscount?: number;
  flashSaleDiscount?: number;
  total: number;
  paymentMethod: string;
  status: 'received' | 'payment_pending' | 'payment_approved' | 'Aguardando Pagamento PIX' | 'Pagamento Aprovado' | 'Pagamento Não Realizado' | 'processing' | 'shipped' | 'delivered' | 'cancelled';
  createdAt: any;
  updatedAt?: any;
  deliveredAt?: any;
  paymentLink?: string;
  observations?: string;
}

import { getApiUrl, getBaseUrl } from '../lib/api';

// Move DraggableSlot outside for focus stability.
const StockInput = ({ initialValue, onSave, className }: { initialValue: number, onSave: (val: number) => void, className?: string }) => {
  const [localValue, setLocalValue] = useState(initialValue ?? 0);

  useEffect(() => {
    setLocalValue(initialValue ?? 0);
  }, [initialValue]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = Math.max(0, parseInt(e.target.value) || 0);
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
      min="0"
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
  const [tempAllowedLocations, setTempAllowedLocations] = useState<string[]>(estampa?.allowedLocations || []);
  const [tempLocationConfigs, setTempLocationConfigs] = useState<any>(estampa?.locationConfigs || {});
  
  // Sync local state when estampa changes or editing mode is triggered
  useEffect(() => {
    if (estampa) {
      setTempAllowedLocations(estampa.allowedLocations || []);
      setTempLocationConfigs(estampa.locationConfigs || {});
    } else {
      setTempAllowedLocations([]);
      setTempLocationConfigs({});
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
        "bg-white border border-black/5 p-4 flex flex-col group relative transition-all duration-300", 
        "hover:border-black/20 hover:shadow-md",
        !imageUrl && "border-dashed border-gray-200 opacity-60",
        isDragging && "shadow-2xl border-[#eab308] opacity-90 scale-105 z-50",
        "aspect-square"
      )}
    >
      <div className="absolute top-2 left-2 z-10 flex items-center gap-2">
        <div {...attributes} {...listeners} className="cursor-grab active:cursor-grabbing p-1.5 bg-black/5 rounded hover:bg-black/10 transition-colors">
          <GripVertical size={12} className="text-gray-400" />
        </div>
        <span className="text-[9px] font-black bg-black text-white px-2 py-0.5 uppercase tracking-widest leading-none">#{slotIndex}</span>
      </div>

      <div className="flex-1 bg-black/[0.02] mt-8 mb-3 group relative overflow-hidden flex items-center justify-center p-4">
        {imageUrl ? (
          <img 
            src={imageUrl || undefined} 
            className={cn(
              "w-full h-full object-contain transition-all duration-500", 
              !available && "grayscale opacity-40",
              "group-hover:scale-110"
            )} 
          />
        ) : (
          <div className="text-gray-200 flex flex-col items-center">
            <ImageIcon size={32} className="mb-2" />
            <span className="text-[8px] font-black uppercase tracking-widest">Livre</span>
          </div>
        )}
        
        {/* Quick Edit Overlay */}
        <div className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
          <button 
            onClick={() => {
              setEditingEstampaId(isEditing ? null : (estampaId || `slot-${slotIndex}`));
              setTempEstampaImage(imageUrl);
            }}
            className="bg-white text-black text-[10px] font-black uppercase px-5 py-2.5 shadow-xl hover:bg-[#eab308] transition-colors"
          >
            {isEditing ? 'Fechar' : 'Gerenciar'}
          </button>
        </div>
      </div>
      
      {isEditing ? (
        <div className="absolute inset-0 z-[60] bg-white p-3 flex flex-col overflow-y-auto scrollbar-none shadow-2xl border-2 border-black">
          <div className="flex items-center justify-between mb-4">
             <h4 className="text-[8px] font-black uppercase tracking-widest">Configuração #{slotIndex}</h4>
             <button onClick={() => setEditingEstampaId(null)}><XCircle size={14} className="text-gray-400" /></button>
          </div>

          <div className="space-y-3">
             <div className="space-y-1">
               <label className="text-[6px] font-black uppercase text-gray-400">Nome</label>
               <input 
                type="text" 
                defaultValue={estampa?.name || ''}
                id={`name-${slotIndex}`}
                className="w-full px-2 py-1.5 border border-black/10 text-[9px] uppercase font-bold focus:outline-none focus:border-[#eab308] bg-gray-50"
                placeholder="Ex: Logo Peito"
              />
             </div>

             <div className="space-y-1">
               <label className="text-[6px] font-black uppercase text-gray-400">URL ou Upload</label>
               <div className="flex gap-1">
                 <input 
                  type="text" 
                  value={tempEstampaImage} 
                  onChange={(e) => setTempEstampaImage(e.target.value)}
                  className="flex-1 px-2 py-1.5 border border-black/10 text-[8px] focus:outline-none focus:border-[#eab308] bg-gray-50"
                  placeholder="URL da Imagem"
                />
                <label className="aspect-square bg-black text-white p-1.5 cursor-pointer hover:bg-[#eab308] hover:text-black transition-all flex items-center justify-center shrink-0">
                  <Upload size={12} />
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
               </div>
             </div>

             <div className="pt-2 border-t border-black/5 space-y-2">
                <label className="text-[6px] font-black uppercase text-gray-400">Locatários & Dimensões</label>
                <div className="grid grid-cols-1 gap-1">
                  {PRIME_LOCATIONS.map(loc => {
                    const isActive = tempAllowedLocations.includes(loc);
                    return (
                      <div key={loc} 
                        className={cn(
                          "border transition-all",
                          isActive ? "bg-black/[0.02] border-black/20" : "bg-white border-black/5 opacity-50"
                        )}
                      >
                        <button 
                          onClick={() => {
                            let locations = [...tempAllowedLocations];
                            let newConfigs = { ...tempLocationConfigs };
                            if (isActive) {
                              locations = locations.filter(l => l !== loc);
                            } else {
                              locations.push(loc);
                              if (!newConfigs[loc]) {
                                newConfigs[loc] = { sizes: ['', '', '', ''] };
                              }
                            }
                            setTempAllowedLocations(locations);
                            setTempLocationConfigs(newConfigs);
                          }}
                          className="w-full p-1.5 flex items-center justify-between text-left"
                        >
                          <span className="text-[7px] font-black uppercase tracking-widest">{loc}</span>
                          <div className={cn("w-1.5 h-1.5 rounded-full", isActive ? "bg-[#eab308]" : "bg-gray-200")} />
                        </button>
                        
                        {isActive && (
                          <div className="p-1.5 pt-0 grid grid-cols-4 gap-1">
                            {[0, 1, 2, 3].map(idx => (
                              <input 
                                 key={idx}
                                 type="text"
                                 placeholder={`T${idx + 1}`}
                                 value={tempLocationConfigs[loc]?.sizes?.[idx] || ''}
                                 onChange={(e) => {
                                   const newConfigs = { ...tempLocationConfigs };
                                   const locConfig = { ...(newConfigs[loc] || { sizes: ['', '', '', ''] }) };
                                   const newSizes = [...(locConfig.sizes || ['', '', '', ''])];
                                   newSizes[idx] = e.target.value;
                                   locConfig.sizes = newSizes;
                                   newConfigs[loc] = locConfig;
                                   setTempLocationConfigs(newConfigs);
                                 }}
                                 className="w-full bg-white border border-black/10 px-1 py-1 text-[6px] text-center font-bold focus:outline-none focus:border-[#eab308]"
                              />
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
             </div>

             <div className="flex items-center gap-2 border-t border-black/5 pt-2">
                <div className="flex-1 space-y-1">
                   <label className="text-[6px] font-black uppercase text-gray-400">Estoque Geral</label>
                   <StockInput 
                    initialValue={stock} 
                    onSave={val => updateStock(estampaId || `slot-${slotIndex}`, val)}
                    className="w-full bg-gray-50 border border-black/10 px-2 py-1.5 text-[9px] font-bold focus:outline-none focus:border-[#eab308]"
                  />
                </div>
             </div>

             <div className="flex gap-2 pt-2">
                <button 
                  onClick={() => {
                    const nameInput = document.getElementById(`name-${slotIndex}`) as HTMLInputElement;
                    handleSaveEstampaImage(estampaId, slotIndex, nameInput?.value || 'Nova Estampa', tempAllowedLocations, tempLocationConfigs);
                  }}
                  className="bg-black text-white text-[8px] font-black uppercase py-2 flex-1 hover:bg-[#eab308] hover:text-black transition-all"
                  disabled={isUploading}
                >
                  {isUploading ? '...' : 'SALVAR'}
                </button>
                <button 
                  onClick={() => {
                    if(confirm("Excluir esta estampa?")) handleDeleteEstampa(estampaId, slotIndex);
                  }}
                  className="bg-red-500 text-white p-2 hover:bg-black transition-colors shrink-0"
                >
                  <Trash2 size={12} />
                </button>
             </div>
          </div>
        </div>
      ) : (
        <div className="flex flex-col">
          <div className="flex items-center justify-between gap-1 mb-2">
            <h5 className={cn(
              "text-[10px] font-black uppercase truncate tracking-tight flex-1",
              available ? "text-black" : "text-gray-300"
            )}>
              {imageUrl ? (estampa?.name || 'S/ Nome') : 'ESGOTADO'}
            </h5>
            {imageUrl && (
              <button 
                onClick={(e) => {
                  e.stopPropagation();
                  toggleAvailability(estampaId, available);
                }} 
                className={cn("transition-colors", available ? "text-green-600" : "text-gray-200")}
              >
                {available ? <ToggleRight size={22} /> : <ToggleLeft size={22} />}
              </button>
            )}
          </div>
          
          {imageUrl && (
            <div className="flex flex-wrap gap-1.5">
              {(estampa?.allowedLocations || []).slice(0, 2).map((loc: string) => (
                <span key={loc} className="text-[6px] font-black bg-black/5 text-black border border-black/5 px-1.5 py-0.5 uppercase">
                  {loc}
                </span>
              ))}
              {(estampa?.allowedLocations?.length || 0) > 2 && (
                <span className="text-[6px] font-black text-gray-400">+{estampa.allowedLocations.length - 2}</span>
              )}
              <div className={cn(
                "ml-auto text-[8px] font-black italic",
                stock > 5 ? "text-green-600" : stock > 0 ? "text-amber-600" : "text-red-600"
              )}>
                QTD: {stock}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

function InventorySummaryCard({ label, data, icon }: { label: string, data: Record<string, number>, icon: React.ReactNode }) {
  const items = Object.entries(data).filter(([_, val]) => val > 0).sort((a, b) => b[1] - a[1]);
  
  return (
    <div className="bg-white border border-black/10 p-5 shadow-sm overflow-hidden flex flex-col">
      <div className="flex items-center justify-between mb-4">
        <span className="text-[10px] font-black uppercase tracking-widest text-gray-400">{label}</span>
        {icon}
      </div>
      <div className="space-y-2 flex-grow overflow-y-auto max-h-[80px] scrollbar-none pr-1">
        {items.length > 0 ? items.map(([key, val]) => (
          <div key={key} className="flex items-center justify-between group">
            <span className="text-[9px] font-black uppercase tracking-widest text-black/60 group-hover:text-black transition-colors truncate pr-2">{key === 'Padrão' ? 'Único' : key}</span>
            <span className={cn("text-[11px] font-bold italic", val <= 5 ? "text-amber-500" : "text-black")}>{val}</span>
          </div>
        )) : (
          <p className="text-[9px] font-bold text-gray-300 uppercase tracking-widest italic pt-4">Vazio</p>
        )}
      </div>
    </div>
  );
}

const ColorVariantBlock = ({ 
  productId, 
  color, 
  sizes, 
  inventory, 
  onUpdateStock, 
  onToggleVariant, 
  onToggleColor 
}: any) => {
  const [isExpanded, setIsExpanded] = useState(false);
  
  const variants = sizes.map((size: string) => {
    const key = `${color.name}_${size}`;
    return {
      key,
      size,
      data: inventory?.variants?.[key] || { stock: 0, available: true }
    };
  });

  const allDisabled = variants.every((v: any) => v.data.available === false);
  const totalStock = variants.reduce((acc: number, v: any) => acc + (v.data.stock || 0), 0);

  return (
    <div className="border border-black/5 bg-white mb-3 hover:border-black/20 transition-all shadow-sm">
      <div 
        onClick={() => setIsExpanded(!isExpanded)}
        className={cn(
          "p-5 flex items-center justify-between cursor-pointer transition-colors",
          allDisabled ? "bg-red-50/20" : "hover:bg-black/[0.01]"
        )}
      >
        <div className="flex items-center gap-5">
          <div className="relative">
            <div 
              className="w-5 h-5 rounded-full border border-black/10 shadow-inner" 
              style={{ backgroundColor: color.hex }} 
            />
            {allDisabled && (
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="w-full h-[1px] bg-red-500/50 rotate-45" />
              </div>
            )}
          </div>
          <div className="flex flex-col">
            <span className="text-[13px] font-black uppercase tracking-tight text-black">{color.name}</span>
            <div className="flex items-center gap-2">
              <div className={cn("w-1.5 h-1.5 rounded-full", allDisabled ? "bg-red-500" : "bg-green-500")} />
              <span className={cn("text-[8px] font-black uppercase tracking-widest", allDisabled ? "text-red-500" : "text-green-600")}>
                {allDisabled ? 'Inativo' : 'Ativo'}
              </span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-8">
          {/* Sizes Stock Preview (Desktop) */}
          {!isExpanded && (
            <div className="hidden lg:flex gap-6 items-center">
              {variants.map((v: any) => (
                 <div key={v.key} className="flex flex-col items-center min-w-[30px]">
                    <span className="text-[7px] text-gray-400 font-black mb-1 uppercase tracking-widest">{v.size}</span>
                    <span className={cn(
                      "text-[10px] font-black italic", 
                      v.data.stock > 0 ? "text-black" : "text-gray-300"
                    )}>
                      {v.data.stock}
                    </span>
                 </div>
              ))}
            </div>
          )}

          <div className="flex items-center gap-4">
            <button 
              onClick={(e) => {
                e.stopPropagation();
                onToggleColor(productId, color.name, !allDisabled);
              }}
              className={cn(
                "px-4 py-2 text-[9px] font-black uppercase tracking-widest transition-all border",
                allDisabled 
                  ? "bg-green-600 border-green-700 text-white hover:bg-green-700" 
                  : "bg-white border-black/10 text-black hover:bg-red-500 hover:border-red-600 hover:text-white"
              )}
            >
              {allDisabled ? 'Ativar Cor' : 'Desativar Cor'}
            </button>
            <div className={cn("transition-transform duration-300", isExpanded && "rotate-180")}>
              <ChevronDown size={18} className="text-gray-400" />
            </div>
          </div>
        </div>
      </div>

      <AnimatePresence>
        {isExpanded && (
          <motion.div 
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden"
          >
            <div className="border-t border-black/[0.05] bg-gray-50/50 p-6">
              <div className="grid grid-cols-2 md:flex md:flex-row gap-4 items-end">
                {variants.map((v: any) => (
                  <div 
                    key={v.key} 
                    className={cn(
                      "flex-1 min-w-[140px] bg-white p-4 border transition-all",
                      v.data.available ? "border-black/5" : "border-red-500/10 opacity-70"
                    )}
                  >
                    <div className="flex items-center justify-between mb-4">
                      <span className="text-[11px] font-black uppercase tracking-widest text-black">{v.size}</span>
                      <button 
                        onClick={() => onToggleVariant(productId, v.key, v.data.available)}
                        className={cn("transition-colors", v.data.available ? "text-green-600" : "text-gray-300")}
                      >
                        {v.data.available ? <ToggleRight size={22} /> : <ToggleLeft size={22} />}
                      </button>
                    </div>
                    
                    <div className="space-y-1">
                      <span className="text-[7px] font-black uppercase text-gray-400 tracking-[0.2em]">Quantidade</span>
                      <StockInput 
                        initialValue={v.data.stock} 
                        onSave={(val: number) => onUpdateStock(productId, v.key, val)}
                        className="w-full bg-transparent border-b border-black/10 py-1 text-[12px] font-black italic focus:outline-none focus:border-[#eab308] transition-colors"
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default function AdminOrders() {
  const { user, loading: authLoading, loginWithGoogle, logout } = useAuth();
  const navigate = useNavigate();
  const [orders, setOrders] = useState<Order[]>([]);
  const [dynamicProducts, setDynamicProducts] = useState<any[]>([]);
  const [dynamicEstampas, setDynamicEstampas] = useState<any[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
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
  const [numSlots, setNumSlots] = useState(15);
  const { 
    inventory, 
    toggleAvailability, 
    isAvailable, 
    updateStock, 
    updateVariantStock, 
    toggleVariantAvailability,
    toggleColorAvailability,
    getStock
  } = useInventory();

  const isAdmin = user?.email === 'fpacstore@gmail.com' || user?.email === 'atendimento@fpacstore.com.br';

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

  const handleSaveEstampaImage = async (estampaId: string, slotIndex: number, name: string = 'Nova Estampa', allowedLocations?: string[], locationConfigs?: any) => {
    try {
      const docId = estampaId || `slot-${slotIndex}`;
      await setDoc(doc(db, 'estampas', docId), {
        image: tempEstampaImage,
        slotIndex,
        name,
        allowedLocations: allowedLocations || [],
        locationConfigs: locationConfigs || {},
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

      // Auto-delete "TESTE" products if encountered by an admin
      if (isAdmin) {
        sortedPData.forEach(async (p: any) => {
          const itemName = String(p.name || '').toUpperCase();
          const itemSlug = String(p.slug || '').toUpperCase();
          const isTest = 
            (itemName.includes('TESTE') && itemName.includes('CHECKOUT')) || 
            (itemSlug.includes('TESTE') && itemSlug.includes('CHECKOUT')) ||
            (itemSlug === 'teste-checkout') ||
            (itemName === 'TESTE CHECKOUT');
          
          if (isTest) {
            try {
              await deleteDoc(doc(db, 'products', p.id));
              if (p.slug) await deleteDoc(doc(db, 'inventory', p.slug));
              console.log("Purged test product from AdminOrders:", p.id);
            } catch (err) {
              console.error("Error purging test product:", err);
            }
          }
        });
      }
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
  const baseProducts = staticProducts.map(staticP => {
    const dynamicP = dynamicProducts.find(p => p.id === staticP.id || p.slug === staticP.slug);
    return dynamicP ? { ...staticP, ...dynamicP } : staticP;
  });
  
  // Also add any dynamic products that don't exist in static (if any)
  const extraProducts = dynamicProducts.filter(dynamicP => 
    !staticProducts.find(sp => sp.id === dynamicP.id || sp.slug === dynamicP.slug)
  );

  const currentProducts = [...baseProducts, ...extraProducts].filter(p => {
    const name = String(p.name || '').toUpperCase();
    const slug = String(p.slug || '').toUpperCase();
    const isTest = 
      (name.includes('TESTE') && name.includes('CHECKOUT')) || 
      (slug.includes('TESTE') && slug.includes('CHECKOUT')) ||
      (slug === 'TESTE-CHECKOUT') ||
      (name === 'TESTE CHECKOUT') ||
      name === 'PRODUTO TESTE PAGAMENTO' || 
      slug === 'MARK-PRIME-TEST';

    return p.name && p.name.trim() !== '' && !isTest;
  });

  // Calculate detailed inventory metrics
  const inventoryMetrics = React.useMemo(() => {
    let totalStock = 0;
    const byProduct: Record<string, number> = {};
    const byColor: Record<string, number> = {};
    const bySize: Record<string, number> = {};

    Object.entries(inventory).forEach(([itemId, data]: [string, any]) => {
      // 1. Encontrar o produto correspondente nos produtos atuais (filtrados)
      const p = currentProducts.find(cp => cp.id === itemId || cp.slug === itemId);
      
      // Se não for um produto ativo/visível, ignoramos completamente do cálculo do estoque global
      if (!p || !p.name) return;

      const stockVal = Number(data.stock) || 0;
      totalStock += stockVal;

      byProduct[p.name] = stockVal;

      if (data.variants) {
        Object.entries(data.variants).forEach(([vKey, vData]: [string, any]) => {
          // Key format is usually "ColorName_Size" or just "Size"
          const parts = vKey.split('_');
          const stock = Number(vData.stock) || 0;
          
          if (parts.length > 1) {
            const [color, size] = parts;
            byColor[color] = (byColor[color] || 0) + stock;
            bySize[size] = (bySize[size] || 0) + stock;
          } else {
            const size = vKey;
            bySize[size] = (bySize[size] || 0) + stock;
          }
        });
      }
    });

    return { totalStock, byProduct, byColor, bySize };
  }, [inventory, currentProducts]);

  const currentEstampas = dynamicEstampas.length > 0 ? dynamicEstampas : staticCatalogEstampas;

  const handleLogin = async () => {
    try {
      await loginWithGoogle();
    } catch (error: any) {
      // Errors are handled in AuthContext, but we can log here
      console.error(error);
    }
  };

  const handleLogout = () => logout().then(() => navigate('/'));

  const triggerStatusEmail = async (order: any, newStatus: string) => {
    if (!order.customerEmail) {
      console.log(`[EMAIL ADMIN] ⚠️ Pedido ${order.id} não possui e-mail cadastrado.`);
      return;
    }
    
    console.log(`[EMAIL ADMIN] 🚀 Notificando cliente sobre novo status: ${newStatus} (Pedido: ${order.id})`);
    try {
      const emailPayload = {
        email: (order.customerEmail || '').trim(),
        customerName: order.customerName || 'Cliente',
        orderId: order.id,
        items: order.items,
        totals: {
          subtotal: order.subtotal || 0,
          shipping: order.shipping || 0,
          discount: (order.couponDiscount || 0) + (order.pixDiscount || 0) + (order.flashSaleDiscount || 0),
          finalTotal: order.total
        },
        status: newStatus,
        address: order.address,
        paymentMethod: order.paymentMethod || 'Mercado Pago',
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

  const notifyCustomer = (order: any, type: 'preparando' | 'enviado' | 'aprovado' | 'pagamento') => {
    const cleanPhone = String(order.customerPhone || '').replace(/\D/g, '');
    let message = '';
    
    if (type === 'pagamento') {
      message = `Olá *${(order.customerName || 'Cliente').toUpperCase()}*!\n\n🛒 *RECEBEMOS SEU PEDIDO!*\n\nO pedido *#${order.id}* na *F PAC STORE* foi gerado com sucesso.\n\n🔗 *FAÇA O PAGAMENTO AQUI:*\n${order.paymentLink || `${getBaseUrl()}/#/order/${order.id}`}\n\n⚠️ _Se já pagou, ignore esta mensagem._`;
    } else if (type === 'aprovado') {
      message = `Olá *${(order.customerName || 'Cliente').toUpperCase()}*!\n\n✅ *PAGAMENTO CONFIRMADO!*\n\nSeu pedido *#${order.id}* na *F PAC STORE* foi aprovado e já está em nossa linha de produção.\n\nAcompanhe: ${getBaseUrl()}/#/order/${order.id}`;
    } else if (type === 'preparando') {
      message = `Olá *${(order.customerName || 'Cliente').toUpperCase()}*!\n\n🛠️ *PEDIDO EM PRODUÇÃO!*\n\nO pedido *#${order.id}* está sendo preparado com muito cuidado e logo será enviado.\n\nAcompanhe: ${getBaseUrl()}/#/order/${order.id}`;
    } else if (type === 'enviado') {
      message = `Olá *${(order.customerName || 'Cliente').toUpperCase()}*!\n\n🚀 *SEU PEDIDO FOI ENVIADO!*\n\nO pedido *#${order.id}* já está a caminho! Prepare-se para vestir atitude.\n\nAcompanhe o rastreio: ${getBaseUrl()}/#/order/${order.id}`;
    }

    window.open(`https://wa.me/${cleanPhone}?text=${encodeURIComponent(message)}`, '_blank');
  };

  const handleStatusUpdate = async (order: Order, status: string) => {
    await updateStatus(order.id, status);
    // WhatsApp manual
    if (status === 'payment_approved' || status === 'Pagamento Aprovado') notifyCustomer(order, 'aprovado');
    if (status === 'processing') notifyCustomer(order, 'preparando');
    if (status === 'shipped') notifyCustomer(order, 'enviado');
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
    const searchLower = String(searchTerm || '').toLowerCase();
    const matchesSearch = 
      String(order.id || '').toLowerCase().includes(searchLower) || 
      String(order.customerName || '').toLowerCase().includes(searchLower) ||
      String(order.customerEmail || '').toLowerCase().includes(searchLower);
    
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
    <div className="min-h-screen pt-16 md:pt-20 pb-20 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
      <div className="flex flex-col md:flex-row md:items-center justify-between mb-8 gap-4">
        <div>
          <h1 className="text-3xl font-black uppercase tracking-tighter">GESTÃO <span className="text-[#eab308]">F PAC</span></h1>
          <p className="text-gray-500 text-[10px] uppercase tracking-widest font-bold">Controle total da sua loja</p>
        </div>
      </div>

      <div className="flex border-b border-black/10 mb-6 overflow-x-auto scrollbar-none">
        <button onClick={() => setActiveTab('orders')} className={cn("px-8 py-4 text-[10px] font-black uppercase tracking-widest border-b-2 transition-all shrink-0", activeTab === 'orders' ? "border-[#eab308] text-black bg-black/[0.02]" : "border-transparent text-gray-400 hover:text-black")}>Pedidos</button>
        <button onClick={() => setActiveTab('products')} className={cn("px-8 py-4 text-[10px] font-black uppercase tracking-widest border-b-2 transition-all shrink-0", activeTab === 'products' ? "border-[#eab308] text-black bg-black/[0.02]" : "border-transparent text-gray-400 hover:text-black")}>Produtos</button>
        <button onClick={() => setActiveTab('stamps')} className={cn("px-8 py-4 text-[10px] font-black uppercase tracking-widest border-b-2 transition-all shrink-0", activeTab === 'stamps' ? "border-[#eab308] text-black bg-black/[0.02]" : "border-transparent text-gray-400 hover:text-black")}>Estampas</button>
        <button onClick={() => setActiveTab('identity')} className={cn("px-8 py-4 text-[10px] font-black uppercase tracking-widest border-b-2 transition-all shrink-0", activeTab === 'identity' ? "border-[#eab308] text-black bg-black/[0.02]" : "border-transparent text-gray-400 hover:text-black")}>Identidade</button>
      </div>

      {activeTab === 'orders' ? (
        <div className="space-y-10">
          {/* Summary Stats */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="bg-white border border-black/10 p-5">
              <p className="text-[9px] font-black uppercase text-green-500 tracking-widest mb-1">Faturamento</p>
              <p className="text-2xl font-black italic">R$ {orders.filter(o => o.status !== 'cancelled').reduce((acc, o) => acc + (o.total || 0), 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</p>
            </div>
            <div className="bg-white border border-black/10 p-5">
              <p className="text-[9px] font-black uppercase text-gray-400 tracking-widest mb-1">Total Pedidos</p>
              <p className="text-2xl font-black italic">{orders.length}</p>
            </div>
            <div className="bg-white border border-black/10 p-5">
              <p className="text-[9px] font-black uppercase text-yellow-500 tracking-widest mb-1">Aguardando Pgto</p>
              <p className="text-2xl font-black italic">{orders.filter(o => ['payment_pending', 'Aguardando Pagamento PIX', 'received'].includes(o.status)).length}</p>
            </div>
            <div className="bg-white border border-black/10 p-5">
              <p className="text-[9px] font-black uppercase text-blue-500 tracking-widest mb-1">Em Produção</p>
              <p className="text-2xl font-black italic">{orders.filter(o => ['payment_approved', 'Pagamento Aprovado', 'processing'].includes(o.status)).length}</p>
            </div>
          </div>

          {/* Filters Bar */}
          <div className="flex flex-col md:flex-row gap-4 sticky top-24 z-30 bg-white/80 backdrop-blur-md p-4 border border-black/5 shadow-sm">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
              <input 
                type="text" 
                placeholder="Buscar por ID, Nome ou E-mail..." 
                value={searchTerm} 
                onChange={e => setSearchTerm(e.target.value)} 
                className="w-full pl-10 pr-4 py-3 border border-black/10 rounded-none text-sm focus:outline-none focus:border-[#eab308] transition-colors" 
              />
            </div>
            <select 
              value={statusFilter} 
              onChange={e => setStatusFilter(e.target.value)} 
              className="md:w-64 py-3 px-4 border border-black/10 rounded-none text-sm font-bold uppercase tracking-widest focus:outline-none focus:border-[#eab308] cursor-pointer"
            >
              <option value="all">TODOS OS STATUS</option>
              <option value="Aguardando Pagamento PIX">⏳ AGUARDANDO PIX</option>
              <option value="Pagamento Aprovado">✅ PGTO APROVADO</option>
              <option value="Pagamento Não Realizado">❌ NÃO REALIZADO</option>
              <option value="processing">🛠️ EM SEPARAÇÃO</option>
              <option value="shipped">🚀 ENVIADO</option>
              <option value="delivered">🙌 ENTREGUE</option>
              <option value="cancelled">🛑 CANCELADO</option>
            </select>
          </div>

          {/* Orders List */}
          <div className="space-y-4">
            {filteredOrders.length === 0 ? (
              <div className="bg-gray-50 border border-dashed border-black/10 py-20 text-center">
                <p className="text-gray-400 font-bold uppercase tracking-[0.2em]">Nenhum pedido encontrado</p>
              </div>
            ) : (
              filteredOrders.map((order, idx) => (
                <motion.div 
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: idx * 0.05 }}
                  key={order.id} 
                  className="bg-white border border-black/10 group hover:border-[#eab308]/30 transition-all overflow-hidden"
                >
                  {/* Top Bar - Header Info */}
                  <div className="bg-black/5 px-6 py-3 flex flex-wrap items-center justify-between gap-4 border-b border-black/5">
                    <div className="flex items-center gap-4">
                      <span className="text-[12px] font-black text-black tracking-tighter">#{order.id}</span>
                      <span className="text-[10px] text-gray-500 font-bold uppercase tracking-widest">{formatDate(order.createdAt)}</span>
                    </div>
                    <div className="flex items-center gap-2">
                       <span className={cn("px-4 py-1 text-[9px] font-black uppercase tracking-[0.15em] rounded-none border", 
                        ['payment_pending', 'Aguardando Pagamento PIX', 'received'].includes(order.status) ? 'bg-orange-50 text-orange-700 border-orange-200' :
                        ['payment_approved', 'Pagamento Aprovado'].includes(order.status) ? 'bg-green-50 text-green-700 border-green-200' :
                        order.status === 'processing' ? 'bg-blue-50 text-blue-700 border-blue-200' :
                        order.status === 'shipped' ? 'bg-purple-50 text-purple-700 border-purple-200' :
                        order.status === 'delivered' ? 'bg-black text-white border-black' :
                        'bg-red-50 text-red-700 border-red-200'
                      )}>
                        {['payment_pending', 'Aguardando Pagamento PIX', 'received'].includes(order.status) ? 'AGUARDANDO PGTO' :
                         ['payment_approved', 'Pagamento Aprovado'].includes(order.status) ? 'PAGAMENTO APROVADO' :
                         order.status === 'processing' ? 'EM SEPARAÇÃO' :
                         order.status === 'shipped' ? 'ENVIADO' :
                         order.status === 'delivered' ? 'ENTREGUE' : 'CANCELADO'}
                      </span>
                    </div>
                  </div>

                  <div className="p-6 grid grid-cols-1 md:grid-cols-12 gap-8">
                    {/* Customer Info */}
                    <div className="md:col-span-4 space-y-4">
                      <div>
                        <h3 className="text-xl font-black uppercase tracking-tight text-black flex items-center gap-2 group-hover:text-[#eab308] transition-colors cursor-default">
                          {order.customerName}
                        </h3>
                        <p className="text-[11px] text-gray-500 font-bold tracking-widest uppercase">{order.customerEmail || 'SEM E-MAIL'}</p>
                      </div>

                      <div className="flex gap-2">
                        <a 
                          href={`https://wa.me/${String(order.customerPhone || '').replace(/\D/g, '')}`} 
                          target="_blank" 
                          rel="noopener noreferrer"
                          className="flex items-center gap-2 bg-[#25D366] text-white px-3 py-1.5 text-[9px] font-black uppercase tracking-widest hover:brightness-95 transition-all"
                        >
                          <MessageCircle size={12} /> WhatsApp
                        </a>
                        <a 
                          href={`mailto:${order.customerEmail}`} 
                          className="flex items-center gap-2 bg-black text-white px-3 py-1.5 text-[9px] font-black uppercase tracking-widest hover:bg-[#eab308] hover:text-black transition-all"
                        >
                          <Mail size={12} /> E-mail
                        </a>
                      </div>

                      <div className="bg-black/[0.02] border-l-2 border-[#eab308] p-4 text-[11px]">
                        <p className="text-[9px] font-black uppercase text-gray-400 mb-2 tracking-[0.2em]">Destino</p>
                        {typeof order.address === 'object' ? (
                          <div className="font-medium text-gray-700 leading-relaxed uppercase">
                            <p className="font-black text-black">{(order.address as any).street}, {order.number || (order.address as any).number}</p>
                            {(order.complement || (order.address as any).complement) && <p>Complemento: {order.complement || (order.address as any).complement}</p>}
                            <p>{(order.address as any).neighborhood} — {(order.address as any).city}/{(order.address as any).state}</p>
                            <p className="mt-1 text-gray-400">CEP: {(order.address as any).cep}</p>
                          </div>
                        ) : (
                          <div className="font-medium text-gray-700 leading-relaxed uppercase">
                            <p className="font-black text-black">{order.address}, {order.number}</p>
                            {order.complement && <p>Complemento: {order.complement}</p>}
                            <p>{order.neighborhood} — {order.city}/{order.state}</p>
                            <p className="mt-1 text-gray-400">CEP: {order.cep}</p>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Order Items */}
                    <div className="md:col-span-5 border-y md:border-y-0 md:border-x border-black/5 md:px-8 py-6 md:py-0">
                      <p className="text-[9px] font-black uppercase text-gray-400 mb-4 tracking-[0.2em]">Conteúdo do Pedido</p>
                      <div className="space-y-3">
                        {order.items.map((item, idx) => (
                          <div key={idx} className="flex gap-4 items-start border-b border-black/5 pb-3 last:border-0 last:pb-0">
                            <div className="w-10 h-10 bg-black/5 flex-shrink-0 flex items-center justify-center text-[10px] font-black text-black/20">
                              IMG
                            </div>
                            <div className="flex-1">
                              <p className="text-[11px] font-black uppercase leading-none mb-1">{item.name}</p>
                              <div className="flex gap-2 text-[9px] font-bold text-gray-400 uppercase">
                                <span>Cor: <span className="text-black">{item.color}</span></span>
                                <span>|</span>
                                <span>Tam: <span className="text-black">{item.size}</span></span>
                                <span>|</span>
                                <span>Qtd: <span className="text-black">{item.quantity}</span></span>
                              </div>
                            </div>
                            <div className="text-right">
                               <p className="text-[11px] font-black tracking-tighter">R$ {(item.price * item.quantity).toFixed(2)}</p>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Summary & Actions */}
                    <div className="md:col-span-3 flex flex-col justify-between">
                      <div className="space-y-4">
                        <div className="flex flex-col gap-1 items-end">
                          <p className="text-[9px] font-black uppercase text-gray-400 tracking-widest">Valor do Pedido</p>
                          <p className="text-2xl font-black tracking-tighter uppercase italic">R$ {order.total?.toFixed(2)}</p>
                          <p className="text-[10px] font-bold text-[#eab308] uppercase tracking-widest">{order.paymentMethod || 'CARTÃO / PIX'}</p>
                        </div>
                      </div>

                      <div className="mt-8 space-y-2">
                        {/* Status Quick Actions */}
                        {['payment_pending', 'Aguardando Pagamento PIX', 'received'].includes(order.status) && (
                          <button 
                            onClick={() => handleStatusUpdate(order, 'Pagamento Aprovado')} 
                            className="w-full bg-green-600 text-white py-3 text-[10px] font-black uppercase tracking-widest hover:bg-black transition-all shadow-lg shadow-green-600/20"
                          >
                            Aprovar Pagamento
                          </button>
                        )}
                        {['payment_approved', 'Pagamento Aprovado'].includes(order.status) && (
                          <button 
                            onClick={() => handleStatusUpdate(order, 'processing')} 
                            className="w-full bg-blue-600 text-white py-3 text-[10px] font-black uppercase tracking-widest hover:bg-black transition-all shadow-lg shadow-blue-600/20"
                          >
                            Iniciar Separação
                          </button>
                        )}
                        {order.status === 'processing' && (
                          <button 
                            onClick={() => handleStatusUpdate(order, 'shipped')} 
                            className="w-full bg-[#9333ea] text-white py-3 text-[10px] font-black uppercase tracking-widest hover:bg-black transition-all shadow-lg shadow-purple-600/20"
                          >
                            Informar Envio
                          </button>
                        )}
                        {order.status === 'shipped' && (
                          <button 
                            onClick={() => handleStatusUpdate(order, 'delivered')} 
                            className="w-full bg-black text-white py-3 text-[10px] font-black uppercase tracking-widest hover:bg-[#eab308] hover:text-black transition-all shadow-lg"
                          >
                            Marcar Entregue
                          </button>
                        )}

                        <div className="grid grid-cols-2 gap-2">
                          <button 
                            onClick={() => {
                              toast.promise(
                                triggerStatusEmail(order, order.status),
                                {
                                  loading: 'Enviando e-mail...',
                                  success: 'E-mail enviado!',
                                  error: 'Erro ao enviar e-mail'
                                }
                              )
                            }}
                            className="bg-gray-50 border border-black/10 py-2 text-[8px] font-black uppercase tracking-widest hover:bg-black hover:text-white transition-all flex items-center justify-center gap-1"
                          >
                            <RefreshCw size={10} /> Reenviar E-mail
                          </button>
                          
                          {confirmDeleteId === order.id ? (
                            <button 
                              onClick={() => handleDeleteOrder(order.id)} 
                              className="bg-red-600 text-white py-2 text-[8px] font-black uppercase tracking-widest animate-pulse"
                            >
                              Confirmar?
                            </button>
                          ) : (
                            <button 
                              onClick={() => setConfirmDeleteId(order.id)} 
                              className="bg-red-50 text-red-600 border border-red-100 py-2 text-[8px] font-black uppercase tracking-widest hover:bg-red-600 hover:text-white transition-all flex items-center justify-center gap-1"
                            >
                              <Trash2 size={10} /> Excluir
                            </button>
                          )}
                        </div>

                        {['payment_pending', 'Aguardando Pagamento PIX', 'received', 'pending'].includes(order.status) && order.gateway === 'mercadopago' && (
                          <button 
                            onClick={async () => {
                              try {
                                const resp = await fetch(getApiUrl(`/api/checkout/mercadopago/verify/${order.id}`));
                                const data = await resp.json();
                                if (data.status === 'payment_approved') {
                                  toast.success("Pagamento confirmado via consulta!");
                                } else if (data.status === 'cancelled') {
                                  toast.error("Pagamento recusado/cancelado via consulta.");
                                } else {
                                  toast.error(`Status atual: ${data.paymentStatus || 'Pendente'}`);
                                }
                              } catch (e) {
                                toast.error("Erro ao consultar Mercado Pago");
                              }
                            }}
                            className="w-full bg-[#f7c600] text-black py-2 text-[8px] font-black uppercase tracking-widest hover:bg-black hover:text-white transition-all flex items-center justify-center gap-1 shadow-lg shadow-[#f7c600]/10"
                          >
                            <RefreshCw size={10} /> Sincronizar MP
                          </button>
                        )}

                        {order.status !== 'cancelled' && order.status !== 'delivered' && (
                           <button 
                            onClick={() => handleStatusUpdate(order, 'cancelled')} 
                            className="w-full text-gray-400 py-2 text-[8px] font-bold uppercase tracking-widest hover:text-red-500 transition-colors"
                           >
                            Cancelar Pedido
                           </button>
                        )}
                      </div>
                    </div>
                  </div>
                </motion.div>
              ))
            )}
          </div>
        </div>
      ) : activeTab === 'products' ? (
        <div className="space-y-8">
          {/* Inventory Metrics Header */}
        <div className="flex flex-row gap-4 mb-10 overflow-x-auto pb-4 scrollbar-thin">
            <div className="bg-black text-white p-6 shadow-xl shrink-0 w-[200px]">
              <p className="text-[10px] font-black uppercase tracking-widest opacity-40 mb-1">Estoque Global</p>
              <p className="text-4xl font-black italic tracking-tighter">{inventoryMetrics.totalStock}</p>
              <div className="mt-4 h-1 w-12 bg-[#eab308]" />
            </div>
            
            <div className="flex-1 min-w-[200px]">
              <InventorySummaryCard 
                label="Por Tamanho" 
                data={inventoryMetrics.bySize} 
                icon={<Maximize2 size={16} className="text-[#eab308]" />}
              />
            </div>
            
            <div className="flex-1 min-w-[200px]">
              <InventorySummaryCard 
                label="Por Cor" 
                data={inventoryMetrics.byColor} 
                icon={<Palette size={16} className="text-[#eab308]" />}
              />
            </div>

            <div className="flex-1 min-w-[200px]">
              <InventorySummaryCard 
                label="Por Produto" 
                data={Object.fromEntries(
                  Object.entries(inventoryMetrics.byProduct).map(([id, stock]) => {
                    const p = currentProducts.find(cp => cp.id === id || cp.slug === id);
                    return [p?.name || id, stock];
                  })
                )} 
                icon={<Box size={16} className="text-[#eab308]" />}
              />
            </div>
          </div>

          <section>
            <h2 className="text-xl font-black uppercase mb-8 flex items-center gap-2 italic">
               <span className="w-1.5 h-6 bg-black" />
               Gerenciar Catálogo de Produtos
            </h2>
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
                      <div className="mb-0 border-b-0">
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
                      <div className="space-y-4 mt-12 border-t border-black/5 pt-12">
                        <div className="flex items-center justify-between mb-2">
                          <h5 className="text-[11px] font-black uppercase tracking-[0.2em] text-black">Gestão por Cor & Tamanho</h5>
                          {(!p.colors || p.colors.length === 0) && (
                            <span className="text-[9px] font-bold text-red-500 uppercase">Nenhuma cor definida</span>
                          )}
                        </div>
                        
                        <div className="flex flex-col gap-1">
                          {(() => {
                            let baseColors = (p.colors && p.colors.length > 0) ? p.colors : (staticProducts.find(sp => sp.slug === p.slug)?.colors || [{ name: 'Padrão', hex: '#000000' }]);
                            const isMainProduct = p.slug === 'force' || p.slug === 'mark' || p.slug === 'prime';
                            if (isMainProduct) {
                               const mandatory = [
                                 { name: "Azul Marinho", hex: "#1b263b" },
                                 { name: "Verde Militar", hex: "#3f4238" },
                                 { name: "Off White", hex: "#FAF9F6" }
                               ];
                               const merged = [...baseColors];
                               mandatory.forEach(m => {
                                 if (!merged.find(c => c.name === m.name)) merged.push(m);
                               });
                               return merged;
                            }
                            // Ensure Off White is present if it's a T-shirt category or if it's a base color
                            if (!baseColors.find(c => c.name === 'Off White') && (p.category === 'Camisetas' || p.name?.toUpperCase().includes('CAMISETA'))) {
                               const merged = [...baseColors];
                               merged.push({ name: 'Off White', hex: '#FAF9F6' });
                               return merged;
                            }
                            return baseColors;
                          })().map((color: any) => (
                            <ColorVariantBlock 
                              key={color.name}
                              productId={p.id}
                              color={color}
                              sizes={((p.sizes && p.sizes.length > 0) ? p.sizes : (staticProducts.find(sp => sp.slug === p.slug)?.sizes || ['P', 'M', 'G', 'GG']))}
                              inventory={itemInventory}
                              onUpdateStock={updateVariantStock}
                              onToggleVariant={toggleVariantAvailability}
                              onToggleColor={toggleColorAvailability}
                            />
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
        <div className="space-y-8">
          <section>
             <div className="flex flex-col md:flex-row md:items-center justify-between mb-8 gap-4">
                <div className="space-y-1">
                  <h2 className="text-xl font-black uppercase flex items-center gap-2">Artes da Loja ({numSlots} Slots)</h2>
                  <p className="text-gray-400 text-[10px] uppercase font-bold tracking-widest">Arraste para reordenar a prioridade de exibição</p>
                </div>
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
                 <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
                   {Array.from({ length: numSlots }, (_, i) => i + 1).map(slotIndex => {
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
