'use client';

import { Database, KeyRound, Layers, RotateCcwIcon, SearchIcon, Zap } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { DataSet } from 'vis-data';
import { Network, type Edge as VisEdge, type Node as VisNode, type Options } from 'vis-network';
import 'vis-network/styles/vis-network.css';

import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type { McdColumn, McdSchema } from '@/lib/admin/mcd-introspect';
import { moduleStyle } from '@/lib/admin/mcd-modules';
import { cn } from '@/lib/utils';

import { DetailPanel } from './detail-panel';

const FILTRE_TOUS = '__tous__';
type ViewMode = 'mcd' | 'mld' | 'physique';

function compactType(sqlType: string): string {
  return sqlType
    .replace(/^timestamp with time zone$/, 'timestamptz')
    .replace(/^timestamp without time zone$/, 'timestamp')
    .replace(/^character varying/, 'varchar')
    .replace(/\s+/g, ' ')
    .replace(/numeric\((\d+),\s*(\d+)\)/, 'num($1,$2)');
}

function iconForColumn(c: McdColumn): string {
  if (c.primary) return '🔑';
  if (c.fk) return '🔗';
  if (c.unique) return '✓';
  if (c.indexed) return '◆';
  return '•';
}

function buildNodeLabel(tableName: string, columns: McdColumn[], mode: ViewMode): string {
  const lines = [tableName];
  if (mode === 'mcd') {
    const pks = columns.filter((c) => c.primary).map((c) => c.name);
    if (pks.length) lines.push(`🔑 ${pks.join(', ')}`);
    return lines.join('\n');
  }
  if (mode === 'mld') {
    const visibles = columns.filter((c) => c.primary || c.fk || c.unique);
    const shown = visibles.slice(0, 8);
    for (const c of shown) lines.push(`${iconForColumn(c)} ${c.name}`);
    if (visibles.length > 8) lines.push(`… +${visibles.length - 8}`);
    return lines.join('\n');
  }
  // physique : toutes les colonnes avec type
  const shown = columns.slice(0, 12);
  for (const c of shown) {
    const t = compactType(c.sqlType);
    lines.push(`${iconForColumn(c)} ${c.name}  ${t}${c.notNull ? '*' : ''}`);
  }
  if (columns.length > 12) lines.push(`… +${columns.length - 12} colonnes`);
  return lines.join('\n');
}

/** Crow's foot natif vis-network : bar = 1, crow = many. */
function arrowsForCardinality(card: '1:1' | 'N:1'): VisEdge['arrows'] {
  if (card === '1:1')
    return { to: { enabled: true, type: 'bar' }, from: { enabled: true, type: 'bar' } };
  // source(FK) → target(PK) : many côté source, 1 côté target
  return { to: { enabled: true, type: 'bar' }, from: { enabled: true, type: 'crow' } };
}

function buildVisGraph(
  schema: McdSchema,
  mode: ViewMode,
  filtreModule: string,
  termeRecherche: string,
): { nodes: VisNode[]; edges: VisEdge[] } {
  const filtreActif = filtreModule !== FILTRE_TOUS;

  // Tables du module filtré (ou toutes si aucun filtre).
  const moduleSet = new Set(
    (filtreActif ? schema.tables.filter((t) => t.moduleId === filtreModule) : schema.tables).map(
      (t) => t.name,
    ),
  );

  // En mode filtré, on ajoute les tables « voisines » (à un saut de FK) en
  // contexte grisé, afin de montrer les relations entrantes/sortantes du module.
  // Sans ça, un module transverse (ex. Planning) paraît isolé : ses FK pointent
  // vers des tables d'autres modules, masquées par le filtre.
  const contexteSet = new Set<string>();
  if (filtreActif) {
    for (const r of schema.relations) {
      const sourceDansModule = moduleSet.has(r.source);
      const targetDansModule = moduleSet.has(r.target);
      if (sourceDansModule && !targetDansModule) contexteSet.add(r.target);
      else if (targetDansModule && !sourceDansModule) contexteSet.add(r.source);
    }
  }

  const setVisibles = new Set([...moduleSet, ...contexteSet]);
  const tablesVisibles = schema.tables.filter((t) => setVisibles.has(t.name));

  const terme = termeRecherche.trim().toLowerCase();
  const matchRecherche = (n: string) => terme.length > 0 && n.toLowerCase().includes(terme);

  const nodes: VisNode[] = tablesVisibles.map((t) => {
    const mod = moduleStyle(t.moduleId);
    const matched = matchRecherche(t.name);
    const dimmed = terme.length > 0 && !matched;
    // Table d'un autre module affichée en contexte (voisine du module filtré).
    const contexte = filtreActif && !moduleSet.has(t.name);
    const fontSize = mode === 'physique' ? 11 : mode === 'mld' ? 12 : 13;

    return {
      id: t.name,
      label: buildNodeLabel(t.name, t.columns, mode),
      title: `${t.name} — ${mod.label}${t.isJunction ? ' (association N:N)' : ''}${
        contexte ? ' · table liée (hors module filtré)' : ''
      }`,
      shape: 'box',
      color: {
        background: matched ? '#FEF3C7' : mod.bg,
        border: matched ? '#F59E0B' : mod.color,
        highlight: { background: mod.bg, border: '#111827' },
      },
      borderWidth: matched ? 3 : contexte ? 1 : 2,
      borderWidthSelected: 3,
      shapeProperties: { borderDashes: contexte ? [4, 4] : false },
      font: {
        face: 'Consolas, Menlo, monospace',
        size: fontSize,
        color: '#1F2937',
        multi: false,
        align: 'left',
      },
      margin: { top: 10, right: 12, bottom: 10, left: 12 },
      shadow: { enabled: true, color: 'rgba(0,0,0,0.08)', size: 5, x: 2, y: 2 },
      opacity: dimmed ? 0.3 : contexte ? 0.5 : 1,
    } as VisNode;
  });

  const edges: VisEdge[] = schema.relations
    .filter((r) => {
      if (!setVisibles.has(r.source) || !setVisibles.has(r.target)) return false;
      // En mode filtré : uniquement les arêtes incidentes au module
      // (module↔module ou module↔contexte), pas les liens entre deux voisins.
      if (!filtreActif) return true;
      return moduleSet.has(r.source) || moduleSet.has(r.target);
    })
    .map((r, i) => {
      const card = r.cardinality;
      const matched = terme.length > 0 && (matchRecherche(r.source) || matchRecherche(r.target));
      const dimmed = terme.length > 0 && !matched;

      return {
        id: `e_${i}_${r.id}`,
        from: r.source,
        to: r.target,
        label: card,
        arrows: arrowsForCardinality(card),
        color: {
          color: dimmed ? '#E5E7EB' : '#94A3B8',
          highlight: '#C0392B',
          hover: '#C0392B',
        },
        font: {
          size: 10,
          color: '#666',
          background: 'rgba(255,255,255,0.85)',
          strokeWidth: 0,
          face: 'Consolas, Menlo, monospace',
        },
        smooth: { enabled: true, type: 'continuous', roundness: 0.4 },
        width: matched ? 2 : 1.25,
        title: r.onDelete ? `ON DELETE ${r.onDelete.toUpperCase()}` : undefined,
      } as VisEdge;
    });

  return { nodes, edges };
}

function McdViewerInner({ schema }: { schema: McdSchema }) {
  const [mode, setMode] = useState<ViewMode>('mcd');
  const [filtreModule, setFiltreModule] = useState<string>(FILTRE_TOUS);
  const [recherche, setRecherche] = useState('');
  const [selected, setSelected] = useState<string | null>(null);
  const [physicsOn, setPhysicsOn] = useState(true);

  const containerRef = useRef<HTMLDivElement>(null);
  const networkRef = useRef<Network | null>(null);
  const nodesDsRef = useRef<DataSet<VisNode> | null>(null);
  const edgesDsRef = useRef<DataSet<VisEdge> | null>(null);

  // Initial graph data (mémorisé pour mount)
  const initialGraph = useMemo(() => buildVisGraph(schema, 'mcd', FILTRE_TOUS, ''), [schema]);

  // Initialisation Network (une fois)
  useEffect(() => {
    if (!containerRef.current) return;

    const nodes = new DataSet<VisNode>(initialGraph.nodes);
    const edges = new DataSet<VisEdge>(initialGraph.edges);
    nodesDsRef.current = nodes;
    edgesDsRef.current = edges;

    const options: Options = {
      nodes: { shape: 'box', borderWidth: 2 },
      edges: { smooth: { enabled: true, type: 'continuous', roundness: 0.4 } },
      interaction: {
        hover: true,
        navigationButtons: false,
        keyboard: false,
        tooltipDelay: 250,
        multiselect: false,
      },
      physics: {
        enabled: true,
        solver: 'forceAtlas2Based',
        forceAtlas2Based: {
          gravitationalConstant: -80,
          centralGravity: 0.005,
          springLength: 180,
          springConstant: 0.08,
          damping: 0.6,
        },
        stabilization: { iterations: 250 },
      },
    };

    const network = new Network(containerRef.current, { nodes, edges }, options);
    networkRef.current = network;

    network.on('click', (params: { nodes: string[] }) => {
      if (params.nodes.length > 0) setSelected(params.nodes[0]!);
      else setSelected(null);
    });

    network.on('doubleClick', (params: { nodes: string[] }) => {
      if (params.nodes.length > 0) {
        const id = params.nodes[0]!;
        network.focus(id, {
          scale: 1.2,
          animation: { duration: 400, easingFunction: 'easeInOutQuad' },
        });
        setSelected(id);
      }
    });

    return () => {
      network.destroy();
      networkRef.current = null;
      nodesDsRef.current = null;
      edgesDsRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Update du dataset lorsque mode/filtre/recherche change
  useEffect(() => {
    if (!nodesDsRef.current || !edgesDsRef.current || !networkRef.current) return;
    const { nodes, edges } = buildVisGraph(schema, mode, filtreModule, recherche);
    nodesDsRef.current.clear();
    edgesDsRef.current.clear();
    nodesDsRef.current.add(nodes);
    edgesDsRef.current.add(edges);
    // Re-fit après changement
    setTimeout(() => {
      networkRef.current?.fit({ animation: { duration: 400, easingFunction: 'easeInOutQuad' } });
    }, 80);
  }, [schema, mode, filtreModule, recherche]);

  // Toggle physique
  useEffect(() => {
    networkRef.current?.setOptions({ physics: { enabled: physicsOn } });
  }, [physicsOn]);

  const recentrer = useCallback(() => {
    networkRef.current?.fit({ animation: { duration: 500, easingFunction: 'easeInOutQuad' } });
  }, []);

  // Recherche : si 1 match exact → focus + ouverture détail
  useEffect(() => {
    const q = recherche.trim().toLowerCase();
    if (!q || !networkRef.current) return;
    const matches = schema.tables.filter((t) => t.name.toLowerCase().includes(q));
    if (matches.length === 1) {
      const id = matches[0]!.name;
      networkRef.current.focus(id, {
        scale: 1.2,
        animation: { duration: 400, easingFunction: 'easeInOutQuad' },
      });
      setSelected(id);
    }
  }, [recherche, schema]);

  // Navigation depuis le panneau de détail
  const navigateTo = useCallback(
    (tableName: string) => {
      const target = schema.tables.find((t) => t.name === tableName);
      if (!target) return;
      // Si le module ne correspond pas au filtre courant : bascule sur "Tous"
      if (filtreModule !== FILTRE_TOUS && target.moduleId !== filtreModule) {
        setFiltreModule(FILTRE_TOUS);
        setTimeout(() => {
          networkRef.current?.focus(tableName, {
            scale: 1.2,
            animation: { duration: 400, easingFunction: 'easeInOutQuad' },
          });
          setSelected(tableName);
        }, 200);
      } else {
        networkRef.current?.focus(tableName, {
          scale: 1.2,
          animation: { duration: 400, easingFunction: 'easeInOutQuad' },
        });
        setSelected(tableName);
      }
    },
    [schema, filtreModule],
  );

  // Échap : ferme le panneau de détail, sinon reset recherche/filtre
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        if (selected) setSelected(null);
        else if (recherche) setRecherche('');
        else if (filtreModule !== FILTRE_TOUS) setFiltreModule(FILTRE_TOUS);
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [selected, recherche, filtreModule]);

  const tableSelectionnee = selected
    ? (schema.tables.find((t) => t.name === selected) ?? null)
    : null;

  return (
    <div
      className="relative flex flex-col overflow-hidden rounded-lg border bg-card"
      style={{ height: 'calc(100vh - 220px)', minHeight: 560 }}
    >
      {/* Header rouge style COMPTE.R */}
      <div className="flex flex-wrap items-center gap-2 border-b-4 border-[#C0392B] bg-white px-3 py-2">
        <div className="mr-auto">
          <div className="font-semibold text-[#C0392B]">MCD / MLD interactif</div>
          <div className="text-[11px] text-muted-foreground">
            Clic sur une entité · Glisser pour déplacer · Molette pour zoomer
          </div>
        </div>

        <div className="inline-flex overflow-hidden rounded-md border">
          <ModeBouton
            actif={mode === 'mcd'}
            onClick={() => setMode('mcd')}
            icon={<Layers className="size-3.5" />}
          >
            MCD conceptuel
          </ModeBouton>
          <ModeBouton
            actif={mode === 'mld'}
            onClick={() => setMode('mld')}
            icon={<KeyRound className="size-3.5" />}
          >
            MLD logique
          </ModeBouton>
          <ModeBouton
            actif={mode === 'physique'}
            onClick={() => setMode('physique')}
            icon={<Database className="size-3.5" />}
          >
            Physique
          </ModeBouton>
        </div>

        <span className="text-gray-300">|</span>

        <Select value={filtreModule} onValueChange={(v) => setFiltreModule(v ?? FILTRE_TOUS)}>
          <SelectTrigger className="h-8 w-[210px] text-xs">
            <SelectValue placeholder="Tous les modules" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={FILTRE_TOUS}>Tous les modules</SelectItem>
            {schema.modules.map((m) => (
              <SelectItem key={m.id} value={m.id}>
                <span
                  className="mr-2 inline-block size-2 rounded-full align-middle"
                  style={{ background: m.color }}
                />
                {m.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <div className="relative">
          <SearchIcon className="pointer-events-none absolute left-2 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <input
            type="search"
            value={recherche}
            onChange={(e) => setRecherche(e.target.value)}
            placeholder="Rechercher une entité…"
            className="h-8 w-56 rounded-md border bg-background pl-7 pr-2 text-xs outline-none focus:ring-1 focus:ring-ring"
          />
        </div>

        <Button variant="outline" size="sm" className="h-8 gap-1.5" onClick={recentrer}>
          <RotateCcwIcon className="size-3.5" />
          Recentrer
        </Button>

        <button
          type="button"
          onClick={() => setPhysicsOn((v) => !v)}
          className={cn(
            'inline-flex h-8 items-center gap-1.5 rounded-md border px-2.5 text-xs transition-colors',
            physicsOn ? 'border-[#C0392B] bg-[#C0392B] text-white' : 'bg-background hover:bg-muted',
          )}
        >
          <Zap className="size-3.5" />
          Physique
        </button>
      </div>

      {/* Zone canvas + overlays */}
      <div className="relative min-h-0 flex-1">
        {/* Damier diagonal en fond */}
        <div
          ref={containerRef}
          className="absolute inset-0"
          style={{
            background:
              'linear-gradient(45deg, #FAFAFA 25%, transparent 25%) 0 0 / 30px 30px, linear-gradient(-45deg, #FAFAFA 25%, transparent 25%) 0 15px / 30px 30px, #fff',
          }}
        />

        {/* Légende cliquable — top left */}
        <aside className="absolute left-3 top-3 z-10 max-w-[260px] rounded-md border bg-white/95 p-3 text-[11px] shadow-md backdrop-blur">
          <div className="mb-1.5 flex items-center justify-between">
            <h4 className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              Filtrer par module
            </h4>
            {filtreModule !== FILTRE_TOUS && (
              <button
                type="button"
                onClick={() => setFiltreModule(FILTRE_TOUS)}
                className="rounded bg-[#C0392B] px-1.5 py-0.5 text-[9px] font-semibold uppercase text-white hover:opacity-90"
              >
                Tout afficher
              </button>
            )}
          </div>
          <ul className="space-y-0.5">
            <li
              className={cn(
                'flex cursor-pointer items-center gap-2 rounded px-1.5 py-1 transition-colors hover:bg-muted',
                filtreModule === FILTRE_TOUS && 'bg-muted font-medium',
              )}
              onClick={() => setFiltreModule(FILTRE_TOUS)}
            >
              <span className="inline-block size-3 rounded-full bg-slate-400" />
              Tous les modules
            </li>
            {schema.modules.map((m) => {
              const isActive = filtreModule === m.id;
              const isOther = filtreModule !== FILTRE_TOUS && !isActive;
              return (
                <li
                  key={m.id}
                  className={cn(
                    'flex cursor-pointer items-center gap-2 rounded px-1.5 py-1 transition-colors hover:bg-muted',
                    isActive && 'bg-muted font-semibold',
                    isOther && 'opacity-50',
                  )}
                  onClick={() => setFiltreModule(isActive ? FILTRE_TOUS : m.id)}
                  title="Cliquer pour filtrer ce module"
                >
                  <span
                    className="inline-block size-3 rounded-full ring-2 ring-offset-1"
                    style={{
                      background: m.color,
                      // @ts-expect-error custom CSS variable
                      '--tw-ring-color': isActive ? m.color : 'transparent',
                    }}
                  />
                  {m.label}
                </li>
              );
            })}
          </ul>
          {filtreModule !== FILTRE_TOUS && (
            <div className="mt-2 flex items-center gap-2 border-t pt-2 text-[10px] text-muted-foreground">
              <span className="inline-block size-3 shrink-0 rounded-sm border border-dashed border-slate-400 opacity-50" />
              Tables liées (autre module, contexte)
            </div>
          )}
          <div className="mt-2 border-t pt-2 text-[10px] text-muted-foreground">
            🖱️ <b>Clic</b> : détail
            <br />
            🤚 <b>Glisser</b> : déplacer
            <br />
            🔍 <b>Molette</b> : zoom
            <br />
            ⌨️ <b>Double-clic</b> : focus + détail
            <br />❌ <b>Échap</b> : fermer panneau
          </div>
        </aside>

        {/* Panneau de détail glissant */}
        <DetailPanel
          table={tableSelectionnee}
          schema={schema}
          onClose={() => setSelected(null)}
          onSelect={navigateTo}
        />
      </div>
    </div>
  );
}

function ModeBouton({
  actif,
  onClick,
  icon,
  children,
}: {
  actif: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs transition-colors',
        actif ? 'bg-[#C0392B] text-white' : 'bg-background text-foreground hover:bg-muted',
      )}
    >
      {icon}
      {children}
    </button>
  );
}

export function McdViewer({ schema }: { schema: McdSchema }) {
  return <McdViewerInner schema={schema} />;
}
