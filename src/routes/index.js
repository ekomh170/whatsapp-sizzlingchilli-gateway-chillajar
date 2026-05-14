'use strict';

const { Router } = require('express');

const router = Router();

router.use(require('./status'));
router.use(require('./message'));
router.use(require('./qr'));
router.use(require('./admin'));
router.use(require('./logs'));

module.exports = router;
