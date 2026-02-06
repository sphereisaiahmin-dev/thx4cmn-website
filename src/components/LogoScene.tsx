'use client';

import { Center, Html, useGLTF } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import { Suspense, useRef } from 'react';
import { MathUtils, type Group } from 'three';

import { ThreeCanvas } from './ThreeCanvas';

const LOGO_MODEL_URL = '/api/3d/thx4cmnlogo.glb';
const LOGO_SCALE = 2;

const LogoModel = () => {
  const { scene } = useGLTF(LOGO_MODEL_URL);
  return <primitive object={scene} scale={LOGO_SCALE} />;
};

const LogoRig = () => {
  const groupRef = useRef<Group>(null);

  useFrame(({ pointer }) => {
    if (!groupRef.current) return;

    const targetX = MathUtils.clamp(-pointer.y * 0.35, -0.4, 0.4);
    const targetY = MathUtils.clamp(pointer.x * 0.45, -0.6, 0.6);

    groupRef.current.rotation.x = MathUtils.lerp(
      groupRef.current.rotation.x,
      targetX,
      0.08,
    );
    groupRef.current.rotation.y = MathUtils.lerp(
      groupRef.current.rotation.y,
      targetY,
      0.08,
    );
  });

  return (
    <group ref={groupRef}>
      <Center>
        <LogoModel />
      </Center>
    </group>
  );
};

export const LogoScene = () => {
  return (
    <ThreeCanvas
      className="h-[320px] w-full"
      camera={{ position: [0, 0, 4.6], fov: 40 }}
    >
      <ambientLight intensity={0.8} />
      <directionalLight position={[4, 4, 4]} intensity={1.2} />
      <Suspense fallback={<Html center className="text-xs text-black/50">Loading logo…</Html>}>
        <LogoRig />
      </Suspense>
    </ThreeCanvas>
  );
};

useGLTF.preload(LOGO_MODEL_URL);
