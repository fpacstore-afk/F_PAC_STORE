export interface StoryCardData {
  id: string;
  title?: string;
  description?: string;
  videoUrl?: string;
  imageUrl?: string;
  instagramUrl?: string;
  author?: string;
  order: number;
  active: boolean;
  featured?: boolean;
  createdAt?: string;
  updatedAt?: string;
}
