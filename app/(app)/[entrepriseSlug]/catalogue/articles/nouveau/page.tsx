import Link from 'next/link';

import { ArticleForm } from '@/components/catalogue/article-form';
import { PageToolbar } from '@/components/layout/page-toolbar';
import { requireAuthWithMfa } from '@/lib/auth/guards';
import { creerArticle } from '@/lib/catalogue/articles';
import { listerFamilles } from '@/lib/catalogue/familles';
import { ROLES_CATALOGUE_WRITE } from '@/lib/catalogue/permissions';
import { listerUnites } from '@/lib/catalogue/unites';

export default async function NouvelArticlePage() {
  await requireAuthWithMfa(ROLES_CATALOGUE_WRITE);
  const [familles, unites] = await Promise.all([listerFamilles(), listerUnites()]);

  if (familles.length === 0) {
    return (
      <div className="space-y-4">
        <PageToolbar title="Nouvel article" />
        <div className="rounded border border-dashed p-8 text-center text-sm text-muted-foreground">
          Aucune famille disponible. Crée d&apos;abord une famille via{' '}
          <Link href="/catalogue/familles/nouveau" className="underline underline-offset-4">
            ce lien
          </Link>
          .
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <ArticleForm
        titre="Nouvel article"
        familles={familles.map((f) => ({ id: f.id, code: f.code, libelle: f.libelle }))}
        unites={unites.map((u) => ({
          id: u.id,
          code: u.code,
          libelle: u.libelle,
          symbole: u.symbole,
        }))}
        onSubmit={async (values) => {
          'use server';
          return creerArticle(values);
        }}
        successRedirect="/catalogue/articles"
      />
    </div>
  );
}
