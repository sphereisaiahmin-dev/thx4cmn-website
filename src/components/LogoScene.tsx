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
const BASE_X_ANGULAR_VELOCITY = 0.5;
const BASE_Y_ANGULAR_VELOCITY = 0.2;
const BASE_ACCELERATION = 3.8;
const MOUSE_ACCELERATION_MULTIPLIER = 7.2;
const MOUSE_DIRECTIONAL_FORCE = 1.15;
const MOUSE_SPEED_BOOST = 0.7;
const EDGE_FORCE_THRESHOLD = 0.72;
const EDGE_RETURN_FORCE = 18;
const HOME_SLOW_RADIUS = MathUtils.degToRad(42);
const HOME_SLOW_FLOOR = 0.38;
const MAX_ANGULAR_SPEED = 3.8;

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
  const velocityRef = useRef<PointerPosition>({ x: BASE_X_ANGULAR_VELOCITY, y: BASE_Y_ANGULAR_VELOCITY });

  const shortestAngleToHome = (angle: number) => {
    return MathUtils.euclideanModulo(angle + Math.PI, Math.PI * 2) - Math.PI;
  };

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

    smoothPointerRef.current.x = MathUtils.lerp(smoothPointerRef.current.x, pointerRef.current.x, 0.14);
    smoothPointerRef.current.y = MathUtils.lerp(smoothPointerRef.current.y, pointerRef.current.y, 0.14);

    const pointerX = MathUtils.clamp(smoothPointerRef.current.x, -1, 1);
    const pointerY = MathUtils.clamp(smoothPointerRef.current.y, -1, 1);
    const radialDistance = MathUtils.clamp(Math.hypot(pointerX, pointerY) / Math.SQRT2, 0, 1);

    const edgeDistance = Math.max(Math.abs(pointerX), Math.abs(pointerY));
    // Edge-force behavior: boost force rapidly near canvas extents for energetic response.
    const edgeForce = MathUtils.clamp((edgeDistance - EDGE_FORCE_THRESHOLD) / (1 - EDGE_FORCE_THRESHOLD), 0, 1);

    const rotationToHomeX = shortestAngleToHome(groupRef.current.rotation.x);
    const rotationToHomeY = shortestAngleToHome(groupRef.current.rotation.y);

    const homeSlowX = MathUtils.clamp(Math.abs(rotationToHomeX) / HOME_SLOW_RADIUS, HOME_SLOW_FLOOR, 1);
    const homeSlowY = MathUtils.clamp(Math.abs(rotationToHomeY) / HOME_SLOW_RADIUS, HOME_SLOW_FLOOR, 1);

    // Axis speed asymmetry: X keeps a faster baseline spin while Y remains slower.
    const baseVelocityX = BASE_X_ANGULAR_VELOCITY * homeSlowX;
    const baseVelocityY = BASE_Y_ANGULAR_VELOCITY * homeSlowY;

    const directionalForceX = -pointerY * MOUSE_DIRECTIONAL_FORCE;
    const directionalForceY = pointerX * MOUSE_DIRECTIONAL_FORCE;
    const speedBoostX = Math.sign(baseVelocityX + directionalForceX || 1) * radialDistance * MOUSE_SPEED_BOOST;
    const speedBoostY = Math.sign(baseVelocityY + directionalForceY || 1) * radialDistance * MOUSE_SPEED_BOOST;

    const targetVelocityX = baseVelocityX + directionalForceX + speedBoostX;
    const targetVelocityY = baseVelocityY + directionalForceY + speedBoostY;

    const accelGain = BASE_ACCELERATION + radialDistance * MOUSE_ACCELERATION_MULTIPLIER;
    const velocityXError = targetVelocityX - velocityRef.current.x;
    const velocityYError = targetVelocityY - velocityRef.current.y;

    // Return-to-origin spin logic: edge excursions add corrective acceleration toward the home pose.
    const edgeReturnX = -rotationToHomeX * EDGE_RETURN_FORCE * edgeForce;
    const edgeReturnY = -rotationToHomeY * EDGE_RETURN_FORCE * edgeForce;

    velocityRef.current.x += (velocityXError * accelGain + edgeReturnX) * delta;
    velocityRef.current.y += (velocityYError * accelGain + edgeReturnY) * delta;

    velocityRef.current.x = MathUtils.clamp(velocityRef.current.x, -MAX_ANGULAR_SPEED, MAX_ANGULAR_SPEED);
    velocityRef.current.y = MathUtils.clamp(velocityRef.current.y, -MAX_ANGULAR_SPEED, MAX_ANGULAR_SPEED);

    groupRef.current.rotation.x += velocityRef.current.x * delta;
    groupRef.current.rotation.y += velocityRef.current.y * delta;

    groupRef.current.rotation.x = MathUtils.clamp(groupRef.current.rotation.x, -MAX_ROTATION, MAX_ROTATION);
    groupRef.current.rotation.y = MathUtils.clamp(groupRef.current.rotation.y, -MAX_ROTATION, MAX_ROTATION);
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
