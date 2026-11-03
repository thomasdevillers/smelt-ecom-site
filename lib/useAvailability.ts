'use client';
import { useEffect, useState, useCallback } from 'react';
import type { Availability } from './preorders';
export function useAvailability() {
  const [stock, setStock] = useState<Availability | null>(null);
  const [error, setError] = useState('');
  const refresh = useCallback(async () => {
    try {
      const response = await fetch('/api/inventory', { cache: 'no-store' });
      if (!response.ok) throw new Error();
      const data = await response.json();
      if (![data.green, data.cream, data.preorder?.green, data.preorder?.cream].every(n => Number.isSafeInteger(n) && n >= 0)) throw new Error();
      setStock(data); setError('');
    } catch { setStock(null); setError('We couldn’t check availability. Please try again.'); }
  }, []);
  useEffect(() => {
    queueMicrotask(() => void refresh());
    const interval = setInterval(() => void refresh(), 30_000);
    const focus = () => void refresh();
    window.addEventListener('focus', focus);
    return () => { clearInterval(interval); window.removeEventListener('focus', focus); };
  }, [refresh]);
  return { stock, error, refresh };
}
