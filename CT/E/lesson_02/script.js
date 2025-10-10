import { buildSbsSlides } from "./lib/sbs.js";
// import { buildPronunciationSlides } from "./lib/pronunciation.js";

const slidesContainer = document.getElementById("slides");
const progressIndicator = document.getElementById("progressIndicator");
const prevBtn = document.getElementById("prevSlide");
const nextBtn = document.getElementById("nextSlide");
const lessonMetaEl = document.getElementById("lessonMeta");

// SCORM integration helpers keep track of the LMS lifecycle and resume data.
const scormState = {
  api: null,
  attemptedInit: false,
  connected: false,
  resumeIndex: 0,
  completionRecorded: false,
  lastSavedIndex: null,
  lastSavedTotal: null,
  exitRegistered: false,
  quitting: false,
};

const safeParseIndex = (value) => {
  if (typeof value === "number" && Number.isFinite(value)) {
    const normalized = Math.max(0, Math.floor(value));
    return normalized;
  }
  if (typeof value === "string" && value.trim().length) {
    const parsed = Number.parseInt(value, 10);
    if (!Number.isNaN(parsed) && parsed >= 0) {
      return parsed;
    }
  }
  return null;
};

const readSuspendPayload = (raw) => {
  if (typeof raw !== "string" || !raw.trim().length) {
    return {};
  }
  try {
    return JSON.parse(raw);
  } catch {
    return {};
  }
};

const commitAndExitScorm = () => {
  if (!scormState.connected || scormState.quitting || !scormState.api) {
    return;
  }
  scormState.quitting = true;
  try {
    scormState.api.save();
  } catch {}
  try {
    scormState.api.quit();
  } catch {}
};

const ensureScormConnection = () => {
  if (scormState.attemptedInit) {
    return scormState.connected;
  }
  scormState.attemptedInit = true;

  const scorm = window?.pipwerks?.SCORM;
  if (!scorm) {
    return false;
  }

  scorm.version = "1.2";
  if (!scorm.init()) {
    return false;
  }

  scormState.api = scorm;
  scormState.connected = true;

  try {
    const status = scorm.get("cmi.core.lesson_status");
    if (status === "completed" || status === "passed") {
      scormState.completionRecorded = true;
    } else if (!status || status === "not attempted" || status === "unknown") {
      scorm.set("cmi.core.lesson_status", "incomplete");
    }

    const fromLocation = safeParseIndex(scorm.get("cmi.core.lesson_location"));
    const suspendPayload = readSuspendPayload(scorm.get("cmi.suspend_data"));
    const fromSuspend = safeParseIndex(suspendPayload.currentSlide);
    if (typeof suspendPayload.totalSlides === "number") {
      scormState.lastSavedTotal = suspendPayload.totalSlides;
    }
    const resumeCandidate = fromLocation ?? fromSuspend ?? 0;
    scormState.resumeIndex =
      typeof resumeCandidate === "number" && resumeCandidate >= 0
        ? resumeCandidate
        : 0;
  } catch (error) {
    console.warn("[SCORM] Unable to read initial state.", error);
    scormState.resumeIndex = 0;
  }

  if (!scormState.exitRegistered) {
    const handleExit = () => commitAndExitScorm();
    window.addEventListener("beforeunload", handleExit, { capture: false });
    window.addEventListener("unload", handleExit, { capture: false });
    window.addEventListener("pagehide", handleExit, { capture: false });
    scormState.exitRegistered = true;
  }

  return true;
};

const getResumeSlideIndex = (totalSlides) => {
  if (!scormState.connected || !Number.isInteger(totalSlides) || totalSlides <= 0) {
    return 0;
  }
  const upperBound = totalSlides - 1;
  const requested = scormState.resumeIndex;
  if (!Number.isInteger(requested)) {
    return 0;
  }
  return Math.max(0, Math.min(upperBound, requested));
};

const persistScormProgress = (index, totalSlides) => {
  if (!ensureScormConnection() || !scormState.api) {
    return;
  }
  if (!Number.isInteger(index) || index < 0) {
    return;
  }

  const normalizedTotal =
    Number.isInteger(totalSlides) && totalSlides > 0 ? totalSlides : null;
  if (
    scormState.lastSavedIndex === index &&
    scormState.lastSavedTotal === normalizedTotal &&
    !scormState.completionRecorded
  ) {
    // Skip redundant writes during navigation when nothing changed.
    return;
  }

  scormState.lastSavedIndex = index;
  scormState.resumeIndex = index;
  scormState.lastSavedTotal = normalizedTotal;

  const payload = {
    currentSlide: index,
    totalSlides: normalizedTotal,
    completed: scormState.completionRecorded,
    timestamp: new Date().toISOString(),
  };

  try {
    scormState.api.set("cmi.core.lesson_location", String(index));
    scormState.api.set("cmi.suspend_data", JSON.stringify(payload));
    if (!scormState.completionRecorded) {
      scormState.api.set("cmi.core.exit", "suspend");
      scormState.api.set("cmi.core.lesson_status", "incomplete");
    }
    scormState.api.save();
  } catch (error) {
    console.error("[SCORM] Unable to record learner progress.", error);
  }
};

const markLessonComplete = (index, totalSlides) => {
  if (!ensureScormConnection() || !scormState.api || scormState.completionRecorded) {
    return;
  }

  scormState.completionRecorded = true;
  scormState.resumeIndex = index;

  const payload = {
    currentSlide: index,
    totalSlides,
    completed: true,
    timestamp: new Date().toISOString(),
  };

  try {
    scormState.api.set("cmi.core.lesson_status", "completed");
    scormState.api.set("cmi.core.exit", "normal");
    scormState.api.set("cmi.core.lesson_location", String(index));
    scormState.api.set("cmi.suspend_data", JSON.stringify(payload));
    scormState.api.save();
  } catch (error) {
    console.error("[SCORM] Unable to persist completion.", error);
  }
};

const activityBuilders = {
  SBS: buildSbsSlides,
  // PRONUNCIATION: buildPronunciationSlides,
};

const extractInstructionEntries = (input, { allowObject = false } = {}) => {
  const entries = [];

  const pushEntry = (textValue, audioValue) => {
    const text = typeof textValue === "string" ? textValue.trim() : "";
    const audio = typeof audioValue === "string" ? audioValue.trim() : "";
    if (!text && !audio) {
      return;
    }
    entries.push({
      text,
      audio: audio || null,
    });
  };

  const process = (value, allowNested) => {
    if (!value) {
      return;
    }

    if (Array.isArray(value)) {
      value.forEach((item) => process(item, allowNested));
      return;
    }

    if (typeof value === "string") {
      pushEntry(value, null);
      return;
    }

    if (typeof value === "object") {
      const hasText = typeof value.text === "string";
      const hasAudio = typeof value.audio === "string";

      if (hasText || hasAudio) {
        pushEntry(hasText ? value.text : "", hasAudio ? value.audio : null);
      }

      if (allowNested) {
        Object.entries(value).forEach(([key, nested]) => {
          if (key === "text" || key === "audio") {
            return;
          }
          process(nested, true);
        });
      }
    }
  };

  process(input, allowObject);
  return entries;
};

const createFocusElement = (focusText) => {
  const trimmed = typeof focusText === "string" ? focusText.trim() : "";
  if (!trimmed) {
    return null;
  }

  const focusEl = document.createElement("p");
  focusEl.className = "activity-focus";

  const label = document.createElement("span");
  label.className = "activity-focus__label";
  label.textContent = "Focus";

  focusEl.appendChild(label);
  focusEl.append(`: ${trimmed}`);

  return focusEl;
};

const createInstructionsElement = (texts) => {
  const normalized = Array.isArray(texts)
    ? texts.filter((text) => typeof text === "string" && text.trim().length)
    : [];
  if (!normalized.length) {
    return null;
  }

  if (normalized.length === 1) {
    const paragraph = document.createElement("p");
    paragraph.className = "activity-instructions";
    paragraph.textContent = normalized[0];
    return paragraph;
  }

  const list = document.createElement("ul");
  list.className = "activity-instructions";
  normalized.forEach((item) => {
    const li = document.createElement("li");
    li.textContent = item;
    list.appendChild(li);
  });
  return list;
};

const normalizeInstructionKey = (key) => {
  if (typeof key !== "string" && typeof key !== "number") {
    return "";
  }
  return key
    .toString()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");
};

const createInstructionResolver = (instructions, activityNumber) => {
  if (instructions === null || instructions === undefined) {
    return {
      isGeneral: false,
      resolve: () => ({ texts: [], audio: null }),
    };
  }

  const generalEntries = extractInstructionEntries(instructions, {
    allowObject: true,
  });

  const isSimpleGeneral =
    Array.isArray(instructions) ||
    typeof instructions === "string" ||
    (typeof instructions === "object" &&
      instructions &&
      !Array.isArray(instructions) &&
      ("text" in instructions || "audio" in instructions));

  const formatEntries = (entries) => {
    const texts = entries.map((entry) => entry.text).filter(Boolean);
    const audio = entries.find((entry) => entry.audio)?.audio ?? null;
    return {
      texts,
      audio,
    };
  };

  if (isSimpleGeneral) {
    return {
      isGeneral: true,
      resolve: () => formatEntries(generalEntries),
    };
  }

  if (typeof instructions !== "object") {
    return {
      isGeneral: false,
      resolve: () => ({ texts: [], audio: null }),
    };
  }

  const map = new Map();
  Object.entries(instructions).forEach(([key, value]) => {
    const normalizedKey = normalizeInstructionKey(key);
    if (!normalizedKey) {
      return;
    }
    const entryList = extractInstructionEntries(value, { allowObject: true });
    if (!entryList.length) {
      return;
    }
    map.set(normalizedKey, entryList);
  });

  const fallbackValues = Array.from(map.values());
  const fallbackDefault = fallbackValues.length ? fallbackValues[0] : [];
  const generalKeys = ["default", "general", "all", "common"];

  const resolve = ({ role, letter }) => {
    const candidates = [];
    const addCandidates = (...keys) => {
      keys.forEach((candidate) => {
        if (candidate) {
          candidates.push(candidate);
        }
      });
    };

    const number = activityNumber ? String(activityNumber) : null;

    if (letter) {
      addCandidates(
        number ? `activity_${number}_${letter}` : "",
        number ? `activity${number}${letter}` : "",
        number && number !== "1" ? `activity_1_${letter}` : "",
        number && number !== "1" ? `activity1${letter}` : "",
        `activity_${letter}`,
        `activity${letter}`
      );
    }

    switch (role) {
      case "model":
        addCandidates(
          number ? `activity_${number}_model` : "",
          number ? `activity${number}model` : "",
          number ? `activity_${number}_example` : "",
          number ? `activity${number}example` : "",
          "model",
          "example",
          "introduction"
        );
        break;
      case "pre-listening":
        addCandidates("pre-listening", "prelistening", "matching", "match");
        break;
      case "listen-repeat":
        addCandidates(
          "listenrepeat",
          "listenandrepeat",
          "listen_and_repeat",
          "listen-repeat",
          "listen&repeat",
          "repeat"
        );
        break;
      case "listening":
        addCandidates("listening", "listen");
        break;
      case "reading":
        addCandidates("reading", "read", "readalong");
        break;
      case "speaking":
        addCandidates("speaking", "speak", "speakingpractice");
        break;
      default:
        break;
    }
    for (const candidate of candidates) {
      const normalizedCandidate = normalizeInstructionKey(candidate);
      if (normalizedCandidate && map.has(normalizedCandidate)) {
        return formatEntries(map.get(normalizedCandidate));
      }
    }

    for (const fallback of generalKeys) {
      const normalizedFallback = normalizeInstructionKey(fallback);
      if (normalizedFallback && map.has(normalizedFallback)) {
        return formatEntries(map.get(normalizedFallback));
      }
    }

    return formatEntries(fallbackDefault);
  };

  return {
    isGeneral: false,
    resolve,
  };
};

const applyInstructionsToSlide = (slideElement, texts) => {
  const normalized = Array.isArray(texts)
    ? texts.filter((text) => typeof text === "string" && text.trim().length)
    : [];
  if (!normalized.length) {
    return;
  }

  const anchor =
    slideElement.querySelector(".activity-focus") ??
    slideElement.querySelector("h2") ??
    slideElement.firstElementChild;
  const existing = slideElement.querySelector(".slide__instruction");

  if (normalized.length === 1) {
    const text = normalized[0];
    if (existing) {
      existing.textContent = text;
      existing.classList.add("activity-instructions");
    } else {
      const paragraph = document.createElement("p");
      paragraph.className = "activity-instructions";
      paragraph.textContent = text;
      anchor?.insertAdjacentElement("afterend", paragraph);
    }
    return;
  }

  const list = document.createElement("ul");
  list.className = "activity-instructions";
  normalized.forEach((item) => {
    const li = document.createElement("li");
    li.textContent = item;
    list.appendChild(li);
  });

  if (existing) {
    existing.replaceWith(list);
    return;
  }

  anchor?.insertAdjacentElement("afterend", list);
};

let instructionPlayback = null;

const cleanupInstructionController = (
  controller,
  { preserveContent = false } = {}
) => {
  if (!controller) {
    return;
  }

  const {
    audio,
    countdownInterval,
    cleanupHandlers,
    onEnded,
    indicator,
    restoreButton,
  } = controller;

  if (audio) {
    audio.pause();
    audio.currentTime = 0;
    if (onEnded) {
      audio.removeEventListener("ended", onEnded);
      audio.removeEventListener("error", onEnded);
    }
  }

  if (countdownInterval) {
    window.clearInterval(countdownInterval);
  }

  cleanupHandlers?.forEach((handler) => {
    try {
      handler();
    } catch {
      /* ignore */
    }
  });

  restoreButton?.();
  indicator?.cleanup?.({ preserveContent });
};

const stopInstructionPlayback = ({ preserveContent = false } = {}) => {
  if (!instructionPlayback) {
    return;
  }

  const controller = instructionPlayback;
  instructionPlayback = null;
  cleanupInstructionController(controller, { preserveContent });
};

const createInstructionIndicator = (slideObj) => {
  const statusEl =
    slideObj.autoPlay?.status ??
    slideObj.element.querySelector(".playback-status") ??
    null;

  if (statusEl) {
    const previousText = statusEl.textContent;
    statusEl.classList.add("playback-status--instruction");
    return {
      element: statusEl,
      update: (text) => {
        statusEl.textContent = text;
      },
      cleanup: ({ preserveContent = false } = {}) => {
        statusEl.classList.remove("playback-status--instruction");
        if (!preserveContent) {
          statusEl.textContent = previousText;
        }
      },
    };
  }

  const banner = document.createElement("div");
  banner.className = "instruction-overlay";
  slideObj.element.prepend(banner);
  window.requestAnimationFrame(() => banner.classList.add("is-visible"));
  return {
    element: banner,
    update: (text) => {
      banner.textContent = text;
    },
    cleanup: () => {
      banner.remove();
    },
  };
};

const startInstructionCountdown = (controller) => {
  if (!instructionPlayback || instructionPlayback !== controller) {
    return;
  }

  const { slide: slideObj, indicator } = controller;

  if (!slideObj.autoPlay?.trigger || slideObj._autoTriggered) {
    slideObj._instructionComplete = true;
    const activeController = instructionPlayback;
    instructionPlayback = null;
    cleanupInstructionController(activeController);
    return;
  }

  controller.restoreButton?.();

  let remaining = 5;
  indicator?.update(`Starts in ${remaining}s`);

  controller.countdownInterval = window.setInterval(() => {
    if (!instructionPlayback || instructionPlayback !== controller) {
      window.clearInterval(controller.countdownInterval);
      return;
    }

    remaining -= 1;
    if (remaining > 0) {
      indicator?.update(`Starts in ${remaining}s`);
      return;
    }

    window.clearInterval(controller.countdownInterval);
    controller.countdownInterval = null;
    indicator?.update("Starting...");

    const activeController = instructionPlayback;
    instructionPlayback = null;
    cleanupInstructionController(activeController, { preserveContent: true });

    if (slideObj.autoPlay && !slideObj._autoTriggered) {
      slideObj._autoTriggered = true;
      slideObj.autoPlay.trigger?.();
    }

    slideObj._instructionComplete = true;
  }, 1000);
};

const handleInstructionForSlide = (slideObj) => {
  if (!slideObj || slideObj._instructionComplete) {
    return;
  }

  const audioUrl = slideObj.instructionAudio;
  const hasAutoPlay = Boolean(slideObj.autoPlay?.trigger);

  if (!audioUrl && !hasAutoPlay) {
    slideObj._instructionComplete = true;
    return;
  }

  stopInstructionPlayback();

  const indicator = createInstructionIndicator(slideObj);
  indicator?.update(audioUrl ? "Instruction playing..." : "Starts in 5s");

  const controller = {
    slide: slideObj,
    audio: null,
    countdownInterval: null,
    cleanupHandlers: [],
    onEnded: null,
    indicator,
    restoreButton: null,
  };

  const { button } = slideObj.autoPlay || {};
  if (button && typeof button.disabled === "boolean") {
    controller.button = button;
    controller.buttonWasDisabled = button.disabled;
    controller.buttonLocked = true;
    button.disabled = true;
    controller.restoreButton = () => {
      if (!controller.buttonLocked) {
        return;
      }
      controller.buttonLocked = false;
      controller.button.disabled = controller.buttonWasDisabled ?? false;
    };
  }

  const setInstructionComplete = () => {
    slideObj._instructionComplete = true;
    slideObj._autoTriggered = true;
    stopInstructionPlayback({ preserveContent: true });
  };

  const attachManualHandler = () => {
    const { button } = slideObj.autoPlay || {};
    if (!button || typeof button.addEventListener !== "function") {
      return;
    }
    const manualHandler = () => {
      if (instructionPlayback?.slide !== slideObj) {
        return;
      }
      setInstructionComplete();
    };
    button.addEventListener("click", manualHandler);
    controller.cleanupHandlers.push(() =>
      button.removeEventListener("click", manualHandler)
    );
  };

  if (hasAutoPlay) {
    attachManualHandler();
  }

  const beginCountdown = () => {
    if (!instructionPlayback || instructionPlayback.slide !== slideObj) {
      return;
    }
    startInstructionCountdown(controller);
  };

  if (!audioUrl) {
    instructionPlayback = controller;
    beginCountdown();
    return;
  }

  const audio = new Audio(audioUrl);
  controller.audio = audio;

  const onEnded = () => {
    if (!instructionPlayback || instructionPlayback.slide !== slideObj) {
      return;
    }

    audio.removeEventListener("ended", onEnded);
    audio.removeEventListener("error", onEnded);

    if (!hasAutoPlay) {
      const activeController = instructionPlayback;
      instructionPlayback = null;
      cleanupInstructionController(activeController);
      slideObj._instructionComplete = true;
      return;
    }

    beginCountdown();
  };

  controller.onEnded = onEnded;
  audio.addEventListener("ended", onEnded, { once: false });
  audio.addEventListener("error", onEnded, { once: false });

  instructionPlayback = controller;

  const playPromise = audio.play();
  if (playPromise?.catch) {
    playPromise.catch(() => {
      onEnded();
    });
  }
};

const parseActivitySlideId = (slideId) => {
  if (typeof slideId !== "string") {
    return null;
  }
  const normalized = slideId.toLowerCase();
  const letterMap = {
    "pre-listening": "a",
    listening: "b",
    "listen-repeat": "c",
    reading: "d",
    speaking: "e",
  };
  const detailedMatch =
    /^activity-(\d+)(?:-([a-z]))?-(model|pre-listening|listening|listen-repeat|reading|speaking)$/.exec(
      normalized
    );
  if (detailedMatch) {
    const [, activityNumber, letter, role] = detailedMatch;
    return {
      activityNumber,
      role,
      letter: letter || letterMap[role] || "",
    };
  }

  const simpleMatch =
    /^activity-(model|pre-listening|listening|listen-repeat|reading|speaking)$/.exec(
      normalized
    );
  if (simpleMatch) {
    const [, role] = simpleMatch;
    return {
      activityNumber: null,
      role,
      letter: letterMap[role] || "",
    };
  }
  return null;
};

const fetchJson = async (path) => {
  const response = await fetch(path);
  if (!response.ok) {
    throw new Error(`Failed to load ${path}`);
  }
  return response.json();
};

const renderLessonMeta = (meta) => {
  const parts = [
    meta?.section ? meta.section : null,
    meta?.level ? `${meta.level} level` : null,
  ].filter(Boolean);

  const joinedMeta = parts.length ? parts.join(" &middot; ") : "";

  lessonMetaEl.innerHTML = `
    <h1 class="lesson-title">Lesson ${meta?.lesson_no ?? ""}</h1>
    ${meta?.focus ? `<p class="lesson-focus">${meta.focus}</p>` : ""}
    ${joinedMeta ? `<p class="lesson-meta">${joinedMeta}</p>` : ""}
    ${
      meta?.prepared_by
        ? `<p class="lesson-author">Prepared by ${meta.prepared_by}</p>`
        : ""
    }
  `;
};

const extractActivityNumber = (activityKey) => {
  const match = /activity_(\d+)/i.exec(activityKey ?? "");
  if (!match) {
    return null;
  }
  const numericValue = Number.parseInt(match[1], 10);
  return Number.isNaN(numericValue) ? match[1] : String(numericValue);
};

const createUnsupportedActivitySlide = (
  activityKey,
  activityType,
  activityNumber,
  activityFocus,
  activityInstructions
) => {
  const headingPrefix = activityNumber
    ? `Activity ${activityNumber}`
    : "Activity";
  const heading = activityType
    ? `${headingPrefix} (${activityType})`
    : headingPrefix;
  const slide = document.createElement("section");
  slide.className = "slide slide--unsupported";
  slide.innerHTML = `
    <h2>${heading} Not Available</h2>
    <p class="slide__instruction">This activity type is not supported yet. Please check back soon.</p>
  `;

  const focusEl = createFocusElement(activityFocus);
  if (focusEl && slide.firstElementChild) {
    slide.firstElementChild.insertAdjacentElement("afterend", focusEl);
  }

  const instructionEntries = extractInstructionEntries(activityInstructions, {
    allowObject: true,
  });
  const instructionsEl = createInstructionsElement(
    instructionEntries.map((entry) => entry.text).filter(Boolean)
  );
  if (instructionsEl) {
    const anchor = focusEl ?? slide.querySelector("h2");
    anchor?.insertAdjacentElement("afterend", instructionsEl);
  }

  return {
    id: `${activityKey}-unsupported`,
    element: slide,
    onLeave: () => {},
  };
};

const collectActivityEntries = (lessonData = {}) =>
  Object.entries(lessonData)
    .filter(
      ([key, value]) =>
        key.startsWith("activity_") && value && typeof value === "object"
    )
    .map(([key, value]) => {
      const rawType = typeof value.type === "string" ? value.type.trim() : "";
      const focus =
        typeof value.focus === "string" && value.focus.trim().length
          ? value.focus.trim()
          : "";
      const instructions = value.instructions ?? null;
      return {
        key,
        type: rawType,
        normalizedType: rawType.toUpperCase(),
        data: value,
        focus,
        instructions,
      };
    })
    .sort((a, b) => a.key.localeCompare(b.key, undefined, { numeric: true }));

let slides = [];
let currentSlideIndex = 0;
let navigationAttached = false;

const showSlide = (nextIndex) => {
  if (!slides.length) {
    return;
  }

  stopInstructionPlayback();

  nextIndex = Math.max(0, Math.min(slides.length - 1, nextIndex));
  if (
    nextIndex === currentSlideIndex &&
    slides[nextIndex].element.classList.contains("is-active")
  ) {
    return;
  }

  const currentSlide = slides[currentSlideIndex];
  if (currentSlide) {
    currentSlide.element.classList.remove("is-active");
    currentSlide.onLeave?.();
  }

  currentSlideIndex = nextIndex;
  const nextSlide = slides[currentSlideIndex];
  nextSlide.element.classList.add("is-active");
  nextSlide.onEnter?.();
  handleInstructionForSlide(nextSlide);
  nextSlide.element.scrollTop = 0;
  nextSlide.element.querySelectorAll(".dialogue-grid").forEach((grid) => {
    if (typeof grid.scrollTo === "function") {
      grid.scrollTo({ top: 0, behavior: "auto" });
      return;
    }
    grid.scrollTop = 0;
  });
  window.scrollTo({ top: 0, behavior: "smooth" });

  progressIndicator.textContent = `Slide ${currentSlideIndex + 1} of ${
    slides.length
  }`;
  prevBtn.disabled = currentSlideIndex === 0;
  nextBtn.disabled = currentSlideIndex === slides.length - 1;

  persistScormProgress(currentSlideIndex, slides.length);
  if (currentSlideIndex === slides.length - 1) {
    markLessonComplete(currentSlideIndex, slides.length);
  }
};

const attachNavigation = () => {
  if (navigationAttached) {
    return;
  }

  prevBtn.addEventListener("click", () => showSlide(currentSlideIndex - 1));
  nextBtn.addEventListener("click", () => showSlide(currentSlideIndex + 1));

  document.addEventListener("keydown", (event) => {
    if (event.key === "ArrowRight") {
      showSlide(currentSlideIndex + 1);
    }
    if (event.key === "ArrowLeft") {
      showSlide(currentSlideIndex - 1);
    }
  });

  navigationAttached = true;
};

const buildLessonSlides = (lessonData) => {
  slidesContainer.innerHTML = "";

  const activityEntries = collectActivityEntries(lessonData);
  if (!activityEntries.length) {
    slidesContainer.innerHTML =
      '<p class="empty-state">No activities defined for this lesson yet.</p>';
    return [];
  }

  const lessonSlides = [];

  activityEntries.forEach(
    ({ key, type, normalizedType, data, focus, instructions }) => {
      const activityNumber = extractActivityNumber(key);
      const context = {
        key,
        type,
        normalizedType,
        activityNumber,
        focus,
        instructions,
      };
      const {
        resolve: resolveInstructions,
        isGeneral: instructionsAreGeneral,
      } = createInstructionResolver(instructions, activityNumber);
      const handler = activityBuilders[normalizedType];
      const producedSlides = handler ? handler(data, context) : null;
      const slideObjects = (
        Array.isArray(producedSlides) ? producedSlides : []
      ).filter((item) => item && item.element instanceof HTMLElement);

      const finalSlides = slideObjects.length
        ? slideObjects
        : [
            createUnsupportedActivitySlide(
              key,
              type || normalizedType,
              activityNumber,
              focus,
              instructions
            ),
          ];

      finalSlides.forEach((slideObj, index) => {
        slideObj.element.dataset.activityKey = key;
        slideObj.element.dataset.activityType = normalizedType || "UNKNOWN";
        slideObj.element.dataset.activitySlideIndex = String(index);
        if (activityNumber) {
          slideObj.element.dataset.activityNumber = activityNumber;
        }
        if (focus) {
          slideObj.element.dataset.activityFocus = focus;
        }
        if (instructions !== undefined) {
          try {
            slideObj.element.dataset.activityInstructions =
              JSON.stringify(instructions);
          } catch {
            // ignore serialization errors
          }
        }
        if (slideObj.id && !slideObj.element.id) {
          slideObj.element.id = slideObj.id;
        }
        if (focus && index === 0) {
          if (!slideObj.element.querySelector(".activity-focus")) {
            const fallbackFocusEl = createFocusElement(focus);
            if (fallbackFocusEl) {
              const heading = slideObj.element.querySelector("h2");
              heading?.insertAdjacentElement("afterend", fallbackFocusEl);
            }
          }
        }
        const slideRoleInfo = parseActivitySlideId(
          slideObj.id ?? slideObj.element.id ?? ""
        );
        const resolvedInstructions = resolveInstructions({
          role: slideRoleInfo?.role,
          letter: slideRoleInfo?.letter,
        });
        if (resolvedInstructions.audio) {
          slideObj.instructionAudio = resolvedInstructions.audio;
        }
        const shouldInsertInstructions =
          resolvedInstructions.texts.length &&
          (!instructionsAreGeneral || index === 0);
        if (shouldInsertInstructions) {
          applyInstructionsToSlide(
            slideObj.element,
            resolvedInstructions.texts
          );
        }
        lessonSlides.push(slideObj);
        slidesContainer.appendChild(slideObj.element);
      });
    }
  );

  if (!lessonSlides.length) {
    slidesContainer.innerHTML =
      '<p class="empty-state">No compatible activities available yet.</p>';
  }

  return lessonSlides;
};

const init = async () => {
  try {
    const data = await fetchJson("content.json");
    renderLessonMeta(data.meta ?? {});

    slides = buildLessonSlides(data);
    const scormReady = ensureScormConnection();
    const resumeIndex = scormReady
      ? getResumeSlideIndex(slides.length)
      : 0;
    currentSlideIndex = resumeIndex;
    attachNavigation();

    if (slides.length) {
      showSlide(resumeIndex);
    } else {
      progressIndicator.textContent = "No activities available yet.";
      prevBtn.disabled = true;
      nextBtn.disabled = true;
    }
  } catch (error) {
    console.error(error);
    slides = [];
    currentSlideIndex = 0;
    slidesContainer.innerHTML = `<p class="error">Unable to load the lesson content. Please try reloading.</p>`;
    progressIndicator.textContent = "";
    prevBtn.disabled = true;
    nextBtn.disabled = true;
  }
};

init();
