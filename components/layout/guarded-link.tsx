'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';

import { useNavigationGuard } from '@/lib/hooks/navigation-guard';

/** Link interne qui passe par la garde de navigation (dialog si formulaire
 *  dirty). Garde la sémantique habituelle de next/link en cas d'absence de
 *  formulaire dirty. Respecte aussi les clics modifiés (Cmd/Ctrl/Shift/Alt). */
export function GuardedLink({
  href,
  onClick,
  children,
  className,
  title,
}: {
  href: string;
  onClick?: (e: React.MouseEvent<HTMLAnchorElement>) => void;
  children: React.ReactNode;
  className?: string;
  /** Tooltip natif — utile quand le libellé est masqué (sidebar repliée). */
  title?: string;
}) {
  const router = useRouter();
  const { tryNavigate } = useNavigationGuard();
  return (
    <Link
      href={href}
      className={className}
      title={title}
      onClick={(e) => {
        if (
          e.defaultPrevented ||
          e.button !== 0 ||
          e.metaKey ||
          e.ctrlKey ||
          e.shiftKey ||
          e.altKey
        ) {
          return;
        }
        e.preventDefault();
        onClick?.(e);
        tryNavigate(() => router.push(href));
      }}
    >
      {children}
    </Link>
  );
}
