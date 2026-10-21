'use client';

import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';

import { BoutonConfirmation } from '@/components/test-sirh/bouton-confirmation';
import { SirhVide } from '@/components/test-sirh/sirh-bloc';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import type { ActionResult } from '@/lib/common/action-result';
import { typedZodResolver } from '@/lib/forms/zod-resolver';
import { formatDuree } from '@/lib/test-sirh/absences/soldes';
import type { CompteurLigne } from '@/lib/test-sirh/absences/types';
import { formatDateFr } from '@/lib/test-sirh/format';
import { cn } from '@/lib/utils';
import { ajustementSchema, type AjustementInput } from '@/lib/validation/test-sirh/absences';

export type ActionsAjustements = {
  ajouter: (input: AjustementInput) => Promise<ActionResult<{ id: string }>>;
  supprimer: (id: string) => Promise<ActionResult>;
};

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  compteur: CompteurLigne | null;
  today: string;
  /** Absent = consultation seule. */
  actions?: ActionsAjustements | null | undefined;
};

function valeursAjustement(compteurId: string, today: string): AjustementInput {
  return { compteurId, dateAjustement: today, valeur: '', motif: '' };
}

/** Détail du solde d'un compteur + ajustements manuels (Factorial AllowanceIncidence). */
export function AjustementsDialog({ open, onOpenChange, compteur, today, actions }: Props) {
  const [erreur, setErreur] = useState<string | null>(null);
  const compteurId = compteur?.id ?? '';

  const form = useForm<AjustementInput>({
    resolver: typedZodResolver(ajustementSchema),
    defaultValues: valeursAjustement(compteurId, today),
  });

  useEffect(() => {
    if (open) {
      form.reset(valeursAjustement(compteurId, today));
      setErreur(null);
    }
  }, [open, compteurId, today, form]);

  async function handleSubmit(values: AjustementInput) {
    if (!actions) return;
    setErreur(null);
    const result = await actions.ajouter(values);
    if (!result.ok) {
      setErreur(result.error);
      if (result.fieldErrors) {
        for (const [field, msgs] of Object.entries(result.fieldErrors)) {
          if (msgs?.[0]) form.setError(field as never, { type: 'server', message: msgs[0] });
        }
      }
      return;
    }
    toast.success('Ajustement enregistré');
    form.reset(valeursAjustement(compteurId, today));
  }

  const unite = compteur?.unite ?? 'jours_ouvres';
  const enCours = form.formState.isSubmitting;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Solde et ajustements</DialogTitle>
          <DialogDescription>
            {compteur
              ? `${compteur.employe} · ${compteur.typeLibelle} · du ${formatDateFr(compteur.periodeDebut)} au ${formatDateFr(compteur.periodeFin)}`
              : '—'}
          </DialogDescription>
        </DialogHeader>

        {compteur && (
          <dl className="grid grid-cols-1 gap-x-4 gap-y-1 rounded-lg border bg-muted/30 px-3 py-2 text-sm sm:grid-cols-3">
            <div>
              <dt className="text-xs text-muted-foreground">Droits</dt>
              <dd className="tabular-nums">{formatDuree(compteur.droitsAcquis, unite)}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">Report</dt>
              <dd className="tabular-nums">{formatDuree(compteur.report, unite)}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">Ajustements</dt>
              <dd className="tabular-nums">{formatDuree(compteur.totalAjustements, unite)}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">Pris</dt>
              <dd className="tabular-nums">{formatDuree(compteur.pris, unite)}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">En attente</dt>
              <dd className="tabular-nums">{formatDuree(compteur.enAttente, unite)}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">Solde</dt>
              <dd
                className={cn(
                  'font-semibold tabular-nums',
                  compteur.solde < 0 ? 'text-rose-700' : 'text-emerald-700',
                )}
              >
                {formatDuree(compteur.solde, unite)}
              </dd>
            </div>
          </dl>
        )}

        {compteur && compteur.ajustements.length === 0 ? (
          <SirhVide>Aucun ajustement sur ce compteur.</SirhVide>
        ) : (
          <ul className="divide-y rounded-lg border text-sm">
            {compteur?.ajustements.map((a) => (
              <li key={a.id} className="flex items-center gap-3 px-3 py-2">
                <span className="w-24 shrink-0 tabular-nums text-muted-foreground">
                  {formatDateFr(a.dateAjustement)}
                </span>
                <span
                  className={cn(
                    'w-20 shrink-0 text-right font-medium tabular-nums',
                    a.valeur < 0 ? 'text-rose-700' : 'text-emerald-700',
                  )}
                >
                  {a.valeur > 0 ? '+' : ''}
                  {formatDuree(a.valeur, unite)}
                </span>
                <span className="min-w-0 flex-1 truncate" title={a.motif}>
                  {a.motif}
                </span>
                {actions && (
                  <BoutonConfirmation
                    libelle="Supprimer"
                    question="Supprimer ?"
                    libelleConfirmer="Supprimer"
                    messageSucces="Ajustement supprimé"
                    onConfirm={() => actions.supprimer(a.id)}
                  />
                )}
              </li>
            ))}
          </ul>
        )}

        {actions && compteur && (
          <Form {...form}>
            <form
              onSubmit={form.handleSubmit(handleSubmit)}
              className="grid gap-3 rounded-lg border p-3"
            >
              <p className="text-sm font-medium">Nouvel ajustement</p>
              {erreur && (
                <Alert variant="destructive">
                  <AlertTitle>Erreur</AlertTitle>
                  <AlertDescription>{erreur}</AlertDescription>
                </Alert>
              )}
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <FormField
                  control={form.control}
                  name="dateAjustement"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Date</FormLabel>
                      <FormControl>
                        <Input type="date" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="valeur"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Valeur (+ crédit / − débit)</FormLabel>
                      <FormControl>
                        <Input inputMode="decimal" placeholder="ex. 2 ou -0,5" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
              <FormField
                control={form.control}
                name="motif"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Motif</FormLabel>
                    <FormControl>
                      <Input maxLength={500} {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <div className="flex justify-end">
                <Button type="submit" size="sm" disabled={enCours}>
                  {enCours ? 'Enregistrement…' : 'Ajouter l’ajustement'}
                </Button>
              </div>
            </form>
          </Form>
        )}
      </DialogContent>
    </Dialog>
  );
}
