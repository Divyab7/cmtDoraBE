const { Mnemonic } = require("@hashgraph/sdk");

async function getKeysFromMnemonic() {
    // Replace with your 24-word mnemonic
    const phrase = ""; 
    
    // Load mnemonic
    const mnemonic = await Mnemonic.fromString(phrase);

    // Create private key from mnemonic
    const privateKey = await mnemonic.toPrivateKey();

    console.log("Private Key:", privateKey.toString());
    console.log("Public Key:", privateKey.publicKey.toString());
}

module.exports = {
    getKeysFromMnemonic
}
