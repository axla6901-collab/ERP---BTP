import { PageToolbar } from '@/components/layout/page-toolbar';
import { InventaireMateriel } from '@/components/test-sirh/materiel/inventaire-materiel';
import { FilterPills, type FilterPillItem } from '@/components/ui/filter-pills';
import { StatCard, StatGrid } from '@/components/ui/stat-card';
import { aujourdhuiIso } from '@/lib/test-sirh/calendrier';
import { baseSirh, exigerContexteSirhPage } from '@/lib/test-sirh/contexte';
import { formatEuroArrondi } from '@/lib/test-sirh/format';
import {
  attribuerMateriel,
  enregistrerMateriel,
  restituerMateriel,
  supprimerMateriel,
} from '@/lib/test-sirh/materiel/actions';
import { compteursMateriel, kpiMateriel, listerMateriels } from '@/lib/test-sirh/materiel/queries';
import {
  lireFiltresMateriel,
  SEUIL_CONTROLE_JOURS,
  urlMateriel,
} from '@/lib/test-sirh/materiel/regles';
import { peutGererSirh, ROLES_SIRH_LECTURE } from '@/lib/test-sirh/permissions';
import { listerEmployesOptions, type OptionEmploye } from '@/lib/test-sirh/referentiels';
import {
  CATEGORIES_MATERIEL,
  LIBELLES_CATEGORIE_MATERIEL,
  LIBELLES_STATUT_MATERIEL,
  STATUTS_MATERIEL,
} from '@/lib/validation/test-sirh/enums';

/** Libellés courts des pastilles de catégorie. */
const PASTILLES_CATEGORIE: Record<(typeof CATEGORIES_MATERIEL)[number], string> = {
  ...LIBELLES_CATEGORIE_MATERIEL,
  epi: 'EPI',
  vetement: 'Vêtements',
};

/** Test SIRH › Matériel & EPI (Factorial it_management, étendu EPI / outillage). */
export default async function MaterielPage({
  searchParams,
}: {
  searchParams: Promise<{ categorie?: string; statut?: string }>;
}) {
  const ctx = await exigerContexteSirhPage(ROLES_SIRH_LECTURE);
  const filtres = lireFiltresMateriel(await searchParams);
  const base = baseSirh(ctx);
  const url = `${base}/materiel`;
  const today = aujourdhuiIso();
  const peutGerer = peutGererSirh(ctx.utilisateur.role);

  const [materiels, compteurs, kpi, employes] = await Promise.all([
    listerMateriels(filtres),
    compteursMateriel(),
    kpiMateriel(),
    peutGerer ? listerEmployesOptions() : Promise.resolve([] as OptionEmploye[]),
  ]);

  const pillsCategorie: FilterPillItem[] = [
    {
      key: 'toutes',
      label: 'Toutes catégories',
      count: compteurs.total,
      active: filtres.categorie === null,
      href: urlMateriel(url, { statut: filtres.statut }),
    },
    ...CATEGORIES_MATERIEL.filter(
      (c) => compteurs.parCategorie[c] > 0 || filtres.categorie === c,
    ).map((c) => ({
      key: c,
      label: PASTILLES_CATEGORIE[c],
      count: compteurs.parCategorie[c],
      active: filtres.categorie === c,
      href: urlMateriel(url, { categorie: c, statut: filtres.statut }),
    })),
  ];
  const pillsStatut: FilterPillItem[] = [
    {
      key: 'tous',
      label: 'Tous statuts',
      active: filtres.statut === null,
      href: urlMateriel(url, { categorie: filtres.categorie }),
    },
    ...STATUTS_MATERIEL.map((s) => ({
      key: s,
      label: LIBELLES_STATUT_MATERIEL[s],
      count: compteurs.parStatut[s],
      active: filtres.statut === s,
      href: urlMateriel(url, { categorie: filtres.categorie, statut: s }),
    })),
  ];

  return (
    <div className="space-y-4">
      <PageToolbar
        title="Matériel & EPI"
        subtitle={`${compteurs.total} objet${compteurs.total > 1 ? 's' : ''} à l’inventaire`}
        backHref={base}
        backLabel="Test SIRH"
      />

      <StatGrid>
        <StatCard
          label="Attribués"
          value={kpi.attribues}
          hint="remis à un collaborateur"
          tone="emerald"
        />
        <StatCard
          label="En stock"
          value={kpi.enStock}
          hint={kpi.enReparation > 0 ? `${kpi.enReparation} en réparation` : 'disponibles'}
          tone="sky"
        />
        <StatCard
          label={`Contrôles ≤ ${SEUIL_CONTROLE_JOURS} j`}
          value={kpi.alertesControle}
          hint="contrôles et péremptions dépassés ou proches"
          tone={kpi.alertesControle > 0 ? 'rose' : 'default'}
        />
        <StatCard
          label="Valeur du parc"
          value={formatEuroArrondi(kpi.valeurParc)}
          hint="valeur d’achat (hors perdu / réformé)"
        />
      </StatGrid>

      <div className="space-y-2">
        <FilterPills items={pillsCategorie} aria-label="Filtrer par catégorie" />
        <FilterPills items={pillsStatut} aria-label="Filtrer par statut" />
      </div>

      <InventaireMateriel
        materiels={materiels}
        today={today}
        peutGerer={peutGerer}
        employes={employes.map((e) => ({ id: e.id, label: e.label }))}
        actions={{
          enregistrer: async (input) => {
            'use server';
            return enregistrerMateriel(input);
          },
          supprimer: async (id) => {
            'use server';
            return supprimerMateriel(id);
          },
          attribuer: async (input) => {
            'use server';
            return attribuerMateriel(input);
          },
          restituer: async (input) => {
            'use server';
            return restituerMateriel(input);
          },
        }}
      />
    </div>
  );
}
