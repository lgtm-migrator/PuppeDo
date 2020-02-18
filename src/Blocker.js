const _ = require('lodash');

const EventEmitter = require('events');

const Singleton = require('./Singleton.js');

class Blocker extends Singleton {
  constructor() {
    super();
    this.blocks = this.blocks || [];
    this.blockEmitter = this.blockEmitter || new EventEmitter();
    this.blockEmitter.setMaxListeners(1000);
  }

  push(data) {
    this.blocks.push(data);
  }

  refresh() {
    this.blocks = [];
  }

  setAll(blockArray) {
    if (_.isArray(blockArray)) {
      this.blocks = blockArray;
    } else {
      throw new Error({ message: 'Blocks must be array' });
    }
    this.blocks.forEach((v) => {
      this.blockEmitter.emit('updateBlock', v);
    });
  }

  setBlock(stepId, block) {
    this.blocks.forEach((v) => {
      if (v.stepId === stepId) {
        const emmitData = { ...v, ...{ block: Boolean(block) } };
        this.blockEmitter.emit('updateBlock', emmitData);
      }
    });
  }

  getBlock(stepId) {
    return (this.blocks.find((v) => v.stepId === stepId) || {}).block;
  }
}

module.exports = {
  Blocker,
};
