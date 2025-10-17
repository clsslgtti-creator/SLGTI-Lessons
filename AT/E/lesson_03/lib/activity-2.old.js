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
      signal?.removeEventListener("abort", handleAbort);
    };

    const handleAbort = () => {
      cleanup();
      resolve();
    };

    timeoutId = window.setTimeout(() => {
      cleanup();
      resolve();
    }, duration);

    if (signal?.aborted) {
      handleAbort();
      return;
    }

    signal?.addEventListener("abort", handleAbort, { once: true });
  });

const createStatus = () => {
  const status = document.createElement("p");
  status.className = "playback-status";
  status.textContent = "";
  return status;
};

const normalizeString = (value) =>
  typeof value === "string" ? value.trim() : "";

const buildHeading = (slide, headingText) => {
  const heading = document.createElement("h2");
  heading.textContent = headingText;
  slide.appendChild(heading);
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

const getRepeatPauseMs = (activityData, fallback = 1500) => {
  const raw =
    activityData?.listen_repeat_pause_ms ?? activityData?.repeat_pause_ms;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }
  return Math.max(500, parsed);
};

const shuffle = (list = []) => {
  const copy = [...list];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
};

const clearSegmentHighlights = (segments = []) => {
  segments.forEach(({ element }) => {
    element?.classList.remove("is-playing");
  });
};

const buildListeningSequenceSlide = (items = [], context = {}) => {
  const {
    activityLabel = "Activity",
    subActivitySuffix = "",
    subActivityLetter = "",
    activityNumber = null,
  } = context;

  const preferredAudioOrder = [
    "audio",
    "audio_a",
    "audio_b",
    "audio_c",
    "audio_d",
    "audio_e",
    "question_audio",
    "answer_audio",
    "prompt_audio",
    "word_audio",
    "sentence_audio",
  ];

  const audioToTextMap = {
    audio: ["text", "prompt", "sentence_text", "word_text", "text_a"],
    audio_a: ["text_a", "prompt_a", "sentence_text", "text"],
    audio_b: ["text_b", "prompt_b", "response", "answer", "text"],
    audio_c: ["text_c", "text_b", "text"],
    audio_d: ["text_d", "text_c", "text_b", "text"],
    audio_e: ["text_e", "text_d", "text_c", "text"],
    question_audio: ["question_text", "text_a", "prompt", "text"],
    answer_audio: ["answer_text", "text_b", "text"],
    prompt_audio: ["prompt", "text"],
    word_audio: ["word_text", "text"],
    sentence_audio: ["sentence_text", "text"],
  };

  const fallbackTextKeys = [
    "text",
    "text_a",
    "text_b",
    "text_c",
    "prompt",
    "sentence_text",
    "word_text",
    "title",
  ];

  const sanitizedItems = (Array.isArray(items) ? items : [])
    .map((item, index) => {
      const existingAudioKeys = new Set(
        Object.keys(item || {}).filter((key) => /audio/i.test(key))
      );
      const orderedAudioKeys = [];
      preferredAudioOrder.forEach((key) => {
        if (existingAudioKeys.has(key)) {
          orderedAudioKeys.push(key);
          existingAudioKeys.delete(key);
        }
      });
      Array.from(existingAudioKeys)
        .sort()
        .forEach((key) => orderedAudioKeys.push(key));

      const segments = orderedAudioKeys
        .map((audioKey) => {
          const url = normalizeString(item?.[audioKey]);
          if (!url) {
            return null;
          }
          const possibleTextKeys = audioToTextMap[audioKey] ?? fallbackTextKeys;
          const text =
            possibleTextKeys
              .map((textKey) => normalizeString(item?.[textKey]))
              .find((value) => value.length) ?? "";
          return { url, text };
        })
        .filter(Boolean);

      if (!segments.length) {
        return null;
      }

      return {
        id: normalizeString(item?.id) || `listen_${index + 1}`,
        title:
          normalizeString(item?.title) ||
          normalizeString(item?.heading) ||
          `Pair ${index + 1}`,
        segments,
      };
    })
    .filter(Boolean);

  const slide = document.createElement("section");
  slide.className = "slide slide--listening";

  buildHeading(slide, `${activityLabel}${subActivitySuffix}`);
  ensureInstructionAnchor(slide);

  const instructionEl = slide.querySelector(".slide__instruction");
  if (instructionEl && instructionEl.textContent.trim().length === 0) {
    instructionEl.textContent =
      "Listen to each audio pair. They will play automatically in order.";
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
  list.className = "dialogue-grid dialogue-grid--listening";
  slide.appendChild(list);

  if (!sanitizedItems.length) {
    const empty = document.createElement("p");
    empty.className = "empty-state";
    empty.textContent = "Listening pairs will be added soon.";
    list.appendChild(empty);
    startBtn.disabled = true;

    const suffixSegment = subActivityLetter ? `-${subActivityLetter}` : "";
    return {
      id: activityNumber
        ? `activity-${activityNumber}${suffixSegment}-activity2-listen`
        : "activity-activity2-listen",
      element: slide,
      autoPlay: {
        button: startBtn,
        trigger: () => {},
        status,
      },
      onLeave: () => {},
    };
  }

  const entries = sanitizedItems.map((entry, index) => {
    const card = document.createElement("article");
    card.className = "dialogue-card dialogue-card--listening";

    const title = document.createElement("h3");
    title.className = "dialogue-card__title";
    title.textContent = entry.title || `Clip ${index + 1}`;
    card.appendChild(title);

    const segments = entry.segments.map((segment, segIndex) => {
      const displayText =
        segment.text ||
        (segIndex === 0 ? "Listen carefully." : `Segment ${segIndex + 1}`);

      const line = document.createElement("p");
      line.className = "dialogue-card__line";
      line.classList.add(
        segIndex === 0
          ? "dialogue-card__line--question"
          : "dialogue-card__line--answer"
      );
      line.textContent = displayText;
      card.appendChild(line);

      return {
        url: segment.url,
        element: displayText ? line : card,
      };
    });

    list.appendChild(card);

    return {
      card,
      segments,
    };
  });

  let sequenceAbort = null;
  let autoTriggered = false;

  const runSequence = async () => {
    if (!entries.length) {
      status.textContent = "No audio available.";
      return;
    }

    sequenceAbort?.abort();
    sequenceAbort = new AbortController();
    const { signal } = sequenceAbort;
    startBtn.disabled = true;
    status.textContent = "Playing...";
    let lastUrl = null;

    try {
      for (let i = 0; i < entries.length; i += 1) {
        const entry = entries[i];
        entry.card.classList.add("is-active");
        smoothScrollIntoView(entry.card);

        for (
          let segIndex = 0;
          segIndex < entry.segments.length;
          segIndex += 1
        ) {
          const segment = entry.segments[segIndex];
          const { url, element } = segment;
          if (!url) {
            continue;
          }

          lastUrl = url;
          status.textContent = "Playing...";
          element?.classList.add("is-playing");
          try {
            await audioManager.play(url, { signal });
          } finally {
            element?.classList.remove("is-playing");
          }

          if (signal.aborted) {
            break;
          }

          let duration = 0;
          try {
            const measured = await audioManager.getDuration(url);
            if (Number.isFinite(measured)) {
              duration = measured;
            }
          } catch {
            duration = 0;
          }

          const gapMs = computeSegmentGapMs("listen", duration, {
            minimum: 500,
            maximum: 1200,
          });
          const hasMoreSegments = segIndex < entry.segments.length - 1;

          if (gapMs > 0 && hasMoreSegments && !signal.aborted) {
            status.textContent = "Next up...";
            await waitMs(gapMs, { signal });
            if (signal.aborted) {
              break;
            }
          }
        }

        clearSegmentHighlights(entry.segments);
        entry.card.classList.remove("is-active");

        if (signal.aborted) {
          break;
        }

        if (i < entries.length - 1 && lastUrl) {
          const betweenGap = getBetweenItemGapMs(lastUrl, { defaultMs: 1200 });
          if (betweenGap > 0) {
            status.textContent = "Preparing next pairs...";
            await waitMs(betweenGap, { signal });
          }
        }
      }
    } catch (error) {
      if (!signal.aborted) {
        console.error(error);
        status.textContent = "Unable to play audio.";
      }
    } finally {
      sequenceAbort = null;
      startBtn.disabled = false;
      status.textContent = signal.aborted
        ? "Playback stopped."
        : "Playback complete.";
      slide._autoTriggered = false;
      autoTriggered = false;
      entries.forEach((entry) => {
        entry.card.classList.remove("is-active");
        clearSegmentHighlights(entry.segments);
      });
    }
  };

  const triggerAutoPlay = () => {
    if (autoTriggered) {
      return;
    }
    autoTriggered = true;
    slide._autoTriggered = true;
    runSequence();
  };

  startBtn.addEventListener("click", triggerAutoPlay);

  const suffixSegment = subActivityLetter ? `-${subActivityLetter}` : "";

  return {
    id: activityNumber
      ? `activity-${activityNumber}${suffixSegment}-activity2-listen`
      : "activity-activity2-listen",
    element: slide,
    autoPlay: {
      button: startBtn,
      trigger: triggerAutoPlay,
      status,
    },
    onLeave: () => {
      sequenceAbort?.abort();
      sequenceAbort = null;
      audioManager.stopAll();
      entries.forEach((entry) => {
        entry.card.classList.remove("is-active");
        clearSegmentHighlights(entry.segments);
      });
      status.textContent = "";
      startBtn.disabled = false;
      autoTriggered = false;
      slide._autoTriggered = false;
    },
  };
};

const buildListenRepeatSlide = (
  pairs = [],
  context = {},
  { repeatPauseMs = 1500 } = {}
) => {
  const {
    activityLabel = "Activity",
    subActivitySuffix = "",
    subActivityLetter = "",
    activityNumber = null,
  } = context;

  const sanitizedPairs = (Array.isArray(pairs) ? pairs : [])
    .map((item, index) => {
      const textA = normalizeString(
        item?.text_a ?? item?.prompt ?? item?.textA
      );
      const textB = normalizeString(
        item?.text_b ?? item?.response ?? item?.textB
      );
      const textC = normalizeString(
        item?.text_c ?? item?.response ?? item?.textC
      );
      const audioA = normalizeString(
        item?.audio_a ?? item?.audioA ?? item?.audio
      );
      const audioB = normalizeString(item?.audio_b ?? item?.audioB);
      const audioC = normalizeString(item?.audio_c ?? item?.audioC);
      if (!textA || !audioA) {
        return null;
      }
      return {
        id: normalizeString(item?.id) || `repeat_${index + 1}`,
        textA,
        textB,
        textC,
        audioA,
        audioB,
        audioC,
      };
    })
    .filter(Boolean);

  const slide = document.createElement("section");
  slide.className =
    "slide slide--listen-repeat listening-slide listening-slide--repeat";

  buildHeading(slide, `${activityLabel}${subActivitySuffix}`);
  ensureInstructionAnchor(slide);

  const instructionEl = slide.querySelector(".slide__instruction");
  if (instructionEl && instructionEl.textContent.trim().length === 0) {
    instructionEl.textContent =
      "Listen, then repeat along with the prompt when it is your turn.";
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
  list.className = "dialogue-grid dialogue-grid--listen-repeat";
  slide.appendChild(list);

  const entries = sanitizedPairs.map((item, index) => {
    const card = document.createElement("article");
    card.className = "dialogue-card listening-repeat-card";

    const title = document.createElement("h3");
    title.className = "dialogue-card__title";
    title.textContent = `Pair ${index + 1}`;
    card.appendChild(title);

    const textsWrapper = document.createElement("div");
    textsWrapper.className = "dialogue-card__texts";

    const lineA = document.createElement("p");
    lineA.className = "dialogue-card__line dialogue-card__line--answer";
    lineA.textContent = item.textA;
    textsWrapper.appendChild(lineA);

    const lineB = document.createElement("p");
    lineB.className = "dialogue-card__line dialogue-card__line--answer";
    lineB.textContent = item.textB;
    textsWrapper.appendChild(lineB);

    const lineC = document.createElement("p");
    lineC.className = "dialogue-card__line dialogue-card__line--answer";
    lineC.textContent = item.textC;
    textsWrapper.appendChild(lineC);

    card.appendChild(textsWrapper);
    list.appendChild(card);

    return {
      item,
      card,
      lineA,
      lineB,
      lineC,
    };
  });

  let runController = null;
  let autoTriggered = false;

  const clearHighlights = (entry) => {
    entry.lineA?.classList.remove("is-playing");
    entry.lineB?.classList.remove("is-playing");
  };

  const runPractice = async () => {
    runController = new AbortController();
    const { signal } = runController;
    try {
      startBtn.disabled = true;
      status.textContent = "Listening...";

      for (const entry of entries) {
        if (signal.aborted) {
          break;
        }
        clearHighlights(entry);
        entry.card.classList.add("is-active");
        smoothScrollIntoView(entry.card);

        entry.lineA?.classList.add("is-playing");
        const firstDuration = await audioManager.play(entry.item.audioA, {
          signal,
        });
        entry.lineA?.classList.remove("is-playing");

        await waitMs(
          computeSegmentGapMs("listen-repeat", firstDuration, {
            minimum: 500,
            maximum: 1200,
          }),
          { signal }
        );

        status.textContent = "Your turn...";
        await waitMs(repeatPauseMs, { signal });

        if (entry.item.audioB) {
          status.textContent = "Listening...";
          entry.lineB?.classList.add("is-playing");
          const secondDuration = await audioManager.play(entry.item.audioB, {
            signal,
          });
          entry.lineB?.classList.remove("is-playing");
          await waitMs(
            computeSegmentGapMs("listen-repeat", secondDuration, {
              minimum: 500,
              maximum: 1200,
            }),
            { signal }
          );
        }

        status.textContent = "Your turn...";
        await waitMs(repeatPauseMs, { signal });

        if (entry.item.audioC) {
          status.textContent = "Listening...";
          entry.lineC?.classList.add("is-playing");
          const thirdDuration = await audioManager.play(entry.item.audioC, {
            signal,
          });
          entry.lineC?.classList.remove("is-playing");
          await waitMs(
            computeSegmentGapMs("listen-repeat", thirdDuration, {
              minimum: 500,
              maximum: 1200,
            }),
            { signal }
          );
        }
        status.textContent = "Your turn...";
        await waitMs(repeatPauseMs, { signal });
        await waitMs(
          getBetweenItemGapMs(entry.item.audioC, { defaultMs: 1200 }),
          { signal }
        );
      }

      showCompletionModal({
        title: "Great Work!",
        message: "You completed the listen and repeat practice.",
      });
    } catch (error) {
      if (signal.aborted) {
        status.textContent = "";
      } else {
        console.error(error);
        status.textContent = "Unable to play audio.";
      }
    } finally {
      runController = null;
      startBtn.disabled = false;
      status.textContent = "";
      autoTriggered = false;
      slide._autoTriggered = false;
      entries.forEach(clearHighlights);
    }
  };

  const triggerAutoPlay = () => {
    if (autoTriggered) {
      return;
    }
    autoTriggered = true;
    slide._autoTriggered = true;
    runPractice();
  };

  startBtn.addEventListener("click", triggerAutoPlay);

  const suffixSegment = subActivityLetter ? `-${subActivityLetter}` : "";

  return {
    id: activityNumber
      ? `activity-${activityNumber}${suffixSegment}-activity2-repeat`
      : "activity-activity2-repeat",
    element: slide,
    autoPlay: {
      button: startBtn,
      trigger: triggerAutoPlay,
      status,
    },
    onLeave: () => {
      runController?.abort();
      runController = null;
      audioManager.stopAll();
      startBtn.disabled = false;
      status.textContent = "";
      autoTriggered = false;
      slide._autoTriggered = false;
      entries.forEach(clearHighlights);
    },
  };
};

const normalizeKeyword = (value) => {
  return typeof value === "string" && value.trim().length
    ? value
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
    : "";
};

const buildMatchingSlide = (items = [], context = {}) => {
  const {
    activityLabel = "Activity",
    subActivitySuffix = "",
    subActivityLetter = "",
    activityNumber = null,
  } = context;

  const usableItems = (Array.isArray(items) ? items : [])
    .map((item, index) => {
      const keyword = normalizeString(
        item?.keyword ?? item?.label ?? item?.text
      );
      const normalizedKeyword = normalizeKeyword(keyword);
      const img = normalizeString(item?.img ?? item?.image);
      if (!keyword || !normalizedKeyword || !img) {
        return null;
      }
      return {
        index,
        keyword,
        normalizedKeyword,
        img,
        caption: normalizeString(item?.caption ?? ""),
      };
    })
    .filter(Boolean);

  const slide = document.createElement("section");
  slide.className = "slide slide--pre-listening";
  slide.innerHTML = `
    <h2>${activityLabel}${subActivitySuffix}</h2>
    <p class="slide__instruction">Match each picture with the correct phrase.</p>
  `;

  const layout = document.createElement("div");
  layout.className = "pre-listening-layout";
  slide.appendChild(layout);

  const gallery = document.createElement("div");
  gallery.className = "pre-listening-gallery";
  layout.appendChild(gallery);

  const dropzonesWrapper = document.createElement("div");
  dropzonesWrapper.className = "pre-listening-dropzones";
  layout.appendChild(dropzonesWrapper);

  if (!usableItems.length) {
    const empty = document.createElement("p");
    empty.className = "empty-state";
    empty.textContent = "Matching activity will appear here soon.";
    layout.appendChild(empty);

    const suffixSegment = subActivityLetter ? `-${subActivityLetter}` : "";
    return {
      id: activityNumber
        ? `activity-${activityNumber}${suffixSegment}-activity2-match`
        : "activity-activity2-match",
      element: slide,
      onLeave: () => {},
    };
  }

  const shuffledCards = shuffle(usableItems);
  const cards = [];
  const cardItems = [];

  shuffledCards.forEach((item) => {
    const card = document.createElement("div");
    card.className = "pre-listening-card";
    card.dataset.keyword = item.normalizedKeyword;
    card.dataset.label = item.caption || "";

    const media = document.createElement("div");
    media.className = "pre-listening-card__media";
    const img = document.createElement("img");
    img.src = item.img;
    img.alt = item.keyword;
    img.loading = "lazy";
    media.appendChild(img);
    card.appendChild(media);

    const caption = document.createElement("span");
    caption.className = "pre-listening-card__caption";
    caption.textContent = item.caption || "";
    card.appendChild(caption);

    gallery.appendChild(card);
    cards.push(card);
    cardItems.push(item);
  });

  const dropItems = shuffle(cardItems);

  dropItems.forEach((item) => {
    const dropzone = document.createElement("div");
    dropzone.className = "pre-listening-dropzone";
    dropzone.dataset.keyword = item.normalizedKeyword;
    dropzone.dataset.complete = "false";

    const label = document.createElement("span");
    label.className = "pre-listening-dropzone__label";
    label.textContent = item.keyword;
    dropzone.appendChild(label);

    const body = document.createElement("div");
    body.className = "pre-listening-dropzone__body";
    dropzone.appendChild(body);

    dropzonesWrapper.appendChild(dropzone);
  });

  const suffixSegment = subActivityLetter ? `-${subActivityLetter}` : "";

  const resetMatching = () => {
    const $ = window.jQuery;
    if (!$) {
      return;
    }

    const $gallery = $(gallery);

    cards.forEach((card) => {
      const $card = $(card);
      $card.removeClass("is-correct is-incorrect is-active");
      $card
        .find(".pre-listening-card__caption")
        .removeClass("is-visible")
        .text($card.attr("data-label") || "");
      $gallery.append(card);
      if ($card.data("uiDraggable")) {
        $card.draggable("enable");
        $card.draggable("option", "revert", "invalid");
      }
      $card.css({ top: "", left: "", position: "relative" });
    });

    $(dropzonesWrapper)
      .find(".pre-listening-dropzone")
      .each(function () {
        const $zone = $(this);
        $zone
          .removeClass("is-correct is-incorrect is-hover")
          .data("complete", false);
        $zone.find(".pre-listening-dropzone__label").removeClass("is-hidden");
        $zone.find(".pre-listening-dropzone__body").empty();
        if ($zone.data("uiDroppable")) {
          $zone.droppable("enable");
        }
      });
  };

  let initialized = false;

  const setupInteractions = () => {
    const $ = window.jQuery;
    if (!$) {
      console.warn(
        "[Activity-2] Matching slide requires jQuery + jQuery UI for full interactivity."
      );
      return;
    }

    if (!$.fn?.draggable || !$.fn?.droppable) {
      console.warn(
        "[Activity-2] Matching slide requires jQuery UI draggable and droppable widgets."
      );
      return;
    }

    const $cards = $(cards);
    const $dropzones = $(dropzonesWrapper).find(".pre-listening-dropzone");

    $cards.each(function () {
      const $card = $(this);
      if ($card.data("uiDraggable")) {
        $card.draggable("destroy");
      }
      $card.draggable({
        containment: slide,
        revert: "invalid",
        start() {
          $card.addClass("is-active");
        },
        stop() {
          $card.removeClass("is-active");
          $card.css("z-index", "");
        },
      });
    });

    $dropzones.each(function () {
      const $zone = $(this);
      if ($zone.data("uiDroppable")) {
        $zone.droppable("destroy");
      }
      $zone
        .removeClass("is-correct is-incorrect is-hover")
        .data("complete", false);
      $zone.droppable({
        accept: ".pre-listening-card",
        tolerance: "intersect",
        over() {
          $zone.addClass("is-hover");
        },
        out() {
          $zone.removeClass("is-hover");
        },
        drop(event, ui) {
          $zone.removeClass("is-hover is-incorrect is-correct");

          const $card = ui.draggable;
          const expected = $zone.data("keyword");
          const received = $card.data("keyword");

          if ($zone.data("complete")) {
            $card.draggable("option", "revert", true);
            window.setTimeout(() => {
              $card.draggable("option", "revert", "invalid");
            }, 0);
            return;
          }

          if (expected !== received) {
            $zone.addClass("is-incorrect");
            $card.addClass("is-incorrect");
            window.setTimeout(() => {
              $zone.removeClass("is-incorrect");
              $card.removeClass("is-incorrect");
              $card.draggable("option", "revert", true);
              $card.trigger("mouseup");
              $card.draggable("option", "revert", "invalid");
            }, 650);
            return;
          }

          $zone.data("complete", true);
          $zone.addClass("is-correct");
          $zone.find(".pre-listening-dropzone__label").addClass("is-hidden");
          $card.addClass("is-correct").css({
            position: "relative",
            top: 0,
            left: 0,
          });
          $card.find(".pre-listening-card__caption").addClass("is-visible");

          $card.draggable("disable");
          $zone.find(".pre-listening-dropzone__body").append($card);
          $zone.droppable("disable");

          const allMatched = $dropzones
            .toArray()
            .every((zoneEl) => $(zoneEl).data("complete"));
          if (allMatched) {
            showCompletionModal({
              title: "Well done!",
              message: "You matched all of the pictures correctly.",
            });
          }
        },
      });
    });

    initialized = true;
  };

  return {
    id: activityNumber
      ? `activity-${activityNumber}${suffixSegment}-activity2-match`
      : "activity-activity2-match",
    element: slide,
    onEnter: () => {
      window.setTimeout(() => {
        if (!initialized) {
          setupInteractions();
        } else {
          resetMatching();
          setupInteractions();
        }
      }, 40);
    },
    onLeave: () => {
      resetMatching();
    },
  };
};

const createSubActivityContext = (base, letter) => ({
  activityLabel: base.activityLabel,
  activityNumber: base.activityNumber,
  subActivitySuffix: letter ? letter : "",
  subActivityLetter: letter || "",
});

const pickArray = (source, keys = []) => {
  if (!source) {
    return null;
  }
  for (const key of keys) {
    const value = source?.[key];
    if (Array.isArray(value) && value.length) {
      return value;
    }
  }
  return null;
};

export const buildActivityTwoSlides = (activityData = {}, context = {}) => {
  const { activityNumber } = context;
  const activityLabel = activityNumber
    ? `Activity ${activityNumber}`
    : "Activity";

  const baseContext = {
    activityLabel,
    activityNumber,
  };

  const listenItems =
    pickArray(activityData, ["listen", "listen_items", "items", "questions"]) ??
    pickArray(activityData?.content, [
      "listen",
      "activity_listen",
      "activity_a",
    ]) ??
    [];

  const repeatItems =
    pickArray(activityData, [
      "listen_repeat",
      "listenAndRepeat",
      "repeat",
      "pairs",
    ]) ??
    pickArray(activityData?.content, [
      "listen_repeat",
      "activity_listen_repeat",
      "activity_b",
    ]) ??
    [];

  const matchingItems =
    pickArray(activityData, ["matching", "match", "cards"]) ??
    pickArray(activityData?.content, [
      "matching",
      "match",
      "activity_c",
      "cards",
    ]) ??
    [];

  const slides = [];

  if (listenItems.length) {
    slides.push(
      buildListeningSequenceSlide(
        listenItems,
        createSubActivityContext(baseContext, "a")
      )
    );
  }

  if (repeatItems.length) {
    const repeatPauseMs = getRepeatPauseMs(activityData);
    slides.push(
      buildListenRepeatSlide(
        repeatItems,
        createSubActivityContext(baseContext, "b"),
        { repeatPauseMs }
      )
    );
  }

  if (matchingItems.length) {
    slides.push(
      buildMatchingSlide(
        matchingItems,
        createSubActivityContext(baseContext, "c")
      )
    );
  }

  return slides;
};
