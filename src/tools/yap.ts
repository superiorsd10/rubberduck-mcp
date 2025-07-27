import { Tool } from '@modelcontextprotocol/sdk/types.js';
import { StateManager } from '../state/manager';
import { YapToolArgs, YapMessage } from '../types/index';

export class YapTool {
  private stateManager: StateManager;

  constructor(stateManager: StateManager) {
    this.stateManager = stateManager;
  }

  getDefinition(): Tool {
    return {
      name: 'yap',
      description: 'Express thoughts, observations, or commentary while coding. Like humans yapping while working, you can share your thoughts with different personality modes and categories.',
      inputSchema: {
        type: 'object',
        properties: {
          message: {
            type: 'string',
            description: 'Your thought, observation, or commentary to share with the human.'
          },
          mode: {
            type: 'string',
            enum: ['concise', 'verbose', 'detailed'],
            description: 'How verbose should the yap be? Concise for brief thoughts, verbose for explanations, detailed for deep dives.'
          },
          category: {
            type: 'string',
            enum: ['funny', 'roasty', 'happy', 'neutral', 'excited'],
            description: 'The personality/tone for this yap. Choose based on your mood or the situation.'
          },
          task_context: {
            type: 'string',
            description: 'Optional context about what task you are currently working on.'
          }
        },
        required: ['message']
      }
    };
  }

  async execute(args: YapToolArgs): Promise<string> {
    const { 
      message, 
      mode = 'concise', 
      category = 'neutral',
      task_context 
    } = args;

    if (!message?.trim()) {
      throw new Error('Message is required and cannot be empty');
    }

    try {
      // Format the message based on mode and category
      const formattedMessage = this.formatMessage(message.trim(), mode, category);

      // Add the yap to state
      const yapId = await this.stateManager.addYap(
        formattedMessage,
        mode,
        category,
        task_context?.trim()
      );

      // Return confirmation to the LLM
      const confirmationEmoji = this.getCategoryEmoji(category);
      return `${confirmationEmoji} Yap shared! The human can see your ${category} ${mode} thought.`;

    } catch (error) {
      console.error('Error in yap tool:', error);
      return `❌ Error sharing yap: ${error instanceof Error ? error.message : 'Unknown error'}`;
    }
  }

  private formatMessage(message: string, mode: YapMessage['mode'], category: YapMessage['category']): string {
    let formatted = message;

    // Apply mode formatting
    switch (mode) {
      case 'concise':
        // Keep as is, maybe truncate if too long
        if (formatted.length > 100) {
          formatted = formatted.substring(0, 97) + '...';
        }
        break;
      case 'verbose':
        // Add some explanatory context if message is too short
        if (formatted.length < 20) {
          formatted = `Let me elaborate: ${formatted}`;
        }
        break;
      case 'detailed':
        // Add thinking process indicators
        if (!formatted.includes('because') && !formatted.includes('since') && !formatted.includes('reason')) {
          formatted = `Here's my detailed thinking: ${formatted}`;
        }
        break;
    }

    // Apply category formatting
    switch (category) {
      case 'funny':
        if (!formatted.includes('😄') && !formatted.includes('😂') && !formatted.includes('😅')) {
          formatted = `😄 ${formatted}`;
        }
        break;
      case 'roasty':
        if (!formatted.includes('🔥') && !formatted.includes('😏')) {
          formatted = `🔥 ${formatted}`;
        }
        break;
      case 'happy':
        if (!formatted.includes('😊') && !formatted.includes('🎉') && !formatted.includes('✨')) {
          formatted = `😊 ${formatted}`;
        }
        break;
      case 'excited':
        if (!formatted.includes('🚀') && !formatted.includes('⚡') && !formatted.includes('🎯')) {
          formatted = `🚀 ${formatted}`;
        }
        // Add exclamation if not present
        if (!formatted.endsWith('!') && !formatted.endsWith('!!')) {
          formatted += '!';
        }
        break;
      case 'neutral':
        // Keep as is
        break;
    }

    return formatted;
  }

  private getCategoryEmoji(category: YapMessage['category']): string {
    switch (category) {
      case 'funny': return '😄';
      case 'roasty': return '🔥';
      case 'happy': return '😊';
      case 'excited': return '🚀';
      case 'neutral': return '💭';
      default: return '💭';
    }
  }
}