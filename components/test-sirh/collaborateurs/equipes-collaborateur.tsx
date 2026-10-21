import Link from 'next/link';

import { SirhVide } from '@/components/test-sirh/sirh-bloc';
import { PastilleCouleur } from '@/components/test-sirh/statut-badges';
import { Badge, type BadgeTone } from '@/components/ui/badge';
import { formatDateFr } from '@/lib/test-sirh/format';
import {
  LIBELLES_STATUT_MEMBRE,
  statutMembre,
  type StatutMembre,
} from '@/lib/test-sirh/organisation/membres';

export type EquipeCollaborateurUI = {
  membreId: string;
  equipeId: string;
  nom: string;
  couleur: string;
  equipeActive: boolean;
  siteNom: string | null;
  estResponsable: boolean;
  dateDebut: string | null;
  dateFin: string | null;
};

const TON: Record<StatutMembre, BadgeTone> = {
  a_venir: 'sky',
  actif: 'emerald',
  termine: 'neutral',
};

function periode(e: { dateDebut: string | null; dateFin: string | null }): string | null {
  if (e.dateDebut && e.dateFin) return `${formatDateFr(e.dateDebut)} → ${formatDateFr(e.dateFin)}`;
  if (e.dateDebut) return `depuis le ${formatDateFr(e.dateDebut)}`;
  if (e.dateFin) return `jusqu’au ${formatDateFr(e.dateFin)}`;
  return null;
}

/**
 * Équipes du collaborateur (appartenances en vigueur d'abord, historique
 * ensuite). Server-compatible ; la gestion des membres se fait depuis
 * Organisation › Équipes (`lienEquipes`).
 */
export function EquipesCollaborateur({
  equipes,
  today,
  lienEquipes,
}: {
  equipes: readonly EquipeCollaborateurUI[];
  today: string;
  lienEquipes?: string;
}) {
  if (equipes.length === 0) {
    return <SirhVide>Membre d’aucune équipe.</SirhVide>;
  }
  const ordre: Record<StatutMembre, number> = { actif: 0, a_venir: 1, termine: 2 };
  const triees = [...equipes].sort(
    (a, b) =>
      ordre[statutMembre(a, today)] - ordre[statutMembre(b, today)] ||
      a.nom.localeCompare(b.nom, 'fr'),
  );
  return (
    <div className="space-y-3">
      <ul className="divide-y rounded-md border">
        {triees.map((e) => {
          const statut = statutMembre(e, today);
          const p = periode(e);
          return (
            <li
              key={e.membreId}
              className={`flex flex-wrap items-center justify-between gap-2 px-4 py-2.5 text-sm ${statut === 'termine' ? 'opacity-60' : ''}`}
            >
              <span className="flex min-w-0 flex-wrap items-center gap-2">
                <PastilleCouleur couleur={e.couleur} />
                <span className="font-medium">{e.nom}</span>
                {e.estResponsable && <Badge tone="amber">Responsable</Badge>}
                {!e.equipeActive && (
                  <span className="text-xs text-muted-foreground">(équipe inactive)</span>
                )}
                {e.siteNom && <span className="text-xs text-muted-foreground">· {e.siteNom}</span>}
              </span>
              <span className="flex items-center gap-2">
                {p && <span className="text-xs tabular-nums text-muted-foreground">{p}</span>}
                <Badge tone={TON[statut]} shape="pill">
                  {LIBELLES_STATUT_MEMBRE[statut]}
                </Badge>
              </span>
            </li>
          );
        })}
      </ul>
      {lienEquipes && (
        <Link
          href={lienEquipes}
          className="inline-block text-xs text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
        >
          Gérer les équipes ›
        </Link>
      )}
    </div>
  );
}
