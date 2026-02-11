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

// Axis speed asymmetry: X keeps a faster baseline spin while Y remains slower.
const BASE_ANGULAR_VELOCITY_X = 1.2;
const BASE_ANGULAR_VELOCITY_Y = 0.45;
const MOUSE_ACCELERATION = 7.5;
const MOUSE_SPEED_MULTIPLIER = 1.35;
const EDGE_THRESHOLD = 0.72;
const EDGE_ACCELERATION_BOOST = 26;
const RETURN_TO_HOME_STIFFNESS = 2.2;
const EDGE_RETURN_BOOST = 18;
const ANGULAR_DAMPING = 3.8;
const MAX_MOUSE_ACCELERATION = 35;

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
  const velocityRef = useRef<PointerPosition>({ x: 0, y: 0 });

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
    const distanceFromCenter = MathUtils.clamp(Math.hypot(pointerX, pointerY), 0, 1);
    const edgeDistance = Math.max(Math.abs(pointerX), Math.abs(pointerY));
    const edgeBlend = MathUtils.smoothstep(edgeDistance, EDGE_THRESHOLD, 1);
    const mouseResponse = 0.4 + distanceFromCenter * MOUSE_SPEED_MULTIPLIER;

    const velocity = velocityRef.current;
    const rotation = groupRef.current.rotation;

    // Edge-force behavior: near canvas boundaries, amplify rotational acceleration aggressively.
    const mouseAccelX = MathUtils.clamp(
      (-pointerY * MOUSE_ACCELERATION * mouseResponse) + (-rotation.x * EDGE_ACCELERATION_BOOST * edgeBlend),
      -MAX_MOUSE_ACCELERATION,
      MAX_MOUSE_ACCELERATION,
    );
    const mouseAccelY = MathUtils.clamp(
      (pointerX * MOUSE_ACCELERATION * mouseResponse) + (-rotation.y * EDGE_ACCELERATION_BOOST * edgeBlend),
      -MAX_MOUSE_ACCELERATION,
      MAX_MOUSE_ACCELERATION,
    );

    // Return-to-origin spin logic: stronger home-pull at edges drives fast corrective spin without snapping.
    const returnStrength = RETURN_TO_HOME_STIFFNESS + edgeBlend * EDGE_RETURN_BOOST;
    const accelX = mouseAccelX - rotation.x * returnStrength - velocity.x * ANGULAR_DAMPING;
    const accelY = mouseAccelY - rotation.y * returnStrength - velocity.y * ANGULAR_DAMPING;

    velocity.x += accelX * delta;
    velocity.y += accelY * delta;

    rotation.x += (BASE_ANGULAR_VELOCITY_X + velocity.x) * delta;
    rotation.y += (BASE_ANGULAR_VELOCITY_Y + velocity.y) * delta;
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
