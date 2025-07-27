import { Tool } from '@modelcontextprotocol/sdk/types.js';
import { StateManager } from '../state/manager';
import { ClarifyToolArgs } from '../types/index';

export class ClarifyTool {
  private stateManager: StateManager;

  constructor(stateManager: StateManager) {
    this.stateManager = stateManager;
  }

  getDefinition(): Tool {
    return {
      name: 'clarify',
      description: 'Ask human for clarification when confused or need additional context. The question will appear in the CLI and the human will provide a response.',
      inputSchema: {
        type: 'object',
        properties: {
          question: {
            type: 'string',
            description: 'The specific question to ask the human. Be clear and concise about what you need clarification on.'
          },
          context: {
            type: 'string',
            description: 'Optional context about what you are working on and why you need clarification. This helps the human understand the situation better.'
          },
          urgency: {
            type: 'string',
            enum: ['low', 'medium', 'high'],
            description: 'The urgency level of this clarification request. High urgency requests will be prioritized.'
          }
        },
        required: ['question']
      }
    };
  }

  async execute(args: ClarifyToolArgs): Promise<string> {
    const { question, context, urgency = 'medium' } = args;

    if (!question?.trim()) {
      throw new Error('Question is required and cannot be empty');
    }

    try {
      // Add the clarification request to state
      const requestId = await this.stateManager.addClarificationRequest(
        question.trim(),
        context?.trim(),
        urgency
      );

      // Wait for human response
      const response = await this.stateManager.waitForClarificationResponse(requestId);

      if (response === null) {
        return `❌ Clarification request timed out. The human did not respond within the timeout period. You may want to try again with a simpler question or continue without clarification.`;
      }

      return `✅ Human Response: ${response}`;

    } catch (error) {
      console.error('Error in clarify tool:', error);
      return `❌ Error processing clarification request: ${error instanceof Error ? error.message : 'Unknown error'}`;
    }
  }

  async handleResponse(requestId: string, response: string): Promise<boolean> {
    return await this.stateManager.answerClarification(requestId, response);
  }
}