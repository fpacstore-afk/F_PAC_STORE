import { StampCategory } from '../constants/stampCategories';

export interface DesignHistoryLog {
  date: string;
  author: string;
  action: string;
  details?: string;
}

export interface Design {
  id: string;
  code: string; // Internal code e.g. "EST-001"
  name: string; // e.g. "Anarchy & Order"
  category: StampCategory | string; // Official F PAC categories: "🖋️ Tipografia", "🦅 Logos & Branding", "🏀 Esportes", "🏎️ Automotivo", "🪖 Militar", "🏆 Exclusivas"
  collection: string; // Campo legado de linha editorial; não limita os produtos compatíveis
  compatibleProducts?: string[]; // Tipos de produto em que a estampa pode ser aplicada; "Todos os produtos" libera para todo o catálogo
  theme?: string; // e.g. "Streetwear", "Cyber", "Underground"
  tags: string[]; // e.g. ["typography", "anarchy", "black"]
  description?: string;
  
  // File assets
  pngUrl: string; // Transparent PNG for 3D/2D customizer overlay
  svgUrl?: string; // Vector file URL
  mockupUrl: string; // Mockup preview on garment/t-shirt
  thumbnailUrl: string; // Small thumbnail
  masterFileUrl?: string; // High-res production master file
  videoUrl?: string; // Video demonstrativo da estampa / aplicação

  // Visuals & Attribution
  dominantColors?: string[]; // e.g. ["#000000", "#eab308"]
  colorVariants?: { name: string; hex: string; pngUrl?: string; mockupUrl?: string }[];
  author: string; // e.g. "F PAC Creative Lab"
  status: 'active' | 'archived' | 'draft' | 'unavailable';
  availableForCustomization: boolean; // Disponível na galeria e no PRIME
  readyToShip: boolean; // Possui opção organizada como pronta entrega
  displayOrder: number; // Ordem comercial no catálogo público
  availableSizes?: string[]; // Até cinco dimensões comerciais da estampa
  
  // Metadata
  createdAt?: any;
  updatedAt?: any;
  history?: DesignHistoryLog[];
}
