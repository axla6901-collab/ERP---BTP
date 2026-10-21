import { PageToolbar } from '@/components/layout/page-toolbar';
import { AbsencesListe } from '@/components/test-sirh/absences/absences-liste';
import { FiltresDemandesAbsence } from '@/components/test-sirh/absences/filtres-demandes';
import { NouvelleDemandeAbsence } from '@/components/test-sirh/absences/nouvelle-demande-absence';
import { OngletsAbsences } from '@/components/test-sirh/absences/onglets-absences';
import { FilterPills, type FilterPillItem } from '@/components/ui/filter-pills';
import { StatCard, StatGrid } from '@/components/ui/stat-card';
import { annulerAbsence, deciderAbsence, demanderAbsence } from '@/lib/test-sirh/absences/demandes';
import {
  FILTRES_STATUT_DEMANDE,
  LIBELLES_FILTRE_STATUT,
  hrefDemandes,
  lireFiltresDemandes,
  type ParametresUrl,
} from '@/lib/test-sirh/absences/filtres';
import {
  chargerContexteDemandeAbsence,
  chargerMonContexteDemandeAbsence,
  kpiAbsences,
  lireMonEmployeId,
  listerDemandesAbsence,
} from '@/lib/test-sirh/absences/queries';
import { aujourdhuiIso } from '@/lib/test-sirh/calendrier';
import { baseSirh, exigerContexteSirhPage } from '@/lib/test-sirh/contexte';
import { formatDateFr, formatJours } from '@/lib/test-sirh/format';
import { peutGererSirh, peutValiderSirh, ROLES_SIRH_LECTURE } from '@/lib/test-sirh/permissions';
import { listerEmployesOptions } from '@/lib/test-sirh/referentiels';
import {
  creerDocumentSirh,
  preparerUploadSirh,
  urlTelechargementDocumentSirh,
} from '@/lib/test-sirh/stockage';

/** Test SIRH › Absences › Demandes (Factorial timeoff/Leave). */
export default async function AbsencesDemandesPage({
  searchParams,
}: {
  searchParams: Promise<ParametresUrl>;
}) {
  const ctx = await exigerContexteSirhPage(ROLES_SIRH_LECTURE);
  const filtres = lireFiltresDemandes(await searchParams);
  const today = aujourdhuiIso();
  const role = ctx.utilisateur.role;
  const gestionnaire = peutGererSirh(role);
  const base = baseSirh(ctx);
  const baseAbsences = `${base}/absences`;

  const [{ lignes, parStatut }, kpi, employes, monEmployeId, contexte] = await Promise.all([
    listerDemandesAbsence(filtres),
    kpiAbsences(today),
    listerEmployesOptions({ inclureInactifs: true }),
    lireMonEmployeId(),
    gestionnaire ? chargerContexteDemandeAbsence() : chargerMonContexteDemandeAbsence(),
  ]);

  const total = Object.values(parStatut).reduce((s, n) => s + n, 0);
  const pills: FilterPillItem[] = FILTRES_STATUT_DEMANDE.map((statut) => ({
    key: statut,
    label: LIBELLES_FILTRE_STATUT[statut],
    count: statut === 'toutes' ? total : parStatut[statut],
    active: filtres.statut === statut,
    href: hrefDemandes(baseAbsences, { ...filtres, statut }),
  }));
  const peutDemander = contexte.employes.length > 0;

  return (
    <div className="space-y-4">
      <PageToolbar
        title="Absences"
        subtitle={`${kpi.enAttente} demande${kpi.enAttente > 1 ? 's' : ''} en attente · ${kpi.absentsAujourdhui} absent${kpi.absentsAujourdhui > 1 ? 's' : ''} aujourd’hui`}
        backHref={base}
        backLabel="Test SIRH"
        actions={
          peutDemander ? (
            <NouvelleDemandeAbsence
              contexte={contexte}
              today={today}
              employeFixeId={gestionnaire ? null : monEmployeId}
              peutApprouverDirectement={gestionnaire}
              actions={{
                demander: async (input) => {
                  'use server';
                  return demanderAbsence(input);
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
          ) : null
        }
      />
      <OngletsAbsences base={base} actif="demandes" enAttente={kpi.enAttente} />

      <StatGrid>
        <StatCard
          label="En attente"
          value={kpi.enAttente}
          tone={kpi.enAttente > 0 ? 'amber' : 'default'}
          hint="demandes à valider"
        />
        <StatCard
          label="Absents aujourd’hui"
          value={kpi.absentsAujourdhui}
          hint={formatDateFr(today)}
        />
        <StatCard
          label="Jours posés ce mois"
          value={formatJours(kpi.joursPosesMois)}
          tone="sky"
          hint="congés & absences validés"
        />
        <StatCard
          label="Arrêts maladie en cours"
          value={kpi.arretsMaladieEnCours}
          tone={kpi.arretsMaladieEnCours > 0 ? 'rose' : 'default'}
          hint="maladie / accident"
        />
      </StatGrid>

      <div className="flex flex-col gap-3 rounded-xl border bg-card p-4">
        <FilterPills items={pills} aria-label="Statut des demandes" />
        <FiltresDemandesAbsence base={baseAbsences} filtres={filtres} employes={employes} />
      </div>

      <AbsencesListe
        absences={lignes}
        today={today}
        droits={{
          peutValider: peutValiderSirh(role),
          estGestionnaire: gestionnaire,
          monEmployeId,
          monUtilisateurId: ctx.utilisateur.id,
        }}
        actions={{
          decider: async (input) => {
            'use server';
            return deciderAbsence(input);
          },
          annuler: async (id) => {
            'use server';
            return annulerAbsence(id);
          },
          obtenirUrlJustificatif: async (id) => {
            'use server';
            return urlTelechargementDocumentSirh(id);
          },
        }}
        emptyMessage={
          filtres.statut === 'en_attente'
            ? 'Aucune demande en attente de validation.'
            : 'Aucune demande pour ces filtres.'
        }
      />
    </div>
  );
}
