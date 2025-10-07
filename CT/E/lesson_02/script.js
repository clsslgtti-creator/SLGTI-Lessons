
const slidesContainer = document.getElementById('slides');
const progressIndicator = document.getElementById('progressIndicator');
const prevBtn = document.getElementById('prevSlide');
const nextBtn = document.getElementById('nextSlide');
const lessonMetaEl = document.getElementById('lessonMeta');

const smoothScrollIntoView = (element) => {
  if (!element) {
    return;
  }
  element.scrollIntoView({ behavior: 'smooth', block: 'center' });
};

const audioManager = (() => {
  const cache = new Map();
  const active = new Set();

  const ensureEntry = (url) => {
    if (!url) {
      return null;
    }

    if (!cache.has(url)) {
      const audioEl = new Audio(url);
      audioEl.preload = 'auto';

      const metaPromise = new Promise((resolve) => {
        const resolveWithDuration = () => {
          cleanup();
          resolve(Number.isFinite(audioEl.duration) ? audioEl.duration : 0);
        };

        const resolveWithZero = () => {
          cleanup();
          resolve(0);
        };

        const cleanup = () => {
          audioEl.removeEventListener('loadedmetadata', resolveWithDuration);
          audioEl.removeEventListener('error', resolveWithZero);
        };

        audioEl.addEventListener('loadedmetadata', resolveWithDuration);
        audioEl.addEventListener('error', resolveWithZero);
      });

      cache.set(url, { audio: audioEl, metaPromise });
      audioEl.load();
    }

    return cache.get(url);
  };

  const play = (url, { signal } = {}) => {
    const entry = ensureEntry(url);
    if (!entry) {
      return Promise.resolve();
    }

    const { audio, metaPromise } = entry;
    audio.currentTime = 0;

    const playPromise = new Promise((resolve, reject) => {
      const handleEnded = () => {
        cleanup();
        resolve();
      };

      const handleError = () => {
        cleanup();
        reject(new Error(`Unable to play audio: ${url}`));
      };

      const handleAbort = () => {
        cleanup();
        audio.pause();
        audio.currentTime = 0;
        resolve();
      };

      const cleanup = () => {
        audio.removeEventListener('ended', handleEnded);
        audio.removeEventListener('error', handleError);
        if (signal) {
          signal.removeEventListener('abort', handleAbort);
        }
        active.delete(audio);
      };

      if (signal) {
        if (signal.aborted) {
          handleAbort();
          return;
        }
        signal.addEventListener('abort', handleAbort, { once: true });
      }

      active.add(audio);

      audio.addEventListener('ended', handleEnded, { once: true });
      audio.addEventListener('error', handleError, { once: true });

      metaPromise
        .then(() => audio.play())
        .catch(() => audio.play())
        .catch((err) => {
          cleanup();
          reject(err);
        });
    });

    return playPromise;
  };

  const stopAll = () => {
    active.forEach((audio) => {
      audio.pause();
      audio.currentTime = 0;
    });
    active.clear();
  };

  const getDuration = async (url) => {
    const entry = ensureEntry(url);
    if (!entry) {
      return 0;
    }
    try {
      const duration = await entry.metaPromise;
      return Number.isFinite(duration) ? duration : 0;
    } catch {
      return 0;
    }
  };

  return {
    play,
    stopAll,
    getDuration,
  };
})();

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

  lessonMetaEl.innerHTML = `
    <h1 class="lesson-title">Lesson ${meta?.lesson_no ?? ''}</h1>
    ${meta?.focus ? `<p class="lesson-focus">${meta.focus}</p>` : ''}
    ${parts.length ? `<p class="lesson-meta">${parts.join(' · ')}</p>` : ''}
    ${meta?.prepared_by ? `<p class="lesson-author">Prepared by ${meta.prepared_by}</p>` : ''}
  `;
};

let slides = [];
let currentSlideIndex = 0;

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
};

const createDialogueCard = (dialogue, options = {}) => {
  const { showTexts = true, showAnswer = true, classes = [] } = options;
  const wrapper = document.createElement('article');
  wrapper.className = ['dialogue-card', ...classes].join(' ');
  wrapper.dataset.dialogueId = dialogue.id;

  if (dialogue.img) {
    const img = document.createElement('img');
    img.src = dialogue.img;
    img.alt = dialogue.text_a ? `Illustration: ${dialogue.text_a}` : 'Dialogue illustration';
    img.loading = 'lazy';
    img.className = 'dialogue-card__image';
    wrapper.appendChild(img);
  }

  if (showTexts && (dialogue.text_a || dialogue.text_b)) {
    const texts = document.createElement('div');
    texts.className = 'dialogue-card__texts';

    if (dialogue.text_a) {
      const question = document.createElement('p');
      question.className = 'dialogue-card__line dialogue-card__line--question';
      question.textContent = dialogue.text_a;
      texts.appendChild(question);
    }

    if (dialogue.text_b) {
      const answer = document.createElement('p');
      answer.className = 'dialogue-card__line dialogue-card__line--answer';
      answer.textContent = dialogue.text_b;
      if (!showAnswer) {
        answer.classList.add('is-hidden');
      }
      texts.appendChild(answer);
    }

    wrapper.appendChild(texts);
  }

  return wrapper;
};

const buildModelDialogueSlide = (exampleDialogues) => {
  const slide = document.createElement('section');
  slide.className = 'slide slide--model';
  slide.innerHTML = `
    <h2>Model Dialogue</h2>
    <p class="slide__instruction">Listen to the model dialogue. Each line plays automatically in sequence.</p>
  `;

  const controls = document.createElement('div');
  controls.className = 'slide__controls';
  const playBtn = document.createElement('button');
  playBtn.className = 'primary-btn';
  playBtn.textContent = 'Play Model Dialogue';
  const status = document.createElement('p');
  status.className = 'playback-status';
  controls.append(playBtn, status);
  slide.appendChild(controls);

  const content = document.createElement('div');
  content.className = 'dialogue-grid dialogue-grid--model';
  slide.appendChild(content);

  const dialogueCards = exampleDialogues.map((dialogue, index) => {
    const card = createDialogueCard(dialogue, { showTexts: Boolean(dialogue.text_a || dialogue.text_b), classes: ['dialogue-card--model'] });
    const title = document.createElement('h3');
    title.className = 'dialogue-card__title';
    title.textContent = `Dialogue ${index + 1}`;
    card.prepend(title);
    content.appendChild(card);
    return {
      card,
      audios: [dialogue.audio_a, dialogue.audio_b].filter(Boolean),
    };
  });

  let sequenceAbort = null;

  const runSequence = async () => {
    if (!dialogueCards.length) {
      status.textContent = 'No audio available.';
      return;
    }
    sequenceAbort?.abort();
    sequenceAbort = new AbortController();
    playBtn.disabled = true;
    status.textContent = 'Playing...';

    try {
      for (const item of dialogueCards) {
        item.card.classList.add('is-active');
        smoothScrollIntoView(item.card);
        for (const url of item.audios) {
          await audioManager.play(url, { signal: sequenceAbort.signal });
          if (sequenceAbort.signal.aborted) {
            break;
          }
        }
        item.card.classList.remove('is-active');
        if (sequenceAbort.signal.aborted) {
          break;
        }
      }
      if (!sequenceAbort.signal.aborted) {
        status.textContent = 'Playback complete.';
      } else {
        status.textContent = 'Playback stopped.';
      }
    } catch (error) {
      status.textContent = 'Unable to play audio.';
      console.error(error);
    } finally {
      sequenceAbort = null;
      playBtn.disabled = false;
    }
  };

  playBtn.addEventListener('click', runSequence);

  return {
    id: 'model-dialogue',
    element: slide,
    onLeave: () => {
      sequenceAbort?.abort();
      sequenceAbort = null;
      audioManager.stopAll();
    },
  };
};

const buildListeningSlide = (dialogues) => {
  const slide = document.createElement('section');
  slide.className = 'slide slide--listening';
  slide.innerHTML = `
    <h2>Activity 1a · Listening</h2>
    <p class="slide__instruction">Listen to each dialogue from the lesson. They will play one after another.</p>
  `;

  const controls = document.createElement('div');
  controls.className = 'slide__controls';
  const playBtn = document.createElement('button');
  playBtn.className = 'primary-btn';
  playBtn.textContent = 'Play All Dialogues';
  const status = document.createElement('p');
  status.className = 'playback-status';
  controls.append(playBtn, status);
  slide.appendChild(controls);

  const list = document.createElement('div');
  list.className = 'dialogue-grid dialogue-grid--listening';
  slide.appendChild(list);

  const items = dialogues.map((dialogue, index) => {
    const card = createDialogueCard(dialogue, { classes: ['dialogue-card--listening'] });
    const heading = document.createElement('h3');
    heading.className = 'dialogue-card__title';
    heading.textContent = `Dialogue ${index + 1}`;
    card.prepend(heading);
    list.appendChild(card);
    return {
      card,
      audios: [dialogue.audio_a, dialogue.audio_b].filter(Boolean),
    };
  });

  let sequenceAbort = null;

  const runSequence = async () => {
    if (!items.length) {
      status.textContent = 'No audio available.';
      return;
    }
    sequenceAbort?.abort();
    sequenceAbort = new AbortController();
    playBtn.disabled = true;
    status.textContent = 'Playing...';

    try {
      for (const item of items) {
        item.card.classList.add('is-active');
        smoothScrollIntoView(item.card);
        for (const url of item.audios) {
          await audioManager.play(url, { signal: sequenceAbort.signal });
          if (sequenceAbort.signal.aborted) {
            break;
          }
        }
        item.card.classList.remove('is-active');
        if (sequenceAbort.signal.aborted) {
          break;
        }
      }
      if (!sequenceAbort.signal.aborted) {
        status.textContent = 'Playback complete.';
      } else {
        status.textContent = 'Playback stopped.';
      }
    } catch (error) {
      status.textContent = 'Unable to play audio.';
      console.error(error);
    } finally {
      sequenceAbort = null;
      playBtn.disabled = false;
    }
  };

  playBtn.addEventListener('click', runSequence);

  return {
    id: 'activity-1a',
    element: slide,
    onLeave: () => {
      sequenceAbort?.abort();
      sequenceAbort = null;
      audioManager.stopAll();
    },
  };
};

const buildReadingSlide = (dialogues) => {
  const slide = document.createElement('section');
  slide.className = 'slide slide--reading';
  slide.innerHTML = `
    <h2>Activity 1b · Reading</h2>
    <p class="slide__instruction">Read each dialogue. The pictures and lines appear to guide the reading.</p>
  `;

  const grid = document.createElement('div');
  grid.className = 'dialogue-grid';
  slide.appendChild(grid);

  dialogues.forEach((dialogue, index) => {
    const card = createDialogueCard(dialogue, { classes: ['dialogue-card--reading'] });
    const heading = document.createElement('h3');
    heading.className = 'dialogue-card__title';
    heading.textContent = `Dialogue ${index + 1}`;
    card.prepend(heading);
    grid.appendChild(card);
  });

  return {
    id: 'activity-1b',
    element: slide,
    onEnter: () => {
      slide.classList.add('is-animated');
    },
    onLeave: () => {
      slide.classList.remove('is-animated');
    },
  };
};

const buildSpeakingSlide = (dialogues) => {
  const slide = document.createElement('section');
  slide.className = 'slide slide--speaking';
  slide.innerHTML = `
    <h2>Activity 1c · Speaking</h2>
    <p class="slide__instruction">Listen to each question, use the pause to answer, then compare your response with the model answer.</p>
  `;

  const controls = document.createElement('div');
  controls.className = 'slide__controls';
  const startBtn = document.createElement('button');
  startBtn.className = 'primary-btn';
  startBtn.textContent = 'Start Speaking Practice';
  const status = document.createElement('p');
  status.className = 'playback-status';
  controls.append(startBtn, status);
  slide.appendChild(controls);

  const cardsWrapper = document.createElement('div');
  cardsWrapper.className = 'dialogue-grid dialogue-grid--speaking';
  slide.appendChild(cardsWrapper);

  const cards = dialogues.map((dialogue, index) => {
    const card = createDialogueCard(dialogue, {
      classes: ['dialogue-card--speaking'],
      showAnswer: false,
    });
    const heading = document.createElement('h3');
    heading.className = 'dialogue-card__title';
    heading.textContent = `Dialogue ${index + 1}`;
    card.prepend(heading);

    const prompt = document.createElement('p');
    prompt.className = 'dialogue-card__prompt';
    prompt.textContent = 'Your turn to answer...';
    card.appendChild(prompt);

    cardsWrapper.appendChild(card);

    const answerEl = card.querySelector('.dialogue-card__line--answer');

    return {
      dialogue,
      card,
      answerEl,
      prompt,
    };
  });

  let sequenceAbort = null;

  const delay = (ms, { signal } = {}) =>
    new Promise((resolve) => {
      if (signal?.aborted) {
        resolve();
        return;
      }
      const timeout = window.setTimeout(() => {
        cleanup();
        resolve();
      }, ms);

      const cleanup = () => {
        window.clearTimeout(timeout);
        if (signal) {
          signal.removeEventListener('abort', onAbort);
        }
      };

      const onAbort = () => {
        cleanup();
        resolve();
      };

      if (signal) {
        signal.addEventListener('abort', onAbort, { once: true });
      }
    });

  const resetCards = () => {
    cards.forEach(({ card, answerEl }) => {
      card.classList.remove('is-active', 'show-answer');
      if (answerEl) {
        answerEl.classList.add('is-hidden');
      }
    });
  };

  const runSpeakingPractice = async () => {
    if (!cards.length) {
      status.textContent = 'No dialogues available.';
      return;
    }

    sequenceAbort?.abort();
    sequenceAbort = new AbortController();
    const { signal } = sequenceAbort;

    resetCards();
    startBtn.disabled = true;
    status.textContent = 'Playing...';

    try {
      for (const item of cards) {
        const { dialogue, card, answerEl } = item;
        card.classList.add('is-active');
        smoothScrollIntoView(card);
        if (answerEl) {
          answerEl.classList.add('is-hidden');
        }

        await audioManager.play(dialogue.audio_a, { signal });
        if (signal.aborted) {
          break;
        }

        const answerDuration = await audioManager.getDuration(dialogue.audio_b);
        const waitMs = Math.max(1000, Math.round(answerDuration * 1500));
        await delay(waitMs, { signal });
        if (signal.aborted) {
          break;
        }

        if (answerEl) {
          answerEl.classList.remove('is-hidden');
          card.classList.add('show-answer');
        }

        await audioManager.play(dialogue.audio_b, { signal });
        if (signal.aborted) {
          break;
        }

        await delay(400, { signal });
        card.classList.remove('is-active');
      }

      if (!signal.aborted) {
        status.textContent = 'Great work! Practice complete.';
      } else {
        status.textContent = 'Practice stopped.';
      }
    } catch (error) {
      status.textContent = 'Unable to play audio.';
      console.error(error);
    } finally {
      startBtn.disabled = false;
      sequenceAbort = null;
    }
  };

  startBtn.addEventListener('click', runSpeakingPractice);

  const onLeave = () => {
    sequenceAbort?.abort();
    sequenceAbort = null;
    audioManager.stopAll();
    resetCards();
    startBtn.disabled = false;
    status.textContent = '';
  };

  return {
    id: 'activity-1c',
    element: slide,
    onLeave,
  };
};

const buildSlides = (data) => {
  const slidesList = [
    buildModelDialogueSlide(data.example_dialogues || []),
    buildListeningSlide(data.dialogues || []),
    buildReadingSlide(data.dialogues || []),
    buildSpeakingSlide(data.dialogues || []),
  ];

  slidesList.forEach((slide) => slidesContainer.appendChild(slide.element));
  return slidesList;
};

const init = async () => {
  try {
    const data = await fetchJson('content.json');
    renderLessonMeta(data.meta ?? {});
    slides = buildSlides(data);
    attachNavigation();
    showSlide(0);
  } catch (error) {
    console.error(error);
    slidesContainer.innerHTML = `<p class="error">Unable to load the lesson content. Please try reloading.</p>`;
  }
};

init();
