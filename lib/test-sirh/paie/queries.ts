import 'server-only';

import { and, asc, count, desc, eq, inArray, isNull, sql } from 'drizzle-orm';

import { withTenant, type TenantTx } from '@/lib/db/with-tenant';
import { employes } from '@/db/schema/employes';
import {
  sirhAbsences,
  sirhHeuresSup,
  sirhNotesFrais,
  sirhPeriodesPaie,
  sirhVariablesPaie,
} from '@/db/schema/test-sirh';
import { utilisateurs } from '@/db/schema/utilisateurs';
import type {
  SourceVariable,
  StatutPeriodePaie,
  TypeVariablePaie,
} from '@/lib/validation/test-sirh/enums';

import { aujourdhuiIso } from '../calendrier';
import { exigerContexteSirhAction } from '../contexte';
import { versNombre } from '../format';
import { peutVoirPaieSirh, ROLES_SIRH_PAIE } from '../permissions';
import { estUuid } from '../temps/controles';

import { chargerElementsAImporter } from './elements-valides';
import {
  cleSource,
  genererVariablesPaie,
  variablesASourceObsolete,
  type SourceImport,
} from './generation';
import { memeMois, moisDeLaDate, periodeModifiable } from './periodes';
import {
  genererCsvPaie,
  syntheseParEmploye,
  totauxVariables,
  type LigneSynthese,
} from './synthese';

/**
 * Lectures — Test SIRH › Paie (`server-only`, rôles PAIE). Montants : colonnes
 * `numeric` en clair (aucun salaire chiffré n'est lu ici).
 */

export type PeriodePaieVue = {
  id: string;
  annee: number;
  mois: number;
  statut: StatutPeriodePaie;
  dateCloture: string | null;
  clotureParEmail: string | null;
  notes: string | null;
  nbVariables: number;
  nbEmployes: number;
  montantTotal: number;
};

type StatsPeriode = { nbVariables: number; nbEmployes: number; montantTotal: number };

async function statsParPeriode(tx: TenantTx): Promise<Map<string, StatsPeriode>> {
  const rows = await tx
    .select({
      periodeId: sirhVariablesPaie.periodeId,
      nbVariables: count(),
      nbEmployes: sql<number>`count(distinct ${sirhVariablesPaie.employeId})::int`,
      montantTotal: sql<string>`coalesce(sum(${sirhVariablesPaie.montant}), 0)`,
    })
    .from(sirhVariablesPaie)
    .where(isNull(sirhVariablesPaie.deletedAt))
    .groupBy(sirhVariablesPaie.periodeId);
  return new Map(
    rows.map((r) => [
      r.periodeId,
      {
        nbVariables: r.nbVariables,
        nbEmployes: Number(r.nbEmployes) || 0,
        montantTotal: versNombre(r.montantTotal) ?? 0,
      },
    ]),
  );
}

async function selectPeriodes(tx: TenantTx, id?: string): Promise<PeriodePaieVue[]> {
  const periodes = await tx
    .select({
      id: sirhPeriodesPaie.id,
      annee: sirhPeriodesPaie.annee,
      mois: sirhPeriodesPaie.mois,
      statut: sirhPeriodesPaie.statut,
      dateCloture: sirhPeriodesPaie.dateCloture,
      clotureParEmail: utilisateurs.email,
      notes: sirhPeriodesPaie.notes,
    })
    .from(sirhPeriodesPaie)
    .leftJoin(utilisateurs, eq(utilisateurs.id, sirhPeriodesPaie.cloturePar))
    .where(and(isNull(sirhPeriodesPaie.deletedAt), id ? eq(sirhPeriodesPaie.id, id) : undefined))
    .orderBy(desc(sirhPeriodesPaie.annee), desc(sirhPeriodesPaie.mois));
  const stats = await statsParPeriode(tx);
  return periodes.map((p) => ({
    ...p,
    dateCloture: p.dateCloture ? p.dateCloture.toISOString() : null,
    ...(stats.get(p.id) ?? { nbVariables: 0, nbEmployes: 0, montantTotal: 0 }),
  }));
}

/** Toutes les périodes, plus récentes d'abord, avec leurs compteurs. */
export async function listerPeriodesPaie(): Promise<PeriodePaieVue[]> {
  const ctx = await exigerContexteSirhAction(ROLES_SIRH_PAIE);
  return withTenant(ctx.entreprise.id, (tx) => selectPeriodes(tx));
}

/** Une période par id (null si absente ou supprimée). */
export async function lirePeriodePaie(id: string): Promise<PeriodePaieVue | null> {
  const ctx = await exigerContexteSirhAction(ROLES_SIRH_PAIE);
  if (!estUuid(id)) return null;
  const [periode] = await withTenant(ctx.entreprise.id, (tx) => selectPeriodes(tx, id));
  return periode ?? null;
}

export type VariablePaieVue = {
  id: string;
  periodeId: string;
  employeId: string;
  employeNom: string;
  employePrenom: string;
  matricule: string | null;
  typeVariable: TypeVariablePaie;
  libelle: string;
  codeRubrique: string | null;
  quantite: string | null;
  montant: string | null;
  source: SourceVariable;
  sourceId: string | null;
  commentaire: string | null;
  /** Majoration de la demande d'heures sup. d'origine (import), sinon null. */
  majorationPct: number | null;
  /** Variable importée dont l'élément d'origine n'est plus valide (annulé, refusé, supprimé). */
  sourceObsolete: boolean;
};

/**
 * Clés `cleSource` des éléments d'origine encore valides : absence approuvée,
 * heures sup. approuvées payées, note de frais approuvée ou remboursée.
 */
async function sourcesEncoreValides(
  tx: TenantTx,
  variables: readonly { source: SourceVariable; sourceId: string | null }[],
): Promise<Set<string>> {
  const ids = (source: SourceVariable) => [
    ...new Set(
      variables
        .filter((v) => v.source === source && v.sourceId !== null)
        .map((v) => v.sourceId as string),
    ),
  ];
  const valides = new Set<string>();

  const absences = ids('absence');
  if (absences.length > 0) {
    const rows = await tx
      .select({ id: sirhAbsences.id })
      .from(sirhAbsences)
      .where(
        and(
          inArray(sirhAbsences.id, absences),
          isNull(sirhAbsences.deletedAt),
          eq(sirhAbsences.statut, 'approuvee'),
        ),
      );
    for (const r of rows) valides.add(cleSource('absence', r.id));
  }

  const heuresSup = ids('heures_sup');
  if (heuresSup.length > 0) {
    const rows = await tx
      .select({ id: sirhHeuresSup.id })
      .from(sirhHeuresSup)
      .where(
        and(
          inArray(sirhHeuresSup.id, heuresSup),
          isNull(sirhHeuresSup.deletedAt),
          eq(sirhHeuresSup.statut, 'approuvee'),
          eq(sirhHeuresSup.compensation, 'paiement'),
        ),
      );
    for (const r of rows) valides.add(cleSource('heures_sup', r.id));
  }

  const notes = ids('note_frais');
  if (notes.length > 0) {
    const rows = await tx
      .select({ id: sirhNotesFrais.id })
      .from(sirhNotesFrais)
      .where(
        and(
          inArray(sirhNotesFrais.id, notes),
          isNull(sirhNotesFrais.deletedAt),
          inArray(sirhNotesFrais.statut, ['approuvee', 'remboursee']),
        ),
      );
    for (const r of rows) valides.add(cleSource('note_frais', r.id));
  }
  return valides;
}

export type PreparationPaie = {
  periode: PeriodePaieVue;
  variables: VariablePaieVue[];
  synthese: LigneSynthese[];
  totaux: ReturnType<typeof totauxVariables>;
  /** Export CSV prêt à télécharger (matricule, nom, prénom, rubrique, libellé, quantité, montant). */
  csv: string;
  /** Aperçu de l'import des éléments validés (0 partout si la période est clôturée). */
  aImporter: Record<SourceImport, number>;
};

/** Préparation de paie d'une période : variables, synthèse, CSV et aperçu d'import. */
export async function chargerPreparationPaie(periodeId: string): Promise<PreparationPaie | null> {
  const ctx = await exigerContexteSirhAction(ROLES_SIRH_PAIE);
  if (!estUuid(periodeId)) return null;
  return withTenant(ctx.entreprise.id, async (tx) => {
    const [periode] = await selectPeriodes(tx, periodeId);
    if (!periode) return null;

    const rows = await tx
      .select({
        id: sirhVariablesPaie.id,
        periodeId: sirhVariablesPaie.periodeId,
        employeId: sirhVariablesPaie.employeId,
        employeNom: employes.nom,
        employePrenom: employes.prenom,
        matricule: employes.matricule,
        typeVariable: sirhVariablesPaie.typeVariable,
        libelle: sirhVariablesPaie.libelle,
        codeRubrique: sirhVariablesPaie.codeRubrique,
        quantite: sirhVariablesPaie.quantite,
        montant: sirhVariablesPaie.montant,
        source: sirhVariablesPaie.source,
        sourceId: sirhVariablesPaie.sourceId,
        commentaire: sirhVariablesPaie.commentaire,
        majorationPct: sirhHeuresSup.majorationPct,
      })
      .from(sirhVariablesPaie)
      .innerJoin(employes, eq(employes.id, sirhVariablesPaie.employeId))
      .leftJoin(
        sirhHeuresSup,
        and(
          eq(sirhVariablesPaie.source, 'heures_sup'),
          eq(sirhHeuresSup.id, sirhVariablesPaie.sourceId),
        ),
      )
      .where(and(eq(sirhVariablesPaie.periodeId, periodeId), isNull(sirhVariablesPaie.deletedAt)))
      .orderBy(
        asc(employes.nom),
        asc(employes.prenom),
        asc(sirhVariablesPaie.typeVariable),
        asc(sirhVariablesPaie.libelle),
      );
    const obsoletes = new Set(variablesASourceObsolete(rows, await sourcesEncoreValides(tx, rows)));
    const variables: VariablePaieVue[] = rows.map((r) => ({
      ...r,
      majorationPct: r.majorationPct ?? null,
      sourceObsolete: obsoletes.has(r.id),
    }));

    const employesSynthese = [
      ...new Map(
        variables.map((v) => [
          v.employeId,
          { id: v.employeId, nom: v.employeNom, prenom: v.employePrenom, matricule: v.matricule },
        ]),
      ).values(),
    ];

    let aImporter: Record<SourceImport, number> = { absence: 0, heures_sup: 0, note_frais: 0 };
    if (periodeModifiable(periode.statut)) {
      const elements = await chargerElementsAImporter(tx, periode);
      aImporter = genererVariablesPaie({ periode, ...elements }).parSource;
    }

    return {
      periode,
      variables,
      synthese: syntheseParEmploye(variables, employesSynthese),
      totaux: totauxVariables(variables),
      csv: genererCsvPaie(
        variables.map((v) => ({
          matricule: v.matricule,
          nom: v.employeNom,
          prenom: v.employePrenom,
          codeRubrique: v.codeRubrique,
          libelle: v.libelle,
          quantite: v.quantite,
          montant: v.montant,
        })),
      ),
      aImporter,
    };
  });
}

export type KpiPaie = {
  /** Période du mois en cours, sinon la plus récente non clôturée, sinon la plus récente. */
  periode: { id: string; annee: number; mois: number; statut: StatutPeriodePaie } | null;
  nbVariables: number;
  nbEmployes: number;
  montantTotal: number;
  nbPeriodesNonCloturees: number;
};

/** Tableau de bord : indicateurs de paie (null si le rôle n'a pas accès à la paie). */
export async function kpiPaie(): Promise<KpiPaie | null> {
  const ctx = await exigerContexteSirhAction();
  if (!peutVoirPaieSirh(ctx.utilisateur.role)) return null;
  return withTenant(ctx.entreprise.id, async (tx) => {
    const periodes = await selectPeriodes(tx);
    const courant = moisDeLaDate(aujourdhuiIso());
    const periode =
      periodes.find((p) => memeMois(p, courant)) ??
      periodes.find((p) => p.statut !== 'cloturee') ??
      periodes[0] ??
      null;
    return {
      periode: periode
        ? { id: periode.id, annee: periode.annee, mois: periode.mois, statut: periode.statut }
        : null,
      nbVariables: periode?.nbVariables ?? 0,
      nbEmployes: periode?.nbEmployes ?? 0,
      montantTotal: periode?.montantTotal ?? 0,
      nbPeriodesNonCloturees: periodes.filter((p) => p.statut !== 'cloturee').length,
    };
  });
}
