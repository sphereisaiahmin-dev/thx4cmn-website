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
const BASE_SPIN_X = 0.58;
const BASE_SPIN_Y = 0.22;
const MOUSE_FORCE = 3.4;
const MOUSE_ACCEL = 6.4;
const EDGE_THRESHOLD = 0.72;
const EDGE_FORCE = 10.8;
const RETURN_FORCE = 2.8;

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
  const angularVelocityRef = useRef<PointerPosition>({ x: BASE_SPIN_X, y: BASE_SPIN_Y });

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

    const safeDelta = Math.min(delta, 1 / 30);
    smoothPointerRef.current.x = MathUtils.lerp(smoothPointerRef.current.x, pointerRef.current.x, 0.18);
    smoothPointerRef.current.y = MathUtils.lerp(smoothPointerRef.current.y, pointerRef.current.y, 0.18);

    const pointerMagnitude = Math.min(1, Math.hypot(smoothPointerRef.current.x, smoothPointerRef.current.y));
    const edgeDistance = Math.max(Math.abs(smoothPointerRef.current.x), Math.abs(smoothPointerRef.current.y));
    const edgeStrength = MathUtils.clamp((edgeDistance - EDGE_THRESHOLD) / (1 - EDGE_THRESHOLD), 0, 1);

    const rotationX = groupRef.current.rotation.x;
    const rotationY = groupRef.current.rotation.y;
    const toHomeX = -rotationX;
    const toHomeY = -rotationY;

    const velocity = angularVelocityRef.current;
    const towardHomeX = Math.sign(velocity.x) === Math.sign(toHomeX) ? 1 : 0;
    const towardHomeY = Math.sign(velocity.y) === Math.sign(toHomeY) ? 1 : 0;

    // X/Y base spin stays continuously active, with X intentionally faster than Y.
    const baseAccelX = (BASE_SPIN_X - velocity.x) * 1.15;
    const baseAccelY = (BASE_SPIN_Y - velocity.y) * 1.15;

    const mouseForceX = -smoothPointerRef.current.y * MOUSE_FORCE * (0.45 + pointerMagnitude);
    const mouseForceY = smoothPointerRef.current.x * MOUSE_FORCE * (0.45 + pointerMagnitude);
    const accelForceX = mouseForceX * MOUSE_ACCEL;
    const accelForceY = mouseForceY * MOUSE_ACCEL;

    // Edge displacement injects stronger force so the spin quickly corrects back toward home orientation.
    const edgePullX = toHomeX * EDGE_FORCE * edgeStrength;
    const edgePullY = toHomeY * EDGE_FORCE * edgeStrength;

    // Magnetic return: motion toward home keeps more momentum, while away-from-home motion is damped harder.
    const magneticX = toHomeX * RETURN_FORCE * (1 + edgeStrength * 1.4);
    const magneticY = toHomeY * RETURN_FORCE * (1 + edgeStrength * 1.4);
    const dampingX = towardHomeX ? 0.988 : 0.95;
    const dampingY = towardHomeY ? 0.988 : 0.95;

    velocity.x += (baseAccelX + accelForceX + magneticX + edgePullX) * safeDelta;
    velocity.y += (baseAccelY + accelForceY + magneticY + edgePullY) * safeDelta;
    velocity.x *= dampingX;
    velocity.y *= dampingY;

    groupRef.current.rotation.x = MathUtils.clamp(rotationX + velocity.x * safeDelta, -MAX_ROTATION, MAX_ROTATION);
    groupRef.current.rotation.y = MathUtils.clamp(rotationY + velocity.y * safeDelta, -MAX_ROTATION, MAX_ROTATION);
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
