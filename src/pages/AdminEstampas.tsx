import React, { useState, useEffect } from 'react';
import { db } from '../lib/firebase';
import { collection, addDoc, deleteDoc, doc, onSnapshot, query, orderBy, serverTimestamp } from 'firebase/firestore';
import { useAuth } from '../context/AuthContext';
import { Plus, Trash2, Image as ImageIcon, Loader2, ArrowLeft } from 'lucide-react';
import { Link } from 'react-router-dom';

interface Estampa {
  id: string;
  name: string;
  description: string;
  image: string;
}

export function AdminEstampas() {
  const { user } = useAuth();
  const [estampas, setEstampas] = useState<Estampa[]>([]);
  const [loading, setLoading] = useState(true);
  const [isAdding, setIsAdding] = useState(false);
  const [newEstampa, setNewEstampa] = useState({ name: '', description: '', image: '' });

  // Nota: No mundo real, verificaríamos se o usuário é realmente um ADMIN aqui.
  // Por enquanto, permitiremos acesso se estiver logado para facilitar seu teste.

  useEffect(() => {
    const q = query(collection(db, 'estampas'), orderBy('createdAt', 'desc'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Estampa));
      setEstampas(data);
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsAdding(true);
    try {
      await addDoc(collection(db, 'estampas'), {
        ...newEstampa,
        createdAt: serverTimestamp()
      });
      setNewEstampa({ name: '', description: '', image: '' });
    } catch (error) {
      console.error(error);
      alert("Erro ao adicionar estampa.");
    } finally {
      setIsAdding(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (window.confirm("Deseja realmente remover esta estampa?")) {
      await deleteDoc(doc(db, 'estampas', id));
    }
  };

  return (
    <div className="min-h-screen bg-white pt-32 pb-20 px-4">
      <div className="max-w-4xl mx-auto">
        <div className="flex items-center justify-between mb-12">
          <div>
            <h1 className="text-3xl font-black uppercase tracking-tighter mb-2">Gerenciar Estampas</h1>
            <p className="text-gray-500 text-xs uppercase tracking-widest font-bold">Adicione e remova artes do catálogo</p>
          </div>
          <Link to="/gestao" className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest hover:text-[#eab308] transition-colors">
            <ArrowLeft size={14} /> Voltar Gestão
          </Link>
        </div>

        {/* Cadastro Form */}
        <div className="bg-black text-white p-8 mb-12">
          <h2 className="text-sm font-black uppercase tracking-widest mb-6 flex items-center gap-2">
            <Plus size={18} className="text-[#eab308]" /> Nova Estampa
          </h2>
          <form onSubmit={handleAdd} className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="md:col-span-2">
              <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2">Nome da Arte</label>
              <input 
                required 
                type="text" 
                value={newEstampa.name} 
                onChange={e => setNewEstampa({...newEstampa, name: e.target.value})}
                className="w-full bg-white/5 border border-white/10 p-3 text-sm focus:outline-none focus:border-[#eab308]" 
                placeholder="EX: CYBER FORCE 001"
              />
            </div>
            <div className="md:col-span-2">
              <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2">Link da Imagem (URL)</label>
              <input 
                required 
                type="text" 
                value={newEstampa.image} 
                onChange={e => setNewEstampa({...newEstampa, image: e.target.value})}
                className="w-full bg-white/5 border border-white/10 p-3 text-sm focus:outline-none focus:border-[#eab308]" 
                placeholder="https://sua-imagem.com/arte.png"
              />
              <p className="text-[9px] text-gray-500 mt-2">Você pode usar links do Imgur, PostImages ou fotos que já estão no seu site.</p>
            </div>
            <div className="md:col-span-2">
              <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2">Descrição Curta</label>
              <input 
                type="text" 
                value={newEstampa.description} 
                onChange={e => setNewEstampa({...newEstampa, description: e.target.value})}
                className="w-full bg-white/5 border border-white/10 p-3 text-sm focus:outline-none focus:border-[#eab308]" 
                placeholder="Breve detalhe sobre a estampa..."
              />
            </div>
            <button
              type="submit"
              disabled={isAdding}
              className="md:col-span-2 bg-[#eab308] text-black font-black py-4 uppercase tracking-[0.2em] text-xs hover:bg-white transition-all flex items-center justify-center gap-2"
            >
              {isAdding ? <Loader2 className="animate-spin" size={18} /> : "Cadastrar Estampa"}
            </button>
          </form>
        </div>

        {/* Lista Atual */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {loading ? (
             <div className="col-span-full flex justify-center py-20">
                <Loader2 className="animate-spin text-[#eab308]" size={32} />
             </div>
          ) : estampas.length > 0 ? (
            estampas.map((estampa) => (
              <div key={estampa.id} className="group bg-black/5 border border-black/10 overflow-hidden relative">
                <div className="aspect-square bg-gray-100 flex items-center justify-center overflow-hidden">
                  {estampa.image ? (
                    <img src={estampa.image} alt={estampa.name} className="w-full h-full object-cover grayscale group-hover:grayscale-0 transition-all duration-500" />
                  ) : (
                    <ImageIcon size={40} className="text-gray-300" />
                  )}
                </div>
                <div className="p-4 bg-white border-t border-black/5">
                  <h3 className="font-black text-xs uppercase tracking-tighter mb-1 truncate">{estampa.name}</h3>
                  <button 
                    onClick={() => handleDelete(estampa.id)}
                    className="mt-2 text-[9px] font-bold text-red-500 uppercase tracking-widest flex items-center gap-1 hover:text-red-700 transition-colors"
                  >
                    <Trash2 size={12} /> Remover
                  </button>
                </div>
              </div>
            ))
          ) : (
            <div className="col-span-full text-center py-20 bg-black/5 border border-black/5 rounded-none">
              <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest">Nenhuma estampa cadastrada ainda.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
