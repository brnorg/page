import { Octokit } from "@octokit/rest";
import sodium from "libsodium-wrappers";


const token = process.argv[2]; // O token deve ser o primeiro argumento
const repo = process.argv[3]; // O repositório deve ser o segundo argumento
const environments = process.argv[4]; // O JSON dos ambientes deve ser o terceiro 
const [owner, repository] = repo.split('/');

const octokit = new Octokit({ auth: `${token}` });          

async function createOrUpdateSecretsAndVars() {
  for (const [environmentName, { secrets, vars }] of Object.entries(environments)) {
    // Verifica se o ambiente existe, se não, cria um novo
    try {
      await octokit.request('GET /repos/{owner}/{repo}/environments/{environment_name}', {
        owner: owner,
        repo: repository,
        environment_name: environmentName,
        headers: {
          'X-GitHub-Api-Version': '2022-11-28'
        }
      });
      console.log(`Environment '${environmentName}' already exists.`);
    } catch (error) {
      if (error.status === 404) {
        console.log("O ambiente não existe, criando um novo")
        await octokit.request('PUT /repos/{owner}/{repo}/environments/{environment_name}', {
          owner: owner,
          repo: repository,
          environment_name: environmentName,
          headers: {
            'X-GitHub-Api-Version': '2022-11-28'
          }
        });
        console.log(`Environment '${environmentName}' created.`);
      } else {
        console.error(`Error checking environment '${environmentName}':`, error);
      }
    }

    // Obter a chave pública para criptografar os segredos
    const { data: { key: publicKey, key_id: keyId } } = await octokit.request('GET /repos/{owner}/{repo}/environments/{environment_name}/secrets/public-key', {
      owner: owner,
      repo: repository,
      environment_name: environmentName,
      headers: {
        'X-GitHub-Api-Version': '2022-11-28'
      }
    });

    // Criação ou atualização de segredos
    for (const [secretName, secretValue] of Object.entries(secrets)) {
      await sodium.ready;
      const binkey = sodium.from_base64(publicKey, sodium.base64_variants.ORIGINAL);
      const binsec = sodium.from_string(secretValue);
      const encBytes = sodium.crypto_box_seal(binsec, binkey);
      const encryptedValue = sodium.to_base64(encBytes, sodium.base64_variants.ORIGINAL);

      await octokit.request('PUT /repos/{owner}/{repo}/environments/{environment_name}/secrets/{secret_name}', {
        owner: owner,
        repo: repository,
        environment_name: environmentName,
        secret_name: secretName,
        encrypted_value: encryptedValue,
        key_id: keyId,
        headers: {
          'X-GitHub-Api-Version': '2022-11-28'
        }
      });

      console.log(`Secret '${secretName}' created/updated in environment '${environmentName}'.`);
    }

    // Criação ou atualização de variáveis
    for (const [varName, varValue] of Object.entries(vars)) {
      try {
        await octokit.request('PATCH /repos/{owner}/{repo}/actions/variables/{name}', {
          owner: owner,
          repo: repository,
          name: varName,
          value: varValue,
          headers: {
            'X-GitHub-Api-Version': '2022-11-28'
          }
        });
        console.log(`Variable '${varName}' updated in environment '${environmentName}'.`);
      } catch (error) {
        if (error.status === 404) {
          // Se
          // Se a variável não existir, crie-a
          await octokit.request('POST /repos/{owner}/{repo}/actions/variables', {
            owner: owner,
            repo: repository,
            name: varName,
            value: varValue, // Usando varValue corretamente
            headers: {
              'X-GitHub-Api-Version': '2022-11-28'
            }
          });
          console.log(`Variable '${varName}' created in environment '${environmentName}'.`);
        } else {
          console.error(`Error updating/creating variable '${varName}':`, error);
        }
      }
    }
  }
}

createOrUpdateSecretsAndVars().catch(console.error);