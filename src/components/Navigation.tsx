import Link from 'next/link';

const navItems = [
  { href: '/', label: 'Home' },
  { href: '/store', label: 'Store' },
  { href: '/music', label: 'Music' },
  { href: '/device', label: 'Device' },
  { href: '/cart', label: 'Cart' },
];

export const Navigation = () => (
  <header className="flex items-center justify-between border-b border-white/10 py-6">
    <Link href="/" className="text-lg uppercase tracking-[0.4em]">
      thx4cmn
    </Link>
    <nav className="flex gap-6 text-xs uppercase tracking-[0.3em]">
      {navItems.map((item) => (
        <Link key={item.href} href={item.href}>
          {item.label}
        </Link>
      ))}
    </nav>
  </header>
);
