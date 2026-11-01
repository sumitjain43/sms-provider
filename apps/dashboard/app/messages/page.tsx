'use client';

import React, { useEffect, useState } from 'react';
import { MessageSquare, RefreshCw, Eye, X, Clock, CheckCircle2, AlertCircle, Send, Plus } from 'lucide-react';

interface MessageItem {
  id: string;
  toRedacted: string;
  status: string;
  errorMessage?: string;
  idempotencyKey?: string;
  createdAt: string;
}

interface MessageDetail {
  id: string;
  to: string;
  body: string;
  status: string;
  errorMessage?: string;
  idempotencyKey?: string;
  createdAt: string;
  events: Array<{
    id: string;
    type: string;
    timestamp: string;
    metadata: any;
  }>;
}

export default function MessagesPage() {
  const [messages, setMessages] = useState<MessageItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('');
  const [selectedMessage, setSelectedMessage] = useState<MessageDetail | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [showCompose, setShowCompose] = useState(false);
  const [composeTo, setComposeTo] = useState('+917375060497');
  const [composeBody, setComposeBody] = useState('Hello! Yeh SMS mere real Android phone SIM se bheja gaya hai.');
  const [isSending, setIsSending] = useState(false);
  const [composeFeedback, setComposeFeedback] = useState<string | null>(null);

  const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8080';
  const API_KEY = process.env.NEXT_PUBLIC_API_KEY || 'bk_test_demo_secret_key_123456789';

  const fetchMessages = async () => {
    setLoading(true);
    try {
      const query = statusFilter ? `?status=${statusFilter}` : '';
      const res = await fetch(`${API_BASE}/v1/messages${query}`, {
        headers: { Authorization: `Bearer ${API_KEY}` },
      });
      const data = await res.json();
      setMessages(data.data || []);
    } catch (err) {
      console.error('Failed to load messages:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchMessages();
  }, [statusFilter]);

  const openMessageDetail = async (id: string) => {
    setLoadingDetail(true);
    try {
      const res = await fetch(`${API_BASE}/v1/messages/${id}`, {
        headers: { Authorization: `Bearer ${API_KEY}` },
      });
      const data = await res.json();
      setSelectedMessage(data);
    } catch (err) {
      console.error('Failed to load message detail:', err);
    } finally {
      setLoadingDetail(false);
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'sent':
      case 'simulated':
        return 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20';
      case 'queued':
        return 'bg-amber-500/10 text-amber-400 border-amber-500/20';
      case 'leased':
        return 'bg-blue-500/10 text-blue-400 border-blue-500/20';
      case 'failed':
        return 'bg-red-500/10 text-red-400 border-red-500/20';
      default:
        return 'bg-slate-700 text-slate-300 border-slate-600';
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-white">Message Queue & History</h1>
          <p className="text-sm text-slate-400">
            Inspect all SMS messages, idempotency leases, and lifecycle timelines.
          </p>
        </div>

        <div className="flex items-center space-x-3">
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-sm text-white focus:outline-none"
          >
            <option value="">All Statuses</option>
            <option value="queued">Queued</option>
            <option value="leased">Leased</option>
            <option value="simulated">Simulated</option>
            <option value="sent">Sent</option>
            <option value="failed">Failed</option>
          </select>

          <button
            onClick={fetchMessages}
            className="p-2 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-lg text-slate-300 transition-colors"
          >
            <RefreshCw className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Messages Table */}
      <div className="bg-slate-800/60 border border-slate-700/60 rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-900/60 text-slate-400 text-xs uppercase font-medium border-b border-slate-700/60">
              <tr>
                <th className="px-6 py-3.5">ID</th>
                <th className="px-6 py-3.5">Recipient</th>
                <th className="px-6 py-3.5">Status</th>
                <th className="px-6 py-3.5">Idempotency Key</th>
                <th className="px-6 py-3.5">Dispatched At</th>
                <th className="px-6 py-3.5 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-700/40 text-slate-300 font-mono text-xs">
              {loading ? (
                <tr>
                  <td colSpan={6} className="px-6 py-12 text-center text-slate-500 font-sans">
                    Loading messages...
                  </td>
                </tr>
              ) : messages.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-6 py-12 text-center text-slate-500 font-sans">
                    No messages found. Dispatch one from the Overview page!
                  </td>
                </tr>
              ) : (
                messages.map((m) => (
                  <tr key={m.id} className="hover:bg-slate-700/20 transition-colors">
                    <td className="px-6 py-4 font-semibold text-white">
                      {m.id.slice(0, 8)}...
                    </td>
                    <td className="px-6 py-4 text-emerald-400">{m.toRedacted}</td>
                    <td className="px-6 py-4">
                      <span className={`px-2 py-0.5 rounded border text-[11px] font-semibold ${getStatusBadge(m.status)}`}>
                        {m.status}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-slate-400">
                      {m.idempotencyKey || '—'}
                    </td>
                    <td className="px-6 py-4 text-slate-400 font-sans">
                      {new Date(m.createdAt).toLocaleString()}
                    </td>
                    <td className="px-6 py-4 text-right">
                      <button
                        onClick={() => openMessageDetail(m.id)}
                        className="px-2.5 py-1 bg-slate-700 hover:bg-slate-600 rounded text-white flex items-center space-x-1 ml-auto font-sans text-xs transition-colors"
                      >
                        <Eye className="h-3 w-3" />
                        <span>Timeline</span>
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Message Timeline & Detail Modal */}
      {selectedMessage && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-700 rounded-xl max-w-lg w-full p-6 space-y-6 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div>
                <h3 className="text-lg font-bold text-white">Message Details & Timeline</h3>
                <p className="text-xs font-mono text-slate-400">ID: {selectedMessage.id}</p>
              </div>
              <button
                onClick={() => setSelectedMessage(null)}
                className="text-slate-400 hover:text-white"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="space-y-3 text-sm">
              <div className="bg-slate-950 p-3 rounded-lg border border-slate-800 space-y-2">
                <div className="flex justify-between">
                  <span className="text-slate-400 text-xs">Recipient:</span>
                  <span className="font-mono text-emerald-400 text-xs">{selectedMessage.to}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400 text-xs">Status:</span>
                  <span className={`px-2 py-0.5 rounded border text-[11px] font-semibold ${getStatusBadge(selectedMessage.status)}`}>
                    {selectedMessage.status}
                  </span>
                </div>
                <div>
                  <span className="text-slate-400 text-xs block mb-1">Body Text:</span>
                  <div className="p-2 bg-slate-900 rounded text-slate-200 text-xs font-mono">
                    "{selectedMessage.body}"
                  </div>
                </div>
              </div>

              {/* Timeline */}
              <div>
                <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-3 flex items-center space-x-1.5">
                  <Clock className="h-3.5 w-3.5" />
                  <span>Append-Only Lifecycle Timeline</span>
                </h4>
                <div className="space-y-2 border-l-2 border-slate-800 pl-4 ml-2">
                  {selectedMessage.events.map((evt, idx) => (
                    <div key={evt.id} className="relative">
                      <div className="absolute -left-[21px] top-1 h-2.5 w-2.5 rounded-full bg-emerald-500" />
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-mono font-semibold text-emerald-300">
                          {evt.type}
                        </span>
                        <span className="text-slate-500 text-[11px]">
                          {new Date(evt.timestamp).toLocaleTimeString()}
                        </span>
                      </div>
                      {evt.metadata && (
                        <pre className="text-[10px] text-slate-400 bg-slate-950 p-1.5 rounded mt-1 overflow-x-auto">
                          {JSON.stringify(evt.metadata, null, 2)}
                        </pre>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <button
              onClick={() => setSelectedMessage(null)}
              className="w-full py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg text-sm font-medium transition-colors"
            >
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
