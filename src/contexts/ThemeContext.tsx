import React, {createContext, useCallback, useContext, useEffect, useState} from 'react';
import {useAuth} from './AuthContext';

type Theme = 'dark' | 'light';

interface ThemeContextValue {
  theme: Theme;
  setTheme: (next: Theme) => void;
  toggleTheme: () => void;
}

const THEME_STORAGE_KEY = 'arix_theme';
const ThemeContext = createContext<ThemeContextValue | undefined>(undefined);

function getInitialTheme(): Theme {
  try {
    const saved = window.localStorage.getItem(THEME_STORAGE_KEY);
    if (saved === 'light' || saved === 'dark') return saved;
  } catch {
    // Ignore storage errors
  }
  return 'dark';
}

export function ThemeProvider({children}: {children: React.ReactNode}) {
  const {user, settings, updateSettings} = useAuth();
  const [theme, setThemeState] = useState<Theme>(getInitialTheme);

  useEffect(() => {
    if (settings?.theme && (settings.theme === 'dark' || settings.theme === 'light')) {
      setThemeState(settings.theme);
    }
  }, [settings?.theme]);

  useEffect(() => {
    const root = document.documentElement;
    if (theme === 'dark') {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
    try {
      window.localStorage.setItem(THEME_STORAGE_KEY, theme);
    } catch {
      // Ignore storage errors
    }
  }, [theme]);

  const setTheme = useCallback(
    (next: Theme) => {
      setThemeState(next);
      if (user) {
        void updateSettings({theme: next}).catch(() => {});
      }
    },
    [updateSettings, user]
  );

  const toggleTheme = useCallback(() => {
    setTheme(theme === 'dark' ? 'light' : 'dark');
  }, [setTheme, theme]);

  return (
    <ThemeContext.Provider value={{theme, setTheme, toggleTheme}}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) {
    throw new Error('useTheme must be used inside ThemeProvider');
  }
  return ctx;
}
