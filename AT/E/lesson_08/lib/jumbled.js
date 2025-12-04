const normalizeText = (value) =>
  typeof value === "string" ? value.trim() : "";

const normalizeId = (raw, index, prefix) => {
  const normalized = normalizeText(raw);
  if (normalized.length) {
    return normalized;
  }
  return `${prefix}_${index + 1}`;
};

const shuffleArray = (items = []) => {
  const clone = items.slice();
  for (let i = clone.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [clone[i], clone[j]] = [clone[j], clone[i]];
  }
  return clone;
};

const tokenizeSentence = (sentence) => {
  const normalized = normalizeText(sentence).toLowerCase();
  const matches = normalized.match(/[a-z0-9']+|[.?]/g);
  return matches ? matches : [];
};

const normalizeSentences = (raw = []) =>
  (Array.isArray(raw) ? raw : [])
    .map((entry, index) => {
      const sentence = normalizeText(entry?.sentence || entry?.text);
      if (!sentence) {
        return null;
      }
      const tokens = tokenizeSentence(sentence);
      if (tokens.length < 2) {
        return null;
      }
      return {
        id: normalizeId(entry?.id, index, "jumbled"),
        tokens,
        display: sentence,
      };
    })
    .filter(Boolean);

const createHeading = (context = {}) => {
  if (context.activityNumber) {
    return `Activity ${context.activityNumber}`;
  }
  return "Activity";
};

const resultMessage = (element, correct, total) => {
  if (!element) {
    return;
  }
  if (!total) {
    element.textContent = "";
    return;
  }
  element.textContent = `Score: ${correct} / ${total}`;
  element.classList.toggle("assessment-result--success", correct === total);
  element.classList.toggle("assessment-result--error", correct !== total);
};

const buildTokenElement = (tokenId, label) => {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "jumbled-token";
  button.draggable = true;
  button.dataset.tokenId = tokenId;
  button.dataset.tokenLabel = label;
  button.textContent = label;
  return button;
};

const ensureScrambledIds = (answerIds) => {
  const shuffled = shuffleArray(answerIds);
  const identical = shuffled.every((id, index) => id === answerIds[index]);
  if (identical && shuffled.length > 1) {
    [shuffled[0], shuffled[1]] = [shuffled[1], shuffled[0]];
  }
  return shuffled;
};

const createPlaceholder = (text) => {
  const placeholder = document.createElement("p");
  placeholder.className = "jumbled-placeholder";
  placeholder.textContent = text;
  return placeholder;
};

const updatePlaceholder = (container, placeholder) => {
  if (!placeholder) {
    return;
  }
  const hasTokens = container.querySelector(".jumbled-token");
  placeholder.hidden = Boolean(hasTokens);
};

export const buildJumbledSlides = (
  activityData = {},
  context = {},
  assessment = {}
) => {
  const sentences = normalizeSentences(activityData?.content);
  const slide = document.createElement("section");
  slide.className = "slide slide--assessment slide--jumbled";

  const heading = document.createElement("h2");
  heading.textContent = createHeading(context);
  slide.appendChild(heading);

  const grid = document.createElement("div");
  grid.className = "jumbled-grid";
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

  const questionEntries = sentences.map((question, index) => {
    const card = document.createElement("article");
    card.className = "dialogue-card jumbled-card";

    const title = document.createElement("h3");
    title.className = "dialogue-card__title";
    title.textContent = `Sentence ${index + 1}`;
    card.appendChild(title);

    const instructions = document.createElement("p");
    instructions.className = "dialogue-card__line";
    instructions.textContent = "Drag and drop the words to build the sentence.";
    card.appendChild(instructions);

    const layout = document.createElement("div");
    layout.className = "jumbled-layout";
    card.appendChild(layout);

    const targetWrapper = document.createElement("div");
    targetWrapper.className = "jumbled-zone jumbled-zone--target";
    const targetLabel = document.createElement("p");
    targetLabel.className = "jumbled-label";
    targetLabel.textContent = "Arrange here";
    targetWrapper.appendChild(targetLabel);
    const target = document.createElement("div");
    target.className = "jumbled-target";
    target.dataset.questionId = question.id;
    const targetPlaceholder = createPlaceholder("Drop words here");
    target.appendChild(targetPlaceholder);
    targetWrapper.appendChild(target);
    layout.appendChild(targetWrapper);

    const bankWrapper = document.createElement("div");
    bankWrapper.className = "jumbled-zone jumbled-zone--bank";
    const bankLabel = document.createElement("p");
    bankLabel.className = "jumbled-label";
    bankLabel.textContent = "Word bank";
    bankWrapper.appendChild(bankLabel);
    const bank = document.createElement("div");
    bank.className = "jumbled-bank";
    bankWrapper.appendChild(bank);
    layout.appendChild(bankWrapper);

    const feedback = document.createElement("p");
    feedback.className = "jumbled-feedback";
    feedback.textContent = "";
    card.appendChild(feedback);

    const tokenMap = new Map();
    const answerIds = [];

    question.tokens.forEach((tokenText, tokenIndex) => {
      const tokenId = `${question.id}_${tokenIndex}`;
      const element = buildTokenElement(tokenId, tokenText);
      tokenMap.set(tokenId, { id: tokenId, text: tokenText, element });
      answerIds.push(tokenId);
    });

    const entry = {
      question,
      card,
      target,
      bank,
      tokens: tokenMap,
      answerIds,
      feedback,
      locked: false,
      placeholder: targetPlaceholder,
      activeTokenId: null,
    };
    entry.updateInteractivity = () => {
      const disabled = instructionsLocked || entry.locked;
      entry.tokens.forEach((token) => {
        token.element.draggable = !disabled;
        token.element.classList.toggle("is-disabled", disabled);
        token.element.tabIndex = disabled ? -1 : 0;
      });
    };

    const moveToken = (token, destination, beforeNode = null) => {
      if (!token || !destination) {
        return;
      }
      if (beforeNode) {
        destination.insertBefore(token.element, beforeNode);
      } else {
        destination.appendChild(token.element);
      }
      updatePlaceholder(entry.target, entry.placeholder);
    };

    const handleDrop = (event, destination) => {
      if (entry.locked || instructionsLocked) {
        return;
      }
      event.preventDefault();
      const tokenId =
        event.dataTransfer.getData("text/plain") || entry.activeTokenId;
      const token = tokenMap.get(tokenId);
      if (!token) {
        return;
      }
      const beforeToken = event.target.closest(".jumbled-token");
      if (beforeToken && beforeToken.parentElement === destination) {
        moveToken(token, destination, beforeToken);
      } else {
        moveToken(token, destination);
      }
    };

    [target, bank].forEach((zone) => {
      zone.addEventListener("dragover", (event) => {
        if (entry.locked) {
          return;
        }
        event.preventDefault();
        event.dataTransfer.dropEffect = "move";
      });
      zone.addEventListener("drop", (event) => handleDrop(event, zone));
    });

    tokenMap.forEach((token) => {
      const el = token.element;
      el.addEventListener("dragstart", (event) => {
        if (entry.locked || instructionsLocked) {
          event.preventDefault();
          return;
        }
        entry.activeTokenId = token.id;
        event.dataTransfer.setData("text/plain", token.id);
        event.dataTransfer.effectAllowed = "move";
        el.classList.add("is-dragging");
      });
      el.addEventListener("dragend", () => {
        entry.activeTokenId = null;
        el.classList.remove("is-dragging");
      });
      el.addEventListener("click", () => {
        if (entry.locked || instructionsLocked) {
          return;
        }
        const parent = el.parentElement;
        if (parent === entry.target) {
          moveToken(token, entry.bank);
        } else {
          moveToken(token, entry.target);
        }
      });
    });

    const scrambled = ensureScrambledIds(answerIds);
    scrambled.forEach((tokenId) => {
      const token = tokenMap.get(tokenId);
      if (token) {
        entry.bank.appendChild(token.element);
      }
    });

    entry.updateInteractivity();
    updatePlaceholder(entry.target, entry.placeholder);
    grid.appendChild(card);
    return entry;
  });

  registerActivity({ total: questionEntries.length });

  if (!questionEntries.length) {
    const empty = document.createElement("p");
    empty.className = "empty-state";
    empty.textContent = "Sentences will be added soon.";
    grid.appendChild(empty);
    submitBtn.disabled = true;
    return [
      {
        id: context.key ? `${context.key}-jumbled` : "activity-jumbled",
        element: slide,
      },
    ];
  }

  const evaluateEntry = (entry) => {
    const arranged = Array.from(
      entry.target.querySelectorAll(".jumbled-token")
    ).map((el) => el.dataset.tokenId);
    const isComplete = arranged.length === entry.answerIds.length;
    const isCorrect =
      isComplete &&
      arranged.every((tokenId, index) => tokenId === entry.answerIds[index]);
    entry.locked = true;
    entry.card.classList.toggle("is-correct", isCorrect);
    entry.card.classList.toggle("is-incorrect", !isCorrect);
    entry.tokens.forEach((token) => {
      token.element.draggable = false;
      token.element.classList.add("is-locked");
    });
    const sentenceText =
      typeof entry.question.display === "string"
        ? entry.question.display
        : "";
    entry.feedback.textContent = isCorrect
      ? sentenceText
        ? `Correct! Sentence: ${sentenceText}`
        : "Correct!"
      : sentenceText
      ? `Incorrect. Correct answer: ${sentenceText}`
      : "Incorrect.";
    entry.feedback.classList.toggle("jumbled-feedback--positive", isCorrect);
    entry.feedback.classList.toggle("jumbled-feedback--negative", !isCorrect);
    return { isCorrect, arranged };
  };

  const handleSubmit = () => {
    const incomplete = questionEntries.some((entry) => {
      const count = entry.target.querySelectorAll(".jumbled-token").length;
      return count !== entry.answerIds.length;
    });
    if (incomplete) {
      resultEl.textContent = "Arrange every sentence before submitting.";
      resultEl.classList.add("assessment-result--error");
      return;
    }

    let correctCount = 0;
    const detail = { assembled: {} };

    questionEntries.forEach((entry) => {
      const { isCorrect, arranged } = evaluateEntry(entry);
      if (isCorrect) {
        correctCount += 1;
      }
      detail.assembled[entry.question.id] = arranged;
    });

    submissionLocked = true;
    refreshInteractivity();
    submitBtn.textContent = "Submitted";
    submitResult({
      total: questionEntries.length,
      correct: correctCount,
      detail,
      timestamp: new Date().toISOString(),
    });
    resultMessage(resultEl, correctCount, questionEntries.length);
  };

  const applySavedState = () => {
    let correctCount = 0;
    questionEntries.forEach((entry) => {
      const arrangement = Array.isArray(savedDetail?.assembled?.[entry.question.id])
        ? savedDetail.assembled[entry.question.id]
        : [];
      const arrangedIds = [];
      arrangement.forEach((tokenId) => {
        const token = entry.tokens.get(tokenId);
        if (token) {
          entry.target.appendChild(token.element);
          arrangedIds.push(token.id);
        }
      });
      entry.tokens.forEach((token) => {
        if (!arrangedIds.includes(token.id)) {
          entry.bank.appendChild(token.element);
        }
      });
      updatePlaceholder(entry.target, entry.placeholder);
      const { isCorrect } = evaluateEntry(entry);
      if (isCorrect) {
        correctCount += 1;
      }
    });
    submissionLocked = true;
    refreshInteractivity();
    submitBtn.textContent = "Submitted";
    resultMessage(resultEl, correctCount, questionEntries.length);
  };

  const refreshInteractivity = () => {
    questionEntries.forEach((entry) => entry.updateInteractivity?.());
    const noQuestions = !questionEntries.length;
    submitBtn.disabled =
      instructionsLocked || submissionLocked || noQuestions;
  };

  if (savedState?.submitted) {
    applySavedState();
  } else {
    submitBtn.addEventListener("click", handleSubmit);
  }

  slide.addEventListener("instructionstatechange", (event) => {
    instructionsLocked = Boolean(event.detail?.locked);
    refreshInteractivity();
  });

  refreshInteractivity();

  const slideId = context.key ? `${context.key}-jumbled` : "activity-jumbled";
  return [
    {
      id: slideId,
      element: slide,
    },
  ];
};
