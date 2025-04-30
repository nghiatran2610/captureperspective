// config.js - Centralized configuration
export const config = {
  // UI related settings
  ui: {
    defaultWaitTime: 4,
    defaultNamingPattern: "{url}_{custom}",
    defaultCustomText: "Screenshot",
    defaultUrlRegex: "client/([^/]+)/([^/]+)/([^/]+)/([^/]+)",
    cssClasses: {
      btn: "btn",
      btnSmall: "btn btn-small",
      card: "card",
      error: "error",
      success: "success",
    },
  },

  // Screenshot related settings
  screenshot: {
    presets: {
      // Presets define the base viewport size (width and height IF fullPage is not checked)
      fullHD: { width: 1920, height: 1080, name: "Full HD (1920x1080)" },
      mobile: { width: 375, height: 812, name: "Mobile (iPhone X/11/12)" },
      tablet: { width: 768, height: 1024, name: "Tablet (iPad)" },
      // Removed fullPage preset definition
    },
    defaultPreset: "fullHD", // Default selection in the dropdown
    thumbnailSize: {
      width: 120,
      height: 90,
    },
    html2canvasOptions: {
      allowTaint: true,
      backgroundColor: null, // Use null for transparency if needed, or '#ffffff' for white
      useCORS: true,
      scale: 1, // Use scale 1 for predictable sizing
      logging: false, // Set to true for debugging html2canvas
      // width/height/windowWidth/windowHeight are set dynamically in core.js
    },
  },

  // URL processing settings
  urlProcessing: {
    validationPattern: /localhost/,
    filenameCharPattern: /[^a-zA-Z0-9_-]/g,
    filenameCharReplacement: "_",
    multipleUnderscoresPattern: /_+/g,
  },

  // URL prefill configuration
  prefill: {
    enabled: true,
    sourcePattern: /http(s)?:\/\/([^\/]+)\/system\/webdev\/([^\/]+)/,
    targetTemplate: "http$1://$2/data/perspective/client/$3",
    fallbackUrl: "http://localhost:8088/data/perspective/client/",
  },

  // Timing settings
  timing: {
    minWaitTime: 1000, // 1 second
    maxWaitTime: 120000, // 2 minutes
    typingDelay: 30, // 30ms between characters when typing
    scrollCompletionDelay: 500, // wait after scrolling
    highlightDuration: 200, // how long to highlight clicked elements
  },
};

export default config;