import { useEffect, useRef, useState, type ReactNode } from 'react';
import { APP_NAME, type User } from '../../../shared';
import type { NativeInfo } from '../lib/native';
import { initials } from '../lib/notes';
import { Link } from '../lib/router';
import { auth } from '../lib/session';
import { CaptureCard } from './CaptureCard';
import { Icon, Mark } from './Icon';

function Popover({ open, onClose, children, className }: { open: boolean; onClose: () => void; children: ReactNode; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      const anchor = ref.current?.parentElement;
      if (anchor && !anchor.contains(e.target as Node)) onClose();
    };
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('pointerdown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div ref={ref} className={`popover ${className ?? ''}`} role="dialog">
      {children}
    </div>
  );
}

export function LivePill({ live }: { live: boolean }) {
  return (
    <span className={`live-pill ${live ? 'is-live' : ''}`} role="status" title={live ? 'New notes from your phone appear instantly' : 'Reconnecting'}>
      <span className="live-dot" />
      <span className="live-label">{live ? 'Live' : 'Connecting'}</span>
    </span>
  );
}

export function Header({ user, live, path, native }: { user: User; live: boolean; path: string; native: NativeInfo | null | undefined }) {
  const [menu, setMenu] = useState<'phone' | 'user' | null>(null);
  const close = () => setMenu(null);
  const toggle = (m: 'phone' | 'user') => setMenu((cur) => (cur === m ? null : m));
  const isMap = path === '/map';
  const isTimeline = path === '/' || path.startsWith('/notes/');

  return (
    <header className="topbar">
      <div className="topbar-inner">
        <Link to="/" className="brand" aria-label={`${APP_NAME}, timeline`}>
          <Mark size={30} />
          <span className="brand-name">{APP_NAME}</span>
        </Link>

        <nav className="nav" aria-label="Views">
          <Link to="/" className={`nav-link ${isTimeline ? 'is-active' : ''}`} aria-current={path === '/' ? 'page' : undefined}>
            <Icon name="timeline" size={17} />
            <span className="nav-label">Timeline</span>
          </Link>
          <Link to="/map" className={`nav-link ${isMap ? 'is-active' : ''}`} aria-current={isMap ? 'page' : undefined}>
            <Icon name="map" size={17} />
            <span className="nav-label">Map</span>
          </Link>
        </nav>

        <div className="topbar-actions">
          <LivePill live={live} />
          {native && (
            <div className="anchor">
              <button
                type="button"
                className={`phone-button ${menu === 'phone' ? 'is-open' : ''}`}
                aria-expanded={menu === 'phone'}
                aria-haspopup="dialog"
                onClick={() => toggle('phone')}
              >
                <Icon name="phone" size={16} />
                <span className="phone-button-label">On your phone</span>
              </button>
              <Popover open={menu === 'phone'} onClose={close} className="popover-phone">
                <CaptureCard info={native} variant="popover" />
              </Popover>
            </div>
          )}
          <div className="anchor">
            <button
              type="button"
              className="avatar"
              aria-label="Account"
              aria-expanded={menu === 'user'}
              aria-haspopup="menu"
              onClick={() => toggle('user')}
            >
              {initials(user)}
            </button>
            <Popover open={menu === 'user'} onClose={close} className="popover-user">
              <div className="user-card">
                <span className="avatar avatar-lg">{initials(user)}</span>
                <div>
                  {user.name && <p className="user-name">{user.name}</p>}
                  <p className="user-email">{user.email}</p>
                </div>
              </div>
              <p className="user-identity">
                <Icon name="check" size={14} /> Signed in with Netlify Identity
              </p>
              <button type="button" className="menu-item" onClick={() => auth.logOut()}>
                <Icon name="logout" size={16} /> Sign out
              </button>
            </Popover>
          </div>
        </div>
      </div>
    </header>
  );
}
