const { Client, PrivateKey, AccountCreateTransaction, Hbar } = require("@hashgraph/sdk");
const { UserModel } = require("../models/User");

async function createHederaAccount(user) {
  try {
    // Ensure user is a Mongoose document
    if (typeof user.save !== 'function' && user._id) {
      user = await UserModel.findById(user._id);
      if (!user) throw new Error('User not found for Hedera account creation');
    }
    const operatorId = process.env.HEDERA_OPERATOR_ID;
    const operatorKey = process.env.HEDERA_OPERATOR_KEY;
    if (!operatorId || !operatorKey) {
      console.error("Hedera operator credentials missing in .env");
      return user;
    }
    const client = Client.forMainnet().setOperator(operatorId, operatorKey);
    const newPrivateKey = PrivateKey.generateED25519();
    const newPublicKey = newPrivateKey.publicKey;
    const tx = await new AccountCreateTransaction()
      .setKey(newPublicKey)
      .setInitialBalance(new Hbar(1))
      .execute(client);
    const receipt = await tx.getReceipt(client);
    const newAccountId = receipt.accountId.toString();
    console.log("newAccountId", newAccountId);
    user.hedera = {
      accountId: newAccountId,
      publicKey: newPublicKey.toString(),
      privateKey: newPrivateKey.toString(),
    };
    await user.save();
    return user;
  } catch (err) {
    console.error("Failed to create Hedera account:", err);
    return user;
  }
}

module.exports = { createHederaAccount }; 