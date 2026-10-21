import Link from 'next/link';

import { StatutEcheanceBadge } from '@/components/test-sirh/entretiens/badges';
import { StatutQualificationBadge } from '@/components/test-sirh/formation/badges';
import { PastilleCouleur } from '@/components/test-sirh/statut-badges';
import { SirhVide } from '@/components/test-sirh/sirh-bloc';
import type { AbsentDuJour } from '@/lib/test-sirh/absences/types';
import type { SuiviEntretienProLigne } from '@/lib/test-sirh/entretiens/queries';
import type { QualificationLigne } from '@/lib/test-sirh/formation/queries';
import { formatDateFr } from '@/lib/test-sirh/format';

/**
 * Listes d'alertes compactes du tableau de bord Test SIRH (server-compatibles).
 * Chaque liste est tronquée à `limite` lignes avec un lien « Voir tout ».
 */

function VoirTout({ href, reste }: { href: string; reste: number }) {
  return (
    <Link href={href} className="block pt-2 text-xs text-amber-700 hover:underline">
      {reste > 0 ? `Voir les ${reste} autres →` : 'Voir tout →'}
    </Link>
  );
}

export function AbsentsDuJourListe({
  absents,
  lienCalendrier,
  limite = 8,
}: {
  absents: readonly AbsentDuJour[];
  lienCalendrier: string;
  limite?: number;
}) {
  if (absents.length === 0) return <SirhVide>Personne n’est absent aujourd’hui.</SirhVide>;
  return (
    <div>
      <ul className="divide-y text-sm">
        {absents.slice(0, limite).map((a) => (
          <li key={a.absenceId} className="flex items-center justify-between gap-2 py-1.5">
            <span className="flex min-w-0 items-center gap-2">
              <PastilleCouleur couleur={a.couleur} />
              <span className="truncate font-medium">{a.employe}</span>
            </span>
            <span className="shrink-0 text-xs text-muted-foreground">
              {a.typeLibelle}
              {a.demiJournee === 'matin' ? ' · matin' : ''}
              {a.demiJournee === 'apres_midi' ? ' · après-midi' : ''}
              {a.dateFin !== a.dateDebut ? ` · jusqu'au ${formatDateFr(a.dateFin)}` : ''}
            </span>
          </li>
        ))}
      </ul>
      <VoirTout href={lienCalendrier} reste={Math.max(0, absents.length - limite)} />
    </div>
  );
}

export function RecyclagesListe({
  qualifications,
  lien,
  limite = 6,
}: {
  qualifications: readonly QualificationLigne[];
  lien: string;
  limite?: number;
}) {
  if (qualifications.length === 0) {
    return <SirhVide>Aucune habilitation à recycler dans les 90 jours.</SirhVide>;
  }
  return (
    <div>
      <ul className="divide-y text-sm">
        {qualifications.slice(0, limite).map((q) => (
          <li key={q.inscriptionId} className="flex items-center justify-between gap-2 py-1.5">
            <span className="min-w-0">
              <span className="block truncate font-medium">{q.employeNom}</span>
              <span className="block truncate text-xs text-muted-foreground">
                {q.formationIntitule}
                {q.dateValidite ? ` · échéance ${formatDateFr(q.dateValidite)}` : ''}
              </span>
            </span>
            <StatutQualificationBadge statut={q.statut} />
          </li>
        ))}
      </ul>
      <VoirTout href={lien} reste={Math.max(0, qualifications.length - limite)} />
    </div>
  );
}

export function EntretiensProEnRetardListe({
  lignes,
  lien,
  limite = 6,
}: {
  lignes: readonly SuiviEntretienProLigne[];
  lien: string;
  limite?: number;
}) {
  if (lignes.length === 0) {
    return <SirhVide>Tous les entretiens professionnels sont à jour.</SirhVide>;
  }
  return (
    <div>
      <ul className="divide-y text-sm">
        {lignes.slice(0, limite).map((l) => (
          <li key={l.employeId} className="flex items-center justify-between gap-2 py-1.5">
            <span className="min-w-0">
              <span className="block truncate font-medium">{l.employeNom}</span>
              <span className="block truncate text-xs text-muted-foreground">
                {l.dernierEntretien
                  ? `dernier le ${formatDateFr(l.dernierEntretien)}`
                  : 'aucun entretien réalisé'}
                {l.prochaineEcheance ? ` · échéance ${formatDateFr(l.prochaineEcheance)}` : ''}
              </span>
            </span>
            <StatutEcheanceBadge statut={l.statut} />
          </li>
        ))}
      </ul>
      <VoirTout href={lien} reste={Math.max(0, lignes.length - limite)} />
    </div>
  );
}
