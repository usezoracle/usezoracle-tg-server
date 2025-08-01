import express from 'express';
import cors from 'cors';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
const PORT = 3002;

// Enable CORS for all routes
app.use(cors());

// Serve the OpenAPI spec
app.get('/openapi.yaml', (req, res) => {
  res.sendFile(join(__dirname, 'openapi.yaml'));
});

// Serve static files from public directory
app.use(express.static('public'));

app.listen(PORT, () => {
  console.log(`API docs server running at http://localhost:${PORT}`);
  console.log(`OpenAPI spec available at http://localhost:${PORT}/openapi.yaml`);
});