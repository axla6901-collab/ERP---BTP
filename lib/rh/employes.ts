'use server';

import { and, asc, count, eq, isNull } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';

import { auditLogIn } from '@/lib/audit/log';
import { requireTenantContextWithMfa } from '@/lib/auth/tenant-guards';
import { withTenant } from '@/lib/db/with-tenant';
import { messageBlocageSuppression } from '@/lib/common/references-suppression';
import { employes, type Employe } from '@/db/schema/employes';
import { pointages } from '@/db/schema/pointages';
import { employeSchema, type EmployeInput } from '@/lib/validation/rh';

import { ROLES_RH_WRITE } from './permissions';
import type { ActionResult } from '@/lib/catalogue/types';

export async function listerEmployes(): Promise<Employe[]> {
  const ctx = await requireTenantContextWithMfa();
  return withTenant(ctx.entreprise.id, (tx) =>
    tx
      .select()
      .from(employes)
      .where(isNull(employes.deletedAt))
      .orderBy(asc(employes.nom), asc(employes.prenom)),
  );
}

export async function listerEmployesActifs(): Promise<Employe[]> {
  const ctx = await requireTenantContextWithMfa();
  return withTenant(ctx.entreprise.id, (tx) =>
    tx
      .select()
      .from(employes)
      .where(and(isNull(employes.deletedAt), eq(employes.actif, true)))
      .orderBy(asc(employes.nom), asc(employes.prenom)),
  );
}

export async function lireEmploye(id: string): Promise<Employe | null> {
  const ctx = await requireTenantContextWithMfa();
  const [row] = await withTenant(ctx.entreprise.id, (tx) =>
    tx
      .select()
      .from(employes)
      .where(and(eq(employes.id, id), isNull(employes.deletedAt)))
      .limit(1),
  );
  return row ?? null;
}

function buildValues(
  parsed: EmployeInput,
): Omit<typeof employes.$inferInsert, 'createdBy' | 'updatedBy' | 'entrepriseId'> {
  return {
    nom: parsed.nom,
    prenom: parsed.prenom,
    typeContrat: parsed.typeContrat,
    societeInterim: parsed.societeInterim,
    qualification: parsed.qualification,
    tauxHoraireBrut: parsed.tauxHoraireBrut,
    heuresHebdoContractuelles: parsed.heuresHebdoContractuelles,
    zoneDeplacementDefaut: parsed.zoneDeplacementDefaut,
    dateEntree: parsed.dateEntree,
    dateSortie: parsed.dateSortie,
    email: parsed.email,
    telephoneMobile: parsed.telephoneMobile,
    telephoneFixe: parsed.telephoneFixe,
    actif: parsed.actif,
    utilisateurId: parsed.utilisateurId,
    notes: parsed.notes,
    dateNaissance: parsed.dateNaissance,
    lieuNaissance: parsed.lieuNaissance,
    nationalite: parsed.nationalite,
    numeroSecu: parsed.numeroSecu,
    sexe: parsed.sexe,
    adresseLigne1: parsed.adresseLigne1,
    adresseLigne2: parsed.adresseLigne2,
    codePostal: parsed.codePostal,
    ville: parsed.ville,
    pays: parsed.pays,
    contactUrgenceNom: parsed.contactUrgenceNom,
    contactUrgenceTelephone: parsed.contactUrgenceTelephone,
    contactUrgenceRelation: parsed.contactUrgenceRelation,
    situationFamiliale: parsed.situationFamiliale,
    nombreEnfants: parsed.nombreEnfants,
    matricule: parsed.matricule,
    dateEmbauche: parsed.dateEmbauche,
    dateFinContrat: parsed.dateFinContrat,
    coefficientHierarchique: parsed.coefficientHierarchique,
    classification: parsed.classification,
    salaireMensuelBrut: parsed.salaireMensuelBrut,
    conventionCollective: parsed.conventionCollective,
    iban: parsed.iban,
    bic: parsed.bic,
    dateDerniereVisiteMedicale: parsed.dateDerniereVisiteMedicale,
    dateProchaineVisiteMedicale: parsed.dateProchaineVisiteMedicale,
    aptitude: parsed.aptitude,
    numeroCarteBtp: parsed.numeroCarteBtp,
    dateValiditeCarteBtp: parsed.dateValiditeCarteBtp,
  };
}

export async function creerEmploye(input: EmployeInput): Promise<ActionResult<{ id: string }>> {
  const ctx = await requireTenantContextWithMfa(ROLES_RH_WRITE);
  const parsed = employeSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: 'Données invalides.',
      fieldErrors: parsed.error.flatten().fieldErrors as Record<string, string[]>,
    };
  }
  try {
    const id = await withTenant(ctx.entreprise.id, async (tx) => {
      const [inserted] = await tx
        .insert(employes)
        .values({
          ...buildValues(parsed.data),
          entrepriseId: ctx.entreprise.id,
          createdBy: ctx.utilisateur.id,
          updatedBy: ctx.utilisateur.id,
        })
        .returning({ id: employes.id });
      if (!inserted) throw new Error('INSERT failed');
      await auditLogIn(tx, {
        action: 'insert',
        tableName: 'employes',
        rowId: inserted.id,
        after: parsed.data,
      });
      return inserted.id;
    });
    revalidatePath(`/${ctx.entreprise.slug}/rh/employes`);
    revalidatePath(`/${ctx.entreprise.slug}/rh`);
    return { ok: true, data: { id } };
  } catch (err) {
    if (err instanceof Error && /unique/i.test(err.message)) {
      return { ok: false, error: 'Matricule déjà utilisé par un autre employé.' };
    }
    throw err;
  }
}

export async function mettreAJourEmploye(id: string, input: EmployeInput): Promise<ActionResult> {
  const ctx = await requireTenantContextWithMfa(ROLES_RH_WRITE);
  const parsed = employeSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: 'Données invalides.',
      fieldErrors: parsed.error.flatten().fieldErrors as Record<string, string[]>,
    };
  }
  try {
    await withTenant(ctx.entreprise.id, async (tx) => {
      const [before] = await tx
        .select()
        .from(employes)
        .where(and(eq(employes.id, id), isNull(employes.deletedAt)));
      if (!before) throw new Error('NOT_FOUND');
      await tx
        .update(employes)
        .set({ ...buildValues(parsed.data), updatedBy: ctx.utilisateur.id })
        .where(eq(employes.id, id));
      await auditLogIn(tx, {
        action: 'update',
        tableName: 'employes',
        rowId: id,
        before,
        after: parsed.data,
      });
    });
    revalidatePath(`/${ctx.entreprise.slug}/rh/employes`);
    revalidatePath(`/${ctx.entreprise.slug}/rh/employes/${id}`);
    return { ok: true, data: undefined };
  } catch (err) {
    if (err instanceof Error && err.message === 'NOT_FOUND') {
      return { ok: false, error: 'Employé introuvable.' };
    }
    if (err instanceof Error && /unique/i.test(err.message)) {
      return { ok: false, error: 'Matricule déjà utilisé par un autre employé.' };
    }
    throw err;
  }
}

export async function supprimerEmploye(id: string): Promise<ActionResult> {
  const ctx = await requireTenantContextWithMfa(ROLES_RH_WRITE);
  // Soft-delete : pas de FK déclenchée → on bloque si des pointages existent.
  // Habilitations, permis et documents sont en cascade et ne comptent pas.
  const blocage = await withTenant(ctx.entreprise.id, async (tx) => {
    const [before] = await tx
      .select()
      .from(employes)
      .where(and(eq(employes.id, id), isNull(employes.deletedAt)));
    if (!before) return null;

    const [rPointages] = await tx
      .select({ n: count() })
      .from(pointages)
      .where(eq(pointages.employeId, id));
    const message = messageBlocageSuppression('cet employé', [
      { nombre: rPointages?.n ?? 0, singulier: 'pointage', pluriel: 'pointages' },
    ]);
    if (message) return message;

    await tx
      .update(employes)
      .set({ deletedAt: new Date(), actif: false, updatedBy: ctx.utilisateur.id })
      .where(eq(employes.id, id));
    await auditLogIn(tx, {
      action: 'delete',
      tableName: 'employes',
      rowId: id,
      before,
    });
    return null;
  });

  if (blocage) return { ok: false, error: blocage };
  revalidatePath(`/${ctx.entreprise.slug}/rh/employes`);
  return { ok: true, data: undefined };
}
