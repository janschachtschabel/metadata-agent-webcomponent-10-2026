/**
 * Production Environment Configuration
 * 
 * This component uses the Metadata Agent API for all AI operations.
 * No local LLM configuration needed.
 */
export const environment = {
  production: true,
  
  // Debug/Logging Configuration
  logLevel: 'warn',
  
  // Empty means same-origin. Production integrations should pass their proxy
  // base through window.__ENV.agentUrl or the component's api-url input.
  apiUrl: '',
  
  // Default Schema Context
  defaultContext: 'default',
  defaultVersion: 'latest',
  
  // Default Layout
  defaultLayout: 'default'
};
