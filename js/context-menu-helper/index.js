// context-menu-helper/index.js - Main export file for context menu helper modules

import urlContextParser from './url-context-parser.js';
import elementUtils from './element-utils.js';
import toolbarDetector from './toolbar-detector.js';
import actionGenerator from './action-generator.js';
import uiControls from './ui-controls.js';

// Combine all modules into a single export
const ContextMenuActionsHelper = {
  // URL Context Parser functions
  parseUrlContext: urlContextParser.parseUrlContext,
  convertDisplayNameToUrlSegment: urlContextParser.convertDisplayNameToUrlSegment,
  constructPageUrl: urlContextParser.constructPageUrl,
  
  // Element Utils functions
  waitForIframeLoad: elementUtils.waitForIframeLoad, 
  waitForSubmenu: elementUtils.waitForSubmenu,
  getElementXPath: elementUtils.getElementXPath,
  
  // Toolbar Detector functions
  waitForToolbar: toolbarDetector.waitForToolbar,
  getToolbarButtonSelectors: toolbarDetector.getToolbarButtonSelectors,
  
  // Action Generator functions
  generateContextAwareMenuActions: actionGenerator.generateContextAwareMenuActions,
  generateActionsForCurrentContext: actionGenerator.generateActionsForCurrentContext,
  generateActionsForSelectedMainMenu: actionGenerator.generateActionsForSelectedMainMenu,
  processSubmenuItem: actionGenerator.processSubmenuItem,
  
  // UI Controls functions
  addUIControls: uiControls.addUIControls
};

export default ContextMenuActionsHelper;