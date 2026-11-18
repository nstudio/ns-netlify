import { useSyncExternalStore, type AnchorHTMLAttributes, type MouseEvent } from 'react';

const listeners = new Set<() => void>();

function subscribe(listener: () => void) {
  listeners.add(listener);
  window.addEventListener('popstate', listener);
  return () => {
    listeners.delete(listener);
    window.removeEventListener('popstate', listener);
  };
}

const snapshot = () => location.pathname + location.search;

export function navigate(to: string, { replace = false } = {}) {
  if (to === snapshot()) return;
  history[replace ? 'replaceState' : 'pushState'](null, '', to);
  if (!replace) window.scrollTo(0, 0);
  for (const l of listeners) l();
}

export interface Route {
  path: string;
  search: URLSearchParams;
}

export function useRoute(): Route {
  const href = useSyncExternalStore(subscribe, snapshot);
  const [path, search = ''] = href.split('?');
  return { path: path || '/', search: new URLSearchParams(search) };
}

export function Link({ to, onClick, ...rest }: AnchorHTMLAttributes<HTMLAnchorElement> & { to: string }) {
  const handle = (e: MouseEvent<HTMLAnchorElement>) => {
    onClick?.(e);
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    e.preventDefault();
    navigate(to);
  };
  return <a href={to} onClick={handle} {...rest} />;
}
