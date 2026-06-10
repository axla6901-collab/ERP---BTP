import '@testing-library/jest-dom/vitest';

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

const pushMock = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: pushMock, refresh: vi.fn(), prefetch: vi.fn() }),
}));

import { DataTable, type DataTableColumn } from '@/components/ui/data-table';

type Row = { id: string; nom: string };

function rows(): Row[] {
  return [
    { id: 'a', nom: 'Alpha' },
    { id: 'b', nom: 'Beta' },
  ];
}

function columns(): DataTableColumn<Row>[] {
  return [
    {
      id: 'nom',
      header: 'Nom',
      cell: (r) => <span>{r.nom}</span>,
      sortAccessor: (r) => r.nom,
      searchAccessor: (r) => r.nom,
    },
    {
      id: 'actions',
      header: 'Actions',
      cell: (r) => (
        <button type="button" onClick={() => pushMock(`action:${r.id}`)}>
          Action {r.id}
        </button>
      ),
    },
  ];
}

afterEach(() => {
  cleanup();
  pushMock.mockReset();
});

/** Récupère les lignes de données (saute la ligne d'en-tête). */
function dataRows(): HTMLElement[] {
  return screen.getAllByRole('row').slice(1);
}

describe('DataTable — lignes cliquables (rowHref)', () => {
  it('sans rowHref : ligne non-focusable et sans cursor-pointer', () => {
    render(<DataTable columns={columns()} rows={rows()} rowKey={(r) => r.id} />);
    const rows0 = dataRows();
    expect(rows0).toHaveLength(2);
    expect(rows0[0]).not.toHaveAttribute('tabIndex');
    expect(rows0[0]).not.toHaveClass('cursor-pointer');
  });

  it('avec rowHref : ligne focusable, cursor-pointer, navigue au clic', () => {
    render(
      <DataTable
        columns={columns()}
        rows={rows()}
        rowKey={(r) => r.id}
        rowHref={(r) => `/x/${r.id}`}
      />,
    );

    const rows0 = dataRows();
    expect(rows0[0]).toHaveClass('cursor-pointer');
    expect(rows0[0]).toHaveAttribute('tabIndex', '0');

    fireEvent.click(rows0[0]!);
    expect(pushMock).toHaveBeenCalledWith('/x/a');
  });

  it('clic sur un bouton interne ne déclenche pas la navigation ligne', () => {
    render(
      <DataTable
        columns={columns()}
        rows={rows()}
        rowKey={(r) => r.id}
        rowHref={(r) => `/x/${r.id}`}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Action a' }));
    // Seul le onClick interne du bouton a tiré (push('action:a')),
    // PAS de navigation ligne (push('/x/a')).
    expect(pushMock).toHaveBeenCalledTimes(1);
    expect(pushMock).toHaveBeenCalledWith('action:a');
  });

  it('Ctrl+clic : ouvre dans un nouvel onglet via window.open (pas de router.push)', () => {
    const openSpy = vi.spyOn(window, 'open').mockImplementation(() => null);

    render(
      <DataTable
        columns={columns()}
        rows={rows()}
        rowKey={(r) => r.id}
        rowHref={(r) => `/x/${r.id}`}
      />,
    );

    fireEvent.click(dataRows()[0]!, { ctrlKey: true });

    expect(openSpy).toHaveBeenCalledWith('/x/a', '_blank', 'noopener,noreferrer');
    expect(pushMock).not.toHaveBeenCalled();
    openSpy.mockRestore();
  });

  it('touche Enter sur la ligne focusée : navigue', () => {
    render(
      <DataTable
        columns={columns()}
        rows={rows()}
        rowKey={(r) => r.id}
        rowHref={(r) => `/x/${r.id}`}
      />,
    );

    fireEvent.keyDown(dataRows()[0]!, { key: 'Enter' });
    expect(pushMock).toHaveBeenCalledWith('/x/a');
  });

  it("touche Enter depuis un bouton interne : n'intercepte pas (e.target ≠ ligne)", () => {
    render(
      <DataTable
        columns={columns()}
        rows={rows()}
        rowKey={(r) => r.id}
        rowHref={(r) => `/x/${r.id}`}
      />,
    );

    const btn = screen.getByRole('button', { name: 'Action a' });
    fireEvent.keyDown(btn, { key: 'Enter' });
    // Le handler ligne ignore (e.target !== e.currentTarget). Aucune nav ligne.
    expect(pushMock).not.toHaveBeenCalledWith('/x/a');
  });
});

describe('DataTable — rowClassName (lignes contextuelles)', () => {
  it('applique la classe à la ligne ciblée uniquement', () => {
    render(
      <DataTable
        columns={columns()}
        rows={rows()}
        rowKey={(r) => r.id}
        rowClassName={(r) => (r.id === 'a' ? 'bg-amber-50/40' : undefined)}
      />,
    );
    const rows0 = dataRows();
    expect(rows0[0]).toHaveClass('bg-amber-50/40');
    expect(rows0[1]).not.toHaveClass('bg-amber-50/40');
  });

  it('cumule rowClassName et cursor-pointer quand rowHref est fourni', () => {
    render(
      <DataTable
        columns={columns()}
        rows={rows()}
        rowKey={(r) => r.id}
        rowHref={(r) => `/x/${r.id}`}
        rowClassName={() => 'bg-rose-50/30'}
      />,
    );
    const row0 = dataRows()[0]!;
    expect(row0).toHaveClass('cursor-pointer');
    expect(row0).toHaveClass('bg-rose-50/30');
  });

  it('sans rowClassName ni rowHref : pas de classe d’état (comportement inchangé)', () => {
    render(<DataTable columns={columns()} rows={rows()} rowKey={(r) => r.id} />);
    const row0 = dataRows()[0]!;
    expect(row0).not.toHaveClass('cursor-pointer');
    expect(row0).not.toHaveClass('bg-amber-50/40');
  });
});
