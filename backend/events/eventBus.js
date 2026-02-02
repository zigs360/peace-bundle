const EventEmitter = require('events');

class EventBus extends EventEmitter {
    constructor() {
        super();
    }

    /**
     * Dispatch an event
     * @param {Object} eventInstance - Instance of an event class
     */
    dispatch(eventInstance) {
        const eventName = eventInstance.constructor.name;
        // console.log(`Dispatching event: ${eventName}`);
        this.emit(eventName, eventInstance);
    }
}

const eventBus = new EventBus();

module.exports = eventBus;
