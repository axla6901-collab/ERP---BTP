import { redirect } from 'next/navigation';

import { SituationForm } from '@/components/facturation/situation-form';
import { requireAuthWithMfa } from '@/lib/auth/guards';
import { listerArticlesPourSelecteur } from '@/lib/catalogue/articles';
import { ROLES_FACTURATION_WRITE } from '@/lib/facturation/permissions';
import { parserFichierSituation } from '@/lib/facturation/import-situation';
import {
  chargerLignesDevis,
  chargerLignesPrecedentes,
  creerSituation,
  listerChantiersFacturables,
  listerDevisFacturablesChantier,
} from '@/lib/facturation/situations';

export default async function NouvelleSituationPage({
  searchParams,
}: {
  searchParams: Promise<{ chantierId?: string; devisId?: string }>;
}) {
  const utilisateur = await requireAuthWithMfa();
  if (!ROLES_FACTURATION_WRITE.includes(utilisateur.role)) {
    redirect('/facturation/situations');
  }

  const { chantierId, devisId } = await searchParams;
  const [chantiers, articles] = await Promise.all([
    listerChantiersFacturables(),
    listerArticlesPourSelecteur(),
  ]);

  return (
    <div className="space-y-4">
      <h2 className="text-xl font-medium">Nouvelle situation d&apos;avancement</h2>
      <p className="text-sm text-muted-foreground">
        Source des postes : devis accepté du chantier, ou saisie manuelle / import Excel/CSV. Chaque
        ligne peut être enrichie d&apos;un article du catalogue.
      </p>
      <SituationForm
        chantiers={chantiers}
        articles={articles.map((a) => ({
          id: a.id,
          code: a.code,
          libelle: a.libelle,
          uniteVenteSymbole: a.uniteVenteSymbole,
          prixCourant: null,
        }))}
        chantierFigeId={chantierId}
        devisFigeId={devisId}
        onSubmit={async (values) => {
          'use server';
          return creerSituation(values);
        }}
        chargerLignesPrecedentesAction={async (cid) => {
          'use server';
          return chargerLignesPrecedentes(cid);
        }}
        parserFichierAction={async (base64, nom) => {
          'use server';
          return parserFichierSituation(base64, nom);
        }}
        listerDevisFacturablesAction={async (cid) => {
          'use server';
          return listerDevisFacturablesChantier(cid);
        }}
        chargerLignesDevisAction={async (did) => {
          'use server';
          return chargerLignesDevis(did);
        }}
        successRedirect="/facturation/situations"
      />
    </div>
  );
}
