import Link from 'next/link';

const navItems = [
  { href: '/', label: 'Home' },
  { href: '/store', label: 'Store' },
  { href: '/music', label: 'Music' },
  { href: '/device', label: 'Device' },
  { href: '/cart', label: 'Cart' },
];

export const Navigation = () => (
  <header className="flex items-center justify-between border-b border-black/10 py-6">
    <Link href="/" className="relative flex h-10 w-28 items-center justify-center overflow-visible">
      <span className="sr-only">thx4cmn</span>
      <iframe
        title="thx4cmn logo"
        src="https://thx4cmnlogo.netlify.app/"
        className="pointer-events-none absolute left-1/2 top-1/2 h-24 w-24 -translate-x-1/2 -translate-y-1/2 border-0"
      />
    </Link>
    <nav className="flex gap-6 text-xs uppercase tracking-[0.3em]">
      {navItems.map((item) => (
        <Link key={item.href} href={item.href} className="nav-link">
          {item.label}
        </Link>
      ))}
    </nav>
  </header>
);
