'use client';

import { PencilIcon } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';

import { BoutonConfirmation } from '@/components/test-sirh/bouton-confirmation';
import { OptionSelect } from '@/components/test-sirh/option-select';
import { SirhVide } from '@/components/test-sirh/sirh-bloc';
import { PastilleCouleur } from '@/components/test-sirh/statut-badges';
import { Badge, type BadgeTone } from '@/components/ui/badge';
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
import { Switch } from '@/components/ui/switch';
import type { ActionResult } from '@/lib/common/action-result';
import { typedZodResolver } from '@/lib/forms/zod-resolver';
import { optionsEmployes } from '@/lib/test-sirh/collaborateurs/options';
import { formatDateFr } from '@/lib/test-sirh/format';
import {
  LIBELLES_STATUT_MEMBRE,
  statutMembre,
  type StatutMembre,
} from '@/lib/test-sirh/organisation/membres';
import {
  membreEquipeSchema,
  type MembreEquipeInput,
} from '@/lib/validation/test-sirh/organisation';

import type { OptionEmployeEquipe } from './equipe-dialog';

/** Membre affiché (sérialisable, préparé par la page serveur). */
export type MembreLigne = {
  id: string;
  equipeId: string;
  employeId: string;
  employeNom: string;
  employeActif: boolean;
  estResponsable: boolean;
  dateDebut: string | null;
  dateFin: string | null;
};

const TON_STATUT_MEMBRE: Record<StatutMembre, BadgeTone> = {
  a_venir: 'sky',
  actif: 'emerald',
  termine: 'neutral',
};

/** Période lisible : « depuis le … », « jusqu’au … », « du … au … ». */
export function libellePeriodeMembre(m: { dateDebut: string | null; dateFin: string | null }) {
  if (m.dateDebut && m.dateFin) return `${formatDateFr(m.dateDebut)} → ${formatDateFr(m.dateFin)}`;
  if (m.dateDebut) return `Depuis le ${formatDateFr(m.dateDebut)}`;
  if (m.dateFin) return `Jusqu’au ${formatDateFr(m.dateFin)}`;
  return '—';
}

function valeursMembre(equipeId: string, today: string, membre?: MembreLigne | null) {
  return {
    id: membre?.id,
    equipeId,
    employeId: membre?.employeId ?? '',
    estResponsable: membre?.estResponsable ?? false,
    dateDebut: membre ? membre.dateDebut : today,
    dateFin: membre?.dateFin ?? null,
  } satisfies MembreEquipeInput;
}

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  equipe: { id: string; nom: string; couleur: string } | null;
  /** Membres (historique compris) de cette équipe. */
  membres: readonly MembreLigne[];
  employes: readonly OptionEmployeEquipe[];
  peutGerer: boolean;
  today: string;
  actions: {
    enregistrer: (input: MembreEquipeInput) => Promise<ActionResult<{ id: string }>>;
    retirer: (id: string) => Promise<ActionResult>;
  };
};

/**
 * Gestion des membres d'une équipe (Factorial teams/Membership) : liste avec
 * période et rôle, ajout / modification en ligne, retrait (soft-delete).
 */
export function MembresEquipeDialog({
  open,
  onOpenChange,
  equipe,
  membres,
  employes,
  peutGerer,
  today,
  actions,
}: Props) {
  const [edite, setEdite] = useState<MembreLigne | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const equipeId = equipe?.id ?? '';

  const form = useForm<MembreEquipeInput>({
    resolver: typedZodResolver(membreEquipeSchema),
    defaultValues: valeursMembre(equipeId, today),
  });

  useEffect(() => {
    if (open) {
      setEdite(null);
      setErreur(null);
      form.reset(valeursMembre(equipeId, today));
    }
  }, [open, equipeId, today, form]);

  const tries = useMemo(
    () =>
      [...membres].sort((a, b) => {
        const ordre = { actif: 0, a_venir: 1, termine: 2 } as const;
        const d = ordre[statutMembre(a, today)] - ordre[statutMembre(b, today)];
        return d !== 0 ? d : a.employeNom.localeCompare(b.employeNom, 'fr');
      }),
    [membres, today],
  );

  // Ajout : employés actifs qui ne sont pas déjà membres en vigueur de l'équipe.
  const optionsAjout = useMemo(() => {
    const dejaMembres = new Set(
      membres.filter((m) => statutMembre(m, today) !== 'termine').map((m) => m.employeId),
    );
    return optionsEmployes(employes).filter((o) => !dejaMembres.has(o.id));
  }, [membres, employes, today]);
  const optionsEdition = useMemo(
    () => (edite ? [{ id: edite.employeId, label: edite.employeNom }] : []),
    [edite],
  );

  function modifier(m: MembreLigne) {
    setEdite(m);
    setErreur(null);
    form.reset(valeursMembre(equipeId, today, m));
  }

  function annulerEdition() {
    setEdite(null);
    setErreur(null);
    form.reset(valeursMembre(equipeId, today));
  }

  async function handleSubmit(values: MembreEquipeInput) {
    setErreur(null);
    setIsSubmitting(true);
    const result = await actions.enregistrer(values);
    setIsSubmitting(false);
    if (!result.ok) {
      setErreur(result.error);
      if (result.fieldErrors) {
        for (const [field, msgs] of Object.entries(result.fieldErrors)) {
          if (msgs?.[0]) form.setError(field as never, { type: 'server', message: msgs[0] });
        }
      }
      return;
    }
    toast.success(edite ? 'Membre mis à jour' : 'Membre ajouté');
    annulerEdition();
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {equipe && <PastilleCouleur couleur={equipe.couleur} />}
            Membres — {equipe?.nom ?? ''}
          </DialogTitle>
          <DialogDescription>
            Appartenances datées : un membre dont la date de fin est passée reste dans l’historique.
          </DialogDescription>
        </DialogHeader>

        {tries.length === 0 ? (
          <SirhVide>Aucun membre dans cette équipe.</SirhVide>
        ) : (
          <div className="overflow-x-auto rounded-md border">
            <table className="w-full text-sm">
              <thead className="bg-muted/40 text-left text-xs uppercase tracking-widest text-muted-foreground">
                <tr>
                  <th className="px-3 py-2 font-medium">Collaborateur</th>
                  <th className="px-3 py-2 font-medium">Période</th>
                  <th className="px-3 py-2 font-medium">Statut</th>
                  {peutGerer && <th className="px-3 py-2" />}
                </tr>
              </thead>
              <tbody className="divide-y">
                {tries.map((m) => {
                  const statut = statutMembre(m, today);
                  return (
                    <tr key={m.id} className={statut === 'termine' ? 'opacity-60' : undefined}>
                      <td className="px-3 py-2">
                        <span className="font-medium">{m.employeNom}</span>
                        {m.estResponsable && (
                          <Badge tone="amber" className="ml-2">
                            Responsable
                          </Badge>
                        )}
                        {!m.employeActif && (
                          <span className="ml-2 text-xs text-muted-foreground">(sorti)</span>
                        )}
                      </td>
                      <td className="px-3 py-2 tabular-nums text-muted-foreground">
                        {libellePeriodeMembre(m)}
                      </td>
                      <td className="px-3 py-2">
                        <Badge tone={TON_STATUT_MEMBRE[statut]} shape="pill">
                          {LIBELLES_STATUT_MEMBRE[statut]}
                        </Badge>
                      </td>
                      {peutGerer && (
                        <td className="px-3 py-2">
                          <div className="flex items-center justify-end gap-1">
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              className="h-7 w-7 p-0"
                              onClick={() => modifier(m)}
                              title="Modifier"
                              aria-label={`Modifier ${m.employeNom}`}
                            >
                              <PencilIcon className="size-3.5" />
                            </Button>
                            <BoutonConfirmation
                              libelle="Retirer"
                              question="Retirer ce membre ?"
                              libelleConfirmer="Retirer"
                              messageSucces="Membre retiré"
                              onConfirm={() => actions.retirer(m.id)}
                            />
                          </div>
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {peutGerer && equipe && (
          <Form {...form}>
            <form
              onSubmit={form.handleSubmit(handleSubmit)}
              className="grid gap-3 rounded-md border bg-muted/20 p-4"
              aria-label={edite ? 'Modifier le membre' : 'Ajouter un membre'}
            >
              <p className="text-sm font-medium">
                {edite ? `Modifier — ${edite.employeNom}` : 'Ajouter un membre'}
              </p>
              {erreur && <p className="text-sm text-destructive">{erreur}</p>}
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <FormField
                  control={form.control}
                  name="employeId"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Collaborateur</FormLabel>
                      <OptionSelect
                        options={edite ? optionsEdition : optionsAjout}
                        value={field.value || null}
                        onChange={(v) => field.onChange(v ?? '')}
                        libelleAucune="— Choisir —"
                        disabled={Boolean(edite)}
                        aria-label="Collaborateur"
                      />
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="estResponsable"
                  render={({ field }) => (
                    <FormItem className="flex items-center gap-2 sm:pt-6">
                      <FormControl>
                        <Switch checked={field.value} onCheckedChange={field.onChange} />
                      </FormControl>
                      <FormLabel className="!mt-0">Responsable d’équipe</FormLabel>
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="dateDebut"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Début</FormLabel>
                      <FormControl>
                        <Input type="date" {...field} value={field.value ?? ''} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="dateFin"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Fin</FormLabel>
                      <FormControl>
                        <Input type="date" {...field} value={field.value ?? ''} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
              <div className="flex flex-wrap justify-end gap-2">
                {edite && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={annulerEdition}
                    disabled={isSubmitting}
                  >
                    Annuler
                  </Button>
                )}
                <Button type="submit" size="sm" disabled={isSubmitting}>
                  {isSubmitting ? 'Enregistrement…' : edite ? 'Enregistrer' : 'Ajouter'}
                </Button>
              </div>
            </form>
          </Form>
        )}
      </DialogContent>
    </Dialog>
  );
}
