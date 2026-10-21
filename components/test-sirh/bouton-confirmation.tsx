'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';

type Resultat = { ok: true; data?: unknown } | { ok: false; error: string };

type Props = {
  /** Libellé du bouton initial (ex. « Supprimer »). */
  libelle: React.ReactNode;
  /** Question affichée à la confirmation. */
  question?: React.ReactNode;
  /** Libellé du bouton de confirmation. */
  libelleConfirmer?: string;
  /** Server action exécutée à la confirmation. */
  onConfirm: () => Promise<Resultat>;
  messageSucces?: string;
  /**
   * Redirection après succès. Sans redirection, rien à faire : la server action
   * revalide la page, dont le nouveau rendu revient dans sa réponse (un
   * `router.refresh()` déclencherait un second rendu complet).
   */
  redirection?: string;
  variante?: 'destructive' | 'default';
  taille?: 'sm' | 'default';
  disabled?: boolean;
  title?: string;
};

/**
 * Bouton d'action à confirmation en deux temps (sans `window.confirm`), même
 * ergonomie que `DeleteVehiculeButton`. Le message d'erreur serveur (ex. blocage
 * de suppression référentielle) est affiché en toast.
 */
export function BoutonConfirmation({
  libelle,
  question = 'Confirmer ?',
  libelleConfirmer = 'Confirmer',
  onConfirm,
  messageSucces = 'Opération effectuée',
  redirection,
  variante = 'destructive',
  taille = 'sm',
  disabled,
  title,
}: Props) {
  const router = useRouter();
  const [confirme, setConfirme] = useState(false);
  const [isPending, startTransition] = useTransition();

  function executer() {
    startTransition(async () => {
      const r = await onConfirm();
      if (r.ok) {
        toast.success(messageSucces);
        setConfirme(false);
        if (redirection) router.push(redirection);
      } else {
        toast.error(r.error);
        setConfirme(false);
      }
    });
  }

  if (!confirme) {
    return (
      <Button
        type="button"
        variant="outline"
        size={taille}
        className={variante === 'destructive' ? 'text-destructive' : undefined}
        onClick={() => setConfirme(true)}
        disabled={disabled}
        title={title}
      >
        {libelle}
      </Button>
    );
  }

  return (
    <span className="inline-flex flex-wrap items-center gap-2">
      <span className="text-sm text-muted-foreground">{question}</span>
      <Button
        type="button"
        variant="ghost"
        size={taille}
        onClick={() => setConfirme(false)}
        disabled={isPending}
      >
        Annuler
      </Button>
      <Button
        type="button"
        variant={variante === 'destructive' ? 'destructive' : 'default'}
        size={taille}
        onClick={executer}
        disabled={isPending}
      >
        {isPending ? 'En cours…' : libelleConfirmer}
      </Button>
    </span>
  );
}
