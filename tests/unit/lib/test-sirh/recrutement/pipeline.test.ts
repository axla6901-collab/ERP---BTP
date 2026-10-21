import { describe, expect, it } from 'vitest';

import {
  DELAI_RGPD_MOIS,
  TRANSITIONS_STATUT_OFFRE,
  comparerCandidatures,
  dateLimiteRgpd,
  datesOffrePourStatut,
  derniereActivite,
  estAPurgerRgpd,
  estEtapeClose,
  estEtapePipeline,
  etapePrecedente,
  etapeSuivante,
  formatFourchetteSalaire,
  libelleTransitionOffre,
  offreAccepteCandidatures,
  offreEstPourvue,
  regrouperParColonne,
  societeInterimRequise,
  statistiquesPipeline,
  transitionCandidature,
  transitionStatutOffreAutorisee,
  transitionsStatutOffre,
  typeContratRhDepuisSirh,
} from '@/lib/test-sirh/recrutement/pipeline';
import {
  ETAPES_CLOSES,
  ETAPES_PIPELINE,
  STATUTS_OFFRE,
  TYPES_CONTRAT,
  type EtapeCandidature,
} from '@/lib/validation/test-sirh/enums';

describe('étapes du pipeline', () => {
  it('distingue étapes actives et closes', () => {
    for (const e of ETAPES_PIPELINE) {
      expect(estEtapePipeline(e)).toBe(true);
      expect(estEtapeClose(e)).toBe(false);
    }
    for (const e of ETAPES_CLOSES) {
      expect(estEtapePipeline(e)).toBe(false);
      expect(estEtapeClose(e)).toBe(true);
    }
  });

  it('étape suivante dans l’ordre du pipeline, null en fin de pipeline ou si close', () => {
    expect(etapeSuivante('nouvelle')).toBe('preselection');
    expect(etapeSuivante('preselection')).toBe('entretien_rh');
    expect(etapeSuivante('entretien_rh')).toBe('entretien_technique');
    expect(etapeSuivante('entretien_technique')).toBe('proposition');
    expect(etapeSuivante('proposition')).toBeNull();
    expect(etapeSuivante('embauche')).toBeNull();
    expect(etapeSuivante('refusee')).toBeNull();
  });

  it('étape précédente, null en début de pipeline ou si close', () => {
    expect(etapePrecedente('nouvelle')).toBeNull();
    expect(etapePrecedente('preselection')).toBe('nouvelle');
    expect(etapePrecedente('proposition')).toBe('entretien_technique');
    expect(etapePrecedente('desistement')).toBeNull();
  });
});

describe('transitionCandidature', () => {
  it('autorise tout déplacement depuis une étape active (avance, retour, clôture)', () => {
    expect(transitionCandidature('nouvelle', 'entretien_rh').ok).toBe(true);
    expect(transitionCandidature('proposition', 'preselection').ok).toBe(true);
    expect(transitionCandidature('entretien_rh', 'refusee').ok).toBe(true);
    expect(transitionCandidature('entretien_rh', 'desistement').ok).toBe(true);
    expect(transitionCandidature('nouvelle', 'embauche').ok).toBe(true);
  });

  it('refuse un déplacement vers l’étape courante', () => {
    const v = transitionCandidature('preselection', 'preselection');
    expect(v.ok).toBe(false);
    if (!v.ok) expect(v.raison).toMatch(/déjà/);
  });

  it('une candidature close ne bouge plus sans réouverture explicite', () => {
    for (const close of ETAPES_CLOSES) {
      const v = transitionCandidature(close, 'preselection');
      expect(v.ok).toBe(false);
      if (!v.ok) expect(v.raison).toMatch(/rouvrez/i);
    }
  });

  it('réouverture : refus et désistement vers le pipeline uniquement', () => {
    expect(transitionCandidature('refusee', 'preselection', { reouverture: true }).ok).toBe(true);
    expect(transitionCandidature('desistement', 'nouvelle', { reouverture: true }).ok).toBe(true);
    expect(transitionCandidature('refusee', 'desistement', { reouverture: true }).ok).toBe(false);
  });

  it('une embauche ne peut jamais être rouverte', () => {
    const v = transitionCandidature('embauche', 'proposition', { reouverture: true });
    expect(v.ok).toBe(false);
    if (!v.ok) expect(v.raison).toMatch(/embauche/i);
  });

  it('une réouverture ne s’applique qu’à une candidature close', () => {
    expect(transitionCandidature('nouvelle', 'preselection', { reouverture: true }).ok).toBe(false);
  });
});

describe('regrouperParColonne', () => {
  const c = (
    id: string,
    etape: EtapeCandidature,
    note: number | null,
    dateCandidature: string,
    nom = 'Martin',
  ) => ({ id, etape, note, dateCandidature, nom, prenom: 'Léa' });

  it('répartit par étape, colonnes vides incluses, dans l’ordre du pipeline', () => {
    const { colonnes, closes } = regrouperParColonne([
      c('a', 'preselection', null, '2026-10-01'),
      c('b', 'nouvelle', 3, '2026-10-02'),
      c('d', 'refusee', null, '2026-09-01'),
      c('e', 'embauche', 5, '2026-08-01'),
    ]);
    expect(colonnes.map((col) => col.etape)).toEqual([...ETAPES_PIPELINE]);
    expect(colonnes[0]!.candidatures.map((x) => x.id)).toEqual(['b']);
    expect(colonnes[1]!.candidatures.map((x) => x.id)).toEqual(['a']);
    expect(colonnes[2]!.candidatures).toEqual([]);
    expect(closes.map((g) => g.etape)).toEqual([...ETAPES_CLOSES]);
    expect(closes[0]!.candidatures.map((x) => x.id)).toEqual(['e']);
    expect(closes[1]!.candidatures.map((x) => x.id)).toEqual(['d']);
  });

  it('trie par note décroissante, puis plus ancienne candidature, puis nom', () => {
    const { colonnes } = regrouperParColonne([
      c('sans-note', 'nouvelle', null, '2026-01-01'),
      c('note-2', 'nouvelle', 2, '2026-10-01'),
      c('note-4-recente', 'nouvelle', 4, '2026-10-05'),
      c('note-4-ancienne', 'nouvelle', 4, '2026-10-01'),
      c('note-4-ancienne-a', 'nouvelle', 4, '2026-10-01', 'Ábel'),
    ]);
    expect(colonnes[0]!.candidatures.map((x) => x.id)).toEqual([
      'note-4-ancienne-a',
      'note-4-ancienne',
      'note-4-recente',
      'note-2',
      'sans-note',
    ]);
  });

  it('comparerCandidatures est un ordre total stable', () => {
    const a = c('a', 'nouvelle', 3, '2026-10-01');
    expect(comparerCandidatures(a, { ...a })).toBe(0);
  });
});

describe('statistiquesPipeline', () => {
  it('compte actives, entretiens à venir, embauches et autres clôtures', () => {
    const maintenant = new Date('2026-10-19T10:00:00Z');
    const stats = statistiquesPipeline(
      [
        { etape: 'nouvelle', dateEntretien: null },
        { etape: 'entretien_rh', dateEntretien: '2026-10-20T08:00:00.000Z' },
        { etape: 'entretien_technique', dateEntretien: '2026-10-18T08:00:00.000Z' },
        { etape: 'embauche', dateEntretien: '2026-10-25T08:00:00.000Z' },
        { etape: 'refusee', dateEntretien: null },
        { etape: 'desistement', dateEntretien: null },
      ],
      maintenant,
    );
    expect(stats).toEqual({
      actives: 3,
      entretiensPlanifies: 1,
      embauches: 1,
      closesSansEmbauche: 2,
    });
  });
});

describe('passerelle recrutement → RH', () => {
  it('mappe chaque type de contrat SIRH vers le type RH', () => {
    expect(typeContratRhDepuisSirh('cdi')).toBe('CDI');
    expect(typeContratRhDepuisSirh('cdi_chantier')).toBe('CDI');
    expect(typeContratRhDepuisSirh('saisonnier')).toBe('CDD');
    expect(typeContratRhDepuisSirh('autre')).toBe('CDI');
    expect(typeContratRhDepuisSirh('cdd')).toBe('CDD');
    expect(typeContratRhDepuisSirh('interim')).toBe('INT');
    expect(typeContratRhDepuisSirh('apprentissage')).toBe('ALT');
    expect(typeContratRhDepuisSirh('professionnalisation')).toBe('ALT');
    expect(typeContratRhDepuisSirh('stage')).toBe('STAGE');
  });

  it('couvre tous les types SIRH avec un type RH valide', () => {
    for (const t of TYPES_CONTRAT) {
      expect(['CDI', 'CDD', 'INT', 'ALT', 'STAGE']).toContain(typeContratRhDepuisSirh(t));
    }
  });

  it('société d’intérim requise uniquement pour l’intérim (CHECK employes)', () => {
    expect(societeInterimRequise('interim')).toBe(true);
    for (const t of TYPES_CONTRAT.filter((x) => x !== 'interim')) {
      expect(societeInterimRequise(t)).toBe(false);
    }
  });
});

describe('RGPD', () => {
  it('dernière activité = date la plus récente (jour), valeurs vides ignorées', () => {
    expect(
      derniereActivite([
        '2024-01-10T08:00:00.000Z',
        null,
        '2025-03-02',
        undefined,
        '2024-12-31T23:00:00.000Z',
      ]),
    ).toBe('2025-03-02');
    expect(derniereActivite([null, undefined, ''])).toBeNull();
  });

  it('limite de conservation = dernière activité + 24 mois', () => {
    expect(DELAI_RGPD_MOIS).toBe(24);
    expect(dateLimiteRgpd('2024-10-19')).toBe('2026-10-19');
    expect(dateLimiteRgpd('2024-02-29')).toBe('2026-02-28');
  });

  it('à purger au-delà de 24 mois sans activité (strictement)', () => {
    expect(estAPurgerRgpd('2024-10-19', '2026-10-19')).toBe(false);
    expect(estAPurgerRgpd('2024-10-18', '2026-10-19')).toBe(true);
    expect(estAPurgerRgpd('2025-06-01', '2026-10-19')).toBe(false);
  });

  it('jamais à purger : candidat embauché ou sans activité connue', () => {
    expect(estAPurgerRgpd('2020-01-01', '2026-10-19', { embauche: true })).toBe(false);
    expect(estAPurgerRgpd(null, '2026-10-19')).toBe(false);
  });
});

describe('offres', () => {
  it('règle « offre pourvue » : embauches ≥ nombre de postes', () => {
    expect(offreEstPourvue(0, 1)).toBe(false);
    expect(offreEstPourvue(1, 1)).toBe(true);
    expect(offreEstPourvue(1, 2)).toBe(false);
    expect(offreEstPourvue(3, 2)).toBe(true);
    expect(offreEstPourvue(0, 0)).toBe(false);
  });

  it('transitions de statut définies pour chaque statut, sans boucle sur soi', () => {
    for (const s of STATUTS_OFFRE) {
      expect(transitionsStatutOffre(s).length).toBeGreaterThan(0);
      expect(transitionsStatutOffre(s)).not.toContain(s);
      expect(TRANSITIONS_STATUT_OFFRE[s]).toBe(transitionsStatutOffre(s));
    }
    expect(transitionStatutOffreAutorisee('brouillon', 'publiee')).toBe(true);
    expect(transitionStatutOffreAutorisee('publiee', 'suspendue')).toBe(true);
    expect(transitionStatutOffreAutorisee('pourvue', 'publiee')).toBe(true);
    expect(transitionStatutOffreAutorisee('publiee', 'brouillon')).toBe(false);
    expect(transitionStatutOffreAutorisee('brouillon', 'pourvue')).toBe(false);
  });

  it('libellés de transition', () => {
    expect(libelleTransitionOffre('brouillon', 'publiee')).toBe('Publier');
    expect(libelleTransitionOffre('suspendue', 'publiee')).toBe('Republier');
    expect(libelleTransitionOffre('publiee', 'fermee')).toBe('Fermer');
    expect(libelleTransitionOffre('publiee', 'pourvue')).toBe('Marquer pourvue');
  });

  it('seules les offres ouvertes acceptent des candidatures', () => {
    expect(offreAccepteCandidatures('brouillon')).toBe(true);
    expect(offreAccepteCandidatures('publiee')).toBe(true);
    expect(offreAccepteCandidatures('suspendue')).toBe(true);
    expect(offreAccepteCandidatures('pourvue')).toBe(false);
    expect(offreAccepteCandidatures('fermee')).toBe(false);
  });

  it('dates à la publication : publication du jour si absente, clôture dépassée effacée', () => {
    expect(
      datesOffrePourStatut('publiee', { datePublication: null, dateCloture: null }, '2026-10-19'),
    ).toEqual({ datePublication: '2026-10-19', dateCloture: null });
    expect(
      datesOffrePourStatut(
        'publiee',
        { datePublication: '2026-01-05', dateCloture: '2026-03-01' },
        '2026-10-19',
      ),
    ).toEqual({ datePublication: '2026-01-05', dateCloture: null });
    expect(
      datesOffrePourStatut(
        'publiee',
        { datePublication: '2026-10-01', dateCloture: '2026-12-31' },
        '2026-10-19',
      ),
    ).toEqual({ datePublication: '2026-10-01', dateCloture: '2026-12-31' });
  });

  it('dates à la clôture : clôture du jour si absente, jamais avant la publication', () => {
    expect(
      datesOffrePourStatut(
        'fermee',
        { datePublication: '2026-09-01', dateCloture: null },
        '2026-10-19',
      ),
    ).toEqual({ datePublication: '2026-09-01', dateCloture: '2026-10-19' });
    expect(
      datesOffrePourStatut(
        'pourvue',
        { datePublication: '2026-11-01', dateCloture: null },
        '2026-10-19',
      ),
    ).toEqual({ datePublication: '2026-11-01', dateCloture: '2026-11-01' });
    expect(
      datesOffrePourStatut(
        'pourvue',
        { datePublication: '2026-09-01', dateCloture: '2026-09-30' },
        '2026-10-19',
      ),
    ).toEqual({ datePublication: '2026-09-01', dateCloture: '2026-09-30' });
  });

  it('dates inchangées pour brouillon et suspension', () => {
    const dates = { datePublication: '2026-09-01', dateCloture: null };
    expect(datesOffrePourStatut('brouillon', dates, '2026-10-19')).toEqual(dates);
    expect(datesOffrePourStatut('suspendue', dates, '2026-10-19')).toEqual(dates);
  });

  it('fourchette de salaire lisible', () => {
    expect(formatFourchetteSalaire('2000.00', '2400.00')).toBe('2 000 – 2 400 €');
    expect(formatFourchetteSalaire('2000.00', '2000.00')).toBe('2 000 €');
    expect(formatFourchetteSalaire('2100.00', null)).toBe('à partir de 2 100 €');
    expect(formatFourchetteSalaire(null, '3000')).toBe('jusqu’à 3 000 €');
    expect(formatFourchetteSalaire(null, null)).toBe('—');
  });
});
