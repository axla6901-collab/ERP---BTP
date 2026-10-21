import 'server-only';

import { and, eq, gte, inArray, isNotNull, isNull, lte, or } from 'drizzle-orm';

import type { TenantTx } from '@/lib/db/with-tenant';
import { chantiers } from '@/db/schema/chantiers';
import { employes } from '@/db/schema/employes';
import {
  sirhAbsences,
  sirhCollaborateurs,
  sirhHeuresSup,
  sirhJoursFeries,
  sirhNotesFrais,
  sirhTypesAbsence,
  sirhVariablesPaie,
} from '@/db/schema/test-sirh';

import { ajouterJours, type IsoDate } from '../calendrier';
import { libelleChantier } from '../temps/controles';

import type {
  AbsencePourPaie,
  CleSource,
  HeuresSupPourPaie,
  NoteFraisPourPaie,
} from './generation';
import { bornesMois, type MoisPaie } from './periodes';

/**
 * Chargement des éléments validés à importer dans une période de paie — à
 * appeler DANS `withTenant`. Lecture directe (Drizzle) des tables des domaines
 * Absences et Notes de frais ; la logique de génération est pure
 * (`./generation.ts`).
 */

export type ElementsAImporter = {
  absences: AbsencePourPaie[];
  heuresSup: HeuresSupPourPaie[];
  notesFrais: NoteFraisPourPaie[];
  /** Fériés chômés globaux. */
  feries: IsoDate[];
  /** Fériés globaux + ceux du site, pour les collaborateurs rattachés à un site. */
  feriesParEmploye: Map<string, IsoDate[]>;
  /** Éléments déjà importés dans la période (idempotence). */
  existantes: CleSource[];
};

export async function chargerElementsAImporter(
  tx: TenantTx,
  periode: MoisPaie & { id: string },
): Promise<ElementsAImporter> {
  const { debut, fin } = bornesMois(periode);

  // Absences approuvées chevauchant le mois.
  const absences = await tx
    .select({
      id: sirhAbsences.id,
      employeId: sirhAbsences.employeId,
      dateDebut: sirhAbsences.dateDebut,
      dateFin: sirhAbsences.dateFin,
      demiJourneeDebut: sirhAbsences.demiJourneeDebut,
      demiJourneeFin: sirhAbsences.demiJourneeFin,
      duree: sirhAbsences.duree,
      typeLibelle: sirhTypesAbsence.libelle,
      typeCode: sirhTypesAbsence.code,
      uniteDecompte: sirhTypesAbsence.uniteDecompte,
      codeRubriquePaie: sirhTypesAbsence.codeRubriquePaie,
    })
    .from(sirhAbsences)
    .innerJoin(sirhTypesAbsence, eq(sirhTypesAbsence.id, sirhAbsences.typeAbsenceId))
    .innerJoin(employes, eq(employes.id, sirhAbsences.employeId))
    .where(
      and(
        isNull(sirhAbsences.deletedAt),
        isNull(employes.deletedAt),
        eq(sirhAbsences.statut, 'approuvee'),
        lte(sirhAbsences.dateDebut, fin),
        gte(sirhAbsences.dateFin, debut),
      ),
    );

  // Heures sup. approuvées, compensées en paiement, datées du mois.
  const heuresSup = await tx
    .select({
      id: sirhHeuresSup.id,
      employeId: sirhHeuresSup.employeId,
      dateHeures: sirhHeuresSup.dateHeures,
      dureeHeures: sirhHeuresSup.dureeHeures,
      majorationPct: sirhHeuresSup.majorationPct,
      compensation: sirhHeuresSup.compensation,
      motif: sirhHeuresSup.motif,
      chantierNumero: chantiers.numero,
      chantierLibelle: chantiers.libelle,
    })
    .from(sirhHeuresSup)
    .innerJoin(employes, eq(employes.id, sirhHeuresSup.employeId))
    .leftJoin(chantiers, eq(chantiers.id, sirhHeuresSup.chantierId))
    .where(
      and(
        isNull(sirhHeuresSup.deletedAt),
        isNull(employes.deletedAt),
        eq(sirhHeuresSup.statut, 'approuvee'),
        eq(sirhHeuresSup.compensation, 'paiement'),
        gte(sirhHeuresSup.dateHeures, debut),
        lte(sirhHeuresSup.dateHeures, fin),
      ),
    );

  // Notes de frais approuvées non remboursées, jusqu'à la fin du mois, non
  // rattachées à une autre période.
  const notesFrais = await tx
    .select({
      id: sirhNotesFrais.id,
      employeId: sirhNotesFrais.employeId,
      dateDepense: sirhNotesFrais.dateDepense,
      libelle: sirhNotesFrais.libelle,
      categorie: sirhNotesFrais.categorie,
      montantTtc: sirhNotesFrais.montantTtc,
    })
    .from(sirhNotesFrais)
    .innerJoin(employes, eq(employes.id, sirhNotesFrais.employeId))
    .where(
      and(
        isNull(sirhNotesFrais.deletedAt),
        isNull(employes.deletedAt),
        eq(sirhNotesFrais.statut, 'approuvee'),
        isNull(sirhNotesFrais.dateRemboursement),
        lte(sirhNotesFrais.dateDepense, fin),
        or(isNull(sirhNotesFrais.periodePaieId), eq(sirhNotesFrais.periodePaieId, periode.id)),
      ),
    );

  // Fériés chômés du mois (+ 7 jours : samedi final des congés en jours ouvrables).
  const feriesRows = await tx
    .select({ date: sirhJoursFeries.dateFerie, siteId: sirhJoursFeries.siteId })
    .from(sirhJoursFeries)
    .where(
      and(
        isNull(sirhJoursFeries.deletedAt),
        eq(sirhJoursFeries.chome, true),
        gte(sirhJoursFeries.dateFerie, debut),
        lte(sirhJoursFeries.dateFerie, ajouterJours(fin, 7)),
      ),
    );
  const feries = feriesRows.filter((f) => f.siteId === null).map((f) => f.date);

  const employesAbsents = [...new Set(absences.map((a) => a.employeId))];
  const feriesParEmploye = new Map<string, IsoDate[]>();
  if (employesAbsents.length > 0 && feriesRows.some((f) => f.siteId !== null)) {
    const collaborateurs = await tx
      .select({ employeId: sirhCollaborateurs.employeId, siteId: sirhCollaborateurs.siteId })
      .from(sirhCollaborateurs)
      .where(
        and(
          isNull(sirhCollaborateurs.deletedAt),
          inArray(sirhCollaborateurs.employeId, employesAbsents),
        ),
      );
    for (const c of collaborateurs) {
      if (!c.siteId) continue;
      feriesParEmploye.set(c.employeId, [
        ...feries,
        ...feriesRows.filter((f) => f.siteId === c.siteId).map((f) => f.date),
      ]);
    }
  }

  const existantes = await tx
    .select({ source: sirhVariablesPaie.source, sourceId: sirhVariablesPaie.sourceId })
    .from(sirhVariablesPaie)
    .where(
      and(
        eq(sirhVariablesPaie.periodeId, periode.id),
        isNull(sirhVariablesPaie.deletedAt),
        isNotNull(sirhVariablesPaie.sourceId),
      ),
    );

  return {
    absences,
    heuresSup: heuresSup.map((h) => ({
      id: h.id,
      employeId: h.employeId,
      dateHeures: h.dateHeures,
      dureeHeures: h.dureeHeures,
      majorationPct: h.majorationPct,
      compensation: h.compensation,
      motif: h.motif,
      chantierLabel: libelleChantier(h.chantierNumero, h.chantierLibelle),
    })),
    notesFrais,
    feries,
    feriesParEmploye,
    existantes,
  };
}
