import { PageToolbar } from '@/components/layout/page-toolbar';
import { EntretiensSection } from '@/components/test-sirh/entretiens/entretiens-section';
import { FiltresEntretiens } from '@/components/test-sirh/entretiens/filtres-entretiens';
import { OngletsEntretiens } from '@/components/test-sirh/entretiens/onglets-entretiens';
import { creerEntretien } from '@/lib/test-sirh/entretiens/entretiens';
import {
  listerCampagnesOptions,
  listerEntretiens,
  listerEvaluateursOptions,
} from '@/lib/test-sirh/entretiens/queries';
import { baseSirh, exigerContexteSirhPage } from '@/lib/test-sirh/contexte';
import { peutGererSirh, ROLES_SIRH_LECTURE } from '@/lib/test-sirh/permissions';
import { listerEmployesOptions } from '@/lib/test-sirh/referentiels';
import { STATUTS_ENTRETIEN, type StatutEntretien } from '@/lib/validation/test-sirh/enums';

const REGEX_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function premier(v: string | string[] | undefined): string | null {
  const s = Array.isArray(v) ? v[0] : v;
  return s && s.length > 0 ? s : null;
}

function uuidOuNull(v: string | string[] | undefined): string | null {
  const s = premier(v);
  return s && REGEX_UUID.test(s) ? s : null;
}

function statutOuNull(v: string | string[] | undefined): StatutEntretien | null {
  const s = premier(v);
  return STATUTS_ENTRETIEN.find((x) => x === s) ?? null;
}

/** Test SIRH › Entretiens & objectifs › Entretiens (Factorial performance/ReviewEvaluation). */
export default async function EntretiensListePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const ctx = await exigerContexteSirhPage(ROLES_SIRH_LECTURE);
  const sp = await searchParams;
  const courant = {
    campagneId: uuidOuNull(sp.campagne),
    statut: statutOuNull(sp.statut),
    evaluateurId: uuidOuNull(sp.evaluateur),
  };
  const peutGerer = peutGererSirh(ctx.utilisateur.role);

  // Le statut est filtré ici : les compteurs des pastilles portent sur les autres filtres.
  const [tous, campagnes, evaluateurs, employes] = await Promise.all([
    listerEntretiens({ campagneId: courant.campagneId, evaluateurId: courant.evaluateurId }),
    listerCampagnesOptions(),
    listerEvaluateursOptions(),
    peutGerer ? listerEmployesOptions() : Promise.resolve([]),
  ]);
  const base = baseSirh(ctx);
  const compteurs: Partial<Record<StatutEntretien, number>> = {};
  for (const e of tous) compteurs[e.statut] = (compteurs[e.statut] ?? 0) + 1;
  const entretiens = courant.statut ? tous.filter((e) => e.statut === courant.statut) : tous;
  const campagneCourante = campagnes.find((c) => c.id === courant.campagneId);

  return (
    <div className="space-y-4">
      <PageToolbar
        title="Entretiens & objectifs"
        subtitle={`${entretiens.length} entretien${entretiens.length > 1 ? 's' : ''}${campagneCourante ? ` · ${campagneCourante.label}` : ''}`}
        backHref={base}
        backLabel="Test SIRH"
      />
      <OngletsEntretiens base={base} actif="entretiens" />
      <FiltresEntretiens
        base={base}
        campagnes={campagnes.map((c) => ({ id: c.id, label: c.label }))}
        evaluateurs={evaluateurs}
        courant={courant}
        compteurs={compteurs}
      />
      <EntretiensSection
        entretiens={entretiens.map((e) => ({
          id: e.id,
          campagneLibelle: e.campagneLibelle,
          employeNom: e.employeNom,
          employeTri: e.employeTri,
          employeMatricule: e.employeMatricule,
          evaluateurNom: e.evaluateurNom,
          typeEntretien: e.typeEntretien,
          datePrevue: e.datePrevue,
          dateRealisation: e.dateRealisation,
          statut: e.statut,
          noteGlobale: e.noteGlobale,
        }))}
        base={base}
        peutGerer={peutGerer}
        employes={employes.map((e) => ({ id: e.id, label: e.label }))}
        campagnes={campagnes
          .filter((c) => c.statut !== 'cloturee')
          .map((c) => ({ id: c.id, label: c.label }))}
        creer={async (input) => {
          'use server';
          return creerEntretien(input);
        }}
      />
    </div>
  );
}
