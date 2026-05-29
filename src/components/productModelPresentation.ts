'use client';

import {
  AdditiveBlending,
  Box3,
  BufferAttribute,
  Color,
  MathUtils,
  Mesh,
  type Object3D,
  Points,
  ShaderMaterial,
  type Group,
  type Material,
  Vector3,
} from 'three';

export const UNIVERSE_MODEL_URL = '/api/3d/need_some_space/scene.gltf';

export interface BloomSettings {
  strength: number;
  radius: number;
  threshold: number;
}

export const scaleByModelUrl: Record<string, number> = {
  '/api/3d/samplepack.glb': 20,
  [UNIVERSE_MODEL_URL]: 1.08,
  '/api/3d/thxc.glb': 0.0227,
};

const gradientStart = new Color('#2f7cff');
const gradientEnd = new Color('#9c4dff');
const gradientColor = new Color();

const isFiniteBox = (box: Box3) =>
  Number.isFinite(box.min.x) &&
  Number.isFinite(box.min.y) &&
  Number.isFinite(box.min.z) &&
  Number.isFinite(box.max.x) &&
  Number.isFinite(box.max.y) &&
  Number.isFinite(box.max.z);

const isRenderableObject = (object: Object3D): object is Mesh | Points => {
  return object instanceof Mesh || object instanceof Points;
};

const cloneMaterial = (material: Material | Material[]) =>
  Array.isArray(material) ? material.map((entry) => entry.clone()) : material.clone();

const createUniversePointMaterial = () => {
  const material = new ShaderMaterial({
    vertexColors: true,
    transparent: true,
    depthWrite: false,
    depthTest: false,
    blending: AdditiveBlending,
    uniforms: {
      uOpacity: { value: 1 },
      uPointSize: { value: 3.9 },
      uGlowBoost: { value: 1.05 },
    },
    vertexShader: `
      uniform float uPointSize;
      varying vec3 vColor;

      void main() {
        vColor = color;
        vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
        float depthScale = clamp(17.0 / max(3.0, -mvPosition.z), 0.9, 2.8);
        gl_PointSize = uPointSize * depthScale;
        gl_Position = projectionMatrix * mvPosition;
      }
    `,
    fragmentShader: `
      uniform float uOpacity;
      uniform float uGlowBoost;
      varying vec3 vColor;

      void main() {
        vec2 pointUv = gl_PointCoord * 2.0 - 1.0;
        float radius = dot(pointUv, pointUv);
        if (radius > 1.0) {
          discard;
        }

        float core = pow(max(0.0, 1.0 - radius), 1.75);
        float halo = pow(max(0.0, 1.0 - radius), 3.15);
        vec3 finalColor = vColor * (0.8 + halo * uGlowBoost);
        gl_FragColor = vec4(finalColor, (core * 0.34 + halo * 0.18) * uOpacity);
      }
    `,
  });

  material.toneMapped = false;
  material.userData.opacityUniform = 'uOpacity';
  material.userData.forceTransparent = true;
  return material;
};

const applyUniverseGradient = (points: Points) => {
  const geometry = points.geometry.clone();
  const position = geometry.getAttribute('position');
  if (!position || position.itemSize < 3) {
    points.geometry = geometry;
    return;
  }

  geometry.computeBoundingBox();
  const bounds = geometry.boundingBox;
  if (!bounds) {
    points.geometry = geometry;
    return;
  }

  const size = new Vector3();
  bounds.getSize(size);
  const rangeX = Math.max(size.x, 0.0001);
  const rangeY = Math.max(size.y, 0.0001);
  const rangeZ = Math.max(size.z, 0.0001);

  const colors = new Float32Array(position.count * 3);
  for (let index = 0; index < position.count; index += 1) {
    const x = position.getX(index);
    const y = position.getY(index);
    const z = position.getZ(index);
    const normalizedX = (x - bounds.min.x) / rangeX;
    const normalizedY = (y - bounds.min.y) / rangeY;
    const normalizedZ = (z - bounds.min.z) / rangeZ;
    const blend = MathUtils.clamp(
      normalizedY * 0.56 + normalizedX * 0.24 + normalizedZ * 0.2,
      0,
      1,
    );
    const intensity = 0.88 + 0.22 * (1 - Math.abs(blend - 0.5) * 2);
    gradientColor.copy(gradientStart).lerp(gradientEnd, blend).multiplyScalar(intensity);
    colors[index * 3] = gradientColor.r;
    colors[index * 3 + 1] = gradientColor.g;
    colors[index * 3 + 2] = gradientColor.b;
  }

  geometry.setAttribute('color', new BufferAttribute(colors, 3));
  geometry.computeBoundingSphere();
  points.geometry = geometry;
  points.material = createUniversePointMaterial();
  points.frustumCulled = false;
};

export const isUniverseModel = (modelUrl: string) => modelUrl === UNIVERSE_MODEL_URL;

export const clonePreparedProductScene = (scene: Group, modelUrl: string) => {
  const clonedScene = scene.clone(true);

  clonedScene.traverse((object) => {
    if (!isRenderableObject(object) || !object.visible) {
      return;
    }

    object.geometry = object.geometry.clone();
    object.material = cloneMaterial(object.material);

    if (isUniverseModel(modelUrl) && object instanceof Points) {
      applyUniverseGradient(object);
    }
  });

  return clonedScene;
};

export const applyRenderableOpacity = (root: Group, opacity: number) => {
  root.traverse((object) => {
    if (!isRenderableObject(object)) {
      return;
    }

    const materials = Array.isArray(object.material) ? object.material : [object.material];
    for (const material of materials) {
      const uniformName = material.userData.opacityUniform;
      if (
        typeof uniformName === 'string' &&
        material instanceof ShaderMaterial &&
        material.uniforms[uniformName]
      ) {
        material.uniforms[uniformName].value = opacity;
      }

      material.opacity = opacity;
      material.transparent = Boolean(material.userData.forceTransparent) || opacity < 0.999;
      material.needsUpdate = true;
    }
  });
};

export const getRenderableBounds = (root: Group) => {
  const renderableBounds: Array<{ box: Box3; volume: number }> = [];
  const size = new Vector3();

  root.traverse((object) => {
    if (!isRenderableObject(object) || !object.geometry || !object.visible) {
      return;
    }

    if (!object.geometry.boundingBox) {
      object.geometry.computeBoundingBox();
    }

    if (!object.geometry.boundingBox) {
      return;
    }

    const worldBounds = object.geometry.boundingBox.clone().applyMatrix4(object.matrixWorld);
    if (!isFiniteBox(worldBounds)) {
      return;
    }

    worldBounds.getSize(size);
    const volume =
      Math.max(size.x, 0.0001) * Math.max(size.y, 0.0001) * Math.max(size.z, 0.0001);
    renderableBounds.push({ box: worldBounds, volume });
  });

  if (renderableBounds.length === 0) {
    return null;
  }

  const volumes = renderableBounds.map((entry) => entry.volume).sort((left, right) => left - right);
  const median = volumes[Math.floor(volumes.length / 2)] ?? volumes[0];
  const lowerBound = median / 4000;
  const upperBound = median * 24;
  const filteredBounds = renderableBounds.filter(
    (entry) => entry.volume >= lowerBound && entry.volume <= upperBound,
  );
  const source = filteredBounds.length > 0 ? filteredBounds : renderableBounds;

  const union = new Box3();
  for (const entry of source) {
    union.union(entry.box);
  }

  return union;
};

interface ProductMotionOptions {
  modelUrl: string;
  delta: number;
  elapsed: number;
  spinTarget: Object3D;
  orbitTarget?: Object3D | null;
  driftEnabled?: boolean;
  spinEnabled?: boolean;
}

export const applyProductMotion = ({
  modelUrl,
  delta,
  elapsed,
  spinTarget,
  orbitTarget,
  driftEnabled = true,
  spinEnabled = true,
}: ProductMotionOptions) => {
  if (isUniverseModel(modelUrl)) {
    const orbitalTarget = orbitTarget ?? spinTarget;
    if (driftEnabled) {
      orbitalTarget.rotation.x = 0.44 + Math.sin(elapsed * 0.3) * 0.08;
      orbitalTarget.rotation.z = -0.24 + Math.cos(elapsed * 0.22) * 0.1;
      orbitalTarget.position.y = Math.sin(elapsed * 0.28) * 0.05;
    }

    if (spinEnabled) {
      spinTarget.rotation.y = MathUtils.euclideanModulo(
        spinTarget.rotation.y + delta * 0.16,
        Math.PI * 2,
      );
    }
    return;
  }

  if (orbitTarget) {
    orbitTarget.rotation.x = 0;
    orbitTarget.rotation.z = 0;
    orbitTarget.position.y = 0;
  }

  if (spinEnabled) {
    spinTarget.rotation.y = MathUtils.euclideanModulo(
      spinTarget.rotation.y + delta * 0.6,
      Math.PI * 2,
    );
  }
};

export const getBloomSettings = (modelUrl: string): BloomSettings | null => {
  void modelUrl;
  return null;
};

export const getModelLightRig = (modelUrl: string) => {
  if (!isUniverseModel(modelUrl)) {
    return 'default' as const;
  }

  return 'universe' as const;
};
