import React, { useState, useEffect, useMemo, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useNavigate, useLocation } from 'react-router-dom';
import { 
  Flame, Activity, Smile, Shield, Minimize2, Crown, 
  Briefcase, Music, Clock, Sparkles, Eye, Sun, 
  ShieldAlert, Filter, Compass, TreePine, Maximize2, 
  Type, Square, Award, Heart, Key, Tag, 
  Layers, UserCheck, HeartHandshake, Anchor, XSquare, 
  Expand, Menu, Maximize, MessageSquare, Star, User, HelpCircle,
  X, ChevronRight, ChevronLeft, RefreshCw, Check, Copy, Share2, Play, Volume2, VolumeX, AlertCircle, Instagram
} from 'lucide-react';
import { cn } from '../lib/utils';
import { safeStorage } from '../lib/storage';
import { db } from '../lib/firebase';
import { doc, setDoc, serverTimestamp } from 'firebase/firestore';
import { products as staticProducts, Product } from '../data/products';
import { useMusicPlayer } from '../hooks/useMusicPlayer';

// Sound synthesis helper using standard Web Audio API
function playSelectSound() {
  try {
    const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
    const osc = audioCtx.createOscillator();
    const gainNode = audioCtx.createGain();
    
    osc.type = 'sine';
    // Elegant tech-pluck sound
    osc.frequency.setValueAtTime(587.33, audioCtx.currentTime); // D5
    osc.frequency.exponentialRampToValueAtTime(1174.66, audioCtx.currentTime + 0.1); // D6
    
    gainNode.gain.setValueAtTime(0.06, audioCtx.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime + 0.25);
    
    osc.connect(gainNode);
    gainNode.connect(audioCtx.destination);
    
    osc.start();
    osc.stop(audioCtx.currentTime + 0.25);
  } catch (e) {
    console.debug('Audio context not allowed or blocked by browser policies.', e);
  }
}

const iconMap: Record<string, any> = {
  Flame, Activity, Smile, Shield, Minimize2, Crown, 
  Briefcase, Music, Clock, Sparkles, Eye, Sun, 
  ShieldAlert, Filter, Compass, TreePine, Maximize2, 
  Type, Square, Award, Heart, Key, Tag, 
  Layers, UserCheck, HeartHandshake, Anchor, XSquare, 
  Expand, Menu, Maximize, MessageSquare, Star, User, HelpCircle
};

export function LucideIcon({ name, className, size = 20 }: { name: string; className?: string; size?: number }) {
  const IconComponent = iconMap[name] || HelpCircle;
  return <IconComponent className={className} size={size} />;
}

export type StyleType = 'force' | 'mark' | 'prime';

export interface QuestionOption {
  id: string;
  text: string;
  emoji: string;
  iconName: string;
  scores: {
    collections: { force: number; mark: number; prime: number };
    profiles: {
      lobo: number;
      street_king: number;
      black_force: number;
      alpha: number;
      minimal: number;
      elite: number;
    }
  };
}

export interface Question {
  id: number;
  title: string;
  options: QuestionOption[];
}

export const QUESTIONS: Question[] = [
  {
    id: 1,
    title: 'Como você define seu estilo?',
    options: [
      {
        id: 'streetwear',
        text: 'Streetwear',
        emoji: '👟',
        iconName: 'Flame',
        scores: {
          collections: { force: 1, mark: 3, prime: 0 },
          profiles: { lobo: 1, street_king: 3, black_force: 0, alpha: 2, minimal: 0, elite: 0 }
        }
      },
      {
        id: 'esportivo',
        text: 'Esportivo',
        emoji: '⚡',
        iconName: 'Activity',
        scores: {
          collections: { force: 3, mark: 1, prime: 1 },
          profiles: { lobo: 2, street_king: 1, black_force: 2, alpha: 2, minimal: 0, elite: 0 }
        }
      },
      {
        id: 'casual',
        text: 'Casual',
        emoji: '🌿',
        iconName: 'Smile',
        scores: {
          collections: { force: 0, mark: 1, prime: 3 },
          profiles: { lobo: 1, street_king: 0, black_force: 0, alpha: 1, minimal: 2, elite: 2 }
        }
      },
      {
        id: 'militar',
        text: 'Militar',
        emoji: '🎖️',
        iconName: 'Shield',
        scores: {
          collections: { force: 3, mark: 1, prime: 0 },
          profiles: { lobo: 2, street_king: 0, black_force: 3, alpha: 2, minimal: 0, elite: 0 }
        }
      },
      {
        id: 'minimalista',
        text: 'Minimalista',
        emoji: '◼️',
        iconName: 'Minimize2',
        scores: {
          collections: { force: 1, mark: 0, prime: 3 },
          profiles: { lobo: 2, street_king: 0, black_force: 0, alpha: 1, minimal: 3, elite: 1 }
        }
      },
      {
        id: 'elegante',
        text: 'Elegante',
        emoji: '⚜️',
        iconName: 'Crown',
        scores: {
          collections: { force: 1, mark: 0, prime: 3 },
          profiles: { lobo: 0, street_king: 0, black_force: 0, alpha: 1, minimal: 1, elite: 3 }
        }
      }
    ]
  },
  {
    id: 2,
    title: 'Onde você mais usa suas camisetas?',
    options: [
      {
        id: 'academia',
        text: 'Academia',
        emoji: '💪',
        iconName: 'Activity',
        scores: {
          collections: { force: 3, mark: 0, prime: 1 },
          profiles: { lobo: 1, street_king: 0, black_force: 3, alpha: 2, minimal: 0, elite: 0 }
        }
      },
      {
        id: 'trabalho',
        text: 'Trabalho',
        emoji: '💼',
        iconName: 'Briefcase',
        scores: {
          collections: { force: 0, mark: 0, prime: 3 },
          profiles: { lobo: 1, street_king: 0, black_force: 0, alpha: 1, minimal: 2, elite: 3 }
        }
      },
      {
        id: 'roles',
        text: 'Rolês',
        emoji: '🌃',
        iconName: 'Music',
        scores: {
          collections: { force: 1, mark: 3, prime: 0 },
          profiles: { lobo: 1, street_king: 3, black_force: 1, alpha: 2, minimal: 0, elite: 1 }
        }
      },
      {
        id: 'dia_a_dia',
        text: 'Dia a dia',
        emoji: '👕',
        iconName: 'Clock',
        scores: {
          collections: { force: 1, mark: 1, prime: 2 },
          profiles: { lobo: 2, street_king: 1, black_force: 1, alpha: 1, minimal: 2, elite: 1 }
        }
      },
      {
        id: 'eventos',
        text: 'Eventos',
        emoji: '🍾',
        iconName: 'Sparkles',
        scores: {
          collections: { force: 1, mark: 2, prime: 3 },
          profiles: { lobo: 0, street_king: 2, black_force: 0, alpha: 2, minimal: 1, elite: 3 }
        }
      }
    ]
  },
  {
    id: 3,
    title: 'Qual cor você mais usa?',
    options: [
      {
        id: 'preto',
        text: 'Preto',
        emoji: '⚫',
        iconName: 'Eye',
        scores: {
          collections: { force: 2, mark: 2, prime: 2 },
          profiles: { lobo: 3, street_king: 2, black_force: 3, alpha: 2, minimal: 2, elite: 2 }
        }
      },
      {
        id: 'branco',
        text: 'Branco',
        emoji: '⚪',
        iconName: 'Sun',
        scores: {
          collections: { force: 1, mark: 2, prime: 3 },
          profiles: { lobo: 1, street_king: 2, black_force: 1, alpha: 1, minimal: 3, elite: 2 }
        }
      },
      {
        id: 'verde_militar',
        text: 'Verde Militar',
        emoji: '🌲',
        iconName: 'ShieldAlert',
        scores: {
          collections: { force: 3, mark: 1, prime: 0 },
          profiles: { lobo: 2, street_king: 0, black_force: 3, alpha: 2, minimal: 1, elite: 0 }
        }
      },
      {
        id: 'off_white',
        text: 'Off White',
        emoji: '🍦',
        iconName: 'Filter',
        scores: {
          collections: { force: 1, mark: 3, prime: 2 },
          profiles: { lobo: 1, street_king: 3, black_force: 0, alpha: 2, minimal: 2, elite: 2 }
        }
      },
      {
        id: 'azul_marinho',
        text: 'Azul Marinho',
        emoji: '🔵',
        iconName: 'Compass',
        scores: {
          collections: { force: 1, mark: 1, prime: 3 },
          profiles: { lobo: 1, street_king: 0, black_force: 1, alpha: 2, minimal: 2, elite: 3 }
        }
      },
      {
        id: 'marrom',
        text: 'Marrom',
        emoji: '🪵',
        iconName: 'TreePine',
        scores: {
          collections: { force: 1, mark: 3, prime: 1 },
          profiles: { lobo: 2, street_king: 2, black_force: 1, alpha: 1, minimal: 1, elite: 1 }
        }
      }
    ]
  },
  {
    id: 4,
    title: 'Você prefere?',
    options: [
      {
        id: 'estampas_grandes',
        text: 'Estampas grandes',
        emoji: '🖼️',
        iconName: 'Maximize2',
        scores: {
          collections: { force: 2, mark: 3, prime: 0 },
          profiles: { lobo: 0, street_king: 3, black_force: 2, alpha: 3, minimal: 0, elite: 0 }
        }
      },
      {
        id: 'estampas_discretas',
        text: 'Estampas discretas',
        emoji: '🔍',
        iconName: 'Minimize2',
        scores: {
          collections: { force: 2, mark: 1, prime: 3 },
          profiles: { lobo: 3, street_king: 0, black_force: 1, alpha: 1, minimal: 2, elite: 3 }
        }
      },
      {
        id: 'com_texto',
        text: 'Com texto',
        emoji: '✍️',
        iconName: 'Type',
        scores: {
          collections: { force: 3, mark: 1, prime: 1 },
          profiles: { lobo: 1, street_king: 2, black_force: 2, alpha: 2, minimal: 1, elite: 1 }
        }
      },
      {
        id: 'sem_estampa',
        text: 'Sem estampa',
        emoji: '📭',
        iconName: 'Square',
        scores: {
          collections: { force: 0, mark: 0, prime: 3 },
          profiles: { lobo: 2, street_king: 0, black_force: 0, alpha: 1, minimal: 3, elite: 2 }
        }
      }
    ]
  },
  {
    id: 5,
    title: 'O que é mais importante?',
    options: [
      {
        id: 'qualidade',
        text: 'Qualidade',
        emoji: '💎',
        iconName: 'Award',
        scores: {
          collections: { force: 2, mark: 2, prime: 3 },
          profiles: { lobo: 1, street_king: 1, black_force: 1, alpha: 2, minimal: 2, elite: 3 }
        }
      },
      {
        id: 'conforto',
        text: 'Conforto',
        emoji: '☁️',
        iconName: 'Heart',
        scores: {
          collections: { force: 1, mark: 2, prime: 3 },
          profiles: { lobo: 2, street_king: 2, black_force: 1, alpha: 1, minimal: 3, elite: 2 }
        }
      },
      {
        id: 'exclusividade',
        text: 'Exclusividade',
        emoji: '🔑',
        iconName: 'Key',
        scores: {
          collections: { force: 2, mark: 3, prime: 1 },
          profiles: { lobo: 3, street_king: 3, black_force: 1, alpha: 2, minimal: 0, elite: 2 }
        }
      },
      {
        id: 'estilo',
        text: 'Estilo',
        emoji: '⚡',
        iconName: 'Zap',
        scores: {
          collections: { force: 2, mark: 3, prime: 1 },
          profiles: { lobo: 1, street_king: 3, black_force: 2, alpha: 3, minimal: 1, elite: 1 }
        }
      },
      {
        id: 'preco',
        text: 'Preço',
        emoji: '🏷️',
        iconName: 'Tag',
        scores: {
          collections: { force: 2, mark: 2, prime: 2 },
          profiles: { lobo: 1, street_king: 1, black_force: 1, alpha: 1, minimal: 2, elite: 1 }
        }
      }
    ]
  },
  {
    id: 6,
    title: 'Qual local prefere a estampa?',
    options: [
      {
        id: 'centro_peito',
        text: 'Centro do peito',
        emoji: '👕',
        iconName: 'Layers',
        scores: {
          collections: { force: 3, mark: 2, prime: 1 },
          profiles: { lobo: 1, street_king: 2, black_force: 2, alpha: 3, minimal: 1, elite: 1 }
        }
      },
      {
        id: 'costas',
        text: 'Costas',
        emoji: '🛡️',
        iconName: 'UserCheck',
        scores: {
          collections: { force: 2, mark: 3, prime: 0 },
          profiles: { lobo: 1, street_king: 3, black_force: 2, alpha: 2, minimal: 0, elite: 0 }
        }
      },
      {
        id: 'peito_esquerdo',
        text: 'Peito esquerdo',
        emoji: '❤️',
        iconName: 'HeartHandshake',
        scores: {
          collections: { force: 2, mark: 1, prime: 3 },
          profiles: { lobo: 2, street_king: 0, black_force: 1, alpha: 1, minimal: 2, elite: 3 }
        }
      },
      {
        id: 'manga',
        text: 'Manga',
        emoji: '🦾',
        iconName: 'Anchor',
        scores: {
          collections: { force: 2, mark: 2, prime: 1 },
          profiles: { lobo: 2, street_king: 1, black_force: 2, alpha: 2, minimal: 1, elite: 1 }
        }
      },
      {
        id: 'sem_estampas',
        text: 'Sem estampas',
        emoji: '⏹️',
        iconName: 'X',
        scores: {
          collections: { force: 0, mark: 0, prime: 3 },
          profiles: { lobo: 2, street_king: 0, black_force: 0, alpha: 1, minimal: 3, elite: 2 }
        }
      }
    ]
  },
  {
    id: 7,
    title: 'Como você gosta do caimento?',
    options: [
      {
        id: 'oversized',
        text: 'Oversized',
        emoji: '🧥',
        iconName: 'Expand',
        scores: {
          collections: { force: 2, mark: 3, prime: 1 },
          profiles: { lobo: 1, street_king: 3, black_force: 1, alpha: 3, minimal: 1, elite: 1 }
        }
      },
      {
        id: 'tradicional',
        text: 'Tradicional',
        emoji: '👔',
        iconName: 'Menu',
        scores: {
          collections: { force: 1, mark: 0, prime: 3 },
          profiles: { lobo: 2, street_king: 0, black_force: 1, alpha: 1, minimal: 2, elite: 3 }
        }
      },
      {
        id: 'largo',
        text: 'Largo',
        emoji: '🛹',
        iconName: 'Maximize',
        scores: {
          collections: { force: 1, mark: 3, prime: 1 },
          profiles: { lobo: 2, street_king: 3, black_force: 1, alpha: 2, minimal: 1, elite: 1 }
        }
      },
      {
        id: 'ajustado',
        text: 'Ajustado',
        emoji: '🦾',
        iconName: 'Activity',
        scores: {
          collections: { force: 3, mark: 0, prime: 1 },
          profiles: { lobo: 1, street_king: 0, black_force: 3, alpha: 2, minimal: 1, elite: 1 }
        }
      }
    ]
  },
  {
    id: 8,
    title: 'Qual frase mais combina com você?',
    options: [
      {
        id: 'não_sigo_tendencias',
        text: 'Não sigo tendências.',
        emoji: '🦅',
        iconName: 'Compass',
        scores: {
          collections: { force: 2, mark: 2, prime: 1 },
          profiles: { lobo: 3, street_king: 2, black_force: 2, alpha: 2, minimal: 1, elite: 1 }
        }
      },
      {
        id: 'gosto_de_exclusividade',
        text: 'Gosto de exclusividade.',
        emoji: '💎',
        iconName: 'Star',
        scores: {
          collections: { force: 2, mark: 3, prime: 2 },
          profiles: { lobo: 2, street_king: 3, black_force: 1, alpha: 2, minimal: 1, elite: 3 }
        }
      },
      {
        id: 'meu_estilo_fala_por_mim',
        text: 'Meu estilo fala por mim.',
        emoji: '🔥',
        iconName: 'MessageSquare',
        scores: {
          collections: { force: 2, mark: 3, prime: 1 },
          profiles: { lobo: 2, street_king: 3, black_force: 2, alpha: 3, minimal: 1, elite: 1 }
        }
      },
      {
        id: 'menos_aparencia_mais_qualidade',
        text: 'Menos aparência. Mais qualidade.',
        emoji: '🛡️',
        iconName: 'Shield',
        scores: {
          collections: { force: 1, mark: 0, prime: 3 },
          profiles: { lobo: 2, street_king: 0, black_force: 1, alpha: 1, minimal: 3, elite: 2 }
        }
      },
      {
        id: 'nao_e_so_roupa_e_identidade',
        text: 'Não é só roupa. É identidade.',
        emoji: '⚜️',
        iconName: 'Crown',
        scores: {
          collections: { force: 2, mark: 2, prime: 2 },
          profiles: { lobo: 2, street_king: 2, black_force: 2, alpha: 2, minimal: 2, elite: 2 }
        }
      }
    ]
  }
];

export interface ProfileDetails {
  id: string;
  name: string;
  emoji: string;
  title: string;
  description: string;
  badge: {
    name: string;
    icon: string;
    emoji: string;
  };
  recommendedCollection: 'force' | 'mark' | 'prime';
  aiText: string;
}

export const PROFILES: Record<string, ProfileDetails> = {
  lobo: {
    id: 'lobo',
    name: 'Lobo',
    emoji: '🐺',
    title: '🐺 Lobo',
    description: 'Você não segue a multidão. Prefere fazer seu próprio caminho, mantendo discrição, confiança e presença. Seu estilo transmite independência e personalidade. Ideal para quem gosta de: peças discretas, tons escuros e atitude.',
    badge: {
      name: 'Lobo Solitário',
      icon: 'User',
      emoji: '🐺'
    },
    recommendedCollection: 'force',
    aiText: 'Com base nas suas escolhas, percebemos que você valoriza a independência, mantendo um estilo sóbrio com presença marcante. A discrição e atitude da linha FORCE combinam perfeitamente com seu perfil tático e focado.'
  },
  street_king: {
    id: 'street_king',
    name: 'Street King',
    emoji: '👑',
    title: '👑 Street King',
    description: 'A rua é seu território. Você gosta de chamar atenção pelo estilo, não pelo exagero. Cada peça faz parte da sua identidade. Ideal para quem vive o streetwear e a cultura urbana.',
    badge: {
      name: 'Street Master',
      icon: 'Flame',
      emoji: '🔥'
    },
    recommendedCollection: 'mark',
    aiText: 'Com base nas suas escolhas, percebemos que você é guiado pela cultura streetwear e pela expressão urbana autêntica. As estampas conceituais e artes ousadas da linha MARK combinam de forma espetacular com sua presença urbana.'
  },
  black_force: {
    id: 'black_force',
    name: 'Black Force',
    emoji: '⚫',
    title: '⚫ Black Force',
    description: 'Inspirado na disciplina, resistência e força. Seu estilo transmite respeito, presença e confiança. Ideal para quem prefere visual militar, tático e robusto.',
    badge: {
      name: 'Estilo Militar',
      icon: 'Shield',
      emoji: '🏆'
    },
    recommendedCollection: 'force',
    aiText: 'Com base nas suas escolhas, percebemos que você valoriza a força física e mental, a robustez e a estrutura de alto nível. O caimento encorpado e a gramatura pesada da linha FORCE se alinham idealmente ao seu estilo de vida implacável.'
  },
  alpha: {
    id: 'alpha',
    name: 'Alpha',
    emoji: '🦅',
    title: '🦅 Alpha',
    description: 'Você lidera naturalmente. Não precisa provar nada para ninguém. Seu estilo demonstra confiança e determinação. Ideal para quem busca presença marcante.',
    badge: {
      name: 'Street Master',
      icon: 'Zap',
      emoji: '🔥'
    },
    recommendedCollection: 'mark',
    aiText: 'Com base nas suas escolhas, percebemos que sua presença inspira liderança e autenticidade. Seu estilo une sofisticação visual e energia contagiante. O design assertivo da linha MARK é a expressão definitiva da sua postura Alpha.'
  },
  minimal: {
    id: 'minimal',
    name: 'Minimal',
    emoji: '◼️',
    title: '◼ Minimal',
    description: 'Menos é mais. Você acredita que simplicidade também chama atenção quando bem executada. Ideal para quem prefere um visual limpo e moderno.',
    badge: {
      name: 'Lobo Solitário',
      icon: 'Minimize2',
      emoji: '🐺'
    },
    recommendedCollection: 'prime',
    aiText: 'Com base nas suas escolhas, percebemos que você valoriza o minimalismo sofisticado, onde cada detalhe sutil e acabamento perfeito comunicam sua identidade sem ruídos. O corte clássico e customizável da linha PRIME é ideal para você.'
  },
  elite: {
    id: 'elite',
    name: 'Elite',
    emoji: '⚜️',
    title: '⚜ Elite',
    description: 'Elegância sem exageros. Você prefere qualidade, acabamento premium e peças que passam sofisticação. Ideal para quem gosta de um visual refinado.',
    badge: {
      name: 'Elite',
      icon: 'Crown',
      emoji: '👑'
    },
    recommendedCollection: 'prime',
    aiText: 'Com base nas suas escolhas, percebemos que você tem um olhar apurado para a excelência e acabamentos impecáveis. Peças que vestem bem em qualquer contexto premium. A malha nobre e a personalização da linha PRIME foram feitas para seu padrão elevado.'
  }
};

interface StyleQuizProps {
  forceOpen?: boolean;
  onClose?: () => void;
}

export function StyleQuiz({ forceOpen = false, onClose }: StyleQuizProps = {}) {
  const navigate = useNavigate();
  const location = useLocation();

  const { currentTrack, isPlaying, togglePlay, playTrack, filteredTracks } = useMusicPlayer();

  const startRadioDuringQuiz = () => {
    if (!isPlaying) {
      if (currentTrack) {
        togglePlay();
      } else if (filteredTracks && filteredTracks.length > 0) {
        playTrack(filteredTracks[0]);
      }
    }
  };

  // Primary States
  const [isOpen, setIsOpen] = useState(false);
  const [currentStep, setCurrentStep] = useState<number>(0); // 0 = start splash, 1-8 = Q1-Q8, 9 = Lead, 10 = Loading, 11 = Result
  const [answers, setAnswers] = useState<Record<number, string>>({});
  const [hasSound, setHasSound] = useState(true);

  // Lead capture states
  const [leadName, setLeadName] = useState('');
  const [leadEmail, setLeadEmail] = useState('');
  const [leadWhatsapp, setLeadWhatsapp] = useState('');
  const [optIn, setOptIn] = useState(true);
  const [leadError, setLeadError] = useState('');

  // Loaded/Computed results
  const [finalProfile, setFinalProfile] = useState<ProfileDetails | null>(null);
  const [finalScores, setFinalScores] = useState({ force: 0, mark: 0, prime: 0 });
  const [startTime, setStartTime] = useState<number>(0);
  const [duration, setDuration] = useState<number>(0);

  // Resume notification
  const [showResumeBanner, setShowResumeBanner] = useState(false);
  const [showInstagramModal, setShowInstagramModal] = useState(false);

  // Coupon Expiration Countdown
  const [couponSecondsLeft, setCouponSecondsLeft] = useState<number>(1800); // 30 minutes
  const couponIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // Firestore persistent session saving helper
  const getSessionId = () => {
    let id = localStorage.getItem('fpac_identity_session_id');
    if (!id) {
      id = 'sess_' + Math.random().toString(36).substring(2, 15) + '_' + Date.now();
      localStorage.setItem('fpac_identity_session_id', id);
    }
    return id;
  };

  const saveToFirebase = async (data: any) => {
    try {
      const sessionId = getSessionId();
      const docRef = doc(db, 'identity_quiz_sessions', sessionId);
      await setDoc(docRef, {
        id: sessionId,
        updatedAt: new Date().toISOString(),
        origem: window.location.hostname || 'f_pac_store',
        ...data
      }, { merge: true });
    } catch (error) {
      console.warn('Silent fallback: Firestore database not connected or offline.', error);
    }
  };

  // Open conditions
  useEffect(() => {
    if (forceOpen) {
      startQuizFresh();
      return;
    }

    const savedResult = localStorage.getItem('fpac_identity_saved_result');
    const hasClosedQuiz = sessionStorage.getItem('fpac_session_quiz_closed');

    if (!savedResult && !hasClosedQuiz) {
      // Look for in-progress quiz
      const savedProgress = localStorage.getItem('fpac_identity_in_progress');
      if (savedProgress) {
        try {
          const parsed = JSON.parse(savedProgress);
          if (parsed && parsed.step > 0 && parsed.step < 11) {
            setShowResumeBanner(true);
          }
        } catch (_) {}
      }

      const timer = setTimeout(() => {
        setIsOpen(true);
      }, 2000);
      return () => clearTimeout(timer);
    }
  }, [forceOpen]);

  // Listen to manual triggers
  useEffect(() => {
    const handleOpenQuiz = () => {
      startQuizFresh();
    };
    window.addEventListener('fpac_open_quiz', handleOpenQuiz);
    return () => {
      window.removeEventListener('fpac_open_quiz', handleOpenQuiz);
    };
  }, []);

  // Close on navigation
  useEffect(() => {
    if (isOpen && location.pathname !== '/descubra-sua-identidade') {
      setIsOpen(false);
    }
  }, [location.pathname]);

  // Auto coupon countdown ticker when results are shown
  useEffect(() => {
    if (currentStep === 11) {
      let expireTime = localStorage.getItem('fpac_coupon_expire_time');
      if (!expireTime) {
        const target = Date.now() + 30 * 60 * 1000;
        localStorage.setItem('fpac_coupon_expire_time', target.toString());
        expireTime = target.toString();
      }

      const tick = () => {
        const remaining = Math.max(0, Math.floor((parseInt(expireTime!) - Date.now()) / 1000));
        setCouponSecondsLeft(remaining);
        if (remaining <= 0 && couponIntervalRef.current) {
          clearInterval(couponIntervalRef.current);
        }
      };

      tick();
      couponIntervalRef.current = setInterval(tick, 1000);
    }

    return () => {
      if (couponIntervalRef.current) clearInterval(couponIntervalRef.current);
    };
  }, [currentStep]);

  // Reset/Start fresh
  const startQuizFresh = () => {
    localStorage.removeItem('fpac_identity_in_progress');
    setAnswers({});
    setCurrentStep(0);
    setIsOpen(true);
    setStartTime(Date.now());
    setLeadName('');
    setLeadEmail('');
    setLeadWhatsapp('');
    setShowResumeBanner(false);
    
    // Save starting event
    saveToFirebase({
      status: 'started',
      createdAt: new Date().toISOString(),
      currentStep: 0,
      answers: {}
    });
  };

  // Resume Progress
  const resumeQuizProgress = () => {
    const saved = localStorage.getItem('fpac_identity_in_progress');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        setAnswers(parsed.answers || {});
        setCurrentStep(parsed.step || 0);
        setStartTime(parsed.startTime || Date.now());
        setIsOpen(true);
        setShowResumeBanner(false);
        // Start playing site's radio when resuming
        startRadioDuringQuiz();
      } catch (_) {
        startQuizFresh();
      }
    } else {
      startQuizFresh();
    }
  };

  // Keyboard Navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!isOpen) return;

      if (e.key === 'Escape') {
        handleClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen]);

  const handleClose = () => {
    setIsOpen(false);
    sessionStorage.setItem('fpac_session_quiz_closed', 'true');
    if (onClose) onClose();
  };

  // Sound selection toggle
  const selectOption = (questionId: number, optionId: string) => {
    if (hasSound) playSelectSound();

    const updatedAnswers = { ...answers, [questionId]: optionId };
    setAnswers(updatedAnswers);

    // Save transient progress
    localStorage.setItem('fpac_identity_in_progress', JSON.stringify({
      step: questionId + 1,
      answers: updatedAnswers,
      startTime
    }));

    // Save state to Firebase incrementally
    saveToFirebase({
      currentStep: questionId + 1,
      answers: updatedAnswers
    });

    // Advance with a brief elegant delay for interactive feedback
    setTimeout(() => {
      setCurrentStep(questionId + 1);
    }, 250);
  };

  const handleBack = () => {
    if (currentStep > 0) {
      setCurrentStep(currentStep - 1);
    }
  };

  // Validate lead & Submit
  const handleLeadSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    proceedToComputation({
      name: leadName,
      email: leadEmail,
      whatsapp: leadWhatsapp,
      optIn
    });
  };

  const skipLead = () => {
    proceedToComputation();
  };

  const proceedToComputation = (leadData?: { name: string; email: string; whatsapp: string; optIn: boolean }) => {
    // Show premium Loading screen first
    setCurrentStep(10); // step 10 = loading screen

    // Calculate score logic
    const scoreCollections = { force: 0, mark: 0, prime: 0 };
    const scoreProfiles = { lobo: 0, street_king: 0, black_force: 0, alpha: 0, minimal: 0, elite: 0 };

    QUESTIONS.forEach((q) => {
      const selectedOptId = answers[q.id];
      const opt = q.options.find(o => o.id === selectedOptId);
      if (opt) {
        // collections
        scoreCollections.force += opt.scores.collections.force;
        scoreCollections.mark += opt.scores.collections.mark;
        scoreCollections.prime += opt.scores.collections.prime;

        // profiles
        scoreProfiles.lobo += opt.scores.profiles.lobo;
        scoreProfiles.street_king += opt.scores.profiles.street_king;
        scoreProfiles.black_force += opt.scores.profiles.black_force;
        scoreProfiles.alpha += opt.scores.profiles.alpha;
        scoreProfiles.minimal += opt.scores.profiles.minimal;
        scoreProfiles.elite += opt.scores.profiles.elite;
      }
    });

    // Determine highest profile
    let maxProfileId = 'minimal';
    let maxProfileScore = -1;
    Object.entries(scoreProfiles).forEach(([profileId, score]) => {
      if (score > maxProfileScore) {
        maxProfileScore = score;
        maxProfileId = profileId;
      }
    });

    // Normalize collection percentages to sum to something beautiful
    const totalCollSum = Math.max(1, scoreCollections.force + scoreCollections.mark + scoreCollections.prime);
    const forcePct = Math.min(98, Math.max(30, Math.round((scoreCollections.force / totalCollSum) * 100 + 10)));
    const markPct = Math.min(98, Math.max(30, Math.round((scoreCollections.mark / totalCollSum) * 100 + 10)));
    const primePct = Math.min(98, Math.max(30, Math.round((scoreCollections.prime / totalCollSum) * 100 + 10)));

    const computedScores = {
      force: forcePct,
      mark: markPct,
      prime: primePct
    };

    const profileObj = PROFILES[maxProfileId] || PROFILES.minimal;
    const computedDuration = Math.round((Date.now() - startTime) / 1000);

    setFinalProfile(profileObj);
    setFinalScores(computedScores);
    setDuration(computedDuration);

    // Save final stats & completion to Firestore
    saveToFirebase({
      status: 'completed',
      completedAt: new Date().toISOString(),
      currentStep: 11,
      answers,
      lead: leadData || null,
      generatedProfile: profileObj.id,
      recommendedCollection: profileObj.recommendedCollection,
      couponUsed: 'IDENTIDADE10',
      durationSeconds: computedDuration,
      scores: computedScores
    });

    // Save completion flag & profile preference to local storage
    localStorage.setItem('fpac_user_style', profileObj.recommendedCollection);
    localStorage.setItem('fpac_identity_saved_result', JSON.stringify({
      profileId: profileObj.id,
      scores: computedScores
    }));
    // Clean up temporary active progress
    localStorage.removeItem('fpac_identity_in_progress');

    // Trigger local style change events so the app sintonizes
    window.dispatchEvent(new Event('fpac_style_changed'));

    // Loading transition delay
    setTimeout(() => {
      setCurrentStep(11); // step 11 = results screen
    }, 2000);
  };

  const handleCopyResult = () => {
    if (!finalProfile) return;
    const shareText = `Descobri minha Identidade Streetwear na F PAC STORE!\n\nPerfil: ${finalProfile.title}\n"${finalProfile.description}"\n\nFaça você também e ganhe 15% OFF com o cupom IDENTIDADE10.\nLink: ${window.location.origin}`;
    navigator.clipboard.writeText(shareText);
    alert('Resultado copiado para a área de transferência! Cole onde desejar.');
  };

  const handleShareInstagram = () => {
    if (!finalProfile) return;
    const shareText = `Minha Identidade Streetwear na F PAC é: PERFIL ${finalProfile.name.toUpperCase()} ⚡️\nDescobri meu estilo e ganhei 15% OFF com o cupom IDENTIDADE10.\n\nFaça o teste você também no site da F PAC e garanta o seu desconto!\nLink: ${window.location.origin}`;
    navigator.clipboard.writeText(shareText);
    setShowInstagramModal(true);
  };

  const handleViewRecommendedProducts = () => {
    if (!finalProfile) return;
    setIsOpen(false);
    navigate(`/model/${finalProfile.recommendedCollection}`);
    if (onClose) onClose();
  };

  // Countdown display format
  const formatTime = (secs: number) => {
    const minutes = Math.floor(secs / 60);
    const seconds = secs % 60;
    return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
  };

  // Filter recommended collection products
  const recommendedProductsList = useMemo(() => {
    if (!finalProfile) return [];
    return staticProducts.filter(p => p.slug === finalProfile.recommendedCollection);
  }, [finalProfile]);

  if (!isOpen) {
    if (showResumeBanner) {
      return (
        <div className="fixed bottom-24 left-4 right-4 md:left-auto md:right-6 z-[999] max-w-sm bg-[#0d0d12] border-2 border-[#eab308] p-4 text-white shadow-2xl flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-black uppercase tracking-widest text-[#eab308] flex items-center gap-1">
              <Sparkles size={12} className="animate-pulse" />
              Teste em Progresso
            </span>
            <button onClick={() => setShowResumeBanner(false)} className="text-white/40 hover:text-white">
              <X size={14} />
            </button>
          </div>
          <p className="text-xs text-white/80">
            Você deixou sua experiência de identidade pela metade. Quer continuar de onde parou?
          </p>
          <div className="flex gap-2.5">
            <button 
              onClick={resumeQuizProgress}
              className="flex-1 bg-[#eab308] hover:bg-white text-black font-black py-1.5 px-3 text-[10px] uppercase tracking-widest transition-all"
            >
              Continuar
            </button>
            <button 
              onClick={startQuizFresh}
              className="border border-white/10 hover:border-white text-white font-black py-1.5 px-3 text-[10px] uppercase tracking-widest transition-all"
            >
              Recomeçar
            </button>
          </div>
        </div>
      );
    }
    return null;
  }

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-[9999] overflow-y-auto bg-black/95 backdrop-blur-xl flex items-center justify-center p-3 sm:p-4 md:p-6 select-none">
        
        {/* Subtle background glow */}
        <div className="absolute top-1/4 left-1/4 w-80 h-80 rounded-full bg-[#eab308]/5 blur-[120px] pointer-events-none" />
        <div className="absolute bottom-1/4 right-1/4 w-80 h-80 rounded-full bg-[#eab308]/5 blur-[120px] pointer-events-none" />

        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 30 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 30 }}
          transition={{ type: 'spring', duration: 0.5 }}
          className="relative w-full max-w-2xl bg-[#08080c] border border-white/10 p-5 sm:p-8 text-white shadow-2xl overflow-hidden my-4"
        >
          {/* Slogan premium top border */}
          <div className="absolute top-0 inset-x-0 h-1 bg-gradient-to-r from-transparent via-[#eab308] to-transparent" />
          <div className="absolute top-2 left-6 right-6 flex items-center justify-between text-white/20 pointer-events-none">
            <span className="text-[7px] font-mono tracking-[0.4em] uppercase">F PAC STORE</span>
            <span className="text-[7px] font-mono tracking-[0.4em] uppercase">Não é só roupa. É identidade.</span>
          </div>

          {/* Close Header button */}
          {currentStep !== 10 && (
            <>
              {/* Rádio F PAC Live Indicator */}
              <div className="absolute top-4 right-14 flex items-center gap-2 text-white/40 z-[99]">
                <button
                  onClick={togglePlay}
                  className={cn(
                    "flex items-center gap-2 px-3 py-1.5 text-[8px] font-black uppercase tracking-widest transition-all duration-300 border border-white/5 hover:border-[#eab308]/40 hover:text-white cursor-pointer rounded-none",
                    isPlaying ? "bg-[#eab308]/10 text-[#eab308] border-[#eab308]/20 shadow-[0_0_15px_rgba(234,179,8,0.15)]" : "bg-black/60 text-white/40"
                  )}
                  title={isPlaying ? "Pausar Rádio do Site" : "Tocar Rádio do Site"}
                >
                  {isPlaying ? (
                    <>
                      <span className="relative flex h-1.5 w-1.5">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#eab308] opacity-75"></span>
                        <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-[#eab308]"></span>
                      </span>
                      <span>RÁDIO F PAC (AO VIVO)</span>
                    </>
                  ) : (
                    <>
                      <span className="h-1.5 w-1.5 rounded-full bg-white/20"></span>
                      <span>LIGAR RÁDIO F PAC</span>
                    </>
                  )}
                </button>
              </div>

              <button 
                onClick={handleClose}
                className="absolute top-3 right-3 text-white/40 hover:text-[#eab308] w-10 h-10 flex items-center justify-center transition-all cursor-pointer z-[99]"
                title="Fechar"
              >
                <X size={18} />
              </button>
            </>
          )}

          {/* Control bar: Sound & Back */}
          {currentStep > 0 && currentStep < 9 && (
            <div className="absolute top-10 left-6 flex items-center gap-4 text-white/40 z-[99]">
              <button 
                onClick={handleBack} 
                className="hover:text-[#eab308] flex items-center gap-1.5 text-[9px] font-bold uppercase tracking-widest bg-transparent border-0 cursor-pointer"
              >
                <ChevronLeft size={14} /> Voltar
              </button>
              <span className="text-white/10">|</span>
              <button 
                onClick={() => setHasSound(!hasSound)} 
                className="hover:text-[#eab308] flex items-center gap-1 bg-transparent border-0 cursor-pointer"
              >
                {hasSound ? <Volume2 size={13} className="text-[#eab308]" /> : <VolumeX size={13} />}
              </button>
            </div>
          )}

          <div className="pt-6 pb-2">
            
            {/* 1. START SPLASH SCREEN */}
            {currentStep === 0 && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="flex flex-col items-center text-center py-6"
              >
                <div className="flex items-center gap-1.5 bg-[#eab308]/10 text-[#eab308] border border-[#eab308]/20 px-3 py-1 text-[9px] font-black uppercase tracking-[0.3em] mb-6 animate-pulse">
                  <Crown size={11} />
                  Experiência Exclusiva
                </div>

                <h1 className="text-3xl sm:text-5xl font-black italic tracking-tighter text-white mb-2 leading-none uppercase">
                  DESCUBRA SUA <span className="text-[#eab308] drop-shadow-[0_0_15px_rgba(234,179,8,0.2)]">IDENTIDADE</span>
                </h1>
                
                <h2 className="text-sm sm:text-base font-serif italic text-white/70 mb-8 font-medium">
                  “Não é só roupa. É identidade.”
                </h2>

                <p className="text-xs sm:text-sm text-white/60 font-sans max-w-md leading-relaxed mb-10">
                  Em menos de 30 segundos, nosso sistema inteligente de sintonia streetwear vai analisar seu estilo e revelar a coleção perfeita que traduz sua postura.
                </p>

                <div className="w-full flex flex-col items-center gap-4">
                  <button
                    onClick={() => {
                      setCurrentStep(1);
                      startRadioDuringQuiz();
                    }}
                    className="relative w-full max-w-sm bg-gradient-to-r from-[#eab308] to-[#ca8a04] hover:from-white hover:to-white text-black hover:text-black font-black py-4 px-8 text-xs uppercase tracking-[0.25em] transition-all duration-300 shadow-[0_4px_20px_rgba(234,179,8,0.35)] hover:shadow-white/20 active:scale-[0.98] cursor-pointer"
                  >
                    GARANTIR MEU DESCONTO
                  </button>
                </div>
              </motion.div>
            )}

            {/* 2. PROGRESSIVE QUESTIONS SCREEN */}
            {currentStep >= 1 && currentStep <= 8 && (
              <motion.div
                key={`step-${currentStep}`}
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                transition={{ duration: 0.25 }}
                className="flex flex-col mt-6"
              >
                {/* Progress Bar Header */}
                <div className="w-full flex flex-col gap-1.5 mb-8">
                  <div className="flex justify-between items-center text-[10px] font-mono text-white/50 tracking-widest uppercase">
                    <span>Identidade Streetwear</span>
                    <span className="text-[#eab308] font-black">Pergunta {currentStep} de 8</span>
                  </div>
                  <div className="w-full h-[3px] bg-white/10 overflow-hidden rounded-full">
                    <div 
                      className="h-full bg-[#eab308] transition-all duration-300 shadow-[0_0_10px_rgba(234,179,8,0.7)]" 
                      style={{ width: `${(currentStep / 8) * 100}%` }}
                    />
                  </div>
                </div>

                {/* Question Title */}
                <h2 className="text-xl sm:text-2xl font-black uppercase italic tracking-tight mb-6">
                  {QUESTIONS[currentStep - 1].title}
                </h2>

                {/* Option Cards Grid */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 w-full">
                  {QUESTIONS[currentStep - 1].options.map((opt) => {
                    const isSelected = answers[currentStep] === opt.id;
                    return (
                      <button
                        key={opt.id}
                        onClick={() => selectOption(currentStep, opt.id)}
                        className={cn(
                          "group relative flex items-center justify-between p-4 bg-white/[0.02] border transition-all duration-300 rounded-none cursor-pointer text-left w-full h-[74px] active:scale-[0.99]",
                          isSelected 
                            ? "border-[#eab308] bg-[#eab308]/10 shadow-[0_0_20px_rgba(234,179,8,0.15)]" 
                            : "border-white/5 hover:border-white/20 hover:bg-white/[0.05]"
                        )}
                      >
                        <div className="flex items-center gap-4">
                          <div className={cn(
                            "w-10 h-10 flex items-center justify-center transition-all duration-300",
                            isSelected ? "text-[#eab308]" : "text-white/40 group-hover:text-white"
                          )}>
                            <LucideIcon name={opt.iconName} size={22} />
                          </div>
                          <div className="flex flex-col">
                            <span className="text-[11px] font-black uppercase tracking-widest text-white/40 group-hover:text-white/60 mb-0.5">
                              OPÇÃO {opt.id.toUpperCase().replace('_', ' ')}
                            </span>
                            <span className={cn(
                              "text-sm font-black uppercase tracking-wide transition-colors",
                              isSelected ? "text-[#eab308]" : "text-white group-hover:text-[#eab308]"
                            )}>
                              {opt.text}
                            </span>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-xl group-hover:scale-125 transition-transform duration-300">{opt.emoji}</span>
                          <div className={cn(
                            "w-4 h-4 rounded-full border flex items-center justify-center transition-all",
                            isSelected ? "border-[#eab308] bg-[#eab308]" : "border-white/20"
                          )}>
                            {isSelected && <Check size={10} className="text-black stroke-[3]" />}
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </motion.div>
            )}

            {/* 3. LEAD CAPTURE SCREEN */}
            {currentStep === 9 && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="flex flex-col max-w-md mx-auto py-4"
              >
                <div className="text-center mb-6">
                  <div className="inline-flex p-3 bg-[#eab308]/10 rounded-full border border-[#eab308]/20 text-[#eab308] mb-3 animate-pulse">
                    <Sparkles size={28} />
                  </div>
                  <h2 className="text-xl sm:text-2xl font-black uppercase italic tracking-tighter text-white">
                    QUASE PRONTO!
                  </h2>
                  <p className="text-xs text-white/50 mt-1 uppercase tracking-wider">
                    Sua identidade foi sintonizada. Onde devemos enviar seu resultado?
                  </p>
                </div>

                <form onSubmit={handleLeadSubmit} className="space-y-4">
                  <div>
                    <label className="block text-[9px] font-black uppercase tracking-widest text-white/40 mb-1.5">
                      Seu Nome Completo
                    </label>
                    <input 
                      type="text"
                      required
                      value={leadName}
                      onChange={(e) => setLeadName(e.target.value)}
                      placeholder="Ex: Gabriel Silva"
                      className="w-full bg-white/[0.03] border border-white/10 focus:border-[#eab308] py-3.5 px-4 text-xs text-white rounded-none focus:outline-none transition-colors uppercase font-bold tracking-wider placeholder:text-white/20"
                    />
                  </div>

                  <div>
                    <label className="block text-[9px] font-black uppercase tracking-widest text-white/40 mb-1.5">
                      Seu Melhor E-mail
                    </label>
                    <input 
                      type="email"
                      required
                      value={leadEmail}
                      onChange={(e) => setLeadEmail(e.target.value)}
                      placeholder="Ex: gabriel@email.com"
                      className="w-full bg-white/[0.03] border border-white/10 focus:border-[#eab308] py-3.5 px-4 text-xs text-white rounded-none focus:outline-none transition-colors font-bold tracking-wider placeholder:text-white/20"
                    />
                  </div>

                  <div>
                    <label className="block text-[9px] font-black uppercase tracking-widest text-white/40 mb-1.5">
                      Seu WhatsApp / Celular
                    </label>
                    <input 
                      type="tel"
                      required
                      value={leadWhatsapp}
                      onChange={(e) => setLeadWhatsapp(e.target.value)}
                      placeholder="Ex: (47) 99999-9999"
                      className="w-full bg-white/[0.03] border border-white/10 focus:border-[#eab308] py-3.5 px-4 text-xs text-white rounded-none focus:outline-none transition-colors font-bold tracking-wider placeholder:text-white/20"
                    />
                  </div>

                  <label className="flex items-start gap-3 cursor-pointer group pt-1">
                    <input 
                      type="checkbox"
                      checked={optIn}
                      onChange={(e) => setOptIn(e.target.checked)}
                      className="mt-0.5 accent-[#eab308]"
                    />
                    <span className="text-[10px] text-white/60 group-hover:text-white transition-colors leading-relaxed uppercase tracking-wider font-semibold">
                      Aceito receber novidades e cupons exclusivos da F PAC STORE no meu WhatsApp e E-mail.
                    </span>
                  </label>

                  <div className="pt-4 flex flex-col gap-3">
                    <button
                      type="submit"
                      className="w-full bg-[#eab308] hover:bg-white text-black font-black py-4 text-xs uppercase tracking-[0.2em] transition-all duration-300 shadow-[0_4px_15px_rgba(234,179,8,0.25)] hover:shadow-white/20 cursor-pointer"
                    >
                      GERAR MEU RESULTADO
                    </button>
                    
                    <button
                      type="button"
                      onClick={skipLead}
                      className="text-center text-[10px] text-white/30 hover:text-[#eab308] font-black uppercase tracking-widest py-2 hover:underline transition-colors cursor-pointer"
                    >
                      Ver resultado sem cadastrar
                    </button>
                  </div>
                </form>
              </motion.div>
            )}

            {/* 4. PREMIUM LOADING SCREEN */}
            {currentStep === 10 && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="flex flex-col items-center text-center py-12"
              >
                <div className="relative mb-8">
                  <div className="w-16 h-16 rounded-full border-4 border-white/5 border-t-[#eab308] animate-spin" />
                  <div className="absolute inset-0 flex items-center justify-center text-[#eab308]">
                    <Sparkles size={20} className="animate-pulse" />
                  </div>
                </div>

                <h3 className="text-lg font-black uppercase tracking-[0.2em] mb-2 animate-pulse text-[#eab308]">
                  SINTONIZANDO IDENTIDADE
                </h3>
                
                <div className="h-6 overflow-hidden max-w-xs mx-auto">
                  <motion.p 
                    initial={{ y: 20 }}
                    animate={{ y: [20, 0, -20] }}
                    transition={{ repeat: Infinity, duration: 2.5, ease: "easeInOut" }}
                    className="text-[10px] font-mono text-white/40 uppercase tracking-widest"
                  >
                    Analisando caimento...
                  </motion.p>
                </div>
              </motion.div>
            )}

            {/* 5. FINAL RESULT SCREEN */}
            {currentStep === 11 && finalProfile && (
              <motion.div
                initial={{ opacity: 0, scale: 0.98 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ duration: 0.4 }}
                className="flex flex-col text-left"
              >
                {/* Result header layout */}
                <div className="grid grid-cols-1 md:grid-cols-12 gap-6 items-center border-b border-white/5 pb-6 mb-6">
                  {/* Avatar section */}
                  <div className="md:col-span-4 flex flex-col items-center text-center">
                    <div className="relative p-1 border-2 border-[#eab308]/50 rounded-full bg-black/60 shadow-[0_0_30px_rgba(234,179,8,0.2)] animate-pulse">
                      <span className="w-24 h-24 sm:w-28 sm:h-28 rounded-full bg-gradient-to-tr from-black to-[#0d0d12] flex items-center justify-center text-5xl sm:text-6xl select-none">
                        {finalProfile.emoji}
                      </span>
                      <div className="absolute -bottom-1 -right-1 bg-[#eab308] text-black text-[9px] font-black px-2.5 py-1 uppercase tracking-widest shadow-lg">
                        {finalProfile.badge.name.toUpperCase()}
                      </div>
                    </div>
                  </div>

                  {/* Profile info section */}
                  <div className="md:col-span-8 space-y-3 text-center md:text-left">
                    <span className="text-[9px] font-black bg-[#eab308]/10 text-[#eab308] border border-[#eab308]/20 px-3 py-1 uppercase tracking-[0.25em]">
                      Sua Identidade Streetwear
                    </span>
                    <h2 className="text-3xl sm:text-4xl font-black italic uppercase tracking-tighter text-white">
                      PERFIL {finalProfile.name.toUpperCase()}
                    </h2>
                    <p className="text-xs sm:text-sm text-white/80 leading-relaxed font-medium">
                      {finalProfile.description}
                    </p>
                  </div>
                </div>

                {/* Compatibility stats & AI recommendation */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 border-b border-white/5 pb-6 mb-6">
                  <div className="space-y-4">
                    <h3 className="text-xs font-black uppercase tracking-widest text-white/40">Compatibilidade de Coleções</h3>
                    
                    {/* Collection compatibilities */}
                    <div className="space-y-3">
                      <div>
                        <div className="flex justify-between items-center text-[10px] font-mono uppercase text-white/80 mb-1">
                          <span>Coleção FORCE (Militar/Tático)</span>
                          <span className={cn("font-bold", finalProfile.recommendedCollection === 'force' && "text-[#eab308]")}>
                            {finalScores.force}% {finalProfile.recommendedCollection === 'force' && '★'}
                          </span>
                        </div>
                        <div className="w-full h-2 bg-white/5 overflow-hidden">
                          <motion.div 
                            initial={{ width: 0 }}
                            animate={{ width: `${finalScores.force}%` }}
                            transition={{ duration: 1, ease: "easeOut" }}
                            className={cn("h-full", finalProfile.recommendedCollection === 'force' ? "bg-[#eab308]" : "bg-white/30")}
                          />
                        </div>
                      </div>

                      <div>
                        <div className="flex justify-between items-center text-[10px] font-mono uppercase text-white/80 mb-1">
                          <span>Coleção MARK (Street/Grafite)</span>
                          <span className={cn("font-bold", finalProfile.recommendedCollection === 'mark' && "text-[#eab308]")}>
                            {finalScores.mark}% {finalProfile.recommendedCollection === 'mark' && '★'}
                          </span>
                        </div>
                        <div className="w-full h-2 bg-white/5 overflow-hidden">
                          <motion.div 
                            initial={{ width: 0 }}
                            animate={{ width: `${finalScores.mark}%` }}
                            transition={{ duration: 1, ease: "easeOut" }}
                            className={cn("h-full", finalProfile.recommendedCollection === 'mark' ? "bg-[#eab308]" : "bg-white/30")}
                          />
                        </div>
                      </div>

                      <div>
                        <div className="flex justify-between items-center text-[10px] font-mono uppercase text-white/80 mb-1">
                          <span>Coleção PRIME (Essencial/Minimal)</span>
                          <span className={cn("font-bold", finalProfile.recommendedCollection === 'prime' && "text-[#eab308]")}>
                            {finalScores.prime}% {finalProfile.recommendedCollection === 'prime' && '★'}
                          </span>
                        </div>
                        <div className="w-full h-2 bg-white/5 overflow-hidden">
                          <motion.div 
                            initial={{ width: 0 }}
                            animate={{ width: `${finalScores.prime}%` }}
                            transition={{ duration: 1, ease: "easeOut" }}
                            className={cn("h-full", finalProfile.recommendedCollection === 'prime' ? "bg-[#eab308]" : "bg-white/30")}
                          />
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* AI Recommendation panel */}
                  <div className="bg-white/[0.02] border border-white/5 p-4 flex flex-col justify-between">
                    <div>
                      <span className="text-[8px] font-black text-[#eab308] uppercase tracking-widest flex items-center gap-1.5 mb-2">
                        <Sparkles size={11} className="animate-pulse" /> Recomendações do Sistema
                      </span>
                      <p className="text-xs text-white/70 leading-relaxed font-sans italic">
                        "{finalProfile.aiText}"
                      </p>
                    </div>

                    <div className="pt-4 mt-4 border-t border-white/5 flex items-center gap-2.5">
                      <span className="text-[18px]">{finalProfile.badge.emoji}</span>
                      <div className="flex flex-col">
                        <span className="text-[9px] font-black uppercase text-white/40 tracking-widest">Insígnia Conquistada</span>
                        <span className="text-[11px] font-black uppercase text-[#eab308] tracking-wider">{finalProfile.badge.name}</span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Rewards / Countdown Coupon section */}
                <div className="bg-gradient-to-r from-black via-[#eab308]/5 to-black border border-[#eab308]/20 p-5 mb-6">
                  <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
                    <div className="space-y-1 text-center sm:text-left">
                      <div className="flex items-center justify-center sm:justify-start gap-1.5 text-[#eab308]">
                        <Tag size={13} />
                        <span className="text-[10px] font-black uppercase tracking-[0.2em]">CUPOM EXCLUSIVO LIBERADO</span>
                      </div>
                      <h4 className="text-xl font-black uppercase tracking-tight text-white">IDENTIDADE10</h4>
                      <p className="text-[9px] text-white/40 uppercase tracking-wider font-semibold">
                        Garante 15% de desconto direto (não acumulativo).
                      </p>
                    </div>

                    <div className="flex flex-col items-center sm:items-end gap-1 shrink-0 bg-black/40 px-4 py-2 border border-white/5 min-w-[120px]">
                      <span className="text-[8px] font-mono uppercase text-white/40 tracking-widest">Expira em:</span>
                      <span className={cn(
                        "text-lg font-black font-mono tracking-wider",
                        couponSecondsLeft < 300 ? "text-red-500 animate-pulse" : "text-[#eab308]"
                      )}>
                        {formatTime(couponSecondsLeft)}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Recommended collection trigger & Social sharing */}
                <div className="flex flex-col sm:flex-row gap-3 w-full">
                  <button
                    onClick={handleViewRecommendedProducts}
                    className="flex-1 bg-[#eab308] hover:bg-white text-black font-black py-4 px-6 text-xs uppercase tracking-widest transition-all duration-300 flex items-center justify-center gap-2 group cursor-pointer"
                  >
                    VER MINHAS CAMISETAS ({finalProfile.recommendedCollection.toUpperCase()})
                    <ChevronRight size={14} className="group-hover:translate-x-1 transition-transform" />
                  </button>

                  <div className="flex gap-2">
                    <button
                      onClick={handleShareInstagram}
                      title="Compartilhar no Instagram"
                      className="p-4 bg-[#E1306C]/10 hover:bg-[#E1306C]/20 border border-[#E1306C]/20 text-[#E1306C] transition-all cursor-pointer flex items-center justify-center"
                    >
                      <Instagram size={16} />
                    </button>
                    
                    <button
                      onClick={handleCopyResult}
                      title="Copiar resultado"
                      className="p-4 bg-white/5 hover:bg-white/10 border border-white/10 text-white transition-all cursor-pointer flex items-center justify-center"
                    >
                      <Copy size={16} />
                    </button>

                    <button
                      onClick={startQuizFresh}
                      title="Refazer teste"
                      className="p-4 bg-white/5 hover:bg-white/10 border border-white/10 text-white transition-all cursor-pointer flex items-center justify-center"
                    >
                      <RefreshCw size={16} />
                    </button>
                  </div>
                </div>

                <div className="mt-6 text-center">
                  <p className="text-[9px] text-white/30 uppercase tracking-widest leading-relaxed">
                    Poste seu resultado nos stories e marque <span className="text-[#eab308] font-bold">@f_pac_store</span> para ganhar outro benefício surpresa na sua próxima compra.
                  </p>
                </div>
              </motion.div>
            )}

            {/* Instagram Instructions Modal Overlay */}
            <AnimatePresence>
              {showInstagramModal && (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="absolute inset-0 bg-black/95 backdrop-blur-md z-[200] flex flex-col items-center justify-center p-6 text-center"
                >
                  <motion.div
                    initial={{ scale: 0.9, y: 20 }}
                    animate={{ scale: 1, y: 0 }}
                    exit={{ scale: 0.9, y: 20 }}
                    className="w-full max-w-md bg-[#0d0d12] border border-[#E1306C]/40 p-6 relative"
                  >
                    {/* Close button */}
                    <button 
                      onClick={() => setShowInstagramModal(false)}
                      className="absolute top-3 right-3 text-white/40 hover:text-[#E1306C] w-8 h-8 flex items-center justify-center transition-all cursor-pointer"
                      title="Fechar"
                    >
                      <X size={16} />
                    </button>

                    {/* Instagram logo icon */}
                    <div className="w-16 h-16 mx-auto mb-4 bg-gradient-to-tr from-[#f9ce34] via-[#ee2a7b] to-[#6228d7] rounded-2xl flex items-center justify-center text-white shadow-[0_4px_20px_rgba(238,42,123,0.3)]">
                      <Instagram size={32} />
                    </div>

                    <h3 className="text-sm font-black uppercase tracking-[0.2em] mb-2 text-white">
                      Resultado Copiado!
                    </h3>
                    
                    <p className="text-[11px] text-white/70 leading-relaxed mb-6 font-medium max-w-xs mx-auto">
                      O texto do seu resultado já foi copiado para a sua área de transferência. Agora, siga os passos para garantir seu benefício surpresa:
                    </p>

                    <div className="space-y-4 text-left max-w-xs mx-auto mb-6 text-[11px] font-medium text-white/80">
                      <div className="flex gap-3 items-start">
                        <span className="w-5 h-5 rounded-full bg-[#E1306C]/10 border border-[#E1306C]/30 text-[#E1306C] flex items-center justify-center font-black text-[9px] shrink-0 mt-0.5">1</span>
                        <p>Clique no botão abaixo para abrir o Instagram.</p>
                      </div>
                      <div className="flex gap-3 items-start">
                        <span className="w-5 h-5 rounded-full bg-[#E1306C]/10 border border-[#E1306C]/30 text-[#E1306C] flex items-center justify-center font-black text-[9px] shrink-0 mt-0.5">2</span>
                        <p>Crie um novo <strong className="text-white uppercase font-black text-[9px]">Story</strong> e cole o resultado copiado ou tire um print desta tela.</p>
                      </div>
                      <div className="flex gap-3 items-start">
                        <span className="w-5 h-5 rounded-full bg-[#E1306C]/10 border border-[#E1306C]/30 text-[#E1306C] flex items-center justify-center font-black text-[9px] shrink-0 mt-0.5">3</span>
                        <p>Marque <strong className="text-[#eab308] uppercase font-black text-[9px]">@f_pac_store</strong> e publique!</p>
                      </div>
                    </div>

                    <div className="flex flex-col gap-2.5">
                      <a
                        href="https://www.instagram.com"
                        target="_blank"
                        rel="noreferrer"
                        onClick={() => setShowInstagramModal(false)}
                        className="w-full py-3.5 bg-gradient-to-r from-[#ee2a7b] to-[#6228d7] hover:from-[#f9ce34] hover:to-[#ee2a7b] text-white hover:text-white font-black text-[10px] uppercase tracking-[0.2em] transition-all duration-300 text-center block font-sans"
                      >
                        ABRIR INSTAGRAM
                      </a>
                      <button
                        onClick={() => setShowInstagramModal(false)}
                        className="text-[10px] font-black uppercase text-white/40 hover:text-white tracking-widest py-1.5 cursor-pointer"
                      >
                        Voltar para o resultado
                      </button>
                    </div>
                  </motion.div>
                </motion.div>
              )}
            </AnimatePresence>

          </div>

        </motion.div>
      </div>
    </AnimatePresence>
  );
}

/* Elegant Recommendation banner to show personalization on the layouts */
export function StyleRecommendationBanner() {
  const navigate = useNavigate();
  const [style, setStyle] = useState<StyleType | null>(null);

  const loadStyle = () => {
    const saved = safeStorage.getItem('fpac_user_style') as StyleType | null;
    setStyle(saved);
  };

  useEffect(() => {
    loadStyle();
    
    // Listen to changes in style selection
    window.addEventListener('fpac_style_changed', loadStyle);
    return () => {
      window.removeEventListener('fpac_style_changed', loadStyle);
    };
  }, []);

  if (!style) return null;

  return (
    <div className="w-full bg-[#08080c] border-y border-white/10 py-3 px-4 md:px-8 text-white">
      <div className="max-w-7xl mx-auto flex flex-col md:flex-row items-center justify-between gap-3">
        <div className="flex flex-col sm:flex-row items-center gap-2 sm:gap-4 text-center sm:text-left">
          <div className="flex items-center gap-2">
            <span className="text-sm">⚡</span>
            <span className="text-[10px] font-black uppercase tracking-[0.2em] text-[#eab308]">
              Identidade Sintonizada:
            </span>
            <span className="bg-[#eab308] text-black font-black px-2 py-0.5 text-[9px] uppercase tracking-widest">
              {style.toUpperCase()}
            </span>
          </div>
          <p className="text-[10px] md:text-xs text-white/60 font-sans font-medium line-clamp-1 italic max-w-xl">
            Seu perfil foi sintonizado com a linha {style.toUpperCase()}. Aproveite 15% OFF com o cupom IDENTIDADE10.
          </p>
        </div>

        <div className="flex items-center gap-4 shrink-0">
          <button
            onClick={() => {
              navigate(`/model/${style}`);
            }}
            className="bg-[#eab308] hover:bg-white text-black text-[9px] font-black uppercase tracking-[0.15em] px-4 py-2 transition-all text-center rounded-none cursor-pointer"
          >
            Ver Coleção
          </button>
          <button
            onClick={() => window.dispatchEvent(new Event('fpac_open_quiz'))}
            className="text-white/40 hover:text-[#eab308] text-[9px] font-black uppercase tracking-[0.15em] hover:underline transition-all flex items-center gap-1.5 bg-transparent border-0 cursor-pointer"
          >
            <RefreshCw size={10} />
            Mudar Estilo
          </button>
        </div>
      </div>
    </div>
  );
}
