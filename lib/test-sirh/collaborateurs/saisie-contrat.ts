/**
 * Valeurs du formulaire de version de contrat — fonctions PURES (aucune I/O),
 * utilisées par le dialogue client et testées sans DOM.
 */

import { versNombre } from '../format';
import { DUREE_LEGALE_HEBDO, type ContratInput } from '@/lib/validation/test-sirh/collaborateurs';
import type {
  CategorieProfessionnelle,
  MotifFinContrat,
  TempsTravail,
  TypeContratSirh,
} from '@/lib/validation/test-sirh/enums';

/** Version existante éditable (champs du dossier, rémunération éventuellement masquée). */
export type ContratEditable = {
  id: string;
  typeContrat: TypeContratSirh;
  motifRecours: string | null;
  dateDebut: string;
  dateFin: string | null;
  dateFinPeriodeEssai: string | null;
  motifFin: MotifFinContrat | null;
  posteId: string | null;
  intitulePoste: string | null;
  categorie: CategorieProfessionnelle | null;
  niveau: string | null;
  coefficient: string | null;
  tempsTravail: TempsTravail;
  heuresHebdo: string | null;
  joursForfait: number | null;
  conventionCollective: string | null;
  societeId: string | null;
  siteId: string | null;
  notes: string | null;
  salaireBrutMensuel: string | null;
  tauxHoraireBrut: string | null;
};

/** Poste du catalogue proposé dans le formulaire (avec sa classification). */
export type OptionPosteContrat = {
  id: string;
  label: string;
  intitule: string;
  categorie: CategorieProfessionnelle | null;
  niveau: string | null;
  coefficient: string | null;
};

/** Champs contractuels lus sur la fiche RH (cf. `lirePrefillContratDepuisFicheRh`). */
export type PrefillFicheRh = {
  typeContrat: TypeContratSirh;
  dateDebut: string | null;
  dateFin: string | null;
  intitulePoste: string | null;
  categorie: CategorieProfessionnelle | null;
  coefficient: string | null;
  heuresHebdo: string | null;
  conventionCollective: string | null;
  salaireBrutMensuel: string | null;
  tauxHoraireBrut: string | null;
};

/** Durée hebdomadaire proposée pour un nouveau contrat à temps plein. */
export const HEURES_HEBDO_DEFAUT = '35';

/** Valeurs initiales : TOUTES les clés sont présentes (convention des schémas SIRH). */
export function valeursContratParDefaut(
  employeId: string,
  contrat: ContratEditable | null,
  today: string,
): ContratInput {
  return {
    id: contrat?.id,
    employeId,
    typeContrat: contrat?.typeContrat ?? 'cdi',
    motifRecours: contrat?.motifRecours ?? null,
    dateDebut: contrat?.dateDebut ?? today,
    dateFin: contrat?.dateFin ?? null,
    dateFinPeriodeEssai: contrat?.dateFinPeriodeEssai ?? null,
    motifFin: contrat?.motifFin ?? null,
    posteId: contrat?.posteId ?? null,
    intitulePoste: contrat?.intitulePoste ?? null,
    categorie: contrat?.categorie ?? null,
    niveau: contrat?.niveau ?? null,
    coefficient: contrat?.coefficient ?? null,
    tempsTravail: contrat?.tempsTravail ?? 'temps_plein',
    heuresHebdo: contrat ? contrat.heuresHebdo : HEURES_HEBDO_DEFAUT,
    joursForfait: contrat?.joursForfait ?? null,
    conventionCollective: contrat ? contrat.conventionCollective : 'BTP',
    societeId: contrat?.societeId ?? null,
    siteId: contrat?.siteId ?? null,
    salaireBrutMensuel: contrat?.salaireBrutMensuel ?? null,
    tauxHoraireBrut: contrat?.tauxHoraireBrut ?? null,
    notes: contrat?.notes ?? null,
  };
}

/**
 * Pré-remplit une nouvelle version depuis la fiche RH. La rémunération n'est
 * reprise qu'avec le droit PAIE ; la durée hebdomadaire détermine le temps
 * partiel (< 35 h).
 */
export function appliquerPrefillFicheRh(
  valeurs: ContratInput,
  prefill: PrefillFicheRh,
  avecRemuneration: boolean,
): ContratInput {
  const heures = versNombre(prefill.heuresHebdo);
  const tempsPartiel = heures !== null && heures > 0 && heures < DUREE_LEGALE_HEBDO;
  return {
    ...valeurs,
    typeContrat: prefill.typeContrat,
    dateDebut: prefill.dateDebut ?? valeurs.dateDebut,
    dateFin: prefill.dateFin,
    intitulePoste: prefill.intitulePoste ?? valeurs.intitulePoste,
    categorie: prefill.categorie ?? valeurs.categorie,
    coefficient: prefill.coefficient ?? valeurs.coefficient,
    tempsTravail: tempsPartiel ? 'temps_partiel' : 'temps_plein',
    heuresHebdo: prefill.heuresHebdo ?? valeurs.heuresHebdo,
    joursForfait: null,
    conventionCollective: prefill.conventionCollective ?? valeurs.conventionCollective,
    salaireBrutMensuel: avecRemuneration ? prefill.salaireBrutMensuel : valeurs.salaireBrutMensuel,
    tauxHoraireBrut: avecRemuneration ? prefill.tauxHoraireBrut : valeurs.tauxHoraireBrut,
  };
}

/** Choix d'un poste du catalogue : intitulé figé + classification reprises du poste. */
export function appliquerPoste(
  valeurs: ContratInput,
  poste: OptionPosteContrat | null,
): ContratInput {
  if (!poste) return { ...valeurs, posteId: null };
  return {
    ...valeurs,
    posteId: poste.id,
    intitulePoste: poste.intitule,
    categorie: poste.categorie ?? valeurs.categorie,
    niveau: poste.niveau ?? valeurs.niveau,
    coefficient: poste.coefficient ?? valeurs.coefficient,
  };
}
