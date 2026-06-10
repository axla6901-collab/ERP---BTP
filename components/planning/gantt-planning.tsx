'use client';

import {
  CalendarRangeIcon,
  EyeIcon,
  EyeOffIcon,
  FilterIcon,
  PrinterIcon,
  Redo2Icon,
  Undo2Icon,
  XIcon,
} from 'lucide-react';
import { useEffect, useMemo, useRef, useState, useTransition } from 'react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { GanttHeader } from '@/components/planning/gantt-header';
import { cn } from '@/lib/utils';

import {
  CATS,
  HEAD_H,
  PX_PAR_JOUR,
  ROW_H,
  addDays,
  buildLayout,
  calculerKpis,
  catOf,
  computeRange,
  dnum,
  fmtFR,
  fromN,
  iso,
  type CorpsMetierCle,
  type GroupByMode,
  type Layout,
  type Range,
  type Zoom,
} from '@/lib/planning/gantt-utils';
import type {
  OuvrierAffectable,
  PlanningChantierData,
  PlanningTacheRow,
} from '@/lib/planning/planning';
import type {
  PlanningCascadeInput,
  PlanningCreationInput,
  PlanningTacheInput,
} from '@/lib/validation/planning';
import { cascadeDelta } from '@/lib/planning/cascade';

// ─────────────────────────────────────────────────────────────
// Bibliothèque BTP statique (visuel seul — drag-drop = Phase B)
// ─────────────────────────────────────────────────────────────

const LIBRARY: Array<{
  sect: string;
  items: Array<{ name: string; cat: CorpsMetierCle; dur: number; milestone?: boolean }>;
}> = [
  {
    sect: 'Terrassement',
    items: [
      { name: 'Terrassement / Fouilles', cat: 'terrassement', dur: 8 },
      { name: 'Remblais', cat: 'terrassement', dur: 10 },
    ],
  },
  {
    sect: 'Gros œuvre',
    items: [
      { name: 'Fondation', cat: 'gros_oeuvre', dur: 8 },
      { name: 'Voiles', cat: 'gros_oeuvre', dur: 10 },
      { name: 'Dallage', cat: 'gros_oeuvre', dur: 15 },
      { name: 'Plancher haut', cat: 'gros_oeuvre', dur: 10 },
      { name: 'Souche', cat: 'gros_oeuvre', dur: 5 },
    ],
  },
  {
    sect: 'Maçonnerie',
    items: [
      { name: 'Agglos', cat: 'maconnerie', dur: 10 },
      { name: 'Enduits', cat: 'maconnerie', dur: 8 },
    ],
  },
  {
    sect: 'Structure',
    items: [
      { name: 'Réseaux', cat: 'structure', dur: 10 },
      { name: 'Poutres', cat: 'structure', dur: 10 },
    ],
  },
  {
    sect: 'Finitions',
    items: [
      { name: 'Finitions', cat: 'finitions', dur: 12 },
      { name: 'Sécurité', cat: 'securite', dur: 20 },
    ],
  },
  {
    sect: 'Livraisons (jalon)',
    items: [
      { name: 'Livraison Aciers', cat: 'livraison', dur: 1, milestone: true },
      { name: 'Livraison Prédalle', cat: 'livraison', dur: 1, milestone: true },
      { name: 'Livraison Escalier', cat: 'livraison', dur: 1, milestone: true },
    ],
  },
];

// ─────────────────────────────────────────────────────────────
// Server-action handlers (forwarded from server page)
// ─────────────────────────────────────────────────────────────

export type GanttHandlers = {
  enregistrerTache: (input: PlanningTacheInput) => Promise<{ ok: true } | { ok: false; error: string }>;
  affecterOuvrier: (
    tacheId: string,
    utilisateurId: string,
    heuresPrevues: number,
  ) => Promise<{ ok: true } | { ok: false; error: string }>;
  majEquipe: (
    id: string,
    heuresPrevues: number,
    heuresFaites: number,
  ) => Promise<{ ok: true } | { ok: false; error: string }>;
  retirerOuvrier: (id: string) => Promise<{ ok: true } | { ok: false; error: string }>;
  creerTache: (input: PlanningCreationInput) => Promise<
    { ok: true; id: string } | { ok: false; error: string }
  >;
  supprimerTache: (id: string) => Promise<{ ok: true } | { ok: false; error: string }>;
  restaurerTache: (id: string) => Promise<{ ok: true } | { ok: false; error: string }>;
  appliquerCascade: (
    changes: PlanningCascadeInput['changes'],
  ) => Promise<{ ok: true } | { ok: false; error: string }>;
  dupliquerNiveau: (
    chantierId: string,
    niveau: string,
  ) => Promise<
    | { ok: true; niveauCopie: string; tacheIds: string[] }
    | { ok: false; error: string }
  >;
};

type Props = {
  donnees: PlanningChantierData;
  ouvriers: OuvrierAffectable[];
  handlers: GanttHandlers;
};

// ─────────────────────────────────────────────────────────────
// Historique undo/redo : opérations atomiques, capturant l'état AVANT mutation.
// Étendu en Phase B3 aux create/delete/duplicate (réversibles via les server
// actions `supprimerTache` ↔ `restaurerTache` côté serveur).
// ─────────────────────────────────────────────────────────────
type HistoryOpDetails =
  | {
      kind: 'cascade';
      changes: Array<{
        id: string;
        oldStart: string;
        oldEnd: string;
        newStart: string;
        newEnd: string;
      }>;
    }
  | { kind: 'avancement'; tacheId: string; oldPct: number; newPct: number }
  | { kind: 'link'; tacheId: string; oldPredId: string | null; newPredId: string | null }
  | { kind: 'create'; tacheId: string }
  | { kind: 'delete'; tacheId: string }
  | { kind: 'duplicate'; tacheIds: string[] };

type HistoryOp = HistoryOpDetails & { label: string; at: number };

// ═════════════════════════════════════════════════════════════
// Composant principal
// ═════════════════════════════════════════════════════════════

export function GanttPlanning({ donnees, ouvriers, handlers }: Props) {
  const { chantier, taches } = donnees;

  // Zoom par défaut intelligent : on choisit la maille selon la durée totale
  // du projet (chantier ∪ tâches). Initializer (mount uniquement) ; l'utilisateur
  // peut ensuite changer librement via la bascule J/S/M.
  const [zoom, setZoom] = useState<Zoom>(() => {
    const datees = [
      ...taches.filter((t) => t.dateDebutPrevue && t.dateFinPrevue),
      ...(chantier.dateDebutPrevue && chantier.dateFinPrevue
        ? [
            {
              dateDebutPrevue: chantier.dateDebutPrevue,
              dateFinPrevue: chantier.dateFinPrevue,
            },
          ]
        : []),
    ];
    if (datees.length === 0) return 'semaine';
    let mn = Infinity;
    let mx = -Infinity;
    for (const t of datees) {
      mn = Math.min(mn, dnum(t.dateDebutPrevue!));
      mx = Math.max(mx, dnum(t.dateFinPrevue!));
    }
    const span = mx - mn + 1;
    if (span <= 35) return 'jour'; // ≤ 5 semaines
    if (span <= 180) return 'semaine'; // ≤ 6 mois
    return 'mois';
  });
  const [groupBy, setGroupBy] = useState<GroupByMode>('niveau');
  const [collapsed, setCollapsed] = useState<Set<string>>(() => new Set());
  const [hiddenCats, setHiddenCats] = useState<Set<string>>(() => new Set());
  const [hideDone, setHideDone] = useState(false);
  const [libOpen, setLibOpen] = useState(false); // ◀ bibliothèque REPLIÉE par défaut
  const [filterOpen, setFilterOpen] = useState(false);
  const [histOpen, setHistOpen] = useState(false);
  const [tacheSelectionneeId, setTacheSelectionneeId] = useState<string | null>(null);
  const [plein, setPlein] = useState(false); // mode plein écran (masque actions + KPIs)
  const [undoStack, setUndoStack] = useState<HistoryOp[]>([]);
  const [redoStack, setRedoStack] = useState<HistoryOp[]>([]);
  const [, startMainTransition] = useTransition();
  const canvasRef = useRef<HTMLDivElement>(null);

  function pushOp(details: HistoryOpDetails, label: string) {
    // Limite la pile à 30 opérations pour borner la mémoire ; toute nouvelle
    // action efface la pile "redo" (branche écrasée, comme un éditeur classique).
    const op = { ...details, label, at: Date.now() } as HistoryOp;
    setUndoStack((s) => [...s.slice(-29), op]);
    setRedoStack([]);
  }

  /** Applique une opération dans un sens ou l'autre (undo = backward, redo = forward). */
  async function applyHistoryOp(
    op: HistoryOp,
    dir: 'forward' | 'backward',
  ): Promise<{ ok: boolean }> {
    if (op.kind === 'cascade') {
      const changes = op.changes.map((c) => ({
        id: c.id,
        dateDebutPrevue: dir === 'forward' ? c.newStart : c.oldStart,
        dateFinPrevue: dir === 'forward' ? c.newEnd : c.oldEnd,
      }));
      const r = await handlers.appliquerCascade(changes);
      return { ok: r.ok };
    }
    if (op.kind === 'avancement') {
      const t = taches.find((x) => x.id === op.tacheId);
      if (!t) return { ok: false };
      const pct = dir === 'forward' ? op.newPct : op.oldPct;
      const r = await handlers.enregistrerTache({
        id: t.id,
        libelle: t.libelle,
        niveau: t.niveau,
        corpsMetier: t.corpsMetier,
        dateDebutPrevue: t.dateDebutPrevue,
        dateFinPrevue: t.dateFinPrevue,
        avancementPourcent: pct,
        heuresPlanifiees: t.heuresPlanifiees,
        estJalon: t.estJalon,
        predecesseurId: t.predecesseurId,
        notes: t.notes,
      });
      return { ok: r.ok };
    }
    if (op.kind === 'link') {
      const t = taches.find((x) => x.id === op.tacheId);
      if (!t) return { ok: false };
      const predId = dir === 'forward' ? op.newPredId : op.oldPredId;
      const r = await handlers.enregistrerTache({
        id: t.id,
        libelle: t.libelle,
        niveau: t.niveau,
        corpsMetier: t.corpsMetier,
        dateDebutPrevue: t.dateDebutPrevue,
        dateFinPrevue: t.dateFinPrevue,
        avancementPourcent: t.avancementPourcent,
        heuresPlanifiees: t.heuresPlanifiees,
        estJalon: t.estJalon,
        predecesseurId: predId,
        notes: t.notes,
      });
      return { ok: r.ok };
    }
    if (op.kind === 'create') {
      // forward = re-création (= restaure le soft-delete) ; backward = supprime.
      const r =
        dir === 'forward'
          ? await handlers.restaurerTache(op.tacheId)
          : await handlers.supprimerTache(op.tacheId);
      return { ok: r.ok };
    }
    if (op.kind === 'delete') {
      // forward = supprime ; backward = restaure.
      const r =
        dir === 'forward'
          ? await handlers.supprimerTache(op.tacheId)
          : await handlers.restaurerTache(op.tacheId);
      return { ok: r.ok };
    }
    // op.kind === 'duplicate' : on opère sur la liste de tâches clonées.
    let ok = true;
    for (const id of op.tacheIds) {
      const r =
        dir === 'forward'
          ? await handlers.restaurerTache(id)
          : await handlers.supprimerTache(id);
      if (!r.ok) ok = false;
    }
    return { ok };
  }

  function undo() {
    const op = undoStack[undoStack.length - 1];
    if (!op) return;
    startMainTransition(async () => {
      const res = await applyHistoryOp(op, 'backward');
      if (!res.ok) {
        toast.error('Annulation impossible.');
        return;
      }
      setUndoStack((s) => s.slice(0, -1));
      setRedoStack((s) => [...s, op]);
    });
  }

  function redo() {
    const op = redoStack[redoStack.length - 1];
    if (!op) return;
    startMainTransition(async () => {
      const res = await applyHistoryOp(op, 'forward');
      if (!res.ok) {
        toast.error('Rétablissement impossible.');
        return;
      }
      setRedoStack((s) => s.slice(0, -1));
      setUndoStack((s) => [...s, op]);
    });
  }

  const today = iso(new Date());

  // Largeur du conteneur timeline, mesurée dynamiquement (cf. ResizeObserver
  // ci-dessous) pour étendre la plage jusqu'à remplir la place disponible
  // (sinon, projet court = bandeau riquiqui + océan de blanc à droite).
  const [timelineWidth, setTimelineWidth] = useState(0);

  const range = useMemo<Range>(() => {
    // La timeline doit AU MINIMUM couvrir la période planifiée du chantier
    // (`date_debut_prevue → date_fin_prevue`). Les tâches qui dépassent
    // l'étendent encore. On injecte donc la fenêtre du chantier comme une
    // "tâche fictive" dans le calcul min/max — `projectStart`/`projectEnd`
    // refléteront alors le vrai cadre du chantier, pas juste les tâches.
    const datesPourRange: Array<{
      dateDebutPrevue: string | null;
      dateFinPrevue: string | null;
    }> = taches.map((t) => ({
      dateDebutPrevue: t.dateDebutPrevue,
      dateFinPrevue: t.dateFinPrevue,
    }));
    if (chantier.dateDebutPrevue && chantier.dateFinPrevue) {
      datesPourRange.push({
        dateDebutPrevue: chantier.dateDebutPrevue,
        dateFinPrevue: chantier.dateFinPrevue,
      });
    }
    const r = computeRange(datesPourRange);

    // Padding "non limité" : 30 j de passé visible + au moins 3× la largeur
    // du conteneur, plancher 90 j pour les projets sans dates.
    const px = PX_PAR_JOUR[zoom];
    const padLeft = 27;
    const minByContainer = timelineWidth > 0 ? Math.ceil(timelineWidth / px) + 1 : 0;
    const minTotalDays = Math.max(minByContainer * 3, 90);
    const startNew = r.start - padLeft;
    const totalAvecPadLeft = r.totalDays + padLeft;
    const totalDays = Math.max(totalAvecPadLeft, minTotalDays);
    const endNew = startNew + totalDays - 1;
    return { ...r, start: startNew, end: endNew, totalDays };
  }, [taches, zoom, timelineWidth, chantier.dateDebutPrevue, chantier.dateFinPrevue]);
  const layout = useMemo<Layout>(
    () => buildLayout(taches, { groupBy, collapsed, hiddenCats, hideDone, today }),
    [taches, groupBy, collapsed, hiddenCats, hideDone, today],
  );
  const kpis = useMemo(() => calculerKpis(taches, today, range), [taches, today, range]);

  const W = range.totalDays * PX_PAR_JOUR[zoom];

  const timelineRef = useRef<HTMLDivElement>(null);
  const labelsBodyRef = useRef<HTMLDivElement>(null);
  // ResizeObserver attaché ci-dessous (après la déclaration de l'état) — la
  // largeur du conteneur timeline est utilisée dans le memo `range` ci-dessus.
  useEffect(() => {
    const el = timelineRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setTimelineWidth(el.clientWidth));
    ro.observe(el);
    setTimelineWidth(el.clientWidth);
    return () => ro.disconnect();
  }, []);

  // Synchro scroll vertical : timeline → labels (translateY)
  useEffect(() => {
    const ts = timelineRef.current;
    if (!ts) return;
    const onScroll = () => {
      if (labelsBodyRef.current) {
        labelsBodyRef.current.style.transform = `translateY(${-ts.scrollTop}px)`;
      }
    };
    ts.addEventListener('scroll', onScroll);
    return () => ts.removeEventListener('scroll', onScroll);
  }, []);

  // Scroll initial : cadre sur la première tâche visible
  useEffect(() => {
    const ts = timelineRef.current;
    if (!ts) return;
    const firstStart = taches
      .filter((t) => t.dateDebutPrevue)
      .reduce<number>((a, t) => Math.min(a, dnum(t.dateDebutPrevue!)), Infinity);
    if (firstStart === Infinity) return;
    const x = (firstStart - range.start) * PX_PAR_JOUR[zoom] - 40;
    ts.scrollLeft = Math.max(0, x);
    // une seule fois au montage
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function toggleCollapsed(key: string) {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  function toggleHiddenCat(cat: string) {
    setHiddenCats((prev) => {
      const next = new Set(prev);
      if (next.has(cat)) next.delete(cat);
      else next.add(cat);
      return next;
    });
  }

  function scrollAujourdhui() {
    const ts = timelineRef.current;
    if (!ts) return;
    const x = (dnum(today) - range.start) * PX_PAR_JOUR[zoom] - ts.clientWidth / 2;
    ts.scrollTo({ left: Math.max(0, x), behavior: 'smooth' });
  }

  // ── Commits côté serveur (date moves, cascade, link, création, suppression) ──

  /**
   * Commit d'un déplacement de barre (move/resize/jalon) + cascade auto sur tous
   * les successeurs en aval. Un seul appel batch pour rester atomique côté DB.
   */
  function commitDeplacement(
    t: PlanningTacheRow,
    newStart: string,
    newEnd: string,
  ) {
    if (!t.dateDebutPrevue || !t.dateFinPrevue) return;
    if (newStart === t.dateDebutPrevue && newEnd === t.dateFinPrevue) return;
    // Snapshot des dates AVANT pour la pile undo (capturé sync depuis l'état React).
    const oldDates = new Map<string, { start: string; end: string }>();
    for (const tc of taches) {
      if (tc.dateDebutPrevue && tc.dateFinPrevue) {
        oldDates.set(tc.id, { start: tc.dateDebutPrevue, end: tc.dateFinPrevue });
      }
    }
    const deltaJours = dnum(newEnd) - dnum(t.dateFinPrevue);
    const cascade = cascadeDelta(taches, t.id, deltaJours);
    const allChanges = [
      { id: t.id, dateDebutPrevue: newStart, dateFinPrevue: newEnd },
      ...cascade,
    ];
    const opChanges = allChanges.map((c) => {
      const old = oldDates.get(c.id);
      return {
        id: c.id,
        oldStart: old?.start ?? c.dateDebutPrevue,
        oldEnd: old?.end ?? c.dateFinPrevue,
        newStart: c.dateDebutPrevue,
        newEnd: c.dateFinPrevue,
      };
    });
    startMainTransition(async () => {
      const res = await handlers.appliquerCascade(allChanges);
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      pushOp(
        { kind: 'cascade', changes: opChanges },
        `Déplacement de « ${t.libelle} »${opChanges.length > 1 ? ` (+${opChanges.length - 1} en cascade)` : ''}`,
      );
    });
  }

  /** Commit du % d'avancement (drag sur le bas de barre). */
  function commitAvancement(t: PlanningTacheRow, pct: number) {
    if (pct === t.avancementPourcent) return;
    const oldPct = t.avancementPourcent ?? 0;
    startMainTransition(async () => {
      const res = await handlers.enregistrerTache({
        id: t.id,
        libelle: t.libelle,
        niveau: t.niveau,
        corpsMetier: t.corpsMetier,
        dateDebutPrevue: t.dateDebutPrevue,
        dateFinPrevue: t.dateFinPrevue,
        avancementPourcent: pct,
        heuresPlanifiees: t.heuresPlanifiees,
        estJalon: t.estJalon,
        predecesseurId: t.predecesseurId,
        notes: t.notes,
      });
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      pushOp(
        { kind: 'avancement', tacheId: t.id, oldPct, newPct: pct },
        `Avancement « ${t.libelle} » → ${pct} %`,
      );
    });
  }

  /** Commit d'un enchaînement (drag-link source → cible). Évite les cycles. */
  function commitLink(srcId: string, tgtId: string) {
    if (srcId === tgtId) return;
    const tgt = taches.find((x) => x.id === tgtId);
    if (!tgt) return;
    const oldPredId = tgt.predecesseurId ?? null;
    startMainTransition(async () => {
      const res = await handlers.enregistrerTache({
        id: tgt.id,
        libelle: tgt.libelle,
        niveau: tgt.niveau,
        corpsMetier: tgt.corpsMetier,
        dateDebutPrevue: tgt.dateDebutPrevue,
        dateFinPrevue: tgt.dateFinPrevue,
        avancementPourcent: tgt.avancementPourcent,
        heuresPlanifiees: tgt.heuresPlanifiees,
        estJalon: tgt.estJalon,
        predecesseurId: srcId,
        notes: tgt.notes,
      });
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      const src = taches.find((x) => x.id === srcId);
      pushOp(
        { kind: 'link', tacheId: tgt.id, oldPredId, newPredId: srcId },
        `Enchaînement « ${src?.libelle ?? ''} » → « ${tgt.libelle} »`,
      );
    });
  }

  /** Création d'une tâche depuis le bouton « + Tâche » ou le drop bibliothèque. */
  function creerTache(opts: {
    libelle?: string;
    niveau?: string | null;
    corpsMetier?: string | null;
    dateDebutPrevue: string;
    dureeJours: number;
    estJalon?: boolean;
  }) {
    const fin = opts.estJalon ? opts.dateDebutPrevue : addDays(opts.dateDebutPrevue, Math.max(0, opts.dureeJours - 1));
    startMainTransition(async () => {
      const res = await handlers.creerTache({
        chantierId: chantier.id,
        libelle: opts.libelle ?? 'Nouvelle tâche',
        niveau: opts.niveau ?? null,
        corpsMetier: opts.corpsMetier ?? null,
        dateDebutPrevue: opts.dateDebutPrevue,
        dateFinPrevue: fin,
        heuresPlanifiees: 0,
        estJalon: opts.estJalon ?? false,
      });
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success('Tâche créée');
      setTacheSelectionneeId(res.id);
      pushOp({ kind: 'create', tacheId: res.id }, `Création de « ${opts.libelle ?? 'Nouvelle tâche'} »`);
    });
  }

  /** Suppression depuis le drawer : commit + push 'delete' op pour permettre l'undo. */
  function commitSuppression(t: PlanningTacheRow) {
    startMainTransition(async () => {
      const res = await handlers.supprimerTache(t.id);
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success('Tâche supprimée');
      setTacheSelectionneeId(null);
      pushOp({ kind: 'delete', tacheId: t.id }, `Suppression de « ${t.libelle} »`);
    });
  }

  /** Duplique tous les tâches d'un niveau (cf. server action). */
  function dupliquerNiveau(niveau: string) {
    startMainTransition(async () => {
      const res = await handlers.dupliquerNiveau(chantier.id, niveau);
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success(`Étage dupliqué → « ${res.niveauCopie} »`);
      pushOp(
        { kind: 'duplicate', tacheIds: res.tacheIds },
        `Duplication de l'étage « ${niveau} » (${res.tacheIds.length} tâche${res.tacheIds.length > 1 ? 's' : ''})`,
      );
    });
  }

  /** Saute à un index donné dans l'historique (undo ou redo en cascade). */
  function jumpTo(targetIdx: number) {
    const current = undoStack.length;
    if (targetIdx === current) return;
    startMainTransition(async () => {
      const newUndo = [...undoStack];
      const newRedo = [...redoStack];
      if (targetIdx < current) {
        // Plus d'opérations vers le passé : undo (current - targetIdx) fois.
        for (let i = 0; i < current - targetIdx; i++) {
          const op = newUndo.pop();
          if (!op) break;
          const r = await applyHistoryOp(op, 'backward');
          if (!r.ok) {
            toast.error('Saut d’historique interrompu.');
            break;
          }
          newRedo.push(op);
        }
      } else {
        for (let i = 0; i < targetIdx - current; i++) {
          const op = newRedo.pop();
          if (!op) break;
          const r = await applyHistoryOp(op, 'forward');
          if (!r.ok) {
            toast.error('Saut d’historique interrompu.');
            break;
          }
          newUndo.push(op);
        }
      }
      setUndoStack(newUndo);
      setRedoStack(newRedo);
    });
  }

  // ── Drag bars (move / resize / progress / link) — délégué sur le canvas ──
  // Détection : `data-tache-id` sur le conteneur barre + `data-handle` sur les
  // zones intérieures (left/right/progress/link/jalon). Body sans handle = move.
  function onCanvasMouseDown(e: React.MouseEvent) {
    if (e.button !== 0) return;
    const target = e.target as HTMLElement;
    const barEl = target.closest('[data-tache-id]') as HTMLElement | null;
    if (!barEl) {
      // Pas sur une barre → tracer-pour-créer (mode dessin).
      startDrawToCreate(e);
      return;
    }
    const t = taches.find((x) => x.id === barEl.dataset.tacheId);
    if (!t || !t.dateDebutPrevue || !t.dateFinPrevue) return;
    const handle = (target as HTMLElement).dataset.handle ?? 'move';

    // Link mode : drag d'une poignée vers une autre barre.
    if (handle === 'link') {
      startDragLink(t, barEl, e);
      return;
    }
    // Progress mode : drag sur le bas de la barre.
    if (handle === 'progress') {
      startDragProgress(t, barEl, e);
      return;
    }
    // Move/resize : drag-move par défaut, resize si handle left/right.
    startDragDeplacement(t, barEl, handle, e);
  }

  /**
   * Trace une barre sur une zone vide (mousedown puis glisser horizontalement).
   * Sur release : crée une tâche du début au point de relâchement, niveau/cat
   * déduits de la ligne survolée (mode 'niveau' → niveau du rang ; mode 'metier'
   * → corpsMetier). Trop court (<6 px) : ignoré.
   */
  function startDrawToCreate(e: React.MouseEvent) {
    e.preventDefault();
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const px = PX_PAR_JOUR[zoom];
    const x0 = e.clientX - rect.left;
    const y0 = e.clientY - rect.top;

    // Déduit niveau/cat + Y de la ligne survolée.
    let niveau: string | null = null;
    let corpsMetier: string | null = null;
    let rowTop = y0;
    let rowH = ROW_H;
    for (const row of layout.rows) {
      if (y0 < row.y || y0 >= row.y + row.h) continue;
      rowTop = row.y;
      rowH = row.h;
      if (row.type === 'group') {
        if (groupBy === 'niveau' && row.group.key !== '__autres') niveau = row.group.key;
        else if (groupBy === 'metier' && row.group.cat) corpsMetier = row.group.cat;
      } else {
        if (groupBy === 'niveau') niveau = row.task.niveau ?? null;
        else corpsMetier = row.task.corpsMetier ?? null;
      }
      break;
    }

    // Crée un "ghost" visuel pendant le drag.
    const ghost = document.createElement('div');
    ghost.style.cssText = `position:absolute;left:${x0}px;top:${rowTop + 5}px;width:2px;height:${rowH - 10}px;background:#f59e0b;opacity:.4;border-radius:6px;pointer-events:none;z-index:30;`;
    canvas.appendChild(ghost);

    const onMove = (ev: MouseEvent) => {
      const x = ev.clientX - rect.left;
      const left = Math.min(x, x0);
      const w = Math.abs(x - x0);
      ghost.style.left = `${left}px`;
      ghost.style.width = `${w}px`;
    };
    const onUp = (ev: MouseEvent) => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      ghost.remove();
      const x = ev.clientX - rect.left;
      const a = Math.min(x, x0);
      const b = Math.max(x, x0);
      if (b - a < 6) return; // simple clic dans le vide : on n'agit pas
      const dateDebut = iso(fromN(range.start + Math.floor(a / px)));
      const dateFin = iso(fromN(range.start + Math.floor(b / px)));
      const dureeJours = Math.max(1, dnum(dateFin) - dnum(dateDebut) + 1);
      creerTache({
        libelle: 'Nouvelle tâche',
        niveau,
        corpsMetier,
        dateDebutPrevue: dateDebut,
        dureeJours,
      });
    };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  }

  function startDragDeplacement(
    t: PlanningTacheRow,
    barEl: HTMLElement,
    handle: string,
    e: React.MouseEvent,
  ) {
    e.preventDefault();
    const startX = e.clientX;
    const px = PX_PAR_JOUR[zoom];
    const oStart = t.dateDebutPrevue!;
    const oEnd = t.dateFinPrevue!;
    // Position et largeur d'origine en pixels, pour mutation DOM directe pendant
    // le drag (sans snap → la barre suit le curseur 1:1, beaucoup plus fluide
    // que de snaper au jour entier surtout en zoom semaine/mois).
    const oLeftPx = (dnum(oStart) - range.start) * px + (t.estJalon ? px / 2 - 7 : 0);
    const oWidthPx = t.estJalon
      ? 14
      : Math.max(px, (dnum(oEnd) - dnum(oStart) + 1) * px);
    let dx = 0;
    const onMove = (ev: MouseEvent) => {
      dx = ev.clientX - startX;
      if (t.estJalon || handle === 'move') {
        barEl.style.left = `${oLeftPx + dx}px`;
      } else if (handle === 'right') {
        barEl.style.width = `${Math.max(px, oWidthPx + dx)}px`;
      } else if (handle === 'left') {
        // Garde au moins 1 jour de largeur (clamp à oWidthPx − px).
        const maxDx = oWidthPx - px;
        const clamped = Math.min(dx, maxDx);
        barEl.style.left = `${oLeftPx + clamped}px`;
        barEl.style.width = `${oWidthPx - clamped}px`;
      }
    };
    const onUp = () => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      // Snap au jour le plus proche pour le commit.
      const dDays = Math.round(dx / px);
      if (dDays === 0) {
        // Reset visuel (au cas où on aurait bougé moins d'un jour) puis :
        //  - moins de 3 px = clic → ouvre le drawer ;
        //  - sinon = drag qui n'a pas franchi le seuil → no-op silencieux.
        barEl.style.left = `${oLeftPx}px`;
        barEl.style.width = `${oWidthPx}px`;
        if (Math.abs(dx) < 3) setTacheSelectionneeId(t.id);
        return;
      }
      let newStart = oStart;
      let newEnd = oEnd;
      if (t.estJalon || handle === 'move') {
        newStart = addDays(oStart, dDays);
        newEnd = addDays(oEnd, dDays);
        if (t.estJalon) newEnd = newStart;
      } else if (handle === 'right') {
        newEnd = addDays(oEnd, dDays);
        if (dnum(newEnd) < dnum(oStart)) newEnd = oStart;
      } else if (handle === 'left') {
        newStart = addDays(oStart, dDays);
        if (dnum(newStart) > dnum(oEnd)) newStart = oEnd;
      }
      commitDeplacement(t, newStart, newEnd);
    };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  }

  function startDragProgress(t: PlanningTacheRow, barEl: HTMLElement, e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    const fill = barEl.querySelector('[data-progfill]') as HTMLElement | null;
    let pct = t.avancementPourcent ?? 0;
    const computePct = (ev: { clientX: number }) => {
      const r = barEl.getBoundingClientRect();
      const p = Math.round(((ev.clientX - r.left) / r.width) * 20) * 5;
      return Math.max(0, Math.min(100, p));
    };
    const onMove = (ev: MouseEvent) => {
      pct = computePct(ev);
      if (fill) fill.style.width = `${pct}%`;
    };
    const onUp = (ev: MouseEvent) => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      pct = computePct(ev);
      commitAvancement(t, pct);
    };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  }

  function startDragLink(t: PlanningTacheRow, barEl: HTMLElement, e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const b = barEl.getBoundingClientRect();
    const x1 = b.right - rect.left;
    const y1 = b.top + b.height / 2 - rect.top;

    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('class', 'pointer-events-none absolute left-0 top-0');
    svg.setAttribute('width', String(range.totalDays * PX_PAR_JOUR[zoom]));
    svg.setAttribute('height', String(canvas.scrollHeight));
    svg.style.zIndex = '40';
    svg.innerHTML = `<path id="planning-link-tmp" stroke="#f59e0b" stroke-width="2" stroke-dasharray="4 3" fill="none"/>`;
    canvas.appendChild(svg);
    const path = svg.querySelector('#planning-link-tmp') as SVGPathElement | null;

    const onMove = (ev: MouseEvent) => {
      if (!path) return;
      const x2 = ev.clientX - rect.left;
      const y2 = ev.clientY - rect.top;
      path.setAttribute('d', `M${x1} ${y1} L${x2} ${y2}`);
    };
    const onUp = (ev: MouseEvent) => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      svg.remove();
      const el = document.elementFromPoint(ev.clientX, ev.clientY);
      const tb = el?.closest('[data-tache-id]') as HTMLElement | null;
      if (tb && tb.dataset.tacheId && tb.dataset.tacheId !== t.id) {
        commitLink(t.id, tb.dataset.tacheId);
      }
    };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  }

  // ── Library drag-drop : crée une tâche au point de dépôt ──
  function onCanvasDragOver(e: React.DragEvent) {
    if (e.dataTransfer.types.includes('application/x-planning-library')) {
      e.preventDefault();
    }
  }
  function onCanvasDrop(e: React.DragEvent) {
    e.preventDefault();
    const raw = e.dataTransfer.getData('application/x-planning-library');
    if (!raw) return;
    let item: { name: string; cat: string; dur: number; milestone?: boolean };
    try {
      item = JSON.parse(raw);
    } catch {
      return;
    }
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const px = PX_PAR_JOUR[zoom];
    const dateDebut = iso(fromN(range.start + Math.floor(x / px)));
    // Déduit le niveau depuis le rang Y (mode 'niveau'). En mode 'metier',
    // on déduit plutôt le corps de métier ; sinon fallback au cat de l'item.
    let niveau: string | null = null;
    let corpsMetier: string | null = item.cat;
    for (const row of layout.rows) {
      if (y < row.y || y >= row.y + row.h) continue;
      if (row.type === 'group') {
        if (groupBy === 'niveau' && row.group.key !== '__autres') niveau = row.group.key;
        else if (groupBy === 'metier' && row.group.cat) corpsMetier = row.group.cat;
      } else {
        if (groupBy === 'niveau') niveau = row.task.niveau ?? null;
        else corpsMetier = row.task.corpsMetier ?? item.cat;
      }
      break;
    }
    creerTache({
      libelle: item.name,
      niveau,
      corpsMetier,
      dateDebutPrevue: dateDebut,
      dureeJours: item.dur,
      estJalon: !!item.milestone,
    });
  }

  /** Bouton « + Tâche » : crée une tâche aujourd'hui, 5 j, dans le premier groupe ouvert. */
  function ajouterTache() {
    const t0 = today;
    // Cherche le premier groupe visible non-replié pour le défaut niveau.
    const premierGroupe = layout.rows.find(
      (r) => r.type === 'group' && !collapsed.has(r.group.key),
    );
    const niveau =
      premierGroupe?.type === 'group' && groupBy === 'niveau' && premierGroupe.group.key !== '__autres'
        ? premierGroupe.group.key
        : null;
    creerTache({
      libelle: 'Nouvelle tâche',
      niveau,
      corpsMetier: null,
      dateDebutPrevue: t0,
      dureeJours: 5,
    });
  }

  const tacheSelectionnee = taches.find((t) => t.id === tacheSelectionneeId) ?? null;

  return (
    <div className="space-y-4">
      {/* ── Bandeau d'actions sticky ───────────────────────────── */}
      <div
        data-print="hide"
        className={cn(
          'sticky top-0 z-20 -mx-4 flex flex-wrap items-end justify-between gap-3 border-b bg-background/95 px-4 py-3 backdrop-blur lg:-mx-8 lg:px-8',
          plein && 'hidden',
        )}
      >
        <div className="min-w-0">
          <h2 className="flex items-center gap-2 text-xl font-medium">
            <CalendarRangeIcon className="size-5 text-primary" />
            Planning — {chantier.libelle}
          </h2>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {chantier.numero} ·{' '}
            {range.projectStart && range.projectEnd
              ? `${fmtFR(range.projectStart)} → ${fmtFR(range.projectEnd)} · ${
                  dnum(range.projectEnd) - dnum(range.projectStart) + 1
                } j calendaires`
              : 'aucune date planifiée'}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex overflow-hidden rounded-md border bg-background text-xs">
            {(['jour', 'semaine', 'mois'] as const).map((z) => (
              <button
                key={z}
                type="button"
                onClick={() => setZoom(z)}
                className={cn(
                  'px-2.5 py-1 transition-colors',
                  zoom === z ? 'bg-primary text-primary-foreground font-medium' : 'hover:bg-muted',
                )}
              >
                {z === 'jour' ? 'Jour' : z === 'semaine' ? 'Semaine' : 'Mois'}
              </button>
            ))}
          </div>
          <Select value={groupBy} onValueChange={(v) => v && setGroupBy(v as GroupByMode)}>
            <SelectTrigger className="h-8 w-[180px] text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="niveau">Grouper : niveau</SelectItem>
              <SelectItem value="metier">Grouper : corps de métier</SelectItem>
            </SelectContent>
          </Select>
          <div className="flex overflow-hidden rounded-md border bg-background text-xs">
            <button
              type="button"
              onClick={undo}
              disabled={undoStack.length === 0}
              className="grid size-8 place-items-center text-muted-foreground hover:bg-muted disabled:opacity-30"
              title="Annuler (dernière action)"
              aria-label="Annuler"
            >
              <Undo2Icon className="size-3.5" />
            </button>
            <button
              type="button"
              onClick={redo}
              disabled={redoStack.length === 0}
              className="grid size-8 place-items-center text-muted-foreground hover:bg-muted disabled:opacity-30"
              title="Rétablir"
              aria-label="Rétablir"
            >
              <Redo2Icon className="size-3.5" />
            </button>
          </div>
          <div className="relative">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setHistOpen((v) => !v)}
              disabled={undoStack.length === 0 && redoStack.length === 0}
              className="h-8 gap-1 text-xs"
              title="Historique des modifications"
              aria-expanded={histOpen}
            >
              🕘 {undoStack.length + redoStack.length}
            </Button>
            {histOpen && (
              <div
                className="absolute right-0 top-full z-30 mt-1 max-h-72 w-80 overflow-y-auto rounded-md border bg-popover p-1 text-xs shadow-md"
                role="dialog"
                onMouseLeave={() => setHistOpen(false)}
              >
                <div className="px-2 py-1 text-[10px] uppercase tracking-wide text-muted-foreground">
                  Historique ({undoStack.length + redoStack.length})
                </div>
                {/* Future (redo stack) — du plus récent au plus ancien */}
                {redoStack
                  .map((op, i) => ({
                    op,
                    targetIdx: undoStack.length + (redoStack.length - i),
                  }))
                  .map(({ op, targetIdx }, _, arr) => {
                    void arr;
                    return (
                      <button
                        key={`r-${op.at}-${targetIdx}`}
                        type="button"
                        onClick={() => {
                          setHistOpen(false);
                          jumpTo(targetIdx);
                        }}
                        className="flex w-full items-center gap-2 rounded px-2 py-1 text-left text-muted-foreground hover:bg-muted"
                      >
                        <span className="text-[10px] tabular-nums opacity-70">
                          {new Date(op.at).toLocaleTimeString('fr-FR', {
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </span>
                        <span className="flex-1 truncate">{op.label}</span>
                        <span className="text-[10px] opacity-70">à rétablir</span>
                      </button>
                    );
                  })}
                {/* Marqueur "État actuel" */}
                {undoStack.length === 0 && redoStack.length === 0 ? null : (
                  <div className="my-1 flex items-center gap-2 border-y bg-primary/5 px-2 py-1 text-[10px] font-medium uppercase tracking-wide text-primary">
                    <span>●</span>
                    <span>État actuel</span>
                  </div>
                )}
                {/* Past (undo stack) — du plus récent au plus ancien */}
                {undoStack
                  .slice()
                  .reverse()
                  .map((op, i) => {
                    const targetIdx = undoStack.length - i;
                    return (
                      <button
                        key={`u-${op.at}-${targetIdx}`}
                        type="button"
                        onClick={() => {
                          setHistOpen(false);
                          jumpTo(targetIdx - 1);
                        }}
                        className="flex w-full items-center gap-2 rounded px-2 py-1 text-left hover:bg-muted"
                      >
                        <span className="text-[10px] tabular-nums text-muted-foreground">
                          {new Date(op.at).toLocaleTimeString('fr-FR', {
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </span>
                        <span className="flex-1 truncate">{op.label}</span>
                        <span className="text-[10px] text-muted-foreground">à annuler</span>
                      </button>
                    );
                  })}
              </div>
            )}
          </div>
          <Button variant="outline" size="sm" onClick={scrollAujourdhui} className="h-8 text-xs">
            Aujourd&apos;hui
          </Button>
          <Button
            variant={hideDone ? 'default' : 'outline'}
            size="sm"
            onClick={() => setHideDone((v) => !v)}
            className="h-8 gap-1 text-xs"
          >
            {hideDone ? <EyeIcon className="size-3.5" /> : <EyeOffIcon className="size-3.5" />}
            {hideDone ? 'Afficher terminées' : 'Masquer terminées'}
          </Button>
          <div className="relative">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setFilterOpen((v) => !v)}
              className="h-8 gap-1 text-xs"
              aria-expanded={filterOpen}
            >
              <FilterIcon className="size-3.5" />
              Filtre
            </Button>
            {filterOpen && (
              <div
                className="absolute right-0 top-full z-30 mt-1 w-60 rounded-md border bg-popover p-2 text-xs shadow-md"
                role="dialog"
              >
                <div className="mb-1 flex items-center justify-between px-1 text-[10px] uppercase tracking-wide text-muted-foreground">
                  <span>Corps de métier</span>
                  <button
                    type="button"
                    onClick={() => setHiddenCats(new Set())}
                    className="text-primary hover:underline"
                  >
                    tout afficher
                  </button>
                </div>
                {(Object.keys(CATS) as CorpsMetierCle[]).map((k) => (
                  <label
                    key={k}
                    className="flex cursor-pointer items-center gap-2 rounded px-1 py-1 hover:bg-muted"
                  >
                    <input
                      type="checkbox"
                      className="accent-primary"
                      checked={!hiddenCats.has(k)}
                      onChange={() => toggleHiddenCat(k)}
                    />
                    <span
                      className={cn(
                        'size-2.5',
                        k === 'livraison' ? 'rotate-45' : 'rounded-full',
                      )}
                      style={{ background: CATS[k].fill }}
                    />
                    <span className="flex-1">{CATS[k].label}</span>
                  </label>
                ))}
              </div>
            )}
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setPlein(true)}
            className="h-8 gap-1 text-xs"
            title="Plein écran (masque KPIs et barre d'actions)"
          >
            ⤢ Plein écran
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => window.print()}
            className="h-8 gap-1 text-xs"
          >
            <PrinterIcon className="size-3.5" />
            Imprimer
          </Button>
          <Button
            size="sm"
            onClick={ajouterTache}
            className="h-8 gap-1 text-xs"
          >
            + Tâche
          </Button>
        </div>
      </div>

      {/* ── KPIs ────────────────────────────────────────────────── */}
      <div
        data-print="hide"
        className={cn('grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4', plein && 'hidden')}
      >
        <Card>
          <CardContent className="pt-4">
            <div className="text-xs text-muted-foreground">Avancement</div>
            <div className="mt-1 text-2xl font-semibold tabular-nums">
              {kpis.avancementPourcent} %
            </div>
            <div className="mt-2 h-1.5 rounded bg-muted">
              <div
                className="h-full rounded bg-primary transition-all"
                style={{ width: `${kpis.avancementPourcent}%` }}
              />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="text-xs text-muted-foreground">Tâches planifiées</div>
            <div className="mt-1 text-2xl font-semibold tabular-nums">{taches.length}</div>
            <div className="mt-1 text-xs text-muted-foreground">
              {(() => {
                const n = new Set(taches.map((t) => t.niveau ?? '—')).size;
                return `sur ${n} niveau${n > 1 ? 'x' : ''}`;
              })()}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="text-xs text-muted-foreground">Heures ouvriers</div>
            <div className="mt-1 text-2xl font-semibold tabular-nums">
              <span className="text-primary">{kpis.heuresFaites.toLocaleString('fr-FR')}</span>{' '}
              <span className="text-base font-normal text-muted-foreground">
                / {kpis.heuresPlanifiees.toLocaleString('fr-FR')} h
              </span>
            </div>
            <div className="mt-1 text-xs text-muted-foreground">saisies / planifiées</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="text-xs text-muted-foreground">Planning</div>
            <div
              className={cn(
                'mt-1 text-2xl font-semibold',
                kpis.statut === 'en_avance' && 'text-emerald-600',
                kpis.statut === 'en_retard' && 'text-rose-600',
              )}
            >
              {kpis.statut === 'en_avance'
                ? '▲ En avance'
                : kpis.statut === 'en_retard'
                  ? '▼ En retard'
                  : '● À l’heure'}
            </div>
            <div className="mt-1 text-xs text-muted-foreground">
              {kpis.deltaPoints >= 0 ? '+' : ''}
              {kpis.deltaPoints} pts
              {kpis.joursDecalage !== 0 &&
                ` · ~${Math.abs(kpis.joursDecalage)} j ${kpis.joursDecalage > 0 ? 'd’avance' : 'de retard'}`}
              {kpis.finPrevueIso && ` · fin prév. ${fmtFR(kpis.finPrevueIso)}`}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* ── Gantt section ───────────────────────────────────────── */}
      <section
        data-print="section"
        className={cn(
          'overflow-hidden rounded-xl border bg-card shadow-sm',
          plein && 'fixed inset-0 z-50 rounded-none border-0 shadow-none',
        )}
      >
        <div className="flex items-center justify-between border-b px-5 py-3">
          <div className="flex items-center gap-3">
            <h3 className="text-base font-semibold">
              {plein ? `Planning — ${chantier.libelle}` : 'Diagramme de Gantt'}
            </h3>
            <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
              {taches.length} tâches
            </span>
          </div>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <span className="hidden sm:inline">
              Cliquez une barre pour éditer la tâche
            </span>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setLibOpen((v) => !v)}
              className="h-8 text-xs"
            >
              Bibliothèque {libOpen ? '◨' : '◧'}
            </Button>
            {plein && (
              <Button size="sm" onClick={() => setPlein(false)} className="h-8 gap-1 text-xs">
                ↩ Vue standard
              </Button>
            )}
          </div>
        </div>

        <div data-print="box" className="flex" style={{ height: plein ? 'calc(100vh - 100px)' : 600 }}>
          {/* ── Bibliothèque BTP (repliée par défaut) ── */}
          {libOpen && (
            <aside data-print="hide" className="flex w-[230px] flex-none flex-col border-r bg-muted/30">
              <div className="border-b p-3">
                <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Bibliothèque BTP
                </div>
                <p className="mt-1 text-[10px] text-muted-foreground">
                  Glissez un item sur le planning pour créer une tâche.
                </p>
              </div>
              <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-3 text-xs">
                {LIBRARY.map((sec) => (
                  <div key={sec.sect}>
                    <div className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                      {sec.sect}
                    </div>
                    <div className="space-y-1">
                      {sec.items.map((it) => {
                        const c = CATS[it.cat];
                        return (
                          <div
                            key={it.name}
                            draggable
                            onDragStart={(e) => {
                              e.dataTransfer.effectAllowed = 'copy';
                              e.dataTransfer.setData(
                                'application/x-planning-library',
                                JSON.stringify({
                                  name: it.name,
                                  cat: it.cat,
                                  dur: it.dur,
                                  milestone: !!it.milestone,
                                }),
                              );
                            }}
                            className="flex cursor-grab items-center gap-2 rounded-md border bg-background px-2 py-1.5 hover:border-primary/40 hover:shadow-sm active:cursor-grabbing"
                          >
                            <span
                              className={cn(
                                'size-2.5 flex-none',
                                it.milestone ? 'rotate-45' : 'rounded-full',
                              )}
                              style={{ background: c.fill }}
                            />
                            <span className="min-w-0 flex-1 truncate">{it.name}</span>
                            <span className="flex-none text-[10px] text-muted-foreground">
                              {it.milestone ? 'jalon' : `${it.dur} j`}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </aside>
          )}

          {/* ── Gantt : labels + timeline ── */}
          <div className="flex min-w-0 flex-1">
            <div
              data-print="labels-col"
              className="relative w-[270px] flex-none overflow-hidden border-r bg-card"
            >
              <div
                className="absolute inset-x-0 top-0 z-10 flex items-end border-b bg-card px-3 pb-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground"
                style={{ height: HEAD_H }}
              >
                Niveau / Tâche
              </div>
              <div
                ref={labelsBodyRef}
                data-print="labels-body"
                className="absolute inset-x-0 will-change-transform"
                style={{ top: HEAD_H }}
              >
                <GanttLabels
                  layout={layout}
                  collapsed={collapsed}
                  groupBy={groupBy}
                  onToggleGroup={toggleCollapsed}
                  onOpenTask={(id) => setTacheSelectionneeId(id)}
                  onDuplicate={dupliquerNiveau}
                />
              </div>
            </div>

            <div
              ref={timelineRef}
              data-print="time-scroll"
              className="relative min-w-0 flex-1 overflow-auto"
            >
              <div
                data-print="time-header"
                className="sticky top-0 z-10 border-b bg-card"
                style={{ width: W, height: HEAD_H }}
              >
                <GanttHeader range={range} zoom={zoom} totalWidth={W} />
              </div>
              <div
                ref={canvasRef}
                className="relative"
                style={{ width: W, height: layout.height }}
                onMouseDown={onCanvasMouseDown}
                onDragOver={onCanvasDragOver}
                onDrop={onCanvasDrop}
              >
                <GanttBackground
                  range={range}
                  zoom={zoom}
                  totalWidth={W}
                  totalHeight={layout.height}
                  layout={layout}
                  today={today}
                />
                <GanttArrows layout={layout} range={range} zoom={zoom} />
                <GanttBars layout={layout} range={range} zoom={zoom} />
              </div>
            </div>
          </div>
        </div>

        {/* ── Légende (chips cliquables = filtre) ── */}
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-t px-5 py-3 text-xs text-muted-foreground">
          <span className="mr-1">Filtrer :</span>
          {(Object.keys(CATS) as CorpsMetierCle[]).map((k) => {
            const off = hiddenCats.has(k);
            return (
              <button
                key={k}
                type="button"
                onClick={() => toggleHiddenCat(k)}
                className={cn('flex items-center gap-1.5 transition-opacity', off && 'opacity-30')}
              >
                <span
                  className={cn(
                    'size-3',
                    k === 'livraison' ? 'rotate-45' : 'rounded-full',
                  )}
                  style={{ background: CATS[k].fill }}
                />
                <span>{CATS[k].label}</span>
              </button>
            );
          })}
        </div>
      </section>

      {/* ── Drawer d'édition ───────────────────────────────────── */}
      <GanttDrawer
        tache={tacheSelectionnee}
        toutesTaches={taches}
        ouvriers={ouvriers}
        handlers={handlers}
        onClose={() => setTacheSelectionneeId(null)}
        onSupprimerTache={commitSuppression}
      />
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Sous-composants visuels
// ─────────────────────────────────────────────────────────────

function GanttBackground({
  range,
  zoom,
  totalWidth,
  totalHeight,
  layout,
  today,
}: {
  range: Range;
  zoom: Zoom;
  totalWidth: number;
  totalHeight: number;
  layout: Layout;
  today: string;
}) {
  const px = PX_PAR_JOUR[zoom];
  const items: React.ReactNode[] = [];

  if (zoom === 'jour') {
    for (let i = range.start; i <= range.end; i++) {
      const dow = fromN(i).getUTCDay();
      if (dow === 0 || dow === 6) {
        items.push(
          <div
            key={`we-${i}`}
            className="absolute bg-muted/40"
            style={{ left: (i - range.start) * px, width: px, top: 0, height: totalHeight }}
          />,
        );
      }
    }
  }

  // Séparateurs de mois
  let d = range.start;
  while (d <= range.end) {
    items.push(
      <div
        key={`sep-${d}`}
        className="absolute bg-border/60"
        style={{ left: (d - range.start) * px, width: 1, top: 0, height: totalHeight }}
      />,
    );
    const dt = fromN(d);
    const mEnd = Math.floor(Date.UTC(dt.getUTCFullYear(), dt.getUTCMonth() + 1, 0) / 86_400_000);
    d = mEnd + 1;
  }

  // Fonds de rangs
  for (const r of layout.rows) {
    if (r.type === 'group') {
      items.push(
        <div
          key={`g-bg-${r.group.key}`}
          className="absolute bg-muted/40"
          style={{ left: 0, top: r.y, width: totalWidth, height: r.h }}
        />,
      );
    } else {
      items.push(
        <div
          key={`t-bg-${r.task.id}`}
          className="absolute border-b border-border/30 hover:bg-primary/5"
          style={{ left: 0, top: r.y, width: totalWidth, height: r.h }}
        />,
      );
    }
  }

  // Trait "Aujourd'hui"
  const tx = (dnum(today) - range.start) * px + px / 2;
  items.push(
    <div
      key="today-line"
      className="absolute z-10 border-l-2 border-primary"
      style={{ left: tx, top: 0, height: totalHeight, width: 0 }}
    />,
    <div
      key="today-label"
      className="absolute z-10 rounded bg-primary px-1.5 py-0.5 text-[10px] font-semibold text-primary-foreground shadow"
      style={{ left: tx + 3, top: 2 }}
    >
      Aujourd&apos;hui
    </div>,
  );

  return <>{items}</>;
}

function GanttArrows({ layout, range, zoom }: { layout: Layout; range: Range; zoom: Zoom }) {
  const px = PX_PAR_JOUR[zoom];
  // Position de chaque tâche visible (centre vertical + bornes horizontales).
  const pos = new Map<
    string,
    { yc: number; xStart: number; xEnd: number; milestone: boolean }
  >();
  for (const r of layout.rows) {
    if (r.type !== 'task') continue;
    const t = r.task;
    if (!t.dateDebutPrevue || !t.dateFinPrevue) continue;
    const start = (dnum(t.dateDebutPrevue) - range.start) * px;
    const end = t.estJalon ? start + px : (dnum(t.dateFinPrevue) + 1 - range.start) * px;
    pos.set(t.id, { yc: r.y + r.h / 2, xStart: start, xEnd: end, milestone: t.estJalon });
  }

  const paths: React.ReactNode[] = [];
  for (const r of layout.rows) {
    if (r.type !== 'task') continue;
    const t = r.task;
    if (!t.predecesseurId) continue;
    const a = pos.get(t.predecesseurId);
    const b = pos.get(t.id);
    if (!a || !b) continue;
    const x1 = a.xEnd;
    const y1 = a.yc;
    const x2 = b.xStart;
    const y2 = b.yc;
    paths.push(
      <path
        key={`arrow-${t.id}`}
        d={`M${x1} ${y1} H${x1 + 9} V${y2} H${Math.max(x1 + 9, x2 - 1)}`}
        stroke="#94a3b8"
        strokeWidth={1.5}
        fill="none"
        markerEnd="url(#planning-arrow)"
      />,
    );
  }

  if (paths.length === 0) return null;
  const W = range.totalDays * px;
  const H = Math.max(...layout.rows.map((r) => r.y + r.h), 0);

  return (
    <svg
      className="pointer-events-none absolute left-0 top-0"
      width={W}
      height={H}
      style={{ zIndex: 5 }}
    >
      <defs>
        <marker id="planning-arrow" markerWidth={7} markerHeight={7} refX={6} refY={3} orient="auto">
          <path d="M0,0 L6,3 L0,6 Z" fill="#94a3b8" />
        </marker>
      </defs>
      {paths}
    </svg>
  );
}

/**
 * Bars rendues sans handler propre : clic, drag-move/resize, drag-progress et
 * drag-link sont délégués au `onMouseDown` du canvas parent via les attributs
 * `data-tache-id` (sur le conteneur) et `data-handle` (sur les zones internes).
 * Body du conteneur = move ; left/right = resize ; progress = jauge ; link = poignée.
 */
function GanttBars({
  layout,
  range,
  zoom,
}: {
  layout: Layout;
  range: Range;
  zoom: Zoom;
}) {
  const px = PX_PAR_JOUR[zoom];
  const items: React.ReactNode[] = [];

  for (const r of layout.rows) {
    if (r.type === 'group') {
      const datees = r.tasks.filter((t) => t.dateDebutPrevue && t.dateFinPrevue);
      if (!datees.length) continue;
      const mn = Math.min(...datees.map((t) => dnum(t.dateDebutPrevue!)));
      const mx = Math.max(...datees.map((t) => dnum(t.dateFinPrevue!)));
      items.push(
        <div
          key={`gbar-${r.group.key}`}
          className="pointer-events-none absolute rounded-full bg-muted-foreground/30"
          style={{
            left: (mn - range.start) * px,
            top: r.y + r.h / 2 - 3,
            width: (mx - mn + 1) * px,
            height: 6,
          }}
        />,
      );
      continue;
    }
    const t = r.task;
    if (!t.dateDebutPrevue || !t.dateFinPrevue) continue;
    const c = catOf(t.corpsMetier);
    const pct = Math.max(0, Math.min(100, t.avancementPourcent ?? 0));

    if (t.estJalon) {
      const cx = (dnum(t.dateDebutPrevue) - range.start) * px + px / 2;
      items.push(
        <div
          key={t.id}
          data-tache-id={t.id}
          title={`${t.libelle} — ${pct}%`}
          className="absolute"
          style={{
            left: cx - 7,
            top: r.y + r.h / 2 - 7,
            width: 14,
            height: 14,
            background: c.fill,
            transform: 'rotate(45deg)',
            borderRadius: 3,
            cursor: 'grab',
            boxShadow: pct >= 100 ? `0 0 0 2px #fff, 0 0 0 3px ${c.fill}` : undefined,
          }}
        />,
      );
      continue;
    }

    const left = (dnum(t.dateDebutPrevue) - range.start) * px;
    const w = Math.max(px, (dnum(t.dateFinPrevue) - dnum(t.dateDebutPrevue) + 1) * px);
    items.push(
      <div
        key={t.id}
        data-tache-id={t.id}
        className="group absolute flex items-center rounded-md text-[11px] font-medium text-white shadow-sm hover:brightness-110"
        title={`${t.libelle} — ${pct}%`}
        style={{
          left,
          width: w,
          top: r.y + 5,
          height: r.h - 10,
          background: c.fill,
          cursor: 'grab',
        }}
      >
        {/* Resize handle gauche */}
        <span
          data-handle="left"
          className="absolute inset-y-0 left-0 z-10 w-1.5"
          style={{ cursor: 'ew-resize' }}
        />
        <span className="pointer-events-none relative truncate px-2 pb-1">
          {t.libelle.replace(/^(SS|RDC|R\+\d)\s*-\s*/, '')}
          {` · ${pct}%`}
        </span>
        {/* Resize handle droite */}
        <span
          data-handle="right"
          className="absolute inset-y-0 right-0 z-10 w-1.5"
          style={{ cursor: 'ew-resize' }}
        />
        {/* Jauge d'avancement intégrée */}
        <div
          className="pointer-events-none absolute"
          style={{
            left: 4,
            right: 4,
            bottom: 2,
            height: 3,
            borderRadius: 9999,
            background: 'rgba(255,255,255,0.35)',
          }}
        >
          <div
            data-progfill
            style={{
              height: '100%',
              borderRadius: 9999,
              width: `${pct}%`,
              background: 'rgba(255,255,255,0.95)',
            }}
          />
        </div>
        {/* Poignée drag-progress (bas de barre) */}
        <span
          data-handle="progress"
          className="absolute inset-x-2 bottom-0 z-10 h-2"
          style={{ cursor: 'ns-resize' }}
          title="Glisser pour saisir l'avancement"
        />
        {/* Poignée drag-link (dot droite, visible au survol) */}
        <span
          data-handle="link"
          className="absolute right-[-7px] top-1/2 z-20 hidden size-3 -translate-y-1/2 rounded-full bg-white shadow ring-2 ring-amber-400 group-hover:block"
          style={{ cursor: 'crosshair' }}
          title="Glisser vers une autre tâche pour l'enchaîner"
        />
      </div>,
    );
  }
  return <>{items}</>;
}

function GanttLabels({
  layout,
  collapsed,
  groupBy,
  onToggleGroup,
  onOpenTask,
  onDuplicate,
}: {
  layout: Layout;
  collapsed: ReadonlySet<string>;
  groupBy: GroupByMode;
  onToggleGroup: (key: string) => void;
  onOpenTask: (id: string) => void;
  onDuplicate: (niveau: string) => void;
}) {
  return (
    <>
      {layout.rows.map((r) => {
        if (r.type === 'group') {
          const c = collapsed.has(r.group.key);
          // Le bouton "Dupliquer l'étage" n'apparaît que :
          //  - en regroupement par niveau (pas par corps de métier),
          //  - sur un vrai niveau (pas le bucket '__autres'),
          //  - le groupe a au moins une tâche à cloner.
          const duplicable =
            groupBy === 'niveau' && r.group.key !== '__autres' && r.tasks.length > 0;
          return (
            <div
              key={`gl-${r.group.key}`}
              className="flex items-center gap-1.5 border-b bg-muted/40 px-3"
              style={{ height: r.h }}
            >
              <button
                type="button"
                onClick={() => onToggleGroup(r.group.key)}
                className="grid size-4 flex-none place-items-center rounded text-muted-foreground hover:bg-muted hover:text-foreground"
                aria-label={c ? `Déplier ${r.group.label}` : `Replier ${r.group.label}`}
              >
                {c ? '▸' : '▾'}
              </button>
              <span className="min-w-0 flex-1 truncate text-[13px] font-semibold">
                {r.group.label}
              </span>
              <span className="flex-none rounded-full bg-background px-1.5 text-[10px] text-muted-foreground ring-1 ring-border">
                {r.tasks.length}
              </span>
              {duplicable && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onDuplicate(r.group.key);
                  }}
                  title="Dupliquer l'étage (clone toutes les tâches, dates décalées)"
                  className="flex-none rounded px-1 text-[11px] text-muted-foreground hover:bg-primary/10 hover:text-primary"
                >
                  ⧉
                </button>
              )}
            </div>
          );
        }
        const t = r.task;
        const c = catOf(t.corpsMetier);
        return (
          <button
            key={`tl-${t.id}`}
            type="button"
            onClick={() => onOpenTask(t.id)}
            className="flex w-full items-center gap-2 border-b border-border/30 px-3 text-left hover:bg-primary/5"
            style={{ height: r.h }}
          >
            <span className="size-2 flex-none rounded-full" style={{ background: c.fill }} />
            <span className="min-w-0 flex-1 truncate text-[12px]">
              {t.libelle.replace(/^(SS|RDC|R\+\d)\s*-\s*/, '')}
            </span>
            {t.dateDebutPrevue && (
              <span className="flex-none text-[10px] tabular-nums text-muted-foreground">
                {fmtFR(t.dateDebutPrevue)}
              </span>
            )}
          </button>
        );
      })}
    </>
  );
}

// ─────────────────────────────────────────────────────────────
// Drawer d'édition
// ─────────────────────────────────────────────────────────────

function GanttDrawer({
  tache,
  toutesTaches,
  ouvriers,
  handlers,
  onClose,
  onSupprimerTache,
}: {
  tache: PlanningTacheRow | null;
  toutesTaches: PlanningTacheRow[];
  ouvriers: OuvrierAffectable[];
  handlers: GanttHandlers;
  onClose: () => void;
  /** Délégué au parent (pour pousser l'op dans la pile undo). Confirme + supprime. */
  onSupprimerTache: (t: PlanningTacheRow) => void;
}) {
  // Champs contrôlés (réhydratés à chaque ouverture)
  const [libelle, setLibelle] = useState('');
  const [niveau, setNiveau] = useState('');
  const [corpsMetier, setCorpsMetier] = useState<string>('');
  const [dateDebut, setDateDebut] = useState('');
  const [dateFin, setDateFin] = useState('');
  const [avancement, setAvancement] = useState(0);
  const [estJalon, setEstJalon] = useState(false);
  const [predecesseurId, setPredecesseurId] = useState<string>('');
  const [notes, setNotes] = useState('');
  const [nouvelOuvrier, setNouvelOuvrier] = useState<string>('');
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    if (!tache) return;
    setLibelle(tache.libelle);
    setNiveau(tache.niveau ?? '');
    setCorpsMetier(tache.corpsMetier ?? '');
    setDateDebut(tache.dateDebutPrevue ?? '');
    setDateFin(tache.dateFinPrevue ?? '');
    setAvancement(tache.avancementPourcent ?? 0);
    setEstJalon(tache.estJalon);
    setPredecesseurId(tache.predecesseurId ?? '');
    setNotes(tache.notes ?? '');
    setNouvelOuvrier(ouvriers.find((o) => !tache.equipe.some((e) => e.utilisateurId === o.id))?.id ?? '');
  }, [tache, ouvriers]);

  if (!tache) return null;

  function enregistrer() {
    if (!tache) return;
    startTransition(async () => {
      const res = await handlers.enregistrerTache({
        id: tache.id,
        libelle,
        niveau: niveau || null,
        corpsMetier: corpsMetier || null,
        dateDebutPrevue: dateDebut || null,
        dateFinPrevue: estJalon ? dateDebut || null : dateFin || null,
        avancementPourcent: avancement,
        estJalon,
        predecesseurId: predecesseurId || null,
        notes: notes || null,
      });
      if (!res.ok) toast.error(res.error);
      else {
        toast.success('Tâche enregistrée.');
        onClose();
      }
    });
  }

  function affecter() {
    if (!tache || !nouvelOuvrier) return;
    startTransition(async () => {
      const res = await handlers.affecterOuvrier(tache.id, nouvelOuvrier, 0);
      if (!res.ok) toast.error(res.error);
    });
  }

  function majHeures(equipeId: string, prevues: number, faites: number) {
    startTransition(async () => {
      const res = await handlers.majEquipe(equipeId, prevues, faites);
      if (!res.ok) toast.error(res.error);
    });
  }

  function retirer(equipeId: string) {
    startTransition(async () => {
      const res = await handlers.retirerOuvrier(equipeId);
      if (!res.ok) toast.error(res.error);
    });
  }

  function supprimer() {
    if (!tache) return;
    if (!window.confirm(`Supprimer la tâche « ${tache.libelle} » ?`)) return;
    // Délègue au parent qui pousse l'op dans la pile undo + ferme le drawer.
    onSupprimerTache(tache);
  }

  const c = catOf(corpsMetier || tache.corpsMetier);
  const heuresFaitesTotal = tache.equipe.reduce((s, w) => s + (w.heuresFaites ?? 0), 0);
  const heuresPrevuesTotal = tache.equipe.reduce((s, w) => s + (w.heuresPrevues ?? 0), 0);

  return (
    <>
      {/* Pas de backdrop modal : le drawer est un panneau latéral non-bloquant —
         l'utilisateur peut continuer à interagir avec le Gantt en arrière-plan
         (drag-move, cliquer une autre barre, etc.). Fermeture explicite via X,
         Annuler, Enregistrer ou Supprimer. */}
      <aside className="fixed right-0 top-0 z-50 flex h-full w-full max-w-md flex-col overflow-y-auto border-l bg-background shadow-2xl">
        <div className="flex items-center justify-between border-b px-5 py-4">
          <div className="flex items-center gap-2">
            <span className="size-3 rounded-full" style={{ background: c.fill }} />
            <h3 className="text-sm font-semibold">Détail de la tâche</h3>
          </div>
          <Button variant="ghost" size="icon" onClick={onClose} aria-label="Fermer">
            <XIcon className="size-4" />
          </Button>
        </div>

        <div className="space-y-5 p-5">
          <div className="space-y-1">
            <Label htmlFor="dw-libelle" className="text-xs font-medium text-muted-foreground">
              Intitulé
            </Label>
            <Input
              id="dw-libelle"
              value={libelle}
              onChange={(e) => setLibelle(e.target.value)}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label className="text-xs font-medium text-muted-foreground">Niveau</Label>
              <Input
                value={niveau}
                onChange={(e) => setNiveau(e.target.value)}
                placeholder="ss / rdc / r1 ..."
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs font-medium text-muted-foreground">Corps de métier</Label>
              <Select
                value={corpsMetier || 'aucun'}
                onValueChange={(v) => setCorpsMetier(v && v !== 'aucun' ? v : '')}
              >
                <SelectTrigger className="h-9">
                  <SelectValue placeholder="—">
                    {(v) => {
                      if (!v || v === 'aucun') return '— aucun —';
                      if (v in CATS) return CATS[v as CorpsMetierCle].label;
                      return String(v);
                    }}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="aucun">— aucun —</SelectItem>
                  {(Object.keys(CATS) as CorpsMetierCle[]).map((k) => (
                    <SelectItem key={k} value={k}>
                      {CATS[k].label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs font-medium text-muted-foreground">Début</Label>
              <Input
                type="date"
                value={dateDebut}
                onChange={(e) => setDateDebut(e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs font-medium text-muted-foreground">Fin</Label>
              <Input
                type="date"
                value={dateFin}
                onChange={(e) => setDateFin(e.target.value)}
                disabled={estJalon}
              />
            </div>
          </div>

          <div className="flex items-center gap-2">
            <input
              id="dw-jalon"
              type="checkbox"
              checked={estJalon}
              onChange={(e) => setEstJalon(e.target.checked)}
              className="accent-primary"
            />
            <Label htmlFor="dw-jalon" className="text-sm">
              Jalon (point sans durée)
            </Label>
          </div>

          <div className="space-y-1">
            <Label className="text-xs font-medium text-muted-foreground">
              Avancement de la tâche
            </Label>
            <div className="flex items-center gap-3">
              <input
                type="range"
                min={0}
                max={100}
                step={5}
                value={avancement}
                onChange={(e) => setAvancement(+e.target.value)}
                className="flex-1 accent-primary"
              />
              <div className="flex items-center gap-1">
                <Input
                  type="number"
                  min={0}
                  max={100}
                  step={5}
                  value={avancement}
                  onChange={(e) =>
                    setAvancement(Math.max(0, Math.min(100, Number(e.target.value) || 0)))
                  }
                  className="w-16 text-right"
                />
                <span className="text-sm text-muted-foreground">%</span>
              </div>
            </div>
          </div>

          <div className="space-y-1">
            <Label className="text-xs font-medium text-muted-foreground">
              Enchaînement — dépend de
            </Label>
            <Select
              value={predecesseurId || 'aucun'}
              onValueChange={(v) => setPredecesseurId(v && v !== 'aucun' ? v : '')}
            >
              <SelectTrigger className="h-9">
                <SelectValue>
                  {(v) => {
                    if (!v || v === 'aucun') return '— aucune —';
                    const p = toutesTaches.find((x) => x.id === v);
                    return p?.libelle ?? String(v);
                  }}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="aucun">— aucune —</SelectItem>
                {toutesTaches
                  .filter((x) => x.id !== tache.id)
                  .map((x) => (
                    <SelectItem key={x.id} value={x.id}>
                      {x.libelle}
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
          </div>

          <div className="rounded-xl border bg-muted/30">
            <div className="flex items-center justify-between border-b px-4 py-2.5">
              <div className="text-sm font-semibold">Équipe & heures</div>
              <span className="rounded-full bg-background px-2 py-0.5 text-xs text-muted-foreground ring-1 ring-border">
                {tache.equipe.length} ouvrier{tache.equipe.length > 1 ? 's' : ''}
              </span>
            </div>
            <div className="px-4 py-2">
              <div className="grid grid-cols-[1fr_64px_64px_28px] gap-2 pb-1 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                <div>Ouvrier</div>
                <div className="text-right">Prévu</div>
                <div className="text-right">Réalisé</div>
                <div />
              </div>
              {tache.equipe.length === 0 ? (
                <div className="py-2 text-center text-xs text-muted-foreground">
                  {estJalon ? 'Jalon — pas d’heures' : 'Aucun ouvrier affecté'}
                </div>
              ) : (
                <div className="space-y-1.5">
                  {tache.equipe.map((w) => (
                    <div
                      key={w.id}
                      className="grid grid-cols-[1fr_64px_64px_28px] items-center gap-2"
                    >
                      <span
                        className="truncate text-sm"
                        title={w.utilisateurEmail ?? ''}
                      >
                        {w.utilisateurEmail ?? w.utilisateurId}
                      </span>
                      <Input
                        type="number"
                        min={0}
                        defaultValue={w.heuresPrevues}
                        onBlur={(e) =>
                          majHeures(w.id, +e.target.value || 0, w.heuresFaites ?? 0)
                        }
                        className="h-7 text-right"
                      />
                      <Input
                        type="number"
                        min={0}
                        defaultValue={w.heuresFaites}
                        onBlur={(e) =>
                          majHeures(w.id, w.heuresPrevues ?? 0, +e.target.value || 0)
                        }
                        className="h-7 text-right"
                      />
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        onClick={() => retirer(w.id)}
                        title="Retirer"
                        className="size-7 text-muted-foreground hover:text-rose-600"
                        disabled={pending}
                      >
                        <XIcon className="size-3.5" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}
              <div className="mt-2 flex items-center gap-2">
                <Select value={nouvelOuvrier} onValueChange={(v) => setNouvelOuvrier(v ?? '')}>
                  <SelectTrigger className="h-8 flex-1 text-xs">
                    <SelectValue placeholder="Ajouter un ouvrier…">
                      {(v) => {
                        if (!v) return null;
                        const o = ouvriers.find((x) => x.id === v);
                        return o?.email ?? null;
                      }}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {ouvriers
                      .filter((o) => !tache.equipe.some((e) => e.utilisateurId === o.id))
                      .map((o) => (
                        <SelectItem key={o.id} value={o.id}>
                          {o.email}
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
                <Button
                  type="button"
                  size="sm"
                  onClick={affecter}
                  disabled={pending || !nouvelOuvrier}
                >
                  + Affecter
                </Button>
              </div>
            </div>
            <div className="flex items-center justify-between border-t px-4 py-2.5 text-sm">
              <span className="text-muted-foreground">Total heures</span>
              <span>
                <span className="font-semibold text-primary">{heuresFaitesTotal}</span>{' '}
                <span className="text-muted-foreground">/ {heuresPrevuesTotal} h prévues</span>
              </span>
            </div>
          </div>

          <div className="space-y-1">
            <Label className="text-xs font-medium text-muted-foreground">Notes</Label>
            <Textarea
              rows={3}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Commentaires libres…"
            />
          </div>

          <div className="flex gap-2 pt-1">
            <Button
              type="button"
              variant="outline"
              onClick={supprimer}
              disabled={pending}
              className="border-rose-200 text-rose-600 hover:bg-rose-50"
            >
              Supprimer
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={onClose}
              disabled={pending}
              className="flex-1"
            >
              Annuler
            </Button>
            <Button type="button" onClick={enregistrer} disabled={pending} className="flex-1">
              {pending ? 'Enregistrement…' : 'Enregistrer'}
            </Button>
          </div>
        </div>
      </aside>
    </>
  );
}
