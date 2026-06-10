import { DevisEditor } from '@/components/commercial/devis-editor';
import { aPermission, requireAuthWithMfa } from '@/lib/auth/guards';
import { listerArticlesAvecPrix } from '@/lib/catalogue/articles';
import { listerUnites } from '@/lib/catalogue/unites';
import { listerClients } from '@/lib/commercial/clients';
import { creerDevis } from '@/lib/commercial/devis';
import { analyserClasseurDpgf, importerAvecMappingDpgf } from '@/lib/commercial/import-dpgf';
import { ROLES_COMMERCIAL_WRITE } from '@/lib/commercial/permissions';

function libelleClient(c: { type: string; raisonSociale: string | null; nom: string | null; prenom: string | null }): string {
  if (c.type === 'professionnel') return c.raisonSociale ?? '?';
  return [c.prenom, c.nom].filter(Boolean).join(' ') || '?';
}

export default async function NouveauDevisPage() {
  const utilisateur = await requireAuthWithMfa(ROLES_COMMERCIAL_WRITE);
  const [clients, articles, unites, peutImporterDpgf, peutGererPostesInternes] = await Promise.all([
    listerClients(),
    listerArticlesAvecPrix(),
    listerUnites(),
    aPermission(utilisateur.roleId, 'COMMERCIAL_DEVIS_IMPORT_DPGF'),
    aPermission(utilisateur.roleId, 'COMMERCIAL_DEVIS_POSTES_INTERNES'),
  ]);

  if (clients.length === 0) {
    return (
      <div className="rounded border border-dashed p-8 text-center text-sm text-muted-foreground">
        Aucun client disponible. Crée d&apos;abord un client.
      </div>
    );
  }

  return (
    <DevisEditor
      clients={clients.map((c) => ({
        id: c.id,
        code: c.code,
        libelle: libelleClient(c),
        adresseLigne1: c.adresseLigne1,
        adresseLigne2: c.adresseLigne2,
        codePostal: c.codePostal,
        ville: c.ville,
        email: c.email,
      }))}
      articles={articles.map((a) => ({
        id: a.id,
        code: a.code,
        libelle: a.libelle,
        uniteVenteSymbole: a.uniteVenteSymbole,
        prixCourant: a.prixCourant,
      }))}
      unites={unites.map((u) => ({ symbole: u.symbole, libelle: u.libelle }))}
      onSubmit={async (values) => {
        'use server';
        return creerDevis(values);
      }}
      analyserDpgfAction={
        peutImporterDpgf
          ? async (base64, nom) => {
              'use server';
              return analyserClasseurDpgf(base64, nom);
            }
          : undefined
      }
      importerDpgfAction={
        peutImporterDpgf
          ? async (base64, nom, mapping) => {
              'use server';
              return importerAvecMappingDpgf(base64, nom, mapping);
            }
          : undefined
      }
      peutGererPostesInternes={peutGererPostesInternes}
      successRedirect="/commercial/devis"
      successRedirectAppendId
      workflowStatutCourant="brouillon"
      workflowReadOnly
    />
  );
}
