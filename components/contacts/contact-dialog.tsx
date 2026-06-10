'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';

import { ContactFields } from '@/components/contacts/contact-fields';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Form } from '@/components/ui/form';
import type { ContactFiche, SourceContact } from '@/lib/contacts/types';
import { typedZodResolver } from '@/lib/forms/zod-resolver';
import { creerContact, mettreAJourContact } from '@/lib/tiers/contacts-actions';
import { contactSchema, type ContactInput } from '@/lib/validation/tiers';

type Props = {
  /** Type de tiers de rattachement (fixe : on est sur sa fiche). */
  source: SourceContact;
  /** Identifiant du tiers de rattachement. */
  tiersId: string;
  /** Contact à éditer ; `null`/absent = création. */
  contact?: ContactFiche | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

function valeursParDefaut(contact?: ContactFiche | null): ContactInput {
  return {
    id: contact?.id,
    nom: contact?.nom ?? '',
    prenom: contact?.prenom ?? null,
    fonction: contact?.fonction ?? null,
    email: contact?.email ?? null,
    telephoneMobile: contact?.telephoneMobile ?? null,
    telephoneFixe: contact?.telephoneFixe ?? null,
    notes: contact?.notes ?? null,
    principal: contact?.principal ?? false,
    actif: contact?.actif ?? true,
  } as ContactInput;
}

/**
 * Frame (modale) de création / édition d'un contact rattaché à un tiers donné.
 * Le tiers (`source` + `tiersId`) est fixe — pas de sélecteur, contrairement à
 * `ContactCreateDialog` (annuaire). Enregistrement immédiat en base via les
 * server actions `creerContact` / `mettreAJourContact`, puis `router.refresh()`.
 */
export function ContactDialog({ source, tiersId, contact, open, onOpenChange }: Props) {
  const router = useRouter();
  const [erreur, setErreur] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const enEdition = Boolean(contact?.id);

  const form = useForm<ContactInput>({
    resolver: typedZodResolver(contactSchema),
    defaultValues: valeursParDefaut(contact),
  });

  // Resynchronise le formulaire à chaque ouverture / changement de contact ciblé.
  useEffect(() => {
    if (open) {
      form.reset(valeursParDefaut(contact));
      setErreur(null);
    }
  }, [open, contact, form]);

  async function handleSubmit(values: ContactInput) {
    setErreur(null);
    setIsSubmitting(true);
    const result =
      enEdition && contact?.id
        ? await mettreAJourContact(source, contact.id, values)
        : await creerContact({ ...values, source, tiersId });
    setIsSubmitting(false);
    if (!result.ok) {
      setErreur(result.error ?? 'Enregistrement impossible.');
      if (result.fieldErrors) {
        for (const [field, msgs] of Object.entries(result.fieldErrors)) {
          if (msgs?.[0]) form.setError(field as never, { type: 'server', message: msgs[0] });
        }
      }
      return;
    }
    toast.success(enEdition ? 'Contact mis à jour' : 'Contact créé');
    onOpenChange(false);
    router.refresh();
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{enEdition ? 'Modifier le contact' : 'Créer un contact'}</DialogTitle>
          <DialogDescription>
            Interlocuteur chez le tiers. Un seul contact peut être marqué « principal ».
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(handleSubmit)} className="grid gap-4">
            {erreur && (
              <Alert variant="destructive">
                <AlertTitle>Erreur</AlertTitle>
                <AlertDescription>{erreur}</AlertDescription>
              </Alert>
            )}

            <ContactFields control={form.control} />

            <DialogFooter>
              <Button
                type="button"
                variant="ghost"
                onClick={() => onOpenChange(false)}
                disabled={isSubmitting}
              >
                Annuler
              </Button>
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting ? 'Enregistrement…' : enEdition ? 'Enregistrer' : 'Créer le contact'}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
