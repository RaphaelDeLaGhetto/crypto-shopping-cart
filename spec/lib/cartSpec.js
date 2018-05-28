'use strict';                  

const Cart = require('../../lib/cart');
const fixtures = require('pow-mongoose-fixtures');
const models = require('../../models');
const currencyFormatter = require('currency-formatter');

describe('Cart', () => {
  let _product;

  beforeEach((done) => {
    fixtures.load(__dirname + '/../fixtures/products.js', models.mongoose, (err) => {
      if (err) done.fail(err);
      models.Product.findOne({}, (err, results) => {
        if (err) done.fail(err);
        _product = results;
        done();
      });
    });
  });

  afterEach((done) => {
    models.dropDatabase(() => {
      done();
    });
  });

  describe('.addToCart', () => {
    let cartSession;

    beforeEach(() => {
      cartSession = { items: [] };
    });

    it('adds a product to the cart session object passed as a parameter', () => {
      expect(cartSession.items.length).toEqual(0);
      Cart.addToCart(_product, "Large", cartSession);
      expect(cartSession.items.length).toEqual(1);
    });

    it('calculates the total value of the cart', () => {
      Cart.addToCart(_product, "Large", cartSession);
      expect(cartSession.items.length).toEqual(1);
      expect(cartSession.total).toEqual(_product.price);
    });

    it('sets the formatted total value', () => {
      Cart.addToCart(_product, "Large", cartSession);
      expect(cartSession.items.length).toEqual(1);
      expect(cartSession.formattedTotal).toEqual(currencyFormatter.format(_product.price, { code: 'CAD' }));
    });

    it('sets a product option to null if not specified as a parameter', () => {
      expect(cartSession.items.length).toEqual(0);
      Cart.addToCart(_product, cartSession);
      expect(cartSession.items.length).toEqual(1);
      expect(cartSession.items[0].option).toBe(null);
    });

    it('sets a formatted total for the individual product', () => {
      expect(cartSession.items.length).toEqual(0);
      Cart.addToCart(_product, cartSession);
      expect(cartSession.items.length).toEqual(1);
      expect(cartSession.items[0].formattedPrice).toEqual(currencyFormatter.format(cartSession.items[0].price, { code: 'CAD' }));
    });
  });

  describe('.removeFromCart', () => {
    let cartSession;

    beforeEach(() => {
      cartSession = { items: [] };
    });

    it('removes a product from the cart session object passed as a parameter', () => {
      Cart.addToCart(_product, "Large", cartSession);
      expect(cartSession.items.length).toEqual(1);

      Cart.removeFromCart(_product._id, "Large", cartSession);
      expect(cartSession.items.length).toEqual(0);
    });

    it('recalculate cart total order price', () => {
      Cart.addToCart(_product, "Large", cartSession);
      expect(cartSession.total).toEqual(_product.price);

      Cart.removeFromCart(_product._id, "Large", cartSession);
      expect(cartSession.total).toEqual(0);
    });

    it('resets the formmatted total', () => {
      Cart.addToCart(_product, "Large", cartSession);
      expect(cartSession.formattedTotal).toEqual(currencyFormatter.format(_product.price, { code: 'CAD' }));

      Cart.removeFromCart(_product._id, "Large", cartSession);
      expect(cartSession.formattedTotal).toEqual('$0.00');
    });

    it('doesn\'t remove a product if the option parameter provides no match', () => {
      Cart.addToCart(_product, "Large", cartSession);
      expect(cartSession.items.length).toEqual(1);

      Cart.removeFromCart(_product._id, "Small", cartSession);
      expect(cartSession.items.length).toEqual(1);
    });

    it('removes only one product from the cart session object passed as a parameter', () => {
      Cart.addToCart(_product, "Large", cartSession);
      Cart.addToCart(_product, "Small", cartSession);
      Cart.addToCart(_product, "Large", cartSession);
      expect(cartSession.items.length).toEqual(3);

      Cart.removeFromCart(_product._id, "Large",  cartSession);
      expect(cartSession.items.length).toEqual(2);
      expect(cartSession.items[0].option).toEqual("Small");
      expect(cartSession.items[1].option).toEqual("Large");
    });

    it('doesn\'t barf if removing a non-existent product from the cart session object', () => {
      Cart.addToCart(_product, "Large", cartSession);
      expect(cartSession.items.length).toEqual(1);
      Cart.removeFromCart('nosuchid', "Large",  cartSession);
      expect(cartSession.items.length).toEqual(1);
    });

    it('doesn\'t barf if removing a non-existent product from an empty cart session object', () => {
      expect(cartSession.items.length).toEqual(0);
      Cart.removeFromCart(_product._id, "Large",  cartSession);
      expect(cartSession.items.length).toEqual(0);
    });
  });

  describe('.calculateTotal', () => {
    let cartSession;

    beforeEach(() => {
      cartSession = { items: [] };
    });

    it('calculates and sets the total order price', () => {
      Cart.calculateTotal(cartSession);
      expect(cartSession.total).toEqual(0)
      Cart.addToCart(_product, "Large", cartSession);
      Cart.calculateTotal(cartSession);
      expect(cartSession.total).toEqual(_product.price)
      Cart.addToCart(_product, "Large", cartSession);
      Cart.calculateTotal(cartSession);
      expect(cartSession.total).toEqual(_product.price * 2)
    });

    it('sets the formatted total', () => {
      expect(cartSession.items.length).toBe(0);
      expect(cartSession.total).toBe(undefined);
      Cart.calculateTotal(cartSession);
      expect(cartSession.total).toEqual(0);
      Cart.addToCart(_product, "Large", cartSession);
      Cart.calculateTotal(cartSession);
      expect(cartSession.formattedTotal).toEqual(currencyFormatter.format(_product.price, { code: 'CAD' }));
      Cart.addToCart(_product, "Large", cartSession);
      Cart.calculateTotal(cartSession);
      expect(cartSession.formattedTotal).toEqual(currencyFormatter.format(_product.price * 2, { code: 'CAD' }));
    });
  });

  describe('.emptyCart', () => {
    let cartSession;

    beforeEach(() => {
      cartSession = { items: [] };
      Cart.addToCart(_product, "Large", cartSession);
      Cart.addToCart(_product, "Small", cartSession);
      Cart.addToCart(_product, "Large", cartSession);
      expect(cartSession.items.length).toEqual(3);
      expect(cartSession.total).toEqual(_product.price * 3);
      expect(cartSession.formattedTotal).toEqual(currencyFormatter.format(_product.price * 3, { code: 'CAD' }));
    });

    it('empties the cart and resets all the values', () => {
      Cart.emptyCart(cartSession);
      expect(cartSession.items.length).toEqual(0);
      expect(cartSession.total).toEqual(0);
      expect(cartSession.formattedTotal).toEqual('$0.00');
    });

    it('empties order details', () => {
      Cart.purchase({ transaction: '0x50m3crazy1d' }, cartSession);
      Cart.emptyCart(cartSession);
      expect(cartSession.order).toBe(undefined);
    });
  });

  describe('.purchase', () => {
    let cartSession;

    beforeEach(() => {
      cartSession = { items: [] };
    });

    it('adds order details to the cart', () => {
      const order = {
        transaction: '0x50m3crazy1d',
        recipient: 'Anonymous',
        street: '123 Fake Street',
        city: 'The C-Spot',
        province: 'AB',
        country: 'No thanks',
        postcode: 'T1K-5B3',
        contact: '1',
        email: 'me@example.com'
      };

      Cart.purchase(order, cartSession);
      expect(cartSession.order.transaction).toEqual(order.transaction);
      expect(cartSession.order.recipient).toEqual(order.recipient);
      expect(cartSession.order.street).toEqual(order.street);
      expect(cartSession.order.city).toEqual(order.city);
      expect(cartSession.order.province).toEqual(order.province);
      expect(cartSession.order.postcode).toEqual(order.postcode);
      expect(cartSession.order.contact).toEqual(order.contact);
      expect(cartSession.order.email).toEqual(order.email);
    });
  });

  describe('.getEmptyCart', () => {
    it('returns an empty cart object', () => {
      const cart = Cart.getEmptyCart();
      expect(cart.items).toEqual([]);
      expect(cart.total).toEqual(0);
      expect(cart.formattedTotal).toEqual('$0.00');
    });
  });
});
