'use strict';

const express = require('express');
const router = express.Router();
const models = require('../models');

/**
 * GET /
 */
router.get('/:category', (req, res) => {
  models.Product.find({ categories: req.params.category }).sort('createdAt').then((products) => {
    if (!products.length) {
      req.flash('info', `No such category exists: ${req.params.category}`);
    }

    res.render('index', {
      cart: req.session.cart,
      path: req.originalUrl,
      products: products,
      messages: req.flash(),
    });
  }).catch((error) => {
    return res.status(500).send(error);
  });
});

module.exports = router;
