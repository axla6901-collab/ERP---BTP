import { createAuthClient } from 'better-auth/react';
import { magicLinkClient, twoFactorClient } from 'better-auth/client/plugins';

export const authClient = createAuthClient({
  baseURL: process.env.NEXT_PUBLIC_APP_URL,
  plugins: [twoFactorClient(), magicLinkClient()],
});

export const { signIn, signUp, signOut, useSession, getSession } = authClient;
