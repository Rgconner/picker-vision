/**
 * BttSetupPanel — Bob's Tiny Treasures warehouse setup wizard.
 *
 * Shown only when WorkflowConfig.instance_profile === "bobs-tiny-treasures".
 *
 * Three inner sub-tabs:
 *   Grid       — configure rows × cols, generate shelf staging containers
 *   Inventory  — scan shelf QR → scan product → enter qty → assign stock
 *   Scenarios  — save / load / delete named warehouse layout snapshots
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useBarcodeScanner } from './useBarcodeScanner';
import type { ScanResult } from './useBarcodeScanner';
import { BttLabelsPanel } from './BttLabelsPanel';

// ── Types ──────────────────────────────────────────────────────────────────

interface ShelfInfo  { code: string; label: string; qr_payload: string }
interface StockEntry { location_code: string; product_barcode: string; qty_on_hand: number }
interface Scenario   { id: string; name: string; grid_rows: number; grid_cols: number; payload: string; created_at: string }

type SubTab = 'grid' | 'inventory' | 'scenarios' | 'labels';

// ── Helpers ────────────────────────────────────────────────────────────────

const API = (path: string) => `/api/order${path}`;

async function apiFetch(path: string, opts?: RequestInit) {
  const r = await fetch(API(path), {
    headers: { 'Content-Type': 'application/json' },
    ...opts,
  });
  if (!r.ok) {
    const msg = await r.text().catch(() => r.statusText);
    throw new Error(msg);
  }
  if (r.status === 204) return null;
  return r.json();
}

// ── Sub-components ─────────────────────────────────────────────────────────

// ── Grid sub-tab ────────────────────────────────────────────────────────────

function GridPanel() {
  const [rows, setRows]       = useState(3);
  const [cols, setCols]       = useState(3);
  const [busy, setBusy]       = useState(false);
  const [result, setResult]   = useState<ShelfInfo[] | null>(null);
  const [error, setError]     = useState<string | null>(null);

  async function handleGenerate() {
    setBusy(true); setError(null); setResult(null);
    try {
      const data = await apiFetch('/warehouse/grid', {
        method: 'POST',
        body: JSON.stringify({ rows, cols }),
      });
      setResult(data.shelves);
    } catch (e: unknown) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-[#94a3b8]">
        Define the warehouse grid for this test run. Existing shelf locations will be
        replaced. Delivery zones are unaffected.
      </p>

      <div className="flex gap-4 items-end">
        <label className="flex flex-col gap-1 text-sm text-[#94a3b8]">
          Rows (A–Z)
          <input
            type="number" min={1} max={26} value={rows}
            onChange={e => setRows(Math.max(1, Math.min(26, +e.target.value)))}
            className="w-20 px-3 py-2 rounded-lg bg-[#0f1117] border border-[#2d3142] text-[#e2e8f0] text-center text-lg font-bold focus:outline-none focus:border-[#f59e0b]"
          />
        </label>
        <span className="text-2xl text-[#57606a] mb-2">×</span>
        <label className="flex flex-col gap-1 text-sm text-[#94a3b8]">
          Cols (1–9)
          <input
            type="number" min={1} max={9} value={cols}
            onChange={e => setCols(Math.max(1, Math.min(9, +e.target.value)))}
            className="w-20 px-3 py-2 rounded-lg bg-[#0f1117] border border-[#2d3142] text-[#e2e8f0] text-center text-lg font-bold focus:outline-none focus:border-[#f59e0b]"
          />
        </label>
        <button
          onClick={handleGenerate}
          disabled={busy}
          className="ml-4 px-6 py-2 rounded-lg bg-[#f59e0b] text-black font-bold text-sm hover:bg-[#fbbf24] disabled:opacity-50 transition-all"
        >
          {busy ? 'Generating…' : `Generate ${rows}×${cols} Grid`}
        </button>
      </div>

      {error && (
        <div className="text-sm text-[#ef4444] bg-[#ef4444]/10 border border-[#ef4444]/30 rounded-lg px-3 py-2">
          {error}
        </div>
      )}

      {result && (
        <div>
          <p className="text-xs text-[#22c55e] mb-2">
            ✓ Created {result.length} shelf locations
          </p>
          <div className="grid gap-1"
               style={{ gridTemplateColumns: `repeat(${cols}, minmax(0,1fr))` }}>
            {result.map(s => (
              <div key={s.code}
                   className="text-center text-xs rounded bg-[#0f1117] border border-[#2d3142] py-2 text-[#f59e0b] font-bold">
                {s.code}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Inventory sub-tab ───────────────────────────────────────────────────────

type InventoryStep = 'shelf' | 'product' | 'qty';

function InventoryPanel() {
  const videoRef    = useRef<HTMLVideoElement>(null);
  const [scanning, setScanning]       = useState(false);
  const [step, setStep]               = useState<InventoryStep>('shelf');
  const [pendingShelf, setPendingShelf] = useState<string | null>(null);
  const [pendingProduct, setPendingProduct] = useState<string | null>(null);
  const [qty, setQty]                 = useState(1);
  const [assignments, setAssignments] = useState<StockEntry[]>([]);
  const [flash, setFlash]             = useState<string | null>(null);
  const [error, setError]             = useState<string | null>(null);

  function showFlash(msg: string) {
    setFlash(msg);
    setTimeout(() => setFlash(null), 2000);
  }

  const handleScan = useCallback((result: ScanResult) => {
    const value = result.value.toUpperCase();

    if (step === 'shelf') {
      // Expect SHELF:A1
      if (value.startsWith('SHELF:')) {
        const code = value.slice(6);
        setPendingShelf(code);
        setStep('product');
        showFlash(`Shelf ${code} scanned — now scan a product`);
      } else {
        showFlash('Scan a shelf QR (starts with SHELF:)');
      }
      return;
    }

    if (step === 'product') {
      // Expect a BTT-XXXXX barcode or any product barcode
      if (!value.startsWith('SHELF:') && !value.startsWith('STAGING:')) {
        setPendingProduct(value);
        setStep('qty');
        setScanning(false);
        showFlash(`Product ${value} — enter quantity`);
      } else {
        showFlash('Scan a product barcode (not a shelf or staging QR)');
      }
      return;
    }
  }, [step]);

  const { unsupported: scannerUnsupported } = useBarcodeScanner(videoRef, scanning, handleScan);

  async function handleConfirmQty() {
    if (!pendingShelf || !pendingProduct) return;
    setError(null);
    try {
      await apiFetch('/warehouse/inventory', {
        method: 'POST',
        body: JSON.stringify({
          location_code:   pendingShelf,
          product_barcode: pendingProduct,
          qty,
        }),
      });
      setAssignments(prev => {
        const filtered = prev.filter(a => a.location_code !== pendingShelf);
        return [...filtered, { location_code: pendingShelf!, product_barcode: pendingProduct!, qty_on_hand: qty }];
      });
      showFlash(`✓ ${pendingShelf}: ${pendingProduct} × ${qty}`);
    } catch (e: unknown) {
      setError(String(e));
    }
    // Reset for next scan
    setPendingShelf(null);
    setPendingProduct(null);
    setQty(1);
    setStep('shelf');
    setScanning(true);
  }

  function handleStartCamera() {
    setScanning(true);
    setStep('shelf');
  }

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-[#94a3b8]">
        Scan each shelf QR label, then scan the product on that shelf and enter the
        starting quantity. Repeat for each shelf location.
      </p>

      {/* Camera */}
      <div className="relative rounded-xl overflow-hidden bg-black border border-[#2d3142]"
           style={{ maxHeight: 220 }}>
        <video ref={videoRef} autoPlay muted playsInline
               className="w-full object-cover"
               style={{ maxHeight: 220 }} />
        {!scanning && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/70">
            <button
              onClick={handleStartCamera}
              className="px-6 py-3 rounded-xl bg-[#f59e0b] text-black font-bold text-sm hover:bg-[#fbbf24] transition-all"
            >
              Start Camera
            </button>
          </div>
        )}
        {scanning && (
          <div className="absolute bottom-2 left-0 right-0 text-center">
            <span className={`text-xs font-semibold px-3 py-1 rounded-full ${
              step === 'shelf'   ? 'bg-[#3b82f6]/80 text-white' :
              step === 'product' ? 'bg-[#22c55e]/80 text-black' :
                                   'bg-[#f59e0b]/80 text-black'
            }`}>
              {step === 'shelf'   ? 'Scan shelf QR' :
               step === 'product' ? `Shelf ${pendingShelf} — scan product barcode` :
               `Product ${pendingProduct} — enter qty below`}
            </span>
          </div>
        )}
      </div>

      {/* Flash */}
      {scannerUnsupported && (
        <div className="flex items-center gap-2 px-3 py-2 rounded-lg border border-[#f1c21b]/30 text-xs text-[#f1c21b]"
             style={{ background: 'rgba(241,194,27,0.08)' }}>
          <span>⚠</span>
          <span>Native barcode scanner unavailable — performance may be compromised. Use Chrome on Android.</span>
        </div>
      )}
      {flash && (
        <div className="text-sm text-center text-[#f59e0b] animate-pulse">{flash}</div>
      )}

      {/* Qty entry (shown when step === qty) */}
      {step === 'qty' && pendingShelf && pendingProduct && (
        <div className="flex items-center gap-3 p-3 rounded-xl bg-[#0f1117] border border-[#f59e0b]/40">
          <div className="flex-1 text-sm">
            <span className="text-[#f59e0b] font-bold">{pendingShelf}</span>
            <span className="text-[#94a3b8] mx-2">→</span>
            <span className="text-[#e2e8f0] font-mono text-xs">{pendingProduct}</span>
          </div>
          <input
            type="number" min={1} max={99} value={qty}
            onChange={e => setQty(Math.max(1, +e.target.value))}
            className="w-16 px-2 py-1 rounded bg-[#1a1d27] border border-[#2d3142] text-[#e2e8f0] text-center font-bold focus:outline-none focus:border-[#f59e0b]"
          />
          <button
            onClick={handleConfirmQty}
            className="px-4 py-1.5 rounded-lg bg-[#22c55e] text-black font-bold text-sm hover:bg-[#4ade80] transition-all"
          >
            Confirm
          </button>
        </div>
      )}

      {error && (
        <div className="text-sm text-[#ef4444] bg-[#ef4444]/10 border border-[#ef4444]/30 rounded-lg px-3 py-2">
          {error}
        </div>
      )}

      {/* Assignments list */}
      {assignments.length > 0 && (
        <div>
          <p className="text-xs text-[#57606a] mb-1">This session — {assignments.length} location(s) assigned</p>
          <div className="flex flex-col gap-1 max-h-40 overflow-y-auto">
            {assignments.map(a => (
              <div key={a.location_code}
                   className="flex items-center gap-2 text-xs px-3 py-1.5 rounded bg-[#0f1117] border border-[#2d3142]">
                <span className="text-[#f59e0b] font-bold w-8">{a.location_code}</span>
                <span className="text-[#e2e8f0] font-mono flex-1">{a.product_barcode}</span>
                <span className="text-[#94a3b8]">× {a.qty_on_hand}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Scenarios sub-tab ───────────────────────────────────────────────────────

function ScenariosPanel() {
  const [scenarios, setScenarios]   = useState<Scenario[]>([]);
  const [loading, setLoading]       = useState(true);
  const [saveName, setSaveName]     = useState('');
  const [saving, setSaving]         = useState(false);
  const [error, setError]           = useState<string | null>(null);
  const [flash, setFlash]           = useState<string | null>(null);

  function showFlash(msg: string) {
    setFlash(msg);
    setTimeout(() => setFlash(null), 2500);
  }

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const data = await apiFetch('/warehouse/scenarios');
      setScenarios(data);
    } catch (e: unknown) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { reload(); }, [reload]);

  async function handleSave() {
    if (!saveName.trim()) return;
    setSaving(true); setError(null);
    try {
      await apiFetch('/warehouse/scenarios', {
        method: 'POST',
        body: JSON.stringify({ name: saveName.trim() }),
      });
      setSaveName('');
      showFlash(`✓ Saved "${saveName.trim()}"`);
      reload();
    } catch (e: unknown) {
      setError(String(e));
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string, name: string) {
    if (!confirm(`Delete scenario "${name}"?`)) return;
    setError(null);
    try {
      await apiFetch(`/warehouse/scenarios/${id}`, { method: 'DELETE' });
      showFlash(`Deleted "${name}"`);
      reload();
    } catch (e: unknown) {
      setError(String(e));
    }
  }

  async function handleLoad(id: string, name: string) {
    setError(null);
    try {
      const data = await apiFetch(`/warehouse/scenarios/${id}`);
      const items: StockEntry[] = JSON.parse(data.payload || '[]');
      // Re-apply all stock assignments to the scratch record
      for (const item of items) {
        await apiFetch('/warehouse/inventory', {
          method: 'POST',
          body: JSON.stringify({
            location_code:   item.location_code,
            product_barcode: item.product_barcode,
            qty:             item.qty_on_hand,
          }),
        });
      }
      showFlash(`✓ Loaded "${name}" — ${items.length} locations restored`);
    } catch (e: unknown) {
      setError(String(e));
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-[#94a3b8]">
        Save the current inventory scan as a named scenario to reuse across test runs.
        Loading a scenario replaces the active scratch inventory.
      </p>

      {/* Save row */}
      <div className="flex gap-2">
        <input
          type="text"
          placeholder="Scenario name…"
          value={saveName}
          onChange={e => setSaveName(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && handleSave()}
          className="flex-1 px-3 py-2 rounded-lg bg-[#0f1117] border border-[#2d3142] text-[#e2e8f0] text-sm focus:outline-none focus:border-[#f59e0b] placeholder-[#57606a]"
        />
        <button
          onClick={handleSave}
          disabled={saving || !saveName.trim()}
          className="px-5 py-2 rounded-lg bg-[#f59e0b] text-black font-bold text-sm hover:bg-[#fbbf24] disabled:opacity-40 transition-all"
        >
          {saving ? 'Saving…' : 'Save Current'}
        </button>
      </div>

      {flash && <div className="text-sm text-[#22c55e]">{flash}</div>}
      {error && (
        <div className="text-sm text-[#ef4444] bg-[#ef4444]/10 border border-[#ef4444]/30 rounded-lg px-3 py-2">
          {error}
        </div>
      )}

      {/* Scenario list */}
      {loading ? (
        <p className="text-sm text-[#57606a]">Loading…</p>
      ) : scenarios.length === 0 ? (
        <p className="text-sm text-[#57606a]">No saved scenarios yet. Inventory some shelves, then save above.</p>
      ) : (
        <div className="flex flex-col gap-2 max-h-64 overflow-y-auto">
          {scenarios.map(sc => {
            const items: StockEntry[] = JSON.parse(sc.payload || '[]');
            return (
              <div key={sc.id}
                   className="flex items-center gap-3 px-3 py-2.5 rounded-xl bg-[#0f1117] border border-[#2d3142]">
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-semibold text-[#e2e8f0] truncate">{sc.name}</div>
                  <div className="text-xs text-[#57606a]">
                    {sc.grid_rows}×{sc.grid_cols} grid · {items.length} locations
                    &nbsp;·&nbsp;{new Date(sc.created_at).toLocaleDateString()}
                  </div>
                </div>
                <button
                  onClick={() => handleLoad(sc.id, sc.name)}
                  className="px-3 py-1 rounded-lg text-xs font-semibold bg-[#3b82f6]/20 text-[#93c5fd] border border-[#3b82f6]/30 hover:bg-[#3b82f6]/30 transition-all"
                >
                  Load
                </button>
                <button
                  onClick={() => handleDelete(sc.id, sc.name)}
                  className="px-3 py-1 rounded-lg text-xs font-semibold bg-[#ef4444]/10 text-[#f87171] border border-[#ef4444]/20 hover:bg-[#ef4444]/20 transition-all"
                >
                  Delete
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── Logo inline SVG ────────────────────────────────────────────────────────

function BttLogo() {
  // ST-6: logo.svg served as a static asset via the API gateway /static/ route.
  // Falls back gracefully if the asset is unavailable (img with alt text).
  return (
    <img
      src="/static/bobs-tiny-treasures/logo.svg"
      alt="Bob's Tiny Treasures"
      className="h-12 w-auto"
      onError={(e) => {
        // If the static asset isn't served yet, render a simple text fallback
        const img = e.currentTarget;
        img.style.display = 'none';
        const span = document.createElement('span');
        span.className = 'text-[#f59e0b] font-bold text-sm';
        span.textContent = "Bob's Tiny Treasures";
        img.parentElement?.insertBefore(span, img);
      }}
    />
  );
}

// ── Main panel ─────────────────────────────────────────────────────────────

const SUB_TABS: { id: SubTab; label: string }[] = [
  { id: 'grid',      label: '⬛ Grid' },
  { id: 'inventory', label: '📦 Inventory' },
  { id: 'scenarios', label: '💾 Scenarios' },
  { id: 'labels',    label: '🏷️ Labels' },
];

export function BttSetupPanel() {
  const [sub, setSub] = useState<SubTab>('grid');

  return (
    <div className="flex flex-col h-full overflow-hidden gap-3">

      {/* Header with logo */}
      <div className="flex items-center gap-4 shrink-0 px-1">
        <BttLogo />
        <div className="text-xs text-[#57606a] leading-relaxed">
          Warehouse Setup Wizard<br />
          <span className="text-[#f59e0b]">Bob's Tiny Treasures</span> instance
        </div>
      </div>

      {/* Sub-tab bar */}
      <div className="flex gap-1 shrink-0">
        {SUB_TABS.map(t => (
          <button
            key={t.id}
            onClick={() => setSub(t.id)}
            className={`px-4 py-1.5 rounded-lg text-sm font-semibold transition-all ${
              sub === t.id
                ? 'bg-[#f59e0b] text-black'
                : 'bg-[#1a1d27] border border-[#2d3142] text-[#94a3b8] hover:text-[#e2e8f0]'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Panel content */}
      <div className="flex-1 min-h-0 overflow-y-auto">
        {sub === 'grid'      && <GridPanel />}
        {sub === 'inventory' && <InventoryPanel />}
        {sub === 'scenarios' && <ScenariosPanel />}
        {sub === 'labels'    && <BttLabelsPanel />}
      </div>
    </div>
  );
}
