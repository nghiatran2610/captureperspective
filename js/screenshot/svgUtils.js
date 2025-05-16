// screenshot/svgUtils.js - Utilities for SVG processing and capture
import { ScreenshotError } from '../errors.js';

/**
 * Prepare SVG elements for better capture by html2canvas
 * @param {Document} doc - Document containing SVGs to prepare
 * @param {Object} options - Options for SVG preparation
 * @returns {number} - Number of SVGs processed
 */
export function prepareSVGsForCapture(doc, options = {}) {
  if (!doc) return 0;
  
  const svgs = doc.querySelectorAll('svg');
  if (!svgs.length) return 0;
  
  const debug = options.debug || false;
  if (debug) console.log(`Preparing ${svgs.length} SVGs for capture`);
  
  svgs.forEach((svg, index) => {
    try {
      const cs = getComputedStyle(svg);
      const parentElement = svg.parentElement;
      const parentWidth = parentElement?.clientWidth || doc.body.clientWidth;
      const parentHeight = parentElement?.clientHeight || doc.body.clientHeight;
      
      // Convert percentage values to pixels
      const toPx = (v, base) => {
        if (!v) return 0;
        return v.endsWith("%") ? (parseFloat(v) / 100) * base : parseFloat(v);
      };
      
      // Calculate dimensions
      const W = svg.getAttribute('width') || toPx(cs.width, parentWidth) || parentWidth;
      const H = svg.getAttribute('height') || toPx(cs.height, parentHeight) || parentHeight;
      
      // Calculate position for absolutely positioned SVGs
      let L = 0, T = 0;
      if (cs.position === 'absolute') {
        L = toPx(cs.left, parentWidth);
        T = toPx(cs.top, parentHeight);
      }
      
      // Add namespaces if missing
      if (!svg.getAttribute('xmlns')) {
        svg.setAttribute("xmlns", "http://www.w3.org/2000/svg");
      }
      if (!svg.getAttribute('xmlns:xlink')) {
        svg.setAttribute("xmlns:xlink", "http://www.w3.org/1999/xlink");
      }
      
      // Set explicit dimensions if not present
      if (!svg.getAttribute('width')) svg.setAttribute("width", W);
      if (!svg.getAttribute('height')) svg.setAttribute("height", H);
      
      // Apply inline styles for consistent rendering
      if (cs.position === 'absolute') {
        Object.assign(svg.style, {
          position: 'absolute',
          width: `${W}px`,
          height: `${H}px`,
          left: `${L}px`,
          top: `${T}px`,
          overflow: cs.overflow || 'visible'
        });
      } else {
        Object.assign(svg.style, {
          width: `${W}px`,
          height: `${H}px`,
          overflow: cs.overflow || 'visible'
        });
      }
      
      if (debug) {
        console.log(`Prepared SVG #${index}:`, {
          id: svg.id,
          dimensions: `${W}x${H}`,
          position: cs.position === 'absolute' ? `at ${L},${T}` : 'static/relative'
        });
      }
    } catch (e) {
      console.warn(`Error preparing SVG #${index}:`, e);
    }
  });
  
  return svgs.length;
}

/**
 * Check if document contains SVG elements
 * @param {Document} doc - Document to check
 * @returns {boolean} - True if SVGs are present
 */
export function documentContainsSVGs(doc) {
  if (!doc) return false;
  return doc.querySelectorAll('svg').length > 0;
}

/**
 * Wait for SVG content to be fully loaded
 * @param {Document} doc - Document containing SVGs
 * @param {number} [timeout=5000] - Maximum waiting time in ms
 * @returns {Promise<boolean>} - Promise resolving to true when SVGs are ready
 */
export function waitForSVGsToLoad(doc, timeout = 5000) {
  return new Promise((resolve) => {
    if (!doc || !documentContainsSVGs(doc)) {
      resolve(true);
      return;
    }
    
    const svgImages = doc.querySelectorAll('svg image');
    if (svgImages.length === 0) {
      resolve(true);
      return;
    }
    
    let allLoaded = true;
    svgImages.forEach(img => {
      if (!img.complete) {
        allLoaded = false;
      }
    });
    
    if (allLoaded) {
      resolve(true);
      return;
    }
    
    // Set up load event listeners for SVG images
    let loadedCount = 0;
    const totalImages = svgImages.length;
    
    const checkComplete = () => {
      loadedCount++;
      if (loadedCount >= totalImages) {
        resolve(true);
      }
    };
    
    svgImages.forEach(img => {
      if (img.complete) {
        checkComplete();
      } else {
        img.addEventListener('load', checkComplete, { once: true });
        img.addEventListener('error', checkComplete, { once: true });
      }
    });
    
    // Set timeout to prevent waiting forever
    setTimeout(() => resolve(true), timeout);
  });
}

/**
 * Create a clone of the document optimized for SVG capture
 * @param {Document} doc - Source document
 * @returns {DocumentFragment} - Optimized clone for capture
 */
export function createOptimizedClone(doc) {
  if (!doc || !doc.documentElement) {
    throw new ScreenshotError('Invalid document for cloning', null, 'invalid-document');
  }
  
  // Create a deep clone of the document element
  const clone = doc.documentElement.cloneNode(true);
  
  // Process SVGs in the clone
  const svgs = clone.querySelectorAll('svg');
  svgs.forEach(svg => {
    // Ensure all SVG elements have proper attributes
    if (!svg.getAttribute('xmlns')) {
      svg.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
    }
    
    // Set overflow to visible to prevent clipping
    svg.style.overflow = 'visible';
    
    // Process all SVG child elements
    const svgElements = svg.querySelectorAll('*');
    svgElements.forEach(el => {
      // Remove any problematic attributes
      if (el.hasAttribute('clip-path') && el.getAttribute('clip-path') === 'none') {
        el.removeAttribute('clip-path');
      }
    });
  });
  
  return clone;
}