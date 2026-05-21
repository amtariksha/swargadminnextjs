/**
 * Production data hooks (Feature 16) — intermediates, recipes, production runs,
 * write-offs, and reports.
 *
 * Numeric DB columns (NUMERIC) arrive as strings from the Postgres driver;
 * fields below are typed `number | string` — use Number(...) before maths.
 */

import { useQuery } from '@tanstack/react-query';
import { GET } from '@/lib/api';

export type StockInputType = 'raw_material' | 'intermediate';
export type WriteoffItemType = 'raw_material' | 'intermediate' | 'product';

export interface IntermediateProduct {
  id: number;
  name: string;
  base_unit: string;
  current_stock: number | string;
  is_active: number;
  notes?: string | null;
  created_at?: string;
  updated_at?: string;
}

export interface RecipeInput {
  id?: number;
  recipe_id?: number;
  input_type: StockInputType;
  input_id: number;
  standard_qty: number | string;
  input_name?: string | null;
  input_unit?: string | null;
}

export interface Recipe {
  id: number;
  output_intermediate_id: number;
  name: string;
  standard_output_qty: number | string;
  notes?: string | null;
  is_active: number;
  output_intermediate_name?: string;
  output_base_unit?: string;
  input_count?: number;
  inputs?: RecipeInput[];
}

export interface ProductionInput {
  id?: number;
  production_run_id?: number;
  input_type: StockInputType;
  input_id: number;
  qty_consumed: number | string;
}

export interface ProductionRun {
  id: number;
  recipe_id?: number | null;
  output_intermediate_id: number;
  production_date: string;
  actual_output_qty: number | string;
  wastage_qty: number | string;
  notes?: string | null;
  output_intermediate_name?: string;
  output_base_unit?: string;
  recipe_name?: string | null;
  inputs?: ProductionInput[];
}

export interface Writeoff {
  id: number;
  item_type: WriteoffItemType;
  item_id: number;
  qty: number | string;
  reason?: string | null;
  writeoff_date: string;
  item_name?: string | null;
  created_at?: string;
}

export interface StockLevels {
  raw_materials: Array<{ id: number; name: string; unit: string; current_stock: number | string; is_active: number }>;
  intermediates: Array<{ id: number; name: string; base_unit: string; current_stock: number | string; is_active: number }>;
  finished_manufactured: Array<{
    id: number; title: string; pack_volume: number | string; source_intermediate_id: number;
    intermediate_name: string; intermediate_stock: number | string; derived_stock: number | string;
  }>;
}

export interface ProductionHistory {
  summary: { run_count: number; total_output: number | string; total_wastage: number | string };
  runs: ProductionRun[];
}

export interface WastageReport {
  summary: { production_wastage_total: number; writeoff_count: number; writeoff_qty_total: number };
  production_wastage: Array<{ id: number; production_date: string; wastage_qty: number | string; output_intermediate_name: string; base_unit: string }>;
  writeoffs: Writeoff[];
}

export interface YieldVarianceRow {
  recipe_id: number;
  recipe_name: string;
  standard_output_qty: number | string;
  output_intermediate_name: string;
  base_unit: string;
  run_count: number;
  avg_actual_output: number | string;
  total_actual_output: number | string;
  total_wastage: number | string;
  variance: number;
  variance_pct: number | null;
}

export function useIntermediates() {
  return useQuery({
    queryKey: ['production', 'intermediates'],
    queryFn: async () => (await GET<IntermediateProduct[]>('/production/intermediates')).data || [],
  });
}

export function useRecipes() {
  return useQuery({
    queryKey: ['production', 'recipes'],
    queryFn: async () => (await GET<Recipe[]>('/production/recipes')).data || [],
  });
}

export function useProductionRuns() {
  return useQuery({
    queryKey: ['production', 'runs'],
    queryFn: async () => (await GET<ProductionRun[]>('/production/runs')).data || [],
  });
}

export function useWriteoffs() {
  return useQuery({
    queryKey: ['production', 'writeoffs'],
    queryFn: async () => (await GET<Writeoff[]>('/production/writeoffs')).data || [],
  });
}

export function useStockLevels() {
  return useQuery({
    queryKey: ['production', 'reports', 'stock'],
    queryFn: async () => (await GET<StockLevels>('/production/reports/stock')).data,
  });
}

export function useProductionHistory(filters: Record<string, string>) {
  return useQuery({
    queryKey: ['production', 'reports', 'history', filters],
    queryFn: async () => (await GET<ProductionHistory>('/production/reports/history', filters)).data,
  });
}

export function useWastageReport(filters: Record<string, string>) {
  return useQuery({
    queryKey: ['production', 'reports', 'wastage', filters],
    queryFn: async () => (await GET<WastageReport>('/production/reports/wastage', filters)).data,
  });
}

export function useYieldVariance() {
  return useQuery({
    queryKey: ['production', 'reports', 'yield-variance'],
    queryFn: async () => (await GET<YieldVarianceRow[]>('/production/reports/yield-variance')).data || [],
  });
}

/** Fetch a single recipe (with its inputs) on demand — used by the run form. */
export async function fetchRecipe(id: number): Promise<Recipe> {
  return (await GET<Recipe>(`/production/recipes/${id}`)).data;
}

/** Fetch a single production run (with its inputs) on demand — used by the edit form. */
export async function fetchProductionRun(id: number): Promise<ProductionRun> {
  return (await GET<ProductionRun>(`/production/runs/${id}`)).data;
}
