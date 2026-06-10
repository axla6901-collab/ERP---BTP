import 'server-only';

import { and, asc, eq, inArray, isNull } from 'drizzle-orm';

import { chantierTaches, chantiers } from '@/db/schema/chantiers';
import { employes } from '@/db/schema/employes';
import { withTenant } from '@/lib/db/with-tenant';
import type { PointageRefs, RefEmploye } from '@/lib/pwa/types';

export type { PointageRefs, RefEmploye, RefChantier, RefTache } from '@/lib/pwa/types';

/**
 * Données de référence minimales pour la saisie terrain (M5.5) : employés
 * actifs, chantiers EN COURS, et tâches non supprimées de ces chantiers.
 * Partagé entre la page serveur (rendu initial) et la route GET
 * /api/v1/pointage-refs (rafraîchissement + cache SW). Tenant-scopé via RLS.
 */
export async function chargerPointageRefs(entrepriseId: string): Promise<PointageRefs> {
  return withTenant(entrepriseId, async (tx) => {
    const [employesActifs, chantiersEnCours] = await Promise.all([
      tx
        .select({
          id: employes.id,
          nom: employes.nom,
          prenom: employes.prenom,
          zoneDeplacementDefaut: employes.zoneDeplacementDefaut,
        })
        .from(employes)
        .where(and(isNull(employes.deletedAt), eq(employes.actif, true)))
        .orderBy(asc(employes.nom), asc(employes.prenom)),
      tx
        .select({
          id: chantiers.id,
          numero: chantiers.numero,
          libelle: chantiers.libelle,
        })
        .from(chantiers)
        .where(and(isNull(chantiers.deletedAt), eq(chantiers.statut, 'en_cours')))
        .orderBy(asc(chantiers.numero)),
    ]);

    const chantierIds = chantiersEnCours.map((c) => c.id);
    const taches =
      chantierIds.length > 0
        ? await tx
            .select({
              id: chantierTaches.id,
              chantierId: chantierTaches.chantierId,
              libelle: chantierTaches.libelle,
            })
            .from(chantierTaches)
            .where(
              and(
                isNull(chantierTaches.deletedAt),
                inArray(chantierTaches.chantierId, chantierIds),
              ),
            )
            .orderBy(asc(chantierTaches.chantierId), asc(chantierTaches.ordre))
        : [];

    return {
      employes: employesActifs as RefEmploye[],
      chantiers: chantiersEnCours,
      taches,
    };
  });
}
