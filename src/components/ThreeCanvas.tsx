'use client';

import { useEffect, useMemo, useState, type PropsWithChildren } from 'react';
import type { CanvasProps } from '@react-three/fiber';
import { Canvas } from '@react-three/fiber';

type ThreeCanvasPerformanceMode = 'auto' | 'default' | 'constrained';

interface ThreeCanvasProps extends Omit<CanvasProps, 'children'> {
  className?: string;
  containerClassName?: string;
  isActive?: boolean;
  performanceMode?: ThreeCanvasPerformanceMode;
}

export const ThreeCanvas = ({
  className,
  containerClassName,
  isActive = true,
  performanceMode = 'auto',
  children,
  gl,
  frameloop,
  ...props
}: PropsWithChildren<ThreeCanvasProps>) => {
  const [isConstrainedDevice, setIsConstrainedDevice] = useState(false);

  useEffect(() => {
    if (performanceMode !== 'auto' || typeof window === 'undefined') {
      return;
    }

    const runtimeNavigator = navigator as Navigator & { deviceMemory?: number };
    const memory = runtimeNavigator.deviceMemory ?? 8;
    const cpuThreads = runtimeNavigator.hardwareConcurrency ?? 8;
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    setIsConstrainedDevice(memory <= 4 || cpuThreads <= 4 || reducedMotion);
  }, [performanceMode]);

  const useConstrainedProfile =
    performanceMode === 'constrained' || (performanceMode === 'auto' && isConstrainedDevice);
  const resolvedDpr: CanvasProps['dpr'] = useConstrainedProfile ? [1, 1.25] : [1, 2];
  const resolvedFrameloop = frameloop ?? (isActive ? 'always' : 'never');
  const powerPreference = (useConstrainedProfile
    ? 'low-power'
    : 'high-performance') as WebGLPowerPreference;
  const resolvedGl = useMemo(() => {
    if (typeof gl === 'function') {
      return gl;
    }

    return {
      alpha: true,
      antialias: !useConstrainedProfile,
      powerPreference,
      ...(gl ?? {}),
    };
  }, [gl, powerPreference, useConstrainedProfile]);

  return (
    <div className={containerClassName ?? className ?? 'h-full w-full'}>
      <Canvas
        className={['h-full w-full', className].filter(Boolean).join(' ')}
        dpr={resolvedDpr}
        frameloop={resolvedFrameloop}
        gl={resolvedGl}
        {...props}
      >
        {children}
      </Canvas>
    </div>
  );
};
