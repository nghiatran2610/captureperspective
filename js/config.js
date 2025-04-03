// config.js - Centralized configuration
export const config = {
    // UI related settings
    ui: {
      defaultWaitTime: 5,
      defaultNamingPattern: '{url}_{custom}',
      defaultCustomText: 'Screenshot',
      defaultUrlRegex: 'client/([^/]+)/([^/]+)/([^/]+)/([^/]+)',
      cssClasses: {
        btn: 'btn',
        btnSmall: 'btn btn-small',
        card: 'card',
        error: 'error',
        success: 'success'
      }
    },
    
    // Screenshot related settings
    screenshot: {
      presets: {
        fullHD: { width: 1920, height: 1080, name: "Full HD (1920x1080)" },
        mobile: { width: 375, height: 812, name: "Mobile (iPhone X/11/12)" },
        tablet: { width: 768, height: 1024, name: "Tablet (iPad)" },
        fullPage: { width: 1920, height: 1080, name: "Full Page (Auto Height)" }
      },
      defaultPreset: 'fullHD',
      thumbnailSize: {
        width: 120,
        height: 90
      },
      html2canvasOptions: {
        allowTaint: true,
        backgroundColor: null,
        useCORS: true,
        scale: 1,
        logging: false
      }
    },
    
    // URL processing settings
    urlProcessing: {
      validationPattern: /localhost/,
      filenameCharPattern: /[^a-zA-Z0-9_-]/g,
      filenameCharReplacement: '_',
      multipleUnderscoresPattern: /_+/g
    },
    
    // Timing settings
    timing: {
      minWaitTime: 1000,  // 1 second
      maxWaitTime: 120000,  // 2 minutes
      typingDelay: 30,  // 30ms between characters when typing
      scrollCompletionDelay: 500,  // wait after scrolling
      highlightDuration: 200  // how long to highlight clicked elements
    }
  };
  
  export default config;