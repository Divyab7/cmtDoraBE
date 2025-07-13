const axios = require('axios');
const aiProvider = require('../utils/aiProvider');
const Trip = require('../models/Trip');

// async function handleAIQuery(req, res) {
//     const { messages } = req.body;
//     try {
//         // Prepare system message and user messages
//         const fullMessages = [
//             { role: 'system', content: 'You are an AI assistant designed to provide information and answer questions exclusively about travel and tourism. Your responses should be accurate, concise, short and informative based out of reliable sources.' },
//             ...messages
//         ];

//         // Use streaming API
//         res.setHeader('Content-Type', 'text/plain');
//         res.setHeader('Transfer-Encoding', 'chunked');

//         // Call aiProvider's streaming function
//         const streamResult = await aiProvider.generateStream(
//             fullMessages,
//             { temperature: 0.7 },
//             (chunk, rawData) => {
//                 res.write(chunk);
//             },
//             (error) => {
//                 console.error(`Streaming error: ${error.message}`);
//                 res.status(500).json({ error: 'Streaming error occurred' });
//             }
//         );

//         if (!streamResult.success) {
//             return res.status(500).json({ error: 'Failed to initialize stream' });
//         }
//     } catch (error) {
//         return res.status(500).json({
//             error: 'Internal Server Error',
//         });
//     }
// }

// Define trip planning stages
const PLAN_TRIP_STAGES = {
    INIT: 'init',
    DESTINATION: 'destination',
    DATES: 'dates',
    DURATION: 'duration',
    GROUP_TYPE: 'group_type',
    TRIP_PURPOSE: 'trip_purpose',
    BUDGET: 'budget',
    BUCKET_LIST: 'bucket_list',
    CONFIRM: 'confirm'
};

// Get existing trip in planning state
async function getExistingPlanningTrip(userId, destinations = []) {
    try {
        if (!userId) return null;
        
        // If no destinations provided, fall back to the original behavior
        if (!destinations || destinations.length === 0) {
            const trip = await Trip.findOne({ 
                userId: userId,
                status: 'planning'
            }).sort({ createdAt: -1 });
            
            return trip;
        }
        
        // Convert destinations to lowercase for case-insensitive comparison
        const normalizedDestinations = destinations.map(dest => dest.toLowerCase());
        
        // Find all planning trips for this user
        const planningTrips = await Trip.find({ 
            userId: userId,
            status: 'planning'
        });
        
        // Check each trip for matching destinations
        for (const trip of planningTrips) {
            // Extract destination locations from the trip
            const tripDestinations = trip.destinations.map(dest => 
                dest.location.toLowerCase()
            );
            
            // Check if any destination matches
            const hasMatchingDestination = normalizedDestinations.some(plannedDest => 
                tripDestinations.some(tripDest => 
                    tripDest.includes(plannedDest) || plannedDest.includes(tripDest)
                )
            );
            
            if (hasMatchingDestination) {
                console.log(`Found existing trip with matching destination: ${trip._id}`);
                return trip;
            }
        }
        
        // If no matching trip found, return null
        console.log('No matching trip found, will create new trip');
        return null;
    } catch (error) {
        console.error('Error fetching planning trip:', error);
        return null;
    }
}

async function processQuery(req, res) {
    const { messages } = req.body;
    const userId = req.user?.id; // User ID from auth token if available
    try {
        // Validate input
        if (!messages || !Array.isArray(messages) || messages.length === 0) {
            return res.status(400).json({ error: 'Invalid or empty messages array' });
        }

        // Get the last message (which we need to classify)
        const lastMessage = messages[messages.length - 1];
        
        // Check if the last message is empty
        if (!lastMessage || !lastMessage.content || typeof lastMessage.content !== 'string') {
            return res.status(400).json({ error: 'Last message is invalid or empty' });
        }

        // Check if the message is a URL
        const urlInfo = detectURL(lastMessage.content);
        
        if (urlInfo.isUrl) {
            // Set SSE headers for streaming
            res.setHeader('Content-Type', 'text/event-stream');
            res.setHeader('Cache-Control', 'no-cache');
            res.setHeader('Connection', 'keep-alive');

            // First, send the intentType as bucket_list
            const intentTypeEvent = JSON.stringify({ intentType: 'bucket_list' });
            res.write(`data: ${intentTypeEvent}\n\n`);
            if (res.flush) {
                res.flush();
            }

            try {
                // Import the fetchReelDetailsV2 function from reelsController
                const reelsController = require('./reelsController');
                
                // Create a mock req and res object to capture the response
                const mockReq = {
                    params: { type: urlInfo.urlType },
                    query: { 
                        url: urlInfo.contentId,
                        creator: urlInfo.creator || ''
                    }
                };
                
                let videoContentDetails = null;
                
                // Create a mock res object that captures the response
                const mockRes = {
                    json: (data) => {
                        videoContentDetails = data;
                    }
                };
                
                // Call fetchReelDetailsV2
                await reelsController.fetchReelDetailsV2(mockReq, mockRes);
                
                if (!videoContentDetails || videoContentDetails.error) {
                    throw new Error(videoContentDetails?.error || 'Failed to fetch video content');
                }
                
                // Send an initial event with just the videoContent details
                // This ensures the UI can show the button immediately
                const videoDetailsEvent = JSON.stringify({
                    videoContent: videoContentDetails,
                    choices: [{ delta: { content: "Analyzing your link, please wait...\n\n" } }]
                });
                res.write(`data: ${videoDetailsEvent}\n\n`);
                if (res.flush) {
                    res.flush();
                }
                
                // Now get the full bucket details
                const bucketDetailsReq = {
                    params: { id: videoContentDetails.id }
                };
                
                let bucketList = [];
                
                // Create a mock res for bucket details
                const bucketDetailsRes = {
                    json: (data) => {
                        bucketList = data;
                    }
                };
                
                // Get the full bucket details
                await reelsController.fetchReelDetailsById(bucketDetailsReq, bucketDetailsRes);
                
                // Generate description for buckets using AI
                let bucketDescription = '';
                if (bucketList && bucketList.length > 0) {
                    const locationNames = bucketList.map(item => {
                        const placeName = item.mapData?.placePrediction?.place || '';
                        const activityName = item.name || '';
                        return `${activityName} at ${placeName}`;
                    }).join(', ');
                    
                    const bucketSystemPrompt = `You are Dora AI, a travel assistant. Analyze this list of travel locations and activities from a ${urlInfo.urlType} link and provide a brief, enthusiastic summary. Be concise yet informative.`;
                    
                    const prompt = `I've analyzed a ${urlInfo.urlType} content and found these locations and activities: ${locationNames}. 
                    
                    Please provide a brief summary (2-3 sentences) describing what I found, why these places might be interesting, and what a traveler could do there. Make it sound exciting but factual.`;
                    
                    // Explicitly initialize counter to 0 before streaming
                    let contentChunksSent = 0;
                    
                    try {
                        await new Promise((resolve, reject) => {
                            aiProvider.generateStream(
                                [
                                    { role: 'system', content: bucketSystemPrompt },
                                    { role: 'user', content: prompt }
                                ],
                                { temperature: 0.7 },
                                (chunk, rawData) => {
                                    bucketDescription += chunk;
                                    contentChunksSent++;
                                    
                                    // Sanitize chunk to remove any characters that might break JSON
                                    const sanitizedChunk = chunk
                                        .replace(/\\/g, '\\\\')  // Escape backslashes first
                                        .replace(/"/g, '\\"')    // Escape double quotes
                                        .replace(/\n/g, '\\n')   // Replace newlines with escaped newlines
                                        .replace(/\r/g, '\\r')   // Replace carriage returns
                                        .replace(/\t/g, '\\t');  // Replace tabs
                                        
                                    
                                    // Format chunk as an OpenAI-like delta for frontend - identical to what the frontend expects
                                    const chunkEvent = JSON.stringify({
                                        choices: [
                                            {
                                                delta: {
                                                    content: sanitizedChunk
                                                }
                                            }
                                        ],
                                        videoContent: videoContentDetails  // Include video content details in every chunk
                                    });
                                    
                                    // Verify the JSON is valid
                                    try {
                                        JSON.parse(chunkEvent);
                                    } catch (e) {
                                        console.error('Invalid JSON in chunk event:', e);
                                        // Send a simpler version that's guaranteed to work
                                        const safeEvent = JSON.stringify({
                                            choices: [{ delta: { content: sanitizedChunk.substring(0, 100) } }],
                                            videoContent: videoContentDetails
                                        });
                                        res.write(`data: ${safeEvent}\n\n`);
                                        if (res.flush) {
                                            res.flush();
                                        }
                                        return; // Skip the normal send
                                    }
                                    
                                    // Send the chunk
                                    const sse = `data: ${chunkEvent}\n\n`;
                                    res.write(sse);
                                    if (res.flush) {
                                        res.flush();
                                    }
                                },
                                (error) => {
                                    console.error(`Streaming error: ${error.message}`);
                                    reject(error);
                                }
                            ).then(() => {
                                resolve();
                            }).catch(error => {
                                reject(error);
                            });
                        });
                        
                        // *** CRITICAL FIX: Only check content after streaming is FULLY complete ***
                        // Add a small delay to ensure all chunks are processed before checking
                        await new Promise(resolve => setTimeout(resolve, 1000));
                        
                        // Check if we received any content chunks - THIS CHECK WAS PREVIOUSLY HAPPENING TOO EARLY
                        if (contentChunksSent === 0 && (!bucketDescription || bucketDescription.trim() === '')) {
                            console.warn("No content chunks were received after stream completed");
                            const fallbackContent = "I've analyzed this content and found some interesting travel spots! Check out the details below.";
                            const fallbackEvent = JSON.stringify({
                                choices: [
                                    {
                                        delta: {
                                            content: fallbackContent
                                        }
                                    }
                                ],
                                videoContent: videoContentDetails
                            });
                            
                            res.write(`data: ${fallbackEvent}\n\n`);
                            if (res.flush) {
                                res.flush();
                            }
                        } else {
                            // If needed, send the final collected description as one event
                            if (bucketDescription && bucketDescription.trim() !== '' && contentChunksSent > 0) {
                                console.log("Content stream completed successfully");
                            }
                        }
                        

                            
                        res.write(`data: [DONE]\n\n`);
                        return res.end();
                    } catch (error) {
                        console.error("Error streaming content:", error);
                        // Send an error message as a streaming event
                        const errorEvent = JSON.stringify({
                            choices: [
                                {
                                    delta: {
                                        content: "I encountered an issue while analyzing this content. Please try again."
                                    }
                                }
                            ],
                            videoContent: videoContentDetails
                        });
                        
                        res.write(`data: ${errorEvent}\n\n`);
                        res.write(`data: [DONE]\n\n`);
                        return res.end();
                    }
                } else {
                    // If no buckets were found, send a simple message
                    const noLocationsEvent = JSON.stringify({
                        choices: [
                            {
                                delta: {
                                    content: "I couldn't find any specific travel destinations in the content description. I am deep scanning the content and listing out the locations and activities. Reopen the link to see the full list in some time."
                                }
                            }
                        ],
                        videoContent: videoContentDetails  // Include video content details
                    });
                    
                    res.write(`data: ${noLocationsEvent}\n\n`);
                    res.write(`data: [DONE]\n\n`);
                    return res.end();
                }
            } catch (error) {
                console.error('Error processing URL:', error);
                
                // Send error as a streaming event
                const errorEvent = JSON.stringify({
                    error: 'Error processing URL',
                    details: error.message
                });
                
                res.write(`data: ${errorEvent}\n\n`);
                res.write(`data: [DONE]\n\n`);
                return res.end();
            }
        }

        // If not a URL, classify the intent using AI
        // Prepare messages for intent classification with appropriate system prompt
        const systemMessage = {
            role: 'system',
            content: `You are a travel assistant capable of categorizing user queries into these specific intent types:
            - "bucket_list" - for queries about discovering new destinations or travel ideas
            - "plan_trip" - for queries related to planning a trip
            - "currency" - queries related to currency conversion
            - "packing" - queries related to packing help
            - "budget" - queries about estimating budget for travel
            - "emergency" - emergency situation related queries for tourists
            - "translate" - queries about language phrases for travel
            - "crowd" - queries related to crowd estimation
            - "documents" - queries about documents required for travel
            - "holiday" - queries about holiday and leave combinations
            - "excuse" - queries about getting excuses for leaves
            - "chat_query" - default or general travel related queries
            
            For the last user message, analyze its intent and respond with ONLY ONE of these exact words. If none match exactly, use "chat_query" as the default for travel-related queries.`
        };

        // Use aiProvider to classify the intent
        const result = await aiProvider.generateCompletion([
            systemMessage,
            lastMessage
        ], {
            temperature: 0.2,
            max_tokens: 20 // We just need a single word response
        });
        if (!result.success) {
            return res.status(500).json({ error: 'Failed to classify intent' });
        }

        // Extract and normalize the intent from the AI response
        let intentType = result.content.trim().toLowerCase();
        
        // Validate intent is one of our expected types
        const validIntents = [
            'bucket_list', 'plan_trip', 'chat_query', 
            'currency', 'packing', 'budget', 'emergency', 
            'translate', 'crowd', 'documents', 'holiday', 'excuse'
        ];
        
        // If not a valid intent, default to chat_query
        if (!validIntents.includes(intentType)) {
            intentType = 'chat_query';
        }

        // Configure proper SSE headers
        res.setHeader('Content-Type', 'text/event-stream');
        res.setHeader('Cache-Control', 'no-cache');
        res.setHeader('Connection', 'keep-alive');

        // Handle special case for plan_trip intent
        if (intentType === 'plan_trip') {
            try {
                console.log("Processing plan_trip intent");
                
            // Check if there's an existing planning session in the messages
            const planningState = extractPlanningState(messages);
                console.log("Extracted planning state:", planningState ? planningState.stage : "None");
            
            // If no planning state found, start a new planning session
            if (!planningState) {
                // Try to find an existing trip in planning stage
                // Extract potential destinations from the message
                let possibleDestinations = [];
                if (userId) {
                    // Do a quick extraction of possible destinations from the message
                    try {
                        const destinationExtractPrompt = `Extract only destination locations from this travel query. Respond with a JSON array of strings, nothing else: "${lastMessage.content}"`;
                        const destinationResult = await aiProvider.generateCompletion([
                            { role: 'user', content: destinationExtractPrompt }
                        ], {
                            temperature: 0.1,
                            max_tokens: 100
                        });
                            
                        if (destinationResult.success) {
                            // Parse the result to get destinations
                            try {
                                const jsonMatch = destinationResult.content.match(/(\[[\s\S]*\])/);
                                if (jsonMatch) {
                                    possibleDestinations = JSON.parse(jsonMatch[0]);
                                    console.log("Extracted possible destinations:", possibleDestinations);
                                }
                            } catch (error) {
                                console.error("Error parsing destination extraction result:", error);
                            }
                        }
                    } catch (error) {
                        console.error("Error extracting destinations:", error);
                    }
                }

                // Now look for existing trips with these destinations
                const existingTrip = userId ? await getExistingPlanningTrip(userId, possibleDestinations) : null;
                    console.log("Existing trip in planning stage:", existingTrip ? "Found" : "None");
                    
                    // Process the initial planning message
                    const newPlanningState = await processInitialPlanningMessage(lastMessage.content, existingTrip, userId);
                    console.log("Created new planning state, stage:", newPlanningState.stage);
                
                // FIRST: Send the intent type event with planning data
                const intentTypeEvent = JSON.stringify({ 
                    intentType,
                    planningMode: true,
                    planningState: newPlanningState
                });
                const intentTypeSSE = `data: ${intentTypeEvent}\n\n`;
                res.write(intentTypeSSE);
                
                // Flush the response to ensure the intent type reaches the client immediately
                if (res.flush) {
                    res.flush();
                }
                    
                    // Generate initial system message for planning mode
                    const planningSystemMessage = generatePlanningSystemMessage(newPlanningState);
                
                // THEN: Process the actual trip planning response
                await handlePlanningModeResponse(res, planningSystemMessage, messages, newPlanningState);
                
                // Finalize the response
                const doneEvent = `data: [DONE]\n\n`;
                res.write(doneEvent);
                return res.end();
            } else {
                // Continue existing planning session
                    console.log("Continuing existing planning session, current stage:", planningState.stage);
                    
                    // Store userId if not already present
                    if (!planningState.userId && userId) {
                        planningState.userId = userId;
                        console.log("Added userId to planning state");
                    }
                    
                    // Get previous tripConfig for comparison
                    const previousConfig = JSON.stringify(planningState.tripConfig);
                    
                // Process the user's response based on current stage
                    let updatedState = await processUserResponseForPlanning(lastMessage.content, planningState);
                    console.log("Updated planning state, new stage:", updatedState.stage);
                    
                    // Log changes to tripConfig
                    console.log("Previous tripConfig:", previousConfig);
                    console.log("New tripConfig:", JSON.stringify(updatedState.tripConfig));
                    
                    // Special handling for BUDGET -> BUCKET_LIST transition
                    if (planningState.stage === PLAN_TRIP_STAGES.BUDGET && 
                        updatedState.stage === PLAN_TRIP_STAGES.BUCKET_LIST && 
                        updatedState.userId) {
                        console.log("Transitioning from BUDGET to BUCKET_LIST, fetching bucket list items");
                        updatedState = await checkTripPlanningCompletionAndFetchBucketList(updatedState, updatedState.userId);
                    }
                    
                    // Also ensure we have bucket list data at the confirm stage
                    if (updatedState.stage === PLAN_TRIP_STAGES.CONFIRM && !updatedState.tripConfig.bucketList) {
                        console.log("At CONFIRM stage, ensuring bucket list data is available");
                        updatedState = await checkTripPlanningCompletionAndFetchBucketList(updatedState, updatedState.userId || userId);
                    }
                
                // Generate appropriate system message based on updated state
                const planningSystemMessage = generatePlanningSystemMessage(updatedState);
                    console.log("Generated planning system message");
                
                // Send the intent type event with updated planning data
                const intentTypeEvent = JSON.stringify({ 
                    intentType,
                    planningMode: true,
                    planningState: updatedState
                });
                const intentTypeSSE = `data: ${intentTypeEvent}\n\n`;
                res.write(intentTypeSSE);
                
                // Flush the response
                if (res.flush) {
                    res.flush();
                }
                
                // Process the actual trip planning response
                await handlePlanningModeResponse(res, planningSystemMessage, messages, updatedState);
                
                // Finalize the response
                const doneEvent = `data: [DONE]\n\n`;
                res.write(doneEvent);
                    return res.end();
                }
            } catch (error) {
                console.error('Error handling plan_trip intent:', error);
                const errorEvent = JSON.stringify({ error: 'Failed to process trip planning' });
                res.write(`data: ${errorEvent}\n\n`);
                res.write(`data: [DONE]\n\n`);
                return res.end();
            }
        }

        // FIRST: Send the intent type event
        const intentTypeEvent = JSON.stringify({ intentType });
        const intentTypeSSE = `data: ${intentTypeEvent}\n\n`;
        res.write(intentTypeSSE);

        // Flush the response to ensure the intent type reaches the client immediately
        if (res.flush) {
            res.flush();
        }

        // Add system message to provide context based on intent
        const systemPrompt = getSystemPromptForIntent(intentType);
        
        const fullMessages = [
            { role: 'system', content: systemPrompt },
            ...messages
        ];

        let responseTextBuffer = "";
        
        // Use a promise to wait for all chunks to be received before completing the stream
        await new Promise((resolve, reject) => {
            // Create a flag to track if we've had chunks
            let hasReceivedChunks = false;
            let isStreamingComplete = false;
            let streamTimeoutId = null;
            
            // Function to check if streaming is complete and resolve if appropriate
            const checkStreamComplete = () => {
                if (isStreamingComplete) {
                    clearTimeout(streamTimeoutId);
                    streamTimeoutId = setTimeout(() => {
                        resolve();
                    }, 2000);
                }
            };
            
            // THEN: Call aiProvider's streaming function to send response chunks
            aiProvider.generateStream(
            fullMessages,
            { temperature: 0.7 },
                (chunk, rawData) => {
                    hasReceivedChunks = true;
                    responseTextBuffer += chunk;
                    
                    // Format chunk as an OpenAI-like delta for frontend compatibility
                    const chunkEvent = JSON.stringify({
                        choices: [
                            {
                                delta: {
                                    content: chunk
                                }
                            }
                        ]
                    });
                    // Important: Make sure there's proper spacing in the SSE format
                    // data: <json>\n\n is the correct format
                    
                    // DEBUG: Print the exact string being sent to help identify formatting issues
                    const sseString = `data: ${chunkEvent}\n\n`;
                    // console.log('Raw SSE string being sent:', JSON.stringify(sseString));
                    
                    res.write(sseString);
                    
                    // Flush each chunk to ensure real-time streaming
                    if (res.flush) {
                        res.flush();
                    }
                    
                    // Reset the timeout each time we get a chunk
                    clearTimeout(streamTimeoutId);
                    streamTimeoutId = setTimeout(() => {
                        isStreamingComplete = true;
                        checkStreamComplete();
                    }, 5000); // If no chunks for 5 seconds, consider the stream done
            },
            (error) => {
                console.error(`Streaming error: ${error.message}`);
                    const errorEvent = JSON.stringify({ error: 'Streaming error occurred' });
                    res.write(`data: ${errorEvent}\n\n`);
                    // Do NOT end the response here
                    clearTimeout(streamTimeoutId);
                    reject(error);
                }
            ).then(streamResult => {

        if (!streamResult.success) {
                    const errorEvent = JSON.stringify({ error: 'Failed to initialize stream' });
                    res.write(`data: ${errorEvent}\n\n`);
                    clearTimeout(streamTimeoutId);
                    reject(new Error('Failed to initialize stream'));
                    return;
                }
                
                // For debugging - log if we got content but didn't stream it
                if (responseTextBuffer.length > 0) {
                    console.log(`Total response text buffer: ${responseTextBuffer.length} characters`);
                }
                
                // Mark the stream as complete, but don't resolve immediately
                // This allows any final chunks to be processed
                isStreamingComplete = true;
                checkStreamComplete();
                
            }).catch(error => {
                console.error('Stream initialization error:', error);
                clearTimeout(streamTimeoutId);
                reject(error);
            });
            
            // Safety timeout - if the stream hasn't completed in 30 seconds, resolve anyway
            setTimeout(() => {
                if (!isStreamingComplete) {
                    isStreamingComplete = true;
                    checkStreamComplete();
                }
            }, 30000);
        });
        
        // After streaming is complete, check if we need to fetch bucket list details
        if (intentType === 'bucket_list' && !urlInfo.isUrl) {
            try {
                // Import reelsController
                const reelsController = require('./reelsController');
                
                // Create a mock req for fetchReelDetailsV2
                const mockReq = {
                    params: { type: 'doraAI' },
                    query: { 
                        url: lastMessage.content,
                        streamedResponse: responseTextBuffer 
                    }
                };
                
                let videoContentDetails = null;
                
                // Create a mock res object that captures the response
                const mockRes = {
                    json: (data) => {
                        videoContentDetails = data;
                    }
                };
                
                // Call fetchReelDetailsV2
                await reelsController.fetchReelDetailsV2(mockReq, mockRes);
                
                if (videoContentDetails && !videoContentDetails.error) {
                    // Log for debugging
                    console.log('Video content details received after streaming:', videoContentDetails);
                    
                    // Send the video content details
                    const videoContentEvent = JSON.stringify({
                        videoContent: videoContentDetails
                    });
                    res.write(`data: ${videoContentEvent}\n\n`);
                    if (res.flush) {
                        res.flush();
                    }
                }
            } catch (error) {
                console.error('Error fetching bucket list details:', error);
            }
        }
        
        // FINALLY: Send completion event AFTER all chunks have been processed
        const doneEvent = `data: [DONE]\n\n`;
        res.write(doneEvent);
        res.end();
    } catch (error) {
        console.error('Error processing query:', error);
        if (!res.headersSent) {
        return res.status(500).json({
            error: 'Internal Server Error',
            details: error.message
        });
        } else {
            // If headers are already sent, send error as SSE
            const errorEvent = JSON.stringify({ error: 'Internal Server Error', details: error.message });
            res.write(`data: ${errorEvent}\n\n`);
            res.end();
        }
    }
}

// Extract planning state from previous messages
function extractPlanningState(messages) {
    // Look for planning state in assistant messages
    for (let i = messages.length - 1; i >= 0; i--) {
        const message = messages[i];
        if (message.role === 'assistant' && message.planningState) {
            return message.planningState;
        }
    }
    return null;
}

// Helper function to format date for response
function formatDateForResponse(date) {
    if (!date) return '';
    const d = new Date(date);
    if (isNaN(d.getTime())) return '';
    
    const day = String(d.getDate()).padStart(2, '0');
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const year = d.getFullYear();
    return `${day}-${month}-${year}`;
}

// Extract trip planning information with AI
async function extractTripPlanningInfo(message, currentState = null) {
    console.log("Extracting trip planning info", message, currentState?.tripConfig);
    try {
        // Define the expected structure for trip planning data
        const currentConfig = currentState?.tripConfig || {
            tripName: '',
            destinations: [],
            startDate: '',
            duration: { days: 0, nights: 0 },
            groupType: '',
            tripPurpose: '',
            budget: 0
        };

        // Check for "add" or "also" keywords for destinations
        const isAddingDestinations = /\b(add|also|include|along with|together with|as well as|additional|more)\b/i.test(message);
        console.log(`Is adding destinations: ${isAddingDestinations}`, message);

        // Check if message contains budget-related descriptive terms
        const hasBudgetDescriptiveTerms = /\b(budget-friendly|budget|economic|cheap|affordable|inexpensive|low-cost|moderate|mid-range|average|standard|premium|luxury|high-end|exclusive|deluxe)\b/i.test(message);
        
        if (hasBudgetDescriptiveTerms) {
            console.log(`Detected descriptive budget term in message`);
        }

        // Prepare a prompt that explains what we need from the AI
        let prompt = `Extract travel planning information from the following message and return it as a valid JSON object.
        
        Current trip details that should be preserved unless explicitly changed in the new message:
        ${JSON.stringify(currentConfig, null, 2)}
        
        Include only these exact keys in your response:
        - destinations: array of strings with destination names only
        - startDate: in DD-MM-YYYY format (if date is mentioned)
        - duration: object with "days" and "nights" as numbers
        - groupType: string (solo, couple, family, friends (default - solo))
        - tripPurpose: string (leisure, business, bachelorette, birthday, anniversary, familyVacation (default - leisure))
        - budget: number (just the amount)
        
        For destinations: Extract actual location names without prefixes like "to" or "going to".
        For dates: If a specific date is mentioned, format as DD-MM-YYYY. Handle relative dates appropriately.
        For group type: Choose between solo, couple, family, or friends (default - solo).
        For trip purpose: Choose between leisure, business, bachelorette, birthday, anniversary, or familyVacation (default - leisure).
        For budget: Extract numeric amount. For descriptive terms like "luxury" or "budget-friendly", use appropriate defaults based on the destinations ${currentConfig.destinations.join(', ')}.
        
        IMPORTANT DESTINATION INSTRUCTIONS: The user message contains words like "add" or "also" which suggests they want to ADD new destinations to their existing list rather than replace them. Extract ONLY the NEW destinations being mentioned and DON'T include the current destinations in your response.
        
        IMPORTANT: Only update fields that are explicitly mentioned in the message except for trip purpose. Keep existing values for fields not mentioned.
        
        Return ONLY valid JSON with these exact fields and no explanation or other text.
        
        Here is the message to analyze:
        "${message}"`;

        // If not adding destinations, use a standard prompt
        if (!isAddingDestinations) {
            prompt = `Extract travel planning information from the following message and return it as a valid JSON object.
            
            Current trip details that should be preserved unless explicitly changed in the new message:
            ${JSON.stringify(currentConfig, null, 2)}
            
        Include only these exact keys in your response:
        - destinations: array of strings with destination names only
            - startDate: in DD-MM-YYYY format (if date is mentioned)
        - duration: object with "days" and "nights" as numbers
            - groupType: string (solo, couple, family, or friends (default - solo))
            - tripPurpose: string (leisure, business, bachelorette, birthday, anniversary, or familyVacation (default - leisure))
        - budget: number (just the amount)

            For destinations: Extract actual location names without prefixes like "to" or "going to".
            For dates: If a specific date is mentioned, format as DD-MM-YYYY. Handle relative dates appropriately.
            For group type: Choose between solo, couple, family, or friends (default - solo).
            For trip purpose: Choose between leisure, business, bachelorette, birthday, anniversary, or familyVacation (default - leisure).
            For budget: Extract numeric amount. For descriptive terms like "luxury" or "budget-friendly", use appropriate defaults based on the destinations ${currentConfig.destinations.join(', ')}.
            
            IMPORTANT: Only update fields that are explicitly mentioned in the message except for trip purpose. Keep existing values for fields not mentioned.
            
            Return ONLY valid JSON with these exact fields and no explanation or other text.

        Here is the message to analyze:
        "${message}"`;
        }

        // Use AI to extract structured trip details
        const result = await aiProvider.generateCompletion([
            { role: 'user', content: prompt }
        ], {
            temperature: 0.1, // Low temperature for more deterministic response
            max_tokens: 600
        });

        if (!result.success) {
            console.error('Failed to extract trip details with AI');
            return currentConfig;
        }

        // Parse the JSON response
        let extractedInfo = {};
        try {
            const jsonMatch = result.content.match(/(\{[\s\S]*\})/);
            if (jsonMatch) {
                extractedInfo = JSON.parse(jsonMatch[0]);
            } else {
                console.error('No JSON found in AI response');
                extractedInfo = {};
            }
        } catch (error) {
            console.error('Error parsing AI response:', error);
            console.log('AI response:', result.content);
            extractedInfo = {};
        }

        console.log('AI extracted trip details:', extractedInfo);

        // Create a new config by copying the current config first
        // This ensures we preserve all existing values by default
        const updatedConfig = { ...currentConfig };
        
        // Special handling for "add destination" messages - preserve keywords like "add" and "also"
        if (message.toLowerCase().match(/\b(add|also|include|along with|together with|as well as|additional|more)\s+\w+\s+(to|in|for|as)\s+/i) || 
            message.toLowerCase().match(/\b(add|also|include|along with|together with|as well as|additional|more)\s+\w+\b/i)) {
            console.log("Detected adding destinations from patterns in the message");
            
            if (extractedInfo.destinations && Array.isArray(extractedInfo.destinations) && extractedInfo.destinations.length > 0) {
                const currentDestinations = updatedConfig.destinations || [];
                const newDestinations = extractedInfo.destinations.filter(
                    dest => !currentDestinations.some(
                        existingDest => existingDest.toLowerCase() === dest.toLowerCase()
                    )
                );
                
                // Merge destinations, avoiding duplicates
                updatedConfig.destinations = [...currentDestinations, ...newDestinations];
                console.log('Added destinations:', newDestinations);
                console.log('Updated destinations list:', updatedConfig.destinations);
            }
        } else if (extractedInfo.destinations && Array.isArray(extractedInfo.destinations) && extractedInfo.destinations.length > 0) {
            // Handle other cases - replaces destinations if explicit replacement, otherwise check with AI
            const containsChangeKeywords = message.toLowerCase().match(/\b(change|switch|replace|update|set|make)\s+(destination|place|location|city|trip)\b/i);
            
            if (containsChangeKeywords) {
                // User wants to replace destinations
                console.log("Replacing destinations due to change keywords");
                updatedConfig.destinations = extractedInfo.destinations;
            } else if (!isAddingDestinations && currentConfig.destinations.length > 0) {
                // AI thinks we're not adding, but we already have destinations - double check
                // A secondary check - if the new message doesn't explicitly say to replace all destinations,
                // but just mentions a new one, we might still want to add instead of replace
                let shouldReplace = true;
                
                // Verify if message has clear replacement indications
                if (!containsChangeKeywords && !message.toLowerCase().includes("trip to ") && !message.toLowerCase().includes("travel to ")) {
                    shouldReplace = false;
                }
                
                if (shouldReplace) {
                    console.log("Replacing destinations - determined as replacement intent");
                    updatedConfig.destinations = extractedInfo.destinations;
                } else {
                    console.log("Adding destinations as a fallback - no clear replacement intent detected");
                    const currentDestinations = updatedConfig.destinations || [];
                    const newDestinations = extractedInfo.destinations.filter(
                        dest => !currentDestinations.some(
                            existingDest => existingDest.toLowerCase() === dest.toLowerCase()
                        )
                    );
                    updatedConfig.destinations = [...currentDestinations, ...newDestinations];
                }
            } else {
                // First time setting destinations or clear replacement
                console.log("Setting destinations for the first time or with clear replacement intent");
                updatedConfig.destinations = extractedInfo.destinations;
            }
        }

        // Only update startDate if explicitly mentioned in the message
        if (extractedInfo.startDate) {
            updatedConfig.startDate = extractedInfo.startDate;
        }

        // Update duration if mentioned
        if (extractedInfo.duration) {
            // Auto-calculate days or nights if only one is provided
            const days = extractedInfo.duration.days !== undefined ? 
                extractedInfo.duration.days : currentConfig.duration.days;
                
            let nights = extractedInfo.duration.nights !== undefined ? 
                extractedInfo.duration.nights : currentConfig.duration.nights;
                
            // If nights is 0 or not set but days is set, calculate nights as days - 1
            if ((!nights || nights === 0) && days > 0) {
                nights = Math.max(0, days - 1);
            }
            
            // If days is 0 or not set but nights is set, calculate days as nights + 1
            let updatedDays = days;
            if ((!days || days === 0) && nights > 0) {
                updatedDays = nights + 1;
            }
            
            updatedConfig.duration = { days: updatedDays, nights };
        }

        // Only update groupType if explicitly mentioned
        if (extractedInfo.groupType) {
            updatedConfig.groupType = extractedInfo.groupType;
        }

        // Only update tripPurpose if explicitly mentioned
        if (extractedInfo.tripPurpose) {
            updatedConfig.tripPurpose = extractedInfo.tripPurpose;
        }

        // Handle budget updates
        if (extractedInfo.budget !== undefined) {
            // If we got a numeric budget from AI extraction, use it
            updatedConfig.budget = parseInt(extractedInfo.budget) || 0;
        }
        
        // If message contains budget terms but no budget or budget is 0, 
        // we need to ask AI for a reasonable budget based on destinations
        if (hasBudgetDescriptiveTerms && (extractedInfo.budget === undefined || updatedConfig.budget === 0) && 
            updatedConfig.destinations && updatedConfig.destinations.length > 0) {
            
            console.log("Descriptive budget term detected but no specific value, asking AI for appropriate budget");
            
            // Ask AI to suggest a reasonable budget based on destinations
            const budgetPrompt = `Suggest a reasonable budget amount (in numbers only) for a trip with these details:
            - Destinations: ${updatedConfig.destinations.join(', ')}
            - Duration: ${updatedConfig.duration.days} days
            - Group Type: ${updatedConfig.groupType || 'Not specified'}
            - Trip Purpose: ${updatedConfig.tripPurpose || 'Not specified'}
            
            The user described their budget as: "${message}"
            
            Only respond with a single number representing the suggested budget in INR. Don't include any text, currency symbols, or explanations.`;
            
            try {
                const budgetResult = await aiProvider.generateCompletion([
                    { role: 'user', content: budgetPrompt }
                ], {
                    temperature: 0.3,
                    max_tokens: 20
                });
                
                if (budgetResult.success) {
                    // Extract just the numeric value
                    const suggestedBudget = parseInt(budgetResult.content.trim().replace(/[^0-9]/g, ''));
                    
                    if (suggestedBudget && suggestedBudget > 0) {
                        updatedConfig.budget = suggestedBudget;
                        console.log(`AI suggested budget: ${updatedConfig.budget}`);
        } else {
                        // Use a safe fallback value
                        updatedConfig.budget = 30000;
                        console.log(`Could not parse AI budget suggestion, using fallback: ${updatedConfig.budget}`);
                    }
                } else {
                    // Use a safe fallback value
                    updatedConfig.budget = 30000;
                    console.log(`Failed to get AI budget suggestion, using fallback: ${updatedConfig.budget}`);
                }
            } catch (error) {
                console.error('Error getting AI budget suggestion:', error);
                // Use a safe fallback value
                updatedConfig.budget = 30000;
                console.log(`Error in AI budget suggestion, using fallback: ${updatedConfig.budget}`);
            }
        }
        
        // If message explicitly mentions budget but we still have 0, use a separate AI call
        if (message.toLowerCase().includes('budget') && updatedConfig.budget === 0 && 
            updatedConfig.destinations && updatedConfig.destinations.length > 0) {
            
            console.log("Message mentions budget but no value determined, asking AI for appropriate budget");
            
            // Ask AI to suggest a reasonable budget
            const budgetPrompt = `What would be a reasonable budget in INR for a trip to ${updatedConfig.destinations.join(', ')} for ${updatedConfig.duration.days} days? Respond with only a number, no text.`;
            
            try {
                const budgetResult = await aiProvider.generateCompletion([
                    { role: 'user', content: budgetPrompt }
                ], {
                    temperature: 0.3,
                    max_tokens: 20
                });
                
                if (budgetResult.success) {
                    // Extract just the numeric value
                    const suggestedBudget = parseInt(budgetResult.content.trim().replace(/[^0-9]/g, ''));
                    
                    if (suggestedBudget && suggestedBudget > 0) {
                        updatedConfig.budget = suggestedBudget;
                        console.log(`AI suggested budget: ${updatedConfig.budget}`);
        } else {
                        // Use a safe fallback that's reasonable for most destinations
                        updatedConfig.budget = 30000;
                        console.log(`Could not parse AI budget suggestion, using fallback: ${updatedConfig.budget}`);
                    }
                } else {
                    updatedConfig.budget = 30000;
                    console.log(`Failed to get AI budget suggestion, using fallback: ${updatedConfig.budget}`);
                }
            } catch (error) {
                console.error('Error getting AI budget suggestion:', error);
                updatedConfig.budget = 30000;
                console.log(`Error in AI budget suggestion, using fallback: ${updatedConfig.budget}`);
            }
        }

        // NEW CODE: If budget is still 0 after all checks, generate a budget-friendly default
        if (updatedConfig.budget === 0 && updatedConfig.destinations && updatedConfig.destinations.length > 0) {
            console.log("No budget specified, generating budget-friendly default value");
            
            // Ask AI for a budget-friendly suggestion
            const budgetPrompt = `What would be a budget-friendly amount in INR for a trip to ${updatedConfig.destinations.join(', ')} for ${updatedConfig.duration.days} days? Consider economical options for accommodation, food, and activities. Respond with only a number, no text.`;
            
            try {
                const budgetResult = await aiProvider.generateCompletion([
                    { role: 'user', content: budgetPrompt }
                ], {
                    temperature: 0.3,
                    max_tokens: 20
                });
                
                if (budgetResult.success) {
                    // Extract just the numeric value
                    const suggestedBudget = parseInt(budgetResult.content.trim().replace(/[^0-9]/g, ''));
                    
                    if (suggestedBudget && suggestedBudget > 0) {
                        updatedConfig.budget = suggestedBudget;
                        console.log(`AI suggested budget-friendly default: ${updatedConfig.budget}`);
                    } else {
                        // Use a safe fallback for budget-friendly trips
                        updatedConfig.budget = 25000;
                        console.log(`Could not parse AI budget-friendly suggestion, using fallback: ${updatedConfig.budget}`);
                    }
                } else {
                    // Use a safe fallback for budget-friendly trips
                    updatedConfig.budget = 25000;
                    console.log(`Failed to get AI budget-friendly suggestion, using fallback: ${updatedConfig.budget}`);
                }
            } catch (error) {
                console.error('Error getting AI budget-friendly suggestion:', error);
                // Use a safe fallback for budget-friendly trips
                updatedConfig.budget = 25000;
                console.log(`Error in AI budget-friendly suggestion, using fallback: ${updatedConfig.budget}`);
            }
        }

        console.log('Final updated config:', updatedConfig);
        return updatedConfig;
    } catch (error) {
        console.error('Error in extractTripPlanningInfo:', error);
        return currentState?.tripConfig || {};
    }
}

// Determine the appropriate planning stage based on config completeness
function determineStage(tripConfig, currentStage = PLAN_TRIP_STAGES.INIT) {
    console.log(`Determining stage from ${currentStage} with config:`, JSON.stringify(tripConfig));

    // If current stage is confirm and we're just updating values, stay in confirm
    if (currentStage === PLAN_TRIP_STAGES.CONFIRM) {
        console.log("Already in CONFIRM stage, staying there");
        return PLAN_TRIP_STAGES.CONFIRM;
    }
    
    // Check fields from most to least important to determine stage
    if (!tripConfig.destinations || tripConfig.destinations.length === 0) {
        console.log("Missing destinations, moving to DESTINATION stage");
        return PLAN_TRIP_STAGES.DESTINATION;
    }
    
    if (!tripConfig.startDate) {
        console.log("Missing start date, moving to DATES stage");
        return PLAN_TRIP_STAGES.DATES;
    }
    
    if (!tripConfig.duration || tripConfig.duration.days === 0) {
        console.log("Missing duration, moving to DURATION stage");
        return PLAN_TRIP_STAGES.DURATION;
    }
    
    if (!tripConfig.groupType) {
        console.log("Missing group type, moving to GROUP_TYPE stage");
        return PLAN_TRIP_STAGES.GROUP_TYPE;
    }
    
    if (!tripConfig.tripPurpose) {
        console.log("Missing trip purpose, moving to TRIP_PURPOSE stage");
        return PLAN_TRIP_STAGES.TRIP_PURPOSE;
    }
    
    if (!tripConfig.budget || tripConfig.budget === 0) {
        console.log("Missing budget, moving to BUDGET stage");
        return PLAN_TRIP_STAGES.BUDGET;
    }
    
    // If we're currently in BUDGET and moving to the next stage, go to BUCKET_LIST
    if (currentStage === PLAN_TRIP_STAGES.BUDGET) {
        console.log("Completed BUDGET stage, moving to BUCKET_LIST stage");
        return PLAN_TRIP_STAGES.BUCKET_LIST;
    }
    
    // If we're in BUCKET_LIST already, move to CONFIRM
    if (currentStage === PLAN_TRIP_STAGES.BUCKET_LIST) {
        console.log("Completed BUCKET_LIST stage, moving to CONFIRM stage");
        return PLAN_TRIP_STAGES.CONFIRM;
    }
    
    // For other cases (e.g., starting over with prefilled data), check bucket list stage
    if (currentStage === PLAN_TRIP_STAGES.INIT || !currentStage || 
        (tripConfig.budget && tripConfig.budget > 0 && currentStage !== PLAN_TRIP_STAGES.BUCKET_LIST && currentStage !== PLAN_TRIP_STAGES.CONFIRM)) {
        console.log("All essential fields filled, moving to BUCKET_LIST stage");
        return PLAN_TRIP_STAGES.BUCKET_LIST;
    }
    
    // Default to confirm if all fields are filled and not caught by any other condition
    console.log("No specific condition matched, defaulting to CONFIRM stage");
    return PLAN_TRIP_STAGES.CONFIRM;
}

// Process user response based on current planning stage
async function processUserResponseForPlanning(userMessage, planningState) {
    try {
        console.log("Processing user response for planning stage:", planningState.stage);
        console.log("User message:", userMessage);
        
        const updatedState = {...planningState};
        const previousBudget = planningState.tripConfig.budget;
        const previousStage = planningState.stage;
        
        // Extract trip details using AI
        updatedState.tripConfig = await extractTripPlanningInfo(userMessage, planningState);
        
        console.log("Budget before:", previousBudget, "Budget after:", updatedState.tripConfig.budget);
        console.log("Stage before:", previousStage);
        
        // Special handling for budget stage
        if (previousStage === PLAN_TRIP_STAGES.BUDGET) {
            // Check if budget was provided or detected
            const budgetProvided = updatedState.tripConfig.budget > 0 && 
                                  (previousBudget !== updatedState.tripConfig.budget || 
                                   userMessage.toLowerCase().includes('budget'));
            
            if (budgetProvided) {
                console.log("Budget has been provided, transitioning to BUCKET_LIST stage");
                updatedState.stage = PLAN_TRIP_STAGES.BUCKET_LIST;
            } else {
                console.log("Budget not provided, staying in BUDGET stage");
                updatedState.stage = PLAN_TRIP_STAGES.BUDGET;
            }
        }
        // Determine the appropriate stage based on the updated config
        else if (userMessage.toLowerCase().includes('confirm') || userMessage.toLowerCase().includes('yes') || 
            userMessage.toLowerCase().includes('create trip')) {
            // If user confirms, set confirmed flag and keep in CONFIRM stage
            updatedState.confirmed = true;
            updatedState.stage = PLAN_TRIP_STAGES.CONFIRM;
            console.log("User confirmed, setting stage to CONFIRM");
        } else if (planningState.stage === PLAN_TRIP_STAGES.CONFIRM && !updatedState.confirmed) {
            // If we're in CONFIRM stage but user didn't confirm, stay there unless they explicitly
            // mentioned changing a specific field
            if (userMessage.toLowerCase().includes('destination')) {
                updatedState.stage = PLAN_TRIP_STAGES.DESTINATION;
                console.log("User mentioned destination, moving back to DESTINATION stage");
            } else if (userMessage.toLowerCase().includes('date')) {
                updatedState.stage = PLAN_TRIP_STAGES.DATES;
                console.log("User mentioned date, moving back to DATES stage");
            } else if (userMessage.toLowerCase().includes('duration')) {
                updatedState.stage = PLAN_TRIP_STAGES.DURATION;
                console.log("User mentioned duration, moving back to DURATION stage");
            } else if (userMessage.toLowerCase().includes('group')) {
                updatedState.stage = PLAN_TRIP_STAGES.GROUP_TYPE;
                console.log("User mentioned group, moving back to GROUP_TYPE stage");
            } else if (userMessage.toLowerCase().includes('purpose')) {
                updatedState.stage = PLAN_TRIP_STAGES.TRIP_PURPOSE;
                console.log("User mentioned purpose, moving back to TRIP_PURPOSE stage");
            } else if (userMessage.toLowerCase().includes('budget')) {
                updatedState.stage = PLAN_TRIP_STAGES.BUDGET;
                console.log("User mentioned budget, moving back to BUDGET stage");
            } else if (userMessage.toLowerCase().includes('bucket') || userMessage.toLowerCase().includes('activity') || userMessage.toLowerCase().includes('things to do')) {
                updatedState.stage = PLAN_TRIP_STAGES.BUCKET_LIST;
                console.log("User mentioned bucket list or activities, moving back to BUCKET_LIST stage");
            } else {
                updatedState.stage = PLAN_TRIP_STAGES.CONFIRM;
                console.log("Staying in CONFIRM stage");
            }
        } else if (planningState.stage === PLAN_TRIP_STAGES.BUCKET_LIST) {
            // Special handling for bucket list stage
            if (userMessage.toLowerCase().includes('next') || 
                userMessage.toLowerCase().includes('continue') ||
                userMessage.toLowerCase().includes('proceed') ||
                userMessage.toLowerCase().includes('looks good') ||
                userMessage.toLowerCase().includes('move on')) {
                // User wants to proceed to confirmation
                updatedState.stage = PLAN_TRIP_STAGES.CONFIRM;
                console.log("User wants to proceed from BUCKET_LIST to CONFIRM");
            } else {
                // Stay in bucket list stage for other responses
                updatedState.stage = PLAN_TRIP_STAGES.BUCKET_LIST;
                console.log("Staying in BUCKET_LIST stage");
            }
        } else {
            // Determine next stage based on config completeness
            updatedState.stage = determineStage(updatedState.tripConfig, planningState.stage);
            console.log("Determined next stage based on config:", updatedState.stage);
        }
        
        // If this is a request to generate an itinerary, mark as confirmed and move to CONFIRM stage
        if (userMessage.toLowerCase().includes('generate itinerary') || 
            userMessage.toLowerCase().includes('create itinerary') ||
            userMessage.toLowerCase().includes('make an itinerary')) {
            updatedState.confirmed = true;
            updatedState.stage = PLAN_TRIP_STAGES.CONFIRM;
            console.log("User requested itinerary generation, moving to CONFIRM stage");
        }
        
        // Always fetch bucket list data when entering the bucket list stage
        if (updatedState.stage === PLAN_TRIP_STAGES.BUCKET_LIST && updatedState.userId) {
            console.log("Entering BUCKET_LIST stage, fetching bucket list items");
            updatedState = await checkTripPlanningCompletionAndFetchBucketList(updatedState, updatedState.userId);
        }
        
        console.log("Final stage after processing:", updatedState.stage);
        return updatedState;
    } catch (error) {
        console.error('Error in processUserResponseForPlanning:', error);
        return planningState;
    }
}

// Process initial planning message
async function processInitialPlanningMessage(message, existingTrip = null, userId = null) {
    try {
        // First extract trip details from initial message using AI
        // This helps us know what destinations to look for in existing trips
        const tempConfig = await extractTripPlanningInfo(message, {
            tripConfig: {
                tripName: '',
                destinations: [],
                startDate: '',
                duration: { days: 0, nights: 0 },
                groupType: '',
                tripPurpose: '',
                budget: 0
            }
        });
        
        // If we don't already have an existing trip passed in, try to find one by destination
        if (!existingTrip && userId && tempConfig.destinations && tempConfig.destinations.length > 0) {
            console.log(`Looking for existing trips with destinations: ${tempConfig.destinations.join(', ')}`);
            existingTrip = await getExistingPlanningTrip(userId, tempConfig.destinations);
        }
        
        // Initialize planning state
        const newPlanningState = {
            stage: PLAN_TRIP_STAGES.INIT,
            tripConfig: existingTrip ? {
                tripName: existingTrip.tripName || '',
                destinations: existingTrip.destinations?.map(d => d.location) || [],
                startDate: existingTrip.startDate ? formatDateForResponse(existingTrip.startDate) : '',
                duration: existingTrip.duration || { days: 0, nights: 0 },
                groupType: existingTrip.groupType || '',
                tripPurpose: existingTrip.tripPurpose || '',
                budget: existingTrip.budget?.totalBudget || 0,
            } : tempConfig, // Use the temp extracted config if no existing trip
            existingTripId: existingTrip?._id || null,
            userId: userId
        };
        
        // If we already used tempConfig for the initial state, don't extract again
        if (existingTrip) {
            // Extract trip details from initial message using AI to merge with existing trip data
            newPlanningState.tripConfig = await extractTripPlanningInfo(message, newPlanningState);
        }
        
        // Determine appropriate stage based on what was extracted
        newPlanningState.stage = determineStage(newPlanningState.tripConfig);
        
        console.log("Initial planning state after processing:", JSON.stringify(newPlanningState));
        
        // If stage is BUCKET_LIST, fetch bucket list data
        if (newPlanningState.stage === PLAN_TRIP_STAGES.BUCKET_LIST && userId) {
            console.log("Initial stage is BUCKET_LIST, fetching bucket list data");
            return await checkTripPlanningCompletionAndFetchBucketList(newPlanningState, userId);
        }
        
        return newPlanningState;
    } catch (error) {
        console.error('Error in processInitialPlanningMessage:', error);
        // Return basic planning state if there's an error
        return {
            stage: PLAN_TRIP_STAGES.INIT,
            tripConfig: {
                tripName: '',
                destinations: [],
                startDate: '',
                duration: { days: 0, nights: 0 },
                groupType: '',
                tripPurpose: '',
                budget: 0
            },
            userId: userId
        };
    }
}

// Generate system message for current planning stage
function generatePlanningSystemMessage(planningState) {
    const basePrompt = 'You are Dora AI, a helpful travel planner assistant. You are currently in planning mode.';
    
    // Add bucket list information if available
    let bucketListInfo = '';
    if (planningState.tripConfig.bucketList && planningState.tripConfig.bucketList.totalItems > 0) {
        bucketListInfo = `The user has ${planningState.tripConfig.bucketList.totalItems} saved bucket list items for their destinations. `;
        
        if (planningState.tripConfig.bucketList.countryDetails && planningState.tripConfig.bucketList.countryDetails.length > 0) {
            bucketListInfo += 'Specific breakdown: ';
            planningState.tripConfig.bucketList.countryDetails.forEach(country => {
                bucketListInfo += `${country.itemCount} items for ${country.countryName}, `;
            });
            bucketListInfo = bucketListInfo.slice(0, -2) + '. '; // Remove last comma and space, add period
        }
        
        bucketListInfo += 'Recommend that they consider these bucket list items in their trip itinerary. ';
    }
    
    // Add guidance based on current stage
    let stageGuidance = '';
    switch (planningState.stage) {
        case PLAN_TRIP_STAGES.INIT:
            stageGuidance = `You are starting to plan a trip with the user. Introduce trip planning and ask them about their destinations first. If they already have some information pre-filled, acknowledge that and continue.`;
            break;
            
        case PLAN_TRIP_STAGES.DESTINATION:
            stageGuidance = `Ask the user about their destination(s). Where do they want to go? If they mentioned destinations already, confirm them and move to the next stage about dates.`;
            break;
            
        case PLAN_TRIP_STAGES.DATES:
            stageGuidance = `Ask when they want to travel. Encourage them to provide a specific start date in DD-MM-YYYY format.`;
            break;
            
        case PLAN_TRIP_STAGES.DURATION:
            stageGuidance = `Ask how long they want to travel - how many days and nights.`;
            break;
            
        case PLAN_TRIP_STAGES.GROUP_TYPE:
            stageGuidance = `Ask about who they are traveling with - solo, couple, family, or friends.`;
            break;
            
        case PLAN_TRIP_STAGES.TRIP_PURPOSE:
            stageGuidance = `Ask about the purpose of their trip - leisure, business, bachelorette, birthday, anniversary, or family vacation.`;
            break;
            
        case PLAN_TRIP_STAGES.BUDGET:
            stageGuidance = `Ask about their budget - how much they want to spend on this trip.`;
            break;
            
        case PLAN_TRIP_STAGES.BUCKET_LIST:
            stageGuidance = `Now that we have all the basic trip details, present the user's bucket list items for their destinations.

Summary of trip details so far:
- Destinations: ${planningState.tripConfig.destinations.join(', ')}
- Start Date: ${planningState.tripConfig.startDate}
- Duration: ${planningState.tripConfig.duration.days} days, ${planningState.tripConfig.duration.nights} nights
- Group Type: ${planningState.tripConfig.groupType}
- Purpose: ${planningState.tripConfig.tripPurpose}
- Budget: ${planningState.tripConfig.budget}

${planningState.tripConfig.bucketList && planningState.tripConfig.bucketList.totalItems > 0 ? 
`I've found ${planningState.tripConfig.bucketList.totalItems} saved bucket list items for these destinations.` : 
'I don\'t see any saved bucket list items for these destinations yet.'}`;

            // Add specific bucket list items if available
            if (planningState.tripConfig.bucketList && planningState.tripConfig.bucketList.items && planningState.tripConfig.bucketList.items.length > 0) {
                stageGuidance += `\n\nHere are your saved bucket list items for these destinations:`;
                
                planningState.tripConfig.bucketList.items.forEach((item, index) => {
                    stageGuidance += `\n${index + 1}. ${item.activityName} at ${item.location.mainText}`;
                });
                
                stageGuidance += `\n\nThese activities can be incorporated into your trip itinerary. Is there anything you'd like to add or remove from this list? Or would you like to proceed with these activities?`;
            } else {
                stageGuidance += `\n\nWould you like to add any specific activities or attractions to your trip? Or would you like to proceed to the next step?`;
            }
            break;
            
        case PLAN_TRIP_STAGES.CONFIRM:
            stageGuidance = `Summarize all the trip details and ask for confirmation. Let them know they can edit any detail before confirming. Provide a summary of:
            - Destinations: ${planningState.tripConfig.destinations.join(', ')}
            - Start Date: ${planningState.tripConfig.startDate}
            - Duration: ${planningState.tripConfig.duration.days} days, ${planningState.tripConfig.duration.nights} nights
            - Group Type: ${planningState.tripConfig.groupType}
            - Purpose: ${planningState.tripConfig.tripPurpose}
            - Budget: ${planningState.tripConfig.budget}
            ${planningState.tripConfig.bucketList && planningState.tripConfig.bucketList.totalItems > 0 ? 
              `- Bucket List: ${planningState.tripConfig.bucketList.totalItems} saved items for these destinations` : ''}
            
            ${planningState.confirmed ? 
              `Now that we have confirmed the trip details, let's create an itinerary for each day of the trip. Consider the bucket list items and build a day-by-day plan. Include activities, attractions, and meal suggestions. Be specific with timing and provide a practical schedule for each day.` : 
              `Ask if they want to create this trip or modify any details.`}`;
              
            // Add specific bucket list items if available
            if (planningState.tripConfig.bucketList && planningState.tripConfig.bucketList.items && planningState.tripConfig.bucketList.items.length > 0) {
                stageGuidance += `\n\nHere are the user's saved bucket list items for these destinations:`;
                
                planningState.tripConfig.bucketList.items.forEach((item, index) => {
                    stageGuidance += `\n${index + 1}. ${item.activityName} at ${item.location.mainText}`;
                });
                
                stageGuidance += `\n\nIncorporate these into the itinerary where appropriate. Ask the user if they want to add or remove any specific activities or modify the itinerary.`;
            }
            break;
            
        default:
            stageGuidance = `Start a conversation about planning a trip.`;
    }
    
    return `${basePrompt} ${bucketListInfo}${stageGuidance} Keep your responses conversational, helpful, and focused on the current planning stage.`;
}

// Handle AI response in planning mode
async function handlePlanningModeResponse(res, systemPrompt, messages, planningState) {
    console.log("Handling planning mode response for stage:", planningState.stage);
    try {
        // Log key details
        console.log("Planning state stage:", planningState.stage);
        console.log("Bucket list data available:", 
            planningState.tripConfig.bucketList ? 
            `Yes (${planningState.tripConfig.bucketList.totalItems || 0} items)` : 
            "No");
        
        // Emergency bucket list fetch if needed
        if (planningState.stage === PLAN_TRIP_STAGES.BUCKET_LIST && 
            (!planningState.tripConfig.bucketList || !planningState.tripConfig.bucketList.items) && 
            planningState.userId) {
            console.log("Emergency bucket list fetch - BUCKET_LIST stage with no data");
            planningState = await checkTripPlanningCompletionAndFetchBucketList(planningState, planningState.userId);
            
            // Update system prompt with bucket list data
            if (planningState.tripConfig.bucketList) {
                systemPrompt = generatePlanningSystemMessage(planningState);
                console.log("Updated system prompt with bucket list data");
            }
        }
        
        // For bucket list stage, ensure the AI knows to present the bucket list
        if (planningState.stage === PLAN_TRIP_STAGES.BUCKET_LIST) {
            // Log bucket list items for debugging
            if (planningState.tripConfig.bucketList && planningState.tripConfig.bucketList.items) {
                console.log("Bucket list items to present:");
                planningState.tripConfig.bucketList.items.forEach((item, i) => {
                    console.log(`${i+1}. ${item.activityName} at ${item.location.mainText}`);
                });
            } else {
                console.log("No bucket list items found for presentation");
            }
            
            // Force the system to present bucket list by adding a direct user question
            messages = [...messages];
            if (messages.length > 0 && messages[messages.length - 1].role === 'user') {
                // Replace last user message to include explicit request for bucket list
                const lastUserMsg = messages[messages.length - 1].content;
                messages[messages.length - 1] = {
                    ...messages[messages.length - 1],
                    content: `${lastUserMsg}\n\nPlease show me my saved bucket list items for these destinations that I can include in my trip.`
                };
            }
        }
        
        // Prepare messages with planning system prompt
        const fullMessages = [
            { role: 'system', content: systemPrompt },
            ...messages
        ];

        console.log("System prompt length:", systemPrompt.length);
        console.log("System prompt excerpt:", systemPrompt.substring(0, 200) + "...");

        let responseTextBuffer = "";
        
        // Use a promise to wait for all chunks to be received
        await new Promise((resolve, reject) => {
            let hasReceivedChunks = false;
            let isStreamingComplete = false;
            let streamTimeoutId = null;
            
            // Function to check if streaming is complete
            const checkStreamComplete = () => {
                if (isStreamingComplete) {
                    clearTimeout(streamTimeoutId);
                    streamTimeoutId = setTimeout(() => {
                        resolve();
                    }, 2000);
                }
            };
            
            // Stream the AI response
            aiProvider.generateStream(
                fullMessages,
                { temperature: 0.7 },
                (chunk, rawData) => {
                    hasReceivedChunks = true;
                    responseTextBuffer += chunk;
                    
                    // Format chunk as an OpenAI-like delta with planning state
                    const chunkEvent = JSON.stringify({
                        choices: [
                            {
                                delta: {
                                    content: chunk
                                }
                            }
                        ],
                        planningState: planningState
                    });
                    
                    const sseString = `data: ${chunkEvent}\n\n`;
                    res.write(sseString);
                    
                    // Flush each chunk
                    if (res.flush) {
                        res.flush();
                    }
                    
                    // Reset the timeout each time we get a chunk
                    clearTimeout(streamTimeoutId);
                    streamTimeoutId = setTimeout(() => {
                        isStreamingComplete = true;
                        checkStreamComplete();
                    }, 5000);
                },
                (error) => {
                    console.error(`Streaming error: ${error.message}`);
                    clearTimeout(streamTimeoutId);
                    reject(error);
                }
            ).then(streamResult => {
                if (!streamResult.success) {
                    const errorEvent = JSON.stringify({ error: 'Failed to initialize stream' });
                    res.write(`data: ${errorEvent}\n\n`);
                    clearTimeout(streamTimeoutId);
                    reject(new Error('Failed to initialize stream'));
                    return;
                }
                
                // Log the first part of the response for debugging
                console.log("AI response preview:", responseTextBuffer.substring(0, 200) + "...");
                console.log("Response contains bucket list mention:", 
                    responseTextBuffer.toLowerCase().includes('bucket list') ? "Yes" : "No");
                
                isStreamingComplete = true;
                checkStreamComplete();
            }).catch(error => {
                console.error('Stream initialization error:', error);
                clearTimeout(streamTimeoutId);
                reject(error);
            });
            
            // Safety timeout
            setTimeout(() => {
                if (!isStreamingComplete) {
                    isStreamingComplete = true;
                    checkStreamComplete();
                }
            }, 30000);
        });
        
        // If planning is confirmed, create or update the trip
        if (planningState.stage === PLAN_TRIP_STAGES.CONFIRM && planningState.confirmed) {
            try {
                console.log("Trip planning confirmed, creating/updating trip in database");
                await createOrUpdateTrip(planningState);
            } catch (error) {
                console.error('Error creating/updating trip:', error);
            }
        }
        
        console.log("Planning mode response complete");
        return true;
    } catch (error) {
        console.error('Error in planning mode response:', error);
        const errorEvent = JSON.stringify({ error: 'Failed to process planning response' });
        res.write(`data: ${errorEvent}\n\n`);
        return false;
    }
}

// Create or update trip in database
async function createOrUpdateTrip(planningState) {
    const { tripConfig, existingTripId } = planningState;
    
    // Parse the start date
    let startDate = null;
    if (tripConfig.startDate) {
        const [day, month, year] = tripConfig.startDate.split('-').map(num => parseInt(num, 10));
        startDate = new Date(year, month - 1, day);
    }
    
    // Prepare trip data
    const tripData = {
        tripName: tripConfig.destinations.join(' - ') + ' Trip',
        startDate: startDate,
        duration: tripConfig.duration,
        tripType: 'self-planned',
        status: 'planning',
        groupType: tripConfig.groupType,
        tripPurpose: tripConfig.tripPurpose,
        destinations: tripConfig.destinations.map(location => ({ location })),
        budget: {
            currency: 'INR',
            totalBudget: tripConfig.budget
        }
    };
    
    if (existingTripId) {
        // Update existing trip
        await Trip.findByIdAndUpdate(existingTripId, tripData);
        return existingTripId;
    } else {
        // Create new trip
        const newTrip = new Trip({
            ...tripData,
            userId: planningState.userId
        });
        
        const savedTrip = await newTrip.save();
        return savedTrip._id;
    }
}

// Function to detect URL in text
function detectURL(input) {
    // Default result object
    const result = {
        isUrl: false,
        urlType: 'unknown',
        cleanUrl: null,
        contentId: null,
        creator: ''
    };

    // Validate input
    if (!input || typeof input !== 'string') {
        return result;
    }

    // Trim whitespace
    const cleanInput = input.trim();

    // URL regex pattern
    const urlPattern = /^(https?:\/\/)?(www\.)?[a-zA-Z0-9-]+\.[a-zA-Z]{2,}(\S*)?$/;

    // Check if input matches URL pattern
    if (urlPattern.test(cleanInput)) {
        result.isUrl = true;
        
        // Normalize URL by adding https:// if missing
        result.cleanUrl = cleanInput.startsWith('http://') || cleanInput.startsWith('https://') 
            ? cleanInput 
            : `https://${cleanInput}`;

        // YouTube URL detection and ID extraction
        const youtubePatterns = [
            { regex: /youtube\.com\/watch\?v=([^&]+)/, type: 'standard' },
            { regex: /youtu\.be\/([^?&]+)/, type: 'shortened' },
            { regex: /youtube\.com\/embed\/([^?&]+)/, type: 'embedded' },
            { regex: /youtube\.com\/shorts\/([^?&]+)/, type: 'shorts' },
            { regex: /youtube\.com\/@[\w-]+\/shorts\/([^?&]+)/, type: 'alternative-shorts' }
        ];

        const youtubeMatch = youtubePatterns.find(pattern => {
            const match = result.cleanUrl.match(pattern.regex);
            return match;
        });

        if (youtubeMatch) {
            result.urlType = 'ytShorts';
            result.contentId = result.cleanUrl.match(youtubeMatch.regex)[1];
        }

        // Instagram URL detection and ID extraction
        const instagramPatterns = [
            { regex: /instagram\.com\/reels\/([^/?&]+)/, type: 'reels' },
            { regex: /instagram\.com\/reel\/([^/?&]+)/, type: 'reel' },
            { regex: /instagram\.com\/p\/([^/?&]+)/, type: 'post' }
        ];

        const instagramMatch = instagramPatterns.find(pattern => {
            const match = result.cleanUrl.match(pattern.regex);
            return match;
        });

        if (instagramMatch) {
            result.urlType = 'instaReels';
            result.contentId = result.cleanUrl.match(instagramMatch.regex)[1];
        }
        
        // TikTok URL detection and ID extraction
        const tiktokPatterns = [
            { regex: /tiktok\.com\/@([^/]+)\/video\/([^/?&]+)/, type: 'video' }
        ];
        
        const tiktokMatch = tiktokPatterns.find(pattern => {
            const match = result.cleanUrl.match(pattern.regex);
            return match;
        });
        
        if (tiktokMatch) {
            result.urlType = 'tikTok';
            const matches = result.cleanUrl.match(tiktokMatch.regex);
            result.creator = matches[1]; // Extract creator name
            result.contentId = matches[2]; // Extract content ID
        }

        // If no specific platform detected, set to generic
        if (result.urlType === 'unknown') {
            result.urlType = 'blog';
            result.contentId = result.cleanUrl;
        }
    }

    return result;
}

// Helper function to get system prompts based on intent type
function getSystemPromptForIntent(intentType) {
    const basePrompt = 'You are Dora AI, a travel assistant designed to provide information and answer questions about travel and tourism.';
    
    const intentSpecificPrompts = {
        'bucket_list': `${basePrompt} The user is looking for travel destination suggestions. Provide a curated list of interesting places to visit based on their query.`,
        'plan_trip': `${basePrompt} The user wants to plan a trip. Help them organize their itinerary, suggest activities, and provide planning advice.`,
        'currency': `${basePrompt} The user needs help with currency conversion. Provide accurate exchange rates and conversion information.`,
        'packing': `${basePrompt} The user needs advice on what to pack for a trip. Provide a detailed packing list based on their destination and travel conditions.`,
        'budget': `${basePrompt} The user is asking about travel budgeting. Provide cost estimates and budgeting advice for their trip.`,
        'emergency': `${basePrompt} The user needs emergency information. Provide critical contacts, procedures, or advice for travelers in emergency situations.`,
        'translate': `${basePrompt} The user needs language assistance. Provide translations or common phrases useful for travelers in foreign countries.`,
        'crowd': `${basePrompt} The user is asking about crowd conditions. Provide information about crowd levels at tourist destinations and advice for avoiding crowds.`,
        'documents': `${basePrompt} The user is asking about travel documentation. Provide information about required documents for international travel.`,
        'holiday': `${basePrompt} The user is asking about holidays and leave planning. Provide information about holiday dates and leave optimization.`,
        'excuse': `${basePrompt} The user needs creative excuses for extending vacation or taking time off. Provide humorous but plausible excuses.`,
        'chat_query': `${basePrompt} Provide accurate, concise, and informative responses based on reliable sources.`
    };
    
    return intentSpecificPrompts[intentType] || intentSpecificPrompts['chat_query'];
}

// Check if trip planning is complete and fetch bucket list if needed
async function checkTripPlanningCompletionAndFetchBucketList(planningState, userId) {
    try {
        // Always fetch when in BUCKET_LIST stage, but only fetch for CONFIRM stage if not already fetched
        if ((planningState.stage === PLAN_TRIP_STAGES.BUCKET_LIST) || 
            (planningState.stage === PLAN_TRIP_STAGES.CONFIRM && 
             (!planningState.tripConfig.bucketList || !planningState.tripConfig.bucketList.items))) {
            
            // If there are no destinations, we can't fetch bucket list
            if (!planningState.tripConfig.destinations || planningState.tripConfig.destinations.length === 0) {
                console.log("No destinations provided, can't fetch bucket list");
                return planningState;
            }

            console.log("Fetching bucket list for destinations:", planningState.tripConfig.destinations);
            
            // Only fetch if we have a valid user ID
            if (!userId) {
                console.log("No user ID available, skipping bucket list fetch");
                return planningState;
            }
            
            // Import the bucket controller
            const bucketController = require('./bucketController');
            
            // Create a mock request and response to capture the bucket controller's response
            const mockReq = { 
                user: { id: userId }
            };
            
            let bucketData = null;
            const mockRes = {
                json: (data) => {
                    bucketData = data;
                },
                status: () => ({
                    json: (data) => {
                        console.error("Error fetching bucket list:", data);
                    }
                })
            };
            
            // Call the bucket controller function to get all bucket data
            await bucketController.getBucket(mockReq, mockRes);
            
            // If we got bucket data, process it
            if (bucketData && bucketData.statesWithBucketItems) {
                console.log("Got bucket data with", bucketData.statesWithBucketItems.length, "countries");
                
                // Get all destinations in lowercase for easier matching
                const destinations = planningState.tripConfig.destinations.map(dest => dest.toLowerCase());
                
                // Find relevant countries based on more flexible matching
                const relevantCountries = [];
                const relevantCountryIds = new Set();
                const relevantStateIds = new Set();
                
                // First pass: Find direct country and state matches
                for (const country of bucketData.statesWithBucketItems) {
                    const countryName = country.countryName.toLowerCase();
                    
                    // Check if any destination matches or includes this country name
                    const isCountryMatch = destinations.some(dest => 
                        countryName.includes(dest) || dest.includes(countryName)
                    );
                    
                    if (isCountryMatch) {
                        console.log(`Matched country: ${country.countryName}`);
                        relevantCountries.push(country);
                        relevantCountryIds.add(country._id);
                        
                        // Add all states from this country
                        for (const state of country.states) {
                            relevantStateIds.add(state._id);
                        }
                        continue; // Skip state-level checks if we matched the country
                    }
                    
                    // If we didn't match the country, check each state
                    let hasStateMatch = false;
                    for (const state of country.states) {
                        const stateName = state.name.toLowerCase();
                        
                        // Check if any destination matches or includes this state name
                        const isStateMatch = destinations.some(dest => 
                            stateName.includes(dest) || dest.includes(stateName)
                        );
                        
                        if (isStateMatch) {
                            console.log(`Matched state: ${state.name} in ${country.countryName}`);
                            hasStateMatch = true;
                            relevantStateIds.add(state._id);
                        }
                    }
                    
                    // If any state matched, include the country
                    if (hasStateMatch) {
                        relevantCountries.push(country);
                        relevantCountryIds.add(country._id);
                    }
                }
                
                console.log("Relevant countries:", relevantCountries.map(c => c.countryName));
                console.log("Matched", relevantCountryIds.size, "countries and", relevantStateIds.size, "states");
                
                // Fetch all bucket list items for these states and countries
                const bucketListItems = [];
                
                // For each relevant country, fetch both direct country bucket items and state bucket items
                for (const country of relevantCountries) {
                    // Fetch country-level bucket items if there are any
                    if (country.totalBucketListItems > 0) {
                        // Create a mock request for country bucket details
                        const countryReq = {
                            user: { id: userId },
                            params: { countryId: country._id }
                        };
                        
                        let countryBucketData = null;
                        const countryRes = {
                            json: (data) => {
                                countryBucketData = data;
                            },
                            status: () => ({
                                json: (data) => {
                                    console.error("Error fetching country bucket details:", data);
                                }
                            })
                        };
                        
                        // Call the bucket controller function
                        await bucketController.getCountryBucketDetails(countryReq, countryRes);
                        
                        // Add direct country bucket items
                        if (countryBucketData && countryBucketData.success && countryBucketData.data) {
                            if (countryBucketData.data.directBuckets) {
                                bucketListItems.push(...countryBucketData.data.directBuckets);
                                console.log(`Added ${countryBucketData.data.directBuckets.length} direct bucket items from ${country.countryName}`);
                            }
                            
                            // Process state bucket items
                            if (countryBucketData.data.states) {
                                for (const stateData of countryBucketData.data.states) {
                                    if (relevantStateIds.has(stateData.stateId) && stateData.buckets) {
                                        bucketListItems.push(...stateData.buckets);
                                        console.log(`Added ${stateData.buckets.length} bucket items from state ${stateData.stateName}`);
                                    }
                                }
                            }
                        }
                    } else {
                        // If country has no direct bucket items, fetch individual state bucket items
                        for (const state of country.states) {
                            if (state.bucketListItemCount > 0 && relevantStateIds.has(state._id)) {
                                // Create a mock request for state bucket details
                                const stateReq = {
                                    user: { id: userId },
                                    params: { stateId: state._id }
                                };
                                
                                let stateBucketData = null;
                                const stateRes = {
                                    json: (data) => {
                                        stateBucketData = data;
                                    },
                                    status: () => ({
                                        json: (data) => {
                                            console.error("Error fetching state bucket details:", data);
                                        }
                                    })
                                };
                                
                                // Call the bucket controller function
                                await bucketController.getStateBucketDetails(stateReq, stateRes);
                                
                                // Add the items to our list
                                if (stateBucketData && stateBucketData.success && stateBucketData.data && stateBucketData.data.buckets) {
                                    bucketListItems.push(...stateBucketData.data.buckets);
                                    console.log(`Added ${stateBucketData.data.buckets.length} bucket items from state ${state.name}`);
                                }
                            }
                        }
                    }
                }
                
                // Additional check for destinations that might be cities or specific places
                if (bucketListItems.length === 0) {
                    console.log("No bucket items found by country/state, checking user's entire bucket list for matching places");
                    
                    // Get the user's full bucket data to check for specific place matches
                    const userReq = {
                        user: { id: userId }
                    };
                    
                    // First get all countries that have bucket items
                    const countriesWithBuckets = await new Promise((resolve) => {
                        const res = {
                            json: (data) => resolve(data)
                        };
                        bucketController.getCountriesBucketSummary(userReq, res);
                    });
                    
                    if (countriesWithBuckets && countriesWithBuckets.success && countriesWithBuckets.data) {
                        // For each country with buckets, check for place matches
                        for (const country of countriesWithBuckets.data) {
                            const countryReq = {
                                user: { id: userId },
                                params: { countryId: country._id }
                            };
                            
                            const countryDetails = await new Promise((resolve) => {
                                const res = {
                                    json: (data) => resolve(data)
                                };
                                bucketController.getCountryBucketDetails(countryReq, res);
                            });
                            
                            if (countryDetails && countryDetails.success && countryDetails.data) {
                                // Check direct buckets
                                if (countryDetails.data.directBuckets) {
                                    for (const bucket of countryDetails.data.directBuckets) {
                                        // Check if the destination matches the location
                                        const locationText = 
                                            (bucket.location.mainText || '').toLowerCase() + ' ' + 
                                            (bucket.location.secondaryText || '').toLowerCase();
                                            
                                        const isLocationMatch = destinations.some(dest => 
                                            locationText.includes(dest) || dest.includes(locationText)
                                        );
                                        
                                        if (isLocationMatch) {
                                            bucketListItems.push(bucket);
                                            console.log(`Matched place bucket: ${bucket.activityName} at ${bucket.location.mainText}`);
                                        }
                                    }
                                }
                                
                                // Check state buckets
                                if (countryDetails.data.states) {
                                    for (const stateData of countryDetails.data.states) {
                                        if (stateData.buckets) {
                                            for (const bucket of stateData.buckets) {
                                                // Check if the destination matches the location
                                                const locationText = 
                                                    (bucket.location.mainText || '').toLowerCase() + ' ' + 
                                                    (bucket.location.secondaryText || '').toLowerCase();
                                                    
                                                const isLocationMatch = destinations.some(dest => 
                                                    locationText.includes(dest) || dest.includes(locationText)
                                                );
                                                
                                                if (isLocationMatch) {
                                                    bucketListItems.push(bucket);
                                                    console.log(`Matched place bucket: ${bucket.activityName} at ${bucket.location.mainText}`);
                                                }
                                            }
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
                
                // Remove duplicate bucket list items by ID
                const uniqueBucketItems = Array.from(
                    bucketListItems.reduce((map, item) => {
                        if (!map.has(item.id)) {
                            map.set(item.id, item);
                        }
                        return map;
                    }, new Map()).values()
                );
                
                console.log(`Found ${uniqueBucketItems.length} unique bucket list items for the destinations after filtering`);
                
                // Update the planning state with the bucket list data
                const updatedPlanningState = {
                    ...planningState,
                    tripConfig: {
                        ...planningState.tripConfig,
                        bucketList: {
                            totalItems: uniqueBucketItems.length,
                            countryDetails: relevantCountries.map(country => ({
                                countryName: country.countryName,
                                itemCount: country.totalBucketListItems
                            })),
                            items: uniqueBucketItems
                        }
                    }
                };
                
                return updatedPlanningState;
            }
        }
        
        // If we didn't need to fetch or couldn't fetch, return original planning state
        return planningState;
    } catch (error) {
        console.error("Error in checkTripPlanningCompletionAndFetchBucketList:", error);
        return planningState;
    }
}

module.exports = {
    // handleAIQuery,
    processQuery,
    checkTripPlanningCompletionAndFetchBucketList
};