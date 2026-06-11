/**
 * Helpers pour interroger Mailpit (capture SMTP local) depuis les tests E2E.
 * Voir docker-compose.yml service `mailpit` (port 8025).
 */

const MAILPIT_BASE = process.env.MAILPIT_URL ?? 'http://localhost:8025';

type MailpitMessage = {
  ID: string;
  From: { Address: string; Name: string };
  To: { Address: string; Name: string }[];
  Subject: string;
  Created: string;
};

type MailpitMessageList = {
  total: number;
  messages: MailpitMessage[];
};

type MailpitMessageBody = {
  ID: string;
  Text: string;
  HTML: string;
  Subject: string;
};

/**
 * Vide la boîte Mailpit (utile en `beforeAll` pour éviter le mélange entre runs).
 */
export async function clearMailpit(): Promise<void> {
  const res = await fetch(`${MAILPIT_BASE}/api/v1/messages`, { method: 'DELETE' });
  if (!res.ok) {
    throw new Error(`Mailpit clear failed: ${res.status}`);
  }
}

/**
 * Cherche, parmi les messages reçus, celui destiné à `to` (le plus récent),
 * en faisant un polling jusqu'à `timeoutMs`. Lève si non trouvé.
 */
export async function waitForMail(to: string, timeoutMs = 15000): Promise<MailpitMessageBody> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const list = (await fetch(`${MAILPIT_BASE}/api/v1/messages`).then((r) =>
      r.json(),
    )) as MailpitMessageList;
    const match = list.messages.find((m) =>
      m.To.some((t) => t.Address.toLowerCase() === to.toLowerCase()),
    );
    if (match) {
      return (await fetch(`${MAILPIT_BASE}/api/v1/message/${match.ID}`).then((r) =>
        r.json(),
      )) as MailpitMessageBody;
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`Mailpit: aucun message reçu pour ${to} dans les ${timeoutMs}ms`);
}

/**
 * Extrait la première URL `/api/auth/...` trouvée dans le body texte d'un email.
 * Utilisé pour les liens de vérification email et les magic links.
 */
export function extractAuthLink(body: MailpitMessageBody): string {
  const match = body.Text.match(/https?:\/\/[^\s]*\/api\/auth\/[^\s]+/);
  if (!match) {
    throw new Error(`Aucun lien /api/auth/... trouvé dans le body :\n${body.Text}`);
  }
  return match[0];
}
