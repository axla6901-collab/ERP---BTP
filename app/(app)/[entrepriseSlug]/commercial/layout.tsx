import { requireAuthWithMfa } from '@/lib/auth/guards';

export default async function CommercialLayout({ children }: { children: React.ReactNode }) {
  await requireAuthWithMfa();

  return <>{children}</>;
}
