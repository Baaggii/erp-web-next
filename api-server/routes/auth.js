const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const bcrypt = require('bcrypt');

router.post('/login', async (req, res) => {
  const { email, password } = req.body;
  // Validate user, compare bcrypt, sign JWT
  // ...
});

router.post('/change-password', async (req, res) => {
  // JWT auth middleware → update password
  // ...
});

module.exports = router;