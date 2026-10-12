import { useEffect, useState } from 'react';

const Q = '(max-width: 820px), (pointer: coarse) and (max-width: 1024px)';
export const isMobileNow = () => typeof window !== 'undefined' && window.matchMedia(Q).matches;

/** true en teléfonos y tabletas pequeñas (interfaz tipo app). */
export function useMobile() {
  const [m, setM] = useState(isMobileNow);
  useEffect(() => {
    const mq = window.matchMedia(Q);
    const on = () => setM(mq.matches);
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, []);
  return m;
}
