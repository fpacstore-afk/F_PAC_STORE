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
        console.log("Usuário detectado:", currentUser.email);
        
        // Safety timeout to prevent infinite loading if connection is poor
        const timeoutId = setTimeout(() => {
          setLoading(false);
          console.warn("Auth initialization timed out (4s). Proceeding anyway.");
        }, 4000);

        try {
          const profileRef = doc(db, 'users', currentUser.uid);
          
          // Initial fetch
          const profileSnap = await getDoc(profileRef);
          clearTimeout(timeoutId);

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
          }, (error) => {
            console.error("Erro no listener de perfil:", error);
            // Don't set loading false here as it might be a temporary hiccup
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
    try {
      if (!auth) {
        throw new Error("Sistema de autenticação não inicializado.");
      }
      
      const provider = new GoogleAuthProvider();
      provider.setCustomParameters({ prompt: 'select_account' });
      
      console.log("Iniciando login com popup...");
      await signInWithPopup(auth, provider);
      console.log("Login bem-sucedido!");
      
    } catch (error: any) {
      console.error("Erro no Login Google:", error);
      
      // Detailed error messages for the user
      if (error.code === 'auth/popup-blocked') {
        alert("O popup de login foi bloqueado. Por favor, clique no ícone de bloqueio na barra de endereço do seu navegador e permita popups para este site.");
      } else if (error.code === 'auth/cancelled-popup-request') {
        // User closed the popup, silent
      } else if (error.code === 'auth/internal-error') {
        alert("Erro interno do Firebase. Verifique se as Chaves de API estão corretas nas configurações.");
      } else if (error.code === 'auth/unauthorized-domain') {
        alert("Este domínio não está autorizado no Firebase Console. Por favor, adicione '" + window.location.hostname + "' aos domínios autorizados.");
      } else {
        alert("Erro ao fazer login: " + (error.message || "Tente novamente mais tarde."));
      }
    }
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
