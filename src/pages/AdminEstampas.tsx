import React, { useState, useEffect } from 'react';
import { db, storage } from '../lib/firebase';
import { collection, doc, onSnapshot, query, orderBy, serverTimestamp, setDoc, writeBatch } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
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

const PRIME_LOCATIONS = ["Frente", "Costas", "Manga", "Peito", "Barra"];

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

export function AdminEstampas() {
  const { user, loading: authLoading } = useAuth();
  const [estampas, setEstampas] = useState<Estampa[]>([]);
  const [orderedSlots, setOrderedSlots] = useState<SlotItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [isUploading, setIsUploading] = useState<number | null>(null);
  const [editingSlot, setEditingSlot] = useState<number | null>(null);
  const [editFormData, setEditFormData] = useState<Partial<Estampa>>({
    name: '',
    description: '',
    image: '',
    allowedLocations: [],
    locationConfigs: {}
  });
  const [activeId, setActiveId] = useState<string | null>(null);

  const isAdmin = user?.email === 'fpacstore@gmail.com';

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 5,
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
      const storageRef = ref(storage, `estampas/slot_${slotIndex}_${Date.now()}_${file.name}`);
      const snapshot = await uploadBytes(storageRef, resizedBlob);
      const url = await getDownloadURL(snapshot.ref);
      return url;
    } catch (error) {
      console.error("Upload error:", error);
      toast.error("Erro ao enviar imagem.");
      throw error;
    } finally {
      setIsUploading(null);
    }
  };

  const handleSave = async (slotIndex: number) => {
    if (!isAdmin) return;
    const docId = `slot-${slotIndex}`;
    try {
      await setDoc(doc(db, 'estampas', docId), {
        ...editFormData,
        slotIndex,
        updatedAt: serverTimestamp()
      }, { merge: true });
      setEditingSlot(null);
      toast.success('Estampa salva!');
    } catch (error) {
      console.error(error);
      toast.error("Erro ao salvar estampa.");
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

  if (authLoading) return <div className="min-h-screen flex items-center justify-center"><Loader2 className="animate-spin text-[#eab308]" size={48} /></div>;

  if (!user || !isAdmin) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-4">
        <h1 className="text-2xl font-black uppercase mb-4">Acesso Negado</h1>
        <Link to="/" className="text-[#eab308] underline uppercase text-xs font-bold">Voltar para a Loja</Link>
      </div>
    );
  }

  // Create an array of 15 slots (1 to 15)
  const slots = Array.from({ length: 15 }, (_, i) => i + 1);

  return (
    <div className="min-h-screen bg-white pt-48 pb-20 px-4">
      <div className="max-w-6xl mx-auto">
        <div className="flex items-center justify-between mb-12">
          <div>
            <h1 className="text-4xl font-black uppercase tracking-tighter mb-2">Gestão <span className="text-[#eab308]">de Estampas</span></h1>
            <p className="text-gray-500 text-xs uppercase tracking-widest font-bold">Gerencie os 15 slots de artes disponíveis no site</p>
          </div>
          <Link to="/gestao" className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest hover:text-[#eab308] transition-colors">
            <ArrowLeft size={14} /> Painel de Controle
          </Link>
        </div>

        {/* Grid de Slots */}
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragStart={handleDragStart}
          onDragEnd={handleDragEnd}
        >
          <SortableContext
            items={orderedSlots.map(s => s.id)}
            strategy={rectSortingStrategy}
          >
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-6">
              {loading ? (
                <div className="col-span-full flex justify-center py-20">
                  <Loader2 className="animate-spin text-[#eab308]" size={32} />
                </div>
              ) : (
                orderedSlots.map((item, index) => (
                  <SortableSlot 
                    key={item.id}
                    item={item} 
                    itemIndex={index + 1}
                    isUploading={isUploading}
                    editingSlot={editingSlot}
                    setEditingSlot={setEditingSlot}
                    setEditFormData={setEditFormData}
                    editFormData={editFormData}
                    handleSave={handleSave}
                    clearSlot={clearSlot}
                    handleFileUpload={handleFileUpload}
                  />
                ))
              )}
            </div>
          </SortableContext>

          <DragOverlay>
            {activeId ? (
              <div className="w-[180px] aspect-[4/5] bg-[#1a1a1f] border-2 border-[#eab308] shadow-2xl rounded-lg flex items-center justify-center overflow-hidden">
                 <div className="flex flex-col items-center gap-2">
                    <GripVertical size={24} className="text-[#eab308] animate-bounce" />
                    <span className="text-[10px] font-bold text-white uppercase tracking-widest">Movendo...</span>
                 </div>
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
  itemIndex: number;
  isUploading: number | null;
  editingSlot: number | null;
  setEditingSlot: (slot: number | null) => void;
  setEditFormData: (data: any) => void;
  editFormData: any;
  handleSave: (slotIndex: number) => void;
  clearSlot: (slotIndex: number) => void;
  handleFileUpload: (file: File, slotIndex: number) => Promise<string>;
}

const SortableSlot: React.FC<SortableSlotProps> = ({ 
  item, 
  itemIndex, 
  isUploading, 
  editingSlot, 
  setEditingSlot, 
  setEditFormData, 
  editFormData, 
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
    opacity: isDragging ? 0.3 : 1,
  };

  const estampa = item.estampa;
  const slotIndex = item.slotIndex;
  const isEditing = editingSlot === slotIndex;
  const hasImage = !!estampa?.image;

  return (
    <div 
      ref={setNodeRef} 
      style={style}
      {...attributes}
      {...listeners}
      className={cn(
        "relative overflow-hidden group border border-white/10 cursor-grab active:cursor-grabbing touch-none select-none",
        !hasImage && "border-2 border-dashed border-white/20 bg-black/20",
        isDragging && "scale-105 shadow-2xl border-[#eab308]/50 z-50 bg-white/5"
      )}
    >
      {/* Visual Grip Indicator */}
      <div className="absolute top-2 right-2 z-40 p-1.5 text-[#eab308] bg-black/20 rounded-full border border-[#eab308]/10 opacity-0 group-hover:opacity-100 transition-opacity">
        <GripVertical size={16} />
      </div>

      <div className="absolute top-2 left-2 z-40">
         <span className="bg-[#eab308] text-black text-[8px] font-black uppercase px-2 py-1 tracking-tighter">SLOT {itemIndex}</span>
      </div>

      {/* Aspect Ratio Box */}
      <div className="aspect-[4/5] relative flex items-center justify-center touch-none overflow-hidden p-2">
        {hasImage ? (
          <>
            <img src={estampa?.image || undefined} alt={estampa?.name} className="max-w-full max-h-full object-contain group-hover:scale-105 transition-all duration-700 relative z-10" />
            
            {/* Very subtle reflection light */}
            <div className="absolute inset-0 bg-gradient-to-tr from-white/0 via-white/5 to-white/0 opacity-0 group-hover:opacity-100 transition-opacity duration-1000"></div>
          </>
        ) : (
          <div className="flex flex-col items-center gap-4">
            <span className="text-4xl font-black text-white/5 uppercase tracking-tighter leading-none select-none">F PAC</span>
            <span className="text-3xl font-black text-[#eab308] uppercase tracking-tighter animate-pulse text-center px-4 leading-tight">VAZIO</span>
            <span className="text-[8px] font-bold text-white/20 uppercase tracking-[0.3em]">Cód: {item.id}</span>
          </div>
        )}

        {/* Quick Info Overlay */}
         {hasImage && !isEditing && (
          <div className="absolute bottom-3 left-3 right-3 z-30 text-left">
             <h3 className="text-white font-black text-[9px] uppercase tracking-widest truncate mb-1 bg-black/40 px-1 py-0.5 inline-block">{estampa?.name}</h3>
             <div className="flex flex-wrap gap-1">
                {(estampa as any).position && (estampa as any).position.split(',').filter(Boolean).map((p: string) => (
                  <span key={p} className="text-[6px] font-black bg-white text-black px-1 py-0.5 whitespace-nowrap uppercase">
                    {p === 'PEITO LE/LD' ? 'PEITO' : p.replace('PEITO ', '')}
                  </span>
                ))}
                {((estampa as any).width || (estampa as any).height) && (
                  <span className="text-[6px] font-black bg-[#eab308] text-black px-1 py-0.5 whitespace-nowrap">
                    {(estampa as any).width || '?'}{(estampa as any).height ? `X${(estampa as any).height}` : ''} CM
                  </span>
                )}
             </div>
          </div>
        )}

        {/* Actions Overlay */}
        {!isEditing && (
          <div className="absolute inset-0 bg-black/80 flex flex-col items-center justify-center gap-3 opacity-0 group-hover:opacity-100 transition-opacity z-20">
            <button 
              onPointerDown={(e) => e.stopPropagation()} // Prevent drag when clicking button
              onClick={(e) => {
                e.stopPropagation();
                setEditingSlot(slotIndex);
                setEditFormData({ 
                  name: estampa?.name || `Estampa #${slotIndex}`, 
                  description: estampa?.description || '', 
                  image: estampa?.image || '',
                  allowedLocations: estampa?.allowedLocations || [],
                  locationConfigs: estampa?.locationConfigs || {}
                });
              }}
              className="w-32 bg-[#eab308] text-black py-2.5 text-[10px] font-black uppercase tracking-widest hover:bg-white transition-all flex items-center justify-center gap-2"
            >
              <Edit3 size={14} /> Editar
            </button>
            {hasImage && (
              <button 
                onPointerDown={(e) => e.stopPropagation()} // Prevent drag when clicking button
                onClick={(e) => {
                  e.stopPropagation();
                  clearSlot(slotIndex);
                }}
                className="w-32 bg-red-600 text-white py-2.5 text-[10px] font-black uppercase tracking-widest hover:bg-red-500 transition-all flex items-center justify-center gap-2"
              >
                <Trash2 size={14} /> Limpar
              </button>
            )}
          </div>
        )}

        {/* Editing UI */}
        {isEditing && (
          <div 
            onPointerDown={(e) => e.stopPropagation()} // Prevent drag when interacting with form
            className="absolute inset-0 bg-black p-4 z-50 flex flex-col gap-4 overflow-y-auto"
          >
            <div className="flex items-center justify-between border-b border-white/10 pb-2">
               <span className="text-[10px] font-black text-white uppercase tracking-widest">Editando Slot {itemIndex}</span>
               <button onClick={() => setEditingSlot(null)} className="text-white hover:text-red-500 transition-colors">
                  <X size={16} />
               </button>
            </div>

            <div className="space-y-4">
              <div className="grid grid-cols-1 gap-2">
                <div>
                  <label className="block text-[7px] font-black text-gray-500 uppercase tracking-widest mb-0.5">Nome da Estampa</label>
                  <input 
                    type="text" 
                    value={editFormData.name} 
                    onChange={e => setEditFormData({...editFormData, name: e.target.value})}
                    className="w-full bg-white/5 border border-white/10 p-1.5 text-[10px] font-bold text-white focus:border-[#eab308] outline-none uppercase"
                    placeholder="Ex: FP LOGO PRETO"
                  />
                </div>
                <div>
                  <label className="block text-[7px] font-black text-gray-500 uppercase tracking-widest mb-0.5">Link da Imagem</label>
                  <input 
                    type="text" 
                    value={editFormData.image} 
                    onChange={e => setEditFormData({...editFormData, image: e.target.value})}
                    className="w-full bg-white/5 border border-white/10 p-1.5 text-[9px] text-white/50 focus:border-[#eab308] outline-none"
                    placeholder="https://..."
                  />
                </div>
              </div>

              <div className="space-y-3">
                <label className="block text-[8px] font-black text-[#eab308] uppercase tracking-[0.2em] mb-1">Configuração de Locais e Tamanhos</label>
                
                {PRIME_LOCATIONS.map(loc => {
                  const isActive = (editFormData.allowedLocations || []).includes(loc);
                  return (
                    <div key={loc} className={cn(
                      "p-2 border transition-all",
                      isActive ? "bg-white/5 border-[#eab308]/30" : "bg-black border-white/5 opacity-40 hover:opacity-100"
                    )}>
                      <div className="flex items-center justify-between mb-2">
                        <span className={cn("text-[9px] font-black uppercase tracking-widest", isActive ? "text-[#eab308]" : "text-white")}>
                          {loc}
                        </span>
                        <button 
                          onClick={() => {
                            let locations = [...(editFormData.allowedLocations || [])];
                            let newConfigs = { ...(editFormData.locationConfigs || {}) };
                            
                            if (isActive) {
                              locations = locations.filter(l => l !== loc);
                            } else {
                              locations.push(loc);
                              if (!newConfigs[loc]) {
                                newConfigs[loc] = { sizes: ['', '', '', '', ''] };
                              }
                            }
                            setEditFormData({ ...editFormData, allowedLocations: locations, locationConfigs: newConfigs });
                          }}
                          className={cn(
                            "text-[8px] font-black px-2 py-0.5 border transition-all",
                            isActive ? "bg-[#eab308] text-black border-[#eab308]" : "text-white border-white/20 hover:border-[#eab308]"
                          )}
                        >
                          {isActive ? "ATIVO" : "ATIVAR"}
                        </button>
                      </div>

                      {isActive && (
                        <div className="grid grid-cols-4 gap-1">
                          {[0, 1, 2, 3].map(idx => (
                            <input 
                              key={idx}
                              type="text"
                              placeholder="LxH"
                              value={editFormData.locationConfigs?.[loc]?.sizes?.[idx] || ''}
                              onChange={(e) => {
                                const configs = { ...(editFormData.locationConfigs || {}) };
                                const locConfig = { ...(configs[loc] || { sizes: ['', '', '', '', ''] }) };
                                const newSizes = [...(locConfig.sizes || ['', '', '', '', ''])];
                                newSizes[idx] = e.target.value;
                                locConfig.sizes = newSizes;
                                configs[loc] = locConfig;
                                setEditFormData({ ...editFormData, locationConfigs: configs });
                              }}
                              className="w-full bg-white/10 border border-white/10 p-1 text-[9px] text-white text-center focus:border-[#eab308] outline-none"
                            />
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
              
              <div className="flex flex-col gap-2 pt-2 border-t border-white/10">
                <label className="w-full bg-black border border-white/10 text-white py-2 text-[9px] font-black uppercase tracking-widest hover:bg-white hover:text-black transition-all flex items-center justify-center gap-2 cursor-pointer">
                  <Upload size={12} /> {isUploading === slotIndex ? 'Subindo...' : 'Trocar Imagem do PC'}
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

                <button 
                  onClick={() => handleSave(slotIndex)}
                  className="w-full bg-[#eab308] text-black py-2.5 text-[10px] font-black uppercase tracking-widest hover:brightness-110 transition-all flex items-center justify-center gap-2"
                >
                  <Save size={14} /> Salvar Alterações
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
