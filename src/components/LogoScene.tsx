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
const POINTER_ROTATION = MathUtils.degToRad(18);
const FULL_ROTATION = MathUtils.degToRad(360);
const BASE_X_SPEED = MathUtils.degToRad(26);
const BASE_Y_SPEED = MathUtils.degToRad(34);
const SPIN_ACCELERATION = 1.4;

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
  const rotationRef = useRef<PointerPosition>({ x: 0, y: 0 });
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

  useFrame((state, delta) => {
    if (!groupRef.current) return;

    velocityRef.current.x = MathUtils.damp(velocityRef.current.x, BASE_X_SPEED, SPIN_ACCELERATION, delta);
    velocityRef.current.y = MathUtils.damp(velocityRef.current.y, BASE_Y_SPEED, SPIN_ACCELERATION, delta);

    rotationRef.current.x = MathUtils.euclideanModulo(
      rotationRef.current.x + velocityRef.current.x * delta,
      FULL_ROTATION,
    );
    rotationRef.current.y = MathUtils.euclideanModulo(
      rotationRef.current.y + velocityRef.current.y * delta,
      FULL_ROTATION,
    );

    const pointerX = MathUtils.clamp(-pointerRef.current.y * POINTER_ROTATION, -POINTER_ROTATION, POINTER_ROTATION);
    const pointerY = MathUtils.clamp(pointerRef.current.x * POINTER_ROTATION, -POINTER_ROTATION, POINTER_ROTATION);

    // Tiny incommensurate offsets keep the motion from appearing to lock at quarter/half turns.
    const microOffsetX = Math.sin(state.clock.elapsedTime * 0.63 + 0.31) * 0.015;
    const microOffsetY = Math.sin(state.clock.elapsedTime * 0.79 + 0.67) * 0.015;

    groupRef.current.rotation.x = rotationRef.current.x + pointerX + microOffsetX;
    groupRef.current.rotation.y = rotationRef.current.y + pointerY + microOffsetY;
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
