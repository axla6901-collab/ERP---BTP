import { DatabaseIcon } from 'lucide-react';

import { introspectMcd } from '@/lib/admin/mcd-introspect';

import { McdViewer } from './mcd-viewer';

// Le layout /admin lit les cookies (requireSuperAdmin) : la route DOIT être
// dynamique. 'force-static' ferait renvoyer cookies()/headers() vides → la
// garde verrait « pas de session » et redirigerait vers /login à chaque appel.
// L'introspection (introspectMcd) est du pur JS en mémoire, donc sans coût.
export const dynamic = 'force-dynamic';

export default function McdPage() {
  const schema = introspectMcd();

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3">
        <DatabaseIcon className="size-6 text-primary" />
        <h1 className="text-2xl font-semibold">Modèle de données (MCD)</h1>
        <span className="ml-auto text-xs text-muted-foreground">
          {schema.tables.length} entités · {schema.relations.length} relations · généré à la volée
          depuis le schéma Drizzle
        </span>
      </div>
      <McdViewer schema={schema} />
    </div>
  );
}
