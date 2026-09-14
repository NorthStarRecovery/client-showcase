/* Public GA4 configuration. A Measurement ID is public, never an account password. */
window.NORTHSTAR_ANALYTICS_CONFIG = Object.freeze({
  measurementId: 'G-3VW7MFYBT8',
  allowedHosts: Object.freeze(['northstarrecovery.github.io']),
  publicBasePath: '/client-showcase/',
  campaignSources: Object.freeze(['linkedin', 'email', 'newsletter', 'qr', 'northstar', 'website', 'event']),
  campaignMediums: Object.freeze(['social', 'email', 'qr', 'referral', 'print', 'organic', 'event']),
  campaignNames: Object.freeze([
    'client-showcase', 'industry-collection', 'marketing-collection', 'premier-response',
    'manufacturing', 'industrial', 'commercial-real-estate', 'medical', 'education', 'technology',
    'manufacturing-overview', 'manufacturing-brief', 'industrial-overview', 'industrial-brief',
    'commercial-real-estate-overview', 'commercial-real-estate-brief', 'medical-overview',
    'medical-brief', 'education-overview', 'education-brief', 'technology-overview', 'technology-brief'
  ])
});
