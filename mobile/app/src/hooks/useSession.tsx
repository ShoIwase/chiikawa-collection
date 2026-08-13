import AsyncStorage from "@react-native-async-storage/async-storage";
import { createContext, ReactNode, useCallback, useContext, useEffect, useState } from "react";
import { signIn as cognitoSignIn } from "../auth";

const STORAGE_KEY = "chiikawa_id_token";

type Session = {
  idToken: string | null;
  isLoggedIn: boolean;
  isBootstrapping: boolean;
  login: (username: string, password: string) => Promise<void>;
  logout: () => void;
};

const SessionContext = createContext<Session | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const [idToken, setIdToken] = useState<string | null>(null);
  const [isBootstrapping, setIsBootstrapping] = useState(true);

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY)
      .then((stored) => setIdToken(stored))
      .finally(() => setIsBootstrapping(false));
  }, []);

  const login = useCallback(async (username: string, password: string) => {
    const tokens = await cognitoSignIn(username, password);
    await AsyncStorage.setItem(STORAGE_KEY, tokens.idToken);
    setIdToken(tokens.idToken);
  }, []);

  const logout = useCallback(() => {
    AsyncStorage.removeItem(STORAGE_KEY);
    setIdToken(null);
  }, []);

  return (
    <SessionContext.Provider value={{ idToken, isLoggedIn: !!idToken, isBootstrapping, login, logout }}>
      {children}
    </SessionContext.Provider>
  );
}

export function useSession(): Session {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error("useSession must be used within SessionProvider");
  return ctx;
}
