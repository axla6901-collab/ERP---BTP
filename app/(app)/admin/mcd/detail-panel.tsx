'use client';

import { XIcon } from 'lucide-react';

import type { McdColumn, McdSchema, McdTable } from '@/lib/admin/mcd-introspect';
import { MCD_MODULES } from '@/lib/admin/mcd-modules';
import { cn } from '@/lib/utils';

type Props = {
  table: McdTable | null;
  schema: McdSchema;
  onClose: () => void;
  onSelect: (tableName: string) => void;
};

function compactType(sqlType: string): string {
  return sqlType
    .replace(/^timestamp with time zone$/, 'timestamptz')
    .replace(/^timestamp without time zone$/, 'timestamp')
    .replace(/^character varying/, 'varchar')
    .replace(/\s+/g, ' ')
    .replace(/numeric\((\d+),\s*(\d+)\)/, 'num($1,$2)');
}

function columnFlags(c: McdColumn): { code: 'PK' | 'FK' | 'UQ' | 'NN' | 'IDX'; cls: string }[] {
  const flags: { code: 'PK' | 'FK' | 'UQ' | 'NN' | 'IDX'; cls: string }[] = [];
  if (c.primary) flags.push({ code: 'PK', cls: 'bg-[#C0392B] text-white' });
  if (c.fk) flags.push({ code: 'FK', cls: 'bg-[#3B82F6] text-white' });
  if (c.unique) flags.push({ code: 'UQ', cls: 'bg-[#10B981] text-white' });
  if (c.notNull && !c.primary) flags.push({ code: 'NN', cls: 'bg-[#D1D5DB] text-[#1F2937]' });
  if (c.indexed && !c.primary) flags.push({ code: 'IDX', cls: 'bg-[#F59E0B] text-white' });
  return flags;
}

export function DetailPanel({ table, schema, onClose, onSelect }: Props) {
  const open = table !== null;
  const mod = table ? MCD_MODULES[table.moduleId] : null;

  const fkSortantes = table ? table.columns.filter((c) => c.fk !== null) : [];
  const fkEntrantes = table
    ? schema.relations
        .filter((r) => r.target === table.name)
        .map((r) => ({
          sourceTable: r.source,
          sourceColumn: r.sourceColumn,
          targetColumn: r.targetColumn,
          cardinality: r.cardinality,
        }))
    : [];

  return (
    <aside
      className={cn(
        'fixed right-0 top-0 z-50 flex h-screen w-[440px] flex-col border-l bg-white shadow-[-4px_0_14px_rgba(0,0,0,0.08)] transition-transform duration-300',
        open ? 'translate-x-0' : 'translate-x-full',
      )}
      onClick={(e) => e.stopPropagation()}
    >
      {table && mod && (
        <>
          <button
            type="button"
            onClick={onClose}
            className="absolute right-3 top-3 z-10 text-2xl leading-none text-muted-foreground transition-colors hover:text-[#C0392B]"
            aria-label="Fermer"
          >
            <XIcon className="size-5" />
          </button>

          <div className="border-b px-4 py-4 pr-12">
            <h2 className="font-mono text-[17px] font-semibold text-[#C0392B] break-all">
              {table.name}
            </h2>
            <div className="mt-1 text-xs text-muted-foreground">
              <span
                className="mr-2 inline-block rounded-full px-2 py-0.5 text-[11px] font-semibold"
                style={{ background: mod.bg, color: mod.color }}
              >
                {mod.label}
              </span>
              {table.columns.length} attributs · {fkSortantes.length + fkEntrantes.length} relations
              {table.isJunction && ' · Table d’association'}
            </div>
          </div>

          <div className="flex-1 overflow-y-auto px-4 py-3">
            <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              Attributs ({table.columns.length})
            </h3>
            <ul className="space-y-1.5">
              {table.columns.map((c) => {
                const flags = columnFlags(c);
                return (
                  <li
                    key={c.name}
                    className={cn(
                      'rounded-md border bg-white p-2 shadow-sm transition-colors hover:border-[#C0392B]/40',
                      c.primary && 'border-[#C0392B]/40 bg-red-50/30',
                      c.fk && !c.primary && 'border-[#3B82F6]/40 bg-blue-50/30',
                    )}
                  >
                    <div className="flex items-start gap-2">
                      <div className="min-w-0 flex-1">
                        <div className="font-mono text-[12px] font-semibold break-all">
                          {c.name}
                        </div>
                        <div className="font-mono text-[11px] text-muted-foreground">
                          {compactType(c.sqlType)}
                        </div>
                        {c.fk && (
                          <button
                            type="button"
                            onClick={() => onSelect(c.fk!.table)}
                            className="mt-1 inline-block font-mono text-[10px] text-[#3B82F6] hover:underline"
                          >
                            → {c.fk.table}.{c.fk.column}
                          </button>
                        )}
                        {c.fk?.onDelete && (
                          <div className="mt-0.5 font-mono text-[10px] text-amber-700">
                            ON DELETE {c.fk.onDelete.toUpperCase()}
                          </div>
                        )}
                      </div>
                      <div className="flex shrink-0 flex-wrap items-center justify-end gap-0.5">
                        {flags.map((f) => (
                          <span
                            key={f.code}
                            className={cn(
                              'rounded px-1.5 py-0.5 text-[9px] font-semibold leading-none',
                              f.cls,
                            )}
                          >
                            {f.code}
                          </span>
                        ))}
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>

            {fkSortantes.length > 0 && (
              <>
                <h3 className="mb-1.5 mt-4 border-b pb-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Relations sortantes
                </h3>
                <ul className="space-y-0.5 text-xs">
                  {fkSortantes.map((c) => (
                    <li
                      key={c.name}
                      className="border-b border-gray-100 py-1.5 font-mono"
                    >
                      <span className="mr-2 inline-block min-w-[34px] text-center font-bold text-[#C0392B]">
                        N:1
                      </span>
                      <button
                        type="button"
                        className="text-[#3B82F6] underline-offset-2 hover:text-[#C0392B] hover:underline"
                        onClick={() => c.fk && onSelect(c.fk.table)}
                      >
                        {c.fk?.table}
                      </button>
                      <span className="ml-2 font-sans text-[11px] text-muted-foreground">
                        — via {c.name}
                      </span>
                    </li>
                  ))}
                </ul>
              </>
            )}

            {fkEntrantes.length > 0 && (
              <>
                <h3 className="mb-1.5 mt-4 border-b pb-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Relations entrantes
                </h3>
                <ul className="space-y-0.5 text-xs">
                  {fkEntrantes.map((r, idx) => (
                    <li
                      key={`${r.sourceTable}-${r.sourceColumn}-${idx}`}
                      className="border-b border-gray-100 py-1.5 font-mono"
                    >
                      <button
                        type="button"
                        className="text-[#3B82F6] underline-offset-2 hover:text-[#C0392B] hover:underline"
                        onClick={() => onSelect(r.sourceTable)}
                      >
                        {r.sourceTable}
                      </button>
                      <span className="mx-2 inline-block min-w-[34px] text-center font-bold text-[#C0392B]">
                        {r.cardinality}
                      </span>
                      <span className="font-sans text-[11px] text-muted-foreground">
                        → {table.name}.{r.targetColumn}
                      </span>
                    </li>
                  ))}
                </ul>
              </>
            )}

            {table.isJunction && (
              <p className="mt-4 rounded bg-violet-50 px-2 py-1.5 text-[11px] text-violet-700">
                Table d&apos;association (clé primaire composite de FK) — modélise une relation N:N.
              </p>
            )}
          </div>
        </>
      )}
    </aside>
  );
}
