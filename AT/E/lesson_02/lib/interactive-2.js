import {
  createGameScene,
  DEFAULT_FEEDBACK_ASSETS,
  sanitizeOptions,
  normalizeExamples,
  normalizeQuestions,
} from "./games/game-1.js";

const GAME_INSTRUCTION_TEXT =
  "Press Start to play. Listen to each sentence and choose the correct answer before time runs out.";

const trimText = (value) => (typeof value === "string" ? value.trim() : "");

const deriveSubActivityLetter = (key, index = 0) => {
  if (typeof key === "string") {
    const match = /activity[_-]?([a-z])/i.exec(key);
    if (match) {
      return match[1].toLowerCase();
    }
  }
  if (Number.isInteger(index)) {
    const code = 97 + index;
    if (code >= 97 && code <= 122) {
      return String.fromCharCode(code);
    }
  }
  return "";
};

const buildSlideId = (activityNumber, letter = "") => {
  const suffix = letter ? `-${letter}` : "";
  if (activityNumber) {
    return `activity-${activityNumber}${suffix}-game1`;
  }
  return `activity${suffix}-game1`;
};

const formatActivityLabel = (activityNumber, letter = "") => {
  if (activityNumber) {
    return letter
      ? `Activity ${activityNumber}${letter}`
      : `Activity ${activityNumber}`;
  }
  return letter ? `Game ${letter}` : "Game";
};

const insertFocusElement = (titleEl, focusText) => {
  const trimmed = trimText(focusText);
  if (!trimmed || !titleEl) {
    return;
  }
  const focusEl = document.createElement("p");
  focusEl.className = "activity-focus";
  focusEl.innerHTML = `<span class="activity-focus__label">Focus</span>${trimmed}`;
  titleEl.insertAdjacentElement("afterend", focusEl);
};

const cloneFeedbackAssets = () => ({ ...DEFAULT_FEEDBACK_ASSETS });

const createGameSlide = (gameConfig = {}, context = {}) => {
  const { slideId, activityLabel, focusText, includeFocus } = context;

  const slide = document.createElement("section");
  slide.className = "slide game-slide";
  if (slideId) {
    slide.id = slideId;
  }

  const title = document.createElement("h2");
  title.textContent = trimText(activityLabel) || "Game";
  slide.appendChild(title);

  if (includeFocus && focusText) {
    insertFocusElement(title, focusText);
  }

  const instruction = document.createElement("p");
  instruction.className = "slide__instruction";
  instruction.textContent = GAME_INSTRUCTION_TEXT;
  slide.appendChild(instruction);

  const wrapper = document.createElement("div");
  wrapper.className = "game1-shell";

  const stage = document.createElement("div");
  stage.className = "game1-stage";
  const stageId = `game1-stage-${Math.random().toString(36).slice(2, 8)}`;
  stage.id = stageId;
  stage.style.position = stage.style.position || "relative";
  stage.style.overflow = stage.style.overflow || "hidden";

  const stageSurface = document.createElement("div");
  stageSurface.className = "game1-stage__surface";
  const stageSurfaceId = `${stageId}-surface`;
  stageSurface.id = stageSurfaceId;
  stage.appendChild(stageSurface);

  const lockOverlay = document.createElement("div");
  lockOverlay.className = "game1-stage__overlay";
  lockOverlay.setAttribute("aria-hidden", "true");
  lockOverlay.innerHTML = `
    <div class="game1-stage__overlay-content">
      <p class="game1-stage__overlay-text">
        Listen to the instructions first. The Start button unlocks when the audio finishes.
      </p>
      <div class="game1-stage__overlay-indicator" aria-hidden="true"></div>
    </div>
  `;
  lockOverlay.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();
  });
  stage.appendChild(lockOverlay);

  const status = document.createElement("p");
  status.className = "game1-status is-visible";
  status.textContent = "Loading game...";

  wrapper.append(stage, status);
  slide.appendChild(wrapper);

  const options = sanitizeOptions(gameConfig?.options);
  const examples = normalizeExamples(gameConfig?.examples, options);
  const questions = normalizeQuestions(gameConfig?.content, options);
  const feedbackAssets = cloneFeedbackAssets();
  const backgroundImage =
    gameConfig?.bg_image ?? gameConfig?.backgroundImage ?? null;

  if (!questions.length) {
    status.textContent = "The game content is not ready yet.";
    return {
      id: slideId,
      element: slide,
      onEnter: () => {},
      onLeave: () => {},
    };
  }

  let gameInstance = null;
  let slideRef = null;
  let overlayMonitorHandle = null;
  let overlayVisible = false;

  const requestFrame = (callback) => {
    if (
      typeof window !== "undefined" &&
      typeof window.requestAnimationFrame === "function"
    ) {
      return window.requestAnimationFrame(callback);
    }
    return setTimeout(callback, 16);
  };

  const cancelFrame = (handle) => {
    if (handle == null) {
      return;
    }
    if (
      typeof window !== "undefined" &&
      typeof window.cancelAnimationFrame === "function"
    ) {
      window.cancelAnimationFrame(handle);
      return;
    }
    clearTimeout(handle);
  };

  const stopOverlayMonitor = () => {
    if (overlayMonitorHandle !== null) {
      cancelFrame(overlayMonitorHandle);
      overlayMonitorHandle = null;
    }
  };

  const showOverlay = () => {
    if (overlayVisible) {
      return;
    }
    overlayVisible = true;
    lockOverlay.classList.add("is-active");
  };

  const hideOverlay = () => {
    if (!overlayVisible) {
      lockOverlay.classList.remove("is-active");
      return;
    }
    overlayVisible = false;
    lockOverlay.classList.remove("is-active");
  };

  const monitorInstructionComplete = () => {
    if (!slideRef || !lockOverlay.isConnected) {
      hideOverlay();
      stopOverlayMonitor();
      return;
    }
    if (slideRef._instructionComplete) {
      hideOverlay();
      stopOverlayMonitor();
      return;
    }
    overlayMonitorHandle = requestFrame(monitorInstructionComplete);
  };

  const enforceInstructionOverlay = () => {
    if (!slideRef || slideRef._instructionComplete) {
      hideOverlay();
      stopOverlayMonitor();
      return;
    }
    showOverlay();
    stopOverlayMonitor();
    overlayMonitorHandle = requestFrame(monitorInstructionComplete);
  };

  const getPhaser = () => window?.Phaser;

  const startGame = () => {
    enforceInstructionOverlay();
    const PhaserLib = getPhaser();
    if (!PhaserLib) {
      status.textContent =
        "Phaser library is missing. Please reload the lesson.";
      status.classList.add("is-error");
      return;
    }

    if (gameInstance) {
      gameInstance.destroy(true);
      gameInstance = null;
      stageSurface.innerHTML = "";
    }

    status.textContent = "Loading game...";
    status.classList.remove("is-error");
    status.classList.remove("is-transparent");
    status.classList.add("is-visible");

    const GameScene = createGameScene({
      options,
      examples,
      questions,
      feedbackAssets,
      backgroundImage,
      statusElement: status,
      onRoundUpdate: (info) => {
        if (info.mode === "examples") {
          status.textContent = `Example ${info.exampleIndex + 1} of ${
            info.exampleTotal
          } - Watch and listen`;
          status.classList.remove("is-transparent");
        } else if (info.mode === "questions") {
          status.textContent = `Question ${info.questionIndex + 1} of ${
            info.questionTotal
          } - Score ${info.score}/${info.total}`;
          status.classList.add("is-transparent");
        }
        status.classList.add("is-visible");
      },
    });

    gameInstance = new PhaserLib.Game({
      type: PhaserLib.AUTO,
      parent: stageSurfaceId,
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
      stageSurface.innerHTML = "";
    }
    hideOverlay();
    stopOverlayMonitor();
    status.textContent = "Game paused. Reopen this slide to play again.";
    status.classList.remove("is-transparent");
    status.classList.remove("is-error");
    status.classList.add("is-visible");
  };

  const slideDefinition = {
    id: slideId,
    element: slide,
    onEnter: startGame,
    onLeave: () => {
      destroyGame();
    },
  };

  slideRef = slideDefinition;

  return slideDefinition;
};

const collectGameActivities = (activityData = {}) => {
  const content = activityData?.content;
  const baseOptions = activityData?.options;
  const baseExamples = activityData?.examples;
  const legacyQuestions = Array.isArray(content) ? content : [];
  const defaultBackground =
    activityData?.bg_image ?? activityData?.backgroundImage ?? null;

  if (content && typeof content === "object" && !Array.isArray(content)) {
    return Object.entries(content)
      .map(([key, value], index) => {
        if (!value || typeof value !== "object") {
          return null;
        }
        const letter = deriveSubActivityLetter(key, index);
        return {
          key,
          letter,
          data: {
            options: value.options ?? baseOptions,
            examples: value.examples ?? baseExamples,
            content: Array.isArray(value.content)
              ? value.content
              : Array.isArray(value.questions)
              ? value.questions
              : legacyQuestions,
            bg_image: value.bg_image ?? value.backgroundImage ?? defaultBackground,
          },
        };
      })
      .filter(Boolean);
  }

  if (legacyQuestions.length) {
    return [
      {
        key: "activity_a",
        letter: "a",
        data: {
          options: baseOptions,
          examples: baseExamples,
          content: legacyQuestions,
          bg_image: defaultBackground,
        },
      },
    ];
  }

  return [];
};

export const buildInteractive2Slides = (activityData = {}, context = {}) => {
  const { activityNumber, focus } = context;
  const focusText = trimText(focus);
  const activities = collectGameActivities(activityData);

  if (!activities.length) {
    return [
      createGameSlide(
        { content: [] },
        {
          slideId: buildSlideId(activityNumber, ""),
          activityLabel: formatActivityLabel(activityNumber, ""),
          focusText,
          includeFocus: Boolean(focusText),
        }
      ),
    ];
  }

  return activities.map((activity, index) =>
    createGameSlide(activity.data, {
      slideId: buildSlideId(activityNumber, activity.letter),
      activityLabel: formatActivityLabel(activityNumber, activity.letter),
      focusText,
      includeFocus: Boolean(focusText) && index === 0,
    })
  );
};
