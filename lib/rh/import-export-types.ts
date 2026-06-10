import type { TypePointage } from '@/lib/validation/rh';

export type ImportStats = {
  inserted: number;
  skipped: number;
  invalidEmp: number;
  newEmployes: number;
  newChantiers: number;
};

export type FiltresExport = {
  dateMin?: string;
  dateMax?: string;
  employeId?: string;
  chantierId?: string;
  type?: TypePointage;
};

export type FormatImport = 'json' | 'excel';

export function detectFormatImport(filename: string): FormatImport | null {
  const lower = filename.toLowerCase();
  if (lower.endsWith('.json')) return 'json';
  if (lower.endsWith('.xlsx') || lower.endsWith('.xls') || lower.endsWith('.csv')) {
    return 'excel';
  }
  return null;
}
