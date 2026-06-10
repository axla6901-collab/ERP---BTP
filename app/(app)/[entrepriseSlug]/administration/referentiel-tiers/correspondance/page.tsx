import { CorrespondanceEditor } from '@/components/referencement/correspondance-editor';
import { PageToolbar } from '@/components/layout/page-toolbar';
import { requireAuthWithMfa } from '@/lib/auth/guards';
import { listerCorpsEtat } from '@/lib/referencement/corps-etat';
import { lireCorrespondance } from '@/lib/referencement/correspondance';
import { listerNaturesDocument } from '@/lib/referencement/natures-document';
import { peutAdministrerReferentielTiers } from '@/lib/referencement/permissions';
import type { NatureTiers } from '@/lib/validation/referencement-tiers';

export default async function CorrespondancePage() {
  const utilisateur = await requireAuthWithMfa();
  const peutEcrire = peutAdministrerReferentielTiers(utilisateur.role);

  const [corpsEtatAll, naturesAll] = await Promise.all([listerCorpsEtat(), listerNaturesDocument()]);
  const corpsEtatList = corpsEtatAll
    .filter((c) => c.actif)
    .map((c) => ({ id: c.id, code: c.code, libelle: c.libelle }));
  const naturesDocument = naturesAll
    .filter((n) => n.actif)
    .map((n) => ({ id: n.id, code: n.code, libelle: n.libelle }));

  const lignesByCorpsEtat: Record<
    string,
    Array<{ natureDocumentId: string; natureTiers: NatureTiers; estBloquant: boolean }>
  > = {};
  await Promise.all(
    corpsEtatList.map(async (c) => {
      const lignes = await lireCorrespondance(c.id);
      lignesByCorpsEtat[c.id] = lignes.map((l) => ({
        natureDocumentId: l.natureDocumentId,
        natureTiers: l.natureTiers as NatureTiers,
        estBloquant: l.estBloquant,
      }));
    }),
  );

  return (
    <div className="space-y-6">
      <PageToolbar
        title="Correspondance corps d’état / documents"
        subtitle="Documents requis selon le corps d’état et la nature du tiers"
      />
      <CorrespondanceEditor
        corpsEtatList={corpsEtatList}
        naturesDocument={naturesDocument}
        lignesByCorpsEtat={lignesByCorpsEtat}
        peutEcrire={peutEcrire}
      />
    </div>
  );
}
