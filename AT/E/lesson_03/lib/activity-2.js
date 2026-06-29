import { audioManager, computeSegmentGapMs } from "./audio-manager.js";
import { showCompletionModal } from "./completion-modal.js";
import {
  createMatchingGameScene,
  normalizeMatchingPairs,
  DEFAULT_FEEDBACK_ASSETS as MATCHING_FEEDBACK_ASSETS,
} from "./games/game-4.js";

const smoothScrollIntoView = (element) => {
  if (!element) {
    return;
  }
  element.scrollIntoView({ behavior: "smooth", block: "center" });
};

const getPhaser = () => window?.Phaser ?? globalThis?.Phaser ?? null;

let phaserLoadPromise = null;

const ensurePhaser = async () => {
  const existing = getPhaser();
  if (existing) {
    return existing;
  }

  if (!phaserLoadPromise) {
    phaserLoadPromise = new Promise((resolve, reject) => {
      const scriptUrl = new URL("./phaser.min.js", import.meta.url).href;
      const currentScript = Array.from(document.scripts).find((script) =>
        script.src?.includes("/phaser.min.js")
      );

      if (currentScript) {
        const handleLoad = () => resolve(getPhaser());
        const handleError = () =>
          reject(new Error("Unable to load Phaser library."));
        currentScript.addEventListener("load", handleLoad, { once: true });
        currentScript.addEventListener("error", handleError, { once: true });
        window.setTimeout(() => {
          const PhaserLib = getPhaser();
          if (PhaserLib) {
            resolve(PhaserLib);
          }
        }, 0);
        return;
      }

      const script = document.createElement("script");
      script.src = scriptUrl;
      script.async = true;
      script.onload = () => {
        const PhaserLib = getPhaser();
        if (PhaserLib) {
          resolve(PhaserLib);
          return;
        }
        reject(new Error("Phaser library loaded but global is unavailable."));
      };
      script.onerror = () =>
        reject(new Error("Unable to load Phaser library."));
      document.head.appendChild(script);
    }).catch((error) => {
      phaserLoadPromise = null;
      throw error;
    });
  }

  return phaserLoadPromise;
};

const waitMs = (duration, { signal } = {}) =>
  new Promise((resolve) => {
    if (!Number.isFinite(duration) || duration <= 0) {
      resolve();
      return;
    }

    let timeoutId = null;

    const cleanup = () => {
      if (timeoutId !== null) {
        window.clearTimeout(timeoutId);
        timeoutId = null;
      }
      signal?.removeEventListener("abort", onAbort);
    };

    const onAbort = () => {
      cleanup();
      resolve();
    };

    if (signal?.aborted) {
      onAbort();
      return;
    }

    signal?.addEventListener("abort", onAbort, { once: true });
    timeoutId = window.setTimeout(() => {
      cleanup();
      resolve();
    }, duration);
  });

const trimString = (value) =>
  typeof value === "string" ? value.trim() : "";

const normalizeKeyword = (value) => {
  const trimmed = trimString(value);
  if (!trimmed) {
    return "";
  }
  return trimmed.toLowerCase().replace(/[^a-z0-9]+/g, "-");
};

const createStatus = () => {
  const status = document.createElement("p");
  status.className = "playback-status";
  status.textContent = "";
  return status;
};

const renderEmphasizedText = (element, text) => {
  const normalized = typeof text === "string" ? text : "";
  const fragment = document.createDocumentFragment();
  const pattern = /'([^']+)'/g;
  let lastIndex = 0;
  let match;

  while ((match = pattern.exec(normalized)) !== null) {
    const leading = normalized.slice(lastIndex, match.index);
    if (leading) {
      fragment.appendChild(document.createTextNode(leading));
    }

    const emphasis = document.createElement("span");
    emphasis.className = "dialogue-text__emphasis";
    emphasis.textContent = match[1];
    fragment.appendChild(emphasis);

    lastIndex = pattern.lastIndex;
  }

  const trailing = normalized.slice(lastIndex);
  if (trailing) {
    fragment.appendChild(document.createTextNode(trailing));
  }

  if (!fragment.childNodes.length) {
    element.textContent = normalized;
    return;
  }

  element.appendChild(fragment);
};

const maybeInsertFocus = (slide, focusText, includeFocus) => {
  if (!includeFocus) {
    return;
  }

  const trimmed = trimString(focusText);
  if (!trimmed) {
    return;
  }

  const focusEl = document.createElement("p");
  focusEl.className = "activity-focus";
  focusEl.textContent = trimmed;

  const heading = slide.querySelector("h2");
  if (heading) {
    heading.insertAdjacentElement("afterend", focusEl);
  } else {
    slide.prepend(focusEl);
  }
};

const clearSegmentHighlights = (segments = []) => {
  segments.forEach(({ element }) => {
    element?.classList.remove("is-playing");
  });
};

const TEXT_KEYS = ["text_a", "text_b", "text_c", "text_d", "text_e"];
const AUDIO_KEYS = ["audio_a", "audio_b", "audio_c", "audio_d", "audio_e"];

const normalizeSentenceSegments = (entry = {}) => {
  const segments = [];
  const seen = new Set();

  if (Array.isArray(entry.sentences)) {
    entry.sentences.forEach((item) => {
      const text = trimString(item?.text);
      const audio = trimString(item?.audio);
      const role = trimString(item?.role);
      if (!text && !audio) {
        return;
      }
      const key = `${text}__${audio}`;
      if (seen.has(key)) {
        return;
      }
      seen.add(key);
      segments.push({ text, audio, role });
    });
  }

  for (let index = 0; index < TEXT_KEYS.length; index += 1) {
    const textKey = TEXT_KEYS[index];
    const audioKey = AUDIO_KEYS[index];
    const text = trimString(entry?.[textKey]);
    const audio = trimString(entry?.[audioKey]);
    if (!text && !audio) {
      continue;
    }
    const key = `${text}__${audio}`;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    segments.push({ text, audio });
  }

  return segments;
};

const normalizeSentenceEntries = (raw = []) => {
  if (!Array.isArray(raw)) {
    return [];
  }
  return raw
    .map((entry, index) => {
      const id = trimString(entry?.id) || `activity2_item_${index + 1}`;
      const title = trimString(entry?.title);
      const prompt = trimString(entry?.prompt);
      const image = trimString(entry?.img ?? entry?.image ?? "");
      const segments = normalizeSentenceSegments(entry);
      if (!segments.length) {
        return null;
      }
      return {
        id,
        title,
        prompt,
        image: image || null,
        segments,
      };
    })
    .filter(Boolean);
};

const createSentenceCard = (entry, { title = "", classes = [] } = {}) => {
  const wrapper = document.createElement("article");
  wrapper.className = ["dialogue-card", ...classes].join(" ");
  wrapper.dataset.entryId = entry.id;

  if (entry.image) {
    const img = document.createElement("img");
    img.src = entry.image;
    img.alt = entry.title ? `Illustration: ${entry.title}` : "Activity illustration";
    img.loading = "lazy";
    img.className = "dialogue-card__image";
    wrapper.appendChild(img);
  }

  if (title) {
    const heading = document.createElement("h3");
    heading.className = "dialogue-card__title";
    heading.textContent = title;
    wrapper.appendChild(heading);
  }

  if (entry.prompt) {
    const promptEl = document.createElement("p");
    promptEl.className = "dialogue-card__prompt";
    promptEl.textContent = entry.prompt;
    wrapper.appendChild(promptEl);
  }

  const textsWrapper = document.createElement("div");
  textsWrapper.className = "dialogue-card__texts";
  wrapper.appendChild(textsWrapper);

  const lineElements = entry.segments.map((segment, index) => {
    const line = document.createElement("p");
    line.className = "dialogue-card__line";
    if (index === 0) {
      line.classList.add("dialogue-card__line--answer");
    } else {
      line.classList.add("dialogue-card__line--answer");
    }
    const displayText = segment.text || `Sentence ${index + 1}`;
    renderEmphasizedText(line, displayText);
    textsWrapper.appendChild(line);
    return line;
  });

  return {
    card: wrapper,
    lineElements,
  };
};

const buildListeningSlide = (entries = [], context = {}) => {
  const {
    activityLabel = "Activity",
    activityNumber = null,
    subActivitySuffix = "",
    subActivityLetter = "",
    activityFocus = "",
    includeFocus = false,
  } = context;

  const slide = document.createElement("section");
  slide.className = "slide slide--listening";
  slide.innerHTML = `
    <h2>${activityLabel}${subActivitySuffix}</h2>
    <p class="slide__instruction">Listen to each set of sentences in order.</p>
  `;

  maybeInsertFocus(slide, activityFocus, includeFocus);

  const controls = document.createElement("div");
  controls.className = "slide__controls";
  const startBtn = document.createElement("button");
  startBtn.className = "primary-btn";
  startBtn.textContent = "Start";
  const status = createStatus();
  controls.append(startBtn, status);
  slide.appendChild(controls);

  const grid = document.createElement("div");
  grid.className = "dialogue-grid dialogue-grid--listening";
  slide.appendChild(grid);

  const items = entries.map((entry, index) => {
    const cardTitle = entry.title || `${index + 1}.`;
    const { card, lineElements } = createSentenceCard(entry, {
      title: cardTitle,
      classes: ["dialogue-card--listening"],
    });
    grid.appendChild(card);
    return {
      card,
      segments: entry.segments
        .map((segment, segIndex) => ({
          url: segment.audio,
          element: lineElements[segIndex],
        }))
        .filter((segment) => segment.url),
    };
  });

  if (!items.length) {
    const empty = document.createElement("p");
    empty.className = "empty-state";
    empty.textContent = "Audio will be added soon.";
    slide.appendChild(empty);
  }

  let sequenceAbort = null;
  let autoTriggered = false;
  let pauseRequested = false;

  const playbackState = {
    mode: "idle",
    itemIndex: 0,
    segmentIndex: 0,
  };

  const updateButtonLabel = () => {
    if (playbackState.mode === "playing") {
      startBtn.textContent = "Pause";
      return;
    }
    if (playbackState.mode === "paused") {
      startBtn.textContent = "Resume";
      return;
    }
    startBtn.textContent = "Start";
  };

  const setPlaybackMode = (mode, { itemIndex, segmentIndex } = {}) => {
    playbackState.mode = mode;
    if (Number.isInteger(itemIndex)) {
      playbackState.itemIndex = Math.max(0, itemIndex);
    }
    if (Number.isInteger(segmentIndex)) {
      playbackState.segmentIndex = Math.max(0, segmentIndex);
    }
    updateButtonLabel();
  };

  const clearVisualState = () => {
    items.forEach(({ card, segments }) => {
      card.classList.remove("is-active");
      clearSegmentHighlights(segments);
    });
  };

  const resetState = ({ clearStatus = true } = {}) => {
    clearVisualState();
    autoTriggered = false;
    slide._autoTriggered = false;
    setPlaybackMode("idle", { itemIndex: 0, segmentIndex: 0 });
    if (clearStatus) {
      status.textContent = "";
    }
  };

  updateButtonLabel();

  const runSequence = async ({
    itemIndex = 0,
    segmentIndex = 0,
  } = {}) => {
    const hasPlayableSegments = items.some((item) => item.segments.length);
    if (!hasPlayableSegments) {
      status.textContent = "Audio will be added soon.";
      resetState({ clearStatus: false });
      return;
    }

    pauseRequested = false;
    sequenceAbort?.abort();
    sequenceAbort = new AbortController();
    const { signal } = sequenceAbort;

    audioManager.stopAll();
    clearVisualState();
    setPlaybackMode("playing", { itemIndex, segmentIndex });
    status.textContent =
      itemIndex === 0 && segmentIndex === 0 ? "Starting..." : "Resuming...";

    let completed = false;

    try {
      for (let index = itemIndex; index < items.length; index += 1) {
        playbackState.itemIndex = index;
        const item = items[index];
        if (!item.segments.length) {
          playbackState.segmentIndex = 0;
          continue;
        }

        item.card.classList.add("is-active");
        smoothScrollIntoView(item.card);

        const startingSegment = index === itemIndex ? segmentIndex : 0;
        for (
          let segIndex = startingSegment;
          segIndex < item.segments.length;
          segIndex += 1
        ) {
          playbackState.segmentIndex = segIndex;
          const { url, element } = item.segments[segIndex];
          if (!url) {
            continue;
          }

          status.textContent = "Listening...";
          element?.classList.add("is-playing");

          try {
            await audioManager.play(url, { signal });
          } catch (error) {
            if (!signal.aborted) {
              console.error(error);
              status.textContent = "Unable to play audio.";
            }
          }

          element?.classList.remove("is-playing");

          if (signal.aborted) {
            break;
          }

          playbackState.segmentIndex = segIndex + 1;

          try {
            const duration = await audioManager.getDuration(url);
            const gapMs = computeSegmentGapMs("listen", duration);
            const hasMoreSegments = segIndex < item.segments.length - 1;
            const hasMoreItems = index < items.length - 1;

            if ((hasMoreSegments || hasMoreItems) && gapMs > 0) {
              status.textContent = "Next up...";
              await waitMs(gapMs, { signal });
            }
          } catch (error) {
            console.error(error);
          }

          if (signal.aborted) {
            break;
          }
        }

        clearSegmentHighlights(item.segments);
        item.card.classList.remove("is-active");

        if (signal.aborted) {
          break;
        }

        playbackState.segmentIndex = 0;
        playbackState.itemIndex = index + 1;
      }

      if (!sequenceAbort?.signal?.aborted) {
        completed = true;
      }
    } finally {
      const aborted = sequenceAbort?.signal?.aborted ?? false;
      sequenceAbort = null;
      audioManager.stopAll();

      if (aborted && pauseRequested) {
        autoTriggered = false;
        slide._autoTriggered = false;
        setPlaybackMode("paused", {
          itemIndex: playbackState.itemIndex,
          segmentIndex: playbackState.segmentIndex,
        });
        status.textContent = "Paused.";
      } else {
        const finalStatus = completed
          ? "Playback complete."
          : "Playback stopped.";
        resetState({ clearStatus: false });
        status.textContent = finalStatus;
      }

      pauseRequested = false;
    }
  };

  const startSequence = (options = {}) => {
    autoTriggered = true;
    slide._autoTriggered = true;
    runSequence(options);
  };

  const triggerAutoPlay = () => {
    if (
      autoTriggered ||
      playbackState.mode === "playing" ||
      playbackState.mode === "paused"
    ) {
      return;
    }
    startSequence({ itemIndex: 0, segmentIndex: 0 });
  };

  startBtn.addEventListener("click", () => {
    if (playbackState.mode === "playing") {
      pauseRequested = true;
      sequenceAbort?.abort();
      return;
    }

    if (playbackState.mode === "paused") {
      startSequence({
        itemIndex: playbackState.itemIndex,
        segmentIndex: playbackState.segmentIndex,
      });
      return;
    }

    startSequence({ itemIndex: 0, segmentIndex: 0 });
  });

  const suffixSegment = subActivityLetter ? `-${subActivityLetter}` : "";

  return {
    id: activityNumber
      ? `activity-${activityNumber}${suffixSegment}-activity2-listen`
      : "activity-2-listen",
    element: slide,
    autoPlay: {
      button: startBtn,
      trigger: triggerAutoPlay,
      status,
    },
    onLeave: () => {
      sequenceAbort?.abort();
      sequenceAbort = null;
      audioManager.stopAll();
      resetState();
    },
  };
};

const buildListenRepeatSlide = (
  entries = [],
  context = {},
  { repeatPauseMs = 1500 } = {}
) => {
  const {
    activityLabel = "Activity",
    activityNumber = null,
    subActivitySuffix = "",
    subActivityLetter = "",
  } = context;

  const slide = document.createElement("section");
  slide.className = "slide slide--listen-repeat";
  slide.innerHTML = `
    <h2>${activityLabel}${subActivitySuffix}</h2>
    <p class="slide__instruction">Listen to each sentence and use the pause to repeat it aloud.</p>
  `;

  const controls = document.createElement("div");
  controls.className = "slide__controls";
  const startBtn = document.createElement("button");
  startBtn.className = "primary-btn";
  startBtn.textContent = "Start";
  const status = createStatus();
  controls.append(startBtn, status);
  slide.appendChild(controls);

  const grid = document.createElement("div");
  grid.className = "dialogue-grid dialogue-grid--listen-repeat";
  slide.appendChild(grid);

  const items = entries.map((entry, index) => {
    const cardTitle = entry.title || `${index + 1}.`;
    const { card, lineElements } = createSentenceCard(entry, {
      title: cardTitle,
      classes: ["dialogue-card--listen-repeat"],
    });
    grid.appendChild(card);
    return {
      card,
      segments: entry.segments
        .map((segment, segIndex) => ({
          url: segment.audio,
          element: lineElements[segIndex],
        }))
        .filter((segment) => segment.url),
    };
  });

  if (!items.length) {
    const empty = document.createElement("p");
    empty.className = "empty-state";
    empty.textContent = "Audio will be added soon.";
    slide.appendChild(empty);
  }

  let sequenceAbort = null;
  let autoTriggered = false;
  let pauseRequested = false;
  const basePauseMs = Number.isFinite(repeatPauseMs)
    ? Math.max(500, repeatPauseMs)
    : 1500;

  const playbackState = {
    mode: "idle",
    itemIndex: 0,
    segmentIndex: 0,
  };

  const updateButtonLabel = () => {
    if (playbackState.mode === "playing") {
      startBtn.textContent = "Pause";
      return;
    }
    if (playbackState.mode === "paused") {
      startBtn.textContent = "Resume";
      return;
    }
    startBtn.textContent = "Start";
  };

  const setPlaybackMode = (mode, { itemIndex, segmentIndex } = {}) => {
    playbackState.mode = mode;
    if (Number.isInteger(itemIndex)) {
      playbackState.itemIndex = Math.max(0, itemIndex);
    }
    if (Number.isInteger(segmentIndex)) {
      playbackState.segmentIndex = Math.max(0, segmentIndex);
    }
    updateButtonLabel();
  };

  const clearVisualState = () => {
    items.forEach(({ card, segments }) => {
      card.classList.remove("is-active");
      clearSegmentHighlights(segments);
    });
  };

  const resetState = ({ clearStatus = true } = {}) => {
    clearVisualState();
    autoTriggered = false;
    slide._autoTriggered = false;
    setPlaybackMode("idle", { itemIndex: 0, segmentIndex: 0 });
    if (clearStatus) {
      status.textContent = "";
    }
  };

  updateButtonLabel();

  const runSequence = async ({
    itemIndex = 0,
    segmentIndex = 0,
  } = {}) => {
    const hasPlayableSegments = items.some((item) => item.segments.length);
    if (!hasPlayableSegments) {
      status.textContent = "Audio will be added soon.";
      resetState({ clearStatus: false });
      return;
    }

    pauseRequested = false;
    sequenceAbort?.abort();
    sequenceAbort = new AbortController();
    const { signal } = sequenceAbort;

    audioManager.stopAll();
    clearVisualState();
    setPlaybackMode("playing", { itemIndex, segmentIndex });
    status.textContent =
      itemIndex === 0 && segmentIndex === 0 ? "Starting..." : "Resuming...";

    let completed = false;

    try {
      for (let index = itemIndex; index < items.length; index += 1) {
        playbackState.itemIndex = index;
        const item = items[index];
        if (!item.segments.length) {
          playbackState.segmentIndex = 0;
          continue;
        }

        item.card.classList.add("is-active");
        smoothScrollIntoView(item.card);

        const startingSegment = index === itemIndex ? segmentIndex : 0;
        for (
          let segIndex = startingSegment;
          segIndex < item.segments.length;
          segIndex += 1
        ) {
          playbackState.segmentIndex = segIndex;
          const { url, element } = item.segments[segIndex];
          if (!url) {
            continue;
          }

          status.textContent = "Listening...";
          element?.classList.add("is-playing");

          try {
            await audioManager.play(url, { signal });
          } catch (error) {
            if (!signal.aborted) {
              console.error(error);
              status.textContent = "Unable to play audio.";
            }
          }

          element?.classList.remove("is-playing");

          if (signal.aborted) {
            break;
          }

          playbackState.segmentIndex = segIndex + 1;

          try {
            const duration = await audioManager.getDuration(url);
            const pauseMs = computeSegmentGapMs("listen-repeat", duration, {
              repeatPauseMs: basePauseMs,
            });
            if (pauseMs > 0) {
              status.textContent = "Your turn...";
              await waitMs(pauseMs, { signal });
            }
          } catch (error) {
            console.error(error);
          }

          if (signal.aborted) {
            break;
          }
        }

        status.textContent = "Listening...";
        clearSegmentHighlights(item.segments);
        item.card.classList.remove("is-active");

        if (signal.aborted) {
          break;
        }

        playbackState.segmentIndex = 0;
        playbackState.itemIndex = index + 1;
      }

      if (!sequenceAbort?.signal?.aborted) {
        completed = true;
      }
    } finally {
      const aborted = sequenceAbort?.signal?.aborted ?? false;
      sequenceAbort = null;
      audioManager.stopAll();

      if (aborted && pauseRequested) {
        autoTriggered = false;
        slide._autoTriggered = false;
        setPlaybackMode("paused", {
          itemIndex: playbackState.itemIndex,
          segmentIndex: playbackState.segmentIndex,
        });
        status.textContent = "Paused.";
      } else {
        const finalStatus = completed
          ? "Practice complete."
          : "Practice stopped.";
        resetState({ clearStatus: false });
        status.textContent = finalStatus;
      }

      pauseRequested = false;
    }
  };

  const startSequence = (options = {}) => {
    autoTriggered = true;
    slide._autoTriggered = true;
    runSequence(options);
  };

  const triggerAutoPlay = () => {
    if (
      autoTriggered ||
      playbackState.mode === "playing" ||
      playbackState.mode === "paused"
    ) {
      return;
    }
    startSequence({ itemIndex: 0, segmentIndex: 0 });
  };

  startBtn.addEventListener("click", () => {
    if (playbackState.mode === "playing") {
      pauseRequested = true;
      sequenceAbort?.abort();
      return;
    }

    if (playbackState.mode === "paused") {
      startSequence({
        itemIndex: playbackState.itemIndex,
        segmentIndex: playbackState.segmentIndex,
      });
      return;
    }

    startSequence({ itemIndex: 0, segmentIndex: 0 });
  });

  const suffixSegment = subActivityLetter ? `-${subActivityLetter}` : "";

  return {
    id: activityNumber
      ? `activity-${activityNumber}${suffixSegment}-activity2-repeat`
      : "activity-2-repeat",
    element: slide,
    autoPlay: {
      button: startBtn,
      trigger: triggerAutoPlay,
      status,
    },
    onLeave: () => {
      sequenceAbort?.abort();
      sequenceAbort = null;
      audioManager.stopAll();
      resetState();
    },
  };
};

const normalizeMatchingItems = (raw = []) =>
  normalizeMatchingPairs(
    Array.isArray(raw)
      ? raw.map((entry, index) => ({
          id: trimString(entry?.id) || `match_${index + 1}`,
          keyword:
            trimString(entry?.keyword) ||
            trimString(entry?.label) ||
            trimString(entry?.text) ||
            `Match ${index + 1}`,
          image: trimString(entry?.img ?? entry?.image ?? ""),
        }))
      : []
  );

const buildMatchingSlide = (items = [], context = {}) => {
  const {
    activityLabel = "Activity",
    subActivitySuffix = "",
    subActivityLetter = "",
    activityNumber = null,
    activityFocus = "",
    includeFocus = false,
  } = context;

  const slide = document.createElement("section");
  slide.className = "slide game-slide";
  slide.innerHTML = `
    <h2>${activityLabel}${subActivitySuffix}</h2>
    <p class="slide__instruction">Match the times with the clocks.</p>
  `;

  maybeInsertFocus(slide, activityFocus, includeFocus);

  const wrapper = document.createElement("div");
  wrapper.className = "game1-shell game4-shell";

  const stage = document.createElement("div");
  stage.className = "game1-stage game4-stage";
  const stageId = `game4-stage-${Math.random().toString(36).slice(2, 8)}`;
  stage.id = stageId;

  const status = document.createElement("p");
  status.className = "game1-status game4-status is-visible";
  status.textContent = "Loading game...";

  wrapper.append(stage, status);
  slide.appendChild(wrapper);

  if (!items.length) {
    status.textContent = "The matching content is not ready yet.";
    return {
      id: activityNumber
        ? `activity-${activityNumber}${subActivityLetter ? `-${subActivityLetter}` : ""}-activity2-match`
        : "activity-2-match",
      element: slide,
      onEnter: () => {},
      onLeave: () => {},
    };
  }

  let gameInstance = null;

  const startGame = async () => {
    let PhaserLib = null;
    try {
      PhaserLib = await ensurePhaser();
    } catch (error) {
      console.error(error);
      status.textContent =
        "Phaser library is missing. Please reload the lesson.";
      status.classList.add("is-error");
      return;
    }

    if (gameInstance) {
      gameInstance.destroy(true);
      gameInstance = null;
      stage.innerHTML = "";
    }

    status.textContent = "Loading game...";
    status.classList.remove("is-error");
    status.classList.remove("is-transparent");
    status.classList.add("is-visible");

    const GameScene = createMatchingGameScene({
      pairs: items,
      feedbackAssets: { ...MATCHING_FEEDBACK_ASSETS },
      statusElement: status,
      onRoundUpdate: (info = {}) => {
        const completedMatches = info.completedMatches ?? 0;
        const total = info.total ?? items.length;
        if (info.completed) {
          status.textContent = `Matches complete - ${
            info.correctMatches ?? completedMatches
          }/${info.total ?? total} correct`;
          status.classList.remove("is-transparent");
        } else {
          status.textContent = `Match progress: ${completedMatches}/${total}`;
          status.classList.add("is-transparent");
        }
        status.classList.add("is-visible");
      },
    });

    gameInstance = new PhaserLib.Game({
      type: PhaserLib.AUTO,
      parent: stageId,
      backgroundColor: "#f3f6fb",
      scale: {
        mode: PhaserLib.Scale.FIT,
        autoCenter: PhaserLib.Scale.CENTER_BOTH,
        width: 1280,
        height: 720,
        fullscreenTarget: stage,
        expandParent: true,
      },
      scene: GameScene,
    });
    if (gameInstance?.scale) {
      gameInstance.scale.fullscreenTarget = stage;
    }
  };

  const destroyGame = () => {
    if (document.fullscreenElement) {
      document.exitFullscreen().catch(() => {});
    }
    if (gameInstance) {
      gameInstance.destroy(true);
      gameInstance = null;
      stage.innerHTML = "";
    }
    status.textContent = "Game paused. Reopen this slide to play again.";
    status.classList.remove("is-transparent");
    status.classList.remove("is-error");
    status.classList.add("is-visible");
  };

  const suffixSegment = subActivityLetter ? `-${subActivityLetter}` : "";

  return {
    id: activityNumber
      ? `activity-${activityNumber}${suffixSegment}-activity2-match`
      : "activity-2-match",
    element: slide,
    onEnter: startGame,
    onLeave: destroyGame,
  };
};

const createSubActivityContext = (base, letter, includeFocus = false) => ({
  activityLabel: base.activityLabel,
  activityNumber: base.activityNumber,
  activityFocus: base.activityFocus,
  includeFocus,
  subActivitySuffix: letter ? letter : "",
  subActivityLetter: letter || "",
});

const getRepeatPauseMs = (activityData, fallback = 1500) => {
  const raw =
    activityData?.listen_repeat_pause_ms ?? activityData?.repeat_pause_ms;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }
  return Math.max(500, parsed);
};

export const buildActivityTwoSlides = (activityData = {}, context = {}) => {
  const { activityNumber, focus: rawFocus } = context;
  const activityLabel = activityNumber
    ? `Activity ${activityNumber}`
    : "Activity";
  const activityFocus = trimString(rawFocus);

  const matchingItems = normalizeMatchingItems(
    activityData?.content?.activity_a
  );
  const sentenceActivityA = normalizeSentenceEntries(
    activityData?.content?.activity_b
  );
  const sentenceActivityB = normalizeSentenceEntries(
    activityData?.content?.activity_c
  );

  const baseContext = {
    activityLabel,
    activityNumber,
    activityFocus,
  };

  const repeatPauseMs = getRepeatPauseMs(activityData);

  const matchingContext = createSubActivityContext(
    baseContext,
    "a",
    Boolean(activityFocus)
  );
  const listeningContext = createSubActivityContext(baseContext, "b");
  const listenRepeatContext = createSubActivityContext(baseContext, "c");

  return [
    buildMatchingSlide(matchingItems, matchingContext),
    buildListeningSlide(sentenceActivityA, listeningContext),
    buildListenRepeatSlide(sentenceActivityB, listenRepeatContext, {
      repeatPauseMs,
    }),
  ];
};
