import { formatAnciennete, formatDateFr } from '@/lib/test-sirh/format';
import type { MonProfil } from '@/lib/test-sirh/mon-espace/queries';
import { LIBELLES_TYPE_CONTRAT } from '@/lib/validation/test-sirh/enums';

/**
 * Carte « Mon profil » de Mon espace (server-compatible, sans hook) : poste,
 * site, manager, ancienneté et contrat en cours — jamais de rémunération.
 */

function Ligne({ libelle, valeur }: { libelle: string; valeur: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-3 py-1.5 text-sm">
      <dt className="text-muted-foreground">{libelle}</dt>
      <dd className="text-right font-medium">{valeur}</dd>
    </div>
  );
}

export function MonProfilCarte({ profil, today }: { profil: MonProfil; today: string }) {
  return (
    <dl className="divide-y">
      <Ligne libelle="Matricule" valeur={profil.matricule ?? '—'} />
      <Ligne libelle="Poste" valeur={profil.poste ?? '—'} />
      <Ligne libelle="Site" valeur={profil.site ?? '—'} />
      <Ligne libelle="Manager" valeur={profil.manager ?? '—'} />
      <Ligne
        libelle="Ancienneté"
        valeur={
          profil.dateEntree
            ? `${formatAnciennete(profil.dateEntree, today)} (depuis le ${formatDateFr(profil.dateEntree)})`
            : '—'
        }
      />
      <Ligne
        libelle="Contrat"
        valeur={
          profil.contrat
            ? `${LIBELLES_TYPE_CONTRAT[profil.contrat.typeContrat]}${
                profil.contrat.dateFin ? ` jusqu'au ${formatDateFr(profil.contrat.dateFin)}` : ''
              }`
            : '—'
        }
      />
    </dl>
  );
}
