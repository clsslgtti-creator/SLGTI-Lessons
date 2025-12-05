const normalizeText = (value) =>
  typeof value === "string" ? value.trim() : "";

const normalizeId = (raw, index, prefix) => {
  const normalized = normalizeText(raw);
  if (normalized.length) {
    return normalized;
  }
  return `${prefix}_${index + 1}`;
};

const normalizeAnswer = (value) => normalizeText(value).toLowerCase();

const shuffleArray = (items = []) => {
  const clone = items.slice();
  for (let i = clone.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [clone[i], clone[j]] = [clone[j], clone[i]];
  }
  return clone;
};

const normalizeQuestions = (raw = []) =>
  (Array.isArray(raw) ? raw : [])
    .map((entry, index) => {
      const prompt = normalizeText(entry?.question);
      const answer = normalizeText(entry?.answer);
      const options = Array.isArray(entry?.options)
        ? entry.options
            .map((option) => normalizeText(option))
            .filter(Boolean)
        : [];
      if (!prompt || !answer || options.length < 2) {
        return null;
      }
      return {
        id: normalizeId(entry?.id, index, "listening"),
        prompt,
        answer,
        answerNormalized: normalizeAnswer(answer),
        options,
      };
    })
    .filter(Boolean);

const getQuestionOrder = (questions, savedOrder) => {
  const savedIds = Array.isArray(savedOrder) ? savedOrder : [];
  if (savedIds.length === questions.length) {
    const ordered = savedIds
      .map((id) => questions.find((question) => question.id === id))
      .filter(Boolean);
    if (ordered.length === questions.length) {
      return ordered;
    }
  }
  return shuffleArray(questions);
};

const getOptionOrder = (question, savedDetail) => {
  const savedOrder = Array.isArray(savedDetail?.[question.id])
    ? savedDetail[question.id].map((value) => normalizeText(value))
    : null;
  if (savedOrder && savedOrder.length === question.options.length) {
    const map = new Map();
    question.options.forEach((option) => {
      map.set(normalizeText(option), option);
    });
    const ordered = savedOrder
      .map((key) => map.get(key))
      .filter((value) => typeof value === "string");
    if (ordered.length === question.options.length) {
      return ordered;
    }
  }
  return shuffleArray(question.options);
};

const createHeading = (context = {}) => {
  if (context.activityNumber) {
    return `Activity ${context.activityNumber}`;
  }
  return "Activity";
};

const createResultText = (correct, total) => {
  if (!total) {
    return "";
  }
  return `Score: ${correct} / ${total}`;
};

const createOptionButton = (label) => {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "listening-option";
  button.textContent = label;
  button.dataset.value = label;
  button.dataset.normalized = normalizeAnswer(label);
  return button;
};

const resultMessage = (element, correct, total, tone = "neutral") => {
  element.textContent = createResultText(correct, total);
  element.classList.remove(
    "assessment-result--error",
    "assessment-result--success"
  );
  if (tone === "error") {
    element.classList.add("assessment-result--error");
  } else if (tone === "success") {
    element.classList.add("assessment-result--success");
  }
};

export const buildListeningSlides = (
  activityData = {},
  context = {},
  assessment = {}
) => {
  const questions = normalizeQuestions(activityData?.content);
  const audioSrc = normalizeText(activityData?.audio);
  const maxPlays = 2;

  const slide = document.createElement("section");
  slide.className = "slide slide--assessment slide--listening-mcq";

  const heading = document.createElement("h2");
  heading.textContent = createHeading(context);
  slide.appendChild(heading);

  const controls = document.createElement("div");
  controls.className = "slide__controls";
  slide.appendChild(controls);

  const playBtn = document.createElement("button");
  playBtn.type = "button";
  playBtn.className = "primary-btn";
  playBtn.textContent = "Play Audio";
  controls.appendChild(playBtn);

  const statusEl = document.createElement("p");
  statusEl.className = "playback-status";
  statusEl.textContent = "Audio can be played twice.";
  controls.appendChild(statusEl);

  const grid = document.createElement("div");
  grid.className = "listening-mcq-grid";
  slide.appendChild(grid);

  const actions = document.createElement("div");
  actions.className = "assessment-actions";
  slide.appendChild(actions);

  const submitBtn = document.createElement("button");
  submitBtn.type = "button";
  submitBtn.className = "primary-btn";
  submitBtn.textContent = "Submit Answers";
  actions.appendChild(submitBtn);

  const resultEl = document.createElement("p");
  resultEl.className = "assessment-result";
  resultEl.setAttribute("role", "status");
  actions.appendChild(resultEl);

  const registerActivity =
    typeof assessment?.registerActivity === "function"
      ? assessment.registerActivity
      : () => {};
  const submitResult =
    typeof assessment?.submitResult === "function"
      ? assessment.submitResult
      : () => {};
  const getSavedState =
    typeof assessment?.getState === "function"
      ? assessment.getState
      : () => null;

  const savedState = getSavedState() || null;
  const savedDetail = savedState?.detail || {};
  let submissionLocked = Boolean(savedState?.submitted);
  let instructionsLocked = false;

  const orderedQuestions = getQuestionOrder(
    questions,
    savedDetail.questionOrder
  );

  const questionEntries = orderedQuestions.map((question, index) => {
    const card = document.createElement("article");
    card.className = "dialogue-card dialogue-card--listening quiz-card";

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
    card.appendChild(optionGroup);

    const optionOrder = getOptionOrder(
      question,
      savedDetail?.optionOrder || {}
    );
    const buttons = optionOrder.map((label) => {
      const button = createOptionButton(label);
      optionGroup.appendChild(button);
      return button;
    });

    const feedback = document.createElement("p");
    feedback.className = "listening-feedback";
    feedback.textContent = "";
    card.appendChild(feedback);

    const entry = {
      question,
      card,
      buttons,
      feedback,
      selected: null,
      selectedNormalized: "",
      locked: false,
    };

    buttons.forEach((button) => {
      button.addEventListener("click", () => {
        if (entry.locked) {
          return;
        }
        entry.selected = button.dataset.value;
        entry.selectedNormalized = button.dataset.normalized || "";
        buttons.forEach((btn) => btn.classList.remove("is-selected"));
        button.classList.add("is-selected");
      });
    });

    grid.appendChild(card);
    return entry;
  });

  registerActivity({ total: questionEntries.length });

  const refreshAnswerInteractivity = () => {
    const disableBase = instructionsLocked || submissionLocked;
    questionEntries.forEach((entry) => {
      const entryDisabled = disableBase || entry.locked;
      entry.buttons.forEach((button) => {
        button.disabled = entryDisabled;
      });
    });
    const noQuestions = !questionEntries.length;
    submitBtn.disabled =
      instructionsLocked || submissionLocked || noQuestions;
  };

  if (!questionEntries.length) {
    const empty = document.createElement("p");
    empty.className = "empty-state";
    empty.textContent = "Questions will be available soon.";
    grid.appendChild(empty);
    submitBtn.disabled = true;
  }

  let audioElement = audioSrc ? new Audio(audioSrc) : null;
  let playCount = Number.isFinite(savedDetail?.playbackCount)
    ? Math.max(0, Math.min(maxPlays, savedDetail.playbackCount))
    : 0;
  let isPlaying = false;

  const updatePlaybackStatus = () => {
    if (instructionsLocked) {
      statusEl.textContent = "Please listen to the instructions first.";
      playBtn.disabled = true;
      return;
    }
    if (!audioElement) {
      statusEl.textContent = "Audio not available.";
      playBtn.disabled = true;
      return;
    }
    if (submissionLocked) {
      statusEl.textContent = "Responses submitted.";
      playBtn.disabled = true;
      return;
    }
    if (isPlaying) {
      statusEl.textContent = `Playing (${playCount + 1} / ${maxPlays})...`;
      playBtn.disabled = true;
      return;
    }
    if (playCount >= maxPlays) {
      statusEl.textContent = "Audio played twice.";
      playBtn.disabled = true;
      return;
    }
    statusEl.textContent =
      playCount === 0
        ? "Audio can be played twice."
        : `You can play ${maxPlays - playCount} more time(s).`;
    playBtn.disabled = false;
  };

  const handleAudioError = () => {
    statusEl.textContent = "Unable to play audio.";
    playBtn.disabled = true;
  };

  const handleAudioEnded = () => {
    isPlaying = false;
    playCount = Math.min(maxPlays, playCount + 1);
    updatePlaybackStatus();
  };

  if (audioElement) {
    audioElement.addEventListener("ended", handleAudioEnded);
    audioElement.addEventListener("error", handleAudioError);
  } else {
    playBtn.disabled = true;
  }

  const beginPlayback = () => {
    if (!audioElement || submissionLocked || instructionsLocked) {
      return;
    }
    if (playCount >= maxPlays) {
      updatePlaybackStatus();
      return;
    }
    try {
      audioElement.currentTime = 0;
    } catch {
      /* ignore */
    }
    const playPromise = audioElement.play();
    if (playPromise?.catch) {
      playPromise.catch(handleAudioError);
    }
    isPlaying = true;
    updatePlaybackStatus();
  };

  playBtn.addEventListener("click", () => beginPlayback());

  const lockEntry = (entry, isCorrect) => {
    entry.locked = true;
    entry.card.classList.toggle("is-correct", isCorrect);
    entry.card.classList.toggle("is-incorrect", !isCorrect);
    entry.buttons.forEach((button) => {
      const isAnswer =
        button.dataset.normalized === entry.question.answerNormalized;
      if (isAnswer) {
        button.classList.add("is-correct");
      }
      if (button.classList.contains("is-selected") && !isCorrect) {
        button.classList.add("is-incorrect");
      }
    });
    refreshAnswerInteractivity();
    entry.feedback.textContent = isCorrect
      ? "Correct!"
      : `Answer: ${entry.question.answer}`;
    entry.feedback.classList.toggle(
      "listening-feedback--positive",
      isCorrect
    );
    entry.feedback.classList.toggle(
      "listening-feedback--negative",
      !isCorrect
    );
  };

  const evaluate = () => {
    if (!questionEntries.length) {
      return;
    }
    const unanswered = questionEntries.filter(
      (entry) => !entry.selectedNormalized
    );
    if (unanswered.length) {
      resultEl.textContent = "Please answer every question.";
      resultEl.classList.add("assessment-result--error");
      return;
    }
    let correctCount = 0;
    questionEntries.forEach((entry) => {
      const isCorrect =
        entry.selectedNormalized === entry.question.answerNormalized;
      if (isCorrect) {
        correctCount += 1;
      }
      lockEntry(entry, isCorrect);
    });

    submissionLocked = true;
    refreshAnswerInteractivity();
    submitBtn.textContent = "Submitted";
    updatePlaybackStatus();

    const detail = {
      questionOrder: questionEntries.map((entry) => entry.question.id),
      optionOrder: questionEntries.reduce((acc, entry) => {
        acc[entry.question.id] = entry.buttons.map(
          (button) => button.dataset.value
        );
        return acc;
      }, {}),
      answers: questionEntries.reduce((acc, entry) => {
        acc[entry.question.id] = entry.selected ?? null;
        return acc;
      }, {}),
      playbackCount: playCount,
    };

    submitResult({
      total: questionEntries.length,
      correct: correctCount,
      detail,
      timestamp: new Date().toISOString(),
    });

    resultMessage(
      resultEl,
      correctCount,
      questionEntries.length,
      correctCount === questionEntries.length ? "success" : "neutral"
    );
  };

  const applySavedState = () => {
    const storedAnswers = savedDetail?.answers || {};
    let correctCount = 0;
    questionEntries.forEach((entry) => {
      const storedAnswer = storedAnswers[entry.question.id];
      if (typeof storedAnswer === "string") {
        const normalized = normalizeAnswer(storedAnswer);
        entry.selected = storedAnswer;
        entry.selectedNormalized = normalized;
        const selectedButton = entry.buttons.find(
          (button) => button.dataset.normalized === normalized
        );
        if (selectedButton) {
          selectedButton.classList.add("is-selected");
        }
      }
      const isCorrect =
        entry.selectedNormalized === entry.question.answerNormalized;
      if (isCorrect) {
        correctCount += 1;
      }
      lockEntry(entry, isCorrect);
    });
    submissionLocked = true;
    refreshAnswerInteractivity();
    submitBtn.textContent = "Submitted";
    updatePlaybackStatus();
    resultMessage(resultEl, correctCount, questionEntries.length);
  };

  if (savedState?.submitted) {
    applySavedState();
  } else {
    submitBtn.addEventListener("click", evaluate);
  }

  slide.addEventListener("instructionstatechange", (event) => {
    instructionsLocked = Boolean(event.detail?.locked);
    refreshAnswerInteractivity();
    updatePlaybackStatus();
  });

  refreshAnswerInteractivity();
  updatePlaybackStatus();

  const onLeave = () => {
    if (audioElement) {
      audioElement.pause();
      audioElement.currentTime = 0;
    }
    isPlaying = false;
    updatePlaybackStatus();
  };

  const slideId = context.key
    ? `${context.key}-listening`
    : "activity-listening";

  return [
    {
      id: slideId,
      element: slide,
      onLeave,
    },
  ];
};
