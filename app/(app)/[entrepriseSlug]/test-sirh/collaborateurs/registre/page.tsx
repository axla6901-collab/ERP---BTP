import { PageToolbar } from '@/components/layout/page-toolbar';
import { RegistreTable } from '@/components/test-sirh/collaborateurs/registre-table';
import { ExportCsvSirh } from '@/components/test-sirh/export-csv';
import { aujourdhuiIso } from '@/lib/test-sirh/calendrier';
import { listerRegistrePersonnel } from '@/lib/test-sirh/collaborateurs/queries';
import { COLONNES_CSV_REGISTRE } from '@/lib/test-sirh/collaborateurs/registre';
import { baseSirh, exigerContexteSirhPage } from '@/lib/test-sirh/contexte';
import { genererCsv } from '@/lib/test-sirh/csv';
import { ROLES_SIRH_PAIE } from '@/lib/test-sirh/permissions';

/**
 * Test SIRH › Registre unique du personnel (art. L1221-13 et D1221-23 C. trav.) :
 * construit depuis la fiche RH (identité) et les contrats SIRH (emploi, type de
 * contrat), ordre chronologique des entrées, export CSV.
 */
export default async function RegistrePersonnelPage() {
  const ctx = await exigerContexteSirhPage(ROLES_SIRH_PAIE);
  const lignes = await listerRegistrePersonnel();
  const today = aujourdhuiIso();
  const base = baseSirh(ctx);
  const csv = genererCsv(COLONNES_CSV_REGISTRE, lignes);
  const presents = lignes.filter((l) => !l.dateSortie || l.dateSortie >= today).length;

  return (
    <div className="space-y-4">
      <PageToolbar
        title="Registre unique du personnel"
        subtitle={`${lignes.length} salarié${lignes.length > 1 ? 's' : ''} inscrit${lignes.length > 1 ? 's' : ''} · ${presents} présent${presents > 1 ? 's' : ''}`}
        backHref={`${base}/collaborateurs`}
        backLabel="Collaborateurs"
        actions={
          <ExportCsvSirh
            contenu={csv}
            nomFichier={`Registre du personnel ${today}`}
            disabled={lignes.length === 0}
          />
        }
      />
      <p className="text-xs text-muted-foreground">
        Mentions de l’art. D1221-23 : identité, nationalité, date de naissance, sexe, emploi et
        qualification, dates d’entrée et de sortie, mentions CDD / temps partiel / apprentissage /
        travail temporaire (avec l’entreprise de travail temporaire). Les salariés sortis restent
        inscrits : conservation 5 ans après leur départ.
      </p>
      <RegistreTable lignes={lignes} today={today} baseHref={`${base}/collaborateurs`} />
    </div>
  );
}
