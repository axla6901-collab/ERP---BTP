import { requireAuthWithMfa } from '@/lib/auth/guards';

export default async function CatalogueLayout({ children }: { children: React.ReactNode }) {
  await requireAuthWithMfa();

  return <div className="space-y-6">{children}</div>;
}
