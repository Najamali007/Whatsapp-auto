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

// Ensure uploads directory exists
const uploadsDir = path.join(process.cwd(), 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

export async function connectToWhatsApp(sessionId: string, io: SocketIOServer) {
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

  sock.ev.on('connection.update', async (update) => {
    const { connection, lastDisconnect, qr } = update;

    if (qr) {
      io.emit('qr', { sessionId, qr });
    }

    if (connection === 'close') {
      const statusCode = (lastDisconnect?.error as Boom)?.output?.statusCode;
      const shouldReconnect = statusCode !== DisconnectReason.loggedOut;
      
      console.log(`Connection closed for session ${sessionId}. Status: ${statusCode}. Reconnecting: ${shouldReconnect}`);
      
      if (shouldReconnect) {
        // Add a small delay for stream errors (like 515) to avoid rapid reconnection loops
        const delay = statusCode === 515 ? 5000 : 2000;
        setTimeout(() => connectToWhatsApp(sessionId, io), delay);
      } else {
        // Logged out, clean up
        if (fs.existsSync(sessionDir)) {
          fs.rmSync(sessionDir, { recursive: true, force: true });
        }
        await db.prepare('UPDATE whatsapp_sessions SET status = ?, number = NULL WHERE id = ?').run('disconnected', sessionId);
        io.emit('connection_status', { sessionId, status: 'disconnected' });
        io.emit('session_disconnected', { sessionId });
        delete sessions[sessionId];
      }
    } else if (connection === 'open') {
      console.log(`Opened connection for session ${sessionId}`);
      const number = sock.user?.id.split(':')[0];
      
      // Handle UNIQUE constraint: Clear this number from any other session first
      await db.prepare('UPDATE whatsapp_sessions SET number = NULL WHERE number = ? AND id != ?').run(number, sessionId);
      
      await db.prepare('UPDATE whatsapp_sessions SET status = ?, number = ? WHERE id = ?').run('connected', number, sessionId);
      io.emit('connection_status', { sessionId, status: 'connected', number });
      
      // Check for unreplied messages on connection
      setTimeout(() => checkUnrepliedMessages(sessionId, sock, io), 5000);
    }
  });

  sock.ev.on('creds.update', saveCreds);

  sock.ev.on('messaging-history.set', async ({ chats, contacts, messages, isLatest }) => {
    console.log(`Syncing history for session ${sessionId}: ${chats.length} chats, ${contacts.length} contacts, ${messages.length} messages`);
    io.emit('sync_status', { sessionId, status: 'syncing', progress: 0, message: 'Syncing contacts...' });
    
    try {
      // Sync contacts in a single transaction for speed
      await db.exec('BEGIN TRANSACTION');
      const insertContact = await db.prepare('INSERT OR REPLACE INTO contacts (session_id, jid, name, number) VALUES (?, ?, ?, ?)');
      for (const contact of contacts) {
        const number = contact.id.split('@')[0];
        let name = contact.name || contact.verifiedName || null;
        
        if (!name) {
          const globalName = await db.prepare('SELECT name FROM contacts WHERE jid = ? AND name IS NOT NULL LIMIT 1').get(contact.id) as any;
          if (globalName) name = globalName.name;
        }
        
        await insertContact.run(sessionId, contact.id, name, number);
      }
      await db.exec('COMMIT');

      // Sync chats (conversations)
      io.emit('sync_status', { sessionId, status: 'syncing', progress: 5, message: 'Syncing chats...' });
      await db.exec('BEGIN TRANSACTION');
      const insertConv = await db.prepare('INSERT OR IGNORE INTO conversations (session_id, contact_number, contact_name, last_message_at) VALUES (?, ?, ?, ?)');
      for (const chat of chats) {
        if (chat.id === 'status@broadcast') continue;
        await insertConv.run(sessionId, chat.id, chat.name || null, new Date().toISOString());
      }
      await db.exec('COMMIT');

      // Sync messages/conversations
      io.emit('sync_status', { sessionId, status: 'syncing', progress: 10, message: 'Syncing messages...' });
      
      let processed = 0;
      const total = messages.length;
      
      // Process messages in chunks to avoid blocking too long and allow progress updates
      const chunkSize = 50;
      for (let i = 0; i < messages.length; i += chunkSize) {
        const chunk = messages.slice(i, i + chunkSize);
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
        io.emit('sync_status', { sessionId, status: 'syncing', progress, message: `Syncing messages (${processed}/${total})...` });
      }
      
      io.emit('sync_status', { sessionId, status: 'completed', progress: 100 });
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
    const updateConv = await db.prepare('UPDATE conversations SET contact_name = ? WHERE session_id = ? AND contact_number = ?');
    for (const contact of contacts) {
      const number = contact.id.split('@')[0];
      let name = contact.name || contact.verifiedName || null;
      
      // FORCEFUL GLOBAL NAME RETRIEVAL
      if (!name) {
        const globalName = await db.prepare('SELECT name FROM contacts WHERE jid = ? AND name IS NOT NULL LIMIT 1').get(contact.id) as any;
        if (globalName) name = globalName.name;
      }

      await insertContact.run(sessionId, contact.id, name, number);
      if (name) {
        await updateConv.run(name, sessionId, contact.id);
      }
    }
  });

  sock.ev.on('messages.upsert', async (m) => {
    if (m.type === 'notify') {
      for (const msg of m.messages) {
        // Skip status updates
        if (msg.key.remoteJid === 'status@broadcast') continue;

        if (!msg.key.fromMe && msg.message) {
          await handleIncomingMessage(sessionId, sock, msg, io);
        } else if (msg.key.fromMe && msg.message) {
          // If message sent from phone, sync it and emit
          await saveMessage(sessionId, sock, msg, io, true);
        }
      }
    }
  });

  return sock;
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

  // Update contact name if available in pushName
  if (!msg.key.fromMe && msg.pushName) {
    await db.prepare('UPDATE conversations SET contact_name = ? WHERE id = ?').run(msg.pushName, conversation.id);
  } else if (conversation && !conversation.contact_name && !msg.key.fromMe) {
    // Try to fetch from contacts table if we synced it before
    const contact = await db.prepare('SELECT name FROM contacts WHERE session_id = ? AND jid = ?').get(sessionId, from) as any;
    if (contact && contact.name) {
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
    
    await db.prepare('UPDATE conversations SET last_message_at = ? WHERE id = ?')
      .run(timestamp, conversation.id);

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
        contact_number: updatedConv.contact_number,
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
            const lastAgentMsg = await db.prepare('SELECT content FROM messages WHERE conversation_id = ? AND sender = "agent" ORDER BY created_at DESC LIMIT 1').get(savedMsg.conversationId) as any;
            
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

async function processAIResponse(sessionId: string, sock: WASocket, conversation: any, userMessage: string, io: SocketIOServer) {
  try {
    const session = await db.prepare('SELECT user_id, agent_id FROM whatsapp_sessions WHERE id = ?').get(sessionId) as any;
    if (!session || !session.user_id) return;

    // Token Check
    const user = await db.prepare('SELECT role, tokens, token_limit FROM users WHERE id = ?').get(session.user_id) as any;
    if (user && user.role === 'admin') {
      if (user.tokens >= user.token_limit) {
        console.log(`Admin ${session.user_id} has reached token limit (${user.tokens}/${user.token_limit}). Stopping agent.`);
        await db.prepare('UPDATE conversations SET is_autopilot = 0 WHERE id = ?').run(conversation.id);
        io.emit('new_message', {
          conversation_id: conversation.id,
          sender: 'system',
          content: 'Agent stopped: Token limit reached.',
          type: 'system',
          created_at: new Date().toISOString()
        });
        return;
      }
    }

    const agent = await db.prepare('SELECT * FROM agents WHERE id = ?').get(session.agent_id) as any;
    if (!agent) return;

    // 1. Cooldown Mechanism (2 hours)
    const now = new Date();
    if (conversation.last_agent_message_at) {
      const lastAgentMsg = new Date(conversation.last_agent_message_at);
      const diffHours = (now.getTime() - lastAgentMsg.getTime()) / (1000 * 60 * 60);
      // We respond to incoming messages regardless of cooldown, but we use it for internal logic if needed.
    }

    // 2. Acknowledgment Detection (Stop Logic)
    const ackPhrases = ["ok", "thanks", "thank you", "got it", "noted", "i will wait", "fine", "sure", "alright"];
    const isAck = ackPhrases.includes(userMessage.toLowerCase().trim());

    // 3. Existing Client Detection
    const contactName = conversation.contact_name || '';
    const isExistingClient = contactName.includes('Client') || contactName.includes('CUS');
    
    // 4. Fetch Context (Last 10 messages)
    const contextLimit = 10;
    const lastMessages = await db.prepare(`
      SELECT sender, content, created_at 
      FROM messages 
      WHERE conversation_id = ? 
      ORDER BY created_at DESC 
      LIMIT ?
    `).all(conversation.id, contextLimit) as any[];
    
    const conversationHistory = lastMessages.reverse();

    // 5. Anti-Repetition: Similarity Check (Last 5 messages)
    const recentAgentMessages = conversationHistory.filter(m => m.sender === 'agent').slice(-5);

    // 6. Greeting & Identity Control (Once per day)
    const lastGreeting = conversation.last_greeting_at ? new Date(conversation.last_greeting_at) : null;
    const isNewDay = !lastGreeting || (now.getTime() - lastGreeting.getTime() > 24 * 60 * 60 * 1000);
    
    let greetingInstruction = "";
    if (isNewDay) {
      greetingInstruction = `This is your first interaction with the user today. You may include a brief, natural greeting and introduce yourself if appropriate (Your name is ${agent.name}). Use a warm, human tone.`;
    } else {
      greetingInstruction = `You have already greeted the user today. STRICT RULE: DO NOT use any greetings like "Hi", "Hello", "Hey", or "Hi [Name]". DO NOT introduce yourself again. Start your response directly by addressing the user's message or continuing the previous topic.`;
    }

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

    // 6. Knowledge & Memory
    const trainingFiles = await db.prepare('SELECT content FROM training_files WHERE agent_id = ?').all(agent.id) as any[];
    const trainingData = trainingFiles.map(f => f.content).join('\n\n');

    const systemInstruction = `
      IDENTITY & ROLE:
      Name: ${agent.name}
      Role: ${agent.role}
      Personality: ${agent.personality}
      Primary Mission: ${agent.objective}
      Tone: ${agent.tone}
      Strategy: ${agent.strategy}
      
      KNOWLEDGE BASE:
      ${agent.knowledge_base}
      
      ADDITIONAL TRAINING & SELF-IMPROVEMENT:
      ${trainingData}
      - SELF-TRAINING RULE: Analyze the conversation history below. Identify which of your previous approaches were most effective in engaging the user. Adapt your tone and strategy to match the user's communication style. If the user is brief, be brief. If the user is detailed, provide more value.
      
      USER CONTEXT:
      - Intent: ${intent || 'Unknown'}
      - Engagement Score: ${engagementScore}/100
      - Service Interest: ${serviceInterest || 'Not specified'}
      - Previous Objections: ${objections || 'None'}
      
      THINKING PROCESS (INTERNAL LOGIC):
      1. Analyze the User's Message: What is their immediate question, concern, or intent?
      2. Review Context: Look at the last 10 messages. What is the current "vibe" and stage of the conversation?
      3. Strategic Goal: What is the single most important thing to say right now to provide value or move the conversation forward?
      4. Avoid Robotic Patterns: Do NOT use meta-commentary like "I saw you replied" or "I noticed your message". Humans don't say that.
      5. Single Message Constraint: Formulate the entire response into ONE clear, concise, and natural message.
      6. Human Check: Does this sound like a helpful person at Webdo Solutions, or a bot?
      
      CONVERSATION RULES:
      - ${greetingInstruction}
      - ${stageInstruction}
      - ${intentInstruction}
      - ${isAck ? "The user just acknowledged. Send a VERY SHORT, natural acknowledgment (e.g. 'Got it 👍' or 'You're welcome!') and then STOP. Do not ask more questions." : "Continue the conversation naturally."}
      - BE HUMAN-LIKE: Use natural language. Avoid being overly formal or robotic. Use emojis naturally (e.g., 👍, 😊, 🚀).
      - DIRECT REPLY: Address the user's current query directly and immediately.
      - SINGLE MESSAGE REPLY: You are STRICTLY FORBIDDEN from sending more than one message. Combine all your thoughts into one.
      - NO BOT PHRASES: Never say "I saw you replied", "I noticed you replied", "How can I help you today?", or anything similar. Just get straight to the point.
      - CONTEXT AWARENESS: Maintain conversation flow. Use the last 10 messages to ensure you are not repeating yourself or asking for information already provided.
      - ANTI-REPETITION: 
        * DO NOT repeat your previous messages or sentiments.
        * Check history for patterns to avoid: ${JSON.stringify(recentAgentMessages.map(m => m.content))}
      - FALLBACK: If you are confused, ask a natural clarifying question.
      
      CONVERSATION HISTORY:
      ${conversationHistory.map(m => `${m.sender === 'agent' ? 'Assistant' : 'User'}: ${m.content}`).join('\n')}
    `;

    const aiResponse = await callAI(session.user_id, userMessage, systemInstruction);
    
    // 10. Anti-Repetition & Robotic Phrase Check
    const roboticPhrases = [
      "i saw you replied",
      "i noticed you replied",
      "how can i help you today",
      "how can i assist you today",
      "i am here to help",
      "i saw your message",
      "hi ondigix",
      "i saw you replied. how can i help?"
    ];

    const lowerResponse = aiResponse.toLowerCase().trim();
    
    // Block if it contains robotic meta-commentary
    const containsRoboticPhrase = roboticPhrases.some(phrase => lowerResponse.includes(phrase));

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
    await sock.sendMessage(conversation.contact_number, { text: aiResponse });

    // Consume token for admin
    if (user && user.role === 'admin') {
      await db.prepare('UPDATE users SET tokens = tokens + 1 WHERE id = ?').run(session.user_id);
      await db.prepare('INSERT INTO audit_logs (user_id, action, details) VALUES (?, ?, ?)')
        .run(session.user_id, 'token_consumed', `Token consumed for message in conversation ${conversation.id}. New total: ${user.tokens + 1}`);
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
