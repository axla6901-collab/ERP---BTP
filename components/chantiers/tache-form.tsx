'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';

import { Button } from '@/components/ui/button';
import {
  Form,
  FormControl,
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
import { chantierTacheSchema, type ChantierTacheInput } from '@/lib/validation/chantier-taches';

type ResponsableOption = { id: string; email: string };

type ServerActionResult = {
  ok: boolean;
  error?: string;
  fieldErrors?: Record<string, string[]>;
  data?: unknown;
};

type Props = {
  responsables: ResponsableOption[];
  defaultValues?: Partial<ChantierTacheInput>;
  onSubmit: (values: ChantierTacheInput) => Promise<ServerActionResult>;
  onCancel?: () => void;
  submitLabel?: string;
};

export function TacheForm({
  responsables,
  defaultValues,
  onSubmit,
  onCancel,
  submitLabel = 'Ajouter',
}: Props) {
  const form = useForm({
    resolver: zodResolver(chantierTacheSchema),
    defaultValues: {
      libelle: defaultValues?.libelle ?? '',
      description: defaultValues?.description ?? null,
      responsableId: defaultValues?.responsableId ?? null,
      statut: defaultValues?.statut ?? 'a_faire',
      avancementPourcent: defaultValues?.avancementPourcent ?? 0,
      dateDebutPrevue: defaultValues?.dateDebutPrevue ?? null,
      dateFinPrevue: defaultValues?.dateFinPrevue ?? null,
      dateDebutReelle: defaultValues?.dateDebutReelle ?? null,
      dateFinReelle: defaultValues?.dateFinReelle ?? null,
      notes: defaultValues?.notes ?? null,
    } as ChantierTacheInput,
  });

  async function handle(values: ChantierTacheInput) {
    const r = await onSubmit(values);
    if (!r.ok) {
      if (r.fieldErrors) {
        for (const [field, msgs] of Object.entries(r.fieldErrors)) {
          if (msgs?.[0]) form.setError(field as never, { type: 'server', message: msgs[0] });
        }
      }
      if (r.error) form.setError('libelle', { type: 'server', message: r.error });
      return;
    }
    form.reset();
  }

  const responsableLibelle = (id: string | null) =>
    id ? (responsables.find((r) => r.id === id)?.email ?? '—') : 'Non assigné';

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(handle)} className="grid gap-3">
        <FormSection number={1} title="Identification" storageKey="tache:identification">
          <FormField
            control={form.control}
            name="libelle"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Libellé</FormLabel>
                <FormControl>
                  <Input placeholder="Démolition cloison" maxLength={200} {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </FormSection>

        <FormSection number={2} title="Affectation" storageKey="tache:affectation">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <FormField
              control={form.control}
              name="responsableId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Responsable</FormLabel>
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

            <FormField
              control={form.control}
              name="avancementPourcent"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Avancement (%)</FormLabel>
                  <FormControl>
                    <Input
                      type="number"
                      min={0}
                      max={100}
                      step={5}
                      {...field}
                      value={field.value ?? 0}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>
        </FormSection>

        <FormSection number={3} title="Planning" storageKey="tache:planning">
          <FormSubCard title="Prévisionnel">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
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
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <FormField
                control={form.control}
                name="dateDebutReelle"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Début réel</FormLabel>
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
                    <FormLabel>Fin réelle</FormLabel>
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

        <FormSection number={4} title="Notes" storageKey="tache:notes" defaultOpen={false}>
          <FormField
            control={form.control}
            name="description"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Description / notes</FormLabel>
                <FormControl>
                  <Textarea rows={2} {...field} value={field.value ?? ''} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </FormSection>

        <div className="flex justify-end gap-2">
          {onCancel && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={onCancel}
              disabled={form.formState.isSubmitting}
            >
              Annuler
            </Button>
          )}
          <Button type="submit" size="sm" disabled={form.formState.isSubmitting}>
            {form.formState.isSubmitting ? 'Enregistrement…' : submitLabel}
          </Button>
        </div>
      </form>
    </Form>
  );
}
