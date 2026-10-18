import { useEffect, useState } from 'react';

export type Route =
  | { name: 'home' }
  | { name: 'analise' }
  | { name: 'ativo'; ticker: string }
  | { name: 'lancar'; ticker?: string }
  | { name: 'ajustes' };

export function parse(hash: string): Route {
  const parts = hash.replace(/^#\/?/, '').split('/').filter(Boolean);
  switch (parts[0]) {
    case 'analise': return { name: 'analise' };
    case 'ativo': return parts[1] ? { name: 'ativo', ticker: decodeURIComponent(parts[1]) } : { name: 'home' };
    case 'lancar': return { name: 'lancar', ticker: parts[1] ? decodeURIComponent(parts[1]) : undefined };
    case 'ajustes': return { name: 'ajustes' };
    default: return { name: 'home' };
  }
}

export const href = {
  home: '#/',
  analise: '#/analise',
  ativo: (t: string) => `#/ativo/${encodeURIComponent(t)}`,
  lancar: (t?: string) => (t ? `#/lancar/${encodeURIComponent(t)}` : '#/lancar'),
  ajustes: '#/ajustes',
};

export const navigate = (h: string) => {
  window.location.hash = h;
};

export function useRoute(): Route {
  const [route, setRoute] = useState(() => parse(window.location.hash));
  useEffect(() => {
    const on = () => {
      setRoute(parse(window.location.hash));
      window.scrollTo(0, 0);
    };
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);
  return route;
}
