/**
 * DemoPage — the /demo explainer page.
 *
 * No login required to view this page. A first-time visitor can:
 *   1. Read the 4-step how-it-works guide
 *   2. Scan any of the 21 on-screen QR labels with their phone (no printer needed)
 *   3. Print the labels on Letter paper at 1×1 inch
 *   4. Enter the live app via two CTA buttons (both create a guest session)
 *
 * Labels:
 *   Grid A — 9 product labels     (BTT-00101 … BTT-00303)
 *   Grid B — 3 staging zone labels (STAGING:TINY / WOND / CHRM)
 *   Grid C — 9 shelf location labels (SHELF:A1 … SHELF:C3)
 */

import React, { useEffect } from 'react';
import { useAuth } from './useAuth';
import { qrSvg } from './qrSvg';

// ── Data ──────────────────────────────────────────────────────────────────────

const IBM_BOB_URL = 'https://www.ibm.com/watsonx';

const PRODUCTS = [
  { barcode: 'BTT-00101', short: 'Goblin Gem',       size: 'S', sizeColour: '#0e6027' },
  { barcode: 'BTT-00102', short: 'Sapphire Sprite',  size: 'S', sizeColour: '#0e6027' },
  { barcode: 'BTT-00103', short: 'Rascal Ruby',      size: 'S', sizeColour: '#0e6027' },
  { barcode: 'BTT-00201', short: 'Purple Prism',     size: 'M', sizeColour: '#0043ce' },
  { barcode: 'BTT-00202', short: 'Trickster Token',  size: 'M', sizeColour: '#0043ce' },
  { barcode: 'BTT-00203', short: "Captain's Cube",   size: 'M', sizeColour: '#0043ce' },
  { barcode: 'BTT-00301', short: 'Magenta Monolith', size: 'L', sizeColour: '#a2191f' },
  { barcode: 'BTT-00302', short: 'White Whopper',    size: 'L', sizeColour: '#a2191f' },
  { barcode: 'BTT-00303', short: 'Diamond Dynamo',   size: 'L', sizeColour: '#a2191f' },
];

const STAGING = [
  { code: 'TINY', label: 'Tiny Tote Line 1', accent: '#ff6b00' },
  { code: 'WOND', label: 'Wonderland Bay',   accent: '#00b4d8' },
  { code: 'CHRM', label: 'Charm Dispatch',   accent: '#6929c4' },
];

const SHELVES = ['A1','A2','A3','B1','B2','B3','C1','C2','C3'];

// ── Print CSS (injected once) ─────────────────────────────────────────────────

const PRINT_CSS = `
@media print {
  body { background: #fff !important; color: #000 !important; }
  .no-print { display: none !important; }
  .label-sheet { display: block !important; }
  @page { size: letter portrait; margin: 0.4in; }
}
@media screen {
  .label-sheet-screen { display: block; }
}
`;

// ── Label sub-components ──────────────────────────────────────────────────────

/** A single 1×1 inch label with dashed cut border — works on-screen and in print */
function Label({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        width: '1in',
        height: '1in',
        border: '1pt dashed #999',
        borderRadius: '2pt',
        display: 'inline-flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '3pt',
        gap: '2pt',
        background: '#fff',
        boxSizing: 'border-box',
        flexShrink: 0,
      }}
    >
      {children}
    </div>
  );
}

function ProductLabel({ barcode, short, size, sizeColour }: typeof PRODUCTS[0]) {
  return (
    <Label>
      <div style={{ width: '5pt', height: '5pt', borderRadius: '50%', background: sizeColour, flexShrink: 0 }} />
      <div
        style={{ width: '0.75in', height: '0.75in', flexShrink: 0 }}
        dangerouslySetInnerHTML={{ __html: qrSvg(barcode, 72) }}
      />
      <div style={{ fontSize: '4.5pt', fontWeight: 700, fontFamily: 'Courier New, monospace', color: '#161616', textAlign: 'center', lineHeight: 1.2, wordBreak: 'break-all' }}>
        {barcode}
      </div>
      <div style={{ fontSize: '4pt', color: '#444', textAlign: 'center', lineHeight: 1.2 }}>
        {short} · {size}
      </div>
    </Label>
  );
}

function StagingLabel({ code, label, accent }: typeof STAGING[0]) {
  return (
    <Label>
      <div style={{ width: '100%', textAlign: 'center', fontSize: '4pt', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5pt', color: accent, marginBottom: '1pt' }}>
        {label}
      </div>
      <div
        style={{ width: '0.65in', height: '0.65in', flexShrink: 0 }}
        dangerouslySetInnerHTML={{ __html: qrSvg(`STAGING:${code}`, 62) }}
      />
      <div style={{ fontSize: '5pt', fontWeight: 700, fontFamily: 'Courier New, monospace', color: accent, letterSpacing: '0.5pt' }}>
        {code}
      </div>
    </Label>
  );
}

function ShelfLabel({ code }: { code: string }) {
  return (
    <Label>
      <div style={{ fontSize: '4pt', color: '#888', textTransform: 'uppercase', letterSpacing: '0.5pt', fontWeight: 700 }}>
        Shelf
      </div>
      <div
        style={{ width: '0.65in', height: '0.65in', flexShrink: 0 }}
        dangerouslySetInnerHTML={{ __html: qrSvg(`SHELF:${code}`, 62) }}
      />
      <div style={{ fontSize: '6pt', fontWeight: 700, fontFamily: 'Courier New, monospace', color: '#161616' }}>
        {code}
      </div>
    </Label>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export function DemoPage() {
  const auth = useAuth();

  // Inject print CSS once
  useEffect(() => {
    const style = document.createElement('style');
    style.textContent = PRINT_CSS;
    document.head.appendChild(style);
    return () => { document.head.removeChild(style); };
  }, []);

  function tryScanning() {
    auth.loginAsGuest();
    window.location.href = '/mobile';
  }

  function browseDashboard() {
    auth.loginAsGuest();
    window.location.href = '/app';
  }

  return (
    <div style={{ background: '#0f1117', color: '#e2e8f0', fontFamily: "'IBM Plex Sans', system-ui, sans-serif", minHeight: '100vh' }}>

      {/* ── Print CSS inlined for reliability ── */}
      <style>{PRINT_CSS}</style>

      {/* ── Top bar ── */}
      <header
        className="no-print shrink-0 flex items-center justify-between px-6 py-3 border-b border-[#2d3142]"
        style={{ background: '#1a1d27' }}
      >
        <div className="flex items-center gap-3">
          <svg width="28" height="28" viewBox="0 0 28 28" fill="none" xmlns="http://www.w3.org/2000/svg">
            <rect width="28" height="28" rx="6" fill="#6929c4"/>
            <rect x="8" y="7" width="12" height="9" rx="2" fill="#e2e8f0"/>
            <rect x="11" y="10" width="2.5" height="2.5" rx="0.5" fill="#6929c4"/>
            <rect x="14.5" y="10" width="2.5" height="2.5" rx="0.5" fill="#6929c4"/>
            <rect x="11.5" y="17" width="5" height="4" rx="1" fill="#be95ff"/>
            <circle cx="9"  cy="14" r="1.5" fill="#be95ff"/>
            <circle cx="19" cy="14" r="1.5" fill="#be95ff"/>
          </svg>
          <span style={{ fontWeight: 700, fontSize: '15px', color: '#e2e8f0' }}>Bob's Tiny Treasures — Demo</span>
        </div>
        <a
          href={IBM_BOB_URL}
          target="_blank"
          rel="noopener noreferrer"
          style={{ fontSize: '13px', color: '#94a3b8', textDecoration: 'none' }}
          className="hover:text-[#be95ff] transition-colors"
        >
          Powered by IBM Bob
        </a>
      </header>

      <div style={{ maxWidth: '720px', margin: '0 auto', padding: '32px 24px 56px' }}>

        {/* ── Hero ── */}
        <section className="no-print text-center mb-10">
          <p style={{ fontSize: '11px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '1.5px', color: '#6929c4', marginBottom: '12px' }}>
            Live warehouse AI · Try it now
          </p>
          <h1 style={{ fontSize: '36px', fontWeight: 700, lineHeight: 1.15, color: '#e2e8f0', marginBottom: '14px' }}>
            Try the <span style={{ color: '#be95ff' }}>Demo</span>
          </h1>
          <p style={{ fontSize: '16px', fontWeight: 300, color: '#94a3b8', lineHeight: 1.75, maxWidth: '540px', margin: '0 auto' }}>
            A live warehouse picking system you can try right now — on your phone,
            in two minutes, no app install required.
          </p>
        </section>

        {/* ── What you need ── */}
        <section className="no-print mb-10">
          <h2 style={{ fontSize: '13px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '1px', color: '#57606a', marginBottom: '14px' }}>
            What you need
          </h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '12px' }}>
            {[
              { icon: '📱', title: 'A smartphone', desc: 'Any modern browser — Chrome or Safari. No app install.' },
              { icon: '🏷️', title: 'These labels', desc: 'On-screen is fine. Point your phone at your laptop.' },
              { icon: '⏱️', title: 'About 2 minutes', desc: 'Scan a few items, confirm delivery, see it in real time.' },
            ].map((c) => (
              <div key={c.title} style={{ background: '#1a1d27', border: '1px solid #2d3142', borderRadius: '8px', padding: '16px 14px' }}>
                <div style={{ fontSize: '24px', marginBottom: '8px' }}>{c.icon}</div>
                <div style={{ fontSize: '13px', fontWeight: 600, color: '#e2e8f0', marginBottom: '4px' }}>{c.title}</div>
                <div style={{ fontSize: '12px', color: '#57606a', lineHeight: 1.5 }}>{c.desc}</div>
              </div>
            ))}
          </div>
        </section>

        {/* ── How it works ── */}
        <section className="no-print mb-10">
          <h2 style={{ fontSize: '13px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '1px', color: '#57606a', marginBottom: '14px' }}>
            How it works
          </h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {[
              { n: 1, title: 'Open the scanner', desc: 'Tap "Try scanning →" below. Your phone\'s camera opens automatically.' },
              { n: 2, title: 'Point at a product label', desc: 'Aim at any label below — a green highlight confirms the scan. The item is added to your pick list.' },
              { n: 3, title: 'Scan a staging zone label', desc: 'The orange, teal, or purple label below confirms where the tote is going.' },
              { n: 4, title: 'Hit Validate', desc: 'See correct, missing, and unexpected items in real time. The demo auto-generates a new order when you\'re done.' },
            ].map((step) => (
              <div key={step.n} style={{ display: 'flex', gap: '14px', alignItems: 'flex-start', background: '#1a1d27', border: '1px solid #2d3142', borderRadius: '8px', padding: '14px' }}>
                <div style={{ width: '28px', height: '28px', borderRadius: '50%', background: '#6929c4', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: '13px', flexShrink: 0 }}>
                  {step.n}
                </div>
                <div>
                  <div style={{ fontSize: '14px', fontWeight: 600, color: '#e2e8f0', marginBottom: '2px' }}>{step.title}</div>
                  <div style={{ fontSize: '13px', color: '#57606a', lineHeight: 1.5 }}>{step.desc}</div>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* ── CTA buttons ── */}
        <section className="no-print mb-12">
          <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
            <button
              onClick={tryScanning}
              style={{ flex: 1, minWidth: '200px', padding: '14px 24px', borderRadius: '10px', background: '#6929c4', color: '#fff', fontWeight: 700, fontSize: '15px', border: 'none', cursor: 'pointer', fontFamily: 'inherit' }}
            >
              Try scanning →
            </button>
            <button
              onClick={browseDashboard}
              style={{ flex: 1, minWidth: '200px', padding: '14px 24px', borderRadius: '10px', background: 'transparent', color: '#94a3b8', fontWeight: 600, fontSize: '15px', border: '2px solid #2d3142', cursor: 'pointer', fontFamily: 'inherit' }}
            >
              Browse the dashboard →
            </button>
          </div>
          <p style={{ fontSize: '11px', color: '#57606a', marginTop: '8px', textAlign: 'center' }}>
            No account needed — you'll enter as a read-only guest
          </p>
        </section>

        {/* ── Labels ── */}
        <section id="label-sheet" className="label-sheet-screen">
          <div className="no-print" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px', flexWrap: 'wrap', gap: '8px' }}>
            <div>
              <h2 style={{ fontSize: '18px', fontWeight: 700, color: '#e2e8f0', marginBottom: '4px' }}>
                The Labels
              </h2>
              <p style={{ fontSize: '13px', color: '#57606a' }}>
                Scan these on-screen with your phone, or print them at 100% scale on Letter paper.
              </p>
            </div>
            <button
              onClick={() => window.print()}
              style={{ padding: '8px 18px', borderRadius: '6px', background: '#1a1d27', border: '1px solid #2d3142', color: '#94a3b8', fontSize: '13px', fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}
            >
              🖨️ Print labels
            </button>
          </div>

          {/* Grid A — Products */}
          <div style={{ marginBottom: '24px' }}>
            <div className="no-print" style={{ fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '1px', color: '#57606a', marginBottom: '10px' }}>
              Products — scan these to pick items
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6pt', background: '#fff', padding: '8pt', borderRadius: '6px', border: '1px solid #e0e0e0' }}>
              {PRODUCTS.map((p) => (
                <ProductLabel key={p.barcode} {...p} />
              ))}
            </div>
          </div>

          {/* Grid B — Staging zones */}
          <div style={{ marginBottom: '24px' }}>
            <div className="no-print" style={{ fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '1px', color: '#57606a', marginBottom: '10px' }}>
              Staging zones — scan to confirm delivery destination
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6pt', background: '#fff', padding: '8pt', borderRadius: '6px', border: '1px solid #e0e0e0' }}>
              {STAGING.map((s) => (
                <StagingLabel key={s.code} {...s} />
              ))}
            </div>
          </div>

          {/* Grid C — Shelves */}
          <div style={{ marginBottom: '24px' }}>
            <div className="no-print" style={{ fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '1px', color: '#57606a', marginBottom: '10px' }}>
              Shelf locations — scan to record where items live
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6pt', background: '#fff', padding: '8pt', borderRadius: '6px', border: '1px solid #e0e0e0' }}>
              {SHELVES.map((code) => (
                <ShelfLabel key={code} code={code} />
              ))}
            </div>
          </div>
        </section>

        {/* ── Bottom CTAs ── */}
        <section className="no-print mt-4">
          <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
            <button
              onClick={tryScanning}
              style={{ flex: 1, minWidth: '200px', padding: '14px 24px', borderRadius: '10px', background: '#6929c4', color: '#fff', fontWeight: 700, fontSize: '15px', border: 'none', cursor: 'pointer', fontFamily: 'inherit' }}
            >
              Try scanning →
            </button>
            <button
              onClick={browseDashboard}
              style={{ flex: 1, minWidth: '200px', padding: '14px 24px', borderRadius: '10px', background: 'transparent', color: '#94a3b8', fontWeight: 600, fontSize: '15px', border: '2px solid #2d3142', cursor: 'pointer', fontFamily: 'inherit' }}
            >
              Browse the dashboard →
            </button>
          </div>
        </section>

      </div>

      {/* ── Footer ── */}
      <footer
        className="no-print shrink-0 text-center text-xs py-3 border-t border-[#2d3142]"
        style={{ background: '#0f1117', color: '#57606a' }}
      >
        Bob's Tiny Treasures · Picker Vision warehouse AI ·{' '}
        <a href={IBM_BOB_URL} target="_blank" rel="noopener noreferrer" style={{ color: 'inherit', textDecoration: 'none' }}
           className="hover:text-[#be95ff] transition-colors">
          Powered by IBM Bob
        </a>
      </footer>

    </div>
  );
}
