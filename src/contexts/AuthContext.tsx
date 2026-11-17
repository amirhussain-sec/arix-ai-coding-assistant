import {useQuery, useQueryClient} from '@tanstack/react-query';
import React, {createContext, useCallback, useContext} from 'react';
import {ApiError, apiFetch, setStoredSessionToken} from '../lib/api';
import type {UserProfile, UserSettings} from '../lib/types';
import {useSaveStatus} from './SaveStatusContext';

interface AuthMeResponse {
  profile: UserProfile;
  settings: UserSettings;
  sessionToken?: string;
}

interface AuthContextValue {
  user: UserProfile | null;
  settings: UserSettings | null;
  isLoading: boolean;
  signUp: (input: {
    email: string;
    password: string;
    displayName?: string;
  }) => Promise<void>;
  signIn: (input: {email: string; password: string}) => Promise<void>;
  signOut: () => Promise<void>;
  updateProfile: (input: {
    displayName: string;
    preferredLanguage: string;
    onboarded?: boolean;
  }) => Promise<void>;
  updateSettings: (input: Partial<UserSettings>) => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({children}: {children: React.ReactNode}) {
  const queryClient = useQueryClient();
  const {markSaving, markSaved, markError} = useSaveStatus();

  const {data, isLoading} = useQuery({
    queryKey: ['auth', 'me'],
    queryFn: async () => {
      try {
        return await apiFetch<AuthMeResponse>('/api/auth/me');
      } catch (err) {
        if (err instanceof ApiError && err.status === 401) {
          return null;
        }
        throw err;
      }
    },
    retry: false,
    staleTime: 60_000,
  });

  const signUp = useCallback(
    async (input: {email: string; password: string; displayName?: string}) => {
      const res = await apiFetch<AuthMeResponse>('/api/auth/signup', {
        method: 'POST',
        body: JSON.stringify(input),
      });
      if (res.sessionToken) {
        setStoredSessionToken(res.sessionToken);
      }
      queryClient.setQueryData(['auth', 'me'], {
        profile: res.profile,
        settings: res.settings,
      });
      await queryClient.invalidateQueries({queryKey: ['dashboard']});
      await queryClient.invalidateQueries({queryKey: ['projects']});
    },
    [queryClient]
  );

  const signIn = useCallback(
    async (input: {email: string; password: string}) => {
      const res = await apiFetch<AuthMeResponse>('/api/auth/signin', {
        method: 'POST',
        body: JSON.stringify(input),
      });
      if (res.sessionToken) {
        setStoredSessionToken(res.sessionToken);
      }
      queryClient.setQueryData(['auth', 'me'], {
        profile: res.profile,
        settings: res.settings,
      });
      await queryClient.invalidateQueries({queryKey: ['dashboard']});
      await queryClient.invalidateQueries({queryKey: ['projects']});
    },
    [queryClient]
  );

  const signOut = useCallback(async () => {
    try {
      await apiFetch('/api/auth/signout', {method: 'POST'});
    } finally {
      setStoredSessionToken(null);
      queryClient.setQueryData(['auth', 'me'], null);
      queryClient.removeQueries({queryKey: ['dashboard']});
      queryClient.removeQueries({queryKey: ['projects']});
    }
  }, [queryClient]);

  const updateProfile = useCallback(
    async (input: {
      displayName: string;
      preferredLanguage: string;
      onboarded?: boolean;
    }) => {
      markSaving();
      try {
        const res = await apiFetch<{profile: UserProfile}>('/api/profile', {
          method: 'PATCH',
          body: JSON.stringify(input),
        });
        queryClient.setQueryData<AuthMeResponse | null>(['auth', 'me'], (prev) =>
          prev ? {...prev, profile: res.profile} : prev
        );
        markSaved();
      } catch (err) {
        markError();
        throw err;
      }
    },
    [markError, markSaved, markSaving, queryClient]
  );

  const updateSettings = useCallback(
    async (input: Partial<UserSettings>) => {
      markSaving();
      try {
        const res = await apiFetch<{settings: UserSettings}>('/api/settings', {
          method: 'PATCH',
          body: JSON.stringify(input),
        });
        queryClient.setQueryData<AuthMeResponse | null>(['auth', 'me'], (prev) =>
          prev ? {...prev, settings: res.settings} : prev
        );
        markSaved();
      } catch (err) {
        markError();
        throw err;
      }
    },
    [markError, markSaved, markSaving, queryClient]
  );

  return (
    <AuthContext.Provider
      value={{
        user: data?.profile ?? null,
        settings: data?.settings ?? null,
        isLoading,
        signUp,
        signIn,
        signOut,
        updateProfile,
        updateSettings,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used inside AuthProvider');
  }
  return ctx;
}
