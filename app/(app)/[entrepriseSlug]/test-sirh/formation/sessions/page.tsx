import { PageToolbar } from '@/components/layout/page-toolbar';
import { OngletsFormation } from '@/components/test-sirh/formation/onglets-formation';
import { SessionsSection } from '@/components/test-sirh/formation/sessions-section';
import { FilterPills } from '@/components/ui/filter-pills';
import { aujourdhuiIso } from '@/lib/test-sirh/calendrier';
import { baseSirh, exigerContexteSirhPage } from '@/lib/test-sirh/contexte';
import {
  FILTRES_SESSIONS,
  listerFormationsOptions,
  listerSessions,
  type FiltreSessions,
} from '@/lib/test-sirh/formation/queries';
import { enregistrerSession } from '@/lib/test-sirh/formation/sessions';
import { peutGererSirh, ROLES_SIRH_LECTURE } from '@/lib/test-sirh/permissions';

const LIBELLES_FILTRE: Record<FiltreSessions, string> = {
  a_venir: 'À venir',
  passees: 'Passées',
  annulees: 'Annulées',
  toutes: 'Toutes',
};

/** Test SIRH › Formation › Sessions (Factorial trainings/Session). */
export default async function FormationSessionsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const ctx = await exigerContexteSirhPage(ROLES_SIRH_LECTURE);
  const sp = await searchParams;
  const brut = Array.isArray(sp.filtre) ? sp.filtre[0] : sp.filtre;
  const filtre: FiltreSessions = FILTRES_SESSIONS.find((f) => f === brut) ?? 'toutes';
  const peutGerer = peutGererSirh(ctx.utilisateur.role);

  const [sessions, formations] = await Promise.all([
    listerSessions(filtre),
    peutGerer ? listerFormationsOptions() : Promise.resolve([]),
  ]);
  const base = baseSirh(ctx);

  return (
    <div className="space-y-4">
      <PageToolbar
        title="Formation"
        subtitle={`${sessions.length} session${sessions.length > 1 ? 's' : ''} · ${LIBELLES_FILTRE[filtre].toLowerCase()}`}
        backHref={base}
        backLabel="Test SIRH"
      />
      <OngletsFormation base={base} actif="sessions" />
      <FilterPills
        aria-label="Filtrer les sessions"
        items={FILTRES_SESSIONS.map((f) => ({
          key: f,
          label: LIBELLES_FILTRE[f],
          active: f === filtre,
          href:
            f === 'toutes'
              ? `${base}/formation/sessions`
              : `${base}/formation/sessions?filtre=${f}`,
        }))}
      />
      <SessionsSection
        sessions={sessions.map((s) => ({
          id: s.id,
          formationId: s.formationId,
          formationIntitule: s.formationIntitule,
          formationCode: s.formationCode,
          dateDebut: s.dateDebut,
          dateFin: s.dateFin,
          lieu: s.lieu,
          formateur: s.formateur,
          placesMax: s.placesMax,
          statut: s.statut,
          nbInscrits: s.nbInscrits,
          nbPresents: s.nbPresents,
          coutEstime: s.coutEstime,
        }))}
        base={base}
        peutGerer={peutGerer}
        formations={formations.map((f) => ({ id: f.id, label: f.label, actif: f.actif }))}
        today={aujourdhuiIso()}
        enregistrer={async (input) => {
          'use server';
          return enregistrerSession(input);
        }}
      />
    </div>
  );
}
