/**
 * Development Environment Configuration
 * 
 * This component uses the Metadata Agent API for all AI operations.
 * No local LLM configuration needed.
 */
export const environment = {
  production: false,
  
  // Debug/Logging Configuration
  logLevel: 'debug',
  
  // Empty means same-origin. Embedders can override this at runtime through
  // window.__ENV.agentUrl or the component's api-url input.
  apiUrl: '',
  
  // Default Schema Context
  defaultContext: 'default',
  defaultVersion: 'latest',
  
  // Default Layout
  defaultLayout: 'default'
};
