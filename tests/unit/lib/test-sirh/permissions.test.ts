import { describe, expect, it } from 'vitest';

import { ROLES } from '@/lib/auth/rbac';
import {
  peutGererSirh,
  peutLireSirh,
  peutValiderSirh,
  peutVoirPaieSirh,
  ROLES_SIRH_LIBRE_SERVICE,
} from '@/lib/test-sirh/permissions';

describe('permissions Test SIRH', () => {
  it('gestion réservée à admin et RH', () => {
    for (const role of ROLES) {
      expect(peutGererSirh(role)).toBe(role === 'admin' || role === 'rh');
    }
  });

  it('lecture ouverte à l’encadrement, fermée aux ouvriers / lecture seule / acheteurs', () => {
    expect(peutLireSirh('conducteur_travaux')).toBe(true);
    expect(peutLireSirh('chef_chantier')).toBe(true);
    expect(peutLireSirh('comptable')).toBe(true);
    expect(peutLireSirh('ouvrier')).toBe(false);
    expect(peutLireSirh('lecture_seule')).toBe(false);
    expect(peutLireSirh('acheteur')).toBe(false);
  });

  it('validation par les managers terrain mais pas par la comptabilité', () => {
    expect(peutValiderSirh('chef_chantier')).toBe(true);
    expect(peutValiderSirh('conducteur_travaux')).toBe(true);
    expect(peutValiderSirh('comptable')).toBe(false);
  });

  it('paie : admin, RH et comptable uniquement', () => {
    for (const role of ROLES) {
      expect(peutVoirPaieSirh(role)).toBe(['admin', 'rh', 'comptable'].includes(role));
    }
  });

  it('libre-service ouvert à tous les rôles', () => {
    expect([...ROLES_SIRH_LIBRE_SERVICE].sort()).toEqual([...ROLES].sort());
  });
});
