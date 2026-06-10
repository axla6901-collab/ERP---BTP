'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { authClient } from '@/lib/auth/client';

export function SignOutButton() {
  const router = useRouter();
  const [isSigningOut, setIsSigningOut] = useState(false);

  async function handleSignOut() {
    setIsSigningOut(true);
    await authClient.signOut();
    setIsSigningOut(false);
    toast.success('Déconnexion réussie');
    router.push('/login');
    router.refresh();
  }

  return (
    <Button variant="outline" size="sm" onClick={handleSignOut} disabled={isSigningOut}>
      {isSigningOut ? 'Déconnexion…' : 'Se déconnecter'}
    </Button>
  );
}
