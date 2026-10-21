import { SirhVide } from '@/components/test-sirh/sirh-bloc';
import { Badge } from '@/components/ui/badge';
import { formatDateFr } from '@/lib/test-sirh/format';
import type { MaterielEmployeLigne } from '@/lib/test-sirh/materiel/queries';
import { LIBELLES_CATEGORIE_MATERIEL } from '@/lib/validation/test-sirh/enums';

import { ControleMateriel } from './badges-materiel';

/**
 * Matériel & EPI remis à un salarié (dossier collaborateur) : en cours puis
 * restitués, avec décharge et date de contrôle. Lecture seule, server-compatible.
 */
export function MaterielEmployeListe({
  lignes,
  today,
  emptyMessage = 'Aucun matériel remis à ce collaborateur.',
}: {
  /** `listerMaterielEmploye(employeId)`. */
  lignes: readonly MaterielEmployeLigne[];
  /** Date du jour (serveur) pour les alertes de contrôle. */
  today: string;
  emptyMessage?: string;
}) {
  if (lignes.length === 0) return <SirhVide>{emptyMessage}</SirhVide>;

  return (
    <div className="overflow-x-auto rounded-md border">
      <table className="w-full text-sm">
        <thead className="bg-muted/40 text-left text-xs uppercase tracking-widest text-muted-foreground">
          <tr>
            <th className="px-4 py-2 font-medium">Matériel</th>
            <th className="px-4 py-2 font-medium">Catégorie</th>
            <th className="px-4 py-2 font-medium">Remis le</th>
            <th className="px-4 py-2 font-medium">Restitué le</th>
            <th className="px-4 py-2 font-medium">Décharge</th>
            <th className="px-4 py-2 font-medium">Contrôle</th>
          </tr>
        </thead>
        <tbody className="divide-y">
          {lignes.map((l) => (
            <tr
              key={l.attributionId}
              className={l.dateRetour ? 'text-muted-foreground' : undefined}
            >
              <td className="px-4 py-2">
                <span className="block font-medium">{l.libelle}</span>
                <span className="block text-xs text-muted-foreground">
                  {[
                    [l.marque, l.modele].filter(Boolean).join(' ') || null,
                    l.numeroSerie ? `n° ${l.numeroSerie}` : null,
                    l.taille ? `taille ${l.taille}` : null,
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                </span>
              </td>
              <td className="px-4 py-2">{LIBELLES_CATEGORIE_MATERIEL[l.categorie]}</td>
              <td className="px-4 py-2 tabular-nums">
                {formatDateFr(l.dateRemise)}
                {l.etatRemise && <span className="block text-xs">{l.etatRemise}</span>}
              </td>
              <td className="px-4 py-2 tabular-nums">
                {l.dateRetour ? (
                  <>
                    {formatDateFr(l.dateRetour)}
                    {l.etatRetour && <span className="block text-xs">{l.etatRetour}</span>}
                  </>
                ) : (
                  <Badge tone="emerald">En sa possession</Badge>
                )}
              </td>
              <td className="px-4 py-2">
                {l.dechargeSignee ? (
                  <Badge tone="emerald" shape="pill">
                    Signée
                  </Badge>
                ) : (
                  <Badge tone="amber" shape="pill">
                    Non signée
                  </Badge>
                )}
              </td>
              <td className="px-4 py-2">
                {l.dateRetour ? (
                  <span className="text-muted-foreground">—</span>
                ) : (
                  <ControleMateriel
                    dateControle={l.dateControle}
                    today={today}
                    statut={l.statutMateriel}
                  />
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
