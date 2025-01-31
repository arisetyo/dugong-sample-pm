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

import { loadMessages } from './models/message.js'


dotenv.config()
const __dirname = dirname(fileURLToPath(import.meta.url))

const SERVICE_PORT_NUMBER = 3330
const VIEWS_DIR = 'views';


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
  cookie: { secure: false },
  saveUninitialized: false,
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
  return reply.view(`${VIEWS_DIR}/pages/index.ejs`)
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
  if (!req.isAuthenticated) return reply.redirect('/')

  return reply.view(`${VIEWS_DIR}/pages/dashboard.ejs`, { user: req.session.user })
})

// Route: Logout
server.get('/logout', (req, reply) => {
  req.session.destroy()
  reply.redirect('/')
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