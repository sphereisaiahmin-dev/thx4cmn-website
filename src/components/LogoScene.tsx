'use client';

import { Center, Html, useGLTF } from '@react-three/drei';
import { type ThreeEvent, useFrame, useThree } from '@react-three/fiber';
import { Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { Box3, MathUtils, PerspectiveCamera, type Group, Vector3 } from 'three';

import { ThreeCanvas } from './ThreeCanvas';

const LOGO_MODEL_VERSION = '2024-10-04';
export const LOGO_MODEL_URL = `/api/3d/thx4cmnlogo.glb?v=${LOGO_MODEL_VERSION}`;
export const HEADER_LOGO_MODEL_URL = `/api/3d/thx4cmnlogoheader.glb?v=${LOGO_MODEL_VERSION}`;
const LOGO_SCALE = 2;
export const HEADER_LOGO_SCALE = LOGO_SCALE * 2;

const TAU = Math.PI * 2;
const INTRO_X_FLIP_DURATION_MS = 2600;
const INTRO_PAUSE_AFTER_X_MS = 500;
const INTRO_JUMP_DURATION_MS = 1200;
const INTRO_X_SPIN = 4 * Math.PI;
const JUMP_HEIGHT = 0.55;
const INACTIVITY_RESET_MS = 10000;
const PERIODIC_REPLAY_MS = 60000;

const DRAG_ROTATION_SENSITIVITY = 0.005;
const DRAG_VELOCITY_BLEND = 0.42;
const RELEASE_VELOCITY_BOOST = 1.28;
const MAX_ANGULAR_SPEED = 12;
const ANGULAR_DAMPING = 2.1;

const MIN_SCALE_FACTOR = 1;
const MAX_SCALE_FACTOR = 1.15;
const WHEEL_SCALE_MULTIPLIER = 0.0006;
const HOME_LOGO_DESKTOP_ANCHOR_WIDTH_PX = 1366;
const HOME_LOGO_EDGE_PADDING_RATIO = 0.08;
const RESET_EPSILON = 0.012;
const WIGGLE_BLEND_LAMBDA = 8;
const PERIODIC_RESET_BLEND_LAMBDA = 10.5;
const WIGGLE_FREQUENCY_HZ = 2.35;
const WIGGLE_DECAY = 2.7;
const WIGGLE_AMPLITUDE = 0.28;
const WIGGLE_MIN_DURATION_MS = 900;
const PERIODIC_RESET_MIN_DURATION_MS = 650;

type AnimationPhase =
  | 'introXFlip'
  | 'introPauseAfterX'
  | 'introJump'
  | 'idleSpin'
  | 'wiggleReset'
  | 'periodicReplayReset';

type Rotation = {
  x: number;
  y: number;
  z: number;
};

type PointerState = {
  activePointerId: number | null;
  isDown: boolean;
  lastClientX: number;
  lastClientY: number;
  lastEventTimeMs: number;
};

const easeOutCubic = (value: number) => 1 - (1 - value) ** 3;

const wrapAngle = (value: number) =>
  MathUtils.euclideanModulo(value + Math.PI, TAU) - Math.PI;

const clampAngularVelocity = (velocity: Rotation) => {
  velocity.x = MathUtils.clamp(velocity.x, -MAX_ANGULAR_SPEED, MAX_ANGULAR_SPEED);
  velocity.y = MathUtils.clamp(velocity.y, -MAX_ANGULAR_SPEED, MAX_ANGULAR_SPEED);
  velocity.z = MathUtils.clamp(velocity.z, -MAX_ANGULAR_SPEED, MAX_ANGULAR_SPEED);
};

const isIntroPhase = (phase: AnimationPhase) =>
  phase === 'introXFlip' ||
  phase === 'introPauseAfterX' ||
  phase === 'introJump';

const isUiInteractionTarget = (target: EventTarget | null) => {
  if (!(target instanceof Element)) return false;
  return Boolean(target.closest('a,button,input,textarea,select,.audio-player,#mini-cart'));
};

const computeWidthAnchoredScaleFactor = ({
  fitMobileAspect,
  canvasWidthPx,
  canvasHeightPx,
  modelBoundsWidthWorld,
  modelScale,
  camera,
  group,
  groupWorldPosition,
  groupViewPosition,
}: {
  fitMobileAspect: boolean;
  canvasWidthPx: number;
  canvasHeightPx: number;
  modelBoundsWidthWorld: number | null;
  modelScale: number;
  camera: unknown;
  group: Group;
  groupWorldPosition: Vector3;
  groupViewPosition: Vector3;
}) => {
  if (!fitMobileAspect || canvasWidthPx >= HOME_LOGO_DESKTOP_ANCHOR_WIDTH_PX) {
    return 1;
  }

  if (canvasWidthPx <= 0 || canvasHeightPx <= 0 || !modelBoundsWidthWorld || modelBoundsWidthWorld <= 0) {
    return 1;
  }

  if (!(camera instanceof PerspectiveCamera)) {
    return 1;
  }

  group.getWorldPosition(groupWorldPosition);
  groupViewPosition.copy(groupWorldPosition).applyMatrix4(camera.matrixWorldInverse);
  const depth = Math.abs(groupViewPosition.z);
  if (depth <= 0.0001) {
    return 1;
  }

  const fovRad = MathUtils.degToRad(camera.fov);
  const visibleHeightWorld = 2 * Math.tan(fovRad * 0.5) * depth;
  if (visibleHeightWorld <= 0) {
    return 1;
  }

  const projectedModelWidthPx =
    (modelBoundsWidthWorld * modelScale * canvasHeightPx) / visibleHeightWorld;
  const targetDrawableWidthPx = canvasWidthPx * (1 - 2 * HOME_LOGO_EDGE_PADDING_RATIO);
  if (projectedModelWidthPx <= 0 || targetDrawableWidthPx <= 0) {
    return 1;
  }

  const widthFitFactor = targetDrawableWidthPx / projectedModelWidthPx;
  if (!Number.isFinite(widthFitFactor) || widthFitFactor <= 0) {
    return 1;
  }

  return Math.min(1, widthFitFactor);
};

const LogoModel = ({
  modelUrl,
  onBoundsWidthChange,
}: {
  modelUrl: string;
  onBoundsWidthChange?: (width: number) => void;
}) => {
  const { scene } = useGLTF(modelUrl);

  useEffect(() => {
    if (!onBoundsWidthChange) return;

    const bounds = new Box3().setFromObject(scene);
    const size = new Vector3();
    bounds.getSize(size);
    if (Number.isFinite(size.x) && size.x > 0) {
      onBoundsWidthChange(size.x);
    }
  }, [onBoundsWidthChange, scene]);

  return <primitive object={scene} />;
};

interface LogoRigProps {
  modelUrl: string;
  scale: number;
  fitMobileAspect: boolean;
  onDragStateChange?: (isDragging: boolean) => void;
}

const LogoRig = ({ modelUrl, scale, fitMobileAspect, onDragStateChange }: LogoRigProps) => {
  const { camera, size } = useThree();
  const groupRef = useRef<Group>(null);
  const phaseRef = useRef<AnimationPhase>('introXFlip');
  const phaseElapsedMsRef = useRef(0);
  const hasAffectedStateRef = useRef(false);
  const physicsRotationRef = useRef<Rotation>({ x: 0, y: 0, z: 0 });
  const angularVelocityRef = useRef<Rotation>({ x: 0, y: 0, z: 0 });
  const scaleFactorRef = useRef(1);
  const lastInteractionAtRef = useRef(0);
  const lastPeriodicReplayAtRef = useRef(0);
  const periodicReplayPendingRef = useRef(false);
  const isHoveringModelRef = useRef(false);
  const modelBoundsWidthRef = useRef<number | null>(null);
  const pointerStateRef = useRef<PointerState>({
    activePointerId: null,
    isDown: false,
    lastClientX: 0,
    lastClientY: 0,
    lastEventTimeMs: 0,
  });
  const groupWorldPositionRef = useRef(new Vector3());
  const groupViewPositionRef = useRef(new Vector3());

  const handleBoundsWidthChange = useCallback((width: number) => {
    if (!Number.isFinite(width) || width <= 0) return;
    modelBoundsWidthRef.current = width;
  }, []);

  const transitionToIdle = () => {
    phaseRef.current = 'idleSpin';
    phaseElapsedMsRef.current = 0;
  };

  const beginPeriodicReplayReset = () => {
    phaseRef.current = 'periodicReplayReset';
    phaseElapsedMsRef.current = 0;
    periodicReplayPendingRef.current = false;
  };

  const beginIntroSequence = (now: number) => {
    phaseRef.current = 'introXFlip';
    phaseElapsedMsRef.current = 0;
    hasAffectedStateRef.current = false;
    lastPeriodicReplayAtRef.current = now;
    periodicReplayPendingRef.current = false;
  };

  useEffect(
    () => () => {
      onDragStateChange?.(false);
    },
    [onDragStateChange],
  );

  const registerInteraction = (eventTarget: EventTarget | null, interruptIntro = true) => {
    if (isUiInteractionTarget(eventTarget)) return false;
    const now = performance.now();
    lastInteractionAtRef.current = now;

    if (interruptIntro && phaseRef.current !== 'idleSpin') {
      transitionToIdle();
    }

    return true;
  };

  const handlePointerDown = (event: ThreeEvent<PointerEvent>) => {
    if (!registerInteraction(event.nativeEvent.target)) return;
    event.stopPropagation();

    const pointer = pointerStateRef.current;
    pointer.activePointerId = event.pointerId;
    pointer.isDown = true;
    pointer.lastClientX = event.clientX;
    pointer.lastClientY = event.clientY;
    pointer.lastEventTimeMs = event.timeStamp;
    onDragStateChange?.(true);

    angularVelocityRef.current.x = 0;
    angularVelocityRef.current.y = 0;
    angularVelocityRef.current.z = 0;

    const eventTarget = event.target as
      | { setPointerCapture?: (pointerId: number) => void }
      | null;
    eventTarget?.setPointerCapture?.(event.pointerId);
  };

  const handlePointerMove = (event: ThreeEvent<PointerEvent>) => {
    const pointer = pointerStateRef.current;
    if (!pointer.isDown || pointer.activePointerId !== event.pointerId) {
      return;
    }
    if (!registerInteraction(event.nativeEvent.target)) return;

    event.stopPropagation();

    const deltaX = event.clientX - pointer.lastClientX;
    const deltaY = event.clientY - pointer.lastClientY;
    const elapsedMs = Math.max(1, event.timeStamp - pointer.lastEventTimeMs);
    const elapsedSeconds = elapsedMs / 1000;

    pointer.lastClientX = event.clientX;
    pointer.lastClientY = event.clientY;
    pointer.lastEventTimeMs = event.timeStamp;

    if (deltaX === 0 && deltaY === 0) {
      return;
    }

    physicsRotationRef.current.x = wrapAngle(
      physicsRotationRef.current.x + deltaY * DRAG_ROTATION_SENSITIVITY,
    );
    physicsRotationRef.current.y = wrapAngle(
      physicsRotationRef.current.y + deltaX * DRAG_ROTATION_SENSITIVITY,
    );

    const targetVelocityX = (deltaY * DRAG_ROTATION_SENSITIVITY) / elapsedSeconds;
    const targetVelocityY = (deltaX * DRAG_ROTATION_SENSITIVITY) / elapsedSeconds;
    angularVelocityRef.current.x = MathUtils.lerp(
      angularVelocityRef.current.x,
      targetVelocityX,
      DRAG_VELOCITY_BLEND,
    );
    angularVelocityRef.current.y = MathUtils.lerp(
      angularVelocityRef.current.y,
      targetVelocityY,
      DRAG_VELOCITY_BLEND,
    );
    angularVelocityRef.current.z = MathUtils.lerp(angularVelocityRef.current.z, 0, DRAG_VELOCITY_BLEND);

    hasAffectedStateRef.current = true;
    clampAngularVelocity(angularVelocityRef.current);
  };

  const finalizePointer = (event: ThreeEvent<PointerEvent>) => {
    const pointer = pointerStateRef.current;
    if (pointer.activePointerId !== event.pointerId) {
      return;
    }

    if (registerInteraction(event.nativeEvent.target, false)) {
      event.stopPropagation();
    }

    angularVelocityRef.current.x *= RELEASE_VELOCITY_BOOST;
    angularVelocityRef.current.y *= RELEASE_VELOCITY_BOOST;
    angularVelocityRef.current.z *= RELEASE_VELOCITY_BOOST;
    clampAngularVelocity(angularVelocityRef.current);
    if (
      Math.abs(angularVelocityRef.current.x) > 0.00001 ||
      Math.abs(angularVelocityRef.current.y) > 0.00001 ||
      Math.abs(angularVelocityRef.current.z) > 0.00001
    ) {
      hasAffectedStateRef.current = true;
    }

    const eventTarget = event.target as
      | { releasePointerCapture?: (pointerId: number) => void }
      | null;
    eventTarget?.releasePointerCapture?.(event.pointerId);

    pointer.activePointerId = null;
    pointer.isDown = false;
    onDragStateChange?.(false);
  };

  const handleWheel = (event: ThreeEvent<WheelEvent>) => {
    if (!isHoveringModelRef.current) return;
    if (!registerInteraction(event.nativeEvent.target, false)) return;

    event.stopPropagation();
    event.nativeEvent.preventDefault();

    const previousScale = scaleFactorRef.current;
    const scaleDelta = -event.deltaY * WHEEL_SCALE_MULTIPLIER;
    scaleFactorRef.current = MathUtils.clamp(
      scaleFactorRef.current + scaleDelta,
      MIN_SCALE_FACTOR,
      MAX_SCALE_FACTOR,
    );

    if (Math.abs(scaleFactorRef.current - previousScale) > 0.000001) {
      hasAffectedStateRef.current = true;
    }
  };

  useFrame((_, delta) => {
    const group = groupRef.current;
    if (!group) return;

    const now = performance.now();
    if (lastInteractionAtRef.current === 0) {
      lastInteractionAtRef.current = now;
    }
    if (lastPeriodicReplayAtRef.current === 0) {
      lastPeriodicReplayAtRef.current = now;
    }

    const pointer = pointerStateRef.current;
    const isPointerInteracting = pointer.isDown;
    const periodicDue = now - lastPeriodicReplayAtRef.current >= PERIODIC_REPLAY_MS;
    const hasTransformOffset =
      Math.abs(physicsRotationRef.current.x) > RESET_EPSILON ||
      Math.abs(physicsRotationRef.current.y) > RESET_EPSILON ||
      Math.abs(physicsRotationRef.current.z) > RESET_EPSILON ||
      Math.abs(scaleFactorRef.current - 1) > RESET_EPSILON;
    const hasResidualMotion =
      Math.abs(angularVelocityRef.current.x) > RESET_EPSILON ||
      Math.abs(angularVelocityRef.current.y) > RESET_EPSILON ||
      Math.abs(angularVelocityRef.current.z) > RESET_EPSILON;
    const isCurrentlyAffected = hasTransformOffset || hasResidualMotion;

    if (periodicDue) {
      if (isPointerInteracting) {
        periodicReplayPendingRef.current = true;
      } else if (!isIntroPhase(phaseRef.current) && phaseRef.current !== 'periodicReplayReset') {
        beginPeriodicReplayReset();
      }
    }

    if (
      periodicReplayPendingRef.current &&
      !isPointerInteracting &&
      !isIntroPhase(phaseRef.current) &&
      phaseRef.current !== 'periodicReplayReset'
    ) {
      beginPeriodicReplayReset();
    }

    if (
      phaseRef.current === 'idleSpin' &&
      hasAffectedStateRef.current &&
      isCurrentlyAffected &&
      !periodicReplayPendingRef.current &&
      !isPointerInteracting &&
      now - lastInteractionAtRef.current >= INACTIVITY_RESET_MS
    ) {
      phaseRef.current = 'wiggleReset';
      phaseElapsedMsRef.current = 0;
    }

    phaseElapsedMsRef.current += delta * 1000;

    let baseRotationX = 0;
    let baseRotationY = 0;
    let baseRotationZ = 0;
    let basePositionY = 0;

    switch (phaseRef.current) {
      case 'introXFlip': {
        const progress = MathUtils.clamp(
          phaseElapsedMsRef.current / INTRO_X_FLIP_DURATION_MS,
          0,
          1,
        );
        baseRotationX = INTRO_X_SPIN * easeOutCubic(progress);

        if (progress >= 1) {
          phaseRef.current = 'introPauseAfterX';
          phaseElapsedMsRef.current = 0;
          baseRotationX = 0;
        }
        break;
      }

      case 'introPauseAfterX': {
        if (phaseElapsedMsRef.current >= INTRO_PAUSE_AFTER_X_MS) {
          phaseRef.current = 'introJump';
          phaseElapsedMsRef.current = 0;
        }
        break;
      }

      case 'introJump': {
        const progress = MathUtils.clamp(
          phaseElapsedMsRef.current / INTRO_JUMP_DURATION_MS,
          0,
          1,
        );
        basePositionY = Math.sin(progress * Math.PI) * JUMP_HEIGHT;

        if (progress >= 1) {
          phaseRef.current = 'idleSpin';
          phaseElapsedMsRef.current = 0;
          lastInteractionAtRef.current = now;
          basePositionY = 0;
        }
        break;
      }

      case 'idleSpin': {
        baseRotationY = 0;
        break;
      }

      case 'wiggleReset': {
        const blend = 1 - Math.exp(-WIGGLE_BLEND_LAMBDA * delta);
        const timeSeconds = phaseElapsedMsRef.current / 1000;
        const wiggle =
          Math.sin(timeSeconds * WIGGLE_FREQUENCY_HZ * TAU) *
          Math.exp(-WIGGLE_DECAY * timeSeconds) *
          WIGGLE_AMPLITUDE;

        baseRotationX = wiggle * 0.72;
        baseRotationZ = wiggle * 0.36;
        basePositionY = wiggle * 0.08;

        physicsRotationRef.current.x = MathUtils.lerp(physicsRotationRef.current.x, 0, blend);
        physicsRotationRef.current.y = MathUtils.lerp(physicsRotationRef.current.y, 0, blend);
        physicsRotationRef.current.z = MathUtils.lerp(physicsRotationRef.current.z, 0, blend);
        angularVelocityRef.current.x = MathUtils.lerp(
          angularVelocityRef.current.x,
          0,
          Math.min(1, blend * 1.2),
        );
        angularVelocityRef.current.y = MathUtils.lerp(
          angularVelocityRef.current.y,
          0,
          Math.min(1, blend * 1.2),
        );
        angularVelocityRef.current.z = MathUtils.lerp(
          angularVelocityRef.current.z,
          0,
          Math.min(1, blend * 1.2),
        );
        scaleFactorRef.current = MathUtils.lerp(scaleFactorRef.current, 1, blend);

        const settled =
          phaseElapsedMsRef.current >= WIGGLE_MIN_DURATION_MS &&
          Math.abs(physicsRotationRef.current.x) < RESET_EPSILON &&
          Math.abs(physicsRotationRef.current.y) < RESET_EPSILON &&
          Math.abs(physicsRotationRef.current.z) < RESET_EPSILON &&
          Math.abs(angularVelocityRef.current.x) < RESET_EPSILON &&
          Math.abs(angularVelocityRef.current.y) < RESET_EPSILON &&
          Math.abs(angularVelocityRef.current.z) < RESET_EPSILON &&
          Math.abs(scaleFactorRef.current - 1) < RESET_EPSILON;

        if (settled) {
          physicsRotationRef.current.x = 0;
          physicsRotationRef.current.y = 0;
          physicsRotationRef.current.z = 0;
          angularVelocityRef.current.x = 0;
          angularVelocityRef.current.y = 0;
          angularVelocityRef.current.z = 0;
          scaleFactorRef.current = 1;
          hasAffectedStateRef.current = false;

          transitionToIdle();
          lastInteractionAtRef.current = now;
          baseRotationX = 0;
          baseRotationZ = 0;
          basePositionY = 0;
        }
        break;
      }

      case 'periodicReplayReset': {
        const blend = 1 - Math.exp(-PERIODIC_RESET_BLEND_LAMBDA * delta);
        physicsRotationRef.current.x = MathUtils.lerp(physicsRotationRef.current.x, 0, blend);
        physicsRotationRef.current.y = MathUtils.lerp(physicsRotationRef.current.y, 0, blend);
        physicsRotationRef.current.z = MathUtils.lerp(physicsRotationRef.current.z, 0, blend);
        angularVelocityRef.current.x = MathUtils.lerp(
          angularVelocityRef.current.x,
          0,
          Math.min(1, blend * 1.4),
        );
        angularVelocityRef.current.y = MathUtils.lerp(
          angularVelocityRef.current.y,
          0,
          Math.min(1, blend * 1.4),
        );
        angularVelocityRef.current.z = MathUtils.lerp(
          angularVelocityRef.current.z,
          0,
          Math.min(1, blend * 1.4),
        );
        scaleFactorRef.current = MathUtils.lerp(scaleFactorRef.current, 1, blend);

        const settled =
          phaseElapsedMsRef.current >= PERIODIC_RESET_MIN_DURATION_MS &&
          Math.abs(physicsRotationRef.current.x) < RESET_EPSILON &&
          Math.abs(physicsRotationRef.current.y) < RESET_EPSILON &&
          Math.abs(physicsRotationRef.current.z) < RESET_EPSILON &&
          Math.abs(angularVelocityRef.current.x) < RESET_EPSILON &&
          Math.abs(angularVelocityRef.current.y) < RESET_EPSILON &&
          Math.abs(angularVelocityRef.current.z) < RESET_EPSILON &&
          Math.abs(scaleFactorRef.current - 1) < RESET_EPSILON;

        if (settled) {
          physicsRotationRef.current.x = 0;
          physicsRotationRef.current.y = 0;
          physicsRotationRef.current.z = 0;
          angularVelocityRef.current.x = 0;
          angularVelocityRef.current.y = 0;
          angularVelocityRef.current.z = 0;
          scaleFactorRef.current = 1;
          beginIntroSequence(now);
          lastInteractionAtRef.current = now;
          baseRotationX = 0;
          baseRotationY = 0;
          baseRotationZ = 0;
          basePositionY = 0;
        }
        break;
      }
    }

    if (phaseRef.current !== 'wiggleReset' && phaseRef.current !== 'periodicReplayReset') {
      physicsRotationRef.current.x = wrapAngle(
        physicsRotationRef.current.x + angularVelocityRef.current.x * delta,
      );
      physicsRotationRef.current.y = wrapAngle(
        physicsRotationRef.current.y + angularVelocityRef.current.y * delta,
      );
      physicsRotationRef.current.z = wrapAngle(
        physicsRotationRef.current.z + angularVelocityRef.current.z * delta,
      );

      const damping = Math.exp(-ANGULAR_DAMPING * delta);
      angularVelocityRef.current.x *= damping;
      angularVelocityRef.current.y *= damping;
      angularVelocityRef.current.z *= damping;
      clampAngularVelocity(angularVelocityRef.current);

      if (Math.abs(angularVelocityRef.current.x) < 0.0005) angularVelocityRef.current.x = 0;
      if (Math.abs(angularVelocityRef.current.y) < 0.0005) angularVelocityRef.current.y = 0;
      if (Math.abs(angularVelocityRef.current.z) < 0.0005) angularVelocityRef.current.z = 0;
    }

    group.rotation.x = wrapAngle(baseRotationX + physicsRotationRef.current.x);
    group.rotation.y = wrapAngle(baseRotationY + physicsRotationRef.current.y);
    group.rotation.z = wrapAngle(baseRotationZ + physicsRotationRef.current.z);
    group.position.y = basePositionY;
    const responsiveScaleFactor = computeWidthAnchoredScaleFactor({
      fitMobileAspect,
      canvasWidthPx: size.width,
      canvasHeightPx: size.height,
      modelBoundsWidthWorld: modelBoundsWidthRef.current,
      modelScale: scale,
      camera,
      group,
      groupWorldPosition: groupWorldPositionRef.current,
      groupViewPosition: groupViewPositionRef.current,
    });
    group.scale.setScalar(scale * responsiveScaleFactor * scaleFactorRef.current);
  });

  return (
    <group
      ref={groupRef}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={finalizePointer}
      onPointerCancel={finalizePointer}
      onPointerOver={() => {
        isHoveringModelRef.current = true;
      }}
      onPointerOut={() => {
        isHoveringModelRef.current = false;
      }}
      onWheel={handleWheel}
    >
      <Center>
        <LogoModel modelUrl={modelUrl} onBoundsWidthChange={handleBoundsWidthChange} />
      </Center>
    </group>
  );
};

interface LogoSceneProps {
  className?: string;
  modelUrl?: string;
  modelScale?: number;
  fitMobileAspect?: boolean;
}

export const LogoScene = ({
  className = 'h-[320px] w-full',
  modelUrl = LOGO_MODEL_URL,
  modelScale = LOGO_SCALE,
  fitMobileAspect = false,
}: LogoSceneProps) => {
  const [isDragging, setIsDragging] = useState(false);
  const interactiveClassName = [
    'logo-scene-interactive',
    className,
    isDragging ? 'logo-scene-canvas--dragging' : null,
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <ThreeCanvas
      className={interactiveClassName}
      camera={{ position: [0, 0, 8.5], fov: 40 }}
    >
      <ambientLight intensity={0.8} />
      <directionalLight position={[-3, 0, 4]} intensity={1.2} />
      <Suspense fallback={<Html center className="text-xs text-black/50">Loading logo…</Html>}>
        <LogoRig
          modelUrl={modelUrl}
          scale={modelScale}
          fitMobileAspect={fitMobileAspect}
          onDragStateChange={setIsDragging}
        />
      </Suspense>
    </ThreeCanvas>
  );
};

useGLTF.preload(LOGO_MODEL_URL);
useGLTF.preload(HEADER_LOGO_MODEL_URL);
