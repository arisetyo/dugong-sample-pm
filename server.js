/**
 * @file server.js
 * @version 0.0.1
 * @copyright Arie M. Prasetyo
 * @description A Fastify server with SSR and API endpoints
 */

import Fastify from 'fastify'
import FastifyView from '@fastify/view'
import FastifyStatic from '@fastify/static'

import FastifyCookie from '@fastify/cookie';
import FastifySession from '@fastify/session';
import FastifyOauth2 from '@fastify/oauth2';

import { createClient } from '@supabase/supabase-js'
import * as sass from 'sass'
import ejs from 'ejs'

import dotenv from 'dotenv'
import fs from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

import { loadMessages, loadMessage } from './models/messages.js'


dotenv.config()
const __dirname = dirname(fileURLToPath(import.meta.url))

const SERVICE_PORT_NUMBER = 3330
const VIEWS_DIR = 'views';

const IS_DEV = process.argv.includes('--dev')

// Create the server = = = = = = = = = = = = = = = = = = = = = = = = = = = = = =
const server = Fastify({
  logger: {
    transport: {
      target: '@fastify/one-line-logger'
    }
  }
})

// Register plugins = = = = = = = = = = = = = = = = = = = = = = = = = = = = = =
server.register(FastifyView, {
  engine: { ejs }
})

server.register(FastifyStatic, {
  root: join(__dirname, 'public'),
  prefix: '/'
})

// Register cookie and session
server.register(FastifyCookie)
server.register(FastifySession, {
  secret: process.env.SESSION_SECRET,
  cookie: {
    secure: false
  },
  maxAge: 86400000, // Session expiration time in milliseconds (e.g., 24 hours)
  saveUninitialized: false, // Do not save uninitialized sessions
  resave: false // Do not resave sessions if they are unmodified
})

// Register Google OAuth
server.register(FastifyOauth2, {
  name: 'googleOAuth',
  scope: ['profile', 'email'],
  credentials: {
    client: {
      id: process.env.GOOGLE_CLIENT_ID,
      secret: process.env.GOOGLE_CLIENT_SECRET,
    },
    auth: FastifyOauth2.GOOGLE_CONFIGURATION,
  },
  startRedirectPath: '/auth/login',
  callbackUri: process.env.GOOGLE_CALLBACK_URL,
})

// Middleware to check authentication
server.addHook('preHandler', (req, _, done) => {
  req.isAuthenticated = !!req.session.user
  done()
})


// Compile Sass to CSS = = = = = = = = = = = = = = = = = = = = = = = = = = = = =
const compileSass = async () =>{
  const result = await sass.compileAsync(join(__dirname, 'views/styles/MAIN.scss'))
  fs.writeFileSync(join(__dirname, 'public/assets/styles.css'), result.css)
}
compileSass()


// initialize Supabase = = = = = = = = = = = = = = = = = = = = = = = = = = = = =
const supabaseUrl = process.env.API_URL
const supabaseKey = process.env.API_KEY
if (!supabaseUrl || !supabaseKey) console.error('Missing creds')

  const options = {
  db: {
    schema: process.env.SCHEMA
  },
  auth: {
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: true
  }
}
const SUPABASE = createClient(supabaseUrl, supabaseKey, options)


// Endpoints = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = =

// - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -
// Login/home page
server.get('/', async (_, reply) => {
  return reply.view(`${VIEWS_DIR}/pages/index.html.ejs`)
})

// Route: Handle Google OAuth callback
server.get('/auth/callback', async (req, reply) => {
  const token = await server.googleOAuth.getAccessTokenFromAuthorizationCodeFlow(req)

  // Extract user info
  const userInfo = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
    headers: { Authorization: `Bearer ${token.token.access_token}` },
  }).then(res => res.json())

  // Save user info to session
  req.session.user = userInfo

  reply.redirect('/dashboard')
})

// Dashboard page (PROTECTED)
server.get('/dashboard', async (req, reply) => {
  if (!IS_DEV && !req.isAuthenticated) return reply.redirect('/')

  return reply.view(`${VIEWS_DIR}/pages/dashboard.html.ejs`, { user: req.session.user })
})

// - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -
// Route: Get messages (PROTECTED)
server.get('/api/messages', async (req, reply) => {
  if (!IS_DEV && !req.isAuthenticated) return reply.redirect('/404')

  const messages = await loadMessages(SUPABASE, 1) // user_id = 1 for now

  if (messages.status === 'error') return reply.code(500).send('Error fetching messages')

  // get template
  const template = await fs.readFileSync(join(__dirname, `${VIEWS_DIR}/components/atoms/MessageItem.ejs`), 'utf8')
  const result = await messages.data.map(message => (ejs.render(template, { message }))).join('')

  reply.type('text/html').send(result)
})

// Route: Get a single message (PROTECTED)
server.get('/api/message/:id', async (req, reply) => {
  if (!IS_DEV && !req.isAuthenticated) return reply.redirect('/404')

  const message = await loadMessage(SUPABASE, req.params.id)

  if (message.status === 'error') return reply.code(500).send('Error fetching message')

  reply.type('text/html').send(`<pre>${message.data[0].message}</pre>`)
})


// - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -
// Route: Logout
server.get('/logout', (req, reply) => {
  req.session.destroy()
  reply.redirect('/')
})

// Route: 404
server.get('/404', (_, reply) => {
  return reply.view(`${VIEWS_DIR}/pages/404.html.ejs`)
})

// Catch-all route for non-existent routes
server.setNotFoundHandler((_, reply) => {
  reply.redirect('/404')
})

// Start the server = = = = = = = = = = = = = = = = = = = = = = = = = = = = = =
const start = async () => {
  try {
    await server.listen({ port: SERVICE_PORT_NUMBER })
    console.log(`Server listening on port ${SERVICE_PORT_NUMBER}`)
  } catch (err) {
    server.log.error(err)
    process.exit(1)
  }
}
start()