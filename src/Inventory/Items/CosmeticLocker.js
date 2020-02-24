const Item = require('epicgames-fortnite-client/src/Inventory/Item');

class CosmeticLocker extends Item {

  constructor(app, data) {
    super(app, data);

    this.id = data.id

    this.templateId = data.templateId

    this.quantity = data.quantity

    this.attributes = data.attributes

  }

}

module.exports = CosmeticLocker;
