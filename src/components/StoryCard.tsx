import React, { useRef } from 'react';
import { motion } from 'framer-motion';
import { StoryCardData } from '../types/history';
import { MediaSlot } from './MediaSlot';

interface StoryCardProps {
  card: StoryCardData;
  index?: number;
  priority?: boolean;
  showAdminActions?: boolean;
  onEdit?: (card: StoryCardData) => void;
  onDelete?: (id: string) => void;
  onToggleActive?: (card: StoryCardData) => void;
}

const DEFAULT_POSTER = 'https://images.unsplash.com/photo-1521572267360-ee0c2909d518?q=80&w=800&auto=format&fit=crop';

export const StoryCard: React.FC<StoryCardProps> = ({
  card,
  index = 0,
  priority = false,
  showAdminActions = false,
  onEdit,
  onDelete,
  onToggleActive
}) => {
  const containerRef = useRef<HTMLDivElement>(null);

  const mediaUrl = (card.videoUrl && card.videoUrl.trim()) || (card.imageUrl && card.imageUrl.trim()) || DEFAULT_POSTER;
  const posterUrl = (card.imageUrl && card.imageUrl.trim()) || DEFAULT_POSTER;

  return (
    <motion.div
      ref={containerRef}
      initial={{ opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
      transition={{ delay: index * 0.08, duration: 0.4 }}
      className="aspect-[4/5] bg-neutral-900 rounded-2xl md:rounded-3xl overflow-hidden relative shadow-md hover:shadow-2xl transition-all duration-300"
    >
      <MediaSlot
        src={mediaUrl}
        poster={posterUrl}
        priority={priority}
        objectFit="cover"
        className="w-full h-full"
      />

      {showAdminActions && (
        <div className="absolute top-2 right-2 z-20 flex gap-2">
          {onEdit && (
            <button
              onClick={() => onEdit(card)}
              className="bg-black/80 text-white text-[10px] font-bold uppercase px-2.5 py-1.5 rounded hover:bg-[#eab308] hover:text-black transition-colors"
            >
              Editar
            </button>
          )}
          {onDelete && (
            <button
              onClick={() => onDelete(card.id)}
              className="bg-red-600/80 text-white text-[10px] font-bold uppercase px-2 py-1.5 rounded hover:bg-red-600 transition-colors"
            >
              Excluir
            </button>
          )}
        </div>
      )}
    </motion.div>
  );
};
