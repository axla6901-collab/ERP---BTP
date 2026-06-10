import {
  ArrowLeftIcon,
  Building2Icon,
  ExternalLinkIcon,
  FileTextIcon,
  HardHatIcon,
  HandshakeIcon,
  HashIcon,
  ReceiptIcon,
  StarIcon,
  UsersIcon,
} from 'lucide-react';
import Link from 'next/link';
import { notFound } from 'next/navigation';

import { EntrepriseIdentiteForm } from '@/components/admin/entreprise-identite-form';
import { EntrepriseLogosSection } from '@/components/admin/entreprise-logos-section';
import { NumerotationForm } from '@/components/admin/numerotation-form';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  getEntrepriseDetail,
  listerLogosSuper,
  mettreAJourEntreprise,
  renommerLogoSuper,
  supprimerLogoSuper,
  uploadLogoSuper,
} from '@/lib/admin/entreprises-super';
import type { ModeleInput } from '@/lib/numerotation/modeles';
import {
  listerModelesNumerotationParEntrepriseId,
  mettreAJourModeleSuperAdmin,
  reinitialiserModeleSuperAdmin,
} from '@/lib/numerotation/modeles-super';
import type { TypeNumeroDoc } from '@/lib/numerotation/template';
import { getDownloadUrl } from '@/lib/storage/s3';
import type { EntrepriseIdentiteInput } from '@/lib/validation/entreprise';

export const dynamic = 'force-dynamic';

type Params = { id: string };

export default async function AdminEntrepriseFichePage({
  params,
}: {
  params: Promise<Params>;
}) {
  const { id } = await params;
  const [entreprise, modelesNumerotation, logos] = await Promise.all([
    getEntrepriseDetail(id),
    listerModelesNumerotationParEntrepriseId(id),
    listerLogosSuper(id),
  ]);
  if (!entreprise) notFound();
  const entrepriseId = entreprise.id;
  const entrepriseActif = entreprise.actif;

  const logoUrl = entreprise.logoPrincipalStorageKey
    ? await getDownloadUrl(entreprise.logoPrincipalStorageKey)
    : null;

  const logoPrincipal = logos.find((l) => l.type === 'principal') ?? null;
  const certifications = logos.filter((l) => l.type === 'certification');

  const identiteDefaults: EntrepriseIdentiteInput = {
    raisonSociale: entreprise.raisonSociale,
    siret: entreprise.siret,
    tvaIntracom: entreprise.tvaIntracom,
    adresseLigne1: entreprise.adresseLigne1,
    adresseLigne2: entreprise.adresseLigne2,
    codePostal: entreprise.codePostal,
    ville: entreprise.ville,
    pays: entreprise.pays,
    iban: entreprise.iban,
    bic: entreprise.bic,
    rcs: entreprise.rcs,
    formeJuridique: entreprise.formeJuridique,
    capitalSocial: entreprise.capitalSocial,
    codeApe: entreprise.codeApe,
  };

  const adresseComplete = [
    entreprise.adresseLigne1,
    entreprise.adresseLigne2,
    [entreprise.codePostal, entreprise.ville].filter(Boolean).join(' '),
    entreprise.pays,
  ]
    .filter((s) => s && s.trim().length > 0)
    .join(' · ');

  return (
    <div className="space-y-6">
      <div>
        <Link
          href="/admin/entreprises"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeftIcon className="size-4" />
          Toutes les entreprises
        </Link>
      </div>

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-center gap-4">
          {logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={logoUrl}
              alt={`Logo ${entreprise.raisonSociale}`}
              className="size-16 shrink-0 rounded-md border bg-white object-contain p-1"
            />
          ) : (
            <div className="flex size-16 shrink-0 items-center justify-center rounded-md border bg-muted/40 text-xl font-semibold text-muted-foreground">
              {entreprise.raisonSociale.slice(0, 2).toUpperCase()}
            </div>
          )}
          <div className="space-y-1">
            <div className="flex items-center gap-3">
              <Building2Icon className="size-6 text-primary" />
              <h1 className="text-2xl font-semibold">{entreprise.raisonSociale}</h1>
              {entreprise.actif ? (
                <span className="inline-flex items-center rounded-full bg-green-100 px-2 py-0.5 text-xs text-green-800">
                  Actif
                </span>
              ) : (
                <span className="inline-flex items-center rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-700">
                  Désactivé
                </span>
              )}
            </div>
            <p className="font-mono text-xs text-muted-foreground">{entreprise.slug}</p>
          </div>
        </div>
        <Link
          href={`/${entreprise.slug}/dashboard`}
          className="inline-flex items-center gap-2 rounded-md border bg-card px-3 py-1.5 text-sm font-medium hover:bg-muted"
        >
          <ExternalLinkIcon className="size-4" />
          Entrer dans la société
        </Link>
      </div>

      {!entreprise.actif && (
        <Alert>
          <AlertDescription>
            Cette société est désactivée — les utilisateurs membres ne peuvent
            plus la sélectionner.
          </AlertDescription>
        </Alert>
      )}

      <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Devis"
          value={entreprise.stats.devis}
          icon={FileTextIcon}
          href={`/${entreprise.slug}/commercial/devis`}
        />
        <StatCard
          label="Factures"
          value={entreprise.stats.factures}
          icon={ReceiptIcon}
          href={`/${entreprise.slug}/facturation/factures`}
        />
        <StatCard
          label="Chantiers"
          value={entreprise.stats.chantiers}
          icon={HardHatIcon}
          href={`/${entreprise.slug}/chantiers`}
        />
        <StatCard
          label="Clients"
          value={entreprise.stats.clients}
          icon={HandshakeIcon}
          href={`/${entreprise.slug}/commercial/clients`}
        />
      </section>

      <section>
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Building2Icon className="size-4" />
              Identité légale & adresse
            </CardTitle>
          </CardHeader>
          <CardContent>
            <EntrepriseIdentiteForm
              defaultValues={identiteDefaults}
              onSubmit={async (values) => {
                'use server';
                return mettreAJourEntreprise(entrepriseId, {
                  ...values,
                  actif: entrepriseActif,
                });
              }}
            />
            <p className="mt-4 text-xs text-muted-foreground">
              Créée le{' '}
              {entreprise.createdAt.toLocaleDateString('fr-FR', {
                day: '2-digit',
                month: 'long',
                year: 'numeric',
              })}
              {' · '}
              Adresse rendue ci-dessus :{' '}
              <span className="font-mono">{adresseComplete || '—'}</span>
            </p>
          </CardContent>
        </Card>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-medium">Logos &amp; certifications</h2>
        <EntrepriseLogosSection
          logoPrincipal={logoPrincipal}
          certifications={certifications}
          onUpload={async (formData) => {
            'use server';
            const result = await uploadLogoSuper(entrepriseId, formData);
            return result.ok ? { ok: true } : { ok: false, error: result.error };
          }}
          onRenommer={async (logoId, libelle) => {
            'use server';
            const result = await renommerLogoSuper(entrepriseId, logoId, libelle);
            return result.ok ? { ok: true } : { ok: false, error: result.error };
          }}
          onSupprimer={async (logoId) => {
            'use server';
            const result = await supprimerLogoSuper(entrepriseId, logoId);
            return result.ok ? { ok: true } : { ok: false, error: result.error };
          }}
        />
      </section>

      <section>
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <UsersIcon className="size-4" />
              Utilisateurs
              <span className="text-sm font-normal text-muted-foreground">
                ({entreprise.membres.length})
              </span>
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {entreprise.membres.length === 0 ? (
              <p className="px-4 pb-4 text-sm text-muted-foreground">Aucun membre.</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Email</TableHead>
                    <TableHead>Rôle dans l&apos;entreprise</TableHead>
                    <TableHead className="text-right">Société par défaut</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {entreprise.membres.map((m) => (
                    <TableRow key={m.utilisateurId}>
                      <TableCell className="font-mono text-xs">{m.email}</TableCell>
                      <TableCell>
                        <div className="flex flex-col">
                          <span>{m.roleLibelle}</span>
                          <span className="font-mono text-[10px] uppercase tracking-wide text-muted-foreground">
                            {m.roleCode}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell className="text-right">
                        {m.isDefault ? (
                          <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-xs text-primary">
                            <StarIcon className="size-3" />
                            Oui
                          </span>
                        ) : (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </section>

      <section>
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <HashIcon className="size-4" />
              Numérotation
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Templates de numérotation (devis, factures, avoirs…) pour cette
              société. Les numéros déjà émis restent intangibles (registre fiscal
              append-only) ; les changements sont tracés dans{' '}
              <code className="font-mono">audit_log</code> avec un marqueur{' '}
              <code className="font-mono">viaSuperAdmin: true</code>.
            </p>
            <NumerotationForm
              modeles={modelesNumerotation}
              onEnregistrer={async (input: ModeleInput) => {
                'use server';
                return mettreAJourModeleSuperAdmin({ entrepriseId, ...input });
              }}
              onReinitialiser={async (typeDoc: TypeNumeroDoc) => {
                'use server';
                return reinitialiserModeleSuperAdmin({ entrepriseId, typeDoc });
              }}
            />
          </CardContent>
        </Card>
      </section>
    </div>
  );
}

function StatCard({
  label,
  value,
  icon: Icon,
  href,
}: {
  label: string;
  value: number;
  icon: React.ComponentType<{ className?: string }>;
  href: string;
}) {
  return (
    <Link
      href={href}
      className="block rounded-xl bg-card p-4 ring-1 ring-foreground/10 transition-shadow hover:shadow-md"
    >
      <div className="flex items-center gap-2 text-xs uppercase tracking-wide text-muted-foreground">
        <Icon className="size-4" />
        {label}
      </div>
      <div className="mt-1 text-2xl font-semibold">{value}</div>
    </Link>
  );
}
