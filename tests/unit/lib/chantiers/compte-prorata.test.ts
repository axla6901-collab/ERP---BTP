import { describe, expect, it } from 'vitest';

import {
  calculerBilan,
  calculerFraisGestion,
  calculerQuoteParts,
  genererArrete,
  repartirMontant,
  totalDepenses,
  totalMarche,
  type DepenseCalcul,
  type ParticipantCalcul,
} from '@/lib/chantiers/compte-prorata';

function part(
  id: string,
  montantMarcheHt: string,
  opts: { manuel?: string | null; gestionnaire?: boolean } = {},
): ParticipantCalcul {
  return {
    id,
    libelle: id,
    montantMarcheHt,
    quotePartPctManuel: opts.manuel ?? null,
    estGestionnaire: opts.gestionnaire ?? false,
  };
}

function depense(id: string, avanceParParticipantId: string, montantHt: string): DepenseCalcul {
  return { id, avanceParParticipantId, montantHt };
}

const sommePourcent = (qp: { pourcent: string }[]) =>
  qp.reduce((s, q) => s + Number(q.pourcent), 0);

describe('calculerQuoteParts', () => {
  it('retourne [] sans participant', () => {
    expect(calculerQuoteParts([])).toEqual([]);
  });

  it('attribue 100 % à un participant unique', () => {
    const qp = calculerQuoteParts([part('A', '0')]);
    expect(qp).toEqual([{ participantId: 'A', pourcent: '100.00', manuel: false }]);
  });

  it('répartit au prorata du montant de marché (somme = 100,00)', () => {
    const qp = calculerQuoteParts([
      part('A', '60000'),
      part('B', '40000'),
    ]);
    expect(qp.find((q) => q.participantId === 'A')?.pourcent).toBe('60.00');
    expect(qp.find((q) => q.participantId === 'B')?.pourcent).toBe('40.00');
    expect(sommePourcent(qp)).toBeCloseTo(100, 5);
  });

  it('distribue le reliquat d’arrondi (3 marchés égaux → 33,34 / 33,33 / 33,33)', () => {
    const qp = calculerQuoteParts([part('A', '100'), part('B', '100'), part('C', '100')]);
    const pcts = qp.map((q) => q.pourcent).sort();
    expect(pcts).toEqual(['33.33', '33.33', '33.34']);
    expect(sommePourcent(qp)).toBeCloseTo(100, 5);
  });

  it('parts égales si aucun marché (tous à 0)', () => {
    const qp = calculerQuoteParts([part('A', '0'), part('B', '0')]);
    expect(qp.map((q) => q.pourcent)).toEqual(['50.00', '50.00']);
  });

  it('respecte une surcharge manuelle et renormalise les autres au prorata', () => {
    const qp = calculerQuoteParts([
      part('A', '0', { manuel: '50' }),
      part('B', '30000'),
      part('C', '10000'),
    ]);
    const byId = new Map(qp.map((q) => [q.participantId, q]));
    expect(byId.get('A')).toMatchObject({ pourcent: '50.00', manuel: true });
    expect(byId.get('B')?.pourcent).toBe('37.50'); // 50 % restant × 30000/40000
    expect(byId.get('C')?.pourcent).toBe('12.50'); // 50 % restant × 10000/40000
    expect(sommePourcent(qp)).toBeCloseTo(100, 5);
  });

  it('manuel à 100 % ⇒ les autres à 0 %', () => {
    const qp = calculerQuoteParts([
      part('A', '0', { manuel: '100' }),
      part('B', '50000'),
    ]);
    const byId = new Map(qp.map((q) => [q.participantId, q]));
    expect(byId.get('A')?.pourcent).toBe('100.00');
    expect(byId.get('B')?.pourcent).toBe('0.00');
  });

  it('Σ manuels > 100 ⇒ remise à l’échelle 100, autos à 0', () => {
    const qp = calculerQuoteParts([
      part('A', '0', { manuel: '60' }),
      part('B', '0', { manuel: '60' }),
      part('C', '50000'),
    ]);
    const byId = new Map(qp.map((q) => [q.participantId, q]));
    expect(byId.get('A')?.pourcent).toBe('50.00');
    expect(byId.get('B')?.pourcent).toBe('50.00');
    expect(byId.get('C')?.pourcent).toBe('0.00');
    expect(sommePourcent(qp)).toBeCloseTo(100, 5);
  });
});

describe('repartirMontant', () => {
  it('garantit Σ montantDu === montant (reliquat distribué au centime)', () => {
    const qp = calculerQuoteParts([part('A', '100'), part('B', '100'), part('C', '100')]);
    const rep = repartirMontant('100.00', qp);
    const somme = rep.reduce((s, r) => s + Number(r.montantDu), 0);
    expect(somme).toBeCloseTo(100, 5);
    const montants = rep.map((r) => r.montantDu).sort();
    expect(montants).toEqual(['33.33', '33.33', '33.34']);
  });

  it('répartit un montant à la quote-part exacte', () => {
    const qp = calculerQuoteParts([part('A', '60000'), part('B', '40000')]);
    const rep = repartirMontant('1000.00', qp);
    const byId = new Map(rep.map((r) => [r.participantId, r.montantDu]));
    expect(byId.get('A')).toBe('600.00');
    expect(byId.get('B')).toBe('400.00');
  });
});

describe('totalDepenses / totalMarche / calculerFraisGestion', () => {
  it('somme les dépenses', () => {
    expect(totalDepenses([depense('1', 'A', '1000'), depense('2', 'B', '500.50')])).toBe('1500.50');
  });

  it('somme les marchés', () => {
    expect(totalMarche([part('A', '60000'), part('B', '40000')])).toBe('100000.00');
  });

  it('calcule les frais de gestion (et 0 si null/0)', () => {
    expect(calculerFraisGestion('1000.00', '10')).toBe('100.00');
    expect(calculerFraisGestion('1000.00', null)).toBe('0.00');
    expect(calculerFraisGestion('1000.00', '0')).toBe('0.00');
  });
});

describe('calculerBilan', () => {
  const participants = [
    part('G', '20000', { gestionnaire: true }),
    part('A', '60000'),
    part('B', '40000'),
  ];
  const depenses = [depense('d1', 'A', '1000'), depense('d2', 'B', '500')];

  it('équilibre : Σ soldes === 0,00 (sans frais)', () => {
    const bilan = calculerBilan(participants, depenses, null);
    expect(bilan.totalDepensesHt).toBe('1500.00');
    expect(bilan.baseRepartie).toBe('1500.00');
    expect(bilan.coherence.sommeSolde).toBe('0.00');
    expect(bilan.coherence.equilibre).toBe(true);
    expect(bilan.coherence.sommePourcent).toBe('100.00');
    // Σ des montants dus = base répartie.
    expect(bilan.coherence.sommeMontantDu).toBe('1500.00');
  });

  it('classe les soldes créditeur / débiteur selon avances vs quote-part', () => {
    const bilan = calculerBilan(participants, depenses, null);
    const byId = new Map(bilan.soldes.map((s) => [s.participantId, s]));
    // A a avancé 1000 mais doit 50 % de 1500 = 750 → créditeur de 250.
    expect(byId.get('A')?.montantDu).toBe('750.00');
    expect(byId.get('A')?.solde).toBe('250.00');
    expect(byId.get('A')?.sens).toBe('crediteur');
    // B a avancé 500 mais doit 33,33 % ≈ 500 → proche de l'équilibre.
    expect(byId.get('B')?.sens === 'debiteur' || byId.get('B')?.sens === 'crediteur').toBe(true);
  });

  it('crédite les frais de gestion au gestionnaire (Σ soldes reste 0)', () => {
    const bilan = calculerBilan(participants, depenses, '10');
    expect(bilan.fraisGestionMontant).toBe('150.00'); // 10 % de 1500
    expect(bilan.baseRepartie).toBe('1650.00');
    const g = bilan.soldes.find((s) => s.participantId === 'G');
    expect(g?.creditFraisGestion).toBe('150.00');
    expect(bilan.coherence.sommeSolde).toBe('0.00');
    expect(bilan.coherence.equilibre).toBe(true);
  });
});

describe('genererArrete', () => {
  it('reprend le bilan et ajoute numéro + date', () => {
    const arrete = genererArrete(
      [part('A', '60000'), part('B', '40000')],
      [depense('d1', 'A', '1000')],
      null,
      { numero: 1, dateArrete: '2026-06-10' },
    );
    expect(arrete.numero).toBe(1);
    expect(arrete.dateArrete).toBe('2026-06-10');
    expect(arrete.totalDepensesHt).toBe('1000.00');
    expect(arrete.coherence.equilibre).toBe(true);
  });
});
