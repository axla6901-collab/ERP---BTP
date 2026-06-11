import Link from 'next/link';

import { ArticlesExplorer } from '@/components/catalogue/articles-explorer';
import { PageToolbar } from '@/components/layout/page-toolbar';
import { buttonVariants } from '@/components/ui/button';
import { getChantierActif } from '@/lib/auth/chantier-context';
import { requireAuthWithMfa } from '@/lib/auth/guards';
import { listerArticleIdsParChantier, listerArticlesAvecPrix } from '@/lib/catalogue/articles';
import { peutEcrireCatalogue } from '@/lib/catalogue/permissions';
import { listerChantiersPourSelecteur } from '@/lib/chantiers/chantiers';

function tempsRelatif(d: Date | null): string {
  if (!d) return '';
  const ms = Date.now() - new Date(d).getTime();
  const h = Math.floor(ms / 3_600_000);
  if (h < 1) return "à l'instant";
  if (h < 24) return `il y a ${h} h`;
  return `il y a ${Math.floor(h / 24)} j`;
}

export default async function ArticlesPage() {
  const utilisateur = await requireAuthWithMfa();
  const peutEcrire = peutEcrireCatalogue(utilisateur.role);

  const [items, chantierActif, chantiers] = await Promise.all([
    listerArticlesAvecPrix(),
    getChantierActif(),
    listerChantiersPourSelecteur(),
  ]);

  const articleIdsChantier = chantierActif
    ? await listerArticleIdsParChantier(chantierActif.id)
    : [];

  const total = items.length;
  const nbFamilles = new Set(items.map((a) => a.familleId)).size;
  const maxMaj = items.reduce<Date | null>((acc, a) => {
    const d = a.updatedAt ? new Date(a.updatedAt) : null;
    return d && (!acc || d > acc) ? d : acc;
  }, null);
  const maj = tempsRelatif(maxMaj);

  return (
    <div className="space-y-6">
      <PageToolbar
        title="Catalogue articles"
        subtitle={`${total} référence${total > 1 ? 's' : ''} · ${nbFamilles} famille${
          nbFamilles > 1 ? 's' : ''
        }${maj ? ` · mise à jour ${maj}` : ''}`}
        actions={
          peutEcrire ? (
            <Link href="/catalogue/articles/nouveau" className={buttonVariants({ size: 'sm' })}>
              + Nouvel article
            </Link>
          ) : null
        }
      />

      <ArticlesExplorer
        items={items}
        chantierActif={chantierActif}
        chantiers={chantiers}
        articleIdsChantier={articleIdsChantier}
      />
    </div>
  );
}
