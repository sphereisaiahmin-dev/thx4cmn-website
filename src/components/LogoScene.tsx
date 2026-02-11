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
const BASE_SPIN_X = 0.95;
const BASE_SPIN_Y = 0.35;
const BASE_VELOCITY_TRACKING = 3.2;
const MOUSE_ACCEL_X = 4.8;
const MOUSE_ACCEL_Y = 3.6;
const POINTER_SPRING = 8.5;
const HOME_RETURN_BASE = 2.2;
const HOME_RETURN_EDGE_BOOST = 16;
const EDGE_CORRECTION_SPIN = 9.5;
const EDGE_THRESHOLD = 0.72;
const OUTWARD_DAMPING = 7.8;
const INWARD_DAMPING = 3.2;

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
    const pointer = pointerRef.current;
    const rotation = groupRef.current.rotation;
    const angularVelocity = angularVelocityRef.current;

    const mouseDistance = Math.min(1, Math.hypot(pointer.x, pointer.y));
    const edgeProximity = Math.max(Math.abs(pointer.x), Math.abs(pointer.y));
    // Edge-force behavior: rapidly increase corrective energy as the pointer nears canvas bounds.
    const edgeForce = MathUtils.smoothstep(edgeProximity, EDGE_THRESHOLD, 1);

    const targetX = MathUtils.clamp(-pointer.y * MAX_ROTATION, -MAX_ROTATION, MAX_ROTATION);
    const targetY = MathUtils.clamp(pointer.x * MAX_ROTATION, -MAX_ROTATION, MAX_ROTATION);

    // Axis speed asymmetry: X baseline spin intentionally runs faster than Y at all times.
    const baseTrackingForceX = (BASE_SPIN_X - angularVelocity.x) * BASE_VELOCITY_TRACKING;
    const baseTrackingForceY = (BASE_SPIN_Y - angularVelocity.y) * BASE_VELOCITY_TRACKING;
    const pointerForceX = (targetX - rotation.x) * POINTER_SPRING * (0.4 + mouseDistance);
    const pointerForceY = (targetY - rotation.y) * POINTER_SPRING * (0.4 + mouseDistance);
    const mouseForceX = -pointer.y * MOUSE_ACCEL_X * mouseDistance;
    const mouseForceY = pointer.x * MOUSE_ACCEL_Y * mouseDistance;
    const homeForceX = -rotation.x * (HOME_RETURN_BASE + edgeForce * HOME_RETURN_EDGE_BOOST);
    const homeForceY = -rotation.y * (HOME_RETURN_BASE + edgeForce * HOME_RETURN_EDGE_BOOST);
    // Return-to-origin spin logic: near edges we add directional torque that pushes orientation back to home pose.
    const edgeCorrectionX = (-rotation.x - angularVelocity.x * 0.35) * EDGE_CORRECTION_SPIN * edgeForce;
    const edgeCorrectionY = (-rotation.y - angularVelocity.y * 0.35) * EDGE_CORRECTION_SPIN * edgeForce;

    angularVelocity.x += (baseTrackingForceX + pointerForceX + mouseForceX + homeForceX + edgeCorrectionX) * safeDelta;
    angularVelocity.y += (baseTrackingForceY + pointerForceY + mouseForceY + homeForceY + edgeCorrectionY) * safeDelta;

    const xMovingOutward = rotation.x * angularVelocity.x > 0;
    const yMovingOutward = rotation.y * angularVelocity.y > 0;
    const dampingX = xMovingOutward ? OUTWARD_DAMPING : INWARD_DAMPING;
    const dampingY = yMovingOutward ? OUTWARD_DAMPING : INWARD_DAMPING;
    const dampingMultiplierX = Math.exp(-dampingX * safeDelta);
    const dampingMultiplierY = Math.exp(-dampingY * safeDelta);

    angularVelocity.x *= dampingMultiplierX;
    angularVelocity.y *= dampingMultiplierY;

    rotation.x += angularVelocity.x * safeDelta;
    rotation.y += angularVelocity.y * safeDelta;

    rotation.x = MathUtils.clamp(rotation.x, -MAX_ROTATION, MAX_ROTATION);
    rotation.y = MathUtils.clamp(rotation.y, -MAX_ROTATION, MAX_ROTATION);
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
