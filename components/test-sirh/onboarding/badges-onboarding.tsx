import { Badge, type BadgeTone } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import {
  LIBELLES_RESPONSABLE_TACHE,
  LIBELLES_STATUT_PROCESSUS,
  LIBELLES_STATUT_TACHE,
  type ResponsableTache,
  type StatutProcessus,
  type StatutTache,
  type TypeProcessus,
} from '@/lib/validation/test-sirh/enums';

/**
 * Badges et barre de progression de la rubrique Onboarding (server-compatible).
 * Classes Tailwind littérales ; largeur dynamique via `style`.
 */

/** Libellés courts des types de processus (badges, filtres). */
export const LIBELLES_COURTS_TYPE_PROCESSUS: Record<TypeProcessus, string> = {
  onboarding: 'Onboarding',
  offboarding: 'Offboarding',
  mobilite: 'Mobilité',
  autre: 'Autre',
};

export const TON_TYPE_PROCESSUS: Record<TypeProcessus, BadgeTone> = {
  onboarding: 'sky',
  offboarding: 'violet',
  mobilite: 'indigo',
  autre: 'neutral',
};

export const TON_STATUT_PROCESSUS: Record<StatutProcessus, BadgeTone> = {
  en_cours: 'amber',
  termine: 'emerald',
  annule: 'slate',
};

export const TON_STATUT_TACHE: Record<StatutTache, BadgeTone> = {
  a_faire: 'neutral',
  en_cours: 'amber',
  faite: 'emerald',
  annulee: 'slate',
};

export const TON_RESPONSABLE_TACHE: Record<ResponsableTache, BadgeTone> = {
  rh: 'orange',
  manager: 'sky',
  salarie: 'violet',
  it: 'indigo',
  autre: 'neutral',
};

export function TypeProcessusBadge({ type }: { type: TypeProcessus }) {
  return <Badge tone={TON_TYPE_PROCESSUS[type]}>{LIBELLES_COURTS_TYPE_PROCESSUS[type]}</Badge>;
}

export function StatutProcessusBadge({ statut }: { statut: StatutProcessus }) {
  return (
    <Badge tone={TON_STATUT_PROCESSUS[statut]} shape="pill">
      {LIBELLES_STATUT_PROCESSUS[statut]}
    </Badge>
  );
}

export function StatutTacheBadge({ statut }: { statut: StatutTache }) {
  return <Badge tone={TON_STATUT_TACHE[statut]}>{LIBELLES_STATUT_TACHE[statut]}</Badge>;
}

export function ResponsableBadge({ responsable }: { responsable: ResponsableTache }) {
  return (
    <Badge tone={TON_RESPONSABLE_TACHE[responsable]}>
      {LIBELLES_RESPONSABLE_TACHE[responsable]}
    </Badge>
  );
}

/** Barre de progression des tâches (faites / à réaliser). */
export function BarreProgression({
  faites,
  total,
  pourcent,
  className,
}: {
  faites: number;
  total: number;
  pourcent: number;
  className?: string;
}) {
  const borne = Math.max(0, Math.min(100, pourcent));
  return (
    <div className={cn('space-y-1', className)}>
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span className="tabular-nums">
          {faites}/{total} tâche{total > 1 ? 's' : ''}
        </span>
        <span className="tabular-nums">{borne} %</span>
      </div>
      <div
        className="h-1.5 w-full overflow-hidden rounded-full bg-muted"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={borne}
        aria-label="Avancement des tâches"
      >
        <div
          className={cn('h-full rounded-full', borne === 100 ? 'bg-emerald-500' : 'bg-amber-500')}
          style={{ width: `${borne}%` }}
        />
      </div>
    </div>
  );
}
