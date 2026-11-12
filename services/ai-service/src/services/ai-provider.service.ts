import OpenAI from 'openai';

interface AIProvider {
  generateResponse(question: string, context: any): Promise<string>;
}

class MockAIProvider implements AIProvider {
  async generateResponse(question: string, context: any): Promise<string> {
    const { diagnosis, requiredWork, estimatedCost, status } = context;

    // Simple rule-based responses
    if (question.toLowerCase().includes('diagnosis') || question.toLowerCase().includes('what') && question.toLowerCase().includes('mean')) {
      return `Based on the garage's official diagnosis: "${diagnosis}"\n\nThis means that the technician has identified this issue with your vehicle. The diagnosis is the professional assessment made by our mechanics after inspecting your vehicle. This is the official information provided by the garage, and I'm here to help explain it in simpler terms if needed.`;
    }

    if (question.toLowerCase().includes('why') || question.toLowerCase().includes('reason')) {
      return `According to the garage's assessment, the required work is: "${requiredWork}"\n\nThis repair work is necessary to address the diagnosed issue. The estimated cost is €${estimatedCost}. The current status of your repair is: ${status}. Please note that this is the official information from the garage, and I can only provide explanations based on what the mechanics have determined.`;
    }

    if (question.toLowerCase().includes('cost') || question.toLowerCase().includes('price') || question.toLowerCase().includes('pay')) {
      return `The estimated cost for your repair is €${estimatedCost}. This estimate is provided by the garage based on the diagnosis and required work. The actual final cost may vary slightly, but the garage will inform you of any changes before completing the work.`;
    }

    if (question.toLowerCase().includes('when') || question.toLowerCase().includes('ready') || question.toLowerCase().includes('pickup')) {
      const { expectedPickupDate } = context;
      return `According to the garage, your expected pickup date is: ${expectedPickupDate}. The current status is: ${status}. The garage will notify you when your vehicle is ready for pickup.`;
    }

    // Default response
    return `I can help explain the repair information provided by the garage. Here's what I know:\n\n- Diagnosis: ${diagnosis}\n- Required Work: ${requiredWork}\n- Estimated Cost: €${estimatedCost}\n- Status: ${status}\n\nPlease note that I can only provide explanations based on the official information from the garage. I cannot modify the diagnosis, cost, or repair details. If you have specific questions about the diagnosis or required work, feel free to ask!`;
  }
}

class OpenAIProvider implements AIProvider {
  private client: OpenAI;

  constructor() {
    const isGroq = process.env.AI_PROVIDER === 'groq';
    this.client = new OpenAI({
      apiKey: process.env.AI_API_KEY,
      baseURL: isGroq ? 'https://api.groq.com/openai/v1' : undefined,
    });
  }

  async generateResponse(question: string, context: any): Promise<string> {
    try {
      const systemPrompt = `You are a helpful AI assistant for a car repair garage. Your role is to explain repair diagnoses and required work to customers in simple, understandable terms.

IMPORTANT RULES:
1. You can ONLY explain existing information from the garage
2. You CANNOT create new diagnoses
3. You CANNOT modify repair costs
4. You CANNOT change repair status
5. You CANNOT approve or cancel repairs
6. Always clarify that the official information comes from the garage mechanics

Current repair information:
- Diagnosis: ${context.diagnosis}
- Required Work: ${context.requiredWork}
- Estimated Cost: €${context.estimatedCost}
- Expected Pickup: ${context.expectedPickupDate}
- Status: ${context.status}
- Vehicle: ${context.vehicleYear} ${context.vehicleMake} ${context.vehicleModel}

Provide clear, helpful explanations while respecting these boundaries.`;

      const completion = await this.client.chat.completions.create({
        model: process.env.AI_MODEL || 'gpt-3.5-turbo',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: question },
        ],
        max_tokens: 500,
        temperature: 0.7,
      });

      return completion.choices[0]?.message?.content || 'I apologize, but I could not generate a response.';
    } catch (error) {
      console.error('OpenAI API error:', error);
      // Fallback to mock provider
      const mockProvider = new MockAIProvider();
      return mockProvider.generateResponse(question, context);
    }
  }
}

export function getAIProvider(): AIProvider {
  const provider = process.env.AI_PROVIDER || 'mock';

  if ((provider === 'openai' || provider === 'groq') && process.env.AI_API_KEY) {
    return new OpenAIProvider();
  }

  return new MockAIProvider();
}
