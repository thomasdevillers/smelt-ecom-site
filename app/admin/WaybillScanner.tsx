"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import type { DecodeHintType as HintType, Result } from "@zxing/library";
import { readWaybill } from "@/lib/admin/waybill";
import styles from "./admin.module.css";

// Decode region as a fraction of the camera frame. Matches the guide box drawn over the preview,
// so lining the barcode up inside the frame is literally what gets read.
const REGION = { x: 0.04, y: 0.22, w: 0.92, h: 0.56 };
// ZXing wants roughly 2-4 pixels per barcode module. A full-resolution webcam frame gives far more,
// and the 8px blocks HybridBinarizer uses then land inside a single bar and threshold it away: a
// 1440px-wide frame never reads, the same frame shrunk to 800px reads every time. So decode from
// downscaled copies, one width per tick, covering barcodes held close through barcodes held far off.
const WIDTHS = [800, 560, 1120, 400];
const TICK = 60;

function cameraError(e: unknown) {
  const name = e instanceof Error ? e.name : "";
  if (name === "NotAllowedError" || name === "SecurityError") return "Camera access was blocked. Allow the camera for this site in your browser, then try again.";
  if (name === "NotFoundError" || name === "OverconstrainedError") return "No camera was found on this device. Type the waybill number instead.";
  if (name === "NotReadableError") return "The camera is already in use by another app. Close it and try again.";
  return "The camera could not be started. Type the waybill number instead.";
}
async function ready(preview: HTMLVideoElement) {
  preview.play().catch(() => { });
  if (preview.videoWidth) return;
  await new Promise<void>(resolve => {
    const done = () => resolve();
    preview.addEventListener("loadedmetadata", done, { once: true });
    setTimeout(done, 8000);
  });
}
export default function WaybillScanner({ onScan, onClose }: { onScan: (waybill: string) => void; onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const video = useRef<HTMLVideoElement>(null);
  const scanned = useRef(onScan);
  const [deviceId, setDeviceId] = useState("");
  const [cameras, setCameras] = useState<MediaDeviceInfo[]>([]);
  const [ratio, setRatio] = useState("4 / 3");
  const [status, setStatus] = useState("Starting the camera…");
  const [error, setError] = useState("");
  const close = useCallback(() => dialog.current?.close(), []);
  useEffect(() => { scanned.current = onScan; });
  useEffect(() => { dialog.current?.showModal(); }, []);
  useEffect(() => {
    let stream: MediaStream | undefined;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let stopped = false;
    let last = "";
    function stop() {
      stopped = true;
      clearTimeout(timer);
      stream?.getTracks().forEach(track => track.stop());
    }
    (async () => {
      try {
        const [lib, browser] = await Promise.all([import("@zxing/library"), import("@zxing/browser")]);
        const { BarcodeFormat, BinaryBitmap, DecodeHintType, HybridBinarizer, MultiFormatOneDReader } = lib;
        const { HTMLCanvasElementLuminanceSource } = browser;
        const hints = new Map<HintType, unknown>([
          [DecodeHintType.POSSIBLE_FORMATS, [BarcodeFormat.CODE_128, BarcodeFormat.CODE_93, BarcodeFormat.CODE_39, BarcodeFormat.ITF, BarcodeFormat.CODABAR]],
          [DecodeHintType.TRY_HARDER, true],
        ]);
        // Code 128 and 93 carry a mandatory check character, so one clean read is trustworthy.
        // The others have no checksum, so make them repeat before accepting.
        const checksummed = new Set([BarcodeFormat.CODE_128, BarcodeFormat.CODE_93]);
        const reader = new MultiFormatOneDReader(hints);
        const source: MediaTrackConstraints = deviceId ? { deviceId: { exact: deviceId } } : { facingMode: "environment" };
        stream = await navigator.mediaDevices.getUserMedia({ video: { ...source, width: { ideal: 1280 }, height: { ideal: 720 } } });
        const preview = video.current;
        if (stopped || !preview) return stop();
        preview.srcObject = stream;
        await ready(preview);
        if (stopped) return stop();
        if (preview.videoWidth) setRatio(`${preview.videoWidth} / ${preview.videoHeight}`);
        setStatus("Line the barcode up inside the frame.");
        setCameras((await navigator.mediaDevices.enumerateDevices()).filter(device => device.kind === "videoinput"));
        const canvas = document.createElement("canvas");
        const context = canvas.getContext("2d", { willReadFrequently: true });
        if (!context) return stop();
        context.imageSmoothingEnabled = true;
        context.imageSmoothingQuality = "high";
        let attempt = 0;
        const tick = () => {
          if (stopped) return;
          const frameWidth = preview.videoWidth, frameHeight = preview.videoHeight;
          if (frameWidth && frameHeight) {
            const sourceWidth = frameWidth * REGION.w, sourceHeight = frameHeight * REGION.h;
            const width = Math.min(WIDTHS[attempt++ % WIDTHS.length], Math.round(sourceWidth));
            const height = Math.max(1, Math.round(width * (sourceHeight / sourceWidth)));
            if (canvas.width !== width || canvas.height !== height) { canvas.width = width; canvas.height = height; }
            context.drawImage(preview, frameWidth * REGION.x, frameHeight * REGION.y, sourceWidth, sourceHeight, 0, 0, width, height);
            let result: Result | undefined;
            try { result = reader.decode(new BinaryBitmap(new HybridBinarizer(new HTMLCanvasElementLuminanceSource(canvas))), hints); } catch { }
            const waybill = result ? readWaybill(result.getText()) : null;
            if (result && !waybill) { last = ""; setStatus("That code is not a waybill number — scan the Aramex barcode."); }
            else if (result && waybill && (checksummed.has(result.getBarcodeFormat()) || waybill === last)) {
              stop();
              return scanned.current(waybill);
            } else if (waybill) { last = waybill; setStatus("Reading — hold steady…"); }
          }
          timer = setTimeout(tick, TICK);
        };
        tick();
      } catch (e) {
        if (!stopped) setError(cameraError(e));
      }
    })();
    return stop;
  }, [deviceId]);
  return <dialog ref={dialog} className={styles.scanner} onClose={onClose} aria-labelledby="scanner-title">
    <h3 id="scanner-title">Scan the Aramex barcode</h3>
    <p className={styles.note}>The barcode on the package scans as the waybill number. Check it in the field before sending.</p>
    <div className={styles.scannerView}>
      <video ref={video} style={{ aspectRatio: ratio }} autoPlay muted playsInline />
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
