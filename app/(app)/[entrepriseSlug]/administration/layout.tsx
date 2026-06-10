import { redirect } from 'next/navigation';

import { peutAdministrer } from '@/lib/admin/permissions';
import { requireAuthWithMfa } from '@/lib/auth/guards';

export default async function AdministrationLayout({ children }: { children: React.ReactNode }) {
  const utilisateur = await requireAuthWithMfa();
  if (!peutAdministrer(utilisateur.role)) redirect('/');

  return <div className="space-y-6">{children}</div>;
}
