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
  
  UI.elements.retryFailedBtn.disabled = true;
  
  // Process URLs one by one
  for (let i = 0; i < urlList.length; i++) {
    const url = urlList[i];
    UI.updateProgressMessage(`Processing ${i + 1} of ${urlList.length}: ${url}`);
    
    try {
      // Take screenshot with the selected preset
      const result = await ScreenshotCapture.takeScreenshot(url, capturePreset);
      AppState.addScreenshot(url, result);
      
      // Download screenshot
      const fileName = URLProcessor.generateFilename(url, i, namingPattern, urlRegex);
      ScreenshotCapture.downloadScreenshot(result.screenshot, fileName);
      
      // Update UI
      UI.showStatus(`✓ Screenshot captured: ${url} (${result.preset} - ${result.width}x${result.height}) (Time: ${result.timeTaken}s)`);
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
  
  if (AppState.screenshots.size > 0) {
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
  let completed = 0;
  
  UI.updateProgressMessage(`Retrying ${urlsToRetry.length} failed URLs...`);
  UI.elements.progressBar.style.width = '0%';
  
  for (let i = 0; i < urlsToRetry.length; i++) {
    const url = urlsToRetry[i];
    UI.updateProgressMessage(`Retrying ${i + 1} of ${urlsToRetry.length}: ${url}`);
    
    try {
      const result = await ScreenshotCapture.takeScreenshot(url, capturePreset);
      AppState.addScreenshot(url, result);
      AppState.removeFailedUrl(url);
      
      const urlIndex = AppState.orderedUrls.indexOf(url);
      const fileName = URLProcessor.generateFilename(url, urlIndex, namingPattern, urlRegex);
      ScreenshotCapture.downloadScreenshot(result.screenshot, fileName);
      
      UI.showStatus(`✓ Screenshot captured on retry: ${url} (${result.preset} - ${result.width}x${result.height}) (Time: ${result.timeTaken}s)`);
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