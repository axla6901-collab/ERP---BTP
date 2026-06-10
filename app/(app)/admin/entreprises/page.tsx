import { Building2Icon, PlusIcon } from 'lucide-react';
import Link from 'next/link';

import { EntreprisesTable } from '@/components/admin/entreprises-table';
import { listerEntreprises } from '@/lib/admin/entreprises-super';
import { getDownloadUrl } from '@/lib/storage/s3';

export const dynamic = 'force-dynamic';

export default async function AdminEntreprisesPage() {
  const entreprises = await listerEntreprises();

  // Génération en parallèle des URLs signées S3 pour chaque logo (signature locale,
  // pas d'appel réseau — coût négligeable même pour N entreprises).
  const logoEntries = await Promise.all(
    entreprises
      .filter((e) => e.logoPrincipalStorageKey)
      .map(async (e) => [e.id, await getDownloadUrl(e.logoPrincipalStorageKey!)] as const),
  );
  const logoUrls = Object.fromEntries(logoEntries);

  return (
    <div>
      <div className="mb-6 flex items-center gap-3">
        <Building2Icon className="size-6 text-primary" />
        <h1 className="text-2xl font-semibold">Entreprises</h1>
        <span className="text-sm text-muted-foreground">({entreprises.length})</span>
      </div>

      <EntreprisesTable
        items={entreprises}
        logoUrls={logoUrls}
        rightActions={
          <Link
            href="/admin/entreprises/nouvelle"
            className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
          >
            <PlusIcon className="size-4" />
            Nouvelle entreprise
          </Link>
        }
      />
    </div>
  );
}
