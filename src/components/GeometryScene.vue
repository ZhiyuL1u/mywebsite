<script setup lang="ts">
import {onBeforeUnmount, onMounted, ref} from 'vue';
import * as THREE from 'three';

type ProfileId = 'flow' | 'orbit' | 'pulse';

interface SceneDimensions {
    width: number;
    height: number;
    depth: number;
    segments: number;
    radialSegments: number;
}

interface ProfileDefinition {
    id: ProfileId;
    label: string;
    sample: (t: number, dimensions: SceneDimensions) => THREE.Vector3;
}

const host = ref<HTMLElement | null>(null);
const canvas = ref<HTMLCanvasElement | null>(null);
const activeProfile = ref<ProfileId>('flow');
const supported = ref(true);

const dimensions: SceneDimensions = {
    width: 4.6,
    height: 2.8,
    depth: 3.6,
    segments: 180,
    radialSegments: 10,
};

const profiles: ProfileDefinition[] = [
    {
        id: 'flow',
        label: 'Flow',
        sample: (t, size) => {
            const angle = t * Math.PI * 2;
            const radius = size.width * (0.34 + Math.sin(angle * 3) * 0.055);
            return new THREE.Vector3(
                Math.cos(angle) * radius,
                Math.sin(angle * 2) * size.height * 0.34,
                Math.sin(angle) * size.depth * 0.42,
            );
        },
    },
    {
        id: 'orbit',
        label: 'Orbit',
        sample: (t, size) => {
            const angle = t * Math.PI * 4;
            const sweep = 0.55 + t * 0.6;
            return new THREE.Vector3(
                Math.cos(angle) * size.width * 0.34 * sweep,
                (t - 0.5) * size.height,
                Math.sin(angle) * size.depth * 0.38 * sweep,
            );
        },
    },
    {
        id: 'pulse',
        label: 'Pulse',
        sample: (t, size) => {
            const angle = t * Math.PI * 2;
            const pulse = 0.72 + Math.sin(angle * 6) * 0.16;
            return new THREE.Vector3(
                Math.cos(angle) * size.width * 0.42 * pulse,
                Math.sin(angle * 3) * size.height * 0.22,
                Math.sin(angle) * size.depth * 0.44 * pulse,
            );
        },
    },
];

let renderer: THREE.WebGLRenderer | undefined;
let scene: THREE.Scene | undefined;
let camera: THREE.PerspectiveCamera | undefined;
let sculpture: THREE.Group | undefined;
let profileGroup: THREE.Group | undefined;
let profilePath: THREE.CatmullRomCurve3 | undefined;
let frameId = 0;
let resizeObserver: ResizeObserver | undefined;
let visibilityObserver: IntersectionObserver | undefined;
let sceneVisible = true;
let scrollProgress = 0;
const pointer = new THREE.Vector2();
const pointerTarget = new THREE.Vector2();
const clock = new THREE.Clock();
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

function getProfile(id: ProfileId): ProfileDefinition {
    return profiles.find((profile) => profile.id === id) ?? profiles[0];
}

function createProfilePath(profile: ProfileDefinition): THREE.CatmullRomCurve3 {
    const points = Array.from({length: 96}, (_, index) =>
        profile.sample(index / 96, dimensions),
    );
    return new THREE.CatmullRomCurve3(points, profile.id !== 'orbit', 'catmullrom', 0.48);
}

function createFieldGeometry(count: number, spread: number): THREE.BufferGeometry {
    const positions = new Float32Array(count * 3);
    let seed = 17;
    const random = () => {
        seed = (seed * 16807) % 2147483647;
        return (seed - 1) / 2147483646;
    };

    for (let index = 0; index < count; index += 1) {
        const stride = index * 3;
        positions[stride] = (random() - 0.5) * spread;
        positions[stride + 1] = (random() - 0.5) * spread * 0.72;
        positions[stride + 2] = (random() - 0.5) * spread;
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    return geometry;
}

function disposeObject(object: THREE.Object3D): void {
    object.traverse((child) => {
        if (!(child instanceof THREE.Mesh || child instanceof THREE.Points || child instanceof THREE.LineSegments)) {
            return;
        }
        child.geometry.dispose();
        const materials = Array.isArray(child.material) ? child.material : [child.material];
        materials.forEach((material) => material.dispose());
    });
}

function buildProfile(id: ProfileId): void {
    if (!sculpture) {
        return;
    }
    if (profileGroup) {
        sculpture.remove(profileGroup);
        disposeObject(profileGroup);
    }

    const profile = getProfile(id);
    profilePath = createProfilePath(profile);
    profileGroup = new THREE.Group();

    const tube = new THREE.Mesh(
        new THREE.TubeGeometry(
            profilePath,
            dimensions.segments,
            0.065,
            dimensions.radialSegments,
            profile.id !== 'orbit',
        ),
        new THREE.MeshStandardMaterial({
            color: 0xa7ff64,
            emissive: 0x244b12,
            emissiveIntensity: 1.4,
            metalness: 0.38,
            roughness: 0.2,
        }),
    );
    profileGroup.add(tube);

    const nodeGeometry = new THREE.IcosahedronGeometry(0.085, 1);
    const nodeMaterial = new THREE.MeshBasicMaterial({color: 0x8ec5ff});
    const nodes = new THREE.InstancedMesh(nodeGeometry, nodeMaterial, 32);
    const transform = new THREE.Object3D();
    for (let index = 0; index < 32; index += 1) {
        const position = profilePath.getPointAt(index / 31);
        const scale = 0.48 + (index % 5) * 0.13;
        transform.position.copy(position);
        transform.scale.setScalar(scale);
        transform.updateMatrix();
        nodes.setMatrixAt(index, transform.matrix);
    }
    nodes.instanceMatrix.needsUpdate = true;
    profileGroup.add(nodes);

    sculpture.add(profileGroup);
    activeProfile.value = id;
}

function selectProfile(id: ProfileId): void {
    if (id !== activeProfile.value) {
        buildProfile(id);
    }
}

function handlePointerMove(event: PointerEvent): void {
    if (!host.value) {
        return;
    }
    const bounds = host.value.getBoundingClientRect();
    pointerTarget.set(
        ((event.clientX - bounds.left) / bounds.width - 0.5) * 2,
        ((event.clientY - bounds.top) / bounds.height - 0.5) * 2,
    );
}

function handleScroll(): void {
    scrollProgress = window.scrollY / Math.max(document.body.scrollHeight - window.innerHeight, 1);
}

function resizeScene(): void {
    if (!host.value || !renderer || !camera) {
        return;
    }
    const width = Math.max(1, host.value.clientWidth);
    const height = Math.max(1, host.value.clientHeight);
    const pixelRatio = Math.min(window.devicePixelRatio, width < 640 ? 1.25 : 1.75);
    renderer.setPixelRatio(pixelRatio);
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
}

function render(): void {
    frameId = requestAnimationFrame(render);
    if (!renderer || !scene || !camera || !sculpture || !sceneVisible) {
        return;
    }

    const elapsed = clock.getElapsedTime();
    pointer.lerp(pointerTarget, reducedMotion.matches ? 1 : 0.045);
    sculpture.rotation.x += ((pointer.y * -0.22) - sculpture.rotation.x) * 0.035;
    sculpture.rotation.y += ((pointer.x * 0.28 + scrollProgress * 0.5) - sculpture.rotation.y) * 0.035;
    if (!reducedMotion.matches) {
        sculpture.rotation.z = Math.sin(elapsed * 0.22) * 0.08;
        if (profileGroup) {
            profileGroup.rotation.y += 0.0018;
        }
    }
    renderer.render(scene, camera);
}

onMounted(() => {
    if (!host.value || !canvas.value) {
        return;
    }

    try {
        renderer = new THREE.WebGLRenderer({
            canvas: canvas.value,
            antialias: true,
            alpha: true,
            powerPreference: 'high-performance',
        });
    } catch {
        supported.value = false;
        return;
    }

    scene = new THREE.Scene();
    scene.fog = new THREE.FogExp2(0x080b0f, 0.055);
    camera = new THREE.PerspectiveCamera(34, 1, 0.1, 100);
    camera.position.set(0, 0, 7.8);

    sculpture = new THREE.Group();
    sculpture.rotation.set(-0.18, -0.24, 0);
    scene.add(sculpture);

    const core = new THREE.Mesh(
        new THREE.IcosahedronGeometry(0.78, 3),
        new THREE.MeshPhysicalMaterial({
            color: 0x111a24,
            emissive: 0x091e2c,
            emissiveIntensity: 1.8,
            metalness: 0.8,
            roughness: 0.22,
            wireframe: true,
        }),
    );
    sculpture.add(core);

    const cage = new THREE.LineSegments(
        new THREE.EdgesGeometry(new THREE.BoxGeometry(dimensions.width, dimensions.height, dimensions.depth)),
        new THREE.LineBasicMaterial({color: 0x203142, transparent: true, opacity: 0.48}),
    );
    sculpture.add(cage);

    const field = new THREE.Points(
        createFieldGeometry(360, 10),
        new THREE.PointsMaterial({color: 0x5d7895, size: 0.018, transparent: true, opacity: 0.62}),
    );
    scene.add(field);

    scene.add(new THREE.AmbientLight(0xb9d8ff, 1.7));
    const keyLight = new THREE.PointLight(0xb6ff75, 18, 14);
    keyLight.position.set(3, 3, 4);
    scene.add(keyLight);
    const fillLight = new THREE.PointLight(0x3d8dff, 14, 12);
    fillLight.position.set(-4, -2, 2);
    scene.add(fillLight);

    buildProfile(activeProfile.value);
    resizeObserver = new ResizeObserver(resizeScene);
    resizeObserver.observe(host.value);
    visibilityObserver = new IntersectionObserver(([entry]) => {
        sceneVisible = entry.isIntersecting;
    });
    visibilityObserver.observe(host.value);
    host.value.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('scroll', handleScroll, {passive: true});
    handleScroll();
    resizeScene();
    render();
});

onBeforeUnmount(() => {
    cancelAnimationFrame(frameId);
    resizeObserver?.disconnect();
    visibilityObserver?.disconnect();
    window.removeEventListener('scroll', handleScroll);
    if (host.value) {
        host.value.removeEventListener('pointermove', handlePointerMove);
    }
    if (scene) {
        disposeObject(scene);
    }
    renderer?.dispose();
});
</script>

<template>
  <div ref="host" class="geometry-scene" @pointerleave="pointerTarget.set(0, 0)">
    <canvas v-show="supported" ref="canvas" aria-label="Interactive generative geometry"></canvas>
    <div v-if="!supported" class="geometry-fallback">WebGL preview unavailable</div>

    <div class="scene-caption" aria-hidden="true">
      <span>GENERATIVE OBJECT / 001</span>
      <span>{{ dimensions.width }} × {{ dimensions.height }} × {{ dimensions.depth }}</span>
    </div>

    <div class="profile-switcher" aria-label="Geometry profile">
      <span>Profile</span>
      <button
        v-for="profile in profiles"
        :key="profile.id"
        type="button"
        :class="{active: activeProfile === profile.id}"
        :aria-pressed="activeProfile === profile.id"
        @click="selectProfile(profile.id)"
      >
        {{ profile.label }}
      </button>
    </div>
  </div>
</template>
