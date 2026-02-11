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

// Axis speed asymmetry: X keeps a noticeably faster baseline spin than Y.
const BASE_X_ANGULAR_VELOCITY = 1.15;
const BASE_Y_ANGULAR_VELOCITY = 0.42;
const POINTER_SPEED_MULTIPLIER = 3.6;
const POINTER_ACCEL_MULTIPLIER = 6.2;
const EDGE_THRESHOLD = 0.72;
const EDGE_SPIN_MULTIPLIER = 8.8;
const RETURN_TO_HOME_FORCE = 10.5;
const VELOCITY_DAMPING = 0.22;

type PointerPosition = {
  x: number;
  y: number;
};

type RotationState = {
  x: number;
  y: number;
  vx: number;
  vy: number;
};

const LogoModel = ({ modelUrl, scale }: { modelUrl: string; scale: number }) => {
  const { scene } = useGLTF(modelUrl);
  return <primitive object={scene} scale={scale} />;
};

const LogoRig = ({ modelUrl, scale }: { modelUrl: string; scale: number }) => {
  const groupRef = useRef<Group>(null);
  const pointerRef = useRef<PointerPosition>({ x: 0, y: 0 });
  const rotationStateRef = useRef<RotationState>({
    x: 0,
    y: 0,
    vx: BASE_X_ANGULAR_VELOCITY,
    vy: BASE_Y_ANGULAR_VELOCITY,
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

    const state = rotationStateRef.current;
    const pointerX = pointerRef.current.x;
    const pointerY = pointerRef.current.y;
    const centerDistance = MathUtils.clamp(Math.hypot(pointerX, pointerY), 0, 1);
    const edgeFactor = MathUtils.clamp(
      (centerDistance - EDGE_THRESHOLD) / (1 - EDGE_THRESHOLD),
      0,
      1,
    );

    const directionalInputX = -pointerY;
    const directionalInputY = pointerX;

    const desiredVx =
      BASE_X_ANGULAR_VELOCITY * (1 + centerDistance * POINTER_SPEED_MULTIPLIER + edgeFactor * 2.8);
    const desiredVy =
      BASE_Y_ANGULAR_VELOCITY * (1 + centerDistance * (POINTER_SPEED_MULTIPLIER * 0.85) + edgeFactor * 2.2);

    const directionalForceX =
      directionalInputX * POINTER_ACCEL_MULTIPLIER * (1 + centerDistance * 1.8);
    const directionalForceY =
      directionalInputY * POINTER_ACCEL_MULTIPLIER * (1 + centerDistance * 1.8);

    // Edge-force behavior: near canvas edges, apply an aggressive spin impulse.
    const edgeSpinForceX = -Math.sign(state.x || 1) * EDGE_SPIN_MULTIPLIER * edgeFactor * edgeFactor;
    const edgeSpinForceY = -Math.sign(state.y || 1) * EDGE_SPIN_MULTIPLIER * edgeFactor * edgeFactor;

    const signedHomeAngleX = Math.atan2(Math.sin(state.x), Math.cos(state.x));
    const signedHomeAngleY = Math.atan2(Math.sin(state.y), Math.cos(state.y));

    // Return-to-origin spin logic: edge displacement adds corrective torque toward home pose.
    const returnToHomeX = -signedHomeAngleX * RETURN_TO_HOME_FORCE * edgeFactor;
    const returnToHomeY = -signedHomeAngleY * RETURN_TO_HOME_FORCE * edgeFactor;

    const accelerationX =
      (desiredVx - state.vx) * (2 + centerDistance * 3.4) +
      directionalForceX +
      edgeSpinForceX +
      returnToHomeX;
    const accelerationY =
      (desiredVy - state.vy) * (1.5 + centerDistance * 2.8) +
      directionalForceY +
      edgeSpinForceY +
      returnToHomeY;

    state.vx += accelerationX * delta;
    state.vy += accelerationY * delta;

    state.vx *= 1 - VELOCITY_DAMPING * delta;
    state.vy *= 1 - VELOCITY_DAMPING * delta;

    state.x += state.vx * delta;
    state.y += state.vy * delta;

    groupRef.current.rotation.x = state.x;
    groupRef.current.rotation.y = state.y;
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
