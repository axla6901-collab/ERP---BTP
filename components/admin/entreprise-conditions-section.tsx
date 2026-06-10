'use client';

import { EyeIcon, FileTextIcon, PlusIcon, Trash2Icon, XIcon } from 'lucide-react';
import { useEffect, useState, useTransition } from 'react';
import { toast } from 'sonner';

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import dynamic from 'next/dynamic';

import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import type {
  ConditionNouvelleVersionInput,
  ConditionType,
} from '@/lib/validation/entreprise';

// Tiptap (~100 kB) chargé à la demande : sorti du bundle initial de la fiche
// entreprise (route /administration/entreprise : 427 kB → ~300 kB First Load JS).
const TiptapEditor = dynamic(
  () => import('@/components/ui/tiptap-editor').then((m) => m.TiptapEditor),
  {
    ssr: false,
    loading: () => (
      <div className="rounded-md border p-3 text-sm text-muted-foreground">
        Chargement de l’éditeur…
      </div>
    ),
  },
);

export type ConditionVersionRow = {
  id: string;
  type: 'cgv' | 'cga';
  version: number;
  dateEffet: string;
  commentaire: string | null;
  createdAt: Date | string;
  tailleHtml: number;
};

type ServerResult<T = void> = { ok: boolean; error?: string; data?: T };

type Props = {
  versionsCgv: ConditionVersionRow[];
  versionsCga: ConditionVersionRow[];
  /** Récupère le HTML complet d'une version pour pré-remplir l'éditeur ou prévisualiser. */
  onLireVersion: (id: string) => Promise<{ contenuHtml: string } | null>;
  onCreerVersion: (
    input: ConditionNouvelleVersionInput,
  ) => Promise<ServerResult<{ id: string; version: number }>>;
  onSupprimerVersion: (id: string) => Promise<ServerResult>;
};

const LIBELLES: Record<ConditionType, { titre: string; description: string; sigle: string }> = {
  cgv: {
    titre: 'Conditions Générales de Vente',
    description: 'Annexées aux devis et factures émis par votre société.',
    sigle: 'CGV',
  },
  cga: {
    titre: 'Conditions Générales d’Achat',
    description: 'Annexées aux commandes et contrats émis vers vos fournisseurs / sous-traitants.',
    sigle: 'CGA',
  },
};

function aujourdHui(): string {
  return new Date().toISOString().slice(0, 10);
}

export function EntrepriseConditionsSection({
  versionsCgv,
  versionsCga,
  onLireVersion,
  onCreerVersion,
  onSupprimerVersion,
}: Props) {
  const [type, setType] = useState<ConditionType>('cgv');

  const versions = type === 'cgv' ? versionsCgv : versionsCga;
  const libelles = LIBELLES[type];

  return (
    <Card>
      <CardHeader className="space-y-4">
        <div className="flex gap-1 rounded-md bg-muted p-1 w-fit">
          {(['cgv', 'cga'] as const).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setType(t)}
              className={cn(
                'rounded px-3 py-1.5 text-sm font-medium transition-colors',
                t === type
                  ? 'bg-background text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground',
              )}
              aria-pressed={t === type}
            >
              {LIBELLES[t].sigle}
            </button>
          ))}
        </div>
        <div>
          <CardTitle>{libelles.titre}</CardTitle>
          <CardDescription>{libelles.description}</CardDescription>
        </div>
      </CardHeader>
      <CardContent>
        <ConditionsPanel
          key={type}
          type={type}
          versions={versions}
          onLireVersion={onLireVersion}
          onCreerVersion={onCreerVersion}
          onSupprimerVersion={onSupprimerVersion}
        />
      </CardContent>
    </Card>
  );
}

function ConditionsPanel({
  type,
  versions,
  onLireVersion,
  onCreerVersion,
  onSupprimerVersion,
}: {
  type: ConditionType;
  versions: ConditionVersionRow[];
  onLireVersion: Props['onLireVersion'];
  onCreerVersion: Props['onCreerVersion'];
  onSupprimerVersion: Props['onSupprimerVersion'];
}) {
  type Mode = 'list' | 'edit' | 'preview';
  const [mode, setMode] = useState<Mode>('list');
  const [previewVersion, setPreviewVersion] = useState<ConditionVersionRow | null>(null);
  const [previewHtml, setPreviewHtml] = useState<string>('');
  const [editorHtmlInitial, setEditorHtmlInitial] = useState<string>('');

  // état d'édition (séparé)
  const [contenuHtml, setContenuHtml] = useState<string>('');
  const [contenuJson, setContenuJson] = useState<unknown>(null);
  const [dateEffet, setDateEffet] = useState<string>(aujourdHui());
  const [commentaire, setCommentaire] = useState<string>('');
  const [erreur, setErreur] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  async function ouvrirEdition(depuisVersion?: ConditionVersionRow) {
    setErreur(null);
    setDateEffet(aujourdHui());
    setCommentaire('');
    if (depuisVersion) {
      const data = await onLireVersion(depuisVersion.id);
      const html = data?.contenuHtml ?? '';
      setEditorHtmlInitial(html);
      setContenuHtml(html);
      setContenuJson(null);
    } else {
      setEditorHtmlInitial('');
      setContenuHtml('');
      setContenuJson(null);
    }
    setMode('edit');
  }

  async function ouvrirApercu(v: ConditionVersionRow) {
    setPreviewVersion(v);
    setPreviewHtml('');
    setMode('preview');
    const data = await onLireVersion(v.id);
    setPreviewHtml(data?.contenuHtml ?? '');
  }

  function handlePublier() {
    setErreur(null);
    if (contenuHtml.replace(/<[^>]*>/g, '').trim().length === 0) {
      setErreur('Le contenu est vide.');
      return;
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateEffet)) {
      setErreur('Date d’effet invalide.');
      return;
    }
    startTransition(async () => {
      const result = await onCreerVersion({
        type,
        contenuHtml,
        contenuJson: contenuJson ?? null,
        dateEffet,
        commentaire: commentaire.trim().length > 0 ? commentaire.trim() : null,
      });
      if (!result.ok) {
        setErreur(result.error ?? 'Publication impossible.');
        return;
      }
      toast.success(`Version ${result.data?.version ?? ''} publiée`);
      setMode('list');
    });
  }

  function handleSupprimer(v: ConditionVersionRow) {
    if (
      !window.confirm(
        `Supprimer la version ${v.version} (effet ${v.dateEffet}) ?\n\nElle restera consultable dans les documents déjà émis qui la référencent.`,
      )
    ) {
      return;
    }
    startTransition(async () => {
      const result = await onSupprimerVersion(v.id);
      if (!result.ok) {
        toast.error(result.error ?? 'Suppression impossible.');
        return;
      }
      toast.success('Version supprimée');
    });
  }

  if (mode === 'edit') {
    return (
      <div className="space-y-4">
        {erreur && (
          <Alert variant="destructive">
            <AlertTitle>Erreur</AlertTitle>
            <AlertDescription>{erreur}</AlertDescription>
          </Alert>
        )}
        <TiptapEditor
          initialHtml={editorHtmlInitial}
          onChange={(html, json) => {
            setContenuHtml(html);
            setContenuJson(json);
          }}
          minHeight={360}
          placeholder="Saisissez vos conditions générales…"
        />
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="grid gap-1.5">
            <Label htmlFor={`date-${type}`}>Date d&apos;effet</Label>
            <Input
              id={`date-${type}`}
              type="date"
              value={dateEffet}
              onChange={(e) => setDateEffet(e.target.value)}
            />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor={`commentaire-${type}`}>Commentaire (optionnel)</Label>
            <Textarea
              id={`commentaire-${type}`}
              value={commentaire}
              onChange={(e) => setCommentaire(e.target.value)}
              maxLength={500}
              rows={2}
              placeholder="Motif de la mise à jour, références juridiques…"
            />
          </div>
        </div>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={() => setMode('list')} disabled={isPending}>
            Annuler
          </Button>
          <Button type="button" onClick={handlePublier} disabled={isPending}>
            {isPending ? 'Publication…' : 'Publier cette version'}
          </Button>
        </div>
      </div>
    );
  }

  if (mode === 'preview' && previewVersion) {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="text-sm font-medium">
              Version {previewVersion.version} — effet {previewVersion.dateEffet}
            </div>
            {previewVersion.commentaire && (
              <div className="mt-0.5 text-xs text-muted-foreground">
                {previewVersion.commentaire}
              </div>
            )}
          </div>
          <Button type="button" variant="ghost" size="sm" onClick={() => setMode('list')}>
            <XIcon className="mr-1 size-4" />
            Fermer
          </Button>
        </div>
        <PreviewContent html={previewHtml} />
        <div className="flex justify-end gap-2">
          <Button
            type="button"
            variant="secondary"
            onClick={() => ouvrirEdition(previewVersion)}
          >
            Repartir de cette version pour en créer une nouvelle
          </Button>
        </div>
      </div>
    );
  }

  // mode 'list'
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="text-sm text-muted-foreground">
          {versions.length === 0
            ? 'Aucune version publiée.'
            : `${versions.length} version${versions.length > 1 ? 's' : ''} publiée${
                versions.length > 1 ? 's' : ''
              }.`}
        </div>
        <Button
          type="button"
          onClick={() => ouvrirEdition(versions[0])}
          disabled={isPending}
        >
          <PlusIcon className="mr-2 size-4" />
          {versions.length === 0 ? 'Rédiger la première version' : 'Nouvelle version'}
        </Button>
      </div>

      {versions.length > 0 && (
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-24">Version</TableHead>
                <TableHead className="w-40">Date d&apos;effet</TableHead>
                <TableHead>Commentaire</TableHead>
                <TableHead className="w-24 text-right">Taille</TableHead>
                <TableHead className="w-32 text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {versions.map((v, i) => (
                <TableRow key={v.id}>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <FileTextIcon className="size-4 text-muted-foreground" />
                      <span className="font-medium">v{v.version}</span>
                      {i === 0 && (
                        <span className="rounded bg-emerald-100 px-1.5 py-0.5 text-[10px] font-medium uppercase text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300">
                          Actuelle
                        </span>
                      )}
                    </div>
                  </TableCell>
                  <TableCell className="text-sm">{v.dateEffet}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {v.commentaire ?? '—'}
                  </TableCell>
                  <TableCell className="text-right text-xs text-muted-foreground">
                    {(v.tailleHtml / 1024).toFixed(1)} Ko
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1">
                      <Button
                        type="button"
                        size="icon"
                        variant="ghost"
                        onClick={() => ouvrirApercu(v)}
                        title="Aperçu"
                      >
                        <EyeIcon className="size-4" />
                      </Button>
                      <Button
                        type="button"
                        size="icon"
                        variant="ghost"
                        onClick={() => handleSupprimer(v)}
                        disabled={isPending}
                        title="Supprimer"
                        className="text-destructive hover:text-destructive"
                      >
                        <Trash2Icon className="size-4" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}

function PreviewContent({ html }: { html: string }) {
  // Le HTML est déjà sanitizé côté serveur à l'insertion ; mais par sécurité
  // on n'autorise pas l'exécution de scripts (interdits par la sanitization
  // d'origine), et l'aperçu reste isolé visuellement.
  const [render, setRender] = useState<string>('');
  useEffect(() => {
    setRender(html);
  }, [html]);

  return (
    <div
      className="prose prose-sm max-w-none rounded-md border bg-muted/20 p-4"
      // eslint-disable-next-line react/no-danger
      dangerouslySetInnerHTML={{ __html: render }}
    />
  );
}
