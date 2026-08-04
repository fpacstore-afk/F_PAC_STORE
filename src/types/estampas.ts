export interface VideoData {
  url: string;
  isCloudinary: boolean;
  isValid: boolean;
}

export type MediaType = 'image' | 'video';

export interface RichVideoDetails {
  url: string;
  publicId: string;
  duration?: number;
  format?: string;
  width?: number;
  height?: number;
  bytes?: number;
  uploadedAt: string;
}

export interface EstampaVideo {
  id: string;
  url: string;
  title?: string;
  publicId?: string;
  duration?: number;
  format?: string;
  width?: number;
  height?: number;
  bytes?: number;
  order: number;
  status?: 'active' | 'inactive';
  category?: string;
  createdAt: string;
}

export interface Estampa {
  id: string;
  name: string;
  description?: string;
  path?: string;
  image?: string;
  imageUrl?: string;
  video?: string | RichVideoDetails;
  videoUrl?: string;
  videos?: EstampaVideo[];
  cloudinaryPublicId?: string;
  slotIndex?: number;
  position?: string;
  width?: string;
  height?: string;
  allowedLocations?: string[];
  locationConfigs?: any;
}

export interface CatalogItem {
  estampa: Estampa;
  isHighlight: boolean;
  index: number;
}

