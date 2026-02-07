'use client';

import { Center, Html, useGLTF } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import { Suspense, useEffect, useRef } from 'react';
import { MathUtils, type Group } from 'three';

import { ThreeCanvas } from './ThreeCanvas';

const LOGO_MODEL_URL = '/api/3d/thx4cmnlogo.glb';
const LOGO_SCALE = 2;
const LOGO_DEPTH_SCALE = LOGO_SCALE * 2;

type PointerPosition = {
  x: number;
  y: number;
};

const LogoModel = () => {
  const { scene } = useGLTF(LOGO_MODEL_URL);
  return (
    <primitive object={scene} scale={[LOGO_SCALE, LOGO_SCALE, LOGO_DEPTH_SCALE]} />
  );
};

const LogoRig = () => {
  const groupRef = useRef<Group>(null);
  const pointerRef = useRef<PointerPosition>({ x: 0, y: 0 });

  useEffect(() => {
    const handlePointerMove = (event: PointerEvent) => {
      pointerRef.current.x = (event.clientX / window.innerWidth) * 2 - 1;
      pointerRef.current.y = -((event.clientY / window.innerHeight) * 2 - 1);
    };

    window.addEventListener('pointermove', handlePointerMove);

    return () => {
      window.removeEventListener('pointermove', handlePointerMove);
    };
  }, []);

  useFrame(() => {
    if (!groupRef.current) return;

    const targetX = MathUtils.clamp(-pointerRef.current.y * 0.35, -0.4, 0.4);
    const targetY = MathUtils.clamp(pointerRef.current.x * 0.45, -0.6, 0.6);

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

interface LogoSceneProps {
  className?: string;
}

export const LogoScene = ({ className = 'h-[320px] w-full' }: LogoSceneProps) => {
  return (
    <ThreeCanvas
      className={className}
      camera={{ position: [0, 0, 8.5], fov: 40 }}
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
