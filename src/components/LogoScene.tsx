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
const BASE_SPIN_X = 1.2;
const BASE_SPIN_Y = 0.42;
const MOUSE_SPEED_X = 2.8;
const MOUSE_SPEED_Y = 2.1;
const MOUSE_ACCEL = 14;
const VELOCITY_DAMPING = 4.5;
const HOME_SPRING = 3.2;
const EDGE_THRESHOLD = 0.72;
const EDGE_RETURN_FORCE = 16;

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
  const angularVelocityRef = useRef<PointerPosition>({
    // Axis speed asymmetry: X base spin is intentionally faster than Y.
    x: BASE_SPIN_X,
    y: BASE_SPIN_Y,
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

    const frameDelta = Math.min(delta, 0.05);
    const pointerX = MathUtils.clamp(pointerRef.current.x, -1, 1);
    const pointerY = MathUtils.clamp(pointerRef.current.y, -1, 1);
    const centerDistance = Math.min(Math.hypot(pointerX, pointerY), 1.5);
    const edgeDistance = Math.max(Math.abs(pointerX), Math.abs(pointerY));
    const edgeFactor = MathUtils.clamp((edgeDistance - EDGE_THRESHOLD) / (1 - EDGE_THRESHOLD), 0, 1);

    const velocity = angularVelocityRef.current;
    const rotation = groupRef.current.rotation;

    const targetVelocityX =
      BASE_SPIN_X +
      pointerY * MOUSE_SPEED_X * (0.7 + centerDistance) +
      Math.sign(pointerY || 1) * edgeFactor * MOUSE_SPEED_X * 2.4;
    const targetVelocityY =
      BASE_SPIN_Y +
      pointerX * MOUSE_SPEED_Y * (0.7 + centerDistance) +
      Math.sign(pointerX || 1) * edgeFactor * MOUSE_SPEED_Y * 2.1;

    const accelGain = MOUSE_ACCEL * (1 + centerDistance * 1.3 + edgeFactor * 2.2);
    velocity.x += (targetVelocityX - velocity.x) * accelGain * frameDelta;
    velocity.y += (targetVelocityY - velocity.y) * accelGain * frameDelta;

    // Return-to-origin spin logic: spring + damping keeps motion continuous while pulling toward home pose.
    velocity.x += (-rotation.x * HOME_SPRING - velocity.x * VELOCITY_DAMPING * 0.22) * frameDelta;
    velocity.y += (-rotation.y * HOME_SPRING - velocity.y * VELOCITY_DAMPING * 0.22) * frameDelta;

    // Edge-force behavior: near canvas edges, aggressively increase corrective torque toward origin.
    if (edgeFactor > 0) {
      velocity.x += -rotation.x * EDGE_RETURN_FORCE * edgeFactor * frameDelta;
      velocity.y += -rotation.y * EDGE_RETURN_FORCE * edgeFactor * frameDelta;
    }

    rotation.x = MathUtils.clamp(rotation.x + velocity.x * frameDelta, -MAX_ROTATION, MAX_ROTATION);
    rotation.y = MathUtils.clamp(rotation.y + velocity.y * frameDelta, -MAX_ROTATION, MAX_ROTATION);
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
