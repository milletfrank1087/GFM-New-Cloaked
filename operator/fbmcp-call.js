// Drive the fbmcp MCP server over stdio JSON-RPC (fresh process => new policy loaded).
// Usage: node operator\fbmcp-call.js <toolName> <argsJsonPath>
const { spawn } = require('child_process');
const fs = require('fs');

const tool = process.argv[2];
const args = JSON.parse(fs.readFileSync(process.argv[3], 'utf8'));

const child = spawn('C:\\Users\\iakwv\\Downloads\\fb ads mcp\\.venv\\Scripts\\fbmcp.exe', [], {
  cwd: 'C:\\Users\\iakwv\\Downloads\\fb ads mcp',
  stdio: ['pipe', 'pipe', 'pipe'],
});

let buf = '';
const pending = new Map();

child.stdout.on('data', (d) => {
  buf += d.toString();
  let idx;
  while ((idx = buf.indexOf('\n')) >= 0) {
    const line = buf.slice(0, idx).trim();
    buf = buf.slice(idx + 1);
    if (!line) continue;
    let msg;
    try { msg = JSON.parse(line); } catch { continue; }
    if (msg.id && pending.has(msg.id)) {
      pending.get(msg.id)(msg);
      pending.delete(msg.id);
    }
  }
});

child.stderr.on('data', (d) => process.stderr.write('[' + d.toString().trim() + ']\n'));

function rpc(id, method, params) {
  return new Promise((resolve, reject) => {
    pending.set(id, resolve);
    child.stdin.write(JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n');
    setTimeout(() => { if (pending.has(id)) { pending.delete(id); reject(new Error('timeout on ' + method)); } }, 120000);
  });
}

(async () => {
  try {
    await rpc(1, 'initialize', {
      protocolVersion: '2024-11-05',
      capabilities: {},
      clientInfo: { name: 'caller', version: '1' },
    });
    child.stdin.write(JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }) + '\n');

    const res = await rpc(2, 'tools/call', { name: tool, arguments: args });
    console.log(JSON.stringify(res, null, 2));
  } catch (e) {
    console.error('ERROR: ' + e.message);
    process.exitCode = 1;
  } finally {
    child.stdin.end();
    setTimeout(() => child.kill(), 500);
  }
})();
