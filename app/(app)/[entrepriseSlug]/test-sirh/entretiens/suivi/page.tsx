import { PageToolbar } from '@/components/layout/page-toolbar';
import { OngletsEntretiens } from '@/components/test-sirh/entretiens/onglets-entretiens';
import { SuiviLegalTable } from '@/components/test-sirh/entretiens/suivi-legal-table';
import { ExportCsvSirh } from '@/components/test-sirh/export-csv';
import { StatCard, StatGrid } from '@/components/ui/stat-card';
import { aujourdhuiIso } from '@/lib/test-sirh/calendrier';
import { baseSirh, exigerContexteSirhPage } from '@/lib/test-sirh/contexte';
import { genererCsv, type ColonneCsv } from '@/lib/test-sirh/csv';
import { LIBELLES_STATUT_ECHEANCE_ENTRETIEN } from '@/lib/test-sirh/entretiens/echeances';
import { creerEntretien } from '@/lib/test-sirh/entretiens/entretiens';
import {
  listerSuiviEntretiensProfessionnels,
  type SuiviEntretienProLigne,
} from '@/lib/test-sirh/entretiens/queries';
import { formatDateFr } from '@/lib/test-sirh/format';
import { peutGererSirh, ROLES_SIRH_LECTURE } from '@/lib/test-sirh/permissions';

const COLONNES_CSV: readonly ColonneCsv<SuiviEntretienProLigne>[] = [
  { entete: 'Collaborateur', valeur: (l) => l.employeNom },
  { entete: 'Matricule', valeur: (l) => l.matricule },
  { entete: 'Manager', valeur: (l) => l.managerNom },
  { entete: "Date d'entrée", valeur: (l) => formatDateFr(l.dateEntree) },
  { entete: 'Dernier entretien professionnel', valeur: (l) => formatDateFr(l.dernierEntretien) },
  { entete: 'Prochaine échéance', valeur: (l) => formatDateFr(l.prochaineEcheance) },
  { entete: 'Statut', valeur: (l) => LIBELLES_STATUT_ECHEANCE_ENTRETIEN[l.statut] },
  { entete: 'Échéance état des lieux 6 ans', valeur: (l) => formatDateFr(l.echeanceBilan) },
  {
    entete: 'Statut état des lieux',
    valeur: (l) => (l.statutBilan ? LIBELLES_STATUT_ECHEANCE_ENTRETIEN[l.statutBilan] : ''),
  },
  {
    entete: 'Entretien programmé',
    valeur: (l) =>
      l.entretienPlanifie
        ? l.entretienPlanifie.datePrevue
          ? formatDateFr(l.entretienPlanifie.datePrevue)
          : 'À planifier'
        : '',
  },
];

/** Test SIRH › Entretiens › Suivi légal de l'entretien professionnel (art. L6315-1 C. trav.). */
export default async function EntretiensSuiviPage() {
  const ctx = await exigerContexteSirhPage(ROLES_SIRH_LECTURE);
  const [lignes] = await Promise.all([listerSuiviEntretiensProfessionnels()]);
  const base = baseSirh(ctx);
  const today = aujourdhuiIso();
  const enRetard = lignes.filter((l) => l.statut === 'en_retard').length;
  const aPlanifier = lignes.filter((l) => l.statut === 'a_planifier').length;
  const bilansDus = lignes.filter(
    (l) => l.statutBilan !== null && l.statutBilan !== 'a_jour',
  ).length;

  return (
    <div className="space-y-4">
      <PageToolbar
        title="Entretiens & objectifs"
        subtitle={`Suivi légal · ${lignes.length} collaborateur${lignes.length > 1 ? 's' : ''} actif${lignes.length > 1 ? 's' : ''}`}
        backHref={base}
        backLabel="Test SIRH"
        actions={
          <ExportCsvSirh
            contenu={genererCsv(COLONNES_CSV, lignes)}
            nomFichier={`suivi entretiens professionnels ${today}`}
            disabled={lignes.length === 0}
          />
        }
      />
      <OngletsEntretiens base={base} actif="suivi" />

      <p className="text-xs text-muted-foreground">
        Art. L6315-1 du Code du travail : un entretien professionnel tous les 2 ans (depuis
        l’embauche ou le dernier entretien) et, tous les 6 ans d’ancienneté, un état des lieux
        récapitulatif du parcours. Échéance à moins de 60 jours = « à planifier ».
      </p>

      <StatGrid>
        <StatCard
          label="En retard"
          value={enRetard}
          tone={enRetard > 0 ? 'rose' : 'default'}
          hint="Échéance biennale dépassée"
        />
        <StatCard
          label="À planifier"
          value={aPlanifier}
          tone={aPlanifier > 0 ? 'amber' : 'default'}
          hint="Échéance sous 60 jours"
        />
        <StatCard label="À jour" value={lignes.length - enRetard - aPlanifier} tone="emerald" />
        <StatCard
          label="États des lieux 6 ans dus"
          value={bilansDus}
          tone={bilansDus > 0 ? 'amber' : 'default'}
        />
      </StatGrid>

      <SuiviLegalTable
        lignes={lignes.map((l) => ({
          employeId: l.employeId,
          employeNom: l.employeNom,
          employeTri: l.employeTri,
          matricule: l.matricule,
          managerId: l.managerId,
          managerNom: l.managerNom,
          dateEntree: l.dateEntree,
          dernierEntretien: l.dernierEntretien,
          dernierEntretienId: l.dernierEntretienId,
          prochaineEcheance: l.prochaineEcheance,
          joursRestants: l.joursRestants,
          statut: l.statut,
          echeanceBilan: l.echeanceBilan,
          statutBilan: l.statutBilan,
          entretienPlanifie: l.entretienPlanifie,
        }))}
        base={base}
        peutGerer={peutGererSirh(ctx.utilisateur.role)}
        creerEntretien={async (input) => {
          'use server';
          return creerEntretien(input);
        }}
      />
    </div>
  );
}
