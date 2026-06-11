import { describe, expect, it } from 'vitest';

import {
  PX_PAR_JOUR,
  addDays,
  buildLayout,
  calculerKpis,
  catOf,
  computeRange,
  dnum,
  elargirRange,
  fmtFR,
  fromN,
  iso,
  isoWeek,
  labelNiveau,
  trierNiveaux,
} from '@/lib/planning/gantt-utils';
import type { PlanningTacheRow } from '@/lib/planning/planning';

/**
 * Construit une tâche minimale pour les tests. Chaque champ peut être surchargé,
 * et `equipe` est vide par défaut.
 */
function tache(p: Partial<PlanningTacheRow>): PlanningTacheRow {
  return {
    id: p.id ?? crypto.randomUUID(),
    entrepriseId: p.entrepriseId ?? '00000000-0000-0000-0000-000000000000',
    chantierId: p.chantierId ?? '00000000-0000-0000-0000-000000000001',
    ordre: p.ordre ?? 0,
    libelle: p.libelle ?? 'Tâche',
    description: null,
    responsableId: null,
    statut: p.statut ?? 'a_faire',
    avancementPourcent: p.avancementPourcent ?? 0,
    dateDebutPrevue: p.dateDebutPrevue ?? null,
    dateFinPrevue: p.dateFinPrevue ?? null,
    dateDebutReelle: null,
    dateFinReelle: null,
    niveau: p.niveau ?? null,
    corpsMetier: p.corpsMetier ?? null,
    heuresPlanifiees: p.heuresPlanifiees ?? 0,
    estJalon: p.estJalon ?? false,
    predecesseurId: p.predecesseurId ?? null,
    notes: null,
    createdAt: new Date('2026-01-01'),
    updatedAt: new Date('2026-01-01'),
    createdBy: null,
    updatedBy: null,
    deletedAt: null,
    equipe: p.equipe ?? [],
  };
}

describe('gantt-utils — math dates', () => {
  it('parse/format jour ISO et arithmétique UTC stable', () => {
    expect(iso(fromN(dnum('2024-01-15')))).toBe('2024-01-15');
    expect(addDays('2024-01-15', 7)).toBe('2024-01-22');
    expect(addDays('2024-12-31', 1)).toBe('2025-01-01');
    expect(addDays('2024-01-01', -1)).toBe('2023-12-31');
  });

  it('fmtFR donne la forme courte attendue', () => {
    expect(fmtFR('2024-01-15')).toBe('15 janv.');
    expect(fmtFR('2024-09-04')).toBe('4 sept.');
  });

  it('isoWeek correspond à la semaine ISO standard', () => {
    expect(isoWeek(new Date('2024-01-01T00:00:00Z'))).toBe(1);
    expect(isoWeek(new Date('2024-01-08T00:00:00Z'))).toBe(2);
    expect(isoWeek(new Date('2023-12-31T00:00:00Z'))).toBe(52);
  });

  it('PX_PAR_JOUR cohérent : jour > semaine > mois', () => {
    expect(PX_PAR_JOUR.jour).toBeGreaterThan(PX_PAR_JOUR.semaine);
    expect(PX_PAR_JOUR.semaine).toBeGreaterThan(PX_PAR_JOUR.mois);
  });
});

describe('gantt-utils — computeRange', () => {
  it('plage par défaut quand aucune tâche datée', () => {
    const r = computeRange([], new Date('2024-06-15T00:00:00Z'));
    expect(r.projectStart).toBeNull();
    expect(r.projectEnd).toBeNull();
    expect(r.totalDays).toBe(31);
  });

  it('étend la plage de -3j à gauche et +6j à droite', () => {
    const r = computeRange([{ dateDebutPrevue: '2024-01-10', dateFinPrevue: '2024-01-20' }]);
    expect(r.projectStart).toBe('2024-01-10');
    expect(r.projectEnd).toBe('2024-01-20');
    expect(r.start).toBe(dnum('2024-01-10') - 3);
    expect(r.end).toBe(dnum('2024-01-20') + 6);
    expect(r.totalDays).toBe(20); // 11 j tâche + 3 + 6
  });

  it('ignore les tâches sans dates', () => {
    const r = computeRange([
      { dateDebutPrevue: null, dateFinPrevue: null },
      { dateDebutPrevue: '2024-02-01', dateFinPrevue: '2024-02-05' },
    ]);
    expect(r.projectStart).toBe('2024-02-01');
    expect(r.projectEnd).toBe('2024-02-05');
  });
});

describe('gantt-utils — elargirRange', () => {
  it('démarre à J-15 et couvre une fenêtre de 2 ans', () => {
    const base = computeRange([{ dateDebutPrevue: '2026-06-10', dateFinPrevue: '2026-06-20' }]);
    const r = elargirRange(base, '2026-06-15', { joursAvant: 15, anneesPlage: 2 });
    expect(iso(fromN(r.start))).toBe('2026-05-31'); // 15 jours avant le 15 juin
    expect(iso(fromN(r.end))).toBe('2028-05-31'); // 2 ans plus tard
    expect(r.totalDays).toBe(r.end - r.start + 1);
    // Les bornes de données restent inchangées.
    expect(r.projectStart).toBe('2026-06-10');
    expect(r.projectEnd).toBe('2026-06-20');
  });

  it('étend la fin si un chantier dépasse la fenêtre de 2 ans', () => {
    const base = computeRange([{ dateDebutPrevue: '2026-06-10', dateFinPrevue: '2029-03-15' }]);
    const r = elargirRange(base, '2026-06-15', { joursAvant: 15, anneesPlage: 2, padMois: 1 });
    expect(iso(fromN(r.start))).toBe('2026-05-31');
    expect(iso(fromN(r.end))).toBe('2029-04-30'); // fin du mois de mars 2029 + 1 mois
  });

  it('fenêtre de 2 ans ancrée sur aujourd’hui même sans tâche datée', () => {
    const base = computeRange([], new Date('2026-06-15T00:00:00Z'));
    const r = elargirRange(base, '2026-06-15');
    expect(iso(fromN(r.start))).toBe('2026-05-31');
    expect(iso(fromN(r.end))).toBe('2028-05-31');
  });
});

describe('gantt-utils — catOf', () => {
  it('renvoie la palette du corps de métier connu', () => {
    expect(catOf('gros_oeuvre').fill).toBe('#f59e0b');
    expect(catOf('finitions').label).toBe('Finitions');
  });

  it('renvoie un fallback neutre pour les inconnus / null', () => {
    expect(catOf(null).label).toBe('Autre');
    expect(catOf('inconnu').label).toBe('inconnu');
    expect(catOf(null).fill).toMatch(/^#/);
  });
});

describe('gantt-utils — niveaux', () => {
  it('labelNiveau résout les codes canoniques', () => {
    expect(labelNiveau('ss')).toBe('Sous-sol (SS)');
    expect(labelNiveau('rdc')).toBe('RDC');
    expect(labelNiveau('r2')).toBe('R+2');
    expect(labelNiveau('zzz')).toBe('ZZZ'); // fallback majuscules
  });

  it('trierNiveaux ordonne d’abord les connus, puis les autres alphabétiques', () => {
    expect(trierNiveaux(['r2', 'prep', 'zzz', 'ss', 'rdc'])).toEqual([
      'prep',
      'ss',
      'rdc',
      'r2',
      'zzz',
    ]);
  });
});

describe('gantt-utils — buildLayout', () => {
  it('groupe par niveau et calcule les Y des rangs', () => {
    const taches: PlanningTacheRow[] = [
      tache({
        id: 'a',
        niveau: 'rdc',
        libelle: 'A',
        dateDebutPrevue: '2024-01-01',
        dateFinPrevue: '2024-01-05',
      }),
      tache({
        id: 'b',
        niveau: 'rdc',
        libelle: 'B',
        dateDebutPrevue: '2024-01-06',
        dateFinPrevue: '2024-01-10',
      }),
      tache({
        id: 'c',
        niveau: 'r1',
        libelle: 'C',
        dateDebutPrevue: '2024-01-11',
        dateFinPrevue: '2024-01-15',
      }),
    ];
    const { rows, height } = buildLayout(taches, {
      groupBy: 'niveau',
      collapsed: new Set(),
      hiddenCats: new Set(),
      hideDone: false,
      today: '2024-01-01',
    });
    // 2 groupes + 3 tâches = 5 rangs
    expect(rows).toHaveLength(5);
    const r0 = rows[0]!;
    const r1 = rows[1]!;
    const r3 = rows[3]!;
    expect(r0.type).toBe('group');
    expect(r1.type).toBe('task');
    // RDC vient avant R+1
    expect(r0.type === 'group' && r0.group.key).toBe('rdc');
    expect(r3.type === 'group' && r3.group.key).toBe('r1');
    expect(height).toBeGreaterThan(0);
  });

  it('replie un groupe : les tâches du groupe disparaissent des rangs', () => {
    const taches: PlanningTacheRow[] = [
      tache({ id: 'a', niveau: 'rdc', dateDebutPrevue: '2024-01-01', dateFinPrevue: '2024-01-05' }),
      tache({ id: 'b', niveau: 'r1', dateDebutPrevue: '2024-01-06', dateFinPrevue: '2024-01-10' }),
    ];
    const { rows } = buildLayout(taches, {
      groupBy: 'niveau',
      collapsed: new Set(['rdc']),
      hiddenCats: new Set(),
      hideDone: false,
      today: '2024-01-01',
    });
    // RDC groupe sans tâche enfant + R+1 groupe + 1 tâche
    expect(rows.filter((r) => r.type === 'task')).toHaveLength(1);
  });

  it('hideDone masque les tâches 100% terminées AVANT aujourd’hui', () => {
    const taches: PlanningTacheRow[] = [
      tache({
        id: 'a',
        niveau: 'rdc',
        dateDebutPrevue: '2024-01-01',
        dateFinPrevue: '2024-01-05',
        avancementPourcent: 100,
      }),
      tache({
        id: 'b',
        niveau: 'rdc',
        dateDebutPrevue: '2024-01-10',
        dateFinPrevue: '2024-01-15',
        avancementPourcent: 50,
      }),
    ];
    const today = '2024-01-08';
    const { rows } = buildLayout(taches, {
      groupBy: 'niveau',
      collapsed: new Set(),
      hiddenCats: new Set(),
      hideDone: true,
      today,
    });
    const tachesVisibles = rows.filter((r) => r.type === 'task');
    expect(tachesVisibles).toHaveLength(1);
    const tv0 = tachesVisibles[0]!;
    expect(tv0.type === 'task' && tv0.task.id).toBe('b');
  });

  it('hiddenCats filtre par corps de métier', () => {
    const taches: PlanningTacheRow[] = [
      tache({
        id: 'a',
        niveau: 'rdc',
        corpsMetier: 'gros_oeuvre',
        dateDebutPrevue: '2024-01-01',
        dateFinPrevue: '2024-01-05',
      }),
      tache({
        id: 'b',
        niveau: 'rdc',
        corpsMetier: 'finitions',
        dateDebutPrevue: '2024-01-06',
        dateFinPrevue: '2024-01-10',
      }),
    ];
    const { rows } = buildLayout(taches, {
      groupBy: 'niveau',
      collapsed: new Set(),
      hiddenCats: new Set(['gros_oeuvre']),
      hideDone: false,
      today: '2024-01-01',
    });
    const ids = rows
      .filter((r): r is Extract<typeof r, { type: 'task' }> => r.type === 'task')
      .map((r) => r.task.id);
    expect(ids).toEqual(['b']);
  });

  it('group by metier : utilise corps_metier comme clé', () => {
    const taches: PlanningTacheRow[] = [
      tache({
        id: 'a',
        corpsMetier: 'gros_oeuvre',
        dateDebutPrevue: '2024-01-01',
        dateFinPrevue: '2024-01-05',
      }),
      tache({
        id: 'b',
        corpsMetier: 'finitions',
        dateDebutPrevue: '2024-01-06',
        dateFinPrevue: '2024-01-10',
      }),
    ];
    const { rows } = buildLayout(taches, {
      groupBy: 'metier',
      collapsed: new Set(),
      hiddenCats: new Set(),
      hideDone: false,
      today: '2024-01-01',
    });
    const groupes = rows.filter(
      (r): r is Extract<typeof r, { type: 'group' }> => r.type === 'group',
    );
    expect(groupes).toHaveLength(2);
    expect(groupes.map((g) => g.group.cat)).toEqual(['gros_oeuvre', 'finitions']);
  });
});

describe('gantt-utils — calculerKpis', () => {
  const range = computeRange([{ dateDebutPrevue: '2024-01-01', dateFinPrevue: '2024-01-31' }]);

  it('avancement et heures pondérés par les heures planifiées', () => {
    const taches: PlanningTacheRow[] = [
      tache({
        dateDebutPrevue: '2024-01-01',
        dateFinPrevue: '2024-01-10',
        heuresPlanifiees: 100,
        avancementPourcent: 80,
      }),
      tache({
        dateDebutPrevue: '2024-01-11',
        dateFinPrevue: '2024-01-20',
        heuresPlanifiees: 100,
        avancementPourcent: 20,
      }),
    ];
    const k = calculerKpis(taches, '2024-01-15', range);
    // (80*100 + 20*100) / 200 = 50
    expect(k.avancementPourcent).toBe(50);
    expect(k.heuresPlanifiees).toBe(200);
  });

  it('statut "à l’heure" quand delta dans [-2 ; +2] points', () => {
    const taches: PlanningTacheRow[] = [
      tache({
        dateDebutPrevue: '2024-01-01',
        dateFinPrevue: '2024-01-10',
        heuresPlanifiees: 100,
        avancementPourcent: 100,
      }),
    ];
    const k = calculerKpis(taches, '2024-01-15', range); // tâche déjà passée → attendu 100
    expect(k.statut).toBe('a_lheure');
  });

  it('statut "en retard" si delta ≤ -3 pts', () => {
    const taches: PlanningTacheRow[] = [
      tache({
        dateDebutPrevue: '2024-01-01',
        dateFinPrevue: '2024-01-10',
        heuresPlanifiees: 100,
        avancementPourcent: 0,
      }),
    ];
    const k = calculerKpis(taches, '2024-01-15', range); // attendu 100, réel 0 → -100 pts
    expect(k.statut).toBe('en_retard');
    expect(k.deltaPoints).toBeLessThanOrEqual(-3);
  });

  it('statut "en avance" si delta ≥ +3 pts', () => {
    const taches: PlanningTacheRow[] = [
      tache({
        dateDebutPrevue: '2024-01-10',
        dateFinPrevue: '2024-01-20',
        heuresPlanifiees: 100,
        avancementPourcent: 100,
      }),
    ];
    const k = calculerKpis(taches, '2024-01-12', range); // attendu ~30%, réel 100 → +70
    expect(k.statut).toBe('en_avance');
    expect(k.deltaPoints).toBeGreaterThanOrEqual(3);
  });

  it('heures équipe agrégées (prévues + faites)', () => {
    const taches: PlanningTacheRow[] = [
      tache({
        dateDebutPrevue: '2024-01-01',
        dateFinPrevue: '2024-01-10',
        heuresPlanifiees: 0, // pas de total déclaré → on prend les heures équipe
        equipe: [
          {
            id: 'e1',
            entrepriseId: '00000000-0000-0000-0000-000000000000',
            tacheId: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
            utilisateurId: 'u1',
            heuresPrevues: 40,
            heuresFaites: 16,
            ordre: 0,
            createdAt: new Date(),
            updatedAt: new Date(),
            createdBy: null,
            updatedBy: null,
            deletedAt: null,
            utilisateurEmail: 'u1@x.fr',
          },
        ],
      }),
    ];
    const k = calculerKpis(taches, '2024-01-15', range);
    expect(k.heuresPlanifiees).toBe(40);
    expect(k.heuresFaites).toBe(16);
  });
});
