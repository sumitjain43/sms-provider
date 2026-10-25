'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  LayoutDashboard,
  MessageSquare,
  Smartphone,
  KeyRound,
  Radio,
  ShieldBan,
  Webhook,
  Terminal,
} from 'lucide-react';

const navItems = [
  { name: 'Overview', href: '/', icon: LayoutDashboard },
  { name: 'Messages', href: '/messages', icon: MessageSquare },
  { name: 'Devices & SIMs', href: '/devices', icon: Smartphone },
  { name: 'OTP Sandbox', href: '/otp', icon: KeyRound },
  { name: 'Broadcasts', href: '/broadcasts', icon: Radio },
  { name: 'Opt-Outs', href: '/opt-outs', icon: ShieldBan },
  { name: 'Webhooks', href: '/webhooks', icon: Webhook },
  { name: 'API Keys', href: '/api-keys', icon: Terminal },
];

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="w-64 bg-slate-900 text-slate-100 flex flex-col border-r border-slate-800">
      <div className="p-6 border-b border-slate-800 flex items-center space-x-3">
        <div className="h-9 w-9 bg-emerald-500 rounded-lg flex items-center justify-center text-slate-950 font-bold text-lg">
          SG
        </div>
        <div>
          <h1 className="font-bold text-base tracking-tight leading-tight">SMS Gateway</h1>
          <span className="text-xs text-slate-400 font-mono">Self-Hosted</span>
        </div>
      </div>

      <nav className="flex-1 px-4 py-6 space-y-1.5 overflow-y-auto">
        {navItems.map((item) => {
          const isActive = pathname === item.href;
          const Icon = item.icon;
          return (
            <Link
              key={item.name}
              href={item.href}
              className={`flex items-center space-x-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                isActive
                  ? 'bg-emerald-600/20 text-emerald-400 border border-emerald-500/30'
                  : 'text-slate-400 hover:text-slate-100 hover:bg-slate-800/60'
              }`}
            >
              <Icon className="h-4 w-4 shrink-0" />
              <span>{item.name}</span>
            </Link>
          );
        })}
      </nav>

      <div className="p-4 border-t border-slate-800 text-xs text-slate-400 space-y-2">
        <div className="flex items-center justify-between">
          <span>Mode</span>
          <span className="px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-mono">
            Simulator
          </span>
        </div>
        <div className="flex items-center justify-between">
          <span>Status</span>
          <span className="flex items-center text-emerald-400">
            <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse mr-1.5" />
            Healthy
          </span>
        </div>
      </div>
    </aside>
  );
}
