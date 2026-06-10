'use client';

import { useState, useTransition } from 'react';
import { toast } from 'sonner';
import { useRouter } from 'next/navigation';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import type { SocieteRegle } from '@/db/schema/societes';
import {
  ajouterRegleSociete,
  basculerRegleSociete,
  supprimerRegleSociete,
} from '@/lib/referencement/societes';

type Props = {
  societeId: string;
  regles: SocieteRegle[];
  peutEcrire: boolean;
};

export function SocieteReglesManager({ societeId, regles, peutEcrire }: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [codeRegle, setCodeRegle] = useState('');
  const [libelle, setLibelle] = useState('');
  const [description, setDescription] = useState('');
  const [applique, setApplique] = useState(true);
  const [erreur, setErreur] = useState<string | null>(null);

  function handleAjouter() {
    setErreur(null);
    startTransition(async () => {
      const r = await ajouterRegleSociete(societeId, {
        codeRegle,
        libelle,
        applique,
        description: description.trim() || null,
      });
      if (!r.ok) {
        setErreur(r.error);
        return;
      }
      toast.success('Règle ajoutée');
      setCodeRegle('');
      setLibelle('');
      setDescription('');
      setApplique(true);
      router.refresh();
    });
  }

  function handleToggle(regleId: string, value: boolean) {
    startTransition(async () => {
      const r = await basculerRegleSociete(regleId, value);
      if (!r.ok) toast.error(r.error);
      else router.refresh();
    });
  }

  function handleSupprimer(regleId: string) {
    startTransition(async () => {
      const r = await supprimerRegleSociete(regleId);
      if (!r.ok) toast.error(r.error);
      else {
        toast.success('Règle supprimée');
        router.refresh();
      }
    });
  }

  return (
    <div className="space-y-4">
      <ul className="divide-y rounded-lg border">
        {regles.length === 0 && (
          <li className="p-4 text-sm text-muted-foreground">
            Aucune règle. Ajoutez-en une (ex. <span className="font-mono">SUSPENSION_CHANTIER_LRAR</span>).
          </li>
        )}
        {regles.map((r) => (
          <li key={r.id} className="flex flex-wrap items-center gap-3 p-3">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="font-mono text-xs">{r.codeRegle}</span>
                <Badge tone={r.applique ? 'emerald' : 'neutral'} shape="pill">
                  {r.applique ? 'Appliquée' : 'Inactive'}
                </Badge>
              </div>
              <div className="truncate text-sm">{r.libelle}</div>
              {r.description && (
                <div className="truncate text-xs text-muted-foreground">{r.description}</div>
              )}
            </div>
            {peutEcrire && (
              <div className="flex items-center gap-3">
                <Switch
                  checked={r.applique}
                  disabled={isPending}
                  onCheckedChange={(v) => handleToggle(r.id, v)}
                  aria-label={`Activer la règle ${r.codeRegle}`}
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  disabled={isPending}
                  onClick={() => handleSupprimer(r.id)}
                >
                  Supprimer
                </Button>
              </div>
            )}
          </li>
        ))}
      </ul>

      {peutEcrire && (
        <div className="rounded-lg border bg-card p-4">
          <h4 className="mb-3 text-sm font-medium">Ajouter une règle</h4>
          {erreur && <p className="mb-2 text-sm text-destructive">{erreur}</p>}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Input
              placeholder="Code (ex. SUSPENSION_CHANTIER_LRAR)"
              value={codeRegle}
              onChange={(e) => setCodeRegle(e.target.value)}
            />
            <Input
              placeholder="Libellé"
              value={libelle}
              onChange={(e) => setLibelle(e.target.value)}
            />
          </div>
          <Textarea
            className="mt-3"
            rows={2}
            placeholder="Description (optionnel)"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
          <div className="mt-3 flex items-center justify-between">
            <label className="flex items-center gap-2 text-sm">
              <Switch checked={applique} onCheckedChange={setApplique} />
              Appliquée
            </label>
            <Button type="button" size="sm" disabled={isPending} onClick={handleAjouter}>
              {isPending ? 'Ajout…' : 'Ajouter la règle'}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
