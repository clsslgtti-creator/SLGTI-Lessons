const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

const sanitizeOptions = (rawOptions = []) => {
  if (!Array.isArray(rawOptions)) {
    return [];
  }
  const trimmed = rawOptions
    .map((option) =>
      typeof option === "string" ? option.trim() : ""
    )
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
  correct: "assets/audio/game/correct.mp3",
  incorrect: "assets/audio/game/incorrect.mp3",
  timeout: "assets/audio/game/timeout.mp3",
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
    gainNode.gain.exponentialRampToValueAtTime(
      0.1,
      context.currentTime + 0.02
    );
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
      this.examples = examples;
      this.questions = questions;
      this.options = options;
      this.feedbackAssets = feedbackAssets;
      this.exampleIndex = -1;
      this.questionIndex = -1;
      this.countdownShown = false;
      this.awaitingAnswer = false;
      this.score = 0;
      this.totalQuestions = questions.length;
      this.timerEvent = null;
      this.answerDeadline = 0;
      this.activeSentenceSound = null;
      this.gameOver = false;
      this.didNotifyReady = false;
    }

    preload() {
      this.load.once("complete", () => {
        statusElement.textContent = "";
        statusElement.classList.remove("is-visible");
        statusElement.classList.remove("is-error");
        statusElement.classList.remove("is-transparent");
      });
      this.load.on("loaderror", (file) => {
        if (file.key === "feedback-correct") {
          this.feedbackAssets.correct = null;
        }
        if (file.key === "feedback-incorrect") {
          this.feedbackAssets.incorrect = null;
        }
        if (file.key === "feedback-timeout") {
          this.feedbackAssets.timeout = null;
        }
      });
      this.questions.forEach((item) => {
        if (item.audioKey && item.audio) {
          this.load.audio(item.audioKey, item.audio);
        }
      });
      if (this.feedbackAssets.correct) {
        this.load.audio("feedback-correct", this.feedbackAssets.correct);
      }
      if (this.feedbackAssets.incorrect) {
        this.load.audio("feedback-incorrect", this.feedbackAssets.incorrect);
      }
      if (this.feedbackAssets.timeout) {
        this.load.audio("feedback-timeout", this.feedbackAssets.timeout);
      }
    }

    create() {
      const { width, height } = this.sys.game.canvas;
      this.cameras.main.setBackgroundColor("#eef2f9");

      const bg = this.add.rectangle(
        width / 2,
        height / 2,
        width * 0.9,
        height * 0.9,
        0xffffff,
        0.95
      );
      bg.setStrokeStyle(6, 0x1f6feb, 0.15);
      bg.setShadow(0, 20, 0x0f172a, 0.15, 0, 0, true);

      this.topBar = this.add.rectangle(
        width / 2,
        90,
        width * 0.8,
        120,
        0x1f6feb,
        0.08
      );
      this.topBar.setStrokeStyle(3, 0x1f6feb, 0.3);
      this.topBar.setOrigin(0.5);

      this.phaseText = this.add
        .text(width / 2, 50, "Examples", {
          fontFamily: 'Segoe UI, "Helvetica Neue", Arial, sans-serif',
          fontSize: "32px",
          color: "#1f2933",
          fontStyle: "bold",
        })
        .setOrigin(0.5, 0);

      this.scoreText = this.add
        .text(width - 140, 50, `Score: 0/${this.totalQuestions}`, {
          fontFamily: 'Segoe UI, "Helvetica Neue", Arial, sans-serif',
          fontSize: "28px",
          color: "#1f2933",
        })
        .setOrigin(1, 0);

      this.timerText = this.add
        .text(140, 50, "", {
          fontFamily: 'Segoe UI, "Helvetica Neue", Arial, sans-serif',
          fontSize: "28px",
          color: "#1f2933",
        })
        .setOrigin(0, 0);

      const sentenceCardWidth = clamp(width * 0.78, 640, 980);
      const sentenceCardHeight = clamp(height * 0.32, 180, 240);

      this.sentenceCardWidth = sentenceCardWidth;
      this.sentenceCardHeight = sentenceCardHeight;
      const sentenceBg = this.add
        .rectangle(0, 0, sentenceCardWidth, sentenceCardHeight, 0xffffff, 0.95)
        .setStrokeStyle(4, 0x1f6feb, 0.28);

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
        sentenceBg,
        this.sentenceText,
      ]);

      this.feedbackGroup = this.add.container(width / 2, height / 2 + sentenceCardHeight / 2 + 80);
      this.feedbackGroup.setAlpha(0);

      this.feedbackBubble = this.add
        .rectangle(0, 0, clamp(width * 0.42, 260, 420), 120, 0xffffff, 0.98)
        .setStrokeStyle(3, 0x1f2933, 0.15);

      this.feedbackIcon = this.add.graphics();
      this.feedbackLabel = this.add
        .text(0, 0, "", {
          fontFamily: 'Segoe UI, "Helvetica Neue", Arial, sans-serif',
          fontSize: clamp(width * 0.026, 22, 30),
          color: "#1f2933",
          fontStyle: "bold",
        })
        .setOrigin(0.5);

      this.feedbackGroup.add([this.feedbackBubble, this.feedbackIcon, this.feedbackLabel]);

      this.countdownOverlay = this.add.container(width / 2, height / 2);
      const overlayBg = this.add.rectangle(0, 0, width * 0.6, height * 0.6, 0x000000, 0.55);
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

      this.summaryOverlay = this.add.container(width / 2, height / 2);
      const summaryBg = this.add.rectangle(
        0,
        0,
        clamp(width * 0.68, 520, 760),
        clamp(height * 0.6, 420, 520),
        0xffffff,
        0.97
      );
      summaryBg.setStrokeStyle(4, 0x1f6feb, 0.3);
      summaryBg.setShadow(0, 20, 0x0f172a, 0.18, 12, 18, true);

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
      const replayButtonBg = this.add
        .rectangle(0, 120, replayWidth, replayHeight, 0x1f6feb, 1)
        .setStrokeStyle(0);
      replayButtonBg.setInteractive({ useHandCursor: true });
      const replayLabel = this.add
        .text(0, 120, "Replay", {
          fontFamily: 'Segoe UI, "Helvetica Neue", Arial, sans-serif',
          fontSize: clamp(width * 0.028, 22, 28),
          color: "#ffffff",
          fontStyle: "bold",
        })
        .setOrigin(0.5);

      replayButtonBg.on("pointerover", () => {
        replayButtonBg.setFillStyle(0x1748ad, 1);
      });
      replayButtonBg.on("pointerout", () => {
        replayButtonBg.setFillStyle(0x1f6feb, 1);
      });
      replayButtonBg.on("pointerdown", () => {
        this.restartGame();
      });
      this.summaryOverlay.add([
        summaryBg,
        this.summaryTitle,
        this.summaryBody,
        replayButtonBg,
        replayLabel,
      ]);
      this.summaryOverlay.setAlpha(0);
      this.summaryOverlay.setVisible(false);

      this.optionButtons = this.createOptionButtons(width, height, this.options);
      this.enableOptionButtons(false);
      this.advance();

    }

    createOptionButtons(width, height, options) {
      const buttons = [];
      const buttonWidth = clamp(width * 0.32, 260, 420);
      const buttonHeight = clamp(height * 0.16, 120, 140);
      const horizontalSpacing = clamp(width * 0.26, 220, 320);
      const baseY = height - clamp(height * 0.18, 140, 180);

      options.forEach((label, index) => {
        const container = this.add.container(
          width / 2 + (index === 0 ? -horizontalSpacing : horizontalSpacing),
          baseY
        );
        const bg = this.add
          .rectangle(0, 0, buttonWidth, buttonHeight, 0xffffff, 0.96)
          .setStrokeStyle(4, 0x1f6feb, 0.6);

        const text = this.add
          .text(0, 0, label, {
            fontFamily: 'Segoe UI, "Helvetica Neue", Arial, sans-serif',
            fontSize: clamp(width * 0.03, 26, 32),
            color: "#1f2933",
            align: "center",
            wordWrap: { width: buttonWidth - 40 },
          })
          .setOrigin(0.5);

        container.add([bg, text]);
        container.setSize(buttonWidth, buttonHeight);
        container.setInteractive(
          new Phaser.Geom.Rectangle(-buttonWidth / 2, -buttonHeight / 2, buttonWidth, buttonHeight),
          Phaser.Geom.Rectangle.Contains
        );

        container.on("pointerover", () => {
          if (!this.awaitingAnswer) {
            return;
          }
          bg.setFillStyle(0x1f6feb, 0.12);
        });
        container.on("pointerout", () => {
          bg.setFillStyle(0xffffff, 0.96);
        });
        container.on("pointerdown", () => {
          if (!this.awaitingAnswer || this.gameOver) {
            return;
          }
          this.handleAnswer(label);
        });

        buttons.push({ container, background: bg, label: text, value: label });
      });

      return buttons;
    }

    enableOptionButtons(enabled) {
    this.optionButtons.forEach((button) => {
      button.container.disableInteractive();
      if (enabled) {
        button.container.setInteractive();
      }
      button.background.setFillStyle(0xffffff, enabled ? 0.96 : 0.5);
      button.background.setStrokeStyle(4, 0x1f6feb, enabled ? 0.6 : 0.25);
    });
  }

    updateScore() {
      this.scoreText.setText(`Score: ${this.score}/${this.totalQuestions}`);
    }

    advance() {
      if (this.gameOver) {
        return;
      }
      this.awaitingAnswer = false;
      this.enableOptionButtons(false);
      this.stopSentenceAudio();
      this.hideFeedback();
      this.updateTimerText("");

      if (this.examples.length && this.exampleIndex < this.examples.length - 1) {
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
        const sound = this.sound.get(entry.audioKey) ?? this.sound.add(entry.audioKey);
        if (sound) {
          sound.play();
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
      if (targetButton) {
        this.pulseButton(targetButton, 0x16a34a);
      }

      this.time.delayedCall(800, () => {
        this.showFeedback("correct", "Example");
      });

      this.time.delayedCall(1600, () => {
        this.slideOutCurrent(() => this.advance());
      });
    }

    startResponseTimer() {
      const durationMs = 3000;
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
            this.updateTimerText("");
            this.handleTimeout();
            return;
          }
          this.updateTimerText(`Time: ${(remaining / 1000).toFixed(1)}s`);
        },
      });
    }

    updateTimerText(text) {
      this.timerText.setText(text);
    }

    handleAnswer(selected) {
      if (!this.awaitingAnswer || this.gameOver) {
        return;
      }
      this.awaitingAnswer = false;
      this.enableOptionButtons(false);
      this.timerEvent?.remove();
      this.timerEvent = null;
      this.updateTimerText("");

      const current = this.questions[this.questionIndex];
      const isCorrect =
        current &&
        selected.toLowerCase() === current.answer.toLowerCase();
      if (isCorrect) {
        this.score += 1;
        this.updateScore();
        this.playFeedbackSound("correct");
        this.showFeedback("correct", "Correct!");
      } else {
        this.playFeedbackSound("incorrect");
        this.showFeedback(
          "incorrect",
          `Incorrect — Answer: ${current?.answer ?? ""}`
        );
      }

      const targetButton = this.optionButtons.find(
        (btn) => btn.value.toLowerCase() === selected.toLowerCase()
      );
      if (targetButton) {
        this.pulseButton(
          targetButton,
          isCorrect ? 0x16a34a : 0xdc2626
        );
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
      this.playFeedbackSound("timeout");
      const current = this.questions[this.questionIndex];
      this.showFeedback(
        "timeout",
        current
          ? `Time's up — Answer: ${current.answer}`
          : "Time's up!"
      );
      this.time.delayedCall(1400, () => {
        this.slideOutCurrent(() => this.advance());
      });
    }

    playFeedbackSound(type) {
      const keyMap = {
        correct: "feedback-correct",
        incorrect: "feedback-incorrect",
        timeout: "feedback-timeout",
      };
      const key = keyMap[type];
      if (key && this.sound.get(key)) {
        this.sound.play(key);
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
      this.feedbackBubble.setStrokeStyle(3, borderColor, 0.35);
      this.feedbackLabel.setColor("#1f2933");
      this.feedbackLabel.setText(message);
      this.feedbackIcon.clear();
      if (kind === "correct") {
        this.feedbackIcon.lineStyle(10, 0x16a34a, 1);
        this.feedbackIcon.beginPath();
        this.feedbackIcon.moveTo(-50, 0);
        this.feedbackIcon.lineTo(-20, 32);
        this.feedbackIcon.lineTo(36, -28);
        this.feedbackIcon.strokePath();
      } else if (kind === "incorrect") {
        this.feedbackIcon.lineStyle(10, 0xdc2626, 1);
        this.feedbackIcon.beginPath();
        this.feedbackIcon.moveTo(-36, -28);
        this.feedbackIcon.lineTo(36, 28);
        this.feedbackIcon.moveTo(36, -28);
        this.feedbackIcon.lineTo(-36, 28);
        this.feedbackIcon.strokePath();
      } else if (kind === "timeout") {
        this.feedbackIcon.lineStyle(10, 0xf97316, 1);
        this.feedbackIcon.beginPath();
        this.feedbackIcon.moveTo(-40, -24);
        this.feedbackIcon.lineTo(-40, 24);
        this.feedbackIcon.moveTo(-10, -24);
        this.feedbackIcon.lineTo(-10, 24);
        this.feedbackIcon.moveTo(34, 0);
        this.feedbackIcon.arc(4, 0, 38, Phaser.Math.DegToRad(-90), Phaser.Math.DegToRad(180), false);
        this.feedbackIcon.strokePath();
      }
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
      this.feedbackIcon.clear();
    }

    pulseButton(button, color) {
      button.background.setStrokeStyle(4, color, 0.7);
      button.background.setFillStyle(0xffffff, 0.96);
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
            this.playFeedbackSound("timeout");
          } else if (value === 0) {
            this.countdownText.setText("Start!");
            this.playFeedbackSound("correct");
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
      this.enableOptionButtons(false);
      this.stopSentenceAudio();
      this.timerEvent?.remove();
      this.timerEvent = null;
      this.updateTimerText("");
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
        percentage === 100 ? "Outstanding!" : percentage >= 60 ? "Great Job!" : "Keep Practicing!"
      );

      this.summaryBody.setText(
        `You answered ${this.score} out of ${this.totalQuestions} sentences correctly.\nYour score: ${percentage}%`
      );
      this.summaryOverlay.setVisible(true);
      this.tweens.add({
        targets: this.summaryOverlay,
        alpha: 1,
        scale: { from: 0.9, to: 1 },
        duration: 360,
        ease: "Back.easeOut",
      });
    }

    restartGame() {
      this.sound.stopAll();
      this.scene.restart();
    }

    shutdown() {
      this.sound.stopAll();
      this.timerEvent?.remove();
      this.timerEvent = null;
      this.events.removeAllListeners();
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

  const status = document.createElement("div");
  status.className = "game1-status is-visible";
  status.textContent = "Loading game…";

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
        id: activityNumber ? `activity-${activityNumber}-game1` : "activity-game1",
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
      status.textContent = "Phaser library is missing. Please reload the lesson.";
      status.classList.add("is-error");
      return;
    }

    if (gameInstance) {
      gameInstance.destroy(true);
      gameInstance = null;
      stage.innerHTML = "";
    }

    status.textContent = "Preparing game…";
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
          status.textContent = `Example ${info.exampleIndex + 1} of ${info.exampleTotal}`;
        } else if (info.mode === "questions") {
          status.textContent = `Question ${info.questionIndex + 1} of ${info.questionTotal}`;
        }
        if (info.mode) {
          status.classList.add("is-transparent");
        }
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
      },
      scene: GameScene,
    });
  };

  const destroyGame = () => {
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
      id: activityNumber ? `activity-${activityNumber}-game1` : "activity-game1",
      element: slide,
      onEnter: startGame,
      onLeave: destroyGame,
    },
  ];
};
