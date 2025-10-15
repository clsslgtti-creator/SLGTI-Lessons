const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

const sanitizeOptions = (rawOptions = []) => {
  if (!Array.isArray(rawOptions)) {
    return [];
  }
  const trimmed = rawOptions
    .map((option) => (typeof option === "string" ? option.trim() : ""))
    .filter((option) => option.length);
  if (trimmed.length >= 2) {
    return trimmed.slice(0, 2);
  }
  if (trimmed.length === 1) {
    return [trimmed[0], "Option B"];
  }
  return ["Option A", "Option B"];
};

const normalizeExamples = (rawExamples = [], options) => {
  if (!Array.isArray(rawExamples)) {
    return [];
  }
  return rawExamples
    .map((item, index) => {
      const sentence =
        typeof item?.sentence === "string" ? item.sentence.trim() : "";
      if (!sentence.length) {
        return null;
      }
      const answerCandidate =
        typeof item?.answer === "string" ? item.answer.trim() : "";
      const answer = options.includes(answerCandidate)
        ? answerCandidate
        : options[0];
      return {
        id: item?.id ?? `example_${index + 1}`,
        sentence,
        answer,
      };
    })
    .filter(Boolean);
};

const isMobileDevice = () => {
  if (typeof navigator === "undefined") {
    return false;
  }
  const ua = (navigator.userAgent || "").toLowerCase();
  const hasTouch =
    (typeof window !== "undefined" && "ontouchstart" in window) ||
    navigator.maxTouchPoints > 1 ||
    navigator.msMaxTouchPoints > 1;
  return (
    hasTouch &&
    /android|webos|iphone|ipad|ipod|blackberry|iemobile|opera mini|mobile/i.test(
      ua
    )
  );
};

const normalizeQuestions = (rawQuestions = [], options) => {
  if (!Array.isArray(rawQuestions)) {
    return [];
  }
  return rawQuestions
    .map((item, index) => {
      const sentence =
        typeof item?.sentence === "string" ? item.sentence.trim() : "";
      if (!sentence.length) {
        return null;
      }
      const audio =
        typeof item?.audio === "string" && item.audio.trim().length
          ? item.audio.trim()
          : null;
      const answerCandidate =
        typeof item?.answer === "string" ? item.answer.trim() : "";
      const answer = options.includes(answerCandidate)
        ? answerCandidate
        : options[0];
      const identifier = item?.id ?? `question_${index + 1}`;
      const audioKey = audio ? `sentence_${identifier}` : null;
      return {
        id: identifier,
        sentence,
        answer,
        audio,
        audioKey,
      };
    })
    .filter(Boolean);
};

const DEFAULT_FEEDBACK_ASSETS = {
  correctAudio: "assets/audio/game/correct.wav",
  incorrectAudio: "assets/audio/game/incorrect.wav",
  timeoutAudio: "assets/audio/game/timeout.wav",
  correctImg: "assets/img/game/correct.png",
  incorrectImg: "assets/img/game/incorrect.png",
  timeoutImg: "assets/img/game/timeout.png",
};

const createFeedbackPlayer = () => {
  const playTone = (frequency = 440, durationMs = 300) => {
    if (!window.AudioContext && !window.webkitAudioContext) {
      return;
    }
    const Ctx = window.AudioContext || window.webkitAudioContext;
    const context = new Ctx();
    const oscillator = context.createOscillator();
    const gainNode = context.createGain();
    oscillator.type = "sine";
    oscillator.frequency.value = frequency;
    gainNode.gain.setValueAtTime(0.0001, context.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.1, context.currentTime + 0.02);
    gainNode.gain.exponentialRampToValueAtTime(
      0.0001,
      context.currentTime + durationMs / 1000
    );
    oscillator.connect(gainNode);
    gainNode.connect(context.destination);
    oscillator.start();
    oscillator.stop(context.currentTime + durationMs / 1000 + 0.05);
    oscillator.addEventListener("ended", () => {
      context.close().catch(() => {});
    });
  };

  return {
    playTone,
  };
};

const createRoundedPanel = (
  scene,
  width,
  height,
  radius = 24,
  initialStyle = {}
) => {
  const graphics = scene.add.graphics();
  const state = {
    fillColor: 0xffffff,
    fillAlpha: 1,
    strokeColor: 0x000000,
    strokeAlpha: 0,
    lineWidth: 0,
    ...initialStyle,
  };

  const redraw = (style = {}) => {
    Object.assign(state, style);
    graphics.clear();
    if (state.lineWidth > 0) {
      graphics.lineStyle(state.lineWidth, state.strokeColor, state.strokeAlpha);
    } else {
      graphics.lineStyle();
    }
    graphics.fillStyle(state.fillColor, state.fillAlpha);
    graphics.fillRoundedRect(-width / 2, -height / 2, width, height, radius);
    if (state.lineWidth > 0) {
      graphics.strokeRoundedRect(
        -width / 2,
        -height / 2,
        width,
        height,
        radius
      );
    }
  };

  redraw();

  return {
    graphics,
    update: redraw,
    getStyle: () => ({ ...state }),
  };
};

const createButtonShadow = (scene, width, height, radius, offset = 6) => {
  const shadow = scene.add.graphics();
  shadow.fillStyle(0x000000, 1);
  shadow.fillRoundedRect(
    -width / 2 + offset,
    -height / 2 + offset,
    width,
    height,
    radius
  );
  shadow.setAlpha(0.5);
  shadow.setDepth(0); // behind the button
  return shadow;
};

const createGameScene = (config) => {
  const {
    options,
    examples,
    questions,
    feedbackAssets,
    statusElement,
    onRoundUpdate,
  } = config;

  const feedbackPlayer = createFeedbackPlayer();

  class GameScene extends Phaser.Scene {
    constructor() {
      super("GameOneScene");
      this.resetState();
      this.runState = "idle";
      this.shouldAutoStart = false;
      this.startButton = null;
      this.fullscreenButton = null;
      this.baseCanvasStyle = null;
      this.baseParentStyle = null;
      this.backgroundImage = null;
      this.orientationLocked = false;
      this.scaleListenersAttached = false;
      this.exitButton = null;
      this.exitPanel = null;
    }

    init(data = {}) {
      this.resetState();
      this.runState = "idle";
      this.shouldAutoStart = Boolean(data.autoStart);
    }

    resetState() {
      this.examples = examples;
      this.questions = questions;
      this.options = options;
      this.feedbackAssets = feedbackAssets;
      this.exampleIndex = -1;
      this.questionIndex = -1;
      this.countdownShown = !examples.length;
      this.awaitingAnswer = false;
      this.score = 0;
      this.totalQuestions = questions.length;
      this.timerEvent = null;
      this.answerDeadline = 0;
      this.activeSentenceSound = null;
      this.gameOver = false;
      this.didNotifyReady = false;
      this.summaryDisplayed = false;
      this.orientationLocked = false;
    }

    preload() {
      this.load.once("complete", () => {
        if (!this.shouldAutoStart) {
          statusElement.textContent = "Press Start to play.";
          statusElement.classList.add("is-visible");
          statusElement.classList.remove("is-error");
          statusElement.classList.remove("is-transparent");
        } else {
          statusElement.textContent = "";
          statusElement.classList.remove("is-visible");
          statusElement.classList.remove("is-error");
          statusElement.classList.remove("is-transparent");
        }
      });
      this.load.on("loaderror", (file) => {
        console.error("error loading :", file);
      });

      this.questions.forEach((item) => {
        if (item.audioKey && item.audio) {
          this.load.audio(item.audioKey, item.audio);
        }
      });
      if (this.feedbackAssets.correctAudio) {
        this.load.audio(
          "feedback-correct-audio",
          this.feedbackAssets.correctAudio
        );
      }
      if (this.feedbackAssets.incorrectAudio) {
        this.load.audio(
          "feedback-incorrect-audio",
          this.feedbackAssets.incorrectAudio
        );
      }
      if (this.feedbackAssets.timeoutAudio) {
        this.load.audio(
          "feedback-timeout-audio",
          this.feedbackAssets.timeoutAudio
        );
      }
      if (this.feedbackAssets.correctImg) {
        this.load.image("feedback-correct-img", this.feedbackAssets.correctImg);
      }
      if (this.feedbackAssets.incorrectImg) {
        this.load.image(
          "feedback-incorrect-img",
          this.feedbackAssets.incorrectImg
        );
      }
      if (this.feedbackAssets.timeoutImg) {
        this.load.image("feedback-timeout-img", this.feedbackAssets.timeoutImg);
      }

      this.load.image("timer-img", "assets/img/game/timer.png");
      this.load.image("bg-img", "assets/img/game/bg.jpg");
    }

    create() {
      this.sound.add('feedback-correct-audio')
      this.sound.add('feedback-incorrect-audio')
      this.sound.add('feedback-timeout-audio')  
      const { width, height } = this.sys.game.canvas;
      this.cameras.main.setBackgroundColor("#eef2f9");
      this.events.once(Phaser.Scenes.Events.SHUTDOWN, this.shutdown, this);
      this.events.once(Phaser.Scenes.Events.DESTROY, this.shutdown, this);
      this.gameUiElements = [];

      const baseWidth =
        this.scale.gameSize?.width ?? this.sys.game.config.width ?? width;
      const baseHeight =
        this.scale.gameSize?.height ?? this.sys.game.config.height ?? height;
      this.backgroundImage = this.add
        .image(baseWidth / 2, baseHeight / 2, "bg-img")
        .setOrigin(0.5);
      this.backgroundImage.setDepth(0);
      this.backgroundImage.setScrollFactor(0);
      this.updateBackgroundSize(baseWidth, baseHeight);

      const accentLeft = this.add.circle(
        width * 0.18,
        height * 0.82,
        clamp(width * 0.16, 120, 180),
        0x1f6feb,
        0.08
      );
      accentLeft.setBlendMode(Phaser.BlendModes.SCREEN);
      accentLeft.setDepth(0.5);
      this.gameUiElements.push(accentLeft);

      const accentRight = this.add.circle(
        width * 0.82,
        height * 0.26,
        clamp(width * 0.18, 130, 210),
        0xf0ab00,
        0.08
      );
      accentRight.setBlendMode(Phaser.BlendModes.SCREEN);
      accentRight.setDepth(0.5);
      this.gameUiElements.push(accentRight);

      const accentStripe = this.add.rectangle(
        width / 2,
        height - clamp(height * 0.12, 120, 160),
        width * 0.86,
        12,
        0x1f6feb,
        0.06
      );
      accentStripe.setDepth(1);
      this.gameUiElements.push(accentStripe);

      const topBar = createRoundedPanel(this, width * 0.82, 120, 28);
      topBar.update({
        fillColor: 0xffffff,
        fillAlpha: 0.85,
        strokeColor: 0x93c5fd,
        strokeAlpha: 0.18,
        lineWidth: 2,
      });
      topBar.graphics.setPosition(width / 2, 90);
      topBar.graphics.setDepth(2);
      this.gameUiElements.push(topBar.graphics);

      this.phaseText = this.add
        .text(width / 2, 70, "Examples", {
          fontFamily: 'Segoe UI, "Helvetica Neue", Arial, sans-serif',
          fontSize: "34px",
          color: "#0f172a",
          fontStyle: "bold",
          letterSpacing: 0.6,
        })
        .setOrigin(0.5, 0);
      this.phaseText.setDepth(3);
      this.gameUiElements.push(this.phaseText);

      const badgeHeight = clamp(height * 0.1, 58, 68);
      const timerBadgeWidth = clamp(width * 0.2, 160, 200);
      this.timerPanel = createRoundedPanel(
        this,
        timerBadgeWidth,
        badgeHeight,
        20
      );
      this.timerPanel.graphics.setPosition(50, -16);
      this.timerPanelBaseStyle = {
        fillColor: 0x1f6feb,
        fillAlpha: 0.12,
        strokeColor: 0x1f6feb,
        strokeAlpha: 0.24,
        lineWidth: 2,
      };
      this.timerPanelActiveStyle = {
        fillColor: 0x1f6feb,
        fillAlpha: 0.18,
        strokeColor: 0x1d4ed8,
        strokeAlpha: 0.42,
        lineWidth: 2,
      };
      this.timerPanel.update(this.timerPanelBaseStyle);
      this.timerText = this.add
        .text(50, -16, "", {
          fontFamily: 'Segoe UI, "Helvetica Neue", Arial, sans-serif',
          fontSize: "26px",
          color: "#1d4ed8",
          fontStyle: "bold",
        })
        .setOrigin(0.5);
      this.timerBadge = this.add.container(timerBadgeWidth / 2 + 90, 108, [
        this.timerPanel.graphics,
        this.timerText,
      ]);
      this.timerBadge.setDepth(3);
      this.gameUiElements.push(this.timerBadge);

      const scoreBadgeWidth = clamp(width * 0.2, 160, 200);
      this.scorePanel = createRoundedPanel(
        this,
        scoreBadgeWidth,
        badgeHeight,
        20
      );
      this.scorePanel.graphics.setPosition(-50, -16);
      this.scorePanelStyle = {
        fillColor: 0x1f6feb,
        fillAlpha: 0.12,
        strokeColor: 0x1f6feb,
        strokeAlpha: 0.24,
        lineWidth: 2,
      };
      this.scorePanel.update(this.scorePanelStyle);
      this.scoreText = this.add
        .text(-50, -16, `Score: 0/${this.totalQuestions}`, {
          fontFamily: 'Segoe UI, "Helvetica Neue", Arial, sans-serif',
          fontSize: "26px",
          color: "#1d4ed8",
          fontStyle: "bold",
        })
        .setOrigin(0.5);
      this.scoreBadge = this.add.container(
        width - scoreBadgeWidth / 2 - 90,
        108,
        [this.scorePanel.graphics, this.scoreText]
      );
      this.scoreBadge.setDepth(3);
      this.gameUiElements.push(this.scoreBadge);
      this.updateScore();
      this.updateTimerText("Time: 10.0s");

      const sentenceCardWidth = clamp(width * 0.78, 640, 980);
      const sentenceCardHeight = clamp(height * 0.32, 180, 240);
      this.sentenceCardWidth = sentenceCardWidth;
      this.sentenceCardHeight = sentenceCardHeight;
      const sentencePanel = createRoundedPanel(
        this,
        sentenceCardWidth,
        sentenceCardHeight,
        32
      );
      sentencePanel.update({
        fillColor: 0xffffff,
        fillAlpha: 0.98,
        strokeColor: 0x93c5fd,
        strokeAlpha: 0.32,
        lineWidth: 4,
      });
      this.sentencePanel = sentencePanel;

      this.sentenceText = this.add
        .text(0, 0, "", {
          fontFamily: 'Segoe UI, "Helvetica Neue", Arial, sans-serif',
          fontSize: clamp(width * 0.032, 26, 34),
          color: "#111827",
          align: "center",
          wordWrap: { width: sentenceCardWidth - 40 },
        })
        .setOrigin(0.5);

      this.sentenceCard = this.add.container(-sentenceCardWidth, height / 2, [
        sentencePanel.graphics,
        this.sentenceText,
      ]);
      this.gameUiElements.push(this.sentenceCard);

      this.feedbackBackdrop = this.add.rectangle(
        width / 2,
        height / 2,
        width,
        height,
        0x0f172a,
        0.3
      );
      this.feedbackBackdrop.setAlpha(0);
      this.feedbackBackdrop.setDepth(8);
      this.feedbackBackdrop.setVisible(false);

      this.feedbackGroup = this.add.container(
        width / 2,
        height / 2 + sentenceCardHeight / 2
      );
      this.feedbackGroup.setAlpha(0);
      this.feedbackGroup.setDepth(9);

      const feedbackPanel = createRoundedPanel(
        this,
        clamp(width * 0.42, 260, 420),
        120,
        28
      );
      feedbackPanel.update({
        fillColor: 0xffffff,
        fillAlpha: 0.98,
        strokeColor: 0x1f2933,
        strokeAlpha: 0.15,
        lineWidth: 3,
      });
      this.feedbackPanel = feedbackPanel;

      this.feedbackIcon = this.add.image(-120, 0, "").setScale(0.8);
      this.feedbackLabel = this.add
        .text(20, 0, "", {
          fontFamily: 'Segoe UI, "Helvetica Neue", Arial, sans-serif',
          fontSize: clamp(width * 0.026, 22, 30),
          color: "#1f2933",
          fontStyle: "bold",
        })
        .setOrigin(0.5);

      this.feedbackGroup.add([
        feedbackPanel.graphics,
        this.feedbackIcon,
        this.feedbackLabel,
      ]);

      this.countdownOverlay = this.add.container(width / 2, height / 2);
      const overlayBg = this.add.rectangle(
        0,
        0,
        width * 0.6,
        height * 0.6,
        0x000000,
        0.55
      );
      overlayBg.setOrigin(0.5);
      this.countdownText = this.add
        .text(0, 0, "", {
          fontFamily: 'Segoe UI, "Helvetica Neue", Arial, sans-serif',
          fontSize: clamp(width * 0.12, 80, 140),
          color: "#ffffff",
          fontStyle: "bold",
        })
        .setOrigin(0.5);
      this.countdownOverlay.add([overlayBg, this.countdownText]);
      this.countdownOverlay.setAlpha(0);

      this.summaryBackdrop = this.add.rectangle(
        width / 2,
        height / 2,
        width,
        height,
        0x0f172a,
        0.45
      );
      this.summaryBackdrop.setVisible(false);
      this.summaryBackdrop.setAlpha(0);
      this.summaryBackdrop.setDepth(18);

      this.summaryOverlay = this.add.container(width / 2, height / 2);
      this.summaryOverlay.setDepth(19);
      const summaryPanel = createRoundedPanel(
        this,
        clamp(width * 0.68, 520, 760),
        clamp(height * 0.6, 420, 520),
        36
      );
      summaryPanel.update({
        fillColor: 0xffffff,
        fillAlpha: 0.98,
        strokeColor: 0x93c5fd,
        strokeAlpha: 0.28,
        lineWidth: 4,
      });
      this.summaryPanel = summaryPanel;

      this.summaryTitle = this.add
        .text(0, -120, "Great Job!", {
          fontFamily: 'Segoe UI, "Helvetica Neue", Arial, sans-serif',
          fontSize: clamp(width * 0.04, 32, 42),
          color: "#1f2933",
          fontStyle: "bold",
        })
        .setOrigin(0.5);

      this.summaryBody = this.add
        .text(0, -40, "", {
          fontFamily: 'Segoe UI, "Helvetica Neue", Arial, sans-serif',
          fontSize: clamp(width * 0.028, 22, 28),
          color: "#1f2933",
          align: "center",
          wordWrap: { width: clamp(width * 0.5, 360, 540) },
        })
        .setOrigin(0.5);

      const replayWidth = clamp(width * 0.26, 240, 320);
      const replayHeight = 86;
      const buttonRowY = clamp(height * 0.22, 90, 150);
      const buttonOffset = clamp(width * 0.22, 120, 180);

      const replayContainer = this.add.container(-buttonOffset, buttonRowY);
      const replayPanel = createRoundedPanel(
        this,
        replayWidth,
        replayHeight,
        replayHeight / 2
      );
      replayPanel.update({
        fillColor: 0x1f6feb,
        fillAlpha: 1,
        strokeColor: 0x1748ad,
        strokeAlpha: 0.9,
        lineWidth: 0,
      });
      const replayLabel = this.add
        .text(0, 0, "Replay", {
          fontFamily: 'Segoe UI, "Helvetica Neue", Arial, sans-serif',
          fontSize: clamp(width * 0.028, 22, 28),
          color: "#ffffff",
          fontStyle: "bold",
        })
        .setOrigin(0.5);
      replayContainer.add([replayPanel.graphics, replayLabel]);
      replayContainer.setSize(replayWidth, replayHeight);
      replayContainer.setInteractive({ useHandCursor: true });
      replayContainer.on("pointerover", () => {
        this.input.setDefaultCursor("pointer");
        replayPanel.update({
          fillColor: 0x1748ad,
          fillAlpha: 1,
          strokeColor: 0x0f2d75,
          strokeAlpha: 0.9,
          lineWidth: 0,
        });
      });
      replayContainer.on("pointerout", () => {
        this.input.setDefaultCursor("default");
        replayPanel.update({
          fillColor: 0x1f6feb,
          fillAlpha: 1,
          strokeColor: 0x1748ad,
          strokeAlpha: 0.9,
          lineWidth: 0,
        });
      });
      replayContainer.on("pointerdown", () => {
        this.restartGame(true);
      });
      this.replayButton = replayContainer;
      this.replayPanel = replayPanel;

      const exitContainer = this.add.container(buttonOffset, buttonRowY);
      const exitPanel = createRoundedPanel(
        this,
        replayWidth,
        replayHeight,
        replayHeight / 2
      );
      exitPanel.update({
        fillColor: 0x334155,
        fillAlpha: 1,
        strokeColor: 0x1f2937,
        strokeAlpha: 0.9,
        lineWidth: 0,
      });
      const exitLabel = this.add
        .text(0, 0, "Exit", {
          fontFamily: 'Segoe UI, "Helvetica Neue", Arial, sans-serif',
          fontSize: clamp(width * 0.028, 22, 28),
          color: "#ffffff",
          fontStyle: "bold",
        })
        .setOrigin(0.5);
      exitContainer.add([exitPanel.graphics, exitLabel]);
      exitContainer.setSize(replayWidth, replayHeight);
      exitContainer.setInteractive({ useHandCursor: true });
      exitContainer.on("pointerover", () => {
        this.input.setDefaultCursor("pointer");
        exitPanel.update({
          fillColor: 0x1e293b,
          fillAlpha: 1,
          strokeColor: 0x0f172a,
          strokeAlpha: 0.9,
          lineWidth: 0,
        });
      });
      exitContainer.on("pointerout", () => {
        this.input.setDefaultCursor("default");
        exitPanel.update({
          fillColor: 0x334155,
          fillAlpha: 1,
          strokeColor: 0x1f2937,
          strokeAlpha: 0.9,
          lineWidth: 0,
        });
      });
      exitContainer.on("pointerdown", () => {
        this.input.setDefaultCursor("default");
        this.exitToIdleState();
      });
      this.exitButton = exitContainer;
      this.exitPanel = exitPanel;

      this.summaryOverlay.add([
        summaryPanel.graphics,
        this.summaryTitle,
        this.summaryBody,
        replayContainer,
        exitContainer,
      ]);
      this.summaryOverlay.setAlpha(0);
      this.summaryOverlay.setVisible(false);

      this.optionButtons = this.createOptionButtons(
        width,
        height,
        this.options
      );
      this.enableOptionButtons(false);

      this.createCenterStartButton(width, height);
      // this.createBottomBar(width, height);
      this.attachScaleListeners();
      this.prepareIdleState();
      this.scale.on("resize", this.handleResize, this);

      if (this.shouldAutoStart) {
        this.handleStartPressed(true);
      }
    }

    createCenterStartButton(width, height) {
      const buttonWidth = clamp(width * 0.4, 480, 520);
      const buttonHeight = clamp(height * 0.28, 200, 280);

      this.startButton = this.createBarButton(
        "Start",
        buttonWidth,
        buttonHeight,
        {
          onClick: () => this.handleStartPressed(false),
          baseColor: 0x1f6feb,
        }
      );
      this.startButton.container.setPosition(width / 2, height / 2);
      this.startButton.container.setDepth(12);
      this.tweens.add({
        targets: this.startButton.container,
        scale: 1.04,
        duration: 500,
        ease: "Sine.linear",
        repeat: -1,
        yoyo: true,
      });
    }

    createBottomBar(width, height) {
      const barWidth = width;
      const barHeight = 40;
      const barPanel = createRoundedPanel(this, barWidth, barHeight, 0);
      barPanel.update({
        fillColor: 0xffffff,
        fillAlpha: 0.6,
        strokeColor: 0x93c5fd,
        strokeAlpha: 0,
        lineWidth: 3,
      });

      const barContainer = this.add.container(width / 2, height - 20, [
        barPanel.graphics,
      ]);
      barContainer.setDepth(6);
      this.bottomBar = barContainer;
      if (Array.isArray(this.gameUiElements)) {
        this.gameUiElements.push(barContainer);
      }

      const fsWidth = 180;
      this.fullscreenButton = this.createBarButton(
        "Enter Fullscreen",
        fsWidth,
        barHeight - 10,
        {
          onClick: () => this.handleFullscreenToggle(),
          baseColor: 0x0f172a,
        }
      );
      this.fullscreenButton.container.setPosition(
        barWidth / 2 - fsWidth / 2 - 10,
        0
      );
      barContainer.add(this.fullscreenButton.container);

      this.attachScaleListeners();
      this.updateFullscreenLabel();
    }

    attachScaleListeners() {
      if (this.scaleListenersAttached) {
        return;
      }
      this.scale.on("enterfullscreen", this.handleEnterFullscreen, this);
      this.scale.on("leavefullscreen", this.handleLeaveFullscreen, this);
      this.scaleListenersAttached = true;
    }

    updateBackgroundSize(width, height) {
      if (!this.backgroundImage) {
        return;
      }
      const targetWidth =
        width ??
        this.scale.gameSize?.width ??
        this.sys.game.config.width ??
        this.backgroundImage.width;
      const targetHeight =
        height ??
        this.scale.gameSize?.height ??
        this.sys.game.config.height ??
        this.backgroundImage.height;
      this.backgroundImage.setDisplaySize(targetWidth, targetHeight);
      this.backgroundImage.setPosition(targetWidth / 2, targetHeight / 2);
    }

    handleResize(gameSize) {
      const nextWidth =
        gameSize?.width ??
        this.scale.gameSize?.width ??
        this.sys.game.config.width;
      const nextHeight =
        gameSize?.height ??
        this.scale.gameSize?.height ??
        this.sys.game.config.height;
      this.updateBackgroundSize(nextWidth, nextHeight);
    }

    async lockLandscapeOrientation() {
      if (!isMobileDevice() || typeof window === "undefined") {
        return;
      }
      const screenRef = window.screen;
      if (!screenRef) {
        return;
      }
      const orientation = screenRef.orientation;
      if (orientation?.lock) {
        try {
          await orientation.lock("landscape");
          this.orientationLocked = true;
          return;
        } catch (error) {
          this.orientationLocked = false;
        }
      }
      const legacyLock =
        screenRef.lockOrientation ||
        screenRef.mozLockOrientation ||
        screenRef.msLockOrientation;
      if (legacyLock) {
        try {
          legacyLock.call(screenRef, "landscape");
          this.orientationLocked = true;
        } catch (error) {
          this.orientationLocked = false;
        }
      }
    }

    unlockOrientation() {
      if (!this.orientationLocked && !isMobileDevice()) {
        return;
      }
      if (typeof window === "undefined") {
        return;
      }
      const screenRef = window.screen;
      if (!screenRef) {
        return;
      }
      const orientation = screenRef.orientation;
      if (orientation?.unlock) {
        try {
          orientation.unlock();
        } catch (error) {
          // ignore
        }
      }
      const legacyUnlock =
        screenRef.unlockOrientation ||
        screenRef.mozUnlockOrientation ||
        screenRef.msUnlockOrientation;
      if (legacyUnlock) {
        try {
          legacyUnlock.call(screenRef);
        } catch (error) {
          // ignore
        }
      }
      this.orientationLocked = false;
    }

    handleEnterFullscreen() {
      this.updateFullscreenLabel();
      this.lockLandscapeOrientation();
    }

    handleLeaveFullscreen() {
      this.updateFullscreenLabel();
      this.unlockOrientation();
    }

    setGameUiVisible(isVisible) {
      if (!Array.isArray(this.gameUiElements)) {
        return;
      }
      this.gameUiElements.forEach((item) => {
        if (item?.setVisible) {
          item.setVisible(isVisible);
        }
      });
    }

    createBarButton(label, width, height, { onClick, baseColor }) {
      const baseColorObj = Phaser.Display.Color.IntegerToColor(baseColor);
      const hoverColor = Phaser.Display.Color.GetColor(
        Math.min(baseColorObj.red + 25, 255),
        Math.min(baseColorObj.green + 25, 255),
        Math.min(baseColorObj.blue + 25, 255)
      );

      const styles = {
        base: {
          fillColor: baseColor,
          fillAlpha: 1,
          strokeColor: baseColor,
          strokeAlpha: 0.9,
          lineWidth: 0,
        },
        hover: {
          fillColor: hoverColor,
          fillAlpha: 1,
          strokeColor: baseColor,
          strokeAlpha: 0.9,
          lineWidth: 0,
        },
        disabled: {
          fillColor: 0xa1a1aa,
          fillAlpha: 1,
          strokeColor: 0x71717a,
          strokeAlpha: 0.8,
          lineWidth: 0,
        },
      };

      const panel = createRoundedPanel(this, width, height, height / 2);
      panel.update(styles.base);

      const text = this.add
        .text(0, 0, label, {
          fontFamily: 'Segoe UI, "Helvetica Neue", Arial, sans-serif',
          fontSize: clamp(width * 0.3, 72, 100),
          color: "#ffffff",
          fontStyle: "bold",
        })
        .setOrigin(0.5);

      const container = this.add.container(0, 0, [panel.graphics, text]);
      container.setSize(width, height);
      container.setDepth(7);
      container.setInteractive({ useHandCursor: true });
      container.on("pointerover", () => {
        if (container.input?.enabled) {
          panel.update(styles.hover);
        }
      });
      container.on("pointerout", () => {
        if (container.input?.enabled) {
          panel.update(styles.base);
        }
      });
      container.on("pointerdown", () => {
        if (container.input?.enabled && typeof onClick === "function") {
           feedbackPlayer.playTone(640, 240);
          onClick();
        }
      });

      return { container, background: panel, text, styles };
    }

    setStartButtonState(label, disabled = false, visible = true) {
      if (!this.startButton) {
        return;
      }
      this.startButton.text.setText(label);
      this.startButton.container.setVisible(visible);
      if (disabled) {
        this.startButton.container.disableInteractive();
        this.startButton.background.update(this.startButton.styles.disabled);
      } else {
        this.startButton.container.setInteractive({ useHandCursor: true });
        this.startButton.background.update(this.startButton.styles.base);
      }
    }

    updateFullscreenLabel() {
      if (!this.fullscreenButton) {
        return;
      }
      const isFullscreen = this.scale.isFullscreen;
      this.fullscreenButton.text.setText(
        isFullscreen ? "Exit Fullscreen" : "Enter Fullscreen"
      );
      this.fullscreenButton.background.update(
        isFullscreen
          ? this.fullscreenButton.styles.hover
          : this.fullscreenButton.styles.base
      );
    }

    handleFullscreenToggle() {
      if (this.scale.isFullscreen) {
        this.scale.stopFullscreen();
        return;
      }

      const target = this.scale.parent || this.game.canvas;
      this.scale.startFullscreen({ target, navigationUI: "hide" });
    }

    requestFullscreen() {
      if (this.scale.isFullscreen) {
        return;
      }
      const target = this.scale.parent || this.game.canvas;
      try {
        this.scale.startFullscreen({ target, navigationUI: "hide" });
      } catch (error) {
        // Ignore fullscreen initiation errors (user gesture requirements, etc.)
      }
    }

    handleStartPressed(autoStart) {
      if (this.runState === "loading") {
        return;
      }
      if (this.runState === "running" && !autoStart) {
        this.restartGame(true);
        return;
      }

      if (!autoStart) {
        this.requestFullscreen();
      }

      this.runState = "loading";
      this.setStartButtonState("Loading...", true, true);
      this.enableOptionButtons(false);
      this.stopSentenceAudio();
      this.timerEvent?.remove();
      this.timerEvent = null;
      this.hideFeedback();
      this.countdownOverlay.setVisible(false);
      this.countdownOverlay.setAlpha(0);
      this.summaryBackdrop.setVisible(false);
      this.summaryBackdrop.setAlpha(0);
      this.summaryOverlay.setVisible(false);
      this.summaryOverlay.setAlpha(0);
      this.sentenceCard.setAlpha(0);
      this.sentenceCard.x = -this.sys.game.canvas.width;

      if (statusElement) {
        statusElement.textContent = "Preparing game...";
        statusElement.classList.remove("is-error");
        statusElement.classList.remove("is-transparent");
        statusElement.classList.add("is-visible");
      }

      this.resetState();
      this.score = 0;
      this.updateScore();
      this.updateTimerText("Time: 10.0s");

      this.time.delayedCall(120, () => {
        this.runState = "running";
        this.setStartButtonState("Start", false, false);
        this.setGameUiVisible(true);
        this.advance();
      });
    }

    prepareIdleState() {
      this.runState = "idle";
      this.setStartButtonState("Start", false, true);
      this.setGameUiVisible(false);
      this.enableOptionButtons(false);
      this.stopSentenceAudio();
      this.timerEvent?.remove();
      this.timerEvent = null;
      this.updateTimerText("Time: 10.0s");
      this.hideFeedback();
      this.summaryBackdrop.setVisible(false);
      this.summaryBackdrop.setAlpha(0);
      this.summaryOverlay.setVisible(false);
      this.summaryOverlay.setAlpha(0);
      this.countdownOverlay.setVisible(false);
      this.countdownOverlay.setAlpha(0);
      this.sentenceCard.setAlpha(0);
      this.phaseText.setText("Ready to start?");
      this.phaseText.setColor("#0f172a");
      this.score = 0;
      this.updateScore();

      if (statusElement) {
        statusElement.textContent = "Press Start to play.";
        statusElement.classList.remove("is-error");
        statusElement.classList.remove("is-transparent");
        statusElement.classList.add("is-visible");
      }
    }

    createOptionButtons(width, height, options) {
      const buttons = [];
      const buttonWidth = clamp(width * 0.32, 260, 420);
      const buttonHeight = clamp(height * 0.16, 120, 140);
      const horizontalSpacing = clamp(width * 0.26, 220, 320);
      const baseY = height - clamp(height * 0.18, 140, 180);

      options.forEach((label, index) => {
        const xPos =
          width / 2 + (index === 0 ? -horizontalSpacing : horizontalSpacing);
        const container = this.add.container(xPos, baseY);
        container.setDepth(1);
        if (Array.isArray(this.gameUiElements)) {
          this.gameUiElements.push(container);
        }

        const background = createRoundedPanel(
          this,
          buttonWidth,
          buttonHeight,
          28
        );
        const styles = {
          base: {
            fillColor: 0x1f6feb,
            fillAlpha: 0.98,
            strokeColor: 0x1f6feb,
            strokeAlpha: 0.6,
            lineWidth: 4,
          },
          hover: {
            fillColor: 0x1748ad,
            fillAlpha: 0.92,
            strokeColor: 0x1748ad,
            strokeAlpha: 0.92,
            lineWidth: 4,
          },
          disabled: {
            fillColor: 0xe2e8f0,
            fillAlpha: 0.9,
            strokeColor: 0x94a3b8,
            strokeAlpha: 0.45,
            lineWidth: 3,
          },
        };
        background.update(styles.base);

        const text = this.add
          .text(0, 0, label, {
            fontFamily: 'Segoe UI, "Helvetica Neue", Arial, sans-serif',
            fontSize: clamp(width * 0.03, 26, 32),
            color: "#fff",
            align: "center",
            fontStyle: "bold",
            wordWrap: { width: buttonWidth - 40 },
          })
          .setOrigin(0.5);

        container.add([background.graphics, text]);
        container.setSize(buttonWidth, buttonHeight);

        const shadow = createButtonShadow(this, buttonWidth, buttonHeight, 28);
        container.addAt(shadow, 0); // behind background

        container.on("pointerover", () => {
          if (!this.awaitingAnswer || this.gameOver) {
            return;
          }
          this.input.setDefaultCursor("pointer");
          background.update(styles.hover);
          text.setColor("#fff");
          this.tweens.add({
            targets: container,
            scale: 1.04,
            duration: 140,
            ease: "Sine.easeOut",
          });
        });

        container.on("pointerout", () => {
          this.input.setDefaultCursor("default");
          if (!this.awaitingAnswer || this.gameOver) {
            return;
          }
          background.update(styles.base);
          text.setColor("#fff");
          this.tweens.add({
            targets: container,
            scale: 1,
            duration: 120,
            ease: "Sine.easeOut",
          });
        });

        container.on("pointerdown", () => {
          if (!this.awaitingAnswer || this.gameOver) {
            return;
          }
          this.tweens.add({
            targets: container,
            scale: 0.97,
            duration: 90,
            yoyo: true,
            ease: "Sine.easeInOut",
          });
          this.handleAnswer(label);
        });

        buttons.push({
          container,
          background,
          text,
          value: label,
          styles,
        });
      });

      return buttons;
    }

    enableOptionButtons(enabled) {
      if (!enabled) {
        this.input.setDefaultCursor("default");
      }
      this.optionButtons.forEach((button) => {
        if (enabled) {
          button.container.setInteractive();
        } else {
          button.container.disableInteractive();
        }
        button.container.setScale(1);
        button.background.update(
          enabled ? button.styles.base : button.styles.disabled
        );
        button.text.setColor(enabled ? "#fff" : "#475569");
      });
    }

    updateScore() {
      this.scoreText.setText(`Score: ${this.score}/${this.totalQuestions}`);
      const ratio =
        this.totalQuestions > 0 ? this.score / this.totalQuestions : 0;
      if (ratio >= 0.75) {
        this.scorePanel.update({
          fillColor: 0xecfdf5,
          fillAlpha: 1,
          strokeColor: 0x16a34a,
          strokeAlpha: 0.55,
          lineWidth: 3,
        });
        this.scoreText.setColor("#0f766e");
      } else {
        this.scorePanel.update(this.scorePanelStyle);
        this.scoreText.setColor("#1d4ed8");
      }
    }

    advance() {
      if (this.gameOver) {
        return;
      }
      this.awaitingAnswer = false;
      this.enableOptionButtons(false);
      this.stopSentenceAudio();
      this.hideFeedback();
      this.updateTimerText("Time: 10.0s");

      if (
        this.examples.length &&
        this.exampleIndex < this.examples.length - 1
      ) {
        this.exampleIndex += 1;
        const current = this.examples[this.exampleIndex];
        this.showRound(current, true);
        if (typeof onRoundUpdate === "function") {
          onRoundUpdate({
            mode: "examples",
            exampleIndex: this.exampleIndex,
            exampleTotal: this.examples.length,
            score: this.score,
            total: this.totalQuestions,
          });
        }
        return;
      }

      if (this.examples.length && !this.countdownShown) {
        this.countdownShown = true;
        this.showCountdown(() => {
          this.advance();
        });
        return;
      }

      if (this.questionIndex < this.questions.length - 1) {
        this.questionIndex += 1;
        const current = this.questions[this.questionIndex];
        this.showRound(current, false);
        if (typeof onRoundUpdate === "function") {
          onRoundUpdate({
            mode: "questions",
            questionIndex: this.questionIndex,
            questionTotal: this.questions.length,
            score: this.score,
            total: this.totalQuestions,
          });
        }
        return;
      }

      this.finishGame();
    }

    showRound(entry, isExample) {
      const { width } = this.sys.game.canvas;
      const targetX = width / 2;
      this.sentenceCard.x = -width;
      this.sentenceCard.setAlpha(1);
      this.sentenceText.setText(entry.sentence);

      this.phaseText.setText(
        isExample
          ? `Example ${this.exampleIndex + 1} of ${this.examples.length}`
          : `Question ${this.questionIndex + 1} of ${this.questions.length}`
      );
      this.phaseText.setColor(isExample ? "#0f172a" : "#1d4ed8");

      this.tweens.add({
        targets: this.sentenceCard,
        x: targetX,
        duration: 600,
        ease: "Cubic.easeOut",
        onComplete: () => {
          this.playSentenceAudio(entry);
          if (isExample) {
            this.handleExample(entry);
          } else {
            this.awaitingAnswer = true;
            this.enableOptionButtons(true);
            this.startResponseTimer();
          }
        },
      });
    }

    playSentenceAudio(entry) {
      this.stopSentenceAudio();
      if (entry.audioKey) {
        const sound =
          this.sound.get(entry.audioKey) ?? this.sound.add(entry.audioKey);
        if (sound) {
          sound.play();
          sound.setVolume(1); 
          this.activeSentenceSound = sound;
        }
      }
    }

    stopSentenceAudio() {
      if (this.activeSentenceSound && this.activeSentenceSound.isPlaying) {
        this.activeSentenceSound.stop();
      }
      this.activeSentenceSound = null;
    }

    handleExample(entry) {
      const targetButton = this.optionButtons.find(
        (btn) => btn.value.toLowerCase() === entry.answer.toLowerCase()
      );
      this.time.delayedCall(1500, () => {
        if (targetButton) {
          this.pulseButton(targetButton, 0x16a34a);
        }
        this.time.delayedCall(800, () => {
          this.showFeedback("correct", "Correct");
        });
        this.time.delayedCall(1600, () => {
          this.slideOutCurrent(() => this.advance());
        });
      });
    }

    startResponseTimer() {
      const durationMs = 10000;
      const tickInterval = 100;
      let remaining = durationMs;
      this.updateTimerText(`Time: ${(remaining / 1000).toFixed(1)}s`);

      this.timerEvent?.remove();
      this.timerEvent = this.time.addEvent({
        delay: tickInterval,
        loop: true,
        callback: () => {
          remaining -= tickInterval;
          if (remaining <= 0) {
            this.timerEvent?.remove();
            this.timerEvent = null;
            this.updateTimerText("Time: 10.0s");
            this.handleTimeout();
            return;
          }
          this.updateTimerText(`Time: ${(remaining / 1000).toFixed(1)}s`);
        },
      });
    }

    updateTimerText(text) {
      this.timerText.setText(text);
      if (this.timerPanel) {
        if (text) {
          this.timerPanel.update(this.timerPanelActiveStyle);
          this.timerText.setColor("#1d4ed8");
        } else {
          this.timerPanel.update(this.timerPanelBaseStyle);
          this.timerText.setColor("#1f2937");
        }
      }
    }

    handleAnswer(selected) {
      if (!this.awaitingAnswer || this.gameOver) {
        return;
      }
      this.awaitingAnswer = false;
      this.enableOptionButtons(false);
      this.stopSentenceAudio();
      this.timerEvent?.remove();
      this.timerEvent = null;
      this.updateTimerText("Time: 10.0s");

      const current = this.questions[this.questionIndex];
      const isCorrect =
        current && selected.toLowerCase() === current.answer.toLowerCase();
      if (isCorrect) {
        this.score += 1;
        this.updateScore();
        this.playFeedbackSound("correct");
        this.showFeedback("correct", "Correct!");
      } else {
        this.playFeedbackSound("incorrect");
        this.showFeedback("incorrect", "Incorrect");
      }

      const targetButton = this.optionButtons.find(
        (btn) => btn.value.toLowerCase() === selected.toLowerCase()
      );
      if (targetButton) {
        this.pulseButton(targetButton, isCorrect ? 0x16a34a : 0xdc2626);
      }
      if (!isCorrect && current) {
        const correctButton = this.optionButtons.find(
          (btn) => btn.value.toLowerCase() === current.answer.toLowerCase()
        );
        if (correctButton && correctButton !== targetButton) {
          this.time.delayedCall(240, () => {
            this.pulseButton(correctButton, 0x16a34a);
          });
        }
      }

      this.time.delayedCall(1500, () => {
        this.slideOutCurrent(() => this.advance());
      });
    }

    handleTimeout() {
      if (this.gameOver) {
        return;
      }
      this.awaitingAnswer = false;
      this.enableOptionButtons(false);
      this.stopSentenceAudio();
      this.playFeedbackSound("timeout");
      const current = this.questions[this.questionIndex];
      this.showFeedback("timeout", "Time's up!");
      if (current) {
        const correctButton = this.optionButtons.find(
          (btn) => btn.value.toLowerCase() === current.answer.toLowerCase()
        );
        if (correctButton) {
          this.pulseButton(correctButton, 0xf97316);
        }
      }
      this.time.delayedCall(1400, () => {
        this.slideOutCurrent(() => this.advance());
      });
    }

    playFeedbackSound(type) {
      const keyMap = {
        correct: "feedback-correct-audio",
        incorrect: "feedback-incorrect-audio",
        timeout: "feedback-timeout-audio",
      };
      const key = keyMap[type];
      console.log(this.sound.get(key));
      if (key && this.sound.get(key)) {
        this.sound.play(key);
        this.sound.setVolume(1); 
        return;
      }

      if (type === "correct") {
        feedbackPlayer.playTone(640, 240);
      } else if (type === "incorrect") {
        feedbackPlayer.playTone(320, 400);
      } else if (type === "timeout") {
        feedbackPlayer.playTone(260, 400);
      }
    }

    showFeedback(kind, message) {
      const colorMap = {
        correct: 0x16a34a,
        incorrect: 0xdc2626,
        timeout: 0xf97316,
      };
      const borderColor = colorMap[kind] ?? 0x1f2933;
      this.feedbackPanel.update({
        fillColor: 0xffffff,
        fillAlpha: 0.98,
        strokeColor: borderColor,
        strokeAlpha: 0.35,
        lineWidth: 3,
      });
      this.feedbackBackdrop.setVisible(true);
      this.tweens.killTweensOf(this.feedbackBackdrop);
      this.tweens.add({
        targets: this.feedbackBackdrop,
        alpha: 1,
        duration: 200,
        ease: "Sine.easeOut",
      });
      let labelColor = "#1f2933";
      this.feedbackLabel.setText(message);
      if (kind === "correct") {
        this.feedbackIcon.setTexture("feedback-correct-img");
        this.feedbackIcon.setVisible(true);
        labelColor = "#065f46";
      } else if (kind === "incorrect") {
        this.feedbackIcon.setTexture("feedback-incorrect-img");
        this.feedbackIcon.setVisible(true);
        labelColor = "#7f1d1d";
      } else if (kind === "timeout") {
        this.feedbackIcon.setTexture("feedback-timeout-img");
        this.feedbackIcon.setVisible(true);
        labelColor = "#b45309";
      }
      this.feedbackLabel.setColor(labelColor);
      this.tweens.add({
        targets: this.feedbackGroup,
        alpha: 1,
        scale: { from: 0.9, to: 1 },
        duration: 220,
        ease: "Sine.easeOut",
      });
    }

    hideFeedback() {
      this.feedbackGroup.setAlpha(0);
      this.feedbackGroup.setScale(1);
      this.feedbackIcon.setVisible(false);
      this.feedbackPanel.update({
        fillColor: 0xffffff,
        fillAlpha: 0.98,
        strokeColor: 0x1f2933,
        strokeAlpha: 0.15,
        lineWidth: 3,
      });
      this.feedbackLabel.setColor("#1f2933");
      if (this.feedbackBackdrop.visible) {
        this.tweens.killTweensOf(this.feedbackBackdrop);
        this.tweens.add({
          targets: this.feedbackBackdrop,
          alpha: 0,
          duration: 200,
          ease: "Sine.easeInOut",
          onComplete: () => {
            this.feedbackBackdrop.setVisible(false);
          },
        });
      }
    }

    pulseButton(button, color) {
      button.background.update({
        fillColor: color,
        fillAlpha: 1,
        strokeColor: color,
        strokeAlpha: 0.9,
        lineWidth: 4,
      });

      button.text.setColor("#fff");
      this.tweens.add({
        targets: button.container,
        scale: { from: 1, to: 1.06 },
        duration: 140,
        yoyo: true,
        ease: "Sine.easeInOut",
      });
    }

    slideOutCurrent(onComplete) {
      const { width } = this.sys.game.canvas;
      this.tweens.add({
        targets: this.sentenceCard,
        x: width + (this.sentenceCardWidth ?? width * 0.6),
        alpha: 0,
        duration: 520,
        ease: "Cubic.easeIn",
        onComplete: () => {
          if (typeof onComplete === "function") {
            onComplete();
          }
        },
      });
    }

    showCountdown(onComplete) {
      if (statusElement) {
        statusElement.textContent = "Get ready...";
        statusElement.classList.remove("is-transparent");
        statusElement.classList.add("is-visible");
      }
      this.summaryBackdrop.setVisible(false);
      this.summaryBackdrop.setAlpha(0);
      this.countdownOverlay.setAlpha(1);
      this.countdownOverlay.setVisible(true);
      let value = 3;
      this.countdownText.setText(String(value));

      const event = this.time.addEvent({
        delay: 1000,
        repeat: 3,
        callback: () => {
          value -= 1;
          if (value > 0) {
            this.countdownText.setText(String(value));
            feedbackPlayer.playTone(320, 400);
          } else if (value === 0) {
            this.countdownText.setText("Start!");
             feedbackPlayer.playTone(640, 240);
          } else {
            event.remove();
            this.tweens.add({
              targets: this.countdownOverlay,
              alpha: 0,
              duration: 300,
              ease: "Sine.easeInOut",
              onComplete: () => {
                this.countdownOverlay.setVisible(false);
                if (typeof onComplete === "function") {
                  onComplete();
                }
              },
            });
          }
        },
      });
    }

    finishGame() {
      this.gameOver = true;
      this.runState = "finished";
      this.enableOptionButtons(false);
      this.stopSentenceAudio();
      this.timerEvent?.remove();
      this.timerEvent = null;
      this.updateTimerText("Time: 10.0s");
      this.hideFeedback();
      if (statusElement) {
        statusElement.textContent =
          "All sentences complete! Tap Replay to try again or Exit to finish.";
        statusElement.classList.remove("is-transparent");
        statusElement.classList.add("is-visible");
      }
      this.summaryBackdrop.setVisible(false);
      this.summaryBackdrop.setAlpha(0);
      this.summaryBackdrop.setVisible(true);
      this.summaryBackdrop.setAlpha(0);
      this.tweens.killTweensOf(this.summaryBackdrop);
      this.tweens.add({
        targets: this.summaryBackdrop,
        alpha: 1,
        duration: 260,
        ease: "Sine.easeOut",
      });
      this.tweens.add({
        targets: this.sentenceCard,
        alpha: 0,
        duration: 300,
        ease: "Sine.easeInOut",
      });
      this.time.delayedCall(400, () => {
        this.showSummary();
      });
    }

    showSummary() {
      const percentage =
        this.totalQuestions > 0
          ? Math.round((this.score / this.totalQuestions) * 100)
          : 0;
      this.summaryTitle.setText(
        percentage === 100
          ? "Outstanding!"
          : percentage >= 60
          ? "Great Job!"
          : "Keep Practicing!"
      );

      this.summaryBody.setText(
        `You answered ${this.score} out of ${this.totalQuestions} sentences correctly.\nYour score: ${percentage}%`
      );
      this.summaryBackdrop.setVisible(true);
      this.summaryOverlay.setDepth(19);
      this.summaryOverlay.setVisible(true);
      this.tweens.killTweensOf(this.summaryBackdrop);
      this.tweens.add({
        targets: this.summaryBackdrop,
        alpha: 1,
        duration: 280,
        ease: "Sine.easeOut",
      });
      this.tweens.add({
        targets: this.summaryOverlay,
        alpha: 1,
        scale: { from: 0.9, to: 1 },
        duration: 360,
        ease: "Back.easeOut",
      });
    }

    restartGame(autoStart = false) {
      this.sound.stopAll();
      if (statusElement) {
        statusElement.textContent = "Preparing game...";
        statusElement.classList.remove("is-error");
        statusElement.classList.remove("is-transparent");
        statusElement.classList.add("is-visible");
      }
      this.summaryBackdrop.setVisible(false);
      this.summaryBackdrop.setAlpha(0);
      this.scene.restart({ autoStart });
    }

    exitToIdleState() {
      this.sound.stopAll();
      this.stopSentenceAudio();
      this.timerEvent?.remove();
      this.timerEvent = null;
      this.summaryBackdrop.setVisible(false);
      this.summaryBackdrop.setAlpha(0);
      this.summaryOverlay.setVisible(false);
      this.summaryOverlay.setAlpha(0);
      this.shouldAutoStart = false;
      this.resetState();
      this.prepareIdleState();
      if (this.scale.isFullscreen) {
        this.scale.stopFullscreen();
      } else {
        this.unlockOrientation();
      }
    }

    shutdown() {
      this.sound.stopAll();
      this.stopSentenceAudio();
      this.timerEvent?.remove();
      this.timerEvent = null;
      this.input?.setDefaultCursor?.("default");
      this.scale.off("enterfullscreen", this.handleEnterFullscreen, this);
      this.scale.off("leavefullscreen", this.handleLeaveFullscreen, this);
      this.scale.off("resize", this.handleResize, this);
      this.scaleListenersAttached = false;
      this.unlockOrientation();
      this.backgroundImage = null;
      this.setGameUiVisible(false);
      const canvas = this.game?.canvas;
      if (canvas) {
        if (this.baseCanvasStyle) {
          Object.assign(canvas.style, this.baseCanvasStyle);
        } else {
          canvas.style.width = "";
          canvas.style.height = "";
          canvas.style.maxWidth = "";
          canvas.style.maxHeight = "";
          canvas.style.margin = "";
          canvas.style.display = "";
        }
      }
      if (this.scale.parent) {
        if (this.baseParentStyle) {
          Object.assign(this.scale.parent.style, this.baseParentStyle);
        } else {
          this.scale.parent.style.width = "";
          this.scale.parent.style.height = "";
          this.scale.parent.style.maxWidth = "";
          this.scale.parent.style.maxHeight = "";
          this.scale.parent.style.margin = "";
        }
      }
      if (this.baseDimensions) {
        this.scale.resize(
          this.baseDimensions.width,
          this.baseDimensions.height
        );
      }
      this.scale.refresh();
    }
  }

  return GameScene;
};

export const buildGame1Slides = (activityData = {}, context = {}) => {
  const { activityNumber, focus } = context;
  const slide = document.createElement("section");
  slide.className = "slide game-slide";

  const title = document.createElement("h2");
  title.textContent = activityNumber ? `Activity ${activityNumber}` : "Game";
  slide.appendChild(title);

  if (typeof focus === "string" && focus.trim().length) {
    const focusEl = document.createElement("p");
    focusEl.className = "activity-focus";
    focusEl.innerHTML = `<span class="activity-focus__label">Focus</span>${focus}`;
    slide.appendChild(focusEl);
  }

  const wrapper = document.createElement("div");
  wrapper.className = "game1-shell";
  const stage = document.createElement("div");
  stage.className = "game1-stage";
  const stageId = `game1-stage-${Math.random().toString(36).slice(2, 8)}`;
  stage.id = stageId;

  const instruction = document.createElement("p");
  instruction.className = "slide__instruction";
  instruction.textContent =
    "Press Start to play. Listen to each sentence and choose the correct answer before time runs out.";
  slide.appendChild(instruction);

  const status = document.createElement("p");
  status.className = "game1-status is-visible";
  status.textContent = "Loading game...";

  wrapper.append(stage, status);
  slide.appendChild(wrapper);

  const options = sanitizeOptions(activityData?.options);
  const examples = normalizeExamples(activityData?.examples, options);
  const questions = normalizeQuestions(activityData?.content, options);

  const feedbackAssets = { ...DEFAULT_FEEDBACK_ASSETS };

  if (!questions.length) {
    status.textContent = "The game content is not ready yet.";
    return [
      {
        id: activityNumber
          ? `activity-${activityNumber}-game1`
          : "activity-game1",
        element: slide,
        onEnter: () => {},
        onLeave: () => {},
      },
    ];
  }

  let gameInstance = null;

  const getPhaser = () => window?.Phaser;

  const startGame = () => {
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
      stage.innerHTML = "";
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

  return [
    {
      id: activityNumber
        ? `activity-${activityNumber}-game1`
        : "activity-game1",
      element: slide,
      onEnter: startGame,
      onLeave: destroyGame,
    },
  ];
};
