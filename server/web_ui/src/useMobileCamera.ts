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

    // getUserMedia requires a secure context (HTTPS or localhost).
    // navigator.mediaDevices is undefined on plain HTTP over LAN.
    if (!navigator.mediaDevices?.getUserMedia) {
      setError(
        'Camera unavailable: this page must be served over HTTPS. ' +
        'Ask your administrator to enable TLS on the web-ui service, ' +
        'or open the site via https://.'
      );
      return;
    }

    // Build constraints: prefer environment-facing; allow explicit deviceId override
    let constraints: MediaStreamConstraints;
    if (deviceId) {
      constraints = { video: { deviceId: { exact: deviceId }, width: { ideal: 1280 }, height: { ideal: 720 } } };
    } else {
      // Try environment (rear) camera first
      constraints = { video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } } };
    }

    try {
      const s = await navigator.mediaDevices.getUserMedia(constraints);
      streamRef.current = s;
      setStream(s);

      // Detect which facing mode we actually got
      const track = s.getVideoTracks()[0];
      const settings = track?.getSettings?.() ?? {};
      setFacing((settings as MediaTrackSettings & { facingMode?: string }).facingMode ?? 'environment');
      setActiveDeviceId((settings as MediaTrackSettings & { deviceId?: string }).deviceId ?? deviceId ?? null);

      // Now that we have permission, enumerate all devices
      const devs = await enumerateDevices();
      setDevices(devs);
      setReady(true);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
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
