'use client';

import { ProductModelScene } from '@/components/ProductModelScene';
import { modelUrlsByProductId } from '@/components/productModelUrls';

interface CompactProductModelProps {
  productId: string;
  productName: string;
  className?: string;
}

const compactScaleByProductId: Record<string, number> = {
  'universe-vol-1': 0.32,
};

const compactUniversePointIntensity = {
  opacity: 0.58,
  glowBoost: 0.45,
  pointSizeScale: 0.68,
};

export const CompactProductModel = ({
  productId,
  productName,
  className,
}: CompactProductModelProps) => {
  const modelUrl = modelUrlsByProductId[productId];

  if (!modelUrl) {
    return null;
  }

  return (
    <div
      className={[
        'h-20 w-20 shrink-0 overflow-hidden rounded-lg border border-black/10 bg-transparent sm:h-24 sm:w-24',
        className,
      ]
        .filter(Boolean)
        .join(' ')}
      aria-label={`${productName} 3D model`}
    >
      <ProductModelScene
        modelUrl={modelUrl}
        className="h-full w-full"
        performanceMode="constrained"
        presentationScaleMultiplier={compactScaleByProductId[productId] ?? 0.9}
        universeLightIntensityMultiplier={productId === 'universe-vol-1' ? 0.42 : 1}
        universePointIntensity={
          productId === 'universe-vol-1' ? compactUniversePointIntensity : undefined
        }
      />
    </div>
  );
};
