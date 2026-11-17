import React, {createContext, useCallback, useContext, useRef, useState} from 'react';

type SaveState = 'idle' | 'saving' | 'saved' | 'error';

interface SaveStatusContextValue {
  saveState: SaveState;
  lastSavedAt: number | null;
  markSaving: () => void;
  markSaved: () => void;
  markError: () => void;
}

const SaveStatusContext = createContext<SaveStatusContextValue | undefined>(
  undefined
);

export function SaveStatusProvider({children}: {children: React.ReactNode}) {
  const [saveState, setSaveState] = useState<SaveState>('idle');
  const [lastSavedAt, setLastSavedAt] = useState<number | null>(null);
  const timerRef = useRef<number | null>(null);

  const clearTimer = () => {
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  };

  const markSaving = useCallback(() => {
    clearTimer();
    setSaveState('saving');
  }, []);

  const markSaved = useCallback(() => {
    clearTimer();
    setSaveState('saved');
    setLastSavedAt(Date.now());
    timerRef.current = window.setTimeout(() => {
      setSaveState('idle');
    }, 3500);
  }, []);

  const markError = useCallback(() => {
    clearTimer();
    setSaveState('error');
    timerRef.current = window.setTimeout(() => {
      setSaveState('idle');
    }, 4000);
  }, []);

  return (
    <SaveStatusContext.Provider
      value={{saveState, lastSavedAt, markSaving, markSaved, markError}}
    >
      {children}
    </SaveStatusContext.Provider>
  );
}

export function useSaveStatus() {
  const ctx = useContext(SaveStatusContext);
  if (!ctx) {
    throw new Error('useSaveStatus must be used inside SaveStatusProvider');
  }
  return ctx;
}
