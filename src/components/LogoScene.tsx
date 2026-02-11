'use client';

import { Center, Html, useGLTF } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import { Suspense, useEffect, useRef } from 'react';
import { MathUtils, type Group } from 'three';

import { ThreeCanvas } from './ThreeCanvas';

const LOGO_MODEL_VERSION = '2024-10-04';
export const LOGO_MODEL_URL = `/api/3d/thx4cmnlogo.glb?v=${LOGO_MODEL_VERSION}`;
export const HEADER_LOGO_MODEL_URL = `/api/3d/thx4cmnlogoheader.glb?v=${LOGO_MODEL_VERSION}`;
const LOGO_SCALE = 2;
export const HEADER_LOGO_SCALE = LOGO_SCALE * 2;
const BASE_X_SPIN = 1.15;
const BASE_Y_SPIN = 0.42;
const POINTER_FORCE = 8.4;
const EDGE_FORCE_THRESHOLD = 0.72;
const EDGE_RETURN_BOOST = 12.5;
const HOME_PULL = 2.25;
const TOWARD_HOME_ACCEL = 1.45;
const AWAY_FROM_HOME_ACCEL = 0.62;

type PointerPosition = {
  x: number;
  y: number;
};

const LogoModel = ({ modelUrl, scale }: { modelUrl: string; scale: number }) => {
  const { scene } = useGLTF(modelUrl);
  return <primitive object={scene} scale={scale} />;
};

const LogoRig = ({ modelUrl, scale }: { modelUrl: string; scale: number }) => {
  const groupRef = useRef<Group>(null);
  const pointerRef = useRef<PointerPosition>({ x: 0, y: 0 });
  const pointerTargetRef = useRef<PointerPosition>({ x: 0, y: 0 });
  const velocityRef = useRef<PointerPosition>({ x: 0, y: 0 });

  const wrapRotation = (value: number) => MathUtils.euclideanModulo(value + Math.PI, Math.PI * 2) - Math.PI;

  useEffect(() => {
    const handlePointerMove = (event: PointerEvent) => {
      pointerTargetRef.current.x = (event.clientX / window.innerWidth) * 2 - 1;
      pointerTargetRef.current.y = -((event.clientY / window.innerHeight) * 2 - 1);
    };

    window.addEventListener('pointermove', handlePointerMove);

    return () => {
      window.removeEventListener('pointermove', handlePointerMove);
    };
  }, []);

  useFrame((_, delta) => {
    if (!groupRef.current) return;

    const pointerLerpFactor = 1 - Math.exp(-delta * 12);
    pointerRef.current.x = MathUtils.lerp(pointerRef.current.x, pointerTargetRef.current.x, pointerLerpFactor);
    pointerRef.current.y = MathUtils.lerp(pointerRef.current.y, pointerTargetRef.current.y, pointerLerpFactor);

    const edgeDistance = Math.max(Math.abs(pointerRef.current.x), Math.abs(pointerRef.current.y));
    // Edge force ramps sharply as the cursor approaches canvas limits.
    const edgeForce = MathUtils.clamp((edgeDistance - EDGE_FORCE_THRESHOLD) / (1 - EDGE_FORCE_THRESHOLD), 0, 1) ** 2;

    const rotationX = wrapRotation(groupRef.current.rotation.x);
    const rotationY = wrapRotation(groupRef.current.rotation.y);

    const pointerForceX = -pointerRef.current.y * POINTER_FORCE * (1 + edgeForce * 1.3);
    const pointerForceY = pointerRef.current.x * POINTER_FORCE * (1 + edgeForce * 1.3);
    // Magnetic return spin pushes the logo back toward home orientation, especially near edges.
    const returnForceX = -rotationX * (HOME_PULL + edgeForce * EDGE_RETURN_BOOST);
    const returnForceY = -rotationY * (HOME_PULL + edgeForce * EDGE_RETURN_BOOST);

    const totalForceX = pointerForceX + returnForceX;
    const totalForceY = pointerForceY + returnForceY;

    const movingTowardHomeX = rotationX * velocityRef.current.x < 0;
    const movingTowardHomeY = rotationY * velocityRef.current.y < 0;
    const accelX = movingTowardHomeX ? TOWARD_HOME_ACCEL : AWAY_FROM_HOME_ACCEL;
    const accelY = movingTowardHomeY ? TOWARD_HOME_ACCEL : AWAY_FROM_HOME_ACCEL;

    velocityRef.current.x += totalForceX * accelX * delta;
    velocityRef.current.y += totalForceY * accelY * delta;

    const damping = Math.exp(-delta * (5.5 + edgeForce * 1.8));
    velocityRef.current.x *= damping;
    velocityRef.current.y *= damping;

    // Keep continuous asymmetric base spin: X faster than Y.
    groupRef.current.rotation.x = wrapRotation(
      groupRef.current.rotation.x + (BASE_X_SPIN + velocityRef.current.x) * delta,
    );
    groupRef.current.rotation.y = wrapRotation(
      groupRef.current.rotation.y + (BASE_Y_SPIN + velocityRef.current.y) * delta,
    );
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
