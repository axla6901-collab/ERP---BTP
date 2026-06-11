'use client';

import {
  CheckCircle2Icon,
  CloudIcon,
  CloudOffIcon,
  Loader2Icon,
  RefreshCwIcon,
  Trash2Icon,
  TriangleAlertIcon,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { v7 as uuidv7 } from 'uuid';

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { buildOutboxEntry, type TerrainFormState, type TerrainType } from '@/lib/pwa/build-payload';
import {
  compterOutbox,
  enqueuePointage,
  flushOutbox,
  listOutbox,
  purgerOutbox,
  sauvegarderRefs,
  supprimerEntree,
} from '@/lib/pwa/outbox';
import type { OutboxEntry, PointageRefs } from '@/lib/pwa/types';
import { useOnline } from '@/lib/pwa/use-online';
import {
  LIBELLES_ZONE,
  LIBELLES_MOTIF_ABSENCE,
  MOTIFS_ABSENCE_MATRICE,
  ZONES_DEPLACEMENT,
  type MotifAbsence,
  type ZoneDeplacement,
} from '@/lib/validation/rh';

type Props = { initialRefs: PointageRefs };

const REFS_KEY = 'refs';
const SELECT_CLS =
  'h-12 w-full rounded-lg border border-input bg-background px-3 text-base outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/40';

function todayLocal(): string {
  const d = new Date();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
}

export function PointageTerrain({ initialRefs }: Props) {
  const online = useOnline();
  const [refs, setRefs] = useState<PointageRefs>(initialRefs);
  const [entries, setEntries] = useState<OutboxEntry[]>([]);
  const [syncing, setSyncing] = useState(false);

  // ── État du formulaire ──
  const [employeId, setEmployeId] = useState('');
  const [type, setType] = useState<TerrainType>('heures');
  const [chantierId, setChantierId] = useState<string | null>(null);
  const [chantierTacheId, setChantierTacheId] = useState<string | null>(null);
  const [motifAbsence, setMotifAbsence] = useState<MotifAbsence | null>(null);
  const [zone, setZone] = useState<ZoneDeplacement | null>(null);
  const [quantite, setQuantite] = useState('');
  const [datePointage, setDatePointage] = useState<string>(todayLocal);
  const [panier, setPanier] = useState(false);
  const [grandPanier, setGrandPanier] = useState(false);
  const [nuit, setNuit] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);

  const rafraichirOutbox = useCallback(async () => {
    try {
      setEntries(await listOutbox());
    } catch {
      /* IndexedDB indisponible */
    }
  }, []);

  // Montage : cache des refs (offline), purge, refresh réseau, écoute SW.
  useEffect(() => {
    void sauvegarderRefs(REFS_KEY, initialRefs).catch(() => {});
    void rafraichirOutbox();
    void purgerOutbox(30).catch(() => {});

    fetch('/api/v1/pointage-refs', { credentials: 'include' })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (d && Array.isArray(d.employes)) {
          const fresh: PointageRefs = {
            employes: d.employes,
            chantiers: d.chantiers,
            taches: d.taches,
          };
          setRefs(fresh);
          void sauvegarderRefs(REFS_KEY, fresh).catch(() => {});
        }
      })
      .catch(() => {});

    if ('serviceWorker' in navigator) {
      const onMessage = (e: MessageEvent) => {
        if (e.data && e.data.type === 'OUTBOX_SYNCED') void rafraichirOutbox();
      };
      navigator.serviceWorker.addEventListener('message', onMessage);
      return () => navigator.serviceWorker.removeEventListener('message', onMessage);
    }
  }, [initialRefs, rafraichirOutbox]);

  // Pré-remplit la zone de déplacement par défaut de l'employé sélectionné.
  useEffect(() => {
    const emp = refs.employes.find((e) => e.id === employeId);
    if (emp) setZone(emp.zoneDeplacementDefaut ?? null);
  }, [employeId, refs.employes]);

  const tachesChantier = useMemo(
    () => (chantierId ? refs.taches.filter((t) => t.chantierId === chantierId) : []),
    [chantierId, refs.taches],
  );

  const counts = useMemo(
    () => ({
      pending: entries.filter((e) => e.status === 'pending').length,
      rejected: entries.filter((e) => e.status === 'rejected').length,
    }),
    [entries],
  );

  const synchroniser = useCallback(
    async (manuel: boolean) => {
      if (!online) {
        if (manuel) toast('Hors-ligne — synchronisation au retour du réseau.');
        return;
      }
      setSyncing(true);
      try {
        const results = await flushOutbox();
        await rafraichirOutbox();
        if (manuel) {
          const ok = results.filter(
            (r) => r.status === 'synced' || r.status === 'duplicate',
          ).length;
          const ko = results.filter((r) => r.status === 'rejected').length;
          toast.success(`${ok} pointage(s) synchronisé(s)${ko > 0 ? `, ${ko} refusé(s)` : ''}.`);
        } else {
          const { rejected } = await compterOutbox();
          if (rejected > 0) toast.error(`${rejected} pointage(s) refusé(s) — voir la liste.`);
        }
      } catch {
        if (manuel) toast.error('Synchronisation impossible pour le moment.');
      } finally {
        setSyncing(false);
      }
    },
    [online, rafraichirOutbox],
  );

  async function enregistrer() {
    setErreur(null);
    const emp = refs.employes.find((e) => e.id === employeId);
    const ch = chantierId ? refs.chantiers.find((c) => c.id === chantierId) : null;

    const form: TerrainFormState = {
      employeId,
      employeNom: emp ? `${emp.nom} ${emp.prenom}` : '',
      type,
      chantierId,
      chantierLibelle: ch ? `${ch.numero} · ${ch.libelle}` : null,
      chantierTacheId,
      motifAbsence,
      zoneDeplacement: zone,
      quantite,
      datePointage,
      panier,
      grandPanier,
      nuitPanierSoir: nuit,
      notes: null,
    };

    const built = buildOutboxEntry(form, uuidv7(), new Date().toISOString());
    if (!built.ok) {
      setErreur(built.error);
      return;
    }

    try {
      await enqueuePointage(built.entry);
    } catch {
      setErreur("Stockage local indisponible — impossible d'enregistrer hors-ligne.");
      return;
    }
    await rafraichirOutbox();
    toast.success(online ? 'Pointage enregistré.' : 'Pointage enregistré (hors-ligne).');

    // Reset rapide pour enchaîner : on garde chantier/date/type, on réinitialise
    // l'employé et la quantité (saisie d'équipe).
    setEmployeId('');
    setQuantite('');
    setErreur(null);

    void synchroniser(false);
  }

  async function retirer(clientUuid: string) {
    await supprimerEntree(clientUuid);
    await rafraichirOutbox();
  }

  const estAbsence = type === 'absence';

  return (
    <div className="mx-auto max-w-xl space-y-4">
      {/* Bandeau de connectivité / file d'attente */}
      <div
        className={`flex items-center justify-between gap-3 rounded-xl border px-4 py-3 text-sm ${
          online
            ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
            : 'border-amber-300 bg-amber-50 text-amber-900'
        }`}
      >
        <span className="flex items-center gap-2 font-medium">
          {online ? <CloudIcon className="size-4" /> : <CloudOffIcon className="size-4" />}
          {online ? 'En ligne' : 'Mode hors-ligne'}
        </span>
        <span className="flex items-center gap-2">
          {counts.pending > 0 && (
            <Badge tone="amber" shape="pill">
              {counts.pending} en attente
            </Badge>
          )}
          {counts.rejected > 0 && (
            <Badge tone="rose" shape="pill">
              {counts.rejected} refusé{counts.rejected > 1 ? 's' : ''}
            </Badge>
          )}
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => void synchroniser(true)}
            disabled={syncing || counts.pending === 0}
          >
            {syncing ? (
              <Loader2Icon className="size-4 animate-spin" />
            ) : (
              <RefreshCwIcon className="size-4" />
            )}
            <span className="ml-1">Synchroniser</span>
          </Button>
        </span>
      </div>

      {/* Formulaire de saisie */}
      <div className="space-y-4 rounded-xl border bg-card p-4 shadow-sm">
        <label className="block space-y-1">
          <span className="text-sm font-medium">Employé</span>
          <select
            className={SELECT_CLS}
            value={employeId}
            onChange={(e) => setEmployeId(e.target.value)}
          >
            <option value="">Sélectionner…</option>
            {refs.employes.map((emp) => (
              <option key={emp.id} value={emp.id}>
                {emp.nom} {emp.prenom}
              </option>
            ))}
          </select>
        </label>

        {/* Type : Heures / Absence */}
        <div className="grid grid-cols-2 gap-2">
          {(['heures', 'absence'] as const).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setType(t)}
              aria-pressed={type === t}
              className={`h-11 rounded-lg border text-sm font-medium transition-colors ${
                type === t
                  ? 'border-amber-500 bg-amber-500 text-white'
                  : 'border-input bg-background hover:bg-muted'
              }`}
            >
              {t === 'heures' ? 'Heures' : 'Absence'}
            </button>
          ))}
        </div>

        {estAbsence ? (
          <label className="block space-y-1">
            <span className="text-sm font-medium">Motif d&apos;absence</span>
            <select
              className={SELECT_CLS}
              value={motifAbsence ?? ''}
              onChange={(e) => setMotifAbsence((e.target.value || null) as MotifAbsence | null)}
            >
              <option value="">Sélectionner…</option>
              {MOTIFS_ABSENCE_MATRICE.map((m) => (
                <option key={m} value={m}>
                  {LIBELLES_MOTIF_ABSENCE[m]}
                </option>
              ))}
            </select>
          </label>
        ) : (
          <>
            <label className="block space-y-1">
              <span className="text-sm font-medium">Chantier</span>
              <select
                className={SELECT_CLS}
                value={chantierId ?? ''}
                onChange={(e) => {
                  setChantierId(e.target.value || null);
                  setChantierTacheId(null);
                }}
              >
                <option value="">Sélectionner…</option>
                {refs.chantiers.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.numero} · {c.libelle}
                  </option>
                ))}
              </select>
            </label>

            {tachesChantier.length > 0 && (
              <label className="block space-y-1">
                <span className="text-sm font-medium">
                  Tâche <span className="text-muted-foreground">(optionnel)</span>
                </span>
                <select
                  className={SELECT_CLS}
                  value={chantierTacheId ?? ''}
                  onChange={(e) => setChantierTacheId(e.target.value || null)}
                >
                  <option value="">— Aucune —</option>
                  {tachesChantier.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.libelle}
                    </option>
                  ))}
                </select>
              </label>
            )}
          </>
        )}

        {/* Quantité (heures) + raccourcis */}
        <div className="space-y-1">
          <span className="text-sm font-medium">Heures</span>
          <div className="flex items-center gap-2">
            <input
              type="text"
              inputMode="decimal"
              placeholder="0"
              value={quantite}
              onChange={(e) => setQuantite(e.target.value)}
              className="focus-visible:ring-3 h-12 w-24 rounded-lg border border-input bg-background px-3 text-center text-lg tabular-nums outline-none focus-visible:border-ring focus-visible:ring-ring/40"
            />
            <div className="flex gap-2">
              {['4', '7', '7.5', '8'].map((h) => (
                <button
                  key={h}
                  type="button"
                  onClick={() => setQuantite(h)}
                  className="h-12 min-w-12 rounded-lg border border-input bg-background px-3 text-sm font-medium hover:bg-muted"
                >
                  {h}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Date */}
        <label className="block space-y-1">
          <span className="text-sm font-medium">Date</span>
          <input
            type="date"
            value={datePointage}
            max={todayLocal()}
            onChange={(e) => setDatePointage(e.target.value)}
            className={SELECT_CLS}
          />
        </label>

        {/* Zone + indemnités (heures uniquement) */}
        {!estAbsence && (
          <>
            <label className="block space-y-1">
              <span className="text-sm font-medium">
                Zone de déplacement <span className="text-muted-foreground">(optionnel)</span>
              </span>
              <select
                className={SELECT_CLS}
                value={zone ?? ''}
                onChange={(e) => setZone((e.target.value || null) as ZoneDeplacement | null)}
              >
                <option value="">— Aucune —</option>
                {ZONES_DEPLACEMENT.map((z) => (
                  <option key={z} value={z}>
                    {LIBELLES_ZONE[z]}
                  </option>
                ))}
              </select>
            </label>

            <div className="flex flex-wrap gap-2">
              {(
                [
                  ['Panier', panier, setPanier],
                  ['Grand panier', grandPanier, setGrandPanier],
                  ['Nuit', nuit, setNuit],
                ] as const
              ).map(([label, value, setter]) => (
                <button
                  key={label}
                  type="button"
                  aria-pressed={value}
                  onClick={() => setter(!value)}
                  className={`h-10 rounded-full border px-4 text-sm font-medium transition-colors ${
                    value
                      ? 'border-amber-500 bg-amber-500 text-white'
                      : 'border-input bg-background hover:bg-muted'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </>
        )}

        {erreur && (
          <Alert variant="destructive">
            <AlertTitle>Saisie incomplète</AlertTitle>
            <AlertDescription>{erreur}</AlertDescription>
          </Alert>
        )}

        <Button type="button" onClick={() => void enregistrer()} className="h-14 w-full text-base">
          Enregistrer le pointage
        </Button>
      </div>

      {/* Saisies récentes */}
      {entries.length > 0 && (
        <div className="space-y-2">
          <h2 className="px-1 text-sm font-semibold text-muted-foreground">
            Saisies récentes ({entries.length})
          </h2>
          <ul className="space-y-2">
            {entries.slice(0, 30).map((e) => (
              <li
                key={e.clientUuid}
                className="flex items-start justify-between gap-3 rounded-lg border bg-card p-3"
              >
                <div className="min-w-0">
                  <div className="truncate text-sm font-medium">{e.display.employeNom}</div>
                  <div className="truncate text-xs text-muted-foreground">
                    {e.display.chantierLibelle ?? e.display.typeLabel} · {e.payload.quantite} h ·{' '}
                    {e.payload.datePointage}
                  </div>
                  {e.status === 'rejected' && e.message && (
                    <div className="mt-1 text-xs text-rose-700">{e.message}</div>
                  )}
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  {e.status === 'pending' && (
                    <Badge tone="amber" shape="pill">
                      En attente
                    </Badge>
                  )}
                  {e.status === 'synced' && (
                    <Badge tone="emerald" shape="pill">
                      <CheckCircle2Icon className="mr-1 size-3" /> Synchronisé
                    </Badge>
                  )}
                  {e.status === 'rejected' && (
                    <>
                      <Badge tone="rose" shape="pill">
                        <TriangleAlertIcon className="mr-1 size-3" /> Refusé
                      </Badge>
                      <button
                        type="button"
                        onClick={() => void retirer(e.clientUuid)}
                        title="Retirer"
                        className="rounded p-1 text-destructive hover:bg-destructive/10"
                      >
                        <Trash2Icon className="size-4" />
                      </button>
                    </>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
