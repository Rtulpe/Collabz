# Collabz – Client

## 1. Introduction
This is the React client for the Collabz editor. It connects to the main server, automatically handles failover, and provides a modern collaborative editing UI.

## 2. Requirements
- Node.js (see `.nvmrc` for recommended version)
- npm
- Highly recommended: [nvm](https://github.com/nvm-sh/nvm)
- For production: Server like [serve](https://www.npmjs.com/package/serve) or any static file server.


## 3. How to Configure
1. Install dependencies:
   ```bash
   npm install
   ```
2. Configure `client/public/client_config.json` with the server IPs/ports.

## 4. How to Run
### Development Mode
Start the client in development mode:
```bash
npm start
```

You can access the client at `http://localhost:3000`, or at given IP in the console.

### Production Mode

To build the client for production:
```bash
npm run build
```
This will create a production-ready build in the `client/build` directory.

To serve the production build, you can use a static file server like `serve`:
```bash
npx serve -s build
```

You should be informed how to access the client in the console.
