import { useSyncExternalStore } from 'react';

const query = '(prefers-color-scheme: dark)';

const subscribe = (listener: () => void) => {
  const media = window.matchMedia(query);
  media.addEventListener('change', listener);
  return () => media.removeEventListener('change', listener);
};

/** Whether the system is set to dark, kept current as the setting changes. */
export const useSystemDark = () => useSyncExternalStore(subscribe, () => window.matchMedia(query).matches);
