import { PageToolbar } from '@/components/layout/page-toolbar';
import { AnnoncesGestion } from '@/components/test-sirh/annonces/annonces-gestion';
import { FilAnnonces } from '@/components/test-sirh/annonces/fil-annonces';
import {
  basculerEpingleAnnonce,
  enregistrerAnnonce,
  supprimerAnnonce,
} from '@/lib/test-sirh/annonces/annonces';
import { listerAnnoncesGestion, listerAnnoncesVisibles } from '@/lib/test-sirh/annonces/queries';
import { aujourdhuiIso } from '@/lib/test-sirh/calendrier';
import { baseSirh, exigerContexteSirhPage } from '@/lib/test-sirh/contexte';
import { peutGererSirh, peutLireSirh } from '@/lib/test-sirh/permissions';
import { listerEquipesOptions, listerSitesOptions } from '@/lib/test-sirh/referentiels';

/**
 * Test SIRH › Annonces (communication interne, Factorial posts).
 * Accessible à TOUS les rôles : les collaborateurs voient leur fil (annonces
 * en ligne de leur audience, filtrées côté serveur) ; les gestionnaires RH
 * voient et gèrent toutes les annonces.
 */
export default async function AnnoncesPage() {
  const ctx = await exigerContexteSirhPage();
  const base = baseSirh(ctx);
  const today = aujourdhuiIso();
  const peutGerer = peutGererSirh(ctx.utilisateur.role);
  // Le tableau de bord est réservé aux rôles de lecture RH : sinon retour vers « Mon espace ».
  const retour = peutLireSirh(ctx.utilisateur.role)
    ? { href: base, label: 'Test SIRH' }
    : { href: `${base}/mon-espace`, label: 'Mon espace' };

  if (!peutGerer) {
    const annonces = await listerAnnoncesVisibles();
    return (
      <div className="space-y-4">
        <PageToolbar
          title="Annonces"
          subtitle={`${annonces.length} annonce${annonces.length > 1 ? 's' : ''} en ligne`}
          backHref={retour.href}
          backLabel={retour.label}
        />
        <FilAnnonces annonces={annonces} today={today} />
      </div>
    );
  }

  const [annonces, sites, equipes] = await Promise.all([
    listerAnnoncesGestion(),
    listerSitesOptions(),
    listerEquipesOptions(),
  ]);
  return (
    <div className="space-y-4">
      <PageToolbar
        title="Annonces"
        subtitle="Communication interne"
        backHref={retour.href}
        backLabel={retour.label}
      />
      <AnnoncesGestion
        annonces={annonces}
        today={today}
        sites={sites}
        equipes={equipes}
        actions={{
          enregistrer: async (input) => {
            'use server';
            return enregistrerAnnonce(input);
          },
          supprimer: async (id) => {
            'use server';
            return supprimerAnnonce(id);
          },
          basculerEpingle: async (input) => {
            'use server';
            return basculerEpingleAnnonce(input);
          },
        }}
      />
    </div>
  );
}
