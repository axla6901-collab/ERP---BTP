import type { NoteFraisLigne } from '@/lib/test-sirh/notes-frais/queries';

export const EMPLOYE_1 = '3f2b8c1e-6d4a-4e7b-9a1c-2b3c4d5e6f70';
export const EMPLOYE_2 = '9b1d4c2e-7a3f-4c8d-8e2b-1f0a9c8d7e6b';

const AUCUN_DROIT = {
  modifier: false,
  soumettre: false,
  decider: false,
  rembourser: false,
  supprimer: false,
};

/** Ligne de note de frais de test (valeurs par défaut surchargeables). */
export function ligneNoteFrais(partiel: Partial<NoteFraisLigne> & { id: string }): NoteFraisLigne {
  return {
    employeId: EMPLOYE_1,
    employeNom: 'Marc Dubois',
    dateDepense: '2026-10-15',
    nature: 'depense',
    categorie: 'repas',
    libelle: 'Déjeuner chantier',
    montantTtc: 25.3,
    montantTva: 2.3,
    distanceKm: null,
    puissanceFiscale: null,
    tauxKm: null,
    nbForfaits: null,
    montantUnitaire: null,
    chantierId: null,
    chantierLabel: null,
    justificatifDocumentId: null,
    justificatifTitre: null,
    statut: 'soumise',
    valideur: null,
    dateDecision: null,
    commentaireDecision: null,
    dateRemboursement: null,
    createdAt: '2026-10-15T08:00:00.000Z',
    ...partiel,
    droits: { ...AUCUN_DROIT, ...partiel.droits },
  };
}
