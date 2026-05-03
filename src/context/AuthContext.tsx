import React, { createContext, useContext, useEffect, useState } from 'react';
import { onAuthStateChanged, User, GoogleAuthProvider, signInWithPopup, signOut } from 'firebase/auth';
import { doc, getDoc, setDoc, onSnapshot } from 'firebase/firestore';
import { auth, db } from '../lib/firebase';

export interface UserProfile {
  name: string;
  email: string;
  phone: string;
  cpf: string;
  address: string;
  number: string;
  complement: string;
  neighborhood: string;
  city: string;
  state: string;
  cep: string;
}

interface AuthContextType {
  user: User | null;
  profile: UserProfile | null;
  loading: boolean;
  loginWithGoogle: () => Promise<void>;
  logout: () => Promise<void>;
  updateProfile: (data: Partial<UserProfile>) => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let unsubProfile: (() => void) | null = null;

    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      if (unsubProfile) {
        unsubProfile();
        unsubProfile = null;
      }

      setUser(currentUser);
      if (currentUser) {
        setLoading(true);
        try {
          const profileRef = doc(db, 'users', currentUser.uid);
          
          // Initial fetch
          const profileSnap = await getDoc(profileRef);
          if (profileSnap.exists()) {
            setProfile(profileSnap.data() as UserProfile);
          } else {
            const initialProfile: UserProfile = {
              name: currentUser.displayName || '',
              email: currentUser.email || '',
              phone: '',
              cpf: '',
              address: '',
              number: '',
              complement: '',
              neighborhood: '',
              city: '',
              state: '',
              cep: ''
            };
            await setDoc(profileRef, initialProfile);
            setProfile(initialProfile);
          }

          // Real-time listener
          const localUnsub = onSnapshot(profileRef, (doc) => {
            if (doc.exists()) {
              setProfile(doc.data() as UserProfile);
            }
          });
          unsubProfile = localUnsub;
        } catch (error) {
          console.error("Erro ao carregar perfil:", error);
        } finally {
          setLoading(false);
        }
      } else {
        setProfile(null);
        setLoading(false);
      }
    });

    return () => {
      unsubscribe();
      if (unsubProfile) unsubProfile();
    };
  }, []);

  const loginWithGoogle = async () => {
    const provider = new GoogleAuthProvider();
    await signInWithPopup(auth, provider);
  };

  const logout = async () => {
    await signOut(auth);
  };

  const updateProfile = async (data: Partial<UserProfile>) => {
    if (!user) return;
    const profileRef = doc(db, 'users', user.uid);
    await setDoc(profileRef, { ...data, updatedAt: new Date().toISOString() }, { merge: true });
  };

  return (
    <AuthContext.Provider value={{ user, profile, loading, loginWithGoogle, logout, updateProfile }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
