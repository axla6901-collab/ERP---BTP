'use client';

import { LinkIcon, UserRoundCheckIcon } from 'lucide-react';
import { useMemo, useState, useTransition } from 'react';
import { toast } from 'sonner';

import { BoutonConfirmation } from '@/components/test-sirh/bouton-confirmation';
import { OptionSelect, type OptionListe } from '@/components/test-sirh/option-select';
import { Button } from '@/components/ui/button';
import type { ActionResult } from '@/lib/common/action-result';
import type { CompteUtilisateurInput } from '@/lib/validation/test-sirh/collaborateurs';

type Props = {
  employeId: string;
  /** Compte actuellement rattaché (null si aucun). */
  compte: { utilisateurId: string; email: string | null } | null;
  /** Comptes membres de l'entreprise (`listerUtilisateursOptions`). */
  utilisateurs: readonly OptionListe[];
  /** Rattachements existants (pour masquer les comptes déjà pris). */
  comptesRattaches: ReadonlyArray<{ utilisateurId: string; employeId: string; employeNom: string }>;
  actions: {
    rattacher: (input: CompteUtilisateurInput) => Promise<ActionResult>;
    detacher: (employeId: string) => Promise<ActionResult>;
  };
};

/**
 * Rattachement du compte utilisateur au collaborateur (`employes.utilisateur_id`) :
 * ouvre « Mon espace » au salarié. Un compte ne peut être rattaché qu'à un seul
 * collaborateur de l'entreprise.
 */
export function CompteUtilisateurSection({
  employeId,
  compte,
  utilisateurs,
  comptesRattaches,
  actions,
}: Props) {
  const [choix, setChoix] = useState<string | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const prisAilleurs = useMemo(
    () =>
      new Set(
        comptesRattaches.filter((c) => c.employeId !== employeId).map((c) => c.utilisateurId),
      ),
    [comptesRattaches, employeId],
  );
  const disponibles = useMemo(
    () => utilisateurs.filter((u) => !prisAilleurs.has(u.id) && u.id !== compte?.utilisateurId),
    [utilisateurs, prisAilleurs, compte?.utilisateurId],
  );
  const masques = utilisateurs.filter((u) => prisAilleurs.has(u.id)).length;

  function rattacher() {
    if (!choix) {
      setErreur('Choisissez un compte utilisateur.');
      return;
    }
    setErreur(null);
    startTransition(async () => {
      const r = await actions.rattacher({ employeId, utilisateurId: choix });
      if (r.ok) {
        toast.success('Compte rattaché');
        setChoix(null);
      } else {
        setErreur(r.error);
      }
    });
  }

  return (
    <div className="space-y-4">
      {compte ? (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border bg-muted/20 px-4 py-3">
          <span className="inline-flex min-w-0 items-center gap-2 text-sm">
            <UserRoundCheckIcon className="size-4 shrink-0 text-emerald-600" aria-hidden="true" />
            <span className="min-w-0 truncate">
              Compte rattaché :{' '}
              <span className="font-medium">{compte.email ?? compte.utilisateurId}</span>
            </span>
          </span>
          <BoutonConfirmation
            libelle="Détacher"
            question="Détacher ce compte ?"
            libelleConfirmer="Détacher"
            messageSucces="Compte détaché"
            onConfirm={() => actions.detacher(employeId)}
          />
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">
          Aucun compte rattaché : le collaborateur n’a pas accès à « Mon espace ».
        </p>
      )}

      <div className="grid gap-2">
        <span className="text-sm font-medium">
          {compte ? 'Rattacher un autre compte' : 'Rattacher un compte'}
        </span>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <div className="min-w-0 flex-1 sm:max-w-sm">
            <OptionSelect
              options={disponibles}
              value={choix}
              onChange={setChoix}
              libelleAucune="— Choisir un compte —"
              aria-label="Compte utilisateur"
              disabled={isPending}
            />
          </div>
          <Button size="sm" onClick={rattacher} disabled={isPending || !choix}>
            <LinkIcon className="mr-1 size-3.5" />
            {isPending ? 'Rattachement…' : 'Rattacher'}
          </Button>
        </div>
        {erreur && <p className="text-sm text-destructive">{erreur}</p>}
        {masques > 0 && (
          <p className="text-xs text-muted-foreground">
            {masques} compte{masques > 1 ? 's' : ''} déjà rattaché{masques > 1 ? 's' : ''} à
            d’autres collaborateurs {masques > 1 ? 'sont masqués' : 'est masqué'}.
          </p>
        )}
      </div>
    </div>
  );
}
