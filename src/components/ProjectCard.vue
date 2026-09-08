<script setup lang="ts">
import type {Project} from '../data/portfolio';

defineProps<{project: Project; number: string; featured: boolean}>();
const emit = defineEmits<{open: []}>();

function openFromSurface(event: MouseEvent) {
  if ((event.target as HTMLElement).closest('a, button')) return;
  emit('open');
}
</script>

<template>
  <article class="project-card" :class="{'project-featured': featured}" :aria-labelledby="'project-' + project.id" @click="openFromSurface">
    <button class="project-image" type="button" :aria-label="'View details of ' + project.title" @click="$emit('open')">
      <img :src="project.image" :alt="project.title + ' project screenshot'" loading="lazy" decoding="async" />
      <span class="project-image-hint" aria-hidden="true">Explore project ↗</span>
    </button>
    <div class="project-info">
      <p class="project-kicker"><span>{{ number }} / {{ project.category }}</span><span v-if="featured">Featured</span></p>
      <h3 :id="'project-' + project.id"><button type="button" @click="$emit('open')">{{ project.title }}<span aria-hidden="true">↗</span></button></h3>
      <p class="project-subtitle">{{ project.subtitle }}</p>
      <p class="project-summary">{{ project.summary }}</p>
      <ul class="tech-list" aria-label="Selected technologies">
        <li v-for="technology in project.technologies.slice(0, 3)" :key="technology">{{ technology }}</li>
        <li v-if="project.technologies.length > 3" class="tech-more" :aria-label="(project.technologies.length - 3) + ' more technologies in project details'">+{{ project.technologies.length - 3 }}</li>
      </ul>
      <div class="project-actions">
        <button class="text-link" type="button" @click="$emit('open')" :aria-label="'Read project notes for ' + project.title">View details <span>＋</span></button>
        <a v-if="project.links[0]" :href="project.links[0].url" target="_blank" rel="noopener noreferrer" :aria-label="project.links[0].label + ' for ' + project.title">{{ project.links[0].label }} ↗</a>
      </div>
    </div>
  </article>
</template>
