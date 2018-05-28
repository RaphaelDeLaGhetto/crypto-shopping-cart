'use strict';

const currencyFormatter = require('currency-formatter');

class Cart {

  /**
   * addToCart
   */
  static addToCart(product, option, cart) {
    if (!cart) {
      cart = option;
      option = null;
    }

    let prod = {
      id: product._id,
      name: product.name,
      price: product.price,
      image: product.images[0],
      option: option,
      formattedPrice: this.getFormattedPrice(product.price)
    };

    cart.items.push(prod);
    this.calculateTotal(cart);
  }

  /**
   * removeFromCart
   */
  static removeFromCart(id, option, cart) {
    for(let i = 0; i < cart.items.length; i++) {
      let item = cart.items[i];
      if (item.id.toString() === id.toString() && item.option === option) {
        cart.items.splice(i, 1);
        break;
      }
    };
    this.calculateTotal(cart);
  }

  /**
   * calculateTotal
   */
  static calculateTotal(cart) {
    cart.total = 0;
    cart.items.forEach((item) => {
      cart.total += item.price;
    });
    cart.formattedTotal = this.getFormattedPrice(cart.total);
  }

  /**
   * emptyCart
   */
  static emptyCart(cart) {
    cart.items = [];
    cart.total = 0;
    cart.formattedTotal = this.getFormattedPrice(0); 
    delete cart.order;
  }

  /**
   * getFormattedPrice
   */
  static getFormattedPrice(total) {
    return currencyFormatter.format(total, { code: 'CAD' });
  }

  /**
   * purchase
   */
  static purchase(order, cart) {
    cart.order = order;
  }

  /**
   * getEmptyCart
   */
  static getEmptyCart() {
    return {
      items: [],
      total: 0,
      formattedTotal: this.getFormattedPrice(0)
    } 
  }
}

module.exports = Cart;
