const Item = require('../Item');

class AthenaRewardGraph extends Item {

  constructor(app, data) {
    super(app, data);
    
    this.id = data.id

    this.quantity = data.quantity

    this.templateId = data.templateId

    this.attributes = data.attributes

  }

}

module.exports = AthenaRewardGraph;
