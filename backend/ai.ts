import { GoogleGenAI, Type } from "@google/genai";
import db from './db.js';
import * as cheerio from 'cheerio';
import axios from 'axios';

export interface AIProvider {
  id: string;
  name: string;
  baseUrl?: string;
}

export async function getActiveApiKeys(userId: number) {
  return await db.prepare("SELECT * FROM settings WHERE user_id = ? AND is_active = 1 AND status = 'active' ORDER BY id ASC").all(userId) as any[];
}

const DEFAULT_KEYS = {
  deepseek: 'sk-d612c504e913431ca23ae732e33b6ef4'
};

export async function validateGeminiKey(apiKey: string) {
  try {
    const ai = new GoogleGenAI({ apiKey });
    // Use a tiny prompt to validate the key
    await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: "hi",
      config: { maxOutputTokens: 1 }
    });
    return { isValid: true, credits: 10.00 }; // Mock credits for Gemini
  } catch (error: any) {
    console.error('Gemini validation failed:', error.message);
    return { isValid: false, error: error.message };
  }
}

export async function validateDeepSeekKey(apiKey: string) {
  try {
    const response = await fetch('https://api.deepseek.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'deepseek-chat',
        messages: [{ role: 'user', content: 'hi' }],
        max_tokens: 1
      }),
    });

    if (response.ok) {
      return { isValid: true, credits: 10.00 }; // Mock credits for DeepSeek
    } else {
      const error = await response.json();
      return { isValid: false, error: error.error?.message || response.statusText };
    }
  } catch (error: any) {
    console.error('DeepSeek validation failed:', error.message);
    return { isValid: false, error: error.message };
  }
}

export async function callAI(userId: number, prompt: string, systemInstruction?: string, media?: any) {
  console.log('AI Engine v1.1 starting...');
  const keys = await getActiveApiKeys(userId);
  
  const providersToTry: { id: string, key: string, dbId?: number, source: string }[] = [];
  
  // 1. User DeepSeek
  const userDeepSeek = keys.find(k => k.provider === 'deepseek');
  if (userDeepSeek?.api_key && userDeepSeek.api_key.length > 10 && !userDeepSeek.api_key.includes('TODO')) {
    providersToTry.push({ id: 'deepseek', key: userDeepSeek.api_key, dbId: userDeepSeek.id, source: 'User' });
  }

  // 2. User Gemini
  const userGemini = keys.find(k => k.provider === 'gemini');
  if (userGemini?.api_key && userGemini.api_key.length > 10 && !userGemini.api_key.includes('TODO')) {
    providersToTry.push({ id: 'gemini', key: userGemini.api_key, dbId: userGemini.id, source: 'User' });
  }

  // 3. System DeepSeek (from env)
  if (process.env.DEEPSEEK_API_KEY && process.env.DEEPSEEK_API_KEY.length > 10 && !process.env.DEEPSEEK_API_KEY.includes('TODO')) {
    providersToTry.push({ id: 'deepseek', key: process.env.DEEPSEEK_API_KEY, source: 'System' });
  }

  // 4. System Gemini (from env)
  if (process.env.GEMINI_API_KEY && process.env.GEMINI_API_KEY.length > 10 && !process.env.GEMINI_API_KEY.includes('TODO')) {
    providersToTry.push({ id: 'gemini', key: process.env.GEMINI_API_KEY, source: 'System' });
  }

  // 5. Default DeepSeek (hardcoded fallback)
  if (DEFAULT_KEYS.deepseek && DEFAULT_KEYS.deepseek.length > 10) {
    providersToTry.push({ id: 'deepseek', key: DEFAULT_KEYS.deepseek, source: 'Default' });
  }

  let lastError = null;
  for (const provider of providersToTry) {
    try {
      console.log(`Attempting AI call with ${provider.id} (${provider.source})`);
      let responseText = '';
      
      if (provider.id === 'deepseek') {
        responseText = await callDeepSeek(provider.key, prompt, systemInstruction);
      } else {
        responseText = await callGemini(provider.key, prompt, systemInstruction);
      }

      if (provider.dbId) {
        await db.prepare('UPDATE settings SET credits_remaining = MAX(0, credits_remaining - 0.01) WHERE id = ?').run(provider.dbId);
      }
      return responseText;
    } catch (error: any) {
      lastError = error;
      console.error(`${provider.id} (${provider.source}) call failed:`, error.message);
      
      // If it's an auth error or balance error, we definitely want to try the next one
      const isAuthError = error.message.includes('API key not valid') || 
                         error.message.includes('invalid') || 
                         error.message.includes('Authorization') ||
                         error.message.includes('401') ||
                         error.message.includes('403');
      const isBalanceError = error.message.includes('Balance') || 
                            error.message.includes('quota') || 
                            error.message.includes('429');
      
      if (isAuthError || isBalanceError) {
        console.log(`Auth/Balance error with ${provider.id} (${provider.source}), trying next provider...`);
        // Optionally mark as inactive in DB to avoid repeated failures in this session
        if (provider.dbId) {
          await db.prepare("UPDATE settings SET status = 'error' WHERE id = ?").run(provider.dbId);
        }
        continue;
      }
      
      // For other errors, we might still want to try next, but let's be careful
      continue;
    }
  }

  throw new Error(`All AI providers failed. Last error: ${lastError?.message || 'Unknown error'}. Please check your API keys in Settings.`);
}

async function callGemini(apiKey: string, prompt: string, systemInstruction?: string) {
  try {
    const ai = new GoogleGenAI({ apiKey });
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: prompt,
      config: {
        systemInstruction: systemInstruction,
      },
    });
    return response.text || '';
  } catch (error: any) {
    console.error('Gemini call failed:', error.message);
    throw error;
  }
}

async function callDeepSeek(apiKey: string, prompt: string, systemInstruction?: string) {
  try {
    const response = await fetch('https://api.deepseek.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'deepseek-chat',
        messages: [
          ...(systemInstruction ? [{ role: 'system', content: systemInstruction }] : []),
          { role: 'user', content: prompt }
        ],
      }),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error?.message || `DeepSeek error: ${response.statusText}`);
    }

    const data = await response.json();
    return data.choices[0]?.message?.content || '';
  } catch (error: any) {
    console.error('DeepSeek call failed:', error.message);
    throw error;
  }
}

async function scrapeURL(url: string): Promise<string> {
  try {
    const response = await axios.get(url, {
      timeout: 10000,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
      }
    });
    const $ = cheerio.load(response.data);
    
    // Remove script and style elements
    $('script, style').remove();
    
    // Get text content
    const text = $('body').text().replace(/\s+/g, ' ').trim();
    return text.substring(0, 10000); // Limit to 10k chars
  } catch (error) {
    console.error(`Failed to scrape URL ${url}:`, error);
    throw new Error(`Could not access the URL: ${url}`);
  }
}

export async function interpretGuidance(userId: number, agentId: number, message: string, contacts: any[], getSession: (id: string) => any, io: any) {
  const systemInstruction = `
    You are an AI Agent Trainer for "Geeks Genics". Your job is to listen to the user's instructions for a WhatsApp AI Agent and extract "Rules", "Knowledge", or "Direct Actions" in JSON format.
    
    The available contacts/groups are:
    ${JSON.stringify(contacts.map(c => ({ jid: c.jid, name: c.name })))}
    
    A Rule consists of:
    - trigger_type: 'url_shared', 'keyword_match', 'sender_match'
    - trigger_value: the specific URL pattern (e.g. "http"), keyword, or sender JID
    - action_type: 'forward_to_group', 'reply_with_template', 'send_message'
    - action_value: the target group JID or template text
    - description: a human-readable description of the rule
    
    Knowledge consists of:
    - action: 'scrape_url'
    - url: the URL to learn from
    
    Direct Actions (for immediate execution):
    - action: 'send_whatsapp_message'
    - target: the contact/group JID
    - text: the message to send
    - action: 'sync_all'
    
    If the user gives an instruction like "When a client shares a website URL, add it to the Audits group", you should return a rule.
    If the user gives a URL and says "learn from this" or just provides a URL to memorize, you should return a knowledge action.
    If the user says something like "Send a message to the Sales group saying we are ready" or "Sync all my chats", you should return a direct action.
    
    Respond STRICTLY in this JSON format:
    {
      "message": "A friendly confirmation message to the user",
      "rule": { ... the rule object ... } or null,
      "knowledge": { "action": "scrape_url", "url": "..." } or null,
      "action": { "action": "send_whatsapp_message", "target": "...", "text": "..." } or { "action": "sync_all" } or null
    }
  `;

  try {
    const responseText = await callAI(userId, message, systemInstruction);
    
    // Extract JSON from response
    const jsonMatch = responseText.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const data = JSON.parse(jsonMatch[0]);
      
      // Handle Knowledge (Scrape URL)
      if (data.knowledge && data.knowledge.action === 'scrape_url') {
        const url = data.knowledge.url;
        try {
          const content = await scrapeURL(url);
          await db.prepare('INSERT INTO training_files (agent_id, filename, original_name, content) VALUES (?, ?, ?, ?)')
            .run(agentId, `url_${Date.now()}.txt`, `Scraped: ${url}`, content);
          return `I've successfully memorized the content from ${url}. I'll use this information to answer customer queries.`;
        } catch (scrapeErr: any) {
          return `I tried to learn from ${url}, but I couldn't access it: ${scrapeErr.message}`;
        }
      }

      // Handle Direct Action (Send Message or Sync All)
      if (data.action) {
        if (data.action.action === 'send_whatsapp_message') {
          const { target, text } = data.action;
          
          // Find ANY active session for this user that has this contact or just use the first available active session
          const sessions = await db.prepare('SELECT id FROM whatsapp_sessions WHERE user_id = ? AND status = ?').all(userId, 'connected') as any[];
          
          if (sessions.length === 0) return "I couldn't find any active WhatsApp sessions to send the message.";
          
          // Try to find a session that already has a conversation with this target
          let bestSessionId = sessions[0].id;
          for (const s of sessions) {
            const conv = await db.prepare('SELECT id FROM conversations WHERE session_id = ? AND contact_number = ?').get(s.id, target);
            if (conv) {
              bestSessionId = s.id;
              break;
            }
          }

          const sock = getSession(bestSessionId.toString());
          if (sock) {
            try {
              await sock.sendMessage(target, { text });
              
              // Save to DB
              let conversation = await db.prepare('SELECT * FROM conversations WHERE session_id = ? AND contact_number = ?').get(bestSessionId, target) as any;
              if (!conversation) {
                const convResult = await db.prepare('INSERT INTO conversations (session_id, contact_number) VALUES (?, ?)').run(bestSessionId, target);
                conversation = { id: convResult.lastInsertRowid };
              }
              
              await db.prepare('INSERT INTO messages (conversation_id, sender, content, type) VALUES (?, ?, ?, ?)')
                .run(conversation.id, 'agent', text, 'text');
              await db.prepare('UPDATE conversations SET last_message_at = CURRENT_TIMESTAMP WHERE id = ?').run(conversation.id);

              // Emit to UI
              io.emit('new_message', {
                conversation_id: conversation.id,
                sender: 'agent',
                content: text,
                type: 'text',
                created_at: new Date().toISOString()
              });

              return `Action executed: I've sent that message to ${target} via session ${bestSessionId}.`;
            } catch (sendErr: any) {
              return `I tried to send the message, but failed: ${sendErr.message}`;
            }
          }
          return "I found an active session but couldn't access its connection to send the message.";
        } else if (data.action.action === 'sync_all') {
          const sessions = await db.prepare('SELECT id FROM whatsapp_sessions WHERE user_id = ? AND status = ?').all(userId, 'connected') as any[];
          if (sessions.length === 0) return "No active WhatsApp sessions found to sync.";
          
          const { syncWhatsAppHistory } = await import('./whatsapp.js');
          for (const session of sessions) {
            syncWhatsAppHistory(session.id.toString(), io).catch(err => console.error(`Sync failed for session ${session.id}:`, err));
          }
          return `I've started a full re-sync for all ${sessions.length} active sessions. You'll see the progress in the inbox.`;
        }
      }

      // Handle Rule Creation
      if (data.rule) {
        // Validate rule fields before insertion
        const { trigger_type, trigger_value, action_type, action_value, description } = data.rule;
        if (trigger_type && action_type) {
          await db.prepare(`
            INSERT INTO agent_rules (agent_id, trigger_type, trigger_value, action_type, action_value, description)
            VALUES (?, ?, ?, ?, ?, ?)
          `).run(
            agentId,
            trigger_type,
            trigger_value || '',
            action_type,
            action_value || '',
            description || 'Automated rule'
          );
        }
      }
      return data.message || "I've processed your instruction.";
    }
    return responseText;
  } catch (e: any) {
    console.error('Failed to interpret guidance:', e);
    return `I'm sorry, I couldn't process that training instruction right now. Error: ${e.message}`;
  }
}

export async function extractLeadInfo(userId: number, conversationId: number, messages: any[]) {
  const systemInstruction = `
    You are a Lead Extraction Specialist. Analyze the following WhatsApp conversation and extract lead information if present.
    
    Extract:
    - name: The user's name (if they provided it)
    - email: The user's email address (if they provided it)
    - website: The user's website or domain (if they provided it)
    - service_interest: What service are they interested in? (SEO, Web Dev, Marketing, etc.)
    - objections: Any objections they raised (Price, Trust, Timing, etc.) as a short summary.
    - objective_progress: Based on the conversation, what is the progress of the current objective? 
      Options: 'Not Started', 'In Progress', 'Completed'
    - status: Based on the conversation, what is the lead status?
      Options: 'New', 'Contacted', 'Qualified', 'Final Customer', 'Not Interested'
    - is_ordered: 1 if the user has placed an order or expressed strong intent to buy, 0 otherwise
    - is_saved: 1 if the user is a confirmed customer, 0 otherwise
    - audit_status: 'added' if a website URL was submitted for audit, 'none' otherwise
    - intent: The user's current intent. Options: 'Inquiry', 'Interest', 'Objection', 'Confusion', 'Ready-to-buy', 'Support request'
    - engagement_score: A score from 0 to 100 based on their interaction frequency and interest.
    
    Conversation History:
    ${messages.map(m => `${m.sender}: ${m.content}`).join('\n')}
    
    Respond ONLY in this JSON format:
    {
      "name": "...",
      "email": "...",
      "website": "...",
      "service_interest": "...",
      "objections": "...",
      "objective_progress": "...",
      "status": "...",
      "is_ordered": 0,
      "is_saved": 0,
      "audit_status": "none",
      "intent": "...",
      "engagement_score": 0
    }
    If a field is not found, use null or default values.
  `;

  try {
    const responseText = await callAI(userId, "Extract lead info from this conversation.", systemInstruction);
    const jsonMatch = responseText.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const data = JSON.parse(jsonMatch[0]);
      
      // Update lead even if website is missing
      const existingLead = await db.prepare('SELECT id, status, qualified_at FROM leads WHERE conversation_id = ?').get(conversationId) as any;
      if (existingLead) {
        let qualifiedAt = existingLead.qualified_at;
        if (data.status === 'Qualified' && existingLead.status !== 'Qualified' && !qualifiedAt) {
          qualifiedAt = new Date().toISOString();
          await db.prepare('INSERT INTO activities (user_id, type, description) VALUES (?, ?, ?)')
            .run(userId, 'lead_qualified', `Lead ${data.name || 'Unknown'} has been qualified.`);
        }
        if (data.status === 'Final Customer' && existingLead.status !== 'Final Customer') {
          await db.prepare('INSERT INTO activities (user_id, type, description) VALUES (?, ?, ?)')
            .run(userId, 'customer_converted', `Lead ${data.name || 'Unknown'} has been converted to a customer.`);
        }
        await db.prepare('UPDATE leads SET name = COALESCE(?, name), email = COALESCE(?, email), website = COALESCE(?, website), status = COALESCE(?, status), service_interest = COALESCE(?, service_interest), objections = COALESCE(?, objections), qualified_at = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
          .run(data.name || null, data.email || null, data.website || null, data.status || null, data.service_interest || null, data.objections || null, qualifiedAt, existingLead.id);
      } else {
        const qualifiedAt = data.status === 'Qualified' ? new Date().toISOString() : null;
        await db.prepare('INSERT INTO leads (user_id, conversation_id, name, email, website, source, status, service_interest, objections, is_new, qualified_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
          .run(userId, conversationId, data.name || null, data.email || null, data.website || null, 'WhatsApp', data.status || 'New', data.service_interest || null, data.objections || null, 1, qualifiedAt);
        
        await db.prepare('INSERT INTO activities (user_id, type, description) VALUES (?, ?, ?)')
          .run(userId, 'lead_added', `New lead ${data.name || 'Unknown'} added from WhatsApp.`);
        
        if (qualifiedAt) {
          await db.prepare('INSERT INTO activities (user_id, type, description) VALUES (?, ?, ?)')
            .run(userId, 'lead_qualified', `Lead ${data.name || 'Unknown'} has been qualified.`);
        }
      }

      // Update conversation objective progress and flags
      const updates: string[] = [];
      const params: any[] = [];

      if (data.objective_progress) {
        updates.push('objective_progress = ?');
        params.push(data.objective_progress);
      }
      if (data.is_ordered !== undefined) {
        updates.push('is_ordered = ?');
        params.push(data.is_ordered ? 1 : 0);
      }
      if (data.is_saved !== undefined) {
        updates.push('is_saved = ?');
        params.push(data.is_saved ? 1 : 0);
      }
      if (data.audit_status && data.audit_status !== 'none') {
        updates.push('audit_status = ?');
        params.push(data.audit_status);
      }
      if (data.intent) {
        updates.push('intent = ?');
        params.push(data.intent);
      }
      if (data.engagement_score !== undefined) {
        updates.push('engagement_score = ?');
        params.push(data.engagement_score);
      }

      if (updates.length > 0) {
        params.push(conversationId);
        await db.prepare(`UPDATE conversations SET ${updates.join(', ')} WHERE id = ?`).run(...params);
      }
      
      return data;
    }
  } catch (error) {
    console.error('Lead extraction failed:', error);
  }
  return null;
}

export async function generateFollowupMessage(userId: number, leadName: string, conversationHistory: any[]) {
  const systemInstruction = `
    You are a Sales Follow-up Specialist for "Geeks Genics". 
    Analyze the previous conversation history with ${leadName} and generate a personalized, contextual follow-up message.
    
    Guidelines:
    - Be professional yet friendly.
    - Reference specific points from the previous chat.
    - Focus on conversion (e.g., booking a call, closing a deal, asking if they have more questions).
    - Keep it concise and engaging.
    - Do not use placeholders like [Name], use the provided name: ${leadName}.
    
    Conversation History:
    ${conversationHistory.map(m => `${m.sender}: ${m.content}`).join('\n')}
  `;

  try {
    return await callAI(userId, "Generate a personalized follow-up message.", systemInstruction);
  } catch (error) {
    console.error('Follow-up generation failed:', error);
    return `Hi ${leadName}, I wanted to follow up on our previous conversation. Do you have any further questions or would you like to schedule a call?`;
  }
}
