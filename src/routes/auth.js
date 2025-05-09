const express = require('express')
const router = express.Router()
const jwt = require('jsonwebtoken')
const bcrypt = require('bcrypt')
const db = require('../lib/db')

const JWT_SECRET = process.env.JWT_SECRET || 'devsecret'

router.post('/login', async (req, res) => {
  const { email, password } = req.body
  if (!email || !password) return res.status(400).json({ error: 'Invalid' })

  const [rows] = await db.query('SELECT * FROM users WHERE email = ?', [email])
  if (!rows.length) return res.status(401).json({ error: 'Invalid credentials' })

  const user = rows[0]
  const match = await bcrypt.compare(password, user.password)
  if (!match) return res.status(401).json({ error: 'Invalid credentials' })

  const token = jwt.sign({ id: user.id, email: user.email }, JWT_SECRET, { expiresIn: '1d' })
  res.cookie('token', token, { httpOnly: true }).json({ token })
})

router.get('/me', (req, res) => {
  const token = req.cookies.token
  if (!token) return res.status(401).json({ error: 'No token' })
  try {
    const user = jwt.verify(token, JWT_SECRET)
    res.json(user)
  } catch {
    res.status(401).json({ error: 'Invalid token' })
  }
})

router.post('/logout', (req, res) => {
  res.clearCookie('token').json({ success: true })
})

module.exports = router