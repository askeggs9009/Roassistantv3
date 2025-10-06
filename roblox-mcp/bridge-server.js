import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';

dotenv.config();

const app = express();
const PORT = process.env.BRIDGE_PORT || 3001;

// Middleware
app.use(cors());
app.use(express.json());

// In-memory storage for scripts
// In production, you might want to use Redis or a database
const pendingScripts = [];
const deliveredScripts = [];

// Maximum number of scripts to keep in memory
const MAX_PENDING = 100;
const MAX_DELIVERED = 500;

/**
 * POST /api/scripts
 * Receive a script from the MCP server
 */
app.post('/api/scripts', (req, res) => {
  try {
    const { name, code, description, scriptType, location, timestamp, aiProvider } = req.body;

    if (!name || !code) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: name and code',
      });
    }

    const script = {
      id: generateId(),
      name,
      code,
      description: description || '',
      scriptType: scriptType || 'Server',
      location: location || 'ServerScriptService',
      timestamp: timestamp || new Date().toISOString(),
      aiProvider: aiProvider || 'unknown',
      status: 'pending',
    };

    pendingScripts.unshift(script);

    // Limit the size of pending scripts array
    if (pendingScripts.length > MAX_PENDING) {
      const removed = pendingScripts.pop();
      console.log(`⚠️  Removed old pending script: ${removed.name}`);
    }

    console.log(`📥 Received script: ${script.name} (${script.scriptType})`);
    console.log(`   Location: ${script.location}`);
    console.log(`   Pending scripts: ${pendingScripts.length}`);

    res.json({
      success: true,
      script: {
        id: script.id,
        name: script.name,
        timestamp: script.timestamp,
      },
    });
  } catch (error) {
    console.error('Error receiving script:', error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * GET /api/scripts/pending
 * Get all pending scripts (for Roblox plugin to poll)
 */
app.get('/api/scripts/pending', (req, res) => {
  try {
    res.json({
      success: true,
      count: pendingScripts.length,
      scripts: pendingScripts.map(s => ({
        id: s.id,
        name: s.name,
        code: s.code,
        description: s.description,
        scriptType: s.scriptType,
        location: s.location,
        timestamp: s.timestamp,
        aiProvider: s.aiProvider,
      })),
    });
  } catch (error) {
    console.error('Error fetching pending scripts:', error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * POST /api/scripts/:id/delivered
 * Mark a script as delivered
 */
app.post('/api/scripts/:id/delivered', (req, res) => {
  try {
    const { id } = req.params;
    const scriptIndex = pendingScripts.findIndex(s => s.id === id);

    if (scriptIndex === -1) {
      return res.status(404).json({
        success: false,
        error: 'Script not found',
      });
    }

    const [script] = pendingScripts.splice(scriptIndex, 1);
    script.status = 'delivered';
    script.deliveredAt = new Date().toISOString();

    deliveredScripts.unshift(script);

    // Limit the size of delivered scripts array
    if (deliveredScripts.length > MAX_DELIVERED) {
      deliveredScripts.pop();
    }

    console.log(`✅ Script delivered: ${script.name}`);
    console.log(`   Pending scripts: ${pendingScripts.length}`);

    res.json({
      success: true,
      script: {
        id: script.id,
        name: script.name,
        deliveredAt: script.deliveredAt,
      },
    });
  } catch (error) {
    console.error('Error marking script as delivered:', error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * DELETE /api/scripts/:id
 * Delete a pending script
 */
app.delete('/api/scripts/:id', (req, res) => {
  try {
    const { id } = req.params;
    const scriptIndex = pendingScripts.findIndex(s => s.id === id);

    if (scriptIndex === -1) {
      return res.status(404).json({
        success: false,
        error: 'Script not found',
      });
    }

    const [script] = pendingScripts.splice(scriptIndex, 1);

    console.log(`🗑️  Deleted script: ${script.name}`);
    console.log(`   Pending scripts: ${pendingScripts.length}`);

    res.json({
      success: true,
      script: {
        id: script.id,
        name: script.name,
      },
    });
  } catch (error) {
    console.error('Error deleting script:', error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * GET /api/scripts/history
 * Get delivered scripts history
 */
app.get('/api/scripts/history', (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 50;
    const scripts = deliveredScripts.slice(0, limit);

    res.json({
      success: true,
      count: scripts.length,
      total: deliveredScripts.length,
      scripts: scripts.map(s => ({
        id: s.id,
        name: s.name,
        description: s.description,
        scriptType: s.scriptType,
        location: s.location,
        timestamp: s.timestamp,
        deliveredAt: s.deliveredAt,
        aiProvider: s.aiProvider,
      })),
    });
  } catch (error) {
    console.error('Error fetching history:', error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * GET /api/stats
 * Get server statistics
 */
app.get('/api/stats', (req, res) => {
  try {
    res.json({
      success: true,
      stats: {
        pending: pendingScripts.length,
        delivered: deliveredScripts.length,
        uptime: process.uptime(),
        timestamp: new Date().toISOString(),
      },
    });
  } catch (error) {
    console.error('Error fetching stats:', error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * GET /api/health
 * Health check endpoint
 */
app.get('/api/health', (req, res) => {
  res.json({
    success: true,
    status: 'healthy',
    timestamp: new Date().toISOString(),
  });
});

/**
 * POST /api/scripts/clear
 * Clear all pending scripts (for debugging)
 */
app.post('/api/scripts/clear', (req, res) => {
  const count = pendingScripts.length;
  pendingScripts.length = 0;

  console.log(`🧹 Cleared ${count} pending scripts`);

  res.json({
    success: true,
    cleared: count,
  });
});

/**
 * Generate a unique ID for scripts
 */
function generateId() {
  return `script_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
}

// Start the server
app.listen(PORT, () => {
  console.log('');
  console.log('🌉 Roblox MCP Bridge Server');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(`✅ Server running on port ${PORT}`);
  console.log(`📡 HTTP endpoint: http://localhost:${PORT}`);
  console.log('');
  console.log('📋 Available endpoints:');
  console.log(`   POST   /api/scripts            - Receive script from MCP`);
  console.log(`   GET    /api/scripts/pending    - Get pending scripts`);
  console.log(`   POST   /api/scripts/:id/delivered - Mark script as delivered`);
  console.log(`   DELETE /api/scripts/:id        - Delete pending script`);
  console.log(`   GET    /api/scripts/history    - Get delivery history`);
  console.log(`   GET    /api/stats              - Get server statistics`);
  console.log(`   GET    /api/health             - Health check`);
  console.log(`   POST   /api/scripts/clear      - Clear pending scripts`);
  console.log('');
  console.log('🎮 Waiting for Roblox Studio plugin to connect...');
  console.log('');
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('\n👋 Shutting down bridge server...');
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('\n👋 Shutting down bridge server...');
  process.exit(0);
});
