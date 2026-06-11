import { ImportForm } from '@/components/rh/import-form';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { requireAuthWithMfa } from '@/lib/auth/guards';
import { importerExcelPointage, importerJsonPointage } from '@/lib/rh/import-export';
import { ROLES_RH_WRITE } from '@/lib/rh/permissions';

export default async function ImportPage() {
  await requireAuthWithMfa(ROLES_RH_WRITE);

  return (
    <div className="space-y-6">
      <h2 className="text-xl font-medium">Importer des pointages</h2>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Fichier source</CardTitle>
        </CardHeader>
        <CardContent>
          <ImportForm
            onJson={async (text) => {
              'use server';
              return importerJsonPointage(text);
            }}
            onExcel={async (bytes) => {
              'use server';
              return importerExcelPointage(bytes);
            }}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Format attendu</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <div>
            <p className="font-semibold">JSON (export du site Pointage) :</p>
            <pre className="mt-1 overflow-x-auto rounded bg-muted/50 p-3 text-xs">
              {`{
  "pointage": [
    {
      "chantier": "BOURGOIN - MALADIUM - Z1",
      "collaborateur": "DUPONT Jean - CDI",
      "date": "2026-05-21",
      "nbr_heures_kg": 8,
      "type_document": "1 - Heures",
      "motif_absence": null,
      "panier": 1,
      "grand_panier": null,
      "nuit_panier_soir": null
    }
  ],
  "bdd": []
}`}
            </pre>
          </div>
          <div>
            <p className="font-semibold">Excel / CSV :</p>
            <p className="text-muted-foreground">
              Colonnes attendues (1re ligne = en-têtes, insensibles à la casse) :{' '}
              <code className="text-xs">
                chantier, collaborateur, date, nbr_heures_kg, type_document, motif_absence, panier,
                grand_panier, nuit_panier_soir
              </code>
            </p>
          </div>
          <p className="text-xs text-muted-foreground">
            Les employés et chantiers manquants sont créés automatiquement (chantiers rattachés au
            client générique « PTG-HIST »). Le statut par défaut est{' '}
            <code className="text-xs">terminé</code>.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
