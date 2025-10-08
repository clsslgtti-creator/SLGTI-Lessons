import { buildSbsSlides } from './lib/sbs.js';

const slidesContainer = document.getElementById('slides');
const progressIndicator = document.getElementById('progressIndicator');
const prevBtn = document.getElementById('prevSlide');
const nextBtn = document.getElementById('nextSlide');
const lessonMetaEl = document.getElementById('lessonMeta');

const activityBuilders = {
  SBS: buildSbsSlides,
};

const normalizeInstructionContent = (input, { allowObject = false } = {}) => {
  if (!input) {
    return [];
  }

  if (Array.isArray(input)) {
    return input
      .map((item) => (typeof item === 'string' ? item.trim() : ''))
      .filter((item) => item.length > 0);
  }

  if (typeof input === 'string') {
    const trimmed = input.trim();
    return trimmed ? [trimmed] : [];
  }

  if (allowObject && typeof input === 'object') {
    return Object.values(input)
      .flatMap((value) => normalizeInstructionContent(value, { allowObject: true }))
      .filter((item) => item.length > 0);
  }

  return [];
};

const createFocusElement = (focusText) => {
  const trimmed = typeof focusText === 'string' ? focusText.trim() : '';
  if (!trimmed) {
    return null;
  }

  const focusEl = document.createElement('p');
  focusEl.className = 'activity-focus';

  const label = document.createElement('span');
  label.className = 'activity-focus__label';
  label.textContent = 'Focus';

  focusEl.appendChild(label);
  focusEl.append(`: ${trimmed}`);

  return focusEl;
};

const createInstructionsElement = (instructions, { allowObject = false } = {}) => {
  const normalized = normalizeInstructionContent(instructions, { allowObject });
  if (!normalized.length) {
    return null;
  }

  if (normalized.length === 1) {
    const paragraph = document.createElement('p');
    paragraph.className = 'activity-instructions';
    paragraph.textContent = normalized[0];
    return paragraph;
  }

  const list = document.createElement('ul');
  list.className = 'activity-instructions';
  normalized.forEach((item) => {
    const li = document.createElement('li');
    li.textContent = item;
    list.appendChild(li);
  });
  return list;
};

const normalizeInstructionKey = (key) => {
  if (typeof key !== 'string' && typeof key !== 'number') {
    return '';
  }
  return key.toString().toLowerCase().replace(/[^a-z0-9]+/g, '');
};

const createInstructionResolver = (instructions, activityNumber) => {
  if (instructions === null || instructions === undefined) {
    return {
      isGeneral: false,
      resolve: () => [],
    };
  }

  const generalValue = normalizeInstructionContent(instructions, { allowObject: true });
  const isGeneral = Array.isArray(instructions) || typeof instructions === 'string';
  if (isGeneral) {
    return {
      isGeneral: true,
      resolve: () => generalValue,
    };
  }

  if (typeof instructions !== 'object') {
    return {
      isGeneral: false,
      resolve: () => [],
    };
  }

  const map = new Map();
  Object.entries(instructions).forEach(([key, value]) => {
    const normalizedKey = normalizeInstructionKey(key);
    if (!normalizedKey) {
      return;
    }
    const normalizedValue = normalizeInstructionContent(value, { allowObject: true });
    if (!normalizedValue.length) {
      return;
    }
    map.set(normalizedKey, normalizedValue);
  });

  const fallbackValues = Array.from(map.values());
  const fallbackDefault = fallbackValues.length ? fallbackValues[0] : [];
  const generalKeys = ['default', 'general', 'all', 'common'];

  const resolve = ({ role, letter }) => {
    const candidates = [];
    const addCandidates = (...keys) => {
      keys.forEach((candidate) => {
        if (candidate) {
          candidates.push(candidate);
        }
      });
    };

    const number = activityNumber ? String(activityNumber) : null;

    if (letter) {
      addCandidates(
        number ? `activity_${number}_${letter}` : '',
        number ? `activity${number}${letter}` : '',
        number && number !== '1' ? `activity_1_${letter}` : '',
        number && number !== '1' ? `activity1${letter}` : '',
        `activity_${letter}`,
        `activity${letter}`,
      );
    }

    switch (role) {
      case 'model':
        addCandidates(
          number ? `activity_${number}_model` : '',
          number ? `activity${number}model` : '',
          number ? `activity_${number}_example` : '',
          number ? `activity${number}example` : '',
          'model',
          'example',
          'introduction',
        );
        break;
      case 'warmup':
        addCandidates('warmup', 'warm-up', 'matching', 'match');
        break;
      case 'listen-repeat':
        addCandidates(
          'listenrepeat',
          'listenandrepeat',
          'listen_and_repeat',
          'listen-repeat',
          'listen&repeat',
          'repeat',
        );
        break;
      case 'listening':
        addCandidates('listening', 'listen');
        break;
      case 'reading':
        addCandidates('reading', 'read', 'readalong');
        break;
      case 'speaking':
        addCandidates('speaking', 'speak', 'speakingpractice');
        break;
      default:
        break;
    }
    for (const candidate of candidates) {
      const normalizedCandidate = normalizeInstructionKey(candidate);
      if (normalizedCandidate && map.has(normalizedCandidate)) {
        return map.get(normalizedCandidate);
      }
    }

    for (const fallback of generalKeys) {
      const normalizedFallback = normalizeInstructionKey(fallback);
      if (normalizedFallback && map.has(normalizedFallback)) {
        return map.get(normalizedFallback);
      }
    }

    return fallbackDefault;
  };

  return {
    isGeneral: false,
    resolve,
  };
};

const applyInstructionsToSlide = (slideElement, instructions) => {
  const normalized = normalizeInstructionContent(instructions);
  if (!normalized.length) {
    return;
  }

  const anchor =
    slideElement.querySelector('.activity-focus') ?? slideElement.querySelector('h2') ?? slideElement.firstElementChild;
  const existing = slideElement.querySelector('.slide__instruction');

  if (normalized.length === 1) {
    const text = normalized[0];
    if (existing) {
      existing.textContent = text;
      existing.classList.add('activity-instructions');
    } else {
      const paragraph = document.createElement('p');
      paragraph.className = 'activity-instructions';
      paragraph.textContent = text;
      anchor?.insertAdjacentElement('afterend', paragraph);
    }
    return;
  }

  const list = document.createElement('ul');
  list.className = 'activity-instructions';
  normalized.forEach((item) => {
    const li = document.createElement('li');
    li.textContent = item;
    list.appendChild(li);
  });

  if (existing) {
    existing.replaceWith(list);
    return;
  }

  anchor?.insertAdjacentElement('afterend', list);
};

const parseActivitySlideId = (slideId) => {
  if (typeof slideId !== 'string') {
    return null;
  }
  const normalized = slideId.toLowerCase();
  const letterMap = {
    warmup: 'a',
    listening: 'b',
    'listen-repeat': 'c',
    reading: 'd',
    speaking: 'e',
  };
  const detailedMatch =
    /^activity-(\d+)(?:-([a-z]))?-(model|warmup|listening|listen-repeat|reading|speaking)$/.exec(normalized);
  if (detailedMatch) {
    const [, activityNumber, letter, role] = detailedMatch;
    return {
      activityNumber,
      role,
      letter: letter || letterMap[role] || '',
    };
  }

  const simpleMatch = /^activity-(model|warmup|listening|listen-repeat|reading|speaking)$/.exec(normalized);
  if (simpleMatch) {
    const [, role] = simpleMatch;
    return {
      activityNumber: null,
      role,
      letter: letterMap[role] || '',
    };
  }
  return null;
};

const fetchJson = async (path) => {
  const response = await fetch(path);
  if (!response.ok) {
    throw new Error(`Failed to load ${path}`);
  }
  return response.json();
};

const renderLessonMeta = (meta) => {
  const parts = [
    meta?.section ? meta.section : null,
    meta?.level ? `${meta.level} level` : null,
  ].filter(Boolean);

  const joinedMeta = parts.length ? parts.join(' &middot; ') : '';

  lessonMetaEl.innerHTML = `
    <h1 class="lesson-title">Lesson ${meta?.lesson_no ?? ''}</h1>
    ${meta?.focus ? `<p class="lesson-focus">${meta.focus}</p>` : ''}
    ${joinedMeta ? `<p class="lesson-meta">${joinedMeta}</p>` : ''}
    ${meta?.prepared_by ? `<p class="lesson-author">Prepared by ${meta.prepared_by}</p>` : ''}
  `;
};

const extractActivityNumber = (activityKey) => {
  const match = /activity_(\d+)/i.exec(activityKey ?? '');
  if (!match) {
    return null;
  }
  const numericValue = Number.parseInt(match[1], 10);
  return Number.isNaN(numericValue) ? match[1] : String(numericValue);
};

const createUnsupportedActivitySlide = (
  activityKey,
  activityType,
  activityNumber,
  activityFocus,
  activityInstructions,
) => {
  const headingPrefix = activityNumber ? `Activity ${activityNumber}` : 'Activity';
  const heading = activityType ? `${headingPrefix} (${activityType})` : headingPrefix;
  const slide = document.createElement('section');
  slide.className = 'slide slide--unsupported';
  slide.innerHTML = `
    <h2>${heading} Not Available</h2>
    <p class="slide__instruction">This activity type is not supported yet. Please check back soon.</p>
  `;

  const focusEl = createFocusElement(activityFocus);
  if (focusEl && slide.firstElementChild) {
    slide.firstElementChild.insertAdjacentElement('afterend', focusEl);
  }

  const instructionsEl = createInstructionsElement(activityInstructions, { allowObject: true });
  if (instructionsEl) {
    const anchor = focusEl ?? slide.querySelector('h2');
    anchor?.insertAdjacentElement('afterend', instructionsEl);
  }

  return {
    id: `${activityKey}-unsupported`,
    element: slide,
    onLeave: () => {},
  };
};

const collectActivityEntries = (lessonData = {}) =>
  Object.entries(lessonData)
    .filter(([key, value]) => key.startsWith('activity_') && value && typeof value === 'object')
    .map(([key, value]) => {
      const rawType = typeof value.type === 'string' ? value.type.trim() : '';
      const focus =
        typeof value.focus === 'string' && value.focus.trim().length ? value.focus.trim() : '';
      const instructions = value.instructions ?? null;
      return {
        key,
        type: rawType,
        normalizedType: rawType.toUpperCase(),
        data: value,
        focus,
        instructions,
      };
    })
    .sort((a, b) => a.key.localeCompare(b.key, undefined, { numeric: true }));

let slides = [];
let currentSlideIndex = 0;
let navigationAttached = false;

const showSlide = (nextIndex) => {
  if (!slides.length) {
    return;
  }

  nextIndex = Math.max(0, Math.min(slides.length - 1, nextIndex));
  if (nextIndex === currentSlideIndex && slides[nextIndex].element.classList.contains('is-active')) {
    return;
  }

  const currentSlide = slides[currentSlideIndex];
  if (currentSlide) {
    currentSlide.element.classList.remove('is-active');
    currentSlide.onLeave?.();
  }

  currentSlideIndex = nextIndex;
  const nextSlide = slides[currentSlideIndex];
  nextSlide.element.classList.add('is-active');
  nextSlide.onEnter?.();
  nextSlide.element.scrollTop = 0;
  nextSlide.element.querySelectorAll('.dialogue-grid').forEach((grid) => {
    if (typeof grid.scrollTo === 'function') {
      grid.scrollTo({ top: 0, behavior: 'auto' });
      return;
    }
    grid.scrollTop = 0;
  });
  window.scrollTo({ top: 0, behavior: 'smooth' });

  progressIndicator.textContent = `Slide ${currentSlideIndex + 1} of ${slides.length}`;
  prevBtn.disabled = currentSlideIndex === 0;
  nextBtn.disabled = currentSlideIndex === slides.length - 1;
};

const attachNavigation = () => {
  if (navigationAttached) {
    return;
  }

  prevBtn.addEventListener('click', () => showSlide(currentSlideIndex - 1));
  nextBtn.addEventListener('click', () => showSlide(currentSlideIndex + 1));

  document.addEventListener('keydown', (event) => {
    if (event.key === 'ArrowRight') {
      showSlide(currentSlideIndex + 1);
    }
    if (event.key === 'ArrowLeft') {
      showSlide(currentSlideIndex - 1);
    }
  });

  navigationAttached = true;
};

const buildLessonSlides = (lessonData) => {
  slidesContainer.innerHTML = '';

  const activityEntries = collectActivityEntries(lessonData);
  if (!activityEntries.length) {
    slidesContainer.innerHTML = '<p class="empty-state">No activities defined for this lesson yet.</p>';
    return [];
  }

  const lessonSlides = [];

  activityEntries.forEach(({ key, type, normalizedType, data, focus, instructions }) => {
    const activityNumber = extractActivityNumber(key);
    const context = {
      key,
      type,
      normalizedType,
      activityNumber,
      focus,
      instructions,
    };
    const { resolve: resolveInstructions, isGeneral: instructionsAreGeneral } = createInstructionResolver(
      instructions,
      activityNumber,
    );
    const handler = activityBuilders[normalizedType];
    const producedSlides = handler ? handler(data, context) : null;
    const slideObjects = (Array.isArray(producedSlides) ? producedSlides : []).filter(
      (item) => item && item.element instanceof HTMLElement,
    );

    const finalSlides = slideObjects.length
      ? slideObjects
      : [
          createUnsupportedActivitySlide(
            key,
            type || normalizedType,
            activityNumber,
            focus,
            instructions,
          ),
        ];

    finalSlides.forEach((slideObj, index) => {
      slideObj.element.dataset.activityKey = key;
      slideObj.element.dataset.activityType = normalizedType || 'UNKNOWN';
      slideObj.element.dataset.activitySlideIndex = String(index);
      if (activityNumber) {
        slideObj.element.dataset.activityNumber = activityNumber;
      }
      if (focus) {
        slideObj.element.dataset.activityFocus = focus;
      }
      if (instructions !== undefined) {
        try {
          slideObj.element.dataset.activityInstructions = JSON.stringify(instructions);
        } catch {
          // ignore serialization errors
        }
      }
      if (slideObj.id && !slideObj.element.id) {
        slideObj.element.id = slideObj.id;
      }
      if (focus && index === 0) {
        if (!slideObj.element.querySelector('.activity-focus')) {
          const fallbackFocusEl = createFocusElement(focus);
          if (fallbackFocusEl) {
            const heading = slideObj.element.querySelector('h2');
            heading?.insertAdjacentElement('afterend', fallbackFocusEl);
          }
        }
      }
      const slideRoleInfo = parseActivitySlideId(slideObj.id ?? slideObj.element.id ?? '');
      const resolvedInstructions = resolveInstructions({
        role: slideRoleInfo?.role,
        letter: slideRoleInfo?.letter,
      });
      const shouldInsertInstructions =
        resolvedInstructions.length && (!instructionsAreGeneral || index === 0);
      if (shouldInsertInstructions) {
        applyInstructionsToSlide(slideObj.element, resolvedInstructions);
      }
      lessonSlides.push(slideObj);
      slidesContainer.appendChild(slideObj.element);
    });
  });

  if (!lessonSlides.length) {
    slidesContainer.innerHTML = '<p class="empty-state">No compatible activities available yet.</p>';
  }

  return lessonSlides;
};

const init = async () => {
  try {
    const data = await fetchJson('content.json');
    renderLessonMeta(data.meta ?? {});

    slides = buildLessonSlides(data);
    currentSlideIndex = 0;
    attachNavigation();

    if (slides.length) {
      showSlide(0);
    } else {
      progressIndicator.textContent = 'No activities available yet.';
      prevBtn.disabled = true;
      nextBtn.disabled = true;
    }
  } catch (error) {
    console.error(error);
    slides = [];
    currentSlideIndex = 0;
    slidesContainer.innerHTML = `<p class="error">Unable to load the lesson content. Please try reloading.</p>`;
    progressIndicator.textContent = '';
    prevBtn.disabled = true;
    nextBtn.disabled = true;
  }
};

init();



