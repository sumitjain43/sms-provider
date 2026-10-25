'use client';

import React, { useState } from 'react';
import { KeyRound, CheckCircle2, AlertCircle, Clock, ShieldCheck } from 'lucide-react';

export default function OtpPage() {
  const [phone, setPhone] = useState('+919876543210');
  const [customTemplate, setCustomTemplate] = useState('Your secure code is {{code}}. Valid for 5 minutes.');
  const [otpCode, setOtpCode] = useState('');
  const [activeSession, setActiveSession] = useState<{
    verificationId: string;
    phone: string;
    expiresAt: string;
    code?: string;
  } | null>(null);

  const [loadingSend, setLoadingSend] = useState(false);
  const [loadingVerify, setLoadingVerify] = useState(false);
  const [sendMsg, setSendMsg] = useState<string | null>(null);
  const [verifyMsg, setVerifyMsg] = useState<{ success: boolean; text: string } | null>(null);

  const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8080';
  const API_KEY = process.env.NEXT_PUBLIC_API_KEY || 'bk_test_demo_secret_key_123456789';

  const handleSendOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoadingSend(true);
    setSendMsg(null);
    setVerifyMsg(null);

    try {
      const res = await fetch(`${API_BASE}/v1/otp/send`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${API_KEY}`,
        },
        body: JSON.stringify({ phone, template: customTemplate }),
      });
      const data = await res.json();
      if (res.ok) {
        setActiveSession(data);
        setSendMsg(`✓ OTP generated and queued for ${data.phone}`);
        if (data.code) {
          setOtpCode(data.code);
        }
      } else {
        setSendMsg(`✗ Error: ${data.error}`);
      }
    } catch (err: any) {
      setSendMsg(`✗ Request failed: ${err.message}`);
    } finally {
      setLoadingSend(false);
    }
  };

  const handleVerifyOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoadingVerify(true);
    setVerifyMsg(null);

    try {
      const res = await fetch(`${API_BASE}/v1/otp/verify`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${API_KEY}`,
        },
        body: JSON.stringify({ phone, code: otpCode }),
      });
      const data = await res.json();
      if (res.ok && data.verified) {
        setVerifyMsg({ success: true, text: `✓ ${data.message}` });
        setActiveSession(null);
      } else {
        setVerifyMsg({ success: false, text: `✗ ${data.error || 'Verification failed'}` });
      }
    } catch (err: any) {
      setVerifyMsg({ success: false, text: `✗ Request failed: ${err.message}` });
    } finally {
      setLoadingVerify(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-white">OTP Verification Engine</h1>
        <p className="text-sm text-slate-400">
          Server-side cryptographic OTP generator with secret pepper hashing, 5-minute expiry, and brute-force attempt limits.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Step 1: Send OTP */}
        <div className="p-6 rounded-xl bg-slate-800/60 border border-slate-700/60 space-y-4">
          <div className="flex items-center space-x-2 border-b border-slate-700 pb-3">
            <KeyRound className="h-5 w-5 text-emerald-400" />
            <h2 className="text-base font-semibold text-white">Step 1: Request 6-Digit Code</h2>
          </div>

          <form onSubmit={handleSendOtp} className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1">
                Recipient Phone (E.164)
              </label>
              <input
                type="text"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="+919876543210"
                className="w-full px-3.5 py-2 bg-slate-900 border border-slate-700 rounded-lg text-sm text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500"
                required
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1">
                Message Body Template
              </label>
              <input
                type="text"
                value={customTemplate}
                onChange={(e) => setCustomTemplate(e.target.value)}
                placeholder="Your code is {{code}}"
                className="w-full px-3.5 py-2 bg-slate-900 border border-slate-700 rounded-lg text-sm text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500"
                required
              />
              <span className="text-[11px] text-slate-400">
                Use <code className="text-emerald-400">{"{{code}}"}</code> as placeholder for the 6-digit number.
              </span>
            </div>

            <button
              type="submit"
              disabled={loadingSend}
              className="w-full py-2.5 px-4 bg-emerald-600 hover:bg-emerald-500 text-slate-950 font-semibold rounded-lg text-sm transition-colors disabled:opacity-50"
            >
              {loadingSend ? 'Generating & Queuing...' : 'Generate & Send OTP'}
            </button>
          </form>

          {sendMsg && (
            <div
              className={`p-3 rounded-lg text-xs font-mono ${
                sendMsg.startsWith('✓')
                  ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                  : 'bg-red-500/10 text-red-400 border border-red-500/20'
              }`}
            >
              {sendMsg}
            </div>
          )}
        </div>

        {/* Step 2: Verify Code */}
        <div className="p-6 rounded-xl bg-slate-800/60 border border-slate-700/60 space-y-4">
          <div className="flex items-center space-x-2 border-b border-slate-700 pb-3">
            <ShieldCheck className="h-5 w-5 text-emerald-400" />
            <h2 className="text-base font-semibold text-white">Step 2: Verify Submitted Code</h2>
          </div>

          <form onSubmit={handleVerifyOtp} className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1">
                Active Verification Session
              </label>
              <div className="p-3 bg-slate-950 border border-slate-800 rounded-lg text-xs font-mono space-y-1 text-slate-300">
                <div className="flex justify-between">
                  <span className="text-slate-500">Phone:</span>
                  <span>{phone}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Status:</span>
                  <span className={activeSession ? 'text-amber-400' : 'text-slate-400'}>
                    {activeSession ? 'Awaiting Verification' : 'No Active OTP Request'}
                  </span>
                </div>
                {activeSession?.code && (
                  <div className="flex justify-between text-emerald-400 font-bold">
                    <span>Dev Simulator Code:</span>
                    <span>{activeSession.code}</span>
                  </div>
                )}
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1">
                Enter 6-Digit Code
              </label>
              <input
                type="text"
                maxLength={6}
                value={otpCode}
                onChange={(e) => setOtpCode(e.target.value)}
                placeholder="123456"
                className="w-full px-3.5 py-2 bg-slate-900 border border-slate-700 rounded-lg text-lg font-mono text-center tracking-widest text-emerald-400 focus:outline-none focus:border-emerald-500"
                required
              />
            </div>

            <button
              type="submit"
              disabled={loadingVerify || !otpCode}
              className="w-full py-2.5 px-4 bg-emerald-600 hover:bg-emerald-500 text-slate-950 font-semibold rounded-lg text-sm transition-colors disabled:opacity-50"
            >
              {loadingVerify ? 'Verifying...' : 'Verify Code'}
            </button>
          </form>

          {verifyMsg && (
            <div
              className={`p-3 rounded-lg text-xs font-mono ${
                verifyMsg.success
                  ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                  : 'bg-red-500/10 text-red-400 border border-red-500/20'
              }`}
            >
              {verifyMsg.text}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
