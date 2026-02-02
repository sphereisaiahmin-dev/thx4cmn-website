import Link from 'next/link';

const navItems = [
  { href: '/', label: 'Home' },
  { href: '/store', label: 'Store' },
  { href: '/music', label: 'Music' },
  { href: '/device', label: 'Device' },
  { href: '/cart', label: 'Cart' },
];

export const Navigation = () => (
  <header className="flex items-center justify-between border-b border-slate-200 py-6">
    <Link href="/" className="flex items-center gap-4 text-lg uppercase tracking-[0.4em]">
      <iframe
        title="thx4cmn logo"
        src="https://thx4cmnlogo.netlify.app/"
        className="h-12 w-32 rounded-lg border-0"
        loading="lazy"
      />
      <span className="sr-only">thx4cmn</span>
    </Link>
    <nav className="flex gap-6 text-xs uppercase tracking-[0.3em] text-slate-500">
      {navItems.map((item) => (
        <Link key={item.href} href={item.href}>
          {item.label}
        </Link>
      ))}
    </nav>
  </header>
);
