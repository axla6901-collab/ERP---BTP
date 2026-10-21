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
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import type { ActionResult } from '@/lib/common/action-result';
import { formatDateFr, formatEuro } from '@/lib/test-sirh/format';

export type NoteARembourser = {
  id: string;
  employeNom: string;
  libelle: string;
  dateDepense: string;
  montantTtc: number;
};

type Props = {
  /** Note approuvée ; `null` = modale fermée. */
  note: NoteARembourser | null;
  today: string;
  onClose: () => void;
  onRembourser: (id: string, dateRemboursement: string) => Promise<ActionResult>;
};

/** « Marquer remboursée » : date du virement ou de la paie qui a remboursé la note. */
export function RemboursementNoteFraisDialog({ note, today, onClose, onRembourser }: Props) {
  const [date, setDate] = useState(today);
  const [erreur, setErreur] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    if (note) {
      setDate(today);
      setErreur(null);
    }
  }, [note, today]);

  function confirmer() {
    if (!note) return;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      setErreur('Date de remboursement invalide.');
      return;
    }
    if (date < note.dateDepense) {
      setErreur(
        `La date de remboursement doit être postérieure à la dépense (${formatDateFr(note.dateDepense)}).`,
      );
      return;
    }
    setErreur(null);
    startTransition(async () => {
      const r = await onRembourser(note.id, date);
      if (!r.ok) {
        setErreur(r.error);
        return;
      }
      toast.success('Note de frais marquée remboursée');
      onClose();
    });
  }

  return (
    <Dialog open={note !== null} onOpenChange={(o) => (!o ? onClose() : undefined)}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Marquer remboursée</DialogTitle>
          {note && (
            <DialogDescription>
              {note.employeNom} · {note.libelle} ·{' '}
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
          <Label htmlFor="date-remboursement-frais">Date de remboursement</Label>
          <Input
            id="date-remboursement-frais"
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
          />
        </div>
        <DialogFooter>
          <Button type="button" variant="ghost" onClick={onClose} disabled={isPending}>
            Annuler
          </Button>
          <Button type="button" onClick={confirmer} disabled={isPending}>
            {isPending ? 'En cours…' : 'Marquer remboursée'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
