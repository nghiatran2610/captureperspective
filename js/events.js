// events.js - Centralized event handling

/**
 * Event handler registry
 * @type {Map<string, Set<Function>>}
 */
const eventHandlers = new Map();

/**
 * Add event listener
 * @param {string} eventName - Name of the event
 * @param {Function} handler - Event handler function
 */
export function on(eventName, handler) {
  if (!eventHandlers.has(eventName)) {
    eventHandlers.set(eventName, new Set());
  }
  eventHandlers.get(eventName).add(handler);
}

/**
 * Remove event listener
 * @param {string} eventName - Name of the event
 * @param {Function} handler - Event handler function to remove
 */
export function off(eventName, handler) {
  if (eventHandlers.has(eventName)) {
    eventHandlers.get(eventName).delete(handler);
  }
}

/**
 * Trigger an event
 * @param {string} eventName - Name of the event
 * @param {any} data - Event data to pass to handlers
 */
export function emit(eventName, data) {
  if (eventHandlers.has(eventName)) {
    for (const handler of eventHandlers.get(eventName)) {
      try {
        handler(data);
      } catch (error) {
        console.error(`Error in ${eventName} handler:`, error);
      }
    }
  }
}

/**
 * Create a wrapper for DOM events
 * @param {HTMLElement} element - DOM element
 * @param {string} eventType - DOM event type
 * @param {Function} handler - Event handler
 * @param {Object} options - addEventListener options
 */
export function addDOMEventListener(element, eventType, handler, options = {}) {
  if (element) {
    element.addEventListener(eventType, handler, options);
  } else {
    console.warn(`Cannot add ${eventType} listener to undefined element`);
  }
}

/**
 * Remove a DOM event listener
 * @param {HTMLElement} element - DOM element
 * @param {string} eventType - DOM event type
 * @param {Function} handler - Event handler
 * @param {Object} options - removeEventListener options
 */
export function removeDOMEventListener(
  element,
  eventType,
  handler,
  options = {}
) {
  if (element) {
    element.removeEventListener(eventType, handler, options);
  }
}

/**
 * Create a one-time event handler
 * @param {string} eventName - Name of the event
 * @param {Function} handler - Event handler function
 */
export function once(eventName, handler) {
  const onceHandler = (data) => {
    off(eventName, onceHandler);
    handler(data);
  };
  on(eventName, onceHandler);
}

// Application specific events
export const events = {
  // Capture process events
  CAPTURE_STARTED: "captureStarted",
  CAPTURE_COMPLETED: "captureCompleted",
  CAPTURE_FAILED: "captureFailed",
  CAPTURE_PROGRESS: "captureProgress",

  // Screenshot related events
  SCREENSHOT_TAKEN: "screenshotTaken",
  SCREENSHOT_SAVED: "screenshotSaved",

  // URL processing events
  URL_PROCESSING_STARTED: "urlProcessingStarted",
  URL_PROCESSING_COMPLETED: "urlProcessingCompleted",

  // URL selection events (new)
  URL_SELECTION_CHANGED: "URL_SELECTION_CHANGED",

  // UI events
  UI_RESET: "uiReset",
  DOWNLOAD_ALL_REQUESTED: "downloadAllRequested",

  // New login-related events
  LOGIN_STARTED: "LOGIN_STARTED",
  LOGIN_SUCCESSFUL: "LOGIN_SUCCESSFUL",
  LOGIN_FAILED: "LOGIN_FAILED",
  LOGIN_STATUS_CHANGED: "LOGIN_STATUS_CHANGED",
};

export default {
  on,
  off,
  emit,
  once,
  addDOMEventListener,
  removeDOMEventListener,
  events,
};
