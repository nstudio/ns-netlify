import type { ReactNode } from 'react';
import { Icon } from './ui';
import { systemBars } from '../platform/insets';
import type { IconName } from '../platform/icons';
import { DEPLOY } from '../config';

export type Tab = 'notes' | 'capture' | 'map';

/** Which backend a phone is on, shown on everything but production: a preview's data is its own database branch. */
function deployLabel(): string | null {
  const { context } = DEPLOY;
  const branch = (DEPLOY as { branch?: string }).branch;
  if (context === 'production') return null;
  if (context === 'deploy-preview') return branch ? `PREVIEW · ${branch.toUpperCase()}` : 'PREVIEW';
  if (context === 'branch-deploy') return branch ? branch.toUpperCase() : 'BRANCH';
  return 'DEV';
}

export function Header({ title, sub, right, children }: { title: string; sub?: string; right?: ReactNode; children?: ReactNode }) {
  return (
    <stacklayout className="header" paddingTop={6 + systemBars().top}>
      <gridlayout columns="auto, auto, *, auto" height={34}>
        <stacklayout className="brand-dot" verticalAlignment="middle" />
        <label col={1} text="FIELD NOTES" className="brand" verticalAlignment="middle" />
        {deployLabel() ? <label col={2} text={deployLabel()!} className="deploy-pill" horizontalAlignment="left" verticalAlignment="middle" /> : null}
        <stacklayout col={3} orientation="horizontal" verticalAlignment="middle">
          {right}
        </stacklayout>
      </gridlayout>
      <label text={title} className="header-title" />
      {sub ? <label text={sub} className="header-sub" textWrap /> : null}
      {children}
    </stacklayout>
  );
}

export function LivePill({ live }: { live: boolean }) {
  return (
    <stacklayout orientation="horizontal" className="live-pill" verticalAlignment="middle">
      <stacklayout className={`live-dot ${live ? 'on' : ''}`} verticalAlignment="middle" />
      <label text={live ? 'Live' : 'Connecting'} className={`live-text ${live ? 'on' : ''}`} verticalAlignment="middle" />
    </stacklayout>
  );
}

function TabItem({ tab, col, active, name, label, onSelect }: { tab: Tab; col: number; active: boolean; name: IconName; label: string; onSelect: (t: Tab) => void }) {
  return (
    <stacklayout col={col} className="tab" onTap={() => onSelect(tab)}>
      <Icon name={name} size={24} className={`tab-icon ${active ? 'active' : ''}`} />
      <label text={label} className={`tab-label ${active ? 'active' : ''}`} />
      <stacklayout className={`tab-indicator ${active ? 'active' : ''}`} />
    </stacklayout>
  );
}

export function TabBar({ tab, onSelect }: { tab: Tab; onSelect: (t: Tab) => void }) {
  return (
    <gridlayout columns="*, auto, *" className="tabbar" paddingBottom={4 + systemBars().bottom}>
      <TabItem tab="notes" col={0} active={tab === 'notes'} name="notes" label="Notes" onSelect={onSelect} />
      <gridlayout col={1} className={`capture-tab ${tab === 'capture' ? 'active' : ''}`} onTap={() => onSelect('capture')} verticalAlignment="middle">
        <Icon name="camera" size={26} className="capture-tab-icon" />
      </gridlayout>
      <TabItem tab="map" col={2} active={tab === 'map'} name="map" label="Map" onSelect={onSelect} />
    </gridlayout>
  );
}
