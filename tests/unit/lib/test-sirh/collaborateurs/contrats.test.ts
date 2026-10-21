import { describe, expect, it } from 'vitest';

import {
  alertesContrat,
  alertesContrats,
  calculerKpiCollaborateurs,
  comparerAlertes,
  construireLigneRegistre,
  contratDeReference,
  contratEnCours,
  correspondAuFiltre,
  dateAncienneteEffective,
  dateEntreeEffective,
  estPresent,
  estRemplace,
  etatVersion,
  finDeContratPrevue,
  libelleEcheance,
  lireFiltreCollaborateurs,
  mentionsRegistre,
  motifFinSuggere,
  normaliserTempsTravail,
  planifierVersion,
  repartitionParType,
  statutCollaborateur,
  syntheseCollaborateur,
  trierRegistre,
  typeContratDepuisFicheRh,
  type ContratPeriode,
  type ContratRegistre,
  type EmployeRegistre,
  type SyntheseCollaborateur,
} from '@/lib/test-sirh/collaborateurs/contrats';

const TODAY = '2026-10-19';

function contrat(partiel: Partial<ContratPeriode> & { id: string }): ContratPeriode {
  return {
    typeContrat: 'cdi',
    dateDebut: '2024-01-01',
    dateFin: null,
    dateFinPeriodeEssai: null,
    motifFin: null,
    ...partiel,
  };
}

describe('contratEnCours / contratDeReference / estRemplace', () => {
  it('renvoie null sans contrat', () => {
    expect(contratEnCours([], TODAY)).toBeNull();
    expect(contratDeReference([], TODAY)).toBeNull();
  });

  it('retient la version qui couvre la date (bornes incluses)', () => {
    const a = contrat({ id: 'a', dateDebut: '2024-01-01', dateFin: '2026-10-19' });
    expect(contratEnCours([a], TODAY)?.id).toBe('a');
    const b = contrat({ id: 'b', dateDebut: '2026-10-19' });
    expect(contratEnCours([b], TODAY)?.id).toBe('b');
  });

  it('ignore les versions échues ou à venir', () => {
    const echu = contrat({ id: 'e', dateDebut: '2025-01-01', dateFin: '2026-10-18' });
    const futur = contrat({ id: 'f', dateDebut: '2026-11-01' });
    expect(contratEnCours([echu, futur], TODAY)).toBeNull();
  });

  it('en cas de chevauchement, la version la plus récemment commencée l’emporte', () => {
    const ancienne = contrat({ id: 'v1', dateDebut: '2023-01-01' });
    const avenant = contrat({ id: 'v2', dateDebut: '2026-01-01' });
    expect(contratEnCours([ancienne, avenant], TODAY)?.id).toBe('v2');
  });

  it('contrat de référence : dernier commencé, sinon prochain à venir', () => {
    const echu1 = contrat({ id: 'e1', dateDebut: '2023-01-01', dateFin: '2023-12-31' });
    const echu2 = contrat({ id: 'e2', dateDebut: '2025-01-01', dateFin: '2025-06-30' });
    expect(contratDeReference([echu1, echu2], TODAY)?.id).toBe('e2');
    const futur1 = contrat({ id: 'f1', dateDebut: '2027-01-01' });
    const futur2 = contrat({ id: 'f2', dateDebut: '2026-12-01' });
    expect(contratDeReference([futur1, futur2], TODAY)?.id).toBe('f2');
  });

  it('une version suivie d’une plus récente est remplacée', () => {
    const v1 = contrat({ id: 'v1', dateDebut: '2024-01-01', dateFin: '2025-12-31' });
    const v2 = contrat({ id: 'v2', dateDebut: '2026-01-01' });
    expect(estRemplace(v1, [v1, v2])).toBe(true);
    expect(estRemplace(v2, [v1, v2])).toBe(false);
  });

  it('état des versions : en cours, à venir, remplacée, terminée', () => {
    const v1 = contrat({ id: 'v1', dateDebut: '2024-01-01', dateFin: '2025-12-31' });
    const v2 = contrat({ id: 'v2', dateDebut: '2026-01-01' });
    const v3 = contrat({ id: 'v3', dateDebut: '2027-01-01' });
    const tous = [v1, v2, v3];
    expect(etatVersion(v1, tous, TODAY)).toBe('remplacee');
    expect(etatVersion(v2, tous, TODAY)).toBe('en_cours');
    expect(etatVersion(v3, tous, TODAY)).toBe('a_venir');
    const fini = contrat({ id: 'x', dateDebut: '2020-01-01', dateFin: '2021-01-01' });
    expect(etatVersion(fini, [fini], TODAY)).toBe('terminee');
  });
});

describe('finDeContratPrevue', () => {
  it('fin de la version en cours si elle est la dernière', () => {
    const cdd = contrat({
      id: 'c',
      typeContrat: 'cdd',
      dateDebut: '2026-05-01',
      dateFin: '2026-11-30',
    });
    expect(finDeContratPrevue([cdd], TODAY)).toBe('2026-11-30');
  });

  it('null si la version en cours est ouverte ou déjà renouvelée', () => {
    expect(finDeContratPrevue([contrat({ id: 'cdi' })], TODAY)).toBeNull();
    const cdd = contrat({
      id: 'c1',
      typeContrat: 'cdd',
      dateDebut: '2026-05-01',
      dateFin: '2026-11-30',
    });
    const renouv = contrat({
      id: 'c2',
      typeContrat: 'cdd',
      dateDebut: '2026-12-01',
      dateFin: '2027-05-31',
    });
    expect(finDeContratPrevue([cdd, renouv], TODAY)).toBeNull();
  });
});

describe('alertesContrat', () => {
  it('fin de période d’essai dans ≤ 15 jours (critique à J-7)', () => {
    const c = contrat({ id: 'c', dateDebut: '2026-08-20', dateFinPeriodeEssai: '2026-10-30' });
    const [alerte] = alertesContrat(c, TODAY);
    expect(alerte?.type).toBe('fin_periode_essai');
    expect(alerte?.jours).toBe(11);
    expect(alerte?.niveau).toBe('attention');
    expect(alerte?.message).toBe('Fin de période d’essai le 30/10/2026 (dans 11 j)');

    const proche = contrat({ id: 'p', dateDebut: '2026-08-20', dateFinPeriodeEssai: '2026-10-22' });
    expect(alertesContrat(proche, TODAY)[0]?.niveau).toBe('critique');
  });

  it('pas d’alerte d’essai au-delà de 15 jours, une fois passée ou si le contrat est rompu', () => {
    // 19/10 → 03/11 = 15 jours (seuil inclus) ; 04/11 = 16 jours.
    expect(
      alertesContrat(contrat({ id: 'a', dateFinPeriodeEssai: '2026-11-03' }), TODAY),
    ).toHaveLength(1);
    expect(
      alertesContrat(contrat({ id: 'b', dateFinPeriodeEssai: '2026-11-04' }), TODAY),
    ).toHaveLength(0);
    expect(
      alertesContrat(contrat({ id: 'c', dateFinPeriodeEssai: '2026-10-18' }), TODAY),
    ).toHaveLength(0);
    expect(
      alertesContrat(
        contrat({
          id: 'd',
          dateFinPeriodeEssai: '2026-10-25',
          dateFin: '2026-10-20',
          motifFin: 'fin_periode_essai',
        }),
        TODAY,
      ),
    ).toHaveLength(0);
  });

  it('fin de CDD dans ≤ 30 jours tant qu’aucun motif n’est saisi', () => {
    const cdd = contrat({
      id: 'c',
      typeContrat: 'cdd',
      dateDebut: '2026-04-01',
      dateFin: '2026-11-18',
    });
    const [alerte] = alertesContrat(cdd, TODAY);
    expect(alerte).toMatchObject({ type: 'fin_contrat', jours: 30, niveau: 'attention' });
    expect(alerte?.message).toBe('Fin de contrat (CDD) le 18/11/2026 (dans 30 j)');

    const loin = contrat({ id: 'l', typeContrat: 'cdd', dateFin: '2026-11-19' });
    expect(alertesContrat(loin, TODAY)).toHaveLength(0);

    const decide = contrat({
      id: 'd',
      typeContrat: 'cdd',
      dateFin: '2026-10-25',
      motifFin: 'fin_cdd',
    });
    expect(alertesContrat(decide, TODAY)).toHaveLength(0);
  });

  it('contrat échu sans motif de fin → alerte critique', () => {
    const echu = contrat({
      id: 'e',
      typeContrat: 'interim',
      dateDebut: '2026-06-01',
      dateFin: '2026-10-10',
    });
    const [alerte] = alertesContrat(echu, TODAY);
    expect(alerte).toMatchObject({
      type: 'contrat_echu_sans_motif',
      niveau: 'critique',
      jours: -9,
    });
    expect(alerte?.message).toContain('Intérim');
  });

  it('aucune alerte pour une version remplacée', () => {
    const v1 = contrat({
      id: 'v1',
      typeContrat: 'cdd',
      dateDebut: '2026-01-01',
      dateFin: '2026-06-30',
    });
    expect(alertesContrat(v1, TODAY, { remplace: true })).toEqual([]);
  });

  it('pas d’alerte d’essai si l’essai finirait après la fin du contrat', () => {
    const c = contrat({
      id: 'c',
      typeContrat: 'cdd',
      dateFin: '2026-12-31',
      dateFinPeriodeEssai: '2026-10-25',
    });
    expect(alertesContrat(c, TODAY).map((a) => a.type)).toEqual(['fin_periode_essai']);
    const incoherent = { ...c, dateFin: '2026-10-22' };
    expect(alertesContrat(incoherent, TODAY).map((a) => a.type)).toEqual(['fin_contrat']);
  });

  it('alertesContrats ignore les versions remplacées et trie critiques d’abord', () => {
    const v1 = contrat({
      id: 'v1',
      typeContrat: 'cdd',
      dateDebut: '2026-01-01',
      dateFin: '2026-06-30',
    });
    const v2 = contrat({
      id: 'v2',
      typeContrat: 'cdd',
      dateDebut: '2026-07-01',
      dateFin: '2026-10-24',
      dateFinPeriodeEssai: '2026-11-01',
    });
    const alertes = alertesContrats([v1, v2], TODAY);
    expect(alertes.map((a) => a.contratId)).toEqual(['v2']);
    expect(alertes[0]?.type).toBe('fin_contrat');
    expect(alertes[0]?.niveau).toBe('critique');
  });

  it('comparerAlertes et libelleEcheance', () => {
    expect(
      comparerAlertes(
        { niveau: 'attention', date: '2026-01-01' },
        { niveau: 'critique', date: '2027-01-01' },
      ),
    ).toBeGreaterThan(0);
    expect(
      comparerAlertes(
        { niveau: 'attention', date: '2026-01-01' },
        { niveau: 'attention', date: '2027-01-01' },
      ),
    ).toBeLessThan(0);
    expect(libelleEcheance(0)).toBe('aujourd’hui');
    expect(libelleEcheance(1)).toBe('demain');
    expect(libelleEcheance(-1)).toBe('hier');
    expect(libelleEcheance(-4)).toBe('il y a 4 j');
  });
});

describe('statutCollaborateur et filtres', () => {
  it('quatre statuts selon la fiche', () => {
    expect(statutCollaborateur({ actif: false, dateEntree: null, dateSortie: null }, TODAY)).toBe(
      'sorti',
    );
    expect(
      statutCollaborateur({ actif: true, dateEntree: null, dateSortie: '2026-10-18' }, TODAY),
    ).toBe('sorti');
    expect(
      statutCollaborateur({ actif: true, dateEntree: '2026-10-20', dateSortie: null }, TODAY),
    ).toBe('a_venir');
    expect(
      statutCollaborateur(
        { actif: true, dateEntree: '2020-01-01', dateSortie: '2026-10-19' },
        TODAY,
      ),
    ).toBe('depart_prevu');
    expect(
      statutCollaborateur({ actif: true, dateEntree: '2020-01-01', dateSortie: null }, TODAY),
    ).toBe('actif');
  });

  it('présence et filtres d’URL', () => {
    expect(estPresent('actif')).toBe(true);
    expect(estPresent('depart_prevu')).toBe(true);
    expect(estPresent('a_venir')).toBe(false);
    expect(lireFiltreCollaborateurs(undefined)).toBe('actifs');
    expect(lireFiltreCollaborateurs('sortis')).toBe('sortis');
    expect(lireFiltreCollaborateurs('nimporte')).toBe('actifs');
    expect(correspondAuFiltre('a_venir', 'actifs')).toBe(true);
    expect(correspondAuFiltre('sorti', 'actifs')).toBe(false);
    expect(correspondAuFiltre('sorti', 'sortis')).toBe(true);
    expect(correspondAuFiltre('actif', 'tous')).toBe(true);
  });
});

describe('dates dérivées', () => {
  const contrats = [
    contrat({ id: 'a', dateDebut: '2022-03-01' }),
    contrat({ id: 'b', dateDebut: '2021-09-01' }),
  ];

  it('date d’entrée : fiche RH puis premier contrat', () => {
    expect(
      dateEntreeEffective({ dateEntree: '2020-01-06', dateEmbauche: '2019-12-01' }, contrats),
    ).toBe('2020-01-06');
    expect(dateEntreeEffective({ dateEntree: null, dateEmbauche: '2019-12-01' }, contrats)).toBe(
      '2019-12-01',
    );
    expect(dateEntreeEffective({ dateEntree: null, dateEmbauche: null }, contrats)).toBe(
      '2021-09-01',
    );
    expect(dateEntreeEffective({ dateEntree: null, dateEmbauche: null }, [])).toBeNull();
  });

  it('date d’ancienneté : reprise SIRH prioritaire', () => {
    expect(
      dateAncienneteEffective(
        { dateAnciennete: '2015-05-01', dateEmbauche: '2020-01-01', dateEntree: null },
        contrats,
      ),
    ).toBe('2015-05-01');
    expect(
      dateAncienneteEffective(
        { dateAnciennete: null, dateEmbauche: null, dateEntree: '2020-02-01' },
        contrats,
      ),
    ).toBe('2020-02-01');
  });
});

describe('répartition et KPI', () => {
  it('répartit par famille de contrat', () => {
    const r = repartitionParType([
      'cdi',
      'cdi_chantier',
      'cdd',
      'interim',
      'saisonnier',
      'apprentissage',
      'professionnalisation',
      'stage',
      null,
    ]);
    expect(r).toEqual({ cdi: 2, cddInterim: 3, alternance: 2, autre: 1, sansContrat: 1, total: 9 });
  });

  it('synthèse d’un collaborateur', () => {
    const s = syntheseCollaborateur(
      { actif: true, dateEntree: null, dateEmbauche: null, dateSortie: null },
      [contrat({ id: 'c', typeContrat: 'cdd', dateDebut: '2026-10-01', dateFin: '2026-12-15' })],
      TODAY,
    );
    expect(s).toEqual({
      statut: 'actif',
      dateEntree: '2026-10-01',
      dateSortie: null,
      typeContratEnCours: 'cdd',
      finContratPrevue: '2026-12-15',
    });
  });

  it('calcule les indicateurs de la population', () => {
    const base: SyntheseCollaborateur = {
      statut: 'actif',
      dateEntree: '2020-01-01',
      dateSortie: null,
      typeContratEnCours: 'cdi',
      finContratPrevue: null,
    };
    const kpi = calculerKpiCollaborateurs(
      [
        base,
        {
          ...base,
          typeContratEnCours: 'cdd',
          dateEntree: '2026-09-25',
          finContratPrevue: '2026-12-18',
        },
        { ...base, typeContratEnCours: 'apprentissage', finContratPrevue: '2026-12-19' },
        { ...base, statut: 'depart_prevu', dateSortie: '2026-10-31', typeContratEnCours: null },
        { ...base, statut: 'sorti', dateSortie: '2026-09-20', typeContratEnCours: 'interim' },
        { ...base, statut: 'sorti', dateSortie: '2026-09-18' },
        { ...base, statut: 'a_venir', dateEntree: '2026-11-02' },
      ],
      TODAY,
    );
    expect(kpi.effectifActif).toBe(4);
    expect(kpi.arriveesAVenir).toBe(1);
    expect(kpi.repartition).toMatchObject({
      cdi: 1,
      cddInterim: 1,
      alternance: 1,
      sansContrat: 1,
      total: 4,
    });
    expect(kpi.arrivees30j).toBe(1);
    expect(kpi.departs30j).toBe(1);
    expect(kpi.finsContrat60j).toBe(1);
  });
});

describe('planifierVersion', () => {
  it('création : clôt la veille la version ouverte précédente (avenant)', () => {
    const plan = planifierVersion(
      { dateDebut: '2026-11-01', dateFin: null },
      [{ id: 'v1', dateDebut: '2024-01-01', dateFin: null, motifFin: null }],
      { creation: true },
    );
    expect(plan).toEqual({ ok: true, aClore: [{ id: 'v1', dateFin: '2026-10-31' }] });
  });

  it('aucun chevauchement : rien à clore', () => {
    const plan = planifierVersion(
      { dateDebut: '2026-11-01', dateFin: '2027-04-30' },
      [{ id: 'v1', dateDebut: '2026-05-01', dateFin: '2026-10-31', motifFin: null }],
      { creation: true },
    );
    expect(plan).toEqual({ ok: true, aClore: [] });
  });

  it('refuse le chevauchement d’une version terminée par un motif ou postérieure', () => {
    const termine = planifierVersion(
      { dateDebut: '2026-11-01', dateFin: null },
      [{ id: 'v1', dateDebut: '2024-01-01', dateFin: '2026-11-30', motifFin: 'demission' }],
      { creation: true },
    );
    expect(termine.ok).toBe(false);
    const posterieure = planifierVersion(
      { dateDebut: '2026-01-01', dateFin: null },
      [{ id: 'v2', dateDebut: '2026-06-01', dateFin: null, motifFin: null }],
      { creation: true },
    );
    expect(posterieure.ok).toBe(false);
    if (!posterieure.ok) expect(posterieure.message).toContain('ouverte depuis le 01/06/2026');
  });

  it('modification : tout chevauchement est refusé', () => {
    const plan = planifierVersion(
      { dateDebut: '2026-11-01', dateFin: null },
      [{ id: 'v1', dateDebut: '2024-01-01', dateFin: null, motifFin: null }],
      { creation: false },
    );
    expect(plan.ok).toBe(false);
  });
});

describe('helpers de saisie', () => {
  it('motif de fin suggéré selon le type', () => {
    expect(motifFinSuggere('cdd')).toBe('fin_cdd');
    expect(motifFinSuggere('interim')).toBe('fin_cdd');
    expect(motifFinSuggere('cdi_chantier')).toBe('fin_chantier');
    expect(motifFinSuggere('stage')).toBe('autre');
    expect(motifFinSuggere('cdi')).toBe('demission');
  });

  it('normalise le temps de travail (heures OU forfait)', () => {
    expect(
      normaliserTempsTravail({
        tempsTravail: 'forfait_jours',
        heuresHebdo: '35.00',
        joursForfait: 218,
      }),
    ).toEqual({ tempsTravail: 'forfait_jours', heuresHebdo: null, joursForfait: 218 });
    expect(
      normaliserTempsTravail({
        tempsTravail: 'temps_plein',
        heuresHebdo: '35.00',
        joursForfait: 218,
      }),
    ).toEqual({ tempsTravail: 'temps_plein', heuresHebdo: '35.00', joursForfait: null });
  });

  it('type de contrat depuis la fiche RH', () => {
    expect(typeContratDepuisFicheRh('CDI')).toBe('cdi');
    expect(typeContratDepuisFicheRh('INT')).toBe('interim');
    expect(typeContratDepuisFicheRh('ALT')).toBe('apprentissage');
    expect(typeContratDepuisFicheRh(null)).toBeNull();
  });
});

describe('registre du personnel', () => {
  const employe: EmployeRegistre = {
    id: 'e1',
    nom: 'Dubois',
    prenom: 'Marc André',
    nationalite: 'Française',
    dateNaissance: '1985-04-12',
    sexe: 'M',
    qualification: 'Maçon',
    classification: 'ouvrier',
    typeContrat: 'CDI',
    societeInterim: null,
    heuresHebdoContractuelles: '39.00',
    dateEntree: '2019-03-04',
    dateEmbauche: null,
    dateSortie: null,
  };

  function contratRegistre(partiel: Partial<ContratRegistre> & { id: string }): ContratRegistre {
    return {
      ...contrat(partiel),
      intitulePoste: null,
      posteIntitule: null,
      categorie: null,
      niveau: null,
      coefficient: null,
      tempsTravail: 'temps_plein',
      ...partiel,
    };
  }

  it('mentions légales selon le type de contrat', () => {
    expect(mentionsRegistre('cdd', false, null)).toEqual(['Contrat à durée déterminée']);
    expect(mentionsRegistre('interim', true, 'Intérim BTP Lyon')).toEqual([
      'Travailleur temporaire — Intérim BTP Lyon',
      'Temps partiel',
    ]);
    expect(mentionsRegistre('apprentissage', false, null)).toEqual(['Contrat d’apprentissage']);
    expect(mentionsRegistre('cdi', false, null)).toEqual([]);
  });

  it('se replie sur la fiche RH sans contrat SIRH', () => {
    const l = construireLigneRegistre(employe, [], TODAY);
    expect(l).toMatchObject({
      nom: 'Dubois',
      prenoms: 'Marc André',
      emploi: 'Maçon',
      qualification: null,
      categorie: 'ouvrier',
      typeContrat: 'cdi',
      tempsPartiel: false,
      mentions: [],
      dateEntree: '2019-03-04',
      dateSortie: null,
    });
  });

  it('fiche RH intérim à temps partiel : mentions et agence', () => {
    const l = construireLigneRegistre(
      { ...employe, typeContrat: 'INT', societeInterim: 'Manpower', heuresHebdoContractuelles: 20 },
      [],
      TODAY,
    );
    expect(l.agenceInterim).toBe('Manpower');
    expect(l.mentions).toEqual(['Travailleur temporaire — Manpower', 'Temps partiel']);
  });

  it('utilise le contrat de référence (emploi, qualification, catégorie, type)', () => {
    const l = construireLigneRegistre(
      employe,
      [
        contratRegistre({
          id: 'c1',
          typeContrat: 'cdd',
          dateDebut: '2026-03-01',
          dateFin: '2026-12-31',
          intitulePoste: 'Chef d’équipe gros œuvre',
          categorie: 'etam',
          niveau: 'E',
          coefficient: '250',
          tempsTravail: 'temps_partiel',
        }),
      ],
      TODAY,
    );
    expect(l.emploi).toBe('Chef d’équipe gros œuvre');
    expect(l.qualification).toBe('E · coef. 250');
    expect(l.categorie).toBe('etam');
    expect(l.mentions).toEqual(['Contrat à durée déterminée', 'Temps partiel']);
  });

  it('date de sortie déduite d’un contrat terminé par un motif', () => {
    const l = construireLigneRegistre(
      { ...employe, dateEntree: null },
      [
        contratRegistre({
          id: 'c1',
          typeContrat: 'cdd',
          dateDebut: '2025-01-06',
          dateFin: '2026-06-30',
          motifFin: 'fin_cdd',
        }),
      ],
      TODAY,
    );
    expect(l.dateEntree).toBe('2025-01-06');
    expect(l.dateSortie).toBe('2026-06-30');
  });

  it('tri chronologique des entrées, dates inconnues en fin', () => {
    const tri = trierRegistre([
      { nom: 'Zola', prenoms: 'Émile', dateEntree: '2020-01-01' },
      { nom: 'Martin', prenoms: 'Léa', dateEntree: null },
      { nom: 'Bernard', prenoms: 'Paul', dateEntree: '2018-05-02' },
      { nom: 'Arnaud', prenoms: 'Jean', dateEntree: '2020-01-01' },
    ]);
    expect(tri.map((l) => l.nom)).toEqual(['Bernard', 'Arnaud', 'Zola', 'Martin']);
  });
});
