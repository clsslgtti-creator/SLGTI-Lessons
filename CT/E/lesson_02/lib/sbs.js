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

const renderEmphasizedText = (element, text) => {
  const normalized = typeof text === 'string' ? text : '';
  const fragment = document.createDocumentFragment();
  const pattern = /'([^']+)'/g;
  let lastIndex = 0;
  let match;

  while ((match = pattern.exec(normalized)) !== null) {
    const leading = normalized.slice(lastIndex, match.index);
    if (leading) {
      fragment.appendChild(document.createTextNode(leading));
    }

    const emphasis = document.createElement('span');
    emphasis.className = 'dialogue-text__emphasis';
    emphasis.textContent = match[1];
    fragment.appendChild(emphasis);

    lastIndex = pattern.lastIndex;
  }

  const trailing = normalized.slice(lastIndex);
  if (trailing) {
    fragment.appendChild(document.createTextNode(trailing));
  }

  element.appendChild(fragment);
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
      renderEmphasizedText(question, dialogue.text_a);
      texts.appendChild(question);
    }

    if (dialogue.text_b) {
      const answer = document.createElement('p');
      answer.className = 'dialogue-card__line dialogue-card__line--answer';
      renderEmphasizedText(answer, dialogue.text_b);
      if (!showAnswer) {
        answer.classList.add('is-hidden');
      }
      texts.appendChild(answer);
    }

    wrapper.appendChild(texts);
  }

  return wrapper;
};

const maybeInsertFocus = (slide, focusText, includeFocus) => {
  if (!includeFocus) {
    return;
  }

  const trimmed = typeof focusText === 'string' ? focusText.trim() : '';
  if (!trimmed) {
    return;
  }

  const focusEl = document.createElement('p');
  focusEl.className = 'activity-focus';
  focusEl.append(`${trimmed}`);

  const heading = slide.querySelector('h2');
  heading?.insertAdjacentElement('afterend', focusEl);
};

const buildModelDialogueSlide = (
  exampleDialogues,
  { activityLabel = 'Activity', activityNumber = null, activityFocus = '', includeFocus = false } = {},
) => {
  const slide = document.createElement('section');
  slide.className = 'slide slide--model';
  slide.innerHTML = `
    <h2>${activityLabel}</h2>
    <p class="slide__instruction">Listen to the model dialogue. Each line plays automatically in sequence.</p>
  `;

  maybeInsertFocus(slide, activityFocus, includeFocus);

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
    const card = createDialogueCard(dialogue, {
      showTexts: Boolean(dialogue.text_a || dialogue.text_b),
      classes: ['dialogue-card--model'],
    });
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
    id: activityNumber ? `activity-${activityNumber}-model` : 'activity-model',
    element: slide,
    onLeave: () => {
      sequenceAbort?.abort();
      sequenceAbort = null;
      audioManager.stopAll();
    },
  };
};

const buildListeningSlide = (
  dialogues,
  {
    activityLabel = 'Activity',
    subActivitySuffix = '',
    subActivityLetter = '',
    activityNumber = null,
    activityFocus = '',
    includeFocus = false,
  } = {},
) => {
  const slide = document.createElement('section');
  slide.className = 'slide slide--listening';
  slide.innerHTML = `
    <h2>${activityLabel}${subActivitySuffix} - Listening</h2>
    <p class="slide__instruction">Listen to each dialogue from the lesson. They will play one after another.</p>
  `;

  maybeInsertFocus(slide, activityFocus, includeFocus);

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

  const delay = (ms, { signal } = {}) =>
    new Promise((resolve) => {
      if (signal?.aborted) {
        resolve();
        return;
      }

      const timeoutId = window.setTimeout(() => {
        cleanup();
        resolve();
      }, Math.max(0, ms));

      const cleanup = () => {
        window.clearTimeout(timeoutId);
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

          await delay(2000, { signal: sequenceAbort.signal });
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

  const suffixSegment = subActivityLetter ? `-${subActivityLetter}` : '';

  return {
    id: activityNumber ? `activity-${activityNumber}${suffixSegment}-listening` : 'activity-listening',
    element: slide,
    onLeave: () => {
      sequenceAbort?.abort();
      sequenceAbort = null;
      audioManager.stopAll();
      items.forEach((item) => item.card.classList.remove('is-active'));
      status.textContent = '';
    },
  };
};

const buildListenAndRepeatSlide = (
  dialogues,
  {
    activityLabel = 'Activity',
    subActivitySuffix = '',
    subActivityLetter = '',
    activityNumber = null,
    repeatPauseMs = 1500,
  } = {},
) => {
  const slide = document.createElement('section');
  slide.className = 'slide slide--listen-repeat';
  slide.innerHTML = `
    <h2>${activityLabel}${subActivitySuffix} - Listen &amp; Repeat</h2>
    <p class="slide__instruction">Listen to each sentence and use the pause to repeat it aloud.</p>
  `;

  const controls = document.createElement('div');
  controls.className = 'slide__controls';
  const startBtn = document.createElement('button');
  startBtn.className = 'primary-btn';
  startBtn.textContent = 'Start Listen & Repeat';
  const status = document.createElement('p');
  status.className = 'playback-status';
  controls.append(startBtn, status);
  slide.appendChild(controls);

  const list = document.createElement('div');
  list.className = 'dialogue-grid dialogue-grid--listen-repeat';
  slide.appendChild(list);

  const items = dialogues.map((dialogue, index) => {
    const card = createDialogueCard(dialogue, { classes: ['dialogue-card--listen-repeat'] });
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
  const basePauseMs = Number.isFinite(repeatPauseMs) ? Math.max(500, repeatPauseMs) : 1500;

  const delay = (ms, { signal } = {}) =>
    new Promise((resolve) => {
      if (signal?.aborted) {
        resolve();
        return;
      }

      const timeoutId = window.setTimeout(() => {
        cleanup();
        resolve();
      }, Math.max(0, ms));

      const cleanup = () => {
        window.clearTimeout(timeoutId);
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
    items.forEach(({ card }) => {
      card.classList.remove('is-active');
    });
  };

  const runSequence = async () => {
    if (!items.length) {
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
      for (const item of items) {
        item.card.classList.add('is-active');
        smoothScrollIntoView(item.card);

        for (const url of item.audios) {
          await audioManager.play(url, { signal });
          if (signal.aborted) {
            break;
          }

          const duration = await audioManager.getDuration(url);
          const pauseMs = Math.max(basePauseMs, Math.round(duration * 1000));
          await delay(pauseMs, { signal });
          if (signal.aborted) {
            break;
          }
        }

        item.card.classList.remove('is-active');

        if (signal.aborted) {
          break;
        }
      }

      status.textContent = sequenceAbort.signal.aborted
        ? 'Playback stopped.'
        : 'Great work! Listen & repeat complete.';
    } catch (error) {
      status.textContent = 'Unable to play audio.';
      console.error(error);
    } finally {
      startBtn.disabled = false;
      sequenceAbort = null;
    }
  };

  startBtn.addEventListener('click', runSequence);

  const onLeave = () => {
    sequenceAbort?.abort();
    sequenceAbort = null;
    audioManager.stopAll();
    resetCards();
    startBtn.disabled = false;
    status.textContent = '';
  };

  const suffixSegment = subActivityLetter ? `-${subActivityLetter}` : '';

  return {
    id: activityNumber
      ? `activity-${activityNumber}${suffixSegment}-listen-repeat`
      : 'activity-listen-repeat',
    element: slide,
    onLeave,
  };
};

const buildReadingSlide = (
  dialogues,
  {
    activityLabel = 'Activity',
    subActivitySuffix = '',
    subActivityLetter = '',
    activityNumber = null,
    activityFocus = '',
    includeFocus = false,
  } = {},
) => {
  const slide = document.createElement('section');
  slide.className = 'slide slide--reading';
  slide.innerHTML = `
    <h2>${activityLabel}${subActivitySuffix} - Reading</h2>
    <p class="slide__instruction">Read along with the audio. Each dialogue plays automatically.</p>
  `;

  maybeInsertFocus(slide, activityFocus, includeFocus);

  const controls = document.createElement('div');
  controls.className = 'slide__controls';
  const playBtn = document.createElement('button');
  playBtn.className = 'primary-btn';
  playBtn.textContent = 'Play Read Along';
  const status = document.createElement('p');
  status.className = 'playback-status';
  controls.append(playBtn, status);
  slide.appendChild(controls);

  const grid = document.createElement('div');
  grid.className = 'dialogue-grid';
  slide.appendChild(grid);

  const items = dialogues.map((dialogue, index) => {
    const card = createDialogueCard(dialogue, { classes: ['dialogue-card--reading'] });
    const heading = document.createElement('h3');
    heading.className = 'dialogue-card__title';
    heading.textContent = `Dialogue ${index + 1}`;
    card.prepend(heading);
    grid.appendChild(card);
    return {
      card,
      audios: [dialogue.audio_a, dialogue.audio_b].filter(Boolean),
    };
  });

  let sequenceAbort = null;

  const delay = (ms, { signal } = {}) =>
    new Promise((resolve) => {
      if (signal?.aborted) {
        resolve();
        return;
      }

      const timeoutId = window.setTimeout(() => {
        cleanup();
        resolve();
      }, Math.max(0, ms));

      const cleanup = () => {
        window.clearTimeout(timeoutId);
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

  const runSequence = async () => {
    if (!items.length) {
      status.textContent = 'No audio available.';
      return;
    }

    sequenceAbort?.abort();
    sequenceAbort = new AbortController();
    const { signal } = sequenceAbort;

    playBtn.disabled = true;
    status.textContent = 'Playing...';

    try {
      for (const item of items) {
        item.card.classList.add('is-active');
        smoothScrollIntoView(item.card);

        for (const url of item.audios) {
          await audioManager.play(url, { signal });
          if (signal.aborted) {
            break;
          }
        }

        if (signal.aborted) {
          item.card.classList.remove('is-active');
          break;
        }

        await delay(3000, { signal });
        if (signal.aborted) {
          item.card.classList.remove('is-active');
          break;
        }

        item.card.classList.remove('is-active');

        if (signal.aborted) {
          break;
        }
      }

      status.textContent = signal.aborted ? 'Playback stopped.' : 'Great work! Reading complete.';
    } catch (error) {
      status.textContent = 'Unable to play audio.';
      console.error(error);
    } finally {
      playBtn.disabled = false;
      sequenceAbort = null;
    }
  };

  playBtn.addEventListener('click', runSequence);

  const suffixSegment = subActivityLetter ? `-${subActivityLetter}` : '';

  return {
    id: activityNumber ? `activity-${activityNumber}${suffixSegment}-reading` : 'activity-reading',
    element: slide,
    onEnter: () => {
      slide.classList.add('is-animated');
    },
    onLeave: () => {
      sequenceAbort?.abort();
      sequenceAbort = null;
      audioManager.stopAll();
      slide.classList.remove('is-animated');
      items.forEach(({ card }) => card.classList.remove('is-active'));
      playBtn.disabled = false;
      status.textContent = '';
    },
  };
};

const buildSpeakingSlide = (
  dialogues,
  {
    activityLabel = 'Activity',
    subActivitySuffix = '',
    subActivityLetter = '',
    activityNumber = null,
    activityFocus = '',
    includeFocus = false,
  } = {},
) => {
  const slide = document.createElement('section');
  slide.className = 'slide slide--speaking';
  slide.innerHTML = `
    <h2>${activityLabel}${subActivitySuffix} - Speaking</h2>
    <p class="slide__instruction">Listen to each question, use the pause to answer, then compare your response with the model answer.</p>
  `;

  maybeInsertFocus(slide, activityFocus, includeFocus);

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

      const timeoutId = window.setTimeout(() => {
        cleanup();
        resolve();
      }, Math.max(0, ms));

      const cleanup = () => {
        window.clearTimeout(timeoutId);
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

  const suffixSegment = subActivityLetter ? `-${subActivityLetter}` : '';

  return {
    id: activityNumber ? `activity-${activityNumber}${suffixSegment}-speaking` : 'activity-speaking',
    element: slide,
    onLeave,
  };
};

const createSubActivityContext = (base, letter) => ({
  activityLabel: base.activityLabel,
  activityNumber: base.activityNumber,
  activityFocus: base.activityFocus,
  includeFocus: false,
  subActivitySuffix: letter ? letter : '',
  subActivityLetter: letter || '',
});

export const buildSbsSlides = (activityData = {}, context = {}) => {
  const { activityNumber, focus: rawFocus } = context;
  const activityLabel = activityNumber ? `Activity ${activityNumber}` : 'Activity';
  const activityFocus =
    typeof rawFocus === 'string' && rawFocus.trim().length ? rawFocus.trim() : '';

  const baseContext = { activityLabel, activityNumber, activityFocus };

  const modelContext = {
    ...baseContext,
    includeFocus: Boolean(activityFocus),
  };

  const listeningContext = createSubActivityContext(baseContext, 'a');

  const parsePauseValue = (value) => {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  };

  const configuredPause =
    parsePauseValue(activityData.listen_repeat_pause_ms) ?? parsePauseValue(activityData.repeat_pause_ms);

  const listenRepeatContext = {
    ...createSubActivityContext(baseContext, 'b'),
    repeatPauseMs: configuredPause !== null ? Math.max(500, configuredPause) : 1500,
  };
  const readingContext = createSubActivityContext(baseContext, 'c');
  const speakingContext = createSubActivityContext(baseContext, 'd');

  const dialogues = Array.isArray(activityData.dialogues) ? activityData.dialogues : [];
  const exampleDialogues = Array.isArray(activityData.example_dialogues)
    ? activityData.example_dialogues
    : [];

  return [
    buildModelDialogueSlide(exampleDialogues, modelContext),
    buildListeningSlide(dialogues, listeningContext),
    buildListenAndRepeatSlide(dialogues, listenRepeatContext),
    buildReadingSlide(dialogues, readingContext),
    buildSpeakingSlide(dialogues, speakingContext),
  ];
};

