export type TallaRow = {
  talla: string | null;
  sku: string;
  stock: number;
  almacen: number;
  piso: number;
  vta30: number;
  hit: boolean;
};

export type ColorGroup = {
  color: string;
  stock: number;
  tallas: TallaRow[];
};

export type PriceInfo = {
  pvp_vigente: number | null;
  fecha_cambio: string | null;
  pvp_anterior: number | null;
  historial: { pvp: number; desde: string }[];
};

export type VariantLookup = {
  sku: string;
  found: boolean;
  variante: {
    sku: string;
    generic_code: string | null;
    article_code: string | null;
    description: string | null;
    gender: string | null;
    mundo: string | null;
    color: string | null;
    talla: string | null;
    brand: string | null;
    grupo: string | null;
  };
  precio: PriceInfo;
  sales_org: string | null;
  empresa_id: string | null;
  empresa_nombre: string | null;
  stock_variante: number;
  piso: number;
  almacen: number;
  vendido_dias: number;
  vendido: number;
  por_color: ColorGroup[];
};

export function money(v: number | null | undefined): string {
  if (v == null) return '—';
  return 'S/ ' + Number(v).toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function fmtDate(d: string | null): string {
  if (!d) return '—';
  const [y, m, day] = d.split('-');
  return day && m && y ? `${day}/${m}/${y.slice(2)}` : d;
}
