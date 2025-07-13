// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.0;

contract NFTBucketLinker {
    struct Bucket {
        string bucketType;
        string name;
        string place;
    }

    struct UserNFTLink {
        string nftAddress; // The NFT identifier
        Bucket[] selectedBuckets;
    }

    // Mapping to store multiple NFT links per user
    mapping(string => UserNFTLink[]) public userLinks; // Key is the Hedera account ID as a string

    // Mapping to store user follow relationships
    mapping(string => string[]) public userFollows; // Key is the follower, value is an array of followees

    /// @dev Event to track when a user links an NFT to specific buckets
    event NFTLinked(string indexed user, string indexed nftAddress, Bucket[] selectedBuckets);

    /// @dev Event to track when a user follows another user
    event UserFollowed(string indexed follower, string indexed followee);

    /// @notice Link user's account to an NFT with selected buckets
    /// @param user The user's Hedera account ID
    /// @param nftAddress The address or ID of the NFT
    /// @param bucketTypes Array of bucket types (e.g., "visit", "activity")
    /// @param names Array of names corresponding to each bucket type
    /// @param places Array of place names for each bucket
    function linkNFTToBuckets(
        string memory user,
        string memory nftAddress,
        string[] memory bucketTypes,
        string[] memory names,
        string[] memory places
    ) public {
        require(
            bucketTypes.length == names.length && names.length == places.length,
            "Mismatched input lengths"
        );

        // Add a new UserNFTLink to the user's list
        userLinks[user].push();
        UserNFTLink storage newLink = userLinks[user][userLinks[user].length - 1];
        newLink.nftAddress = nftAddress;

        // Populate selectedBuckets with provided data
        for (uint i = 0; i < bucketTypes.length; i++) {
            newLink.selectedBuckets.push(Bucket({
                bucketType: bucketTypes[i],
                name: names[i],
                place: places[i]
            }));
        }

        emit NFTLinked(user, nftAddress, newLink.selectedBuckets);
    }

    /// @notice Follow or unfollow another user
    /// @param follower The user's Hedera account ID who is following or unfollowing
    /// @param followee The user's Hedera account ID being followed or unfollowed
    function followUser(string memory follower, string memory followee) public {
        require(bytes(follower).length > 0 && bytes(followee).length > 0, "Invalid user IDs");
        require(keccak256(bytes(follower)) != keccak256(bytes(followee)), "Cannot follow yourself");

        // Reference to the followees array of the follower
        string[] storage followees = userFollows[follower];
        
        // Check if already following
        for (uint i = 0; i < followees.length; i++) {
            if (keccak256(bytes(followees[i])) == keccak256(bytes(followee))) {
                // Unfollow logic: remove the followee
                followees[i] = followees[followees.length - 1]; // Move the last element to the current index
                followees.pop(); // Remove the last element
                emit UserFollowed(follower, followee); // Emit event for unfollow
                return;
            }
        }

        // Follow logic: add followee to the follower's list
        followees.push(followee);
        emit UserFollowed(follower, followee); // Emit event for follow
    }


    /// @notice Check if a user follows another
    /// @param follower The user's Hedera account ID who might be following
    /// @param followee The user's Hedera account ID who might be followed
    /// @return True if `follower` follows `followee`, false otherwise
    function doesUserFollow(string memory follower, string memory followee) public view returns (bool) {
        string[] storage followees = userFollows[follower];
        for (uint i = 0; i < followees.length; i++) {
            if (keccak256(bytes(followees[i])) == keccak256(bytes(followee))) {
                return true;
            }
        }
        return false;
    }

    /// @notice Get the list of users followed by a user
    /// @param user The user's Hedera account ID
    /// @return Array of user IDs that the user follows
    function getFollowedUsers(string memory user) public view returns (string[] memory) {
        return userFollows[user];
    }

    /// @notice Get the linked NFTs and buckets for a user
    /// @param user The user's Hedera account ID
    /// @return Array of UserNFTLink with all linked NFTs and their buckets
    function getLinkedNFTsAndBuckets(string memory user) public view returns (UserNFTLink[] memory) {
        return userLinks[user];
    }
}
