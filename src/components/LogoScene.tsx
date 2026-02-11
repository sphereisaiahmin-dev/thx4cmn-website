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
const BASE_ROTATION_X_SPEED = 1.25;
const BASE_ROTATION_Y_SPEED = 0.42;
const CONTINUOUS_DRIFT_X = 0.12;
const CONTINUOUS_DRIFT_Y = 0.05;
const MOUSE_SPEED_FORCE = 6.8;
const MOUSE_ACCEL_FORCE = 14.2;
const EDGE_THRESHOLD = 0.72;
const EDGE_FORCE_MULTIPLIER = 4.6;
const ORIENTATION_HOME_FORCE = 2.8;
const ORIENTATION_DAMPING = 3.2;
const POSITION_OUTBOUND_LERP = 0.035;
const POSITION_INBOUND_LERP = 0.32;

type PointerPosition = {
  x: number;
  y: number;
};

const LogoModel = ({ modelUrl, scale }: { modelUrl: string; scale: number }) => {
  const { scene } = useGLTF(modelUrl);
  return <primitive object={scene} scale={scale} />;
};

const getHomeAngleError = (angle: number) => MathUtils.euclideanModulo(angle + Math.PI, Math.PI * 2) - Math.PI;

const LogoRig = ({ modelUrl, scale }: { modelUrl: string; scale: number }) => {
  const groupRef = useRef<Group>(null);
  const pointerRef = useRef<PointerPosition>({ x: 0, y: 0 });
  const angularVelocityRef = useRef<PointerPosition>({
    // Axis speed asymmetry: X keeps a faster baseline spin than Y.
    x: BASE_ROTATION_X_SPEED,
    y: BASE_ROTATION_Y_SPEED,
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

    const pointerX = pointerRef.current.x;
    const pointerY = pointerRef.current.y;
    const pointerRadius = Math.min(1, Math.hypot(pointerX, pointerY));
    const edgeBlend = MathUtils.clamp((pointerRadius - EDGE_THRESHOLD) / (1 - EDGE_THRESHOLD), 0, 1);

    const homeErrorX = getHomeAngleError(groupRef.current.rotation.x);
    const homeErrorY = getHomeAngleError(groupRef.current.rotation.y);

    // Keep a slight continuous rotation running regardless of pointer force.
    const baseForceX = BASE_ROTATION_X_SPEED + pointerY * MOUSE_SPEED_FORCE;
    const baseForceY = BASE_ROTATION_Y_SPEED + pointerX * MOUSE_SPEED_FORCE;

    // Edge force ramps up near canvas bounds to keep the energetic "snap" response.
    const edgeForceX = -homeErrorX * ORIENTATION_HOME_FORCE * edgeBlend * EDGE_FORCE_MULTIPLIER;
    const edgeForceY = -homeErrorY * ORIENTATION_HOME_FORCE * edgeBlend * EDGE_FORCE_MULTIPLIER;
    // Return-to-origin spin logic: pull back to 0deg/360deg (home pose), not an offset angle.
    const homeForceX = -homeErrorX * ORIENTATION_HOME_FORCE;
    const homeForceY = -homeErrorY * ORIENTATION_HOME_FORCE;

    const baseInfluence = 1 - edgeBlend * 0.9;
    const accelX = (baseForceX * baseInfluence + homeForceX + edgeForceX) * MOUSE_ACCEL_FORCE;
    const accelY = (baseForceY * baseInfluence + homeForceY + edgeForceY) * MOUSE_ACCEL_FORCE;

    angularVelocityRef.current.x += accelX * delta;
    angularVelocityRef.current.y += accelY * delta;

    const damping = Math.exp(-ORIENTATION_DAMPING * delta);
    angularVelocityRef.current.x *= damping;
    angularVelocityRef.current.y *= damping;

    groupRef.current.rotation.x += (angularVelocityRef.current.x + CONTINUOUS_DRIFT_X) * delta;
    groupRef.current.rotation.y += (angularVelocityRef.current.y + CONTINUOUS_DRIFT_Y) * delta;

    const targetPosX = pointerX * 0.2;
    const targetPosY = pointerY * 0.14;
    const toCenterDistance = Math.hypot(groupRef.current.position.x, groupRef.current.position.y);
    const targetDistance = Math.hypot(targetPosX, targetPosY);
    const movingTowardOrigin = targetDistance < toCenterDistance;
    const positionLerp = movingTowardOrigin ? POSITION_INBOUND_LERP : POSITION_OUTBOUND_LERP;

    groupRef.current.position.x = MathUtils.lerp(groupRef.current.position.x, targetPosX, positionLerp);
    groupRef.current.position.y = MathUtils.lerp(groupRef.current.position.y, targetPosY, positionLerp);
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
