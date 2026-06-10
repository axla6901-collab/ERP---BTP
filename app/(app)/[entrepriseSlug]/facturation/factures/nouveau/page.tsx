import { redirect } from 'next/navigation';

import { FactureEditor } from '@/components/facturation/facture-editor';
import { requireAuthWithMfa } from '@/lib/auth/guards';
import { listerArticlesPourSelecteur } from '@/lib/catalogue/articles';
import { listerChantiers } from '@/lib/chantiers/chantiers';
import { listerClients } from '@/lib/commercial/clients';
import { listerDevis } from '@/lib/commercial/devis';
import { creerFacture } from '@/lib/facturation/factures';
import { ROLES_FACTURATION_WRITE } from '@/lib/facturation/permissions';

function libelleClient(c: {
  type: string;
  raisonSociale: string | null;
  nom: string | null;
  prenom: string | null;
}): string {
  if (c.type === 'professionnel') return c.raisonSociale ?? '?';
  return [c.prenom, c.nom].filter(Boolean).join(' ') || '?';
}

export default async function NouvelleFacturePage() {
  const utilisateur = await requireAuthWithMfa();
  if (!ROLES_FACTURATION_WRITE.includes(utilisateur.role)) {
    redirect('/facturation/factures');
  }

  const [clients, chantiers, devis, articles] = await Promise.all([
    listerClients(),
    listerChantiers(),
    listerDevis(),
    listerArticlesPourSelecteur(),
  ]);

  return (
    <div className="space-y-4">
      <h2 className="text-xl font-medium">Nouvelle facture</h2>
      <FactureEditor
        clients={clients.map((c) => ({ id: c.id, code: c.code, libelle: libelleClient(c) }))}
        chantiers={chantiers.map((c) => ({
          id: c.id,
          numero: c.numero,
          libelle: c.libelle,
        }))}
        devis={devis
          .filter((d) => d.statut === 'gagne' || d.statut === 'envoye')
          .map((d) => ({ id: d.id, numero: d.numero, clientId: d.clientId }))}
        articles={articles.map((a) => ({
          id: a.id,
          code: a.code,
          libelle: a.libelle,
          uniteVenteSymbole: a.uniteVenteSymbole,
          prixCourant: null,
        }))}
        onSubmit={async (values) => {
          'use server';
          return creerFacture(values);
        }}
        successRedirect="/facturation/factures"
        successRedirectAppendId
      />
    </div>
  );
}
