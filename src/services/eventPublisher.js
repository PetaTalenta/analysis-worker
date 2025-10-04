/**
 * Event Publisher Service for Analysis Worker
 * Publishes analysis events to RabbitMQ for decoupled communication
 */

const logger = require('../utils/logger');

// Event publisher instance
let eventPublisher = null;

/**
 * Event Publisher Class
 */
class EventPublisher {
  constructor() {
    this.channel = null;
    this.config = {
      eventsExchange: process.env.EVENTS_EXCHANGE_NAME || 'atma_events_exchange',
      routingKeys: {
        analysisCompleted: 'analysis.completed',
        analysisFailed: 'analysis.failed',
        analysisStarted: 'analysis.started'
      }
    };
  }

  /**
   * Initialize the event publisher with RabbitMQ channel
   * @param {Object} channel - RabbitMQ channel
   */
  async initialize(channel) {
    try {
      this.channel = channel;

      // Setup events exchange
      await this.channel.assertExchange(this.config.eventsExchange, 'topic', {
        durable: true
      });

      logger.info('Event Publisher initialized', {
        exchange: this.config.eventsExchange,
        routingKeys: this.config.routingKeys
      });

    } catch (error) {
      logger.error('Failed to initialize Event Publisher', {
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Publish analysis completed event
   * @param {Object} eventData - Event data
   */
  async publishAnalysisCompleted(eventData) {
    const event = {
      eventType: 'analysis.completed',
      timestamp: new Date().toISOString(),
      jobId: eventData.jobId,
      userId: eventData.userId,
      userEmail: eventData.userEmail,
      resultId: eventData.resultId,
      metadata: {
        assessmentName: eventData.assessmentName || 'AI-Driven Talent Mapping',
        processingTime: eventData.processingTime || 0,
        retryCount: eventData.retryCount || 0
      }
    };

    return this._publishEvent(this.config.routingKeys.analysisCompleted, event);
  }

  /**
   * Publish analysis failed event
   * @param {Object} eventData - Event data
   */
  async publishAnalysisFailed(eventData) {
    const event = {
      eventType: 'analysis.failed',
      timestamp: new Date().toISOString(),
      jobId: eventData.jobId,
      userId: eventData.userId,
      userEmail: eventData.userEmail,
      errorMessage: eventData.errorMessage,
      metadata: {
        assessmentName: eventData.assessmentName || 'AI-Driven Talent Mapping',
        processingTime: eventData.processingTime || 0,
        retryCount: eventData.retryCount || 0,
        errorType: eventData.errorType || 'unknown'
      }
    };

    return this._publishEvent(this.config.routingKeys.analysisFailed, event);
  }

  /**
   * Publish analysis started event (Week 2 Enhanced)
   * @param {Object} eventData - Event data
   */
  async publishAnalysisStarted(eventData) {
    const event = {
      eventType: 'analysis.started',
      timestamp: new Date().toISOString(),
      jobId: eventData.jobId,
      userId: eventData.userId,
      userEmail: eventData.userEmail,
      resultId: eventData.resultId || null, // Week 2: Include resultId
      metadata: {
        assessmentName: eventData.assessmentName || 'AI-Driven Talent Mapping',
        estimatedProcessingTime: eventData.estimatedProcessingTime || 0
      }
    };

    return this._publishEvent(this.config.routingKeys.analysisStarted, event);
  }

  /**
   * Internal method to publish event to RabbitMQ
   * @param {string} routingKey - Routing key for the event
   * @param {Object} event - Event data
   * @private
   */
  async _publishEvent(routingKey, event) {
    try {
      if (!this.channel) {
        throw new Error('Event Publisher not initialized');
      }

      const message = Buffer.from(JSON.stringify(event));
      
      const published = this.channel.publish(
        this.config.eventsExchange,
        routingKey,
        message,
        {
          persistent: true,
          timestamp: Date.now(),
          messageId: `${event.jobId}-${event.eventType}-${Date.now()}`
        }
      );

      if (published) {
        logger.info('Event published successfully', {
          eventType: event.eventType,
          jobId: event.jobId,
          userId: event.userId,
          routingKey,
          exchange: this.config.eventsExchange
        });
      } else {
        logger.warn('Event publish returned false (buffer full)', {
          eventType: event.eventType,
          jobId: event.jobId,
          routingKey
        });
      }

      return published;

    } catch (error) {
      logger.error('Failed to publish event', {
        eventType: event.eventType,
        jobId: event.jobId,
        routingKey,
        error: error.message
      });
      
      // Don't throw error to avoid breaking the main process
      // Events are fire-and-forget
      return false;
    }
  }

  /**
   * Check if event publisher is ready
   * @returns {boolean}
   */
  isReady() {
    return this.channel !== null;
  }

  /**
   * Get event publisher configuration
   * @returns {Object}
   */
  getConfig() {
    return {
      ...this.config,
      isReady: this.isReady()
    };
  }
}

/**
 * Initialize the global event publisher instance
 * @param {Object} channel - RabbitMQ channel
 */
const initializeEventPublisher = async (channel) => {
  if (!eventPublisher) {
    eventPublisher = new EventPublisher();
  }
  
  await eventPublisher.initialize(channel);
  return eventPublisher;
};

/**
 * Get the global event publisher instance
 * @returns {EventPublisher}
 */
const getEventPublisher = () => {
  if (!eventPublisher) {
    throw new Error('Event Publisher not initialized. Call initializeEventPublisher first.');
  }
  return eventPublisher;
};

module.exports = {
  EventPublisher,
  initializeEventPublisher,
  getEventPublisher
};
