'use client';

import { Center, Html, OrbitControls, useGLTF } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import { Suspense, useRef, useState } from 'react';
import { type Group, MathUtils } from 'three';

import { ThreeCanvas } from './ThreeCanvas';

interface ProductModelSceneProps {
  modelUrl: string;
  className?: string;
}

interface ProductModelRigProps {
  modelUrl: string;
  autoRotate: boolean;
  onToggle: () => void;
}

const ProductModel = ({ modelUrl }: { modelUrl: string }) => {
  const { scene } = useGLTF(modelUrl);
  return <primitive object={scene} />;
};

const ProductModelRig = ({ modelUrl, autoRotate, onToggle }: ProductModelRigProps) => {
  const groupRef = useRef<Group>(null);

  useFrame((_, delta) => {
    if (!groupRef.current || !autoRotate) return;
    groupRef.current.rotation.y += delta * 0.6;
    groupRef.current.rotation.y = MathUtils.euclideanModulo(
      groupRef.current.rotation.y,
      Math.PI * 2,
    );
  });

  return (
    <group
      ref={groupRef}
      onClick={(event) => {
        event.stopPropagation();
        onToggle();
      }}
    >
      <Center>
        <ProductModel modelUrl={modelUrl} />
      </Center>
    </group>
  );
};

export const ProductModelScene = ({ modelUrl, className }: ProductModelSceneProps) => {
  const [autoRotate, setAutoRotate] = useState(true);

  return (
    <ThreeCanvas className={className ?? 'h-48 w-full'} camera={{ position: [0, 0, 3.2], fov: 45 }}>
      <ambientLight intensity={0.7} />
      <directionalLight position={[3, 3, 4]} intensity={1.1} />
      <directionalLight position={[-3, -2, 2]} intensity={0.6} />
      <Suspense
        fallback={<Html center className="text-xs text-black/50">Loading model…</Html>}
      >
        <ProductModelRig
          modelUrl={modelUrl}
          autoRotate={autoRotate}
          onToggle={() => setAutoRotate((value) => !value)}
        />
      </Suspense>
      <OrbitControls enablePan={false} enableZoom={false} enableDamping />
    </ThreeCanvas>
  );
};

useGLTF.preload('/api/3d/samplepack.glb');
useGLTF.preload('/api/3d/thxc.glb');
