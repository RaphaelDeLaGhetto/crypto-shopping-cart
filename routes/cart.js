'use strict';

const express = require('express');
const router = express.Router();
const models = require('../models');
const Cart = require('../lib/cart');
const validator = require('../lib/orderValidator');
const mailer = require('../mailer');
const ejs = require('ejs');
const Styliner = require('styliner');
const path = require('path');
const QRCode = require('qrcode')

/**
 * GET /
 */
router.get('/', (req, res) => {

  if(!req.session.cart) {
    req.session.cart = {
      items: [],
      totals: 0,
      preferredCurrency: process.env.PREFERRED_CURRENCY
    };
  }  

  models.Wallet.find().then((wallets) => {
//  models.Wallet.findOne({ currency: req.session.cart.preferredCurrency }).then((wallet) => {

    let index = -1;
    wallets.forEach((wallet, i) => {
      if (!index && wallet.currency === req.session.cart.preferredCurrency) {
        index = i;
      }
    }); // It's left to the developer to ensure only one wallet for each currency
    let preferredWallet;
    if (index >= 0) {
        preferredWallet = wallets[index];
    }
    
    QRCode.toString(preferredWallet ? preferredWallet.address : 'This is not a valid address!!!',
      { type: 'svg' }, (err, url) => {

      if (err) {
        console.log(err);
      }
  
      res.render('cart', {
        path: req.originalUrl,
        cart: req.session.cart,
        messages: req.flash(),
        details: {},
        referrer: req.get('Referrer') || '/',
        qr: url,
        wallets: wallets
      });
    });
  }).catch((error) => {
    req.flash('error', [ { message: 'Something went wrong' } ]);
    return res.redirect('/cart');
  });
});

/**
 * POST /
 */
router.post('/', (req, res) => {
  models.Product.findOne({_id: req.body.id}).populate('prices.wallet').then(prod => {
    Cart.addToCart(prod, req.body.option, req.session.cart);
    res.redirect('/cart');
  }).catch(err => {
    res.redirect('/');
  });
});

/**
 * GET /remove/:id/:option?
 */
router.get('/remove/:id/:option?', (req, res) => {
  Cart.removeFromCart(req.params.id, req.params.option || null, req.session.cart);
  res.redirect('/cart');
});
 
/**
 * POST /checkout
 */
router.post('/checkout', (req, res) => {
  let cart = (typeof req.session.cart !== 'undefined') ? req.session.cart : false;

  models.Wallet.findOne({ currency: req.session.cart.preferredCurrency }).then((wallet) => {

    // Validate order form
    const errors = validator(req.body);
    if (errors) {
      QRCode.toString(wallet.address, { type: 'svg' }, (err, url) => {
        if (err) {
          console.log(err);
        }
  
        models.Wallet.find().then((wallets) => {
          res.render('cart', {
            path: req.originalUrl,
            cart: cart,
            messages: { error: errors },
            qr: url,
            referrer: req.get('Referrer'),
            details: req.body,
            wallets: wallets
          });
        }).catch((error) => {
          req.flash('error', [ { message: 'Something went wrong' } ]);
          return res.redirect('/cart');
        });
      });
    }
    else {
  
      Cart.purchase(req.body, cart);
  
      // Determine appropriate mailer templates
      const orderPaid = req.body.transaction && req.body.transaction.trim();
      let vendorTextTemplate = 'vendorUnpaidText.ejs';
      let vendorHtmlTemplate = 'vendorUnpaidHtml.ejs';
      let buyerTextTemplate = 'orderUnpaidText.ejs';
      let buyerHtmlTemplate = 'orderUnpaidHtml.ejs';
      let qrString = wallet.address;
      if (orderPaid) {
        vendorTextTemplate = 'vendorText.ejs';
        vendorHtmlTemplate = 'vendorHtml.ejs';
        buyerTextTemplate = 'orderText.ejs';
        buyerHtmlTemplate = 'orderHtml.ejs';
        qrString = req.body.transaction;
      }
  
      // Get vendor text content 
      ejs.renderFile(`${__dirname}/../views/mailer/${vendorTextTemplate}`, { cart: req.session.cart, wallet: wallet }, (err, textVendor) => {
        if (err) {
          console.log(err);
          req.flash('error', [ { message: 'Something went wrong' } ]);
          return res.redirect('/cart');
        }
  
        // Generate QR code for transaction or wallet
        QRCode.toDataURL(qrString, (err, qr) => {
          if (err) {
            console.log(err);
          }
  
          // Get vendor HTML content 
          ejs.renderFile(`${__dirname}/../views/mailer/${vendorHtmlTemplate}`, { cart: req.session.cart, qr: qr }, (err, htmlVendor) => {
            if (err) {
              console.log(err);
              req.flash('error', [ { message: 'Something went wrong' } ]);
              return res.redirect('/cart');
            }
  
            // Inline CSS processing for vendor email
            const styliner = new Styliner(__dirname + '/..', {noCSS: false});
            styliner.processHTML(htmlVendor).then((vendorHtmlAndCss) => {
  
              // Attach images
              let seen = [];
              let attachments = req.session.cart.items.reduce((atts, item) => {
                if (seen.indexOf(item.image) < 0) {
                  seen.push(item.image);
                  atts.push({ filename: item.image,
                             path: path.resolve(__dirname, '../public/images/products', item.image),
                             cid: item.image });
                }
                return atts;
              }, []);
  
              // Attach QR
              attachments.push({
                path: qr,
                cid: 'qr.png'
              });
   
              let vendorMailOptions = {
                to: process.env.FROM,
                from: req.body.email || process.env.FROM,
                subject: orderPaid ? 'New order received' : 'New order received - unpaid',
                text: textVendor,
                html: vendorHtmlAndCss,
                attachments: attachments
              };
  
              // Send order to vendor
              mailer.transporter.sendMail(vendorMailOptions, (err, info) => {
                if (err) {
                  console.log(err);
                  req.flash('error', [ { message: 'Something went wrong' } ]);
                  return res.redirect('/cart');
                }
  
                // Customer may decline email contact
                if (req.body.email && req.body.email.trim()) {
  
                  // Get email text content
                  ejs.renderFile(`${__dirname}/../views/mailer/${buyerTextTemplate}`, { cart: req.session.cart, wallet: wallet }, (err, textEmail) => {
                    if (err) {
                      console.log(err);
                      req.flash('error', [ { message: 'Something went wrong' } ]);
                      return res.redirect('/cart');
                    }
  
                    // Get email HTML content 
                    ejs.renderFile(`${__dirname}/../views/mailer/${buyerHtmlTemplate}`, { cart: req.session.cart, qr: qr, wallet: wallet }, (err, htmlEmail) => {
                      if (err) {
                        console.log(err);
                        req.flash('error', [ { message: 'Something went wrong' } ]);
                        return res.redirect('/cart');
                      }
      
                      // Inline CSS processing
                      styliner.processHTML(htmlEmail).then((htmlAndCss) => {
           
                        let mailOptions = {
                          to: process.env.TOR ? process.env.FROM : req.body.email,
                          from: process.env.TOR ? req.body.email : process.env.FROM,
                          subject: `Order received - ${orderPaid ? 'here is your receipt' : 'payment instructions'}`,
                          text: textEmail,
                          html: htmlAndCss,
                          attachments: attachments
                        };
            
                        mailer.transporter.sendMail(mailOptions, (err, info) => {
                          if (err) {
                            console.log(err);
                            req.flash('error', [ { message: 'Something went wrong' } ]);
                            return res.redirect('/cart');
                          }
                          if (orderPaid) {
                            req.flash('success', `Your order has been received. An email copy of this receipt will be sent to ${req.body.email}`);
                            return res.redirect('/cart/receipt');
                          }
                          Cart.emptyCart(cart);
                          req.flash('success', `Your order has been received. Transaction instructions will be sent to ${req.body.email}`);
                          res.redirect('/');
                        });
                      }).catch((err) => {
                        console.log(err);
                        req.flash('error', [ { message: 'Something went wrong' } ]);
                        return res.redirect('/cart');
                      });
                    });
                  });
                }
                else {
                  req.flash('success', 'Your order has been received. Print this receipt for your records.');
                  res.redirect('/cart/receipt');
                }
              });
            }).catch((err) => {
              console.log(err);
              req.flash('error', [ { message: 'Something went wrong' } ]);
              return res.redirect('/cart');
            });
          });
        });
      });
    }
  }).catch((err) => {
    req.flash('error', [ { message: 'Something went wrong' } ]);
    return res.redirect('/cart');
  });
});

/**
 * GET /receipt
 */
router.get('/receipt', (req, res) => {
  let cart = (typeof req.session.cart !== 'undefined') ? req.session.cart : false;

  if (!cart || !cart.order) {
    res.render('receipt', {
      cart: cart,
      path: req.originalUrl,
      referrer: req.get('Referrer') || '/',
      messages: req.flash()
    });
    return;
  }

  QRCode.toString(cart.order.transaction, { type: 'svg' }, (err, url) => {
    if (err) {
      console.log(err);
    }

    cart = Object.assign({}, cart);
    Cart.emptyCart(req.session.cart);

    res.render('receipt', {
      path: req.originalUrl,
      cart: cart,
      referrer: req.get('Referrer') || '/',
      messages: req.flash(),
      qr: url
    });
  });
});

/**
 * POST /set-currency
 */
router.post('/set-currency', (req, res) => {
  req.session.cart.preferredCurrency = req.body.currency;
  req.flash('info', `Currency switched to ${req.session.cart.preferredCurrency}`);
  res.redirect(req.get('Referrer'));
});

module.exports = router;
