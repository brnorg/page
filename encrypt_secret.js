const fs = require('fs');
const sodium = require('libsodium-wrappers');
const axios = require('axios');

async function encryptSecret(publicKey, secret) {
  await sodium.ready;
  const binkey = sodium.from_base64(publicKey, sodium.base64_variants.ORIGINAL);
  const binsec = sodium.from_string(secret);
  const encBytes = sodium.crypto_box_seal(binsec, binkey);
  return sodium.to_base64(encBytes, sodium.base64_variants.ORIGINAL);
}

async function main() {
  const token = process.argv[2];
  const repo = process.argv[3];
  const structureFile = process.argv[4];

  // Ler a estrutura do arquivo JSON
  const structure = JSON.parse(fs.readFileSync(structureFile, 'utf8'));

  for (const [envName, envData] of Object.entries(structure)) {
    console.log(`Processing environment: ${envName}`);
    
    // Criar ou atualizar ambiente
    await createOrUpdateEnvironment(envName, repo, token);
    
    // Processar segredos
    for (const [secretName, secretValue] of Object.entries(envData.secrets)) {
      const publicKeyResponse = await axios.get(`https://api.github.com/repos/${repo}/actions/secrets/public-key`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      
      const publicKey = publicKeyResponse.data.key;
      const encryptedSecret = await encryptSecret(publicKey, secretValue);
      
