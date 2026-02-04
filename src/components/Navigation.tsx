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
    <Link href="/" className="flex h-20 w-36 items-center justify-center">
      <span className="sr-only">thx4cmn</span>
      <iframe
        title="thx4cmn logo"
        src="https://thx4cmnlogo.netlify.app/"
        className="h-20 w-36 border-0"
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
