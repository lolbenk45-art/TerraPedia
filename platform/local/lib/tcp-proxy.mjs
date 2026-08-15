import net from 'node:net';

const listenHost = process.env.TP_PROXY_PUBLIC_HOST || '';
const listenPort = Number(process.env.TP_PROXY_PUBLIC_PORT || 0);
const targetHost = process.env.TP_PROXY_TARGET_HOST || '127.0.0.1';
const targetPort = Number(process.env.TP_PROXY_TARGET_PORT || 0);

if (!listenPort || !targetPort) {
  console.error('TP_PROXY_PUBLIC_PORT and TP_PROXY_TARGET_PORT are required');
  process.exit(2);
}

const server = net.createServer((client) => {
  const upstream = net.connect({ host: targetHost, port: targetPort });

  const closeBoth = () => {
    client.destroy();
    upstream.destroy();
  };

  client.on('error', closeBoth);
  upstream.on('error', closeBoth);
  client.pipe(upstream);
  upstream.pipe(client);
});

const bindHost = ['localhost', '127.0.0.1', '::1'].includes(listenHost) ? undefined : listenHost;
server.listen({ host: bindHost, port: listenPort }, () => {
  const address = bindHost || 'localhost';
  console.log(`tcp proxy listening on ${address}:${listenPort} -> ${targetHost}:${targetPort}`);
});
