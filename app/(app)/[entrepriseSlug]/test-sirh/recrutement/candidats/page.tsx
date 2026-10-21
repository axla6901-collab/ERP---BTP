import { PageToolbar } from '@/components/layout/page-toolbar';
import { CandidatsSection } from '@/components/test-sirh/recrutement/candidats-section';
import { OngletsRecrutement } from '@/components/test-sirh/recrutement/onglets-recrutement';
import { FilterPills, type FilterPillItem } from '@/components/ui/filter-pills';
import { aujourdhuiIso } from '@/lib/test-sirh/calendrier';
import { baseSirh, exigerContexteSirhPage } from '@/lib/test-sirh/contexte';
import { peutGererSirh, ROLES_SIRH_LECTURE } from '@/lib/test-sirh/permissions';
import { enregistrerCandidat } from '@/lib/test-sirh/recrutement/candidats';
import { listerCandidats } from '@/lib/test-sirh/recrutement/queries';
import {
  LIBELLES_SOURCE_CANDIDAT,
  SOURCES_CANDIDAT,
  type SourceCandidat,
} from '@/lib/validation/test-sirh/enums';

function estSource(v: unknown): v is SourceCandidat {
  return typeof v === 'string' && (SOURCES_CANDIDAT as readonly string[]).includes(v);
}

/** Test SIRH › Recrutement › Vivier de candidats (Factorial ats/Candidate + CandidateSource). */
export default async function VivierCandidatsPage({
  searchParams,
}: {
  searchParams: Promise<{ source?: string | string[]; rgpd?: string | string[] }>;
}) {
  const ctx = await exigerContexteSirhPage(ROLES_SIRH_LECTURE);
  const [{ source, rgpd }, candidats] = await Promise.all([searchParams, listerCandidats()]);
  const base = baseSirh(ctx);
  const today = aujourdhuiIso();
  const lien = `${base}/recrutement/candidats`;

  const filtreSource = estSource(source) ? source : null;
  const filtreRgpd = rgpd === '1';
  const visibles = candidats.filter(
    (c) => (!filtreSource || c.source === filtreSource) && (!filtreRgpd || c.aPurger),
  );
  const parSource = (s: SourceCandidat) => candidats.filter((c) => c.source === s).length;
  const nbAPurger = candidats.filter((c) => c.aPurger).length;

  const pills: FilterPillItem[] = [
    {
      key: 'tous',
      label: 'Tous',
      count: candidats.length,
      active: !filtreSource && !filtreRgpd,
      href: lien,
    },
    ...SOURCES_CANDIDAT.filter((s) => parSource(s) > 0 || s === filtreSource).map((s) => ({
      key: s,
      label: LIBELLES_SOURCE_CANDIDAT[s],
      count: parSource(s),
      active: filtreSource === s,
      href: `${lien}?source=${s}`,
    })),
  ];
  if (nbAPurger > 0 || filtreRgpd) {
    pills.push({
      key: 'rgpd',
      label: '⚠ À purger (RGPD)',
      count: nbAPurger,
      tone: 'danger',
      active: filtreRgpd,
      href: `${lien}?rgpd=1`,
    });
  }

  return (
    <div className="space-y-4">
      <PageToolbar
        title="Recrutement"
        subtitle={`${candidats.length} candidat${candidats.length > 1 ? 's' : ''} dans le vivier`}
        backHref={base}
        backLabel="Test SIRH"
      />
      <OngletsRecrutement base={base} actif="candidats" />
      <FilterPills aria-label="Filtrer les candidats par source" items={pills} />
      <CandidatsSection
        candidats={visibles}
        base={base}
        today={today}
        peutGerer={peutGererSirh(ctx.utilisateur.role)}
        messageVide={
          filtreRgpd
            ? 'Aucun dossier à purger.'
            : filtreSource
              ? `Aucun candidat « ${LIBELLES_SOURCE_CANDIDAT[filtreSource]} ».`
              : undefined
        }
        actions={{
          enregistrer: async (input) => {
            'use server';
            return enregistrerCandidat(input);
          },
        }}
      />
    </div>
  );
}
