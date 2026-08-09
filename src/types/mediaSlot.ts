export type MediaType = 'image' | 'video';
export type MediaObjectFit = 'cover' | 'contain';

export interface MediaSlotConfig {
  id: string;
  name: string;
  type: MediaType;
  url: string;
  posterUrl?: string;
  objectFit?: MediaObjectFit;
  active: boolean;
  order?: number;
  updatedAt?: string;
}

export interface SiteMediaConfig {
  heroSlot?: MediaSlotConfig;
  logoSlot?: MediaSlotConfig;
  aboutSlot?: MediaSlotConfig;
  catalogSlot1?: MediaSlotConfig;
  catalogSlot2?: MediaSlotConfig;
  communitySlots?: MediaSlotConfig[];
}
