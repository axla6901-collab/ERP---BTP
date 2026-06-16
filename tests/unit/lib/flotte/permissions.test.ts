import { describe, expect, it } from 'vitest';

import { ROLES } from '@/lib/auth/rbac';
import { peutAffecterFlotte, peutEcrireFlotte } from '@/lib/flotte/permissions';

describe('peutEcrireFlotte', () => {
  it('autorise admin et acheteur uniquement', () => {
    expect(peutEcrireFlotte('admin')).toBe(true);
    expect(peutEcrireFlotte('acheteur')).toBe(true);
  });

  it('refuse les autres rôles', () => {
    for (const role of ROLES) {
      if (role === 'admin' || role === 'acheteur') continue;
      expect(peutEcrireFlotte(role)).toBe(false);
    }
  });
});

describe('peutAffecterFlotte', () => {
  it('autorise admin, acheteur, conducteur de travaux et chef de chantier', () => {
    expect(peutAffecterFlotte('admin')).toBe(true);
    expect(peutAffecterFlotte('acheteur')).toBe(true);
    expect(peutAffecterFlotte('conducteur_travaux')).toBe(true);
    expect(peutAffecterFlotte('chef_chantier')).toBe(true);
  });

  it('refuse les rôles non terrain', () => {
    expect(peutAffecterFlotte('comptable')).toBe(false);
    expect(peutAffecterFlotte('ouvrier')).toBe(false);
    expect(peutAffecterFlotte('lecture_seule')).toBe(false);
  });
});
