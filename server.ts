import express from 'express';
import { createServer } from 'http';
import { Server as SocketIOServer } from 'socket.io';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { createServer as createViteServer } from 'vite';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import multer from 'multer';
import fs from 'fs';
import { createRequire } from 'module';
import db, { initDb, isMySQL } from './backend/db.js';

const require = createRequire(import.meta.url);
const pdf = require('pdf-parse');
const mammoth = require('mammoth');
import { 
  callAI, 
  interpretGuidance, 
  validateDeepSeekKey, 
  validateGeminiKey,
  generateFollowupMessage 
} from './backend/ai.js';
import { connectToWhatsApp, getSession, syncWhatsAppHistory, startFollowupScheduler } from './backend/whatsapp.js';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const httpServer = createServer(app);
const io = new SocketIOServer(httpServer, {
  cors: {
    origin: '*',
  },
});

// Start follow-up scheduler
startFollowupScheduler(io);

const PORT = 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'dealism-secure-secret-2026';

// Ensure uploads directory exists
const uploadsDir = path.join(process.cwd(), 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

app.use(cors());
app.use(express.json());
app.use('/uploads', express.static(uploadsDir));

// Multer setup
const upload = multer({ dest: 'uploads/' });

// Auth Middleware
const authenticateToken = (req: any, res: any, next: any) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token || token === 'null' || token === 'undefined') {
    console.warn('Authentication failed: No token provided');
    return res.sendStatus(401);
  }

  jwt.verify(token, JWT_SECRET, async (err: any, user: any) => {
    if (err) {
      console.warn('Authentication failed: Invalid token', err.message);
      return res.sendStatus(403);
    }
    
    try {
      // Verify user still exists in DB and is active
      const dbUser = await db.prepare('SELECT id, role, is_active FROM users WHERE id = ?').get(user.id) as any;
      if (!dbUser) {
        console.warn('Authentication failed: User no longer exists');
        return res.sendStatus(403);
      }

      if (!dbUser.is_active) {
        console.warn('Authentication failed: User is inactive');
        return res.status(403).json({ error: 'Account is deactivated' });
      }

      req.user = { ...user, role: dbUser.role };
      next();
    } catch (error) {
      console.error('Authentication error during DB check:', error);
      return res.sendStatus(500);
    }
  });
};

const authenticateSuperAdmin = (req: any, res: any, next: any) => {
  authenticateToken(req, res, () => {
    if (req.user.role !== 'super_admin') {
      return res.status(403).json({ error: 'Super Admin access required' });
    }
    next();
  });
};

// --- Auth Routes ---
app.post('/api/auth/login', async (req, res) => {
  const { username, password } = req.body;
  const user = await db.prepare('SELECT * FROM users WHERE username = ?').get(username) as any;

  if (!user || !bcrypt.compareSync(password, user.password)) {
    return res.status(401).json({ error: 'Invalid credentials' });
  }

  if (!user.is_active) {
    return res.status(403).json({ error: 'Account is deactivated' });
  }

  const token = jwt.sign({ id: user.id, username: user.username, role: user.role }, JWT_SECRET);
  res.json({ token, role: user.role });
});

app.post('/api/auth/super-admin/login', async (req, res) => {
  const { username, password, securityKey } = req.body;
  const user = await db.prepare('SELECT * FROM users WHERE username = ? AND role = ?').get(username, 'super_admin') as any;

  if (!user || !bcrypt.compareSync(password, user.password) || user.security_key !== securityKey) {
    return res.status(401).json({ error: 'Invalid credentials or security key' });
  }

  const token = jwt.sign({ id: user.id, username: user.username, role: user.role }, JWT_SECRET);
  res.json({ token, role: user.role });
});

app.post('/api/auth/reset-password', async (req, res) => {
  const { username, pin, newPassword } = req.body;
  const SECURITY_PIN = '0331244';

  if (pin !== SECURITY_PIN) {
    return res.status(403).json({ error: 'Invalid security pin' });
  }

  const user = await db.prepare('SELECT id, role FROM users WHERE username = ?').get(username) as any;
  if (!user) {
    return res.status(404).json({ error: 'User not found' });
  }

  if (user.role !== 'super_admin') {
    return res.status(403).json({ error: 'Password reset is only available for Super Admin' });
  }

  const hashedPassword = bcrypt.hashSync(newPassword, 10);
  await db.prepare('UPDATE users SET password = ? WHERE id = ?').run(hashedPassword, user.id);
  
  res.json({ success: true, message: 'Password reset successfully' });
});

// --- Settings Routes ---
app.get('/api/settings/autopilot', authenticateToken, async (req: any, res) => {
  try {
    const user = await db.prepare('SELECT is_global_autopilot FROM users WHERE id = ?').get(req.user.id) as any;
    res.json({ is_global_autopilot: user ? !!user.is_global_autopilot : true });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch autopilot setting' });
  }
});

app.post('/api/settings/autopilot', authenticateToken, async (req: any, res) => {
  const { is_global_autopilot } = req.body;
  try {
    await db.prepare('UPDATE users SET is_global_autopilot = ? WHERE id = ?').run(is_global_autopilot ? 1 : 0, req.user.id);
    
    // Sync all user's conversations to match the global setting
    await db.prepare(`
      UPDATE conversations 
      SET is_autopilot = ? 
      WHERE session_id IN (SELECT id FROM whatsapp_sessions WHERE user_id = ?)
    `).run(is_global_autopilot ? 1 : 0, req.user.id);

    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Failed to update autopilot setting' });
  }
});

const validateApiKey = async (provider: string, apiKey: string) => {
  if (!apiKey) return { isValid: false, credits: 0 };
  
  if (provider === 'deepseek') {
    return await validateDeepSeekKey(apiKey);
  } else if (provider === 'gemini') {
    return await validateGeminiKey(apiKey);
  }
  
  return { isValid: false, credits: 0, error: 'Unknown provider' };
};

// --- Super Admin Routes ---
app.get('/api/super-admin/admins', authenticateSuperAdmin, async (req, res) => {
  try {
    const admins = await db.prepare("SELECT id, username, role, is_active, created_at FROM users WHERE role = 'admin'").all();
    res.json(admins);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch admins' });
  }
});

app.post('/api/super-admin/admins', authenticateSuperAdmin, async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) return res.status(400).json({ error: 'Username and password required' });

  try {
    const hashedPassword = bcrypt.hashSync(password, 10);
    const result = await db.prepare('INSERT INTO users (username, password, role, is_active) VALUES (?, ?, ?, ?)')
      .run(username, hashedPassword, 'admin', 1);
    res.json({ id: result.lastInsertRowid, username, role: 'admin', is_active: 1 });
  } catch (error: any) {
    if (error.message.includes('UNIQUE')) {
      return res.status(400).json({ error: 'Username already exists' });
    }
    res.status(500).json({ error: 'Failed to create admin' });
  }
});

app.put('/api/super-admin/admins/:id', authenticateSuperAdmin, async (req, res) => {
  const { is_active, password } = req.body;
  try {
    if (password) {
      const hashedPassword = bcrypt.hashSync(password, 10);
      await db.prepare('UPDATE users SET password = ? WHERE id = ? AND role = ?').run(hashedPassword, req.params.id, 'admin');
    }
    if (is_active !== undefined) {
      await db.prepare('UPDATE users SET is_active = ? WHERE id = ? AND role = ?').run(is_active ? 1 : 0, req.params.id, 'admin');
    }
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Failed to update admin' });
  }
});

app.delete('/api/super-admin/admins/:id', authenticateSuperAdmin, async (req, res) => {
  try {
    await db.prepare("DELETE FROM users WHERE id = ? AND role = 'admin'").run(req.params.id);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Failed to delete admin' });
  }
});

// --- Settings Routes (Restricted to Super Admin) ---
app.get('/api/settings', authenticateSuperAdmin, async (req: any, res) => {
  try {
    // Super Admin manages global settings or their own? 
    // User said "add the api setting in super admin and remove from admin site"
    // This implies settings are global or managed by super admin for the whole app.
    // Let's assume they are global for now, or at least super admin can see all.
    const settings = await db.prepare('SELECT * FROM settings').all();
    res.json(settings);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch settings' });
  }
});

app.post('/api/settings', authenticateSuperAdmin, async (req: any, res) => {
  const { provider, api_key, base_url, model } = req.body;
  
  if (!provider || !api_key) {
    return res.status(400).json({ error: 'Provider and API key are required' });
  }

  try {
    const validation = await validateApiKey(provider, api_key);
    
    if (!validation.isValid) {
      return res.status(400).json({ error: validation.error || 'Invalid API key' });
    }

    // Settings are now global (user_id = 0 or similar)
    const existing = await db.prepare('SELECT id FROM settings WHERE provider = ?').get(provider) as any;
    if (existing) {
      await db.prepare("UPDATE settings SET api_key = ?, base_url = ?, model = ?, is_active = 1, status = 'active', credits_remaining = ? WHERE id = ?")
        .run(api_key, base_url || null, model || null, validation.credits, existing.id);
    } else {
      await db.prepare('INSERT INTO settings (user_id, provider, api_key, base_url, model, credits_remaining) VALUES (?, ?, ?, ?, ?, ?)')
        .run(0, provider, api_key, base_url || null, model || null, validation.credits);
    }
    
    res.json({ 
      success: true, 
      message: 'API connected successfully',
      credits: validation.credits
    });
  } catch (error: any) {
    console.error('Failed to save settings:', error);
    res.status(500).json({ error: `Failed to save settings: ${error.message}` });
  }
});

app.post('/api/settings/refresh', authenticateSuperAdmin, async (req: any, res) => {
  try {
    const settings = await db.prepare('SELECT * FROM settings').all() as any[];
    
    for (const setting of settings) {
      const validation = await validateApiKey(setting.provider, setting.api_key);
      await db.prepare('UPDATE settings SET credits_remaining = ?, status = ? WHERE id = ?')
        .run(validation.credits, validation.isValid ? 'active' : 'error', setting.id);
    }
    
    const updatedSettings = await db.prepare('SELECT * FROM settings').all();
    res.json(updatedSettings);
  } catch (error) {
    res.status(500).json({ error: 'Failed to refresh settings' });
  }
});

app.delete('/api/settings/:provider', authenticateSuperAdmin, async (req: any, res) => {
  try {
    await db.prepare('DELETE FROM settings WHERE provider = ?').run(req.params.provider);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Failed to delete setting' });
  }
});

// --- Agent Routes ---
app.post('/api/agents/:id/guide', authenticateToken, async (req: any, res) => {
  const agentId = req.params.id;
  const { message } = req.body;
  
  try {
    // Verify ownership
    const agent = await db.prepare('SELECT id FROM agents WHERE id = ? AND user_id = ?').get(agentId, req.user.id);
    if (!agent) return res.status(404).json({ error: 'Agent not found' });

    // Fetch contacts for context
    const contacts = await db.prepare('SELECT jid, name FROM contacts WHERE session_id IN (SELECT id FROM whatsapp_sessions WHERE user_id = ?)').all(req.user.id) as any[];
    
    const response = await interpretGuidance(req.user.id, parseInt(agentId), message, contacts, getSession, io);
    res.json({ response });
  } catch (error: any) {
    console.error('Guidance failed:', error);
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/agents/:id/rules', authenticateToken, async (req: any, res) => {
  const rules = await db.prepare(`
    SELECT ar.* FROM agent_rules ar
    JOIN agents a ON ar.agent_id = a.id
    WHERE ar.agent_id = ? AND a.user_id = ?
    ORDER BY ar.created_at DESC
  `).all(req.params.id, req.user.id);
  res.json(rules);
});

app.delete('/api/agents/:agentId/rules/:ruleId', authenticateToken, async (req: any, res) => {
  const agent = await db.prepare('SELECT id FROM agents WHERE id = ? AND user_id = ?').get(req.params.agentId, req.user.id);
  if (!agent) return res.status(404).json({ error: 'Agent not found' });

  await db.prepare('DELETE FROM agent_rules WHERE id = ? AND agent_id = ?').run(req.params.ruleId, req.params.agentId);
  res.json({ success: true });
});

app.get('/api/agents', authenticateToken, async (req: any, res) => {
  const agents = await db.prepare('SELECT * FROM agents WHERE user_id = ?').all(req.user.id);
  res.json(agents);
});

app.post('/api/agents', authenticateToken, async (req: any, res) => {
  const { name, personality, role, knowledge_base, brand_company, product_service, objective, tone, playbook, others, avatar, strategy } = req.body;
  const result = await db.prepare('INSERT INTO agents (user_id, name, personality, role, knowledge_base, brand_company, product_service, objective, tone, playbook, others, avatar, strategy) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').run(req.user.id, name, personality, role, knowledge_base, brand_company, product_service, objective, tone, playbook, others, avatar, strategy);
  res.json({ id: result.lastInsertRowid });
});

app.put('/api/agents/:id', authenticateToken, async (req: any, res) => {
  const { name, personality, role, knowledge_base, brand_company, product_service, objective, tone, playbook, others, avatar, is_active, strategy } = req.body;
  
  // Verify ownership
  const agent = await db.prepare('SELECT id FROM agents WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id);
  if (!agent) return res.status(404).json({ error: 'Agent not found' });

  await db.prepare('UPDATE agents SET name = ?, personality = ?, role = ?, knowledge_base = ?, brand_company = ?, product_service = ?, objective = ?, tone = ?, playbook = ?, others = ?, avatar = ?, is_active = ?, strategy = ? WHERE id = ?')
    .run(name, personality, role, knowledge_base, brand_company, product_service, objective, tone, playbook, others, avatar, is_active ? 1 : 0, strategy, req.params.id);
  res.json({ success: true });
});

app.post('/api/agents/bulk-delete', authenticateToken, async (req, res) => {
  const { ids } = req.body;
  console.log('Bulk delete request received for agents:', ids);
  if (!Array.isArray(ids) || ids.length === 0) return res.status(400).json({ error: 'No IDs provided' });

  try {
    for (const agentId of ids) {
      console.log(`Processing deletion for agent ${agentId}`);
      // Find associated sessions to clean up active connections and files
      const sessions = await db.prepare('SELECT id FROM whatsapp_sessions WHERE agent_id = ?').all(agentId) as any[];
      console.log(`Found ${sessions.length} sessions for agent ${agentId}`);
      
      for (const session of sessions) {
        const sessionId = session.id.toString();
        const sock = getSession(sessionId);
        
        if (sock) {
          console.log(`Logging out active session ${sessionId}`);
          try {
            await sock.logout();
          } catch (e) {
            console.warn(`Logout failed for session ${sessionId} during bulk agent deletion:`, e);
            try { sock.end(undefined); } catch (e2) {}
          }
        }

        const sessionDir = path.join(process.cwd(), 'sessions', sessionId);
        if (fs.existsSync(sessionDir)) {
          console.log(`Removing session directory: ${sessionDir}`);
          try {
            fs.rmSync(sessionDir, { recursive: true, force: true });
          } catch (e) {
            console.error(`Failed to remove directory for session ${sessionId} during bulk agent deletion:`, e);
          }
        }
      }

      // The DB records will be deleted automatically due to ON DELETE CASCADE
      const result = await db.prepare('DELETE FROM agents WHERE id = ?').run(agentId);
      console.log(`Agent ${agentId} deleted from DB.`);
    }
    res.json({ success: true });
  } catch (error) {
    console.error(`Failed to bulk delete agents:`, error);
    res.status(500).json({ error: 'Failed to bulk delete agents' });
  }
});

app.delete('/api/agents/:id', authenticateToken, async (req: any, res) => {
  const agentId = req.params.id;
  
  try {
    // Verify ownership
    const agent = await db.prepare('SELECT id FROM agents WHERE id = ? AND user_id = ?').get(agentId, req.user.id);
    if (!agent) return res.status(404).json({ error: 'Agent not found' });

    // Find associated sessions to clean up active connections and files
    const sessions = await db.prepare('SELECT id FROM whatsapp_sessions WHERE agent_id = ?').all(agentId) as any[];
    
    for (const session of sessions) {
      const sessionId = session.id.toString();
      const sock = getSession(sessionId);
      
      if (sock) {
        try {
          await sock.logout();
        } catch (e) {
          console.warn(`Logout failed for session ${sessionId} during agent deletion:`, e);
          try { sock.end(undefined); } catch (e2) {}
        }
      }

      const sessionDir = path.join(process.cwd(), 'sessions', sessionId);
      if (fs.existsSync(sessionDir)) {
        try {
          fs.rmSync(sessionDir, { recursive: true, force: true });
        } catch (e) {
          console.error(`Failed to remove directory for session ${sessionId} during agent deletion:`, e);
        }
      }
    }

    // The DB records will be deleted automatically due to ON DELETE CASCADE
    await db.prepare('DELETE FROM agents WHERE id = ?').run(agentId);
    res.json({ success: true });
  } catch (error) {
    console.error(`Failed to delete agent ${agentId}:`, error);
    res.status(500).json({ error: 'Failed to delete agent' });
  }
});

app.post('/api/agents/:id/avatar', authenticateToken, upload.single('avatar'), async (req: any, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
  
  const agent = await db.prepare('SELECT id FROM agents WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id);
  if (!agent) return res.status(404).json({ error: 'Agent not found' });

  const avatarUrl = `/uploads/${req.file.filename}`;
  await db.prepare('UPDATE agents SET avatar = ? WHERE id = ?').run(avatarUrl, req.params.id);
  res.json({ avatarUrl });
});

app.post('/api/messages/:id/transcription', authenticateToken, async (req, res) => {
  const { transcription } = req.body;
  await db.prepare('UPDATE messages SET transcription = ? WHERE id = ?').run(transcription, req.params.id);
  res.json({ success: true });
});

// Serve uploads statically
app.use('/uploads', express.static(path.join(process.cwd(), 'uploads')));

// --- Agent Training Routes ---
app.get('/api/agents/:id/training-files', authenticateToken, async (req: any, res) => {
  const files = await db.prepare(`
    SELECT tf.id, tf.original_name, tf.created_at 
    FROM training_files tf
    JOIN agents a ON tf.agent_id = a.id
    WHERE tf.agent_id = ? AND a.user_id = ?
  `).all(req.params.id, req.user.id);
  res.json(files);
});

app.post('/api/agents/:id/train-file', authenticateToken, upload.single('file'), async (req: any, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

  const agent = await db.prepare('SELECT id FROM agents WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id);
  if (!agent) return res.status(404).json({ error: 'Agent not found' });

  let content = '';
  const fileExtension = path.extname(req.file.originalname).toLowerCase();

  try {
    if (fileExtension === '.pdf') {
      const dataBuffer = fs.readFileSync(req.file.path);
      const data = await pdf(dataBuffer);
      content = data.text;
    } else if (fileExtension === '.docx') {
      const result = await mammoth.extractRawText({ path: req.file.path });
      content = result.value;
    } else {
      content = fs.readFileSync(req.file.path, 'utf-8');
    }

    await db.prepare('INSERT INTO training_files (agent_id, filename, original_name, content) VALUES (?, ?, ?, ?)')
      .run(req.params.id, req.file.filename, req.file.originalname, content);

    res.json({ success: true });
  } catch (error) {
    console.error('Training file processing error:', error);
    res.status(500).json({ error: 'Failed to process file' });
  }
});

app.post('/api/agents/:id/train-history', authenticateToken, async (req: any, res) => {
  // Verify ownership
  const agent = await db.prepare('SELECT id FROM agents WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id);
  if (!agent) return res.status(404).json({ error: 'Agent not found' });

  // Extract knowledge from past conversations for this agent's sessions
  const sessions = await db.prepare('SELECT id FROM whatsapp_sessions WHERE agent_id = ?').all(req.params.id) as any[];
  const sessionIds = sessions.map(s => s.id);

  if (sessionIds.length === 0) return res.json({ success: true, message: 'No sessions found' });

  const placeholders = sessionIds.map(() => '?').join(',');
  const messages = await db.prepare(`
    SELECT m.content 
    FROM messages m
    JOIN conversations c ON m.conversation_id = c.id
    WHERE c.session_id IN (${placeholders})
    ORDER BY m.created_at DESC
    LIMIT 100
  `).all(...sessionIds) as any[];

  const historyContent = messages.map(m => m.content).join('\n');
  
  // Save as a special training file or append to knowledge base
  await db.prepare('INSERT INTO training_files (agent_id, filename, original_name, content) VALUES (?, ?, ?, ?)')
    .run(req.params.id, `history_${Date.now()}.txt`, 'Chat History Training', historyContent);

  res.json({ success: true });
});

app.delete('/api/agents/:agentId/training-files/:fileId', authenticateToken, async (req: any, res) => {
  const agent = await db.prepare('SELECT id FROM agents WHERE id = ? AND user_id = ?').get(req.params.agentId, req.user.id);
  if (!agent) return res.status(404).json({ error: 'Agent not found' });

  const file = await db.prepare('SELECT filename FROM training_files WHERE id = ? AND agent_id = ?').get(req.params.fileId, req.params.agentId) as any;
  if (file) {
    const filePath = path.join(process.cwd(), 'uploads', file.filename);
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    await db.prepare('DELETE FROM training_files WHERE id = ?').run(req.params.fileId);
  }
  res.json({ success: true });
});

// --- WhatsApp Routes ---
app.get('/api/whatsapp/sessions', authenticateToken, async (req: any, res) => {
  const sessions = await db.prepare('SELECT * FROM whatsapp_sessions WHERE user_id = ?').all(req.user.id);
  res.json(sessions);
});

app.post('/api/whatsapp/sessions', authenticateToken, async (req: any, res) => {
  const { agent_id, name } = req.body;
  const result = await db.prepare('INSERT INTO whatsapp_sessions (user_id, agent_id, name) VALUES (?, ?, ?)').run(req.user.id, agent_id, name);
  res.json({ id: result.lastInsertRowid });
});

app.post('/api/whatsapp/sessions/bulk-delete', authenticateToken, async (req: any, res) => {
  const { ids } = req.body;
  if (!Array.isArray(ids) || ids.length === 0) return res.status(400).json({ error: 'No IDs provided' });

  try {
    for (const sessionId of ids) {
      const sid = sessionId.toString();
      // Verify ownership
      const session = await db.prepare('SELECT * FROM whatsapp_sessions WHERE id = ? AND user_id = ?').get(sid, req.user.id);
      if (!session) continue;

      const sock = getSession(sid);
      
      if (sock) {
        try {
          await sock.logout();
        } catch (e) {
          console.warn(`Logout failed for session ${sid} during bulk deletion:`, e);
          try { sock.end(undefined); } catch (e2) {}
        }
      }

      const sessionDir = path.join(process.cwd(), 'sessions', sid);
      if (fs.existsSync(sessionDir)) {
        try {
          fs.rmSync(sessionDir, { recursive: true, force: true });
        } catch (e) {
          console.error(`Failed to remove directory for session ${sid}:`, e);
        }
      }

      await db.prepare('DELETE FROM whatsapp_sessions WHERE id = ? AND user_id = ?').run(sessionId, req.user.id);
    }
    res.json({ success: true });
  } catch (error) {
    console.error('Failed to bulk delete sessions:', error);
    res.status(500).json({ error: 'Failed to bulk delete sessions' });
  }
});

app.delete('/api/whatsapp/sessions/:id', authenticateToken, async (req: any, res) => {
  const sessionId = req.params.id;
  const sessionDir = path.join(process.cwd(), 'sessions', sessionId);
  
  try {
    // Verify ownership
    const session = await db.prepare('SELECT * FROM whatsapp_sessions WHERE id = ? AND user_id = ?').get(sessionId, req.user.id);
    if (!session) {
      return res.status(404).json({ error: 'Session not found' });
    }

    const sock = getSession(sessionId);
    if (sock) {
      try {
        await sock.logout();
      } catch (e) {
        console.warn(`Logout failed for session ${sessionId}, forcing close:`, e);
        try { sock.end(undefined); } catch (e2) {}
      }
    }
    
    if (fs.existsSync(sessionDir)) {
      try {
        fs.rmSync(sessionDir, { recursive: true, force: true });
      } catch (e) {
        console.error(`Failed to remove directory for session ${sessionId}:`, e);
      }
    }
    
    await db.prepare('DELETE FROM whatsapp_sessions WHERE id = ? AND user_id = ?').run(sessionId, req.user.id);
    io.emit('session_disconnected', { sessionId });
    res.json({ success: true });
  } catch (error) {
    console.error(`Failed to delete session ${sessionId}:`, error);
    res.status(500).json({ error: 'Failed to delete session' });
  }
});

app.post('/api/whatsapp/sessions/:id/sync', authenticateToken, async (req: any, res) => {
  const sessionId = req.params.id;
  try {
    // Verify ownership
    const session = await db.prepare('SELECT * FROM whatsapp_sessions WHERE id = ? AND user_id = ?').get(sessionId, req.user.id);
    if (!session) {
      return res.status(404).json({ error: 'Session not found' });
    }

    // This is an async operation that emits progress via socket
    syncWhatsAppHistory(sessionId, io).catch(err => console.error('Background sync failed:', err));
    res.json({ success: true, message: 'Sync started' });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/whatsapp/sessions/:id/connect', authenticateToken, async (req: any, res) => {
  const sessionId = req.params.id;
  try {
    // Verify ownership
    const session = await db.prepare('SELECT * FROM whatsapp_sessions WHERE id = ? AND user_id = ?').get(sessionId, req.user.id);
    if (!session) {
      return res.status(404).json({ error: 'Session not found' });
    }

    await connectToWhatsApp(sessionId, io);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Failed to connect' });
  }
});

app.post('/api/whatsapp/sessions/:id/disconnect', authenticateToken, async (req: any, res) => {
  const sessionId = req.params.id;
  
  try {
    // Verify ownership
    const session = await db.prepare('SELECT * FROM whatsapp_sessions WHERE id = ? AND user_id = ?').get(sessionId, req.user.id);
    if (!session) {
      return res.status(404).json({ error: 'Session not found' });
    }

    const sock = getSession(sessionId);
    const sessionDir = path.join(process.cwd(), 'sessions', sessionId);

    if (sock) {
      try {
        await sock.logout();
      } catch (e) {
        console.warn(`Logout failed for session ${sessionId}, forcing close:`, e);
        try { sock.end(undefined); } catch (e2) {}
      }
    }
    
    // Even if sock is not found or logout fails, we clean up locally
    if (fs.existsSync(sessionDir)) {
      fs.rmSync(sessionDir, { recursive: true, force: true });
    }
    
    // Remove all conversations and messages for this session
    await db.prepare('DELETE FROM conversations WHERE session_id = ?').run(sessionId);
    await db.prepare('DELETE FROM contacts WHERE session_id = ?').run(sessionId);
    
    await db.prepare('UPDATE whatsapp_sessions SET status = ?, number = NULL WHERE id = ?').run('disconnected', sessionId);
    io.emit('connection_status', { sessionId, status: 'disconnected' });
    io.emit('session_disconnected', { sessionId }); // New event for UI to clear chats
    
    res.json({ success: true });
  } catch (error) {
    console.error(`Failed to disconnect session ${sessionId}:`, error);
    // Force cleanup on error
    const sessionDir = path.join(process.cwd(), 'sessions', sessionId);
    if (fs.existsSync(sessionDir)) {
      fs.rmSync(sessionDir, { recursive: true, force: true });
    }
    await db.prepare('DELETE FROM conversations WHERE session_id = ?').run(sessionId);
    await db.prepare('UPDATE whatsapp_sessions SET status = ?, number = NULL WHERE id = ?').run('disconnected', sessionId);
    res.json({ success: true, message: 'Disconnected with forced cleanup' });
  }
});

app.get('/api/agents/session/:sessionId', authenticateToken, async (req: any, res) => {
  const session = await db.prepare('SELECT agent_id FROM whatsapp_sessions WHERE id = ? AND user_id = ?').get(req.params.sessionId, req.user.id) as any;
  if (!session || !session.agent_id) return res.status(404).json({ error: 'Session or agent not found' });

  const agent = await db.prepare('SELECT * FROM agents WHERE id = ? AND user_id = ?').get(session.agent_id, req.user.id) as any;
  if (!agent) return res.status(404).json({ error: 'Agent not found' });

  // Also fetch training files
  const trainingFiles = await db.prepare('SELECT content FROM training_files WHERE agent_id = ?').all(agent.id) as any[];
  const trainingData = trainingFiles.map(f => f.content).join('\n\n');

  res.json({ ...agent, trainingData });
});

// --- WhatsApp Contact Routes ---
app.get('/api/whatsapp/contacts', authenticateToken, async (req: any, res) => {
  const contacts = await db.prepare(`
    SELECT c.*, ws.number as session_number 
    FROM contacts c
    JOIN whatsapp_sessions ws ON c.session_id = ws.id
    WHERE ws.user_id = ?
    ORDER BY c.name ASC
  `).all(req.user.id);
  res.json(contacts);
});

// --- Conversation Routes ---
app.get('/api/conversations/unread-count', authenticateToken, async (req: any, res) => {
  try {
    const result = await db.prepare(`
      SELECT SUM(unread_count) as total 
      FROM conversations 
      WHERE session_id IN (SELECT id FROM whatsapp_sessions WHERE user_id = ?)
    `).get(req.user.id) as any;
    res.json({ total: result?.total || 0 });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch unread count' });
  }
});

app.get('/api/conversations', authenticateToken, async (req: any, res) => {
  const conversations = await db.prepare(`
    SELECT 
      c.*, 
      COALESCE(c.contact_name, (SELECT name FROM contacts WHERE jid = c.contact_number AND name IS NOT NULL LIMIT 1)) as contact_name,
      ws.number as session_number, 
      a.name as agent_name,
      (SELECT content FROM messages WHERE conversation_id = c.id ORDER BY created_at DESC LIMIT 1) as last_message_content,
      (SELECT type FROM messages WHERE conversation_id = c.id ORDER BY created_at DESC LIMIT 1) as last_message_type
    FROM conversations c
    JOIN whatsapp_sessions ws ON c.session_id = ws.id
    JOIN agents a ON ws.agent_id = a.id
    WHERE ws.user_id = ?
    ORDER BY c.last_message_at DESC
  `).all(req.user.id) as any[];

  // Parse labels JSON
  const parsedConversations = conversations.map(c => ({
    ...c,
    labels: c.labels ? JSON.parse(c.labels) : []
  }));

  res.json(parsedConversations);
});

// --- Social Accounts Routes ---
app.get('/api/social/accounts', authenticateToken, async (req: any, res) => {
  try {
    const accounts = await db.prepare('SELECT * FROM social_accounts WHERE user_id = ?').all(req.user.id);
    res.json(accounts);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch social accounts' });
  }
});

app.post('/api/social/login', authenticateToken, async (req: any, res) => {
  const { platform, account_id, name, access_token, avatar } = req.body;
  try {
    await db.prepare(`
      INSERT INTO social_accounts (user_id, platform, account_id, name, access_token, avatar)
      VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(user_id, platform, account_id) DO UPDATE SET
        name = excluded.name,
        access_token = excluded.access_token,
        avatar = excluded.avatar
    `).run(req.user.id, platform, account_id, name, access_token, avatar);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Failed to login to social account' });
  }
});

app.delete('/api/social/accounts/:id', authenticateToken, async (req: any, res) => {
  try {
    await db.prepare('DELETE FROM social_accounts WHERE id = ? AND user_id = ?').run(req.params.id, req.user.id);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Failed to delete social account' });
  }
});

app.post('/api/social/send', authenticateToken, async (req: any, res) => {
  const { platform, contact_number, text } = req.body;
  
  try {
    // Find or create conversation
    let conversation = await db.prepare('SELECT * FROM conversations WHERE platform = ? AND contact_number = ?').get(platform, contact_number) as any;
    if (!conversation) {
      const convResult = await db.prepare('INSERT INTO conversations (platform, contact_number, session_id) VALUES (?, ?, ?)')
        .run(platform, contact_number, 0);
      conversation = { id: convResult.lastInsertRowid };
    }
    
    const msgResult = await db.prepare('INSERT INTO messages (conversation_id, sender, content, type, platform) VALUES (?, ?, ?, ?, ?)')
      .run(conversation.id, 'agent', text, 'text', platform);
    
    await db.prepare('UPDATE conversations SET last_message_at = CURRENT_TIMESTAMP WHERE id = ?').run(conversation.id);

    io.emit('new_message', {
      id: msgResult.lastInsertRowid,
      conversation_id: conversation.id,
      sender: 'agent',
      content: text,
      type: 'text',
      platform,
      created_at: new Date().toISOString()
    });

    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Failed to send social message' });
  }
});

// Mock Incoming Social Messages
// --- Background Tasks ---
const runAutomatedTraining = async () => {
  try {
    console.log('Running automated agent training...');
    const agents = await db.prepare('SELECT id FROM agents').all() as any[];
    for (const agent of agents) {
      const sessions = await db.prepare('SELECT id FROM whatsapp_sessions WHERE agent_id = ?').all(agent.id) as any[];
      const sessionIds = sessions.map(s => s.id);
      if (sessionIds.length === 0) continue;

      const placeholders = sessionIds.map(() => '?').join(',');
      const messages = await db.prepare(`
        SELECT m.content 
        FROM messages m
        JOIN conversations c ON m.conversation_id = c.id
        WHERE c.session_id IN (${placeholders})
        ORDER BY m.created_at DESC
        LIMIT 50
      `).all(...sessionIds) as any[];

      if (messages.length > 0) {
        const historyContent = messages.map(m => m.content).join('\n');
        await db.prepare('INSERT INTO training_files (agent_id, filename, original_name, content) VALUES (?, ?, ?, ?)')
          .run(agent.id, `auto_train_${Date.now()}.txt`, 'Automated History Training', historyContent);
        
        // Keep only last 5 auto-train files per agent to avoid bloat
        const oldFiles = await db.prepare('SELECT id FROM training_files WHERE agent_id = ? AND original_name = ? ORDER BY id DESC LIMIT 100 OFFSET 5')
          .all(agent.id, 'Automated History Training') as any[];
        if (oldFiles.length > 0) {
          const oldIds = oldFiles.map(f => f.id).join(',');
          await db.prepare(`DELETE FROM training_files WHERE id IN (${oldIds})`).run();
        }
      }
    }
  } catch (error) {
    console.error('Automated training error:', error);
  }
};

// Run training every 12 hours
setInterval(runAutomatedTraining, 12 * 60 * 60 * 1000);
// Run once on startup after a short delay
setTimeout(runAutomatedTraining, 60000);

const simulateIncomingSocialMessages = async () => {
  try {
    const accounts = await db.prepare('SELECT * FROM social_accounts').all() as any[];
    if (accounts.length === 0) return;

    // 10% chance to receive a message every 30 seconds
    if (Math.random() > 0.1) return;

    const account = accounts[Math.floor(Math.random() * accounts.length)];
    const mockContacts = [
      { number: 'user_123', name: 'John Doe' },
      { number: 'user_456', name: 'Jane Smith' },
      { number: 'user_789', name: 'Alex Brown' }
    ];
    const contact = mockContacts[Math.floor(Math.random() * mockContacts.length)];
    const messages = [
      "Hi, I'm interested in your services!",
      "How much does it cost?",
      "Can you help me with my website?",
      "Is the bot active?",
      "Hello from Facebook!",
      "I saw your post on Instagram."
    ];
    const text = messages[Math.floor(Math.random() * messages.length)];

    // Find or create conversation
    let conversation = await db.prepare('SELECT * FROM conversations WHERE platform = ? AND contact_number = ?')
      .get(account.platform, contact.number) as any;
    
    if (!conversation) {
      const convResult = await db.prepare('INSERT INTO conversations (platform, contact_number, contact_name, session_id) VALUES (?, ?, ?, ?)')
        .run(account.platform, contact.number, contact.name, 0);
      conversation = { id: convResult.lastInsertRowid };
    }

    const msgResult = await db.prepare('INSERT INTO messages (conversation_id, sender, content, type, platform) VALUES (?, ?, ?, ?, ?)')
      .run(conversation.id, 'user', text, 'text', account.platform);

    await db.prepare('UPDATE conversations SET last_message_at = CURRENT_TIMESTAMP, unread_count = unread_count + 1 WHERE id = ?')
      .run(conversation.id);

    io.emit('new_message', {
      id: msgResult.lastInsertRowid,
      conversation_id: conversation.id,
      sender: 'user',
      content: text,
      type: 'text',
      platform: account.platform,
      created_at: new Date().toISOString()
    });

    console.log(`Mock incoming ${account.platform} message from ${contact.name}: ${text}`);
  } catch (error) {
    // Silently fail for mock simulation
  }
};

setInterval(simulateIncomingSocialMessages, 30000);

// --- Audit Status Routes ---
app.post('/api/conversations/:id/audit', authenticateToken, async (req: any, res) => {
  const { status } = req.body;
  try {
    await db.prepare('UPDATE conversations SET audit_status = ? WHERE id = ?').run(status, req.params.id);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Failed to update audit status' });
  }
});

app.post('/api/conversations/batch-audit', authenticateToken, async (req: any, res) => {
  const { ids, status } = req.body;
  try {
    const placeholders = ids.map(() => '?').join(',');
    await db.prepare(`UPDATE conversations SET audit_status = ? WHERE id IN (${placeholders})`).run(status, ...ids);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Failed to update batch audit status' });
  }
});

app.patch('/api/conversations/:id/objective', authenticateToken, async (req, res) => {
  const { objective, objective_progress } = req.body;
  const updates: string[] = [];
  const params: any[] = [];

  if (objective !== undefined) {
    updates.push('objective = ?');
    params.push(objective);
  }
  if (objective_progress !== undefined) {
    updates.push('objective_progress = ?');
    params.push(objective_progress);
  }

  if (updates.length === 0) return res.status(400).json({ error: 'No objective data provided' });

  params.push(req.params.id);
  await db.prepare(`UPDATE conversations SET ${updates.join(', ')} WHERE id = ?`).run(...params);
  res.json({ success: true });
});

app.put('/api/conversations/:id/labels', authenticateToken, async (req, res) => {
  const { labels } = req.body;
  try {
    await db.prepare('UPDATE conversations SET labels = ? WHERE id = ?').run(JSON.stringify(labels), req.params.id);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Failed to update labels' });
  }
});

app.get('/api/dashboard/stats', authenticateToken, async (req: any, res) => {
  try {
    const userId = req.user.id;
    const now = new Date();
    const firstDayCurrentMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
    const firstDayLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1).toISOString();
    
    const [
      currentLeads, lastLeads,
      currentQualified, lastQualified,
      currentConversions, lastConversions,
      messages,
      campaigns,
      customers
    ] = await Promise.all([
      db.prepare('SELECT COUNT(*) as count FROM leads WHERE user_id = ?').get(userId),
      db.prepare('SELECT COUNT(*) as count FROM leads WHERE user_id = ? AND created_at < ?').get(userId, firstDayCurrentMonth),
      db.prepare("SELECT COUNT(*) as count FROM leads WHERE user_id = ? AND status = 'Qualified'").get(userId),
      db.prepare("SELECT COUNT(*) as count FROM leads WHERE user_id = ? AND status = 'Qualified' AND qualified_at < ?").get(userId, firstDayCurrentMonth),
      db.prepare("SELECT COUNT(*) as count FROM leads WHERE user_id = ? AND status = 'Final Customer'").get(userId),
      db.prepare("SELECT COUNT(*) as count FROM leads WHERE user_id = ? AND status = 'Final Customer' AND updated_at < ?").get(userId, firstDayCurrentMonth),
      db.prepare('SELECT SUM(unread_count) as count FROM conversations c JOIN whatsapp_sessions s ON c.session_id = s.id WHERE s.user_id = ?').get(userId),
      db.prepare("SELECT COUNT(*) as count FROM bulk_campaigns WHERE user_id = ? AND status = 'processing'").get(userId),
      db.prepare("SELECT COUNT(*) as count FROM leads WHERE user_id = ? AND status = 'Final Customer'").get(userId),
    ]);

    const calculateGrowth = (current: number, totalBefore: number) => {
      if (totalBefore === 0) return current > 0 ? 100 : 0;
      const currentMonthAdded = current - totalBefore;
      // This is a bit tricky without full history, let's just compare "added this month" vs "added last month" if possible
      // For now, let's do a simple (current - last) / last * 100
      return parseFloat(((currentMonthAdded / (totalBefore || 1)) * 100).toFixed(1));
    };

    res.json({
      totalLeads: currentLeads.count || 0,
      qualifiedLeads: currentQualified.count || 0,
      conversions: currentConversions.count || 0,
      inboxMessages: messages.count || 0,
      activeCampaigns: campaigns.count || 0,
      totalCustomers: customers.count || 0,
      growth: {
        leads: calculateGrowth(currentLeads.count, lastLeads.count),
        qualified: calculateGrowth(currentQualified.count, lastQualified.count),
        conversions: calculateGrowth(currentConversions.count, lastConversions.count),
        messages: 0,
        campaigns: 0,
        customers: calculateGrowth(customers.count, lastConversions.count)
      }
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch dashboard stats' });
  }
});

app.get('/api/dashboard/chart-data', authenticateToken, async (req: any, res) => {
  try {
    const userId = req.user.id;
    const months = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date();
      d.setMonth(d.getMonth() - i);
      months.push({
        name: d.toLocaleString('default', { month: 'short' }),
        month: d.getMonth() + 1,
        year: d.getFullYear()
      });
    }

    const chartData = await Promise.all(months.map(async (m) => {
      const start = new Date(m.year, m.month - 1, 1).toISOString();
      const end = new Date(m.year, m.month, 0, 23, 59, 59).toISOString();
      
      const leads = await db.prepare('SELECT COUNT(*) as count FROM leads WHERE user_id = ? AND created_at BETWEEN ? AND ?').get(userId, start, end);
      const conversions = await db.prepare("SELECT COUNT(*) as count FROM leads WHERE user_id = ? AND status = 'Final Customer' AND updated_at BETWEEN ? AND ?").get(userId, start, end);
      
      return {
        name: m.name,
        leads: leads.count || 0,
        conversions: conversions.count || 0
      };
    }));

    res.json(chartData);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch chart data' });
  }
});

app.get('/api/activities', authenticateToken, async (req: any, res) => {
  try {
    const userId = req.user.id;
    const activities = await db.prepare('SELECT * FROM activities WHERE user_id = ? ORDER BY created_at DESC LIMIT 20').all(userId);
    res.json(activities);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch activities' });
  }
});

app.get('/api/system/status', authenticateToken, async (req: any, res) => {
  try {
    const userId = req.user.id;
    const sessions = await db.prepare('SELECT status FROM whatsapp_sessions WHERE user_id = ?').all(userId) as any[];
    
    const apiStatus = process.env.GEMINI_API_KEY ? 'Stable' : 'Error';
    const webStatus = sessions.some(s => s.status === 'connected') ? 'Web Session Active' : 'Disconnected';
    
    res.json({
      api: {
        label: 'API Connection',
        status: apiStatus,
        variant: apiStatus === 'Stable' ? 'success' : 'error'
      },
      web: {
        label: 'WhatsApp Protocol',
        status: webStatus,
        variant: webStatus === 'Web Session Active' ? 'success' : 'warning'
      },
      voice: {
        label: 'Voice Service',
        status: 'Stable',
        variant: 'success'
      }
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch system status' });
  }
});

app.post('/api/system/reset-database', authenticateToken, async (req: any, res) => {
  const { confirmation } = req.body;
  
  if (confirmation !== 'reset') {
    return res.status(400).json({ error: 'Invalid confirmation string' });
  }

  try {
    const tables = [
      'activities', 'opt_ins', 'blacklist', 'campaign_configs', 'campaign_history',
      'social_accounts', 'user_websites', 'settings', 'training_files', 'agent_rules',
      'bulk_recipients', 'bulk_campaigns', 'messages', 'leads', 'conversations',
      'whatsapp_sessions', 'agents', 'users'
    ];

    if (isMySQL) {
      await db.exec('SET FOREIGN_KEY_CHECKS = 0');
      for (const table of tables) {
        try {
          await db.exec(`TRUNCATE TABLE ${table}`);
        } catch (e) {
          console.warn(`Failed to truncate table ${table}:`, e);
        }
      }
      await db.exec('SET FOREIGN_KEY_CHECKS = 1');
    } else {
      await db.exec('PRAGMA foreign_keys = OFF');
      for (const table of tables) {
        try {
          await db.prepare(`DELETE FROM ${table}`).run();
          await db.prepare(`DELETE FROM sqlite_sequence WHERE name = ?`).run(table);
        } catch (e) {
          console.warn(`Failed to clear table ${table}:`, e);
        }
      }
      await db.exec('PRAGMA foreign_keys = ON');
    }

    // Re-initialize database (this will re-create the default user)
    await initDb();

    res.json({ success: true, message: 'Database reset successfully. You will be logged out.' });
  } catch (error) {
    console.error('Database reset failed:', error);
    res.status(500).json({ error: 'Failed to reset database' });
  }
});

app.get('/api/conversations/:id/messages', authenticateToken, async (req, res) => {
  const messages = await db.prepare('SELECT * FROM messages WHERE conversation_id = ? ORDER BY created_at ASC').all(req.params.id);
  
  // Reset unread count when messages are fetched
  await db.prepare('UPDATE conversations SET unread_count = 0 WHERE id = ?').run(req.params.id);
  io.emit('unread_reset', { conversationId: req.params.id });
  
  res.json(messages);
});

app.post('/api/conversations/:id/messages', authenticateToken, upload.single('file'), async (req: any, res) => {
  const conversationId = req.params.id;
  const { content, type } = req.body;
  const file = req.file;

  try {
    const conversation = await db.prepare('SELECT * FROM conversations WHERE id = ?').get(conversationId) as any;
    if (!conversation) return res.status(404).json({ error: 'Conversation not found' });

    const sock = getSession(conversation.session_id.toString());
    if (!sock) return res.status(500).json({ error: 'WhatsApp session not connected' });

    let messageOptions: any = {};
    if (file) {
      const filePath = path.join(process.cwd(), 'uploads', file.filename);
      const fileBuffer = fs.readFileSync(filePath);
      const mimeType = file.mimetype;

      if (mimeType.startsWith('image/')) {
        messageOptions = { image: fileBuffer, caption: content };
      } else if (mimeType.startsWith('video/')) {
        messageOptions = { video: fileBuffer, caption: content };
      } else if (mimeType.startsWith('audio/')) {
        messageOptions = { audio: fileBuffer, ptt: mimeType.includes('ogg') };
      } else {
        messageOptions = { document: fileBuffer, fileName: file.originalname, caption: content, mimetype: mimeType };
      }
    } else {
      messageOptions = { text: content };
    }

    await sock.sendMessage(conversation.contact_number, messageOptions);

    const timestamp = new Date().toISOString();
    const msgResult = await db.prepare('INSERT INTO messages (conversation_id, sender, content, type, created_at, is_followup) VALUES (?, ?, ?, ?, ?, ?)')
      .run(conversationId, 'agent', content || (file ? file.originalname : ''), type || 'text', timestamp, 0);

    await db.prepare('UPDATE conversations SET last_message_at = ? WHERE id = ?').run(timestamp, conversationId);

    const newMessage = {
      id: msgResult.lastInsertRowid,
      conversation_id: conversationId,
      sender: 'agent',
      content: content || (file ? file.originalname : ''),
      type: type || 'text',
      created_at: timestamp
    };

    io.emit('new_message', newMessage);
    res.json(newMessage);
  } catch (error: any) {
    console.error('Failed to send manual message:', error);
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/leads/:id/followups', authenticateToken, async (req: any, res) => {
  try {
    const lead = await db.prepare('SELECT conversation_id FROM leads WHERE id = ?').get(req.params.id) as any;
    if (!lead) return res.status(404).json({ error: 'Lead not found' });

    // Fetch last 3 messages from agent that are marked as follow-ups
    const followups = await db.prepare(`
      SELECT * FROM messages 
      WHERE conversation_id = ? AND sender = 'agent' AND is_followup = 1
      ORDER BY created_at DESC 
      LIMIT 3
    `).all(lead.conversation_id);

    res.json(followups);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch follow-ups' });
  }
});

app.put('/api/conversations/:id/flags', authenticateToken, async (req, res) => {
  const { is_saved, is_ordered, is_rated, is_audited, is_autopilot } = req.body;
  const updates: string[] = [];
  const params: any[] = [];

  if (is_saved !== undefined) {
    updates.push('is_saved = ?');
    params.push(is_saved ? 1 : 0);
  }
  if (is_ordered !== undefined) {
    updates.push('is_ordered = ?');
    params.push(is_ordered ? 1 : 0);
  }
  if (is_rated !== undefined) {
    updates.push('is_rated = ?');
    params.push(is_rated ? 1 : 0);
  }
  if (is_audited !== undefined) {
    updates.push('is_audited = ?');
    params.push(is_audited ? 1 : 0);
  }
  if (is_autopilot !== undefined) {
    updates.push('is_autopilot = ?');
    params.push(is_autopilot ? 1 : 0);
  }

  if (updates.length === 0) return res.status(400).json({ error: 'No flags provided' });

  params.push(req.params.id);
  await db.prepare(`UPDATE conversations SET ${updates.join(', ')} WHERE id = ?`).run(...params);
  res.json({ success: true });
});

// --- Background Reminder Job ---
async function checkReminders() {
  console.log('Running background reminder check...');
  try {
    // Query conversations that need a reminder
    // SQLite compatible date format (YYYY-MM-DD HH:MM:SS)
    const threeDaysAgo = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString().replace('T', ' ').split('.')[0];
    const conversations = await db.prepare(`
      SELECT c.*, ws.id as session_id_val
      FROM conversations c
      JOIN whatsapp_sessions ws ON c.session_id = ws.id
      JOIN users u ON ws.user_id = u.id
      WHERE c.is_saved = 0 
        AND (c.is_ordered = 1 OR c.is_audited = 1)
        AND c.is_rated = 1
        AND (c.contact_name IS NULL OR LOWER(c.contact_name) NOT LIKE '%client%')
        AND ws.status = 'connected'
        AND u.is_global_autopilot = 1 -- Global Autopilot must be ON
        AND c.is_autopilot = 1 -- STRICTLY Autopilot only
        AND (c.last_message_at < ? OR c.last_message_at IS NULL)
        AND (c.last_reminder_sent_at IS NULL OR c.last_reminder_sent_at < ?)
    `).all(threeDaysAgo, threeDaysAgo) as any[];

    console.log(`Found ${conversations.length} conversations needing reminders`);

    for (const conv of conversations) {
      const sock = getSession(conv.session_id_val.toString());
      if (!sock) continue;

      const reminderText = "Hi! We noticed it's been a few days since our last chat. What are your thoughts on our website? Also, which service are you interested in and when do you plan to avail it? We'd love to help you further!";
      
      try {
        await sock.sendMessage(conv.contact_number, { text: reminderText });
        
        // Save reminder to DB
        await db.prepare('INSERT INTO messages (conversation_id, sender, content, type) VALUES (?, ?, ?, ?)')
          .run(conv.id, 'agent', reminderText, 'text');
        
        await db.prepare('UPDATE conversations SET last_message_at = CURRENT_TIMESTAMP, last_reminder_sent_at = CURRENT_TIMESTAMP WHERE id = ?')
          .run(conv.id);

        console.log(`Sent reminder to ${conv.contact_number}`);
        
        // Emit to UI
        io.emit('new_message', {
          conversation_id: conv.id,
          sender: 'agent',
          content: reminderText,
          type: 'text',
          created_at: new Date().toISOString(),
          is_saved: conv.is_saved,
          is_ordered: conv.is_ordered,
          is_rated: conv.is_rated,
          is_audited: conv.is_audited
        });

        // Small delay between reminders to avoid rate limiting
        await new Promise(resolve => setTimeout(resolve, 5000));
      } catch (error) {
        console.error(`Failed to send reminder to ${conv.contact_number}:`, error);
      }
    }
  } catch (error) {
    console.error('Error in checkReminders job:', error);
  }
}

// Run every hour
setInterval(checkReminders, 60 * 60 * 1000);
// Also run once on startup after a short delay
setTimeout(checkReminders, 30000);

// --- Lead Follow-up Job ---
async function checkLeadFollowups() {
  console.log('Running background lead follow-up check...');
  try {
    // SQLite compatible date format (YYYY-MM-DD HH:MM:SS)
    const threeDaysAgo = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString().replace('T', ' ').split('.')[0];
    
    // 1. Handle leads that reached max follow-ups without reply
    await db.prepare(`
      UPDATE leads 
      SET status = 'Not Interested' 
      WHERE status = 'Qualified' 
      AND followup_count >= 3
      AND (last_followup_at < ? OR (last_followup_at IS NULL AND created_at < ?))
    `).run(threeDaysAgo, threeDaysAgo);

    // 2. Find Qualified leads needing follow-up
    const leads = await db.prepare(`
      SELECT l.*, c.contact_number, c.session_id, c.id as conv_id, ws.user_id as user_id_val
      FROM leads l
      JOIN conversations c ON l.conversation_id = c.id
      JOIN whatsapp_sessions ws ON c.session_id = ws.id
      JOIN users u ON ws.user_id = u.id
      WHERE l.status = 'Qualified'
      AND l.followup_count < 3
      AND (l.last_followup_at IS NULL OR l.last_followup_at < ?)
      AND (l.last_followup_at IS NULL AND l.created_at < ? OR l.last_followup_at IS NOT NULL)
      AND ws.status = 'connected'
      AND u.is_global_autopilot = 1
      AND c.is_autopilot = 1
    `).all(threeDaysAgo, threeDaysAgo) as any[];

    console.log(`Found ${leads.length} qualified leads needing follow-up`);

    for (const lead of leads) {
      // Check blacklist
      const isBlacklisted = await db.prepare('SELECT id FROM blacklist WHERE user_id = ? AND number = ?').get(lead.user_id_val, lead.contact_number);
      if (isBlacklisted) continue;

      // Check daily limit for user
      const today = new Date().toISOString().split('T')[0];
      const sentToday = await db.prepare(`
        SELECT COUNT(*) as count FROM messages m
        JOIN conversations c ON m.conversation_id = c.id
        JOIN whatsapp_sessions ws ON c.session_id = ws.id
        WHERE ws.user_id = ? AND m.sender = 'agent' AND m.created_at LIKE ?
      `).get(lead.user_id_val, `${today}%`) as any;

      const config = await db.prepare('SELECT daily_message_limit, min_delay, max_delay FROM campaign_configs WHERE user_id = ?').get(lead.user_id_val) as any;
      if (config && sentToday.count >= config.daily_message_limit) {
        console.log(`User ${lead.user_id_val} reached daily message limit (${config.daily_message_limit})`);
        continue;
      }

      const sock = getSession(lead.session_id.toString());
      if (!sock) continue;

      try {
        // Get conversation history for AI
        const messages = await db.prepare('SELECT * FROM messages WHERE conversation_id = ? ORDER BY created_at ASC').all(lead.conv_id) as any[];
        
        // Generate personalized follow-up
        const followupText = await generateFollowupMessage(lead.user_id_val, lead.name || lead.contact_name || 'there', messages);
        
        await sock.sendMessage(lead.contact_number, { text: followupText });

        // Save to messages
        const timestamp = new Date().toISOString();
        await db.prepare('INSERT INTO messages (conversation_id, sender, content, type, created_at) VALUES (?, ?, ?, ?, ?)')
          .run(lead.conv_id, 'agent', followupText, 'text', timestamp);

        // Update lead
        await db.prepare(`
          UPDATE leads 
          SET followup_count = followup_count + 1, 
              last_followup_at = ?, 
              updated_at = ? 
          WHERE id = ?
        `).run(timestamp, timestamp, lead.id);

        console.log(`Sent automated follow-up to ${lead.contact_number} (Count: ${lead.followup_count + 1})`);

        // Emit to UI
        io.emit('new_message', {
          conversation_id: lead.conv_id,
          sender: 'agent',
          content: followupText,
          type: 'text',
          created_at: timestamp
        });

        // Delay based on config
        const delay = config ? Math.floor(Math.random() * (config.max_delay - config.min_delay + 1) + config.min_delay) * 1000 : 5000;
        await new Promise(resolve => setTimeout(resolve, delay));
      } catch (error) {
        console.error(`Failed to send automated follow-up to ${lead.contact_number}:`, error);
      }
    }
  } catch (error) {
    console.error('Error in checkLeadFollowups job:', error);
  }
}

// Run every 4 hours
setInterval(checkLeadFollowups, 4 * 60 * 60 * 1000);
// Also run once on startup
setTimeout(checkLeadFollowups, 45000);

app.post('/api/whatsapp/send', authenticateToken, upload.single('file'), async (req, res) => {
  const { sessionId, jid, text, type } = req.body;
  const sock = getSession(sessionId);

  if (!sock) {
    return res.status(404).json({ error: 'Session not found or not connected' });
  }

  try {
    let messageOptions: any = {};
    if (type === 'text') {
      messageOptions = { text };
    } else if (req.file) {
      const buffer = fs.readFileSync(req.file.path);
      if (type === 'image') {
        messageOptions = { image: buffer, caption: text };
      } else if (type === 'video') {
        messageOptions = { video: buffer, caption: text };
      } else if (type === 'audio') {
        messageOptions = { audio: buffer, mimetype: req.file.mimetype };
      } else if (type === 'document') {
        messageOptions = { document: buffer, mimetype: req.file.mimetype, fileName: req.file.originalname };
      }
      // Clean up uploaded file
      fs.unlinkSync(req.file.path);
    }

    const result = await sock.sendMessage(jid, messageOptions);
    
    // Save to DB
    let conversation = await db.prepare('SELECT * FROM conversations WHERE session_id = ? AND contact_number = ?').get(sessionId, jid) as any;
    if (!conversation) {
      const convResult = await db.prepare('INSERT INTO conversations (session_id, contact_number) VALUES (?, ?)').run(sessionId, jid);
      conversation = { id: convResult.lastInsertRowid };
    }
    
    const msgResult = await db.prepare('INSERT INTO messages (conversation_id, sender, content, type) VALUES (?, ?, ?, ?)')
      .run(conversation.id, 'agent', text || `[${type}]`, type);
    const messageId = msgResult.lastInsertRowid;
    
    await db.prepare('UPDATE conversations SET last_message_at = CURRENT_TIMESTAMP WHERE id = ?').run(conversation.id);

    // Emit event for real-time updates
    io.emit('new_message', {
      id: messageId,
      conversation_id: conversation.id,
      sender: 'agent',
      content: text || `[${type}]`,
      type,
      created_at: new Date().toISOString(),
      is_saved: conversation.is_saved,
      is_ordered: conversation.is_ordered,
      is_rated: conversation.is_rated,
      is_audited: conversation.is_audited
    });

    res.json({ success: true, result });
  } catch (error) {
    console.error('Failed to send message:', error);
    res.status(500).json({ error: 'Failed to send message' });
  }
});

// --- Leads Routes ---
app.get('/api/leads', authenticateToken, async (req: any, res) => {
  try {
    const leads = await db.prepare(`
      SELECT l.*, c.contact_number, c.contact_name, c.labels, c.audit_status, c.is_ordered, c.is_saved, c.is_audited
      FROM leads l
      JOIN conversations c ON l.conversation_id = c.id
      WHERE l.user_id = ?
      ORDER BY l.created_at DESC
    `).all(req.user.id) as any[];
    
    // Parse labels JSON
    const parsedLeads = leads.map(l => ({
      ...l,
      labels: l.labels ? JSON.parse(l.labels) : []
    }));

    // Mark leads as not new after they've been fetched
    await db.prepare('UPDATE leads SET is_new = 0 WHERE user_id = ?').run(req.user.id);
    
    res.json(parsedLeads);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch leads' });
  }
});

app.get('/api/leads/stats', authenticateToken, async (req: any, res) => {
  try {
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const stats = await db.prepare(`
      SELECT 
        COUNT(*) as total,
        SUM(CASE WHEN is_new = 1 THEN 1 ELSE 0 END) as new_count,
        SUM(CASE WHEN created_at > ? THEN 1 ELSE 0 END) as recent_count
      FROM leads
      WHERE user_id = ?
    `).get(oneDayAgo, req.user.id);
    res.json(stats);
  } catch (error) {
    console.error('Failed to fetch lead stats:', error);
    res.status(500).json({ error: 'Failed to fetch lead stats' });
  }
});

app.patch('/api/leads/:id', authenticateToken, async (req: any, res) => {
  const { status } = req.body;
  try {
    await db.prepare('UPDATE leads SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND user_id = ?').run(status, req.params.id, req.user.id);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Failed to update lead' });
  }
});

app.get('/api/leads/export', authenticateToken, async (req: any, res) => {
  try {
    const requestedColumns = req.query.columns ? (req.query.columns as string).split(',') : ['name', 'email', 'website', 'source', 'status', 'date', 'number'];
    
    const leads = await db.prepare(`
      SELECT l.name, l.email, l.website, l.source, l.status, l.created_at, c.contact_number
      FROM leads l
      JOIN conversations c ON l.conversation_id = c.id
      WHERE l.user_id = ?
      ORDER BY l.created_at DESC
    `).all(req.user.id) as any[];

    const headerMap: { [key: string]: string } = {
      name: 'Name',
      email: 'Email',
      website: 'Website',
      source: 'Source',
      status: 'Status',
      date: 'Date Added',
      number: 'WhatsApp Number'
    };

    const headers = requestedColumns.map(col => headerMap[col] || col).join(',');
    const csvRows = [headers];

    for (const lead of leads) {
      const row = requestedColumns.map(col => {
        let value = '';
        switch (col) {
          case 'name': value = lead.name || ''; break;
          case 'email': value = lead.email || ''; break;
          case 'website': value = lead.website || ''; break;
          case 'source': value = lead.source || ''; break;
          case 'status': value = lead.status || ''; break;
          case 'date': value = lead.created_at || ''; break;
          case 'number': value = lead.contact_number || ''; break;
        }
        return `"${value.toString().replace(/"/g, '""')}"`;
      }).join(',');
      csvRows.push(row);
    }

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename=leads_export.csv');
    res.send(csvRows.join('\n'));
  } catch (error) {
    console.error('Export failed:', error);
    res.status(500).json({ error: 'Failed to export leads' });
  }
});

// --- Bulk Messaging Routes ---
app.get('/api/bulk/campaigns', authenticateToken, async (req: any, res) => {
  try {
    const campaigns = await db.prepare('SELECT * FROM bulk_campaigns WHERE user_id = ? ORDER BY created_at DESC').all(req.user.id);
    res.json(campaigns);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch bulk campaigns' });
  }
});

app.post('/api/bulk/campaigns', authenticateToken, async (req: any, res) => {
  const { name, message, recipients, scheduled_at } = req.body;
  try {
    const result = await db.prepare(`
      INSERT INTO bulk_campaigns (user_id, name, message, total_recipients, scheduled_at) 
      VALUES (?, ?, ?, ?, ?)
    `).run(req.user.id, name, message, recipients.length, scheduled_at || null);
    
    const campaignId = result.lastInsertRowid;

    const insertRecipient = await db.prepare('INSERT INTO bulk_recipients (campaign_id, number) VALUES (?, ?)');
    for (const number of recipients) {
      await insertRecipient.run(campaignId, number);
    }

    if (!scheduled_at) {
      // Start background processing if not scheduled for later
      processBulkCampaign(campaignId as number);
    }

    res.json({ id: campaignId });
  } catch (error) {
    console.error('Failed to create bulk campaign:', error);
    res.status(500).json({ error: 'Failed to create bulk campaign' });
  }
});

async function processBulkCampaign(campaignId: number) {
  const campaign = await db.prepare('SELECT * FROM bulk_campaigns WHERE id = ?').get(campaignId) as any;
  if (!campaign) return;

  const recipients = await db.prepare('SELECT * FROM bulk_recipients WHERE campaign_id = ? AND status = ?').all(campaignId, 'pending') as any[];
  
  // Get first available connected session for this user
  const session = await db.prepare('SELECT * FROM whatsapp_sessions WHERE user_id = ? AND status = ? LIMIT 1').get(campaign.user_id, 'connected') as any;
  if (!session) {
    console.error(`No connected WhatsApp session for user ${campaign.user_id}`);
    await db.prepare('UPDATE bulk_campaigns SET status = ? WHERE id = ?').run('failed', campaignId);
    return;
  }

  const sock = getSession(session.id.toString());
  if (!sock) return;

  await db.prepare('UPDATE bulk_campaigns SET status = ? WHERE id = ?').run('processing', campaignId);

  const config = await db.prepare('SELECT daily_message_limit, min_delay, max_delay FROM campaign_configs WHERE user_id = ?').get(campaign.user_id) as any;

  for (const recipient of recipients) {
    try {
      // Check daily limit
      const today = new Date().toISOString().split('T')[0];
      const sentToday = await db.prepare(`
        SELECT COUNT(*) as count FROM messages m
        JOIN conversations c ON m.conversation_id = c.id
        JOIN whatsapp_sessions ws ON c.session_id = ws.id
        WHERE ws.user_id = ? AND m.sender = 'agent' AND m.created_at LIKE ?
      `).get(campaign.user_id, `${today}%`) as any;

      if (config && sentToday.count >= config.daily_message_limit) {
        console.log(`User ${campaign.user_id} reached daily message limit during bulk campaign. Pausing.`);
        await db.prepare('UPDATE bulk_campaigns SET status = ? WHERE id = ?').run('paused', campaignId);
        break;
      }

      const jid = `${recipient.number}@s.whatsapp.net`;
      await sock.sendMessage(jid, { text: campaign.message });
      
      const timestamp = new Date().toISOString();
      await db.prepare('UPDATE bulk_recipients SET status = ?, sent_at = ? WHERE id = ?').run('sent', timestamp, recipient.id);
      await db.prepare('UPDATE bulk_campaigns SET sent_count = sent_count + 1 WHERE id = ?').run(campaignId);
      
      // Delay based on config
      const delay = config ? Math.floor(Math.random() * (config.max_delay - config.min_delay + 1) + config.min_delay) * 1000 : 10000;
      await new Promise(resolve => setTimeout(resolve, delay));
    } catch (error) {
      console.error(`Failed to send bulk message to ${recipient.number}:`, error);
      await db.prepare('UPDATE bulk_recipients SET status = ? WHERE id = ?').run('failed', recipient.id);
      await db.prepare('UPDATE bulk_campaigns SET failed_count = failed_count + 1 WHERE id = ?').run(campaignId);
    }
  }

  const updatedCampaign = await db.prepare('SELECT * FROM bulk_campaigns WHERE id = ?').get(campaignId) as any;
  if (updatedCampaign.sent_count + updatedCampaign.failed_count >= updatedCampaign.total_recipients) {
    await db.prepare('UPDATE bulk_campaigns SET status = ? WHERE id = ?').run('completed', campaignId);
  }
}

// --- Campaign Config Routes ---
app.get('/api/campaign/config', authenticateToken, async (req: any, res) => {
  try {
    let config = await db.prepare('SELECT * FROM campaign_configs WHERE user_id = ?').get(req.user.id) as any;
    const defaultAutomationRules = {
      new: { enabled: true, template: 'Hi {Name}, thanks for reaching out!' },
      contacted: { trigger: ['User Replied'], template: 'Hi {Name}, I saw you replied. How can I help?' },
      qualified: { template: 'Here is your audit, {Name}!' },
      final: { template: 'Welcome aboard, {Name}!', access: ['Hosting Access'] },
      not_interested: { blacklist: true, stop: true }
    };

    if (!config) {
      // Create default config
      const result = await db.prepare(`
        INSERT INTO campaign_configs (user_id, business_name, service_type, primary_offer, automation_rules)
        VALUES (?, ?, ?, ?, ?)
      `).run(req.user.id, '', 'SEO Services', '', JSON.stringify(defaultAutomationRules));
      config = await db.prepare('SELECT * FROM campaign_configs WHERE id = ?').get(result.lastInsertRowid);
    }
    
    let automationRules = config.automation_rules ? JSON.parse(config.automation_rules) : {};
    
    // Deep merge with defaults to ensure all keys and sub-keys exist
    const mergedRules = { ...defaultAutomationRules };
    for (const key in defaultAutomationRules) {
      if (automationRules[key]) {
        mergedRules[key] = { ...defaultAutomationRules[key], ...automationRules[key] };
      }
    }
    
    res.json({ ...config, automation_rules: mergedRules });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch campaign config' });
  }
});

app.post('/api/campaign/config', authenticateToken, async (req: any, res) => {
  const { business_name, service_type, primary_offer, daily_message_limit, min_delay, max_delay, max_followups, stop_if_no_reply, enable_ai_rewriting, ai_tone, user_consent_required, automation_rules } = req.body;
  try {
    const existing = await db.prepare('SELECT id FROM campaign_configs WHERE user_id = ?').get(req.user.id);
    if (existing) {
      await db.prepare(`
        UPDATE campaign_configs SET 
          business_name = ?, service_type = ?, primary_offer = ?, 
          daily_message_limit = ?, min_delay = ?, max_delay = ?, 
          max_followups = ?, stop_if_no_reply = ?, enable_ai_rewriting = ?, 
          ai_tone = ?, user_consent_required = ?, automation_rules = ?,
          updated_at = CURRENT_TIMESTAMP
        WHERE user_id = ?
      `).run(
        business_name, service_type, primary_offer, 
        daily_message_limit, min_delay, max_delay, 
        max_followups, stop_if_no_reply, enable_ai_rewriting, 
        ai_tone, user_consent_required, JSON.stringify(automation_rules),
        req.user.id
      );
    } else {
      await db.prepare(`
        INSERT INTO campaign_configs (
          user_id, business_name, service_type, primary_offer, 
          daily_message_limit, min_delay, max_delay, 
          max_followups, stop_if_no_reply, enable_ai_rewriting, 
          ai_tone, user_consent_required, automation_rules
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        req.user.id, business_name, service_type, primary_offer, 
        daily_message_limit, min_delay, max_delay, 
        max_followups, stop_if_no_reply, enable_ai_rewriting, 
        ai_tone, user_consent_required, JSON.stringify(automation_rules)
      );
    }
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Failed to save campaign config' });
  }
});

// --- Blacklist Routes ---
app.get('/api/blacklist', authenticateToken, async (req: any, res) => {
  try {
    const list = await db.prepare('SELECT * FROM blacklist WHERE user_id = ? ORDER BY created_at DESC').all(req.user.id);
    res.json(list);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch blacklist' });
  }
});

app.post('/api/blacklist', authenticateToken, async (req: any, res) => {
  const { number, reason } = req.body;
  try {
    await db.prepare('INSERT OR REPLACE INTO blacklist (user_id, number, reason) VALUES (?, ?, ?)').run(req.user.id, number, reason);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Failed to add to blacklist' });
  }
});

app.delete('/api/blacklist/:number', authenticateToken, async (req: any, res) => {
  try {
    await db.prepare('DELETE FROM blacklist WHERE user_id = ? AND number = ?').run(req.user.id, req.params.number);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Failed to remove from blacklist' });
  }
});

// --- Opt-in Routes ---
app.get('/api/opt-ins', authenticateToken, async (req: any, res) => {
  try {
    const list = await db.prepare('SELECT * FROM opt_ins WHERE user_id = ? ORDER BY created_at DESC').all(req.user.id);
    res.json(list);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch opt-ins' });
  }
});

app.post('/api/opt-ins', authenticateToken, async (req: any, res) => {
  const { number, source } = req.body;
  try {
    await db.prepare('INSERT OR REPLACE INTO opt_ins (user_id, number, source) VALUES (?, ?, ?)').run(req.user.id, number, source);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Failed to add opt-in' });
  }
});

// --- Updated Campaign Leads Route ---
app.get('/api/campaigns/all-leads', authenticateToken, async (req: any, res) => {
  try {
    // Fetch all conversations as potential leads, joining with leads table for status
    const leads = await db.prepare(`
      SELECT 
        c.id as conversation_id,
        c.contact_number,
        c.contact_name,
        c.labels,
        c.audit_status,
        c.is_ordered,
        c.is_saved,
        c.is_audited,
        c.last_message_at,
        l.id as lead_id,
        l.name as lead_name,
        l.email,
        l.website,
        COALESCE(l.status, 'New') as status,
        COALESCE(l.created_at, c.last_message_at) as created_at
      FROM conversations c
      JOIN whatsapp_sessions ws ON c.session_id = ws.id
      LEFT JOIN leads l ON l.conversation_id = c.id
      WHERE ws.user_id = ?
      ORDER BY COALESCE(l.created_at, c.last_message_at) DESC
    `).all(req.user.id) as any[];
    
    // Map to the format expected by the frontend
    const formattedLeads = leads.map(l => ({
      id: l.lead_id || `conv-${l.conversation_id}`,
      name: l.lead_name || l.contact_name || 'Unknown',
      email: l.email,
      contact_number: l.contact_number,
      contact_name: l.contact_name,
      status: l.status,
      created_at: l.created_at,
      conversation_id: l.conversation_id,
      website: l.website
    }));

    res.json(formattedLeads);
  } catch (error) {
    console.error('Failed to fetch all leads:', error);
    res.status(500).json({ error: 'Failed to fetch leads' });
  }
});

// --- Campaign Routes ---
app.get('/api/campaigns/leads', authenticateToken, async (req: any, res) => {
  const { startDate, endDate } = req.query;
  if (!startDate || !endDate) {
    return res.status(400).json({ error: 'Please select a date range to view campaign data.' });
  }

  try {
    const leads = await db.prepare(`
      SELECT l.*, c.contact_number, c.contact_name, c.labels, c.audit_status, c.is_ordered, c.is_saved, c.is_audited
      FROM leads l
      JOIN conversations c ON l.conversation_id = c.id
      WHERE l.user_id = ? 
      AND l.status = 'Contacted'
      AND l.created_at >= ? AND l.created_at <= ?
      ORDER BY l.created_at DESC
    `).all(req.user.id, startDate, endDate) as any[];

    const parsedLeads = leads.map(l => ({
      ...l,
      labels: l.labels ? JSON.parse(l.labels) : []
    }));

    res.json(parsedLeads);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch campaign leads' });
  }
});

app.post('/api/campaigns/generate-followup', authenticateToken, async (req: any, res) => {
  const { leadId } = req.body;
  try {
    let conversationId: number;
    let leadName: string = 'there';

    if (typeof leadId === 'string' && leadId.startsWith('conv-')) {
      conversationId = parseInt(leadId.split('-')[1]);
      const conv = await db.prepare('SELECT contact_name FROM conversations WHERE id = ?').get(conversationId) as any;
      if (conv) leadName = conv.contact_name || 'there';
    } else {
      const lead = await db.prepare('SELECT * FROM leads WHERE id = ? AND user_id = ?').get(leadId, req.user.id) as any;
      if (!lead) return res.status(404).json({ error: 'Lead not found' });
      conversationId = lead.conversation_id;
      leadName = lead.name || lead.contact_name || 'there';
    }

    const messages = await db.prepare('SELECT * FROM messages WHERE conversation_id = ? ORDER BY created_at ASC').all(conversationId) as any[];
    
    const followup = await generateFollowupMessage(req.user.id, leadName, messages);
    res.json({ message: followup });
  } catch (error) {
    console.error('Failed to generate follow-up:', error);
    res.status(500).json({ error: 'Failed to generate follow-up' });
  }
});

app.post('/api/campaigns/send-followup', authenticateToken, upload.single('file'), async (req: any, res) => {
  const { leadId, message } = req.body;
  if (!leadId || !message) {
    return res.status(400).json({ error: 'Lead ID and message are required' });
  }

  try {
    let contactNumber: string;
    let sessionId: string;
    let conversationId: number;
    let actualLeadId: number | null = null;

    if (typeof leadId === 'string' && leadId.startsWith('conv-')) {
      conversationId = parseInt(leadId.split('-')[1]);
      const conv = await db.prepare('SELECT contact_number, session_id FROM conversations WHERE id = ?').get(conversationId) as any;
      if (!conv) return res.status(404).json({ error: 'Conversation not found' });
      contactNumber = conv.contact_number;
      sessionId = conv.session_id.toString();
    } else {
      const lead = await db.prepare(`
        SELECT l.*, c.contact_number, c.session_id 
        FROM leads l
        JOIN conversations c ON l.conversation_id = c.id
        WHERE l.id = ? AND l.user_id = ?
      `).get(leadId, req.user.id) as any;
      
      if (!lead) return res.status(404).json({ error: 'Lead not found' });
      contactNumber = lead.contact_number;
      sessionId = lead.session_id.toString();
      conversationId = lead.conversation_id;
      actualLeadId = lead.id;
    }

    const sock = getSession(sessionId);
    if (!sock) return res.status(400).json({ error: 'WhatsApp session not connected' });

    const jid = contactNumber.includes('@') ? contactNumber : `${contactNumber}@s.whatsapp.net`;
    
    let messageOptions: any = { text: message };
    let fileUrl = null;

    if (req.file) {
      const type = req.file.mimetype.startsWith('image/') ? 'image' : 'document';
      fileUrl = `/uploads/${req.file.filename}`;
      messageOptions = {
        [type]: { url: req.file.path },
        caption: message,
        fileName: req.file.originalname,
        mimetype: req.file.mimetype
      };
    }

    await sock.sendMessage(jid, messageOptions);

    // Save to messages table
    await db.prepare('INSERT INTO messages (conversation_id, sender, content, type) VALUES (?, ?, ?, ?)')
      .run(conversationId, 'agent', message, req.file ? (req.file.mimetype.startsWith('image/') ? 'image' : 'document') : 'text');
    
    // Save to campaign history
    await db.prepare('INSERT INTO campaign_history (user_id, lead_id, message, file_url) VALUES (?, ?, ?, ?)')
      .run(req.user.id, actualLeadId, message, fileUrl);

    // Update lead status to Follow-up if it was Contacted
    if (actualLeadId) {
      await db.prepare("UPDATE leads SET status = 'Follow-up', updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(actualLeadId);
    }

    res.json({ success: true });
  } catch (error) {
    console.error('Failed to send campaign follow-up:', error);
    res.status(500).json({ error: 'Failed to send follow-up' });
  }
});

app.get('/api/campaigns/history/:leadId', authenticateToken, async (req: any, res) => {
  try {
    const history = await db.prepare('SELECT * FROM campaign_history WHERE lead_id = ? AND user_id = ? ORDER BY created_at DESC').all(req.params.leadId, req.user.id) as any[];
    res.json(history);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch campaign history' });
  }
});

// --- User Websites Routes ---
app.get('/api/user-websites', authenticateToken, async (req: any, res) => {
  try {
    const websites = await db.prepare('SELECT * FROM user_websites WHERE user_id = ? ORDER BY created_at DESC').all(req.user.id);
    res.json(websites);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch websites' });
  }
});

app.post('/api/user-websites', authenticateToken, async (req: any, res) => {
  const { url } = req.body;
  if (!url) return res.status(400).json({ error: 'URL is required' });
  
  try {
    const result = await db.prepare('INSERT INTO user_websites (user_id, url, status) VALUES (?, ?, ?)')
      .run(req.user.id, url, 'added');
    res.json({ id: result.lastInsertRowid, url, status: 'added' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to add website' });
  }
});

app.delete('/api/user-websites/:id', authenticateToken, async (req: any, res) => {
  try {
    await db.prepare('DELETE FROM user_websites WHERE id = ? AND user_id = ?').run(req.params.id, req.user.id);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Failed to delete website' });
  }
});

app.post('/api/user-websites/:id/audit', authenticateToken, async (req: any, res) => {
  try {
    await db.prepare('UPDATE user_websites SET status = ? WHERE id = ? AND user_id = ?').run('audited', req.params.id, req.user.id);
    res.json({ success: true, status: 'audited' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to update audit status' });
  }
});

// --- Vite Middleware & SPA Fallback ---
if (process.env.NODE_ENV !== 'production') {
  console.log('Starting Vite in development mode...');
  const vite = await createViteServer({
    server: { middlewareMode: true },
    appType: 'spa',
  });
  app.use(vite.middlewares);
} else {
  console.log('Serving static files in production mode...');
  const distPath = path.join(process.cwd(), 'dist');
  app.use(express.static(distPath));
  app.get('*', (req, res) => {
    res.sendFile(path.join(distPath, 'index.html'));
  });
}

// Initialize Database and Start Server
console.log('Initializing database...');
try {
  await initDb();
  console.log('Database initialized.');
} catch (error) {
  console.error('Failed to initialize database:', error);
  // Don't exit, try to start anyway
}

console.log(`Starting server on port ${PORT}...`);
httpServer.listen(PORT, '0.0.0.0', async () => {
  console.log(`Server is listening on 0.0.0.0:${PORT}`);
  console.log(`Environment: ${process.env.NODE_ENV}`);
  
  // Reconnect previously connected sessions on startup
  try {
    const connectedSessions = await db.prepare("SELECT id FROM whatsapp_sessions WHERE status = 'connected'").all() as any[];
    console.log(`Found ${connectedSessions.length} sessions to reconnect on startup`);
    for (const session of connectedSessions) {
      console.log(`Attempting to reconnect session ${session.id}...`);
      connectToWhatsApp(session.id.toString(), io).catch(err => {
        console.error(`Failed to reconnect session ${session.id}:`, err);
      });
    }
  } catch (error) {
    console.error('Error during session reconnection startup:', error);
  }
}).on('error', (err) => {
  console.error('Server failed to start:', err);
});
