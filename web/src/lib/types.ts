// Tipos del dominio Rack (espejo del esquema en supabase/migrations).

export type UserRole = 'admin' | 'analista' | 'visual' | 'encargado' | 'operario' | 'reponedor';

export interface Store {
  id: string;
  code: string;
  name: string;
  floors: number;
  created_at: string;
}

export interface Profile {
  id: string;
  full_name: string | null;
  role: UserRole;
  store_id: string | null;
  created_at: string;
}

export interface Product {
  sku: string;
  ean: string | null;
  name: string;
  family: string | null;
  category: string | null;
  updated_at: string;
}

export interface Fixture {
  id: string;
  store_id: string;
  barcode: string;
  floor: number;
  name: string;
  pin_x: number | null;
  pin_y: number | null;
  active: boolean;
  created_at: string;
}

export interface StoreLayout {
  store_id: string;
  floor: number;
  image_url: string | null;
  image_width: number | null;
  image_height: number | null;
  updated_at: string;
}

export interface WeeklyFixtureMetric {
  id: string;
  store_id: string;
  fixture_id: string;
  week: string;
  units_sold: number;
  amount_sold: number;
  exposed_units: number;
  rotation: number | null;
}

export interface WarehouseRow {
  sku: string;
  total_units: number;
  floor_units: number;
  warehouse_units: number;
}
