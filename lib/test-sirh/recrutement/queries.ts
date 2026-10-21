import 'server-only';

import { and, asc, count, desc, eq, gte, inArray, isNull, lte, max, sql } from 'drizzle-orm';

import { withTenant, type TenantTx } from '@/lib/db/with-tenant';
import { employes } from '@/db/schema/employes';
import {
  sirhCandidats,
  sirhCandidatureAvis,
  sirhCandidatures,
  sirhDocuments,
  sirhOffres,
  sirhPostes,
  sirhSites,
} from '@/db/schema/test-sirh';
import { utilisateurs } from '@/db/schema/utilisateurs';
import {
  ETAPES_PIPELINE,
  type AvisRecrutement,
  type EtapeCandidature,
  type MotifRefus,
  type SourceCandidat,
  type StatutOffre,
  type TypeContratSirh,
} from '@/lib/validation/test-sirh/enums';

import { aujourdhuiIso } from '../calendrier';
import { exigerContexteSirhAction } from '../contexte';
import { nomComplet } from '../format';
import { ROLES_SIRH_LECTURE } from '../permissions';
import { estUuid } from './commun-serveur';
import { dateHeureParis } from './fuseau';
import { dateLimiteRgpd, derniereActivite, estAPurgerRgpd } from './pipeline';

/**
 * Lectures — Test SIRH › Recrutement (`server-only`, appelées depuis les Server
 * Components). Données sérialisables (dates en chaînes ISO).
 */

const MS_PAR_JOUR = 86_400_000;

function versIso(d: Date | null): string | null {
  return d ? d.toISOString() : null;
}

/** Étapes actives du pipeline (copie mutable pour `inArray`). */
const ETAPES_ACTIVES: EtapeCandidature[] = [...ETAPES_PIPELINE];

// ─────────────────────────────────────────────────────────────
// Offres
// ─────────────────────────────────────────────────────────────

export type OffreLigne = {
  id: string;
  reference: string | null;
  titre: string;
  posteId: string | null;
  posteLibelle: string | null;
  siteId: string | null;
  siteNom: string | null;
  typeContrat: TypeContratSirh;
  description: string | null;
  profilRecherche: string | null;
  nbPostes: number;
  salaireMin: string | null;
  salaireMax: string | null;
  statut: StatutOffre;
  datePublication: string | null;
  dateCloture: string | null;
  responsableId: string | null;
  responsableNom: string | null;
  nbCandidatures: number;
  nbActives: number;
  nbEmbauches: number;
};

async function lireOffresTx(tx: TenantTx, offreId?: string): Promise<OffreLigne[]> {
  const rows = await tx
    .select({
      id: sirhOffres.id,
      reference: sirhOffres.reference,
      titre: sirhOffres.titre,
      posteId: sirhOffres.posteId,
      posteIntitule: sirhPostes.intitule,
      posteNiveau: sirhPostes.niveau,
      siteId: sirhOffres.siteId,
      siteNom: sirhSites.nom,
      typeContrat: sirhOffres.typeContrat,
      description: sirhOffres.description,
      profilRecherche: sirhOffres.profilRecherche,
      nbPostes: sirhOffres.nbPostes,
      salaireMin: sirhOffres.salaireMin,
      salaireMax: sirhOffres.salaireMax,
      statut: sirhOffres.statut,
      datePublication: sirhOffres.datePublication,
      dateCloture: sirhOffres.dateCloture,
      responsableId: sirhOffres.responsableId,
      responsableNom: employes.nom,
      responsablePrenom: employes.prenom,
    })
    .from(sirhOffres)
    .leftJoin(sirhPostes, eq(sirhPostes.id, sirhOffres.posteId))
    .leftJoin(sirhSites, eq(sirhSites.id, sirhOffres.siteId))
    .leftJoin(employes, eq(employes.id, sirhOffres.responsableId))
    .where(
      offreId
        ? and(eq(sirhOffres.id, offreId), isNull(sirhOffres.deletedAt))
        : isNull(sirhOffres.deletedAt),
    )
    .orderBy(desc(sirhOffres.createdAt));

  const stats = await tx
    .select({
      offreId: sirhCandidatures.offreId,
      total: count(),
      actives:
        sql<number>`count(*) filter (where ${inArray(sirhCandidatures.etape, ETAPES_ACTIVES)})`.mapWith(
          Number,
        ),
      embauches:
        sql<number>`count(*) filter (where ${eq(sirhCandidatures.etape, 'embauche')})`.mapWith(
          Number,
        ),
    })
    .from(sirhCandidatures)
    .innerJoin(
      sirhCandidats,
      and(eq(sirhCandidats.id, sirhCandidatures.candidatId), isNull(sirhCandidats.deletedAt)),
    )
    .where(
      offreId
        ? and(eq(sirhCandidatures.offreId, offreId), isNull(sirhCandidatures.deletedAt))
        : isNull(sirhCandidatures.deletedAt),
    )
    .groupBy(sirhCandidatures.offreId);
  const parOffre = new Map(stats.map((s) => [s.offreId, s]));

  return rows.map((r) => {
    const s = parOffre.get(r.id);
    return {
      id: r.id,
      reference: r.reference,
      titre: r.titre,
      posteId: r.posteId,
      posteLibelle: r.posteIntitule
        ? r.posteNiveau
          ? `${r.posteIntitule} (${r.posteNiveau})`
          : r.posteIntitule
        : null,
      siteId: r.siteId,
      siteNom: r.siteNom,
      typeContrat: r.typeContrat,
      description: r.description,
      profilRecherche: r.profilRecherche,
      nbPostes: r.nbPostes,
      salaireMin: r.salaireMin,
      salaireMax: r.salaireMax,
      statut: r.statut,
      datePublication: r.datePublication,
      dateCloture: r.dateCloture,
      responsableId: r.responsableId,
      responsableNom:
        r.responsableId && r.responsableNom !== null
          ? nomComplet(r.responsablePrenom, r.responsableNom)
          : null,
      nbCandidatures: s?.total ?? 0,
      nbActives: s?.actives ?? 0,
      nbEmbauches: s?.embauches ?? 0,
    };
  });
}

/** Offres d'emploi (plus récentes d'abord) avec compteurs de candidatures. */
export async function listerOffres(): Promise<OffreLigne[]> {
  const ctx = await exigerContexteSirhAction(ROLES_SIRH_LECTURE);
  return withTenant(ctx.entreprise.id, (tx) => lireOffresTx(tx));
}

/** Une offre (null si absente, supprimée ou identifiant invalide). */
export async function lireOffre(id: string): Promise<OffreLigne | null> {
  const ctx = await exigerContexteSirhAction(ROLES_SIRH_LECTURE);
  if (!estUuid(id)) return null;
  const [offre] = await withTenant(ctx.entreprise.id, (tx) => lireOffresTx(tx, id));
  return offre ?? null;
}

// ─────────────────────────────────────────────────────────────
// Indicateurs (tableau de bord)
// ─────────────────────────────────────────────────────────────

export type KpiRecrutement = {
  /** Offres au statut « Publiée ». */
  offresPubliees: number;
  /** Candidatures dans le pipeline actif (nouvelle → proposition). */
  candidaturesActives: number;
  /** Entretiens planifiés dans les 7 prochains jours (candidatures actives). */
  entretiensAVenir: number;
  /** Embauches décidées sur les 90 derniers jours (fiches employé créées). */
  embauches90j: number;
};

export async function kpiRecrutement(): Promise<KpiRecrutement> {
  const ctx = await exigerContexteSirhAction(ROLES_SIRH_LECTURE);
  const maintenant = new Date();
  const dans7Jours = new Date(maintenant.getTime() + 7 * MS_PAR_JOUR);
  const il90Jours = new Date(maintenant.getTime() - 90 * MS_PAR_JOUR);

  return withTenant(ctx.entreprise.id, async (tx) => {
    const [offres] = await tx
      .select({ n: count() })
      .from(sirhOffres)
      .where(and(isNull(sirhOffres.deletedAt), eq(sirhOffres.statut, 'publiee')));

    const candidaturesActives = and(
      isNull(sirhCandidatures.deletedAt),
      inArray(sirhCandidatures.etape, ETAPES_ACTIVES),
    );
    const [actives] = await tx
      .select({ n: count() })
      .from(sirhCandidatures)
      .innerJoin(
        sirhOffres,
        and(eq(sirhOffres.id, sirhCandidatures.offreId), isNull(sirhOffres.deletedAt)),
      )
      .innerJoin(
        sirhCandidats,
        and(eq(sirhCandidats.id, sirhCandidatures.candidatId), isNull(sirhCandidats.deletedAt)),
      )
      .where(candidaturesActives);
    const [entretiens] = await tx
      .select({ n: count() })
      .from(sirhCandidatures)
      .innerJoin(
        sirhOffres,
        and(eq(sirhOffres.id, sirhCandidatures.offreId), isNull(sirhOffres.deletedAt)),
      )
      .innerJoin(
        sirhCandidats,
        and(eq(sirhCandidats.id, sirhCandidatures.candidatId), isNull(sirhCandidats.deletedAt)),
      )
      .where(
        and(
          candidaturesActives,
          gte(sirhCandidatures.dateEntretien, maintenant),
          lte(sirhCandidatures.dateEntretien, dans7Jours),
        ),
      );
    const [embauches] = await tx
      .select({ n: count() })
      .from(sirhCandidatures)
      .innerJoin(sirhCandidats, eq(sirhCandidats.id, sirhCandidatures.candidatId))
      .innerJoin(employes, eq(employes.id, sirhCandidats.employeId))
      .where(
        and(
          isNull(sirhCandidatures.deletedAt),
          eq(sirhCandidatures.etape, 'embauche'),
          gte(employes.createdAt, il90Jours),
        ),
      );

    return {
      offresPubliees: offres?.n ?? 0,
      candidaturesActives: actives?.n ?? 0,
      entretiensAVenir: entretiens?.n ?? 0,
      embauches90j: embauches?.n ?? 0,
    };
  });
}

export type EntretienRecrutementAVenir = {
  candidatureId: string;
  offreId: string;
  offreTitre: string;
  offreReference: string | null;
  candidatId: string;
  /** « Prénom Nom ». */
  candidatNom: string;
  etape: EtapeCandidature;
  /** Instant de l'entretien (ISO UTC). */
  dateEntretien: string;
  /** Date de l'entretien en heure de Paris (`YYYY-MM-DD`). */
  date: string;
  /** Heure de l'entretien en heure de Paris (`HH:MM`). */
  heure: string;
};

/**
 * Entretiens de recrutement planifiés à partir de maintenant (candidatures
 * actives), du plus proche au plus lointain. Par défaut : 7 jours, 20 lignes.
 */
export async function listerEntretiensRecrutementAVenir(
  opts: { jours?: number; limite?: number } = {},
): Promise<EntretienRecrutementAVenir[]> {
  const ctx = await exigerContexteSirhAction(ROLES_SIRH_LECTURE);
  const jours = Math.max(1, Math.min(opts.jours ?? 7, 366));
  const limite = Math.max(1, Math.min(opts.limite ?? 20, 200));
  const maintenant = new Date();
  const fin = new Date(maintenant.getTime() + jours * MS_PAR_JOUR);

  const rows = await withTenant(ctx.entreprise.id, (tx) =>
    tx
      .select({
        candidatureId: sirhCandidatures.id,
        offreId: sirhOffres.id,
        offreTitre: sirhOffres.titre,
        offreReference: sirhOffres.reference,
        candidatId: sirhCandidats.id,
        nom: sirhCandidats.nom,
        prenom: sirhCandidats.prenom,
        etape: sirhCandidatures.etape,
        dateEntretien: sirhCandidatures.dateEntretien,
      })
      .from(sirhCandidatures)
      .innerJoin(
        sirhOffres,
        and(eq(sirhOffres.id, sirhCandidatures.offreId), isNull(sirhOffres.deletedAt)),
      )
      .innerJoin(
        sirhCandidats,
        and(eq(sirhCandidats.id, sirhCandidatures.candidatId), isNull(sirhCandidats.deletedAt)),
      )
      .where(
        and(
          isNull(sirhCandidatures.deletedAt),
          inArray(sirhCandidatures.etape, ETAPES_ACTIVES),
          gte(sirhCandidatures.dateEntretien, maintenant),
          lte(sirhCandidatures.dateEntretien, fin),
        ),
      )
      .orderBy(asc(sirhCandidatures.dateEntretien))
      .limit(limite),
  );

  return rows.flatMap((r) => {
    const local = dateHeureParis(r.dateEntretien);
    if (!r.dateEntretien || !local) return [];
    return [
      {
        candidatureId: r.candidatureId,
        offreId: r.offreId,
        offreTitre: r.offreTitre,
        offreReference: r.offreReference,
        candidatId: r.candidatId,
        candidatNom: nomComplet(r.prenom, r.nom),
        etape: r.etape,
        dateEntretien: r.dateEntretien.toISOString(),
        date: local.date,
        heure: local.heure,
      },
    ];
  });
}

// ─────────────────────────────────────────────────────────────
// Pipeline d'une offre
// ─────────────────────────────────────────────────────────────

export type AvisLigne = {
  id: string;
  candidatureId: string;
  auteurId: string | null;
  /** Email du compte auteur (ou « — » si le compte a disparu). */
  auteurLibelle: string;
  note: number | null;
  avis: AvisRecrutement;
  commentaire: string | null;
  createdAt: string;
};

export type CandidatureOffre = {
  id: string;
  offreId: string;
  candidatId: string;
  nom: string;
  prenom: string;
  email: string | null;
  telephone: string | null;
  source: SourceCandidat;
  /** Employé créé à l'embauche (passerelle RH). */
  employeId: string | null;
  etape: EtapeCandidature;
  dateCandidature: string;
  note: number | null;
  motifRefus: MotifRefus | null;
  /** Instant de l'entretien (ISO UTC) ou null. */
  dateEntretien: string | null;
  commentaire: string | null;
  avis: AvisLigne[];
};

/** Candidatures d'une offre (avec les avis des évaluateurs). */
export async function listerCandidaturesOffre(offreId: string): Promise<CandidatureOffre[]> {
  const ctx = await exigerContexteSirhAction(ROLES_SIRH_LECTURE);
  if (!estUuid(offreId)) return [];

  return withTenant(ctx.entreprise.id, async (tx) => {
    const rows = await tx
      .select({
        id: sirhCandidatures.id,
        offreId: sirhCandidatures.offreId,
        candidatId: sirhCandidats.id,
        nom: sirhCandidats.nom,
        prenom: sirhCandidats.prenom,
        email: sirhCandidats.email,
        telephone: sirhCandidats.telephone,
        source: sirhCandidats.source,
        employeId: sirhCandidats.employeId,
        etape: sirhCandidatures.etape,
        dateCandidature: sirhCandidatures.dateCandidature,
        note: sirhCandidatures.note,
        motifRefus: sirhCandidatures.motifRefus,
        dateEntretien: sirhCandidatures.dateEntretien,
        commentaire: sirhCandidatures.commentaire,
      })
      .from(sirhCandidatures)
      .innerJoin(
        sirhCandidats,
        and(eq(sirhCandidats.id, sirhCandidatures.candidatId), isNull(sirhCandidats.deletedAt)),
      )
      .where(and(eq(sirhCandidatures.offreId, offreId), isNull(sirhCandidatures.deletedAt)))
      .orderBy(asc(sirhCandidatures.dateCandidature));

    const ids = rows.map((r) => r.id);
    const avis = ids.length
      ? await tx
          .select({
            id: sirhCandidatureAvis.id,
            candidatureId: sirhCandidatureAvis.candidatureId,
            auteurId: sirhCandidatureAvis.auteurId,
            auteurEmail: utilisateurs.email,
            note: sirhCandidatureAvis.note,
            avis: sirhCandidatureAvis.avis,
            commentaire: sirhCandidatureAvis.commentaire,
            createdAt: sirhCandidatureAvis.createdAt,
          })
          .from(sirhCandidatureAvis)
          .leftJoin(utilisateurs, eq(utilisateurs.id, sirhCandidatureAvis.auteurId))
          .where(
            and(
              inArray(sirhCandidatureAvis.candidatureId, ids),
              isNull(sirhCandidatureAvis.deletedAt),
            ),
          )
          .orderBy(asc(sirhCandidatureAvis.createdAt))
      : [];

    const avisParCandidature = new Map<string, AvisLigne[]>();
    for (const a of avis) {
      const liste = avisParCandidature.get(a.candidatureId) ?? [];
      liste.push({
        id: a.id,
        candidatureId: a.candidatureId,
        auteurId: a.auteurId,
        auteurLibelle: a.auteurEmail ?? '—',
        note: a.note,
        avis: a.avis,
        commentaire: a.commentaire,
        createdAt: a.createdAt.toISOString(),
      });
      avisParCandidature.set(a.candidatureId, liste);
    }

    return rows.map((r) => ({
      ...r,
      dateEntretien: versIso(r.dateEntretien),
      avis: avisParCandidature.get(r.id) ?? [],
    }));
  });
}

// ─────────────────────────────────────────────────────────────
// Vivier de candidats
// ─────────────────────────────────────────────────────────────

export type CandidatLigne = {
  id: string;
  nom: string;
  prenom: string;
  email: string | null;
  telephone: string | null;
  ville: string | null;
  source: SourceCandidat;
  consentementRgpd: boolean;
  dateConsentement: string | null;
  employeId: string | null;
  nbCandidatures: number;
  nbActives: number;
  /** Dernière activité (création / modification, candidature, avis, document). */
  derniereActivite: string | null;
  /** Sans activité depuis plus de 24 mois (hors candidats embauchés). */
  aPurger: boolean;
};

/** Activité par candidat : candidatures, avis et documents (dates max). */
async function activitesCandidats(tx: TenantTx, candidatId?: string) {
  const filtreCandidature = candidatId
    ? and(eq(sirhCandidatures.candidatId, candidatId), isNull(sirhCandidatures.deletedAt))
    : isNull(sirhCandidatures.deletedAt);

  const candidatures = await tx
    .select({
      candidatId: sirhCandidatures.candidatId,
      total: count(),
      actives:
        sql<number>`count(*) filter (where ${inArray(sirhCandidatures.etape, ETAPES_ACTIVES)})`.mapWith(
          Number,
        ),
      majLe: max(sirhCandidatures.updatedAt),
      derniereCandidature: max(sirhCandidatures.dateCandidature),
    })
    .from(sirhCandidatures)
    .where(filtreCandidature)
    .groupBy(sirhCandidatures.candidatId);

  const avis = await tx
    .select({
      candidatId: sirhCandidatures.candidatId,
      dernier: max(sirhCandidatureAvis.createdAt),
    })
    .from(sirhCandidatureAvis)
    .innerJoin(sirhCandidatures, eq(sirhCandidatures.id, sirhCandidatureAvis.candidatureId))
    .where(and(filtreCandidature, isNull(sirhCandidatureAvis.deletedAt)))
    .groupBy(sirhCandidatures.candidatId);

  const documents = await tx
    .select({ candidatId: sirhDocuments.candidatId, dernier: max(sirhDocuments.createdAt) })
    .from(sirhDocuments)
    .where(
      candidatId
        ? and(eq(sirhDocuments.candidatId, candidatId), isNull(sirhDocuments.deletedAt))
        : isNull(sirhDocuments.deletedAt),
    )
    .groupBy(sirhDocuments.candidatId);

  return {
    candidatures: new Map(candidatures.map((c) => [c.candidatId, c])),
    avis: new Map(avis.map((a) => [a.candidatId, a.dernier])),
    documents: new Map(
      documents.flatMap((d) => (d.candidatId ? [[d.candidatId, d.dernier] as const] : [])),
    ),
  };
}

type LigneCandidatBrute = {
  id: string;
  nom: string;
  prenom: string;
  email: string | null;
  telephone: string | null;
  ville: string | null;
  source: SourceCandidat;
  consentementRgpd: boolean;
  dateConsentement: string | null;
  employeId: string | null;
  createdAt: Date;
  updatedAt: Date;
};

function versCandidatLigne(
  c: LigneCandidatBrute,
  activites: Awaited<ReturnType<typeof activitesCandidats>>,
  today: string,
): CandidatLigne {
  const stats = activites.candidatures.get(c.id);
  const derniere = derniereActivite([
    c.createdAt.toISOString(),
    c.updatedAt.toISOString(),
    versIso(stats?.majLe ?? null),
    stats?.derniereCandidature ?? null,
    versIso(activites.avis.get(c.id) ?? null),
    versIso(activites.documents.get(c.id) ?? null),
  ]);
  return {
    id: c.id,
    nom: c.nom,
    prenom: c.prenom,
    email: c.email,
    telephone: c.telephone,
    ville: c.ville,
    source: c.source,
    consentementRgpd: c.consentementRgpd,
    dateConsentement: c.dateConsentement,
    employeId: c.employeId,
    nbCandidatures: stats?.total ?? 0,
    nbActives: stats?.actives ?? 0,
    derniereActivite: derniere,
    aPurger: estAPurgerRgpd(derniere, today, { embauche: c.employeId !== null }),
  };
}

const colonnesCandidat = {
  id: sirhCandidats.id,
  nom: sirhCandidats.nom,
  prenom: sirhCandidats.prenom,
  email: sirhCandidats.email,
  telephone: sirhCandidats.telephone,
  ville: sirhCandidats.ville,
  source: sirhCandidats.source,
  consentementRgpd: sirhCandidats.consentementRgpd,
  dateConsentement: sirhCandidats.dateConsentement,
  employeId: sirhCandidats.employeId,
  notes: sirhCandidats.notes,
  createdAt: sirhCandidats.createdAt,
  updatedAt: sirhCandidats.updatedAt,
};

/** Vivier : tous les candidats (triés par nom) avec activité et alerte RGPD. */
export async function listerCandidats(): Promise<CandidatLigne[]> {
  const ctx = await exigerContexteSirhAction(ROLES_SIRH_LECTURE);
  const today = aujourdhuiIso();
  return withTenant(ctx.entreprise.id, async (tx) => {
    const candidats = await tx
      .select(colonnesCandidat)
      .from(sirhCandidats)
      .where(isNull(sirhCandidats.deletedAt))
      .orderBy(asc(sirhCandidats.nom), asc(sirhCandidats.prenom));
    const activites = await activitesCandidats(tx);
    return candidats.map((c) => versCandidatLigne(c, activites, today));
  });
}

export type CandidatFiche = CandidatLigne & {
  notes: string | null;
  createdAt: string;
  /** Fin de la durée de conservation (dernière activité + 24 mois). */
  dateLimiteRgpd: string | null;
  candidatures: Array<{
    id: string;
    offreId: string;
    offreTitre: string;
    offreReference: string | null;
    offreStatut: StatutOffre;
    etape: EtapeCandidature;
    dateCandidature: string;
    note: number | null;
    motifRefus: MotifRefus | null;
    dateEntretien: string | null;
  }>;
  documents: Array<{
    id: string;
    titre: string;
    mimeType: string;
    tailleBytes: number | null;
    createdAt: string;
  }>;
};

/** Fiche candidat : identité, activité / RGPD, historique des candidatures, documents. */
export async function lireCandidat(id: string): Promise<CandidatFiche | null> {
  const ctx = await exigerContexteSirhAction(ROLES_SIRH_LECTURE);
  if (!estUuid(id)) return null;
  const today = aujourdhuiIso();

  return withTenant(ctx.entreprise.id, async (tx) => {
    const [candidat] = await tx
      .select(colonnesCandidat)
      .from(sirhCandidats)
      .where(and(eq(sirhCandidats.id, id), isNull(sirhCandidats.deletedAt)))
      .limit(1);
    if (!candidat) return null;

    const activites = await activitesCandidats(tx, id);
    const ligne = versCandidatLigne(candidat, activites, today);

    const candidatures = await tx
      .select({
        id: sirhCandidatures.id,
        offreId: sirhOffres.id,
        offreTitre: sirhOffres.titre,
        offreReference: sirhOffres.reference,
        offreStatut: sirhOffres.statut,
        etape: sirhCandidatures.etape,
        dateCandidature: sirhCandidatures.dateCandidature,
        note: sirhCandidatures.note,
        motifRefus: sirhCandidatures.motifRefus,
        dateEntretien: sirhCandidatures.dateEntretien,
      })
      .from(sirhCandidatures)
      .innerJoin(
        sirhOffres,
        and(eq(sirhOffres.id, sirhCandidatures.offreId), isNull(sirhOffres.deletedAt)),
      )
      .where(and(eq(sirhCandidatures.candidatId, id), isNull(sirhCandidatures.deletedAt)))
      .orderBy(desc(sirhCandidatures.dateCandidature));

    const documents = await tx
      .select({
        id: sirhDocuments.id,
        titre: sirhDocuments.titre,
        mimeType: sirhDocuments.mimeType,
        tailleBytes: sirhDocuments.tailleBytes,
        createdAt: sirhDocuments.createdAt,
      })
      .from(sirhDocuments)
      .where(and(eq(sirhDocuments.candidatId, id), isNull(sirhDocuments.deletedAt)))
      .orderBy(desc(sirhDocuments.createdAt));

    return {
      ...ligne,
      notes: candidat.notes,
      createdAt: candidat.createdAt.toISOString(),
      dateLimiteRgpd: ligne.derniereActivite ? dateLimiteRgpd(ligne.derniereActivite) : null,
      candidatures: candidatures.map((c) => ({ ...c, dateEntretien: versIso(c.dateEntretien) })),
      documents: documents.map((d) => ({ ...d, createdAt: d.createdAt.toISOString() })),
    };
  });
}

/** Candidats du vivier pour le sélecteur « candidat existant » : « Nom Prénom · email ». */
export async function listerCandidatsOptions(): Promise<Array<{ id: string; label: string }>> {
  const ctx = await exigerContexteSirhAction(ROLES_SIRH_LECTURE);
  const rows = await withTenant(ctx.entreprise.id, (tx) =>
    tx
      .select({
        id: sirhCandidats.id,
        nom: sirhCandidats.nom,
        prenom: sirhCandidats.prenom,
        email: sirhCandidats.email,
      })
      .from(sirhCandidats)
      .where(isNull(sirhCandidats.deletedAt))
      .orderBy(asc(sirhCandidats.nom), asc(sirhCandidats.prenom)),
  );
  return rows.map((r) => ({
    id: r.id,
    label: `${r.nom} ${r.prenom}${r.email ? ` · ${r.email}` : ''}`,
  }));
}

// ─────────────────────────────────────────────────────────────
// Passerelle RH (dossier collaborateur)
// ─────────────────────────────────────────────────────────────

export type RecrutementEmploye = {
  candidatId: string;
  source: SourceCandidat;
  /** Offre de l'embauche (null si l'offre a disparu). */
  offreId: string | null;
  offreTitre: string | null;
  offreReference: string | null;
  dateCandidature: string | null;
  /** CV et pièces conservés sur la fiche candidat. */
  nbDocuments: number;
};

/** Origine recrutement d'un employé embauché via le SIRH (null s'il ne vient pas du recrutement). */
export async function lireRecrutementEmploye(
  employeId: string,
): Promise<RecrutementEmploye | null> {
  const ctx = await exigerContexteSirhAction(ROLES_SIRH_LECTURE);
  if (!estUuid(employeId)) return null;

  return withTenant(ctx.entreprise.id, async (tx) => {
    const [candidat] = await tx
      .select({ id: sirhCandidats.id, source: sirhCandidats.source })
      .from(sirhCandidats)
      .where(and(eq(sirhCandidats.employeId, employeId), isNull(sirhCandidats.deletedAt)))
      .limit(1);
    if (!candidat) return null;

    const [embauche] = await tx
      .select({
        offreId: sirhOffres.id,
        offreTitre: sirhOffres.titre,
        offreReference: sirhOffres.reference,
        dateCandidature: sirhCandidatures.dateCandidature,
      })
      .from(sirhCandidatures)
      .innerJoin(sirhOffres, eq(sirhOffres.id, sirhCandidatures.offreId))
      .where(
        and(
          eq(sirhCandidatures.candidatId, candidat.id),
          eq(sirhCandidatures.etape, 'embauche'),
          isNull(sirhCandidatures.deletedAt),
        ),
      )
      .orderBy(desc(sirhCandidatures.updatedAt))
      .limit(1);

    const [documents] = await tx
      .select({ n: count() })
      .from(sirhDocuments)
      .where(and(eq(sirhDocuments.candidatId, candidat.id), isNull(sirhDocuments.deletedAt)));

    return {
      candidatId: candidat.id,
      source: candidat.source,
      offreId: embauche?.offreId ?? null,
      offreTitre: embauche?.offreTitre ?? null,
      offreReference: embauche?.offreReference ?? null,
      dateCandidature: embauche?.dateCandidature ?? null,
      nbDocuments: documents?.n ?? 0,
    };
  });
}
