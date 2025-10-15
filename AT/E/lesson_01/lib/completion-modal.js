let modalElement = null;

const ensureModal = () => {
  if (modalElement) {
    return modalElement;
  }

  const overlay = document.createElement("div");
  overlay.className = "completion-modal";
  overlay.innerHTML = `
    <div class="completion-modal__backdrop"></div>
    <div class="completion-modal__dialog" role="dialog" aria-modal="true">
      <div class="completion-modal__icon" aria-hidden="true">✓</div>
      <h3 class="completion-modal__title"></h3>
      <p class="completion-modal__message"></p>
      <button type="button" class="primary-btn completion-modal__close">Close</button>
    </div>
  `;

  const closeBtn = overlay.querySelector(".completion-modal__close");
  const hide = () => {
    overlay.classList.remove("is-visible");
    window.setTimeout(() => overlay.classList.remove("is-mounted"), 300);
  };

  closeBtn.addEventListener("click", hide);
  overlay.querySelector(".completion-modal__backdrop").addEventListener("click", hide);

  modalElement = overlay;
  document.body.appendChild(overlay);
  return modalElement;
};

export const showCompletionModal = ({
  title = "Great Work!",
  message = "You completed this activity.",
} = {}) => {
  const modal = ensureModal();
  modal.querySelector(".completion-modal__title").textContent = title;
  modal.querySelector(".completion-modal__message").textContent = message;
  modal.classList.add("is-mounted");
  window.requestAnimationFrame(() => modal.classList.add("is-visible"));
};
