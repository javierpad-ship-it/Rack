'use client';

import { useEffect, useRef } from 'react';
import JsBarcode from 'jsbarcode';

// Renderiza un código de barras Code128 (lo lee el imager de la EDA52).
export default function Barcode({
  value,
  height = 44,
  width = 1.7,
}: {
  value: string;
  height?: number;
  width?: number;
}) {
  const ref = useRef<SVGSVGElement>(null);

  useEffect(() => {
    if (!ref.current || !value) return;
    try {
      JsBarcode(ref.current, value, {
        format: 'CODE128',
        height,
        width,
        displayValue: false,
        margin: 0,
        background: 'transparent',
      });
    } catch {
      // valor no codificable: se deja vacío
    }
  }, [value, height, width]);

  return <svg ref={ref} aria-label={`Código de barras ${value}`} />;
}
