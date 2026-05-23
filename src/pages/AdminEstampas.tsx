import React, { useState, useEffect } from 'react';
import { db } from '../lib/firebase';
import { collection, doc, onSnapshot, query, orderBy, serverTimestamp, setDoc, writeBatch } from 'firebase/firestore';
import { uploadToSupabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import { Trash2, Image as ImageIcon, Loader2, ArrowLeft, Upload, Edit3, Save, X, GripVertical } from 'lucide-react';
import { Link } from 'react-router-dom';
import { cn, resizeImage } from '../lib/utils';
import toast from 'react-hot-toast';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  MouseSensor,
  TouchSensor,
  useSensor,
  useSensors,
  DragEndEvent,
  DragOverlay,
  defaultDropAnimationSideEffects,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  rectSortingStrategy,
  useSortable
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { motion, AnimatePresence } from 'framer-motion';

const PRIME_LOCATIONS = ["Peito Central", "Costas", "Manga", "Peito Lateral", "Barra"];

interface Estampa {
  id: string;
  name: string;
  description: string;
  image: string;
  slotIndex: number;
  allowedLocations?: string[];
  locationConfigs?: Record<string, { sizes: string[] }>;
}

interface SlotItem {
  id: string; // This will be "slot-N"
  slotIndex: number;
  estampa: Estampa | null;
}

export default function AdminEstampas() {
  const { user, loading: authLoading } = useAuth();
  const [estampas, setEstampas] = useState<Estampa[]>([]);
  const [orderedSlots, setOrderedSlots] = useState<SlotItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [isUploading, setIsUploading] = useState<number | null>(null);
  
  // New state for multiple editing panels
  const [activeEditIds, setActiveEditIds] = useState<string[]>([]);
  // Store form data for each active edit session
  const [editFormsData, setEditFormsData] = useState<Record<string, Partial<Estampa>>>({});
  
  const [activeId, setActiveId] = useState<string | null>(null);

  const isAdmin = user?.email === 'fpacstore@gmail.com' || user?.email === 'atendimento@fpacstore.com.br';

  const sensors = useSensors(
    useSensor(MouseSensor, {
      activationConstraint: {
        distance: 10,
      },
    }),
    useSensor(TouchSensor, {
      activationConstraint: {
        delay: 250,
        tolerance: 5,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  useEffect(() => {
    if (!isAdmin) return;
    const q = query(collection(db, 'estampas'), orderBy('slotIndex', 'asc'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Estampa));
      setEstampas(data);
      
      // Initialize ordered slots
      const initialSlots: SlotItem[] = Array.from({ length: 15 }, (_, i) => {
        const slotIdx = i + 1;
        const estampa = data.find(e => e.slotIndex === slotIdx) || null;
        return {
          id: estampa ? estampa.id : `empty-${slotIdx}`,
          slotIndex: slotIdx,
          estampa
        };
      });
      setOrderedSlots(initialSlots);
      setLoading(false);
    });
    return () => unsubscribe();
  }, [isAdmin]);

  const handleFileUpload = async (file: File, slotIndex: number): Promise<string> => {
    setIsUploading(slotIndex);
    try {
      const resizedBlob = await resizeImage(file);
      const result = await uploadToSupabase(resizedBlob, 'estampas', file.name);
      return result.url;
    } catch (error: any) {
      console.error("Upload error:", error);
      toast.error(error.message || "Erro ao enviar imagem.");
      throw error;
    } finally {
      setIsUploading(null);
    }
  };

  const handleSave = async (slotIndex: number, formData: any) => {
    if (!isAdmin) return;
    const docId = `slot-${slotIndex}`;
    const id = orderedSlots.find(s => s.slotIndex === slotIndex)?.id || docId;
    
    try {
      const sum = (formData.allowedLocations || []).reduce((accSum: number, loc: string) => {
        const locConfig = formData.locationConfigs?.[loc];
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
        ...formData,
        slotIndex,
        updatedAt: serverTimestamp()
      }, { merge: true });

      // Keep the slot's stock in inventory updated directly
      await setDoc(doc(db, 'inventory', id), {
        stock: sum,
        available: sum > 0,
        updatedAt: new Date()
      }, { merge: true });
      
      // Remove from active edits
      setActiveEditIds(prev => prev.filter(currentId => currentId !== id));
      toast.success('Estampa salva!');
    } catch (error) {
      console.error(error);
      toast.error("Erro ao salvar estampa.");
    }
  };

  const toggleEditing = (item: SlotItem) => {
    const id = item.id;
    if (activeEditIds.includes(id)) {
      setActiveEditIds(prev => prev.filter(currentId => currentId !== id));
    } else {
      setActiveEditIds(prev => [...prev, id]);
      setEditFormsData(prev => ({
        ...prev,
        [id]: {
          name: item.estampa?.name || `Estampa #${item.slotIndex}`,
          description: item.estampa?.description || '',
          image: item.estampa?.image || '',
          allowedLocations: item.estampa?.allowedLocations || [],
          locationConfigs: item.estampa?.locationConfigs || {}
        }
      }));
    }
  };

  const clearSlot = async (slotIndex: number) => {
    if (!isAdmin) return;
    const docId = `slot-${slotIndex}`;
    try {
        await setDoc(doc(db, 'estampas', docId), {
          image: '',
          name: `Card #${slotIndex}`,
          description: '',
          allowedLocations: [],
          locationConfigs: {},
          slotIndex,
          updatedAt: serverTimestamp()
        });
        toast.success('Slot limpo.');
    } catch (err) {
      console.error(err);
      toast.error('Erro ao limpar slot.');
    }
  };

  const handleDragStart = (event: any) => {
    setActiveId(event.active.id);
  };

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;
    setActiveId(null);

    if (over && active.id !== over.id) {
      setOrderedSlots((items) => {
        const oldIndex = items.findIndex((i) => i.id === active.id);
        const newIndex = items.findIndex((i) => i.id === over.id);
        const newItems = arrayMove(items, oldIndex, newIndex) as SlotItem[];
        
        // Update Firestore with new indexes
        updateIndexes(newItems);
        
        return newItems;
      });
    }
  };

  const updateIndexes = async (items: SlotItem[]) => {
    const batch = writeBatch(db);
    let hasChanges = false;

    for (let i = 0; i < items.length; i++) {
        const newSlotIndex = i + 1;
        const item = items[i];
        
        if (item.estampa && item.estampa.slotIndex !== newSlotIndex) {
          const docRef = doc(db, 'estampas', item.estampa.id);
          batch.update(docRef, {
              slotIndex: newSlotIndex,
              updatedAt: serverTimestamp()
          });
          hasChanges = true;
        }
    }

    if (hasChanges) {
      try {
          await batch.commit();
      } catch (error) {
          console.error("Error updating slot indexes:", error);
      }
    }
  };

  if (authLoading) return <div className="min-h-screen flex items-center justify-center bg-white"><Loader2 className="animate-spin text-black" size={48} /></div>;

  if (!user || !isAdmin) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-4 bg-white">
        <h1 className="text-2xl font-black uppercase mb-4 tracking-tighter">Acesso Negado</h1>
        <Link to="/" className="bg-black text-white px-8 py-3 text-[10px] font-black uppercase tracking-widest hover:bg-[#eab308] hover:text-black transition-all">Voltar para a Loja</Link>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#fafafa] pt-24 pb-20">
      <div className="max-w-[1400px] mx-auto px-6">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 mb-10">
          <div className="space-y-2">
            <div className="flex items-center gap-3 mb-3">
               <span className="bg-black text-white px-3 py-1 text-[9px] font-black uppercase tracking-[0.3em]">ADMIN</span>
               <div className="h-px w-12 bg-black/10" />
            </div>
            <h1 className="text-3xl md:text-5xl font-black uppercase tracking-tighter leading-[0.9]">
              Gestão de <br />
              <span className="text-[#eab308]">Estampas</span>
            </h1>
            <p className="text-gray-400 text-[11px] font-bold uppercase tracking-widest mt-4">
              Controle total sobre as 15 artes disponíveis na loja
            </p>
          </div>
          <Link to="/gestao" className="flex items-center gap-3 bg-white border border-black/10 px-6 py-4 text-[10px] font-black uppercase tracking-widest hover:border-black transition-all group">
            <ArrowLeft size={16} className="group-hover:-translate-x-1 transition-transform" /> 
            Voltar para Gestão
          </Link>
        </div>

        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragStart={handleDragStart}
          onDragEnd={handleDragEnd}
        >
          {loading ? (
            <div className="flex justify-center py-40">
              <Loader2 className="animate-spin text-black" size={48} />
            </div>
          ) : (
            <div className="space-y-8">
              <div className="flex items-center gap-4">
                <h2 className="text-[10px] font-black uppercase tracking-[0.3em] text-gray-400">Artes da Loja (15 Slots)</h2>
                <div className="flex-1 h-px bg-black/5" />
              </div>

              <SortableContext
                items={orderedSlots.map(s => s.id)}
                strategy={rectSortingStrategy}
              >
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4 md:gap-5">
                  {orderedSlots.map((item) => (
                    <SortableSlot 
                      key={item.id}
                      item={item} 
                      isUploading={isUploading}
                      isEditing={activeEditIds.includes(item.id)}
                      toggleEditing={() => toggleEditing(item)}
                      editFormData={editFormsData[item.id] || {}}
                      setEditFormData={(data) => setEditFormsData(prev => ({ ...prev, [item.id]: data }))}
                      handleSave={(formData) => handleSave(item.slotIndex, formData)}
                      clearSlot={clearSlot}
                      handleFileUpload={handleFileUpload}
                    />
                  ))}
                </div>
              </SortableContext>
            </div>
          )}

          <DragOverlay adjustTarget={true}>
            {activeId ? (
              <div className="w-[140px] aspect-square bg-black border-2 border-[#eab308] shadow-2xl overflow-hidden flex items-center justify-center">
                  <GripVertical size={24} className="text-[#eab308]" />
              </div>
            ) : null}
          </DragOverlay>
        </DndContext>
      </div>
    </div>
  );
}
interface SortableSlotProps {
  item: SlotItem;
  isUploading: number | null;
  isEditing: boolean;
  toggleEditing: () => void;
  editFormData: any;
  setEditFormData: (data: any) => void;
  handleSave: (formData: any) => void;
  clearSlot: (slotIndex: number) => void;
  handleFileUpload: (file: File, slotIndex: number) => Promise<string>;
}

const SortableSlot: React.FC<SortableSlotProps> = ({ 
  item, 
  isUploading, 
  isEditing, 
  toggleEditing, 
  editFormData, 
  setEditFormData, 
  handleSave, 
  clearSlot, 
  handleFileUpload
}) => {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging
  } = useSortable({ id: item.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 50 : undefined,
  };

  const estampa = item.estampa;
  const slotIndex = item.slotIndex;
  const hasImage = !!estampa?.image;

  return (
    <>
      <div 
        ref={setNodeRef} 
        style={style}
        className={cn(
          "relative group bg-white border border-black/5 overflow-hidden transition-all duration-300",
          "hover:border-black/20 hover:shadow-lg",
          isDragging ? "opacity-0" : "opacity-100",
          "aspect-square",
          !hasImage && "bg-gray-50 border-dashed border-black/10"
        )}
      >
        <div className="absolute top-2 left-2 z-10 flex items-center gap-2">
           <span className="bg-black text-white text-[8px] font-black px-2 py-0.5 uppercase tracking-widest leading-none">#{slotIndex}</span>
        </div>

        {/* Drag Handle - Only part that triggers drag on mobile/hover */}
        <div 
          {...attributes} 
          {...listeners} 
          className="absolute top-2 right-2 z-20 cursor-grab active:cursor-grabbing p-1.5 bg-white shadow-xl border border-black/5 opacity-0 group-hover:opacity-100 transition-all hover:bg-black hover:text-white"
        >
          <GripVertical size={14} />
        </div>

        {/* Card Content */}
        <div className="w-full h-full p-4 flex items-center justify-center">
          {hasImage ? (
            <img 
               src={estampa?.image} 
               alt={estampa?.name} 
               className={cn(
                 "w-full h-full object-contain transition-transform duration-500",
                 "group-hover:scale-110"
               )}
            />
          ) : (
             <div className="text-center opacity-10">
                <ImageIcon size={32} className="mx-auto mb-1" />
                <p className="text-[7px] font-black uppercase tracking-[0.3em]">VAZIO</p>
             </div>
          )}
        </div>

        {/* Overlay Info Layer */}
        {hasImage && !isEditing && (
           <div className="absolute inset-x-0 bottom-0 p-3 translate-y-1 opacity-0 group-hover:translate-y-0 group-hover:opacity-100 transition-all duration-300 bg-gradient-to-t from-black via-black/40 to-transparent">
              <p className="text-[9px] font-black text-[#eab308] uppercase tracking-tighter mb-1 truncate">{estampa?.name}</p>
               <div className="flex flex-wrap gap-1">
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
                              <span key={loc} className="text-[6px] font-black text-white uppercase border border-white/20 px-1 py-0.5">{loc}</span>
                           ))}
                           {validLocs.length > 2 && (
                              <span className="text-[6px] font-black text-white uppercase border border-white/20 px-1 py-0.5">+{validLocs.length - 2}</span>
                           )}
                        </>
                     );
                  })()}
               </div>
           </div>
        )}

        {/* Quick Action Trigger */}
        <div className="absolute inset-0 z-30 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all pointer-events-none">
           <div className="flex flex-col gap-1.5 pointer-events-auto scale-90 group-hover:scale-100 transition-transform">
              <button 
                onClick={toggleEditing}
                className="bg-black text-white px-4 py-2 text-[8px] font-black uppercase tracking-widest hover:bg-[#eab308] hover:text-black transition-all shadow-xl"
              >
                {hasImage ? 'EDITAR' : 'ADD'}
              </button>
              {hasImage && (
                <button 
                  onClick={(e) => {
                    e.stopPropagation();
                    if(confirm('Limpar este slot?')) clearSlot(slotIndex);
                  }}
                  className="bg-red-600 text-white py-2 px-4 hover:bg-black transition-all shadow-xl flex justify-center"
                >
                  <Trash2 size={12} />
                </button>
              )}
           </div>
        </div>
      </div>

      {/* Modern Drawer/Side Panel for Editing */}
      <AnimatePresence>
        {isEditing && (
          <>
            {/* Backdrop */}
            <motion.div 
               initial={{ opacity: 0 }}
               animate={{ opacity: 1 }}
               exit={{ opacity: 0 }}
               onClick={toggleEditing}
               className="fixed inset-0 bg-black/40 backdrop-blur-sm z-[100]"
            />
            
            {/* Panel */}
            <motion.div 
               initial={{ x: '100%' }}
               animate={{ x: 0 }}
               exit={{ x: '100%' }}
               transition={{ type: 'spring', damping: 25, stiffness: 200 }}
               className="fixed right-0 top-0 bottom-0 w-full md:w-[450px] bg-white shadow-2xl z-[101] flex flex-col overflow-hidden"
            >
               {/* Panel Header */}
               <div className="p-8 border-b border-black/5 flex items-center justify-between">
                  <div>
                    <span className="text-[9px] font-black uppercase tracking-[0.3em] text-[#eab308]">Editor de Estampa</span>
                    <h3 className="text-2xl font-black uppercase tracking-tighter">Slot #{slotIndex}</h3>
                  </div>
                  <button onClick={toggleEditing} className="p-2 hover:bg-gray-100 transition-colors">
                     <X size={20} />
                  </button>
               </div>

               {/* Panel Content */}
               <div className="flex-1 overflow-y-auto p-8 space-y-10">
                  {/* Preview Section */}
                  <div className="aspect-[4/3] bg-[#f9f9f9] flex items-center justify-center p-8 relative group">
                    {editFormData.image ? (
                       <img src={editFormData.image} alt="Preview" className="max-w-full max-h-full object-contain" />
                    ) : (
                       <div className="text-center opacity-20">
                          <ImageIcon size={48} className="mx-auto mb-2" />
                          <p className="text-[10px] font-black uppercase">Sem Imagem</p>
                       </div>
                    )}
                    
                    <label className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center cursor-pointer">
                       <div className="text-center text-white">
                          <Upload size={24} className="mx-auto mb-2" />
                          <span className="text-[10px] font-black uppercase tracking-widest">{isUploading === slotIndex ? 'SUBINDO...' : 'TROCAR IMAGEM'}</span>
                       </div>
                       <input 
                         type="file" 
                         className="hidden" 
                         accept="image/*"
                         disabled={isUploading === slotIndex}
                         onChange={async (e) => {
                           const file = e.target.files?.[0];
                           if (file) {
                             const url = await handleFileUpload(file, slotIndex);
                             setEditFormData({ ...editFormData, image: url });
                           }
                         }}
                       />
                    </label>
                  </div>

                  {/* Basic Info */}
                  <div className="space-y-6">
                    <div className="space-y-2">
                       <label className="text-[10px] font-black uppercase tracking-widest text-gray-400">Nome da Arte</label>
                       <input 
                          type="text" 
                          placeholder="EX: LOGO CLASSIC PRETO"
                          value={editFormData.name}
                          onChange={e => setEditFormData({ ...editFormData, name: e.target.value })}
                          className="w-full bg-[#f9f9f9] border-none p-4 text-xs font-bold uppercase focus:ring-1 focus:ring-[#eab308] outline-none"
                       />
                    </div>

                    <div className="space-y-2">
                       <label className="text-[10px] font-black uppercase tracking-widest text-gray-400">Dimensões e Locais</label>
                       <div className="space-y-2">
                          {PRIME_LOCATIONS.map(loc => {
                            const isSelected = (editFormData.allowedLocations || []).includes(loc);
                            return (
                               <div key={loc} className="border border-black/5 overflow-hidden">
                                  <button 
                                    onClick={() => {
                                      let locations = [...(editFormData.allowedLocations || [])];
                                      let newConfigs = { ...(editFormData.locationConfigs || {}) };
                                      if (isSelected) {
                                        locations = locations.filter(l => l !== loc);
                                      } else {
                                        locations.push(loc);
                                        if (!newConfigs[loc]) newConfigs[loc] = { sizes: ['', '', '', ''], quantities: [0, 0, 0, 0] };
                                      }
                                      setEditFormData({ ...editFormData, allowedLocations: locations, locationConfigs: newConfigs });
                                    }}
                                    className={cn(
                                      "w-full px-4 py-3 flex items-center justify-between transition-colors",
                                      isSelected ? "bg-black text-white" : "bg-white text-black hover:bg-gray-50"
                                    )}
                                  >
                                     <span className="text-[10px] font-black uppercase tracking-widest">{loc}</span>
                                     <div className={cn("w-2 h-2 rounded-full", isSelected ? "bg-[#eab308]" : "bg-gray-200")} />
                                  </button>

                                  {isSelected && (
                                     <div className="p-4 bg-[#f9f9f9] grid grid-cols-4 gap-2">
                                        {[0, 1, 2, 3].map(idx => (
                                           <div key={idx} className="flex flex-col gap-1 border border-black/5 p-2 bg-white rounded">
                                              <span className="text-[7px] font-bold text-gray-400 uppercase text-center">Tam {idx + 1}</span>
                                              <input 
                                                type="text"
                                                placeholder="LxH"
                                                value={editFormData.locationConfigs?.[loc]?.sizes?.[idx] || ''}
                                                onChange={(e) => {
                                                  const configs = { ...(editFormData.locationConfigs || {}) };
                                                  const locRes = { ...(configs[loc] || { sizes: ['', '', '', ''], quantities: [0, 0, 0, 0] }) };
                                                  const newSizes = [...(locRes.sizes || ['', '', '', ''])];
                                                  newSizes[idx] = e.target.value;
                                                  locRes.sizes = newSizes;
                                                  configs[loc] = locRes;
                                                  setEditFormData({ ...editFormData, locationConfigs: configs });
                                                }}
                                                className="w-full bg-gray-50 border border-black/10 px-1 py-1 text-[9px] font-black text-center focus:border-[#eab308] outline-none"
                                              />
                                              <input 
                                                type="number"
                                                placeholder="Qtd"
                                                min="0"
                                                value={editFormData.locationConfigs?.[loc]?.quantities?.[idx] !== undefined && editFormData.locationConfigs?.[loc]?.quantities?.[idx] !== null ? editFormData.locationConfigs?.[loc]?.quantities?.[idx] : ''}
                                                onChange={(e) => {
                                                  const configs = { ...(editFormData.locationConfigs || {}) };
                                                  const locRes = { ...(configs[loc] || { sizes: ['', '', '', ''], quantities: [0, 0, 0, 0] }) };
                                                  const newQuantities = [...(locRes.quantities || [0, 0, 0, 0])];
                                                  newQuantities[idx] = e.target.value === '' ? '' : Math.max(0, parseInt(e.target.value) || 0);
                                                  locRes.quantities = newQuantities;
                                                  configs[loc] = locRes;
                                                  setEditFormData({ ...editFormData, locationConfigs: configs });
                                                }}
                                                className="w-full bg-white border border-black/10 px-1 py-1 text-[9px] font-black text-center focus:border-[#eab308] outline-none"
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
                  </div>
               </div>

                     <div className="pt-4 border-t border-black/5 space-y-1 my-4">
                        <label className="text-[10px] font-black uppercase tracking-widest text-gray-400">Estoque Geral Calculado</label>
                        <div className="w-full bg-gray-100 border border-black/10 p-3 text-[12px] font-black text-center text-gray-700 select-none">
                          {(() => {
                            const sum = (editFormData.allowedLocations || []).reduce((accSum: number, loc: string) => {
                              const locConfig = editFormData.locationConfigs?.[loc];
                              if (!locConfig) return accSum;
                              const quantities = locConfig.quantities || [0, 0, 0, 0];
                              const locSum = quantities.reduce((acc: number, qty: any, i: number) => {
                                const size = locConfig.sizes?.[i];
                                if (!size || size.trim() === '') return acc;
                                return acc + (Number(qty) || 0);
                              }, 0);
                              return accSum + locSum;
                            }, 0);
                            return sum;
                          })()} Unidades
                        </div>
                     </div>

               {/* Footer Actions */}
               <div className="p-8 border-t border-black/5 bg-[#fafafa] flex gap-4">
                  <button 
                    onClick={toggleEditing}
                    className="flex-1 bg-white border border-black/10 py-5 text-[10px] font-black uppercase tracking-widest hover:border-black transition-all"
                  >
                    CANCELAR
                  </button>
                  <button 
                    onClick={() => handleSave(editFormData)}
                    className="flex-[2] bg-black text-white py-5 text-[10px] font-black uppercase tracking-widest hover:bg-[#eab308] hover:text-black transition-all shadow-xl"
                  >
                    SALVAR ALTERAÇÕES
                  </button>
               </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </>
  );
};
