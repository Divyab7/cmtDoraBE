# CMT-BackEnd Project

## AI Provider Utility

The application supports multiple AI providers through a unified interface. You can switch between providers by changing the `AI_PROVIDER` environment variable.

### Supported Providers

- `perplexity` (default): Uses Perplexity AI API
- `openai`: Uses OpenAI API
- `gemini`: Uses Google's Gemini API
- `deepseek`: Uses DeepSeek API

### Configuration

Set the following environment variables in your `.env` file:

```
# Select which AI provider to use
AI_PROVIDER=perplexity

# API keys for each provider
PERPLEXITY_API_KEY=your_perplexity_key
OPENAI_API_KEY=your_openai_key
GEMINI_API_KEY=your_gemini_key
DEEPSEEK_API_KEY=your_deepseek_key
```

### Usage Example

```javascript
const aiProvider = require('./utils/aiProvider');

// Simple non-streaming request
const result = await aiProvider.generateCompletion([
  { role: 'system', content: 'You are a helpful assistant.' },
  { role: 'user', content: 'Tell me about travel in Europe.' }
], {
  temperature: 0.7,
  max_tokens: 500
});

if (result.success) {
  console.log(result.content);
} else {
  console.error('Failed to generate completion');
}

// Streaming example
await aiProvider.generateStream(
  [
    { role: 'system', content: 'You are a helpful assistant.' },
    { role: 'user', content: 'Tell me about travel in Europe.' }
  ],
  { temperature: 0.7 },
  (chunk) => {
    // Process each chunk as it arrives
    process.stdout.write(chunk);
  },
  (error) => {
    console.error('Stream error:', error);
  }
);
```
