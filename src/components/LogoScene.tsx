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
// Axis-speed asymmetry: keep X baseline motion noticeably faster than Y.
const BASE_ANGULAR_VELOCITY_X = 0.9;
const BASE_ANGULAR_VELOCITY_Y = 0.35;
const MOUSE_ACCELERATION_X = 6.6;
const MOUSE_ACCELERATION_Y = 5.2;
const EDGE_ACCELERATION_BOOST = 4.8;
const RETURN_TO_ORIGIN_FORCE = 1.05;
const EDGE_RETURN_FORCE_BOOST = 5.4;

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

    const frameDelta = Math.min(delta, 0.05);
    const pointerDistance = MathUtils.clamp(
      Math.hypot(pointerRef.current.x, pointerRef.current.y),
      0,
      1,
    );
    const pointerDrive = pointerDistance * pointerDistance;
    // Edge-force behavior: approaching canvas bounds sharply amplifies acceleration.
    const edgeForce = MathUtils.smoothstep(pointerDistance, 0.7, 0.98);
    const rotation = groupRef.current.rotation;
    const rotationDistance = MathUtils.clamp(
      (Math.abs(rotation.x) + Math.abs(rotation.y)) / (MAX_ROTATION * 2),
      0,
      1,
    );

    const nearOriginSlowdown = 1 - 0.55 * (1 - rotationDistance);
    const baseForceX = BASE_ANGULAR_VELOCITY_X * nearOriginSlowdown;
    const baseForceY = BASE_ANGULAR_VELOCITY_Y * nearOriginSlowdown;
    const mouseForceX = (
      -pointerRef.current.y * MOUSE_ACCELERATION_X +
      Math.sign(-pointerRef.current.y || 1) * EDGE_ACCELERATION_BOOST * edgeForce
    ) * pointerDrive;
    const mouseForceY = (
      pointerRef.current.x * MOUSE_ACCELERATION_Y +
      Math.sign(pointerRef.current.x || 1) * EDGE_ACCELERATION_BOOST * edgeForce
    ) * pointerDrive;
    // Return-to-origin spin logic: stronger restorative torque near edges pulls toward home pose.
    const returnForceScale = RETURN_TO_ORIGIN_FORCE + edgeForce * EDGE_RETURN_FORCE_BOOST;
    const returnForceX = -rotation.x * returnForceScale;
    const returnForceY = -rotation.y * returnForceScale;

    angularVelocityRef.current.x += (baseForceX + mouseForceX + returnForceX) * frameDelta;
    angularVelocityRef.current.y += (baseForceY + mouseForceY + returnForceY) * frameDelta;

    const damping = MathUtils.clamp(0.92 - pointerDrive * 0.07 + edgeForce * 0.02, 0.8, 0.97);
    const frameDamping = Math.pow(damping, frameDelta * 60);
    angularVelocityRef.current.x *= frameDamping;
    angularVelocityRef.current.y *= frameDamping;

    rotation.x = MathUtils.clamp(
      rotation.x + angularVelocityRef.current.x * frameDelta,
      -MAX_ROTATION,
      MAX_ROTATION,
    );
    rotation.y = MathUtils.clamp(
      rotation.y + angularVelocityRef.current.y * frameDelta,
      -MAX_ROTATION,
      MAX_ROTATION,
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
