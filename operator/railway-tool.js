const fs = require('fs');
const path = require('path');
const os = require('os');

const PROJECT_ID = '7bb4befa-cbe4-4763-a782-43f1550857cd';
const ENVIRONMENT_ID = '14944148-a284-4f59-a2cc-0b7447138f84';

function getRailwayToken() {
  const cfgPath = path.join(os.homedir(), '.railway', 'config.json');
  if (!fs.existsSync(cfgPath)) {
    throw new Error(`Missing ${cfgPath} — please run railway login`);
  }
  const cfg = JSON.parse(fs.readFileSync(cfgPath, 'utf8'));
  return cfg.user?.token;
}

async function gql(query, variables = {}) {
  const token = getRailwayToken();
  const res = await fetch('https://backboard.railway.com/graphql/v2', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      'User-Agent': 'Railway-CLI/3.0.0'
    },
    body: JSON.stringify({ query, variables })
  });
  const data = await res.json();
  if (data.errors && data.errors.length > 0) {
    throw new Error(data.errors.map(e => e.message).join('; '));
  }
  return data.data;
}

async function getServices() {
  const data = await gql(`query GetProject($id: String!) {
    project(id: $id) {
      services {
        edges {
          node {
            id
            name
            deployments(first: 3) {
              edges {
                node {
                  id
                  status
                  createdAt
                  meta
                }
              }
            }
          }
        }
      }
    }
  }`, { id: PROJECT_ID });

  return data.project.services.edges.map(e => e.node);
}

async function status() {
  const services = await getServices();
  console.log('\nRailway Production Services Status:');
  console.log('='.repeat(95));
  console.log(
    'Service Name'.padEnd(28) + ' | ' +
    'Live Status'.padEnd(12) + ' | ' +
    'Live Commit'.padEnd(12) + ' | ' +
    'Latest Commit'.padEnd(14) + ' | ' +
    'Message'
  );
  console.log('-'.repeat(95));

  for (const s of services) {
    const live = s.deployments.edges.find(d => d.node.status === 'SUCCESS')?.node;
    const latest = s.deployments.edges[0]?.node;
    const name = s.name.padEnd(28);
    const liveStatus = (live ? 'SUCCESS' : (latest?.status || 'NO_DEPLOY')).padEnd(12);
    const liveCommit = (live?.meta?.commitHash?.slice(0, 7) || 'NONE').padEnd(12);
    const latestCommit = `${latest?.meta?.commitHash?.slice(0, 7) || 'NONE'} (${latest?.status || 'N/A'})`.padEnd(14);
    const msg = (latest?.meta?.commitMessage || '').slice(0, 24);

    console.log(`${name} | ${liveStatus} | ${liveCommit} | ${latestCommit} | ${msg}`);
  }
  console.log('='.repeat(95));
}

async function logs(serviceQuery, limit = 50) {
  const services = await getServices();
  const match = services.find(s => s.name.toLowerCase().includes(serviceQuery.toLowerCase()));
  if (!match) {
    console.error(`Service matching "${serviceQuery}" not found.`);
    return;
  }
  const latest = match.deployments.edges[0]?.node;
  if (!latest) {
    console.error(`No deployments found for ${match.name}`);
    return;
  }

  console.log(`\nLogs for ${match.name} (Deploy ${latest.id}, Status: ${latest.status}):`);
  console.log('-'.repeat(80));

  const data = await gql(`query GetLogs($depId: String!, $limit: Int!) {
    deploymentLogs(deploymentId: $depId, limit: $limit) {
      timestamp
      message
      severity
    }
    buildLogs(deploymentId: $depId, limit: $limit) {
      timestamp
      message
      severity
    }
  }`, { depId: latest.id, limit: parseInt(limit, 10) });

  if (data.buildLogs && data.buildLogs.length > 0) {
    console.log('--- BUILD LOGS ---');
    data.buildLogs.forEach(l => console.log(`[${l.severity || 'info'}] ${l.message}`));
  }

  if (data.deploymentLogs && data.deploymentLogs.length > 0) {
    console.log('--- RUNTIME LOGS ---');
    data.deploymentLogs.forEach(l => console.log(`[${l.timestamp}] ${l.message}`));
  }
}

async function redeploy(serviceQuery) {
  const services = await getServices();
  const match = services.find(s => s.name.toLowerCase().includes(serviceQuery.toLowerCase()));
  if (!match) {
    console.error(`Service matching "${serviceQuery}" not found.`);
    return;
  }

  const latest = match.deployments.edges[0]?.node;
  const live = match.deployments.edges.find(d => d.node.status === 'SUCCESS')?.node;
  const target = latest || live;

  if (!target) {
    console.error(`No deployment to redeploy for ${match.name}`);
    return;
  }

  console.log(`Triggering redeploy for ${match.name} (Deployment: ${target.id}, Status: ${target.status})...`);
  try {
    const res = await gql(`mutation Redeploy($id: String!) {
      deploymentRedeploy(id: $id) {
        id
        status
      }
    }`, { id: target.id });
    console.log(`✓ Redeploy initiated successfully. New status:`, res.deploymentRedeploy.status);
  } catch (err) {
    if (live && live.id !== target.id) {
      console.log(`Latest failed deployment is locked (${err.message}). Redeploying last SUCCESSFUL deployment ${live.id}...`);
      const res = await gql(`mutation Redeploy($id: String!) {
        deploymentRedeploy(id: $id) {
          id
          status
        }
      }`, { id: live.id });
      console.log(`✓ Redeploy of live deployment initiated. New status:`, res.deploymentRedeploy.status);
    } else {
      throw err;
    }
  }
}

async function heal() {
  const services = await getServices();
  const failed = services.filter(s => {
    const latest = s.deployments.edges[0]?.node;
    return latest && latest.status === 'FAILED';
  });

  if (failed.length === 0) {
    console.log('All services are currently healthy / have active successful deployments.');
    return;
  }

  console.log(`Found ${failed.length} failed latest deployments. Sequential healing starting...`);
  for (const s of failed) {
    const latest = s.deployments.edges[0]?.node;
    console.log(`Healing ${s.name} (${latest.id})...`);
    try {
      await gql(`mutation Redeploy($id: String!) {
        deploymentRedeploy(id: $id) {
          id
          status
        }
      }`, { id: latest.id });
      console.log(`✓ Redeploy triggered for ${s.name}`);
    } catch (err) {
      console.warn(`⚠️ Could not redeploy ${s.name}: ${err.message}`);
    }
    await new Promise(r => setTimeout(r, 4000));
  }
}

async function main() {
  const command = process.argv[2] || 'status';
  const arg1 = process.argv[3];
  const arg2 = process.argv[4];

  if (command === 'status') {
    await status();
  } else if (command === 'logs') {
    await logs(arg1 || 'UK Campaign', arg2 || 50);
  } else if (command === 'redeploy') {
    await redeploy(arg1 || 'UK Campaign');
  } else if (command === 'heal') {
    await heal();
  } else {
    console.log(`Usage:
  node operator/railway-tool.js status
  node operator/railway-tool.js logs "<service-name>" [limit]
  node operator/railway-tool.js redeploy "<service-name>"
  node operator/railway-tool.js heal
`);
  }
}

main().catch(err => {
  console.error('Railway Tool Error:', err.message);
  process.exit(1);
});
