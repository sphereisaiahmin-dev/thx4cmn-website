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
const BASE_ROTATION_X_SPEED = 1.3;
const BASE_ROTATION_Y_SPEED = 0.38;
const CONTINUOUS_DRIFT_X = 0.18;
const CONTINUOUS_DRIFT_Y = 0.06;
const MOUSE_SPEED_FORCE = 7.8;
const MOUSE_ACCEL_FORCE = 16.4;
const EDGE_THRESHOLD = 0.72;
const EDGE_FORCE_MULTIPLIER = 3.8;
const EDGE_DWELL_TRIGGER_S = 1.2;
const EDGE_DWELL_DECAY_S = 1.8;
const RETURN_SPIN_DURATION_S = 0.75;
const RETURN_SETTLE_DURATION_S = 0.8;
const RETURN_SPIN_BOOST_X = 11.5;
const RETURN_SPIN_BOOST_Y = 4.8;
const ORIENTATION_HOME_FORCE = 3.1;
const ORIENTATION_DAMPING = 3.3;
const POSITION_OUTBOUND_RATE = 2.2;
const POSITION_INBOUND_RATE = 10.5;

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
  const edgeHoldRef = useRef(0);
  const returnTimerRef = useRef(0);
  const returnSpinRef = useRef<PointerPosition>({ x: 1, y: 1 });
  const returnActiveRef = useRef(false);

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

    const atEdge = pointerRadius >= EDGE_THRESHOLD;
    const edgeDecay = atEdge ? 1 : EDGE_DWELL_DECAY_S;
    edgeHoldRef.current = MathUtils.clamp(
      edgeHoldRef.current + (atEdge ? delta : -delta * edgeDecay),
      0,
      EDGE_DWELL_TRIGGER_S,
    );

    if (!returnActiveRef.current && edgeHoldRef.current >= EDGE_DWELL_TRIGGER_S) {
      returnActiveRef.current = true;
      returnTimerRef.current = 0;
      returnSpinRef.current.x = Math.sign(pointerY || angularVelocityRef.current.x || 1);
      returnSpinRef.current.y = Math.sign(pointerX || angularVelocityRef.current.y || 1);
    }

    if (returnActiveRef.current) {
      returnTimerRef.current += delta;
    }

    const homeErrorX = getHomeAngleError(groupRef.current.rotation.x);
    const homeErrorY = getHomeAngleError(groupRef.current.rotation.y);

    const baseForceX = BASE_ROTATION_X_SPEED + pointerY * MOUSE_SPEED_FORCE;
    const baseForceY = BASE_ROTATION_Y_SPEED + pointerX * MOUSE_SPEED_FORCE;

    // Edge force ramps up near bounds, but gated so it doesn't suppress organic motion before dwell-trigger.
    const edgeForceX = -homeErrorX * ORIENTATION_HOME_FORCE * edgeBlend * EDGE_FORCE_MULTIPLIER;
    const edgeForceY = -homeErrorY * ORIENTATION_HOME_FORCE * edgeBlend * EDGE_FORCE_MULTIPLIER;
    // Return-to-origin spin logic: after edge dwell, spin through a dramatic phase then settle to 0deg/360deg.
    const homeForceX = -homeErrorX * ORIENTATION_HOME_FORCE;
    const homeForceY = -homeErrorY * ORIENTATION_HOME_FORCE;

    const returnProgress = returnActiveRef.current
      ? MathUtils.clamp(returnTimerRef.current / (RETURN_SPIN_DURATION_S + RETURN_SETTLE_DURATION_S), 0, 1)
      : 0;
    const spinPhase = returnActiveRef.current ? MathUtils.clamp(returnTimerRef.current / RETURN_SPIN_DURATION_S, 0, 1) : 0;
    const settlePhase = returnActiveRef.current
      ? MathUtils.clamp((returnTimerRef.current - RETURN_SPIN_DURATION_S) / RETURN_SETTLE_DURATION_S, 0, 1)
      : 0;

    const spinBoostBlend = 1 - MathUtils.smootherstep(spinPhase, 0, 1);
    const settleBlend = MathUtils.smootherstep(settlePhase, 0, 1);

    const returnSpinForceX = returnSpinRef.current.x * RETURN_SPIN_BOOST_X * spinBoostBlend;
    const returnSpinForceY = returnSpinRef.current.y * RETURN_SPIN_BOOST_Y * spinBoostBlend;

    const returnHomeForceX = homeForceX * settleBlend * (2.2 + edgeBlend);
    const returnHomeForceY = homeForceY * settleBlend * (2.2 + edgeBlend);

    const edgeControlBlend = returnActiveRef.current ? MathUtils.smootherstep(returnProgress, 0, 1) : 0;
    const baseInfluence = 1 - edgeControlBlend * 0.82 - edgeBlend * 0.25;

    const accelX = (
      baseForceX * baseInfluence
      + homeForceX * (1 - edgeControlBlend * 0.3)
      + edgeForceX * edgeControlBlend
      + returnSpinForceX
      + returnHomeForceX
    ) * MOUSE_ACCEL_FORCE;
    const accelY = (
      baseForceY * baseInfluence
      + homeForceY * (1 - edgeControlBlend * 0.3)
      + edgeForceY * edgeControlBlend
      + returnSpinForceY
      + returnHomeForceY
    ) * MOUSE_ACCEL_FORCE;

    angularVelocityRef.current.x += accelX * delta;
    angularVelocityRef.current.y += accelY * delta;

    const damping = Math.exp(-ORIENTATION_DAMPING * delta);
    angularVelocityRef.current.x *= damping;
    angularVelocityRef.current.y *= damping;

    groupRef.current.rotation.x += (angularVelocityRef.current.x + CONTINUOUS_DRIFT_X) * delta;
    groupRef.current.rotation.y += (angularVelocityRef.current.y + CONTINUOUS_DRIFT_Y) * delta;

    const canExitReturn = returnTimerRef.current > RETURN_SPIN_DURATION_S + RETURN_SETTLE_DURATION_S;
    if (returnActiveRef.current && canExitReturn && !atEdge && Math.abs(homeErrorX) < 0.07 && Math.abs(homeErrorY) < 0.07) {
      returnActiveRef.current = false;
      returnTimerRef.current = 0;
    }

    const targetPosX = pointerX * 0.2;
    const targetPosY = pointerY * 0.14;
    const toCenterDistance = Math.hypot(groupRef.current.position.x, groupRef.current.position.y);
    const targetDistance = Math.hypot(targetPosX, targetPosY);
    const movingTowardOrigin = targetDistance < toCenterDistance;
    const positionRate = movingTowardOrigin ? POSITION_INBOUND_RATE : POSITION_OUTBOUND_RATE;
    const positionAlpha = 1 - Math.exp(-positionRate * delta);

    groupRef.current.position.x = MathUtils.lerp(groupRef.current.position.x, targetPosX, positionAlpha);
    groupRef.current.position.y = MathUtils.lerp(groupRef.current.position.y, targetPosY, positionAlpha);
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
