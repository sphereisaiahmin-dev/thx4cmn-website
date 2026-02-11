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
const BASE_ROTATION_SPEED_X = MathUtils.degToRad(1.5);
const BASE_ROTATION_SPEED_Y = MathUtils.degToRad(4);
const MAX_MOUSE_SPEED_BIAS_X = MathUtils.degToRad(2.5);
const MAX_MOUSE_SPEED_BIAS_Y = MathUtils.degToRad(6);
const BASE_ACCELERATION = 0.06;
const MAX_ACCELERATION = 0.14;
const POINTER_SMOOTHING = 0.07;

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
  const smoothedPointerRef = useRef<PointerPosition>({ x: 0, y: 0 });
  const angularVelocityRef = useRef<PointerPosition>({
    x: BASE_ROTATION_SPEED_X,
    y: BASE_ROTATION_SPEED_Y,
  });

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

    smoothedPointerRef.current.x = MathUtils.lerp(
      smoothedPointerRef.current.x,
      pointerRef.current.x,
      POINTER_SMOOTHING,
    );
    smoothedPointerRef.current.y = MathUtils.lerp(
      smoothedPointerRef.current.y,
      pointerRef.current.y,
      POINTER_SMOOTHING,
    );

    const pointerMagnitude = Math.min(
      1,
      Math.hypot(smoothedPointerRef.current.x, smoothedPointerRef.current.y),
    );
    const speedScale = 1 + pointerMagnitude * 0.4;

    const targetVelocityX =
      BASE_ROTATION_SPEED_X * speedScale +
      smoothedPointerRef.current.y * MAX_MOUSE_SPEED_BIAS_X;
    const targetVelocityY =
      BASE_ROTATION_SPEED_Y * speedScale +
      smoothedPointerRef.current.x * MAX_MOUSE_SPEED_BIAS_Y;

    const acceleration = MathUtils.lerp(
      BASE_ACCELERATION,
      MAX_ACCELERATION,
      pointerMagnitude,
    );
    const easedAcceleration = MathUtils.clamp(acceleration * delta * 60, 0, 1);

    angularVelocityRef.current.x = MathUtils.lerp(
      angularVelocityRef.current.x,
      targetVelocityX,
      easedAcceleration,
    );
    angularVelocityRef.current.y = MathUtils.lerp(
      angularVelocityRef.current.y,
      targetVelocityY,
      easedAcceleration,
    );

    // Keep the current phase and momentum continuous; only velocity is influenced by mouse input.
    groupRef.current.rotation.x += angularVelocityRef.current.x * delta;
    groupRef.current.rotation.y += angularVelocityRef.current.y * delta;
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
