import React, { useState, useMemo } from 'react';
import { 
  Search, Plus, Filter, Edit3, Copy, Eye, EyeOff, Trash2, 
  ExternalLink, Film, Palette, Image as ImageIcon, Box, Sparkles,
  Layers, CheckCircle2, AlertTriangle, ArrowUpDown, RefreshCw, Archive
} from 'lucide-react';
import { Product } from '../../../types/product';
import { db } from '../../../lib/firebase';
import { doc, deleteDoc, updateDoc, addDoc, collection, serverTimestamp } from 'firebase/firestore';
import toast from 'react-hot-toast';

interface AdminProductsListProps {
  products: Product[];
  onEditProduct: (product: Product) => void;
  onAddNewProduct: () => void;
}

export const AdminProductsList: React.FC<AdminProductsListProps> = ({
  products = [],
  onEditProduct,
  onAddNewProduct
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [collectionFilter, setCollectionFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [mediaFilter, setMediaFilter] = useState('all');

  // Filter Logic
  const filteredProducts = useMemo(() => {
    return products.filter((p) => {
      const matchSearch = 
        (p.name || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
        (p.sku || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
        (p.category || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
        (p.collection || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
        (p.description || '').toLowerCase().includes(searchTerm.toLowerCase());

      const matchCategory = categoryFilter === 'all' || p.category === categoryFilter;
      const matchCollection = collectionFilter === 'all' || p.collection === collectionFilter;
      const matchStatus = statusFilter === 'all' || p.status === statusFilter;

      let matchMedia = true;
      if (mediaFilter === 'no_images') matchMedia = !p.images || p.images.length === 0;
      if (mediaFilter === 'no_videos') matchMedia = !p.videos || p.videos.length === 0;
      if (mediaFilter === 'has_videos') matchMedia = !!p.videos && p.videos.length > 0;
      if (mediaFilter === 'out_of_stock') matchMedia = (p.stock || 0) === 0;
      if (mediaFilter === 'is_new') matchMedia = !!p.isNew;

      return matchSearch && matchCategory && matchCollection && matchStatus && matchMedia;
    });
  }, [products, searchTerm, categoryFilter, collectionFilter, statusFilter, mediaFilter]);

  // Duplicate Product Action
  const handleDuplicateProduct = async (p: Product) => {
    const toastId = toast.loading(`Duplicando produto "${p.name}"...`);
    try {
      const dupData = {
        ...p,
        name: `${p.name} (Cópia)`,
        sku: `${p.sku || 'FPAC'}-COPY-${Math.floor(100 + Math.random() * 900)}`,
        slug: `${p.slug || 'prod'}-copy-${Date.now().toString().substring(8)}`,
        createdAt: serverTimestamp(),
        updatedAt: new Date().toISOString()
      };
      delete (dupData as any).id;

      await addDoc(collection(db, 'products'), dupData);
      toast.success('Produto duplicado com sucesso!', { id: toastId });
    } catch (err) {
      console.error('Error duplicating product:', err);
      toast.error('Erro ao duplicar produto.', { id: toastId });
    }
  };

  // Toggle Visibility / Status
  const handleToggleStatus = async (p: Product) => {
    const newStatus = p.status === 'inactive' ? 'active' : 'inactive';
    try {
      await updateDoc(doc(db, 'products', p.id), { status: newStatus });
      toast.success(`Status alterado para ${newStatus === 'active' ? 'Ativo' : 'Inativo'}.`);
    } catch (err) {
      console.error('Error toggling status:', err);
      toast.error('Erro ao atualizar status.');
    }
  };

  // Delete Action
  const handleDelete = async (p: Product) => {
    if (!window.confirm(`Tem certeza que deseja excluir o produto "${p.name}"?`)) return;
    try {
      await deleteDoc(doc(db, 'products', p.id));
      toast.success('Produto excluído.');
    } catch (err) {
      console.error('Error deleting product:', err);
      toast.error('Erro ao excluir produto.');
    }
  };

  // Copy SKU / Link
  const handleCopy = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    toast.success(`${label} copiado!`);
  };

  return (
    <div className="space-y-6 font-sans text-white">
      {/* TOOLBAR & SEARCH */}
      <div className="bg-black/40 border border-white/10 p-4 rounded-2xl flex flex-col md:flex-row items-center justify-between gap-4">
        {/* Search */}
        <div className="relative w-full md:w-80">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" size={16} />
          <input 
            type="text"
            placeholder="Buscar por nome, SKU, categoria, tag..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 bg-black/60 border border-white/15 text-xs text-white placeholder-gray-500 rounded-xl focus:outline-none focus:border-[#eab308]"
          />
        </div>

        {/* Filters */}
        <div className="flex flex-wrap items-center gap-2 w-full md:w-auto">
          <select
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
            className="px-3 py-2 bg-black/60 border border-white/15 text-xs text-white rounded-xl focus:outline-none focus:border-[#eab308] cursor-pointer"
          >
            <option value="all">Todas as Categorias</option>
            <option value="Camisetas">Camisetas</option>
            <option value="Moletons">Moletons</option>
            <option value="Calças">Calças</option>
            <option value="Acessórios">Acessórios</option>
          </select>

          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="px-3 py-2 bg-black/60 border border-white/15 text-xs text-white rounded-xl focus:outline-none focus:border-[#eab308] cursor-pointer"
          >
            <option value="all">Todos os Status</option>
            <option value="active">Ativos</option>
            <option value="inactive">Inativos</option>
            <option value="draft">Rascunho</option>
          </select>

          <select
            value={mediaFilter}
            onChange={(e) => setMediaFilter(e.target.value)}
            className="px-3 py-2 bg-black/60 border border-white/15 text-xs text-white rounded-xl focus:outline-none focus:border-[#eab308] cursor-pointer"
          >
            <option value="all">Todos os Filtros</option>
            <option value="has_videos">Com Vídeos</option>
            <option value="no_videos">Sem Vídeos</option>
            <option value="no_images">Sem Fotos</option>
            <option value="out_of_stock">Sem Estoque</option>
            <option value="is_new">Lançamentos</option>
          </select>

          {/* New Product Button */}
          <button
            onClick={onAddNewProduct}
            className="bg-[#eab308] text-black font-black uppercase tracking-wider px-5 py-2.5 text-xs hover:bg-white transition-all rounded-xl flex items-center justify-center gap-2 cursor-pointer shadow-lg shadow-[#eab308]/20 shrink-0"
          >
            <Plus size={16} /> Cadastrar Produto
          </button>
        </div>
      </div>

      {/* PRODUCTS TABLE LIST */}
      {filteredProducts.length === 0 ? (
        <div className="bg-black/20 border border-white/10 p-12 text-center rounded-2xl text-gray-400">
          <Box size={36} className="mx-auto mb-2 opacity-30 text-[#eab308]" />
          <p className="text-sm font-bold uppercase tracking-wide">Nenhum produto encontrado.</p>
          <p className="text-xs text-gray-500 mt-1">Tente ajustar seus termos de busca ou filtros.</p>
        </div>
      ) : (
        <div className="bg-[#12121c] border border-white/10 rounded-2xl overflow-hidden shadow-2xl">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs font-sans">
              <thead>
                <tr className="border-b border-white/10 bg-black/40 text-[10px] font-black uppercase tracking-wider text-gray-400">
                  <th className="py-3.5 px-4">Produto</th>
                  <th className="py-3.5 px-4">Preço</th>
                  <th className="py-3.5 px-4">Categorização</th>
                  <th className="py-3.5 px-4">Mídias & Cores</th>
                  <th className="py-3.5 px-4">Estoque Total</th>
                  <th className="py-3.5 px-4">Status</th>
                  <th className="py-3.5 px-4 text-right">Ações Rápida</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/10">
                {filteredProducts.map((p) => {
                  const primaryImg = p.images?.[0] || p.colorVariants?.[0]?.images?.[0] || '/estampas/logo-fpac.png';
                  const colorsCount = (p.colorVariants?.length || p.colors?.length || 0);
                  const mockupsCount = (p.images?.length || 0);
                  const videosCount = (p.videos?.length || 0);

                  return (
                    <tr key={p.id} className="hover:bg-white/5 transition-colors group">
                      {/* Product Thumbnail & Name */}
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-3">
                          <div className="w-12 h-12 rounded-xl bg-black border border-white/10 overflow-hidden shrink-0">
                            <img src={primaryImg} alt={p.name} className="w-full h-full object-cover" />
                          </div>
                          <div>
                            <h4 className="font-bold uppercase text-white group-hover:text-[#eab308] transition-colors line-clamp-1">
                              {p.name}
                            </h4>
                            <div className="flex items-center gap-2 mt-0.5">
                              {p.sku && (
                                <button
                                  onClick={() => handleCopy(p.sku!, 'SKU')}
                                  className="text-[9px] font-mono text-gray-400 hover:text-white flex items-center gap-1"
                                  title="Clique para copiar SKU"
                                >
                                  SKU: {p.sku} <Copy size={10} />
                                </button>
                              )}
                            </div>
                          </div>
                        </div>
                      </td>

                      {/* Pricing */}
                      <td className="py-3 px-4 font-mono font-bold">
                        {p.promotionalPrice ? (
                          <div>
                            <span className="text-emerald-400">R$ {p.promotionalPrice.toFixed(2)}</span>
                            <span className="text-[10px] text-gray-500 line-through block font-normal">
                              R$ {p.price.toFixed(2)}
                            </span>
                          </div>
                        ) : (
                          <span className="text-white">R$ {p.price.toFixed(2)}</span>
                        )}
                      </td>

                      {/* Category & Collection */}
                      <td className="py-3 px-4">
                        <span className="bg-white/5 border border-white/10 text-gray-300 text-[10px] font-semibold px-2 py-0.5 rounded-lg block w-max">
                          {p.category || 'Geral'}
                        </span>
                        {p.collection && (
                          <span className="text-[9px] text-[#eab308] font-bold uppercase tracking-wider block mt-1">
                            {p.collection}
                          </span>
                        )}
                      </td>

                      {/* Media & Color Counters */}
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-2 text-[10px]">
                          <span className="bg-black/60 border border-white/10 px-2 py-0.5 rounded flex items-center gap-1 text-gray-300" title="Cores">
                            <Palette size={10} className="text-[#eab308]" /> {colorsCount}
                          </span>
                          <span className="bg-black/60 border border-white/10 px-2 py-0.5 rounded flex items-center gap-1 text-gray-300" title="Mockups">
                            <ImageIcon size={10} className="text-sky-400" /> {mockupsCount}
                          </span>
                          <span className="bg-black/60 border border-white/10 px-2 py-0.5 rounded flex items-center gap-1 text-gray-300" title="Vídeos">
                            <Film size={10} className="text-purple-400" /> {videosCount}
                          </span>
                        </div>
                      </td>

                      {/* Stock Total */}
                      <td className="py-3 px-4 font-mono">
                        {(p.stock || 0) > 0 ? (
                          <span className="text-emerald-400 font-bold">{p.stock} un.</span>
                        ) : (
                          <span className="text-red-400 font-bold uppercase text-[10px]">Sem Estoque</span>
                        )}
                      </td>

                      {/* Status */}
                      <td className="py-3 px-4">
                        <span className={`text-[9px] font-black uppercase px-2 py-0.5 rounded-full inline-block ${
                          p.status === 'inactive' ? 'bg-red-500/20 text-red-400 border border-red-500/30' : 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                        }`}>
                          {p.status === 'inactive' ? 'Inativo' : 'Ativo'}
                        </span>
                      </td>

                      {/* Quick Actions */}
                      <td className="py-3 px-4 text-right">
                        <div className="flex items-center justify-end gap-1">
                          <button
                            onClick={() => onEditProduct(p)}
                            className="p-1.5 rounded-lg bg-[#eab308]/10 text-[#eab308] hover:bg-[#eab308] hover:text-black transition-colors"
                            title="Editar Produto"
                          >
                            <Edit3 size={14} />
                          </button>

                          <button
                            onClick={() => handleDuplicateProduct(p)}
                            className="p-1.5 rounded-lg bg-white/5 text-gray-300 hover:bg-white/20 hover:text-white transition-colors"
                            title="Duplicar Produto"
                          >
                            <Copy size={14} />
                          </button>

                          <button
                            onClick={() => handleToggleStatus(p)}
                            className="p-1.5 rounded-lg bg-white/5 text-gray-300 hover:bg-white/20 transition-colors"
                            title={p.status === 'inactive' ? 'Ativar' : 'Ocultar'}
                          >
                            {p.status === 'inactive' ? <EyeOff size={14} className="text-red-400" /> : <Eye size={14} className="text-emerald-400" />}
                          </button>

                          <button
                            onClick={() => handleDelete(p)}
                            className="p-1.5 rounded-lg bg-red-500/10 text-red-400 hover:bg-red-500 hover:text-white transition-colors"
                            title="Excluir Produto"
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};
