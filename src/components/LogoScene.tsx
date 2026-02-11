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

type PointerPosition = {
  x: number;
  y: number;
};

type AngularVelocity = {
  x: number;
  y: number;
};

// Axis speed asymmetry: X keeps a faster baseline spin than Y.
const BASE_ANGULAR_VELOCITY_X = 0.55;
const BASE_ANGULAR_VELOCITY_Y = 0.22;
const BASE_SPEED_MIN_SCALE_NEAR_HOME = 0.45;
const BASE_SPEED_MAX_SCALE_AWAY_FROM_HOME = 1.2;

const POINTER_ACCELERATION_X = 2.8;
const POINTER_ACCELERATION_Y = 2.3;
const EDGE_THRESHOLD = 0.82;
const EDGE_ACCELERATION_BOOST = 3.8;
const BASE_RETURN_TO_ORIGIN_FORCE = 0.9;
const EDGE_RETURN_TO_ORIGIN_FORCE = 2.7;

const LogoModel = ({ modelUrl, scale }: { modelUrl: string; scale: number }) => {
  const { scene } = useGLTF(modelUrl);
  return <primitive object={scene} scale={scale} />;
};

const LogoRig = ({ modelUrl, scale }: { modelUrl: string; scale: number }) => {
  const groupRef = useRef<Group>(null);
  const pointerRef = useRef<PointerPosition>({ x: 0, y: 0 });
  const velocityRef = useRef<AngularVelocity>({ x: BASE_ANGULAR_VELOCITY_X, y: BASE_ANGULAR_VELOCITY_Y });

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

    const rotation = groupRef.current.rotation;
    const pointerX = pointerRef.current.x;
    const pointerY = pointerRef.current.y;

    const pointerDistanceFromCenter = Math.min(1, Math.hypot(pointerX, pointerY));
    const pointerInfluence = pointerDistanceFromCenter ** 2;

    const homeDistance = Math.min(1, Math.hypot(rotation.x, rotation.y) / MAX_ROTATION);
    const homeSpeedScale = MathUtils.lerp(
      BASE_SPEED_MIN_SCALE_NEAR_HOME,
      BASE_SPEED_MAX_SCALE_AWAY_FROM_HOME,
      homeDistance,
    );

    const baseVelocityX = BASE_ANGULAR_VELOCITY_X * homeSpeedScale;
    const baseVelocityY = BASE_ANGULAR_VELOCITY_Y * homeSpeedScale;

    // Edge-force behavior: as the pointer nears canvas extents, acceleration gets aggressively boosted.
    const edgeIntensity = MathUtils.clamp(
      (pointerDistanceFromCenter - EDGE_THRESHOLD) / (1 - EDGE_THRESHOLD),
      0,
      1,
    );
    const edgeBoost = 1 + edgeIntensity * EDGE_ACCELERATION_BOOST;

    const accelerationX = (-pointerY * POINTER_ACCELERATION_X * pointerInfluence) * edgeBoost;
    const accelerationY = (pointerX * POINTER_ACCELERATION_Y * pointerInfluence) * edgeBoost;

    // Return-to-origin spin logic: stronger restoring torque near edges pushes motion back toward home pose.
    const returnToOriginForce =
      BASE_RETURN_TO_ORIGIN_FORCE + edgeIntensity * EDGE_RETURN_TO_ORIGIN_FORCE;

    velocityRef.current.x += (accelerationX - rotation.x * returnToOriginForce) * delta;
    velocityRef.current.y += (accelerationY - rotation.y * returnToOriginForce) * delta;

    const responseScale = 1 + pointerInfluence * 2.5;
    const baseSnap = 1 - Math.exp(-1.9 * responseScale * delta);
    velocityRef.current.x = MathUtils.lerp(velocityRef.current.x, baseVelocityX, baseSnap);
    velocityRef.current.y = MathUtils.lerp(velocityRef.current.y, baseVelocityY, baseSnap);

    const damping = Math.exp(-(1.2 + pointerInfluence * 1.8) * delta);
    velocityRef.current.x *= damping;
    velocityRef.current.y *= damping;

    rotation.x = MathUtils.clamp(rotation.x + velocityRef.current.x * delta, -MAX_ROTATION, MAX_ROTATION);
    rotation.y = MathUtils.clamp(rotation.y + velocityRef.current.y * delta, -MAX_ROTATION, MAX_ROTATION);
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
