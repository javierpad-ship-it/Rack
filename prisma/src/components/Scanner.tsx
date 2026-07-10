'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';

// Normaliza el código escaneado igual que norm_sku() en SQL: quita ceros a la
// izquierda en códigos numéricos (así ventas/stock/escaneo siempre cruzan).
function normSku(v: string): string {
  const s = v.trim();
  return /^\d+$/.test(s) ? s.replace(/^0+/, '') || '0' : s;
}

// Chrome/Android trae BarcodeDetector nativo (rápido, sin dependencias). Safari
// e iOS no lo soportan (ver caniuse), así que hay un fallback en JS puro con
// ZXing (@zxing/browser), cargado solo cuando hace falta.
const NATIVE_FORMATS = ['ean_13', 'ean_8', 'code_128', 'code_39', 'upc_a', 'upc_e', 'itf', 'codabar'];

type Status = 'idle' | 'scanning' | 'unsupported' | 'denied';

export default function Scanner() {
  const router = useRouter();
  const videoRef = useRef<HTMLVideoElement>(null);
  const [manual, setManual] = useState('');
  const [status, setStatus] = useState<Status>('idle');
  const goneRef = useRef(false);
  const stopRef = useRef<(() => void) | null>(null);

  function go(code: string) {
    const sku = normSku(code);
    if (!sku || goneRef.current) return;
    goneRef.current = true;
    stopRef.current?.();
    router.push(`/ficha/${encodeURIComponent(sku)}`);
  }

  useEffect(() => {
    let cancelled = false;
    let stream: MediaStream | null = null;
    let raf = 0;
    const AnyWin = window as any;

    // Camino rápido: BarcodeDetector nativo (Chrome/Android).
    async function startNative() {
      const detector = new AnyWin.BarcodeDetector({ formats: NATIVE_FORMATS });
      stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
      stopRef.current = () => stream?.getTracks().forEach((t) => t.stop());
      const v = videoRef.current;
      if (!v || cancelled) return;
      v.srcObject = stream;
      await v.play();
      if (cancelled) return;
      setStatus('scanning');
      const tick = async () => {
        if (goneRef.current || cancelled) return;
        try {
          const codes = await detector.detect(v);
          if (codes && codes.length) { go(codes[0].rawValue as string); return; }
        } catch {
          /* frame sin lectura */
        }
        raf = requestAnimationFrame(tick);
      };
      raf = requestAnimationFrame(tick);
    }

    // Fallback: ZXing en JS puro — funciona en Safari/iOS (sin BarcodeDetector).
    async function startZXing() {
      const { BrowserMultiFormatReader } = await import('@zxing/browser');
      const reader = new BrowserMultiFormatReader();
      const v = videoRef.current;
      if (!v || cancelled) return;
      const controls = await reader.decodeFromConstraints(
        { video: { facingMode: 'environment' } },
        v,
        (result) => {
          if (result && !goneRef.current) go(result.getText());
        },
      );
      if (cancelled) { controls.stop(); return; }
      stopRef.current = () => controls.stop();
      setStatus('scanning');
    }

    async function start() {
      try {
        if ('BarcodeDetector' in AnyWin) {
          await startNative();
        } else if (navigator.mediaDevices) {
          await startZXing();
        } else {
          setStatus('unsupported');
        }
      } catch {
        setStatus('denied');
      }
    }
    start();

    return () => {
      cancelled = true;
      cancelAnimationFrame(raf);
      stream?.getTracks().forEach((t) => t.stop());
      stopRef.current?.();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <>
      <div className="scan-view">
        <video ref={videoRef} muted playsInline autoPlay />
        <div className="reticle">
          <span className="corner tl" /><span className="corner tr" />
          <span className="corner bl" /><span className="corner br" />
          <span className="laser" />
        </div>
        <div className="scan-hint">
          {status === 'scanning' && 'Apunta la cámara al código de barras'}
          {status === 'idle' && 'Iniciando cámara…'}
          {status === 'unsupported' && 'Cámara no disponible — usa la búsqueda manual'}
          {status === 'denied' && 'Sin permiso de cámara — usa la búsqueda manual'}
        </div>
      </div>

      <form
        onSubmit={(e) => { e.preventDefault(); if (manual.trim()) go(manual); }}
      >
        <label className="field">o buscar manualmente</label>
        <span className="input">
          <input
            inputMode="numeric"
            placeholder="Código de variante / SKU"
            value={manual}
            onChange={(e) => setManual(e.target.value)}
          />
          <button className="eye" type="submit" aria-label="Buscar">🔍</button>
        </span>
      </form>
    </>
  );
}
