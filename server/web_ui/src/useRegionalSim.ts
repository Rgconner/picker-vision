/**
 * useRegionalSim — data hook for the Regional Simulation dashboard.
 *
 * Fetches the list of RS records on mount.  Fetching gantt/capacity data is
 * triggered imperatively by the view component — data is static once generated,
 * so no polling is needed.
 */

import { useCallback, useRef, useState } from 'react';

// ── API shape types ────────────────────────────────────────────────────────────

export interface RSSummary {
  id:           string;
  rs_id:        string;
  preset:       string;
  months:       number;
  generated_at: string;
  salt:          string;
}

export interface PickerProfile {
  picker_id:        string;
  store_id:         string;
  baseline_picks_hr: number;
  miscan_rate:       number;
  multi_scan_rate:   number;
  fatigue_rate:      number;
  shift_hours:       number;
}

export interface RSDetail extends RSSummary {
  config:          Record<string, unknown>;
  picker_profiles: PickerProfile[];
}

export interface CapacitySignal {
  store_id:            string;
  open_orders:         number;
  avg_pick_time_min:   number;
  next_carrier_cutoff: string;
  estimated_clear_time: string;
  accept_new:          boolean;
  capacity_score:      number;
  pickers_active:      number;
  picks_last_hour:     number;
  _meta:               Record<string, unknown>;
}

export interface GanttCell {
  actual_picks:               number;
  actual_avg_interval_sec:    number;
  predicted_picks:            number;
  predicted_avg_interval_sec: number;
  deviation_sigma:            number;
}

export interface GanttData {
  stores:              { store_id: string; name: string }[];
  buckets:             string[];
  cells:               Record<string, GanttCell>;
  std_dev_thresholds:  { green: number; yellow: number };
}

export interface SimStartResult {
  rs_id:       string;
  preset:      string;
  months:      number;
  pick_count:  number;
  elapsed_sec: number;
}

// ── Hook ───────────────────────────────────────────────────────────────────────

export function useRegionalSim() {
  const [simList,   setSimList]   = useState<RSSummary[]>([]);
  const [loading,   setLoading]   = useState(false);
  const [error,     setError]     = useState<string | null>(null);
  const [capacity,  setCapacity]  = useState<CapacitySignal[]>([]);
  const [gantt,     setGantt]     = useState<GanttData | null>(null);
  const mountedRef = useRef(true);

  const apiFetch = useCallback(async (url: string, opts?: RequestInit) => {
    const res = await fetch(url, opts);
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new Error(`HTTP ${res.status}: ${body}`);
    }
    return res.json();
  }, []);

  const fetchList = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await apiFetch('/api/simulations') as RSSummary[];
      if (mountedRef.current) setSimList(data);
    } catch (e) {
      if (mountedRef.current) setError(e instanceof Error ? e.message : String(e));
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  }, [apiFetch]);

  const generateSim = useCallback(async (preset: string, months: number): Promise<SimStartResult | null> => {
    try {
      setLoading(true);
      setError(null);
      const result = await apiFetch('/api/simulations/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ preset, months }),
      }) as SimStartResult;
      await fetchList();
      return result;
    } catch (e) {
      if (mountedRef.current) setError(e instanceof Error ? e.message : String(e));
      return null;
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  }, [apiFetch, fetchList]);

  const fetchCapacity = useCallback(async (rsId: string) => {
    try {
      setError(null);
      const data = await apiFetch(`/api/simulations/${rsId}/capacity`) as CapacitySignal[];
      if (mountedRef.current) setCapacity(data);
    } catch (e) {
      if (mountedRef.current) setError(e instanceof Error ? e.message : String(e));
    }
  }, [apiFetch]);

  const fetchGantt = useCallback(async (
    rsId: string,
    granularity: string,
    start: string,
    end: string,
  ) => {
    try {
      setError(null);
      const qs = new URLSearchParams({ granularity, start, end });
      const data = await apiFetch(`/api/simulations/${rsId}/gantt?${qs}`) as GanttData;
      if (mountedRef.current) setGantt(data);
    } catch (e) {
      if (mountedRef.current) setError(e instanceof Error ? e.message : String(e));
    }
  }, [apiFetch]);

  const deleteSim = useCallback(async (rsId: string) => {
    try {
      setError(null);
      await apiFetch(`/api/simulations/${rsId}`, { method: 'DELETE' });
      await fetchList();
    } catch (e) {
      if (mountedRef.current) setError(e instanceof Error ? e.message : String(e));
    }
  }, [apiFetch, fetchList]);

  return {
    simList,
    loading,
    error,
    capacity,
    gantt,
    fetchList,
    generateSim,
    fetchCapacity,
    fetchGantt,
    deleteSim,
  };
}
