// js/ui/elements.js

export const elements = {
  // Mode Selection (unused but keep refs)
  modeAdvanced: document.getElementById('modeAdvanced'),
  modeSimple: document.getElementById('modeSimple'),

  // Main Containers
  captureForm: document.getElementById('captureForm'),
  progressOutput: document.getElementById('progressOutput'),
  output: document.getElementById('output'), // Container for thumbnails
  urlInputContainer: document.getElementById('url-input-container'), // Card containing settings
  captureSettingsContent: document.getElementById('captureSettingsContent'), // Div containing settings/selector

  // Input Elements
  urlList: document.getElementById('urlList'), // Original textarea, likely hidden/replaced
  capturePreset: document.getElementById('capturePreset'),
  waitTime: document.getElementById('waitTime'), // Hidden input for wait time storage
  actionsField: document.getElementById('actionsField'), // Advanced mode textarea

  // Labels & Text
  urlInputTitle: document.getElementById('urlInputTitle'), // Now also the toggle header
  actionsLabel: document.getElementById('actionsLabel'), // Advanced mode label
  urlHelpText: document.getElementById('urlHelpText'),

  // Buttons & Controls
  buttonContainer: document.getElementById('buttonContainer'),
  captureBtn: document.getElementById('captureBtn'),
  // retryFailedBtn reference removed
  // Pause/Resume button added dynamically by app.js

  // Progress & Status
  progress: document.getElementById('progress'), // The single status message element
  progressBar: document.getElementById('progressBar'),
  actionsGenerationStatus: document.getElementById('actionsGenerationStatus'), // Advanced mode status

  // Advanced/Other Options
  advancedOptions: document.getElementById('advancedOptions'),
  includeToolbarButtons: document.getElementById('includeToolbarButtons'), // Checkbox within advanced options

  // Stats Display
  stats: document.getElementById('stats'),
  totalCount: document.getElementById('totalCount'),
  processedCount: document.getElementById('processedCount'),
  failedCount: document.getElementById('failedCount'), // Keep for stats display
  totalTime: document.getElementById('totalTime'),

  // Dynamic References (managed by other modules)
  liveThumbnails: null, // Reference to the main thumbnail container div
  thumbnailsContent: null, // Reference to the div holding category divs

  // Iframe
  iframe: document.getElementById('screenshotIframe'),

};

export default elements;