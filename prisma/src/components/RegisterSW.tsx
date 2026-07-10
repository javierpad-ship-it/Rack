'use client';

import { useEffect } from 'react';

// Registra el service worker (PWA instalable) una vez montada la app.
export default function RegisterSW() {
  useEffect(() => {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js').catch(() => {});
    }
  }, []);
  return null;
}
