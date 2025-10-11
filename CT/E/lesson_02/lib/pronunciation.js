const clamp = (value, min, max) => Math.min(Math.max(value, min), max);

const DEFAULT_REPEAT_PAUSE = 2000;
const LISTENING_GAP_MS = 600;
const READ_GAP_MS = 800;

const smoothScrollIntoView = (element) => {
  if (!element) {
    return;
  }
  element.scrollIntoView({ behavior: "smooth", block: "center" });
};

const maybeInsertFocus = (slide, focusText, includeFocus) => {
  if (!includeFocus) {
    return;
  }

  const trimmed = typeof focusText === "string" ? focusText.trim() : "";
  if (!trimmed) {
    return;
  }

  const focusEl = document.createElement('p');
  focusEl.className = 'activity-focus';
  focusEl.append(`${trimmed}`);

  const heading = slide.querySelector('h2');
  heading?.insertAdjacentElement('afterend', focusEl);
};

const createStatus = () => {
  const status = document.createElement("p");
  status.className = "playback-status";
  status.textContent = "";
  return status;
};

const waitMs = (duration, { signal } = {}) =>
  new Promise((resolve) => {
    if (!Number.isFinite(duration) || duration <= 0) {
      resolve();
      return;
    }

    let timeoutId = null;

    const clear = () => {
      if (timeoutId !== null) {
        window.clearTimeout(timeoutId);
        timeoutId = null;
      }
      signal?.removeEventListener("abort", cancel);
    };

    const cancel = () => {
      clear();
      resolve();
    };

    if (signal?.aborted) {
      cancel();
      return;
    }

    signal?.addEventListener("abort", cancel, { once: true });
    timeoutId = window.setTimeout(() => {
      clear();
      resolve();
    }, duration);
  });

const playAudioOnce = (url, { signal } = {}) =>
  new Promise((resolve, reject) => {
    if (!url) {
      resolve();
      return;
    }

    const audio = new Audio(url);
    audio.preload = "auto";
    audio.currentTime = 0;

    const cleanup = () => {
      audio.removeEventListener("ended", handleEnded);
      audio.removeEventListener("error", handleError);
      if (signal) {
        signal.removeEventListener("abort", handleAbort);
      }
    };

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
      resolve();
    };

    if (signal) {
      if (signal.aborted) {
        handleAbort();
        return;
      }
      signal.addEventListener("abort", handleAbort, { once: true });
    }

    audio.addEventListener("ended", handleEnded, { once: true });
    audio.addEventListener("error", handleError, { once: true });

    audio.play().catch((error) => {
      cleanup();
      reject(error);
    });
  });

const highlightItem = (item, active) => {
  if (!item) {
    return;
  }
  const isActive = Boolean(active);
  item.card.classList.toggle("is-active", isActive);
  item.line.classList.toggle("is-playing", isActive);
};

const escapeHtml = (text) => {
  if (typeof text !== "string") {
    return "";
  }
  return text.replace(/[&<>"]/g, (char) => {
    switch (char) {
      case "&":
        return "&amp;";
      case "<":
        return "&lt;";
      case ">":
        return "&gt;";
      case '"':
        return "&quot;";
      default:
        return char;
    }
  });
};

const formatPronunciationText = (text) => {
  const escaped = escapeHtml(text);
  return escaped.replace(
    /'([^']+)'/g,
    (_, focus) => `<span class="pronunciation-focus">${focus}</span>`
  );
};

const createLayout = (imageUrl) => {
  const layout = document.createElement("div");
  layout.className = "pronunciation-layout";

  const visual = document.createElement("div");
  visual.className = "pronunciation-visual";

  if (typeof imageUrl === "string" && imageUrl.trim().length) {
    const img = document.createElement("img");
    img.src = imageUrl;
    img.alt = "";
    img.loading = "lazy";
    visual.appendChild(img);
  } else {
    const placeholder = document.createElement("div");
    placeholder.className = "pronunciation-visual__placeholder";
    placeholder.textContent = "Image coming soon.";
    visual.appendChild(placeholder);
  }

  const content = document.createElement("div");
  content.className = "pronunciation-content";

  layout.append(visual, content);

  return { layout, content };
};

const getPauseDuration = (activityData) => {
  const pauseValue = Number(
    activityData?.repeat_pause_ms ?? activityData?.listen_repeat_pause_ms
  );
  if (!Number.isFinite(pauseValue)) {
    return DEFAULT_REPEAT_PAUSE;
  }
  return clamp(pauseValue, 800, 4000);
};

const createPronunciationSlide = ({
  entries,
  activityLabel,
  activityNumber,
  activityFocus,
  includeFocus,
  imageUrl,
  role,
  letter,
  titleSuffix,
  type,
  mode,
  repeatPauseMs,
} = {}) => {
  const slideRoleClass =
    mode === "listen"
      ? "slide--listening"
      : mode === "listen-repeat"
      ? "slide--listen-repeat"
      : "slide--reading";

  const cardRoleClass =
    mode === "listen"
      ? "dialogue-card--listening"
      : mode === "listen-repeat"
      ? "dialogue-card--listen-repeat"
      : "dialogue-card--reading";

  const slide = document.createElement("section");
  slide.className = `slide ${slideRoleClass}`;
  slide.innerHTML = `<h2>${activityLabel}${titleSuffix}</h2>`;

  if (mode === "read") {
    slide.classList.add("is-animated");
  }

  maybeInsertFocus(slide, activityFocus, includeFocus);

  const description = document.createElement("p");
  description.className = "slide__instruction";
  const subjectLabel = type === "sentence" ? "the sentences" : "the words";
  description.textContent =
    mode === "listen"
      ? `Press Play to listen to ${subjectLabel}.`
      : mode === "listen-repeat"
      ? `Press Play to listen, then use the pause to repeat ${subjectLabel}.`
      : `Press Play and read along with ${subjectLabel}.`;
  slide.appendChild(description);

  const controls = document.createElement("div");
  controls.className = "slide__controls";
  const playBtn = document.createElement("button");
  playBtn.type = "button";
  playBtn.className = "primary-btn";
  const buttonLabelSubject = type === "sentence" ? "Sentences" : "Words";
  playBtn.textContent =
    mode === "listen"
      ? `Play ${buttonLabelSubject}`
      : mode === "listen-repeat"
      ? `Play & Repeat ${buttonLabelSubject}`
      : `Play & Read ${buttonLabelSubject}`;
  controls.appendChild(playBtn);

  const status = createStatus();
  controls.appendChild(status);
  slide.appendChild(controls);

  const { layout, content } = createLayout(imageUrl);
  slide.appendChild(layout);

  const list = document.createElement("div");
  list.className = "dialogue-grid dialogue-grid--pronunciation";
  content.appendChild(list);

  const items = [];
  const textKey = type === "sentence" ? "sentence_text" : "word_text";
  const audioKey = type === "sentence" ? "sentence_audio" : "word_audio";

  (Array.isArray(entries) ? entries : []).forEach((entry, index) => {
    const rawText = typeof entry?.[textKey] === "string" ? entry[textKey] : "";
    const audioUrl =
      typeof entry?.[audioKey] === "string" ? entry[audioKey].trim() : "";

    if (!rawText || !audioUrl) {
      return;
    }

    const card = document.createElement("article");
    card.className = `dialogue-card ${cardRoleClass} dialogue-card--pronunciation`;
    card.dataset.entryIndex = String(index);

    const textsWrapper = document.createElement("div");
    textsWrapper.className = "dialogue-card__texts";

    const line = document.createElement("p");
    line.className = "dialogue-card__line";
    line.innerHTML = formatPronunciationText(rawText);

    textsWrapper.appendChild(line);
    card.appendChild(textsWrapper);
    list.appendChild(card);

    items.push({
      card,
      line,
      audioUrl,
    });
  });

  if (!items.length) {
    const emptyState = document.createElement("p");
    emptyState.className = "empty-state";
    emptyState.textContent = "Audio will be added soon.";
    content.appendChild(emptyState);
  }

  let abortController = null;
  let activeItem = null;

  const resetActiveItem = () => {
    highlightItem(activeItem, false);
    activeItem = null;
  };

  const playEntry = async (item, { signal }) => {
    if (!item) {
      return;
    }

    smoothScrollIntoView(item.card);

    resetActiveItem();
    activeItem = item;
    highlightItem(item, true);
    status.textContent = "Playing...";

    try {
      await playAudioOnce(item.audioUrl, { signal });
      if (signal?.aborted) {
        return;
      }

      if (mode === "listen-repeat") {
        status.textContent = "Your turn...";
        await waitMs(repeatPauseMs, { signal });
      } else if (mode === "listen") {
        await waitMs(LISTENING_GAP_MS, { signal });
      } else if (mode === "read") {
        await waitMs(READ_GAP_MS, { signal });
      }
    } finally {
      if (!signal?.aborted) {
        highlightItem(item, false);
        if (activeItem === item) {
          activeItem = null;
        }
      }
    }
  };

  const runSequence = async () => {
    if (!items.length) {
      status.textContent = "No audio available.";
      return;
    }

    abortController?.abort();
    abortController = new AbortController();
    const { signal } = abortController;
    slide._autoTriggered = true;

    playBtn.disabled = true;
    status.textContent = "Starting...";

    try {
      for (const item of items) {
        await playEntry(item, { signal });
        if (signal.aborted) {
          break;
        }
      }

      if (!signal.aborted) {
        status.textContent = "Playback complete.";
      } else {
        status.textContent = "Playback stopped.";
      }
    } catch (error) {
      console.error(error);
      status.textContent = "Unable to play audio.";
    } finally {
      playBtn.disabled = false;
      abortController = null;
      resetActiveItem();
    }
  };

  playBtn.addEventListener("click", () => {
    runSequence();
  });

  const autoPlay = {
    button: playBtn,
    trigger: () => {
      if (slide._autoTriggered) {
        return;
      }
      runSequence();
    },
    status,
  };

  const id =
    activityNumber && letter
      ? `activity-${activityNumber}-${letter}-${role}`
      : activityNumber
      ? `activity-${activityNumber}-${role}`
      : `activity-${role}`;

  const onLeave = () => {
    abortController?.abort();
    abortController = null;
    resetActiveItem();
    status.textContent = "";
    playBtn.disabled = false;
    slide._autoTriggered = false;
    slide._instructionComplete = false;
  };

  return {
    id,
    element: slide,
    autoPlay,
    onLeave,
  };
};

export const buildPronunciationSlides = (activityData = {}, context = {}) => {
  const { activityNumber, focus: rawFocus } = context;
  const activityLabel = activityNumber
    ? `Activity ${activityNumber}`
    : "Activity";
  const activityFocus = typeof rawFocus === "string" ? rawFocus.trim() : "";
  const includeFocus = Boolean(activityFocus);
  const entries = Array.isArray(activityData?.content)
    ? activityData.content
    : [];
  const imageUrl =
    typeof activityData?.image === "string" ? activityData.image : "";
  const repeatPauseMs = getPauseDuration(activityData);

  const slides = [
    {
      role: "words-listen",
      letter: "a",
      titleSuffix: "a - Listening",
      type: "word",
      mode: "listen",
    },
    {
      role: "words-repeat",
      letter: "b",
      titleSuffix: "b - Listen & Repeat",
      type: "word",
      mode: "listen-repeat",
    },
    {
      role: "words-read",
      letter: "c",
      titleSuffix: "c - Read Along",
      type: "word",
      mode: "read",
    },
    {
      role: "sentences-listen",
      letter: "d",
      titleSuffix: "d - Listen",
      type: "sentence",
      mode: "listen",
    },
    {
      role: "sentences-repeat",
      letter: "e",
      titleSuffix: "e - Listen & Repeat",
      type: "sentence",
      mode: "listen-repeat",
    },
    {
      role: "sentences-read",
      letter: "f",
      titleSuffix: "f - Read Along",
      type: "sentence",
      mode: "read",
    },
  ];

  return slides.map((config) =>
    createPronunciationSlide({
      entries,
      activityLabel,
      activityNumber,
      activityFocus,
      includeFocus,
      imageUrl,
      repeatPauseMs,
      ...config,
    })
  );
};
