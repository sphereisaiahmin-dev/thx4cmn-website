'use client';

import type { PropsWithChildren } from 'react';
import type { CanvasProps } from '@react-three/fiber';
import { Canvas } from '@react-three/fiber';

interface ThreeCanvasProps extends Omit<CanvasProps, 'children'> {
  className?: string;
  containerClassName?: string;
}

export const ThreeCanvas = ({
  className,
  containerClassName,
  children,
  ...props
}: PropsWithChildren<ThreeCanvasProps>) => {
  return (
    <div className={containerClassName}>
      <Canvas
        className={className}
        dpr={[1, 2]}
        gl={{ antialias: true, alpha: true }}
        {...props}
      >
        {children}
      </Canvas>
    </div>
  );
};
