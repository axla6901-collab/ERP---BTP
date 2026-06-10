import { and, eq, isNull } from 'drizzle-orm';
import { redirect } from 'next/navigation';

import { EntrepriseConditionsSection } from '@/components/admin/entreprise-conditions-section';
import { EntrepriseIdentiteForm } from '@/components/admin/entreprise-identite-form';
import { EntrepriseLogosSection } from '@/components/admin/entreprise-logos-section';
import { EntreprisePlanningToggle } from '@/components/admin/entreprise-planning-toggle';
import { EntrepriseCompteProrataToggle } from '@/components/admin/entreprise-compte-prorata-toggle';
import { NumerotationForm } from '@/components/admin/numerotation-form';
import { TiersReferencementToggle } from '@/components/referencement/tiers-referencement-toggle';
import { setPlanningActive } from '@/lib/planning/planning';
import { setCompteProrataActive } from '@/lib/chantiers/compte-prorata-actions';
import { setTiersReferencementActive } from '@/lib/referencement/activation';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { entreprises } from '@/db/schema/entreprises';
import {
  creerVersionConditions,
  lireVersionConditions,
  listerLogos,
  listerVersionsConditions,
  mettreAJourIdentiteEntreprise,
  renommerLogo,
  supprimerLogo,
  supprimerVersionConditions,
  uploadLogo,
} from '@/lib/admin/entreprise';
import { peutAdministrer } from '@/lib/admin/permissions';
import { requireTenantContext } from '@/lib/auth/tenant-guards';
// eslint-disable-next-line no-restricted-imports -- lecture du registre entreprises (table globale, pas de RLS tenant)
import { db } from '@/lib/db/client';
import {
  listerModelesNumerotation,
  mettreAJourModeleNumerotation,
  reinitialiserModeleNumerotation,
} from '@/lib/numerotation/modeles';
import type {
  ConditionNouvelleVersionInput,
  EntrepriseIdentiteInput,
} from '@/lib/validation/entreprise';

export const dynamic = 'force-dynamic';

export default async function EntreprisePage() {
  const ctx = await requireTenantContext();
  if (!peutAdministrer(ctx.utilisateur.role)) redirect('/');

  const [identite, logos, versionsCgv, versionsCga, modelesNumerotation] = await Promise.all([
    db
      .select({
        raisonSociale: entreprises.raisonSociale,
        siret: entreprises.siret,
        tvaIntracom: entreprises.tvaIntracom,
        adresseLigne1: entreprises.adresseLigne1,
        adresseLigne2: entreprises.adresseLigne2,
        codePostal: entreprises.codePostal,
        ville: entreprises.ville,
        pays: entreprises.pays,
        iban: entreprises.iban,
        bic: entreprises.bic,
        rcs: entreprises.rcs,
        formeJuridique: entreprises.formeJuridique,
        capitalSocial: entreprises.capitalSocial,
        codeApe: entreprises.codeApe,
      })
      .from(entreprises)
      .where(and(eq(entreprises.id, ctx.entreprise.id), isNull(entreprises.deletedAt)))
      .limit(1)
      .then((rows) => rows[0] ?? null),
    listerLogos(),
    listerVersionsConditions('cgv'),
    listerVersionsConditions('cga'),
    listerModelesNumerotation(),
  ]);

  if (!identite) redirect('/select-entreprise');

  const logoPrincipal = logos.find((l) => l.type === 'principal') ?? null;
  const certifications = logos.filter((l) => l.type === 'certification');

  const identiteDefaults: EntrepriseIdentiteInput = {
    raisonSociale: identite.raisonSociale,
    siret: identite.siret,
    tvaIntracom: identite.tvaIntracom,
    adresseLigne1: identite.adresseLigne1,
    adresseLigne2: identite.adresseLigne2,
    codePostal: identite.codePostal,
    ville: identite.ville,
    pays: identite.pays,
    iban: identite.iban,
    bic: identite.bic,
    rcs: identite.rcs,
    formeJuridique: identite.formeJuridique,
    capitalSocial: identite.capitalSocial,
    codeApe: identite.codeApe,
  };

  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <h2 className="text-xl font-medium">{ctx.entreprise.raisonSociale}</h2>
        <p className="text-sm text-muted-foreground">
          Paramètres de la société : identité légale, logos affichés sur les documents,
          Conditions Générales de Vente et d&apos;Achat versionnées, numérotation des
          documents émis.
        </p>
      </header>

      <Card>
        <CardHeader>
          <CardTitle>Identité légale</CardTitle>
          <CardDescription>
            Informations affichées en entête des devis, factures et documents officiels.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <EntrepriseIdentiteForm
            defaultValues={identiteDefaults}
            onSubmit={async (values) => {
              'use server';
              return mettreAJourIdentiteEntreprise(values);
            }}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Modules optionnels</CardTitle>
          <CardDescription>
            Activez ou désactivez les modules complémentaires selon les besoins de la société.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <EntreprisePlanningToggle
            initialActif={ctx.entreprise.planningActive}
            onToggle={async (actif) => {
              'use server';
              const result = await setPlanningActive({ actif });
              return result.ok ? { ok: true } : { ok: false, error: result.error };
            }}
          />
          <TiersReferencementToggle
            initialActif={ctx.entreprise.tiersReferencementActive}
            onToggle={async (actif) => {
              'use server';
              const result = await setTiersReferencementActive({ actif });
              return result.ok ? { ok: true } : { ok: false, error: result.error };
            }}
          />
          <EntrepriseCompteProrataToggle
            initialActif={ctx.entreprise.compteProrataActive}
            onToggle={async (actif) => {
              'use server';
              const result = await setCompteProrataActive({ actif });
              return result.ok ? { ok: true } : { ok: false, error: result.error };
            }}
          />
        </CardContent>
      </Card>

      <section className="space-y-3">
        <h3 className="text-lg font-medium">Logos &amp; certifications</h3>
        <EntrepriseLogosSection
          logoPrincipal={logoPrincipal}
          certifications={certifications}
          onUpload={async (formData) => {
            'use server';
            const result = await uploadLogo(formData);
            return result.ok ? { ok: true } : { ok: false, error: result.error };
          }}
          onRenommer={async (id, libelle) => {
            'use server';
            const result = await renommerLogo(id, { libelle });
            return result.ok ? { ok: true } : { ok: false, error: result.error };
          }}
          onSupprimer={async (id) => {
            'use server';
            const result = await supprimerLogo(id);
            return result.ok ? { ok: true } : { ok: false, error: result.error };
          }}
        />
      </section>

      <section className="space-y-3">
        <h3 className="text-lg font-medium">Conditions Générales</h3>
        <EntrepriseConditionsSection
          versionsCgv={versionsCgv}
          versionsCga={versionsCga}
          onLireVersion={async (id) => {
            'use server';
            const row = await lireVersionConditions(id);
            return row ? { contenuHtml: row.contenuHtml } : null;
          }}
          onCreerVersion={async (input: ConditionNouvelleVersionInput) => {
            'use server';
            const result = await creerVersionConditions(input);
            return result.ok
              ? { ok: true, data: result.data }
              : { ok: false, error: result.error };
          }}
          onSupprimerVersion={async (id) => {
            'use server';
            const result = await supprimerVersionConditions(id);
            return result.ok ? { ok: true } : { ok: false, error: result.error };
          }}
        />
      </section>

      <section className="space-y-3">
        <h3 className="text-lg font-medium">Numérotation des documents</h3>
        <Alert>
          <AlertDescription>
            Chaque type de document (devis, facture, avoir, …) reçoit un numéro
            généré automatiquement à la création. Tu peux personnaliser le format
            avec un template et choisir explicitement la cadence de reset du
            compteur (annuelle, mensuelle, quotidienne ou sans reset). Les
            numéros déjà attribués restent intangibles (registre fiscal
            append-only).
          </AlertDescription>
        </Alert>
        <NumerotationForm
          modeles={modelesNumerotation}
          onEnregistrer={async (input) => {
            'use server';
            return mettreAJourModeleNumerotation(input);
          }}
          onReinitialiser={async (typeDoc) => {
            'use server';
            return reinitialiserModeleNumerotation(typeDoc);
          }}
        />
      </section>
    </div>
  );
}
