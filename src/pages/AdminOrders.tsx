import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { db, auth, storage, handleFirestoreError, OperationType } from '../lib/firebase';
import { collection, query, orderBy, onSnapshot, doc, updateDoc, deleteDoc, getDocs, setDoc, getDoc, Timestamp, serverTimestamp, where } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { signInWithPopup, GoogleAuthProvider, onAuthStateChanged, signOut } from 'firebase/auth';
import { Package, Search, CheckCircle, XCircle, Clock, ExternalLink, LogOut, Loader2, Trash2, Box, Image as ImageIcon, Palette, Maximize2, ToggleLeft, ToggleRight, Plus, Upload, Save, GripVertical, Mail, MessageCircle, RefreshCw, ChevronDown, ChevronUp, Smartphone, Truck } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { products as staticProducts } from '../data/products';
import { useInventory } from '../hooks/useInventory';
import { cn, resizeImage, convertDriveUrlToDirect, isVideoUrl } from '../lib/utils';
import { isJoinvilleCEP, JOINVILLE_SHIPPING_NAME } from '../lib/shipping';
import { isValidCPF, isValidCNPJ } from '../lib/validation';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import toast from 'react-hot-toast';
import { getApiUrl, getBaseUrl } from '../lib/api';
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
const AdminAutomations = React.lazy(() => import('../components/AdminAutomations').then(m => ({ default: m.AdminAutomations })));
const AdminFinancial = React.lazy(() => import('../components/AdminFinancial').then(m => ({ default: m.AdminFinancial })));
const AdminPromotions = React.lazy(() => import('../components/AdminPromotions').then(m => ({ default: m.AdminPromotions })));
const AdminStockCenter = React.lazy(() => import('../components/AdminStockCenter').then(m => ({ default: m.AdminStockCenter })));
const AdminStampsCenter = React.lazy(() => import('../components/AdminStampsCenter').then(m => ({ default: m.AdminStampsCenter })));
const AdminAnalyticsDashboard = React.lazy(() => import('../components/AdminAnalyticsDashboard'));
const AdminMusic = React.lazy(() => import('../components/AdminMusic').then(m => ({ default: m.AdminMusic })));

const PRIME_LOCATIONS = ["Peito Central", "Costas", "Manga", "Peito Lateral"];

// Estampas list
const staticCatalogEstampas = [
  { id: 'peito-1', name: 'Escrita Peito Core', path: '/estampas/F-PAC-ESCRITA-peito C.png' },
  { id: 'logo-premium', name: 'F PAC Full Logo', path: '/estampas/logo-fpac.png' },
];

interface Order {
  id: string;
  customerName: string;
  customerPhone: string;
  customerPhone2?: string;
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
  gateway?: string;
  status: 'received' | 'payment_pending' | 'payment_approved' | 'Aguardando Pagamento PIX' | 'Pagamento Aprovado' | 'Pagamento Não Realizado' | 'separacao' | 'embalagem' | 'shipped' | 'delivered' | 'cancelled';
  createdAt: any;
  updatedAt?: any;
  deliveredAt?: any;
  paymentLink?: string;
  observations?: string;
  deliveryDate?: string;
  isManual?: boolean;
  origin?: string;
  frete?: number;
  stockControl?: any;
  paymentMethodId?: string;
  shippingServiceId?: any;
  whatsappMessages?: {
    pedidoCriado?: boolean;
    [key: string]: any;
  };
  whatsappLogs?: any[];
}

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
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  
  // Sync local state when estampa changes or editing mode is triggered
  useEffect(() => {
    if (estampa) {
      setTempAllowedLocations(estampa.allowedLocations || []);
      setTempLocationConfigs(estampa.locationConfigs || {});
    } else {
      setTempAllowedLocations([]);
      setTempLocationConfigs({});
    }
    setShowDeleteConfirm(false);
  }, [estampa, isEditing]);

  const estampaId = estampa?.id || '';
  const stock = getStock(estampaId || `slot-${slotIndex}`);

  const computedTotalStock = tempAllowedLocations.reduce((sum: number, loc: string) => {
    const locConfig = tempLocationConfigs[loc];
    if (!locConfig) return sum;
    const quantities = locConfig.quantities || [0, 0, 0, 0];
    const locSum = quantities.reduce((acc: number, qty: any, i: number) => {
      const size = locConfig.sizes?.[i];
      if (!size || size.trim() === '') return acc;
      return acc + (Number(qty) || 0);
    }, 0);
    return sum + locSum;
  }, 0);

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
                  onChange={(e) => setTempEstampaImage(convertDriveUrlToDirect(e.target.value))}
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
                              <div key={idx} className="flex flex-col gap-0.5 border border-black/5 p-1 bg-white">
                                <input 
                                   type="text"
                                   placeholder={`TAM ${idx + 1}`}
                                   value={tempLocationConfigs[loc]?.sizes?.[idx] || ''}
                                   onChange={(e) => {
                                     const newConfigs = { ...tempLocationConfigs };
                                     const locConfig = { ...(newConfigs[loc] || { sizes: ['', '', '', ''], quantities: [0, 0, 0, 0] }) };
                                     const newSizes = [...(locConfig.sizes || ['', '', '', ''])];
                                     newSizes[idx] = e.target.value;
                                     locConfig.sizes = newSizes;
                                     newConfigs[loc] = locConfig;
                                     setTempLocationConfigs(newConfigs);
                                   }}
                                   className="w-full bg-gray-50 border border-black/10 px-1 py-0.5 text-[6px] text-center font-bold focus:outline-none focus:border-[#eab308]"
                                />
                                <input 
                                   type="number"
                                   placeholder="Qtd"
                                   min="0"
                                   value={tempLocationConfigs[loc]?.quantities?.[idx] === 0 ? '' : (tempLocationConfigs[loc]?.quantities?.[idx] ?? '')}
                                   onChange={(e) => {
                                     const newConfigs = { ...tempLocationConfigs };
                                     const locConfig = { ...(newConfigs[loc] || { sizes: ['', '', '', ''], quantities: [0, 0, 0, 0] }) };
                                     const newQuantities = [...(locConfig.quantities || [0, 0, 0, 0])];
                                     newQuantities[idx] = e.target.value === '' ? '' : Math.max(0, parseInt(e.target.value) || 0);
                                     locConfig.quantities = newQuantities;
                                     newConfigs[loc] = locConfig;
                                     setTempLocationConfigs(newConfigs);
                                   }}
                                   className="w-full bg-white border border-black/10 px-1 py-0.5 text-[6px] text-center font-black focus:outline-none focus:border-[#eab308]"
                                />
                              </div>
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
                   <label className="text-[6px] font-black uppercase text-gray-400">Estoque Geral (Total para todas as artes)</label>
                   <div className="w-full bg-gray-100 border border-black/10 px-2 py-1.5 text-[9px] font-black text-center focus:outline-none text-gray-700 select-none">
                     {computedTotalStock} Unidades
                   </div>
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
                {showDeleteConfirm ? (
                  <div className="flex gap-1 bg-red-50 p-1 border border-red-200 shrink-0">
                    <button
                      onClick={async (e) => {
                        e.stopPropagation();
                        setShowDeleteConfirm(false);
                        await handleDeleteEstampa(estampaId, slotIndex);
                      }}
                      className="bg-red-650 text-white text-[7px] font-black uppercase px-2 py-1 hover:bg-black transition-colors"
                    >
                      REMOVER
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setShowDeleteConfirm(false);
                      }}
                      className="bg-black text-white text-[7px] font-black uppercase px-2 py-1 hover:bg-gray-800 transition-colors"
                    >
                      NÃO
                    </button>
                  </div>
                ) : (
                  <button 
                    onClick={() => setShowDeleteConfirm(true)}
                    className="bg-red-500 text-white p-2 hover:bg-black transition-colors shrink-0"
                  >
                    <Trash2 size={12} />
                  </button>
                )}
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
              {(() => {
                const validLocs = (estampa?.allowedLocations || []).filter((loc: string) => {
                  const locConfig = estampa.locationConfigs?.[loc];
                  if (!locConfig) return false;
                  const sizes = locConfig.sizes || [];
                  const quantities = locConfig.quantities || [];
                  return sizes.some((size: string, sidx: number) => {
                    const qty = quantities[sidx];
                    return size && size.trim() !== '' && qty !== undefined && qty !== null && Number(qty) > 0;
                  });
                });
                return (
                  <>
                    {validLocs.slice(0, 2).map((loc: string) => (
                      <span key={loc} className="text-[6px] font-black bg-black/5 text-black border border-black/5 px-1.5 py-0.5 uppercase font-sans">
                        {loc}
                      </span>
                    ))}
                    {validLocs.length > 2 && (
                      <span className="text-[6px] font-black text-gray-400 font-sans">+{validLocs.length - 2}</span>
                    )}
                  </>
                );
              })()}
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
  const [stockFilter, setStockFilter] = useState<'all' | 'moved' | 'not_moved'>('all');
  const [activeTab, setActiveTab] = useState<'orders' | 'stock_center' | 'stamps' | 'identity' | 'automations' | 'promotions' | 'financial' | 'analytics' | 'music'>('orders');
  const [brandConfig, setBrandConfig] = useState<any>(null);
  const [identityFormData, setIdentityFormData] = useState({
    heroUrl: '',
    aboutUrl: '',
    catalogImage1: '',
    catalogImage2: '',
    communityUrls: ['', '', '', ''],
    hideOutOfStock: false
  });
  const [editingImagesId, setEditingImagesId] = useState<string | null>(null);
  const [tempImages, setTempImages] = useState<string[]>([]);
  const [tempStampGallery, setTempStampGallery] = useState<string[]>([]);
  const [tempStampGallerySizes, setTempStampGallerySizes] = useState<string[]>([]);
  const [editingEstampaId, setEditingEstampaId] = useState<string | null>(null);
  const [tempEstampaImage, setTempEstampaImage] = useState<string>('');
  const [isUploading, setIsUploading] = useState(false);
  const [numSlots, setNumSlots] = useState(15);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [confirmDeleteProductId, setConfirmDeleteProductId] = useState<string | null>(null);
  const [stampSearch, setStampSearch] = useState('');
  const [stampStockFilter, setStampStockFilter] = useState<'all' | 'in_stock' | 'out_of_stock'>('all');
  const [hideZeroVariations, setHideZeroVariations] = useState(true);
  const [isStockPanelExpanded, setIsStockPanelExpanded] = useState(true);

  // --- MANUAL ORDER SYSTEM ---
  const [orderSubView, setOrderSubView] = useState<'list' | 'reports' | 'logs'>('list');
  const [isManualModalOpen, setIsManualModalOpen] = useState(false);
  const [expandedOrders, setExpandedOrders] = useState<string[]>([]);
  const [auditLogs, setAuditLogs] = useState<any[]>([]);

  // Melhor Envio Config modal states
  const [isMelhorEnvioModalOpen, setIsMelhorEnvioModalOpen] = useState(false);
  const [meToken, setMeToken] = useState('');
  const [meBaseUrl, setMeBaseUrl] = useState('https://www.melhorenvio.com.br');
  const [meHasToken, setMeHasToken] = useState(false);
  const [meMaskedToken, setMeMaskedToken] = useState('');

  const fetchMelhorEnvioConfig = async () => {
    try {
      const r = await fetch('/api/shipping/config');
      const d = await r.json();
      if (d) {
        setMeHasToken(d.hasToken);
        setMeMaskedToken(d.maskedToken);
        setMeBaseUrl(d.baseUrl || 'https://www.melhorenvio.com.br');
      }
    } catch (e) {
      console.error('Erro ao buscar config do Melhor Envio:', e);
    }
  };

  useEffect(() => {
    if (activeTab === 'orders') {
      fetchMelhorEnvioConfig();
    }
  }, [activeTab]);

  const handleSaveMelhorEnvioConfig = async () => {
    const toastId = toast.loading('Salvando configuração...');
    try {
      const r = await fetch('/api/shipping/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token: meToken,
          baseUrl: meBaseUrl
        })
      });
      const d = await r.json();
      if (d.success) {
        toast.success('Configuração do Melhor Envio salva!', { id: toastId });
        setIsMelhorEnvioModalOpen(false);
        setMeToken('');
        fetchMelhorEnvioConfig();
      } else {
        throw new Error(d.error || 'Erro ao salvar');
      }
    } catch (e: any) {
      toast.error(`Erro: ${e.message}`, { id: toastId });
    }
  };

  // Form customer fields
  const [custName, setCustName] = useState('');
  const [custPhone, setCustPhone] = useState('');
  const [custPhone2, setCustPhone2] = useState('');
  const [custEmail, setCustEmail] = useState('');
  const [custCep, setCustCep] = useState('');
  const [isRetirada, setIsRetirada] = useState(false);
  const [custAddress, setCustAddress] = useState('');
  const [custNumber, setCustNumber] = useState('');
  const [custComplement, setCustComplement] = useState('');
  const [custNeighborhood, setCustNeighborhood] = useState('');

  // Validation and Correction Modal States for Melhor Envio Destinatario
  const [isValidationModalOpen, setIsValidationModalOpen] = useState(false);
  const [meCpfWarning, setMeCpfWarning] = useState(false);
  const [validationOrder, setValidationOrder] = useState<any>(null);
  const [valName, setValName] = useState('');
  const [valPhone, setValPhone] = useState('');
  const [valEmail, setValEmail] = useState('');
  const [valCpf, setValCpf] = useState('');
  const [valCep, setValCep] = useState('');
  const [valStreet, setValStreet] = useState('');
  const [valNumber, setValNumber] = useState('');
  const [valComplement, setValComplement] = useState('');
  const [valNeighborhood, setValNeighborhood] = useState('');
  const [valCity, setValCity] = useState('');
  const [valState, setValState] = useState('');
  const [custCity, setCustCity] = useState('');
  const [custState, setCustState] = useState('');

  // Form item selection
  const [selectedProduct, setSelectedProduct] = useState<any>(null);
  const [selectedColor, setSelectedColor] = useState('');
  const [selectedSize, setSelectedSize] = useState('');
  const [itemQty, setItemQty] = useState(1);
  const [itemPrice, setItemPrice] = useState(0);
  const [tempItems, setTempItems] = useState<any[]>([]);

  // Form order meta
  const [orderOrigin, setOrderOrigin] = useState('WhatsApp');
  const [paymentMethodForm, setPaymentMethodForm] = useState('PIX');
  const [manualOrderStatus, setManualOrderStatus] = useState('Pago');
  const [manualOrderObs, setManualOrderObs] = useState('');
  const [manualOrderDeliveryDate, setManualOrderDeliveryDate] = useState('');
  const [manualOrderDiscount, setManualOrderDiscount] = useState(0);
  const [manualOrderShipping, setManualOrderShipping] = useState(0);
  const [ignoreStock, setIgnoreStock] = useState(true);
  const [savingManualOrder, setSavingManualOrder] = useState(false);
  const [stockControl, setStockControl] = useState<'move' | 'no_move'>('move');
  
  // Custom manual order shipping properties
  const [manualShippingMethod, setManualShippingMethod] = useState<'Pedido Local' | 'Melhor Envio'>('Pedido Local');
  const [manualShippingMethodName, setManualShippingMethodName] = useState('Entrega Local F PAC');
  const [manualShippingServiceId, setManualShippingServiceId] = useState<number>(0);

  // --- REPORTS FILTER STATES ---
  const [repPeriod, setRepPeriod] = useState<string>('30days');
  const [repProduct, setRepProduct] = useState<string>('all');
  const [repModel, setRepModel] = useState<string>('all');
  const [repChannel, setRepChannel] = useState<string>('all');
  const [repStatus, setRepStatus] = useState<string>('paid');

  // --- BI / INDUSTRIAL INTELLIGENCE REPORTS REAL-TIME PLACEHOLDER REMOVED ---

  // CEP Lookup
  const handleCEPLookup = async (cep: string) => {
    const cleaned = cep.replace(/\D/g, '');
    if (cleaned.length === 8) {
      try {
        const resp = await fetch(`https://viacep.com.br/ws/${cleaned}/json/`);
        const data = await resp.json();
        if (!data.erro) {
          setCustAddress(data.logradouro || '');
          setCustNeighborhood(data.bairro || '');
          const cityVal = data.localidade || '';
          setCustCity(cityVal);
          setCustState(data.uf || '');

          const isLocal = isJoinvilleCEP(cleaned) || cityVal.toLowerCase().trim() === 'joinville';
          if (isLocal) {
            setManualShippingMethod('Pedido Local');
            setManualShippingMethodName('Entrega Local F PAC');
            setManualShippingServiceId(0);
            setManualOrderShipping(11.40);
            toast.success("CEP detectado em Joinville! Configurado para TRILHA LOCAL (Entrega Local).");
          } else {
            setManualShippingMethod('Melhor Envio');
            setManualShippingMethodName('Correios SEDEX');
            setManualShippingServiceId(2);
            setManualOrderShipping(24.90);
            toast.success("CEP fora de Joinville! Configurado para TRILHA NACIONAL (Melhor Envio).");
          }
        }
      } catch (err) {
        console.warn("Failed to lookup CEP:", err);
      }
    }
  };

  // Add audit log helper
  const addAuditLog = async (actionDesc: string, itemsDetailsStr: string) => {
    try {
      const logData = {
        date: new Date().toISOString(),
        user: user?.email || 'admin@fpacstore.com.br',
        action: actionDesc,
        details: itemsDetailsStr,
        createdAt: new Date()
      };
      await setDoc(doc(collection(db, 'audit_logs')), logData);
    } catch (err) {
      console.warn("Failed to save audit log:", err);
    }
  };

  // Fetch audit logs in real-time
  useEffect(() => {
    if (user && activeTab === 'orders' && orderSubView === 'logs') {
      const q = query(collection(db, 'audit_logs'), orderBy('createdAt', 'desc'));
      const unsubscribe = onSnapshot(q, (snapshot) => {
        const logsData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        setAuditLogs(logsData);
      });
      return () => unsubscribe();
    }
  }, [user, activeTab, orderSubView]);

  // Adjustments to itemQty based on selected product available stock
  const getSelectedVariantStock = () => {
    if (!selectedProduct) return 0;
    const invItem = inventory[selectedProduct.slug] || inventory[selectedProduct.id];
    if (!invItem) return 0;
    
    const productHasColors = !!(selectedProduct.colors && selectedProduct.colors.length > 0);
    const variantKey = productHasColors ? `${selectedColor}_${selectedSize}` : selectedSize;
    
    const qty = invItem.variants?.[variantKey]?.stock ?? (invItem.variants?.[variantKey] as any)?.availableStock ?? invItem.stock ?? 0;
    return Number(qty) || 0;
  };

  // Deduct/Subtract stock for manual order creation
  const deductOrderStock = async (finalItems: any[]) => {
    console.log(`[STOCK] Deducting stock for manual order...`, finalItems);
    const SHIRT_SLUGS = ['force', 'mark', 'prime'];

    for (const item of finalItems) {
      const productSlug = item.slug || item.id;
      if (productSlug) {
        const isShirt = SHIRT_SLUGS.includes(productSlug);
        const targetSlugs = isShirt ? SHIRT_SLUGS : [productSlug];

        const prodObj = currentProducts.find(p => p.id === item.id || p.slug === item.slug);
        const hasColors = !!(prodObj?.colors && prodObj.colors.length > 0);
        const variantKey = hasColors ? `${item.color}_${item.size}` : item.size;

        for (const targetSlug of targetSlugs) {
          const inventoryRef = doc(db, 'inventory', targetSlug);
          const invSnap = await getDoc(inventoryRef);
          
          let currentVariants: any = {};
          let rootAvailable = true;
          
          if (invSnap.exists()) {
            const invData = invSnap.data();
            currentVariants = invData.variants || {};
            rootAvailable = invData.available ?? true;
          }
          
          const currentVariant = currentVariants[variantKey] || { stock: 0, available: true };
          const newQty = Math.max(0, (Number(currentVariant.stock) || 0) - (Number(item.quantity) || 0));
          
          const updatedVariants = {
            ...currentVariants,
            [variantKey]: {
              ...currentVariant,
              stock: newQty,
              available: newQty > 0
            }
          };
          
          const totalStock = Object.values(updatedVariants).reduce((sum: number, v: any) => {
            if (v.available === false) return sum;
            const val = Number(v.stock);
            return sum + (isNaN(val) ? 0 : val);
          }, 0) as number;
          
          try {
            await setDoc(inventoryRef, {
              stock: totalStock,
              available: totalStock > 0 || rootAvailable,
              variants: updatedVariants,
              updatedAt: new Date()
            }, { merge: true });
            
            console.log(`[STOCK] Deducted item ${targetSlug} variant ${variantKey} quantity by -${item.quantity}`);
          } catch (err) {
            handleFirestoreError(err, OperationType.WRITE, `inventory/${targetSlug}`);
          }
        }

        // Log to stock_movements for traceability
        try {
          const logRef = doc(collection(db, 'stock_movements'));
          await setDoc(logRef, {
            productId: prodObj?.id || item.id || '',
            productSlug: productSlug,
            productName: prodObj?.name || item.name || productSlug,
            variantKey: variantKey,
            quantity: -Math.abs(Number(item.quantity) || 0),
            type: 'Venda Local',
            operator: user?.email || 'fpacstore@gmail.com',
            createdAt: new Date()
          });
        } catch (err) {
          console.error("Error logging stock movement:", err);
        }
      }
    }
  };

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

  const revertOrderStock = async (order: any) => {
    if (order.stockReverted || order.stockRevertedAcknowledged) {
      console.log(`[STOCK] Stock already reverted for order: ${order.id}`);
      return;
    }

    if (order.stockControl === 'no_move') {
      console.log(`[STOCK] Skipping stock reversion for manual order ${order.id} as it did not move stock originally.`);
      return;
    }
    
    console.log(`[STOCK] Reverting stock for order ${order.id}...`, order.items);
    try {
      const SHIRT_SLUGS = ['force', 'mark', 'prime'];
      const items = order.items || [];
      for (const item of items) {
        // 1. Revert product variants stock
        const productSlug = item.slug || item.id;
        if (productSlug) {
          const isShirt = SHIRT_SLUGS.includes(productSlug);
          const targetSlugs = isShirt ? SHIRT_SLUGS : [productSlug];
          const variantKey = `${item.color}_${item.size}`;

          for (const targetSlug of targetSlugs) {
            const inventoryRef = doc(db, 'inventory', targetSlug);
            const invSnap = await getDoc(inventoryRef);
            
            let currentVariants: any = {};
            let rootAvailable = true;
            
            if (invSnap.exists()) {
              const invData = invSnap.data();
              currentVariants = invData.variants || {};
              rootAvailable = invData.available ?? true;
            }
            
            const currentVariant = currentVariants[variantKey] || { stock: 0, available: true };
            const newQty = (Number(currentVariant.stock) || 0) + (Number(item.quantity) || 0);
            
            const updatedVariants = {
              ...currentVariants,
              [variantKey]: {
                ...currentVariant,
                stock: Math.max(0, newQty),
                available: Math.max(0, newQty) > 0
              }
            };
            
            const totalStock = Object.values(updatedVariants).reduce((sum: number, v: any) => {
              if (v.available === false) return sum;
              const val = Number(v.stock);
              return sum + (isNaN(val) ? 0 : val);
            }, 0) as number;
            
            await setDoc(inventoryRef, {
              stock: totalStock,
              available: totalStock > 0 || rootAvailable,
              variants: updatedVariants,
              updatedAt: new Date()
            }, { merge: true });
            
            console.log(`[STOCK] Reverted item ${targetSlug} variant ${variantKey} quantity by +${item.quantity}`);
          }
        }

        // 2. Revert stamp (estampa) stock
        if (Array.isArray(item.printConfigs) && item.printConfigs.length > 0) {
          for (const print of item.printConfigs) {
            if (!print.stamp || !print.location || !print.printSize) continue;
            
            const estampasRef = collection(db, 'estampas');
            const q = query(estampasRef, where('name', '==', print.stamp));
            const querySnap = await getDocs(q);
            
            if (!querySnap.empty) {
              const stampDoc = querySnap.docs[0];
              const stampData = stampDoc.data();
              
              const locationConfigs = { ...(stampData.locationConfigs || {}) };
              const locConfig = locationConfigs[print.location];
              
              if (locConfig) {
                const sizes = locConfig.sizes || [];
                const quantities = [...(locConfig.quantities || [])];
                
                const sizeIndex = (() => {
                  const clean = (s: string) => String(s || '').split('(')[0].trim().toLowerCase();
                  return (sizes || []).findIndex((sz: string) => clean(sz) === clean(print.printSize));
                })();
                if (sizeIndex !== -1) {
                  const quantity = Number(item.quantity) || 1;
                  const oldQty = Number(quantities[sizeIndex]) || 0;
                  quantities[sizeIndex] = Math.max(0, oldQty + quantity);
                  
                  locationConfigs[print.location] = {
                    ...locConfig,
                    quantities: quantities
                  };
                  
                  await updateDoc(stampDoc.ref, {
                    locationConfigs: locationConfigs,
                    updatedAt: new Date()
                  });
                  console.log(`[STOCK] Reverted stamp "${print.stamp}" location "${print.location}" size "${print.printSize}" by +${quantity}`);
                }
              }
            }
          }
        }
      }
      
      // Update order and set stock reversion flags
      await updateDoc(doc(db, 'orders', order.id), {
        stockReverted: true,
        stockRevertedAcknowledged: true
      });
      toast.success("Estoque de todos os itens retornado ao inventário com sucesso!");
    } catch (err: any) {
      console.error("[STOCK] Failed to revert stock for order:", err);
      toast.error(`Erro ao atualizar estoque: ${err.message}`);
    }
  };

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
        stampGallerySizes: tempStampGallerySizes,
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
      
      const sum = (allowedLocations || []).reduce((accSum: number, loc: string) => {
        const locConfig = locationConfigs?.[loc];
        if (!locConfig) return accSum;
        const quantities = locConfig.quantities || [0, 0, 0, 0];
        const locSum = quantities.reduce((acc: number, qty: any, i: number) => {
          const size = locConfig.sizes?.[i];
          if (!size || size.trim() === '') return acc;
          return acc + (Number(qty) || 0);
        }, 0);
        return accSum + locSum;
      }, 0);

      await setDoc(doc(db, 'estampas', docId), {
        image: tempEstampaImage,
        slotIndex,
        name,
        allowedLocations: allowedLocations || [],
        locationConfigs: locationConfigs || {},
        updatedAt: new Date(),
        createdAt: new Date() // Fallback if it's new
      }, { merge: true });

      // Keep the slot's stock in inventory updated
      await updateStock(docId, sum);

      setEditingEstampaId(null);
      toast.success('Estampa salva!');
    } catch (error) {
      console.error(error);
      toast.error('Erro ao salvar imagem da estampa.');
    }
  };

  const handleDeleteEstampa = async (estampaId: string, slotIndex: number) => {
    try {
      // 1. Delete current data
      const targetId = estampaId || `slot-${slotIndex}`;
      await deleteDoc(doc(db, 'estampas', targetId));
      
      // 2. Shift others (only if we have dynamic estampas loaded)
      const others = dynamicEstampas.filter(e => e.slotIndex > slotIndex);
      const batch: Promise<any>[] = [];
      for (const e of others) {
        batch.push(updateDoc(doc(db, 'estampas', e.id), { slotIndex: e.slotIndex - 1 }));
      }
      await Promise.all(batch);
      
      // 3. Decrement global count and save to config
      const newTotal = Math.max(1, numSlots - 1);
      setNumSlots(newTotal);
      await setDoc(doc(db, 'config', 'brand'), { stampSlots: newTotal }, { merge: true });
      
      // Reset local states
      setEditingEstampaId(null);
      setTempEstampaImage('');
      toast.success('Slot removido e galeria reorganizada.');
    } catch (error) {
      console.error("Erro ao excluir estampa:", error);
      toast.error('Erro ao excluir estampa.');
    }
  };

  const handleFileUpload = async (file: File, folder: string): Promise<string> => {
    setIsUploading(true);
    try {
      const resizedBlob = await resizeImage(file, 800, 800);
      try {
        const storageRef = ref(storage, `${folder}/${Date.now()}_${file.name}`);
        const snapshot = await uploadBytes(storageRef, resizedBlob);
        const url = await getDownloadURL(snapshot.ref);
        return url;
      } catch (storageError) {
        console.warn("Storage upload failed in AdminOrders, falling back to Base64:", storageError);
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
    }, (error) => {
      console.error("Erro ao escutar estampas:", error);
    });

    // Listen to brand config
    const unsubscribeBrand = onSnapshot(doc(db, 'config', 'brand'), (snapshot) => {
      if (snapshot.exists()) {
        const data = snapshot.data();
        setBrandConfig(data);
        if (data.stampSlots) {
          setNumSlots(data.stampSlots);
        }
        setIdentityFormData({
          heroUrl: data.heroUrl || '',
          aboutUrl: data.aboutUrl || '',
          catalogImage1: data.catalogImage1 || '',
          catalogImage2: data.catalogImage2 || '',
          communityUrls: data.communityUrls || ['', '', '', ''],
          hideOutOfStock: data.hideOutOfStock ?? false
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
      name.includes('TESTE') || 
      slug.includes('TESTE') ||
      name.includes('TEST') || 
      slug.includes('TEST') ||
      name === 'PRODUTO TESTE PAGAMENTO' ||
      slug === 'PRODUTO-TESTE-PAGAMENTO' ||
      name.includes('PAGAMENTO TESTE') ||
      slug.includes('PAGAMENTO-TESTE') ||
      slug === 'TESTE-CHECKOUT' ||
      name === 'TESTE CHECKOUT' ||
      slug === 'MARK-PRIME-TEST';

    return p.name && p.name.trim() !== '' && !isTest;
  });

  // Calculate detailed inventory metrics
  const inventoryMetrics = useMemo(() => {
    let totalStock = 0;
    const byProduct: Record<string, number> = {};
    const byColor: Record<string, number> = {};
    const bySize: Record<string, number> = {};

    Object.entries(inventory).forEach(([itemId, data]: [string, any]) => {
      // 1. Encontrar o produto correspondente nos produtos atuais (filtrados)
      const p = currentProducts.find(cp => cp.id === itemId || cp.slug === itemId);
      
      // Se não for um produto ativo/visível, ou for uma Linha Mãe (pois o estoque físico reside nas estampas filhas), ignoramos para evitar dupla contagem
      if (!p || !p.name || p.slug === 'force' || p.slug === 'mark' || p.slug === 'prime') return;

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

  // Calculate detailed stamp inventory metrics
  const stampInventoryMetrics = useMemo(() => {
    let totalStock = 0;
    const byStamp: Record<string, { total: number; variations: { label: string; qty: number }[]; image?: string }> = {};

    dynamicEstampas.forEach((estampa) => {
      if (!estampa?.name) return;
      const name = estampa.name;
      const logoImg = estampa.image || estampa.path || '';

      if (!byStamp[name]) {
        byStamp[name] = { total: 0, variations: [], image: logoImg };
      }

      const allowed = estampa.allowedLocations || [];
      const configs = estampa.locationConfigs || {};

      allowed.forEach((loc: string) => {
        const locConfig = configs[loc];
        if (!locConfig) return;

        const sizes = locConfig.sizes || [];
        const quantities = locConfig.quantities || [];

        sizes.forEach((size: string, idx: number) => {
          if (!size || size.trim() === '') return;
          const qty = Number(quantities[idx]) || 0;

          byStamp[name].variations.push({
            label: `${loc} (${size})`,
            qty
          });
          byStamp[name].total += qty;
          totalStock += qty;
        });
      });
    });

    return {
      totalStock,
      byStamp: Object.entries(byStamp).map(([name, data]) => ({
        name,
        ...data
      }))
    };
  }, [dynamicEstampas]);

  const filteredStampStock = useMemo(() => {
    return (stampInventoryMetrics.byStamp || []).filter(stamp => {
      const matchesSearch = stamp.name.toLowerCase().includes(stampSearch.toLowerCase());
      let matchesStock = true;
      if (stampStockFilter === 'in_stock') {
        matchesStock = stamp.total > 0;
      } else if (stampStockFilter === 'out_of_stock') {
        matchesStock = stamp.total === 0;
      }
      return matchesSearch && matchesStock;
    });
  }, [stampInventoryMetrics.byStamp, stampSearch, stampStockFilter]);

  const financialStats = useMemo(() => {
    const activeOrders = orders.filter(o => o.status !== 'cancelled' && o.status !== 'Pagamento Não Realizado');
    const paymentConfirmed = orders.filter(o => ['Pagamento Aprovado', 'payment_approved', 'separacao', 'embalagem', 'shipped', 'delivered'].includes(o.status));
    
    const revenue = paymentConfirmed.reduce((acc, o) => acc + (o.total || 0), 0);
    const pendingRevenue = activeOrders.filter(o => !['Pagamento Aprovado', 'payment_approved', 'separacao', 'embalagem', 'shipped', 'delivered', 'cancelled'].includes(o.status)).reduce((acc, o) => acc + (o.total || 0), 0);
    
    let totalCogs = 0;
    paymentConfirmed.forEach(order => {
      (order.items || []).forEach((item: any) => {
        const prod = currentProducts.find(p => p.id === item.id || p.slug === item.slug);
        const cost = prod?.costPrice || 0;
        totalCogs += cost * (item.quantity || 1);
      });
    });

    // Estimativa de taxas gateway (5%) e frete médio
    const gatewayFees = revenue * 0.05;
    const shippingCosts = paymentConfirmed.reduce((acc, o) => acc + (o.shipping || 0), 0);
    
    const grossProfit = revenue - totalCogs;
    const netProfit = revenue - totalCogs - gatewayFees - shippingCosts;

    return { revenue, pendingRevenue, totalCogs, gatewayFees, shippingCosts, grossProfit, netProfit };
  }, [orders, currentProducts]);

  // --- BI / INDUSTRIAL INTELLIGENCE REPORTS REAL-TIME useMemo ---
  const reportData = useMemo(() => {
    let filtered = [...orders];

    // 1. Filter by Paid / Approved statuses
    if (repStatus === 'paid') {
      filtered = filtered.filter(o => ['delivered', 'shipped', 'payment_approved', 'Pagamento Aprovado', 'separacao', 'embalagem', 'Pago'].includes(o.status));
    } else if (repStatus === 'pending') {
      filtered = filtered.filter(o => ['received', 'payment_pending', 'Aguardando Pagamento PIX', 'Aguardando Pagamento'].includes(o.status));
    } else if (repStatus === 'cancelled') {
      filtered = filtered.filter(o => ['cancelled', 'Cancelado', 'payment_failed', 'Pagamento Não Realizado'].includes(o.status));
    }

    // 2. Filter by Channel / Origin
    if (repChannel !== 'all') {
      filtered = filtered.filter(o => {
        const origin = o.isManual ? (o.origin || 'Outro') : 'Site';
        return origin.toLowerCase() === repChannel.toLowerCase();
      });
    }

    // 3. Filter by Period / Date Range
    const now = new Date();
    filtered = filtered.filter(o => {
      const oDate = o.createdAt?.toMillis ? new Date(o.createdAt.toMillis()) : (o.createdAt?.seconds ? new Date(o.createdAt.seconds * 1000) : new Date(o.createdAt || now));
      const diffMs = now.getTime() - oDate.getTime();
      const diffDays = diffMs / (1000 * 60 * 60 * 24);

      if (repPeriod === 'today') {
        return oDate.toDateString() === now.toDateString();
      } else if (repPeriod === '7days') {
        return diffDays <= 7;
      } else if (repPeriod === '30days') {
        return diffDays <= 30;
      } else if (repPeriod === 'thisMonth') {
        return oDate.getMonth() === now.getMonth() && oDate.getFullYear() === now.getFullYear();
      } else if (repPeriod === 'lastMonth') {
        const prevMonth = now.getMonth() === 0 ? 11 : now.getMonth() - 1;
        const prevYear = now.getMonth() === 0 ? now.getFullYear() - 1 : now.getFullYear();
        return oDate.getMonth() === prevMonth && oDate.getFullYear() === prevYear;
      }
      return true; // 'all'
    });

    // Initialize metrics
    let totalRevenue = 0;
    let totalCogs = 0;
    let totalShipping = 0;
    const channelSales: Record<string, any> = {};
    const productSales: Record<string, any> = {};

    filtered.forEach(o => {
      // Base revenue
      const orderTotal = Number(o.total) || 0;
      const orderShipping = Number(o.shipping || o.frete || 0);
      const isPaid = ['delivered', 'shipped', 'payment_approved', 'Pagamento Aprovado', 'separacao', 'embalagem', 'Pago'].includes(o.status);

      // Accumulate metrics if we match product / model filters
      const items = o.items || [];
      let orderMatchesFilter = false;
      let orderAccumRevenue = 0;
      let orderAccumCogs = 0;

      items.forEach((item: any) => {
        // Apply product / model filters inside loop
        const prId = item.id || '';
        const prName = item.name || 'Artigo';
        const matchesProduct = repProduct === 'all' || prId === repProduct;
        
        let matchesModel = repModel === 'all';
        if (repModel !== 'all') {
          const descriptionString = String(item.name || '').toLowerCase();
          matchesModel = descriptionString.includes(repModel.toLowerCase());
        }

        if (matchesProduct && matchesModel) {
          orderMatchesFilter = true;
          const qty = Number(item.quantity || item.qty || 1);
          const price = Number(item.price || 0);
          const revenueContrib = price * qty;
          
          // Cost of goods attribution
          let unitCost = 40;
          const lowerName = prName.toLowerCase();
          if (lowerName.includes('force')) unitCost = 40;
          else if (lowerName.includes('mark')) unitCost = 51;
          else if (lowerName.includes('prime')) unitCost = 42;

          const cogsContrib = unitCost * qty;

          orderAccumRevenue += revenueContrib;
          orderAccumCogs += cogsContrib;

          // Product list sales
          if (!productSales[prName]) {
            productSales[prName] = { qty: 0, revenue: 0, cogs: 0 };
          }
          productSales[prName].qty += qty;
          productSales[prName].revenue += revenueContrib;
          productSales[prName].cogs += cogsContrib;
        }
      });

      // If order matches product filtering criteria, add to general KPIs
      if (repProduct === 'all' && repModel === 'all') {
        const origin = o.isManual ? (o.origin || 'Outro') : 'Site';
        if (!channelSales[origin]) {
          channelSales[origin] = { total: 0, count: 0 };
        }
        channelSales[origin].count += 1;
        
        if (isPaid) {
          channelSales[origin].total += orderTotal;
          totalRevenue += orderTotal;
          totalShipping += orderShipping;
          
          // Fallback COGS compute over entire items
          items.forEach((item: any) => {
            const prName = item.name || '';
            const qty = Number(item.quantity || item.qty || 1);
            let unitCost = 40;
            const lowerName = prName.toLowerCase();
            if (lowerName.includes('force')) unitCost = 40;
            else if (lowerName.includes('mark')) unitCost = 51;
            else if (lowerName.includes('prime')) unitCost = 42;
            totalCogs += unitCost * qty;
          });
        }
      } else if (orderMatchesFilter) {
        // Segmented totals
        if (isPaid) {
          totalRevenue += orderAccumRevenue;
          totalCogs += orderAccumCogs;
          
          const origin = o.isManual ? (o.origin || 'Outro') : 'Site';
          if (!channelSales[origin]) {
            channelSales[origin] = { total: 0, count: 0 };
          }
          channelSales[origin].count += 1;
          channelSales[origin].total += orderAccumRevenue;
        }
      }
    });

    const gatewayFees = totalRevenue * 0.05;
    const netProfit = totalRevenue - totalCogs - gatewayFees - totalShipping;

    // Calculate stock/inventory movement stats dynamically based on filtered list
    const stockMoveOrders = filtered.filter(o => o.status !== 'cancelled' && o.status !== 'Pagamento Não Realizado' && o.stockControl !== 'no_move');
    const stockNoMoveOrders = filtered.filter(o => o.status !== 'cancelled' && o.status !== 'Pagamento Não Realizado' && o.stockControl === 'no_move');

    const ordersWithStockMove = stockMoveOrders.length;
    const ordersWithStockMoveRevenue = stockMoveOrders.reduce((acc, o) => acc + (Number(o.total) || 0), 0);

    const ordersWithoutStockMove = stockNoMoveOrders.length;
    const ordersWithoutStockMoveRevenue = stockNoMoveOrders.reduce((acc, o) => acc + (Number(o.total) || 0), 0);

    const totalStockMovedQty = stockMoveOrders.reduce((acc, o) => acc + (o.items || []).reduce((sum: number, item: any) => sum + (Number(item.quantity || item.qty) || 0), 0), 0);
    const totalStockNotMovedQty = stockNoMoveOrders.reduce((acc, o) => acc + (o.items || []).reduce((sum: number, item: any) => sum + (Number(item.quantity || item.qty) || 0), 0), 0);

    return {
      revenue: totalRevenue,
      cogs: totalCogs,
      shipping: totalShipping,
      gatewayFees,
      netProfit,
      channelSales,
      productSales,
      ordersWithStockMove,
      ordersWithStockMoveRevenue,
      ordersWithoutStockMove,
      ordersWithoutStockMoveRevenue,
      totalStockMovedQty,
      totalStockNotMovedQty
    };
  }, [orders, repPeriod, repProduct, repModel, repChannel, repStatus, currentProducts]);

  const handleMelhorEnvioLabel = async (order: any, skipValidation: boolean = false) => {
    // Block local orders from generating labels in Melhor Envio
    const isJoinvilleLocal = (order.cep && isJoinvilleCEP(order.cep)) || String(order.city || '').toLowerCase() === 'joinville';
    if (isJoinvilleLocal) {
      toast.error("Pedidos locais (Joinville) utilizam apenas a Trilha Local de entrega própria (Etiqueta A). O envio ao Melhor Envio foi bloqueado para este CEP local.", { duration: 5000 });
      return;
    }

    // Validate required fields for Melhor Envio
    const postalCode = String(order.cep || (order.address as any)?.cep || '').replace(/\D/g, '');
    const document = String(order.customerCpf || order.cpf || '').replace(/\D/g, '');
    const phone = String(order.customerPhone || '').replace(/\D/g, '');
    const street = (order.address && typeof order.address === 'object') ? (order.address as any).street : (order.address || '');
    const number = order.number || (order.address as any)?.number || '';
    const neighborhood = order.neighborhood || (order.address as any)?.neighborhood || '';
    const city = order.city || (order.address as any)?.city || '';
    const state = order.state || (order.address as any)?.state || '';
    const email = order.customerEmail || '';
    const name = order.customerName || '';

    const isInvalid = !skipValidation && (
      postalCode.length !== 8 ||
      document.length < 11 ||
      (!isValidCPF(document) && !isValidCNPJ(document)) ||
      phone.length < 10 ||
      street.trim() === '' ||
      number.trim() === '' ||
      neighborhood.trim() === '' ||
      city.trim() === '' ||
      state.trim().length !== 2 ||
      email.trim() === '' ||
      name.trim() === ''
    );

    if (isInvalid) {
      setValidationOrder(order);
      setValName(name);
      setValPhone(order.customerPhone || '');
      setValEmail(email);
      setValCpf(order.customerCpf || order.cpf || '');
      setValCep(order.cep || (order.address as any)?.cep || '');
      setValStreet(street);
      setValNumber(number);
      setValComplement(order.complement || (order.address as any)?.complement || '');
      setValNeighborhood(neighborhood);
      setValCity(city);
      setValState(state);
      setIsValidationModalOpen(true);
      return;
    }

    const toastId = toast.loading('Gerando etiqueta...');
    try {
      const resp = await fetch('/api/shipping/create-label', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          serviceId: Number(order.shippingServiceId || 2), // Use selected serviceId or default to SEDEX (2)
          from: {
            name: "F PAC STORE",
            phone: "47997465602",
            email: "fpacstore@gmail.com",
            postal_code: "89234100",
            address: "Rua Paranaguamirim",
            number: "1395",
            neighborhood: "Paranaguamirim",
            city: "Joinville",
            state: "SC"
          },
          to: {
             name: name,
             phone: phone,
             email: email,
             document: document,
             postal_code: postalCode,
             address: street,
             number: number || 'SN',
             complement: order.complement || (order.address as any)?.complement || '',
             neighborhood: neighborhood,
             city: city,
             state: state
          },
          items: (order.items || []).map((it: any) => ({
             name: it.name,
             quantity: it.quantity,
             unitary_value: it.price,
             unit_value: it.price
          })),
          volumes: (() => {
            let totalWeight = 0;
            let maxHeight = 0;
            let maxWidth = 0;
            let maxLength = 0;

            (order.items || []).forEach((it: any) => {
              const qty = Number(it.quantity || 1);
              const dbProd = currentProducts?.find((p: any) => p.id === it.id || p.slug === it.slug || p.name === it.name);
              
              const w = Number(it.weight || dbProd?.weight || 0.3);
              const h = Number(it.height || dbProd?.height || 5);
              const wd = Number(it.width || dbProd?.width || 17);
              const lg = Number(it.length || dbProd?.length || 11);

              totalWeight += w * qty;
              maxHeight += h * qty;
              maxWidth = Math.max(maxWidth, wd);
              maxLength = Math.max(maxLength, lg);
            });

            maxHeight = maxHeight || 5;
            maxWidth = maxWidth || 17;
            maxLength = maxLength || 11;
            totalWeight = totalWeight || 0.3;

            return [{
              height: Number(maxHeight.toFixed(2)),
              width: Number(maxWidth.toFixed(2)),
              length: Number(maxLength.toFixed(2)),
              weight: Number(totalWeight.toFixed(2))
            }];
          })(),
          totalValue: order.total
        })
      });
      
      const data = await resp.json();
      if (data.id) {
        toast.success("Adicionado ao Melhor Envio!", { id: toastId });
        const redirectUrl = data.redirectUrl || 
          (meBaseUrl.includes('sandbox') 
            ? 'https://sandbox.melhorenvio.com.br/painel/envios/carrinho'
            : 'https://painel.melhorenvio.com.br/envios/carrinho');
        window.open(redirectUrl, '_blank');
      } else {
        throw new Error(data.message || data.error || 'Erro ao gerar etiqueta');
      }
    } catch (e: any) {
      const errStr = String(e.message || '');
      if (errStr.includes('não podem ser iguais') || (errStr.includes('remetente') && errStr.includes('destinatário'))) {
        toast.dismiss(toastId);
        toast.error("O CPF de envio e destino são idênticos! Por favor, ajuste o CPF no painel de correção.");
        
        // Open validation modal with warning banner
        setMeCpfWarning(true);
        setValidationOrder(order);
        setValName(name);
        setValPhone(order.customerPhone || '');
        setValEmail(email);
        setValCpf(order.customerCpf || order.cpf || '');
        setValCep(order.cep || (order.address as any)?.cep || '');
        setValStreet(street);
        setValNumber(number);
        setValComplement(order.complement || (order.address as any)?.complement || '');
        setValNeighborhood(neighborhood);
        setValCity(city);
        setValState(state);
        setIsValidationModalOpen(true);
        return;
      }
      toast.error(`Erro: ${e.message}`, { id: toastId });
      console.error(e);
    }
  };

  const handleSaveAndGenerateLabel = async () => {
    if (!validationOrder) return;
    
    // Validate inputs locally first
    const cleanCep = valCep.replace(/\D/g, '');
    const cleanCpf = valCpf.replace(/\D/g, '');
    const cleanPhone = valPhone.replace(/\D/g, '');
    
    if (!valName.trim()) {
      toast.error('O campo Nome é obrigatório');
      return;
    }
    if (cleanPhone.length < 10) {
      toast.error('Por favor, informe um telefone válido com DDD');
      return;
    }
    if (!valEmail.trim() || !valEmail.includes('@')) {
      toast.error('Por favor, informe um e-mail válido');
      return;
    }
    if (cleanCpf.length < 11 || (!isValidCPF(cleanCpf) && !isValidCNPJ(cleanCpf))) {
      toast.error('Por favor, informe um CPF/CNPJ matematicamente válido');
      return;
    }
    if (cleanCep.length !== 8) {
      toast.error('Por favor, informe um CEP válido com 8 dígitos');
      return;
    }
    if (!valStreet.trim()) {
      toast.error('O campo Endereço/Rua é obrigatório');
      return;
    }
    if (!valNumber.trim()) {
      toast.error('O campo Número é obrigatório');
      return;
    }
    if (!valNeighborhood.trim()) {
      toast.error('O campo Bairro é obrigatório');
      return;
    }
    if (!valCity.trim()) {
      toast.error('O campo Cidade é obrigatório');
      return;
    }
    if (valState.trim().length !== 2) {
      toast.error('Por favor, informe o Estado com 2 letras (UF ex: SC, SP)');
      return;
    }

    const toastId = toast.loading('Salvando dados e gerando etiqueta...');
    try {
      // Update order in Firestore
      const orderRef = doc(db, 'orders', validationOrder.id);
      const updatedData = {
        customerName: valName,
        customerPhone: valPhone,
        customerEmail: valEmail,
        customerCpf: valCpf,
        cep: valCep,
        address: valStreet,
        number: valNumber,
        complement: valComplement,
        neighborhood: valNeighborhood,
        city: valCity,
        state: valState.toUpperCase()
      };
      
      await updateDoc(orderRef, updatedData);
      
      // Update the template state locally so the interface updates
      const updatedOrder = {
        ...validationOrder,
        ...updatedData
      };
      
      setIsValidationModalOpen(false);
      toast.dismiss(toastId);
      
      // Re-trigger label creation with validated data
      await handleMelhorEnvioLabel(updatedOrder, true);
    } catch (e: any) {
      toast.error(`Erro ao salvar dados: ${e.message}`, { id: toastId });
    }
  };

  const handlePrintLocalLabel = (order: any) => {
    const printWindow = window.open('', '_blank', 'width=600,height=800');
    if (!printWindow) {
      toast.error("Permissão de popup bloqueada pelo seu navegador. Por favor, permita popups para poder imprimir etiquetas.");
      return;
    }

    const itemsHtml = (order.items || []).map((it: any) => 
      `<li>[${it.quantity}x] ${it.name} - ${it.color} / ${it.size}</li>`
    ).join('');

    const addressInfo = typeof order.address === 'object' ? {
      street: (order.address as any).street || 'Rua não informada',
      number: order.number || (order.address as any).number || 'S/N',
      complement: order.complement || (order.address as any).complement || '',
      neighborhood: order.neighborhood || (order.address as any).neighborhood || '',
      city: order.city || (order.address as any).city || 'Joinville',
      state: order.state || (order.address as any).state || 'SC',
      cep: order.cep || (order.address as any).cep || ''
    } : {
      street: order.address || 'Endereço não informado',
      number: order.number || 'S/N',
      complement: order.complement || '',
      neighborhood: order.neighborhood || '',
      city: order.city || 'Joinville',
      state: order.state || 'SC',
      cep: order.cep || ''
    };

    printWindow.document.write(`
      <html>
        <head>
          <title>Etiqueta Local - #${order.id}</title>
          <style>
            @page {
              size: 100mm 150mm;
              margin: 0;
            }
            body {
              font-family: Arial, sans-serif;
              margin: 0;
              padding: 6mm;
              box-sizing: border-box;
              background: white;
              color: black;
              width: 100mm;
              height: 150mm;
            }
            .container {
              border: 3px solid black;
              padding: 6px;
              height: 100%;
              box-sizing: border-box;
              display: flex;
              flex-direction: column;
              justify-content: space-between;
              border-radius: 4px;
            }
            .header {
              text-align: center;
              border-bottom: 2px dashed black;
              padding-bottom: 6px;
              margin-bottom: 6px;
            }
            .header h1 {
              font-size: 16px;
              margin: 0;
              font-weight: 900;
              letter-spacing: 1px;
            }
            .header p {
              font-size: 8px;
              margin: 2px 0 0 0;
            }
            .section-title {
              font-size: 9px;
              font-weight: bold;
              text-transform: uppercase;
              margin: 4px 0 2px 0;
              background: black;
              color: white;
              padding: 2px;
              text-align: center;
              letter-spacing: 1px;
            }
            .address-box {
              font-size: 10px;
              line-height: 1.3;
            }
            .recipient-name {
              font-size: 13px;
              font-weight: 900;
              margin-bottom: 4px;
            }
            .items-list {
              font-size: 8px;
              margin: 0;
              padding-left: 12px;
            }
            .footer {
              border-top: 2px dashed black;
              padding-top: 6px;
              margin-top: 6px;
              font-size: 8px;
              text-align: center;
            }
            .order-id {
              font-size: 14px;
              font-weight: 900;
            }
            .barcode-lines {
              display: flex;
              height: 25px;
              width: 100%;
              justify-content: center;
              align-items: stretch;
              margin: 4px 0 2px 0;
            }
            .barcode-lines div {
              background: black;
            }
            .tag {
              border: 1.5px solid black;
              padding: 2px 6px;
              display: inline-block;
              font-weight: 900;
              font-size: 10px;
              margin-bottom: 4px;
              background: #f0f0f0;
            }
          </style>
        </head>
        <body>
          <div class="container">
            <div>
              <div class="header">
                <h1>F PAC STORE</h1>
                <p>REM: RUA PARANAGUAMIRIM, 1395 - PARANAGUAMIRIM - JOINVILLE/SC</p>
                <p>CONTATO: (47) 997465602</p>
              </div>
              
              <div style="text-align: center;">
                <span class="tag">🏍️ MODELO A: PEDIDO LOCAL (ENTREGA DIRETA)</span>
              </div>

              <div class="section-title">Destinatário</div>
              <div class="address-box">
                <div class="recipient-name">${String(order.customerName || 'Cliente').toUpperCase()}</div>
                <div><b>Endereço:</b> ${String(addressInfo.street).toUpperCase()}, ${String(addressInfo.number).toUpperCase()}</div>
                ${addressInfo.complement ? '<div><b>Comp:</b> ' + String(addressInfo.complement).toUpperCase() + '</div>' : ''}
                <div><b>Bairro:</b> ${String(addressInfo.neighborhood).toUpperCase()}</div>
                <div><b>Cidade/UF:</b> ${String(addressInfo.city).toUpperCase()} / ${String(addressInfo.state).toUpperCase()}</div>
                <div><b>CEP:</b> ${addressInfo.cep}</div>
                <div><b>Fone:</b> ${order.customerPhone || ''} ${order.customerPhone2 ? '/ ' + order.customerPhone2 : ''}</div>
              </div>

              <div class="section-title">Itens do Pedido</div>
              <ul class="items-list">
                ${itemsHtml}
              </ul>

              ${order.observations ? `
                <div class="section-title">Observações de Entrega</div>
                <div style="font-size: 8px; font-style: italic; max-height: 38px; overflow: hidden; font-weight: bold; padding: 2px;">
                  ${order.observations}
                </div>
              ` : ''}
            </div>

            <div class="footer">
              <div class="barcode-lines">
                <div style="width: 2px; margin-right: 1px;"></div>
                <div style="width: 1px; margin-right: 2px;"></div>
                <div style="width: 3px; margin-right: 1px;"></div>
                <div style="width: 1px; margin-right: 1px;"></div>
                <div style="width: 4px; margin-right: 2px;"></div>
                <div style="width: 2px; margin-right: 1px;"></div>
                <div style="width: 1px; margin-right: 3px;"></div>
                <div style="width: 3px; margin-right: 1px;"></div>
                <div style="width: 2px; margin-right: 1px;"></div>
                <div style="width: 1px; margin-right: 1px;"></div>
                <div style="width: 4px; margin-right: 1px;"></div>
                <div style="width: 2px; margin-right: 2px;"></div>
                <div style="width: 1px; margin-right: 1px;"></div>
                <div style="width: 3px; margin-right: 1px;"></div>
                <div style="width: 2px; margin-right: 3px;"></div>
                <div style="width: 1px; margin-right: 1px;"></div>
                <div style="width: 4px; margin-right: 1px;"></div>
                <div style="width: 2px; margin-right: 2px;"></div>
                <div style="width: 1px; margin-right: 1px;"></div>
                <div style="width: 3px; margin-right: 1px;"></div>
              </div>
              <div class="order-id">PEDIDO #${order.id}</div>
            </div>
          </div>
          <script>
            window.onload = function() {
              window.print();
              setTimeout(function() { window.close(); }, 800);
            };
          </script>
        </body>
      </html>
    `);
    printWindow.document.close();
  };

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

      // If status changes to cancelled/canceled/Pagamento Não Realizado, run revert stock
      const isCancellation = ['cancelled', 'canceled', 'Pagamento Não Realizado'].includes(newStatus);
      if (isCancellation) {
        const orderSnap = await getDoc(doc(db, 'orders', orderId));
        if (orderSnap.exists()) {
          const orderData = orderSnap.data();
          const alreadyReverted = orderData?.stockReverted || orderData?.stockRevertedAcknowledged;
          if (!alreadyReverted) {
            await revertOrderStock({ id: orderId, ...orderData });
          }
        }
      }

      await updateDoc(doc(db, 'orders', orderId), updateData);
      
      // Fetch fresh order data to ensure we have all fields for the email
      const orderSnap = await getDoc(doc(db, 'orders', orderId));
      if (orderSnap.exists()) {
        const orderData = orderSnap.data();
        // Disparar o e-mail em background
        triggerStatusEmail({ id: orderSnap.id, ...orderData }, newStatus);
        
        // Audit log
        await addAuditLog(
          "Alteração de Status",
          `Pedido #${orderId} de ${orderData.customerName || 'Cliente'} atualizado para: ${newStatus}`
        );
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
    const name = String(order.customerName || 'Cliente').split(' ')[0].toUpperCase();
    let message = '';
    
    if (type === 'preparando') {
      message = `👕 F PAC STORE • NÃO É SÓ ROUPA. É IDENTIDADE! 👕\n━━━━━━━━━━━━━━━━━━━━━━━━━━━\nFala ${name}!\n\n👕 PEDIDO EM PRODUÇÃO! 👕\n\nO pedido *#${order.id}* está sendo preparado e logo será enviado para você. 🚀\n\nAcompanhe: https://www.fpacstore.com.br/tracking`;
    } else {
      let content = '';
      if (type === 'pagamento') {
        content = `🛒 *RECEBEMOS SEU PEDIDO!* 🛒\n\nSeu pedido *#${order.id}* foi gerado com sucesso.\n\n👉 *CONCLUIR COM SEGURANÇA VIA PIX / CARTÃO:* \n${order.paymentLink || `${getBaseUrl()}/#/order/${order.id}`}\n\n⚠️ _Se já pagou, por favor ignore esta mensagem._`;
      } else if (type === 'aprovado') {
        content = `✅ *PAGAMENTO CONFIRMADO!* ✅\n\nSeu pedido *#${order.id}* foi aprovado com sucesso! Já está em nossa linha de produção e em breve será preparado para o envio.`;
      } else if (type === 'enviado') {
        content = `🚀 *SEU PEDIDO FOI ENVIADO!* 🚀\n\nSeu pedido *#${order.id}* já está a caminho! Prepare-se para vestir a sua identidade com estilo.`;
      }
      message = `👕 F PAC STORE • NÃO É SÓ ROUPA. É IDENTIDADE! 👕\n━━━━━━━━━━━━━━━━━━━━━━━━━━━\nFala *${name}*!\n\n${content}\n\n👉 *ACOMPANHE SEU PEDIDO:* \n${getBaseUrl()}/#/order/${order.id}\n━━━━━━━━━━━━━━━━━━━━━━━━━━━\n🌟CANAIS OFICIAIS F PAC STORE:\n🌐 Site Oficial: www.fpacstore.com.br\n📸 Instagram: @f_pac_store\n💬 WhatsApp Oficial: (47) 99746-5602\n📍 Loja/Expedição em Joinville/SC\n🛡️Esta é uma mensagem automática de suporte e acompanhamento de pedido.`;
    }

    window.open(`https://wa.me/${cleanPhone}?text=${encodeURIComponent(message)}`, '_blank');
  };

  const handleStatusUpdate = async (order: Order, status: string) => {
    await updateStatus(order.id, status);
    // WhatsApp manual
    if (status === 'payment_approved' || status === 'Pagamento Aprovado') notifyCustomer(order, 'aprovado');
    if (status === 'separacao') notifyCustomer(order, 'preparando');
    if (status === 'shipped') notifyCustomer(order, 'enviado');
  };

  const handleSaveIdentity = async () => {
    setIsUploading(true);
    try {
      const cleanedData = {
        ...identityFormData,
        heroUrl: convertDriveUrlToDirect(identityFormData.heroUrl || ''),
        aboutUrl: convertDriveUrlToDirect(identityFormData.aboutUrl || ''),
        catalogImage1: convertDriveUrlToDirect(identityFormData.catalogImage1 || ''),
        catalogImage2: convertDriveUrlToDirect(identityFormData.catalogImage2 || ''),
        communityUrls: (identityFormData.communityUrls || []).map(url => convertDriveUrlToDirect(url || ''))
      };

      await setDoc(doc(db, 'config', 'brand'), {
        ...cleanedData,
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

  const handleDeleteOrder = async (orderId: string) => {
    try {
      const orderRef = doc(db, 'orders', orderId);
      const orderSnap = await getDoc(orderRef);
      if (orderSnap.exists()) {
        const orderData = orderSnap.data();
        const isAlreadyCancelled = ['cancelled', 'canceled', 'Pagamento Não Realizado'].includes(orderData.status);
        const alreadyReverted = orderData.stockReverted || orderData.stockRevertedAcknowledged;
        
        // Revert stock if it was subtracted and not yet reverted
        if (!isAlreadyCancelled && !alreadyReverted) {
          await revertOrderStock({ id: orderId, ...orderData });
        }

        // Save audit log before deletion
        await addAuditLog(
          "Exclusão de Pedido",
          `Pedido #${orderId} de ${orderData.customerName || 'Cliente'} no valor de R$ ${orderData.total || 0} excluído permanentemente.`
        );
      }
      
      await deleteDoc(orderRef);
      toast.success("Pedido excluído permanentemente.");
      setConfirmDeleteId(null);
    } catch (error: any) {
      console.error("Erro ao excluir pedido:", error);
      toast.error(`Erro: ${error.message || 'Não foi possível excluir'}`);
    }
  };

  const handleSaveManualOrder = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!custName.trim()) {
      toast.error("Por favor, preencha o nome do cliente.");
      return;
    }
    if (!custPhone.trim()) {
      toast.error("Por favor, preencha o telefone do cliente.");
      return;
    }
    if (tempItems.length === 0) {
      toast.error("Adicione pelo menos um produto ao pedido.");
      return;
    }

    setSavingManualOrder(true);
    try {
      const orderId = `MANUAL-${Date.now().toString().slice(-5)}-${Math.floor(100 + Math.random() * 900)}`;
      
      const subTotalSum = tempItems.reduce((acc, item) => acc + (item.price * item.quantity), 0);
      const totalSum = Math.max(0, subTotalSum + Number(manualOrderShipping) - Number(manualOrderDiscount));

      // Construct item list expected by standard renderer
      const finalItems = tempItems.map(item => ({
        id: item.product.id,
        slug: item.product.slug,
        name: item.product.name,
        color: item.color,
        size: item.size,
        quantity: Number(item.quantity),
        price: Number(item.price),
        image: item.product.images?.[0] || '/logos/logo-fpac.png',
        printConfigs: []
      }));

      // Map manualOrderStatus friendly values
      let firestoreStatus: string = 'Aguardando Pagamento PIX';
      if (manualOrderStatus === 'Pago') firestoreStatus = 'Pagamento Aprovado';
      else if (manualOrderStatus === 'Em produção') firestoreStatus = 'separacao';
      else if (manualOrderStatus === 'Enviado') firestoreStatus = 'shipped';
      else if (manualOrderStatus === 'Entregue') firestoreStatus = 'delivered';
      else if (manualOrderStatus === 'Cancelado') firestoreStatus = 'cancelled';

      const orderRef = doc(db, 'orders', orderId);
      const orderPayload = {
        id: orderId,
        customerName: custName,
        customerPhone: custPhone,
        customerPhone2: custPhone2,
        customerEmail: custEmail || '',
        address: isRetirada ? 'Retirada na Loja' : custAddress,
        number: isRetirada ? '' : custNumber,
        complement: isRetirada ? '' : custComplement,
        neighborhood: isRetirada ? '' : custNeighborhood,
        city: isRetirada ? 'Retirada' : custCity,
        state: isRetirada ? 'RET' : custState,
        cep: isRetirada ? '' : custCep,
        items: finalItems,
        subtotal: subTotalSum,
        shipping: Number(manualOrderShipping),
        couponDiscount: Number(manualOrderDiscount),
        total: totalSum,
        paymentMethod: paymentMethodForm,
        status: firestoreStatus,
        origin: orderOrigin,
        gateway: 'manual',
        observations: manualOrderObs,
        deliveryDate: manualOrderDeliveryDate,
        isManual: true,
        shippingMethod: isRetirada ? 'Retirada' : manualShippingMethod,
        shippingMethodName: isRetirada ? 'Retirada na Loja' : manualShippingMethodName,
        shippingServiceId: isRetirada ? 0 : manualShippingServiceId,
        stockControl: stockControl, // Save Option Chosen ('move' | 'no_move')
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      };

      try {
        await setDoc(orderRef, orderPayload);

        // Disparar envio automático de WhatsApp para pedido manual se o status for Aguardando Pagamento
        if (firestoreStatus === 'Aguardando Pagamento PIX' || manualOrderStatus === 'Aguardando Pagamento') {
          console.log(`[WA-AUTO] Disparando envio automático de WhatsApp para o pedido manual #${orderId}`);
          fetch(getApiUrl('/api/automation/send-manual-order-whatsapp'), {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({ orderId })
          }).then(async (res) => {
            if (!res.ok) {
              const errData = await res.json().catch(() => ({}));
              throw new Error(errData.error || `HTTP error ${res.status}`);
            }
            return res.json();
          }).then((data) => {
            if (data.success) {
              console.log(`[WA-AUTO] ✅ WhatsApp enviado com sucesso para o pedido #${orderId}`);
            } else {
              console.warn(`[WA-AUTO] ⚠️ Falha ao enviar WhatsApp para o pedido #${orderId}:`, data.logEntry?.error || data);
            }
          }).catch((err) => {
            console.error(`[WA-AUTO] ❌ Erro ao disparar API de WhatsApp para o pedido #${orderId}:`, err);
          });
        }
      } catch (err) {
        handleFirestoreError(err, OperationType.CREATE, `orders/${orderId}`);
      }

      // Decrement Inventory / Stock if status is NOT Cancelado and stockControl is set to 'move'
      if (firestoreStatus !== 'cancelled' && stockControl === 'move') {
        await deductOrderStock(finalItems);
      }

      // Add to Fluxo de Caixa (financial_cashflow) if PAID initially
      const isPaidStatus = ['Pagamento Aprovado', 'separacao', 'embalagem', 'shipped', 'delivered'].includes(firestoreStatus);
      if (isPaidStatus) {
        const cashRef = doc(collection(db, 'financial_cashflow'));
        try {
          await setDoc(cashRef, {
            id: cashRef.id,
            description: `Venda Manual - ${orderOrigin} - ${custName}`,
            amount: totalSum,
            type: 'in',
            category: `Venda Manual - ${orderOrigin}`,
            date: new Date().toISOString().split('T')[0],
            paymentMethod: paymentMethodForm,
            origin: orderOrigin,
            createdAt: serverTimestamp()
          });
        } catch (err) {
          handleFirestoreError(err, OperationType.CREATE, `financial_cashflow/${cashRef.id}`);
        }
      }

      // Write to Detailed Audit Logs exactly as requested
      const itemsListDesc = finalItems.map(i => `${i.name} (${i.color}_${i.size}) x${i.quantity}`).join(', ');
      const estoqueChoiceLabel = stockControl === 'move' ? 'Movimentar Estoque' : 'Não Movimentar Estoque';
      const userResponsible = user?.email || 'Administrador (fpacstore@gmail.com)';
      const auditLogDesc = stockControl === 'move' ? 'Pedido Manual - Estoque Movimentado' : 'Pedido Manual - Sem Movimentação de Estoque';
      
      const manualOrderDateFormatted = new Date().toLocaleDateString('pt-BR');
      const manualOrderTimeFormatted = new Date().toLocaleTimeString('pt-BR');

      const auditDetails = `Pedido #${orderId}
Origem: ${orderOrigin}
Controle de Estoque: ${estoqueChoiceLabel}
Usuário: ${userResponsible}
Data: ${manualOrderDateFormatted} ${manualOrderTimeFormatted}
Itens: ${itemsListDesc}
Total: R$ ${totalSum.toFixed(2)}`;

      await addAuditLog(
        auditLogDesc,
        auditDetails
      );

      toast.success(`Pedido #${orderId} registrado com sucesso!`);
      
      // Clear Form state
      setCustName('');
      setCustPhone('');
      setCustPhone2('');
      setCustEmail('');
      setCustCep('');
      setIsRetirada(false);
      setCustAddress('');
      setCustNumber('');
      setCustComplement('');
      setCustNeighborhood('');
      setCustCity('');
      setCustState('');
      setTempItems([]);
      setSelectedProduct(null);
      setSelectedColor('');
      setSelectedSize('');
      setManualOrderObs('');
      setManualOrderDeliveryDate('');
      setManualOrderDiscount(0);
      setManualOrderShipping(0);
      setStockControl('move');
      setIgnoreStock(true);
      setIsManualModalOpen(false);

    } catch (err: any) {
      console.error("Erro ao registrar pedido manual:", err);
      toast.error(`Falha ao registrar pedido: ${err.message || 'Erro de rede'}`);
    } finally {
      setSavingManualOrder(false);
    }
  };

  const filteredOrders = orders.filter(order => {
    const searchLower = String(searchTerm || '').toLowerCase();
    const matchesSearch = 
      String(order.id || '').toLowerCase().includes(searchLower) || 
      String(order.customerName || '').toLowerCase().includes(searchLower) ||
      String(order.customerEmail || '').toLowerCase().includes(searchLower);
    
    const matchesStatus = statusFilter === 'all' || order.status === statusFilter;

    let matchesStock = true;
    if (stockFilter === 'moved') {
      matchesStock = order.stockControl !== 'no_move';
    } else if (stockFilter === 'not_moved') {
      matchesStock = order.stockControl === 'no_move';
    }

    return matchesSearch && matchesStatus && matchesStock;
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
        <button onClick={() => setActiveTab('stock_center')} className={cn("px-8 py-4 text-[10px] font-black uppercase tracking-widest border-b-2 transition-all shrink-0", activeTab === 'stock_center' ? "border-[#eab308] text-black bg-black/[0.02]" : "border-transparent text-gray-400 hover:text-black")}>Gestão de Estoque</button>
        <button onClick={() => setActiveTab('stamps')} className={cn("px-8 py-4 text-[10px] font-black uppercase tracking-widest border-b-2 transition-all shrink-0", activeTab === 'stamps' ? "border-[#eab308] text-black bg-black/[0.02]" : "border-transparent text-gray-400 hover:text-black")}>Estampas</button>
        <button onClick={() => setActiveTab('identity')} className={cn("px-8 py-4 text-[10px] font-black uppercase tracking-widest border-b-2 transition-all shrink-0", activeTab === 'identity' ? "border-[#eab308] text-black bg-black/[0.02]" : "border-transparent text-gray-400 hover:text-black")}>Identidade</button>
        <button onClick={() => setActiveTab('automations')} className={cn("px-8 py-4 text-[10px] font-black uppercase tracking-widest border-b-2 transition-all shrink-0", activeTab === 'automations' ? "border-[#eab308] text-black bg-black/[0.02]" : "border-transparent text-gray-400 hover:text-black")}>Automações</button>
        <button onClick={() => setActiveTab('promotions')} className={cn("px-8 py-4 text-[10px] font-black uppercase tracking-widest border-b-2 transition-all shrink-0", activeTab === 'promotions' ? "border-[#eab308] text-black bg-black/[0.02]" : "border-transparent text-gray-400 hover:text-black")}>Promoções</button>
        <button onClick={() => setActiveTab('financial')} className={cn("px-8 py-4 text-[10px] font-black uppercase tracking-widest border-b-2 transition-all shrink-0", activeTab === 'financial' ? "border-[#eab308] text-black bg-black/[0.02]" : "border-transparent text-gray-400 hover:text-black")}>Financeiro</button>
        <button onClick={() => setActiveTab('analytics')} className={cn("px-8 py-4 text-[10px] font-black uppercase tracking-widest border-b-2 transition-all shrink-0", activeTab === 'analytics' ? "border-[#eab308] text-black bg-black/[0.02]" : "border-transparent text-gray-400 hover:text-black")}>📊 Analytics</button>
        <button onClick={() => setActiveTab('music')} className={cn("px-8 py-4 text-[10px] font-black uppercase tracking-widest border-b-2 transition-all shrink-0", activeTab === 'music' ? "border-[#eab308] text-black bg-black/[0.02]" : "border-transparent text-gray-400 hover:text-black")}>🎵 Rádio F PAC</button>
      </div>

      {activeTab === 'orders' ? (
        <div className="space-y-6">
          {/* Module Sub-tabs */}
          <div className="flex border-b border-black/10 gap-2 overflow-x-auto pb-1 mt-4">
            <button 
              onClick={() => setOrderSubView('list')}
              className={cn(
                "px-6 py-3 text-[10px] font-black uppercase tracking-widest transition-all cursor-pointer border-b-2 shrink-0",
                orderSubView === 'list' ? "border-[#eab308] text-black bg-black/[0.02]" : "border-transparent text-gray-400 hover:text-black"
              )}
            >
              Lista de Pedidos
            </button>
            <button 
              onClick={() => setOrderSubView('reports')}
              className={cn(
                "px-6 py-3 text-[10px] font-black uppercase tracking-widest transition-all cursor-pointer border-b-2 shrink-0",
                orderSubView === 'reports' ? "border-[#eab308] text-black bg-black/[0.02]" : "border-transparent text-gray-400 hover:text-black"
              )}
            >
              📊 Relatórios & Canais
            </button>
            <button 
              onClick={() => setOrderSubView('logs')}
              className={cn(
                "px-6 py-3 text-[10px] font-black uppercase tracking-widest transition-all cursor-pointer border-b-2 shrink-0",
                orderSubView === 'logs' ? "border-[#eab308] text-black bg-black/[0.02]" : "border-transparent text-gray-400 hover:text-black"
              )}
            >
              ⚠️ Histórico de Auditoria
            </button>
          </div>

          {orderSubView === 'list' && (
            <div className="space-y-10">
          {/* Summary Stats */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="bg-[#34d399] text-black border-2 border-[#10b981] p-5 shadow-md relative overflow-hidden group hover:scale-[1.02] transition-all duration-300">
              <div className="absolute right-[-12px] bottom-[-12px] text-black/10 rotate-12 transition-transform group-hover:scale-110 duration-500">
                <CheckCircle size={84} />
              </div>
              <p className="text-[10px] font-black uppercase text-black/80 tracking-wider mb-1 relative z-10">Pedido Finalizado</p>
              <p className="text-3xl font-black italic relative z-10">{orders.filter(o => o.status === 'delivered' || o.status === 'shipped').length}</p>
              <div className="absolute top-2 right-2 flex items-center px-1.5 py-0.5 bg-black/20 text-black text-[7px] font-black uppercase tracking-widest relative z-10">
                CONCLUÍDO
              </div>
            </div>
            <div className="bg-white border border-black/10 p-5">
              <p className="text-[9px] font-black uppercase text-yellow-500 tracking-widest mb-1">Aguardando Pgto</p>
              <p className="text-2xl font-black italic">{orders.filter(o => ['received', 'payment_pending', 'Aguardando Pagamento PIX'].includes(o.status)).length}</p>
            </div>
            <div className="bg-white border border-black/10 p-5">
              <p className="text-[9px] font-black uppercase text-blue-500 tracking-widest mb-1">Em Produção</p>
              <p className="text-2xl font-black italic">{orders.filter(o => ['payment_approved', 'Pagamento Aprovado', 'separacao', 'embalagem'].includes(o.status)).length}</p>
            </div>
            <div className="bg-white border border-black/10 p-5">
              <p className="text-[9px] font-black uppercase text-black tracking-widest mb-1">Entregues</p>
              <p className="text-2xl font-black italic">{orders.filter(o => o.status === 'delivered').length}</p>
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
              className="md:w-56 py-3 px-4 border border-black/10 rounded-none text-sm font-bold uppercase tracking-widest focus:outline-none focus:border-[#eab308] cursor-pointer"
            >
              <option value="all">TODOS OS STATUS</option>
              <option value="Aguardando Pagamento PIX">⏳ AGUARDANDO PIX</option>
              <option value="Pagamento Aprovado">✅ PGTO APROVADO</option>
              <option value="Pagamento Não Realizado">❌ NÃO REALIZADO</option>
              <option value="separacao">👕 EM SEPARAÇÃO</option>
              <option value="embalagem">📦 EM EMBALAGEM</option>
              <option value="shipped">🚀 ENVIADO</option>
              <option value="delivered">🙌 ENTREGUE</option>
              <option value="cancelled">🛑 CANCELADO</option>
            </select>
            <select 
              value={stockFilter} 
              onChange={e => setStockFilter(e.target.value as any)} 
              className="md:w-56 py-3 px-4 border border-black/10 rounded-none text-sm font-bold uppercase tracking-widest focus:outline-none focus:border-[#eab308] cursor-pointer"
            >
              <option value="all">📦 TODOS OS ESTOQUES</option>
              <option value="moved">📈 COM BAIXA</option>
              <option value="not_moved">🔘 SEM BAIXA</option>
            </select>
            <button 
              onClick={() => setIsManualModalOpen(true)}
              className="px-6 py-3 bg-black text-[#eab308] border-2 border-black hover:bg-[#eab308] hover:text-black transition-all text-[11px] font-black uppercase tracking-widest flex items-center justify-center gap-2 cursor-pointer shrink-0"
            >
              <Plus size={14} /> Adicionar Pedido Manual
            </button>
            <button 
              onClick={() => {
                setMeToken('');
                setIsMelhorEnvioModalOpen(true);
              }}
              className="px-6 py-3 bg-white text-orange-600 border-2 border-orange-500 hover:bg-orange-500 hover:text-white transition-all text-[11px] font-black uppercase tracking-widest flex items-center justify-center gap-2 cursor-pointer shrink-0"
            >
              <div className={`w-2 h-2 rounded-full ${meHasToken ? 'bg-green-500' : 'bg-red-500 animate-pulse'}`} />
              <Truck size={14} /> Melhor Envio {meHasToken ? '(Ativo)' : '(Sem Token)'}
            </button>
          </div>


          {/* Oportunidades de Recuperação (Phase 4 of Audit) */}
          {orders.filter(o => ['received', 'payment_pending', 'Aguardando Pagamento PIX'].includes(o.status) && (Date.now() - (o.createdAt?.toMillis ? o.createdAt.toMillis() : new Date(o.createdAt).getTime())) > 3600000).length > 0 && (
            <div className="bg-orange-50 border border-orange-200 p-6 space-y-4">
               <div className="flex items-center justify-between">
                  <div>
                    <h2 className="text-sm font-black uppercase tracking-widest text-orange-800">CARRINHOS ABANDONADOS ({orders.filter(o => ['received', 'payment_pending', 'Aguardando Pagamento PIX'].includes(o.status) && (Date.now() - (o.createdAt?.toMillis ? o.createdAt.toMillis() : new Date(o.createdAt).getTime())) > 3600000).length})</h2>
                    <p className="text-[9px] text-orange-600 font-bold uppercase tracking-widest">Pedidos iniciados há mais de 1h sem pagamento confirmado</p>
                  </div>
                  <Smartphone className="text-orange-400" size={24} />
               </div>
               <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  {orders.filter(o => ['received', 'payment_pending', 'Aguardando Pagamento PIX'].includes(o.status) && (Date.now() - (o.createdAt?.toMillis ? o.createdAt.toMillis() : new Date(o.createdAt).getTime())) > 3600000).slice(0, 3).map(order => (
                    <div key={order.id} className="bg-white border border-orange-100 p-3 flex flex-col justify-between">
                       <div className="mb-2">
                          <p className="text-[10px] font-black uppercase truncate">{order.customerName}</p>
                          <p className="text-[8px] text-gray-400">Há {Math.floor((Date.now() - (order.createdAt?.toMillis ? order.createdAt.toMillis() : new Date(order.createdAt).getTime())) / 3600000)} horas | R$ {order.total.toFixed(2)}</p>
                       </div>
                       <button 
                         onClick={() => {
                            const name = order.customerName.split(' ')[0].toUpperCase();
                            const msg = `👕 F PAC STORE • NÃO É SÓ ROUPA. É IDENTIDADE! 👕\n━━━━━━━━━━━━━━━━━━━━━━━━━━━\nFala ${name}!\n\n🛒 CARRINHO RESERVADO! 🛒\n\nVimos que você escolheu peças incríveis com muita atitude e iniciou seu pedido, mas acabou não finalizando o checkout.\nReservamos os itens temporariamente no nosso estoque para você não perder! Garanta suas peças oficiais da F PAC STORE no link seguro abaixo:\n\n👉CONCLUIR COM SEGURANÇA:\n${getBaseUrl()}/#/order/${order.id}\n━━━━━━━━━━━━━━━━━━━━━━━━━━━\n🌟CANAIS OFICIAIS F PAC STORE:\n🌐 Site Oficial:www.fpacstore.com.br\n📸 Instagram: @f_pac_store\n💬 WhatsApp Oficial: (47) 99746-5602\n📍 Loja/Expedição em Joinville/SC\n🛡️Esta é uma mensagem automática de suporte e acompanhamento de pedido.`;
                            window.open(`https://wa.me/${order.customerPhone.replace(/\D/g, '')}?text=${encodeURIComponent(msg)}`, '_blank');
                         }}
                         className="w-full bg-orange-500 text-white py-1.5 text-[8px] font-black uppercase hover:bg-black transition-colors"
                       >
                         Recuperar via WhatsApp
                       </button>
                    </div>
                  ))}
               </div>
            </div>
          )}

          {/* Controls for Expand/Collapse All and Compact view info */}
          <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center bg-gray-50 p-4 border border-black/10 text-xs font-bold uppercase tracking-wider gap-3">
            <span className="text-gray-500 text-[10px] flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-[#eab308] animate-pulse" />
              {filteredOrders.length} {filteredOrders.length === 1 ? 'Pedido Encontrado' : 'Pedidos Encontrados'}
            </span>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setExpandedOrders(filteredOrders.map(o => o.id))}
                className="flex-1 sm:flex-none text-center px-4 py-2 bg-white border border-black/15 hover:bg-black hover:text-[#eab308] transition-all text-[9px] font-black uppercase tracking-widest cursor-pointer"
              >
                📂 Expandir Todos
              </button>
              <button
                type="button"
                onClick={() => setExpandedOrders([])}
                className="flex-1 sm:flex-none text-center px-4 py-2 bg-white border border-black/15 hover:bg-black hover:text-[#eab308] transition-all text-[9px] font-black uppercase tracking-widest cursor-pointer"
              >
                📁 Recolher Todos
              </button>
            </div>
          </div>

          {/* Orders List */}
          <div className="space-y-3">
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
                  {/* Top Bar / Interactive Header - Click to expand */}
                  <div 
                    onClick={() => {
                      const id = order.id;
                      setExpandedOrders(prev => 
                        prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
                      );
                    }}
                    className="cursor-pointer bg-white hover:bg-gray-50/60 px-4 md:px-6 py-3 flex flex-col md:flex-row md:items-center justify-between gap-3 select-none transition-colors"
                  >
                    {/* Left block: ID, Date, Origin, Manual Badges */}
                    <div className="flex flex-col md:flex-row md:items-center gap-2 md:gap-4 flex-1">
                      <div className="flex items-center gap-2">
                        {/* Chevron Indicator */}
                        <span className="text-gray-400 shrink-0">
                          {expandedOrders.includes(order.id) ? (
                            <ChevronUp size={16} className="text-black font-black" />
                          ) : (
                            <ChevronDown size={16} />
                          )}
                        </span>
                        <span className="text-[12px] font-black text-black tracking-tighter">#{order.id}</span>
                        <span className="text-[9px] text-gray-400 font-bold">{formatDate(order.createdAt)}</span>
                      </div>
                      
                      <div className="flex flex-wrap items-center gap-1.5">
                        {order.isManual ? (
                          <span className="px-1.5 py-0.5 text-[7.5px] font-black bg-[#eab308]/10 text-[#eab308] border border-[#eab308]/20 uppercase tracking-widest">
                            ⚙️ {order.origin || 'MANUAL'}
                          </span>
                        ) : (
                          <span className="px-1.5 py-0.5 text-[7.5px] font-black bg-blue-50 text-blue-600 border border-blue-200 uppercase tracking-widest">
                            🛒 SITE
                          </span>
                        )}
                        {order.stockControl === 'no_move' ? (
                          <span className="px-1.5 py-0.5 text-[7.5px] font-black bg-gray-100 text-gray-500 border border-gray-200 uppercase tracking-wider">
                            🔘 SEM BAIXA
                          </span>
                        ) : (
                          <span className="px-1.5 py-0.5 text-[7.5px] font-black bg-green-50 text-green-700 border border-green-200 uppercase tracking-wider">
                            📈 COM BAIXA
                          </span>
                        )}
                        {order.deliveryDate && (
                          <span className="px-1.5 py-0.5 text-[7.5px] font-black bg-black text-[#eab308] uppercase tracking-wider border border-black/20">
                            📅 {order.deliveryDate.includes('-') ? order.deliveryDate.split('-').reverse().join('/') : order.deliveryDate}
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Middle block: Customer name & compact items count */}
                    <div className="flex items-center gap-2 md:w-1/3 min-w-0">
                      <div className="truncate">
                        <span className="text-[11px] font-black uppercase text-black tracking-tight block md:inline truncate">{order.customerName}</span>
                        <span className="text-[9px] text-gray-400 font-bold md:ml-1.5 whitespace-nowrap">
                          ({(order.items || []).reduce((acc: number, item: any) => acc + (item.quantity || 1), 0)} un)
                        </span>
                      </div>
                    </div>

                    {/* Right block: Total, Status, and toggle */}
                    <div className="flex items-center justify-between md:justify-end gap-4 border-t pt-2 md:pt-0 md:border-none border-black/5">
                      <div className="text-left md:text-right shrink-0">
                        <span className="text-[12px] font-black font-mono text-black">R$ {order.total?.toFixed(2)}</span>
                        <span className="text-[8px] text-gray-400 font-bold uppercase tracking-wider block leading-none mt-0.5">
                          {order.paymentMethod || 
                           (order.paymentMethodId === 'pix' || (order as any).payment_type_id === 'bank_transfer' ? 'PIX' : '') ||
                           (order.paymentMethodId === 'credit_card' || (order as any).payment_type_id === 'credit_card' ? 'CARTÃO' : '') ||
                           order.paymentMethodId?.toUpperCase() || 
                           'CARTÃO / PIX'}
                        </span>
                      </div>

                      <span className={cn("px-2.5 py-1 text-[8px] font-black uppercase tracking-[0.12em] rounded-none border text-center min-w-[110px] block shrink-0", 
                        ['payment_pending', 'Aguardando Pagamento PIX', 'received'].includes(order.status) ? 'bg-orange-50 text-orange-700 border-orange-200' :
                        ['payment_approved', 'Pagamento Aprovado'].includes(order.status) ? 'bg-green-50 text-green-700 border-green-200' :
                        order.status === 'separacao' ? 'bg-blue-50 text-blue-700 border-blue-200' :
                        order.status === 'embalagem' ? 'bg-indigo-50 text-indigo-700 border-indigo-200' :
                        order.status === 'shipped' ? 'bg-purple-50 text-purple-700 border-purple-200' :
                        order.status === 'delivered' ? 'bg-black text-white border-black' :
                        'bg-red-50 text-red-700 border-red-200'
                      )}>
                        {['payment_pending', 'Aguardando Pagamento PIX', 'received'].includes(order.status) ? 'AGUARDANDO PGTO' :
                         ['payment_approved', 'Pagamento Aprovado'].includes(order.status) ? 'PAGO / APROVADO' :
                         order.status === 'separacao' ? 'EM SEPARAÇÃO' :
                         order.status === 'embalagem' ? 'EM EMBALAGEM' :
                         order.status === 'shipped' ? 'ENVIADO' :
                         order.status === 'delivered' ? 'ENTREGUE' : 'CANCELADO'}
                      </span>
                    </div>
                  </div>

                  {expandedOrders.includes(order.id) && (
                    <div className="p-6 grid grid-cols-1 md:grid-cols-12 gap-8 border-t border-black/5 bg-gray-50/20 animate-fadeIn">
                    {/* Customer Info */}
                    <div className="md:col-span-4 space-y-4">
                      <div>
                        <h3 className="text-xl font-black uppercase tracking-tight text-black flex items-center gap-2 group-hover:text-[#eab308] transition-colors cursor-default">
                          {order.customerName}
                        </h3>
                        <p className="text-[11px] text-gray-500 font-bold tracking-widest uppercase">{order.customerEmail || 'SEM E-MAIL'}</p>
                      </div>

                      <div className="flex flex-wrap gap-2">
                        <a 
                          href={`https://wa.me/${String(order.customerPhone || '').replace(/\D/g, '')}`} 
                          target="_blank" 
                          rel="noopener noreferrer"
                          className="flex items-center gap-2 bg-[#25D366] text-white px-3 py-1.5 text-[9px] font-black uppercase tracking-widest hover:brightness-95 transition-all"
                        >
                          <MessageCircle size={12} /> WhatsApp
                        </a>
                        {order.customerPhone2 && (
                          <a 
                            href={`https://wa.me/${String(order.customerPhone2).replace(/\D/g, '')}`} 
                            target="_blank" 
                            rel="noopener noreferrer"
                            className="flex items-center gap-2 bg-[#128C7E] text-white px-3 py-1.5 text-[9px] font-black uppercase tracking-widest hover:brightness-95 transition-all"
                          >
                            <MessageCircle size={12} /> WhatsApp 2
                          </a>
                        )}
                        <a 
                          href={`mailto:${order.customerEmail}`} 
                          className="flex items-center gap-2 bg-black text-white px-3 py-1.5 text-[9px] font-black uppercase tracking-widest hover:bg-[#eab308] hover:text-black transition-all"
                        >
                          <Mail size={12} /> E-mail
                        </a>
                      </div>

                      <div className="bg-black/[0.02] border-l-2 border-[#eab308] p-4 text-[11px]">
                        <p className="text-[9px] font-black uppercase text-gray-400 mb-2 tracking-[0.2em]">Destino</p>
                        {order.address && typeof order.address === 'object' ? (
                          <div className="font-medium text-gray-700 leading-relaxed uppercase">
                            <p className="font-black text-black">{(order.address as any).street || 'Rua não informada'}, {order.number || (order.address as any).number || 'S/N'}</p>
                            {(order.complement || (order.address as any).complement) && <p>Complemento: {order.complement || (order.address as any).complement}</p>}
                            <p>{(order.address as any).neighborhood || ''} — {(order.address as any).city || ''}/{(order.address as any).state || ''}</p>
                            <p className="mt-1 text-gray-400">CEP: {(order.address as any).cep || ''}</p>
                          </div>
                        ) : (
                          <div className="font-medium text-gray-700 leading-relaxed uppercase">
                            <p className="font-black text-black">{order.address || 'Endereço não informado'}, {order.number || 'S/N'}</p>
                            {order.complement && <p>Complemento: {order.complement}</p>}
                            <p>{order.neighborhood || ''} — {order.city || ''}/{order.state || ''}</p>
                            <p className="mt-1 text-gray-400">CEP: {order.cep || ''}</p>
                          </div>
                        )}
                        {((order.cep && isJoinvilleCEP(order.cep)) || String(order.city || '').toLowerCase() === 'joinville') && (
                          <div className="mt-3 bg-[#eab308]/10 border border-[#eab308]/30 px-3 py-2 text-[9px] uppercase font-black tracking-widest text-[#eab308] flex items-center gap-1.5 rounded">
                            <span className="w-1.5 h-1.5 rounded-full bg-[#eab308] animate-pulse" />
                            Entrega Manual: Entrega Local F PAC
                          </div>
                        )}
                        {order.deliveryDate && (
                          <div className="mt-3 bg-black text-[#eab308] p-3 text-[10px] uppercase font-black tracking-widest flex items-center gap-2">
                            <span>📅 DATA DE ENTREGA:</span>
                            <span className="text-white">{order.deliveryDate.includes('-') ? order.deliveryDate.split('-').reverse().join('/') : order.deliveryDate}</span>
                          </div>
                        )}
                        {order.observations && (
                          <div className="mt-3 bg-[#f3f4f6] border border-black/5 p-3 text-[10px] uppercase font-black tracking-widest leading-normal rounded">
                            <span className="text-gray-400 block mb-1 text-[8px]">📝 Observações:</span>
                            <span className="text-gray-700 font-bold normal-case block whitespace-pre-wrap">{order.observations}</span>
                          </div>
                        )}
                        {order.isManual && (
                          <div className="mt-3 bg-[#f3f4f6] border border-black/5 p-3 text-[10px] uppercase font-black tracking-widest leading-normal rounded">
                            <span className="text-gray-400 block mb-2 text-[8px]">💬 Notificações WhatsApp:</span>
                            <div className="space-y-1.5 normal-case font-bold mb-3">
                              {order.whatsappLogs && order.whatsappLogs.length > 0 ? (
                                order.whatsappLogs.map((log: any, idx: number) => (
                                  <div key={idx} className={cn("text-[10px]", log.status === 'success' ? "text-green-600" : "text-red-600")}>
                                    <span>{log.status === 'success' ? '✅' : '❌'} {log.message}</span>
                                    {log.error && <p className="text-[8.5px] text-gray-500 font-mono mt-0.5 ml-4">Motivo: {log.error}</p>}
                                    <span className="text-[8px] text-gray-400 block ml-4">{log.timestamp ? new Date(log.timestamp).toLocaleString('pt-BR') : ''}</span>
                                  </div>
                                ))
                              ) : (
                                <p className="text-gray-400 text-[9px] italic">Nenhuma notificação automática enviada ainda para este pedido.</p>
                              )}
                            </div>
                            
                            <button
                              onClick={async () => {
                                toast.promise(
                                  fetch(getApiUrl('/api/automation/send-manual-order-whatsapp'), {
                                    method: 'POST',
                                    headers: { 'Content-Type': 'application/json' },
                                    body: JSON.stringify({ orderId: order.id })
                                  }).then(async (res) => {
                                    const data = await res.json();
                                    if (!res.ok || !data.success) {
                                      throw new Error(data.error || "Falha ao enviar mensagem");
                                    }
                                    return data;
                                  }),
                                  {
                                    loading: 'Enviando notificação WhatsApp...',
                                    success: 'Notificação enviada com sucesso!',
                                    error: (err: any) => `Falha no envio: ${err.message}`
                                  }
                                );
                              }}
                              className="w-full bg-black text-[#eab308] py-2 px-3 text-[8.5px] font-black uppercase tracking-widest hover:text-white transition-all flex items-center justify-center gap-1.5 shadow"
                            >
                              💬 Enviar/Reenviar Notificação de Pedido Criado
                            </button>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Order Items */}
                    <div className="md:col-span-5 border-y md:border-y-0 md:border-x border-black/5 md:px-8 py-6 md:py-0">
                      <p className="text-[9px] font-black uppercase text-gray-400 mb-4 tracking-[0.2em]">Conteúdo do Pedido</p>
                      <div className="space-y-3">
                        {(order.items || []).map((item, idx) => (
                          <div key={idx} className="flex gap-4 items-start border-b border-black/5 pb-3 last:border-0 last:pb-0">
                            <div className="w-10 h-10 bg-black/5 flex-shrink-0 flex items-center justify-center overflow-hidden border border-black/5 rounded bg-white">
                              {item.image ? (
                                <img 
                                  src={item.image} 
                                  alt={item.name} 
                                  className="w-full h-full object-contain p-0.5" 
                                  referrerPolicy="no-referrer" 
                                />
                              ) : (
                                <span className="text-[8px] font-black text-black/20 uppercase">IMG</span>
                              )}
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
                          <p className="text-[10px] font-bold text-[#eab308] uppercase tracking-widest">
                            {order.paymentMethod || 
                             (order.paymentMethodId === 'pix' || (order as any).payment_type_id === 'bank_transfer' ? 'PIX' : '') ||
                             (order.paymentMethodId === 'credit_card' || (order as any).payment_type_id === 'credit_card' ? 'CARTÃO DE CRÉDITO' : '') ||
                             order.paymentMethodId?.toUpperCase() || 
                             'CARTÃO / PIX'}
                          </p>
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
                            onClick={() => handleStatusUpdate(order, 'separacao')} 
                            className="w-full bg-blue-600 text-white py-3 text-[10px] font-black uppercase tracking-widest hover:bg-black transition-all shadow-lg shadow-blue-600/20"
                          >
                            Iniciar Separação
                          </button>
                        )}
                        {order.status === 'separacao' && (
                          <button 
                            onClick={() => handleStatusUpdate(order, 'embalagem')} 
                            className="w-full bg-indigo-600 text-white py-3 text-[10px] font-black uppercase tracking-widest hover:bg-black transition-all shadow-lg shadow-indigo-600/20"
                          >
                            Concluir Embalagem
                          </button>
                        )}
                        {order.status === 'embalagem' && (() => {
                          const isJoinvilleLocal = (order.cep && isJoinvilleCEP(order.cep)) || String(order.city || '').toLowerCase() === 'joinville';
                          return (
                            <div className="space-y-4">
                              {/* TRIAGEM LOGÍSTICA INTELIGENTE */}
                              <div className="bg-black text-[#eab308] p-3 text-[10px] font-black uppercase tracking-widest text-center flex flex-col gap-1 rounded">
                                <span>🗺️ TRIAGEM LOGÍSTICA DE CEP</span>
                                <span className="text-[8px] font-bold text-gray-400 normal-case">
                                  {isJoinvilleLocal 
                                    ? "CEP de Joinville-SC identificado. Sugerida Trilha Local (Etiqueta A)." 
                                    : "CEP Externo/Nacional identificado. Sugerida Trilha Nacional (Etiqueta B)."
                                  }
                                </span>
                              </div>

                              {/* MODALIDADE LOCAL: ETIQUETA A */}
                              <div className={`p-3 border rounded space-y-2 ${isJoinvilleLocal ? 'border-[#eab308] bg-[#eab308]/5' : 'border-black/5 bg-gray-50'}`}>
                                <div className="flex items-center justify-between">
                                  <span className="text-[10px] font-black uppercase tracking-wider text-black">🏍️ Modelo A: Entrega Local</span>
                                  {isJoinvilleLocal && (
                                    <span className="bg-black text-[#eab308] px-1.5 py-0.5 text-[8px] font-bold rounded">★ RECOMENDADO</span>
                                  )}
                                </div>
                                <p className="text-[9px] text-gray-500 leading-normal font-sans">
                                  Gera etiqueta de remessa simplificada direta para motorista ou motoboy. Não consome créditos nem aciona APIs externas.
                                </p>
                                <button 
                                  onClick={() => handlePrintLocalLabel(order)} 
                                  className="w-full bg-black text-[#eab308] py-2.5 text-[10px] font-black uppercase tracking-widest hover:text-white hover:bg-black/90 transition-all shadow flex items-center justify-center gap-2"
                                >
                                  🖨️ Imprimir Etiqueta A (Local)
                                </button>
                              </div>

                              {/* MODALIDADE NACIONAL: ETIQUETA B */}
                              <div className={`p-3 border rounded space-y-2.5 ${!isJoinvilleLocal ? 'border-orange-500 bg-orange-50/20' : 'border-black/5 bg-gray-50'}`}>
                                <div className="flex items-center justify-between">
                                  <span className="text-[10px] font-black uppercase tracking-wider text-black">📦 Modelo B: Melhor Envio</span>
                                  {!isJoinvilleLocal && (
                                    <span className="bg-orange-500 text-white px-1.5 py-0.5 text-[8px] font-bold rounded">★ RECOMENDADO</span>
                                  )}
                                </div>
                                <p className="text-[9px] text-gray-500 leading-normal font-sans">
                                  Integração direta com o carrinho do Melhor Envio para cotizar e gerar a etiqueta de Correios ou Jadlog por lá.
                                </p>
                                <div className="space-y-1 bg-white p-2 border border-black/5 rounded">
                                  <label className="text-[8px] font-black uppercase text-gray-400 tracking-wider block">Serviço de Envio</label>
                                  <select 
                                    defaultValue={order.shippingServiceId || 2}
                                    onChange={(e) => {
                                      order.shippingServiceId = Number(e.target.value);
                                    }}
                                    className="w-full bg-white text-black border border-black/10 px-2 py-1.5 text-[10px] font-bold uppercase outline-none focus:border-[#eab308]"
                                  >
                                    <option value={1}>Correios PAC</option>
                                    <option value={2}>Correios SEDEX</option>
                                    <option value={3}>Jadlog Package</option>
                                    <option value={4}>Jadlog .COM</option>
                                    <option value={17}>Jamef</option>
                                    <option value={16}>Latam Cargo</option>
                                  </select>
                                </div>
                                <button 
                                  onClick={() => handleMelhorEnvioLabel(order)} 
                                  className="w-full bg-orange-500 text-white py-2.5 text-[10px] font-black uppercase tracking-widest hover:bg-black transition-all shadow flex items-center justify-center gap-2"
                                >
                                  <Truck size={14} /> Gerar Etiqueta B (Melhor Envio)
                                </button>
                              </div>

                              <button 
                                onClick={() => handleStatusUpdate(order, 'shipped')} 
                                className="w-full bg-[#9333ea] text-white py-3 text-[10px] font-black uppercase tracking-widest hover:bg-black transition-all shadow-lg shadow-purple-600/20 mt-2"
                              >
                                {isJoinvilleLocal ? '🚀 Iniciar Envio Local' : '🚀 Informar Envio'}
                              </button>
                            </div>
                          );
                        })()}
                        {order.status === 'shipped' && (
                          <button 
                            onClick={() => handleStatusUpdate(order, 'delivered')} 
                            className="w-full bg-black text-white py-3 text-[10px] font-black uppercase tracking-widest hover:bg-[#eab308] hover:text-black transition-all shadow-lg"
                          >
                            Marcar Entregue
                          </button>
                        )}
                        {order.status === 'delivered' && (
                          <button 
                            onClick={() => {
                               const name = order.customerName.split(' ')[0].toUpperCase();
                               const msg = `👕 F PAC STORE • NÃO É SÓ ROUPA. É IDENTIDADE! 👕\n━━━━━━━━━━━━━━━━━━━━━━━━━━━\nFala ${name}!\n\n🎉 *SEU PEDIDO JÁ FOI ENTREGUE!* 🎉\n\nEsperamos de verdade que você curta muito a sua nova peça F PAC STORE. Ela foi pioneira para trazer estética, identidade e atitude para seu guarda-roupa! 🔥\n\n📸 *NO INSTAGRAM:*\nQuando vestir sua nova peça, tire uma foto irada e marque a gente no Instagram *@f_pac_store*. Vamos adorar repostar você! \n━━━━━━━━━━━━━━━━━━━━━━━━━━━\n🌟CANAIS OFICIAIS F PAC STORE:\n🌐 Site Oficial:www.fpacstore.com.br\n📸 Instagram: @f_pac_store\n💬 WhatsApp Oficial: (47) 99746-5602\n📍 Loja/Expedição em Joinville/SC\n🛡️Esta é uma mensagem automática de suporte e acompanhamento de pedido.`;
                               window.open(`https://wa.me/${order.customerPhone.replace(/\D/g, '')}?text=${encodeURIComponent(msg)}`, '_blank');
                            }}
                            className="w-full bg-[#eab308] text-black py-3 text-[10px] font-black uppercase tracking-widest hover:bg-black hover:text-[#eab308] transition-all shadow-lg"
                          >
                            Pós-Venda (WhatsApp)
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
                  )}
                </motion.div>
              ))
            )}
          </div>
          </div>
          )}

          {/* Render Reports Sub-view */}
          {orderSubView === 'reports' && (
            <div className="space-y-8 animate-fadeIn">
              <div className="bg-black text-white p-8 space-y-4">
                <h2 className="text-xl font-black uppercase tracking-widest italic">Painel de Performance e Canais (BI)</h2>
                <p className="text-[10px] text-[#eab308] font-bold uppercase tracking-widest">
                  Análise gerencial em tempo real de vendas manuais integradas e e-commerce
                </p>

                {/* Filtros de Relatórios */}
                <div className="grid grid-cols-2 md:grid-cols-5 gap-4 pt-4 border-t border-white/10 text-black">
                  <div className="flex flex-col gap-1">
                    <label className="text-[9px] font-black uppercase text-gray-400 tracking-wider">Período</label>
                    <select 
                      value={repPeriod} 
                      onChange={e => setRepPeriod(e.target.value)}
                      className="bg-white py-2 px-3 border border-gray-300 rounded-none text-xs font-bold uppercase tracking-widest cursor-pointer"
                    >
                      <option value="today">Hoje</option>
                      <option value="7days">Últimos 7 dias</option>
                      <option value="30days">Últimos 30 dias</option>
                      <option value="thisMonth">Este Mês</option>
                      <option value="lastMonth">Mês Anterior</option>
                      <option value="all">Todo Histórico</option>
                    </select>
                  </div>

                  <div className="flex flex-col gap-1">
                    <label className="text-[9px] font-black uppercase text-gray-400 tracking-wider">Produto</label>
                    <select 
                      value={repProduct} 
                      onChange={e => setRepProduct(e.target.value)}
                      className="bg-white py-2 px-3 border border-gray-300 rounded-none text-xs font-bold uppercase tracking-widest cursor-pointer"
                    >
                      <option value="all">Todos</option>
                      {currentProducts.map(p => (
                        <option key={p.id} value={p.id}>{p.name}</option>
                      ))}
                    </select>
                  </div>

                  <div className="flex flex-col gap-1">
                    <label className="text-[9px] font-black uppercase text-gray-400 tracking-wider">Modelo</label>
                    <select 
                      value={repModel} 
                      onChange={e => setRepModel(e.target.value)}
                      className="bg-white py-2 px-3 border border-gray-300 rounded-none text-xs font-bold uppercase tracking-widest cursor-pointer"
                    >
                      <option value="all">Todos</option>
                      <option value="force">FORCE</option>
                      <option value="mark">MARK</option>
                      <option value="prime">PRIME</option>
                    </select>
                  </div>

                  <div className="flex flex-col gap-1">
                    <label className="text-[9px] font-black uppercase text-gray-400 tracking-wider">Canal</label>
                    <select 
                      value={repChannel} 
                      onChange={e => setRepChannel(e.target.value)}
                      className="bg-white py-2 px-3 border border-gray-300 rounded-none text-xs font-bold uppercase tracking-widest cursor-pointer"
                    >
                      <option value="all">Todos</option>
                      <option value="Site">Site</option>
                      <option value="WhatsApp">WhatsApp</option>
                      <option value="Instagram">Instagram</option>
                      <option value="Facebook">Facebook</option>
                      <option value="Loja Física">Loja Física</option>
                      <option value="Indicação">Indicação</option>
                      <option value="Outro">Outro</option>
                    </select>
                  </div>

                  <div className="flex flex-col gap-1">
                    <label className="text-[9px] font-black uppercase text-gray-400 tracking-wider">Pagamento</label>
                    <select 
                      value={repStatus} 
                      onChange={e => setRepStatus(e.target.value)}
                      className="bg-white py-2 px-3 border border-gray-300 rounded-none text-xs font-bold uppercase tracking-widest cursor-pointer"
                    >
                      <option value="all">Todos</option>
                      <option value="paid">Pago / Aprovado</option>
                      <option value="pending">Aguardando Pagamento</option>
                      <option value="cancelled">Cancelado</option>
                    </select>
                  </div>
                </div>
              </div>

              {/* Detailed Financial Stats (Phase 5 of Audit) - Unified in BI Panel */}
              <div className="bg-black text-white p-8 space-y-8 border-2 border-[#eab308]/20">
                 <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-white/10 pb-4">
                    <div className="space-y-1">
                       <h2 className="text-xl font-black uppercase tracking-widest italic flex items-center gap-2">
                          <CheckCircle size={18} className="text-[#eab308]" /> Análise Financeira Real (Auditada)
                       </h2>
                       <p className="text-[9px] text-gray-400 font-bold uppercase tracking-wider">
                          Resultados gerenciais consolidados baseados em custos reais e filtros ativos
                       </p>
                    </div>
                    <div className="flex items-center gap-1.5 px-2.5 py-1 bg-[#eab308]/10 text-[#eab308] border border-[#eab308]/20 text-[8px] font-black uppercase tracking-widest self-start sm:self-center">
                       🔒 Auditoria de Custos Reais Ativa
                    </div>
                 </div>
                 
                 <div className="grid grid-cols-2 lg:grid-cols-4 gap-8">
                    <div className="space-y-1">
                       <p className="text-[9px] font-black uppercase text-gray-500 tracking-widest">Faturamento Líquido</p>
                       <p className="text-3xl font-black italic tracking-tighter text-[#eab308]">
                          R$ {reportData.revenue.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                       </p>
                       <p className="text-[8px] text-gray-400 uppercase font-medium">Aprovado no período</p>
                    </div>
                    <div className="space-y-1">
                       <p className="text-[9px] font-black uppercase text-gray-500 tracking-widest">Custo de Mercadoria (COGS)</p>
                       <p className="text-3xl font-black italic tracking-tighter text-red-400">
                          R$ {reportData.cogs.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                       </p>
                       <p className="text-[8px] text-gray-400 uppercase font-medium">Base unitária de insumos</p>
                    </div>
                    <div className="space-y-1">
                       <p className="text-[9px] font-black uppercase text-gray-500 tracking-widest">Despesas (Taxas + Frete)</p>
                       <p className="text-3xl font-black italic tracking-tighter text-orange-400">
                          R$ {(reportData.gatewayFees + reportData.shipping).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                       </p>
                       <p className="text-[8px] text-gray-400 uppercase font-medium">Frete real + taxa gateway (5%)</p>
                    </div>
                    <div className="space-y-1 bg-white/5 p-4 border border-white/10">
                       <p className="text-[9px] font-black uppercase text-[#eab308] tracking-widest">Lucro Líquido Real</p>
                       <p className="text-3xl font-black italic tracking-tighter text-green-400">
                          R$ {reportData.netProfit.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                       </p>
                       <div className="flex items-center justify-between mt-2 pt-2 border-t border-white/5">
                          <span className="text-[8px] font-bold text-gray-400 uppercase">Margem Operacional</span>
                          <span className="text-[10px] font-black text-green-400">
                             {reportData.revenue > 0 ? ((reportData.netProfit / reportData.revenue) * 100).toFixed(1) : 0}%
                          </span>
                       </div>
                    </div>
                 </div>

                 {/* Secondary Row: Stock and Inventory Audit */}
                 <div className="border-t border-white/10 pt-6 space-y-4">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1">
                       <h3 className="text-xs font-black uppercase tracking-widest text-[#eab308] italic flex items-center gap-1.5">
                          📦 Controle de Fluxo & Movimentação de Estoque
                       </h3>
                       <span className="text-[8px] text-gray-400 font-bold uppercase tracking-wider">
                          Impacto das baixas de inventário no período filtrado
                       </span>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                       <div className="bg-white/[0.03] p-4 border border-white/5 hover:border-green-500/20 transition-all">
                          <p className="text-[8px] font-black uppercase text-green-400 tracking-widest mb-1">📉 COM BAIXA DE ESTOQUE</p>
                          <div className="flex justify-between items-baseline gap-2">
                             <p className="text-xl font-black italic text-white">{reportData.ordersWithStockMove} Ped.</p>
                             <p className="text-xs font-black text-green-400 font-mono">
                                R$ {reportData.ordersWithStockMoveRevenue.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                             </p>
                          </div>
                          <p className="text-[7.5px] font-bold text-gray-500 uppercase mt-1">Estoque faturado e baixado</p>
                        </div>

                       <div className="bg-white/[0.03] p-4 border border-white/5 hover:border-gray-500/20 transition-all">
                          <p className="text-[8px] font-black uppercase text-gray-400 tracking-widest mb-1">🔘 SEM BAIXA DE ESTOQUE</p>
                          <div className="flex justify-between items-baseline gap-2">
                             <p className="text-xl font-black italic text-white">{reportData.ordersWithoutStockMove} Ped.</p>
                             <p className="text-xs font-black text-gray-400 font-mono">
                                R$ {reportData.ordersWithoutStockMoveRevenue.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                             </p>
                          </div>
                          <p className="text-[7.5px] font-bold text-gray-500 uppercase mt-1">Vendas faturadas s/ baixa de estoque</p>
                       </div>

                       <div className="bg-white/[0.03] p-4 border border-white/5 hover:border-[#eab308]/20 transition-all">
                          <p className="text-[8px] font-black uppercase text-[#eab308] tracking-widest mb-1">📦 QTD TOTAL MOVIMENTADA</p>
                          <p className="text-xl font-black italic text-white">{reportData.totalStockMovedQty} un.</p>
                          <p className="text-[7.5px] font-bold text-gray-500 uppercase mt-1">Soma de itens com baixa automática</p>
                       </div>

                       <div className="bg-white/[0.03] p-4 border border-white/5 hover:border-red-500/20 transition-all">
                          <p className="text-[8px] font-black uppercase text-red-400 tracking-widest mb-1">🚫 QTD TOTAL NÃO MOVIMENTADA</p>
                          <p className="text-xl font-black italic text-white">{reportData.totalStockNotMovedQty} un.</p>
                          <p className="text-[7.5px] font-bold text-gray-500 uppercase mt-1">Soma de itens sem baixa de inventário</p>
                       </div>
                    </div>
                 </div>
              </div>

              {/* Channels Representation and Top Selling Products */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                {/* Canal Sales Graph */}
                <div className="bg-white border border-black/10 p-6 space-y-4 shadow-sm">
                  <h3 className="text-xs font-black uppercase tracking-widest border-b border-black/5 pb-2">Vendas por Canal (Total Faturado)</h3>
                  <div className="space-y-4">
                    {Object.entries(reportData.channelSales).length === 0 ? (
                      <p className="text-xs font-bold text-gray-400 uppercase py-6 text-center">Nenhuma venda faturada neste filtro</p>
                    ) : (
                      Object.entries(reportData.channelSales)
                        .sort((a: any, b: any) => b[1].total - a[1].total)
                        .map(([channel, metrics]: any) => {
                          const totalPct = reportData.revenue > 0 ? (metrics.total / reportData.revenue) * 105 : 0;
                          return (
                            <div key={channel} className="space-y-1">
                              <div className="flex justify-between text-[10px] font-bold uppercase">
                                <span className="font-black text-black">{channel} ({metrics.count} ped.)</span>
                                <span className="font-mono text-gray-600">R$ {metrics.total.toLocaleString('pt-BR', { minimumFractionDigits: 2 })} ({Math.min(100, totalPct / 1.05).toFixed(1)}%)</span>
                              </div>
                              <div className="w-full bg-gray-100 h-2.5 rounded-none">
                                <div 
                                  className="bg-black h-2.5 transition-all duration-500" 
                                  style={{ width: `${Math.min(100, Math.max(2, totalPct / 1.05))}%` }}
                                />
                              </div>
                            </div>
                          );
                        })
                    )}
                  </div>
                </div>

                {/* Top Selling Products Graph & List */}
                <div className="bg-white border border-black/10 p-6 space-y-4 shadow-sm">
                  <h3 className="text-xs font-black uppercase tracking-widest border-b border-black/5 pb-2">Artigos Mais Vendidos (Vol. Unidades)</h3>
                  <div className="space-y-4">
                    {Object.entries(reportData.productSales).length === 0 ? (
                      <p className="text-xs font-bold text-gray-400 uppercase py-6 text-center">Nenhum produto faturado no período</p>
                    ) : (
                      Object.entries(reportData.productSales)
                        .sort((a: any, b: any) => b[1].qty - a[1].qty)
                        .slice(0, 5)
                        .map(([prodName, metrics]: any) => {
                          const maxQty = Math.max(...Object.values(reportData.productSales).map((m: any) => m.qty));
                          const barPct = maxQty > 0 ? (metrics.qty / maxQty) * 100 : 0;
                          return (
                            <div key={prodName} className="space-y-1">
                              <div className="flex justify-between text-[10px] font-bold uppercase">
                                <span className="truncate max-w-[200px] font-black text-black" title={prodName}>{prodName}</span>
                                <span className="font-mono text-gray-600">{metrics.qty} un. | R$ {metrics.revenue.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
                              </div>
                              <div className="w-full bg-gray-100 h-2 rounded-none">
                                <div 
                                  className="bg-[#eab308] h-2 transition-all duration-500" 
                                  style={{ width: `${Math.min(100, Math.max(3, barPct))}%` }}
                                />
                              </div>
                            </div>
                          );
                        })
                    )}
                  </div>
                </div>
              </div>

              {/* Rentabilidade Detalhada view */}
              <div className="bg-white border border-black/10 p-6 space-y-4 shadow-sm">
                <h3 className="text-xs font-black uppercase tracking-widest border-b border-black/5 pb-2">Análise de Margem por Tipo de Produto</h3>
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse text-[11px] uppercase">
                    <thead>
                      <tr className="border-b border-black font-black text-gray-400">
                        <th className="py-2.5">Nome do Artigo</th>
                        <th className="py-2.5 text-center">Qtd Vendida</th>
                        <th className="py-2.5 text-right">Faturamento</th>
                        <th className="py-2.5 text-right">Custo Mercadoria</th>
                        <th className="py-2.5 text-right">Lucro Bruto</th>
                        <th className="py-2.5 text-right">Margem Ref</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-black/5">
                      {Object.entries(reportData.productSales).length === 0 ? (
                        <tr>
                          <td colSpan={6} className="py-8 text-center text-gray-400 font-bold uppercase">Nenhum dado para exibir</td>
                        </tr>
                      ) : (
                        Object.entries(reportData.productSales)
                          .sort((a: any, b: any) => b[1].revenue - a[1].revenue)
                          .map(([prodName, s]: any) => {
                            const profit = s.revenue - s.cogs;
                            const margin = s.revenue > 0 ? (profit / s.revenue) * 100 : 0;
                            return (
                              <tr key={prodName} className="hover:bg-gray-50 transition-colors">
                                <td className="py-3 font-black text-black">{prodName}</td>
                                <td className="py-3 text-center font-bold">{s.qty}</td>
                                <td className="py-3 text-right font-mono font-bold">R$ {s.revenue.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</td>
                                <td className="py-3 text-right font-mono font-medium text-red-500">R$ {s.cogs.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</td>
                                <td className="py-3 text-right font-mono font-bold text-green-600">R$ {profit.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</td>
                                <td className="py-3 text-right font-mono font-black text-[#eab308]">{margin.toFixed(1)}%</td>
                              </tr>
                            );
                          })
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* Render Logs Timeline Sub-view */}
          {orderSubView === 'logs' && (
            <div className="space-y-6">
              <div className="bg-black text-white p-8">
                <h2 className="text-xl font-black uppercase tracking-widest italic">Histórico de Auditoria de Operações</h2>
                <p className="text-[10px] text-[#eab308] font-bold uppercase tracking-widest mt-1">
                  Trilha à prova de fraudes para conformidade de estoque, faturamento e modificações manuais
                </p>
              </div>

              <div className="bg-white border border-black/10 p-6 space-y-4 shadow-sm">
                <div className="flex justify-between items-center pb-2 border-b border-black/10">
                  <h3 className="text-xs font-black uppercase tracking-widest">Trilha de Auditoria Recente ({auditLogs.length} eventos)</h3>
                  <span className="text-[9px] font-bold text-gray-500 uppercase">ATUALIZADO EM TEMPO REAL</span>
                </div>

                <div className="divide-y divide-black/5 max-h-[600px] overflow-y-auto">
                  {auditLogs.length === 0 ? (
                    <div className="py-12 text-center text-gray-400 uppercase font-black tracking-widest border border-dashed border-gray-200">
                      Nenhuma movimentação registrada nesta sessão
                    </div>
                  ) : (
                    auditLogs.map((log: any) => {
                      const logDateStr = log.date ? new Date(log.date).toLocaleString('pt-BR') : '';
                      return (
                        <div key={log.id} className="py-4 hover:bg-gray-50 transition-all font-sans px-2 grid grid-cols-1 md:grid-cols-12 gap-4 items-start text-[11px] uppercase">
                          <div className="md:col-span-3 font-mono text-gray-400 font-bold leading-tight">
                            {logDateStr}
                          </div>
                          <div className="md:col-span-3 flex flex-col gap-0.5">
                            <span className={cn(
                              "px-2 py-0.5 text-[8px] font-black tracking-wider self-start border",
                              log.action === 'Exclusão de Pedido' ? 'bg-red-50 text-red-600 border-red-200' :
                              log.action === 'Alteração de Status' ? 'bg-blue-50 text-blue-600 border-blue-200' :
                              'bg-green-50 text-green-600 border-green-200'
                            )}>
                              {log.action}
                            </span>
                            <span className="text-[8px] font-bold text-gray-400 lowercase">{log.user}</span>
                          </div>
                          <div className="md:col-span-6 font-bold leading-relaxed text-black/80 normal-case pr-4">
                            {log.details}
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      ) : activeTab === 'stock_center' ? (
        <React.Suspense fallback={<div className="p-12 text-center text-sm font-bold uppercase tracking-widest text-black/50 animate-pulse">Carregando Gestão de Estoque...</div>}>
          <AdminStockCenter />
        </React.Suspense>
      ) : activeTab === 'stamps' ? (
        <React.Suspense fallback={<div className="p-12 text-center text-sm font-bold uppercase tracking-widest text-black/50 animate-pulse">Carregando Estampas...</div>}>
          <AdminStampsCenter />
        </React.Suspense>
      ) : (activeTab as string) === 'stamps_old' ? (
        <div className="space-y-12">
           <div className="bg-black text-white p-8 flex flex-col md:flex-row md:items-center justify-between gap-6">
              <div>
                <h2 className="text-xl font-black uppercase tracking-widest italic">Gestão de Estampas (Galeria)</h2>
                <p className="text-[9px] text-[#eab308] font-bold uppercase tracking-widest mt-1">Organize as estampas disponíveis para personalização</p>
              </div>
              <div className="flex items-center gap-3 bg-white/5 p-3 border border-white/10">
                 <span className="text-[8px] font-black uppercase tracking-widest text-gray-500">Total de Slots</span>
                 <input 
                   type="number" 
                   min="1" 
                   max="100"
                   value={numSlots} 
                   onChange={e => setNumSlots(Math.max(1, parseInt(e.target.value) || 1))}
                   onBlur={async () => {
                     await setDoc(doc(db, 'config', 'brand'), { stampSlots: numSlots }, { merge: true });
                     toast.success('Total de slots atualizado!');
                   }}
                    className="w-16 bg-black border border-white/20 text-white px-2 py-1 text-xs font-black focus:outline-none focus:border-[#eab308]"
                  />
               </div>
            </div>

            <section>
            {/* PAINEL DE ESTOQUE DE ESTAMPAS */}
            <div className="bg-white border border-black/[0.08] p-6 shadow-sm mb-12 space-y-6">
              
              {/* Header com botão de colapsar painel inteiro */}
              <div 
                onClick={() => setIsStockPanelExpanded(!isStockPanelExpanded)}
                className="flex items-center justify-between border-b border-black/[0.06] pb-4 cursor-pointer select-none group"
              >
                <div className="flex items-center gap-3">
                  <span className="w-1.5 h-4 bg-[#eab308]"></span>
                  <div>
                    <h3 className="text-xs font-black uppercase tracking-widest text-[#eab308] flex items-center gap-2 font-sans md:px-0">
                      Estoque de Estampas
                    </h3>
                    <p className="text-[9px] text-gray-400 font-bold uppercase tracking-widest mt-0.5 font-sans md:px-0">
                      Visão geral das artes em estoque e quantidades por variações (posição + tamanho)
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-4">
                  {/* Indicador de Quantidade Geral */}
                  <div className="bg-black text-white px-3 py-1.5 flex items-center gap-3 text-[9px] font-black">
                    <span className="text-gray-400 font-sans tracking-widest">TOTAL</span>
                    <span className="text-[#eab308] font-mono text-xs">{stampInventoryMetrics.totalStock} Un.</span>
                  </div>
                  <div className="w-7 h-7 bg-gray-100 flex items-center justify-center text-gray-600 group-hover:bg-[#eab308] group-hover:text-black transition-colors">
                    {isStockPanelExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                  </div>
                </div>
              </div>

              {/* Corpo colapsável */}
              {isStockPanelExpanded && (
                <div className="space-y-6 animate-fadeIn">
                  
                  {/* Linha de filtros e controles adicionais */}
                  <div className="flex flex-col lg:flex-row gap-4 items-stretch lg:items-center justify-between bg-zinc-50 border border-black/[0.03] p-4">
                    
                    {/* Campo de pesquisa por nome */}
                    <div className="relative flex-1 max-w-sm">
                      <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                      <input 
                        type="text"
                        placeholder="PESQUISAR ESTAMPA..."
                        value={stampSearch}
                        onChange={e => setStampSearch(e.target.value)}
                        className="w-full bg-white border border-black/10 pl-9 pr-4 py-2 text-[10px] uppercase font-bold tracking-wider placeholder-gray-400 focus:outline-none focus:border-[#eab308] transition-all"
                      />
                    </div>

                    {/* Filtros de estoque e variações */}
                    <div className="flex flex-wrap items-center gap-4">
                      
                      {/* Tabs de Filto de Estoque */}
                      <div className="flex bg-neutral-200/60 p-0.5 border border-black/5 text-[8px] font-black uppercase tracking-wider">
                        {(['all', 'in_stock', 'out_of_stock'] as const).map((mode) => (
                          <button
                            key={mode}
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setStampStockFilter(mode);
                            }}
                            className={cn(
                              "px-3 py-1.5 transition-all text-[8px] font-black uppercase tracking-tight",
                              stampStockFilter === mode ? "bg-black text-white shadow font-black" : "text-gray-500 hover:text-black font-bold"
                            )}
                          >
                            {mode === 'all' ? 'Todas' : mode === 'in_stock' ? 'Com Estoque' : 'Sem Estoque'}
                          </button>
                        ))}
                      </div>

                      <div className="h-4 border-l border-black/10 hidden sm:block"></div>

                      {/* Checkbox "Esconder Variações Zeradas" */}
                      <label className="flex items-center gap-2 cursor-pointer select-none">
                        <input 
                          type="checkbox"
                          checked={hideZeroVariations}
                          onChange={e => setHideZeroVariations(e.target.checked)}
                          className="w-3.5 h-3.5 accent-black rounded-none border-black/20 focus:ring-0 cursor-pointer"
                        />
                        <span className="text-[8px] font-black uppercase tracking-wider text-gray-700">Ocultar variações zeradas</span>
                      </label>
                    </div>

                  </div>

                  {/* Grid das estampas listadas */}
                  {filteredStampStock.length === 0 ? (
                    <div className="text-center py-10 bg-gray-50/50 border border-dashed border-gray-200">
                      <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Nenhuma estampa cadastrada ou correspondente aos filtros.</p>
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                      {filteredStampStock.map((stamp) => {
                        const activeVariations = stamp.variations.filter(v => !hideZeroVariations || v.qty > 0);

                        return (
                          <div 
                            key={stamp.name} 
                            className="bg-white border border-black/[0.06] hover:border-black/20 p-4 transition-all duration-300 flex flex-col justify-between group relative"
                          >
                            <div className="space-y-3">
                              
                              {/* Thumbnail + info de estampa */}
                              <div className="flex items-center gap-3">
                                {stamp.image ? (
                                  <div className="w-10 h-10 bg-neutral-100 flex items-center justify-center relative border border-black/[0.04] p-0.5 shrink-0 overflow-hidden">
                                    <img 
                                      src={stamp.image} 
                                      alt={stamp.name} 
                                      className="max-w-full max-h-full object-contain group-hover:scale-110 transition-transform duration-500"
                                      referrerPolicy="no-referrer"
                                    />
                                  </div>
                                ) : (
                                  <div className="w-10 h-10 bg-gray-100 flex items-center justify-center text-[7px] font-black text-gray-400 shrink-0 border border-black/[0.04]">
                                    SEM FOTO
                                  </div>
                                )}
                                <div className="min-w-0 flex-1">
                                  <p className="text-[10px] font-black uppercase tracking-tight text-black line-clamp-1 truncate" title={stamp.name}>
                                    {stamp.name}
                                  </p>
                                  <span className={cn(
                                    "inline-block text-[8px] font-bold px-1.5 py-0.5 tracking-wide uppercase leading-none",
                                    stamp.total > 0 ? "bg-emerald-50 text-emerald-700" : "bg-rose-50 text-rose-700"
                                  )}>
                                    {stamp.total} un. no estoque
                                  </span>
                                </div>
                              </div>

                              {/* Variações com scrollbar */}
                              <div className="border-t border-black/[0.06] pt-2 max-h-[130px] overflow-y-auto scrollbar-thin space-y-1 bg-neutral-50/40 p-2">
                                {activeVariations.length === 0 ? (
                                  <p className="text-[7.5px] font-black text-gray-400 uppercase italic text-center py-2">
                                    {hideZeroVariations ? "Nenhum saldo ativo" : "Sem variações disponíveis"}
                                  </p>
                                ) : (
                                  activeVariations.map((v, sIdx) => {
                                    const hasStock = v.qty > 0;
                                    return (
                                      <div key={sIdx} className="flex justify-between items-center text-[9px] py-0.5 border-b border-black/[0.01]">
                                        <span className={cn("font-bold uppercase text-[8px]", hasStock ? "text-gray-700" : "text-gray-300")}>
                                          {v.label}
                                        </span>
                                        <span className={cn(
                                          "font-black px-1.5 py-0.5 text-[8px] tracking-tighter tabular-nums leading-none",
                                          v.qty > 5 ? "bg-emerald-100 text-emerald-800" : v.qty > 0 ? "bg-amber-100 text-amber-800" : "bg-neutral-100 text-neutral-400 opacity-60"
                                        )}>
                                          {v.qty} un
                                        </span>
                                      </div>
                                    );
                                  })
                                )}
                              </div>

                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}

                </div>
              )}
            </div>

              <div className="flex flex-col md:flex-row md:items-center justify-between mb-8 gap-4 px-4 md:px-0">
                <div className="space-y-1">
                  <h2 className="text-xl font-black uppercase flex items-center gap-2 tracking-tighter italic">Artes da Loja <span className="text-[#eab308]">({numSlots} Slots)</span></h2>
                  <p className="text-gray-400 text-[9px] uppercase font-bold tracking-[0.2em]">Arraste para reordenar a prioridade de exibição na galeria</p>
                </div>
                <button 
                  onClick={async () => {
                    const newTotal = numSlots + 1;
                    setNumSlots(newTotal);
                    await setDoc(doc(db, 'config', 'brand'), { stampSlots: newTotal }, { merge: true });
                  }}
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
                 <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
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
      ) : activeTab === 'identity' ? (
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
                        onChange={e => setIdentityFormData({...identityFormData, heroUrl: convertDriveUrlToDirect(e.target.value)})}
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
                        onChange={e => setIdentityFormData({...identityFormData, aboutUrl: convertDriveUrlToDirect(e.target.value)})}
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
                        onChange={e => setIdentityFormData({...identityFormData, catalogImage1: convertDriveUrlToDirect(e.target.value)})}
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
                        onChange={e => setIdentityFormData({...identityFormData, catalogImage2: convertDriveUrlToDirect(e.target.value)})}
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
                                isVideoUrl(url) ? (
                                  <video 
                                    src={url} 
                                    className="w-full h-full object-cover" 
                                    autoPlay={true} 
                                    loop={true} 
                                    muted={true} 
                                    playsInline={true} 
                                  />
                                ) : (
                                  <img src={url || undefined} className="w-full h-full object-contain" />
                                )
                              ) : <ImageIcon className="text-gray-100" size={24} />}
                           </div>
                           <div className="flex gap-1">
                              <input 
                                type="text" 
                                value={url}
                                onChange={e => {
                                  const newUrls = [...identityFormData.communityUrls];
                                  newUrls[idx] = convertDriveUrlToDirect(e.target.value);
                                  setIdentityFormData({...identityFormData, communityUrls: newUrls});
                                }}
                                className="flex-1 px-2 py-1 border border-black/10 text-[8px] focus:outline-none focus:border-[#eab308]"
                                placeholder={`Imagem ou Vídeo ${idx + 1}`}
                              />
                              <label className="bg-black text-white p-2 cursor-pointer hover:bg-[#eab308] hover:text-black transition-all">
                                <Upload size={10} />
                                <input 
                                  type="file" 
                                  className="hidden" 
                                  accept="image/*,video/*"
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

                {/* Stock Settings */}
                <div className="bg-white border p-6 flex flex-col gap-4 md:col-span-2">
                   <h3 className="text-xs font-black uppercase tracking-widest">Configurações de Disponibilidade</h3>
                   <label className="flex items-start gap-3 cursor-pointer group">
                      <input 
                        type="checkbox" 
                        checked={identityFormData.hideOutOfStock || false}
                        onChange={e => setIdentityFormData({...identityFormData, hideOutOfStock: e.target.checked})}
                        className="mt-1 accent-[#eab308]"
                      />
                      <div>
                         <p className="text-xs font-bold uppercase tracking-wider group-hover:text-[#eab308] transition-colors">Ocultar produtos esgotados da vitrine</p>
                         <p className="text-[10px] text-gray-500 mt-1 uppercase">Se ativado, qualquer estampa ou produto com estoque zerado será automaticamente removido do catálogo e vitrines. Se desativado, o produto exibirá a etiqueta "ESGOTADO".</p>
                      </div>
                   </label>
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
      ) : activeTab === 'automations' ? (
        <React.Suspense fallback={<div className="p-12 text-center text-sm font-bold uppercase tracking-widest text-black/50 animate-pulse">Carregando Automações...</div>}>
          <AdminAutomations />
        </React.Suspense>
      ) : activeTab === 'promotions' ? (
        <React.Suspense fallback={<div className="p-12 text-center text-sm font-bold uppercase tracking-widest text-black/50 animate-pulse">Carregando Promoções...</div>}>
          <AdminPromotions />
        </React.Suspense>
      ) : activeTab === 'analytics' ? (
        <React.Suspense fallback={<div className="p-12 text-center text-sm font-bold uppercase tracking-widest text-black/50 animate-pulse">Carregando Analytics...</div>}>
          <AdminAnalyticsDashboard />
        </React.Suspense>
      ) : activeTab === 'music' ? (
        <React.Suspense fallback={<div className="p-12 text-center text-sm font-bold uppercase tracking-widest text-black/50 animate-pulse">Carregando Rádio F PAC...</div>}>
          <AdminMusic />
        </React.Suspense>
      ) : (
        <React.Suspense fallback={<div className="p-12 text-center text-sm font-bold uppercase tracking-widest text-black/50 animate-pulse">Carregando Financeiro...</div>}>
          <AdminFinancial />
        </React.Suspense>
      )}

      {/* CONFIGURAÇÃO MELHOR ENVIO MODAL */}
      <AnimatePresence>
        {isMelhorEnvioModalOpen && (
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-55 overflow-y-auto flex items-center justify-center p-4">
            <motion.div 
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white text-black border-2 border-black max-w-lg w-full p-6 md:p-8 shadow-2xl relative space-y-6"
            >
              <div className="flex justify-between items-start border-b border-black/10 pb-4">
                <div>
                  <h2 className="text-xl font-black uppercase tracking-widest italic flex items-center gap-2">
                    <Truck className="text-orange-500" size={24} /> Configurar Melhor Envio
                  </h2>
                  <p className="text-[10px] text-gray-500 font-bold uppercase tracking-widest mt-1">
                    Defina as credenciais para geração direta de etiquetas do estoque F PAC STORE
                  </p>
                </div>
                <button 
                  onClick={() => setIsMelhorEnvioModalOpen(false)}
                  className="text-gray-400 hover:text-black font-black uppercase text-xs border border-gray-200 px-3 py-1 bg-gray-50 hover:bg-gray-100 transition-colors"
                >
                  Fechar [X]
                </button>
              </div>

              <div className="space-y-4">
                <div className="space-y-1 bg-gray-50 p-3 border border-black/5 rounded">
                  <p className="text-[10px] font-black uppercase text-gray-400">Status da Integração</p>
                  <div className="flex items-center gap-2 mt-1">
                    <div className={`w-3 h-3 rounded-full ${meHasToken ? 'bg-green-500' : 'bg-red-500 animate-pulse'}`} />
                    <span className="text-xs font-black uppercase">
                      {meHasToken ? 'INTEGRAÇÃO ATIVA (TOKEN CONFIGURADO)' : 'SEM CREDENCIAIS CONFIGURADAS'}
                    </span>
                  </div>
                  {meMaskedToken && (
                    <p className="text-[9px] text-gray-400 font-mono mt-1">Token atual: {meMaskedToken}</p>
                  )}
                </div>

                <div className="space-y-1">
                  <label className="text-[10px] font-black uppercase text-gray-500 tracking-wider block">Insira o Token do Melhor Envio (JWT)</label>
                  <textarea 
                    value={meToken}
                    onChange={(e) => setMeToken(e.target.value)}
                    placeholder="Cole seu token JWT completo da aba Integrações > Permissões de Acesso..."
                    rows={6}
                    className="w-full bg-white text-black border border-black/10 p-3 text-xs font-mono outline-none focus:border-[#eab308] resize-none"
                  />
                  <p className="text-[9px] text-gray-400">
                    Insira o Token de Acesso válido para que as etiquetas possam ser enviadas para o carrinho em produção.
                  </p>
                </div>

                <div className="space-y-1">
                  <label className="text-[10px] font-black uppercase text-gray-500 tracking-wider block">Ambiente / Base URL</label>
                  <select 
                    value={meBaseUrl}
                    onChange={(e) => setMeBaseUrl(e.target.value)}
                    className="w-full bg-white text-black border border-black/10 px-3 py-2 text-xs font-bold uppercase outline-none focus:border-[#eab308]"
                  >
                    <option value="https://www.melhorenvio.com.br">Produção (www.melhorenvio.com.br)</option>
                    <option value="https://sandbox.melhorenvio.com.br">Sandbox (sandbox.melhorenvio.com.br)</option>
                  </select>
                </div>

                <div className="flex gap-3 pt-4">
                  <button 
                    onClick={() => setIsMelhorEnvioModalOpen(false)}
                    className="flex-1 py-3 text-[10px] font-black uppercase border border-black/25 text-black hover:bg-gray-50 transition-all tracking-wider"
                  >
                    Voltar
                  </button>
                  <button 
                    onClick={handleSaveMelhorEnvioConfig}
                    className="flex-1 py-3 text-[10px] font-black uppercase bg-[#eab308] text-black hover:bg-black hover:text-[#eab308] transition-all tracking-wider"
                  >
                    Salvar Permissões
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* VALIDAÇÃO DE DADOS PARA MELHOR ENVIO MODAL */}
      <AnimatePresence>
        {isValidationModalOpen && (
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-56 overflow-y-auto flex items-center justify-center p-4">
            <motion.div 
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white text-black border-2 border-black max-w-lg w-full p-6 md:p-8 shadow-2xl relative space-y-6 overflow-y-auto max-h-[90vh]"
            >
              <div className="flex justify-between items-start border-b border-black/10 pb-4">
                <div>
                  <h2 className="text-xl font-black uppercase tracking-widest italic flex items-center gap-2 text-orange-500">
                    ⚠️ Corrigir Dados do Cliente
                  </h2>
                  <p className="text-[10px] text-gray-500 font-bold uppercase tracking-widest mt-1">
                    Melhor Envio exige informações de destinatário completas e válidas
                  </p>
                </div>
                <button 
                  onClick={() => { setIsValidationModalOpen(false); setMeCpfWarning(false); }}
                  className="text-gray-400 hover:text-black font-black uppercase text-xs border border-gray-200 px-3 py-1 bg-gray-50 hover:bg-gray-100 transition-colors"
                >
                  [X]
                </button>
              </div>

              <div className="space-y-4">
                {meCpfWarning && (
                  <div className="p-3 bg-red-50 border border-red-200 rounded text-[11px] text-red-800 leading-normal">
                    <p className="font-bold uppercase tracking-wide mb-1">🚫 Auto-Envio Detectado</p>
                    <p className="mb-2">O Melhor Envio não permite gerar etiquetas com CPF/CNPJ de origem e destino idênticos (pedido autônomo de teste do próprio dono).</p>
                    <button 
                      type="button"
                      onClick={() => {
                        const num = () => Math.floor(Math.random() * 9);
                        const n = Array.from({ length: 9 }, num);
                        let d1 = 0;
                        for (let i = 0; i < 9; i++) d1 += n[i] * (10 - i);
                        d1 = 11 - (d1 % 11);
                        if (d1 >= 10) d1 = 0;
                        let d2 = 0;
                        for (let i = 0; i < 9; i++) d2 += n[i] * (11 - i);
                        d2 += d1 * 2;
                        d2 = 11 - (d2 % 11);
                        if (d2 >= 10) d2 = 0;
                        const cpfGenerated = [...n, d1, d2].join('');
                        setValCpf(cpfGenerated);
                        toast.success("Novo CPF de teste gerado com sucesso!");
                      }}
                      className="inline-flex items-center gap-1 bg-red-600 hover:bg-black text-white px-3 py-1.5 text-[10px] uppercase font-black tracking-wider transition-colors shadow"
                    >
                      🔄 Utilizar CPF de Teste Novo
                    </button>
                  </div>
                )}

                <div className="p-3 bg-amber-50 border border-amber-200 rounded text-[11px] text-amber-800 leading-normal">
                  <p className="font-bold uppercase tracking-wide mb-1">📋 Verifique os campos abaixo:</p>
                  <p>Alguns dados essenciais do destinatário estão ausentes ou inválidos. Complete-os para poder prosseguir com a geração da etiqueta.</p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <label className="text-[9px] font-black uppercase tracking-wider text-gray-500 block">Nome Completo</label>
                    <input 
                      type="text"
                      value={valName}
                      onChange={(e) => setValName(e.target.value)}
                      className="w-full bg-white text-black border border-black/15 p-2 text-xs focus:border-orange-500 outline-none"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[9px] font-black uppercase tracking-wider text-gray-500 block">Telefone (com DDD)</label>
                    <input 
                      type="text"
                      value={valPhone}
                      onChange={(e) => setValPhone(e.target.value)}
                      placeholder="(00) 00000-0000"
                      className="w-full bg-white text-black border border-black/15 p-2 text-xs focus:border-orange-500 outline-none"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[9px] font-black uppercase tracking-wider text-gray-500 block">E-mail</label>
                    <input 
                      type="email"
                      value={valEmail}
                      onChange={(e) => setValEmail(e.target.value)}
                      className="w-full bg-white text-black border border-black/15 p-2 text-xs focus:border-orange-500 outline-none"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[9px] font-black uppercase tracking-wider text-gray-500 block">CPF ou CNPJ</label>
                    <input 
                      type="text"
                      value={valCpf}
                      onChange={(e) => setValCpf(e.target.value)}
                      placeholder="000.000.000-00"
                      className="w-full bg-white text-black border border-black/15 p-2 text-xs focus:border-orange-500 outline-none"
                    />
                  </div>
                </div>

                <div className="border-t border-black/10 pt-4 space-y-3">
                  <p className="text-[10px] font-black uppercase tracking-wider text-black">🏠 Endereço de Entrega</p>
                  
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    <div className="space-y-1 md:col-span-2">
                      <label className="text-[9px] font-black uppercase tracking-wider text-gray-500 block">CEP</label>
                      <input 
                        type="text"
                        value={valCep}
                        onChange={(e) => {
                          setValCep(e.target.value);
                          const cleaned = e.target.value.replace(/\D/g, '');
                          if (cleaned.length === 8) {
                            fetch(`https://viacep.com.br/ws/${cleaned}/json/`)
                              .then(r => r.json())
                              .then(data => {
                                if (data && !data.erro) {
                                  setValStreet(data.logradouro || '');
                                  setValNeighborhood(data.bairro || '');
                                  setValCity(data.localidade || '');
                                  setValState(data.uf || '');
                                }
                              }).catch(err => console.error("Error looking up corrector CEP", err));
                          }
                        }}
                        placeholder="00000-000"
                        className="w-full bg-white text-black border border-black/15 p-2 text-xs focus:border-orange-500 outline-none font-mono"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[9px] font-black uppercase tracking-wider text-gray-500 block">Estado (UF)</label>
                      <input 
                        type="text"
                        maxLength={2}
                        value={valState}
                        onChange={(e) => setValState(e.target.value.toUpperCase())}
                        placeholder="SC"
                        className="w-full bg-white text-black border border-black/15 p-2 text-xs focus:border-orange-500 outline-none uppercase font-bold"
                      />
                    </div>
                  </div>

                  <div className="space-y-1">
                    <label className="text-[9px] font-black uppercase tracking-wider text-gray-500 block">Rua (Logradouro)</label>
                    <input 
                      type="text"
                      value={valStreet}
                      onChange={(e) => setValStreet(e.target.value)}
                      className="w-full bg-white text-black border border-black/15 p-2 text-xs focus:border-orange-500 outline-none"
                    />
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <label className="text-[9px] font-black uppercase tracking-wider text-gray-500 block">Número</label>
                      <input 
                        type="text"
                        value={valNumber}
                        onChange={(e) => setValNumber(e.target.value)}
                        placeholder="123 ou SN"
                        className="w-full bg-white text-black border border-black/15 p-2 text-xs focus:border-orange-500 outline-none"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[9px] font-black uppercase tracking-wider text-gray-500 block">Complemento (Opcional)</label>
                      <input 
                        type="text"
                        value={valComplement}
                        onChange={(e) => setValComplement(e.target.value)}
                        className="w-full bg-white text-black border border-black/15 p-2 text-xs focus:border-orange-500 outline-none"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <label className="text-[9px] font-black uppercase tracking-wider text-gray-500 block">Bairro</label>
                      <input 
                        type="text"
                        value={valNeighborhood}
                        onChange={(e) => setValNeighborhood(e.target.value)}
                        className="w-full bg-white text-black border border-black/15 p-2 text-xs focus:border-orange-500 outline-none"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[9px] font-black uppercase tracking-wider text-gray-500 block">Cidade</label>
                      <input 
                        type="text"
                        value={valCity}
                        onChange={(e) => setValCity(e.target.value)}
                        className="w-full bg-white text-black border border-black/15 p-2 text-xs focus:border-orange-500 outline-none"
                      />
                    </div>
                  </div>
                </div>

                <div className="flex gap-3 pt-4">
                  <button 
                    type="button"
                    onClick={() => { setIsValidationModalOpen(false); setMeCpfWarning(false); }}
                    className="flex-1 py-3 text-[10px] font-black uppercase border border-black/25 text-black hover:bg-gray-50 transition-all tracking-wider"
                  >
                    Cancelar
                  </button>
                  <button 
                    type="button"
                    onClick={handleSaveAndGenerateLabel}
                    className="flex-1 py-3 text-[10px] font-black uppercase bg-orange-500 text-white hover:bg-black transition-all tracking-wider"
                  >
                    Salvar e Enviar
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* MANUAL ORDER MODAL */}
      <AnimatePresence>
        {isManualModalOpen && (
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-55 overflow-y-auto flex items-center justify-center p-4">
            <motion.div 
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white text-black border-2 border-black max-w-4xl w-full p-6 md:p-8 shadow-2xl relative space-y-6 overflow-y-auto max-h-[90vh]"
            >
              <div className="flex justify-between items-start border-b border-black/10 pb-4">
                <div>
                  <h2 className="text-xl font-black uppercase tracking-widest italic">➕ Registrar Pedido Manual (Integrado)</h2>
                  <p className="text-[10px] text-gray-500 font-bold uppercase tracking-widest mt-1">
                    Insira pedidos originados do WhatsApp, Instagram, etc. com baixa automática de estoque
                  </p>
                </div>
                <button 
                  onClick={() => setIsManualModalOpen(false)}
                  className="text-gray-400 hover:text-black font-black uppercase text-xs border border-gray-200 px-3 py-1 bg-gray-50 hover:bg-gray-100 transition-colors"
                >
                  Fechar [X]
                </button>
              </div>

              <form onSubmit={handleSaveManualOrder} className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                  {/* DADOS DO CLIENTE */}
                  <div className="space-y-4">
                    <h3 className="text-xs font-black uppercase tracking-wider text-[#eab308] border-b border-black/5 pb-1">👤 Dados do Cliente</h3>
                    
                    <div className="flex flex-col gap-1">
                      <label className="text-[9px] font-black uppercase tracking-wider">Nome Completo *</label>
                      <input 
                        type="text" 
                        required
                        value={custName}
                        onChange={e => setCustName(e.target.value)}
                        placeholder="Ex: João Silva"
                        className="py-2.5 px-3 border border-black/10 text-xs focus:outline-none focus:border-black rounded-none uppercase"
                      />
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div className="flex flex-col gap-1">
                        <label className="text-[9px] font-black uppercase tracking-wider">Telefone com DDD *</label>
                        <input 
                          type="text" 
                          required
                          value={custPhone}
                          onChange={e => setCustPhone(e.target.value)}
                          placeholder="Ex: 47999887766"
                          className="py-2.5 px-3 border border-black/10 text-xs focus:outline-none focus:border-black rounded-none"
                        />
                      </div>

                      <div className="flex flex-col gap-1">
                        <label className="text-[9px] font-black uppercase tracking-wider">Telefone 2 / Contato 2 (Opcional)</label>
                        <input 
                          type="text" 
                          value={custPhone2}
                          onChange={e => setCustPhone2(e.target.value)}
                          placeholder="Ex: 47999887766"
                          className="py-2.5 px-3 border border-black/10 text-xs focus:outline-none focus:border-black rounded-none"
                        />
                      </div>

                      <div className="flex flex-col gap-1 sm:col-span-2">
                        <label className="text-[9px] font-black uppercase tracking-wider">E-mail (Opcional)</label>
                        <input 
                          type="email" 
                          value={custEmail}
                          onChange={e => setCustEmail(e.target.value)}
                          placeholder="Ex: joao@gmail.com"
                          className="py-2.5 px-3 border border-black/10 text-xs focus:outline-none focus:border-black rounded-none"
                        />
                      </div>
                    </div>

                    <div className="flex items-center gap-3 py-2 bg-gray-50 border border-black/5 p-3">
                      <input 
                        type="checkbox" 
                        id="isRetiradaCheck"
                        checked={isRetirada}
                        onChange={e => setIsRetirada(e.target.checked)}
                        className="accent-[#eab308] cursor-pointer"
                      />
                      <label htmlFor="isRetiradaCheck" className="text-[10px] font-black uppercase cursor-pointer select-none">
                        Retirada na Loja física (Sem Frete / Entrega local)
                      </label>
                    </div>

                    {!isRetirada && (
                      <div className="space-y-4 pt-2">
                        <div className="flex flex-col gap-1">
                          <label className="text-[9px] font-black uppercase tracking-wider">CEP</label>
                          <input 
                            type="text" 
                            max={9}
                            value={custCep}
                            onChange={e => {
                              setCustCep(e.target.value);
                              handleCEPLookup(e.target.value);
                            }}
                            placeholder="Ex: 89201300"
                            className="py-2.5 px-3 border border-black/10 text-xs focus:outline-none focus:border-black rounded-none"
                          />
                        </div>

                        <div className="grid grid-cols-12 gap-4">
                          <div className="col-span-12 sm:col-span-8 flex flex-col gap-1">
                            <label className="text-[9px] font-black uppercase tracking-wider">Endereço (Rua/Av)</label>
                            <input 
                              type="text" 
                              value={custAddress}
                              onChange={e => setCustAddress(e.target.value)}
                              placeholder="Ex: Rua de Joinville"
                              className="py-2.5 px-3 border border-black/10 text-xs focus:outline-none focus:border-black rounded-none uppercase"
                            />
                          </div>
                          <div className="col-span-12 sm:col-span-4 flex flex-col gap-1">
                            <label className="text-[9px] font-black uppercase tracking-wider">Nº</label>
                            <input 
                              type="text" 
                              value={custNumber}
                              onChange={e => setCustNumber(e.target.value)}
                              placeholder="999"
                              className="py-2.5 px-3 border border-black/10 text-xs focus:outline-none focus:border-black rounded-none"
                            />
                          </div>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                          <div className="flex flex-col gap-1">
                            <label className="text-[9px] font-black uppercase tracking-wider">Complemento</label>
                            <input 
                              type="text" 
                              value={custComplement}
                              onChange={e => setCustComplement(e.target.value)}
                              placeholder="Apto 101"
                              className="py-2.5 px-3 border border-black/10 text-xs focus:outline-none focus:border-black rounded-none uppercase"
                            />
                          </div>
                          <div className="flex flex-col gap-1">
                            <label className="text-[9px] font-black uppercase tracking-wider">Bairro</label>
                            <input 
                              type="text" 
                              value={custNeighborhood}
                              onChange={e => setCustNeighborhood(e.target.value)}
                              placeholder="Ex: Centro"
                              className="py-2.5 px-3 border border-black/10 text-xs focus:outline-none focus:border-black rounded-none uppercase"
                            />
                          </div>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                          <div className="flex flex-col gap-1">
                            <label className="text-[9px] font-black uppercase tracking-wider">Cidade</label>
                            <input 
                              type="text" 
                              value={custCity}
                              onChange={e => setCustCity(e.target.value)}
                              placeholder="Joinville"
                              className="py-2.5 px-3 border border-black/10 text-xs focus:outline-none focus:border-black rounded-none uppercase"
                            />
                          </div>
                          <div className="flex flex-col gap-1">
                            <label className="text-[9px] font-black uppercase tracking-wider">Estado (UF)</label>
                            <input 
                              type="text" 
                              maxLength={2}
                              value={custState}
                              onChange={e => setCustState(e.target.value)}
                              placeholder="SC"
                              className="py-2.5 px-3 border border-black/10 text-xs focus:outline-none focus:border-black rounded-none uppercase"
                            />
                          </div>
                        </div>

                        {/* Roteamento Logístico Inteligente */}
                        <div className="bg-[#eab308]/5 border border-[#eab308]/25 p-3.5 space-y-3 mt-4">
                          <label className="text-[10px] font-black uppercase tracking-widest text-[#eab308] block">🗺️ Roteamento de Entrega & Etiqueta</label>
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            <button
                              type="button"
                              onClick={() => {
                                setManualShippingMethod('Pedido Local');
                                setManualShippingMethodName('Entrega Local F PAC');
                                setManualShippingServiceId(0);
                                setManualOrderShipping(11.40);
                                toast.success("Modificado para TRILHA LOCAL (Pedido Local).");
                              }}
                              className={`p-2.5 text-left border text-[10px] uppercase font-black tracking-wider transition-all flex flex-col justify-between h-20 rounded-none ${
                                manualShippingMethod === 'Pedido Local' 
                                  ? 'bg-black text-[#eab308] border-black scale-[1.02] shadow-sm' 
                                  : 'bg-white text-gray-500 border-black/15 hover:border-black'
                              }`}
                            >
                              <span>🏍️ TRILHA LOCAL</span>
                              <span className="text-[8px] font-medium leading-tight normal-case text-gray-400 block mt-1">
                                Joinville-SC. Modelo Etiqueta A (PDF de entrega manual).
                              </span>
                            </button>

                            <button
                              type="button"
                              onClick={() => {
                                setManualShippingMethod('Melhor Envio');
                                setManualShippingMethodName('Correios SEDEX');
                                setManualShippingServiceId(2);
                                setManualOrderShipping(24.90);
                                toast.success("Modificado para TRILHA NACIONAL (Melhor Envio).");
                              }}
                              className={`p-2.5 text-left border text-[10px] uppercase font-black tracking-wider transition-all flex flex-col justify-between h-20 rounded-none ${
                                manualShippingMethod === 'Melhor Envio' 
                                  ? 'bg-black text-[#eab308] border-black scale-[1.02] shadow-sm' 
                                  : 'bg-white text-gray-500 border-black/15 hover:border-black'
                              }`}
                            >
                              <span>📦 TRILHA NACIONAL</span>
                              <span className="text-[8px] font-medium leading-tight normal-case text-gray-400 block mt-1">
                                Fora de Joinville. Modelo Etiqueta B (Melhor Envio API).
                              </span>
                            </button>
                          </div>

                          {manualShippingMethod === 'Melhor Envio' && (
                            <div className="space-y-1 bg-white p-2 border border-black/5 mt-2">
                              <label className="text-[8px] font-black uppercase text-gray-400 tracking-wider block">Serviço de Frete Nacional</label>
                              <select 
                                value={manualShippingServiceId}
                                onChange={(e) => {
                                  const id = Number(e.target.value);
                                  setManualShippingServiceId(id);
                                  const serviceNames: Record<number, string> = {
                                    1: 'Correios PAC',
                                    2: 'Correios SEDEX',
                                    3: 'Jadlog Package',
                                    4: 'Jadlog .COM',
                                    16: 'Latam Cargo',
                                    17: 'Jamef'
                                  };
                                  setManualShippingMethodName(serviceNames[id] || 'Correios SEDEX');
                                }}
                                className="w-full bg-white text-black border border-black/10 px-2 py-1.5 text-[10px] font-bold uppercase outline-none focus:border-black"
                              >
                                <option value={1}>Correios PAC</option>
                                <option value={2}>Correios SEDEX</option>
                                <option value={3}>Jadlog Package</option>
                                <option value={4}>Jadlog .COM</option>
                                <option value={16}>Latam Cargo</option>
                                <option value={17}>Jamef</option>
                              </select>
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </div>

                  {/* SELEÇÃO E CARRINHO DO PEDIDO */}
                  <div className="space-y-4">
                    <h3 className="text-xs font-black uppercase tracking-wider text-[#eab308] border-b border-black/5 pb-1">👕 Carrinho de Compra</h3>

                    {/* Adicionar Produto individual */}
                    <div className="bg-gray-50 border border-black/10 p-4 space-y-3">
                      <div className="flex flex-col gap-1">
                        <label className="text-[8px] font-black uppercase text-gray-500 tracking-wider">Listagem de Artigo</label>
                        <select 
                          value={selectedProduct ? selectedProduct.id : ''}
                          onChange={e => {
                            const found = currentProducts.find(p => p.id === e.target.value);
                            setSelectedProduct(found || null);
                            if (found) {
                              setItemPrice(found.price);
                              const firstCol = found.colors?.[0];
                              const initialColor = firstCol && typeof firstCol === 'object' ? (firstCol.name || '') : (firstCol || '');
                              setSelectedColor(initialColor);
                              setSelectedSize(found.sizes?.[0] || '');
                            }
                          }}
                          className="py-2.5 px-3 bg-white border border-black/10 text-xs font-bold uppercase cursor-pointer text-black"
                        >
                          <option value="">-- SELECIONE UM ARTIGO --</option>
                          {currentProducts.map(p => (
                            <option key={p.id} value={p.id}>{p.name} - R$ {p.price.toFixed(2)}</option>
                          ))}
                        </select>
                      </div>

                      {selectedProduct && (
                        <div className="space-y-3">
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            {selectedProduct.colors && selectedProduct.colors.length > 0 && (
                              <div className="flex flex-col gap-1">
                                <label className="text-[8px] font-black uppercase text-gray-400">Cor</label>
                                <select 
                                  value={selectedColor}
                                  onChange={e => setSelectedColor(e.target.value)}
                                  className="py-2 px-3 bg-white border border-black/5 text-[11px] font-bold uppercase cursor-pointer"
                                >
                                  {selectedProduct.colors.map((c: any) => {
                                    const cName = c && typeof c === 'object' ? (c.name || '') : c;
                                    return (
                                      <option key={cName} value={cName}>{cName}</option>
                                    );
                                  })}
                                </select>
                              </div>
                            )}

                            <div className="flex flex-col gap-1">
                              <label className="text-[8px] font-black uppercase text-gray-400">Tamanho</label>
                              <select 
                                value={selectedSize}
                                onChange={e => setSelectedSize(e.target.value)}
                                className="py-2 px-3 bg-white border border-black/5 text-[11px] font-bold uppercase cursor-pointer"
                              >
                                {selectedProduct.sizes?.map((s: string) => (
                                  <option key={s} value={s}>{s}</option>
                                ))}
                              </select>
                            </div>
                          </div>

                          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 items-end">
                            <div className="flex flex-col gap-1">
                              <label className="text-[8px] font-black uppercase text-gray-400">override R$</label>
                              <input 
                                type="number" 
                                value={itemPrice}
                                onChange={e => setItemPrice(Number(e.target.value) || 0)}
                                className="py-2 px-3 border border-black/10 text-xs font-bold font-mono"
                              />
                            </div>

                            <div className="flex flex-col gap-1">
                              <label className="text-[8px] font-black uppercase text-gray-400">Quantidade</label>
                              <input 
                                type="number" 
                                min={1}
                                value={itemQty}
                                onChange={e => setItemQty(Math.max(1, Number(e.target.value) || 1))}
                                className="py-2 px-3 border border-black/10 text-xs font-bold font-mono text-center"
                              />
                            </div>

                            <button 
                              type="button"
                              onClick={() => {
                                if (!selectedProduct) return;
                                const productHasColors = !!(selectedProduct.colors && selectedProduct.colors.length > 0);
                                if (productHasColors && !selectedColor) {
                                  toast.error("Por favor, selecione uma cor.");
                                  return;
                                }
                                if (!selectedSize) {
                                  toast.error("Por favor, selecione um tamanho.");
                                  return;
                                }
                                const stockVal = getSelectedVariantStock();
                                if (!ignoreStock && stockVal < itemQty) {
                                  toast.error(`Estoque insuficiente! Disponível: ${stockVal} un.`);
                                  return;
                                }

                                const newItem = {
                                  id: selectedProduct.id,
                                  slug: selectedProduct.slug || selectedProduct.id,
                                  color: selectedColor || 'PADRÃO',
                                  size: selectedSize,
                                  quantity: itemQty,
                                  price: itemPrice || selectedProduct.price,
                                  product: selectedProduct
                                };

                                setTempItems([...tempItems, newItem]);
                                toast.success("Artigo adicionado!");
                                
                                setSelectedProduct(null);
                                setSelectedColor('');
                                setSelectedSize('');
                                setItemQty(1);
                              }}
                              className="py-2.5 bg-black text-white text-[10px] font-black uppercase tracking-widest hover:bg-[#eab308] hover:text-black transition-colors shrink-0 cursor-pointer w-full text-center"
                            >
                              ➕ ADICIONAR
                            </button>
                          </div>

                          {/* Live Stock display */}
                          <div className={cn(
                            "text-[9px] font-black p-2 border tracking-widest uppercase text-center",
                            getSelectedVariantStock() > 0 ? "bg-green-50 text-green-700 border-green-100" : "bg-red-50 text-red-600 border-red-100"
                          )}>
                            Quantidade em estoque: {getSelectedVariantStock()} un.
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Temp Item List layout */}
                    <div className="border border-black/10 p-3 max-h-[160px] overflow-y-auto divide-y divide-black/5 bg-gray-50/50">
                      {tempItems.length === 0 ? (
                        <p className="text-[10px] text-gray-400 uppercase font-black tracking-widest text-center py-6">Nenhum produto adicionado ainda</p>
                      ) : (
                        tempItems.map((item, index) => (
                          <div key={index} className="py-2 flex justify-between items-center text-[10px] uppercase font-bold text-gray-700">
                            <div>
                              <p className="font-black text-black leading-none">{item.product.name}</p>
                              <p className="text-[8px] text-gray-400 mt-1">{item.color} | Tam {item.size} x{item.quantity}</p>
                            </div>
                            <div className="flex items-center gap-4">
                              <span className="font-mono text-black font-black">R$ {(item.price * item.quantity).toFixed(2)}</span>
                              <button 
                                type="button"
                                onClick={() => {
                                  const updated = tempItems.filter((_, idx) => idx !== index);
                                  setTempItems(updated);
                                }}
                                className="text-red-600 hover:text-black hover:scale-110 transition-transform font-black text-xs cursor-pointer"
                              >
                                [x]
                              </button>
                            </div>
                          </div>
                        ))
                      )}
                    </div>

                    {/* OVERLAYS META INFO DESCONTOS */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 border-t border-black/10 pt-3">
                      <div className="flex flex-col gap-1">
                        <label className="text-[9px] font-black uppercase text-gray-400">Desconto R$</label>
                        <input 
                          type="number" 
                          min={0}
                          value={manualOrderDiscount}
                          onChange={e => setManualOrderDiscount(Number(e.target.value) || 0)}
                          className="py-2.5 px-3 border border-black/10 text-xs font-bold font-mono"
                        />
                      </div>
                      <div className="flex flex-col gap-1">
                        <label className="text-[9px] font-black uppercase text-gray-400">Frete R$</label>
                        <input 
                          type="number" 
                          min={0}
                          value={manualOrderShipping}
                          onChange={e => setManualOrderShipping(Number(e.target.value) || 0)}
                          disabled={isRetirada}
                          className="py-2.5 px-3 border border-[#0000001a] text-xs font-bold font-mono disabled:bg-gray-100 disabled:text-gray-400"
                        />
                      </div>
                    </div>

                    {/* Display Total Price */}
                    <div className="bg-black text-white p-4 flex justify-between items-center border-l-4 border-[#eab308]">
                      <div>
                        <span className="text-[8px] font-black tracking-widest text-[#eab308] uppercase block">Consolidado Final</span>
                        <span className="text-[10px] font-bold text-gray-400 block mt-0.5 leading-none font-sans uppercase">
                          Subtotal: R$ {tempItems.reduce((acc, i) => acc + (i.price * i.quantity), 0).toFixed(2)}
                        </span>
                      </div>
                      <span className="text-2xl font-black italic tracking-tight font-mono text-white">
                        R$ {Math.max(0, tempItems.reduce((acc, i) => acc + (i.price * i.quantity), 0) + Number(manualOrderShipping) - Number(manualOrderDiscount)).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                      </span>
                    </div>
                  </div>
                </div>

                {/* ORIGEM / METODO PAGAMENTO / STATUS */}
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4 bg-gray-50 border border-black/5 p-4 text-xs font-black uppercase tracking-wider">
                  <div className="flex flex-col gap-1.5">
                    <label className="text-[8px] font-black text-gray-400">Canal de Origem</label>
                    <select 
                      value={orderOrigin} 
                      onChange={e => setOrderOrigin(e.target.value)}
                      className="py-2 px-3 bg-white border border-black/10 text-[11px] font-bold cursor-pointer"
                    >
                      <option value="WhatsApp">🟢 WhatsApp</option>
                      <option value="Instagram">📸 Instagram</option>
                      <option value="Facebook">🔵 Facebook</option>
                      <option value="Loja Física">🏠 Loja Física</option>
                      <option value="Indicação">🤝 Indicação</option>
                      <option value="Venda Direta">🚪 Venda Direta</option>
                      <option value="Marketplace">🛒 Marketplace</option>
                    </select>
                  </div>

                  <div className="flex flex-col gap-1.5">
                    <label className="text-[8px] font-black text-gray-400">Forma de Pagamento</label>
                    <select 
                      value={paymentMethodForm} 
                      onChange={e => setPaymentMethodForm(e.target.value)}
                      className="py-2 px-3 bg-white border border-black/10 text-[11px] font-bold cursor-pointer"
                    >
                      <option value="PIX">⚡ PIX</option>
                      <option value="Cartão de Crédito">💳 Cartão de Crédito</option>
                      <option value="Dinheiro">💵 Dinheiro (Física/Direta)</option>
                      <option value="Boleto">📄 Boleto Bancário</option>
                      <option value="Transferência">🏦 Transferência</option>
                    </select>
                  </div>

                  <div className="flex flex-col gap-1.5">
                    <label className="text-[8px] font-black text-gray-400">Status do Pedido</label>
                    <select 
                      value={manualOrderStatus} 
                      onChange={e => setManualOrderStatus(e.target.value)}
                      className="py-2 px-3 bg-white border border-black/10 text-[11px] font-bold cursor-pointer"
                    >
                      <option value="Pago">✅ Pago / Aprovado</option>
                      <option value="Aguardando Pagamento">⏳ Aguardando Pgto</option>
                      <option value="Em produção">👕 Em Produção (Separação)</option>
                      <option value="Enviado">🚀 Enviado</option>
                      <option value="Entregue">🙌 Entregue</option>
                      <option value="Cancelado">🛑 Cancelado</option>
                    </select>
                  </div>

                  <div className="flex flex-col gap-1.5 justify-end">
                    <label className="flex items-center gap-2 cursor-pointer py-2 border-t border-black/5 self-stretch justify-center md:border-none">
                      <input 
                        type="checkbox" 
                        checked={ignoreStock}
                        onChange={e => setIgnoreStock(e.target.checked)}
                        className="accent-[#eab308] scale-110"
                      />
                      <span className="text-[8px] font-black text-gray-400 uppercase tracking-widest select-none">Forçar venda s/ estoque</span>
                    </label>
                  </div>
                </div>

                {/* CONTROLE DE ESTOQUE */}
                <div className="bg-gray-100 p-5 border border-black/10">
                  <h4 className="text-[10px] font-black uppercase text-black tracking-widest mb-3 flex items-center gap-1.5">
                    ⚙️ CONTROLE DE ESTOQUE DESTE PEDIDO *
                  </h4>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <label className="flex items-start gap-3 p-3 bg-white border border-black/5 hover:border-[#eab308] cursor-pointer transition-colors relative">
                      <input 
                        type="radio" 
                        name="stockControlRadio"
                        value="move"
                        checked={stockControl === 'move'}
                        onChange={() => setStockControl('move')}
                        className="accent-[#eab308] mt-1 h-4 w-4 text-[#eab308]"
                      />
                      <div className="flex-1">
                        <span className="text-xs font-black uppercase block text-black">🔘 Movimentar Estoque</span>
                        <p className="text-[9px] text-gray-400 font-bold uppercase mt-1 leading-normal">
                          Subtrai as quantidades do estoque. Atualiza inventário, saldo disponível e produtos com baixo estoque. Registra movimentação no histórico.
                        </p>
                      </div>
                    </label>

                    <label className="flex items-start gap-3 p-3 bg-white border border-black/5 hover:border-black cursor-pointer transition-colors relative">
                      <input 
                        type="radio" 
                        name="stockControlRadio"
                        value="no_move"
                        checked={stockControl === 'no_move'}
                        onChange={() => setStockControl('no_move')}
                        className="accent-black mt-1 h-4 w-4"
                      />
                      <div className="flex-1">
                        <span className="text-xs font-black uppercase block text-black">🔘 Não Movimentar Estoque</span>
                        <p className="text-[9px] text-gray-400 font-bold uppercase mt-1 leading-normal">
                          Cria o pedido sem alterar o estoque ou o inventário. Ideal para faturamento puro, retroativo ou prestação de serviços.
                        </p>
                      </div>
                    </label>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-12 gap-4">
                  <div className="flex flex-col gap-1 md:col-span-8">
                    <label className="text-[9px] font-black uppercase text-gray-400 tracking-wider">Observações do Pedido</label>
                    <textarea 
                      value={manualOrderObs}
                      onChange={e => setManualOrderObs(e.target.value)}
                      placeholder="Adicione observações para este faturamento manual..."
                      rows={2}
                      className="py-2.5 px-3 border border-black/10 text-xs focus:outline-none focus:border-black rounded-none uppercase w-full"
                    />
                  </div>

                  <div className="flex flex-col gap-1 md:col-span-4">
                    <label className="text-[9px] font-black uppercase text-gray-400 tracking-wider">Data de Entrega do Pedido</label>
                    <input 
                      type="date"
                      value={manualOrderDeliveryDate}
                      onChange={e => setManualOrderDeliveryDate(e.target.value)}
                      className="py-2 px-3 border border-black/10 text-xs focus:outline-none focus:border-black rounded-none w-full bg-white font-medium"
                    />
                  </div>
                </div>

                <div className="flex flex-col-reverse sm:flex-row items-stretch sm:items-center justify-end gap-3 border-t border-black/10 pt-4 w-full">
                  <button 
                    type="button" 
                    onClick={() => setIsManualModalOpen(false)}
                    className="px-6 py-3 border border-black text-black hover:bg-gray-100 uppercase text-[11px] font-black tracking-widest cursor-pointer font-sans text-center"
                  >
                    Cancelar
                  </button>
                  <button 
                    type="submit" 
                    disabled={savingManualOrder}
                    className="px-10 py-3 bg-black border-2 border-black text-[#eab308] hover:bg-[#eab308] hover:text-black uppercase text-[11px] font-black tracking-[0.15em] transition-all cursor-pointer disabled:bg-gray-300 disabled:text-gray-500 disabled:border-transparent font-sans text-center"
                  >
                    {savingManualOrder ? 'Confirmando...' : 'Salvar Pedido Manual'}
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
