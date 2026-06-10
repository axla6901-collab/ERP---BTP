'use client';

import { AlertTriangleIcon } from 'lucide-react';
import { useRouter } from 'next/navigation';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useId,
  useRef,
  useState,
} from 'react';

import { Button } from '@/components/ui/button';

/**
 * Garde de navigation centralisée pour les formulaires non sauvegardés.
 *
 * Architecture :
 * - Un seul `<NavigationGuardProvider>` au-dessus du layout `(app)`.
 * - Chaque formulaire appelle `useUnsavedChangesGuard({ isDirty, onSave })`
 *   pour s'enregistrer. Le hook gère l'enregistrement/désenregistrement
 *   automatique.
 * - Les `<Link>` de navigation (sidebar) doivent passer par
 *   `useNavigationGuard().tryNavigate(action)` qui ouvre une boîte de
 *   dialogue 3 options si un formulaire est dirty.
 * - `beforeunload` est géré globalement par le provider.
 */

type RegisteredForm = {
  isDirty: () => boolean;
  onSave?: (() => Promise<boolean>) | undefined;
};

type NavigationGuardContext = {
  /** Tente une navigation : si aucun formulaire dirty, exécute immédiatement.
   *  Sinon, ouvre la dialog et exécute après confirmation utilisateur. */
  tryNavigate: (action: () => void) => void;
  /** Enregistre un formulaire surveillé. Retourne la fonction de cleanup. */
  register: (id: string, form: RegisteredForm) => () => void;
};

const Context = createContext<NavigationGuardContext | null>(null);

export function NavigationGuardProvider({ children }: { children: React.ReactNode }) {
  const formsRef = useRef<Map<string, RegisteredForm>>(new Map());
  const [pendingAction, setPendingAction] = useState<(() => void) | null>(null);
  const [enregistrementEnCours, setEnregistrementEnCours] = useState(false);
  const dialogRef = useRef<HTMLDialogElement>(null);

  const register = useCallback((id: string, form: RegisteredForm) => {
    formsRef.current.set(id, form);
    return () => {
      formsRef.current.delete(id);
    };
  }, []);

  const auMoinsUnFormDirty = useCallback(() => {
    for (const f of formsRef.current.values()) {
      if (f.isDirty()) return true;
    }
    return false;
  }, []);

  const tryNavigate = useCallback(
    (action: () => void) => {
      if (!auMoinsUnFormDirty()) {
        action();
        return;
      }
      setPendingAction(() => action);
    },
    [auMoinsUnFormDirty],
  );

  // Ouvre la dialog quand une action est en attente.
  useEffect(() => {
    const dlg = dialogRef.current;
    if (!dlg) return;
    if (pendingAction && !dlg.open) dlg.showModal();
    if (!pendingAction && dlg.open) dlg.close();
  }, [pendingAction]);

  // beforeunload natif global : refresh / tab close / hard navigation.
  useEffect(() => {
    function handler(e: BeforeUnloadEvent) {
      if (auMoinsUnFormDirty()) {
        e.preventDefault();
        e.returnValue = '';
      }
    }
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [auMoinsUnFormDirty]);

  function annuler() {
    setPendingAction(null);
  }

  function quitterSansEnregistrer() {
    const action = pendingAction;
    setPendingAction(null);
    // Vide tous les formulaires dirty pour que la navigation ne déclenche
    // pas immédiatement un autre tryNavigate via beforeunload (cas refresh).
    formsRef.current.clear();
    action?.();
  }

  async function enregistrerPuisNaviguer() {
    // Récupère le premier formulaire dirty avec un onSave fourni.
    let formAvecSave: RegisteredForm | undefined;
    for (const f of formsRef.current.values()) {
      if (f.isDirty() && f.onSave) {
        formAvecSave = f;
        break;
      }
    }
    if (!formAvecSave?.onSave) {
      // Pas de moyen d'enregistrer → on quitte quand même
      quitterSansEnregistrer();
      return;
    }
    setEnregistrementEnCours(true);
    try {
      const ok = await formAvecSave.onSave();
      if (!ok) return; // erreur de validation : on reste sur le form
      const action = pendingAction;
      setPendingAction(null);
      formsRef.current.clear();
      action?.();
    } finally {
      setEnregistrementEnCours(false);
    }
  }

  // Détecte si au moins un formulaire dirty a un onSave (pour griser le
  // bouton « Enregistrer » sinon).
  const peutEnregistrer = (() => {
    for (const f of formsRef.current.values()) {
      if (f.isDirty() && f.onSave) return true;
    }
    return false;
  })();

  return (
    <Context.Provider value={{ tryNavigate, register }}>
      {children}
      <dialog
        ref={dialogRef}
        className="
          m-auto bg-transparent p-0
          backdrop:bg-black/50 backdrop:backdrop-blur-sm
          open:animate-in open:fade-in-0 open:zoom-in-95 open:duration-150
          backdrop:animate-in backdrop:fade-in-0 backdrop:duration-150
        "
        onCancel={(e) => {
          e.preventDefault();
          annuler();
        }}
        onClose={() => {
          if (pendingAction) setPendingAction(null);
        }}
      >
        <div className="w-[min(92vw,32rem)] overflow-hidden rounded-xl border bg-background shadow-2xl">
          <div className="flex items-start gap-4 p-6">
            <div
              className="flex size-10 shrink-0 items-center justify-center rounded-full bg-amber-100 dark:bg-amber-950/40"
              aria-hidden
            >
              <AlertTriangleIcon className="size-5 text-amber-600 dark:text-amber-400" />
            </div>
            <div className="min-w-0 flex-1">
              <h2 className="text-base font-semibold leading-tight">
                Modifications non enregistrées
              </h2>
              <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
                Vous avez des modifications en cours sur ce formulaire.
                Souhaitez-vous les enregistrer avant de quitter cette page ?
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center justify-end gap-2 border-t bg-muted/30 px-6 py-3">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={annuler}
              disabled={enregistrementEnCours}
            >
              Annuler
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={quitterSansEnregistrer}
              disabled={enregistrementEnCours}
            >
              Quitter sans enregistrer
            </Button>
            {peutEnregistrer && (
              <Button
                type="button"
                size="sm"
                onClick={enregistrerPuisNaviguer}
                disabled={enregistrementEnCours}
              >
                {enregistrementEnCours ? 'Enregistrement…' : 'Enregistrer et quitter'}
              </Button>
            )}
          </div>
        </div>
      </dialog>
    </Context.Provider>
  );
}

export function useNavigationGuard() {
  const ctx = useContext(Context);
  if (!ctx) {
    throw new Error(
      'useNavigationGuard doit être utilisé sous <NavigationGuardProvider>',
    );
  }
  return ctx;
}

/**
 * Enregistre un formulaire auprès du provider. Pour les formulaires RHF :
 * ```ts
 * useUnsavedChangesGuard({
 *   isDirty: form.formState.isDirty,
 *   onSave: async () => {
 *     let ok = false;
 *     await form.handleSubmit(async (values) => {
 *       const r = await onSubmit(values);
 *       ok = r.ok ?? true;
 *     })();
 *     return ok;
 *   },
 * });
 * ```
 *
 * `onSave` est optionnel : sans lui, le dialog n'affiche pas le bouton
 * « Enregistrer », uniquement « Quitter sans enregistrer » / « Annuler ».
 */
export function useUnsavedChangesGuard({
  isDirty,
  onSave,
}: {
  isDirty: boolean;
  onSave?: () => Promise<boolean>;
}) {
  const id = useId();
  const ctx = useContext(Context);
  const isDirtyRef = useRef(isDirty);
  const onSaveRef = useRef(onSave);
  isDirtyRef.current = isDirty;
  onSaveRef.current = onSave;

  useEffect(() => {
    if (!ctx) return;
    const form: RegisteredForm = onSaveRef.current
      ? {
          isDirty: () => isDirtyRef.current,
          onSave: () => onSaveRef.current!(),
        }
      : { isDirty: () => isDirtyRef.current };
    return ctx.register(id, form);
  }, [ctx, id]);
}

/**
 * Composant wrapper pour navigation programmatique avec garde. Idéal pour
 * les `router.push()` et `router.back()` côté éditeurs.
 */
export function useGuardedRouter() {
  const router = useRouter();
  const { tryNavigate } = useNavigationGuard();
  return {
    push: (href: string) => tryNavigate(() => router.push(href)),
    replace: (href: string) => tryNavigate(() => router.replace(href)),
    back: () => tryNavigate(() => router.back()),
    refresh: () => router.refresh(),
  };
}
