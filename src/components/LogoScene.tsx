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
const MAX_ROTATION = MathUtils.degToRad(90);

// Axis speed asymmetry: X base spin is intentionally faster than Y.
const BASE_ANGULAR_SPEED_X = 0.55;
const BASE_ANGULAR_SPEED_Y = 0.23;
const BASE_SPEED_TRACKING = 3.6;
const MOUSE_ACCEL_X = 8.4;
const MOUSE_ACCEL_Y = 6.4;
const RETURN_SPRING = 2.8;
const RETURN_DAMPING = 1.6;
const EDGE_THRESHOLD = 0.72;

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
  const angularVelocityRef = useRef<PointerPosition>({ x: 0, y: 0 });

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

  useFrame((_, delta) => {
    if (!groupRef.current) return;

    const dt = Math.min(delta, 0.05);
    const rotation = groupRef.current.rotation;
    const velocity = angularVelocityRef.current;

    const pointerX = MathUtils.clamp(pointerRef.current.x, -1, 1);
    const pointerY = MathUtils.clamp(pointerRef.current.y, -1, 1);
    const pointerDistance = Math.min(1, Math.hypot(pointerX, pointerY));
    // Edge-force behavior: near canvas extents we boost the force envelope significantly.
    const edgeProximity = Math.max(Math.abs(pointerX), Math.abs(pointerY));
    const edgeForce = MathUtils.smoothstep(edgeProximity, EDGE_THRESHOLD, 1);
    const mouseEnvelope = pointerDistance * (1 + edgeForce * 2.4);

    const slowNearOriginX = MathUtils.lerp(0.4, 1, MathUtils.smoothstep(Math.abs(rotation.x), 0.02, 0.7));
    const slowNearOriginY = MathUtils.lerp(0.45, 1, MathUtils.smoothstep(Math.abs(rotation.y), 0.02, 0.7));

    const baseTargetVelocityX = BASE_ANGULAR_SPEED_X * slowNearOriginX;
    const baseTargetVelocityY = BASE_ANGULAR_SPEED_Y * slowNearOriginY;

    const baseAccelX = (baseTargetVelocityX - velocity.x) * BASE_SPEED_TRACKING;
    const baseAccelY = (baseTargetVelocityY - velocity.y) * BASE_SPEED_TRACKING;

    const directionalAccelX = -pointerY * MOUSE_ACCEL_X * mouseEnvelope;
    const directionalAccelY = pointerX * MOUSE_ACCEL_Y * mouseEnvelope;

    // Return-to-origin spin logic: stronger spring+damping keeps edge-driven motion energetic but coherent.
    const returnStrength = RETURN_SPRING * (0.45 + edgeForce * 2.1);
    const returnDamping = RETURN_DAMPING * (0.9 + edgeForce);
    const returnAccelX = -rotation.x * returnStrength - velocity.x * returnDamping;
    const returnAccelY = -rotation.y * returnStrength - velocity.y * returnDamping;

    const accelX = baseAccelX + directionalAccelX + returnAccelX;
    const accelY = baseAccelY + directionalAccelY + returnAccelY;

    velocity.x = MathUtils.clamp(velocity.x + accelX * dt, -5.5, 5.5);
    velocity.y = MathUtils.clamp(velocity.y + accelY * dt, -4.5, 4.5);

    rotation.x = MathUtils.clamp(rotation.x + velocity.x * dt, -MAX_ROTATION, MAX_ROTATION);
    rotation.y = MathUtils.clamp(rotation.y + velocity.y * dt, -MAX_ROTATION, MAX_ROTATION);
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
