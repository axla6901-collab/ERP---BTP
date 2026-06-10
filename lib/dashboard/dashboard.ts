'use server';

import { and, asc, desc, eq, gte, inArray, isNull, lte } from 'drizzle-orm';

import { requireTenantContextWithMfa } from '@/lib/auth/tenant-guards';
import { withTenant } from '@/lib/db/with-tenant';
import { agregerSommaireChantiers } from '@/lib/planning/sommaire';
import {
  chantierTacheEquipe,
  chantierTaches,
  chantiers,
} from '@/db/schema/chantiers';
import { clients, devis } from '@/db/schema/commercial';
import { employes } from '@/db/schema/employes';
import { pointages } from '@/db/schema/pointages';
import { utilisateurs } from '@/db/schema/utilisateurs';
import {
  LIBELLES_STATUT_CHANTIER,
  type StatutChantier,
} from '@/lib/validation/chantiers';

import {
  bornesSemaine,
  calculerMarge,
  coutMainOeuvre,
  estEnRetard,
  joursRestants,
  type MargeChantier,
} from './compute';

// ─────────────────────────────────────────────────────────────
// Helpers locaux
// ─────────────────────────────────────────────────────────────

/** Date calendaire locale du serveur, au format ISO `AAAA-MM-JJ`. */
function isoAujourdhui(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(
    d.getDate(),
  ).padStart(2, '0')}`;
}

function libelleClient(c: {
  type: string | null;
  raisonSociale: string | null;
  nom: string | null;
  prenom: string | null;
}): string {
  if (c.type === 'professionnel') return c.raisonSociale ?? '—';
  return [c.prenom, c.nom].filter(Boolean).join(' ') || '—';
}

const num = (v: string | null): number | null => {
  if (v == null) return null;
  const n = Number(v);
  return Number.isNaN(n) ? null : n;
};

const LIBELLES_STATUT_DEVIS: Record<string, string> = {
  brouillon: 'Brouillon',
  en_validation: 'En validation',
  refuse: 'Refusé',
  valide: 'Validé',
  envoye: 'Envoyé',
  gagne: 'Gagné',
  perdu: 'Perdu',
  annule: 'Annulé',
};

const LIBELLES_STATUT_TACHE: Record<string, string> = {
  a_faire: 'À faire',
  en_cours: 'En cours',
  bloque: 'Bloquée',
  termine: 'Terminée',
  annule: 'Annulée',
};

const LIBELLES_MOTIF_ABSENCE: Record<string, string> = {
  conges_payes: 'congés payés',
  rtt: 'RTT',
  maladie: 'maladie',
  accident_travail: 'accident du travail',
  formation: 'formation',
  jour_ferie: 'jour férié',
  vacances: 'vacances',
  intemperie: 'intempérie',
  naissance: 'naissance',
  mariage: 'mariage',
  deces: 'décès',
  ecole: 'école',
  autre: 'absence',
};

// ─────────────────────────────────────────────────────────────
// Timeline « Mes chantiers actifs »
// ─────────────────────────────────────────────────────────────

const STATUTS_ACTIFS: StatutChantier[] = ['prospect', 'en_cours', 'suspendu'];

export type ChantierTimeline = {
  id: string;
  numero: string;
  libelle: string;
  statut: StatutChantier;
  clientNom: string;
  /** Date de début : chantier prévu, sinon min des tâches, sinon `null`. */
  dateDebut: string | null;
  /** Date de fin : chantier prévu, sinon max des tâches, sinon `null`. */
  dateFin: string | null;
  avancementPourcent: number | null;
  nbTaches: number;
  enRetard: boolean;
};

/**
 * Chantiers « actifs » (prospect / en cours / suspendu) pour la frise du
 * dashboard. Avancement et plage de dates dérivés des tâches (fallback sur les
 * dates prévues du chantier). Non gated par le module Planning : c'est l'écran
 * d'accueil.
 */
export async function listerChantiersActifsTimeline(): Promise<ChantierTimeline[]> {
  const ctx = await requireTenantContextWithMfa();
  const today = isoAujourdhui();

  return withTenant(ctx.entreprise.id, async (tx) => {
    const rows = await tx
      .select({
        id: chantiers.id,
        numero: chantiers.numero,
        libelle: chantiers.libelle,
        statut: chantiers.statut,
        dateDebutPrevue: chantiers.dateDebutPrevue,
        dateFinPrevue: chantiers.dateFinPrevue,
        clientType: clients.type,
        clientRaisonSociale: clients.raisonSociale,
        clientNom: clients.nom,
        clientPrenom: clients.prenom,
      })
      .from(chantiers)
      .leftJoin(clients, eq(chantiers.clientId, clients.id))
      .where(and(isNull(chantiers.deletedAt), inArray(chantiers.statut, STATUTS_ACTIFS)))
      .orderBy(asc(chantiers.dateDebutPrevue), asc(chantiers.numero));

    const taches = await tx
      .select({
        chantierId: chantierTaches.chantierId,
        avancementPourcent: chantierTaches.avancementPourcent,
        heuresPlanifiees: chantierTaches.heuresPlanifiees,
        dateDebutPrevue: chantierTaches.dateDebutPrevue,
        dateFinPrevue: chantierTaches.dateFinPrevue,
      })
      .from(chantierTaches)
      .where(isNull(chantierTaches.deletedAt));

    const parChantier = agregerSommaireChantiers(taches);

    return rows.map((r) => {
      const acc = parChantier.get(r.id);
      const dateDebut = r.dateDebutPrevue ?? acc?.dateMinTaches ?? null;
      const dateFin = r.dateFinPrevue ?? acc?.dateMaxTaches ?? null;
      return {
        id: r.id,
        numero: r.numero,
        libelle: r.libelle,
        statut: r.statut,
        clientNom: libelleClient({
          type: r.clientType,
          raisonSociale: r.clientRaisonSociale,
          nom: r.clientNom,
          prenom: r.clientPrenom,
        }),
        dateDebut,
        dateFin,
        avancementPourcent: acc?.avancementPourcent ?? null,
        nbTaches: acc?.nbTaches ?? 0,
        enRetard: estEnRetard(r.statut, dateFin, today),
      };
    });
  });
}

// ─────────────────────────────────────────────────────────────
// Aperçu d'un chantier sélectionné
// ─────────────────────────────────────────────────────────────

export type ActiviteItem = {
  id: string;
  type: 'pointage' | 'tache' | 'devis';
  texte: string;
  acteur: string | null;
  /** ISO datetime (tri + affichage relatif côté UI). */
  timestamp: string;
  ton: 'emerald' | 'sky' | 'amber' | 'violet' | 'neutral';
};

export type PresenceEquipe = 'present' | 'autre_chantier' | 'absent' | 'inconnu';

export type MembreEquipe = {
  utilisateurId: string;
  nom: string;
  presence: PresenceEquipe;
  detail: string | null;
};

export type ApercuChantier = {
  id: string;
  numero: string;
  libelle: string;
  statut: StatutChantier;
  statutLibelle: string;
  clientNom: string;
  responsableEmail: string | null;
  adresse: {
    ligne1: string | null;
    ligne2: string | null;
    codePostal: string | null;
    ville: string | null;
  };
  avancementPourcent: number | null;
  joursRestants: number | null;
  dateLivraison: string | null;
  enRetard: boolean;
  pointageSemaine: {
    heuresReelles: number;
    capaciteEquipe: number | null;
    nbIntervenants: number;
  };
  marge: MargeChantier;
  activite: ActiviteItem[];
  equipe: MembreEquipe[];
};

/**
 * Aperçu complet d'un chantier pour la fiche « chantier sélectionné » du
 * dashboard. Toutes les valeurs sont branchées sur des données réelles :
 * - avancement : moyenne pondérée des tâches ;
 * - marge : montant prévisionnel − coût main-d'œuvre réel (hors achats/ST) ;
 * - pointage semaine : heures réellement pointées (semaine ISO courante) ;
 * - activité : pointages, tâches et devis liés mis à jour cette semaine ;
 * - équipe : ouvriers affectés via le planning + présence du jour.
 *
 * `null` si le chantier n'existe pas / est supprimé.
 */
export async function lireApercuChantier(chantierId: string): Promise<ApercuChantier | null> {
  const ctx = await requireTenantContextWithMfa();
  const today = isoAujourdhui();
  const semaine = bornesSemaine(today);
  const debutSemaineTs = new Date(`${semaine.debut}T00:00:00`);

  return withTenant(ctx.entreprise.id, async (tx) => {
    const [base] = await tx
      .select({
        chantier: chantiers,
        clientType: clients.type,
        clientRaisonSociale: clients.raisonSociale,
        clientNom: clients.nom,
        clientPrenom: clients.prenom,
        responsableEmail: utilisateurs.email,
      })
      .from(chantiers)
      .leftJoin(clients, eq(chantiers.clientId, clients.id))
      .leftJoin(utilisateurs, eq(chantiers.responsableId, utilisateurs.id))
      .where(and(eq(chantiers.id, chantierId), isNull(chantiers.deletedAt)))
      .limit(1);

    if (!base) return null;
    const ch = base.chantier;

    // ── Avancement (tâches) ──
    const taches = await tx
      .select({
        chantierId: chantierTaches.chantierId,
        avancementPourcent: chantierTaches.avancementPourcent,
        heuresPlanifiees: chantierTaches.heuresPlanifiees,
        dateDebutPrevue: chantierTaches.dateDebutPrevue,
        dateFinPrevue: chantierTaches.dateFinPrevue,
      })
      .from(chantierTaches)
      .where(and(eq(chantierTaches.chantierId, chantierId), isNull(chantierTaches.deletedAt)));
    const sommaire = agregerSommaireChantiers(taches).get(chantierId);

    // ── Pointages « heures » du chantier (coût MO + heures semaine) ──
    const heuresRows = await tx
      .select({
        employeId: pointages.employeId,
        quantite: pointages.quantite,
        datePointage: pointages.datePointage,
        taux: employes.tauxHoraireBrut,
      })
      .from(pointages)
      .innerJoin(employes, eq(pointages.employeId, employes.id))
      .where(
        and(
          eq(pointages.chantierId, chantierId),
          eq(pointages.type, 'heures'),
          isNull(pointages.deletedAt),
        ),
      );

    const coutMO = coutMainOeuvre(
      heuresRows.map((r) => ({ heures: num(r.quantite) ?? 0, tauxHoraireBrut: num(r.taux) })),
    );
    const intervenantsSemaine = new Set<string>();
    let heuresReelles = 0;
    for (const r of heuresRows) {
      if (r.datePointage >= semaine.debut && r.datePointage <= semaine.fin) {
        heuresReelles += num(r.quantite) ?? 0;
        intervenantsSemaine.add(r.employeId);
      }
    }
    const marge = calculerMarge(num(ch.montantPrevisionnelHt), coutMO);

    // ── Équipe affectée (planning) + présence du jour ──
    const equipeRows = await tx
      .selectDistinct({ utilisateurId: chantierTacheEquipe.utilisateurId })
      .from(chantierTacheEquipe)
      .innerJoin(chantierTaches, eq(chantierTacheEquipe.tacheId, chantierTaches.id))
      .where(
        and(
          eq(chantierTaches.chantierId, chantierId),
          isNull(chantierTacheEquipe.deletedAt),
          isNull(chantierTaches.deletedAt),
        ),
      );
    const utilisateurIds = equipeRows.map((e) => e.utilisateurId);

    let equipe: MembreEquipe[] = [];
    let capaciteEquipe: number | null = null;
    if (utilisateurIds.length > 0) {
      const emps = await tx
        .select({
          id: employes.id,
          utilisateurId: employes.utilisateurId,
          nom: employes.nom,
          prenom: employes.prenom,
          heuresHebdo: employes.heuresHebdoContractuelles,
        })
        .from(employes)
        .where(and(inArray(employes.utilisateurId, utilisateurIds), isNull(employes.deletedAt)));
      const users = await tx
        .select({ id: utilisateurs.id, email: utilisateurs.email })
        .from(utilisateurs)
        .where(inArray(utilisateurs.id, utilisateurIds));

      const empParUtil = new Map(emps.filter((e) => e.utilisateurId).map((e) => [e.utilisateurId as string, e]));
      const emailParUtil = new Map(users.map((u) => [u.id, u.email]));

      // Présence du jour : un pointage daté d'aujourd'hui par employé.
      const employeIds = emps.map((e) => e.id);
      const presenceJour =
        employeIds.length > 0
          ? await tx
              .select({
                employeId: pointages.employeId,
                type: pointages.type,
                chantierId: pointages.chantierId,
                motifAbsence: pointages.motifAbsence,
              })
              .from(pointages)
              .where(
                and(
                  inArray(pointages.employeId, employeIds),
                  eq(pointages.datePointage, today),
                  isNull(pointages.deletedAt),
                ),
              )
          : [];
      const presenceParEmploye = new Map(presenceJour.map((p) => [p.employeId, p]));

      let cap = 0;
      equipe = utilisateurIds.map((uid) => {
        const emp = empParUtil.get(uid);
        const nom = emp ? `${emp.prenom} ${emp.nom}`.trim() : (emailParUtil.get(uid) ?? '—');
        if (emp) cap += num(emp.heuresHebdo) ?? 0;

        let presence: PresenceEquipe = 'inconnu';
        let detail: string | null = null;
        const p = emp ? presenceParEmploye.get(emp.id) : undefined;
        if (p) {
          if (p.type === 'absence') {
            presence = 'absent';
            detail = LIBELLES_MOTIF_ABSENCE[p.motifAbsence ?? ''] ?? 'absent';
          } else if (p.chantierId === chantierId) {
            presence = 'present';
          } else {
            presence = 'autre_chantier';
            detail = 'sur un autre chantier';
          }
        }
        return { utilisateurId: uid, nom, presence, detail };
      });
      equipe.sort((a, b) => a.nom.localeCompare(b.nom, 'fr'));
      capaciteEquipe = cap > 0 ? cap : null;
    }

    // ── Activité de la semaine (pointages + tâches + devis liés) ──
    const ptsSemaine = await tx
      .select({
        id: pointages.id,
        quantite: pointages.quantite,
        type: pointages.type,
        motifAbsence: pointages.motifAbsence,
        createdAt: pointages.createdAt,
        nom: employes.nom,
        prenom: employes.prenom,
      })
      .from(pointages)
      .innerJoin(employes, eq(pointages.employeId, employes.id))
      .where(
        and(
          eq(pointages.chantierId, chantierId),
          isNull(pointages.deletedAt),
          gte(pointages.datePointage, semaine.debut),
          lte(pointages.datePointage, semaine.fin),
        ),
      )
      .orderBy(desc(pointages.createdAt))
      .limit(15);

    const tachesSemaine = await tx
      .select({
        id: chantierTaches.id,
        libelle: chantierTaches.libelle,
        avancementPourcent: chantierTaches.avancementPourcent,
        statut: chantierTaches.statut,
        updatedAt: chantierTaches.updatedAt,
      })
      .from(chantierTaches)
      .where(
        and(
          eq(chantierTaches.chantierId, chantierId),
          isNull(chantierTaches.deletedAt),
          gte(chantierTaches.updatedAt, debutSemaineTs),
        ),
      )
      .orderBy(desc(chantierTaches.updatedAt))
      .limit(10);

    const devisSemaine = await tx
      .select({
        id: devis.id,
        numero: devis.numero,
        statut: devis.statut,
        updatedAt: devis.updatedAt,
      })
      .from(devis)
      .where(
        and(
          eq(devis.chantierId, chantierId),
          isNull(devis.deletedAt),
          gte(devis.updatedAt, debutSemaineTs),
        ),
      )
      .orderBy(desc(devis.updatedAt))
      .limit(10);

    const activite: ActiviteItem[] = [
      ...ptsSemaine.map((p): ActiviteItem => {
        const acteur = `${p.prenom} ${p.nom}`.trim();
        const texte =
          p.type === 'absence'
            ? `absent (${LIBELLES_MOTIF_ABSENCE[p.motifAbsence ?? ''] ?? 'motif inconnu'})`
            : `a pointé ${num(p.quantite) ?? 0} h`;
        return {
          id: `pt-${p.id}`,
          type: 'pointage',
          texte,
          acteur,
          timestamp: p.createdAt.toISOString(),
          ton: p.type === 'absence' ? 'neutral' : 'emerald',
        };
      }),
      ...tachesSemaine.map((t): ActiviteItem => ({
        id: `ta-${t.id}`,
        type: 'tache',
        texte: `Tâche « ${t.libelle} » — ${t.avancementPourcent}% (${LIBELLES_STATUT_TACHE[t.statut] ?? t.statut})`,
        acteur: null,
        timestamp: t.updatedAt.toISOString(),
        ton: 'sky',
      })),
      ...devisSemaine.map((d): ActiviteItem => ({
        id: `dv-${d.id}`,
        type: 'devis',
        texte: `Devis ${d.numero} — ${LIBELLES_STATUT_DEVIS[d.statut] ?? d.statut}`,
        acteur: null,
        timestamp: d.updatedAt.toISOString(),
        ton: 'amber',
      })),
    ]
      .sort((a, b) => b.timestamp.localeCompare(a.timestamp))
      .slice(0, 10);

    const dateLivraison = ch.dateFinPrevue;

    return {
      id: ch.id,
      numero: ch.numero,
      libelle: ch.libelle,
      statut: ch.statut,
      statutLibelle: LIBELLES_STATUT_CHANTIER[ch.statut],
      clientNom: libelleClient({
        type: base.clientType,
        raisonSociale: base.clientRaisonSociale,
        nom: base.clientNom,
        prenom: base.clientPrenom,
      }),
      responsableEmail: base.responsableEmail ?? null,
      adresse: {
        ligne1: ch.adresseLigne1,
        ligne2: ch.adresseLigne2,
        codePostal: ch.codePostal,
        ville: ch.ville,
      },
      avancementPourcent: sommaire?.avancementPourcent ?? null,
      joursRestants: joursRestants(dateLivraison, today),
      dateLivraison,
      enRetard: estEnRetard(ch.statut, dateLivraison, today),
      pointageSemaine: {
        heuresReelles: Math.round(heuresReelles * 100) / 100,
        capaciteEquipe,
        nbIntervenants: intervenantsSemaine.size,
      },
      marge,
      activite,
      equipe,
    };
  });
}
