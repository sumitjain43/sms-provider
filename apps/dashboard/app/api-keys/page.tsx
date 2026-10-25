'use client';

import React, { useState, useEffect } from 'react';
import { Terminal, Plus, ShieldAlert, Copy, Check, RefreshCw } from 'lucide-react';

export default function ApiKeysPage() {
  const [keys, setKeys] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [keyName, setKeyName] = useState('Integration Backend');
  const [newKeyData, setNewKeyData] = useState<any | null>(null);
  const [copied, setCopied] = useState(false);

  const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8080';
  const API_KEY = process.env.NEXT_PUBLIC_API_KEY || 'bk_test_demo_secret_key_123456789';

  const fetchKeys = async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/v1/projects/api-keys`, {
        headers: { Authorization: `Bearer ${API_KEY}` },
      });
      const data = await res.json();
      setKeys(data.keys || []);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchKeys();
  }, []);

  const handleCreateKey = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await fetch(`${API_BASE}/v1/projects/api-keys`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${API_KEY}`,
        },
        body: JSON.stringify({ name: keyName, scopes: ['*'] }),
      });
      const data = await res.json();
      if (res.ok) {
        setNewKeyData(data);
        fetchKeys();
      }
    } catch (err: any) {
      alert(`Error creating key: ${err.message}`);
    }
  };

  const handleRevoke = async (id: string) => {
    if (!confirm('Are you sure you want to revoke this API key? This action is irreversible.')) {
      return;
    }
    try {
      await fetch(`${API_BASE}/v1/projects/api-keys/${id}/revoke`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${API_KEY}` },
      });
      fetchKeys();
    } catch (e) {
      console.error(e);
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-white">API Keys & Access Tokens</h1>
          <p className="text-sm text-slate-400">
            Cryptographically hashed Bearer tokens for server-to-server REST API access.
          </p>
        </div>

        <button
          onClick={fetchKeys}
          className="p-2.5 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-lg text-slate-300 transition-colors self-start"
        >
          <RefreshCw className="h-4 w-4" />
        </button>
      </div>

      {/* Secret Banner if newly created */}
      {newKeyData && (
        <div className="p-4 bg-emerald-500/10 border border-emerald-500/30 rounded-xl space-y-2">
          <div className="flex items-center space-x-2 text-emerald-400 font-semibold text-sm">
            <Check className="h-4 w-4" />
            <span>New API Key Generated Successfully</span>
          </div>
          <p className="text-xs text-slate-300">
            Copy this secret now. Following blueprint security guidelines, raw secrets are never stored in plaintext and cannot be retrieved again:
          </p>
          <div className="flex items-center space-x-2 bg-slate-950 p-2.5 rounded-lg border border-slate-800">
            <code className="text-emerald-400 text-xs font-mono flex-1 break-all">
              {newKeyData.secret}
            </code>
            <button
              onClick={() => copyToClipboard(newKeyData.secret)}
              className="p-2 bg-slate-800 hover:bg-slate-700 rounded text-slate-300 transition-colors"
            >
              {copied ? <Check className="h-4 w-4 text-emerald-400" /> : <Copy className="h-4 w-4" />}
            </button>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        {/* Create Key Form */}
        <div className="lg:col-span-4 p-6 rounded-xl bg-slate-800/60 border border-slate-700/60 space-y-4">
          <div className="flex items-center space-x-2 border-b border-slate-700 pb-3">
            <Plus className="h-5 w-5 text-emerald-400" />
            <h2 className="text-base font-semibold text-white">Create New Key</h2>
          </div>

          <form onSubmit={handleCreateKey} className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1">
                Key Label / Description
              </label>
              <input
                type="text"
                value={keyName}
                onChange={(e) => setKeyName(e.target.value)}
                placeholder="e.g. Production Backend"
                className="w-full px-3.5 py-2 bg-slate-900 border border-slate-700 rounded-lg text-sm text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500"
                required
              />
            </div>

            <button
              type="submit"
              className="w-full py-2.5 px-4 bg-emerald-600 hover:bg-emerald-500 text-slate-950 font-semibold rounded-lg text-sm transition-colors"
            >
              Generate Scoped Key
            </button>
          </form>
        </div>

        {/* Keys Table */}
        <div className="lg:col-span-8 bg-slate-800/60 border border-slate-700/60 rounded-xl overflow-hidden">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-900/60 text-slate-400 text-xs uppercase font-medium border-b border-slate-700/60">
              <tr>
                <th className="px-6 py-3.5">Name</th>
                <th className="px-6 py-3.5">Prefix</th>
                <th className="px-6 py-3.5">Status</th>
                <th className="px-6 py-3.5">Last Used</th>
                <th className="px-6 py-3.5 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-700/40 text-slate-300 font-mono text-xs">
              {loading ? (
                <tr>
                  <td colSpan={5} className="px-6 py-12 text-center text-slate-500 font-sans">
                    Loading keys...
                  </td>
                </tr>
              ) : (
                keys.map((k) => (
                  <tr key={k.id} className="hover:bg-slate-700/20 transition-colors">
                    <td className="px-6 py-4 font-semibold text-white font-sans">{k.name}</td>
                    <td className="px-6 py-4 text-emerald-400">{k.prefix}••••••••</td>
                    <td className="px-6 py-4 font-sans">
                      {k.revokedAt ? (
                        <span className="px-2 py-0.5 rounded text-[11px] font-semibold bg-red-500/10 text-red-400 border border-red-500/20">
                          Revoked
                        </span>
                      ) : (
                        <span className="px-2 py-0.5 rounded text-[11px] font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                          Active
                        </span>
                      )}
                    </td>
                    <td className="px-6 py-4 text-slate-400 font-sans">
                      {k.lastUsedAt ? new Date(k.lastUsedAt).toLocaleDateString() : 'Never'}
                    </td>
                    <td className="px-6 py-4 text-right font-sans">
                      {!k.revokedAt && (
                        <button
                          onClick={() => handleRevoke(k.id)}
                          className="px-2.5 py-1 text-red-400 hover:bg-red-500/10 rounded transition-colors text-xs"
                        >
                          Revoke
                        </button>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
