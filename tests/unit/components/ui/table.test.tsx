import '@testing-library/jest-dom/vitest';

import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

afterEach(() => cleanup());

describe('Table (style maquette)', () => {
  it('TableHead = uppercase tracking-widest, padding px-5', () => {
    const { getByText } = render(
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Numéro</TableHead>
          </TableRow>
        </TableHeader>
      </Table>,
    );
    const th = getByText('Numéro');
    expect(th.className).toContain('uppercase');
    expect(th.className).toContain('tracking-widest');
    expect(th.className).toContain('px-5');
  });

  it('TableBody utilise divide-y', () => {
    const { container } = render(
      <Table>
        <TableBody>
          <TableRow>
            <TableCell>x</TableCell>
          </TableRow>
        </TableBody>
      </Table>,
    );
    expect(container.querySelector('[data-slot=table-body]')?.className).toContain(
      'divide-y',
    );
  });

  it('TableCell = px-5 py-3', () => {
    const { getByText } = render(
      <Table>
        <TableBody>
          <TableRow>
            <TableCell>val</TableCell>
          </TableRow>
        </TableBody>
      </Table>,
    );
    const td = getByText('val');
    expect(td.className).toContain('px-5');
    expect(td.className).toContain('py-3');
  });

  it('TableFooter = fond muted/40', () => {
    const { container } = render(
      <Table>
        <TableFooter>
          <TableRow>
            <TableCell>total</TableCell>
          </TableRow>
        </TableFooter>
      </Table>,
    );
    expect(container.querySelector('[data-slot=table-footer]')?.className).toContain(
      'bg-muted/40',
    );
  });
});
