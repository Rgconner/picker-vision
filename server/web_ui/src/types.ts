export interface BBox { x: number; y: number; w: number; h: number; }

export interface Detection {
  symbology: string;
  value: string;
  bbox: [number, number, number, number];
  centre: [number, number];
  type: 'product' | 'staging';
  staging_code: string | null;
  active: boolean;
  on_active_order: boolean;
  product_description: string | null;
  staging_label: string | null;
  order_id: string | null;
  line_id: string | null;
  status: 'correct' | 'unexpected' | null;
  distance_to_centre?: number;
}

export interface BoundaryPoint { x: number; y: number; }

export interface StagingRegion {
  staging_code: string | null;
  boundary_points: [number, number][];
  centre: [number, number];
  staging_status: 'pending' | 'complete' | 'locked';
  lock_state: boolean;
  staging_label: string | null;
  staging_type: 'area' | 'container' | null;
}

export interface OrderLine {
  id: string;
  product_barcode: string;
  product_description: string | null;
  quantity: number;
  quantity_picked: number;
  staging_code: string;
  staging_label: string | null;
  status: 'pending' | 'picked' | 'error';
}

export interface Order {
  id: string;
  reference: string;
  customer: string;
  status: string;
  lines: OrderLine[];
}

export interface PickerState {
  picker_id: string;
  timestamp: string;
  detections: Detection[];
  staging_regions: StagingRegion[];
  order_complete_pending?: {
    type: string;
    order_id: string;
    picker_id: string;
    staging_code: string;
  };
}

export interface ValidationResult {
  type: 'validation_result';
  picker_id: string;
  correct: string[];
  missing: string[];
  unexpected: string[];
}

export interface PickerInfo {
  picker_id: string;
  stream_url: string;
  control_url?: string;
  status: 'online' | 'offline';
  version?: string;
  last_seen_at?: string;
  registered_at?: string;
}

export interface ServiceVersionInfo {
  url?: string | null;
  version: string;
}

export type ServiceVersions = Record<string, ServiceVersionInfo>;

// ── Telemetry ─────────────────────────────────────────────────────────────────

export interface ServiceTelemetry {
  status: string;           // 'ok' | 'error' | 'unreachable'
  service?: string;
  version?: string;
  started_at?: string;
  uptime_seconds?: number;
  counters?: Record<string, number>;
  reachable?: boolean;
  error?: string;
  http_status?: number;
}

export interface SystemTelemetry {
  services: Record<string, ServiceTelemetry>;
  pickers: PickerInfo[];
  collected_at: string;
}

export interface LogLine {
  ts: number;
  time: string;
  level: string;
  logger: string;
  message: string;
}

export interface LogResponse {
  service: string;
  picker_id?: string;
  lines: LogLine[];
}
