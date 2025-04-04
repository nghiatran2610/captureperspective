// element-utils.js - Utility functions for finding and manipulating DOM elements

/**
 * Wait for the iframe to fully load.
 * @param {HTMLIFrameElement} iframe - The iframe element.
 * @returns {Promise<void>}
 */
export async function waitForIframeLoad(iframe) {
    return new Promise((resolve) => {
      if (iframe.contentDocument.readyState === "complete") {
        resolve();
      } else {
        iframe.onload = () => resolve();
      }
    });
  }
  
  /**
   * Wait for submenu items to load in the iframe.
   * @param {HTMLIFrameElement} iframe - The iframe element.
   * @param {number} [maxAttempts=10] - Maximum attempts.
   * @param {number} [interval=500] - Interval in ms.
   * @returns {Promise<Array>} - Array of submenu elements.
   */
  export async function waitForSubmenu(iframe, maxAttempts = 10, interval = 500) {
    for (let i = 0; i < maxAttempts; i++) {
      const submenuItems = iframe.contentDocument.querySelectorAll(
        ".submenu-group .menu-option"
      );
      if (submenuItems.length > 0) {
        console.log(
          `Submenu items found after ${i + 1} attempts:`,
          submenuItems
        );
        return Array.from(submenuItems);
      }
      await new Promise((resolve) => setTimeout(resolve, interval));
    }
    console.log("No submenu items found after maximum attempts.");
    return [];
  }
  
  /**
   * Helper function to get the XPath of an element.
   * @param {Element} element - The element to get XPath for
   * @param {Document} document - The document containing the element
   * @returns {string} - XPath string
   */
  export function getElementXPath(element, document) {
    if (!element) return "";
    if (element === document) return "/";
    let comp,
      comps = [];
    let getPos = function (element) {
      let position = 1,
        curNode;
      if (element.nodeType === Node.ATTRIBUTE_NODE) return null;
      for (
        curNode = element.previousSibling;
        curNode;
        curNode = curNode.previousSibling
      ) {
        if (curNode.nodeName === element.nodeName) {
          ++position;
        }
      }
      return position;
    };
    if (element instanceof Attr) {
      return `//@${element.nodeName}`;
    }
    for (
      ;
      element && element.nodeType === Node.ELEMENT_NODE;
      element = element.parentNode
    ) {
      comp = element.nodeName.toLowerCase();
      let pos = getPos(element);
      if (pos > 1) {
        comp += `[${pos}]`;
      }
      comps.unshift(comp);
    }
    return `/${comps.join("/")}`;
  }
  
  export default {
    waitForIframeLoad,
    waitForSubmenu,
    getElementXPath
  };