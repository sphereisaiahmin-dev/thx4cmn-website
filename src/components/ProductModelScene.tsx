'use client';

import { Center, Html, OrbitControls, useGLTF } from '@react-three/drei';
import { useFrame, useThree } from '@react-three/fiber';
import { Suspense, useCallback, useEffect, useRef, useState, type RefObject } from 'react';
import {
  Box3,
  type Group,
  MathUtils,
  type Mesh,
  PerspectiveCamera,
  Sphere,
  Vector3,
} from 'three';
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib';

import { ThreeCanvas } from './ThreeCanvas';

type FitMode = 'default' | 'detail-fill';

interface ProductModelSceneProps {
  modelUrl: string;
  className?: string;
  fitMode?: FitMode;
}

interface ProductModelRigProps {
  modelUrl: string;
  autoRotate: boolean;
  onToggle: () => void;
  groupRef: RefObject<Group | null>;
}

interface DetailCameraFitterProps {
  enabled: boolean;
  modelUrl: string;
  targetRef: RefObject<Group | null>;
  controlsRef: RefObject<OrbitControlsImpl | null>;
}

const scaleByModelUrl: Record<string, number> = {
  '/api/3d/samplepack.glb': 20,
  '/api/3d/thxc.glb': 0.0227,
};
const DETAIL_REFERENCE_ASPECT = 4 / 5;
const DETAIL_TARGET_FILL = 1;
const DETAIL_FIT_MARGIN = 1.06;

const isFiniteBox = (box: Box3) =>
  Number.isFinite(box.min.x) &&
  Number.isFinite(box.min.y) &&
  Number.isFinite(box.min.z) &&
  Number.isFinite(box.max.x) &&
  Number.isFinite(box.max.y) &&
  Number.isFinite(box.max.z);

const getRenderableBounds = (root: Group) => {
  const meshBounds: Array<{ box: Box3; volume: number }> = [];
  const size = new Vector3();

  root.traverse((object) => {
    const mesh = object as Mesh;
    if (!mesh.isMesh || !mesh.geometry || !mesh.visible) return;

    if (!mesh.geometry.boundingBox) {
      mesh.geometry.computeBoundingBox();
    }

    if (!mesh.geometry.boundingBox) return;

    const worldBounds = mesh.geometry.boundingBox.clone().applyMatrix4(mesh.matrixWorld);
    if (!isFiniteBox(worldBounds)) return;

    worldBounds.getSize(size);
    const volume = Math.max(size.x, 0) * Math.max(size.y, 0) * Math.max(size.z, 0);
    if (!Number.isFinite(volume) || volume <= 0) return;

    meshBounds.push({ box: worldBounds, volume });
  });

  if (meshBounds.length === 0) return null;

  const volumes = meshBounds.map((entry) => entry.volume).sort((a, b) => a - b);
  const median = volumes[Math.floor(volumes.length / 2)] ?? volumes[0];
  const lowerBound = median / 4000;
  const upperBound = median * 24;
  const filteredBounds = meshBounds.filter(
    (entry) => entry.volume >= lowerBound && entry.volume <= upperBound,
  );
  const source = filteredBounds.length > 0 ? filteredBounds : meshBounds;

  const union = new Box3();
  for (const entry of source) {
    union.union(entry.box);
  }
  return union;
};

const ProductModel = ({ modelUrl }: { modelUrl: string }) => {
  const { scene } = useGLTF(modelUrl);
  const scale = scaleByModelUrl[modelUrl] ?? 1;
  return <primitive object={scene} scale={scale} />;
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

const ProductModelRig = ({ modelUrl, autoRotate, onToggle, groupRef }: ProductModelRigProps) => {
  useFrame((_, delta) => {
    const modelGroup = groupRef.current;
    if (!modelGroup || !autoRotate) return;
    modelGroup.rotation.y += delta * 0.6;
    modelGroup.rotation.y = MathUtils.euclideanModulo(modelGroup.rotation.y, Math.PI * 2);
  });

  return (
    <group
      ref={groupRef}
      onClick={(event) => {
        event.stopPropagation();
        onToggle();
      }}
    >
      <Center>
        <ProductModel modelUrl={modelUrl} />
      </Center>
    </group>
  );
};

export const ProductModelScene = ({
  modelUrl,
  className,
  fitMode = 'default',
}: ProductModelSceneProps) => {
  const [autoRotate, setAutoRotate] = useState(true);
  const groupRef = useRef<Group | null>(null);
  const controlsRef = useRef<OrbitControlsImpl | null>(null);

  return (
    <ThreeCanvas className={className ?? 'h-48 w-full'} camera={{ position: [0, 0, 3.2], fov: 45 }}>
      <ambientLight intensity={0.7} />
      <directionalLight position={[3, 3, 4]} intensity={1.1} />
      <directionalLight position={[-3, -2, 2]} intensity={0.6} />
      <Suspense
        fallback={<Html center className="text-xs text-black/50">Loading model…</Html>}
      >
        <ProductModelRig
          groupRef={groupRef}
          modelUrl={modelUrl}
          autoRotate={autoRotate}
          onToggle={() => setAutoRotate((value) => !value)}
        />
        <DetailCameraFitter
          enabled={fitMode === 'detail-fill'}
          modelUrl={modelUrl}
          targetRef={groupRef}
          controlsRef={controlsRef}
        />
      </Suspense>
      <OrbitControls ref={controlsRef} enablePan={false} enableZoom={false} enableDamping />
    </ThreeCanvas>
  );
};

useGLTF.preload('/api/3d/samplepack.glb');
useGLTF.preload('/api/3d/thxc.glb');
