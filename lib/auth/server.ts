import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { magicLink, twoFactor } from 'better-auth/plugins';
import { eq } from 'drizzle-orm';
import { createTransport } from 'nodemailer';

import { db } from '@/lib/db/client';
import {
  account,
  session,
  twoFactor as twoFactorTable,
  user,
  verification,
} from '@/db/schema/auth';
import { roles } from '@/db/schema/rbac';
import { utilisateurs } from '@/db/schema/utilisateurs';

import { peutEnvoyerLienMagique } from './magic-link-policy';
import { AUTH_RATE_LIMIT_RULES } from './rate-limit-rules';

const transporter = createTransport({
  host: process.env.SMTP_HOST,
  port: Number(process.env.SMTP_PORT ?? 1025),
  secure: false,
  auth:
    process.env.SMTP_USER && process.env.SMTP_PASSWORD
      ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASSWORD }
      : undefined,
});

async function sendMail(to: string, subject: string, text: string) {
  await transporter.sendMail({
    from: process.env.SMTP_FROM ?? 'no-reply@erp-btp.local',
    to,
    subject,
    text,
  });
}

export const auth = betterAuth({
  baseURL: process.env.BETTER_AUTH_URL,
  secret: process.env.BETTER_AUTH_SECRET,
  // Origines acceptées par les endpoints sensibles (protège CSRF).
  // En dev on accepte localhost ET 127.0.0.1 + le port 3001/3002 au cas où
  // Next.js prend un autre port quand 3000 est occupé.
  trustedOrigins: [
    'http://localhost:3000',
    'http://127.0.0.1:3000',
    'http://localhost:3001',
    'http://127.0.0.1:3001',
  ],
  // Rate-limiting des endpoints /api/auth (audit sécurité B2). Actif en
  // production uniquement (off en dev/test pour ne pas pénaliser la DX ni la
  // suite e2e qui tourne sur `pnpm dev`). Stockage en mémoire par défaut
  // (par instance, remis à zéro au redémarrage) : suffisant pour un déploiement
  // mono-instance ; passer en `storage: 'database'` ou un secondaryStorage
  // (Redis) pour du multi-instance. La protection anti-DoS de l'API applicative
  // globale (hors /api/auth) relève du reverse-proxy (nginx/Caddy), pas d'ici.
  rateLimit: {
    enabled: process.env.NODE_ENV === 'production',
    window: 60,
    max: 100,
    // Complète les règles par défaut de better-auth (qui couvrent déjà
    // /sign-in*, /sign-up*, /forget-password*) par des limites strictes sur la
    // vérification du second facteur — cf. lib/auth/rate-limit-rules.ts.
    customRules: AUTH_RATE_LIMIT_RULES,
  },
  database: drizzleAdapter(db, {
    provider: 'pg',
    schema: { user, session, account, verification, twoFactor: twoFactorTable },
  }),
  emailAndPassword: {
    enabled: true,
    // Pas d'auto-inscription publique : sur cet ERP B2B les comptes sont
    // provisionnés (console super-admin lors de la création d'entreprise =
    // insert direct dans `user`, non soumis à ce flag). L'endpoint
    // `/sign-up/email` reste donc fermé au public — cf. /signup qui redirige
    // vers /login. Le magic link n'auto-inscrit pas non plus
    // (cf. lib/auth/magic-link-policy.ts).
    disableSignUp: true,
    requireEmailVerification: true,
    minPasswordLength: 12,
    // Réinitialisation de mot de passe (audit sécurité B4). Le lien `url`
    // pointe vers l'endpoint better-auth qui valide le token puis redirige vers
    // /reset-password?token=…. AUCUN auto-sign-in n'est déclenché par le reset :
    // l'utilisateur se reconnecte ensuite (mot de passe + TOTP si MFA) → le
    // reset NE contourne PAS le second facteur (contrairement au lien magique,
    // d'où l'intérêt de ce flow pour récupérer un compte MFA).
    sendResetPassword: async ({ user, url }) => {
      await sendMail(
        user.email,
        'Réinitialisation de votre mot de passe — ERP BTP',
        `Bonjour,\n\nVous avez demandé la réinitialisation de votre mot de passe. ` +
          `Cliquez sur ce lien (expire dans 1 heure) :\n${url}\n\n` +
          `Si vous n'êtes pas à l'origine de cette demande, ignorez ce message : ` +
          `votre mot de passe reste inchangé.`,
      );
    },
  },
  emailVerification: {
    sendOnSignUp: true,
    autoSignInAfterVerification: true,
    sendVerificationEmail: async ({ user, url }) => {
      await sendMail(
        user.email,
        'Vérification de votre adresse — ERP BTP',
        `Bonjour,\n\nMerci de confirmer votre adresse en cliquant sur le lien suivant :\n${url}\n\nCe lien expire dans 1 heure.`,
      );
    },
  },
  plugins: [
    twoFactor(),
    magicLink({
      sendMagicLink: async ({ email, url }) => {
        // Sécurité (cf. lib/auth/magic-link-policy.ts) : un lien magique ouvre
        // une session complète à partir du seul email. On ne l'envoie donc que
        // si le compte existe ET n'a pas la MFA activée — sinon le lien
        // contournerait le second facteur, ou permettrait une auto-inscription.
        const [compte] = await db
          .select({ twoFactorEnabled: user.twoFactorEnabled })
          .from(user)
          .where(eq(user.email, email))
          .limit(1);
        // Anti-énumération : on n'indique jamais au client qu'aucun mail n'a
        // été envoyé — l'UI affiche toujours « lien envoyé ».
        if (!peutEnvoyerLienMagique(compte)) return;
        await sendMail(
          email,
          'Ton lien de connexion — ERP BTP',
          `Bonjour,\n\nClique sur ce lien pour te connecter (expire dans 5 minutes) :\n${url}\n\nSi tu n'as pas demandé ce lien, ignore ce message.`,
        );
      },
    }),
  ],
  databaseHooks: {
    user: {
      create: {
        after: async (newUser) => {
          const [roleParDefaut] = await db
            .select({ id: roles.id })
            .from(roles)
            .where(eq(roles.code, 'lecture_seule'))
            .limit(1);
          if (!roleParDefaut) {
            throw new Error(
              'Rôle par défaut "lecture_seule" introuvable. Migration 0021_rbac_granulaire appliquée ?',
            );
          }
          await db
            .insert(utilisateurs)
            .values({ id: newUser.id, email: newUser.email, roleId: roleParDefaut.id })
            .onConflictDoNothing();
        },
      },
      update: {
        after: async (updatedUser) => {
          await db
            .update(utilisateurs)
            .set({ email: updatedUser.email, updatedAt: new Date() })
            .where(eq(utilisateurs.id, updatedUser.id));
        },
      },
    },
    session: {
      create: {
        after: async (newSession) => {
          await db
            .update(utilisateurs)
            .set({ derniereConnexionAt: new Date() })
            .where(eq(utilisateurs.id, newSession.userId));
        },
      },
    },
  },
});

export type Auth = typeof auth;
