const VideoContent = require('../models/VideoContent');
const { Country } = require('../models/User');
const axios = require('axios');
const cheerio = require('cheerio');
const reelJson = require('../utils/initialReels.json')
const Deal = require('../models/Deal');

// Helper function to calculate display price
const calculateDisplayPrice = (actualPrice, commissionPercentage) => {
    if (!actualPrice) return null;
    return actualPrice * (1 + (commissionPercentage / 100));
};

// Helper function to transform pricing data
const transformPricingData = (pricing, commissionPercentage) => {
    return pricing.map(priceGroup => ({
        ...priceGroup,
        rates: {
            Standard: calculateDisplayPrice(priceGroup.rates.Standard, commissionPercentage),
            Deluxe: calculateDisplayPrice(priceGroup.rates.Deluxe, commissionPercentage),
            SuperDeluxe: calculateDisplayPrice(priceGroup.rates.SuperDeluxe, commissionPercentage),
            Luxury: calculateDisplayPrice(priceGroup.rates.Luxury, commissionPercentage),
            Premium: calculateDisplayPrice(priceGroup.rates.Premium, commissionPercentage)
        },
        extraOptions: {
            WithExtraMattress: calculateDisplayPrice(priceGroup.extraOptions?.WithExtraMattress, commissionPercentage),
            WithoutExtraMattress: calculateDisplayPrice(priceGroup.extraOptions?.WithoutExtraMattress, commissionPercentage)
        }
    }));
};

const getMeta = async ({data, url}) => {
    const $ = cheerio.load(data);

    const metadata = {
        title: $('meta[property="og:title"]').attr('content') 
               || $('meta[name="title"]').attr('content')
               || $('title').text(),
  
        description: $('meta[property="og:description"]').attr('content')
                     || $('meta[name="description"]').attr('content')
                     || '',
  
        image: $('meta[property="og:image"]').attr('content')
               || $('meta[name="twitter:image"]').attr('content')
               || '',
  
        url: $('meta[property="og:url"]').attr('content') 
             || url,
  
        siteName: $('meta[property="og:site_name"]').attr('content') || '',
  
        // Additional useful meta tags
        author: $('meta[name="author"]').attr('content') 
                || $('author').text() 
                || ''
      };
  
      // Clean up and validate metadata
      Object.keys(metadata).forEach(key => {
        if (metadata[key]) {
          metadata[key] = metadata[key].trim();
        }
      });
  
      return metadata;
}


const getTopCountriesAndRandomBlogs = async (req, res) => {
    try {
      // Aggregation for top 4 countries
      const topCountriesWithBucketList = await Country.aggregate([
        {
          $lookup: {
            from: 'states',
            localField: '_id',
            foreignField: 'countryId',
            as: 'countryStates'
          }
        },
        {
          $unwind: '$countryStates'
        },
        {
          $lookup: {
            from: 'bucketlistitems',
            localField: 'countryStates.bucketList',
            foreignField: '_id',
            as: 'stateBucketListItems'
          }
        },
        {
          $group: {
            _id: '$_id',
            name: { $first: '$name' },
            totalBucketListItems: { $sum: { $size: '$stateBucketListItems' } }
          }
        },
        {
          $sort: { totalBucketListItems: -1 }
        },
        {
          $limit: 7
        }
      ]);
  
      // Find 3 random blog contents
      const randomBlogs = await VideoContent.aggregate([
        // Filter for blog content type
        { 
          $match: { 
            contentType: 'blog' 
          } 
        },
        // Add a random field for sampling
        { 
          $addFields: { 
            randomField: { $rand: {} } 
          } 
        },
        // Sort by the random field
        { 
          $sort: { randomField: 1 } 
        },
        // Limit to 3 random blogs
        { 
          $limit: 3 
        },
        // Project only needed fields
        {
          $project: {
            embeddingLink: 1,
            contentType: 1,
            creator: 1,
            buckets: 1
          }
        }
      ]);

      const randomBlogswithMeta = await Promise.all(
        randomBlogs.map(async (item) => {
          try {
            const { data } = await axios.get(item?.embeddingLink, {
                headers: {
                  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
                  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
                  'Accept-Language': 'en-US,en;q=0.5',
                  'Referer': 'https://www.google.com/'
                }
              });
            const metadata = await getMeta({data, url: item?.embeddingLink});
            return { ...item, metadata };
          } catch (error) {
            console.error(`Error fetching metadata for ${item?.embeddingLink}:`, error);
            return { ...item, metadata: null };
          }
        })
      );
  
      // Get 4 random active travel deals
      const currentDate = new Date();
      const randomDeals = await Deal.aggregate([
        // Match active deals (current date is between validity start and end dates)
        {
          $match: {
            'validity.startDate': { $lte: currentDate },
            'validity.endDate': { $gte: currentDate }
          }
        },
        // Add a random field for sampling
        { 
          $addFields: { 
            randomField: { $rand: {} } 
          } 
        },
        // Sort by the random field
        { 
          $sort: { randomField: 1 } 
        },
        // Limit to 4 random deals
        { 
          $limit: 4 
        },
        // Project needed fields including commissionPercentage for price transformation
        {
          $project: {
            packageName: 1,
            packageType: 1,
            duration: 1,
            destinations: 1,
            pricing: 1,
            currency: 1,
            priceType: 1,
            inclusions: 1,
            partner: 1,
            commissionPercentage: 1
          }
        }
      ]);

      // Transform deals to include display prices
      const transformedDeals = randomDeals.map(deal => {
        const dealObj = {...deal};
        dealObj.pricing = transformPricingData(dealObj.pricing, dealObj.commissionPercentage);
        // Remove commissionPercentage from the response
        delete dealObj.commissionPercentage;
        return dealObj;
      });
  
      // Successful response
      res.status(200).json({
          topCountries: topCountriesWithBucketList,
          randomBlogs: randomBlogswithMeta,
          randomDeals: transformedDeals,
          initialReels: reelJson?.items,
      });
    } catch (error) {
      // Error handling
      console.error('Error fetching data:', error);
      res.status(500).json({ 
        message: 'Error fetching data', 
        error: error.message 
      });
    }
  };
  
  module.exports = {
    getTopCountriesAndRandomBlogs
  };