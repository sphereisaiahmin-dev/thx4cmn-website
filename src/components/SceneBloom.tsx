'use client';

import { useEffect, useMemo } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { Vector2 } from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';

interface SceneBloomProps {
  strength: number;
  radius: number;
  threshold: number;
}

export const SceneBloom = ({ strength, radius, threshold }: SceneBloomProps) => {
  const { gl, scene, camera, size } = useThree();

  const composer = useMemo(() => {
    const renderPass = new RenderPass(scene, camera);
    const bloomPass = new UnrealBloomPass(new Vector2(size.width, size.height), strength, radius, threshold);
    const effectComposer = new EffectComposer(gl);
    effectComposer.addPass(renderPass);
    effectComposer.addPass(bloomPass);

    return { bloomPass, composer: effectComposer, renderPass };
  }, [camera, gl, radius, scene, size.height, size.width, strength, threshold]);

  useEffect(() => {
    composer.renderPass.camera = camera;
    composer.renderPass.scene = scene;
    composer.bloomPass.strength = strength;
    composer.bloomPass.radius = radius;
    composer.bloomPass.threshold = threshold;
    composer.composer.setSize(size.width, size.height);

    return () => {
      if (typeof composer.composer.dispose === 'function') {
        composer.composer.dispose();
      }
    };
  }, [camera, composer, radius, scene, size.height, size.width, strength, threshold]);

  useFrame(() => {
    composer.composer.render();
  }, 1);

  return null;
};
