const axios = require('axios');
const { YoutubeTranscript } = require('youtube-transcript');
const VideoContent = require('../models/VideoContent');
const Location = require('../models/Location');
const cheerio = require('cheerio');
const reelJson = require('../utils/initialReels.json')
const aiProvider = require('../utils/aiProvider');
const FormData = require('form-data');
const { 
  Client,
  PrivateKey,
  TokenCreateTransaction,
  TokenMintTransaction,
  TokenAssociateTransaction,
  TokenId,
  Hbar,
  TokenType,
  TokenSupplyType,
  AccountId,
  TopicMessageSubmitTransaction,
} = require("@hashgraph/sdk");

// const topicId = process.env.HEDERA_TOPIC_ID || "0.0.5138179";

// Initialize Hedera client
const hederaClient = Client.forMainnet();
hederaClient.setOperator(
  process.env.HEDERA_OPERATOR_ID,
  PrivateKey.fromString(process.env.HEDERA_OPERATOR_KEY)
);

const getYouTubeTravelReels = async (searchTerm, pageToken = '', API_KEY) => {
    const url = `https://www.googleapis.com/youtube/v3/search?part=snippet&type=video&videoDuration=short&videoCaption=closedCaption&maxResults=48&key=${API_KEY}&q=${searchTerm}&pageToken=${pageToken}`;
    
    try {
      const response = await axios.get(url);
    
      return {
        items: response.data.items,
        nextPageToken: response.data.nextPageToken || null,
      };

    } catch (error) {
      console.error('Error fetching YouTube data:', error);
      throw new Error('YouTube API request failed');
    }
  };

async function fetchYoutubeReels(req, res) {
    try {
        const API_KEY = process.env.YOUTUBE_API_KEY;  // Ensure YouTube API key is in env
        let { location, pageToken } = req.query;
        
        // Default search term
        let searchTerm = 'travel itinerary shorts';

        // Append location to search term and as a hashtag if provided
        if (location) {
            searchTerm += ` ${location} #${location}`;
        }

        // Fetch YouTube data
        const result = await getYouTubeTravelReels(searchTerm, pageToken, API_KEY);        // Respond with paginated results
        res.json({
        items: result.items,
        nextPageToken: result.nextPageToken,
        });
    } catch (error) {
      console.error(error);
      return res.json({ 
        items: reelJson.items,
        nextPageToken: reelJson.nextPageToken,
       });
    }
  }

async function extractLocation(message) {
    const prompt = `Extract travel itinerary information from the following paragraph and return it as a JSON array of objects. Each object should contain the following properties:

    - 'type': "activity" or "visit"
    - 'location': "Place Name, City, State, Country"
    - 'name': "Activity/Visit Name"

    If the provided paragraph does not contain travel itinerary information, return empty array JSON.

    Here is the itinerary paragraph:
    "${message}"`
    try {
        const result = await aiProvider.generateCompletion([
            { role: 'user', content: prompt }
        ], {
            temperature: 0.2,
            max_tokens: 1000
        });

        if (!result.success) {
            throw new Error('Failed to extract location information');
        }

        const list = JSON.parse(result.content.slice(7, -3));
        // console.log(list)
        const listWithLoc = await Promise.all(list.map(async item => {
            // console.log(item)
            try {
                const response = await axios.post('https://places.googleapis.com/v1/places:autocomplete', {
                    input: item.location,
                }, {
                    headers: {
                        'X-Goog-Api-Key': process.env.GOOGLE_MAPS_API_KEY // Set the Authorization header with the API key
                    }
                });
                
                // Get the placePrediction from the first suggestion
                const placePrediction = response.data.suggestions?.[0]?.placePrediction;
                
                if (!placePrediction) {
                    console.warn(`No placePrediction found for location: ${item.location}`);
                    return null;
                }

                return {
                    type: item.type,
                    name: item.name,
                    mapData: {
                        placePrediction: placePrediction
                    }
                };
            } catch (e) {
                console.log(e);
                return null;
            }
        }));

        return listWithLoc;
    } catch(e) {
        console.error(e);
        throw new Error('Places API request failed');
    }
}

async function saveLocationsAndContent(data, contentType, videoId, title) {
  try {
    const savedLocations = [];
    
    for (const item of data) {
      try {
        // Get detailed place information
        const response = await axios.get(
          `https://places.googleapis.com/v1/places/${item?.mapData?.placePrediction?.placeId}?fields=addressComponents&key=${process.env.GOOGLE_MAPS_API_KEY}`
        );

        const { addressComponents } = response.data;
        const placePrediction = item?.mapData?.placePrediction;

        // Prepare location data with proper schema structure
        const locationData = {
          place: placePrediction?.place || placePrediction?.placeId,
          placeId: placePrediction?.placeId,
          // Properly structure the text field as an embedded document
          text: placePrediction?.text || {
            text: item.location || "Unknown location",
            matches: []
          },
          // Properly structure the structuredFormat field
          structuredFormat: placePrediction?.structuredFormat || {
            mainText: {
              text: item.name,
              matches: []
            },
            secondaryText: {
              text: "",
              matches: []
            }
          },
          types: placePrediction?.types || [],
          addressComponents: addressComponents
        };

        const location = await Location.findOneAndUpdate(
          { placeId: locationData.placeId },
          locationData,
          { upsert: true, new: true }
        );

        savedLocations.push({
          locationId: location._id,
          activityName: item.name,
          activityType: item.type
        });
      } catch (error) {
        console.error('Error processing location:', error.message);
        // Continue with next item
      }
    }

    const videoContent = await VideoContent.create({
      embeddingLink: videoId,
      contentType: contentType,
      buckets: savedLocations,
      title: title,
      creator: "default-creator"
    });

    return { videoContent, locations: savedLocations };
  } catch (error) {
    console.error('Error in saveLocationsAndContent:', error);
    throw error;
  }
}

async function extractBlogContent(url) {
  try {
    // Fetch the webpage
    const { data } = await axios.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
      }
    });

    // Load HTML into Cheerio
    const $ = cheerio.load(data);
    // Extract title
    const title = $('title').text().trim() || 'No title found';

    // Extract content (you may need to adjust selectors)
    let content = '';

    // Try multiple content extraction strategies
    const contentSelectors = [
      'article',
      '.post-content', 
      '.entry-content', 
      '#main-content', 
      'body'
    ];

    for (let selector of contentSelectors) {
      const contentElement = $(selector);
      
      // Remove script, style, and other unwanted tags
      contentElement.find('script, style, nav, header, footer').remove();
      
      // Extract text, removing extra whitespace
      content = contentElement.text()
        .replace(/\s+/g, ' ')
        .trim();

      // If content is found, break the loop
      if (content.length > 100) break;
    }
    return {blogTitle: title, content: content}
  } catch (error) {
    return {blogTitle: '', content: ''}
  }
}

async function populateDoraAIContent(message) {
  const promptDesc = `Plan me a travel bucket list for following. If items are not provided, keep it very very short and concise for max 3-4 items. If items are already provided in the form of list or inside a paragraph don't do anything just return the items without adding anything by yourself.  
    "${message}"`

  const descResult = await aiProvider.generateCompletion([
    { role: 'user', content: promptDesc }
  ], {
    temperature: 0.2,
    max_tokens: 1000
  });

  if (!descResult.success) {
    throw new Error('Failed to generate travel bucket list');
  }

  const description = descResult.content;

  const promptTitle = `Give me a cool and very very short title for the following travel bucket list. Only title and nothing else: 
    "${description}"`

  const titleResult = await aiProvider.generateCompletion([
    { role: 'user', content: promptTitle }
  ], {
    temperature: 0.2,
    max_tokens: 100
  });

  if (!titleResult.success) {
    throw new Error('Failed to generate title');
  }

  const title = titleResult.content.slice(1, -1);

  return {title, description}
}

async function fetchReelDetails(req, res) {
    try {
        const { type } = req.params;
        const { url: videoId } = req.query;
        let contentType = type;
        if(contentType !== 'doraAI') {
          let content = await VideoContent.findOne({ embeddingLink: videoId, contentType });
          if (content) {
            // If found, return the existing content
            const videoContent = await VideoContent.findOne({
              embeddingLink: videoId,
              contentType: contentType
            });
        
            if (!videoContent) {
              throw new Error('Video content not found with given id and content type');
            }

            res.json({ id: videoContent?.id, title: videoContent?.title, noOfBuckets: videoContent.buckets.length });
          } else {
            let title = '';
            let description = '';
            let transcript = '';
            if (contentType === 'ytShorts') {
              const response = await axios.get(`https://www.googleapis.com/youtube/v3/videos`, {
                  params: {
                      part: 'snippet',
                      id: videoId,
                      key: process.env.YOUTUBE_API_KEY
                  }
              });
          
              const videoDetails = response.data.items[0].snippet;
              title = videoDetails.title;
              description = videoDetails.description;
          
              // console.log('Title:', title);
              // console.log('Description:', description);
              try {
                transcript = await YoutubeTranscript.fetchTranscript(videoId);
                transcript = transcript?.map((caption) => caption.text)
                ?.join(' ')
                ?.replace(/&amp;#39;/g, "'");
              } catch {
                transcript = ''
              }
            // console.log(transcript)
            } else if (contentType === 'instaReels') {
              try {
                const response = await axios.get(process.env.DORA_AI + '/transcribe-reels?url=https://www.instagram.com/reel/' + videoId)

                // Extract the transcription
                const transcription = response?.data?.transcription;

                // Extract Title
                const titleMatch = transcription.match(/Title:\s*(.*)/);
                title = titleMatch ? titleMatch[1].trim() : '';

                // Extract Description (everything between "Captions:" and "MoviePy")
                const descriptionMatch = transcription.match(/Captions:\s*([\s\S]*?)MoviePy/);
                description = descriptionMatch ? descriptionMatch[1].trim() : '';

                // Extract Transcript (everything after "Transcript:")
                const transcriptMatch = transcription.match(/Transcript:\s*([\s\S]*)/);
                transcript = transcriptMatch ? transcriptMatch[1].trim() : '';
              } catch (error) {
                console.error(error);
              }

            } else {
              const { blogTitle, content} = await extractBlogContent(videoId);
              title = blogTitle;
              description = content;
            }

          const Desc = description + ' ' + transcript;
          const message = '1. Title: ' + title + ' 2. Description' + Desc;
          
          let result = await extractLocation(message)
          result = result?.filter(item => item !== null);


          const savedResult = await saveLocationsAndContent(result, contentType, videoId, title);

          const videoContent = await VideoContent.findById(savedResult?.videoContent?._id);

          res.json({ id: videoContent?.id, title: videoContent?.title, noOfBuckets: videoContent.buckets?.length });
          
          // res.json(result);
          }
        } else {
          const { title, description } = await populateDoraAIContent(videoId)
          const message = '1. Title: ' + title + '2. Description' + description;
          let result = await extractLocation(message)
          result = result?.filter(item => item !== null);


          const savedResult = await saveLocationsAndContent(result, contentType, videoId, title);

          const videoContent = await VideoContent.findById(savedResult?.videoContent?._id).populate({
            path: 'buckets.locationId',
            model: 'location',
            select: '-_id place placeId text structuredFormat types'
          });

          const formattedData = videoContent.buckets.map(bucket => ({
            type: bucket.activityType,
            name: bucket.activityName,
            mapData: {
              placePrediction: {
                place: bucket.locationId.place,
                placeId: bucket.locationId.placeId,
                text: bucket.locationId.text,
                structuredFormat: bucket.locationId.structuredFormat,
                types: bucket.locationId.types
              }
            }
          }));

          res.json({ id: videoContent?.id, title: videoContent?.title, noOfBuckets: formattedData?.length });
        }
    } catch (error) {
      console.error(error);
      return res.json({ error: 'Internal Server Error' });
    }
}

async function fetchReelDetailsById(req, res) {
  try {
    const { id: contentId } = req.params;

    const videoContent = await VideoContent.findById(contentId).populate({
      path: 'buckets.locationId',
      model: 'location',
      select: '-_id place placeId text structuredFormat types'
    });

    if (!videoContent) {
      throw new Error('Video content not found with given id and content type');
    }

    const formattedData = videoContent.buckets.map(bucket => ({
      type: bucket.activityType,
      name: bucket.activityName,
      mapData: {
        placePrediction: {
          place: bucket.locationId.place,
          placeId: bucket.locationId.placeId,
          text: bucket.locationId.text,
          structuredFormat: bucket.locationId.structuredFormat,
          types: bucket.locationId.types
        }
      }
    }));

    res.json(formattedData)

  } catch (error) {
    console.error(error);
    return res.json({ error: 'Internal Server Error' });
  }
}

async function fetchReelDetailsV2(req, res) {
  try {
    const { type } = req.params;
    const { url: videoId, creator, streamedResponse } = req.query;
    let contentType = type;
    
    if(contentType !== 'doraAI') {
      // Check if content already exists
      let content = await VideoContent.findOne({ embeddingLink: videoId, contentType });
      
      if (content) {
        // If found, return the existing content
        return res.json({ 
          id: content.id, 
          type: content.contentType,
          title: content.title, 
          noOfBuckets: content.buckets.length, 
          status: content.status 
        });
      } 
      
      // Content doesn't exist, process based on content type
      if (contentType === 'ytShorts') {
        // For YouTube shorts, call first API to get basic metadata
        const { videoContent } = await fetchMetadataFromDoraAI(videoId, contentType);
        
        // Call second API asynchronously without waiting, similar to Instagram and TikTok
        processVideoContentFromDoraAI(videoId, contentType);
        
        // Return the content created by fetchMetadataFromDoraAI
        return res.json({ 
          id: videoContent.id, 
          type: videoContent.contentType,
          title: videoContent.title, 
          noOfBuckets: videoContent.buckets.length, 
          status: videoContent.status 
        });
      } 
      else if (contentType === 'instaReels') {
        // For Instagram, call first API and create content
        const { videoContent } = await fetchMetadataFromDoraAI(videoId, contentType);
        
        // Call second API asynchronously without waiting
        processVideoContentFromDoraAI(videoId, contentType);
        
        // Return the content created by fetchMetadataFromDoraAI
        return res.json({ 
          id: videoContent.id, 
          type: videoContent.contentType,
          title: videoContent.title, 
          noOfBuckets: videoContent.buckets.length, 
          status: videoContent.status 
        });
      }
      else if (contentType === 'tikTok') {
        // For TikTok, call first API with creator param and create content
        const { videoContent } = await fetchMetadataFromDoraAI(videoId, contentType, creator);
        
        // Call second API asynchronously without waiting
        processVideoContentFromDoraAI(videoId, contentType, creator);
        
        // Return the content created by fetchMetadataFromDoraAI
        return res.json({ 
          id: videoContent.id, 
          type: videoContent.contentType,
          title: videoContent.title, 
          noOfBuckets: videoContent.buckets.length, 
          status: videoContent.status 
        });
      }
      else {
        // Default (blog) - use extractBlogContent
        const { blogTitle, content } = await extractBlogContent(videoId);

        const message = '1. Title: ' + blogTitle + '2. Content: ' + content;

        const buckets = await extractLocationOptimized(message);

      // Create videoContent with generated buckets and 'basic' status
      const videoContent = await createOrUpdateVideoContent(buckets, contentType, videoId, blogTitle, 'basic', creator);
        
        
        return res.json({ 
          id: videoContent.id, 
          type: videoContent.contentType,
          title: videoContent.title, 
          noOfBuckets: videoContent.buckets.length, 
          status: videoContent.status 
        });
      }
    } else {
      // DoraAI handling - Use provided title and streamedResponse if available, otherwise use populateDoraAIContent
      let title, description;
      
      if (streamedResponse) {
        // Log for debugging
        console.log('Received streamedResponse in fetchReelDetailsV2:', 
          streamedResponse.substring(0, 100) + '...');
        
        // Use the query parameters directly if streamedResponse is provided
        title = videoId; // Use the videoId (url) as title
        description = streamedResponse;
      } else {
        // Use existing populateDoraAIContent as fallback
        const result = await populateDoraAIContent(videoId);
        title = result.title;
        description = result.description;
      }
      
      const message = '1. Title: ' + title + '2. Description: ' + description;
      const buckets = await extractLocationOptimized(message);

      // Create videoContent with generated buckets and 'deep' status
      const videoContent = await createOrUpdateVideoContent(buckets, contentType, videoId, title, 'deep', creator);

      return res.json({ 
        id: videoContent?.id, 
        type: videoContent?.contentType,
        title: videoContent?.title, 
        noOfBuckets: videoContent.buckets?.length || 0,
        status: videoContent.status || null
      });
    }
  } catch (error) {
    console.error(error);
    return res.json({ error: 'Internal Server Error' });
  }
}

// Utility function to fetch metadata from DORA_AI
async function fetchMetadataFromDoraAI(videoId, contentType, creator = null) {
  try {
    // Construct query parameters
    let params = new URLSearchParams();
    params.append('videoId', videoId);
    params.append('contentType', contentType);
    
    if (creator && contentType === 'tikTok') {
      params.append('creator', creator);
    }
    
    const response = await axios.get(`${process.env.DORA_AI}/fetch-metadata?${params.toString()}`);
    
    const metadata = {
      title: response.data.title || '',
      description: response.data.description || '',
      transcript: response.data.transcript || ''
    };

    let videoContent = null;
    
      const message = `1. Title: ${metadata.title} 2. Description: ${metadata.description} ${metadata.transcript}`;
      const buckets = await extractLocationOptimized(message);

      // Create videoContent with generated buckets and 'basic' status
      videoContent = await createOrUpdateVideoContent(buckets, contentType, videoId, metadata.title, 'basic', creator);
 
    
    return { metadata, videoContent };
  } catch (error) {
    console.error('Error fetching metadata from DORA_AI:', error);
    
    // Create an empty videoContent record even if the API fails
    const videoContent = await VideoContent.create({
      embeddingLink: videoId,
      contentType,
      title: '',
      status: 'basic',
      creator: creator || 'default-creator',
      buckets: []
    });
    
    return {
      metadata: {
        title: '',
        description: '',
        transcript: ''
      },
      videoContent
    };
  }
}

// Helper to upload a file to Pinata (Node.js)
async function uploadToPinataNode(buffer, filename, contentType) {
  const formData = new FormData();
  formData.append('file', buffer, { filename, contentType });

  try {
    const response = await axios.post('https://api.pinata.cloud/pinning/pinFileToIPFS', formData, {
      maxContentLength: Infinity,
      maxBodyLength: Infinity,
      headers: {
        ...formData.getHeaders(),
        'Authorization': `Bearer ${process.env.PINATA_JWT}`,
        'pinata_api_key': process.env.PINATA_API_KEY,
        'pinata_secret_api_key': process.env.PINATA_SECRET_KEY,
      },
    });
    return response.data;
  } catch (error) {
    console.error('Error uploading file to Pinata:', error.response?.data || error.message);
    throw error;
  }
}

async function createNonFungibleToken(treasuryAccountId, supplyKey, treasuryAccountPrivateKey, tokenName, tokenSymbol) {
  const createTokenTx = await new TokenCreateTransaction()
    .setTokenName(tokenName)
    .setTokenSymbol(tokenSymbol)
    .setTokenType(TokenType.NonFungibleUnique)
    .setDecimals(0)
    .setInitialSupply(0)
    .setTreasuryAccountId(treasuryAccountId)
    .setSupplyType(TokenSupplyType.Finite)
    .setMaxSupply(1)
    .setSupplyKey(supplyKey)
    .setAdminKey(treasuryAccountPrivateKey)
    .setMaxTransactionFee(new Hbar(7))
    .freezeWith(hederaClient);
  const signedTx = await createTokenTx.sign(treasuryAccountPrivateKey);
  const response = await signedTx.execute(hederaClient);
  const receipt = await response.getReceipt(hederaClient);
  const tokenId = receipt.tokenId;
  if (!tokenId) throw new Error("TokenId is null");
  return { tokenId, supplyKey };
}

async function mintToken(tokenId, metadata, supplyKey) {
  const mintTokenTxn = new TokenMintTransaction()
    .setTokenId(tokenId)
    .setMetadata(metadata)
    .freezeWith(hederaClient);
  const mintTokenTxnSigned = await mintTokenTxn.sign(supplyKey);
  const txnResponse = await mintTokenTxnSigned.execute(hederaClient);
  const mintTokenRx = await txnResponse.getReceipt(hederaClient);
  return mintTokenRx;
}

async function mintNFT(ipfsHash, userAccount, nftData, videoId) {
  const treasuryAccountId = process.env.HEDERA_OPERATOR_ID;
  const treasuryAccountPrivateKey = PrivateKey.fromString(process.env.HEDERA_OPERATOR_KEY);
  const supplyKey = PrivateKey.generate();
  const rawName = `${nftData?.videoDetails?.channelTitle || 'CMT'} NFT`;
  const tokenName = truncateUtf8(rawName, 100);

  let rawSymbol = (nftData?.videoDetails?.channelTitle || 'CMT')
    .split(' ')
    .map(word => word[0] + word.slice(1).replace(/[aeiouAEIOU]/g, ''))
    .join('')
    .toUpperCase();
  if (!rawSymbol) rawSymbol = 'CMTNFT';
  const tokenSymbol = truncateUtf8(rawSymbol, 8); // 8 chars max is safe
  // 1. Create NFT Collection
  const { tokenId } = await createNonFungibleToken(
    treasuryAccountId,
    supplyKey,
    treasuryAccountPrivateKey,
    tokenName,
    tokenSymbol
  );
  // 2. Prepare metadata JSON
  const mdJson = {
    name: tokenName,
    description: nftData?.videoDetails?.title || '',
    image: "ipfs://" + ipfsHash,
    properties: {
      creator: userAccount.accountId,
      creatorName: nftData?.videoDetails?.channelTitle || '',
      videoId: videoId,
      buckets: nftData?.result || []
    }
  };
  // Upload metadata JSON to Pinata
  const formData = new FormData();
  formData.append('file', Buffer.from(JSON.stringify(mdJson)), 'nft_metadata.json');
  formData.append('pinataOptions', JSON.stringify({ cidVersion: 0 }));
  const response = await axios.post('https://api.pinata.cloud/pinning/pinFileToIPFS', formData, {
    maxBodyLength: Infinity,
    headers: {
      ...formData.getHeaders(),
      'Authorization': `Bearer ${process.env.PINATA_JWT}`,
      'pinata_api_key': process.env.PINATA_API_KEY,
      'pinata_secret_api_key': process.env.PINATA_SECRET_KEY
    }
  });
  const ipfsHashMD = response.data.IpfsHash;
  const metadata = [Buffer.from("ipfs://" + ipfsHashMD)];
  // 3. Mint the NFT with the metadata
  await mintToken(tokenId, metadata, supplyKey);
  // 4. Associate NFT with user's account
  // const associateTx = new TokenAssociateTransaction()
  //   .setAccountId(userAccount.accountId)
  //   .setTokenIds([tokenId])
  //   .freezeWith(hederaClient);
  // const associateTxSigned = await associateTx.sign(PrivateKey.fromString(userAccount.accountPvtKey));
  // const associateSubmit = await associateTxSigned.execute(hederaClient);
  // const associateReceipt = await associateSubmit.getReceipt(hederaClient);
  // 5. Send a message to the topic
  // await new TopicMessageSubmitTransaction({
  //   topicId: topicId,
  //   message: `${tokenName} (${tokenId}) is explored and minted.`
  // }).execute(hederaClient);
  return { tokenId, ipfsHashMD };
}

// Utility function to process video content from DORA_AI
async function processVideoContentFromDoraAI(videoId, contentType, creator = null) {
  let userAccount = {
    accountId: process.env.HEDERA_OPERATOR_ID,
    accountPvtKey: process.env.HEDERA_OPERATOR_KEY
  };
  let newBuckets = [];
  let title = '';
  let existingContent = await VideoContent.findOne({ embeddingLink: videoId, contentType });
  let bucketsForNFT = [];
  let titleForNFT = '';
  try {
    // Construct query parameters
    let params = new URLSearchParams();
    params.append('videoId', videoId);
    params.append('contentType', contentType);
    
    if (creator && contentType === 'tikTok') {
      params.append('creator', creator);
    }
    
    // Call the process-video-content API
    const response = await axios.get(`${process.env.DORA_AI}/process-video-content?${params.toString()}`);
    
    // Get the current videoContent with its buckets
    existingContent = await VideoContent.findOne({ embeddingLink: videoId, contentType });
    
    if (existingContent) {
      // Extract data from the response
      const audioTranscript = response.data.audio_transcript || '';
      const videoText = response.data.video_text || '';
      
      // Combine existing content with new data for deeper location extraction
      // Include existing buckets as context to help find new relevant locations
      let existingLocationsContext = '';
      if (existingContent.buckets && existingContent.buckets.length > 0) {
        existingLocationsContext = 'Previously identified locations: ';
        existingContent.buckets.forEach(bucket => {
          existingLocationsContext += `${bucket.activityName} (${bucket.activityType}), `;
        });
      }
      
      // Construct a comprehensive message for location extraction
      const message = `Title: ${existingContent.title || ''} 
      Audio Transcript: ${audioTranscript} 
      Video Text: ${videoText}
      ${existingLocationsContext}`;
      
      // Create specialized prompt for video content
      const videoContentPrompt = `I'm analyzing a travel video with audio transcript and text extracted from video frames (OCR). 
      The data might be messy with OCR artifacts. Extract travel destinations, activities, and points of interest.
      
      For each location or activity you can confidently identify, provide:
      1. **Type**: "activity" for things to do (hiking, tour, etc.) or "visit" for places to see
      2. **Location**: The most specific place name + city + state/province + country (in Google Maps format). Extract only real, specific places.
      3. **Name**: A descriptive name for the activity or visit
      
      Focus on locations that AREN'T already in the "Previously identified locations" section.
      
      Return ONLY a JSON array of objects with these fields:
      - 'type': "activity" or "visit"
      - 'location': "Place Name, City, State, Country" 
      - 'name': "Activity/Visit Name"
      
      If uncertain about a location, prioritize accuracy over quantity. Return an empty array if no new locations can be confidently identified.
      
      Content to analyze:
      ${message}`;
      
      // Extract new locations using the specialized prompt
      newBuckets = await extractLocationOptimized(message, videoContentPrompt);
      
      // Merge with existing buckets and update the content to 'deep' status
      await createOrUpdateVideoContent(newBuckets, contentType, videoId, existingContent.title, 'deep', creator, existingContent);
      title = existingContent.title;
      bucketsForNFT = newBuckets.length > 0 ? newBuckets : existingContent.buckets;
      titleForNFT = existingContent.title;
    } else {
      // If content doesn't exist (rare case), create it
      
      // Extract from available data
      const audioTranscript = response.data.audio_transcript || '';
      const videoText = response.data.video_text || '';
      
      // Construct message for location extraction
      const message = `Audio Transcript: ${audioTranscript} Video Text: ${videoText}`;
      
      // Create specialized prompt for video content without existing context
      const videoContentPrompt = `I'm analyzing a travel video with audio transcript and text extracted from video frames (OCR).
      The data might be messy with OCR artifacts. Extract travel destinations, activities, and points of interest.
      
      For each location or activity you can confidently identify, provide:
      1. **Type**: "activity" for things to do (hiking, tour, etc.) or "visit" for places to see
      2. **Location**: The most specific place name + city + state/province + country (in Google Maps format). Extract only real, specific places.
      3. **Name**: A descriptive name for the activity or visit
      
      Return ONLY a JSON array of objects with these fields:
      - 'type': "activity" or "visit"
      - 'location': "Place Name, City, State, Country" 
      - 'name': "Activity/Visit Name"
      
      If uncertain about a location, prioritize accuracy over quantity. Return an empty array if no locations can be confidently identified.
      
      Content to analyze:
      ${message}`;
      
      // Extract locations using the specialized prompt
      newBuckets = await extractLocationOptimized(message, videoContentPrompt);
      
      // Create new content with deep status directly
      await createOrUpdateVideoContent(newBuckets, contentType, videoId, '', 'deep', creator);
      title = '';
      bucketsForNFT = newBuckets;
      titleForNFT = '';
    }
  } catch (error) {
    // If processing fails, fallback to existingContent's buckets and title
    if (existingContent) {
      bucketsForNFT = existingContent.buckets;
      titleForNFT = existingContent.title;
    } else {
      bucketsForNFT = [];
      titleForNFT = '';
    }
    console.error('Error processing video content from DORA_AI:', error);
    await VideoContent.findOneAndUpdate(
      { embeddingLink: videoId, contentType },
      { status: 'deep' }
    );
  }
  // --- Pinata NFT logic for all content types ---
  try {
    let imageUrl;
    if (contentType === 'ytShorts') {
      imageUrl = `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`;
    } else {
      imageUrl = 'https://raw.githubusercontent.com/Aakash074/countries-and-states/refs/heads/main/dora.png';
    }
    const imageResp = await axios.get(imageUrl, { responseType: 'arraybuffer' });
    const contentTypeImg = imageResp.headers['content-type'] || 'image/png';
    const filename = contentType === 'ytShorts'
      ? `${videoId}.${contentTypeImg.split('/')[1]}`
      : `dora.png`;
    const pinataResult = await uploadToPinataNode(Buffer.from(imageResp.data), filename, contentTypeImg);
    // --- mintNFT call ---
    const nftData = { videoDetails: { channelTitle: titleForNFT, title: titleForNFT }, result: bucketsForNFT };
    const { tokenId, ipfsHashMD } = await mintNFT(pinataResult.IpfsHash, userAccount, nftData, videoId);
    // Now save everything in one go (update with NFT info)
    await createOrUpdateVideoContent(bucketsForNFT, contentType, videoId, titleForNFT, 'deep', creator, existingContent, tokenId.toString(), ipfsHashMD);
    console.log('Pinata IPFS Hash:', pinataResult.IpfsHash);
  } catch (err) {
    console.error('Pinata upload/mintNFT error:', err);
  }
  // --- End Pinata logic ---
  return true;
}

// Optimized version of extractLocation
async function extractLocationOptimized(message, customPrompt = null) {
  let prompt;
  
  if (customPrompt) {
    prompt = customPrompt.replace('${message}', message);
  } else {
    prompt = `Extract travel itinerary information from the following paragraph and return it as a JSON array of objects. Each object should contain the following properties:

    - 'type': "activity" or "visit"
    - 'location': "Place Name, City, State, Country"
    - 'name': "Activity/Visit Name"

    If the provided paragraph does not contain travel itinerary information, return empty array JSON.

    Here is the itinerary paragraph:
    "${message}"`;
  }

  try {
    const result = await aiProvider.generateCompletion([
      { role: 'user', content: prompt }
    ], {
      temperature: 0.2,
      max_tokens: 1000
    });

    if (!result.success) {
      console.error('AI service failed to extract location information');
      return [];
    }

    // Extract JSON array from response (handle different possible formats)
    let content = result.content;
    let list = [];
    
    try {
      // First, try direct JSON parsing
      list = JSON.parse(content);
    } catch (e) {
      // If direct parsing fails, try to extract JSON part using regex
      const jsonMatch = content.match(/\[[\s\S]*\]/);
      if (jsonMatch) {
        try {
          list = JSON.parse(jsonMatch[0]);
        } catch (innerErr) {
          console.error('Failed to parse JSON from AI response:', innerErr);
        }
      } else {
        console.error('No JSON array found in AI response');
      }
    }

    if (!Array.isArray(list)) {
      console.error('AI response did not provide a valid array');
      return [];
    }

    return list;
  } catch (e) {
    console.error('Error extracting location:', e);
    return [];
  }
}

function truncateUtf8(str, maxBytes) {
  let bytes = 0, i = 0;
  for (; i < str.length; i++) {
    const code = str.charCodeAt(i);
    bytes += code < 0x80 ? 1 : code < 0x800 ? 2 : code < 0x10000 ? 3 : 4;
    if (bytes > maxBytes) break;
  }
  return str.slice(0, i);
}

// Function to create or update video content with buckets
async function createOrUpdateVideoContent(buckets, contentType, videoId, title, status, creator, existingContent = null, nftTokenId = null, nftMetadataIpfsHash = null) {
  try {
    // Process all buckets in parallel
    const processedBucketsPromises = buckets.map(async item => {
      try {
        // First, search for the location using Google Places Autocomplete API
        // Since our bucket items don't have mapData with placeId, we need to search first
        const searchResponse = await axios.post('https://places.googleapis.com/v1/places:autocomplete', {
          input: item.location,
        }, {
          headers: {
            'X-Goog-Api-Key': process.env.GOOGLE_MAPS_API_KEY
          }
        });
        
        // Get the first suggestion's placePrediction object
        const placePrediction = searchResponse.data.suggestions?.[0]?.placePrediction;
        
        if (!placePrediction || !placePrediction.placeId) {
          console.warn(`No place found for location: ${item.location}`);
          return null;
        }
        
        // Now get detailed place information using the found placeId
        try {
          const detailsResponse = await axios.get(
            `https://places.googleapis.com/v1/places/${placePrediction.placeId}?fields=addressComponents&key=${process.env.GOOGLE_MAPS_API_KEY}`
          );
          
          const { addressComponents } = detailsResponse.data;
          
          // Prepare location data based on the autocomplete result, ensuring proper schema structure
          const locationData = {
            place: placePrediction.place || placePrediction.placeId,
            placeId: placePrediction.placeId,
            // Properly structure the text field as an embedded document
            text: placePrediction.text || {
              text: item.location,
              matches: []
            },
            // Properly structure the structuredFormat field
            structuredFormat: placePrediction.structuredFormat || {
              mainText: {
                text: item.location.split(',')[0].trim(),
                matches: []
              },
              secondaryText: {
                text: item.location.includes(',') ? item.location.substring(item.location.indexOf(',') + 1).trim() : '',
                matches: []
              }
            },
            types: placePrediction.types || [],
            addressComponents: addressComponents
          };

          // Find or create location
          const location = await Location.findOneAndUpdate(
            { placeId: locationData.placeId },
            locationData,
            { upsert: true, new: true }
          );

          // Return bucket data
          return {
            locationId: location._id,
            activityName: item.name,
            activityType: item.type
          };
        } catch (detailsError) {
          console.error(`Failed to fetch place details for ${placePrediction.placeId}:`, detailsError.message);
          
          // If place details API fails, still try to create a basic location record with what we have
          // Ensure proper schema structure for embedded fields
          const locationData = {
            place: placePrediction.place || placePrediction.placeId,
            placeId: placePrediction.placeId,
            // Properly structure the text field as an embedded document
            text: placePrediction.text || {
              text: item.location,
              matches: []
            },
            // Properly structure the structuredFormat field
            structuredFormat: placePrediction.structuredFormat || {
              mainText: {
                text: item.location.split(',')[0].trim(),
                matches: []
              },
              secondaryText: {
                text: item.location.includes(',') ? item.location.substring(item.location.indexOf(',') + 1).trim() : '',
                matches: []
              }
            },
            types: placePrediction.types || [],
            addressComponents: []
          };

          const location = await Location.findOneAndUpdate(
            { placeId: locationData.placeId },
            locationData,
            { upsert: true, new: true }
          );

          return {
            locationId: location._id,
            activityName: item.name,
            activityType: item.type
          };
        }
      } catch (error) {
        console.error('Error processing bucket:', error.message);
        return null;
      }
    });

    // Wait for all bucket processing to complete
    const processedBuckets = (await Promise.all(processedBucketsPromises)).filter(bucket => bucket !== null);

    if (existingContent) {
      // If updating existing content, merge with existing buckets
      const existingBucketIds = existingContent.buckets.map(b => b.locationId.toString());
      
      // Only add buckets with locationIds that don't already exist
      const newBuckets = processedBuckets.filter(bucket => 
        !existingBucketIds.includes(bucket.locationId.toString())
      );
      
      // Update the existing content with new buckets and status
      const updatedContent = await VideoContent.findByIdAndUpdate(
        existingContent._id,
        {
          $push: { buckets: { $each: newBuckets } },
          status: status,
          ...(nftTokenId && { nftTokenId }),
          ...(nftMetadataIpfsHash && { nftMetadataIpfsHash })
        },
        { new: true }
      );
      
      return updatedContent;
    } else {
      // Create new video content
      const videoContent = await VideoContent.create({
        embeddingLink: videoId,
        contentType,
        buckets: processedBuckets,
        title: title || '',
        status: status,
        creator: creator || 'default-creator',
        ...(nftTokenId && { nftTokenId }),
        ...(nftMetadataIpfsHash && { nftMetadataIpfsHash })
      });
      
      return videoContent;
    }
  } catch (error) {
    console.error('Error in createOrUpdateVideoContent:', error);
    
    // If there's an error, at least create/update the base record
    if (existingContent) {
      return VideoContent.findByIdAndUpdate(
        existingContent._id,
        { status: status },
        { new: true }
      );
    } else {
      return VideoContent.create({
        embeddingLink: videoId,
        contentType,
        buckets: [],
        title: title || '',
        status: status,
        creator: creator || 'default-creator'
      });
    }
  }
}

module.exports = {
    fetchYoutubeReels,
    fetchReelDetailsById,
    fetchReelDetails,
    fetchReelDetailsV2,
}