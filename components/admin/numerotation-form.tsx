'use client';

import { useEffect, useState, useTransition } from 'react';
import { toast } from 'sonner';

import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { FormSection } from '@/components/ui/form-section';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  CADENCES_RESET,
  cadenceMaxAutoriseePourTemplate,
  cadencesAutorisees,
  formatNumero,
  LIBELLES_CADENCE,
  LIBELLES_CADENCE_COURT,
  LIBELLES_TYPE_NUMERO,
  parseTemplate,
  TEMPLATES_PAR_DEFAUT,
  TOKENS_AIDE,
  validerCadence,
  type CadenceReset,
  type TypeNumeroDoc,
} from '@/lib/numerotation/template';
import type { ModeleAvecDefaut, ModeleInput } from '@/lib/numerotation/modeles';

type ActionResult = {
  ok: boolean;
  error?: string;
  fieldErrors?: Record<string, string[]>;
};

type Props = {
  modeles: ModeleAvecDefaut[];
  onEnregistrer: (input: ModeleInput) => Promise<ActionResult>;
  onReinitialiser: (typeDoc: TypeNumeroDoc) => Promise<ActionResult>;
};

export function NumerotationForm({ modeles, onEnregistrer, onReinitialiser }: Props) {
  return (
    <div className="space-y-4">
      <AideTokens />
      <div className="grid gap-4 md:grid-cols-2">
        {modeles.map((m) => (
          <LigneModele
            key={m.typeDoc}
            modele={m}
            onEnregistrer={onEnregistrer}
            onReinitialiser={onReinitialiser}
          />
        ))}
      </div>
    </div>
  );
}

function AideTokens() {
  return (
    <FormSection title="Tokens disponibles" storageKey="numerotation:aide">
      <div className="space-y-2 text-sm">
        <ul className="grid gap-1 sm:grid-cols-2">
          {TOKENS_AIDE.map((t) => (
            <li key={t.token} className="flex items-baseline gap-2">
              <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs">
                {t.token}
              </code>
              <span className="text-muted-foreground">
                {t.description} — ex. <span className="font-mono">{t.exemple}</span>
              </span>
            </li>
          ))}
        </ul>
        <p className="text-xs text-muted-foreground">
          La cadence de reset du compteur se choisit explicitement par document.
          Elle doit rester cohérente avec les tokens du template : un reset
          quotidien exige <code className="font-mono">[@Day]</code>, un reset
          mensuel exige <code className="font-mono">[@Month]</code> ou{' '}
          <code className="font-mono">[@Day]</code>, etc. Sans token date, seul
          le compteur global continu est possible.
        </p>
      </div>
    </FormSection>
  );
}

function LigneModele({
  modele,
  onEnregistrer,
  onReinitialiser,
}: {
  modele: ModeleAvecDefaut;
  onEnregistrer: Props['onEnregistrer'];
  onReinitialiser: Props['onReinitialiser'];
}) {
  const [template, setTemplate] = useState(modele.template);
  const [cadence, setCadence] = useState<CadenceReset>(modele.cadenceReset);
  const [erreur, setErreur] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const parsed = parseTemplate(template);
  const autorisees = parsed.ok ? cadencesAutorisees(template) : [];
  const cadenceErreur = parsed.ok ? validerCadence(template, cadence) : { ok: true as const };
  const apercu = parsed.ok && cadenceErreur.ok ? formatNumero(template, 1) : '—';
  const dirty =
    template.trim() !== modele.template.trim() || cadence !== modele.cadenceReset;
  const peutEnregistrer = dirty && parsed.ok && cadenceErreur.ok && !isPending;

  // Si le template change et rend la cadence courante invalide, on bascule
  // automatiquement vers la cadence la plus fine encore autorisée — évite
  // de bloquer l'utilisateur sur une combinaison incohérente.
  useEffect(() => {
    if (!parsed.ok) return;
    const maxAutorisee = cadenceMaxAutoriseePourTemplate(template);
    const ordre: Record<CadenceReset, number> = {
      jour: 0,
      mois: 1,
      annee: 2,
      jamais: 3,
    };
    if (ordre[cadence] < ordre[maxAutorisee]) {
      setCadence(maxAutorisee);
    }
    // dépend uniquement du template — la cadence est resynchronisée si besoin.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [template]);

  function reinit() {
    const tpl = TEMPLATES_PAR_DEFAUT[modele.typeDoc];
    setTemplate(tpl);
    setCadence(cadenceMaxAutoriseePourTemplate(tpl));
    setErreur(null);
  }

  function enregistrer() {
    setErreur(null);
    const validation = parseTemplate(template);
    if (!validation.ok) {
      setErreur(validation.error);
      return;
    }
    const check = validerCadence(template, cadence);
    if (!check.ok) {
      setErreur(check.error);
      return;
    }
    startTransition(async () => {
      const result = await onEnregistrer({
        typeDoc: modele.typeDoc,
        template,
        cadenceReset: cadence,
      });
      if (!result.ok) {
        setErreur(result.error ?? 'Enregistrement impossible.');
        return;
      }
      toast.success(`Modèle ${LIBELLES_TYPE_NUMERO[modele.typeDoc]} enregistré`);
    });
  }

  function reinitialiserBd() {
    if (!modele.personnalise) {
      reinit();
      return;
    }
    if (
      !window.confirm(
        `Réinitialiser le modèle "${LIBELLES_TYPE_NUMERO[modele.typeDoc]}" au format par défaut ?`,
      )
    ) {
      return;
    }
    startTransition(async () => {
      const result = await onReinitialiser(modele.typeDoc);
      if (!result.ok) {
        setErreur(result.error ?? 'Réinitialisation impossible.');
        return;
      }
      const tpl = TEMPLATES_PAR_DEFAUT[modele.typeDoc];
      setTemplate(tpl);
      setCadence(cadenceMaxAutoriseePourTemplate(tpl));
      toast.success(`Modèle ${LIBELLES_TYPE_NUMERO[modele.typeDoc]} réinitialisé`);
    });
  }

  return (
    <FormSection
      title={LIBELLES_TYPE_NUMERO[modele.typeDoc]}
      storageKey={`numerotation:${modele.typeDoc}`}
      rightSlot={
        !modele.personnalise ? (
          <span className="rounded border px-1.5 py-0.5 text-[10px] uppercase text-muted-foreground">
            défaut
          </span>
        ) : null
      }
      bodyClassName="space-y-3"
    >
      <div className="space-y-1">
        <Label htmlFor={`tpl-${modele.typeDoc}`}>Template</Label>
        <Input
          id={`tpl-${modele.typeDoc}`}
          value={template}
          onChange={(e) => setTemplate(e.target.value)}
          maxLength={120}
          className="font-mono"
          placeholder={TEMPLATES_PAR_DEFAUT[modele.typeDoc]}
          spellCheck={false}
        />
      </div>

      <div className="space-y-1">
        <Label htmlFor={`cadence-${modele.typeDoc}`}>Cadence de reset</Label>
        <Select
          value={cadence}
          onValueChange={(v) => setCadence(v as CadenceReset)}
        >
          <SelectTrigger
            id={`cadence-${modele.typeDoc}`}
            data-testid={`cadence-${modele.typeDoc}`}
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {CADENCES_RESET.map((c) => {
              const autorise = autorisees.includes(c);
              return (
                <SelectItem key={c} value={c} disabled={!autorise && c !== cadence}>
                  {LIBELLES_CADENCE_COURT[c]}
                  {!autorise && c !== cadence ? ' (incompatible)' : ''}
                </SelectItem>
              );
            })}
          </SelectContent>
        </Select>
        <p className="text-xs text-muted-foreground">
          {parsed.ok && cadenceErreur.ok
            ? LIBELLES_CADENCE[cadence]
            : cadenceErreur.ok
              ? ' '
              : cadenceErreur.error}
        </p>
      </div>

      <div className="grid gap-1 text-sm">
        <div className="flex items-baseline justify-between gap-2">
          <span className="text-muted-foreground">Prochain numéro (aperçu)</span>
          <code
            data-testid={`apercu-${modele.typeDoc}`}
            className="font-mono text-sm font-semibold"
          >
            {apercu}
          </code>
        </div>
      </div>

      {erreur && (
        <Alert variant="destructive">
          <AlertDescription>{erreur}</AlertDescription>
        </Alert>
      )}

      <div className="flex flex-wrap items-center justify-end gap-2 pt-1">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={reinitialiserBd}
          disabled={isPending}
        >
          {modele.personnalise ? 'Restaurer le défaut' : 'Réinitialiser le champ'}
        </Button>
        <Button type="button" size="sm" onClick={enregistrer} disabled={!peutEnregistrer}>
          {isPending ? 'Enregistrement…' : 'Enregistrer'}
        </Button>
      </div>
    </FormSection>
  );
}
