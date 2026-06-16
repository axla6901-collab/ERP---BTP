import { describe, expect, it } from 'vitest';

import {
  affectationSchema,
  documentVehiculeSchema,
  echeanceSchema,
  entretienSchema,
  pleinSchema,
  sinistreSchema,
  vehiculeSchema,
} from '@/lib/validation/flotte';

const UUID = '550e8400-e29b-41d4-a716-446655440000';

describe('vehiculeSchema', () => {
  it('accepte un véhicule minimal et normalise immatriculation + défauts', () => {
    const r = vehiculeSchema.safeParse({
      immatriculation: 'aa-123-bb',
      typeVehicule: 'vl',
      marque: 'Renault',
      modele: 'Master',
      carburant: 'diesel',
      modeDetention: 'propriete',
    });
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.immatriculation).toBe('AA-123-BB');
      expect(r.data.kilometrageActuel).toBe(0);
      expect(r.data.statut).toBe('actif');
      expect(r.data.prixAcquisitionHt).toBeNull();
    }
  });

  it('normalise un montant FR (espaces + virgule) en chaîne à 2 décimales', () => {
    const r = vehiculeSchema.safeParse({
      immatriculation: 'AA-123-BB',
      typeVehicule: 'vu',
      marque: 'Ford',
      modele: 'Transit',
      carburant: 'diesel',
      modeDetention: 'lld',
      loyerMensuelHt: '12 500,50',
    });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.loyerMensuelHt).toBe('12500.50');
  });

  it("rejette un Crit'Air hors plage 0-5", () => {
    const r = vehiculeSchema.safeParse({
      immatriculation: 'AA-123-BB',
      typeVehicule: 'vl',
      marque: 'Renault',
      modele: 'Clio',
      carburant: 'essence',
      modeDetention: 'propriete',
      critair: '6',
    });
    expect(r.success).toBe(false);
  });
});

// Forme « complète » envoyée par l'UI (les champs optionnels sont passés à null).
const echeanceComplete = {
  vehiculeId: UUID,
  typeEcheance: 'controle_technique' as const,
  dateEcheance: '2026-12-31',
  libelle: null,
  dateDebutValidite: null,
  reference: null,
  prestataire: null,
  montantHt: null,
  notes: null,
};

describe('echeanceSchema', () => {
  it("applique le seuil d'alerte par défaut (30) si absent", () => {
    const r = echeanceSchema.safeParse(echeanceComplete);
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.seuilAlerteJours).toBe(30);
  });

  it("exige une date d'échéance valide", () => {
    const r = echeanceSchema.safeParse({ ...echeanceComplete, dateEcheance: '31/12/2026' });
    expect(r.success).toBe(false);
  });
});

const affectationComplete = {
  vehiculeId: UUID,
  employeId: null as string | null,
  chantierId: null as string | null,
  dateDebut: '2026-06-01',
  dateFin: null as string | null,
  kmDebut: null,
  kmFin: null,
  motif: null,
  notes: null,
};

describe('affectationSchema', () => {
  it('refuse une affectation sans conducteur ni chantier', () => {
    const r = affectationSchema.safeParse({ ...affectationComplete });
    expect(r.success).toBe(false);
  });

  it('accepte une affectation avec un conducteur (statut par défaut en_cours)', () => {
    const r = affectationSchema.safeParse({ ...affectationComplete, employeId: UUID });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.statut).toBe('en_cours');
  });

  it('refuse une date de fin antérieure au début', () => {
    const r = affectationSchema.safeParse({
      ...affectationComplete,
      chantierId: UUID,
      dateDebut: '2026-06-10',
      dateFin: '2026-06-01',
    });
    expect(r.success).toBe(false);
  });
});

describe('documentVehiculeSchema', () => {
  it('accepte des métadonnées de document valides', () => {
    const r = documentVehiculeSchema.safeParse({
      typeDocument: 'carte_grise',
      libelle: "Certificat d'immatriculation",
      minioKey: 'flotte/vehicules/x/abc.pdf',
      mimeType: 'application/pdf',
      tailleBytes: 1024,
    });
    expect(r.success).toBe(true);
  });

  it('refuse un libellé vide', () => {
    const r = documentVehiculeSchema.safeParse({
      typeDocument: 'autre',
      libelle: '',
      minioKey: 'k',
      mimeType: 'application/pdf',
    });
    expect(r.success).toBe(false);
  });
});

const entretienComplet = {
  vehiculeId: UUID,
  typeEntretien: 'vidange' as const,
  dateEntretien: '2026-06-10',
  kilometrage: '87 450',
  description: 'Vidange + filtres',
  prestataire: null,
  fournisseurId: null,
  coutHt: '320,00',
  coutTva: null,
  coutTtc: null,
  prochaineEcheanceKm: null,
  prochaineEcheanceDate: null,
  garantie: false,
  notes: null,
};

describe('entretienSchema', () => {
  it('normalise km (espaces) et coût (virgule)', () => {
    const r = entretienSchema.safeParse(entretienComplet);
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.kilometrage).toBe(87450);
      expect(r.data.coutHt).toBe('320.00');
    }
  });

  it('exige une description non vide', () => {
    const r = entretienSchema.safeParse({ ...entretienComplet, description: '   ' });
    expect(r.success).toBe(false);
  });

  it('rejette un coût négatif', () => {
    const r = entretienSchema.safeParse({ ...entretienComplet, coutHt: '-10' });
    expect(r.success).toBe(false);
  });
});

const sinistreComplet = {
  vehiculeId: UUID,
  employeId: null,
  numeroSinistre: null,
  dateSinistre: '2026-05-02',
  lieu: null,
  description: null,
  tiersImplique: false,
  montantDommagesHt: null,
  franchiseHt: null,
  indemnisationHt: null,
  clos: false,
  dateCloture: null,
  notes: null,
};

describe('sinistreSchema', () => {
  it('applique la responsabilité par défaut (indéterminée)', () => {
    const r = sinistreSchema.safeParse(sinistreComplet);
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.responsabilite).toBe('indeterminee');
      expect(r.data.clos).toBe(false);
    }
  });

  it('exige une date de sinistre valide', () => {
    const r = sinistreSchema.safeParse({ ...sinistreComplet, dateSinistre: '02/05/2026' });
    expect(r.success).toBe(false);
  });
});

const pleinComplet = {
  vehiculeId: UUID,
  employeId: null,
  datePlein: '2026-06-12',
  kilometrage: '88 000',
  volumeLitres: '52,3',
  energieKwh: null,
  prixHt: '78,90',
  prixTtc: null,
  pleinComplet: true,
  station: null,
  numeroCarteCarburant: null,
  notes: null,
};

describe('pleinSchema', () => {
  it('accepte un plein essence (volume) et normalise les nombres', () => {
    const r = pleinSchema.safeParse(pleinComplet);
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.kilometrage).toBe(88000);
      expect(r.data.volumeLitres).toBe('52.30');
      expect(r.data.prixHt).toBe('78.90');
    }
  });

  it('exige un kilométrage (calcul de consommation)', () => {
    const r = pleinSchema.safeParse({ ...pleinComplet, kilometrage: '' });
    expect(r.success).toBe(false);
  });

  it('refuse un plein sans volume ni énergie', () => {
    const r = pleinSchema.safeParse({ ...pleinComplet, volumeLitres: null, energieKwh: null });
    expect(r.success).toBe(false);
  });

  it('refuse un volume nul ou négatif', () => {
    const r = pleinSchema.safeParse({ ...pleinComplet, volumeLitres: '0' });
    expect(r.success).toBe(false);
  });
});
