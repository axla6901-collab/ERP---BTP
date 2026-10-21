import { PageToolbar } from '@/components/layout/page-toolbar';
import { ExportCsvSirh } from '@/components/test-sirh/export-csv';
import { FiltresNotesFraisBarre } from '@/components/test-sirh/notes-frais/filtres-notes-frais';
import { NotesFraisTable } from '@/components/test-sirh/notes-frais/notes-frais-table';
import { FilterPills, type FilterPillItem } from '@/components/ui/filter-pills';
import { StatCard, StatGrid } from '@/components/ui/stat-card';
import { aujourdhuiIso } from '@/lib/test-sirh/calendrier';
import { baseSirh, exigerContexteSirhPage } from '@/lib/test-sirh/contexte';
import { formatEuro, formatEuroArrondi, formatMois, formatNombre } from '@/lib/test-sirh/format';
import {
  deciderNoteFrais,
  enregistrerBrouillonNoteFrais,
  marquerNoteFraisRemboursee,
  soumettreBrouillonNoteFrais,
  soumettreNoteFrais,
  supprimerNoteFrais,
} from '@/lib/test-sirh/notes-frais/actions';
import {
  ANNEE_BAREME_KILOMETRIQUE,
  FILTRES_STATUT_FRAIS,
  LIBELLES_FILTRE_STATUT_FRAIS,
  lireFiltresNotesFrais,
  urlNotesFrais,
} from '@/lib/test-sirh/notes-frais/calculs';
import { csvNotesFrais } from '@/lib/test-sirh/notes-frais/export';
import {
  compterNotesFraisParStatut,
  kpiNotesFrais,
  listerNotesFrais,
  monEmployeNotesFrais,
} from '@/lib/test-sirh/notes-frais/queries';
import { peutGererSirh, ROLES_SIRH_LECTURE } from '@/lib/test-sirh/permissions';
import {
  listerChantiersOptions,
  listerDossiersDocumentsOptions,
  listerEmployesOptions,
} from '@/lib/test-sirh/referentiels';
import {
  creerDocumentSirh,
  preparerUploadSirh,
  urlTelechargementDocumentSirh,
} from '@/lib/test-sirh/stockage';

/** Nom du dossier GED amorcé pour ranger les justificatifs (cf. `DOSSIERS_DEFAUT`). */
const DOSSIER_JUSTIFICATIFS = 'Justificatifs';

/** Test SIRH › Notes de frais (Factorial expenses : Expense / Mileage / PerDiem). */
export default async function NotesFraisPage({
  searchParams,
}: {
  searchParams: Promise<{ statut?: string; employe?: string; mois?: string }>;
}) {
  const ctx = await exigerContexteSirhPage(ROLES_SIRH_LECTURE);
  const filtres = lireFiltresNotesFrais(await searchParams);
  const base = baseSirh(ctx);
  const url = `${base}/notes-frais`;
  const today = aujourdhuiIso();
  const peutGerer = peutGererSirh(ctx.utilisateur.role);

  const [notes, compteurs, kpi, employes, chantiers, dossiers, monEmploye] = await Promise.all([
    listerNotesFrais(filtres),
    compterNotesFraisParStatut(filtres),
    kpiNotesFrais(),
    listerEmployesOptions({ inclureInactifs: true }),
    listerChantiersOptions(),
    listerDossiersDocumentsOptions(),
    monEmployeNotesFrais(),
  ]);

  const total = Object.values(compteurs).reduce((a, b) => a + b, 0);
  const pills: FilterPillItem[] = FILTRES_STATUT_FRAIS.map((f) => ({
    key: f,
    label: LIBELLES_FILTRE_STATUT_FRAIS[f],
    count: f === 'toutes' ? total : compteurs[f],
    active: filtres.statut === f,
    href: urlNotesFrais(url, { ...filtres, statut: f }),
  }));
  const employesActifs = employes.filter((e) => e.actif).map((e) => ({ id: e.id, label: e.label }));
  const employesFiltre = employes.map((e) => ({
    id: e.id,
    label: e.actif ? e.label : `${e.label} (inactif)`,
  }));
  const dossierJustificatifsId =
    dossiers.find((d) => d.label === DOSSIER_JUSTIFICATIFS)?.id ?? null;
  const [annee, mois] = today.split('-').map(Number);

  return (
    <div className="space-y-4">
      <PageToolbar
        title="Notes de frais"
        subtitle={`${notes.length} note${notes.length > 1 ? 's' : ''} · ${LIBELLES_FILTRE_STATUT_FRAIS[filtres.statut].toLowerCase()}`}
        backHref={base}
        backLabel="Test SIRH"
        actions={
          <ExportCsvSirh
            contenu={csvNotesFrais(notes)}
            nomFichier={`notes-de-frais-${filtres.mois ?? today.slice(0, 7)}`}
            disabled={notes.length === 0}
          />
        }
      />

      <StatGrid>
        <StatCard
          label="À valider"
          value={kpi.aValider.nombre}
          hint={formatEuro(kpi.aValider.montant)}
          tone={kpi.aValider.nombre > 0 ? 'amber' : 'default'}
        />
        <StatCard
          label="Montant du mois"
          value={formatEuroArrondi(kpi.mois.montant)}
          hint={`${kpi.mois.nombre} note${kpi.mois.nombre > 1 ? 's' : ''} · ${formatMois(annee ?? 2000, mois ?? 1)}`}
        />
        <StatCard
          label="À rembourser"
          value={formatEuroArrondi(kpi.aRembourser.montant)}
          hint={`${kpi.aRembourser.nombre} note${kpi.aRembourser.nombre > 1 ? 's' : ''} approuvée${kpi.aRembourser.nombre > 1 ? 's' : ''}`}
          tone="sky"
        />
        <StatCard
          label="IK du mois"
          value={formatEuroArrondi(kpi.ikMois.montant)}
          hint={`${formatNombre(kpi.ikMois.km, 0)} km · ${kpi.ikMois.nombre} trajet${kpi.ikMois.nombre > 1 ? 's' : ''}`}
          tone="emerald"
        />
      </StatGrid>

      <FilterPills items={pills} aria-label="Filtrer par statut" />
      <FiltresNotesFraisBarre base={url} filtres={filtres} employes={employesFiltre} />

      <NotesFraisTable
        notes={notes}
        chantiers={chantiers}
        today={today}
        employes={employesActifs}
        employeFixe={peutGerer ? null : monEmploye}
        peutCreer={peutGerer || monEmploye !== null}
        dossierJustificatifsId={dossierJustificatifsId}
        actions={{
          enregistrerBrouillon: async (input) => {
            'use server';
            return enregistrerBrouillonNoteFrais(input);
          },
          soumettre: async (input) => {
            'use server';
            return soumettreNoteFrais(input);
          },
          soumettreBrouillon: async (id) => {
            'use server';
            return soumettreBrouillonNoteFrais(id);
          },
          decider: async (input) => {
            'use server';
            return deciderNoteFrais(input);
          },
          rembourser: async (id, dateRemboursement) => {
            'use server';
            return marquerNoteFraisRemboursee(id, dateRemboursement);
          },
          supprimer: async (id) => {
            'use server';
            return supprimerNoteFrais(id);
          },
          urlTelechargement: async (id) => {
            'use server';
            return urlTelechargementDocumentSirh(id);
          },
          televersement: {
            preparerUpload: async (cible, contentType, filename, tailleBytes) => {
              'use server';
              return preparerUploadSirh(cible, contentType, filename, tailleBytes);
            },
            creerDocument: async (input) => {
              'use server';
              return creerDocumentSirh(input);
            },
          },
        }}
      />

      <p className="text-xs text-muted-foreground">
        Indemnités kilométriques : taux proposé = 1re tranche du barème URSSAF{' '}
        {ANNEE_BAREME_KILOMETRIQUE} (voitures, + 20 % pour un véhicule électrique), modifiable note
        par note. Le barème est à vérifier chaque année.
      </p>
    </div>
  );
}
