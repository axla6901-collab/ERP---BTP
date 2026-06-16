import 'server-only';

import { and, desc, eq, isNull } from 'drizzle-orm';

import { requireTenantContextWithMfa } from '@/lib/auth/tenant-guards';
import { withTenant } from '@/lib/db/with-tenant';
import { fournisseurs } from '@/db/schema/catalogue';
import { chantiers } from '@/db/schema/chantiers';
import { employes } from '@/db/schema/employes';
import {
  flotteAffectations,
  flotteEcheances,
  flotteEntretiens,
  flottePleins,
  flotteSinistres,
  flotteVehicules,
  type FlotteEntretien,
  type FlotteSinistre,
  type FlotteVehicule,
} from '@/db/schema/flotte';
import { raisonsSociales } from '@/db/schema/raisons-sociales';
import { type TypeEcheance } from '@/lib/validation/flotte';
import { estEnAlerte } from '@/lib/flotte/echeances';
import { syntheseConsommation, type SyntheseConsommation } from '@/lib/flotte/consommation';

/** Date du jour (YYYY-MM-DD) — calculée serveur, propagée au client pour un statut cohérent. */
export function aujourdhuiIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function nomComplet(nom: string | null, prenom: string | null): string | null {
  if (!nom && !prenom) return null;
  return [prenom, nom].filter(Boolean).join(' ');
}

// ─────────────────────────────────────────────────────────────
// Liste du parc (avec conducteur + prochaine échéance)
// ─────────────────────────────────────────────────────────────

export type VehiculeSynthese = {
  id: string;
  immatriculation: string;
  codeInterne: string | null;
  marque: string;
  modele: string;
  typeVehicule: FlotteVehicule['typeVehicule'];
  carburant: FlotteVehicule['carburant'];
  statut: FlotteVehicule['statut'];
  kilometrageActuel: number;
  conducteurNom: string | null;
  prochaineEcheance: {
    typeEcheance: TypeEcheance;
    dateEcheance: string;
    seuilAlerteJours: number;
  } | null;
};

export async function listerVehiculesAvecSynthese(): Promise<VehiculeSynthese[]> {
  const ctx = await requireTenantContextWithMfa();
  return withTenant(ctx.entreprise.id, async (tx) => {
    const vehicules = await tx
      .select({
        id: flotteVehicules.id,
        immatriculation: flotteVehicules.immatriculation,
        codeInterne: flotteVehicules.codeInterne,
        marque: flotteVehicules.marque,
        modele: flotteVehicules.modele,
        typeVehicule: flotteVehicules.typeVehicule,
        carburant: flotteVehicules.carburant,
        statut: flotteVehicules.statut,
        kilometrageActuel: flotteVehicules.kilometrageActuel,
        conducteurNom: employes.nom,
        conducteurPrenom: employes.prenom,
      })
      .from(flotteVehicules)
      .leftJoin(employes, eq(employes.id, flotteVehicules.conducteurPrincipalId))
      .where(isNull(flotteVehicules.deletedAt))
      .orderBy(flotteVehicules.immatriculation);

    const echeances = await tx
      .select({
        vehiculeId: flotteEcheances.vehiculeId,
        typeEcheance: flotteEcheances.typeEcheance,
        dateEcheance: flotteEcheances.dateEcheance,
        seuilAlerteJours: flotteEcheances.seuilAlerteJours,
      })
      .from(flotteEcheances)
      .where(isNull(flotteEcheances.deletedAt))
      .orderBy(flotteEcheances.dateEcheance);

    // Prochaine échéance = la plus proche (liste déjà triée par date croissante).
    const prochaineParVehicule = new Map<string, (typeof echeances)[number]>();
    for (const e of echeances) {
      if (!prochaineParVehicule.has(e.vehiculeId)) prochaineParVehicule.set(e.vehiculeId, e);
    }

    return vehicules.map((v) => {
      const e = prochaineParVehicule.get(v.id);
      return {
        id: v.id,
        immatriculation: v.immatriculation,
        codeInterne: v.codeInterne,
        marque: v.marque,
        modele: v.modele,
        typeVehicule: v.typeVehicule,
        carburant: v.carburant,
        statut: v.statut,
        kilometrageActuel: v.kilometrageActuel,
        conducteurNom: nomComplet(v.conducteurNom, v.conducteurPrenom),
        prochaineEcheance: e
          ? {
              typeEcheance: e.typeEcheance,
              dateEcheance: e.dateEcheance,
              seuilAlerteJours: e.seuilAlerteJours,
            }
          : null,
      };
    });
  });
}

// ─────────────────────────────────────────────────────────────
// Fiche véhicule
// ─────────────────────────────────────────────────────────────

export type VehiculeDetail = FlotteVehicule & {
  conducteur: { id: string; nom: string } | null;
};

export async function lireVehicule(id: string): Promise<VehiculeDetail | null> {
  const ctx = await requireTenantContextWithMfa();
  return withTenant(ctx.entreprise.id, async (tx) => {
    const [v] = await tx
      .select()
      .from(flotteVehicules)
      .where(and(eq(flotteVehicules.id, id), isNull(flotteVehicules.deletedAt)))
      .limit(1);
    if (!v) return null;
    let conducteur: { id: string; nom: string } | null = null;
    if (v.conducteurPrincipalId) {
      const [e] = await tx
        .select({ id: employes.id, nom: employes.nom, prenom: employes.prenom })
        .from(employes)
        .where(eq(employes.id, v.conducteurPrincipalId))
        .limit(1);
      if (e) conducteur = { id: e.id, nom: nomComplet(e.nom, e.prenom) ?? e.nom };
    }
    return { ...v, conducteur };
  });
}

export async function listerEcheancesVehicule(vehiculeId: string) {
  const ctx = await requireTenantContextWithMfa();
  return withTenant(ctx.entreprise.id, (tx) =>
    tx
      .select()
      .from(flotteEcheances)
      .where(and(eq(flotteEcheances.vehiculeId, vehiculeId), isNull(flotteEcheances.deletedAt)))
      .orderBy(flotteEcheances.dateEcheance),
  );
}

export type AffectationDetail = {
  id: string;
  statut: (typeof flotteAffectations.$inferSelect)['statut'];
  dateDebut: string;
  dateFin: string | null;
  kmDebut: number | null;
  kmFin: number | null;
  motif: string | null;
  employe: string | null;
  chantier: string | null;
};

export async function listerAffectationsVehicule(vehiculeId: string): Promise<AffectationDetail[]> {
  const ctx = await requireTenantContextWithMfa();
  return withTenant(ctx.entreprise.id, async (tx) => {
    const rows = await tx
      .select({
        id: flotteAffectations.id,
        statut: flotteAffectations.statut,
        dateDebut: flotteAffectations.dateDebut,
        dateFin: flotteAffectations.dateFin,
        kmDebut: flotteAffectations.kmDebut,
        kmFin: flotteAffectations.kmFin,
        motif: flotteAffectations.motif,
        employeNom: employes.nom,
        employePrenom: employes.prenom,
        chantierNumero: chantiers.numero,
        chantierLibelle: chantiers.libelle,
      })
      .from(flotteAffectations)
      .leftJoin(employes, eq(employes.id, flotteAffectations.employeId))
      .leftJoin(chantiers, eq(chantiers.id, flotteAffectations.chantierId))
      .where(
        and(eq(flotteAffectations.vehiculeId, vehiculeId), isNull(flotteAffectations.deletedAt)),
      )
      .orderBy(desc(flotteAffectations.dateDebut));
    return rows.map((r) => ({
      id: r.id,
      statut: r.statut,
      dateDebut: r.dateDebut,
      dateFin: r.dateFin,
      kmDebut: r.kmDebut,
      kmFin: r.kmFin,
      motif: r.motif,
      employe: nomComplet(r.employeNom, r.employePrenom),
      chantier: r.chantierNumero ? `${r.chantierNumero} · ${r.chantierLibelle ?? ''}`.trim() : null,
    }));
  });
}

// ─────────────────────────────────────────────────────────────
// Échéancier global + alertes (dashboard)
// ─────────────────────────────────────────────────────────────

export type AlerteEcheance = {
  id: string;
  vehiculeId: string;
  immatriculation: string;
  marque: string;
  modele: string;
  typeEcheance: TypeEcheance;
  dateEcheance: string;
  seuilAlerteJours: number;
  conducteurNom: string | null;
};

export async function listerToutesEcheances(): Promise<AlerteEcheance[]> {
  const ctx = await requireTenantContextWithMfa();
  return withTenant(ctx.entreprise.id, async (tx) => {
    const rows = await tx
      .select({
        id: flotteEcheances.id,
        vehiculeId: flotteEcheances.vehiculeId,
        immatriculation: flotteVehicules.immatriculation,
        marque: flotteVehicules.marque,
        modele: flotteVehicules.modele,
        typeEcheance: flotteEcheances.typeEcheance,
        dateEcheance: flotteEcheances.dateEcheance,
        seuilAlerteJours: flotteEcheances.seuilAlerteJours,
        conducteurNom: employes.nom,
        conducteurPrenom: employes.prenom,
      })
      .from(flotteEcheances)
      .innerJoin(flotteVehicules, eq(flotteVehicules.id, flotteEcheances.vehiculeId))
      .leftJoin(employes, eq(employes.id, flotteVehicules.conducteurPrincipalId))
      .where(and(isNull(flotteEcheances.deletedAt), isNull(flotteVehicules.deletedAt)))
      .orderBy(flotteEcheances.dateEcheance);
    return rows.map((r) => ({
      id: r.id,
      vehiculeId: r.vehiculeId,
      immatriculation: r.immatriculation,
      marque: r.marque,
      modele: r.modele,
      typeEcheance: r.typeEcheance,
      dateEcheance: r.dateEcheance,
      seuilAlerteJours: r.seuilAlerteJours,
      conducteurNom: nomComplet(r.conducteurNom, r.conducteurPrenom),
    }));
  });
}

export type DashboardFlotte = {
  today: string;
  nbVehicules: number;
  nbActifs: number;
  nbImmobilises: number;
  nbEnSinistre: number;
  nbAlertes: number;
  tcoMensuel: number;
  alertes: AlerteEcheance[];
};

export async function dashboardFlotte(): Promise<DashboardFlotte> {
  const ctx = await requireTenantContextWithMfa();
  const today = aujourdhuiIso();

  return withTenant(ctx.entreprise.id, async (tx) => {
    const vehicules = await tx
      .select({
        statut: flotteVehicules.statut,
        loyerMensuelHt: flotteVehicules.loyerMensuelHt,
      })
      .from(flotteVehicules)
      .where(isNull(flotteVehicules.deletedAt));

    const sinistresOuverts = await tx
      .select({ vehiculeId: flotteSinistres.vehiculeId })
      .from(flotteSinistres)
      .where(and(eq(flotteSinistres.clos, false), isNull(flotteSinistres.deletedAt)));

    const echeances = await tx
      .select({
        id: flotteEcheances.id,
        vehiculeId: flotteEcheances.vehiculeId,
        immatriculation: flotteVehicules.immatriculation,
        marque: flotteVehicules.marque,
        modele: flotteVehicules.modele,
        typeEcheance: flotteEcheances.typeEcheance,
        dateEcheance: flotteEcheances.dateEcheance,
        seuilAlerteJours: flotteEcheances.seuilAlerteJours,
        conducteurNom: employes.nom,
        conducteurPrenom: employes.prenom,
      })
      .from(flotteEcheances)
      .innerJoin(flotteVehicules, eq(flotteVehicules.id, flotteEcheances.vehiculeId))
      .leftJoin(employes, eq(employes.id, flotteVehicules.conducteurPrincipalId))
      .where(and(isNull(flotteEcheances.deletedAt), isNull(flotteVehicules.deletedAt)))
      .orderBy(flotteEcheances.dateEcheance);

    const nbVehicules = vehicules.length;
    const nbActifs = vehicules.filter((v) => v.statut === 'actif').length;
    const nbImmobilises = vehicules.filter(
      (v) => v.statut === 'immobilise' || v.statut === 'en_reparation',
    ).length;
    const sortie = new Set(['vendu', 'reforme', 'vole_detruit']);
    const tcoMensuel = vehicules.reduce((acc, v) => {
      if (sortie.has(v.statut) || !v.loyerMensuelHt) return acc;
      const n = Number(v.loyerMensuelHt);
      return Number.isFinite(n) ? acc + n : acc;
    }, 0);
    const nbEnSinistre = new Set(sinistresOuverts.map((s) => s.vehiculeId)).size;

    const alertes: AlerteEcheance[] = echeances.map((r) => ({
      id: r.id,
      vehiculeId: r.vehiculeId,
      immatriculation: r.immatriculation,
      marque: r.marque,
      modele: r.modele,
      typeEcheance: r.typeEcheance,
      dateEcheance: r.dateEcheance,
      seuilAlerteJours: r.seuilAlerteJours,
      conducteurNom: nomComplet(r.conducteurNom, r.conducteurPrenom),
    }));
    const nbAlertes = alertes.filter((a) =>
      estEnAlerte(a.dateEcheance, a.seuilAlerteJours, today),
    ).length;

    return {
      today,
      nbVehicules,
      nbActifs,
      nbImmobilises,
      nbEnSinistre,
      nbAlertes,
      tcoMensuel,
      alertes,
    };
  });
}

// ─────────────────────────────────────────────────────────────
// Entretiens (Phase 2)
// ─────────────────────────────────────────────────────────────

export type EntretienDetail = FlotteEntretien & { fournisseurNom: string | null };

export async function listerEntretiensVehicule(vehiculeId: string): Promise<EntretienDetail[]> {
  const ctx = await requireTenantContextWithMfa();
  return withTenant(ctx.entreprise.id, async (tx) => {
    const rows = await tx
      .select({
        entretien: flotteEntretiens,
        fournisseurNom: raisonsSociales.raisonSociale,
      })
      .from(flotteEntretiens)
      .leftJoin(fournisseurs, eq(fournisseurs.id, flotteEntretiens.fournisseurId))
      .leftJoin(raisonsSociales, eq(raisonsSociales.id, fournisseurs.raisonSocialeId))
      .where(and(eq(flotteEntretiens.vehiculeId, vehiculeId), isNull(flotteEntretiens.deletedAt)))
      .orderBy(desc(flotteEntretiens.dateEntretien));
    return rows.map((r) => ({ ...r.entretien, fournisseurNom: r.fournisseurNom }));
  });
}

// ─────────────────────────────────────────────────────────────
// Sinistres (Phase 3)
// ─────────────────────────────────────────────────────────────

export type SinistreDetail = FlotteSinistre & { conducteurNom: string | null };

export async function listerSinistresVehicule(vehiculeId: string): Promise<SinistreDetail[]> {
  const ctx = await requireTenantContextWithMfa();
  return withTenant(ctx.entreprise.id, async (tx) => {
    const rows = await tx
      .select({
        sinistre: flotteSinistres,
        conducteurNom: employes.nom,
        conducteurPrenom: employes.prenom,
      })
      .from(flotteSinistres)
      .leftJoin(employes, eq(employes.id, flotteSinistres.employeId))
      .where(and(eq(flotteSinistres.vehiculeId, vehiculeId), isNull(flotteSinistres.deletedAt)))
      .orderBy(desc(flotteSinistres.dateSinistre));
    return rows.map((r) => ({
      ...r.sinistre,
      conducteurNom: nomComplet(r.conducteurNom, r.conducteurPrenom),
    }));
  });
}

// ─────────────────────────────────────────────────────────────
// Pleins de carburant / recharges + synthèse consommation (Phase 3)
// ─────────────────────────────────────────────────────────────

export type PleinDetail = {
  id: string;
  datePlein: string;
  kilometrage: number;
  volumeLitres: string | null;
  energieKwh: string | null;
  prixHt: string;
  prixTtc: string | null;
  pleinComplet: boolean;
  station: string | null;
  /** Numéro de carte masqué (4 derniers caractères) — jamais en clair côté client. */
  carteMasquee: string | null;
  conducteurNom: string | null;
};

/** `•••• 4521` à partir du numéro en clair ; null si absent. */
function masquerCarte(numero: string | null): string | null {
  if (!numero) return null;
  const trim = numero.trim();
  if (trim.length <= 4) return `•••• ${trim}`;
  return `•••• ${trim.slice(-4)}`;
}

export async function listerPleinsVehicule(vehiculeId: string): Promise<{
  pleins: PleinDetail[];
  synthese: SyntheseConsommation;
}> {
  const ctx = await requireTenantContextWithMfa();
  return withTenant(ctx.entreprise.id, async (tx) => {
    const rows = await tx
      .select({
        plein: flottePleins,
        conducteurNom: employes.nom,
        conducteurPrenom: employes.prenom,
      })
      .from(flottePleins)
      .leftJoin(employes, eq(employes.id, flottePleins.employeId))
      .where(and(eq(flottePleins.vehiculeId, vehiculeId), isNull(flottePleins.deletedAt)))
      .orderBy(desc(flottePleins.kilometrage));

    const pleins: PleinDetail[] = rows.map((r) => ({
      id: r.plein.id,
      datePlein: r.plein.datePlein,
      kilometrage: r.plein.kilometrage,
      volumeLitres: r.plein.volumeLitres,
      energieKwh: r.plein.energieKwh,
      prixHt: r.plein.prixHt,
      prixTtc: r.plein.prixTtc,
      pleinComplet: r.plein.pleinComplet,
      station: r.plein.station,
      carteMasquee: masquerCarte(r.plein.numeroCarteCarburant),
      conducteurNom: nomComplet(r.conducteurNom, r.conducteurPrenom),
    }));

    const synthese = syntheseConsommation(
      pleins.map((p) => ({
        id: p.id,
        datePlein: p.datePlein,
        kilometrage: p.kilometrage,
        volumeLitres: p.volumeLitres,
        energieKwh: p.energieKwh,
        prixHt: p.prixHt,
        pleinComplet: p.pleinComplet,
      })),
    );
    return { pleins, synthese };
  });
}

// ─────────────────────────────────────────────────────────────
// Sélecteur de fournisseurs (garages pour les entretiens)
// ─────────────────────────────────────────────────────────────

export type FournisseurOption = { id: string; label: string };

export async function listerFournisseursPourSelecteur(): Promise<FournisseurOption[]> {
  const ctx = await requireTenantContextWithMfa();
  return withTenant(ctx.entreprise.id, async (tx) => {
    const rows = await tx
      .select({ id: fournisseurs.id, label: raisonsSociales.raisonSociale })
      .from(fournisseurs)
      .innerJoin(raisonsSociales, eq(raisonsSociales.id, fournisseurs.raisonSocialeId))
      .where(isNull(fournisseurs.deletedAt))
      .orderBy(raisonsSociales.raisonSociale);
    return rows;
  });
}
