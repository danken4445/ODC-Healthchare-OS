"use client";

import { useCallback, useEffect, useRef, useState } from "react";

interface DetectedBarcode { rawValue: string }
interface BarcodeDetectorInstance { detect(source: ImageBitmapSource): Promise<DetectedBarcode[]> }
interface BarcodeDetectorConstructor {
  new (options: { formats: string[] }): BarcodeDetectorInstance;
  getSupportedFormats?(): Promise<string[]>;
}

export type QrCameraState = "idle" | "requesting" | "scanning" | "unsupported" | "denied" | "error";

export interface QrCameraScannerProps {
  onScan: (payload: string) => void;
  disabled?: boolean;
}

export function QrCameraScanner({ onScan, disabled = false }: QrCameraScannerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const frameRef = useRef<number | null>(null);
  const [state, setState] = useState<QrCameraState>("idle");
  const [manualValue, setManualValue] = useState("");

  const stop = useCallback(() => {
    if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
    frameRef.current = null;
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    setState((current) => current === "scanning" || current === "requesting" ? "idle" : current);
  }, []);

  useEffect(() => stop, [stop]);

  const start = useCallback(async () => {
    if (disabled) return;
    const Detector = (globalThis as typeof globalThis & { BarcodeDetector?: BarcodeDetectorConstructor }).BarcodeDetector;
    if (!navigator.mediaDevices?.getUserMedia || !Detector) {
      setState("unsupported");
      return;
    }
    setState("requesting");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: "environment" } }, audio: false });
      streamRef.current = stream;
      const video = videoRef.current;
      if (!video) throw new Error("Camera preview is unavailable.");
      video.srcObject = stream;
      await video.play();
      const detector = new Detector({ formats: ["qr_code"] });
      setState("scanning");
      const scanFrame = async () => {
        try {
          const codes = await detector.detect(video);
          const value = codes.find((code) => code.rawValue)?.rawValue;
          if (value) {
            stop();
            onScan(value);
            return;
          }
        } catch {
          // A transient frame failure should not stop the camera session.
        }
        frameRef.current = requestAnimationFrame(scanFrame);
      };
      frameRef.current = requestAnimationFrame(scanFrame);
    } catch (error) {
      stop();
      const name = error instanceof DOMException ? error.name : "";
      setState(name === "NotAllowedError" || name === "SecurityError" ? "denied" : "error");
    }
  }, [disabled, onScan, stop]);

  const submitManual = () => {
    const value = manualValue.trim();
    if (!value || disabled) return;
    onScan(value);
  };

  return (
    <section className="odyssey-qr-scanner" aria-label="Invoice QR scanner">
      <div className="odyssey-qr-scanner__preview">
        <video ref={videoRef} muted playsInline aria-label="Camera preview" />
        {state !== "scanning" ? <p>{state === "requesting" ? "Requesting camera access…" : "Camera is off"}</p> : null}
      </div>
      <div className="odyssey-qr-scanner__actions">
        {state === "scanning" ? (
          <button type="button" onClick={stop}>Stop camera</button>
        ) : (
          <button type="button" onClick={() => void start()} disabled={disabled || state === "requesting"}>Start camera</button>
        )}
      </div>
      {state === "unsupported" ? <p role="status">This browser cannot decode QR codes from the camera. Use a handheld scanner or paste the code below.</p> : null}
      {state === "denied" ? <p role="alert">Camera access was blocked. Allow camera access in browser settings, or enter the invoice code manually.</p> : null}
      {state === "error" ? <p role="alert">The camera could not be started. Check that no other app is using it.</p> : null}
      <label className="odyssey-qr-scanner__manual">
        Invoice QR payload
        <span>
          <input value={manualValue} onChange={(event) => setManualValue(event.target.value)} placeholder="ODYSSEY-INVOICE|…" autoComplete="off" />
          <button type="button" disabled={disabled || !manualValue.trim()} onClick={submitManual}>Resolve</button>
        </span>
      </label>
    </section>
  );
}
