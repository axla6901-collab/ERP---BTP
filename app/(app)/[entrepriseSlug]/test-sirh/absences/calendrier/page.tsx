import { ChevronLeftIcon, ChevronRightIcon } from 'lucide-react';
import Link from 'next/link';

import { PageToolbar } from '@/components/layout/page-toolbar';
import { CalendrierEquipe } from '@/components/test-sirh/absences/calendrier-equipe';
import { FiltresCalendrierAbsences } from '@/components/test-sirh/absences/filtres-calendrier';
import { OngletsAbsences } from '@/components/test-sirh/absences/onglets-absences';
import { buttonVariants } from '@/components/ui/button';
import { construireGrilleMois, moisVoisin } from '@/lib/test-sirh/absences/calendrier-equipe';
import {
  hrefCalendrier,
  lireFiltresCalendrier,
  type ParametresUrl,
} from '@/lib/test-sirh/absences/filtres';
import { chargerCalendrierEquipe } from '@/lib/test-sirh/absences/queries';
import { aujourdhuiIso } from '@/lib/test-sirh/calendrier';
import { baseSirh, exigerContexteSirhPage } from '@/lib/test-sirh/contexte';
import { formatMois } from '@/lib/test-sirh/format';
import { ROLES_SIRH_LECTURE } from '@/lib/test-sirh/permissions';
import { listerEquipesOptions, listerSitesOptions } from '@/lib/test-sirh/referentiels';

/** Test SIRH › Absences › Calendrier : planning mensuel d'équipe. */
export default async function CalendrierAbsencesPage({
  searchParams,
}: {
  searchParams: Promise<ParametresUrl>;
}) {
  const ctx = await exigerContexteSirhPage(ROLES_SIRH_LECTURE);
  const today = aujourdhuiIso();
  const filtres = lireFiltresCalendrier(await searchParams, today);
  const base = baseSirh(ctx);
  const baseCalendrier = `${base}/absences/calendrier`;

  const [donnees, equipes, sites] = await Promise.all([
    chargerCalendrierEquipe(filtres),
    listerEquipesOptions(),
    listerSitesOptions(),
  ]);
  const grille = construireGrilleMois({
    annee: filtres.annee,
    mois: filtres.mois,
    employes: donnees.employes,
    absences: donnees.absences,
    feries: donnees.feries,
    types: donnees.types,
    today,
  });

  const precedent = moisVoisin(filtres.annee, filtres.mois, -1);
  const suivant = moisVoisin(filtres.annee, filtres.mois, 1);
  const courant = { annee: Number(today.slice(0, 4)), mois: Number(today.slice(5, 7)) };
  const nbCollaborateurs = grille.lignes.length;

  return (
    <div className="space-y-4">
      <PageToolbar
        title="Absences"
        subtitle={`Calendrier · ${nbCollaborateurs} collaborateur${nbCollaborateurs > 1 ? 's' : ''}`}
        backHref={base}
        backLabel="Test SIRH"
        actions={
          <div className="flex items-center gap-1">
            <Link
              href={hrefCalendrier(baseCalendrier, { ...filtres, ...precedent })}
              className={buttonVariants({ variant: 'outline', size: 'sm' })}
              aria-label="Mois précédent"
            >
              <ChevronLeftIcon className="size-4" />
            </Link>
            <span className="min-w-32 text-center text-sm font-semibold capitalize">
              {formatMois(filtres.annee, filtres.mois)}
            </span>
            <Link
              href={hrefCalendrier(baseCalendrier, { ...filtres, ...suivant })}
              className={buttonVariants({ variant: 'outline', size: 'sm' })}
              aria-label="Mois suivant"
            >
              <ChevronRightIcon className="size-4" />
            </Link>
            <Link
              href={hrefCalendrier(baseCalendrier, { ...filtres, ...courant })}
              className={buttonVariants({ variant: 'ghost', size: 'sm' })}
            >
              Aujourd’hui
            </Link>
          </div>
        }
      />
      <OngletsAbsences base={base} actif="calendrier" />
      <FiltresCalendrierAbsences
        base={baseCalendrier}
        filtres={filtres}
        equipes={equipes}
        sites={sites}
      />
      <CalendrierEquipe grille={grille} types={donnees.types} />
    </div>
  );
}
