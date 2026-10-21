import 'server-only';

import type { TenantContext } from '@/lib/auth/tenant-guards';
import type { TenantTx } from '@/lib/db/with-tenant';

import { employeIdDeLUtilisateur } from '../acces';
import { peutGererSirh, peutValiderSirh, peutVoirPaieSirh } from '../permissions';
import type { ActeurNoteFrais } from './calculs';

/**
 * Profil de l'utilisateur courant vis-à-vis des notes de frais (à appeler DANS
 * `withTenant`) : sert aux contrôles des server actions comme au calcul des
 * boutons affichés (`droitsNoteFrais`) — une seule source de vérité.
 */
export async function acteurNoteFrais(tx: TenantTx, ctx: TenantContext): Promise<ActeurNoteFrais> {
  const role = ctx.utilisateur.role;
  return {
    utilisateurId: ctx.utilisateur.id,
    employeId: await employeIdDeLUtilisateur(tx, ctx.utilisateur.id),
    gerer: peutGererSirh(role),
    valider: peutValiderSirh(role),
    rembourser: peutVoirPaieSirh(role) || peutGererSirh(role),
    admin: role === 'admin',
  };
}
