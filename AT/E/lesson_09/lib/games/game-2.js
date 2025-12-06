export const DEFAULT_FEEDBACK_ASSETS = {
  correctAudio: "assets/audio/game/correct.wav",
  incorrectAudio: "assets/audio/game/incorrect.wav",
  timeoutAudio: "assets/audio/game/timeout.wav",
  correctImg: "assets/img/game/correct.png",
  incorrectImg: "assets/img/game/incorrect.png",
  timeoutImg: "assets/img/game/timeout.png",
};

export const DEFAULT_BACKGROUND_IMAGE = "assets/img/game/bg-2.jpg";

const DEFAULT_TIMER_MS = 20000;
const TOKEN_BASE_WIDTH = 130;
const TOKEN_BASE_HEIGHT = 70;

const trimText = (value) =>
  typeof value === "string" ? value.trim() : "";

const joinWordsForDisplay = (words = []) => {
  return words.reduce((acc, word, index) => {
    if (!word) {
      return acc;
    }
    if (index === 0) {
      return word;
    }
    if (/^[.,!?;:]$/.test(word)) {
      return `${acc}${word}`;
    }
    return `${acc} ${word}`;
  }, "");
};

const shuffleArray = (list = []) => {
  const copy = Array.isArray(list) ? [...list] : [];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
};

const createTonePlayer = () => {
  const getContext = () => window.AudioContext || window.webkitAudioContext;
  return {
    play(frequency = 440, durationMs = 200) {
      const Context = getContext();
      if (!Context) {
        return;
      }
      const context = new Context();
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      oscillator.type = "triangle";
      oscillator.frequency.value = frequency;
      gain.gain.setValueAtTime(0.0001, context.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.18, context.currentTime + 0.02);
      gain.gain.exponentialRampToValueAtTime(
        0.0001,
        context.currentTime + durationMs / 1000
      );
      oscillator.connect(gain);
      gain.connect(context.destination);
      oscillator.start();
      oscillator.stop(context.currentTime + durationMs / 1000 + 0.05);
      oscillator.addEventListener("ended", () => {
        context.close().catch(() => {});
      });
    },
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

const createPrimaryButton = (
  scene,
  label,
  width,
  height,
  { onClick, baseColor = 0x1d4ed8, textSize = 32 } = {}
) => {
  const panel = createRoundedPanel(scene, width, height, Math.min(30, height / 2), {
    fillColor: baseColor,
    fillAlpha: 1,
    strokeColor: baseColor,
    strokeAlpha: 0.8,
    lineWidth: 0,
  });

  const text = scene.add
    .text(0, 0, label, {
      fontFamily: 'Segoe UI, "Helvetica Neue", Arial, sans-serif',
      fontSize: `${textSize}px`,
      color: "#ffffff",
      fontStyle: "bold",
    })
    .setOrigin(0.5);

  const container = scene.add.container(0, 0, [panel.graphics, text]);
  container.setSize(width, height);
  container.setInteractive({ useHandCursor: true });

  const hoverStyle = {
    fillColor: 0x2563eb,
    strokeColor: 0x1d4ed8,
    strokeAlpha: 0.9,
  };
  const baseStyle = panel.getStyle();

  container.on("pointerover", () => {
    panel.update({ ...baseStyle, ...hoverStyle });
  });
  container.on("pointerout", () => {
    panel.update(baseStyle);
  });
  container.on("pointerdown", () => {
    panel.update({
      ...baseStyle,
      fillColor: 0x1e40af,
      strokeColor: 0x1e3a8a,
      strokeAlpha: 0.9,
    });
  });
  container.on("pointerup", () => {
    panel.update(baseStyle);
    if (typeof onClick === "function") {
      onClick();
    }
  });

  return {
    container,
    setText(value) {
      text.setText(value);
    },
    setVisible(state) {
      container.setVisible(state);
      container.setActive(state);
    },
    setInteractiveState(enabled) {
      if (enabled) {
        container.setInteractive({ useHandCursor: true });
      } else {
        container.disableInteractive();
      }
    },
  };
};

const TOKEN_STYLES = {
  bank: {
    fillColor: 0xffffff,
    fillAlpha: 1,
    strokeColor: 0x94a3b8,
    strokeAlpha: 0.9,
  },
  hover: {
    fillColor: 0xf1f5f9,
    fillAlpha: 1,
    strokeColor: 0x2563eb,
    strokeAlpha: 0.9,
  },
  selected: {
    fillColor: 0xdbeafe,
    fillAlpha: 1,
    strokeColor: 0x2563eb,
    strokeAlpha: 1,
  },
  correct: {
    fillColor: 0xecfdf5,
    fillAlpha: 1,
    strokeColor: 0x16a34a,
    strokeAlpha: 1,
  },
  incorrect: {
    fillColor: 0xfee2e2,
    fillAlpha: 1,
    strokeColor: 0xdc2626,
    strokeAlpha: 1,
  },
};

const setTokenStyle = (token, styleKey = "bank") => {
  const style = TOKEN_STYLES[styleKey] ?? TOKEN_STYLES.bank;
  token.background.update({
    fillColor: style.fillColor,
    fillAlpha: style.fillAlpha,
    strokeColor: style.strokeColor,
    strokeAlpha: style.strokeAlpha,
    lineWidth: 3,
  });
  token.text.setColor(styleKey === "bank" ? "#0f172a" : "#0f172a");
};

const createToken = (scene, word, index, onClick) => {
  const width = Math.max(TOKEN_BASE_WIDTH, word.length * 16 + 40);
  const height = TOKEN_BASE_HEIGHT;
  const background = createRoundedPanel(scene, width, height, 18, {
    fillColor: 0xffffff,
    strokeColor: 0x94a3b8,
    strokeAlpha: 0.9,
    lineWidth: 3,
  });

  const text = scene.add
    .text(0, 0, word, {
      fontFamily: 'Segoe UI, "Helvetica Neue", Arial, sans-serif',
      fontSize: "28px",
      color: "#0f172a",
    })
    .setOrigin(0.5);

  const token = {
    id: `${word}-${index}-${Math.random().toString(36).slice(2, 8)}`,
    word,
    container: null,
    text,
    background,
    width,
    height,
    state: "bank",
  };

  const container = scene.add.container(0, 0, [background.graphics, text]);
  container.setSize(width, height);
  container.setDepth(4);
  container.setInteractive({ useHandCursor: true });
  container.on("pointerdown", () => onClick?.(token));
  container.on("pointerover", () => {
    if (!container.input?.enabled) {
      return;
    }
    if (token.state === "bank") {
      setTokenStyle(token, "hover");
    }
  });
  container.on("pointerout", () => {
    if (!container.input?.enabled) {
      return;
    }
    if (token.state === "bank") {
      setTokenStyle(token, "bank");
    }
  });

  token.container = container;

  setTokenStyle(token, "bank");

  return token;
};

export const normalizeWordEntries = (raw = []) => {
  if (!Array.isArray(raw)) {
    return [];
  }
  return raw
    .map((entry, index) => {
      const sentence = trimText(entry?.sentence);
      const words = Array.isArray(entry?.words)
        ? entry.words.map((word) => trimText(word)).filter(Boolean)
        : [];
      if (!sentence || !words.length) {
        return null;
      }
      const audio =
        typeof entry?.audio === "string" && entry.audio.trim().length
          ? entry.audio.trim()
          : null;
      const id = trimText(entry?.id) || `line_${index + 1}`;
      return {
        id,
        sentence,
        words,
        audio,
        audioKey: audio ? `arrange_sentence_${id}` : null,
      };
    })
    .filter(Boolean);
};

export const normalizeFirstSentence = (entry) => {
  if (!entry || typeof entry !== "object") {
    return null;
  }
  const text = trimText(entry.text);
  if (!text) {
    return null;
  }
  const audio =
    typeof entry.audio === "string" && entry.audio.trim().length
      ? entry.audio.trim()
      : null;
  return {
    text,
    audio,
    audioKey: audio ? "arrange_intro_sentence" : null,
  };
};

export const createGameScene = (config = {}) => {
  const {
    questions: rawQuestions = [],
    firstSentence: rawFirstSentence = null,
    statusElement,
    feedbackAssets = DEFAULT_FEEDBACK_ASSETS,
    backgroundImage,
    timePerQuestionMs = DEFAULT_TIMER_MS,
  } = config;

  const questions = normalizeWordEntries(rawQuestions);
  const firstSentence = normalizeFirstSentence(rawFirstSentence);
  const tonePlayer = createTonePlayer();

  return class GameTwoScene extends Phaser.Scene {
    constructor() {
      super("GameTwoScene");
      this.questions = questions;
      this.firstSentence = firstSentence;
      this.feedbackAssets = feedbackAssets;
      this.backgroundImageKey = null;
      this.timePerQuestionMs = timePerQuestionMs;
      this.activeTimer = null;
      this.currentIndex = -1;
      this.state = "idle";
      this.score = 0;
      this.assembledWords = [];
      this.arrangedTokens = [];
      this.bankTokens = [];
      this.awaitingAnswer = false;
      this.statusElement = statusElement;
      this.activeAudio = null;
      this.pendingAudioToken = 0;
    }

    preload() {
      const backgroundAsset = trimText(backgroundImage);
      const bg = backgroundAsset?.length
        ? backgroundAsset
        : DEFAULT_BACKGROUND_IMAGE;

      this.backgroundImageKey = "word-game-bg";
      this.load.image(this.backgroundImageKey, bg);

      this.questions.forEach((question) => {
        if (question.audioKey && question.audio) {
          this.load.audio(question.audioKey, question.audio);
        }
      });

      if (this.firstSentence?.audioKey && this.firstSentence.audio) {
        this.load.audio(this.firstSentence.audioKey, this.firstSentence.audio);
      }

      if (this.feedbackAssets.correctAudio) {
        this.load.audio(
          "word-game-correct",
          this.feedbackAssets.correctAudio
        );
      }
      if (this.feedbackAssets.incorrectAudio) {
        this.load.audio(
          "word-game-incorrect",
          this.feedbackAssets.incorrectAudio
        );
      }
      if (this.feedbackAssets.timeoutAudio) {
        this.load.audio("word-game-timeout", this.feedbackAssets.timeoutAudio);
      }
      if (this.feedbackAssets.correctImg) {
        this.load.image("word-game-correct-img", this.feedbackAssets.correctImg);
      }
      if (this.feedbackAssets.incorrectImg) {
        this.load.image(
          "word-game-incorrect-img",
          this.feedbackAssets.incorrectImg
        );
      }
      if (this.feedbackAssets.timeoutImg) {
        this.load.image("word-game-timeout-img", this.feedbackAssets.timeoutImg);
      }
    }

    create() {
      const { width, height } = this.sys.game.canvas;
      this.cameras.main.setBackgroundColor("#edf2fb");
      this.background = this.add
        .image(width / 2, height / 2, this.backgroundImageKey)
        .setOrigin(0.5)
        .setDepth(0);
      this.background.displayWidth = width;
      this.background.displayHeight = height;

      this.phaseText = this.add
        .text(width / 2, 24, "Arrange the sentence", {
          fontFamily: 'Segoe UI, "Helvetica Neue", Arial, sans-serif',
          fontSize: "34px",
          color: "#0f172a",
          fontStyle: "bold",
        })
        .setOrigin(0.5, 0);

      this.timerText = this.add
        .text(60, 30, "Time: 20.0s", {
          fontFamily: 'Segoe UI, "Helvetica Neue", Arial, sans-serif',
          fontSize: "26px",
          color: "#1d4ed8",
          fontStyle: "bold",
        })
        .setOrigin(0, 0);

      this.scoreText = this.add
        .text(width - 60, 30, "Score: 0/0", {
          fontFamily: 'Segoe UI, "Helvetica Neue", Arial, sans-serif',
          fontSize: "26px",
          color: "#16a34a",
          fontStyle: "bold",
        })
        .setOrigin(1, 0);

      const sentencePanel = createRoundedPanel(this, width * 0.82, 160, 24, {
        fillColor: 0xffffff,
        fillAlpha: 0.95,
        strokeColor: 0x93c5fd,
        strokeAlpha: 0.6,
        lineWidth: 4,
      });
      sentencePanel.graphics.setPosition(width / 2, 150);

      this.sentenceText = this.add
        .text(width / 2, 150, "Press Start to begin.", {
          fontFamily: 'Segoe UI, "Helvetica Neue", Arial, sans-serif',
          fontSize: "30px",
          color: "#0f172a",
          align: "center",
          wordWrap: { width: width * 0.78 },
        })
        .setOrigin(0.5);

      const targetPanel = createRoundedPanel(this, width * 0.82, 200, 28, {
        fillColor: 0xf8fafc,
        fillAlpha: 0.98,
        strokeColor: 0x93c5fd,
        strokeAlpha: 0.4,
        lineWidth: 3,
      });
      targetPanel.graphics.setPosition(width / 2, height / 2 - 40);

      this.targetContainer = this.add.container(width / 2, height / 2 - 40);
      this.targetArea = {
        width: width * 0.76,
        height: 160,
        position: { x: width / 2, y: height / 2 - 40 },
      };

      const bankPanel = createRoundedPanel(this, width * 0.82, 180, 26, {
        fillColor: 0xffffff,
        fillAlpha: 0.95,
        strokeColor: 0x93c5fd,
        strokeAlpha: 0.35,
        lineWidth: 3,
      });
      bankPanel.graphics.setPosition(width / 2, height - 140);

      this.bankContainer = this.add.container(width / 2, height - 140);
      this.bankArea = {
        width: width * 0.76,
        height: 140,
      };

      this.previewText = this.add
        .text(width / 2, height / 2 + 90, "", {
          fontFamily: 'Segoe UI, "Helvetica Neue", Arial, sans-serif',
          fontSize: "26px",
          color: "#0f172a",
          align: "center",
          wordWrap: { width: width * 0.78 },
        })
        .setOrigin(0.5);

      this.feedbackText = this.add
        .text(width / 2, height - 50, "", {
          fontFamily: 'Segoe UI, "Helvetica Neue", Arial, sans-serif',
          fontSize: "30px",
          color: "#0f172a",
          fontStyle: "bold",
        })
        .setOrigin(0.5);

      this.startOverlay = this.add.container(width / 2, height / 2, []);
      const startPanel = createRoundedPanel(this, 420, 220, 32, {
        fillColor: 0xffffff,
        fillAlpha: 0.98,
        strokeColor: 0x93c5fd,
        strokeAlpha: 0.7,
        lineWidth: 3,
      });
      startPanel.graphics.setDepth(10);
      const startText = this.add
        .text(0, -40, "Arrange the jumbled words\nto form a sentence.", {
          fontFamily: 'Segoe UI, "Helvetica Neue", Arial, sans-serif',
          fontSize: "26px",
          color: "#0f172a",
          align: "center",
        })
        .setOrigin(0.5);
      const startButton = createPrimaryButton(this, "Start", 220, 72, {
        onClick: () => this.startGame(),
      });
      startButton.container.setPosition(0, 70);

      this.startOverlay.add([startPanel.graphics, startText, startButton.container]);
      this.startButton = startButton;

      this.summaryOverlay = this.add.container(width / 2, height / 2);
      const summaryPanel = createRoundedPanel(this, 520, 300, 32, {
        fillColor: 0xffffff,
        fillAlpha: 0.98,
        strokeColor: 0x0f172a,
        strokeAlpha: 0.15,
        lineWidth: 3,
      });
      summaryPanel.graphics.setDepth(10);
      this.summaryTitle = this.add
        .text(0, -80, "Great job!", {
          fontFamily: 'Segoe UI, "Helvetica Neue", Arial, sans-serif',
          fontSize: "34px",
          color: "#0f172a",
          fontStyle: "bold",
        })
        .setOrigin(0.5);
      this.summaryBody = this.add
        .text(0, 0, "", {
          fontFamily: 'Segoe UI, "Helvetica Neue", Arial, sans-serif',
          fontSize: "24px",
          color: "#0f172a",
          align: "center",
          wordWrap: { width: 460 },
        })
        .setOrigin(0.5);
      const replayButton = createPrimaryButton(this, "Replay", 200, 64, {
        onClick: () => this.restartGame(),
      });
      replayButton.container.setPosition(0, 110);
      this.summaryOverlay.add([
        summaryPanel.graphics,
        this.summaryTitle,
        this.summaryBody,
        replayButton.container,
      ]);
      this.summaryOverlay.setVisible(false);

      this.updateScoreText();
      this.updateTimerText(this.timePerQuestionMs);

      if (this.statusElement) {
        this.statusElement.textContent = "Press Start to begin.";
        this.statusElement.classList.add("is-visible");
        this.statusElement.classList.remove("is-error");
      }
    }

    startGame() {
      if (!this.questions.length) {
        if (this.statusElement) {
          this.statusElement.textContent = "Game content will be added soon.";
          this.statusElement.classList.add("is-error");
        }
        return;
      }
      this.startOverlay.setVisible(false);
      this.summaryOverlay.setVisible(false);
      this.score = 0;
      this.currentIndex = -1;
      this.updateScoreText();
      this.state = "running";
      this.clearFeedback();
      this.resetTokens();
      this.showSentenceText("Listen to the model sentence.");
      if (this.firstSentence) {
        this.showSentenceText(this.firstSentence.text);
        this.playSentenceAudio(this.firstSentence, () => {
          this.time.delayedCall(600, () => this.advanceQuestion());
        });
      } else {
        this.time.delayedCall(400, () => this.advanceQuestion());
      }
      if (this.statusElement) {
        this.statusElement.textContent = "Arrange the words before time runs out.";
        this.statusElement.classList.add("is-visible");
        this.statusElement.classList.remove("is-error");
        this.statusElement.classList.remove("is-transparent");
      }
    }

    restartGame() {
      this.startOverlay.setVisible(true);
      this.summaryOverlay.setVisible(false);
      this.showSentenceText("Press Start to begin.");
      this.clearFeedback();
      this.resetTokens();
      this.updateTimerText(this.timePerQuestionMs);
      if (this.statusElement) {
        this.statusElement.textContent = "Press Start to begin.";
        this.statusElement.classList.remove("is-error");
        this.statusElement.classList.add("is-visible");
      }
    }

    advanceQuestion() {
      this.stopTimer();
      this.clearFeedback();
      this.resetTokens();
      this.currentIndex += 1;
      if (this.currentIndex >= this.questions.length) {
        this.finishGame();
        return;
      }
      const question = this.questions[this.currentIndex];
      this.phaseText.setText(
        `Sentence ${this.currentIndex + 1} of ${this.questions.length}`
      );
      this.sentenceText.setText("Arrange the words in order.");
      this.assembledWords = [];
      this.awaitingAnswer = true;
      this.createTokens(question);
      this.updateTimerText(this.timePerQuestionMs);
      this.startTimer();
      if (this.statusElement) {
        this.statusElement.textContent = `Sentence ${this.currentIndex + 1} of ${
          this.questions.length
        }`;
        this.statusElement.classList.add("is-transparent");
      }
    }

    startTimer() {
      let remaining = this.timePerQuestionMs;
      this.updateTimerText(remaining);
      this.activeTimer?.remove?.();
      this.activeTimer = this.time.addEvent({
        delay: 100,
        loop: true,
        callback: () => {
          remaining -= 100;
          if (remaining <= 0) {
            this.updateTimerText(0);
            this.activeTimer?.remove?.();
            this.activeTimer = null;
            this.handleTimeout();
            return;
          }
          this.updateTimerText(remaining);
        },
      });
    }

    stopTimer() {
      this.activeTimer?.remove?.();
      this.activeTimer = null;
    }

    updateTimerText(ms) {
      const seconds = Math.max(0, ms) / 1000;
      this.timerText.setText(`Time: ${seconds.toFixed(1)}s`);
    }

    updateScoreText() {
      this.scoreText.setText(`Score: ${this.score}/${this.questions.length}`);
    }

    showSentenceText(text) {
      this.sentenceText.setText(text);
    }

    createTokens(question) {
      const shuffled = shuffleArray(question.words);
      let attempts = 0;
      while (
        JSON.stringify(shuffled) === JSON.stringify(question.words) &&
        attempts < 5
      ) {
        attempts += 1;
        shuffled.splice(0, shuffled.length, ...shuffleArray(question.words));
      }
      this.bankTokens = shuffled.map((word, index) =>
        createToken(this, word, index, (token) => this.toggleToken(token))
      );
      this.bankTokens.forEach((token) => {
        token.state = "bank";
        this.bankContainer.add(token.container);
        setTokenStyle(token, "bank");
      });
      this.arrangedTokens = [];
      this.layoutTokens();
    }

    toggleToken(token) {
      if (!this.awaitingAnswer) {
        return;
      }
      if (!token) {
        return;
      }
      if (token.state === "bank") {
        token.state = "target";
        this.arrangedTokens.push(token);
        this.assembledWords.push(token.word);
        this.targetContainer.add(token.container);
        setTokenStyle(token, "selected");
      } else if (token.state === "target") {
        token.state = "bank";
        this.arrangedTokens = this.arrangedTokens.filter((t) => t !== token);
        const idx = this.assembledWords.lastIndexOf(token.word);
        if (idx >= 0) {
          this.assembledWords.splice(idx, 1);
        }
        this.bankContainer.add(token.container);
        setTokenStyle(token, "bank");
      }
      this.layoutTokens();
      this.previewText.setText(joinWordsForDisplay(this.assembledWords));
      if (this.assembledWords.length === this.questions[this.currentIndex].words.length) {
        this.checkAnswer();
      }
    }

    layoutTokens() {
      const arrangeInZone = (tokens, area, parentContainer) => {
        if (!tokens.length || !parentContainer) {
          return;
        }
        const maxColumns = Math.min(tokens.length, 5);
        const spacingX = area.width / maxColumns;
        const rows = Math.ceil(tokens.length / maxColumns);
        const spacingY =
          rows > 1
            ? Math.min(area.height / rows, TOKEN_BASE_HEIGHT + 20)
            : TOKEN_BASE_HEIGHT + 10;
        tokens.forEach((token, idx) => {
          const row = Math.floor(idx / maxColumns);
          const col = idx % maxColumns;
          const x = -area.width / 2 + spacingX / 2 + col * spacingX;
          const y = -area.height / 2 + spacingY / 2 + row * spacingY;
          token.container.setPosition(x, y);
          parentContainer.bringToTop(token.container);
        });
      };

      arrangeInZone(this.arrangedTokens, this.targetArea, this.targetContainer);
      const bankTokens = this.bankTokens.filter(
        (token) => token.state === "bank"
      );
      arrangeInZone(bankTokens, this.bankArea, this.bankContainer);
    }

    checkAnswer() {
      if (!this.awaitingAnswer) {
        return;
      }
      this.awaitingAnswer = false;
      this.stopTimer();
      const question = this.questions[this.currentIndex];
      const assembled = [...this.assembledWords];
      const isCorrect =
        assembled.length === question.words.length &&
        assembled.every((word, index) => word === question.words[index]);
      if (isCorrect) {
        this.score += 1;
        this.updateScoreText();
        this.setTokensFeedback("correct");
        this.showSentenceText(question.sentence);
        this.showFeedback("Correct!");
        this.playFeedbackSound("correct");
      } else {
        this.setTokensFeedback("incorrect");
        this.showSentenceText(question.sentence);
        this.showFeedback("Incorrect.");
        this.playFeedbackSound("incorrect");
      }
      this.previewText.setText(question.sentence);
      this.playSentenceAudio(question, () => {
        this.time.delayedCall(800, () => this.advanceQuestion());
      });
    }

    handleTimeout() {
      if (!this.awaitingAnswer) {
        return;
      }
      this.awaitingAnswer = false;
      const question = this.questions[this.currentIndex];
      this.setTokensFeedback("incorrect");
      this.showSentenceText(question.sentence);
      this.showFeedback("Time's up!");
      this.previewText.setText(question.sentence);
      this.playFeedbackSound("timeout");
      this.playSentenceAudio(question, () => {
        this.time.delayedCall(800, () => this.advanceQuestion());
      });
    }

    setTokensFeedback(kind) {
      const styleKey = kind === "correct" ? "correct" : "incorrect";
      this.arrangedTokens.forEach((token) => setTokenStyle(token, styleKey));
    }

    showFeedback(message) {
      this.feedbackText.setText(message);
      this.feedbackText.setColor(
        message.toLowerCase().includes("correct") ? "#0f766e" : "#b45309"
      );
    }

    clearFeedback() {
      this.feedbackText.setText("");
      this.feedbackText.setColor("#0f172a");
      this.previewText.setText("");
    }

    playFeedbackSound(type) {
      const keyMap = {
        correct: "word-game-correct",
        incorrect: "word-game-incorrect",
        timeout: "word-game-timeout",
      };
      const key = keyMap[type];
      if (key && this.sound.get(key)) {
        this.sound.play(key);
        return;
      }
      if (type === "correct") {
        tonePlayer.play(620, 200);
      } else if (type === "incorrect") {
        tonePlayer.play(320, 320);
      } else {
        tonePlayer.play(260, 420);
      }
    }

    playSentenceAudio(entry, onComplete) {
      this.stopSentenceAudio();
      this.pendingAudioToken += 1;
      const token = this.pendingAudioToken;
      if (entry.audioKey) {
        const sound = this.sound.get(entry.audioKey) ?? this.sound.add(entry.audioKey);
        this.activeAudio = sound;
        if (sound) {
          sound.once(Phaser.Sound.Events.COMPLETE, () => {
            if (token === this.pendingAudioToken) {
              onComplete?.();
            }
          });
          sound.play();
          return;
        }
      }
      this.time.delayedCall(600, () => {
        if (token === this.pendingAudioToken) {
          onComplete?.();
        }
      });
    }

    stopSentenceAudio() {
      if (this.activeAudio) {
        this.activeAudio.stop();
        this.activeAudio = null;
      }
    }

    resetTokens() {
      [...this.bankTokens, ...this.arrangedTokens].forEach((token) => {
        token.container.destroy();
      });
      this.bankTokens = [];
      this.arrangedTokens = [];
      this.assembledWords = [];
    }

    finishGame() {
      this.stopTimer();
      this.awaitingAnswer = false;
      this.state = "finished";
      this.resetTokens();
      this.clearFeedback();
      this.showSentenceText("All sentences arranged!");
      const percentage =
        this.questions.length > 0
          ? Math.round((this.score / this.questions.length) * 100)
          : 0;
      this.summaryTitle.setText(
        percentage === 100
          ? "Outstanding!"
          : percentage >= 60
          ? "Great Job!"
          : "Keep Practicing!"
      );
      this.summaryBody.setText(
        `You arranged ${this.score} of ${this.questions.length} sentences correctly.\nScore: ${percentage}%`
      );
      this.summaryOverlay.setVisible(true);
      this.startOverlay.setVisible(true);
      this.startButton.setText("Replay");
      if (this.statusElement) {
        this.statusElement.textContent =
          "Great work! Press Replay to try again.";
        this.statusElement.classList.remove("is-transparent");
        this.statusElement.classList.add("is-visible");
      }
    }
  };
};
