'use client';

import { Center, Html, OrbitControls, useGLTF } from '@react-three/drei';
import { useFrame, useThree } from '@react-three/fiber';
import {
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type MutableRefObject,
} from 'react';
import { Box3, type Group, MathUtils, PerspectiveCamera, Sphere } from 'three';
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib';

import { SceneBloom } from './SceneBloom';
import { ThreeCanvas } from './ThreeCanvas';
import {
  applyProductMotion,
  clonePreparedProductScene,
  getBloomSettings,
  getModelLightRig,
  getRenderableBounds,
  getSurfacePresentation,
  scaleByModelUrl,
  tuneUniversePointIntensity,
  type UniversePointIntensityOptions,
} from './productModelPresentation';

type FitMode = 'default' | 'detail-fill' | 'detail-immersive';
type ScenePerformanceMode = 'auto' | 'default' | 'constrained';

interface ProductModelSceneProps {
  modelUrl: string;
  className?: string;
  fitMode?: FitMode;
  isActive?: boolean;
  performanceMode?: ScenePerformanceMode;
  presentationScaleMultiplier?: number;
  universePointIntensity?: UniversePointIntensityOptions;
  universeLightIntensityMultiplier?: number;
}

interface ProductModelRigProps {
  modelUrl: string;
  fitMode: FitMode;
  autoRotate: boolean;
  isActive: boolean;
  onToggle: () => void;
  orbitRef: MutableRefObject<Group | null>;
  spinRef: MutableRefObject<Group | null>;
  presentationScaleMultiplier?: number;
  universePointIntensity?: UniversePointIntensityOptions;
}

interface DetailCameraFitterProps {
  fitMode: FitMode;
  modelUrl: string;
  targetRef: MutableRefObject<Group | null>;
  controlsRef: MutableRefObject<OrbitControlsImpl | null>;
}

const DETAIL_REFERENCE_ASPECT = 4 / 5;
const DETAIL_TARGET_FILL = 1;
const DETAIL_FIT_MARGIN = 1.06;
const DETAIL_IMMERSIVE_TARGET_FILL = 1.16;
const DETAIL_IMMERSIVE_MARGIN = 0.92;

const ProductModel = ({
  modelUrl,
  surface,
  presentationScaleMultiplier = 1,
  universePointIntensity,
}: {
  modelUrl: string;
  surface: 'detail' | 'card';
  presentationScaleMultiplier?: number;
  universePointIntensity?: UniversePointIntensityOptions;
}) => {
  const { scene } = useGLTF(modelUrl);
  const preparedScene = useMemo(() => {
    const clonedScene = clonePreparedProductScene(scene, modelUrl);
    if (universePointIntensity) {
      tuneUniversePointIntensity(clonedScene, modelUrl, universePointIntensity);
    }

    return clonedScene;
  }, [modelUrl, scene, universePointIntensity]);
  const surfacePresentation = getSurfacePresentation(modelUrl, surface);
  const scale = (scaleByModelUrl[modelUrl] ?? 1) * presentationScaleMultiplier;
  const frameOffset = surfacePresentation.frameOffset ?? [0, 0, 0];

  return (
    <group position={frameOffset}>
      <primitive object={preparedScene} scale={scale} />
    </group>
  );
};

const DetailCameraFitter = ({
  fitMode,
  modelUrl,
  targetRef,
  controlsRef,
}: DetailCameraFitterProps) => {
  const { camera, size } = useThree();
  const isEnabled = fitMode !== 'default';
  const needsFitRef = useRef(isEnabled);
  const fillTarget =
    fitMode === 'detail-immersive' ? DETAIL_IMMERSIVE_TARGET_FILL : DETAIL_TARGET_FILL;
  const fitMargin = fitMode === 'detail-immersive' ? DETAIL_IMMERSIVE_MARGIN : DETAIL_FIT_MARGIN;

  const fitCamera = useCallback(() => {
    if (!isEnabled || !(camera instanceof PerspectiveCamera)) return false;
    const controls = controlsRef.current;
    if (!controls) return false;

    const target = targetRef.current;
    if (!target || target.children.length === 0) return false;

    target.updateWorldMatrix(true, true);

    const bounds = getRenderableBounds(target) ?? new Box3().setFromObject(target);
    if (bounds.isEmpty()) return false;

    const sphere = bounds.getBoundingSphere(new Sphere());
    if (!Number.isFinite(sphere.radius) || sphere.radius <= 0) return false;

    const aspect = size.width / Math.max(size.height, 1);
    const referenceAspect = aspect <= DETAIL_REFERENCE_ASPECT ? aspect : DETAIL_REFERENCE_ASPECT;
    const verticalFov = MathUtils.degToRad(camera.fov);
    const horizontalFov = 2 * Math.atan(Math.tan(verticalFov / 2) * referenceAspect);
    const limitingFov = Math.min(verticalFov, horizontalFov);
    const distance = (sphere.radius / Math.sin(limitingFov / 2)) * (fitMargin / fillTarget);

    camera.position.set(sphere.center.x, sphere.center.y, sphere.center.z + distance);
    camera.near = Math.max(0.01, distance - sphere.radius * 2.2);
    camera.far = distance + sphere.radius * 3.2;
    camera.lookAt(sphere.center);
    camera.updateProjectionMatrix();

    controls.target.copy(sphere.center);
    controls.update();

    return true;
  }, [camera, controlsRef, fillTarget, fitMargin, isEnabled, size.height, size.width, targetRef]);

  useEffect(() => {
    needsFitRef.current = isEnabled;
  }, [fitMode, isEnabled, modelUrl, size.height, size.width]);

  useFrame(() => {
    if (!needsFitRef.current) return;
    if (fitCamera()) {
      needsFitRef.current = false;
    }
  });

  return null;
};

const ProductModelRig = ({
  modelUrl,
  fitMode,
  autoRotate,
  isActive,
  onToggle,
  orbitRef,
  spinRef,
  presentationScaleMultiplier = 1,
  universePointIntensity,
}: ProductModelRigProps) => {
  useFrame((state, delta) => {
    const orbitTarget = orbitRef.current;
    const spinTarget = spinRef.current ?? orbitTarget;
    if (!orbitTarget || !spinTarget || !isActive) return;

    applyProductMotion({
      modelUrl,
      delta,
      elapsed: state.clock.getElapsedTime(),
      orbitTarget,
      driftEnabled: autoRotate,
      spinTarget,
      spinEnabled: autoRotate,
    });
  });

  return (
    <group
      ref={orbitRef}
      onClick={(event) => {
        event.stopPropagation();
        onToggle();
      }}
    >
      <group ref={spinRef}>
        <Center>
          <ProductModel
            modelUrl={modelUrl}
            surface={fitMode === 'default' ? 'card' : 'detail'}
            presentationScaleMultiplier={presentationScaleMultiplier}
            universePointIntensity={universePointIntensity}
          />
        </Center>
      </group>
    </group>
  );
};

export const ProductModelScene = ({
  modelUrl,
  className,
  fitMode = 'default',
  isActive = true,
  performanceMode = 'auto',
  presentationScaleMultiplier = 1,
  universePointIntensity,
  universeLightIntensityMultiplier = 1,
}: ProductModelSceneProps) => {
  const [autoRotate, setAutoRotate] = useState(true);
  const orbitRef = useRef<Group>(null);
  const spinRef = useRef<Group>(null);
  const controlsRef = useRef<OrbitControlsImpl>(null);
  const bloomSettings = getBloomSettings(modelUrl);
  const lightRig = getModelLightRig(modelUrl);

  return (
    <ThreeCanvas
      className={className ?? 'h-48 w-full'}
      camera={{ position: [0, 0, 3.2], fov: 45 }}
      isActive={isActive}
      performanceMode={performanceMode}
    >
      {lightRig === 'universe' ? (
        <>
          <ambientLight intensity={0.28} color="#dce8ff" />
          <pointLight
            position={[2.4, 1.4, 2.8]}
            intensity={7.7 * universeLightIntensityMultiplier}
            distance={8}
            decay={2}
            color="#5da1ff"
          />
          <pointLight
            position={[-2.8, -1.1, 2.4]}
            intensity={12 * universeLightIntensityMultiplier}
            distance={8}
            decay={2}
            color="#9c4dff"
          />
          <directionalLight
            position={[0, 0.5, 4]}
            intensity={0.209 * universeLightIntensityMultiplier}
            color="#f5f9ff"
          />
        </>
      ) : (
        <>
          <ambientLight intensity={0.7} />
          <directionalLight position={[3, 3, 4]} intensity={1.1} />
          <directionalLight position={[-3, -2, 2]} intensity={0.6} />
        </>
      )}
      <Suspense
        fallback={
          <Html center className="text-xs text-black/50">
            Loading model...
          </Html>
        }
      >
        <ProductModelRig
          orbitRef={orbitRef}
          spinRef={spinRef}
          modelUrl={modelUrl}
          fitMode={fitMode}
          autoRotate={autoRotate}
          isActive={isActive}
          onToggle={() => setAutoRotate((value) => !value)}
          presentationScaleMultiplier={presentationScaleMultiplier}
          universePointIntensity={universePointIntensity}
        />
        <DetailCameraFitter
          fitMode={fitMode}
          modelUrl={modelUrl}
          targetRef={orbitRef}
          controlsRef={controlsRef}
        />
      </Suspense>
      {bloomSettings ? <SceneBloom {...bloomSettings} /> : null}
      <OrbitControls
        ref={controlsRef}
        enablePan={false}
        enableZoom={false}
        enableDamping
        enabled={isActive}
      />
    </ThreeCanvas>
  );
};
