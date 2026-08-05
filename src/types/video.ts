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
  description?: string;
  mediaType?: MediaType;
  publicId?: string;
  duration?: number;
  format?: string;
  width?: number;
  height?: number;
  bytes?: number;
  uploadedAt?: string;
  createdAt?: any;
  stampId?: string;
  stampName?: string;
  active?: boolean;
  order?: number;
  status?: string;
}

export interface Estampa {
  id: string;
  name: string;
  imageUrl?: string;
  path?: string;
  image?: string;
  category?: string;
  available?: boolean;
  slotIndex?: number;
  description?: string;
  mediaType?: MediaType;
  videos?: EstampaVideo[];
  position?: string;
  allowedLocations?: string[];
  locationConfigs?: Record<string, any>;
}
