import knex from 'knex';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import bcrypt from 'bcryptjs';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let isMySQL = !!(process.env.DB_HOST && process.env.DB_USER && process.env.DB_NAME);

const mysqlConfig = {
  client: 'mysql2',
  connection: {
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    port: parseInt(process.env.DB_PORT || '3306'),
  },
  pool: { min: 0, max: 10 }
};

const sqliteConfig = {
  client: 'better-sqlite3',
  connection: {
    filename: path.join(process.cwd(), 'database.sqlite'),
  },
  useNullAsDefault: true
};

let currentDb = knex(isMySQL ? mysqlConfig : sqliteConfig);

// Proxy to allow dynamic switching of the knex instance
const dbProxy = new Proxy(() => {}, {
  get(_, prop) {
    return (currentDb as any)[prop];
  },
  apply(_, thisArg, argArray) {
    return (currentDb as any)(...argArray);
  }
}) as any;

// Initialize tables
async function initDb() {
  if (isMySQL) {
    try {
      console.log('Attempting to connect to MySQL...');
      // Try a simple query with a short timeout to check connection
      await Promise.race([
        currentDb.raw('SELECT 1'),
        new Promise((_, reject) => setTimeout(() => reject(new Error('MySQL connection timeout')), 5000))
      ]);
      console.log('Connected to MySQL successfully');
    } catch (error: any) {
      console.error('MySQL connection failed, falling back to SQLite:', error.message);
      isMySQL = false;
      // Close the failed MySQL connection pool if possible
      try { await currentDb.destroy(); } catch (e) {}
      currentDb = knex(sqliteConfig);
    }
  }

  const hasUsers = await dbProxy.schema.hasTable('users');
  if (!hasUsers) {
    await dbProxy.schema.createTable('users', (table) => {
      table.increments('id').primary();
      table.string('username').unique().notNullable();
      table.string('password').notNullable();
      table.string('role').defaultTo('admin'); // 'super_admin' or 'admin'
      table.integer('is_active').defaultTo(1);
      table.string('security_key').nullable();
      table.integer('is_global_autopilot').defaultTo(1);
      table.integer('tokens').defaultTo(0);
      table.integer('token_limit').defaultTo(0);
      table.timestamp('created_at').defaultTo(dbProxy.fn.now());
    });
  } else {
    // Migration for existing table
    const hasRole = await dbProxy.schema.hasColumn('users', 'role');
    if (!hasRole) {
      await dbProxy.schema.table('users', (table) => {
        table.string('role').defaultTo('admin');
      });
    }
    const hasIsActive = await dbProxy.schema.hasColumn('users', 'is_active');
    if (!hasIsActive) {
      await dbProxy.schema.table('users', (table) => {
        table.integer('is_active').defaultTo(1);
      });
    }
    const hasSecurityKey = await dbProxy.schema.hasColumn('users', 'security_key');
    if (!hasSecurityKey) {
      await dbProxy.schema.table('users', (table) => {
        table.string('security_key').nullable();
      });
    }
    const hasTokens = await dbProxy.schema.hasColumn('users', 'tokens');
    if (!hasTokens) {
      await dbProxy.schema.table('users', (table) => {
        table.integer('tokens').defaultTo(0);
        table.integer('token_limit').defaultTo(0);
      });
    }
  }

  // Insert default super admin if not exists
  const superAdminUsername = 'najam786ali@yahoo.com';
  const superAdminPassword = 'Password';
  const superAdminKey = 'Najam2712ali';
  
  const superAdmin = await dbProxy('users').where({ username: superAdminUsername }).first();
  if (!superAdmin) {
    const hashedPassword = bcrypt.hashSync(superAdminPassword, 10);
    await dbProxy('users').insert({
      username: superAdminUsername,
      password: hashedPassword,
      role: 'super_admin',
      security_key: superAdminKey,
      is_active: 1,
      is_global_autopilot: 1
    });
    console.log('Super admin created: ' + superAdminUsername);
  }

  // Remove old webdo admin if it exists
  await dbProxy('users').where({ username: 'webdosolutions@gmail.com' }).delete();

  const hasAgents = await dbProxy.schema.hasTable('agents');
  if (!hasAgents) {
    await dbProxy.schema.createTable('agents', (table) => {
      table.increments('id').primary();
      table.integer('user_id').unsigned().references('id').inTable('users').onDelete('CASCADE');
      table.string('name').notNullable();
      table.text('personality');
      table.text('role');
      table.text('knowledge_base');
      table.text('brand_company');
      table.text('product_service');
      table.text('objective');
      table.text('tone');
      table.text('playbook');
      table.text('others');
      table.text('avatar');
      table.text('strategy');
      table.integer('is_active').defaultTo(1);
      table.timestamp('created_at').defaultTo(dbProxy.fn.now());
    });
  }

  const hasSessions = await dbProxy.schema.hasTable('whatsapp_sessions');
  if (!hasSessions) {
    await dbProxy.schema.createTable('whatsapp_sessions', (table) => {
      table.increments('id').primary();
      table.integer('user_id').unsigned().references('id').inTable('users').onDelete('CASCADE');
      table.integer('agent_id').unsigned().references('id').inTable('agents').onDelete('CASCADE');
      table.string('name');
      table.string('number').unique();
      table.string('status').defaultTo('disconnected');
      table.string('platform').defaultTo('whatsapp'); // 'whatsapp', 'facebook', 'instagram'
      table.text('session_data');
      table.timestamp('created_at').defaultTo(dbProxy.fn.now());
    });
  } else {
    const hasPlatform = await dbProxy.schema.hasColumn('whatsapp_sessions', 'platform');
    if (!hasPlatform) {
      await dbProxy.schema.table('whatsapp_sessions', (table) => {
        table.string('platform').defaultTo('whatsapp');
      });
    }
  }

  const hasConversations = await dbProxy.schema.hasTable('conversations');
  if (!hasConversations) {
    await dbProxy.schema.createTable('conversations', (table) => {
      table.increments('id').primary();
      table.integer('session_id').unsigned().references('id').inTable('whatsapp_sessions').onDelete('CASCADE');
      table.string('contact_number').notNullable();
      table.string('contact_name');
      table.string('platform').defaultTo('whatsapp');
      table.string('audit_status').defaultTo('none'); // 'none', 'added', 'audited'
      table.integer('unread_count').defaultTo(0);
      table.integer('is_saved').defaultTo(0);
      table.integer('is_ordered').defaultTo(0);
      table.integer('is_rated').defaultTo(0);
      table.integer('is_audited').defaultTo(0);
      table.integer('is_autopilot').defaultTo(1);
      table.string('intent');
      table.float('engagement_score').defaultTo(0);
      table.string('objective').defaultTo('Collect contact information');
      table.integer('objective_progress').defaultTo(0); // 0: Not Started, 50: In Progress, 100: Completed
      table.text('labels'); // JSON array of labels
      table.timestamp('last_reminder_sent_at');
      table.timestamp('last_greeting_at');
      table.timestamp('last_message_at').defaultTo(dbProxy.fn.now());
    });
  } else {
    // Add objective fields if they don't exist (for existing DBs)
    const hasObjective = await dbProxy.schema.hasColumn('conversations', 'objective');
    if (!hasObjective) {
      await dbProxy.schema.table('conversations', (table) => {
        table.string('objective').defaultTo('Collect contact information');
        table.integer('objective_progress').defaultTo(0);
      });
    }
    const hasGreetingAt = await dbProxy.schema.hasColumn('conversations', 'last_greeting_at');
    if (!hasGreetingAt) {
      await dbProxy.schema.table('conversations', (table) => {
        table.timestamp('last_greeting_at');
      });
    }
    const hasAgentMessageAt = await dbProxy.schema.hasColumn('conversations', 'last_agent_message_at');
    if (!hasAgentMessageAt) {
      await dbProxy.schema.table('conversations', (table) => {
        table.timestamp('last_agent_message_at');
      });
    }
    const hasLabels = await dbProxy.schema.hasColumn('conversations', 'labels');
    if (!hasLabels) {
      await dbProxy.schema.table('conversations', (table) => {
        table.text('labels');
      });
    }
    const hasPlatform = await dbProxy.schema.hasColumn('conversations', 'platform');
    if (!hasPlatform) {
      await dbProxy.schema.table('conversations', (table) => {
        table.string('platform').defaultTo('whatsapp');
      });
    }
    const hasAuditStatus = await dbProxy.schema.hasColumn('conversations', 'audit_status');
    if (!hasAuditStatus) {
      await dbProxy.schema.table('conversations', (table) => {
        table.string('audit_status').defaultTo('none');
      });
    }
    const hasAutopilot = await dbProxy.schema.hasColumn('conversations', 'is_autopilot');
    if (!hasAutopilot) {
      await dbProxy.schema.table('conversations', (table) => {
        table.integer('is_autopilot').defaultTo(1);
      });
    }
    const hasIntent = await dbProxy.schema.hasColumn('conversations', 'intent');
    if (!hasIntent) {
      await dbProxy.schema.table('conversations', (table) => {
        table.string('intent');
        table.float('engagement_score').defaultTo(0);
      });
    }
  }

  const hasLeads = await dbProxy.schema.hasTable('leads');
  if (!hasLeads) {
    await dbProxy.schema.createTable('leads', (table) => {
      table.increments('id').primary();
      table.integer('user_id').unsigned().references('id').inTable('users').onDelete('CASCADE');
      table.integer('conversation_id').unsigned().references('id').inTable('conversations').onDelete('CASCADE');
      table.string('name');
      table.string('email');
      table.string('website');
      table.string('source').defaultTo('WhatsApp');
      table.string('status').defaultTo('New'); // New, Contacted, Qualified, Final Customer, Not Interested
      table.string('service_interest');
      table.text('objections');
      table.integer('is_new').defaultTo(1);
      table.integer('followup_count').defaultTo(0);
      table.timestamp('last_followup_at');
      table.timestamp('created_at').defaultTo(dbProxy.fn.now());
      table.timestamp('updated_at').defaultTo(dbProxy.fn.now());
    });
  } else {
    const hasFollowupCount = await dbProxy.schema.hasColumn('leads', 'followup_count');
    if (!hasFollowupCount) {
      await dbProxy.schema.table('leads', (table) => {
        table.integer('followup_count').defaultTo(0);
        table.timestamp('last_followup_at');
      });
    }
    const hasConvId = await dbProxy.schema.hasColumn('leads', 'conversation_id');
    if (!hasConvId) {
      await dbProxy.schema.table('leads', (table) => {
        table.integer('conversation_id').unsigned().references('id').inTable('conversations').onDelete('CASCADE');
      });
    }
    const hasServiceInterest = await dbProxy.schema.hasColumn('leads', 'service_interest');
    if (!hasServiceInterest) {
      await dbProxy.schema.table('leads', (table) => {
        table.string('service_interest');
        table.text('objections');
      });
    }
    const hasQualifiedAt = await dbProxy.schema.hasColumn('leads', 'qualified_at');
    if (!hasQualifiedAt) {
      await dbProxy.schema.table('leads', (table) => {
        table.timestamp('qualified_at');
        table.integer('manual_followup_count').defaultTo(0);
        table.integer('auto_followup_count').defaultTo(0);
      });
    }
  }

  const hasMessages = await dbProxy.schema.hasTable('messages');
  if (!hasMessages) {
    await dbProxy.schema.createTable('messages', (table) => {
      table.increments('id').primary();
      table.integer('conversation_id').unsigned().references('id').inTable('conversations').onDelete('CASCADE');
      table.string('sender').notNullable();
      table.text('content');
      table.string('type').defaultTo('text');
      table.string('platform').defaultTo('whatsapp');
      table.text('transcription');
      table.timestamp('created_at').defaultTo(dbProxy.fn.now());
    });
  } else {
    const hasPlatform = await dbProxy.schema.hasColumn('messages', 'platform');
    if (!hasPlatform) {
      await dbProxy.schema.table('messages', (table) => {
        table.string('platform').defaultTo('whatsapp');
      });
    }
    const hasIsFollowup = await dbProxy.schema.hasColumn('messages', 'is_followup');
    if (!hasIsFollowup) {
      await dbProxy.schema.table('messages', (table) => {
        table.integer('is_followup').defaultTo(0);
      });
    }
  }

  const hasCampaigns = await dbProxy.schema.hasTable('bulk_campaigns');
  if (!hasCampaigns) {
    await dbProxy.schema.createTable('bulk_campaigns', (table) => {
      table.increments('id').primary();
      table.integer('user_id').unsigned().references('id').inTable('users').onDelete('CASCADE');
      table.string('name').notNullable();
      table.text('message').notNullable();
      table.string('status').defaultTo('pending'); // pending, processing, completed, failed, paused
      table.integer('total_recipients').defaultTo(0);
      table.integer('sent_count').defaultTo(0);
      table.integer('delivered_count').defaultTo(0);
      table.integer('read_count').defaultTo(0);
      table.integer('reply_count').defaultTo(0);
      table.integer('failed_count').defaultTo(0);
      table.timestamp('scheduled_at').nullable();
      table.timestamp('created_at').defaultTo(dbProxy.fn.now());
    });
  } else {
    const hasUserId = await dbProxy.schema.hasColumn('bulk_campaigns', 'user_id');
    if (!hasUserId) {
      await dbProxy.schema.table('bulk_campaigns', (table) => {
        table.integer('user_id').unsigned().references('id').inTable('users').onDelete('CASCADE');
      });
    }
    const hasTotalRecipients = await dbProxy.schema.hasColumn('bulk_campaigns', 'total_recipients');
    if (!hasTotalRecipients) {
      await dbProxy.schema.table('bulk_campaigns', (table) => {
        table.integer('total_recipients').defaultTo(0);
        table.integer('sent_count').defaultTo(0);
        table.integer('delivered_count').defaultTo(0);
        table.integer('read_count').defaultTo(0);
        table.integer('reply_count').defaultTo(0);
        table.integer('failed_count').defaultTo(0);
        table.timestamp('scheduled_at').nullable();
      });
    }
  }

  const hasRecipients = await dbProxy.schema.hasTable('bulk_recipients');
  if (!hasRecipients) {
    await dbProxy.schema.createTable('bulk_recipients', (table) => {
      table.increments('id').primary();
      table.integer('campaign_id').unsigned().references('id').inTable('bulk_campaigns').onDelete('CASCADE');
      table.string('number').notNullable();
      table.string('status').defaultTo('pending'); // pending, sent, delivered, read, replied, failed
      table.timestamp('sent_at').nullable();
      table.timestamp('created_at').defaultTo(dbProxy.fn.now());
    });
  }

  const hasContacts = await dbProxy.schema.hasTable('contacts');
  if (!hasContacts) {
    await dbProxy.schema.createTable('contacts', (table) => {
      table.increments('id').primary();
      table.integer('session_id').unsigned().references('id').inTable('whatsapp_sessions').onDelete('CASCADE');
      table.string('jid').notNullable();
      table.string('name');
      table.string('number');
      table.timestamp('created_at').defaultTo(dbProxy.fn.now());
      table.unique(['session_id', 'jid']);
    });
  }

  const hasAgentRules = await dbProxy.schema.hasTable('agent_rules');
  if (!hasAgentRules) {
    await dbProxy.schema.createTable('agent_rules', (table) => {
      table.increments('id').primary();
      table.integer('agent_id').unsigned().references('id').inTable('agents').onDelete('CASCADE');
      table.string('trigger_type').notNullable(); // 'url_shared', 'keyword_match', 'sender_match'
      table.text('trigger_value');
      table.string('action_type').notNullable(); // 'forward_to_group', 'reply_with_template', 'notify_admin'
      table.text('action_value');
      table.text('description');
      table.integer('is_active').defaultTo(1);
      table.timestamp('created_at').defaultTo(dbProxy.fn.now());
    });
  }

  const hasTrainingFiles = await dbProxy.schema.hasTable('training_files');
  if (!hasTrainingFiles) {
    await dbProxy.schema.createTable('training_files', (table) => {
      table.increments('id').primary();
      table.integer('agent_id').unsigned().references('id').inTable('agents').onDelete('CASCADE');
      table.string('filename').notNullable();
      table.string('original_name').notNullable();
      table.text('content');
      table.timestamp('created_at').defaultTo(dbProxy.fn.now());
    });
  }

  const hasSettings = await dbProxy.schema.hasTable('settings');
  if (!hasSettings) {
    await dbProxy.schema.createTable('settings', (table) => {
      table.increments('id').primary();
      table.integer('user_id').unsigned().references('id').inTable('users').onDelete('CASCADE');
      table.string('provider').notNullable();
      table.string('api_key').notNullable();
      table.string('base_url');
      table.string('model');
      table.integer('is_active').defaultTo(1);
      table.string('status').defaultTo('active');
      table.float('credits_remaining').defaultTo(0);
      table.timestamp('created_at').defaultTo(dbProxy.fn.now());
    });
  }

  const hasUserWebsites = await dbProxy.schema.hasTable('user_websites');
  if (!hasUserWebsites) {
    await dbProxy.schema.createTable('user_websites', (table) => {
      table.increments('id').primary();
      table.integer('user_id').unsigned().references('id').inTable('users').onDelete('CASCADE');
      table.string('url').notNullable();
      table.string('status').defaultTo('added'); // 'added', 'audited'
      table.timestamp('created_at').defaultTo(dbProxy.fn.now());
    });
  }

  const hasSocialAccounts = await dbProxy.schema.hasTable('social_accounts');
  if (!hasSocialAccounts) {
    await dbProxy.schema.createTable('social_accounts', (table) => {
      table.increments('id').primary();
      table.integer('user_id').unsigned().references('id').inTable('users').onDelete('CASCADE');
      table.string('platform').notNullable(); // 'facebook', 'instagram'
      table.string('account_id').notNullable();
      table.string('name');
      table.text('access_token');
      table.text('avatar');
      table.timestamp('created_at').defaultTo(dbProxy.fn.now());
      table.unique(['user_id', 'platform', 'account_id']);
    });
  }

  const hasCampaignHistory = await dbProxy.schema.hasTable('campaign_history');
  if (!hasCampaignHistory) {
    await dbProxy.schema.createTable('campaign_history', (table) => {
      table.increments('id').primary();
      table.integer('user_id').unsigned().references('id').inTable('users').onDelete('CASCADE');
      table.integer('lead_id').unsigned().references('id').inTable('leads').onDelete('CASCADE');
      table.text('message').notNullable();
      table.string('status').defaultTo('sent'); // sent, failed
      table.text('file_url');
      table.timestamp('created_at').defaultTo(dbProxy.fn.now());
    });
  }

  const hasCampaignConfigs = await dbProxy.schema.hasTable('campaign_configs');
  if (!hasCampaignConfigs) {
    await dbProxy.schema.createTable('campaign_configs', (table) => {
      table.increments('id').primary();
      table.integer('user_id').unsigned().references('id').inTable('users').onDelete('CASCADE');
      table.string('business_name');
      table.string('service_type');
      table.text('primary_offer');
      table.integer('daily_message_limit').defaultTo(50);
      table.integer('min_delay').defaultTo(10);
      table.integer('max_delay').defaultTo(60);
      table.integer('max_followups').defaultTo(3);
      table.integer('stop_if_no_reply').defaultTo(1);
      table.integer('enable_ai_rewriting').defaultTo(1);
      table.string('ai_tone').defaultTo('Professional');
      table.integer('user_consent_required').defaultTo(1);
      table.text('automation_rules'); // JSON string for stage rules
      table.timestamp('updated_at').defaultTo(dbProxy.fn.now());
    });
  }

  const hasBlacklist = await dbProxy.schema.hasTable('blacklist');
  if (!hasBlacklist) {
    await dbProxy.schema.createTable('blacklist', (table) => {
      table.increments('id').primary();
      table.integer('user_id').unsigned().references('id').inTable('users').onDelete('CASCADE');
      table.string('number').notNullable();
      table.string('reason');
      table.timestamp('created_at').defaultTo(dbProxy.fn.now());
      table.unique(['user_id', 'number']);
    });
  }

  const hasOptIns = await dbProxy.schema.hasTable('opt_ins');
  if (!hasOptIns) {
    await dbProxy.schema.createTable('opt_ins', (table) => {
      table.increments('id').primary();
      table.integer('user_id').unsigned().references('id').inTable('users').onDelete('CASCADE');
      table.string('number').notNullable();
      table.string('source').defaultTo('Manual Entry');
      table.timestamp('created_at').defaultTo(dbProxy.fn.now());
      table.unique(['user_id', 'number']);
    });
  }

  const hasActivities = await dbProxy.schema.hasTable('activities');
  if (!hasActivities) {
    await dbProxy.schema.createTable('activities', (table) => {
      table.increments('id').primary();
      table.integer('user_id').unsigned().references('id').inTable('users').onDelete('CASCADE');
      table.string('type').notNullable(); // 'lead_added', 'lead_qualified', 'followup_sent', 'customer_converted', 'message_received'
      table.text('description');
      table.timestamp('created_at').defaultTo(dbProxy.fn.now());
    });
  }

  const hasAuditLogs = await dbProxy.schema.hasTable('audit_logs');
  if (!hasAuditLogs) {
    await dbProxy.schema.createTable('audit_logs', (table) => {
      table.increments('id').primary();
      table.integer('user_id').unsigned().references('id').inTable('users').onDelete('CASCADE');
      table.string('action').notNullable();
      table.text('details');
      table.timestamp('created_at').defaultTo(dbProxy.fn.now());
    });
  }

  console.log(`Database initialized successfully using ${isMySQL ? 'MySQL' : 'SQLite'} - Ondigix Branding`);
}

// Helper to bridge better-sqlite3 style calls to knex (for minimal refactoring)
const dbWrapper = {
  prepare: (sql: string) => {
    return {
      all: async (...args: any[]) => {
        try {
          const bindings = Array.isArray(args[0]) ? args[0] : args;
          const result = await dbProxy.raw(sql, bindings);
          return isMySQL ? result[0] : result;
        } catch (err: any) {
          console.error(`DB Error (all) - SQL: ${sql} - Bindings: ${JSON.stringify(args)}`, err.message);
          throw err;
        }
      },
      get: async (...args: any[]) => {
        try {
          const bindings = Array.isArray(args[0]) ? args[0] : args;
          const result = await dbProxy.raw(sql, bindings);
          const rows = isMySQL ? result[0] : result;
          return rows[0];
        } catch (err: any) {
          console.error(`DB Error (get) - SQL: ${sql} - Bindings: ${JSON.stringify(args)}`, err.message);
          throw err;
        }
      },
      run: async (...args: any[]) => {
        try {
          const bindings = Array.isArray(args[0]) ? args[0] : args;
          const result = await dbProxy.raw(sql, bindings);
          if (isMySQL) {
            return { lastInsertRowid: result[0].insertId };
          } else {
            return { lastInsertRowid: result.lastInsertRowid || result[0]?.id };
          }
        } catch (err: any) {
          console.error(`DB Error (run) - SQL: ${sql} - Bindings: ${JSON.stringify(args)}`, err.message);
          throw err;
        }
      }
    };
  },
  exec: async (sql: string) => {
    try {
      return await dbProxy.raw(sql);
    } catch (err: any) {
      console.error(`DB Error (exec) - SQL: ${sql}`, err.message);
      throw err;
    }
  }
};

export { initDb, dbProxy as knex, isMySQL };
export default dbWrapper;
