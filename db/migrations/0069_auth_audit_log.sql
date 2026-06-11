-- 0069_auth_audit_log.sql
-- Audit sécurité B5 : journal d'authentification append-only.
--
-- CONTEXTE : jusqu'ici aucune trace des événements d'authentification
-- (connexion réussie/échouée, échec MFA, déconnexion, réinitialisation de mot
-- de passe). `session.ip_address`/`user_agent` étaient stockés mais jamais
-- exploités. Cette table comble le manque.
--
-- Table GLOBALE (pas de entreprise_id) : un événement auth précède le choix
-- d'entreprise, et un login échoué n'a pas de tenant.
--
-- IMMUABILITÉ : trigger BEFORE UPDATE OR DELETE → RAISE. BYPASSRLS ne contourne
-- PAS les triggers, donc l'append-only vaut AUSSI pour app_admin. (Un superuser
-- peut désactiver les triggers en dernier recours d'exploitation.)
--
-- VERROUILLAGE D'ACCÈS : RLS ENABLE + FORCE sans AUCUNE policy → tout rôle
-- non-BYPASSRLS (app_rw) est refusé. Seul app_admin (BYPASSRLS, via getDbAdmin)
-- lit/écrit ce journal — c'est exactement le chemin de `lib/auth/audit.ts`.
--
-- ⚠️ Appliquer en tant que membre d'app_admin / superuser (erpbtp) à cause de
--    l'ALTER TABLE ... OWNER TO app_admin. Migration idempotente.

BEGIN;

CREATE TABLE IF NOT EXISTS auth_audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  -- login_success | login_failure | mfa_failure | logout | password_reset
  event TEXT NOT NULL,
  email TEXT,
  utilisateur_id TEXT REFERENCES utilisateurs(id) ON DELETE SET NULL,
  ip_address TEXT,
  user_agent TEXT,
  success BOOLEAN NOT NULL,
  metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_auth_audit_log_created ON auth_audit_log (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_auth_audit_log_event ON auth_audit_log (event, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_auth_audit_log_email ON auth_audit_log (email, created_at DESC);

-- ── Immuabilité (append-only) ───────────────────────────────────────────────
CREATE OR REPLACE FUNCTION auth_audit_log_immutable()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'auth_audit_log est append-only : UPDATE/DELETE interdit.';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_auth_audit_log_immutable ON auth_audit_log;
CREATE TRIGGER trg_auth_audit_log_immutable
  BEFORE UPDATE OR DELETE ON auth_audit_log
  FOR EACH ROW EXECUTE FUNCTION auth_audit_log_immutable();

-- ── Verrouillage d'accès : réservé à app_admin (BYPASSRLS) ──────────────────
ALTER TABLE auth_audit_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE auth_audit_log FORCE ROW LEVEL SECURITY;
-- Aucune policy → deny par défaut pour app_rw. Propriété à app_admin pour que
-- getDbAdmin (app_admin) ait INSERT/SELECT ; on retire tout reste à app_rw.
ALTER TABLE auth_audit_log OWNER TO app_admin;
REVOKE ALL ON auth_audit_log FROM app_rw;

COMMENT ON TABLE auth_audit_log IS
  'Journal d''authentification append-only (B5) : login OK/KO, échec MFA, '
  'déconnexion, reset mot de passe. Global (pas de tenant). Écrit/lu via '
  'app_admin (getDbAdmin). Immuable (trigger).';

COMMIT;
