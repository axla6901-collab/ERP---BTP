'use client';

import { ImageIcon, PencilIcon, Trash2Icon, UploadIcon } from 'lucide-react';
import { useRef, useState, useTransition } from 'react';
import { toast } from 'sonner';

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  LOGO_MIME_AUTORISES,
  LOGO_TAILLE_MAX_OCTETS,
  type LogoType,
} from '@/lib/validation/entreprise';

type LogoRow = {
  id: string;
  type: 'principal' | 'certification';
  libelle: string;
  mimeType: string;
  tailleOctets: number;
  ordre: number;
  createdAt: Date | string;
};

type ServerResult = { ok: boolean; error?: string };

type Props = {
  logoPrincipal: LogoRow | null;
  certifications: LogoRow[];
  /** Server actions injectées depuis la page (préserve "use server" boundary). */
  onUpload: (formData: FormData) => Promise<ServerResult>;
  onRenommer: (id: string, libelle: string) => Promise<ServerResult>;
  onSupprimer: (id: string) => Promise<ServerResult>;
};

function tailleHumaine(octets: number): string {
  if (octets < 1024) return `${octets} o`;
  if (octets < 1024 * 1024) return `${(octets / 1024).toFixed(1)} Ko`;
  return `${(octets / 1024 / 1024).toFixed(1)} Mo`;
}

const ACCEPT = LOGO_MIME_AUTORISES.join(',');

export function EntrepriseLogosSection({
  logoPrincipal,
  certifications,
  onUpload,
  onRenommer,
  onSupprimer,
}: Props) {
  return (
    <div className="space-y-6">
      <LogoUploadCard
        type="principal"
        titre="Logo principal"
        description="Logo de la société, utilisé en entête des devis et factures. Un seul logo principal actif à la fois ; l'upload d'un nouveau remplace l'ancien."
        existant={logoPrincipal}
        onUpload={onUpload}
        onRenommer={onRenommer}
        onSupprimer={onSupprimer}
      />

      <LogoUploadCard
        type="certification"
        titre="Certifications & labels"
        description="Logos RGE, Qualibat, et autres certifications à afficher sur les devis. Plusieurs autorisés, ordonnés par ordre d'insertion."
        existants={certifications}
        onUpload={onUpload}
        onRenommer={onRenommer}
        onSupprimer={onSupprimer}
      />
    </div>
  );
}

type CardProps = Pick<Props, 'onUpload' | 'onRenommer' | 'onSupprimer'> & {
  type: LogoType;
  titre: string;
  description: string;
  existant?: LogoRow | null;
  existants?: LogoRow[];
};

function LogoUploadCard({
  type,
  titre,
  description,
  existant,
  existants,
  onUpload,
  onRenommer,
  onSupprimer,
}: CardProps) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [libelle, setLibelle] = useState(type === 'principal' ? 'Logo société' : '');
  const [erreur, setErreur] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function reset() {
    if (fileRef.current) fileRef.current.value = '';
    if (type !== 'principal') setLibelle('');
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErreur(null);

    const file = fileRef.current?.files?.[0];
    if (!file) {
      setErreur('Sélectionnez un fichier.');
      return;
    }
    if (!LOGO_MIME_AUTORISES.includes(file.type as (typeof LOGO_MIME_AUTORISES)[number])) {
      setErreur('Format non supporté. Formats acceptés : PNG, JPEG, WebP, SVG.');
      return;
    }
    if (file.size > LOGO_TAILLE_MAX_OCTETS) {
      setErreur(
        `Fichier trop volumineux (${tailleHumaine(file.size)}). Max ${Math.round(
          LOGO_TAILLE_MAX_OCTETS / 1024 / 1024,
        )} Mo.`,
      );
      return;
    }
    if (libelle.trim().length === 0) {
      setErreur('Renseignez un libellé.');
      return;
    }

    const fd = new FormData();
    fd.append('type', type);
    fd.append('libelle', libelle.trim());
    fd.append('file', file);

    startTransition(async () => {
      const result = await onUpload(fd);
      if (!result.ok) {
        setErreur(result.error ?? 'Upload impossible.');
        return;
      }
      toast.success(type === 'principal' ? 'Logo principal mis à jour' : 'Logo ajouté');
      reset();
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{titre}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {type === 'principal' && existant && (
          <LogoPreview row={existant} onRenommer={onRenommer} onSupprimer={onSupprimer} />
        )}
        {type === 'certification' && existants && existants.length > 0 && (
          <div className="grid gap-3 sm:grid-cols-2">
            {existants.map((row) => (
              <LogoPreview
                key={row.id}
                row={row}
                onRenommer={onRenommer}
                onSupprimer={onSupprimer}
              />
            ))}
          </div>
        )}
        {type === 'certification' && (!existants || existants.length === 0) && (
          <p className="text-sm text-muted-foreground">Aucune certification enregistrée.</p>
        )}

        <form onSubmit={handleSubmit} className="space-y-3 border-t pt-4">
          {erreur && (
            <Alert variant="destructive">
              <AlertTitle>Erreur</AlertTitle>
              <AlertDescription>{erreur}</AlertDescription>
            </Alert>
          )}
          <div className="grid gap-2 sm:grid-cols-[1fr_auto] sm:items-end">
            <div className="grid gap-1.5">
              <Label htmlFor={`libelle-${type}`}>
                Libellé{type === 'certification' ? ' (ex : RGE Qualibat 2025)' : ''}
              </Label>
              <Input
                id={`libelle-${type}`}
                value={libelle}
                onChange={(e) => setLibelle(e.target.value)}
                maxLength={120}
                placeholder={type === 'principal' ? 'Logo société' : 'RGE Qualibat 2025'}
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor={`file-${type}`}>Fichier</Label>
              <Input
                id={`file-${type}`}
                type="file"
                accept={ACCEPT}
                ref={fileRef}
                className="cursor-pointer"
              />
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            PNG, JPEG, WebP, SVG — max {Math.round(LOGO_TAILLE_MAX_OCTETS / 1024 / 1024)} Mo.
          </p>
          <div className="flex justify-end">
            <Button type="submit" disabled={isPending}>
              <UploadIcon className="mr-2 size-4" />
              {isPending
                ? 'Upload…'
                : type === 'principal' && existant
                  ? 'Remplacer le logo principal'
                  : 'Ajouter'}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}

function LogoPreview({
  row,
  onRenommer,
  onSupprimer,
}: {
  row: LogoRow;
  onRenommer: (id: string, libelle: string) => Promise<ServerResult>;
  onSupprimer: (id: string) => Promise<ServerResult>;
}) {
  const [editing, setEditing] = useState(false);
  const [libelle, setLibelle] = useState(row.libelle);
  const [isPending, startTransition] = useTransition();

  function handleSaveLibelle() {
    const valeur = libelle.trim();
    if (valeur.length === 0 || valeur === row.libelle) {
      setEditing(false);
      setLibelle(row.libelle);
      return;
    }
    startTransition(async () => {
      const result = await onRenommer(row.id, valeur);
      if (!result.ok) {
        toast.error(result.error ?? 'Renommage impossible.');
        return;
      }
      toast.success('Logo renommé');
      setEditing(false);
    });
  }

  function handleSupprimer() {
    if (!window.confirm(`Supprimer le logo "${row.libelle}" ?`)) return;
    startTransition(async () => {
      const result = await onSupprimer(row.id);
      if (!result.ok) {
        toast.error(result.error ?? 'Suppression impossible.');
        return;
      }
      toast.success('Logo supprimé');
    });
  }

  return (
    <div className="flex items-center gap-3 rounded-md border bg-card p-3">
      <div className="flex size-20 shrink-0 items-center justify-center rounded border bg-muted/40">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={`/api/admin/entreprise/logos/${row.id}`}
          alt={row.libelle}
          className="max-h-20 max-w-20 object-contain"
          onError={(e) => {
            (e.currentTarget as HTMLImageElement).style.display = 'none';
            const fallback = e.currentTarget.nextElementSibling as HTMLElement | null;
            if (fallback) fallback.style.display = 'flex';
          }}
        />
        <ImageIcon className="hidden size-8 text-muted-foreground" aria-hidden />
      </div>
      <div className="min-w-0 flex-1">
        {editing ? (
          <div className="flex items-center gap-2">
            <Input
              value={libelle}
              onChange={(e) => setLibelle(e.target.value)}
              maxLength={120}
              autoFocus
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleSaveLibelle();
                if (e.key === 'Escape') {
                  setEditing(false);
                  setLibelle(row.libelle);
                }
              }}
            />
            <Button type="button" size="sm" onClick={handleSaveLibelle} disabled={isPending}>
              OK
            </Button>
          </div>
        ) : (
          <div className="truncate font-medium">{row.libelle}</div>
        )}
        <div className="mt-0.5 text-xs text-muted-foreground">
          {row.mimeType.replace('image/', '').toUpperCase()} · {tailleHumaine(row.tailleOctets)}
        </div>
      </div>
      <div className="flex shrink-0 gap-1">
        <Button
          type="button"
          variant="ghost"
          size="icon"
          onClick={() => setEditing(true)}
          disabled={editing || isPending}
          title="Renommer"
        >
          <PencilIcon className="size-4" />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          onClick={handleSupprimer}
          disabled={isPending}
          title="Supprimer"
          className="text-destructive hover:text-destructive"
        >
          <Trash2Icon className="size-4" />
        </Button>
      </div>
    </div>
  );
}
