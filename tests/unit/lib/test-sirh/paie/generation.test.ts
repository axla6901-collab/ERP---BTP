import { describe, expect, it } from 'vitest';

import {
  cleSource,
  genererVariablesPaie,
  libelleVariableAbsence,
  quantiteAbsenceDansMois,
  resumeImport,
  variablesASourceObsolete,
  type AbsencePourPaie,
  type HeuresSupPourPaie,
  type NoteFraisPourPaie,
} from '@/lib/test-sirh/paie/generation';

const OCTOBRE = { annee: 2026, mois: 10 };
const NOVEMBRE = { annee: 2026, mois: 11 };

const A = (id: string) => `3f2b8c1e-6d4a-4e7b-9a1c-2b3c4d5e6f${id}`;

function absence(partiel: Partial<AbsencePourPaie>): AbsencePourPaie {
  return {
    id: A('01'),
    employeId: 'e1',
    dateDebut: '2026-10-26',
    dateFin: '2026-11-04',
    demiJourneeDebut: false,
    demiJourneeFin: false,
    duree: '9',
    typeLibelle: 'Congés payés',
    typeCode: 'CP',
    uniteDecompte: 'jours_ouvrables',
    codeRubriquePaie: 'ABS-CP',
    ...partiel,
  };
}

describe('quantiteAbsenceDansMois', () => {
  it('découpe une absence à cheval sur deux mois (jours ouvrables)', () => {
    const a = absence({});
    expect(quantiteAbsenceDansMois(a, OCTOBRE)).toBe(6);
    expect(quantiteAbsenceDansMois(a, NOVEMBRE, ['2026-11-01'])).toBe(3);
  });

  it('rattache le samedi final au mois où l’absence se termine réellement', () => {
    // Lundi 27 → vendredi 31 juillet 2026 : 5 jours + samedi 1er août.
    const a = absence({ dateDebut: '2026-07-27', dateFin: '2026-07-31' });
    expect(quantiteAbsenceDansMois(a, { annee: 2026, mois: 7 })).toBe(6);
    expect(quantiteAbsenceDansMois(a, { annee: 2026, mois: 8 })).toBe(0);
    // Début en septembre, fin un vendredi d'octobre : le samedi suit la vraie fin.
    const b = absence({ dateDebut: '2026-09-28', dateFin: '2026-10-02' });
    expect(quantiteAbsenceDansMois(b, { annee: 2026, mois: 9 })).toBe(3);
    expect(quantiteAbsenceDansMois(b, OCTOBRE)).toBe(3);
  });

  it('n’applique les demi-journées qu’aux vraies bornes de l’absence', () => {
    const rtt = absence({
      dateDebut: '2026-09-30',
      dateFin: '2026-10-02',
      demiJourneeDebut: true,
      uniteDecompte: 'jours_ouvres',
    });
    expect(quantiteAbsenceDansMois(rtt, { annee: 2026, mois: 9 })).toBe(0.5);
    expect(quantiteAbsenceDansMois(rtt, OCTOBRE)).toBe(2);
    expect(
      quantiteAbsenceDansMois(
        absence({
          dateDebut: '2026-10-14',
          dateFin: '2026-10-16',
          demiJourneeDebut: true,
          uniteDecompte: 'jours_ouvres',
        }),
        OCTOBRE,
      ),
    ).toBe(2.5);
    expect(
      quantiteAbsenceDansMois(
        absence({ dateDebut: '2026-10-26', dateFin: '2026-10-30', demiJourneeFin: true }),
        OCTOBRE,
      ),
    ).toBe(4.5);
  });

  it('exclut les jours fériés', () => {
    const a = absence({
      dateDebut: '2026-11-09',
      dateFin: '2026-11-13',
      uniteDecompte: 'jours_ouvres',
    });
    expect(quantiteAbsenceDansMois(a, NOVEMBRE, ['2026-11-11'])).toBe(4);
  });

  it('proratise une absence en heures qui déborde du mois', () => {
    const h = absence({
      dateDebut: '2026-10-30',
      dateFin: '2026-11-02',
      duree: '8',
      uniteDecompte: 'heures',
    });
    expect(quantiteAbsenceDansMois(h, OCTOBRE)).toBe(4);
    expect(quantiteAbsenceDansMois(h, NOVEMBRE)).toBe(4);
    const interne = absence({
      dateDebut: '2026-10-12',
      dateFin: '2026-10-12',
      duree: '3.5',
      uniteDecompte: 'heures',
    });
    expect(quantiteAbsenceDansMois(interne, OCTOBRE)).toBe(3.5);
  });

  it('renvoie 0 hors du mois', () => {
    expect(
      quantiteAbsenceDansMois(absence({ dateDebut: '2026-11-10', dateFin: '2026-11-12' }), OCTOBRE),
    ).toBe(0);
  });

  it('précise l’unité dans le libellé des types en heures', () => {
    expect(
      libelleVariableAbsence({ typeLibelle: 'Congés payés', uniteDecompte: 'jours_ouvrables' }),
    ).toBe('Congés payés');
    expect(
      libelleVariableAbsence({ typeLibelle: 'Absence autorisée', uniteDecompte: 'heures' }),
    ).toBe('Absence autorisée (en heures)');
  });
});

describe('genererVariablesPaie', () => {
  const absences: AbsencePourPaie[] = [
    absence({ id: A('01') }),
    // Week-end seul en jours ouvrés : quantité nulle.
    absence({
      id: A('02'),
      dateDebut: '2026-10-17',
      dateFin: '2026-10-18',
      uniteDecompte: 'jours_ouvres',
    }),
    absence({ id: A('03'), dateDebut: '2026-11-10', dateFin: '2026-11-12' }),
  ];
  const heuresSup: HeuresSupPourPaie[] = [
    {
      id: A('11'),
      employeId: 'e1',
      dateHeures: '2026-10-12',
      dureeHeures: '2.50',
      majorationPct: 25,
      compensation: 'paiement',
      chantierLabel: 'CH-1 · Tour',
      motif: 'Coulage',
    },
    {
      id: A('12'),
      employeId: 'e1',
      dateHeures: '2026-10-13',
      dureeHeures: 2,
      majorationPct: 50,
      compensation: 'recuperation',
    },
    {
      id: A('13'),
      employeId: 'e1',
      dateHeures: '2026-11-02',
      dureeHeures: 2,
      majorationPct: 25,
      compensation: 'paiement',
    },
    {
      id: A('14'),
      employeId: 'e2',
      dateHeures: '2026-10-20',
      dureeHeures: '1.5',
      majorationPct: 25,
      compensation: 'paiement',
    },
  ];
  const notesFrais: NoteFraisPourPaie[] = [
    {
      id: A('21'),
      employeId: 'e2',
      dateDepense: '2026-10-05',
      libelle: 'Déjeuner',
      categorie: 'repas',
      montantTtc: '18.50',
    },
    // Approuvée tardivement (mois précédent) : rattrapée.
    {
      id: A('22'),
      employeId: 'e2',
      dateDepense: '2026-09-28',
      libelle: 'Péage A7',
      categorie: 'peage_parking',
      montantTtc: 12,
    },
    {
      id: A('23'),
      employeId: 'e2',
      dateDepense: '2026-11-03',
      libelle: 'Hôtel',
      categorie: 'hebergement',
      montantTtc: 90,
    },
    {
      id: A('24'),
      employeId: 'e2',
      dateDepense: '2026-10-07',
      libelle: 'Offert',
      categorie: 'autre',
      montantTtc: '0',
    },
  ];

  const resultat = genererVariablesPaie({
    periode: OCTOBRE,
    absences,
    heuresSup,
    notesFrais,
    existantes: [
      { source: 'heures_sup', sourceId: A('14') },
      { source: 'manuelle', sourceId: null },
    ],
  });

  it('génère une variable par élément validé du mois', () => {
    expect(resultat.variables).toHaveLength(4);
    expect(resultat.variables[0]).toEqual({
      employeId: 'e1',
      typeVariable: 'absence',
      libelle: 'Congés payés',
      codeRubrique: 'ABS-CP',
      quantite: '6.00',
      montant: null,
      source: 'absence',
      sourceId: A('01'),
      commentaire: 'Du 26/10/2026 au 04/11/2026 (CP)',
    });
    expect(resultat.variables[1]).toEqual({
      employeId: 'e1',
      typeVariable: 'heures_supplementaires',
      libelle: 'Heures supplémentaires +25 %',
      codeRubrique: null,
      quantite: '2.50',
      montant: null,
      source: 'heures_sup',
      sourceId: A('11'),
      commentaire: 'Le 12/10/2026 — CH-1 · Tour — Coulage',
    });
    expect(resultat.variables[2]).toMatchObject({
      typeVariable: 'remboursement_frais',
      libelle: 'Repas : Déjeuner',
      montant: '18.50',
      quantite: null,
      source: 'note_frais',
      sourceId: A('21'),
    });
    expect(resultat.variables[3]).toMatchObject({
      libelle: 'Péage / parking : Péage A7',
      montant: '12.00',
      commentaire: 'Dépense du 28/09/2026',
    });
  });

  it('compte les éléments importés et ignorés', () => {
    expect(resultat.parSource).toEqual({ absence: 1, heures_sup: 1, note_frais: 2 });
    expect(resultat.ignorees).toEqual({ dejaImportees: 1, horsPeriode: 4, valeurNulle: 2 });
  });

  it('est idempotent : un second import ne génère rien', () => {
    const second = genererVariablesPaie({
      periode: OCTOBRE,
      absences,
      heuresSup,
      notesFrais,
      existantes: [
        ...resultat.variables.map((v) => ({ source: v.source, sourceId: v.sourceId })),
        { source: 'heures_sup' as const, sourceId: A('14') },
      ],
    });
    expect(second.variables).toEqual([]);
    expect(second.ignorees.dejaImportees).toBe(5);
  });

  it('déduplique un même élément fourni deux fois', () => {
    const r = genererVariablesPaie({ periode: OCTOBRE, absences: [absences[0]!, absences[0]!] });
    expect(r.variables).toHaveLength(1);
    expect(r.ignorees.dejaImportees).toBe(1);
  });

  it('utilise les fériés propres au collaborateur en priorité', () => {
    const a = absence({
      id: A('31'),
      dateDebut: '2026-10-19',
      dateFin: '2026-10-23',
      uniteDecompte: 'jours_ouvres',
    });
    const sansFerie = genererVariablesPaie({ periode: OCTOBRE, absences: [a], feries: [] });
    expect(sansFerie.variables[0]?.quantite).toBe('5.00');
    const avecFerieSite = genererVariablesPaie({
      periode: OCTOBRE,
      absences: [a],
      feries: [],
      feriesParEmploye: new Map([['e1', ['2026-10-21']]]),
    });
    expect(avecFerieSite.variables[0]?.quantite).toBe('4.00');
  });
});

describe('variablesASourceObsolete', () => {
  it('signale les variables importées dont l’élément d’origine n’est plus valide', () => {
    const variables = [
      { id: 'v1', source: 'absence' as const, sourceId: A('01') },
      { id: 'v2', source: 'heures_sup' as const, sourceId: A('11') },
      { id: 'v3', source: 'manuelle' as const, sourceId: null },
      { id: 'v4', source: 'note_frais' as const, sourceId: A('21') },
    ];
    const valides = new Set([cleSource('absence', A('01')), cleSource('note_frais', A('21'))]);
    expect(variablesASourceObsolete(variables, valides)).toEqual(['v2']);
    expect(variablesASourceObsolete(variables, new Set())).toEqual(['v1', 'v2', 'v4']);
    expect(cleSource('absence', 'x')).toBe('absence:x');
  });
});

describe('resumeImport', () => {
  it('résume les éléments importés', () => {
    expect(resumeImport({ absence: 2, heures_sup: 1, note_frais: 0 })).toBe(
      '2 absences et 1 demande d’heures sup.',
    );
    expect(resumeImport({ absence: 1, heures_sup: 2, note_frais: 3 })).toBe(
      '1 absence, 2 demandes d’heures sup. et 3 notes de frais',
    );
    expect(resumeImport({ absence: 0, heures_sup: 0, note_frais: 0 })).toBe('aucun nouvel élément');
  });
});
