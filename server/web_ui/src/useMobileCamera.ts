/**
 * useMobileCamera — manages getUserMedia lifecycle for the mobile picker view.
 *
 * Auto-selects the rear-facing camera on phones/tablets using
 * facingMode: 'environment'.  Falls back to any available camera if the
 * environment camera is not available.  Exposes a list of all video devices
 * so the user can manually switch if auto-detection picks the wrong one.
 */

import { useCallback, useEffect, useRef, useState } from 'react';

export type CameraFacing = 'environment' | 'user' | 'exact-environment' | string;

export interface CameraDevice {
  deviceId: string;
  label: string;
}

export interface MobileCameraState {
  stream: MediaStream | null;
  devices: CameraDevice[];
  activeDeviceId: string | null;
  facing: CameraFacing;
  error: string | null;
  ready: boolean;
  switchCamera: (deviceId: string) => void;
  toggleFacing: () => void;
}

export function useMobileCamera(): MobileCameraState {
  const [stream, setStream]               = useState<MediaStream | null>(null);
  const [devices, setDevices]             = useState<CameraDevice[]>([]);
  const [activeDeviceId, setActiveDeviceId] = useState<string | null>(null);
  const [facing, setFacing]               = useState<CameraFacing>('environment');
  const [error, setError]                 = useState<string | null>(null);
  const [ready, setReady]                 = useState(false);
  const streamRef                         = useRef<MediaStream | null>(null);

  // Stop the current stream tracks cleanly
  function stopStream() {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
  }

  // Enumerate video input devices (requires a stream to be open first —
  // browsers withhold labels until permission is granted)
  async function enumerateDevices(): Promise<CameraDevice[]> {
    try {
      const all = await navigator.mediaDevices.enumerateDevices();
      return all
        .filter((d) => d.kind === 'videoinput')
        .map((d, i) => ({
          deviceId: d.deviceId,
          label: d.label || `Camera ${i + 1}`,
        }));
    } catch {
      return [];
    }
  }

  const openCamera = useCallback(async (deviceId?: string | null) => {
    stopStream();
    setReady(false);
    setError(null);

    const ua       = navigator.userAgent;
    const platform = `${ua.substring(0, 120)}`;
    console.info('[Camera] openCamera called — UA:', platform);

    if (!navigator.mediaDevices?.getUserMedia) {
      const msg = 'Camera unavailable — page must be served over HTTPS (getUserMedia not available).';
      console.warn('[Camera] getUserMedia missing. UA:', platform);
      setError(msg);
      return;
    }

    try {
      let targetDeviceId = deviceId; // only set when user explicitly switches camera

      // Auto-open: always use facingMode — never deviceId:exact on initial open.
      // Samsung Android Chrome returns black frames when deviceId:exact is used
      // before the user has interacted with the camera permission dialog, even
      // when the probe stream succeeds. facingMode works reliably on all devices.
      if (!targetDeviceId) {
        // Enumerate for the device list UI — but do NOT use the result to pick a deviceId.
        const probe = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' } } }).catch((e) => {
          console.warn('[Camera] initial probe failed:', e);
          return null;
        });
        if (probe) probe.getTracks().forEach((t) => t.stop());

        const all = await enumerateDevices();
        console.info('[Camera] enumerated devices:', all.map((d) => `${d.label || '(no label)'}(${d.deviceId.slice(0,8)})`).join(', ') || 'none');
        // Populate device switcher but keep targetDeviceId null — use facingMode below
      }

      // Always use facingMode for auto-open; deviceId:exact only for explicit switch
      const constraints: MediaStreamConstraints = targetDeviceId
        ? { video: { deviceId: { exact: targetDeviceId }, width: { ideal: 1920 }, height: { ideal: 1080 } } }
        : { video: { facingMode: { ideal: 'environment' }, width: { ideal: 1920 }, height: { ideal: 1080 } } };

      console.info('[Camera] requesting stream — targetDeviceId:', targetDeviceId?.slice(0,8) ?? 'null', 'constraints:', JSON.stringify(constraints));
      const s = await navigator.mediaDevices.getUserMedia(constraints);
      streamRef.current = s;
      setStream(s);

      const track    = s.getVideoTracks()[0];
      const settings = track?.getSettings?.() ?? {};
      const resolvedFacing = (settings as MediaTrackSettings & { facingMode?: string }).facingMode ?? 'environment';
      const resolvedDevice = (settings as MediaTrackSettings & { deviceId?: string }).deviceId ?? targetDeviceId ?? null;
      console.info('[Camera] stream ready — facing:', resolvedFacing, 'deviceId:', resolvedDevice?.slice(0,8), 'width:', (settings as MediaTrackSettings).width, 'height:', (settings as MediaTrackSettings).height);

      setFacing(resolvedFacing);
      setActiveDeviceId(resolvedDevice);

      const devs = await enumerateDevices();
      setDevices(devs);
      setReady(true);
    } catch (err) {
      const msg = err instanceof Error ? `${err.name}: ${err.message}` : String(err);
      console.error('[Camera] getUserMedia failed:', msg, '— UA:', platform);
      setError(`Camera error: ${msg}`);
      setReady(false);
    }
  }, []);

  // Initial open on mount — auto rear camera
  useEffect(() => {
    openCamera(null);
    return () => stopStream();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const switchCamera = useCallback((deviceId: string) => {
    openCamera(deviceId);
  }, [openCamera]);

  const toggleFacing = useCallback(() => {
    const next = facing === 'environment' ? 'user' : 'environment';
    stopStream();
    setReady(false);
    const constraints: MediaStreamConstraints = {
      video: { facingMode: { ideal: next }, width: { ideal: 1280 }, height: { ideal: 720 } },
    };
    navigator.mediaDevices.getUserMedia(constraints).then((s) => {
      streamRef.current = s;
      setStream(s);
      const track = s.getVideoTracks()[0];
      const settings = track?.getSettings?.() ?? {};
      setFacing((settings as MediaTrackSettings & { facingMode?: string }).facingMode ?? next);
      setActiveDeviceId((settings as MediaTrackSettings & { deviceId?: string }).deviceId ?? null);
      setReady(true);
    }).catch((err) => {
      setError(`Camera error: ${err instanceof Error ? err.message : String(err)}`);
    });
  }, [facing]);

  return { stream, devices, activeDeviceId, facing, error, ready, switchCamera, toggleFacing };
}
