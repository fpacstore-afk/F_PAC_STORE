import React, { useState } from 'react';
import { Star, ShieldCheck, Plus, Trash2, X, MessageCircle } from 'lucide-react';
import toast from 'react-hot-toast';

interface ProductReviewsProps {
  product: any;
  reviews: any[];
  defaultReviews: any[];
  deletedDefaultIds: string[];
  canDeleteReview: (review: any) => boolean;
  handleDeleteReview: (reviewId: string) => void;
  showReviewForm: boolean;
  setShowReviewForm: (show: boolean) => void;
  reviewName: string;
  setReviewName: (val: string) => void;
  reviewRating: number;
  setReviewRating: (val: number) => void;
  reviewComment: string;
  setReviewComment: (val: string) => void;
  reviewSize: string;
  setReviewSize: (val: string) => void;
  reviewStyle: string;
  setReviewStyle: (val: string) => void;
  submittingReview: boolean;
  handleReviewSubmit: (e: React.FormEvent) => void;
}

export const ProductReviews: React.FC<ProductReviewsProps> = ({
  reviews,
  defaultReviews,
  deletedDefaultIds,
  canDeleteReview,
  handleDeleteReview,
  showReviewForm,
  setShowReviewForm,
  reviewName,
  setReviewName,
  reviewRating,
  setReviewRating,
  reviewComment,
  setReviewComment,
  reviewSize,
  setReviewSize,
  reviewStyle,
  setReviewStyle,
  submittingReview,
  handleReviewSubmit
}) => {
  const visibleDefaultReviews = defaultReviews.filter(r => !deletedDefaultIds.includes(r.id));
  const combinedReviews = [...reviews, ...visibleDefaultReviews];

  const averageRating = combinedReviews.length > 0 
    ? (combinedReviews.reduce((sum, r) => sum + (r.rating || 5), 0) / combinedReviews.length).toFixed(1)
    : '5.0';

  return (
    <div className="mt-16 pt-12 border-t border-black/10">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="text-2xl font-black">{averageRating}</span>
            <div className="flex text-[#eab308]">
              {[...Array(5)].map((_, i) => (
                <Star key={i} size={16} fill="currentColor" />
              ))}
            </div>
            <span className="text-xs text-gray-500 font-mono">({combinedReviews.length} avaliações)</span>
          </div>
          <h2 className="text-xl font-black uppercase tracking-tight">Avaliações dos Clientes</h2>
        </div>

        <button
          onClick={() => setShowReviewForm(!showReviewForm)}
          className="bg-black text-[#eab308] hover:bg-[#eab308] hover:text-black transition-all px-4 py-2.5 text-[10px] font-black uppercase tracking-wider flex items-center gap-2 cursor-pointer w-fit"
        >
          {showReviewForm ? <X size={14} /> : <Plus size={14} />}
          {showReviewForm ? 'Cancelar Avaliação' : 'Escrever Avaliação'}
        </button>
      </div>

      {showReviewForm && (
        <form onSubmit={handleReviewSubmit} className="bg-gray-50 border border-black/10 p-6 mb-8 space-y-4 max-w-xl">
          <h3 className="text-xs font-black uppercase tracking-wider">Enviar Depoimento</h3>
          <div>
            <label className="block text-[10px] font-bold uppercase mb-1">Seu Nome</label>
            <input
              type="text"
              required
              value={reviewName}
              onChange={e => setReviewName(e.target.value)}
              placeholder="Ex: Gabriel M."
              className="w-full bg-white border border-black/10 p-2 text-xs focus:border-[#eab308] outline-none"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[10px] font-bold uppercase mb-1">Tamanho Usado</label>
              <input
                type="text"
                value={reviewSize}
                onChange={e => setReviewSize(e.target.value)}
                placeholder="Ex: G"
                className="w-full bg-white border border-black/10 p-2 text-xs focus:border-[#eab308] outline-none"
              />
            </div>
            <div>
              <label className="block text-[10px] font-bold uppercase mb-1">Estilo Preferido</label>
              <input
                type="text"
                value={reviewStyle}
                onChange={e => setReviewStyle(e.target.value)}
                placeholder="Ex: Oversized / Street"
                className="w-full bg-white border border-black/10 p-2 text-xs focus:border-[#eab308] outline-none"
              />
            </div>
          </div>

          <div>
            <label className="block text-[10px] font-bold uppercase mb-1">Nota (1 a 5 estrelas)</label>
            <select
              value={reviewRating}
              onChange={e => setReviewRating(Number(e.target.value))}
              className="w-full bg-white border border-black/10 p-2 text-xs focus:border-[#eab308] outline-none"
            >
              <option value={5}>⭐⭐⭐⭐⭐ (5/5 - Excelente)</option>
              <option value={4}>⭐⭐⭐⭐ (4/5 - Muito Bom)</option>
              <option value={3}>⭐⭐⭐ (3/5 - Regular)</option>
              <option value={2}>⭐⭐ (2/5 - Ruim)</option>
              <option value={1}>⭐ (1/5 - Péssimo)</option>
            </select>
          </div>

          <div>
            <label className="block text-[10px] font-bold uppercase mb-1">Seu Comentário</label>
            <textarea
              required
              rows={3}
              value={reviewComment}
              onChange={e => setReviewComment(e.target.value)}
              placeholder="Conte o que achou da qualidade da peça, caimento e entrega..."
              className="w-full bg-white border border-black/10 p-2 text-xs focus:border-[#eab308] outline-none"
            />
          </div>

          <button
            type="submit"
            disabled={submittingReview}
            className="w-full bg-[#eab308] text-black hover:bg-black hover:text-white transition-all py-3 text-[10px] font-black uppercase tracking-wider cursor-pointer"
          >
            {submittingReview ? 'Enviando...' : 'Publicar Avaliação'}
          </button>
        </form>
      )}

      {/* Reviews List Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {combinedReviews.map(rev => (
          <div key={rev.id} className="bg-white border border-black/10 p-4 space-y-2 relative group">
            {canDeleteReview(rev) && (
              <button
                onClick={() => handleDeleteReview(rev.id)}
                className="absolute top-3 right-3 text-red-500 opacity-0 group-hover:opacity-100 transition-opacity p-1 hover:bg-red-50 rounded"
                title="Excluir Avaliação"
              >
                <Trash2 size={14} />
              </button>
            )}

            <div className="flex items-center gap-1 text-[#eab308]">
              {[...Array(rev.rating || 5)].map((_, i) => (
                <Star key={i} size={12} fill="currentColor" />
              ))}
            </div>

            <p className="text-xs text-gray-700 italic leading-relaxed">"{rev.comment}"</p>

            <div className="pt-2 border-t border-gray-100 flex items-center justify-between text-[10px]">
              <div>
                <span className="font-black text-black block">{rev.name}</span>
                {rev.styleInfo && <span className="text-gray-400 font-mono">{rev.styleInfo}</span>}
              </div>
              {rev.verified !== false && (
                <span className="flex items-center gap-1 text-emerald-600 font-bold text-[9px] bg-emerald-50 px-1.5 py-0.5 rounded">
                  <ShieldCheck size={10} /> Compra Verificada
                </span>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
