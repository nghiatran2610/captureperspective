/**
 * Main Application Controller
 * Connects all modules and handles the main workflow
 */

/**
 * Toggle advanced options visibility
 */
function toggleAdvancedOptions() {
  const advancedSection = UI.elements.advancedOptions;
  const toggleBtn = UI.elements.toggleAdvanced;
  
  if (advancedSection.style.display === 'block') {
    advancedSection.style.display = 'none';
    toggleBtn.textContent = 'Advanced Options ▼';
  } else {
    advancedSection.style.display = 'block';
    toggleBtn.textContent = 'Advanced Options ▲';
  }
}

/**
 * Capture screenshots for all URLs in the list
 */
async function captureScreenshots() {
  const startTotalTime = performance.now();
  AppState.reset();
  UI.resetUI();
  
  // Create live thumbnails container
  UI.createLiveThumbnailsContainer();
  
  // Get and process URLs
  const rawUrlList = UI.elements.urlList.value;
  const urlList = URLProcessor.processUrlList(rawUrlList);
  UI.updateStats(urlList.length, 0, 0, 0);
  
  if (urlList.length === 0) {
    alert('Please enter at least one valid local URL.');
    return;
  }
  
  const namingPattern = UI.elements.namingPattern.value.trim() || '{url}';
  const urlRegex = UI.elements.urlRegex.value.trim();
  const capturePreset = UI.elements.capturePreset.value || 'fullHD';
  
  // Check if there are actions defined in the advanced options
  const actionsText = UI.elements.actionsField ? UI.elements.actionsField.value.trim() : '';
  let actionSequences = [];
  
  if (actionsText) {
    try {
      // Parse actions JSON
      actionSequences = JSON.parse(actionsText);
      console.log(`Loaded ${actionSequences.length} action sequences`);
    } catch (error) {
      console.error('Error parsing actions JSON:', error);
      alert('Error parsing actions JSON. Please check the format.');
      return;
    }
  }
  
  UI.elements.retryFailedBtn.disabled = true;
  
  // Process URLs one by one
  for (let i = 0; i < urlList.length; i++) {
    const url = urlList[i];
    UI.updateProgressMessage(`Processing ${i + 1} of ${urlList.length}: ${url}`);
    
    try {
      let result;
      
      // Take screenshots with or without actions
      if (actionSequences && actionSequences.length > 0) {
        // Take sequential screenshots with actions
        const results = await ScreenshotCapture.takeSequentialScreenshots(url, capturePreset, actionSequences);
        
        // Process each result
        for (let j = 0; j < results.length; j++) {
          const actionResult = results[j];
          const sequenceName = actionResult.sequenceName || `Step ${j+1}`;
          
          // Generate filename with sequence info and timestamp
          const timestamp = URLProcessor.getTimestamp();
          const baseFileName = URLProcessor.generateFilename(url, i, namingPattern, urlRegex);
          const fileName = baseFileName.replace('.png', `_${sequenceName.replace(/\s+/g, '_')}_${timestamp}.png`);
          
          // Add to AppState with the filename
          actionResult.fileName = fileName;
          
          // Add to the live thumbnails display
          UI.addLiveThumbnail(actionResult, fileName, sequenceName);
          
          // Download the screenshot
          ScreenshotCapture.downloadScreenshot(actionResult.screenshot, fileName);
          
          // Store only the last result in AppState
          if (j === results.length - 1) {
            result = actionResult;
          }
        }
        
        UI.showStatus(`✓ ${results.length} screenshots captured for ${url} with actions`);
      } else {
        // Take single screenshot without actions
        result = await ScreenshotCapture.takeScreenshot(url, capturePreset);
        
        // Generate filename with timestamp
        const timestamp = URLProcessor.getTimestamp();
        const fileName = URLProcessor.generateFilename(url, i, namingPattern, urlRegex).replace('.png', `_${timestamp}.png`);
        
        // Add filename to result
        result.fileName = fileName;
        
        // Add to the live thumbnails display
        UI.addLiveThumbnail(result, fileName);
        
        // Download the screenshot
        ScreenshotCapture.downloadScreenshot(result.screenshot, fileName);
        
        UI.showStatus(`✓ Screenshot captured: ${url} (${result.preset} - ${result.width}x${result.height}) (Time: ${result.timeTaken}s)`);
      }
      
      // Add the result to AppState
      AppState.addScreenshot(url, result);
      
      // Update UI
      UI.updateStats(urlList.length, i + 1, AppState.failedUrls.length, 0);
    } catch (error) {
      AppState.addFailedUrl(url);
      UI.showStatus(`✗ Failed to capture screenshot: ${url} (${error.message})`, true);
      UI.updateStats(urlList.length, i, AppState.failedUrls.length + 1, 0);
    }
    
    UI.updateProgress(i + 1, urlList.length);
  }
  
  const endTotalTime = performance.now();
  const totalTimeTaken = ((endTotalTime - startTotalTime) / 1000).toFixed(2);
  
  const successCount = urlList.length - AppState.failedUrls.length;
  UI.updateStats(urlList.length, successCount, AppState.failedUrls.length, totalTimeTaken);
  UI.updateProgressMessage(`Completed processing ${urlList.length} URLs (Total Time: ${totalTimeTaken}s)`);
  
  // Add download all button if there are screenshots
  if (AppState.screenshots.size > 0) {
    UI.addDownloadAllButton();
    UI.renderUrlList();
  } else {
    UI.showStatus('No screenshots were captured.', true);
  }
  
  UI.elements.retryFailedBtn.disabled = AppState.failedUrls.length === 0;
}

/**
 * Retry capturing screenshots for failed URLs
 */
async function retryFailedUrls() {
  if (AppState.failedUrls.length === 0) {
    alert('No failed URLs to retry.');
    return;
  }
  
  const startTotalTime = performance.now();
  const urlsToRetry = [...AppState.failedUrls];
  AppState.failedUrls = [];
  
  const namingPattern = UI.elements.namingPattern.value.trim() || '{url}';
  const urlRegex = UI.elements.urlRegex.value.trim();
  const capturePreset = UI.elements.capturePreset.value || 'fullHD';
  
  // Check if there are actions defined in the advanced options
  const actionsText = UI.elements.actionsField ? UI.elements.actionsField.value.trim() : '';
  let actionSequences = [];
  
  if (actionsText) {
    try {
      // Parse actions JSON
      actionSequences = JSON.parse(actionsText);
    } catch (error) {
      console.error('Error parsing actions JSON:', error);
    }
  }
  
  let completed = 0;
  
  UI.updateProgressMessage(`Retrying ${urlsToRetry.length} failed URLs...`);
  UI.elements.progressBar.style.width = '0%';
  
  for (let i = 0; i < urlsToRetry.length; i++) {
    const url = urlsToRetry[i];
    UI.updateProgressMessage(`Retrying ${i + 1} of ${urlsToRetry.length}: ${url}`);
    
    try {
      let result;
      
      // Take screenshots with or without actions
      if (actionSequences && actionSequences.length > 0) {
        // Take sequential screenshots with actions
        const results = await ScreenshotCapture.takeSequentialScreenshots(url, capturePreset, actionSequences);
        
        // Process each result
        for (let j = 0; j < results.length; j++) {
          const actionResult = results[j];
          const sequenceName = actionResult.sequenceName || `Step ${j+1}`;
          
          // Generate filename with sequence info and timestamp
          const timestamp = URLProcessor.getTimestamp();
          const urlIndex = AppState.orderedUrls.indexOf(url);
          const baseFileName = URLProcessor.generateFilename(url, urlIndex, namingPattern, urlRegex);
          const fileName = baseFileName.replace('.png', `_${sequenceName.replace(/\s+/g, '_')}_${timestamp}.png`);
          
          // Add to result
          actionResult.fileName = fileName;
          
          // Add to the live thumbnails display
          UI.addLiveThumbnail(actionResult, fileName, sequenceName, true);
          
          // Download the screenshot
          ScreenshotCapture.downloadScreenshot(actionResult.screenshot, fileName);
          
          // Store only the last result in AppState
          if (j === results.length - 1) {
            result = actionResult;
          }
        }
        
        UI.showStatus(`✓ ${results.length} screenshots captured on retry for ${url} with actions`);
      } else {
        // Take a single screenshot without actions
        result = await ScreenshotCapture.takeScreenshot(url, capturePreset);
        
        // Generate filename with timestamp
        const timestamp = URLProcessor.getTimestamp();
        const urlIndex = AppState.orderedUrls.indexOf(url);
        const fileName = URLProcessor.generateFilename(url, urlIndex, namingPattern, urlRegex).replace('.png', `_${timestamp}.png`);
        
        // Add filename to result
        result.fileName = fileName;
        
        // Add to the live thumbnails display
        UI.addLiveThumbnail(result, fileName, null, true);
        
        // Download the screenshot
        ScreenshotCapture.downloadScreenshot(result.screenshot, fileName);
        
        UI.showStatus(`✓ Screenshot captured on retry: ${url} (${result.preset} - ${result.width}x${result.height}) (Time: ${result.timeTaken}s)`);
      }
      
      AppState.addScreenshot(url, result);
      AppState.removeFailedUrl(url);
      
      UI.elements.processedCount.textContent = parseInt(UI.elements.processedCount.textContent) + 1;
    } catch (error) {
      AppState.addFailedUrl(url);
      UI.showStatus(`✗ Failed to capture screenshot on retry: ${url} (${error.message})`, true);
    }
    
    completed++;
    UI.updateProgress(completed, urlsToRetry.length);
  }
  
  const endTotalTime = performance.now();
  const totalTimeTaken = ((endTotalTime - startTotalTime) / 1000).toFixed(2);
  
  UI.elements.failedCount.textContent = AppState.failedUrls.length.toString();
  UI.elements.totalTime.textContent = `${totalTimeTaken}s`;
  UI.updateProgressMessage(`Completed retrying ${urlsToRetry.length} URLs (Total Time: ${totalTimeTaken}s).`);
  
  UI.renderUrlList();
  UI.elements.retryFailedBtn.disabled = AppState.failedUrls.length === 0;
}

/**
 * Initialize the application
 */
function init() {
  // Attach event listeners
  UI.elements.captureBtn.addEventListener('click', captureScreenshots);
  UI.elements.retryFailedBtn.addEventListener('click', retryFailedUrls);
  UI.elements.toggleAdvanced.addEventListener('click', toggleAdvancedOptions);
  
  console.log('Screenshot Tool initialized');
}

// Initialize the application when DOM is fully loaded
document.addEventListener('DOMContentLoaded', init);

// If DOM is already loaded (e.g., script is loaded at the end of body)
if (document.readyState === 'complete' || document.readyState === 'interactive') {
  init();
}
