import {
  audioManager,
  computeSegmentGapMs,
  getBetweenItemGapMs,
} from "./audio-manager.js";
import { showCompletionModal } from "./completion-modal.js";

const smoothScrollIntoView = (element) => {
  if (!element) {
    return;
  }
  element.scrollIntoView({ behavior: "smooth", block: "center" });
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

const normalizeValue = (value) => {
  const trimmed = trimString(value);
  return trimmed ? trimmed.toLowerCase() : "";
};

const createStatus = () => {
  const status = document.createElement("p");
  status.className = "playback-status";
  status.textContent = "";
  return status;
};

const ensureInstructionAnchor = (slide) => {
  if (slide.querySelector(".slide__instruction")) {
    return;
  }
  const instruction = document.createElement("p");
  instruction.className = "slide__instruction";
  instruction.textContent = "";
  slide.appendChild(instruction);
};

const buildHeading = (slide, headingText) => {
  const heading = document.createElement("h2");
  heading.textContent = headingText;
  slide.appendChild(heading);
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

const clearEntryHighlights = (items = []) => {
  items.forEach(({ card, line }) => {
    card?.classList.remove("is-active");
    line?.classList.remove("is-playing");
  });
};

const normalizeComprehensionData = (raw = {}) => {
  const audio = trimString(raw?.audio);
  const rawQuestions = Array.isArray(raw?.Questions)
    ? raw.Questions
    : Array.isArray(raw?.questions)
    ? raw.questions
    : [];

  const questions = rawQuestions
    .map((question, index) => {
      const id = trimString(question?.id) || `question_${index + 1}`;
      const prompt = trimString(question?.question);
      const answer = trimString(question?.answer);
      const options = Array.isArray(question?.options)
        ? question.options.map((option) => trimString(option)).filter(Boolean)
        : [];

      if (!prompt || !answer || options.length < 2) {
        return null;
      }

      return {
        id,
        prompt,
        answer,
        answerNormalized: normalizeValue(answer),
        options,
      };
    })
    .filter(Boolean);

  return {
    audio,
    questions,
  };
};

const normalizeLineItems = (raw = []) => {
  if (!Array.isArray(raw)) {
    return [];
  }

  return raw
    .map((entry, index) => {
      const id = trimString(entry?.id) || `line_${index + 1}`;
      const text = trimString(entry?.text);
      const audio = trimString(entry?.audio);
      if (!text || !audio) {
        return null;
      }
      return { id, text, audio };
    })
    .filter(Boolean);
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

const buildComprehensionSlide = (data = {}, context = {}) => {
  const {
    activityLabel = "Activity",
    activityNumber = null,
    subActivitySuffix = "",
    activityFocus = "",
    includeFocus = false,
    subActivityLetter = "",
  } = context;

  const slide = document.createElement("section");
  slide.className = "slide slide--listening listening-slide listening-slide--mcq";
  buildHeading(slide, `${activityLabel}${subActivitySuffix}`);
  ensureInstructionAnchor(slide);
  maybeInsertFocus(slide, activityFocus, includeFocus);

  const controls = document.createElement("div");
  controls.className = "slide__controls";
  const playBtn = document.createElement("button");
  playBtn.type = "button";
  playBtn.className = "primary-btn";
  playBtn.textContent = "Start";
  const status = createStatus();
  controls.append(playBtn, status);
  slide.appendChild(controls);

  const list = document.createElement("div");
  list.className = "listening-mcq-grid";
  slide.appendChild(list);

  const questions = Array.isArray(data?.questions) ? data.questions : [];

  const entries = questions.map((question, index) => {
    const card = document.createElement("article");
    card.className = "dialogue-card dialogue-card--listening";

    const title = document.createElement("h3");
    title.className = "dialogue-card__title";
    title.textContent = `Question ${index + 1}`;
    card.appendChild(title);

    const prompt = document.createElement("p");
    prompt.className = "dialogue-card__line dialogue-card__line--question";
    prompt.textContent = question.prompt;
    card.appendChild(prompt);

    const optionGroup = document.createElement("div");
    optionGroup.className = "listening-option-group";

    const buttons = question.options.map((option) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "listening-option";
      button.textContent = option;
      button.dataset.optionValue = option;
      button.dataset.optionNormalized = normalizeValue(option);
      optionGroup.appendChild(button);
      return button;
    });

    card.appendChild(optionGroup);

    const feedback = document.createElement("p");
    feedback.className = "listening-feedback";
    feedback.textContent = "";
    card.appendChild(feedback);

    list.appendChild(card);

    return {
      question,
      card,
      buttons,
      feedback,
      completed: false,
    };
  });

  if (!entries.length) {
    const empty = document.createElement("p");
    empty.className = "empty-state";
    empty.textContent = "Questions will be added soon.";
    list.appendChild(empty);
  }

  let playbackCount = 0;
  let playbackController = null;
  let secondPlaybackTimer = null;
  let secondPlaybackCountdownInterval = null;
  let secondPlaybackRemaining = 0;
  let autoTriggered = false;
  let completionShown = false;

  const updateButtonState = () => {
    if (!data?.audio) {
      playBtn.disabled = true;
      playBtn.textContent = "Audio unavailable";
      return;
    }
    if (playbackCount >= 2) {
      playBtn.disabled = true;
      playBtn.textContent = "Playback finished";
      return;
    }
    playBtn.disabled = false;
    playBtn.textContent = "Start";
  };

  updateButtonState();

  const clearPlaybackTimers = () => {
    if (secondPlaybackTimer !== null) {
      window.clearTimeout(secondPlaybackTimer);
      secondPlaybackTimer = null;
    }
    if (secondPlaybackCountdownInterval !== null) {
      window.clearInterval(secondPlaybackCountdownInterval);
      secondPlaybackCountdownInterval = null;
    }
    secondPlaybackRemaining = 0;
  };

  const scheduleSecondPlayback = () => {
    if (playbackCount < 1 || playbackCount >= 2) {
      return;
    }
    clearPlaybackTimers();

    secondPlaybackRemaining = 20;
    const updateStatus = () => {
      status.textContent = `Second playback starts in ${secondPlaybackRemaining}s. Click play to listen sooner.`;
    };

    updateStatus();
    playBtn.disabled = false;

    secondPlaybackTimer = window.setTimeout(() => {
      clearPlaybackTimers();
      beginPlayback();
    }, secondPlaybackRemaining * 1000);

    secondPlaybackCountdownInterval = window.setInterval(() => {
      secondPlaybackRemaining -= 1;
      if (secondPlaybackRemaining <= 0) {
        clearPlaybackTimers();
        return;
      }
      updateStatus();
    }, 1000);
  };

  const beginPlayback = async () => {
    const audioUrl = trimString(data?.audio);
    if (!audioUrl) {
      status.textContent = "Audio not available.";
      updateButtonState();
      return;
    }

    if (playbackCount >= 2) {
      status.textContent = "You have already listened twice.";
      updateButtonState();
      return;
    }

    clearPlaybackTimers();
    playbackController?.abort();
    playbackController = new AbortController();
    const { signal } = playbackController;

    const passIndex = playbackCount + 1;
    playBtn.disabled = true;
    status.textContent = passIndex === 1 ? "Playing..." : "Replaying audio...";

    audioManager.stopAll();

    try {
      await audioManager.play(audioUrl, { signal });
      if (signal.aborted) {
        status.textContent = "Playback stopped.";
        return;
      }
      playbackCount += 1;
      if (playbackCount >= 2) {
        status.textContent = "You have listened twice.";
      } else {
        scheduleSecondPlayback();
      }
    } catch (error) {
      if (!signal.aborted) {
        console.error(error);
        status.textContent = "Unable to play audio.";
      }
    } finally {
      playbackController = null;
      updateButtonState();
    }
  };

  const evaluateQuestion = (entry, selectedNormalized) => {
    if (entry.completed) {
      return;
    }
    entry.completed = true;

    entry.buttons.forEach((button) => {
      button.disabled = true;
    });

    const isCorrect =
      selectedNormalized === entry.question.answerNormalized;

    const selectedButton = entry.buttons.find(
      (button) => button.dataset.optionNormalized === selectedNormalized
    );
    const correctButton = entry.buttons.find(
      (button) =>
        button.dataset.optionNormalized === entry.question.answerNormalized
    );

    if (selectedButton) {
      selectedButton.classList.add("is-selected");
      selectedButton.classList.add(
        isCorrect ? "is-correct" : "is-incorrect"
      );
    }

    correctButton?.classList.add("is-correct");

    entry.feedback.textContent = isCorrect
      ? "Correct!"
      : `Incorrect. Correct answer: ${entry.question.answer}`;
    entry.feedback.classList.add(
      isCorrect
        ? "listening-feedback--positive"
        : "listening-feedback--negative"
    );

    entry.card.classList.add(isCorrect ? "is-correct" : "is-incorrect");

    const answeredCount = entries.filter((item) => item.completed).length;
    if (!completionShown && answeredCount === entries.length) {
      completionShown = true;
      showCompletionModal({
        title: "Great Work!",
        message: "You completed all of the questions.",
      });
    }
  };

  entries.forEach((entry) => {
    entry.buttons.forEach((button) => {
      button.addEventListener("click", () => {
        const normalized = button.dataset.optionNormalized || "";
        evaluateQuestion(entry, normalized);
      });
    });
  });

  playBtn.addEventListener("click", () => {
    beginPlayback();
  });

  const triggerAutoPlay = () => {
    if (autoTriggered) {
      return;
    }
    autoTriggered = true;
    slide._autoTriggered = true;
    beginPlayback();
  };

  const onLeave = () => {
    clearPlaybackTimers();
    playbackController?.abort();
    playbackController = null;
    audioManager.stopAll();
    playbackCount = 0;
    autoTriggered = false;
    slide._autoTriggered = false;
    status.textContent = "";
    completionShown = false;
    entries.forEach((entry) => {
      entry.completed = false;
      entry.feedback.textContent = "";
      entry.feedback.className = "listening-feedback";
      entry.buttons.forEach((button) => {
        button.disabled = false;
        button.classList.remove(
          "is-selected",
          "is-correct",
          "is-incorrect"
        );
      });
      entry.card.classList.remove("is-correct", "is-incorrect");
    });
    updateButtonState();
  };

  const suffixSegment = subActivityLetter ? `-${subActivityLetter}` : "";

  return {
    id: activityNumber
      ? `activity-${activityNumber}${suffixSegment}-listening2-comprehension`
      : "listening2-comprehension",
    element: slide,
    autoPlay: {
      button: playBtn,
      trigger: triggerAutoPlay,
      status,
    },
    onLeave,
  };
};

const createSequencedTextSlide = (
  items = [],
  context = {},
  {
    mode = "listen",
    repeatPauseMs = 1500,
    autoDelayMs = 5000,
    layout = "grid",
    showLineNumbers = true,
    presentation = "cards",
  } = {}
) => {
  const {
    activityLabel = "Activity",
    activityNumber = null,
    subActivitySuffix = "",
    activityFocus = "",
    includeFocus = false,
    subActivityLetter = "",
  } = context;

  const isRepeatMode = mode === "listen-repeat";
  const isReadMode = mode === "read";
  const slide = document.createElement("section");
  slide.className = isRepeatMode
    ? "slide slide--listen-repeat listening-slide listening-slide--repeat"
    : "slide slide--listening listening-slide listening-slide--read";

  buildHeading(slide, `${activityLabel}${subActivitySuffix}`);
  ensureInstructionAnchor(slide);
  maybeInsertFocus(slide, activityFocus, includeFocus);

  const instructionEl = slide.querySelector(".slide__instruction");
  if (instructionEl) {
    instructionEl.textContent = isRepeatMode
      ? "Listen and repeat each sentence."
      : isReadMode
      ? "Read along with the audio."
      : "Listen to each sentence.";
  }

  const controls = document.createElement("div");
  controls.className = "slide__controls";
  const startBtn = document.createElement("button");
  startBtn.type = "button";
  startBtn.className = "primary-btn";
  startBtn.textContent = "Start";
  const status = createStatus();
  controls.append(startBtn, status);
  slide.appendChild(controls);

  const list = document.createElement("div");
  const isParagraphLayout = presentation === "paragraph";
  if (isParagraphLayout) {
    list.className = "listening-paragraph";
  } else {
    list.className = "dialogue-grid listening-read-grid";
    if (layout === "single-column") {
      list.classList.add("dialogue-grid--single-column");
    }
  }
  slide.appendChild(list);

  const entries = items.map((entry, index) => {
    if (isParagraphLayout) {
      const paragraph = document.createElement("p");
      paragraph.className = "listening-paragraph__line";
      paragraph.textContent = entry.text;
      list.appendChild(paragraph);
      return {
        entry,
        card: null,
        line: paragraph,
      };
    }

    const card = document.createElement("article");
    card.className = "dialogue-card dialogue-card--reading listening-read-card";

    if (showLineNumbers) {
      const title = document.createElement("h3");
      title.className = "dialogue-card__title";
      title.textContent = `Line ${index + 1}`;
      card.appendChild(title);
    }

    const wrapper = document.createElement("div");
    wrapper.className = "dialogue-card__texts";

    const line = document.createElement("p");
    line.className = "dialogue-card__line";
    line.textContent = entry.text;
    wrapper.appendChild(line);

    card.appendChild(wrapper);
    list.appendChild(card);

    return {
      entry,
      card,
      line,
    };
  });

  if (!entries.length) {
    const empty = document.createElement("p");
    empty.className = "empty-state";
    empty.textContent = "Audio will be added soon.";
    list.appendChild(empty);
  }

  let sequenceAbort = null;
  let autoTriggered = false;
  let pendingAutoStart = null;
  let pauseRequested = false;

  const playbackState = {
    mode: "idle",
    resumeIndex: 0,
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

  const setPlaybackMode = (mode, { resumeIndex } = {}) => {
    playbackState.mode = mode;
    if (Number.isInteger(resumeIndex)) {
      playbackState.resumeIndex = Math.max(0, resumeIndex);
    }
    updateButtonLabel();
  };

  const resetPlaybackState = () => {
    setPlaybackMode("idle", { resumeIndex: 0 });
    autoTriggered = false;
    slide._autoTriggered = false;
    startBtn.disabled = false;
  };

  updateButtonLabel();

  const clearAutoStart = () => {
    if (pendingAutoStart !== null) {
      window.clearTimeout(pendingAutoStart);
      pendingAutoStart = null;
    }
  };

  const resetEntries = () => {
    clearEntryHighlights(entries);
  };

  const runSequence = async (fromIndex = 0) => {
    if (!entries.length) {
      status.textContent = "Audio will be added soon.";
      resetPlaybackState();
      return;
    }

    pauseRequested = false;

    sequenceAbort?.abort();
    sequenceAbort = new AbortController();
    const { signal } = sequenceAbort;

    audioManager.stopAll();
    resetEntries();
    setPlaybackMode("playing", { resumeIndex: fromIndex });
    status.textContent = fromIndex === 0 ? "Starting..." : "Resuming...";

    let completed = false;

    try {
      for (let index = fromIndex; index < entries.length; index += 1) {
        playbackState.resumeIndex = index;
        const item = entries[index];
        item.card?.classList.add("is-active");
        item.line.classList.add("is-playing");
        status.textContent = "Listening...";
        smoothScrollIntoView(item.card ?? item.line);

        try {
          await audioManager.play(item.entry.audio, { signal });
        } catch (error) {
          if (!signal.aborted) {
            console.error(error);
            status.textContent = "Unable to play audio.";
          }
        }

        if (signal.aborted) {
          break;
        }

        playbackState.resumeIndex = index + 1;

        let gapMs = 0;
        try {
          const duration = await audioManager.getDuration(item.entry.audio);
          const timingMode = isReadMode
            ? "read"
            : isRepeatMode
            ? "listen-repeat"
            : "listen";
          const timingOptions = isRepeatMode ? { repeatPauseMs } : undefined;
          gapMs = computeSegmentGapMs(
            timingMode,
            duration,
            timingOptions
          );
        } catch (error) {
          console.error(error);
        }

        if (signal.aborted) {
          break;
        }

        if (gapMs > 0) {
          if (isRepeatMode) {
            status.textContent = "Your turn...";
            await waitMs(gapMs, { signal });
          } else if (isReadMode) {
            status.textContent = "Read along...";
            await waitMs(gapMs, { signal });
            if (!signal.aborted) {
              status.textContent = "Listening...";
            }
          } else if (index < entries.length - 1) {
            status.textContent = "Next up...";
            await waitMs(gapMs, { signal });
          }
        }

        item.card?.classList.remove("is-active");
        item.line.classList.remove("is-playing");

        if (signal.aborted) {
          break;
        }

        if (isReadMode && index < entries.length - 1) {
          const betweenItemsGap = getBetweenItemGapMs("read");
          if (betweenItemsGap > 0) {
            await waitMs(betweenItemsGap, { signal });
          }
        }
      }

      if (!signal.aborted) {
        completed = true;
        status.textContent = "Playback complete.";
      }
    } finally {
      const aborted = sequenceAbort?.signal?.aborted ?? false;
      sequenceAbort = null;

      if (aborted && pauseRequested) {
        setPlaybackMode("paused", { resumeIndex: playbackState.resumeIndex });
        status.textContent = "Paused.";
      } else if (completed) {
        resetPlaybackState();
        resetEntries();
      } else if (aborted) {
        status.textContent = "Playback stopped.";
        resetPlaybackState();
        resetEntries();
      } else {
        resetPlaybackState();
      }

      pauseRequested = false;
    }
  };

  const startSequence = (fromIndex = 0) => {
    clearAutoStart();
    autoTriggered = true;
    slide._autoTriggered = true;
    runSequence(fromIndex);
  };

  const triggerAutoPlay = () => {
    if (
      autoTriggered ||
      playbackState.mode === "playing" ||
      playbackState.mode === "paused"
    ) {
      return;
    }
    autoTriggered = true;
    slide._autoTriggered = true;
    clearAutoStart();
    pendingAutoStart = window.setTimeout(() => {
      pendingAutoStart = null;
      runSequence();
    }, Math.max(0, autoDelayMs));
  };

  startBtn.addEventListener("click", () => {
    if (playbackState.mode === "playing") {
      pauseRequested = true;
      sequenceAbort?.abort();
      return;
    }

    if (playbackState.mode === "paused") {
      startSequence(playbackState.resumeIndex);
      return;
    }

    startSequence();
  });

  const onLeave = () => {
    clearAutoStart();
    pauseRequested = false;
    sequenceAbort?.abort();
    sequenceAbort = null;
    audioManager.stopAll();
    resetEntries();
    resetPlaybackState();
    status.textContent = "";
  };

  const suffixSegment = subActivityLetter
    ? `-${subActivityLetter}`
    : "";

  return {
    id: activityNumber
      ? `activity-${activityNumber}${suffixSegment}-${
          isRepeatMode ? "listen-repeat" : "listening"
        }`
      : `listening2-${isRepeatMode ? "listen-repeat" : "listening"}`,
    element: slide,
    autoPlay: {
      button: startBtn,
      trigger: triggerAutoPlay,
      status,
    },
    onLeave,
  };
};

export const buildListeningTwoSlides = (activityData = {}, context = {}) => {
  const { activityNumber, focus: rawFocus } = context;
  const activityLabel = activityNumber
    ? `Activity ${activityNumber}`
    : "Activity";
  const activityFocus = trimString(rawFocus);

  const comprehensionData = normalizeComprehensionData(
    activityData?.content?.activity_a
  );
  const listenItems = normalizeLineItems(activityData?.content?.activity_b);
  const repeatItems = normalizeLineItems(activityData?.content?.activity_c);
  const readAlongItems = normalizeLineItems(activityData?.content?.activity_d);

  const baseContext = {
    activityLabel,
    activityNumber,
    activityFocus,
  };

  const repeatPauseMs = getRepeatPauseMs(activityData);

  const slides = [
    buildComprehensionSlide(
      comprehensionData,
      createSubActivityContext(baseContext, "a", Boolean(activityFocus))
    ),
    createSequencedTextSlide(
      listenItems,
      createSubActivityContext(baseContext, "b"),
      {
        mode: "listen",
        autoDelayMs: 5000,
        repeatPauseMs,
        layout: "single-column",
        showLineNumbers: false,
        presentation: "paragraph",
      }
    ),
    createSequencedTextSlide(
      repeatItems,
      createSubActivityContext(baseContext, "c"),
      { mode: "listen-repeat", autoDelayMs: 5000, repeatPauseMs }
    ),
    createSequencedTextSlide(
      readAlongItems,
      createSubActivityContext(baseContext, "d"),
      { mode: "read", autoDelayMs: 5000, repeatPauseMs }
    ),
  ];

  return slides;
};
