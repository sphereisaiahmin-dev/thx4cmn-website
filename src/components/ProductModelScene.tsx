'use client';

import { Center, Html, OrbitControls, useGLTF } from '@react-three/drei';
import { useFrame, useThree } from '@react-three/fiber';
import { Suspense, useCallback, useEffect, useMemo, useRef, useState, type RefObject } from 'react';
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
  scaleByModelUrl,
} from './productModelPresentation';

type FitMode = 'default' | 'detail-fill';
type ScenePerformanceMode = 'auto' | 'default' | 'constrained';

interface ProductModelSceneProps {
  modelUrl: string;
  className?: string;
  fitMode?: FitMode;
  isActive?: boolean;
  performanceMode?: ScenePerformanceMode;
}

interface ProductModelRigProps {
  modelUrl: string;
  autoRotate: boolean;
  isActive: boolean;
  onToggle: () => void;
  orbitRef: RefObject<Group>;
  spinRef: RefObject<Group>;
}

interface DetailCameraFitterProps {
  enabled: boolean;
  modelUrl: string;
  targetRef: RefObject<Group>;
  controlsRef: RefObject<OrbitControlsImpl>;
}

const DETAIL_REFERENCE_ASPECT = 4 / 5;
const DETAIL_TARGET_FILL = 1;
const DETAIL_FIT_MARGIN = 1.06;

const ProductModel = ({ modelUrl }: { modelUrl: string }) => {
  const { scene } = useGLTF(modelUrl);
  const preparedScene = useMemo(() => clonePreparedProductScene(scene, modelUrl), [modelUrl, scene]);
  const scale = scaleByModelUrl[modelUrl] ?? 1;
  return <primitive object={preparedScene} scale={scale} />;
};

const DetailCameraFitter = ({ enabled, modelUrl, targetRef, controlsRef }: DetailCameraFitterProps) => {
  const { camera, size } = useThree();
  const needsFitRef = useRef(enabled);

  const fitCamera = useCallback(() => {
    if (!enabled || !(camera instanceof PerspectiveCamera)) return false;
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
    const distance =
      (sphere.radius / Math.sin(limitingFov / 2)) * (DETAIL_FIT_MARGIN / DETAIL_TARGET_FILL);

    camera.position.set(sphere.center.x, sphere.center.y, sphere.center.z + distance);
    camera.near = Math.max(0.01, distance - sphere.radius * 2.2);
    camera.far = distance + sphere.radius * 3.2;
    camera.lookAt(sphere.center);
    camera.updateProjectionMatrix();

    controls.target.copy(sphere.center);
    controls.update();

    return true;
  }, [camera, controlsRef, enabled, size.height, size.width, targetRef]);

  useEffect(() => {
    needsFitRef.current = enabled;
  }, [enabled, modelUrl, size.height, size.width]);

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
  autoRotate,
  isActive,
  onToggle,
  orbitRef,
  spinRef,
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
          <ProductModel modelUrl={modelUrl} />
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
          <pointLight position={[2.4, 1.4, 2.8]} intensity={7.7} distance={8} decay={2} color="#5da1ff" />
          <pointLight position={[-2.8, -1.1, 2.4]} intensity={12} distance={8} decay={2} color="#9c4dff" />
          <directionalLight position={[0, 0.5, 4]} intensity={0.209} color="#f5f9ff" />
        </>
      ) : (
        <>
          <ambientLight intensity={0.7} />
          <directionalLight position={[3, 3, 4]} intensity={1.1} />
          <directionalLight position={[-3, -2, 2]} intensity={0.6} />
        </>
      )}
      <Suspense fallback={<Html center className="text-xs text-black/50">Loading model...</Html>}>
        <ProductModelRig
          orbitRef={orbitRef}
          spinRef={spinRef}
          modelUrl={modelUrl}
          autoRotate={autoRotate}
          isActive={isActive}
          onToggle={() => setAutoRotate((value) => !value)}
        />
        <DetailCameraFitter
          enabled={fitMode === 'detail-fill'}
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
