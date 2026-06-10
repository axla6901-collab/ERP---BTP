'use client';

import { PowerIcon, PowerOffIcon } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useTransition } from 'react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';

/** Résultat minimal attendu d'une action de changement de statut. */
type ResultatStatut = { ok: boolean; error?: string };

type Props = {
  /** État courant : `true` = actif (le bouton propose « Désactiver »). */
  actif: boolean;
  /**
   * Action serveur appelée avec l'état cible (`!actif`). Renvoie `{ ok }`.
   * Fournie par la page (closure `'use server'`) — pas d'import direct ici.
   */
  action: (actif: boolean) => Promise<ResultatStatut>;
  /** Nom de l'entité pour les toasts (ex. « fournisseur », « contact »). Défaut générique. */
  libelle?: string;
  size?: 'sm' | 'default';
  /**
   * Appelé après un changement réussi avec le nouvel état. Permet au parent
   * (ex. formulaire) de synchroniser son propre state sans recharger.
   */
  onDone?: (actif: boolean) => void;
};

/**
 * Bouton de bascule du statut actif/inactif d'un tiers ou d'un contact.
 *
 * Le changement est immédiat (pas de boîte de confirmation) car il est
 * réversible : désactiver ne supprime rien, on peut réactiver. Un toast confirme
 * l'opération, puis `router.refresh()` recharge les données serveur.
 */
export function StatutToggleButton({
  actif,
  action,
  libelle = 'Statut',
  size = 'sm',
  onDone,
}: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const cible = !actif; // état visé par le clic

  function handleClick() {
    startTransition(async () => {
      const res = await action(cible);
      if (res.ok) {
        toast.success(cible ? `${libelle} réactivé` : `${libelle} désactivé`);
        onDone?.(cible);
        router.refresh();
      } else {
        toast.error(res.error ?? 'Changement de statut impossible.');
      }
    });
  }

  return (
    <Button
      type="button"
      variant={actif ? 'ghost' : 'secondary'}
      size={size}
      className="gap-1.5"
      onClick={handleClick}
      disabled={isPending}
      aria-label={actif ? 'Désactiver' : 'Activer'}
    >
      {actif ? (
        <PowerOffIcon className="size-4" aria-hidden="true" />
      ) : (
        <PowerIcon className="size-4" aria-hidden="true" />
      )}
      {actif ? 'Désactiver' : 'Activer'}
    </Button>
  );
}
