import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createServer} from 'vite';
import {createSSRApp, nextTick, shallowReactive} from 'vue';
import {renderToString} from '@vue/server-renderer';

// Component-state checks, without a browser or added testing dependencies.
const server = await createServer({server: {middlewareMode: true}, appType: 'custom'});
try {
  const {projects} = await server.ssrLoadModule('/src/data/portfolio.ts');
  const {default: Deck} = await server.ssrLoadModule('/src/components/ProjectDeck.vue');
  const setup = Deck.setup;
  let state;
  let input;
  const opened = [];
  Deck.setup = (props, context) => {
    input = shallowReactive({...props});
    state = setup(input, context);
    return state;
  };
  const html = await renderToString(createSSRApp(Deck, {projects, onOpen: project => opened.push(project.id)}));
  assert.equal((html.match(/class="project-card/g) || []).length, 9);
  const layers = [...html.matchAll(/class="([^"]*deck-layer[^"]*)"/g)].map(match => match[1].split(/\s+/));
  assert.equal(layers.filter(classes => classes.includes('is-front')).length, 1);
  assert.equal(layers.filter(classes => classes.includes('is-distant')).length, 4);
  assert(html.includes('aria-roledescription="carousel"'));
  assert(html.includes('Bring Pennguys to the front'));
  assert.equal(state.activeProject.value.id, projects[0].id);
  assert.deepEqual(state.cards.value.map(card => card.offset), [0, 1, 2, 3, 4, -4, -3, -2, -1]);

  const capturedPointers = new Set();
  let focusCount = 0;
  const fakeStage = {
    getBoundingClientRect: () => ({left: 0, top: 0, width: 1000, height: 600}),
    focus: () => focusCount++,
    setPointerCapture: id => capturedPointers.add(id),
    hasPointerCapture: id => capturedPointers.has(id),
    releasePointerCapture: id => capturedPointers.delete(id),
  };
  state.stage.value = fakeStage;
  state.navigate(-1);
  assert.equal(state.activeIndex.value, 8);
  state.navigate(1);
  assert.equal(state.activeIndex.value, 0);
  await state.selectProject(4, true);
  assert.equal(state.activeProject.value.id, projects[4].id);
  assert.equal(focusCount, 1);
  await state.selectProject(50);
  assert.equal(state.activeIndex.value, 4);
  state.openActive();
  assert.deepEqual(opened, [projects[4].id]);

  let prevented = 0;
  const key = name => ({key: name, target: state.stage.value, preventDefault: () => prevented++});
  state.onKeydown(key('Home'));
  assert.equal(state.activeIndex.value, 0);
  state.onKeydown(key('End'));
  assert.equal(state.activeIndex.value, 8);
  state.onKeydown(key('ArrowRight'));
  assert.equal(state.activeIndex.value, 0);
  state.onKeydown(key('Enter'));
  assert.equal(opened.at(-1), projects[0].id);
  assert.equal(prevented, 4);

  const pointer = (x, y, extra = {}) => ({
    isPrimary: true, button: 0, pointerId: 1, pointerType: 'touch',
    clientX: x, clientY: y, target: {closest: () => null}, ...extra,
  });
  state.onPointerDown(pointer(200, 100));
  state.onPointerMove(pointer(100, 105));
  assert.equal(state.dragging.value, true);
  assert.equal(capturedPointers.has(1), true);
  state.onPointerUp(pointer(100, 105));
  assert.equal(state.activeIndex.value, 1);
  assert.equal(state.dragging.value, false);
  assert.equal(capturedPointers.size, 0);
  assert.equal(state.dragX.value, 0);
  let suppressed = 0;
  state.onClickCapture({detail: 1, preventDefault: () => suppressed++, stopPropagation: () => suppressed++});
  assert.equal(suppressed, 2, 'Swipe must suppress the following click');
  state.onClickCapture({detail: 0, preventDefault: () => suppressed++, stopPropagation: () => suppressed++});
  assert.equal(suppressed, 2, 'Keyboard clicks remain available');

  state.onPointerDown(pointer(200, 100));
  state.onPointerMove(pointer(205, 180));
  state.onPointerUp(pointer(205, 180));
  assert.equal(state.activeIndex.value, 1, 'Vertical scrolling must not change projects');
  state.onPointerDown(pointer(200, 100));
  state.onPointerMove(pointer(175, 100));
  state.onPointerUp(pointer(175, 100));
  assert.equal(state.activeIndex.value, 1, 'Small drags snap back');
  state.onPointerDown(pointer(200, 100));
  state.onPointerMove(pointer(100, 100));
  state.cancelGesture();
  assert.equal(state.activeIndex.value, 1, 'Canceled gestures do not switch');
  assert.equal(capturedPointers.size, 0);
  state.onPointerDown(pointer(200, 100, {target: {closest: () => ({tagName: 'A'})}}));
  state.onPointerMove(pointer(100, 100));
  state.onPointerUp(pointer(100, 100));
  assert.equal(state.activeIndex.value, 1, 'External links do not start swipes');

  state.onPointerMove(pointer(900, 100, {pointerType: 'mouse'}));
  assert(state.tiltY.value > 0);
  state.reducedMotion.value = true;
  state.resetTilt();
  state.onPointerMove(pointer(900, 100, {pointerType: 'mouse'}));
  assert.equal(state.tiltY.value, 0);

  await state.selectProject(0);
  input.projects = projects.filter(project => project.category === 'AI & data');
  await nextTick();
  assert.equal(state.activeProject.value.id, projects[0].id);
  assert.equal(state.cards.value.length, 5);
  input.projects = projects.filter(project => project.category === 'Embedded');
  await nextTick();
  assert.equal(state.activeProject.value.id, 'vehicle-autonomy');
  state.navigate(1);
  assert.equal(state.activeIndex.value, 0);
  input.projects = [];
  await nextTick();
  state.navigate(-1);
  state.openActive();
  assert.equal(state.activeProject.value, undefined);
  assert.equal(state.cards.value.length, 0);
  const empty = await renderToString(createSSRApp(Deck, {projects: []}));
  assert(empty.includes('No projects in this category yet.'));

  const css = readFileSync('src/styles/project-deck.css', 'utf8');
  assert(css.includes('perspective: 1600px'));
  assert(css.includes('touch-action: pan-y pinch-zoom'));
  assert(css.includes('@media (prefers-reduced-motion: reduce)'));
  assert(css.includes('@media (max-width: 760px)'));
  console.log('PASS: 9 project cards, circular navigation, keyboard opening, swipe suppression, vertical scroll, cancelation, filters, empty/single states, reduced-motion tilt, and responsive CSS hooks.');
} finally {
  await server.close();
}
