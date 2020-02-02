const Item = require('../Item');

class CosmeticVariantToken extends Item {

  constructor(app, data) {
    super(app, data);

    console.log(data)

  }

}

module.exports = CosmeticVariantToken;
