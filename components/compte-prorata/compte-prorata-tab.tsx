'use client';

import {
  CalculatorIcon,
  LockIcon,
  PencilIcon,
  PlusIcon,
  Trash2Icon,
  UnlockIcon,
} from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useMemo, useState, useTransition } from 'react';
import { toast } from 'sonner';

import { DepenseForm } from '@/components/compte-prorata/depense-form';
import { ParticipantForm } from '@/components/compte-prorata/participant-form';
import { Badge, type BadgeTone } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { DataTable, type DataTableColumn } from '@/components/ui/data-table';
import { Input } from '@/components/ui/input';
import { SegmentedControl } from '@/components/ui/segmented-control';
import { StatCard, StatGrid } from '@/components/ui/stat-card';
import { cn } from '@/lib/utils';
import type { BilanCompteProrata } from '@/lib/chantiers/compte-prorata';
import type {
  CompteProrataDepenseInput,
  CompteProrataParticipantInput,
} from '@/lib/validation/compte-prorata';

export type ParticipantView = {
  id: string;
  libelle: string;
  sousTraitantId: string | null;
  sousTraitantNom: string | null;
  montantMarcheHt: string;
  quotePartPctManuel: string | null;
  estGestionnaire: boolean;
  notes: string | null;
};

export type DepenseView = {
  id: string;
  dateDepense: string;
  libelle: string;
  categorie: string | null;
  montantHt: string;
  avanceParParticipantId: string;
  avanceParLibelle: string;
  notes: string | null;
};

type ServerActionResult = {
  ok: boolean;
  error?: string;
  fieldErrors?: Record<string, string[]>;
  data?: unknown;
};

type Statut = 'ouvert' | 'cloture' | 'arrete';

type Props = {
  compteId: string;
  statut: Statut;
  fraisGestionPct: string | null;
  participants: ParticipantView[];
  depenses: DepenseView[];
  bilan: BilanCompteProrata;
  sousTraitants: { id: string; code: string; nom: string }[];
  today: string;
  peutEcrire: boolean;
  peutArreter: boolean;
  actions: {
    enregistrerParticipant: (input: CompteProrataParticipantInput) => Promise<ServerActionResult>;
    supprimerParticipant: (id: string) => Promise<ServerActionResult>;
    enregistrerDepense: (input: CompteProrataDepenseInput) => Promise<ServerActionResult>;
    supprimerDepense: (id: string) => Promise<ServerActionResult>;
    arreter: (dateArrete: string) => Promise<ServerActionResult>;
    rouvrir: () => Promise<ServerActionResult>;
  };
};

const STATUT_LABEL: Record<Statut, string> = {
  ouvert: 'Ouvert',
  cloture: 'Clôturé',
  arrete: 'Arrêté',
};
const STATUT_TONE: Record<Statut, BadgeTone> = {
  ouvert: 'amber',
  cloture: 'neutral',
  arrete: 'emerald',
};

function fmtEur(s: string): string {
  const n = Number(s);
  if (!Number.isFinite(n)) return s;
  return `${n.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`;
}

type Section = 'participants' | 'depenses' | 'bilan' | 'arrete';

export function CompteProrataTab({
  compteId,
  statut,
  fraisGestionPct,
  participants,
  depenses,
  bilan,
  sousTraitants,
  today,
  peutEcrire,
  peutArreter,
  actions,
}: Props) {
  const router = useRouter();
  const [section, setSection] = useState<Section>('participants');
  const [isPending, startTransition] = useTransition();
  // null = aucun formulaire ; 'new' = création ; sinon id de la ligne éditée.
  const [participantForm, setParticipantForm] = useState<string | null>(null);
  const [depenseForm, setDepenseForm] = useState<string | null>(null);

  const ouvert = statut === 'ouvert';
  const peutModifier = peutEcrire && ouvert;

  const refresh = () => router.refresh();

  const pourcentParId = useMemo(
    () => new Map(bilan.quoteParts.map((q) => [q.participantId, q])),
    [bilan.quoteParts],
  );
  const participantOptions = useMemo(
    () => participants.map((p) => ({ id: p.id, libelle: p.libelle })),
    [participants],
  );

  function handleSupprimerParticipant(id: string, libelle: string) {
    if (!window.confirm(`Retirer le participant « ${libelle} » ?`)) return;
    startTransition(async () => {
      const r = await actions.supprimerParticipant(id);
      if (r.ok) {
        toast.success('Participant retiré');
        refresh();
      } else {
        toast.error(r.error ?? 'Erreur');
      }
    });
  }

  function handleSupprimerDepense(id: string, libelle: string) {
    if (!window.confirm(`Supprimer la dépense « ${libelle} » ?`)) return;
    startTransition(async () => {
      const r = await actions.supprimerDepense(id);
      if (r.ok) {
        toast.success('Dépense supprimée');
        refresh();
      } else {
        toast.error(r.error ?? 'Erreur');
      }
    });
  }

  function handleArreter() {
    if (
      !window.confirm(
        'Arrêter le compte prorata ? Le bilan sera figé (snapshot) et le compte passera en lecture seule.',
      )
    )
      return;
    startTransition(async () => {
      const r = await actions.arreter(today);
      if (r.ok) {
        toast.success('Compte arrêté');
        refresh();
      } else {
        toast.error(r.error ?? 'Erreur');
      }
    });
  }

  function handleRouvrir() {
    startTransition(async () => {
      const r = await actions.rouvrir();
      if (r.ok) {
        toast.success('Compte réouvert');
        refresh();
      } else {
        toast.error(r.error ?? 'Erreur');
      }
    });
  }

  // ── Colonnes participants ──────────────────────────────────
  const colParticipants: DataTableColumn<ParticipantView>[] = [
    {
      id: 'libelle',
      header: 'Intervenant / lot',
      searchAccessor: (p) => `${p.libelle} ${p.sousTraitantNom ?? ''}`,
      cell: (p) => (
        <div className="flex flex-col">
          <span className="font-medium">{p.libelle}</span>
          {p.sousTraitantNom && (
            <span className="text-xs text-muted-foreground">{p.sousTraitantNom}</span>
          )}
          {p.estGestionnaire && (
            <Badge tone="sky" className="mt-0.5 w-fit">
              Gestionnaire
            </Badge>
          )}
        </div>
      ),
    },
    {
      id: 'montant',
      header: 'Montant de marché',
      align: 'right',
      sortAccessor: (p) => Number(p.montantMarcheHt),
      cell: (p) => <span className="tabular-nums">{fmtEur(p.montantMarcheHt)}</span>,
    },
    {
      id: 'quotepart',
      header: 'Quote-part',
      align: 'right',
      sortAccessor: (p) => Number(pourcentParId.get(p.id)?.pourcent ?? 0),
      cell: (p) => {
        const q = pourcentParId.get(p.id);
        return (
          <span className={cn('tabular-nums', q?.manuel && 'font-medium text-amber-700')}>
            {q ? `${q.pourcent} %` : '—'}
            {q?.manuel && <span className="ml-1 text-xs">(manuel)</span>}
          </span>
        );
      },
    },
  ];
  if (peutModifier) {
    colParticipants.push({
      id: 'actions',
      header: '',
      align: 'right',
      cell: (p) => (
        <div className="flex justify-end gap-1">
          <Button
            size="sm"
            variant="ghost"
            disabled={isPending}
            onClick={() => setParticipantForm(p.id)}
            title="Modifier"
          >
            <PencilIcon className="size-3.5" />
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="text-destructive hover:text-destructive"
            disabled={isPending}
            onClick={() => handleSupprimerParticipant(p.id, p.libelle)}
            title="Retirer"
          >
            <Trash2Icon className="size-3.5" />
          </Button>
        </div>
      ),
    });
  }

  // ── Colonnes dépenses ──────────────────────────────────────
  const colDepenses: DataTableColumn<DepenseView>[] = [
    {
      id: 'date',
      header: 'Date',
      sortAccessor: (d) => d.dateDepense,
      cell: (d) => <span className="tabular-nums">{d.dateDepense}</span>,
    },
    {
      id: 'libelle',
      header: 'Libellé',
      searchAccessor: (d) => d.libelle,
      cell: (d) => <span className="font-medium">{d.libelle}</span>,
    },
    {
      id: 'categorie',
      header: 'Catégorie',
      searchAccessor: (d) => d.categorie ?? '',
      cell: (d) =>
        d.categorie ? (
          <Badge tone="neutral">{d.categorie}</Badge>
        ) : (
          <span className="text-muted-foreground">—</span>
        ),
    },
    {
      id: 'avancePar',
      header: 'Avancée par',
      searchAccessor: (d) => d.avanceParLibelle,
      cell: (d) => <span>{d.avanceParLibelle}</span>,
    },
    {
      id: 'montant',
      header: 'Montant HT',
      align: 'right',
      sortAccessor: (d) => Number(d.montantHt),
      cell: (d) => <span className="tabular-nums">{fmtEur(d.montantHt)}</span>,
    },
  ];
  if (peutModifier) {
    colDepenses.push({
      id: 'actions',
      header: '',
      align: 'right',
      cell: (d) => (
        <div className="flex justify-end gap-1">
          <Button
            size="sm"
            variant="ghost"
            disabled={isPending}
            onClick={() => setDepenseForm(d.id)}
            title="Modifier"
          >
            <PencilIcon className="size-3.5" />
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="text-destructive hover:text-destructive"
            disabled={isPending}
            onClick={() => handleSupprimerDepense(d.id, d.libelle)}
            title="Supprimer"
          >
            <Trash2Icon className="size-3.5" />
          </Button>
        </div>
      ),
    });
  }

  // ── Colonnes bilan / soldes ────────────────────────────────
  const aFrais = Number(bilan.fraisGestionMontant) > 0;
  const colBilan: DataTableColumn<BilanCompteProrata['soldes'][number]>[] = [
    {
      id: 'libelle',
      header: 'Participant',
      cell: (s) => (
        <div className="flex items-center gap-2">
          <span className="font-medium">{s.libelle}</span>
          {s.estGestionnaire && <Badge tone="sky">Gestionnaire</Badge>}
        </div>
      ),
    },
    {
      id: 'pct',
      header: 'Quote-part',
      align: 'right',
      cell: (s) => <span className="tabular-nums">{s.pourcent} %</span>,
    },
    {
      id: 'du',
      header: 'Quote-part due',
      align: 'right',
      cell: (s) => <span className="tabular-nums">{fmtEur(s.montantDu)}</span>,
    },
    {
      id: 'avance',
      header: 'Avancé',
      align: 'right',
      cell: (s) => <span className="tabular-nums">{fmtEur(s.totalAvance)}</span>,
    },
    {
      id: 'solde',
      header: 'Solde',
      align: 'right',
      cell: (s) => (
        <span
          className={cn(
            'font-medium tabular-nums',
            s.sens === 'crediteur' && 'text-emerald-700',
            s.sens === 'debiteur' && 'text-rose-700',
          )}
        >
          {fmtEur(s.solde)}
          <span className="ml-1 text-xs font-normal text-muted-foreground">
            {s.sens === 'crediteur' ? 'créditeur' : s.sens === 'debiteur' ? 'débiteur' : ''}
          </span>
        </span>
      ),
    },
  ];
  if (aFrais) {
    colBilan.splice(4, 0, {
      id: 'frais',
      header: 'Crédit frais',
      align: 'right',
      cell: (s) => <span className="tabular-nums">{fmtEur(s.creditFraisGestion)}</span>,
    });
  }

  return (
    <div className="space-y-4">
      {/* Bandeau d'actions figé */}
      <div className="sticky top-14 z-10 -mx-4 border-b bg-card px-4 py-3 lg:-mx-8 lg:px-8">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex min-w-0 items-center gap-2">
            <CalculatorIcon className="size-5 text-amber-600" />
            <span className="text-lg font-semibold tracking-tight">Compte prorata</span>
            <Badge tone={STATUT_TONE[statut]}>{STATUT_LABEL[statut]}</Badge>
            {fraisGestionPct && (
              <span className="text-xs text-muted-foreground">
                Frais de gestion {Number(fraisGestionPct).toFixed(2)} %
              </span>
            )}
          </div>
          <div className="flex flex-1 flex-wrap items-center justify-end gap-2">
            {peutModifier && (
              <>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    setSection('depenses');
                    setDepenseForm('new');
                  }}
                >
                  <PlusIcon className="mr-1 size-4" /> Ajouter une dépense
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    setSection('participants');
                    setParticipantForm('new');
                  }}
                >
                  <PlusIcon className="mr-1 size-4" /> Ajouter un participant
                </Button>
              </>
            )}
            {peutArreter && ouvert && (
              <Button size="sm" variant="default" disabled={isPending} onClick={handleArreter}>
                <LockIcon className="mr-1 size-4" /> Arrêter le compte
              </Button>
            )}
            {peutArreter && statut === 'arrete' && (
              <Button size="sm" variant="outline" disabled={isPending} onClick={handleRouvrir}>
                <UnlockIcon className="mr-1 size-4" /> Réouvrir
              </Button>
            )}
          </div>
        </div>
      </div>

      <SegmentedControl
        aria-label="Sections du compte prorata"
        value={section}
        onChange={setSection}
        options={[
          { value: 'participants', label: `Participants (${participants.length})` },
          { value: 'depenses', label: `Dépenses (${depenses.length})` },
          { value: 'bilan', label: 'Bilan & soldes' },
          { value: 'arrete', label: 'Arrêté' },
        ]}
      />

      {/* ── Participants ── */}
      {section === 'participants' && (
        <div className="space-y-3">
          {participantForm && (
            <div className="rounded-md border p-3">
              <ParticipantForm
                key={participantForm}
                compteProrataId={compteId}
                sousTraitants={sousTraitants}
                defaultValues={
                  participantForm === 'new'
                    ? undefined
                    : participantToDefaults(participants.find((p) => p.id === participantForm))
                }
                submitLabel={participantForm === 'new' ? 'Ajouter le participant' : 'Enregistrer'}
                onCancel={() => setParticipantForm(null)}
                onSubmit={async (values) => {
                  const r = await actions.enregistrerParticipant(values);
                  if (r.ok) {
                    toast.success(
                      participantForm === 'new' ? 'Participant ajouté' : 'Participant modifié',
                    );
                    setParticipantForm(null);
                    refresh();
                  }
                  return r;
                }}
              />
            </div>
          )}
          <DataTable
            columns={colParticipants}
            rows={participants}
            rowKey={(p) => p.id}
            searchPlaceholder="Rechercher un participant…"
            emptyMessage="Aucun participant. Ajoutez les intervenants du chantier (lots)."
            defaultSort={{ id: 'montant', dir: 'desc' }}
          />
        </div>
      )}

      {/* ── Dépenses ── */}
      {section === 'depenses' && (
        <div className="space-y-3">
          {depenseForm && participants.length > 0 && (
            <div className="rounded-md border p-3">
              <DepenseForm
                key={depenseForm}
                compteProrataId={compteId}
                participants={participantOptions}
                today={today}
                defaultValues={
                  depenseForm === 'new'
                    ? undefined
                    : depenseToDefaults(depenses.find((d) => d.id === depenseForm))
                }
                submitLabel={depenseForm === 'new' ? 'Ajouter la dépense' : 'Enregistrer'}
                onCancel={() => setDepenseForm(null)}
                onSubmit={async (values) => {
                  const r = await actions.enregistrerDepense(values);
                  if (r.ok) {
                    toast.success(depenseForm === 'new' ? 'Dépense ajoutée' : 'Dépense modifiée');
                    setDepenseForm(null);
                    refresh();
                  }
                  return r;
                }}
              />
            </div>
          )}
          {participants.length === 0 ? (
            <p className="rounded border border-dashed p-6 text-center text-sm text-muted-foreground">
              Ajoutez d&apos;abord au moins un participant avant de saisir des dépenses communes.
            </p>
          ) : (
            <DataTable
              columns={colDepenses}
              rows={depenses}
              rowKey={(d) => d.id}
              searchPlaceholder="Rechercher une dépense…"
              emptyMessage="Aucune dépense commune saisie."
              defaultSort={{ id: 'date', dir: 'desc' }}
            />
          )}
        </div>
      )}

      {/* ── Bilan & soldes ── */}
      {section === 'bilan' && (
        <div className="space-y-4">
          <StatGrid>
            <StatCard label="Dépenses communes" value={fmtEur(bilan.totalDepensesHt)} />
            <StatCard
              label="Base répartie"
              value={fmtEur(bilan.baseRepartie)}
              hint={aFrais ? `dont frais ${fmtEur(bilan.fraisGestionMontant)}` : undefined}
            />
            <StatCard label="Total marchés" value={fmtEur(bilan.totalMarcheHt)} />
            <StatCard
              label="Équilibre"
              value={bilan.coherence.equilibre ? '✓' : fmtEur(bilan.coherence.sommeSolde)}
              tone={bilan.coherence.equilibre ? 'emerald' : 'rose'}
              hint={`Σ quote-parts ${bilan.coherence.sommePourcent} %`}
            />
          </StatGrid>
          <DataTable
            columns={colBilan}
            rows={bilan.soldes}
            rowKey={(s) => s.participantId}
            searchPlaceholder="Rechercher…"
            emptyMessage="Aucun participant : le bilan est vide."
            rowClassName={(s) =>
              s.sens === 'debiteur'
                ? 'bg-rose-50/40'
                : s.sens === 'crediteur'
                  ? 'bg-emerald-50/40'
                  : undefined
            }
          />
        </div>
      )}

      {/* ── Arrêté ── */}
      {section === 'arrete' && (
        <div className="space-y-4">
          {statut === 'arrete' ? (
            <div className="rounded-md border border-emerald-200 bg-emerald-50/40 p-4 text-sm">
              <p className="font-medium text-emerald-800">Compte arrêté</p>
              <p className="mt-1 text-emerald-700">
                Le bilan est figé. Pour le modifier à nouveau, réouvrez le compte (droit
                d&apos;arrêté requis).
              </p>
            </div>
          ) : (
            <div className="rounded-md border p-4 text-sm">
              <p>
                Arrêter le compte fige le bilan ci-dessous dans un snapshot horodaté et passe le
                compte en lecture seule. Vérifiez les participants, les marchés et les dépenses
                avant de confirmer.
              </p>
              {peutArreter ? (
                <div className="mt-3 flex flex-wrap items-end gap-2">
                  <Input
                    type="date"
                    value={today}
                    readOnly
                    className="w-40"
                    aria-label="Date d'arrêté"
                  />
                  <Button
                    size="sm"
                    disabled={isPending || participants.length === 0}
                    onClick={handleArreter}
                  >
                    <LockIcon className="mr-1 size-4" /> Arrêter le compte au {today}
                  </Button>
                </div>
              ) : (
                <p className="mt-2 text-xs text-muted-foreground">
                  Vous n&apos;avez pas le droit d&apos;arrêter le compte.
                </p>
              )}
            </div>
          )}

          {/* Récapitulatif des soldes (prévisualisation ou arrêté). */}
          <DataTable
            columns={colBilan}
            rows={bilan.soldes}
            rowKey={(s) => s.participantId}
            emptyMessage="Aucun participant."
            rowClassName={(s) =>
              s.sens === 'debiteur'
                ? 'bg-rose-50/40'
                : s.sens === 'crediteur'
                  ? 'bg-emerald-50/40'
                  : undefined
            }
          />
        </div>
      )}
    </div>
  );
}

function participantToDefaults(
  p: ParticipantView | undefined,
): Partial<CompteProrataParticipantInput> | undefined {
  if (!p) return undefined;
  return {
    id: p.id,
    sousTraitantId: p.sousTraitantId,
    libelle: p.libelle,
    montantMarcheHt: Number(p.montantMarcheHt),
    quotePartPctManuel: p.quotePartPctManuel == null ? null : Number(p.quotePartPctManuel),
    estGestionnaire: p.estGestionnaire,
    notes: p.notes,
  };
}

function depenseToDefaults(
  d: DepenseView | undefined,
): Partial<CompteProrataDepenseInput> | undefined {
  if (!d) return undefined;
  return {
    id: d.id,
    avanceParParticipantId: d.avanceParParticipantId,
    dateDepense: d.dateDepense,
    libelle: d.libelle,
    categorie: d.categorie,
    montantHt: Number(d.montantHt),
    notes: d.notes,
  };
}
