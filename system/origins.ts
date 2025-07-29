import { OriginConfig, DEFAULT_ORIGIN_CONFIG } from 'wolfy-module-kit';

// Modify this object to update the origin configuration
const customOriginConfig: OriginConfig = {
  allowedOrigins: [
    // locals
    "http://localhost:9005",
    "http://localhost:9007",
    "http://localhost:3000",

    // qa
    "https://public-eye-qa.casescope.com",
    "https://casemaker-qa.casescope.com",
    
    // production
    "https://public-eye.casescope.com",
    "https://casemaker.casescope.com"
  ]
};

// DO NOT MODIFY FROZEN REGION BELOW
// region Frozen
export const originConfig: OriginConfig = {
  ...DEFAULT_ORIGIN_CONFIG,
  ...customOriginConfig
};
// endregion Frozen