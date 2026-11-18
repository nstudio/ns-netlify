import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { tokens } from '../../shared';
import { App } from './App';
import './styles.css';

// shared/tokens.ts is the single source for the design language; CSS reads these.
const root = document.documentElement.style;
const kebab = (s: string) => s.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`);
for (const [k, v] of Object.entries(tokens.color)) root.setProperty(`--${kebab(k)}`, v);
for (const [k, v] of Object.entries(tokens.radius)) root.setProperty(`--radius-${k}`, `${v}px`);
for (const [k, v] of Object.entries(tokens.font)) root.setProperty(`--font-${k}`, v);

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
