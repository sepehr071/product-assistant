'use client';

import { useEffect } from 'react';

const BARCODE = /^[0-9]{8,14}$/;

export function useHidBarcode(onScan: (barcode: string) => void) {
  useEffect(() => {
    let buffer = '';
    let last = 0;

    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')) {
        return;
      }
      const now = Date.now();
      if (now - last > 80) {
        buffer = '';
      }
      last = now;
      if (event.key === 'Enter') {
        if (BARCODE.test(buffer)) {
          onScan(buffer);
        }
        buffer = '';
        return;
      }
      if (/^\d$/.test(event.key)) {
        buffer += event.key;
      }
    };

    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onScan]);
}
