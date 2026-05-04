import React, { createContext, useContext, useEffect, useState } from 'react';
import { 
  onAuthStateChanged, 
  User, 
  GoogleAuthProvider, 
  signInWithPopup, 
  signOut,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  sendPasswordResetEmail,
  updateProfile as updateFirebaseProfile
} from 'firebase/auth';
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
  loginWithEmail: (email: string, pass: string) => Promise<void>;
  registerWithEmail: (email: string, pass: string, name: string) => Promise<void>;
  resetPassword: (email: string) => Promise<void>;
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
            const data = profileSnap.data();
            const fullProfile: UserProfile = {
              name: data.name || currentUser.displayName || '',
              email: data.email || currentUser.email || '',
              phone: data.phone || '',
              cpf: data.cpf || '',
              address: data.address || '',
              number: data.number || '',
              complement: data.complement || '',
              neighborhood: data.neighborhood || '',
              city: data.city || '',
              state: data.state || '',
              cep: data.cep || ''
            };
            setProfile(fullProfile);
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
      const provider = new GoogleAuthProvider();
      provider.setCustomParameters({ prompt: 'select_account' });
      await signInWithPopup(auth, provider);
    } catch (error: any) {
      handleAuthError(error);
    }
  };

  const loginWithEmail = async (email: string, pass: string) => {
    try {
      await signInWithEmailAndPassword(auth, email, pass);
    } catch (error: any) {
      handleAuthError(error);
    }
  };

  const registerWithEmail = async (email: string, pass: string, name: string) => {
    try {
      const result = await createUserWithEmailAndPassword(auth, email, pass);
      await updateFirebaseProfile(result.user, { displayName: name });
      
      // The profile creation is handled in the useEffect onAuthStateChanged
    } catch (error: any) {
      handleAuthError(error);
    }
  };

  const resetPassword = async (email: string) => {
    try {
      await sendPasswordResetEmail(auth, email);
      alert("E-mail de redefinição enviado com sucesso!");
    } catch (error: any) {
      handleAuthError(error);
    }
  };

  const handleAuthError = (error: any) => {
    console.error("Erro de Autenticação:", error);
    
    // Check if it might be a configuration issue
    if (error.message?.includes('API key') || error.code === 'auth/invalid-api-key') {
      alert("❌ Chave API do Firebase inválida. Verifique as configurações (VITE_FIREBASE_API_KEY).");
      return;
    }
    
    if (error.code === 'auth/popup-blocked') {
      alert("O popup de login foi bloqueado.");
    } else if (error.code === 'auth/wrong-password' || error.code === 'auth/user-not-found' || error.code === 'auth/invalid-credential') {
      alert("E-mail ou senha inválidos.");
    } else if (error.code === 'auth/email-already-in-use') {
      alert("Este e-mail já está em uso.");
    } else if (error.code === 'auth/weak-password') {
      alert("A senha deve ter pelo menos 6 caracteres.");
    } else if (error.code === 'auth/unauthorized-domain') {
      alert("⚠️ Este domínio não está autorizado no Firebase. Adicione " + window.location.hostname + " nas configurações de domínios autorizados do Firebase Auth.");
    } else {
      alert("Erro ao processar autenticação: " + (error.message || "Tente novamente."));
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
    <AuthContext.Provider value={{ 
      user, 
      profile, 
      loading, 
      loginWithGoogle, 
      loginWithEmail, 
      registerWithEmail, 
      resetPassword,
      logout, 
      updateProfile 
    }}>
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
