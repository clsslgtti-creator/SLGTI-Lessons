/*!
 * jQuery UI Touch Punch 0.2.3
 * Enables touch support for jQuery UI interactions (draggable, droppable, sortable, resizable).
 * https://github.com/furf/jquery-ui-touch-punch
 *
 * Copyright 2011 Forward Internet Group, Ltd.
 * Licensed under the MIT license.
 */
(function ($) {
  if (!$.ui || !$.ui.mouse) {
    return;
  }

  const _mouseInit = $.ui.mouse.prototype._mouseInit;
  const _mouseDestroy = $.ui.mouse.prototype._mouseDestroy;

  const simulatedTypes = {
    touchstart: 'mousedown',
    touchmove: 'mousemove',
    touchend: 'mouseup',
  };

  const simulateEvent = (event, simulatedType) => {
    const touch = event.touches[0] || event.changedTouches[0];
    const simulatedEvent = new MouseEvent(simulatedType, {
      bubbles: true,
      cancelable: true,
      view: event.view,
      detail: event.detail,
      screenX: touch.screenX,
      screenY: touch.screenY,
      clientX: touch.clientX,
      clientY: touch.clientY,
      ctrlKey: event.ctrlKey,
      altKey: event.altKey,
      shiftKey: event.shiftKey,
      metaKey: event.metaKey,
      button: 0,
      relatedTarget: null,
    });

    event.target.dispatchEvent(simulatedEvent);
  };

  const getClosestDraggable = (event) => {
    let target = event.target;
    while (target && target !== document.body) {
      if ($(target).data('uiDraggable')) {
        return target;
      }
      target = target.parentNode;
    }
    return event.target;
  };

  $.ui.mouse.prototype._touchStart = function (event) {
    if (event.originalEvent.touches.length > 1) {
      return;
    }

    this._touchMoved = false;

    const touchTarget = getClosestDraggable(event.originalEvent);
    this._touchTarget = touchTarget;

    simulateEvent(event.originalEvent, simulatedTypes.touchstart);

    const moveHandler = (moveEvent) => {
      this._touchMove(moveEvent);
    };

    const endHandler = (endEvent) => {
      this._touchEnd(endEvent);
      document.removeEventListener('touchmove', moveHandler, true);
      document.removeEventListener('touchend', endHandler, true);
      document.removeEventListener('touchcancel', endHandler, true);
    };

    document.addEventListener('touchmove', moveHandler, true);
    document.addEventListener('touchend', endHandler, true);
    document.addEventListener('touchcancel', endHandler, true);
  };

  $.ui.mouse.prototype._touchMove = function (event) {
    this._touchMoved = true;
    simulateEvent(event.originalEvent, simulatedTypes.touchmove);
  };

  $.ui.mouse.prototype._touchEnd = function (event) {
    simulateEvent(event.originalEvent, simulatedTypes.touchend);
    this._touchMoved = false;
    this._touchTarget = null;
  };

  $.ui.mouse.prototype._mouseInit = function () {
    this.element.on('touchstart.uiTouchPunch', (event) => this._touchStart(event));
    return _mouseInit.call(this);
  };

  $.ui.mouse.prototype._mouseDestroy = function () {
    this.element.off('touchstart.uiTouchPunch');
    return _mouseDestroy.call(this);
  };
})(jQuery);
