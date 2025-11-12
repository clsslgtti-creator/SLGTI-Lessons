export const DEFAULT_FEEDBACK_ASSETS = {
  correctAudio: "assets/audio/game/correct.wav",
  incorrectAudio: "assets/audio/game/incorrect.wav",
  timeoutAudio: "assets/audio/game/timeout.wav",
  correctImg: "assets/img/game/correct.png",
  incorrectImg: "assets/img/game/incorrect.png",
  timeoutImg: "assets/img/game/timeout.png",
};

export const DEFAULT_BACKGROUND_IMAGE = "assets/img/game/bg-1.jpg";

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

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
    playTone(frequency = 440, durationMs = 280) {
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
      gain.gain.exponentialRampToValueAtTime(
        0.18,
        context.currentTime + 0.02
      );
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

const createStatusController = (element) => {
  if (!element) {
    return () => {};
  }
  return (message, options = {}) => {
    const { error = false, transparent = false } = options;
    element.textContent = typeof message === "string" ? message : "";
    element.classList.toggle("is-error", Boolean(error));
    element.classList.toggle("is-transparent", Boolean(transparent));
    if (message && message.length) {
      element.classList.add("is-visible");
    } else {
      element.classList.remove("is-visible");
    }
  };
};

const sanitizeId = (value, fallback) => {
  const trimmed = typeof value === "string" ? value.trim() : "";
  return trimmed.length ? trimmed : fallback;
};

const createButton = (scene, config = {}) => {
  const {
    x = 0,
    y = 0,
    width = 220,
    height = 68,
    label = "Button",
    onClick,
  } = config;

  const container = scene.add.container(x, y);
  const shadow = scene.add.rectangle(6, 8, width, height, 0x0f172a, 0.18);
  shadow.setOrigin(0.5);
  shadow.setAngle(0.5);
  const background = scene.add.rectangle(0, 0, width, height, 0x2563eb, 1);
  background.setOrigin(0.5);
  background.setStrokeStyle(3, 0x1e40af, 1);
  const labelEl = scene.add
    .text(0, 0, label, {
      fontFamily: "'Outfit','Segoe UI',sans-serif",
      fontSize: `${clamp(height * 0.4, 20, 26)}px`,
      fontStyle: "700",
      color: "#ffffff",
      align: "center",
    })
    .setOrigin(0.5);

  container.add([shadow, background, labelEl]);
  container.setSize(width, height);
  const hitArea = new Phaser.Geom.Rectangle(
    -width / 2,
    -height / 2,
    width,
    height
  );
  container.setInteractive(hitArea, Phaser.Geom.Rectangle.Contains);
  if (container.input) {
    container.input.cursor = "pointer";
  }

  let disabled = false;

  container.on("pointerover", () => {
    if (!disabled) {
      container.setScale(1.02);
    }
  });
  container.on("pointerout", () => {
    container.setScale(1);
  });
  container.on("pointerup", () => {
    if (disabled) {
      return;
    }
    container.setScale(1);
    if (typeof onClick === "function") {
      onClick();
    }
  });

  return {
    container,
    setEnabled(state) {
      disabled = !state;
      if (disabled) {
        container.disableInteractive();
        container.setAlpha(0.65);
      } else {
        container.setInteractive(hitArea, Phaser.Geom.Rectangle.Contains);
        if (container.input) {
          container.input.cursor = "pointer";
        }
        container.setAlpha(1);
      }
    },
    setLabel(text) {
      labelEl.setText(text);
    },
  };
};

export const normalizeMatchingPairs = (rawPairs = []) => {
  if (!Array.isArray(rawPairs)) {
    return [];
  }
  const usedIds = new Set();
  return rawPairs
    .map((pair, index) => {
      if (!pair || typeof pair !== "object") {
        return null;
      }
      const fallbackId = `pair_${index + 1}`;
      let id = sanitizeId(pair.id, fallbackId);
      if (usedIds.has(id)) {
        id = `${id}_${index + 1}`;
      }
      usedIds.add(id);

      const keyword = sanitizeId(pair.keyword, `Keyword ${index + 1}`);
      const image =
        typeof pair.image === "string" && pair.image.trim().length
          ? pair.image.trim()
          : null;
      if (!image) {
        return null;
      }
      return {
        id,
        keyword,
        image,
      };
    })
    .filter(Boolean);
};

const createResultBadgeFactory = (scene, assets) => {
  const { correctIconKey, incorrectIconKey } = assets;
  const hasCorrect =
    Boolean(correctIconKey) && scene.textures.exists(correctIconKey);
  const hasIncorrect =
    Boolean(incorrectIconKey) && scene.textures.exists(incorrectIconKey);

  if (hasCorrect && hasIncorrect) {
    return () => {
      const container = scene.add.container(0, 0);
      container.setVisible(false);
      const correctIcon = scene.add.image(0, 0, correctIconKey);
      const incorrectIcon = scene.add.image(0, 0, incorrectIconKey);
      correctIcon.setScale(0.55);
      incorrectIcon.setScale(0.55);
      incorrectIcon.setVisible(false);
      container.add([incorrectIcon, correctIcon]);
      return {
        container,
        show(isCorrect) {
          container.setVisible(true);
          correctIcon.setVisible(Boolean(isCorrect));
          incorrectIcon.setVisible(!isCorrect);
        },
      };
    };
  }

  return () => {
    const container = scene.add.container(0, 0);
    container.setVisible(false);
    const circle = scene.add.circle(0, 0, 26, 0xffffff, 1);
    circle.setStrokeStyle(3, 0x94a3b8, 0.65);
    const lines = scene.add.graphics();
    container.add([circle, lines]);
    return {
      container,
      show(isCorrect) {
        container.setVisible(true);
        lines.clear();
        if (isCorrect) {
          circle.setFillStyle(0xecfdf5, 1);
          circle.setStrokeStyle(3, 0x059669, 0.9);
          lines.lineStyle(4, 0x059669, 1);
          lines.beginPath();
          lines.moveTo(-10, 4);
          lines.lineTo(-2, 14);
          lines.lineTo(12, -10);
          lines.strokePath();
        } else {
          circle.setFillStyle(0xfee2e2, 1);
          circle.setStrokeStyle(3, 0xb91c1c, 0.9);
          lines.lineStyle(4, 0xb91c1c, 1);
          lines.beginPath();
          lines.moveTo(-12, -12);
          lines.lineTo(12, 12);
          lines.moveTo(12, -12);
          lines.lineTo(-12, 12);
          lines.strokePath();
        }
      },
    };
  };
};

export const createMatchingGameScene = (config = {}) => {
  const {
    pairs: rawPairs = [],
    backgroundImage,
    feedbackAssets = DEFAULT_FEEDBACK_ASSETS,
    statusElement = null,
    onRoundUpdate,
  } = config;

  const randomSuffix = Math.random().toString(36).slice(2, 8);
  const makeKey = (name) => `matching_${name}_${randomSuffix}`;

  const sanitizedPairs = normalizeMatchingPairs(rawPairs).map((pair, index) => ({
    ...pair,
    textureKey: makeKey(`pair_${index}`),
  }));

  const resolvedFeedback = {
    ...DEFAULT_FEEDBACK_ASSETS,
    ...(feedbackAssets || {}),
  };

  const resolvedBackground =
    typeof backgroundImage === "string" && backgroundImage.trim().length
      ? backgroundImage.trim()
      : DEFAULT_BACKGROUND_IMAGE;

  const tonePlayer = createTonePlayer();
  const statusController = createStatusController(statusElement);

  const backgroundTextureKey = makeKey("bg");
  const correctIconKey = makeKey("correct_icon");
  const incorrectIconKey = makeKey("incorrect_icon");
  const correctAudioKey = makeKey("correct_audio");
  const incorrectAudioKey = makeKey("incorrect_audio");

  return class MatchingGameScene extends Phaser.Scene {
    constructor() {
      super("KeywordImageMatchingScene");
      this.basePairs = sanitizedPairs;
      this.totalPairs = this.basePairs.length;
      this.backgroundAsset = resolvedBackground;
      this.feedbackAssets = resolvedFeedback;
      this.statusController = statusController;
      this.onRoundUpdate =
        typeof onRoundUpdate === "function" ? onRoundUpdate : null;
      this.backgroundTextureKey = backgroundTextureKey;
      this.correctIconKey = correctIconKey;
      this.incorrectIconKey = incorrectIconKey;
      this.correctAudioKey = correctAudioKey;
      this.incorrectAudioKey = incorrectAudioKey;
      this.shouldAutoStart = false;
      this.tipTimer = null;
      this.resetSessionState();
    }

    init(data = {}) {
      this.shouldAutoStart = Boolean(data.autoStart);
    }

    resetSessionState() {
      this.sessionPairs = this.basePairs.map((pair) => ({ ...pair }));
      this.keywordNodes = [];
      this.imageNodes = [];
      this.connections = [];
      this.matchesCompleted = 0;
      this.correctMatches = 0;
      this.selectedKeyword = null;
      this.gameActive = false;
      this.resultDisplayed = false;
    }

    preload() {
      if (
        this.backgroundAsset &&
        !this.textures.exists(this.backgroundTextureKey)
      ) {
        this.load.image(this.backgroundTextureKey, this.backgroundAsset);
      }

      this.sessionPairs.forEach((pair) => {
        if (!pair.textureKey) {
          return;
        }
        if (!this.textures.exists(pair.textureKey)) {
          this.load.image(pair.textureKey, pair.image);
        }
      });

      if (
        this.feedbackAssets.correctImg &&
        !this.textures.exists(this.correctIconKey)
      ) {
        this.load.image(this.correctIconKey, this.feedbackAssets.correctImg);
      }
      if (
        this.feedbackAssets.incorrectImg &&
        !this.textures.exists(this.incorrectIconKey)
      ) {
        this.load.image(this.incorrectIconKey, this.feedbackAssets.incorrectImg);
      }

      if (
        this.feedbackAssets.correctAudio &&
        !this.cache.audio.exists(this.correctAudioKey)
      ) {
        this.load.audio(this.correctAudioKey, this.feedbackAssets.correctAudio);
      }
      if (
        this.feedbackAssets.incorrectAudio &&
        !this.cache.audio.exists(this.incorrectAudioKey)
      ) {
        this.load.audio(
          this.incorrectAudioKey,
          this.feedbackAssets.incorrectAudio
        );
      }

      this.load.once("complete", () => {
        this.statusController(
          this.shouldAutoStart
            ? "Get ready to match the parts."
            : "Press Start to play."
        );
      });
      this.load.on("loaderror", (file) => {
        console.warn("Unable to load asset:", file?.src ?? file?.key);
        this.statusController(
          "Some game assets failed to load. Please reload if the issue continues.",
          { error: true }
        );
      });
    }

    create() {
      this.sceneWidth = this.scale.width;
      this.sceneHeight = this.scale.height;
      this.resetSessionState();

      if (!this.totalPairs) {
        this.statusController("Game content is not available.", {
          error: true,
        });
        return;
      }

      this.addBackground();
      this.lineLayer = this.add.layer();
      this.keywordLayer = this.add.layer();
      this.imageLayer = this.add.layer();
      this.buildColumns();
      this.createHud();
      this.createStartOverlay();
      this.createResultOverlay();
      this.setInteractionState(false);
      this.updateProgressText();
      this.updateTip(
        this.shouldAutoStart
          ? "Matching started automatically."
          : "Select a keyword and then the matching image."
      );

      if (this.shouldAutoStart) {
        this.beginMatching(true);
      } else {
        this.showStartOverlay();
      }

      this.events.once("shutdown", () => {
        if (this.tipTimer) {
          this.tipTimer.remove(false);
          this.tipTimer = null;
        }
      });
    }

    addBackground() {
      const bg = this.add
        .image(
          this.sceneWidth / 2,
          this.sceneHeight / 2,
          this.backgroundTextureKey
        )
        .setDepth(0);
      bg.setDisplaySize(this.sceneWidth, this.sceneHeight);
    }

    buildColumns() {
      const keywordOrder = shuffleArray(this.sessionPairs);
      const imageOrder = shuffleArray(this.sessionPairs);
      const positions = this.computePositions(keywordOrder.length);

      const keywordWidth = clamp(this.sceneWidth * 0.32, 320, 420);
      const keywordHeight = clamp(this.sceneHeight * 0.085, 64, 96);
      const keywordX = clamp(this.sceneWidth * 0.28, 260, 420);

      keywordOrder.forEach((pair, index) => {
        const y = positions[index];
        const node = this.createKeywordNode(
          pair,
          keywordX,
          y,
          keywordWidth,
          keywordHeight
        );
        this.keywordLayer.add(node.container);
        this.keywordNodes.push(node);
      });

      const imageWidth = clamp(this.sceneWidth * 0.28, 260, 360);
      const imageHeight = clamp(this.sceneHeight * 0.2, 150, 240);
      const imageX =
        this.sceneWidth - clamp(this.sceneWidth * 0.28, 260, 420);

      const createBadge = createResultBadgeFactory(this, {
        correctIconKey: this.correctIconKey,
        incorrectIconKey: this.incorrectIconKey,
      });

      imageOrder.forEach((pair, index) => {
        const y = positions[index];
        const node = this.createImageNode(
          pair,
          imageX,
          y,
          imageWidth,
          imageHeight,
          createBadge
        );
        this.imageLayer.add(node.container);
        this.imageNodes.push(node);
      });
    }

    computePositions(count) {
      if (!count) {
        return [];
      }
      const top = clamp(this.sceneHeight * 0.18, 120, this.sceneHeight * 0.3);
      const bottom = this.sceneHeight - clamp(this.sceneHeight * 0.15, 100, 180);
      if (count === 1) {
        return [(top + bottom) / 2];
      }
      const spacing = (bottom - top) / (count - 1);
      return Array.from({ length: count }, (_, index) => top + spacing * index);
    }

    createKeywordNode(pair, x, y, width, height) {
      const container = this.add.container(x, y);
      const card = this.add.rectangle(0, 0, width, height, 0xffffff, 0.96);
      card.setStrokeStyle(3, 0x94a3b8, 0.6);
      const label = this.add
        .text(0, 0, pair.keyword, {
          fontFamily: "'Outfit','Segoe UI',sans-serif",
          fontSize: `${clamp(height * 0.4, 20, 30)}px`,
          color: "#0f172a",
          align: "center",
          wordWrap: { width: width - 40 },
        })
        .setOrigin(0.5);
      container.add([card, label]);
      container.setSize(width, height);
      const hitArea = new Phaser.Geom.Rectangle(
        -width / 2,
        -height / 2,
        width,
        height
      );
      container.setInteractive(hitArea, Phaser.Geom.Rectangle.Contains);
      if (container.input) {
        container.input.cursor = "pointer";
      }

      const node = {
        id: pair.id,
        pair,
        container,
        card,
        label,
        matched: false,
        setSelected: (state) => {
          if (node.matched) {
            return;
          }
          card.setFillStyle(state ? 0xdbeafe : 0xffffff, 1);
          card.setStrokeStyle(3, state ? 0x2563eb : 0x94a3b8, state ? 0.9 : 0.6);
        },
        setMatched: (isCorrect) => {
          node.matched = true;
          card.setFillStyle(isCorrect ? 0xecfdf5 : 0xfee2e2, 1);
          card.setStrokeStyle(
            3,
            isCorrect ? 0x16a34a : 0xdc2626,
            0.9
          );
          container.disableInteractive();
          container.setAlpha(0.95);
        },
        enable: () => {
          if (node.matched) {
            return;
          }
          container.setInteractive(hitArea, Phaser.Geom.Rectangle.Contains);
          if (container.input) {
            container.input.cursor = "pointer";
          }
        },
        disable: () => {
          container.disableInteractive();
        },
      };

      container.on("pointerup", () => {
        if (!this.gameActive || node.matched) {
          return;
        }
        this.handleKeywordSelection(node);
      });

      container.on("pointerover", () => {
        if (!this.gameActive || node.matched) {
          return;
        }
        container.setScale(1.02);
      });
      container.on("pointerout", () => {
        container.setScale(1);
      });

      return node;
    }

    createImageNode(pair, x, y, width, height, badgeFactory) {
      const container = this.add.container(x, y);
      const frame = this.add.rectangle(0, 0, width, height, 0xffffff, 0.97);
      frame.setStrokeStyle(4, 0xe2e8f0, 1);
      const picture = this.add.image(0, 0, pair.textureKey);
      const source = this.textures.get(pair.textureKey)?.getSourceImage();
      if (source?.width && source?.height) {
        const safeWidth = width - 24;
        const safeHeight = height - 24;
        const scale = Math.min(safeWidth / source.width, safeHeight / source.height);
        picture.setDisplaySize(source.width * scale, source.height * scale);
      } else {
        picture.setDisplaySize(width - 24, height - 24);
      }
      container.add([frame, picture]);
      container.setSize(width, height);
      const hitArea = new Phaser.Geom.Rectangle(
        -width / 2,
        -height / 2,
        width,
        height
      );
      container.setInteractive(hitArea, Phaser.Geom.Rectangle.Contains);
      if (container.input) {
        container.input.cursor = "pointer";
      }

      const badge = badgeFactory();
      badge.container.setPosition(width / 2 - 28, -height / 2 + 28);
      container.add(badge.container);

      const node = {
        id: pair.id,
        pair,
        container,
        frame,
        picture,
        badge,
        matched: false,
        setMatched: (isCorrect) => {
          node.matched = true;
          frame.setStrokeStyle(4, isCorrect ? 0x16a34a : 0xb91c1c, 0.95);
          container.disableInteractive();
          container.setAlpha(0.98);
        },
        enable: () => {
          if (node.matched) {
            return;
          }
          container.setInteractive(hitArea, Phaser.Geom.Rectangle.Contains);
          if (container.input) {
            container.input.cursor = "pointer";
          }
        },
        disable: () => {
          container.disableInteractive();
        },
      };

      container.on("pointerup", () => {
        if (!this.gameActive || node.matched) {
          return;
        }
        this.handleImageSelection(node);
      });

      container.on("pointerover", () => {
        if (!this.gameActive || node.matched) {
          return;
        }
        container.setScale(1.02);
      });
      container.on("pointerout", () => {
        container.setScale(1);
      });

      return node;
    }

    createHud() {
      this.progressText = this.add
        .text(this.sceneWidth / 2, 48, "", {
          fontFamily: "'Outfit','Segoe UI',sans-serif",
          fontSize: "28px",
          color: "#0f172a",
          fontStyle: "600",
        })
        .setOrigin(0.5);

      this.tipText = this.add
        .text(this.sceneWidth / 2, this.sceneHeight - 40, "", {
          fontFamily: "'Outfit','Segoe UI',sans-serif",
          fontSize: "24px",
          color: "#1d4ed8",
        })
        .setOrigin(0.5);
      this.tipText.setAlpha(0.9);
    }

    updateProgressText() {
      if (!this.progressText) {
        return;
      }
      this.progressText.setText(
        `Matches ${this.matchesCompleted}/${this.totalPairs}`
      );
    }

    updateTip(message, persistent = false) {
      if (!this.tipText) {
        return;
      }
      if (this.tipTimer) {
        this.tipTimer.remove(false);
        this.tipTimer = null;
      }
      this.tipText.setText(message || "");
      this.tipText.setAlpha(message ? 0.95 : 0);
      if (!persistent && message) {
        this.tipTimer = this.time.addEvent({
          delay: 2600,
          callback: () => {
            this.tipText.setAlpha(0.35);
          },
        });
      }
    }

    createStartOverlay() {
      this.startOverlay = this.add.container(
        this.sceneWidth / 2,
        this.sceneHeight / 2
      );
      this.startOverlay.setDepth(10);
      const scrim = this.add.rectangle(
        0,
        0,
        this.sceneWidth,
        this.sceneHeight,
        0x0f172a,
        0.5
      );
      scrim.setInteractive();
      const panel = this.add.rectangle(0, 0, 540, 360, 0xffffff, 1);
      panel.setStrokeStyle(4, 0x1d4ed8, 0.6);
      const title = this.add
        .text(0, -120, "Matching Challenge", {
          fontFamily: "'Outfit','Segoe UI',sans-serif",
          fontSize: "36px",
          fontStyle: "700",
          color: "#0f172a",
          align: "center",
        })
        .setOrigin(0.5);
      const body = this.add
        .text(
          0,
          -10,
          "Click a keyword on the left, then select the picture that matches it on the right. All keywords must be used once.",
          {
            fontFamily: "'Outfit','Segoe UI',sans-serif",
            fontSize: "20px",
            color: "#1f2937",
            align: "center",
            wordWrap: { width: 460 },
          }
        )
        .setOrigin(0.5);
      const startButton = createButton(this, {
        x: 0,
        y: 110,
        width: 220,
        label: "Start Matching",
        onClick: () => this.beginMatching(false),
      });

      this.startOverlay.add([scrim, panel, title, body, startButton.container]);
      this.startOverlay.setVisible(false);
    }

    showStartOverlay() {
      if (this.startOverlay) {
        this.startOverlay.setVisible(true);
      }
      this.statusController("Press Start to begin matching.");
    }

    hideStartOverlay() {
      if (this.startOverlay) {
        this.startOverlay.setVisible(false);
      }
    }

    createResultOverlay() {
      this.resultOverlay = this.add.container(
        this.sceneWidth / 2,
        this.sceneHeight / 2
      );
      this.resultOverlay.setDepth(11);
      this.resultOverlay.setVisible(false);
      const scrim = this.add.rectangle(
        0,
        0,
        this.sceneWidth,
        this.sceneHeight,
        0x0f172a,
        0.65
      );
      scrim.setInteractive();
      const panel = this.add.rectangle(0, 0, 560, 360, 0xffffff, 1);
      panel.setStrokeStyle(4, 0x0f766e, 0.8);
      const title = this.add
        .text(0, -120, "Great effort!", {
          fontFamily: "'Outfit','Segoe UI',sans-serif",
          fontSize: "36px",
          fontStyle: "700",
          color: "#0f172a",
          align: "center",
        })
        .setOrigin(0.5);
      this.resultSummary = this.add
        .text(0, -20, "", {
          fontFamily: "'Outfit','Segoe UI',sans-serif",
          fontSize: "24px",
          color: "#1f2937",
          align: "center",
          wordWrap: { width: 460 },
        })
        .setOrigin(0.5);

      const replayButton = createButton(this, {
        x: -110,
        y: 110,
        width: 200,
        label: "Replay",
        onClick: () => this.restartGame(true),
      });
      const quitButton = createButton(this, {
        x: 110,
        y: 110,
        width: 200,
        label: "Quit",
        onClick: () => this.handleQuit(),
      });

      this.resultOverlay.add([
        scrim,
        panel,
        title,
        this.resultSummary,
        replayButton.container,
        quitButton.container,
      ]);
      this.replayButton = replayButton;
      this.quitButton = quitButton;
    }

    beginMatching(autoStart) {
      if (this.gameActive) {
        return;
      }
      this.hideStartOverlay();
      this.gameActive = true;
      this.statusController("Match each keyword with an image.");
      this.setInteractionState(true);
      this.reportProgress(false);
      this.updateTip(
        autoStart
          ? "Auto start enabled. Select any keyword."
          : "Pick a keyword to get started."
      );
    }

    setInteractionState(enabled) {
      const toggler = enabled ? "enable" : "disable";
      this.keywordNodes.forEach((node) => node[toggler]());
      this.imageNodes.forEach((node) => node[toggler]());
    }

    handleKeywordSelection(node) {
      if (this.selectedKeyword === node) {
        node.setSelected(false);
        this.selectedKeyword = null;
        this.updateTip("Keyword deselected. Choose another one.");
        return;
      }
      if (this.selectedKeyword) {
        this.selectedKeyword.setSelected(false);
      }
      this.selectedKeyword = node;
      node.setSelected(true);
      this.updateTip("Now select the matching image.");
    }

    handleImageSelection(node) {
      if (!this.selectedKeyword) {
        this.updateTip("Pick a keyword first.", false);
        return;
      }

      const keywordNode = this.selectedKeyword;
      keywordNode.setSelected(false);
      this.selectedKeyword = null;

      const isCorrect = keywordNode.id === node.id;
      keywordNode.setMatched(isCorrect);
      node.setMatched(isCorrect);

      this.drawConnection(keywordNode, node, isCorrect);

      this.matchesCompleted += 1;
      if (isCorrect) {
        this.correctMatches += 1;
      }
      this.updateProgressText();
      this.playFeedbackSound(isCorrect);
      this.connections.push({ keywordNode, imageNode: node, isCorrect });
      this.reportProgress(false);

      if (this.matchesCompleted >= this.totalPairs) {
        this.time.delayedCall(600, () => this.finishGame());
      } else {
        this.updateTip(
          isCorrect ? "Nice match! Keep going." : "Line locked. Continue."
        );
      }
    }

    drawConnection(keywordNode, imageNode, isCorrect) {
      const graphics = this.add.graphics();
      graphics.lineStyle(6, isCorrect ? 0x16a34a : 0xdc2626, 0.9);
      const start = new Phaser.Math.Vector2();
      const end = new Phaser.Math.Vector2();
      keywordNode.container
        .getWorldTransformMatrix()
        .transformPoint(0, 0, start);
      imageNode.container.getWorldTransformMatrix().transformPoint(0, 0, end);
      graphics.beginPath();
      graphics.moveTo(start.x, start.y);
      graphics.lineTo(end.x, end.y);
      graphics.strokePath();
      graphics.setDepth(1);
      this.lineLayer.add(graphics);
    }

    playFeedbackSound(isCorrect) {
      const audioKey = isCorrect
        ? this.correctAudioKey
        : this.incorrectAudioKey;
      if (audioKey && this.sound && this.cache.audio.exists(audioKey)) {
        this.sound.play(audioKey, { volume: 0.5 });
        return;
      }
      tonePlayer.playTone(isCorrect ? 640 : 320, isCorrect ? 240 : 320);
    }

    finishGame() {
      if (this.resultDisplayed) {
        return;
      }
      this.gameActive = false;
      this.setInteractionState(false);
      this.selectedKeyword = null;
      this.showResultMarkers();
      this.reportProgress(true);
      this.updateTip("Review your matches above.", true);
      this.statusController(
        `You matched ${this.correctMatches}/${this.totalPairs} correctly.`
      );
      this.showResultOverlay();
      this.resultDisplayed = true;
    }

    showResultMarkers() {
      this.connections.forEach((connection) => {
        connection.imageNode.badge.show(connection.isCorrect);
      });
    }

    showResultOverlay() {
      if (!this.resultOverlay) {
        return;
      }
      this.resultSummary.setText(
        `You matched ${this.correctMatches} out of ${this.totalPairs} pairs correctly.`
      );
      this.resultOverlay.setVisible(true);
      this.replayButton?.setEnabled(true);
      this.quitButton?.setEnabled(true);
    }

    handleQuit() {
      this.resultOverlay?.setVisible(false);
      this.updateTip("You can close the slide or replay anytime.", true);
      this.statusController(
        "Game finished. You can move on when you are ready."
      );
    }

    restartGame(autoStart = false) {
      this.scene.restart({ autoStart });
    }

    reportProgress(completed) {
      if (!this.onRoundUpdate) {
        return;
      }
      this.onRoundUpdate({
        mode: "matching",
        completedMatches: this.matchesCompleted,
        correctMatches: this.correctMatches,
        total: this.totalPairs,
        completed: Boolean(completed),
      });
    }
  };
};
