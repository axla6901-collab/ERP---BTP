'use client';

import { Trash2Icon } from 'lucide-react';
import { useFieldArray, type Control, type UseFormReturn } from 'react-hook-form';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import type {
  DevisInput,
  LigneDevisInput,
  PosteInterneFormInput,
} from '@/lib/validation/commercial';

type Props = {
  /** Form RHF complet (on a besoin du `control` + `watch` + `setValue` pour
   *  manipuler le tableau `postesInternes` et lire les lignes en live). */
  form: UseFormReturn<DevisInput>;
  /** Force l'affichage de l'encart même si aucun poste n'est défini.
   *  Utilisé après un import DPGF pour proposer l'ajout de coûts internes. */
  forcerAffichage?: boolean;
};

function nouveauPoste(): PosteInterneFormInput {
  return {
    portee: 'devis',
    chapitreOrdre: null,
    libelle: 'Frais internes',
    montantHt: '0',
    notes: null,
    repartitions: [],
  };
}

export function PostesInternesEditor({ form, forcerAffichage = false }: Props) {
  const lignes = form.watch('lignes') as LigneDevisInput[];
  const postes = form.watch('postesInternes') as PosteInterneFormInput[];

  const { fields, append, remove, update } = useFieldArray({
    control: form.control as Control<DevisInput>,
    name: 'postesInternes',
  });

  // Sections disponibles pour la portée "chapitre"
  const sections = lignes
    .map((l, idx) => ({ ordre: idx, libelle: l.designation, type: l.type }))
    .filter((s) => s.type === 'section');

  // Articles disponibles pour la pondération manuelle
  const articlesAvecIndex = lignes
    .map((l, idx) => ({ ordre: idx, libelle: l.designation, type: l.type }))
    .filter((s) => s.type !== 'section');

  function articlesDuChapitre(ordreSection: number) {
    const idx = lignes.findIndex(
      (_, i) => i === ordreSection && lignes[i]?.type === 'section',
    );
    if (idx === -1) return [];
    const res: Array<{ ordre: number; libelle: string }> = [];
    for (let i = idx + 1; i < lignes.length; i++) {
      const l = lignes[i]!;
      if (l.type === 'section') break;
      res.push({ ordre: i, libelle: l.designation });
    }
    return res;
  }

  function changerPortee(idx: number, portee: 'devis' | 'chapitre') {
    const actuel = postes[idx]!;
    if (portee === 'devis') {
      update(idx, {
        ...actuel,
        portee: 'devis',
        chapitreOrdre: null,
        repartitions: [],
      } as PosteInterneFormInput);
    } else {
      const premiereSection = sections[0]?.ordre ?? 0;
      update(idx, {
        ...actuel,
        portee: 'chapitre',
        chapitreOrdre: premiereSection,
        repartitions: [],
      } as PosteInterneFormInput);
    }
  }

  if (fields.length === 0 && !forcerAffichage) return null;

  return (
    <div className="rounded-md border bg-amber-50/40 dark:bg-amber-900/10">
      <div className="border-b bg-amber-100/50 px-4 py-2 text-sm font-medium dark:bg-amber-900/20">
        Postes internes ventilés — invisibles au client ({fields.length})
      </div>
      <div className="space-y-2 p-3 text-xs text-muted-foreground">
        Ces postes (frais généraux, aléas, marge…) sont répartis sur les lignes
        visibles selon la portée et les poids choisis. Le client ne voit que les
        PU effectifs (PU nu + apport ventilé). Sans poids défini, la ventilation
        est uniforme dans la portée.
      </div>
      <div className="divide-y">
        {fields.map((field, idx) => {
          const poste = postes[idx];
          if (!poste) return null;
          const portee = poste.portee;
          const articlesPortee =
            portee === 'devis'
              ? articlesAvecIndex
              : poste.chapitreOrdre !== null
                ? articlesDuChapitre(poste.chapitreOrdre)
                : [];
          return (
            <PosteRow
              key={field.id}
              idx={idx}
              poste={poste}
              sections={sections}
              articlesPortee={articlesPortee}
              onSupprimer={() => remove(idx)}
              onPortee={(p) => changerPortee(idx, p)}
              form={form}
            />
          );
        })}
        {fields.length === 0 && (
          <p className="px-3 py-2 text-xs italic text-muted-foreground">
            Aucun poste interne. Ajoutez-en un pour gonfler les PU des lignes
            sans rendre le montant visible au client.
          </p>
        )}
      </div>
      <div className="border-t bg-amber-100/30 p-2 dark:bg-amber-900/10">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => append(nouveauPoste())}
        >
          + Ajouter un poste interne
        </Button>
      </div>
    </div>
  );
}

function PosteRow({
  idx,
  poste,
  sections,
  articlesPortee,
  onSupprimer,
  onPortee,
  form,
}: {
  idx: number;
  poste: PosteInterneFormInput;
  sections: Array<{ ordre: number; libelle: string }>;
  articlesPortee: Array<{ ordre: number; libelle: string }>;
  onSupprimer: () => void;
  onPortee: (p: 'devis' | 'chapitre') => void;
  form: UseFormReturn<DevisInput>;
}) {
  // Lecture/écriture des poids manuels via le tableau `repartitions`
  // (Map ordre → poids string).
  const repartitionParOrdre = new Map<number, string>();
  for (const r of poste.repartitions) {
    repartitionParOrdre.set(r.ordreLigne, r.poids);
  }
  const aPoids = poste.repartitions.length > 0;

  function setPoids(ordreLigne: number, poids: string) {
    const map = new Map(repartitionParOrdre);
    if (poids.trim() === '' || Number(poids) === 0) {
      map.delete(ordreLigne);
    } else {
      map.set(ordreLigne, poids);
    }
    form.setValue(
      `postesInternes.${idx}.repartitions`,
      Array.from(map.entries()).map(([o, p]) => ({ ordreLigne: o, poids: p })),
      { shouldDirty: true, shouldTouch: true },
    );
  }

  function viderPoids() {
    form.setValue(`postesInternes.${idx}.repartitions`, [], {
      shouldDirty: true,
      shouldTouch: true,
    });
  }

  return (
    <div className="space-y-3 p-3">
      <div className="grid gap-2 md:grid-cols-2">
        <label className="flex flex-col gap-1">
          <span className="text-xs">Libellé (interne)</span>
          <Input
            maxLength={200}
            placeholder="Frais généraux, aléas, marge…"
            {...form.register(`postesInternes.${idx}.libelle` as const)}
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-xs">Montant HT à ventiler</span>
          <Input
            inputMode="decimal"
            placeholder="0.00"
            {...form.register(`postesInternes.${idx}.montantHt` as const)}
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-xs">Portée</span>
          <Select
            value={poste.portee}
            onValueChange={(v) =>
              v && onPortee(v === 'chapitre' ? 'chapitre' : 'devis')
            }
          >
            <SelectTrigger className="h-9">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="devis">Tout le devis</SelectItem>
              <SelectItem value="chapitre" disabled={sections.length === 0}>
                Un chapitre précis
              </SelectItem>
            </SelectContent>
          </Select>
        </label>
        {poste.portee === 'chapitre' && (
          <label className="flex flex-col gap-1">
            <span className="text-xs">Chapitre</span>
            <Select
              value={
                poste.chapitreOrdre !== null ? String(poste.chapitreOrdre) : ''
              }
              onValueChange={(v) => {
                if (!v) return;
                form.setValue(
                  `postesInternes.${idx}.chapitreOrdre` as never,
                  Number(v) as never,
                  { shouldDirty: true },
                );
                // Vide les répartitions car le scope change.
                form.setValue(`postesInternes.${idx}.repartitions`, [], {
                  shouldDirty: true,
                });
              }}
            >
              <SelectTrigger className="h-9">
                <SelectValue placeholder="Choisir un chapitre" />
              </SelectTrigger>
              <SelectContent>
                {sections.map((s) => (
                  <SelectItem key={s.ordre} value={String(s.ordre)}>
                    {s.libelle || `Section ${s.ordre + 1}`}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </label>
        )}
      </div>

      <details className="rounded border bg-background/50 p-2">
        <summary className="cursor-pointer text-xs font-medium">
          Pondération {aPoids ? 'manuelle' : 'uniforme (par défaut)'} ·{' '}
          {articlesPortee.length} ligne{articlesPortee.length > 1 ? 's' : ''}{' '}
          dans la portée
        </summary>
        <div className="mt-2 space-y-2">
          <p className="text-[11px] text-muted-foreground">
            Définissez un poids par ligne pour pondérer la répartition. Une
            ligne sans poids reçoit 0 dès qu&apos;un poids est défini ailleurs (mode
            sélectif). Vidé = ventilation uniforme sur toute la portée.
          </p>
          <div className="max-h-48 overflow-auto rounded border">
            <table className="w-full text-xs">
              <thead className="bg-muted/40">
                <tr>
                  <th className="px-2 py-1 text-left">Ligne</th>
                  <th className="px-2 py-1 text-right">Poids</th>
                </tr>
              </thead>
              <tbody>
                {articlesPortee.length === 0 && (
                  <tr>
                    <td colSpan={2} className="px-2 py-2 italic text-muted-foreground">
                      Aucune ligne dans la portée. Ajoutez des articles ou
                      changez la portée.
                    </td>
                  </tr>
                )}
                {articlesPortee.map((a) => (
                  <tr key={a.ordre}>
                    <td className="px-2 py-1">{a.libelle || `Ligne ${a.ordre + 1}`}</td>
                    <td className="px-2 py-1">
                      <Input
                        className="ml-auto h-7 w-24 text-right"
                        inputMode="decimal"
                        placeholder="(uniforme)"
                        value={repartitionParOrdre.get(a.ordre) ?? ''}
                        onChange={(e) => setPoids(a.ordre, e.target.value)}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {aPoids && (
            <Button type="button" variant="ghost" size="sm" onClick={viderPoids}>
              Repasser en uniforme
            </Button>
          )}
        </div>
      </details>

      <Textarea
        rows={2}
        placeholder="Notes internes (non imprimées)"
        {...form.register(`postesInternes.${idx}.notes` as const)}
      />

      <div className="flex justify-end">
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          onClick={onSupprimer}
          aria-label="Supprimer ce poste interne"
        >
          <Trash2Icon />
        </Button>
      </div>
    </div>
  );
}
