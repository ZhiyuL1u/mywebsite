<script setup lang="ts">
import {computed, nextTick, onBeforeUnmount, onMounted, ref, watch} from 'vue';
import ProjectCard from './ProjectCard.vue';
import type {Project} from '../data/portfolio';

const props = defineProps<{projects: Project[]}>();
const emit = defineEmits<{open: [project: Project]}>();
const stage = ref<HTMLElement | null>(null);
const selectedId = ref(props.projects[0]?.id ?? '');
const activeIndex = computed(() => Math.max(0, props.projects.findIndex(project => project.id === selectedId.value)));
const activeProject = computed(() => props.projects[activeIndex.value]);
const tiltX = ref(0);
const tiltY = ref(0);
const dragX = ref(0);
const dragging = ref(false);
const reducedMotion = ref(false);
let motionPreference: MediaQueryList | undefined;
let pointerStart: {id: number; x: number; y: number} | null = null;
let suppressClickUntil = 0;

function offsetFor(index: number) {
  const count = props.projects.length;
  if (!count) return 0;
  let offset = (index - activeIndex.value + count) % count;
  if (offset > count / 2) offset -= count;
  return offset;
}

const cards = computed(() => props.projects.map((project, index) => {
  const offset = offsetFor(index);
  const distance = Math.abs(offset);
  return {
    project, index, offset, distance,
    style: {
      '--offset': offset,
      '--distance': distance,
      '--depth': `${-distance * 110}px`,
      '--yaw': `${offset * -7}deg`,
      '--roll': `${offset * 4}deg`,
      '--scale': 1 - Math.min(distance, 4) * 0.04,
      zIndex: 10 - distance,
    },
  };
}));

function resetTilt() {
  tiltX.value = 0;
  tiltY.value = 0;
}

function cancelGesture() {
  const id = pointerStart?.id;
  pointerStart = null;
  dragging.value = false;
  dragX.value = 0;
  if (id !== undefined && stage.value?.hasPointerCapture(id)) stage.value.releasePointerCapture(id);
  resetTilt();
}

async function selectProject(index: number, focusStage = false) {
  const project = props.projects[index];
  if (!project) return;
  selectedId.value = project.id;
  resetTilt();
  if (focusStage) {
    await nextTick();
    stage.value?.focus({preventScroll: true});
  }
}

function navigate(direction: number) {
  const count = props.projects.length;
  if (count < 2) return;
  void selectProject((activeIndex.value + direction + count) % count);
}

function openActive() {
  if (activeProject.value) emit('open', activeProject.value);
}

function onKeydown(event: KeyboardEvent) {
  if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
  if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
    event.preventDefault();
    navigate(event.key === 'ArrowLeft' ? -1 : 1);
    stage.value?.focus({preventScroll: true});
  } else if (event.target === stage.value) {
    if (event.key === 'Home' || event.key === 'End') {
      event.preventDefault();
      void selectProject(event.key === 'Home' ? 0 : props.projects.length - 1);
    } else if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      openActive();
    }
  }
}

function onPointerDown(event: PointerEvent) {
  if (!event.isPrimary || event.button !== 0 || props.projects.length < 2) return;
  // External links keep their normal selection and navigation behavior.
  if ((event.target as HTMLElement).closest('a')) return;
  pointerStart = {id: event.pointerId, x: event.clientX, y: event.clientY};
}

function onPointerMove(event: PointerEvent) {
  if (!stage.value) return;
  if (pointerStart && pointerStart.id === event.pointerId) {
    const dx = event.clientX - pointerStart.x;
    const dy = event.clientY - pointerStart.y;
    if (!dragging.value && Math.abs(dy) > 12 && Math.abs(dy) > Math.abs(dx)) {
      cancelGesture();
      return;
    }
    if (Math.abs(dx) > 10 && Math.abs(dx) > Math.abs(dy) * 1.2) {
      dragging.value = true;
      if (!stage.value.hasPointerCapture(event.pointerId)) stage.value.setPointerCapture(event.pointerId);
    }
    if (dragging.value) {
      dragX.value = Math.max(-130, Math.min(130, dx * 0.45));
      resetTilt();
      return;
    }
  }
  if (event.pointerType !== 'mouse' || reducedMotion.value) return;
  const bounds = stage.value.getBoundingClientRect();
  const x = Math.max(-0.5, Math.min(0.5, (event.clientX - bounds.left) / bounds.width - 0.5));
  const y = Math.max(-0.5, Math.min(0.5, (event.clientY - bounds.top) / bounds.height - 0.5));
  tiltX.value = -y * 7;
  tiltY.value = x * 10;
}

function onPointerUp(event: PointerEvent) {
  if (!pointerStart || pointerStart.id !== event.pointerId) return;
  const dx = event.clientX - pointerStart.x;
  const dy = event.clientY - pointerStart.y;
  if (dragging.value) {
    // A swipe must never also open the newly selected project.
    suppressClickUntil = performance.now() + 350;
    if (Math.abs(dx) >= 55 && Math.abs(dx) > Math.abs(dy) * 1.2) navigate(dx < 0 ? 1 : -1);
  }
  cancelGesture();
}

function onClickCapture(event: MouseEvent) {
  if (event.detail !== 0 && performance.now() < suppressClickUntil) {
    event.preventDefault();
    event.stopPropagation();
  }
}

function onPointerLeave() {
  if (!dragging.value) cancelGesture();
}

function updateMotionPreference() {
  reducedMotion.value = motionPreference?.matches ?? false;
  resetTilt();
}

watch(() => props.projects.map(project => project.id).join('|'), () => {
  if (!props.projects.some(project => project.id === selectedId.value)) selectedId.value = props.projects[0]?.id ?? '';
  cancelGesture();
});

onMounted(() => {
  motionPreference = window.matchMedia('(prefers-reduced-motion: reduce)');
  updateMotionPreference();
  motionPreference.addEventListener('change', updateMotionPreference);
});

onBeforeUnmount(() => {
  motionPreference?.removeEventListener('change', updateMotionPreference);
  cancelGesture();
});
</script>

<template>
  <div class="project-deck" role="region" aria-roledescription="carousel" aria-label="Selected projects">
    <template v-if="activeProject">
      <p id="deck-instructions" class="deck-instructions">Drag or use ← → to browse. Click a card to explore.</p>
      <div ref="stage" id="project-deck-stage" class="deck-stage" :class="{'is-dragging': dragging}"
        tabindex="0" role="group" aria-label="Project card stack" aria-describedby="deck-instructions"
        :style="{'--tilt-x': `${tiltX}deg`, '--tilt-y': `${tiltY}deg`, '--drag-x': `${dragX}px`}"
        @keydown="onKeydown" @pointerdown="onPointerDown" @pointermove="onPointerMove"
        @pointerup="onPointerUp" @pointercancel="cancelGesture" @lostpointercapture="cancelGesture"
        @pointerleave="onPointerLeave" @click.capture="onClickCapture" @dragstart.prevent>
        <div v-for="card in cards" :key="card.project.id" class="deck-layer"
          :class="{'is-front': card.offset === 0, 'is-distant': card.distance > 2}"
          :style="card.style" :inert="card.distance > 2" :aria-hidden="card.distance > 2 ? true : undefined">
          <div class="deck-surface">
            <ProjectCard :project="card.project" :number="String(card.index + 1).padStart(2, '0')" :featured="false"
              :inert="card.offset !== 0" :aria-hidden="card.offset !== 0 ? true : undefined"
              @open="emit('open', card.project)" />
            <button v-if="card.offset !== 0" type="button" class="deck-select-layer"
              :aria-label="'Bring ' + card.project.title + ' to the front'"
              @click="selectProject(card.index, true)"><span>{{ String(card.index + 1).padStart(2, '0') }}</span></button>
          </div>
        </div>
      </div>
      <div class="deck-controls">
        <button type="button" class="deck-arrow" aria-label="Previous project" aria-controls="project-deck-stage"
          :disabled="projects.length < 2" @click="navigate(-1)">←</button>
        <p class="deck-position" role="status" aria-live="polite" aria-atomic="true">
          <span>{{ String(activeIndex + 1).padStart(2, '0') }} <span class="deck-total">/ {{ String(projects.length).padStart(2, '0') }}</span></span>
          <span class="deck-current-title">{{ activeProject.title }}</span>
        </p>
        <button type="button" class="deck-arrow" aria-label="Next project" aria-controls="project-deck-stage"
          :disabled="projects.length < 2" @click="navigate(1)">→</button>
      </div>
      <div class="deck-index" role="group" aria-label="Choose a project">
        <button v-for="(project, index) in projects" :key="project.id" type="button"
          :class="{active: index === activeIndex}" :aria-pressed="index === activeIndex"
          aria-controls="project-deck-stage" @click="selectProject(index)">
          <span>{{ String(index + 1).padStart(2, '0') }}</span>{{ project.title }}
        </button>
      </div>
    </template>
    <p v-else class="deck-empty" role="status">No projects in this category yet.</p>
  </div>
</template>
