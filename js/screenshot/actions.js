// screenshot/actions.js - Action execution for screenshots
import config from '../config.js';
import * as events from '../events.js';
import { ActionError } from '../errors.js';

/**
 * Perform a sequence of actions on the document
 * @param {Document} document - The document to perform actions on
 * @param {Array} actions - Array of action objects
 * @returns {Promise<void>} - Resolves when all actions are complete
 */
export async function performActions(document, actions) {
  if (!document || !document.documentElement) {
    throw new ActionError('Invalid document for performing actions', null, null);
  }
  
  for (const action of actions) {
    // Emit progress event
    events.emit(events.events.CAPTURE_PROGRESS, {
      message: `Performing action: ${action.type} on ${action.selector || 'element'}`
    });
    
    // Find the target element if selector is provided
    let target = null;
    
    if (action.selector) {
      target = findElement(document, action.selector);
      
      if (!target) {
        console.warn(`Element not found for selector: ${action.selector}`);
        continue;
      }
    }
    
    // Execute the action based on its type
    await executeAction(document, action, target);
    
    // Wait between actions
    await new Promise(resolve => setTimeout(resolve, action.delay || 500));
  }
}

/**
 * Find an element using either XPath or CSS selector
 * @param {Document} document - The document to search in
 * @param {string} selector - XPath or CSS selector
 * @returns {Element|null} - Found element or null
 */
function findElement(document, selector) {
  if (!selector) return null;
  
  try {
    // Check if it's an XPath selector
    if (selector.startsWith('/')) {
      // Use XPath to find the element
      const xpathResult = document.evaluate(
        selector,
        document,
        null,
        XPathResult.FIRST_ORDERED_NODE_TYPE,
        null
      );
      return xpathResult.singleNodeValue;
    } else {
      // Use regular CSS selector
      return document.querySelector(selector);
    }
  } catch (error) {
    console.error(`Error finding element with selector ${selector}:`, error);
    return null;
  }
}

/**
 * Execute a specific action
 * @param {Document} document - The document
 * @param {Object} action - Action object
 * @param {Element} target - Target element
 * @returns {Promise<void>} - Resolves when action is complete
 */
async function executeAction(document, action, target) {
  if (!action || !action.type) {
    throw new ActionError('Invalid action object', action, null);
  }
  
  try {
    switch (action.type) {
      case 'click':
        await performClick(target);
        break;
        
      case 'type':
        await performType(target, action.value);
        break;
        
      case 'select':
        await performSelect(target, action.value);
        break;
        
      case 'wait':
        await performWait(action.duration);
        break;
        
      case 'scroll':
        await performScroll(document, target, action.x, action.y);
        break;
        
      case 'hover':
        await performHover(document, target);
        break;
        
      default:
        console.warn(`Unknown action type: ${action.type}`);
    }
  } catch (error) {
    throw new ActionError(
      `Error executing ${action.type} action: ${error.message}`,
      action,
      target
    );
  }
}

/**
 * Perform a click action
 * @param {Element} target - Element to click
 * @returns {Promise<void>} - Resolves when action is complete
 */
async function performClick(target) {
  if (!target) return;
  
  // Scroll element into view if needed
  if (target.scrollIntoView) {
    target.scrollIntoView({ behavior: 'smooth', block: 'center' });
    await new Promise(resolve => setTimeout(resolve, 300));
  }
  
  // Highlight the clicked element briefly
  const originalBackground = target.style.backgroundColor;
  const originalOutline = target.style.outline;
  target.style.backgroundColor = 'rgba(255, 0, 0, 0.3)';
  target.style.outline = '2px solid red';
  
  // Small delay to show highlight
  await new Promise(resolve => setTimeout(resolve, config.timing.highlightDuration));
  
  // Simulate the click
  target.click();
  
  // Wait a bit and remove highlight
  await new Promise(resolve => setTimeout(() => {
    target.style.backgroundColor = originalBackground;
    target.style.outline = originalOutline;
    resolve();
  }, config.timing.highlightDuration));
}

/**
 * Perform a type action
 * @param {Element} target - Element to type in
 * @param {string} value - Text to type
 * @returns {Promise<void>} - Resolves when action is complete
 */
async function performType(target, value) {
  if (!target || !value) return;
  
  // Focus the element
  target.focus();
  
  // Clear existing value
  target.value = '';
  
  // Type the text character by character
  for (const char of value) {
    target.value += char;
    
    // Trigger input event
    target.dispatchEvent(new Event('input', { bubbles: true }));
    
    // Small delay between characters for realism
    await new Promise(resolve => setTimeout(resolve, config.timing.typingDelay));
  }
  
  // Trigger change event after typing
  target.dispatchEvent(new Event('change', { bubbles: true }));
}

/**
 * Perform a select action
 * @param {Element} target - Select element
 * @param {string} value - Value to select
 * @returns {Promise<void>} - Resolves when action is complete
 */
async function performSelect(target, value) {
  if (!target || !value) return;
  
  // Set the select value
  target.value = value;
  
  // Trigger change event
  target.dispatchEvent(new Event('change', { bubbles: true }));
}

/**
 * Perform a wait action
 * @param {number} duration - Duration to wait in ms
 * @returns {Promise<void>} - Resolves when wait is complete
 */
async function performWait(duration) {
  const waitDuration = duration || config.timing.minWaitTime;
  await new Promise(resolve => setTimeout(resolve, waitDuration));
}

/**
 * Perform a scroll action
 * @param {Document} document - The document
 * @param {Element} target - Element to scroll
 * @param {number} x - X coordinate
 * @param {number} y - Y coordinate
 * @returns {Promise<void>} - Resolves when action is complete
 */
async function performScroll(document, target, x = 0, y = 0) {
  if (target) {
    target.scrollTo({
      top: y,
      left: x,
      behavior: 'smooth'
    });
  } else {
    // Scroll the document
    document.defaultView.scrollTo({
      top: y,
      left: x,
      behavior: 'smooth'
    });
  }
  
  // Wait for scrolling to complete
  await new Promise(resolve => setTimeout(resolve, config.timing.scrollCompletionDelay));
}

/**
 * Perform a hover action
 * @param {Document} document - The document
 * @param {Element} target - Element to hover
 * @returns {Promise<void>} - Resolves when action is complete
 */
async function performHover(document, target) {
  if (!target) return;
  
  // Simulate hover
  target.dispatchEvent(new MouseEvent('mouseover', {
    view: document.defaultView,
    bubbles: true,
    cancelable: true
  }));
  
  // Wait a brief moment for hover effects
  await new Promise(resolve => setTimeout(resolve, 200));
}