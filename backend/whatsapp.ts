import {
  makeWASocket,
  DisconnectReason,
  useMultiFileAuthState,
  fetchLatestBaileysVersion,
  makeCacheableSignalKeyStore,
  WASocket,
  proto,
  downloadMediaMessage,
} from '@whiskeysockets/baileys';
import { Boom } from '@hapi/boom';
import pino from 'pino';
import path from 'path';
import fs from 'fs';
import db from './db.js';
import { callAI, extractLeadInfo, generateFollowupMessage } from './ai.js';
import { Server as SocketIOServer } from 'socket.io';

const logger = pino({ level: 'silent' });

interface SessionManager {
  [key: string]: WASocket;
}

const sessions: SessionManager = {};
const qrCache: { [key: string]: string } = {};
const reconnectAttempts: { [key: string]: number } = {};

// Ensure uploads directory exists
const uploadsDir = path.join(process.cwd(), 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

export async function connectToWhatsApp(sessionId: string, io: SocketIOServer, force: boolean = false) {
  if (force) {
    console.log(`Force reconnecting session ${sessionId}, clearing session directory`);
    if (sessions[sessionId]) {
      try { sessions[sessionId].end(undefined); } catch (e) {}
      delete sessions[sessionId];
    }
    const sessionDir = path.join(process.cwd(), 'sessions', sessionId);
    if (fs.existsSync(sessionDir)) {
      try {
        fs.rmSync(sessionDir, { recursive: true, force: true });
      } catch (e) {
        console.error(`Failed to delete session dir for ${sessionId}:`, e);
      }
    }
    await new Promise(r => setTimeout(r, 1000));
  } else if (sessions[sessionId]) {
    // Sirf skip karo agar actually connected hai
    const sock = sessions[sessionId];
    if ((sock as any).user) {
      console.log(`Session ${sessionId} already connected, skipping`);
      return sock;
    }
    // Connected nahi — purana cleanup karo
    console.log(`Session ${sessionId} socket exists but not connected, cleaning up`);
    try { sock.end(undefined); } catch (e) {}
    delete sessions[sessionId];
  }

  await db.prepare('UPDATE whatsapp_sessions SET status = ? WHERE id = ?').run('connecting', sessionId);
  io.emit('connection_status', { sessionId, status: 'connecting' });

  const sessionDir = path.join(process.cwd(), 'sessions', sessionId);
  if (!fs.existsSync(sessionDir)) {
    fs.mkdirSync(sessionDir, { recursive: true });
  }

  const { state, saveCreds } = await useMultiFileAuthState(sessionDir);
  const { version, isLatest } = await fetchLatestBaileysVersion();

  const sock = makeWASocket({
    version,
    printQRInTerminal: false,
    auth: {
      creds: state.creds,
      keys: makeCacheableSignalKeyStore(state.keys, logger),
    },
    logger,
  });

  sessions[sessionId] = sock;

  // Set a timeout to reset status if stuck in connecting for too long
  setTimeout(async () => {
    try {
      const session = await db.prepare('SELECT status FROM whatsapp_sessions WHERE id = ?').get(sessionId);
      if (session && session.status === 'connecting' && sessions[sessionId] === sock) {
        console.log(`Session ${sessionId} stuck in connecting for 2 mins, resetting...`);
        await db.prepare('UPDATE whatsapp_sessions SET status = ? WHERE id = ?').run('disconnected', sessionId);
        io.emit('connection_status', { sessionId, status: 'disconnected' });
        delete sessions[sessionId];
        try { sock.end(undefined); } catch (e) {}
      }
    } catch (e) {}
  }, 120000); // 2 minutes timeout

  sock.ev.on('connection.update', async (update) => {
    const { connection, lastDisconnect, qr } = update;
    
    if (connection) {
      console.log(`Connection update for session ${sessionId}: ${connection}`);
      io.emit('connection_status', { sessionId, status: connection });
    }

    if (qr) {
      qrCache[sessionId] = qr;
      // Multiple times emit karo taake frontend zaroor receive kare
      io.emit('qr', { sessionId, qr });
      setTimeout(() => io.emit('qr', { sessionId, qr }), 1000);
      setTimeout(() => io.emit('qr', { sessionId, qr }), 3000);
    }

    if (connection === 'close') {
      delete qrCache[sessionId];
      const statusCode = (lastDisconnect?.error as Boom)?.output?.statusCode;
      
      // Check current status in DB
      const session = await db.prepare('SELECT status FROM whatsapp_sessions WHERE id = ?').get(sessionId) as any;
      
      // Reconnect karo agar: connected ya connecting tha, aur logout nahi tha
      const shouldReconnect = session 
        && (session.status === 'connected' || session.status === 'connecting')
        && statusCode !== DisconnectReason.loggedOut
        && statusCode !== 401; // 401 = logged out
      
      console.log(`Connection closed for session ${sessionId}. Status: ${statusCode}. DB Status: ${session?.status}. Reconnecting: ${shouldReconnect}`);
      
      if (shouldReconnect) {
        // Limit reconnection attempts to avoid infinite loops
        reconnectAttempts[sessionId] = (reconnectAttempts[sessionId] || 0) + 1;
        if (reconnectAttempts[sessionId] > 15) {
          console.log(`Max reconnection attempts reached for session ${sessionId}`);
          await db.prepare('UPDATE whatsapp_sessions SET status = ? WHERE id = ?').run('disconnected', sessionId);
          io.emit('connection_status', { sessionId, status: 'disconnected' });
          delete sessions[sessionId];
          delete reconnectAttempts[sessionId];
          return;
        }

        // Add a small delay for stream errors (like 515) to avoid rapid reconnection loops
        const delay = statusCode === 515 ? 5000 : 2000;
        setTimeout(() => connectToWhatsApp(sessionId, io), delay);
      } else {
        // Not reconnecting — update status to disconnected if it wasn't already
        if (session && session.status !== 'disconnected') {
          await db.prepare('UPDATE whatsapp_sessions SET status = ? WHERE id = ?').run('disconnected', sessionId);
          io.emit('connection_status', { sessionId, status: 'disconnected' });
        }

        // If logged out, clean up session directory
        if (statusCode === DisconnectReason.loggedOut) {
          if (fs.existsSync(sessionDir)) {
            fs.rmSync(sessionDir, { recursive: true, force: true });
          }
          await db.prepare('UPDATE whatsapp_sessions SET number = NULL WHERE id = ?').run(sessionId);
          io.emit('session_disconnected', { sessionId });
        }

        delete sessions[sessionId];
        delete reconnectAttempts[sessionId];
      }
    } else if (connection === 'open') {
      console.log(`Opened connection for session ${sessionId}`);
      // Clear any connecting timeout if we had one (though we'll just let it check and see it's 'connected')
      delete qrCache[sessionId];
      delete reconnectAttempts[sessionId];
      const rawId = sock.user?.id || '';
      const number = rawId.split(':')[0].split('@')[0];
      const profileName = sock.user?.name || null;
      
      console.log(`Session ${sessionId} connected: number=${number}, name=${profileName}`);
      
      // Handle UNIQUE constraint: Clear this number from any other session first
      await db.prepare('UPDATE whatsapp_sessions SET number = NULL WHERE number = ? AND id != ?').run(number, sessionId);
      
      // Save real number — profile_name column safely update karo
      try {
        await db.prepare('UPDATE whatsapp_sessions SET status = ?, number = ?, profile_name = ? WHERE id = ?').run('connected', number, profileName, sessionId);
      } catch (e) {
        // profile_name column nahi hogi purani DB mein — without it save karo
        await db.prepare('UPDATE whatsapp_sessions SET status = ?, number = ? WHERE id = ?').run('connected', number, sessionId);
      }
      io.emit('connection_status', { sessionId, status: 'connected', number, profileName });
      
      // Check for unreplied messages on connection
      setTimeout(() => checkUnrepliedMessages(sessionId, sock, io), 5000);
    }
  });

  sock.ev.on('creds.update', saveCreds);

  sock.ev.on('messaging-history.set', async ({ chats, contacts, messages, isLatest }) => {
    console.log(`Syncing history for session ${sessionId}: ${chats.length} chats, ${contacts.length} contacts, ${messages.length} messages`);
    
    let sessionName = 'WhatsApp';
    try {
      const session = await db.prepare('SELECT name FROM whatsapp_sessions WHERE id = ?').get(sessionId) as any;
      if (session?.name) sessionName = session.name;
    } catch (e) {}

    io.emit('sync_status', { sessionId, sessionName, status: 'syncing', progress: 0, message: 'Syncing contacts...' });
    
    try {
      // Sync contacts in a single transaction for speed
      await db.exec('BEGIN TRANSACTION');
      const insertContact = await db.prepare('INSERT OR REPLACE INTO contacts (session_id, jid, name, number) VALUES (?, ?, ?, ?)');
      for (const contact of contacts) {
        const number = contact.id.split('@')[0];
        let name = contact.name || contact.verifiedName || contact.notify || null;
        
        if (!name) {
          const globalName = await db.prepare('SELECT name FROM contacts WHERE jid = ? AND name IS NOT NULL LIMIT 1').get(contact.id) as any;
          if (globalName) name = globalName.name;
        }
        
        await insertContact.run(sessionId, contact.id, name, number);
        // Update conversation contact_name if it's missing
        if (name) {
          await db.prepare('UPDATE conversations SET contact_name = ? WHERE session_id = ? AND contact_number = ? AND (contact_name IS NULL OR contact_name = ?)').run(name, sessionId, contact.id, number);
        }
      }
      await db.exec('COMMIT');

      // Sync chats (conversations)
      io.emit('sync_status', { sessionId, sessionName, status: 'syncing', progress: 5, message: 'Syncing chats...' });
      await db.exec('BEGIN TRANSACTION');
      const insertConv = await db.prepare('INSERT OR IGNORE INTO conversations (session_id, contact_number, contact_name, last_message_at) VALUES (?, ?, ?, ?)');
      for (const chat of chats) {
        if (chat.id === 'status@broadcast') continue;
        await insertConv.run(sessionId, chat.id, chat.name || null, new Date().toISOString());
      }
      await db.exec('COMMIT');

      // Sync messages/conversations (REAL-TIME FOCUS: Only sync very recent messages from history)
      io.emit('sync_status', { sessionId, sessionName, status: 'syncing', progress: 10, message: 'Syncing recent messages...' });
      
      const now = Math.floor(Date.now() / 1000);
      const oneHourAgo = now - (60 * 60); // Only last 1 hour of history
      const recentMessages = messages.filter(m => Number(m.messageTimestamp) > oneHourAgo);

      let processed = 0;
      const total = recentMessages.length;
      
      if (total > 0) {
        const chunkSize = 50;
        for (let i = 0; i < recentMessages.length; i += chunkSize) {
          const chunk = recentMessages.slice(i, i + chunkSize);
          await db.exec('BEGIN TRANSACTION');
          for (const msg of chunk) {
            if (msg.key.remoteJid === 'status@broadcast') continue;
            if (msg.message) {
              await saveMessage(sessionId, sock, msg, io, false);
            }
            processed++;
          }
          await db.exec('COMMIT');
          
          const progress = Math.min(10 + Math.round((processed / total) * 90), 99);
          io.emit('sync_status', { sessionId, sessionName, status: 'syncing', progress, message: `Syncing messages (${processed}/${total})...` });
        }
      }
      
      io.emit('sync_status', { sessionId, sessionName, status: 'completed', progress: 100 });
    } catch (error) {
      console.error(`Error during history sync for session ${sessionId}:`, error);
      await db.exec('ROLLBACK').catch(() => {});
      io.emit('sync_status', { sessionId, status: 'error', message: 'Sync failed. Please try again.' });
    }
  });

  sock.ev.on('chats.upsert', async (chats) => {
    const insertConv = await db.prepare('INSERT OR IGNORE INTO conversations (session_id, contact_number, contact_name, last_message_at) VALUES (?, ?, ?, ?)');
    for (const chat of chats) {
      // Skip status updates
      if (chat.id === 'status@broadcast') continue;
      
      const number = chat.id.split('@')[0];
      await insertConv.run(sessionId, chat.id, chat.name || null, new Date().toISOString());
    }
  });

  sock.ev.on('chats.update', async (updates) => {
    const updateConv = await db.prepare('UPDATE conversations SET contact_name = COALESCE(?, contact_name) WHERE session_id = ? AND contact_number = ?');
    for (const update of updates) {
      if (update.name) {
        await updateConv.run(update.name, sessionId, update.id);
      }
    }
  });

  sock.ev.on('contacts.upsert', async (contacts) => {
    const insertContact = await db.prepare('INSERT OR REPLACE INTO contacts (session_id, jid, name, number) VALUES (?, ?, ?, ?)');
    for (const contact of contacts) {
      const number = contact.id.split('@')[0];
      let name = contact.name || contact.verifiedName || (contact as any).notify || null;
      
      if (!name) {
        const globalName = await db.prepare('SELECT name FROM contacts WHERE jid = ? AND name IS NOT NULL LIMIT 1').get(contact.id) as any;
        if (globalName) name = globalName.name;
      }

      await insertContact.run(sessionId, contact.id, name, number);
      
      if (name) {
        // Update by both full JID and number-only to catch all formats
        await db.prepare('UPDATE conversations SET contact_name = ? WHERE session_id = ? AND (contact_number = ? OR contact_number = ?)').run(name, sessionId, contact.id, number);
      }

      // Fetch profile picture
      if (!contact.id.endsWith('@g.us')) {
        try {
          const ppUrl = await sock.profilePictureUrl(contact.id, 'image').catch(() => null);
          if (ppUrl) {
            await db.prepare('UPDATE contacts SET profile_pic = ? WHERE session_id = ? AND jid = ?').run(ppUrl, sessionId, contact.id);
            await db.prepare('UPDATE conversations SET profile_pic = ? WHERE session_id = ? AND contact_number = ?').run(ppUrl, sessionId, contact.id);
          }
        } catch (e) {}
      }
    }
  });

  sock.ev.on('messages.upsert', async (m) => {
    if (m.type === 'notify') {
      for (const msg of m.messages) {
        if (msg.key.remoteJid === 'status@broadcast') continue;

        // Save pushName to contacts immediately
        if (msg.pushName && msg.key.remoteJid) {
          const jid = msg.key.remoteJid;
          const number = jid.split('@')[0];
          await db.prepare('INSERT OR REPLACE INTO contacts (session_id, jid, name, number) VALUES (?, ?, ?, ?)')
            .run(sessionId, jid, msg.pushName, number);
          await db.prepare('UPDATE conversations SET contact_name = ? WHERE session_id = ? AND contact_number = ? AND (contact_name IS NULL OR contact_name = ?)')
            .run(msg.pushName, sessionId, jid, number);
        }

        if (!msg.key.fromMe && msg.message) {
          await handleIncomingMessage(sessionId, sock, msg, io);
        } else if (msg.key.fromMe && msg.message) {
          await saveMessage(sessionId, sock, msg, io, true);
        }
      }
    }
  });

  return sock;
}

export function getQrCode(sessionId: string) {
  return qrCache[sessionId];
}

async function saveMessage(sessionId: string, sock: WASocket, msg: proto.IWebMessageInfo, io: SocketIOServer, shouldEmit: boolean = true) {
  const from = msg.key.remoteJid;
  if (!from || from === 'status@broadcast') return null;

  let text = msg.message?.conversation || msg.message?.extendedTextMessage?.text || '';
  let type = 'text';

  if (msg.message?.imageMessage) {
    type = 'image';
    try {
      let buffer: Buffer | null = null;
      let retries = 3;
      while (retries > 0 && !buffer) {
        try {
          buffer = await downloadMediaMessage(msg as any, 'buffer', {}, { logger, reuploadRequest: sock.updateMediaMessage }) as Buffer;
        } catch (e) {
          retries--;
          if (retries === 0) throw e;
          await new Promise(resolve => setTimeout(resolve, 2000));
        }
      }
      const filename = `media_${Date.now()}.jpg`;
      const filePath = path.join(uploadsDir, filename);
      fs.writeFileSync(filePath, buffer!);
      text = `/uploads/${filename}`;
    } catch (e: any) {
      if (e.message?.includes('Forbidden') || e.message?.includes('fetch stream')) {
        console.warn(`Could not download image (likely expired): ${e.message}`);
      } else {
        console.error('Failed to download image:', e);
      }
      text = '[Image Message]';
    }
  } else if (msg.message?.videoMessage) {
    type = 'video';
    try {
      let buffer: Buffer | null = null;
      let retries = 3;
      while (retries > 0 && !buffer) {
        try {
          buffer = await downloadMediaMessage(msg as any, 'buffer', {}, { logger, reuploadRequest: sock.updateMediaMessage }) as Buffer;
        } catch (e) {
          retries--;
          if (retries === 0) throw e;
          await new Promise(resolve => setTimeout(resolve, 2000));
        }
      }
      const filename = `media_${Date.now()}.mp4`;
      const filePath = path.join(uploadsDir, filename);
      fs.writeFileSync(filePath, buffer!);
      text = `/uploads/${filename}`;
    } catch (e: any) {
      if (e.message?.includes('Forbidden') || e.message?.includes('fetch stream')) {
        console.warn(`Could not download video (likely expired): ${e.message}`);
      } else {
        console.error('Failed to download video:', e);
      }
      text = '[Video Message]';
    }
  } else if (msg.message?.audioMessage) {
    type = 'audio';
    try {
      let buffer: Buffer | null = null;
      let retries = 3;
      while (retries > 0 && !buffer) {
        try {
          buffer = await downloadMediaMessage(msg as any, 'buffer', {}, { logger, reuploadRequest: sock.updateMediaMessage }) as Buffer;
        } catch (e) {
          retries--;
          if (retries === 0) throw e;
          await new Promise(resolve => setTimeout(resolve, 2000));
        }
      }
      const filename = `media_${Date.now()}.mp3`;
      const filePath = path.join(uploadsDir, filename);
      fs.writeFileSync(filePath, buffer!);
      text = `/uploads/${filename}`;
      
      // Auto-transcribe audio
      try {
        const session = await db.prepare('SELECT user_id FROM whatsapp_sessions WHERE id = ?').get(sessionId) as any;
        if (session) {
          const base64Audio = buffer!.toString('base64');
          const transcription = await callAI(session.user_id, "Transcribe this audio message. Return only the transcription text. If it's empty or noise, return an empty string.", "", {
            inlineData: {
              mimeType: "audio/mpeg",
              data: base64Audio
            }
          });
          if (transcription) {
            (msg as any).transcription = transcription;
          }
        }
      } catch (err) {
        console.error('Auto-transcription failed:', err);
      }
    } catch (e: any) {
      if (e.message?.includes('Forbidden') || e.message?.includes('fetch stream')) {
        console.warn(`Could not download audio (likely expired): ${e.message}`);
      } else {
        console.error('Failed to download audio:', e);
      }
      text = '[Audio Message]';
    }
  } else if (msg.message?.documentMessage) {
    type = 'document';
    try {
      let buffer: Buffer | null = null;
      let retries = 3;
      while (retries > 0 && !buffer) {
        try {
          buffer = await downloadMediaMessage(msg as any, 'buffer', {}, { logger, reuploadRequest: sock.updateMediaMessage }) as Buffer;
        } catch (e) {
          retries--;
          if (retries === 0) throw e;
          await new Promise(resolve => setTimeout(resolve, 2000));
        }
      }
      const filename = msg.message.documentMessage.fileName || `doc_${Date.now()}`;
      const filePath = path.join(uploadsDir, filename);
      fs.writeFileSync(filePath, buffer!);
      text = `/uploads/${filename}`;
    } catch (e: any) {
      if (e.message?.includes('Forbidden') || e.message?.includes('fetch stream')) {
        console.warn(`Could not download document (likely expired): ${e.message}`);
      } else {
        console.error('Failed to download document:', e);
      }
      text = `[Document: ${msg.message.documentMessage.fileName}]`;
    }
  }

  if (!text) return null;

  // Clean number — strip WhatsApp suffix
  const cleanFrom = from.replace('@s.whatsapp.net', '').replace('@g.us', '');

  // Get or create conversation
  let conversation = await db.prepare('SELECT * FROM conversations WHERE session_id = ? AND contact_number = ?').get(sessionId, from) as any;
  
  // FORCEFUL GLOBAL RETRIEVAL: Check if this number was saved or named in ANY other session or contact list
  const globalContact = await db.prepare(`
    SELECT 
      (SELECT name FROM contacts WHERE jid = ? AND name IS NOT NULL LIMIT 1) as contact_name_from_contacts,
      (SELECT contact_name FROM conversations WHERE contact_number = ? AND contact_name IS NOT NULL LIMIT 1) as contact_name_from_convs,
      (SELECT MAX(is_saved) FROM conversations WHERE contact_number = ?) as is_saved,
      (SELECT MAX(is_ordered) FROM conversations WHERE contact_number = ?) as is_ordered,
      (SELECT MAX(is_rated) FROM conversations WHERE contact_number = ?) as is_rated,
      (SELECT MAX(is_audited) FROM conversations WHERE contact_number = ?) as is_audited,
      (SELECT MIN(is_autopilot) FROM conversations WHERE contact_number = ?) as is_autopilot
  `).get(from, from, from, from, from, from, from) as any;

  const contactName = globalContact?.contact_name_from_contacts || globalContact?.contact_name_from_convs || msg.pushName || null;

  if (!conversation) {
    const result = await db.prepare(`
      INSERT INTO conversations (
        session_id, contact_number, unread_count, contact_name, 
        is_saved, is_ordered, is_rated, is_audited, is_autopilot
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      sessionId, 
      from, 
      msg.key.fromMe ? 0 : 1,
      contactName,
      globalContact?.is_saved || 0,
      globalContact?.is_ordered || 0,
      globalContact?.is_rated || 0,
      globalContact?.is_audited || 0,
      globalContact?.is_autopilot !== undefined && globalContact.is_autopilot !== null ? globalContact.is_autopilot : 1
    );
    conversation = { id: result.lastInsertRowid };
  } else {
    // Update existing conversation with global data if it's missing or outdated
    if (!conversation.contact_name && contactName) {
      await db.prepare('UPDATE conversations SET contact_name = ? WHERE id = ?').run(contactName, conversation.id);
    }
    // Forcefully sync flags from global state if they are more "advanced"
    if (globalContact) {
      await db.prepare(`
        UPDATE conversations SET 
          is_saved = MAX(is_saved, ?),
          is_ordered = MAX(is_ordered, ?),
          is_rated = MAX(is_rated, ?),
          is_audited = MAX(is_audited, ?)
        WHERE id = ?
      `).run(
        globalContact.is_saved || 0,
        globalContact.is_ordered || 0,
        globalContact.is_rated || 0,
        globalContact.is_audited || 0,
        conversation.id
      );
    }
    
    if (!msg.key.fromMe && shouldEmit) {
      await db.prepare('UPDATE conversations SET unread_count = unread_count + 1 WHERE id = ?').run(conversation.id);
    }
  }

  // Always update contact name from pushName (real WhatsApp display name)
  if (!msg.key.fromMe && msg.pushName) {
    await db.prepare('UPDATE conversations SET contact_name = ? WHERE id = ?').run(msg.pushName, conversation.id);
    // Also update contacts table
    await db.prepare('INSERT OR REPLACE INTO contacts (session_id, jid, name, number) VALUES (?, ?, ?, ?)').run(sessionId, from, msg.pushName, from.split('@')[0]);
  } else if (conversation && !conversation.contact_name) {
    // Try contacts table
    const contact = await db.prepare('SELECT name FROM contacts WHERE (session_id = ? AND jid = ?) OR (jid = ?) ORDER BY name DESC LIMIT 1').get(sessionId, from, from) as any;
    if (contact?.name) {
      await db.prepare('UPDATE conversations SET contact_name = ? WHERE id = ?').run(contact.name, conversation.id);
    }
  }

  // Check if message already exists to avoid duplicates
  const timestamp = new Date(Number(msg.messageTimestamp) * 1000).toISOString();
  const existing = await db.prepare('SELECT * FROM messages WHERE conversation_id = ? AND content = ? AND created_at = ?').get(
    conversation.id, 
    text, 
    timestamp
  );

  if (!existing) {
    const msgResult = await db.prepare('INSERT INTO messages (conversation_id, sender, content, type, created_at, transcription) VALUES (?, ?, ?, ?, ?, ?)')
      .run(conversation.id, msg.key.fromMe ? 'agent' : 'contact', text, type, timestamp, (msg as any).transcription || null);
    const messageId = msgResult.lastInsertRowid;
    
    await db.prepare('UPDATE conversations SET last_message_at = ?, last_message = ? WHERE id = ?')
      .run(timestamp, text || '', conversation.id);

    // Emit event for real-time updates
    if (shouldEmit) {
      const updatedConv = await db.prepare('SELECT * FROM conversations WHERE id = ?').get(conversation.id) as any;
      io.emit('new_message', {
        id: messageId,
        conversation_id: conversation.id,
        session_id: sessionId,
        sender: msg.key.fromMe ? 'agent' : 'contact',
        content: text,
        type,
        created_at: timestamp,
        transcription: (msg as any).transcription || null,
        unread_count: updatedConv.unread_count,
        contact_name: updatedConv.contact_name,
        contact_number: (updatedConv.contact_number || '').replace('@s.whatsapp.net','').replace('@g.us',''),
        is_saved: updatedConv.is_saved,
        is_ordered: updatedConv.is_ordered,
        is_rated: updatedConv.is_rated,
        is_audited: updatedConv.is_audited,
        is_autopilot: updatedConv.is_autopilot
      });
    }
    return { id: messageId, conversationId: conversation.id, text, type, timestamp };
  }
  return null;
}

async function handleIncomingMessage(sessionId: string, sock: WASocket, msg: proto.IWebMessageInfo, io: SocketIOServer) {
  const from = msg.key.remoteJid;
  if (!from) return;

  console.log(`Received message from ${from} in session ${sessionId}`);
  
  // Save the incoming message
  const savedMsg = await saveMessage(sessionId, sock, msg, io, true);
  if (!savedMsg) return;

  // --- Rule-based Logic ---
  try {
    const session = await db.prepare('SELECT agent_id FROM whatsapp_sessions WHERE id = ?').get(sessionId) as any;
    if (session && session.agent_id) {
      const rules = await db.prepare('SELECT * FROM agent_rules WHERE agent_id = ? AND is_active = 1').all(session.agent_id) as any[];
      
      for (const rule of rules) {
        let triggered = false;
        if (rule.trigger_type === 'url_shared') {
          const urlRegex = /(https?:\/\/[^\s]+)/g;
          triggered = urlRegex.test(savedMsg.text);
        } else if (rule.trigger_type === 'keyword_match') {
          triggered = savedMsg.text.toLowerCase().includes(rule.trigger_value.toLowerCase());
        } else if (rule.trigger_type === 'sender_match') {
          triggered = from === rule.trigger_value;
        }

        if (triggered) {
          console.log(`Rule triggered: ${rule.description}`);
          if (rule.action_type === 'forward_to_group') {
            const targetJid = rule.action_value;
            await sock.sendMessage(targetJid, { text: `[Forwarded by Agent]\nFrom: ${from}\n\n${savedMsg.text}` });
          } else if (rule.action_type === 'reply_with_template') {
            await sock.sendMessage(from, { text: rule.action_value });
          }
        }
      }
    }
  } catch (err) {
    console.error('Error processing rules:', err);
  }

  // Check if autopilot is enabled for this conversation
  const conversation = await db.prepare('SELECT * FROM conversations WHERE id = ?').get(savedMsg.conversationId) as any;
  
  // Reset followup_count on incoming message
  await db.prepare("UPDATE leads SET followup_count = 0 WHERE conversation_id = ?").run(savedMsg.conversationId);

  // Fetch session info for user_id
  const sessionInfo = await db.prepare('SELECT user_id FROM whatsapp_sessions WHERE id = ?').get(sessionId) as any;
  const userId = sessionInfo?.user_id;

  if (userId) {
    await db.prepare('INSERT INTO activities (user_id, type, description) VALUES (?, ?, ?)')
      .run(userId, 'message_received', `New message received from ${conversation.contact_name || conversation.contact_number}.`);
  }

  // Check for "stop" phrases
  const stopPhrases = [
    "i will tell you later",
    "i will contact you by myself",
    "i am being messaged repeatedly",
    "stop messaging me",
    "don't contact me",
    "please stop",
    "unsubscribe",
    "stop",
    "not interested",
    "no thanks",
    "leave me alone"
  ];
  const lowerMsg = savedMsg.text.toLowerCase().trim();
  const shouldStop = stopPhrases.some(phrase => lowerMsg === phrase || lowerMsg.includes(phrase));

  if (shouldStop) {
    console.log(`Stop phrase detected from ${from}. Disabling autopilot and marking as Not Interested.`);
    await db.prepare("UPDATE conversations SET is_autopilot = 0 WHERE id = ?").run(savedMsg.conversationId);
    await db.prepare("UPDATE leads SET status = 'Not Interested' WHERE conversation_id = ?").run(savedMsg.conversationId);
    
    // Add to blacklist if user_id is available
    if (userId) {
      await db.prepare('INSERT OR REPLACE INTO blacklist (user_id, number, reason) VALUES (?, ?, ?)').run(userId, from.split('@')[0], 'User requested to stop');
    }
    return; // Stop processing further
  }

  // Automation Rules Check
  let ruleTriggered = false;
  if (userId) {
    const campaignConfig = await db.prepare('SELECT * FROM campaign_configs WHERE user_id = ?').get(userId) as any;
    if (campaignConfig) {
      const rules = campaignConfig.automation_rules ? JSON.parse(campaignConfig.automation_rules) : {};
      const lead = await db.prepare('SELECT status FROM leads WHERE conversation_id = ?').get(savedMsg.conversationId) as any;
      
      if (lead) {
        const stageKey = lead.status.toLowerCase().replace(' ', '_');
        const rule = rules[stageKey];
        
        if (rule && rule.enabled !== false && rule.template) {
          // Special logic for 'contacted' stage trigger
          let shouldTrigger = true;
          if (lead.status === 'Contacted' && rule.trigger) {
            shouldTrigger = rule.trigger.includes('User Replied');
          }

          if (shouldTrigger) {
            const template = rule.template.replace('{Name}', conversation.contact_name || 'there');
            
            // Check if this exact template was sent recently to this conversation
            const lastAgentMsg = await db.prepare("SELECT content FROM messages WHERE conversation_id = ? AND sender = 'agent' ORDER BY created_at DESC LIMIT 1").get(savedMsg.conversationId) as any;
            
            if (lastAgentMsg && lastAgentMsg.content === template) {
              console.log(`Automation rule duplicate detected for stage: ${lead.status}. Skipping.`);
              ruleTriggered = true; // Still mark as triggered to prevent AI from also replying
            } else {
              await sock.sendMessage(from, { text: template });
              
              const timestamp = new Date().toISOString();
              await db.prepare('INSERT INTO messages (conversation_id, sender, content, type, created_at) VALUES (?, ?, ?, ?, ?)')
                .run(savedMsg.conversationId, 'agent', template, 'text', timestamp);
              
              io.emit('new_message', {
                conversation_id: savedMsg.conversationId,
                sender: 'agent',
                content: template,
                type: 'text',
                created_at: timestamp
              });
              
              console.log(`Automation rule triggered for stage: ${lead.status}`);
              ruleTriggered = true;
            }
          }
        }
      }
    }
  }
  
  // Fetch global autopilot setting
  const user = await db.prepare('SELECT is_global_autopilot FROM users WHERE id = ?').get(userId) as any;
  const isGlobalAutopilot = user ? user.is_global_autopilot : 1;

  if (!ruleTriggered && isGlobalAutopilot && conversation && conversation.is_autopilot) {
    await processAIResponse(sessionId, sock, conversation, savedMsg.text, io);
  }

  // Extract lead info in the background
  const session = await db.prepare('SELECT user_id FROM whatsapp_sessions WHERE id = ?').get(sessionId) as any;
  if (session) {
    const lastMessages = await db.prepare('SELECT sender, content FROM messages WHERE conversation_id = ? ORDER BY created_at DESC LIMIT 10').all(savedMsg.conversationId) as any[];
    extractLeadInfo(session.user_id, savedMsg.conversationId, lastMessages.reverse()).then(leadData => {
      if (leadData) {
        io.emit('lead_update', { conversationId: savedMsg.conversationId, ...leadData });
      }
    }).catch(err => console.error('Lead extraction background task failed:', err));
  }
}

async function checkUnrepliedMessages(sessionId: string, sock: WASocket, io: SocketIOServer) {
  console.log(`Checking for unreplied messages in session ${sessionId}`);
  try {
    // Find conversations where the last message is from the contact and autopilot is on
    const user = await db.prepare('SELECT is_global_autopilot FROM users WHERE id = (SELECT user_id FROM whatsapp_sessions WHERE id = ?)').get(sessionId) as any;
    const isGlobalAutopilot = user ? user.is_global_autopilot : 1;

    if (!isGlobalAutopilot) {
      console.log(`Global autopilot is OFF for session ${sessionId}, skipping unreplied check.`);
      return;
    }

    const unrepliedConvs = await db.prepare(`
      SELECT c.* 
      FROM conversations c
      JOIN messages m ON m.conversation_id = c.id
      WHERE c.session_id = ? 
        AND c.is_autopilot = 1
        AND m.id = (SELECT id FROM messages WHERE conversation_id = c.id ORDER BY created_at DESC LIMIT 1)
        AND m.sender = 'contact'
    `).all(sessionId) as any[];

    console.log(`Found ${unrepliedConvs.length} unreplied conversations for session ${sessionId}`);

    for (const conv of unrepliedConvs) {
      const lastMessage = await db.prepare('SELECT content FROM messages WHERE conversation_id = ? ORDER BY created_at DESC LIMIT 1').get(conv.id) as any;
      if (lastMessage) {
        await processAIResponse(sessionId, sock, conv, lastMessage.content, io);
        // Small delay between replies
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
    }
  } catch (error) {
    console.error(`Error checking unreplied messages for session ${sessionId}:`, error);
  }
}

// ============================================================
// GENERIC SERVICE DETECTION ENGINE
// ============================================================
function detectService(message: string, services: any[]): any | null {
  if (!services || services.length === 0) return null;
  const lower = message.toLowerCase();
  for (const svc of services) {
    if (!svc.keywords) continue;
    for (const kw of svc.keywords) {
      if (lower.includes(kw.toLowerCase())) return svc;
    }
  }
  return null;
}

function buildConfigContext(config: any, agent: any): string {
  if (!config || !config.services || config.services.length === 0) return '';
  
  const serviceLines = config.services.map((s: any) => {
    let line = `• ${s.name}`;
    if (s.keywords?.length) line += ` (keywords: ${s.keywords.join(', ')})`;
    if (s.pricing === 'allowed' && s.price_details) line += ` — Price: ${s.price_details}`;
    if (s.pricing === 'not_allowed') line += ` — Pricing not shared until analysis`;
    if (s.ask_for) line += ` — Ask client for: ${s.ask_for}`;
    return line;
  }).join('\n');

  return `
BUSINESS SERVICES:
${serviceLines}

PRICING RULE: ${config.no_pricing_message || 'Share pricing only if allowed for that service.'}
FALLBACK: ${config.fallback_message || 'Ask for clarification if confused.'}`;
}


async function processAIResponse(sessionId: string, sock: WASocket, conversation: any, userMessage: string, io: SocketIOServer) {
  try {
    const session = await db.prepare('SELECT user_id, agent_id FROM whatsapp_sessions WHERE id = ?').get(sessionId) as any;
    if (!session || !session.user_id) return;

    // Token Check
    const user = await db.prepare('SELECT role, tokens, token_limit FROM users WHERE id = ?').get(session.user_id) as any;
    if (user && user.role === 'admin') {
      if (user.tokens <= 0) {
        console.log(`Admin ${session.user_id} has no tokens left. Stopping agent.`);
        await db.prepare('UPDATE conversations SET is_autopilot = 0 WHERE id = ?').run(conversation.id);
        io.emit('token_limit_reached', { userId: session.user_id });
        io.emit('new_message', {
          conversation_id: conversation.id,
          sender: 'system',
          content: 'Agent stopped: No tokens remaining. Please contact WhatsApp Auto Team for top-up.',
          type: 'system',
          created_at: new Date().toISOString()
        });
        return;
      }
    }

    const agent = await db.prepare('SELECT * FROM agents WHERE id = ?').get(session.agent_id) as any;
    if (!agent) return;

    // 1. Cooldown & New Day Detection
    const now = new Date();
    const lastGreetingAt = conversation.last_greeting_at ? new Date(conversation.last_greeting_at) : null;
    const isNewDay = !lastGreetingAt || lastGreetingAt.toDateString() !== now.toDateString();

    if (conversation.last_agent_message_at) {
      const lastAgentMsg = new Date(conversation.last_agent_message_at);
      const diffHours = (now.getTime() - lastAgentMsg.getTime()) / (1000 * 60 * 60);
    }

    // 2. Acknowledgment Detection (Stop Logic)
    const ackPhrases = ["ok", "thanks", "thank you", "got it", "noted", "i will wait", "fine", "sure", "alright", "theek hai", "theek h", "acha", "accha", "samajh gaya", "samajh gya", "ji", "ji shukriya", "haan", "han", "hn", "okay", "oky", "ok thanks", "shukriya", "shukria", "bohat shukriya", "👍", "✅"];
    const isAck = ackPhrases.includes(userMessage.toLowerCase().trim());

    // 3. Existing Client Detection
    const contactName = conversation.contact_name || '';
    const isExistingClient = contactName.includes('Client') || contactName.includes('CUS');
    
    // 4. Check if 5+ hours since last message
    const lastContactMsg = await db.prepare(`
      SELECT created_at FROM messages 
      WHERE conversation_id = ? AND sender = 'contact' 
      ORDER BY created_at DESC LIMIT 1
    `).get(conversation.id) as any;
    
    const hoursSinceLastMsg = lastContactMsg 
      ? (now.getTime() - new Date(lastContactMsg.created_at).getTime()) / (1000 * 60 * 60)
      : 0;
    const isReturningAfterLongTime = hoursSinceLastMsg >= 5;

    // Is the user asking a question? (Prioritize answering over greeting)
    const userIsAsking = userMessage.includes('?') || 
                        userMessage.toLowerCase().includes('how') || 
                        userMessage.toLowerCase().includes('what') || 
                        userMessage.toLowerCase().includes('price') ||
                        userMessage.toLowerCase().includes('rate');

    // Fetch last 7 messages for full context
    const lastMessages = await db.prepare(`
      SELECT sender, content, created_at 
      FROM messages 
      WHERE conversation_id = ? 
      ORDER BY created_at DESC 
      LIMIT 15
    `).all(conversation.id) as any[];
    
    const conversationHistory = lastMessages.reverse();

    // Total messages in this conversation
    const totalMsgCount = await db.prepare(
      'SELECT COUNT(*) as cnt FROM messages WHERE conversation_id = ?'
    ).get(conversation.id) as any;
    const isFirstEverMessage = (totalMsgCount?.cnt || 0) <= 1;

    // Agent ke sent messages (anti-repetition)
    const recentAgentMessages = conversationHistory.filter(m => m.sender === 'agent').slice(-5);
    const alreadyGreeted = recentAgentMessages.length > 0;

    // Check if agent already greeted today specifically
    const todayGreetCheck = await db.prepare(`
      SELECT content FROM messages 
      WHERE conversation_id = ? AND sender = 'agent' 
      AND date(created_at) = date('now')
      ORDER BY created_at ASC LIMIT 1
    `).get(conversation.id) as any;
    const greetedToday = !!todayGreetCheck;

    // Last agent message — context ke liye
    const lastAgentMsg = recentAgentMessages[recentAgentMessages.length - 1];
    
    // Kya last agent message mein question tha?
    const lastAgentAskedQuestion = lastAgentMsg && (
      lastAgentMsg.content.includes('?') || 
      lastAgentMsg.content.includes('کون') ||
      lastAgentMsg.content.includes('کیا') ||
      lastAgentMsg.content.includes('which') ||
      lastAgentMsg.content.includes('what')
    );

    // 7. Lead Stage & Context Lock
    const lead = await db.prepare('SELECT status, website, service_interest, objections FROM leads WHERE conversation_id = ?').get(conversation.id) as any;
    const leadStatus = lead ? lead.status : 'New';
    const hasWebsite = lead && lead.website;
    const serviceInterest = lead ? lead.service_interest : null;
    const objections = lead ? lead.objections : null;
    const intent = conversation.intent;
    const engagementScore = conversation.engagement_score || 0;
    
    let stageInstruction = "";
    if (isExistingClient || leadStatus === 'Final Customer') {
      stageInstruction = "The user is an EXISTING CLIENT. Focus on providing supportive and professional support. Maintain a helpful and consistent tone. Do NOT ask for website or qualification questions.";
    } else if (hasWebsite) {
      stageInstruction = "CONTEXT LOCK: We already have the user's website. NEVER ask for it again. The lead is now in processing/audit stage. Inform them we are reviewing their site.";
    } else {
      switch (leadStatus) {
        case 'New':
          stageInstruction = "The user is a NEW LEAD. Be friendly and welcoming. Your goal is to start the conversation and politely ask for their website URL if they haven't provided it yet.";
          break;
        case 'Contacted':
          stageInstruction = "The user is in the CONTACTED stage. Be professional and informative. Continue the discussion, build trust, and collect more details about their needs.";
          break;
        case 'Qualified':
          stageInstruction = "The user is QUALIFIED. Be persuasive and value-driven. Focus on delivering value, mentioning a free audit, and push towards conversion.";
          break;
        case 'Not Interested':
          stageInstruction = "The user is marked as NOT INTERESTED. Be extremely brief and respectful. Do not push for sales.";
          return;
      }
    }

    // 8. Intent-Based Strategy & Loop Prevention
    const recentIntents = conversationHistory.map(m => (m as any).intent).filter(Boolean);
    const isLooping = intent && recentIntents.filter(i => i === intent).length >= 3;
    
    if (isLooping) {
      console.log(`Loop detected for intent ${intent}. Stopping automated response.`);
      return;
    }

    // 5. Intent-Based Strategy
    let intentInstruction = "";
    if (intent) {
      switch (intent) {
        case 'Inquiry':
          intentInstruction = "The user is making an inquiry. Provide clear, concise answers to their questions.";
          break;
        case 'Interest':
          intentInstruction = "The user is showing interest. Use soft persuasion and highlight the benefits of our services.";
          break;
        case 'Objection':
          intentInstruction = "The user has an objection. Address it with reassurance and value explanation. Do not be pushy.";
          break;
        case 'Confusion':
          intentInstruction = "The user seems confused. Simplify your explanation and offer to clarify any points.";
          break;
        case 'Ready-to-buy':
          intentInstruction = "The user is ready to buy! Trigger soft closing responses and guide them towards the next step.";
          break;
        case 'Support request':
          intentInstruction = "The user needs support. Be helpful and supportive.";
          break;
      }
    }

    // 6. Knowledge & Memory — load from both training files AND agent memory
    const trainingFiles = await db.prepare('SELECT original_name, category, content FROM training_files WHERE agent_id = ?').all(agent.id) as any[];
    
    // Smartly organize training data by category
    const categorizedKnowledge = trainingFiles.reduce((acc: any, f: any) => {
      const cat = f.category || 'training';
      if (!acc[cat]) acc[cat] = [];
      if (cat === 'portfolio') {
        // For portfolio, just list the name so AI knows it exists and can send it
        acc[cat].push(`PORTFOLIO_FILE: ${f.original_name}`);
      } else {
        acc[cat].push(`FILE: ${f.original_name}\nCONTENT: ${f.content}`);
      }
      return acc;
    }, {});

    const trainingData = Object.entries(categorizedKnowledge).map(([cat, contents]: [string, any]) => {
      return `[CATEGORY: ${cat.toUpperCase()}]\n${contents.join('\n---\n')}`;
    }).join('\n\n');
    
    // Load persistent agent memory (from chat training + document training)
    const agentMemories = await db.prepare(
      'SELECT topic, content, source FROM agent_memory WHERE agent_id = ? ORDER BY updated_at DESC'
    ).all(agent.id) as any[];
    const memoryData = agentMemories.length > 0
      ? agentMemories.map((m: any) => `[${m.source.toUpperCase()} MEMORY] ${m.topic}: ${m.content}`).join('\n')
      : '';

    // Load agent config (services, pricing rules)
    let agentConfig: any = null;
    let configContext = '';
    let detectedService: any = null;
    try {
      if (agent.agent_config) {
        agentConfig = JSON.parse(agent.agent_config);
        configContext = buildConfigContext(agentConfig, agent);
        detectedService = detectService(userMessage, agentConfig?.services || []);
      }
    } catch(e) {}

    // Service-specific custom reply check
    if (detectedService?.custom_reply) {
      // Send fixed reply directly
      const timestamp = new Date().toISOString();
      await sock.sendMessage(conversation.contact_number, { text: detectedService.custom_reply });
      await db.prepare('INSERT INTO messages (conversation_id, sender, content, type, created_at) VALUES (?, ?, ?, ?, ?)')
        .run(conversation.id, 'agent', detectedService.custom_reply, 'text', timestamp);
      await db.prepare('UPDATE conversations SET last_message_at = ? WHERE id = ?').run(timestamp, conversation.id);
      io.emit('new_message', { conversation_id: conversation.id, sender: 'agent', content: detectedService.custom_reply, type: 'text', created_at: timestamp });
      return;
    }

    // Is first message hai is conversation mein?
    const clientName = conversation.contact_name || 'Client';

    // 9. Dynamic Greeting Rule
    const greetingRule = greetedToday 
      ? "STRICT RULE: NO GREETINGS. Do NOT say 'Hi', 'Hello', 'Assalam-o-Alaikum', 'Hey', or use the client's name at the start. Jump DIRECTLY to answering the client's message."
      : "You may start with a brief, natural greeting (e.g., 'Hi' or 'Hello') since this is your first interaction today. Keep it professional.";

    const systemInstruction = `You are ${agent.name}, a real team member at ${agent.brand_company || 'our company'}. You are NOT a bot or AI — never say otherwise.

YOUR IDENTITY:
- Name: ${agent.name}
- Company: ${agent.brand_company || 'N/A'}
- Services: ${agent.product_service || 'N/A'}
- Goal: ${agent.objective || 'Help clients professionally'}

YOUR KNOWLEDGE — READ THIS FIRST, ALWAYS USE IT:
IMPORTANT: If you find duplicate instructions, ALWAYS prioritize the most recent or detailed one.
If a file is labeled "PORTFOLIO", it is a file you can SEND to the user. To send a portfolio file, include [SEND_FILE: filename] in your response (e.g., [SEND_FILE: My_Work.pdf]).
Interpret the file based on its name (e.g., "Najam_Portfolio.pdf" is Najam's portfolio).
If "RULES", follow them strictly. If "TRAINING", use it for general knowledge.

${memoryData || 'Use your identity info above.'}
${trainingData ? `TRAINING DOCS:\n${trainingData}` : ''}
${configContext}
${detectedService ? `DETECTED SERVICE: Client asking about "${detectedService.name}".${detectedService.ask_for ? ` Ask them for: ${detectedService.ask_for.replace('_',' ')}.` : ''}${detectedService.pricing === 'not_allowed' ? ` DO NOT share pricing — say: "${agentConfig?.no_pricing_message}"` : ''}${detectedService.pricing === 'allowed' && detectedService.price_details ? ` Pricing you can share: ${detectedService.price_details}` : ''}` : ''}

--- FULL CONVERSATION HISTORY ---
${conversationHistory.length > 0
  ? conversationHistory.map(m => `[${m.sender === 'agent' ? agent.name : clientName}]: ${m.content}`).join('\n')
  : '(First message in this conversation)'}
--- END HISTORY ---

CLIENT JUST SENT: "${userMessage}"

═══════════════════════════════
STAGE & CONTEXT:
${stageInstruction}
${intentInstruction}
${lastAgentAskedQuestion ? `Your last message asked a question. Client just answered it. Now give relevant details — do NOT repeat the question.` : ''}
${isAck ? `Client said ok/thanks — reply "You're welcome! 😊" and nothing else.` : ''}
${greetingRule}

═══════════════════════════════
BANNED PHRASES — NEVER USE THESE:
- "Hi", "Hello", "Hey", "Assalam-o-Alaikum"
- "Thanks for reaching out"
- "How can I help you today?"
- "I saw you replied" / "I noticed you replied"
- "As per your query"
- "I am here to help"
- "Hope this helps"
- "Certainly!" / "Great question!"
- "Thank you for contacting us"
- "How can I assist you?"
- "I'm [Name] from [Company]" (unless explicitly asked who you are)

═══════════════════════════════
ANTI-REPETITION — CRITICAL:
Your previous replies in this conversation:
${recentAgentMessages.length > 0 ? recentAgentMessages.map((m, i) => `[${i+1}]: "${m.content}"`).join('\n') : '(No previous replies yet)'}

Your new reply MUST differ in:
- Opening word or phrase (never start the same way twice)
- Sentence structure
- Phrasing (even if covering same topic)

═══════════════════════════════
HUMAN BEHAVIOR RULES:
- Match client language: Urdu → Urdu, English → English, mixed → mixed
- Keep reply 1-4 lines max (WhatsApp style)
- Use natural words: "Sure", "Got it", "Yeah absolutely", "Makes sense", "No worries"
- Max 1 emoji, only if tone fits naturally
- NEVER make up info not in your knowledge above
- If unsure: "Let me confirm and get back to you 🙏"
- ONE reply only — short, direct, human

═══════════════════════════════
BEFORE SENDING, CHECK:
1. Did I say something similar before? → Rephrase completely
2. Am I using a banned phrase? → Remove it
3. Does this sound like a real person? → If not, rewrite
4. Am I actually answering what they asked? → Yes`;

    let aiResponse = await callAI(session.user_id, userMessage, systemInstruction);
   
    // 10. Detect and handle file sending command [SEND_FILE: filename]
    let fileToSend = null;
    const fileMatch = aiResponse.match(/\[SEND_FILE:\s*(.*?)\]/);
    if (fileMatch) {
      const originalName = fileMatch[1].trim();
      const fileRecord = await db.prepare('SELECT filename, original_name FROM training_files WHERE agent_id = ? AND original_name = ?').get(agent.id, originalName) as any;
      if (fileRecord) {
        fileToSend = fileRecord;
        // Remove the command from the text response
        aiResponse = aiResponse.replace(fileMatch[0], '').trim();
      }
    }

    // 11. Anti-Repetition & Robotic Phrase Check
    const roboticPhrases = [
      "i saw you replied",
      "i noticed you replied",
      "how can i help you today",
      "how can i assist you today",
      "i am here to help",
      "i saw your message",
      "i saw you replied. how can i help?",
      "thanks for reaching out",
      "thank you for reaching out",
      "thank you for contacting",
      "thanks for contacting",
      "how may i help you",
      "how may i assist you",
      "hope you are doing well",
      "assalam-o-alaikum",
      "assalam o alaikum",
      "hi ",
      "hello ",
      "hey ",
      "hi!",
      "hello!",
      "hey!",
    ];

    const lowerResponse = aiResponse.toLowerCase().trim();

    // Block repeated greetings if agent already greeted today
    const isRepeatedGreeting = greetedToday && (
      lowerResponse.startsWith("hi") || 
      lowerResponse.startsWith("hello") || 
      lowerResponse.startsWith("hey") || 
      lowerResponse.startsWith("assalam")
    );

    // Block if it contains robotic meta-commentary
    const containsRoboticPhrase = isRepeatedGreeting || roboticPhrases.some(phrase => lowerResponse.includes(phrase));

    const isDuplicate = containsRoboticPhrase || recentAgentMessages.some(m => {
      const s1 = lowerResponse;
      const s2 = m.content.toLowerCase().trim();
      // Exact match or very high similarity
      return s1 === s2 || (s1.length > 10 && s2.length > 10 && (s1.includes(s2) || s2.includes(s1)));
    });

    if (isDuplicate) {
      console.log("Duplicate or robotic response detected, skipping send or retrying...");
      // Optionally we could retry with a different prompt, but for now we just skip to avoid annoying the user
      return;
    }

    // 11. Smart Response Timing (Simulate human typing)
    const typingDelay = Math.min(Math.max(aiResponse.length * 50, 2000), 8000); // 2-8 seconds based on length
    await sock.sendPresenceUpdate('composing', conversation.contact_number);
    await new Promise(resolve => setTimeout(resolve, typingDelay));
    await sock.sendPresenceUpdate('paused', conversation.contact_number);

    // Send message via WhatsApp
    if (aiResponse) {
      await sock.sendMessage(conversation.contact_number, { text: aiResponse });
    }

    // Handle file sending if detected
    if (fileToSend) {
      const filePath = path.join(process.cwd(), 'uploads', fileToSend.filename);
      if (fs.existsSync(filePath)) {
        const fileExt = path.extname(fileToSend.original_name).toLowerCase();
        const isImage = ['.jpg', '.jpeg', '.png', '.webp'].includes(fileExt);
        
        try {
          if (isImage) {
            await sock.sendMessage(conversation.contact_number, { 
              image: fs.readFileSync(filePath), 
              caption: fileToSend.original_name 
            });
          } else {
            await sock.sendMessage(conversation.contact_number, { 
              document: fs.readFileSync(filePath), 
              fileName: fileToSend.original_name,
              mimetype: 'application/octet-stream'
            });
          }
          console.log(`Sent file ${fileToSend.original_name} to ${conversation.contact_number}`);
        } catch (fileErr: any) {
          console.error(`Failed to send file ${fileToSend.original_name}:`, fileErr.message);
        }
      }
    }

    // Update Timestamps
    const timestamp = new Date().toISOString();

    if (isNewDay) {
      await db.prepare('UPDATE conversations SET last_greeting_at = ? WHERE id = ?').run(timestamp, conversation.id);
    }
    await db.prepare('UPDATE conversations SET last_agent_message_at = ? WHERE id = ?').run(timestamp, conversation.id);

    // Save to DB
    const msgResult = await db.prepare('INSERT INTO messages (conversation_id, sender, content, type, created_at) VALUES (?, ?, ?, ?, ?)')
      .run(conversation.id, 'agent', aiResponse, 'text', timestamp);
    
    await db.prepare('UPDATE conversations SET last_message_at = ? WHERE id = ?').run(timestamp, conversation.id);

    // Emit to UI
    io.emit('new_message', {
      id: msgResult.lastInsertRowid,
      conversation_id: conversation.id,
      session_id: sessionId,
      sender: 'agent',
      content: aiResponse,
      type: 'text',
      created_at: timestamp,
      unread_count: 0,
      contact_name: conversation.contact_name,
      contact_number: conversation.contact_number,
      is_saved: conversation.is_saved,
      is_ordered: conversation.is_ordered,
      is_rated: conversation.is_rated,
      is_audited: conversation.is_audited,
      is_autopilot: conversation.is_autopilot
    });

    console.log(`AI replied to ${conversation.contact_number} in session ${sessionId}`);
  } catch (error: any) {
    console.error(`Error processing AI response for session ${sessionId}:`, error.message);
  }
}

export function getSession(sessionId: string) {
  return sessions[sessionId];
}

export async function deleteSession(sessionId: string) {
  const sock = sessions[sessionId];
  if (sock) {
    try {
      await sock.logout();
    } catch (e) {
      try { sock.end(undefined); } catch (e2) {}
    }
    delete sessions[sessionId];
  }
  delete qrCache[sessionId];
  delete reconnectAttempts[sessionId];
  
  const sessionDir = path.join(process.cwd(), 'sessions', sessionId);
  if (fs.existsSync(sessionDir)) {
    try {
      fs.rmSync(sessionDir, { recursive: true, force: true });
    } catch (e) {
      console.error(`Failed to remove directory for session ${sessionId}:`, e);
    }
  }
}

export function startFollowupScheduler(io: SocketIOServer) {
  // Run every hour
  setInterval(async () => {
    console.log('Running automatic follow-up check...');
    try {
      const now = new Date();
      // Find qualified leads that need follow-up
      // 1st follow-up: 2 days after qualification
      // 2nd follow-up: 3 days after 1st
      // 3rd follow-up: 4 days after 2nd
      
      const leads = await db.prepare(`
        SELECT l.*, c.contact_number, c.session_id, c.id as conversation_id
        FROM leads l
        JOIN conversations c ON l.conversation_id = c.id
        WHERE l.status = 'Qualified' 
        AND l.auto_followup_count < 3
      `).all() as any[];

      for (const lead of leads) {
        const lastFollowup = lead.last_followup_at ? new Date(lead.last_followup_at) : new Date(lead.qualified_at);
        const diffDays = (now.getTime() - lastFollowup.getTime()) / (1000 * 60 * 60 * 24);
        
        let shouldFollowup = false;
        const nextCount = lead.auto_followup_count + 1;
        
        if (nextCount === 1 && diffDays >= 2) shouldFollowup = true;
        else if (nextCount === 2 && diffDays >= 3) shouldFollowup = true;
        else if (nextCount === 3 && diffDays >= 4) shouldFollowup = true;

        if (shouldFollowup) {
          // Check if user replied since last message
          const lastMessage = await db.prepare('SELECT sender FROM messages WHERE conversation_id = ? ORDER BY created_at DESC LIMIT 1').get(lead.conversation_id) as any;
          
          if (lastMessage && lastMessage.sender === 'agent') {
            // User hasn't replied, proceed with follow-up
            const sock = sessions[lead.session_id];
            if (sock) {
              const history = await db.prepare('SELECT sender, content FROM messages WHERE conversation_id = ? ORDER BY created_at DESC LIMIT 10').all(lead.conversation_id) as any[];
              const message = await generateFollowupMessage(lead.user_id, lead.name || 'there', history.reverse());
              
              await sock.sendMessage(lead.contact_number, { text: message });
              
              const timestamp = new Date().toISOString();
              await db.prepare('INSERT INTO messages (conversation_id, sender, content, type, created_at, is_followup) VALUES (?, ?, ?, ?, ?, ?)')
                .run(lead.conversation_id, 'agent', message, 'text', timestamp, 1);
              
              await db.prepare('UPDATE leads SET auto_followup_count = auto_followup_count + 1, followup_count = followup_count + 1, last_followup_at = ?, updated_at = ? WHERE id = ?')
                .run(timestamp, timestamp, lead.id);
              
              await db.prepare('UPDATE conversations SET last_message_at = ? WHERE id = ?').run(timestamp, lead.conversation_id);

              await db.prepare('INSERT INTO activities (user_id, type, description) VALUES (?, ?, ?)')
                .run(lead.user_id, 'followup_sent', `Automated follow-up #${nextCount} sent to ${lead.name || lead.contact_number}.`);

              io.emit('new_message', {
                conversation_id: lead.conversation_id,
                sender: 'agent',
                content: message,
                type: 'text',
                created_at: timestamp
              });
              
              console.log(`Sent auto follow-up ${nextCount} to ${lead.contact_number}`);
            }
          }
        }
      }
    } catch (error) {
      console.error('Follow-up scheduler error:', error);
    }
  }, 1000 * 60 * 60); // Every hour
}

export async function syncWhatsAppHistory(sessionId: string, io: SocketIOServer) {
  const sock = sessions[sessionId];
  if (!sock) throw new Error('Session not connected');

  console.log(`Manual sync requested for session ${sessionId}`);
  io.emit('sync_status', { sessionId, status: 'syncing', progress: 0, message: 'Refreshing data...' });

  try {
    // Since Baileys is event-driven and doesn't have a simple "fetch all chats" method,
    // we'll emit a completion status to refresh the UI.
    // Real sync happens automatically via events.
    
    // We can try to fetch some recent messages for active conversations to "force" an update
    const conversations = await db.prepare('SELECT contact_number FROM conversations WHERE session_id = ? ORDER BY last_message_at DESC LIMIT 10').all(sessionId) as any[];
    
    let processed = 0;
    const total = conversations.length || 1;

    for (const conv of conversations) {
      processed++;
      const progress = Math.round((processed / total) * 100);
      io.emit('sync_status', { sessionId, status: 'syncing', progress, message: `Refreshing chat ${processed}/${total}...` });
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    io.emit('sync_status', { sessionId, status: 'completed', progress: 100 });
  } catch (error) {
    console.error(`Manual sync failed for session ${sessionId}:`, error);
    io.emit('sync_status', { sessionId, status: 'error', message: 'Manual sync failed. Please try again.' });
  }
}