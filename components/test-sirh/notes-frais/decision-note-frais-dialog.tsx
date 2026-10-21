'use client';

import { useEffect, useState, useTransition } from 'react';
import { toast } from 'sonner';

import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import type { ActionResult } from '@/lib/common/action-result';
import { formatDateFr, formatEuro } from '@/lib/test-sirh/format';
import type { DecisionInput } from '@/lib/validation/test-sirh/commun';

export type NoteADecider = {
  id: string;
  employeNom: string;
  libelle: string;
  dateDepense: string;
  montantTtc: number;
};

type Props = {
  /** Note concernée ; `null` = modale fermée. */
  note: NoteADecider | null;
  decision: 'approuver' | 'refuser';
  onClose: () => void;
  onDecider: (input: DecisionInput) => Promise<ActionResult>;
};

/**
 * Décision d'un valideur sur une note soumise : approbation (commentaire
 * facultatif) ou refus (motif obligatoire, transmis au salarié).
 */
export function DecisionNoteFraisDialog({ note, decision, onClose, onDecider }: Props) {
  const [commentaire, setCommentaire] = useState('');
  const [erreur, setErreur] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const refus = decision === 'refuser';

  useEffect(() => {
    if (note) {
      setCommentaire('');
      setErreur(null);
    }
  }, [note]);

  function confirmer() {
    if (!note) return;
    if (refus && commentaire.trim().length === 0) {
      setErreur('Indiquez le motif du refus (il sera visible par le salarié).');
      return;
    }
    setErreur(null);
    startTransition(async () => {
      const r = await onDecider({
        id: note.id,
        decision,
        commentaire: commentaire.trim() || null,
      });
      if (!r.ok) {
        setErreur(r.error);
        return;
      }
      toast.success(refus ? 'Note de frais refusée' : 'Note de frais approuvée');
      onClose();
    });
  }

  return (
    <Dialog open={note !== null} onOpenChange={(o) => (!o ? onClose() : undefined)}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>
            {refus ? 'Refuser la note de frais' : 'Approuver la note de frais'}
          </DialogTitle>
          {note && (
            <DialogDescription>
              {note.employeNom} · {formatDateFr(note.dateDepense)} · {note.libelle} ·{' '}
              <strong className="tabular-nums">{formatEuro(note.montantTtc)}</strong>
            </DialogDescription>
          )}
        </DialogHeader>
        {erreur && (
          <Alert variant="destructive">
            <AlertDescription>{erreur}</AlertDescription>
          </Alert>
        )}
        <div className="grid gap-2">
          <Label htmlFor="commentaire-decision-frais">
            {refus ? 'Motif du refus' : 'Commentaire (facultatif)'}
          </Label>
          <Textarea
            id="commentaire-decision-frais"
            rows={3}
            maxLength={1000}
            value={commentaire}
            onChange={(e) => setCommentaire(e.target.value)}
          />
        </div>
        <DialogFooter>
          <Button type="button" variant="ghost" onClick={onClose} disabled={isPending}>
            Annuler
          </Button>
          <Button
            type="button"
            variant={refus ? 'destructive' : 'default'}
            onClick={confirmer}
            disabled={isPending}
          >
            {isPending ? 'En cours…' : refus ? 'Refuser' : 'Approuver'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
