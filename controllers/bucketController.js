const VideoContent = require('../models/VideoContent');
const Location = require('../models/Location');
const { UserModel, BucketListItem, Country, State } = require('../models/User');
const { Client, PrivateKey, ContractFunctionParameters, ContractExecuteTransaction, TopicMessageSubmitTransaction } = require("@hashgraph/sdk");
const axios = require('axios');

async function getBucket(req, res) {
    try {
        const userId = req.user.id;
        const user = await UserModel.findById(userId);

        // Fetch all buckets associated with the user
        const bucketItemIds = user.bucket; //Array of bucketIds which needs to be populated

        // Aggregation pipeline to group bucket items by location
        const statesWithBucketItems = await State.aggregate([
            // Match states that have bucket list items from the user's bucket
            {
            $match: {
                bucketList: { 
                $elemMatch: { 
                    $in: bucketItemIds 
                } 
                }
            }
            },
            // Lookup to get the full country details
            {
            $lookup: {
                from: 'countries',
                localField: 'countryId',
                foreignField: '_id',
                as: 'country'
            }
            },
            // Unwind the country array
            { $unwind: '$country' },
            
            // Group by country and collect state details
            {
            $group: {
                _id: '$country._id',
                countryName: { $first: '$country.name' },
                states: {
                $push: {
                    _id: '$_id',
                    name: '$name',
                    bucketListItemCount: {
                    $size: {
                        $setIntersection: [
                        '$bucketList', 
                        bucketItemIds
                        ]
                    }
                    }
                }
                }
            }
            },
            
            // Add total bucket list items for sorting
            {
            $addFields: {
                totalBucketListItems: {
                $sum: '$states.bucketListItemCount'
                }
            }
            },
            
            // Sort by total bucket list items
            { $sort: { totalBucketListItems: -1 } }
            
        ]);

        // Calculate the total bucket items for all countries
        const totalBucketItemsForAllCountries = statesWithBucketItems.reduce((total, country) => {
            return total + country.totalBucketListItems;
        }, 0);

        res.json({
            statesWithBucketItems,
            totalBucketItemsForAllCountries
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Error fetching buckets' });
    }
}
async function saveBucket(req, res) {
    try {
        const { selectedItems, embeddingLink, contentType } = req.body;
        const userId = req.user.id;
        const user = await UserModel.findById(userId);
        let videoContentId = '';
        let nftTokenId = null;
        let nftMetadataIpfsHash = null;
        let nftAddress = null;
        let ipfsMetadata = null;

        // 1. Fetch VideoContent and NFT info
        if (embeddingLink && contentType) {
            const existingContent = await VideoContent.findOne({
                embeddingLink,
                contentType
            });
            if (existingContent) {
                videoContentId = existingContent._id;
                nftTokenId = existingContent.nftTokenId;
                nftMetadataIpfsHash = existingContent.nftMetadataIpfsHash;
                nftAddress = nftTokenId; // for contract
            }
        }

        // 2. Fetch metadata from Pinata IPFS
        if (nftMetadataIpfsHash) {
            try {
                const ipfsGatewayUrl = `https://peach-accused-eel-595.mypinata.cloud/ipfs/${nftMetadataIpfsHash}`;
                const response = await axios.get(ipfsGatewayUrl);
                ipfsMetadata = response.data;
            } catch (error) {
                console.error(`Error fetching metadata from IPFS hash: ${nftMetadataIpfsHash}`, error);
                ipfsMetadata = null;
            }
        }

        // 3. Save bucket items as before
        for (const item of selectedItems) {
            const locationData = {
                place: item.mapData.placePrediction.place,
                placeId: item.mapData.placePrediction.placeId,
                text: item.mapData.placePrediction.text,
                structuredFormat: item.mapData.placePrediction.structuredFormat,
                types: item.mapData.placePrediction.types
            };
            
            // Find or create location
            const location = await Location.findOne(
                { placeId: locationData.placeId }
            );

            if (!location || !location.addressComponents) continue;

            const stateComponent = location.addressComponents.find(component =>
                component.types.includes('administrative_area_level_1')
            );
            const countryComponent = location.addressComponents.find(component =>
                component.types.includes('country')
            );

            if (!countryComponent) continue;

            const countryName = countryComponent.longText;

            // Find or create country
            let country = await Country.findOne({ name: countryName });
            if (!country) {
                country = new Country({ name: countryName, states: [], bucketList: [] });
                await country.save();
            }

            if(stateComponent) {
                const stateName = stateComponent.longText;
                let state = await State.findOne({ name: stateName, countryId: country._id });

                if (!state) {
                    state = new State({ name: stateName, countryId: country._id, bucketList: [] });
                    await state.save();

                    // Add state to country
                    country.states.push(state._id);
                    await country.save();
                }

                //create new bucketlist
                const bucketListDoc = await BucketListItem.create({
                    locationId: location._id,
                    activityName: item.name,
                    activityType: item.type,
                    contentId: videoContentId || null,
                    stateId: state._id,
                    countryId: country._id,
                    userId: userId,
                    status: 'toDo',
                    history: [ ]
                });
                state.bucketList.push(bucketListDoc._id);
                await state.save();

                user.bucket.push(bucketListDoc._id);
                await user.save();
            } else {
                //create new bucketlist
                const bucketListDoc = await BucketListItem.create({
                    locationId: location._id,
                    activityName: item.name,
                    activityType: item.type,
                    contentId: videoContentId || null,
                    countryId: country._id,
                    userId: userId,
                    status: 'toDo',
                    history: [ ]
                });

                country.bucketList.push(bucketListDoc._id);
                await country.save();

                user.bucket.push(bucketListDoc._id);
                await user.save();

            }

        }
        await user.save();

        // 4. Contract transaction to link NFT to buckets
        let contractTxStatus = null;
        if (nftAddress && ipfsMetadata && ipfsMetadata.properties && Array.isArray(ipfsMetadata.properties.buckets)) {
            try {
                // const contractId = "0.0.5138175"; //testnet
                const contractId = "0.0.9423343";
                // const topicId = "0.0.5138179";
                // Get user's Hedera account info
                const userAccount = user.hedera || {};
                const client = Client.forMainnet();
                client.setOperator(userAccount.accountId, PrivateKey.fromString(userAccount.privateKey || userAccount.accountPvtKey));

                // Prepare bucket details from metadata
                const bucketDetails = {
                    bucketTypes: [],
                    names: [],
                    places: []
                };
                ipfsMetadata.properties.buckets.forEach(bucket => {
                    bucketDetails.bucketTypes.push(bucket.activityType);
                    bucketDetails.names.push(bucket.activityName);
                    bucketDetails.places.push(bucket.locationId || '');
                });

                const params = new ContractFunctionParameters()
                    .addString(userAccount.accountId.toString())
                    .addString(nftAddress.toString())
                    .addStringArray(bucketDetails.bucketTypes)
                    .addStringArray(bucketDetails.names)
                    .addStringArray(bucketDetails.places);

                const transaction = new ContractExecuteTransaction()
                    .setContractId(contractId)
                    .setGas(1_000_000)
                    .setFunction("linkNFTToBuckets", params);

                const txResponse = await transaction.execute(client);
                const receipt = await txResponse.getReceipt(client);
                contractTxStatus = receipt.status.toString();

                // Send topic message
                // const sendResponse = await new TopicMessageSubmitTransaction({
                //     topicId: topicId,
                //     message: `${nftAddress} is added to bucketlist`,
                // }).execute(client);
                // const getReceipt = await sendResponse.getReceipt(client);
                // const transactionStatus = getReceipt.status.toString();
                // console.log("The message transaction status " + transactionStatus);
            } catch (err) {
                console.error('Error in contract bucket linking:', err);
                contractTxStatus = 'FAILED';
            }
        }

        return {
            success: true,
            message: 'Bucket items saved successfully',
            contractTxStatus
        };

    } catch (error) {
        console.error(error);
        return {
            success: false,
            message: error.message
        };
    }
}

const getBucketListByStateAndUser = async (req, res) => {
    const { stateId } = req.params;
    const userId = req.user.id;
    try {
        // Find bucket list items matching the state and user
    const bucketListItems = await BucketListItem.find({
        stateId: stateId,
        userId: userId
      })
      .populate({
        path: 'locationId',
        select: 'place placeId structuredFormat types' // Select specific location fields
      })
      .select('activityName activityType status history locationId');

      // Count total items
    const totalItems = bucketListItems.length;

    // Transform the response to include more detailed location information
    const transformedBucketListItems = bucketListItems.map(item => ({
        id: item.id,
        activityName: item.activityName,
        activityType: item.activityType,
        status: item.status,
        history: item.history,
        location: {
        //   place: item.locationId.place,
          placeId: item.locationId.placeId,
          mainText: item.locationId.structuredFormat?.mainText?.text || '',
          secondaryText: item.locationId.structuredFormat?.secondaryText?.text || '',
          types: item.locationId.types || []
        }
      }));
  
      // Return the response
      res.status(200).json({
        totalItems,
        bucketListItems: transformedBucketListItems
      });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Error fetching buckets' });
    }
}

const updateBucketStatus = async (req, res) => {
    const userId = req.user.id;
    const { status, bucketId } = req.body
    try {
        // Find and update the bucket list item
    const updatedBucketListItem = await BucketListItem.findOneAndUpdate(
        { _id: bucketId, userId: userId },
        { $set: { status: status }},
        { new: true } // Return the updated document
      );
  
      if (!updatedBucketListItem) {
        return res.status(404).json({ error: 'Bucket list item not found.' });
      }
  
      // Respond with the updated item
    //   res.status(200).json({ result: 'success'});
    return {
        success: true,
        message: 'Bucket status updated successfully',
        // data: updatedBucket
    };
    } catch (error) {
        console.error(error);
        // res.status(500).json({ message: 'Error updating bucket status' });
        return {
            success: false,
            message: error.message
        };
    }
};

// 1. Get all countries with their bucket counts
const getCountriesBucketSummary = async (req, res) => {
    try {
        const userId = req.user.id;
        const user = await UserModel.findById(userId);
        const bucketItemIds = user.bucket;

        // Get total completed buckets count
        const completedBucketsCount = await BucketListItem.countDocuments({
            _id: { $in: bucketItemIds },
            userId: userId,
            status: 'done'
        });

        const countries = await Country.aggregate([
            // Lookup states for this country
            {
                $lookup: {
                    from: 'states',
                    localField: 'states',
                    foreignField: '_id',
                    as: 'stateDetails'
                }
            },
            // Add fields for bucket counts
            {
                $addFields: {
                    // Direct buckets (without states)
                    directBucketCount: {
                        $size: {
                            $setIntersection: ['$bucketList', bucketItemIds]
                        }
                    },
                    // State buckets
                    stateBucketCount: {
                        $reduce: {
                            input: '$stateDetails',
                            initialValue: 0,
                            in: {
                                $add: [
                                    '$$value',
                                    {
                                        $size: {
                                            $setIntersection: ['$$this.bucketList', bucketItemIds]
                                        }
                                    }
                                ]
                            }
                        }
                    }
                }
            },
            // Add total count and bucket type
            {
                $addFields: {
                    totalBuckets: { $add: ['$directBucketCount', '$stateBucketCount'] },
                    bucketType: {
                        $cond: {
                            if: { $gt: ['$directBucketCount', 0] },
                            then: {
                                $cond: {
                                    if: { $gt: ['$stateBucketCount', 0] },
                                    then: 'mixed',
                                    else: 'direct'
                                }
                            },
                            else: 'stateOnly'
                        }
                    }
                }
            },
            // Project only needed fields
            {
                $project: {
                    name: 1,
                    totalBuckets: 1,
                    directBucketCount: 1,
                    stateBucketCount: 1,
                    bucketType: 1,
                    hasStates: { $gt: [{ $size: '$stateDetails' }, 0] },
                    stateCount: { $size: '$stateDetails' }
                }
            },
            // Sort by total buckets
            { $sort: { totalBuckets: -1 } }
        ]);

        const totalBuckets = countries.reduce((sum, country) => sum + country.totalBuckets, 0);

        res.json({
            success: true,
            data: countries,
            summary: {
                totalCountries: countries.length,
                totalBuckets: totalBuckets,
                completedBuckets: completedBucketsCount,
                pendingBuckets: totalBuckets - completedBucketsCount,
                completionRate: totalBuckets > 0 ? Math.round((completedBucketsCount / totalBuckets) * 100) : 0
            }
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, message: 'Error fetching countries summary' });
    }
};

// 2. Get detailed country bucket information
const getCountryBucketDetails = async (req, res) => {
    try {
        const userId = req.user.id;
        const { countryId } = req.params;
        const user = await UserModel.findById(userId);
        const bucketItemIds = user.bucket;

        // Get country details with states
        const country = await Country.findById(countryId).populate('states');

        if (!country) {
            return res.status(404).json({ success: false, message: 'Country not found' });
        }

        // Get direct buckets (without states)
        const directBuckets = await BucketListItem.find({
            _id: { $in: country.bucketList },
            userId: userId,
            stateId: { $exists: false }
        }).populate('locationId');

        // Get state buckets
        const stateBuckets = await Promise.all(country.states.map(async (state) => {
            const buckets = await BucketListItem.find({
                _id: { $in: state.bucketList },
                userId: userId
            }).populate('locationId');

            return {
                stateId: state._id,
                stateName: state.name,
                buckets: buckets.map(bucket => ({
                    id: bucket._id,
                    activityName: bucket.activityName,
                    activityType: bucket.activityType,
                    status: bucket.status,
                    location: {
                        placeId: bucket.locationId.placeId,
                        mainText: bucket.locationId.structuredFormat?.mainText?.text || '',
                        secondaryText: bucket.locationId.structuredFormat?.secondaryText?.text || ''
                    }
                }))
            };
        }));

        res.json({
            success: true,
            data: {
                countryName: country.name,
                directBuckets: directBuckets.map(bucket => ({
                    id: bucket._id,
                    activityName: bucket.activityName,
                    activityType: bucket.activityType,
                    status: bucket.status,
                    location: {
                        placeId: bucket.locationId.placeId,
                        mainText: bucket.locationId.structuredFormat?.mainText?.text || '',
                        secondaryText: bucket.locationId.structuredFormat?.secondaryText?.text || ''
                    }
                })),
                states: stateBuckets
            }
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, message: 'Error fetching country details' });
    }
};

// 3. Get state bucket details
const getStateBucketDetails = async (req, res) => {
    try {
        const userId = req.user.id;
        const { stateId } = req.params;

        const state = await State.findById(stateId);
        if (!state) {
            return res.status(404).json({ success: false, message: 'State not found' });
        }

        const buckets = await BucketListItem.find({
            _id: { $in: state.bucketList },
            userId: userId
        }).populate('locationId');

        res.json({
            success: true,
            data: {
                stateName: state.name,
                buckets: buckets.map(bucket => ({
                    id: bucket._id,
                    activityName: bucket.activityName,
                    activityType: bucket.activityType,
                    status: bucket.status,
                    location: {
                        placeId: bucket.locationId.placeId,
                        mainText: bucket.locationId.structuredFormat?.mainText?.text || '',
                        secondaryText: bucket.locationId.structuredFormat?.secondaryText?.text || ''
                    }
                }))
            }
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, message: 'Error fetching state details' });
    }
};

// Function to fetch metadata from content URLs
const fetchContentMetadata = async (content) => {
    try {
        const axios = require('axios');
        const cheerio = require('cheerio');
        
        // Default metadata
        const metadata = {
            thumbnail: null,
            title: content.title || 'Untitled',
            description: null
        };

        // Generate URL based on contentType
        let contentUrl = null;
        if (content.embeddingLink) {
            switch (content.contentType) {
                case 'instaReels':
                    contentUrl = `https://instagram.com/reel/${content.embeddingLink}`;
                    metadata.thumbnail = `https://instagram.com/p/${content.embeddingLink}/media/?size=l`;
                    break;
                case 'ytShorts':
                    contentUrl = `https://youtube.com/shorts/${content.embeddingLink}`;
                    metadata.thumbnail = `https://img.youtube.com/vi/${content.embeddingLink}/hqdefault.jpg`;
                    break;
                case 'blog':
                    contentUrl = content.embeddingLink;
                    break;
                case 'doraAI':
                    contentUrl = null;
                    break;
                case 'tikTok':
                    contentUrl = content.creator 
                        ? `https://www.tiktok.com/${content.creator}/video/${content.embeddingLink}`
                        : null;
                    break;
                default:
                    contentUrl = content.embeddingLink;
            }
        }

        // If we have a valid URL and it's not a Dora content, try to fetch metadata
        if (contentUrl && content.contentType !== 'doraAI') {
            try {
                // Set a reasonable timeout for external requests
                const response = await axios.get(contentUrl, { 
                    timeout: 5000,
                    headers: {
                        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
                    }
                });
                
                // Parse the HTML
                const $ = cheerio.load(response.data);
                
                // Look for OpenGraph and other metadata
                metadata.title = $('meta[property="og:title"]').attr('content') || 
                                 $('title').text() || 
                                 content.title || 
                                 'Untitled';
                
                metadata.description = $('meta[property="og:description"]').attr('content') || 
                                       $('meta[name="description"]').attr('content') || 
                                       null;
                
                // If we don't already have a thumbnail, look for it in the metadata
                if (!metadata.thumbnail) {
                    metadata.thumbnail = $('meta[property="og:image"]').attr('content') || 
                                         $('meta[property="twitter:image"]').attr('content') || 
                                         null;
                }
            } catch (fetchError) {
                console.warn(`Failed to fetch metadata for ${contentUrl}:`, fetchError.message);
                // Continue with default metadata if fetching fails
            }
        }

        return metadata;
    } catch (error) {
        console.error('Error in fetchContentMetadata:', error);
        return {
            thumbnail: null,
            title: content.title || 'Untitled',
            description: null
        };
    }
};

// Get content details by ID
const getContentDetailsById = async (req, res) => {
    try {
        const userId = req.user.id;
        const { contentId } = req.params;

        // Find the content
        const content = await VideoContent.findById(contentId);
        if (!content) {
            return res.status(404).json({ 
                success: false, 
                message: 'Content not found' 
            });
        }

        // Find all buckets for this content that belong to the user
        const bucketItems = await BucketListItem.find({
            contentId: contentId,
            userId: userId
        }).populate('locationId');

        if (!bucketItems || bucketItems.length === 0) {
            return res.status(404).json({ 
                success: false, 
                message: 'No bucket items found for this content' 
            });
        }

        // Generate the content URL based on contentType
        let contentUrl = null;
        if (content.embeddingLink) {
            switch (content.contentType) {
                case 'instaReels':
                    contentUrl = `https://instagram.com/reel/${content.embeddingLink}`;
                    break;
                case 'ytShorts':
                    contentUrl = `https://youtube.com/shorts/${content.embeddingLink}`;
                    break;
                case 'blog':
                    contentUrl = content.embeddingLink;
                    break;
                case 'doraAI':
                    contentUrl = null;
                    break;
                case 'tikTok':
                    contentUrl = content.creator 
                        ? `https://www.tiktok.com/${content.creator}/video/${content.embeddingLink}`
                        : `https://www.tiktok.com/video/${content.embeddingLink}`;
                    break;
                default:
                    contentUrl = content.embeddingLink;
            }
        }

        // Try to get metadata for content
        const metadata = await fetchContentMetadata(content);

        // Format the response
        const formattedContent = {
            id: content._id,
            title: metadata.title || content.title || 'Untitled',
            contentType: content.contentType,
            embeddingLink: content.embeddingLink,
            contentUrl: contentUrl,
            creator: content.creator,
            createdAt: content.createdAt,
            status: content.status,
            thumbnail: metadata.thumbnail,
            description: metadata.description,
            buckets: bucketItems.map(item => ({
                id: item._id,
                activityName: item.activityName,
                activityType: item.activityType,
                status: item.status,
                location: {
                    placeId: item.locationId?.placeId,
                    mainText: item.locationId?.structuredFormat?.mainText?.text || '',
                    secondaryText: item.locationId?.structuredFormat?.secondaryText?.text || ''
                }
            }))
        };
        console.log(formattedContent?.buckets, 'formattedContent');

        res.json({
            success: true,
            data: formattedContent
        });
    } catch (error) {
        console.error('Error fetching content details:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Error fetching content details' 
        });
    }
};

// Function to get all content saved by user with pagination
const getUserSavedContent = async (req, res) => {
    try {
        console.log('getUserSavedContent');
        const userId = req.user.id;
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 10;
        const skip = (page - 1) * limit;
        // Option to skip metadata fetching for faster response
        const skipMetadata = req.query.skipMetadata === 'true';
        // Limit concurrent metadata requests to avoid rate limiting
        const maxConcurrentRequests = parseInt(req.query.maxConcurrentRequests) || 3;
        // Filter by content type
        const contentTypeFilter = req.query.contentType;

        // Get user's bucket list items
        const user = await UserModel.findById(userId);
        if (!user) {
            return res.status(404).json({ success: false, message: 'User not found' });
        }

        // Find all bucket items with contentId that is not null
        const bucketItems = await BucketListItem.find({
            _id: { $in: user.bucket },
            contentId: { $ne: null }
        }).populate('contentId locationId');

        // Group by contentId to avoid duplicates
        const contentMap = new Map();

        // First pass: Organize content and generate URLs
        for (const item of bucketItems) {
            if (item.contentId && !contentMap.has(item.contentId._id.toString())) {
                const content = item.contentId;
                
                // Skip if contentType filter is provided and doesn't match
                if (contentTypeFilter && content.contentType !== contentTypeFilter) {
                    continue;
                }
                
                // Generate content URL
                let contentUrl = null;
                if (content.embeddingLink) {
                    switch (content.contentType) {
                        case 'instaReels':
                            contentUrl = `https://instagram.com/reel/${content.embeddingLink}`;
                            break;
                        case 'ytShorts':
                            contentUrl = `https://youtube.com/shorts/${content.embeddingLink}`;
                            break;
                        case 'blog':
                            contentUrl = content.embeddingLink;
                            break;
                        case 'doraAI':
                            contentUrl = null;
                            break;
                        case 'tikTok':
                            contentUrl = content.creator 
                                ? `https://www.tiktok.com/${content.creator}/video/${content.embeddingLink}`
                                : `https://www.tiktok.com/video/${content.embeddingLink}`;
                            break;
                        default:
                            contentUrl = content.embeddingLink;
                    }
                }

                contentMap.set(content._id.toString(), {
                    id: content._id,
                    title: content.title || 'Untitled',
                    contentType: content.contentType,
                    embeddingLink: content.embeddingLink,
                    contentUrl: contentUrl,
                    creator: content.creator,
                    createdAt: content.createdAt,
                    status: content.status,
                    thumbnail: null,
                    description: null,
                    buckets: [{
                        activityName: item.activityName,
                        activityType: item.activityType,
                        location: {
                            placeId: item.locationId?.placeId,
                            mainText: item.locationId?.structuredFormat?.mainText?.text || '',
                            secondaryText: item.locationId?.structuredFormat?.secondaryText?.text || ''
                        }
                    }]
                });
            } else if (item.contentId) {
                // Skip if we already filtered out this content type
                if (!contentMap.has(item.contentId._id.toString())) {
                    continue;
                }
                
                // Add this bucket to existing content's buckets array
                const existingContent = contentMap.get(item.contentId._id.toString());
                existingContent.buckets.push({
                    activityName: item.activityName,
                    activityType: item.activityType,
                    location: {
                        placeId: item.locationId?.placeId,
                        mainText: item.locationId?.structuredFormat?.mainText?.text || '',
                        secondaryText: item.locationId?.structuredFormat?.secondaryText?.text || ''
                    }
                });
            }
        }

        // Convert map to array and sort by createdAt date (newest first)
        const contentArray = Array.from(contentMap.values())
            .sort((a, b) => {
                // Sort by createdAt in descending order (newest first)
                return new Date(b.createdAt) - new Date(a.createdAt);
            });
            
        const totalItems = contentArray.length;
        const totalPages = Math.ceil(totalItems / limit);
        const paginatedContent = contentArray.slice(skip, skip + limit);

        // Second pass: Fetch metadata for paginated content if requested
        if (!skipMetadata) {
            // Process in batches with controlled concurrency
            const processBatch = async (items, batchSize) => {
                for (let i = 0; i < items.length; i += batchSize) {
                    const batch = items.slice(i, i + batchSize);
                    await Promise.all(
                        batch.map(async (item) => {
                            try {
                                const content = await VideoContent.findById(item.id);
                                if (content) {
                                    const metadata = await fetchContentMetadata(content);
                                    item.title = metadata.title || item.title;
                                    item.thumbnail = metadata.thumbnail;
                                    item.description = metadata.description;
                                }
                            } catch (error) {
                                console.error(`Error fetching metadata for content ${item.id}:`, error.message);
                                // Continue with existing data
                            }
                        })
                    );
                }
            };

            await processBatch(paginatedContent, maxConcurrentRequests);
        }
        console.log(paginatedContent, 'paginatedContent');

        res.json({
            success: true,
            data: {
                content: paginatedContent,
                pagination: {
                    currentPage: page,
                    totalPages,
                    totalItems,
                    limit
                }
            }
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, message: 'Error fetching saved content' });
    }
};

module.exports = {
    saveBucket,
    getBucket,
    getBucketListByStateAndUser,
    updateBucketStatus,
    getCountriesBucketSummary,
    getCountryBucketDetails,
    getStateBucketDetails,
    getUserSavedContent,
    getContentDetailsById
};