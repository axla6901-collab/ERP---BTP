'use client';

import { useRouter } from 'next/navigation';
import { useTransition } from 'react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import type { StatutSituation } from '@/lib/validation/facturation';

type Result<T> = { ok: true; data: T } | { ok: false; error: string };

type Props = {
  situationId: string;
  statut: StatutSituation;
  dejaFacturee: boolean;
  actionValider: (id: string) => Promise<Result<void>>;
  actionGenererFacture: (
    id: string,
  ) => Promise<Result<{ factureId: string; factureNumero: string }>>;
  actionAnnuler: (id: string) => Promise<Result<void>>;
};

export function SituationActions({
  situationId,
  statut,
  dejaFacturee,
  actionValider,
  actionGenererFacture,
  actionAnnuler,
}: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  function handleValider() {
    startTransition(async () => {
      const res = await actionValider(situationId);
      if (res.ok) {
        toast.success('Situation validée');
        router.refresh();
      } else {
        toast.error(res.error);
      }
    });
  }

  function handleGenererFacture() {
    startTransition(async () => {
      const res = await actionGenererFacture(situationId);
      if (res.ok) {
        toast.success(`Facture ${res.data.factureNumero} créée en brouillon`);
        router.push(`/facturation/factures/${res.data.factureId}`);
      } else {
        toast.error(res.error);
      }
    });
  }

  function handleAnnuler() {
    startTransition(async () => {
      const res = await actionAnnuler(situationId);
      if (res.ok) {
        toast.success('Situation annulée');
        router.refresh();
      } else {
        toast.error(res.error);
      }
    });
  }

  const aucune = statut === 'facturee' || statut === 'annulee';
  if (aucune && !dejaFacturee) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Actions</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="flex flex-wrap gap-2">
          {statut === 'brouillon' && (
            <Button type="button" size="sm" onClick={handleValider} disabled={isPending}>
              Valider la situation
            </Button>
          )}
          {(statut === 'brouillon' || statut === 'validee') && !dejaFacturee && (
            <Button
              type="button"
              size="sm"
              variant="default"
              onClick={handleGenererFacture}
              disabled={isPending}
            >
              Générer la facture
            </Button>
          )}
          {statut !== 'annulee' && statut !== 'facturee' && (
            <Button
              type="button"
              size="sm"
              variant="destructive"
              onClick={handleAnnuler}
              disabled={isPending}
            >
              Annuler la situation
            </Button>
          )}
        </div>
        <p className="mt-2 text-xs text-muted-foreground">
          La facture créée est en <strong>brouillon</strong> : tu peux la modifier puis l&apos;émettre depuis sa fiche.
        </p>
      </CardContent>
    </Card>
  );
}
