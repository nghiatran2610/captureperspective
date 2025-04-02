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
        this._downloadAllScreenshots = this._downloadAllScreenshots.bind(this);

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
        // Initialize menu action helpers
        // this.menuActionsHelper.addUIControls();  //  DEFINITELY REMOVE THIS LINE
        this.contextMenuActionsHelper.addUIControls();  //  **USE THIS ONE INSTEAD**

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

        events.on(events.events.SCREENSHOT_TAKEN, (data) => {
            UI.utils.showStatus(
                `✓ Screenshot captured: ${data.url} (${data.result.preset} - ${data.result.width}x${data.result.height}) (Time: ${data.result.timeTaken}s)`
            );
        });

        events.on(events.events.DOWNLOAD_ALL_REQUESTED, () => {
            this._downloadAllScreenshots();
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
     * Capture screenshots for all URLs in the list
     */
    async captureScreenshots() {
        const startTotalTime = performance.now();

        try {
            // Reset application state
            AppState.reset();
            UI.utils.resetUI();

            // Create live thumbnails container
            UI.thumbnails.createLiveThumbnailsContainer();

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
                            UI.thumbnails.addLiveThumbnail(actionResult, fileName, sequenceName);

                            // Download the screenshot
                            ScreenshotCapture.downloadScreenshot(actionResult.screenshot, fileName);

                            // Store only the last result in AppState
                            if (j === results.length - 1) {
                                result = actionResult;
                            }
                        }

                        UI.utils.showStatus(`✓ ${results.length} screenshots captured for ${url} with actions`);
                    } else {
                        // Take single screenshot without actions
                        result = await ScreenshotCapture.takeScreenshot(url, capturePreset);

                        // Generate filename with timestamp
                        const timestamp = URLProcessor.getTimestamp();
                        const fileName = URLProcessor.generateFilename(url, i, namingPattern, urlRegex).replace('.png', `_${timestamp}.png`);

                        // Add filename to result
                        result.fileName = fileName;

                        // Add to the live thumbnails display
                        UI.thumbnails.addLiveThumbnail(result, fileName);

                        // Download the screenshot
                        ScreenshotCapture.downloadScreenshot(result.screenshot, fileName);

                        // UI.utils.showStatus(   // REMOVE THIS LINE
                        //     `✓ Screenshot captured: ${url} (${result.preset} - ${result.width}x${result.height}) (Time: ${result.timeTaken}s)`
                        // );
                    }

                    // Add the result to AppState
                    AppState.addScreenshot(url, result);

                    // Update UI
                    UI.progress.updateStats(urlList.length, i + 1, AppState.failedUrls.length, 0);
                } catch (error) {
                    AppState.addFailedUrl(url);
                    UI.utils.showStatus(`✗ Failed to capture screenshot: ${data.url} (${data.error.message})`, true);
                    UI.progress.updateStats(urlList.length, i, AppState.failedUrls.length + 1, 0);
                }

                UI.progress.updateProgress(i + 1, urlList.length);
            }

            const endTotalTime = performance.now();
            const totalTimeTaken = ((endTotalTime - startTotalTime) / 1000).toFixed(2);

            const successCount = urlList.length - AppState.failedUrls.length;
            UI.progress.updateStats(urlList.length, successCount, AppState.failedUrls.length, totalTimeTaken);
            UI.progress.updateProgressMessage(`Completed processing ${urlList.length} URLs (Total Time: ${totalTimeTaken}s)`);

            // Add download all button if there are screenshots
            if (AppState.screenshots.size > 0) {
                this._addDownloadAllButton();
                this._renderUrlList();
            } else {
                UI.utils.showStatus('No screenshots were captured.', true);
            }

            UI.elements.retryFailedBtn.disabled = AppState.failedUrls.length === 0;

        } catch (error) {
            handleError(error, {
                logToConsole: true,
                showToUser: true
            });
        }
    }

    /**
     * Add download all button to the UI
     * @private
     */
    _addDownloadAllButton() {
        // Create button container
        const btnContainer = document.createElement('div');
        btnContainer.className = 'download-all-container';

        // Create button
        const downloadAllBtn = document.createElement('button');
        downloadAllBtn.id = 'downloadAllBtn';
        downloadAllBtn.className = 'btn';
        downloadAllBtn.textContent = 'Download All Screenshots (ZIP)';

        // Add click handler
        downloadAllBtn.addEventListener('click', this._downloadAllScreenshots);

        btnContainer.appendChild(downloadAllBtn);

        // Add to output
        if (UI.elements.liveThumbnails) {
            UI.elements.liveThumbnails.parentNode.insertBefore(btnContainer, UI.elements.liveThumbnails.nextSibling);
        } else {
            UI.elements.output.appendChild(btnContainer);
        }
    }

    /**
     * Download all screenshots as a zip file
     * @private
     */
    _downloadAllScreenshots() {
        if (typeof JSZip === 'undefined') {
            // Load JSZip dynamically if not present
            const script = document.createElement('script');
            script.src = 'https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js';
            script.onload = () => this._createScreenshotsZip();
            document.head.appendChild(script);
        } else {
            this._createScreenshotsZip();
        }
    }

    /**
     * Create a zip file with all screenshots
     * @private
     */
    _createScreenshotsZip() {
        const downloadBtn = document.getElementById('downloadAllBtn');
        if (!downloadBtn) return;

        try {
            // Update button to show progress
            downloadBtn.textContent = 'Preparing ZIP file...';
            downloadBtn.disabled = true;

            // Create a new JSZip instance
            const zip = new JSZip();

            // Add all screenshots to the zip
            const thumbnailContainers = document.querySelectorAll('.thumbnail-container');
            thumbnailContainers.forEach(container => {
                const fileName = container.dataset.filename;
                const screenshot = container.dataset.screenshot;

                if (fileName && screenshot) {
                    // Convert data URL to blob
                    const blob = utils.dataURLtoBlob(screenshot);

                    // Add to zip
                    zip.file(fileName, blob);
                }
            });

            // Generate the zip
            zip.generateAsync({ type: 'blob' }).then(content => {
                // Create a download link
                const link = document.createElement('a');
                link.href = URL.createObjectURL(content);
                link.download = `Screenshots_${URLProcessor.getTimestamp()}.zip`;
                document.body.appendChild(link);

                // Trigger download
                link.click();
                document.body.removeChild(link);

                // Reset button
                downloadBtn.textContent = 'Download All Screenshots (ZIP)';
                downloadBtn.disabled = false;
            }).catch(error => {
                console.error('Error creating ZIP file:', error);
                downloadBtn.textContent = 'Error creating ZIP. Try again.';
                downloadBtn.disabled = false;
            });
        } catch (error) {
            handleError(error, {
                logToConsole: true,
                showToUser: true
            });

            if (downloadBtn) {
                downloadBtn.textContent = 'Error creating ZIP. Try again.';
                downloadBtn.disabled = false;
            }
        }
    }

    /**
     * Render the list of URLs with screenshots
     * @private
     */
    _renderUrlList() {
        if (AppState.orderedUrls.length === 0) {
            UI.utils.showStatus('No URLs to display.', true);
            return;
        }

        const listContainer = document.createElement('div');
        listContainer.className = 'url-list-container';

        const listTitle = document.createElement('h3');
        listTitle.textContent = 'Processed URLs';
        listContainer.appendChild(listTitle);

        AppState.orderedUrls.forEach((url, index) => {
            const itemDiv = document.createElement('div');
            itemDiv.className = 'url-item';

            // Thumbnail
            const thumbnailImg = document.createElement('img');
            thumbnailImg.className = 'thumbnail';
            const data = AppState.screenshots.get(url);
            thumbnailImg.src = data && data.thumbnail ? data.thumbnail : '';

            // URL text
            const urlText = document.createElement('div');
            urlText.className = 'url-text';
            urlText.textContent = url;

            // Controls
            const controlsDiv = document.createElement('div');

            const upButton = UI.utils.createButton('↑', 'Move Up', () => this._moveUrl(index, 'up'));
            upButton.disabled = index === 0;

            const downButton = UI.utils.createButton('↓', 'Move Down', () => this._moveUrl(index, 'down'));
            downButton.disabled = index === AppState.orderedUrls.length - 1;

            const viewButton = UI.utils.createButton('📸', 'View Screenshot', () => this._viewScreenshot(url));

            controlsDiv.appendChild(upButton);
            controlsDiv.appendChild(downButton);
            controlsDiv.appendChild(viewButton);

            // Assemble item
            itemDiv.appendChild(thumbnailImg);
            itemDiv.appendChild(urlText);
            itemDiv.appendChild(controlsDiv);
            listContainer.appendChild(itemDiv);
        });

        UI.elements.output.appendChild(listContainer);
    }

    /**
     * Move a URL up or down in the ordered list
     * @param {number} index - Current index of the URL
     * @param {string} direction - Direction to move ('up' or 'down')
     * @private
     */
    _moveUrl(index, direction) {
        if (direction === 'up' && index > 0) {
            [AppState.orderedUrls[index - 1], AppState.orderedUrls[index]] =
                [AppState.orderedUrls[index], AppState.orderedUrls[index - 1]];
        } else if (direction === 'down' && index < AppState.orderedUrls.length - 1) {
            [AppState.orderedUrls[index + 1], AppState.orderedUrls[index]] =
                [AppState.orderedUrls[index], AppState.orderedUrls[index + 1]];
        }

        // Find and remove the url-list-container if it exists
        const existingList = document.querySelector('.url-list-container');
        if (existingList) {
            existingList.remove();
        }

        // Re-render the list
        this._renderUrlList();
    }

    /**
     * Show screenshot in a modal
     * @param {string} url - URL of the screenshot to display
     * @private
     */
    _viewScreenshot(url) {
        const data = AppState.screenshots.get(url);
        if (!data || !data.screenshot) {
            alert(`No screenshot available for ${url}`);
            return;
        }

        UI.modals.viewScreenshotFromImage(
            data.screenshot,
            url,
            data.width || 'unknown',
            data.height || 'unknown',
            data.timeTaken || '0'
        );
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
                            UI.thumbnails.addLiveThumbnail(actionResult, fileName, sequenceName, true);

                            // Download the screenshot
                            ScreenshotCapture.downloadScreenshot(actionResult.screenshot, fileName);

                            // Store only the last result in AppState
                            if (j === results.length - 1) {
                                result = actionResult;
                            }
                        }

                        UI.utils.showStatus(`✓ ${results.length} screenshots captured on retry for ${url} with actions`);
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
                        UI.thumbnails.addLiveThumbnail(result, fileName, null, true);

                        // Download the screenshot
                        ScreenshotCapture.downloadScreenshot(result.screenshot, fileName);

                        UI.utils.showStatus(`✓ Screenshot captured on retry: ${url}`);
                    }

                    AppState.addScreenshot(url, result);
                    AppState.removeFailedUrl(url);

                    UI.elements.processedCount.textContent = parseInt(UI.elements.processedCount.textContent) + 1;
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

            this._renderUrlList();
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