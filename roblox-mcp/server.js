#!/usr/bin/env node

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import Anthropic from '@anthropic-ai/sdk';
import OpenAI from 'openai';
import dotenv from 'dotenv';
import fetch from 'node-fetch';

// Load environment variables
dotenv.config();

// Initialize AI clients
const anthropic = process.env.ANTHROPIC_API_KEY ? new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
}) : null;

const openai = process.env.OPENAI_API_KEY ? new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
}) : null;

// Bridge server configuration
const BRIDGE_URL = process.env.BRIDGE_URL || 'http://localhost:3001';

// Script generation history
const scriptHistory = [];

/**
 * Generate Roblox Luau script using AI
 */
async function generateLuauScript(description, options = {}) {
  const {
    aiProvider = process.env.AI_PROVIDER || 'anthropic',
    model = aiProvider === 'anthropic' ? 'claude-sonnet-4-5-20250929' : 'gpt-4',
    scriptType = 'Server',
    location = 'ServerScriptService',
  } = options;

  const systemPrompt = `You are an expert Roblox Luau developer. Generate high-quality, well-commented Luau scripts that follow Roblox best practices.

IMPORTANT RULES:
- Use modern Luau syntax
- Include proper error handling
- Add clear comments explaining the code
- Follow Roblox naming conventions (PascalCase for services, camelCase for variables)
- Include script type comment at the top (-- Script Type: ${scriptType})
- Make scripts production-ready and optimized
- Use task.wait() instead of wait()
- Use proper type annotations where helpful
- Include a brief header comment explaining what the script does`;

  const userPrompt = `Create a Roblox Luau ${scriptType} script that: ${description}

The script will be placed in: ${location}

Generate ONLY the Luau code, no explanations or markdown formatting.`;

  try {
    let generatedCode;

    if (aiProvider === 'anthropic' && anthropic) {
      const response = await anthropic.messages.create({
        model: model,
        max_tokens: 4096,
        system: systemPrompt,
        messages: [{
          role: 'user',
          content: userPrompt,
        }],
      });
      generatedCode = response.content[0].text;
    } else if (aiProvider === 'openai' && openai) {
      const response = await openai.chat.completions.create({
        model: model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        max_tokens: 4096,
      });
      generatedCode = response.choices[0].message.content;
    } else {
      throw new Error(`AI provider "${aiProvider}" not configured or invalid`);
    }

    // Clean up code (remove markdown if present)
    generatedCode = generatedCode
      .replace(/```lua\n?/g, '')
      .replace(/```luau\n?/g, '')
      .replace(/```\n?/g, '')
      .trim();

    return generatedCode;
  } catch (error) {
    console.error('Error generating Luau script:', error);
    throw error;
  }
}

/**
 * Send script to bridge server
 */
async function sendToBridge(scriptData) {
  try {
    const response = await fetch(`${BRIDGE_URL}/api/scripts`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(scriptData),
    });

    if (!response.ok) {
      throw new Error(`Bridge server responded with ${response.status}`);
    }

    return await response.json();
  } catch (error) {
    console.error('Error sending to bridge:', error);
    throw new Error(`Failed to send script to bridge server: ${error.message}`);
  }
}

/**
 * Create and configure the MCP server
 */
function createServer() {
  const server = new Server(
    {
      name: 'roblox-mcp-server',
      version: '1.0.0',
    },
    {
      capabilities: {
        tools: {},
      },
    }
  );

  /**
   * List available tools
   */
  server.setRequestHandler(ListToolsRequestSchema, async () => {
    return {
      tools: [
        {
          name: 'generate_roblox_script',
          description: 'Generate a Roblox Luau script based on a natural language description. The script will be automatically sent to Roblox Studio.',
          inputSchema: {
            type: 'object',
            properties: {
              description: {
                type: 'string',
                description: 'Natural language description of what the script should do (e.g., "create natural disasters that spawn randomly")',
              },
              scriptType: {
                type: 'string',
                enum: ['Server', 'Local', 'Module'],
                description: 'Type of script to generate (Server, Local, or Module)',
                default: 'Server',
              },
              location: {
                type: 'string',
                description: 'Where to place the script in Roblox Studio (e.g., ServerScriptService, StarterPlayer.StarterCharacterScripts)',
                default: 'ServerScriptService',
              },
              aiProvider: {
                type: 'string',
                enum: ['anthropic', 'openai'],
                description: 'AI provider to use for generation',
                default: 'anthropic',
              },
              sendToStudio: {
                type: 'boolean',
                description: 'Whether to automatically send the script to Roblox Studio',
                default: true,
              },
            },
            required: ['description'],
          },
        },
        {
          name: 'send_to_roblox_studio',
          description: 'Send a previously generated or custom Luau script to Roblox Studio',
          inputSchema: {
            type: 'object',
            properties: {
              code: {
                type: 'string',
                description: 'The Luau code to send to Roblox Studio',
              },
              name: {
                type: 'string',
                description: 'Name for the script',
              },
              location: {
                type: 'string',
                description: 'Where to place the script (e.g., ServerScriptService)',
                default: 'ServerScriptService',
              },
              scriptType: {
                type: 'string',
                enum: ['Server', 'Local', 'Module'],
                description: 'Type of script',
                default: 'Server',
              },
            },
            required: ['code', 'name'],
          },
        },
        {
          name: 'list_recent_scripts',
          description: 'List recently generated Roblox scripts',
          inputSchema: {
            type: 'object',
            properties: {
              limit: {
                type: 'number',
                description: 'Maximum number of scripts to return',
                default: 10,
              },
            },
          },
        },
      ],
    };
  });

  /**
   * Handle tool calls
   */
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;

    try {
      switch (name) {
        case 'generate_roblox_script': {
          const {
            description,
            scriptType = 'Server',
            location = 'ServerScriptService',
            aiProvider = 'anthropic',
            sendToStudio = true,
          } = args;

          // Generate the script
          const code = await generateLuauScript(description, {
            aiProvider,
            scriptType,
            location,
          });

          // Create script name from description
          const scriptName = description
            .substring(0, 50)
            .replace(/[^a-zA-Z0-9\s]/g, '')
            .trim()
            .split(' ')
            .map(word => word.charAt(0).toUpperCase() + word.slice(1))
            .join('');

          const scriptData = {
            name: scriptName || 'GeneratedScript',
            description,
            code,
            scriptType,
            location,
            timestamp: new Date().toISOString(),
            aiProvider,
          };

          // Add to history
          scriptHistory.unshift(scriptData);
          if (scriptHistory.length > 50) {
            scriptHistory.pop();
          }

          // Send to bridge if requested
          if (sendToStudio) {
            await sendToBridge(scriptData);
          }

          return {
            content: [
              {
                type: 'text',
                text: `✅ Generated Roblox ${scriptType} script: "${scriptName}"\n\n` +
                      `📝 Description: ${description}\n` +
                      `📍 Location: ${location}\n` +
                      `🤖 AI Provider: ${aiProvider}\n\n` +
                      `Code:\n\`\`\`lua\n${code}\n\`\`\`\n\n` +
                      (sendToStudio
                        ? '✨ Script sent to Roblox Studio! It should appear shortly.'
                        : '💡 Script generated but not sent to Studio. Use send_to_roblox_studio to send it.'),
              },
            ],
          };
        }

        case 'send_to_roblox_studio': {
          const {
            code,
            name,
            location = 'ServerScriptService',
            scriptType = 'Server',
          } = args;

          const scriptData = {
            name,
            code,
            scriptType,
            location,
            timestamp: new Date().toISOString(),
          };

          await sendToBridge(scriptData);

          return {
            content: [
              {
                type: 'text',
                text: `✅ Script "${name}" sent to Roblox Studio!\n\n` +
                      `📍 Location: ${location}\n` +
                      `📜 Type: ${scriptType}\n\n` +
                      `The script should appear in Roblox Studio within a few seconds.`,
              },
            ],
          };
        }

        case 'list_recent_scripts': {
          const { limit = 10 } = args;
          const recentScripts = scriptHistory.slice(0, limit);

          if (recentScripts.length === 0) {
            return {
              content: [
                {
                  type: 'text',
                  text: 'No scripts have been generated yet.',
                },
              ],
            };
          }

          const scriptList = recentScripts
            .map((script, index) => {
              return `${index + 1}. **${script.name}** (${script.scriptType})\n` +
                     `   📝 ${script.description || 'No description'}\n` +
                     `   📍 ${script.location}\n` +
                     `   🕒 ${new Date(script.timestamp).toLocaleString()}\n`;
            })
            .join('\n');

          return {
            content: [
              {
                type: 'text',
                text: `📋 Recent Roblox Scripts (${recentScripts.length}):\n\n${scriptList}`,
              },
            ],
          };
        }

        default:
          throw new Error(`Unknown tool: ${name}`);
      }
    } catch (error) {
      return {
        content: [
          {
            type: 'text',
            text: `❌ Error: ${error.message}`,
          },
        ],
        isError: true,
      };
    }
  });

  return server;
}

/**
 * Start the MCP server
 */
async function main() {
  console.error('🚀 Starting Roblox MCP Server...');

  // Check for required API keys
  if (!anthropic && !openai) {
    console.error('⚠️  Warning: No AI provider configured!');
    console.error('   Add ANTHROPIC_API_KEY or OPENAI_API_KEY to your .env file');
  } else {
    console.error(`✅ AI Provider configured: ${anthropic ? 'Anthropic' : 'OpenAI'}`);
  }

  console.error(`🔗 Bridge server: ${BRIDGE_URL}`);
  console.error('📡 MCP Server ready!\n');

  const server = createServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

// Run the server
main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
