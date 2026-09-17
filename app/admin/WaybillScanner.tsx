"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import type { IScannerControls } from "@zxing/browser";
import type { DecodeHintType as HintType } from "@zxing/library";
import { readWaybill } from "@/lib/admin/waybill";
import styles from "./admin.module.css";

function cameraError(e: unknown) {
  const name = e instanceof Error ? e.name : "";
  if (name === "NotAllowedError" || name === "SecurityError") return "Camera access was blocked. Allow the camera for this site in your browser, then try again.";
  if (name === "NotFoundError" || name === "OverconstrainedError") return "No camera was found on this device. Type the waybill number instead.";
  if (name === "NotReadableError") return "The camera is already in use by another app. Close it and try again.";
  return "The camera could not be started. Type the waybill number instead.";
}
export default function WaybillScanner({ onScan, onClose }: { onScan: (waybill: string) => void; onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const video = useRef<HTMLVideoElement>(null);
  const scanned = useRef(onScan);
  const [deviceId, setDeviceId] = useState("");
  const [cameras, setCameras] = useState<MediaDeviceInfo[]>([]);
  const [status, setStatus] = useState("Starting the camera…");
  const [error, setError] = useState("");
  const close = useCallback(() => dialog.current?.close(), []);
  useEffect(() => { scanned.current = onScan; });
  useEffect(() => { dialog.current?.showModal(); }, []);
  useEffect(() => {
    let stopped = false;
    let controls: IScannerControls | undefined;
    // Two identical reads before accepting: a webcam misreads far more often than a hand scanner.
    let last = "", hits = 0;
    (async () => {
      try {
        const [{ BrowserMultiFormatOneDReader }, { BarcodeFormat, DecodeHintType }] = await Promise.all([import("@zxing/browser"), import("@zxing/library")]);
        if (stopped) return;
        const hints = new Map<HintType, unknown>([
          [DecodeHintType.POSSIBLE_FORMATS, [BarcodeFormat.CODE_128, BarcodeFormat.CODE_39, BarcodeFormat.CODE_93, BarcodeFormat.ITF, BarcodeFormat.CODABAR]],
          [DecodeHintType.TRY_HARDER, true],
        ]);
        const reader = new BrowserMultiFormatOneDReader(hints, { delayBetweenScanAttempts: 120, delayBetweenScanSuccess: 120 });
        const source: MediaTrackConstraints = deviceId ? { deviceId: { exact: deviceId } } : { facingMode: "environment" };
        controls = await reader.decodeFromConstraints({ video: { ...source, width: { ideal: 1920 }, height: { ideal: 1080 } } }, video.current!, result => {
          if (!result || stopped) return;
          const waybill = readWaybill(result.getText());
          if (!waybill) { last = ""; hits = 0; setStatus("That code is not a waybill number — scan the Aramex barcode."); return; }
          if (waybill !== last) { last = waybill; hits = 1; setStatus("Reading — hold steady…"); return; }
          if (++hits < 2) return;
          stopped = true;
          controls?.stop();
          scanned.current(waybill);
        });
        if (stopped) { controls.stop(); return; }
        setStatus("Hold the barcode flat, 10–20 cm from the camera.");
        setCameras((await navigator.mediaDevices.enumerateDevices()).filter(d => d.kind === "videoinput"));
      } catch (e) {
        if (!stopped) setError(cameraError(e));
      }
    })();
    return () => { stopped = true; controls?.stop(); };
  }, [deviceId]);
  return <dialog ref={dialog} className={styles.scanner} onClose={onClose} aria-labelledby="scanner-title">
    <h3 id="scanner-title">Scan the Aramex barcode</h3>
    <p className={styles.note}>The barcode on the package scans as the waybill number. Check it in the field before sending.</p>
    <div className={styles.scannerView}>
      <video ref={video} muted playsInline />
      <span aria-hidden="true" />
    </div>
    <p role={error ? "alert" : "status"} className={error ? styles.error : styles.note}>{error || status}</p>
    {cameras.length > 1 && <label htmlFor="scanner-camera">Camera
      <select id="scanner-camera" className={styles.scannerCamera} value={deviceId} onChange={e => { setError(""); setStatus("Switching camera…"); setDeviceId(e.target.value); }}>
        <option value="">Default camera</option>
        {cameras.map((camera, i) => <option key={camera.deviceId} value={camera.deviceId}>{camera.label || `Camera ${i + 1}`}</option>)}
      </select>
    </label>}
    <button className={styles.secondary} type="button" onClick={close}>Cancel</button>
  </dialog>;
}
