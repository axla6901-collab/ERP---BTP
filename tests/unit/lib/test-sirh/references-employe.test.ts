import { describe, expect, it } from 'vitest';

import { messageBlocageSuppression } from '@/lib/common/references-suppression';
import type { TenantTx } from '@/lib/db/with-tenant';
import {
  sirhAbsences,
  sirhCandidats,
  sirhCollaborateurs,
  sirhContrats,
  sirhEquipeMembres,
  sirhEquipes,
  sirhNotesFrais,
  sirhOffres,
} from '@/db/schema/test-sirh';
import { compterReferencesSirhEmploye } from '@/lib/test-sirh/references-employe';

/** Transaction simulée : `select().from(table).where()` → `[{ n }]` selon la table. */
function txSimulee(comptes: Map<unknown, number>): TenantTx {
  return {
    select: () => ({
      from: (table: unknown) => ({
        where: () => Promise.resolve([{ n: comptes.get(table) ?? 0 }]),
      }),
    }),
  } as unknown as TenantTx;
}

const EMPLOYE = '3f2b8c1e-6d4a-4e7b-9a1c-2b3c4d5e6f70';

describe('compterReferencesSirhEmploye', () => {
  it('aucune donnée SIRH → aucun blocage', async () => {
    const compteurs = await compterReferencesSirhEmploye(txSimulee(new Map()), EMPLOYE);
    expect(compteurs).toHaveLength(17);
    expect(messageBlocageSuppression('cet employé', compteurs)).toBeNull();
  });

  it('agrège les tables d’un même libellé et alimente le message de blocage', async () => {
    const comptes = new Map<unknown, number>([
      [sirhCollaborateurs, 1],
      [sirhContrats, 2],
      [sirhEquipeMembres, 1],
      [sirhEquipes, 1], // responsable d'équipe → même libellé que l'appartenance
      [sirhAbsences, 3],
      [sirhNotesFrais, 1],
      [sirhCandidats, 1],
      [sirhOffres, 1], // responsable d'offre → libellé « lien de recrutement »
    ]);
    const compteurs = await compterReferencesSirhEmploye(txSimulee(comptes), EMPLOYE);
    const parLibelle = new Map(compteurs.map((c) => [c.singulier, c.nombre]));
    expect(parLibelle.get('dossier SIRH')).toBe(1);
    expect(parLibelle.get('contrat')).toBe(2);
    expect(parLibelle.get("lien d'équipe")).toBe(2);
    expect(parLibelle.get('absence')).toBe(3);
    expect(parLibelle.get('lien de recrutement')).toBe(2);
    expect(messageBlocageSuppression('cet employé', compteurs)).toBe(
      "Suppression impossible : cet employé est référencé par 1 dossier SIRH, 2 contrats, 2 liens d'équipe, " +
        '3 absences, 1 note de frais et 2 liens de recrutement. ' +
        "Désactivez-le plutôt si vous ne l'utilisez plus.",
    );
  });
});
