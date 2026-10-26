// Adapted from the user-supplied SidebarNav component (same interaction
// language: 260px rail, workspace switcher, collapsible groups, ⌘K search,
// badges, 13px items). Re-skinned to SATARK: the workspace is SATARK, the
// nav actions focus the single Command Center instead of routing away.
import React, { useState } from 'react';
import { Search, LayoutDashboard, FolderKanban, Users, Settings, LogOut, Hash, ChevronDown, ChevronRight, Inbox, Activity, Shield, FlaskConical, History, Radar } from 'lucide-react';

export type NavItemData = { id: string; title: string; icon: React.ElementType; badge?: number | string; shortcut?: string; children?: NavItemData[] };
export type NavGroupData = { heading?: string; items: NavItemData[] };

function NavItem({ item, activeId, onSelect, level = 0 }: { item: NavItemData; activeId: string; onSelect: (id: string) => void; level?: number }) {
  const isActive = activeId === item.id;
  const hasChildren = !!item.children;
  const [isOpen, setIsOpen] = useState(false);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', width: '100%' }}>
      <button type="button" className={`navitem ${isActive ? 'active' : ''}`} style={{ paddingLeft: `${level * 12 + 10}px` }}
        onClick={() => { if (hasChildren) setIsOpen(!isOpen); else onSelect(item.id); }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <item.icon style={{ width: 16, height: 16 }} strokeWidth={1.5} />
          <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{item.title}</span>
        </span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {item.shortcut && <kbd className="mono" style={{ fontSize: 10, border: '1px solid var(--hairline)', borderRadius: 4, padding: '1px 6px', background: '#fff' }}>{item.shortcut}</kbd>}
          {item.badge !== undefined && <span style={{ minWidth: 20, height: 20, padding: '0 6px', fontSize: 10, borderRadius: 999, background: '#fff', color: '#c50000', border: '1px solid #ee0000', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>{item.badge}</span>}
          {hasChildren && <ChevronRight style={{ width: 14, height: 14, transform: isOpen ? 'rotate(90deg)' : 'none', transition: 'transform .2s' }} />}
        </span>
      </button>
      {hasChildren && isOpen && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2, marginTop: 2, borderLeft: '1px solid var(--hairline)', marginLeft: `${level * 12 + 17}px` }}>
          {item.children!.map((c) => <NavItem key={c.id} item={c} activeId={activeId} onSelect={onSelect} level={level + 1} />)}
        </div>
      )}
    </div>
  );
}

export function SidebarNav({ activeId, onSelect, unresolved, onLogout }: { activeId: string; onSelect: (id: string) => void; unresolved: number; onLogout: () => void }) {
  const [wsOpen, setWsOpen] = useState(false);
  const [ws, setWs] = useState('SATARK');
  const groups: NavGroupData[] = [
    { items: [
      { id: 'search', title: 'Search', icon: Search, shortcut: '⌘K' },
      { id: 'command', title: 'Command Center', icon: LayoutDashboard },
      { id: 'advisories', title: 'Advisories', icon: Inbox, badge: unresolved || undefined },
      { id: 'proof', title: 'Proof Mode', icon: FlaskConical },
      { id: 'replay', title: 'Replay', icon: History },
    ]},
    { heading: 'Airspace', items: [
      { id: 'tracks', title: 'Tracks', icon: Radar, children: [
        { id: 'tracks-all', title: 'All tracks', icon: Hash },
        { id: 'tracks-stale', title: 'Stale / lost', icon: Hash },
      ]},
      { id: 'zone', title: 'Exercise Zone Alpha', icon: Shield },
      { id: 'analytics', title: 'Trust analytics', icon: Activity },
    ]},
    { heading: 'Workspace', items: [
      { id: 'projects', title: 'Scenarios', icon: FolderKanban, children: [
        { id: 'scenario-clean', title: 'CLEAN', icon: Hash },
        { id: 'scenario-surge', title: 'ALERT_SURGE', icon: Hash },
      ]},
      { id: 'team', title: 'Demo operator', icon: Users },
    ]},
  ];
  const bottom: NavItemData[] = [
    { id: 'settings', title: 'Simulation settings', icon: Settings },
    { id: 'logout', title: 'Log out', icon: LogOut },
  ];
  const handle = (id: string) => { if (id === 'logout') onLogout(); else onSelect(id); };
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div style={{ position: 'relative' }}>
        <button type="button" onClick={() => setWsOpen(!wsOpen)} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%', padding: '8px', borderRadius: 8, border: 0, background: 'transparent', cursor: 'pointer' }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <span style={{ width: 32, height: 32, borderRadius: 6, background: 'var(--ink)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 600, fontSize: 13 }}>S</span>
            <span style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start' }}>
              <span style={{ fontSize: 13, fontWeight: 500 }}>{ws}</span>
              <span style={{ fontSize: 11, color: 'var(--mute)' }}>Simulation · Demo</span>
            </span>
          </span>
          <ChevronDown style={{ width: 16, height: 16, color: 'var(--mute)' }} />
        </button>
        {wsOpen && (
          <div style={{ position: 'absolute', top: 52, left: 0, right: 0, background: '#fff', border: '1px solid var(--hairline)', borderRadius: 8, boxShadow: '0 8px 24px rgba(0,0,0,.1)', zIndex: 30, padding: 4 }}>
            {['SATARK', 'SATARK: Training'].map((w) => (
              <button type="button" key={w} onClick={() => { setWs(w); setWsOpen(false); }} style={{ display: 'block', width: '100%', textAlign: 'left', padding: '8px 12px', borderRadius: 6, border: 0, background: ws === w ? '#f2f2f2' : 'transparent', cursor: 'pointer', fontSize: 13 }}>{w}</button>
            ))}
            <p style={{ fontSize: 12, color: 'var(--mute)', padding: '4px 12px', margin: 0 }}>Workspace name is a demo label only. It does not imply any official affiliation.</p>
          </div>
        )}
      </div>
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 16, marginTop: 8 }}>
        {groups.map((g, i) => (
          <div key={i} style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            {g.heading && <span style={{ padding: '0 10px', marginBottom: 4, fontSize: 11, fontWeight: 600, letterSpacing: '.08em', textTransform: 'uppercase', color: 'var(--faint)' }}>{g.heading}</span>}
            {g.items.map((it) => <NavItem key={it.id} item={it} activeId={activeId} onSelect={handle} />)}
          </div>
        ))}
      </div>
      <div style={{ borderTop: '1px solid var(--hairline)', paddingTop: 12, display: 'flex', flexDirection: 'column', gap: 2 }}>
        {bottom.map((it) => <NavItem key={it.id} item={it} activeId={activeId} onSelect={handle} />)}
      </div>
    </div>
  );
}
