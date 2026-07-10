import React, { useState, useEffect, useRef } from 'react';
import { 
  collection, 
  addDoc, 
  setDoc, 
  doc, 
  deleteDoc, 
  query, 
  orderBy, 
  onSnapshot, 
  updateDoc 
} from 'firebase/firestore';
import { 
  ref, 
  uploadBytesResumable, 
  getDownloadURL, 
  deleteObject, 
  UploadTask 
} from 'firebase/storage';
import { db, storage } from '../../lib/firebase';
import { Track } from '../../types/music';
import { useAuth } from '../../context/AuthContext';
import { 
  Radio, 
  Plus, 
  Trash2, 
  Edit2, 
  ArrowUp, 
  ArrowDown, 
  Check, 
  X, 
  Loader2, 
  Upload, 
  RefreshCw, 
  Image as ImageIcon,
  PlayCircle,
  AlertTriangle,
  Music,
  FolderPlus,
  ListPlus
} from 'lucide-react';
import { toast } from 'react-hot-toast';

export interface BatchUploadFile {
  id: string;
  file: File;
  title: string;
  artist: string;
  status: 'pending' | 'uploading' | 'success' | 'error' | 'cancelled';
  progress: number;
  errorMsg?: string;
  task?: UploadTask;
  duration: number;
  audioUrl?: string;
  audioStoragePath?: string;
}

export function AdminMusic() {
  const { user } = useAuth();
  const isAdmin = user?.email === 'fpacstore@gmail.com' || user?.email === 'atendimento@fpacstore.com.br';

  const [tracks, setTracks] = useState<Track[]>([]);
  const [loading, setLoading] = useState(true);
  const [isEditing, setIsEditing] = useState<string | null>(null); // trackId or 'new'
  
  // Audio upload states
  const [audioUploadProgress, setAudioUploadProgress] = useState<number | null>(null);
  const [audioUploadTask, setAudioUploadTask] = useState<UploadTask | null>(null);
  const [audioFileForRetry, setAudioFileForRetry] = useState<File | null>(null);

  // Cover upload states
  const [coverUploadProgress, setCoverUploadProgress] = useState<number | null>(null);
  const [coverUploadTask, setCoverUploadTask] = useState<UploadTask | null>(null);
  const [coverFileForRetry, setCoverFileForRetry] = useState<File | null>(null);

  // Form State
  const [title, setTitle] = useState('');
  const [artist, setArtist] = useState('');
  const [album, setAlbum] = useState('');
  const [playlist, setPlaylist] = useState('F PAC Anthem');
  const [category, setCategory] = useState('Street Beats');
  const [description, setDescription] = useState('');
  const [audio, setAudio] = useState('');
  const [cover, setCover] = useState('');
  const [duration, setDuration] = useState(120);
  const [active, setActive] = useState(true);
  const [loop, setLoop] = useState(false);
  const [shufflePermitted, setShufflePermitted] = useState(true);
  const [playlistOrder, setPlaylistOrder] = useState<number>(1);
  
  // Upload metadata
  const [audioStoragePath, setAudioStoragePath] = useState('');
  const [coverStoragePath, setCoverStoragePath] = useState('');

  // Batch Upload States
  const [modalTab, setModalTab] = useState<'individual' | 'batch'>('individual');
  const [isBatchMode, setIsBatchMode] = useState(false);
  const [batchFiles, setBatchFiles] = useState<BatchUploadFile[]>([]);
  const [batchPlaylist, setBatchPlaylist] = useState('F PAC Anthem');
  const [batchCategory, setBatchCategory] = useState('Street Beats');
  const [batchCover, setBatchCover] = useState('');
  const [batchCoverStoragePath, setBatchCoverStoragePath] = useState('');
  const [batchCoverProgress, setBatchCoverProgress] = useState<number | null>(null);
  const [batchCoverTask, setBatchCoverTask] = useState<UploadTask | null>(null);
  const [isUploadingBatch, setIsUploadingBatch] = useState(false);
  const [batchDragActive, setBatchDragActive] = useState(false);

  // Simplified flow states
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  const [trackToDelete, setTrackToDelete] = useState<Track | null>(null);
  const [showClearConfirm, setShowClearConfirm] = useState(false);

  // Input references
  const audioInputRef = useRef<HTMLInputElement>(null);
  const coverInputRef = useRef<HTMLInputElement>(null);
  const batchAudioInputRef = useRef<HTMLInputElement>(null);
  const batchCoverInputRef = useRef<HTMLInputElement>(null);

  // Allowed file validation
  const allowedAudioTypes = ['audio/mp3', 'audio/mpeg', 'audio/wav', 'audio/x-wav', 'audio/ogg', 'audio/m4a', 'audio/x-m4a', 'audio/mp4'];
  const allowedAudioExtensions = ['.mp3', '.wav', '.ogg', '.m4a'];

  const validateAudioFile = (file: File): boolean => {
    const nameLower = file.name.toLowerCase();
    const hasValidExt = allowedAudioExtensions.some(ext => nameLower.endsWith(ext));
    const hasValidMime = allowedAudioTypes.includes(file.type);
    return hasValidExt || hasValidMime;
  };

  // Fetch tracks in real-time
  useEffect(() => {
    const q = query(collection(db, 'music'), orderBy('order', 'asc'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const fetched: Track[] = [];
      snapshot.forEach((doc) => {
        fetched.push({ id: doc.id, ...doc.data() } as Track);
      });
      setTracks(fetched);
      setLoading(false);
    }, (error) => {
      console.error("Error reading music collection:", error);
      toast.error("Erro ao carregar catálogo do Firebase.");
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  // Helper to read audio file metadata and extract duration from local File object
  const getAudioDurationLocal = (file: File): Promise<number> => {
    return new Promise((resolve) => {
      try {
        const url = URL.createObjectURL(file);
        const tempAudio = new Audio();
        tempAudio.src = url;
        const timeout = setTimeout(() => {
          URL.revokeObjectURL(url);
          resolve(120); // Fallback
        }, 2000);

        tempAudio.addEventListener('loadedmetadata', () => {
          clearTimeout(timeout);
          const dur = Math.round(tempAudio.duration);
          URL.revokeObjectURL(url);
          resolve(dur || 120);
        });

        tempAudio.addEventListener('error', () => {
          clearTimeout(timeout);
          URL.revokeObjectURL(url);
          resolve(120);
        });
      } catch (err) {
        console.error("Error in getAudioDurationLocal:", err);
        resolve(120);
      }
    });
  };

  // Helper to parse Firebase Storage path from a download URL as a safety fallback
  const getStoragePathFromUrl = (url: string): string | null => {
    if (!url || !url.includes('firebasestorage.googleapis.com')) return null;
    try {
      const parts = url.split('/o/');
      if (parts.length < 2) return null;
      const pathAndToken = parts[1];
      const encodedPath = pathAndToken.split('?')[0];
      return decodeURIComponent(encodedPath);
    } catch (err) {
      console.error("Error parsing storage URL:", err);
      return null;
    }
  };

  // Cancellable & Retryable Upload function for audio
  const handleUploadAudioWithProgress = async (file: File) => {
    if (!isAdmin) {
      toast.error("Ação restrita a administradores.");
      return;
    }

    if (!validateAudioFile(file)) {
      toast.error("Formato inválido. Aceitamos apenas MP3, WAV, OGG ou M4A.");
      return;
    }

    setAudioFileForRetry(file);
    setAudioUploadProgress(0);

    // Auto-extract artist and title from file name
    const cleanName = file.name.replace(/\.[^/.]+$/, ""); // strip extension
    let parsedArtist = "F PAC RECORDS";
    let parsedTitle = cleanName;

    const separators = [" - ", " -", "- ", "-", "_"];
    for (const sep of separators) {
      if (cleanName.includes(sep)) {
        const parts = cleanName.split(sep);
        parsedArtist = parts[0].trim();
        parsedTitle = parts.slice(1).join(sep).trim();
        break;
      }
    }

    setTitle(parsedTitle.toUpperCase());
    setArtist(parsedArtist.toUpperCase());

    try {
      const path = `music/audio/${Date.now()}_${file.name.replace(/\s+/g, '_')}`;
      setAudioStoragePath(path);
      const fileRef = ref(storage, path);
      
      const task = uploadBytesResumable(fileRef, file);
      setAudioUploadTask(task);

      task.on('state_changed', 
        (snapshot) => {
          const progress = Math.round((snapshot.bytesTransferred / snapshot.totalBytes) * 100);
          setAudioUploadProgress(progress);
        }, 
        (error) => {
          console.error("Audio upload error:", error);
          if (error.code === 'storage/canceled') {
            toast.error("Upload do áudio cancelado.");
          } else {
            toast.error("Erro no upload do áudio. Clique em Repetir.");
          }
          setAudioUploadProgress(null);
          setAudioUploadTask(null);
        }, 
        async () => {
          const downloadUrl = await getDownloadURL(task.snapshot.ref);
          setAudio(downloadUrl);
          setAudioUploadProgress(null);
          setAudioUploadTask(null);
          setAudioFileForRetry(null);
          
          // Detect audio duration
          const calculatedDuration = await getAudioDurationLocal(file);
          setDuration(calculatedDuration);
          toast.success("Áudio enviado e metadados extraídos!");
        }
      );
    } catch (err) {
      console.error(err);
      toast.error("Falha ao iniciar upload.");
      setAudioUploadProgress(null);
      setAudioUploadTask(null);
    }
  };

  // Cancellable & Retryable Upload function for cover art image
  const handleUploadCoverWithProgress = async (file: File) => {
    if (!isAdmin) {
      toast.error("Ação restrita a administradores.");
      return;
    }

    if (!file.type.startsWith('image/')) {
      toast.error("Selecione um arquivo de imagem válido.");
      return;
    }

    setCoverFileForRetry(file);
    setCoverUploadProgress(0);

    try {
      const path = `music/covers/${Date.now()}_${file.name.replace(/\s+/g, '_')}`;
      setCoverStoragePath(path);
      const fileRef = ref(storage, path);

      const task = uploadBytesResumable(fileRef, file);
      setCoverUploadTask(task);

      task.on('state_changed', 
        (snapshot) => {
          const progress = Math.round((snapshot.bytesTransferred / snapshot.totalBytes) * 100);
          setCoverUploadProgress(progress);
        }, 
        (error) => {
          console.error("Cover upload error:", error);
          if (error.code === 'storage/canceled') {
            toast.error("Upload da capa cancelado.");
          } else {
            toast.error("Erro no upload da capa. Clique em Repetir.");
          }
          setCoverUploadProgress(null);
          setCoverUploadTask(null);
        }, 
        async () => {
          const downloadUrl = await getDownloadURL(task.snapshot.ref);
          setCover(downloadUrl);
          setCoverUploadProgress(null);
          setCoverUploadTask(null);
          setCoverFileForRetry(null);
          toast.success("Imagem de capa enviada com sucesso!");
        }
      );
    } catch (err) {
      console.error(err);
      toast.error("Falha ao iniciar upload da capa.");
      setCoverUploadProgress(null);
      setCoverUploadTask(null);
    }
  };

  const handleCancelAudioUpload = () => {
    if (audioUploadTask) {
      audioUploadTask.cancel();
    }
  };

  const handleCancelCoverUpload = () => {
    if (coverUploadTask) {
      coverUploadTask.cancel();
    }
  };

  const handleRetryAudioUpload = () => {
    if (audioFileForRetry) {
      handleUploadAudioWithProgress(audioFileForRetry);
    }
  };

  const handleRetryCoverUpload = () => {
    if (coverFileForRetry) {
      handleUploadCoverWithProgress(coverFileForRetry);
    }
  };

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);

    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      if (e.dataTransfer.files.length > 1) {
        setModalTab('batch');
        await addFilesToBatchQueue(Array.from(e.dataTransfer.files));
      } else {
        const file = e.dataTransfer.files[0];
        await handleUploadAudioWithProgress(file);
      }
    }
  };

  const handleAudioFileInput = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      if (e.target.files.length > 1) {
        setModalTab('batch');
        await addFilesToBatchQueue(Array.from(e.target.files));
      } else {
        const file = e.target.files[0];
        await handleUploadAudioWithProgress(file);
      }
    }
  };

  const handleCoverFileInput = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    await handleUploadCoverWithProgress(file);
  };

  // ==========================================
  // BATCH UPLOAD LOGIC
  // ==========================================

  const handleBatchDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setBatchDragActive(true);
    } else if (e.type === "dragleave") {
      setBatchDragActive(false);
    }
  };

  const handleBatchDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setBatchDragActive(false);

    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      await addFilesToBatchQueue(Array.from(e.dataTransfer.files));
    }
  };

  const handleBatchAudioFileInput = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      await addFilesToBatchQueue(Array.from(e.target.files));
    }
  };

  const addFilesToBatchQueue = async (files: File[]) => {
    if (!isAdmin) {
      toast.error("Ação restrita a administradores.");
      return;
    }

    const validFiles = files.filter(file => validateAudioFile(file));
    if (validFiles.length === 0) {
      toast.error("Nenhum arquivo de áudio válido selecionado (MP3, WAV, OGG, M4A).");
      return;
    }

    const pendingAdditions: BatchUploadFile[] = [];
    const loadingToastId = toast.loading(`Analisando ${validFiles.length} arquivos...`);

    try {
      for (const file of validFiles) {
        const cleanName = file.name.replace(/\.[^/.]+$/, ""); // strip extension
        let parsedArtist = "F PAC RECORDS";
        let parsedTitle = cleanName;

        const separators = [" - ", " -", "- ", "-", "_"];
        for (const sep of separators) {
          if (cleanName.includes(sep)) {
            const parts = cleanName.split(sep);
            parsedArtist = parts[0].trim();
            parsedTitle = parts.slice(1).join(sep).trim();
            break;
          }
        }

        const id = Math.random().toString(36).substring(2, 9);
        const dur = await getAudioDurationLocal(file);

        pendingAdditions.push({
          id,
          file,
          title: parsedTitle.toUpperCase(),
          artist: parsedArtist.toUpperCase(),
          status: 'pending',
          progress: 0,
          duration: dur
        });
      }

      setBatchFiles(prev => [...prev, ...pendingAdditions]);
      toast.success(`${pendingAdditions.length} sintonias adicionadas à fila de lote!`, { id: loadingToastId });
    } catch (err) {
      console.error(err);
      toast.error("Erro ao analisar arquivos de lote.", { id: loadingToastId });
    }
  };

  const handleUploadBatchCover = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      toast.error("Selecione um arquivo de imagem válido.");
      return;
    }

    setBatchCoverProgress(0);
    try {
      const path = `music/covers/${Date.now()}_batch_${file.name.replace(/\s+/g, '_')}`;
      setBatchCoverStoragePath(path);
      const fileRef = ref(storage, path);
      const task = uploadBytesResumable(fileRef, file);
      setBatchCoverTask(task);

      task.on('state_changed', 
        (snapshot) => {
          const progress = Math.round((snapshot.bytesTransferred / snapshot.totalBytes) * 100);
          setBatchCoverProgress(progress);
        }, 
        (error) => {
          console.error("Batch Cover upload error:", error);
          if (error.code === 'storage/canceled') {
            toast.error("Upload da capa cancelado.");
          } else {
            toast.error("Erro no upload da capa.");
          }
          setBatchCoverProgress(null);
          setBatchCoverTask(null);
        }, 
        async () => {
          const downloadUrl = await getDownloadURL(task.snapshot.ref);
          setBatchCover(downloadUrl);
          setBatchCoverProgress(null);
          setBatchCoverTask(null);
          toast.success("Imagem de capa do lote enviada!");
        }
      );
    } catch (err) {
      console.error(err);
      setBatchCoverProgress(null);
      setBatchCoverTask(null);
    }
  };

  const handleCancelBatchCoverUpload = () => {
    if (batchCoverTask) {
      batchCoverTask.cancel();
    }
  };

  const handleRemoveBatchFile = (id: string) => {
    setBatchFiles(prev => {
      const item = prev.find(f => f.id === id);
      if (item?.task) {
        try {
          item.task.cancel();
        } catch (e) {}
      }
      return prev.filter(f => f.id !== id);
    });
  };

  const handleUpdateBatchFileFields = (id: string, titleVal: string, artistVal: string) => {
    setBatchFiles(prev => prev.map(f => f.id === id ? { ...f, title: titleVal, artist: artistVal } : f));
  };

  const handleStartBatchUpload = async () => {
    if (!isAdmin) {
      toast.error("Permissão negada.");
      return;
    }

    const pendingFiles = batchFiles.filter(f => f.status === 'pending' || f.status === 'error');
    if (pendingFiles.length === 0) {
      toast.error("Nenhuma música pendente na fila para enviar.");
      return;
    }

    setIsUploadingBatch(true);
    toast.success("Iniciando envios em lote sequenciais...");

    // Get the current highest order to assign subsequent numbers
    let currentMaxOrder = tracks.length > 0 ? Math.max(...tracks.map(t => t.order || 0)) : 0;

    for (let i = 0; i < batchFiles.length; i++) {
      const batchFile = batchFiles[i];
      if (batchFile.status !== 'pending' && batchFile.status !== 'error') continue;

      // Update status to uploading
      setBatchFiles(prev => prev.map(f => f.id === batchFile.id ? { ...f, status: 'uploading', progress: 0 } : f));

      try {
        const path = `music/audio/${Date.now()}_batch_${batchFile.file.name.replace(/\s+/g, '_')}`;
        const fileRef = ref(storage, path);
        const task = uploadBytesResumable(fileRef, batchFile.file);

        // Store task for cancellation
        setBatchFiles(prev => prev.map(f => f.id === batchFile.id ? { ...f, task } : f));

        const downloadUrl = await new Promise<string>((resolve, reject) => {
          task.on('state_changed',
            (snapshot) => {
              const progress = Math.round((snapshot.bytesTransferred / snapshot.totalBytes) * 100);
              setBatchFiles(prev => prev.map(f => f.id === batchFile.id ? { ...f, progress } : f));
            },
            (error) => {
              reject(error);
            },
            async () => {
              try {
                const url = await getDownloadURL(task.snapshot.ref);
                resolve(url);
              } catch (err) {
                reject(err);
              }
            }
          );
        });

        // Add to database
        currentMaxOrder += 1;
        const finalCover = batchCover || 'https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=500&auto=format&fit=crop&q=60';

        const trackData = {
          title: batchFile.title.toUpperCase(),
          artist: batchFile.artist.toUpperCase(),
          album: batchPlaylist.toUpperCase(),
          playlist: batchPlaylist,
          category: batchCategory.toUpperCase(),
          description: `ENVIADA EM LOTE - ${batchPlaylist.toUpperCase()}`,
          audio: downloadUrl,
          audioUrl: downloadUrl,
          cover: finalCover,
          coverUrl: finalCover,
          duration: batchFile.duration,
          active: true,
          loop: false,
          shufflePermitted: true,
          order: currentMaxOrder,
          audioStoragePath: path,
          coverStoragePath: batchCover ? batchCoverStoragePath : '',
          createdAt: new Date(),
          updatedAt: new Date()
        };

        await addDoc(collection(db, 'music'), trackData);

        // Update item to success
        setBatchFiles(prev => prev.map(f => f.id === batchFile.id ? { 
          ...f, 
          status: 'success', 
          progress: 100, 
          audioUrl: downloadUrl, 
          audioStoragePath: path,
          task: undefined 
        } : f));

      } catch (err: any) {
        console.error("Batch item error:", err);
        const isCancelled = err.code === 'storage/canceled';
        setBatchFiles(prev => prev.map(f => f.id === batchFile.id ? { 
          ...f, 
          status: isCancelled ? 'cancelled' : 'error', 
          errorMsg: isCancelled ? "Cancelado" : "Erro",
          task: undefined 
        } : f));
      }
    }

    setIsUploadingBatch(false);
    toast.success("Processamento do lote finalizado!");
  };

  const startBatchMode = () => {
    setBatchFiles([]);
    setBatchPlaylist('F PAC Anthem');
    setBatchCategory('Street Beats');
    setBatchCover('');
    setBatchCoverStoragePath('');
    setBatchCoverProgress(null);
    setBatchCoverTask(null);
    setIsUploadingBatch(false);
    setBatchDragActive(false);
    setModalTab('batch');
    setIsEditing('new');
  };

  const startNew = () => {
    setTitle('');
    setArtist('');
    setAlbum('');
    setPlaylist('F PAC Anthem');
    setCategory('Street Beats');
    setDescription('');
    setAudio('');
    setCover('');
    setDuration(120);
    setActive(true);
    setLoop(false);
    setShufflePermitted(true);
    setAudioStoragePath('');
    setCoverStoragePath('');
    setAudioFileForRetry(null);
    setCoverFileForRetry(null);
    setAudioUploadProgress(null);
    setCoverUploadProgress(null);
    
    // Auto order estimation
    const nextOrder = tracks.length > 0 ? Math.max(...tracks.map(t => t.order || 0)) + 1 : 1;
    setPlaylistOrder(nextOrder);

    setModalTab('individual');
    setIsEditing('new');
    setShowAdvanced(false);
  };

  const startEdit = (track: Track) => {
    setTitle(track.title);
    setArtist(track.artist);
    setAlbum(track.album || '');
    setPlaylist(track.playlist || 'F PAC Anthem');
    setCategory(track.category || 'Street Beats');
    setDescription(track.description || '');
    setAudio(track.audio);
    setCover(track.cover || '');
    setDuration(track.duration);
    setActive(track.active);
    setLoop(track.loop || false);
    setShufflePermitted(track.shufflePermitted !== false);
    setPlaylistOrder(track.order || 1);
    setAudioStoragePath((track as any).audioStoragePath || '');
    setCoverStoragePath((track as any).coverStoragePath || '');
    setAudioFileForRetry(null);
    setCoverFileForRetry(null);
    setAudioUploadProgress(null);
    setCoverUploadProgress(null);

    setIsEditing(track.id);
    setShowAdvanced(false);
  };

  const saveTrack = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isAdmin) {
      toast.error("Permissão negada. Apenas administradores.");
      return;
    }

    if (!title || !artist || !audio) {
      toast.error("Por favor, forneça Título, Artista e faça o upload do Áudio.");
      return;
    }

    try {
      const finalCover = cover || 'https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=500&auto=format&fit=crop&q=60';

      const trackData = {
        title: title.toUpperCase(),
        artist: artist.toUpperCase(),
        album: album.toUpperCase(),
        playlist,
        category: category.toUpperCase(),
        description,
        audio, // backward compatibility
        audioUrl: audio, // Etapa 5 schema compliance
        cover: finalCover, // backward compatibility
        coverUrl: finalCover, // Etapa 5 schema compliance
        duration,
        active,
        loop,
        shufflePermitted,
        order: playlistOrder,
        audioStoragePath,
        coverStoragePath,
        updatedAt: new Date()
      };

      if (isEditing === 'new') {
        const docData = {
          ...trackData,
          createdAt: new Date()
        };
        await addDoc(collection(db, 'music'), docData);
        toast.success("Música adicionada ao catálogo F PAC RADIO!");
      } else if (isEditing) {
        await updateDoc(doc(db, 'music', isEditing), trackData);
        toast.success("Música atualizada com sucesso!");
      }

      setIsEditing(null);
    } catch (err) {
      console.error(err);
      toast.error("Erro ao salvar música.");
    }
  };

  const confirmDeleteTrack = async () => {
    if (!isAdmin) {
      toast.error("Permissão negada.");
      return;
    }

    if (!trackToDelete) return;
    try {
      toast.loading("Excluindo música e mídias...", { id: "delete_track" });

      // 1. Delete Audio file from Storage
      const currentAudioPath = trackToDelete.audioStoragePath || getStoragePathFromUrl(trackToDelete.audio);
      if (currentAudioPath) {
        try {
          const fileRef = ref(storage, currentAudioPath);
          await deleteObject(fileRef);
        } catch (storageErr) {
          console.warn("Could not delete audio file from Storage:", storageErr);
        }
      }

      // 2. Delete Cover Image file from Storage
      const currentCoverPath = (trackToDelete as any).coverStoragePath || getStoragePathFromUrl(trackToDelete.cover);
      // Skip deleting fallback placeholder covers
      if (currentCoverPath && !trackToDelete.cover.includes('images.unsplash.com')) {
        try {
          const fileRef = ref(storage, currentCoverPath);
          await deleteObject(fileRef);
        } catch (storageErr) {
          console.warn("Could not delete cover file from Storage:", storageErr);
        }
      }

      // 3. Delete Document from Firestore
      await deleteDoc(doc(db, 'music', trackToDelete.id));

      // Clean up localStorage if deleted track was selected
      if (localStorage.getItem('f_pac_sound_last_track_id') === trackToDelete.id) {
        localStorage.removeItem('f_pac_sound_last_track_id');
        localStorage.removeItem('f_pac_sound_last_position');
      }

      toast.success("Música e mídias excluídas com sucesso!", { id: "delete_track" });
    } catch (err) {
      console.error(err);
      toast.error("Erro ao remover música do catálogo.", { id: "delete_track" });
    } finally {
      setTrackToDelete(null);
    }
  };

  const clearAllTracks = async () => {
    if (!isAdmin) {
      toast.error("Permissão negada.");
      return;
    }

    setShowClearConfirm(false);
    try {
      toast.loading("Limpando catálogo total...", { id: "clear_catalog" });

      // Delete storage files for each track first
      for (const track of tracks) {
        const currentAudioPath = (track as any).audioStoragePath || getStoragePathFromUrl(track.audio);
        if (currentAudioPath) {
          try {
            await deleteObject(ref(storage, currentAudioPath));
          } catch (e) {}
        }

        const currentCoverPath = (track as any).coverStoragePath || getStoragePathFromUrl(track.cover);
        if (currentCoverPath && !track.cover.includes('images.unsplash.com')) {
          try {
            await deleteObject(ref(storage, currentCoverPath));
          } catch (e) {}
        }

        await deleteDoc(doc(db, 'music', track.id));
      }

      localStorage.removeItem('f_pac_sound_last_track_id');
      localStorage.removeItem('f_pac_sound_last_position');

      toast.success("Todo catálogo de músicas foi excluído com sucesso!", { id: "clear_catalog" });
    } catch (err) {
      console.error(err);
      toast.error("Erro ao limpar catálogo.", { id: "clear_catalog" });
    }
  };

  const toggleStatus = async (track: Track) => {
    if (!isAdmin) {
      toast.error("Ação restrita a administradores.");
      return;
    }

    try {
      await updateDoc(doc(db, 'music', track.id), {
        active: !track.active
      });
      toast.success(track.active ? "Música desativada." : "Música ativada!");
    } catch (err) {
      console.error(err);
      toast.error("Erro ao alterar status.");
    }
  };

  const swapOrder = async (indexA: number, indexB: number) => {
    if (!isAdmin) {
      toast.error("Ação restrita a administradores.");
      return;
    }

    if (indexA < 0 || indexA >= tracks.length || indexB < 0 || indexB >= tracks.length) return;

    const trackA = tracks[indexA];
    const trackB = tracks[indexB];

    try {
      await updateDoc(doc(db, 'music', trackA.id), { order: trackB.order });
      await updateDoc(doc(db, 'music', trackB.id), { order: trackA.order });
      toast.success("Ordem redefinida!");
    } catch (err) {
      console.error(err);
      toast.error("Falha ao reordenar faixas.");
    }
  };

  // Render unauthorized view if not admin
  if (user && !isAdmin) {
    return (
      <div className="bg-white border-2 border-black p-12 text-center space-y-6" id="admin_music_unauthorized">
        <AlertTriangle className="text-red-500 mx-auto" size={48} />
        <div>
          <h2 className="text-lg font-black uppercase tracking-wide">Acesso Restrito ao Painel F PAC RADIO</h2>
          <p className="text-xs text-gray-500 uppercase tracking-widest mt-2 max-w-md mx-auto">
            Apenas administradores autorizados têm permissões para carregar, editar, excluir ou reordenar o catálogo de músicas da marca.
          </p>
        </div>
        <div className="text-[10px] text-gray-400 font-mono">
          CONTA CONECTADA: {user.email}
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white border-2 border-black p-6 space-y-6" id="admin_music_panel">
      {/* Upper bar controls */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border-b border-black/10 pb-4">
        <div>
          <h2 className="text-xl font-black uppercase tracking-tight italic flex items-center gap-2">
            <Radio className="text-[#eab308]" size={22} /> F PAC RADIO <span className="text-[#eab308]">PAINEL ADMINISTRATIVO</span>
          </h2>
          <p className="text-[10px] text-gray-500 font-bold uppercase tracking-widest mt-1">
            Controle total do player e catalogação de áudio. Sem dados mockados, carregamento 100% manual e seguro.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {tracks.length > 0 && (
            <button
              onClick={() => setShowClearConfirm(true)}
              className="flex items-center gap-1.5 px-4 py-2 border border-red-500 text-red-600 hover:bg-red-50 text-xs font-black uppercase tracking-widest transition-colors cursor-pointer"
              title="Apagar todas as músicas do catálogo"
            >
              <Trash2 size={12} /> Limpar Catálogo
            </button>
          )}
          <button
            onClick={startBatchMode}
            className="flex items-center gap-1.5 px-4 py-2 bg-[#eab308] text-black hover:bg-[#eab308]/90 text-xs font-black uppercase tracking-widest transition-all cursor-pointer"
            title="Carregar várias músicas de uma vez só"
          >
            <FolderPlus size={14} /> Upload em Lote
          </button>
          <button
            onClick={startNew}
            className="flex items-center gap-1.5 px-4 py-2 bg-black text-white hover:bg-[#eab308] hover:text-black text-xs font-black uppercase tracking-widest transition-all cursor-pointer"
          >
            <Plus size={14} /> Nova Música
          </button>
        </div>
      </div>

      {/* Editor Modal Overlay */}
      {isEditing && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-55 flex items-center justify-center p-4 overflow-y-auto">
          <div className={`bg-white border-2 border-black ${isEditing === 'new' && modalTab === 'batch' ? 'max-w-4xl' : 'max-w-2xl'} w-full p-6 md:p-8 space-y-6 relative max-h-[90vh] overflow-y-auto rounded-none text-black`}>
            <button
              onClick={() => {
                if (isEditing === 'new' && modalTab === 'batch' && isUploadingBatch) {
                  if (!window.confirm("Há envios em andamento. Tem certeza de que deseja fechar?")) return;
                }
                setIsEditing(null);
              }}
              className="absolute top-4 right-4 text-gray-400 hover:text-black font-black uppercase text-xs border border-gray-200 px-3 py-1 bg-gray-50 hover:bg-gray-100 transition-colors cursor-pointer"
            >
              [X] Fechar
            </button>

            <div>
              <h3 className="text-lg font-black uppercase tracking-wide">
                {isEditing === 'new' ? 'Adicionar Novas Músicas' : 'Editar Faixa'}
              </h3>
              <p className="text-[9px] text-gray-500 uppercase tracking-widest font-bold mt-1">
                Configure os parâmetros de playback e envie as mídias diretamente para o Firebase Storage.
              </p>
            </div>

            {/* Modal Tabs if isEditing === 'new' */}
            {isEditing === 'new' && (
              <div className="flex border-2 border-black divide-x-2 divide-black">
                <button
                  type="button"
                  disabled={isUploadingBatch}
                  onClick={() => setModalTab('individual')}
                  className={`flex-1 py-2.5 text-[10px] font-black uppercase tracking-widest transition-all cursor-pointer ${
                    modalTab === 'individual'
                      ? 'bg-black text-white'
                      : 'bg-white text-gray-400 hover:text-black hover:bg-gray-50'
                  }`}
                >
                  📻 Sintonia Individual
                </button>
                <button
                  type="button"
                  disabled={isUploadingBatch}
                  onClick={() => setModalTab('batch')}
                  className={`flex-1 py-2.5 text-[10px] font-black uppercase tracking-widest transition-all cursor-pointer ${
                    modalTab === 'batch'
                      ? 'bg-black text-white'
                      : 'bg-white text-gray-400 hover:text-black hover:bg-gray-50'
                  }`}
                >
                  📁 Upload em Lote
                </button>
              </div>
            )}

            {isEditing === 'new' && modalTab === 'batch' ? (
              /* BATCH UPLOAD SCREEN */
              <div className="space-y-6">
                {/* Batch configurations (Shared among all files in the batch) */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 bg-gray-50 p-4 border border-black/10">
                  <div className="flex flex-col gap-1">
                    <label className="text-[9px] font-black uppercase tracking-wider text-black/60">Playlist Padrão</label>
                    <select
                      disabled={isUploadingBatch}
                      value={batchPlaylist}
                      onChange={e => setBatchPlaylist(e.target.value)}
                      className="border border-black/20 p-2 text-xs focus:border-[#eab308] outline-none font-bold uppercase bg-white disabled:opacity-50"
                    >
                      <option value="F PAC Anthem">F PAC Anthem</option>
                      <option value="Vista a Marca">Vista a Marca</option>
                      <option value="Street Mode">Street Mode</option>
                      <option value="Identidade">Identidade</option>
                      <option value="Urban Bass">Urban Bass</option>
                    </select>
                  </div>

                  <div className="flex flex-col gap-1">
                    <label className="text-[9px] font-black uppercase tracking-wider text-black/60">Categoria / Gênero Padrão</label>
                    <input
                      disabled={isUploadingBatch}
                      type="text"
                      placeholder="ex: Street Beats"
                      value={batchCategory}
                      onChange={e => setBatchCategory(e.target.value)}
                      className="border border-black/20 p-2 text-xs focus:border-[#eab308] outline-none font-bold uppercase bg-white disabled:opacity-50"
                    />
                  </div>

                  <div className="flex flex-col gap-1 justify-center">
                    <label className="text-[9px] font-black uppercase tracking-wider text-black/60">Capa do Lote (Opcional)</label>
                    <div className="flex items-center gap-2 mt-1">
                      {batchCoverProgress !== null ? (
                        <div className="flex flex-col w-full">
                          <span className="text-[8px] font-black">Capa: {batchCoverProgress}%</span>
                          <button type="button" onClick={handleCancelBatchCoverUpload} className="text-[8px] text-red-500 font-bold uppercase underline text-left">
                            Cancelar
                          </button>
                        </div>
                      ) : (
                        <button
                          type="button"
                          disabled={isUploadingBatch}
                          onClick={() => batchCoverInputRef.current?.click()}
                          className="px-2 py-1.5 bg-black text-white hover:bg-[#eab308] hover:text-black text-[9px] font-black uppercase tracking-wider disabled:opacity-50 transition-colors cursor-pointer"
                        >
                          Selecionar Capa
                        </button>
                      )}
                      <input
                        ref={batchCoverInputRef}
                        type="file"
                        accept="image/*"
                        onChange={handleUploadBatchCover}
                        className="hidden"
                      />
                      {batchCover ? (
                        <div className="flex items-center gap-1.5 border border-black/15 p-1 bg-white">
                          <img src={batchCover} alt="Capa" className="w-5 h-5 object-cover" referrerPolicy="no-referrer" />
                          <button 
                            type="button" 
                            disabled={isUploadingBatch}
                            onClick={() => setBatchCover('')} 
                            className="text-red-500 hover:text-red-700 font-bold text-[10px]"
                            title="Remover capa"
                          >
                            [X]
                          </button>
                        </div>
                      ) : (
                        <span className="text-[8px] text-gray-400 font-bold uppercase tracking-wider">Capa padrão da rádio</span>
                      )}
                    </div>
                  </div>
                </div>

                {/* Drop Zone for multiple files */}
                <div
                  onDragEnter={handleBatchDrag}
                  onDragOver={handleBatchDrag}
                  onDragLeave={handleBatchDrag}
                  onDrop={handleBatchDrop}
                  onClick={() => {
                    if (!isUploadingBatch) {
                      batchAudioInputRef.current?.click();
                    }
                  }}
                  className={`border-2 border-dashed p-8 text-center transition-all flex flex-col items-center justify-center gap-2 rounded-none ${
                    isUploadingBatch 
                      ? "border-gray-200 bg-gray-50/50 cursor-not-allowed opacity-50" 
                      : batchDragActive
                        ? "border-[#eab308] bg-[#eab308]/5 cursor-pointer"
                        : "border-black/25 hover:border-[#eab308] hover:bg-black/[0.01] cursor-pointer"
                  }`}
                >
                  <input
                    ref={batchAudioInputRef}
                    type="file"
                    accept="audio/*"
                    multiple
                    onChange={handleBatchAudioFileInput}
                    className="hidden"
                    disabled={isUploadingBatch}
                  />
                  <Upload className="text-gray-400" size={32} />
                  <div>
                    <p className="text-xs font-black uppercase tracking-wider">
                      Arraste múltiplas músicas ou clique para selecionar do dispositivo
                    </p>
                    <p className="text-[9px] text-gray-400 font-bold uppercase tracking-widest mt-1">
                      Formatos aceitos: MP3, WAV, OGG, M4A. Envie quantos arquivos desejar.
                    </p>
                  </div>
                </div>

                {/* Queue Table */}
                {batchFiles.length > 0 && (
                  <div className="space-y-3">
                    <div className="flex items-center justify-between border-b border-black pb-1.5">
                      <span className="text-[10px] font-black uppercase tracking-wider">Fila de Upload ({batchFiles.length} sintonias)</span>
                      <button
                        type="button"
                        disabled={isUploadingBatch}
                        onClick={() => setBatchFiles([])}
                        className="text-[9px] text-red-500 hover:text-red-700 font-black uppercase tracking-wider disabled:opacity-50 cursor-pointer"
                      >
                        Limpar Fila
                      </button>
                    </div>

                    <div className="max-h-[30vh] overflow-y-auto border border-black divide-y divide-black/10">
                      {batchFiles.map((item, idx) => (
                        <div key={item.id} className="p-3 flex flex-col md:flex-row md:items-center justify-between gap-3 bg-white hover:bg-gray-50 transition-colors text-xs">
                          {/* Left: Indicator & File details */}
                          <div className="flex items-start gap-2 flex-1 min-w-0">
                            <span className="font-mono font-black text-gray-300 text-[10px] mt-0.5">
                              {(idx + 1).toString().padStart(2, '0')}
                            </span>
                            <div className="flex-1 min-w-0 space-y-2">
                              <p className="font-bold text-[10px] text-gray-500 uppercase tracking-tight truncate" title={item.file.name}>
                                📁 {item.file.name} ({(item.file.size / (1024 * 1024)).toFixed(2)} MB • {Math.floor(item.duration / 60)}:{(item.duration % 60).toString().padStart(2, '0')})
                              </p>
                              
                              {/* Title and Artist edits inline */}
                              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                <div className="flex flex-col gap-0.5">
                                  <span className="text-[8px] font-black uppercase text-black/50">Título da Música</span>
                                  <input
                                    type="text"
                                    disabled={isUploadingBatch || item.status === 'success'}
                                    value={item.title}
                                    onChange={e => handleUpdateBatchFileFields(item.id, e.target.value, item.artist)}
                                    className="border border-black/25 p-1 text-[10px] focus:border-[#eab308] outline-none font-bold uppercase bg-white disabled:opacity-60"
                                  />
                                </div>
                                <div className="flex flex-col gap-0.5">
                                  <span className="text-[8px] font-black uppercase text-black/50">Artista</span>
                                  <input
                                    type="text"
                                    disabled={isUploadingBatch || item.status === 'success'}
                                    value={item.artist}
                                    onChange={e => handleUpdateBatchFileFields(item.id, item.title, e.target.value)}
                                    className="border border-black/25 p-1 text-[10px] focus:border-[#eab308] outline-none font-bold uppercase bg-white disabled:opacity-60"
                                  />
                                </div>
                              </div>
                            </div>
                          </div>

                          {/* Right: Progress, Status & Cancel Action */}
                          <div className="flex items-center gap-3 justify-between md:justify-end shrink-0">
                            {/* Progress Display */}
                            <div className="flex flex-col items-end gap-1 w-28 sm:w-36">
                              <div className="flex items-center justify-between w-full text-[9px] font-bold uppercase">
                                <span>
                                  {item.status === 'pending' && <span className="text-gray-500">Pendente</span>}
                                  {item.status === 'uploading' && <span className="text-blue-600 animate-pulse">Enviando...</span>}
                                  {item.status === 'success' && <span className="text-green-600">Concluído ✔</span>}
                                  {item.status === 'error' && <span className="text-red-600">Erro ❌</span>}
                                  {item.status === 'cancelled' && <span className="text-orange-500">Cancelado</span>}
                                </span>
                                <span className="font-mono">{item.progress}%</span>
                              </div>
                              <div className="w-full bg-gray-100 h-1 rounded-none overflow-hidden border border-black/5">
                                <div 
                                  className={`h-full transition-all duration-300 ${
                                    item.status === 'success' 
                                      ? 'bg-green-500' 
                                      : item.status === 'error' 
                                        ? 'bg-red-500' 
                                        : item.status === 'uploading' 
                                          ? 'bg-blue-500' 
                                          : 'bg-gray-300'
                                  }`} 
                                  style={{ width: `${item.progress}%` }} 
                                />
                              </div>
                              {item.errorMsg && <span className="text-[8px] font-mono text-red-500 truncate max-w-full">{item.errorMsg}</span>}
                            </div>

                            {/* Remove or Cancel button */}
                            <button
                              type="button"
                              onClick={() => handleRemoveBatchFile(item.id)}
                              disabled={isUploadingBatch && item.status !== 'uploading'}
                              className="p-1.5 border border-black/10 hover:border-red-500/30 text-gray-400 hover:text-red-500 hover:bg-red-50 transition-colors disabled:opacity-30 cursor-pointer"
                              title={item.status === 'uploading' ? "Cancelar upload" : "Remover da fila"}
                            >
                              <X size={12} />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Overall Progress & Footer Controls */}
                <div className="border-t border-black/10 pt-4 flex flex-col sm:flex-row items-center justify-between gap-4">
                  <div className="w-full sm:w-auto text-left">
                    {batchFiles.length > 0 && (
                      <div>
                        <p className="text-xs font-black uppercase">
                          Progresso Geral: {batchFiles.filter(f => f.status === 'success').length} de {batchFiles.length} faixas salvas
                        </p>
                        <div className="w-full sm:w-64 bg-gray-100 h-1.5 rounded-none mt-1 border border-black/5 overflow-hidden">
                          <div 
                            className="bg-[#eab308] h-full transition-all duration-500" 
                            style={{ 
                              width: `${
                                (batchFiles.filter(f => f.status === 'success').length / batchFiles.length) * 100
                              }%` 
                            }} 
                          />
                        </div>
                      </div>
                    )}
                  </div>

                  <div className="flex items-center gap-3 shrink-0">
                    <button
                      type="button"
                      disabled={isUploadingBatch}
                      onClick={() => setIsEditing(null)}
                      className="px-5 py-2.5 border border-black text-xs font-black uppercase tracking-widest hover:bg-black/5 disabled:opacity-50 cursor-pointer"
                    >
                      Cancelar / Sair
                    </button>
                    {batchFiles.length > 0 && (
                      <button
                        type="button"
                        onClick={handleStartBatchUpload}
                        disabled={isUploadingBatch || batchFiles.filter(f => f.status === 'pending' || f.status === 'error').length === 0}
                        className="px-6 py-2.5 bg-black text-white hover:bg-[#eab308] hover:text-black disabled:bg-gray-200 disabled:text-gray-400 text-xs font-black uppercase tracking-widest transition-all cursor-pointer flex items-center gap-1.5"
                      >
                        {isUploadingBatch ? (
                          <>
                            <Loader2 className="animate-spin" size={12} />
                            Enviando...
                          </>
                        ) : (
                          <>
                            <PlayCircle size={12} />
                            Iniciar Envios em Lote
                          </>
                        )}
                      </button>
                    )}
                  </div>
                </div>
              </div>
            ) : (
              /* INDIVIDUAL UPLOAD FORM */
              <form onSubmit={saveTrack} className="space-y-5">
                {/* 1. Drag & Drop / Click MP3 Upload Block at the Very Top */}
                <div 
                  onDragEnter={handleDrag}
                  onDragOver={handleDrag}
                  onDragLeave={handleDrag}
                  onDrop={handleDrop}
                  onClick={() => audioInputRef.current?.click()}
                  className={`border-2 border-dashed rounded-none p-6 text-center transition-all cursor-pointer flex flex-col items-center justify-center gap-2 ${
                    dragActive 
                      ? "border-[#eab308] bg-[#eab308]/5" 
                      : audio 
                        ? "border-green-500/50 bg-green-500/[0.02]" 
                        : "border-black/25 hover:border-[#eab308] hover:bg-black/[0.01]"
                  }`}
                >
                  <input
                    ref={audioInputRef}
                    type="file"
                    accept="audio/*"
                    multiple
                    onChange={handleAudioFileInput}
                    className="hidden"
                  />
                  
                  {audioUploadProgress !== null ? (
                    <div className="flex flex-col items-center gap-1.5 w-full max-w-xs">
                      <Loader2 className="animate-spin text-[#eab308]" size={28} />
                      <span className="text-[10px] font-black">{audioUploadProgress}%</span>
                      <div className="w-full bg-gray-200 h-1.5 rounded-none overflow-hidden">
                        <div className="bg-[#eab308] h-full" style={{ width: `${audioUploadProgress}%` }} />
                      </div>
                      <button 
                        type="button" 
                        onClick={(e) => { e.stopPropagation(); handleCancelAudioUpload(); }}
                        className="text-[9px] font-bold uppercase text-red-500 hover:underline"
                      >
                        Cancelar Envio
                      </button>
                    </div>
                  ) : (
                    <>
                      <Upload className={audio ? "text-green-500" : "text-gray-400"} size={28} />
                      <div className="space-y-1">
                        <p className="text-xs font-black uppercase tracking-wider">
                          {audio 
                            ? "✔ Arquivo de áudio carregado" 
                            : "Arraste o arquivo de áudio (ou múltiplos) aqui ou clique"}
                        </p>
                        <p className="text-[9px] text-gray-500 font-bold uppercase tracking-widest">
                          {audio ? "Você pode enviar outro arquivo para substituir" : "Selecione múltiplos para carregar em lote automaticamente!"}
                        </p>
                      </div>
                    </>
                  )}

                  {audioFileForRetry && audioUploadProgress === null && (
                    <button 
                      type="button" 
                      onClick={(e) => { e.stopPropagation(); handleRetryAudioUpload(); }}
                      className="mt-2 flex items-center gap-1 text-[9px] font-black bg-black text-[#eab308] px-2.5 py-1 uppercase tracking-wider hover:bg-gray-900"
                    >
                      <RefreshCw size={10} /> Repetir Upload do Áudio
                    </button>
                  )}

                  {audio && (
                    <div className="mt-2 px-3 py-1 bg-green-500/10 text-green-700 text-[9px] font-mono font-bold tracking-tight max-w-full truncate">
                      {audio}
                    </div>
                  )}
                </div>

              {/* 2. Title & Artist (Highlighted Side-by-Side) */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Title */}
                <div className="flex flex-col gap-1">
                  <label className="text-[10px] font-black uppercase tracking-wider text-black/60">Nome da Música *</label>
                  <input
                    type="text"
                    required
                    placeholder="ex: F PAC Anthem"
                    value={title}
                    onChange={e => setTitle(e.target.value)}
                    className="border border-black p-2.5 text-xs focus:border-[#eab308] outline-none font-bold uppercase"
                  />
                </div>

                {/* Artist */}
                <div className="flex flex-col gap-1">
                  <label className="text-[10px] font-black uppercase tracking-wider text-black/60">Artista *</label>
                  <input
                    type="text"
                    required
                    placeholder="ex: F PAC Beats"
                    value={artist}
                    onChange={e => setArtist(e.target.value)}
                    className="border border-black p-2.5 text-xs focus:border-[#eab308] outline-none font-bold uppercase"
                  />
                </div>
              </div>

              {/* 3. Advanced Toggle Option */}
              <div className="pt-2 border-t border-black/10">
                <button
                  type="button"
                  onClick={() => setShowAdvanced(!showAdvanced)}
                  className="flex items-center gap-2 text-xs font-black uppercase tracking-widest text-[#eab308] hover:text-black transition-colors py-1 cursor-pointer"
                >
                  <span>{showAdvanced ? "[-] Ocultar Configurações Avançadas" : "[+] Mostrar Opções Avançadas (Álbum, Capa, Playlists...)"}</span>
                </button>
              </div>

              {/* 4. Expandable Advanced Fields */}
              {showAdvanced && (
                <div className="space-y-4 pt-2 border-t border-dashed border-black/10">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {/* Album */}
                    <div className="flex flex-col gap-1">
                      <label className="text-[10px] font-black uppercase tracking-wider text-black/60">Álbum</label>
                      <input
                        type="text"
                        placeholder="ex: Street Mode Vol. 1"
                        value={album}
                        onChange={e => setAlbum(e.target.value)}
                        className="border border-black/20 p-2.5 text-xs focus:border-[#eab308] outline-none font-bold uppercase"
                      />
                    </div>

                    {/* Playlist Group */}
                    <div className="flex flex-col gap-1">
                      <label className="text-[10px] font-black uppercase tracking-wider text-black/60">Playlist</label>
                      <select
                        value={playlist}
                        onChange={e => setPlaylist(e.target.value)}
                        className="border border-black/20 p-2.5 text-xs focus:border-[#eab308] outline-none font-bold uppercase bg-white"
                      >
                        <option value="F PAC Anthem">F PAC Anthem</option>
                        <option value="Vista a Marca">Vista a Marca</option>
                        <option value="Street Mode">Street Mode</option>
                        <option value="Identidade">Identidade</option>
                        <option value="Urban Bass">Urban Bass</option>
                      </select>
                    </div>

                    {/* Category / Genre */}
                    <div className="flex flex-col gap-1">
                      <label className="text-[10px] font-black uppercase tracking-wider text-black/60">Categoria / Gênero</label>
                      <input
                        type="text"
                        placeholder="ex: Synthwave, Trap, Lofi, Boom Bap"
                        value={category}
                        onChange={e => setCategory(e.target.value)}
                        className="border border-black/20 p-2.5 text-xs focus:border-[#eab308] outline-none font-bold uppercase"
                      />
                    </div>

                    {/* Duration in seconds */}
                    <div className="flex flex-col gap-1">
                      <label className="text-[10px] font-black uppercase tracking-wider text-black/60">Duração (Segundos)</label>
                      <input
                        type="number"
                        min="1"
                        value={duration}
                        onChange={e => setDuration(parseInt(e.target.value) || 120)}
                        className="border border-black/20 p-2.5 text-xs focus:border-[#eab308] outline-none font-mono"
                      />
                    </div>

                    {/* Playlist Order */}
                    <div className="flex flex-col gap-1">
                      <label className="text-[10px] font-black uppercase tracking-wider text-black/60">Ordem na Playlist</label>
                      <input
                        type="number"
                        min="1"
                        value={playlistOrder}
                        onChange={e => setPlaylistOrder(parseInt(e.target.value) || 1)}
                        className="border border-black/20 p-2.5 text-xs focus:border-[#eab308] outline-none font-mono"
                      />
                    </div>
                  </div>

                  {/* Description */}
                  <div className="flex flex-col gap-1">
                    <label className="text-[10px] font-black uppercase tracking-wider text-black/60">Descrição da Sintonia</label>
                    <textarea
                      placeholder="Conte um pouco sobre a vibração da faixa..."
                      value={description}
                      onChange={e => setDescription(e.target.value)}
                      className="border border-black/20 p-2.5 text-xs focus:border-[#eab308] outline-none h-16 uppercase font-medium"
                    />
                  </div>

                  {/* Cover Image Upload */}
                  <div className="space-y-2 border border-dashed border-black/15 p-4 bg-gray-50">
                    <label className="text-[10px] font-black uppercase tracking-wider text-black/60 block">Capa da Música (Imagem)</label>
                    <div className="flex flex-col gap-2">
                      <div className="flex items-center gap-2">
                        {coverUploadProgress !== null ? (
                          <div className="flex flex-col items-start gap-1 w-full max-w-xs">
                            <span className="text-[9px] font-black">Enviando Capa: {coverUploadProgress}%</span>
                            <div className="w-full bg-gray-200 h-1 rounded-none overflow-hidden">
                              <div className="bg-[#eab308] h-full" style={{ width: `${coverUploadProgress}%` }} />
                            </div>
                            <button 
                              type="button" 
                              onClick={handleCancelCoverUpload}
                              className="text-[8px] font-bold uppercase text-red-500 hover:underline"
                            >
                              Cancelar Envio
                            </button>
                          </div>
                        ) : (
                          <button
                            type="button"
                            onClick={() => coverInputRef.current?.click()}
                            className="flex items-center gap-2 px-3 py-2 bg-black text-white hover:bg-[#eab308] hover:text-black text-[10px] font-black uppercase tracking-wider transition-colors cursor-pointer"
                          >
                            <ImageIcon size={12} />
                            Fazer Upload da Capa
                          </button>
                        )}
                        <input
                          ref={coverInputRef}
                          type="file"
                          accept="image/*"
                          onChange={handleCoverFileInput}
                          className="hidden"
                        />
                        <span className="text-[9px] font-mono text-gray-500 truncate max-w-[150px]">
                          {cover ? "Capa Selecionada ✔" : "Sem capa (Será usado o padrão)"}
                        </span>
                      </div>

                      {coverFileForRetry && coverUploadProgress === null && (
                        <button 
                          type="button" 
                          onClick={handleRetryCoverUpload}
                          className="flex items-center gap-1 self-start text-[9px] font-black bg-black text-[#eab308] px-2.5 py-1 uppercase tracking-wider hover:bg-gray-900"
                        >
                          <RefreshCw size={10} /> Repetir Upload da Capa
                        </button>
                      )}
                    </div>
                    {cover && (
                      <div className="flex items-center gap-2 mt-2">
                        <img src={cover} alt="Preview" className="w-8 h-8 object-cover border border-black/10" referrerPolicy="no-referrer" />
                        <input
                          type="text"
                          readOnly
                          value={cover}
                          className="border border-black/15 p-1.5 flex-1 text-[9px] font-mono text-gray-400 bg-white"
                        />
                      </div>
                    )}
                  </div>

                  {/* Controls triggers */}
                  <div className="flex flex-wrap items-center gap-4 border-t border-black/10 pt-4">
                    <label className="flex items-center gap-2 text-xs font-black uppercase tracking-wider cursor-pointer">
                      <input
                        type="checkbox"
                        checked={active}
                        onChange={e => setActive(e.target.checked)}
                        className="w-4 h-4 accent-black"
                      />
                      Habilitar Faixa (Status Ativo)
                    </label>

                    <label className="flex items-center gap-2 text-xs font-black uppercase tracking-wider cursor-pointer">
                      <input
                        type="checkbox"
                        checked={loop}
                        onChange={e => setLoop(e.target.checked)}
                        className="w-4 h-4 accent-black"
                      />
                      Loop por Padrão
                    </label>

                    <label className="flex items-center gap-2 text-xs font-black uppercase tracking-wider cursor-pointer">
                      <input
                        type="checkbox"
                        checked={shufflePermitted}
                        onChange={e => setShufflePermitted(e.target.checked)}
                        className="w-4 h-4 accent-black"
                      />
                      Permitir Shuffle
                    </label>
                  </div>
                </div>
              )}

              {/* Action row */}
              <div className="flex items-center justify-end gap-3 border-t border-black/10 pt-4">
                <button
                  type="button"
                  onClick={() => setIsEditing(null)}
                  className="px-6 py-3 border border-black text-xs font-black uppercase tracking-widest hover:bg-black/5 cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-8 py-3 bg-black text-white hover:bg-[#eab308] hover:text-black text-xs font-black uppercase tracking-widest transition-all cursor-pointer"
                >
                  Confirmar e Salvar
                </button>
              </div>
            </form>
          )}
          </div>
        </div>
      )}

      {/* Main Catalog View List */}
      {loading ? (
        <div className="p-12 text-center text-sm font-bold uppercase tracking-widest text-black/40 animate-pulse">
          Carregando catálogo F PAC RADIO...
        </div>
      ) : tracks.length === 0 ? (
        <div className="border border-dashed border-black/20 p-12 text-center space-y-4">
          <Radio className="text-gray-300 mx-auto" size={48} />
          <div>
            <h4 className="text-sm font-black uppercase tracking-wide">Rádio Completamente Vazia</h4>
            <p className="text-[10px] text-gray-500 uppercase tracking-widest mt-1">
              Não há faixas cadastradas. Use o botão abaixo ou no topo para enviar sua primeira música diretamente do dispositivo.
            </p>
          </div>
          <button
            onClick={startNew}
            className="px-6 py-2.5 bg-black text-white hover:bg-[#eab308] hover:text-black text-xs font-black uppercase tracking-widest transition-colors cursor-pointer flex items-center gap-2 mx-auto"
          >
            <Plus size={14} /> Cadastrar Primeira Música
          </button>
        </div>
      ) : (
        <div className="overflow-x-auto border border-black">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-black text-white uppercase text-[9px] font-black tracking-widest border-b border-black">
                <th className="py-3 px-4 w-12 text-center">Ord</th>
                <th className="py-3 px-4 w-16">Capa</th>
                <th className="py-3 px-4">Faixa / Artista</th>
                <th className="py-3 px-4">Playlist / Gênero</th>
                <th className="py-3 px-4 w-20 text-center font-mono">Duração</th>
                <th className="py-3 px-4 w-28 text-center">Status</th>
                <th className="py-3 px-4 w-32 text-center">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-black/10">
              {tracks.map((track, idx) => (
                <tr key={track.id} className="hover:bg-black/[0.01] transition-colors text-xs text-black">
                  {/* Order Selector */}
                  <td className="py-4 px-4 font-mono font-black text-center text-gray-400">
                    <div className="flex flex-col items-center gap-1 justify-center">
                      <span>{(idx + 1).toString().padStart(2, '0')}</span>
                      <div className="flex items-center gap-0.5">
                        <button
                          disabled={idx === 0}
                          onClick={() => swapOrder(idx, idx - 1)}
                          className="p-0.5 hover:bg-black/5 disabled:opacity-25 hover:text-[#eab308] transition-colors cursor-pointer"
                          title="Subir na ordem"
                        >
                          <ArrowUp size={10} />
                        </button>
                        <button
                          disabled={idx === tracks.length - 1}
                          onClick={() => swapOrder(idx, idx + 1)}
                          className="p-0.5 hover:bg-black/5 disabled:opacity-25 hover:text-[#eab308] transition-colors cursor-pointer"
                          title="Descer na ordem"
                        >
                          <ArrowDown size={10} />
                        </button>
                      </div>
                    </div>
                  </td>

                  {/* Album Cover Art */}
                  <td className="py-4 px-4">
                    <div className="w-10 h-10 border border-black/10 bg-gray-50 overflow-hidden relative">
                      <img src={track.cover} alt={track.title} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                    </div>
                  </td>

                  {/* Details */}
                  <td className="py-4 px-4">
                    <p className="font-black uppercase tracking-wide">{track.title}</p>
                    <p className="text-[10px] text-[#eab308] font-bold uppercase tracking-widest mt-0.5">{track.artist}</p>
                    {track.album && <p className="text-[9px] text-gray-400 font-bold uppercase tracking-widest leading-none mt-1">Álbum: {track.album}</p>}
                  </td>

                  {/* Playlist & Genre */}
                  <td className="py-4 px-4">
                    <span className="inline-block bg-black/5 text-black border border-black/10 px-2 py-1 text-[8px] font-black uppercase tracking-widest">
                      {track.playlist || 'F PAC Anthem'}
                    </span>
                    <span className="block text-[8px] text-gray-400 font-bold uppercase tracking-widest mt-1.5">Gênero: {track.category || 'Urban'}</span>
                  </td>

                  {/* Duration */}
                  <td className="py-4 px-4 text-center font-mono font-medium text-gray-600">
                    {Math.floor(track.duration / 60)}:{(track.duration % 60).toString().padStart(2, '0')}
                  </td>

                  {/* Status Activator */}
                  <td className="py-4 px-4 text-center">
                    <button
                      onClick={() => toggleStatus(track)}
                      className={`px-3 py-1 text-[8px] font-black uppercase tracking-widest transition-colors border cursor-pointer ${
                        track.active 
                          ? 'bg-green-500/10 text-green-700 border-green-500/20 hover:bg-green-500/20' 
                          : 'bg-red-500/10 text-red-700 border-red-500/20 hover:bg-red-500/20'
                      }`}
                    >
                      {track.active ? '● Ativo' : '○ Inativo'}
                    </button>
                  </td>

                  {/* Actions buttons */}
                  <td className="py-4 px-4">
                    <div className="flex items-center gap-1.5 justify-center">
                      <button
                        onClick={() => startEdit(track)}
                        className="p-2 border border-black/10 hover:border-black/30 bg-white hover:bg-gray-50 hover:text-[#eab308] transition-colors cursor-pointer"
                        title="Editar faixa"
                      >
                        <Edit2 size={12} />
                      </button>
                      <button
                        onClick={() => setTrackToDelete(track)}
                        className="p-2 border border-black/10 hover:border-red-500/30 bg-white hover:bg-red-50 hover:text-red-600 transition-colors cursor-pointer"
                        title="Deletar música"
                      >
                        <Trash2 size={12} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Custom Confirmation Modal: Deleting track */}
      {trackToDelete && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-55 flex items-center justify-center p-4">
          <div className="bg-white border-2 border-black max-w-sm w-full p-6 space-y-6 rounded-none text-black">
            <div>
              <h3 className="text-sm font-black uppercase tracking-wider text-red-600 flex items-center gap-2">
                <Trash2 size={14} /> Remover Música
              </h3>
              <p className="text-xs font-bold uppercase tracking-wide mt-2 text-black">
                Deseja realmente excluir a faixa "{trackToDelete.title}"?
              </p>
              <p className="text-[10px] text-gray-500 uppercase tracking-widest mt-1">
                Esta ação é permanente. O arquivo de áudio e imagem associados no Firebase Storage serão excluídos para evitar arquivos órfãos.
              </p>
            </div>
            <div className="flex items-center justify-end gap-3 border-t border-black/10 pt-4">
              <button
                onClick={() => setTrackToDelete(null)}
                className="px-4 py-2 border border-black text-[10px] font-black uppercase tracking-widest hover:bg-black/5 cursor-pointer"
              >
                Cancelar
              </button>
              <button
                onClick={confirmDeleteTrack}
                className="px-5 py-2 bg-red-600 text-white hover:bg-red-700 text-[10px] font-black uppercase tracking-widest transition-colors cursor-pointer"
              >
                Confirmar Exclusão
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Custom Confirmation Modal: Clearing all tracks */}
      {showClearConfirm && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-55 flex items-center justify-center p-4">
          <div className="bg-white border-2 border-black max-w-sm w-full p-6 space-y-6 rounded-none text-black">
            <div>
              <h3 className="text-sm font-black uppercase tracking-wider text-red-600 flex items-center gap-2">
                ⚠ Limpar Catálogo Completo
              </h3>
              <p className="text-xs font-bold uppercase tracking-wide mt-2 text-black">
                Deseja realmente apagar TODAS as músicas do catálogo?
              </p>
              <p className="text-[10px] text-gray-500 uppercase tracking-widest mt-1">
                Essa ação excluirá permanentemente todos os arquivos de áudio, capas e metadados. Não restarão arquivos órfãos no Firebase Storage.
              </p>
            </div>
            <div className="flex items-center justify-end gap-3 border-t border-black/10 pt-4">
              <button
                onClick={() => setShowClearConfirm(false)}
                className="px-4 py-2 border border-black text-[10px] font-black uppercase tracking-widest hover:bg-black/5 cursor-pointer"
              >
                Cancelar
              </button>
              <button
                onClick={clearAllTracks}
                className="px-5 py-2 bg-red-600 text-white hover:bg-red-700 text-[10px] font-black uppercase tracking-widest transition-colors cursor-pointer"
              >
                Confirmar Limpeza
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default AdminMusic;
