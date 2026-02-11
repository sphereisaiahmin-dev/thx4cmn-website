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
const BASE_ROTATION_SPEED_X = MathUtils.degToRad(0.7);
const BASE_ROTATION_SPEED_Y = MathUtils.degToRad(1.6);
const MAX_DIRECTION_BIAS_X = MathUtils.degToRad(0.5);
const MAX_DIRECTION_BIAS_Y = MathUtils.degToRad(1.1);
const MAX_SPEED_BOOST = MathUtils.degToRad(0.9);
const MIN_ACCEL_RESPONSE = 1.1;
const MAX_ACCEL_RESPONSE = 2.6;
const POINTER_SMOOTHING = 0.08;

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
  const smoothPointerRef = useRef<PointerPosition>({ x: 0, y: 0 });
  // Persist angular velocity so pointer changes only steer momentum, never restart rotation phase.
  const rotationVelocityRef = useRef<PointerPosition>({
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

    smoothPointerRef.current.x = MathUtils.lerp(
      smoothPointerRef.current.x,
      pointerRef.current.x,
      POINTER_SMOOTHING,
    );
    smoothPointerRef.current.y = MathUtils.lerp(
      smoothPointerRef.current.y,
      pointerRef.current.y,
      POINTER_SMOOTHING,
    );

    const pointerMagnitude = Math.min(
      1,
      Math.hypot(smoothPointerRef.current.x, smoothPointerRef.current.y),
    );

    const targetVelocityX =
      BASE_ROTATION_SPEED_X +
      smoothPointerRef.current.y * MAX_DIRECTION_BIAS_X +
      smoothPointerRef.current.y * pointerMagnitude * MAX_SPEED_BOOST * 0.35;
    const targetVelocityY =
      BASE_ROTATION_SPEED_Y +
      smoothPointerRef.current.x * MAX_DIRECTION_BIAS_Y +
      smoothPointerRef.current.x * pointerMagnitude * MAX_SPEED_BOOST;

    const accelResponse = MathUtils.lerp(
      MIN_ACCEL_RESPONSE,
      MAX_ACCEL_RESPONSE,
      pointerMagnitude,
    );
    const step = 1 - Math.exp(-accelResponse * delta);

    rotationVelocityRef.current.x = MathUtils.lerp(
      rotationVelocityRef.current.x,
      targetVelocityX,
      step,
    );
    rotationVelocityRef.current.y = MathUtils.lerp(
      rotationVelocityRef.current.y,
      targetVelocityY,
      step,
    );

    // Integrate continuously from current angles so interaction never resets the timeline.
    groupRef.current.rotation.x = MathUtils.euclideanModulo(
      groupRef.current.rotation.x + rotationVelocityRef.current.x * delta,
      MathUtils.TAU,
    );
    groupRef.current.rotation.y = MathUtils.euclideanModulo(
      groupRef.current.rotation.y + rotationVelocityRef.current.y * delta,
      MathUtils.TAU,
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
