import 'server-only';

import { eq } from 'drizzle-orm';

import {
  corpsEtat,
  corpsEtatDocumentsRequis,
  naturesDocument,
} from '@/db/schema/referentiel-tiers';
import type { withTenant } from '@/lib/db/with-tenant';

import {
  CORPS_ETAT_DEFAUT as CORPS_ETAT,
  MATRICE_REQUIS_DEFAUT as MATRICE_REQUIS,
  NATURES_DOCUMENT_DEFAUT as NATURES_DOCUMENT,
} from './referentiel-defaut';

/**
 * Référentiel documentaire par défaut du module Référencement & Agrément des
 * tiers, issu de la spec FEB_Contrôle Artisans (§II — Tables 4 et 5).
 *
 * Ces tables sont tenant-scopées (entreprise_id + RLS) : le seed se fait donc
 * par entreprise à l'activation du module (`setTiersReferencementActive`), pas
 * dans une migration. Le contenu reste éditable plus tard via l'écran
 * d'administration du référentiel (hors périmètre de cette livraison).
 * Les données sont dans `./referentiel-defaut` (module pur, réutilisé par les scripts).
 */

type Tx = Parameters<Parameters<typeof withTenant>[1]>[0];

/**
 * Seede le référentiel par défaut pour une entreprise. **Idempotent** : ne fait
 * rien si l'entreprise possède déjà au moins une nature de document.
 * À appeler à l'intérieur d'un `withTenant(entrepriseId, …)`.
 */
export async function seederReferentielTiers(
  tx: Tx,
  entrepriseId: string,
  userId: string,
): Promise<{ seede: boolean }> {
  const existant = await tx
    .select({ id: naturesDocument.id })
    .from(naturesDocument)
    .where(eq(naturesDocument.entrepriseId, entrepriseId))
    .limit(1);
  if (existant.length > 0) return { seede: false };

  const naturesInserees = await tx
    .insert(naturesDocument)
    .values(
      NATURES_DOCUMENT.map((n) => ({
        entrepriseId,
        code: n.code,
        libelle: n.libelle,
        modeControle: n.modeControle,
        delaiValiditeJours: n.delaiValiditeJours,
        delaiRelanceJours: n.delaiRelanceJours,
        ordreAffichage: n.ordre,
        createdBy: userId,
        updatedBy: userId,
      })),
    )
    .returning({ id: naturesDocument.id, code: naturesDocument.code });
  const natureIdParCode = new Map(naturesInserees.map((n) => [n.code, n.id]));

  const corpsInseres = await tx
    .insert(corpsEtat)
    .values(
      CORPS_ETAT.map((c) => ({
        entrepriseId,
        code: c.code,
        libelle: c.libelle,
        ordreAffichage: c.ordre,
        createdBy: userId,
        updatedBy: userId,
      })),
    )
    .returning({ id: corpsEtat.id, code: corpsEtat.code });
  const corpsIdParCode = new Map(corpsInseres.map((c) => [c.code, c.id]));

  const lignesRequis = MATRICE_REQUIS.flatMap((m) => {
    const corpsId = corpsIdParCode.get(m.corps);
    if (!corpsId) return [];
    return m.natures.flatMap((nature) =>
      m.docs.flatMap((docCode) => {
        const natureDocumentId = natureIdParCode.get(docCode);
        if (!natureDocumentId) return [];
        return [
          {
            entrepriseId,
            corpsEtatId: corpsId,
            natureDocumentId,
            natureTiers: nature,
            estBloquant: true,
            createdBy: userId,
            updatedBy: userId,
          },
        ];
      }),
    );
  });
  if (lignesRequis.length > 0) {
    await tx.insert(corpsEtatDocumentsRequis).values(lignesRequis);
  }

  return { seede: true };
}
