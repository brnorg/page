import { Octokit } from "@octokit/rest";
import sodium from "libsodium-wrappers";
import fs from "fs";

const token = process.argv[2]; // Token de acesso do GitHub
const repo = process.argv[3]; // Nome do repositório
const structureFile = process.argv[4]; // Arquivo JSON com a estrutura

const octokit = new Octokit({
  auth: token
});

const keysAndValues = [
  { name: "NAME", value: "value" }
  // Adicione mais pares de chave e valor conforme necessário
];

async function listEnvironmentsAndDetails() {
  await sodium.ready; // Aguarda o carregamento do sodium

  try {
    const environmentsResponse = await octokit.request('GET /repos/{owner}/{repo}/environments', {
      owner: repo.split('/')[0], // Dono do repositório
      repo: repo.split('/')[1] // Nome do repositório
    });

    const environments = environmentsResponse.data.environments;

    for (const environment of environments) {
      console.log(`\nEnvironment: ${environment.name}`);

      // Listar variáveis do ambiente atual
      let variables = [];
      try {
        const variablesResponse = await octokit.request('GET /repos/{owner}/{repo}/environments/{environment_name}/variables', {
          owner: repo.split('/')[0],
          repo: repo.split('/')[1],
          environment_name: environment.name
        });
        variables = variablesResponse.data.variables;
      } catch (error) {
        console.error(`Erro ao obter variáveis para o ambiente ${environment.name}: ${error.message}`);
      }

      // Listar segredos do ambiente atual
      let secrets = [];
      try {
        const secretsResponse = await octokit.request('GET /repos/{owner}/{repo}/environments/{environment_name}/secrets', {
          owner: repo.split('/')[0],
          repo: repo.split('/')[1],
          environment_name: environment.name
        });
        secrets = secretsResponse.data.secrets;
      } catch (error) {
        console.error(`Erro ao obter segredos para o ambiente ${environment.name}: ${error.message}`);
      }

      // Obter a chave pública para criptografar segredos
      let publicKey, publicKeyId;
      try {
        const publicKeyResponse = await octokit.request('GET /repos/{owner}/{repo}/environments/{environment_name}/secrets/public-key', {
          owner: repo.split('/')[0],
          repo: repo.split('/')[1],
          environment_name: environment.name
        });
        publicKey = publicKeyResponse.data.key;
        publicKeyId = publicKeyResponse.data.key_id;
      } catch (error) {
        console.error(`Erro ao obter a chave pública: ${error.message}`);
        continue;
      }

      for (const keyValuePair of keysAndValues) {
        const variable = variables.find(v => v.name === keyValuePair.name);
        const secret = secrets.find(s => s.name === keyValuePair.name);

        if (variable) {
          if (keyValuePair.value) {
            // Atualizar variável
