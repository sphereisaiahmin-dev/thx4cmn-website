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
const MAX_TRAVEL = MAX_ROTATION * 1.35;

// Axis speed asymmetry: keep X noticeably faster than Y at baseline.
const BASE_X_ANGULAR_VELOCITY = 0.58;
const BASE_Y_ANGULAR_VELOCITY = 0.2;
const CENTER_SLOWDOWN = 0.3;

const MOUSE_ACCELERATION = 5.8;
const MOUSE_DIRECTIONAL_PULL = 4.1;
const EDGE_THRESHOLD = 0.72;
const EDGE_FORCE_MULTIPLIER = 2.4;
const EDGE_RETURN_FORCE = 9.5;
const VELOCITY_DAMPING = 5.2;
const POINTER_SMOOTHING = 8;
const MAX_MOUSE_VELOCITY = 3.6;

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
  const pointerTargetRef = useRef<PointerPosition>({ x: 0, y: 0 });
  const pointerRef = useRef<PointerPosition>({ x: 0, y: 0 });
  const velocityRef = useRef<PointerPosition>({ x: 0, y: 0 });

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

    const dt = Math.min(delta, 1 / 24);
    const pointerLerp = 1 - Math.exp(-POINTER_SMOOTHING * dt);
    pointerRef.current.x = MathUtils.lerp(pointerRef.current.x, pointerTargetRef.current.x, pointerLerp);
    pointerRef.current.y = MathUtils.lerp(pointerRef.current.y, pointerTargetRef.current.y, pointerLerp);

    const currentRotation = groupRef.current.rotation;
    const pointerMagnitude = Math.min(1, Math.hypot(pointerRef.current.x, pointerRef.current.y));
    const edgeFactor = MathUtils.clamp((pointerMagnitude - EDGE_THRESHOLD) / (1 - EDGE_THRESHOLD), 0, 1);

    const homeDistance = Math.min(1, Math.hypot(currentRotation.x, currentRotation.y) / MAX_TRAVEL);
    const centerWeightedSpeed = CENTER_SLOWDOWN + (1 - CENTER_SLOWDOWN) * homeDistance;

    const baseXVelocity = BASE_X_ANGULAR_VELOCITY * centerWeightedSpeed;
    const baseYVelocity = BASE_Y_ANGULAR_VELOCITY * centerWeightedSpeed;

    const distanceBoost = 0.2 + pointerMagnitude * 1.9;
    const targetX = MathUtils.clamp(-pointerRef.current.y * MAX_ROTATION, -MAX_ROTATION, MAX_ROTATION);
    const targetY = MathUtils.clamp(pointerRef.current.x * MAX_ROTATION, -MAX_ROTATION, MAX_ROTATION);

    const accelX =
      ((-pointerRef.current.y * MOUSE_ACCELERATION + (targetX - currentRotation.x) * MOUSE_DIRECTIONAL_PULL) *
        distanceBoost) *
      (1 + edgeFactor * EDGE_FORCE_MULTIPLIER);
    const accelY =
      ((pointerRef.current.x * MOUSE_ACCELERATION + (targetY - currentRotation.y) * MOUSE_DIRECTIONAL_PULL) *
        distanceBoost) *
      (1 + edgeFactor * EDGE_FORCE_MULTIPLIER);

    // Edge-force behavior: farther from center increases acceleration and spin urgency.
    velocityRef.current.x += accelX * dt;
    velocityRef.current.y += accelY * dt;

    // Return-to-origin spin logic: near edges, add a strong corrective spring toward home pose.
    const edgeHomeSpring = edgeFactor * EDGE_RETURN_FORCE;
    velocityRef.current.x += -currentRotation.x * edgeHomeSpring * dt;
    velocityRef.current.y += -currentRotation.y * edgeHomeSpring * dt;

    const damping = Math.exp(-VELOCITY_DAMPING * dt);
    velocityRef.current.x = MathUtils.clamp(velocityRef.current.x * damping, -MAX_MOUSE_VELOCITY, MAX_MOUSE_VELOCITY);
    velocityRef.current.y = MathUtils.clamp(velocityRef.current.y * damping, -MAX_MOUSE_VELOCITY, MAX_MOUSE_VELOCITY);

    currentRotation.x = MathUtils.clamp(
      currentRotation.x + (baseXVelocity + velocityRef.current.x) * dt,
      -MAX_TRAVEL,
      MAX_TRAVEL,
    );
    currentRotation.y = MathUtils.clamp(
      currentRotation.y + (baseYVelocity + velocityRef.current.y) * dt,
      -MAX_TRAVEL,
      MAX_TRAVEL,
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
