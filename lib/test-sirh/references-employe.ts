import 'server-only';

import { and, count, eq, isNull, or, type SQL } from 'drizzle-orm';
import type { PgTable } from 'drizzle-orm/pg-core';

import type { CompteurReference } from '@/lib/common/references-suppression';
import type { TenantTx } from '@/lib/db/with-tenant';
import {
  sirhAbsences,
  sirhAttributionsMateriel,
  sirhBadgeages,
  sirhCandidats,
  sirhCollaborateurs,
  sirhCompteurs,
  sirhContrats,
  sirhDocuments,
  sirhEntretiens,
  sirhEquipeMembres,
  sirhEquipes,
  sirhHeuresSup,
  sirhInscriptionsFormation,
  sirhNotesFrais,
  sirhObjectifs,
  sirhOffres,
  sirhProcessus,
  sirhTaches,
  sirhVariablesPaie,
} from '@/db/schema/test-sirh';

/**
 * Références d'un employé dans le module Test SIRH, pour le garde-fou de
 * suppression de la fiche employé (module RH, `supprimerEmploye`) — règle
 * générale de suppression référentielle : le soft-delete ne déclenche aucune
 * FK, il faut compter explicitement (hors colonnes d'audit).
 *
 * Toutes les références métier comptent, `restrict` comme `set null`
 * (manager, responsable d'équipe, évaluateur…). À appeler dans `withTenant`.
 */
export async function compterReferencesSirhEmploye(
  tx: TenantTx,
  employeId: string,
): Promise<CompteurReference[]> {
  async function compter(table: PgTable, condition: SQL | undefined): Promise<number> {
    const [row] = await tx.select({ n: count() }).from(table).where(condition);
    return row?.n ?? 0;
  }

  const [
    dossiers,
    contrats,
    equipes,
    absences,
    compteurs,
    temps,
    heuresSup,
    frais,
    paie,
    entretiens,
    objectifs,
    formations,
    processus,
    taches,
    materiel,
    documents,
    recrutement,
  ] = await Promise.all([
    compter(
      sirhCollaborateurs,
      and(
        isNull(sirhCollaborateurs.deletedAt),
        or(
          eq(sirhCollaborateurs.employeId, employeId),
          eq(sirhCollaborateurs.managerId, employeId),
        ),
      ),
    ),
    compter(
      sirhContrats,
      and(isNull(sirhContrats.deletedAt), eq(sirhContrats.employeId, employeId)),
    ),
    Promise.all([
      compter(
        sirhEquipeMembres,
        and(isNull(sirhEquipeMembres.deletedAt), eq(sirhEquipeMembres.employeId, employeId)),
      ),
      compter(
        sirhEquipes,
        and(isNull(sirhEquipes.deletedAt), eq(sirhEquipes.responsableId, employeId)),
      ),
    ]).then(([a, b]) => a + b),
    compter(
      sirhAbsences,
      and(isNull(sirhAbsences.deletedAt), eq(sirhAbsences.employeId, employeId)),
    ),
    compter(
      sirhCompteurs,
      and(isNull(sirhCompteurs.deletedAt), eq(sirhCompteurs.employeId, employeId)),
    ),
    compter(
      sirhBadgeages,
      and(isNull(sirhBadgeages.deletedAt), eq(sirhBadgeages.employeId, employeId)),
    ),
    compter(
      sirhHeuresSup,
      and(isNull(sirhHeuresSup.deletedAt), eq(sirhHeuresSup.employeId, employeId)),
    ),
    compter(
      sirhNotesFrais,
      and(isNull(sirhNotesFrais.deletedAt), eq(sirhNotesFrais.employeId, employeId)),
    ),
    compter(
      sirhVariablesPaie,
      and(isNull(sirhVariablesPaie.deletedAt), eq(sirhVariablesPaie.employeId, employeId)),
    ),
    compter(
      sirhEntretiens,
      and(
        isNull(sirhEntretiens.deletedAt),
        or(eq(sirhEntretiens.employeId, employeId), eq(sirhEntretiens.evaluateurId, employeId)),
      ),
    ),
    compter(
      sirhObjectifs,
      and(isNull(sirhObjectifs.deletedAt), eq(sirhObjectifs.employeId, employeId)),
    ),
    compter(
      sirhInscriptionsFormation,
      and(
        isNull(sirhInscriptionsFormation.deletedAt),
        eq(sirhInscriptionsFormation.employeId, employeId),
      ),
    ),
    compter(
      sirhProcessus,
      and(isNull(sirhProcessus.deletedAt), eq(sirhProcessus.employeId, employeId)),
    ),
    compter(sirhTaches, and(isNull(sirhTaches.deletedAt), eq(sirhTaches.employeId, employeId))),
    compter(
      sirhAttributionsMateriel,
      and(
        isNull(sirhAttributionsMateriel.deletedAt),
        eq(sirhAttributionsMateriel.employeId, employeId),
      ),
    ),
    compter(
      sirhDocuments,
      and(isNull(sirhDocuments.deletedAt), eq(sirhDocuments.employeId, employeId)),
    ),
    Promise.all([
      compter(
        sirhCandidats,
        and(isNull(sirhCandidats.deletedAt), eq(sirhCandidats.employeId, employeId)),
      ),
      compter(
        sirhOffres,
        and(isNull(sirhOffres.deletedAt), eq(sirhOffres.responsableId, employeId)),
      ),
    ]).then(([a, b]) => a + b),
  ]);

  return [
    { nombre: dossiers, singulier: 'dossier SIRH', pluriel: 'dossiers SIRH' },
    { nombre: contrats, singulier: 'contrat', pluriel: 'contrats' },
    { nombre: equipes, singulier: "lien d'équipe", pluriel: "liens d'équipe" },
    { nombre: absences, singulier: 'absence', pluriel: 'absences' },
    { nombre: compteurs, singulier: "compteur d'absence", pluriel: "compteurs d'absence" },
    { nombre: temps, singulier: 'badgeage', pluriel: 'badgeages' },
    { nombre: heuresSup, singulier: "demande d'heures sup.", pluriel: "demandes d'heures sup." },
    { nombre: frais, singulier: 'note de frais', pluriel: 'notes de frais' },
    { nombre: paie, singulier: 'variable de paie', pluriel: 'variables de paie' },
    { nombre: entretiens, singulier: 'entretien', pluriel: 'entretiens' },
    { nombre: objectifs, singulier: 'objectif', pluriel: 'objectifs' },
    {
      nombre: formations,
      singulier: 'inscription en formation',
      pluriel: 'inscriptions en formation',
    },
    { nombre: processus, singulier: "processus d'onboarding", pluriel: "processus d'onboarding" },
    { nombre: taches, singulier: 'tâche RH', pluriel: 'tâches RH' },
    { nombre: materiel, singulier: 'remise de matériel', pluriel: 'remises de matériel' },
    { nombre: documents, singulier: 'document RH', pluriel: 'documents RH' },
    { nombre: recrutement, singulier: 'lien de recrutement', pluriel: 'liens de recrutement' },
  ];
}
