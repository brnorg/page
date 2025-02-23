import { Octokit } from "@octokit/rest";
import sodium from "libsodium-wrappers";
import fs from "fs";

const token = process.argv[2]; // Token de acesso do GitHub
const repo = process.argv[3]; // Nome do repositório
const structureFile = process.argv[4]; // Arquivo JSON com a estrutura

const octokit = new Octokit({
  auth: token
});

// Função para ler a estrutura do arquivo JSON
async function readStructureFile(filePath) {
  const data = await fs.promises.readFile(filePath, 'utf-8');
  return data;
}

async function listEnvironmentsAndDetails(structure) {
  await sodium.ready; // Aguarda o carregamento do sodium

  try {
    const environments = Object.keys(structure);

    for (const environmentName of environments) {
      console.log(`\nEnvironment: ${environmentName}`);

      // Criar ou atualizar o ambiente
      try {
        await octokit.request('PUT /repos/{owner}/{repo}/environments/{environment_name}', {
          owner: repo.split('/')[0],
          repo: repo.split('/')[1],
          environment_name: environmentName
        });
        console.log(`Environment ${environmentName} created/updated`);
      } catch (error) {
        console.error(`Erro ao criar/atualizar o ambiente ${environmentName}: ${error.message}`);
        continue;
      }

      // Processar segredos
      const secrets = structure[environmentName].secrets || {};
      for (const [secretName, secretValue] of Object.entries(secrets)) {
        // Obter a chave pública para criptografar segredos
        let publicKey, publicKeyId;
        try {
          const publicKeyResponse = await octokit.request('GET /repos/{owner}/{repo}/actions/secrets/public-key', {
            owner: repo.split('/')[0],
            repo: repo.split('/')[1]
          });
          publicKey = publicKeyResponse.data.key;
          publicKeyId = publicKeyResponse.data.key_id;
        } catch (error) {
          console.error(`Erro ao obter a chave pública: ${error.message}`);
          continue;
        }

        // Criptografar o valor do segredo
        const binkey = sodium.from_base64(publicKey, sodium.base64_variants.ORIGINAL);
        const binsec = sodium.from_string(secretValue);
        const encBytes = sodium.crypto_box_seal(binsec, binkey);
        const encryptedValue = sodium.to_base64(encBytes, sodium.base64_variants.ORIGINAL);

        // Atualizar segredo
        try {
          await octokit.request('PUT /repos/{owner}/{repo}/environments/{environment_name}/secrets/{secret_name}', {
            owner: repo.split('/')[0],
            repo: repo.split('/')[1],
            environment_name: environmentName,
            secret_name: secretName,
            encrypted_value: encryptedValue,
            key_id: publicKeyId
          });
          console.log(`Updated secret ${secretName} in environment ${environmentName}`);
        } catch (error) {
          console.error(`Erro ao atualizar o segredo ${secretName} no ambiente ${environmentName}: ${error.message}`);
        }
      }

      // Processar variáveis
      const variables = structure[environmentName].vars || {};
      for (const [varName, varValue] of Object.entries(variables)) {
        // Atualizar variável
        try {
          await octokit.request('PATCH /repos/{owner}/{repo}/environments/{environment_name}/variables/{name}', {
            owner: repo.split('/')[0],
            repo: repo.split('/')[1],
            environment_name: environmentName,
            name: varName,
            value: varValue
          });
          console.log(`Updated variable ${varName} in environment ${environmentName}`);
        } catch (error) {
          console.error(`Erro ao atualizar a variável ${varName} no ambiente ${environmentName}: ${error.message}`);
        }
      }
    }
  } catch (error) {
    console.error(`Erro: ${error.message}`);
  }
}

// Executar a função principal
(async () => {
  const structure = await readStructureFile(structureFile);
  await listEnvironmentsAndDetails(structure);
})();
