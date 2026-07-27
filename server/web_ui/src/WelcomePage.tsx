/**
 * WelcomePage — the front door of Bob's Tiny Treasures.
 *
 * Shown when a visitor lands on / (the root URL).
 * Keeps the origin story brief, sprinkles in some Bob flavour,
 * and offers three clear exits:
 *   1. Full origin story (external value-story page)
 *   2. Enter the shop (→ /app, the picker system login)
 *   3. Bob at IBM (external watsonx page)
 */

import React from 'react';

const FULL_STORY_URL = '/origin-story';   // served as a static file from /usr/share/nginx/html
const IBM_BOB_URL    = 'https://www.ibm.com/watsonx';

export function WelcomePage() {
  function enterShop() {
    window.location.href = '/app';
  }

  return (
    <div
      className="min-h-screen flex flex-col"
      style={{ background: '#0f1117', color: '#e2e8f0', fontFamily: "'IBM Plex Sans', system-ui, sans-serif" }}
    >
      {/* ── Top bar ── */}
      <header
        className="shrink-0 flex items-center justify-between px-6 py-3 border-b border-[#2d3142]"
        style={{ background: '#1a1d27' }}
      >
        <div className="flex items-center gap-3">
          {/* Logo mark — same colours as the SVG robot logo */}
          <svg width="28" height="28" viewBox="0 0 28 28" fill="none" xmlns="http://www.w3.org/2000/svg">
            <rect width="28" height="28" rx="6" fill="#6929c4"/>
            <rect x="8" y="7" width="12" height="9" rx="2" fill="#e2e8f0"/>
            <rect x="11" y="10" width="2.5" height="2.5" rx="0.5" fill="#6929c4"/>
            <rect x="14.5" y="10" width="2.5" height="2.5" rx="0.5" fill="#6929c4"/>
            <rect x="11.5" y="17" width="5" height="4" rx="1" fill="#be95ff"/>
            <circle cx="9"  cy="14" r="1.5" fill="#be95ff"/>
            <circle cx="19" cy="14" r="1.5" fill="#be95ff"/>
          </svg>
          <span className="font-bold text-base tracking-tight text-[#e2e8f0]">
            Bob's Tiny Treasures
          </span>
        </div>
        <nav className="flex items-center gap-4 text-sm text-[#94a3b8]">
          <a
            href={IBM_BOB_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="hover:text-[#be95ff] transition-colors"
          >
            Powered by IBM&nbsp;Bob
          </a>
        </nav>
      </header>

      {/* ── Hero ── */}
      <section className="flex-1 flex flex-col items-center justify-center px-6 py-16 text-center max-w-2xl mx-auto gap-6">

        {/* Eyebrow */}
        <p className="text-xs font-semibold uppercase tracking-widest text-[#6929c4]">
          A warehouse AI experiment — gone delightfully off-script
        </p>

        {/* Title */}
        <h1 className="text-4xl sm:text-5xl font-bold leading-tight text-[#e2e8f0]">
          Welcome to<br />
          <span style={{ color: '#be95ff' }}>Bob's Tiny Treasures</span>
        </h1>

        {/* Origin story — brief version */}
        <div className="text-left text-[#94a3b8] text-base leading-relaxed space-y-4 max-w-lg">
          <p>
            It started with a simple question: <em className="text-[#e2e8f0]">"Can a camera help a warehouse picker
            find the right barcode?"</em> The answer was yes — but that wasn't the interesting part.
          </p>
          <p>
            The interesting part was what happened next. One IBM Architect. One AI assistant
            (hi — that's me, Bob). A{' '}
            <span className="text-[#22c55e] font-semibold">$70 Raspberry Pi</span>.
            And a question that seemed like an afternoon's work.
          </p>
          <p>
            Four days later: a fully deployed warehouse vision system, a mobile AR scanner,
            real-time pick telemetry — and a complete demo toy shop to run it all through.{' '}
            <span className="text-[#e2e8f0]">This shop.</span>
          </p>
          <p className="text-[#57606a] text-sm italic">
            The shelves hold{' '}
            <span className="text-[#e2e8f0] not-italic font-medium">
              Glittering Goblin Gems, Tangerine Trickster Tokens, a Dazzling Diamond Dynamo
            </span>
            {' '}and six other tiny treasures — all real enough to pick, scan, pack, and ship.
            Our pickers Sprinkle and Glimmer are standing by.
          </p>
        </div>

        {/* CTA buttons */}
        <div className="flex flex-col sm:flex-row gap-3 w-full max-w-sm mt-2">
          <button
            onClick={enterShop}
            className="flex-1 py-4 rounded-2xl font-bold text-lg transition-all active:brightness-90"
            style={{ background: '#6929c4', color: '#fff' }}
          >
            Enter the shop →
          </button>
          <a
            href={FULL_STORY_URL}
            className="flex-1 py-4 rounded-2xl font-bold text-lg transition-all text-center"
            style={{
              background: 'transparent',
              border: '2px solid #2d3142',
              color: '#94a3b8',
            }}
          >
            Full origin story
          </a>
        </div>

        {/* IBM Bob credit */}
        <a
          href={IBM_BOB_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="text-xs text-[#57606a] hover:text-[#be95ff] transition-colors mt-2"
        >
          Built by 1 IBM Architect + Bob AI in 12.5 active hours · 74× value multiplier · ibm.com/watsonx
        </a>
      </section>

      {/* ── Stats strip ── */}
      <div
        className="shrink-0 grid grid-cols-4 border-t border-[#2d3142] text-center"
        style={{ background: '#1a1d27' }}
      >
        {[
          { value: '4 days',    label: 'to build' },
          { value: '1,770 hrs', label: 'equiv. dev effort' },
          { value: '70',        label: 'git commits' },
          { value: '9',         label: 'products on shelf' },
        ].map((s) => (
          <div key={s.label} className="py-4 px-2 border-r border-[#2d3142] last:border-r-0">
            <div className="text-lg font-bold font-mono text-[#e2e8f0]">{s.value}</div>
            <div className="text-xs text-[#57606a] mt-0.5">{s.label}</div>
          </div>
        ))}
      </div>

      {/* ── Footer ── */}
      <footer
        className="shrink-0 text-center text-xs py-3 border-t border-[#2d3142] text-[#57606a]"
        style={{ background: '#0f1117' }}
      >
        Bob's Tiny Treasures · Picker Vision warehouse AI ·{' '}
        <a
          href={IBM_BOB_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="hover:text-[#be95ff] transition-colors"
        >
          Powered by IBM Bob
        </a>
      </footer>
    </div>
  );
}
