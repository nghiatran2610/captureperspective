// app.js - Main application controller
import config from './config.js';
import AppState from './state.js';
import UI from './ui/index.js';
import URLProcessor from './url-processor.js';
import * as ScreenshotCapture from './screenshot/core.js';
import MenuActionsHelper from './menu-actions-helper.js';
import ContextMenuActionsHelper from './context-menu-actions-helper.js';
import * as events from './events.js';
import { handleError, ScreenshotError, URLProcessingError } from './errors.js';
import * as utils from './screenshot/utils.js';

/**
 * Main Application Controller
 */
class App {
    /**
     * Constructs the application controller
     */
    constructor() {
        // Bind methods to maintain correct 'this' context
        this.captureScreenshots = this.captureScreenshots.bind(this);
        this.retryFailedUrls = this.retryFailedUrls.bind(this);
        this.toggleAdvancedOptions = this.toggleAdvancedOptions.bind(this);

        // Initialize helpers
        this.menuActionsHelper = MenuActionsHelper;
        this.contextMenuActionsHelper = ContextMenuActionsHelper;
    }

    /**
     * Initialize the application
     */
    initialize() {
        // Set up event listeners
        this._setupEventListeners();

        // Initialize UI components
        this._initializeUI();

        // Set up event handlers
        this._setupEventHandlers();

        // Log initialization
        console.log('Application initialized with config:', config);
    }

    /**
     * Set up UI event listeners
     */
    _setupEventListeners() {
        // Main action buttons
        events.addDOMEventListener(UI.elements.captureBtn, 'click', this.captureScreenshots);
        events.addDOMEventListener(UI.elements.retryFailedBtn, 'click', this.retryFailedUrls);
        events.addDOMEventListener(UI.elements.toggleAdvanced, 'click', this.toggleAdvancedOptions);

        // Keyboard shortcuts
        events.addDOMEventListener(document, 'keydown', event => {
            // Ctrl+Enter to start capture
            if (event.ctrlKey && event.key === 'Enter') {
                this.captureScreenshots();
                event.preventDefault();
            }
        });
    }

    /**
     * Initialize UI components
     */
    _initializeUI() {
        // No longer initialize UI controls here - this is now handled in index.js
        
        // Set default values from config
        if (UI.elements.waitTime) {
            UI.elements.waitTime.value = config.ui.defaultWaitTime;
        }

        if (UI.elements.namingPattern) {
            UI.elements.namingPattern.value = config.ui.defaultNamingPattern;
        }

        if (UI.elements.customText) {
            UI.elements.customText.value = config.ui.defaultCustomText;
        }

        // Disable retry button initially
        if (UI.elements.retryFailedBtn) {
            UI.elements.retryFailedBtn.disabled = true;
        }
    }

    /**
     * Set up application event handlers
     */
    _setupEventHandlers() {
        // Listen for application events
        events.on(events.events.CAPTURE_PROGRESS, (data) => {
            UI.progress.updateProgressMessage(data.message);
        });

        events.on(events.events.CAPTURE_FAILED, (data) => {
            UI.utils.showStatus(`✗ Failed to capture screenshot: ${data.url} (${data.error.message})`, true);
        });

        // Modified event handler to avoid duplicate messages
        events.on(events.events.SCREENSHOT_TAKEN, (data) => {
            // Only show status if we're not using action sequences
            // Will be handled by processImmediately for sequences
            if (!this.usingActionSequences) {
                UI.utils.showStatus(
                    `✓ Screenshot captured: ${data.url} (${data.result.preset} - ${data.result.width}x${data.result.height}) (Time: ${data.result.timeTaken}s)`
                );
            }
        });
    }

    /**
     * Toggle advanced options visibility
     */
    toggleAdvancedOptions() {
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
     * Process the results from sequential screenshot captures
     * @param {Array} results - Array of screenshot results
     * @param {number} i - Current URL index
     * @param {string} url - Current URL
     * @param {string} namingPattern - Filename pattern
     * @param {string} urlRegex - URL regex pattern
     * @param {number} timestamp - Timestamp for filename
     * @private
     */
    _processSequentialResults(results, i, url, namingPattern, urlRegex, timestamp) {
        let validScreenshots = 0;
        let errorScreenshots = 0;

        // Process each result
        for (let j = 0; j < results.length; j++) {
            const actionResult = results[j];
            const sequenceName = actionResult.sequenceName || `Step ${j+1}`;

            // Generate filename with sequence info and timestamp
            const baseFileName = URLProcessor.generateFilename(url, i, namingPattern, urlRegex);
            const fileName = baseFileName.replace('.png', `_${sequenceName.replace(/\s+/g, '_')}_${timestamp}.png`);

            // Check if this is an error result
            if (actionResult.error) {
                errorScreenshots++;
                
                // Add to the live thumbnails display as an error thumbnail
                UI.thumbnails.addLiveThumbnail(actionResult, fileName, sequenceName, false, false);
                
                // Show error status
                UI.utils.showStatus(`✗ Failed for "${sequenceName}": ${actionResult.errorMessage || 'Mount error'}`, true);
                
                continue;
            }

            // This is a valid screenshot
            validScreenshots++;

            // Detect if this is a toolbar button action
            const isToolbarAction = sequenceName.includes('Button');

            // Add filename to result
            actionResult.fileName = fileName;

            // Add to the live thumbnails display with appropriate categorization
            UI.thumbnails.addLiveThumbnail(actionResult, fileName, sequenceName, false, isToolbarAction);
        }

        // Show a summary status message
        if (validScreenshots > 0 && errorScreenshots > 0) {
            UI.utils.showStatus(`✓ ${validScreenshots} screenshots captured for ${url} (${errorScreenshots} errors)`, false);
        } else if (validScreenshots > 0) {
            UI.utils.showStatus(`✓ ${validScreenshots} screenshots captured for ${url}`, false);
        } else if (errorScreenshots > 0) {
            UI.utils.showStatus(`✗ All ${errorScreenshots} screenshot attempts failed for ${url}`, true);
        }
    }

    /**
     * Capture screenshots for all URLs in the list
     */
    async captureScreenshots() {
        const startTotalTime = performance.now();

        try {
            // Reset application state
            AppState.reset();
            UI.utils.resetUI();
            this.usingActionSequences = false;  // Default flag value

            // Create live thumbnails container
            UI.thumbnails.createLiveThumbnailsContainer();

            // Add the Combine All to PDF button
            UI.thumbnails.addCombineAllToPDFButton();

            // Get and process URLs
            const rawUrlList = UI.elements.urlList.value;
            const urlList = URLProcessor.processUrlList(rawUrlList);
            UI.progress.updateStats(urlList.length, 0, 0, 0);

            if (urlList.length === 0) {
                throw new URLProcessingError('Please enter at least one valid local URL.', rawUrlList);
            }

            // Get capture options
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
                    this.usingActionSequences = actionSequences.length > 0;  // Set flag based on sequences
                } catch (error) {
                    throw new Error(`Error parsing actions JSON: ${error.message}. Please check the format.`);
                }
            }

            UI.elements.retryFailedBtn.disabled = true;

            // Process URLs one by one
            for (let i = 0; i < urlList.length; i++) {
                const url = urlList[i];
                UI.progress.updateProgressMessage(`Processing ${i + 1} of ${urlList.length}: ${url}`);

                try {
                    let result;

                    // Take screenshots with or without actions
                    if (actionSequences && actionSequences.length > 0) {
                        try {
                            // Get timestamp once for all files in this sequence
                            const timestamp = URLProcessor.getTimestamp();
                            
                            // Process handler for immediate result processing
                            const processImmediately = (actionResult) => {
                                const sequenceName = actionResult.sequenceName || 'Unknown';
                                console.log(`Processing immediate result for ${url} - ${sequenceName}`, actionResult);
                                
                                // Generate filename with sequence info and timestamp
                                const baseFileName = URLProcessor.generateFilename(url, i, namingPattern, urlRegex);
                                const fileName = baseFileName.replace('.png', `_${sequenceName.replace(/\s+/g, '_')}_${timestamp}.png`);
                                
                                // Check if this is an error result
                                if (actionResult.error) {
                                    // Add to the live thumbnails display as an error thumbnail
                                    UI.thumbnails.addLiveThumbnail(actionResult, fileName, sequenceName, false, false);
                                    
                                    // Show error status
                                    UI.utils.showStatus(`✗ Failed for "${sequenceName}": ${actionResult.errorMessage || 'Mount error'}`, true);
                                    return;
                                }
                                
                                // This is a valid screenshot
                                // Detect if this is a toolbar button action
                                const isToolbarAction = sequenceName.includes('Button');
                                
                                // Add filename to result
                                actionResult.fileName = fileName;
                                
                                // Add to the live thumbnails display with appropriate categorization
                                const thumbnailAdded = UI.thumbnails.addLiveThumbnail(actionResult, fileName, sequenceName, false, isToolbarAction);
                                console.log(`Thumbnail added for ${sequenceName}: ${!!thumbnailAdded}`);
                                
                                // No automatic download
                                // ScreenshotCapture.downloadScreenshot(actionResult.screenshot, fileName);
                                
                                // Show success message
                                UI.utils.showStatus(`✓ Screenshot captured: ${sequenceName} (${actionResult.preset} - ${actionResult.width}x${actionResult.height}) (Time: ${actionResult.timeTaken}s)`, false);
                                
                                // Store valid result for AppState
                                if (!result) {
                                    result = actionResult;
                                }
                            };
                            
                            // Take sequential screenshots with immediate processing
                            const results = await ScreenshotCapture.takeSequentialScreenshots(
                                url, 
                                capturePreset, 
                                actionSequences, 
                                processImmediately
                            );
                            
                            console.log(`Got ${results.length} results for ${url}`, results);
                            
                            // Find the last valid result to store in AppState
                            const lastValidResult = results.filter(r => !r.error).pop();
                            if (lastValidResult) {
                                result = lastValidResult;
                                console.log(`Valid result found for ${url}`, result);
                            } else {
                                console.warn(`No valid results found for ${url}`);
                            }
                        } catch (error) {
                            console.error(`Error capturing screenshots for ${url}:`, error);
                            AppState.addFailedUrl(url);
                            UI.utils.showStatus(`✗ Failed to capture screenshots: ${url} (${error.message})`, true);
                            UI.progress.updateStats(urlList.length, i, AppState.failedUrls.length + 1, 0);
                            continue;
                        }
                    } else {
                        try {
                            // Take single screenshot without actions
                            result = await ScreenshotCapture.takeScreenshot(url, capturePreset);
                            console.log(`Screenshot captured for ${url}`, result);

                            // Generate filename with timestamp
                            const timestamp = URLProcessor.getTimestamp();
                            const fileName = URLProcessor.generateFilename(url, i, namingPattern, urlRegex).replace('.png', `_${timestamp}.png`);

                            // Add filename to result
                            result.fileName = fileName;

                            // Add to the live thumbnails display
                            const thumbnailAdded = UI.thumbnails.addLiveThumbnail(result, fileName);
                            console.log(`Thumbnail added for ${url}: ${!!thumbnailAdded}`);
                            
                            // No automatic download
                            // ScreenshotCapture.downloadScreenshot(result.screenshot, fileName);
                            
                            // Don't show status here - will be handled by event handler
                            // to avoid duplicate messages
                        } catch (error) {
                            console.error(`Error capturing screenshot for ${url}:`, error);
                            
                            // Check if this is a mount error
                            if (error.message && (
                                error.message.includes('No view configured for center mount') ||
                                error.message.includes('Mount definition should contain a property')
                            )) {
                                // Create an error result
                                const errorResult = {
                                    error: true,
                                    errorMessage: error.message,
                                    sequenceName: url
                                };
                                
                                // Generate a filename for the error
                                const timestamp = URLProcessor.getTimestamp();
                                const fileName = URLProcessor.generateFilename(url, i, namingPattern, urlRegex).replace('.png', `_Error_${timestamp}.png`);
                                
                                // Add to the thumbnails as an error
                                UI.thumbnails.addLiveThumbnail(errorResult, fileName, url, false, false);
                                
                                UI.utils.showStatus(`✗ Failed to capture screenshot: ${url} (Mount error)`, true);
                                
                                // Add this URL to failed URLs
                                AppState.addFailedUrl(url);
                                continue;
                            }
                            
                            // For other errors, add to failed URLs and continue
                            AppState.addFailedUrl(url);
                            UI.utils.showStatus(`✗ Failed to capture screenshot: ${url} (${error.message})`, true);
                            UI.progress.updateStats(urlList.length, i, AppState.failedUrls.length + 1, 0);
                            continue;
                        }
                    }

                    // Add this after the try/catch block
                    if (result) {
                        // Add the result to AppState if we got a valid result
                        AppState.addScreenshot(url, result);
                    } else {
                        console.warn(`No result available to add to AppState for ${url}`);
                    }

                    // Update UI
                    UI.progress.updateStats(urlList.length, i + 1, AppState.failedUrls.length, 0);
                } catch (error) {
                    AppState.addFailedUrl(url);
                    UI.utils.showStatus(`✗ Failed to capture screenshot: ${url} (${error.message})`, true);
                    UI.progress.updateStats(urlList.length, i, AppState.failedUrls.length + 1, 0);
                }

                UI.progress.updateProgress(i + 1, urlList.length);
            }

            const endTotalTime = performance.now();
            const totalTimeTaken = ((endTotalTime - startTotalTime) / 1000).toFixed(2);

            const successCount = urlList.length - AppState.failedUrls.length;
            UI.progress.updateStats(urlList.length, successCount, AppState.failedUrls.length, totalTimeTaken);
            UI.progress.updateProgressMessage(`Completed processing ${urlList.length} URLs (Total Time: ${totalTimeTaken}s)`);

            UI.elements.retryFailedBtn.disabled = AppState.failedUrls.length === 0;

        } catch (error) {
            handleError(error, {
                logToConsole: true,
                showToUser: true
            });
        }
    }

    /**
     * Retry capturing screenshots for failed URLs
     */
    async retryFailedUrls() {
        if (AppState.failedUrls.length === 0) {
            alert('No failed URLs to retry.');
            return;
        }

        const startTotalTime = performance.now();

        try {
            const urlsToRetry = [...AppState.failedUrls];
            AppState.failedUrls = [];
            this.usingActionSequences = false;  // Reset flag

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
                    this.usingActionSequences = actionSequences.length > 0;  // Set flag
                } catch (error) {
                    throw new Error(`Error parsing actions JSON: ${error.message}. Please check the format.`);
                }
            }

            let completed = 0;

            UI.progress.updateProgressMessage(`Retrying ${urlsToRetry.length} failed URLs...`);
            UI.elements.progressBar.style.width = '0%';

            for (let i = 0; i < urlsToRetry.length; i++) {
                const url = urlsToRetry[i];
                UI.progress.updateProgressMessage(`Retrying ${i + 1} of ${urlsToRetry.length}: ${url}`);

                try {
                    let result;

                    // Take screenshots with or without actions
                    if (actionSequences && actionSequences.length > 0) {
                        try {
                            // Get timestamp once for all files in this sequence
                            const timestamp = URLProcessor.getTimestamp();
                            
                            // Process handler for immediate result processing
                            const processImmediately = (actionResult) => {
                                const sequenceName = actionResult.sequenceName || 'Unknown';
                                console.log(`Processing immediate result for ${url} - ${sequenceName}`, actionResult);
                                
                                // Generate filename with sequence info and timestamp
                                const baseFileName = URLProcessor.generateFilename(url, i, namingPattern, urlRegex);
                                const fileName = baseFileName.replace('.png', `_${sequenceName.replace(/\s+/g, '_')}_${timestamp}.png`);
                                
                                // Check if this is an error result
                                if (actionResult.error) {
                                    // Add to the live thumbnails display as an error thumbnail
                                    UI.thumbnails.addLiveThumbnail(actionResult, fileName, sequenceName, true, false);
                                    
                                    // Show error status
                                    UI.utils.showStatus(`✗ Failed for "${sequenceName}": ${actionResult.errorMessage || 'Mount error'}`, true);
                                    return;
                                }
                                
                                // This is a valid screenshot
                                // Detect if this is a toolbar button action
                                const isToolbarAction = sequenceName.includes('Button');
                                
                                // Add filename to result
                                actionResult.fileName = fileName;
                                
                                // Add to the live thumbnails display with appropriate categorization
                                const thumbnailAdded = UI.thumbnails.addLiveThumbnail(actionResult, fileName, sequenceName, true, isToolbarAction);
                                console.log(`Thumbnail added for ${sequenceName}: ${!!thumbnailAdded}`);
                                
                                // No automatic download
                                // ScreenshotCapture.downloadScreenshot(actionResult.screenshot, fileName);
                                
                                // Show success message
                                UI.utils.showStatus(`✓ Screenshot captured: ${sequenceName} (${actionResult.preset} - ${actionResult.width}x${actionResult.height}) (Time: ${actionResult.timeTaken}s)`, false);
                                
                                // Store valid result for AppState
                                if (!result) {
                                    result = actionResult;
                                }
                            };
                            
                            // Take sequential screenshots with immediate processing
                            const results = await ScreenshotCapture.takeSequentialScreenshots(
                                url, 
                                capturePreset, 
                                actionSequences, 
                                processImmediately
                            );
                            
                            console.log(`Got ${results.length} results for ${url}`, results);
                            
                            // Find the last valid result to store in AppState
                            const lastValidResult = results.filter(r => !r.error).pop();
                            if (lastValidResult) {
                                result = lastValidResult;
                                console.log(`Valid result found for ${url}`, result);
                            } else {
                                console.warn(`No valid results found for ${url}`);
                            }
                        } catch (error) {
                            console.error(`Error capturing screenshots for ${url}:`, error);
                            AppState.addFailedUrl(url);
                            UI.utils.showStatus(`✗ Failed to retry screenshot: ${url} (${error.message})`, true);
                            continue;
                        }
                    } else {
                        try {
                            // Take a single screenshot without actions
                            result = await ScreenshotCapture.takeScreenshot(url, capturePreset);

                            // Generate filename with timestamp
                            const timestamp = URLProcessor.getTimestamp();
                            const urlIndex = AppState.orderedUrls.indexOf(url);
                            const fileName = URLProcessor.generateFilename(url, urlIndex, namingPattern, urlRegex).replace('.png', `_${timestamp}.png`);

                            // Add filename to result
                            result.fileName = fileName;

                            // Add to the live thumbnails display
                            UI.thumbnails.addLiveThumbnail(result, fileName, null, true);
                            
                            // No automatic download
                            // ScreenshotCapture.downloadScreenshot(result.screenshot, fileName);
                            
                            // No need to show status here - will be handled by event
                        } catch (error) {
                            // Check if this is a mount error
                            if (error.message && (
                                error.message.includes('No view configured for center mount') ||
                                error.message.includes('Mount definition should contain a property')
                            )) {
                                // Create an error result
                                const errorResult = {
                                    error: true,
                                    errorMessage: error.message,
                                    sequenceName: url
                                };
                                
                                // Generate a filename for the error
                                const timestamp = URLProcessor.getTimestamp();
                                const urlIndex = AppState.orderedUrls.indexOf(url);
                                const fileName = URLProcessor.generateFilename(url, urlIndex, namingPattern, urlRegex).replace('.png', `_Error_${timestamp}.png`);
                                
                                // Add to the thumbnails as an error
                                UI.thumbnails.addLiveThumbnail(errorResult, fileName, url, true, false);
                                
                                UI.utils.showStatus(`✗ Failed to retry screenshot: ${url} (Mount error)`, true);
                                
                                // Add this URL back to failed URLs
                                AppState.addFailedUrl(url);
                                continue;
                            }
                            
                            // For other errors, rethrow
                            throw error;
                        }
                    }

                    // Add the result to AppState if we got a valid result
                    if (result) {
                        AppState.addScreenshot(url, result);
                        AppState.removeFailedUrl(url);
                        UI.elements.processedCount.textContent = parseInt(UI.elements.processedCount.textContent) + 1;
                    }
                } catch (error) {
                    AppState.addFailedUrl(url);
                    UI.utils.showStatus(`✗ Failed to capture screenshot on retry: ${url} (${error.message})`, true);
                }

                completed++;
                UI.progress.updateProgress(completed, urlsToRetry.length);
            }

            const endTotalTime = performance.now();
            const totalTimeTaken = ((endTotalTime - startTotalTime) / 1000).toFixed(2);

            UI.elements.failedCount.textContent = AppState.failedUrls.length.toString();
            UI.elements.totalTime.textContent = `${totalTimeTaken}s`;
            UI.progress.updateProgressMessage(`Completed retrying ${urlsToRetry.length} URLs (Total Time: ${totalTimeTaken}s).`);

            UI.elements.retryFailedBtn.disabled = AppState.failedUrls.length === 0;
        } catch (error) {
            handleError(error, {
                logToConsole: true,
                showToUser: true
            });
        }
    }
}

// Export app class
export default App;