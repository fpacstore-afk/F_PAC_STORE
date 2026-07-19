import React, { useState, useEffect } from 'react';
import { db, storage } from '../lib/firebase';
import { collection, doc, onSnapshot, query, orderBy, serverTimestamp, setDoc, writeBatch } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { useAuth } from '../context/AuthContext';
import { Trash2, Image as ImageIcon, Loader2, ArrowLeft, Upload, Edit3, Save, X, GripVertical, ArrowUp, ArrowDown, RefreshCw, Film } from 'lucide-react';
import { Link } from 'react-router-dom';
import { cn, resizeImage, convertDriveUrlToDirect } from '../lib/utils';
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

const PRIME_LOCATIONS = ["Peito Central", "Costas", "Manga", "Peito Lateral"];

interface Estampa {
  id: string;
  name: string;
  description: string;
  image: string;
  video?: any;
  videos?: any[];
  cloudinaryPublicId?: string;
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

  const [hasBypass, setHasBypass] = useState(() => localStorage.getItem('admin_bypass') === 'true');
  const isAdmin = user?.email === 'fpacstore@gmail.com' || user?.email === 'atendimento@fpacstore.com.br' || hasBypass;

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
      
      // --- AUDIT LOGS FOR INVESTIGATION ---
      console.log("=== AUDIT GESTÃO DE ESTAMPAS ===");
      console.log(`Quantidade total de documentos existentes no banco: ${snapshot.size}`);
      console.log(`Quantidade retornada pela consulta: ${data.length}`);

      // Identify maximum slotIndex in the actual data
      let maxIdx = 15;
      data.forEach(e => {
        if (e.slotIndex && e.slotIndex > maxIdx) {
          maxIdx = e.slotIndex;
        }
      });

      // Map slot index to estampas to check for duplicates and unassigned
      const slotMap: Record<number, Estampa[]> = {};
      const unassigned: Estampa[] = [];

      data.forEach(e => {
        const idx = e.slotIndex;
        if (idx === undefined || idx === null || isNaN(idx) || idx <= 0) {
          unassigned.push(e);
        } else {
          if (!slotMap[idx]) slotMap[idx] = [];
          slotMap[idx].push(e);
        }
      });

      // Construct slots list.
      const initialSlots: SlotItem[] = [];
      const duplicateEstampasToReassign: Estampa[] = [];

      for (let slotIdx = 1; slotIdx <= maxIdx; slotIdx++) {
        const estampasInSlot = slotMap[slotIdx] || [];
        if (estampasInSlot.length === 0) {
          initialSlots.push({
            id: `empty-${slotIdx}`,
            slotIndex: slotIdx,
            estampa: null
          });
        } else {
          // The first one goes into this slot
          initialSlots.push({
            id: estampasInSlot[0].id,
            slotIndex: slotIdx,
            estampa: estampasInSlot[0]
          });
          // Any other duplicates will be treated as unassigned and moved to the next available slots
          if (estampasInSlot.length > 1) {
            duplicateEstampasToReassign.push(...estampasInSlot.slice(1));
          }
        }
      }

      // Place unassigned and duplicates into empty slots or append them
      const allToAssign = [...unassigned, ...duplicateEstampasToReassign];
      
      console.log(`Estampas renderizadas nos slots principais: ${initialSlots.filter(s => s.estampa !== null).length}`);
      console.log(`Documentos duplicados ou sem slotIndex que serão reatribuídos: ${allToAssign.length}`);
      if (allToAssign.length > 0) {
        allToAssign.forEach(e => {
          console.log(`- Estampa [id: ${e.id}, nome: ${e.name}] ignorada dos slots normais. Motivo: slotIndex inválido ou duplicado (${e.slotIndex})`);
        });
      }
      console.log("=================================");

      if (allToAssign.length > 0) {
        let currentSlotIdx = 1;
        const batchUpdates: { id: string; newSlotIdx: number }[] = [];
        
        allToAssign.forEach(e => {
          // Find the first empty slot or append a new slot at the end
          while (currentSlotIdx <= maxIdx && (initialSlots[currentSlotIdx - 1] && initialSlots[currentSlotIdx - 1].estampa !== null)) {
            currentSlotIdx++;
          }
          
          if (currentSlotIdx <= maxIdx) {
            // Assign to existing empty slot
            initialSlots[currentSlotIdx - 1] = {
              id: e.id,
              slotIndex: currentSlotIdx,
              estampa: { ...e, slotIndex: currentSlotIdx }
            };
            batchUpdates.push({ id: e.id, newSlotIdx: currentSlotIdx });
            currentSlotIdx++;
          } else {
            // Append a new slot
            maxIdx++;
            initialSlots.push({
              id: e.id,
              slotIndex: maxIdx,
              estampa: { ...e, slotIndex: maxIdx }
            });
            batchUpdates.push({ id: e.id, newSlotIdx: maxIdx });
          }
        });

        // Write fixed indexes back to Firebase asynchronously to maintain consistent order
        if (batchUpdates.length > 0) {
          const batch = writeBatch(db);
          batchUpdates.forEach(upd => {
            batch.update(doc(db, 'estampas', upd.id), { slotIndex: upd.newSlotIdx });
          });
          batch.commit().catch(err => console.error("Error auto-fixing slot indexes:", err));
        }
      }

      setOrderedSlots(initialSlots);
      setLoading(false);
    }, (error) => {
      console.error("Erro ao carregar estampas do Firestore:", error);
      setLoading(false);
    });
    return () => unsubscribe();
  }, [isAdmin]);

  const handleFileUpload = async (file: File, slotIndex: number): Promise<string> => {
    setIsUploading(slotIndex);
    try {
      const resizedBlob = await resizeImage(file, 800, 800);
      try {
        const storageRef = ref(storage, `estampas/slot_${slotIndex}_${Date.now()}_${file.name}`);
        const snapshot = await uploadBytes(storageRef, resizedBlob);
        const url = await getDownloadURL(snapshot.ref);
        return url;
      } catch (storageError) {
        console.warn("Storage upload failed in AdminEstampas, falling back to Base64:", storageError);
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
          video: item.estampa?.video || '',
          videos: (() => {
            const est = item.estampa;
            if (!est) return [];
            if (est.videos && est.videos.length > 0) {
              return est.videos;
            }
            if (est.video) {
              const vid = est.video;
              return [{
                id: 'legacy-video',
                url: typeof vid === 'string' ? vid : (vid as any).url || '',
                publicId: est.cloudinaryPublicId || (typeof vid === 'object' ? (vid as any).publicId : ''),
                duration: typeof vid === 'object' ? (vid as any).duration : 0,
                format: typeof vid === 'object' ? (vid as any).format : 'mp4',
                width: typeof vid === 'object' ? (vid as any).width : 0,
                height: typeof vid === 'object' ? (vid as any).height : 0,
                order: 1,
                createdAt: new Date().toISOString()
              }];
            }
            return [];
          })(),
          cloudinaryPublicId: item.estampa?.cloudinaryPublicId || '',
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
      <div className="min-h-screen flex flex-col items-center justify-center p-6 bg-white text-center max-w-lg mx-auto">
        <h1 className="text-3xl font-black uppercase mb-2 tracking-tighter text-black">Acesso Restrito</h1>
        <p className="text-xs text-gray-500 uppercase tracking-widest font-bold mb-8">
          Este painel é exclusivo para administradores da loja.
        </p>
        
        <div className="w-full space-y-4 bg-black/5 p-6 border border-black/10 rounded-lg mb-6">
          <p className="text-xs text-gray-600 font-semibold uppercase tracking-wider leading-relaxed">
            Seja bem-vindo ao ambiente de testes e desenvolvimento! Como você está testando a aplicação, clique no botão abaixo para ativar o modo de testes e pular o login obrigatório do Firebase.
          </p>
          <button 
            onClick={() => {
              localStorage.setItem('admin_bypass', 'true');
              setHasBypass(true);
              toast.success('Modo de testes ativado com sucesso! Carregando painel...');
            }}
            className="w-full bg-[#eab308] text-black hover:bg-black hover:text-[#eab308] px-6 py-4 text-[10px] font-black uppercase tracking-widest transition-all"
          >
            Ativar Acesso de Teste (Preview)
          </button>
        </div>

        <Link to="/" className="bg-black text-white px-8 py-4 text-[10px] font-black uppercase tracking-widest hover:bg-[#eab308] hover:text-black transition-all w-full block">
          Voltar para a Loja
        </Link>
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

          <DragOverlay>
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

  const [confirmingClear, setConfirmingClear] = useState(false);

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 50 : undefined,
  };

  const estampa = item.estampa;
  const slotIndex = item.slotIndex;
  const hasImage = !!estampa?.image;

  // Multi-Video Management States and Individual Upload Progress Tracking
  const [uploadProgressMap, setUploadProgressMap] = useState<Record<string, number>>({});

  const getVidUrl = (val: any) => {
    if (!val) return '';
    if (typeof val === 'string') return val.trim();
    return (val?.url || '').trim();
  };

  const handleVideoUpload = async (file: File, replaceVideoId?: string) => {
    const allowedExtensions = ['mp4', 'webm'];
    const extension = file.name.split('.').pop()?.toLowerCase();
    if (!extension || !allowedExtensions.includes(extension)) {
      toast.error('Formato inválido. Apenas MP4 e WebM são permitidos.');
      return;
    }

    const MAX_SIZE_MB = 20;
    if (file.size > MAX_SIZE_MB * 1024 * 1024) {
      toast.error(`Arquivo muito grande. Limite de ${MAX_SIZE_MB}MB.`);
      return;
    }

    let durationSec = 0;
    try {
      const videoElement = document.createElement('video');
      videoElement.preload = 'metadata';
      videoElement.src = URL.createObjectURL(file);
      await new Promise<void>((resolve) => {
        videoElement.onloadedmetadata = () => {
          durationSec = Math.round(videoElement.duration);
          resolve();
        };
        videoElement.onerror = () => resolve();
      });
    } catch (e) {
      console.warn('Could not read video duration', e);
    }

    const tempId = replaceVideoId || `upload-${Date.now()}`;
    setUploadProgressMap(prev => ({ ...prev, [tempId]: 0 }));

    try {
      const { uploadVideoToCloudinary } = await import('../services/cloudinary');
      
      const response = await uploadVideoToCloudinary(file, (progress) => {
        setUploadProgressMap(prev => ({ ...prev, [tempId]: progress }));
      });

      const newVideoObj = {
        id: replaceVideoId || `vid-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        url: response.secure_url,
        publicId: response.public_id,
        duration: response.duration || durationSec || 0,
        format: response.format || file.name.split('.').pop() || 'mp4',
        width: response.width || 0,
        height: response.height || 0,
        bytes: response.bytes || file.size,
        order: replaceVideoId 
          ? (editFormData.videos?.find((v: any) => v.id === replaceVideoId)?.order || 1)
          : ((editFormData.videos || []).length + 1),
        createdAt: new Date().toISOString()
      };

      let updatedVideos = [...(editFormData.videos || [])];
      if (replaceVideoId) {
        updatedVideos = updatedVideos.map((v: any) => v.id === replaceVideoId ? newVideoObj : v);
      } else {
        updatedVideos.push(newVideoObj);
      }

      // Re-sort to maintain clean array and order fields
      const sorted = [...updatedVideos].sort((a: any, b: any) => a.order - b.order)
        .map((v: any, idx: number) => ({ ...v, order: idx + 1 }));

      const primaryVidObj = sorted[0] || null;

      setEditFormData({
        ...editFormData,
        videos: sorted,
        video: primaryVidObj ? {
          url: primaryVidObj.url,
          publicId: primaryVidObj.publicId,
          duration: primaryVidObj.duration,
          format: primaryVidObj.format,
          width: primaryVidObj.width,
          height: primaryVidObj.height,
          uploadedAt: primaryVidObj.createdAt
        } : null,
        cloudinaryPublicId: primaryVidObj ? primaryVidObj.publicId : ''
      });

      toast.success(replaceVideoId ? 'Vídeo substituído com sucesso!' : 'Vídeo adicionado com sucesso!');
    } catch (error: any) {
      console.error('Error uploading video:', error);
      toast.error(error.message || 'Erro ao enviar vídeo.');
    } finally {
      setUploadProgressMap(prev => {
        const copy = { ...prev };
        delete copy[tempId];
        return copy;
      });
    }
  };

  const handleRemoveVideo = (id: string) => {
    const updatedVideos = (editFormData.videos || []).filter((v: any) => v.id !== id);
    const sorted = [...updatedVideos].sort((a: any, b: any) => a.order - b.order)
      .map((v: any, idx: number) => ({ ...v, order: idx + 1 }));

    const primaryVidObj = sorted[0] || null;

    setEditFormData({
      ...editFormData,
      videos: sorted,
      video: primaryVidObj ? {
        url: primaryVidObj.url,
        publicId: primaryVidObj.publicId,
        duration: primaryVidObj.duration,
        format: primaryVidObj.format,
        width: primaryVidObj.width,
        height: primaryVidObj.height,
        uploadedAt: primaryVidObj.createdAt
      } : null,
      cloudinaryPublicId: primaryVidObj ? primaryVidObj.publicId : ''
    });
    toast.success('Vídeo removido da estampa. Salve para persistir.');
  };

  const handleMoveVideo = (id: string, direction: 'up' | 'down') => {
    const videosList = [...(editFormData.videos || [])].sort((a: any, b: any) => a.order - b.order);
    const index = videosList.findIndex((v: any) => v.id === id);
    if (index === -1) return;

    if (direction === 'up' && index > 0) {
      const temp = videosList[index - 1].order;
      videosList[index - 1].order = videosList[index].order;
      videosList[index].order = temp;
    } else if (direction === 'down' && index < videosList.length - 1) {
      const temp = videosList[index + 1].order;
      videosList[index + 1].order = videosList[index].order;
      videosList[index].order = temp;
    }

    const sorted = [...videosList].sort((a: any, b: any) => a.order - b.order)
      .map((v: any, idx: number) => ({ ...v, order: idx + 1 }));

    const primaryVidObj = sorted[0] || null;

    setEditFormData({
      ...editFormData,
      videos: sorted,
      video: primaryVidObj ? {
        url: primaryVidObj.url,
        publicId: primaryVidObj.publicId,
        duration: primaryVidObj.duration,
        format: primaryVidObj.format,
        width: primaryVidObj.width,
        height: primaryVidObj.height,
        uploadedAt: primaryVidObj.createdAt
      } : null,
      cloudinaryPublicId: primaryVidObj ? primaryVidObj.publicId : ''
    });
  };

  return (
    <>
      <div 
        ref={setNodeRef} 
        style={style}
        className={cn(
          "relative group bg-[#f5f5f5] border border-black/5 overflow-hidden transition-all duration-300 rounded-2xl md:rounded-3xl",
          "hover:border-black/20 hover:shadow-lg",
          isDragging ? "opacity-0" : "opacity-100",
          "aspect-[4/5]",
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
        <div className="w-full h-full overflow-hidden">
          {hasImage ? (
            <img 
               src={estampa?.image} 
               alt={estampa?.name} 
               className={cn(
                 "w-full h-full object-cover object-center block transition-transform duration-500",
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
                        const locConfig = estampa.locationConfigs?.[loc] as any;
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
                    if (!confirmingClear) {
                      setConfirmingClear(true);
                      toast.error("Clique novamente no botão para limpar o slot!", { id: `clear-slot-${slotIndex}` });
                      setTimeout(() => setConfirmingClear(false), 3000);
                      return;
                    }
                    toast.dismiss(`clear-slot-${slotIndex}`);
                    setConfirmingClear(false);
                    clearSlot(slotIndex);
                  }}
                  className={cn(
                    "text-white py-2 px-4 transition-all shadow-xl flex justify-center items-center gap-1 text-[8px] font-black uppercase tracking-widest min-w-[70px]",
                    confirmingClear ? "bg-amber-600 hover:bg-amber-700 animate-pulse" : "bg-red-600 hover:bg-black"
                  )}
                >
                  {confirmingClear ? "LIMPAR?" : <Trash2 size={12} />}
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
                  <div className="aspect-[4/5] bg-[#f5f5f5] relative overflow-hidden rounded-2xl border border-black/5 flex items-center justify-center">
                    {editFormData.image ? (
                       <img src={editFormData.image} alt="Preview" className="w-full h-full object-cover object-center block" />
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
                       <label className="text-[10px] font-black uppercase tracking-widest text-gray-400">Descrição / Categoria</label>
                       <textarea 
                          placeholder="EX: Estampa autoral inspirada na cultura streetwear paulista."
                          value={editFormData.description || ''}
                          onChange={e => setEditFormData({ ...editFormData, description: e.target.value })}
                          rows={3}
                          className="w-full bg-[#f9f9f9] border-none p-4 text-xs font-bold uppercase focus:ring-1 focus:ring-[#eab308] outline-none resize-none"
                       />
                    </div>

                    {/* Seção Vídeo do Mockup */}
                    <div className="space-y-4 pt-6 border-t border-black/5">
                      <div className="flex items-center justify-between">
                        <label className="text-[10px] font-black uppercase tracking-widest text-gray-400">Vídeos do Mockup (Multi-Vídeos)</label>
                        <span className="bg-amber-100 text-amber-800 text-[8px] font-black px-2 py-0.5 rounded uppercase tracking-wider">
                          {(editFormData.videos || []).length} ATIVOS
                        </span>
                      </div>

                      {/* Lista de Vídeos */}
                      {((editFormData.videos || []) as any[]).length > 0 && (
                        <div className="space-y-3">
                          {([...(editFormData.videos || [])].sort((a: any, b: any) => a.order - b.order) as any[]).map((v, idx) => {
                            const isReplacing = uploadProgressMap[v.id] !== undefined;
                            const replacementProgress = uploadProgressMap[v.id];

                            return (
                              <div key={v.id} className="border border-black/5 bg-white rounded-xl p-3 space-y-3 relative overflow-hidden">
                                <div className="flex gap-4">
                                  {/* Left side preview */}
                                  <div className="w-20 h-20 bg-black rounded-lg overflow-hidden flex items-center justify-center shrink-0 relative">
                                    <video 
                                      src={v.url}
                                      muted
                                      playsInline
                                      loop
                                      autoPlay
                                      className="w-full h-full object-contain"
                                    />
                                    <div className="absolute top-1 left-1 bg-black/75 text-white text-[8px] font-black w-4 h-4 rounded-full flex items-center justify-center">
                                      {v.order}
                                    </div>
                                  </div>

                                  {/* Middle stats & details */}
                                  <div className="flex-1 min-w-0 space-y-1 text-[9px] uppercase font-bold text-gray-500">
                                    <div className="text-black font-black truncate text-[10px] normal-case">{v.publicId}</div>
                                    <div className="flex justify-between">
                                      <span>Duração:</span>
                                      <span className="text-black font-black">{v.duration || 0}s</span>
                                    </div>
                                    <div className="flex justify-between">
                                      <span>Formato:</span>
                                      <span className="text-black font-black">{v.format || 'mp4'}</span>
                                    </div>
                                    {v.width && v.height && (
                                      <div className="flex justify-between">
                                        <span>Resolução:</span>
                                        <span className="text-black font-black">{v.width}x{v.height}</span>
                                      </div>
                                    )}
                                    {v.bytes && (
                                      <div className="flex justify-between">
                                        <span>Tamanho:</span>
                                        <span className="text-black font-black">{(v.bytes / (1024 * 1024)).toFixed(2)} MB</span>
                                      </div>
                                    )}
                                  </div>
                                </div>

                                {/* Upload progress bar for replace */}
                                {isReplacing && (
                                  <div className="bg-gray-50 p-2 rounded border border-black/5 flex flex-col space-y-1">
                                    <div className="flex justify-between text-[8px] font-black uppercase text-gray-400">
                                      <span>Substituindo arquivo...</span>
                                      <span>{replacementProgress}%</span>
                                    </div>
                                    <div className="w-full bg-gray-200 h-1 rounded-full overflow-hidden">
                                      <div className="bg-[#eab308] h-full" style={{ width: `${replacementProgress}%` }} />
                                    </div>
                                  </div>
                                )}

                                {/* Card Actions */}
                                <div className="flex gap-1.5 pt-2 border-t border-black/5 justify-end">
                                  {/* Mover Ordem */}
                                  <button
                                    type="button"
                                    onClick={() => handleMoveVideo(v.id, 'up')}
                                    disabled={idx === 0}
                                    className="p-1.5 border border-black/10 hover:border-black rounded bg-white text-gray-600 disabled:opacity-20 disabled:pointer-events-none transition-all"
                                    title="Mover para Cima"
                                  >
                                    <ArrowUp size={12} />
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => handleMoveVideo(v.id, 'down')}
                                    disabled={idx === (editFormData.videos || []).length - 1}
                                    className="p-1.5 border border-black/10 hover:border-black rounded bg-white text-gray-600 disabled:opacity-20 disabled:pointer-events-none transition-all"
                                    title="Mover para Baixo"
                                  >
                                    <ArrowDown size={12} />
                                  </button>

                                  <div className="flex-1" />

                                  {/* Substituir */}
                                  <label className="bg-white border border-black/15 hover:border-black px-2.5 py-1 text-[8px] font-black uppercase tracking-wider rounded cursor-pointer transition-all flex items-center gap-1">
                                    <RefreshCw size={10} />
                                    SUBSTITUIR
                                    <input 
                                      type="file" 
                                      className="hidden" 
                                      accept="video/mp4,video/webm"
                                      disabled={isReplacing}
                                      onChange={(e) => {
                                        const file = e.target.files?.[0];
                                        if (file) handleVideoUpload(file, v.id);
                                      }}
                                    />
                                  </label>

                                  {/* Remover */}
                                  <button 
                                    onClick={() => handleRemoveVideo(v.id)}
                                    type="button"
                                    className="bg-red-50 hover:bg-red-100 border border-red-200 text-red-700 px-2.5 py-1 text-[8px] font-black uppercase tracking-wider rounded transition-all flex items-center gap-1"
                                  >
                                    <Trash2 size={10} />
                                    REMOVER
                                  </button>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}

                      {/* Active Uploading States for new files */}
                      {Object.keys(uploadProgressMap).filter(k => k.startsWith('upload-')).map(tempId => {
                        const progress = uploadProgressMap[tempId];
                        return (
                          <div key={tempId} className="border border-black/5 bg-gray-50/50 rounded-xl p-4 flex flex-col items-center justify-center space-y-3">
                            <div className="flex items-center gap-2">
                              <Loader2 className="animate-spin text-black" size={14} />
                              <span className="text-[9px] font-black uppercase tracking-wider text-gray-600">Enviando novo vídeo...</span>
                            </div>
                            <div className="w-full bg-gray-200 h-1.5 rounded-full overflow-hidden max-w-xs">
                              <div 
                                className="bg-[#eab308] h-full transition-all duration-300 rounded-full"
                                style={{ width: `${progress}%` }}
                              />
                            </div>
                            <span className="text-[9px] font-mono text-gray-500">{progress}% completado</span>
                          </div>
                        );
                      })}

                      {/* Upload Zone for NEW video */}
                      <div className="border border-dashed border-gray-300 hover:border-gray-400 bg-gray-50/50 hover:bg-gray-50 rounded-xl p-6 text-center transition-colors relative">
                        <div className="flex flex-col items-center space-y-2">
                          <div className="p-2.5 bg-white rounded-full shadow-sm border border-black/5">
                            <Upload size={16} className="text-gray-400" />
                          </div>
                          <div className="space-y-1">
                            <p className="text-[9px] font-black uppercase tracking-widest text-black">BUSCAR NOVO ARQUIVO</p>
                            <p className="text-[8px] font-bold text-gray-400 uppercase tracking-widest">Apenas MP4, WebM (Máx 20MB)</p>
                          </div>
                          
                          <label className="mt-2 inline-block bg-black text-white px-4 py-2 text-[8px] font-black uppercase tracking-widest hover:bg-[#eab308] hover:text-black transition-all cursor-pointer rounded">
                            ENVIAR NOVO VÍDEO
                            <input 
                              type="file" 
                              className="hidden" 
                              accept="video/mp4,video/webm"
                              onChange={(e) => {
                                const file = e.target.files?.[0];
                                        if (file) handleVideoUpload(file);
                              }}
                            />
                          </label>
                        </div>
                      </div>
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
                                                placeholder="ex: 25x30 cm"
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
                                                value={editFormData.locationConfigs?.[loc]?.quantities?.[idx] === 0 ? '' : (editFormData.locationConfigs?.[loc]?.quantities?.[idx] ?? '')}
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
