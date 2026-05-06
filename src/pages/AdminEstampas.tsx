import React, { useState, useEffect } from 'react';
import { db, storage } from '../lib/firebase';
import { collection, doc, onSnapshot, query, orderBy, serverTimestamp, setDoc } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { useAuth } from '../context/AuthContext';
import { Trash2, Image as ImageIcon, Loader2, ArrowLeft, Upload, Edit3, Save, X, GripVertical } from 'lucide-react';
import { Link } from 'react-router-dom';
import { cn } from '../lib/utils';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
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

interface Estampa {
  id: string;
  name: string;
  description: string;
  image: string;
  slotIndex: number;
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
  const [editFormData, setEditFormData] = useState({ name: '', description: '', image: '' });
  const [activeId, setActiveId] = useState<string | null>(null);

  const isAdmin = user?.email === 'fpacstore@gmail.com';

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
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
          id: `slot-${slotIdx}`,
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
      const storageRef = ref(storage, `estampas/slot_${slotIndex}_${Date.now()}_${file.name}`);
      const snapshot = await uploadBytes(storageRef, file);
      const url = await getDownloadURL(snapshot.ref);
      return url;
    } catch (error) {
      console.error("Upload error:", error);
      alert("Erro ao enviar imagem.");
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
    } catch (error) {
      console.error(error);
      alert("Erro ao salvar estampa.");
    }
  };

  const clearSlot = async (slotIndex: number) => {
    if (!isAdmin) return;
    if (window.confirm("Deseja realmente limpar este card? Ele ficará como ESGOTADO.")) {
      const docId = `slot-${slotIndex}`;
      try {
         await setDoc(doc(db, 'estampas', docId), {
           image: '',
           name: `Card #${slotIndex}`,
           description: '',
           slotIndex,
           updatedAt: serverTimestamp()
         });
      } catch (err) {
        console.error(err);
      }
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
    for (let i = 0; i < items.length; i++) {
        const newSlotIndex = i + 1;
        const item = items[i];
        
        // Only update if index changed
        // We always use the "slot-N" doc ID from the original item
        // or just use slot-N based on N=newSlotIndex?
        // Actually, the most robust way is to update the document that was at that position
        // the item.id is stable (e.g. "slot-5").
        
        const docId = item.id;
        
        try {
            await setDoc(doc(db, 'estampas', docId), {
                slotIndex: newSlotIndex,
                updatedAt: serverTimestamp()
            }, { merge: true });
        } catch (error) {
            console.error("Error updating slot index:", error);
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
    <div className="min-h-screen bg-white pt-44 pb-20 px-4">
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
              <div className="w-full aspect-[4/5] bg-black/50 border-2 border-[#eab308] opacity-50 scale-105 pointer-events-none"></div>
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
      className={cn(
        "relative bg-black transition-all duration-500 overflow-hidden group border border-white/5",
        !hasImage && "border-2 border-dashed border-white/20",
        isDragging && "scale-105 shadow-2xl border-[#eab308]/50"
      )}
    >
      {/* Drag Handle */}
      <div 
        {...attributes} 
        {...listeners}
        className="absolute top-2 right-2 z-40 p-2 cursor-grab active:cursor-grabbing text-white/30 hover:text-[#eab308] transition-colors bg-black/40 rounded-full opacity-0 group-hover:opacity-100"
      >
        <GripVertical size={16} />
      </div>

      <div className="absolute top-2 left-2 z-40">
         <span className="bg-[#eab308] text-black text-[8px] font-black uppercase px-2 py-1 tracking-tighter">SLOT {itemIndex}</span>
      </div>

      {/* Aspect Ratio Box */}
      <div className="aspect-[4/5] relative flex items-center justify-center">
        {hasImage ? (
          <>
            <img src={estampa?.image} alt={estampa?.name} className="w-full h-full object-cover grayscale opacity-50 group-hover:opacity-80 group-hover:grayscale-0 transition-all duration-700" />
            <div className="absolute inset-0 bg-gradient-to-t from-black via-transparent to-transparent opacity-60"></div>
          </>
        ) : (
          <div className="flex flex-col items-center gap-4">
            <span className="text-4xl font-black text-white/5 uppercase tracking-tighter leading-none select-none">F PAC</span>
            <span className="text-3xl font-black text-[#eab308] uppercase tracking-tighter animate-pulse text-center px-4 leading-tight">ESGOTADO</span>
            <span className="text-[8px] font-bold text-white/20 uppercase tracking-[0.3em]">Cód: {item.id}</span>
          </div>
        )}

        {/* Quick Info Overlay */}
        {hasImage && !isEditing && (
          <div className="absolute bottom-4 left-4 right-4 z-10 text-left">
             <h3 className="text-white font-black text-[10px] uppercase tracking-widest truncate mb-0.5">{estampa?.name}</h3>
             <p className="text-[#eab308] text-[8px] font-bold uppercase tracking-widest">Ativo</p>
          </div>
        )}

        {/* Actions Overlay */}
        {!isEditing && (
          <div className="absolute inset-0 bg-black/80 flex flex-col items-center justify-center gap-3 opacity-0 group-hover:opacity-100 transition-opacity z-20">
            <button 
              onClick={() => {
                setEditingSlot(slotIndex);
                setEditFormData({ 
                  name: estampa?.name || `Estampa #${slotIndex}`, 
                  description: estampa?.description || '', 
                  image: estampa?.image || '' 
                });
              }}
              className="w-32 bg-[#eab308] text-black py-2.5 text-[10px] font-black uppercase tracking-widest hover:bg-white transition-all flex items-center justify-center gap-2"
            >
              <Edit3 size={14} /> Editar
            </button>
            {hasImage && (
              <button 
                onClick={() => clearSlot(slotIndex)}
                className="w-32 bg-red-600 text-white py-2.5 text-[10px] font-black uppercase tracking-widest hover:bg-red-500 transition-all flex items-center justify-center gap-2"
              >
                <Trash2 size={14} /> Limpar
              </button>
            )}
          </div>
        )}

        {/* Editing UI */}
        {isEditing && (
          <div className="absolute inset-0 bg-black p-4 z-50 flex flex-col gap-4 overflow-y-auto">
            <div className="flex items-center justify-between border-b border-white/10 pb-2">
               <span className="text-[10px] font-black text-white uppercase tracking-widest">Editando Slot {itemIndex}</span>
               <button onClick={() => setEditingSlot(null)} className="text-white hover:text-red-500 transition-colors">
                  <X size={16} />
               </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-[8px] font-bold text-gray-500 uppercase tracking-widest mb-1">Nome</label>
                <input 
                  type="text" 
                  value={editFormData.name} 
                  onChange={e => setEditFormData({...editFormData, name: e.target.value})}
                  className="w-full bg-white/5 border border-white/10 p-2 text-xs text-white focus:border-[#eab308] outline-none"
                />
              </div>
              
              <div>
                <label className="block text-[8px] font-bold text-gray-500 uppercase tracking-widest mb-1">Imagem (Upload ou Link)</label>
                <div className="space-y-2">
                  <input 
                    type="text" 
                    value={editFormData.image} 
                    onChange={e => setEditFormData({...editFormData, image: e.target.value})}
                    className="w-full bg-white/5 border border-white/10 p-2 text-[10px] text-white focus:border-[#eab308] outline-none"
                    placeholder="URL da imagem..."
                  />
                  <label className="w-full bg-[#eab308] text-black py-2.5 text-[10px] font-black uppercase tracking-widest hover:bg-white transition-all flex items-center justify-center gap-2 cursor-pointer">
                    <Upload size={14} /> {isUploading === slotIndex ? 'Subindo...' : 'Subir do PC'}
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
              </div>

              <button 
                onClick={() => handleSave(slotIndex)}
                className="w-full bg-white text-black py-3 text-[10px] font-black uppercase tracking-widest hover:bg-[#eab308] transition-all flex items-center justify-center gap-2"
              >
                <Save size={14} /> Salvar Slot
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
