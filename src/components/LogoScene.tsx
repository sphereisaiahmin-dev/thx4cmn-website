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
const TAU = Math.PI * 2;

// Axis speed asymmetry: keep X baseline spin noticeably faster than Y.
const BASE_X_ANGULAR_VELOCITY = 1.1;
const BASE_Y_ANGULAR_VELOCITY = 0.4;
const BASE_VELOCITY_PULL = 5.2;
const MOUSE_FORCE_MULTIPLIER = 12;
const MOUSE_ACCEL_RESPONSE = 8;
const EDGE_THRESHOLD = 0.72;
const EDGE_RETURN_FORCE = 16;
const MAGNETIC_PULL_TOWARD_ORIGIN = 3.8;
const MAGNETIC_PULL_AWAY_FROM_ORIGIN = 1.35;
const ROTATION_DAMPING = 2.2;

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
  const velocityRef = useRef<PointerPosition>({
    x: BASE_X_ANGULAR_VELOCITY,
    y: BASE_Y_ANGULAR_VELOCITY,
  });
  const accelerationRef = useRef<PointerPosition>({ x: 0, y: 0 });

  useEffect(() => {
    const resetPointer = () => {
      pointerRef.current.x = 0;
      pointerRef.current.y = 0;
    };

    const handlePointerMove = (event: PointerEvent) => {
      pointerRef.current.x = (event.clientX / window.innerWidth) * 2 - 1;
      pointerRef.current.y = -((event.clientY / window.innerHeight) * 2 - 1);
    };

    const handlePointerLeaveViewport = (event: PointerEvent) => {
      if (!event.relatedTarget) {
        resetPointer();
      }
    };

    window.addEventListener('pointermove', handlePointerMove);
    document.addEventListener('pointerleave', handlePointerLeaveViewport);
    window.addEventListener('blur', resetPointer);
    window.addEventListener('pointercancel', resetPointer);

    return () => {
      window.removeEventListener('pointermove', handlePointerMove);
      document.removeEventListener('pointerleave', handlePointerLeaveViewport);
      window.removeEventListener('blur', resetPointer);
      window.removeEventListener('pointercancel', resetPointer);
    };
  }, []);

  useFrame((_, delta) => {
    if (!groupRef.current) return;

    const normalizedRotationX = MathUtils.euclideanModulo(
      groupRef.current.rotation.x + Math.PI,
      TAU,
    ) - Math.PI;
    const normalizedRotationY = MathUtils.euclideanModulo(
      groupRef.current.rotation.y + Math.PI,
      TAU,
    ) - Math.PI;

    const distanceFromCenter = Math.min(
      1,
      Math.hypot(pointerRef.current.x, pointerRef.current.y),
    );
    const edgeDistance = Math.max(
      Math.abs(pointerRef.current.x),
      Math.abs(pointerRef.current.y),
    );
    // Edge-force behavior: raise torque sharply near canvas bounds for energetic response.
    const edgeInfluence = MathUtils.clamp(
      (edgeDistance - EDGE_THRESHOLD) / (1 - EDGE_THRESHOLD),
      0,
      1,
    );
    const edgeBoost = edgeInfluence * edgeInfluence;

    const mouseForceScale =
      MOUSE_FORCE_MULTIPLIER * (0.35 + distanceFromCenter * distanceFromCenter * 1.85);
    const mouseForceX = -pointerRef.current.y * mouseForceScale;
    const mouseForceY = pointerRef.current.x * mouseForceScale;

    const toOriginX = -normalizedRotationX;
    const toOriginY = -normalizedRotationY;
    const movingTowardOriginX = velocityRef.current.x * toOriginX > 0;
    const movingTowardOriginY = velocityRef.current.y * toOriginY > 0;

    // Return-to-origin spin logic: stronger pull toward home pose when heading back, softer when drifting away.
    const magneticForceX =
      toOriginX *
      (movingTowardOriginX
        ? MAGNETIC_PULL_TOWARD_ORIGIN
        : MAGNETIC_PULL_AWAY_FROM_ORIGIN);
    const magneticForceY =
      toOriginY *
      (movingTowardOriginY
        ? MAGNETIC_PULL_TOWARD_ORIGIN
        : MAGNETIC_PULL_AWAY_FROM_ORIGIN);

    const edgeReturnForceX = toOriginX * EDGE_RETURN_FORCE * edgeBoost;
    const edgeReturnForceY = toOriginY * EDGE_RETURN_FORCE * edgeBoost;

    const targetAccelerationX =
      (BASE_X_ANGULAR_VELOCITY - velocityRef.current.x) * BASE_VELOCITY_PULL +
      mouseForceX +
      magneticForceX +
      edgeReturnForceX;
    const targetAccelerationY =
      (BASE_Y_ANGULAR_VELOCITY - velocityRef.current.y) * BASE_VELOCITY_PULL +
      mouseForceY +
      magneticForceY +
      edgeReturnForceY;

    const accelSmoothing = 1 - Math.exp(-MOUSE_ACCEL_RESPONSE * delta);
    accelerationRef.current.x = MathUtils.lerp(
      accelerationRef.current.x,
      targetAccelerationX,
      accelSmoothing,
    );
    accelerationRef.current.y = MathUtils.lerp(
      accelerationRef.current.y,
      targetAccelerationY,
      accelSmoothing,
    );

    velocityRef.current.x += accelerationRef.current.x * delta;
    velocityRef.current.y += accelerationRef.current.y * delta;

    const damping = Math.exp(-ROTATION_DAMPING * delta);
    velocityRef.current.x *= damping;
    velocityRef.current.y *= damping;

    groupRef.current.rotation.x = MathUtils.euclideanModulo(
      groupRef.current.rotation.x + velocityRef.current.x * delta + Math.PI,
      TAU,
    ) - Math.PI;
    groupRef.current.rotation.y = MathUtils.euclideanModulo(
      groupRef.current.rotation.y + velocityRef.current.y * delta + Math.PI,
      TAU,
    ) - Math.PI;
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
