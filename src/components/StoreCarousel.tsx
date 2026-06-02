'use client';

import Link from 'next/link';
import {
  type ReactNode,
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type MutableRefObject,
} from 'react';
import { Center, useGLTF } from '@react-three/drei';
import { useFrame, useThree, type ThreeEvent } from '@react-three/fiber';
import { Box3, type Group, MathUtils, Sphere } from 'three';

import { SceneBloom } from '@/components/SceneBloom';
import { ThreeCanvas } from '@/components/ThreeCanvas';
import { modelUrlsByProductId } from '@/components/productModelUrls';
import {
  applyProductMotion,
  applyRenderableOpacity,
  type BloomSettings,
  clonePreparedProductScene,
  getBloomSettings,
  getModelLightRig,
  getRenderableBounds,
  getSurfacePresentation,
  isSamplePackModel,
  isUniverseModel,
  scaleByModelUrl,
} from '@/components/productModelPresentation';
import type { Product } from '@/data/products';
import {
  getDigitalDeliveryNote,
  getProductFulfillmentLabel,
  getProductPriceLabel,
} from '@/lib/productCommerce';
import { useCartStore } from '@/store/cart';

type SlotKey = 'left' | 'center' | 'right';
type Phase = 'idle' | 'fade-out' | 'waiting' | 'fade-in';

interface SlotConfig {
  pos: [number, number, number];
  rotY: number;
  radius: number;
  rotationSpeed: number;
  draggable?: boolean;
  scaleMultiplier?: number;
}

const CAROUSEL_SLOTS: Record<SlotKey, SlotConfig> = {
  left: {
    pos: [-5.2, 0, -2.8],
    rotY: Math.PI / 5,
    radius: 0.95,
    rotationSpeed: 0.28,
  },
  center: {
    pos: [0, 0, 0],
    rotY: 0,
    radius: 2.4,
    rotationSpeed: 0.5,
    draggable: true,
  },
  right: {
    pos: [5.2, 0, -2.8],
    rotY: -Math.PI / 5,
    radius: 0.95,
    rotationSpeed: 0.28,
  },
};

const TWO_UP_DESKTOP_SLOTS: Record<'left' | 'right', SlotConfig> = {
  left: {
    pos: [-4.85, 0.18, -0.72],
    rotY: Math.PI / 26,
    radius: 1.52,
    rotationSpeed: 0.34,
    draggable: true,
    scaleMultiplier: 0.5,
  },
  right: {
    pos: [4.95, -0.1, -0.5],
    rotY: -Math.PI / 24,
    radius: 2.72,
    rotationSpeed: 0.34,
    draggable: true,
    scaleMultiplier: 1.1,
  },
};

const TWO_UP_MOBILE_SLOTS: Record<'left' | 'right', SlotConfig> = {
  left: {
    ...TWO_UP_DESKTOP_SLOTS.left,
    pos: [0, 2.5, -0.2],
    rotY: Math.PI / 28,
    radius: 1.18,
  },
  right: {
    ...TWO_UP_DESKTOP_SLOTS.right,
    pos: [0, -1.78, -0.3],
    rotY: -Math.PI / 28,
    radius: 1.96,
  },
};

const LERP_SPEED = 0.09;
const SIDE_IDLE_OPACITY = 0.48;
const TWO_UP_SAMPLE_PACK_LIGHT_LAYER = 1;
const TWO_UP_UNIVERSE_LIGHT_LAYER = 2;
const TWO_UP_MOBILE_CANVAS_HEIGHT =
  'clamp(38rem, calc(100svh - var(--site-header-height) - 1rem), 48rem)';
const TWO_UP_DESKTOP_REFERENCE_SIZE = {
  width: 1280,
  height: 760,
} as const;
const TWO_UP_MOBILE_REFERENCE_SIZE = {
  width: 390,
  height: 844,
} as const;

const wrap = (index: number, total: number) =>
  total === 0 ? 0 : ((index % total) + total) % total;
const getStoreViewportHeight = (isMobile: boolean) =>
  isMobile
    ? 'calc(100svh - var(--site-header-height) - var(--mobile-player-offset) - 6.75rem)'
    : 'calc(100vh - var(--site-header-height) - var(--mobile-player-offset) - 6.1rem)';

interface SceneLightsProps {
  lightRig: 'default' | 'universe';
  lightLayer?: number;
}

const SceneLights = ({ lightRig, lightLayer }: SceneLightsProps) => {
  const lights =
    lightRig === 'universe' ? (
      <>
        <ambientLight intensity={0.24} color="#dce8ff" />
        <pointLight
          position={[2.8, 1.6, 3.2]}
          intensity={9.9}
          distance={14}
          decay={2}
          color="#4d9eff"
        />
        <pointLight
          position={[-3.2, -1.4, 2.8]}
          intensity={16}
          distance={14}
          decay={2}
          color="#8b5cf6"
        />
        <directionalLight position={[0, 1, 4]} intensity={0.22} color="#f5f9ff" />
      </>
    ) : (
      <>
        <ambientLight intensity={0.75} />
        <directionalLight position={[4, 4, 5]} intensity={1.2} />
        <directionalLight position={[-4, -2, 3]} intensity={0.55} />
        <directionalLight position={[0, -4, 2]} intensity={0.25} />
      </>
    );

  if (lightLayer === undefined) {
    return lights;
  }

  return <LayeredGroup layer={lightLayer}>{lights}</LayeredGroup>;
};

const getScenePresentation = (modelUrls: string[]) => {
  const bloomSettings =
    modelUrls
      .map((url) => getBloomSettings(url))
      .find((settings): settings is BloomSettings => settings !== null) ?? null;
  const lightRig = modelUrls.some((url) => getModelLightRig(url) === 'universe')
    ? 'universe'
    : 'default';

  return { bloomSettings, lightRig } as const;
};

const LayeredGroup = ({
  layer,
  mode = 'set',
  children,
}: {
  layer: number;
  mode?: 'enable' | 'set';
  children: ReactNode;
}) => {
  const ref = useRef<Group>(null);

  useEffect(() => {
    const group = ref.current;
    if (!group) return;

    group.traverse((object) => {
      if (mode === 'set') {
        object.layers.set(layer);
        return;
      }

      object.layers.enable(layer);
    });
  }, [layer, mode]);

  return <group ref={ref}>{children}</group>;
};

const DetailStyleLights = ({ lightLayer }: { lightLayer: number }) => {
  return (
    <LayeredGroup layer={lightLayer}>
      <ambientLight intensity={0.7} />
      <directionalLight position={[3, 3, 4]} intensity={1.1} />
      <directionalLight position={[-3, -2, 2]} intensity={0.6} />
    </LayeredGroup>
  );
};

const SamplePackAccentLight = ({
  position,
  lightLayer,
}: {
  position: [number, number, number];
  lightLayer: number;
}) => {
  return (
    <LayeredGroup layer={lightLayer}>
      <pointLight
        position={[position[0] - 0.6, position[1] + 1.05, position[2] + 3.1]}
        intensity={0.82}
        distance={6.2}
        decay={2}
        color="#8fc9ff"
      />
      <pointLight
        position={[position[0] + 0.25, position[1] - 0.3, position[2] + 2.05]}
        intensity={0.3}
        distance={4.1}
        decay={2}
        color="#b3dcff"
      />
    </LayeredGroup>
  );
};

interface SlotModelProps {
  modelUrl: string;
  slotConfig: SlotConfig;
  opacityRef: MutableRefObject<number>;
  onNavigate?: () => void;
  isMobile: boolean;
  objectLayer?: number;
  viewportScaleMultiplier?: number;
}

const SlotModel = ({
  modelUrl,
  slotConfig,
  opacityRef,
  onNavigate,
  isMobile,
  objectLayer,
  viewportScaleMultiplier = 1,
}: SlotModelProps) => {
  const { gl } = useThree();
  const { scene } = useGLTF(modelUrl);
  const cloned = useMemo(() => clonePreparedProductScene(scene, modelUrl), [modelUrl, scene]);
  const baseScale = (scaleByModelUrl[modelUrl] ?? 1) * (slotConfig.scaleMultiplier ?? 1);
  const surfacePresentation = getSurfacePresentation(modelUrl, 'store-carousel');
  const frameOffset = surfacePresentation.frameOffset ?? [0, 0, 0];
  const normalizedScaleMultiplier = surfacePresentation.normalizedScaleMultiplier ?? 1;
  const outerRef = useRef<Group>(null);
  const innerRef = useRef<Group>(null);
  const [normScale, setNormScale] = useState(1);
  const prevOpacity = useRef(-1);
  const isDragging = useRef(false);
  const dragStartX = useRef(0);
  const dragStartY = useRef(0);
  const dragStartRotY = useRef(0);
  const dragStartRotX = useRef(0);
  const canDrag = Boolean(slotConfig.draggable);
  const isClickable = !canDrag && !isMobile && Boolean(onNavigate);

  useEffect(() => {
    const group = outerRef.current;
    if (!group || objectLayer === undefined) return;

    group.traverse((object) => {
      object.layers.enable(objectLayer);
    });
  }, [cloned, objectLayer]);

  useEffect(() => {
    const group = innerRef.current;
    if (!group) return;

    group.updateWorldMatrix(true, true);
    const bounds = getRenderableBounds(group) ?? new Box3().setFromObject(group);
    if (bounds.isEmpty()) return;

    const sphere = bounds.getBoundingSphere(new Sphere());
    if (sphere.radius > 0 && Number.isFinite(sphere.radius)) {
      setNormScale(slotConfig.radius / sphere.radius);
    }
  }, [modelUrl, slotConfig.radius]);

  useEffect(() => {
    if (!canDrag) return;
    const canvas = gl.domElement;

    const onMove = (event: PointerEvent) => {
      if (!isDragging.current || !innerRef.current) return;
      const deltaX = event.clientX - dragStartX.current;
      const deltaY = event.clientY - dragStartY.current;
      innerRef.current.rotation.y = dragStartRotY.current + deltaX * 0.01;
      innerRef.current.rotation.x = MathUtils.clamp(
        dragStartRotX.current + deltaY * 0.008,
        -1.15,
        1.15,
      );
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
  }, [canDrag, gl]);

  useFrame((state, delta) => {
    if (innerRef.current) {
      if (isUniverseModel(modelUrl) && outerRef.current) {
        applyProductMotion({
          modelUrl,
          delta,
          elapsed: state.clock.getElapsedTime(),
          orbitTarget: outerRef.current,
          driftEnabled: true,
          spinTarget: innerRef.current,
          spinEnabled: !isDragging.current,
        });
      } else if (!isDragging.current) {
        innerRef.current.rotation.y = MathUtils.euclideanModulo(
          innerRef.current.rotation.y + delta * slotConfig.rotationSpeed,
          Math.PI * 2,
        );
      }
    }

    const currentOpacity = opacityRef.current;
    if (Math.abs(currentOpacity - prevOpacity.current) > 0.001 && outerRef.current) {
      applyRenderableOpacity(outerRef.current, currentOpacity);
      prevOpacity.current = currentOpacity;
    }
  });

  const handlePointerDown = canDrag
    ? (event: ThreeEvent<PointerEvent>) => {
        event.stopPropagation();
        isDragging.current = true;
        dragStartX.current = event.clientX;
        dragStartY.current = event.clientY;
        dragStartRotY.current = innerRef.current?.rotation.y ?? 0;
        dragStartRotX.current = innerRef.current?.rotation.x ?? 0;
        gl.domElement.style.cursor = 'grabbing';
      }
    : undefined;

  const handlePointerOver = canDrag
    ? () => {
        if (!isDragging.current) gl.domElement.style.cursor = 'grab';
      }
    : isClickable
      ? () => {
          gl.domElement.style.cursor = 'pointer';
        }
      : undefined;

  const handlePointerOut =
    canDrag || isClickable
      ? () => {
          if (!isDragging.current) gl.domElement.style.cursor = '';
        }
      : undefined;

  const handleClick = isClickable
    ? (event: { stopPropagation: () => void }) => {
        event.stopPropagation();
        onNavigate?.();
      }
    : undefined;

  return (
    <group
      position={[
        slotConfig.pos[0] + frameOffset[0],
        slotConfig.pos[1] + frameOffset[1],
        slotConfig.pos[2] + frameOffset[2],
      ]}
      rotation={[0, slotConfig.rotY, 0]}
    >
      <group
        ref={outerRef}
        scale={normScale * normalizedScaleMultiplier * viewportScaleMultiplier}
        onClick={handleClick}
        onPointerDown={handlePointerDown}
        onPointerOut={handlePointerOut}
        onPointerOver={handlePointerOver}
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

interface CarouselSceneProps {
  leftUrl: string | null;
  centerUrl: string;
  rightUrl: string | null;
  phaseRef: MutableRefObject<Phase>;
  isMobile: boolean;
  onFadeOutComplete: () => void;
  onFadeInComplete: () => void;
  onClickPrev: () => void;
  onClickNext: () => void;
  onCenterOpacity: (opacity: number) => void;
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
  const visibleModelUrls = [leftUrl, centerUrl, rightUrl].filter((url): url is string =>
    Boolean(url),
  );
  const { bloomSettings, lightRig } = getScenePresentation(visibleModelUrls);

  const leftOpacity = useRef(sideIdle);
  const centerOpacity = useRef(1);
  const rightOpacity = useRef(sideIdle);
  const leftTarget = useRef(sideIdle);
  const centerTarget = useRef(1);
  const rightTarget = useRef(sideIdle);
  const fadeOutFired = useRef(false);
  const fadeInFired = useRef(false);
  const fadeOutTargetsSet = useRef(false);
  const prevCenterForCallback = useRef(-1);

  useEffect(() => {
    if (phaseRef.current === 'idle') {
      leftTarget.current = sideIdle;
      rightTarget.current = sideIdle;
    }
  }, [phaseRef, sideIdle]);

  useFrame(() => {
    const phase = phaseRef.current;

    if (phase === 'fade-out' && !fadeOutTargetsSet.current) {
      fadeOutTargetsSet.current = true;
      fadeOutFired.current = false;
      fadeInFired.current = false;
      leftTarget.current = 0;
      centerTarget.current = 0;
      rightTarget.current = 0;
    }

    if (phase === 'idle') {
      fadeOutTargetsSet.current = false;
    }

    leftOpacity.current = MathUtils.lerp(leftOpacity.current, leftTarget.current, LERP_SPEED);
    centerOpacity.current = MathUtils.lerp(centerOpacity.current, centerTarget.current, LERP_SPEED);
    rightOpacity.current = MathUtils.lerp(rightOpacity.current, rightTarget.current, LERP_SPEED);

    if (Math.abs(centerOpacity.current - prevCenterForCallback.current) > 0.005) {
      prevCenterForCallback.current = centerOpacity.current;
      onCenterOpacity(centerOpacity.current);
    }

    if (phase === 'fade-out' && centerOpacity.current < 0.025 && !fadeOutFired.current) {
      fadeOutFired.current = true;
      phaseRef.current = 'waiting';
      onFadeOutComplete();
    }

    if (phase === 'waiting') {
      phaseRef.current = 'fade-in';
      leftTarget.current = isMobile ? 0 : SIDE_IDLE_OPACITY;
      centerTarget.current = 1;
      rightTarget.current = isMobile ? 0 : SIDE_IDLE_OPACITY;
    }

    if (phase === 'fade-in' && centerOpacity.current > 0.97 && !fadeInFired.current) {
      fadeInFired.current = true;
      phaseRef.current = 'idle';
      centerOpacity.current = 1;
      leftOpacity.current = isMobile ? 0 : SIDE_IDLE_OPACITY;
      rightOpacity.current = isMobile ? 0 : SIDE_IDLE_OPACITY;
      onFadeInComplete();
    }
  });

  return (
    <>
      <SceneLights lightRig={lightRig} />

      {leftUrl ? (
        <Suspense fallback={null}>
          <SlotModel
            key={`left-${leftUrl}`}
            modelUrl={leftUrl}
            slotConfig={CAROUSEL_SLOTS.left}
            opacityRef={leftOpacity}
            onNavigate={onClickPrev}
            isMobile={isMobile}
          />
        </Suspense>
      ) : null}

      <Suspense fallback={null}>
        <SlotModel
          key={`center-${centerUrl}`}
          modelUrl={centerUrl}
          slotConfig={CAROUSEL_SLOTS.center}
          opacityRef={centerOpacity}
          isMobile={isMobile}
        />
      </Suspense>

      {rightUrl ? (
        <Suspense fallback={null}>
          <SlotModel
            key={`right-${rightUrl}`}
            modelUrl={rightUrl}
            slotConfig={CAROUSEL_SLOTS.right}
            opacityRef={rightOpacity}
            onNavigate={onClickNext}
            isMobile={isMobile}
          />
        </Suspense>
      ) : null}

      {bloomSettings ? <SceneBloom {...bloomSettings} /> : null}
    </>
  );
};

interface TwoUpSceneProps {
  leftUrl: string;
  rightUrl: string;
  isMobile: boolean;
}

const TwoUpSceneCameraLayers = () => {
  const { camera } = useThree();

  useEffect(() => {
    camera.layers.enable(TWO_UP_SAMPLE_PACK_LIGHT_LAYER);
    camera.layers.enable(TWO_UP_UNIVERSE_LIGHT_LAYER);
  }, [camera]);

  return null;
};

const useResponsiveUniverseScale = (isMobile: boolean) => {
  const { size } = useThree();

  return useMemo(() => {
    const reference = isMobile ? TWO_UP_MOBILE_REFERENCE_SIZE : TWO_UP_DESKTOP_REFERENCE_SIZE;
    const widthRatio = size.width / reference.width;
    const heightRatio = size.height / reference.height;
    const proportionalRatio = widthRatio * 0.76 + heightRatio * 0.24;

    return MathUtils.clamp(proportionalRatio, isMobile ? 0.92 : 0.84, isMobile ? 1.12 : 1.18);
  }, [isMobile, size.height, size.width]);
};

const getTwoUpObjectLayer = (modelUrl: string) => {
  if (isUniverseModel(modelUrl)) {
    return TWO_UP_UNIVERSE_LIGHT_LAYER;
  }

  if (isSamplePackModel(modelUrl)) {
    return TWO_UP_SAMPLE_PACK_LIGHT_LAYER;
  }

  return undefined;
};

const TwoUpScene = ({ leftUrl, rightUrl, isMobile }: TwoUpSceneProps) => {
  const visibleModelUrls = [leftUrl, rightUrl];
  const { bloomSettings } = getScenePresentation(visibleModelUrls);
  const leftOpacity = useRef(1);
  const rightOpacity = useRef(1);
  const activeLeftSlot = isMobile ? TWO_UP_MOBILE_SLOTS.left : TWO_UP_DESKTOP_SLOTS.left;
  const activeRightSlot = isMobile ? TWO_UP_MOBILE_SLOTS.right : TWO_UP_DESKTOP_SLOTS.right;
  const universeViewportScaleMultiplier = useResponsiveUniverseScale(isMobile);
  const samplePackSlot = isSamplePackModel(leftUrl)
    ? activeLeftSlot
    : isSamplePackModel(rightUrl)
      ? activeRightSlot
      : null;
  const hasUniverseModel = isUniverseModel(leftUrl) || isUniverseModel(rightUrl);

  return (
    <>
      <TwoUpSceneCameraLayers />
      {samplePackSlot ? (
        <>
          <DetailStyleLights lightLayer={TWO_UP_SAMPLE_PACK_LIGHT_LAYER} />
          <SamplePackAccentLight
            position={samplePackSlot.pos}
            lightLayer={TWO_UP_SAMPLE_PACK_LIGHT_LAYER}
          />
        </>
      ) : null}
      {hasUniverseModel ? (
        <SceneLights lightRig="universe" lightLayer={TWO_UP_UNIVERSE_LIGHT_LAYER} />
      ) : null}

      <Suspense fallback={null}>
        <SlotModel
          key={`two-up-left-${leftUrl}`}
          modelUrl={leftUrl}
          slotConfig={activeLeftSlot}
          opacityRef={leftOpacity}
          isMobile={isMobile}
          objectLayer={getTwoUpObjectLayer(leftUrl)}
          viewportScaleMultiplier={isUniverseModel(leftUrl) ? universeViewportScaleMultiplier : 1}
        />
      </Suspense>

      <Suspense fallback={null}>
        <SlotModel
          key={`two-up-right-${rightUrl}`}
          modelUrl={rightUrl}
          slotConfig={activeRightSlot}
          opacityRef={rightOpacity}
          isMobile={isMobile}
          objectLayer={getTwoUpObjectLayer(rightUrl)}
          viewportScaleMultiplier={isUniverseModel(rightUrl) ? universeViewportScaleMultiplier : 1}
        />
      </Suspense>

      {bloomSettings ? <SceneBloom {...bloomSettings} /> : null}
    </>
  );
};

interface ProductInfoPanelProps {
  product: Product;
  onAdd: () => void;
}

const ProductInfoPanel = ({ product, onAdd }: ProductInfoPanelProps) => {
  const deliveryNote = getDigitalDeliveryNote(product);

  return (
    <div className="flex h-full min-h-0 flex-col items-center justify-center gap-4 text-center md:gap-5">
      <div className="space-y-2">
        <p className="text-[0.58rem] uppercase tracking-[0.42em] text-black/38">
          {getProductFulfillmentLabel(product)}
        </p>
        <h2 className="text-sm uppercase tracking-[0.24em] md:text-base lg:text-lg">
          {product.name}
        </h2>
        {deliveryNote ? (
          <p className="text-[0.56rem] uppercase tracking-[0.28em] text-black/44">
            {deliveryNote}
          </p>
        ) : null}
      </div>

      <p className="text-[0.7rem] uppercase tracking-[0.34em] text-black/58">
        {getProductPriceLabel(product)}
      </p>

      <div className="flex flex-wrap items-center justify-center gap-4 md:gap-5">
        <button
          type="button"
          onClick={onAdd}
          className="add-to-cart-button rounded-full px-4 py-1.5 text-[0.62rem] uppercase tracking-[0.34em] transition duration-200 hover:bg-white/65 md:px-5"
        >
          Add to cart
        </button>
        <Link
          href={`/store/${product.slug}`}
          className="text-[0.62rem] uppercase tracking-[0.34em] text-black/52 transition duration-200 hover:text-black"
        >
          Details
        </Link>
      </div>
    </div>
  );
};

interface TwoUpStoreShowcaseProps {
  products: [Product, Product];
  isMobile: boolean;
  onAddProduct: (product: Product) => void;
}

const TwoUpStoreShowcase = ({ products, isMobile, onAddProduct }: TwoUpStoreShowcaseProps) => {
  const [leftProduct, rightProduct] = products;
  const leftUrl = modelUrlsByProductId[leftProduct.id];
  const rightUrl = modelUrlsByProductId[rightProduct.id];

  if (!leftUrl || !rightUrl) {
    return null;
  }

  return (
    <div
      aria-label="Store products"
      className={
        isMobile
          ? 'showcase-transition-carousel relative w-full'
          : 'showcase-transition-carousel relative grid w-full min-h-0 overflow-hidden'
      }
      style={
        isMobile
          ? undefined
          : {
              height: getStoreViewportHeight(false),
              gridTemplateRows: 'minmax(0, 1.04fr) minmax(0, 0.96fr)',
            }
      }
    >
      <div className="relative min-h-0" style={isMobile ? { height: TWO_UP_MOBILE_CANVAS_HEIGHT } : undefined}>
        <ThreeCanvas
          className="h-full w-full"
          camera={
            isMobile ? { position: [0, 0.22, 9.25], fov: 42 } : { position: [0, 0.34, 7.45], fov: 36 }
          }
          performanceMode="auto"
        >
          <TwoUpScene leftUrl={leftUrl} rightUrl={rightUrl} isMobile={isMobile} />
        </ThreeCanvas>

        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0"
          style={{
            background:
              isMobile
                ? 'radial-gradient(ellipse 96% 82% at 50% 48%, transparent 51%, rgba(255,255,255,0.92) 100%)'
                : 'radial-gradient(ellipse 92% 82% at 50% 58%, transparent 50%, rgba(255,255,255,0.92) 100%)',
          }}
        />
      </div>

      <div
        className={
          isMobile
            ? 'relative z-10 px-6 pb-8 pt-5 sm:px-8'
            : 'relative z-10 min-h-0 px-6 pb-2 pt-2 sm:px-8 md:px-10 md:pb-8 md:pt-4 lg:px-14'
        }
      >
        <div
          className={
            isMobile
              ? 'relative grid grid-cols-1 gap-8'
              : 'relative grid h-full min-h-0 grid-cols-1 grid-rows-2 gap-6 md:grid-cols-2 md:grid-rows-1 md:gap-10'
          }
        >
          <div className="hidden md:block md:absolute md:left-1/2 md:top-4 md:h-[calc(100%-2rem)] md:w-px md:-translate-x-1/2 md:bg-black/8" />
          <ProductInfoPanel product={leftProduct} onAdd={() => onAddProduct(leftProduct)} />
          <ProductInfoPanel product={rightProduct} onAdd={() => onAddProduct(rightProduct)} />
        </div>
      </div>
    </div>
  );
};

interface StoreCarouselProps {
  products: Product[];
}

export const StoreCarousel = ({ products }: StoreCarouselProps) => {
  const addItem = useCartStore((state) => state.addItem);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [isAnimating, setIsAnimating] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false);
  const phaseRef = useRef<Phase>('idle');
  const pendingDelta = useRef<-1 | 1>(1);
  const descRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const mobileQuery = window.matchMedia('(max-width: 767px)');
    const reducedMotionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    setIsMobile(mobileQuery.matches);
    setPrefersReducedMotion(reducedMotionQuery.matches);

    const handleMobileChange = (event: MediaQueryListEvent) => setIsMobile(event.matches);
    const handleMotionChange = (event: MediaQueryListEvent) =>
      setPrefersReducedMotion(event.matches);

    mobileQuery.addEventListener('change', handleMobileChange);
    reducedMotionQuery.addEventListener('change', handleMotionChange);

    return () => {
      mobileQuery.removeEventListener('change', handleMobileChange);
      reducedMotionQuery.removeEventListener('change', handleMotionChange);
    };
  }, []);

  const addProductToCart = useCallback(
    (product: Product) => {
      addItem({
        productId: product.id,
        name: product.name,
        priceCents: product.priceCents,
        currency: product.currency,
        quantity: 1,
        type: product.type,
      });
    },
    [addItem],
  );

  const total = products.length;
  const hasMultiple = total > 1;
  const currProduct = products[wrap(selectedIndex, total)];
  const prevProduct = products[wrap(selectedIndex - 1, total)];
  const nextProduct = products[wrap(selectedIndex + 1, total)];
  const prevUrl =
    hasMultiple && prevProduct ? (modelUrlsByProductId[prevProduct.id] ?? null) : null;
  const centerUrl = currProduct ? (modelUrlsByProductId[currProduct.id] ?? null) : null;
  const nextUrl =
    hasMultiple && nextProduct ? (modelUrlsByProductId[nextProduct.id] ?? null) : null;
  const canUseTwoUp =
    total === 2 &&
    products[0] !== undefined &&
    products[1] !== undefined &&
    Boolean(modelUrlsByProductId[products[0].id]) &&
    Boolean(modelUrlsByProductId[products[1].id]);

  const navigate = useCallback(
    (delta: -1 | 1) => {
      if (!hasMultiple || isAnimating || phaseRef.current !== 'idle') return;
      if (prefersReducedMotion) {
        setSelectedIndex((index) => wrap(index + delta, total));
        return;
      }

      pendingDelta.current = delta;
      phaseRef.current = 'fade-out';
      setIsAnimating(true);
    },
    [hasMultiple, isAnimating, prefersReducedMotion, total],
  );

  const handleFadeOutComplete = useCallback(() => {
    setSelectedIndex((index) => wrap(index + pendingDelta.current, total));
  }, [total]);

  const handleFadeInComplete = useCallback(() => {
    setIsAnimating(false);
  }, []);

  const handleCenterOpacity = useCallback((opacity: number) => {
    if (descRef.current) {
      descRef.current.style.opacity = String(opacity);
    }
  }, []);

  const handleAdd = useCallback(() => {
    if (!currProduct) return;
    addProductToCart(currProduct);
  }, [addProductToCart, currProduct]);

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'ArrowLeft') {
      event.preventDefault();
      navigate(-1);
    }

    if (event.key === 'ArrowRight') {
      event.preventDefault();
      navigate(1);
    }
  };

  if (products.length === 0) {
    return (
      <div className="showcase-transition-carousel flex items-center justify-center py-24 text-sm text-black/55">
        No products available.
      </div>
    );
  }

  if (canUseTwoUp) {
    return (
      <TwoUpStoreShowcase
        products={[products[0], products[1]]}
        isMobile={isMobile}
        onAddProduct={addProductToCart}
      />
    );
  }

  if (!centerUrl || !currProduct) {
    return null;
  }

  return (
    <div
      role="region"
      aria-roledescription="carousel"
      aria-label="Store product carousel"
      tabIndex={0}
      onKeyDown={handleKeyDown}
      className="showcase-transition-carousel relative w-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-black/18 focus-visible:ring-offset-4 focus-visible:ring-offset-white/60"
      style={{ height: getStoreViewportHeight(isMobile) }}
    >
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

      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            'radial-gradient(ellipse 90% 85% at 50% 42%, transparent 48%, rgba(255,255,255,0.92) 100%)',
        }}
      />

      {hasMultiple ? (
        <p className="pointer-events-none absolute right-5 top-5 z-10 text-[0.58rem] uppercase tracking-[0.38em] text-black/35">
          {selectedIndex + 1} / {total}
        </p>
      ) : null}

      {hasMultiple ? (
        <>
          <button
            type="button"
            onClick={() => navigate(-1)}
            disabled={isAnimating}
            aria-label="Show previous product"
            className="absolute left-4 top-1/2 z-10 inline-flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full border border-black/12 bg-white/50 text-base backdrop-blur-sm transition duration-200 hover:border-black/28 hover:bg-white/72 disabled:cursor-not-allowed disabled:opacity-35 md:bottom-52 md:left-6 md:top-auto md:h-14 md:w-14 md:translate-y-0 md:text-lg"
          >
            <span aria-hidden="true">&larr;</span>
          </button>
          <button
            type="button"
            onClick={() => navigate(1)}
            disabled={isAnimating}
            aria-label="Show next product"
            className="absolute right-4 top-1/2 z-10 inline-flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full border border-black/12 bg-white/50 text-base backdrop-blur-sm transition duration-200 hover:border-black/28 hover:bg-white/72 disabled:cursor-not-allowed disabled:opacity-35 md:bottom-52 md:right-6 md:top-auto md:h-14 md:w-14 md:translate-y-0 md:text-lg"
          >
            <span aria-hidden="true">&rarr;</span>
          </button>
        </>
      ) : null}

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
              {getProductFulfillmentLabel(currProduct)}
            </p>
            <h2 className="mt-0.5 text-base uppercase tracking-[0.22em] md:text-lg">
              {currProduct.name}
            </h2>
            {getDigitalDeliveryNote(currProduct) ? (
              <p className="mt-2 text-[0.56rem] uppercase tracking-[0.28em] text-black/46">
                {getDigitalDeliveryNote(currProduct)}
              </p>
            ) : null}
          </div>

          <p className="text-[0.7rem] uppercase tracking-[0.34em] text-black/60">
            {getProductPriceLabel(currProduct)}
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
