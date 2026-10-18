'use client';

import { cn } from '@/lib/utils';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';

// Sidebar link that marks itself as the current page for assistive tech.
export function NavLink({ href, children }: { href: string; children: ReactNode }) {
  const pathname = usePathname();
  const active = pathname === href || pathname.startsWith(`${href}/`);

  return (
    <Link
      href={href}
      aria-current={active ? 'page' : undefined}
      className={cn(
        'px-3 py-2 text-sm rounded-md transition-colors hover:bg-[#1d2026] hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        active ? 'bg-[#1d2026] text-foreground' : 'text-muted-foreground',
      )}
    >
      {children}
    </Link>
  );
}
