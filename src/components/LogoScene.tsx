'use client';

import { Center, Html, useGLTF } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import { Suspense, useRef } from 'react';
import { MathUtils, type Group } from 'three';

import { ThreeCanvas } from './ThreeCanvas';

const LOGO_MODEL_VERSION = '2024-10-04';
export const LOGO_MODEL_URL = `/api/3d/thx4cmnlogo.glb?v=${LOGO_MODEL_VERSION}`;
export const HEADER_LOGO_MODEL_URL = `/api/3d/thx4cmnlogoheader.glb?v=${LOGO_MODEL_VERSION}`;
const LOGO_SCALE = 2;
export const HEADER_LOGO_SCALE = LOGO_SCALE * 2;
const BASE_ROTATION_SPEED = MathUtils.degToRad(28);
const MAX_ROTATION_SPEED = MathUtils.degToRad(34);
const ACCELERATION = MathUtils.degToRad(6);

const LogoModel = ({ modelUrl, scale }: { modelUrl: string; scale: number }) => {
  const { scene } = useGLTF(modelUrl);
  return <primitive object={scene} scale={scale} />;
};

const LogoRig = ({ modelUrl, scale }: { modelUrl: string; scale: number }) => {
  const groupRef = useRef<Group>(null);
  const xAngleRef = useRef(0);
  const yAngleRef = useRef(0);
  const speedRef = useRef(BASE_ROTATION_SPEED);
  const elapsedRef = useRef(0);

  useFrame((_, delta) => {
    if (!groupRef.current) return;

    elapsedRef.current += delta;

    // Smoothly ramp the angular speed to avoid a harsh instant jump on mount.
    speedRef.current = Math.min(
      MAX_ROTATION_SPEED,
      speedRef.current + ACCELERATION * delta,
    );

    const xModulation = 1 + Math.sin(elapsedRef.current * 0.55) * 0.06;
    // Phase/ratio offset keeps X/Y from lining up on exact quarter/half turns.
    const yModulation = 1 + Math.sin(elapsedRef.current * 0.67 + 0.37) * 0.06;

    xAngleRef.current += speedRef.current * xModulation * delta;
    yAngleRef.current += speedRef.current * 1.13 * yModulation * delta;

    groupRef.current.rotation.x = xAngleRef.current;
    groupRef.current.rotation.y = yAngleRef.current;
  });

  return (
    <group ref={groupRef}>
      <Center>
        <LogoModel modelUrl={modelUrl} scale={scale} />
      </Center>
    </group>
  );
};

interface LogoSceneProps {
  className?: string;
  modelUrl?: string;
  modelScale?: number;
}

export const LogoScene = ({
  className = 'h-[320px] w-full',
  modelUrl = LOGO_MODEL_URL,
  modelScale = LOGO_SCALE,
}: LogoSceneProps) => {
  return (
    <ThreeCanvas
      className={className}
      camera={{ position: [0, 0, 8.5], fov: 40 }}
    >
      <ambientLight intensity={0.8} />
      <directionalLight position={[-3, 0, 4]} intensity={1.2} />
      <Suspense fallback={<Html center className="text-xs text-black/50">Loading logo…</Html>}>
        <LogoRig modelUrl={modelUrl} scale={modelScale} />
      </Suspense>
    </ThreeCanvas>
  );
};

useGLTF.preload(LOGO_MODEL_URL);
useGLTF.preload(HEADER_LOGO_MODEL_URL);
