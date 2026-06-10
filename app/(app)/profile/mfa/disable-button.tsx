'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { authClient } from '@/lib/auth/client';

export function DisableMfaButton() {
  const router = useRouter();
  const [showForm, setShowForm] = useState(false);
  const [password, setPassword] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleDisable() {
    if (!password) {
      toast.error('Saisis ton mot de passe pour confirmer.');
      return;
    }
    setIsSubmitting(true);
    const { error } = await authClient.twoFactor.disable({ password });
    setIsSubmitting(false);
    if (error) {
      toast.error(error.message ?? 'Désactivation impossible.');
      return;
    }
    toast.success('Double authentification désactivée');
    router.refresh();
    setShowForm(false);
    setPassword('');
  }

  if (!showForm) {
    return (
      <Button variant="outline" onClick={() => setShowForm(true)}>
        Désactiver
      </Button>
    );
  }

  return (
    <div className="grid w-full gap-2">
      <Label htmlFor="confirm-password">Confirme avec ton mot de passe</Label>
      <Input
        id="confirm-password"
        type="password"
        autoComplete="current-password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
      />
      <div className="flex justify-end gap-2">
        <Button variant="ghost" onClick={() => setShowForm(false)} disabled={isSubmitting}>
          Annuler
        </Button>
        <Button variant="destructive" onClick={handleDisable} disabled={isSubmitting}>
          {isSubmitting ? 'Désactivation…' : 'Désactiver la MFA'}
        </Button>
      </div>
    </div>
  );
}
