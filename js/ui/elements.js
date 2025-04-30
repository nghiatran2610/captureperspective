// js/ui/elements.js

export const elements = {
  // Mode Selection
  modeAdvanced: document.getElementById('modeAdvanced'),
  modeSimple: document.getElementById('modeSimple'),
  captureForm: document.getElementById('captureForm'),
  progressOutput: document.getElementById('progressOutput'),
  urlInputTitle: document.getElementById('urlInputTitle'),
  buttonContainer: document.getElementById('buttonContainer'),

  // Existing elements
  urlList: document.getElementById('urlList'),
  capturePreset: document.getElementById('capturePreset'),
  waitTime: document.getElementById('waitTime'),
  actionsField: document.getElementById('actionsField'),
  actionsLabel: document.getElementById('actionsLabel'), // ID for the label
  actionsGenerationStatus: document.getElementById('actionsGenerationStatus'), // <-- ADDED
  advancedOptions: document.getElementById('advancedOptions'),
  captureBtn: document.getElementById('captureBtn'),
  retryFailedBtn: document.getElementById('retryFailedBtn'),
  progress: document.getElementById('progress'),
  progressBar: document.getElementById('progressBar'),
  output: document.getElementById('output'),
  iframe: document.getElementById('screenshotIframe'),
  stats: document.getElementById('stats'),
  totalCount: document.getElementById('totalCount'),
  processedCount: document.getElementById('processedCount'),
  failedCount: document.getElementById('failedCount'),
  totalTime: document.getElementById('totalTime'),
  liveThumbnails: null, // Reference managed by thumbnails.js
  thumbnailsContent: null, // Reference managed by thumbnails.js
  includeToolbarButtons: document.getElementById('includeToolbarButtons'),
  urlHelpText: document.getElementById('urlHelpText')


};

export default elements;

// ----- REMOVED DUPLICATE PROGRESS EXPORT FROM HERE -----