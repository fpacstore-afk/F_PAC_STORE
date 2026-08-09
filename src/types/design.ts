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
  collection: string; // e.g. "MARK", "FORCE", "PRIME", "ACERVO"
  theme?: string; // e.g. "Streetwear", "Cyber", "Underground"
  tags: string[]; // e.g. ["typography", "anarchy", "black"]
  description?: string;
  
  // File assets
  pngUrl: string; // Transparent PNG for 3D/2D customizer overlay
  svgUrl?: string; // Vector file URL
  mockupUrl: string; // Mockup preview on garment/t-shirt
  thumbnailUrl: string; // Small thumbnail
  masterFileUrl?: string; // High-res production master file

  // Visuals & Attribution
  dominantColors?: string[]; // e.g. ["#000000", "#eab308"]
  colorVariants?: { name: string; hex: string; pngUrl?: string; mockupUrl?: string }[];
  author: string; // e.g. "F PAC Creative Lab"
  status: 'active' | 'archived' | 'draft';
  
  // Metadata
  createdAt?: any;
  updatedAt?: any;
  history?: DesignHistoryLog[];
}
