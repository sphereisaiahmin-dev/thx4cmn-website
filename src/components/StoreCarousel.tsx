'use client';

import Link from 'next/link';
import { Suspense, useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { Box3, type Group, MathUtils, type Mesh, Sphere } from 'three';
import { Center, useGLTF } from '@react-three/drei';
import { useFrame, useThree } from '@react-three/fiber';

import { ThreeCanvas } from '@/components/ThreeCanvas';
import { modelUrlsByProductId } from '@/components/productModelUrls';
import { scaleByModelUrl } from '@/components/ProductModelScene';
import type { Product } from '@/data/products';
import { formatCurrency } from '@/lib/format';
import { useCartStore } from '@/store/cart';

// ── constants ────────────────────────────────────────────────────────────────

// Center is larger than sides to create depth hierarchy
const SLOT_RADIUS = { left: 0.95, center: 2.4, right: 0.95 } as const;

// Side models pushed back (z) and spread wide (x) to frame the center
const SLOTS = {
  left:   { pos: [-5.2, 0, -2.8] as [number, number, number], rotY:  Math.PI / 5 },
  center: { pos: [0,    0,  0  ] as [number, number, number], rotY:  0            },
  right:  { pos: [ 5.2, 0, -2.8] as [number, number, number], rotY: -Math.PI / 5 },
} as const;

type SlotKey = keyof typeof SLOTS;
type Phase = 'idle' | 'fade-out' | 'waiting' | 'fade-in';

const LERP_SPEED = 0.09;
const SIDE_IDLE_OPACITY = 0.48;

// Rotation speeds: center slightly faster to draw focus
const ROTATION_SPEED = { left: 0.28, center: 0.5, right: 0.28 } as const;

// ── helpers ──────────────────────────────────────────────────────────────────

const wrap = (i: number, n: number) => (n === 0 ? 0 : ((i % n) + n) % n);

const applyOpacity = (group: Group, opacity: number) => {
  group.traverse((obj) => {
    const mesh = obj as Mesh;
    if (!mesh.isMesh) return;
    const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    for (const m of mats as Array<{ transparent: boolean; opacity: number; needsUpdate: boolean }>) {
      m.transparent = opacity < 0.999;
      m.opacity = opacity;
      m.needsUpdate = true;
    }
  });
};

// ── R3F: single slot model ───────────────────────────────────────────────────

interface SlotModelProps {
  modelUrl: string;
  slotKey: SlotKey;
  opacityRef: React.MutableRefObject<number>;
  onNavigate?: () => void;
  isMobile: boolean;
}

const SlotModel = ({ modelUrl, slotKey, opacityRef, onNavigate, isMobile }: SlotModelProps) => {
  const { gl } = useThree();
  const { scene } = useGLTF(modelUrl);
  const cloned = useMemo(() => {
    const c = scene.clone(true);
    c.traverse((obj) => {
      const mesh = obj as Mesh;
      if (!mesh.isMesh) return;
      mesh.material = Array.isArray(mesh.material)
        ? mesh.material.map((m) => (m as { clone(): typeof m }).clone())
        : (mesh.material as { clone(): typeof mesh.material }).clone();
    });
    return c;
  }, [scene]);
  const baseScale = scaleByModelUrl[modelUrl] ?? 1;
  const targetRadius = SLOT_RADIUS[slotKey];
  const outerRef = useRef<Group>(null);
  const innerRef = useRef<Group>(null);
  const [normScale, setNormScale] = useState(1);
  // Initialize to -1 so the first frame always applies the correct initial opacity
  const prevOpacity = useRef(-1);
  const isSide = slotKey !== 'center';
  const config = SLOTS[slotKey];
  const isClickable = isSide && !isMobile && !!onNavigate;

  // Drag rotation state (center model only)
  const isDragging = useRef(false);
  const dragStartX = useRef(0);
  const dragStartRotY = useRef(0);

  // Compute normalizing scale from bounding sphere once model loads
  useEffect(() => {
    const g = innerRef.current;
    if (!g) return;
    g.updateWorldMatrix(true, true);
    const box = new Box3().setFromObject(g);
    if (box.isEmpty()) return;
    const sphere = box.getBoundingSphere(new Sphere());
    if (sphere.radius > 0 && Number.isFinite(sphere.radius)) {
      setNormScale(targetRadius / sphere.radius);
    }
  }, [modelUrl, targetRadius]);

  // Canvas pointer events for drag rotation (center only, persists outside model surface)
  useEffect(() => {
    if (isSide) return;
    const canvas = gl.domElement;

    const onMove = (e: PointerEvent) => {
      if (!isDragging.current || !innerRef.current) return;
      innerRef.current.rotation.y = dragStartRotY.current + (e.clientX - dragStartX.current) * 0.01;
    };

    const onUp = () => {
      if (!isDragging.current) return;
      isDragging.current = false;
      canvas.style.cursor = 'grab';
    };

    canvas.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
    return () => {
      canvas.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
    };
  }, [isSide, gl]);

  useFrame((_, delta) => {
    // All slots auto-rotate; center pauses when user is dragging
    if (innerRef.current && !isDragging.current) {
      innerRef.current.rotation.y += delta * ROTATION_SPEED[slotKey];
      innerRef.current.rotation.y = MathUtils.euclideanModulo(
        innerRef.current.rotation.y,
        Math.PI * 2,
      );
    }

    // Only traverse meshes when opacity value actually changed
    const curr = opacityRef.current;
    if (Math.abs(curr - prevOpacity.current) > 0.001 && outerRef.current) {
      applyOpacity(outerRef.current, curr);
      prevOpacity.current = curr;
    }
  });

  // Center: drag to rotate
  const handlePointerDown = !isSide
    ? (e: { clientX: number; stopPropagation: () => void }) => {
        e.stopPropagation();
        isDragging.current = true;
        dragStartX.current = e.clientX;
        dragStartRotY.current = innerRef.current?.rotation.y ?? 0;
        gl.domElement.style.cursor = 'grabbing';
      }
    : undefined;

  // Cursor feedback
  const handlePointerOver = !isSide
    ? () => { if (!isDragging.current) gl.domElement.style.cursor = 'grab'; }
    : isClickable
    ? () => { gl.domElement.style.cursor = 'pointer'; }
    : undefined;

  const handlePointerOut = !isSide || isClickable
    ? () => { if (!isDragging.current) gl.domElement.style.cursor = ''; }
    : undefined;

  const handleClick = isClickable
    ? (e: { stopPropagation: () => void }) => { e.stopPropagation(); onNavigate?.(); }
    : undefined;

  return (
    <group position={config.pos} rotation={[0, config.rotY, 0]}>
      <group
        ref={outerRef}
        scale={normScale}
        onClick={handleClick}
        onPointerDown={handlePointerDown}
        onPointerOver={handlePointerOver}
        onPointerOut={handlePointerOut}
      >
        <group ref={innerRef}>
          <Center>
            <primitive object={cloned} scale={baseScale} />
          </Center>
        </group>
      </group>
    </group>
  );
};

// ── R3F: scene root ──────────────────────────────────────────────────────────

interface CarouselSceneProps {
  leftUrl: string | null;
  centerUrl: string;
  rightUrl: string | null;
  phaseRef: React.MutableRefObject<Phase>;
  isMobile: boolean;
  onFadeOutComplete: () => void;
  onFadeInComplete: () => void;
  onClickPrev: () => void;
  onClickNext: () => void;
  /** Receives center opacity on every frame it changes — drives the HTML overlay opacity */
  onCenterOpacity: (v: number) => void;
}

const CarouselScene = ({
  leftUrl,
  centerUrl,
  rightUrl,
  phaseRef,
  isMobile,
  onFadeOutComplete,
  onFadeInComplete,
  onClickPrev,
  onClickNext,
  onCenterOpacity,
}: CarouselSceneProps) => {
  const sideIdle = isMobile ? 0 : SIDE_IDLE_OPACITY;

  const leftOpacity   = useRef(sideIdle);
  const centerOpacity = useRef(1.0);
  const rightOpacity  = useRef(sideIdle);
  const leftTarget    = useRef(sideIdle);
  const centerTarget  = useRef(1.0);
  const rightTarget   = useRef(sideIdle);

  const fadeOutFired      = useRef(false);
  const fadeInFired       = useRef(false);
  const fadeOutTargetsSet = useRef(false);
  const prevCenterForCb   = useRef(-1);   // force callback on first frame

  useEffect(() => {
    if (phaseRef.current === 'idle') {
      leftTarget.current  = sideIdle;
      rightTarget.current = sideIdle;
    }
  }, [sideIdle, phaseRef]);

  useFrame(() => {
    const phase = phaseRef.current;

    // Set fade-out targets once at the start of each transition
    if (phase === 'fade-out' && !fadeOutTargetsSet.current) {
      fadeOutTargetsSet.current = true;
      fadeOutFired.current      = false;
      fadeInFired.current       = false;
      leftTarget.current        = 0;
      centerTarget.current      = 0;
      rightTarget.current       = 0;
    }

    if (phase === 'idle') fadeOutTargetsSet.current = false;

    leftOpacity.current   = MathUtils.lerp(leftOpacity.current,   leftTarget.current,   LERP_SPEED);
    centerOpacity.current = MathUtils.lerp(centerOpacity.current, centerTarget.current, LERP_SPEED);
    rightOpacity.current  = MathUtils.lerp(rightOpacity.current,  rightTarget.current,  LERP_SPEED);

    // Drive HTML overlay opacity in sync with 3D center model
    if (Math.abs(centerOpacity.current - prevCenterForCb.current) > 0.005) {
      prevCenterForCb.current = centerOpacity.current;
      onCenterOpacity(centerOpacity.current);
    }

    if (phase === 'fade-out' && centerOpacity.current < 0.025 && !fadeOutFired.current) {
      fadeOutFired.current = true;
      phaseRef.current     = 'waiting';
      onFadeOutComplete();
    }

    // One-frame wait lets React re-render with new products before fade-in begins
    if (phase === 'waiting') {
      phaseRef.current     = 'fade-in';
      leftTarget.current   = isMobile ? 0 : SIDE_IDLE_OPACITY;
      centerTarget.current = 1.0;
      rightTarget.current  = isMobile ? 0 : SIDE_IDLE_OPACITY;
    }

    if (phase === 'fade-in' && centerOpacity.current > 0.97 && !fadeInFired.current) {
      fadeInFired.current = true;
      phaseRef.current    = 'idle';
      // Snap to exact idle values — lerp is asymptotic and would otherwise leave
      // materials stuck at transparent=true with opacity < 1 on the center model.
      centerOpacity.current = 1.0;
      leftOpacity.current   = isMobile ? 0 : SIDE_IDLE_OPACITY;
      rightOpacity.current  = isMobile ? 0 : SIDE_IDLE_OPACITY;
      onFadeInComplete();
    }
  });

  return (
    <>
      <ambientLight intensity={0.75} />
      <directionalLight position={[4, 4, 5]} intensity={1.2} />
      <directionalLight position={[-4, -2, 3]} intensity={0.55} />
      <directionalLight position={[0, -4, 2]} intensity={0.25} />

      {leftUrl && (
        <Suspense fallback={null}>
          <SlotModel
            key={`left-${leftUrl}`}
            modelUrl={leftUrl}
            slotKey="left"
            opacityRef={leftOpacity}
            onNavigate={onClickPrev}
            isMobile={isMobile}
          />
        </Suspense>
      )}

      <Suspense fallback={null}>
        <SlotModel
          key={`center-${centerUrl}`}
          modelUrl={centerUrl}
          slotKey="center"
          opacityRef={centerOpacity}
          isMobile={isMobile}
        />
      </Suspense>

      {rightUrl && (
        <Suspense fallback={null}>
          <SlotModel
            key={`right-${rightUrl}`}
            modelUrl={rightUrl}
            slotKey="right"
            opacityRef={rightOpacity}
            onNavigate={onClickNext}
            isMobile={isMobile}
          />
        </Suspense>
      )}
    </>
  );
};

// ── React: carousel shell ────────────────────────────────────────────────────

interface StoreCarouselProps {
  products: Product[];
}

export const StoreCarousel = ({ products }: StoreCarouselProps) => {
  const addItem = useCartStore((s) => s.addItem);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [isAnimating, setIsAnimating] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false);

  const phaseRef     = useRef<Phase>('idle');
  const pendingDelta = useRef<-1 | 1>(1);
  // Direct DOM ref for description overlay — opacity updated from useFrame without setState
  const descRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const mq = window.matchMedia('(max-width: 767px)');
    const rm = window.matchMedia('(prefers-reduced-motion: reduce)');
    setIsMobile(mq.matches);
    setPrefersReducedMotion(rm.matches);
    const onMq = (e: MediaQueryListEvent) => setIsMobile(e.matches);
    const onRm = (e: MediaQueryListEvent) => setPrefersReducedMotion(e.matches);
    mq.addEventListener('change', onMq);
    rm.addEventListener('change', onRm);
    return () => { mq.removeEventListener('change', onMq); rm.removeEventListener('change', onRm); };
  }, []);

  const total       = products.length;
  const hasMultiple = total > 1;

  const currProduct = products[wrap(selectedIndex, total)];
  const prevProduct = products[wrap(selectedIndex - 1, total)];
  const nextProduct = products[wrap(selectedIndex + 1, total)];

  const prevUrl   = hasMultiple && prevProduct ? (modelUrlsByProductId[prevProduct.id] ?? null) : null;
  const centerUrl = currProduct ? (modelUrlsByProductId[currProduct.id] ?? null) : null;
  const nextUrl   = hasMultiple && nextProduct ? (modelUrlsByProductId[nextProduct.id] ?? null) : null;

  const navigate = useCallback(
    (delta: -1 | 1) => {
      if (!hasMultiple || isAnimating || phaseRef.current !== 'idle') return;
      if (prefersReducedMotion) {
        setSelectedIndex((i) => wrap(i + delta, total));
        return;
      }
      pendingDelta.current = delta;
      phaseRef.current = 'fade-out';
      setIsAnimating(true);
    },
    [hasMultiple, isAnimating, prefersReducedMotion, total],
  );

  const handleFadeOutComplete = useCallback(() => {
    setSelectedIndex((i) => wrap(i + pendingDelta.current, total));
  }, [total]);

  const handleFadeInComplete = useCallback(() => {
    setIsAnimating(false);
  }, []);

  // Sync description overlay opacity directly to center model opacity (no re-render)
  const handleCenterOpacity = useCallback((v: number) => {
    if (descRef.current) descRef.current.style.opacity = String(v);
  }, []);

  const handleAdd = useCallback(() => {
    if (!currProduct) return;
    addItem({
      productId: currProduct.id,
      name: currProduct.name,
      priceCents: currProduct.priceCents,
      currency: currProduct.currency,
      quantity: 1,
      type: currProduct.type,
    });
  }, [addItem, currProduct]);

  const handleKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'ArrowLeft')  { e.preventDefault(); navigate(-1); }
    if (e.key === 'ArrowRight') { e.preventDefault(); navigate(1);  }
  };

  if (products.length === 0) {
    return (
      <div className="showcase-transition-carousel flex items-center justify-center py-24 text-sm text-black/55">
        No products available.
      </div>
    );
  }

  if (!centerUrl || !currProduct) return null;

  return (
    <div
      role="region"
      aria-roledescription="carousel"
      aria-label="Store product carousel"
      tabIndex={0}
      onKeyDown={handleKeyDown}
      className="showcase-transition-carousel relative w-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-black/18 focus-visible:ring-offset-4 focus-visible:ring-offset-white/60"
      style={{ height: 'calc(100vh - var(--site-header-height) - var(--mobile-player-offset))' }}
    >
      {/* ── 3D canvas — fills the entire carousel region ── */}
      <ThreeCanvas
        className="h-full w-full"
        camera={{ position: [0, 0.4, 9.5], fov: 50 }}
        performanceMode="auto"
      >
        <CarouselScene
          leftUrl={prevUrl}
          centerUrl={centerUrl}
          rightUrl={nextUrl}
          phaseRef={phaseRef}
          isMobile={isMobile}
          onFadeOutComplete={handleFadeOutComplete}
          onFadeInComplete={handleFadeInComplete}
          onClickPrev={() => navigate(-1)}
          onClickNext={() => navigate(1)}
          onCenterOpacity={handleCenterOpacity}
        />
      </ThreeCanvas>

      {/* ── Edge vignette — blends canvas into page background ── */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            'radial-gradient(ellipse 90% 85% at 50% 42%, transparent 48%, rgba(255,255,255,0.92) 100%)',
        }}
      />

      {/* ── Counter badge ── */}
      {hasMultiple && (
        <p className="pointer-events-none absolute right-5 top-5 z-10 text-[0.58rem] uppercase tracking-[0.38em] text-black/35">
          {selectedIndex + 1} / {total}
        </p>
      )}

      {/* ── Navigation arrows — centered vertically, flanking the scene ── */}
      {hasMultiple && (
        <>
          <button
            type="button"
            onClick={() => navigate(-1)}
            disabled={isAnimating}
            aria-label="Show previous product"
            className="absolute left-4 top-1/2 z-10 -translate-y-1/2 inline-flex h-11 w-11 items-center justify-center rounded-full border border-black/12 bg-white/50 text-base backdrop-blur-sm transition duration-200 hover:border-black/28 hover:bg-white/72 disabled:cursor-not-allowed disabled:opacity-35 md:left-6 md:h-14 md:w-14 md:text-lg md:top-auto md:translate-y-0 md:bottom-52"
          >
            <span aria-hidden="true">&larr;</span>
          </button>
          <button
            type="button"
            onClick={() => navigate(1)}
            disabled={isAnimating}
            aria-label="Show next product"
            className="absolute right-4 top-1/2 z-10 -translate-y-1/2 inline-flex h-11 w-11 items-center justify-center rounded-full border border-black/12 bg-white/50 text-base backdrop-blur-sm transition duration-200 hover:border-black/28 hover:bg-white/72 disabled:cursor-not-allowed disabled:opacity-35 md:right-6 md:h-14 md:w-14 md:text-lg md:top-auto md:translate-y-0 md:bottom-52"
          >
            <span aria-hidden="true">&rarr;</span>
          </button>
        </>
      )}

      {/* ── Description overlay — directly below center model, fades with it ── */}
      <div
        ref={descRef}
        aria-live="polite"
        aria-atomic="true"
        className="pointer-events-none absolute bottom-8 left-1/2 z-10 -translate-x-1/2 text-center md:bottom-10"
        style={{ opacity: 1 }}
      >
        <div className="inline-flex flex-col items-center gap-3 px-7 py-4 md:gap-4 md:px-9 md:py-5">
          <div>
            <p className="text-[0.55rem] uppercase tracking-[0.44em] text-black/40">
              {currProduct.type === 'digital' ? 'Digital download' : 'Hardware'}
            </p>
            <h2 className="mt-0.5 text-base uppercase tracking-[0.22em] md:text-lg">
              {currProduct.name}
            </h2>
          </div>

          <p className="text-[0.7rem] uppercase tracking-[0.34em] text-black/60">
            {formatCurrency(currProduct.priceCents, currProduct.currency)}
          </p>

          <div className="pointer-events-auto flex items-center gap-4 md:gap-5">
            <button
              type="button"
              onClick={handleAdd}
              className="add-to-cart-button rounded-full px-4 py-1.5 text-[0.62rem] uppercase tracking-[0.34em] transition duration-200 hover:bg-white/65 md:px-5"
            >
              Add to cart
            </button>
            <Link
              href={`/store/${currProduct.slug}`}
              className="text-[0.62rem] uppercase tracking-[0.34em] text-black/52 transition duration-200 hover:text-black"
            >
              Details
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
};
