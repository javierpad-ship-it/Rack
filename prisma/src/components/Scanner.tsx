'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';

// Normaliza el código escaneado igual que norm_sku() en SQL: quita ceros a la
// izquierda en códigos numéricos (así ventas/stock/escaneo siempre cruzan).
function normSku(v: string): string {
  const s = v.trim();
  return /^\d+$/.test(s) ? s.replace(/^0+/, '') || '0' : s;
}

const FORMATS = ['ean_13', 'ean_8', 'code_128', 'code_39', 'upc_a', 'upc_e', 'itf', 'codabar'];

export default function Scanner() {
  const router = useRouter();
  const videoRef = useRef<HTMLVideoElement>(null);
  const [manual, setManual] = useState('');
  const [status, setStatus] = useState<'idle' | 'scanning' | 'unsupported' | 'denied'>('idle');
  const goneRef = useRef(false);

  function go(code: string) {
    const sku = normSku(code);
    if (!sku || goneRef.current) return;
    goneRef.current = true;
    router.push(`/ficha/${encodeURIComponent(sku)}`);
  }

  useEffect(() => {
    let stream: MediaStream | null = null;
    let raf = 0;
    let detector: any = null;
    const AnyWin = window as any;

    async function start() {
      if (!('BarcodeDetector' in AnyWin) || !navigator.mediaDevices?.getUserMedia) {
        setStatus('unsupported');
        return;
      }
      try {
        detector = new AnyWin.BarcodeDetector({ formats: FORMATS });
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
        const v = videoRef.current;
        if (!v) return;
        v.srcObject = stream;
        await v.play();
        setStatus('scanning');
        const tick = async () => {
          if (goneRef.current) return;
          try {
            const codes = await detector.detect(v);
            if (codes && codes.length) {
              go(codes[0].rawValue as string);
              return;
            }
          } catch {
            /* frame sin lectura */
          }
          raf = requestAnimationFrame(tick);
        };
        raf = requestAnimationFrame(tick);
      } catch {
        setStatus('denied');
      }
    }
    start();
    return () => {
      cancelAnimationFrame(raf);
      stream?.getTracks().forEach((t) => t.stop());
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <>
      <div className="scan-view">
        <video ref={videoRef} muted playsInline />
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
