'use client';

import type { MouseEvent } from 'react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';

import { toCheckoutItemsPayload } from '@/lib/checkout';
import { formatCurrency } from '@/lib/format';
import { HEADER_LOGO_MODEL_URL, HEADER_LOGO_SCALE, LogoScene } from '@/components/LogoScene';
import { useCartStore } from '@/store/cart';
import { useUiStore } from '@/store/ui';

const navItems = [
  { href: '/', label: 'Home' },
  { href: '/store', label: 'Store' },
  { href: '/projects', label: 'Projects' },
  { href: '/device', label: 'hx01' },
];

const NAV_ROUTE_TRANSITION_CLASS = 'route-transition-out';
const DEFAULT_ROUTE_EXIT_DURATION_MS = 300;

const normalizePath = (path: string) => (path !== '/' && path.endsWith('/') ? path.slice(0, -1) : path);

const parseCssDurationMs = (rawValue: string, fallbackMs: number) => {
  const value = rawValue.trim().toLowerCase();
  if (!value) {
    return fallbackMs;
  }

  if (value.endsWith('ms')) {
    const parsed = Number.parseFloat(value.slice(0, -2));
    return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallbackMs;
  }

  if (value.endsWith('s')) {
    const parsed = Number.parseFloat(value.slice(0, -1));
    return Number.isFinite(parsed) && parsed >= 0 ? parsed * 1000 : fallbackMs;
  }

  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallbackMs;
};

const isNavItemActive = (pathname: string, href: string) => {
  const currentPath = normalizePath(pathname);
  const navPath = normalizePath(href);

  if (navPath === '/') {
    return currentPath === '/';
  }

  return currentPath === navPath || currentPath.startsWith(`${navPath}/`);
};

const shouldBypassClientTransition = (event: MouseEvent<HTMLAnchorElement>) => {
  if (event.defaultPrevented) {
    return true;
  }

  if (event.button !== 0) {
    return true;
  }

  if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) {
    return true;
  }

  const target = event.currentTarget.target;
  return Boolean(target && target !== '_self');
};

export const Navigation = () => {
  const pathname = usePathname();
  const router = useRouter();
  const isHome = pathname === '/';
  const items = useCartStore((state) => state.items);
  const isMiniCartOpen = useUiStore((state) => state.isMiniCartOpen);
  const setMiniCartOpen = useUiStore((state) => state.setMiniCartOpen);
  const headerRef = useRef<HTMLElement>(null);
  const transitionTimerRef = useRef<number | null>(null);
  const pendingHrefRef = useRef<string | null>(null);
  const routeExitDurationMsRef = useRef<number>(DEFAULT_ROUTE_EXIT_DURATION_MS);
  const [isRouteTransitioning, setIsRouteTransitioning] = useState(false);
  const [isCheckoutLoading, setIsCheckoutLoading] = useState(false);
  const [checkoutError, setCheckoutError] = useState<string | null>(null);
  const totalQuantity = useMemo(
    () => items.reduce((total, item) => total + item.quantity, 0),
    [items],
  );
  const subtotal = useMemo(
    () => items.reduce((total, item) => total + item.priceCents * item.quantity, 0),
    [items],
  );
  const shouldShowHeaderLogo = !isHome || isRouteTransitioning;

  const syncRouteExitDuration = useCallback(() => {
    const rootStyles = window.getComputedStyle(document.documentElement);
    routeExitDurationMsRef.current = parseCssDurationMs(
      rootStyles.getPropertyValue('--route-exit-ms'),
      DEFAULT_ROUTE_EXIT_DURATION_MS,
    );
  }, []);

  const clearRouteTransition = useCallback(() => {
    if (transitionTimerRef.current !== null) {
      window.clearTimeout(transitionTimerRef.current);
      transitionTimerRef.current = null;
    }

    pendingHrefRef.current = null;
    setIsRouteTransitioning(false);
    document.documentElement.classList.remove(NAV_ROUTE_TRANSITION_CLASS);
  }, []);

  useEffect(() => {
    const updateHeaderHeight = () => {
      if (!headerRef.current) return;
      document.documentElement.style.setProperty('--site-header-height', `${headerRef.current.offsetHeight}px`);
    };

    syncRouteExitDuration();
    updateHeaderHeight();
    window.addEventListener('resize', updateHeaderHeight);
    window.addEventListener('resize', syncRouteExitDuration);
    return () => {
      window.removeEventListener('resize', updateHeaderHeight);
      window.removeEventListener('resize', syncRouteExitDuration);
    };
  }, [pathname, syncRouteExitDuration]);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const mediaQuery = window.matchMedia('(max-width: 767px)');
    const handleMobileState = (isMobile: boolean) => {
      if (isMobile) {
        setMiniCartOpen(false);
      }
    };

    handleMobileState(mediaQuery.matches);
    const handleChange = (event: MediaQueryListEvent) => {
      handleMobileState(event.matches);
    };

    if (typeof mediaQuery.addEventListener === 'function') {
      mediaQuery.addEventListener('change', handleChange);
      return () => mediaQuery.removeEventListener('change', handleChange);
    }

    mediaQuery.addListener(handleChange);
    return () => mediaQuery.removeListener(handleChange);
  }, [setMiniCartOpen]);

  useEffect(() => {
    clearRouteTransition();
  }, [clearRouteTransition, pathname]);

  useEffect(() => {
    return () => {
      if (transitionTimerRef.current !== null) {
        window.clearTimeout(transitionTimerRef.current);
      }
      document.documentElement.classList.remove(NAV_ROUTE_TRANSITION_CLASS);
    };
  }, []);

  const handleNavRouteChange = (href: string) => {
    syncRouteExitDuration();
    const currentPath = normalizePath(pathname);
    const nextPath = normalizePath(href);
    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const transitionDurationMs = routeExitDurationMsRef.current;

    setMiniCartOpen(false);

    if (currentPath === nextPath) {
      clearRouteTransition();
      return;
    }

    if (prefersReducedMotion || transitionDurationMs <= 0) {
      router.push(href);
      return;
    }

    pendingHrefRef.current = href;
    setIsRouteTransitioning(true);
    document.documentElement.classList.add(NAV_ROUTE_TRANSITION_CLASS);

    if (transitionTimerRef.current !== null) {
      window.clearTimeout(transitionTimerRef.current);
    }

    transitionTimerRef.current = window.setTimeout(() => {
      const pendingHref = pendingHrefRef.current;
      pendingHrefRef.current = null;
      transitionTimerRef.current = null;

      if (pendingHref) {
        router.push(pendingHref);
      }
    }, transitionDurationMs);
  };

  const handleNavLinkIntent = (href: string) => {
    router.prefetch(href);
  };

  const handleNavLinkClick = (event: MouseEvent<HTMLAnchorElement>, href: string) => {
    if (shouldBypassClientTransition(event)) {
      return;
    }

    event.preventDefault();
    handleNavRouteChange(href);
  };

  const handleCheckout = async () => {
    if (items.length === 0 || isCheckoutLoading) return;
    setCheckoutError(null);
    setIsCheckoutLoading(true);
    try {
      const response = await fetch('/api/stripe/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          items: toCheckoutItemsPayload(
            items.map((item) => ({
              productId: item.productId,
              quantity: item.quantity,
            })),
          ),
        }),
      });

      if (!response.ok) {
        let errorPayload: { error?: string; requestId?: string } | null = null;
        try {
          errorPayload = (await response.json()) as { error?: string; requestId?: string };
        } catch (parseError) {
          console.error('Failed to parse checkout error response.', parseError);
        }
        const message = errorPayload?.error ?? 'Checkout failed';
        const requestId = errorPayload?.requestId ? ` (requestId: ${errorPayload.requestId})` : '';
        throw new Error(`${message}${requestId}`);
      }

      const payload = (await response.json()) as { url?: string; requestId?: string };
      const checkoutUrl = typeof payload.url === 'string' ? payload.url : '';
      if (!checkoutUrl) {
        const requestId = payload.requestId ? ` (requestId: ${payload.requestId})` : '';
        throw new Error(`Checkout session did not return a URL.${requestId}`);
      }

      setMiniCartOpen(false);
      window.location.href = checkoutUrl;
    } catch (error) {
      console.error(error);
      setCheckoutError(error instanceof Error ? error.message : 'Unable to start checkout.');
      setIsCheckoutLoading(false);
    }
  };

  return (
    <>
      <header
        ref={headerRef}
        className="fixed left-0 right-0 top-0 z-[60] border-b border-black/10 bg-white/65 px-6 py-4 backdrop-blur-xl md:static md:left-auto md:right-auto md:top-auto md:bg-transparent md:px-0 md:py-6 md:backdrop-blur-none"
      >
        <div className="flex w-full items-center justify-center gap-4 md:justify-between md:gap-0">
          <div
            className="relative hidden h-10 w-28 items-center justify-center overflow-visible md:flex"
            aria-label="thx4cmn logo"
          >
            <span className="sr-only">thx4cmn</span>
            <div
              className={`header-logo-transition absolute inset-0 ${
                shouldShowHeaderLogo ? 'opacity-100' : 'pointer-events-none opacity-0'
              }`}
              aria-hidden={!shouldShowHeaderLogo}
            >
              <LogoScene className="h-10 w-28" modelUrl={HEADER_LOGO_MODEL_URL} modelScale={HEADER_LOGO_SCALE} />
            </div>
          </div>
          <nav className="flex w-full flex-wrap items-center justify-center gap-x-5 gap-y-2 text-[0.62rem] uppercase tracking-[0.22em] md:w-auto md:gap-6 md:text-xs md:tracking-[0.3em]">
            {navItems.map((item) => {
              const isActive = isNavItemActive(pathname, item.href);

              return (
                <Link
                  key={item.href}
                  href={item.href}
                  prefetch={false}
                  className={`nav-link${isActive ? ' nav-link-active' : ''}`}
                  onClick={(event) => handleNavLinkClick(event, item.href)}
                  onMouseEnter={() => handleNavLinkIntent(item.href)}
                  onFocus={() => handleNavLinkIntent(item.href)}
                >
                  {item.label}
                </Link>
              );
            })}
            <Link
              href="/cart"
              prefetch={false}
              className="nav-link inline-flex items-center gap-2 md:hidden"
              onClick={(event) => handleNavLinkClick(event, '/cart')}
              onMouseEnter={() => handleNavLinkIntent('/cart')}
              onFocus={() => handleNavLinkIntent('/cart')}
            >
              <span>CART</span>
              {totalQuantity > 0 ? (
                <span className="cart-count inline-flex min-w-[1.25rem] items-center justify-center rounded-full border border-current px-1 text-[0.65rem] font-semibold leading-none">
                  {totalQuantity}
                </span>
              ) : null}
            </Link>
            <button
              type="button"
              className="nav-link hidden items-center gap-2 md:inline-flex"
              aria-expanded={isMiniCartOpen}
              aria-controls="mini-cart"
              onClick={() => {
                setCheckoutError(null);
                setMiniCartOpen(true);
              }}
            >
              <span>CART</span>
              {totalQuantity > 0 ? (
                <span className="cart-count inline-flex min-w-[1.25rem] items-center justify-center rounded-full border border-current px-1 text-[0.65rem] font-semibold leading-none">
                  {totalQuantity}
                </span>
              ) : null}
            </button>
          </nav>
        </div>
      </header>
      <div
        className={`fixed inset-0 z-[80] hidden transition-opacity duration-200 md:block ${
          isMiniCartOpen ? 'pointer-events-auto opacity-100' : 'pointer-events-none opacity-0'
        }`}
        aria-hidden={!isMiniCartOpen}
      >
        <button
          type="button"
          className={`absolute inset-0 bg-black/20 transition-opacity duration-200 ${
            isMiniCartOpen ? 'opacity-100' : 'opacity-0'
          }`}
          aria-label="Close cart"
          onClick={() => setMiniCartOpen(false)}
        />
        <aside
          id="mini-cart"
          role="dialog"
          aria-modal="true"
          aria-labelledby="mini-cart-title"
          className={`absolute right-6 top-6 flex w-[calc(100%-3rem)] max-h-[calc(100vh-3rem)] max-w-sm flex-col gap-6 overflow-hidden rounded-[1.75rem] border border-black/10 bg-black/5 p-6 shadow-[0_16px_40px_rgba(0,0,0,0.12)] backdrop-blur-sm transition-all duration-300 ${
            isMiniCartOpen ? 'translate-x-0 opacity-100' : 'translate-x-[110%] opacity-0'
          }`}
        >
          <div className="flex items-center justify-between">
            <h2 id="mini-cart-title" className="text-xs uppercase tracking-[0.3em]">
              Cart
            </h2>
            <button
              type="button"
              className="text-xs uppercase tracking-[0.3em] text-black/60"
              onClick={() => setMiniCartOpen(false)}
            >
              Close
            </button>
          </div>
          {items.length === 0 ? (
            <p className="text-sm text-black/60">Your cart is empty.</p>
          ) : (
            <ul className="flex flex-1 flex-col gap-4 overflow-auto pr-1">
              {items.map((item) => (
                <li key={item.productId} className="flex items-start justify-between gap-4">
                  <div className="space-y-1">
                    <p className="text-sm">{item.name}</p>
                    <p className="text-xs text-black/60">Qty {item.quantity}</p>
                  </div>
                  <p className="text-xs text-black/60">
                    {formatCurrency(item.priceCents * item.quantity, item.currency)}
                  </p>
                </li>
              ))}
            </ul>
          )}
          <div className="space-y-4 border-t border-black/10 pt-4">
            <div className="flex items-center justify-between text-xs uppercase tracking-[0.3em]">
              <span>Subtotal</span>
              <span>{formatCurrency(subtotal)}</span>
            </div>
            <div className="flex flex-col gap-3">
              <Link
                href="/cart"
                prefetch={false}
                className="nav-link inline-flex w-full items-center justify-center px-4 py-3 text-xs uppercase tracking-[0.3em]"
                onClick={() => setMiniCartOpen(false)}
              >
                View cart
              </Link>
              <button
                type="button"
                onClick={handleCheckout}
                disabled={items.length === 0 || isCheckoutLoading}
                className="nav-link inline-flex w-full items-center justify-center px-4 py-3 text-xs uppercase tracking-[0.3em] transition hover:bg-black/10 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isCheckoutLoading ? 'Redirecting…' : 'Checkout'}
              </button>
              {checkoutError ? (
                <p className="text-xs text-red-600">{checkoutError}</p>
              ) : null}
            </div>
          </div>
        </aside>
      </div>
    </>
  );
};
