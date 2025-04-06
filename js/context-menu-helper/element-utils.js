// js/context-menu-helper/element-utils.js - Utility functions for finding and manipulating DOM elements

/**
 * Get the most relevant text content for a menu item element.
 * Tries to find specific text elements first, then falls back to general textContent.
 * @param {Element} element - The menu item element.
 * @returns {string} - The extracted text content, trimmed.
 */
function getElementText(element) {
  if (!element) return "";
  // Prioritize specific selectors if they exist within the menu item structure
  const specificTextElement = element.querySelector('.ia_menuTreeComponent__item__label, .ia_labelComponent span, .label, .text');
  if (specificTextElement && specificTextElement.textContent) {
      return specificTextElement.textContent.trim();
  }
  // Fallback to the direct text content of the element, excluding children like icons
  let text = "";
  for (const node of element.childNodes) {
      if (node.nodeType === Node.TEXT_NODE) {
          text += node.textContent;
      }
  }
  if (text.trim()) {
      return text.trim();
  }
  // Final fallback to general textContent
  return element.textContent?.trim() || "";
}

/**
* Wait for the iframe to fully load.
* @param {HTMLIFrameElement} iframe - The iframe element.
* @returns {Promise<void>}
*/
export async function waitForIframeLoad(iframe) {
  return new Promise((resolve) => {
      let resolved = false;
      const handleLoad = () => {
          if (resolved) return;
          resolved = true;
          iframe.removeEventListener("load", handleLoad);
          // Add additional delay to ensure dynamic content loads
          console.log("Iframe reported load event.");
          setTimeout(() => {
              console.log("Resolving waitForIframeLoad after delay.");
              resolve();
          }, 6000); // Increased delay slightly
      };
      iframe.addEventListener("load", handleLoad);
      // Already loaded case
      if (
          iframe.contentDocument &&
          iframe.contentDocument.readyState === "complete" &&
          !resolved // Check if not already resolved
      ) {
          resolved = true; // Mark as resolved
          console.log("Iframe already complete.");
          setTimeout(() => {
              console.log("Resolving waitForIframeLoad for already complete iframe after delay.");
              resolve();
          }, 6000); // Increased delay slightly
      }
  });
}


/**
* Wait for submenu items to load in the iframe.
* @param {HTMLIFrameElement} iframe - The iframe element.
* @param {number} [maxAttempts=10] - Maximum attempts. Increased default.
* @param {number} [interval=500] - Interval in ms.
* @returns {Promise<Array>} - Array of submenu elements.
*/
export async function waitForSubmenu(iframe, maxAttempts = 10, interval = 500) {
  console.log("Waiting for submenu items...")
  for (let i = 0; i < maxAttempts; i++) {
      try {
          // Check if the submenu container itself is present
          const submenuGroup = iframe.contentDocument?.querySelector(".submenu-group .wrapper-submenu");
          if (submenuGroup) {
               // Now query for items within the container
              const submenuItems = submenuGroup.querySelectorAll(".menu-option");
               if (submenuItems.length > 0) {
                  console.log(`Submenu items found after ${i + 1} attempts:`, submenuItems.length);
                  return Array.from(submenuItems);
              }
          } else {
               console.log(`Attempt ${i + 1}: Submenu container (.submenu-group .wrapper-submenu) not found yet.`);
          }

      } catch(e){
           console.warn(`Error querying submenu in attempt ${i+1}: ${e.message}`);
      }
      await new Promise((resolve) => setTimeout(resolve, interval));
  }
  console.log("No submenu items found after maximum attempts.");
  return [];
}


/**
* Helper function to get the positional XPath of an element.
* @param {Element} element - The element to get XPath for
* @param {Document} document - The document containing the element
* @returns {string} - XPath string
*/
export function getElementXPath(element, document) {
  if (!element || !document) return "";
  if (element === document.documentElement) return "/html";
  if (element === document.body) return "/html/body";

  let ix = 0;
  let siblings = element.parentNode ? element.parentNode.childNodes : [];
  for (let i = 0; i < siblings.length; i++) {
      let sibling = siblings[i];
      if (sibling === element) {
          // Prepend parent's XPath and return
          return getElementXPath(element.parentNode, document) + '/' + element.tagName.toLowerCase() + '[' + (ix + 1) + ']';
      }
      // Check if it's an element node and has the same tag name
      if (sibling.nodeType === 1 && sibling.tagName === element.tagName) {
          ix++;
      }
  }
  return ''; // Should not happen unless element is not attached
}

/**
* Generates an XPath selector targeting an element based on its text content.
* @param {string} tagName - The HTML tag name (e.g., 'div', 'button').
* @param {string} text - The text content to match.
* @param {string} [className=null] - Optional class name to include in the selector.
* @returns {string} - The generated XPath selector.
*/
export function getElementXPathByText(tagName, text, className = null) {
  // Escape single quotes in the text
  const escapedText = text.includes("'") ? `concat("${text.replace(/'/g, `', \"'\", '`)}")` : `'${text}'`;

  let predicate = `normalize-space(.)=${escapedText}`;
  if (className) {
      predicate = `contains(@class, '${className}') and ${predicate}`;
  }

  return `//${tagName.toLowerCase()}[${predicate}]`;
}


/**
* Find menu elements and return them with their text identifiers.
* Prioritizes elements within the main menu structure.
* @param {Document} document - Document to search in
* @returns {Array<Object>} - Array of { element: Element, text: string }
*/
export function findMenuElements(document) {
  const menuItems = [];
  let elements = document.querySelectorAll(".menu-wrapper.wrapper-root > .menu-option");

  // Fallback if primary selector finds nothing
  if (!elements || elements.length === 0) {
       console.log("Primary menu selector failed, trying fallback: .menu-option")
      elements = document.querySelectorAll(".menu-option");
  }
   // Another fallback
  if (!elements || elements.length === 0) {
       console.log("Second menu selector failed, trying fallback: [class*='menu-item']")
      elements = document.querySelectorAll("[class*='menu-item']"); // More generic
  }

  console.log(`Found ${elements.length} potential menu elements.`);

  elements.forEach(el => {
      const text = getElementText(el);
      // Only include items that have meaningful text content
      if (text && !el.classList.contains('menu-header') && !el.classList.contains('menu-back-action')) { // Avoid headers/back buttons
          menuItems.push({ element: el, text: text });
      } else {
           console.log("Skipping element with no text or is header/back:", el.outerHTML.substring(0, 100));
      }
  });
  console.log(`Identified ${menuItems.length} menu items with text.`);
  return menuItems;
}

export default {
  waitForIframeLoad,
  waitForSubmenu,
  getElementXPath,
  getElementXPathByText, // Export new helper
  findMenuElements,
  getElementText // Export new helper
};