# CloneMyTrips (Dora AI)

**Purpose**:

This project aims to revolutionize travel planning and inspiration by integrating AI, blockchain (Hedera), and Web3 technologies. Users engage with short-form travel content (reels), powered by AI analysis, and can save these experiences to a decentralized bucket list. This approach ensures content authenticity, enables creator monetization through NFTs, and provides travelers with a transparent, gamified system to track and complete their bucket list goals.

**Key Features**:

- Seamless Hedera account creation for every user
- AI-driven video processing and IPFS storage using Pinata
- NFT minting on Hedera to ensure content provenance
- Smart contract-powered bucket list tracking for users

- Demo 1 - https://www.youtube.com/watch?v=iwBBfyQYNrs
- Demo 2 - https://www.youtube.com/watch?v=pBk-WWpcIQg
- Explanation Video - https://www.youtube.com/watch?v=qKS1rFle1FQ
- Contract Address - 0.0.5138175
- Topic Id - 0.0.5138179
- Operator Address - 0.0.4866116

App Links
- Android - https://play.google.com/store/apps/details?id=com.flyingwands.clonemytrips
- iOS - https://apps.apple.com/in/app/clonemytrips/id6738989744

---

## 1️⃣ Hedera Account Creation

### 🔍 Purpose:

To allow every user to interact with Hedera-powered smart contracts and own NFTs representing their travel goals or inspirations, a Hedera account is automatically created during registration or login.

### 🔧 Implementation Details:

**Where it's integrated:**

- `registerController.js`: Called during user sign-up.
- `requiredLogin.js`: Called on login, ensuring even returning users have a Hedera account.
- Social login controllers (Google, Apple, etc.) also call the same utility.

**How it works:**

1. On registration/login, the backend checks if `user.hedera` exists in MongoDB.
2. If not:
    - The backend uses operator credentials from `.env` to create a Hedera account via `createHederaAccount(user)` inside `utils/hederaUtil.js`.
    - The newly generated Hedera `accountId`, `publicKey`, and `privateKey` are saved securely in the user’s document in MongoDB.
3. Errors during account creation are logged but **do not** block user registration/login to ensure smooth onboarding.

### 🔐 Security Note:

- Hedera keys are stored securely. Future improvements will include key encryption and/or vault-based secure key management.

---

## 2️⃣ Video Content Upload, AI Processing, IPFS Storage, and NFT Minting

### 🎯 Purpose:

To capture, enhance, and permanently store inspirational travel content (reels) and tokenize them as NFTs to enable authenticity, discoverability, and future monetization.

### 🔄 Workflow:

### Step 1: Video Upload & AI Processing

- Users upload reels via the frontend.
- Backend routes: `controllers/reelsController.js` or `controllers/doraAIController.js`.
- AI processes the video for:
    - Travel destination recognition
    - Tagging & categorization
    - Thumbnail enhancement
- AI logic is in `lib/doraAI/` or through external providers (integrated via `utils/aiProvider.js`).

### Step 2: Upload to IPFS via Pinata

- Processed videos are uploaded to IPFS using Pinata (`utils/pinata.js`).
- Returns a unique **IPFS CID** that is stored in MongoDB (`models/VideoContent.js`).

### Step 3: NFT Minting on Hedera

- Once uploaded to IPFS:
    - An NFT is minted using the **Hedera SDK**.
    - Metadata includes the IPFS CID, creator info, and travel tags.
- NFT token ID & serial number are saved in the MongoDB reel/video document.

### 📁 Relevant Files:

- `controllers/reelsController.js`
- `controllers/doraAIController.js`
- `utils/aiProvider.js` (AI integration)
- `utils/pinata.js` (IPFS storage)
- `models/VideoContent.js` or `models/Reel.js`
- `contracts/Bucket.sol`, `contracts/BucketAbi.json` (smart contract interface)

---

## 3️⃣ User Interaction: Saving Reels to On-Chain Bucket List

### 🧭 Purpose:

Let users add reels to a personal bucket list that is both on-chain and synced with their in-app profile. This gamifies travel planning while leveraging blockchain for data ownership and transparency.

### 🚀 Workflow:

1. **User Interaction**:
    - User taps “Add to Bucket List” on a reel.
    - Frontend triggers a backend call (`api/buckets/` or `api/reels/`).
2. **Smart Contract Call**:
    - Backend (`controllers/bucketController.js`) calls the Hedera smart contract (`Bucket.sol`) using the user’s private key to execute `addToBucket()` or similar methods.
    - Contract logs that a specific user added a specific NFT/reel to their bucket list.
3. **Database Sync**:
    - In addition to on-chain logging, the bucket list is updated in the user document (`models/User.js`) for quick frontend access.
4. **Gamification Potential**:
    - Completion of travel goals can unlock badges, NFTs, or rewards.
    - Community challenges (e.g., "7 Wonders Challenge") can be tracked using this mechanism.

### 📂 Relevant Files:

- `contracts/Bucket.sol`
- `contracts/BucketAbi.json`
- `controllers/bucketController.js`
- `models/User.js`
- `api/buckets/`, `api/reels/`

---

## 🔑 Significance of the System

### ✅ For Users:

- Own their travel goals and memories as NFTs.
- Track progress of real-life adventures using a gamified, transparent system.
- Ensure content they're inspired by is authentic and verified on-chain.

### ✅ For Creators:

- Mint reels as NFTs, ensuring originality and enabling future monetization or resale.
- Gain credibility and visibility through decentralized content tagging.

### ✅ For Travel Agencies & Businesses:

- Gain access to high-intent leads via bucket list entries.
- Offer personalized deals on top of users' bucketed goals.
- Participate in community challenges and campaigns using smart contracts.
