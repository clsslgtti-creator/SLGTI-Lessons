const DEFAULT_BACKGROUND_IMAGE = "assets/img/game/bg-1.jpg";

const trimText = (value) => (typeof value === "string" ? value.trim() : "");

const clampDuration = (value, fallback) => {
  const numericValue = Number(value);
  if (!Number.isFinite(numericValue) || numericValue <= 0) {
    return fallback;
  }
  return Math.min(numericValue, 60000);
};

export const DEFAULT_PRACTICE_TIMINGS = {
  buildMs: 5000,
  responseMs: 10000,
  revealMs: 5000,
  betweenMs: 1200,
};

export const sanitizePracticeTimings = (rawTimings = {}) => {
  if (!rawTimings || typeof rawTimings !== "object") {
    return { ...DEFAULT_PRACTICE_TIMINGS };
  }
  return {
    buildMs: clampDuration(rawTimings.buildMs, DEFAULT_PRACTICE_TIMINGS.buildMs),
    responseMs: clampDuration(
      rawTimings.responseMs,
      DEFAULT_PRACTICE_TIMINGS.responseMs
    ),
    revealMs: clampDuration(
      rawTimings.revealMs,
      DEFAULT_PRACTICE_TIMINGS.revealMs
    ),
    betweenMs: clampDuration(
      rawTimings.betweenMs,
      DEFAULT_PRACTICE_TIMINGS.betweenMs
    ),
  };
};

const buildAudioKey = (prefix, id) =>
  `${prefix}_${String(id || "")
    .replace(/\s+/g, "_")
    .toLowerCase()}`;

export const normalizePracticeItems = (items = []) => {
  if (!Array.isArray(items)) {
    return [];
  }
  return items
    .map((item, index) => {
      if (!item || typeof item !== "object") {
        return null;
      }
      const id = item.id || `practice_${index + 1}`;
      const words = trimText(item.words);
      const question = trimText(item.txt_question);
      const answer = trimText(item.txt_answer);
      const questionAudio =
        typeof item.audio_question === "string" &&
        item.audio_question.trim().length
          ? item.audio_question.trim()
          : null;
      const answerAudio =
        typeof item.audio_answer === "string" &&
        item.audio_answer.trim().length
          ? item.audio_answer.trim()
          : null;
      if (!words && !question && !answer) {
        return null;
      }
      return {
        id,
        words,
        question,
        answer,
        questionAudio,
        answerAudio,
        questionAudioKey: questionAudio ? buildAudioKey("practice_q", id) : null,
        answerAudioKey: answerAudio ? buildAudioKey("practice_a", id) : null,
      };
    })
    .filter(Boolean);
};

export const normalizePracticeExamples = (items = []) =>
  normalizePracticeItems(items);

export const normalizePracticePrompts = (items = []) =>
  normalizePracticeItems(items);

const createRoundedPanel = (
  scene,
  width,
  height,
  radius = 24,
  initialStyle = {}
) => {
  const graphics = scene.add.graphics();
  const style = {
    fillColor: 0xffffff,
    fillAlpha: 1,
    strokeColor: 0x2563eb,
    strokeAlpha: 0.35,
    lineWidth: 3,
    ...initialStyle,
  };

  const redraw = (nextStyle = {}) => {
    Object.assign(style, nextStyle);
    graphics.clear();
    if (style.lineWidth > 0) {
      graphics.lineStyle(style.lineWidth, style.strokeColor, style.strokeAlpha);
    }
    graphics.fillStyle(style.fillColor, style.fillAlpha);
    graphics.fillRoundedRect(-width / 2, -height / 2, width, height, radius);
    if (style.lineWidth > 0) {
      graphics.strokeRoundedRect(-width / 2, -height / 2, width, height, radius);
    }
  };

  redraw();

  return {
    graphics,
    update: redraw,
    getStyle: () => ({ ...style }),
  };
};

const createButton = (scene, label, width, height, options = {}) => {
  const { onClick, colors = {} } = options;
  const baseColor = colors.base ?? 0x2563eb;
  const hoverColor = colors.hover ?? 0x1d4ed8;
  const disabledColor = colors.disabled ?? 0x94a3b8;

  const background = scene.add.rectangle(0, 0, width, height, baseColor, 1);
  background.setStrokeStyle(4, 0x1e40af, 0.8);
  background.setOrigin(0.5);

  const text = scene.add
    .text(0, 0, label, {
      fontFamily: 'Segoe UI, "Helvetica Neue", Arial, sans-serif',
      fontSize: 28,
      fontStyle: "bold",
      color: "#ffffff",
    })
    .setOrigin(0.5);

  const container = scene.add.container(0, 0, [background, text]);
  container.setSize(width, height);
  container.setInteractive({ useHandCursor: true });

  container.on("pointerover", () => {
    if (container.getData("disabled")) {
      return;
    }
    background.fillColor = hoverColor;
  });
  container.on("pointerout", () => {
    if (container.getData("disabled")) {
      return;
    }
    background.fillColor = baseColor;
  });
  container.on("pointerdown", () => {
    if (container.getData("disabled")) {
      return;
    }
    background.fillColor = hoverColor;
  });
  container.on("pointerup", () => {
    if (container.getData("disabled")) {
      return;
    }
    background.fillColor = baseColor;
    if (typeof onClick === "function") {
      onClick();
    }
  });

  const setDisabled = (disabled) => {
    container.setData("disabled", disabled);
    if (disabled) {
      background.fillColor = disabledColor;
      container.disableInteractive();
    } else {
      background.fillColor = baseColor;
      container.setInteractive({ useHandCursor: true });
    }
  };

  return {
    container,
    text,
    setDisabled,
    setLabel: (value) => text.setText(value),
  };
};

export const createPracticeGameScene = (config = {}) => {
  const {
    examples = [],
    prompts = [],
    backgroundImage,
    timings,
    statusElement,
    onRoundUpdate,
  } = config;

  const sanitizedTimings = sanitizePracticeTimings(timings);

  class PracticeGameScene extends Phaser.Scene {
    constructor() {
      super("PracticeGameScene");
      this.shouldAutoStart = false;
      this.resetState();
    }

    init(data = {}) {
      this.shouldAutoStart = Boolean(data.autoStart);
      this.resetState();
    }

    resetState() {
      this.examples = Array.isArray(examples) ? [...examples] : [];
      this.prompts = Array.isArray(prompts) ? [...prompts] : [];
      this.timings = { ...sanitizedTimings };
      this.currentExampleIndex = -1;
      this.currentPromptIndex = -1;
      this.countdownShown = this.examples.length === 0;
      this.stageTimerEvent = null;
      this.stageTimerEndsAt = 0;
      this.stageTimerLabel = "";
      this.pendingEvents = [];
      this.countdownEvents = [];
      this.countdownActive = false;
      this.sessionComplete = false;
      this.activeAudio = null;
      this.activeAudioToken = 0;
      this.activeAudioCompleteHandler = null;
      this.currentRound = null;
      this.stagePhase = "idle";
    }

    preload() {
      const bgAsset =
        typeof backgroundImage === "string" && backgroundImage.trim().length
          ? backgroundImage.trim()
          : DEFAULT_BACKGROUND_IMAGE;

      this.load.once("complete", () => {
        if (!statusElement) {
          return;
        }
        statusElement.textContent = "Press Start to practice.";
        statusElement.classList.add("is-visible");
        statusElement.classList.remove("is-error");
        statusElement.classList.remove("is-transparent");
      });

      [...this.examples, ...this.prompts].forEach((entry) => {
        if (entry?.questionAudioKey && entry.questionAudio) {
          this.load.audio(entry.questionAudioKey, entry.questionAudio);
        }
        if (entry?.answerAudioKey && entry.answerAudio) {
          this.load.audio(entry.answerAudioKey, entry.answerAudio);
        }
      });

      this.load.image("practice-bg", bgAsset);
    }

    create() {
      this.cameras.main.setBackgroundColor("#eef2f9");
      this.events.once(Phaser.Scenes.Events.SHUTDOWN, this.shutdown, this);
      this.events.once(Phaser.Scenes.Events.DESTROY, this.shutdown, this);
      const gameSize = this.scale?.gameSize;
      const width =
        gameSize?.width ?? this.sys.game.config.width ?? this.sys.game.canvas.width;
      const height =
        gameSize?.height ?? this.sys.game.config.height ?? this.sys.game.canvas.height;

      this.backgroundImage = this.add
        .image(width / 2, height / 2, "practice-bg")
        .setOrigin(0.5);
      this.backgroundImage.setDepth(0);
      this.backgroundImage.setDisplaySize(width, height);

      const accentLeft = this.add.circle(
        width * 0.2,
        height * 0.85,
        160,
        0x2563eb,
        0.08
      );
      const accentRight = this.add.circle(
        width * 0.82,
        height * 0.2,
        200,
        0x0ea5e9,
        0.08
      );
      accentLeft.setBlendMode(Phaser.BlendModes.SCREEN);
      accentRight.setBlendMode(Phaser.BlendModes.SCREEN);

      this.phaseText = this.add
        .text(width / 2, 36, "Practice Ready", {
          fontFamily: 'Segoe UI, "Helvetica Neue", Arial, sans-serif',
          fontSize: 36,
          fontStyle: "bold",
          color: "#0f172a",
        })
        .setOrigin(0.5);

      const timerPanel = createRoundedPanel(this, 220, 64, 20, {
        fillColor: 0xffffff,
        fillAlpha: 0.92,
        strokeColor: 0x2563eb,
        strokeAlpha: 0.35,
        lineWidth: 3,
      });
      this.timerText = this.add
        .text(0, 0, "", {
          fontFamily: 'Segoe UI, "Helvetica Neue", Arial, sans-serif',
          fontSize: 26,
          fontStyle: "bold",
          color: "#1d4ed8",
        })
        .setOrigin(0.5);
      this.timerBadge = this.add
        .container(width - 150, 100, [timerPanel.graphics, this.timerText])
        .setDepth(2);

      const cardWidth = 980;
      const cardHeight = 360;
      const cardPanel = createRoundedPanel(this, cardWidth, cardHeight, 32, {
        fillColor: 0xffffff,
        fillAlpha: 0.98,
        strokeColor: 0x93c5fd,
        strokeAlpha: 0.45,
        lineWidth: 4,
      });
      this.cardLabel = this.add
        .text(0, -cardHeight / 2 + 24, "", {
          fontFamily: 'Segoe UI, "Helvetica Neue", Arial, sans-serif',
          fontSize: 26,
          color: "#1d4ed8",
          fontStyle: "bold",
        })
        .setOrigin(0.5, 0);
      this.cardText = this.add
        .text(0, 20, "", {
          fontFamily: 'Segoe UI, "Helvetica Neue", Arial, sans-serif',
          fontSize: 34,
          color: "#0f172a",
          align: "center",
          lineSpacing: 10,
          wordWrap: { width: cardWidth - 60 },
        })
        .setOrigin(0.5);
      this.cardContainer = this.add
        .container(width / 2, height / 2 + 20, [
          cardPanel.graphics,
          this.cardLabel,
          this.cardText,
        ])
        .setDepth(2);

      this.instructionText = this.add
        .text(width / 2, height - 90, "Press Start to begin.", {
          fontFamily: 'Segoe UI, "Helvetica Neue", Arial, sans-serif',
          fontSize: 28,
          color: "#0f172a",
        })
        .setOrigin(0.5);

      this.startButton = createButton(
        this,
        "Start Practice",
        320,
        88,
        {
          onClick: () => this.handleStartPressed(false),
        }
      );
      this.startButton.container.setPosition(width / 2, height - 180);
      this.startButton.container.setDepth(3);

      this.countdownBackdrop = this.add
        .rectangle(0, 0, width, height, 0x0f172a, 0.55)
        .setOrigin(0)
        .setAlpha(0);
      this.countdownText = this.add
        .text(width / 2, height / 2, "", {
          fontFamily: 'Segoe UI, "Helvetica Neue", Arial, sans-serif',
          fontSize: 128,
          fontStyle: "bold",
          color: "#ffffff",
        })
        .setOrigin(0.5)
        .setAlpha(0);
      this.countdownOverlay = this.add.container(0, 0, [
        this.countdownBackdrop,
        this.countdownText,
      ]);
      this.countdownOverlay.setDepth(5);

      if (this.shouldAutoStart) {
        this.time.delayedCall(750, () => this.handleStartPressed(true));
      }
    }

    update() {
      if (!this.timerText) {
        return;
      }
      if (this.stageTimerEndsAt > 0) {
        const remaining = Math.max(
          0,
          this.stageTimerEndsAt - this.time.now
        );
        this.timerText.setText(
          this.stageTimerLabel
            ? `${this.stageTimerLabel}: ${(remaining / 1000).toFixed(1)}s`
            : `${(remaining / 1000).toFixed(1)}s`
        );
      } else {
        this.timerText.setText("");
      }
    }

    handleStartPressed(autoStart) {
      if (!this.prompts.length) {
        if (statusElement) {
          statusElement.textContent = "Practice content is not available.";
          statusElement.classList.add("is-error");
          statusElement.classList.add("is-visible");
        }
        return;
      }

      this.sessionComplete = false;
      this.startButton.setDisabled(true);
      this.startButton.container.setVisible(false);
      this.currentExampleIndex = -1;
      this.currentPromptIndex = -1;
      this.countdownShown = this.examples.length === 0;
      this.stagePhase = "words";
      this.phaseText.setText("Practice Starting");
      this.instructionText.setText("Get ready. First example is loading...");
      if (!autoStart && statusElement) {
        statusElement.textContent = "Practice running...";
        statusElement.classList.remove("is-error");
        statusElement.classList.add("is-visible");
        statusElement.classList.add("is-transparent");
      }
      this.stopStageTimer();
      this.cancelPendingEvents();
      this.stopActiveAudio();
      this.hideCountdown(true);
      this.runNextStep();
    }

    runNextStep() {
      if (this.sessionComplete) {
        return;
      }
      this.stopStageTimer();
      this.stopActiveAudio();
      this.stagePhase = "words";

      if (
        this.examples.length &&
        this.currentExampleIndex < this.examples.length - 1
      ) {
        this.currentExampleIndex += 1;
        const entry = this.examples[this.currentExampleIndex];
        this.presentRound(entry, {
          mode: "examples",
          index: this.currentExampleIndex,
          total: this.examples.length,
        });
        return;
      }

      if (this.examples.length && !this.countdownShown) {
        this.countdownShown = true;
        this.playCountdown(() => this.runNextStep());
        return;
      }

      if (
        this.prompts.length &&
        this.currentPromptIndex < this.prompts.length - 1
      ) {
        this.currentPromptIndex += 1;
        const entry = this.prompts[this.currentPromptIndex];
        this.presentRound(entry, {
          mode: "practice",
          index: this.currentPromptIndex,
          total: this.prompts.length,
        });
        return;
      }

      this.finishSession();
    }

    presentRound(entry, context) {
      this.currentRound = { entry, context };
      const labelPrefix =
        context.mode === "examples" ? "Example" : "Question";
      this.phaseText.setText(
        `${labelPrefix} ${context.index + 1} of ${context.total}`
      );
      this.phaseText.setColor(
        context.mode === "examples" ? "#0f172a" : "#1d4ed8"
      );
      this.cardContainer.setAlpha(1);
      this.cardLabel.setText("Create a question");
      this.cardText.setText(
        entry.words || entry.question || "Prepare a question."
      );
      this.instructionText.setText(
        "Use these words to make a yes/no question. You have 5 seconds."
      );
      this.stagePhase = "words";
      this.emitRoundUpdate({ ...context, phase: "words" });

      this.startStageTimer(this.timings.buildMs, () => {
        this.showQuestionStage(entry, context);
      }, "Prep");
    }

    showQuestionStage(entry, context) {
      this.stagePhase = "question";
      this.cardLabel.setText("Model question");
      this.cardText.setText(
        entry.question || "Listen to the modeled question."
      );
      this.instructionText.setText(
        "Check your question, then answer it aloud before time is up."
      );
      this.emitRoundUpdate({ ...context, phase: "question" });
      this.playEntryAudio(entry, "question");
      this.startStageTimer(this.timings.responseMs, () => {
        this.showAnswerStage(entry, context);
      }, "Answer");
    }

    showAnswerStage(entry, context) {
      this.stagePhase = "answer";
      this.cardLabel.setText("Model answer");
      this.cardText.setText(
        entry.answer || "Think of a suitable short answer."
      );
      this.instructionText.setText("Compare your answer with the model one.");
      this.emitRoundUpdate({ ...context, phase: "answer" });
      this.playEntryAudio(entry, "answer");
      this.startStageTimer(this.timings.revealMs, () => {
        this.scheduleEvent(this.timings.betweenMs, () => this.runNextStep());
      }, "Next");
    }

    playEntryAudio(entry, type) {
      const key =
        type === "question" ? entry.questionAudioKey : entry.answerAudioKey;
      const audioPath =
        type === "question" ? entry.questionAudio : entry.answerAudio;
      if (!key || !audioPath) {
        this.stopActiveAudio();
        return;
      }
      const sound = this.sound.get(key) ?? this.sound.add(key);
      if (!sound) {
        return;
      }
      this.stopActiveAudio();
      const token = (this.activeAudioToken += 1);
      this.activeAudio = sound;
      this.activeAudioCompleteHandler = () => {
        if (this.activeAudioToken === token) {
          this.activeAudio = null;
          this.activeAudioCompleteHandler = null;
        }
      };
      sound.once(
        Phaser.Sound.Events.COMPLETE,
        this.activeAudioCompleteHandler
      );
      sound.play();
    }

    startStageTimer(duration, onComplete, label) {
      this.stopStageTimer();
      this.stageTimerLabel = label || "";
      this.stageTimerEndsAt = this.time.now + duration;
      this.stageTimerEvent = this.time.delayedCall(duration, () => {
        this.stageTimerEvent = null;
        this.stageTimerEndsAt = 0;
        if (typeof onComplete === "function" && !this.sessionComplete) {
          onComplete();
        }
      });
    }

    stopStageTimer() {
      if (this.stageTimerEvent) {
        this.stageTimerEvent.remove(false);
        this.stageTimerEvent = null;
      }
      this.stageTimerEndsAt = 0;
    }

    scheduleEvent(delay, callback) {
      const event = this.time.delayedCall(delay, () => {
        this.pendingEvents = this.pendingEvents.filter((item) => item !== event);
        if (!this.sessionComplete && typeof callback === "function") {
          callback();
        }
      });
      this.pendingEvents.push(event);
      return event;
    }

    cancelPendingEvents() {
      this.pendingEvents.forEach((event) => event.remove(false));
      this.pendingEvents = [];
    }

    playCountdown(onComplete) {
      this.hideCountdown(true);
      this.countdownActive = true;
      if (this.countdownOverlay) {
        this.countdownOverlay.setVisible(true);
        this.countdownOverlay.setAlpha(1);
      }
      if (this.countdownBackdrop) {
        this.countdownBackdrop.setAlpha(0.55);
      }
      if (this.countdownText) {
        this.countdownText.setAlpha(1);
      }
      const steps = ["3", "2", "1", "Start"];

      const runStep = (index) => {
        if (!this.countdownActive) {
          return;
        }
        const value = steps[index] || "";
        this.countdownText.setText(value);
        this.emitRoundUpdate({
          mode: "countdown",
          phase: "countdown",
          countdownValue: value,
        });
        if (index >= steps.length - 1) {
          const finalize = this.time.delayedCall(700, () => {
            this.countdownActive = false;
            this.hideCountdown(true);
            if (typeof onComplete === "function") {
              onComplete();
            }
          });
          this.countdownEvents.push(finalize);
          return;
        }
        const event = this.time.delayedCall(800, () => runStep(index + 1));
        this.countdownEvents.push(event);
      };

      runStep(0);
    }

    hideCountdown(stopEvents) {
      if (stopEvents) {
        this.countdownEvents.forEach((event) => event.remove(false));
        this.countdownEvents = [];
      }
      this.countdownActive = false;
      if (this.countdownOverlay) {
        this.countdownOverlay.setVisible(false);
        this.countdownOverlay.setAlpha(0);
      }
      if (this.countdownBackdrop) {
        this.countdownBackdrop.setAlpha(0);
      }
      if (this.countdownText) {
        this.countdownText.setAlpha(0);
        this.countdownText.setText("");
      }
    }

    finishSession() {
      this.sessionComplete = true;
      this.stopStageTimer();
      this.cancelPendingEvents();
      this.stopActiveAudio();
      this.cardLabel.setText("Practice complete");
      this.cardText.setText(
        "Great job! Press Replay to practise again with the same prompts."
      );
      this.instructionText.setText("");
      this.phaseText.setText("Session complete");
      this.startButton.setLabel("Replay Practice");
      this.startButton.setDisabled(false);
      this.startButton.container.setVisible(true);
      if (statusElement) {
        statusElement.textContent =
          "Practice finished. Press Replay to continue.";
        statusElement.classList.remove("is-transparent");
        statusElement.classList.add("is-visible");
      }
      this.emitRoundUpdate({ mode: "complete" });
    }

    stopActiveAudio() {
      if (this.activeAudio && this.activeAudioCompleteHandler) {
        this.activeAudio.off(
          Phaser.Sound.Events.COMPLETE,
          this.activeAudioCompleteHandler
        );
      }
      if (this.activeAudio && this.activeAudio.isPlaying) {
        this.activeAudio.stop();
      }
      this.activeAudio = null;
      this.activeAudioCompleteHandler = null;
      this.activeAudioToken += 1;
    }

    emitRoundUpdate(info) {
      if (typeof onRoundUpdate === "function") {
        onRoundUpdate(info);
      }
    }

    shutdown() {
      this.stopStageTimer();
      this.cancelPendingEvents();
      this.hideCountdown(true);
      this.stopActiveAudio();
    }
  }

  return PracticeGameScene;
};
