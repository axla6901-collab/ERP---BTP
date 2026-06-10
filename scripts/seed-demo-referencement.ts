/**
 * scripts/seed-demo-referencement.ts
 *
 * Démo / vérification du module « Référencement des tiers » :
 *   1. Active le module pour l'entreprise `default`.
 *   2. Seede le référentiel documentaire par défaut (idempotent).
 *   3. Crée 2 tiers de démonstration avec documents (un à jour, un à relancer).
 *   4. Recalcule et affiche la conformité (preuve du chemin de données complet).
 *
 * Usage : pnpm tsx scripts/seed-demo-referencement.ts
 *
 * Script auto-contenu (ne dépend pas des modules `server-only`) : il ouvre sa
 * propre connexion app_rw et pose la GUC tenant manuellement (comme withTenant).
 */

import { config } from 'dotenv';
import { and, eq, isNull, sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';

import { entreprises } from '@/db/schema/entreprises';
import {
  corpsEtat,
  corpsEtatDocumentsRequis,
  naturesDocument,
} from '@/db/schema/referentiel-tiers';
import { tierCorpsEtat, tierDocuments, tiers } from '@/db/schema/tiers-registre';
import {
  evaluerConformiteTier,
  type DocumentLite,
  type MatriceLigne,
  type NatureDocLite,
} from '@/lib/referencement/conformite';
import {
  CORPS_ETAT_DEFAUT,
  MATRICE_REQUIS_DEFAUT,
  NATURES_DOCUMENT_DEFAUT,
} from '@/lib/referencement/referentiel-defaut';
import type { NatureTiers } from '@/lib/validation/referencement-tiers';

config({ path: '.env.local' });

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  console.error('❌ DATABASE_URL absent. Copier .env.example vers .env.local.');
  process.exit(1);
}

const today = new Date();
function iso(d: Date): string {
  return d.toISOString().slice(0, 10);
}
function plusJours(n: number): string {
  const d = new Date(today);
  d.setUTCDate(d.getUTCDate() + n);
  return iso(d);
}

async function main(dbUrl: string) {
  const client = postgres(dbUrl, { prepare: false });
  const db = drizzle(client, { casing: 'snake_case' });

  try {
    const [ent] = await db
      .select({ id: entreprises.id, slug: entreprises.slug })
      .from(entreprises)
      .where(eq(entreprises.slug, 'default'))
      .limit(1);
    if (!ent) throw new Error("Entreprise 'default' introuvable.");
    const entrepriseId = ent.id;

    await db
      .update(entreprises)
      .set({ tiersReferencementActive: true })
      .where(eq(entreprises.id, entrepriseId));
    console.log('✔ Module activé pour « default ».');

    await db.transaction(async (tx) => {
      await tx.execute(sql`SELECT set_config('app.current_entreprise_id', ${entrepriseId}, true)`);

      // 1. Seed référentiel (idempotent)
      const dejaSeede = await tx
        .select({ id: naturesDocument.id })
        .from(naturesDocument)
        .where(eq(naturesDocument.entrepriseId, entrepriseId))
        .limit(1);
      if (dejaSeede.length === 0) {
        await tx.insert(naturesDocument).values(
          NATURES_DOCUMENT_DEFAUT.map((n) => ({
            entrepriseId,
            code: n.code,
            libelle: n.libelle,
            modeControle: n.modeControle,
            delaiValiditeJours: n.delaiValiditeJours,
            delaiRelanceJours: n.delaiRelanceJours,
            ordreAffichage: n.ordre,
          })),
        );
        await tx.insert(corpsEtat).values(
          CORPS_ETAT_DEFAUT.map((c) => ({
            entrepriseId,
            code: c.code,
            libelle: c.libelle,
            ordreAffichage: c.ordre,
          })),
        );
        const nats = await tx
          .select({ id: naturesDocument.id, code: naturesDocument.code })
          .from(naturesDocument)
          .where(eq(naturesDocument.entrepriseId, entrepriseId));
        const corps = await tx
          .select({ id: corpsEtat.id, code: corpsEtat.code })
          .from(corpsEtat)
          .where(eq(corpsEtat.entrepriseId, entrepriseId));
        const natId = new Map(nats.map((n) => [n.code, n.id]));
        const corpsId = new Map(corps.map((c) => [c.code, c.id]));
        const lignes = MATRICE_REQUIS_DEFAUT.flatMap((m) =>
          m.natures.flatMap((nature) =>
            m.docs.flatMap((doc) => {
              const cid = corpsId.get(m.corps);
              const nid = natId.get(doc);
              return cid && nid
                ? [{ entrepriseId, corpsEtatId: cid, natureDocumentId: nid, natureTiers: nature, estBloquant: true }]
                : [];
            }),
          ),
        );
        await tx.insert(corpsEtatDocumentsRequis).values(lignes);
        console.log(`✔ Référentiel seedé (${NATURES_DOCUMENT_DEFAUT.length} natures, ${CORPS_ETAT_DEFAUT.length} corps d'état, ${lignes.length} correspondances).`);
      } else {
        console.log('• Référentiel déjà présent (seed ignoré).');
      }

      // Index référentiel pour les inserts + le calcul de conformité
      const nats = await tx.select().from(naturesDocument).where(isNull(naturesDocument.deletedAt));
      const [elec] = await tx
        .select({ id: corpsEtat.id })
        .from(corpsEtat)
        .where(and(eq(corpsEtat.code, 'ELECTRICITE'), isNull(corpsEtat.deletedAt)));
      const natByCode = new Map(nats.map((n) => [n.code, n]));

      // 2. Tiers de démo (idempotent par code)
      const DEMOS = [
        { code: 'ELEC-DEMO-AJOUR', nom: 'Démo Électricité (à jour)', email: 'ajour@demo.test', tousValides: true },
        { code: 'ELEC-DEMO-RELANCE', nom: 'Démo Électricité (à relancer)', email: 'relance@demo.test', tousValides: false },
      ];

      for (const demo of DEMOS) {
        const existe = await tx
          .select({ id: tiers.id })
          .from(tiers)
          .where(and(eq(tiers.code, demo.code), isNull(tiers.deletedAt)));
        if (existe.length > 0) {
          console.log(`• Tier ${demo.code} déjà présent (création ignorée).`);
          continue;
        }
        const [tier] = await tx
          .insert(tiers)
          .values({
            entrepriseId,
            code: demo.code,
            nom: demo.nom,
            natureTiers: 'artisan',
            email: demo.email,
            siret: demo.tousValides ? '11111111100011' : '22222222200022',
            statutAgrement: demo.tousValides ? 'agree' : 'en_attente_documents',
            dateAgrement: demo.tousValides ? plusJours(-100) : null,
          })
          .returning({ id: tiers.id });
        if (!tier || !elec) continue;
        await tx
          .insert(tierCorpsEtat)
          .values({ entrepriseId, tierId: tier.id, corpsEtatId: elec.id });

        // Documents requis pour ELECTRICITE/artisan : KBIS, URSSAF, RC, honneur, fiscale.
        const requis = ['KBIS', 'URSSAF', 'ASSURANCE_RC', 'ATTESTATION_HONNEUR', 'REGULARITE_FISCALE'];
        for (const code of requis) {
          const nat = natByCode.get(code);
          if (!nat) continue;
          if (demo.tousValides) {
            await tx.insert(tierDocuments).values({
              entrepriseId,
              tierId: tier.id,
              natureDocumentId: nat.id,
              nomFichierOrigine: `${code}.pdf`,
              statut: 'valide',
              dateObtention: plusJours(-30),
              dateFinValidite: plusJours(300),
            });
          } else {
            // KBIS valide, URSSAF expiré, RC bientôt expirée, les 2 autres manquants.
            if (code === 'KBIS') {
              await tx.insert(tierDocuments).values({
                entrepriseId, tierId: tier.id, natureDocumentId: nat.id,
                nomFichierOrigine: 'KBIS.pdf', statut: 'valide',
                dateObtention: plusJours(-30), dateFinValidite: plusJours(300),
              });
            } else if (code === 'URSSAF') {
              await tx.insert(tierDocuments).values({
                entrepriseId, tierId: tier.id, natureDocumentId: nat.id,
                nomFichierOrigine: 'URSSAF.pdf', statut: 'valide',
                dateObtention: plusJours(-120), dateFinValidite: plusJours(-15), // expiré
              });
            } else if (code === 'ASSURANCE_RC') {
              await tx.insert(tierDocuments).values({
                entrepriseId, tierId: tier.id, natureDocumentId: nat.id,
                nomFichierOrigine: 'RC.pdf', statut: 'valide',
                dateFinValidite: plusJours(5), // dans la fenêtre de relance (10 j)
              });
            }
            // honneur + fiscale : volontairement manquants
          }
        }
        console.log(`✔ Tier ${demo.code} créé.`);
      }

      // 3. Recalcule la conformité (preuve du chemin de données)
      const naturesById = new Map<string, NatureDocLite>(
        nats.map((n) => [
          n.id,
          { id: n.id, code: n.code, libelle: n.libelle, modeControle: n.modeControle, delaiValiditeJours: n.delaiValiditeJours, delaiRelanceJours: n.delaiRelanceJours },
        ]),
      );
      const matriceRows = await tx.select().from(corpsEtatDocumentsRequis);
      const matrice: MatriceLigne[] = matriceRows.map((m) => ({
        corpsEtatId: m.corpsEtatId,
        natureDocumentId: m.natureDocumentId,
        natureTiers: m.natureTiers as NatureTiers,
        estBloquant: m.estBloquant,
      }));
      const tousTiers = await tx.select().from(tiers).where(isNull(tiers.deletedAt));
      const liens = await tx.select().from(tierCorpsEtat);
      const docs = await tx
        .select({ tierId: tierDocuments.tierId, natureDocumentId: tierDocuments.natureDocumentId, statut: tierDocuments.statut, dateFinValidite: tierDocuments.dateFinValidite })
        .from(tierDocuments)
        .where(isNull(tierDocuments.deletedAt));

      console.log('\n=== Conformité calculée ===');
      for (const t of tousTiers) {
        const corpsIds = liens.filter((l) => l.tierId === t.id).map((l) => l.corpsEtatId);
        const docsTier = new Map<string, DocumentLite>();
        for (const d of docs.filter((d) => d.tierId === t.id)) {
          if (!docsTier.has(d.natureDocumentId)) {
            docsTier.set(d.natureDocumentId, { natureDocumentId: d.natureDocumentId, statut: d.statut, dateFinValidite: d.dateFinValidite });
          }
        }
        const conf = evaluerConformiteTier(
          { natureTiers: t.natureTiers as NatureTiers, corpsEtatIds: corpsIds },
          matrice, naturesById, docsTier, iso(today),
        );
        const detail = conf.lignes.map((l) => `${l.code}:${l.statut}`).join(', ');
        console.log(`  • ${t.nom} → ${conf.classe.toUpperCase()} (${conf.nbProblemes} pb) [${detail}]`);
      }
    });

    console.log('\n✅ Démo prête. Ouvrez /default/tiers/referencement (module activé).');
  } finally {
    await client.end();
  }
}

main(databaseUrl).catch((err) => {
  console.error('❌ Échec :', err);
  process.exit(1);
});
