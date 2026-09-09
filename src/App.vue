<script setup lang="ts">
import {computed, nextTick, onBeforeUnmount, onMounted, ref} from 'vue';
import GeometryScene from './components/GeometryScene.vue';
import ProjectDeck from './components/ProjectDeck.vue';
import {disciplines, education, profile, projects, type Project, type ProjectCategory} from './data/portfolio';

const categories: Array<'All' | ProjectCategory> = ['All', 'Full stack', 'AI & data', 'Embedded', 'Interactive'];
const selectedCategory = ref<(typeof categories)[number]>('All');
const visibleProjects = computed(() => projects.filter(project =>
  selectedCategory.value === 'All' || project.category === selectedCategory.value,
));
const projectCount = String(projects.length).padStart(2, '0');
const dialog = ref<HTMLDialogElement | null>(null);
const selectedProject = ref<Project | null>(null);
const dialogKind = ref<'project' | 'wechat' | null>(null);
let previousOverflow = '';

async function openDialog(kind: 'project' | 'wechat', project: Project | null = null) {
  selectedProject.value = project;
  dialogKind.value = kind;
  await nextTick();
  if (!dialog.value || dialog.value.open) return;
  previousOverflow = document.body.style.overflow;
  dialog.value.showModal();
  dialog.value.scrollTop = 0;
  document.body.style.overflow = 'hidden';
}

function resetDialog() {
  document.body.style.overflow = previousOverflow;
  dialogKind.value = null;
  selectedProject.value = null;
}

function closeOnBackdrop(event: MouseEvent) {
  if (event.target !== dialog.value || !dialog.value) return;
  const bounds = dialog.value.getBoundingClientRect();
  if (event.clientX < bounds.left || event.clientX > bounds.right ||
      event.clientY < bounds.top || event.clientY > bounds.bottom) {
    dialog.value.close();
  }
}

onMounted(() => {
  // Keep bookmarks from the previous single-page portfolio working.
  const aliases: Record<string, string> = {'#banner': '#top', '#blog': '#work', '#experience': '#education'};
  const destination = aliases[window.location.hash] ?? window.location.hash;
  if (aliases[window.location.hash]) history.replaceState(null, '', destination);
  if (destination) document.getElementById(destination.slice(1))?.scrollIntoView({behavior: 'instant'});
});

onBeforeUnmount(() => {
  if (dialog.value?.open) document.body.style.overflow = previousOverflow;
});
</script>

<template>
  <a class="skip-link" href="#main">Skip to content</a>
  <div class="site-shell">
    <header class="site-header">
      <a class="wordmark" href="#top" aria-label="Zhiyu Liu, home">ZL<span>.</span></a>
      <nav aria-label="Primary navigation">
        <a href="#about">About</a>
        <a href="#work">Work</a>
        <a href="#education">Journey</a>
        <a href="#contact">Contact</a>
      </nav>
      <a class="header-link" :href="profile.github" target="_blank" rel="noopener noreferrer">GitHub ↗</a>
    </header>

    <main id="main">
      <section id="top" class="hero" aria-labelledby="hero-title">
        <div class="hero-copy">
          <p class="eyebrow"><span></span> Software engineering · AI · systems</p>
          <h1 id="hero-title">I build useful systems from <em>complex ideas.</em></h1>
          <p class="hero-intro">
            I’m {{ profile.name }}, a full-stack engineer working across intelligent products,
            data systems, and machine learning.
          </p>
          <div class="hero-actions">
            <a class="button button-primary" href="#work">Explore selected work <span>↓</span></a>
            <a class="button button-ghost" :href="profile.resume" target="_blank" rel="noopener noreferrer">View résumé ↗</a>
          </div>
          <div class="hero-meta" aria-label="Portfolio summary">
            <span><strong>{{ projectCount }}</strong> selected projects</span>
            <span><strong>{{ String(disciplines.length).padStart(2, '0') }}</strong> engineering disciplines</span>
          </div>
        </div>
        <GeometryScene />
      </section>

      <section id="about" class="content-section about-section" aria-labelledby="about-title">
        <div class="section-heading">
          <p class="eyebrow"><span></span> 01 / About me</p>
          <h2 id="about-title">Curiosity, <em>put to work.</em></h2>
        </div>
        <div class="about-layout">
          <figure class="portrait-frame">
            <img :src="profile.portrait" alt="Zhiyu Liu" width="913" height="1018" loading="lazy" decoding="async" />
            <figcaption><span>{{ profile.name }}</span><span>Engineer & lifelong learner</span></figcaption>
          </figure>
          <div class="about-copy">
            <p class="about-lead">From circuits and code<br />to intelligent products.</p>
            <p v-for="paragraph in profile.introduction" :key="paragraph">{{ paragraph }}</p>
            <a class="text-link" :href="profile.linkedin" target="_blank" rel="noopener noreferrer">More about my background <span>↗</span></a>
          </div>
        </div>
        <div class="disciplines">
          <article v-for="discipline in disciplines" :key="discipline.number" class="discipline">
            <span class="small-label">{{ discipline.number }}</span>
            <h3>{{ discipline.name }}</h3>
            <p>{{ discipline.description }}</p>
            <p class="discipline-tools">{{ discipline.tools }}</p>
          </article>
        </div>
      </section>

      <section id="work" class="content-section work-section" aria-labelledby="work-title">
        <div class="section-heading section-heading-split">
          <div>
            <p class="eyebrow"><span></span> 02 / Selected work</p>
            <h2 id="work-title">Ideas made <em>tangible.</em></h2>
          </div>
          <p class="section-intro">Web products, machine learning experiments, and systems that connect software to the real world.</p>
        </div>
        <div class="work-toolbar">
          <div class="project-filters" role="group" aria-label="Filter projects by discipline">
            <button v-for="category in categories" :key="category" type="button"
              :aria-pressed="selectedCategory === category" :class="{active: selectedCategory === category}"
              aria-controls="project-deck" @click="selectedCategory = category">{{ category }}</button>
          </div>
          <p class="project-count" role="status" aria-live="polite" aria-atomic="true">{{ visibleProjects.length }} of {{ projects.length }} projects</p>
        </div>
        <ProjectDeck id="project-deck" :projects="visibleProjects" @open="openDialog('project', $event)" />
      </section>

      <section id="education" class="content-section journey-section" aria-labelledby="journey-title">
        <div class="section-heading">
          <p class="eyebrow"><span></span> 03 / Education & experience</p>
          <h2 id="journey-title">Always <em>in progress.</em></h2>
        </div>
        <div class="timeline">
          <article v-for="(entry, index) in education" :key="entry.id" class="timeline-entry">
            <div class="timeline-period"><span class="timeline-dot" :class="{'timeline-dot-accent': index === 0}"></span>{{ entry.period }}</div>
            <div class="timeline-content">
              <p class="small-label">{{ entry.role }}</p>
              <h3>{{ entry.institution }}</h3>
              <p class="timeline-focus">{{ entry.focus }}</p>
              <ul><li v-for="detail in entry.details" :key="detail">{{ detail }}</li></ul>
            </div>
          </article>
        </div>
      </section>

      <section id="contact" class="content-section contact-section" aria-labelledby="contact-title">
        <p class="eyebrow"><span></span> 04 / Get in touch</p>
        <div class="contact-heading">
          <h2 id="contact-title">Good things start<br />with <em>a conversation.</em></h2>
          <img :src="profile.avatar" alt="" class="contact-avatar" width="634" height="582" loading="lazy" decoding="async" />
        </div>
        <p class="contact-intro">Have a project in mind, a question about my work, or an idea to exchange? Let’s connect.</p>
        <div class="contact-links">
          <a :href="profile.github" target="_blank" rel="noopener noreferrer"><span><small>Explore the code</small>GitHub</span><span aria-hidden="true">↗</span></a>
          <a :href="profile.linkedin" target="_blank" rel="noopener noreferrer"><span><small>Start a conversation</small>LinkedIn</span><span aria-hidden="true">↗</span></a>
          <a :href="profile.resume" target="_blank" rel="noopener noreferrer"><span><small>My background</small>Résumé</span><span aria-hidden="true">↗</span></a>
          <button type="button" @click="openDialog('wechat')"><span><small>Scan to connect</small>WeChat</span><span aria-hidden="true">＋</span></button>
        </div>
      </section>
    </main>
    <footer class="site-footer"><span>© {{ new Date().getFullYear() }} {{ profile.name }}</span><a href="#top">Back to top ↑</a></footer>
  </div>

  <dialog ref="dialog" class="detail-dialog" :class="{'wechat-dialog': dialogKind === 'wechat'}"
    aria-labelledby="dialog-title" @close="resetDialog" @click="closeOnBackdrop">
    <div class="dialog-toolbar">
      <span class="small-label">{{ dialogKind === 'wechat' ? 'Connect / WeChat' : 'Selected work / Project notes' }}</span>
      <button class="dialog-close" type="button" aria-label="Close dialog" autofocus @click="dialog?.close()">✕</button>
    </div>
    <template v-if="dialogKind === 'project' && selectedProject">
      <div class="dialog-image"><img :src="selectedProject.image" :alt="selectedProject.title + ' project screenshot'" /></div>
      <div class="dialog-body">
        <p class="small-label">{{ selectedProject.category }} / {{ selectedProject.subtitle }}</p>
        <h2 id="dialog-title">{{ selectedProject.title }}</h2>
        <p class="dialog-summary">{{ selectedProject.summary }}</p>
        <h3>Behind the project</h3>
        <p v-for="detail in selectedProject.details" :key="detail">{{ detail }}</p>
        <h3>Tools & technologies</h3>
        <ul class="tech-list"><li v-for="technology in selectedProject.technologies" :key="technology">{{ technology }}</li></ul>
        <div v-if="selectedProject.links.length" class="dialog-links">
          <a v-for="link in selectedProject.links" :key="link.url" class="button button-ghost" :href="link.url" target="_blank" rel="noopener noreferrer">{{ link.label }} ↗</a>
        </div>
      </div>
    </template>
    <div v-else-if="dialogKind === 'wechat'" class="dialog-body wechat-body">
      <h2 id="dialog-title">Let’s connect.</h2>
      <p>Scan my QR code with WeChat.</p>
      <img :src="profile.wechat" alt="Zhiyu Liu’s WeChat contact QR code" width="999" height="952" />
    </div>
  </dialog>
</template>
