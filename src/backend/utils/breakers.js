const CircuitBreaker = require('opossum');
const logger = require('./logger');

const BREAKER_OPTIONS = {
  timeout: 5000,               // fail the call if it takes > 5s
  errorThresholdPercentage: 50, // open after 50% failures in the rolling window
  resetTimeout: 30000,         // try half-open after 30s
  volumeThreshold: 3,          // need at least 3 calls before tripping
};

function makeBreaker(name, fn) {
  const breaker = new CircuitBreaker(fn, BREAKER_OPTIONS);

  breaker.on('open',     () => logger.warn({ breaker: name }, 'circuit breaker opened'));
  breaker.on('halfOpen', () => logger.info({ breaker: name }, 'circuit breaker half-open — probing'));
  breaker.on('close',    () => logger.info({ breaker: name }, 'circuit breaker closed — service recovered'));
  breaker.fallback(() => {
    logger.warn({ breaker: name }, 'circuit breaker fallback — call skipped');
    throw new Error(`circuit breaker open: ${name} delivery skipped`);
  });

  return breaker;
}

// Lazy singletons — created once on first require, reused across the process.
let _fcmBreaker   = null;
let _emailBreaker = null;

function getFcmBreaker() {
  if (!_fcmBreaker) {
    const { sendPushNotification } = require('./fcm');
    _fcmBreaker = makeBreaker('fcm', sendPushNotification);
  }
  return _fcmBreaker;
}

function getEmailBreaker() {
  if (!_emailBreaker) {
    const { deliverEmail } = require('../services/emailService');
    _emailBreaker = makeBreaker('email', deliverEmail);
  }
  return _emailBreaker;
}

// Expose breaker states for /health endpoint
function breakerStats() {
  return {
    fcm:   _fcmBreaker   ? _fcmBreaker.status.stats   : null,
    email: _emailBreaker ? _emailBreaker.status.stats : null,
  };
}

module.exports = { getFcmBreaker, getEmailBreaker, breakerStats };
