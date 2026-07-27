/**
 * BttLabelsPanel — Label sheet designer for Bob's Tiny Treasures.
 *
 * Lives as the "Labels" sub-tab inside BttSetupPanel.
 *
 * Three section cards (Products / Shelves / Zones), each with:
 *   • Include toggle
 *   • Barcode type  — QR Code · Code 128 · UPC-A
 *   • Detail level  — Minimal · Detailed
 *   • Colour band   — (Zones only) None · Colour-coded
 *
 * Global controls:
 *   • Print mode    — Cut-yourself · Avery-matched
 *   • Avery template fields (shown only in Avery mode, pre-filled)
 *   • Shelf grid rows × cols
 *
 * "Download Labels PDF" posts the config to POST /api/order/labels/generate
 * and triggers a browser file download.
 */

import React, { useCallback, useEffect, useState } from 'react';

// ── Types ──────────────────────────────────────────────────────────────────────

type PrintMode    = 'cut' | 'avery';
type BarcodeType  = 'qr' | 'code128' | 'upc';
type DetailLevel  = 'minimal' | 'detailed';

interface SectionConfig {
  include:      boolean;
  barcode_type: BarcodeType;
  detail:       DetailLevel;
  colour_band?: boolean;           // zones only
  avery_template?: string;
}

interface ShelfSectionConfig extends SectionConfig {
  rows: number;
  cols: number;
}

interface LabelConfig {
  print_mode: PrintMode;
  sections: {
    products: SectionConfig & { avery_template: string };
    shelves:  ShelfSectionConfig & { avery_template: string };
    zones:    SectionConfig & { avery_template: string };
  };
  products: ProductInfo[];
  zones: ZoneInfo[];
}

interface ProductInfo {
  barcode:     string;
  description: string;
  sku:         string;
  weight_kg:   number;
  size_class:  string | null;
  size_inches: string | null;
}

interface ZoneInfo {
  code:       string;
  label:      string;
  qr_payload: string;
}

// ── Constants ──────────────────────────────────────────────────────────────────

const AVERY_DEFAULTS = {
  products: '22807',
  shelves:  '5164',
  zones:    '8165',
};

const AVERY_LABELS: Record<string, string> = {
  '22807': '22807 — 1×1 in square, 40/sheet',
  '5164':  '5164 — 3.33×4 in, 6/sheet',
  '5163':  '5163 — 2×4 in, 10/sheet',
  '8165':  '8165 — Full sheet, 1/page',
};

const STATIC_ZONES: ZoneInfo[] = [
  { code: 'TINY', label: 'Tiny Tote Line 1', qr_payload: 'STAGING:TINY' },
  { code: 'WOND', label: 'Wonderland Bay',   qr_payload: 'STAGING:WOND' },
  { code: 'CHRM', label: 'Charm Dispatch',   qr_payload: 'STAGING:CHRM' },
];

const ZONE_COLOURS: Record<string, string> = {
  TINY: '#f59e0b',
  WOND: '#3b82f6',
  CHRM: '#22c55e',
};

// ── Helpers ────────────────────────────────────────────────────────────────────

const API = (path: string) => `/api/order${path}`;

// ── Sub-components ─────────────────────────────────────────────────────────────

function Label({ children }: { children: React.ReactNode }) {
  return <span className="text-[#94a3b8] text-xs w-28 shrink-0">{children}</span>;
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3 py-2 border-b border-[#1e2130] last:border-0">
      <Label>{label}</Label>
      <div className="flex-1 min-w-0">{children}</div>
    </div>
  );
}

function Toggle({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <div
      onClick={() => onChange(!checked)}
      className={`relative w-10 h-5 rounded-full cursor-pointer transition-colors ${checked ? 'bg-[#f59e0b]' : 'bg-[#2d3142]'}`}
    >
      <div className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${checked ? 'translate-x-5' : ''}`} />
    </div>
  );
}

function SegmentedControl<T extends string>({
  value, onChange, options,
}: {
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: string }[];
}) {
  return (
    <div className="flex gap-1 flex-wrap">
      {options.map(o => (
        <button
          key={o.value}
          onClick={() => onChange(o.value)}
          className={`px-3 py-1 rounded-md text-xs font-medium transition-all ${
            value === o.value
              ? 'bg-[#f59e0b] text-black'
              : 'bg-[#0f1117] border border-[#2d3142] text-[#94a3b8] hover:text-[#e2e8f0]'
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

function NumberInput({ value, onChange, min = 1, max = 26 }: {
  value: number; onChange: (v: number) => void; min?: number; max?: number;
}) {
  return (
    <input
      type="number"
      value={value}
      min={min}
      max={max}
      onChange={e => onChange(Math.max(min, Math.min(max, parseInt(e.target.value) || min)))}
      className="w-16 bg-[#0f1117] border border-[#2d3142] text-[#e2e8f0] text-sm rounded px-2 py-1 focus:outline-none focus:border-[#f59e0b]"
    />
  );
}

function TextInput({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <input
      type="text"
      value={value}
      onChange={e => onChange(e.target.value)}
      className="w-full bg-[#0f1117] border border-[#2d3142] text-[#e2e8f0] text-xs rounded px-2 py-1 focus:outline-none focus:border-[#f59e0b]"
    />
  );
}

// ── Section card ───────────────────────────────────────────────────────────────

interface SectionCardProps {
  title:       string;
  icon:        string;
  cfg:         SectionConfig;
  onChange:    (patch: Partial<SectionConfig>) => void;
  showUpc?:    boolean;   // false for shelves/zones
  showBand?:   boolean;   // true for zones only
  averyMode:   boolean;
  averyKey:    keyof typeof AVERY_DEFAULTS;
  extraRows?:  React.ReactNode;
}

function SectionCard({
  title, icon, cfg, onChange, showUpc = true, showBand = false,
  averyMode, averyKey, extraRows,
}: SectionCardProps) {
  const barcodeOptions: { value: BarcodeType; label: string }[] = [
    { value: 'qr',      label: 'QR Code' },
    { value: 'code128', label: 'Code 128' },
    ...(showUpc ? [{ value: 'upc' as BarcodeType, label: 'UPC-A' }] : []),
  ];

  return (
    <div className={`rounded-xl border transition-all overflow-hidden ${
      cfg.include ? 'border-[#f59e0b]/40 bg-[#0f1117]' : 'border-[#2d3142] bg-[#1a1d27] opacity-60'
    }`}>
      {/* Card header */}
      <div className="flex items-center gap-3 px-4 py-3 border-b border-[#1e2130]">
        <span className="text-lg">{icon}</span>
        <span className="text-[#e2e8f0] font-semibold text-sm flex-1">{title}</span>
        <Toggle checked={cfg.include} onChange={v => onChange({ include: v })} />
      </div>

      {cfg.include && (
        <div className="px-4 py-1">
          <Row label="Barcode type">
            <SegmentedControl<BarcodeType>
              value={cfg.barcode_type}
              onChange={v => onChange({ barcode_type: v })}
              options={barcodeOptions}
            />
          </Row>
          <Row label="Detail level">
            <SegmentedControl<DetailLevel>
              value={cfg.detail}
              onChange={v => onChange({ detail: v })}
              options={[
                { value: 'minimal',  label: 'Minimal' },
                { value: 'detailed', label: 'Detailed' },
              ]}
            />
          </Row>
          {showBand && (
            <Row label="Colour band">
              <SegmentedControl<string>
                value={cfg.colour_band ? 'yes' : 'no'}
                onChange={v => onChange({ colour_band: v === 'yes' })}
                options={[
                  { value: 'no',  label: 'None' },
                  { value: 'yes', label: 'Colour-coded' },
                ]}
              />
              {cfg.colour_band && (
                <div className="flex gap-2 mt-2 ml-1">
                  {STATIC_ZONES.map(z => (
                    <span key={z.code} className="flex items-center gap-1.5 text-xs text-[#94a3b8]">
                      <span className="w-3 h-3 rounded-sm" style={{ background: ZONE_COLOURS[z.code] }} />
                      {z.code}
                    </span>
                  ))}
                </div>
              )}
            </Row>
          )}
          {averyMode && (
            <Row label="Avery template">
              <select
                value={cfg.avery_template ?? AVERY_DEFAULTS[averyKey]}
                onChange={e => onChange({ avery_template: e.target.value })}
                className="w-full bg-[#0f1117] border border-[#2d3142] text-[#e2e8f0] text-xs rounded px-2 py-1 focus:outline-none focus:border-[#f59e0b]"
              >
                {Object.entries(AVERY_LABELS).map(([k, v]) => (
                  <option key={k} value={k}>{v}</option>
                ))}
              </select>
            </Row>
          )}
          {extraRows}
        </div>
      )}
    </div>
  );
}

// ── Main panel ─────────────────────────────────────────────────────────────────

export function BttLabelsPanel() {
  const [printMode, setPrintMode]   = useState<PrintMode>('cut');
  const [products, setProducts]     = useState<ProductInfo[]>([]);
  const [loadingProducts, setLoadingProducts] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [error, setError]           = useState<string | null>(null);

  const [prodCfg, setProdCfg] = useState<SectionConfig>({
    include: true, barcode_type: 'qr', detail: 'minimal',
    avery_template: AVERY_DEFAULTS.products,
  });
  const [shelfCfg, setShelfCfg] = useState<ShelfSectionConfig>({
    include: true, barcode_type: 'qr', detail: 'minimal',
    rows: 3, cols: 3, avery_template: AVERY_DEFAULTS.shelves,
  });
  const [zoneCfg, setZoneCfg] = useState<SectionConfig>({
    include: true, barcode_type: 'qr', detail: 'minimal',
    colour_band: false, avery_template: AVERY_DEFAULTS.zones,
  });

  // Fetch BTT products on mount
  useEffect(() => {
    fetch(API('/labels/products'))
      .then(r => r.ok ? r.json() : [])
      .then((data: ProductInfo[]) => { setProducts(data); setLoadingProducts(false); })
      .catch(() => setLoadingProducts(false));
  }, []);

  const patchProd  = useCallback((p: Partial<SectionConfig>) => setProdCfg(c => ({ ...c, ...p })),  []);
  const patchShelf = useCallback((p: Partial<ShelfSectionConfig>) => setShelfCfg(c => ({ ...c, ...p })), []);
  const patchZone  = useCallback((p: Partial<SectionConfig>) => setZoneCfg(c => ({ ...c, ...p })),  []);

  const handleDownload = useCallback(async () => {
    setGenerating(true);
    setError(null);

    const config: LabelConfig = {
      print_mode: printMode,
      sections: {
        products: { ...prodCfg,  avery_template: prodCfg.avery_template  ?? AVERY_DEFAULTS.products },
        shelves:  { ...shelfCfg, avery_template: shelfCfg.avery_template ?? AVERY_DEFAULTS.shelves  },
        zones:    { ...zoneCfg,  avery_template: zoneCfg.avery_template  ?? AVERY_DEFAULTS.zones    },
      },
      products,
      zones: STATIC_ZONES,
    };

    try {
      const res = await fetch(API('/labels/generate'), {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(config),
      });
      if (!res.ok) {
        const msg = await res.text().catch(() => res.statusText);
        throw new Error(msg);
      }
      const blob = await res.blob();
      const url  = URL.createObjectURL(blob);
      const a    = document.createElement('a');
      a.href     = url;
      a.download = 'btt_labels.pdf';
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      setError(String(e));
    } finally {
      setGenerating(false);
    }
  }, [printMode, prodCfg, shelfCfg, zoneCfg, products]);

  const nothingSelected = !prodCfg.include && !shelfCfg.include && !zoneCfg.include;
  const noProducts = !loadingProducts && products.length === 0;

  return (
    <div className="flex flex-col gap-4">

      {/* ── Global controls ── */}
      <div className="rounded-xl border border-[#2d3142] bg-[#0f1117] px-4 py-3 flex flex-col gap-3">
        <span className="text-[#e2e8f0] font-semibold text-sm">Global Settings</span>
        <div className="flex items-center gap-3 py-1">
          <Label>Print mode</Label>
          <SegmentedControl<PrintMode>
            value={printMode}
            onChange={setPrintMode}
            options={[
              { value: 'cut',   label: '✂ Cut-yourself' },
              { value: 'avery', label: '📋 Avery-matched' },
            ]}
          />
        </div>
        {printMode === 'avery' && (
          <p className="text-[#57606a] text-xs leading-relaxed">
            Avery templates pre-filled per section below. Cells will align to within ±0.5 mm of the template spec on a US Letter printer.
          </p>
        )}
      </div>

      {/* ── Product stickers ── */}
      <SectionCard
        title="Product Stickers"
        icon="🧊"
        cfg={prodCfg}
        onChange={patchProd}
        showUpc
        showBand={false}
        averyMode={printMode === 'avery'}
        averyKey="products"
      />

      {/* ── Shelf location labels ── */}
      <SectionCard
        title="Shelf Location Labels"
        icon="🗄️"
        cfg={shelfCfg}
        onChange={patchShelf}
        showUpc={false}
        showBand={false}
        averyMode={printMode === 'avery'}
        averyKey="shelves"
        extraRows={
          shelfCfg.include ? (
            <div className="flex items-center gap-3 py-2 border-b border-[#1e2130] last:border-0">
              <Label>Shelf grid</Label>
              <div className="flex items-center gap-2">
                <NumberInput value={shelfCfg.rows} onChange={v => patchShelf({ rows: v })} max={26} />
                <span className="text-[#57606a] text-xs">rows ×</span>
                <NumberInput value={shelfCfg.cols} onChange={v => patchShelf({ cols: v })} max={9} />
                <span className="text-[#57606a] text-xs">cols</span>
                <span className="text-[#57606a] text-xs ml-1">
                  ({shelfCfg.rows * shelfCfg.cols} labels)
                </span>
              </div>
            </div>
          ) : null
        }
      />

      {/* ── Delivery zone labels ── */}
      <SectionCard
        title="Delivery Zone Labels"
        icon="🚚"
        cfg={zoneCfg}
        onChange={patchZone}
        showUpc={false}
        showBand
        averyMode={printMode === 'avery'}
        averyKey="zones"
      />

      {/* ── Errors / warnings ── */}
      {noProducts && (
        <p className="text-[#eab308] text-xs px-1">
          ⚠ No BTT products found in the database. Run the BTT seed script first.
        </p>
      )}
      {nothingSelected && (
        <p className="text-[#57606a] text-xs px-1">
          Enable at least one section to generate a PDF.
        </p>
      )}
      {error && (
        <p className="text-[#ef4444] text-xs px-1 break-words">Error: {error}</p>
      )}

      {/* ── Download button ── */}
      <button
        onClick={handleDownload}
        disabled={generating || nothingSelected || loadingProducts}
        className="w-full py-3 rounded-xl bg-[#f59e0b] text-black font-bold text-sm disabled:opacity-40 transition-all active:brightness-90"
      >
        {generating
          ? 'Generating PDF…'
          : loadingProducts
            ? 'Loading products…'
            : '⬇ Download Labels PDF'}
      </button>

    </div>
  );
}
