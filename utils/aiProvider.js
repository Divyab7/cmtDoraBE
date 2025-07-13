const axios = require('axios');

/**
 * AI Provider Utility
 * 
 * This utility provides a unified interface to interact with various AI APIs
 * The active provider is determined by the AI_PROVIDER environment variable
 * Supported providers: 'perplexity', 'openai', 'gemini', 'deepseek'
 */

// Configuration for different AI providers
const providers = {
  perplexity: {
    baseUrl: 'https://api.perplexity.ai/chat/completions',
    defaultModel: 'sonar',
    getHeaders: () => ({
      'Authorization': `Bearer ${process.env.PERPLEXITY_API_KEY}`,
      'Accept': 'application/json',
      'Content-Type': 'application/json'
    }),
    formatRequest: (messages, options = {}) => ({
      model: options.model || providers.perplexity.defaultModel,
      messages,
      temperature: options.temperature ?? 0.2,
      top_p: options.top_p ?? 0.9,
      return_images: options.return_images ?? false,
      return_related_questions: options.return_related_questions ?? false,
      top_k: options.top_k ?? 0,
      stream: options.stream ?? false,
      presence_penalty: options.presence_penalty ?? 0,
      frequency_penalty: options.frequency_penalty ?? 1,
      max_tokens: options.max_tokens,
      web_search_options: options.web_search_options ?? {
        search_context_size: "low"
      }
    }),
    parseResponse: (data) => ({
      content: data.choices[0].message.content,
      rawResponse: data
    })
  },
  
  openai: {
    baseUrl: 'https://api.openai.com/v1/chat/completions',
    defaultModel: 'gpt-3.5-turbo',
    getHeaders: () => ({
      'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
      'Accept': 'application/json',
      'Content-Type': 'application/json'
    }),
    formatRequest: (messages, options = {}) => ({
      model: options.model || providers.openai.defaultModel,
      messages,
      temperature: options.temperature ?? 0.7,
      top_p: options.top_p ?? 1,
      stream: options.stream ?? false,
      presence_penalty: options.presence_penalty ?? 0,
      frequency_penalty: options.frequency_penalty ?? 0,
      max_tokens: options.max_tokens
    }),
    parseResponse: (data) => ({
      content: data.choices[0].message.content,
      rawResponse: data
    })
  },
  
  gemini: {
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta/models',
    defaultModel: 'gemini-2.0-flash',
    getHeaders: () => ({
      'x-goog-api-key': process.env.GEMINI_API_KEY,
      'Content-Type': 'application/json'
    }),
    formatRequest: (messages, options = {}) => {
      // Convert chat messages to Gemini format
      const contents = [];
      let currentRole = null;
      let parts = [];
      
      for (const message of messages) {
        if (message.role === 'system') {
          // Add system message as a user message with special handling
          contents.push({
            role: 'user',
            parts: [{ text: `[System Instruction]: ${message.content}` }]
          });
        } else if (message.role === 'user' || message.role === 'assistant') {
          // Map to Gemini roles (user = user, assistant = model)
          const geminiRole = message.role === 'user' ? 'user' : 'model';
          
          // If same role as previous message, combine parts
          if (currentRole === geminiRole && contents.length > 0) {
            contents[contents.length - 1].parts.push({ text: message.content });
          } else {
            // New role, create new content object
            contents.push({
              role: geminiRole,
              parts: [{ text: message.content }]
            });
          }
          
          currentRole = geminiRole;
        }
      }
      
      // Build final request based on stream option
      const model = options.model || providers.gemini.defaultModel;
      const apiUrl = `${providers.gemini.baseUrl}/${model}:${options.stream ? 'streamGenerateContent' : 'generateContent'}`;
      
      return {
        apiUrl,
        body: {
          contents,
          generationConfig: {
            temperature: options.temperature ?? 0.7,
            topP: options.top_p ?? 0.95,
            topK: options.top_k ?? 40,
            maxOutputTokens: options.max_tokens ?? 2048,
          }
        }
      };
    },
    parseResponse: (data) => ({
      content: data.candidates[0].content.parts[0].text,
      rawResponse: data
    })
  },
  
  deepseek: {
    baseUrl: 'https://api.deepseek.com/v1/chat/completions',
    defaultModel: 'deepseek-chat',
    getHeaders: () => ({
      'Authorization': `Bearer ${process.env.DEEPSEEK_API_KEY}`,
      'Accept': 'application/json',
      'Content-Type': 'application/json'
    }),
    formatRequest: (messages, options = {}) => ({
      model: options.model || providers.deepseek.defaultModel,
      messages,
      temperature: options.temperature ?? 0.7,
      top_p: options.top_p ?? 0.95,
      stream: options.stream ?? false,
      max_tokens: options.max_tokens
    }),
    parseResponse: (data) => ({
      content: data.choices[0].message.content,
      rawResponse: data
    })
  }
};

/**
 * Get the active AI provider configuration based on environment variable
 * @returns {Object} The provider configuration
 */
function getActiveProvider() {
  const providerName = process.env.AI_PROVIDER?.toLowerCase() || 'perplexity';
  
  if (!providers[providerName]) {
    console.warn(`Unknown AI provider: ${providerName}. Falling back to Perplexity.`);
    return providers.perplexity;
  }
  
  return providers[providerName];
}

/**
 * Sanitize conversation history to ensure messages follow the required format
 * @param {Array} messages - Array of message objects with role and content
 * @returns {Array} Sanitized array of messages
 */
function sanitizeConversationHistory(messages) {
  if (!messages || messages.length === 0) {
    return [];
  }
  
  // Create a new array for sanitized messages
  const sanitized = [];
  
  // First, extract all system messages and add them to the beginning
  const systemMessages = messages.filter(msg => msg.role === 'system');
  sanitized.push(...systemMessages);
  
  // Get non-system messages and sort them by timestamp if available
  const nonSystemMessages = messages.filter(msg => msg.role !== 'system');
  
  // Sort by timestamp if available
  let sortedMessages = nonSystemMessages;
  if (nonSystemMessages.length > 0 && nonSystemMessages[0].timestamp) {
    sortedMessages = [...nonSystemMessages].sort((a, b) => {
      return new Date(a.timestamp || 0) - new Date(b.timestamp || 0);
    });
  }
  
  // If we have no non-system messages, return just the system messages
  if (sortedMessages.length === 0) {
    return sanitized;
  }
  
  // Group consecutive messages by the same role, combining their content
  const consolidatedMessages = [];
  let currentRole = null;
  let currentContent = [];
  
  for (const msg of sortedMessages) {
    if (currentRole === null || currentRole === msg.role) {
      // Same role, collect content
      currentRole = msg.role;
      currentContent.push(msg.content);
    } else {
      // Role changed, add the consolidated message and start a new one
      consolidatedMessages.push({
        role: currentRole,
        content: currentContent.join('\n\n')
      });
      currentRole = msg.role;
      currentContent = [msg.content];
    }
  }
  
  // Add the last consolidated message
  if (currentContent.length > 0) {
    consolidatedMessages.push({
      role: currentRole,
      content: currentContent.join('\n\n')
    });
  }
  
  // Ensure proper alternation - start with a user message if needed
  let processedMessages = [];
  
  // If first message is from assistant, insert a dummy user message
  if (consolidatedMessages.length > 0 && consolidatedMessages[0].role === 'assistant') {
    processedMessages.push({ role: 'user', content: 'Hello' });
  }
  
  // Add all consolidated messages
  processedMessages = [...processedMessages, ...consolidatedMessages];
  
  // If the last message is from an assistant, add a user message to maintain alternation
  if (processedMessages.length > 0 && processedMessages[processedMessages.length - 1].role === 'assistant') {
    processedMessages.push({ role: 'user', content: 'Please respond to my question' });
  }
  
  // Combine system messages with the rest of the conversation
  return [...sanitized, ...processedMessages];
}

/**
 * Generate AI completion with the active provider
 * 
 * @param {Array} messages - Array of message objects with role and content
 * @param {Object} options - Additional options for the request
 * @param {String} options.model - Model to use (provider-specific)
 * @param {Number} options.temperature - Temperature for generation
 * @param {Boolean} options.stream - Whether to stream the response
 * @param {Number} options.max_tokens - Maximum tokens to generate
 * @param {String} defaultResponse - Fallback response for errors
 * @returns {Object} Response object with success status and content
 */
async function generateCompletion(messages, options = {}, defaultResponse = "I'm having trouble right now. Let's try again in a moment.") {
  try {
    const provider = getActiveProvider();
    const sanitizedMessages = sanitizeConversationHistory(messages);
    
    // Format request based on provider
    const requestData = provider.formatRequest(sanitizedMessages, options);
    
    // For Gemini which has a different URL structure
    const url = provider === providers.gemini 
      ? requestData.apiUrl 
      : provider.baseUrl;
    
    const body = provider === providers.gemini 
      ? requestData.body 
      : requestData;
    
    const response = await axios.post(
      url,
      body,
      { headers: provider.getHeaders() }
    );
    
    // Check if we have a valid response structure
    if (!response.data) {
      console.error('Unexpected response format from AI provider:', JSON.stringify(response.data));
      return { success: false, content: defaultResponse };
    }
    
    // Parse response based on provider
    const parsedResponse = provider.parseResponse(response.data);
    
    return { 
      success: true, 
      content: parsedResponse.content,
      rawResponse: parsedResponse.rawResponse
    };
  } catch (error) {
    console.error('Error calling AI provider:', error.response ? error.response.data : error.message);
    return { success: false, content: defaultResponse };
  }
}

/**
 * Generate AI stream with the active provider
 * Note: This is a stub for streaming implementation which will need to be expanded
 * based on your specific streaming needs
 */
async function generateStream(messages, options = {}, onChunk = () => {}, onError = () => {}) {
  // Set streaming option
  options.stream = true;
  
  try {
    const provider = getActiveProvider();
    const sanitizedMessages = sanitizeConversationHistory(messages);
    
    // Format request based on provider
    const requestData = provider.formatRequest(sanitizedMessages, options);
    
    // For Gemini which has a different URL structure
    const url = provider === providers.gemini 
      ? requestData.apiUrl 
      : provider.baseUrl;
    
    const body = provider === providers.gemini 
      ? requestData.body 
      : requestData;
    
    // Use axios for streaming
    const response = await axios({
      method: 'post',
      url: url,
      data: body,
      headers: provider.getHeaders(),
      responseType: 'stream'
    });
    
    // Different providers have different streaming formats
    if (provider === providers.gemini) {
      // For Gemini, use a buffer to accumulate partial JSON chunks
      let jsonBuffer = '';
      
      response.data.on('data', (chunk) => {
        try {
          const data = chunk.toString();
          jsonBuffer += data;
          
          // Try to parse complete JSON objects from the buffer
          let startPos = 0;
          let endPos;
          
          // Find potential complete JSON objects in the buffer
          while (startPos < jsonBuffer.length) {
            // Find the start of a potential JSON object
            const jsonStart = jsonBuffer.indexOf('{', startPos);
            if (jsonStart === -1) {
              // No start of JSON found, clear everything before this point
              jsonBuffer = '';
              break;
            }
            
            // Find a potential end of the JSON object
            endPos = -1;
            let bracketCount = 0;
            let inString = false;
            let escapeNext = false;
            
            for (let i = jsonStart; i < jsonBuffer.length; i++) {
              const char = jsonBuffer[i];
              
              if (escapeNext) {
                escapeNext = false;
                continue;
              }
              
              if (char === '\\' && inString) {
                escapeNext = true;
                continue;
              }
              
              if (char === '"' && !escapeNext) {
                inString = !inString;
                continue;
              }
              
              if (!inString) {
                if (char === '{') bracketCount++;
                else if (char === '}') {
                  bracketCount--;
                  if (bracketCount === 0) {
                    endPos = i + 1;
                    break;
                  }
                }
              }
            }
            
            // If we found a complete JSON object
            if (endPos !== -1) {
              const jsonStr = jsonBuffer.substring(jsonStart, endPos);
              
              try {
                // Parse the JSON object
                const parsedData = JSON.parse(jsonStr);
                
                // Extract the content if available
                const content = parsedData.candidates?.[0]?.content?.parts?.[0]?.text || '';
                if (content) {
                  onChunk(content, parsedData);
                }
                
                // Move past this JSON object
                startPos = endPos;
              } catch (e) {
                // If we can't parse it, it might be incomplete or malformed
                startPos = jsonStart + 1;
              }
            } else {
              // JSON object is incomplete, keep it in the buffer and wait for more data
              jsonBuffer = jsonBuffer.substring(jsonStart);
              break;
            }
          }
        } catch (err) {
          console.error('Error processing stream chunk:', err);
        }
      });
    } else if (provider === providers.openai || provider === providers.perplexity) {
      // Handle SSE format (used by OpenAI and Perplexity)
      response.data.on('data', (chunk) => {
        try {
          // Process chunk based on provider format
          const data = chunk.toString();
          
          const lines = data.split('\n').filter(line => line.trim() !== '');
          
          for (const line of lines) {
            if (line.startsWith('data: ')) {
              const jsonData = line.slice(6).trim();
              
              // Skip [DONE] message
              if (jsonData === '[DONE]') continue;
              
              try {
                const parsedData = JSON.parse(jsonData);
                const content = parsedData.choices[0]?.delta?.content || '';
                if (content) {
                  onChunk(content, parsedData);
                }
              } catch (e) {
                console.error('Error parsing streaming JSON:', e);
              }
            }
          }
        } catch (err) {
          console.error('Error processing stream chunk:', err);
        }
      });
    } else {
      // Generic handling for other providers
      response.data.on('data', (chunk) => {
        try {
          const data = chunk.toString();
          try {
            const parsedData = JSON.parse(data);
            onChunk(data, parsedData);
          } catch (e) {
            console.error('Error parsing streaming JSON:', e);
            // For non-JSON data, just pass it through
            onChunk(data, null);
          }
        } catch (err) {
          console.error('Error processing stream chunk:', err);
        }
      });
    }
    
    response.data.on('end', () => {
      // Stream completed
    });
    
    response.data.on('error', (err) => {
      console.error('Stream error:', err);
      onError(err);
    });
    
    return { success: true };
  } catch (error) {
    console.error('Error setting up stream:', error);
    onError(error);
    return { success: false };
  }
}

module.exports = {
  generateCompletion,
  generateStream,
  sanitizeConversationHistory,
  getActiveProvider
}; 