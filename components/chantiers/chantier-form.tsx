'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { FormSection, FormSubCard } from '@/components/ui/form-section';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { chantierSchema, type ChantierInput } from '@/lib/validation/chantiers';

type ServerActionResult = {
  ok: boolean;
  error?: string;
  fieldErrors?: Record<string, string[]>;
  data?: { id: string; numero?: string } | void;
};

type ClientOption = { id: string; code: string; libelle: string };
type ResponsableOption = { id: string; email: string };

type Props = {
  clients: ClientOption[];
  responsables: ResponsableOption[];
  defaultValues?: Partial<ChantierInput>;
  onSubmit: (values: ChantierInput) => Promise<ServerActionResult>;
  successRedirect: string;
  /** masque le champ statut (création : toujours 'prospect') */
  hideStatut?: boolean;
};

export function ChantierForm({
  clients,
  responsables,
  defaultValues,
  onSubmit,
  successRedirect,
  hideStatut,
}: Props) {
  const router = useRouter();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);

  const form = useForm({
    resolver: zodResolver(chantierSchema),
    defaultValues: {
      libelle: defaultValues?.libelle ?? '',
      clientId: defaultValues?.clientId ?? '',
      responsableId: defaultValues?.responsableId ?? null,
      statut: defaultValues?.statut ?? 'prospect',
      dateDebutPrevue: defaultValues?.dateDebutPrevue ?? null,
      dateFinPrevue: defaultValues?.dateFinPrevue ?? null,
      dateDebutReelle: defaultValues?.dateDebutReelle ?? null,
      dateFinReelle: defaultValues?.dateFinReelle ?? null,
      montantPrevisionnelHt: defaultValues?.montantPrevisionnelHt ?? null,
      adresseLigne1: defaultValues?.adresseLigne1 ?? null,
      adresseLigne2: defaultValues?.adresseLigne2 ?? null,
      codePostal: defaultValues?.codePostal ?? null,
      ville: defaultValues?.ville ?? null,
      description: defaultValues?.description ?? null,
      notes: defaultValues?.notes ?? null,
    } as ChantierInput,
  });

  async function handleSubmit(values: ChantierInput) {
    setErreur(null);
    setIsSubmitting(true);
    const result = await onSubmit(values);
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
    toast.success('Chantier enregistré');
    router.push(successRedirect);
    router.refresh();
  }

  const clientLibelle = (id: string) => clients.find((c) => c.id === id)?.libelle ?? '—';
  const responsableLibelle = (id: string | null) =>
    id ? (responsables.find((r) => r.id === id)?.email ?? '—') : 'Non assigné';

  return (
    <Form {...form}>
      <form
        method="post"
        onSubmit={form.handleSubmit(handleSubmit)}
        className="grid max-w-3xl gap-4"
      >
        {erreur && (
          <Alert variant="destructive">
            <AlertTitle>Erreur</AlertTitle>
            <AlertDescription>{erreur}</AlertDescription>
          </Alert>
        )}

        <FormSection number={1} title="Identification" storageKey="chantier:identification">
          <FormField
            control={form.control}
            name="libelle"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Libellé du chantier</FormLabel>
                <FormControl>
                  <Input placeholder="Rénovation maison Dupont" maxLength={200} {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          {!hideStatut && (
            <FormField
              control={form.control}
              name="statut"
              render={({ field }) => (
                <FormItem className="mt-4 max-w-xs">
                  <FormLabel>Statut initial</FormLabel>
                  <FormControl>
                    <Input value={field.value ?? 'prospect'} readOnly disabled />
                  </FormControl>
                  <FormDescription>Modifiable depuis la page détail.</FormDescription>
                </FormItem>
              )}
            />
          )}
        </FormSection>

        <FormSection number={2} title="Client / Affaire" storageKey="chantier:client">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <FormField
              control={form.control}
              name="clientId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Client</FormLabel>
                  <Select value={field.value} onValueChange={field.onChange}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue>{(v) => clientLibelle(v as string)}</SelectValue>
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {clients.map((c) => (
                        <SelectItem key={c.id} value={c.id}>
                          <span className="font-mono text-xs text-muted-foreground">{c.code}</span>{' '}
                          {c.libelle}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="responsableId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Responsable (optionnel)</FormLabel>
                  <Select
                    value={field.value ?? ''}
                    onValueChange={(v) => field.onChange(v === '__none__' ? null : v)}
                  >
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue>
                          {(v) => responsableLibelle((v as string) || null)}
                        </SelectValue>
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="__none__">Non assigné</SelectItem>
                      {responsables.map((r) => (
                        <SelectItem key={r.id} value={r.id}>
                          {r.email}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>

          <FormField
            control={form.control}
            name="montantPrevisionnelHt"
            render={({ field }) => (
              <FormItem className="mt-4 max-w-xs">
                <FormLabel>Montant prévisionnel HT (€)</FormLabel>
                <FormControl>
                  <Input
                    type="number"
                    step="0.01"
                    min="0"
                    placeholder="0.00"
                    {...field}
                    value={field.value ?? ''}
                  />
                </FormControl>
                <FormDescription>Pré-rempli depuis le devis le cas échéant.</FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />
        </FormSection>

        <FormSection number={3} title="Planning" storageKey="chantier:planning">
          <FormSubCard title="Prévisionnel">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <FormField
                control={form.control}
                name="dateDebutPrevue"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Début prévu</FormLabel>
                    <FormControl>
                      <Input type="date" {...field} value={field.value ?? ''} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="dateFinPrevue"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Fin prévue</FormLabel>
                    <FormControl>
                      <Input type="date" {...field} value={field.value ?? ''} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
          </FormSubCard>
          <FormSubCard title="Réalisé" className="mt-3">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <FormField
                control={form.control}
                name="dateDebutReelle"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Début réel (optionnel)</FormLabel>
                    <FormControl>
                      <Input type="date" {...field} value={field.value ?? ''} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="dateFinReelle"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Fin réelle (optionnel)</FormLabel>
                    <FormControl>
                      <Input type="date" {...field} value={field.value ?? ''} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
          </FormSubCard>
        </FormSection>

        <FormSection
          number={4}
          title="Adresse du chantier"
          storageKey="chantier:adresse"
          defaultOpen={false}
        >
          <FormField
            control={form.control}
            name="adresseLigne1"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Adresse</FormLabel>
                <FormControl>
                  <Input maxLength={200} {...field} value={field.value ?? ''} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="adresseLigne2"
            render={({ field }) => (
              <FormItem className="mt-4">
                <FormLabel>Complément</FormLabel>
                <FormControl>
                  <Input maxLength={200} {...field} value={field.value ?? ''} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <FormField
              control={form.control}
              name="codePostal"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Code postal</FormLabel>
                  <FormControl>
                    <Input maxLength={5} {...field} value={field.value ?? ''} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="ville"
              render={({ field }) => (
                <FormItem className="col-span-2">
                  <FormLabel>Ville</FormLabel>
                  <FormControl>
                    <Input maxLength={100} {...field} value={field.value ?? ''} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>
        </FormSection>

        <FormSection number={5} title="Notes" storageKey="chantier:notes" defaultOpen={false}>
          <FormField
            control={form.control}
            name="description"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Description (optionnel)</FormLabel>
                <FormControl>
                  <Textarea rows={3} {...field} value={field.value ?? ''} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="notes"
            render={({ field }) => (
              <FormItem className="mt-4">
                <FormLabel>Notes internes (optionnel)</FormLabel>
                <FormControl>
                  <Textarea rows={3} {...field} value={field.value ?? ''} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </FormSection>

        <div className="flex justify-end gap-2">
          <Button
            variant="ghost"
            type="button"
            onClick={() => router.back()}
            disabled={isSubmitting}
          >
            Annuler
          </Button>
          <Button type="submit" disabled={isSubmitting}>
            {isSubmitting ? 'Enregistrement…' : 'Enregistrer'}
          </Button>
        </div>
      </form>
    </Form>
  );
}
