const trimString = (value) =>
  typeof value === "string" ? value.trim() : "";

const normalizePairs = (raw = []) => {
  if (!Array.isArray(raw)) {
    return [];
  }

  const idCounts = new Map();
  return raw
    .map((entry, index) => {
      const baseId = trimString(entry?.id) || `match_${index + 1}`;
      const count = idCounts.get(baseId) ?? 0;
      idCounts.set(baseId, count + 1);
      const id = count > 0 ? `${baseId}_${count + 1}` : baseId;
      const itemA =
        trimString(entry?.item_a) ||
        trimString(entry?.itemA) ||
        trimString(entry?.word);
      const itemB =
        trimString(entry?.item_b) ||
        trimString(entry?.itemB) ||
        trimString(entry?.definition);
      if (!itemA || !itemB) {
        return null;
      }
      return {
        id,
        itemA,
        itemB,
      };
    })
    .filter(Boolean);
};

const shuffleArray = (items = []) => {
  const list = items.slice();
  for (let index = list.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [list[index], list[swapIndex]] = [list[swapIndex], list[index]];
  }
  return list;
};

const createHeading = (context = {}) => {
  if (context.activityNumber) {
    return `Activity ${context.activityNumber}`;
  }
  return "Activity";
};

const createResultText = (correct, total) => {
  if (!Number.isInteger(total) || total <= 0) {
    return "";
  }
  return `Score: ${correct} / ${total}`;
};

const resultMessage = (element, correct, total, tone = "neutral") => {
  if (!element) {
    return;
  }
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

export const buildMatchingWordsSlides = (
  activityData = {},
  context = {},
  assessment = {}
) => {
  const items = normalizePairs(activityData?.content);
  const audioUrl = trimString(activityData?.audio);

  const slide = document.createElement("section");
  slide.className =
    "slide slide--assessment slide--matching-words listening-slide--matching";

  const heading = document.createElement("h2");
  heading.textContent = createHeading(context);
  slide.appendChild(heading);

  const controls = document.createElement("div");
  controls.className = "slide__controls";

  const playBtn = document.createElement("button");
  playBtn.type = "button";
  playBtn.className = "primary-btn";
  playBtn.textContent = "Start";

  const status = document.createElement("p");
  status.className = "playback-status";
  status.textContent = "";

  controls.append(playBtn, status);
  slide.appendChild(controls);

  const layout = document.createElement("div");
  layout.className = "listening-word-match";

  const wordsColumn = document.createElement("div");
  wordsColumn.className = "word-match-bank";
  layout.appendChild(wordsColumn);

  const sentencesColumn = document.createElement("div");
  sentencesColumn.className = "word-match-sentences";
  layout.appendChild(sentencesColumn);

  const feedbackEl = document.createElement("p");
  feedbackEl.className =
    "listening-feedback listening-feedback--neutral word-match-feedback";
  layout.appendChild(feedbackEl);

  slide.appendChild(layout);

  const actions = document.createElement("div");
  actions.className = "assessment-actions";

  const submitBtn = document.createElement("button");
  submitBtn.type = "button";
  submitBtn.className = "primary-btn";
  submitBtn.textContent = "Submit";
  actions.appendChild(submitBtn);

  const resultEl = document.createElement("p");
  resultEl.className = "assessment-result";
  resultEl.setAttribute("role", "status");
  actions.appendChild(resultEl);

  slide.appendChild(actions);

  if (!items.length) {
    const emptyState = document.createElement("p");
    emptyState.className = "empty-state";
    emptyState.textContent = "Matching content will be available soon.";
    layout.appendChild(emptyState);
    playBtn.disabled = true;
    submitBtn.disabled = true;
    status.textContent = audioUrl ? "" : "Audio not available.";
    return [
      {
        id: context.key ? `${context.key}-matching` : "activity-matching",
        element: slide,
      },
    ];
  }

  const placements = new Map();
  const dropzones = [];

  const createSentenceCard = (entry, index) => {
    const card = document.createElement("article");
    card.className = "word-match-sentence";

    const title = document.createElement("h3");
    title.textContent = `Pair ${index + 1}`;
    card.appendChild(title);

    const body = document.createElement("p");
    body.textContent = entry.itemB;
    card.appendChild(body);

    const zone = document.createElement("div");
    zone.className = "word-match-dropzone";
    zone.dataset.expectedId = entry.id;
    zone.dataset.zoneId = entry.id;

    const placeholder = document.createElement("span");
    placeholder.className = "word-match-placeholder";
    placeholder.textContent = "Drop the matching word here";
    zone.appendChild(placeholder);

    card.appendChild(zone);
    dropzones.push(zone);
    return card;
  };

  items.forEach((entry, index) => {
    sentencesColumn.appendChild(createSentenceCard(entry, index));
  });

  const createCard = (entry) => {
    const card = document.createElement("div");
    card.className = "word-match-card";
    card.dataset.itemId = entry.id;
    card.dataset.assignedZone = "";
    card.textContent = entry.itemA;
    return card;
  };

  const cards = shuffleArray(items).map((entry) => createCard(entry));
  cards.forEach((card) => wordsColumn.appendChild(card));

  const updateFeedback = (text, variant = "neutral") => {
    feedbackEl.textContent = text;
    feedbackEl.classList.remove(
      "listening-feedback--positive",
      "listening-feedback--negative",
      "listening-feedback--neutral"
    );
    feedbackEl.classList.add(`listening-feedback--${variant}`);
  };

  let evaluationShown = false;
  let answersChecked = false;
  let instructionsLocked = false;
  let interactionsReady = false;

  const markZoneState = (zone, cardEl) => {
    if (!zone) {
      return false;
    }
    const expectedId = zone.dataset.expectedId;
    zone.classList.remove("is-correct", "is-incorrect");
    cardEl?.classList.remove("is-correct", "is-incorrect");
    if (!cardEl) {
      return false;
    }
    const isMatch = cardEl.dataset.itemId === expectedId;
    if (isMatch) {
      zone.classList.add("is-correct");
      cardEl.classList.add("is-correct");
    } else {
      zone.classList.add("is-incorrect");
      cardEl.classList.add("is-incorrect");
    }
    return isMatch;
  };

  const detachFromZone = (cardEl) => {
    if (!cardEl) {
      return;
    }
    const assigned = cardEl.dataset.assignedZone;
    if (!assigned) {
      return;
    }
    const zone = dropzones.find((zoneEl) => zoneEl.dataset.zoneId === assigned);
    if (zone) {
      placements.delete(assigned);
      zone.classList.remove("is-filled", "is-correct", "is-incorrect");
      const placeholder = zone.querySelector(".word-match-placeholder");
      placeholder?.classList.remove("is-hidden");
      if (!zone.contains(placeholder)) {
        zone.appendChild(placeholder);
      }
      const card = zone.querySelector(".word-match-card");
      if (card) {
        zone.removeChild(card);
      }
    }
    cardEl.dataset.assignedZone = "";
  };

  const resetCardPosition = (cardEl) => {
    if (!cardEl) {
      return;
    }
    cardEl.style.top = "";
    cardEl.style.left = "";
    cardEl.style.position = "relative";
    const $ = window.jQuery;
    if ($ && $(cardEl).data("uiDraggable")) {
      $(cardEl).draggable("option", "revert", "invalid");
    }
  };

  const clearEvaluationState = () => {
    evaluationShown = false;
    updateFeedback("Drag each word to the matching definition.", "neutral");
    dropzones.forEach((zone) =>
      zone.classList.remove("is-correct", "is-incorrect")
    );
    cards.forEach((card) =>
      card.classList.remove("is-correct", "is-incorrect")
    );
  };

  const setInteractionsEnabled = (enabled) => {
    if (!interactionsReady) {
      return;
    }
    const $ = window.jQuery;
    if (!$ || !$.fn?.draggable || !$.fn?.droppable) {
      return;
    }
    const method = enabled ? "enable" : "disable";
    $(cards).draggable(method);
    $(dropzones).droppable(method);
    $(wordsColumn).droppable(method);
  };

  const resetMatching = () => {
    placements.clear();
    answersChecked = false;
    evaluationShown = false;
    submitBtn.textContent = "Submit";
    clearEvaluationState();
    resultEl.textContent = "";
    resultEl.classList.remove(
      "assessment-result--error",
      "assessment-result--success"
    );
    dropzones.forEach((zone) => {
      zone.classList.remove("is-filled");
      const placeholder = zone.querySelector(".word-match-placeholder");
      placeholder?.classList.remove("is-hidden");
      if (placeholder && !zone.contains(placeholder)) {
        zone.appendChild(placeholder);
      }
      const card = zone.querySelector(".word-match-card");
      if (card) {
        zone.removeChild(card);
      }
    });
    cards.forEach((card) => {
      card.dataset.assignedZone = "";
      card.classList.remove("is-active");
      resetCardPosition(card);
      wordsColumn.appendChild(card);
    });
    setInteractionsEnabled(!instructionsLocked);
    updatePlaybackStatus();
    updateButtonState();
  };

  const evaluatePlacements = () => {
    let correctCount = 0;
    dropzones.forEach((zone) => {
      const cardEl = placements.get(zone.dataset.zoneId);
      if (!cardEl) {
        zone.classList.add("is-incorrect");
        return;
      }
      const isMatch = markZoneState(zone, cardEl);
      if (isMatch) {
        correctCount += 1;
      }
    });

    evaluationShown = true;
    resultMessage(
      resultEl,
      correctCount,
      dropzones.length,
      correctCount === dropzones.length ? "success" : "neutral"
    );

    if (correctCount === dropzones.length) {
      updateFeedback("Great job! Every pair matches.", "positive");
    } else {
      updateFeedback(
        `You matched ${correctCount} of ${dropzones.length}. Review the red cards and try again.`,
        "negative"
      );
    }
  };

  const checkAnswers = () => {
    if (answersChecked || isPlaying) {
      return;
    }
    const incomplete = dropzones.some(
      (zone) => !placements.has(zone.dataset.zoneId)
    );
    if (incomplete) {
      resultEl.textContent = "Match all pairs before submitting.";
      resultEl.classList.add("assessment-result--error");
      return;
    }
    answersChecked = true;
    submitBtn.textContent = "Submitted";
    evaluatePlacements();
    setInteractionsEnabled(false);
    updatePlaybackStatus();
    updateButtonState();
  };

  const setupInteractions = () => {
    if (interactionsReady) {
      return;
    }
    const $ = window.jQuery;
    if (!$ || !$.fn?.draggable || !$.fn?.droppable) {
      console.warn("jQuery UI is required for the matching activity.");
      return;
    }

    interactionsReady = true;

    $(cards).draggable({
      revert: "invalid",
      containment: slide,
      start() {
        $(this).addClass("is-active");
        if (evaluationShown && !answersChecked) {
          clearEvaluationState();
        }
      },
      stop() {
        $(this).removeClass("is-active");
      },
    });

    $(dropzones).droppable({
      accept: ".word-match-card",
      tolerance: "intersect",
      over() {
        $(this).addClass("is-hover");
      },
      out() {
        $(this).removeClass("is-hover");
      },
      drop(_, ui) {
        if (answersChecked) {
          return;
        }
        const cardEl = ui.draggable.get(0);
        const zoneEl = this;
        $(zoneEl).removeClass("is-hover");
        if (!cardEl) {
          return;
        }

        detachFromZone(cardEl);
        const zoneId = zoneEl.dataset.zoneId;
        const existing = placements.get(zoneId);
        if (existing && existing !== cardEl) {
          detachFromZone(existing);
          resetCardPosition(existing);
          wordsColumn.appendChild(existing);
        }

        const placeholder = zoneEl.querySelector(".word-match-placeholder");
        placeholder?.classList.add("is-hidden");
        zoneEl.appendChild(cardEl);
        resetCardPosition(cardEl);
        cardEl.dataset.assignedZone = zoneId;
        zoneEl.classList.add("is-filled");
        placements.set(zoneId, cardEl);
      },
    });

    $(wordsColumn).droppable({
      accept: ".word-match-card",
      tolerance: "intersect",
      drop(_, ui) {
        if (answersChecked) {
          return;
        }
        const cardEl = ui.draggable.get(0);
        if (!cardEl) {
          return;
        }
        detachFromZone(cardEl);
        resetCardPosition(cardEl);
        wordsColumn.appendChild(cardEl);
      },
    });
  };

  let playbackCount = 0;
  let isPlaying = false;

  const audioElement = audioUrl ? new Audio(audioUrl) : null;

  const handleAudioError = () => {
    isPlaying = false;
    status.textContent = "Unable to play audio.";
    updateButtonState();
  };

  const handleAudioEnded = () => {
    isPlaying = false;
    playbackCount = Math.min(2, playbackCount + 1);
    updatePlaybackStatus();
    updateButtonState();
  };

  if (audioElement) {
    audioElement.addEventListener("ended", handleAudioEnded);
    audioElement.addEventListener("error", handleAudioError);
  }

  const beginPlayback = () => {
    if (
      !audioElement ||
      instructionsLocked ||
      isPlaying ||
      playbackCount >= 2
    ) {
      return;
    }

    try {
      audioElement.currentTime = 0;
    } catch {
      /* ignore */
    }

    isPlaying = true;
    updatePlaybackStatus({ isStarting: true });
    updateButtonState();

    const playPromise = audioElement.play();
    if (playPromise?.catch) {
      playPromise.catch(handleAudioError);
    }
  };

  const updatePlaybackStatus = ({ isStarting = false } = {}) => {
    if (instructionsLocked) {
      status.textContent = "Please listen to the instructions first.";
      return;
    }
    if (!audioElement) {
      status.textContent = "Audio not available.";
      return;
    }
    if (answersChecked) {
      status.textContent = "Responses submitted.";
      return;
    }
    if (isPlaying || isStarting) {
      status.textContent =
        playbackCount > 0 ? "Replaying audio..." : "Playing...";
      return;
    }
    if (playbackCount >= 2) {
      status.textContent = "Audio played twice.";
      return;
    }
    status.textContent =
      playbackCount === 0
        ? "Audio can be played twice."
        : `You can play ${2 - playbackCount} more time(s).`;
  };

  const updateButtonState = () => {
    if (!audioUrl) {
      playBtn.disabled = true;
      playBtn.textContent = "Audio unavailable";
    } else if (instructionsLocked) {
      playBtn.disabled = true;
      playBtn.textContent = "Start";
    } else if (isPlaying) {
      playBtn.disabled = true;
      playBtn.textContent =
        playbackCount > 0 ? "Replaying audio..." : "Playing...";
    } else if (playbackCount >= 2) {
      playBtn.disabled = true;
      playBtn.textContent = "Playback finished";
    } else {
      playBtn.disabled = false;
      playBtn.textContent = "Start";
    }

    submitBtn.disabled =
      answersChecked ||
      isPlaying ||
      instructionsLocked ||
      !items.length;
  };

  updateButtonState();
  clearEvaluationState();
  updatePlaybackStatus();

  playBtn.addEventListener("click", () => {
    if (isPlaying || playbackCount >= 2) {
      return;
    }
    beginPlayback();
  });

  submitBtn.addEventListener("click", () => {
    checkAnswers();
  });

  slide.addEventListener("instructionstatechange", (event) => {
    instructionsLocked = Boolean(event.detail?.locked);
    if (instructionsLocked) {
      setInteractionsEnabled(false);
    } else if (!answersChecked) {
      setInteractionsEnabled(true);
    }
    updatePlaybackStatus();
    updateButtonState();
  });

  const onEnter = () => {
    setupInteractions();
  };

  const onLeave = () => {
    if (audioElement) {
      audioElement.pause();
      audioElement.currentTime = 0;
    }
    playbackCount = 0;
    isPlaying = false;
    status.textContent = "";
    answersChecked = false;
    updateButtonState();
    resetMatching();
  };

  resetMatching();

  return [
    {
      id: context.key ? `${context.key}-matching` : "activity-matching",
      element: slide,
      onEnter,
      onLeave,
    },
  ];
};
