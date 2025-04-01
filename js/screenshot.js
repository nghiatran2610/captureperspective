/**
 * Screenshot Capture Module with Action Simulation
 * Handles screenshot creation, thumbnails, saving, and simulating user interactions
 */
const ScreenshotCapture = {
  // Store timeout ID so we can cancel it
  _waitTimeout: null,
  
  // Preset screen sizes
  presetSizes: {
    fullHD: { width: 1920, height: 1080, name: "Full HD (1920x1080)" },
    mobile: { width: 375, height: 812, name: "Mobile (iPhone X/11/12)" },
    tablet: { width: 768, height: 1024, name: "Tablet (iPad)" },
    fullPage: { width: 1920, height: 1080, name: "Full Page (Auto Height)" }
  },
  
  /**
   * Take a screenshot of a URL using iframe
   * @param {string} url - URL to capture
   * @param {string} preset - Size preset to use ('fullHD', 'mobile', 'tablet', or 'fullPage')
   * @param {Array} actions - Optional array of actions to perform before capturing
   * @returns {Promise<Object>} - Promise resolving to screenshot data
   */
  takeScreenshot(url, preset = 'fullHD', actions = []) {
    // Clear any existing timeout
    if (this._waitTimeout) {
      clearTimeout(this._waitTimeout);
      this._waitTimeout = null;
    }
    
    const startTime = performance.now();
    const iframe = UI.elements.iframe;
    
    // Get dimensions from preset
    const sizePreset = this.presetSizes[preset] || this.presetSizes.fullHD;
    const width = sizePreset.width;
    const height = sizePreset.height;
    
    // Set iframe size to chosen preset
    iframe.style.width = `${width}px`;
    iframe.style.height = `${height}px`;
    
    return new Promise((resolve, reject) => {
      // Define a clean-up function
      const cleanup = () => {
        if (this._waitTimeout) {
          clearTimeout(this._waitTimeout);
          this._waitTimeout = null;
        }
        iframe.src = 'about:blank';
      };
      
      // Handle iframe load
      const handleLoad = () => {
        try {
          // Remove the load handler to prevent multiple triggers
          iframe.removeEventListener('load', handleLoad);
          
          // Start countdown display
          this._startCountdown(url, async () => {
            try {
              UI.updateProgressMessage(`Preparing to capture ${sizePreset.name} screenshot for ${url}...`);
              
              // If actions are specified, perform them before capturing
              if (actions && actions.length > 0) {
                await this._performActions(iframe.contentDocument, actions);
              }
              
              UI.updateProgressMessage(`Capturing ${sizePreset.name} screenshot for ${url}...`);
              
              // Handle full page preset differently
              if (preset === 'fullPage') {
                const docElement = iframe.contentDocument.documentElement;
                const docBody = iframe.contentDocument.body;
                
                // Measure the full page height
                const scrollHeight = Math.max(
                  docElement.scrollHeight || 0,
                  docBody ? docBody.scrollHeight : 0
                );
                
                // Use html2canvas with full page height
                html2canvas(docElement, {
                  allowTaint: true,
                  backgroundColor: null,
                  useCORS: true,
                  width: width,
                  height: scrollHeight,
                  windowWidth: width,
                  windowHeight: scrollHeight,
                  scale: 1,
                  logging: false,
                  onclone: function(clonedDoc) {
                    // Make sure the content is fully visible in the clone
                    const style = clonedDoc.createElement('style');
                    style.textContent = `
                      body, html { height: auto !important; overflow: visible !important; }
                      div, section, article, main { overflow: visible !important; }
                    `;
                    clonedDoc.head.appendChild(style);
                  }
                }).then(canvas => {
                  const screenshotData = canvas.toDataURL('image/png');
                  
                  // Create thumbnail
                  this.createThumbnail(screenshotData).then(thumbnailData => {
                    const endTime = performance.now();
                    const timeTaken = ((endTime - startTime) / 1000).toFixed(2);
                    
                    console.log(`Full page screenshot taken for ${url} in ${timeTaken}s (${width}x${scrollHeight})`);
                    
                    // Clean up and resolve
                    cleanup();
                    resolve({ 
                      screenshot: screenshotData, 
                      thumbnail: thumbnailData, 
                      timeTaken,
                      preset: preset,
                      width: width,
                      height: scrollHeight
                    });
                  });
                }).catch(error => {
                  console.error('Error during html2canvas for full page:', error);
                  cleanup();
                  reject(error);
                });
              } else {
                // For fixed-size presets, use the original code
                html2canvas(iframe.contentDocument.documentElement, {
                  allowTaint: true,
                  backgroundColor: null,
                  useCORS: true,
                  width: width,
                  height: height,
                  windowWidth: width,
                  windowHeight: height,
                  scale: 1,
                  logging: false
                }).then(canvas => {
                  const screenshotData = canvas.toDataURL('image/png');
                  
                  // Create thumbnail
                  this.createThumbnail(screenshotData).then(thumbnailData => {
                    const endTime = performance.now();
                    const timeTaken = ((endTime - startTime) / 1000).toFixed(2);
                    
                    console.log(`${sizePreset.name} screenshot taken for ${url} in ${timeTaken}s`);
                    
                    // Clean up and resolve
                    cleanup();
                    resolve({ 
                      screenshot: screenshotData, 
                      thumbnail: thumbnailData, 
                      timeTaken,
                      preset: preset,
                      width: width,
                      height: height
                    });
                  });
                }).catch(error => {
                  console.error('Error during html2canvas:', error);
                  cleanup();
                  reject(error);
                });
              }
            } catch (error) {
              console.error('Error setting up screenshot capture:', error);
              cleanup();
              reject(error);
            }
          });
        } catch (error) {
          console.error('Error in iframe load handler:', error);
          cleanup();
          reject(error);
        }
      };
      
      // Add error handler
      const handleError = (event) => {
        console.error(`Failed to load ${url} in iframe`);
        iframe.removeEventListener('load', handleLoad);
        iframe.removeEventListener('error', handleError);
        cleanup();
        reject(new Error(`Failed to load ${url} in iframe`));
      };
      
      // Add event listeners
      iframe.addEventListener('load', handleLoad);
      iframe.addEventListener('error', handleError);
      
      // Start loading the URL
      UI.updateProgressMessage(`Loading ${url} in iframe (${sizePreset.name})...`);
      iframe.src = url;
    });
  },
  
  /**
   * Perform a sequence of actions on the document
   * @param {Document} document - The document (iframe.contentDocument)
   * @param {Array} actions - Array of action objects
   * @returns {Promise} - Resolves when all actions are complete
   */
  async _performActions(document, actions) {
    for (const action of actions) {
      UI.updateProgressMessage(`Performing action: ${action.type} on ${action.selector || 'element'}`);
      
      // Find the target element
      let target = null;
      
      if (action.selector) {
        // Check if it's an XPath selector
        if (action.selector.startsWith('/')) {
          // Use XPath to find the element
          const xpathResult = document.evaluate(
            action.selector,
            document,
            null,
            XPathResult.FIRST_ORDERED_NODE_TYPE,
            null
          );
          target = xpathResult.singleNodeValue;
        } else {
          // Use regular CSS selector
          target = document.querySelector(action.selector);
        }
      }
      
      if (action.selector && !target) {
        console.warn(`Element not found for selector: ${action.selector}`);
        continue;
      }
      
      // Perform the action based on type
      switch (action.type) {
        case 'click':
          if (target) {
            console.log(`Clicking on element: ${action.selector}`);
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
            await new Promise(resolve => setTimeout(resolve, 200));
            
            // Simulate the click
            target.click();
            
            // Wait a bit and remove highlight
            await new Promise(resolve => setTimeout(() => {
              target.style.backgroundColor = originalBackground;
              target.style.outline = originalOutline;
              resolve();
            }, 200));
          }
          break;
          
        case 'type':
          if (target && action.value) {
            // Focus the element
            target.focus();
            
            // Clear existing value
            target.value = '';
            
            // Type the text character by character
            for (const char of action.value) {
              target.value += char;
              
              // Trigger input event
              target.dispatchEvent(new Event('input', { bubbles: true }));
              
              // Small delay between characters for realism
              await new Promise(resolve => setTimeout(resolve, 30));
            }
            
            // Trigger change event after typing
            target.dispatchEvent(new Event('change', { bubbles: true }));
          }
          break;
          
        case 'select':
          if (target && action.value) {
            // Set the select value
            target.value = action.value;
            
            // Trigger change event
            target.dispatchEvent(new Event('change', { bubbles: true }));
          }
          break;
          
        case 'wait':
          // Wait for a specified time (in ms)
          const waitDuration = action.duration || 1000;
          UI.updateProgressMessage(`Waiting for ${waitDuration}ms...`);
          await new Promise(resolve => setTimeout(resolve, waitDuration));
          break;
          
        case 'scroll':
          if (action.selector) {
            if (target) {
              target.scrollTo({
                top: action.y || 0,
                left: action.x || 0,
                behavior: 'smooth'
              });
            }
          } else {
            // Scroll the document
            document.defaultView.scrollTo({
              top: action.y || 0,
              left: action.x || 0,
              behavior: 'smooth'
            });
          }
          
          // Wait for scrolling to complete
          await new Promise(resolve => setTimeout(resolve, 500));
          break;
          
        case 'hover':
          if (target) {
            // Simulate hover
            target.dispatchEvent(new MouseEvent('mouseover', {
              view: document.defaultView,
              bubbles: true,
              cancelable: true
            }));
          }
          break;
          
        default:
          console.warn(`Unknown action type: ${action.type}`);
      }
      
      // Wait between actions
      await new Promise(resolve => setTimeout(resolve, action.delay || 500));
    }
  },
  
  /**
   * Take a series of screenshots after performing different actions
   * @param {string} url - Base URL to capture
   * @param {string} preset - Size preset to use
   * @param {Array} actionSequences - Array of action sequences, each resulting in a screenshot
   * @returns {Promise<Array>} - Promise resolving to array of screenshot data
   */
  takeSequentialScreenshots(url, preset = 'fullHD', actionSequences = []) {
    const results = [];
    
    // Return a promise that resolves when all screenshots are taken
    return new Promise(async (resolve, reject) => {
      try {
        // For each sequence in the action sequences
        for (let i = 0; i < actionSequences.length; i++) {
          const sequence = actionSequences[i];
          const sequenceName = sequence.name || `Step ${i+1}`;
          
          UI.updateProgressMessage(`Starting sequence: ${sequenceName} (${i+1}/${actionSequences.length})`);
          
          // Take screenshot after performing the sequence actions
          const screenshotData = await this.takeScreenshot(url, preset, sequence.actions);
          
          // Add sequence info to the result
          results.push({
            ...screenshotData,
            sequenceName: sequenceName,
            sequenceIndex: i
          });
          
          UI.showStatus(`Completed sequence: ${sequenceName} (${i+1}/${actionSequences.length})`);
        }
        
        resolve(results);
      } catch (error) {
        console.error('Error in sequential screenshots:', error);
        reject(error);
      }
    });
  },
  
  /**
   * Start countdown and call the callback when complete
   * @param {string} url - URL being captured
   * @param {Function} callback - Function to call when countdown completes
   */
  _startCountdown(url, callback) {
    const maxWaitSeconds = parseInt(UI.elements.waitTime.value) || 10;
    let secondsLeft = maxWaitSeconds;
    
    // Update message initially
    UI.updateProgressMessage(`Waiting for ${url} to render... (${secondsLeft}s remaining)`);
    
    // Use a single timeout instead of a loop or interval
    const startWait = () => {
      if (secondsLeft <= 0) {
        // Countdown complete, execute callback
        callback();
        return;
      }
      
      // Update countdown
      UI.updateProgressMessage(`Waiting for ${url} to render... (${secondsLeft}s remaining)`);
      secondsLeft--;
      
      // Schedule next update
      this._waitTimeout = setTimeout(startWait, 1000);
    };
    
    // Start the process
    this._waitTimeout = setTimeout(startWait, 1000);
  },
  
  /**
   * Create a thumbnail from a screenshot
   * @param {string} screenshotData - Base64 screenshot data
   * @param {number} width - Thumbnail width
   * @param {number} height - Thumbnail height
   * @returns {Promise<string>} - Promise resolving to thumbnail data
   */
  createThumbnail(screenshotData, width = 50, height = 50) {
    return new Promise((resolve) => {
      const img = new Image();
      img.src = screenshotData;
      img.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL('image/png'));
      };
      img.onerror = () => resolve(null);
    });
  },
  
  /**
   * Download screenshot as a file
   * @param {string} screenshotData - Base64 screenshot data
   * @param {string} filename - Filename to save as
   */
  downloadScreenshot(screenshotData, filename) {
    const link = document.createElement('a');
    link.href = screenshotData;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }
};
